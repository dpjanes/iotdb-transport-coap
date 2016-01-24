/*
 *  COAPTransport.js
 *
 *  David Janes
 *  IOTDB.org
 *  2016-01-23
 *
 *  Copyright [2013-2016] [David P. Janes]
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

"use strict";

var iotdb = require('iotdb');
var iotdb_transport = require('iotdb-transport');
var iotdb_links = require('iotdb-links');
var _ = iotdb._;

var coap = require('coap');

var path = require('path');
var events = require('events');
var util = require('util');
var url = require('url');

var logger = iotdb.logger({
    name: 'iotdb-transport-plugfest',
    module: 'COAPTransport',
});

var noop = function() {};

/* --- constructor --- */

/**
 *  Create a transport for CoAP.
 */
var COAPTransport = function (initd) {
    var self = this;

    self.initd = _.defaults(
        initd, {
            channel: iotdb_transport.channel,
            unchannel: iotdb_transport.unchannel,
        },
        iotdb.keystore().get("/transports/COAPTransport/initd"), {
            prefix: "/ts",
            server_host: null,
            server_port: 22001,
        }
    );

    self.root = self.initd.channel(self.initd);
    self.root_slash = self.root + "/";

    self._emitter = new events.EventEmitter();
    self.native = null;
    self.server_url = null;

    self._emitter.on("server-ready", function() {
        self._setup_server();
    });

    var ipv4;
    if (!_.is.Empty(self.initd.server_host)) {
        ipv4 = self.initd.server_host;
    } else {
        ipv4 = "0.0.0.0";
    }

    var server = coap.createServer();
    server.listen(self.initd.server_port, ipv4, function (error) {
        if (error) {
            console.log("ERROR", error);
            return;
        }

        self.server_url = "coap://" + ipv4 + ":" + self.initd.server_port;

        console.log("===============================");
        console.log("=== CoAP Server Up");
        console.log("=== ");
        console.log("=== Connect at:");
        console.log("=== " + self.server_url);
        console.log("===============================");

        self.native = server;
        self._emitter.emit("server-ready");
    });
};

COAPTransport.prototype = new iotdb_transport.Transport();
COAPTransport.prototype._class = "COAPTransport";

/* --- CoAP server -- */
COAPTransport.prototype._setup_server = function () {
    var self = this;

    self.native.on('request', function (req, res) {
        try {
            logger.info({
                method: "_setup_server/on('request')",
                request_url: req.url,
                request_method: req.method,
            }, "CoAP request");

            var _done = function(error, content) {
                if (error) {
                    res.code = 500;
                    content = { error: _.error.message(error) };
                }

                if (content) {
                    if (_.is.Dictionary(content)) {
                        content = JSON.stringify(content);
                        res.setOption("Content-Format", "application/json");
                    }

                    res.write(content);
                }

                res.end();
            }

            var user = iotdb.users.owner();  // TD: WRONG! needs to be the CoAP counterparty
            var is_observe = req.headers['Observe'] === 0;

            if (req.method === "GET") {
                if (req.url === "/.well-known/core") {
                    res.setOption("Content-Format", "application/link-format");
                    self._get_well_known(_done);
                } else if (req.url === self.root) {
                    self._get_things({
                        id: null,
                        band: null,
                        user: user,
                    }, _done);
                } else if (req.url.indexOf(self.root_slash) === 0) {
                    var parts = self.initd.unchannel(self.initd, req.url);
                    if (parts[1] === '.') {
                        self._get_thing_bands({
                            id: parts[0],
                            band: null,
                            user: user,
                        }, _done);
                    } else {
                        self._get_thing_band({
                            id: parts[0],
                            band: parts[1],
                            user: user,
                        }, _done);
                    }
                } else {
                    _done(new Error("not found", null));
                }
            } else if (req.method === "PUT") {
                if (req.url.indexOf(self.root_slash) === 0) {
                    var parts = self.initd.unchannel(self.initd, req.url);
                    if (parts[1] === '.') {
                        _done(new Error("bad PUT"), null);
                        return;
                    }

                    var buffers = [];
                    req.on('readable', function () {
                        while (true) {
                            var buffer = req.read();
                            if (!buffer) {
                                return;
                            }

                            buffers.push(buffer.toString('utf-8'));
                        }
                    });

                    req.on('end', function () {
                        var buffer = buffers.join("");
                        var value;
                        try {
                            value = JSON.parse(buffer);
                        } catch (x) {
                            _done(x, null);
                            return;
                        }

                        self._put_thing_band({
                            id: parts[0],
                            band: parts[1],
                            value: value,
                            user: user,
                        }, _done);
                    });
                } else {
                    _done(new Error("bad PUT"), null);
                }
            } else {
                _done(new Error("bad method"), null);
            }

        } catch (x) {
            logger.error({
                method: "_setup_server/on('request')",
                exception: _.error.message(x),
                stack: x.stack,
            }, "unexpected exception");
        }
    });

};

COAPTransport.prototype._get_well_known = function (done) {
    var self = this;

    var resultd = {};
    resultd["/.well-known/core"] = {};
    resultd[self.root] = {};

    iotdb_links.produce(resultd, done);
};

COAPTransport.prototype._get_things = function (paramd, done) {
    var self = this;
    var ids = [];

    self.list({
        user: paramd.user,
    }, function (ld) {
        if (ld.error) {
            done(ld.error);
            done = noop;
        } else if (ld.end) {
            var rd = {
                "@id": self.initd.channel(self.initd),
                "@context": "https://iotdb.org/pub/iot",
                "things": ids,
            };

            done(null, rd);
            done = noop;
        }

        ids.push("./" + ld.id);
    });
};

COAPTransport.prototype._get_thing_bands = function (paramd, done) {
    var self = this;
    var ids = [];

    self.about({
        id: paramd.id,
        user: paramd.user,
    }, function (ld) {
        if (ld.error) {
            done(ld.error);
            done = noop;
        } else {
            var rd = {
                "@id": self.initd.channel(self.initd, paramd.id),
                "@context": "https://iotdb.org/pub/iot",
            };

            var bands = _.ld.list(ld, "bands", []);
            bands.map(function(band) {
                rd[band] = "./" + band;
            });

            done(null, rd);
            done = noop;
        }
    });
};

COAPTransport.prototype._get_thing_band = function (paramd, done) {
    var self = this;
    var ids = [];

    self.get({
        id: paramd.id,
        band: paramd.band,
        user: paramd.user,
    }, function (ld) {
        if (ld.error) {
            done(ld.error);
            done = noop;
        } else {
            var rd = {
                "@id": self.initd.channel(self.initd, paramd.id, paramd.band),
                "@context": "https://iotdb.org/pub/iot",
            };

            rd = _.d.compose.shallow(rd, ld.value);

            done(null, rd);
            done = noop;
        }
    });
};

COAPTransport.prototype._put_thing_band = function (paramd, done) {
    var self = this;
    var ids = [];

    self.get({
        id: paramd.id,
        band: paramd.band,
        value: paramd.value,
        user: paramd.user,
    }, function (ld) {
        if (ld.error) {
            done(ld.error);
            done = noop;
            return;
        }

        _.timestamp.update(paramd.value);

        self._emitter.emit("updated", {
            id: paramd.id,
            band: paramd.band,
            value: paramd.value,
            user: paramd.user,
        });

        // kinda a BS result
        var rd = {
            "@id": self.initd.channel(self.initd, paramd.id, paramd.band),
            "@context": "https://iotdb.org/pub/iot",
        };

        done(null, rd);
        done = noop;
    });
};

/* --- methods --- */

/**
 *  See {iotdb_transport.Transport#Transport} for documentation.
 */
COAPTransport.prototype.list = function (paramd, callback) {
    var self = this;

    if (arguments.length === 1) {
        paramd = {};
        callback = arguments[0];
    }

    self._validate_list(paramd, callback);

    callback({
        end: true,
    });
};

/**
 *  See {iotdb_transport.Transport#Transport} for documentation.
 */
COAPTransport.prototype.added = function (paramd, callback) {
    var self = this;

    if (arguments.length === 1) {
        paramd = {};
        callback = arguments[0];
    }

    self._validate_added(paramd, callback);

    var channel = self.initd.channel(self.initd, paramd.id);
};

/**
 *  See {iotdb_transport.Transport#Transport} for documentation.
 */
COAPTransport.prototype.get = function (paramd, callback) {
    var self = this;

    self._validate_get(paramd, callback);

    var channel = self.initd.channel(self.initd, paramd.id, paramd.band);

    // callback(id, band, null); does not exist
    // OR
    // callback(id, band, undefined); don't know
    // OR
    // callback(id, band, d); data
};

/**
 *  See {iotdb_transport.Transport#Transport} for documentation.
 */
COAPTransport.prototype.update = function (paramd, callback) {
    var self = this;

    self._validate_update(paramd, callback);

    /*
    var channel = self.initd.channel(self.initd, paramd.id, paramd.band);
    var d = self.initd.pack(paramd.value, paramd.id, paramd.band);

    logger.error({
        method: "update",
        channel: channel,
        d: d,
    }, "NOT IMPLEMENTED");
    */

    callback({
        error: new Error("not implemented"),
    });
};

/**
 *  See {iotdb_transport.Transport#Transport} for documentation.
 */
COAPTransport.prototype.updated = function (paramd, callback) {
    var self = this;

    if (arguments.length === 1) {
        paramd = {};
        callback = arguments[0];
    }

    self._validate_updated(paramd, callback);

    self._emitter.on("updated", function (ud) {
        if (paramd.id && (ud.id !== paramd.id)) {
            return;
        }
        if (paramd.band && (ud.band !== paramd.band)) {
            return;
        }

        callback(ud, function(rud) {
            // really should do something here
        });
    });
};

/**
 *  See {iotdb_transport.Transport#Transport} for documentation.
 */
COAPTransport.prototype.remove = function (paramd, callback) {
    var self = this;

    self._validate_remove(paramd, callback);

    var channel = self.initd.channel(self.intid, paramd.id, paramd.band);
};

/* --- internals --- */

/**
 *  API
 */
exports.COAPTransport = COAPTransport;

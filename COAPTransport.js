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
var errors = iotdb_transport.errors;
var iotdb_links = require('iotdb-links');
var _ = iotdb._;

var coap = require('coap');

var path = require('path');
var events = require('events');
var util = require('util');
var url = require('url');
var querystring = require('querystring');

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

    self._id2alias = {};
    self._alias2id = {};
    self._acount = 0;

    self._emitter.on("server-ready", function() {
        self._setup_server();
    });

    var ipv4;
    if (!_.is.Empty(self.initd.server_host)) {
        ipv4 = self.initd.server_host;
    } else {
        ipv4 = _.net.ipv4();
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
        console.log("=========");
        console.log("==", req.url);
        console.log("=========");
        try {
            self._handle_request(req, res);
        } catch (x) {
            logger.error({
                method: "_setup_server/on('request')",
                exception: _.error.message(x),
                stack: x.stack,
            }, "unexpected exception");
        }
    });
};

COAPTransport.prototype._handle_request = function (req, res) {
    var self = this;
    var user = iotdb.users.owner();  // TD: WRONG! needs to be the CoAP counterparty
    var urlp = url.parse(req.url);
    var query = querystring.parse(urlp.query) || {};

    logger.info({
        method: "_setup_server/_handle_request",
        request_url: req.url,
        request_method: req.method,
    }, "CoAP request");

    var _done = function(error, content, no_end) {
        if (error) {
            console.log("HERE:XXX", error);
            res.code = _.error.code(error);
            content = { error: _.error.message(error) };
        }

        content = content || "";

        if (_.is.Dictionary(content)) {
            var cf = content["@cf"];
            if (cf) {
                delete content["@cf"];
            } else {
                cf = "application/json";
            }

            if (cf === "application/link-format") {
                res.setOption("Content-Format", cf);
                iotdb_links.produce(content, _done);
            } else {
                res.setOption("Content-Format", "application/json");
                _done(null, JSON.stringify(content) + "\n", no_end);
            }

            return
        }

        res.write(content);

        if (!no_end) {
            res.end();
        } 
    };

    var _handle_get_core = function() {
        self._get_core(_done);
    };

    var _handle_get_things = function() {
        self._get_things({
            id: null,
            band: null,
            user: user,
            next: query.next,
        }, _done);
    };

    var _handle_get_thing = function(id) {
        self._get_thing({
            id: id,
            band: null,
            user: user,
        }, _done);
    };

    var _handle_get_band = function(id, band) {
        self._get_band({
            id: id,
            band: band,
            user: user,
        }, _done);
    };

    var _handle_observe_band = function(id, band) {
        self._get_band({
            id: id,
            band: band,
            user: user,
        }, function(error, result) {
            if (error) {
                return _done(error, result);
            }

            _done(null, result, true);

            var _emitted = function(ud) {
                if (ud.id !== id) {
                    return;
                }
                if (ud.band !== band) {
                    return;
                }

                self._get_band({
                    id: id,
                    band: band,
                    user: user,
                }, function(error, result) {
                    if (error) {
                        return;
                    }

                    _done(null, result, true);
                });
            };

            self._emitter.on("has-update", _emitted);

            res.on("error", function() {
                self._emitter.removeListener("has-update", _emitted);
            });
        });
    };

    var _handle_get = function() {
        if (urlp.pathname === "/.well-known/core") {
            _handle_get_core();
        } else if (urlp.pathname === self.root) {
            _handle_get_things();
        } else if (urlp.pathname.indexOf(self.root_slash) === 0) {
            var parts = self.initd.unchannel(self.initd, urlp.pathname);
            if (parts[1] === '.') {
                _handle_get_thing(self.alias2id(parts[0]));
            } else {
                _handle_get_band(self.alias2id(parts[0]), parts[1]);
            }
        } else {
            _done(new errors.NotFound(), null);
        }
    };

    var _handle_observe = function() {
        if (urlp.pathname === "/.well-known/core") {
            _handle_get_core();
        } else if (urlp.pathname === self.root) {
            _handle_get_things();
        } else if (urlp.pathname.indexOf(self.root_slash) === 0) {
            var parts = self.initd.unchannel(self.initd, urlp.pathname);
            if (parts[1] === '.') {
                _handle_get_thing(self.alias2id(parts[0]));
            } else {
                _handle_observe_band(self.alias2id(parts[0]), parts[1]);
            }
        } else {
            _done(new errors.NotFound(), null);
        }
    };

    var _handle_put = function() {
        if (urlp.pathname.indexOf(self.root_slash) !== 0) {
            _done(new errors.MethodNotAllowed(), null);
            return;
        }

        var parts = self.initd.unchannel(self.initd, urlp.pathname);
        if (parts[1] === '.') {
            _done(new errors.MethodNotAllowed(), null);
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
                id: self.alias2id(parts[0]),
                band: parts[1],
                value: value,
                user: user,
            }, _done);
        });
    };

    if (req.method === "GET") {
        if (req.headers['Observe'] === 0) {
            _handle_observe();
        } else {
            _handle_get();
        }
    } else if (req.method === "PUT") {
        _handle_put();
    } else {
        _done(new errors.MethodNotAllowed(), null);
    }
};

/*
COAPTransport.prototype._subscribe_updates = function (done) {
    var self = this;

    if (self._subscribe_updates_done) {
        return;
    }
    self._subscribe_updates_done = true;

    console.log("SUBSCRIBING");
    self.updated(function(ud) {
        console.log("UPDATE", ud);
        self._emitter.emit("update", ud);
    });
};
*/

COAPTransport.prototype._get_core = function (done) {
    var self = this;

    var resultd = {};
    resultd["/.well-known/core"] = {};
    resultd[self.root] = {
        // "cf": 40, // "application/link-format",
        // "rel": "section",
        // "type": "application/link-format",
    };
    resultd["@cf"] = "application/link-format";

    done(null, resultd);
};

COAPTransport.prototype._get_things = function (paramd, done) {
    var self = this;
    var ids = [];

    var next_seen = true;
    if (paramd.next) {
        next_seen = false;
    }

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

            var next = null;
            while (true && ids.length) {
                var content = JSON.stringify(rd);
                if (content.length < 800) {
                    break;
                }

                var px = Math.floor(ids.length / 2);
                next = ids[px];
                ids.splice(px);
            }

            if (next) {
                rd.next = next;
            }

            done(null, rd);
            done = noop;
        } else {
            var id = self.id2alias(ld.id);
            if (!next_seen && (id === paramd.next)) {
                next_seen = true;
            }
            if (next_seen) {
                ids.push("" + id);
            }
        }

    });
};

/**
 *  A work in progres
 */
COAPTransport.prototype._directory_things = function (paramd, done) {
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
                "@cf": "application/link-format"
            };
            ids.map(function(id) {
                rd["/ts/" + id] = {
                    "cf": 40,
                }
            });

            done(null, rd);
            done = noop;
        } else {
            ids.push("" + self.id2alias(ld.id));
        }

    });
};

COAPTransport.prototype._get_thing = function (paramd, done) {
    var self = this;
    var ids = [];

    self.bands({
        id: paramd.id,
        user: paramd.user,
    }, function (ld) {
        if (ld.error) {
            done(ld.error);
            done = noop;
        } else {
            var rd = {
                "@id": self.initd.channel(self.initd, self.id2alias(paramd.id)),
                "@context": "https://iotdb.org/pub/iot",
                "thing-id": paramd.id,
            };

            if (ld.bandd) {
                _.mapObject(ld.bandd, function(url, band) {
                    if (url) {
                        rd[band] = url;
                    } else {
                        rd[band] = "./" + band;
                    }
                });
            } else {
                var bands = _.ld.list(ld, "bands", []);
                bands.map(function(band) {
                    rd[band] = "./" + band;
                });
            }


            done(null, rd);
            done = noop;
        }
    });
};

COAPTransport.prototype._get_band = function (paramd, done) {
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
                /*
                 *  CoAP is really restrained
                "@id": self.initd.channel(self.initd, paramd.id, paramd.band),
                "@context": "https://iotdb.org/pub/iot",
                 */
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

        self._emitter.emit("request-updated", {
            id: paramd.id,
            band: paramd.band,
            value: paramd.value,
            user: paramd.user,
        });

        // kinda a BS result
        var rd = {
            "@id": self.initd.channel(self.initd, self.alias2id(paramd.id), paramd.band),
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

    callback({
        error: new errors.NotImplemented(),
    })
};

/**
 *  See {iotdb_transport.Transport#Transport} for documentation.
 */
COAPTransport.prototype.put = function (paramd, callback) {
    var self = this;

    self._validate_update(paramd, callback);

    paramd = _.shallowCopy(paramd);

    self._emitter.emit("has-update", paramd);
    callback(paramd);
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

    self._emitter.on("request-updated", function (ud) {
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

    callback({
        error: new errors.NotImplemented(),
    })
};

/* --- internals --- */
COAPTransport.prototype.id2alias = function (id) {
    var self = this;

    return id;

    /*
    var alias = self._id2alias[id];
    if (alias) {
        return alias;
    }

    alias = id;
    alias = alias.replace(/^.*:/, '');
    alias = _.id.to_camel_case(alias);
    alias = alias + (self._acount++);
    self._id2alias[id] = alias;
    self._alias2id[alias] = id;

    console.log("HERE:YYY", self.

    return alias;
    */
};

COAPTransport.prototype.alias2id = function (alias) {
    return alias;
    /*
    return this._alias2id[alias] || null;
     */
};


/**
 *  API
 */
exports.COAPTransport = COAPTransport;

/*
 *  transporter.js
 *
 *  David Janes
 *  IOTDB.org
 *  2016-08-10
 *
 *  A Redis Transporter
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

const iotdb = require('iotdb');
const _ = iotdb._;
const iotdb_transport = require('iotdb-transport');
const iotdb_links = require('iotdb-links');
const errors = require('iotdb-errors');

const assert = require('assert');
const querystring = require('querystring');

const url = require('url');

const logger = iotdb.logger({
    name: 'iotdb-transport-redis',
    module: 'transporter',
});

const make = (initd, _coap_client, _underlying) => {
    const self = iotdb_transport.make();

    assert.ok(_underlying);
    assert.ok(_coap_client);

    const _initd = _.d.compose.shallow(initd, {
            channel: iotdb_transport.channel,
            unchannel: iotdb_transport.unchannel,
        },
        iotdb.keystore().get("/transports/iotdb-transport-coap/initd"), {
            prefix: "/ts",
            server_host: null,
            server_port: 22001,
        }
    );

    const _root = _initd.channel(_initd, {});
    const _root_slash = _root + "/";

    const _id2alias = id => id;
    const _alias2id = id => id;

    // ...
    const _handle_request = function (req, res) {
        const user = null;
        const urlp = url.parse(req.url);
        const query = querystring.parse(urlp.query) || {};

        logger.info({
            method: "_handle_request",
            request_url: req.url,
            request_method: req.method,
        }, "CoAP request");

        const _done = function (error, content, no_end) {
            if (error) {
                res.code = _.error.code(error);
                content = {
                    error: _.error.message(error)
                };
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

                return;
            }

            res.write(content);

            if (!no_end) {
                res.end();
            }
        };

        const _handle_get_core = function () {
            _get_core(_done);
        };

        const _handle_get_things = function () {
            _get_things({
                id: null,
                band: null,
                user: user,
                next: query.next,
            }, _done);
        };

        const _handle_get_thing = function (id) {
            _get_thing({
                id: id,
                band: null,
                user: user,
            }, _done);
        };

        const _handle_get_band = function (id, band) {
            _get_band({
                id: id,
                band: band,
                user: user,
            }, _done);
        };

        const _handle_observe_band = function (id, band) {
            _get_band({
                id: id,
                band: band,
            }, (error, result) => {
                if (error) {
                    return _done(error, result);
                }

                _done(null, result, true);

                _underlying.updated({
                    id: id,
                    band: band,
                })
                    .subscribe(
                        ud => {
                            _get_band({
                                id: id,
                                band: band,
                            }, (error, result) => {
                                if (error) {
                                    return;
                                }

                                _done(null, result, true);
                            })
                        }
                    );
            });
        };

        const _handle_get = function () {
            if (urlp.pathname === "/.well-known/core") {
                _handle_get_core();
            } else if (urlp.pathname === _root) {
                _handle_get_things();
            } else if (urlp.pathname.indexOf(_root_slash) === 0) {
                const ud = _initd.unchannel(_initd, urlp.pathname);
                if (_.is.Empty(ud.band)) {
                    _handle_get_thing(_alias2id(ud.id));
                } else {
                    _handle_get_band(_alias2id(ud.id), ud.band);
                }
            } else {
                _done(new errors.NotFound(), null);
            }
        };

        const _handle_observe = function () {
            if (urlp.pathname === "/.well-known/core") {
                _handle_get_core();
            } else if (urlp.pathname === _root) {
                _handle_get_things();
            } else if (urlp.pathname.indexOf(_root_slash) === 0) {
                const ud = _initd.unchannel(_initd, urlp.pathname);
                if (_.is.Empty(ud.band)) {
                    _handle_get_thing(_alias2id(ud.id));
                } else {
                    _handle_observe_band(_alias2id(ud.id), ud.band);
                }
            } else {
                _done(new errors.NotFound(), null);
            }
        };

        const _handle_put = function () {
            if (urlp.pathname.indexOf(_root_slash) !== 0) {
                return _done(new errors.MethodNotAllowed(), null);
            }

            const ud = _initd.unchannel(_initd, urlp.pathname);
            if (_.is.Empty(ud)) {
                return _done(new errors.MethodNotAllowed(), null);
            }

            const buffers = [];
            req.on('readable', function () {
                while (true) {
                    const buffer = req.read();
                    if (!buffer) {
                        return;
                    }

                    buffers.push(buffer.toString('utf-8'));
                }
            });

            req.on('end', function () {
                let value;
                try {
                    value = JSON.parse(buffers.join(""));
                } catch (x) {
                    _done(x, null);
                    return;
                }

                _put_thing_band({
                    id: ud.id,
                    band: ud.band,
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

    const _get_core = function (done) {
        const resultd = {};
        resultd["/.well-known/core"] = {};
        resultd[_root] = {
            // "cf": 40, // "application/link-format",
            // "rel": "section",
            // "type": "application/link-format",
        };
        resultd["@cf"] = "application/link-format";

        done(null, resultd);
    };

    const _get_things = function (paramd, done) {
        const ids = [];

        let next_seen = true;
        if (paramd.next) {
            next_seen = false;
        }

        _underlying.list({})
            .subscribe(
                ld => {
                    const id = _initd.channel(_initd, { id: _id2alias(ld.id) });
                    if (!next_seen && (id === paramd.next)) {
                        next_seen = true;
                    }
                    if (next_seen) {
                        ids.push("" + id);
                    }
                },
                error => {
                    done(error);
                    _done = _.nooap;
                },
                () => {
                    const rd = {
                        "@id": _initd.channel(_initd, {}),
                        "@context": "https://iotdb.org/pub/iot",
                        "things": ids,
                    };

                    let next = null;
                    while (true && ids.length) {
                        const content = JSON.stringify(rd);
                        if (content.length < 800) {
                            break;
                        }

                        const px = Math.floor(ids.length / 2);
                        next = ids[px];
                        ids.splice(px);
                    }

                    if (next) {
                        rd.next = next;
                    }

                    done(null, rd);
                    done = _.noop;
                }
            );
    };

    /**
     *  A work in progres
     */
    const _directory_things = function (paramd, done) {
        var ids = [];

        self.list({
            user: paramd.user,
        }, function (error, ld) {
            if (error) {
                done(error);
                return;
            }

            if (ld) {
                ids.push("" + _id2alias(ld.id));
                return;
            }

            var rd = {
                "@cf": "application/link-format"
            };
            ids.map(function (id) {
                rd["/ts/" + id] = {
                    "cf": 40,
                };
            });

            done(null, rd);
        });
    };

    const _get_thing = function (paramd, done) {
        const rd = {
            "@id": _initd.channel(_initd, { id: _id2alias(paramd.id) }),
            "@context": "https://iotdb.org/pub/iot",
            "thing-id": paramd.id,
        };

        _underlying.bands({
            id: paramd.id,
            user: paramd.user,
        })
            .subscribe(
                bd => {
                    rd[bd.band] = "./" + bd.band;
                },
                error => {
                    done(error, null);
                    done = _.noop;
                },
                () => {
                    done(null, rd);
                });
    };

    const _get_band = function (paramd, done) {
        _underlying.get({
            id: paramd.id,
            band: paramd.band,
        })
            .subscribe(
                gd => {
                    // CoAP is really restrained - don't send JSON-LD stuff
                    done(null, gd.value);
                    done = _.noop;
                },
                error => {
                    console.trace()
                    done(error, null);
                    done = _.noop;
                },
                () => {
                    done(new errors.Internal("Should never get here"));
                }
            );
    };

    const _put_thing_band = function (paramd, done) {
        var ids = [];


        _underlying.put({
            id: paramd.id,
            band: paramd.band,
            value: paramd.value,
            user: paramd.user,
        })
            .subscribe(
                pd => {
                    done(null, pd.value || {});
                    done = noop;
                },
                error => {
                    done(error);
                    done = _.noop;
                },
                done => {
                    done(new errors.Internal("Should never get here"));
                });
    };

    const _setup_server = () => {
        _coap_client.on('request', function (req, res) {
            console.log("=========");
            console.log("==", req.url);
            console.log("=========");

            try {
                _handle_request(req, res);
            } catch (x) {
                logger.error({
                    method: "_setup_server/on('request')",
                    exception: _.error.message(x),
                    stack: x.stack,
                }, "unexpected exception");
            }
        });
    };

    _setup_server();

    return self;
};

/**
 *  API
 */
exports.make = make;


/*
 *  coap.js
 *
 *  David Janes
 *  IOTDB.org
 *  2016-01-23
 *
 *  HomeStar-related code
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
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either coap or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

"use strict";

var iotdb = require('iotdb');
var iotdb_transport = require('iotdb-transport');
var _ = iotdb.helpers;

var logger = iotdb.logger({
    name: 'iotdb-transport-coap',
    module: 'coap',
});

var COAPTransport = require('./COAPTransport').COAPTransport;

var _transport_coap = function (iotdb_transporter) {
    if (!iotdb.keystore().get("/enabled/homestar/COAPTransport", false)) {
        logger.error({
            method: "_transport_coap",
            cause: "do $ homestar set --boolean /enabled/homestar/COAPTransport true",
        }, "Transporter not enabled");
        return;
    }

    var owner = iotdb.users.owner();
    var coap_transporter = new COAPTransport({
        prefix: "/ts",
        key_things: "thing",
        server_host: null, // needs to be made soft
        server_port: 22001, // needs to be made soft
    });
    iotdb_transport.bind(iotdb_transporter, coap_transporter, {
        bands: ["istate", "ostate", "model", "meta", ],
        updated: ["ostate", "meta", ],
        user: owner,
    });
};

var on_ready = function (locals) {
    _transport_coap(locals.homestar.things.make_transporter());
};

/**
 *  API
 */
module.exports = {
    on_ready: on_ready,
};

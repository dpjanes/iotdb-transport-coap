/*
 *  connect.js
 *
 *  David Janes
 *  IOTDB.org
 *  2016-09-05
 *
 *  Make a MQTT server
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

const assert = require("assert");

const iotdb = require('iotdb');
const _ = iotdb._;

const iotdb_transport = require('iotdb-transport');
const errors = require('iotdb-errors');

const path = require('path');
const coap = require('coap');

const events = require('events');

const logger = iotdb.logger({
    name: 'iotdb-transport-coap',
    module: 'server',
});

const connect = (initd, done) => {
    initd = _.d.compose.shallow(initd,
        iotdb.keystore().get("/transports/iotdb-transport-coap/initd"), {
            server_host: null,
            server_port: 22001,
        }
    );

    let server_host;
    if (!_.is.Empty(initd.server_host)) {
        server_host = initd.server_host;
    } else {
        server_host = _.net.ipv4();
    }

    const emitter = new events.EventEmitter();
    const client = coap.createServer();
    client.listen(initd.server_port, server_host, error => {
        if (error) {
            self._server_error = error;
            done(error);
            done = _.noop;
            return;
        }

        client._server_url = "coap://" + server_host + ":" + initd.server_port;

        console.log("===============================");
        console.log("=== CoAP Server Up");
        console.log("=== ");
        console.log("=== Connect at:");
        console.log("=== " + client._server_url);
        console.log("===============================");

        emitter.emit("server-ready");
    });

    client.ensure = (done) => {
        if (client._server_error) {
            done(long_error);
        } else if (client._server_url) {
            done();
        } else {
            emitter.on("server-ready", () => client.ensure(done));
        }
    };

    return client;
};

/**
 *  API
 */
exports.connect = connect;

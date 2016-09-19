# iotdb-transport-coap
[IOTDB](https://github.com/dpjanes/node-iotdb) 
[Transporter](https://github.com/dpjanes/node-iotdb/blob/master/docs/transporters.md)
for
[CoAP](http://coap.technology/)

<img src="https://raw.githubusercontent.com/dpjanes/iotdb-homestar/master/docs/HomeStar.png" align="right" />

# About

This module will export everything to CoAP, allowing GET and PUT and OBSERVE operations.
Note that there is no authentication / user support at this time, so only
use within friendly environments.

There are code samples in GitHub.

* [Read more about Transporters](https://github.com/dpjanes/node-iotdb/blob/master/docs/transporters.md)

# Installation

Do:

    $ npm install iotdb-transport-coap

Then:

    const iotdb = require("iotdb");
    iotdb.use("homestar-wemo");

    const iotdb_transport_iotdb = require("iotdb-transport-iotdb");
    const iotdb_transport_coap = require("iotdb-transport-coap")

    const iotdb_transporter = iotdb_transport_iotdb.make({}, iotdb.connect("WeMoSocket"));

    const coap_client = iotdb_transport_coap.connect({});

    const coap_transporter = iotdb_transport_coap.make({}, coap_client, iotdb_transporter)

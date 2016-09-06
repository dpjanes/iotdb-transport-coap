# iotdb-transport-coap
[IOTDB](https://github.com/dpjanes/node-iotdb) 
[Transporter](https://github.com/dpjanes/node-iotdb/blob/master/docs/transporters.md)
for
[CoAP](http://coap.technology/)

<img src="https://raw.githubusercontent.com/dpjanes/iotdb-homestar/master/docs/HomeStar.png" align="right" />

# About

* [Read more about Transporters](https://github.com/dpjanes/node-iotdb/blob/master/docs/transporters.md)

# Installation

The most common way you'll use this is with Home☆Star.

    $ npm install iotdb-transport-coap

Then just `use()` it

    const iotdb = require("iotdb")
    iotdb.use("iotdb-transport-coap")

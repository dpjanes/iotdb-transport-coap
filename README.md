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

Then it has to be enabled

    $ homestar set --boolean /enabled/transports/COAPTransport true

Now when you run Home☆Star there'll be a CoAP server to
your Things runing on UDP:22000.

One important note: there is no security model right now
with CoAP. So yeah, testing locally only.

# iotdb-transport-prototype
IOTDB / Home☆Star Transport for COAP

<img src="https://raw.githubusercontent.com/dpjanes/iotdb-homestar/master/docs/HomeStar.png" align="right" />

This is an **advanced** topic. 
[Documentation](https://homestar.io/about/transporters).


# Installation

The most common way you'll use this is with Home☆Star.

    $ homestar install iotdb-transport-coap
    $ homestar install homestar-coap

Then it has to be enabled

    $ homestar set --boolean /transports/COAPTransport/enabled true

Now when you run Home☆Star there'll be a CoAP server to
your Things runing on UDP:22000.

One important note: there is no security model right now
with CoAP. So yeah, testing locally only.

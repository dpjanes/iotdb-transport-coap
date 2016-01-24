/*
 *  list.js
 *
 *  David Janes
 *  IOTDB.org
 *  2016-01-24
 *
 *  Demonstrate receiving
 *  Make sure to see README first
 */

var Transport = require('../COAPTransport').COAPTransport;

var transport = new Transport({
});
transport.list(function(ld) {
    if (!ld) {
        break;
    }

    console.log("+", ld.id);
});

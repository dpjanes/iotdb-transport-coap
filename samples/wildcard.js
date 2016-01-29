/*
 *  wildcard.js
 *
 *  David Janes
 *  IOTDB.org
 *  2016-01-24
 *
 *  Demonstrate receiving everything
 *  Make sure to see README first
 */

var Transport = require('../COAPTransport').COAPTransport;

var transport = new Transport({
});
transport.updated({}, function(ud) {
    if (ud.value === undefined) {
        transport.get(ud, function(gd) {
            console.log("+", gd.id, gd.band, gd.value);
        });
    } else {
        console.log("+", ud.id, ud.band, ud.value);
    }
});

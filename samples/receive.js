/*
 *  receive.js
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
transport.updated({
    id: "MyThingID", 
    band: "meta", 
}, function(ud) {
    if (ud.value === undefined) {
        transport.get(ud, function(error, gd) {
            if (error) {
                console.log("#", error);
                return;
            }
            console.log("+", gd.id, gd.band, gd.value);
        });
    } else {
        console.log("+", ud.id, ud.band, ud.value);
    }
});

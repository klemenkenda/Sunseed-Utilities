var schedule = require('node-schedule');
var Database = require('./inc/database.js');
var request = require("sync-request");
var request2 = require("request");

var env = process.env.NODE_ENV || 'development';

// initialize database
var db = new Database;
var scriptArgs = (process.argv[2] == null) ? "append" : process.argv[2];

if (scriptArgs == "append") {
    db.sync();
} else {
    db.init();
}


/* use a function for the exact format desired... */
function ISODateString(timestamp) {
    d = new Date(timestamp * 1000);
    function pad(n) { return n < 10 ? '0' + n : n }
    return d.getUTCFullYear() + '-'
         + pad(d.getUTCMonth() + 1) + '-'
         + pad(d.getUTCDate()) + 'T'
         + pad(d.getUTCHours()) + ':'
         + pad(d.getUTCMinutes()) + ':'
         + pad(d.getUTCSeconds()) + 'Z'
}

function push2QMiner(data) {
    var sensors = [
        { "name": "f1", "phenomenon": "f", "UoM": "nn" },
        { "name": "i1", "phenomenon": "i", "UoM": "nn" },
    ]
    var json = [];
    
    // node level
    var nodeId = data["node_id"];
    var nodeName = nodeId;
    var lat = 43;
    var lng = 42;

    // sensor level
    var measurements = [];

    for (var i in sensors) {
        var sensor = sensors[i];

        var fieldName = sensor["name"];
        var value = data[fieldName];
        var qminerTs = ISODateString(data["stamp"]);
        var typeId = sensor["phenomenon"];
        var typeName = typeId;
        var typePhenomenon = sensor["phenomenon"];
        var typeUoM = sensor["UoM"];

        var sensorName = nodeName + "-" + typeName;

        measurements.push({
            "sensorid": sensorName,
            "value": value,
            "timestamp": qminerTs,
            "type": {
                "id": typeId,
                "name": typeName,
                "phenomenon": typePhenomenon,
                "UoM": typeUoM
            }

        });
    };

    var node = [{ "node": 
        {
            "id": nodeId,
            "name": nodeName,
            "lat": lat,
            "lng": lng,
            "measurements": measurements
        }
    }];

    // var res = request("GET", "http://localhost:9201/data/add-measurement?data=" + JSON.stringify(node));
    //http.request("http://localhost:9201/data/add-measurement?data=" + JSON.stringify(node));
    request2("http://localhost:9201/data/add-measurement?data=" + JSON.stringify(node), function (error, response, body) {
        console.log("test");
        console.log(error);
    });
    
        

    // console.log(node[0]["node"]["measurements"]);
};


// parse until all the data is in
var zeroTS = db.zeroTS;
var lastTS = db.lastTS;

while (lastTS < (Date.now() / 1000)) {
    lastTS = parseInt(lastTS) + parseInt(db.interval);

    console.log("++ REQUEST: " + zeroTS + "-" + lastTS);

    var res = request("GET", "http://193.2.205.65:5000/ami_retrieve?start=" + zeroTS + "&end=" + lastTS + "&num=-1");
    data = JSON.parse(res.getBody())["query_result"];
    // console.log(data);
    for (var i = data.length - 1; i > 0; i--) {
        // push data synchronously to QMiner instance
        push2QMiner(data[i]);        
    }

    if (data.length > 0) {
        zeroTS = lastTS;
    }

    db.update(zeroTS, lastTS);

}

// after that - trigger reading every 15 minutes



var schedule = require('node-schedule');
var Database = require('./inc/database.js');
var request = require("sync-request");
var request2 = require("request");
var jsonfile = require("jsonfile");
var jsonQuery = require("json-query");

var env = process.env.NODE_ENV || 'development';

// initialize database
var db = new Database;
var scriptArgs = (process.argv[2] == null) ? "append" : process.argv[2];

if (scriptArgs == "append") {
    db.sync();
} else {
    db.init();
}

// read the nodes metadata
var nodes = jsonfile.readFileSync("nodes.json");

/* sync object */
function SyncHttpManager() {
    this.requests = 0;
    this.responses = 0;

    this.reqMade = function () {
        this.requests++;
    }

    this.resReceived = function() {
        this.responses++;
        console.log("Request received: " + this.responses + "/" + this.requests);
    }

    this.isInSync = function() {
        return this.requests == this.responses;
    }

    this.stats = function() {
        console.log("Requests/responses: " + this.requests + "/" + this.responses);
    }
}

var shm = new SyncHttpManager();

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

function push2QMiner(data, shm) {

    var sensors = [
        { "name": "f1", "phenomenon": "Frequency", "UoM": "Hz" },

        { "name": "i1", "phenomenon": "Current", "UoM": "A" },
        { "name": "i2", "phenomenon": "Current", "UoM": "A" },
        { "name": "i3", "phenomenon": "Current", "UoM": "A" },
        { "name": "i4", "phenomenon": "Current", "UoM": "A" },

        { "name": "pc1", "phenomenon": "Consumed real power", "UoM": "kW" },
        { "name": "pc2", "phenomenon": "Consumed real power", "UoM": "kW" },
        { "name": "pc3", "phenomenon": "Consumed real power", "UoM": "kW" },

        { "name": "pg1", "phenomenon": "Generated real power", "UoM": "kW" },
        { "name": "pg2", "phenomenon": "Generated real power", "UoM": "kW" },
        { "name": "pg3", "phenomenon": "Generated real power", "UoM": "kW" },

        { "name": "qc1", "phenomenon": "Consumed reactive power", "UoM": "kVAR" },
        { "name": "qc2", "phenomenon": "Consumed reactive power", "UoM": "kVAR" },
        { "name": "qc3", "phenomenon": "Consumed reactive power", "UoM": "kVAR" },

        { "name": "qg1", "phenomenon": "Generated reactive power", "UoM": "kVAR" },
        { "name": "qg2", "phenomenon": "Generated reactive power", "UoM": "kVAR" },
        { "name": "qg3", "phenomenon": "Generated reactive power", "UoM": "kVAR" },

        { "name": "v1", "phenomenon": "Voltage", "UoM": "V" },
        { "name": "v2", "phenomenon": "Voltage", "UoM": "V" },
        { "name": "v3", "phenomenon": "Voltage", "UoM": "V" },

        // { "name": "vv1", "phenomenon": "voltage violation alarm", "uom": "" },
        // { "name": "vv2", "phenomenon": "voltage violation alarm", "uom": "" },
        // { "name": "vv3", "phenomenon": "voltage violation alarm", "uom": "" }                  

    ]
    var json = [];
    
    // node level
    var nodeId = data["node_id"];
    var nodeName = nodeId;
    
    // match nodename   
    result = jsonQuery("[id=" + nodeId + "]", { data: nodes });
    
    var lat = 0;
    var lng = 0;

    if (result.value != null) {
        // bug in nodes file (from Y-X GK!)
        var lat = result.value.lng;
        var lng = result.value.lat;
    };

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

        var sensorName = nodeName + "-" + typeName + "-" + fieldName;

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

    // var res = request("GET", "http://localhost:9301/data/add-measurement?data=" + JSON.stringify(node));
    // http.request("http://localhost:9301/data/add-measurement?data=" + JSON.stringify(node));
    shm.reqMade();
    request2("http://localhost:9301/data/add-measurement?data=" + JSON.stringify(node), function (error, response, body) {
        shm.resReceived();        
        if (error) console.error(error.stack);
    });
    
        

    // console.log(node[0]["node"]["measurements"]);
};


function mergeSameNodes(data) {
    var merged = [];
    var pointer = {};
    
    var id;
    
    for (var i = data.length - 1; i > 0; i--) {
        var hash = data[i]["node_id"] + "-" + data[i]["stamp"];
        if (hash in pointer) {
            id = pointer[hash];   
            // update record with non zero properties            
            console.log("Merging: " + hash);
            
            for (var key in data[i]) {
                // console.log(key);
                if (data[i][key] != 0) {
                    merged[id][key] = data[i][key];
                } else {
                    // console.log("no need");
                }
            }
            
            // display
            // console.log(merged[id]);
            
        } else {
            id = merged.length;
            pointer[hash] = id;
            // put in whole record
            merged[id] = data[i];
        }
    }
    
    return merged;
}

// parse until all the data is in
var zeroTS = db.zeroTS;
var lastTS = db.lastTS;


// scheduler for 
// while (lastTS < (Date.now() / 1000)) {    
var j = schedule.scheduleJob('*/1 * * * * *', function () {
    
    if (shm.isInSync()) {
        try {
            lastTS = parseInt(lastTS) + parseInt(db.interval);
            console.log("++ REQUEST: " + zeroTS + "-" + lastTS);
            
            var res = request("GET", "http://193.2.205.65:55555/ami_retrieve?start=" + zeroTS + "&end=" + lastTS + "&num=-1");
            data = JSON.parse(res.getBody())["query_result"];
            
            // overcome bug in MongoDB loader from E6
            var merged = mergeSameNodes(data);
            
            for (var i = 0; i < merged.length; i++) {
                // push data synchronously to QMiner instance            
                push2QMiner(merged[i], shm);
            }
            
            if (data.length > 0) {
                zeroTS = lastTS;
            }
            
            db.update(zeroTS, lastTS);
        } catch (err) {
            // make lastTS back
            lastTS = parseInt(lastTS) - parseInt(db.interval);
            console.error(err.stack);
        }
    } else {
        console.log("Waiting for requests stack to finish.");
    }

});

// }

// after that - trigger reading every 15 minutes



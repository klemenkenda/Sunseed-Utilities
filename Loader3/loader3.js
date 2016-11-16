var request = require("sync-request");
var jsonfile = require("jsonfile");
var jsonQuery = require("json-query");
var request2 = require("request");
var schedule = require("node-schedule");

var env = process.env.NODE_ENV || 'development';

// read the nodes metadata
var nodes = jsonfile.readFileSync("nodes.json");

/* sync object */
function SyncHttpManager() {
    this.requests = 0;
    this.responses = 0;

    this.reqMade = function () {
        this.requests++;
        console.log("Request made.");
    }

    this.resReceived = function () {
        this.responses++;
        console.log("Request received: " + this.responses + "/" + this.requests);
    }

    this.isInSync = function () {
        return this.requests == this.responses;
    }

    this.stats = function () {
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

function push2QMiner(dataArray, shm) {
    var recordsPerRequest = 25;

    var sensors = [
        { "name": "f1", "phenomenon": "Frequency", "UoM": "Hz" },

        { "name": "i1", "phenomenon": "Current", "UoM": "A" },
        { "name": "i2", "phenomenon": "Current", "UoM": "A" },
        { "name": "i3", "phenomenon": "Current", "UoM": "A" },
        { "name": "i4", "phenomenon": "Current", "UoM": "A" },

        { "name": "pc", "phenomenon": "Consumed real power", "UoM": "kW" },
        /*
        { "name": "pc2", "phenomenon": "Consumed real power", "UoM": "kW" },
        { "name": "pc3", "phenomenon": "Consumed real power", "UoM": "kW" },
        */

        { "name": "pg", "phenomenon": "Generated real power", "UoM": "kW" },
        /*
        { "name": "pg2", "phenomenon": "Generated real power", "UoM": "kW" },
        { "name": "pg3", "phenomenon": "Generated real power", "UoM": "kW" },
        */

        
        { "name": "qc", "phenomenon": "Consumed reactive power", "UoM": "kVAR" },
        /*
        { "name": "qc2", "phenomenon": "Consumed reactive power", "UoM": "kVAR" },
        { "name": "qc3", "phenomenon": "Consumed reactive power", "UoM": "kVAR" },
        */

        { "name": "qg", "phenomenon": "Generated reactive power", "UoM": "kVAR" },
        /*
        { "name": "qg2", "phenomenon": "Generated reactive power", "UoM": "kVAR" },
        { "name": "qg3", "phenomenon": "Generated reactive power", "UoM": "kVAR" },
        */
        { "name": "v1", "phenomenon": "Voltage", "UoM": "V" },
        { "name": "v2", "phenomenon": "Voltage", "UoM": "V" },
        { "name": "v3", "phenomenon": "Voltage", "UoM": "V" },

        // { "name": "vv1", "phenomenon": "voltage violation alarm", "uom": "" },
        // { "name": "vv2", "phenomenon": "voltage violation alarm", "uom": "" },
        // { "name": "vv3", "phenomenon": "voltage violation alarm", "uom": "" }                  

    ]
    var json = [];

    // node level
    var nodeId; 
    var nodeName; 

    

    // sensor level
    var measurements = [];

    // go through all records
    for (var j in dataArray) {
        var data = dataArray[j];

        // we do this for each record - not needed (!)
        nodeId = data["node_id"];
        nodeName = nodeId;

        // go through all possible sensors
        for (var i in sensors) {
            var sensor = sensors[i];

            var fieldName = sensor["name"];

            // does sensor exist in the record
            if (fieldName in data) {

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
        };

        // split requests into smaller chunks
        if ((j % recordsPerRequest == (recordsPerRequest - 1)) || (j == dataArray.length - 1)) {
            // match nodename   
            result = jsonQuery("[id=" + nodeId + "]", { data: nodes });

            var lat = 0;
            var lng = 0;

            if (result.value != null) {
                // bug in nodes file (from Y-X GK!)
                var lat = result.value.lng;
                var lng = result.value.lat;
            };

            var node = [{
                "node":
                    {
                        "id": nodeId,
                        "name": nodeName,
                        "lat": lat,
                        "lng": lng,
                        "measurements": measurements
                    }
            }];

            var res = request("GET", "http://localhost:9201/data/add-measurement?data=" + JSON.stringify(node));
            // http.request("http://localhost:9301/data/add-measurement?data=" + JSON.stringify(node));
            /*
            shm.reqMade();
            request2("http://localhost:9301/data/add-measurement?data=" + JSON.stringify(node), function (error, response, body) {
                shm.resReceived();
                if (error) console.error(error.stack);
            });
            */

            // reset variables
            measurements = [];
        }
    };

    



    // console.log(node[0]["node"]["measurements"]);
};

function processLast48h(batch) {
    // read the nodes
    // match nodename   
    var street = "KROMBERK-INDUSTRIJSKA CESTA";
    var token = "5e63ca1e-4a27-457f-8bb6-486705df41ff";

    var credentials = require('./credentials.js');

    // automtically get new dates
    var startDate = new Date();
    var endDate = new Date();
    startDate.setDate(startDate.getDate() - 2);    

    // create UNIX timestamp from ISO String
    if (batch == true) {        
        var startTS = "2016-04-01T00:00:00Z";
        var endTS = "2018-01-01T23:59:59Z";
        startDate = Date.parse(startTS);
        endDate = Date.parse(endTS);
    }
    
    console.log("START DATE: ", startDate, "END DATE: ", endDate);
    var startUTS = Math.round(startDate / 1000);
    var endUTS = Math.round(endDate / 1000);


    var n = 0;

    for (var i = 0; i < nodes.length; i++) {
        if (nodes[i].street == street) {
            n++;
            // skipping already loaded
            // if (n < 5) continue;

            // query the node
            var nodeName = nodes[i].node_id;
            var requestStr = 'https://api.sunseed-fp7.eu/smartmeter/measurements/interval?from=' + startUTS + '&to=' + endUTS + '&node_id=' + escape(nodeName);
            console.log("Request for: " + nodeName);

            var ok = false;
            var retry = 0;
            var dataArray = [];

            while ((ok == false) && (retry < 10)) {
                try {
                    var res = request('POST', requestStr, {
                        'headers': {
                            'Authorization': 'Bearer ' + token
                        }
                    });

                    // error message ?
                    dataArray = JSON.parse(res.body);                

                    if ((dataArray != []) && ("error" in dataArray) && ((dataArray.error == "unauthorized") || (dataArray.error == "invalid_token"))) {
                        console.log("GETTING NEW TOKEN!!!");
                        // wrong token - get new one
                        var tokenRequestStr = "https://api.sunseed-fp7.eu/uaa/oauth/token?grant_type=client_credentials";
                        var tokenRes = request('POST', tokenRequestStr, {
                            'auth': {
                                'user': credentials.username,
                                'pass': credentials.password,
                                'sendImmediately': false
                            },
                            'headers': {
                                'Authorization': 'Basic ' + credentials.base64all                            
                            }
                        });

                        tokenObj = JSON.parse(tokenRes.body);                    
                        token = tokenObj.access_token;
                        console.log("NEW TOKEN: " + token);
                        // create request string
                        requestStr = 'https://api.sunseed-fp7.eu/smartmeter/measurements/interval?from=' + startUTS + '&to=' + endUTS + '&node_id=' + escape(nodeName);
                        retry++;
                    } else {                    
                        console.log("ok:" + retry);
                        ok = true;
                        dataArray = JSON.parse(res.body);                    
                    }
                } catch (err) {
                    console.log("ERROR:" + err.message + ": " + retry);
                    retry++;
                }
            }
            console.log(i);
            push2QMiner(dataArray, shm);

        }
    }

    console.log(n); 
}


console.log("Waiting for the first job to start ...");

// running loading script once per day
// var j = schedule.scheduleJob("0 0 3 * * *", function() {
//    console.log("Starting scheduled loading job");
//    processLast48h(false);
// })

// batch mode from start of time
processLast48h(true);
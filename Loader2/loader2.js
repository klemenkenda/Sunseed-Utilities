var request = require("sync-request");
var jsonfile = require("jsonfile");
var jsonQuery = require("json-query");
var request2 = require("request");

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

            var res = request("GET", "http://localhost:9301/data/add-measurement?data=" + JSON.stringify(node));
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


// read the nodes
// match nodename   
var street = "KROMBERK-INDUSTRIJSKA CESTA";
var startTS = "2016-04-11T00:00:00Z";
var endTS = "2016-07-31T23:59:59Z";
var token = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzUxMiJ9.eyJpc3MiOiJodHRwczovL3Rlc3QtYWRtaW4uc3Vuc2VlZC1mcDcuZXU6ODAiLCJzdWIiOjIwLCJwcm8iOiJsb2NhbCIsIm9yaSI6ImFwaSIsImV4cCI6MTQ2ODM4MjYyNiwiaWF0IjoxNDY4Mzc5MDI2LCJqdGkiOiIwZjhiZTcxNC1iN2ZkLTQxYzktYWQ1MC1hZTNjZDIzMDBlOTAifQ.VexN06LseppE3mx65bbyAwpZMxfyb_6_8YW4N2HVoP6sAQez9Bh1bGcOG7Wz8IG9kLTb8oeEPQCuDJn2xCg00g";

var n = 0;

for (var i = 5; i < nodes.length; i++) {
    if (nodes[i].street == street) {
        n++;
        // query the node
        var nodeName = nodes[i].node_id;
        var requestStr = 'https://admin.sunseed-fp7.eu/api/smartmeterMeasurementsFromTo?access_token=' + token + '&time_from=' + startTS + '&time_to=' + endTS + '&node_id=' + escape(nodeName);
        console.log("Request for: " + nodeName);
        
        var ok = false;
        var retry = 0;
        var dataArray = [];

        while ((ok == false) && (retry < 10)) {
            try {
                var res = request('GET', requestStr, {
                    'headers': {
                        'Content-Type': 'application/json'
                    }
                });

                // error message ?
                dataArray = JSON.parse(res.body);
                if ((dataArray != []) && ("message" in dataArray) && (dataArray.message == "Unauthorized")) {
                    console.log("GETTING NEW TOKEN!!!")
                    // wrong token - get new one
                    var tokenRequestStr = "https://api.sunseed-fp7.eu/auth/obtain_accesstoken";
                    var tokenRes = request('POST', tokenRequestStr, {
                        'headers': {
                            'Content-Type': 'application/json'
                        },
                        'json': {
                            "provider": "local",
                            "providerId": "1",
                            "username": "ijs",
                            "secret": "ijs11052016",
                            "secret2": "1"
                        }
                    });

                    tokenObj = JSON.parse(tokenRes.body);
                    token = tokenObj.token;
                    console.log(token);
                    // create request string
                    requestStr = 'https://admin.sunseed-fp7.eu/api/smartmeterMeasurementsFromTo?access_token=' + token + '&time_from=' + startTS + '&time_to=' + endTS + '&node_id=' + escape(nodeName);
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
        
        push2QMiner(dataArray, shm);

    }
}

console.log(n);

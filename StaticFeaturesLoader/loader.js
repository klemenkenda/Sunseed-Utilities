var request = require("sync-request");
var fs = require('fs');

function push2QMiner(data, header) {
    
    var sensors = [
        { "name": "dayAfterHoliday", "phenomenon": "dayAfterHoliday", "UoM": "N/A" },
        { "name": "dayBeforeHoliday", "phenomenon": "dayBeforeHoliday", "UoM": "N/A" },
        { "name": "dayOfMonth", "phenomenon": "dayOfMonth", "UoM": "N/A" },
        { "name": "dayOfWeek", "phenomenon": "dayOfWeek", "UoM": "N/A" },
        { "name": "dayOfYear", "phenomenon": "dayOfYear", "UoM": "N/A" },
        { "name": "holiday", "phenomenon": "holiday", "UoM": "N/A" },
        { "name": "monthOfYear", "phenomenon": "monthOfYear", "UoM": "N/A" },
        { "name": "weekEnd", "phenomenon": "weekEnd", "UoM": "N/A" }
    ]
    var json = [];
    
    // node level
    var nodeId = "staticFeatures";
    var nodeName = nodeId;
        
    var lng = 14.509;
    var lat = 46.052;       
    
    // sensor level
    var measurements = [];
    
    for (var i in sensors) {
        var sensor = sensors[i];
        
        var fieldName = sensor["name"];
        var value = data[header[fieldName]];
        var qminerTs = data[header["timestamp"]].replace(/ /, 'T') + "Z";
        var typeId = sensor["phenomenon"];
        var typeName = typeId;
        var typePhenomenon = sensor["phenomenon"];
        var typeUoM = sensor["UoM"];
        
        var sensorName = fieldName;
        
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
    }    ;
    
    var node = [{
            "node": {
                "id": nodeId,
                "name": nodeName,
                "lat": lat,
                "lng": lng,
                "measurements": measurements
            }
        }];
    
    var res = request("GET", "http://localhost:9201/data/add-measurement?data=" + JSON.stringify(node));
    // http.request("http://localhost:9301/data/add-measurement?data=" + JSON.stringify(node));    
    //request("http://localhost:9301/data/add-measurement?data=" + JSON.stringify(node), function (error, response, body) {        
    //    if (error) console.error(error.stack);
    // });

    
    console.log(node[0]["node"]["measurements"]);
};


console.log("Starting push ...")

// read header
fs.readFile('staticFeatures.csv', function (err, data) {
    console.log("Reading static features ...")
    if (err) throw err;
    // for windows use .split("\r\n")
    var array = data.toString().split("\n");
    
    header = array[0];
    
    // make header
    headerArray = header.split(";");
    headerHash = {};
    for (i in headerArray) {
        headerHash[headerArray[i]] = i;
    };        
    
    for (i in array) {
        if (i != 0) {
            lineArray = array[i].split(";");            
            push2QMiner(lineArray, headerHash);
        }
    };
});


//for (var i = 0; i < merged.length; i++) {
//    // push data synchronously to QMiner instance            
//    push2QMiner(merged[i], shm);
//}
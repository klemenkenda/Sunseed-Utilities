var request = require("sync-request");
var striptags = require("striptags");
var fs = require("fs");
var jsonfile = require("jsonfile");

fs.readFile("GIS.csv", function (err, buffer) {
    var bufferString = buffer.toString();    

    var bufferStringSplit = bufferString.split('\r\n');

    gk2wgs(bufferStringSplit);
});

function gk2wgs(str) {
    //console.log(str);
    //bufferString = bufferString.replace(".", ",");
    var geopedia = "http://customers.geopedia.si/services/d48towgs84.php?code=v&precision=5";
    // x=411515.30&y=132761.61
    
    var json = [];

    // for (var i in str) {
    for (var i = 1; i < str.length; i++) {
        row = str[i];
        fields = row.split(";");
        if (fields[2] != "0") {
            // console.log(fields);
            gkX = parseFloat(fields[3].replace(",", "."));
            gkY = parseFloat(fields[4].replace(",", "."));
            
            var url = geopedia + "&x=" + gkX + "&y=" + gkY;
            var res = request("GET", url);
            
            var data = striptags(res.getBody().toString());
            var xy = data.split(",");
            
            var wgsX = parseFloat(xy[0]);
            var wgsY = parseFloat(xy[1]);
            
            var nodeName = fields[2];
            while (nodeName.length < 9) {
                nodeName = "0" + nodeName;
            }
            
            // split(",");
            console.log(nodeName + ": " + wgsX + "," + wgsY);

            var node = {
                "id": nodeName,
                "lng": wgsX,
                "lat": wgsY
            };

            json.push(node);
        }
    }

    jsonfile.writeFileSync("nodes.json", json);
}
 
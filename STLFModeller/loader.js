var mqtt = require('mqtt')
var fs = require('fs')
var dateFormat = require('dateformat')

var client  = mqtt.connect('mqtt://10.122.248.42')
 
client.on('connect', function () {
  client.subscribe('spm/167002045410006104bfa000a0000094')
})
 
client.on('message', function (topic, message) {
  // message is Buffer 
  var m = JSON.parse(message.toString());
  // console.log(m["week_n"], m["sec_id"], m["report_n"]);
  // create unixts
  var unixts = 10 * 365 * 24 * 60 * 60 * 1000 + (m["week_id"] + 1) * 7 * 24 * 60 * 60 * 1000 + m["sec_id"] * 1000 + m["report_n"] * 20;  
  // console.log(m);
  // console.log(unixts);
  var date = new Date(unixts);
  console.log(date, m["psp_v"]);

  var line = dateFormat(date, 'yyyy-mm-dd HH:MM:ss') + ";";
  line += m["v1"] + ";" + m["v2"] + ";" + m["v3"] + ";";
  line += m["psp_v"] + ";";
  line += m["th1"] + ";" + m["th2"] + ";" + m["th3"] + ";" + m["psp_th"] + ";";
  line += m["f1"] + ";" + m["f2"] + ";" + m["f3"] + ";" + m["f4"] + ";";  

  line += "\n";
  // console.log(m);

  fs.appendFile('./data.csv', line);

})

// setTimeout(function() {
//  console.log("Closing...");
// }, 20000);

var mqtt = require('mqtt')
var fs = require('fs')
var dateFormat = require('dateformat')

var client  = mqtt.connect('mqtt://10.122.248.42')
var deepstream = require('deepstream.io-client-js')
const dsclient = deepstream('localhost:6020').login()

 
client.on('connect', function () {
  client.subscribe('spm/167002045410006104bfa000a0000094')
})

var i = 0; 

client.on('message', function (topic, message) {
  // message is Buffer 
  var m = JSON.parse(message.toString());
  // create unixts
  var unixts = 10 * 365 * 24 * 60 * 60 * 1000 + (m["week_id"] + 1) * 7 * 24 * 60 * 60 * 1000 + m["sec_id"] * 1000 + m["report_n"] * 20;  
  var date = new Date(unixts);
  console.log(date, m["psp_v"]);

  var dateStr = dateFormat(date, 'yyyy-mm-dd HH:MM:ss');
  m["date"] = dateStr;
  i++;

  if ((i > 10) && (m["report_n"] % 25 == 0)) dsclient.event.emit("example", JSON.stringify(m));
  // console.log(m);


})

// setTimeout(function() {
//  console.log("Closing...");
// }, 20000);

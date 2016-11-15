var mqtt = require('mqtt')
var client  = mqtt.connect('http://10.122.248.42:1883')
// var client  = mqtt.connect('mqtt://test.mosquitto.org')

console.log("Connecting to Mosquitto ...")
client.on('connect', function () {
    console.log("Subscribing to load_forecasting channel.");
    client.subscribe('load_forecasting');
    console.log("Sending message ...");
    client.publish('load_forecasting', 'Hello mqtt');
})
 
client.on('message', function (topic, message) {
  // message is Buffer 
  console.log(message.toString())
  client.end()
})
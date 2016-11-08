var amqp = require('amqplib/callback_api');

// seveda dosegljivo samo z VPN oz. znotraj 
var host = "amqp://bpl-sunrabbit1.ts.telekom.si" 
var exchange = "lf_exchange"
var queue_name = "lf_save_queue"
var routing_key = "load_forecasting"

amqp.connect(host, function(err, conn) {
  if (err) throw (err);
    
  conn.createChannel(function(err, ch) {
    var msg = 'Hello World!';
    
    ch.assertExchange(exchange, 'direct', {durable: false});
    ch.publish(exchange, routing_key, new Buffer(msg));
    console.log(" [x] Sent %s: '%s'", routing_key, msg);
  });

  setTimeout(function() { conn.close(); process.exit(0) }, 500);
});
var amqp = require('amqplib/callback_api');

// seveda dosegljivo samo z VPN oz. znotraj 
var host = "amqp://10.122.248.36" // bpl-sunrabbit1.ts.telekom.si
var exchange = "lf_exchange"
var queue_name = "lf_save_queue"
var routing_key = "load_forecasting"

console.log("Connecting to host");

amqp.connect(host, function(err, conn) {
    if (err) throw (err);
    
    console.log("Creating channel!");
    conn.createChannel(function(err, ch) {
        var msg = 'Hello World!';
        console.log("Starting Exchange");
        ch.assertExchange(exchange, 'direct', {durable: false});
        console.log("Publishing");
        ch.publish(exchange, routing_key, new Buffer(msg));
        console.log(" [x] Sent %s: '%s'", routing_key, msg);
    });

    setTimeout(function() { 
        console.log("Closing");
        conn.close(); process.exit(0) 
    }, 500);
});
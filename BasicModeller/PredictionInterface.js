var mysql = require('mysql');
var credentials = require('./credentials.js');
var shm = require('./SyncHttpManager.js');
var syncRequest = require('sync-request');

function PredictionInterface(type) {
    console.log('Prediction interface - INIT');
    this.type = type;  
    this.data = [];    
    this.pool;
    
    if (this.type == "mysql") this.connectMySQL();
    if (this.type == "rabbitmq") this.connectRMQ();
}

PredictionInterface.prototype.connectMySQL = function() {
    this.pool = mysql.createPool({
        host: credentials.host,
        user: credentials.user,
        password: credentials.password,
        database: credentials.database
    });

    this.pool.getConnection(function (err, connection) {
        // connected! (unless `err` is set)
        if (err) console.log(err.message);
    });
}


PredictionInterface.prototype.connectRMQ = function() {
   amqp.connect(Credentials.RMQhost, function(err, conn) {
        if (err) throw (err);

        console.log("Creating RabbitMQ channel!");
        conn.createChannel(function(err, ch) {            
            console.log("Starting Exchange");
            ch.assertExchange(exchange, 'topic', {durable: true});
        });
    }); 
}


PredictionInterface.prototype.close = function() {
    if (this.type == "rabbitmq") this.closeRMQ();
}


PredictionInterface.prototype.closeRMQ = function() {
    console.log("Closing RabbitMQ connection.");
    conn.close();
}

// insert prediction
PredictionInterface.prototype.insertPrediction = function(name, method, time, value) {
    if (this.type == "mysql") this.insertPredictionMySQL(name, method, time, value);
    else if (this.type == "api") this.insertPredictionAPI(name, method, time, value);
    else uf (this.type == "rabbitmq") this.insertPredictionRMQ(name, method, time, value);
    else console.debug("Wrong type: " + this.type);
}

PredictionInterface.prototype.insertPredictionMySQL = function(name, method, time, value) {
    var sql = "INSERT INTO predictions (pr_sensor, pr_type, pr_timestamp, pr_value) VALUES ('" + name + "', '" + method + "', '" + time + "', " + value + ")";
    sql += " ON DUPLICATE KEY UPDATE pr_value = " + value;
    
    console.log(sql);
    this.pool.getConnection(function (err, connection) {
        if (err) console.log(err);
        shm.reqMade();
        connection.query(sql, function (err, rows) {
            if (err) console.log(err);
            connection.release();
            shm.resReceived();
        });
    });
}

PredictionInterface.prototype.insertPredictionAPI = function(name, method, time, value) {
    this.data.push({"name": name, "method": method, "time": time, "value": value});
}

// flush predictions
PredictionInterface.prototype.flushPredictions = function() {
    if (this.type == "mysql") console.debug("No flush needed for MySQL type.");
    else if (this.type == "api") this.flushPredictionsAPI();
    else if (this.type == "rabbitmq") this.flushPredictionsRMQ();
    else console.debug("Wrong type: " + this.type);
}

PredictionInterface.prototype.flushPredictionsAPI = function() {
    // send data to API (TODO)
    var data2Send = "data=" + JSON.stringify(this.data);
    console.log(data2Send);
    var res = syncRequest("POST", credentials.apiURL, {
        headers: {
           "Content-Type": "application/x-www-form-urlencoded"  
        },
        body: data2Send
    });
    console.log(res.getBody().toString());
    // upon successful submit - clear data
    this.data = [];
}

PredictionInterface.prototype.flushPredictionsRMQ = function() {
    // send data to API (TODO)
    var data2Send = "data=" + JSON.stringify(this.data);
    console.log(data2Send);
    var res = syncRequest("POST", credentials.apiURL, {
        headers: {
           "Content-Type": "application/x-www-form-urlencoded"  
        },
        body: data2Send
    });
    console.log(res.getBody().toString());
    // upon successful submit - clear data
    this.data = [];
}

module.exports = PredictionInterface;
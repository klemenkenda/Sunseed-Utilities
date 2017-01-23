var mysql = require('mysql');
var amqp = require('amqplib/callback_api');
var credentials = require('./credentials.js');
var shm = require('./SyncHttpManager.js');
var syncRequest = require('sync-request');

Date.createFromMysql = function (mysql_string) {
    var t, result = null;

    if (typeof mysql_string === 'string') {
        t = mysql_string.split(/[- T:]/);

        //when t[3], t[4] and t[5] are missing they defaults to zero
        result = new Date(t[0], t[1] - 1, t[2], t[3] || 0, t[4] || 0, t[5] || 0);
    }

    return result;
}

function PredictionInterface(type) {
    console.log('Prediction interface - INIT: ', type);
    this.type = type;  
    this.data = [];    
    this.pool;
    this.rmqconn;
    this.rmqch;    
    
    this.connect();
}

PredictionInterface.prototype.connect = function() {
    // there is no need to connect to HTTP API
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
    var pi = this;
    amqp.connect(credentials.RMQhost, function(err, conn) {
        if (err) throw (err);
        pi.rmqconn = conn;

        console.log("Creating RabbitMQ channel!");
        conn.createChannel(function(err, ch) {            
            console.log("Starting Exchange");
            ch.assertExchange(credentials.RMQexchange, 'topic', {durable: true});
            pi.rmqch = ch;
        });
    }); 
}


PredictionInterface.prototype.close = function() {
    if (this.type == "rabbitmq") this.closeRMQ();
}


PredictionInterface.prototype.closeRMQ = function() {
    console.log("Closing RabbitMQ connection.");
    try {
        // this.rmqconn.close();
    } catch(err) {
        console.log("Closing failed:" + err.message);
    };
}

// insert prediction
PredictionInterface.prototype.insertPrediction = function(name, method, time, value) {
    if (this.type == "mysql") this.insertPredictionMySQL(name, method, time, value);
    else if (this.type == "api") this.insertPredictionAPI(name, method, time, value);
    else if (this.type == "rabbitmq") this.insertPredictionRMQ(name, method, time, value);
    else if (this.type == "dummy") { /* do nothing */ }
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

PredictionInterface.prototype.insertPredictionRMQ = function(name, method, time, value) {
    // create JSON
    // node_id
    // p_c, p_g, q_c, q_g
    // stampm
    // stampf
    // model_id
    var sensor = name.split("-");
    var nodeid = sensor[0];
    var sensorType = sensor[2];
    var stampm = new Date();
    var stampf = new Date();
    stampf = Date.createFromMysql(time);
    
    
    
    // extract nodeid
    var rmqObj = {};
    rmqObj.node_id = nodeid;
    rmqObj[sensorType] = value;
    rmqObj.stampm = Math.round(stampm.getTime() / 1000);
    rmqObj.stampf = Math.round(stampf.getTime() / 1000);
    rmqObj.model_id = 1; // TODO
    
    var msg = JSON.stringify(rmqObj);
    
    this.rmqch.publish(credentials.RMQexchange, credentials.RMQrouting_key, new Buffer(msg));
    console.log(" [RMQ] Sent %s: '%s'", credentials.RMQrouting_key, msg);
    
}

// flush predictions
PredictionInterface.prototype.flushPredictions = function() {
    if (this.type == "mysql") console.debug("No flush needed for MySQL type.");
    else if (this.type == "api") this.flushPredictionsAPI();
    else if (this.type == "rabbitmq") this.flushPredictionsRMQ();
    else if (this.type == "dummy") { /* do nothing */ }
    else console.debug("Wrong type: " + this.type);
}

PredictionInterface.prototype.flushPredictionsAPI = function() {
    // send data to API (TODO)
    var data2Send = "data=" + JSON.stringify(this.data);
    // console.log(data2Send);
    var res = syncRequest("POST", credentials.apiURL, {
        headers: {
           "Content-Type": "application/x-www-form-urlencoded"  
        },
        body: data2Send
    });
    // console.log("Prediction API response:" +  res.getBody().toString());
    // upon successful submit - clear data
    this.data = [];
}

PredictionInterface.prototype.flushPredictionsRMQ = function() {
    // send data to RMQ
    // we do this online - nothing to do
    
    // upon successful submit - clear data
    this.data = [];
}

module.exports = PredictionInterface;

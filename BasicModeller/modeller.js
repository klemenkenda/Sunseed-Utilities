var schedule = require('node-schedule');
var mysql = require('mysql');
var syncRequest = require('sync-request');
var request = require('request');

var connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    passwrod: '',
    database: 'sunseed'
});


function twoDigits(d) {
    if (0 <= d && d < 10) return "0" + d.toString();
    if (-10 < d && d < 0) return "-0" + (-1 * d).toString();
    return d.toString();
}
Date.prototype.toMysqlFormat = function () {
    return this.getUTCFullYear() + "-" + twoDigits(1 + this.getUTCMonth()) + "-" + twoDigits(this.getUTCDate()) + " " + twoDigits(this.getUTCHours()) + ":" + twoDigits(this.getUTCMinutes()) + ":" + twoDigits(this.getUTCSeconds());
};

Date.prototype.toMysqlDateFormat = function () {
    return this.getUTCFullYear() + "-" + twoDigits(1 + this.getUTCMonth()) + "-" + twoDigits(this.getUTCDate());
};

Date.prototype.addHours = function (h) {
    this.setTime(this.getTime() + (h * 60 * 60 * 1000));
    return this;
}

// initial load
// http://atena.ijs.si/api/get-measurements?p=000137187-Consumed%20real%20power-pc1:2015-02-11:2016-03-20

function makePrediction(predictSensor) {    
    var tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    var dayAfterTomorrow = new Date();
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
    
    console.log(tomorrow.toMysqlDateFormat());
    
    console.log("Reading sensor data");
    var res = syncRequest('GET', 'http://atena.ijs.si/api/get-measurements?p=' + escape(predictSensor) + ':2015-10-01:' + tomorrow.toMysqlDateFormat());
    var sensorData = JSON.parse(res.getBody());
    
    console.log("Reading holiday");
    var res = syncRequest('GET', 'http://atena.ijs.si/api/get-measurements?p=holiday:2015-10-01:' + dayAfterTomorrow.toMysqlDateFormat());
    var holiday = JSON.parse(res.getBody());
    
    console.log("Resampling sensor data");
    var lastTs;
    var lastValue = 0;
    
    var sensor = [];
    
    for (var i in sensorData) {
        var ts = new Date(Date.parse(sensorData[i].Timestamp));
        if (lastTs === undefined) {
            lastTs = ts;
        }
        // next expected
        var nextTs = new Date(lastTs);
        nextTs.addHours(1);
        
        console.log("next: " + nextTs.toMysqlFormat() + "; this: " + ts.toMysqlFormat());
        
        if (nextTs.toMysqlFormat() == ts.toMysqlFormat()) {
            console.log("OK");
            lastTs = nextTs;
            lastValue = sensorData[i].Val;
            value = lastValue;
            sensor.push({
                Timestamp: nextTs,
                Val: value,
                Flag: 1
            })
        } else if (ts > nextTs) {
            while (ts > nextTs) {
                console.log("Error - missing: " + nextTs.toMysqlFormat());
                var copy = new Date;
                copy.setTime(nextTs.getTime());
                sensor.push({
                    Timestamp: copy,
                    Val: lastValue,
                    Flag: 0
                });
                nextTs.addHours(1);
            }
            nextTs.addHours(-1);
            lastTs = nextTs;
        } else {
        // just ignore
        }
        lastValue = sensorData[i].Val;
    }
    
    
    console.log("MA PREDICTIONS");
    // find index of 11. 4. 2016
    var start = new Date(2016, 3, 30, 0, 0, 0);
    var offset = Math.round ((start.getTime() - sensor[0].Timestamp.getTime()) / 1000 / 3600);
    var last = sensor[sensor.length - 1];
    var lastTime = new Date;
    lastTime.setTime(last.Timestamp.getTime() + 24 * 3600 * 1000);
    
    var currentTimestamp = new Date();
    console.log(offset);
    console.log(sensor.length);
    
    currentTimestamp.setTime(sensor[offset].Timestamp.getTime());
    
    while (currentTimestamp < lastTime) {
        currentTimestamp.addHours(1);
        // why Math.round - possible problem with missing values (!)
        var virtualOffset = (currentTimestamp.getTime() - sensor[0].Timestamp.getTime()) / 1000 / 3600;
        var prediction = calculateMA(virtualOffset, sensor, 5);
        console.log("Time: " + currentTimestamp.toMysqlFormat() + ", Prediction: " + prediction);
        insertPrediction(predictSensor, "ma", currentTimestamp.toMysqlFormat(), prediction);
    }
}

function insertPrediction(name, method, time, value) {
    var sql = "INSERT INTO predictions (pr_sensor, pr_type, pr_timestamp, pr_value) VALUES ('" + name + "', '" + method + "', '" + time + "', " + value + ")";
    sql += " ON DUPLICATE KEY UPDATE pr_value = " + value;
    
    console.log(sql);
    
    connection.query(sql, function (err, rows) {
        if (err) console.log(err);
    });    
}

function calculateMA(virtualOffset, sensor, N) {
    var sum = 0;
    var num = 0;
    var weekBack = 7 * 24;
    var offset = virtualOffset - weekBack;
        
    console.log("Offset: " + offset + ", Sensor size: " + sensor.length);
    for (var i = 0; i < N; i++) {

        while (sensor[offset].Flag == 10) {
            console.log("Flag: " + sensor[offset].Flag);
            offset -= weekBack;
        }

        sum += sensor[offset].Val;
    }

    var prediction = sum / N;

    return prediction;
}

var sensors = [
    "175339 Avtocenter ABC Kromberk 98441643-Consumed real power-pc",
    "8001722 Poslovni prostor Sirra Meblo Kro. 50831726-Consumed real power-pc",
    "129728 MGM Kromberk 85024272-Consumed real power-pc",
    "TP Meblo - Pikolud_30442750-Consumed real power-pc",
    "TP Meblo kotlarna TR2_30488597-Consumed real power-pc",
    "TP Meblo kotlarna TR2_30488610-Consumed real power-pc",
    "TP Meblo Jogi_30488589-Consumed real power-pc",
    "TP Meblo kotlarna TR2_30488614-Consumed real power-pc",
    "TP Meblo Jogi_30488641-Consumed real power-pc",
    "TP Meblo kotlarna TR2_30488617-Consumed real power-pc",
    "175632 SE Marchiol Meblo 50279962-Consumed real power-pc",
    "174185 SE Nova Gorica 99690099-Consumed real power-pc",
    "TP Meblo kotlarna TR1_30488600-Consumed real power-pc",
    "TP Meblo kotlarna TR2_30488611-Consumed real power-pc",
    "175579 SE Kovent Meblo 35747726-Consumed real power-pc",
    "TP Meblo kotlarna TR2_30488604-Consumed real power-pc",
    "TP Meblo_16137120-Consumed real power-pc",
    "TP Meblo Jogi_30488652-Consumed real power-pc",
    "174556 SE Alupla Meblo 35747740-Consumed real power-pc",
    "137187 Meblo JOGI 51237780-Consumed real power-pc"
]

for (var i in sensors) {
    console.log(sensors[i]);
    makePrediction(sensors[i]);
}
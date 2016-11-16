var schedule = require('node-schedule');
var mysql = require('mysql');
var syncRequest = require('sync-request');
var request = require('request');
var SyncHttpManager = require('./SyncHttpManager.js');
var PredictionInterface = require('./PredictionInterface.js');

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

function makePrediction(fromDataDate, startPredictionDate, predictSensor) {    
    var tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    var dayAfterTomorrow = new Date();
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
    
    var from = fromDataDate.toMysqlDateFormat();
    
    console.log(tomorrow.toMysqlDateFormat());
    
    console.log("Reading sensor data until " + tomorrow.toMysqlDateFormat());
    var res = syncRequest('GET', 'http://atena.ijs.si/api/get-measurements?p=' + escape(predictSensor) + ':' + from + ':' + tomorrow.toMysqlDateFormat());
    var sensorData = JSON.parse(res.getBody());
    
    console.log("Reading holiday");
    var res = syncRequest('GET', 'http://atena.ijs.si/api/get-measurements?p=holiday:2016-08-01:' + dayAfterTomorrow.toMysqlDateFormat());
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
        
        // console.log("next: " + nextTs.toMysqlFormat() + "; this: " + ts.toMysqlFormat());
        
        if (nextTs.toMysqlFormat() == ts.toMysqlFormat()) {
            // console.log("OK");
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
    // var start = new Date(2016, 9, 30, 0, 0, 0);
    var start = startPredictionDate;
    var offset = Math.round ((start.getTime() - sensor[0].Timestamp.getTime()) / 1000 / 3600);
    var last = sensor[sensor.length - 1];
    var lastTime = new Date;
    lastTime.setTime(last.Timestamp.getTime() + 24 * 3600 * 1000);
    
    var currentTimestamp = new Date();
    console.log(offset);
    console.log(sensor.length);
    
    if (offset <= sensor.length) {
        currentTimestamp.setTime(sensor[offset].Timestamp.getTime());

        while (currentTimestamp < lastTime) {
            currentTimestamp.addHours(1);
            // why Math.round - possible problem with missing values (!)
            var virtualOffset = (currentTimestamp.getTime() - sensor[0].Timestamp.getTime()) / 1000 / 3600;
            var prediction = calculateMA(virtualOffset, sensor, 5);
            console.log("Time: " + currentTimestamp.toMysqlFormat() + ", Prediction: " + prediction);
            piapi.insertPrediction(predictSensor, "ma", currentTimestamp.toMysqlFormat(), prediction);
            pirmq.insertPrediction(predictSensor, "ma", currentTimestamp.toMysqlFormat(), prediction);
        }

        piapi.flushPredictions();
        pirmq.flushPredictions();
    }
    
    piapi.close();
    pirmq.close();
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

var piapi = new PredictionInterface('api');
var pirmq = new PredictionInterface('rabbitmq');

var shm = new SyncHttpManager();

var sensors = [
    { name: "175339 Avtocenter ABC Kromberk 98441643-Consumed real power-pc", nodeid: "1" },
    { name: "8001722 Poslovni prostor Sirra Meblo Kro. 50831726-Consumed real power-pc", nodeid: "1" },
    { name: "129728 MGM Kromberk 85024272-Consumed real power-pc", nodeid: "1" },
    { name: "TP Meblo - Pikolud_30442750-Consumed real power-pc", nodeid: "1" },
    { name: "TP Meblo kotlarna TR2_30488597-Consumed real power-pc", nodeid: "" },
    { name: "TP Meblo kotlarna TR2_30488610-Consumed real power-pc", nodeid: "" },
    { name: "TP Meblo Jogi_30488589-Consumed real power-pc", nodeid: "" },
    { name: "TP Meblo kotlarna TR2_30488614-Consumed real power-pc", nodeid: "" },
    { name: "TP Meblo Jogi_30488641-Consumed real power-pc", nodeid: "" },
    { name: "TP Meblo kotlarna TR2_30488617-Consumed real power-pc", nodeid: "" },
    { name: "175632 SE Marchiol Meblo 50279962-Consumed real power-pc", nodeid: "" },
    { name: "174185 SE Nova Gorica 99690099-Consumed real power-pc", nodeid: "" },
    { name: "TP Meblo kotlarna TR1_30488600-Consumed real power-pc", nodeid: "" },
    { name: "TP Meblo kotlarna TR2_30488611-Consumed real power-pc", nodeid: "" },
    { name: "175579 SE Kovent Meblo 35747726-Consumed real power-pc", nodeid: "" },
    { name: "TP Meblo kotlarna TR2_30488604-Consumed real power-pc", nodeid: "" },
    { name: "TP Meblo_16137120-Consumed real power-pc", nodeid: "" },
    { name: "TP Meblo Jogi_30488652-Consumed real power-pc", nodeid: "" },
    { name: "174556 SE Alupla Meblo 35747740-Consumed real power-pc", nodeid: "" },
    { name: "137187 Meblo JOGI 51237780-Consumed real power-pc", nodeid: "" }
];

// var sensors = [
//    { name: "175339 Avtocenter ABC Kromberk 98441643-Consumed real power-pc", nodeid: "1" }
// ];

function startPrediction() {
    var i = 0;
    var N = sensors.length;

    var fromDataDate = new Date();
    fromDataDate.addHours(-60 * 24);
    var startPredictionDate = new Date();
    startPredictionDate.addHours(-2 * 24);

    var j = schedule.scheduleJob('*/5 * * * * *', function () {

        if (shm.isInSync()) {
            try {
                if (i < N) {
                    console.log(fromDataDate, startPredictionDate, sensors[i].name);
                    makePrediction(fromDataDate, startPredictionDate, sensors[i].name);
                    i++;
                } else {
                    console.log("Safe to terminate prediction cycle!");
                    j.cancel();
                }
            } catch (err) {
                if (err) console.log(err);
            }
        } else {
            console.log("Waiting for requests stack to finish.");
        }
    });
};


console.log("Waiting for the first prediction job to start ...");

var job = schedule.scheduleJob('0 0 4 * * *', function() {
    startPrediction();
});

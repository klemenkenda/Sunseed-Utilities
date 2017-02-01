// includes
var mqtt = require('mqtt')
var fs = require('fs')
var dateFormat = require('dateformat')
var qm = require('qminer');
var StreamEvaluation = require('./streamEvaluation.js');

// global deepstream.io client
var deepstream = require('deepstream.io-client-js')
const dsclient = deepstream('atena.ijs.si:6020').login()

// basic class for short term prediction modeller
function STLFModeller(node_id, bridge_resample, model, debug) {
  // constructor
  this.node_id = node_id;
  this.client = mqtt.connect('mqtt://10.122.248.42');
  this.bridge_resample = bridge_resample;
  this.debug = debug;
  
  // model specific
  this.unit = model.unit;
  this.model = model.type;
  this.frequency = model.frequency;
  this.horizon = model.horizon;
  this.prediction = [];
  this.trainV = [];
  this.evaluation = new StreamEvaluation(100);

  // record
  this.rawrecord;

  // calculate horizon in seconds
  this.horizonunit = this.horizon * this.unit / 50;
  // calculate horizon in steps
  this.horizonsteps = this.horizon / this.frequency;
  
  // create base for each model
  this.dbPath = "./db/" + this.node_id;
  // create directory if it does not exits
  if (!fs.existsSync(this.dbPath)){
      fs.mkdirSync(this.dbPath);
  }
  this.base = new qm.Base({ dbPath: this.dbPath, mode: 'createClean', schema: [
    {
      name: "Raw",
      fields: [
        { name: "Time", type: "datetime" },
        { name: "v1", type: "float" },
        { name: "v2", type: "float" },
        { name: "v3", type: "float" },
        { name: "psp_v", type: "float" },
        { name: "th1", type: "float" },
        { name: "th2", type: "float" },
        { name: "th3", type: "float" },          
        { name: "psp_th", type: "float" },
        { name: "f1", type: "float" },
        { name: "f2", type: "float" },
        { name: "f3", type: "float" },
        { name: "f4", type: "float" }
      ]
    }
  ]});

  var modeller = this;
  // counters
  this.msgcounter = -1;
  this.addcounter = -1;
  this.rawstore = this.base.store("Raw");

  // automated generation of aggregates
  var aggrDef = [
    { "field": "psp_v", 
      "tick": [ 
        { "type": "ema", "interval": 0.2 * 1000, "initWindow": 1 * 1000 },
        { "type": "winbuf", "winsize": 1000,
          "sub": [
            { "type": "variance" },
            { "type": "ma" }
          ]
        },
        { "type": "winbuf", "winsize": 5000,
          "sub": [
            { "type": "variance" },
            { "type": "ma" },
            { "type": "min" },
            { "type": "max" }
          ]
        }
      ] 
    }
  ]
  
  this.aggregate = [];
    
  // create aggregates from definition
  this.createAggregates = function(def) {
    for (var i in def) {
      var field = def[i];
      var fieldName = field["field"];
      var ticks = field["tick"];

      // create tick
      var aggregate = this.rawstore.addStreamAggr({
        "type": "timeSeriesTick",
        "timestamp": "Time",
        "value": fieldName
      });

      var tickName = fieldName+"|tick";
      this.aggregate[tickName] = aggregate;

      // handle tick sub aggregates
      for (var j in ticks) {
        var aggr = ticks[j];
        var type = aggr["type"];
        if (type == "ema") {
          var interval = aggr["interval"];
          var initWindow = aggr["initWindow"];
          var aggregate = this.rawstore.addStreamAggr({
            type: "ema",
            inAggr: this.aggregate[tickName],
            emaType: "previous",
            interval: interval,
            initWindow: initWindow
          });
          var emaName = fieldName + "|ema|" + interval;
          this.aggregate[emaName] = aggregate;
        } else if (type == "winbuf") {
          var winsize = aggr["winsize"];
          var aggregate = this.rawstore.addStreamAggr({
            type: "timeSeriesWinBufVector",
            inAggr: this.aggregate[tickName],
            winsize: winsize
          });
          var winBufName = fieldName + "|winbuf|" + winsize;
          this.aggregate[winBufName] = aggregate;
          // handle winbuf sub aggregates
          var sub = aggr["sub"];
          for (var k in sub) {
            var subaggr = sub[k];
            var subtype = subaggr["type"];
            if (subtype == "variance") {
              var aggregate = this.rawstore.addStreamAggr({
                type: 'variance',
                inAggr: this.aggregate[winBufName]
              });
              var varianceName = fieldName + "|variance|" + winsize;
              this.aggregate[varianceName] = aggregate;
            } else if (subtype = "ma") {
              // TODO
            } else if (subtype = "min") {
              // TODO
            } else if (subtype = "max") {
              // TODO
            }
          }
        }
      }
    }
  }  

  this.createAggregates(aggrDef);

  // create stream agregates
  // create tick and winbuff - base for all other aggregates
  this.tickPSPV = this.rawstore.addStreamAggr({
    type: "timeSeriesTick",
    timestamp: "Time",
    value: "psp_v"
  });

  this.tickF1 = this.rawstore.addStreamAggr({
    type: "timeSeriesTick",
    timestamp: "Time",
    value: "f1"
  });

  this.winbufPSPV1u = this.rawstore.addStreamAggr({
    type: "timeSeriesWinBufVector",
    inAggr: this.tickPSPV,
    winsize: 1 * 1000
  });


  this.winbuffPSPV15u = this.rawstore.addStreamAggr({
    type: "timeSeriesWinBufVector",
    inAggr: this.tickPSPV,
    winsize: 15 * 1000
  });

  this.winbuffPSPV60u = this.rawstore.addStreamAggr({
    type: "timeSeriesWinBufVector",
    inAggr: this.tickPSPV,
    winsize: 60 * 1000
  });

  this.winbuffPSPV600m = this.rawstore.addStreamAggr({
    type: "timeSeriesWinBufVector",
    inAggr: this.tickPSPV,
    winsize: 10 * 60 * 1000
  });

  this.emaPSPV1u = this.rawstore.addStreamAggr({
    type: "ema",
    inAggr: this.tickPSPV,
    emaType: "previous",
    interval: 0.2 * 1000,
    initWindow: 1 * 1000
  });

  this.emaF11u = this.rawstore.addStreamAggr({
    type: "ema",
    inAggr: this.tickF1,
    emaType: "previous",
    interval: 0.2 * 1000,
    initWindow: 1 * 1000
  });

  this.emaPSPV5u = this.rawstore.addStreamAggr({
    type: "ema",
    inAggr: this.tickPSPV,
    emaType: "previous",
    interval: 5 * 1000,
    initWindow: 5 * 1000
  });

  this.stdevPSPV1u = this.rawstore.addStreamAggr({
    type: 'variance',
    inAggr: this.winbufPSPV1u
  });

  // create stream predictor
  this.lr = new qm.analytics.RecLinReg( {"dim": 4, "forgetFact": 0.9999 });  

  // end of constructor


  

  // subscribing to MQTT data for a specific node (relevant for model)
  this.client.on('connect', function () {
    this.subscribe('spm/' + modeller.node_id);
  });
  
  // handle message from MQTT
  this.client.on('message', function (topic, message) {      
    var m = JSON.parse(message);
    modeller.processRecord(m);      
  });

  // process record of data received by MQTT (measurements for a particular node)
  this.processRecord = function (rec) {      
    this.msgcounter++;
    // send data to web client (deepstream.io), only send downsampled data
    if ((this.bridge_resample > 0) && (this.msgcounter % this.bridge_resample == 0)) {
      this.broadcast(rec);
      if (this.debug) console.log("Deepstream.IO send: " + this.node_id + ", " + this.msgcounter);
    }

    // virtually add to Raw store
    var unixts = 10 * 365 * 24 * 60 * 60 * 1000 + (rec["week_id"] + 1) * 7 * 24 * 60 * 60 * 1000 + rec["sec_id"] * 1000 + rec["report_n"] * 20;  
    var date = new Date(unixts);
    var isoTime = date.toISOString();
    this.rawRecord = this.rawstore.newRecord({
      Time: isoTime,
      v1: rec["v1"], v2: rec["v2"], v3: rec["v3"], psp_v: rec["psp_v"],
      th1: rec["th1"], th2: rec["th2"], th3: rec["th3"], psp_th: rec["psp_th"],
      f1: rec["f1"], f2: rec["f2"], f3: rec["f3"], f4: rec["f3"]
    });
    // trigger stream aggregates bound to Raw store
    if (this.msgcounter % this.unit == 0) {
      this.addcounter++;
      this.rawstore.triggerOnAddCallbacks(this.rawRecord);
      // this is basically the resampler
      if (this.addcounter % this.frequency == 0) this.predict();
    };
    // this.rawstore.push(rawRecord.toJSON());

    // if ((this.debug) && (this.msgcounter % 50 == 0)) console.log("Razlika: ", this.emaPSPV1u.getFloat() - this.tickPSPV.getFloat(), "Stdev(1s)", this.stdevPSPV1s.getFloat());
  }

  // make prediction
  this.predict = function() {
    if (this.debug) console.log("Predict triggered.");

    // send aggregate to web client (deepstream.io)
    this.broadcastAggregate(this.getAggregate());

    // make prediction with selected model
    var prediction = -99.9;
    if (this.model == "ma") {      
      prediction = this.predictMA();            
    } else if (this.model = "lr") {
      // TODO: handle creation of prediction vector better, including previous values of aggregates (use Resampled store or cyclic buffer)
      var predictionVec = new qm.la.Vector([ this.emaPSPV1u.getFloat(), this.stdevPSPV1u.getFloat(), this.emaPSPV5u.getFloat(), this.emaF11u.getFloat() ]);      
      prediction = this.predictLR(predictionVec);
      this.trainV.push(predictionVec);
    }

    // save prediction into buffer
    this.prediction.push(prediction);
    // evaluation
    // do we already have a enough prediction to make evaluation step
    if (this.prediction.length > this.horizonsteps) { 
      // get error measures (TODO: MSE (RMSE) only for now, implement R2)     
      this.evaluation.add(this.prediction[0].value, this.emaPSPV1u.getFloat());
      var errors = this.evaluation.get();
      if (this.debug) console.log(errors);
      prediction["mse"] = errors.mse;
      
      // learn phase
      if (this.model == "lr") {
        // delay for learn phase to avoid nonaccurate values of aggregate
        if (this.addcounter > 2000) {
          if (this.debug) console.log("Fitting LR", this.addcounter);
          var trainV = this.trainV[0];
          var target = this.emaPSPV1u.getFloat();
          this.lr.partialFit(trainV, target);
        } else {
          if (this.debug) console.log("Waiting for addcounter to fit LR.");
        }
      }
      
      // shift prediction and training vector array
      this.prediction.shift();
      this.trainV.shift();
    }

    // broadcast prediction to web interface (deepstream.io)
    this.broadcastPrediction(prediction);
  }

  // moving average predictor
  this.predictMA = function() {
    var prediction = this.emaPSPV5u.getFloat();
    var unixts = this.emaPSPV5u.getTimestamp();
    // add horizon to the timestamp
    unixts += this.unit * 20 * this.horizon;
    return { "unixts": unixts, "value": prediction };
  }

  // linear regression predictor
  this.predictLR = function(vec) {
    var unixts = this.emaPSPV5u.getTimestamp();
    unixts += this.unit * 20 * this.horizon;
    var prediction = this.lr.predict(vec);
    return { "unixts": unixts, "value": prediction };
  }

  // get current aggregate of target value to broadcast to web client
  this.getAggregate = function() {
    var aggregate = this.emaPSPV1u.getFloat();
    var unixts = this.emaPSPV1u.getTimestamp();
    return { "unixts": unixts, "value": aggregate };
  }

  // broadcast measurements to web client (deepstream.io)
  this.broadcast = function(rec) {
    dsclient.event.emit("spm/" + this.node_id, JSON.stringify(rec));
  }

  // broadcast predictinos to web client (deepstream.io)
  this.broadcastPrediction = function(prediction) {
    dsclient.event.emit("prediction/" + this.model + "/" + this.horizonunit + "/" + this.node_id, JSON.stringify(prediction));
  }

  // broadcast aggregates to web client (deepstream.io)
  this.broadcastAggregate = function(aggregate) {
    dsclient.event.emit("aggregate/" + this.model + "/" + this.horizonunit + "/" + this.node_id, JSON.stringify(aggregate));
  }
}

// var m1_11 = new STLFModeller("167002045410006104c2a000a00000e0", -1, { type: "ma", unit: 1, frequency: 50, horizon: 250 }, false);
var m1_12 = new STLFModeller("167002045410006104c2a000a00000e0", 50, { type: "lr", unit: 1, frequency: 50, horizon: 250 }, true);
/*
var m1_21 = new STLFModeller("167002045410006104c2a000a00000e0", -1, { type: "ma", unit: 50, frequency: 10, horizon: 60 }, false);
var m1_22 = new STLFModeller("167002045410006104c2a000a00000e0", -1, { type: "lr", unit: 50, frequency: 10, horizon: 60 }, false);

var m2 = new STLFModeller("167002045410006104a9a000a00000f6", 50, { type: "ma", unit: 1, frequency: 50, horizon: 250 }, false);
var m3 = new STLFModeller("167002045410006104c7a000a00000fb", 50, { type: "ma", unit: 1, frequency: 50, horizon: 250 }, false);
var m4 = new STLFModeller("167002045410006104bba000a0000088", 50, { type: "ma", unit: 1, frequency: 50, horizon: 250 }, false);
var m5 = new STLFModeller("167002045410006104c5a000a00000f5", 50, { type: "ma", unit: 1, frequency: 50, horizon: 250 }, false);
var m6 = new STLFModeller("167002045410006104bfa000a0000094", 50, { type: "ma", unit: 1, frequency: 50, horizon: 250 }, false);
var m7 = new STLFModeller("167002045410006104b3a000a00000b0", 50, { type: "ma", unit: 1, frequency: 50, horizon: 250 }, false);
var m8 = new STLFModeller("167002045410006104b4a000a00000a5", 50, { type: "ma", unit: 1, frequency: 50, horizon: 250 }, false);
var m9 = new STLFModeller("167002045410006104baa000a000008f", 50, { type: "ma", unit: 1, frequency: 50, horizon: 250 }, false);
var m10 = new STLFModeller("167002045410006104aaa000a00000ff", 50, { type: "ma", unit: 1, frequency: 50, horizon: 250 }, false);
var m11 = new STLFModeller("167002045410006104c0a000a00000ee", 50, { type: "ma", unit: 1, frequency: 50, horizon: 250 }, false);
var m12 = new STLFModeller("167002045410006104c1a000a00000e9", 50, { type: "ma", unit: 1, frequency: 50, horizon: 250 }, false);
var m13 = new STLFModeller("167002045410006104ada000a00000ea", 50, { type: "ma", unit: 1, frequency: 50, horizon: 250 }, false);
var m14 = new STLFModeller("167002045410006104afa000a00000e4", 50, { type: "ma", unit: 1, frequency: 50, horizon: 250 }, false);
var m15 = new STLFModeller("167002045410006104c8a000a00000d6", 50, { type: "ma", unit: 1, frequency: 50, horizon: 250 }, false);
var m16 = new STLFModeller("167002045410006104cea000a00000c4", 50, { type: "ma", unit: 1, frequency: 50, horizon: 250 }, false);
*/

/*
167002045410006104c2a000a00000e0
167002045410006104a9a000a00000f6
167002045410006104c7a000a00000fb
167002045410006104bba000a0000088
167002045410006104c5a000a00000f5
167002045410006104bfa000a0000094
167002045410006104b3a000a00000b0
167002045410006104b4a000a00000a5
167002045410006104baa000a000008f
167002045410006104aaa000a00000ff
167002045410006104c0a000a00000ee
167002045410006104c1a000a00000e9
167002045410006104ada000a00000ea
167002045410006104afa000a00000e4
167002045410006104c8a000a00000d6
167002045410006104cea000a00000c4
*/
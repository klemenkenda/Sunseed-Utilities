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
function STLFModeller(node_id, bridge_resample, model, aggrConf, debug) {
  // constructor
  this.node_id = node_id;
  this.client = mqtt.connect('mqtt://10.122.248.42');
  this.bridge_resample = bridge_resample;
  this.debug = debug;
  this.aggrConf = aggrConf;
  
  // model specific
  this.modelConf = model;
  this.unit = model.unit;
  this.model = model.type;
  this.frequency = model.frequency;
  this.horizon = model.horizon;
  this.bufferLength = model.bufferLength;
  this.prediction = [];
  this.trainV = [];
  this.evaluation = new StreamEvaluation(100);

  // record
  this.rawrecord;
  this.aggregateV = [];   // table of aggregate vectors

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
  
  this.aggregate = [];

  // end of constructor
    
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

      var tickName = fieldName + "|tick";
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
            } else if (subtype == "ma") {
              var aggregate = this.rawstore.addStreamAggr({
                type: 'ma',
                inAggr: this.aggregate[winBufName]
              });
              var maName = fieldName + "|ma|" + winsize;
              this.aggregate[maName] = aggregate;
            } else if (subtype == "min") {
              var aggregate = this.rawstore.addStreamAggr({
                type: 'winBufMin',
                inAggr: this.aggregate[winBufName]
              });
              var minName = fieldName + "|min|" + winsize;
              this.aggregate[minName] = aggregate;
            } else if (subtype == "max") {
              var aggregate = this.rawstore.addStreamAggr({
                type: 'winBufMax',
                inAggr: this.aggregate[winBufName]
              });
              var maxName = fieldName + "|max|" + winsize;
              this.aggregate[maxName] = aggregate;
            }
          }
        }
      }
    }
  }  
  
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
    // trigger stream aggregates bound to Raw store - first stage of resampling
    if (this.msgcounter % this.unit == 0) {
      this.addcounter++;
      this.rawstore.triggerOnAddCallbacks(this.rawRecord);
      // create and remember aggregates
      var aggregates = this.getAggregates();     
      this.aggregateV.push(aggregates);
      if (this.debug) console.log("Rows: " + this.aggregateV.length);
      if (this.aggregateV.length > this.bufferLength) this.aggregateV.shift();

      // this is basically the resampler
      if (this.addcounter % this.frequency == 0) this.predict();
    };
    // this.rawstore.push(rawRecord.toJSON());

    // if ((this.debug) && (this.msgcounter % 50 == 0)) console.log("Razlika: ", this.emaPSPV1u.getFloat() - this.tickPSPV.getFloat(), "Stdev(1s)", this.stdevPSPV1s.getFloat());
  }

  // make vector of all agregates
  this.getAggregates = function() {
    var aggrVector = {};
    for (key in this.aggregate) {
      if (!((key.indexOf("tick") > 0) || (key.indexOf("winbuf") > 0))) {        
        aggrVector[key] = this.aggregate[key].getFloat();
      };
    };
    return aggrVector;
  }

  // return attribute vector for a particular model
  this.getAttributes = function() {
    var vec = [];

    for (var i in this.modelConf.attributes) {
      var offset = (this.aggregateV.length - 1) + this.modelConf.attributes[i].time;      
      var attributes = this.modelConf.attributes[i].attributes;

      for (var j in attributes) {
        var type = attributes[j].type; // value, timeDiff
        var attrName = attributes[j].name;
        
        if (type == "value") {
          var value = this.aggregateV[offset][attrName];
          vec.push(value);
        } else if (type == "timeDiff") {
          var offset2 = offset - attributes[j].interval;
          var value = this.aggregateV[offset2][attrName] - this.aggregateV[offset][attrName];
          vec.push(value);
        }
      }
    }

    return vec;
  }

  // count number of attributes
  this.countAttributes = function() {
    var attrN = 0;

    for (var i in this.modelConf.attributes) {      
      var attributes = this.modelConf.attributes[i].attributes;

      for (var j in attributes) {
        var type = attributes[j].type; // value, timeDiff
                
        if (type == "value") {
          attrN++;
        } else if (type == "timeDiff") {
          attrN++;
        }
      }
    }

    return attrN;
  }
  
  // make prediction
  this.predict = function() {
    if (this.debug) console.log("Predict triggered.");

    // send aggregate to web client (deepstream.io)
    this.broadcastAggregate(this.getAggregate());

    // make prediction with selected model
    var prediction = { "unixts": 0, "value": 0.0 };
    if (this.model == "ma") {      
      prediction = this.predictMA();            
    } else if (this.model = "lr") {
      // creation of prediction vector
      if (this.aggregateV.length == this.bufferLength) {
        var attributeVec = this.getAttributes();   
        if (this.debug) console.log(attributeVec);
        var predictionVec = new qm.la.Vector(attributeVec);      
        prediction = this.predictLR(predictionVec);
        if (this.debug) console.log("Finished prediction.");
        this.trainV.push(predictionVec);
      }      
    }

    // save prediction into buffer
    this.prediction.push(prediction);
    // evaluation
    // do we already have a enough prediction to make evaluation step
    if (this.prediction.length > this.horizonsteps) { 
      // get error measures (TODO: MSE (RMSE) only for now, implement R2)   
      if (this.debug) console.log("Prediction:", this.prediction, this.horizonsteps);
      if (this.debug) console.log("Value:", this.aggregate[this.modelConf.target].getFloat())
      this.evaluation.add(this.prediction[0].value, this.aggregate[this.modelConf.target].getFloat());
      var errors = this.evaluation.get();
      if (this.debug) console.log(errors);
      prediction["mse"] = errors.mse;
      
      // learn phase
      if (this.model == "lr") {
        // delay for learn phase to avoid nonaccurate values of aggregate
        if (this.aggregateV.length == this.bufferLength) {
          if (this.debug) console.log("Fitting LR", this.addcounter);
          var trainV = this.trainV[0];
          var target = this.aggregate[this.modelConf.target].getFloat();
          this.lr.partialFit(trainV, target);
          // save the model
          this.save();
        } else {
          if (this.debug) console.log("Waiting for buffer (for calculating historic features) to get filled (" + this.aggregateV.length + "/" + this.bufferLength + ").");
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
    // var prediction = this.emaPSPV5u.getFloat();
    // var unixts = this.emaPSPV5u.getTimestamp();
    var prediction = this.aggregate[this.modelConf.source].getFloat();
    var unixts = this.aggregate[this.modelConf.source].getTimestamp();
    // add horizon to the timestamp
    unixts += this.unit * 20 * this.horizon;
    return { "unixts": unixts, "value": prediction };
  }

  // linear regression predictor
  this.predictLR = function(vec) {
    var unixts = this.aggregate[this.modelConf.target].getTimestamp();
    unixts += this.unit * 20 * this.horizon;
    var prediction = this.lr.predict(vec);
    return { "unixts": unixts, "value": prediction };
  }

  // get current aggregate of target value to broadcast to web client
  this.getAggregate = function() {
    var aggregate = this.aggregate[this.modelConf.target].getFloat();
    var unixts = this.aggregate[this.modelConf.target].getTimestamp();
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

  // save model
  this.save = function() {
    var filePath = "./models/" + this.node_id + ".bin";
    var thisWeights = "./models/weights-" + this.node_id + ".txt";
    if (this.model == "lr") {
      // create an output stream object and save the model
      var fout = qm.fs.openWrite(filePath);
      this.lr.save(fout);
      fout.close();

      // TODO: weights      
    }
  }

  // load model
  this.load = function() {
    var filePath = "./models/" + this.node_id + ".bin";

    if (fs.existsSync(filePath)){
      var fin = qm.fs.openRead(filePath);
      this.lr = new qm.analytics.RecLinReg(fin);  
      return true;
    }

    return false;    
  }

  // part of constructor

  this.createAggregates(this.aggrConf);
  
  // get model dimensions
  this.modelDim = this.countAttributes();

  // create stream predictor  
  if (this.model == "lr") {
    // try to load, otherwise create new
    if (!this.load()) this.lr = new qm.analytics.RecLinReg( {"dim": this.modelDim, "forgetFact": this.modelConf.forgetFact });  
  }
}


// --------------------------------------------------------------------------
// 5s horizon definitions
// aggregate definition
// --------------------------------------------------------------------------

var aggrDefLR5s = [
  { "field": "psp_v", 
    "tick": [ 
      { "type": "ema", "interval": 0.2 * 1000, "initWindow": 1 * 1000 },
      { "type": "ema", "interval": 5 * 1000, "initWindow": 5 * 1000 },
      { "type": "ema", "interval": 60 * 1000, "initWindow": 60 * 1000 },
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
  },
  { "field": "f1", 
    "tick": [ 
      { "type": "ema", "interval": 0.2 * 1000, "initWindow": 1 * 1000 },
      { "type": "ema", "interval": 5 * 1000, "initWindow": 5 * 1000 },
      { "type": "winbuf", "winsize": 5000,
        "sub": [
          { "type": "variance" },
        ]
      }
    ]
  }
];

var aggrDefMA5s = [
  { "field": "psp_v", 
    "tick": [       
      { "type": "ema", "interval": 5 * 1000, "initWindow": 5 * 1000 },
      { "type": "winbuf", "winsize": 1000,
        "sub": [          
          { "type": "ma" }
        ]
      },
      { "type": "winbuf", "winsize": 5000,
        "sub": [
          { "type": "ma" },
        ]
      }
    ]
  }
];

// model definition
var modelConfLR5s = {
  type: "lr",               // linear regression
  unit: 1,                  // basic unit for updating aggregates (1 ... 20ms, 50 ... 1s)
  frequency: 50,            // frequency of updating the prediction (in units)
  horizon: 250,             // horizon for prediction (in units)
  forgetFact: 1.0,        // forget factor for recursive linear regression
  bufferLength: 300,          // length of buffer of vectors
  target: "psp_v|ma|1000",
  attributes: [
    { "time": 0,
      "attributes": [
        { type: "value", "name": "psp_v|ma|1000" },
        { type: "value", "name": "psp_v|ma|5000" },
        { type: "value", "name": "psp_v|ema|60000" },
        { type: "value", "name": "f1|variance|5000" },
        { type: "value", "name": "psp_v|variance|5000" },
        { type: "value", "name": "psp_v|min|5000" },
        { type: "value", "name": "psp_v|max|5000" },
        { type: "timeDiff", "name": "psp_v|ma|1000", "interval": 50 },
        { type: "timeDiff", "name": "psp_v|ma|1000", "interval": 250 }
      ]
    },
    { "time": -50,
      "attributes" : [
        { type: "value", name: "psp_v|ma|1000"},
        { type: "timeDiff", "name": "psp_v|ma|1000", "interval": 50 }
      ]
    },
    { "time": -100,
      "attributes" : [
        { type: "value", name: "psp_v|ma|1000"},
        { type: "timeDiff", "name": "psp_v|ma|1000", "interval": 50 }
      ]
    },
    { "time": -150,
      "attributes" : [
        { type: "value", name: "psp_v|ma|1000"},
        { type: "timeDiff", "name": "psp_v|ma|1000", "interval": 50 }
      ]
    },
    { "time": -200,
      "attributes" : [
        { type: "value", name: "psp_v|ma|1000"},
        { type: "timeDiff", "name": "psp_v|ma|1000", "interval": 50 }
      ]
    }
  ]
};

var modelConfMA5s = { type: "ma", unit: 1, frequency: 50, horizon: 250, bufferLength: 0, target: 'psp_v|ma|1000', source: 'psp_v|ma|5000' };



// --------------------------------------------------------------------------
// 1min horizon definitions
// aggregate definition
// --------------------------------------------------------------------------

var aggrDefLR1m = [
  { "field": "psp_v", 
    "tick": [       
      { "type": "winbuf", "winsize": 1000,
        "sub": [          
          { "type": "ma" }
        ]
      },
      { "type": "winbuf", "winsize": 1 * 60 * 1000,
        "sub": [
          { "type": "variance" },
          { "type": "ma" },
          { "type": "min" },
          { "type": "max" }
        ]
      },
      { "type": "winbuf", "winsize": 5 * 60 * 1000,
        "sub": [
          { "type": "variance" },
          { "type": "ma" },
          { "type": "min" },
          { "type": "max" }
        ]
      }
    ] 
  },
  { "field": "f1", 
    "tick": [       
      { "type": "winbuf", "winsize": 60000,
        "sub": [
          { "type": "ma" },
          { "type": "variance" }
        ]
      }
    ]
  }
];

var aggrDefMA1m = [
  { "field": "psp_v", 
    "tick": [             
      { "type": "winbuf", "winsize": 1000,
        "sub": [          
          { "type": "ma" }
        ]
      },
      { "type": "winbuf", "winsize": 60000,
        "sub": [
          { "type": "ma" },
        ]
      }
    ]
  }
];

// model definition
var modelConfLR1m = {
  type: "lr",               // linear regression
  unit: 50,                 // basic unit for updating aggregates (1 ... 20ms, 50 ... 1s)
  frequency: 10,            // frequency of updating the prediction (in units)
  horizon: 1 * 60,          // horizon for prediction
  forgetFact: 1.0,          // forget factor for recursive linear regression
  bufferLength: 310,         // length of buffer of vectors (by units)
  target: "psp_v|ma|1000",
  attributes: [
    { "time": 0,            // in terms of units
      "attributes": [
        { type: "value", "name": "psp_v|ma|1000" },
        { type: "value", "name": "psp_v|ma|60000" },
        { type: "value", "name": "psp_v|ma|300000" },
        { type: "value", "name": "f1|variance|60000" },
        { type: "value", "name": "psp_v|variance|60000" },
        { type: "value", "name": "psp_v|min|60000" },
        { type: "value", "name": "psp_v|max|60000" },
        { type: "timeDiff", "name": "psp_v|ma|60000", "interval": 60 },  // interval is also in term of units
        { type: "timeDiff", "name": "psp_v|ma|300000", "interval": 300 }
      ]
    },
    { "time": -60,
      "attributes" : [
        { type: "value", name: "psp_v|ma|60000"},
        { type: "timeDiff", "name": "psp_v|ma|60000", "interval": 60 }
      ]
    },    
    { "time": -120,
      "attributes" : [
        { type: "value", name: "psp_v|ma|60000"},
        { type: "timeDiff", "name": "psp_v|ma|60000", "interval": 60 }
      ]
    },
    { "time": -180,
      "attributes" : [
        { type: "value", name: "psp_v|ma|60000"},
        { type: "timeDiff", "name": "psp_v|ma|60000", "interval": 60 }
      ]
    },
    { "time": -240,
      "attributes" : [
        { type: "value", name: "psp_v|ma|60000"},
        { type: "timeDiff", "name": "psp_v|ma|60000", "interval": 60 }
      ]
    }    
  ]
};

var modelConfMA1m = { type: "ma", unit: 50, frequency: 10, horizon: 1 * 60, bufferLength: 0, target: 'psp_v|ma|1000', source: 'psp_v|ma|60000' };



// --------------------------------------------------------------------------
// 5min horizon definitions
// aggregate definition
// --------------------------------------------------------------------------

var aggrDefLR5m = [
  { "field": "psp_v", 
    "tick": [       
      { "type": "winbuf", "winsize": 5000,
        "sub": [          
          { "type": "ma" }
        ]
      },
      { "type": "winbuf", "winsize": 1 * 60 * 1000,
        "sub": [
          { "type": "variance" },
          { "type": "ma" },
        ]
      },
      { "type": "winbuf", "winsize": 5 * 60 * 1000,
        "sub": [
          { "type": "variance" },
          { "type": "ma" },
          { "type": "min" },
          { "type": "max" }
        ]
      },
      { "type": "winbuf", "winsize": 15 * 60 * 1000,
        "sub": [
          { "type": "variance" },
          { "type": "ma" },
        ]
      }
    ] 
  },
  { "field": "f1", 
    "tick": [       
      { "type": "winbuf", "winsize": 5 * 60 * 1000,
        "sub": [
          { "type": "ma" },
          { "type": "variance" }
        ]
      }
    ]
  }
];

var aggrDefMA5m = [
  { "field": "psp_v", 
    "tick": [             
      { "type": "winbuf", "winsize": 5000,
        "sub": [          
          { "type": "ma" }
        ]
      },
      { "type": "winbuf", "winsize": 5 * 60 * 1000,
        "sub": [
          { "type": "ma" },
        ]
      }
    ]
  }
];

// model definition
var modelConfLR5m = {
  type: "lr",               // linear regression
  unit: 50,                 // basic unit for updating aggregates (1 ... 20ms, 50 ... 1s)
  frequency: 10,            // frequency of updating the prediction (in units)
  horizon: 5 * 60,          // horizon for prediction
  forgetFact: 1.0,          // forget factor for recursive linear regression
  bufferLength: 1510,       // length of buffer of vectors (by units)
  target: "psp_v|ma|5000",
  attributes: [
    { "time": 0,            // in terms of units
      "attributes": [
        { type: "value", "name": "psp_v|ma|5000" },
        { type: "value", "name": "psp_v|ma|300000" },
        { type: "value", "name": "psp_v|ma|900000" },
        { type: "value", "name": "f1|variance|300000" },
        { type: "value", "name": "psp_v|variance|300000" },
        { type: "value", "name": "psp_v|min|300000" },
        { type: "value", "name": "psp_v|max|300000" },
        { type: "timeDiff", "name": "psp_v|ma|300000", "interval": 60 },  // interval is also in term of units
        { type: "timeDiff", "name": "psp_v|ma|900000", "interval": 300 }
      ]
    },
    { "time": -300,
      "attributes" : [
        { type: "value", name: "psp_v|ma|300000"},
        { type: "timeDiff", "name": "psp_v|ma|300000", "interval": 300 }
      ]
    },    
    { "time": -600,
      "attributes" : [
        { type: "value", name: "psp_v|ma|300000"},
        { type: "timeDiff", "name": "psp_v|ma|300000", "interval": 300 }
      ]
    },
    { "time": -900,
      "attributes" : [
        { type: "value", name: "psp_v|ma|300000"},
        { type: "timeDiff", "name": "psp_v|ma|300000", "interval": 300 }
      ]
    },
    { "time": -1200,
      "attributes" : [
        { type: "value", name: "psp_v|ma|300000"},
        { type: "timeDiff", "name": "psp_v|ma|300000", "interval": 300 }
      ]
    }    
  ]
};

var modelConfMA5m = { type: "ma", unit: 50, frequency: 10, horizon: 5 * 60, bufferLength: 0, target: 'psp_v|ma|5000', source: 'psp_v|ma|300000' };




// --------------------------------------------------------------------------
// 15min horizon definitions
// aggregate definition
// --------------------------------------------------------------------------

var aggrDefLR15m = [
  { "field": "psp_v", 
    "tick": [       
      { "type": "winbuf", "winsize": 5000,
        "sub": [          
          { "type": "ma" }
        ]
      },
      { "type": "winbuf", "winsize": 5 * 60 * 1000,
        "sub": [
          { "type": "variance" },
          { "type": "ma" }
        ]
      },
      { "type": "winbuf", "winsize": 15 * 60 * 1000,
        "sub": [
          { "type": "variance" },
          { "type": "ma" },
          { "type": "min" },
          { "type": "max" }
        ]
      },
      { "type": "winbuf", "winsize": 60 * 60 * 1000,
        "sub": [
          { "type": "variance" },
          { "type": "ma" },
        ]
      },
    ] 
  },
  { "field": "f1", 
    "tick": [       
      { "type": "winbuf", "winsize": 15 * 60 * 1000,
        "sub": [
          { "type": "ma" },
          { "type": "variance" }
        ]
      }
    ]
  }
];

var aggrDefMA15m = [
  { "field": "psp_v", 
    "tick": [             
      { "type": "winbuf", "winsize": 5000,
        "sub": [          
          { "type": "ma" }
        ]
      },
      { "type": "winbuf", "winsize": 15 * 60 * 1000,
        "sub": [
          { "type": "ma" },
        ]
      }
    ]
  }
];

// model definition
var modelConfLR15m = {
  type: "lr",               // linear regression
  unit: 50,                 // basic unit for updating aggregates (1 ... 20ms, 50 ... 1s)
  frequency: 10,            // frequency of updating the prediction (in units)
  horizon: 15 * 60,         // horizon for prediction
  forgetFact: 1.0,          // forget factor for recursive linear regression
  bufferLength: 4510,       // length of buffer of vectors (by units)
  target: "psp_v|ma|5000",
  attributes: [
    { "time": 0,            // in terms of units
      "attributes": [
        { type: "value", "name": "psp_v|ma|5000" },
        { type: "value", "name": "psp_v|ma|300000" },
        { type: "value", "name": "psp_v|ma|900000" },
        { type: "value", "name": "psp_v|ma|3600000" },
        { type: "value", "name": "f1|variance|900000" },
        { type: "value", "name": "psp_v|variance|900000" },
        { type: "value", "name": "psp_v|min|900000" },
        { type: "value", "name": "psp_v|max|900000" },
        { type: "timeDiff", "name": "psp_v|ma|900000", "interval": 90 },  // interval is also in term of units
        { type: "timeDiff", "name": "psp_v|ma|3600000", "interval": 3600 }
      ]
    },
    { "time": -900,
      "attributes" : [
        { type: "value", name: "psp_v|ma|900000"},
        { type: "timeDiff", "name": "psp_v|ma|900000", "interval": 900 }
      ]
    },    
    { "time": -1800,
      "attributes" : [
        { type: "value", name: "psp_v|ma|900000"},
        { type: "timeDiff", "name": "psp_v|ma|900000", "interval": 900 }
      ]
    },
    { "time": -2700,
      "attributes" : [
        { type: "value", name: "psp_v|ma|900000"},
        { type: "timeDiff", "name": "psp_v|ma|900000", "interval": 900 }
      ]
    },
    { "time": -3600,
      "attributes" : [
        { type: "value", name: "psp_v|ma|900000"},
        { type: "timeDiff", "name": "psp_v|ma|900000", "interval": 900 }
      ]
    }    
  ]
};

var modelConfMA15m = { type: "ma", unit: 50, frequency: 10, horizon: 15 * 60, bufferLength: 0, target: 'psp_v|ma|5000', source: 'psp_v|ma|900000' };


// NODE 1
// 5 sec
var m1_11 = new STLFModeller("167002045410006104c2a000a00000e0", -1, modelConfMA5s, aggrDefMA5s, false);
var m1_12 = new STLFModeller("167002045410006104c2a000a00000e0", 50, modelConfLR5s, aggrDefLR5s, false);
// 1 min
var m1_21 = new STLFModeller("167002045410006104c2a000a00000e0", -1, modelConfMA1m, aggrDefMA1m, false);
var m1_22 = new STLFModeller("167002045410006104c2a000a00000e0", -1, modelConfLR1m, aggrDefLR1m, false);
// 5 min
var m1_31 = new STLFModeller("167002045410006104c2a000a00000e0", -1, modelConfMA5m, aggrDefMA5m, false);
var m1_32 = new STLFModeller("167002045410006104c2a000a00000e0", -1, modelConfLR5m, aggrDefLR5m, false);
// 15 min
var m1_31 = new STLFModeller("167002045410006104c2a000a00000e0", -1, modelConfMA15m, aggrDefMA15m, false);
var m1_32 = new STLFModeller("167002045410006104c2a000a00000e0", -1, modelConfLR15m, aggrDefLR15m, false);

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
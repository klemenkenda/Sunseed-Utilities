var mqtt = require('mqtt')
var fs = require('fs')
var dateFormat = require('dateformat')
var qm = require('qminer');

// global
var deepstream = require('deepstream.io-client-js')
const dsclient = deepstream('atena.ijs.si:6020').login()

// create base


function STLFModeller(node_id, bridge_resample, debug) {
    // constructor
    this.node_id = node_id;
    this.client = mqtt.connect('mqtt://10.122.248.42');
    this.bridge_resample = bridge_resample;
    this.debug = debug;

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
    this.msgcounter = 0;
    this.rawstore = this.base.store("Raw");

    // create stream agregates
    // create tick and winbuff - base for all other aggregates
    this.tickPSPV = this.rawstore.addStreamAggr({
      type: "timeSeriesTick",
      timestamp: "Time",
      value: "psp_v"
    });

    this.winbufPSPV1s = this.rawstore.addStreamAggr({
      type: "timeSeriesWinBufVector",
      inAggr: this.tickPSPV,
      winsize: 1 * 1000
    });

/*
    this.winbuffPSPV1m = this.rawstore.addStreamAggr({
      type: "timeSeriesWinBuf",
      timestamp: "Time",
      value: "v1",
      winsize: 60 * 1000
    });

    this.winbuffPSPV10m = this.rawstore.addStreamAggr({
      type: "timeSeriesWinBuf",
      timestamp: "Time",
      value: "v1",
      winsize: 10 * 60 * 1000
    });
*/
    this.emaPSPV1u = this.rawstore.addStreamAggr({
      type: "ema",
      inAggr: this.tickPSPV,
      emaType: "previous",
      interval: 1 * 1000,
      initWindow: 1* 1000
    });

    this.stdevPSPV1s = this.rawstore.addStreamAggr({
      type: 'variance',
      inAggr: this.winbufPSPV1s
    })

    // end of constructor

    this.client.on('connect', function () {
      this.subscribe('spm/' + modeller.node_id);
    });
    
    this.client.on('message', function (topic, message) {      
      var m = JSON.parse(message);
      modeller.processRecord(m);      
    });

    this.processRecord = function (rec) {      
      this.msgcounter++;
      if ((this.bridge_resample > 0) && (this.msgcounter % this.bridge_resample == 0)) {
        this.broadcast(rec);
        if (this.debug) console.log("Deepstream.IO send: " + this.node_id + ", " + this.msgcounter, rec);
      }

      // virtually add to Raw store
      var unixts = 10 * 365 * 24 * 60 * 60 * 1000 + (rec["week_id"] + 1) * 7 * 24 * 60 * 60 * 1000 + rec["sec_id"] * 1000 + rec["report_n"] * 20;  
      var date = new Date(unixts);
      var isoTime = date.toISOString();
      var rawRecord = this.rawstore.newRecord({
        Time: isoTime,
        v1: rec["v1"], v2: rec["v2"], v3: rec["v3"], psp_v: rec["psp_v"],
        th1: rec["th1"], th2: rec["th2"], th3: rec["th3"], psp_th: rec["psp_th"],
        f1: rec["f1"], f2: rec["f2"], f3: rec["f3"], f4: rec["f3"]
      });
      // trigger stream aggregates bound to Raw store
      this.rawstore.triggerOnAddCallbacks(rawRecord);
      // this.rawstore.push(rawRecord.toJSON());

      if (this.msgcounter % 50 == 0) console.log("Razlika: ", this.emaPSPV1u.getFloat() - this.tickPSPV.getFloat(), "Stdev(1s)", this.stdevPSPV1s.getFloat());

    }

    this.broadcast = function(rec) {
      dsclient.event.emit("spm/" + this.node_id, JSON.stringify(rec));
    }
}

var m1 = new STLFModeller("167002045410006104c2a000a00000e0", 50, true);
var m2 = new STLFModeller("167002045410006104a9a000a00000f6", 50, true);
var m3 = new STLFModeller("167002045410006104c7a000a00000fb", 50, true);
var m4 = new STLFModeller("167002045410006104bba000a0000088", 50, true);
var m5 = new STLFModeller("167002045410006104c5a000a00000f5", 50, true);
var m6 = new STLFModeller("167002045410006104bfa000a0000094", 50, true);
var m7 = new STLFModeller("167002045410006104b3a000a00000b0", 50, true);
var m8 = new STLFModeller("167002045410006104b4a000a00000a5", 50, true);
var m9 = new STLFModeller("167002045410006104baa000a000008f", 50, true);
var m10 = new STLFModeller("167002045410006104aaa000a00000ff", 50, true);
var m11 = new STLFModeller("167002045410006104c0a000a00000ee", 50, true);
var m12 = new STLFModeller("167002045410006104c1a000a00000e9", 50, true);
var m13 = new STLFModeller("167002045410006104ada000a00000ea", 50, true);
var m14 = new STLFModeller("167002045410006104afa000a00000e4", 50, true);
var m15 = new STLFModeller("167002045410006104c8a000a00000d6", 50, true);
var m16 = new STLFModeller("167002045410006104cea000a00000c4", 50, true);


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
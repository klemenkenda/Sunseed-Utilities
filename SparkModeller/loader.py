import urllib.request
import urllib.parse
import json
import dateutil.parser
import datetime
import numpy

"""Loader class
"""
class Loader:
    # object properties
    config = []
    loadURL = ""
    loadURLSensor = ""
    loadURLAggregate = ""
    minDate = datetime.date.today()
    maxDate = datetime.date.today()
    mergerConf = []
    mergedTable = []

    # object methods
    def __init__(self, config):
        self.config = config;
        self.loadURL = config["dataminerurl"];
        self.loadURLSensor = self.loadURL + "get-measurements";
        self.loadURLAggregate = self.loadURL + "get-all-aggregates";

    def toMySQLDate(self, myDate):
        return myDate.strftime("%Y-%m-%d");

    def load(self, timeFrom, timeTo):
        # convert dates to MySQL fromat
        fromStr = self.toMySQLDate(timeFrom);
        toStr = self.toMySQLDate(timeTo);
        print("Loading from " + fromStr + " to " + toStr);
        self.loadSensors(fromStr, toStr);

    def loadSensors(self, fromStr, toStr):
        # TODO: retry if result is not OK
        for sensor in self.config["sensors"]:
            # load measurements
            values = { "p" : sensor["name"] + ":" + fromStr + ":" + toStr };
            data = urllib.parse.urlencode(values);
            url = self.loadURLSensor + "?" + data;
            print(url)
            with urllib.request.urlopen(url) as response:
                html = response.read().decode("ascii")
                sensor["measurements"] = json.loads(html);

            # load aggregates
            if (sensor["type"] != "prediction"):
                url = self.loadURLAggregate + "?" + data;
                print(url)
                with urllib.request.urlopen(url) as response:
                    html = response.read().decode("ascii");
                    sensor["aggregates"] = json.loads(html);

    def resample(self):
        # get start & end timestamp
        minDate = datetime.datetime(1970, 1, 1)

        for sensor in self.config["sensors"]:
            if "measurements" in sensor:
                date = dateutil.parser.parse(sensor["measurements"][0]["Timestamp"])
                if (date > minDate):
                    minDate = date;

            if "aggregates" in sensor:
                date = dateutil.parser.parse(sensor["aggregates"][0]["Time"])
                if (date > minDate):
                    minDate = date;

        print("from: ", minDate)
        startDate = minDate.replace(minute = 00, second = 00)
        self.minDate = startDate

        # traverse all sensors
        for sensor in self.config["sensors"]:
            if "measurements" in sensor:
                self.resampleSensor(sensor, "measurements", minDate, "Timestamp");
            if "aggregates" in sensor:
                self.resampleSensor(sensor, "aggregates", minDate, "Time");
                #print(sensor["resaggregates"])

    def resampleSensor(self, sensor, srcprop, minDate, timeprop):
        # go from start to end and resample
        print("Resampling " + sensor["name"] + "['" + srcprop + "']");
        currentDate = minDate;
        maxDate = dateutil.parser.parse(sensor[srcprop][-1][timeprop]).replace(minute = 00, second = 00)
        i = 0;
        sensor["res" + srcprop] = [];
        while (currentDate <= maxDate):
            # print(currentDate);
            itemDate = dateutil.parser.parse(sensor[srcprop][i][timeprop]);

            while (itemDate < currentDate):
                i = i + 1;
                itemDate = dateutil.parser.parse(sensor[srcprop][i][timeprop]);

            if (itemDate != currentDate):
                print("Disaster: ", itemDate, currentDate)

            sensor[srcprop][i]["Timestamp"] = currentDate.strftime("%Y-%m-%dT%H:%M:%S");

            sensor["res" + srcprop].append(sensor[srcprop][i])

            currentDate = currentDate + datetime.timedelta(hours = 1)

    def merge(self):
        self.defineMerger()
        # main sensor with target value with offset 24
        mainSensor = self.config["sensors"][0]["resmeasurements"]

        # row
        n = len(self.mergerConf) + 1               # number of attributes
        row = numpy.empty(n, dtype = object);

        # main loop over all sensor measurements
        measurementId = 0
        # getting max measurements
        maxOffset = len(mainSensor) - 1

        for measurement in mainSensor:
            sensorOK = True
            attributeId = 0
            # column zero = time
            row[attributeId] = measurement["Timestamp"];

            for attribute in self.mergerConf:
                attributeId = attributeId + 1
                attributeOffset = measurementId + attribute["offset"];
                maxAttributeOffset = len(self.config["sensors"][attribute["sensorid"]][attribute["table"]])
                if (attributeOffset < 0) or (attributeOffset > maxAttributeOffset):
                    print(attributeOffset)
                    sensorOK = False
                    break

                #print(attribute["sensorid"], attribute["table"], attributeOffset, attribute["field"])
                row[attributeId] = self.config["sensors"][attribute["sensorid"]][attribute["table"]][attributeOffset][attribute["field"]]

            if (sensorOK == True):
                print("Row added!")
                self.mergedTable.append(row);

            measurementId = measurementId + 1


    def defineMerger(self):
        self.mergerConf = []
        sensorid = 0
        for sensor in self.config["sensors"]:
            tsId = 0
            # measurements
            for ts in sensor["ts"]:
                tsId = tsId + 1
                print(sensor["name"] + str(tsId))
                self.mergerConf.append({ "name": sensor["name"] + str(tsId), "sensorid": sensorid, "table": "resmeasurements", "offset": ts, "field": "Val" })
            if "aggrs" in sensor:
                for aggr in sensor["aggrs"]:
                    print(sensor["name"] + aggr)
                    self.mergerConf.append({ "name": sensor["name"] + aggr, "sensorid": sensorid, "table": "resaggregates", "offset": 0, "field": aggr })
            # going to a new sensor
            sensorid = sensorid + 1

        # check the table of sensors
        # print(self.mergerConf)

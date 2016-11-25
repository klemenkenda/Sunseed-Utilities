import urllib.request
import urllib.parse
import json
import dateutil.parser
import datetime

"""Loader class
"""
class Loader:
    # object properties
    config = [];
    loadURL = "";
    loadURLSensor = "";
    loadURLAggregate = "";

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
        maxDate = datetime.datetime(2050, 1, 1)

        for sensor in self.config["sensors"]:
            if "measurements" in sensor:
                date = dateutil.parser.parse(sensor["measurements"][0]["Timestamp"])
                if (date > minDate):
                    minDate = date;
                date = dateutil.parser.parse(sensor["measurements"][-1]["Timestamp"])
                if (date < maxDate):
                    maxDate = date;

            if "aggregates" in sensor:
                date = dateutil.parser.parse(sensor["aggregates"][0]["Time"])
                if (date > minDate):
                    minDate = date;
                date = dateutil.parser.parse(sensor["aggregates"][-1]["Time"])
                if (date < maxDate):
                    maxDate = date;

        print("from: ", minDate, "\nto:   ", maxDate)
        startDate = minDate.replace(minute = 00, second = 00)

        # traverse all sensors
        for sensor in self.config["sensors"]:
            if "measurements" in sensor:
                self.resampleSensor(sensor, "measurements", minDate, maxDate, "Timestamp");
            if "aggregates" in sensor:
                self.resampleSensor(sensor, "aggregates", minDate, maxDate, "Time");
                print(sensor["resaggregates"])

    def resampleSensor(self, sensor, srcprop, minDate, maxDate, timeprop):
        # go from start to end and resample
        print("Resampling " + sensor["name"] + "['" + srcprop + "']");
        currentDate = minDate;
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

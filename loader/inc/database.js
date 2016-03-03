var fs = require("fs");

function Database() {
    this.dbName = "data.db";
    this.db;
    this.zeroTS = 1455408000;
    this.lastTS = 1455408000;
    this.interval = 900;
}

Database.prototype.exists = function () {
    return fs.existsSync(this.dbName);
};

Database.prototype.init = function () {
    var fd = fs.openSync(this.dbName, "w");
    fs.writeSync(fd, this.zeroTS + "," + this.zeroTS);
    fs.closeSync(fd);
}

Database.prototype.update = function (zeroTS, lastTS) {
    var fd = fs.openSync(this.dbName, "w");
    fs.writeSync(fd, zeroTS + "," + lastTS);
    fs.closeSync(fd);

    this.zeroTS = zeroTS;
    this.lastTS = lastTS;
}

Database.prototype.sync = function () {
    if (this.exists()) {
        var contents = fs.readFileSync(this.dbName).toString();
        var arr = contents.split(",");
        this.zeroTS = arr[0];
        this.lastTS = arr[1];
    } else {
        this.init();
    }    
}

module.exports = Database;
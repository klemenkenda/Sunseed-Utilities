/* sync object */
function SyncHttpManager() {
    this.requests = 0;
    this.responses = 0;
    
    this.reqMade = function () {
        this.requests++;
        console.log("Request made.");
    }
    
    this.resReceived = function () {
        this.responses++;
        console.log("Request received: " + this.responses + "/" + this.requests);
    }
    
    this.isInSync = function () {
        return this.requests == this.responses;
    }
    
    this.stats = function () {
        console.log("Requests/responses: " + this.requests + "/" + this.responses);
    }
}

module.exports = SyncHttpManager;
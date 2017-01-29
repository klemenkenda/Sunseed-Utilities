function StreamEvaluation(bufferLength) {
    // constructor
    this.bufferLength = bufferLength;
    this.buffer = [];
    this.MSE = 0.0;


    // end of constructor

    // IO functions

    /**
     * FUNCTION: add
     * @param prediction {float} Prediction value.
     * @param value {float} Real value.
     * @return none
     */
    this.add = function(prediction, value) {
        var len = this.buffer.length;
        var outVal = {};
        var inVal = { "p": prediction, "v": value };
        var full = false;

        if (len > this.bufferLength) {
            // take first element shift array
            outVal = this.buffer[0];
            this.buffer.shift();            
            full = true;
        }

        this.buffer.push(inVal);

        // calculate measures
        this.streamMSE(inVal, outVal, full)
    }

    /**
     * FUNCTION: get
     * DESCRIPTION: Returns JSON encoded evaluation measures
     */     
    this.get = function() {
        var out = {
            "mse": this.MSE
        }
        return out;
    }

    // measure implementatations
    /**
     * FUNCTION: streamMSE
     * DESCRIPTION: Implements MSE on a timewindow
     */
    this.streamMSE = function(inVal, outVal, full) {
        // MSE = \sum_n (y^2 - y_f^2) / N
        var N = this.buffer.length;
        var N_1 = N - 1;
        if (N == 0) {
            N = 1;
            N_1 = 1;
        }
        if (full) N_1 = N;
        
        var sumMSE = this.MSE * N_1;       
        sumMSE = sumMSE + (inVal.p - inVal.v)*(inVal.p - inVal.v);
                
        if (("p" in outVal) && ("v" in outVal)) {
            sumMSE = sumMSE - (outVal.p - outVal.v)*(outVal.p - outVal.v);
        }
        this.MSE = sumMSE / N;
    }
    // RMSE
    // MAE
    // MAPE
    // R2

}

module.exports = StreamEvaluation;
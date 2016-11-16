var Credentials = {}

Credentials.host = "atena.ijs.si";
Credentials.user = "root";
Credentials.password = "";
Credentials.database = "sunseed";

Credentials.apiURL = "http://atena.ijs.si/api/push-predictions";

// seveda dosegljivo samo z VPN oz. znotraj 
Credentials.RMQhost = "amqp://10.122.248.37" // bpl-sunrabbit1.ts.telekom.si
Credentials.RMQexchange = "lf_exchange"
Credentials.RMQqueue_name = "lf_save_queue"
Credentials.RMQrouting_key = "load_forecasting"

module.exports = Credentials;
# BasicModeller

Basic modeller runs predictive models on Sunseed data. It should be run once per day to generate predictions for the next 24 hours. It should be started right after the data has been refreshed from MongoDB @ Telekom. Currently it uses last 60 days to prepare the model and it updates prediction for the last day.

BasicModeller runs as a service and is run each day after data is loaded from MongoDB@Telekom (@4AM).

## Usage
Modeller can be started by ```pm2 start modeller.js```.
# Loader3

3rd version of the loader from MongoDB@Telekom. The service is running constantly. Loading process is started once per day (@3AM). All the data for last 48 hours is requested (in case something fails for a particular day).

## Running

Loader can be simply run with ```pm2 start loader3.js```.

## Load batch
It is also possible to load a batch of all the data from the MongoDB. This can be simply done with: ```npm start batch```. This will load the data from 2016-04-01 up until 2017-05-30 (tailored for Sunseed project). If you want to load particular time window, you have to specify start and end dates (included) as 4th or 5th parameter of the call, i. e. ```npm start batch 2016-11-01 2016-11-17```.

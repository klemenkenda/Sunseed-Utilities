<?PHP
// -----------------------------------------------------------------------------------
// FILE: parser.weatheronline.inc.php
// AUTHOR: Klemen Kenda
// DATE: 10/10/2013
// DESCRIPTION: Parsers for Weather Online
// HISTORY: 
// -----------------------------------------------------------------------------------

// -----------------------------------------------------------------------------------
// FUNCTION: parseWeatherOnlineFreeAPI
// DESCRIPTION: Parses JSON responses from WorldWeatherOnline Free API and resends
//	 it in uniform format to QMiner (EnStreaM) instance.
// -----------------------------------------------------------------------------------
function parseWeatherOnlineFreeAPI($source) {
	global $miner;
	
	// initialization
	$HTML = "";
	$errors = "";
	
	// UoM initialization
	$UOM = array(
		"cloudcover" => "%",
		"humidity" => "%",
		"precipMM" => "mm",
		"pressure" => "mbar",
		"temp_C" => "deg C",
		"temp_F" => "deg F",
		"visibility" => "km",
		"weatherCode" => "",
		"winddirDegree" => "deg",
		"windspeedKmph" => "km/h",
		"windspeedMiles" => "mph"
	);
	
	$PHENOMENON = array(
		"cloudcover" => "cloudcover",
		"humidity" => "humidity",
		"precipMM" => "precipitation",
		"pressure" => "pressure",
		"temp_C" => "temperature",
		"temp_F" => "temperature",
		"visibility" => "visibility",
		"weatherCode" => "weatherCode",
		"winddirDegree" => "winddirection",
		"windspeedKmph" => "windspeed",
		"windspeedMiles" => "windspeed"
	);
	
	// extract places
	$parameters = explode(";", $source["so_parameters"]);	
	
	// update request time
	$SQL_UPDATE = "UPDATE newsfeedsource SET ns_update_ts = NOW() WHERE id = " . $source["id"];
	$result_update = mysql_query($SQL_UPDATE);

	// loop by the places, delay 1 second
	$n = 0;	// node counter
	foreach ($parameters as $parameter) {
		if ($n > 0) sleep(1); // delay 1 second for the API
		$n++;		
		// define URL
		$URL = "http://api.worldweatheronline.com/free/v1/weather.ashx?q=" . urlencode($parameter) . "&format=json&extra=localObsTime&num_of_days=5&includelocation=yes&key=" . $source["so_apikey"];
		
		// crawl it
		$json = file_get_contents($URL);
		$errors .= $parameter . "=";
		if ($json == FALSE) {	
			$errors .= "Napaka pri branju vira;";
		} else {
			$errors .= "OK;";
		}
		
		// parse it
		$weather = json_decode($json);		
		$current_condition = $weather->{"data"}->{"current_condition"}[0];		
		echo "<pre>";
		
		$i = 0; // counter of valid properties		
		$sensordata = [];
		foreach($current_condition as $property=>$value) {
			// extract time
			if ($property == "localObsDateTime") {
				$value = substr($value, 0, 16) . ":00" . substr($value, 16, 3);
				$ts = date_parse($value);
				$timestamp = mktime($ts["hour"], $ts["minute"], $ts["second"], $ts["month"], $ts["day"], $ts["year"]);				
				$timestamp_mysql = date("Y-m-d H:i:s", $timestamp);		
			}
			if (!is_array($value) && is_numeric($value)) {				
				// echo $property . "=" . $value . "\n";				
				$i++;
				$sensordata[$i]["property"] = $property;
				$sensordata[$i]["value"] = $value;
			}
		}
		
		$push = TRUE; // do the push of the new data
		
		// write sensor data to MySQL
		// write node
		$no_gpslat = $weather->{"data"}->{"nearest_area"}[0]->{"latitude"};
		$no_gpslng = $weather->{"data"}->{"nearest_area"}[0]->{"longitude"};
		$no_name = "WWO-" .  $weather->{"data"}->{"nearest_area"}[0]->{"areaName"}[0]->{"value"};
		$no_name = str_replace(" ", "-", $no_name);
		
		$SQL = "INSERT INTO node SET no_name = '" . $no_name . "', no_gpslat = " . $no_gpslat . ", no_gpslng = " . $no_gpslng;
		$SQL .= " ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id), no_name = '" . $no_name . "', no_gpslat = " . $no_gpslat . ", no_gpslng = " . $no_gpslng;
		$result = mysql_query($SQL);
		echo mysql_error();
		$nodeid = mysql_insert_id();
		
		echo "Node: $nodeid, $no_name, $no_gpslat, $no_gpslng\n";		
		
		// JSON - create start part
		// start JSON
		$JSON = '[{"node":{"id":"' . $nodeid . '","name":"' . $no_name . '","lat":' . $no_gpslat . ',"lng":' . $no_gpslng . ',';
		$JSON .= '"measurements":[';			
		
		$i = 0;	// property counter
		foreach ($sensordata as $item) {
			$i++;
			
			$property = $item["property"];
			$value = $item["value"];
			
			// write sensor type
			$ty_name = "WWO-" . $property;
			$ty_phenomenon = $PHENOMENON[$property];
			$ty_uom = $UOM[$property]; 	// WeatherOnline does not provide UoM
						
			$SQL = "INSERT INTO type SET ty_name = '" . $ty_name . "', ty_phenomenon = '" . $ty_phenomenon . "', ty_uom = '" . $ty_uom . "'";
			$SQL .= " ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id), ty_name = '" . $ty_name . "', ty_phenomenon = '" . $ty_phenomenon . "', ty_uom = '" . $ty_uom . "'";			
			$result = mysql_query($SQL);			
			$typeid = mysql_insert_id();
			
			echo "Type: $typeid, $ty_name, $ty_phenomenon, $ty_uom\n";
			
			// write sensor
			$SQL = "INSERT INTO sensor SET se_nodeid = $nodeid, se_typeid = $typeid ";
			$SQL .= " ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id), se_nodeid = $nodeid, se_typeid = $typeid ";
			$result = mysql_query($SQL);			
			$sensorid = mysql_insert_id();
			
			echo "Sensor: $sensorid, $no_name, $ty_name\n";
			
			// write measurement
			$SQL = "SELECT * FROM measurement WHERE me_time = '" . $timestamp_mysql . "' AND me_sensorid = " . $sensorid;
			$result = mysql_query($SQL);
			
			// if this is not a duplicate, insert it			
			if (mysql_affected_rows() == 0) {		
				$SQL = "INSERT INTO measurement SET me_time = '" . $timestamp_mysql . "', me_sensorid = " . $sensorid . ", me_value = " . $value;
				$result = mysql_query($SQL);				
				echo "Measurement: $timestamp_mysql, $value, $no_name, $ty_name";				
			} else {
				$push = FALSE;	// dont do the push of the data as it is not new
			}
			
			// JSON - update
			// set missing parameters for JSON
			$se_name = $no_name . "-" . $ty_name;			
			$qts = str_replace(" ", "T", $timestamp_mysql) . ".000";
			
			$JSON .= '{"sensorid":"' . $se_name . '","value":' . $value . ',"timestamp":"' . $qts . '","type":{';
			$JSON .= '"id":"' . $typeid . '","name":"' . $ty_name . '","phenomenon":"' . $ty_phenomenon . '","UoM":"' . urlencode($ty_uom) . '"';
			$JSON .= '}}';			
			if ($i < sizeof($sensordata)) $JSON .= ",";					
		}  // foreach sensordata		
		// JSON end
		$JSON .= ']}}]';
				
		echo $JSON;
		
		// push the JSON
		if ($push == TRUE) {		
			// create request to EnStreaM
			// $url = $miner["url"] . ":" . $miner["port"] . "/enstream/add-measurement?data=" . urlencode($JSON);	
			$url = "http://demo.nrg4cast.org/api/add-json-no-log";
			$fields = "data=" . urlencode($JSON);
			$HTML .= getURLPost($url, $fields);		
			
			$fp = fopen("weatheronline-json.txt", "w");
			fwrite($fp, $JSON);
			fclose($fp);		
		}
	}  // foreach measuring point (node)
	
	// write results and errors
	$SQL_UPDATE = "UPDATE source SET so_status = '" . $errors . "' WHERE id = ". $source["id"];	
	$result_update = mysql_query($SQL_UPDATE); 
	
	return $HTML;
}

// -----------------------------------------------------------------------------------
// FUNCTION: parseOpenWeatherMapAPI
// -----------------------------------------------------------------------------------
function parseOpenWeatherMapAPI($source) {
	global $miner;
	
	// initialization
	$HTML = "";
	$errors = "";
	
	// parse categories initialization
	$categories = array(
		"weather", "main", "wind", "rain", "clouds"
	);
	
	// UoM initialization
	$UOM = array(
		"all" => "%",
		"humidity" => "%",
		"3h" => "mm",
		"1h" => "mm",
		"pressure" => "mbar",
		"temp" => "deg C",				
		"id" => "",
		"deg" => "deg",
		"speed" => "km/h"		
	);
	
	$PHENOMENON = array(
		"all" => "cloudcover",
		"humidity" => "humidity",
		"3h" => "precipitation_3h",
		"1h" => "precipitation_1h",
		"pressure" => "pressure",
		"temp" => "temperature",				
		"id" => "weatherCode",
		"deg" => "winddirection",
		"speed" => "windspeed"		
	);
	
	// extract places
	$parameters = explode(";", $source["so_parameters"]);	
	
	// update request time
	$SQL_UPDATE = "UPDATE newsfeedsource SET ns_update_ts = NOW() WHERE id = " . $source["id"];
	$result_update = mysql_query($SQL_UPDATE);

	// loop by the places, delay 1 second
	$n = 0;	// node counter
	foreach ($parameters as $parameter) {
		if ($n > 0) sleep(1); // delay 1 second for the API
		$n++;		
		// define URL
		$URL = "http://api.openweathermap.org/data/2.5/weather?q=" . urlencode($parameter) . "";
		
		// crawl it
		$json = file_get_contents($URL);
		$errors .= $parameter . "=";
		if ($json == FALSE) {	
			$errors .= "Napaka pri branju vira;";
		} else {
			$errors .= "OK;";
		}
		
		// parse it
		$weather = json_decode($json);				
		echo "<pre>";		
				
		$i = 0; // counter of valid properties		
		$sensordata = [];
		foreach($weather as $property=>$value) {			
			if (in_array($property, $categories)) {	
				$properties = $value;
				if ($property == "weather") $properties = $value[0];
				
				// print_r($properties);
				foreach ($properties as $sensorproperty => $sensorvalue) {
					if (in_array($sensorproperty, array_keys($PHENOMENON))) {						
						$i++;
						// hardoded transformation from K to deg C for temperature
						if ($sensorproperty == "temp") $sensorvalue -= 273.15;
						$sensordata[$i]["property"] = $sensorproperty;
						$sensordata[$i]["value"] = $sensorvalue;
					}				
				}
			}
		}
		
		// extract time
		// hardcoded GMT +1
		$timestamp = $weather->{'dt'}  + 60*60;		
		$timestamp_mysql = date("Y-m-d H:i:s", $timestamp);
				
		$push = TRUE; // do the push of the new data
		
		// write sensor data to MySQL
		// write node
		// print_r($weather);
		$no_gpslat = $weather->{"coord"}->{"lat"};
		$no_gpslng = $weather->{"coord"}->{"lon"};
		$no_name = "OWM-" .  $weather->{"name"} . "-" . $weather->{"id"};
		$no_name = str_replace(" ", "-", $no_name);
		
		$SQL = "INSERT INTO node SET no_name = '" . $no_name . "', no_gpslat = " . $no_gpslat . ", no_gpslng = " . $no_gpslng;
		$SQL .= " ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id), no_name = '" . $no_name . "', no_gpslat = " . $no_gpslat . ", no_gpslng = " . $no_gpslng;
		echo $SQL;
		$result = mysql_query($SQL);
		echo mysql_error();
		$nodeid = mysql_insert_id();
		
		echo "Node: $nodeid, $no_name, $no_gpslat, $no_gpslng\n";		
		
		// JSON - create start part
		// start JSON
		$JSON = '[{"node":{"id":"' . $nodeid . '","name":"' . $no_name . '","lat":' . $no_gpslat . ',"lng":' . $no_gpslng . ',';
		$JSON .= '"measurements":[';			
		
		$i = 0;	// property counter
		foreach ($sensordata as $item) {
			$i++;
			
			$property = $item["property"];
			$value = $item["value"];
			
			// write sensor type
			$ty_name = "OWM-" . $property;
			$ty_phenomenon = $PHENOMENON[$property];
			$ty_uom = $UOM[$property]; 	// WeatherOnline does not provide UoM
						
			$SQL = "INSERT INTO type SET ty_name = '" . $ty_name . "', ty_phenomenon = '" . $ty_phenomenon . "', ty_uom = '" . $ty_uom . "'";
			$SQL .= " ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id), ty_name = '" . $ty_name . "', ty_phenomenon = '" . $ty_phenomenon . "', ty_uom = '" . $ty_uom . "'";			
			$result = mysql_query($SQL);			
			$typeid = mysql_insert_id();
			
			echo "Type: $typeid, $ty_name, $ty_phenomenon, $ty_uom\n";
			
			// write sensor
			$SQL = "INSERT INTO sensor SET se_nodeid = $nodeid, se_typeid = $typeid ";
			$SQL .= " ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id), se_nodeid = $nodeid, se_typeid = $typeid ";
			$result = mysql_query($SQL);			
			$sensorid = mysql_insert_id();
			
			echo "Sensor: $sensorid, $no_name, $ty_name\n";
			
			// write measurement
			$SQL = "SELECT * FROM measurement WHERE me_time = '" . $timestamp_mysql . "' AND me_sensorid = " . $sensorid;
			$result = mysql_query($SQL);
			
			// if this is not a duplicate, insert it			
			if (mysql_affected_rows() == 0) {		
				$SQL = "INSERT INTO measurement SET me_time = '" . $timestamp_mysql . "', me_sensorid = " . $sensorid . ", me_value = " . $value;
				$result = mysql_query($SQL);				
				echo "Measurement: $timestamp_mysql, $value, $no_name, $ty_name";				
			} else {
				$push = FALSE;	// dont do the push of the data as it is not new
			}
			
			// JSON - update
			// set missing parameters for JSON
			$se_name = $no_name . "-" . $ty_name;			
			$qts = str_replace(" ", "T", $timestamp_mysql) . ".000";
			
			$JSON .= '{"sensorid":"' . $se_name . '","value":' . $value . ',"timestamp":"' . $qts . '","type":{';
			$JSON .= '"id":"' . $typeid . '","name":"' . $ty_name . '","phenomenon":"' . $ty_phenomenon . '","UoM":"' . urlencode($ty_uom) . '"';
			$JSON .= '}}';			
			if ($i < sizeof($sensordata)) $JSON .= ",";					
		}  // foreach sensordata		
		// JSON end
		$JSON .= ']}}]';
		
		echo $JSON;		
		
		// push the JSON
		if ($push == TRUE) {		
			// create request to EnStreaM
			// $url = $miner["url"] . ":" . $miner["port"] . "/enstream/add-measurement?data=" . urlencode($JSON);	
			$url = "http://demo.nrg4cast.org/api/add-json-no-log";
			$fields = "data=" . urlencode($JSON);
			$HTML .= getURLPost($url, $fields);		
			
			$fp = fopen("weatheronline-json.txt", "w");
			fwrite($fp, $JSON);
			fclose($fp);		
		}
	}  // foreach measuring point (node)
	
	// write results and errors
	$SQL_UPDATE = "UPDATE source SET so_status = '" . $errors . "' WHERE id = ". $source["id"];	
	$result_update = mysql_query($SQL_UPDATE); 
	
	return $HTML;
}


?>
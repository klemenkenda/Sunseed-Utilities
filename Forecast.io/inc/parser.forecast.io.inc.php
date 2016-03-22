<?PHP
// -----------------------------------------------------------------------------------
// FILE: parser.weatheronline.inc.php
// AUTHOR: Klemen Kenda
// DATE: 10/10/2013
// DESCRIPTION: Parsers for Weather Online
// HISTORY: 
// -----------------------------------------------------------------------------------

// -----------------------------------------------------------------------------------
// FUNCTION: parseForecastIOAPI
// -----------------------------------------------------------------------------------
function parseForecastIOAPI($source) {
	global $miner;
	
	// initialization
	$HTML = "";
	$errors = "";
	$push = TRUE; // do the push of the new data
		
	// UoM initialization
	$UOM = array(
		"cloudCover" => "",
		"humidity" => "",
		"precipProbability" => "",
		"precipIntensity" => "mm/h",
		"windSpeed" => "m/s",
		"pressure" => "hPa",
		"temperature" => "deg C",				
		"windBearing" => "deg"		
	);
	
	$PHENOMENON = array(
		"time" => "unix-timestamp",
		"cloudCover" => "cloudcover",
		"humidity" => "humidity",
		"precipProbability" => "precipprobability",
		"precipIntensity" => "precipintensity",
		"windSpeed" => "windspeed",
		"pressure" => "pressure",
		"temperature" => "temperature",				
		"windBearing" => "winddir"
	);
	
	// extract places
	$parameters = array_filter(explode(";", $source["so_parameters"]));	
	
	// update request time
	$SQL_UPDATE = "UPDATE source SET so_lastcrawl = NOW() WHERE id = " . $source["id"];
	$result_update = mysql_query($SQL_UPDATE);

	// get last successful date
	$last = $source["so_successcrawl"];
	$time = strtotime($last);
	
	if ($time >= time()) {
		$model2 = 1;
	} else {
		$model2 = 0;
	}
	
	$time = strtotime('+1 day', $time);
	$time = date('Y-m-d H:i:s', $time);
	$time = str_replace(' ', 'T', $time);
	print_r($last);
	echo "New time: " . $time . "\n";
	
	if ($model2 == 1) {
		$time = date('Y-m-d H:00:00', time());
		$time = str_replace(' ', 'T', $time);	
	}
	
	// loop by the places, delay 1 second
	$n = 0;	// node counter
	foreach ($parameters as $parameter) {
		if ($n > 0) sleep(1); // delay 1 second for the API
		$n++;		
		// define URL
		// parse parameters		
		list($lat,$lng,$place) = explode(",", $parameter);
		echo $lat  . "\n" . $lng . "\n" . $place . "\n";		
		if ($model2 == 0) $URL = "https://api.forecast.io/forecast/a5ac540b5d00c1b04657e2c8bdbc4af8/" . urlencode($lat . "," . $lng . "," . $time) . "?units=si";
		else $URL = "https://api.forecast.io/forecast/a5ac540b5d00c1b04657e2c8bdbc4af8/" . urlencode($lat . "," . $lng) . "?units=si";
		
		echo $URL;
		// crawl it
		// $json = file_get_contents($URL);
		$json = getURL($URL);
		// echo $json;
		echo " - read OK";
		$errors .= $parameter . "=";
		if ($json == -1) {	
			echo "Napaka pri branju vira;";
		} else {
			echo "OK;";
		}
		
		// parse it
		$weather = json_decode($json);				
		if (property_exists($weather, "hourly")) {
			$weather = $weather->hourly->data;
		} else {
			echo "API exhausted for the day?";
			break;
		}
		echo "<pre>";		
				
		$i = 0; // counter of valid properties		
		$sensordata = [];
		foreach($weather as $weatheratom) { // by hour
			//  ($weatheratom);
			// extract time
			$timestamp_mysql = date("Y-m-d H:00:00", $weatheratom->time);
			
			foreach($weatheratom as $property=>$value) { // by value				
				if (array_key_exists($property, $PHENOMENON)) {					
					if ($property == "time") {
						// do nothing
					} else {
						$i++;						
						$sensordata[$i]["time"] = $timestamp_mysql;
						$sensordata[$i]["property"] = $property;
						$sensordata[$i]["value"] = $value;	
					}
					
					
				}
			}
		}						
		
		// write sensor data to MySQL
		// write node
		// print_r($weather);
		$no_gpslat = $lat;
		$no_gpslng = $lng;
		$no_name = "FIO-" .  $place;
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
			$timestamp_mysql = $item["time"];
			
			// write sensor type
			$ty_name = "FIO-" . $property;
			$ty_phenomenon = $PHENOMENON[$property];
			$ty_uom = $UOM[$property]; 	// Forecast.io does not provide UoM
						
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
			$SQL = "INSERT INTO measurement SET me_time = '" . $timestamp_mysql . "', me_sensorid = " . $sensorid . ", me_value = " . $value;
			$SQL .= " ON DUPLICATE KEY UPDATE me_value = " . $value;
			$result = mysql_query($SQL);			
			if (substr($timestamp_mysql, 14, 2) != "00") echo "\n\n\nNAPAKA\n\n\n";
			echo "Measurement: $timestamp_mysql, $value, $no_name, $ty_name \n";	
			if ($sensorid == 1) echo "SQL: " . $SQL . "\n" . mysql_error(). "\n\n\n";			
			
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
			// $url = "http://atena.ijs.si/api/add-json-update";
			// $fields = "data=" . urlencode($JSON);
			// $HTML .= getURLPost($url, $fields);		
			
      $url = $miner["url"] . ":" . $miner["port"] . "/data/add-measurement-update?data=" . urlencode($JSON);
			$HTML .= getURL($url);			
      
			$fp = fopen("forecast.io.txt", "w");
			fwrite($fp, $JSON);
			fclose($fp);		
		}
	}  // foreach measuring point (node)
	
	// write results and errors
	$SQL_UPDATE = "UPDATE source SET so_status = '" . $errors . "' WHERE id = ". $source["id"];	
	$result_update = mysql_query($SQL_UPDATE); 
	if (strpos($errors, "Napaka")) {
		// nothing
	} else {
		$time = str_replace('T', ' ', $time);
		$SQL_UPDATE = "UPDATE source SET so_successcrawl = '" . $time . "' WHERE id = " . $source["id"];
		echo $SQL_UPDATE;
		$result_update = mysql_query($SQL_UPDATE);
	}
	
	return $HTML;
}


?>

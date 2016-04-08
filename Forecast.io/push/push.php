<?PHP
//---------------------------------------------------------------------
// FILE: push.php
// AUTHOR: Klemen Kenda
// DESCRIPTION: Sensorfeed Push script
// DATE: 22/03/2016
// HISTORY:
//---------------------------------------------------------------------

// initialization 
// DEBUG
error_reporting(E_ALL & ~E_NOTICE & ~E_DEPRECATED);
ini_set("display_errors", 1);

// get request variables
// import_request_variables("gPC");
extract($_GET); extract($_POST); extract($_COOKIE);

// includes
include("../inc/config.inc.php");
include("../inc/sql.inc.php");
include("../inc/http.inc.php");

// crawl all sensors
$SQL = "SELECT *, type.id as typeid, node.id as nodeid FROM node, type, sensor WHERE type.id = se_typeid AND node.id = se_nodeid";
$result = mysql_query($SQL);
echo mysql_error();

$sensorN = 0;
while ($line = mysql_fetch_array($result)) {
    $sensorN++;
	echo "\nSensor $sensorN: " . $line["no_name"] . "-" . $line["ty_name"] . "\n";
	/*
	echo "Press <ENTER> ";
	$handle = fopen ("php://stdin","r");	
	$myLine = fgets($handle);
	echo "OK\n";
	*/
	
	// prepare short vars
	$se_name = $line["se_name"];
	$no_name = $line["no_name"];
	$nodeid = $line["nodeid"];
	$no_gpslat = $line["no_gpslat"];
	$no_gpslng = $line["no_gpslng"];
	$ty_name = $line["ty_name"];
	$typeid = $line["typeid"];
	$ty_phenomenon = $line["ty_phenomenon"];
	$ty_uom = $line["ty_uom"];	
	
	$timestamp = " AND me_time > '2015-01-01 00:00:00' ";
	
	// crawl all measurements
	$SQL = "SELECT * FROM measurement WHERE me_sensorid = " . $line["id"] . " $timestamp ORDER BY me_time";	
	// $SQL = "SELECT * FROM measurement WHERE me_sensorid = " . $line["id"] . " ORDER BY me_time";
	
	$result_m = mysql_query($SQL);
	$numrows = mysql_num_rows($result_m);
	$numrecs = 50; // max 50 measurements per packet
	
	$i = 0;
	while ($m = mysql_fetch_array($result_m)) {		
		// prepare JSON for node
		if ($i % $numrecs == 0) {
			$JSON = '[{"node":{"id":"' . $nodeid . '","name":"' . $no_name . '","lat":' . $no_gpslat . ',"lng":' . $no_gpslng . ',';
			$JSON .= '"measurements":[';		
		};
		
		// prepare measurement short vars
		$timestamp_mysql = $m["me_time"];
		$value = $m["me_value"];
				
		
		// JSON - update
		// set missing parameters for JSON
		$se_name = $no_name . "-" . $ty_name;			
		$qts = str_replace(" ", "T", $timestamp_mysql) . ".000";
		
		$JSON .= '{"sensorid":"' . $se_name . '","value":' . $value . ',"timestamp":"' . $qts . '","type":{';
		$JSON .= '"id":"' . $typeid . '","name":"' . $ty_name . '","phenomenon":"' . $ty_phenomenon . '","UoM":"' . urlencode($ty_uom) . '"';
		$JSON .= '}}';
		
		$i++;
						
		// JSON end
		if (($i % $numrecs == 0) || ($i == $numrows)) {
			$JSON .= ']}}]';
			// echo $JSON;
			// push measurements
			// uncomment when this goes to production!
      $url = $miner["url"] . ":" . $miner["port"] . "/data/add-measurement-update?data=" . urlencode($JSON);
			echo getURL($url);			
		} else {
			// add a comma in JSON
			$JSON .= ",";	
		};

		
	}			
};		

?>
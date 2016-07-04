<?PHP
//---------------------------------------------------------------------
// FILE: config.inc.php
// AUTHOR: Klemen Kenda
// DESCRIPTION: Sensorfeed config file
// DATE: 16/12/2013
// HISTORY:
//---------------------------------------------------------------------

// mysql config -------------------------------------------------------
$mysql_user = "root";
$mysql_pass = "";
$mysql_host = "localhost";
$mysql_dbase = "forecast";

// miner API config ---------------------------------------------------
$miner["url"] = "http://localhost";
$miner["port"] = 9301;
$miner["stream_timeout"] = 20;
$miner["socket_timeout"] = 10;

?>
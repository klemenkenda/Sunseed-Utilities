<?PHP
//---------------------------------------------------------------------
// FILE: sql.inc.php
// AUTHOR: Klemen Kenda
// DESCRIPTION: mySQL inicialization & routines
// DATE: 01/07/2013
// HISTORY:
//--------------------------------------------------------------------- 

$link_mysql = mysql_connect($mysql_host,$mysql_user,$mysql_pass);
mysql_select_db($mysql_dbase);

function fetchOneLine($SQL, $field = "") {
	$result = mysql_query($SQL);
	if ($field == "") return mysql_fetch_array($result);
	else {
	  $line = mysql_fetch_array($result);
		return $line[$field];
	}
}

function fetchResult($SQL) {  
	$result = mysql_query($SQL);
}	

?>
<?PHP
// -----------------------------------------------------------------------------------
// FILE: httpd.inc.php
// AUTHOR: Klemen Kenda
// DATE: 10/10/2013
// DESCRIPTION: HTTP handling functions
// HISTORY: 
// -----------------------------------------------------------------------------------


//---------------------------------------------------------------------
// FUNCTION: getURL
// DESCRIPTION: complete a post request
//---------------------------------------------------------------------
function getURL ($url) {
  	//open connection
    $ch = curl_init();
    
    //set the url, number of POST vars, POST data
    curl_setopt($ch, CURLOPT_URL, $url);
	curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
	curl_setopt($ch, CURLOPT_HTTPHEADER, array(
		'Content-Type: application/x-www-form-urlencoded'));
	
	
	// $fields_string = urlencode($fields_string);
	//  print_r($fields_string);
	// exit();
	
    // curl_setopt($ch, CURLOPT_POST, count($fields));
	// curl_setopt($ch, CURLOPT_POST, 1);
    // curl_setopt($ch, CURLOPT_POSTFIELDS, $fields_string);
	curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10); 
	curl_setopt($ch, CURLOPT_TIMEOUT, 15); //timeout in seconds
	curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);	
		
	//execute post
    $html = curl_exec($ch);    
    
	if (curl_error($ch)) return -1;
		
    //close connection
    curl_close($ch);
	return $html;
}

//---------------------------------------------------------------------
// FUNCTION: getURLPost
// DESCRIPTION: complete a post request
//---------------------------------------------------------------------
function getURLPost ($url, $fields, $raw = 1) {
  	//url-ify the data for the POST
	$fields_string = $fields;
    if ($raw == 0) {
		$fields_string = "";
		foreach($fields as $key=>$value) { $fields_string .= $key.'='.$value.'&'; }
		$fields_string = rtrim($fields_string, '&');
	}
    
    //open connection
    $ch = curl_init();
    
    //set the url, number of POST vars, POST data
    curl_setopt($ch, CURLOPT_URL, $url);
	
	curl_setopt($ch, CURLOPT_HTTPHEADER, array(
		'Content-Type: application/x-www-form-urlencoded'));
	
	
	// $fields_string = urlencode($fields_string);
	//  print_r($fields_string);
	// exit();
	
    
    curl_setopt($ch, CURLOPT_POST, count($fields));
	// curl_setopt($ch, CURLOPT_POST, 1);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $fields_string);    
	curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 15); 
	curl_setopt($ch, CURLOPT_TIMEOUT, 45); //timeout in seconds
	curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);	
		
	//execute post
    $html = curl_exec($ch);    
    
	if (curl_error($ch)) return -1;
		
    //close connection
    curl_close($ch);
	return $html;
}

?>
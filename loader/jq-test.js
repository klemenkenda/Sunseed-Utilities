var jsonfile = require("jsonfile");
var jsonQuery = require("json-query");

//{
//id: '007044490', l
//{
//id: '007044490', l
//{
//id: '007012254', l
//{
//id: '007000861', l
//{
//id: '007000841', l
//{
//id: '007000841', l

var nodes = jsonfile.readFileSync("nodes.json");

// var nodes = { "nodes": nodes };

result = jsonQuery("[id=007000841]", { data: nodes });

if (result.value != null) console.log(result.value.lat);
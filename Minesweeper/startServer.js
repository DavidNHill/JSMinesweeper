/**
 *   This contains the communications code
 */

"use strict";

const http = require('http'); // Import Node.js core module
const path = require('path');
const express = require('express');

// creating an link to the minesweeper game logic (this logic is intended to be used by the server or the client)
var minesweeperLogic = require('./client/MineSweeperGame');

const server = express();
server.use(express.static(path.join(__dirname, 'client')));
server.use(express.json());

// setup the heart beat logic to run regularily (interval in milliseconds)
setInterval(minesweeperLogic.heartbeat, 60000);

// a main site then send the html home page
server.get('/', function (req, res) {

    console.log("New client attaching");

    console.log('Sending web page from ' + path.join(__dirname, 'index.html'));
	
    res.sendFile(path.join(__dirname, 'index.html'));
});

// used to request a new game id. It may or may not be used.
server.get('/requestID', function (req, res) {
	
	console.log('Request for game id received');
	
	var reply = minesweeperLogic.getNextGameID();
	
    console.log("==> " + JSON.stringify(reply));
	
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.write(JSON.stringify(reply));  
    res.end();
    
});

//used to send the actions and their consequences
server.post('/kill', function (req, res) {
	
	console.log('kill request received ');
	
	var message = req.body;
	
	console.log("<== " + JSON.stringify(message));
	
	var reply = minesweeperLogic.killGame(message);
	
	console.log("==> " + JSON.stringify(reply));
	
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.write(JSON.stringify(reply));  
    res.end();
    
});

// used to send the actions and their consequences
server.post('/data', function (req, res) {
	
	console.log('Data request received ');
	
	var message = req.body;
	
	console.log("<== " + JSON.stringify(message));
	
	var reply = minesweeperLogic.handleActions(message);

	if (reply == null) {
		console.log("No reply returned from handle actions method");
	}
	
	console.log("==> " + JSON.stringify(reply));
	
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.write(JSON.stringify(reply));  
    res.end();
    
});


// start up the server
http.createServer(server).listen(5000, function(){
    console.log('HTTP server listening on port 5000');
});


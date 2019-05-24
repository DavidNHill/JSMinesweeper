/**
 *   server code
 */

"use strict";

const http = require('http'); // Import Node.js core module
const path = require('path');
const express = require('express');

var tools = require('./MineSweeperLogic');

const server = express();
server.use(express.static(path.join(__dirname, 'client')));
server.use(express.json());

setInterval(heartbeat, 60000);


var gameID = 123;

// a main site then send the html home page
server.get('/', function (req, res) {
	
	console.log('Sending web page');
	
    res.sendFile(path.join(__dirname, 'index.html'));
});

// used to request a new game id. It may or may not be used.
server.get('/requestID', function (req, res) {
	
	console.log('Request for game id received');
	
	gameID++;
	
	var reply = {"id" : gameID};
	
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
	
	var id = message.id;

	var reply = {"result" : 0 };
	
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
	
	var reply = handleActions(message);

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
    console.log(tools.getString());
});


// a function which runs periodically to tidy stuff up
function heartbeat() {
	
	console.log("heartbeat starting...");

    for (var i = 0; i < games.length; i++) {

        var game = games[i];

        console.log("Game " + game.id + " created " + game.created + " last action " + game.lastAction + "Tiles left " + game.tiles_left);

    }

	
	console.log("...heartbeat ending");
}


/**
 * Below here is the Minesweeper game state logic
 */

// this holds the games being played
var games = [];


// read the data message and perform the actions
function handleActions(message) {
	
	var header = message.header;
	
	if (header == null) {
		console.log("Header is missing");
		return;
	}


	var reply = {"header" : {}, "tiles" : []};

    reply.header.id = header.id;   // reply with the same game id
	
	var actions = message.actions;

	if (actions == null) {
        reply.header.status = "in-play";
 		return reply;
	}
	
	var game = getGame(header.id);
	
	if (game == null) {
		game = createGame(header, actions[0].index);
	}
	
	// process each action sent
	for (var i = 0; i < actions.length; i++) {
		var action = actions[i];
		
		var tile = game.getTile(action.index);  
		
		if (action.action == 1) {  // click tile
			var revealedTiles = game.clickTile(tile);

			// get all the tiles revealed by this click
			for (var j=0; j < revealedTiles.tiles.length; j++) {
				reply.tiles.push(revealedTiles.tiles[j]);   // add each of the results of clicking to the reply
			}

			reply.header.status = revealedTiles.header.status;
			
		} else if (action.action == 2) {  // toggle flag
			tile.toggleFlag();
			reply.header.status = "in-play";
			reply.tiles.push({"action" : 2, "index" : action.index, "flag" : tile.isFlagged()});    // set or remove flag
			
		} else if (action.action == 3) {  // chord
			var revealedTiles = game.chordTile(tile);

			// get all the tiles revealed by this chording
			for (var j=0; j < revealedTiles.tiles.length; j++) {
				reply.tiles.push(revealedTiles.tiles[j]);   // add each of the results of chording to the reply
			}
			
			reply.header.status = revealedTiles.header.status;
			
		} else {
			console.log("Invalid action received: " + action.action);
		}		  
		  
		if (reply.header.status != "in-play") {
			console.log("status is now: " + reply.header.status);
			break;
		}
	}

    // if we have lost then return the location of all unflagged mines
    if (reply.header.status == "lost") {

        for (var i = 0; i < game.tiles.length; i++) {

            var tile = game.tiles[i];

            if (!tile.isFlagged() && tile.isBomb()) {
                reply.tiles.push({ "action": 3, "index": tile.getIndex() });    // mine
            }


        }


    }


	return reply;
}

function getGame(id) {
	
	for (var i=0; i < games.length; i++) {
		if (games[i].getID() == id ) {
			return games[i];
		}
	}
	
	return;
	
}

function createGame(header, index) {
	
	var game = new Game(header.id, header.width, header.height, header.mines, index);
	
	games.push(game);
	
	console.log("Holding " + games.length + " games in memory");
	
	return game;
	
}


/**
 * This describes a game of minesweeper
 */
class Game {
	
	constructor(id, width, height, num_bombs, index) {
		
		console.log("Creating a new game with id=" + id + " ...");

        this.created = new Date();
        this.lastAction = this.created;

		this.id = id;
		this.width = width;
		this.height = height;
		this.num_bombs = num_bombs;
		this.tiles = [];
		this.started = false;

		this.tiles_left = this.width * this.height - this.num_bombs;
		
		// create adjacent offsets
		this.adj_offset = [];
		this.adj_offset[0] =  - width - 1;
		this.adj_offset[1] =  - width;
		this.adj_offset[2] =  - width + 1;
		this.adj_offset[3] =  - 1;
		this.adj_offset[4] =  1;
		this.adj_offset[5] =  + width - 1;
		this.adj_offset[6] =  + width;
		this.adj_offset[7] =  + width + 1;
		
		// hold the tiles to exclude from being a mine 
		var exclude = {};
		exclude[index] = true;
		
		this.init_tiles(exclude);

		console.log("... game created");

	}

	getID() {
		return this.id;
	}
	
	getTile(index) {
		return this.tiles[index];
	}
	
	// clicks the assigned tile and returns an object containing a list of tiles cleared
	clickTile(tile) {
		
		var reply = {"header" : {}, "tiles" : []};
		
		if (tile.isBomb()) {
			
			reply.header.status = "lost";
			//reply.tiles.push({"action" : 3, "index" : tile.getIndex()});    // mine

        } else {
            if (tile.isCovered()) {    // make sure the tile is clickable
                var tilesToReveal = [];
                tilesToReveal.push(tile);
                return this.reveal(tilesToReveal);
            }
		}
		
		return reply;
		
		
	}
	
	// clicks the assigned tile and returns an object containing a list of tiles cleared
	chordTile(tile) {
		
		var reply = {"header" : {}, "tiles" : []};
		
		var adjTiles = this.getAdjacent(tile);
		
		var flagCount = 0;
		for (var adjTile of this.getAdjacent(tile)) {
			if (adjTile.isFlagged()) {
				flagCount++;
			}
		}

		// nothing to do if the tile is not yet surrounded by the correct number of flags
		if (tile.getValue() != flagCount) {
			console.log("Unable to Chord:  value=" + tile.getValue() + " flags=" + flagCount);
			reply.header.status = "in-play";
			return reply;
		}
		
		// see if there are any unflagged bombs 
		var bombCount = 0;
		for (var adjTile of this.getAdjacent(tile)) {
			if (adjTile.isBomb() && !adjTile.isFlagged()) {
				bombCount++;
				//reply.tiles.push({"action" : 3, "index" : adjTile.getIndex()});    // mine
			}
		}
		
		// if we have triggered a bomb then return
		if (bombCount != 0) {
			reply.header.status = "lost";
			return reply;
		}
		
		var tilesToReveal = [];
		
		// determine which tiles need revealing 
		for (var adjTile of this.getAdjacent(tile)) {
			if (adjTile.isCovered() && !adjTile.isFlagged()) {  // covered and not flagged
				tilesToReveal.push(adjTile);
			}
		}

		return this.reveal(tilesToReveal);
		
		
	}
	
	reveal(firstTiles) {
		
		var toReveal = [];
		var soFar = 0;
		
		var result = {"header" : {}, "tiles" : []};
		
		for (var firstTile of firstTiles) {
			firstTile.setNotCovered(); 
			toReveal.push(firstTile);			
		}
		
		var safety = 100000;
		
		while (soFar < toReveal.length) {
			
			var tile = toReveal[soFar];

			result.tiles.push({"action" : 1, "index" : tile.getIndex(), "value" : tile.getValue()});   		
			this.tiles_left--;
			
			// if the value is zero then for each adjacent tile not yet revealed add it to the list
			if (tile.getValue() == 0) {
				
				for (var adjTile of this.getAdjacent(tile)) {
					
					if (adjTile.isCovered() && !adjTile.isFlagged()) {  // if not covered and not a flag
						adjTile.setNotCovered();  // it will be uncovered in a bit
						toReveal.push(adjTile);
					}
				}
				
			}

			soFar++;
			if (safety-- < 0) {
				console.log("Safety limit reached !!");
				break;
			}
			
		}
		
		if (this.tiles_left == 0) {
			for (var i=0; i < this.tiles.length; i++) {
				var tile = this.tiles[i];
				if (tile.isBomb() && !tile.isFlagged()) {
					tile.toggleFlag();
					result.tiles.push({"action" : 2, "index" : i, "flag" : tile.isFlagged()});    // auto set remaining flags
				}
			}
			
			result.header.status = "won";
		} else {
			result.header.status = "in-play";
		}
		
		
		return result;
	}
	
	// builds all the tiles and assigns bombs to them
	init_tiles(to_exclude) {
		
		// create the tiles
		var indices = [];
		for (var i = 0; i < this.width * this.height; i++) {
			
			this.tiles.push(new Tile(i));
			
			if (!to_exclude[i]) {
				indices.push(i);
			}
		}
		shuffle(indices);
		
		// allocate the bombs and calculate the values
		for (var i = 0; i < this.num_bombs; i++) {
			var index = indices[i];
			var tile = this.tiles[index];
			
			tile.make_bomb();
			for (var tile of this.getAdjacent(tile)) {
				tile.value += 1;
			}
		}
		
		console.log(this.tiles.length + " tiles added to board");
	}
	
	
	// returns all the tiles adjacent to this tile
	getAdjacent(tile) {
		
		var index = tile.getIndex();
		
		var col = index % this.width;
		var row = Math.floor(index / this.width);

		var first_row = Math.max(0, row - 1);
		var last_row = Math.min(this.height - 1, row + 1);

		var first_col = Math.max(0, col - 1);
		var last_col = Math.min(this.width - 1, col + 1);

		var result = []

		for (var r = first_row; r <= last_row; r++) {
			for (var c = first_col; c <= last_col; c++) {
				var i = this.width * r + c;
				if (i != index) {
					result.push(this.tiles[i]);
				}
			}
		}

		return result;
	}
	
} 

/**
 * Describes a single tile on a minesweeper board
 */

class Tile {
	constructor(index) {
		this.index = index
		this.is_covered = true;
		this.value = 0;
		this.is_flagged = false;
		this.is_bomb = false;
	}

	//reveal() {
	//	this.is_covered = false;
	//}

	getIndex() {
		return this.index;
	}
	
	isCovered() {
		return this.is_covered;
	}
	
	setNotCovered() {
		this.is_covered = false;
	}
	
	getValue() {
		return this.value;
	}
	
	// toggle the flag value
	toggleFlag() {
		
		// if the tile is uncovered then we can't put a flag here
		if (!this.is_covered) {
			this.is_flagged = false;
			return;
		}
		
		this.is_flagged = !this.is_flagged;
	}
	
	isFlagged() {
		return this.is_flagged;
	}

	make_bomb() {
		this.is_bomb = true;
	}
	
	isBomb() {
		return this.is_bomb;
	}

}



// used to shuffle an array
function shuffle(a) {
    var j, x, i;
    for (i = a.length - 1; i > 0; i--) {
        j = Math.floor(Math.random() * (i + 1));
        x = a[i];
        a[i] = a[j];
        a[j] = x;
    }
    return a;
}
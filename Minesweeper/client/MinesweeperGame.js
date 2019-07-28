/**
 *   This module defines a game of minesweeper
 *   
 *   Intended to be used by the server or the client depending on how the solver is being run
 */

"use strict";

// Identifying which functions are exposed externally - only do this if we are in node.js
if (typeof module === "object" && module && typeof module.exports === "object") {
    module.exports = {
        heartbeat: function () {
            return heartbeat();
        },
        handleActions: function (message) {
            return handleActions(message);
        },
        getNextGameID: function () {
            return getNextGameID();
        },
        killGame: function (message) {
            return killGame(message);
        }
    }
}



const WON = "won";
const LOST = "lost";
const IN_PLAY = "in-play";

var gameID = 123;
var gamesWon = 0;
var gamesLost = 0;
var gamesAbandoned = 0;

// provides the next game id
function getNextGameID() {

    gameID++;

    var reply = { "id": gameID };

    return reply;

}


// a function which runs periodically to tidy stuff up
function heartbeat() {
	
	console.log("heartbeat starting...");

    for (var game of serverGames.values()) {

        //var game = games[i];

        var action;
        if (game.cleanUp) {
            action = "Being removed due to cleanUp flag";
            serverGames.delete(game.getID());
        } else {
            action = "No action";
        }
        
        console.log("Game " + game.id + " created " + game.created + " last action " + game.lastAction + "Tiles left " + game.tiles_left + " ==> " + action);
    }


    console.log("...heartbeat ending, " + serverGames.size + " games in memory");
}

// used to mark a game as no longer required
function killGame(message) {

    var id = message.id;

    var game = getGame(id);

    // if we found the game then mark for clean-up
    if (game != null) {
        console.log("Game " + id + " marked for housekeeping");
        game.cleanUp = true;
        return { "result": "okay" };
    } else {
        return { "result": "not found" };
    }

}

/**
 * Below here is the Minesweeper game state logic
 */

// this holds the games being played
var serverGames = new Map();


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
        reply.header.status = IN_PLAY;
 		return reply;
	}
	
	var game = getGame(header.id);
	
	if (game == null) {
		game = createGame(header, actions[0].index);
	}

    // send the seed to the client
    reply.header.seed = game.seed;

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
			reply.header.status = IN_PLAY;
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
		  
		if (reply.header.status != IN_PLAY) {
			console.log("status is now: " + reply.header.status);
			break;
		}
	}

    // if we have lost then return the location of all unflagged mines
    if (reply.header.status == LOST) {

        for (var i = 0; i < game.tiles.length; i++) {

            var tile = game.tiles[i];

            if (!tile.isFlagged() && tile.isBomb()) {
                if (tile.exploded) {
                    reply.tiles.push({ "action": 4, "index": tile.getIndex() });    // exploded mine
                } else {
                    reply.tiles.push({ "action": 3, "index": tile.getIndex() });    // unflagged mine
                }

            } else if (tile.isFlagged() && !tile.isBomb()) {
                reply.tiles.push({ "action": 5, "index": tile.getIndex() });    // wrongly flagged tile
            }

            game.cleanUp = true;  // mark for housekeeping
        }
    } else if (reply.header.status == WON) {
        game.cleanUp = true;  // mark for housekeeping
    }

	return reply;
}

function getGame(id) {

	return serverGames.get(id);
	
}

function createGame(header, index) {

    var seed;
    if (header.seed != null && header.seed != 0) {
        seed = header.seed;
    } else {
        seed = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
    }

	var game = new ServerGame(header.id, header.width, header.height, header.mines, index, seed, header.gametype);
	
	serverGames.set(header.id, game);
	
	console.log("Holding " + serverGames.size + " games in memory");
	
	return game;
	
}


/**
 * This describes a game of minesweeper
 */
class ServerGame {
	
	constructor(id, width, height, num_bombs, index, seed, gameType) {
		
		console.log("Creating a new game with id=" + id + " ...");

        this.created = new Date();
        this.lastAction = this.created;

        this.id = id;
        this.gameType = gameType;
		this.width = width;
		this.height = height;
        this.num_bombs = num_bombs;
        this.seed = seed;
        this.cleanUp = false;

        console.log("Using seed " + this.seed);

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

        if (this.gameType == "zero") {
            for (var adjIndex of this.getAdjacentIndex(index)) {
                exclude[adjIndex] = true;
            }
        }

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
		
        var reply = { "header": {}, "tiles": [] };

        // are we clicking on a mine
		if (tile.isBomb()) {
			
            reply.header.status = LOST;
            tile.exploded = true;
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
		
        var reply = { "header": {}, "tiles": [] };
 		
		//var adjTiles = this.getAdjacent(tile);
		
		var flagCount = 0;
		for (var adjTile of this.getAdjacent(tile)) {
			if (adjTile.isFlagged()) {
				flagCount++;
			}
		}

		// nothing to do if the tile is not yet surrounded by the correct number of flags
		if (tile.getValue() != flagCount) {
			console.log("Unable to Chord:  value=" + tile.getValue() + " flags=" + flagCount);
			reply.header.status = IN_PLAY;
			return reply;
		}
		
		// see if there are any unflagged bombs in the area to be chorded - this loses the game
		var bombCount = 0;
		for (var adjTile of this.getAdjacent(tile)) {
            if (adjTile.isBomb() && !adjTile.isFlagged()) {
                adjTile.exploded = true;
				bombCount++;
				//reply.tiles.push({"action" : 3, "index" : adjTile.getIndex()});    // mine
			}
		}
		
		// if we have triggered a bomb then return
		if (bombCount != 0) {
			reply.header.status = LOST;
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
		
        var reply = { "header": {}, "tiles": [] };
		
		for (var firstTile of firstTiles) {
			firstTile.setNotCovered(); 
			toReveal.push(firstTile);			
		}
		
		var safety = 100000;
		
		while (soFar < toReveal.length) {
			
			var tile = toReveal[soFar];

			reply.tiles.push({"action" : 1, "index" : tile.getIndex(), "value" : tile.getValue()});   		
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

        // if there are no tiles left to find then set the remaining tiles to flagged and we've won
		if (this.tiles_left == 0) {
			for (var i=0; i < this.tiles.length; i++) {
				var tile = this.tiles[i];
				if (tile.isBomb() && !tile.isFlagged()) {
					tile.toggleFlag();
					reply.tiles.push({"action" : 2, "index" : i, "flag" : tile.isFlagged()});    // auto set remaining flags
				}
			}
			
			reply.header.status = WON;
		} else {
			reply.header.status = IN_PLAY;
		}
		
		
		return reply;
	}
	
	// builds all the tiles and assigns bombs to them
	init_tiles(to_exclude) {
		
		// create the tiles
		var indices = [];
		for (var i = 0; i < this.width * this.height; i++) {
			
			this.tiles.push(new ServerTile(i));
			
			if (!to_exclude[i]) {
				indices.push(i);
			}
        }

        var rng = JSF(this.seed);  // create an RNG based on the seed

		shuffle(indices,rng);
		
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

    // returns all the tiles adjacent to this tile
    getAdjacentIndex(index) {

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
                    result.push(i);
                }
            }
        }

        return result;
    }

} 

/**
 * Describes a single tile on a minesweeper board
 */

class ServerTile {
	constructor(index) {
		this.index = index
		this.is_covered = true;
		this.value = 0;
        this.is_flagged = false;
        this.exploded = false;
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
function shuffle(a, rng) {
    var j, x, i;
    for (i = a.length - 1; i > 0; i--) {
        j = Math.floor(rng() * (i + 1));
        //j = Math.floor(Math.random() * (i + 1));
        x = a[i];
        a[i] = a[j];
        a[j] = x;
    }
    return a;
}

// a RNG which allows a seed
function JSF(seed) {
    function jsf() {
        var e = s[0] - (s[1] << 27 | s[1] >>> 5);
        s[0] = s[1] ^ (s[2] << 17 | s[2] >>> 15),
            s[1] = s[2] + s[3],
            s[2] = s[3] + e, s[3] = s[0] + e;
        return (s[3] >>> 0) / 4294967296; // 2^32
    }
    seed >>>= 0;
    var s = [0xf1ea5eed, seed, seed, seed];
    for (var i = 0; i < 20; i++) jsf();
    return jsf;
}
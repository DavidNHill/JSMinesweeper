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

const ACTION_CLEAR = 1;
const ACTION_FLAG = 2;
const ACTION_CHORD = 3;

const WON = "won";
const LOST = "lost";
const IN_PLAY = "in-play";

var gameID = 123;
var gamesWon = 0;
var gamesLost = 0;
var gamesAbandoned = 0;

const FIND_3BV = 1;     // 1 for high 3BV, -1 for low
const FIND_3BV_CYCLES = 0;

// provides the next game id
function getNextGameID() {

    gameID++;

    var reply = { "id": gameID };

    return reply;

}

// copies a previously played game
function copyGame(id) {

	console.log("Replaying game " + id);

	var game = getGame(id);

	if (game == null) {
		console.log("Game " + id + " not found");

		return getNextGameID();
	}

	game.reset();

	var reply = {};
	reply.id = game.getID();

	return reply;

}

function createGameFromMFB(blob) {

	var width = blob[0];
	var height = blob[1];
	var mines = blob[2] * 256 + blob[3];

	var id = gameID++;

	var game = new ServerGame(id, width, height, mines, 0, 0, "safe");

	game.resetMines(blob);
	game.generateMbfUrl();

	serverGames.set(id, game);

	var reply = {};
	reply.id = id;

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
		// need to revoke the url at some point
		if (game.url != null) {
			window.URL.revokeObjectURL(game.url);
        }

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
		//game = await createNoGuessGame(header, actions[0].index);
	}

    // send the game details to the client
	reply.header.seed = game.seed;
	reply.header.gameType = game.gameType;
	reply.header.width = game.width;
	reply.header.height = game.height;
	reply.header.mines = game.num_bombs;
	reply.header.startIndex = game.startIndex;

	if (game.url != null) {
		reply.header.url = game.url;
	}

	// process each action sent
	for (var i = 0; i < actions.length; i++) {
		var action = actions[i];
		
		var tile = game.getTile(action.index);  
		
		if (action.action == ACTION_CLEAR) {  // click tile
			var revealedTiles = game.clickTile(tile);

			// get all the tiles revealed by this click
			for (var j=0; j < revealedTiles.tiles.length; j++) {
				reply.tiles.push(revealedTiles.tiles[j]);   // add each of the results of clicking to the reply
			}

			reply.header.status = revealedTiles.header.status;
			reply.header.actions = game.actions;
			
		} else if (action.action == ACTION_FLAG) {  // toggle flag

			game.flag(tile);

			//tile.toggleFlag();
			reply.header.status = IN_PLAY;
			reply.header.actions = game.actions;
			reply.tiles.push({"action" : 2, "index" : action.index, "flag" : tile.isFlagged()});    // set or remove flag

		} else if (action.action == ACTION_CHORD) {  // chord
			var revealedTiles = game.chordTile(tile);

			// get all the tiles revealed by this chording
			for (var j=0; j < revealedTiles.tiles.length; j++) {
				reply.tiles.push(revealedTiles.tiles[j]);   // add each of the results of chording to the reply
			}
			
			reply.header.status = revealedTiles.header.status;
			reply.header.actions = game.actions;
			
		} else {
			console.log("Invalid action received: " + action.action);
		}		  
		  
		if (reply.header.status != IN_PLAY) {
			//console.log("Tile " + tile.getIndex());
			console.log("status is now: " + reply.header.status);
			break;
		}
	}

    // if we have lost then return the location of all unflagged mines
    if (reply.header.status == LOST) {

		reply.header.value3BV = game.value3BV;

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

        }
        game.cleanUp = true;  // mark for housekeeping
	} else if (reply.header.status == WON) {

		reply.header.value3BV = game.value3BV;
        game.cleanUp = true;  // mark for housekeeping
    }

	return reply;
}

function getGame(id) {

	return serverGames.get(id);
	
}

function createGame(header, index) {

	var cycles;
    var seed;
    if (header.seed != null && header.seed != 0) {
		seed = header.seed;
		cycles = 0;
    } else {
		seed = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
		cycles = FIND_3BV_CYCLES - 1;
    }

	var game = new ServerGame(header.id, header.width, header.height, header.mines, index, seed, header.gametype);

	while (cycles > 0) {
		seed = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
		var tryGame = new ServerGame(header.id, header.width, header.height, header.mines, index, seed, header.gametype);
		if (FIND_3BV * tryGame.value3BV > FIND_3BV * game.value3BV) {
			game = tryGame;
		}
		cycles--;
    }

	game.generateMbfUrl();

	serverGames.set(header.id, game);
	
	console.log("Holding " + serverGames.size + " games in memory");
	
	return game;
	
}

async function createNoGuessGame(header, index) {

	var won = false;
	var loopCheck = 0;
	//var bestSeed;
	var minTilesLeft = Number.MAX_SAFE_INTEGER;
	var maxLoops = 10000;

	var options = {};
	options.playStyle = PLAY_STYLE_NOFLAGS;
	options.verbose = false;
	options.advancedGuessing = false;


	while (!won && loopCheck < maxLoops) {

		var seed = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);

		var game = new ServerGame(header.id, header.width, header.height, header.mines, index, seed, "zero");

		var board = new Board(header.id, header.width, header.height, header.mines, seed, "zero");

		var tile = game.getTile(index);

		var revealedTiles = game.clickTile(tile);
		applyResults(board, revealedTiles);

		var guessed = false;
		while (revealedTiles.header.status == IN_PLAY && loopCheck < maxLoops && !guessed) {

			var reply = await solver(board, options);  // look for solutions

			var fillers = reply.fillers;
			for (var i = 0; i < fillers.length; i++) {

				var filler = fillers[i];

				revealedTiles = game.fix(filler);

				applyResults(board, revealedTiles);

            }

			if (fillers.length > 0) {
				var actions = [];
				console.log("tiles left " + game.tilesLeft);
			} else {
				var actions = reply.actions;
            }

			for (var i = 0; i < actions.length; i++) {

				var action = actions[i];

				if (action.action == ACTION_CHORD) {
					console.log("Got a chord request!");

				} else if (action.action == ACTION_FLAG) {   // zero safe probability == mine
					console.log("Got a flag request!");

				} else {   // otherwise we're trying to clear

					if (action.prob != 1) {  // do no more actions after a guess
						guessed = true;
						break;
					}

					tile = game.getTile(board.xy_to_index(action.x, action.y));

					revealedTiles = game.clickTile(tile);

					if (revealedTiles.header.status != IN_PLAY) {  // if won or lost nothing more to do
						break;
					}

					applyResults(board, revealedTiles);

					//if (action.prob != 1) {  // do no more actions after a guess
					//	break;
					//}
				}
			}

			loopCheck++;

		}

		console.log("Seed " + seed + " tiles left " + game.tilesLeft);
		if (game.tilesLeft < minTilesLeft) {
			minTilesLeft = game.tilesLeft;
			//bestSeed = seed;
        }

		if (revealedTiles.header.status == WON) {
			won = true;
        }

    }

	console.log(revealedTiles.header.status);

	// rebuild the same game and send it back
	//game = new ServerGame(header.id, header.width, header.height, header.mines, index, bestSeed, "zero");
	game.reset();

	game.generateMbfUrl();
	serverGames.set(header.id, game);

	return game;

}

function applyResults(board, revealedTiles) {

	//console.log("Tiles to reveal " + revealedTiles.tiles.length);
	//console.log(revealedTiles);

	// apply the changes to the logical board
	for (var i = 0; i < revealedTiles.tiles.length; i++) {

		var target = revealedTiles.tiles[i];

		var index = target.index;
		var action = target.action;

		var tile = board.getTile(index);

		if (action == 1) {    // reveal value on tile
			tile.setValue(target.value);
			//console.log("Setting Tile " + target.index + " to " + target.value);

		} else if (action == 2) {  // add or remove flag
			if (target.flag != tile.isFlagged()) {
				tile.toggleFlag();
				if (tile.isFlagged()) {
					board.bombs_left--;
				} else {
					board.bombs_left++;
				}
			}

		} else if (action == 3) {  // a tile which is a mine (these get returned when the game is lost)
			board.setGameLost();
			tile.setBomb(true);

		} else if (action == 4) {  // a tile which is a mine and is the cause of losing the game
			board.setGameLost();
			tile.setBombExploded();

		} else if (action == 5) {  // a which is flagged but shouldn't be
			tile.setBomb(false);

		} else {
			console.log("action " + action + " is not valid");
		}

	}


}


/**
 * This describes a game of minesweeper
 */
class ServerGame {
	
	constructor(id, width, height, num_bombs, index, seed, gameType) {
		
		//console.log("Creating a new game with id=" + id + " ...");

        this.created = new Date();
        this.lastAction = this.created;

        this.id = id;
        this.gameType = gameType;
		this.width = width;
		this.height = height;
        this.num_bombs = num_bombs;
        this.seed = seed;
		this.cleanUp = false;
		this.actions = 0;
		this.startIndex = index;

        //console.log("Using seed " + this.seed);

		this.tiles = [];
		this.started = false;

		this.tilesLeft = this.width * this.height - this.num_bombs;
		
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
		var excludeCount = 1;

		if (this.gameType == "zero") {
            for (var adjIndex of this.getAdjacentIndex(index)) {
				exclude[adjIndex] = true;
				excludeCount++;
            }
        }

		if (this.width * this.height - excludeCount < this.num_bombs) {
			this.num_bombs = this.width * this.height - excludeCount;
			console.log("WARN: Too many mines to be placed! Reducing mine count to " + this.num_bombs);
        }

		this.init_tiles(exclude);

		this.value3BV = this.calculate3BV();

		//console.log("... game created");

	}

	reset() {

		this.cleanUp = false;
		this.actions = 0;
		this.started = false;
		this.tilesLeft = this.width * this.height - this.num_bombs;

		for (var i = 0; i < this.tiles.length; i++) {
			var tile = this.tiles[i];
			tile.reset();
		}

		// this is used by the NG processing and because mines have been moved
		// the 3BV needs to be recalculated
		this.value3BV = this.calculate3BV();

    }

	resetMines(blob) {

		// reset every tile and it isn't a bomb
		for (var i = 0; i < this.tiles.length; i++) {
			var tile = this.tiles[i];
			tile.reset();
			tile.is_bomb = false;
			tile.value = 0;
		}

		var index = 4;

		// set the tiles in the mbf to mines
		while (index < blob.length) {
			var i = blob[index + 1] * this.width + blob[index];

			var tile = this.tiles[i];

			tile.make_bomb();
			for (var adjTile of this.getAdjacent(tile)) {
				adjTile.value += 1;
			}

			index = index + 2;
        }

		this.value3BV = this.calculate3BV();
		this.url = this.getFormatMBF();

    }

	getID() {
		return this.id;
	}
	
	getTile(index) {
		return this.tiles[index];
	}

	// toggles the flag on a tile
	flag(tile) {

		this.actions++;
		tile.toggleFlag();

    }

	// clicks the assigned tile and returns an object containing a list of tiles cleared
	clickTile(tile) {
		
        var reply = { "header": {}, "tiles": [] };

        // are we clicking on a mine
		if (tile.isBomb()) {
			this.actions++;

            reply.header.status = LOST;
            tile.exploded = true;
			//reply.tiles.push({"action" : 3, "index" : tile.getIndex()});    // mine

        } else {
			if (tile.isCovered() && !tile.isFlagged()) {    // make sure the tile is clickable
				this.actions++;

				var tilesToReveal = [];
				tilesToReveal.push(tile);
				return this.reveal(tilesToReveal);
			} else {
				reply.header.status = IN_PLAY;
            }
		}
		
		return reply;
		
		
	}
	
	// clicks the tiles adjacent to the assigned tile and returns an object containing a list of tiles cleared
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
			this.actions++;

			reply.header.status = LOST;
			return reply;
		}
		
		var tilesToReveal = [];

		this.actions++;

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
			this.tilesLeft--;
			
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
		if (this.tilesLeft == 0) {
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

	// fix modify the mines around this withness to make it a safe move
	fix(filler) {

		var reply = { "header": {}, "tiles": [] };
		reply.header.status = IN_PLAY;

		var tile = this.getTile(filler.index);


		if (filler.fill) {

			if (!tile.is_bomb) {  // if filling and not a bomb add a bomb
				tile.make_bomb();
				this.num_bombs++;
				for (var adjTile1 of this.getAdjacent(tile)) {
					adjTile1.value += 1;
					if (!adjTile1.isCovered()) {
						reply.tiles.push({ "action": 1, "index": adjTile1.getIndex(), "value": adjTile1.getValue() });
					}
				}
			}

		} else {

			if (tile.is_bomb) {  // if emptying and is a bomb - remove it
				tile.is_bomb = false;
				this.num_bombs--;
				for (var adjTile1 of this.getAdjacent(tile)) {
					adjTile1.value -= 1;
					if (!adjTile1.isCovered()) {
						reply.tiles.push({ "action": 1, "index": adjTile1.getIndex(), "value": adjTile1.getValue() });
					}
				}
			}

        }


		console.log(reply);

		return reply;
    }


	// auto play chords
	checkAuto(tile, reply) {

		return false;

		var flagCount = 0;
		var covered = 0;
		for (var adjTile of this.getAdjacent(tile)) {
			if (adjTile.isFlagged()) {
				flagCount++;
			} else if (adjTile.isCovered()) {
				covered++;
            }
		}

		// can be chorded
		if (tile.getValue() == flagCount) {
			return true;
		}

		// all covered tiles are flags
		if (tile.getValue() == flagCount + covered) {
			for (var adjTile of this.getAdjacent(tile)) {
				if (adjTile.isFlagged()) {
				} else if (adjTile.isCovered()) {
					this.flag(adjTile);
					reply.tiles.push({ "action": 2, "index": adjTile.getIndex(), "flag": adjTile.isFlagged() });
				}
			}
        }


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
			for (var adjTile of this.getAdjacent(tile)) {
				adjTile.value += 1;
			}
		}
		
		//console.log(this.tiles.length + " tiles added to board");
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

	calculate3BV() {

		var value3BV = 0;

		for (var i = 0; i < this.tiles.length; i++) {
			var tile = this.tiles[i];

			if (!tile.used3BV && !tile.isBomb() && tile.getValue() == 0) {

				value3BV++;
				tile.used3BV = true;

				var toReveal = [tile];
				var soFar = 0;

				var safety = 100000;

				while (soFar < toReveal.length) {

					var tile1 = toReveal[soFar];

					// if the value is zero then for each adjacent tile not yet revealed add it to the list
					if (tile1.getValue() == 0) {

						for (var adjTile of this.getAdjacent(tile1)) {

							if (!adjTile.used3BV) {

								adjTile.used3BV = true;

								if (!adjTile.isBomb() && adjTile.getValue() == 0) {  // if also a zero add to ties to be exploded
									toReveal.push(adjTile);
								}
                            }
						}
					}

					soFar++;
					if (safety-- < 0) {
						console.log("Safety limit reached !!");
						break;
					}
				}
            }
		}

		for (var i = 0; i < this.tiles.length; i++) {
			var tile = this.tiles[i];
			if (!tile.isBomb() && !tile.used3BV) {
				value3BV++;
            }

		}

		//console.log("3BV is " + value3BV);

		return value3BV;
	}

	generateMbfUrl() {

		// revoke the previous url
		if (this.url != null) {
			window.URL.revokeObjectURL(this.url);
		}

		this.url = this.getFormatMBF();
    }

	getFormatMBF() {

		if (this.width > 255 || this.height > 255) {
			console.log("Board to large to save as MBF format");
			return null;
		}

		var length = 4 + 2 * this.num_bombs;

		var mbf = new ArrayBuffer(length);
		var mbfView = new Uint8Array(mbf);

		mbfView[0] = this.width;
		mbfView[1] = this.height;

		mbfView[2] = Math.floor(this.num_bombs / 256);
		mbfView[3] = this.num_bombs % 256;

		var minesFound = 0;
		var index = 4;
		for (var i = 0; i < this.tiles.length; i++) {

			var tile = this.getTile(i);
			var x = i % this.width;
			var y = Math.floor(i / this.width);

			if (tile.isBomb()) {
				minesFound++;
				if (index < length) {
					mbfView[index++] = x;
					mbfView[index++] = y;
				}
			}
		}

		if (minesFound != this.num_bombs) {
			console.log("Board has incorrect number of mines. board=" + this.num_bombs + ", found=" + minesFound);
			return null;
		}

		console.log(...mbfView);

		var blob = new Blob([mbf], { type: 'application/octet-stream' })

		var url = URL.createObjectURL(blob);

		console.log(url);

		return url;

	}

	getGameDescription() {

		return new gameDescription(this.seed, this.gameType, this.width, this.height, this.mines, this.startIndex, this.actions);

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
		this.used3BV = false;
	}

	reset() {
		this.is_covered = true;
		this.is_flagged = false;
		this.exploded = false;
		this.used3BV = false;
	}

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

class gameDescription {

	constructor(seed, gameType, width, height, mines, index, actions) {

		console.log("Creating a new game state with");

		this.seed = seed;
		this.gameType = gameType;
		this.width = width;
		this.height = height;
		this.mines = mines;
		this.index = index;
		this.actions = actions;
	}

}

// used to shuffle an array
function shuffle(a, rng) {
    var j, x, i;
    for (i = a.length - 1; i > 0; i--) {
		j = Math.floor(rng() * (i + 1));
		//console.log(j);
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
		//console.log(e + " " + s[0] + " " + s[1] + " " + s[2] + " " + s[3]);
        return (s[3] >>> 0) / 4294967296; // 2^32
	}
	var seed1 = Math.floor(seed / 4294967296);
	seed >>>= 0;
	//console.log(seed + " " + seed1);
	if (oldrng) {
		var s = [0xf1ea5eed, seed, seed, seed];
	} else {
		var s = [0xf1ea5eed, seed, seed1, seed];
    }

    for (var i = 0; i < 20; i++) jsf();
    return jsf;
}
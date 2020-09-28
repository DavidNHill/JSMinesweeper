/**
 * 
 */
"use strict";

class Board {
	
	constructor(id, width, height, num_bombs, seed, gameType) {
		
		//console.log("Creating a new board with id=" + id + " ...");

		this.MAX = 4294967295;

        this.id = id;
        this.gameType = gameType;
		this.width = width;
		this.height = height;
        this.num_bombs = num_bombs;
        this.seed = seed;

		this.tiles = [];
		this.started = false;
		this.bombs_left = this.num_bombs;
		//this.tiles_left = this.width * this.height - this.num_bombs;
		this.init_tiles();

		this.gameover = false;
		this.won = false;

		this.highDensity = false;

		//console.log("... board created");

	}

	isStarted() {
		return this.started;
	}
	
	setGameLost() {
		this.gameover = true;
	}

    setGameWon() {
        this.gameover = true;
        this.won = true;
    }

	isGameover() {
		return this.gameover;
	}
	
	
	getID() {
		return this.id;
	}
	
	setStarted() {
		
		if (this.start) {
			console.log("Logic error: starting the same game twice");
			return;
		}
		
		this.started = true;
	}

	setHighDensity(tilesLeft, minesLeft) {

		if (minesLeft * 5 > tilesLeft * 2) {
			this.highDensity = true;
		} else {
			this.highDensity = false;
        }

    }

	isHighDensity() {
		return this.highDensity;
    }

	xy_to_index(x, y) {
		return y*this.width + x;
	}
	
	getTileXY(x, y) {
		
		var index = this.xy_to_index(x,y);
		
		//console.log("X=" + x + ", Y=" + y + " gives index=" + index);
		
		return this.tiles[index];
		
	}
	
	getTile(index) {
		
		return this.tiles[index];
		
	}
	
	// true if number of flags == tiles value
	// and number of unrevealed > 0
	canChord(tile) {
		
		var flagCount = 0;
		var coveredCount = 0;		
		for (var adjTile of this.getAdjacent(tile)) {
			if (adjTile.isFlagged()) {  
				flagCount++;
			}
			if (adjTile.isCovered() && !adjTile.isFlagged()) {  
				coveredCount++;
			}
		}
		
		return (flagCount == tile.getValue()) && (coveredCount > 0);
		
	}

    // return number of confirmed mines adjacent to this tile
    adjacentFlagsCount(tile) {

        var mineCount = 0;
        for (var adjTile of this.getAdjacent(tile)) {
			//if (adjTile.isFlagged()) {
			if (adjTile.isSolverFoundBomb()) {
                mineCount++;
            }
        }

        return mineCount;

    }

	// return number of flags adjacent to this tile
	adjacentFlagsPlaced(tile) {

		var flagCount = 0;
		for (var adjTile of this.getAdjacent(tile)) {
			if (adjTile.isFlagged()) {
				flagCount++;
			}
		}

		return flagCount;

	}

    // return number of covered tiles adjacent to this tile
    adjacentCoveredCount(tile) {

        var coveredCount = 0;
        for (var adjTile of this.getAdjacent(tile)) {
			//if (adjTile.isCovered() && !adjTile.isFlagged()) {
			if (adjTile.isCovered() && !adjTile.isSolverFoundBomb()) {
                coveredCount++;
            }
        }

        return coveredCount;

    }

	// header for messages sent to the server
	getMessageHeader() {
        return { "id": this.id, "width": this.width, "height": this.height, "mines": this.num_bombs, "seed": this.seed, "gametype" : this.gameType};
	}
	
	// returns all the tiles adjacent to this tile
	getAdjacent(tile) {
		
		var col = tile.getX();
		var row = tile.getY();

		var first_row = Math.max(0, row - 1);
		var last_row = Math.min(this.height - 1, row + 1);

		var first_col = Math.max(0, col - 1);
		var last_col = Math.min(this.width - 1, col + 1);

		var result = []

		for (var r = first_row; r <= last_row; r++) {
			for (var c = first_col; c <= last_col; c++) {
				var i = this.width * r + c;
				if (!(r == row && c == col)) {  // don't include ourself
					result.push(this.tiles[i]);
				}
			}
		}

		return result;
	}

	getFlagsPlaced() {

		var tally = 0;
		for (var i = 0; i < this.tiles.length; i++) {
			if (this.tiles[i].isFlagged()) {
				tally++;
            }
        }
			 
		return tally;
    }

	// sets up the initial tiles 
	init_tiles() {
		
		for (var y=0; y < this.height; y++) {
			for (var x=0; x < this.width; x++) {
				this.tiles.push(new Tile(x, y, y * this.width + x));
			}
		}
		
		//console.log(this.tiles.length + " tiles added to board");
	}

	setAllZero() {
		for (var i = 0; i < this.tiles.length; i++) {
			this.tiles[i].setValue(0);
		}
    }

	resetForAnalysis() {

		for (var i = 0; i < this.tiles.length; i++) {
			var tile = this.tiles[i];
			if (tile.isFlagged()) {
				tile.foundBomb = true;
			} else {
				tile.foundBomb = false;
            }
		}

    }

	getHashValue() {

		var hash = (31 * 31 * 31 * this.num_bombs + 31 * 31 * this.getFlagsPlaced() + 31 * this.width + this.height) % this.MAX;

		for (var i = 0; i < this.tiles.length; i++) {
			var tile = this.tiles[i];
			if (tile.isFlagged()) {
				hash = (31 * hash + 13) % this.MAX;
			} else if (tile.isCovered()) {
				hash = (31 * hash + 12) % this.MAX;
			} else {
				hash = (31 * hash + tile.getValue()) % this.MAX;
			}
        }

		return hash;
	}

	// returns a string that represents this board state which can be save and restored later
	getStateData() {

		// wip

		for (var i = 0; i < this.tiles.length; i++) {
			var tile = this.tiles[i];
			if (tile.isFlagged()) {
				hash = (31 * hash + 13) % this.MAX;
			} else if (tile.isCovered()) {
				hash = (31 * hash + 12) % this.MAX;
			} else {
				hash = (31 * hash + tile.getValue()) % this.MAX;
			}
		}


	}

	findAutoMove() {

		var result = new Map();

		for (var i = 0; i < this.tiles.length; i++) {

			var tile = this.getTile(i);

			if (tile.isFlagged()) {
				continue;  // if the tile is a mine then nothing to consider
			} else if (tile.isCovered()) {
				continue;  // if the tile hasn't been revealed yet then nothing to consider
			}

			var adjTiles = this.getAdjacent(tile);

			var needsWork = false;
			var flagCount = 0;
			var coveredCount = 0;
			for (var j = 0; j < adjTiles.length; j++) {
				var adjTile = adjTiles[j];
				if (adjTile.isCovered() && !adjTile.isFlagged()) {
					needsWork = true;
				}
				if (adjTile.isFlagged()) {
					flagCount++;
				} else if (adjTile.isCovered()) {
					coveredCount++;
                }
			}

			if (needsWork) {  // the witness still has some unrevealed adjacent tiles
				if (tile.getValue() == flagCount) {  // can clear around here
					for (var j = 0; j < adjTiles.length; j++) {
						var adjTile = adjTiles[j];
						if (adjTile.isCovered() && !adjTile.isFlagged()) {
							result.set(adjTile.index, new Action(adjTile.getX(), adjTile.getY(), 1, ACTION_CLEAR));
						}
					}			

				} else if (tile.getValue() == flagCount + coveredCount) { // can place all flags
					for (var j = 0; j < adjTiles.length; j++) {
						var adjTile = adjTiles[j];
						if (adjTile.isCovered() && !adjTile.isFlagged()) { // if covered and isn't flagged
							adjTile.setFoundBomb();   // Must be a bomb
							result.set(adjTile.index, new Action(adjTile.getX(), adjTile.getY(), 0, ACTION_FLAG));
						}
					}			
                }
			}

		}	

		// send it back as an array
		return Array.from(result.values());

    } 

}
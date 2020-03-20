/**
 * 
 */
"use strict";

class Board {
	
	constructor(id, width, height, num_bombs, seed, gameType) {
		
		console.log("Creating a new board with id=" + id + " ...");

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
		
		console.log("... board created");

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

    // return number of flags adjacent to this tile
    adjacentFlagsCount(tile) {

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
            if (adjTile.isCovered() && !adjTile.isFlagged()) {
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
		
		console.log(this.tiles.length + " tiles added to board");
	}

	setAllZero() {
		for (var i = 0; i < this.tiles.length; i++) {
			this.tiles[i].setValue(0);
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
}
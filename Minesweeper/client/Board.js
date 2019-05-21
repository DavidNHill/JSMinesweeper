/**
 * 
 */
"use strict";

class Board {
	
	constructor(id, width, height, num_bombs) {
		
		console.log("Creating a new board with id=" + id + " ...");
		
		this.id = id;
		this.width = width;
		this.height = height;
		this.num_bombs = num_bombs;
		this.tiles = [];
		this.started = false;
		this.bombs_left = this.num_bombs;
		this.tiles_left = this.width * this.height - this.num_bombs;
		this.init_tiles();

		this.gameover = false;
		this.won = false;
		
		console.log("... board created");

	}

	isStarted() {
		return this.started;
	}
	
	setGameover() {
		this.gameover = true;
	}

	isGameover() {
		return this.gameover;
	}
	
	
	getID() {
		return this.id;
	}
	
	setStarted(id) {
		
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
	
	// header for messages sent to the server
	getMessageHeader() {
		return {"id" : this.id, "width" : this.width, "height" : this.height, "mines" : this.num_bombs, "gametype" : 2};
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
	
	// sets up the initial tiles 
	init_tiles() {
		
		for (var y=0; y < this.height; y++) {
			for (var x=0; x < this.width; x++) {
				this.tiles.push(new Tile(x, y, y * this.width + x));
			}
		}
		
		console.log(this.tiles.length + " tiles added to board");
	}
	
}
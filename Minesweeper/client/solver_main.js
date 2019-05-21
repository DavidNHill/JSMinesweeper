/**
 * 
 */
"use strict";


function solver(board) {
	
	// find all the tiles which are revealed and have un-revealed / un-flagged adjacent squares
	
	var witnesses = [];
	var witnessed = [];

    var minesLeft = board.num_bombs;
    var squaresLeft = 0; 

	var work = new Set();  // use a map to deduplicate the witnessed tiles
	
	for (var i=0; i < board.tiles.length; i++) {

		var tile = board.getTile(i);

        tile.clearHint();  // clear any previous hints

        if (tile.isFlagged()) {
            minesLeft--;
            continue;  // if the tile is a flag then nothing to consider
        } else if (tile.isCovered()) {
            squaresLeft++;
			continue;  // if the tile hasn't been revealed yet then nothing to consider
		}
		
		var adjTiles = board.getAdjacent(tile);
		
		var needsWork = false;
		for (var j=0; j < adjTiles.length; j++) {
			var adjTile = adjTiles[j];
			if (adjTile.isCovered() && !adjTile.isFlagged()) {
				needsWork = true;
				
				work.add(adjTile.index);
				
				//witnessed.push(adjTile);
			} 
		}

		if (needsWork) {
			witnesses.push(tile);
		}
		
	}	
	
	// generate an array of tiles from the map
	for (var index of work) {
		witnessed.push(board.getTile(index));
	}

    console.log("tiles left = " + squaresLeft);
    console.log("mines left = " + minesLeft);
	console.log("Witnesses  = " + witnesses.length);
	console.log("Witnessed  = " + witnessed.length);
	
	var result = trivial_actions(board, witnesses);

    
 

	var pe = new ProbabilityEngine(witnesses, witnessed, squaresLeft, minesLeft);

    pe.process();


	/*
	var iterator = new Iterator(6,2);
	
	var sample = iterator.getSample();
	while (sample != null) {
		
		console.log("Iterator = " + sample);
		
		
		 sample = iterator.getSample();
	}
	*/
	
	
	
	
	return result;
	
}


function trivial_actions(board, witnesses) {
	
	var result = new Map();
	
	for (var i=0; i < witnesses.length; i++) {
		
		//var tile = board.getTile(i);
		var tile = witnesses[i];

		if (tile.isCovered() || tile.isFlagged()) {
			continue;  // if the tile hasn't been revealed yet then nothing to consider
		}
		
		var adjTiles = board.getAdjacent(tile);
		
		var flags = 0
		var covered = 0;
		for (var j=0; j < adjTiles.length; j++) {
			var adjTile = adjTiles[j];
			if (adjTile.isFlagged()) {
				flags++;
			} else if (adjTile.isCovered()) {
				covered++;
			}
		}

		// if the tile has the correct number of flags then the other adjacent tiles are clear
		if (flags == tile.getValue() && covered > 0) {
			for (var j=0; j < adjTiles.length; j++) {
				var adjTile = adjTiles[j];
                if (adjTile.isCovered() && !adjTile.isFlagged()) {
                    adjTile.setProbability(1);  // definite clear
					result.set(adjTile.index, new Action(adjTile.getX(), adjTile.getY(), 0));
				}
			}			
		}
		
		// if the tile has n remaining covered squares and needs n more flags then all the adjacent files are flags
		if (tile.getValue() == flags + covered && covered > 0) {
			for (var j=0; j < adjTiles.length; j++) {
				var adjTile = adjTiles[j];
                if (adjTile.isCovered() && !adjTile.isFlagged()) {
                    adjTile.setProbability(0);  // definite mine
					result.set(adjTile.index, new Action(adjTile.getX(), adjTile.getY(), 1));
				}
			}			
		}
		
	}
	
	console.log("Found " + result.size + " moves");
	
	return result;
	
}

class Iterator {
	constructor(size, mines) {
		this.size = size;
		this.mines = mines;
		this.sample = [];
		this.more = true;
		
		for (var i=0; i < this.mines; i++) {
			this.sample.push(i);
		}
		
		this.sample[this.mines - 1]--;
		
	}
	
	getSample() {
		
		if (!this.more) {
			console.log("LOGIC ERROR: Iterator called when no more positions");
			return;
		}
		
		var index = this.mines - 1;
		
		// add one to the iterator
		this.sample[index]++;
		
        // if we have rolled off the end then move backwards until we can fit
        // the next iteration
        while (this.sample[index] >= this.size - this.mines + 1 + index) {
            if (index == 0) {
                this.more = false;
                return;
            } else {
                index--;
                this.sample[index]++;
            }
        }
        
        // roll forward 
        while (index != this.mines - 1) {
            index++;
            this.sample[index] = this.sample[index-1] + 1;
        }
        
        return this.sample;		
		
	}
	
	
	
}

class Action {
	constructor(x, y, prob) {
		this.x = x;
		this.y = y;
		this.prob = prob;
	}
	
}

function combination(mines, squares) {

    var top = 1;
    var bot = 1;

    var range = Math.min(mines, squares - mines);

    // calculate the combination. 
    for (var i = 0; i < range; i++) {
        top = top * (squares - i);
        bot = bot * (i + 1);
    }

    var result = top / bot;

    return result;

}    

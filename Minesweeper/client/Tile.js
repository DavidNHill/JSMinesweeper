/**
 * 
 */
"use strict";

class Tile {
	constructor(x, y, index) {
		this.x = x;
		this.y = y;
		this.is_covered = true;
		this.value = 0;
		this.is_flagged = false;
		this.foundBomb = false
        this.is_bomb;   // this gets set when the game is lost
        this.exploded = false;  // this gets set if this tile was the one clicked
        this.index = index;

        this.onEdge = false;
        this.hint = false;
        this.probability;
        this.hintText = "";
	}

	//reveal() {
	//	this.is_covered = false;
	//}

	getX() {
		return this.x;
	}
	
	getY() {
		return this.y;
	}
	
	// returns true if the tile provided is adjacent to this tile
	isAdjacent(tile) {
		
		var dx = Math.abs(this.x - tile.x);
		var dy = Math.abs(this.y - tile.y);
		
		// adjacent and not equal
		if (dx < 2 && dy < 2 && !(dx == 0 && dy == 0)) {
			return true;
		} else {
			return false;
		}
		
	}

    isEqual(tile) {

        if (this.x == tile.x && this.y == tile.y) {
            return true;
        } else {
            return false;
        }

    }

	asText() {
		return "(" + this.x + "," + this.y + ")";
	}

    getHintText() {

        if (!this.hasHint) {
            return "";
        } else {
            return this.hintText;
        }

    }

    setProbability(prob, progress) {
        this.probability = prob;
        this.hasHint = true;

		if (prob == 1) {
			this.hintText = "Clear";
		} else if (prob == 0) {
			this.hintText = "Mine";
		} else if (progress == null) {
			this.hintText = "\n" + (prob * 100).toFixed(2) + "% safe";
		} else {
			this.hintText = "\n" + (prob * 100).toFixed(2) + "% safe" + "\n" + (progress * 100).toFixed(2) + "% progress"
        }

    }

    //getProbability() {
    //    return this.probability;
    //}

    clearHint() {
        this.onEdge = false;
        this.hasHint = false;
        this.hintText = "";
    }

    setOnEdge() {
        this.onEdge = true;
    }

	isCovered() {
		return this.is_covered;
	}

	setCovered(covered) {
		this.is_covered = covered;
    }

	setValue(value) {
		this.value = value;
		this.is_covered = false;
	}

	setValueOnly(value) {
		this.value = value;
    }

	getValue() {
		return this.value;
	}

	rotateValue(delta) {

		var newValue = this.value + delta;

		if (newValue < 0) {
			newValue = 8;
		} else if (newValue > 8) {
			newValue = 0;
        }

		this.setValue(newValue);
    }

	toggleFlag() {
		this.is_flagged = !this.is_flagged;
	}
	
	isFlagged() {
		return this.is_flagged;
	}

	// this is set when the solver discovers a bomb - trying to separate the discovery of a bomb from the flagging of a tile
	setFoundBomb() {
		this.foundBomb = true;
	}

	// this is used when a tile is speculatively set to a mine to see if the board is still valid
	unsetFoundBomb() {
		this.foundBomb = false;
	}

	isSolverFoundBomb() {
		return this.foundBomb;
    }

	// this is used to display the bombs when the game is lost
	setBomb(bomb) {
		this.is_bomb = bomb;
	}

	// this is used to display the exploded bomb when the game is lost
    setBombExploded() {
        this.is_bomb = true;
        this.exploded = true;
    }

	isBomb() {
		return this.is_bomb;
	}
}
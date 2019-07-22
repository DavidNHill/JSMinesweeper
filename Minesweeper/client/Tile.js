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
		this.is_bomb = false;   // this gets set when the game is lost
        this.index = index;

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

    setProbability(prob) {
        this.probability = prob;
        this.hasHint = true;

        if (prob == 1) {
            this.hintText = "Clear";
        } else if (prob == 0) {
            this.hintText = "Mine";
        } else {
            this.hintText = (prob * 100).toFixed(2) + "% safe";
        }

    }

    getProbability() {
        return this.probability;
    }

    clearHint() {
        this.hasHint = false;
        this.hintText = "";
    }

	isCovered() {
		return this.is_covered;
	}
	
	setValue(value) {
		this.value = value;
		this.is_covered = false;
	}

	getValue() {
		return this.value;
	}
	
	toggleFlag() {
		this.is_flagged = !this.is_flagged;
	}
	
	isFlagged() {
		return this.is_flagged;
	}

	setBomb() {
		this.is_bomb = true;
	}
	
	isBomb() {
		return this.is_bomb;
	}
}
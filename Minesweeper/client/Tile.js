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
        this.is_bomb = null;   // this gets set when the game is lost
        this.exploded = false;  // this gets set if this tile was the one clicked
		this.index = index;
		this.is_start = false;

        this.onEdge = false;
        this.hint = false;
        this.probability = -1;  // of being safe
		this.hintText = "";
		this.hasHint = false;
		this.colored = false;

		this.efficiencyValue = "";   // the value we need to be to be chordable
		this.efficiencyProbability = 0;  // the probability of being that value
		this.efficiencyText = "";  

		this.winRate = 0;   // win rate as determined by the Brute force analysis
		this.winRateText = "";  

		this.zeroProbability = 0;
		this.zeroPoison = false;

		// is there an mine adjacent to this tile?  Set as part of the No flag efficiency logic
		this.adjacentMine = false;

		this.skull = false;  // used when hardcore rule triggers

		this.inflate = false; // used when constructing a compressed board

		Object.seal(this); // prevent new values being created
	}

	getX() {
		return this.x;
	}
	
	getY() {
		return this.y;
	}
	
	// returns true if the tile provided is adjacent to this tile
	isAdjacent(tile) {
		
		const dx = Math.abs(this.x - tile.x);
		const dy = Math.abs(this.y - tile.y);
		
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
			return this.hintText + this.efficiencyText + this.winRateText;
        }

    }

	getHasHint() {
		return this.hasHint;
    }

    setProbability(prob, progress, safety2) {
        this.probability = prob;
        this.hasHint = true;

		if (prob == 1) {
			this.hintText = "Safe";
		} else if (prob == 0) {
			this.hintText = "Mine";
		} else if (progress == null) {
			this.hintText = "\n" + (prob * 100).toFixed(2) + "% safe";
		} else {
			this.hintText = "\n" + (prob * 100).toFixed(2) + "% safe" + "\n" + (safety2 * 100).toFixed(2) + "% 2nd safety" + "\n" + (progress * 100).toFixed(2) + "% progress"
        }

	}

	setValueProbability(value, probability) {
		this.efficiencyValue = value;
		this.efficiencyProbability = probability;

		this.efficiencyText = "\n" + (probability * 100).toFixed(2) + "% value '" + value + "'"
	}

	setWinRate(winRate) {
		this.winRate = winRate;

		this.winRateText = "\n" + (winRate * 100).toFixed(2) + "% solve rate";
	}

    //getProbability() {
    //    return this.probability;
    //}

    clearHint() {
        this.onEdge = false;
        this.hasHint = false;
		this.hintText = "";
		this.efficiencyValue = null;
		this.efficiencyProbability = 0;
		this.efficiencyText = "";
		this.probability = -1;
		this.winRate = 0;
		this.winRateText = "";
		this.zeroPoison = false;
    }

	setOnEdge() {
		//console.log(this.asText() + " Setting on edge");
        this.onEdge = true;
    }

	isOnEdge() {
		return this.onEdge;
	}

	isCovered() {
		return this.is_covered;
	}

	setCovered(covered) {
		//console.log(this.asText() + " covered: " + covered);
		this.is_covered = covered;
    }

	setValue(value) {
		//console.log(this.asText() + " setting value " + value + " and not covered");
		this.value = value;
		this.is_covered = false;
	}

	setValueOnly(value) {
		if (this.is_flagged) {
			console.error(this.asText() + " assigning a value " + value + " to a flagged tile!");
		}

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
		//console.log(this.asText() + " set to Found Bomb");
		this.foundBomb = true;
	}

	// this is used when a tile is speculatively set to a mine to see if the board is still valid
	unsetFoundBomb() {
		//console.log(this.asText() + " set to not Found Bomb");
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

	setSkull(isSkull) {
		this.skull = isSkull;
	}

	isSkull() {
		return this.skull;
    }
}
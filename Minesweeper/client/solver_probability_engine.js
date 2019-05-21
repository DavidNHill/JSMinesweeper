/**
 * 
 */

"use strict";

class ProbabilityEngine {
	constructor(allWitnesses, allWitnessed) {
		
		this.witnesses = allWitnesses;
		this.witnessed = allWitnessed;
		
		this.boxes = [];
		
		this.workingProbs = []; 
		this.heldProbs = [];
		
		// allocate each of the witnessed squares to a box
		var uid = 0;
		for (var i=0; i < this.witnessed.length; i++) {
			
			var tile = this.witnessed[i];
			
			var count = 0;
			
			// count how many adjacent witnesses the tile has
			for (var j=0; j < this.witnesses.length; j++) {
				if (tile.isAdjacent(this.witnesses[j])) {
					count++;
				}
			}
			
			var found = false;
			
			for (var j=0; j < this.boxes.length; j++) {
				
				if (this.boxes[j].fits(tile, count)) {
					this.boxes[j].add(tile);
					found = true;
					break;
				}
				
			}
			
			// if not found create a new box and store it
			if (!found) {
				this.boxes.push(new Box(this.witnesses, tile, uid++));
			}

		}

	}
	
	process() {
		
		// create an initial solution of no mines anywhere 
		var held = new ProbabilityLine();
		held.solutionCount = 1;
		this.heldProbs.push(held);
		
		// add an empty probability line to get us started
		this.workingProbs.push(new ProbabilityLine());
		
		
		
		
		
	}
	
	
	
}

/*
 * Used to hold a solution
 */
class ProbabilityLine {
	constructor() {
		
		this.mineCount = 0;
		this.solutionCount = 0;
		this.mineBoxCount = [];
		
		for (var i=0; i < mineBoxCount.length; i++) {
			this.mineBoxCount.push(0);
		}		
		
	}
	
}


// holds a witness and all the Boxes adjacent to it
class BoxWitness {
	constructor(tile, boxes) {
		
		this.tile = tile;
		
		this.boxes = [];
		
		for (var i=0; i < boxes.length; i++) {
			
			var box = boxes[i];
			
			for (var j=0; j < box.boxWitnesses.length; j++) {
				if (box.boxWitnesses[j].x == this.tile.x && box.boxWitnesses[j].y == this.tile.y) {
					this.boxes.push(box);
					break;
				}
			}
			
		}
		
		console.log("Witness " + this.tile.asText() + " has " + this.boxes.length + " boxes adjacent to it");
		
		
	}
	
	
	
	
}

// a box is a group of tiles which share the same witnesses
class Box {
	constructor(witnesses, tile, uid) {
		
		this.uid = uid;
		
		this.tiles = [];
		this.tiles.push(tile);
		
		this.boxWitnesses = [];
		
		for (var i=0; i < witnesses.length; i++) {
			if (tile.isAdjacent(witnesses[i])) {
				this.boxWitnesses.push(witnesses[i]);
			}
		}
		
		console.log("Box created for tile " + tile.asText() + " with " + this.boxWitnesses.length + " witnesses");
		
		this.processed = false;
		
	}
	
	// if the tiles surrounding witnesses equal the boxes then it fits
	fits(tile, count) {

		// a tile can't share the same witnesses for this box if they have different numbers
		if (count != this.boxWitnesses.length) {
			return false;
		}
		
		for (var i=0; i < this.boxWitnesses.length; i++) {
			if (!this.boxWitnesses[i].isAdjacent(tile)) {
				return false;
			}
		}		
		
		console.log("Tile " + tile.asText() + " fits in box with tile " + this.tiles[0].asText());
		
		return true;
		
	}
	
	// add a new tile to the box
	add(tile) {
		this.tiles.push(tile);
	}
	
}
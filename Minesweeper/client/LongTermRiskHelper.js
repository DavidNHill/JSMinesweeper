"use strict";

class LongTermRiskHelper {

	constructor(board, pe, minesLeft, options)  {

		this.INFLUENCE_THRESHOLD = 0.025;

		this.board = board;
		//this.wholeEdge = wholeEdge;
		this.currentPe = pe;
		this.minesLeft = minesLeft
		this.options = options;

		//this.pseudo = null;
		this.pseudos = [];

		this.influence5050s = new Array(this.board.width * this.board.height);
		this.influenceEnablers = new Array(this.board.width * this.board.height);

		this.totalSolutions = pe.finalSolutionsCount;

		Object.seal(this) // prevent new properties being created

	}

	/**
	 * Scan whole board looking for tiles heavily influenced by 50/50s
	 */
	findInfluence() {

		//TODO place mines found by the probability engine

		this.checkFor2Tile5050();

		if (this.pseudos.length != 0) {
			this.writeToConsole("2-tile pseudo found");
			return this.pseudos;
		}

		this.checkForBox5050();

		if (this.pseudos.length != 0) {
			this.writeToConsole("2x2 pseudo found");
		}

		//TODO remove mines found by the probability engine

		return this.pseudos;

	}

	/**
	 * Get the 50/50 influence for a particular tile
	 */
	findTileInfluence(tile) {
		
		let influence = BigInt(0);
		
		// 2-tile 50/50
		const tile1 = this.board.getTileXY(tile.getX() - 1, tile.getY());

		influence = this.addNotNull(influence, this.getHorizontal(tile, 4));
		influence = this.addNotNull(influence, this.getHorizontal(tile1, 4));

		const tile2 = this.board.getTileXY(tile.getX(), tile.getY() - 1);
		influence = this.addNotNull(influence, this.getVertical(tile, 4));
		influence = this.addNotNull(influence, this.getVertical(tile2, 4));

		if (influence > 0) {
			const percentage = divideBigInt(influence, this.totalSolutions, 5) * 100;
			this.writeToConsole("Tile " + tile.asText() + " aggregate 2-tile 50/50s has blast percentage " + percentage.toFixed(3) + "%");
		}


		// 4-tile 50/50
		let influence4 = BigInt(0);
		const tile3 = this.board.getTileXY(tile.getX() - 1, tile.getY() - 1);
		influence4 = this.maxNotNull(influence4, this.getBoxInfluence(tile, 5));
		influence4 = this.maxNotNull(influence4, this.getBoxInfluence(tile1, 5));
		influence4 = this.maxNotNull(influence4, this.getBoxInfluence(tile2, 5));
		influence4 = this.maxNotNull(influence4, this.getBoxInfluence(tile3, 5));

		if (influence4 > 0) {
			const percentage = divideBigInt(influence4, this.totalSolutions, 5) * 100;
			this.writeToConsole("Tile " + tile.asText() + " highest impact 4-tile 50/50 has blast percentage " + percentage.toFixed(3) + "%");
        }

		influence = influence + influence4;

		// enablers also get influence, so consider that as well as the 50/50
		if (this.influenceEnablers[tile.index] != null) {
			influence = influence + this.influenceEnablers[tile.index];
			const percentage = divideBigInt(this.influenceEnablers[tile.index], this.totalSolutions, 5) * 100;
			this.writeToConsole("Tile " + tile.asText() + " 50/50 influence from being an enabler is " + percentage.toFixed(3) + "%");
		}
		
		let maxInfluence;
		const box = this.currentPe.getBox(tile);
		if (box == null) {
			maxInfluence = this.currentPe.offEdgeMineTally;
		} else {
			maxInfluence = box.mineTally;
		}

		// 50/50 influence P(50/50)/2 can't be larger than P(mine) or P(safe)
		const other = this.currentPe.finalSolutionsCount - maxInfluence;

		maxInfluence = this.bigIntMin(maxInfluence, other);

		influence = this.bigIntMin(influence, maxInfluence);

		return influence;

	}
	
	checkFor2Tile5050() {
		
		const maxMissingMines = 2;

		this.writeToConsole("Checking for 2-tile 50/50 influence");
    	
		// horizontal 2x1
		for (let i = 0; i < this.board.width - 1; i++) {
			for (let j = 0; j < this.board.height; j++) {

				const tile1 = this.board.getTileXY(i, j);
				const tile2 = this.board.getTileXY(i + 1, j);
				
				const result = this.getHorizontal(tile1, maxMissingMines, this.minesLeft);

				if (result != null) {
					let influenceTally = this.addNotNull(BigInt(0), result);
					const influenceRatio = divideBigInt(influenceTally, this.currentPe.finalSolutionsCount, 5) * 2; 
					//this.writeToConsole("Tile " + tile1.asText() + " and " + tile2.asText() + " have horiontal 2-tile 50/50 influence " + influence);

					this.addInfluence(influenceTally, influenceRatio, result.enablers, [tile1, tile2]);
					if (this.pseudos.length != 0) {  // if we've found a pseudo then we can stop here
						return;
					}
				}



			}
		}

		// vertical 2x1
		for (let i = 0; i < this.board.width; i++) {
			for (let j = 0; j < this.board.height - 1; j++) {

				const tile1 = this.board.getTileXY(i, j);
				const tile2 = this.board.getTileXY(i, j + 1);
				
				const result = this.getVertical(tile1, maxMissingMines, this.minesLeft);

				if (result != null) {
					
					let influenceTally = this.addNotNull(BigInt(0), result);

					const influenceRatio = divideBigInt(influenceTally, this.currentPe.finalSolutionsCount, 5); 
					//this.writeToConsole("Tile " + tile1.asText() + " and " + tile2.asText() + " have vertical 2-tile 50/50 influence " + influence);

					this.addInfluence(influenceTally, influenceRatio, result.enablers, [tile1, tile2]);
					if (this.pseudos.length != 0) {  // if we've found a pseudo then we can stop here
						return;
					}
				}

			}
		}
	}

	getHorizontal(subject, maxMissingMines) {

		if (subject == null) {
			return null;
        }

		const i = subject.x;
		const j = subject.y;

		if (i < 0 || i + 1 >= this.board.width) {
			return null;
		}

		// need 2 hidden tiles
		if (!this.isHidden(i, j) || !this.isHidden(i + 1, j)) {
			return null;
		}

		const missingMines = this.getMissingMines([this.board.getTileXY(i - 1, j - 1), this.board.getTileXY(i - 1, j), this.board.getTileXY(i - 1, j + 1),
			this.board.getTileXY(i + 2, j - 1), this.board.getTileXY(i + 2, j), this.board.getTileXY(i + 2, j + 1)]);

		// only consider possible 50/50s with less than 3 missing mines or requires more mines then are left in the game (plus 1 to allow for the extra mine in the 50/50)
		if (missingMines == null || missingMines.length + 1 > maxMissingMines || missingMines.length + 1 > this.minesLeft) {
			return null;
		}
		
		const tile1 = subject;
		const tile2 = this.board.getTileXY(i + 1, j);

		//this.writeToConsole("Evaluating candidate 50/50 - " + tile1.asText() + " " + tile2.asText());

		// add the missing Mines and the mine required to form the 50/50
		//missingMines.push(tile1);

		const mines = [...missingMines, tile1];
		const notMines = [tile2];

		// place the mines
		for (let tile of mines) {
			tile.setFoundBomb();
		}

		// see if the position is valid
		const counter = solver.countSolutions(this.board, notMines);

		// remove the mines
		for (let tile of mines) {
			tile.unsetFoundBomb();
		}

		if (counter.finalSolutionsCount == 0) {
			return null;
		}

		const ratio = divideBigInt(counter.finalSolutionsCount, this.totalSolutions, 5);
		const percentage = ratio * 100 * 2;
		if (ratio > this.INFLUENCE_THRESHOLD) {
			this.writeToConsole("Possible 50/50 - " + tile1.asText() + " " + tile2.asText() + " chance of being 50/50 " + percentage.toFixed(3) + "%");
		}

		return new LTResult(counter.finalSolutionsCount, missingMines);

	}
	
	getVertical(subject, maxMissingMines) {

		if (subject == null) {
			return null;
		}

		const i = subject.getX();
		const j = subject.getY();

		if (j < 0 || j + 1 >= this.board.height) {
			return null;
		}

		// need 2 hidden tiles
		if (!this.isHidden(i, j) || !this.isHidden(i, j + 1)) {
			return null;
		}

		const missingMines = this.getMissingMines([this.board.getTileXY(i - 1, j - 1), this.board.getTileXY(i, j - 1), this.board.getTileXY(i + 1, j - 1),
			this.board.getTileXY(i - 1, j + 2), this.board.getTileXY(i, j + 2), this.board.getTileXY(i + 1, j + 2)]);

		// only consider possible 50/50s with less than 3 missing mines or requires more mines then are left in the game (plus 1 to allow for the extra mine in the 50/50)
		if (missingMines == null || missingMines.length + 1 > maxMissingMines || missingMines.length + 1 > this.minesLeft) {
			return null;
		}
		
		const tile1 = this.board.getTileXY(i, j);
		const tile2 = this.board.getTileXY(i, j + 1);

		//this.writeToConsole("Evaluating candidate 50/50 - " + tile1.asText() + " " + tile2.asText());

		// add the missing Mines and the mine required to form the 50/50
		//missingMines.push(tile1);

		const mines = [...missingMines, tile1];
		const notMines = [tile2];

		// place the mines
		for (let tile of mines) {
			tile.setFoundBomb();
		}

		// see if the position is valid
		const counter = solver.countSolutions(this.board, notMines);

		// remove the mines
		for (let tile of mines) {
			tile.unsetFoundBomb();
		}

		if (counter.finalSolutionsCount == 0) {
			return null;
		}

		const ratio = divideBigInt(counter.finalSolutionsCount, this.totalSolutions, 5);
		const percentage = ratio * 100 * 2;

		if (ratio > this.INFLUENCE_THRESHOLD) {
			this.writeToConsole("Possible 50/50 - " + tile1.asText() + " " + tile2.asText() + " chance of being 50/50 " + percentage.toFixed(3) + "%");
		}

		return new LTResult(counter.finalSolutionsCount, missingMines);

	}

	checkForBox5050() {
		
		const maxMissingMines = 4;
		
		this.writeToConsole("Checking for 4-tile 50/50 influence");

		// box 2x2 
		for (let i = 0; i < this.board.width - 1; i++) {
			for (let j = 0; j < this.board.height - 1; j++) {

				const tile1 = this.board.getTileXY(i, j);
				const tile2 = this.board.getTileXY(i, j + 1);
				const tile3 = this.board.getTileXY(i + 1, j);
				const tile4 = this.board.getTileXY(i + 1, j + 1);
				
				const result = this.getBoxInfluence(tile1, maxMissingMines);

				if (result != null) {
					
					const influenceTally = this.addNotNull(BigInt(0), result);
					
					const influenceRatio = divideBigInt(influenceTally, this.currentPe.finalSolutionsCount, 5); 
					//this.writeToConsole("Tile " + tile1.asText() + " " + tile2.asText() + " " + tile3.asText() + " " + tile4.asText() + " have box 4-tile 50/50 influence " + influence);

					this.addInfluence(influenceTally, influenceRatio, result.enablers, [tile1, tile2, tile3, tile4]);
					if (this.pseudos.length != 0) {  // if we've found a pseudo then we can stop here
						return;
					}
				}

			}
		}

	}
	
	getBoxInfluence(subject, maxMissingMines) {

		if (subject == null) {
			return null;
		}

		const i = subject.getX();
		const j = subject.getY();

		if (j < 0 || j + 1 >= board.height || i < 0 || i + 1 >= board.width) {
			return null;
		}

		// need 4 hidden tiles
		if (!this.isHidden(i, j) || !this.isHidden(i, j + 1) || !this.isHidden(i + 1, j) || !this.isHidden(i + 1, j + 1)) {
			return null;
		}

		const missingMines = this.getMissingMines([this.board.getTileXY(i - 1, j - 1), this.board.getTileXY(i + 2, j - 1), this.board.getTileXY(i - 1, j + 2), this.board.getTileXY(i + 2, j + 2)]);

		// only consider possible 50/50s with less than 3 missing mines or requires more mines then are left in the game (plus 1 to allow for the extra mine in the 50/50)
		if (missingMines == null || missingMines.length + 2 > maxMissingMines || missingMines.length + 2 > this.minesLeft) {
			return null;
		}
		
		const tile1 = this.board.getTileXY(i, j);
		const tile2 = this.board.getTileXY(i, j + 1);
		const tile3 = this.board.getTileXY(i + 1, j);
		const tile4 = this.board.getTileXY(i + 1, j + 1);

		//this.writeToConsole("Evaluating candidate 50/50 - " + tile1.asText() + " " + tile2.asText() + " " + tile3.asText() + " " + tile4.asText());

		// add the missing Mines and the mine required to form the 50/50
		//missingMines.push(tile1);
		//missingMines.push(tile4);

		const mines = [...missingMines, tile1, tile4];
		const notMines = [tile2, tile3];

		// place the mines
		for (let tile of mines) {
			tile.setFoundBomb();
		}

		// see if the position is valid
		const counter = solver.countSolutions(this.board, notMines);

		// remove the mines
		for (let tile of mines) {
			tile.unsetFoundBomb();
		}

		if (counter.finalSolutionsCount == 0) {
			return null;
		}

		const ratio = divideBigInt(counter.finalSolutionsCount, this.totalSolutions, 5);
		const percentage = ratio * 100 * 2;
		if (ratio > this.INFLUENCE_THRESHOLD) {
			this.writeToConsole("Possible 50/50 - " + tile1.asText() + " " + tile2.asText() + " " + tile3.asText() + " " + tile4.asText() + " chance of being 50/50 " + percentage.toFixed(3) + "%");
		}

		return new LTResult(counter.finalSolutionsCount, missingMines);

	}
	
	addNotNull(influence, result) {

		if (result == null) {
			return influence;
		} else {
			return influence + result.influence;
		}

	}

	maxNotNull(influence, result) {

		if (result == null) {
			return influence;
		} else {
			return this.bigIntMax(influence, result.influence);
		}

	}

	addInfluence(influenceTally, influenceRatio, enablers, tiles) {

		//const pseudos = [];

		// the tiles which enable a 50/50 but aren't in it also get an influence
		if (enablers != null && influenceRatio > this.INFLUENCE_THRESHOLD) {
			for (let loc of enablers) {

				// store the influence
				if (this.influenceEnablers[loc.index] == null) {
					this.influenceEnablers[loc.index] = influenceTally;
				} else {
					this.influenceEnablers[loc.index] = this.influenceEnablers[loc.index] + influenceTally;
				}
				//this.writeToConsole("Enabler " + loc.asText() + " has influence " + this.influences[loc.index]);
			}
		}

		for (let loc of tiles) {
			
			const b = this.currentPe.getBox(loc);
			let mineTally;
			if (b == null) {
				mineTally = this.currentPe.offEdgeMineTally;
			} else {
				mineTally = b.mineTally;
			}
			// If the mine influence covers the whole of the mine tally then it is a pseudo-5050
			if (influenceTally == mineTally) {
				if (!this.currentPe.isDead(loc)) {  // don't accept dead tiles
					this.pseudos.push(loc);
				}
			}

			// store the influence
			if (influenceRatio > this.INFLUENCE_THRESHOLD) {
				if (this.influence5050s[loc.index] == null) {
					this.influence5050s[loc.index] = influenceTally;
				} else {
					//influences[loc.x][loc.y] = influences[loc.x][loc.y].max(influence);
					this.influence5050s[loc.index] = this.influence5050s[loc.index] + influenceTally;
				}
			}

			//this.writeToConsole("Interior " + loc.asText() + " has influence " + this.influences[loc.index]);
		}

		/*
		if (pseudos.length == 3) {
			this.pickPseudo(pseudos);
		} else if (pseudos.length != 0) {
			this.pseudo = pseudos[0];
        }
		*/
	}

	pickPseudo(locations) {

		let maxX = 0;
		let maxY = 0;

		for (let loc of locations) {
			maxX = Math.max(maxX, loc.getX());
			maxY = Math.max(maxY, loc.getY());
		}

		const maxX1 = maxX - 1;
		const maxY1 = maxY - 1;

		let found = 0;
		for (let loc of locations) {
			if (loc.getX() == maxX && loc.getY() == maxY || loc.getX() == maxX1 && loc.getY() == maxY1) {
				found++;
			}
		}

		// if the 2 diagonals exist then choose the pseudo from those, other wise choose the pseudo from the other diagonal
		if (found == 2) {
			this.pseudo = this.board.getTileXY(maxX, maxY);
		} else {
			this.pseudo = this.board.getTileXY(maxX1, maxY);
		}

	}


	/**
	 * Get how many solutions have common 50/50s at this location
	 */
	/*
	get5050Influence(loc) {

		if (influences[loc.index] == null) {
			return BigInt(0);
		} else {
			return influences[loc.index];
		}

	}
	*/

	/**
	 * Return all the locations with 50/50 influence
	 */
	getInfluencedTiles(threshold) {

		const top = BigInt(Math.floor(threshold * 10000));
		const bot = BigInt(10000);

		const cutoffTally = this.currentPe.finalSolutionsCount * top / bot;

		const result = [];

		for (let tile of this.board.tiles) {

			let influence = BigInt(0);

			if (this.influence5050s[tile.index] != null) {
				influence = influence + this.influence5050s[tile.index];
            }
			if (this.influenceEnablers[tile.index] != null) {
				influence = influence + this.influenceEnablers[tile.index];
			}

			if (influence != 0) {	  // if we are influenced by 50/50s

				if (!this.currentPe.isDead(tile)) {  // and not dead

					const b = this.currentPe.getBox(tile);
					let mineTally;
					if (b == null) {
						mineTally = this.currentPe.offEdgeMineTally;
					} else {
						mineTally = b.mineTally;
					}

					const safetyTally = this.currentPe.finalSolutionsCount - mineTally + influence;

					if (safetyTally > cutoffTally) {
						//this.writeToConsole("Tile " + tile.asText() + " has mine tally " + mineTally + " influence " + this.influences[tile.index]);
						//this.writeToConsole("Tile " + tile.asText() + " has  modified tally  " + safetyTally + " cutoff " + cutoffTally);
						result.push(tile);
					}

				}
			}
		}

		return result;
	}

	// given a list of tiles return those which are on the board but not a mine
	// if any of the tiles are revealed then return null
	getMissingMines(tiles) {

		const result = [];

		for (let loc of tiles) {

			if (loc == null) {
				continue;
            }

			// if out of range don't return the location
			if (loc.getX() >= this.board.width || loc.getX() < 0 || loc.getY() < 0 || loc.getY() >= this.board.getHeight) {
				continue;
			}

			// if the tile is revealed then we can't form a 50/50 here
			if (!loc.isCovered()) {
				return null;
			}

			// if the location is already a mine then don't return the location
			if (loc.isSolverFoundBomb() || this.currentPe.isNewMine(loc)) {
				continue;
			}

			result.push(loc);
		}

		return result;
	}



	// not a certain mine or revealed
	isHidden(x, y) {

		const tile = this.board.getTileXY(x, y);

		if (tile.isSolverFoundBomb()) {
			return false;
		}

		if (!tile.isCovered()) {
			return false;
		}

		return true;

	}

	bigIntMin(a, b) {
		if (a < b) {
			return a;
		} else {
			return b;
        }
    }

	bigIntMax(a, b) {
		if (a > b) {
			return a;
		} else {
			return b;
        }
    }

	writeToConsole(text, always) {

		if (always == null) {
			always = false;
		}

		if (this.options.verbose || always) {
			console.log(text);
		}

	}
}

class LTResult {
	constructor(influence, enablers) {
		this.influence = influence;
		this.enablers = enablers;

		Object.seal(this) // prevent new properties being created
	}
}
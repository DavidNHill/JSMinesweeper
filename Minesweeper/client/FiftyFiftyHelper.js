"use strict";



class FiftyFiftyHelper {

	// ways to place mines in a 2x2 box
	static PATTERNS = [
		[true, true, true, true],   // four mines
		[true, true, true, false], [true, false, true, true], [false, true, true, true], [true, true, false, true],   // 3 mines
		[true, false, true, false], [false, true, false, true], [true, true, false, false], [false, false, true, true],   // 2 mines
		[false, true, false, false], [false, false, false, true], [true, false, false, false], [false, false, true, false]  // 1 mine   
	];


    constructor(board, minesFound, options, deadTiles, witnessedTiles, minesLeft) {

        this.board = board;
        this.options = options;
        this.minesFound = minesFound;  // this is a list of tiles which the probability engine knows are mines
		this.deadTiles = deadTiles;
		this.witnessedTiles = witnessedTiles;
		this.minesLeft = minesLeft;

    }

    // this process looks for positions which are either 50/50 guesses or safe.  In which case they should be guessed as soon as possible
    process() {

        const startTime = Date.now();

        // place all the mines found by the probability engine
        for (let mine of this.minesFound) {
            mine.setFoundBomb();
        }

		for (let i = 0; i < this.board.width - 1; i++) {
			for (let j = 0; j < this.board.height; j++) {

                const tile1 = this.board.getTileXY(i, j);
				if (!tile1.isCovered() || tile1.isSolverFoundBomb()) {  // cleared or a known mine
                    continue;
                }

                const tile2 = this.board.getTileXY(i + 1, j);
				if (!tile2.isCovered() || tile2.isSolverFoundBomb()) {  // cleared or a known mine
                    continue;
                }

                // if information can come from any of the 6 tiles immediately right and left then can't be a 50-50
				if (this.isPotentialInfo(i - 1, j - 1) || this.isPotentialInfo(i - 1, j) || this.isPotentialInfo(i - 1, j + 1)
					|| this.isPotentialInfo(i + 2, j - 1) || this.isPotentialInfo(i + 2, j) || this.isPotentialInfo(i + 2, j + 1)) {
					continue;  // this skips the rest of the logic below this in the for-loop 
				}

                // is both hidden tiles being mines a valid option?
                tile1.setFoundBomb();
                tile2.setFoundBomb();
                var counter = solver.countSolutions(this.board, null);
                tile1.unsetFoundBomb();
                tile2.unsetFoundBomb();

                if (counter.finalSolutionsCount != 0) {
                    this.writeToConsole(tile1.asText() + " and " + tile2.asText() + " can support 2 mines");
                } else {
                    this.writeToConsole(tile1.asText() + " and " + tile2.asText() + " can not support 2 mines, we should guess here immediately");
                    return tile1;
                 }

			}
		} 

        for (let i = 0; i < this.board.width; i++) {
            for (let j = 0; j < this.board.height - 1; j++) {

                const tile1 = this.board.getTileXY(i, j);
				if (!tile1.isCovered() || tile1.isSolverFoundBomb()) {  // cleared or a known mine
                    continue;
                }

                const tile2 = this.board.getTileXY(i, j + 1);
				if (!tile2.isCovered() || tile2.isSolverFoundBomb()) {  // cleared or a known mine
                    continue;
                }

                // if information can come from any of the 6 tiles immediately above and below then can't be a 50-50
                if (this.isPotentialInfo(i - 1, j - 1) || this.isPotentialInfo(i, j - 1) || this.isPotentialInfo(i + 1, j - 1)
                    || this.isPotentialInfo(i - 1, j + 2) || this.isPotentialInfo(i, j + 2) || this.isPotentialInfo(i + 1, j + 2)) {
                    continue;  // this skips the rest of the logic below this in the for-loop 
                }

                // is both hidden tiles being mines a valid option?
                tile1.setFoundBomb();
                tile2.setFoundBomb();
                var counter = solver.countSolutions(this.board, null);
                tile1.unsetFoundBomb();
                tile2.unsetFoundBomb();

                if (counter.finalSolutionsCount != 0) {
                    this.writeToConsole(tile1.asText() + " and " + tile2.asText() + " can support 2 mines");
                } else {
                    this.writeToConsole(tile1.asText() + " and " + tile2.asText() + " can not support 2 mines, we should guess here immediately");
                    return tile1;
                }

            }
        } 

		// box 2x2
		const tiles = Array(4);

		//const mines = [];
		//const noMines = [];
		for (let i = 0; i < this.board.width - 1; i++) {
			for (let j = 0; j < this.board.height - 1; j++) {

				// need 4 hidden tiles
				tiles[0] = this.board.getTileXY(i, j);
				if (!tiles[0].isCovered() || tiles[0].isSolverFoundBomb()) {
					continue;
				}

				tiles[1] = this.board.getTileXY(i + 1, j);
				if (!tiles[1].isCovered() || tiles[1].isSolverFoundBomb()) {
					continue;
				}

				tiles[2] = this.board.getTileXY(i, j + 1);
				if (!tiles[2].isCovered() || tiles[2].isSolverFoundBomb()) {
					continue;
				}

				tiles[3] = this.board.getTileXY(i + 1, j + 1);
				if (!tiles[3].isCovered() || tiles[3].isSolverFoundBomb()) {
					continue;
				}

				// need the corners to be flags
				if (this.isPotentialInfo(i - 1, j - 1) || this.isPotentialInfo(i + 2, j - 1) || this.isPotentialInfo(i - 1, j + 2) || this.isPotentialInfo(i + 2, j + 2)) {
					continue;  // this skips the rest of the logic below this in the for-loop 
				}

				this.writeToConsole(tiles[0].asText() + " " + tiles[1].asText() + " " + tiles[2].asText() + " " + tiles[3].asText() + " is candidate box 50/50");

				// keep track of which tiles are risky - once all 4 are then not a pseudo-50/50
				let riskyTiles = 0;
				const risky = Array(4).fill(false);

				// check each tile is in the web and that at least one is living
				let okay = true;
				let allDead = true;
				for (let l = 0; l < 4; l++) {
					if (!this.isDead(tiles[l])) {
						allDead = false;
					} else {
						riskyTiles++;
						risky[l] = true;  // since we'll never select a dead tile, consider them risky
					}

					if (!this.isWitnessed(tiles[l])) {
						this.writeToConsole(tiles[l].asText() + " has no witnesses");
						okay = false;
						break;
					}
				}
				if (!okay) {
					continue;
				}
				if (allDead) {
					this.writeToConsole("All tiles in the candidate are dead");
					continue
				}

				let start;
				if (this.minesLeft > 3) {
					start = 0;
				} else if (this.minesLeft == 3) {
					start = 1;
				} else if (this.minesLeft == 2) {
					start = 5;
				} else {
					start = 9;
				}

				for (let k = start; k < FiftyFiftyHelper.PATTERNS.length; k++) {

					const mines = [];
					const noMines = [];

					var run = false;
					// allocate each position as a mine or noMine
					for (let l = 0; l < 4; l++) {
						if (FiftyFiftyHelper.PATTERNS[k][l]) {
							mines.push(tiles[l]);
							if (!risky[l]) {
								run = true;
							}
						} else {
							noMines.push(tiles[l]);
						}
					}

					// only run if this pattern can discover something we don't already know
					if (!run) {
						this.writeToConsole("Pattern " + k + " skipped");
						continue;
					}

					// place the mines
					for (let tile of mines) {
						tile.setFoundBomb();
					}

					// see if the position is valid
					const counter = solver.countSolutions(this.board, noMines);

					// remove the mines
					for (let tile of mines) {
						tile.unsetFoundBomb();
					}

					// if it is then mark each mine tile as risky
					if (counter.finalSolutionsCount != 0) {
						this.writeToConsole("Pattern " + k + " is valid");
						for (let l = 0; l < 4; l++) {
							if (FiftyFiftyHelper.PATTERNS[k][l]) {
								if (!risky[l]) {
									risky[l] = true;
									riskyTiles++;
								}
							}
						}
						if (riskyTiles == 4) {
							break;
						}
					} else {
						this.writeToConsole("Pattern " + k + " is not valid");
					}
				}

				// if not all 4 tiles are risky then send back one which isn't
				if (riskyTiles != 4) {
					for (let l = 0; l < 4; l++) {
						// if not risky and not dead then select it
						if (!risky[l]) {
							this.writeToConsole(tiles[0].asText() + " " + tiles[1].asText() + " " + tiles[2].asText() + " " + tiles[3].asText() + " is pseudo 50/50 - " + tiles[l].asText() + " is not risky");
							return tiles[l];
						}

					}
				}
			}
		}                        

        this.duration = Date.now() - startTime;

        // remove all the mines found by the probability engine - if we don't do this it upsets the brute force deep analysis processing
        for (var mine of this.minesFound) {
            mine.unsetFoundBomb();
        }

        this.writeToConsole("5050 checker took " + this.duration + " milliseconds");

        return null;

	}

    // returns whether there information to be had at this location; i.e. on the board and either unrevealed or revealed
    isPotentialInfo(x, y) {

        if (x < 0 || x >= this.board.width || y < 0 || y >= this.board.height) {
            return false;
        }

        if (this.board.getTileXY(x, y).isSolverFoundBomb()) {
            return false;
        } else {
            return true;
        }

    }

	isDead(tile) {

		//  is the tile dead
		for (let k = 0; k < this.deadTiles.length; k++) {
			if (this.deadTiles[k].isEqual(tile)) {
				return true;
			}
		}

		return false;

    }

	isWitnessed(tile) {

		//  is the tile witnessed
		for (let k = 0; k < this.witnessedTiles.length; k++) {
			if (this.witnessedTiles[k].isEqual(tile)) {
				return true;
			}
		}

		return false;

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


"use strict";

class LongTermRiskHelper {

	constructor(board, pe, options) {

		this.options = options;
		this.board = board;
		this.currentPe = pe;
		this.deadTiles = pe.getDeadTiles();
		this.fifty = pe.getFiftyPercenters();
		this.currentLongTermSafety = 1;
		this.risk5050s = [];

		// sort into location order
		this.fifty.sort(function (a, b) { return (a.y * 10000 + a.x) - (b.y * 10000 + b.x)});

		console.log("Fifty percenters " + this.fifty.length);

	}

	findRisks() {

		let longTermSafety = 1;

		for (let i = 0; i < this.fifty.length; i++) {

			const tile1 = this.fifty[i];
			let tile2;

			let info = null;
			let risk = null;

			for (let j = i + 1; j < this.fifty.length; j++) {
				tile2 = this.fifty[j];

				// tile2 is below tile1
				if (tile1.x == tile2.x && tile1.y == tile2.y - 1) {
					info = this.checkVerticalInfo(tile1, tile2);

					if (info == null) { // try extending it

						const tile3 = this.getFifty(tile2.x, tile2.y + 2);
						const tile4 = this.getFifty(tile2.x, tile2.y + 3);

						if (tile3 != null && tile4 != null) {
							info = this.checkVerticalInfo(tile1, tile4);
							if (info != null) {
								const tiles = [tile1, tile2, tile3, tile4];
								risk = new Risk5050(info, tiles, this.filterDead(tiles));
							}
						}

					} else {
						const tiles = [tile1, tile2];
						risk = new Risk5050(info, tiles, this.filterDead(tiles));
					}

					break;
				}

				// tile 2 is right of tile1
				if (tile1.x == tile2.x - 1 && tile1.y == tile2.y) {
					info = this.checkHorizontalInfo(tile1, tile2);

					if (info == null) { // try extending it

						const tile3 = this.getFifty(tile2.x + 2, tile2.y);
						const tile4 = this.getFifty(tile2.x + 3, tile2.y);

						if (tile3 != null && tile4 != null) {
							info = this.checkHorizontalInfo(tile1, tile4);
							if (info != null) {
								const tiles = [tile1, tile2, tile3, tile4];
								risk = new Risk5050(info, tiles, this.filterDead(tiles));
							}
						}

					} else {
						const tiles = [tile1, tile2];
						risk = new Risk5050(info, tiles, this.filterDead(tiles));
					}

					break;
				}

			}

			// if the 2 fifties form a pair with only 1 remaining source of information
			if (risk != null) {
				this.risk5050s.push(risk);  // store the positions of interest

				const safety = 1 - (1 - this.currentPe.getProbability(info)) * 0.5;

				this.writeToConsole(tile1.asText() + " " + tile2.asText() + " has 1 remaining source of information - tile " + info.asText() + " " + safety);
				longTermSafety = longTermSafety * safety;
			}

		}

		if (longTermSafety != 1) {
			this.writeToConsole("Total long term safety " + longTermSafety);
		}


		this.currentLongTermSafety = longTermSafety;

	}


	getFifty(x, y) {

		for (const loc of this.fifty) {
			if (loc.x == x && loc.y == y) {
				return loc;
			}
		}

		return null;

	}

	get5050Breakers() {
		const breakers = [];

		for (const risk of this.risk5050s) {
			for (const tile of risk.livingArea) {
				breakers.push(new Action(tile.x, tile.y, this.currentPe.getProbability(tile), ACTION_CLEAR));
            }
			//breakers.push(...risk.livingArea);
		}

		return breakers;
	}

	getLongTermSafety() {
		return this.currentLongTermSafety;
	}

	getLongTermSafety(candidate, pe) {

		let longTermSafety = 1;

		for (const risk of this.risk5050s) {
			let safety = null;

			// is the candidate part of the 50/50 - if so it is being broken
			for (const loc of risk.area) {
				if (loc.isEqual(candidate)) {
					safety = 1;
					break;
				}
			}

			if (safety == null) {
				if (risk.poi.isEqual(candidate)) {
					safety = 1;
				} else {
					safety = 1 - (1 - pe.getProbability(risk.poi)) * 0.5;
				}
			}

			longTermSafety = longTermSafety * safety;
		}

		return longTermSafety;

	}


	// returns the location of the 1 tile which can still provide information, or null
	checkVerticalInfo(tile1, tile2) {

		let info = null;

		const top = tile1.y - 1;
		const bottom = tile2.y + 1;

		const left = tile1.x - 1;

		if (this.isPotentialInfo(left, top)) {
			if (this.board.getTileXY(left, top)) {
				return null;
			} else {
				info = this.board.getTileXY(left, top);
			}
		}

		if (this.isPotentialInfo(left + 1, top)) {
			if (!this.board.getTileXY(left + 1, top).isCovered()) {  // info is certain
				return null;
			} else {
				if (info != null) {  // more than 1 tile giving possible info
					return null;
				}
			}
			info = this.board.getTileXY(left + 1, top);
		}

		if (this.isPotentialInfo(left + 2, top)) {
			if (!this.board.getTileXY(left + 2, top).isCovered()) {  // info is certain
				return null;
			} else {
				if (info != null) {  // more than 1 tile giving possible info
					return null;
				}
			}
			info = this.board.getTileXY(left + 2, top);
		}

		if (this.isPotentialInfo(left, bottom)) {
			if (!this.board.getTileXY(left, bottom).isCovered()) {  // info is certain
				return null;
			} else {
				if (info != null) {  // more than 1 tile giving possible info
					return null;
				}
			}
			info = this.board.getTileXY(left, bottom);
		}

		if (this.isPotentialInfo(left + 1, bottom)) {
			if (!this.board.getTileXY(left + 1, bottom).isCovered()) {  // info is certain
				return null;
			} else {
				if (info != null) {  // more than 1 tile giving possible info
					return null;
				}
			}
			info = this.board.getTileXY(left + 1, bottom);
		}

		if (this.isPotentialInfo(left + 2, bottom)) {
			if (!this.board.getTileXY(left + 2, bottom).isCovered()) {  // info is certain
				return null;
			} else {
				if (info != null) {  // more than 1 tile giving possible info
					return null;
				}
			}
			info = this.board.getTileXY(left + 2, bottom);
		}

		return info;

	}

	// returns the location of the 1 tile which can still provide information, or null
	checkHorizontalInfo(tile1, tile2) {

		let info = null;

		const top = tile1.y - 1;

		const left = tile1.x - 1;
		const right = tile2.x + 1;

		if (this.isPotentialInfo(left, top)) {
			if (!this.board.getTileXY(left, top).isCovered()) {
				return null;
			} else {
				info = this.board.getTileXY(left, top);
			}
		}

		if (this.isPotentialInfo(left, top + 1)) {
			if (!this.board.getTileXY(left, top + 1).isCovered()) {  // info is certain
				return null;
			} else {
				if (info != null) {  // more than 1 tile giving possible info
					return null;
				}
			}
			info = this.board.getTileXY(left, top + 1);
		}

		if (this.isPotentialInfo(left, top + 2)) {
			if (!this.board.getTileXY(left, top + 2).isCovered()) {  // info is certain
				return null;
			} else {
				if (info != null) {  // more than 1 tile giving possible info
					return null;
				}
			}
			info = this.board.getTileXY(left, top + 2);
		}

		if (this.isPotentialInfo(right, top)) {
			if (!this.board.getTileXY(right, top).isCovered()) {  // info is certain
				return null;
			} else {
				if (info != null) {  // more than 1 tile giving possible info
					return null;
				}
			}
			info = this.board.getTileXY(right, top);
		}

		if (this.isPotentialInfo(right, top + 1)) {
			if (!this.board.getTileXY(right, top + 1).isCovered()) {  // info is certain
				return null;
			} else {
				if (info != null) {  // more than 1 tile giving possible info
					return null;
				}
			}
			info = this.board.getTileXY(right, top + 1);
		}

		if (this.isPotentialInfo(right, top + 2)) {
			if (!this.board.getTileXY(right, top + 2).isCovered()) {  // info is certain
				return null;
			} else {
				if (info != null) {  // more than 1 tile giving possible info
					return null;
				}
			}
			info = this.board.getTileXY(right, top + 2);
		}

		return info;

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

	filterDead(tiles) {

		const result = [];

		for (const tile of tiles) {
			//  is the tile dead
			let dead = false;
			for (let k = 0; k < this.deadTiles.length; k++) {
				if (this.deadTiles[k].isEqual(tile)) {
					dead = true;
					break;
				}
			}
			if (!dead) {
				result.push(tile);
            }
        }

		return result;

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

class Risk5050 {

	constructor(poi, locs, livingLocs) {
		this.poi = poi;
		this.area = locs;
		this.livingArea = livingLocs;
	}

}



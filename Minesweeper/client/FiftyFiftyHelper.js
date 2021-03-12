"use strict";

class FiftyFiftyHelper {

    constructor(board, minesFound, options) {

        this.board = board;
        this.options = options;
        this.minesFound = minesFound;  // this is a list of tiles which the probability engine knows are mines

    }

    // this process looks for positions which are either 50/50 guesses or safe.  In which case they should be guessed as soon as possible
    process() {

        var start = Date.now();

        // place all the mines found by the probability engine
        for (var mine of this.minesFound) {
            mine.setFoundBomb();
        }

		for (var i = 0; i < this.board.width - 1; i++) {
			for (var j = 0; j < this.board.height; j++) {

                var tile1 = this.board.getTileXY(i, j);
                if (!tile1.isCovered()) {
                    continue;
                }

                var tile2 = this.board.getTileXY(i + 1, j);
                if (!tile2.isCovered()) {
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
                var counter = solver.countSolutions(board);
                tile1.unsetFoundBomb();
                tile2.unsetFoundBomb();

                if (counter.finalSolutionsCount != 0) {
                    this.writeToConsole(tile1.asText() + " and " + tile2.asText() + " can support 2 mines");
                } else {
                    this.writeToConsole(tile1.asText() + " and " + tile2.asText() + " can not support 2 mines, we should guess here immediately");
                    return tile1;
                 }

				//if (isOnlyOne(i, j - 1) || isOnlyOne(i + 1, j - 1) || isOnlyOne(i, j + 1) || isOnlyOne(i + 1, j + 1)) {
				//	Action a = new Action(new Location(i, j), Action.CLEAR, MoveMethod.UNAVOIDABLE_GUESS, "Fifty-Fifty", BigDecimal.valueOf(0.5d));  // this probability is wrong
				//	fm = new FinalMoves(a);
				//	return fm;
				//}
			}
		} 

        for (var i = 0; i < this.board.width; i++) {
            for (var j = 0; j < this.board.height - 1; j++) {

                var tile1 = this.board.getTileXY(i, j);
                if (!tile1.isCovered()) {
                    continue;
                }

                var tile2 = this.board.getTileXY(i, j + 1);
                if (!tile2.isCovered()) {
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
                var counter = solver.countSolutions(board);
                tile1.unsetFoundBomb();
                tile2.unsetFoundBomb();

                if (counter.finalSolutionsCount != 0) {
                    this.writeToConsole(tile1.asText() + " and " + tile2.asText() + " can support 2 mines");
                } else {
                    this.writeToConsole(tile1.asText() + " and " + tile2.asText() + " can not support 2 mines, we should guess here immediately");
                    return tile1;
                }

                //if (isOnlyOne(i, j - 1) || isOnlyOne(i + 1, j - 1) || isOnlyOne(i, j + 1) || isOnlyOne(i + 1, j + 1)) {
                //	Action a = new Action(new Location(i, j), Action.CLEAR, MoveMethod.UNAVOIDABLE_GUESS, "Fifty-Fifty", BigDecimal.valueOf(0.5d));  // this probability is wrong
                //	fm = new FinalMoves(a);
                //	return fm;
                //}
            }
        } 

        this.duration = Date.now() - start;

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

    writeToConsole(text, always) {

        if (always == null) {
            always = false;
        }

        if (this.options.verbose || always) {
            console.log(text);
        }

    }

}


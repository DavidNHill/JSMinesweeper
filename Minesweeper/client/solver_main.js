/**
 * 
 */
"use strict";

const PLAY_BFDA_THRESHOLD = 750;       // number of solutions for the Brute force analysis to start
const ANALYSIS_BFDA_THRESHOLD = 5000; 
const HARD_CUT_OFF = 0.90;        // cutoff for considering on edge possibilities below the best probability
const OFF_EDGE_THRESHOLD = 0.95;  // when to include possibilities off the edge
const PROGRESS_CONTRIBUTION = 0.2;  // how much progress counts towards the final score

const PLAY_STYLE_FLAGS = 1;
const PLAY_STYLE_NOFLAGS = 2;
const PLAY_STYLE_EFFICIENCY = 3;

//const NO_FLAGS = true;
//const PLAY_FOR_EFFICIENCY = true;

function solver(board, playStyle) {

    if (playStyle == null) {
        playStyle = PLAY_STYLE_FLAGS;
    }

	// find all the tiles which are revealed and have un-revealed / un-flagged adjacent squares
    var allCoveredTiles = [];
	var witnesses = [];
    var witnessed = [];
    var unflaggedMines = [];

    var minesLeft = board.num_bombs;
    var squaresLeft = 0; 

    var deadTiles = [];  // used to hold the tiles which have been determined to be dead by either the probability engine or deep analysis

	var work = new Set();  // use a map to deduplicate the witnessed tiles
   
    showMessage("The solver is thinking...");

	for (var i=0; i < board.tiles.length; i++) {

		var tile = board.getTile(i);

        tile.clearHint();  // clear any previous hints

        if (tile.isSolverFoundBomb()) {
            minesLeft--;
            tile.setProbability(0);
            if (!tile.isFlagged()) {
                unflaggedMines.push(tile);
            }
            continue;  // if the tile is a mine then nothing to consider
        } else if (tile.isCovered()) {
            squaresLeft++;
            allCoveredTiles.push(tile);
			continue;  // if the tile hasn't been revealed yet then nothing to consider
		}
		
		var adjTiles = board.getAdjacent(tile);
		
		var needsWork = false;
		for (var j=0; j < adjTiles.length; j++) {
			var adjTile = adjTiles[j];
			if (adjTile.isCovered() && !adjTile.isSolverFoundBomb()) {
				needsWork = true;
				work.add(adjTile.index);
			} 
		}

		if (needsWork) {  // the witness still has some unrevealed adjacent tiles
			witnesses.push(tile);
		}
		
	}	
	
	// generate an array of tiles from the map
    for (var index of work) {
        var tile = board.getTile(index);
        tile.setOnEdge(true);
		witnessed.push(tile);
	}

    board.setHighDensity(squaresLeft, minesLeft);

    console.log("tiles left = " + squaresLeft);
    console.log("mines left = " + minesLeft);
	console.log("Witnesses  = " + witnesses.length);
	console.log("Witnessed  = " + witnessed.length);

    var result = [];
 
    // if we are in flagged mode then flag any mines currently unflagged
    if (playStyle == PLAY_STYLE_FLAGS) {
        for (var tile of unflaggedMines) {
            result.push(new Action(tile.getX(), tile.getY(), 0, ACTION_FLAG));
        }
    }

    // if there are no mines left to find the everything else is to be cleared
    if (minesLeft == 0) {
         for (var i = 0; i < allCoveredTiles.length; i++) {
            var tile = allCoveredTiles[i];
            result.push(new Action(tile.getX(), tile.getY(), 1, ACTION_CLEAR))
        }
        showMessage("No mines left to find all remaining tiles are safe");
        return new EfficiencyHelper(board, witnesses, result, playStyle).process();
        //return result;
    }

    var oldMineCount = result.length;

    // add any trivial moves we've found
	result.push(...trivial_actions(board, witnesses));

    if (result.length > oldMineCount) {
        showMessage("The solver found " + result.length + " trivial safe moves");

        if (playStyle != PLAY_STYLE_FLAGS) {
            var mineFound = false;
            var noFlagResult = [];
            for (var i = 0; i < result.length; i++) {

                var action = result[i];

                if (action.prob == 0) {   // zero safe probability == mine
                    mineFound = true;
                } else {   // otherwise we're trying to clear
                    noFlagResult.push(action);
                }
            }
            if (playStyle == PLAY_STYLE_NOFLAGS) {  // flag free but not efficiency, send the clears
                return noFlagResult;
            } else if (mineFound) { // if we are playing for efficiency and a mine was found then we can't continue. send nothing and try again
                return [];
            }
            // if we are playing for efficiency and a mine wasn't found then go on to do the probability engine - this gets use all the possible clears and mines
            //return new EfficiencyHelper(board, witnesses, noFlagResult).process();
        } else {
            var cleanResult = [];
            for (var i = 0; i < result.length; i++) {

                var action = result[i];
                if (action.action == ACTION_FLAG) {
                    var tile = board.getTileXY(action.x, action.y);

                    if (!tile.isFlagged()) {   // if the newly found mine is already flagged then don't do it
                        cleanResult.push(action);
                    }
                } else {
                    cleanResult.push(action);
                }
 
            }
            return cleanResult;
        }
 
    }

    //var peStart = Date.now();
 
	var pe = new ProbabilityEngine(board, witnesses, witnessed, squaresLeft, minesLeft, playStyle);

    pe.process();

    console.log("probability Engine took " + pe.duration + " milliseconds to complete");

    if (pe.finalSolutionCount == 0) {
        showMessage("The board is in an illegal state");
        return result;
    }

    // if the tiles off the edge are definitely safe then clear them all
    var offEdgeAllSafe = false;
    if (pe.offEdgeProbability == 1) {
        var edgeSet = new Set();  // build a set containing all the on edge tiles
        for (var i = 0; i < witnessed.length; i++) {
            edgeSet.add(witnessed[i].index);
        }
        // any tiles not on the edge can be cleared
        for (var i = 0; i < allCoveredTiles.length; i++) {
            var tile = allCoveredTiles[i];
            if (!edgeSet.has(tile.index)) {
                result.push(new Action(tile.getX(), tile.getY(), 1, ACTION_CLEAR));
            }
        }

        if (result.length > 0) {
            console.log("The Probability Engine has determined all off edge tiles must be safe");
            offEdgeAllSafe = true;
            //showMessage("The solver has determined all off edge tiles must be safe");
            //return result;
        }

    }

    // have we found any local clears which we can use or everything off the edge is safe
    if (pe.localClears.length > 0) {
        for (var tile of pe.localClears) {   // place each local clear into an action
            var action = new Action(tile.getX(), tile.getY(), 1, ACTION_CLEAR);
            result.push(action);
        }

        for (var tile of pe.minesFound) {   // place each found flag
            tile.setFoundBomb();
            if (playStyle == PLAY_STYLE_FLAGS) {
                var action = new Action(tile.getX(), tile.getY(), 0, ACTION_FLAG);
                result.push(action);
            }
        }

        showMessage("The probability engine has found " + pe.localClears.length + " safe clears");
        return new EfficiencyHelper(board, witnesses, result, playStyle).process();
    }

    // set all off edge probabilities
    for (var i = 0; i < board.tiles.length; i++) {

        var tile = board.getTile(i);

        if (tile.isSolverFoundBomb()) {
            if (!tile.isFlagged()) {
                tile.setProbability(0);
            }
        } else if (tile.isCovered() && !tile.onEdge) {
            tile.setProbability(pe.offEdgeProbability);
        }
    }	


    // if we have an isolated edge process that
    if (pe.bestProbability < 1 && pe.isolatedEdgeBruteForce != null) {

        var solutionCount = pe.isolatedEdgeBruteForce.crunch();

        console.log("Solutions found by brute force for isolated edge " + solutionCount);

        var bfda = new BruteForceAnalysis(pe.isolatedEdgeBruteForce.allSolutions, pe.isolatedEdgeBruteForce.iterator.tiles, 1000);  // the tiles and the solutions need to be in sync

        bfda.process();

        // if the brute force deep analysis completed then use the results
        if (bfda.completed) {
            // if they aren't all dead then send the best guess
            if (!bfda.allTilesDead()) {
                var nextmove = bfda.getNextMove();
                result.push(nextmove);

                //for (var tile of bfda.deadTiles) {   // show all dead tiles when deep analysis is happening
                //    var action = new Action(tile.getX(), tile.getY(), tile.probability);
                //    action.dead = true;
                //    result.push(action);
                //}

                deadTiles = bfda.deadTiles;
                var winChanceText = (bfda.winChance * 100).toFixed(2);
                showMessage("The solver has calculated the best move has a " + winChanceText + "% chance to solve the isolated edge." + formatSolutions(pe.finalSolutionsCount));

            } else {
                showMessage("The solver has calculated that all the tiles on the isolated edge are dead." + formatSolutions(pe.finalSolutionsCount));
                deadTiles = bfda.deadTiles;   // all the tiles are dead
            }

            // identify the dead tiles
            for (var tile of deadTiles) {   // show all dead tiles 
                if (playStyle == PLAY_STYLE_FLAGS || tile.probability != 0) {
                    var action = new Action(tile.getX(), tile.getY(), tile.probability);
                    action.dead = true;
                    result.push(action);
                }
             }

            return result;
        }

    }

    // if we are having to guess and there are less then BFDA_THRESHOLD solutions use the brute force deep analysis...
    var bfdaThreshold;
    if (analysisMode) {
        bfdaThreshold = ANALYSIS_BFDA_THRESHOLD;
    } else {
        bfdaThreshold = PLAY_BFDA_THRESHOLD;
    }

    if (pe.bestProbability < 1 && pe.finalSolutionsCount < bfdaThreshold) {

        showMessage("The solver is starting brute force deep analysis on " + pe.finalSolutionsCount + " solutions");
        pe.generateIndependentWitnesses();

        var iterator = new WitnessWebIterator(pe, allCoveredTiles, -1);

        var bruteForce = new Cruncher(board, iterator);

        var solutionCount = bruteForce.crunch();

        console.log("Solutions found by brute force " + solutionCount);

        var bfda = new BruteForceAnalysis(bruteForce.allSolutions, iterator.tiles, 1000);  // the tiles and the solutions need to be in sync

        bfda.process();

        // if the brute force deep analysis completed then use the results
        if (bfda.completed) {
            // if they aren't all dead then send the best guess
            if (!bfda.allTilesDead()) {
                var nextmove = bfda.getNextMove();
                result.push(nextmove);

                //for (var tile of bfda.deadTiles) {   // show all dead tiles when deep analysis is happening
                //    var action = new Action(tile.getX(), tile.getY(), tile.probability);
                //    action.dead = true;
                //    result.push(action);
                //}

                deadTiles = bfda.deadTiles;
                var winChanceText = (bfda.winChance * 100).toFixed(2);
                showMessage("The solver has calculated the best move has a " + winChanceText + "% chance to win the game." + formatSolutions(pe.finalSolutionsCount));

            } else {
                showMessage("The solver has calculated that all the remaining tiles are dead." + formatSolutions(pe.finalSolutionsCount));
                deadTiles = allCoveredTiles;   // all the tiles are dead
            }

            // identify the dead tiles
            for (var tile of deadTiles) {   // show all dead tiles 
                if (tile.probability != 0) {   // a mine isn't dead
                    var action = new Action(tile.getX(), tile.getY(), tile.probability);
                    action.dead = true;
                    result.push(action);
                }
            }

            return result;
        } else {
            deadTiles = pe.getDeadTiles();  // use the dead tiles from the probability engine
        }

    } else {
        deadTiles = pe.getDeadTiles();  // use the dead tiles from the probability engine
    }

    // ... otherwise we will use the probability engines results


    //result = pe.getBestCandidates(HARD_CUT_OFF);  // get best options within this ratio of the best value
    result.push(...pe.getBestCandidates(HARD_CUT_OFF));  // get best options within this ratio of the best value


    // if the off edge tiles are within tolerance then add them to the candidates to consider as long as we don't have certain clears
    if (pe.bestOnEdgeProbability != 1 && pe.offEdgeProbability > pe.bestOnEdgeProbability * OFF_EDGE_THRESHOLD) {
        result.push(...getOffEdgeCandidates(board, pe, witnesses, allCoveredTiles));
        result.sort(function (a, b) { return b.prob - a.prob });
    }

    // if we have some good guesses on the edge
    if (result.length > 0) {
        for (var i = 0; i < deadTiles.length; i++) {
            var tile = deadTiles[i];

            //console.log("Tile " + tile.asText() + " is dead with value " + pe.deadCandidates[i].total);
            console.log("Tile " + tile.asText() + " is dead");
            var found = false;
            for (var j = 0; j < result.length; j++) {
                if (result[j].x == tile.x && result[j].y == tile.y) {
                    result[j].dead = true;
                    found = true;
                    break;
                }
            }

        }

        if (pe.bestProbability == 1) {
            showMessage("The solver has found some certain moves using the probability engine." + formatSolutions(pe.finalSolutionsCount));

            // identify where the bombs are
            for (var tile of pe.minesFound) {
                tile.setFoundBomb();
                if (playStyle == PLAY_STYLE_FLAGS) {
                    var action = new Action(tile.getX(), tile.getY(), 0, ACTION_FLAG);
                    result.push(action);
                }
            }
            result = new EfficiencyHelper(board, witnesses, result, playStyle).process();
        } else {
            showMessage("The solver has found the best guess on the edge using the probability engine." + formatSolutions(pe.finalSolutionsCount));
            if (pe.duration < 50) {  // if the probability engine didn't take long then use some tie-break logic
                result = tieBreak(pe, result);
            }
        }

    } else {  // otherwise look for a guess with the least number of adjacent covered tiles (hunting zeros)
        var bestGuessTile = offEdgeGuess(board, witnessed);

        result.push(new Action(bestGuessTile.getX(), bestGuessTile.getY(), pe.offEdgeProbability), ACTION_CLEAR);

        showMessage("The solver has decided the best guess is off the edge." + formatSolutions(pe.finalSolutionsCount));

    }

    // identify the dead tiles
    for (var tile of deadTiles) {   // show all dead tiles 
        if (tile.probability != 0 & tile.probability != 1) {  // a definite mine or clear isn't considered dead
            var action = new Action(tile.getX(), tile.getY(), tile.probability);
            action.dead = true;
            result.push(action);
        }
    }

	return result;
	
}

function tieBreak(pe, actions) {

    var best; 
    for (var action of actions) {

        if (action.action == ACTION_FLAG) { // ignore the action if it is a flagging request
            continue;
        }

        if (best != null) {
            if (action.prob * (1 + PROGRESS_CONTRIBUTION) < best.weight) {
                console.log("(" + action.x + "," + action.y + ") is ignored because it can never do better than the best");
                continue;
            }
        }

        fullAnalysis(pe, board, action);  // updates variables in the Action class

        if (best == null || best.weight < action.weight) {
            best = action;
        }

    }

    if (board.isHighDensity()) {
        actions.sort(function (a, b) {

            var c = b.prob - a.prob;
            if (c != 0) {
                return c;
            } else if (a.maxSolutions > b.maxSolutions) {
                return 1;
            } else if (a.maxSolutions < b.maxSolutions) {
                return -1;
            } else {
                return b.weight - a.weight;
            }

        });
    } else {
        actions.sort(function (a, b) {

            var c = b.weight - a.weight;
            if (c != 0) {
                return c;
            } else {

                return b.expectedClears - a.expectedClears;
            }

        });
    }


    console.log("Solver recommends (" + actions[0].x + "," + actions[0].y + ")");

    return actions;

}

function trivial_actions(board, witnesses) {
	
	var result = new Map();
	
	for (var i=0; i < witnesses.length; i++) {
		
		var tile = witnesses[i];

		//if (tile.isCovered() || tile.isFlagged()) {
		//	continue;  // if the tile hasn't been revealed yet then nothing to consider
		//}
		
		var adjTiles = board.getAdjacent(tile);
		
		var flags = 0
		var covered = 0;
		for (var j=0; j < adjTiles.length; j++) {
            var adjTile = adjTiles[j];
            if (adjTile.isSolverFoundBomb()) {
				flags++;
			} else if (adjTile.isCovered()) {
				covered++;
			}
		}

		// if the tile has the correct number of flags then the other adjacent tiles are clear
		if (flags == tile.getValue() && covered > 0) {
			for (var j=0; j < adjTiles.length; j++) {
				var adjTile = adjTiles[j];
                if (adjTile.isCovered() && !adjTile.isSolverFoundBomb()) {
                    adjTile.setProbability(1);  // definite clear
					result.set(adjTile.index, new Action(adjTile.getX(), adjTile.getY(), 1, ACTION_CLEAR));
				}
			}			
		}
		
		// if the tile has n remaining covered squares and needs n more flags then all the adjacent files are flags
        if (tile.getValue() == flags + covered && covered > 0) {
			for (var j=0; j < adjTiles.length; j++) {
                var adjTile = adjTiles[j];
                if (adjTile.isCovered() && !adjTile.isSolverFoundBomb()) { // if covered, not already a known mine and isn't flagged
                    adjTile.setProbability(0);  // definite mine
                    adjTile.setFoundBomb();
                    //if (!adjTile.isFlagged()) {  // if not already flagged then flag it
                    result.set(adjTile.index, new Action(adjTile.getX(), adjTile.getY(), 0, ACTION_FLAG));
                    //}

 				}
			}			
		}
		
	}
	
	console.log("Found " + result.size + " moves trivially");


    // send it back as an array
    return Array.from(result.values());
	
}

    /**
     * Find the best guess off the edge when the probability engine doesn't give the best guess as on edge
     */
    function offEdgeGuess(board, witnessed) {

        var action;

        // get the starting move if we are at the start of the game
        //if (myGame.getGameState() == GameStateModel.NOT_STARTED && playOpening) {
        //    if (overriddenStartLocation != null) {
        //        action = new Action(overriddenStartLocation, Action.CLEAR, MoveMethod.BOOK, "", offContourBigProb);
        //    } else {
        //        action = new Action(myGame.getStartLocation(), Action.CLEAR, MoveMethod.BOOK, "", offContourBigProb);
        //    }
        //}


        // if there is no book move then look for a guess off the edge
        if (action == null) {

            var edgeSet = new Set();  // build a set containing all the on edge tiles
            for (var i = 0; i < witnessed.length; i++) {
                edgeSet.add(witnessed[i].index);
            }

            var list = [];

            var bestGuess;
            var bestGuessCount = 9;

            for (var i = 0; i < board.tiles.length; i++) {
                var tile = board.getTile(i);

                // if we are an unrevealed square and we aren't on the edge
                // then store the location
                if (tile.isCovered() && !tile.isSolverFoundBomb() && !edgeSet.has(tile.index)) { // if the tile is covered and not on the edge

                    var adjCovered = board.adjacentCoveredCount(tile);

                    if (adjCovered > 0 && adjCovered < bestGuessCount) {
                        bestGuessCount = adjCovered;
                        bestGuess = tile;
                    }
                }
            }

            // ... and pick the first one
            action = bestGuess;
        }

        return action;

}

// location with probability of being safe
class Action {
	constructor(x, y, prob, action) {
		this.x = x;
		this.y = y;
        this.prob = prob;
        this.action = action;
        this.dead = false;

        // part of full analysis output, until then assume worst case 
        this.progress = 0;
        this.expectedClears;
        this.weight = prob;
        this.maxSolutions;
 	}
	
}

const OFFSETS = [[2, 0], [-2, 0], [0, 2], [0, -2]];
const OFFSETS_ALL = [[ 2,-2], [ 2, -1], [ 2, 0 ], [ 2, 1 ], [ 2, 2 ], [ -2, -2 ], [ -2, -1 ], [ -2, 0 ], [ -2, 1 ], [ -2, 2 ], [ -1, 2 ], [ 0, 2 ], [ 1, 2 ], [ -1, -2 ], [ 0, -2 ], [ 1, -2 ]];

function getOffEdgeCandidates(board, pe, witnesses, allCoveredTiles) {

    console.log("getting off edge candidates");

    var accepted = new Set();  // use a map to deduplicate the witnessed tiles

    // if there are only a small number of tiles off the edge then consider them all
    if (allCoveredTiles.length - pe.witnessed.length < 30) {
        for (var i = 0; i < allCoveredTiles.length; i++) {
            var workTile = allCoveredTiles[i];
            // if the tile  isn't on the edge
            if (!workTile.onEdge) {
                accepted.add(workTile);
            }
        }

    } else {  // otherwise prioritise those most promising

        var offsets;
        if (board.isHighDensity()) {
            offsets = OFFSETS_ALL;
        } else {
            offsets = OFFSETS;
        }

        for (var i = 0; i < witnesses.length; i++) {

            var tile = witnesses[i];

            for (var j = 0; j < offsets.length; j++) {

                var x1 = tile.x + offsets[j][0];
                var y1 = tile.y + offsets[j][1];

                if (x1 >= 0 && x1 < board.width && y1 >= 0 && y1 < board.height) {

                    var workTile = board.getTileXY(x1, y1);

                    //console.log(x1 + " " + y1 + " is within range, covered " + workTile.isCovered() + ", on Edge " + workTile.onEdge);
                    if (workTile.isCovered() && !workTile.isSolverFoundBomb() && !workTile.onEdge) {
                        //console.log(x1 + " " + y1 + " is covered and off edge");
                        accepted.add(workTile);
                        //result.push(new Action(x1, y1, pe.offEdgeProbability));
                    }
                }

            }

        }

        for (var i = 0; i < allCoveredTiles.length; i++) {

            var workTile = allCoveredTiles[i];

            // if the tile isn't alrerady being analysed and isn't on the edge
            if (!accepted.has(workTile) && !workTile.onEdge) {

                // see if it has a small number of free tiles around it
                var adjCovered = board.adjacentCoveredCount(workTile);
                if (adjCovered > 1 && adjCovered < 4) {
                    accepted.add(workTile);
                }

            }

        }

    }

    var result = []

    // generate an array of tiles from the map
    for (var tile of accepted) {
        result.push(new Action(tile.x, tile.y, pe.offEdgeProbability, ACTION_CLEAR));
    }

    return result;

}

function fullAnalysis(pe, board, action) {

    var start = Date.now();

    var tile = board.getTileXY(action.x, action.y);

    var adjFlags = board.adjacentFlagsCount(tile);
    var adjCovered = board.adjacentCoveredCount(tile);

    var solutions = BigInt(0);
    var expectedClears = BigInt(0);
    var maxSolutions = BigInt(0);
    for (var value = adjFlags; value <= adjCovered + adjFlags; value++) {

        tile.setValue(value);

        var work = countSolutions(board);
        //totalSolutions = totalSolutions + work.finalSolutionsCount;
        if (work.clearCount > 0) {
            expectedClears = expectedClears + work.finalSolutionsCount * BigInt(work.clearCount);
            solutions = solutions + work.finalSolutionsCount;
        }

        if (work.finalSolutionsCount > maxSolutions) {
            maxSolutions = work.finalSolutionsCount;
        }

    }

    tile.setCovered(true);

    action.expectedClears = divideBigInt(expectedClears, pe.finalSolutionsCount, 6);

    var progress = divideBigInt(solutions, pe.finalSolutionsCount, 6);

    action.progress = progress;

    action.weight = action.prob * (1 + progress * PROGRESS_CONTRIBUTION);
    action.maxSolutions = maxSolutions;

    tile.setProbability(action.prob, action.progress);

    console.log("Full analysis took " + (Date.now() - start) + " milliseconds to complete");
    console.log(tile.asText() + " progress = " + action.progress + " weight = " + action.weight + " expected clears = " + action.expectedClears);

}

function countSolutions(board) {

    // find all the tiles which are revealed and have un-revealed / un-flagged adjacent squares
    var allCoveredTiles = [];
    var witnesses = [];
    var witnessed = [];

    var minesLeft = board.num_bombs;
    var squaresLeft = 0;

    var deadTiles = [];  // used to hold the tiles which have been determined to be dead by either the probability engine or deep analysis

    var work = new Set();  // use a map to deduplicate the witnessed tiles

    for (var i = 0; i < board.tiles.length; i++) {

        var tile = board.getTile(i);

        if (tile.isSolverFoundBomb()) {
            minesLeft--;
            continue;  // if the tile is a flag then nothing to consider
        } else if (tile.isCovered()) {
            squaresLeft++;
            allCoveredTiles.push(tile);
            continue;  // if the tile hasn't been revealed yet then nothing to consider
        }

        var adjTiles = board.getAdjacent(tile);

        var needsWork = false;
        for (var j = 0; j < adjTiles.length; j++) {
            var adjTile = adjTiles[j];
            if (adjTile.isCovered() && !adjTile.isSolverFoundBomb()) {
                needsWork = true;
                work.add(adjTile.index);
            }
        }

        if (needsWork) {
            witnesses.push(tile);
        }

    }

    // generate an array of tiles from the map
    for (var index of work) {
        var tile = board.getTile(index);
        tile.setOnEdge(true);
        witnessed.push(tile);
    }

    //console.log("tiles left = " + squaresLeft);
    //console.log("mines left = " + minesLeft);
    //console.log("Witnesses  = " + witnesses.length);
    //console.log("Witnessed  = " + witnessed.length);

    var start = Date.now();

    var solutionCounter = new SolutionCounter(board, witnesses, witnessed, squaresLeft, minesLeft);

    solutionCounter.process();

    console.log("solution counter took " + (Date.now() - start) + " milliseconds to complete");

    return solutionCounter;

}


const power10n = [BigInt(1), BigInt(10), BigInt(100), BigInt(1000), BigInt(10000), BigInt(100000), BigInt(1000000)];
const power10 = [1, 10, 100, 1000, 10000, 100000, 1000000];
const maxSolutionsDisplay = BigInt("100000000000000000");

function divideBigInt(numerator, denominator, dp) {

    var work = numerator * power10n[dp] / denominator;

    var result = Number(work) / power10[dp];

    return result;
}

function combination(mines, squares) {

     return BINOMIAL.generate(mines, squares);

}    

/*
function combination(mines, squares) {

    //var start = Date.now();

    var top = BigInt(1);
    var bot = BigInt(1);

    var range = Math.min(mines, squares - mines);

    // calculate the combination. 
    for (var i = 0; i < range; i++) {
        top = top * BigInt(squares - i);
        bot = bot * BigInt(i + 1);
    }

    var result = top / bot;

    //console.log("Combination duration " + (Date.now() - start) + " milliseconds");

    return result;

}    
*/

function formatSolutions(count) {

    if (count > maxSolutionsDisplay) {
        return "";
    } else {
        return " " + count.toLocaleString() + " possible solutions remain.";
    }


}

/**
 * 
 */
"use strict";

const BFDA_THRESHOLD = 400n;

function solver(board) {
	
	// find all the tiles which are revealed and have un-revealed / un-flagged adjacent squares
    var allCoveredTiles = [];
	var witnesses = [];
	var witnessed = [];

    var minesLeft = board.num_bombs;
    var squaresLeft = 0; 

    var deadTiles = [];  // used to hold the tiles which have been determined to be dead by either the probability engine or deep analysis

	var work = new Set();  // use a map to deduplicate the witnessed tiles
	
	for (var i=0; i < board.tiles.length; i++) {

		var tile = board.getTile(i);

        tile.clearHint();  // clear any previous hints

        if (tile.isFlagged()) {
            minesLeft--;
            continue;  // if the tile is a flag then nothing to consider
        } else if (tile.isCovered()) {
            squaresLeft++;
            allCoveredTiles.push(tile);
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

    var result;

    // if there are no mines left to find the everything else is to be cleared
    if (minesLeft == 0) {
        result = [];
        for (var i = 0; i < allCoveredTiles.length; i++) {
            var tile = allCoveredTiles[i];
            result.push(new Action(tile.getX(), tile.getY(), 1))
        }

        return result;
    }



	var result = trivial_actions(board, witnesses);

    if (result.length > 0) {
        return result;
    }
    
    var peStart = Date.now();
 
	var pe = new ProbabilityEngine(witnesses, witnessed, squaresLeft, minesLeft);

    pe.process();

    console.log("probability Engine took " + (Date.now() - peStart) + " milliseconds to complete");

    // if the tiles off the edge are definitely safe then clear them all
    if (pe.offEdgeProbability == 1) {
        var edgeSet = new Set();  // build a set containing all the on edge tiles
        for (var i = 0; i < witnessed.length; i++) {
            edgeSet.add(witnessed[i].index);
        }
        // any tiles not on the edge can be cleared
        for (var i = 0; i < allCoveredTiles.length; i++) {
            var tile = allCoveredTiles[i];
            if (!edgeSet.has(tile.index)) {
                result.push(new Action(tile.getX(), tile.getY(), 1));
            }
        }

        if (result.length > 0) {
            return result;
        }

    }


    // if we are having to guess and there are less then BFDA_THRESHOLD solutions use the brute force deep analysis...
    if (pe.bestProbability < 1 && pe.finalSolutionsCount < BFDA_THRESHOLD) {
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

                for (var tile of bfda.deadTiles) {   // show all dead tiles when deep analysis is happening
                    var action = new Action(tile.getX(), tile.getY(), tile.prob);
                    action.dead = true;
                    result.push(action);
                }

                return result;
            } else {
                deadTiles = allCoveredTiles;   // all the tiles are dead
            }
        }

    } else {
        deadTiles = pe.getDeadTiles();  // use the dead tiles from the probability engine
    }

    // ... otherwise we will use the probability engines results

    result = pe.getBestCandidates(1);  // get best options within this ratio of the best value

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
            //if (!found) {
            //    console.log("Need to create a dead square to place in the actions");
            //}

        }
    } else {  // otherwise look for a guess with the least number of adjacent covered tiles (hunting zeros)
        var bestGuessTile = offEdgeGuess(board, witnessed);

        result.push(new Action(bestGuessTile.getX(), bestGuessTile.getY(), pe.offEdgeProbability));

    }
 

    
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
					result.set(adjTile.index, new Action(adjTile.getX(), adjTile.getY(), 1));
				}
			}			
		}
		
		// if the tile has n remaining covered squares and needs n more flags then all the adjacent files are flags
		if (tile.getValue() == flags + covered && covered > 0) {
			for (var j=0; j < adjTiles.length; j++) {
				var adjTile = adjTiles[j];
                if (adjTile.isCovered() && !adjTile.isFlagged()) {
                    adjTile.setProbability(0);  // definite mine
					result.set(adjTile.index, new Action(adjTile.getX(), adjTile.getY(), 0));
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
     * @return
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
                if (tile.isCovered() && !tile.isFlagged() && !edgeSet.has(tile.index)) { // if the tile is covered and not on the edge

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
	constructor(x, y, prob) {
		this.x = x;
		this.y = y;
        this.prob = prob;
        this.dead = false;
 	}
	
}

const power10n = [1n, 10n, 100n, 1000n, 10000n, 100000n, 1000000n];
const power10 = [1, 10, 100, 1000, 10000, 100000, 1000000];

function divideBigInt(numerator, denominator, dp) {

    var work = numerator * power10n[dp] / denominator;

    var result = Number(work) / power10[dp];

    return result;
}


function combination(mines, squares) {

    var start = Date.now();

    var top = BigInt(1);
    var bot = BigInt(1);

    var range = Math.min(mines, squares - mines);

    // calculate the combination. 
    for (var i = 0; i < range; i++) {
        top = top * BigInt(squares - i);
        bot = bot * BigInt(i + 1);
    }

    var result = top / bot;

    console.log("Combination duration " + (Date.now() - start) + " milliseconds");

    return result;

}    

/**
 * 
 */

"use strict";

class SolutionCounter {
	constructor(board, allWitnesses, allWitnessed, squaresLeft, minesLeft) {

       	this.SMALL_COMBINATIONS = [ [ 1 ], [ 1, 1 ], [ 1, 2, 1 ], [ 1, 3, 3, 1 ], [ 1, 4, 6, 4, 1 ], [ 1, 5, 10, 10, 5, 1 ], [ 1, 6, 15, 20, 15, 6, 1 ], [ 1, 7, 21, 35, 35, 21, 7, 1 ], [ 1, 8, 28, 56, 70, 56, 28, 8, 1 ] ];

        this.board = board;

		//this.witnesses = allWitnesses;
		this.witnessed = allWitnessed;

        this.prunedWitnesses = [];  // a subset of allWitnesses with equivalent witnesses removed

        // constraints in the game
        this.minesLeft = minesLeft;
        this.tilesLeft = squaresLeft;
        this.TilesOffEdge = squaresLeft - allWitnessed.length;   // squares left off the edge and unrevealed
        this.minTotalMines = minesLeft - this.TilesOffEdge;   // //we can't use so few mines that we can't fit the remainder elsewhere on the board
        this.maxTotalMines = minesLeft;

        this.boxes = [];
        this.boxWitnesses = [];
        this.mask = [];

        // list of 'DeadCandidate' which are potentially dead
        //this.deadCandidates = [];
        //this.deadTiles = [];

        //this.boxProb = [];  // the probabilities end up here
		this.workingProbs = []; 
        this.heldProbs = [];
        //this.bestProbability = 0;  // best probability of being safe
        //this.offEdgeProbability = 0;
        this.finalSolutionsCount = BigInt(0);
        this.clearCount = 0;

        // details about independent witnesses
        //this.independentWitnesses = [];
        //this.dependentWitnesses = [];
        //this.independentMines = 0;
        //this.independentIterations = BigInt(1);
        //this.remainingSquares = 0;

        //this.localClears = [];

        //this.canDoDeadTileAnalysis = true;

        //this.isolatedEdgeBruteForce;

        // generate a BoxWitness for each witness tile and also create a list of pruned witnesses for the brute force search
        var pruned = 0;
        for (var i = 0; i < allWitnesses.length; i++) {
            var wit = allWitnesses[i];

            var boxWit = new BoxWitness(wit);

            // if the witness is a duplicate then don't store it
            var duplicate = false;
            for (var j = 0; j < this.boxWitnesses.length; j++) {

                var w = this.boxWitnesses[j];

                if (w.equivalent(boxWit)) {
                    //if (boardState.getWitnessValue(w) - boardState.countAdjacentConfirmedFlags(w) != boardState.getWitnessValue(wit) - boardState.countAdjacentConfirmedFlags(wit)) {
                    //    boardState.display(w.display() + " and " + wit.display() + " share unrevealed squares but have different mine totals!");
                    //    validWeb = false;
                    //}
                    duplicate = true;
                    break;
                }
            }
            if (!duplicate) {
                this.prunedWitnesses.push(boxWit);
             } else {
                pruned++;
            }
            this.boxWitnesses.push(boxWit);  // all witnesses are needed for the probability engine
        }
        //console.log("Pruned " + pruned + " witnesses as duplicates");
        //console.log("There are " + this.boxWitnesses.length + " Box witnesses");

		// allocate each of the witnessed squares to a box
		var uid = 0;
		for (var i=0; i < this.witnessed.length; i++) {
			
			var tile = this.witnessed[i];
			
			var count = 0;
			
			// count how many adjacent witnesses the tile has
			for (var j=0; j < allWitnesses.length; j++) {
				if (tile.isAdjacent(allWitnesses[j])) {
					count++;
				}
			}
			
            // see if the witnessed tile fits any existing boxes
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
                this.boxes.push(new Box(this.boxWitnesses, tile, uid++));
			}

        }

        // calculate the min and max mines for each box 
        for (var i = 0; i < this.boxes.length; i++) {
            var box = this.boxes[i];
            box.calculate(this.minesLeft);
            //console.log("Box " + box.tiles[0].asText() + " has min mines = " + box.minMines + " and max mines = " + box.maxMines);
        }

        // Report how many boxes each witness is adjacent to 
        for (var i = 0; i < this.boxWitnesses.length; i++) {
            var boxWit = this.boxWitnesses[i];
            //console.log("Witness " + boxWit.tile.asText() + " is adjacent to " + boxWit.boxes.length + " boxes and has " + boxWit.minesToFind + " mines to find");
        }

 	}


    // calculate a probability for each un-revealed tile on the board
	process() {

        // create an array showing which boxes have been procesed this iteration - none have to start with
        this.mask = Array(this.boxes.length).fill(false);
        //for (var i = 0; i < this.boxes.length; i++) {
        //    this.mask.push(false);
        //}

		// create an initial solution of no mines anywhere 
        this.heldProbs.push(new ProbabilityLine(this.boxes.length, BigInt(1)));
		
		// add an empty probability line to get us started
        this.workingProbs.push(new ProbabilityLine(this.boxes.length, BigInt(1)));
		
        var nextWitness = this.findFirstWitness();

        while (nextWitness != null) {

            //console.log("Probability engine processing witness " + nextWitness.boxWitness.tile.asText());

            // mark the new boxes as processed - which they will be soon
            for (var i = 0; i < nextWitness.newBoxes.length; i++) {
                this.mask[nextWitness.newBoxes[i].uid] = true;
            }

            this.workingProbs = this.mergeProbabilities(nextWitness);

            nextWitness = this.findNextWitness(nextWitness);

        }

        // if this isn't a valid board than nothing to do
        if (this.heldProbs.length != 0) {
            this.calculateBoxProbabilities();
        } else {
            this.finalSolutionsCount = BigInt(0);
            this.clearCount = 0;
        }
 
		
	}


    // take the next witness details and merge them into the currently held details
    mergeProbabilities(nw) {

        var newProbs = [];

        for (var i = 0; i < this.workingProbs.length; i++) {

            var pl = this.workingProbs[i];

            var missingMines = nw.boxWitness.minesToFind - this.countPlacedMines(pl, nw);

            if (missingMines < 0) {
                //console.log("Missing mines < 0 ==> ignoring line");
                // too many mines placed around this witness previously, so this probability can't be valid
            } else if (missingMines == 0) {
                //console.log("Missing mines = 0 ==> keeping line as is");
                newProbs.push(pl);   // witness already exactly satisfied, so nothing to do
            } else if (nw.newBoxes.length == 0) {
                //console.log("new boxes = 0 ==> ignoring line since nowhere for mines to go");
                // nowhere to put the new mines, so this probability can't be valid
            } else {
                
                var result = this.distributeMissingMines(pl, nw, missingMines, 0);
                newProbs.push(...result);
            }

        }

        // flag the last set of details as processed
        nw.boxWitness.processed = true;

        for (var i = 0; i < nw.newBoxes.length; i++) {
            nw.newBoxes[i].processed = true;
        }

        var boundaryBoxes = [];
        for (var i = 0; i < this.boxes.length; i++) {
            var box = this.boxes[i];
            var notProcessed = false;
            var processed = false;
            for (var j = 0; j < box.boxWitnesses.length; j++) {
                if (box.boxWitnesses[j].processed) {
                    processed = true;
                } else {
                    notProcessed = true;
                }
                if (processed && notProcessed) {
                    //boardState.display("partially processed box " + box.getUID());
                    boundaryBoxes.push(box);
                    break;
                }
            }
        }
        //boardState.display("Boxes partially processed " + boundaryBoxes.size());

        var sorter = new MergeSorter(boundaryBoxes);

        newProbs = this.crunchByMineCount(newProbs, sorter);

        return newProbs;

    }

    // counts the number of mines already placed
    countPlacedMines(pl, nw) {

        var result = 0;

        for (var i = 0; i < nw.oldBoxes.length; i++) {

            var b = nw.oldBoxes[i];

            result = result + pl.allocatedMines[b.uid];
        }

        return result;
    }

    // this is used to recursively place the missing Mines into the available boxes for the probability line
    distributeMissingMines(pl, nw,  missingMines, index) {

        //console.log("Distributing " + missingMines + " missing mines to box " + nw.newBoxes[index].uid);

        this.recursions++;
        if (this.recursions % 100 == 0) {
            console.log("Probability Engine recursision = " + recursions);
        }

        var result = [];

        // if there is only one box left to put the missing mines we have reach the end of this branch of recursion
        if (nw.newBoxes.length - index == 1) {
            // if there are too many for this box then the probability can't be valid
            if (nw.newBoxes[index].maxMines < missingMines) {
                //console.log("Abandon (1)");
                return result;
            }
            // if there are too few for this box then the probability can't be valid
            if (nw.newBoxes[index].minMines > missingMines) {
                //console.log("Abandon (2)");
                return result;
            }
            // if there are too many for this game then the probability can't be valid
            if (pl.mineCount + missingMines > this.maxTotalMines) {
                //console.log("Abandon (3)");
                return result;
            }

            // otherwise place the mines in the probability line
            //pl.mineBoxCount[nw.newBoxes[index].uid] = BigInt(missingMines);
            //pl.mineCount = pl.mineCount + missingMines;
            result.push(this.extendProbabilityLine(pl, nw.newBoxes[index], missingMines));
            //console.log("Distribute missing mines line after " + pl.mineBoxCount);
            return result;
        }


        // this is the recursion
        var maxToPlace = Math.min(nw.newBoxes[index].maxMines, missingMines);

        for (var i = nw.newBoxes[index].minMines; i <= maxToPlace; i++) {
            var npl = this.extendProbabilityLine(pl, nw.newBoxes[index], i);

            var r1 = this.distributeMissingMines(npl, nw, missingMines - i, index + 1);
            result.push(...r1);

        }

        return result;

    }

    // create a new probability line by taking the old and adding the mines to the new Box
    extendProbabilityLine(pl, newBox, mines) {

        //console.log("Extended probability line: Adding " + mines + " mines to box " + newBox.uid);
        //console.log("Extended probability line before" + pl.mineBoxCount);

        var combination = this.SMALL_COMBINATIONS[newBox.tiles.length][mines];
        var bigCom = BigInt(combination);

        var newSolutionCount = pl.solutionCount * bigCom;

        var result = new ProbabilityLine(this.boxes.length, newSolutionCount);

        result.mineCount = pl.mineCount + mines;
        //result.solutionCount = pl.solutionCount;

        // copy the probability array

        if (combination != 1) {
            for (var i = 0; i < pl.mineBoxCount.length; i++) {
                result.mineBoxCount[i] = pl.mineBoxCount[i] * bigCom;
            }
        } else {
            result.mineBoxCount = pl.mineBoxCount.slice();
        }

        result.mineBoxCount[newBox.uid] = BigInt(mines) * result.solutionCount;

        result.allocatedMines = pl.allocatedMines.slice();
        result.allocatedMines[newBox.uid] = mines;

        //console.log("Extended probability line after " + result.mineBoxCount);

        return result;
    }


    // this combines newly generated probabilities with ones we have already stored from other independent sets of witnesses
    storeProbabilities() {

        //console.log("At store probabilities");

        var result = [];

        if (this.workingProbs.length == 0) {
            //console.log("working probabilites list is empty!!");
            this.heldProbs = [];
        	return;
        } 

        // crunch the new ones down to one line per mine count
        //var crunched = this.crunchByMineCount(this.workingProbs);

        var crunched = this.workingProbs;

        //solver.display("New data has " + crunched.size() + " entries");

        for (var i = 0; i < crunched.length; i++) {

            pl = crunched[i];

            for (var j = 0; j < this.heldProbs.length; j++) {

                var epl = this.heldProbs[j];

                var npl = new ProbabilityLine(this.boxes.length);

                npl.mineCount = pl.mineCount + epl.mineCount;

                if (npl.mineCount <= this.maxTotalMines) {

                    npl.solutionCount = pl.solutionCount * epl.solutionCount;

                    for (var k = 0; k < npl.mineBoxCount.length; k++) {

                        var w1 = pl.mineBoxCount[k] * epl.solutionCount;
                        var w2 = epl.mineBoxCount[k] * pl.solutionCount;
                        npl.mineBoxCount[k] = w1 + w2;

                    }
                    result.push(npl);

                }
            }
        }

        // sort into mine order 
        result.sort(function (a, b) { return a.mineCount - b.mineCount });

        this.heldProbs = [];

        // if result is empty this is an impossible position
        if (result.length == 0) {
            return;
        }

        // and combine them into a single probability line for each mine count
        var mc = result[0].mineCount;
        var npl = new ProbabilityLine(this.boxes.length);
        npl.mineCount = mc;

        for (var i = 0; i < result.length; i++) {

            var pl = result[i];

            if (pl.mineCount != mc) {
                this.heldProbs.push(npl);
                mc = pl.mineCount;
                npl = new ProbabilityLine(this.boxes.length);
                npl.mineCount = mc;
            }
            npl.solutionCount = npl.solutionCount + pl.solutionCount;

            for (var j = 0; j < pl.mineBoxCount.length; j++) {
                npl.mineBoxCount[j] = npl.mineBoxCount[j] + pl.mineBoxCount[j];
            }
        }

        this.heldProbs.push(npl);


    }

    crunchByMineCount(target, sorter) {

        if (target.length == 0) {
            return target;
         }

        // sort the solutions by number of mines
        target.sort(function (a, b) { return sorter.compare(a,b) });

        var result = [];

        var current = null;

        for (var i = 0; i < target.length; i++) {

            var pl = target[i];

            if (current == null) {
                current = target[i];
            } else if (sorter.compare(current, pl) != 0) {
                result.push(current);
                current = pl;
            } else {
                this.mergeLineProbabilities(current, pl);
            }

            /*
            if (pl.mineCount != mc) {
                result.push(npl);
                mc = pl.mineCount;
                npl = new ProbabilityLine(this.boxes.length);
                npl.mineCount = mc;
            }
            this.mergeLineProbabilities(npl, pl);
            */

        }

        //if (npl.mineCount >= minTotalMines) {
        result.push(current);
        //}	

        //console.log(target.length + " Probability Lines compressed to " + result.length); 

        return result;

    }

    // calculate how many ways this solution can be generated and roll them into one
    mergeLineProbabilities(npl, pl) {

        npl.solutionCount = npl.solutionCount + pl.solutionCount;

        for (var i = 0; i < pl.mineBoxCount.length; i++) {
            if (this.mask[i]) {  // if this box has been involved in this solution - if we don't do this the hash gets corrupted by boxes = 0 mines because they weren't part of this edge
                npl.mineBoxCount[i] = npl.mineBoxCount[i] + pl.mineBoxCount[i];
            }

        }

    }

    // return any witness which hasn't been processed
    findFirstWitness() {

        for (var i = 0; i < this.boxWitnesses.length; i++) {
            var boxWit = this.boxWitnesses[i];
            if (!boxWit.processed) {
                return new NextWitness(boxWit);
            }
        }

        return null;
    }

    // look for the next witness to process
    findNextWitness(prevWitness) {

        var bestTodo = 99999;
        var bestWitness = null;

        // and find a witness which is on the boundary of what has already been processed
        for (var i = 0; i < this.boxes.length; i++) {
            var b = this.boxes[i];
            if (b.processed) {
                for (var j = 0; j < b.boxWitnesses.length; j++) {
                    var w = b.boxWitnesses[j];
                    if (!w.processed) {
                        var todo = 0;
                        for (var k = 0; k < w.boxes.length; k++) {
                            var b1 = w.boxes[k];

                            if (!b1.processed) {
                                todo++;
                            }
                        }
                        if (todo == 0) {    // prioritise the witnesses which have the least boxes left to process
                            return new NextWitness(w);
                        } else if (todo < bestTodo) {
                            bestTodo = todo;
                            bestWitness = w;
                        }
                    }
                }
            }
        }

        if (bestWitness != null) {
            return new NextWitness(bestWitness);
        }

        // if we are down here then there is no witness which is on the boundary, so we have processed a complete set of independent witnesses 


        // since we have calculated all the mines in an independent set of witnesses we can crunch them down and store them for later

        // get an unprocessed witness
        var nw = this.findFirstWitness();

        this.storeProbabilities();

        // reset the working array so we can start building up one for the new set of witnesses
        this.workingProbs = [];
        this.workingProbs.push(new ProbabilityLine(this.boxes.length, BigInt(1)));

        // reset the mask indicating that no boxes have been processed 
        this.mask.fill(false);
        //for (var i = 0; i < this.mask.length; i++) {
        //    this.mask[i] = false;
        //}

        // if the position is invalid exit now
        if (this.heldProbs.length == 0) {
            return null;
        }

        // return the next witness to process
        return nw;

    }


    /*
    // get the box containing this tile
    getBox(tile) {

        for (var i = 0; i < this.boxes.length; i++) {
            if (this.boxes[i].contains(tile)) {
                return this.boxes[i];
            }
        }

        console.log("ERROR - tile " + tile.asText() + " doesn't belong to a box");

        return null;
    }

    // return all the boxes adjacent to this tile
    getAdjacentBoxes(loc) {

        var result = [];

        var adjLocs = board.getAdjacent(loc);

         // get each adjacent location
        for (var i = 0; i < adjLocs.length; i++) {

            var adjLoc = adjLocs[i];

            // we only want adjacent tile which are un-revealed
            if (!adjLoc.isCovered() || adjLoc.isFlagged()) {
                continue;
            }

            // find the box it is in
            var boxFound = false;
            for (var j = 0; j < this.boxes.length; j++) {

                var box = this.boxes[j];

                if (box.contains(adjLoc)) {
                    boxFound = true;
                    // is the box already included?
                    var found = false;
                    for (var k = 0; k < result.length; k++) {

                        if (box.uid == result[k].uid) {
                            found = true;
                            break;
                        }
                    }
                    // if not add it
                    if (!found) {
                        result.push(box);
                        //sizeOfBoxes = box.getSquares().size();
                    }
                }
            }

            // if a box can't be found for the adjacent square then the location can't be dead
            if (!boxFound) {
                return null;
            }

        }

        return result;

    }
    */

    // here we expand the localised solution to one across the whole board and
    // sum them together to create a definitive probability for each box
    calculateBoxProbabilities() {

        var emptyBox = Array(this.boxes.length).fill(true);
        //for (var i = 0; i < this.boxes.length; i++) {
        //    tally[i] = BigInt(0);
        //}

        // total game tally
        var totalTally = BigInt(0);

        // outside a box tally
        var outsideTally = BigInt(0);

        //console.log("There are " + this.heldProbs.length + " different mine counts on the edge");

        // calculate how many mines 
        for (var i = 0; i < this.heldProbs.length; i++) {

            var pl = this.heldProbs[i];

            //console.log("Mine count is " + pl.mineCount + " with solution count " + pl.solutionCount + " mineBoxCount = " + pl.mineBoxCount);

            if (pl.mineCount >= this.minTotalMines) {    // if the mine count for this solution is less than the minimum it can't be valid

                //console.log("Mines left " + this.minesLeft + " mines on PL " + pl.mineCount + " squares left = " + this.squaresLeft);
                var mult = combination(this.minesLeft - pl.mineCount, this.TilesOffEdge);  //# of ways the rest of the board can be formed

                outsideTally = outsideTally + mult * BigInt(this.minesLeft - pl.mineCount) * (pl.solutionCount);

                // this is all the possible ways the mines can be placed across the whole game
                totalTally = totalTally + mult * (pl.solutionCount);

                for (var j = 0; j < emptyBox.length; j++) {
                    if (pl.mineBoxCount[j] != 0) {
                        emptyBox[j] = false;
                    }
                }
            }

        }

        // count how many clears we have
        if (totalTally > 0) {
            for (var i = 0; i < this.boxes.length; i++) {
                if (emptyBox[i]) {
                    this.clearCount = this.clearCount + this.boxes[i].tiles.length;
                }
            }
        }

        this.finalSolutionsCount = totalTally;

         console.log("Game has  " + this.finalSolutionsCount + " candidate solutions and " + this.clearCount + " clears");

    }

}

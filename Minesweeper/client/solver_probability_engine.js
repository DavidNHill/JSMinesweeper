/**
 * 
 */

"use strict";

class ProbabilityEngine {
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
        this.deadCandidates = [];
        this.deadTiles = [];

        this.boxProb = [];  // the probabilities end up here
		this.workingProbs = []; 
        this.heldProbs = [];
        this.bestProbability = 0;  // best probability of being safe
        this.offEdgeProbability = 0;
        this.finalSolutionsCount = BigInt(0);

        // details about independent witnesses
        this.independentWitnesses = [];
        this.dependentWitnesses = [];
        this.independentMines = 0;
        this.independentIterations = BigInt(1);
        this.remainingSquares = 0;

        this.localClears = [];

        this.canDoDeadTileAnalysis = true;

        this.isolatedEdgeBruteForce;

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
        console.log("Pruned " + pruned + " witnesses as duplicates");
        console.log("There are " + this.boxWitnesses.length + " Box witnesses");

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
        for (var i = 0; i < this.boxes.length; i++) {
            this.mask.push(false);
        }

        // look for places which could be dead
        this.getCandidateDeadLocations();

		// create an initial solution of no mines anywhere 
		//var held = new ProbabilityLine(this.boxes.length);
		//held.solutionCount = BigInt(1);
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

            //if (this.workingProbs.length > 10) {
            //    console.log("Items in the working array = " + this.workingProbs.length);
            //}

            nextWitness = this.findNextWitness(nextWitness);

        }

        // if we don't have any local clears then do a full probability determination
        if (this.localClears.length == 0) {
            this.calculateBoxProbabilities();
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

                //for (var j = 0; j < result.length; j++) {
                //   newProbs.push(result[j]);
                //}

            }

        }

        // flag the last set of details as processed
        nw.boxWitness.processed = true;

        for (var i = 0; i < nw.newBoxes.length; i++) {
            nw.newBoxes[i].processed = true;
        }

        //if we haven't compressed yet and we are still a small edge then don't compress
        if (newProbs.length < 100 && this.canDoDeadTileAnalysis) {
            return newProbs;
        }

        // about to compress the line
        this.canDoDeadTileAnalysis = false;

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

        //if (newProbs.length == 0) {
        //     console.log("Returning no lines from merge probability !!");
        //}

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

        //this.checkCandidateDeadLocations();

        if (this.workingProbs.length == 0) {
        	console.log("working probabilites list is empty!!");
        	return;
        } 

        // crunch the new ones down to one line per mine count
        //var crunched = this.crunchByMineCount(this.workingProbs);

        var crunched = this.workingProbs;

        if (crunched.length == 1) {
            this.checkEdgeIsIsolated();
        }

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

        //if (this.heldProbs.length > 10) {
        //    console.log("Items in the held array = " + this.heldProbs.length);
        //}

		/*
		for (Box b: boxes) {
			System.out.print(b.getSquares().size() + " ");
		}
		System.out.println("");
		for (ProbabilityLine pl: heldProbs) {
			System.out.print("Mines = " + pl.mineCount + " solutions = " + pl.solutionCount + " boxes: ");
			for (int i=0; i < pl.mineBoxCount.length; i++) {
				System.out.print(" " + pl.mineBoxCount[i]);
			}
			System.out.println("");
		}
		*/


    }

    crunchByMineCount(target, sorter) {

        if (target.length == 0) {
            return target;
         }

        // sort the solutions by number of mines
        target.sort(function (a, b) { return sorter.compare(a,b) });

        var result = [];

        //var mc = target[0].mineCount;
        //var npl = new ProbabilityLine(this.boxes.length);
        //npl.mineCount = mc;

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

        console.log(target.length + " Probability Lines compressed to " + result.length); 

        return result;

    }

    // calculate how many ways this solution can be generated and roll them into one
    mergeLineProbabilities(npl, pl) {

        /*
        var solutions = BigInt(1);
        for (var i = 0; i < pl.mineBoxCount.length; i++) {
            solutions = solutions * BigInt(this.SMALL_COMBINATIONS[this.boxes[i].tiles.length][pl.mineBoxCount[i]]);
        }

        npl.solutionCount = npl.solutionCount + solutions;
        */

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
        } else {
            console.log("Ending independent edge");
        }

        // if we are down here then there is no witness which is on the boundary, so we have processed a complete set of independent witnesses 

        // look to see if this sub-section of the edge has any certain clears
        for (var i = 0; i < this.mask.length; i++) {
            if (this.mask[i]) {

                var isClear = true;
                for (var j = 0; j < this.workingProbs.length; j++) {
                    var wp = this.workingProbs[j];
                    if (wp.mineBoxCount[i] != 0) {
                        isClear = false;
                        break;
                    }
                }
                if (isClear) {
                    // if the box is locally clear then store the tiles in it
                    for (var j = 0; j < this.boxes[i].tiles.length; j++) {

                        var tile = this.boxes[i].tiles[j];

                        console.log(tile.asText() + " has been determined to be locally clear");
                        tile.setProbability(1);
                        this.localClears.push(tile);
                    }
                }
            }
        }

        // if we have found some local clears then stop and use these
        if (this.localClears.length > 0) {
            return null;
        }

        //independentGroups++;

        this.checkCandidateDeadLocations(this.canDoDeadTileAnalysis);

        // if we haven't compressed yet then do it now
        if (this.canDoDeadTileAnalysis) {
            var sorter = new MergeSorter();
            this.workingProbs = this.crunchByMineCount(this.workingProbs, sorter);
        } else {
            this.canDoDeadTileAnalysis = true;
        }

        // since we have calculated all the mines in an independent set of witnesses we can crunch them down and store them for later

        // get an unprocessed witness
        var nw = this.findFirstWitness();
        if (nw != null) {
            console.log("Starting a new independent edge");
        }

        // only crunch it down for non-trivial probability lines unless it is the last set - this is an efficiency decision
        //if (this.workingProbs.length > 2 || nw == null) {
            this.storeProbabilities();

            // reset the working array so we can start building up one for the new set of witnesses
            this.workingProbs = [];
            this.workingProbs.push(new ProbabilityLine(this.boxes.length, BigInt(1)));

            // reset the mask indicating that no boxes have been processed 
            for (var i = 0; i < this.mask.length; i++) {
                this.mask[i] = false;
            }
        //}

        // return the next witness to process
        return nw;

    }


    // check the candidate dead locations with the information we have - remove those that aren't dead
    checkCandidateDeadLocations(checkPossible) {

        var completeScan;
        if (this.TilesOffEdge == 0) {
            completeScan = true;   // this indicates that every box has been considered in one sweep (only 1 independent edge)
            for (var i = 0; i < this.mask.length; i++) {
                if (!this.mask[i]) {
                    completeScan = false;
                    break;
                }
            }
            if (completeScan) {
                console.log("This is a complete scan");
            } else {
                console.log("This is not a complete scan");
            }
        } else {
            completeScan = false;
            console.log("This is not a complete scan because there are squares off the edge");
        }


        for (var i = 0; i < this.deadCandidates.length; i++) {

            var dc = this.deadCandidates[i];

            if (dc.isAlive) {  // if this location isn't dead then no need to check any more
                continue;
            }

            // only do the check if all the boxes have been analysed in this probability iteration
            var boxesInScope = 0;
            for (var j = 0; j < dc.goodBoxes.length; j++) {
                var b = dc.goodBoxes[j];
                if (this.mask[b.uid]) {
                    boxesInScope++;
                }
            }
            for (var j = 0; j < dc.badBoxes.length; j++) {
                var b = dc.badBoxes[j];
                if (this.mask[b.uid]) {
                    boxesInScope++;
                }
            }
            if (boxesInScope == 0) {
                continue;
            } else if (boxesInScope != dc.goodBoxes.length + dc.badBoxes.length) {
                console.log("Location " + dc.candidate.asText() + " has some boxes in scope and some out of scope so assumed alive");
                dc.isAlive = true;
                continue;
            }

            //if we can't do the check because the edge has been compressed mid process then assume alive
            if (!checkPossible) {
                console.log("Location " + dc.candidate.asText() + " was on compressed edge so assumed alive");
                dc.isAlive = true;
                continue;
            }

            var okay = true;
            var mineCount = 0;
            line: for (var j = 0; j < this.workingProbs.length; j++) {

                var pl = this.workingProbs[j];

                if (completeScan && pl.mineCount != this.minesLeft) {
                    continue line;
                }

                // ignore probability lines where the candidate is a mine
                if (pl.allocatedMines[dc.myBox.uid] == dc.myBox.tiles.length) {
                    mineCount++;
                    continue line;
                }

                // all the bad boxes must be zero
                for (var k = 0; k < dc.badBoxes.length; k++) {

                    var b = dc.badBoxes[k];

                    var neededMines;
                    if (b.uid == dc.myBox.uid) {
                        neededMines = BigInt(b.tiles.length - 1) * pl.solutionCount;
                    } else {
                        neededMines = BigInt(b.tiles.length) * pl.solutionCount;
                    }

                    // a bad box must have either no mines or all mines
                    if (pl.mineBoxCount[b.uid] != 0 && pl.mineBoxCount[b.uid] != neededMines) {
                        console.log("Location " + dc.candidate.asText() + " is not dead because a bad box has neither zero or all mines: " + pl.mineBoxCount[b.uid] + "/" + neededMines);
                        okay = false;
                        break line;
                    }
                }

                var tally = 0;
                // the number of mines in the good boxes must always be the same
                for (var k = 0; k < dc.goodBoxes.length; k++) {
                    var b = dc.goodBoxes[k];
                    tally = tally + pl.allocatedMines[b.uid];
                }
                //boardState.display("Location " + dc.candidate.display() + " has mine tally " + tally);
                if (dc.firstCheck) {
                    dc.total = tally;
                    dc.firstCheck = false;
                } else {
                    if (dc.total != tally) {
                        console.log("Location " + dc.candidate.asText() + " is not dead because the sum of mines in good boxes is not constant. Was "
                            + dc.total + " now " + tally + ". Mines in probability line " + pl.mineCount);
                        okay = false;
                        break;
                    }
                }
            }

            // if a check failed or every this tile is a mine for every solution then it is alive
            if (!okay || mineCount == this.workingProbs.length) {
                dc.isAlive = true;
            }

        }

    }


    // find a list of locations which could be dead
    getCandidateDeadLocations() {

        // for each square on the edge
        for (var i = 0; i < this.witnessed.length; i++) {

            var tile = this.witnessed[i];

            var adjBoxes = this.getAdjacentBoxes(tile);

            if (adjBoxes == null) {  // this happens when the square isn't fully surrounded by boxes
                continue;
            }

            var dc = new DeadCandidate();
            dc.candidate = tile;
            dc.myBox = this.getBox(tile);

            for (var j = 0; j < adjBoxes.length; j++) {

                var box = adjBoxes[j];

                var good = true;
                for (var k = 0; k < box.tiles.length; k++) {

                    var square = box.tiles[k];

                    if (!square.isAdjacent(tile) && !(square.index == tile.index)) {
                        good = false;
                        break;
                    }
                }
                if (good) {
                    dc.goodBoxes.push(box);
                } else {
                    dc.badBoxes.push(box);
                }

            }

            this.deadCandidates.push(dc);

        }

        for (var i = 0; i < this.deadCandidates.length; i++) {
            var dc = this.deadCandidates[i];
            console.log(dc.candidate.asText() + " is candidate dead with " + dc.goodBoxes.length + " good boxes and " + dc.badBoxes.length + " bad boxes");
        }

    }

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

    // an edge is isolated if every tile on it is completely surrounded by boxes also on the same edge
    checkEdgeIsIsolated() {

        var edgeTiles = new Set();
        var edgeWitnesses = new Set();

        var everything = true;

        // load each tile on this edge into a set
        for (var i = 0; i < this.mask.length; i++) {
            if (this.mask[i]) {
                //edgeTiles.add(...this.boxes[i].tiles);
                for (var j = 0; j < this.boxes[i].tiles.length; j++) {
                    edgeTiles.add(this.boxes[i].tiles[j]);
                }

                for (var j = 0; j < this.boxes[i].boxWitnesses.length; j++) {
                    edgeWitnesses.add(this.boxes[i].boxWitnesses[j].tile);
                }
 
            } else {
                everything = false;
            }
        }

        //var text = "";
        //for (var i = 0; i < edgeTiles.size; i++) {
        //    text = text + edgeTiles[i].asText() + " ";
        //}
        //console.log(text);

        // if this edge is everything then it isn't an isolated edge
        if (everything) {
            console.log("Not isolated because the edge is everything");
            return false;
        }

        if (this.isolatedEdgeBruteForce != null && edgeTiles.size >= this.isolatedEdgeBruteForce.tiles.length) {
            console.log("Already found an isolated edge of smaller size");
        }

        // check whether every tile adjacent to the tiles on the edge is itself on the edge
        for (var i = 0; i < this.mask.length; i++) {
            if (this.mask[i]) {
                for (var j = 0; j < this.boxes[i].tiles.length; j++) {
                    var tile = this.boxes[i].tiles[j];
                    var adjTiles = this.board.getAdjacent(tile);
                    for (var k = 0; k < adjTiles.length; k++) {
                        var adjTile = adjTiles[k];
                        if (adjTile.isCovered() && !adjTile.isFlagged() && !edgeTiles.has(adjTile)) {
                            console.log("Not isolated because a tile's adjacent tiles isn't on the edge: " + tile.asText() + " ==> " + adjTile.asText());
                            return false;
                        }
                    }
                }
            }
        }

        console.log("*** Isolated Edge found ***");

        var tiles = [...edgeTiles];
        var witnesses = [...edgeWitnesses];
        var mines = this.workingProbs[0].mineCount;
        // build a web of the isolated edge and use it to build a brute force
        var isolatedEdge = new ProbabilityEngine(this.board, witnesses, tiles, tiles.length, mines);
        isolatedEdge.generateIndependentWitnesses();
        var iterator = new WitnessWebIterator(isolatedEdge, tiles, -1);

        var bruteForce = new Cruncher(this.board, iterator);
        //BruteForce bruteForce = new BruteForce(boardState.getSolver(), boardState, isolatedEdge, mines, boardState.getSolver().preferences.BRUTE_FORCE_MAX, "Isolated Edge");

        this.isolatedEdgeBruteForce = bruteForce;


        return true;
    }

    // determine a set of independent witnesses which can be used to brute force the solution space more efficiently then a basic 'pick r from n' 
    generateIndependentWitnesses() {

        this.remainingSquares = this.witnessed.length;

        // find a set of witnesses which don't share any squares (there can be many of these, but we just want one to use with the brute force iterator)
        for (var i = 0; i < this.prunedWitnesses.length; i++) {

            var w = this.prunedWitnesses[i];

            //console.log("Checking witness " + w.tile.asText() + " for independence");

            var okay = true;
            for (var j = 0; j < this.independentWitnesses.length; j++) {

                var iw = this.independentWitnesses[j];

                if (w.overlap(iw)) {
                    okay = false;
                    //console.log("false");
                    break;
                }
            }

            // split the witnesses into dependent ones and independent ones 
            if (okay) {
                //console.log("true");
                this.remainingSquares = this.remainingSquares - w.tiles.length;
                this.independentIterations = this.independentIterations * combination(w.minesToFind, w.tiles.length);
                this.independentMines = this.independentMines + w.minesToFind;
                this.independentWitnesses.push(w);  
            } else {
                this.dependentWitnesses.push(w);
            }
        }

        console.log("Calculated " + this.independentWitnesses.length + " independent witnesses");

    }

    // here we expand the localised solution to one across the whole board and
    // sum them together to create a definitive probability for each box
    calculateBoxProbabilities() {

        var tally = [];
        for (var i = 0; i < this.boxes.length; i++) {
            tally[i] = BigInt(0);
            //hashTally[i] = BigInteger.ZERO;
        }

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

                //if (mineCounts.put(pl.mineCount, pl.solutionCount) != null) {
                //   System.out.println("Duplicate mines in probability Engine");
                //}

                //console.log("Mines left " + this.minesLeft + " mines on PL " + pl.mineCount + " squares left = " + this.squaresLeft);
                var mult = combination(this.minesLeft - pl.mineCount, this.TilesOffEdge);  //# of ways the rest of the board can be formed

                outsideTally = outsideTally + mult * BigInt(this.minesLeft - pl.mineCount) * (pl.solutionCount);

                // this is all the possible ways the mines can be placed across the whole game
                totalTally = totalTally + mult * (pl.solutionCount);

                for (var j = 0; j < tally.length; j++) {
                    //console.log("mineBoxCount " + j + " is " + pl.mineBoxCount[j]);
                    tally[j] = tally[j] + (mult * pl.mineBoxCount[j]) / BigInt(this.boxes[j].tiles.length);
                    //hashTally[i] = hashTally[i].add(pl.hashCount[i]);
                }
            }

        }

        // for each box calcaulate a probability
        for (var i = 0; i < this.boxes.length; i++) {

            if (totalTally != 0) {
                if (tally[i] == totalTally) {  // a mine
                    //console.log("Box " + i + " contains mines");
                    this.boxProb[i] = 0;
                    //for (Square squ: boxes.get(i).getSquares()) {  // add the squares in the box to the list of mines
                    //   mines.add(squ);
                    //}
                } else {
                    //this.boxProb[i] = 1 - Number(tally[i] / totalTally);
                    this.boxProb[i] = 1 - divideBigInt(tally[i], totalTally, 6);
                }

            } else {
                this.boxProb[i] = 0;
            }

            //console.log("Box " + i + " has probabality " + this.boxProb[i]);

            // for each tile in the box allocate a probability to it
            for (var j = 0; j < this.boxes[i].tiles.length; j++) {
                //console.log(this.boxes[i].tiles[j].asText() + " set to probability " + this.boxProb[i]);
                this.boxes[i].tiles[j].setProbability(this.boxProb[i]);
            }

        }


        // add the dead locations we found
        for (var i = 0; i < this.deadCandidates.length; i++) {
            var dc = this.deadCandidates[i];
            if (!dc.isAlive && this.boxProb[dc.myBox.uid] != 0) {   // if it is dead and not a definite flag 
                this.deadTiles.push(dc.candidate);
            }
        }

        // avoid divide by zero
        if (this.TilesOffEdge != 0 && totalTally != BigInt(0)) {
            //offEdgeProbability = 1 - outsideTally / (totalTally * BigInt(this.squaresLeft));
            this.offEdgeProbability = 1 - divideBigInt(outsideTally, totalTally * BigInt(this.TilesOffEdge), 6);
        } else {
            this.offEdgeProbability = 0;
        }

        this.finalSolutionsCount = totalTally;

        // see if we can find a guess which is better than outside the boxes
        var hwm = this.offEdgeProbability;

        //offEdgeBest = true;

        for (var i = 0; i < this.boxes.length; i++) {

            var b = this.boxes[i];

            // a box is dead if all its tiles are dead
            if (this.deadTiles.length > 0) {
                var boxLiving = false;
                for (var j = 0; j < this.boxes[i].tiles.length; j++) {
                    var tile = this.boxes[i].tiles[j];

                    var tileLiving = true;
                    for (var k = 0; k < this.deadTiles.length; k++) {
                        if (this.deadTiles[k].isEqual(tile)) {
                            tileLiving = false;
                            break;
                        }
                    }
                    if (tileLiving) {
                        boxLiving = true;
                        break;
                    }
                }
            } else {  // if there are no dead tiles then there is nothing to check
                var boxLiving = true;
            }


            var prob = this.boxProb[b.uid];
            if (boxLiving || prob == 1) {   // if living or 100% safe then consider this probability

                if (hwm <= prob) {
                    //offEdgeBest = false;
                    hwm = prob;
                }
            }
        }

        //for (BigDecimal bd: boxProb) {
        //	if (hwm.compareTo(bd) <= 0) {
        //		offEdgeBest = false;
        //		hwm = bd;
        //	}
        //	hwm = hwm.max(bd);
        //}

        this.bestProbability = hwm;

        //if (bestProbability.compareTo(BigDecimal.ONE) == 0) {
        //    cutoffProbability = BigDecimal.ONE;
        //} else {
        //    cutoffProbability = bestProbability.multiply(Solver.PROB_ENGINE_TOLERENCE);
        //}

        console.log("Off edge probability is " + this.offEdgeProbability);
        console.log("Best probability is " + this.bestProbability);
        console.log("Game has  " + this.finalSolutionsCount + " candidate solutions" );


        //solver.display("probability off web is " + outsideProb);


    }

    getBestCandidates(freshhold) {

        var best = [];

        //solver.display("Squares left " + this.squaresLeft + " squares analysed " + web.getSquares().size());

        // if the outside probability is the best then return an empty list
        var test;
        //if (offEdgeBest) {
        //	solver.display("Best probability is off the edge " + bestProbability + " but will look for options on the edge only slightly worse");
        //	//test = bestProbability.multiply(Solver.EDGE_TOLERENCE);
        //	test = bestProbability.multiply(freshhold);
        //} else 

        if (this.bestProbability == 1) {  // if we have a probability of one then don't allow lesser probs to get a look in
            test = this.bestProbability;
        } else {
            test = this.bestProbability * freshhold;
        }

        console.log("Best probability is " + this.bestProbability + " freshhold is " + test);

        for (var i = 0; i < this.boxProb.length; i++) {
            if (this.boxProb[i] >= test) {
                for (var j = 0; j < this.boxes[i].tiles.length; j++) {
                    var squ = this.boxes[i].tiles[j];

                    //best.push(new Action(squ.x, squ.y, this.boxProb[i]));

                    //  exclude dead tiles 
                    var dead = false;
                    for (var k = 0; k < this.deadTiles.length; k++) {
                        if (this.deadTiles[k].isEqual(squ)) {
                            dead = true;
                            break;
                        }
                    }
                    if (!dead || this.boxProb[i] == 1) {   // if not dead or 100% safe then use the tile
                        best.push(new Action(squ.x, squ.y, this.boxProb[i]));
                    } else {
                        console.log("Tile " + squ.asText() + " is ignored because it is dead");
                    }
 
                }
            }
        }

        // sort in to best order
        best.sort(function (a, b) { return b.prob - a.prob });

        return best;

    }

    // returns an array of 'Tile' which are dead
    getDeadTiles() {

         return this.deadTiles;
    }

}

class MergeSorter {

    constructor(boxes) {

        if (boxes == null) {
            this.checks = [];
            return;
        }

        this.checks = Array(boxes.length);

        for (var i = 0; i < boxes.length; i++) {
            this.checks[i] = boxes[i].uid;
        }

    }

    compare(p1, p2) {

        var c = p1.mineCount - p2.mineCount;

        if (c != 0) {
            return c;
        }

        for (var i = 0; i < this.checks.length; i++) {
            var index = this.checks[i];

            c = p1.allocatedMines[index] - p2.allocatedMines[index];

            if (c != 0) {
                return c;
            }

        }

        return 0;
    }
		
}

/*
 * Used to hold a solution
 */
class ProbabilityLine {

    //constructor(boxCount) {
    //    constructor(boxCount, BigInt(0));
    //} 

	constructor(boxCount, solutionCount) {
		
        this.mineCount = 0;
        if (solutionCount == null) {
            this.solutionCount = BigInt(0);
        } else {
            this.solutionCount = solutionCount;
        }
        
        this.mineBoxCount = Array(boxCount).fill(BigInt(0));
        this.allocatedMines = Array(boxCount).fill(0);

    }
	
}

// used to hold what we need to analyse next
class NextWitness {
    constructor(boxWitness) {

        this.boxWitness = boxWitness;

        this.oldBoxes = [];
        this.newBoxes = [];

        for (var i = 0; i < this.boxWitness.boxes.length; i++) {

            var box = this.boxWitness.boxes[i];
            if (box.processed) {
                this.oldBoxes.push(box);
            } else {
                this.newBoxes.push(box);
            }
        }
    }

}



// holds a witness and all the Boxes adjacent to it
class BoxWitness {
	constructor(tile) {

        this.tile = tile;

        this.boxes = [];  // adjacent boxes 
        this.tiles = [];  // adjacent tiles

        this.processed = false;
        this.minesToFind = tile.getValue();   

        var adjTile = board.getAdjacent(tile);

        // determine how many mines are left to find and store adjacent tiles
        for (var i = 0; i < adjTile.length; i++) {
            if (adjTile[i].isFlagged()) {
                this.minesToFind--;
            } else if (adjTile[i].isCovered()) {
                this.tiles.push(adjTile[i]);
            }
        }		
 	}

    overlap(boxWitness) {

        // if the locations are too far apart they can't share any of the same squares
        if (Math.abs(boxWitness.tile.x - this.tile.x) > 2 || Math.abs(boxWitness.tile.y - this.tile.y) > 2) {
            return false;
        }

        top: for (var i = 0; i < boxWitness.tiles.length; i++) {

            var tile1 = boxWitness.tiles[i];

            for (var j = 0; j < this.tiles.length; j++) {

                var tile2 = this.tiles[j];

                if (tile1.isEqual(tile2)) {  // if they share a tile then return true
                    return true;
                }
            }
        }

        // no shared tile found
        return false;

    }


    // if two witnesses have the same Squares around them they are equivalent
    equivalent(boxWitness) {

        // if the number of squares is different then they can't be equivalent
        if (this.tiles.length != boxWitness.tiles.length) {
            return false;
        }

        // if the locations are too far apart they can't share the same squares
        if (Math.abs(boxWitness.tile.x - this.tile.x) > 2 || Math.abs(boxWitness.tile.y - this.tile.y) > 2) {
            return false;
        }

        for (var i = 0; i < this.tiles.length; i++) {

            var l1 = this.tiles[i];

            var found = false;
            for (var j = 0; j < boxWitness.tiles.length; j++) {
                if (boxWitness.tiles[j].index == l1.index) {
                    found = true;
                    break;
                }
            }
            if (!found) {
                return false;
            }
        }

        return true;
    }

    // add an adjacdent box 
    addBox(box) {
        this.boxes.push(box);
    }
}

// information about the boxes surrounding a dead candidate
class DeadCandidate {

    constructor() {

        this.candidate;
        this.myBox;
        this.isAlive = false;
        this.goodBoxes = [];
        this.badBoxes = [];

        this.firstCheck = true;
        this.total = 0;

    }

}

// a box is a group of tiles which share the same witnesses
class Box {
	constructor(boxWitnesses, tile, uid) {

        this.processed = false;

		this.uid = uid;
        this.minMines;
        this.maxMines;

		this.tiles = [];
		this.tiles.push(tile);
		
		this.boxWitnesses = [];
		
		for (var i=0; i < boxWitnesses.length; i++) {
			if (tile.isAdjacent(boxWitnesses[i].tile)) {
                this.boxWitnesses.push(boxWitnesses[i]);
                boxWitnesses[i].addBox(this);

			}
		}
		
		//console.log("Box created for tile " + tile.asText() + " with " + this.boxWitnesses.length + " witnesses");

	}
	
	// if the tiles surrounding witnesses equal the boxes then it fits
	fits(tile, count) {

		// a tile can't share the same witnesses for this box if they have different numbers
		if (count != this.boxWitnesses.length) {
			return false;
		}
		
		for (var i=0; i < this.boxWitnesses.length; i++) {
			if (!this.boxWitnesses[i].tile.isAdjacent(tile)) {
				return false;
			}
		}		
		
		//console.log("Tile " + tile.asText() + " fits in box with tile " + this.tiles[0].asText());
		
		return true;
		
	}

    /*
    * Once all the squares have been added we can do some calculations
    */
    calculate(minesLeft) {

        this.maxMines = Math.min(this.tiles.length, minesLeft);  // can't have more mines then there are tiles to put them in or mines left to discover
        this.minMines = 0;

        for (var i = 0; i < this.boxWitnesses.length; i++) {
            if (this.boxWitnesses[i].minesToFind < this.maxMines) {  // can't have more mines than the lowest constraint
                this.maxMines = this.boxWitnesses[i].minesToFind;
            }
        }		

    }

	// add a new tile to the box
	add(tile) {
		this.tiles.push(tile);
	}

    contains(tile) {

        // return true if the given tile is in this box
        for (var i = 0; i < this.tiles.length; i++) {
            if (this.tiles[i].index == tile.index) {
                return true;
            }
        }

        return false;

    }

}
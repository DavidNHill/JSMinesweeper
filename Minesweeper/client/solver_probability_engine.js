/**
 * 
 */

"use strict";

class ProbabilityEngine {
	constructor(allWitnesses, allWitnessed, squaresLeft, minesLeft) {

       	this.SMALL_COMBINATIONS = [ [ 1 ], [ 1, 1 ], [ 1, 2, 1 ], [ 1, 3, 3, 1 ], [ 1, 4, 6, 4, 1 ], [ 1, 5, 10, 10, 5, 1 ], [ 1, 6, 15, 20, 15, 6, 1 ], [ 1, 7, 21, 35, 35, 21, 7, 1 ], [ 1, 8, 28, 56, 70, 56, 28, 8, 1 ] ];


		this.witnesses = allWitnesses;
		this.witnessed = allWitnessed;

        // constraints in the game
        this.minesLeft = minesLeft;
        this.squaresLeft = squaresLeft - allWitnessed.length;   // squares left off the edge and unrevealed
        this.minTotalMines = minesLeft - this.squaresLeft;   // //we can't use so few mines that we can't fit the remainder elsewhere on the board
        this.maxTotalMines = minesLeft;

        this.boxes = [];
        this.boxWitnesses = [];
        this.mask = [];

        this.boxProb = [];  // the probabilities end up here
		this.workingProbs = []; 
        this.heldProbs = [];
        this.bestProbability = 0;  // best probability of being safe


        // generate a BoxWitness for each witness tile
        for (var i = 0; i < this.witnesses.length; i++) {
            var boxWit = this.witnesses[i];
            this.boxWitnesses.push(new BoxWitness(boxWit));
        }

		// allocate each of the witnessed squares to a box
		var uid = 0;
		for (var i=0; i < this.witnessed.length; i++) {
			
			var boxWit = this.witnessed[i];
			
			var count = 0;
			
			// count how many adjacent witnesses the tile has
			for (var j=0; j < this.witnesses.length; j++) {
				if (boxWit.isAdjacent(this.witnesses[j])) {
					count++;
				}
			}
			
			var found = false;
			
			for (var j=0; j < this.boxes.length; j++) {
				
				if (this.boxes[j].fits(boxWit, count)) {
					this.boxes[j].add(boxWit);
					found = true;
					break;
				}
				
			}
			
			// if not found create a new box and store it
			if (!found) {
                this.boxes.push(new Box(this.boxWitnesses, boxWit, uid++));
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
 
		// create an initial solution of no mines anywhere 
		var held = new ProbabilityLine(this.boxes.length);
		held.solutionCount = BigInt(1);
		this.heldProbs.push(held);
		
		// add an empty probability line to get us started
        this.workingProbs.push(new ProbabilityLine(this.boxes.length));
		
        var nextWitness = this.findFirstWitness();

        while (nextWitness != null) {

            console.log("Probability engine processing witness " + nextWitness.boxWitness.tile.asText());

            // mark the new boxes as processed - which they will be soon
            for (var i = 0; i < nextWitness.newBoxes.length; i++) {
                this.mask[nextWitness.newBoxes[i].uid] = true;
            }

            this.workingProbs = this.mergeProbabilities(nextWitness);

            //if (this.workingProbs.length > 10) {
                console.log("Items in the working array = " + this.workingProbs.length);
            //}

            nextWitness = this.findNextWitness(nextWitness);

        }

        this.calculateBoxProbabilities();
		
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
                
                //newProbs.addAll(distributeMissingMines(pl, nw, missingMines, 0));

                var result = this.distributeMissingMines(pl, nw, missingMines, 0);
                newProbs.push(...result);

                //for (var j = 0; j < result.length; j++) {
                //   newProbs.push(result[j]);
                //}

            }

        }

        //if (newProbs.length == 0) {
        //     console.log("Returning no lines from merge probability !!");
        //}

         return newProbs;

    }

    // counts the number of mines already placed
    countPlacedMines(pl, nw) {

        var result = BigInt(0);

        for (var i = 0; i < nw.oldBoxes.length; i++) {

            var b = nw.oldBoxes[i];

            result = result + pl.mineBoxCount[b.uid];
        }

        return Number(result);
    }

    // this is used to recursively place the missing Mines into the available boxes for the probability line
    distributeMissingMines(pl, nw,  missingMines, index) {

        //console.log("Distributing " + missingMines + " missing mines to box " + nw.newBoxes[index].uid);

        this.recursions++;
        if (this.recursions % 100 == 0) {
            console.log("Probability Engine recursision = " + recursions);
        }

        var result = [];

        // if there is only one box left to put the missing mines we have reach this end of this branch of recursion
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
            pl.mineBoxCount[nw.newBoxes[index].uid] = BigInt(missingMines);
            pl.mineCount = pl.mineCount + missingMines;
            result.push(pl);
            //console.log("Distribute missing mines line after " + pl.mineBoxCount);
            return result;
        }


        // this is the recursion
        var maxToPlace = Math.min(nw.newBoxes[index].maxMines, missingMines);

        for (var i = nw.newBoxes[index].minMines; i <= maxToPlace; i++) {
            var npl = this.extendProbabilityLine(pl, nw.newBoxes[index], i);

            var r1 = this.distributeMissingMines(npl, nw, missingMines - i, index + 1);
            result.push(...r1);

            //for (var j = 0; j < r1.length; j++) {
            //    result.push(r1[j]);
            //}

            //result.push(distributeMissingMines(npl, nw, missingMines - i, index + 1));
        }

        return result;

    }

    // create a new probability line by taking the old and adding the mines to the new Box
    extendProbabilityLine(pl, newBox, mines) {

        //console.log("Extended probability line: Adding " + mines + " mines to box " + newBox.uid);
        //console.log("Extended probability line before" + pl.mineBoxCount);

        var result = new ProbabilityLine(this.boxes.length);

        result.mineCount = pl.mineCount + mines;
        //result.solutionCount = pl.solutionCount;

        // copy the probability array
 
        //for (var i = 0; i < pl.mineBoxCount.length; i++) {
        //    result.mineBoxCount[i] = pl.mineBoxCount[i];
        //}

        result.mineBoxCount = pl.mineBoxCount.slice();

        result.mineBoxCount[newBox.uid] = BigInt(mines);

        //console.log("Extended probability line after " + result.mineBoxCount);

        return result;
    }


    // this combines newly generated probabilities with ones we have already stored from other independent sets of witnesses
    storeProbabilities() {

        console.log("At store probabilities");

        var result = [];

        if (this.workingProbs.length == 0) {
        	console.log("working probabilites list is empty!!");
        	return;
        } 

        //if (CHECK_FOR_DEAD_LOCATIONS) {
        //    checkCandidateDeadLocations();
        //}

        // crunch the new ones down to one line per mine count
        var crunched = this.crunchByMineCount(this.workingProbs);

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

                        //npl.hashCount[i] = epl.hashCount[i].add(pl.hashCount[i]);

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

                //npl.hashCount[i] = npl.hashCount[i].add(pl.hashCount[i]);
            }
        }

        this.heldProbs.push(npl);

        //if (this.heldProbs.length > 10) {
            console.log("Items in the held array = " + this.heldProbs.length);
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

    crunchByMineCount(target) {

        if (target.length == 0) {
            return target;
         }

        // sort the solutions by number of mines
        target.sort(function (a, b) { return a.mineCount - b.mineCount });

        var result = [];

        var mc = target[0].mineCount;
        var npl = new ProbabilityLine(this.boxes.length);
        npl.mineCount = mc;

        for (var i = 0; i < target.length; i++) {

            var pl = target[i];

            if (pl.mineCount != mc) {
                result.push(npl);
                mc = pl.mineCount;
                npl = new ProbabilityLine(this.boxes.length);
                npl.mineCount = mc;
            }
            this.mergeLineProbabilities(npl, pl);
        }

        //if (npl.mineCount >= minTotalMines) {
        result.push(npl);
        //}	

        //solver.display(target.size() + " Probability Lines compressed to " + result.size()); 

        return result;

    }

    // calculate how many ways this solution can be generated and roll them into one
    mergeLineProbabilities(npl, pl) {

        var solutions = BigInt(1);
        for (var i = 0; i < pl.mineBoxCount.length; i++) {
            solutions = solutions * BigInt(this.SMALL_COMBINATIONS[this.boxes[i].tiles.length][pl.mineBoxCount[i]]);
        }

        npl.solutionCount = npl.solutionCount + solutions;

        for (var i = 0; i < pl.mineBoxCount.length; i++) {
            if (this.mask[i]) {  // if this box has been involved in this solution - if we don't do this the hash gets corrupted by boxes = 0 mines because they weren't part of this edge
                npl.mineBoxCount[i] = npl.mineBoxCount[i] + pl.mineBoxCount[i] * solutions;

                //if (pl.mineBoxCount[i].signum() == 0) {
                //    npl.hashCount[i] = npl.hashCount[i].subtract(pl.hash.multiply(BigInteger.valueOf(boxes.get(i).getSquares().size())));   // treat no mines as -1 rather than zero
                //} else {
                //    npl.hashCount[i] = npl.hashCount[i].add(pl.mineBoxCount[i].multiply(pl.hash));
                //}
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

        // flag the last set of details as processed
        prevWitness.boxWitness.processed = true;

        for (var i = 0; i < prevWitness.newBoxes.length; i++) {
            prevWitness.newBoxes[i].processed = true;
        }

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

                            if (!b1.proccessed) {
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

        //independentGroups++;

        // since we have calculated all the mines in an independent set of witnesses we can crunch them down and store them for later

        // get an unprocessed witness
        var nw = this.findFirstWitness();
        if (nw != null) {
            console.log("Starting a new independent edge");
        }

        // only crunch it down for non-trivial probability lines unless it is the last set - this is an efficiency decision
        if (this.workingProbs.length > 2 || nw == null) {
            this.storeProbabilities();

            // reset the working array so we can start building up one for the new set of witnesses
            this.workingProbs = [];
            this.workingProbs.push(new ProbabilityLine(this.boxes.length));

            // reset the mask indicating that no boxes have been processed 
            for (var i = 0; i < this.mask.length; i++) {
                this.mask[i] = false;
            }
        }

        // return the next witness to process
        return nw;

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
                var mult = combination(this.minesLeft - pl.mineCount, this.squaresLeft);  //# of ways the rest of the board can be formed

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
                this.boxes[i].tiles[j].setProbability(this.boxProb[i]);
            }

        }


        // add the dead locations we found
        /*
        if (CHECK_FOR_DEAD_LOCATIONS) {
            Set < Location > newDead = new HashSet<>();
            for (DeadCandidate dc: deadCandidates) {
                if (!dc.isAlive && boxProb[dc.myBox.getUID()].signum() != 0) {
                    newDead.add(dc.candidate);
                }
            }
            deadLocations = deadLocations.merge(new Area(newDead));

        }
        */

        /*
        for (int i = 0; i < hashTally.length; i++) {
            //solver.display(boxes.get(i).getSquares().size() + " " + boxes.get(i).getSquares().get(0).display() + " " + hashTally[i].toString());
            for (int j = i + 1; j < hashTally.length; j++) {

                //BigInteger hash1 = hashTally[i].divide(BigInteger.valueOf(boxes.get(i).getSquares().size()));
                //BigInteger hash2 = hashTally[j].divide(BigInteger.valueOf(boxes.get(j).getSquares().size()));

                if (hashTally[i].compareTo(hashTally[j]) == 0 && boxes.get(i).getSquares().size() == 1 && boxes.get(j).getSquares().size() == 1) {
                    //if (hash1.compareTo(hash2) == 0) {
                    addLinkedLocation(linkedLocations, boxes.get(i), boxes.get(j));
                    addLinkedLocation(linkedLocations, boxes.get(j), boxes.get(i));
                    //solver.display("Box " + boxes.get(i).getSquares().get(0).display() + " is linked to Box " + boxes.get(j).getSquares().get(0).display() + " prob " + boxProb[i]);
                }

                // if one hasTally is the negative of the other then   i flag <=> j clear
                if (hashTally[i].compareTo(hashTally[j].negate()) == 0 && boxes.get(i).getSquares().size() == 1 && boxes.get(j).getSquares().size() == 1) {
                    //if (hash1.compareTo(hash2.negate()) == 0) {
                    //solver.display("Box " + boxes.get(i).getSquares().get(0).display() + " is contra linked to Box " + boxes.get(j).getSquares().get(0).display() + " prob " + boxProb[i] + " " + boxProb[j]);
                    addLinkedLocation(contraLinkedLocations, boxes.get(i), boxes.get(j));
                    addLinkedLocation(contraLinkedLocations, boxes.get(j), boxes.get(i));
                }
            }
        }
        */

        // sort so that the locations with the most links are at the top
        //Collections.sort(linkedLocations, LinkedLocation.SORT_BY_LINKS_DESC);

        var offEdgeProbability;

        // avoid divide by zero
        if (this.squaresLeft != 0 && totalTally != BigInt(0)) {
            //offEdgeProbability = 1 - outsideTally / (totalTally * BigInt(this.squaresLeft));
            offEdgeProbability = 1 - divideBigInt(outsideTally, totalTally * BigInt(this.squaresLeft), 6);
        } else {
            offEdgeProbability = 0;
        }

        var finalSolutionsCount = totalTally;

        // see if we can find a guess which is better than outside the boxes
        var hwm = offEdgeProbability;

        //offEdgeBest = true;

        for (var i = 0; i < this.boxes.length; i++) {

            var b = this.boxes[i];

            var living = true;
            //for (Square squ: b.getSquares()) {
            //    if (!deadLocations.contains(squ)) {
            //        living = true;
            //        break;
            //    }
            //}

            var prob = this.boxProb[b.uid];
            if (living || prob == 1) {   // if living or 100% safe then consider this probability

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

        console.log("Off edge probability is " + offEdgeProbability);
        console.log("Best probability is " + this.bestProbability);
        console.log("Game has  " + finalSolutionsCount + " candidate solutions" );


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

                    //best.set(squ.index, new Action(squ.x, squ.y, this.boxProb[i]));
                    best.push(new Action(squ.x, squ.y, this.boxProb[i]));

                    //if (!deadLocations.contains(squ) || boxProb[i].compareTo(BigDecimal.ONE) == 0) {  // if not a dead location or 100% safe then use it
                    //    best.add(new CandidateLocation(squ.x, squ.y, boxProb[i], boardState.countAdjacentUnrevealed(squ), boardState.countAdjacentConfirmedFlags(squ)));
                    //} else {
                    //    boardState.display("Location " + squ.display() + " is ignored because it is dead");
                    //}
                }
            }
        }

        // sort in to best order
        best.sort(function (a, b) { return b.prob - a.prob });

        return best;

    }

}

/*
 * Used to hold a solution
 */
class ProbabilityLine {
	constructor(boxCount) {
		
		this.mineCount = 0;
        this.solutionCount = BigInt(0);
        this.mineBoxCount = Array(boxCount).fill(BigInt(0));

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

        this.processed = false;
        this.minesToFind = tile.getValue();   

        var adjTile = board.getAdjacent(tile);

        for (var i = 0; i < adjTile.length; i++) {
            if (adjTile[i].isFlagged()) {
                this.minesToFind--;
            }
        }		

		this.tile = tile;
		
		this.boxes = [];

        /*
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
		*/
		
	}

    // add an adjacdent box 
    addBox(box) {
        this.boxes.push(box);
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
	
}
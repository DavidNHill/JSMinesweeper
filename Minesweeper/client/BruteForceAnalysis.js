"use strict";

// constants used in this processing
const BRUTE_FORCE_ANALYSIS_MAX_NODES = 50000;
const PRUNE_BF_ANALYSIS = true;
const BRUTE_FORCE_ANALYSIS_TREE_DEPTH = 10;

const INDENT = "................................................................................";

// globals used in this processing
var processCount = 0;   // how much work has been done
var allSolutions;       // this is class 'SolutionTable'
var allTiles;           // this is an array of the tiles being analysed 
var cache = new Map();  

class BruteForceAnalysis {

	constructor(solutions, tiles, size) {  // tiles is array of class 'Tile' being considered

        allTiles = tiles;

        this.cacheHit = 0;
        this.cacheSize = 0;
        this.cacheWinningLines = 0;
        this.allDead = false;   // this is true if all the locations are dead

        this.currentNode;
        this.expectedMove;

        this.maxSolutionSize = size;
        allSolutions = new SolutionTable(solutions);

    }

    process() {

        var start = Date.now();

        console.log("----- Brute Force Deep Analysis starting ----");
        console.log(allSolutions.size() + " solutions in BruteForceAnalysis");

        // create the top node 
        var top = this.buildTopNode(allSolutions);  // top is class 'Node'

        if (top.getLivingLocations().length == 0) {
            this.allDead = true;
        }

        var best = 0;

        for (var i = 0; i < top.getLivingLocations().length; i++) {

            var move = top.getLivingLocations()[i];  // move is class 'Livinglocation'

            var winningLines = top.getWinningLinesStart(move);  // calculate the number of winning lines if this move is played

            if (best < winningLines || (top.bestLiving != null && best == winningLines && top.bestLiving.mineCount < move.mineCount)) {
                best = winningLines;
                top.bestLiving = move;
            }

            var singleProb = (allSolutions.size() - move.mineCount) / allSolutions.size();

            if (move.pruned) {
                console.log(move.index + " " + allTiles[move.index].asText() + " is living with " + move.count + " possible values and probability " + this.percentage(singleProb) + ", this location was pruned");
            } else {
                console.log(move.index + " " + allTiles[move.index].asText() + " is living with " + move.count + " possible values and probability " + this.percentage(singleProb) + ", winning lines " + winningLines);
            }


        }

        top.winningLines = best;

        this.currentNode = top;

        if (processCount < BRUTE_FORCE_ANALYSIS_MAX_NODES) {
            this.completed = true;
            if (true) {
                console.log("--------- Probability Tree dump start ---------");
                this.showTree(0, 0, top);
                console.log("---------- Probability Tree dump end ----------");
            }
        }


        // clear down the cache
        cache.clear();

        var end = Date.now();;
        console.log("Total nodes in cache = " + this.cacheSize + ", total cache hits = " + this.cacheHit + ", total winning lines saved = " + this.cacheWinningLines);
        console.log("process took " + (end - start) + " milliseconds and explored " + processCount + " nodes");
        console.log("----- Brute Force Deep Analysis finished ----");
    }

	/**
	 * Builds a top of tree node based on the solutions provided
	 */
	buildTopNode(solutionTable) {

        var result = new Node();   

        result.startLocation = 0;
        result.endLocation = solutionTable.size();

        var living = [];  // living is an array of 'LivingLocation'

        for (var i = 0; i < allTiles.length; i++) {
            var value;

            var valueCount = new Array(9).fill(0);
            var mines = 0;
            var maxSolutions = 0;
            var count = 0;
            var minValue = 0;
            var maxValue = 0;

            for (var j = 0; j < result.getSolutionSize(); j++) {
                if (solutionTable.get(j)[i] != BOMB) {
                    value = solutionTable.get(j)[i];
                    valueCount[value]++;
                } else {
                    mines++;
                }
            }

            for (var j = 0; j < valueCount.length; j++) {
                if (valueCount[j] > 0) {
                    if (count == 0) {
                        minValue = j;
                    }
                    maxValue = j;
                    count++;
                    if (maxSolutions < valueCount[j]) {
                        maxSolutions = valueCount[j];
                    }
                }
            }
            if (count > 1) {
                var alive = new LivingLocation(i);   // alive is class 'LivingLocation'
                alive.mineCount = mines;
                alive.count = count;
                alive.minValue = minValue;
                alive.maxValue = maxValue;
                alive.maxSolutions = maxSolutions;
                alive.zeroSolutions = valueCount[0];
                living.push(alive);
            } else {
                console.log(allTiles[i].asText() + " is dead with value " + minValue);
            }

        }

        living.sort((a, b) => a.compareTo(b));

        result.livingLocations = living;

        return result;
    }   


 
    getNextMove() {

        var bestLiving = this.getBestLocation(this.currentNode);  /// best living is 'LivingLocation'

        if (bestLiving == null) {
            return null;
        }

        loc = allTiles[bestLiving.index];  // loc is class 'Tile'

        //solver.display("first best move is " + loc.display());
        var prob = 1 - (bestLiving.mineCount / this.currentNode.getSolutionSize());

        /*
        while (boardState.isRevealed(loc)) {
            int value = boardState.getWitnessValue(loc);

            currentNode = bestLiving.children[value];
            bestLiving = getBestLocation(currentNode);
            if (bestLiving == null) {
                return null;
            }
            prob = BigDecimal.ONE.subtract(BigDecimal.valueOf(bestLiving.mineCount).divide(BigDecimal.valueOf(currentNode.getSolutionSize()), Solver.DP, RoundingMode.HALF_UP));

            loc = this.locations.get(bestLiving.index);

        }
        */

        console.log("mines = " + bestLiving.mineCount + " solutions = " + this.currentNode.getSolutionSize());
        for (var i = 0; i < bestLiving.children.length; i++) {
            if (bestLiving.children[i] == null) {
                //solver.display("Value of " + i + " is not possible");
                continue; //ignore this node but continue the loop
            }

            var probText;
            if (bestLiving.children[i].bestLiving == null) {
                probText = 1 / bestLiving.children[i].getSolutionSize();
                //probText = Action.FORMAT_2DP.format(ONE_HUNDRED.divide(BigDecimal.valueOf(bestLiving.children[i].getSolutionSize()), Solver.DP, RoundingMode.HALF_UP)) + "%";
            } else {
                probText = bestLiving.children[i].getProbability();
                //probText = Action.FORMAT_2DP.format(bestLiving.children[i].getProbability().multiply(ONE_HUNDRED)) + "%";
            }
            solver.display("Value of " + i + " leaves " + bestLiving.children[i].getSolutionSize() + " solutions and winning probability " + probText + " (work size " + bestLiving.children[i].work + ")");
        }

        action = new Action(loc.getX(), loc.getY(), prob);

        this.expectedMove = loc;

        return action;

    }
	
	getBestLocation(node) {
        return node.bestLiving;
    }
	
	
	showTree(depth, value, node) {

        var condition;
        if (depth == 0) {
            condition = node.getSolutionSize() + " solutions remain";
        } else {
            condition = "When '" + value + "' ==> " + node.getSolutionSize() + " solutions remain";
        }

        if (node.bestLiving == null) {
            var line = INDENT.substring(0, depth * 3) + condition + " Solve chance " + node.getProbability();
            console.log(line);
            return;
        }

        var loc = allTiles[node.bestLiving.index];

        var prob = 1 - (node.bestLiving.mineCount / node.getSolutionSize());


        var line = INDENT.substring(0, depth * 3) + condition + " play " + loc.asText() + " Survival chance " + prob + ", Solve chance " + node.getProbability();

        console.log(line);

        //for (Node nextNode: node.bestLiving.children) {
        for (var val = 0; val < node.bestLiving.children.length; val++) {
            var nextNode = node.bestLiving.children[val];
            if (nextNode != null) {
                this.showTree(depth + 1, val, nextNode);
            }

        }

    }


    getExpectedMove() {
        return this.expectedMove;
    }
	
	percentage(prob) {
        return prob * 100;
    }

    allDead() {
        return this.allDead;
    }


}


/**
 * A key to uniquely identify a position
 */
class Position {

    constructor(p, index, value) {

        this.position;
        this.hash = 0;

        if (p == null) {
            this.position = new Array(allTiles.length).fill(15);
            //for (var i = 0; i < this.position.length; i++) {
            //    this.position[i] = 15;
            //}
        } else {
            // copy and update to reflect the new position
            this.position = [];
            this.position.push(...p.position);   // copy the old position to this one
            this.position[index] = value + 50;
        }

    }

 
    // copied from String hash
    hashCode() {
        var h = this.hash;
        if (h == 0 && position.length > 0) {
            for (var i = 0; i < position.length; i++) {
                h = 31 * h + position[i];
            }
            this.hash = h;
        }
        return h;
    }


   equals(o) {
        if (o instanceof Position) {
            for (var i = 0; i < position.length; i++) {
                if (this.position[i] != o.position[i]) {
                    return false;
                }
            }
            return true;
        } else {
            return false;
        }
    }

}

/**
 * Positions on the board which can still reveal information about the game.
 */
class LivingLocation {

    constructor (index) {
        this.index = index;

        this.pruned = false;
        this.mineCount = 0;  // number of remaining solutions which have a mine in this position
        this.maxSolutions = 0;    // the maximum number of solutions that can be remaining after clicking here
        this.zeroSolutions = 0;    // the number of solutions that have a '0' value here
        this.maxValue = -1;
        this.minValue = -1;
        this.count;  // number of possible values at this location

        this.children;  // children is an array of class 'Node'

    }

    /**
     * Determine the Nodes which are created if we play this move. Up to 9 positions where this locations reveals a value [0-8].
     */
    buildChildNodes(parent) {  // parent is class 'Node'

        // sort the solutions by possible values
        allSolutions.sortSolutions(parent.startLocation, parent.endLocation, this.index);
        var index = parent.startLocation;

        // skip over the mines
        //while (index < parent.endLocation && allSolutions.get(index)[this.index] == BOMB) {
        //    index++;
        //}

        var work = Array(9);  // work is an array of class 'Node' with size 9

        for (var i = this.minValue; i < this.maxValue + 1; i++) {

             // if the node is in the cache then use it
            var pos = new Position(parent.position, this.index, i);

            //TODO cache not implemented
            //var temp1 = cache.get(pos);  // temp1 is class 'Node'
            var temp1 = null;

            if (temp1 == null) {

                var temp = new Node(pos);

                temp.startLocation = index;
                // find all solutions for this values at this location
                while (index < parent.endLocation && allSolutions.get(index)[this.index] == i) {
                    index++;
                }
                temp.endLocation = index;

                work[i] = temp;

            } else {
                //System.out.println("In cache " + temp.position.key + " " + temp1.position.key);
                //if (!temp.equals(temp1)) {
                //	System.out.println("Cache not equal!!");
                //}
                //temp1.fromCache = true;
                work[i] = temp1;
                cacheHit++;
                cacheWinningLines = cacheWinningLines + temp1.winningLines;
                // skip past these details in the array
                while (index < parent.endLocation && allSolutions.get(index)[this.index] <= i) {
                    index++;
                }
            }
        }

        // skip over the mines
        while (index < parent.endLocation && allSolutions.get(index)[this.index] == BOMB) {
            index++;
        }

        if (index != parent.endLocation) {
            console.log("**** Didn't read all the elements in the array; index = " + index + " end = " + parent.endLocation + " ****");
        }


        for (var i = this.minValue; i <= this.maxValue; i++) {
            if (work[i].getSolutionSize() > 0) {
                //if (!work[i].fromCache) {
                //	work[i].determineLivingLocations(this.livingLocations, living.index);
                //}
            } else {
                work[i] = null;   // if no solutions then don't hold on to the details
            }

        }

        this.children = work;

    }


     compareTo(o) {

        // return location most likely to be clear  - this has to be first, the logic depends upon it
        var test = this.mineCount - o.mineCount;
        if (test != 0) {
            return test;
        }

        // then the location most likely to have a zero
        test = o.zeroSolutions - this.zeroSolutions;
        if (test != 0) {
            return test;
        }

        // then by most number of different possible values
        test = o.count - this.count;
        if (test != 0) {
            return test;
        }

        // then by the maxSolutions - ascending
        return this.maxSolutions - o.maxSolutions;

    }

}

/**
 * A representation of a possible state of the game
 */
class Node {

    //private Node() {
    //    position = new Position();
    //}

    constructor (position) {

        this.position;   // representation of the position we are analysing / have reached

        if (position == null) {
            this.position = new Position();
        } else {
            this.postion = position;
        }

 
        this.livingLocations;       // these are the locations which need to be analysed

        this.winningLines = 0;      // this is the number of winning lines below this position in the tree
        this.work = 0;              // this is a measure of how much work was needed to calculate WinningLines value
        this.fromCache = false;     // indicates whether this position came from the cache

        this.startLocation;         // the first solution in the solution array that applies to this position
        this.endLocation;           // the last + 1 solution in the solution array that applies to this position

        this.bestLiving;            // after analysis this is the location that represents best play

    }

    getLivingLocations() {
        return this.livingLocations;
    }

    getSolutionSize() {
        return this.endLocation - this.startLocation;
    }

    /**
     * Get the probability of winning the game from the position this node represents  (winningLines / solution size)
      */
    getProbability() {

        return this.winningLines / this.getSolutionSize();

    }

    /**
     * Calculate the number of winning lines if this move is played at this position
     * Used at top of the game tree
     */
    getWinningLinesStart(move) {  // move is class LivingLocation 

        //if we can never exceed the cutoff then no point continuing
        if (PRUNE_BF_ANALYSIS && this.getSolutionSize() - move.mineCount <= this.winningLines) {
            move.pruned = true;
            return 0;
        }

        var winningLines = this.getWinningLines(1, move, this.winningLines);

        if (winningLines > this.winningLines) {
            this.winningLines = winningLines;
        }

        return winningLines;
    }


    /**
     * Calculate the number of winning lines if this move is played at this position
     * Used when exploring the game tree
     */
    getWinningLines(depth, move, cutoff) {  // move is class 'LivingLocation' 

        //console.log("At depth " + depth + " cutoff=" + cutoff);

        var result = 0;

        processCount++;
        if (processCount > BRUTE_FORCE_ANALYSIS_MAX_NODES) {
            return 0;
        }

        var notMines = this.getSolutionSize() - move.mineCount;

        move.buildChildNodes(this);

        for (var i = 0; i < move.children.length; i++) {

            var child = move.children[i];  // child is class 'Node'

            if (child == null) {
                continue;  // continue the loop but ignore this entry
            }

            var maxWinningLines = result + notMines;

            // if the max possible winning lines is less than the current cutoff then no point doing the analysis
            if (PRUNE_BF_ANALYSIS && maxWinningLines <= cutoff) {
                move.pruned = true;
                return 0;
            }


            if (child.fromCache) {  // nothing more to do, since we did it before
                this.work++;
            } else {

                child.determineLivingLocations(this.livingLocations, move.index);
                this.work++;

                if (child.getLivingLocations().length == 0) {  // no further information ==> all solution indistinguishable ==> 1 winning line

                    child.winningLines = 1;

                } else {  // not cached and not terminal node, so we need to do the recursion

                    for (var j = 0; j < child.getLivingLocations().length; j++) {

                        var childMove = child.getLivingLocations()[j];  // childmove is class 'LivingLocation'

                        // if the number of safe solutions <= the best winning lines then we can't do any better, so skip the rest
                        if (child.getSolutionSize() - childMove.mineCount <= child.winningLines) {
                            break;
                        }

                        // now calculate the winning lines for each of these children
                        var winningLines = child.getWinningLines(depth + 1, childMove, child.winningLines);
                        if (child.winningLines < winningLines || (child.bestLiving != null && child.winningLines == winningLines && child.bestLiving.mineCount < childMove.mineCount)) {
                            child.winningLines = winningLines;
                            child.bestLiving = childMove;
                        }

                        // if there are no mines then this is a 100% safe move, so skip any further analysis since it can't be any better
                        if (childMove.mineCount == 0) {
                            break;
                        }


                    }

                    // no need to hold onto the living location once we have determined the best of them
                    child.livingLocations = null;

                    //TODO not using cache to start with

                    //if (depth > solver.preferences.BRUTE_FORCE_ANALYSIS_TREE_DEPTH) {  // stop holding the tree beyond this depth
                    //	child.bestLiving = null;
                    //}

                    // add the child to the cache if it didn't come from there and it is carrying sufficient winning lines
                    //if (child.work > 30) {
                    //    child.work = 0;
                    //    child.fromCache = true;
                    //    cacheSize++;
                    //    cache.put(child.position, child);
                    //} else {
                    //    this.work = this.work + child.work;
                    //}


                }

            }

            if (depth > BRUTE_FORCE_ANALYSIS_TREE_DEPTH) {  // stop holding the tree beyond this depth
                child.bestLiving = null;
            }

            // store the aggregate winning lines 
            result = result + child.winningLines;

            notMines = notMines - child.getSolutionSize();  // reduce the number of not mines

        }

        return result;

    }

    /**
     * this generates a list of Location that are still alive, (i.e. have more than one possible value) from a list of previously living locations
     * Index is the move which has just been played (in terms of the off-set to the position[] array)
     */
    determineLivingLocations(liveLocs, index) {  // liveLocs is a array of class 'LivingLocation' 

        var living = [];

        for (var i = 0; i < liveLocs.length; i++) {

            var live = liveLocs[i];

            if (live.index == index) {  // if this is the same move we just played then no need to analyse it - definitely now non-living.
                continue;
            }

            var value;

            var valueCount = Array(9).fill(0);
            var mines = 0;
            var maxSolutions = 0;
            var count = 0;
            var minValue = 0;
            var maxValue = 0;

            for (var j = this.startLocation; j < this.endLocation; j++) {
                value = allSolutions.get(j)[live.index];
                if (value != BOMB) {
                     valueCount[value]++;
                } else {
                    mines++;
                }
            }

            // find the new minimum value and maximum value for this location (can't be wider than the previous min and max)
            for (var j = live.minValue; j <= live.maxValue; j++) {
                if (valueCount[j] > 0) {
                    if (count == 0) {
                        minValue = j;
                    }
                    maxValue = j;
                    count++;
                    if (maxSolutions < valueCount[j]) {
                        maxSolutions = valueCount[j];
                    }
                }
            }
            if (count > 1) {
                var alive = new LivingLocation(live.index);  // alive is class 'LivingLocation'
                alive.mineCount = mines;
                alive.count = count;
                alive.minValue = minValue;
                alive.maxValue = maxValue;
                alive.maxSolutions = maxSolutions;
                alive.zeroSolutions = valueCount[0];
                living.push(alive);
            }

        }

        living.sort((a, b) => a.compareTo(b));

        this.livingLocations = living;

    }

    /*
    @Override
    public int hashCode() {
        return position.hashCode();
    }

    @Override
    public boolean equals(Object o) {
        if (o instanceof Node) {
            return position.equals(((Node) o).position);
        } else {
            return false;
        }
    }
	*/	
}

// used to hold all the solutions left in the game
class SolutionTable {

    constructor(solutions) {
        this.solutions = solutions;
    }

    get(index) {
        return this.solutions[index];
    }

    size() {
        return this.solutions.length;
    }

    sortSolutions(start, end, index) {

        var section = this.solutions.slice(start, end);
        section.sort((a, b) => a[index] - b[index]);
        this.solutions.splice(start, section.length, ...section);


        //subSort(this.solutions, start, end - start + 1, (a, b) => b[index] - a[index]);

        //this.solutions.sort(solutions, start, end, sorters[index]);

    }

}

// utility to sort an array 
let subSort = (arr, i, n, sortFx) => [].concat(...arr.slice(0, i), ...arr.slice(i, i + n).sort(sortFx), ...arr.slice(i + n, arr.length));
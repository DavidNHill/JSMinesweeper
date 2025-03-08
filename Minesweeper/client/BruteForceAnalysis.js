"use strict";


// these variables are used across the family of classes used in this process
class BruteForceGlobal {

    // constants used in this processing
    static PLAY_BFDA_THRESHOLD = 1000;                   // number of remaining solutions for the Brute force analysis to start during play mode
    static ANALYSIS_BFDA_THRESHOLD = 5000;               // number of solutions for the Brute force analysis to start when pressing "analyse"
    static BRUTE_FORCE_ANALYSIS_MAX_NODES = 100000000;   // Max number of nodes processed during brute force before we stop
    static BRUTE_FORCE_CYCLES_THRESHOLD = 75000000;      // Max number of cycles used to try and find the remaining solutions 
    static PRUNE_BF_ANALYSIS = true;                     // Performance. Change to false to see the exact win rate for every living tile.
    static BRUTE_FORCE_ANALYSIS_TREE_DEPTH = 4;          // Depth of tree kept and displayed in the console after a successful brute force

    static INDENT = "................................................................................";

    // globals used in this processing
    static processCount = 0;   // how much work has been done
    static allSolutions;       // this is class 'SolutionTable'
    static allTiles;           // this is an array of the tiles being analysed 

    // cache details
    static cache = new Map();
    static cacheHit = 0;
    static cacheWinningLines = 0;
    static cacheWork = 0;

}


class BruteForceAnalysis {

	constructor(solutions, tiles, size, verbose) {  // tiles is array of class 'Tile' being considered

        BruteForceGlobal.allTiles = tiles;

        this.allDead = false;   // this is true if all the locations are dead
        this.deadTiles = [];

        this.winChance;
        this.currentNode;
        this.expectedMove;

        this.bestTile;
        this.processedMoves = [];

        //this.maxSolutionSize = size;
        this.completed = false;

        this.verbose = verbose;

        // reset the globals
        BruteForceGlobal.allSolutions = new SolutionTable(solutions);
        BruteForceGlobal.cache.clear();  //clear the cache
        BruteForceGlobal.cacheHit = 0;
        BruteForceGlobal.cacheWinningLines = 0;
        BruteForceGlobal.cacheWork = 0;
        BruteForceGlobal.processCount = 0;
    }

    async process() {

        const start = performance.now();

        this.writeToConsole("----- Brute Force Deep Analysis starting ----");
        this.writeToConsole(BruteForceGlobal.allSolutions.size() + " solutions in BruteForceAnalysis");

        // create the top node 
        let top = this.buildTopNode(BruteForceGlobal.allSolutions);  // top is class 'Node'

        if (top.getLivingLocations().length == 0) {
            this.allDead = true;
        }

        let best = 0;

        for (let i = 0; i < top.getLivingLocations().length; i++) {

            if (this.verbose) {
                showMessage("Analysing Brute Force Deep Analysis line " + i + " of " + top.getLivingLocations().length);
                await sleep(1);
            }
 
            const move = top.getLivingLocations()[i];  // move is class 'Livinglocation'
            const tile = BruteForceGlobal.allTiles[move.index];

            const winningLines = top.getWinningLinesStart(move);  // calculate the number of winning lines if this move is played

            // if the move wasn't pruned is it a better move
            if (!move.pruned) {

                // Set the win rate on the tile
                tile.setWinRate(winningLines / BruteForceGlobal.allSolutions.size());

                // see if this is the best move yet
                if (best < winningLines || (top.bestLiving != null && best == winningLines && top.bestLiving.mineCount < move.mineCount)) {
                    best = winningLines;
                    top.bestLiving = move;
                }
            }

            const singleProb = (BruteForceGlobal.allSolutions.size() - move.mineCount) / BruteForceGlobal.allSolutions.size();

            if (move.pruned) {
                this.writeToConsole(BruteForceGlobal.allTiles[move.index].asText() + " is living with " + move.count + " possible values and safety "
                    + this.percentage(singleProb) + ", this location was pruned (max winning solutions " + winningLines + ", process count " + BruteForceGlobal.processCount + ")");
            } else {
                this.writeToConsole(BruteForceGlobal.allTiles[move.index].asText() + " is living with " + move.count + " possible values and safety "
                    + this.percentage(singleProb) + ", winning solutions " + winningLines + " (" + "process count " + BruteForceGlobal.processCount + ")");
            }

            if (BruteForceGlobal.processCount < BruteForceGlobal.BRUTE_FORCE_ANALYSIS_MAX_NODES) {
                this.processedMoves.push(BruteForceGlobal.allTiles[move.index]);  // store the tiles we've processed
            }

        }

        top.winningLines = best;

        this.currentNode = top;

        // this is the best tile to guess (or the best we've calculated if incomplete).  "Tile" class.
        if (top.bestLiving != null) {  //  processing possible
            this.bestTile = BruteForceGlobal.allTiles[top.bestLiving.index];

        } else {  // all dead  - so just pick the first tile which isn't a mine
            for (const tile of BruteForceGlobal.allTiles) {
                if (tile.probability != 0) {
                    this.bestTile = tile;
                    break;
                }
            }
            //this.bestTile = BruteForceGlobal.allTiles[0];
        }

        if (BruteForceGlobal.processCount < BruteForceGlobal.BRUTE_FORCE_ANALYSIS_MAX_NODES && this.bestTile != null) {
            this.winChance = best / BruteForceGlobal.allSolutions.size();
            //this.bestTile.setWinRate(this.winChance);

            this.completed = true;
            if (true) {
                this.writeToConsole("--------- Probability Tree dump start ---------");
                this.showTree(0, 0, top);
                this.writeToConsole("---------- Probability Tree dump end ----------");
            }
        }

        const end = performance.now();;
        this.writeToConsole("Total nodes in cache = " + BruteForceGlobal.cache.size + ", total cache hits = " + BruteForceGlobal.cacheHit + ", total processing saved = " + BruteForceGlobal.cacheWork);
        this.writeToConsole("process took " + (end - start).toFixed(2) + " milliseconds and explored " + BruteForceGlobal.processCount + " nodes");
        this.writeToConsole("----- Brute Force Deep Analysis finished ----");

        // clear down the cache
        BruteForceGlobal.cache.clear();

    }

    // 6020245077845603
    checkForBetterMove(guess) {

        // if we haven't processed 2 tiles or this tile is the best then stick with it
        if (this.processedMoves.length < 2 || (guess.x == this.bestTile.x && guess.y == this.bestTile.y)) {
            return null;
        }

        for (let tile of this.processedMoves) {
            if (guess.x == tile.x && guess.y == tile.y) {  // if we have processed the guess and it isn't the best tile then return the best tile
                return this.bestTile;
            }
        }

        //  otherwise nothing better
        return null;

    }

	/**
	 * Builds a top of tree node based on the solutions provided
	 */
	buildTopNode(solutionTable) {

        const result = new Node();   

        result.startLocation = 0;
        result.endLocation = solutionTable.size();

        const living = [];  // living is an array of 'LivingLocation'

        for (let i = 0; i < BruteForceGlobal.allTiles.length; i++) {
            let value;

            const valueCount = new Array(9).fill(0);
            let mines = 0;
            let maxSolutions = 0;
            let count = 0;
            let minValue = 0;
            let maxValue = 0;

            for (let j = 0; j < result.getSolutionSize(); j++) {
                if (solutionTable.get(j)[i] != BOMB) {
                    value = solutionTable.get(j)[i];
                    valueCount[value]++;
                } else {
                    mines++;
                }
            }

            for (let j = 0; j < valueCount.length; j++) {
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
                const alive = new LivingLocation(i);   // alive is class 'LivingLocation'
                alive.mineCount = mines;
                alive.count = count;
                alive.minValue = minValue;
                alive.maxValue = maxValue;
                alive.maxSolutions = maxSolutions;
                alive.zeroSolutions = valueCount[0];
                living.push(alive);
            } else {
                this.writeToConsole(BruteForceGlobal.allTiles[i].asText() + " is dead with value " + minValue);
                this.deadTiles.push(BruteForceGlobal.allTiles[i]);   // store the dead tiles
            }

        }

        living.sort((a, b) => a.compareTo(b));

        result.livingLocations = living;

        return result;
    }   


 
    getNextMove() {

        const bestLiving = this.getBestLocation(this.currentNode);  /// best living is 'LivingLocation'

        if (bestLiving == null) {
            return null;
        }

        const loc = BruteForceGlobal.allTiles[bestLiving.index];  // loc is class 'Tile'

        //solver.display("first best move is " + loc.display());
        const prob = 1 - (bestLiving.mineCount / this.currentNode.getSolutionSize());

        this.writeToConsole("mines = " + bestLiving.mineCount + " solutions = " + this.currentNode.getSolutionSize());
        for (let i = 0; i < bestLiving.children.length; i++) {
            if (bestLiving.children[i] == null) {
                //solver.display("Value of " + i + " is not possible");
                continue; //ignore this node but continue the loop
            }

            let probText;
            if (bestLiving.children[i].bestLiving == null) {
                probText = 1 / bestLiving.children[i].getSolutionSize();
            } else {
                probText = bestLiving.children[i].getProbability();
            }
            this.writeToConsole("Value of " + i + " leaves " + bestLiving.children[i].getSolutionSize() + " solutions and winning probability " + probText + " (work size " + bestLiving.children[i].work + ")");
        }

        const action = new Action(loc.getX(), loc.getY(), prob, ACTION_CLEAR);

        this.expectedMove = loc;

        return action;

    }
	
	getBestLocation(node) {
        return node.bestLiving;
    }
	
	
	showTree(depth, value, node) {

        let condition;
        if (depth == 0) {
            condition = node.getSolutionSize() + " solutions remain";
        } else {
            condition = "When '" + value + "' ==> " + node.getSolutionSize() + " solutions remain";
        }

        if (node.bestLiving == null) {
            const line = BruteForceGlobal.INDENT.substring(0, depth * 3) + condition + " Solve chance " + node.getProbability();

            this.writeToConsole(line);
            return;
        }

        const loc = BruteForceGlobal.allTiles[node.bestLiving.index];

        const prob = 1 - (node.bestLiving.mineCount / node.getSolutionSize());


        const line = BruteForceGlobal.INDENT.substring(0, depth * 3) + condition + " play " + loc.asText() + " Survival chance " + prob + ", Solve chance " + node.getProbability();
        this.writeToConsole(line);

        for (let val = 0; val < node.bestLiving.children.length; val++) {
            const nextNode = node.bestLiving.children[val];
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

    allTilesDead() {
        return this.allDead;
    }

    writeToConsole(text) {
        if (this.verbose) {
            console.log(text);
        }
    }

}


/**
 * A key to uniquely identify a position
 */
class Position {

    constructor(p, index, value) {

        this.position;
        this.hash = 0;
        this.mod = BigInt(Number.MAX_SAFE_INTEGER);


        if (p == null) {
            this.position = new Array(BruteForceGlobal.allTiles.length).fill(15);
        } else {
            // copy and update to reflect the new position
            this.position = p.position.slice(); 
            //this.position.push(...p.position); 
            this.position[index] = value + 50;
        }

    }

 
    // copied from String hash
    hashCode() {
        let h = BigInt(this.hash);
        if (h == 0 && this.position.length > 0) {
            for (let i = 0; i < this.position.length; i++) {
                h = (BigInt(31) * h + BigInt(this.position[i])) % this.mod;
            }
            this.hash = Number(h);  // convert back to a number
        }
        return this.hash;
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
        BruteForceGlobal.allSolutions.sortSolutions(parent.startLocation, parent.endLocation, this.index);
        let index = parent.startLocation;

        const work = Array(9);  // work is an array of class 'Node' with size 9

        for (let i = this.minValue; i < this.maxValue + 1; i++) {

             // if the node is in the cache then use it
            const pos = new Position(parent.position, this.index, i);

            const temp1 = BruteForceGlobal.cache.get(pos.hashCode());  // temp1 is class 'Node'

            if (temp1 == null) {

                const temp = new Node(pos);

                temp.startLocation = index;
                // find all solutions for this values at this location
                while (index < parent.endLocation && BruteForceGlobal.allSolutions.get(index)[this.index] == i) {
                    index++;
                }
                temp.endLocation = index;

                work[i] = temp;

            } else {
                work[i] = temp1;
                BruteForceGlobal.cacheHit++;
                BruteForceGlobal.cacheWinningLines = BruteForceGlobal.cacheWinningLines + temp1.winningLines;
                BruteForceGlobal.cacheWork = BruteForceGlobal.cacheWork + temp1.work;
                // skip past these details in the array
                while (index < parent.endLocation && BruteForceGlobal.allSolutions.get(index)[this.index] <= i) {
                    index++;
                }
            }
        }

        // skip over the mines
        while (index < parent.endLocation && BruteForceGlobal.allSolutions.get(index)[this.index] == BOMB) {
            index++;
        }

        if (index != parent.endLocation) {
            console.log("**** Didn't read all the elements in the array; index = " + index + " end = " + parent.endLocation + " ****");
        }


        for (let i = this.minValue; i <= this.maxValue; i++) {
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
        let test = this.mineCount - o.mineCount;
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

    constructor (position) {

        this.position;   // representation of the position we are analysing / have reached

        if (position == null) {
            this.position = new Position();
        } else {
            this.position = position;
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
        if (BruteForceGlobal.PRUNE_BF_ANALYSIS && (this.getSolutionSize() - move.mineCount <= this.winningLines)) {
            move.pruned = true;
            return this.getSolutionSize() - move.mineCount;
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

        let result = 0;

        BruteForceGlobal.processCount++;
        if (BruteForceGlobal.processCount > BruteForceGlobal.BRUTE_FORCE_ANALYSIS_MAX_NODES) {
            move.pruned = true;
            return 0;
        }

        let notMines = this.getSolutionSize() - move.mineCount;   // number of solutions (at this node) which don't have a mine at this location 

        // if the max possible winning lines is less than the current cutoff then no point doing the analysis
        if (BruteForceGlobal.PRUNE_BF_ANALYSIS && (result + notMines <= cutoff)) {
            move.pruned = true;
            return result + notMines;
        }

        move.buildChildNodes(this);

        for (let i = 0; i < move.children.length; i++) {

            const child = move.children[i];  // child is class 'Node'

            if (child == null) {
                continue;  // continue the loop but ignore this entry
            }

            if (child.fromCache) {  // nothing more to do, since we did it before
                this.work++;
            } else {

                child.determineLivingLocations(this.livingLocations, move.index);
                this.work++;

                if (child.getLivingLocations().length == 0) {  // no further information ==> all solution indistinguishable ==> 1 winning line

                    child.winningLines = 1;

                } else {  // not cached and not terminal node, so we need to do the recursion

                    for (let j = 0; j < child.getLivingLocations().length; j++) {

                        const childMove = child.getLivingLocations()[j];  // childmove is class 'LivingLocation'

                        // if the number of safe solutions <= the best winning lines then we can't do any better, so skip the rest
                        if (child.getSolutionSize() - childMove.mineCount <= child.winningLines) {
                            break;
                        }

                        // now calculate the winning lines for each of these children
                        const winningLines = child.getWinningLines(depth + 1, childMove, child.winningLines);
                        if (!childMove.pruned) {
                            if (child.winningLines < winningLines || (child.bestLiving != null && child.winningLines == winningLines && child.bestLiving.mineCount < childMove.mineCount)) {
                                child.winningLines = winningLines;
                                child.bestLiving = childMove;
                            }
                        }

                        // if there are no mines then this is a 100% safe move, so skip any further analysis since it can't be any better
                        if (childMove.mineCount == 0) {
                            break;
                        }
                    }

                    // no need to hold onto the living location once we have determined the best of them
                    child.livingLocations = null;

                    //add the child to the cache if it didn't come from there and takes took an amount of work to create
                    if (child.work > 10) {
                        //console.log("Entry placed in cache with key " + child.position.hashCode());
                        //child.work = 0;
                        child.fromCache = true;
                        BruteForceGlobal.cache.set(child.position.hashCode(), child);
                    } else {
                        this.work = this.work + child.work;
                    }

                }

            }

            if (depth > BruteForceGlobal.BRUTE_FORCE_ANALYSIS_TREE_DEPTH) {  // stop holding the tree beyond this depth
                child.bestLiving = null;
            }

            // store the aggregate winning lines 
            result = result + child.winningLines;

            notMines = notMines - child.getSolutionSize();  // reduce the number of not mines

            // if the max possible winning lines is less than the current cutoff then no point doing the analysis
            if (BruteForceGlobal.PRUNE_BF_ANALYSIS && (result + notMines <= cutoff)) {
                move.pruned = true;
                return result + notMines;
            }

        }

        return result;

    }

    /**
     * this generates a list of Location that are still alive, (i.e. have more than one possible value) from a list of previously living locations
     * Index is the move which has just been played (in terms of the off-set to the position[] array)
     */
    determineLivingLocations(liveLocs, index) {  // liveLocs is a array of class 'LivingLocation' 

        const living = [];

        for (let i = 0; i < liveLocs.length; i++) {

            const live = liveLocs[i];

            if (live.index == index) {  // if this is the same move we just played then no need to analyse it - definitely now non-living.
                continue;
            }

            let value;

            const valueCount = Array(9).fill(0);
            let mines = 0;
            let maxSolutions = 0;
            let count = 0;
            let minValue = 0;
            let maxValue = 0;

            for (let j = this.startLocation; j < this.endLocation; j++) {
                value = BruteForceGlobal.allSolutions.get(j)[live.index];
                if (value != BOMB) {
                     valueCount[value]++;
                } else {
                    mines++;
                }
            }

            // find the new minimum value and maximum value for this location (can't be wider than the previous min and max)
            for (let j = live.minValue; j <= live.maxValue; j++) {
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
                const alive = new LivingLocation(live.index);  // alive is class 'LivingLocation'
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

        const section = this.solutions.slice(start, end);
        section.sort((a, b) => a[index] - b[index]);
        this.solutions.splice(start, section.length, ...section);


        //subSort(this.solutions, start, end - start + 1, (a, b) => b[index] - a[index]);

        //this.solutions.sort(solutions, start, end, sorters[index]);

    }

}

// utility to sort an array 
let subSort = (arr, i, n, sortFx) => [].concat(...arr.slice(0, i), ...arr.slice(i, i + n).sort(sortFx), ...arr.slice(i + n, arr.length));
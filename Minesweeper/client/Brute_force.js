"use strict";

/**
 *  Performs a brute force search on the provided squares using the iterator 
 * 
 */
class Cruncher {

    constructor(board, iterator) {

        this.board = board;
        this.iterator = iterator;   // the iterator
        this.tiles = iterator.tiles;  // the tiles the iterator is iterating over
        this.witnesses = iterator.probabilityEngine.dependentWitnesses;  // the dependent witnesses (class BoxWitness) which need to be checked to see if they are satisfied

        this.allSolutions = [];  // this is where the solutions needed by the Brute Force Analysis class are held

        // determine how many flags are currently next to each tile
        this.currentFlagsTiles = [];
        for (let i = 0; i < this.tiles.length; i++) {
            this.currentFlagsTiles.push(board.adjacentFoundMineCount(this.tiles[i]));
        }

        // determine how many flags are currently next to each witness
        this.currentFlagsWitnesses = [];
        for (let i = 0; i < this.witnesses.length; i++) {
            this.currentFlagsWitnesses.push(board.adjacentFoundMineCount(this.witnesses[i].tile));
        }

        this.duration = 0;

    }


    
    crunch() {

        const peStart = Date.now();

        let sample = this.iterator.getSample();  // first sample

        let candidates = 0;  // number of samples which satisfy the current board state

        while (sample != null) {

            if (this.checkSample(sample)) {
                candidates++;
            }

            sample = this.iterator.getSample();

        }

        this.duration = Date.now() - peStart;

        console.log(this.iterator.iterationsDone + " cycles took " + this.duration + " milliseconds");

        return candidates;

    }

    // this checks whether the positions of the mines are a valid candidate solution
    checkSample(sample) {

        // get the tiles which are mines in this sample
        const mine = [];
        for (let i = 0; i < sample.length; i++) {
            mine.push(this.tiles[sample[i]]);
        }

        for (let i = 0; i < this.witnesses.length; i++) {

            const flags1 = this.currentFlagsWitnesses[i];
            let flags2 = 0;

            // count how many candidate mines are next to this witness
            for (let j = 0; j < mine.length; j++) {
                if (mine[j].isAdjacent(this.witnesses[i].tile)) {
                    flags2++;
                }
            }

            const value = this.witnesses[i].tile.getValue();  // number of flags indicated on the tile

            if (value != flags1 + flags2) {
                return false;
            }
        }

        //if it is a good solution then calculate the distribution if required

        const solution = new Array(this.tiles.length);

        for (let i = 0; i < this.tiles.length; i++) {

            let isMine = false;
            for (let j = 0; j < sample.length; j++) {
                if (i == sample[j]) {
                    isMine = true;
                    break;
                }
            }

            // if we are a mine then it doesn't matter how many mines surround us
            if (!isMine) {
                var flags2 = this.currentFlagsTiles[i];
                // count how many candidate mines are next to this square
                for (let j = 0; j < mine.length; j++) {
                    if (mine[j].isAdjacent(this.tiles[i])) {
                        flags2++;
                    }
                }
                solution[i] = flags2;
            } else {
                solution[i] = BOMB;
            }

        }
 
        this.allSolutions.push(solution);

        /*
        var output = "";
        for (var i = 0; i < mine.length; i++) {
            output = output + mine[i].asText();
        }
        console.log(output);
        */

        return true;

    }
    
}



class WitnessWebIterator {

    // create an iterator which is like a set of rotating wheels
    // if rotation is -1 then this does all the possible iterations
    // if rotation is not - 1 then this locks the first 'cog' in that position and iterates the remaining cogs.  This allows parallel processing based on the position of the first 'cog'
    constructor(pe, allCoveredTiles, rotation) {

        //console.log("Creating Iterator");

        this.sample = [];  // int array

        this.tiles = [];  // list of tiles being iterated over

        this.cogs = []; // array of cogs
        this.squareOffset = [];  // int array
        this.mineOffset = [];   // int array

        this.iterationsDone = 0;

        this.top;
        this.bottom;

        this.done = false;

        this.probabilityEngine = pe;

        this.cycles = BigInt(1);

        // if we are setting the position of the top cog then it can't ever change
        if (rotation == -1) {
            this.bottom = 0;
        } else {
            this.bottom = 1;
        }

        //cogs = new SequentialIterator[this.probabilityEngine..size() + 1];
        //squareOffset = new int[web.getIndependentWitnesses().size() + 1];
        //mineOffset = new int[web.getIndependentWitnesses().size() + 1];
 
        const loc = [];  // array of locations

        var indWitnesses = this.probabilityEngine.independentWitnesses;

        var cogi = 0;
        let indSquares = 0;
        let indMines = 0;

        // create an array of locations in the order of independent witnesses
        for (let i = 0; i < indWitnesses.length; i++) {

            const w = indWitnesses[i];

            this.squareOffset.push(indSquares);
            this.mineOffset.push(indMines);
            this.cogs.push(new SequentialIterator(w.minesToFind, w.tiles.length));
 
            indSquares = indSquares + w.tiles.length;
            indMines = indMines + w.minesToFind;

            loc.push(...w.tiles);

            // multiply up the number of iterations needed
            this.cycles = this.cycles * combination(w.minesToFind, w.tiles.length);

        }

        //System.out.println("Mines left = " + (mines - indMines));
        //System.out.println("Squrs left = " + (web.getSquares().length - indSquares));

        // the last cog has the remaining squares and mines

        //add the rest of the locations
        for (let i = 0; i < allCoveredTiles.length; i++) {

            const l = allCoveredTiles[i];

            var skip = false;
            for (let j = 0; j < loc.length; j++) {

                const m = loc[j];

                if (l.isEqual(m)) {
                    skip = true;
                    break;
                }
            }
            if (!skip) {
                loc.push(l);
            }
        }

        this.tiles = loc;

        //console.log("Mines left " + this.probabilityEngine.minesLeft);
        //console.log("Independent Mines " + indMines);
        //console.log("Tiles left " + this.probabilityEngine.tilesLeft);
        //console.log("Independent tiles " + indSquares);


        // if there are more mines left then squares then no solution is possible
        // if there are not enough mines to satisfy the minimum we know are needed
        if (this.probabilityEngine.minesLeft - indMines > this.probabilityEngine.tilesLeft - indSquares
            || indMines > this.probabilityEngine.minesLeft) {
            this.done = true;
            this.top = 0;
            //console.log("Nothing to do in this iterator");
            return;
        }

        // if there are no mines left then no need for a cog
        if (this.probabilityEngine.minesLeft > indMines) {
            this.squareOffset.push(indSquares);
            this.mineOffset.push(indMines);
            this.cogs.push(new SequentialIterator(this.probabilityEngine.minesLeft - indMines, this.probabilityEngine.tilesLeft - indSquares));

            this.cycles = this.cycles * combination(this.probabilityEngine.minesLeft - indMines, this.probabilityEngine.tilesLeft - indSquares);
        }

        this.top = this.cogs.length - 1;

        this.sample = new Array(this.probabilityEngine.minesLeft);  // make the sample array the size of the number of mines

        // if we are locking and rotating the top cog then do it
        //if (rotation != -1) {
        //    for (var i = 0; i < rotation; i++) {
        //        this.cogs[0].getSample(0);
        //    }
        //}

        // now set up the initial sample position
        for (let i = 0; i < this.top; i++) {
            const s = this.cogs[i].getNextSample();
            for (let j = 0; j < s.length; j++) {
                this.sample[this.mineOffset[i] + j] = this.squareOffset[i] + s[j];
            }
        }

        //console.log("Iterations needed " + this.cycles);
 
    }


    getSample() {


        if (this.done) {
            console.log("**** attempting to iterator when already completed ****");
            return null;
        }
        let index = this.top;

        let s = this.cogs[index].getNextSample();

        while (s == null && index != this.bottom) {
            index--;
            s = this.cogs[index].getNextSample();
        }

        if (index == this.bottom && s == null) {
            this.done = true;
            return null;
        }

        for (let j = 0; j < s.length; j++) {
            this.sample[this.mineOffset[index] + j] = this.squareOffset[index] + s[j];
        }
        index++;
        while (index <= this.top) {
            this.cogs[index] = new SequentialIterator(this.cogs[index].numberBalls, this.cogs[index].numberHoles);
            s = this.cogs[index].getNextSample();
            for (let j = 0; j < s.length; j++) {
                this.sample[this.mineOffset[index] + j] = this.squareOffset[index] + s[j];
            }
            index++;
        }

         //console.log(...this.sample);

        this.iterationsDone++;

        return this.sample;
 
    }

    getTiles() {
        return this.allCoveredTiles;
    }

    getIterations() {
        return this.iterationsDone;
    }

    // if the location is a Independent witness then we know it will always
    // have exactly the correct amount of mines around it since that is what
    // this iterator does
    witnessAlwaysSatisfied(location) {

        for (let i = 0; i < this.probabilityEngine.independentWitness.length; i++) {
            if (this.probabilityEngine.independentWitness[i].equals(location)) {
                return true;
            }
        }

        return false;

    }

}


class SequentialIterator {


    // a sequential iterator that puts n-balls in m-holes once in each possible way
    constructor (n, m) {

        this.numberHoles = m;
        this.numberBalls = n;

        this.sample = [];  // integer

        this.more = true;

        this.index = n - 1;

        for (let i = 0; i < n; i++) {
            this.sample.push(i);
        }

        // reduce the iterator by 1, since the first getSample() will increase it
        // by 1 again
        this.sample[this.index]--;

        //console.log("Sequential Iterator has " + this.numberBalls + " mines and " + this.numberHoles + " squares");

    }

    getNextSample() {

        if (!this.more) {
            console.log("****  Trying to iterate after the end ****");
            return null;
        }

        this.index = this.numberBalls - 1;

        // add on one to the iterator
        this.sample[this.index]++;

        // if we have rolled off the end then move backwards until we can fit
        // the next iteration
        while (this.sample[this.index] >= this.numberHoles - this.numberBalls + 1 + this.index) {
            if (this.index == 0) {
                this.more = false;
                return null;
            } else {
                this.index--;
                this.sample[this.index]++;
            }
        }

        // roll forward 
        while (this.index != this.numberBalls - 1) {
            this.index++;
            this.sample[this.index] = this.sample[this.index - 1] + 1;
        }

        return this.sample;

    }

}
"use strict";

class EfficiencyHelper {

    static ALLOW_ZERO_NET_GAIN_CHORD = true;
    static ALLOW_ZERO_NET_GAIN_PRE_CHORD = true;

    static IGNORE_ZERO_THRESHOLD = 0.375;   // ignore a zero when the chance it happens is less than this
 
    constructor(board, witnesses, witnessed, actions, playStyle, pe, coveredTiles) {

        this.board = board;
        this.actions = actions;
        this.witnesses = witnesses;
        this.witnessed = witnessed;
        this.playStyle = playStyle;
        this.pe = pe;
        this.coveredTiles = coveredTiles;

    }

    process() {

        // try the No flag efficiency strategy
        if (this.playStyle == PLAY_STYLE_NOFLAGS_EFFICIENCY) {
            return this.processNF(false);
        }

        if (this.playStyle != PLAY_STYLE_EFFICIENCY || this.actions.length == 0) {
            return this.actions;
        }

        let firstClear;
        let result = [];
        const chordLocations = [];

        //
        // identify all the tiles which are next to a known mine
        //

        // clear the adjacent mine indicator
        for (let tile of this.board.tiles) {
            tile.adjacentMine = false;
        }

        // set the adjacent mine indicator
        for (let tile of this.board.tiles) {
            if (tile.isSolverFoundBomb() || tile.probability == 0) {
                for (let adjTile of this.board.getAdjacent(tile)) {
                    if (!adjTile.isSolverFoundBomb() && adjTile.isCovered()) {
                        adjTile.adjacentMine = true;
                    }
                }
            }
        }

        //
        // Look for tiles which are satisfied by known mines and work out the net benefit of placing the mines and then chording
        //
        for (let tile of this.witnesses) {   // for each witness

            if (tile.getValue() == this.board.adjacentFoundMineCount(tile)) {

                // how many hidden tiles are next to the mine(s) we would have flagged, the more the better
                // this favours flags with many neighbours over flags buried against cleared tiles.
                const hiddenMineNeighbours = new Set();  
                for (let adjMine of this.board.getAdjacent(tile)) {

                    if (!adjMine.isSolverFoundBomb()) {
                        continue;
                    }
                    for (let adjTile of this.board.getAdjacent(adjMine)) {
                        if (!adjTile.isSolverFoundBomb() && adjTile.isCovered()) {
                            hiddenMineNeighbours.add(adjTile.index);
                        }
                    }                       
                }

                var benefit = this.board.adjacentCoveredCount(tile);
                var cost = tile.getValue() - this.board.adjacentFlagsPlaced(tile);
                if (tile.getValue() != 0) {  // if the witness isn't a zero then add the cost of chording - zero can only really happen in the analyser
                    cost++;
                }

                // either we have a net gain, or we introduce more flags at zero cost. more flags means more chance to get a cheaper chord later
                if (benefit >= cost) {
                    console.log("Chord " + tile.asText() + " has reward " + (benefit - cost) + " and tiles adjacent to new flags " + hiddenMineNeighbours.size);
                    chordLocations.push(new ChordLocation(tile, benefit, cost, hiddenMineNeighbours.size));
                }

            }
        }

        // sort the chord locations so the best one is at the top
        chordLocations.sort(function (a, b) {
            if (a.netBenefit == b.netBenefit) {  // if the benefits are the same return the one which exposes most tiles to flags
                return b.exposedTiles - a.exposedTiles;
            } else {
                return b.netBenefit - a.netBenefit;
            }
        });

        let bestChord = null;
        let bestChordReward = 0;
        for (let cl of chordLocations) {

            if (cl.netBenefit > 0 || EfficiencyHelper.ALLOW_ZERO_NET_GAIN_CHORD && cl.netBenefit == 0 && cl.cost > 0) {
                bestChord = cl;
                bestChordReward = cl.netBenefit;
            }

            break;
        }

        if (bestChord != null) {
            console.log("Chord " + bestChord.tile.asText() + " has best reward of " + bestChord.netBenefit);
        } else {
            console.log("No chord with net benefit > 0");
        }


        // 2. look for safe tiles which could become efficient if they have a certain value
        //if (result.length == 0) {

            //if (this.actions.length < 2) {
            //    return this.actions;
            //}

            let neutral3BV = [];
            let bestAction = null;
            let highest = BigInt(0);

            let bestLowZero = null;
            let bestLowZeroProb = 0; 

            const currSolnCount = solver.countSolutions(this.board);
            if (bestChordReward != 0) {
                highest = currSolnCount.finalSolutionsCount * BigInt(bestChordReward);
            } else {
                highest = BigInt(0);
            }

            for (let act of this.actions) {
            //for (let act of this.coveredTiles) {  // swap this for risky efficiency
            
                if (act.action == ACTION_CLEAR) {
                //if (!act.isSolverFoundBomb()) {   // swap this for risky efficiency

                    // this is the default move;
                    if (firstClear == null) {
                        firstClear = act;
                    }

                    // check to see if the tile (trivially) can't be next to a zero. i.e. 3BV safe
                    let valid = true;
                    for (let adjTile of this.board.getAdjacent(act)) {
                        if (adjTile.isCovered() && !adjTile.isSolverFoundBomb()) {
                            valid = valid && adjTile.adjacentMine;
                        }
                    }

                    if (valid) {
                        console.log("Tile " + act.asText() + " is 3BV safe because it can't be next to a zero");
                        neutral3BV.push(act);
                    }

                    const tile = this.board.getTileXY(act.x, act.y);

                    // find the best chord adjacent to this clear if there is one
                    let adjChord = null;
                    let adjChords = [];
                    for (let cl of chordLocations) {
                        if (cl.netBenefit == 0 && !EfficiencyHelper.ALLOW_ZERO_NET_GAIN_PRE_CHORD) {
                            continue;
                        }

                        if (cl.tile.isAdjacent(tile)) {
                            adjChords.push(cl);
                        }
                    }

                    const adjMines = this.board.adjacentFoundMineCount(tile);
                    const adjFlags = this.board.adjacentFlagsPlaced(tile);
                    const hidden = this.board.adjacentCoveredCount(tile);   // hidden excludes unflagged but found mines

                    let chord;
                    if (adjMines != 0) {  // if the value we want isn't zero subtract the cost of chording
                        chord = 1;
                    } else {
                        chord = 0;
                    }

                     const reward = hidden - adjMines + adjFlags - chord;

                    //console.log("considering " + act.x + "," + act.y + " with value " + adjMines + " and reward " + reward + " ( H=" + hidden + " M=" + adjMines + " F=" + adjFlags + " Chord=" + chord + ")");

                    // if the reward could be better than the best chord or the click is a possible zero then consider it
                    if (reward > bestChordReward || adjMines == 0) {

                        tile.setValue(adjMines);
                        const counter = solver.countSolutions(this.board);
                        tile.setCovered(true);

                        const prob = divideBigInt(counter.finalSolutionsCount, currSolnCount.finalSolutionsCount, 6);
                        const expected = prob * reward;

                        // set this information on the tile, so we can display it in the tooltip
                        tile.setValueProbability(adjMines, prob);

                        console.log("considering Clear (" + act.x + "," + act.y + ") with value " + adjMines + " and reward " + reward + " ( H=" + hidden + " M=" + adjMines + " F=" + adjFlags + " Chord=" + chord
                            + " Prob=" + prob + "), expected benefit " + expected);

                        // if we have found an 100% safe zero then just click it.
                        if (adjMines == 0 && prob == 1) {
                            console.log("(" + act.x + "," + act.y + ") is a certain zero no need for further analysis");
                            bestAction = act;
                            bestChord = null;
                            break;
                        } else if (adjMines == 0 && prob < EfficiencyHelper.IGNORE_ZERO_THRESHOLD) {
                            console.log("(" + act.x + "," + act.y + ") is a zero with low probability of " + prob + " and is being ignored");
                            if (prob > 0 && (bestLowZero == null || bestLowZeroProb < prob)) {
                                bestLowZero = act;
                                bestLowZeroProb = prob;
                                console.log("(" + bestLowZero.x + "," + bestLowZero.y + ") is a zero with low probability of " + bestLowZeroProb + " is the best low probability so far");
                            }
                            continue;
                        }

                        const clickChordNetBenefit = BigInt(reward) * counter.finalSolutionsCount; // expected benefit from clicking the tile then chording it

                        let current = clickChordNetBenefit;  // expected benefit == p*benefit
                        //if (adjMines == 0 && adjChord != null) {
                        //   console.log("Not considering Chord Chord combo because we'd be chording into a zero");
                        //    adjChord = null;
                        //}

                        // consider each adjacent chord
                        for (let cl of adjChords) {
                            console.log("(" + act.x + "," + act.y + ") has adjacent chord " + cl.tile.asText() + " with net benefit " + cl.netBenefit);
                            //const tempCurrent = this.chordChordCombo(cl, tile, counter.finalSolutionsCount, currSolnCount.finalSolutionsCount);

                            const tempCurrent = this.chordChordCombo1(cl, tile, counter.finalSolutionsCount, currSolnCount.finalSolutionsCount, adjMines, prob);

                            // if the chord/chord is better, or the chord/chord is the same as a click/chord (prioritise the chord/chord)
                            if (tempCurrent > current || tempCurrent == current && adjChord == null) {  // keep track of the best chord / chord combo
                                current = tempCurrent;
                                adjChord = cl;
                            }
                        }


                        // calculate the safety tally for this click
                        // probability engine can be null if all the remaining tiles are safe
                        if (this.pe != null) {
                            const tileBox = this.pe.getBox(tile);
                            let safetyTally;
                            if (tileBox == null) {
                                safetyTally = this.pe.finalSolutionsCount - this.pe.offEdgeMineTally;
                            } else {
                                safetyTally = this.pe.finalSolutionsCount - tileBox.mineTally;
                            }

                            // scale the best reward to the safety of the click - this might be a bit simplistic!
                            current = current * safetyTally / this.pe.finalSolutionsCount;
                        }

                        if (current > highest) {
                            //console.log("best " + act.x + "," + act.y);
                            highest = current;
                            if (adjChord != null) {  // if there is an adjacent chord then use this to clear the tile
                                bestChord = adjChord;
                                bestAction = null;
                            } else {
                                bestChord = null;
                                bestAction = act;
                            }
  
                        }
                    } else {
                        console.log("not considering (" + act.x + "," + act.y + ") with value " + adjMines + " and reward " + reward + " ( H=" + hidden + " M=" + adjMines + " F=" + adjFlags + " Chord=" + chord + ")");
                    }
                }

            }

            if (bestAction != null) {
                result = [bestAction];
            }

            if (bestChord != null) {
                result = []
                // add the required flags
                for (let adjTile of this.board.getAdjacent(bestChord.tile)) {
                    if (adjTile.isSolverFoundBomb() && !adjTile.isFlagged()) {
                        result.push(new Action(adjTile.getX(), adjTile.getY(), 0, ACTION_FLAG));
                    }
                }

                // Add the chord action
                result.push(new Action(bestChord.tile.getX(), bestChord.tile.getY(), 0, ACTION_CHORD))
            }
 

        //}

        if (result.length > 0) {
            return result;   // most efficient move

        } else if (bestLowZero != null) {
            return [bestLowZero];  // a zero, but low chance

        } else if (neutral3BV.length > 0) {
            return [neutral3BV[0]];  // 3BV neutral move

        } else  if (firstClear != null) {
            return [firstClear];  // first clear when no efficient move

        } else {
            return [];  // nothing when no clears available
        }


    }

    // the ChordLocation of the tile to chord, the Tile to be chorded afterwards if the value comes up good, the number of solutions where this occurs
    // and the total number of solutions
    // this method works out the net benefit of this play
    chordChordCombo(chord1, chord2Tile, occurs, total) {

        const failedBenefit = chord1.netBenefit;
 
        const chord1Tile = chord1.tile;

        // now check each tile around the tile to be chorded 2nd and see how many mines to flag and extra tiles will be cleared
        //let alreadyCounted = 0;
        let needsFlag = 0;
        let clearable = 0;
        let chordClick = 0;
        for (let adjTile of this.board.getAdjacent(chord2Tile)) {

            if (adjTile.isSolverFoundBomb()) {
                chordClick = 1;
            }

            // if adjacent to chord1
            if (chord1Tile.isAdjacent(adjTile)) {
               // alreadyCounted++;
            } else if (adjTile.isSolverFoundBomb() && !adjTile.isFlagged()) {
                needsFlag++;
            } else if (!adjTile.isSolverFoundBomb() && adjTile.isCovered()) {
                clearable++;
            }
        }

        const secondBenefit = clearable - needsFlag - chordClick;  // tiles cleared - flags placed - the chord click (which isn't needed if a zero is expected)

        const score = BigInt(failedBenefit) * total + BigInt(secondBenefit) * occurs;

        const expected = failedBenefit + divideBigInt(occurs, total, 6) * secondBenefit;

        console.log("Chord " + chord1Tile.asText() + " followed by Chord " + chord2Tile.asText() + ": Chord 1: benefit " + chord1.netBenefit + ", Chord2: H=" + clearable + ", to F=" + needsFlag + ", Chord=" + chordClick
            + ", Benefit=" + secondBenefit + " ==> expected benefit " + expected);

        //var score = BigInt(failedBenefit) * total + BigInt(secondBenefit) * occurs;

        return score;

    }

    chordChordCombo1(chord1, chord2Tile, occurs, total, chord2AdjFlags, chord2Prob) {

        const failedBenefit = chord1.netBenefit;

        const chord1Tile = chord1.tile;

        // now check each tile around the tile to be chorded 2nd and see how many mines to flag and extra tiles will be cleared
        let adjChord1AndChord2 = 0;
        let needsFlag = 0;
        let adjChord2Only = 0;
        let chordClick = 0;
        for (let adjTile of this.board.getAdjacent(chord2Tile)) {

            if (adjTile.isSolverFoundBomb()) {
                chordClick = 1;
            }

            // if adjacent to chord1
            if (chord1Tile.isAdjacent(adjTile) && !adjTile.isSolverFoundBomb() && adjTile.isCovered()) {
                adjChord1AndChord2++;
            } else if (adjTile.isSolverFoundBomb() && !adjTile.isFlagged()) {
                if (!chord1Tile.isAdjacent(adjTile)) { // if adjacent to the first chord then a flag must already have been placed here
                    needsFlag++;
                }
            } else if (!adjTile.isSolverFoundBomb() && adjTile.isCovered()) {
                adjChord2Only++;
            }
        }

        const adjChord1Only = chord1.benefit - 1 - adjChord1AndChord2;  

        console.log("AdjChord1Only=" + adjChord1Only + ", AdjChord2Only=" + adjChord2Only + ", AdjChord1AndChord2=" + adjChord1AndChord2, "Chord2Value=" + chord2AdjFlags + ", prob=" + chord2Prob);
        
        // if the 2nd chord is a zero and the 1st chord has no tiles only adjacent to it then unless the zero probability < 0.5 chord/chord isn't better, unless it is a free chord
        if (chord2AdjFlags == 0 && adjChord1Only == 0 && chord2Prob > 0.5 && chord1.cost > 1) {
            console.log("Chord " + chord1Tile.asText() + " followed by Chord " + chord2Tile.asText() + ": Chord 2 is a zero with prob=" + chord2Prob + " and chord 1 has no tile only adjacent to it ==> chord/chord can't be a good option");
            return 0;
        }

        const secondBenefit = adjChord2Only - needsFlag - chordClick;  // tiles cleared - flags placed - the chord click (which isn't needed if a zero is expected)

        const score = BigInt(failedBenefit) * total + BigInt(secondBenefit) * occurs;

        const expected = failedBenefit + divideBigInt(occurs, total, 6) * secondBenefit;

        console.log("Chord " + chord1Tile.asText() + " followed by Chord " + chord2Tile.asText() + ": Chord 1: benefit " + chord1.netBenefit + ", Chord2: H=" + adjChord2Only + ", to F=" + needsFlag + ", Chord=" + chordClick
            + ", Benefit=" + secondBenefit + " ==> expected benefit " + expected);

        //var score = BigInt(failedBenefit) * total + BigInt(secondBenefit) * occurs;

        return score;

    }

    //
    // Below here is the logic for No-flag efficiency
    //
    processNF(SafeOnly) {

        const NFE_BLAST_PENALTY = 0.75;

        // the first clear in the actions list
        let firstClear = null;

        // clear the adjacent mine indicator
        for (let tile of this.board.tiles) {
            tile.adjacentMine = false;
        }

        const alreadyChecked = new Set(); // set of tiles we've already checked to see if they can be zero

        // set the adjacent mine indicator
        for (let tile of this.board.tiles) {
            if (tile.isSolverFoundBomb() || tile.probability == 0) {
                for (let adjTile of this.board.getAdjacent(tile)) {
                    if (!adjTile.isSolverFoundBomb() && adjTile.isCovered()) {
                        adjTile.adjacentMine = true;
                        adjTile.setValueProbability(0, 0);  // no chance of this tile being a zero

                        alreadyChecked.add(adjTile.index);

                    }
 
                }
            }
        }

        // find the current solution count
        const currSolnCount = solver.countSolutions(this.board);

        let result = [];
        let zeroTile;
        let zeroTileScore;



        const onEdgeSet = new Set();
        for (let tile of this.witnessed) {
            onEdgeSet.add(tile.index);
        }

        // these are tiles adjacent to safe witnesses which aren't themselves safe
        const adjacentWitnessed = new Set();

        // do a more costly check for whether zero is possible, for those which haven't already be determined
        for (let tile of this.witnessed) {

            if (!alreadyChecked.has(tile.index) && !tile.isSolverFoundBomb() && !tile.probability == 0) { // already evaluated or a mine
                tile.setValue(0);
                const counter = solver.countSolutions(this.board);
                tile.setCovered(true);

                const zeroProb = divideBigInt(counter.finalSolutionsCount, currSolnCount.finalSolutionsCount, 6);

                // set this information on the tile, so we can display it in the tooltip
                tile.setValueProbability(0, zeroProb);

                alreadyChecked.add(tile.index);

                if (counter.finalSolutionsCount == 0) {  // no solution where this tile is zero means there must always be an adjacent mine
                    tile.adjacentMine = true;
                } else if (counter.finalSolutionsCount == currSolnCount.finalSolutionsCount) {
                    console.log("Tile " + tile.asText() + " is a certain zero");
                    result.push(new Action(tile.getX(), tile.getY(), 1, ACTION_CLEAR));
                    break;
                } else {

                    const safety = this.pe.getProbability(tile);

                    const score = zeroProb - (1 - safety) * NFE_BLAST_PENALTY;

                    if (zeroTile == null || zeroTileScore < score) {
                        zeroTile = tile;
                        zeroTileScore = score;
                    }
 
                }
            }

            for (let adjTile of this.board.getAdjacent(tile)) {
                if (adjTile.isCovered() && !adjTile.isSolverFoundBomb() && adjTile.probability != 0 && !onEdgeSet.has(adjTile.index)) {
                    //console.log("Adding tile " + adjTile.asText() + " to extra tiles");
                    adjacentWitnessed.add(adjTile.index);
                } else {
                    //console.log("NOT Adding tile " + adjTile.asText() + " to extra tiles: On edge " + adjTile.onEdge);
                }
            }

        }

         // do a more costly check for whether zero is possible for actions not already considered, for those which haven't already be determined
        for (let act of this.actions) {

            const tile = this.board.getTileXY(act.x, act.y);

            if (act.action == ACTION_CLEAR && !alreadyChecked.has(tile.index) && !tile.isSolverFoundBomb() && !tile.probability == 0) { // already evaluated or a mine
                tile.setValue(0);
                const counter = solver.countSolutions(this.board);
                tile.setCovered(true);

                const zeroProb = divideBigInt(counter.finalSolutionsCount, currSolnCount.finalSolutionsCount, 6);

                // set this information on the tile, so we can display it in the tooltip
                tile.setValueProbability(0, zeroProb);

                alreadyChecked.add(tile.index);

                if (counter.finalSolutionsCount == 0) {  // no solution where this tile is zero means there must always be an adjacent mine
                    tile.adjacentMine = true;
                } else if (counter.finalSolutionsCount == currSolnCount.finalSolutionsCount) {
                    console.log("Tile " + tile.asText() + " is a certain zero");
                    result.push(act);
                    break;
                } else {

                    const safety = this.pe.getProbability(tile);

                    const score = zeroProb - (1 - safety) * NFE_BLAST_PENALTY;

                    if (zeroTile == null || zeroTileScore < score) {
                        zeroTile = tile;
                        zeroTileScore = score;
                    }
                }
            }

            for (let adjTile of this.board.getAdjacent(tile)) {
                if (adjTile.isCovered() && !adjTile.isSolverFoundBomb() && adjTile.probability != 0 && !onEdgeSet.has(adjTile.index)) {
                    //console.log("Adding tile " + adjTile.asText() + " to extra tiles");
                    adjacentWitnessed.add(adjTile.index);
                } else {
                    //console.log("NOT Adding tile " + adjTile.asText() + " to extra tiles: On edge " + adjTile.onEdge);
                }
            }

        }

        console.log("Extra tiles to check " + adjacentWitnessed.size);

        // we have found a certain zero
        if (result.length > 0) {
            return result;
        }

        let offEdgeSafety;
        if (this.pe == null) {
            offEdgeSafety = 1;
        } else {
            offEdgeSafety = this.pe.offEdgeProbability;
        }

        // see if adjacent tiles can be zero or not
        for (let index of adjacentWitnessed) {
            const tile = board.getTile(index);

            tile.setValue(0);
            const counter = solver.countSolutions(this.board);
            tile.setCovered(true);

            const prob = divideBigInt(counter.finalSolutionsCount, currSolnCount.finalSolutionsCount, 6);

            // set this information on the tile, so we can display it in the tooltip
            tile.setValueProbability(0, prob);

            if (counter.finalSolutionsCount == 0) {  // no solution where this tile is zero means there must always be an adjacent mine
                tile.adjacentMine = true;
            } else if (counter.finalSolutionsCount == currSolnCount.finalSolutionsCount) {
                console.log("Tile " + tile.asText() + " is a certain zero");
                result.push(new Action(tile.getX(), tile.getY(), 1, ACTION_CLEAR));
                break;
            } else {

                const score = prob - (1 - offEdgeSafety) * NFE_BLAST_PENALTY;

                if (zeroTile == null || zeroTileScore < score) {
                    zeroTile = tile;
                    zeroTileScore = score;
                }
            }

        }

        // we have found a certain zero
        if (result.length > 0) {
            return result;
        }


        let maxAllNotZeroProbability;
        let bestAllNotZeroAction;
        // see if any of the safe tiles are also surrounded by all non-zero tiles
        for (let act of this.actions) {

            if (act.action == ACTION_CLEAR) {

                // this is the default move;
                if (firstClear == null) {
                    firstClear = act;
                }

                let valid = true;
                let allNotZeroProbability = 1;
                for (let adjTile of this.board.getAdjacent(act)) {
                    if (adjTile.isCovered() && !adjTile.isSolverFoundBomb()) {
                        valid = valid && adjTile.adjacentMine;
                        allNotZeroProbability = allNotZeroProbability * (1 - adjTile.efficiencyProbability);
                    }
                }

                if (bestAllNotZeroAction == null || maxAllNotZeroProbability < allNotZeroProbability) {
                    bestAllNotZeroAction = act;
                    maxAllNotZeroProbability = allNotZeroProbability;
                }

                if (valid) {
                    console.log("Tile " + act.asText() + " is 3BV safe because it can't be next to a zero");
                    result.push(act);
                }
            }
 
        }

        if (result.length > 0 || SafeOnly) {
            return result;
        }


        if (bestAllNotZeroAction != null) {
            console.log("Tile " + bestAllNotZeroAction.asText() + " has no adjacent zero approx " + maxAllNotZeroProbability);
        }
        if (zeroTile != null) {
            console.log("Tile " + zeroTile.asText() + " has best zero chance score " + zeroTileScore);
        }

        if (zeroTile != null) {

            let prob;
            if (this.pe == null) {
                prob = 1;
            } else {
                prob = this.pe.getProbability(zeroTile);
            }

            if (bestAllNotZeroAction != null) {
                //const zeroTileProb = divideBigInt(zeroTileCount, currSolnCount.finalSolutionsCount, 6);
                if (maxAllNotZeroProbability > zeroTileScore && zeroTileScore < 0.0) {
                    result.push(bestAllNotZeroAction);
                } else {
                    result.push(new Action(zeroTile.getX(), zeroTile.getY(), prob, ACTION_CLEAR));
                }
            } else {
                result.push(new Action(zeroTile.getX(), zeroTile.getY(), prob, ACTION_CLEAR));
            }
        } else {
            if (bestAllNotZeroAction != null) {
                result.push(bestAllNotZeroAction);
            }
        }

        if (result.length > 0) {
            return result;
        }

        if (firstClear != null) {
            return [firstClear];  // first clear when no efficient move
        } else {
            return [];  // nothing when no clears available
        }


    }

}

// information about the boxes surrounding a dead candidate
class ChordLocation {

    constructor(tile, benefit, cost, exposedTiles) {

        this.tile = tile;
        this.benefit = benefit;
        this.cost = cost;
        this.netBenefit = benefit - cost;
        this.exposedTiles = exposedTiles;

    }

}
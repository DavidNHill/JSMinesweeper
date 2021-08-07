"use strict";

const ALLOW_ZERO_NET_GAIN_CHORD = true;
const ALLOW_ZERO_NET_GAIN_PRE_CHORD = true;

class EfficiencyHelper {

    constructor(board, witnesses, actions, playStyle) {

        this.board = board;
        this.actions = actions;
        this.witnesses = witnesses;
        this.playStyle = playStyle;

    }

    process() {

        if (this.playStyle != PLAY_STYLE_EFFICIENCY || this.actions.length == 0) {
            return this.actions;
        }

        var result = [];
        var chordLocations = [];

        // 1. look for tiles which are satisfied by known mines and work out the net benefit of placing the mines and then chording
        for (var tile of this.witnesses) {   // for each witness

            if (tile.getValue() == this.board.adjacentFoundMineCount(tile)) {

                // how many hidden tiles are next to the mine(s) we would have flagged, the more the better
                // this favours flags with many neighbours over flags buried against cleared tiles.
                var hiddenMineNeighbours = new Set();  
                for (var adjMine of board.getAdjacent(tile)) {

                    if (!adjMine.isSolverFoundBomb()) {
                        continue;
                    }
                    for (var adjTile of board.getAdjacent(adjMine)) {
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
            if (a.netBenefit == b.netBenefit) {  // if the benefits are the same return the one with the lowest cost (this means place less flags)
                //return a.cost - b.cost;
                return b.exposedTiles - a.exposedTiles;
            } else {
                return b.netBenefit - a.netBenefit;
            }
        });

        var bestChord = null;
        var witnessReward = 0;
        for (var cl of chordLocations) {

            //console.log("checking chord at " + cl.tile.asText());

            // add the required flags
            //for (var adjTile of board.getAdjacent(cl.tile)) {
            //    if (adjTile.isSolverFoundBomb() && !adjTile.isFlagged()) {
            //        result.push(new Action(adjTile.getX(), adjTile.getY(), 0, ACTION_FLAG));
            //    }
            //}

            // Add the chord action
            //result.push(new Action(cl.tile.getX(), cl.tile.getY(), 0, ACTION_CHORD))

            if (cl.netBenefit > 0 || ALLOW_ZERO_NET_GAIN_CHORD && cl.netBenefit == 0 && cl.cost > 0) {
                bestChord = cl;
                witnessReward = cl.netBenefit;
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

            var bestAction = null;
            var highest = BigInt(0);

            var currSolnCount = solver.countSolutions(board);
            if (witnessReward != 0) {
                var highest = currSolnCount.finalSolutionsCount * BigInt(witnessReward);
            } else {
                var highest = BigInt(0);
            }

            var foundCertainZero = false;
            for (var act of this.actions) {

                if (act.action == ACTION_CLEAR) {

                    var tile = board.getTileXY(act.x, act.y);

                    // find the best chord adjacent to this clear if there is one
                    //var adjBenefit = 0;
                    var adjChord = null;
                    for (var cl of chordLocations) {
                        if (cl.netBenefit == 0 && !ALLOW_ZERO_NET_GAIN_PRE_CHORD) {
                            continue;
                        }

                        if (cl.tile.isAdjacent(tile)) {
                            // first adjacent chord, or better adj chord or cheaper adj chord 
                            if (adjChord == null || adjChord.netBenefit < cl.netBenefit || adjChord.netBenefit == cl.netBenefit && adjChord.cost > cl.cost || 
                                adjChord.netBenefit == cl.netBenefit && adjChord.cost == cl.cost && adjChord.exposedTiles < cl.exposedTiles) {
                                //adjBenefit = cl.netBenefit;
                                adjChord = cl;
                            }
                        }
                    }
                    if (adjChord == null) {
                        //console.log("(" + act.x + "," + act.y + ") has no adjacent chord with net benefit > 0");
                    } else {
                        console.log("(" + act.x + "," + act.y + ") has adjacent chord " + adjChord.tile.asText() + " with net benefit " + adjChord.netBenefit);
                     }

                    var adjMines = this.board.adjacentFoundMineCount(tile);
                    var adjFlags = this.board.adjacentFlagsPlaced(tile);
                    var hidden = this.board.adjacentCoveredCount(tile);   // hidden excludes unflagged but found mines

                    if (adjMines != 0) {  // if the value we want isn't zero subtract the cost of chording
                        var chord = 1;
                    } else {
                        var chord = 0;
                    }

                    // reward = H - (M - F) = H - M + F
                    var reward = hidden - adjMines + adjFlags - chord;

                    //console.log("considering " + act.x + "," + act.y + " with value " + adjMines + " and reward " + reward + " ( H=" + hidden + " M=" + adjMines + " F=" + adjFlags + " Chord=" + chord + ")");

                    if (reward > witnessReward) {

                        tile.setValue(adjMines);
                        var counter = solver.countSolutions(board);
                        tile.setCovered(true);

                        var prob = divideBigInt(counter.finalSolutionsCount, currSolnCount.finalSolutionsCount, 4);
                        var expected = prob * reward;

                        // set this information on the tile, so we can display it in the tooltip
                        tile.setValueProbability(adjMines, prob);

                        console.log("considering Clear (" + act.x + "," + act.y + ") with value " + adjMines + " and reward " + reward + " ( H=" + hidden + " M=" + adjMines + " F=" + adjFlags + " Chord=" + chord
                            + " Prob=" + prob + "), expected benefit " + expected);

                        // if we have found an 100% safe zero then just click it.
                        if (adjMines == 0 && prob == 1) {
                            console.log("(" + act.x + "," + act.y + ") is a certain zero no need for further analysis");
                            bestAction = act;
                            break;
                            //adjChord = null;
                            //highest = 0;
                        }

                        var clickChordNetBenefit = BigInt(reward) * counter.finalSolutionsCount; // expected benefit from clicking the tile then chording it

                        // if it is a chord/chord combo
                        if (adjChord != null) {
                            var current = this.chordChordCombo(adjChord, tile, counter.finalSolutionsCount, currSolnCount.finalSolutionsCount);
                            if (current < clickChordNetBenefit) {  // if click chord is better than discard the adjacent chord
                                current = clickChordNetBenefit;
                                adjChord = null;
                            }

                        } else {  // or a clear/chord combo
                            var current = clickChordNetBenefit;  // expected benefit == p*benefit
                        }

                        if (current > highest) {
                            //console.log("best " + act.x + "," + act.y);
                            highest = current;
                            if (adjChord != null) {  // if there is an adjacent chord then use this to clear the tile
                                bestChord = adjChord
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
                for (var adjTile of board.getAdjacent(bestChord.tile)) {
                    if (adjTile.isSolverFoundBomb() && !adjTile.isFlagged()) {
                        result.push(new Action(adjTile.getX(), adjTile.getY(), 0, ACTION_FLAG));
                    }
                }

                // Add the chord action
                result.push(new Action(bestChord.tile.getX(), bestChord.tile.getY(), 0, ACTION_CHORD))
            }
 

        //}

        if (result.length > 0) {
            return result;
        } else {
            return [this.actions[0]];
        }


    }

    // the ChordLocation of the tile to chord, the Tile to be chorded afterwards if the value comes up good, the number of solutions where this occurs
    // and the total number of solutions
    // this method works out the net benefit of this play
    chordChordCombo(chord1, chord2Tile, occurs, total) {

        var failedBenefit = chord1.netBenefit;
 
        var chord1Tile = chord1.tile;

        // now check each tile around the tile to be chorded 2nd and see how many mines to flag and tiles will be cleared
        var alreadyCounted = 0;
        var needsFlag = 0;
        var clearable = 0;
        var chordClick = 0;
        for (var adjTile of board.getAdjacent(chord2Tile)) {

            if (adjTile.isSolverFoundBomb()) {
                chordClick = 1;
            }

            // if adjacent to chord1
            if (chord1Tile.isAdjacent(adjTile)) {
                alreadyCounted++;
            } else if (adjTile.isSolverFoundBomb() && !adjTile.isFlagged()) {
                needsFlag++;
            } else if (!adjTile.isSolverFoundBomb() && adjTile.isCovered()) {
                clearable++;
            }
        }

        var secondBenefit = clearable - needsFlag - chordClick;  // tiles cleared - flags placed - the chord click (which isn't needed if a zero is expected)

        var score = BigInt(failedBenefit) * total + BigInt(secondBenefit) * occurs;

        var expected = failedBenefit + divideBigInt(occurs, total, 6) * secondBenefit;

        console.log("Chord " + chord1Tile.asText() + " followed by Chord " + chord2Tile.asText() + ": Chord 1: benefit " + chord1.netBenefit + ", Chord2: H=" + clearable + ", to F=" + needsFlag + ", Chord=" + chordClick
            + ", Benefit=" + secondBenefit + " ==> expected benefit " + expected);

        var score = BigInt(failedBenefit) * total + BigInt(secondBenefit) * occurs;

        return score;

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
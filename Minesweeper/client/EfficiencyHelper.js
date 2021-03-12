"use strict";

const ALLOW_ZERO_NET_GAIN = false;

class EfficiencyHelper {

    constructor(board, witnesses, actions, playStyle) {

        this.board = board;
        this.actions = actions;
        this.witnesses = witnesses;
        this.playStyle = playStyle;

    }

    process() {

        if (this.playStyle != PLAY_STYLE_EFFICIENCY) {
            return this.actions;
        }

        var result = [];
        var chordLocations = [];

        // 1. look for tiles which are satisfied by known mines and work out the net benefit of placing the mines and then chording
        for (var tile of this.witnesses) {   // for each witness

            if (tile.getValue() == this.board.adjacentFoundMineCount(tile)) {
                var benefit = this.board.adjacentCoveredCount(tile);
                var cost = tile.getValue() - this.board.adjacentFlagsPlaced(tile);
                if (tile.getValue() != 0) {  // if the witness isn't a zero then add the cost of chording - zero can only really happen in the analyser
                    cost++;
                }

                // either we have a net gain, or we introduce more flags at zero cost. more flags means more chance to get a cheaper cord later
                if (benefit > cost || (ALLOW_ZERO_NET_GAIN && benefit == cost && cost > 1)) {
                    chordLocations.push(new ChordLocation(tile, benefit, cost));
                }

            }
        }

        // sort the chord locations so the best one is at the top
        chordLocations.sort(function (a, b) {
            if (a.netBenefit == b.netBenefit) {  // if the benefits are the same return the one with the lowest cost (this means place less flags)
                return a.cost - b.cost;
            } else {
                return b.netBenefit - a.netBenefit;
            }
        });

        var bestChord = null;
        var witnessReward = -1;
        for (var cl of chordLocations) {

            //console.log("checking chord at " + cl.tile.asText());

            for (var adjTile of board.getAdjacent(cl.tile)) {
                if (adjTile.isSolverFoundBomb() && !adjTile.isFlagged()) {
                    result.push(new Action(adjTile.getX(), adjTile.getY(), 0, ACTION_FLAG));
                }
            }

            // Add the chord action
            result.push(new Action(cl.tile.getX(), cl.tile.getY(), 0, ACTION_CHORD))

            bestChord = cl;
            witnessReward = cl.netBenefit;

            console.log(cl.tile.asText() + " has best reward from witness " + bestChord.netBenefit);

            break;
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
 
            for (var act of this.actions) {

                if (act.action == ACTION_CLEAR) {

                    var tile = board.getTileXY(act.x, act.y);

                    // is this action next to the best chord (if so it has a lost opportunity cost which affects the benefit)
                    if (bestChord != null && bestChord.tile.isAdjacent(tile)) {  
                        var adjacent = true;
                    } else {
                        var adjacent = false;
                    }

                    var adjMines = this.board.adjacentFoundMineCount(tile);
                    var adjFlags = this.board.adjacentFlagsPlaced(tile);
                    var hidden = this.board.adjacentCoveredCount(tile);   // hidden excludes unflagged but found mines

                    if (adjMines != 0) {  // if the value we want isn't zero subtract the cost of chording
                        var chord = 1;
                    } else {
                        if (adjacent) {  // skip zeros which are next to the best chord since we get these anyway
                            continue;
                        }
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
                        console.log("considering " + act.x + "," + act.y + " with value " + adjMines + " and reward " + reward + " ( H=" + hidden + " M=" + adjMines + " F=" + adjFlags + " Chord=" + chord + " Adj=" + adjacent + " Prob=" + prob + ")");

                        if (adjacent) {
                            var current = counter.finalSolutionsCount * BigInt(reward + 2) - BigInt(2) * currSolnCount.finalSolutionsCount;  // expected benefit == p*benefit - (1-p)*1 == p*(benefit + 1) - 1
                        } else {
                            var current = counter.finalSolutionsCount * BigInt(reward + 1) - currSolnCount.finalSolutionsCount;  // expected benefit == p*benefit
                        }
 
                        if (current > highest) {
                            //console.log("best " + act.x + "," + act.y);
                            highest = current;
                            bestAction = act;
                        }
                    } else {
                        console.log("not considering " + act.x + "," + act.y + " with value " + adjMines + " and reward " + reward + " ( H=" + hidden + " M=" + adjMines + " F=" + adjFlags + " Chord=" + chord + ")");
                    }
                }

            }

            if (bestAction != null) {
                result = [bestAction];
            }

        //}

        if (result.length > 0) {
            return result;
        } else {
            return [this.actions[0]];
        }


    }

}

// information about the boxes surrounding a dead candidate
class ChordLocation {

    constructor(tile, benefit, cost) {

        this.tile = tile;
        this.benefit = benefit;
        this.cost = cost;
        this.netBenefit = benefit - cost;

    }

}
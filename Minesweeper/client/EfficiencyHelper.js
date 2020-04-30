"use strict";

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

        for (var tile of this.witnesses) {   // for each witness

            if (tile.getValue() == this.board.adjacentFlagsCount(tile)) {
                var benefit = this.board.adjacentCoveredCount(tile);
                var cost = tile.getValue() - this.board.adjacentFlagsPlaced(tile);

                if (benefit - cost > 1) {
                    chordLocations.push(new ChordLocation(tile, benefit))
                }

            }
        }

        chordLocations.sort(function (a, b) { return b.benefit - a.benefit });

        for (var cl of chordLocations) {

            //console.log("checking chord at " + cl.tile.asText());

            for (var adjTile of board.getAdjacent(cl.tile)) {

                if (adjTile.isSolverFoundBomb() && !adjTile.isFlagged()) {
                    result.push(new Action(adjTile.getX(), adjTile.getY(), 0, ACTION_FLAG));
                }
            }

            // Add the chord action
            result.push(new Action(cl.tile.getX(), cl.tile.getY(), 0, ACTION_CHORD))

            break;
        }

        if (result.length == 0) {

            if (this.actions.length < 2) {
               return this.actions;
            }

            var bestAction = null;
            var highest = BigInt(0);
            //var currentReward = 0;

            for (var act of this.actions) {

                if (act.action == ACTION_CLEAR) {

                    var tile = board.getTileXY(act.x, act.y);

                    var adjMines = this.board.adjacentFlagsCount(tile);
                    var adjFlags = this.board.adjacentFlagsPlaced(tile);
                    var hidden = this.board.adjacentCoveredCount(tile);

                    var reward = hidden - adjMines + adjFlags;  // tiles adjacent - ones which are mines - mines which aren't flagged yet

                    //console.log("considering " + act.x + "," + act.y + " with value " + adjMines + " and reward " + reward);

                    tile.setValue(adjMines);
                    var counter = countSolutions(board);
                    tile.setCovered(true);

                    var current = counter.finalSolutionsCount * BigInt(reward);

                    if (current > highest) {
                        //console.log("best " + act.x + "," + act.y);
                        highest = current;
                        bestAction = act;
                        //currentReward = reward;
                    }

                }

            }

            if (bestAction != null) {
                result.push(bestAction);
            }

        }

        if (result.length > 0) {
            return result;
        } else {
            return [this.actions[0]];
        }
 

    }

}

// information about the boxes surrounding a dead candidate
class ChordLocation {

    constructor(tile, benefit) {

        this.tile = tile;
        this.benefit = benefit;

    }

}
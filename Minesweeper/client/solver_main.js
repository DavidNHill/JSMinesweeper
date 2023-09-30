/**
 * 
 */
"use strict";

const OFFSETS = [[2, 0], [-2, 0], [0, 2], [0, -2]];
const OFFSETS_ALL = [[2, -2], [2, -1], [2, 0], [2, 1], [2, 2], [-2, -2], [-2, -1], [-2, 0], [-2, 1], [-2, 2], [-1, 2], [0, 2], [1, 2], [-1, -2], [0, -2], [1, -2]];

const PLAY_BFDA_THRESHOLD = 1000;       // number of solutions for the Brute force analysis to start
const ANALYSIS_BFDA_THRESHOLD = 5000;
const BRUTE_FORCE_CYCLES_THRESHOLD = 5000000;
const HARD_CUT_OFF = 0.90;        // cutoff for considering on edge possibilities below the best probability
const OFF_EDGE_THRESHOLD = 0.95;  // when to include possibilities off the edge
const PROGRESS_CONTRIBUTION = 0.2;  // how much progress counts towards the final score

const USE_HIGH_DENSITY_STRATEGY = false;  // I think "secondary safety" generally works better than "solution space reduction"

const PLAY_STYLE_FLAGS = 1;
const PLAY_STYLE_NOFLAGS = 2;
const PLAY_STYLE_EFFICIENCY = 3;
const PLAY_STYLE_NOFLAGS_EFFICIENCY = 4;

// solver entry point
async function solver(board, options) {

    // when initialising create some entry points to functions needed from outside
    if (board == null) {
        console.log("Solver Initialisation request received");
        solver.countSolutions = countSolutions;
        return;
    }

    if (options.verbose == null) {
        options.verbose = true;
        writeToConsole("WARN: Verbose parameter not received by the solver, setting verbose = true");
    }

    if (options.playStyle == null) {
        writeToConsole("WARN: playstyle parameter not received by the solver, setting play style to flagging");
        options.playStyle = PLAY_STYLE_FLAGS;
    }

    // this is used to disable all the advanced stuff like BFDA and tie-break
    if (options.advancedGuessing == null) {
        options.advancedGuessing = true;
    }

    // this is used to force a probability engine search
    if (options.fullProbability == null) {
        options.fullProbability = false;
    }

    // this is used to stop the guess heuristic from pruning results
    // has an impact on the processing speed
    if (options.guessPruning == null) {
        options.guessPruning = true;
    }

    // this is used when using the solver to create a no-guessing board
    if (options.noGuessingMode == null) {
        options.noGuessingMode = false;
    }

    if (!options.guessPruning) {
        console.log("WARNING: The Guessing processing has pruning turned off, this will impact performance");
    }

    // a bit of a bodge this variable is used as a global
    let fillerTiles = [];   // this is used by the no-guess board generator 

    let noMoves = 0;
    let cleanActions = [];  // these are the actions to take
    const otherActions = [];    // this is other Actions of interest

    // allow the solver to bring back no moves 5 times. No moves is possible when playing no-flags 
    while (noMoves < 5 && cleanActions.length == 0) {
        noMoves++;
        const actions = await doSolve(board, options);  // look for solutions
        //console.log(actions);

        if (options.playStyle == PLAY_STYLE_EFFICIENCY || options.playStyle == PLAY_STYLE_NOFLAGS_EFFICIENCY) {
            cleanActions = actions;

            // find all the other actions which could be played
            top: for (let tile of board.tiles) {
                if (!tile.isCovered()) {
                    continue;
                }

                // ignore actions which are the primary actions
                for (let action of actions) {
                    if (tile.x == action.x && tile.y == action.y) {
                        //console.log(tile.asText() + " is a primary action");
                        continue top;
                    }
                }
                //console.log(tile.asText() + " mine=" + tile.isSolverFoundBomb() + ", flagged=" + tile.isFlagged() + ", probability=" + tile.probability);
                if (tile.isSolverFoundBomb() && !tile.isFlagged()) {
                    otherActions.push(new Action(tile.getX(), tile.getY(), 0, ACTION_FLAG));
                } else if (tile.probability == 1) {
                    otherActions.push(new Action(tile.getX(), tile.getY(), 1, ACTION_CLEAR));
                }
            }

        } else {
            for (let i = 0; i < actions.length; i++) {

                const action = actions[i];

                if (action.action == ACTION_FLAG) {   // if a request to flag
 
                    const tile = board.getTileXY(action.x, action.y);
                    if (!tile.isFlagged()) {   // only accept the flag action if the tile isn't already flagged
                        if (options.playStyle == PLAY_STYLE_FLAGS) {  // if we are flagging
                            cleanActions.push(action);
                        } else {
                            otherActions.push(action);
                        }
                    }
                } else {
                    cleanActions.push(action);
                }
            }
        }
    }

    const reply = {};
    reply.actions = cleanActions;
    reply.fillers = fillerTiles;
    reply.other = otherActions;

    return reply;

    // **** functions below here ****

    // this finds the best moves 
    async function doSolve(board, options) {

        // find all the tiles which are revealed and have un-revealed / un-flagged adjacent squares
        const allCoveredTiles = [];
        const witnesses = [];
        const witnessed = [];
        const unflaggedMines = [];

        let minesLeft = board.num_bombs;
        let squaresLeft = 0;

        let deadTiles = [];  // used to hold the tiles which have been determined to be dead by either the probability engine or deep analysis

        const work = new Set();  // use a map to deduplicate the witnessed tiles

        showMessage("The solver is thinking...");

        for (let i = 0; i < board.tiles.length; i++) {

            const tile = board.getTile(i);

            tile.clearHint();  // clear any previous hints

            if (tile.isSolverFoundBomb()) {
                minesLeft--;
                tile.setProbability(0);
                if (!tile.isFlagged()) {
                    unflaggedMines.push(tile);
                }
                continue;  // if the tile is a mine then nothing to consider
            } else if (tile.isCovered()) {
                squaresLeft++;
                allCoveredTiles.push(tile);
                continue;  // if the tile hasn't been revealed yet then nothing to consider
            }

            const adjTiles = board.getAdjacent(tile);

            let needsWork = false;
            for (let j = 0; j < adjTiles.length; j++) {
                const adjTile = adjTiles[j];
                if (adjTile.isCovered() && !adjTile.isSolverFoundBomb()) {
                    needsWork = true;
                    work.add(adjTile.index);
                }
            }

            if (needsWork) {  // the witness still has some unrevealed adjacent tiles
                witnesses.push(tile);
            }

        }

        // generate an array of tiles from the map
        for (let index of work) {
            const tile = board.getTile(index);
            tile.setOnEdge(true);
            witnessed.push(tile);
        }

        board.setHighDensity(squaresLeft, minesLeft);

        writeToConsole("tiles left = " + squaresLeft);
        writeToConsole("mines left = " + minesLeft);
        writeToConsole("Witnesses  = " + witnesses.length);
        writeToConsole("Witnessed  = " + witnessed.length);

        let result = [];

        // if we are in flagged mode then flag any mines currently unflagged
        if (options.playStyle != PLAY_STYLE_EFFICIENCY && options.playStyle != PLAY_STYLE_NOFLAGS_EFFICIENCY) {
            for (let tile of unflaggedMines) {
                result.push(new Action(tile.getX(), tile.getY(), 0, ACTION_FLAG));
            }
        }

        // if there are no mines left to find the everything else is to be cleared
        if (minesLeft == 0) {
            for (let i = 0; i < allCoveredTiles.length; i++) {
                const tile = allCoveredTiles[i];

                tile.setProbability(1);
                result.push(new Action(tile.getX(), tile.getY(), 1, ACTION_CLEAR))
            }
            showMessage("No mines left to find all remaining tiles are safe");
            return new EfficiencyHelper(board, witnesses, witnessed, result, options.playStyle, null).process();
        }

        const oldMineCount = result.length;

        // add any trivial moves we've found
        if (options.fullProbability || options.playStyle == PLAY_STYLE_EFFICIENCY || options.playStyle == PLAY_STYLE_NOFLAGS_EFFICIENCY) {
            console.log("Skipping trivial analysis since Probability Engine analysis is required")
        } else {
            result.push(...trivial_actions(board, witnesses));
        }
 
        if (result.length > oldMineCount) {
            showMessage("The solver found " + result.length + " trivial safe moves");
            return result;
            /*
            if (options.playStyle != PLAY_STYLE_FLAGS) {
                var mineFound = false;
                var noFlagResult = [];
                for (var i = 0; i < result.length; i++) {

                    var action = result[i];

                    if (action.prob == 0) {   // zero safe probability == mine
                        mineFound = true;
                    } else {   // otherwise we're trying to clear
                        noFlagResult.push(action);
                    }
                }
                if (options.playStyle == PLAY_STYLE_NOFLAGS) {  // flag free but not efficiency, send the clears
                    return noFlagResult;
                } else if (mineFound) { // if we are playing for efficiency and a mine was found then we can't continue. send nothing and try again
                    return [];
                }
                // if we are playing for efficiency and a mine wasn't found then go on to do the probability engine - this gets us all the possible clears and mines
                result = [];  // clear down any actions we found  trivially
                //return new EfficiencyHelper(board, witnesses, noFlagResult).process();
            } else {
                return result;
            }
            */
        }

        const pe = new ProbabilityEngine(board, witnesses, witnessed, squaresLeft, minesLeft, options);

        pe.process();

        writeToConsole("probability Engine took " + pe.duration + " milliseconds to complete");

        if (pe.finalSolutionCount == 0) {
            showMessage("The board is in an illegal state");
            return result;
        }

        // If we have a full analysis then set the probabilities on the tile tooltips
        if (pe.fullAnalysis) {

            // Set the probability for each tile on the edge 
            for (let i = 0; i < pe.boxes.length; i++) {
                for (let j = 0; j < pe.boxes[i].tiles.length; j++) {
                    pe.boxes[i].tiles[j].setProbability(pe.boxProb[i]);
                }
            }

            // set all off edge probabilities
            for (let i = 0; i < board.tiles.length; i++) {

                const tile = board.getTile(i);

                if (tile.isSolverFoundBomb()) {
                    if (!tile.isFlagged()) {
                        tile.setProbability(0);
                    }
                } else if (tile.isCovered() && !tile.onEdge) {
                    tile.setProbability(pe.offEdgeProbability);
                }
            }
        }

        // if the tiles off the edge are definitely safe then clear them all
        let offEdgeAllSafe = false;
        if (pe.offEdgeProbability == 1) {
            const edgeSet = new Set();  // build a set containing all the on edge tiles
            for (let i = 0; i < witnessed.length; i++) {
                edgeSet.add(witnessed[i].index);
            }
            // any tiles not on the edge can be cleared
            for (let i = 0; i < allCoveredTiles.length; i++) {
                const tile = allCoveredTiles[i];
                if (!edgeSet.has(tile.index)) {
                    result.push(new Action(tile.getX(), tile.getY(), 1, ACTION_CLEAR));
                }
            }

            if (result.length > 0) {
                writeToConsole("The Probability Engine has determined all off edge tiles must be safe");
                offEdgeAllSafe = true;
                //showMessage("The solver has determined all off edge tiles must be safe");
                //return result;
            }

        } else if (pe.offEdgeProbability == 0 && pe.fullAnalysis) {  
            writeToConsole("The Probability Engine has determined all off edge tiles must be mines");
            const edgeSet = new Set();  // build a set containing all the on edge tiles
            for (let i = 0; i < witnessed.length; i++) {
                edgeSet.add(witnessed[i].index);
            }
            // any tiles not on the edge are a mine
            for (let i = 0; i < allCoveredTiles.length; i++) {
                const tile = allCoveredTiles[i];
                if (!edgeSet.has(tile.index) && !tile.isFlagged()) {
                    pe.minesFound.push(tile)
                    //tile.setFoundBomb();
                }
            }
        }

        // have we found any local clears which we can use or everything off the edge is safe
        if (pe.localClears.length > 0 || pe.minesFound.length > 0 || offEdgeAllSafe) {
            for (let tile of pe.localClears) {   // place each local clear into an action
                tile.setProbability(1);
                const action = new Action(tile.getX(), tile.getY(), 1, ACTION_CLEAR);
                result.push(action);
            }

            for (let tile of pe.minesFound) {   // place each found flag
                tile.setProbability(0);
                tile.setFoundBomb();
                //if (options.playStyle == PLAY_STYLE_FLAGS) {
                    const action = new Action(tile.getX(), tile.getY(), 0, ACTION_FLAG);
                    result.push(action);
                //}
            }

            showMessage("The probability engine has found " + pe.localClears.length + " safe clears and " + pe.minesFound.length + " mines");
            return new EfficiencyHelper(board, witnesses, witnessed, result, options.playStyle, pe).process();
        } 


        // this is part of the no-guessing board creation logic
        if (pe.bestProbability < 1 && options.noGuessingMode) {
            if (pe.bestOnEdgeProbability >= pe.offEdgeProbability) {
                result.push(pe.getBestCandidates(1));  // get best options
            } else {
                writeToConsole("Off edge is best, off edge prob = " + pe.offEdgeProbability + ", on edge prob = " + pe.bestOnEdgeProbability, true);
                const bestGuessTile = offEdgeGuess(board, witnessed);
                result.push(new Action(bestGuessTile.getX(), bestGuessTile.getY(), pe.offEdgeProbability), ACTION_CLEAR);
            }

            // find some witnesses which can be adjusted to remove the guessing
            findBalancingCorrections(pe);

            return result;
        }

        // if we aren' allowing advanced guessing then stop here
        if (!options.advancedGuessing) {
            writeToConsole("Advanced guessing is turned off so exiting the solver after the probability engine");
            showMessage("Press 'Analyse' for advanced guessing");
            return result;
        }

        /*
        // if we don't have a certain guess then look for ...
        //let ltr;
        if (pe.bestOnEdgeProbability != 1 && minesLeft > 1) {

            // See if there are any unavoidable 2 tile 50/50 guesses 
            const unavoidable5050a = pe.checkForUnavoidable5050();
            if (unavoidable5050a != null) {
                result.push(new Action(unavoidable5050a.getX(), unavoidable5050a.getY(), unavoidable5050a.probability, ACTION_CLEAR));
                showMessage(unavoidable5050a.asText() + " is an unavoidable 50/50 guess." + formatSolutions(pe.finalSolutionsCount));
                return addDeadTiles(result, pe.getDeadTiles());
            }

            // look for any 50/50 or safe guesses 
            //const unavoidable5050b = new FiftyFiftyHelper(board, pe.minesFound, options, pe.getDeadTiles(), witnessed, minesLeft).process();

            //ltr = new LongTermRiskHelper(board, pe, minesLeft, options);
            //const unavoidable5050b = ltr.findInfluence();
            //if (unavoidable5050b != null) {
            //    result.push(new Action(unavoidable5050b.getX(), unavoidable5050b.getY(), unavoidable5050b.probability, ACTION_CLEAR));
            //   showMessage(unavoidable5050b.asText() + " is an unavoidable 50/50 guess, or safe." + formatSolutions(pe.finalSolutionsCount));
            //    return addDeadTiles(result, pe.getDeadTiles());
            //}
        }
        */

        // if we have an isolated edge process that
        if (pe.bestProbability < 1 && pe.isolatedEdgeBruteForce != null) {

            const solutionCount = pe.isolatedEdgeBruteForce.crunch();

            writeToConsole("Solutions found by brute force for isolated edge " + solutionCount);

            const bfda = new BruteForceAnalysis(pe.isolatedEdgeBruteForce.allSolutions, pe.isolatedEdgeBruteForce.iterator.tiles, 1000, options.verbose);  // the tiles and the solutions need to be in sync

            await bfda.process();

            // if the brute force deep analysis completed then use the results
            if (bfda.completed) {
                // if they aren't all dead then send the best guess
                if (!bfda.allTilesDead()) {
                    const nextmove = bfda.getNextMove();
                    result.push(nextmove);

                    deadTiles = bfda.deadTiles;
                    var winChanceText = (bfda.winChance * 100).toFixed(2);
                    showMessage("The solver has calculated the best move has a " + winChanceText + "% chance to solve the isolated edge." + formatSolutions(pe.finalSolutionsCount));

                } else {
                    showMessage("The solver has calculated that all the tiles on the isolated edge are dead." + formatSolutions(pe.finalSolutionsCount));
                    deadTiles = bfda.deadTiles;   // all the tiles are dead
                }

                return addDeadTiles(result, deadTiles);
            }

        }

        // if we are having to guess and there are less then BFDA_THRESHOLD solutions use the brute force deep analysis...
        let bfdaThreshold;
        if (analysisMode) {
            bfdaThreshold = ANALYSIS_BFDA_THRESHOLD;
        } else {
            bfdaThreshold = PLAY_BFDA_THRESHOLD;
        }

        let partialBFDA = null;
        if (pe.bestProbability < 1 && pe.finalSolutionsCount < bfdaThreshold) {

            showMessage("The solver is starting brute force deep analysis on " + pe.finalSolutionsCount + " solutions");
            await sleep(1);

            pe.generateIndependentWitnesses();

            const iterator = new WitnessWebIterator(pe, allCoveredTiles, -1);

            let bfdaCompleted = false;
            let bfda
            if (iterator.cycles <= BRUTE_FORCE_CYCLES_THRESHOLD) {
                const bruteForce = new Cruncher(board, iterator);

                const solutionCount = bruteForce.crunch();

                writeToConsole("Solutions found by brute force " + solutionCount + " after " + iterator.getIterations() + " cycles");

                bfda = new BruteForceAnalysis(bruteForce.allSolutions, iterator.tiles, 1000, options.verbose);  // the tiles and the solutions need to be in sync

                await bfda.process();

                bfdaCompleted = bfda.completed;
            } else {
                writeToConsole("Brute Force requires too many cycles - skipping BFDA: " + iterator.cycles);
            }


            // if the brute force deep analysis completed then use the results
            if (bfdaCompleted) {
                // if they aren't all dead then send the best guess
                if (!bfda.allTilesDead()) {
                    const nextmove = bfda.getNextMove();
                    result.push(nextmove);

                    deadTiles = bfda.deadTiles;
                    const winChanceText = (bfda.winChance * 100).toFixed(2);
                    showMessage("The solver has calculated the best move has a " + winChanceText + "% chance to win the game." + formatSolutions(pe.finalSolutionsCount));

                } else {
                    showMessage("The solver has calculated that all the remaining tiles are dead." + formatSolutions(pe.finalSolutionsCount));
                    deadTiles = allCoveredTiles;   // all the tiles are dead
                }

                return addDeadTiles(result, deadTiles);
            } else {
                deadTiles = pe.getDeadTiles();  // use the dead tiles from the probability engine
                partialBFDA = bfda;
            }

        } else {
            deadTiles = pe.getDeadTiles();  // use the dead tiles from the probability engine
        }

        // if we don't have a certain guess and we have too many solutions for brute force then look for ...
        let ltr;
        if (pe.bestOnEdgeProbability != 1 && minesLeft > 1) {

            // See if there are any unavoidable 2 tile 50/50 guesses 
            const unavoidable5050a = pe.checkForUnavoidable5050();
            if (unavoidable5050a != null) {
                result.push(new Action(unavoidable5050a.getX(), unavoidable5050a.getY(), unavoidable5050a.probability, ACTION_CLEAR));
                showMessage(unavoidable5050a.asText() + " is an unavoidable 50/50 guess." + formatSolutions(pe.finalSolutionsCount));
                return addDeadTiles(result, pe.getDeadTiles());
            }

            // look for any 50/50 or safe guesses - old method
            //const unavoidable5050b = new FiftyFiftyHelper(board, pe.minesFound, options, pe.getDeadTiles(), witnessed, minesLeft).process();

            ltr = new LongTermRiskHelper(board, pe, minesLeft, options);
            const unavoidable5050b = ltr.findInfluence();
            if (unavoidable5050b != null) {
                result.push(new Action(unavoidable5050b.getX(), unavoidable5050b.getY(), unavoidable5050b.probability, ACTION_CLEAR));
               showMessage(unavoidable5050b.asText() + " is an unavoidable 50/50 guess, or safe." + formatSolutions(pe.finalSolutionsCount));
                return addDeadTiles(result, pe.getDeadTiles());
            }
        }

        /*
        // calculate 50/50 influence and check for a pseudo-50/50
        let ltr;
        if (pe.bestOnEdgeProbability != 1 && minesLeft > 1) {

            ltr = new LongTermRiskHelper(board, pe, minesLeft, options);
            const unavoidable5050b = ltr.findInfluence();
            if (unavoidable5050b != null) {
                result.push(new Action(unavoidable5050b.getX(), unavoidable5050b.getY(), unavoidable5050b.probability, ACTION_CLEAR));
               showMessage(unavoidable5050b.asText() + " is an unavoidable 50/50 guess, or safe." + formatSolutions(pe.finalSolutionsCount));
                return addDeadTiles(result, pe.getDeadTiles());
            }
        }
        */

        // ... otherwise we will use the probability engines results

        result.push(...pe.getBestCandidates(HARD_CUT_OFF));  // get best options within this ratio of the best value

        // if the off edge tiles are within tolerance then add them to the candidates to consider as long as we don't have certain clears
        if (pe.bestOnEdgeProbability != 1 && pe.offEdgeProbability > pe.bestOnEdgeProbability * OFF_EDGE_THRESHOLD) {
            result.push(...getOffEdgeCandidates(board, pe, witnesses, allCoveredTiles));
            result.sort(function (a, b) { return b.prob - a.prob });
        }

        // if we have some good guesses on the edge
        if (result.length > 0) {
            for (let i = 0; i < deadTiles.length; i++) {
                const tile = deadTiles[i];

                writeToConsole("Tile " + tile.asText() + " is dead");
                for (let j = 0; j < result.length; j++) {
                    if (result[j].x == tile.x && result[j].y == tile.y) {
                        result[j].dead = true;
                        //found = true;
                        break;
                    }
                }
            }

            if (pe.bestProbability == 1) {
                showMessage("The solver has found some certain moves using the probability engine." + formatSolutions(pe.finalSolutionsCount));

                 // identify where the bombs are
                for (let tile of pe.minesFound) {
                    tile.setFoundBomb();
                    if (options.playStyle == PLAY_STYLE_FLAGS) {
                        const action = new Action(tile.getX(), tile.getY(), 0, ACTION_FLAG);
                        result.push(action);
                    }
                }
 
                result = new EfficiencyHelper(board, witnesses, witnessed, result, options.playStyle, pe).process();
            } else {
                showMessage("The solver has found the best guess on the edge using the probability engine." + formatSolutions(pe.finalSolutionsCount));
                if (pe.duration < 50) {  // if the probability engine didn't take long then use some tie-break logic
                    result = tieBreak(pe, result, partialBFDA, ltr);
                }
            }

        } else {  // otherwise look for a guess with the least number of adjacent covered tiles (hunting zeros)
            const bestGuessTile = offEdgeGuess(board, witnessed);

            result.push(new Action(bestGuessTile.getX(), bestGuessTile.getY(), pe.offEdgeProbability), ACTION_CLEAR);

            showMessage("The solver has decided the best guess is off the edge." + formatSolutions(pe.finalSolutionsCount));

        }

        //return addDeadTiles(result, pe.getDeadTiles());
        return addDeadTiles(result, deadTiles);

    }

    // used to add the dead tiles to the results
    function addDeadTiles(result, deadTiles) {

        // identify the dead tiles
        for (let tile of deadTiles) {   // show all dead tiles 
            if (tile.probability != 0) {
                const action = new Action(tile.getX(), tile.getY(), tile.probability);
                action.dead = true;
                result.push(action);
            }
        }

        return result;

    }

    function tieBreak(pe, actions, bfda, ltr) {

        const start = Date.now();

        writeToConsole("Long term risks ==>");

        const alreadyIncluded = new Set();
        for (let action of actions) {
            alreadyIncluded.add(board.getTileXY(action.x, action.y));
        }

        const extraTiles = ltr.getInfluencedTiles(pe.bestProbability * 0.9);
        for (let tile of extraTiles) {
            if (alreadyIncluded.has(tile)) {
                //writeToConsole(tile.asText() + " is already in the list of candidates to be analysed");
            } else {
                alreadyIncluded.add(tile);
                actions.push(new Action(tile.getX(), tile.getY(), pe.getProbability(tile), ACTION_CLEAR));
                writeToConsole(tile.asText() + " added to the list of candidates to be analysed");
            }
        }
        writeToConsole("<==");

        let best;
        for (let action of actions) {

            if (action.action == ACTION_FLAG) { // ignore the action if it is a flagging request
                continue;
            }

            //fullAnalysis(pe, board, action, best);  // updates variables in the Action class

            secondarySafetyAnalysis(pe, board, action, best, ltr) // updates variables in the Action class

            if (best == null || compare(best, action) > 0) {
                writeToConsole(action.asText() + " is now the best with score " + action.weight);
                best = action;
            }

        }

        if (USE_HIGH_DENSITY_STRATEGY && board.isHighDensity() ) {
            writeToConsole("Board is high density prioritise minimising solutions space");
            actions.sort(function (a, b) {

                let c = b.prob - a.prob;
                if (c != 0) {
                    return c;
                } else if (a.maxSolutions > b.maxSolutions) {
                    return 1;
                } else if (a.maxSolutions < b.maxSolutions) {
                    return -1;
                } else {
                    return b.weight - a.weight;
                }

            });
        } else {
            actions.sort(function (a, b) { return compare(a, b) });
        }

        if (bfda != null && actions.length > 0) {
            const better = bfda.checkForBetterMove(actions[0]);
            if (better != null) {
                const betterAction = new Action(better.x, better.y, better.probability, ACTION_CLEAR);
                writeToConsole("Replacing " + actions[0].asText() + " with " + betterAction.asText() + " because it is better from partial BFDA");
                actions = [betterAction];
            }
        }

        findAlternativeMove(actions);

        writeToConsole("Solver recommends (" + actions[0].x + "," + actions[0].y + ")");

        writeToConsole("Best Guess analysis took " + (Date.now() - start) + " milliseconds to complete");

        return actions;

    }

    // 4139912032944127.5
    function compare(a, b) {

        // Move flag actions to the bottom
        if (a.action == ACTION_FLAG && b.action != ACTION_FLAG) {
            return 1;
        } else if (a.action != ACTION_FLAG && b.action == ACTION_FLAG) {
            return -1;
        }

        // move dead tiles to the bottom
        if (a.dead && !b.dead) {
            return 1;
        } else if (!a.dead && b.dead) {
            return -1;
        }

        // then more best score to the top
        let c = b.weight - a.weight;
        if (c != 0) {
            return c;
        } else {
            return b.expectedClears - a.expectedClears;
        }

    }

    // find a move which 1) is safer than the move given and 2) when move is safe ==> the alternative is safe
    function findAlternativeMove(actions) {

        const action = actions[0]  // the current best

        // if one of the common boxes contains a tile which has already been processed then the current tile is redundant
        for (let i = 1; i < actions.length; i++) {

            const alt = actions[i];

            if (alt.action == ACTION_FLAG) { // ignore the action if it is a flagging request
                continue;
            }

            if (alt.prob - action.prob > 0.001) {  // the alternative move is at least a bit safe than the current move
                 for (let tile of action.commonClears) {  // see if the move is in the list of common safe tiles
                    if (alt.x == tile.x && alt.y == tile.y) {
                        writeToConsole("Replacing " + action.asText() + " with " + alt.asText() + " because it dominates");

                        // switch the alternative action with the best
                        actions[0] = alt;
                        actions[i] = action;

                        return;
                    }
                }
            }
        }

        // otherwise return the order
        return;

    }

    function trivial_actions(board, witnesses) {

        const result = new Map();

        for (let i = 0; i < witnesses.length; i++) {

            const tile = witnesses[i];

            const adjTiles = board.getAdjacent(tile);

            let flags = 0
            let covered = 0;
            for (let j = 0; j < adjTiles.length; j++) {
                const adjTile = adjTiles[j];
                if (adjTile.isSolverFoundBomb()) {
                    flags++;
                } else if (adjTile.isCovered()) {
                    covered++;
                }
            }

            // if the tile has the correct number of flags then the other adjacent tiles are clear
            if (flags == tile.getValue() && covered > 0) {
                for (let j = 0; j < adjTiles.length; j++) {
                    const adjTile = adjTiles[j];
                    if (adjTile.isCovered() && !adjTile.isSolverFoundBomb()) {
                        adjTile.setProbability(1);  // definite clear
                        result.set(adjTile.index, new Action(adjTile.getX(), adjTile.getY(), 1, ACTION_CLEAR));
                    }
                }

            // if the tile has n remaining covered squares and needs n more flags then all the adjacent files are flags
            } else if (tile.getValue() == flags + covered && covered > 0) {
                for (let j = 0; j < adjTiles.length; j++) {
                    const adjTile = adjTiles[j];
                    if (adjTile.isCovered() && !adjTile.isSolverFoundBomb()) { // if covered, not already a known mine and isn't flagged
                        adjTile.setProbability(0);  // definite mine
                        adjTile.setFoundBomb();
                        //if (!adjTile.isFlagged()) {  // if not already flagged then flag it
                        result.set(adjTile.index, new Action(adjTile.getX(), adjTile.getY(), 0, ACTION_FLAG));
                        //}

                    }
                }
            } 

        }

        writeToConsole("Found " + result.size + " moves trivially");

        // send it back as an array
        return Array.from(result.values());

    }

    /**
     * Find the best guess off the edge when the probability engine doesn't give the best guess as on edge
     */
    function offEdgeGuess(board, witnessed) {

        const edgeSet = new Set();  // build a set containing all the on edge tiles
        for (let i = 0; i < witnessed.length; i++) {
            edgeSet.add(witnessed[i].index);
        }

        let bestGuess;
        let bestGuessCount = 9;

        for (let i = 0; i < board.tiles.length; i++) {
            const tile = board.getTile(i);

            // if we are an unrevealed square and we aren't on the edge
            // then store the location
            if (tile.isCovered() && !tile.isSolverFoundBomb() && !edgeSet.has(tile.index)) { // if the tile is covered and not on the edge

                const adjCovered = board.adjacentCoveredCount(tile);

                // if we only have isolated tiles then use this
                if (adjCovered == 0 && bestGuessCount == 9) {
                    writeToConsole(tile.asText() + " is surrounded by flags");
                    bestGuess = tile;
                }

                if (adjCovered > 0 && adjCovered < bestGuessCount) {
                    bestGuessCount = adjCovered;
                    bestGuess = tile;
                }
            }
        }

        if (bestGuess == null) {
            writeToConsole("Off edge guess has returned null!", true);
        }

        return bestGuess;

    }

    function getOffEdgeCandidates(board, pe, witnesses, allCoveredTiles) {

        writeToConsole("getting off edge candidates");

        const accepted = new Set();  // use a map to deduplicate the witnessed tiles

        // if there are only a small number of tiles off the edge then consider them all
        if (allCoveredTiles.length - pe.witnessed.length < 30) {
            for (let i = 0; i < allCoveredTiles.length; i++) {
                const workTile = allCoveredTiles[i];
                // if the tile  isn't on the edge
                if (!workTile.onEdge) {
                    accepted.add(workTile);
                }
            }

        } else {  // otherwise prioritise those most promising

            let offsets;
            if (board.isHighDensity()) {
                offsets = OFFSETS_ALL;
            } else {
                offsets = OFFSETS;
            }

            for (let i = 0; i < witnesses.length; i++) {

                const tile = witnesses[i];

                for (let j = 0; j < offsets.length; j++) {

                    const x1 = tile.x + offsets[j][0];
                    const y1 = tile.y + offsets[j][1];

                    if (x1 >= 0 && x1 < board.width && y1 >= 0 && y1 < board.height) {

                        const workTile = board.getTileXY(x1, y1);

                        //console.log(x1 + " " + y1 + " is within range, covered " + workTile.isCovered() + ", on Edge " + workTile.onEdge);
                        if (workTile.isCovered() && !workTile.isSolverFoundBomb() && !workTile.onEdge) {
                             accepted.add(workTile);
                        }
                    }

                }

            }

            for (let i = 0; i < allCoveredTiles.length; i++) {

                const workTile = allCoveredTiles[i];

                // if the tile isn't alrerady being analysed and isn't on the edge
                if (!accepted.has(workTile) && !workTile.onEdge) {

                    // see if it has a small number of free tiles around it
                    const adjCovered = board.adjacentCoveredCount(workTile);
                    if (adjCovered > 1 && adjCovered < 4) {
                        accepted.add(workTile);
                    }

                }

            }

        }

        const result = []

        // generate an array of tiles from the map
        for (let tile of accepted) {
            result.push(new Action(tile.x, tile.y, pe.offEdgeProbability, ACTION_CLEAR));
        }

        return result;

    }

    function fullAnalysis(pe, board, action, best) {

        const tile = board.getTileXY(action.x, action.y);
 
        const adjFlags = board.adjacentFoundMineCount(tile);
        const adjCovered = board.adjacentCoveredCount(tile);

        let progressSolutions = BigInt(0);
        let expectedClears = BigInt(0);
        let maxSolutions = BigInt(0);

        const probThisTile = action.prob;
        let probThisTileLeft = action.prob;  // this is used to calculate when we can prune this action

        // this is used to hold the tiles which are clears for all the possible values
        const commonClears = null;

        for (let value = adjFlags; value <= adjCovered + adjFlags; value++) {

            const progress = divideBigInt(solutions, pe.finalSolutionsCount, 6);
            const bonus = 1 + (progress + probThisTileLeft) * PROGRESS_CONTRIBUTION;
            const weight = probThisTile * bonus;

            if (best != null && weight < best.weight) {
                writeToConsole("(" + action.x + "," + action.y + ") is being pruned");
                action.weight = weight;
                action.pruned = true;

                tile.setCovered(true);   // make sure we recover the tile
                return;
            }

            tile.setValue(value);

            const work = countSolutions(board, null);

            if (work.finalSolutionsCount > 0) {  // if this is a valid board state
                if (commonClears == null) {
                    commonClears = work.getLocalClears();
                } else {
                    commonClears = andClearTiles(commonClears, work.getLocalClears());
                }

                const probThisTileValue = divideBigInt(work.finalSolutionsCount, pe.finalSolutionsCount, 6);
                probThisTileLeft = probThisTileLeft - probThisTileValue;

            }


            //totalSolutions = totalSolutions + work.finalSolutionsCount;
            if (work.clearCount > 0) {
                expectedClears = expectedClears + work.finalSolutionsCount * BigInt(work.clearCount);
                progressSolutions = progressSolutions + work.finalSolutionsCount;
            }

            if (work.finalSolutionsCount > maxSolutions) {
                maxSolutions = work.finalSolutionsCount;
            }

        }

        tile.setCovered(true);

        action.expectedClears = divideBigInt(expectedClears, pe.finalSolutionsCount, 6);

        const progress = divideBigInt(progressSolutions, pe.finalSolutionsCount, 6);

        action.progress = progress;

        action.weight = action.prob * (1 + progress * PROGRESS_CONTRIBUTION);
        action.maxSolutions = maxSolutions;
        action.commonClears = commonClears;

        tile.setProbability(action.prob, action.progress);

        writeToConsole(tile.asText() + ", progress = " + action.progress + ", weight = " + action.weight + ", expected clears = " + action.expectedClears + ", common clears = " + commonClears.length);

    }

    function countSolutions(board, notMines) {

        // find all the tiles which are revealed and have un-revealed / un-flagged adjacent squares
        const allCoveredTiles = [];
        const witnesses = [];
        const witnessed = [];

        let minesLeft = board.num_bombs;
        let squaresLeft = 0;

        const work = new Set();  // use a map to deduplicate the witnessed tiles

        for (let i = 0; i < board.tiles.length; i++) {

            const tile = board.getTile(i);

            if (tile.isSolverFoundBomb()) {
                minesLeft--;
                continue;  // if the tile is a flag then nothing to consider
            } else if (tile.isCovered()) {
                squaresLeft++;
                allCoveredTiles.push(tile);
                continue;  // if the tile hasn't been revealed yet then nothing to consider
            }

            const adjTiles = board.getAdjacent(tile);

            let needsWork = false;
            let minesFound = 0;
            for (let j = 0; j < adjTiles.length; j++) {
                const adjTile = adjTiles[j];
                if (adjTile.isSolverFoundBomb()) {
                    minesFound++;
                } else if (adjTile.isCovered()) {
                    needsWork = true;
                    work.add(adjTile.index);
                }
            }

            // if a witness needs work (still has hidden adjacent tiles) or is broken then add it to the mix
            if (needsWork || minesFound > tile.getValue()) {
                witnesses.push(tile);
            }

        }

        // generate an array of tiles from the map
        for (let index of work) {
            const tile = board.getTile(index);
            tile.setOnEdge(true);
            witnessed.push(tile);
        }

        //console.log("tiles left = " + squaresLeft);
        //console.log("mines left = " + minesLeft);
        //console.log("Witnesses  = " + witnesses.length);
        //console.log("Witnessed  = " + witnessed.length);

        var solutionCounter = new SolutionCounter(board, witnesses, witnessed, squaresLeft, minesLeft);

        // let the solution counter know which tiles mustn't contain mines
        if (notMines != null) {
            for (let tile of notMines) {
                if (!solutionCounter.setMustBeEmpty(tile)) {
                    writeToConsole("Tile " + tile.asText() + " failed to set must be empty");
                }
            }
        }

        solutionCounter.process();

        return solutionCounter;

    }

    function secondarySafetyAnalysis(pe, board, action, best, ltr) {

        const progressContribution = 0.052;

        const tile = board.getTileXY(action.x, action.y);

        const safePe = runProbabilityEngine(board, [tile]);
        let linkedTilesCount = 0;
        let dominated = false;  // if tile 'a' being safe ==> tile 'b' & 'c' are safe and 'b' and 'c' are in the same box ==> 'b' is safer then 'a' 

        for (let box of safePe.emptyBoxes) {
            if (box.contains(tile)) { // if the tile is in this box then ignore it

            } else {
                if (box.tiles.length > 1) {
                    dominated = true;
                } else {
                    linkedTilesCount++;
                }
            }
        }

        writeToConsole("Tile " + tile.asText() + " has " + linkedTilesCount + " linked tiles and dominated=" + dominated);

        // a dominated tile doesn't need any further resolution
        if (dominated) {
            action.progress = action.prob;    // progress is total
            action.weight = action.prob * (1 + action.prob * progressContribution);
            action.maxSolutions = safePe.finalSolutionsCount;
            action.commonClears = safePe.localClears;

            tile.setProbability(action.prob, action.progress, action.progress);  // a dominated tile has 100% progress

            return;
        }

        const tileBox = pe.getBox(tile);
        let safetyTally;
        if (tileBox == null) {
            safetyTally = pe.finalSolutionsCount - pe.offEdgeMineTally;
        } else {
            safetyTally = pe.finalSolutionsCount - tileBox.mineTally;
        }

        const tileInfluenceTally = ltr.findTileInfluence(tile);
        //console.log("Safety Tally " + safetyTally + ", tileInfluenceTally " + tileInfluenceTally);

        //const fiftyFiftyInfluenceTally = safetyTally + tileInfluenceTally;
        const fiftyFiftyInfluence = 1 + divideBigInt(tileInfluenceTally, safetyTally, 6) * 0.9;

        let solutionsWithProgess = BigInt(0);
        let expectedClears = BigInt(0);
        let maxSolutions = BigInt(0);

        let secondarySafety = 0;
        let probThisTileLeft = action.prob;  // this is used to calculate when we can prune this action

        // this is used to hold the tiles which are clears for all the possible values
        let commonClears = null;
        let validValues = 0;

        const adjFlags = board.adjacentFoundMineCount(tile);
        const adjCovered = board.adjacentCoveredCount(tile);

        for (let value = adjFlags; value <= adjCovered + adjFlags; value++) {

            const progress = divideBigInt(solutionsWithProgess, pe.finalSolutionsCount, 6);
            const bonus = 1 + (progress + probThisTileLeft) * progressContribution;
            const weight = (secondarySafety + probThisTileLeft * fiftyFiftyInfluence) * bonus;

            if (options.guessPruning && best != null && !best.dead && weight < best.weight) {
                writeToConsole("Tile (" + action.x + "," + action.y + ") is being pruned,  50/50 influence = " + fiftyFiftyInfluence + ", max score possible is " + weight);
                action.weight = weight;
                action.pruned = true;

                tile.setCovered(true);   // make sure we recover the tile
                return;
            }

            tile.setValue(value);

            const work = runProbabilityEngine(board, null);

            if (work.finalSolutionsCount > 0) {  // if this is a valid board state

                validValues++;

                if (commonClears == null) {
                    commonClears = work.localClears;
                } else {
                    commonClears = andClearTiles(commonClears, work.localClears);
                }

                //const longTermSafety = ltr.getLongTermSafety(tile, work);

                const probThisTileValue = divideBigInt(work.finalSolutionsCount, pe.finalSolutionsCount, 6);
                secondarySafety = secondarySafety + probThisTileValue * work.bestLivingProbability * fiftyFiftyInfluence;

                writeToConsole("Tile " + tile.asText() + " with value " + value + " has probability " + probThisTileValue + ", next guess safety " + work.bestLivingProbability + ", clears " + work.clearCount);

                probThisTileLeft = probThisTileLeft - probThisTileValue;
             }

            //totalSolutions = totalSolutions + work.finalSolutionsCount;
            if (work.clearCount > 0) {
                expectedClears = expectedClears + work.finalSolutionsCount * BigInt(work.clearCount);

                if (work.clearCount > linkedTilesCount) {  // this is intended to penalise tiles which are linked to other tiles. Otherwise 2 tiles give each other all progress.
                    solutionsWithProgess = solutionsWithProgess + work.finalSolutionsCount;
                }
            }

            if (work.finalSolutionsCount > maxSolutions) {
                maxSolutions = work.finalSolutionsCount;
            }

        }

        tile.setCovered(true);

        action.expectedClears = divideBigInt(expectedClears, pe.finalSolutionsCount, 6);

        const progress = divideBigInt(solutionsWithProgess, pe.finalSolutionsCount, 6);

        action.progress = progress;

        if (validValues == 1) {
            action.dead = true;
            writeToConsole("Tile " + tile.asText() + " has only only one possible value and is being marked as dead");
        }

        action.weight = secondarySafety * (1 + progress * progressContribution);
        action.maxSolutions = maxSolutions;
        action.commonClears = commonClears;

        const realSecondarySafety = (secondarySafety / fiftyFiftyInfluence).toFixed(6);  // remove the 50/50 influence to get back to the real secondary safety

        tile.setProbability(action.prob, action.progress, realSecondarySafety);

        writeToConsole("Tile " + tile.asText() + ", secondary safety = " + realSecondarySafety + ",  progress = " + action.progress + ", 50/50 influence = " + fiftyFiftyInfluence
            + ", expected clears = " + action.expectedClears + ", always clear = " + commonClears.length + ", final score = " + action.weight);

    }

    function runProbabilityEngine(board, notMines) {

        // find all the tiles which are revealed and have un-revealed / un-flagged adjacent squares
        const allCoveredTiles = [];
        const witnesses = [];
        const witnessed = [];

        let minesLeft = board.num_bombs;
        let squaresLeft = 0;

        const work = new Set();  // use a map to deduplicate the witnessed tiles

        for (let i = 0; i < board.tiles.length; i++) {

            const tile = board.getTile(i);

            if (tile.isSolverFoundBomb()) {
                minesLeft--;
                continue;  // if the tile is a flag then nothing to consider
            } else if (tile.isCovered()) {
                squaresLeft++;
                allCoveredTiles.push(tile);
                continue;  // if the tile hasn't been revealed yet then nothing to consider
            }

            const adjTiles = board.getAdjacent(tile);

            let needsWork = false;
            let minesFound = 0;
            for (let j = 0; j < adjTiles.length; j++) {
                const adjTile = adjTiles[j];
                if (adjTile.isSolverFoundBomb()) {
                    minesFound++;
                } else if (adjTile.isCovered()) {
                    needsWork = true;
                    work.add(adjTile.index);
                }
            }

            // if a witness needs work (still has hidden adjacent tiles) or is broken then add it to the mix
            if (needsWork || minesFound > tile.getValue()) {
                witnesses.push(tile);
            }

        }

        // generate an array of tiles from the map
        for (let index of work) {
            const tile = board.getTile(index);
            tile.setOnEdge(true);
            witnessed.push(tile);
        }

        //console.log("tiles left = " + squaresLeft);
        //console.log("mines left = " + minesLeft);
        //console.log("Witnesses  = " + witnesses.length);
        //console.log("Witnessed  = " + witnessed.length);

        const options = {};
        options.verbose = false;
        options.playStyle = PLAY_STYLE_EFFICIENCY;  // this forces the pe to do a complete run even if local clears are found

        const pe = new ProbabilityEngine(board, witnesses, witnessed, squaresLeft, minesLeft, options);

        // let the solution counter know which tiles mustn't contain mines
        if (notMines != null) {
            for (let tile of notMines) {
                pe.setMustBeEmpty(tile);
            }
        }

        pe.process();

        return pe;

    }

    function andClearTiles(tiles1, tiles2) {

        if (tiles1.length == 0) {
            return tiles1;
        }
        if (tiles2.length == 0) {
            return tiles2;
        }

        const result = [];
        for (let tile1 of tiles1) {
            for (let tile2 of tiles2) {
                if (tile2.isEqual(tile1)) {
                    result.push(tile1);
                    break;
                }
            }
        }

        return result;

    }

    // when looking to fix a board to be no-guess, look for witnesses which can have mines added or removed to make then no longer guesses
    function findBalancingCorrections(pe) {

        const adders = [...pe.prunedWitnesses];
        adders.sort((a, b) => adderSort(a, b));

        /*
        for (let i = 0; i < adders.length; i++) {
            const boxWitness = adders[i];
            const minesToFind = boxWitness.minesToFind;
            const spacesLeft = boxWitness.tiles.length;

            console.log(boxWitness.tile.asText() + " length " + boxWitness.tiles.length + ", add " + (spacesLeft - minesToFind) + ", remove " + minesToFind);
        }
        */

        let balanced = false;

        for (let i = 0; i < adders.length; i++) {
            const boxWitness = adders[i];

            if (findBalance(boxWitness, adders)) {
                writeToConsole("*** Balanced ***", true);
                balanced = true;
                break;
            }

        }

        if (!balanced) {
            writeToConsole("*** NOT Balanced ***", true);
            fillerTiles = [];
        }

       
    }

    function findBalance(boxWitness, adders) {

        // these are the adjustments which will all the tile to be trivially solved
        const toRemove = boxWitness.minesToFind;
        const toAdd = boxWitness.tiles.length - toRemove;

        writeToConsole("trying to balance " + boxWitness.tile.asText() + " to Remove=" + toRemove + ", or to Add=" + toAdd, true);

        top: for (let balanceBox of adders) {
            if (balanceBox.tile.isEqual(boxWitness.tile)) {
                continue;
            }

            // ensure the balancing witness doesn't overlap with this one
            for (let adjTile of board.getAdjacent(balanceBox.tile)) {
                if (adjTile.isCovered() && !adjTile.isSolverFoundBomb()) {
                    if (adjTile.isAdjacent(boxWitness.tile)) {
                        continue top;
                    }
                }
            }

            const toRemove1 = balanceBox.minesToFind;
            const toAdd1 = balanceBox.tiles.length - toRemove1;

            if (toAdd1 == toRemove) {
                writeToConsole("found balance " + balanceBox.tile.asText() + " to Add=" + toAdd1, true);
                addFillings(boxWitness, false); // remove from here
                addFillings(balanceBox, true); // add to here
                return true;
            }

            if (toRemove1 == toAdd) {
                writeToConsole("found balance " + balanceBox.tile.asText() + " to Remove=" + toRemove1, true);
                addFillings(boxWitness, true); // add to here
                addFillings(balanceBox, false); // remove from here
                return true;
            }

        }

        return false;

    }

    /*
    function collisionSafe(tile) {

        for (var adjTile of board.getAdjacent(tile)) {
            if (adjTile.isCovered() && !adjTile.isSolverFoundBomb()) {
                for (var filler of fillerTiles) {
                    if (filler.x == adjTile.x && filler.y == adjTile.y) {
                        return false;
                    }
                }
            }
        }

        return true;
    }
    */

    function adderSort(a, b) {

        // tiels with smallest area first
        let c = a.tiles.length - b.tiles.length;

        // then by the number of mines to find
        if (c == 0) {
            c = a.minesToFind - b.minesToFind;
        }

        return c;
    }

    function addFillings(boxWitness, fill) {

        for (let adjTile of boxWitness.tiles) {
            if (adjTile.isCovered() && !adjTile.isSolverFoundBomb()) {
                const filler = new Filling(adjTile.index, adjTile.x, adjTile.y, fill);
                fillerTiles.push(filler);
                //writeToConsole(filler.asText(), true);
            }
        }


    }

    function writeToConsole(text, always) {

        if (always == null) {
            always = false;
        }

        if (options.verbose || always) {
            console.log(text);
        }

    }

}

// shared functions

function formatSolutions(count) {

    if (count > maxSolutionsDisplay) {
        let work = count;
        let index = 3;
        let power = 0;
        while (work > power10n[index * 2]) {
            work = work / power10n[index];
            power = power + index;
        }

        const value = divideBigInt(work, power10n[index], 3);
        power = power + 3;

        return " Approximately " + value + " * 10<sup>" + power + "</sup> possible solutions remain.";
    } else {
        return " " + count.toLocaleString() + " possible solutions remain.";
    }

}


function combination(mines, squares) {

    return BINOMIAL.generate(mines, squares);

}

const power10n = [BigInt(1), BigInt(10), BigInt(100), BigInt(1000), BigInt(10000), BigInt(100000), BigInt(1000000), BigInt(10000000), BigInt(100000000), BigInt(1000000000)];
const power10 = [1, 10, 100, 1000, 10000, 100000, 1000000, 10000000, 100000000, 1000000000];
const maxSolutionsDisplay = BigInt("100000000000000000");

function divideBigInt(numerator, denominator, dp) {

    const work = numerator * power10n[dp] / denominator;

    const result = Number(work) / power10[dp];

    return result;
}

// location with probability of being safe
class Action {
    constructor(x, y, prob, action) {
        this.x = x;
        this.y = y;
        this.prob = prob;
        this.action = action;
        this.dead = false;
        this.pruned = false;

        // part of full analysis output, until then assume worst case 
        this.progress = 0;
        this.expectedClears;
        this.weight = prob;
        this.maxSolutions;
        this.commonClears;
    }

    asText() {

        return "(" + this.x + "," + this.y + ")";

    }

}

// location with probability of being safe
class Filling {
    constructor(index, x, y, fill) {
        this.index = index;
        this.x = x;
        this.y = y;
        this.fill = fill;  // mines left to find
    }

    asText() {

        return "(" + this.x + "," + this.y + ") Fill " + this.fill;

    }

}

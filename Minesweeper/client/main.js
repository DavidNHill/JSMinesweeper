
"use strict";

console.log('At start of main.js');

var TILE_SIZE = 24;
const DIGIT_HEIGHT = 36;
const DIGIT_WIDTH = 24;

const CYCLE_DELAY = 100;  // minimum delay in milliseconds between processing cycles

// offset 0 - 8 are the numbers and the bomb, hidden and flagged images are defined below
const BOMB = 9;
const HIDDEN = 10;
const FLAGGED = 11;
const FLAGGED_WRONG = 12;
const EXPLODED = 13;

//const PLAY_CLIENT_SIDE = (location.hostname == "");
const PLAY_CLIENT_SIDE = true;

var BINOMIAL;

// holds the images
var images = [];
var imagesLoaded = 0;
var led_images = [];

var canvasLocked = false;   // we need to lock the canvas if we are auto playing to prevent multiple threads playing the same game

var canvas = document.getElementById('myCanvas');
var ctx = canvas.getContext('2d');

var minesLeft = document.getElementById('myMinesLeft');
var ctxBombsLeft = minesLeft.getContext('2d');

var canvasHints = document.getElementById('myHints');
var ctxHints = canvasHints.getContext('2d');

var board;

myMinesLeft.width = DIGIT_WIDTH * 4;
myMinesLeft.height = DIGIT_HEIGHT;

var tooltip = document.getElementById('tooltip');
var autoPlayCheckBox = document.getElementById("autoplay");
var showHintsCheckBox = document.getElementById("showhints");
var acceptGuessesCheckBox = document.getElementById("acceptguesses");
var seedText = document.getElementById("seed");
var gameTypeSafe = document.getElementById("gameTypeSafe");
var gameTypeZero = document.getElementById("gameTypeZero");
var analysisModeButton = document.getElementById("analysismode");
var analysisButton = document.getElementById("AnalysisButton");
var messageLine = document.getElementById("messageLine");
var title = document.getElementById("title");
var lockMineCount = document.getElementById("lockMineCount");
var docPlayStyle = document.getElementById("playstyle");
var docTileSize = document.getElementById("tilesize");

// elements used in the local storage modal
var localStorageButton = document.getElementById("localStorageButton");
var localStorageModal = document.getElementById("localStorage");
var localStorageSelection = document.getElementById("localStorageSelection");

var analysisMode = false;
var previousBoardHash = 0;
/*
// add a listener for when the client exists the page
document.addEventListener("beforeunload", exiting(board), false);

function exiting(board) {

    console.log("exiting...");
	
    if (board != null) {
        killGame(board.getID());
    }

}
*/

// load the images
load_images();

// things to do to get the game up and running
async function startup() {

    console.log("At start up...");

    const urlParams = new URLSearchParams(window.location.search);
    const testParm = urlParams.get('test');
    if (testParm == "y") {
        localStorageButton.style.display = "block";
    } else {
        localStorageButton.style.display = "none";
    }

    BINOMIAL = new Binomial(50000, 100);

    /*
    var start = performance.now();
    BINOMIAL.generate(99, 240)
    //console.log(ps.generate(200, 480));
    var mid = performance.now();
    //console.log(combination(200, 480));
    combination(99, 240)
    var end = performance.now();
    console.log("fast " + (mid - start) + " slow " + (end - mid));
    */

    // add a listener for mouse clicks on the canvas
    canvas.addEventListener("mousedown", (event) => on_click(event));
    canvas.addEventListener('mousemove', followCursor, false);
    canvas.addEventListener('wheel', (event) => on_mouseWheel(event));
    minesLeft.addEventListener('wheel', (event) => on_mouseWheel_minesLeft(event));

    // build a new layout
    await newGame(30, 16, 99, 0);

    setInterval(checkBoard, 1000);

    showMessage("Welcome to minesweeper solver dedicated to Annie");
}

// launch a floating window to store/retrieve from local storage
function openLocalStorage() {

    console.log("There are " + localStorage.length + " items in local storage");

    // remove all the options from the selection
    localStorageSelection.length = 0;

    // iterate localStorage
    for (var i = 0; i < localStorage.length; i++) {

        // set iteration key name
        var key = localStorage.key(i);

        var option = document.createElement("option");
        option.text = key;
        option.value = key;
        localStorageSelection.add(option);

        // use key name to retrieve the corresponding value
        var value = localStorage.getItem(key);

        // console.log the iteration key and value
        console.log('Key: ' + key + ', Value: ' + value);

    }

    localStorageModal.style.display = "block";

}

function closeLocalStorage() {

    localStorageModal.style.display = "none";

}

function saveLocalStorage() {

    key = localStorageSelection.value;

    console.log("Saving board position to local storage key '" + key + "'");

}

function loadLocalStorage() {


}

function fetchLocalStorage() {


}



// render an array of tiles to the canvas
function renderHints(hints) {

    //console.log(hints.length + " hints to render");

    ctxHints.clearRect(0, 0, canvasHints.width, canvasHints.height);

    for (var i = 0; i < hints.length; i++) {

        var hint = hints[i];

        var bestGuess = false;
        if (hint.action == ACTION_CHORD) {
            ctxHints.fillStyle = "#00FF00";
        } else if (hint.prob == 0) {   // mine
            ctxHints.fillStyle = "#FF0000";
        } else if (hint.prob == 1) {  // safe
            ctxHints.fillStyle = "#00FF00";
        } else if (hint.dead) {  // uncertain but dead
            ctxHints.fillStyle = "black";
        } else {  //uncertain
            ctxHints.fillStyle = "orange";
            if (i == 0) {
                bestGuess = true;
            }
        }

        ctxHints.globalAlpha = 0.5;

        //console.log("Hint X=" + hint.x + " Y=" + hint.y);
        ctxHints.fillRect(hint.x * TILE_SIZE, hint.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        if (bestGuess) {
            ctxHints.fillStyle = "#00FF00";
            ctxHints.fillRect((hint.x + 0.25)* TILE_SIZE, (hint.y + 0.25) * TILE_SIZE, 0.5 * TILE_SIZE, 0.5 * TILE_SIZE);
        }

    }


}

// render an array of tiles to the canvas
function renderTiles(tiles) {

    //console.log(tiles.length + " tiles to render");

    for (var i = 0; i < tiles.length; i++) {
        var tile = tiles[i];
        var tileType = HIDDEN;

        if (tile.isBomb()) {
            if (tile.exploded) {
                tileType = EXPLODED;
            } else {
                tileType = BOMB;
            }
 
        } else if (tile.isFlagged()) {
            if (tile.isBomb() == null || tile.isBomb()) {  // isBomb() is null when the game hasn't finished
                tileType = FLAGGED;
            } else {
                tileType = FLAGGED_WRONG;
            }

        } else if (tile.isCovered()) {
            tileType = HIDDEN;

        } else {
            tileType = tile.getValue();
        }
        draw(tile.x, tile.y, tileType);
    }


}

function updateMineCount(minesLeft) {

    var d1 = minesLeft % 10;
    var work = (minesLeft - d1) / 10;

    var d2 = work % 10;
    work = (work - d2) / 10;

    var d3 = work % 10;
    work = (work - d3) / 10;

    var d4 = work % 10;

    ctxBombsLeft.drawImage(led_images[d4], 0, 0, DIGIT_WIDTH, DIGIT_HEIGHT);
    ctxBombsLeft.drawImage(led_images[d3], DIGIT_WIDTH, 0, DIGIT_WIDTH, DIGIT_HEIGHT);
    ctxBombsLeft.drawImage(led_images[d2], DIGIT_WIDTH * 2, 0, DIGIT_WIDTH, DIGIT_HEIGHT);
    ctxBombsLeft.drawImage(led_images[d1], DIGIT_WIDTH * 3, 0, DIGIT_WIDTH, DIGIT_HEIGHT);


}

async function newGame(width, height, mines, seed) {

    // don't do this until the document is fully loaded
    //console.log(document.readyState);
    //if (document.readyState != "complete") {
    //    setTimeout(newGame(width, height, mines, seed), 100);
    //    return;
    //}
 
    console.log("New game requested: Width=" + width + " Height=" + height + " Mines=" + mines);

    // let the server know the game is over
    if (board != null) {
        callKillGame(board.getID());
    }

    // this is a message to the server or local
    if (PLAY_CLIENT_SIDE) {
        var reply = getNextGameID();
    } else {
        var json_data = await fetch("/requestID");
        var reply = await json_data.json();
    }

    console.log("<== " + JSON.stringify(reply));
    var id = reply.id;

    if (gameTypeZero.checked) {
        var gameType = "zero";
    } else {
        var gameType = "safe";
    }

    if (analysisModeButton.checked) {
        title.innerHTML = "Minesweeper analyser";
        analysisMode = true;
    } else {
        title.innerHTML = "Minesweeper player";
        analysisMode = false;
    }

    var drawTile = HIDDEN;
    if (analysisMode) {
        if (document.getElementById('buildZero').checked) {
            board = new Board(id, width, height, 0, seed, gameType);
            board.setAllZero();
            drawTile = 0;
        } else {
            board = new Board(id, width, height, mines, seed, gameType);
        }
    } else {
        board = new Board(id, width, height, mines, seed, gameType);
    }

    TILE_SIZE = parseInt(docTileSize.value);

 
    //document.getElementById('canvas').style.width = (width * TILE_SIZE) + "px";
    document.getElementById('canvas').style.height = (height * TILE_SIZE + 150) + "px";

    document.getElementById('board').style.width = (width * TILE_SIZE) + "px";
    document.getElementById('board').style.height = (height * TILE_SIZE + 0) + "px";

    canvas.width = width * TILE_SIZE;
    canvas.height = height * TILE_SIZE; 

    // keep the hints and the board canvas in step
    canvasHints.width = canvas.width;
    canvasHints.height = canvas.height;

    document.getElementById('display').width = width * TILE_SIZE;;

    for (var y = 0; y < height; y++) {
        for (var x = 0; x < width; x++) {
            draw(x, y, drawTile);
        }
    }

    updateMineCount(board.num_bombs);

    canvasLocked = false;  // just in case it was still locked (after an error for example)

    showMessage("New game requested with width " + width + ", height " + height + " and " + mines + " mines.");

}

function doAnalysis() {

    console.log("Doing analysis");

    var solutionCounter = countSolutions(board);

    if (solutionCounter.finalSolutionsCount != 0) {

        if (docPlayStyle.value == "flag") {
            var playStyle = PLAY_STYLE_FLAGS;
        } else if (docPlayStyle.value == "noflag") {
            var playStyle = PLAY_STYLE_NOFLAGS;
        } else {
            var playStyle = PLAY_STYLE_EFFICIENCY;
        } 

        var noMoves = 0;
        var hints = [];

        // allow the solver to bring baxck no moves 5 times. No moves is possible when playing no-flags 
        while (noMoves < 5 && hints.length == 0) {
            noMoves++;
            hints = solver(board, playStyle);  // look for solutions
        }

        board.resetForAnalysis();
        window.requestAnimationFrame(() => renderHints(hints));
    } else {
        showMessage("The board is in an invalid state");
        window.requestAnimationFrame(() => renderHints([]));
    }

}

function checkBoard() {

    if (!analysisMode) {
        return;
    }

    var currentBoardHash = board.getHashValue();

    if (currentBoardHash == previousBoardHash) {
        return;
    } 

    previousBoardHash = currentBoardHash;

    console.log("Checking board with hash " + currentBoardHash);

    var solutionCounter = countSolutions(board);

    if (solutionCounter.finalSolutionsCount != 0) {
        analysisButton.disabled = false;
        showMessage("The board has " + solutionCounter.finalSolutionsCount + " possible solutions");
    } else {
        analysisButton.disabled = true;
        showMessage("The board is in an invalid state");
    }

}


// draw a tile to the canvas
function draw(x, y, tileType) {

    //console.log('Drawing image...');

    if (tileType == BOMB) {
        ctx.drawImage(images[0], x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);  // before we draw the bomb depress the square
    }


    ctx.drawImage(images[tileType], x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);

}

// have the tooltip follow the mouse
function followCursor(e) {

    // if not showing hints don't show tooltip
    if (!showHintsCheckBox.checked && !analysisMode) {
        tooltip.innerText = "";
        return;
    }

    //console.log("Following cursor at X=" + e.offsetX + ", Y=" + e.offsetY);

    tooltip.style.left = (TILE_SIZE + e.offsetX) + 'px';
    tooltip.style.top = (e.offsetY - TILE_SIZE * 1.5) + 'px';

    var row = Math.floor(event.offsetY / TILE_SIZE);
    var col = Math.floor(event.offsetX / TILE_SIZE);

    if (row >= board.height || row < 0 || col >= board.width || col < 0) {
        //console.log("outside of game boundaries!!");
        tooltip.innerText = "";
        return;
    } else {
        var tile = board.getTileXY(col, row);
        tooltip.innerText = tile.asText() + " " + tile.getHintText();
    }

}

// stuff to do when we click on the board
function on_click(event) {

    console.log("Click event at X=" + event.offsetX + ", Y=" + event.offsetY);

    if (board.isGameover()) {
        console.log("The game is over - no action to take");
        return;
    }

    if (canvasLocked) {
        console.log("The canvas is logically locked - this happens while the previous click is being processed");
        return;
    } 

    var row = Math.floor(event.offsetY / TILE_SIZE);
    var col = Math.floor(event.offsetX / TILE_SIZE);

    console.log("Resolved to Col=" + col + ", row=" + row);

    var message;

    if (row >= board.height || row < 0 || col >= board.width || col < 0) {
        console.log("Click outside of game boundaries!!");
        return;
    } else if (analysisMode) {  // analysis mode

        //board.resetForAnalysis();

        var button = event.which

        var tile = board.getTileXY(col, row);

        var tiles = [];

        if (button == 1) {   // left mouse button

            if (tile.isFlagged()) {  // no point clicking on an tile with a flag on it
                console.log("Tile has a flag on it - no action to take");
                return;
            }

            if (!board.isStarted()) {
                 board.setStarted();
            }

            if (tile.isCovered()) {
                var flagCount = board.adjacentFlagsCount(tile);
                tile.setValue(flagCount);
            } else {
                tile.setCovered(true);
            }

            tiles.push(tile);

        } else if (button == 3) {  // right mouse button

            if (!tile.isCovered()) {
                tile.setCovered(true);
            }

            var delta;
            if (tile.isFlagged()) {
                delta = -1;
                tile.foundBomb = false;  // in analysis mode we believe the flags are mines
            } else {
                delta = 1;
                tile.foundBomb = true;  // in analysis mode we believe the flags are mines
            }

            // if we have locked the mine count then adjust the bombs left 
            if (lockMineCount.checked) {
                if (delta == 1 && board.bombs_left == 0) {
                    showMessage("Can't reduce mines to find to below zero whilst the mine count is locked");
                    return;
                }
                board.bombs_left = board.bombs_left - delta;
                window.requestAnimationFrame(() => updateMineCount(board.bombs_left));

            } else {   // otherwise adjust the total number of bombs
                var tally = board.getFlagsPlaced();
                board.num_bombs = tally + board.bombs_left + delta;
            }

            // if the adjacent tiles values are in step then keep them in step
            var adjTiles = board.getAdjacent(tile);
            for (var i = 0; i < adjTiles.length; i++) {
                var adjTile = adjTiles[i];
                var adjFlagCount = board.adjacentFlagsPlaced(adjTile);
                if (adjTile.getValue() == adjFlagCount) {
                    adjTile.setValueOnly(adjFlagCount + delta);
                    tiles.push(adjTile);
                }
            }

            tile.toggleFlag();
            tiles.push(tile);

            console.log("Number of bombs " + board.num_bombs + "  bombs left to find " + board.bombs_left);
        }

        // update the graphical board
        window.requestAnimationFrame(() => renderTiles(tiles));

    } else {  // play mode
        var button = event.which

        var tile = board.getTileXY(col, row);

        if (button == 1) {   // left mouse button

            if (tile.isFlagged()) {  // no point clicking on an tile with a flag on it
                console.log("Tile has a flag on it - no action to take");
                return;
            }

            if (!board.isStarted()) {
                //message = {"id" : "new", "index" : board.xy_to_index(col, row), "action" : 1};
                board.setStarted();
            }

            //if (!tile.isCovered()) {  // no point clicking on an already uncovered tile
            //	console.log("Tile is already revealed - no action to take");
            //	return;
            //}

            if (!tile.isCovered()) {  // clicking on a revealed tile is considered chording
                if (board.canChord(tile)) {
                    message = { "header": board.getMessageHeader(), "actions": [{ "index": board.xy_to_index(col, row), "action": 3 }] }; //chord
                } else {
                    console.log("Tile is not able to be chorded - no action to take");
                    return;
                }

            } else {
                message = { "header": board.getMessageHeader(), "actions": [{ "index": board.xy_to_index(col, row), "action": 1 }] }; // click
            }

            //if (this.board.tiles_left == 0) {
            //	var now = new Date();
            //	var time = (now - this.start) / 1000;
            //	setTimeout("alert('time: " + time.toString() + "');", 1);
            //}
        } else if (button == 3) {  // right mouse button

            if (!tile.isCovered()) {  // no point flagging an already uncovered tile
                return;
            }

            if (!board.isStarted()) {
                console.log("Can't flag until the game has started!");
                return;
            } else {
                message = { "header": board.getMessageHeader(), "actions": [{ "index": board.xy_to_index(col, row), "action": 2 }] };
            }
        }
    }

    // we don't need to send a message if we are drawing a board in analysis mode
    if (!analysisMode) {
        // one last check before we send the message
        if (canvasLocked) {
            console.log("The canvas is logically locked");
            return;
        } else {
            canvasLocked = true;
        }

        var reply = sendActionsMessage(message);
    }

}

function on_mouseWheel(event) {

    if (!analysisMode) {
        return;
    }

    //board.resetForAnalysis();

    console.log("Mousewheel event at X=" + event.offsetX + ", Y=" + event.offsetY);

    var row = Math.floor(event.offsetY / TILE_SIZE);
    var col = Math.floor(event.offsetX / TILE_SIZE);

    console.log("Resolved to Col=" + col + ", row=" + row);

    var delta = Math.sign(event.deltaY);

    var tile = board.getTileXY(col, row);

    var flagCount = board.adjacentFlagsCount(tile);
    var covered = board.adjacentCoveredCount(tile);

    var newValue = tile.getValue() + delta;
 
    if (newValue < flagCount) {
        newValue = flagCount + covered;
    } else if (newValue > flagCount + covered) {
        newValue = flagCount;
    }

    tile.setValue(newValue);

     // update the graphical board
    window.requestAnimationFrame(() => renderTiles([tile]));

}

function on_mouseWheel_minesLeft(event) {

    if (!analysisMode) {
        return;
    }

    console.log("Mousewheel event at X=" + event.offsetX + ", Y=" + event.offsetY);

    var delta = Math.sign(event.deltaY);

    var digit = Math.floor(event.offsetX / DIGIT_WIDTH);

    console.log("Mousewheel event at X=" + event.offsetX + ", Y=" + event.offsetY + ", digit=" + digit);

    var newCount = board.bombs_left;
    if (digit == 3) {
        newCount = newCount + delta; 
    } else if (digit == 2) {
        newCount = newCount + delta * 10;
    } else if (digit == 1 || digit == 0) {
        newCount = newCount + delta * 10;
    }

    var flagsPlaced = board.getFlagsPlaced();

    if (newCount < 0) {
        board.bombs_left = 0;
        board.num_bombs = flagsPlaced;
    } else if (newCount > 9999) {
        board.bombs_left = 9999;
        board.num_bombs = 9999 + flagsPlaced;
    } else {
        board.bombs_left = newCount;
        board.num_bombs = newCount + flagsPlaced;
    }

    window.requestAnimationFrame(() => updateMineCount(board.bombs_left));

}

function buildMessageFromActions(actions, safeOnly) {

    var message = { "header": board.getMessageHeader(), "actions": [] };

    for (var i = 0; i < actions.length; i++) {

        var action = actions[i];

        if (action.action == ACTION_CHORD) {
            message.actions.push({ "index": board.xy_to_index(action.x, action.y), "action": 3 });

        } else if (action.prob == 0) {   // zero safe probability == mine
            message.actions.push({ "index": board.xy_to_index(action.x, action.y), "action": 2 });

        } else {   // otherwise we're trying to clear
            if (!safeOnly || safeOnly && action.prob == 1) {
                message.actions.push({ "index": board.xy_to_index(action.x, action.y), "action": 1 });
            }
        }
    }

    return message;

}


// send a JSON message to the server describing what action the user made
async function sendActionsMessage(message) {

    var outbound = JSON.stringify(message);

    console.log("==> " + outbound);

    // either play logcally or send to server
    if (PLAY_CLIENT_SIDE) {
        var reply = handleActions(message);
    } else {
        var json_data = await fetch("/data", {
            method: "POST",
            body: outbound,
            headers: new Headers({
                "Content-Type": "application/json"
            })
        });

        var reply = await json_data.json();
    }


    console.log("<== " + JSON.stringify(reply));

    if (board.id != reply.header.id) {
        console.log("Game when message sent " + reply.header.id + " game now " + board.id + " ignoring reply");
        canvasLocked = false;
        return;
    }

    if (board.seed == 0) {
        board.seed = reply.header.seed;
        console.log("Setting game seed to " + reply.header.seed);
        seedText.value = board.seed;
    }

    if (reply.header.status == "lost") { 
        document.getElementById("canvas").style.cursor = "default";
        board.setGameLost();
    } else if (reply.header.status == "won") {
        document.getElementById("canvas").style.cursor = "default";
        board.setGameWon();
    } 

    // translate the message and redraw the board
    var tiles = [];
    var prevMineCounter = board.bombs_left;

    // apply the changes to the logical board
    for (var i = 0; i < reply.tiles.length; i++) {

        var target = reply.tiles[i];

        var index = target.index;
        var action = target.action;

        var tile = board.getTile(index);

        if (action == 1) {    // reveal value on tile
            tile.setValue(target.value);
            tiles.push(tile);

        } else if (action == 2) {  // add or remove flag
            if (target.flag != tile.isFlagged()) {
                tile.toggleFlag();
                if (tile.isFlagged()) {
                    board.bombs_left--;
                } else {
                    board.bombs_left++;
                }
                tiles.push(tile);
            }

        } else if (action == 3) {  // a tile which is a mine (these get returned when the game is lost)
            board.setGameLost();
            tile.setBomb(true);
            tiles.push(tile);

        } else if (action == 4) {  // a tile which is a mine and is the cause of losing the game
            board.setGameLost();
            tile.setBombExploded();
            tiles.push(tile);

        } else if (action == 5) {  // a which is flagged but shouldn't be
            tile.setBomb(false);
            tiles.push(tile);

        } else {
            console.log("action " + action + " is not valid");
        }

    }

    // update the mine count if a flag has changed
    if (prevMineCounter != board.bombs_left) {
        window.requestAnimationFrame(() => updateMineCount(board.bombs_left));
    }

    // update the graphical board
    window.requestAnimationFrame(() => renderTiles(tiles));

    if (board.isGameover()) {
        console.log("Game is over according to the server");
        canvasLocked = false;
        window.requestAnimationFrame(() => renderHints([]));  // clear the hints overlay

        var value3BV = reply.header.value3BV;
        var actionsMade = reply.header.actions;

        var efficiency;
        if (reply.header.status == "won") {
            var efficiency = (100 * value3BV / actionsMade).toFixed(2) + "%";
        } else {
            var efficiency = "n/a";
        }
 

        showMessage("The game has been " + reply.header.status + ". 3BV: " + value3BV + ",  Actions: " + actionsMade + ",  Efficiency: " + efficiency);
        return;
    }

    // do we want to show hints
    if (showHintsCheckBox.checked) {

        var solverStart = Date.now();
        document.getElementById("canvas").style.cursor = "wait";

        var noMoves = 0;
        var hints = [];

        if (docPlayStyle.value == "flag") {
            var playStyle = PLAY_STYLE_FLAGS;
        } else if (docPlayStyle.value == "noflag") {
            var playStyle = PLAY_STYLE_NOFLAGS;
        } else {
            var playStyle = PLAY_STYLE_EFFICIENCY;
        } 

        // allow the solver to bring baxck no moves 5 times. No moves is possible when playing no-flags 
        while (noMoves < 5 && hints.length == 0) {
            noMoves++;
            hints = solver(board, playStyle);  // look for solutions
        }

        var solverDuration = Date.now() - solverStart;

        if (board.id != reply.header.id) {
            console.log("Game when Solver started " + reply.header.id + " game now " + board.id + " ignoring solver results");
            canvasLocked = false;
            return;
        }

        window.requestAnimationFrame(() => renderHints(hints));

        if (autoPlayCheckBox.checked) {
            if (hints.length > 0 && (hints[0].prob == 1 || hints[0].prob == 0)) {
                var message = buildMessageFromActions(hints, true);  // send all safe actions

                var wait = Math.max(0, (CYCLE_DELAY - solverDuration));

                setTimeout(function () { sendActionsMessage(message) }, wait);

            } else if (hints.length > 0 && acceptGuessesCheckBox.checked) {

                var hint = [];
                hint.push(hints[0]);

                var message = buildMessageFromActions(hint, false); // if we are guessing send only the first guess  

                var wait = Math.max(0, (CYCLE_DELAY - solverDuration));

                setTimeout(function () { sendActionsMessage(message) }, wait);

            } else {
                document.getElementById("canvas").style.cursor = "default";
                canvasLocked = false;
            }
        } else {
            document.getElementById("canvas").style.cursor = "default";
            canvasLocked = false;
        }

    } else {
        canvasLocked = false;
        window.requestAnimationFrame(() => renderHints([]));  // clear the hints overlay
        document.getElementById("canvas").style.cursor = "default";
        showMessage("The solver is not running.");
    }
 
    return reply;

}

// send a JSON message to the server asking it to kill the game
async function callKillGame(id) {

    var message = { "id": id };

    var outbound = JSON.stringify(message);
    console.log("==> " + outbound);

    // either client side or server side
    if (PLAY_CLIENT_SIDE) {
        var reply = killGame(message);   
    } else {
        var json_data = await fetch("/kill", {
            method: "POST",
            body: outbound,
            headers: new Headers({
                "Content-Type": "application/json"
            })
        });
        var reply = await json_data.json();
    }

    console.log("<== " + JSON.stringify(reply));

}

// load an image 
function load_image(image_path) {
    var image = new Image();
    image.addEventListener('load', function () {

        console.log("An image has loaded: " + image_path);
        imagesLoaded++;
        if (imagesLoaded == images.length + led_images.length) {
            startup();
        }

    }, false);
    image.src = image_path;
    return image;
}

function load_images() {

    console.log('Loading images...');

    for (var i = 0; i <= 8; i++) {
        var file_path = "resources/images/" + i.toString() + ".png";
        images.push(load_image(file_path));
        var led_path = "resources/images/led" + i.toString() + ".png";
        led_images.push(load_image(led_path));
    }

    led_images.push(load_image("resources/images/led9.png"));

    images.push(load_image("resources/images/bomb.png"));
    images.push(load_image("resources/images/facingDown.png"));
    images.push(load_image("resources/images/flagged.png"));
    images.push(load_image("resources/images/flaggedWrong.png"));
    images.push(load_image("resources/images/exploded.png"));

    console.log(images.length + ' Images Loaded');

}

function showMessage(text) {
    messageLine.innerText = text;
}
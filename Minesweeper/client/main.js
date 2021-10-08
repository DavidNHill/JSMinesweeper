
"use strict";

console.log('At start of main.js');

var TILE_SIZE = 24;
const DIGIT_HEIGHT = 38;
const DIGIT_WIDTH = 22;
const DIGITS = 5;

const CYCLE_DELAY = 100;  // minimum delay in milliseconds between processing cycles

// offset 0 - 8 are the numbers and the bomb, hidden and flagged images are defined below
const BOMB = 9;
const HIDDEN = 10;
const FLAGGED = 11;
const FLAGGED_WRONG = 12;
const EXPLODED = 13;

//const PLAY_CLIENT_SIDE = (location.hostname == "");
const PLAY_CLIENT_SIDE = true;

const GAME_DESCRIPTION_KEY = "CURRENT_GAME_DESCRIPTION";
const GAME_BOARD_STATE_KEY = "CURRENT_GAME_BOARD_STATE";

var BINOMIAL;

// holds the images
var images = [];
var imagesLoaded = 0;
var led_images = [];

var canvasLocked = false;   // we need to lock the canvas if we are auto playing to prevent multiple threads playing the same game

var canvas = document.getElementById('myCanvas');
var ctx = canvas.getContext('2d');

var docMinesLeft = document.getElementById('myMinesLeft');
var ctxBombsLeft = docMinesLeft.getContext('2d');

var canvasHints = document.getElementById('myHints');
var ctxHints = canvasHints.getContext('2d');

var currentGameDescription;

var analysisBoard;
var gameBoard;
var board;

var oldrng = false;

docMinesLeft.width = DIGIT_WIDTH * DIGITS;
docMinesLeft.height = DIGIT_HEIGHT;

var tooltip = document.getElementById('tooltip');
var autoPlayCheckBox = document.getElementById("autoplay");
var showHintsCheckBox = document.getElementById("showhints");
var acceptGuessesCheckBox = document.getElementById("acceptguesses");
var seedText = document.getElementById("seed");
var gameTypeSafe = document.getElementById("gameTypeSafe");
var gameTypeZero = document.getElementById("gameTypeZero");
//var analysisModeButton = document.getElementById("analysismode");
var switchButton = document.getElementById("switchButton");
var analysisButton = document.getElementById("AnalysisButton");
var messageLine = document.getElementById("messageLine");
var title = document.getElementById("title");
var lockMineCount = document.getElementById("lockMineCount");
var docPlayStyle = document.getElementById("playstyle");
var docTileSize = document.getElementById("tilesize");
var docFastPlay = document.getElementById("fastPlay");
var docNgMode = document.getElementById("noGuessMode");

var downloadHyperlink = document.getElementById('downloadmbf');

// elements used in the local storage modal
var localStorageButton = document.getElementById("localStorageButton");
var localStorageModal = document.getElementById("localStorage");
var localStorageSelection = document.getElementById("localStorageSelection");

//properties panel
var propertiesPanel = document.getElementById("properties");

// elements used in the no guess build modal
var ngModal = document.getElementById("noGuessBuilder");
var ngText = document.getElementById("ngText");

var analysisMode = false;
var previousBoardHash = 0;
var justPressedAnalyse = false;
var dragging = false;  //whether we are dragging the cursor
var dragTile;          // the last tile dragged over
var hoverTile;         // tile the mouse last moved over
var analysing = false;  // try and prevent the analyser running twice if pressed more than once


// things to do when exiting the page
function exiting() {

    console.log("exiting...");

    if (currentGameDescription != null) {
        //localStorage.setItem(GAME_DESCRIPTION_KEY, JSON.stringify(currentGameDescription));
    }

    if (board != null) {
        killGame(board.getID());
    }

    return "";
}


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

    const rngParm = urlParams.get('rng');
    if (rngParm == "old") {
        oldrng = true;
        console.log("Using old rng");
    }

    var seed = urlParams.get('seed');
    if (seed == null) {
        seed = 0;
    } else {
        seedText.value = seed;
    }

    var start = urlParams.get('start');


    BINOMIAL = new Binomial(50000, 200);

    window.addEventListener("beforeunload", (event) => exiting(event));

    // add a listener for mouse clicks on the canvas
    canvas.addEventListener("mousedown", (event) => on_click(event));
    canvas.addEventListener("mouseup", (event) => mouseUpEvent(event));
    canvas.addEventListener('mousemove', (event) => followCursor(event));
    canvas.addEventListener('wheel', (event) => on_mouseWheel(event));
    canvas.addEventListener('mouseenter', (event) => on_mouseEnter(event));
    canvas.addEventListener('mouseleave', (event) => on_mouseLeave(event));

    docMinesLeft.addEventListener('wheel', (event) => on_mouseWheel_minesLeft(event));

    // add some hot key 
    document.addEventListener('keyup', event => { keyPressedEvent(event) });

    currentGameDescription = localStorage.getItem(GAME_DESCRIPTION_KEY);

    // make the properties div draggable
    dragElement(propertiesPanel);
    propertiesClose();

    // initialise the solver
    await solver();

    // create an initial analysis board
    analysisBoard = new Board(1, 30, 16, 0, seed, "");
    analysisBoard.setAllZero();

    if (currentGameDescription != null) {
        var gameDescription = JSON.parse(currentGameDescription);
        console.log(gameDescription);
        await newGame(gameDescription.width, gameDescription.height, gameDescription.mines, gameDescription.seed);

    } else {
        await newGame(30, 16, 99, seed); // default to a new expert game
    }

    setInterval(checkBoard, 1000);

    if (start != null) {
        showHintsCheckBox.checked = false;
        var tile = board.getTile(start);
        var message = buildMessageFromActions([new Action(tile.x, tile.y, 1, ACTION_CLEAR)], true);
        await sendActionsMessage(message);
        board.setStarted();
    }

    //bulkRun(5678, 1000);

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

function propertiesClose() {
    propertiesPanel.style.display = "none";
}

function propertiesOpen() {
    propertiesPanel.style.display = "block";
}

// save as MBF
/*
async function saveAsMBF() {

    if (board == null) {
        return;
    }

    var mbf = board.getFormatMBF();

    const options = {
        excludeAcceptAllOption: true,
        types: [
            {
                description: 'Minesweeper board',
                accept: {
                    'application/octet-stream': ['.mbf'],
                },
            },
        ],
    };
    const fileHandle = await window.showSaveFilePicker(options);

    const writable = await fileHandle.createWritable();

    await writable.write(mbf);

    await writable.close();

}
*/

// download as MBF
// create a BLOB of the data, insert a URL to it into the download link
async function downloadAsMBF() {

    // if we are in analysis mode then create the url, otherwise the url was created when the game was generated
    if (analysisMode) {
        if (board == null) {
            return;
        }

        var mbf = board.getFormatMBF();

        if (mbf == null) {
            return;
        }

        var blob = new Blob([mbf], { type: 'application/octet-stream' })

        var url = URL.createObjectURL(blob);

        console.log(url);

        downloadHyperlink.href = url;  // Set the url ready to be downloaded

        setTimeout(function () { console.log("Revoked " + url); URL.revokeObjectURL(url) }, 10000, url);
    }

    // create a download name based on the date/time
    var now = new Date();

    var filename = "Download" + now.toISOString() + ".mbf";

    downloadHyperlink.download = filename;

}

function switchToAnalysis(doAnalysis) {

    if (doAnalysis) {
        gameBoard = board;
        board = analysisBoard;

        showDownloadLink(true, "")  // display the hyperlink

        title.innerHTML = "Minesweeper analyser";  // change the title
        switchButton.innerHTML = "Switch to Player";
    } else {
        analysisBoard = board;
        board = gameBoard;

        showDownloadLink(false, "")  // hide the hyperlink (we don't have the url until we play a move - this could be improved)

        title.innerHTML = "Minesweeper player"; // change the title
        switchButton.innerHTML = "Switch to Analyser";
    }

    resizeCanvas(board.width, board.height);

    browserResized();

    renderHints([]);  // clear down hints

    renderTiles(board.tiles); // draw the board

    updateMineCount(board.bombs_left);  // reset the mine count

    analysisMode = doAnalysis;
}

// render an array of tiles to the canvas
function renderHints(hints, otherActions) {

    //console.log(hints.length + " hints to render");

    ctxHints.clearRect(0, 0, canvasHints.width, canvasHints.height);

    if (hints == null) {
        return;
    }

    var firstGuess = 0;  // used to identify the first (best) guess, subsequent guesses are just for info 
    for (var i = 0; i < hints.length; i++) {

        var hint = hints[i];

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
            if (firstGuess == 0) {
                firstGuess = 1;
            }
        }

        ctxHints.globalAlpha = 0.5;

        //console.log("Hint X=" + hint.x + " Y=" + hint.y);
        ctxHints.fillRect(hint.x * TILE_SIZE, hint.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        if (firstGuess == 1) {
            ctxHints.fillStyle = "#00FF00";
            ctxHints.fillRect((hint.x + 0.25) * TILE_SIZE, (hint.y + 0.25) * TILE_SIZE, 0.5 * TILE_SIZE, 0.5 * TILE_SIZE);
            firstGuess = 2;
        }

    }

    if (otherActions == null) {
        return;
    }

    ctxHints.globalAlpha = 1;
    // these are from the efficiency play style and are the known moves which haven't been made
    for (var action of otherActions) {
        if (action.action == ACTION_CLEAR) {
            ctxHints.fillStyle = "#00FF00";
        } else {
            ctxHints.fillStyle = "#FF0000";
        }
        ctxHints.fillRect((action.x + 0.35) * TILE_SIZE, (action.y + 0.35) * TILE_SIZE, 0.3 * TILE_SIZE, 0.3 * TILE_SIZE);
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

    var work = minesLeft;
    var digits = getDigitCount(minesLeft);

    var position = digits - 1;

    docMinesLeft.width = DIGIT_WIDTH * digits;

    for (var i = 0; i < DIGITS; i++) {

        var digit = work % 10;
        work = (work - digit) / 10;

        ctxBombsLeft.drawImage(led_images[digit], DIGIT_WIDTH * position + 2, 2, DIGIT_WIDTH - 4, DIGIT_HEIGHT - 4);

        position--;
    }

}

function getDigitCount(mines) {

    var digits;
    if (mines < 1000) {
        digits = 3;
    } else if (mines < 10000) {
        digits = 4;
    } else {
        digits = 5;
    }

    return digits;
}

// display or hide the download link 
function showDownloadLink(show, url) {

    if (show) {
        downloadHyperlink.style.display = "block";
        if (url != null) {
            downloadHyperlink.href = url;
        }

    } else {
        downloadHyperlink.style.display = "none";
    }

}

async function bulkRun(runSeed, size) {

    var options = {};
    options.playStyle = PLAY_STYLE_NOFLAGS;
    options.verbose = false;
    options.advancedGuessing = true;

    var startTime = Date.now();

    var played = 0;
    var won = 0;

    var rng = JSF(runSeed);  // create an RNG based on the seed
    var startIndex = 0;


    while (played < size) {

        played++;

        var gameSeed = rng() * Number.MAX_SAFE_INTEGER;

        console.log(gameSeed);

        var game = new ServerGame(0, 30, 16, 99, startIndex, gameSeed, "safe");

        var board = new Board(0, 30, 16, 99, gameSeed, "safe");

        var tile = game.getTile(startIndex);

        var revealedTiles = game.clickTile(tile);
        applyResults(board, revealedTiles);  // this is in MinesweeperGame.js

        var guessed = false;
        var loopCheck = 0;
        while (revealedTiles.header.status == IN_PLAY) {

            loopCheck++;

            if (loopCheck > 10000) {
                break;
            }

            var reply = await solver(board, options);  // look for solutions

            var actions = reply.actions;

            for (var i = 0; i < actions.length; i++) {

                var action = actions[i];

                if (action.action == ACTION_CHORD) {
                    console.log("Got a chord request!");

                } else if (action.action == ACTION_FLAG) {   // zero safe probability == mine
                    console.log("Got a flag request!");

                } else {   // otherwise we're trying to clear

                    tile = game.getTile(board.xy_to_index(action.x, action.y));

                    revealedTiles = game.clickTile(tile);

                    if (revealedTiles.header.status != IN_PLAY) {  // if won or lost nothing more to do
                        break;
                    }

                    applyResults(board, revealedTiles);

                    if (action.prob != 1) {  // do no more actions after a guess
                    	break;
                    }
                }
            }

        }

        console.log(revealedTiles.header.status);

        if (revealedTiles.header.status == WON) {
            won++;
        }

    }


    console.log("Played " + played + " won " + won);


    return game;

}

async function playAgain() {

    // let the server know the game is over
    if (board != null && !analysisMode) {
        callKillGame(board.getID());

        var reply = copyGame(board.getID());

        var id = reply.id;

        board = new Board(id, board.width, board.height, board.num_bombs, board.seed, board.gameType);

        TILE_SIZE = parseInt(docTileSize.value);

        /*
        // make the canvases large enough to fit the game
        var boardWidth = board.width * TILE_SIZE;
        var boardHeight = board.height * TILE_SIZE;

        canvas.width = boardWidth;
        canvas.height = boardHeight;

        canvasHints.width = boardWidth;
        canvasHints.height = boardHeight;
        */

        resizeCanvas(board.width, board.height);

        browserResized();

        for (var y = 0; y < board.height; y++) {
            for (var x = 0; x < board.width; x++) {
                draw(x, y, HIDDEN);
            }
        }

        updateMineCount(board.num_bombs);

        canvasLocked = false;  // just in case it was still locked (after an error for example)

        showMessage("Replay game requested");
    } else {
        showMessage("No game to replay");
    }

}

async function newGameFromBlob(blob) {

    const buffer = await blob.arrayBuffer();

    const view = new Uint8Array(buffer);

    console.log(...view);

    // let the server know the game is over
    if (board != null) {
        callKillGame(board.getID());
    }

    var width = view[0];
    var height = view[1];
    var mines = view[2] * 256 + view[3];

    var reply = createGameFromMFB(view);

    var id = reply.id;

    if (gameTypeZero.checked) {
        var gameType = "zero";
    } else {
        var gameType = "safe";
    }

    board = new Board(id, width, height, mines, "", gameType);

    TILE_SIZE = parseInt(docTileSize.value);

    resizeCanvas(board.width, board.height);

    showDownloadLink(false, ""); // remove the download link

    browserResized();

    for (var y = 0; y < board.height; y++) {
        for (var x = 0; x < board.width; x++) {
            draw(x, y, HIDDEN);
        }
    }

    updateMineCount(board.num_bombs);

    canvasLocked = false;  // just in case it was still locked (after an error for example)

    showMessage("Game created from file");
 
}

async function newGame(width, height, mines, seed) {

    console.log("New game requested: Width=" + width + " Height=" + height + " Mines=" + mines + " Seed=" + seed);

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

    /*
    if (analysisModeButton.checked) {
        title.innerHTML = "Minesweeper analyser";
        analysisMode = true;
        lockMineCount.checked = false;  // don't lock the mine count when the board is reset

        showDownloadLink(true, "");
    } else {
        title.innerHTML = "Minesweeper player";
        analysisMode = false;

        showDownloadLink(false, "");
    }
    */

    if (analysisMode) {
        lockMineCount.checked = false;  // don't lock the mine count when the board is reset
        showDownloadLink(true, "");
    } else {
        showDownloadLink(false, "");
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

    resizeCanvas(width, height);

    browserResized();

    for (var y = 0; y < height; y++) {
        for (var x = 0; x < width; x++) {
            draw(x, y, drawTile);
        }
    }

    updateMineCount(board.num_bombs);

    canvasLocked = false;  // just in case it was still locked (after an error for example)

    showMessage("New game requested with width " + width + ", height " + height + " and " + mines + " mines.");

}

function changeTileSize() {

    TILE_SIZE = parseInt(docTileSize.value);

    console.log("Changing tile size to " + TILE_SIZE);

    resizeCanvas(board.width, board.height);  // resize the canvas

    browserResized();  // do we need scroll bars?

    renderTiles(board.tiles); // draw the board

    //updateMineCount(board.bombs_left);  // reset the mine count

}

    // make the canvases large enough to fit the game
function resizeCanvas(width, height) {

    var boardWidth = width * TILE_SIZE;
    var boardHeight = height * TILE_SIZE;

    canvas.width = boardWidth;
    canvas.height = boardHeight;

    canvasHints.width = boardWidth;
    canvasHints.height = boardHeight;

}

function browserResized() {

    var boardElement = document.getElementById('board');

    var boardWidth = board.width * TILE_SIZE;
    var boardHeight = board.height * TILE_SIZE;

    var screenWidth = document.getElementById('canvas').offsetWidth - 10;
    var screenHeight = document.getElementById('canvas').offsetHeight - 60 - 20;   // subtract some space to allow for the mine count panel and the hyperlink

    //console.log("Available size is " + screenWidth + " x " + screenHeight);

    // decide screen size and set scroll bars
    if (boardWidth > screenWidth && boardHeight > screenHeight) {  // both need scroll bars
        var useWidth = screenWidth;
        var useHeight = screenHeight;
        boardElement.style.overflowX = "scroll";
        boardElement.style.overflowY = "scroll";

        var scrollbarYWidth = 0;    
        var scrollbarXHeight = 0;

    } else if (boardWidth > screenWidth) {  // need a scroll bar on the bottom
        var useWidth = screenWidth;
        boardElement.style.overflowX = "scroll";

        var scrollbarXHeight = boardElement.offsetHeight - boardElement.clientHeight - 10;
        var scrollbarYWidth = 0;

        if (boardHeight + scrollbarXHeight > screenHeight) {  // the scroll bar has made the height to large now !
            var useHeight = screenHeight;
            boardElement.style.overflowY = "scroll";
            var scrollbarXHeight = 0;
        } else {
            var useHeight = boardHeight;
            boardElement.style.overflowY = "hidden";
        }

    } else if (boardHeight > screenHeight) {  // need a scroll bar on the right
        var useHeight = screenHeight;
        boardElement.style.overflowY = "scroll";

        var scrollbarYWidth = boardElement.offsetWidth - boardElement.clientWidth - 10;
        var scrollbarXHeight = 0;

        if (boardWidth + scrollbarYWidth > screenWidth) {  // the scroll bar has made the width to large now !
            var useWidth = screenWidth;
            var scrollbarYWidth = 0;
            boardElement.style.overflowX = "scroll";
        } else {
            var useWidth = boardWidth;
            boardElement.style.overflowX = "hidden";
        }

    } else {
        var useWidth = boardWidth;
        boardElement.style.overflowX = "hidden";
        var useHeight = boardHeight;
        boardElement.style.overflowY = "hidden";
        var scrollbarYWidth = 0;
        var scrollbarXHeight = 0;
    }

    //console.log("Usable size is " + useWidth + " x " + useHeight);
    //console.log("Scroll bar Y width  " + scrollbarYWidth);
    //console.log("Scroll bar X Height  " + scrollbarXHeight);

    // change the size of the viewable frame
    boardElement.style.width = (useWidth + scrollbarYWidth) + "px";
    boardElement.style.height = (useHeight + scrollbarXHeight) + "px";

    document.getElementById("display").style.width = (useWidth + scrollbarYWidth) + "px";

}

function keyPressedEvent(e) {

    //console.log("Key pressed: " + e.key);
    var newValue = null;
    if (e.key == 'a') {
        if (!analysisButton.disabled) {  // don't allow the hotkey if the button is disabled
            doAnalysis();
        }

    } else if (analysisMode) {
        if (e.key == 'l') {   // 'L'
            lockMineCount.checked = !lockMineCount.checked;
        } else if (e.key == '0') {
            newValue = 0;
        } else if (e.key == '1') {  // '1'
            newValue = 1;
        } else if (e.key == '2') {
            newValue = 2;
        } else if (e.key == '3') {
            newValue = 3;
        } else if (e.key == '4') {
            newValue = 4;
        } else if (e.key == '5') {
            newValue = 5;
        } else if (e.key == '6') {
            newValue = 6;
        } else if (e.key == '7') {
            newValue = 7;
        } else if (e.key == '8') {
            newValue = 8;
        } else if (e.key == 'h') {
            var tile = hoverTile;
            tile.setCovered(true);
            window.requestAnimationFrame(() => renderTiles([tile]));
        } else if (e.key == 'f') {
            var tile = hoverTile;
            var tilesToUpdate = analysis_toggle_flag(tile);
            window.requestAnimationFrame(() => renderTiles(tilesToUpdate));
        }
    } else {
        if (e.key == ' ' && board.isGameover()) {
            apply();  // this is in the index.html file
        }
    }

    if (newValue == null) {
        return;
    }

    var tile = hoverTile;

    console.log('tile is' + tile);
    // can't replace a flag
    if (tile == null || tile.isFlagged()) {
        return;
    }

    var flagCount = board.adjacentFoundMineCount(tile);
    var covered = board.adjacentCoveredCount(tile);

    // check it is a legal value
    if (newValue < flagCount || newValue > flagCount + covered) {
        return;
    }

    tile.setValue(newValue);

    // update the graphical board
    window.requestAnimationFrame(() => renderTiles([tile]));

}

async function sleep(msec) {
    return new Promise(resolve => setTimeout(resolve, msec));
}

async function doAnalysis() {

    if (canvasLocked) {
        console.log("Already analysing... request rejected");
        return;
    } else {
        console.log("Doing analysis");
        canvasLocked = true;
    }

    // put out a message and wait long enough for the ui to update
    showMessage("Analysing...");
    await sleep(1);

    // this will set all the obvious mines which makes the solution counter a lot more efficient on very large boards
    board.resetForAnalysis();
    board.findAutoMove();
 
    var solutionCounter = solver.countSolutions(board);

    if (solutionCounter.finalSolutionsCount != 0) {

        var options = {};
        if (docPlayStyle.value == "flag") {
            options.playStyle = PLAY_STYLE_FLAGS;
        } else if (docPlayStyle.value == "noflag") {
            options.playStyle = PLAY_STYLE_NOFLAGS;
        } else {
            options.playStyle = PLAY_STYLE_EFFICIENCY;
        } 

        //var hints = solver(board, options).actions;  // look for solutions

        var solve = await solver(board, options);  // look for solutions
        var hints = solve.actions;

        justPressedAnalyse = true;

        window.requestAnimationFrame(() => renderHints(hints, solve.other));
    } else {
        showMessage("The board is in an invalid state");
        window.requestAnimationFrame(() => renderHints([], []));
    }

    // by delaying removing the logical lock we absorb any secondary clicking of the button / hot key
    setTimeout(function () { canvasLocked = false; }, 200);
    //canvasLocked = false;

}

async function checkBoard() {

    if (!analysisMode) {
        return;
    }

    // this will set all the obvious mines which makes the solution counter a lot more efficient on very large boards
    board.resetForAnalysis();
 
    var currentBoardHash = board.getHashValue();

    if (currentBoardHash == previousBoardHash) {
        return;
    } 

    previousBoardHash = currentBoardHash;

    console.log("Checking board with hash " + currentBoardHash);

    board.findAutoMove();
    var solutionCounter = await solver.countSolutions(board);
    board.resetForAnalysis();

    if (solutionCounter.finalSolutionsCount != 0) {
        analysisButton.disabled = false;
        //showMessage("The board has" + solutionCounter.finalSolutionsCount + " possible solutions");
        showMessage("The board is valid. " + board.getFlagsPlaced() + " Mines placed. " + formatSolutions(solutionCounter.finalSolutionsCount));
        
    } else {
        analysisButton.disabled = true;
        showMessage("The board is in an invalid state. " + board.getFlagsPlaced() + " Mines placed. ");
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

    // get the tile we're over
    var row = Math.floor(event.offsetY / TILE_SIZE);
    var col = Math.floor(event.offsetX / TILE_SIZE);
    hoverTile = board.getTileXY(col, row);

    // if not showing hints don't show tooltip
    if (!showHintsCheckBox.checked && !analysisMode && !justPressedAnalyse) {
        tooltip.innerText = "";
        return;
    }

    //console.log("Following cursor at X=" + e.offsetX + ", Y=" + e.offsetY);

    tooltip.style.left = (TILE_SIZE + e.clientX - 220) + 'px';
    tooltip.style.top = (e.clientY - TILE_SIZE * 1.5 - 70) + 'px';

    if (dragging && analysisMode) {

        var tile = hoverTile;

        if (!tile.isEqual(dragTile)) {

            dragTile = tile;  // remember the latest tile

            if (tile.isCovered()) {
                var flagCount = board.adjacentFoundMineCount(tile);
                tile.setValue(flagCount);
            } else {
                tile.setCovered(true);
            }

            // update the graphical board
            window.requestAnimationFrame(() => renderTiles([tile]));
        }

    }

    if (row >= board.height || row < 0 || col >= board.width || col < 0) {
        //console.log("outside of game boundaries!!");
        tooltip.innerText = "";
        tooltip.style.display = "none";
        return;
    } else {
        var tile = board.getTileXY(col, row);
        tooltip.innerText = tile.asText() + " " + tile.getHintText();
        tooltip.style.display = "inline-block";
    }

}

function mouseUpEvent(e) {
    if (dragging && e.which == 1) {
        console.log("Dragging stopped due to  mouse up event");
        dragging = false;
    }
}

function on_mouseEnter(e) {

    tooltip.style.display = "inline-block";
 
}

function on_mouseLeave(e) {

    hoverTile = null;

    tooltip.style.display = "none";

    if (dragging) {
        console.log("Dragging stopped due to mouse off canvas");
        dragging = false;
    }

}

// stuff to do when we click on the board
function on_click(event) {

    //console.log("Click event at X=" + event.offsetX + ", Y=" + event.offsetY);

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

    //console.log("Resolved to Col=" + col + ", row=" + row);

    var message;

    if (row >= board.height || row < 0 || col >= board.width || col < 0) {
        console.log("Click outside of game boundaries!!");
        return;

    } else if (analysisMode) {  // analysis mode

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

            // allow for dragging and remember the tile we just changed
            dragging = true;
            dragTile = tile;

            if (tile.isCovered()) {
                var flagCount = board.adjacentFoundMineCount(tile);
                tile.setValue(flagCount);
            } else {
                tile.setCovered(true);
            }

            tiles.push(tile);

        } else if (button == 3) {  // right mouse button

            // toggle the flag and return the tiles which need to be redisplayed
            tiles = analysis_toggle_flag(tile);

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

        justPressedAnalyse = false;

        var reply = sendActionsMessage(message);
    }

}

/**
 * toggle the flag and update any adjacent tiles
 * Return the tiles which need to be redisplayed
 */
function analysis_toggle_flag(tile) {

    var tiles = [];

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
            return tiles;
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

    return tiles;
}


function on_mouseWheel(event) {

    if (!analysisMode) {
        return;
    }

    //board.resetForAnalysis();

    //console.log("Mousewheel event at X=" + event.offsetX + ", Y=" + event.offsetY);

    var row = Math.floor(event.offsetY / TILE_SIZE);
    var col = Math.floor(event.offsetX / TILE_SIZE);

    //console.log("Resolved to Col=" + col + ", row=" + row);

    var delta = Math.sign(event.deltaY);

    var tile = board.getTileXY(col, row);

    var flagCount = board.adjacentFoundMineCount(tile);
    var covered = board.adjacentCoveredCount(tile);

    if (tile.isCovered()) {
        newValue = flagCount;
    } else {
        var newValue = tile.getValue() + delta;
    }
 
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

    //console.log("Mousewheel event at X=" + event.offsetX + ", Y=" + event.offsetY);

    var delta = Math.sign(event.deltaY);

    var digit = Math.floor(event.offsetX / DIGIT_WIDTH);

    //console.log("Mousewheel event at X=" + event.offsetX + ", Y=" + event.offsetY + ", digit=" + digit);

    var newCount = board.bombs_left;

    var digits = getDigitCount(newCount);

    if (digit == digits - 1) {
        newCount = newCount + delta; 
    } else if (digit == digits - 2) {
        newCount = newCount + delta * 10;
    } else {
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

// reads a file dropped onto the top of the minesweeper board
async function dropHandler(ev) {
    console.log('File(s) dropped');

    // Prevent default behavior (Prevent file from being opened)
    ev.preventDefault();

    if (ev.dataTransfer.items) {
        console.log("Using Items Data Transfer interface");
        // Use DataTransferItemList interface to access the file(s)
        for (var i = 0; i < ev.dataTransfer.items.length; i++) {
            // If dropped items aren't files, reject them
            if (ev.dataTransfer.items[i].kind === 'file') {
                var file = ev.dataTransfer.items[i].getAsFile();
                console.log('... file[' + i + '].name = ' + file.name);

                newGameFromBlob(file)

                break;
            }
        }
    } else {
        // Use DataTransfer interface to access the file(s)
        console.log("Using File Transfer Interface");
        for (var i = 0; i < ev.dataTransfer.files.length; i++) {
            console.log('... file[' + i + '].name = ' + ev.dataTransfer.files[i].name);
        }
    }
}

// Prevent default behavior (Prevent file from being opened)
function dragOverHandler(ev) {
    //console.log('File(s) in drop zone');
    ev.preventDefault();
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

    // either play locally or send to server
    if (PLAY_CLIENT_SIDE) {
        var reply = await handleActions(message);
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
    //console.log(reply.header);

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

    if (reply.tiles.length == 0) {
        showMessage("Unable to continue");
        document.getElementById("canvas").style.cursor = "default";
        canvasLocked = false;
        return;
    }

    // add the hyperlink the hyperlink
    if (reply.header.url != null) {
        showDownloadLink(true, reply.header.url);
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
        window.requestAnimationFrame(() => renderHints([], []));  // clear the hints overlay

        var value3BV = reply.header.value3BV;
        var actionsMade = reply.header.actions;

        var efficiency;
        if (reply.header.status == "won") {
            var efficiency = (100 * value3BV / actionsMade).toFixed(2) + "%";
        } else {
            var efficiency = "n/a";
        }

        // if the current game is no longer in play then no need to remember the games details
        currentGameDescription = null;
        localStorage.removeItem(GAME_DESCRIPTION_KEY);

        showMessage("The game has been " + reply.header.status + ". 3BV: " + value3BV + ",  Actions: " + actionsMade + ",  Efficiency: " + efficiency);
        return;
    }

    var solverStart = Date.now();

    var assistedPlay = docFastPlay.checked;
    var assistedPlayHints;
    if (assistedPlay) {
        assistedPlayHints = board.findAutoMove();
        if (assistedPlayHints.length == 0) {
            assistedPlay = false;
        }
    } else {
        assistedPlayHints = [];
    }

    // do we want to show hints
    if (showHintsCheckBox.checked || autoPlayCheckBox.checked || assistedPlayHints.length != 0) {

        document.getElementById("canvas").style.cursor = "wait";

        var options = {};
        if (docPlayStyle.value == "flag") {
            options.playStyle = PLAY_STYLE_FLAGS;
        } else if (docPlayStyle.value == "noflag") {
            options.playStyle = PLAY_STYLE_NOFLAGS;
        } else {
            options.playStyle = PLAY_STYLE_EFFICIENCY;
        } 

        var hints;
        var other;
        if (assistedPlay) {
            hints = assistedPlayHints;
            other = [];
        } else {
            var solve = await solver(board, options);  // look for solutions
            hints = solve.actions;
            other = solve.other;
        }

        var solverDuration = Date.now() - solverStart;

        if (board.id != reply.header.id) {
            console.log("Game when Solver started " + reply.header.id + " game now " + board.id + " ignoring solver results");
            canvasLocked = false;
            return;
        }

        //console.log("Rendering " + hints.length + " hints");
        //setTimeout(function () { window.requestAnimationFrame(() => renderHints(hints)) }, 10);  // wait 10 milliseconds to prevent a clash with the renderTiles redraw

        // only show the hints if the hint box is checked
        if (showHintsCheckBox.checked) {
            window.requestAnimationFrame(() => renderHints(hints, other));
        } else {
            window.requestAnimationFrame(() => renderHints([], []));  // clear the hints overlay
            showMessage("Press the 'Analyse' button to see the solver's suggested move.");
        }

        if (autoPlayCheckBox.checked || assistedPlay) {
            if (hints.length > 0 && (hints[0].prob == 1 || hints[0].prob == 0)) {
                var message = buildMessageFromActions(hints, true);  // send all safe actions

                var wait = Math.max(0, (CYCLE_DELAY - solverDuration));

                setTimeout(function () { sendActionsMessage(message) }, wait);

            } else if (hints.length > 0 && acceptGuessesCheckBox.checked) { // if we are accepting guesses

                var hint = [];
                hint.push(hints[0]);

                var message = buildMessageFromActions(hint, false); // if we are guessing send only the first guess  

                var wait = Math.max(0, (CYCLE_DELAY - solverDuration));

                setTimeout(function () { sendActionsMessage(message) }, wait);

            } else {
                document.getElementById("canvas").style.cursor = "default";
                canvasLocked = false;
                currentGameDescription = reply.header;
            }
        } else {
            document.getElementById("canvas").style.cursor = "default";
            canvasLocked = false;
            currentGameDescription = reply.header;
        }

    } else {
        canvasLocked = false;
        window.requestAnimationFrame(() => renderHints([], []));  // clear the hints overlay
        document.getElementById("canvas").style.cursor = "default";
        showMessage("The solver is not running. Press the 'Analyse' button to see the solver's suggested move.");
        currentGameDescription = reply.header;
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

// generic function to make a div dragable (https://www.w3schools.com/howto/howto_js_draggable.asp)
function dragElement(elmnt) {
    var pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    if (document.getElementById(elmnt.id + "Header")) {
        // if present, the header is where you move the DIV from:
        document.getElementById(elmnt.id + "Header").onmousedown = dragMouseDown;
    } else {
        // otherwise, move the DIV from anywhere inside the DIV:
        elmnt.onmousedown = dragMouseDown;
    }

    function dragMouseDown(e) {
        e = e || window.event;
        e.preventDefault();
        // get the mouse cursor position at startup:
        pos3 = e.clientX;
        pos4 = e.clientY;
        //console.log("Pos3=" + pos3 + ", Pos4=" + pos4);
        document.onmouseup = closeDragElement;
        // call a function whenever the cursor moves:
        document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
        e = e || window.event;
        e.preventDefault();
        // calculate the new cursor position:
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        //console.log("Pos1=" + pos1 + ", Pos2=" + pos2);
        pos3 = e.clientX;
        pos4 = e.clientY;
        // set the element's new position:
        elmnt.style.top = (elmnt.offsetTop - pos2 - 25) + "px";
        elmnt.style.left = (elmnt.offsetLeft - pos1 - 5) + "px";
    }

    function closeDragElement() {
        // stop moving when mouse button is released:
        document.onmouseup = null;
        document.onmousemove = null;
    }
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
        var led_path = "resources/images/led" + i.toString() + ".svg";
        led_images.push(load_image(led_path));
    }

    led_images.push(load_image("resources/images/led9.svg"));

    images.push(load_image("resources/images/bomb.png"));
    images.push(load_image("resources/images/facingDown.png"));
    images.push(load_image("resources/images/flagged.png"));
    images.push(load_image("resources/images/flaggedWrong.png"));
    images.push(load_image("resources/images/exploded.png"));

    console.log(images.length + ' Images Loaded');

}

function showMessage(text) {
    messageLine.innerText = text;
    messageLine.innerHTML = text;
}
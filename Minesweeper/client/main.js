
"use strict";

console.log('At start of main.js');

let TILE_SIZE = 24;
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
const SKULL = 14;

const PLAY_CLIENT_SIDE = true;

const GAME_DESCRIPTION_KEY = "CURRENT_GAME_DESCRIPTION";
const GAME_BOARD_STATE_KEY = "CURRENT_GAME_BOARD_STATE";

let BINOMIAL;

// holds the images
const images = [];
let imagesLoaded = 0;
const led_images = [];

let canvasLocked = false;   // we need to lock the canvas if we are auto playing to prevent multiple threads playing the same game

const canvas = document.getElementById('myCanvas');
const ctx = canvas.getContext('2d');

const docMinesLeft = document.getElementById('myMinesLeft');
const ctxBombsLeft = docMinesLeft.getContext('2d');

const canvasHints = document.getElementById('myHints');
const ctxHints = canvasHints.getContext('2d');

let currentGameDescription;

let analysisBoard;
let gameBoard;
let board;

let oldrng = false;

const tooltip = document.getElementById('tooltip');
const autoPlayCheckBox = document.getElementById("autoplay");
const showHintsCheckBox = document.getElementById("showhints");
const acceptGuessesCheckBox = document.getElementById("acceptguesses");
const seedText = document.getElementById("seed");
const gameTypeSafe = document.getElementById("gameTypeSafe");
const gameTypeZero = document.getElementById("gameTypeZero");
const switchButton = document.getElementById("switchButton");
const analysisButton = document.getElementById("AnalysisButton");
const messageLine = document.getElementById("messageLine");
const title = document.getElementById("title");
const lockMineCount = document.getElementById("lockMineCount");
const docPlayStyle = document.getElementById("playstyle");
const docTileSize = document.getElementById("tilesize");
const docFastPlay = document.getElementById("fastPlay");
const docNgMode = document.getElementById("noGuessMode");
const docHardcore = document.getElementById("hardcore");
const docOverlay = document.getElementById("overlay");

const downloadHyperlink = document.getElementById('downloadmbf');

// elements used in the local storage modal - wip
const localStorageButton = document.getElementById("localStorageButton");
const localStorageModal = document.getElementById("localStorage");
const localStorageSelection = document.getElementById("localStorageSelection");

//properties panel
const propertiesPanel = document.getElementById("properties");

// elements used in the no guess build modal
const ngModal = document.getElementById("noGuessBuilder");
const ngText = document.getElementById("ngText");

let analysisMode = false;
let replayMode = false;
let replayData = null;
let replayStep = 0;
let replayInterrupt = false;
let replaying = false;

let previousBoardHash = 0;
let justPressedAnalyse = false;
let dragging = false;  //whether we are dragging the cursor
let dragTile;          // the last tile dragged over
let hoverTile;         // tile the mouse last moved over
let analysing = false;  // try and prevent the analyser running twice if pressed more than once

let guessAnalysisPruning = true;

let lastFileHandle = null;

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

    let seed = urlParams.get('seed');
    if (seed == null) {
        seed = 0;
    } else {
        seedText.value = seed;
    }

    const start = urlParams.get('start');

    if (urlParams.has("nopruning")) {
        console.log("WARNING: The Analyse button has Pruning turned off - pruning remains for all other solver calls");
        guessAnalysisPruning = false;
    }

    docMinesLeft.width = DIGIT_WIDTH * DIGITS;
    docMinesLeft.height = DIGIT_HEIGHT;

    BINOMIAL = new Binomial(70000, 500);

    console.log("Binomials calculated");

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
        const gameDescription = JSON.parse(currentGameDescription);
        console.log(gameDescription);
        await newGame(gameDescription.width, gameDescription.height, gameDescription.mines, gameDescription.seed);

    } else {
        await newGame(30, 16, 99, seed); // default to a new expert game
    }

    setInterval(checkBoard, 1000);

    if (start != null) {
        showHintsCheckBox.checked = false;
        const tile = board.getTile(start);
        const message = buildMessageFromActions([new Action(tile.x, tile.y, 1, ACTION_CLEAR)], true);
        await sendActionsMessage(message);
        board.setStarted();
    }

    //bulkRun(21, 12500);  // seed '21' Played 12500 won 5195
    //bulkRun(321, 10000);  // seed 321 played 10000 won 4119

    showMessage("Welcome to minesweeper solver dedicated to Annie");
}

// launch a floating window to store/retrieve from local storage
function openLocalStorage() {

    console.log("There are " + localStorage.length + " items in local storage");

    // remove all the options from the selection
    localStorageSelection.length = 0;

    // iterate localStorage
    for (let i = 0; i < localStorage.length; i++) {

        // set iteration key name
        const key = localStorage.key(i);

        const option = document.createElement("option");
        option.text = key;
        option.value = key;
        localStorageSelection.add(option);

        // use key name to retrieve the corresponding value
        const value = localStorage.getItem(key);

        // console.log the iteration key and value
        console.log('Key: ' + key + ', Value: ' + value);

    }

    localStorageModal.style.display = "block";

}

function closeLocalStorage() {

    localStorageModal.style.display = "none";

}

function saveLocalStorage() {

    const key = localStorageSelection.value;

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

// download as MBF  - this has been replaced with a save file dialogue
// create a BLOB of the data, insert a URL to it into the download link
async function downloadAsMBF(e) {

    // if we are in analysis mode then create the url, otherwise the url was created when the game was generated
    if (analysisMode) {
        if (board == null) {
            e.preventDefault();
            console.log("No Board defined, unable to generate MBF");
            return false;
        }

        if (board.bombs_left != 0) {
            showMessage("Mines left must be zero in order to download the board from Analysis mode.");
            e.preventDefault();
            return false;
        }

        const mbf = board.getFormatMBF();

        if (mbf == null) {
            console.log("Null data returned from getFormatMBF()");
            e.preventDefault();
            return false;
        }

        const blob = new Blob([mbf], { type: 'application/octet-stream' })

        const url = URL.createObjectURL(blob);

        console.log(url);

        downloadHyperlink.href = url;  // Set the url ready to be downloaded

        // give it 10 seconds then revoke the url
        setTimeout(function () { console.log("Revoked " + url); URL.revokeObjectURL(url) }, 10000, url);
    }

    // create a download name based on the date/time
    const now = new Date();

    const filename = "Download" + now.toISOString() + ".mbf";

    downloadHyperlink.download = filename;

}

// pop up a file save dialogue to store the layout as MBF format
async function saveMBF(e) {

    e.preventDefault();

    // if we are in analysis mode then create the url, otherwise the url was created when the game was generated
    let mbf;
    if (analysisMode) {
        if (board == null) {
            console.log("No Board defined, unable to generate MBF");
            return false;
        }

        if (board.bombs_left != 0) {
            showMessage("Mines left must be zero in order to download the board from Analysis mode.");
            return false;
        }

        mbf = board.getFormatMBF();

        if (mbf == null) {
            console.log("Null data returned from getFormatMBF()");
            return false;
        }

    } else {
        mbf = getMbfData(board.id);   // this function is in MinesweeperGame.js
        if (mbf == null) {
            showMessage("No game data available to convert to an MBF file");
            return false;
        }
    }

    let filename;
    if (analysisMode) {
        filename = "JSM_" + new Date().toISOString() + ".mbf";
    } else {
        filename = "JSM_Seed_" + board.seed + ".mbf";
    }

    const data = mbf;

    const options = {
        excludeAcceptAllOption: true,
        suggestedName: filename,
        startIn: 'documents',
        types: [
            {
                description: 'Minesweeper board format',
                accept: {
                    'application/blob': ['.mbf'],
                },
            },
        ],
    };

    if (lastFileHandle != null) {
        options.startIn = lastFileHandle;
    }

    try {
        const fileHandle = await window.showSaveFilePicker(options);

        const writable = await fileHandle.createWritable();
        await writable.write(data);
        await writable.close();

        lastFileHandle = fileHandle;

    } catch (err) {
        console.log("Save file picker exception: " + err.message);
    }

}


// pop up a file save dialogue to store the board details
async function savePosition(e) {

    e.preventDefault();

    let filename;
    if (analysisMode) {
        filename = "JSM_" + new Date().toISOString() + ".mine";
    } else {
        filename = "JSM_Seed_" + board.seed + ".mine";
    }
 
    const data = board.getPositionData()

    const options = {
        excludeAcceptAllOption: true,
        suggestedName: filename,
        startIn: 'documents',
        types: [
            {
                description: 'Minesweeper board',
                accept: {
                    'text/plain': ['.mine'],
                },
            },
        ],
    };

    if (lastFileHandle != null) {
        options.startIn = lastFileHandle;
    }

    try {
        const fileHandle = await window.showSaveFilePicker(options);

        const writable = await fileHandle.createWritable();
        await writable.write(data);
        await writable.close();

        lastFileHandle = fileHandle;

    } catch(err) {
        console.log("Save file picker exception: " + err.message);
    }

}


function switchToAnalysis(doAnalysis) {

    if (doAnalysis) {
        gameBoard = board;
        board = analysisBoard;

        showDownloadLink(true, "")  // display the hyperlink

        switchButton.innerHTML = "Switch to Player";
    } else {
        analysisBoard = board;
        board = gameBoard;

        showDownloadLink(false, "")  // hide the hyperlink (we don't have the url until we play a move - this could be improved)

        switchButton.innerHTML = "Switch to Analyser";
    }

    analysisMode = doAnalysis;

    setPageTitle();

    changeTileSize();

    renderHints([]);  // clear down hints

    updateMineCount(board.bombs_left);  // reset the mine count

 
}

function setPageTitle() {

    if (analysisMode) {
        if (replayMode) {
            title.innerHTML = "Minesweeper replay";  // change the title
        } else {
            title.innerHTML = "Minesweeper analyser";  // change the title
        }

    } else {
        title.innerHTML = "Minesweeper player"; // change the title
    }
}

// render an array of tiles to the canvas
function renderHints(hints, otherActions, drawOverlay) {

    if (drawOverlay == null) {
        drawOverlay = (docOverlay.value != "none")
    }

    //console.log(hints.length + " hints to render");
    //ctxHints.clearRect(0, 0, canvasHints.width, canvasHints.height);
    ctxHints.reset();

    if (hints == null) {
        return;
    }

    let firstGuess = 0;  // used to identify the first (best) guess, subsequent guesses are just for info 
    for (let i = 0; i < hints.length; i++) {

        const hint = hints[i];

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

     // put percentage over the tile 
    if (drawOverlay) {

        if (TILE_SIZE == 12) {
            ctxHints.font = "7px serif";
        } else if (TILE_SIZE == 16) {
            ctxHints.font = "10px serif";
        } else if (TILE_SIZE == 20) {
            ctxHints.font = "12px serif";
        } else if (TILE_SIZE == 24) {
            ctxHints.font = "14px serif";
        } else if (TILE_SIZE == 28) {
            ctxHints.font = "16px serif";
        } if (TILE_SIZE == 32) {
            ctxHints.font = "21px serif";
        } else {
            ctxHints.font = "6x serif";
        }

        ctxHints.globalAlpha = 1;
        ctxHints.fillStyle = "black";
        for (let tile of board.tiles) {
            if (tile.getHasHint() && tile.isCovered() && !tile.isFlagged() && tile.probability != null) {
                if (!showHintsCheckBox.checked || (tile.probability != 1 && tile.probability != 0)) {  // show the percentage unless we've already colour coded it

                    let value;
                    if (docOverlay.value == "safety") {
                        value = tile.probability * 100;
                    } else {
                        value = (1 - tile.probability) * 100;
                    }

                    let value1;
                    if (value < 9.95) {
                        value1 = value.toFixed(1);
                    } else {
                        value1 = value.toFixed(0);
                    }

                    const offsetX = (TILE_SIZE - ctxHints.measureText(value1).width) / 2;

                    ctxHints.fillText(value1, tile.x * TILE_SIZE + offsetX, (tile.y + 0.7) * TILE_SIZE, TILE_SIZE);

                }
            }
        }
    }


    if (otherActions == null) {
        return;
    }

    ctxHints.globalAlpha = 1;
    // these are from the efficiency play style and are the known moves which haven't been made
    for (let action of otherActions) {
        if (action.action == ACTION_CLEAR) {
            ctxHints.fillStyle = "#00FF00";
        } else {
            ctxHints.fillStyle = "#FF0000";
        }
        ctxHints.fillRect((action.x + 0.35) * TILE_SIZE, (action.y + 0.35) * TILE_SIZE, 0.3 * TILE_SIZE, 0.3 * TILE_SIZE);
    }

}

// render an array of tiles to the canvas
function renderBorder(hints, flag) {

    //console.log(hints.length + " hints to render");

     for (let i = 0; i < hints.length; i++) {

         const hint = hints[i];

         ctxHints.globalAlpha = 0.7;
         ctxHints.lineWidth = 6;

         if (flag) {
             ctxHints.strokeStyle = "red";
         } else {
             ctxHints.strokeStyle = "black";
         }
 
         ctxHints.strokeRect(hint.x * TILE_SIZE, hint.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
 
    }

}

// render an array of tiles to the canvas
function renderTiles(tiles) {

    //console.log(tiles.length + " tiles to render");

    for (let i = 0; i < tiles.length; i++) {
        const tile = tiles[i];
        let tileType = HIDDEN;

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

        } else if (tile.isSkull()) {
            //console.log("Render skull at " + tile.asText());
            tileType = SKULL;

        } else if (tile.isCovered()) {
            tileType = HIDDEN;

        } else {
            tileType = tile.getValue();
        }
        draw(tile.x, tile.y, tileType);
    }


}

function updateMineCount(minesLeft) {

    let work = minesLeft;
    const digits = getDigitCount(minesLeft);

    let position = digits - 1;

    docMinesLeft.width = DIGIT_WIDTH * digits;

    for (let i = 0; i < DIGITS; i++) {

        const digit = work % 10;
        work = (work - digit) / 10;

        ctxBombsLeft.drawImage(led_images[digit], DIGIT_WIDTH * position + 2, 2, DIGIT_WIDTH - 4, DIGIT_HEIGHT - 4);

        position--;
    }

}

function getDigitCount(mines) {

    let digits;
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

    //if (show) {
    //    downloadHyperlink.style.display = "block";
    //    if (url != null) {
    //        downloadHyperlink.href = url;
    //    }
    //} else {
    //   downloadHyperlink.style.display = "none";
    //}

}

async function bulkRun(runSeed, size) {

    const options = {};
    options.playStyle = PLAY_STYLE_NOFLAGS;
    options.verbose = false;
    options.advancedGuessing = true;

    const startTime = Date.now();

    let played = 0;
    let won = 0;

    const rng = JSF(runSeed);  // create an RNG based on the seed
    const startIndex = 0;

    while (played < size) {

        played++;

        const gameSeed = rng() * Number.MAX_SAFE_INTEGER;

        console.log(gameSeed);

        const game = new ServerGame(0, 30, 16, 99, startIndex, gameSeed, "safe");

        const board = new Board(0, 30, 16, 99, gameSeed, "safe");

        let tile = game.getTile(startIndex);

        let revealedTiles = game.clickTile(tile);
        applyResults(board, revealedTiles);  // this is in MinesweeperGame.js

        let loopCheck = 0;
        while (revealedTiles.header.status == IN_PLAY) {

            loopCheck++;

            if (loopCheck > 10000) {
                break;
            }

            const reply = await solver(board, options);  // look for solutions

            const actions = reply.actions;

            for (let i = 0; i < actions.length; i++) {

                const action = actions[i];

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
}

async function playAgain() {

    // let the server know the game is over
    if (board != null && !analysisMode) {
        callKillGame(board.getID());

        const reply = copyGame(board.getID());

        const id = reply.id;

        board = new Board(id, board.width, board.height, board.num_bombs, board.seed, board.gameType);

        changeTileSize();

        updateMineCount(board.num_bombs);

        canvasLocked = false;  // just in case it was still locked (after an error for example)

        showMessage("Replay game requested");
    } else {
        showMessage("No game to replay");
    }

}

// take a .mine format string and try to create a MBF format from it
function StringToMBF(data) {

    const lines = data.split("\n");
    const size = lines[0].split("x");

    if (size.length != 3) {
        console.log("Header line is invalid: " + lines[0]);
        return null;
    }

    const width = parseInt(size[0]);
    const height = parseInt(size[1]);
    const mines = parseInt(size[2]);

    console.log("width " + width + " height " + height + " mines " + mines);

    if (width < 1 || height < 1 || mines < 1) {
        console.log("Invalid dimensions for game");
        return null;
    }

    if (lines.length < height + 1) {
        console.log("Insufficient lines to hold the data: " + lines.length);
        return null;
    }

    if (width > 255 || height > 255) {
        console.log("Board too large to convert to MBF format");
        return null;
    }

    const length = 4 + 2 * mines;

    const mbf = new ArrayBuffer(length);
    const mbfView = new Uint8Array(mbf);

    mbfView[0] = width;
    mbfView[1] = height;

    mbfView[2] = Math.floor(mines / 256);
    mbfView[3] = mines % 256;

    let minesFound = 0;
    let index = 4;

    for (let y = 0; y < height; y++) {
        const line = lines[y + 1];
        console.log(line);
        for (let x = 0; x < width; x++) {

            const char = line.charAt(x);

            if (char == "F" || char == "M" || char == "?") {
                minesFound++;
                if (index < length) {
                    mbfView[index++] = x;
                    mbfView[index++] = y;
                }
            }
        }
    }
    if (minesFound != mines) {
        console.log("Board has incorrect number of mines. board=" + mines + ", found=" + minesFound);
        return null;
    }

    console.log(...mbfView);

    return mbf;

}

async function newGameFromBlob(blob) {
    const mbf = await blob.arrayBuffer();
    await newGameFromMBF(mbf);
    showMessage("Game " + board.width + "x" + board.height + "/" + board.num_bombs + " created from MBF file " + blob.name);
}

async function newGameFromMBF(mbf) {

    const view = new Uint8Array(mbf);

    console.log(...view);

    // let the server know the game is over
    if (board != null) {
        callKillGame(board.getID());
    }

    const width = view[0];
    const height = view[1];
    const mines = view[2] * 256 + view[3];

    const reply = createGameFromMFB(view);  // this function is in MinesweeperGame.js

    const id = reply.id;

    let gameType;
    if (gameTypeZero.checked) {
        gameType = "zero";
    } else {
        gameType = "safe";
    }

    board = new Board(id, width, height, mines, "", gameType);

    setPageTitle();

    changeTileSize();

    showDownloadLink(false, ""); // remove the download link

    updateMineCount(board.num_bombs);

    canvasLocked = false;  // just in case it was still locked (after an error for example)

    //showMessage("Game "  + width + "x" + height + "/" + mines + " created from MBF file");
 
}

async function newBoardFromFile(file) {

    const fr = new FileReader();

    fr.onloadend = async function (e) {

        if (analysisMode) {
            await newBoardFromString(e.target.result);
            showMessage("Position loaded from file " + file.name);
        } else {
            const mbf = StringToMBF(e.target.result);
            if (mbf == null) {
                showMessage("File " + file.name + " doesn't contain data for a whole board");
                return;
            } else {
                newGameFromMBF(mbf);
                showMessage("Game " + board.width + "x" + board.height + "/" + board.num_bombs + " created from mine positions extracted from file " + file.name);
            }
        }
 
        lockMineCount.checked = true;
 
        checkBoard();

    };

    fr.readAsText(file);

}

async function newBoardFromString(data) {

    const lines = data.split("\n");
    const size = lines[0].split("x");

    if (size.length != 3) {
        console.log("Header line is invalid: " + lines[0]);
        return;
    }

    const width = parseInt(size[0]);
    const height = parseInt(size[1]);
    const mines = parseInt(size[2]);

    console.log("width " + width + " height " + height + " mines " + mines);

    if (width < 1 || height < 1 || mines < 1) {
        console.log("Invalid dimensions for game");
        return;
    }

    if (lines.length < height + 1) {
        console.log("Insufficient lines to hold the data: " + lines.length);
        return;
    }

    const newBoard = new Board(1, width, height, mines, "", "safe");

    for (let y = 0; y < height; y++) {
        const line = lines[y + 1];
        console.log(line);
        for (let x = 0; x < width; x++) {

            const char = line.charAt(x);
            const tile = newBoard.getTileXY(x, y);

            if (char == "F" || char == "M") {
                tile.toggleFlag();
                newBoard.bombs_left--;
            } else if (char == "0") {
                tile.setValue(0);
            } else if (char == "1") {
                tile.setValue(1);
            } else if (char == "2") {
                tile.setValue(2);
            } else if (char == "3") {
                tile.setValue(3);
            } else if (char == "4") {
                tile.setValue(4);
            } else if (char == "5") {
                tile.setValue(5);
            } else if (char == "6") {
                tile.setValue(6);
            } else if (char == "7") {
                tile.setValue(7);
            } else if (char == "8") {
                tile.setValue(8);
            } else {
                tile.setCovered(true);
            }
        }
    }

    // switch to the board
    board = newBoard;

    // this redraws the board
    changeTileSize();

    updateMineCount(board.bombs_left);

    replayMode = false;
    replayData = null;

    setPageTitle();

    canvasLocked = false;  // just in case it was still locked (after an error for example)

}

// load replay data into the system
function loadReplayData(file) {

    if (!analysisMode) {
        showMessage("Switch to analysis mode before loading the replay");
        return;
    }

    const fr = new FileReader();

    fr.onloadend = async function (e) {

        replayData = JSON.parse(e.target.result);
        replayStep = 0;
        replayMode = true;
        replayData.breaks = Array(replayData.replay.length);
        replayData.breaks.fill(false);

        showMessage("Replay for " + replayData.header.width + "x" + replayData.header.height + "/" + replayData.header.mines + " loaded from " + file.name);

        const newBoard = new Board(1, replayData.header.width, replayData.header.height, replayData.header.mines, "", "safe");

        // switch to the board
        board = newBoard;

        setPageTitle();

        // this redraws the board
        changeTileSize();

        updateMineCount(board.bombs_left);

        // enable the analysis button - it might have been previous in an invalid layout
        analysisButton.disabled = false;

    };

    fr.readAsText(file);

}

async function newGame(width, height, mines, seed) {

    console.log("New game requested: Width=" + width + " Height=" + height + " Mines=" + mines + " Seed=" + seed);

    // let the server know the game is over
    if (board != null) {
        callKillGame(board.getID());
    }

    // this is a message to the server or local
    let reply;
    if (PLAY_CLIENT_SIDE) {
        reply = getNextGameID();
    } else {
        const json_data = await fetch("/requestID");
        reply = await json_data.json();
    }

    console.log("<== " + JSON.stringify(reply));
    const id = reply.id;

    let gameType;
    if (gameTypeZero.checked) {
        gameType = "zero";
    } else {
        gameType = "safe";
    }

    if (analysisMode) {
        lockMineCount.checked = !document.getElementById('buildZero').checked;  // lock the mine count or not
        showDownloadLink(true, "");
    } else {
        showDownloadLink(false, "");
    }

    let drawTile = HIDDEN;
    if (analysisMode) {
        replayMode = false;
        replayData = null;

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

    changeTileSize();

    updateMineCount(board.num_bombs);

    setPageTitle();

    canvasLocked = false;  // just in case it was still locked (after an error for example)

    showMessage("New game requested with width " + width + ", height " + height + " and " + mines + " mines.");

}

function changeTileSize() {

    TILE_SIZE = parseInt(docTileSize.value);

    //console.log("Changing tile size to " + TILE_SIZE);

    resizeCanvas(board.width, board.height);  // resize the canvas

    browserResized();  // do we need scroll bars?

    renderTiles(board.tiles); // draw the board

}

    // make the canvases large enough to fit the game
function resizeCanvas(width, height) {

    const boardWidth = width * TILE_SIZE;
    const boardHeight = height * TILE_SIZE;

    canvas.width = boardWidth;
    canvas.height = boardHeight;

    canvasHints.width = boardWidth;
    canvasHints.height = boardHeight;

}

function browserResized() {

    const boardElement = document.getElementById('board');

    const boardWidth = board.width * TILE_SIZE;
    const boardHeight = board.height * TILE_SIZE;

    const screenWidth = document.getElementById('canvas').offsetWidth - 10;
    const screenHeight = document.getElementById('canvas').offsetHeight - 60 - 20;   // subtract some space to allow for the mine count panel and the hyperlink

    //console.log("Available size is " + screenWidth + " x " + screenHeight);

    // things to determine
    let useWidth;
    let useHeight;
    let scrollbarYWidth;
    let scrollbarXHeight;

    // decide screen size and set scroll bars
    if (boardWidth > screenWidth && boardHeight > screenHeight) {  // both need scroll bars
        useWidth = screenWidth;
        useHeight = screenHeight;
        boardElement.style.overflowX = "scroll";
        boardElement.style.overflowY = "scroll";

        scrollbarYWidth = 0;    
        scrollbarXHeight = 0;

    } else if (boardWidth > screenWidth) {  // need a scroll bar on the bottom
        useWidth = screenWidth;
        boardElement.style.overflowX = "scroll";

        scrollbarXHeight = boardElement.offsetHeight - boardElement.clientHeight - 10;
        scrollbarYWidth = 0;

        if (boardHeight + scrollbarXHeight > screenHeight) {  // the scroll bar has made the height to large now !
            useHeight = screenHeight;
            boardElement.style.overflowY = "scroll";
            scrollbarXHeight = 0;
        } else {
            useHeight = boardHeight;
            boardElement.style.overflowY = "hidden";
        }

    } else if (boardHeight > screenHeight) {  // need a scroll bar on the right
        useHeight = screenHeight;
        boardElement.style.overflowY = "scroll";

        scrollbarYWidth = boardElement.offsetWidth - boardElement.clientWidth - 10;
        scrollbarXHeight = 0;

        if (boardWidth + scrollbarYWidth > screenWidth) {  // the scroll bar has made the width to large now !
            useWidth = screenWidth;
            scrollbarYWidth = 0;
            boardElement.style.overflowX = "scroll";
        } else {
            useWidth = boardWidth;
            boardElement.style.overflowX = "hidden";
        }

    } else {
         useWidth = boardWidth;
        boardElement.style.overflowX = "hidden";
        useHeight = boardHeight;
        boardElement.style.overflowY = "hidden";
        scrollbarYWidth = 0;
        scrollbarXHeight = 0;
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
    let newValue = null;
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
            const tile = hoverTile;
            tile.setCovered(true);
            window.requestAnimationFrame(() => renderTiles([tile]));
        } else if (e.key == 'f') {
            const tile = hoverTile;
            const tilesToUpdate = analysis_toggle_flag(tile);
            window.requestAnimationFrame(() => renderTiles(tilesToUpdate));
        } else if (e.key == 'v' && e.ctrlKey) {
            //console.log("Control-V pressed");
            navigator.clipboard.readText().then(
                clipText => newBoardFromString(clipText));
        } else if (e.key == 'ArrowRight') {
             if (replayMode) {
                if (e.shiftKey) {
                    replayForward("S");
                } else {
                    replayForward("1");
                }
            }
        } else if (e.key == 'ArrowLeft') {
            if (replayMode) {
                if (e.shiftKey) {
                    replayBackward("S");
                } else {
                    replayBackward("1");
                }
            }
        } else if (e.key == 'ArrowUp') {
            if (replayMode) {
                replayInterrupt = true;
            }
        }
    } else {
        if (e.key == ' ' && board.isGameover()) {
            apply();  // this is in the index.html file
        }
    }

    if (newValue == null) {
        return;
    }

    const tile = hoverTile;

    //console.log('tile is' + tile);
    // can't replace a flag
    if (tile == null || tile.isFlagged()) {
        return;
    }

    const flagCount = board.adjacentFoundMineCount(tile);
    const covered = board.adjacentCoveredCount(tile);

    // check it is a legal value
    if (newValue < flagCount || newValue > flagCount + covered) {
        return;
    }

    tile.setValue(newValue);

    // update the graphical board
    window.requestAnimationFrame(() => renderTiles([tile]));

}

async function replayForward(replayType) {

    if (replaying) {
        console.log("Replay is already in progress")
        return;
    }

    const size = replayData.replay.length;
    replayInterrupt = false;

    if (replayStep == size) {
        console.log("Replay can't advance beyond the end")
        return;
    }

    replaying = true;

    while (replayStep != size) {

        replayStep++;

        if (replayType == "S") {
            showMessage("Advancing to step " + replayStep + " of " + size);
            await sleep(1);
        }

        // clear the hints overlay
        window.requestAnimationFrame(() => renderHints([], []));

        const step = replayData.replay[replayStep - 1];

        const tiles = [];

        // type 0 = clear, type 3 = chord
        if (step.type == 0 || step.type == 3) {
            let gameBlasted = false;
            for (let i = 0; i < step.touchCells.length; i = i + 5) {

                const x = step.touchCells[i];
                const y = step.touchCells[i + 1];
                const value = step.touchCells[i + 2];

                const tile = board.getTileXY(x, y);

                if (tile == null) {
                    console.log("Unable to find tile (" + x + "," + y + ")");
                    continue;
                } else {
                    //console.log("Tile (" + tile.getX() + "," + tile.getY() + ") to value " + value);
                }

                if (value < 9) {    // reveal value on tile
                    tile.setValue(value);
                    tiles.push(tile);

                } else if (value == 10) {  // add or remove flag

                    if (gameBlasted) {
                        tile.setBomb(true);
                    } else {
                        tile.toggleFlag();
                        if (tile.isFlagged()) {
                            board.bombs_left--;
                        } else {
                            board.bombs_left++;
                        }
                    }

                    tiles.push(tile);

                } else if (value == 11) {  // a tile which is a mine and is the cause of losing the game
                    gameBlasted = true;
                    tile.setBombExploded();
                    tiles.push(tile);

                } else if (value == 12) {  // a tile which is flagged but shouldn't be
                    board.bombs_left++;
                    tile.setBomb(false);
                    tiles.push(tile);

                } else {
                    console.log(tile.asText() + " Replay value '" + value + "' is not recognised");
                }

            }

        } else if (step.type == 1) {
            const x = step.x;
            const y = step.y;

            const tile = board.getTileXY(x, y);

            if (tile == null) {
                console.log("Unable to find tile (" + x + "," + y + ")");
                continue;
            }

            tile.toggleFlag();
            if (tile.isFlagged()) {
                board.bombs_left--;
            } else {
                board.bombs_left++;
            }
            tiles.push(tile);

        }
        // update the graphical board

        window.requestAnimationFrame(() => renderTiles(tiles));
        window.requestAnimationFrame(() => updateMineCount(board.bombs_left));

        // run the solver
        const options = {};

        if (docPlayStyle.value == "flag") {
            options.playStyle = PLAY_STYLE_FLAGS;
        } else if (docPlayStyle.value == "noflag") {
            options.playStyle = PLAY_STYLE_NOFLAGS;
        } else if (docPlayStyle.value == "eff") {
            options.playStyle = PLAY_STYLE_EFFICIENCY;
        } else {
            options.playStyle = PLAY_STYLE_NOFLAGS_EFFICIENCY;
        }

        options.fullProbability = true;
        options.advancedGuessing = false;
        options.verbose = false;

        let hints;
        let other;

        const solve = await solver(board, options);  // look for solutions
        hints = solve.actions;
        other = solve.other;

        // determine the next tile to be clicked
        let doBreak = replayInterrupt;

        if (replayStep != size) {
            const nextStep = replayData.replay[replayStep];
            const nextTile = board.getTileXY(nextStep.x, nextStep.y);

            // see if the left click is definitely safe
            if (nextStep.type == 0 && nextTile.isCovered() && !nextTile.isFlagged() && nextTile.probability != 1) {
                replayData.breaks[replayStep] = true;
                doBreak = true;
            }

            // see if any of the click or chord affects a non-certain safe tile
            if (nextStep.type == 3) {
                for (let i = 0; i < nextStep.touchCells.length; i = i + 5) {

                    const x = nextStep.touchCells[i];
                    const y = nextStep.touchCells[i + 1];

                    const chordTile = board.getTileXY(x, y);

                    // only check the adjacent tiles, the others are the result of zeros being found
                    if (!nextTile.isAdjacent(chordTile)) {
                        continue;
                    }

                    if (chordTile.isCovered() && !chordTile.isFlagged() && chordTile.probability != 1) {
                        replayData.breaks[replayStep] = true;
                        doBreak = true;
                        break;
                    }
                }
            }
 
        }

        if (replayType == "1") {
            doBreak = true;
        }

        // only show the percentages if we are about to break
        window.requestAnimationFrame(() => renderHints(hints, other, doBreak));

        if (replayStep != size) {
            const nextStep = replayData.replay[replayStep];
            showNextStep(nextStep);
        }

        if (doBreak) {
            break;
        }

    }

    let totalTime = 0;
    let clickTime = 0;

    if (replayStep > 1) {
        totalTime = replayData.replay[replayStep - 1].time;
        const prevStep = replayData.replay[replayStep - 2];
        clickTime = totalTime - prevStep.time;

    }

    if (replayStep != 0) {
        prefixMessage("Total time: " + showDuration(totalTime) + ", Interval time: " + showDuration(clickTime));
    }

    replaying = false;
 
}

async function replayBackward(replayType) {

    if (replaying) {
        console.log("Replay is already in progress")
        return;
    }

    const size = replayData.replay.length;
    replayInterrupt = false;

    if (replayStep == 0) {
        console.log("Replay can't move before the start")
        return;
    }

    replaying = true;

    while (replayStep != 0) {

        if (replayType == "S") {
            showMessage("Backwards to step " + replayStep + " of " + size);
            await sleep(1);
        }

        // clear the hints overlay
        window.requestAnimationFrame(() => renderHints([], []));

        const step = replayData.replay[replayStep - 1];

        const tiles = [];

        if (step.type == 0 || step.type == 3) {

            let unGameBlasted = false;
            for (let i = 0; i < step.touchCells.length; i = i + 5) {

                const x = step.touchCells[i];
                const y = step.touchCells[i + 1];
                const value = step.touchCells[i + 2];

                const tile = board.getTileXY(x, y);

                if (tile == null) {
                    console.log("Unable to find tile (" + x + "," + y + ")");
                    continue;
                } else {
                    //console.log("Tile (" + tile.getX() + "," + tile.getY() + ") to value " + value);
                }

                if (value < 9) {    // reveal value on tile
                    tile.setCovered(true);
                    tiles.push(tile);

                } else if (value == 10) {  // add or remove flag

                    if (unGameBlasted) {
                        tile.setBomb(false);

                    } else {
                        tile.toggleFlag();
                        if (tile.isFlagged()) {
                            board.bombs_left--;
                        } else {
                            board.bombs_left++;
                        }
                    }

                    tiles.push(tile);

                } else if (value == 11) {  // a tile which is a mine and is the cause of losing the game
                    unGameBlasted = true;   // Any flagging after this is actually showing a mine
                    tile.setBomb(false);
                    tile.exploded = false;
                    tiles.push(tile);

                } else if (value == 12) {  // a tile which is flagged but shouldn't be - occurs at the end of the replay
                    board.bombs_left--;
                    tile.setBomb(null);
                    tiles.push(tile);

                } else {
                    console.log(tile.asText() + " Replay value '" + value + "' is not recognised");
                }

            }

        } else if (step.type == 1) {
            const x = step.x;
            const y = step.y;

            const tile = board.getTileXY(x, y);

            if (tile == null) {
                console.log("Unable to find tile (" + x + "," + y + ")");
                continue;
            }

            tile.toggleFlag();
            if (tile.isFlagged()) {
                board.bombs_left--;
            } else {
                board.bombs_left++;
            }
            tiles.push(tile);

        }
        // update the graphical board

        window.requestAnimationFrame(() => renderTiles(tiles));
        window.requestAnimationFrame(() => updateMineCount(board.bombs_left));

        replayStep--;

        if (replayData.breaks[replayStep] || replayType == "1" || replayInterrupt) {

            // run the solver
            const options = {};

            if (docPlayStyle.value == "flag") {
                options.playStyle = PLAY_STYLE_FLAGS;
            } else if (docPlayStyle.value == "noflag") {
                options.playStyle = PLAY_STYLE_NOFLAGS;
            } else if (docPlayStyle.value == "eff") {
                options.playStyle = PLAY_STYLE_EFFICIENCY;
            } else {
                options.playStyle = PLAY_STYLE_NOFLAGS_EFFICIENCY;
            }

            options.fullProbability = true;
            options.advancedGuessing = false;
            options.verbose = false;

            let hints;
            let other;

            board.resetForAnalysis(false, true);
 
            const solve = await solver(board, options);  // look for solutions
            hints = solve.actions;
            other = solve.other;

            window.requestAnimationFrame(() => renderHints(hints, other, true));

            // determine the next tile to be clicked
            const nextStep = replayData.replay[replayStep];
            showNextStep(nextStep);

            break;
        }

    }

    let totalTime = 0;
    let clickTime = 0;

    if (replayStep > 1) {
        totalTime = replayData.replay[replayStep - 1].time;

        const prevStep = replayData.replay[replayStep - 2];
        clickTime = totalTime - prevStep.time;
    }

    if (replayStep != 0) {
        prefixMessage("Total time: " + showDuration(totalTime) + ", Interval time: " + showDuration(clickTime));
    } else {
        showMessage("");
    }

    replaying = false;

}

function showNextStep(step) {

    const x = step.x;
    const y = step.y;
    const type = step.type;

    const nextTile = board.getTileXY(x, y);
    window.requestAnimationFrame(() => renderBorder([nextTile], (type == 1)));

}

function showDuration(milliseconds) {

    let work = milliseconds;
    const mins = Math.floor(work / 60000);

    work = work - mins * 60000;
    const secs = work / 1000;

    if (mins > 0) {
        if (secs < 10) {
            return mins + ":0" + secs.toFixed(3);
        } else {
            return mins + ":" + secs.toFixed(3);
        }
       
    } else {
        return secs.toFixed(3);
    }

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
    if (analysisMode) {
        board.resetForAnalysis(!replayMode, true);  // in replay mode don't treat flags as mines
    }
 
    const solutionCounter = solver.countSolutions(board);

    if (solutionCounter.finalSolutionsCount != 0) {

         const options = {};
        if (docPlayStyle.value == "flag") {
            options.playStyle = PLAY_STYLE_FLAGS;
        } else if (docPlayStyle.value == "noflag") {
            options.playStyle = PLAY_STYLE_NOFLAGS;
        } else if (docPlayStyle.value == "eff") {
            options.playStyle = PLAY_STYLE_EFFICIENCY;
        } else {
            options.playStyle = PLAY_STYLE_NOFLAGS_EFFICIENCY; 
        } 

        if (docOverlay.value != "none") {
            options.fullProbability = true;
        } else {
            options.fullProbability = false;
        }

        options.guessPruning = guessAnalysisPruning;

        const solve = await solver(board, options);  // look for solutions
        const hints = solve.actions;

        justPressedAnalyse = true;

        window.requestAnimationFrame(() => renderHints(hints, solve.other));

        // show the next tile to be clicked if in replay mode
        if (analysisMode && replayMode) {
            const nextStep = replayData.replay[replayStep];
            showNextStep(nextStep);
        }
 
    } else {
        showMessage("The board is in an invalid state");
        window.requestAnimationFrame(() => renderHints([], []));
    }

    // by delaying removing the logical lock we absorb any secondary clicking of the button / hot key
    setTimeout(function () { canvasLocked = false; }, 200);
    //canvasLocked = false;

}

async function checkBoard() {

    if (!analysisMode || replayMode) {
        return;
    }

    // this will set all the obvious mines which makes the solution counter a lot more efficient on very large boards
    //board.resetForAnalysis(true, true);
 
    const currentBoardHash = board.getHashValue();

    if (currentBoardHash == previousBoardHash) {
        return;
    } 

    previousBoardHash = currentBoardHash;

    console.log("Checking board with hash " + currentBoardHash);

    // this will set all the obvious mines which makes the solution counter a lot more efficient on very large boards
    board.resetForAnalysis(true, true);

    const solutionCounter = await solver.countSolutions(board);
    board.resetForAnalysis(true, false);

    if (solutionCounter.finalSolutionsCount != 0) {
        analysisButton.disabled = false;
        //showMessage("The board has" + solutionCounter.finalSolutionsCount + " possible solutions");
        let logicText;
        if (solutionCounter.clearCount != 0) {
            logicText = "There are safe tile(s). ";
        } else {
            logicText = "There are no safe tiles. ";
        }

        showMessage("The board is valid. " + board.getFlagsPlaced() + " Mines placed. " + logicText + formatSolutions(solutionCounter.finalSolutionsCount));
        
    } else {
        analysisButton.disabled = true;
        showMessage("The board is in an invalid state. " + board.getFlagsPlaced() + " Mines placed. ");
    }

}


// draw a tile to the canvas
function draw(x, y, tileType) {

    //console.log('Drawing image...');

    if (tileType == BOMB || tileType == SKULL) {
        ctx.drawImage(images[0], x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);  // before we draw the bomb depress the square
    }

    ctx.drawImage(images[tileType], x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);

}

// have the tooltip follow the mouse
function followCursor(e) {

    // get the tile we're over
    const row = Math.floor(event.offsetY / TILE_SIZE);
    const col = Math.floor(event.offsetX / TILE_SIZE);
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

        const tile = hoverTile;

        if (!tile.isEqual(dragTile)) {

            dragTile = tile;  // remember the latest tile

            if (tile.isCovered()) {
                const flagCount = board.adjacentFoundMineCount(tile);
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
        const tile = board.getTileXY(col, row);
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

    if (analysisMode && replayMode) {
        console.log("Input is locked when in Replay mode");
        return;
    }

    const row = Math.floor(event.offsetY / TILE_SIZE);
    const col = Math.floor(event.offsetX / TILE_SIZE);

    //console.log("Resolved to Col=" + col + ", row=" + row);

    let message;

    if (row >= board.height || row < 0 || col >= board.width || col < 0) {
        console.log("Click outside of game boundaries!!");
        return;

    } else if (analysisMode) {  // analysis mode

        const button = event.which

        const tile = board.getTileXY(col, row);

        let tiles = [];

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
                const flagCount = board.adjacentFoundMineCount(tile);
                tile.setValue(flagCount);
            } else {
                tile.setCovered(true);
            }

            tiles.push(tile);

        } else if (button == 3) {  // right mouse button

            // toggle the flag and return the tiles which need to be redisplayed
            tiles = analysis_toggle_flag(tile);

            console.log("Number of bombs " + board.num_bombs + "  bombs left to find " + board.bombs_left);

        } else {
            console.log("Mouse button " + button + " ignored");
            return;
        }

        // update the graphical board
        window.requestAnimationFrame(() => renderTiles(tiles));

    } else {  // play mode
        const button = event.which

        const tile = board.getTileXY(col, row);

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

                    // check that the tiles revealed by the chord are safe
                    if (docHardcore.checked) {

                        let uncertainChords = [];
                        let lethalChord = false;
                        for (let adjTile of board.getAdjacent(tile)) {
                            if (adjTile.isCovered() && !adjTile.isFlagged() && adjTile.getHasHint()) {
                                if (adjTile.probability == 0) {  // chording onto a certain mine
                                    lethalChord = true;
                                    break;
                                } else if (adjTile.probability != 1) {  // guessing by chording, outcome uncertain
                                    uncertainChords.push(adjTile);
                                }
                            }
                        }

                        // if it's a lethal chord then let the game end normally
                        if (!lethalChord && uncertainChords.length > 0 && board.hasSafeTile()) {
                            board.setGameLost();

                            //renderHints(board.getSafeTiles(), [], false);
                            for (let uncertainTile of uncertainChords) {
                                uncertainTile.setSkull(true);
                                //draw(uncertainTile.x, uncertainTile.y, SKULL);
                            }

                            renderTiles(uncertainChords);

                            showMessage("Hard Core: Game is lost because you guessed (by chording) when there were safe tiles!");
                            console.log("Chord is not hardcore valid");

                            return;
                        }

                    }


                    message = { "header": board.getMessageHeader(), "actions": [{ "index": board.xy_to_index(col, row), "action": 3 }] }; //chord
                } else {
                    console.log("Tile is not able to be chorded - no action to take");
                    return;
                }

            } else {

                // if playing hardcore and we click a non-certain tile when there is a certain safe tile
                // if the tile is a mine let it fail normally
                if (docHardcore.checked && tile.getHasHint() && tile.probability != 1 && tile.probability != 0 && board.hasSafeTile()) {
                    board.setGameLost();

                    //renderHints(board.getSafeTiles(), [], false);
                    tile.setSkull(true);
                    renderTiles([tile]);

                    //draw(tile.x, tile.y, SKULL);
                    showMessage("Hard Core: Game is lost because you guessed when there were safe tiles!");
                    console.log("Move is not hardcore valid");

                    return;
                }

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

        } else {
            console.log("Mouse button " + button + " ignored");
            return;
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

        sendActionsMessage(message);
    }

}

/**
 * toggle the flag and update any adjacent tiles
 * Return the tiles which need to be redisplayed
 */
function analysis_toggle_flag(tile) {

    const tiles = [];

    if (!tile.isCovered()) {
        tile.setCovered(true);
    }

    let delta;
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
        const tally = board.getFlagsPlaced();
        board.num_bombs = tally + board.bombs_left + delta;
    }

    // if the adjacent tiles values are in step then keep them in step
    const adjTiles = board.getAdjacent(tile);
    for (let i = 0; i < adjTiles.length; i++) {
        const adjTile = adjTiles[i];
        const adjFlagCount = board.adjacentFlagsPlaced(adjTile);
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

    // can't change tiles value when playing a game
    if (!analysisMode) {
        return;
    }

    // Can't change tiles value during replay mode
    if (analysisMode && replayMode) {
        return;
    }

    //console.log("Mousewheel event at X=" + event.offsetX + ", Y=" + event.offsetY);

    const row = Math.floor(event.offsetY / TILE_SIZE);
    const col = Math.floor(event.offsetX / TILE_SIZE);

    //console.log("Resolved to Col=" + col + ", row=" + row);

    const delta = Math.sign(event.deltaY);

    const tile = board.getTileXY(col, row);

    const flagCount = board.adjacentFoundMineCount(tile);
    const covered = board.adjacentCoveredCount(tile);

    //console.log("flag=" + flagCount + ", Covered=" + covered);

    let newValue;
    if (tile.isCovered()) {
        newValue = flagCount;
    } else {
        newValue = tile.getValue() + delta;
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

    // Can't change the number of mines left when playing a game
    if (!analysisMode) {
        return;
    }

    // Can't change the number of mines left during replay mode
    if (analysisMode && replayMode) {
        return;
    }

    //console.log("Mousewheel event at X=" + event.offsetX + ", Y=" + event.offsetY);

    const delta = Math.sign(event.deltaY);

    const digit = Math.floor(event.offsetX / DIGIT_WIDTH);

    //console.log("Mousewheel event at X=" + event.offsetX + ", Y=" + event.offsetY + ", digit=" + digit);

    let newCount = board.bombs_left;

    const digits = getDigitCount(newCount);

    if (digit == digits - 1) {
        newCount = newCount + delta; 
    } else if (digit == digits - 2) {
        newCount = newCount + delta * 10;
    } else {
        newCount = newCount + delta * 10;
    }

    const flagsPlaced = board.getFlagsPlaced();

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
        for (let i = 0; i < ev.dataTransfer.items.length; i++) {
            // If dropped items aren't files, reject them
            if (ev.dataTransfer.items[i].kind === 'file') {
                const file = ev.dataTransfer.items[i].getAsFile();
                console.log('... file[' + i + '].name = ' + file.name);

                if (file.name.endsWith(".mbf") || file.name.endsWith(".abf")) {
                    if (!analysisMode) {
                        newGameFromBlob(file);
                        break; // only process the first one
                    }
                } else if (file.name.endsWith(".msor")) {
                    loadReplayData(file);
                    break;
                } else { 
                    newBoardFromFile(file);
                    break; // only process the first one
                }
  
            }
        }
    } else {
        // Use DataTransfer interface to access the file(s)
        console.log("File Transfer Interface not supported");
        for (let i = 0; i < ev.dataTransfer.files.length; i++) {
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

    const message = { "header": board.getMessageHeader(), "actions": [] };

    for (let i = 0; i < actions.length; i++) {

        const action = actions[i];

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

    const solverStart = Date.now();

    const outbound = JSON.stringify(message);

    console.log("==> " + outbound);

    // either play locally or send to server
    let reply;
    if (PLAY_CLIENT_SIDE) {
        reply = await handleActions(message);
    } else {
        const json_data = await fetch("/data", {
            method: "POST",
            body: outbound,
            headers: new Headers({
                "Content-Type": "application/json"
            })
        });

        reply = await json_data.json();
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
    const tiles = [];
    const prevMineCounter = board.bombs_left;

    // apply the changes to the logical board
    for (let i = 0; i < reply.tiles.length; i++) {

        const target = reply.tiles[i];

        const index = target.index;
        const action = target.action;

        const tile = board.getTile(index);

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

        const value3BV = reply.header.value3BV;
        const solved3BV = reply.header.solved3BV;
        const actionsMade = reply.header.actions;

        let efficiency;
        if (reply.header.status == "won") {
            efficiency = (100 * value3BV / actionsMade).toFixed(2) + "%";
        } else {
            efficiency = (100 * solved3BV / actionsMade).toFixed(2) + "%";
        }

        // if the current game is no longer in play then no need to remember the games details
        currentGameDescription = null;
        localStorage.removeItem(GAME_DESCRIPTION_KEY);

        showMessage("The game has been " + reply.header.status + ". 3BV: " + solved3BV + "/" + value3BV + ",  Actions: " + actionsMade + ",  Efficiency: " + efficiency);
        return;
    }

    //const solverStart = Date.now();

    let assistedPlay = docFastPlay.checked;
    let assistedPlayHints;
    if (assistedPlay) {
        assistedPlayHints = board.findAutoMove();
        if (assistedPlayHints.length == 0) {
            assistedPlay = false;
        }
    } else {
        assistedPlayHints = [];
    }

    // do we want to show hints
    if (showHintsCheckBox.checked || autoPlayCheckBox.checked || assistedPlayHints.length != 0 || docOverlay.value != "none" || docHardcore.checked) {

        document.getElementById("canvas").style.cursor = "wait";

        const options = {};
        if (docPlayStyle.value == "flag") {
            options.playStyle = PLAY_STYLE_FLAGS;
        } else if (docPlayStyle.value == "noflag") {
            options.playStyle = PLAY_STYLE_NOFLAGS;
        } else if (docPlayStyle.value == "eff") {
            options.playStyle = PLAY_STYLE_EFFICIENCY;
        } else {
            options.playStyle = PLAY_STYLE_NOFLAGS_EFFICIENCY;
        } 

        if (docOverlay.value != "none" || docHardcore.checked) {
            options.fullProbability = true;
        } else {
            options.fullProbability = false;
        }

        let hints;
        let other;
        if (assistedPlay) {
            hints = assistedPlayHints;
            other = [];
        } else {
            const solve = await solver(board, options);  // look for solutions
            hints = solve.actions;
            other = solve.other;
        }

        const solverDuration = Date.now() - solverStart;

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
                const message = buildMessageFromActions(hints, true);  // send all safe actions

                const wait = Math.max(0, (CYCLE_DELAY - solverDuration));

                setTimeout(function () { sendActionsMessage(message) }, wait);

            } else if (hints.length > 0 && acceptGuessesCheckBox.checked) { // if we are accepting guesses

                //const hint = [];
                //hint.push(hints[0]);

                const message = buildMessageFromActions([hints[0]], false); // if we are guessing send only the first guess

                const wait = Math.max(0, (CYCLE_DELAY - solverDuration));

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

    const message = { "id": id };

    const outbound = JSON.stringify(message);
    console.log("==> " + outbound);

    // either client side or server side
    let reply;
    if (PLAY_CLIENT_SIDE) {
        reply = killGame(message);   
    } else {
        const json_data = await fetch("/kill", {
            method: "POST",
            body: outbound,
            headers: new Headers({
                "Content-Type": "application/json"
            })
        });
        reply = await json_data.json();
    }

    console.log("<== " + JSON.stringify(reply));

}

// generic function to make a div dragable (https://www.w3schools.com/howto/howto_js_draggable.asp)
function dragElement(elmnt) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
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
    const image = new Image();
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

    for (let i = 0; i <= 8; i++) {
        const file_path = "resources/images/" + i.toString() + ".png";
        images.push(load_image(file_path));
        const led_path = "resources/images/led" + i.toString() + ".svg";
        led_images.push(load_image(led_path));
    }

    led_images.push(load_image("resources/images/led9.svg"));

    images.push(load_image("resources/images/bomb.png"));
    images.push(load_image("resources/images/facingDown.png"));
    images.push(load_image("resources/images/flagged.png"));
    images.push(load_image("resources/images/flaggedWrong.png"));
    images.push(load_image("resources/images/exploded.png"));
    images.push(load_image("resources/images/skull.png"));

    console.log(images.length + ' Images Loaded');

}

function showMessage(text) {
    //messageLine.innerText = text;
    messageLine.innerHTML = text;
}

function prefixMessage(text) {
    if (messageLine.innerHTML != "") {
        showMessage(text + " - " + messageLine.innerHTML);
    } else {
        showMessage(text);
    }
    
}
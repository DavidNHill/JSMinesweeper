
"use strict";

console.log('At start of main.js');

const TILE_SIZE = 32;
const DIGIT_HEIGHT = 30;
const DIGIT_WIDTH = 18;

const CYCLE_DELAY = 100;  // minimum delay in milliseconds between processing cycles

// offset 0 - 8 are the numbers and the bomb, hidden and flagged images are defined below
const BOMB = 9;
const HIDDEN = 10;
const FLAGGED = 11;

const PLAY_CLIENT_SIDE = (location.hostname == "");

// holds the images
var images = [];
var imagesLoaded = 0;
var led_images = [];

var canvasLocked = false;   // we need to lock the canvas if we are auto playing to prevent multiple threads playing the same game

var canvas = document.getElementById('myCanvas');
var ctx = canvas.getContext('2d');

var ctxBombsLeft = document.getElementById('myMinesLeft').getContext('2d');

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
function startup() {

    console.log("At start up...");

    // add a listener for mouse clicks on the canvas
    canvas.addEventListener("mousedown", (event) => on_click(event));
    canvas.addEventListener('mousemove', followCursor, false);

    // build a new layout
    newGame(30, 16, 99, 0);

}

// render an array of tiles to the canvas
function renderHints(hints) {

    console.log(hints.length + " hints to render");

    ctxHints.clearRect(0, 0, canvasHints.width, canvasHints.height);

    for (var i = 0; i < hints.length; i++) {

        var hint = hints[i];

        if (hint.prob == 0) {   // mine
            ctxHints.fillStyle = "#FF0000";
        } else if (hint.prob == 1) {  // safe
            ctxHints.fillStyle = "#00FF00";
        } else if (hint.dead) {  // uncertain but dead
            ctxHints.fillStyle = "black";
        } else {  //uncertain
            ctxHints.fillStyle = "orange";
        }

        ctxHints.globalAlpha = 0.5;

        //console.log("Hint X=" + hint.x + " Y=" + hint.y);
        ctxHints.fillRect(hint.x * TILE_SIZE, hint.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);

    }


}

// render an array of tiles to the canvas
function renderTiles(tiles) {

    console.log(tiles.length + " tiles to render");

    for (var i = 0; i < tiles.length; i++) {
        var tile = tiles[i];
        var tileType = HIDDEN;

        if (tile.isBomb()) {
            tileType = BOMB;

        } else if (tile.isFlagged()) {
            tileType = FLAGGED;

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
    console.log(document.readyState);
    //if (document.readyState != "complete") {
    //    setTimeout(newGame(width, height, mines, seed), 100);
    //    return;
    //}
 
    console.log("Width=" + width + " Height=" + height + " mines=" + mines);

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

    if (gameTypeSafe.checked) {
        var gameType = "safe";
    } else {
        var gameType = "zero";
    }

    board = new Board(id, width, height, mines, seed, gameType);

    document.getElementById('board').style.width = width * TILE_SIZE + "px";
    document.getElementById('board').style.height = height * TILE_SIZE + "px";

    canvas.width = width * TILE_SIZE;
    canvas.height = height * TILE_SIZE;

    // keep the hints and the board canvas in step
    canvasHints.width = canvas.width;
    canvasHints.height = canvas.height;

    document.getElementById('display').width = width * TILE_SIZE;;

    for (var y = 0; y < height; y++) {
        for (var x = 0; x < width; x++) {
            draw(x, y, HIDDEN);
        }
    }

    updateMineCount(mines);

    canvasLocked = false;  // just in case it was still locked (after an error for example)

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

    //console.log("Following cursor at X=" + e.offsetX + ", Y=" + e.offsetY);

    tooltip.style.left = e.offsetX + 'px';
    tooltip.style.top = (e.offsetY - TILE_SIZE) + 'px';

    var row = Math.floor(event.offsetY / TILE_SIZE);
    var col = Math.floor(event.offsetX / TILE_SIZE);

    if (row >= board.height || row < 0 || col >= board.width || col < 0) {
        //console.log("outside of game boundaries!!");
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
    } else {
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
                //message = {"id" : board.getID(), "index" : board.xy_to_index(col, row), "action" : 2};					
            }
            // get the tile clicked and toggle the flag 

            //tile.toggleFlag();

            // add it to the array of tiles to be redrawn
            //tiles.push(tile);
        }
    }

    // one last check before we send the message
    if (canvasLocked) {
        console.log("The canvas is logically locked");
        return;
    } else {
        canvasLocked = true;
    }

    var reply = sendActionsMessage(message);


}

function buildMessageFromActions(actions) {

    var message = { "header": board.getMessageHeader(), "actions": [] };

    for (var i = 0; i < actions.length; i++) {

        var action = actions[i];

        if (action.prob == 0) {   // zero safe probability == mine
            message.actions.push({ "index": board.xy_to_index(action.x, action.y), "action": 2 });

        } else {   // otherwise we're trying to clear
            message.actions.push({ "index": board.xy_to_index(action.x, action.y), "action": 1 });
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

    if (reply.header.status == "lost" || reply.header.status == "won") {
        board.setGameover();
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

        } else if (action == 3) {  // clicked on a mine
            board.setGameover();
            tile.setBomb();
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

        return;
    }

    // do we want to show hints
    if (showHintsCheckBox.checked) {

        var solverStart = Date.now();

        var hints = solver(board);  // look for solutions

        var solverDuration = Date.now() - solverStart;

        if (board.id != reply.header.id) {
            console.log("Game when Solver started " + reply.header.id + " game now " + board.id + " ignoring solver results");
            canvasLocked = false;
            return;
        }

        window.requestAnimationFrame(() => renderHints(hints));

        if (autoPlayCheckBox.checked) {
            if (hints.length > 0 && (hints[0].prob == 1 || hints[0].prob == 0)) {
                var message = buildMessageFromActions(hints);

                var wait = Math.max(0, (CYCLE_DELAY - solverDuration));

                setTimeout(function () { sendActionsMessage(message) }, wait);

            } else if (hints.length > 0 && acceptGuessesCheckBox.checked) {

                var hint = [];
                hint.push(hints[0]);

                var message = buildMessageFromActions(hint); // if we are guessing send the first guess  

                var wait = Math.max(0, (CYCLE_DELAY - solverDuration));

                setTimeout(function () { sendActionsMessage(message) }, wait);

            } else {
                canvasLocked = false;
            }
        } else {
            canvasLocked = false;
        }

    } else {
        canvasLocked = false;
        window.requestAnimationFrame(() => renderHints([]));  // clear the hints overlay
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

    //var images = [];

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


    console.log(images.length + ' Images Loaded');

}
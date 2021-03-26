# JSMinesweeper

Play Minesweeper and analyse arbitrary positions at https://davidnhill.github.io/JSMinesweeper/

** this readme is a work in progress (the solver is fully functional) **

## Overview
This is a rewrite of my Java minesweeper solver in javascript. All the processing runs on the host machine. The purpose of the rewrite was to make the solver more accessable since there was reluctance to download a java executable. The trade off is that javascript is significantly slower than java to execute. 

The solver has a 40.5% win rate on classic expert (30x16/99 safe start in a corner) and 54% on modern expert (30x16/99 open start at (3,3)).

## How to use the player

The landing screen provides access to the Minesweeper player.  

Basic Option:
- Opening on start: Determines whether the first click is a guaranteed opening or only guaranteed safe.
- Beginner:  9x9/10.
- Intermediate: 16x16/40.
- Expert: 30x16/99.
- Custom: Define your own board size with a maximum height and width of 200.

Advanced options:
- Fast Mode: Trivial moves are played automatically, leaving only moves with logic to consider.
- Style - Flagging: Put a flag on mines when the solver discovers them.
- Style - No Flagging: Never place flags.
- Style - Efficiency: This option allows the solver to use chording and flags are only placed in an attempt to minimize the number of clicks required to solve the game. **This mode seriously impacts performance.**
- Show hints: The solver will shadow your play and highlight safe plays and (if necessary) what it considers the best guess
- Auto play: The solver will play the game for you until a guess is required. The solver will show what it considers the best guess, but you must make the final decision.
- Accept guesses: The solver will play the game until it is won or lost.

The analysis button can be used to force the solver to analyse the current games position.  This is useful if you have turned off all the solver options.


## How to use the Analyser

To access the analyser toggle select the 'Analysis mode' switch and press the *Reset board* button which has replaced the *New Game* button.

To start you are presented with a blank board which is either all *zeros* or all *hidden* depending on the option you have selected.

From here you can construct the position you wish to analyse. This is best done in the following order:
1. Use the left mouse button to toggle a tile from hidden to revealed.
2. Drag the mouse with the left mouse button down to toggle each tile the mouse passes over
3. Use the right mouse button to place and remove flags.  A flag is considered to be a mine by the solver, whether it is *knowable* from the position or not.
4. Placing and removing a flag will automatically adjust the values of revealed tiles adjacent to it.
5. Use the mousewheel to adjust the value of a revealed tile.  The value is constrained to be a legal value based on the adjacent tiles.
6. Use the mousewheel to adjust the mine count showing how many mines left to find.  The value can be adjusted by 10s or 1s depending on which digit the mouse is over

If the board is valid the **Analyse** button will be enabled and pressing this (or the 'a' hotkey) will start the analyser. 

The safe tiles are shown in green and the mines in red. If no certain move is available then the solver will highlight the move it considers best in yellow with a green centre.  Other moves it consider but rejected are shown in yellow. Tiles in highlighted in grey can have only one possible value and it is nver correct to play these when there are other moves available.

If you are playing a game and using the analyser to provide assistance then you can keep the mine count in step by selecting "Locak mine count".  Now every time a flag is placed the mine counter is reduced by one.

## What the solver does

TBC

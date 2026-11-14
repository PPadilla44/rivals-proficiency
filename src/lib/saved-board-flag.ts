/**
 * Runs before the first paint. The server draws the board as if nothing is saved, then the browser
 * reads the saved levels and the page jumped (the "Start here" tip and the guest sign-in card
 * disappeared, the side panels grew). This marks the page early so CSS can hide those bits from
 * the start. A visitor with nothing saved sees exactly what they saw before.
 * With the example board on for everyone, the server draws the example; a visitor with a saved board (or who
 * already finished the example) would see it for a moment, so the board is held hidden until Board marks it ready.
 * Keys match LS_LEVELS, LS_EXAMPLE_DONE and LS_CARD in Board.tsx and ScreenshotImport.tsx.
 */
export const SAVED_BOARD_SCRIPT = `(function(){
try{
var d=document.documentElement;
var raw=localStorage.getItem("proficiency-board-v1");
var l=raw&&JSON.parse(raw);
if(l&&l.levels&&typeof l.levels==="object"&&Object.keys(l.levels).length)d.setAttribute("data-saved-board","1");
if(localStorage.getItem("pb-import-card-hidden"))d.setAttribute("data-card-hidden","1");
if(localStorage.getItem("pb-example-done"))d.setAttribute("data-example-done","1");
}catch(e){}
})();`;

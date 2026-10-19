'use strict';
// Remembers the window's size and position between launches, and makes sure a saved position
// from a monitor that is no longer connected cannot place the window off screen.

const fs = require('node:fs');

const DEFAULTS = { width: 1440, height: 900 };
const MIN = { width: 1040, height: 680 };

function overlap(a, b) {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return Math.max(0, w) * Math.max(0, h);
}

/**
 * @param {{x?:number,y?:number,width?:number,height?:number,maximized?:boolean}|null} saved
 * @param {Array<{workArea:{x:number,y:number,width:number,height:number}}>} displays
 */
function fitToDisplays(saved, displays) {
  const area = (displays[0] && displays[0].workArea) || { x: 0, y: 0, width: 1920, height: 1080 };
  const state = {
    width: Math.max(MIN.width, Math.min(Number(saved && saved.width) || DEFAULTS.width, area.width)),
    height: Math.max(MIN.height, Math.min(Number(saved && saved.height) || DEFAULTS.height, area.height)),
    maximized: Boolean(saved && saved.maximized)
  };
  if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
    const box = { x: saved.x, y: saved.y, width: state.width, height: state.height };
    const visible = displays.some((d) => overlap(box, d.workArea) >= Math.min(box.width * box.height, 200 * 200));
    if (visible) { state.x = saved.x; state.y = saved.y; }
  }
  return state;
}

function load(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function save(file, state) {
  try {
    fs.writeFileSync(file, JSON.stringify(state));
  } catch {
    // Window state is a convenience. Never fail the app over it.
  }
}

module.exports = { fitToDisplays, load, save, DEFAULTS, MIN };

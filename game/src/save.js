// Save and load through localStorage: money, mission progress, health and
// where Dario stands. Everything is guarded, so a blocked storage just
// means no save rather than a broken game.

import { SAVE_KEY } from './config.js';

export function saveGame(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, ...state }));
    return true;
  } catch (e) {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== 1) return null;
    return data;
  } catch (e) {
    return null;
  }
}

export function hasSave() {
  return loadGame() !== null;
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (e) {}
}

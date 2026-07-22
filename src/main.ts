// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
/**
 * main.ts — bootstrap and wiring. Owns no rules; it moves the player between
 * screens and forwards taps into the Session.
 */

// feedback:begin (managed by hub/scripts/feedback/backfill.mjs)
import { mountFeedback } from './feedback';
mountFeedback();
// feedback:end

import './styles/mobile.css';
import './styles/main.css';

import { at, isRotatable, type Colour } from './game/board';
import {
  customPuzzle,
  dailyPuzzle,
  journeyPuzzle,
  parseShare,
  shareText,
  shareUrl,
  todayUTC,
  type Puzzle,
} from './game/levels';
import { Session } from './game/session';
import { createLoop } from './engine/loop';
import { hardenViewport } from './engine/mobile';
import { createSfx } from './engine/sound';
import { createStore } from './engine/storage';
import { View } from './render';
import { MARKUP, el, fmtTime, show, toast } from './ui';

const store = createStore('lumenlock');

const app = document.getElementById('app');
if (!app) throw new Error('missing #app');
app.innerHTML = MARKUP;

hardenViewport();

const sfx = createSfx(store.get('muted', false));
const prefersReduced =
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let reducedMotion = store.get('reducedMotion', prefersReduced);

const canvas = el<HTMLCanvasElement>('board');
const view = new View(canvas, reducedMotion);

const hud = el('hud');
const stage = el('stage');
const menu = el('menu');
const help = el('help');
const about = el('about');
const pause = el('pause');
const results = el('results');

type Screen = 'menu' | 'playing' | 'paused' | 'results';

let session: Session | null = null;
let screen: Screen = 'menu';
let cursor: { x: number; y: number } | null = null;
let lastTick = 0;

/** Highest journey level unlocked. */
const progress = (): number => Math.max(1, store.get('progress', 1));

// ---------------------------------------------------------------- screens

function setScreen(next: Screen): void {
  screen = next;
  const inGame = next !== 'menu';
  show(hud, inGame);
  show(stage, inGame);
  show(menu, next === 'menu');
  show(pause, next === 'paused');
  show(results, next === 'results');
  if (next === 'menu') {
    show(help, false);
    show(about, false);
  }
}

/**
 * A shared board is honoured once, then forgotten. Leaving `?d=`/`?l=` in the
 * URL means a reload — or reopening from a home-screen icon — silently drags
 * you back onto a board you already left, with no way to start a fresh one.
 */
function clearShareInUrl(): void {
  try {
    if (window.location.search) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  } catch {
    /* history is blocked in some embeds; the game still works */
  }
}

function startPuzzle(p: Puzzle): void {
  try {
    session = new Session(p);
  } catch {
    toast('Could not build that board — starting level 1');
    session = new Session(journeyPuzzle(1));
  }
  cursor = null;
  lastTick = performance.now();
  el('hudTitle').textContent = p.label;
  view.reset();
  view.resize(session.board.w);
  setScreen('playing');
  syncHud();
}

function toMenu(): void {
  session = null;
  clearShareInUrl();
  setScreen('menu');
  el<HTMLButtonElement>('btnPlay').textContent =
    progress() > 1 ? `Continue — level ${progress()}` : 'Play';
}

// ---------------------------------------------------------------- hud

function syncHud(): void {
  if (!session) return;
  const flips = el('statFlips');
  flips.innerHTML = `Flips <b>${session.flips}</b>`;
  flips.classList.toggle('is-under', session.solved && session.flips < session.par);
  el('statPar').innerHTML = `Par <b>${session.par}</b>`;
  el('statTime').textContent = fmtTime(session.elapsedMs);
}

// A puzzle's clock must keep time while the tab is backgrounded or not at all —
// rAF stops there, so the clock runs on an interval and simply doesn't count
// time the player wasn't present for.
window.setInterval(() => {
  if (screen !== 'playing' || !session || document.hidden) {
    lastTick = performance.now();
    return;
  }
  const now = performance.now();
  session.elapsedMs += now - lastTick;
  lastTick = now;
  syncHud();
}, 250);

document.addEventListener('visibilitychange', () => {
  // Don't bill the player for time spent in another tab.
  if (document.hidden && screen === 'playing') openPause();
});

// ---------------------------------------------------------------- input

function applyFlip(x: number, y: number): void {
  if (!session || screen !== 'playing') return;
  const cell = at(session.board, x, y);
  if (!isRotatable(cell)) {
    // Tapping scenery should say "not that" rather than nothing at all.
    if (cell.kind !== 'empty') view.kick(2);
    return;
  }

  const i = y * session.board.w + x;
  const from = cell.state ?? 0;
  const result = session.flipAt(x, y);
  if (!result.changed) return;

  view.noteFlip(i, from, from === 1 ? 0 : 1);
  sfx.play('flip');

  for (const ci of result.newlyLit) {
    const cx = ci % session.board.w;
    const cy = Math.floor(ci / session.board.w);
    const want = session.board.cells[ci].colour ?? 7;
    view.burst(cx, cy, want as Colour);
    view.kick(3);
    sfx.play(want === 1 ? 'lockRed' : want === 2 ? 'lockGreen' : 'lockBlue');
  }
  if (result.wentDark.length > 0 && !result.justSolved) sfx.play('unlit');

  syncHud();
  if (result.justSolved) finish();
}

canvas.addEventListener('pointerdown', (e) => {
  sfx.unlock();
  if (screen !== 'playing') return;
  const hit = view.cellAt(e.clientX, e.clientY);
  if (!hit) return;
  cursor = null;
  applyFlip(hit.x, hit.y);
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!help.hidden) return show(help, false);
    if (!about.hidden) return show(about, false);
    if (screen === 'playing') return openPause();
    if (screen === 'paused') return resume();
    return;
  }

  if (screen !== 'playing' || !session) return;
  const k = e.key.toLowerCase();

  if (k === 'r') return restart();
  if (k === 'h') return show(help, true);
  if (k === 'm') return toggleMute();

  const move: Record<string, [number, number]> = {
    arrowup: [0, -1],
    w: [0, -1],
    arrowdown: [0, 1],
    s: [0, 1],
    arrowleft: [-1, 0],
    a: [-1, 0],
    arrowright: [1, 0],
    d: [1, 0],
  };
  if (move[k]) {
    e.preventDefault();
    const [dx, dy] = move[k];
    const c = cursor ?? { x: 0, y: 0 };
    cursor = {
      x: Math.min(session.board.w - 1, Math.max(0, c.x + (cursor ? dx : 0))),
      y: Math.min(session.board.h - 1, Math.max(0, c.y + (cursor ? dy : 0))),
    };
    sfx.unlock();
    return;
  }
  if ((k === ' ' || k === 'enter') && cursor) {
    e.preventDefault();
    sfx.unlock();
    applyFlip(cursor.x, cursor.y);
  }
});

// ---------------------------------------------------------------- flow

function finish(): void {
  if (!session) return;
  view.celebrate();
  sfx.play('solve');
  if (session.perfect) window.setTimeout(() => sfx.play('perfect'), 260);

  // Bloom every crystal, not just the last one.
  for (let i = 0; i < session.board.cells.length; i++) {
    const c = session.board.cells[i];
    if (c.kind !== 'crystal') continue;
    view.burst(i % session.board.w, Math.floor(i / session.board.w), (c.colour ?? 7) as Colour, 20);
  }

  const { puzzle, flips, par, elapsedMs } = session;
  const bestKey = `best:${puzzle.seed}`;
  const prev = store.get<{ flips: number; ms: number } | null>(bestKey, null);
  const isBest = !prev || flips < prev.flips || (flips === prev.flips && elapsedMs < prev.ms);
  if (isBest) store.set(bestKey, { flips, ms: elapsedMs });

  if (puzzle.mode === 'journey' && puzzle.level >= progress()) {
    store.set('progress', puzzle.level + 1);
  }
  if (puzzle.mode === 'daily' && puzzle.date) {
    store.set(`daily:${puzzle.date}`, { flips, ms: elapsedMs, par });
  }

  el('resSub').textContent = puzzle.label;
  el('resFlips').textContent = String(flips);
  el('resPar').textContent = String(par);
  el('resTime').textContent = fmtTime(elapsedMs);

  // Par is an exhaustively-verified minimum, so hitting it is genuinely the
  // best that can be done — and going under it is impossible.
  const verdict = el('resVerdict');
  if (flips <= par) {
    verdict.className = 'verdict under';
    verdict.textContent = 'Perfect — no shorter solution exists';
  } else {
    const over = flips - par;
    verdict.className = 'verdict over';
    verdict.textContent = `${over} flip${over === 1 ? '' : 's'} over — it can be done in ${par}`;
  }

  const best = store.get<{ flips: number; ms: number } | null>(bestKey, null);
  el('resBest').textContent =
    prev && !isBest
      ? `Your best on this board: ${prev.flips} flips in ${fmtTime(prev.ms)}`
      : best && prev
        ? 'New personal best on this board!'
        : '';

  show(el('btnNext'), puzzle.mode === 'journey');
  el<HTMLButtonElement>('btnNext').textContent = `Next — level ${puzzle.level + 1}`;

  // Let the bloom play before the panel covers it.
  window.setTimeout(() => setScreen('results'), 900);
}

function restart(): void {
  if (!session) return;
  session.restart();
  lastTick = performance.now();
  view.reset();
  sfx.play('select');
  setScreen('playing');
  syncHud();
}

function openPause(): void {
  if (screen !== 'playing') return;
  setScreen('paused');
}

function resume(): void {
  if (screen !== 'paused') return;
  lastTick = performance.now();
  setScreen('playing');
}

function toggleMute(): void {
  const next = !sfx.muted();
  sfx.setMuted(next);
  store.set('muted', next);
  el('btnMute').textContent = next ? '🔇' : '♪';
  el('setSound').textContent = next ? 'Off' : 'On';
  if (!next) sfx.play('select');
}

async function shareResult(): Promise<void> {
  if (!session) return;
  const url = shareUrl(session.puzzle, window.location.origin);
  const text = shareText(
    session.puzzle,
    session.flips,
    session.par,
    Math.round(session.elapsedMs / 1000),
  );
  const payload = `${text}\n${url}`;

  try {
    if (navigator.share) {
      await navigator.share({ title: 'Lumenlock', text, url });
      return;
    }
  } catch {
    // A cancelled share throws; fall through to the clipboard rather than
    // reporting an error the player caused on purpose.
  }
  try {
    await navigator.clipboard.writeText(payload);
    toast('Result and link copied');
  } catch {
    toast(url);
  }
}

// ---------------------------------------------------------------- buttons

const on = (id: string, fn: () => void): void => {
  el(id).addEventListener('click', () => {
    sfx.unlock();
    fn();
  });
};

on('btnPlay', () => {
  sfx.play('select');
  startPuzzle(journeyPuzzle(progress()));
});
on('btnDaily', () => {
  sfx.play('select');
  startPuzzle(dailyPuzzle(todayUTC()));
});
on('btnRandom', () => {
  sfx.play('select');
  const seed = Math.random().toString(36).slice(2, 8);
  startPuzzle(customPuzzle(seed, Math.min(20, progress() + 2)));
});
on('btnHelpMenu', () => show(help, true));
on('btnAbout', () => show(about, true));
on('btnHelpClose', () => {
  store.set('helpSeen', true);
  show(help, false);
});
on('btnAboutClose', () => show(about, false));
on('btnHelp', () => show(help, true));
on('btnMute', toggleMute);
on('setSound', toggleMute);
on('setMotion', () => {
  reducedMotion = !reducedMotion;
  view.reduced = reducedMotion;
  store.set('reducedMotion', reducedMotion);
  el('setMotion').textContent = reducedMotion ? 'On' : 'Off';
});
on('btnRestart', restart);
on('btnPause', openPause);
on('btnResume', resume);
on('btnPauseRestart', restart);
on('btnPauseHelp', () => show(help, true));
on('btnPauseMenu', toMenu);
on('btnAgain', restart);
on('btnResMenu', toMenu);
on('btnShare', () => void shareResult());
on('btnNext', () => {
  if (!session) return;
  startPuzzle(journeyPuzzle(session.puzzle.level + 1));
});

// Close an overlay by clicking its backdrop.
for (const overlay of [help, about]) {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) show(overlay, false);
  });
}

// ---------------------------------------------------------------- loop

const loop = createLoop({
  update: (dt) => view.update(dt),
  render: () => {
    if (!session || (screen !== 'playing' && screen !== 'paused' && screen !== 'results')) return;
    if (!view.ready) view.resize(session.board.w);
    view.draw({
      board: session.board,
      trace: session.trace,
      cursor: screen === 'playing' ? cursor : null,
      solved: session.solved,
    });
  },
});
loop.start();

const onResize = (): void => {
  if (session) view.resize(session.board.w);
};
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', onResize);

// ---------------------------------------------------------------- boot

el('btnMute').textContent = sfx.muted() ? '🔇' : '♪';
el('setSound').textContent = sfx.muted() ? 'Off' : 'On';
el('setMotion').textContent = reducedMotion ? 'On' : 'Off';

const shared = parseShare(window.location.search);
if (shared) {
  startPuzzle(shared);
  toast(shared.mode === 'daily' ? "Today's Daily Lock" : 'Shared board');
} else {
  toMenu();
}

if (!store.get('helpSeen', false)) show(help, true);

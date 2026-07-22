// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
/**
 * levels.ts — which board you're playing, and how a link names it.
 *
 * Seeds are plain strings so a share link is human-readable and stable forever:
 * journey level 5 is `lumenlock-journey-5` on every device, for all time. The
 * URL only ever carries the NAME of a board, never the board itself.
 */

import { hashSeed } from '../engine/rng';
import { generateLevel, levelConfig, type Level } from './generate';

export type Mode = 'journey' | 'daily' | 'custom';

export interface Puzzle {
  mode: Mode;
  /** Difficulty index. For daily/custom this only selects the config. */
  level: number;
  seed: string;
  /** For daily. */
  date?: string;
  /** Human label for the HUD. */
  label: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const journeySeed = (level: number): string => `lumenlock-journey-${level}`;
export const dailySeed = (date: string): string => `lumenlock-daily-${date}`;
export const customSeed = (seed: string): string => `lumenlock-custom-${seed}`;

/** Today in UTC, so the Daily rolls at the same instant everywhere. */
export function todayUTC(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** The Daily's difficulty wobbles across the week but is fixed per date. */
export function dailyLevelFor(date: string): number {
  return 8 + (hashSeed(date) % 5);
}

export function journeyPuzzle(level: number): Puzzle {
  const n = Math.max(1, Math.floor(level));
  return { mode: 'journey', level: n, seed: journeySeed(n), label: `Level ${n}` };
}

export function dailyPuzzle(date: string): Puzzle {
  return {
    mode: 'daily',
    level: dailyLevelFor(date),
    seed: dailySeed(date),
    date,
    label: `Daily Lock · ${date}`,
  };
}

export function customPuzzle(seed: string, level: number): Puzzle {
  const n = Math.max(1, Math.floor(level));
  return { mode: 'custom', level: n, seed: customSeed(seed), label: `Shared board · ${seed}` };
}

export function buildLevel(p: Puzzle): Level {
  return generateLevel(p.seed, levelConfig(p.level));
}

/**
 * Read a shared board out of the URL. Returns null for a bare visit.
 *
 * Anything malformed resolves to null rather than throwing — a mangled link
 * pasted through three chat apps should drop you on the menu, not a stack
 * trace.
 */
export function parseShare(search: string): Puzzle | null {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return null;
  }

  const d = params.get('d');
  if (d && DATE_RE.test(d)) return dailyPuzzle(d);

  const rawLevel = params.get('l');
  const level = rawLevel ? Number.parseInt(rawLevel, 10) : NaN;

  const s = params.get('s');
  if (s && s.length > 0 && s.length <= 32) {
    return customPuzzle(s, Number.isFinite(level) && level > 0 ? level : 8);
  }

  if (Number.isFinite(level) && level > 0 && level <= 999) return journeyPuzzle(level);

  return null;
}

/** The link to hand a friend. */
export function shareUrl(p: Puzzle, origin: string): string {
  const base = origin.replace(/\/+$/, '') + '/';
  if (p.mode === 'daily' && p.date) return `${base}?d=${p.date}`;
  if (p.mode === 'custom') {
    const raw = p.seed.replace(/^lumenlock-custom-/, '');
    return `${base}?s=${encodeURIComponent(raw)}&l=${p.level}`;
  }
  return `${base}?l=${p.level}`;
}

/** The text that goes in the chat app, where the actual comparing happens. */
export function shareText(p: Puzzle, flips: number, par: number, seconds: number): string {
  const t = `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  const verdict = flips <= par ? ' — perfect!' : ` — ${flips - par} over`;
  return `Lumenlock · ${p.label}\nSolved in ${flips} flips (best possible ${par}) in ${t}${verdict}`;
}

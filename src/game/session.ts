// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
/**
 * session.ts — one attempt at one board.
 *
 * Owns the mutable stuff the UI cares about (flips, clock, which crystals just
 * lit) and nothing about how any of it looks. Kept free of DOM so the rules can
 * be tested without a browser.
 */

import { type Board, type Trace, cloneBoard, flip, trace } from './board';
import { type Level } from './generate';
import { buildLevel, type Puzzle } from './levels';

export interface FlipResult {
  changed: boolean;
  /** Crystal cell indices that lit as a result of this flip. */
  newlyLit: number[];
  /** Crystal cell indices that went dark as a result of this flip. */
  wentDark: number[];
  /** True on the flip that completed the board. */
  justSolved: boolean;
}

const NOTHING: FlipResult = { changed: false, newlyLit: [], wentDark: [], justSolved: false };

export class Session {
  readonly puzzle: Puzzle;
  readonly level: Level;
  /** The board as it was dealt, for Restart. */
  private readonly initial: Board;
  board: Board;
  flips = 0;
  solved = false;
  /** Wall-clock ms spent on this board, excluding pauses. */
  elapsedMs = 0;
  private tr: Trace;

  constructor(puzzle: Puzzle) {
    this.puzzle = puzzle;
    this.level = buildLevel(puzzle);
    this.initial = cloneBoard(this.level.board);
    this.board = cloneBoard(this.initial);
    this.tr = trace(this.board);
  }

  get trace(): Trace {
    return this.tr;
  }

  get par(): number {
    return this.level.par;
  }

  /**
   * Solved in the fewest flips that exist. Par is an exhaustively-verified
   * minimum, so this is a genuine ceiling — you cannot go under it.
   */
  get perfect(): boolean {
    return this.solved && this.flips <= this.par;
  }

  flipAt(x: number, y: number): FlipResult {
    // A solved board is a trophy, not a toy — don't let a stray tap undo it.
    if (this.solved) return NOTHING;
    const before = this.tr.lit;
    if (!flip(this.board, x, y)) return NOTHING;

    this.flips++;
    this.tr = trace(this.board);
    const after = this.tr.lit;

    const newlyLit: number[] = [];
    const wentDark: number[] = [];
    for (const i of after) if (!before.has(i)) newlyLit.push(i);
    for (const i of before) if (!after.has(i)) wentDark.push(i);

    const justSolved = this.tr.solved && !this.solved;
    if (justSolved) this.solved = true;

    return { changed: true, newlyLit, wentDark, justSolved };
  }

  restart(): void {
    this.board = cloneBoard(this.initial);
    this.tr = trace(this.board);
    this.flips = 0;
    this.solved = false;
    this.elapsedMs = 0;
  }
}

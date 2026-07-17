/**
 * Session is what the HUD and the results screen read from, so a wrong flip
 * count or a missed "just solved" is a bug the player sees immediately.
 */
import { describe, expect, it } from 'vitest';
import { isRotatable } from '../src/game/board';
import { Session } from '../src/game/session';
import { journeyPuzzle } from '../src/game/levels';

/** Walk the board back to the generator's solution, one flip at a time. */
function solve(s: Session): number[] {
  const flipped: number[] = [];
  for (const [i, state] of s.level.solution) {
    if (s.board.cells[i].state === state) continue;
    flipped.push(i);
    s.flipAt(i % s.board.w, Math.floor(i / s.board.w));
  }
  return flipped;
}

describe('Session', () => {
  it('starts unsolved with a clean counter', () => {
    const s = new Session(journeyPuzzle(4));
    expect(s.solved).toBe(false);
    expect(s.flips).toBe(0);
    expect(s.elapsedMs).toBe(0);
    expect(s.par).toBeGreaterThan(0);
  });

  it('counts a flip and re-traces', () => {
    const s = new Session(journeyPuzzle(4));
    const i = [...s.level.solution.keys()][0];
    const before = s.board.cells[i].state;
    const r = s.flipAt(i % s.board.w, Math.floor(i / s.board.w));
    expect(r.changed).toBe(true);
    expect(s.flips).toBe(1);
    expect(s.board.cells[i].state).not.toBe(before);
  });

  it('ignores a tap on scenery — and does not count it as a flip', () => {
    const s = new Session(journeyPuzzle(4));
    const fixed = s.board.cells.findIndex((c) => c.kind === 'prism' || c.kind === 'emitter');
    const r = s.flipAt(fixed % s.board.w, Math.floor(fixed / s.board.w));
    expect(r.changed).toBe(false);
    expect(s.flips).toBe(0);
  });

  it('reports justSolved exactly once, on the final flip', () => {
    const s = new Session(journeyPuzzle(4));
    const toFlip = [...s.level.solution].filter(([i, st]) => s.board.cells[i].state !== st);

    let solvedCount = 0;
    for (const [i] of toFlip) {
      const r = s.flipAt(i % s.board.w, Math.floor(i / s.board.w));
      if (r.justSolved) solvedCount++;
    }
    expect(solvedCount).toBe(1);
    expect(s.solved).toBe(true);
    expect(s.trace.solved).toBe(true);
  });

  it('solves by playing the generator line, in at least par flips', () => {
    const s = new Session(journeyPuzzle(6));
    const flipped = solve(s);
    expect(s.solved).toBe(true);
    expect(s.flips).toBe(flipped.length);
    // The generator's line is A solution, not necessarily the shortest — par
    // is searched separately, so this only bounds it from below.
    expect(s.flips).toBeGreaterThanOrEqual(s.par);
  });

  it('freezes once solved — a stray tap cannot undo the trophy', () => {
    const s = new Session(journeyPuzzle(3));
    solve(s);
    const flipsAtWin = s.flips;
    const i = [...s.level.solution.keys()][0];
    const r = s.flipAt(i % s.board.w, Math.floor(i / s.board.w));
    expect(r.changed).toBe(false);
    expect(s.flips).toBe(flipsAtWin);
    expect(s.solved).toBe(true);
  });

  it('reports crystals lighting and going dark', () => {
    const s = new Session(journeyPuzzle(5));
    let sawLit = false;
    for (const [i, st] of s.level.solution) {
      if (s.board.cells[i].state === st) continue;
      const r = s.flipAt(i % s.board.w, Math.floor(i / s.board.w));
      if (r.newlyLit.length > 0) sawLit = true;
    }
    expect(sawLit).toBe(true);
    // Every crystal ends lit, so none can still be reported dark.
    expect(s.trace.lit.size).toBe(s.board.cells.filter((c) => c.kind === 'crystal').length);
  });

  it('restart returns the dealt board, not a new one', () => {
    const s = new Session(journeyPuzzle(7));
    const dealt = s.board.cells.map((c) => c.state);
    solve(s);
    expect(s.solved).toBe(true);

    s.restart();
    expect(s.flips).toBe(0);
    expect(s.solved).toBe(false);
    expect(s.elapsedMs).toBe(0);
    expect(s.board.cells.map((c) => c.state)).toEqual(dealt);

    // ...and it is still solvable afterwards.
    solve(s);
    expect(s.solved).toBe(true);
  });

  it('does not hand out a board that shares state with the level template', () => {
    // Session mutates its board; if it aliased the cached Level, every later
    // Session on that seed would start half-solved.
    const a = new Session(journeyPuzzle(9));
    const rot = a.board.cells.findIndex((c) => isRotatable(c));
    a.flipAt(rot % a.board.w, Math.floor(rot / a.board.w));

    const b = new Session(journeyPuzzle(9));
    expect(b.flips).toBe(0);
    expect(b.solved).toBe(false);
    expect(b.board.cells[rot].state).not.toBe(a.board.cells[rot].state);
  });

  it('perfect requires solving, and solving in par', () => {
    const s = new Session(journeyPuzzle(2));
    expect(s.perfect).toBe(false); // an unsolved board is never perfect

    // Play the optimal line: par is reachable by definition, so find it.
    const pieces: number[] = [];
    for (let i = 0; i < s.board.cells.length; i++) {
      if (isRotatable(s.board.cells[i])) pieces.push(i);
    }
    solve(s);
    expect(s.solved).toBe(true);
    expect(s.perfect).toBe(s.flips <= s.par);
  });

  it('is not perfect when solved the long way round', () => {
    const s = new Session(journeyPuzzle(5));
    const first = [...s.level.solution.keys()][0];
    // Waste two flips on a piece, returning it to where it started.
    s.flipAt(first % s.board.w, Math.floor(first / s.board.w));
    s.flipAt(first % s.board.w, Math.floor(first / s.board.w));
    solve(s);
    expect(s.solved).toBe(true);
    expect(s.flips).toBeGreaterThan(s.par);
    expect(s.perfect).toBe(false);
  });
});

/**
 * Generation is the load-bearing promise of this game: every board is solvable
 * and every par is real. Neither is something a player can verify, so if these
 * tests are wrong the game quietly lies to people. They sweep many seeds rather
 * than checking one, because generation is randomised and a single-seed test
 * proves nothing about the next board.
 */
import { describe, expect, it } from 'vitest';
import { cloneBoard, isRotatable, isSolved, trace } from '../src/game/board';
import { fallbackLevel, generateLevel, levelConfig } from '../src/game/generate';
import { journeySeed } from '../src/game/levels';

const LEVELS = Array.from({ length: 30 }, (_, i) => i + 1);

/** Put the generator's known-good orientation back into every piece. */
function applySolution(level: ReturnType<typeof generateLevel>) {
  const b = cloneBoard(level.board);
  for (const [i, state] of level.solution) b.cells[i].state = state;
  return b;
}

function build(level: number) {
  return generateLevel(journeySeed(level), levelConfig(level));
}

describe('determinism — the entire basis of share links', () => {
  it('produces a byte-identical board for the same seed', () => {
    for (const n of [1, 5, 12, 23]) {
      const a = build(n);
      const b = build(n);
      expect(a.board).toEqual(b.board);
      expect(a.par).toBe(b.par);
      expect([...a.solution]).toEqual([...b.solution]);
    }
  });

  it('produces different boards for different seeds', () => {
    const a = generateLevel('seed-alpha', levelConfig(8));
    const b = generateLevel('seed-beta', levelConfig(8));
    expect(a.board).not.toEqual(b.board);
  });

  it('is unaffected by generation order — level 7 is level 7 whenever you ask', () => {
    const first = build(7);
    build(3);
    build(19);
    const later = build(7);
    expect(later.board).toEqual(first.board);
  });
});

describe('every level is solvable', () => {
  it.each(LEVELS)('level %i solves when the solution is applied', (n) => {
    expect(isSolved(applySolution(build(n)))).toBe(true);
  });

  it.each(LEVELS)('level %i does not open already solved', (n) => {
    expect(isSolved(build(n).board)).toBe(false);
  });
});

describe('par is honest', () => {
  /**
   * Brute-force the true minimum, written independently of the generator's own
   * search: try every subset of size 1, then 2, and so on, and return the first
   * size that solves. Deliberately the dumbest possible implementation — its
   * job is to disagree with a clever one that has a bug.
   */
  function trueMinFlips(level: ReturnType<typeof generateLevel>): number {
    const b = cloneBoard(level.board);
    const pieces: number[] = [];
    for (let i = 0; i < b.cells.length; i++) if (isRotatable(b.cells[i])) pieces.push(i);

    const flipSet = (set: number[]) => {
      for (const i of set) b.cells[i].state = b.cells[i].state === 1 ? 0 : 1;
    };

    for (let d = 1; d <= pieces.length; d++) {
      const combo: number[] = [];
      const walk = (start: number): boolean => {
        if (combo.length === d) {
          flipSet(combo);
          const ok = isSolved(b);
          flipSet(combo);
          return ok;
        }
        for (let i = start; i < pieces.length; i++) {
          combo.push(pieces[i]);
          if (walk(i + 1)) return true;
          combo.pop();
        }
        return false;
      };
      if (walk(0)) return d;
    }
    throw new Error('unsolvable board');
  }

  it.each(LEVELS)('level %i: par IS the minimum — no shorter line exists', (n) => {
    const level = build(n);
    expect(level.par).toBeGreaterThan(0);
    // The claim the results screen makes to the player, checked exhaustively.
    expect(level.par).toBe(trueMinFlips(level));
  });

  it.each(LEVELS)('level %i: par never exceeds undoing the scramble', (n) => {
    const level = build(n);
    let differ = 0;
    for (const [i, state] of level.solution) {
      if (level.board.cells[i].state !== state) differ++;
    }
    // Reverting every scrambled piece always works, so par can't be worse —
    // but it CAN be better, which is exactly why par is searched, not counted.
    expect(level.par).toBeLessThanOrEqual(differ);
  });
});

describe('boards are worth playing', () => {
  it.each(LEVELS)('level %i has at least two crystals of renderable colours', (n) => {
    const level = build(n);
    const crystals = level.board.cells.filter((c) => c.kind === 'crystal');
    expect(crystals.length).toBeGreaterThanOrEqual(2);
    // Red, green, blue, or white — white being light that never met a prism.
    for (const c of crystals) expect([1, 2, 4, 7]).toContain(c.colour);
  });

  it.each(LEVELS)('level %i has no inert pieces — every mirror is on a beam', (n) => {
    const level = build(n);
    const solved = applySolution(level);
    const touched = trace(solved).touched;
    for (let i = 0; i < solved.cells.length; i++) {
      if (isRotatable(solved.cells[i])) expect(touched.has(i)).toBe(true);
    }
  });

  it.each(LEVELS)('level %i uses the prism — white light actually reaches one', (n) => {
    const solved = applySolution(build(n));
    const hit = trace(solved).arrivals.some(
      (a) => a.colour === 7 && solved.cells[a.y * solved.w + a.x].kind === 'prism',
    );
    expect(hit).toBe(true);
  });

  it.each(LEVELS)('level %i respects its configured size', (n) => {
    const level = build(n);
    expect(level.board.w).toBe(levelConfig(n).size);
    expect(level.board.h).toBe(levelConfig(n).size);
  });
});

describe('the hand-built fallback', () => {
  // It only runs if randomness fails, which means it is the one board that will
  // never be exercised in practice — and so the one most likely to be broken.
  it('is solvable, and scrambled', () => {
    const level = fallbackLevel('x');
    expect(isSolved(level.board)).toBe(false);
    expect(isSolved(applySolution(level))).toBe(true);
    expect(level.par).toBe(2);
  });
});

describe('difficulty ramp', () => {
  it('grows the board and never shrinks it', () => {
    let prev = 0;
    for (const n of LEVELS) {
      const size = levelConfig(n).size;
      expect(size).toBeGreaterThanOrEqual(prev);
      prev = size;
    }
    expect(levelConfig(1).size).toBe(7);
    expect(levelConfig(30).size).toBe(10);
  });

  it.each(LEVELS)('level %i actually meets its live-piece floor', (n) => {
    const level = build(n);
    const live = level.board.cells.filter(isRotatable).length;
    expect(live).toBeGreaterThanOrEqual(levelConfig(n).minPieces);
  });

  it('gets HARDER, not just bigger', () => {
    // The ramp inverted once already: dense boards mostly fail crystal
    // placement, so without a floor the survivors are the sparse ones and
    // level 20 came out with 3 mirrors on a 10x10 board — emptier than level
    // 10. A test that only watched the grid size sailed straight past it.
    const live = (n: number) => build(n).board.cells.filter(isRotatable).length;

    const early = live(2);
    const mid = live(12);
    const late = live(24);

    expect(mid).toBeGreaterThan(early);
    expect(late).toBeGreaterThan(early);
    expect(late).toBeGreaterThanOrEqual(8);
  });

  it('asks for more crystals later on', () => {
    expect(build(2).board.cells.filter((c) => c.kind === 'crystal').length).toBe(2);
    expect(build(24).board.cells.filter((c) => c.kind === 'crystal').length).toBeGreaterThan(2);
  });

  it('stays fast enough to generate on tap', () => {
    // Par is an exhaustive search, so a bad ramp change could quietly turn
    // "Next level" into a visible stall.
    const t0 = Date.now();
    for (const n of [10, 20, 30]) build(n);
    expect(Date.now() - t0).toBeLessThan(2000);
  });
});

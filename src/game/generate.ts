/**
 * generate.ts — deterministic level generation.
 *
 * The rule here is that we never design a puzzle and hope it works. We build a
 * SOLVED board first, read the crystals off the light it actually produces, and
 * only then scramble it. That makes two properties true by construction rather
 * than by luck:
 *
 *   - every level is solvable, and
 *   - par is real (it is literally the number of pieces we flipped).
 *
 * Everything draws from a seeded Rng, so `?l=5` is the same board for everyone.
 */

import {
  type Board,
  type Cell,
  type Colour,
  type Dir,
  type Orient,
  at,
  cloneBoard,
  idx,
  isRotatable,
  trace,
  B,
  G,
  R,
  WHITE,
} from './board';
import { makeRng, randInt, shuffle, type Rng } from '../engine/rng';

export interface LevelConfig {
  /** Board is size×size. */
  size: number;
  prisms: number;
  /** How many mirrors/splitters to scatter before pruning. */
  pieces: number;
  /** Target crystal count. */
  crystals: number;
  /** How many pieces to flip out of true. An upper bound on par. */
  scramble: number;
  /**
   * Reject a board with fewer live pieces than this.
   *
   * Without it the ramp silently inverts. Dense boards usually FAIL crystal
   * placement (beams cross, and a crystal absorbs light another one needed), so
   * the attempts that survive are the sparse ones — and level 20 comes out
   * emptier than level 10 on a bigger grid. The generator has to be told that
   * an easy board is not an acceptable answer to a hard request.
   */
  minPieces: number;
}

export interface Level {
  /** The scrambled, playable board. */
  board: Board;
  /** The generator's known-good orientations, by cell index. */
  solution: Map<number, Orient>;
  /**
   * The TRUE minimum number of flips, found by exhaustive search. Not "how many
   * we scrambled" — that is only an upper bound, and quoting it would mean
   * congratulating players for beating a number we made up.
   */
  par: number;
  seed: string;
  config: LevelConfig;
}

/** Difficulty ramp. Bigger boards, more prisms, more light to untangle. */
export function levelConfig(level: number): LevelConfig {
  const size = level <= 6 ? 7 : level <= 12 ? 8 : level <= 18 ? 9 : 10;
  return {
    size,
    prisms: level >= 10 ? 2 : 1,
    pieces: Math.min(20, 5 + level),
    crystals: Math.min(4, 2 + Math.floor(level / 6)),
    scramble: Math.min(8, 1 + Math.ceil(level / 2)),
    minPieces: Math.min(9, 3 + Math.floor(level / 3)),
  };
}

const MIN_CRYSTALS = 2;
const MAX_ATTEMPTS = 1200;

function emptyBoard(size: number): Board {
  const cells: Cell[] = [];
  for (let i = 0; i < size * size; i++) cells.push({ kind: 'empty' });
  return { w: size, h: size, cells };
}

/** Put the emitter on a border edge (never a corner) firing inward. */
function placeEmitter(b: Board, rng: Rng): void {
  const side = randInt(rng, 0, 3);
  const n = randInt(rng, 1, b.w - 2);
  const spots: Record<number, { x: number; y: number; dir: Dir }> = {
    0: { x: n, y: 0, dir: 2 },
    1: { x: b.w - 1, y: n, dir: 3 },
    2: { x: n, y: b.h - 1, dir: 0 },
    3: { x: 0, y: n, dir: 1 },
  };
  const { x, y, dir } = spots[side];
  b.cells[idx(b, x, y)] = { kind: 'emitter', dir };
}

/** Does white light actually reach a prism? Without that it's a mirror maze. */
function whiteHitsPrism(b: Board): boolean {
  for (const beam of trace(b).arrivals) {
    if (beam.colour === WHITE && at(b, beam.x, beam.y).kind === 'prism') return true;
  }
  return false;
}

/**
 * Grow crystals one at a time, re-tracing after each. A crystal ABSORBS the
 * beam it sits on, so placing one can starve another that was being fed
 * downstream — the only way to know is to look. Returns the cells placed.
 */
function growCrystals(b: Board, rng: Rng, want: number): number[] {
  const placed: number[] = [];
  const usedColours = new Set<Colour>();

  for (let n = 0; n < want; n++) {
    const exits = trace(b).exits.filter((e) => b.cells[idx(b, e.x, e.y)].kind === 'empty');
    const candidates = shuffle(rng, exits);
    // Prefer an unused colour — three red crystals is legal and pointless.
    candidates.sort((p, q) => Number(usedColours.has(p.colour)) - Number(usedColours.has(q.colour)));

    let ok = false;
    for (const cand of candidates) {
      const i = idx(b, cand.x, cand.y);
      const before = b.cells[i];
      b.cells[i] = { kind: 'crystal', colour: cand.colour };
      if (trace(b).solved) {
        placed.push(i);
        usedColours.add(cand.colour);
        ok = true;
        break;
      }
      b.cells[i] = before;
    }
    if (!ok) break;
  }
  return placed;
}

/** Walk every d-sized subset of `items`, stopping early once `fn` returns true. */
function eachCombo(items: number[], d: number, fn: (combo: number[]) => boolean): boolean {
  const combo: number[] = [];
  const walk = (start: number): boolean => {
    if (combo.length === d) return fn(combo);
    for (let i = start; i < items.length; i++) {
      combo.push(items[i]);
      if (walk(i + 1)) return true;
      combo.pop();
    }
    return false;
  };
  return walk(0);
}

const toggle = (b: Board, i: number): void => {
  b.cells[i].state = (b.cells[i].state === 1 ? 0 : 1) as Orient;
};

/**
 * The TRUE minimum number of flips that solves `board`, by exhaustive search in
 * ascending depth.
 *
 * This exists because "how many pieces we scrambled" is NOT par: several of
 * them are usually irrelevant, so a scramble of 2 often comes undone in 1.
 * Quoting the scramble count would mean congratulating a player for beating a
 * number we invented — which is exactly what level 1 did before this.
 *
 * Pruning keeps the live piece count small (3–9), so this is a few hundred
 * traces, once per board. `maxDepth` is the scramble size, which is known to
 * work, so the search always terminates.
 */
function minFlips(board: Board, rotatables: number[], maxDepth: number): number {
  const probe = cloneBoard(board);
  for (let d = 1; d <= maxDepth; d++) {
    const found = eachCombo(rotatables, d, (combo) => {
      for (const i of combo) toggle(probe, i);
      const ok = trace(probe).solved;
      for (const i of combo) toggle(probe, i);
      return ok;
    });
    if (found) return d;
  }
  return maxDepth;
}

/**
 * Scramble a solved board into a puzzle and report its real par.
 *
 * Tries several subsets and keeps the hardest, because a scramble whose flips
 * largely cancel out yields a level far easier than the curve asked for.
 */
function scramble(
  solved: Board,
  rotatables: number[],
  rng: Rng,
  want: number,
): { board: Board; par: number } | null {
  const k = Math.max(1, Math.min(want, rotatables.length));
  let best: { board: Board; par: number } | null = null;

  for (let retry = 0; retry < 10; retry++) {
    const board = cloneBoard(solved);
    const chosen = shuffle(rng, rotatables).slice(0, k);
    for (const i of chosen) toggle(board, i);
    // A level that opens already solved is not a level.
    if (trace(board).solved) continue;

    const par = minFlips(board, rotatables, chosen.length);
    if (!best || par > best.par) best = { board, par };
    if (best.par >= k) break; // Can't exceed the scramble size; stop looking.
  }
  return best;
}

/**
 * One generation attempt. Returns null if this random layout didn't produce a
 * board worth playing; the caller retries with the next Rng draws, which keeps
 * the whole thing deterministic.
 */
function attempt(rng: Rng, cfg: LevelConfig): Omit<Level, 'seed'> | null {
  const b = emptyBoard(cfg.size);
  placeEmitter(b, rng);

  // Prisms go in the interior so the rainbow fan has room to open.
  const interior: number[] = [];
  for (let y = 1; y < b.h - 1; y++) {
    for (let x = 1; x < b.w - 1; x++) {
      if (at(b, x, y).kind === 'empty') interior.push(idx(b, x, y));
    }
  }
  for (const i of shuffle(rng, interior).slice(0, cfg.prisms)) b.cells[i] = { kind: 'prism' };

  // Mirrors and splitters anywhere still empty.
  const free: number[] = [];
  for (let i = 0; i < b.cells.length; i++) if (b.cells[i].kind === 'empty') free.push(i);
  for (const i of shuffle(rng, free).slice(0, cfg.pieces)) {
    b.cells[i] = {
      kind: rng() < 0.28 ? 'splitter' : 'mirror',
      state: (rng() < 0.5 ? 0 : 1) as Orient,
    };
  }

  if (!whiteHitsPrism(b)) return null;

  const placed = growCrystals(b, rng, cfg.crystals);
  if (placed.length < Math.min(MIN_CRYSTALS, cfg.crystals)) return null;

  // Prune pieces no beam ever touches. An inert mirror that does nothing when
  // you tap it reads as a bug, not a red herring. Untouched cells cannot affect
  // any beam, so removing them leaves the trace identical.
  const touched = trace(b).touched;
  for (let i = 0; i < b.cells.length; i++) {
    if (isRotatable(b.cells[i]) && !touched.has(i)) b.cells[i] = { kind: 'empty' };
  }

  const rotatables: number[] = [];
  for (let i = 0; i < b.cells.length; i++) if (isRotatable(b.cells[i])) rotatables.push(i);
  // The ramp lives here. Without this floor, the sparse boards that sail
  // through crystal placement win, and the late game gets EASIER.
  if (rotatables.length < cfg.minPieces) return null;

  const solved = cloneBoard(b);
  const solution = new Map<number, Orient>();
  for (const i of rotatables) solution.set(i, (solved.cells[i].state ?? 0) as Orient);

  const s = scramble(solved, rotatables, rng, cfg.scramble);
  if (!s) return null;

  return { board: s.board, solution, par: s.par, config: cfg };
}

/**
 * A hand-built board used only if random generation somehow comes up empty.
 * Deterministic, always solvable, and terminates — which a retry loop cannot
 * promise. A player must never meet a screen that says "generation failed".
 *
 * Emitter fires east into a prism at the centre; the rainbow fans north/east/
 * south into three mirrors, each of which turns its colour toward a crystal.
 */
function fallbackLevel(seed: string): Level {
  const b = emptyBoard(7);
  b.cells[idx(b, 0, 3)] = { kind: 'emitter', dir: 1 };
  b.cells[idx(b, 3, 3)] = { kind: 'prism' };
  b.cells[idx(b, 3, 1)] = { kind: 'mirror', state: 1 }; // red: up → east
  b.cells[idx(b, 5, 3)] = { kind: 'mirror', state: 0 }; // green: east → south
  b.cells[idx(b, 3, 5)] = { kind: 'mirror', state: 1 }; // blue: south → west
  b.cells[idx(b, 6, 1)] = { kind: 'crystal', colour: R };
  b.cells[idx(b, 5, 6)] = { kind: 'crystal', colour: G };
  b.cells[idx(b, 0, 5)] = { kind: 'crystal', colour: B };

  const solution = new Map<number, Orient>([
    [idx(b, 3, 1), 1],
    [idx(b, 5, 3), 0],
    [idx(b, 3, 5), 1],
  ]);

  const board = cloneBoard(b);
  board.cells[idx(b, 3, 1)].state = 0;
  board.cells[idx(b, 5, 3)].state = 1;

  return {
    board,
    solution,
    par: 2,
    seed,
    config: { size: 7, prisms: 1, pieces: 3, crystals: 3, scramble: 2, minPieces: 3 },
  };
}

/**
 * Generate the level for `seed`. Deterministic: same seed in, same board out,
 * on any machine. That is the entire basis of the share links.
 */
export function generateLevel(seed: string, cfg: LevelConfig): Level {
  const rng = makeRng(seed);
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const lvl = attempt(rng, cfg);
    if (lvl) return { ...lvl, seed };
  }
  // This config didn't take. Try an easier one before giving up on randomness.
  const easier: LevelConfig = {
    size: 7,
    prisms: 1,
    pieces: 6,
    crystals: 2,
    scramble: 2,
    minPieces: 3,
  };
  const rng2 = makeRng(`${seed}:fallback`);
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const lvl = attempt(rng2, easier);
    if (lvl) return { ...lvl, seed };
  }
  return fallbackLevel(seed);
}

export { fallbackLevel };
export const COLOURS: readonly Colour[] = [R, G, B];

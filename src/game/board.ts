/**
 * board.ts — the board model and the beam tracer.
 *
 * This is the whole game. Everything else (generation, render, UI) is a
 * consumer of `trace()`. It is deliberately pure and synchronous so it can be
 * re-run on every frame of a flip tween and tested without a browser.
 */

/** 0=up 1=right 2=down 3=left. Clockwise, so turning right is (d+1)%4. */
export type Dir = 0 | 1 | 2 | 3;

export const DX: readonly number[] = [0, 1, 0, -1];
export const DY: readonly number[] = [-1, 0, 1, 0];

/** Colour is a 3-bit mask so beams can be unioned at a crystal. */
export const R = 1;
export const G = 2;
export const B = 4;
export const WHITE = 7;

export type Colour = number;

export type CellKind = 'empty' | 'emitter' | 'prism' | 'mirror' | 'splitter' | 'crystal' | 'wall';

/** Mirror/splitter orientation. 0 = '\', 1 = '/'. A 45° mirror has only two. */
export type Orient = 0 | 1;

export interface Cell {
  kind: CellKind;
  /** Emitter only: the direction it fires. */
  dir?: Dir;
  /** Mirror/splitter only: current orientation. */
  state?: Orient;
  /** Crystal only: the colour mask it demands. */
  colour?: Colour;
}

export interface Board {
  w: number;
  h: number;
  cells: Cell[];
}

export const idx = (b: Board, x: number, y: number): number => y * b.w + x;
export const at = (b: Board, x: number, y: number): Cell => b.cells[idx(b, x, y)];
export const inBounds = (b: Board, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < b.w && y < b.h;

export const turnRight = (d: Dir): Dir => ((d + 1) % 4) as Dir;
export const turnLeft = (d: Dir): Dir => ((d + 3) % 4) as Dir;

/**
 * Reflect a travel direction off a 45° mirror.
 * '\' (state 0): right→down, down→right, up→left, left→up.
 * '/' (state 1): right→up, up→right, left→down, down→left.
 */
const REFLECT: readonly Dir[][] = [
  [3, 2, 1, 0], // '\'
  [1, 0, 3, 2], // '/'
];
export const reflect = (d: Dir, state: Orient): Dir => REFLECT[state][d];

export const isRotatable = (c: Cell): boolean => c.kind === 'mirror' || c.kind === 'splitter';

export function cloneBoard(b: Board): Board {
  return { w: b.w, h: b.h, cells: b.cells.map((c) => ({ ...c })) };
}

/** A beam entering or leaving a cell centre, for rendering. */
export interface BeamHalf {
  x: number;
  y: number;
  dir: Dir;
  colour: Colour;
}

export interface Trace {
  /** Beam travelling `dir` arriving at the centre of (x,y) — drawn edge→centre. */
  arrivals: BeamHalf[];
  /** Beam leaving the centre of (x,y) heading `dir` — drawn centre→edge. */
  departures: BeamHalf[];
  /** For each cell index, the union of colours a crystal there received. */
  received: Map<number, Colour>;
  /** Cell indices any beam interacted with — used to prune inert pieces. */
  touched: Set<number>;
  /** Departures whose next cell is off-grid: (x, y, dir, colour). */
  exits: BeamHalf[];
  /** True iff every crystal received EXACTLY its demanded colour. */
  solved: boolean;
  /** Crystal cell indices currently lit correctly. */
  lit: Set<number>;
}

/**
 * Flood the beam through the board.
 *
 * Splitters and prisms branch, and mirrors can route a beam back into itself —
 * so this is a work-queue over states (x, y, dir, colour) with a visited set
 * rather than recursion. That bounds the work at w*h*4*8 and makes cycles
 * terminate instead of hanging the tab.
 */
export function trace(b: Board): Trace {
  const arrivals: BeamHalf[] = [];
  const departures: BeamHalf[] = [];
  const received = new Map<number, Colour>();
  const touched = new Set<number>();
  const exits: BeamHalf[] = [];

  // visited[cell * 32 + dir * 8 + colour]
  const visited = new Uint8Array(b.w * b.h * 32);
  const queue: BeamHalf[] = [];

  const emit = (x: number, y: number, dir: Dir, colour: Colour): void => {
    departures.push({ x, y, dir, colour });
    const nx = x + DX[dir];
    const ny = y + DY[dir];
    if (!inBounds(b, nx, ny)) {
      exits.push({ x, y, dir, colour });
      return;
    }
    queue.push({ x: nx, y: ny, dir, colour });
  };

  // Every emitter fires white light inward.
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      const c = at(b, x, y);
      if (c.kind === 'emitter' && c.dir !== undefined) {
        touched.add(idx(b, x, y));
        emit(x, y, c.dir, WHITE);
      }
    }
  }

  while (queue.length > 0) {
    const beam = queue.pop() as BeamHalf;
    const { x, y, dir, colour } = beam;
    const i = idx(b, x, y);

    const key = i * 32 + dir * 8 + colour;
    if (visited[key]) continue;
    visited[key] = 1;

    arrivals.push(beam);
    touched.add(i);
    const cell = b.cells[i];

    switch (cell.kind) {
      case 'empty':
        emit(x, y, dir, colour);
        break;

      case 'mirror':
        emit(x, y, reflect(dir, cell.state ?? 0), colour);
        break;

      case 'splitter':
        // Half-silvered: the beam both passes through and reflects.
        emit(x, y, dir, colour);
        emit(x, y, reflect(dir, cell.state ?? 0), colour);
        break;

      case 'prism':
        if (colour === WHITE) {
          // The rainbow fan: red bends left, green carries on, blue bends right.
          emit(x, y, turnLeft(dir), R);
          emit(x, y, dir, G);
          emit(x, y, turnRight(dir), B);
        } else {
          // Already split — nothing left to separate, so it just passes.
          emit(x, y, dir, colour);
        }
        break;

      case 'crystal':
        received.set(i, (received.get(i) ?? 0) | colour);
        break;

      case 'wall':
      case 'emitter':
        // Absorbs.
        break;
    }
  }

  const lit = new Set<number>();
  let solved = true;
  let crystals = 0;
  for (let i = 0; i < b.cells.length; i++) {
    const c = b.cells[i];
    if (c.kind !== 'crystal') continue;
    crystals++;
    // Union, not "contains": a stray beam of the wrong colour spoils a crystal.
    if ((received.get(i) ?? 0) === c.colour) lit.add(i);
    else solved = false;
  }
  if (crystals === 0) solved = false;

  return { arrivals, departures, received, touched, exits, solved, lit };
}

export const isSolved = (b: Board): boolean => trace(b).solved;

/** Flip a rotatable cell in place. Returns true if the board changed. */
export function flip(b: Board, x: number, y: number): boolean {
  if (!inBounds(b, x, y)) return false;
  const c = at(b, x, y);
  if (!isRotatable(c)) return false;
  c.state = (c.state === 1 ? 0 : 1) as Orient;
  return true;
}

export const COLOUR_NAMES: Record<number, string> = {
  [R]: 'red',
  [G]: 'green',
  [B]: 'blue',
  [WHITE]: 'white',
};

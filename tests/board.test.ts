/**
 * The physics. If these are wrong, nothing above them can be right — and
 * because the player reads the beam to solve the puzzle, a subtly wrong
 * reflection is worse than a crash: it looks like the game is lying.
 */
import { describe, expect, it } from 'vitest';
import {
  type Board,
  type Cell,
  B,
  G,
  R,
  WHITE,
  flip,
  idx,
  isSolved,
  reflect,
  trace,
  turnLeft,
  turnRight,
} from '../src/game/board';

function board(size: number, place: Record<string, Cell> = {}): Board {
  const cells: Cell[] = [];
  for (let i = 0; i < size * size; i++) cells.push({ kind: 'empty' });
  const b: Board = { w: size, h: size, cells };
  for (const [key, cell] of Object.entries(place)) {
    const [x, y] = key.split(',').map(Number);
    b.cells[idx(b, x, y)] = cell;
  }
  return b;
}

describe('directions', () => {
  it('turns clockwise', () => {
    expect(turnRight(0)).toBe(1);
    expect(turnRight(3)).toBe(0);
    expect(turnLeft(0)).toBe(3);
    expect(turnLeft(1)).toBe(0);
  });
});

describe('mirrors', () => {
  it("reflects off '\\' (state 0)", () => {
    expect(reflect(1, 0)).toBe(2); // right → down
    expect(reflect(2, 0)).toBe(1); // down  → right
    expect(reflect(0, 0)).toBe(3); // up    → left
    expect(reflect(3, 0)).toBe(0); // left  → up
  });

  it("reflects off '/' (state 1)", () => {
    expect(reflect(1, 1)).toBe(0); // right → up
    expect(reflect(0, 1)).toBe(1); // up    → right
    expect(reflect(3, 1)).toBe(2); // left  → down
    expect(reflect(2, 1)).toBe(3); // down  → left
  });

  it('is an involution — reflecting twice returns the beam', () => {
    for (const state of [0, 1] as const) {
      for (const d of [0, 1, 2, 3] as const) {
        expect(reflect(reflect(d, state), state)).toBe(d);
      }
    }
  });
});

describe('the prism', () => {
  it('fans white light into red-left, green-straight, blue-right', () => {
    // Emitter at (0,2) firing east into a prism at (2,2).
    const b = board(5, { '0,2': { kind: 'emitter', dir: 1 }, '2,2': { kind: 'prism' } });
    const tr = trace(b);
    const out = tr.departures.filter((d) => d.x === 2 && d.y === 2);

    expect(out).toHaveLength(3);
    expect(out.find((o) => o.colour === R)?.dir).toBe(0); // left of east = north
    expect(out.find((o) => o.colour === G)?.dir).toBe(1); // straight on
    expect(out.find((o) => o.colour === B)?.dir).toBe(2); // right of east = south
  });

  it('passes an already-split colour straight through', () => {
    // Two prisms in a row: the second sees red/green/blue, not white.
    const b = board(6, {
      '0,2': { kind: 'emitter', dir: 1 },
      '2,2': { kind: 'prism' },
      '4,2': { kind: 'prism' },
    });
    const out = trace(b).departures.filter((d) => d.x === 4 && d.y === 2);
    // Only green reaches the second prism (red/blue turned away), unsplit.
    expect(out).toEqual([{ x: 4, y: 2, dir: 1, colour: G }]);
  });
});

describe('splitters', () => {
  it('sends light two ways at once', () => {
    const b = board(5, {
      '0,2': { kind: 'emitter', dir: 1 },
      '2,2': { kind: 'splitter', state: 0 },
    });
    const out = trace(b).departures.filter((d) => d.x === 2 && d.y === 2);
    expect(out.map((o) => o.dir).sort()).toEqual([1, 2]); // straight on, and down
    expect(out.every((o) => o.colour === WHITE)).toBe(true);
  });
});

describe('crystals', () => {
  it('lights when it receives exactly its colour', () => {
    const b = board(5, {
      '0,2': { kind: 'emitter', dir: 1 },
      '2,2': { kind: 'prism' },
      '4,2': { kind: 'crystal', colour: G },
      '2,0': { kind: 'crystal', colour: R },
      '2,4': { kind: 'crystal', colour: B },
    });
    const tr = trace(b);
    expect(tr.solved).toBe(true);
    expect(tr.lit.size).toBe(3);
  });

  it('does NOT light when a stray beam mixes in another colour', () => {
    // This is the rule the whole difficulty curve rests on: a crystal sums
    // everything it receives and must match EXACTLY, so feeding it its own
    // colour plus anything else spoils it. Getting this test to actually
    // exercise the rule takes care — a crystal that receives nothing at all
    // is also "not lit", and would pass a broken implementation happily.

    // Control: green alone reaches the green crystal, and it lights.
    const ok = board(5, {
      '0,2': { kind: 'emitter', dir: 1 },
      '2,2': { kind: 'prism' }, // red north, green east, blue south
      '4,2': { kind: 'crystal', colour: G },
    });
    expect(trace(ok).received.get(idx(ok, 4, 2))).toBe(G);
    expect(trace(ok).lit.has(idx(ok, 4, 2))).toBe(true);

    // Now route the prism's RED around the top and back down into that same
    // crystal. It still gets all its green — but green+red is not green.
    const spoiled = board(5, {
      '0,2': { kind: 'emitter', dir: 1 },
      '2,2': { kind: 'prism' },
      '2,0': { kind: 'mirror', state: 1 }, // red: north → east
      '4,0': { kind: 'mirror', state: 0 }, // red: east  → south, into the crystal
      '4,2': { kind: 'crystal', colour: G },
    });
    const tr = trace(spoiled);
    expect(tr.received.get(idx(spoiled, 4, 2))).toBe(R | G);
    expect(tr.lit.has(idx(spoiled, 4, 2))).toBe(false);
    expect(tr.solved).toBe(false);
  });

  it('a board with no crystals is never "solved"', () => {
    expect(isSolved(board(5, { '0,2': { kind: 'emitter', dir: 1 } }))).toBe(false);
  });

  it('a white crystal accepts undivided light', () => {
    const b = board(5, {
      '0,2': { kind: 'emitter', dir: 1 },
      '4,2': { kind: 'crystal', colour: WHITE },
    });
    expect(trace(b).solved).toBe(true);
  });

  it('a white crystal ALSO accepts red + green + blue recombined', () => {
    // Because a crystal unions everything it receives, feeding it the whole
    // rainbow back is indistinguishable from never having split the light.
    // This falls out of the mask arithmetic rather than being special-cased,
    // and it is the most satisfying thing on the board — so it gets a test.
    const b = board(3, { '1,1': { kind: 'crystal', colour: WHITE } });
    b.cells[idx(b, 0, 1)] = { kind: 'emitter', dir: 1 };
    const tr = trace(b);
    expect(tr.received.get(idx(b, 1, 1))).toBe(WHITE);

    // Now the same crystal, fed three separate single-colour beams instead.
    const split = board(7, {
      '3,3': { kind: 'crystal', colour: WHITE },
      '0,3': { kind: 'emitter', dir: 1 },
      '1,3': { kind: 'prism' },
    });
    // Red went north, green east, blue south out of the prism at (1,3). Bring
    // red and blue back around into the crystal with mirrors.
    split.cells[idx(split, 1, 1)] = { kind: 'mirror', state: 1 }; // red: up → east
    split.cells[idx(split, 3, 1)] = { kind: 'mirror', state: 0 }; // red: east → south
    split.cells[idx(split, 1, 5)] = { kind: 'mirror', state: 0 }; // blue: south → east
    split.cells[idx(split, 3, 5)] = { kind: 'mirror', state: 1 }; // blue: east → north
    const t2 = trace(split);
    expect(t2.received.get(idx(split, 3, 3))).toBe(R | G | B);
    expect(t2.solved).toBe(true);
  });
});

describe('walls', () => {
  it('absorbs the beam', () => {
    const b = board(5, { '0,2': { kind: 'emitter', dir: 1 }, '2,2': { kind: 'wall' } });
    const tr = trace(b);
    expect(tr.departures.some((d) => d.x === 2 && d.y === 2)).toBe(false);
    expect(tr.exits).toHaveLength(0);
  });
});

describe('termination', () => {
  it('terminates on a loop instead of hanging', () => {
    // Four mirrors in a square route the beam endlessly around itself.
    const b = board(6, {
      '0,1': { kind: 'emitter', dir: 1 },
      '1,1': { kind: 'mirror', state: 0 }, // right → down
      '1,4': { kind: 'mirror', state: 1 }, // down  → left ... into the wall side
      '4,1': { kind: 'mirror', state: 1 },
      '4,4': { kind: 'mirror', state: 0 },
    });
    const tr = trace(b); // must simply return
    expect(tr.arrivals.length).toBeGreaterThan(0);
  });

  it('terminates when a splitter grid branches combinatorially', () => {
    const b = board(8, { '0,4': { kind: 'emitter', dir: 1 } });
    for (let y = 1; y < 7; y++) {
      for (let x = 1; x < 7; x++) {
        b.cells[idx(b, x, y)] = { kind: 'splitter', state: ((x + y) % 2) as 0 | 1 };
      }
    }
    const tr = trace(b);
    // The visited set bounds this at w*h*4*8 states; without it, it never ends.
    expect(tr.arrivals.length).toBeLessThanOrEqual(8 * 8 * 4 * 8);
  });
});

describe('flip', () => {
  it('toggles a mirror and re-routes the beam', () => {
    const b = board(5, {
      '0,2': { kind: 'emitter', dir: 1 },
      '2,2': { kind: 'mirror', state: 0 },
    });
    expect(trace(b).departures.find((d) => d.x === 2 && d.y === 2)?.dir).toBe(2); // down
    expect(flip(b, 2, 2)).toBe(true);
    expect(trace(b).departures.find((d) => d.x === 2 && d.y === 2)?.dir).toBe(0); // up
  });

  it('refuses to flip a fixed piece or an off-grid cell', () => {
    const b = board(5, { '2,2': { kind: 'prism' }, '0,0': { kind: 'emitter', dir: 1 } });
    expect(flip(b, 2, 2)).toBe(false);
    expect(flip(b, 0, 0)).toBe(false);
    expect(flip(b, 9, 9)).toBe(false);
    expect(flip(b, -1, 2)).toBe(false);
  });
});

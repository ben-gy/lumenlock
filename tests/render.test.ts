/**
 * The renderer is mostly pixels and therefore mostly not worth unit-testing —
 * except for the state that OUTLIVES a board. Effects decay inside the rAF
 * loop, and rAF is paused while a tab is hidden, so anything left running when
 * a new level starts can sit on the board indefinitely rather than fading.
 * That shipped a fully washed-out board to production once already.
 */
import { describe, expect, it, vi } from 'vitest';
import { STYLES, View, mixHex } from '../src/render';
import { B, G, R, WHITE } from '../src/game/board';

/** A canvas stub — we assert on state, never on drawing. */
function makeView(): View {
  const ctx = new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === 'createLinearGradient') return () => ({ addColorStop: () => {} });
        if (prop === 'getImageData') return () => ({ data: [0, 0, 0, 0] });
        if (prop === 'setTransform') return () => {};
        return () => {};
      },
      set: () => true,
    },
  );
  const canvas = {
    getContext: () => ctx,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 700, height: 700 }),
    width: 0,
    height: 0,
  } as unknown as HTMLCanvasElement;
  return new View(canvas, false);
}

describe('View effect lifetime', () => {
  it('reset() clears a celebration so the next board opens clean', () => {
    const view = makeView();
    view.resize(7);
    view.celebrate();
    view.burst(1, 1, R, 12);

    // Mid-celebration: something is definitely in flight.
    expect(view.particleCount).toBeGreaterThan(0);
    expect(view.flashLevel).toBeGreaterThan(0);

    view.reset();

    expect(view.particleCount).toBe(0);
    expect(view.flashLevel).toBe(0);
    expect(view.shakeLevel).toBe(0);
  });

  it('a flash decays on its own when frames are actually running', () => {
    const view = makeView();
    view.resize(7);
    view.celebrate();
    for (let i = 0; i < 60; i++) view.update(1 / 60);
    expect(view.flashLevel).toBe(0);
  });

  it('respects reduced motion: no shake, and a single static particle', () => {
    const view = makeView();
    view.resize(7);
    view.reduced = true;
    view.kick(10);
    view.burst(2, 2, B, 20);
    expect(view.shakeLevel).toBe(0);
    expect(view.particleCount).toBe(1);
  });
});

describe('View hit-testing', () => {
  it('maps a pointer to a cell, and rejects points outside the board', () => {
    const view = makeView();
    view.resize(7); // 700px / 7 = 100px cells, no offset
    expect(view.cellAt(50, 50)).toEqual({ x: 0, y: 0 });
    expect(view.cellAt(650, 250)).toEqual({ x: 6, y: 2 });
    expect(view.cellAt(-5, 50)).toBeNull();
    expect(view.cellAt(50, 9999)).toBeNull();
  });

  it('refuses to hit-test before a real measurement', () => {
    // A 0x0 container would make `cell` 0 and every hit-test divide by zero,
    // silently dropping input.
    const canvas = {
      getContext: () => new Proxy({}, { get: () => () => {}, set: () => true }),
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }),
      width: 0,
      height: 0,
    } as unknown as HTMLCanvasElement;
    const view = new View(canvas, false);
    view.resize(7);
    expect(view.ready).toBe(false);
    expect(view.cellAt(10, 10)).toBeNull();
  });
});

describe('palette', () => {
  it('gives every beam colour a glyph, so the board reads without colour', () => {
    for (const c of [R, G, B, WHITE]) {
      expect(STYLES[c].glyph).toBeTruthy();
      expect(STYLES[c].hex).toMatch(/^#[0-9a-f]{6}$/i);
    }
    const glyphs = [R, G, B, WHITE].map((c) => STYLES[c].glyph);
    expect(new Set(glyphs).size).toBe(4); // all distinct
  });

  it('gives red, green and blue distinct dash rhythms', () => {
    const dashes = [R, G, B].map((c) => JSON.stringify(STYLES[c].dash));
    expect(new Set(dashes).size).toBe(3);
  });

  it('blends a mixed mask rather than falling back to nothing', () => {
    expect(mixHex(R)).toBe(STYLES[R].hex);
    expect(mixHex(R | G)).toMatch(/^rgb\(/);
    expect(mixHex(0)).toBeTruthy();
  });
});

describe('resize', () => {
  it('survives a transient 0-size measurement instead of computing NaN', () => {
    let w = 700;
    const canvas = {
      getContext: () => new Proxy({}, { get: () => () => {}, set: () => true }),
      getBoundingClientRect: () => ({ left: 0, top: 0, width: w, height: w }),
      width: 0,
      height: 0,
    } as unknown as HTMLCanvasElement;
    const view = new View(canvas, false);
    view.resize(7);
    expect(view.cellAt(50, 50)).toEqual({ x: 0, y: 0 });

    // A hidden container or a mid-rotate frame measures 0x0. Computing a cell
    // size from that yields Infinity/NaN world coords and silently drops every
    // tap thereafter, so the bad measure has to be ignored outright.
    w = 0;
    view.resize(7);
    expect(view.ready).toBe(true); // geometry preserved, not poisoned
    expect(view.cellAt(50, 50)).toBeNull(); // nothing to hit while it has no size

    // ...and it recovers cleanly once the container has a size again.
    w = 700;
    view.resize(7);
    expect(view.cellAt(50, 50)).toEqual({ x: 0, y: 0 });
    expect(view.cellAt(650, 250)).toEqual({ x: 6, y: 2 });
  });
});

describe('reduced motion', () => {
  it('skips flip tweens rather than queuing them', () => {
    const view = makeView();
    view.resize(7);
    view.reduced = true;
    view.noteFlip(3, 0, 1);
    expect(view.flipAnimCount).toBe(0);
    vi.restoreAllMocks();
  });
});

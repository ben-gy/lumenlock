/**
 * The determinism invariant, adapted from patterns/tests/rng.test.ts.
 *
 * Lumenlock has no live peers, but it makes the same promise in async form:
 * two people who open the same link must get the same board. That is exactly
 * the P2P-sync invariant with the network removed, and it fails the same way —
 * silently, with both players certain they played "the" puzzle.
 */
import { describe, expect, it } from 'vitest';
import { hashSeed, makeRng, randInt, shuffle } from '../src/engine/rng';

describe('makeRng', () => {
  it('gives two peers on one seed the identical stream', () => {
    const a = makeRng('shared-seed');
    const b = makeRng('shared-seed');
    for (let i = 0; i < 500; i++) expect(a()).toBe(b());
  });

  it('diverges on different seeds', () => {
    const a = makeRng('seed-a');
    const b = makeRng('seed-b');
    const sa = Array.from({ length: 20 }, () => a());
    const sb = Array.from({ length: 20 }, () => b());
    expect(sa).not.toEqual(sb);
  });

  it('accepts a numeric seed and a string seed alike', () => {
    const n = makeRng(12345);
    const s = makeRng(hashSeed('anything'));
    expect(n()).toBeGreaterThanOrEqual(0);
    expect(s()).toBeLessThan(1);
  });

  it('stays in [0, 1)', () => {
    const r = makeRng('range');
    for (let i = 0; i < 2000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('hashSeed', () => {
  it('is stable across runs — a link from last year must still work', () => {
    expect(hashSeed('lumenlock-journey-1')).toBe(hashSeed('lumenlock-journey-1'));
  });

  it('separates similar strings', () => {
    expect(hashSeed('lumenlock-journey-1')).not.toBe(hashSeed('lumenlock-journey-2'));
  });

  it('returns an unsigned 32-bit integer', () => {
    for (const s of ['', 'a', 'lumenlock-daily-2026-07-17']) {
      const h = hashSeed(s);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(0xffffffff);
    }
  });
});

describe('shuffle and randInt', () => {
  it('shuffles identically for the same seed and leaves the input alone', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const a = shuffle(makeRng('s'), input);
    const b = shuffle(makeRng('s'), input);
    expect(a).toEqual(b);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(a.slice().sort()).toEqual(input);
  });

  it('keeps randInt within its inclusive bounds', () => {
    const r = makeRng('ints');
    for (let i = 0; i < 1000; i++) {
      const v = randInt(r, 3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
    }
  });
});

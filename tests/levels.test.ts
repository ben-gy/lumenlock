/**
 * Share links are the whole async mode. A link that resolves to a different
 * board than the sender played is worse than no link at all, and a malformed
 * one — links get mangled by chat apps constantly — must land on the menu
 * rather than a stack trace.
 */
import { describe, expect, it } from 'vitest';
import {
  buildLevel,
  customPuzzle,
  dailyLevelFor,
  dailyPuzzle,
  journeyPuzzle,
  parseShare,
  shareText,
  shareUrl,
  todayUTC,
} from '../src/game/levels';

describe('parseShare', () => {
  it('returns null for a bare visit', () => {
    expect(parseShare('')).toBeNull();
    expect(parseShare('?')).toBeNull();
    expect(parseShare('?utm_source=twitter')).toBeNull();
  });

  it('reads a journey link', () => {
    expect(parseShare('?l=5')).toMatchObject({ mode: 'journey', level: 5 });
  });

  it('reads a daily link', () => {
    expect(parseShare('?d=2026-07-17')).toMatchObject({ mode: 'daily', date: '2026-07-17' });
  });

  it('reads a custom-seed link', () => {
    expect(parseShare('?s=abc&l=3')).toMatchObject({ mode: 'custom', level: 3 });
  });

  it('rejects junk rather than throwing', () => {
    for (const q of ['?d=yesterday', '?d=2026-7-1', '?l=0', '?l=-4', '?l=abc', '?l=99999']) {
      expect(parseShare(q)).toBeNull();
    }
  });

  it('defaults a seeded link with no level rather than dropping it', () => {
    expect(parseShare('?s=abc')).toMatchObject({ mode: 'custom', level: 8 });
  });
});

describe('round-tripping a link', () => {
  const origin = 'https://lumenlock.benrichardson.dev';

  it('journey: url → parse → the same board', () => {
    const p = journeyPuzzle(6);
    const url = shareUrl(p, origin);
    expect(url).toBe(`${origin}/?l=6`);
    const back = parseShare(new URL(url).search);
    expect(back?.seed).toBe(p.seed);
    expect(buildLevel(back!).board).toEqual(buildLevel(p).board);
  });

  it('daily: url → parse → the same board', () => {
    const p = dailyPuzzle('2026-07-17');
    const back = parseShare(new URL(shareUrl(p, origin)).search);
    expect(back?.seed).toBe(p.seed);
    expect(buildLevel(back!).board).toEqual(buildLevel(p).board);
  });

  it('custom: url → parse → the same board, even with an awkward seed', () => {
    const p = customPuzzle('hi there&x', 4);
    const back = parseShare(new URL(shareUrl(p, origin)).search);
    expect(back?.seed).toBe(p.seed);
    expect(buildLevel(back!).board).toEqual(buildLevel(p).board);
  });

  it('tolerates a trailing slash on the origin', () => {
    expect(shareUrl(journeyPuzzle(2), 'https://x.dev/')).toBe('https://x.dev/?l=2');
  });
});

describe('the daily', () => {
  it('is the same board all day and a different one tomorrow', () => {
    expect(dailyPuzzle('2026-07-17').seed).toBe(dailyPuzzle('2026-07-17').seed);
    expect(dailyPuzzle('2026-07-17').seed).not.toBe(dailyPuzzle('2026-07-18').seed);
  });

  it('picks a stable difficulty per date, in range', () => {
    for (const d of ['2026-01-01', '2026-07-17', '2026-12-31']) {
      const lvl = dailyLevelFor(d);
      expect(lvl).toBe(dailyLevelFor(d));
      expect(lvl).toBeGreaterThanOrEqual(8);
      expect(lvl).toBeLessThanOrEqual(12);
    }
  });

  it('rolls on UTC so everyone gets the same board at the same moment', () => {
    expect(todayUTC(new Date('2026-07-17T23:59:00Z'))).toBe('2026-07-17');
    expect(todayUTC(new Date('2026-07-18T00:01:00Z'))).toBe('2026-07-18');
  });
});

describe('shareText', () => {
  it('reports the result honestly in each direction', () => {
    const p = journeyPuzzle(3);
    expect(shareText(p, 8, 8, 65)).toContain('perfect');
    expect(shareText(p, 11, 8, 65)).toContain('3 over');
    expect(shareText(p, 11, 8, 65)).not.toContain('perfect');
  });

  it('formats the clock', () => {
    expect(shareText(journeyPuzzle(1), 3, 3, 65)).toContain('1:05');
    expect(shareText(journeyPuzzle(1), 3, 3, 9)).toContain('0:09');
  });
});

describe('journeyPuzzle', () => {
  it('clamps nonsense levels instead of generating a broken board', () => {
    expect(journeyPuzzle(0).level).toBe(1);
    expect(journeyPuzzle(-3).level).toBe(1);
    expect(journeyPuzzle(2.7).level).toBe(2);
  });
});

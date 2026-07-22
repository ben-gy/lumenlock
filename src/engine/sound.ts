// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
/**
 * sound.ts — procedural SFX via Web Audio. Zero asset files. Copied from
 * gh-game-factory/patterns/sound.ts and extended with Lumenlock's patches.
 *
 * The three lock tones are a deliberate chord: red is the root, green the
 * fifth, blue the octave — so a board completing plays music rather than three
 * unrelated beeps. Call sfx.unlock() from the first user gesture.
 */

export type SfxName =
  | 'select'
  | 'flip'
  | 'lockRed'
  | 'lockGreen'
  | 'lockBlue'
  | 'unlit'
  | 'solve'
  | 'perfect';

interface Patch {
  type: OscillatorType;
  /** [startFreq, endFreq] Hz — glides between them over `dur`. */
  freq: [number, number];
  dur: number;
  /** Peak gain 0..1. */
  gain?: number;
  /** Add a short noise burst. */
  noise?: boolean;
}

const PATCHES: Record<SfxName, Patch> = {
  select: { type: 'triangle', freq: [520, 880], dur: 0.09, gain: 0.18 },
  flip: { type: 'square', freq: [300, 190], dur: 0.05, gain: 0.12 },
  // A440 root, E5 fifth, A5 octave.
  lockRed: { type: 'triangle', freq: [440, 660], dur: 0.28, gain: 0.2 },
  lockGreen: { type: 'triangle', freq: [660, 880], dur: 0.28, gain: 0.19 },
  lockBlue: { type: 'triangle', freq: [880, 1320], dur: 0.28, gain: 0.18 },
  unlit: { type: 'sine', freq: [420, 200], dur: 0.16, gain: 0.14 },
  solve: { type: 'triangle', freq: [523, 1568], dur: 0.6, gain: 0.26 },
  perfect: { type: 'square', freq: [880, 1760], dur: 0.45, gain: 0.2 },
};

export interface Sfx {
  unlock(): void;
  play(name: SfxName): void;
  muted(): boolean;
  setMuted(m: boolean): void;
}

export function createSfx(initialMuted = false): Sfx {
  let ctx: AudioContext | null = null;
  let muted = initialMuted;

  const ensure = (): AudioContext | null => {
    try {
      if (!ctx) {
        const AC =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
      }
      if (ctx.state === 'suspended') void ctx.resume();
      return ctx;
    } catch {
      // Audio is a nicety; a browser that refuses it must not break the game.
      return null;
    }
  };

  const noiseBuffer = (ac: AudioContext, dur: number): AudioBuffer => {
    const len = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  };

  return {
    unlock() {
      ensure();
    },
    play(name) {
      if (muted) return;
      const ac = ensure();
      if (!ac) return;
      try {
        const p = PATCHES[name];
        const t0 = ac.currentTime;
        const g = ac.createGain();
        g.gain.setValueAtTime(p.gain ?? 0.25, t0);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + p.dur);
        g.connect(ac.destination);

        const osc = ac.createOscillator();
        osc.type = p.type;
        osc.frequency.setValueAtTime(p.freq[0], t0);
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, p.freq[1]), t0 + p.dur);
        osc.connect(g);
        osc.start(t0);
        osc.stop(t0 + p.dur);

        if (p.noise) {
          const n = ac.createBufferSource();
          n.buffer = noiseBuffer(ac, p.dur);
          const ng = ac.createGain();
          ng.gain.setValueAtTime((p.gain ?? 0.25) * 0.6, t0);
          ng.gain.exponentialRampToValueAtTime(0.0001, t0 + p.dur);
          n.connect(ng);
          ng.connect(ac.destination);
          n.start(t0);
          n.stop(t0 + p.dur);
        }
      } catch {
        /* a failed sound must never take the game with it */
      }
    },
    muted: () => muted,
    setMuted(m) {
      muted = m;
    },
  };
}

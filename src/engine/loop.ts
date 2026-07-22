// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
/**
 * loop.ts — fixed-timestep game loop with a render interpolation hook.
 * Copied from gh-game-factory/patterns/loop.ts — do not re-roll the accumulator.
 */

export interface LoopConfig {
  /** Advance the simulation by exactly `step` seconds. Called 0+ times/frame. */
  update: (step: number) => void;
  /** Paint. `alpha` interpolates between the last two sim states for smoothness. */
  render: (alpha: number) => void;
  /** Simulation rate in Hz. Default 60. */
  hz?: number;
  /** Max sim steps per frame before we drop time (anti spiral-of-death). Default 5. */
  maxStepsPerFrame?: number;
}

export interface Loop {
  start(): void;
  stop(): void;
  running(): boolean;
}

export function createLoop(config: LoopConfig): Loop {
  const hz = config.hz ?? 60;
  const step = 1 / hz;
  const maxSteps = config.maxStepsPerFrame ?? 5;

  let raf = 0;
  let last = 0;
  let acc = 0;
  let alive = false;

  const frame = (now: number) => {
    if (!alive) return;
    raf = requestAnimationFrame(frame);

    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25; // clamp huge gaps (tab was backgrounded)
    acc += dt;

    let steps = 0;
    while (acc >= step && steps < maxSteps) {
      config.update(step);
      acc -= step;
      steps++;
    }
    if (steps >= maxSteps) acc = 0;

    config.render(acc / step);
  };

  return {
    start() {
      if (alive) return;
      alive = true;
      last = performance.now();
      acc = 0;
      raf = requestAnimationFrame(frame);
    },
    stop() {
      alive = false;
      cancelAnimationFrame(raf);
    },
    running: () => alive,
  };
}

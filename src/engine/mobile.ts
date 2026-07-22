// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
/**
 * mobile.ts — the parts of "never zoom, never feel like a web page" that CSS
 * cannot express on its own. Copied from gh-game-factory/patterns/mobile.ts.
 *
 * `<meta name="viewport" content="user-scalable=no">` is ignored by iOS Safari
 * and has been since iOS 10. mobile.css's `touch-action: manipulation` kills
 * double-tap zoom; PINCH zoom only stops if you cancel the proprietary
 * `gesture*` events. Keep both — neither is sufficient alone.
 */

export interface HardenOptions {
  /** Block pinch-zoom. Default true. */
  pinch?: boolean;
  /** Block double-tap zoom (belt and braces over mobile.css). Default true. */
  doubleTap?: boolean;
  /** Keep `--vh` in sync with the real viewport height. Default true. */
  vhUnit?: boolean;
}

export type Unharden = () => void;

export function hardenViewport(opts: HardenOptions = {}): Unharden {
  const { pinch = true, doubleTap = true, vhUnit = true } = opts;
  const offs: (() => void)[] = [];

  const on = <K extends string>(
    target: EventTarget,
    type: K,
    fn: (e: Event) => void,
    options?: AddEventListenerOptions,
  ): void => {
    target.addEventListener(type, fn, options);
    offs.push(() => target.removeEventListener(type, fn, options));
  };

  if (pinch) {
    for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
      on(document, type, (e) => e.preventDefault(), { passive: false });
    }
    on(
      document,
      'touchmove',
      (e) => {
        if ((e as TouchEvent).touches.length > 1) e.preventDefault();
      },
      { passive: false },
    );
  }

  if (doubleTap) {
    let lastTap = 0;
    on(
      document,
      'touchend',
      (e) => {
        const t = Date.now();
        if (t - lastTap < 320) e.preventDefault();
        lastTap = t;
      },
      { passive: false },
    );
    on(document, 'dblclick', (e) => e.preventDefault(), { passive: false });
  }

  if (vhUnit) {
    const setVh = (): void => {
      const h = window.innerHeight;
      // A backgrounded tab reports 0; writing that through collapses every
      // calc(var(--vh) * 100) layout to a blank page. Keep the 1vh fallback.
      if (h > 0) document.documentElement.style.setProperty('--vh', `${h * 0.01}px`);
    };
    setVh();
    on(window, 'resize', setVh);
    on(window, 'orientationchange', setVh);
    on(document, 'visibilitychange', setVh);
  }

  return () => {
    for (const off of offs) off();
  };
}

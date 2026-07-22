# Lumenlock

**Tap mirrors to bend a beam of light through a prism and lock every crystal in its own colour.**

🎮 Play: https://lumenlock.benrichardson.dev

## What it is

A white beam fires from an emitter into a grid. Somewhere on the board sits a **prism**, and white light entering it fans out into a rainbow: **red bends left, green carries straight on, blue bends right**. Scattered around are mirrors and half-silvered splitters, all currently at the wrong angle, and around the edges sit crystals each demanding a particular colour.

You tap a mirror. It flips. The whole beam re-routes instantly — a branching river of light that swings across the board in response to one touch. Tap, watch, read the new path, tap again. The tension is that everything is coupled: the mirror that finally feeds blue to the corner crystal is the same one carrying red across the middle. Solving is untangling, and the untangling is *visible* — you are never guessing, you are reading light.

Two rules do most of the work. A crystal **adds up everything it receives** and must match exactly, so a stray beam of the wrong colour spoils it. And because of that same arithmetic, a **white crystal** accepts either untouched white light *or* red, green and blue recombined — which is the most satisfying thing on the board and falls straight out of the model rather than being special-cased.

Every board is generated backwards from a solved one and then scrambled, so **it is always solvable**. Par is then found by exhaustive search: it is the genuine shortest solution, which is why you can match it but never beat it.

## How to play

Light every crystal in its colour.

- **Desktop:** click a mirror to flip it, or move the cursor with the arrow keys / WASD and flip with <kbd>Space</kbd>. <kbd>R</kbd> restart · <kbd>H</kbd> help · <kbd>M</kbd> sound · <kbd>Esc</kbd> pause.
- **Mobile:** tap. That's the whole control scheme — no drag, no aim, no timing.

Colour is never the only signal: every beam and crystal also carries a glyph (● red, ▲ green, ■ blue, ◆ white) and its own dash rhythm, so the board is fully playable in greyscale.

## Multiplayer

**Async seed-sharing — deliberately no live P2P.**

This is a contemplative single-player puzzle. A live WebRTC race would bolt a lobby, a host and a latency budget onto a game whose actual pleasure is sitting and staring at a board — multiplayer as decoration. So it gets a real async mode instead, which costs no server and no connection:

- **Share this board** — every level produces a link (`?l=5`, `?d=2026-07-17`, `?s=seed&l=8`). Generation is deterministic from the seed, so a friend opening it gets the byte-identical board and the same par to match.
- **Daily Lock** — the seed is the UTC date, so everyone gets the same board that day. Results are stored locally and the share text reports your flips and time, so the comparing happens in whatever chat app you already use.

## Tech

- Vite 6 + vanilla TypeScript, zero runtime dependencies
- Canvas 2D rendering with additive beam blending, particles and screen shake
- Shared engine: fixed-timestep loop, procedural audio, seeded RNG, viewport hardening
- Vitest for the physics, generation, determinism and session logic (331 tests)
- GitHub Pages hosting

No cookies, no fingerprinting, no third-party fonts. Anonymous, cookie-less page-view counts via Cloudflare Web Analytics.

## Local dev

```bash
npm install
npm run dev
npm test
npm run build
npm run preview
npm run icons   # regenerate the icon set from its procedural source
```

## license

[GNU Affero General Public License v3.0 or later](./LICENSE), with an attribution
requirement added under section 7(b) — see
[ADDITIONAL-TERMS.md](./ADDITIONAL-TERMS.md).

In short: you may run, modify, redistribute and even sell this, but if you
distribute it — or run a modified version where other people can reach it — you
have to publish your source under the same licence and keep the attribution. A
separate commercial licence without those obligations is available on request:
<hi@ben.gy>.

Third-party components keep their own licences — see
[THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md).

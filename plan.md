# Game Plan: Lumenlock

## Overview
- **Name:** Lumenlock
- **Repo name:** lumenlock
- **Tagline:** Tap mirrors to bend a beam of light through a prism and lock every crystal in its own colour.
- **Genre (directory category):** puzzle

## Core Loop
A white beam fires from an emitter into a grid. Somewhere on the board sits a **prism**: white light entering it fans out into a rainbow — **red bends left, green carries straight on, blue bends right**. Scattered around are **mirrors** and **half-silvered splitters**, each currently at the wrong angle. Around the edges sit **crystals**, each one demanding a specific colour.

You tap a mirror. It flips. The whole beam re-routes instantly — a live, branching river of light that swings across the board in response to a single touch. Tap, watch, read the new path, tap again. When every crystal is drinking the colour it asked for, the board locks and the light blooms.

The tension is that everything is coupled: the mirror that finally feeds blue to the corner crystal is the same mirror that was carrying red across the middle. Solving is untangling, and the untangling is *visible* — you are never guessing, you are reading light.

- **Win:** every crystal lit with its exact colour.
- **Lose:** nothing. It's a puzzle. The pressure is par, not failure.
- **Par:** the generator knows the exact minimum number of flips (it built the solved board and then scrambled it), so every level ships with a real, honest par.

## Controls
- **Desktop:** mouse click a cell to rotate it. Arrow keys / WASD move a cursor, Space or Enter rotates. `R` restarts the level, `H` toggles help, `M` mutes, `Esc` pauses.
- **Mobile:** tap a cell to rotate it. No D-pad needed — the whole game is discrete taps on ≥44px cells, which is exactly what a phone is best at. No drag, no aim, no timing.

## Multiplayer
- **Mode:** **async-seed.** Deliberately no live P2P.

Being honest per Step 2: this is a contemplative single-player puzzle. A live WebRTC race would add latency, a lobby, a host, and a rematch protocol to a game whose actual pleasure is sitting and staring at a board. It would be multiplayer as decoration.

What it gets instead is a real async mode that costs no server and no connection:
- **Share this board** — any level produces a `?seed=` link. A friend opens it and gets the byte-identical board (deterministic generation via `rng.ts` from the shared seed), plays it, and gets the same par to beat.
- **Daily Lock** — the seed is the UTC date, so everyone in the world gets the same board that day. Your flips and time are stored locally; the share text reports them ("Daily Lock 2026-07-17 — solved in 9 flips, par 8"), so comparison happens in the chat app people already use, with no backend and no accounts.

Because there is no live P2P, the multiplayer contract gates (room entry, host transfer, rematch, one-join invariant) do not apply — no `net.ts`, no `lobby.ts`, no `rematch.ts`, no `trystero` dependency. The determinism gate **does** still apply and is tested: two players on one seed must get identical boards or async sharing is a lie.

## Juice Plan
- **Beam:** not a static line. Additive-blended glow, a bright core over a wide soft halo, with light *travelling* — animated dashes crawl along each segment so the board is alive even when untouched.
- **Rotation:** the mirror tweens through its flip (eased, ~120ms) rather than snapping, and the beam re-solves live during the tween.
- **Crystal lock:** when a crystal first receives its colour it pops (scale overshoot), throws a burst of coloured particles, and plays a rising chime pitched to the colour (red low, green mid, blue high) — so a board completing plays an actual chord.
- **Solve:** screen shake, a white flash that washes the board, every beam segment surges to full brightness, particle bloom from all crystals, `win` chord.
- **Under par:** an extra gold flourish + distinct sound.
- **Sound events** (`sound.ts`, extended): `flip` (soft click), `lockRed`/`lockGreen`/`lockBlue` (the chord tones), `unlock` (a crystal losing its beam — descending), `solve`, `underpar`, `select`.
- **Reduced motion:** no shake, no travelling dashes, particles reduced to a single static pop, tweens → instant.

## Style Direction
**Vibe:** neon — dark board, luminous light. The game is *about* light, so the background must be near-black for the beam to actually glow.
**Palette:** deep indigo/near-black board (`#0a0e1a`), slate cell frames, and the three beam colours chosen for **colour-blind safety**: rather than naive pure red/green/blue (a deuteranope's nightmare), the "red" channel is a warm orange-red `#ff5a3c`, "green" is a yellow-shifted lime `#7ddc3a`, "blue" is a bright cyan `#3ad4ff`. These separate on both the red-green axis *and* by lightness. **Crucially, colour is never the only signal**: every beam and crystal also carries a distinct glyph (● red / ▲ green / ■ blue) and a distinct dash pattern, so the game is fully playable in greyscale.
**Theme:** dark (mandatory — a light theme cannot render glowing beams).
**Reference feel:** the calm legibility of a good Zachtronics puzzle, the tactile snap of a Threes tap.

## Technical Architecture
- **Stack:** Vanilla TypeScript + Vite. No React — there are four screens and no shared nested state.
- **Render:** **Canvas 2D.** The beam is continuous motion with additive glow and particles; DOM cannot do this well. HUD/menus stay DOM on top of the canvas so text is crisp and accessible.
- **Engine modules copied from patterns/:** `rng` (seeded generation — the whole async mode rests on it), `loop` (fixed-timestep for beam animation + particles), `sound` (extended with the colour chord), `storage` (best flips/time per level, daily results, settings), `mobile.ts` + `mobile.css` (viewport hardening). **Not** copied: `net`, `lobby`, `rematch`, `input` (no D-pad, no continuous input — taps are handled directly).
- **Persistence:** localStorage via `storage.ts` — progress (highest level reached), best flips per level, daily history, mute, reduced-motion override, help-seen.

### The physics (the part that must be exactly right)
Directions are `0=up 1=right 2=down 3=left`. Colour is a 3-bit mask: `R=1 G=2 B=4`, white `=7`.

| Cell | Rotatable | Behaviour |
|---|---|---|
| Emitter | no | Fires white (7) in a fixed direction. |
| Prism | no | **White in** → red turns left, green goes straight, blue turns right. **Already-split colour in** → passes straight through untouched. |
| Mirror | yes (2 states: `/` `\`) | Reflects 45°. |
| Splitter | yes (2 states) | Half-silvered: the beam both continues straight **and** reflects. |
| Crystal | no | Absorbs. Lit iff the arriving colour mask equals its required colour exactly. |
| Wall | no | Absorbs. |
| Empty | — | Passes through. |

Beams branch (splitters, prisms) and can form **cycles**, so the tracer is a work-queue flood over states `(x, y, dir, colour)` with a visited set — bounded at `N*N*4*8`, terminating, and cheap enough to re-run on every frame of a flip tween.

### Generation (solvable and par-honest by construction)
Generation never "designs a puzzle and hopes" — it works **backwards from a solved board**:
1. Place the emitter on a border pointing inward; place 1–2 prisms; scatter mirrors/splitters at random orientations. *This configuration is the solution.*
2. Trace it. Collect every point where a beam **exits the grid**, along with the colour it carried.
3. Turn a selection of those exit cells into crystals demanding that colour.
4. **Re-trace and verify.** Placing a crystal is destructive — it absorbs a beam that may have been feeding another crystal. So the candidate is accepted only if the retrace confirms every crystal lit. Reject and retry otherwise (capped attempts, all deterministic from the seed).
5. **Prune** every mirror/splitter no beam touches — an inert piece that does nothing when tapped is noise that reads as a bug.
6. **Scramble** by flipping a random subset; re-verify the scrambled board is *not* already solved. **Par = the number of flips scrambled.**

Difficulty ramps by grid size (7×7 → 10×10), prism count, piece density, and crystal count.

## Non-Goals
- No live P2P (see above — deliberate, not a shortcut).
- No hand-authored levels, no level editor, no story.
- No account, no server, no leaderboard beyond localStorage + share text.
- No hint system this run (par + honest generation carries it).

## How To Play (player-facing copy)
**Light every crystal in its colour.**
White light hits the prism and fans into a rainbow: **red bends left, green goes straight, blue bends right.**
**Tap any mirror to flip it** and the beam re-routes instantly. Splitters send light two ways at once.
Solve it in as few flips as you can — every board has a par, and every board is solvable.

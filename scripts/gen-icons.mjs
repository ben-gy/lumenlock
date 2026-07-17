/**
 * Generate every icon the game ships from one procedural drawing of its own
 * identity: white light entering a prism and leaving as a rainbow.
 *
 * Run with `npm run icons`. The PNGs are committed, so this never runs in CI.
 *
 * Two things here are not arbitrary:
 *   - the maskable variant insets the art to ~60%, because Android crops a
 *     non-maskable icon to a circle and would slice the beams off;
 *   - apple-touch-icon.png is flattened onto opaque black, because iOS
 *     composites transparency against black anyway and a transparent PNG comes
 *     out looking like a mistake.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

const BG = '#0a0e1a';
const WHITE = '#fff6e0';
const RED = '#ff5a3c';
const GREEN = '#7ddc3a';
const BLUE = '#3ad4ff';

/**
 * @param {number} inset fraction of the canvas the art occupies (1 = full bleed)
 * @param {boolean} bg draw the background plate
 */
function svg(inset, bg = true) {
  const S = 512;
  const m = (S * (1 - inset)) / 2;
  const s = S * inset;
  const px = (v) => m + v * s;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  ${bg ? `<rect width="${S}" height="${S}" fill="${BG}"/>` : ''}
  <g stroke-linecap="round" fill="none">
    <!-- incoming white beam -->
    <line x1="${px(0.04)}" y1="${px(0.5)}" x2="${px(0.42)}" y2="${px(0.5)}" stroke="${WHITE}" stroke-width="${s * 0.075}" opacity="0.28"/>
    <line x1="${px(0.04)}" y1="${px(0.5)}" x2="${px(0.42)}" y2="${px(0.5)}" stroke="${WHITE}" stroke-width="${s * 0.032}"/>

    <!-- the rainbow fan: red up, green straight, blue down -->
    <line x1="${px(0.5)}" y1="${px(0.44)}" x2="${px(0.95)}" y2="${px(0.17)}" stroke="${RED}" stroke-width="${s * 0.07}" opacity="0.26"/>
    <line x1="${px(0.5)}" y1="${px(0.44)}" x2="${px(0.95)}" y2="${px(0.17)}" stroke="${RED}" stroke-width="${s * 0.03}"/>
    <line x1="${px(0.56)}" y1="${px(0.5)}" x2="${px(0.95)}" y2="${px(0.5)}" stroke="${GREEN}" stroke-width="${s * 0.07}" opacity="0.26"/>
    <line x1="${px(0.56)}" y1="${px(0.5)}" x2="${px(0.95)}" y2="${px(0.5)}" stroke="${GREEN}" stroke-width="${s * 0.03}"/>
    <line x1="${px(0.5)}" y1="${px(0.56)}" x2="${px(0.95)}" y2="${px(0.83)}" stroke="${BLUE}" stroke-width="${s * 0.07}" opacity="0.26"/>
    <line x1="${px(0.5)}" y1="${px(0.56)}" x2="${px(0.95)}" y2="${px(0.83)}" stroke="${BLUE}" stroke-width="${s * 0.03}"/>
  </g>

  <!-- the prism -->
  <defs>
    <linearGradient id="p" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${RED}" stop-opacity="0.55"/>
      <stop offset="0.5" stop-color="${GREEN}" stop-opacity="0.5"/>
      <stop offset="1" stop-color="${BLUE}" stop-opacity="0.55"/>
    </linearGradient>
  </defs>
  <polygon points="${px(0.5)},${px(0.24)} ${px(0.73)},${px(0.66)} ${px(0.27)},${px(0.66)}"
           fill="url(#p)" stroke="#e8eeff" stroke-width="${s * 0.028}" stroke-linejoin="round"/>
</svg>`;
}

mkdirSync(OUT, { recursive: true });

// Crisp at 16px in a browser tab, so it keeps the vector.
writeFileSync(join(OUT, 'favicon.svg'), svg(1));

const jobs = [
  ['icon-192.png', svg(1), 192],
  ['icon-512.png', svg(1), 512],
  // Android crops to a circle — keep the art well inside the safe zone.
  ['icon-512-maskable.png', svg(0.6), 512],
  // iOS composites on black regardless, so bake the black in.
  ['apple-touch-icon.png', svg(1), 180],
];

for (const [name, markup, size] of jobs) {
  await sharp(Buffer.from(markup))
    .resize(size, size)
    .flatten({ background: BG })
    .png()
    .toFile(join(OUT, name));
  console.log(`wrote ${name} (${size}px)`);
}

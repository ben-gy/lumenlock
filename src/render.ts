/**
 * render.ts — canvas painting and all the effects.
 *
 * The beam is drawn additively ('lighter'), which is why the board has to be
 * near-black: overlapping beams then genuinely mix on screen the same way the
 * mask arithmetic mixes them in board.ts, so what you see IS the model.
 *
 * Colour is never the only signal. Every beam and crystal also carries a glyph
 * and its own dash rhythm, so the board reads in greyscale.
 */

import {
  type Board,
  type Colour,
  type Trace,
  B,
  DX,
  DY,
  G,
  R,
  WHITE,
  idx,
} from './game/board';

interface Style {
  hex: string;
  rgb: [number, number, number];
  glyph: string;
  /** Dash rhythm, in cell-relative units. Distinguishes beams without colour. */
  dash: number[];
  name: string;
}

/**
 * Not pure red/green/blue: that trio is a deuteranope's nightmare. These
 * separate on the red-green axis AND by lightness, and each carries a glyph.
 */
export const STYLES: Record<number, Style> = {
  [R]: { hex: '#ff5a3c', rgb: [255, 90, 60], glyph: '●', dash: [0.32, 0.22], name: 'Red' },
  [G]: { hex: '#7ddc3a', rgb: [125, 220, 58], glyph: '▲', dash: [0.1, 0.2], name: 'Green' },
  [B]: { hex: '#3ad4ff', rgb: [58, 212, 255], glyph: '■', dash: [0.55, 0.25], name: 'Blue' },
  [WHITE]: { hex: '#fff6e0', rgb: [255, 246, 224], glyph: '◆', dash: [], name: 'White' },
};

/** Mixed masks (e.g. red+green) only ever appear inside a crystal. */
function mixHex(mask: Colour): string {
  const s = STYLES[mask];
  if (s) return s.hex;
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (const c of [R, G, B]) {
    if (mask & c) {
      r += STYLES[c].rgb[0];
      g += STYLES[c].rgb[1];
      b += STYLES[c].rgb[2];
      n++;
    }
  }
  if (n === 0) return '#2a3350';
  return `rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})`;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  hex: string;
}

interface FlipAnim {
  from: number;
  to: number;
  t: number;
}

export interface ViewState {
  board: Board;
  trace: Trace;
  /** Keyboard cursor, or null when playing by touch/mouse. */
  cursor: { x: number; y: number } | null;
  solved: boolean;
}

const ease = (t: number): number => 1 - (1 - t) * (1 - t) * (1 - t);
const MIRROR_ANGLE = [Math.PI / 4, -Math.PI / 4]; // '\' and '/'

export class View {
  private ctx: CanvasRenderingContext2D;
  private cssW = 0;
  private cssH = 0;
  private cell = 0;
  private ox = 0;
  private oy = 0;
  private size = 7;

  private particles: Particle[] = [];
  private flipAnims = new Map<number, FlipAnim>();
  private lockAnims = new Map<number, number>();
  private shake = 0;
  private solveFlash = 0;
  private time = 0;

  /** Honour the OS setting, and let the player override it in-game. */
  reduced: boolean;

  constructor(
    private canvas: HTMLCanvasElement,
    reduced: boolean,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d unavailable');
    this.ctx = ctx;
    this.reduced = reduced;
  }

  /**
   * Size the canvas to its container.
   *
   * A transient 0×0 measurement (hidden container, mid-rotate) would make `cell`
   * 0 and every later hit-test divide by zero, silently dropping input. Ignore
   * the bad measure and wait for the next frame instead.
   */
  resize(size: number): void {
    this.size = size;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.cssW = rect.width;
    this.cssH = rect.height;
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.cell = Math.floor(Math.min(rect.width, rect.height) / size);
    this.ox = (rect.width - this.cell * size) / 2;
    this.oy = (rect.height - this.cell * size) / 2;
  }

  get ready(): boolean {
    return this.cell > 0;
  }

  /**
   * Which cell is under this pointer? Uses clientX/Y against the bounding rect
   * rather than offsetX/Y, which scales unpredictably under DPR and zoom.
   */
  cellAt(clientX: number, clientY: number): { x: number; y: number } | null {
    if (this.cell <= 0) return null;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const x = Math.floor((clientX - rect.left - this.ox) / this.cell);
    const y = Math.floor((clientY - rect.top - this.oy) / this.cell);
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return null;
    return { x, y };
  }

  private cx(x: number): number {
    return this.ox + (x + 0.5) * this.cell;
  }

  private cy(y: number): number {
    return this.oy + (y + 0.5) * this.cell;
  }

  noteFlip(cellIndex: number, from: number, to: number): void {
    if (this.reduced) return;
    this.flipAnims.set(cellIndex, { from: MIRROR_ANGLE[from], to: MIRROR_ANGLE[to], t: 0 });
  }

  burst(x: number, y: number, mask: Colour, count = 14): void {
    this.lockAnims.set(y * this.size + x, 0);
    const hex = mixHex(mask);
    const n = this.reduced ? 1 : count;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random();
      const sp = (0.35 + Math.random() * 0.8) * this.cell;
      this.particles.push({
        x: this.cx(x),
        y: this.cy(y),
        vx: this.reduced ? 0 : Math.cos(a) * sp,
        vy: this.reduced ? 0 : Math.sin(a) * sp,
        life: 0.75,
        max: 0.75,
        hex,
      });
    }
  }

  kick(amount: number): void {
    if (this.reduced) return;
    this.shake = Math.max(this.shake, amount);
  }

  celebrate(): void {
    this.solveFlash = 1;
    this.kick(10);
  }

  update(dt: number): void {
    this.time += dt;
    this.shake *= Math.pow(0.001, dt);
    if (this.shake < 0.05) this.shake = 0;
    this.solveFlash = Math.max(0, this.solveFlash - dt * 1.6);

    for (const [k, a] of this.flipAnims) {
      a.t += dt / 0.13;
      if (a.t >= 1) this.flipAnims.delete(k);
    }
    for (const [k, v] of this.lockAnims) {
      const t = v + dt / 0.35;
      if (t >= 1) this.lockAnims.delete(k);
      else this.lockAnims.set(k, t);
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(0.02, dt);
      p.vy *= Math.pow(0.02, dt);
    }
  }

  draw(state: ViewState): void {
    if (!this.ready) return;
    const { ctx } = this;

    ctx.save();
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    ctx.fillStyle = '#0a0e1a';
    ctx.fillRect(0, 0, this.cssW, this.cssH);

    if (this.shake > 0) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }

    this.drawGrid(state.board);
    this.drawBeams(state.trace);
    this.drawPieces(state.board, state.trace);
    this.drawParticles();
    if (state.cursor) this.drawCursor(state.cursor.x, state.cursor.y);

    if (this.solveFlash > 0) {
      ctx.fillStyle = `rgba(255, 246, 224, ${this.solveFlash * 0.32})`;
      ctx.fillRect(-20, -20, this.cssW + 40, this.cssH + 40);
    }
    ctx.restore();
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  private drawGrid(board: Board): void {
    const ctx = this.ctx;
    const pad = this.cell * 0.055;
    for (let y = 0; y < board.h; y++) {
      for (let x = 0; x < board.w; x++) {
        this.roundRect(
          this.ox + x * this.cell + pad,
          this.oy + y * this.cell + pad,
          this.cell - pad * 2,
          this.cell - pad * 2,
          this.cell * 0.14,
        );
        ctx.fillStyle = '#111731';
        ctx.fill();
        ctx.strokeStyle = '#1b2444';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }

  private drawBeams(tr: Trace): void {
    const ctx = this.ctx;
    const half = this.cell / 2;

    // One path per colour, so each colour strokes in a single pass and the
    // additive blend does the mixing for us.
    const paths = new Map<number, Path2D>();
    const add = (x: number, y: number, dir: number, colour: number, arriving: boolean): void => {
      let p = paths.get(colour);
      if (!p) {
        p = new Path2D();
        paths.set(colour, p);
      }
      const mx = this.cx(x);
      const my = this.cy(y);
      const ex = mx + DX[dir] * half;
      const ey = my + DY[dir] * half;
      if (arriving) {
        // Came from the far side; draw entry edge → centre.
        p.moveTo(mx - DX[dir] * half, my - DY[dir] * half);
        p.lineTo(mx, my);
      } else {
        p.moveTo(mx, my);
        p.lineTo(ex, ey);
      }
    };

    for (const a of tr.arrivals) add(a.x, a.y, a.dir, a.colour, true);
    for (const d of tr.departures) add(d.x, d.y, d.dir, d.colour, false);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const [colour, path] of paths) {
      const style = STYLES[colour] ?? STYLES[WHITE];
      ctx.strokeStyle = style.hex;

      // Wide soft halo, then a mid body, then a hot core.
      ctx.globalAlpha = 0.1;
      ctx.lineWidth = this.cell * 0.36;
      ctx.stroke(path);
      ctx.globalAlpha = 0.34;
      ctx.lineWidth = this.cell * 0.13;
      ctx.stroke(path);
      ctx.globalAlpha = 0.95;
      ctx.lineWidth = Math.max(1.5, this.cell * 0.045);
      ctx.stroke(path);

      // Light that travels. Also the colour-blind fallback: each colour has its
      // own rhythm, so beams stay distinguishable with no hue at all.
      if (style.dash.length > 0) {
        ctx.setLineDash(style.dash.map((d) => d * this.cell));
        ctx.lineDashOffset = this.reduced ? 0 : -this.time * this.cell * 1.6;
        ctx.globalAlpha = 0.9;
        ctx.lineWidth = this.cell * 0.09;
        ctx.stroke(path);
        ctx.setLineDash([]);
      }
    }
    ctx.restore();
  }

  private drawPieces(board: Board, tr: Trace): void {
    for (let y = 0; y < board.h; y++) {
      for (let x = 0; x < board.w; x++) {
        const i = idx(board, x, y);
        const c = board.cells[i];
        switch (c.kind) {
          case 'mirror':
          case 'splitter':
            this.drawMirror(x, y, i, c.state ?? 0, c.kind === 'splitter');
            break;
          case 'prism':
            this.drawPrism(x, y);
            break;
          case 'emitter':
            this.drawEmitter(x, y, c.dir ?? 1);
            break;
          case 'crystal':
            this.drawCrystal(x, y, i, c.colour ?? WHITE, tr);
            break;
          case 'wall':
            this.drawWall(x, y);
            break;
          case 'empty':
            break;
        }
      }
    }
  }

  private drawMirror(x: number, y: number, i: number, state: number, splitter: boolean): void {
    const ctx = this.ctx;
    const anim = this.flipAnims.get(i);
    const angle = anim ? anim.from + (anim.to - anim.from) * ease(Math.min(1, anim.t)) : MIRROR_ANGLE[state];

    ctx.save();
    ctx.translate(this.cx(x), this.cy(y));
    ctx.rotate(angle);
    const len = this.cell * 0.72;

    if (splitter) {
      // Half-silvered: translucent, and doubled so it reads as "not solid".
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = '#9fb2e8';
      ctx.lineCap = 'round';
      ctx.lineWidth = this.cell * 0.1;
      ctx.beginPath();
      ctx.moveTo(-len / 2, 0);
      ctx.lineTo(len / 2, 0);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.setLineDash([this.cell * 0.09, this.cell * 0.07]);
      ctx.strokeStyle = '#dce6ff';
      ctx.lineWidth = this.cell * 0.05;
      ctx.beginPath();
      ctx.moveTo(-len / 2, 0);
      ctx.lineTo(len / 2, 0);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      const grad = ctx.createLinearGradient(0, -this.cell * 0.06, 0, this.cell * 0.06);
      grad.addColorStop(0, '#f2f6ff');
      grad.addColorStop(0.5, '#9aa9d6');
      grad.addColorStop(1, '#4a5680');
      ctx.strokeStyle = grad;
      ctx.lineCap = 'round';
      ctx.lineWidth = this.cell * 0.11;
      ctx.beginPath();
      ctx.moveTo(-len / 2, 0);
      ctx.lineTo(len / 2, 0);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawPrism(x: number, y: number): void {
    const ctx = this.ctx;
    const r = this.cell * 0.34;
    ctx.save();
    ctx.translate(this.cx(x), this.cy(y));
    ctx.beginPath();
    for (let k = 0; k < 3; k++) {
      const a = -Math.PI / 2 + (k * Math.PI * 2) / 3;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();

    const grad = ctx.createLinearGradient(-r, -r, r, r);
    grad.addColorStop(0, 'rgba(255, 90, 60, 0.45)');
    grad.addColorStop(0.5, 'rgba(125, 220, 58, 0.4)');
    grad.addColorStop(1, 'rgba(58, 212, 255, 0.45)');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = '#e8eeff';
    ctx.lineWidth = Math.max(1.5, this.cell * 0.035);
    ctx.stroke();
    ctx.restore();
  }

  private drawEmitter(x: number, y: number, dir: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(this.cx(x), this.cy(y));
    const s = this.cell * 0.3;
    this.roundRect(-s, -s, s * 2, s * 2, this.cell * 0.1);
    ctx.fillStyle = '#2b3663';
    ctx.fill();
    ctx.strokeStyle = '#8fa4dd';
    ctx.lineWidth = Math.max(1.5, this.cell * 0.03);
    ctx.stroke();

    // The nozzle, pointing where the light goes.
    ctx.beginPath();
    ctx.arc(DX[dir] * s * 0.55, DY[dir] * s * 0.55, this.cell * 0.11, 0, Math.PI * 2);
    ctx.fillStyle = '#fff6e0';
    ctx.fill();
    ctx.restore();
  }

  private drawWall(x: number, y: number): void {
    const ctx = this.ctx;
    const pad = this.cell * 0.16;
    this.roundRect(
      this.ox + x * this.cell + pad,
      this.oy + y * this.cell + pad,
      this.cell - pad * 2,
      this.cell - pad * 2,
      this.cell * 0.1,
    );
    ctx.fillStyle = '#232c4e';
    ctx.fill();
    ctx.strokeStyle = '#39456f';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  private drawCrystal(x: number, y: number, i: number, want: Colour, tr: Trace): void {
    const ctx = this.ctx;
    const got = tr.received.get(i) ?? 0;
    const lit = got === want;
    const style = STYLES[want] ?? STYLES[WHITE];

    const pop = this.lockAnims.get(i);
    const scale = pop === undefined ? 1 : 1 + Math.sin(pop * Math.PI) * 0.28;

    ctx.save();
    ctx.translate(this.cx(x), this.cy(y));
    ctx.scale(scale, scale);

    const r = this.cell * 0.34;
    const gem = (): void => {
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.78, 0);
      ctx.lineTo(0, r);
      ctx.lineTo(-r * 0.78, 0);
      ctx.closePath();
    };

    if (lit) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.9, 0, Math.PI * 2);
      ctx.fillStyle = style.hex;
      ctx.fill();
      ctx.restore();
    }

    gem();
    // Unlit but receiving something? Show what it's actually getting — that's
    // the difference between "wrong" and "inexplicably wrong".
    ctx.fillStyle = lit ? style.hex : got ? mixHex(got) : '#151c38';
    ctx.globalAlpha = lit ? 1 : got ? 0.4 : 1;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = style.hex;
    ctx.lineWidth = Math.max(1.5, this.cell * 0.04);
    ctx.stroke();

    // The glyph is the point: the board is solvable with no colour vision.
    ctx.fillStyle = lit ? '#0a0e1a' : style.hex;
    ctx.font = `600 ${Math.round(this.cell * 0.3)}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(style.glyph, 0, this.cell * 0.01);
    ctx.restore();
  }

  private drawParticles(): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      const k = p.life / p.max;
      ctx.globalAlpha = k;
      ctx.fillStyle = p.hex;
      ctx.beginPath();
      ctx.arc(p.x, p.y, this.cell * 0.07 * k + 1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawCursor(x: number, y: number): void {
    const ctx = this.ctx;
    const pad = this.cell * 0.04;
    this.roundRect(
      this.ox + x * this.cell + pad,
      this.oy + y * this.cell + pad,
      this.cell - pad * 2,
      this.cell - pad * 2,
      this.cell * 0.16,
    );
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = Math.max(2, this.cell * 0.04);
    ctx.stroke();
  }
}

export { mixHex };

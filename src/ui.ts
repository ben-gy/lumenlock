/**
 * ui.ts — the DOM: markup, element lookups, and the little presentational
 * helpers. Everything here is chrome around the canvas; the rules live in
 * game/.
 */

export const MARKUP = `
  <main class="main-content">
    <header id="hud" hidden>
      <span class="hud-title" id="hudTitle">Level 1</span>
      <div class="hud-actions">
        <button class="icon-btn" id="btnPause" aria-label="Pause" title="Pause (Esc)">❚❚</button>
        <button class="icon-btn" id="btnRestart" aria-label="Restart this board" title="Restart (R)">↺</button>
        <button class="icon-btn" id="btnHelp" aria-label="How to play" title="How to play (H)">?</button>
        <button class="icon-btn" id="btnMute" aria-label="Toggle sound" title="Sound (M)">♪</button>
      </div>
      <div class="hud-stats">
        <span class="stat" id="statFlips">Flips <b>0</b></span>
        <span class="stat" id="statPar">Par <b>0</b></span>
        <span class="stat" id="statTime">0:00</span>
      </div>
    </header>

    <div id="stage" hidden>
      <canvas id="board" class="board" aria-label="Light board"></canvas>
    </div>
  </main>

  <footer class="site-footer">
    Built by <a href="https://benrichardson.dev/" target="_blank" rel="noopener">benrichardson.dev</a>
    · <a href="https://hub.benrichardson.dev" target="_blank" rel="noopener">more games, tools &amp; sites</a>
  </footer>

  <div class="overlay" id="menu" hidden>
    <div class="panel">
      <h1>Lumenlock</h1>
      <p class="tagline">Bend a beam of light through a prism and lock every crystal in its colour.</p>
      <div class="menu-buttons">
        <button class="btn-primary" id="btnPlay">Play</button>
        <button id="btnDaily">Daily Lock</button>
        <button id="btnRandom">Random board</button>
        <div class="menu-row">
          <button class="btn-ghost" id="btnHelpMenu">How to play</button>
          <button class="btn-ghost" id="btnAbout">About</button>
        </div>
      </div>
    </div>
  </div>

  <div class="overlay" id="help" hidden role="dialog" aria-modal="true" aria-labelledby="helpTitle">
    <div class="panel">
      <h2 id="helpTitle">How to play</h2>
      <div class="rule">
        <span class="rule-key swatch-white">◆</span>
        <span class="rule-text"><b>White light fires from the emitter.</b> Follow it.</span>
      </div>
      <div class="rule">
        <span class="rule-key">▲</span>
        <span class="rule-text">
          <b>The prism fans white light into a rainbow:</b>
          <span class="swatch-red">red ● bends left</span>,
          <span class="swatch-green">green ▲ goes straight</span>,
          <span class="swatch-blue">blue ■ bends right</span>.
        </span>
      </div>
      <div class="rule">
        <span class="rule-key">╱</span>
        <span class="rule-text"><b>Tap any mirror to flip it.</b> The beam re-routes instantly. Faded, doubled mirrors are <b>splitters</b> — they send light two ways at once.</span>
      </div>
      <div class="rule">
        <span class="rule-key">◇</span>
        <span class="rule-text"><b>Light every crystal in its own colour</b> to win. A crystal adds up everything it receives, so a stray beam of the wrong colour spoils it — and a <span class="swatch-white">white ◆</span> crystal takes either untouched white light <em>or</em> red, green and blue recombined.</span>
      </div>
      <p class="controls-note">
        Every board has a <b>par</b>: the fewest flips that can possibly solve it, checked by
        searching every shorter line. Match it and you've played it perfectly. Every board is solvable.<br /><br />
        <b>Desktop:</b> click a mirror, or move with <kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> and flip with <kbd>Space</kbd>.
        <kbd>R</kbd> restart · <kbd>H</kbd> help · <kbd>M</kbd> sound · <kbd>Esc</kbd> pause.<br />
        <b>Mobile:</b> just tap.
      </p>
      <button class="btn-primary panel-close" id="btnHelpClose">Got it</button>
    </div>
  </div>

  <div class="overlay" id="about" hidden role="dialog" aria-modal="true" aria-labelledby="aboutTitle">
    <div class="panel">
      <h2 id="aboutTitle">About Lumenlock</h2>
      <p>
        A light-routing puzzle. Every board is built backwards from a solved one and then
        scrambled, so it is always solvable. Par is then found by exhaustive search — it is
        the genuine shortest solution, not an estimate, which is why you can match it but
        never beat it.
      </p>
      <div class="settings-row">
        <span>Sound</span>
        <button id="setSound">On</button>
      </div>
      <div class="settings-row">
        <span>Reduced motion</span>
        <button id="setMotion">Off</button>
      </div>
      <p class="about-note">
        Boards are generated from a seed, so a shared link is the same board for everyone —
        no server, no accounts, no scores leaving your device. Your progress and best flips
        live in this browser only.<br /><br />
        No cookies, no fingerprinting, no third-party fonts. Anonymous, cookie-less page
        counts via Cloudflare Web Analytics.<br /><br />
        Built by <a href="https://benrichardson.dev/" target="_blank" rel="noopener">benrichardson.dev</a>
        · <a href="https://hub.benrichardson.dev" target="_blank" rel="noopener">more games, tools &amp; sites</a>
      </p>
      <button class="btn-primary panel-close" id="btnAboutClose">Close</button>
    </div>
  </div>

  <div class="overlay" id="pause" hidden role="dialog" aria-modal="true" aria-labelledby="pauseTitle">
    <div class="panel">
      <h2 id="pauseTitle">Paused</h2>
      <p class="tagline" id="pauseSub">The clock is stopped.</p>
      <div class="menu-buttons">
        <button class="btn-primary" id="btnResume">Resume</button>
        <button id="btnPauseRestart">Restart board</button>
        <div class="menu-row">
          <button class="btn-ghost" id="btnPauseHelp">How to play</button>
          <button class="btn-ghost" id="btnPauseMenu">Main menu</button>
        </div>
      </div>
    </div>
  </div>

  <div class="overlay" id="results" hidden role="dialog" aria-modal="true" aria-labelledby="resTitle">
    <div class="panel">
      <h2 id="resTitle">Locked!</h2>
      <p class="tagline" id="resSub">Level 1</p>
      <div class="verdict" id="resVerdict">Par</div>
      <div class="result-grid">
        <div class="result-cell"><div class="big" id="resFlips">0</div><div class="lbl">Your flips</div></div>
        <div class="result-cell"><div class="big" id="resPar">0</div><div class="lbl">Best possible</div></div>
        <div class="result-cell"><div class="big" id="resTime">0:00</div><div class="lbl">Time</div></div>
      </div>
      <p class="tagline" id="resBest"></p>
      <div class="menu-buttons">
        <button class="btn-primary" id="btnNext">Next level</button>
        <div class="menu-row">
          <button id="btnAgain">Replay board</button>
          <button id="btnShare">Share</button>
        </div>
        <button class="btn-ghost" id="btnResMenu">Main menu</button>
      </div>
    </div>
  </div>
`;

export function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node as T;
}

export function show(node: HTMLElement, visible: boolean): void {
  node.hidden = !visible;
}

export function fmtTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

let toastTimer: number | undefined;

export function toast(message: string): void {
  document.querySelector('.toast')?.remove();
  const node = document.createElement('div');
  node.className = 'toast';
  node.setAttribute('role', 'status');
  node.textContent = message;
  document.body.appendChild(node);
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => node.remove(), 2200);
}

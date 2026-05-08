import StealthAppBase from '../../js/core/app-base.js';
import { el, pick } from '../../js/core/utils.js';

/**
 * TypingDefenderApp — words drift down the screen; type them to destroy.
 * Letting `lives` words fall ends the game.
 *
 * Config: { words: string[], spawnIntervalMs, fallSpeedPxPerSec, lives }
 */
export default class TypingDefenderApp extends StealthAppBase {
  async init() {
    const cfg = Object.assign({
      words: ['Synergy', 'Quarterly', 'ROI', 'Stakeholder'],
      spawnIntervalMs: 2000,
      fallSpeedPxPerSec: 30,
      lives: 3
    }, this.config);

    const root = el('div', { class: 'sa-host' });
    this.container.appendChild(root);

    const toolbar = el('div', { class: 'sa-toolbar' });
    const status = el('span', { style: { marginLeft: 'auto', color: 'var(--text-secondary)' } });
    const input  = el('input', { type: 'text', placeholder: 'Type a word…', autocomplete: 'off',
      style: { height: '24px', padding: '0 8px', border: '1px solid var(--border)', borderRadius: '2px', minWidth: '200px' } });
    toolbar.append(input, status);
    root.appendChild(toolbar);

    const arena = el('div', { style: { position: 'relative', height: '440px', overflow: 'hidden', background: '#fff', borderTop: '1px solid var(--border)' } });
    root.appendChild(arena);

    const state = { score: 0, lives: cfg.lives, words: [] /* {el, x, y, text, speed} */ };
    let last = performance.now(), spawnTimer = 0, raf = 0, gameOver = false;

    const updateStatus = () => { status.textContent = `Score: ${state.score}   Lives: ${'♥'.repeat(state.lives)}${'·'.repeat(Math.max(0, cfg.lives - state.lives))}`; };
    updateStatus();

    const spawn = () => {
      const text = pick(cfg.words);
      const node = el('div', { text, style: {
        position: 'absolute', top: '0px', whiteSpace: 'nowrap',
        padding: '4px 8px', background: 'var(--selected)', color: 'var(--primary-dark)',
        borderRadius: '3px', fontSize: '13px', fontWeight: 600, boxShadow: 'var(--shadow)'
      } });
      arena.appendChild(node);
      const x = Math.random() * Math.max(0, arena.clientWidth - 120);
      node.style.left = `${x}px`;
      state.words.push({ node, x, y: 0, text, speed: cfg.fallSpeedPxPerSec * (0.8 + Math.random() * 0.6) });
    };

    const removeWord = (w) => { w.node.remove(); state.words = state.words.filter(x => x !== w); };

    const endGame = () => { gameOver = true; cancelAnimationFrame(raf); status.textContent = `Game over. Final score: ${state.score}`; input.disabled = true; };

    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(50, now - last) / 1000;
      last = now;
      if (this.paused) return;
      spawnTimer += dt * 1000;
      if (spawnTimer >= cfg.spawnIntervalMs) { spawnTimer = 0; spawn(); }
      const max = arena.clientHeight - 24;
      for (const w of state.words.slice()) {
        w.y += w.speed * dt;
        w.node.style.top = `${w.y}px`;
        if (w.y >= max) {
          removeWord(w);
          state.lives--;
          updateStatus();
          if (state.lives <= 0) endGame();
        }
      }
    };
    raf = requestAnimationFrame(tick);

    input.addEventListener('input', () => {
      const v = input.value.trim();
      if (!v) return;
      const target = state.words.find(w => w.text.toLowerCase() === v.toLowerCase());
      if (target) {
        removeWord(target);
        state.score += target.text.length;
        updateStatus();
        input.value = '';
      }
    });
    setTimeout(() => input.focus(), 50);

    this._cleanup = () => cancelAnimationFrame(raf);
  }

  destroy() { this._cleanup?.(); super.destroy(); }
}

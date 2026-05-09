import StealthAppBase from '../../js/core/app-base.js';
import { el, getLeaderboard, addScore } from '../../js/core/utils.js';

/**
 * SnakeApp — classic snake on a fixed grid, tick-based. Eats food to grow,
 * dies on wall or self collision. Posts final score to "snake" leaderboard.
 */
export default class SnakeApp extends StealthAppBase {
  async init() {
    const cfg = Object.assign({ cols: 24, rows: 18, cell: 20, tickMs: 110 }, this.config);
    const backend = this.ctx?.host?.backend;

    const root = el('div', { class: 'sa-host' });
    this.container.appendChild(root);
    const body = el('div', { class: 'sa-body' });
    root.appendChild(body);

    const stage = el('div', { class: 'sa-row' });
    body.appendChild(stage);

    const canvas = el('canvas', { width: cfg.cols * cfg.cell, height: cfg.rows * cfg.cell,
      style: { border: '1px solid var(--border)', borderRadius: '4px', background: '#fff' } });
    canvas.tabIndex = 0;
    stage.appendChild(canvas);

    const side = el('div', { class: 'sa-side' });
    const stat = el('div', { class: 'sa-card' });
    stat.innerHTML = `<h5>Stats</h5>
      <div class="sa-kv"><span>Score</span><b id="s-s">0</b></div>
      <div class="sa-kv"><span>Length</span><b id="s-l">3</b></div>`;
    const ctrl = el('div', { class: 'sa-card' });
    ctrl.innerHTML = `<h5>Controls</h5>
      <div>Arrow keys / WASD to move</div>
      <div><b>P</b> pause · <b>R</b> restart</div>`;
    const newBtn = el('button', { class: 'btn sa-btn-primary', text: 'New game' });
    const lbBtn  = el('button', { class: 'btn', text: 'Leaderboard' });
    side.append(stat, ctrl, newBtn, lbBtn);
    stage.appendChild(side);

    const banner = el('div', { class: 'sa-banner', style: { display: 'none' } });
    body.appendChild(banner);
    const lbWrap = el('div', { class: 'sa-card sa-leaderboard', style: { display: 'none' } });
    body.appendChild(lbWrap);

    const ctx = canvas.getContext('2d');
    let snake, dir, nextDir, food, score, alive, paused, lastTick = 0;

    const placeFood = () => {
      while (true) {
        const x = Math.floor(Math.random() * cfg.cols);
        const y = Math.floor(Math.random() * cfg.rows);
        if (!snake.some(s => s.x === x && s.y === y)) { food = { x, y }; return; }
      }
    };

    const start = () => {
      const cx = Math.floor(cfg.cols / 2), cy = Math.floor(cfg.rows / 2);
      snake = [{ x: cx, y: cy }, { x: cx - 1, y: cy }, { x: cx - 2, y: cy }];
      dir = { x: 1, y: 0 }; nextDir = dir;
      score = 0; alive = true; paused = false;
      placeFood(); banner.style.display = 'none';
      stat.querySelector('#s-s').textContent = '0';
      stat.querySelector('#s-l').textContent = '3';
      canvas.focus();
    };

    const step = () => {
      if (!alive || paused || this.paused) return;
      dir = nextDir;
      const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
      if (head.x < 0 || head.y < 0 || head.x >= cfg.cols || head.y >= cfg.rows) return die();
      if (snake.some(s => s.x === head.x && s.y === head.y)) return die();
      snake.unshift(head);
      if (head.x === food.x && head.y === food.y) { score += 10; placeFood(); }
      else snake.pop();
      stat.querySelector('#s-s').textContent = score;
      stat.querySelector('#s-l').textContent = snake.length;
    };

    const die = async () => {
      alive = false;
      banner.textContent = `Game over. Final score: ${score}.`;
      banner.style.display = '';
      const me = this.ctx?.host?.user;
      await addScore(backend, 'snake', { name: me?.initials || me?.displayName || 'You', score, length: snake.length });
    };

    const draw = () => {
      ctx.fillStyle = '#fafafa';
      ctx.fillRect(0, 0, cfg.cols * cfg.cell, cfg.rows * cfg.cell);
      ctx.strokeStyle = '#edebe9';
      for (let x = 1; x < cfg.cols; x++) { ctx.beginPath(); ctx.moveTo(x * cfg.cell, 0); ctx.lineTo(x * cfg.cell, cfg.rows * cfg.cell); ctx.stroke(); }
      for (let y = 1; y < cfg.rows; y++) { ctx.beginPath(); ctx.moveTo(0, y * cfg.cell); ctx.lineTo(cfg.cols * cfg.cell, y * cfg.cell); ctx.stroke(); }
      ctx.fillStyle = '#c4314b';
      ctx.beginPath();
      ctx.arc(food.x * cfg.cell + cfg.cell / 2, food.y * cfg.cell + cfg.cell / 2, cfg.cell / 2 - 3, 0, Math.PI * 2);
      ctx.fill();
      snake.forEach((s, i) => {
        ctx.fillStyle = i === 0 ? '#0078d4' : '#106ebe';
        ctx.fillRect(s.x * cfg.cell + 1, s.y * cfg.cell + 1, cfg.cell - 2, cfg.cell - 2);
      });
      if ((paused || !alive)) {
        ctx.fillStyle = 'rgba(0,0,0,.4)';
        ctx.fillRect(0, 0, cfg.cols * cfg.cell, cfg.rows * cfg.cell);
        ctx.fillStyle = '#fff'; ctx.font = '600 18px Segoe UI';
        ctx.textAlign = 'center';
        ctx.fillText(alive ? 'Paused' : 'Game over', cfg.cols * cfg.cell / 2, cfg.rows * cfg.cell / 2);
      }
    };

    const loop = (now) => {
      this._raf = requestAnimationFrame(loop);
      if (now - lastTick >= cfg.tickMs) { lastTick = now; step(); }
      draw();
    };

    const onKey = (e) => {
      const k = e.key.toLowerCase();
      if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(k)) e.preventDefault();
      if (k === 'p') paused = !paused;
      else if (k === 'r') start();
      else if ((k === 'arrowup' || k === 'w') && dir.y !== 1) nextDir = { x: 0, y: -1 };
      else if ((k === 'arrowdown' || k === 's') && dir.y !== -1) nextDir = { x: 0, y: 1 };
      else if ((k === 'arrowleft' || k === 'a') && dir.x !== 1) nextDir = { x: -1, y: 0 };
      else if ((k === 'arrowright' || k === 'd') && dir.x !== -1) nextDir = { x: 1, y: 0 };
    };
    canvas.addEventListener('keydown', onKey);
    canvas.addEventListener('click', () => canvas.focus());

    newBtn.onclick = start;
    lbBtn.onclick = async () => {
      const list = await getLeaderboard(backend, 'snake');
      lbWrap.innerHTML = '<h5>Top scores · Snake</h5>';
      const tbl = document.createElement('table');
      tbl.innerHTML = list.length
        ? list.map((e, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(e.name || '—')}</td><td>${e.score}</td><td>len ${e.length || 0}</td></tr>`).join('')
        : '<tr><td colspan="4" style="color:var(--text-secondary)">No scores yet.</td></tr>';
      lbWrap.appendChild(tbl);
      lbWrap.style.display = lbWrap.style.display === 'none' ? '' : 'none';
    };

    start();
    this._raf = requestAnimationFrame(loop);
  }

  destroy() { cancelAnimationFrame(this._raf); super.destroy(); }
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

import StealthAppBase from '../../js/core/app-base.js';
import { el, getLeaderboard, addScore } from '../../js/core/utils.js';

/**
 * TetrisApp — classic Tetris in a 10×20 well. Hard drop with Space, soft
 * drop with ↓, rotate with ↑, move with ← →. Lines cleared award score.
 * Game-over scores post to the shared leaderboard ("tetris").
 */
const COLORS = {
  I: '#0078d4', O: '#ffaa44', T: '#a557d4', S: '#107c10',
  Z: '#c4314b', J: '#5c2d91', L: '#d83b01', G: '#edebe9'
};
const SHAPES = {
  I: [[0,1],[1,1],[2,1],[3,1]],
  O: [[1,0],[2,0],[1,1],[2,1]],
  T: [[0,1],[1,1],[2,1],[1,0]],
  S: [[1,1],[2,1],[0,2],[1,2]],
  Z: [[0,1],[1,1],[1,2],[2,2]],
  J: [[0,0],[0,1],[1,1],[2,1]],
  L: [[2,0],[0,1],[1,1],[2,1]]
};

export default class TetrisApp extends StealthAppBase {
  async init() {
    const cols = 10, rows = 20, cell = 22;
    const backend = this.ctx?.host?.backend;

    const root = el('div', { class: 'sa-host' });
    this.container.appendChild(root);
    const body = el('div', { class: 'sa-body' });
    root.appendChild(body);
    const stage = el('div', { class: 'sa-row' });
    body.appendChild(stage);

    const canvas = el('canvas', { width: cols * cell, height: rows * cell,
      style: { border: '1px solid var(--border)', borderRadius: '4px' } });
    canvas.tabIndex = 0;
    stage.appendChild(canvas);

    const side = el('div', { class: 'sa-side' });
    const stat = el('div', { class: 'sa-card' });
    stat.innerHTML = `<h5>Stats</h5>
      <div class="sa-kv"><span>Score</span><b id="t-s">0</b></div>
      <div class="sa-kv"><span>Lines</span><b id="t-l">0</b></div>
      <div class="sa-kv"><span>Level</span><b id="t-lv">1</b></div>`;
    const nextCard = el('div', { class: 'sa-card' });
    nextCard.innerHTML = `<h5>Next</h5>`;
    const nextCv = el('canvas', { width: 4 * 18, height: 4 * 18 });
    nextCard.appendChild(nextCv);
    const ctrl = el('div', { class: 'sa-card' });
    ctrl.innerHTML = `<h5>Controls</h5>
      <div>← → move · ↓ soft drop</div>
      <div>↑ rotate · <b>Space</b> hard drop</div>
      <div><b>P</b> pause</div>`;
    const newBtn = el('button', { class: 'btn sa-btn-primary', text: 'New game' });
    const lbBtn  = el('button', { class: 'btn', text: 'Leaderboard' });
    side.append(stat, nextCard, ctrl, newBtn, lbBtn);
    stage.appendChild(side);

    const banner = el('div', { class: 'sa-banner', style: { display: 'none' } });
    body.appendChild(banner);
    const lbWrap = el('div', { class: 'sa-card sa-leaderboard', style: { display: 'none' } });
    body.appendChild(lbWrap);

    const ctx = canvas.getContext('2d');
    const nctx = nextCv.getContext('2d');

    const grid = () => Array.from({ length: rows }, () => Array(cols).fill(null));
    let board = grid();
    let cur, next, score = 0, lines = 0, level = 1, paused = false, over = false;
    let dropAcc = 0, dropEvery = 0.7;

    const refreshStats = () => {
      stat.querySelector('#t-s').textContent = score;
      stat.querySelector('#t-l').textContent = lines;
      stat.querySelector('#t-lv').textContent = level;
      dropEvery = Math.max(0.08, 0.7 * Math.pow(0.85, level - 1));
    };

    const newPiece = () => {
      const keys = Object.keys(SHAPES);
      const k = keys[Math.floor(Math.random() * keys.length)];
      return { k, blocks: SHAPES[k].map(([x, y]) => [x, y]), x: 3, y: -1 };
    };

    const collide = (p, ox = 0, oy = 0, blocks = p.blocks) => {
      for (const [bx, by] of blocks) {
        const x = p.x + bx + ox, y = p.y + by + oy;
        if (x < 0 || x >= cols || y >= rows) return true;
        if (y >= 0 && board[y][x]) return true;
      }
      return false;
    };

    const merge = (p) => {
      for (const [bx, by] of p.blocks) {
        const x = p.x + bx, y = p.y + by;
        if (y >= 0) board[y][x] = p.k;
      }
    };

    const clearLines = () => {
      let cleared = 0;
      for (let y = rows - 1; y >= 0; y--) {
        if (board[y].every(c => c)) {
          board.splice(y, 1); board.unshift(Array(cols).fill(null));
          cleared++; y++;
        }
      }
      if (cleared) {
        const pts = [0, 100, 300, 500, 800][cleared] * level;
        score += pts; lines += cleared;
        level = 1 + Math.floor(lines / 10);
        refreshStats();
      }
    };

    const rotate = (blocks) => {
      // rotate around (1.5, 1.5)
      return blocks.map(([x, y]) => [3 - y, x]);
    };

    const tryRotate = () => {
      const rb = rotate(cur.blocks);
      for (const ox of [0, -1, 1, -2, 2]) {
        if (!collide(cur, ox, 0, rb)) { cur.blocks = rb; cur.x += ox; return; }
      }
    };

    const spawn = () => {
      cur = next || newPiece();
      next = newPiece();
      drawNext();
      if (collide(cur)) { over = true; banner.textContent = `Game over. Final score: ${score}.`; banner.style.display = ''; postScore(); }
    };

    const hardDrop = () => {
      while (!collide(cur, 0, 1)) cur.y++;
      lock();
    };

    const lock = () => { merge(cur); clearLines(); spawn(); };

    const drawCell = (x, y, k, c2 = ctx, sz = cell) => {
      c2.fillStyle = COLORS[k] || '#0078d4';
      c2.fillRect(x * sz + 1, y * sz + 1, sz - 2, sz - 2);
    };

    const draw = () => {
      ctx.fillStyle = '#fafafa';
      ctx.fillRect(0, 0, cols * cell, rows * cell);
      // grid lines
      ctx.strokeStyle = '#edebe9';
      for (let x = 1; x < cols; x++) { ctx.beginPath(); ctx.moveTo(x * cell, 0); ctx.lineTo(x * cell, rows * cell); ctx.stroke(); }
      for (let y = 1; y < rows; y++) { ctx.beginPath(); ctx.moveTo(0, y * cell); ctx.lineTo(cols * cell, y * cell); ctx.stroke(); }
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (board[y][x]) drawCell(x, y, board[y][x]);
      if (cur) for (const [bx, by] of cur.blocks) {
        const x = cur.x + bx, y = cur.y + by;
        if (y >= 0) drawCell(x, y, cur.k);
      }
      if (paused && !over) {
        ctx.fillStyle = 'rgba(0,0,0,.4)';
        ctx.fillRect(0, 0, cols * cell, rows * cell);
        ctx.fillStyle = '#fff'; ctx.font = '600 18px Segoe UI';
        ctx.textAlign = 'center'; ctx.fillText('Paused', cols * cell / 2, rows * cell / 2);
      }
    };

    const drawNext = () => {
      nctx.fillStyle = '#fafafa'; nctx.fillRect(0, 0, 4 * 18, 4 * 18);
      if (!next) return;
      for (const [bx, by] of next.blocks) drawCell(bx, by, next.k, nctx, 18);
    };

    const postScore = async () => {
      const me = this.ctx?.host?.user;
      await addScore(backend, 'tetris', { name: me?.initials || me?.displayName || 'You', score, lines });
    };

    let last = performance.now();
    const tick = (now) => {
      this._raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (this.paused || paused || over) { draw(); return; }
      dropAcc += dt;
      if (dropAcc >= dropEvery) {
        dropAcc = 0;
        if (!collide(cur, 0, 1)) cur.y++;
        else lock();
      }
      draw();
    };

    const onKey = (e) => {
      if (over) return;
      const k = e.key;
      if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].includes(k)) e.preventDefault();
      if (k === 'p' || k === 'P') { paused = !paused; return; }
      if (paused) return;
      if (k === 'ArrowLeft' && !collide(cur, -1, 0)) cur.x--;
      else if (k === 'ArrowRight' && !collide(cur, 1, 0)) cur.x++;
      else if (k === 'ArrowDown' && !collide(cur, 0, 1)) { cur.y++; score += 1; refreshStats(); }
      else if (k === 'ArrowUp') tryRotate();
      else if (k === ' ') hardDrop();
    };
    canvas.addEventListener('keydown', onKey);
    canvas.addEventListener('click', () => canvas.focus());

    const startGame = () => {
      board = grid(); score = 0; lines = 0; level = 1; over = false; paused = false;
      banner.style.display = 'none'; refreshStats();
      next = newPiece(); spawn();
      canvas.focus();
    };
    newBtn.onclick = startGame;
    lbBtn.onclick = async () => {
      const list = await getLeaderboard(backend, 'tetris');
      lbWrap.innerHTML = '<h5>Top scores · Tetris</h5>';
      const tbl = document.createElement('table');
      tbl.innerHTML = (list.length
        ? list.map((e, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(e.name || '—')}</td><td>${e.score}</td><td>${e.lines || 0} lines</td></tr>`).join('')
        : '<tr><td colspan="4" style="color:var(--text-secondary)">No scores yet.</td></tr>');
      lbWrap.appendChild(tbl);
      lbWrap.style.display = lbWrap.style.display === 'none' ? '' : 'none';
    };

    startGame();
    this._raf = requestAnimationFrame(tick);
  }

  destroy() { cancelAnimationFrame(this._raf); super.destroy(); }
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

import StealthAppBase from '../../js/core/app-base.js';
import { el, getLeaderboard, addScore } from '../../js/core/utils.js';

/**
 * Game2048 — sliding-tile puzzle. Combine equal numbers; reach 2048 (or
 * higher) for a win. Posts highest tile + score to the "2048" leaderboard
 * on game over.
 */
const TILE_COLORS = {
  0:    ['#cdc1b4', '#776e65'],
  2:    ['#eee4da', '#776e65'],
  4:    ['#ede0c8', '#776e65'],
  8:    ['#f2b179', '#ffffff'],
  16:   ['#f59563', '#ffffff'],
  32:   ['#f67c5f', '#ffffff'],
  64:   ['#f65e3b', '#ffffff'],
  128:  ['#edcf72', '#ffffff'],
  256:  ['#edcc61', '#ffffff'],
  512:  ['#edc850', '#ffffff'],
  1024: ['#edc53f', '#ffffff'],
  2048: ['#edc22e', '#ffffff']
};

export default class Game2048 extends StealthAppBase {
  async init() {
    const size = 4, cell = 80, gap = 8, pad = 8;
    const backend = this.ctx?.host?.backend;
    const total = size * cell + (size + 1) * gap + pad * 2;

    const root = el('div', { class: 'sa-host' });
    this.container.appendChild(root);
    const body = el('div', { class: 'sa-body' });
    root.appendChild(body);

    const stage = el('div', { class: 'sa-row' });
    body.appendChild(stage);

    const board = el('div', { style: {
      width: total + 'px', height: total + 'px', position: 'relative',
      background: '#bbada0', borderRadius: '6px', padding: pad + 'px'
    } });
    board.tabIndex = 0;
    stage.appendChild(board);

    const side = el('div', { class: 'sa-side' });
    const stat = el('div', { class: 'sa-card' });
    stat.innerHTML = `<h5>Stats</h5>
      <div class="sa-kv"><span>Score</span><b id="g-s">0</b></div>
      <div class="sa-kv"><span>Best tile</span><b id="g-b">0</b></div>`;
    const ctrl = el('div', { class: 'sa-card' });
    ctrl.innerHTML = `<h5>Controls</h5>
      <div>Arrow keys / WASD slide tiles</div>
      <div>Combine equal numbers</div>
      <div>Reach <b>2048</b> to win</div>`;
    const newBtn = el('button', { class: 'btn sa-btn-primary', text: 'New game' });
    const lbBtn  = el('button', { class: 'btn', text: 'Leaderboard' });
    side.append(stat, ctrl, newBtn, lbBtn);
    stage.appendChild(side);

    const banner = el('div', { class: 'sa-banner', style: { display: 'none' } });
    body.appendChild(banner);
    const lbWrap = el('div', { class: 'sa-card sa-leaderboard', style: { display: 'none' } });
    body.appendChild(lbWrap);

    let grid, score, won, over;

    const make = () => Array.from({ length: size }, () => Array(size).fill(0));
    const clone = (g) => g.map(r => r.slice());
    const equals = (a, b) => a.every((r, i) => r.every((v, j) => v === b[i][j]));

    const addRandom = () => {
      const empties = [];
      for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (!grid[r][c]) empties.push([r, c]);
      if (!empties.length) return false;
      const [r, c] = empties[Math.floor(Math.random() * empties.length)];
      grid[r][c] = Math.random() < 0.9 ? 2 : 4;
      return true;
    };

    const slideRow = (row) => {
      const arr = row.filter(v => v);
      for (let i = 0; i < arr.length - 1; i++) {
        if (arr[i] === arr[i + 1]) { arr[i] *= 2; score += arr[i]; arr.splice(i + 1, 1); }
      }
      while (arr.length < size) arr.push(0);
      return arr;
    };
    const move = (dir) => {
      const before = clone(grid);
      if (dir === 'left')  for (let r = 0; r < size; r++) grid[r] = slideRow(grid[r]);
      if (dir === 'right') for (let r = 0; r < size; r++) grid[r] = slideRow(grid[r].slice().reverse()).reverse();
      if (dir === 'up') {
        for (let c = 0; c < size; c++) {
          const col = grid.map(r => r[c]);
          const nc = slideRow(col);
          for (let r = 0; r < size; r++) grid[r][c] = nc[r];
        }
      }
      if (dir === 'down') {
        for (let c = 0; c < size; c++) {
          const col = grid.map(r => r[c]).reverse();
          const nc = slideRow(col).reverse();
          for (let r = 0; r < size; r++) grid[r][c] = nc[r];
        }
      }
      if (!equals(before, grid)) addRandom();
      checkState();
      render();
    };

    const canMove = () => {
      for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
        if (!grid[r][c]) return true;
        if (c + 1 < size && grid[r][c] === grid[r][c + 1]) return true;
        if (r + 1 < size && grid[r][c] === grid[r + 1][c]) return true;
      }
      return false;
    };

    const checkState = async () => {
      const best = Math.max(...grid.flat());
      stat.querySelector('#g-s').textContent = score;
      stat.querySelector('#g-b').textContent = best;
      if (best >= 2048 && !won) {
        won = true;
        banner.textContent = `You reached ${best}! Keep going for a higher score.`;
        banner.style.display = '';
      }
      if (!canMove() && !over) {
        over = true;
        banner.textContent = `Game over. Score ${score}, best tile ${best}.`;
        banner.style.display = '';
        const me = this.ctx?.host?.user;
        await addScore(backend, '2048', { name: me?.initials || me?.displayName || 'You', score, best });
      }
    };

    const render = () => {
      board.innerHTML = '';
      for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
        const v = grid[r][c];
        const [bg, fg] = TILE_COLORS[v] || TILE_COLORS[2048];
        const tile = el('div', { text: v ? String(v) : '', style: {
          position: 'absolute',
          left: (pad + gap + c * (cell + gap)) + 'px',
          top:  (pad + gap + r * (cell + gap)) + 'px',
          width: cell + 'px', height: cell + 'px',
          background: bg, color: fg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700,
          fontSize: v >= 1000 ? '24px' : v >= 100 ? '28px' : '32px',
          borderRadius: '4px', userSelect: 'none', fontFamily: 'Segoe UI, Arial'
        } });
        board.appendChild(tile);
      }
    };

    const start = () => {
      grid = make(); score = 0; won = false; over = false;
      banner.style.display = 'none';
      addRandom(); addRandom();
      stat.querySelector('#g-s').textContent = '0';
      stat.querySelector('#g-b').textContent = '0';
      render();
      board.focus();
    };

    const onKey = (e) => {
      if (over) return;
      const k = e.key.toLowerCase();
      const map = { arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right',
                    arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down' };
      if (map[k]) { e.preventDefault(); move(map[k]); }
    };
    board.addEventListener('keydown', onKey);
    board.addEventListener('click', () => board.focus());

    newBtn.onclick = start;
    lbBtn.onclick = async () => {
      const list = await getLeaderboard(backend, '2048');
      lbWrap.innerHTML = '<h5>Top scores · 2048</h5>';
      const tbl = document.createElement('table');
      tbl.innerHTML = list.length
        ? list.map((e, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(e.name || '—')}</td><td>${e.score}</td><td>best ${e.best || 0}</td></tr>`).join('')
        : '<tr><td colspan="4" style="color:var(--text-secondary)">No scores yet.</td></tr>';
      lbWrap.appendChild(tbl);
      lbWrap.style.display = lbWrap.style.display === 'none' ? '' : 'none';
    };

    start();
  }
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

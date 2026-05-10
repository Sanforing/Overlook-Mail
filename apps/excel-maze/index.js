import StealthAppBase from '../../js/core/app-base.js';
import { el, randInt } from '../../js/core/utils.js';

/**
 * ExcelMazeApp — a tiny rogue-like rendered as a spreadsheet. The grid is
 * built dynamically from config.rows/cols. Move with WASD or arrow keys.
 * Reach a $ to score; touching # ends the run.
 */
export default class ExcelMazeApp extends StealthAppBase {
  async init() {
    const { rows = 12, cols = 20, wallChar = '█', playerChar = '@', monsterChar = '#', treasureChar = '$', monsters = 5, treasures = 3 } = this.config;

    const root = el('div', { class: 'sa-host' });
    this.container.appendChild(root);

    const toolbar = el('div', { class: 'sa-toolbar' });
    const status = el('span', { style: { marginLeft: 'auto', color: 'var(--text-secondary)' } });
    const newBtn = el('button', { text: 'New sheet' });
    toolbar.append(newBtn, status);
    root.appendChild(toolbar);

    const sheet = el('div', { style: { padding: '12px', overflow: 'auto', fontFamily: 'Consolas, "Courier New", monospace', fontSize: '14px' } });
    root.appendChild(sheet);

    let grid, player, score, alive;

    const buildGrid = () => {
      grid = Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => (r === 0 || c === 0 || r === rows - 1 || c === cols - 1 ? wallChar : ' '))
      );
      // random interior walls
      for (let i = 0; i < Math.floor(rows * cols * 0.08); i++) {
        grid[randInt(1, rows - 2)][randInt(1, cols - 2)] = wallChar;
      }
      const placeOn = (ch) => {
        let r, c, tries = 0;
        do { r = randInt(1, rows - 2); c = randInt(1, cols - 2); tries++; }
        while (grid[r][c] !== ' ' && tries < 200);
        grid[r][c] = ch;
        return [r, c];
      };
      for (let i = 0; i < monsters; i++) placeOn(monsterChar);
      for (let i = 0; i < treasures; i++) placeOn(treasureChar);
      const [pr, pc] = placeOn(playerChar);
      player = { r: pr, c: pc };
      score = 0; alive = true;
    };

    const render = () => {
      const table = ['<table style="border-collapse:collapse">'];
      // column header A B C ...
      table.push('<tr><th style="width:28px;background:#f3f2f1;border:1px solid #d0d0d0"></th>');
      for (let c = 0; c < cols; c++) table.push(`<th style="background:#f3f2f1;border:1px solid #d0d0d0;font-size:11px;color:#605e5c;font-weight:600;width:22px;text-align:center">${colName(c)}</th>`);
      table.push('</tr>');
      for (let r = 0; r < rows; r++) {
        table.push(`<tr><th style="background:#f3f2f1;border:1px solid #d0d0d0;font-size:11px;color:#605e5c;font-weight:600;text-align:center">${r + 1}</th>`);
        for (let c = 0; c < cols; c++) {
          const ch = grid[r][c];
          const color = ch === playerChar ? '#0078d4'
                      : ch === monsterChar ? '#a4262c'
                      : ch === treasureChar ? '#107c10'
                      : ch === wallChar ? '#605e5c' : '#201f1e';
          table.push(`<td style="border:1px solid #e1dfdd;width:22px;height:22px;text-align:center;color:${color};font-weight:${ch === playerChar ? 700 : 400}">${escape(ch)}</td>`);
        }
        table.push('</tr>');
      }
      table.push('</table>');
      sheet.innerHTML = table.join('');
      status.textContent = alive
        ? `Score: ${score}    Move: WASD / arrows`
        : `Game over. Final score: ${score}.`;
    };

    const tryMove = (dr, dc) => {
      if (!alive || this.paused) return;
      const nr = player.r + dr, nc = player.c + dc;
      if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) return;
      const target = grid[nr][nc];
      if (target === wallChar) return;
      if (target === monsterChar) { alive = false; render(); return; }
      if (target === treasureChar) score++;
      grid[player.r][player.c] = ' ';
      grid[nr][nc] = playerChar;
      player = { r: nr, c: nc };
      // win: collected all treasures
      if (!grid.flat().includes(treasureChar)) { alive = false; score += 10; }
      render();
    };

    this._onKey = (e) => {
      if (this.paused || !document.body.contains(root) || isTypingTarget(e.target)) return;
      const k = e.key.toLowerCase();
      const map = { arrowup: [-1, 0], w: [-1, 0], arrowdown: [1, 0], s: [1, 0], arrowleft: [0, -1], a: [0, -1], arrowright: [0, 1], d: [0, 1] };
      const m = map[k];
      if (m) { e.preventDefault(); tryMove(m[0], m[1]); }
    };
    document.addEventListener('keydown', this._onKey);

    newBtn.addEventListener('click', () => { buildGrid(); render(); });

    buildGrid(); render();
  }

  destroy() { document.removeEventListener('keydown', this._onKey); super.destroy(); }
}

function colName(i) { let s = ''; i++; while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; }
function escape(c) { return ({ '<':'&lt;','>':'&gt;','&':'&amp;' })[c] || c; }
function isTypingTarget(target) { return /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName || '') || target?.isContentEditable; }

import StealthAppBase from '../../js/core/app-base.js';
import { el, getLeaderboard, addScore } from '../../js/core/utils.js';

/**
 * WordleApp — guess a 5-letter word in 6 tries.
 *
 * The dictionary is intentionally small and ships in this file so the game
 * has zero network dependencies. Add or override words via config.words.
 * Each solved game posts to the shared "wordle" leaderboard.
 */
const DEFAULT_WORDS = [
  'audit','agile','asset','board','brand','brief','build','cable','cache','chair',
  'chart','client','cloud','coach','draft','email','fiscal','focus','forum','grant',
  'group','hires','index','input','issue','labor','ledge','level','login','lunch',
  'metal','metric','model','money','offer','order','panel','phase','plan','price',
  'profit','quote','queue','range','reset','royal','salary','scale','scope','score',
  'share','shift','spend','stock','table','tasks','token','trade','trend','trust',
  'value','vault','wages','yield','badge','batch','clock','cycle','draft','equip',
  'event','exact','field','final','firms','flash','frame','front','funds','gauge',
  'goals','grade','heads','image','inbox','intel','irony','items','japan','joins',
  'judge','knock','known','large','laser','later','learn','leave','legal','match'
];

export default class WordleApp extends StealthAppBase {
  async init() {
    const cfg = Object.assign({ length: 5, tries: 6 }, this.config);
    const wordList = (cfg.words && cfg.words.length ? cfg.words : DEFAULT_WORDS)
      .map(w => String(w).toLowerCase()).filter(w => w.length === cfg.length);
    if (!wordList.length) wordList.push(...DEFAULT_WORDS.filter(w => w.length === cfg.length));

    const backend = this.ctx?.host?.backend;
    const root = el('div', { class: 'sa-host' });
    this.container.appendChild(root);
    const body = el('div', { class: 'sa-body' });
    root.appendChild(body);

    const banner = el('div', { class: 'sa-banner', style: { display: 'none' } });
    body.appendChild(banner);

    const stage = el('div', { class: 'sa-row' });
    const grid = el('div', { style: { display: 'grid', gap: '6px',
      gridTemplateColumns: `repeat(${cfg.length}, 48px)`, padding: '8px',
      border: '1px solid var(--border)', borderRadius: '4px', background: '#fafafa' } });
    stage.appendChild(grid);

    const side = el('div', { class: 'sa-side' });
    const ctrl = el('div', { class: 'sa-card' });
    ctrl.innerHTML = `<h5>How to play</h5>
      <div>Guess the 5-letter word in 6 tries.</div>
      <div><b style="color:#107c10">■</b> right letter, right spot</div>
      <div><b style="color:#ffaa44">■</b> right letter, wrong spot</div>
      <div><b style="color:var(--text-secondary)">■</b> not in the word</div>`;
    const newBtn = el('button', { class: 'btn sa-btn-primary', text: 'New word' });
    const lbBtn  = el('button', { class: 'btn', text: 'Leaderboard' });
    side.append(ctrl, newBtn, lbBtn);
    stage.appendChild(side);
    body.appendChild(stage);

    const kb = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'center', marginTop: '8px' } });
    body.appendChild(kb);

    const lbWrap = el('div', { class: 'sa-card sa-leaderboard', style: { display: 'none' } });
    body.appendChild(lbWrap);

    let target, row, col, finished, cells, keyState;

    const renderGrid = () => {
      grid.innerHTML = '';
      cells = [];
      for (let r = 0; r < cfg.tries; r++) {
        const rowCells = [];
        for (let c = 0; c < cfg.length; c++) {
          const cell = el('div', { style: {
            width: '48px', height: '48px', border: '2px solid var(--border)', background: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: '22px', textTransform: 'uppercase', color: 'var(--text-primary)'
          } });
          grid.appendChild(cell); rowCells.push(cell);
        }
        cells.push(rowCells);
      }
    };

    const KB_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
    const renderKeyboard = () => {
      kb.innerHTML = '';
      KB_ROWS.forEach((rowKeys, idx) => {
        const r = el('div', { style: { display: 'flex', gap: '4px' } });
        if (idx === 2) r.appendChild(makeKey('Enter', 'enter'));
        for (const c of rowKeys) r.appendChild(makeKey(c, c));
        if (idx === 2) r.appendChild(makeKey('⌫', 'back'));
        kb.appendChild(r);
      });
    };
    const makeKey = (label, code) => {
      const wide = code === 'enter' || code === 'back';
      const k = el('button', { text: label, 'data-key': code, style: {
        height: '38px', minWidth: wide ? '60px' : '32px', padding: '0 8px',
        border: '1px solid var(--border)', background: keyState[code] || '#fff',
        borderRadius: '3px', fontWeight: 600, cursor: 'pointer', fontSize: '13px',
        color: keyState[code] && keyState[code] !== '#fff' ? '#fff' : 'var(--text-primary)'
      } });
      k.addEventListener('click', () => press(code));
      return k;
    };

    const updateKb = () => {
      kb.querySelectorAll('button').forEach(b => {
        const c = b.dataset.key;
        const col = keyState[c];
        b.style.background = col || '#fff';
        b.style.color = col ? '#fff' : 'var(--text-primary)';
        b.style.borderColor = col || 'var(--border)';
      });
    };

    const press = (code) => {
      if (finished) return;
      if (code === 'enter') { submit(); return; }
      if (code === 'back') { if (col > 0) { col--; cells[row][col].textContent = ''; } return; }
      if (/^[a-z]$/.test(code) && col < cfg.length) {
        cells[row][col].textContent = code; col++;
      }
    };

    const submit = () => {
      if (col < cfg.length) { flash('Need 5 letters'); return; }
      const guess = cells[row].map(c => c.textContent).join('').toLowerCase();
      // Score letters
      const t = target.split('');
      const result = Array(cfg.length).fill('miss');
      const used = Array(cfg.length).fill(false);
      for (let i = 0; i < cfg.length; i++) if (guess[i] === t[i]) { result[i] = 'hit'; used[i] = true; }
      for (let i = 0; i < cfg.length; i++) if (result[i] === 'miss') {
        const idx = t.findIndex((ch, k) => !used[k] && ch === guess[i]);
        if (idx >= 0) { result[i] = 'near'; used[idx] = true; }
      }
      result.forEach((r, i) => {
        const c = cells[row][i];
        const colMap = { hit: '#107c10', near: '#ffaa44', miss: '#605e5c' };
        c.style.background = colMap[r]; c.style.color = '#fff'; c.style.borderColor = colMap[r];
        const letter = guess[i];
        const prev = keyState[letter];
        const rank = { hit: 3, near: 2, miss: 1 };
        if (!prev || rank[r] > (prev === '#107c10' ? 3 : prev === '#ffaa44' ? 2 : 1)) {
          keyState[letter] = colMap[r];
        }
      });
      updateKb();
      if (guess === target) {
        finished = true;
        banner.textContent = `Solved in ${row + 1} tries! Word was “${target.toUpperCase()}”.`;
        banner.style.display = '';
        post(true, row + 1);
        return;
      }
      row++; col = 0;
      if (row >= cfg.tries) {
        finished = true;
        banner.textContent = `Out of tries. Word was “${target.toUpperCase()}”.`;
        banner.style.display = '';
        post(false, cfg.tries + 1);
      }
    };

    const flash = (msg) => { banner.textContent = msg; banner.style.display = ''; setTimeout(() => { if (!finished) banner.style.display = 'none'; }, 1200); };

    const post = async (won, tries) => {
      const me = this.ctx?.host?.user;
      const score = won ? Math.max(0, (cfg.tries + 1 - tries) * 100) : 0;
      await addScore(backend, 'wordle', { name: me?.initials || me?.displayName || 'You', score, tries: won ? tries : null, word: target });
    };

    const startGame = () => {
      target = wordList[Math.floor(Math.random() * wordList.length)];
      row = 0; col = 0; finished = false; keyState = {};
      banner.style.display = 'none';
      renderGrid(); renderKeyboard();
    };

    newBtn.onclick = startGame;
    lbBtn.onclick = async () => {
      const list = await getLeaderboard(backend, 'wordle');
      lbWrap.innerHTML = '<h5>Top scores · Wordle</h5>';
      const tbl = document.createElement('table');
      tbl.innerHTML = list.length
        ? list.map((e, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(e.name || '—')}</td><td>${e.score}</td><td>${e.tries ? e.tries + ' tries' : 'lost'}</td></tr>`).join('')
        : '<tr><td colspan="4" style="color:var(--text-secondary)">No scores yet.</td></tr>';
      lbWrap.appendChild(tbl);
      lbWrap.style.display = lbWrap.style.display === 'none' ? '' : 'none';
    };

    this._onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'Enter') { e.preventDefault(); press('enter'); }
      else if (e.key === 'Backspace') { e.preventDefault(); press('back'); }
      else if (/^[a-zA-Z]$/.test(e.key)) press(e.key.toLowerCase());
    };
    this.container.addEventListener('keydown', this._onKey);
    this.container.tabIndex = 0;
    setTimeout(() => this.container.focus(), 50);

    startGame();
  }

  destroy() { this.container.removeEventListener('keydown', this._onKey); super.destroy(); }
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

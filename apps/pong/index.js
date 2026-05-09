import StealthAppBase from '../../js/core/app-base.js';
import { el, getLeaderboard, addScore } from '../../js/core/utils.js';

/**
 * PongApp — minimalist Pong with two modes:
 *   • Solo  — left paddle = player (W/S or ↑/↓), right = AI.
 *   • Local 2P — left = W/S, right = ↑/↓.
 *
 * Tracks high scores per mode in the shared leaderboard. Visuals match the
 * Outlook theme (white background, blue accents) so the game still reads as
 * an attached document preview at a glance.
 */
export default class PongApp extends StealthAppBase {
  async init() {
    const cfg = Object.assign({
      width: 560, height: 320, paddleH: 60, paddleW: 8,
      ballSize: 8, baseSpeed: 220, maxScore: 7
    }, this.config);

    const backend = this.ctx?.host?.backend;
    const root = el('div', { class: 'sa-host' });
    this.container.appendChild(root);

    const tabs = el('div', { class: 'sa-tab-row' });
    const soloTab = el('button', { class: 'sa-tab active', text: 'Solo (vs AI)' });
    const duoTab  = el('button', { class: 'sa-tab', text: 'Local 2P' });
    const lbTab   = el('button', { class: 'sa-tab', text: 'Leaderboard' });
    tabs.append(soloTab, duoTab, lbTab);
    root.appendChild(tabs);

    const body = el('div', { class: 'sa-body' });
    root.appendChild(body);

    const stage = el('div', { class: 'sa-row' });
    const canvas = el('canvas', { width: cfg.width, height: cfg.height,
      style: { border: '1px solid var(--border)', borderRadius: '4px', background: '#fff' } });
    canvas.tabIndex = 0;
    stage.appendChild(canvas);

    const side = el('div', { class: 'sa-side' });
    const scoreCard = el('div', { class: 'sa-card' });
    const scoreText = el('div', { class: 'sa-kv' });
    scoreCard.append(el('h5', { text: 'Score' }), scoreText);
    const ctrlCard = el('div', { class: 'sa-card' });
    ctrlCard.innerHTML = `<h5>Controls</h5>
      <div>Solo: <b>W / S</b> or <b>↑ / ↓</b></div>
      <div>2P: left <b>W / S</b> · right <b>↑ / ↓</b></div>
      <div>Click the field, then play. <b>Space</b> = pause.</div>`;
    const startBtn = el('button', { class: 'btn sa-btn-primary', text: 'New match' });
    side.append(scoreCard, ctrlCard, startBtn);
    stage.appendChild(side);
    body.appendChild(stage);

    const banner = el('div', { class: 'sa-banner', style: { display: 'none' } });
    body.appendChild(banner);

    const lbWrap = el('div', { class: 'sa-card sa-leaderboard', style: { display: 'none', maxWidth: cfg.width + 'px' } });
    body.appendChild(lbWrap);

    const ctx = canvas.getContext('2d');
    const state = {
      mode: 'solo',
      left:  { y: cfg.height / 2 - cfg.paddleH / 2, vy: 0, score: 0 },
      right: { y: cfg.height / 2 - cfg.paddleH / 2, vy: 0, score: 0 },
      ball: { x: cfg.width / 2, y: cfg.height / 2, vx: cfg.baseSpeed, vy: cfg.baseSpeed * 0.4 },
      paused: false, ended: false, keys: new Set(),
    };

    const setMode = (m) => {
      state.mode = m;
      soloTab.classList.toggle('active', m === 'solo');
      duoTab .classList.toggle('active', m === 'duo');
      lbTab  .classList.toggle('active', m === 'lb');
      lbWrap.style.display = m === 'lb' ? '' : 'none';
      stage.style.display  = m === 'lb' ? 'none' : '';
      banner.style.display = 'none';
      if (m !== 'lb') resetMatch();
      if (m === 'lb') refreshLB();
    };
    soloTab.onclick = () => setMode('solo');
    duoTab .onclick = () => setMode('duo');
    lbTab  .onclick = () => setMode('lb');

    const refreshLB = async () => {
      lbWrap.innerHTML = '<h5>Top scores</h5>';
      for (const m of ['solo', 'duo']) {
        const list = await getLeaderboard(backend, `pong-${m}`);
        const tbl = el('table');
        tbl.innerHTML = `<tr><th colspan="3">${m === 'solo' ? 'Solo (vs AI)' : 'Local 2P'}</th></tr>` +
          (list.length ? list.map((e, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(e.name || '—')}</td><td>${e.score}</td></tr>`).join('')
            : '<tr><td colspan="3" style="color:var(--text-secondary)">No scores yet.</td></tr>');
        lbWrap.appendChild(tbl);
      }
    };

    const updateScore = () => {
      scoreText.innerHTML = state.mode === 'solo'
        ? `<span>You</span><b>${state.left.score}</b><span>AI</span><b>${state.right.score}</b>`
        : `<span>P1</span><b>${state.left.score}</b><span>P2</span><b>${state.right.score}</b>`;
    };

    const resetBall = (dir = 1) => {
      state.ball.x = cfg.width / 2;
      state.ball.y = cfg.height / 2;
      const angle = (Math.random() * 0.6 - 0.3);
      state.ball.vx = dir * cfg.baseSpeed * Math.cos(angle);
      state.ball.vy = cfg.baseSpeed * Math.sin(angle);
    };

    const resetMatch = () => {
      state.left.score = 0; state.right.score = 0;
      state.ended = false; state.paused = false;
      banner.style.display = 'none';
      updateScore();
      resetBall(Math.random() < 0.5 ? -1 : 1);
    };

    startBtn.onclick = () => { resetMatch(); canvas.focus(); };

    const onKeyDown = (e) => {
      if (e.target.tagName === 'INPUT') return;
      const k = e.key;
      if (['ArrowUp', 'ArrowDown', ' '].includes(k)) e.preventDefault();
      if (k === ' ') { state.paused = !state.paused; return; }
      state.keys.add(k.toLowerCase());
    };
    const onKeyUp = (e) => state.keys.delete(e.key.toLowerCase());
    canvas.addEventListener('keydown', onKeyDown);
    canvas.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('click', () => canvas.focus());

    const draw = () => {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, cfg.width, cfg.height);
      // dashed midline
      ctx.strokeStyle = 'var(--border)';
      ctx.setLineDash([6, 8]);
      ctx.beginPath(); ctx.moveTo(cfg.width / 2, 0); ctx.lineTo(cfg.width / 2, cfg.height); ctx.stroke();
      ctx.setLineDash([]);
      // paddles + ball
      ctx.fillStyle = '#0078d4';
      ctx.fillRect(8, state.left.y, cfg.paddleW, cfg.paddleH);
      ctx.fillStyle = '#605e5c';
      ctx.fillRect(cfg.width - cfg.paddleW - 8, state.right.y, cfg.paddleW, cfg.paddleH);
      ctx.fillStyle = '#201f1e';
      ctx.fillRect(state.ball.x - cfg.ballSize / 2, state.ball.y - cfg.ballSize / 2, cfg.ballSize, cfg.ballSize);
      if (state.paused && !state.ended) {
        ctx.fillStyle = 'rgba(0,0,0,.35)';
        ctx.fillRect(0, 0, cfg.width, cfg.height);
        ctx.fillStyle = '#fff'; ctx.font = '600 18px Segoe UI, Arial';
        ctx.textAlign = 'center'; ctx.fillText('Paused — press Space', cfg.width / 2, cfg.height / 2);
      }
    };

    let last = performance.now();
    const tick = (now) => {
      this._raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (this.paused || state.paused || state.ended) { draw(); return; }

      // Player input
      const speed = 320;
      const upL  = state.keys.has('w') || (state.mode === 'solo' && state.keys.has('arrowup'));
      const dnL  = state.keys.has('s') || (state.mode === 'solo' && state.keys.has('arrowdown'));
      state.left.y += (dnL - upL) * speed * dt;
      if (state.mode === 'duo') {
        const upR = state.keys.has('arrowup'), dnR = state.keys.has('arrowdown');
        state.right.y += (dnR - upR) * speed * dt;
      } else {
        // AI: predictive tracking with deadband
        const target = state.ball.y - cfg.paddleH / 2;
        const dy = target - state.right.y;
        const aiSpeed = 220;
        if (Math.abs(dy) > 6) state.right.y += Math.sign(dy) * aiSpeed * dt;
      }
      state.left.y  = clamp(state.left.y,  0, cfg.height - cfg.paddleH);
      state.right.y = clamp(state.right.y, 0, cfg.height - cfg.paddleH);

      // Ball physics
      state.ball.x += state.ball.vx * dt;
      state.ball.y += state.ball.vy * dt;
      if (state.ball.y < cfg.ballSize / 2) { state.ball.y = cfg.ballSize / 2; state.ball.vy *= -1; }
      if (state.ball.y > cfg.height - cfg.ballSize / 2) { state.ball.y = cfg.height - cfg.ballSize / 2; state.ball.vy *= -1; }

      // Paddle collisions
      const hitsLeft = state.ball.x - cfg.ballSize / 2 < 8 + cfg.paddleW
        && state.ball.y > state.left.y && state.ball.y < state.left.y + cfg.paddleH && state.ball.vx < 0;
      const hitsRight = state.ball.x + cfg.ballSize / 2 > cfg.width - cfg.paddleW - 8
        && state.ball.y > state.right.y && state.ball.y < state.right.y + cfg.paddleH && state.ball.vx > 0;
      if (hitsLeft || hitsRight) {
        const paddle = hitsLeft ? state.left : state.right;
        const rel = (state.ball.y - (paddle.y + cfg.paddleH / 2)) / (cfg.paddleH / 2);
        const speed2 = Math.min(520, Math.hypot(state.ball.vx, state.ball.vy) * 1.06);
        const angle = rel * 0.9;
        const dir = hitsLeft ? 1 : -1;
        state.ball.vx = dir * speed2 * Math.cos(angle);
        state.ball.vy = speed2 * Math.sin(angle);
      }
      // Score
      if (state.ball.x < -10) { state.right.score++; updateScore(); checkWin(); resetBall(1); }
      if (state.ball.x > cfg.width + 10) { state.left.score++; updateScore(); checkWin(); resetBall(-1); }

      draw();
    };
    this._raf = requestAnimationFrame(tick);

    const checkWin = async () => {
      if (state.left.score < cfg.maxScore && state.right.score < cfg.maxScore) return;
      state.ended = true;
      const youWin = state.left.score >= cfg.maxScore;
      const label = state.mode === 'solo'
        ? (youWin ? `You won ${state.left.score}–${state.right.score}.` : `AI won ${state.right.score}–${state.left.score}.`)
        : (youWin ? `Player 1 wins ${state.left.score}–${state.right.score}.` : `Player 2 wins ${state.right.score}–${state.left.score}.`);
      banner.textContent = label + ' Saved to leaderboard.';
      banner.style.display = '';
      const winnerScore = Math.max(state.left.score, state.right.score) * 10
        + (cfg.maxScore - Math.min(state.left.score, state.right.score));
      const me = this.ctx?.host?.user;
      const name = state.mode === 'duo'
        ? (youWin ? 'P1' : 'P2')
        : (me?.initials || me?.displayName || 'You');
      await addScore(backend, `pong-${state.mode}`, { name, score: winnerScore, win: true });
    };

    updateScore();
  }

  destroy() { cancelAnimationFrame(this._raf); super.destroy(); }
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

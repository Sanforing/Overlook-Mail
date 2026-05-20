/**
 * Boss key — press the configured key N times within window to enter panic
 * mode: hides the running app, leaving the innocent email body visible.
 * Pressing it again restores. Intentionally silent — no on-screen hint.
 *
 * Config (settings.bossKey): { key, pressCount, windowMs }
 */
import { trackEvent } from './analytics.js';

export function initBossKey(state, host) {
  const cfg = state.settings.bossKey || {};
  const key = cfg.key || 'Escape';
  const need = cfg.pressCount || 2;
  const win = cfg.windowMs || 600;

  let presses = [];
  let panic = false;

  function setPanic(on) {
    panic = on;
    host.setPanic(on);
    trackEvent('boss_key_toggle', { enabled: on, tier: state.user?.tier || 'guest' });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== key) return;
    const now = Date.now();
    presses = presses.filter(t => now - t < win);
    presses.push(now);
    if (presses.length >= need) {
      presses = [];
      setPanic(!panic);
    }
  });

  return { isPanic: () => panic, setPanic };
}

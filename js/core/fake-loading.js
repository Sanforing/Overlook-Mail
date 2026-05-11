import { randInt } from './utils.js';

/**
 * Show a webmail-style "Downloading attachment…" overlay for a brief
 * randomized period. Configured via settings.fakeLoading.
 */
export function withFakeLoading(settings, app, fn) {
  const cfg = settings.fakeLoading || {};
  const enabled = (cfg.enabledFor || []).includes(app.type);
  const overlay = document.getElementById('fake-loader');
  if (!enabled) return Promise.resolve(fn());

  overlay.innerHTML = '';
  const spinner = document.createElement('div'); spinner.className = 'spinner';
  const label = document.createElement('div'); label.textContent = cfg.label || 'Downloading attachment…';
  overlay.appendChild(spinner); overlay.appendChild(label);
  overlay.classList.remove('hidden');

  const ms = randInt(cfg.minMs || 600, cfg.maxMs || 1400);
  const start = Date.now();
  const result = Promise.resolve(fn());

  return Promise.all([
    result,
    new Promise(r => setTimeout(r, ms))
  ]).then(([res]) => {
    const elapsed = Date.now() - start;
    return new Promise(r => setTimeout(() => r(res), Math.max(0, ms - elapsed)));
  }).finally(() => overlay.classList.add('hidden'));
}

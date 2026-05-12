import { randInt } from './utils.js';

/**
 * Show a webmail-style "Downloading attachment…" overlay for a brief
 * randomized period. Configured via settings.fakeLoading.
 *
 * If `host` is provided, the overlay is scoped to that element (rendered
 * absolutely inside it) instead of covering the whole page — used so the
 * loading indicator appears inside the attachment preview area only,
 * letting the user keep reading the surrounding mail.
 */
export function withFakeLoading(settings, app, fn, host = null) {
  const cfg = settings.fakeLoading || {};
  const enabled = (cfg.enabledFor || []).includes(app.type);
  if (!enabled) return Promise.resolve(fn());

  let overlay;
  let cleanup = () => {};
  if (host) {
    const prevPos = host.style.position;
    if (!prevPos || prevPos === 'static') host.style.position = 'relative';
    overlay = document.createElement('div');
    overlay.className = 'fake-loader fake-loader-inline';
    host.appendChild(overlay);
    cleanup = () => {
      overlay.remove();
      if (!prevPos) host.style.position = '';
    };
  } else {
    overlay = document.getElementById('fake-loader');
    overlay.innerHTML = '';
    overlay.classList.remove('hidden');
    cleanup = () => overlay.classList.add('hidden');
  }

  const spinner = document.createElement('div'); spinner.className = 'spinner';
  const label = document.createElement('div'); label.textContent = cfg.label || 'Downloading attachment…';
  overlay.appendChild(spinner); overlay.appendChild(label);

  const ms = randInt(cfg.minMs || 600, cfg.maxMs || 1400);
  const start = Date.now();
  const result = Promise.resolve(fn());

  return Promise.all([
    result,
    new Promise(r => setTimeout(r, ms))
  ]).then(([res]) => {
    const elapsed = Date.now() - start;
    return new Promise(r => setTimeout(() => r(res), Math.max(0, ms - elapsed)));
  }).finally(cleanup);
}

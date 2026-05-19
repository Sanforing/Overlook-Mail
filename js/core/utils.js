// Tiny utilities. Keep dependency-free.

export async function loadJSON(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json();
}

export async function loadText(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.text();
}

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const child of [].concat(children)) {
    if (child == null || child === false) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

export function fillTemplate(str, ctx) {
  return String(str).replace(/\{(\w+)\}/g, (_, k) => (ctx[k] ?? ''));
}

export function applyThemeVars(theme) {
  const root = document.documentElement.style;
  const map = {
    primary: '--primary', primaryDark: '--primary-dark',
    background: '--background', panel: '--panel', border: '--border',
    textPrimary: '--text-primary', textSecondary: '--text-secondary',
    unread: '--unread', hover: '--hover', selected: '--selected'
  };
  for (const [k, v] of Object.entries(theme || {})) {
    if (map[k]) root.setProperty(map[k], v);
  }
}

export function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
export function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

/**
 * Tiny shared leaderboard for built-in games. Stored under a reserved
 * "mailId" namespace through the existing backend save-state surface. In
 * remote mode this stays in browser storage, matching uploaded content.
 *
 *   await getLeaderboard(backend, 'pong');
 *   await addScore(backend, 'pong', { name: 'AC', score: 12 });
 */
const LB_KEY = (gameId) => `__leaderboard__:${gameId}`;

export async function getLeaderboard(backend, gameId, limit = 10) {
  if (!backend?.loadState) return [];
  try {
    const data = await backend.loadState(LB_KEY(gameId));
    if (!Array.isArray(data)) return [];
    return data.slice(0, limit);
  } catch { return []; }
}

export async function addScore(backend, gameId, entry, max = 10) {
  if (!backend?.loadState || !backend?.saveState) return [];
  let list = [];
  try { const d = await backend.loadState(LB_KEY(gameId)); if (Array.isArray(d)) list = d; } catch {}
  list.push(Object.assign({ at: Date.now() }, entry));
  list.sort((a, b) => (b.score || 0) - (a.score || 0));
  list = list.slice(0, max);
  try { await backend.saveState(LB_KEY(gameId), list); } catch {}
  return list;
}

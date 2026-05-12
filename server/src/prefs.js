import { stmt } from './db.js';
import { requireUser } from './auth.js';

const SCHEMA = {
  brand:     { type: 'string', max: 64 },
  searchPlaceholder: { type: 'string', max: 64 },
  recipientName: { type: 'string', max: 64 },
  display: {
    type: 'object',
    keys: ['uiScale','mailFontSize']
  },
  novelMail: {
    type: 'object',
    keys: ['linesPerPage']
  },
  theme: {
    type: 'object',
    keys: ['primary','primaryDark','background','panel','border','textPrimary','textSecondary','unread','hover','selected'],
    valueType: 'color'
  }
};

function isHexColor(s) { return typeof s === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(s); }
function clampNumber(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function sanitize(prefs) {
  const out = {};
  if (typeof prefs?.brand === 'string') out.brand = prefs.brand.slice(0, SCHEMA.brand.max);
  if (typeof prefs?.searchPlaceholder === 'string') out.searchPlaceholder = prefs.searchPlaceholder.slice(0, SCHEMA.searchPlaceholder.max);
  if (typeof prefs?.recipientName === 'string') out.recipientName = prefs.recipientName.slice(0, SCHEMA.recipientName.max);
  if (prefs?.uiLang === 'cht' || prefs?.uiLang === 'ja' || prefs?.uiLang === 'en') out.uiLang = prefs.uiLang;
  if (Array.isArray(prefs?.customFolders)) {
    out.customFolders = prefs.customFolders.slice(0, 50).filter(f =>
      f && typeof f.id === 'string' && typeof f.name === 'string' && f.id.length <= 64 && f.name.length > 0
    ).map(f => ({
      id: f.id.slice(0, 64),
      name: f.name.slice(0, 64),
      icon: (typeof f.icon === 'string' ? f.icon.slice(0, 8) : '📁')
    }));
  }
  if (prefs?.display && typeof prefs.display === 'object') {
    const uiScale = clampNumber(prefs.display.uiScale, 80, 130);
    const mailFontSize = clampNumber(prefs.display.mailFontSize, 12, 22);
    out.display = {};
    if (uiScale != null) out.display.uiScale = uiScale;
    if (mailFontSize != null) out.display.mailFontSize = mailFontSize;
    if (!Object.keys(out.display).length) delete out.display;
  }
  if (prefs?.novelMail && typeof prefs.novelMail === 'object') {
    const linesPerPage = clampNumber(prefs.novelMail.linesPerPage, 5, 60);
    if (linesPerPage != null) out.novelMail = { linesPerPage };
  }
  if (prefs?.theme && typeof prefs.theme === 'object') {
    const t = {};
    for (const k of SCHEMA.theme.keys) {
      if (isHexColor(prefs.theme[k])) t[k] = prefs.theme[k];
    }
    if (Object.keys(t).length) out.theme = t;
  }
  // Tutorial completion flags — boolean only.
  for (const k of ['tutorialShown', 'composeTutorialShown', 'novelTutorialShown']) {
    if (prefs?.[k] === true) out[k] = true;
  }
  return out;
}

export function registerPrefs(app) {
  app.get('/api/prefs', async (req, reply) => {
    const me = requireUser(req, reply); if (!me) return;
    const row = stmt.getPrefs.get(me.id);
    let data = {};
    try { data = row ? JSON.parse(row.data) : {}; } catch {}
    return data;
  });

  app.put('/api/prefs', async (req, reply) => {
    const me = requireUser(req, reply); if (!me) return;
    const clean = sanitize(req.body || {});
    stmt.upsertPrefs.run(me.id, JSON.stringify(clean));
    return clean;
  });
}

export { SCHEMA as PREFS_SCHEMA };

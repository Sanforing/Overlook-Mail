import { stmt } from './db.js';
import { requireUser } from './auth.js';

const SCHEMA = {
  brand:     { type: 'string', max: 64 },
  searchPlaceholder: { type: 'string', max: 64 },
  theme: {
    type: 'object',
    keys: ['primary','primaryDark','background','panel','border','textPrimary','textSecondary','unread','hover','selected'],
    valueType: 'color'
  }
};

function isHexColor(s) { return typeof s === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(s); }

function sanitize(prefs) {
  const out = {};
  if (typeof prefs?.brand === 'string') out.brand = prefs.brand.slice(0, SCHEMA.brand.max);
  if (typeof prefs?.searchPlaceholder === 'string') out.searchPlaceholder = prefs.searchPlaceholder.slice(0, SCHEMA.searchPlaceholder.max);
  if (prefs?.theme && typeof prefs.theme === 'object') {
    const t = {};
    for (const k of SCHEMA.theme.keys) {
      if (isHexColor(prefs.theme[k])) t[k] = prefs.theme[k];
    }
    if (Object.keys(t).length) out.theme = t;
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

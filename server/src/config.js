import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Load .env and process.env into a single config object. We intentionally
 * avoid pulling in `dotenv` to keep dependencies minimal — this parser is
 * sufficient for KEY=VALUE files with `#` comments.
 */
function parseDotenv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[k] = v;
  }
  return out;
}

function loadEnv() {
  const cwd = process.cwd();
  const env = {};
  for (const candidate of ['.env', '.env.local']) {
    try {
      const text = readFileSync(resolve(cwd, candidate), 'utf8');
      Object.assign(env, parseDotenv(text));
    } catch { /* ignore missing */ }
  }
  return Object.assign({}, env, process.env);
}

const env = loadEnv();

function bool(v, def = false) {
  if (v == null || v === '') return def;
  return /^(1|true|yes|on)$/i.test(String(v));
}
function num(v, def) { const n = Number(v); return Number.isFinite(n) ? n : def; }
function list(v) { return String(v || '').split(',').map(s => s.trim()).filter(Boolean); }

export const config = {
  port: num(env.PORT, 8787),
  host: env.HOST || '0.0.0.0',
  dataDir: env.DATA_DIR || './data',
  uploadDir: env.UPLOAD_DIR || './data/uploads',
  sessionSecret: env.SESSION_SECRET || 'dev-only-secret-change-me',
  publicOrigin: (env.PUBLIC_ORIGIN || `http://localhost:${num(env.PORT, 8787)}`).replace(/\/+$/, ''),
  extraAllowedOrigins: list(env.EXTRA_ALLOWED_ORIGINS),
  serveStaticFrom: env.SERVE_STATIC_FROM || '',
  google: {
    clientId: env.GOOGLE_CLIENT_ID || '',
    clientSecret: env.GOOGLE_CLIENT_SECRET || ''
  },
  linkedin: {
    clientId: env.LINKEDIN_CLIENT_ID || '',
    clientSecret: env.LINKEDIN_CLIENT_SECRET || ''
  },
  limits: {
    maxUpload: num(env.MAX_UPLOAD_BYTES, 50 * 1024 * 1024),
    romMax: num(env.ROM_MAX_BYTES, 50 * 1024 * 1024),
    novelMax: num(env.NOVEL_MAX_BYTES, 10 * 1024 * 1024)
  },
  allowRegistration: bool(env.ALLOW_REGISTRATION, true),
  defaultTier: env.DEFAULT_TIER || 'free',
  isProd: env.NODE_ENV === 'production'
};

export function providerEnabled(name) {
  if (name === 'google')   return !!(config.google.clientId && config.google.clientSecret);
  if (name === 'linkedin') return !!(config.linkedin.clientId && config.linkedin.clientSecret);
  return false;
}

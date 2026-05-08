import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { stmt, publicUser } from './db.js';
import { config } from './config.js';

const scrypt = promisify(scryptCb);

const SESSION_TTL_MS = 30 * 24 * 3600 * 1000; // 30 days
const COOKIE_NAME = 'sb_sess';

export function randomId(prefix = '') {
  return prefix + randomBytes(12).toString('hex');
}

function initialsOf(name) {
  return String(name || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() || '').join('') || '?';
}

async function hashPassword(password, saltHex) {
  const buf = await scrypt(password, saltHex, 64);
  return buf.toString('hex');
}

export async function createUser({ email, password, displayName, tier, provider, providerUid }) {
  if (!displayName) throw new Error('displayName required');
  const id = randomId('u_');
  const initials = initialsOf(displayName);
  const finalTier = tier || config.defaultTier;
  let salt = null, hash = null;
  if (password) {
    salt = randomBytes(16).toString('hex');
    hash = await hashPassword(password, salt);
  }
  stmt.insertUser.run(id, email || null, displayName, initials, finalTier, salt, hash, Date.now());
  if (provider && providerUid) {
    stmt.insertIdentity.run(id, provider, providerUid, email || null, Date.now());
  } else if (password) {
    stmt.insertIdentity.run(id, 'password', email.toLowerCase(), email || null, Date.now());
  }
  // initialize empty prefs
  stmt.upsertPrefs.run(id, '{}');
  return stmt.userById.get(id);
}

export async function verifyPassword(user, password) {
  if (!user || !user.pass_salt || !user.pass_hash) return false;
  const expected = Buffer.from(user.pass_hash, 'hex');
  const got = await scrypt(password, user.pass_salt, expected.length);
  if (got.length !== expected.length) return false;
  return timingSafeEqual(got, expected);
}

export function findOrLinkOAuthUser({ provider, providerUid, email, displayName }) {
  const ident = stmt.identityByProvider.get(provider, String(providerUid));
  if (ident) return stmt.userById.get(ident.user_id);
  if (email) {
    const existing = stmt.userByEmail.get(email);
    if (existing) {
      stmt.insertIdentity.run(existing.id, provider, String(providerUid), email, Date.now());
      return existing;
    }
  }
  // Brand new user
  return createUserSync({ email, displayName: displayName || (email ? email.split('@')[0] : provider + '-user'), provider, providerUid });
}

// Synchronous helper for OAuth path (no password to scrypt).
function createUserSync({ email, displayName, provider, providerUid }) {
  const id = randomId('u_');
  const initials = initialsOf(displayName);
  stmt.insertUser.run(id, email || null, displayName, initials, config.defaultTier, null, null, Date.now());
  stmt.insertIdentity.run(id, provider, String(providerUid), email || null, Date.now());
  stmt.upsertPrefs.run(id, '{}');
  return stmt.userById.get(id);
}

/* ---------- Sessions ---------- */

export function startSession(reply, userId) {
  const id = randomId('s_');
  const now = Date.now();
  const exp = now + SESSION_TTL_MS;
  stmt.insertSession.run(id, userId, now, exp);
  reply.setCookie(COOKIE_NAME, id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.publicOrigin.startsWith('https://'),
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000)
  });
  return id;
}

export function endSession(req, reply) {
  const sid = req.cookies?.[COOKIE_NAME];
  if (sid) {
    try { stmt.deleteSession.run(sid); } catch {}
  }
  reply.clearCookie(COOKIE_NAME, { path: '/' });
}

export function currentUser(req) {
  const sid = req.cookies?.[COOKIE_NAME];
  if (!sid) return null;
  const sess = stmt.sessionById.get(sid, Date.now());
  if (!sess) return null;
  return stmt.userById.get(sess.user_id);
}

export function requireUser(req, reply) {
  const u = currentUser(req);
  if (!u) { reply.code(401).send({ error: 'unauthorized' }); return null; }
  return u;
}

export { publicUser };

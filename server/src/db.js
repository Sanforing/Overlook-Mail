import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { config } from './config.js';

mkdirSync(config.dataDir,   { recursive: true });
mkdirSync(config.uploadDir, { recursive: true });

const dbPath = resolve(config.dataDir, 'stealthbox.sqlite');
export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/**
 * Schema. We keep this in one place and rely on `IF NOT EXISTS` so the
 * server can be started against an existing DB. Future migrations should
 * be additive.
 */
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  email           TEXT UNIQUE,
  display_name    TEXT NOT NULL,
  initials        TEXT NOT NULL,
  tier            TEXT NOT NULL DEFAULT 'free',
  pass_salt       TEXT,           -- null if OAuth-only
  pass_hash       TEXT,           -- scrypt-derived hex
  created_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_identities (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL,           -- google | linkedin | password
  provider_uid    TEXT NOT NULL,
  email           TEXT,
  created_at      INTEGER NOT NULL,
  UNIQUE(provider, provider_uid)
);

CREATE TABLE IF NOT EXISTS sessions (
  id              TEXT PRIMARY KEY,        -- random opaque token
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at      INTEGER NOT NULL,
  expires_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS prefs (
  user_id         TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data            TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS files (
  id              TEXT PRIMARY KEY,
  owner_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  type            TEXT NOT NULL,
  size            INTEGER NOT NULL,
  storage_path    TEXT NOT NULL,           -- relative to UPLOAD_DIR
  created_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS mails (
  id              TEXT PRIMARY KEY,
  owner_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  visibility      TEXT NOT NULL DEFAULT 'private', -- private | public
  folder          TEXT NOT NULL DEFAULT 'mine',
  type            TEXT NOT NULL,           -- local | iframe | emulator
  data            TEXT NOT NULL,           -- JSON blob: full mail record (sender, subject, config, …)
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS mails_owner_idx     ON mails(owner_id);
CREATE INDEX IF NOT EXISTS mails_visibility_idx ON mails(visibility);

CREATE TABLE IF NOT EXISTS saves (
  mail_id         TEXT NOT NULL REFERENCES mails(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data            TEXT NOT NULL,
  updated_at      INTEGER NOT NULL,
  PRIMARY KEY(mail_id, user_id)
);

CREATE TABLE IF NOT EXISTS app_state (
  state_key       TEXT NOT NULL,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data            TEXT NOT NULL,
  updated_at      INTEGER NOT NULL,
  PRIMARY KEY(state_key, user_id)
);

CREATE TABLE IF NOT EXISTS comments (
  mail_id         TEXT PRIMARY KEY,
  data            TEXT NOT NULL,
  updated_at      INTEGER NOT NULL
);
`);

/** Convenience accessors. All return camelCased rows. */
export const stmt = {
  // users
  insertUser: db.prepare(`INSERT INTO users (id,email,display_name,initials,tier,pass_salt,pass_hash,created_at)
                          VALUES (?,?,?,?,?,?,?,?)`),
  userByEmail:    db.prepare(`SELECT * FROM users WHERE LOWER(email) = LOWER(?)`),
  userById:       db.prepare(`SELECT * FROM users WHERE id = ?`),
  setUserTier:    db.prepare(`UPDATE users SET tier = ? WHERE id = ?`),
  // identities
  insertIdentity: db.prepare(`INSERT OR IGNORE INTO user_identities (user_id,provider,provider_uid,email,created_at) VALUES (?,?,?,?,?)`),
  identityByProvider: db.prepare(`SELECT * FROM user_identities WHERE provider = ? AND provider_uid = ?`),
  // sessions
  insertSession:  db.prepare(`INSERT INTO sessions (id,user_id,created_at,expires_at) VALUES (?,?,?,?)`),
  sessionById:    db.prepare(`SELECT * FROM sessions WHERE id = ? AND expires_at > ?`),
  deleteSession:  db.prepare(`DELETE FROM sessions WHERE id = ?`),
  pruneSessions:  db.prepare(`DELETE FROM sessions WHERE expires_at <= ?`),
  // prefs
  getPrefs:       db.prepare(`SELECT data FROM prefs WHERE user_id = ?`),
  upsertPrefs:    db.prepare(`INSERT INTO prefs (user_id,data) VALUES (?,?)
                              ON CONFLICT(user_id) DO UPDATE SET data = excluded.data`),
  // files
  insertFile:     db.prepare(`INSERT INTO files (id,owner_id,name,type,size,storage_path,created_at) VALUES (?,?,?,?,?,?,?)`),
  fileById:       db.prepare(`SELECT * FROM files WHERE id = ?`),
  filesByOwner:   db.prepare(`SELECT * FROM files WHERE owner_id = ?`),
  // mails
  insertMail:     db.prepare(`INSERT INTO mails (id,owner_id,visibility,folder,type,data,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`),
  updateMail:     db.prepare(`UPDATE mails SET visibility=?, folder=?, type=?, data=?, updated_at=? WHERE id=?`),
  deleteMail:     db.prepare(`DELETE FROM mails WHERE id = ?`),
  mailById:       db.prepare(`SELECT * FROM mails WHERE id = ?`),
  allMails:       db.prepare(`SELECT * FROM mails ORDER BY created_at DESC`),
  // saves
  upsertSave:     db.prepare(`INSERT INTO saves (mail_id,user_id,data,updated_at) VALUES (?,?,?,?)
                              ON CONFLICT(mail_id,user_id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at`),
  getSave:        db.prepare(`SELECT data FROM saves WHERE mail_id = ? AND user_id = ?`),
  upsertAppState: db.prepare(`INSERT INTO app_state (state_key,user_id,data,updated_at) VALUES (?,?,?,?)
                              ON CONFLICT(state_key,user_id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at`),
  getAppState:    db.prepare(`SELECT data FROM app_state WHERE state_key = ? AND user_id = ?`),
  upsertComments: db.prepare(`INSERT INTO comments (mail_id,data,updated_at) VALUES (?,?,?)
                              ON CONFLICT(mail_id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at`),
  getComments:    db.prepare(`SELECT data FROM comments WHERE mail_id = ?`)
};

/** Build the absolute path for a stored file. */
export function uploadPath(rel) { return join(config.uploadDir, rel); }

/** Public projection of a user row. */
export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    initials: row.initials,
    tier: row.tier
  };
}

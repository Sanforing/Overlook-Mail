/**
 * Backend abstraction.
 *
 * The default implementation (`LocalBackend`) is 100% client-side and stores
 * everything in IndexedDB so the demo runs without a server. The same
 * surface can be re-implemented against a real REST/GraphQL backend by
 * registering a different backend in settings.json -> backend.kind.
 *
 * Surface (every method returns a Promise):
 *   auth: register, login, logout, currentUser
 *   mails: list({category, folder, ownerId, q, includePublic}),
 *          get(id), create(mail), update(id, patch), remove(id)
 *   files: putBlob(file)->{id,url,name,size,type}, getBlobURL(id)
 *   saves: saveState(mailId, data), loadState(mailId)
 *
 * Mail record shape (a superset of manifest.json entries — anything
 * apps/manifest.json supports also works here, plus ownerId, visibility,
 * createdAt, monochrome):
 *   {
 *     id, ownerId, ownerName, visibility: 'private'|'public',
 *     folder, type: 'local'|'iframe'|'emulator',
 *     entry?, url?, rom?: {fileId, core},
 *     sender, recipient, subject, preview, date,
 *     template, monochrome: 'none'|'grayscale'|'sepia'|'blue',
 *     config, createdAt
 *   }
 *
 * SECURITY NOTE: passwords are stored salted+hashed via SubtleCrypto so they
 * are not plaintext, but this is still a client-side demo. Do not use it as
 * a production identity store. Replace with a real backend before shipping.
 */

const DB_NAME = 'stealthbox';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('users'))   db.createObjectStore('users',   { keyPath: 'id' });
      if (!db.objectStoreNames.contains('mails'))   db.createObjectStore('mails',   { keyPath: 'id' });
      if (!db.objectStoreNames.contains('files'))   db.createObjectStore('files',   { keyPath: 'id' });
      if (!db.objectStoreNames.contains('saves'))   db.createObjectStore('saves',   { keyPath: 'mailId' });
      if (!db.objectStoreNames.contains('session')) db.createObjectStore('session', { keyPath: 'k' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, storeNames, mode = 'readonly') {
  const t = db.transaction(storeNames, mode);
  const stores = {};
  for (const n of [].concat(storeNames)) stores[n] = t.objectStore(n);
  return { t, stores, done: new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }) };
}

const wrap = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

async function sha256Hex(text) {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function randomId(prefix = '') {
  const a = new Uint8Array(8); crypto.getRandomValues(a);
  return prefix + Array.from(a).map(b => b.toString(16).padStart(2, '0')).join('');
}

function initialsOf(name) {
  return String(name || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() || '').join('') || '?';
}

class LocalBackend {
  constructor(settings) {
    this.settings = settings;
    this._dbPromise = openDB();
    this._blobURLs = new Map(); // id -> object URL (revoked on logout)
  }

  async _db() { return this._dbPromise; }

  // ===== Auth =====

  async register({ email, password, displayName, tier = 'free' }) {
    if (!email || !password || !displayName) throw new Error('email, password and displayName are required');
    const db = await this._db();
    const { stores, done } = tx(db, ['users'], 'readwrite');
    const existing = await wrap(stores.users.getAll());
    if (existing.some(u => u.email.toLowerCase() === email.toLowerCase())) throw new Error('An account with that email already exists');
    const salt = randomId();
    const passHash = await sha256Hex(salt + ':' + password);
    const user = {
      id: randomId('u_'),
      email, displayName, tier,
      initials: initialsOf(displayName),
      salt, passHash,
      createdAt: Date.now()
    };
    stores.users.add(user);
    await done;
    await this._setSession(user.id);
    return this._publicUser(user);
  }

  async login({ email, password }) {
    const db = await this._db();
    const { stores } = tx(db, ['users']);
    const all = await wrap(stores.users.getAll());
    const u = all.find(x => x.email.toLowerCase() === email.toLowerCase());
    if (!u) throw new Error('Account not found');
    const expect = await sha256Hex(u.salt + ':' + password);
    if (expect !== u.passHash) throw new Error('Wrong password');
    await this._setSession(u.id);
    return this._publicUser(u);
  }

  async logout() {
    const db = await this._db();
    const { stores, done } = tx(db, ['session'], 'readwrite');
    stores.session.delete('current');
    await done;
    for (const url of this._blobURLs.values()) URL.revokeObjectURL(url);
    this._blobURLs.clear();
  }

  async currentUser() {
    const db = await this._db();
    const { stores } = tx(db, ['session', 'users']);
    const s = await wrap(stores.session.get('current'));
    if (!s?.userId) return null;
    const u = await wrap(stores.users.get(s.userId));
    return u ? this._publicUser(u) : null;
  }

  /** Demo helper: bump the current user's tier. In a real app this comes from billing. */
  async upgradeCurrent(tier = 'paid') {
    const db = await this._db();
    const { stores, done } = tx(db, ['session', 'users'], 'readwrite');
    const s = await wrap(stores.session.get('current'));
    if (!s?.userId) throw new Error('Not signed in');
    const u = await wrap(stores.users.get(s.userId));
    u.tier = tier;
    stores.users.put(u);
    await done;
    return this._publicUser(u);
  }

  async _setSession(userId) {
    const db = await this._db();
    const { stores, done } = tx(db, ['session'], 'readwrite');
    stores.session.put({ k: 'current', userId });
    await done;
  }

  _publicUser(u) {
    return { id: u.id, email: u.email, displayName: u.displayName, initials: u.initials, tier: u.tier };
  }

  // ===== Mails =====

  async list({ category, folder, ownerId, q, includePublic = true } = {}) {
    const db = await this._db();
    const { stores } = tx(db, ['mails']);
    const all = await wrap(stores.mails.getAll());
    const me = await this.currentUser();
    return all.filter(m => {
      if (folder && m.folder !== folder) return false;
      if (ownerId && m.ownerId !== ownerId) return false;
      if (category) {
        if (category === 'admin'     && m.ownerId !== 'admin') return false;
        if (category === 'mine'      && (!me || m.ownerId !== me.id)) return false;
        if (category === 'community' && (m.ownerId === 'admin' || (me && m.ownerId === me.id))) return false;
        if (category === 'community' && m.visibility !== 'public') return false;
      }
      if (m.visibility === 'private' && (!me || m.ownerId !== me.id) && m.ownerId !== 'admin') return false;
      if (q) {
        const hay = `${m.subject} ${m.preview} ${m.sender?.name || ''}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      if (!includePublic && m.visibility === 'public') return false;
      return true;
    }).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  async get(id) {
    const db = await this._db();
    const { stores } = tx(db, ['mails']);
    return wrap(stores.mails.get(id));
  }

  async create(mail) {
    const me = await this.currentUser();
    if (!me) throw new Error('You must be signed in to create a mail');
    const record = Object.assign({
      visibility: 'private',
      monochrome: 'none',
      template: 'default',
      folder: 'mine',
      date: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    }, mail, {
      id: mail.id || randomId('m_'),
      ownerId: me.id,
      ownerName: me.displayName,
      sender: mail.sender || { name: me.displayName, email: me.email, title: 'Self', company: this.settings.user?.company || '' },
      recipient: mail.recipient || me.displayName,
      createdAt: Date.now()
    });
    const db = await this._db();
    const { stores, done } = tx(db, ['mails'], 'readwrite');
    stores.mails.put(record);
    await done;
    return record;
  }

  async update(id, patch) {
    const db = await this._db();
    const { stores, done } = tx(db, ['mails'], 'readwrite');
    const cur = await wrap(stores.mails.get(id));
    if (!cur) throw new Error('Mail not found');
    const me = await this.currentUser();
    if (!me || cur.ownerId !== me.id) throw new Error('Not allowed');
    Object.assign(cur, patch);
    stores.mails.put(cur);
    await done;
    return cur;
  }

  async remove(id) {
    const db = await this._db();
    const { stores, done } = tx(db, ['mails'], 'readwrite');
    const cur = await wrap(stores.mails.get(id));
    if (!cur) return;
    const me = await this.currentUser();
    if (!me || cur.ownerId !== me.id) throw new Error('Not allowed');
    stores.mails.delete(id);
    await done;
  }

  // ===== Files =====

  /**
   * Persist a File/Blob. Paid users get permanent storage; free users get
   * the same record but with `persisted=false` (the host UI may treat that
   * as "session only" if it wants — for the demo we keep it stored).
   */
  async putBlob(file, { persisted = true } = {}) {
    const db = await this._db();
    const id = randomId('f_');
    const record = {
      id, name: file.name || 'blob', type: file.type || 'application/octet-stream',
      size: file.size, blob: file, persisted, createdAt: Date.now()
    };
    const { stores, done } = tx(db, ['files'], 'readwrite');
    stores.files.put(record);
    await done;
    return { id, name: record.name, type: record.type, size: record.size, url: this.getBlobURL(id, file) };
  }

  async getFile(id) {
    const db = await this._db();
    const { stores } = tx(db, ['files']);
    return wrap(stores.files.get(id));
  }

  /** Returns an object URL (cached per session) to embed in src=. */
  getBlobURL(id, blob) {
    if (this._blobURLs.has(id)) return this._blobURLs.get(id);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    this._blobURLs.set(id, url);
    return url;
  }

  async getOrCreateBlobURL(id) {
    if (this._blobURLs.has(id)) return this._blobURLs.get(id);
    const rec = await this.getFile(id);
    if (!rec) return null;
    return this.getBlobURL(id, rec.blob);
  }

  // ===== Game saves =====

  async saveState(mailId, data) {
    const db = await this._db();
    const { stores, done } = tx(db, ['saves'], 'readwrite');
    stores.saves.put({ mailId, data, updatedAt: Date.now() });
    await done;
  }

  async loadState(mailId) {
    const db = await this._db();
    const { stores } = tx(db, ['saves']);
    const r = await wrap(stores.saves.get(mailId));
    return r?.data ?? null;
  }
}

const REGISTRY = { local: LocalBackend };

export function registerBackend(name, cls) { REGISTRY[name] = cls; }

export function createBackend(settings) {
  const kind = settings?.backend?.kind || 'local';
  const Cls = REGISTRY[kind];
  if (!Cls) throw new Error(`Unknown backend kind: ${kind}`);
  return new Cls(settings);
}

/** Free vs Paid feature gate — single source of truth. */
export function canUse(user, feature, settings) {
  const matrix = settings?.features || {};
  const required = matrix[feature]; // 'guest' | 'free' | 'paid'
  if (!required || required === 'guest') return true;
  if (!user) return false;
  if (required === 'free') return true;
  if (required === 'paid') return user.tier === 'paid';
  return false;
}

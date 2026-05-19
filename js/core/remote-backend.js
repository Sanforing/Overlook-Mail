/**
 * Remote backend that talks to the Fastify+SQLite server in /server.
 *
 * It mirrors the surface of LocalBackend (see backend.js) so the rest of
 * the UI does not care whether storage is in-browser or on a VPS. Activate
 * by setting `backend.kind = "remote"` in config/settings.json:
 *
 *   "backend": { "kind": "remote", "baseUrl": "https://your-host" }
 *
 * baseUrl may be empty, in which case requests are same-origin (useful
 * when the server also serves the static frontend via SERVE_STATIC_FROM).
 */

function randomId(prefix = '') {
  const a = new Uint8Array(8); crypto.getRandomValues(a);
  return prefix + Array.from(a).map(b => b.toString(16).padStart(2, '0')).join('');
}

const LOCAL_FILE_DB = 'stealthbox-local-files';
const LOCAL_FILE_DB_VERSION = 2;

function openLocalFileDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(LOCAL_FILE_DB, LOCAL_FILE_DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('state')) db.createObjectStore('state', { keyPath: 'mailId' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function localTx(db, storeName, mode = 'readonly') {
  const t = db.transaction([storeName], mode);
  const store = t.objectStore(storeName);
  return { store, done: new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }) };
}

const wrap = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

class RemoteBackend {
  constructor(settings) {
    this.settings = settings;
    this.baseUrl = (settings?.backend?.baseUrl || '').replace(/\/+$/, '');
    this._user = undefined; // unknown until first currentUser() call
    this._localFiles = openLocalFileDB();
    this._blobURLs = new Map();
  }

  async _fileDB() { return this._localFiles; }

  // ---- low level ----
  async _req(path, { method = 'GET', body, isForm = false, headers } = {}) {
    const opts = {
      method,
      credentials: 'include',
      headers: Object.assign({}, headers || {})
    };
    if (body != null) {
      if (isForm) {
        opts.body = body;
      } else {
        opts.headers['content-type'] = 'application/json';
        opts.body = JSON.stringify(body);
      }
    }
    const res = await fetch(this.baseUrl + path, opts);
    if (res.status === 204) return null;
    const text = await res.text();
    let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const msg = (data && data.error) || res.statusText || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data;
  }

  // ---- meta (used by auth-ui to decide which buttons to show) ----
  async meta() {
    if (this._meta) return this._meta;
    this._meta = await this._req('/api/meta').catch(() => ({ providers: {} }));
    return this._meta;
  }

  // ---- auth ----
  async register({ email, password, displayName, tier = 'free' }) {
    const u = await this._req('/api/auth/register', { method: 'POST', body: { email, password, displayName, tier } });
    this._user = u;
    return u;
  }
  async login({ email, password }) {
    const u = await this._req('/api/auth/login', { method: 'POST', body: { email, password } });
    this._user = u;
    return u;
  }
  async logout() {
    await this._req('/api/auth/logout', { method: 'POST' });
    this._user = null;
    for (const url of this._blobURLs.values()) URL.revokeObjectURL(url);
    this._blobURLs.clear();
  }
  async currentUser() {
    if (this._user !== undefined) return this._user;
    this._user = await this._req('/api/auth/me').catch(() => null);
    return this._user;
  }
  async upgradeCurrent(/* tier */) {
    // If Stripe is configured on the server, redirect to one-time donation
    // Checkout instead of doing the legacy demo flip.
    try {
      const u = await this._req('/api/auth/upgrade', { method: 'POST' });
      this._user = u;
      return u;
    } catch (e) {
      // Fall through to Stripe Checkout.
    }
    const session = await this._req('/api/stripe/checkout', { method: 'POST' });
    if (session && session.url) {
      window.location.href = session.url;
      return null;
    }
    throw new Error('upgrade failed');
  }

  /** Used by OAuth popup flow to refresh after callback fires. */
  invalidateUser() { this._user = undefined; }

  // ---- prefs ----
  async getPrefs() {
    try { return await this._req('/api/prefs'); }
    catch { return {}; }
  }
  async putPrefs(prefs) {
    return this._req('/api/prefs', { method: 'PUT', body: prefs });
  }

  // ---- mails ----
  async list({ category, folder, ownerId, q, includePublic = true } = {}) {
    const all = await this._req('/api/mails');
    const me = await this.currentUser();
    return (all || []).filter(m => {
      if (folder && m.folder !== folder) return false;
      if (ownerId && m.ownerId !== ownerId) return false;
      if (category) {
        if (category === 'admin'     && m.ownerId !== 'admin') return false;
        if (category === 'mine'      && (!me || m.ownerId !== me.id)) return false;
        if (category === 'community' && (m.ownerId === 'admin' || (me && m.ownerId === me.id))) return false;
        if (category === 'community' && m.visibility !== 'public') return false;
      }
      if (!includePublic && m.visibility === 'public') return false;
      if (q) {
        const hay = `${m.subject || ''} ${m.preview || ''} ${m.sender?.name || ''}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    }).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }
  async get(id) { return this._req(`/api/mails/${encodeURIComponent(id)}`); }

  async create(mail) {
    return this._req('/api/mails', { method: 'POST', body: Object.assign({ id: randomId('m_') }, mail) });
  }
  async update(id, patch) {
    return this._req(`/api/mails/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch });
  }
  async remove(id) {
    return this._req(`/api/mails/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  // ---- files ----
  async putBlob(file) {
    return this.putFile(randomId('f_'), file);
  }
  async putFile(id, file) {
    const db = await this._fileDB();
    const arrayBuffer = await file.arrayBuffer();
    const type = file.type || 'application/octet-stream';
    const record = {
      id,
      name: file.name || 'blob',
      type,
      size: file.size,
      blob: new Blob([arrayBuffer], { type }),
      createdAt: Date.now()
    };
    const { store, done } = localTx(db, 'files', 'readwrite');
    store.put(record);
    await done;
    if (this._blobURLs.has(id)) URL.revokeObjectURL(this._blobURLs.get(id));
    this._blobURLs.delete(id);
    return { id, name: record.name, type: record.type, size: record.size, url: this.getBlobURL(id, record.blob) };
  }
  async getFile(id) {
    const db = await this._fileDB();
    const { store } = localTx(db, 'files');
    return wrap(store.get(id));
  }
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

  // ---- saves ----
  async saveState(mailId, data) {
    const db = await this._fileDB();
    const { store, done } = localTx(db, 'state', 'readwrite');
    store.put({ mailId: String(mailId), data, updatedAt: Date.now() });
    await done;
    return { ok: true };
  }
  async loadState(mailId) {
    const db = await this._fileDB();
    const { store } = localTx(db, 'state');
    const row = await wrap(store.get(String(mailId)));
    return row?.data ?? null;
  }

  async loadComments(mailId) {
    return this._req(`/api/comments/${encodeURIComponent(mailId)}`).catch(() => ({ entries: [] }));
  }
  async saveComments(mailId, data) {
    if (!this._user) return null;
    return this._req(`/api/comments/${encodeURIComponent(mailId)}`, { method: 'PUT', body: data });
  }

  // ---- OAuth helpers ----
  oauthStartUrl(provider) {
    return this.baseUrl + `/auth/oauth/${encodeURIComponent(provider)}/start?return=${encodeURIComponent(location.href)}`;
  }
}

export { RemoteBackend };

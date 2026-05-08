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

class RemoteBackend {
  constructor(settings) {
    this.settings = settings;
    this.baseUrl = (settings?.backend?.baseUrl || '').replace(/\/+$/, '');
    this._user = undefined; // unknown until first currentUser() call
  }

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
  }
  async currentUser() {
    if (this._user !== undefined) return this._user;
    this._user = await this._req('/api/auth/me').catch(() => null);
    return this._user;
  }
  async upgradeCurrent(/* tier */) {
    const u = await this._req('/api/auth/upgrade', { method: 'POST' });
    this._user = u;
    return u;
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
    const fd = new FormData();
    fd.append('file', file, file.name || 'upload');
    const r = await this._req('/api/files', { method: 'POST', body: fd, isForm: true });
    return { id: r.id, name: r.name, type: r.type, size: r.size, url: this._fileUrl(r.id) };
  }
  async getFile(id) {
    const meta = await this._req(`/api/files/${encodeURIComponent(id)}`);
    if (!meta) return null;
    const blobRes = await fetch(this.baseUrl + `/api/files/${encodeURIComponent(id)}/blob`, { credentials: 'include' });
    if (!blobRes.ok) return null;
    const blob = await blobRes.blob();
    return Object.assign({}, meta, { blob });
  }
  _fileUrl(id) { return this.baseUrl + `/api/files/${encodeURIComponent(id)}/blob`; }
  getBlobURL(id)            { return this._fileUrl(id); }
  async getOrCreateBlobURL(id) { return this._fileUrl(id); }

  // ---- saves ----
  async saveState(mailId, data) {
    return this._req(`/api/saves/${encodeURIComponent(mailId)}`, { method: 'PUT', body: data });
  }
  async loadState(mailId) {
    try { return await this._req(`/api/saves/${encodeURIComponent(mailId)}`); }
    catch { return null; }
  }

  // ---- OAuth helpers ----
  oauthStartUrl(provider) {
    return this.baseUrl + `/auth/oauth/${encodeURIComponent(provider)}/start?return=${encodeURIComponent(location.href)}`;
  }
}

export { RemoteBackend };

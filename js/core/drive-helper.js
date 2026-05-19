/**
 * Google Drive browser-side helper.
 *
 * Uses Google Identity Services (GIS) token model to obtain a short-lived
 * drive.readonly access token entirely in the browser, then fetches file
 * bytes directly from the Drive API and saves them to the backend's local
 * IndexedDB via backend.putFile() / backend.putBlob().
 *
 * No file bytes pass through our server.
 *
 * Public API:
 *   pickDriveFile(options) → selected Drive document metadata
 *   driveDownloadToLocal(fileId, clientId, backend, suggestedId?, tokenResponse?) → {id, name, …}
 */

const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
const GAPI_SCRIPT_SRC = 'https://apis.google.com/js/api.js';
const DRIVE_SCOPE    = 'https://www.googleapis.com/auth/drive.readonly';

let _gisLoadPromise = null;
let _gapiLoadPromise = null;
let _pickerLoadPromise = null;
let _tokenClient    = null;
let _lastTokenResponse = null;
let _lastTokenExpiresAt = 0;

function loadGIS() {
  if (_gisLoadPromise) return _gisLoadPromise;
  _gisLoadPromise = new Promise((resolve, reject) => {
    if (typeof google !== 'undefined' && google?.accounts?.oauth2) {
      return resolve();
    }
    const s = document.createElement('script');
    s.src   = GIS_SCRIPT_SRC;
    s.async = true;
    s.onload  = resolve;
    s.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(s);
  });
  return _gisLoadPromise;
}

function loadGAPI() {
  if (_gapiLoadPromise) return _gapiLoadPromise;
  _gapiLoadPromise = new Promise((resolve, reject) => {
    if (typeof gapi !== 'undefined' && gapi?.load) return resolve();
    const s = document.createElement('script');
    s.src   = GAPI_SCRIPT_SRC;
    s.async = true;
    s.onload  = resolve;
    s.onerror = () => reject(new Error('Failed to load Google API client'));
    document.head.appendChild(s);
  });
  return _gapiLoadPromise;
}

async function loadPicker() {
  await loadGAPI();
  if (_pickerLoadPromise) return _pickerLoadPromise;
  _pickerLoadPromise = new Promise((resolve) => gapi.load('picker', { callback: resolve }));
  return _pickerLoadPromise;
}

/**
 * Prompt the user for Drive read-only access via GIS popup.
 * Returns the raw token response { access_token, expires_in, … }.
 */
function acquireDriveToken(clientId) {
  if (_lastTokenResponse?.access_token && Date.now() < _lastTokenExpiresAt - 60_000) {
    return Promise.resolve(_lastTokenResponse);
  }
  return new Promise((resolve, reject) => {
    const respond = (resp) => {
      if (resp.error) {
        reject(new Error(`Google auth error: ${resp.error}`));
      } else {
        _lastTokenResponse = resp;
        _lastTokenExpiresAt = Date.now() + Number(resp.expires_in || 3600) * 1000;
        resolve(resp);
      }
    };
    if (!_tokenClient) {
      _tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: DRIVE_SCOPE,
        callback: respond
      });
    } else {
      _tokenClient.callback = respond;
    }
    _tokenClient.requestAccessToken();
  });
}

export async function getDriveAccessToken(clientId) {
  await loadGIS();
  return acquireDriveToken(clientId);
}

export async function pickDriveFile({ clientId, apiKey, appId, mimeTypes } = {}) {
  if (!clientId) throw new Error('Google Drive is not configured on this server.');
  await loadGIS();
  await loadPicker();
  const tokenResponse = await acquireDriveToken(clientId);

  return new Promise((resolve, reject) => {
    let retriedWithoutKey = false;

    function openPicker(useDeveloperKey) {
      const view = new google.picker.DocsView(google.picker.ViewId.DOCS);
      view.setIncludeFolders(false);
      if (mimeTypes) view.setMimeTypes(mimeTypes);

      const builder = new google.picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(tokenResponse.access_token)
        .setCallback((data) => {
          const message = String(data?.message || data?.error || '').toLowerCase();
          if (
            useDeveloperKey &&
            !retriedWithoutKey &&
            data.action === google.picker.Action.ERROR &&
            message.includes('developer key')
          ) {
            retriedWithoutKey = true;
            openPicker(false);
            return;
          }
          if (data.action === google.picker.Action.PICKED) {
            resolve(Object.assign({}, data.docs?.[0] || {}, { tokenResponse }));
          } else if (data.action === google.picker.Action.CANCEL) {
            resolve(null);
          } else if (data.action === google.picker.Action.ERROR) {
            reject(new Error(data.message || data.error || 'Google Picker error'));
          }
        });

      if (useDeveloperKey && apiKey) builder.setDeveloperKey(apiKey);
      if (appId) builder.setAppId(appId);

      builder.build().setVisible(true);
    }

    try { openPicker(Boolean(apiKey)); }
    catch (err) { reject(err); }
  });
}

/**
 * Download a Google Drive file and persist it in the backend's local
 * IndexedDB.  Yields the same shape as backend.putBlob/putFile:
 *   { id, name, size, type }
 *
 * @param {string}      fileId      - Google Drive file ID
 * @param {string}      clientId    - Google OAuth client ID (from /api/meta)
 * @param {object}      backend     - backend instance (putFile or putBlob)
 * @param {string|null} [suggestedId] - optional fixed id so overwrite works
 */
export async function driveDownloadToLocal(fileId, clientId, backend, suggestedId = null, tokenResponse = null) {
  await loadGIS();
  const { access_token } = tokenResponse?.access_token ? tokenResponse : await acquireDriveToken(clientId);

  // 1. Fetch metadata to get the file name and MIME type.
  const metaRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=name%2CmimeType`,
    { headers: { Authorization: `Bearer ${access_token}` } }
  );
  if (!metaRes.ok) {
    const txt = await metaRes.text().catch(() => metaRes.statusText);
    throw new Error(`Drive metadata: ${txt}`);
  }
  const meta = await metaRes.json();

  // 2. Download the actual bytes.
  const dlRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
    { headers: { Authorization: `Bearer ${access_token}` } }
  );
  if (!dlRes.ok) {
    const txt = await dlRes.text().catch(() => dlRes.statusText);
    throw new Error(`Drive download: ${txt}`);
  }
  const blob = await dlRes.blob();
  const file = new File([blob], meta.name || `drive-${fileId}`, {
    type: meta.mimeType || 'application/octet-stream'
  });

  // 3. Persist in local IndexedDB.
  if (suggestedId && typeof backend.putFile === 'function') {
    return backend.putFile(suggestedId, file);
  }
  return backend.putBlob(file);
}

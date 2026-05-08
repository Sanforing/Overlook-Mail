import { loadJSON, applyThemeVars } from './core/utils.js';
import { initUI, host } from './core/ui.js';
import { initBossKey } from './core/boss-key.js';
import { initMute } from './core/mute.js';
import { createBackend, registerBackend } from './core/backend.js';
import { RemoteBackend } from './core/remote-backend.js';
import { applyUserPrefs } from './core/prefs-ui.js';

registerBackend('remote', RemoteBackend);

async function bootstrap() {
  const [settings, folders, categories, templates, manifest] = await Promise.all([
    loadJSON('config/settings.json'),
    loadJSON('config/folders.json'),
    loadJSON('config/categories.json'),
    loadJSON('config/templates.json'),
    loadJSON('apps/manifest.json')
  ]);

  applyThemeVars(settings.theme);
  document.title = settings.appName || 'Outlook';

  const backend = createBackend(settings);
  const user = await backend.currentUser();

  const state = {
    settings, folders, categories, templates,
    adminApps: manifest.apps || [],
    backend, user, userPrefs: {},
    currentFolder: null, currentCategory: null, search: '',
    visibleMails: []
  };
  window.__stealth = state;

  if (user && typeof backend.getPrefs === 'function') {
    try {
      const prefs = await backend.getPrefs();
      applyUserPrefs(state, prefs);
    } catch { /* keep defaults */ }
  }

  initMute(state);
  await initUI(state);
  initBossKey(state, host);
}

bootstrap().catch(err => {
  console.error(err);
  document.body.innerHTML =
    `<pre style="padding:24px;color:#a4262c;font-family:Consolas,monospace">Failed to start: ${String(err)}</pre>`;
});

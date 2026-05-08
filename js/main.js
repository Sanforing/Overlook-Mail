import { loadJSON, applyThemeVars } from './core/utils.js';
import { initUI, host } from './core/ui.js';
import { initBossKey } from './core/boss-key.js';
import { initMute } from './core/mute.js';
import { createBackend } from './core/backend.js';

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
    backend, user,
    currentFolder: null, currentCategory: null, search: '',
    visibleMails: []
  };
  window.__stealth = state;

  initMute(state);
  await initUI(state);
  initBossKey(state, host);
}

bootstrap().catch(err => {
  console.error(err);
  document.body.innerHTML =
    `<pre style="padding:24px;color:#a4262c;font-family:Consolas,monospace">Failed to start: ${String(err)}</pre>`;
});

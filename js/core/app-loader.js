import StealthAppBase from './app-base.js';

/**
 * Helper: install a keydown listener inside a same-origin iframe that
 *  - forwards Escape presses to the parent (so the boss-key sequence still
 *    triggers when the embedded game/emulator has focus and is swallowing
 *    document-level keys), and
 *  - prevents arrow / space / page keys from bubbling up so the parent
 *    reader pane doesn't scroll while the user plays.
 *
 * Returns true if the listener was successfully attached. Cross-origin
 * iframes throw on contentDocument access; we silently ignore that case.
 */
function injectIframeKeyBridge(frame) {
  try {
    const doc = frame.contentDocument;
    if (!doc) return false;
    const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', ' ']);
    const onKey = (e) => {
      if (e.key === 'Escape') {
        try { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); } catch {}
      }
      // Prevent the browser from propagating unhandled scroll requests from
      // inside the iframe up to the parent page. This is the primary cause of
      // the reader pane scrolling while a game (e.g. emulator) has focus.
      // Calling preventDefault here does NOT stop JS game listeners from
      // receiving the event — it only blocks the browser's native scroll action.
      if (SCROLL_KEYS.has(e.key)) e.preventDefault();
    };
    doc.addEventListener('keydown', onKey, true);
    // also focus the iframe content on click so subsequent keys don't fall
    // through to the host document and scroll it.
    doc.addEventListener('mousedown', () => { try { frame.contentWindow?.focus(); } catch {} }, true);
    return true;
  } catch { return false; }
}

/**
 * Block parent-page scrolling when the user is interacting with an embedded
 * game iframe but the iframe hasn't taken focus yet (e.g. arrow keys
 * pressed before clicking). Returns a teardown function.
 */
function installArrowKeyGuard(container) {
  const blocked = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', ' ']);
  const onKey = (e) => {
    if (!blocked.has(e.key)) return;
    // Only swallow keys when the host container is actually in the DOM.
    if (!container.isConnected) return;
    const tag = (e.target?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) return;
    e.preventDefault();
    // Forward focus into iframe so it gets the next keystroke directly.
    const f = container.querySelector('iframe');
    try { f?.contentWindow?.focus(); } catch {}
  };
  document.addEventListener('keydown', onKey, true);
  return () => document.removeEventListener('keydown', onKey, true);
}

/**
 * Loads a runnable instance for a manifest entry. Returns an object with
 *   { mount(container), destroy(), pause(), resume() }
 * The loader is intentionally pluggable: add a new "type" by registering a
 * factory in TYPE_LOADERS.
 */
const TYPE_LOADERS = {
  /** Local ES-module app. `entry` is resolved relative to the HTML page. */
  async local(app, ctx) {
    const url = new URL(app.entry, document.baseURI).href;
    const mod = await import(/* @vite-ignore */ url);
    const Cls = mod.default;
    if (!Cls) throw new Error(`App ${app.id}: module has no default export`);
    return (container) => {
      // Prevent arrow / space / page keys from scrolling the reader pane
      // while the game is running (same guard used for iframe/emulator types).
      const teardownGuard = installArrowKeyGuard(container);
      const inst = new Cls(container, app.config || {}, ctx);
      const ret = inst.init();
      return Promise.resolve(ret).then((instance) => {
        const origDestroy = instance.destroy?.bind(instance);
        instance.destroy = () => { teardownGuard(); origDestroy?.(); };
        return instance;
      });
    };
  },

  /** External page embedded in an iframe. */
  async iframe(app /*, ctx */) {
    return (container) => {
      const frame = document.createElement('iframe');
      frame.className = 'app-host';
      frame.src = app.url;
      frame.setAttribute('sandbox', app.sandbox || 'allow-scripts allow-same-origin allow-forms allow-popups allow-downloads allow-modals');
      frame.setAttribute('referrerpolicy', 'no-referrer');
      frame.allow = app.allow || '';
      container.appendChild(frame);
      frame.addEventListener('load', () => injectIframeKeyBridge(frame));
      const teardownGuard = installArrowKeyGuard(container);
      return Promise.resolve({
        pause()   { try { frame.contentWindow?.postMessage({ type: 'stealth:pause' }, '*'); } catch {} },
        resume()  { try { frame.contentWindow?.postMessage({ type: 'stealth:resume' }, '*'); } catch {} },
        destroy() { teardownGuard(); frame.remove(); }
      });
    };
  },

  /**
   * Emulator app. Renders an isolated iframe that bootstraps EmulatorJS with
   * the ROM blob URL fetched from the backend. Config:
   *   { fileId, core, name }
   * Settings provide the loader URL via settings.emulator.loaderUrl.
   */
  async emulator(app, ctx) {
    const cfg = app.config || {};
    const backend = ctx.host?.backend;
    if (!backend) throw new Error('Emulator app requires a backend in ctx.host');
    const url = cfg.fileId ? await backend.getOrCreateBlobURL(cfg.fileId) : cfg.url;
    if (!url) throw new Error('Emulator: ROM not found');
    const loaderUrl = ctx.settings?.emulator?.loaderUrl || 'https://cdn.emulatorjs.org/stable/data/loader.js';
    const dataPath  = ctx.settings?.emulator?.dataPath  || 'https://cdn.emulatorjs.org/stable/data/';

    return (container) => {
      const frame = document.createElement('iframe');
      frame.className = 'app-host';
      // allow-downloads is required for EmulatorJS "Export Save" / state
      // exports to actually trigger a file download. allow-modals is needed
      // for some core dialogs.
      frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-downloads allow-popups allow-modals allow-forms');
      // Build a self-contained boot document so we don't need any extra files on disk.
      const html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body,#game{margin:0;height:100%;background:#000;color:#fff;font-family:Segoe UI,Arial}</style></head>
<body><div id="game"></div>
<script>
  // Forward Escape to the parent document so the global boss-key sequence
  // still works while the emulator has focus.
  // Also prevent arrow/scroll keys from bubbling as scroll to the parent page.
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      try { parent.document.dispatchEvent(new parent.KeyboardEvent('keydown', { key: 'Escape' })); } catch (_) {}
    }
    var scrollKeys = ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','PageUp','PageDown',' '];
    if (scrollKeys.indexOf(e.key) !== -1) e.preventDefault();
  }, true);
  // Auto-focus on click so subsequent arrow keys don't fall through to the
  // host page and scroll the email reader.
  document.addEventListener('mousedown', function () { window.focus(); }, true);
  window.EJS_player = '#game';
  window.EJS_core = ${JSON.stringify(cfg.core || 'gba')};
  window.EJS_gameUrl = ${JSON.stringify(url)};
  window.EJS_pathtodata = ${JSON.stringify(dataPath)};
  window.EJS_startOnLoaded = true;
  window.EJS_volume = 0;
  window.EJS_gameName = ${JSON.stringify(cfg.name || 'rom')};
<\/script>
<script src="${loaderUrl}"><\/script>
</body></html>`;
      frame.srcdoc = html;
      container.appendChild(frame);
      frame.addEventListener('load', () => injectIframeKeyBridge(frame));
      const teardownGuard = installArrowKeyGuard(container);
      return Promise.resolve({
        pause()   { try { frame.contentWindow?.EJS_emulator?.pause?.(); } catch {} },
        resume()  { try { frame.contentWindow?.EJS_emulator?.play?.();  } catch {} },
        destroy() { teardownGuard(); frame.remove(); }
      });
    };
  }
};

export function registerAppType(name, factory) {
  TYPE_LOADERS[name] = factory;
}

export async function createAppRunner(app, ctx) {
  const factory = TYPE_LOADERS[app.type];
  if (!factory) throw new Error(`Unknown app type: ${app.type}`);
  return factory(app, ctx);
}

export { StealthAppBase };

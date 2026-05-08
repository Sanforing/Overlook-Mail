import StealthAppBase from './app-base.js';

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
      const inst = new Cls(container, app.config || {}, ctx);
      const ret = inst.init();
      return Promise.resolve(ret).then(() => inst);
    };
  },

  /** External page embedded in an iframe. */
  async iframe(app /*, ctx */) {
    return (container) => {
      const frame = document.createElement('iframe');
      frame.className = 'app-host';
      frame.src = app.url;
      frame.setAttribute('sandbox', app.sandbox || 'allow-scripts allow-same-origin allow-forms allow-popups');
      frame.setAttribute('referrerpolicy', 'no-referrer');
      frame.allow = app.allow || '';
      container.appendChild(frame);
      return Promise.resolve({
        pause()   { try { frame.contentWindow?.postMessage({ type: 'stealth:pause' }, '*'); } catch {} },
        resume()  { try { frame.contentWindow?.postMessage({ type: 'stealth:resume' }, '*'); } catch {} },
        destroy() { frame.remove(); }
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
      frame.style.height = '480px';
      frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
      // Build a self-contained boot document so we don't need any extra files on disk.
      const html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body,#game{margin:0;height:100%;background:#000;color:#fff;font-family:Segoe UI,Arial}</style></head>
<body><div id="game"></div>
<script>
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
      return Promise.resolve({
        pause()   { try { frame.contentWindow?.EJS_emulator?.pause?.(); } catch {} },
        resume()  { try { frame.contentWindow?.EJS_emulator?.play?.();  } catch {} },
        destroy() { frame.remove(); }
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

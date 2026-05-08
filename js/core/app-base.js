/**
 * Base class for embedded "stealth" apps. Apps extend this and export the
 * subclass as the default export of their module.
 *
 *  export default class MyApp extends StealthAppBase {
 *    async init() { ... mount UI inside this.container ... }
 *    pause()   { super.pause();   // freeze loops, mute audio
 *    resume()  { super.resume(); }
 *    destroy() { super.destroy(); // tear down listeners
 *  }
 *
 * Apps should never reach outside `this.container` and must clean up in
 * destroy() — the host calls destroy() whenever the user opens another email.
 */
export default class StealthAppBase {
  constructor(container, config = {}, ctx = {}) {
    this.container = container;
    this.config = config || {};
    this.ctx = ctx; // { settings, app, host }
    this.paused = false;
    this.destroyed = false;
  }
  async init() { /* override */ }
  pause()    { this.paused = true; }
  resume()   { this.paused = false; }
  destroy()  { this.destroyed = true; this.container.innerHTML = ''; }
}

// Also expose globally so apps loaded as classic scripts could use it.
if (typeof window !== 'undefined') window.StealthAppBase = StealthAppBase;

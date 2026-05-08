/**
 * Global mute control. Wraps AudioContext and HTMLAudioElement creation so
 * that any audio produced by embedded apps obeys the platform-wide mute.
 */
export function initMute(state) {
  let muted = !!state.settings.globalMute;

  // Patch HTMLAudioElement defaults.
  const origPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    if (muted) this.muted = true;
    return origPlay.apply(this, arguments);
  };

  // Patch AudioContext gain — wrap createGain to allow runtime mute.
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (Ctx) {
    const orig = Ctx.prototype.createGain;
    Ctx.prototype.createGain = function () {
      const node = orig.call(this);
      const _connect = node.connect.bind(node);
      node.connect = function (...args) { if (muted) try { node.gain.value = 0; } catch {} return _connect(...args); };
      return node;
    };
  }

  function set(v) {
    muted = !!v;
    document.querySelectorAll('audio,video').forEach(a => { a.muted = muted; });
  }

  const toggleKey = (state.settings.muteToggleKey || 'm').toLowerCase();
  document.addEventListener('keydown', (e) => {
    if (e.altKey && e.key.toLowerCase() === toggleKey) set(!muted);
  });

  return { isMuted: () => muted, set };
}

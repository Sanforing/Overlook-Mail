import { applyThemeVars } from './utils.js';

/**
 * Apply user-level personalisation on top of the JSON defaults: brand text,
 * tab title, search placeholder, and theme colour overrides. Called on
 * startup (after currentUser) and whenever the user changes settings.
 */
export function applyUserPrefs(state, prefs) {
  state.userPrefs = prefs || {};
  const merged = mergeWithDefaults(state.settingsDefaults || state.settings, state.userPrefs);

  // Mutate live settings so any code that re-reads them sees the user choices.
  state.settings.topbar.brand = merged.brand;
  state.settings.topbar.searchPlaceholder = merged.searchPlaceholder;
  state.settings.appName = merged.brand;
  state.settings.user.displayName = merged.recipientName;
  state.settings.display = merged.display;
  state.settings.novelMail = merged.novelMail;
  document.title = merged.brand;
  applyThemeVars(merged.theme);
  applyDisplayPrefs(merged.display);

  const brandEl = document.querySelector('#topbar .brand');
  if (brandEl) brandEl.textContent = merged.brand;
  const searchEl = document.querySelector('#topbar .search');
  if (searchEl) searchEl.placeholder = merged.searchPlaceholder;
}

export function defaultPrefsFromSettings(settings) {
  return {
    brand: settings.topbar?.brand || settings.appName || 'Outlook',
    searchPlaceholder: settings.topbar?.searchPlaceholder || 'Search',
    recipientName: settings.user?.displayName || 'Alex Chen',
    theme: Object.assign({}, settings.theme || {}),
    display: Object.assign({ uiScale: 100, mailFontSize: 14 }, settings.display || {}),
    novelMail: Object.assign({ linesPerPage: 20 }, settings.novelMail || {})
  };
}

function mergeWithDefaults(settings, prefs) {
  const def = defaultPrefsFromSettings(settings);
  return {
    brand: prefs?.brand || def.brand,
    searchPlaceholder: prefs?.searchPlaceholder || def.searchPlaceholder,
    recipientName: prefs?.recipientName || def.recipientName,
    theme: Object.assign({}, def.theme, prefs?.theme || {}),
    display: Object.assign({}, def.display, prefs?.display || {}),
    novelMail: Object.assign({}, def.novelMail, prefs?.novelMail || {})
  };
}

function applyDisplayPrefs(display) {
  const root = document.documentElement.style;
  const uiScale = clampNumber(display?.uiScale, 80, 130, 100) / 100;
  const mailFontSize = clampNumber(display?.mailFontSize, 12, 22, 14);
  root.setProperty('--ui-scale', String(uiScale));
  root.setProperty('--mail-font-size', `${mailFontSize}px`);
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

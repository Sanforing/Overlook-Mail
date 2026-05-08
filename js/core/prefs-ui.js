import { applyThemeVars } from './utils.js';

/**
 * Apply user-level personalisation on top of the JSON defaults: brand text,
 * tab title, search placeholder, and theme colour overrides. Called on
 * startup (after currentUser) and whenever the user changes settings.
 */
export function applyUserPrefs(state, prefs) {
  state.userPrefs = prefs || {};
  const merged = mergeWithDefaults(state.settings, state.userPrefs);

  // Mutate live settings so any code that re-reads them sees the user choices.
  state.settings.topbar.brand = merged.brand;
  state.settings.topbar.searchPlaceholder = merged.searchPlaceholder;
  state.settings.appName = merged.brand;
  document.title = merged.brand;
  applyThemeVars(merged.theme);

  const brandEl = document.querySelector('#topbar .brand');
  if (brandEl) brandEl.textContent = merged.brand;
  const searchEl = document.querySelector('#topbar .search');
  if (searchEl) searchEl.placeholder = merged.searchPlaceholder;
}

export function defaultPrefsFromSettings(settings) {
  return {
    brand: settings.topbar?.brand || settings.appName || 'Outlook',
    searchPlaceholder: settings.topbar?.searchPlaceholder || 'Search',
    theme: Object.assign({}, settings.theme || {})
  };
}

function mergeWithDefaults(settings, prefs) {
  const def = defaultPrefsFromSettings(settings);
  return {
    brand: prefs?.brand || def.brand,
    searchPlaceholder: prefs?.searchPlaceholder || def.searchPlaceholder,
    theme: Object.assign({}, def.theme, prefs?.theme || {})
  };
}

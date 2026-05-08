import { openModal, field, input, btn, notice } from './modal.js';
import { el } from './utils.js';
import { applyUserPrefs, defaultPrefsFromSettings } from './prefs-ui.js';

/**
 * Settings modal: lets the signed-in user customise the brand text and the
 * theme colours. Persists via `backend.putPrefs(...)` if available; falls
 * back to a session-only override otherwise.
 */
export function showSettings(state) {
  const backend = state.backend;
  const supportsPrefs = typeof backend.getPrefs === 'function' && typeof backend.putPrefs === 'function';

  const status = el('div', { class: 'auth-status' });
  const body = el('div');
  const initial = state.userPrefs || defaultPrefsFromSettings(state.settings);

  const brandIn  = input({ type: 'text', value: initial.brand || state.settings.topbar.brand, maxlength: '64' });
  const searchIn = input({ type: 'text', value: initial.searchPlaceholder || state.settings.topbar.searchPlaceholder, maxlength: '64' });

  const themeKeys = ['primary','primaryDark','background','panel','border','textPrimary','textSecondary','unread','hover','selected'];
  const colorIns = {};
  const themeGrid = el('div', { class: 'theme-grid' });
  for (const k of themeKeys) {
    const cur = (initial.theme && initial.theme[k]) || state.settings.theme[k] || '#000000';
    const ci = el('input', { type: 'color', class: 'control color-control', value: hex6(cur) });
    colorIns[k] = ci;
    themeGrid.appendChild(el('label', { class: 'field' }, [
      el('span', { text: k }),
      ci
    ]));
  }

  body.append(
    el('div', { class: 'settings-section', text: 'Brand' }),
    field('Tab + topbar text', brandIn),
    field('Search placeholder', searchIn),
    el('div', { class: 'settings-section', text: 'Theme colours' }),
    themeGrid,
    status
  );

  const save = btn('Save', { primary: true });
  const reset = btn('Reset to defaults');
  const actions = el('div', { class: 'modal-actions' }, [reset, save]);
  body.appendChild(actions);

  reset.addEventListener('click', async () => {
    if (supportsPrefs) {
      try { await backend.putPrefs({}); } catch {}
    }
    state.userPrefs = {};
    applyUserPrefs(state, {});
    m.close();
  });

  save.addEventListener('click', async () => {
    const prefs = {
      brand: brandIn.value.trim(),
      searchPlaceholder: searchIn.value.trim(),
      theme: Object.fromEntries(themeKeys.map(k => [k, colorIns[k].value]))
    };
    save.disabled = true; status.textContent = '';
    try {
      if (supportsPrefs && state.user) {
        await backend.putPrefs(prefs);
      }
      state.userPrefs = prefs;
      applyUserPrefs(state, prefs);
      m.close();
    } catch (err) {
      status.appendChild(notice(err.message, 'error'));
    } finally {
      save.disabled = false;
    }
  });

  const m = openModal({ title: 'Personalise', body, width: 460 });
}

function hex6(v) {
  // <input type="color"> only accepts #rrggbb. Strip alpha if present.
  if (typeof v !== 'string') return '#000000';
  if (/^#([0-9a-f]{6})$/i.test(v)) return v.toLowerCase();
  if (/^#([0-9a-f]{3})$/i.test(v)) {
    const m = v.slice(1);
    return ('#' + m[0] + m[0] + m[1] + m[1] + m[2] + m[2]).toLowerCase();
  }
  if (/^#([0-9a-f]{8})$/i.test(v)) return v.slice(0, 7).toLowerCase();
  return '#000000';
}

import { openModal, field, input, select, btn, notice } from './modal.js';
import { el } from './utils.js';
import { applyUserPrefs, defaultPrefsFromSettings, saveLocalPrefs } from './prefs-ui.js';
import { t, getLang } from './i18n.js';
import { rerenderShell } from './ui.js';

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
  const defaults = defaultPrefsFromSettings(state.settingsDefaults || state.settings);
  const initial = Object.assign({}, defaults, state.userPrefs || {}, {
    theme: Object.assign({}, defaults.theme, state.userPrefs?.theme || {}),
    display: Object.assign({}, defaults.display, state.userPrefs?.display || {}),
    novelMail: Object.assign({}, defaults.novelMail, state.userPrefs?.novelMail || {})
  });

  const brandIn  = input({ type: 'text', value: initial.brand || state.settings.topbar.brand, maxlength: '64' });
  const searchIn = input({ type: 'text', value: initial.searchPlaceholder || state.settings.topbar.searchPlaceholder, maxlength: '64' });
  const recipientIn = input({ type: 'text', value: initial.recipientName || state.settings.user.displayName, maxlength: '64' });
  const novelLinesIn = input({ type: 'number', value: initial.novelMail?.linesPerPage || 20, min: '5', max: '60', step: '1' });
  const mailFontIn = input({ type: 'number', value: initial.display?.mailFontSize || 14, min: '12', max: '22', step: '1' });
  const uiScaleIn = input({ type: 'number', value: initial.display?.uiScale || 100, min: '80', max: '130', step: '5' });
  const uiLangIn = select([
    { value: 'en',  label: t('langEn'),  selected: (initial.uiLang || getLang()) === 'en' },
    { value: 'cht', label: t('langCht'), selected: (initial.uiLang || getLang()) === 'cht' },
    { value: 'ja',  label: t('langJa'),  selected: (initial.uiLang || getLang()) === 'ja' }
  ]);

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

  // ── Custom Mailboxes are managed via the sidebar "Add mailbox" button ──

  body.append(
    el('div', { class: 'settings-section', text: t('sectionLanguage') }),
    field(t('fieldUiLang'), uiLangIn),
    el('div', { class: 'settings-section', text: t('sectionBrand') }),
    field(t('fieldTabTopbar'), brandIn),
    field(t('fieldSearchPH'), searchIn),
    el('div', { class: 'settings-section', text: t('sectionMailId') }),
    field(t('fieldRecipient'), recipientIn),
    el('div', { class: 'settings-section', text: t('sectionReading') }),
    field(t('fieldNovelLines'), novelLinesIn),
    el('div', { class: 'row settings-row' }, [
      field(t('fieldMailFont'), mailFontIn),
      field(t('fieldUiScale'), uiScaleIn)
    ]),
    el('div', { class: 'settings-section', text: t('sectionTheme') }),
    themeGrid,
    status
  );

  const save = btn(t('save'), { primary: true });
  const reset = btn(t('resetDefaults'));
  const actions = el('div', { class: 'modal-actions' }, [reset, save]);
  body.appendChild(actions);

  reset.addEventListener('click', async () => {
    saveLocalPrefs({});
    if (supportsPrefs && state.user) {
      try { await backend.putPrefs({}); } catch {}
    }
    state.userPrefs = {};
    applyUserPrefs(state, {});
    m.close();
    rerenderShell(state);
  });

  save.addEventListener('click', async () => {
    const prefs = {
      brand: brandIn.value.trim(),
      searchPlaceholder: searchIn.value.trim(),
      recipientName: recipientIn.value.trim(),
      uiLang: uiLangIn.value,
      customFolders: Array.isArray(state.userPrefs?.customFolders) ? state.userPrefs.customFolders.slice() : [],
      display: {
        mailFontSize: clampNumber(mailFontIn.value, 12, 22, 14),
        uiScale: clampNumber(uiScaleIn.value, 80, 130, 100)
      },
      novelMail: {
        linesPerPage: clampNumber(novelLinesIn.value, 5, 60, 20)
      },
      theme: Object.fromEntries(themeKeys.map(k => [k, colorIns[k].value]))
    };
    save.disabled = true; status.textContent = '';
    try {
      // Always persist to localStorage (covers guests and free users).
      saveLocalPrefs(prefs);
      // Signed-in users: also save to backend (IndexedDB or remote server).
      if (state.user && supportsPrefs) {
        await backend.putPrefs(prefs);
      }
      state.userPrefs = prefs;
      applyUserPrefs(state, prefs);
      m.close();
      rerenderShell(state);
    } catch (err) {
      status.appendChild(notice(err.message, 'error'));
    } finally {
      save.disabled = false;
    }
  });

  const m = openModal({ title: t('personaliseTitle'), body, width: 460 });
}

/**
 * Small modal to add (or delete) custom mailboxes.
 * Opens from the "Add mailbox" button at the bottom of the sidebar folder list.
 */
/* ===================== Icon picker ===================== */
const PICKER_ICONS = {
  folder:   `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>`,
  inbox:    `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 14H5v-2h14v2zm0-4H5V5h14v8z"/></svg>`,
  sent:     `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>`,
  mail:     `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>`,
  archive:  `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.54 5.23l-1.39-1.68C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.16.55L3.46 5.23C3.17 5.57 3 6.02 3 6.5V19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6.5c0-.48-.17-.93-.46-1.27zM12 17.5L6.5 12H10v-2h4v2h3.5L12 17.5zM5.12 5l.81-1h12l .94 1H5.12z"/></svg>`,
  junk:     `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>`,
  star:     `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>`,
  label:    `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.63 5.84C17.27 5.33 16.67 5 16 5L5 5.01C3.9 5.01 3 5.9 3 7v10c0 1.1.9 1.99 2 1.99L16 19c.67 0 1.27-.33 1.63-.84L22 12l-4.37-6.16z"/></svg>`,
  person:   `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`,
  group:    `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>`,
  bell:     `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>`,
  lock:     `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>`,
  work:     `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-6 0h-4V4h4v2z"/></svg>`,
  shield:   `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 4l6 2.67V11c0 3.86-2.63 7.47-6 8.8-3.37-1.33-6-4.94-6-8.8V7.67L12 5z"/></svg>`,
  calendar: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 3h-1V1h-2v2H7V1H5v2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 18H4V8h16v13z"/></svg>`,
  list:     `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/></svg>`,
};

function makeIconPicker(initialKey = 'folder') {
  let selectedKey = initialKey;
  let drop = null;
  let closeHandler = null;

  const wrap = el('div', { class: 'icon-picker-wrap' });
  const btn_ = el('button', { class: 'icon-picker-btn', type: 'button' });

  function refreshBtn() {
    btn_.innerHTML = '';
    btn_.appendChild(el('span', { class: 'icon', html: PICKER_ICONS[selectedKey] || PICKER_ICONS.folder }));
    btn_.appendChild(el('span', { text: '▾', style: 'font-size:11px;opacity:.6' }));
  }

  function closeDrop() {
    if (drop) { drop.remove(); drop = null; }
    if (closeHandler) { document.removeEventListener('click', closeHandler); closeHandler = null; }
  }

  btn_.addEventListener('click', (e) => {
    e.stopPropagation();
    if (drop) { closeDrop(); return; }

    drop = el('div', { class: 'icon-picker-drop open' });
    for (const key of Object.keys(PICKER_ICONS)) {
      const opt = el('button', { class: `icon-option${key === selectedKey ? ' selected' : ''}`, type: 'button', html: PICKER_ICONS[key], title: key });
      opt.addEventListener('click', (ev) => {
        ev.stopPropagation();
        selectedKey = key;
        refreshBtn();
        closeDrop();
      });
      drop.appendChild(opt);
    }

    document.body.appendChild(drop);
    const rect = btn_.getBoundingClientRect();
    drop.style.position = 'fixed';
    drop.style.top = (rect.bottom + 4) + 'px';
    drop.style.left = rect.left + 'px';

    closeHandler = (ev) => {
      if (!btn_.contains(ev.target) && !drop?.contains(ev.target)) closeDrop();
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 0);
  });

  refreshBtn();
  wrap.append(btn_);
  return {
    wrap,
    getKey: () => selectedKey,
    reset: () => { selectedKey = 'folder'; refreshBtn(); closeDrop(); }
  };
}

export function showMailboxManager(state, { onChanged } = {}) {
  const backend = state.backend;
  const supportsPrefs = typeof backend.getPrefs === 'function' && typeof backend.putPrefs === 'function';

  // Work on a fresh copy; we commit only on explicit save.
  let customFolders = (Array.isArray(state.userPrefs?.customFolders) ? state.userPrefs.customFolders : []).map(f => Object.assign({}, f));

  const body = el('div');
  const mbStatus = el('div', { class: 'auth-status' });
  const mailboxList = el('div', { class: 'mailbox-list' });

  function renderMailboxList() {
    mailboxList.innerHTML = '';
    if (!customFolders.length) {
      mailboxList.appendChild(el('div', { class: 'auth-status', text: t('noCustomMailboxes') }));
      return;
    }
    for (const f of customFolders) {
      const delBtn = el('button', { class: 'icon-btn', title: t('deleteMailbox'), text: '✕' });
      delBtn.addEventListener('click', () => {
        customFolders = customFolders.filter(x => x.id !== f.id);
        renderMailboxList();
      });
      mailboxList.appendChild(el('div', { class: 'mailbox-row' }, [
        el('span', { class: 'icon', html: PICKER_ICONS[f.iconKey] || PICKER_ICONS.folder }),
        el('span', { text: f.name, style: 'flex:1' }),
        delBtn
      ]));
    }
  }
  renderMailboxList();

  const mbNameIn = input({ type: 'text', placeholder: t('mailboxNamePH'), maxlength: '64', style: 'flex:1' });
  const picker = makeIconPicker('folder');
  const mbAddBtn = btn(t('addMailbox'));

  mbAddBtn.addEventListener('click', () => {
    mbStatus.textContent = '';
    const name = mbNameIn.value.trim();
    const iconKey = picker.getKey();
    if (!name) { mbStatus.appendChild(notice(t('errMailboxNameReq'), 'error')); return; }
    if (customFolders.some(f => f.name.toLowerCase() === name.toLowerCase())) {
      mbStatus.appendChild(notice(t('errMailboxNameTaken'), 'error')); return;
    }
    const a = new Uint8Array(4); crypto.getRandomValues(a);
    const id = 'cf_' + Array.from(a).map(b => b.toString(16).padStart(2, '0')).join('');
    customFolders = [...customFolders, { id, name, iconKey }];
    mbNameIn.value = ''; picker.reset();
    renderMailboxList();
  });

  const saveBtn = btn(t('save'), { primary: true });
  const cancelBtn = btn(t('cancel'));

  body.append(
    mailboxList,
    el('div', { class: 'mailbox-add-row' }, [
      el('label', { class: 'field-label-small', text: t('mailboxNameLabel') }),
      mbNameIn,
      picker.wrap,
      mbAddBtn
    ]),
    mbStatus,
    el('div', { class: 'modal-actions' }, [cancelBtn, saveBtn])
  );

  cancelBtn.addEventListener('click', () => m.close());

  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true; mbStatus.textContent = '';
    try {
      const prefs = Object.assign({}, state.userPrefs || {}, { customFolders: customFolders.slice() });
      saveLocalPrefs(prefs);
      if (state.user && supportsPrefs) {
        await backend.putPrefs(prefs);
      }
      state.userPrefs = prefs;
      // Rebuild state.folders: builtins + new custom list.
      const builtins = (state.builtinFolders || []).filter(f => !f.custom);
      state.folders = [...builtins, ...customFolders.map(f => Object.assign({}, f, { custom: true }))];
      m.close();
      if (typeof onChanged === 'function') onChanged();
    } catch (err) {
      mbStatus.appendChild(notice(err.message, 'error'));
    } finally {
      saveBtn.disabled = false;
    }
  });

  const m = openModal({ title: t('sectionMailboxes'), body, width: 360 });
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

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

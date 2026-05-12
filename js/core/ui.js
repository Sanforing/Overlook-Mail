import { el, clear, loadText } from './utils.js';
import { buildEmailView, restoreFrameSize } from './email-wrapper.js';
import { createAppRunner } from './app-loader.js';
import { withFakeLoading } from './fake-loading.js';
import { showAuth } from './auth-ui.js';
import { showCompose } from './composer.js';
import { showSettings, showMailboxManager } from './settings-ui.js';
import { applyUserPrefs } from './prefs-ui.js';
import { openModal, field } from './modal.js';
import { runTutorial, runOnceTutorial, runNovelTutorial } from './tutorial.js';import { t, getLang } from './i18n.js';
import { adsActive, placementOn, buildSponsoredInboxRow, buildTopbarTile, buildReaderStickyStrip } from './ads.js';

/* ===================== Mail Labels ===================== */
const LABELS = [
  { id: 'important', color: '#c4314b', en: 'Important',  cht: '重要'   },
  { id: 'flagged',   color: '#d74b01', en: 'Flagged',    cht: '已標記' },
  { id: 'followup',  color: '#0078d4', en: 'Follow Up',  cht: '待跟進' },
  { id: 'personal',  color: '#107c10', en: 'Personal',   cht: '個人'   },
  { id: 'work',      color: '#8764b8', en: 'Work',       cht: '工作'   },
  { id: 'later',     color: '#605e5c', en: 'Later',      cht: '稍後'   },
];
function labelName(lbl) { return getLang() === 'cht' ? lbl.cht : lbl.en; }

/**
 * Builds the entire UI from state. Everything that appears on screen is
 * driven by JSON config — no string is hard-coded into the layout.
 *
 * state shape: { settings, folders, categories, templates, adminApps,
 *                backend, user, currentFolder, currentCategory, search }
 */
export async function initUI(state) {
  state.currentCategory = state.categories[0]?.id || 'admin';
  state.currentFolder = null;
  state.search = '';

  renderTopbar(state);
  renderSidebar(state);
  setupSplits(state);
  await refreshList(state, { autoOpenFirst: true });

  document.getElementById('app').setAttribute('aria-busy', 'false');
}

/**
 * Re-render only the topbar and sidebar (language-sensitive chrome).
 * Called after the user changes UI language in Personalise.
 */
export function rerenderShell(state) {
  renderTopbar(state);
  renderSidebar(state);
}

/* ===================== Topbar ===================== */

function renderTopbar(state) {
  const bar = document.getElementById('topbar');
  clear(bar);

  const search = el('input', { class: 'search', type: 'search', placeholder: state.settings.topbar.searchPlaceholder, value: state.search });
  search.addEventListener('input', () => { state.search = search.value.trim(); refreshList(state); });

  bar.append(
    el('button', { class: 'waffle', title: t('appLauncher'), html: '&#9776;' }),
    el('div',    { class: 'brand', text: state.settings.topbar.brand }),
    search,
    el('div',    { class: 'spacer' }),
    ...(adsActive(state.settings, state.user) && placementOn(state.settings, 'topbarTile')
        ? [buildTopbarTile(state.settings)].filter(Boolean) : []),
    el('button', { class: 'gear', title: t('settingsBtn'), html: '&#9881;', onclick: () => showSettings(state) }),
    avatarButton(state)
  );
}

function avatarButton(state) {
  const u = state.user;
  const av = el('button', {
    class: 'avatar',
    text: u ? u.initials : '?',
    title: u ? `${u.displayName} <${u.email}> · ${u.tier}` : 'Sign in'
  });
  if (!u) av.style.background = '#fff8';
  av.addEventListener('click', () => openAvatarMenu(state, av));
  return av;
}

function openAvatarMenu(state, anchor) {
  document.querySelectorAll('.menu').forEach(n => n.remove());
  const menu = el('div', { class: 'menu' });
  const rect = anchor.getBoundingClientRect();
  Object.assign(menu.style, { top: `${rect.bottom + 4}px`, right: `${window.innerWidth - rect.right}px` });

  if (state.user) {
    menu.append(
      el('div', { class: 'menu-head' }, [
        el('div', { class: 'avatar-lg', text: state.user.initials }),
        el('div', null, [
          el('div', { class: 'menu-name', text: state.user.displayName }),
          el('div', { class: 'menu-sub', text: `${state.user.email} · ${state.user.tier}` })
        ])
      ]),
      el('hr')
    );
    const isLocalDev = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
    if (state.user.tier !== 'paid' && isLocalDev) {
      menu.appendChild(el('button', { class: 'menu-item', text: t('upgradePaid'), onclick: async () => {
        state.user = await state.backend.upgradeCurrent('paid'); menu.remove(); renderTopbar(state);
      } }));
    }
    menu.appendChild(el('button', { class: 'menu-item', text: t('personalise'), onclick: () => { menu.remove(); showSettings(state); } }));
    menu.appendChild(el('button', { class: 'menu-item', text: t('signOut'), onclick: async () => {
      await state.backend.logout(); state.user = null; state.userPrefs = {};
      applyUserPrefs(state, {}); menu.remove(); renderTopbar(state); refreshList(state, { autoOpenFirst: true });
    } }));
  } else {
    menu.appendChild(el('button', { class: 'menu-item', text: t('signInCreate'), onclick: () => {
      menu.remove();
      showAuth(state, { onSignedIn: async (u) => {
        state.user = u;
        if (typeof state.backend.getPrefs === 'function') {
          try { applyUserPrefs(state, await state.backend.getPrefs()); } catch {}
        }
        renderTopbar(state); await refreshList(state, { autoOpenFirst: true });
        await maybeRunTutorial(state, u);
      } });
    } }));
  }

  document.body.appendChild(menu);
  setTimeout(() => document.addEventListener('click', function once(e) {
    if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', once); }
  }), 0);
}

/* ===================== Sidebar SVG Icons ===================== */
const SVG = {
  compose:   `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>`,
  inbox:     `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 14H5v-2h14v2zm0-4H5V5h14v8z"/></svg>`,
  mine:      `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>`,
  drafts:    `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"/></svg>`,
  junk:      `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>`,
  archive:   `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.54 5.23l-1.39-1.68C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.16.55L3.46 5.23C3.17 5.57 3 6.02 3 6.5V19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6.5c0-.48-.17-.93-.46-1.27zM12 17.5L6.5 12H10v-2h4v2h3.5L12 17.5zM5.12 5l.81-1h12l.94 1H5.12z"/></svg>`,
  all:       `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/></svg>`,
  admin:     `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 4l6 2.67V11c0 3.86-2.63 7.47-6 8.8-3.37-1.33-6-4.94-6-8.8V7.67L12 5z"/></svg>`,
  community: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>`,
  person:    `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`,
  // extra keys used by the custom-folder icon picker
  folder:    `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>`,
  sent:      `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>`,
  mail:      `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>`,
  star:      `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>`,
  label:     `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.63 5.84C17.27 5.33 16.67 5 16 5L5 5.01C3.9 5.01 3 5.9 3 7v10c0 1.1.9 1.99 2 1.99L16 19c.67 0 1.27-.33 1.63-.84L22 12l-4.37-6.16z"/></svg>`,
  group:     `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>`,
  bell:      `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>`,
  lock:      `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>`,
  work:      `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-6 0h-4V4h4v2z"/></svg>`,
  shield:    `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 4l6 2.67V11c0 3.86-2.63 7.47-6 8.8-3.37-1.33-6-4.94-6-8.8V7.67L12 5z"/></svg>`,
  calendar:  `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 3h-1V1h-2v2H7V1H5v2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 18H4V8h16v13z"/></svg>`,
  list:      `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/></svg>`,
  default:   `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>`,
};
const CAT_ICON  = { admin: 'admin', community: 'community', mine: 'person' };
const FOLD_ICON = { inbox: 'inbox', mine: 'mine', drafts: 'drafts', junk: 'junk', archive: 'archive' };
function svgIcon(key) { return SVG[key] || SVG.default; }

/* ===================== Sidebar ===================== */

function renderSidebar(state) {
  const side = document.getElementById('sidebar');
  clear(side);

  side.appendChild(el('button', { class: 'new-mail', onclick: () => onNewMail(state) }, [
    el('span', { class: 'icon', html: SVG.compose }), el('span', { text: t('newMail') })
  ]));

  side.appendChild(el('div', { class: 'side-section', text: t('categories') }));
  for (const c of state.categories) {
    side.appendChild(el('div', {
      class: `folder ${state.currentCategory === c.id ? 'active' : ''}`,
      onclick: () => { state.currentCategory = c.id; state.currentFolder = null; renderSidebar(state); refreshList(state, { autoOpenFirst: true }); }
    }, [
      el('span', { class: 'icon', html: svgIcon(CAT_ICON[c.id]) }),
      el('span', { text: t('cat_' + c.id) || c.name })
    ]));
  }

  side.appendChild(el('div', { class: 'side-section', text: t('folders') }));
  side.appendChild(el('div', {
    class: `folder ${state.currentFolder === '__all__' ? 'active' : ''}`,
    title: t('allFolderHint'),
    onclick: () => { state.currentFolder = '__all__'; renderSidebar(state); refreshList(state, { autoOpenFirst: true }); }
  }, [el('span', { class: 'icon', html: SVG.all }), el('span', { text: t('allFolders') })]));

  for (const f of state.folders) {
    side.appendChild(el('div', {
      class: `folder ${state.currentFolder === f.id ? 'active' : ''}`,
      onclick: () => { state.currentFolder = f.id; renderSidebar(state); refreshList(state, { autoOpenFirst: true }); }
    }, [
      el('span', { class: 'icon', html: svgIcon(f.iconKey || FOLD_ICON[f.id]) }),
      el('span', { text: f.custom ? f.name : (t('folder_' + f.id) || f.name) })
    ]));
  }

  // Add mailbox button
  side.appendChild(el('button', {
    class: 'add-mailbox-btn',
    onclick: () => showMailboxManager(state, { onChanged: () => { renderSidebar(state); refreshList(state); } })
  }, [
    el('span', { text: '+' }),
    el('span', { text: t('addMailbox') })
  ]));
}

function onNewMail(state) {
  const open = () => showCompose(state, { onCreated: () => refreshList(state, { autoOpenFirst: true }) });
  if (!state.user) {
    showAuth(state, { onSignedIn: async (u) => {
      state.user = u; renderTopbar(state);
      await maybeRunTutorial(state, u);
      open();
    } });
  } else open();
}

/** If the user just registered (or has never seen the tutorial), run it once
 *  and persist a flag in user prefs so it does not reappear. */
async function maybeRunTutorial(state, user) {
  try {
    const prefs = (typeof state.backend.getPrefs === 'function')
      ? (await state.backend.getPrefs()) || {}
      : {};
    if (prefs.tutorialShown && !user.__justRegistered) return;
    await runTutorial();
    prefs.tutorialShown = true;
    if (typeof state.backend.putPrefs === 'function') {
      try { await state.backend.putPrefs(prefs); } catch {}
    }
    state.userPrefs = Object.assign({}, state.userPrefs, prefs);
  } catch {}
}

/* ===================== Splits ===================== */

function setupSplits(state) {
  const sizes = state.settings.splitSizes;
  // eslint-disable-next-line no-undef
  Split(['#sidebar', '#list', '#reader'], {
    sizes: [sizes.sidebar, sizes.list, sizes.reader],
    minSize: sizes.minSize,
    gutterSize: 6,
    snapOffset: 0
  });
}

/* ===================== List + reader ===================== */

async function loadAllMails(state) {
  const fromDB = await state.backend.list({});
  const adminAsMails = (state.adminApps || []).map(a => Object.assign({
    ownerId: 'admin', ownerName: 'Overlook Mail Admin', visibility: 'public', monochrome: 'none', createdAt: 0
  }, a));
  const all = [...adminAsMails, ...fromDB];

  // Resolve "shortcut" mails (forward without copy). A shortcut record has
  // a `ref` field pointing at the original mail's id and only carries the
  // user-specific fields (ownerId, folder, visibility, labels, date,
  // forwarded-from metadata). We merge in the original's content fields so
  // it renders identically without storing a duplicate copy of the body /
  // attachment / config payload.
  const byId = new Map(all.map(m => [m.id, m]));
  const resolved = [];
  for (const m of all) {
    if (!m || !m.ref) { resolved.push(m); continue; }
    const orig = byId.get(m.ref);
    if (!orig) continue; // original was deleted — drop dangling shortcut
    // Shortcut's own user-scoped fields take precedence; everything else
    // (subject, sender, template, entry, url, rom, type, preview, config…)
    // is inherited from the original.
    resolved.push(Object.assign({}, orig, m, {
      // Preserve a back-pointer so ack/comments key off the original mail
      // (so all viewers of a shared/forwarded mail see the same thread).
      refId: orig.id,
      // Merge configs so forwardedFrom metadata isn't lost.
      config: Object.assign({}, orig.config || {}, m.config || {})
    }));
  }
  return resolved;
}

async function refreshList(state, { autoOpenFirst = false } = {}) {
  const all = await loadAllMails(state);
  const me = state.user;
  const cat = state.currentCategory;
  const isAllFolderView = state.currentFolder === '__all__';
  const ownFolderIds = new Set((state.folders || []).map(f => f.id));
  const list = all.filter(m => {
    // "All" folder view: ignore category, show only mails the current user owns
    // (composed by them OR forwarded/saved into one of their folders).
    if (isAllFolderView) {
      if (!me || m.ownerId !== me.id) return false;
      if (m.folder && !ownFolderIds.has(m.folder)) return false;
      if (state.search) {
        const hay = `${m.subject} ${m.preview} ${m.sender?.name || ''}`.toLowerCase();
        if (!hay.includes(state.search.toLowerCase())) return false;
      }
      return true;
    }
    if (cat === 'admin'     && m.ownerId !== 'admin') return false;
    // Community shows every public, non-admin mail — including ones the
    // current user authored (so a freshly composed Public draft is
    // discoverable from "From Community" too, not only from "Mine").
    if (cat === 'community' && (m.ownerId === 'admin' || m.visibility !== 'public')) return false;
    if (cat === 'mine'      && (!me || m.ownerId !== me.id)) return false;
    if (m.visibility === 'private' && m.ownerId !== 'admin' && (!me || m.ownerId !== me.id)) return false;
    if (state.currentFolder && m.folder !== state.currentFolder) return false;
    if (state.search) {
      const hay = `${m.subject} ${m.preview} ${m.sender?.name || ''}`.toLowerCase();
      if (!hay.includes(state.search.toLowerCase())) return false;
    }
    return true;
  });
  state.visibleMails = list;
  renderList(state);
  if (autoOpenFirst) {
    if (list.length) openMail(state, list[0]);
    else renderEmpty();
  }
}

function categoryName(state) {
  return (state.categories.find(c => c.id === state.currentCategory)?.name) || '';
}

function renderList(state) {
  const root = document.getElementById('list');
  clear(root);
  const folder = state.folders.find(f => f.id === state.currentFolder);
  const headerLabel = folder ? `${categoryName(state)} · ${folder.name}` : categoryName(state);

  root.append(el('div', { class: 'list-header' }, [
    el('h2', { text: headerLabel }),
    el('span', { class: 'filter', text: t('itemCount', state.visibleMails.length) })
  ]));

  const itemsEl = el('div', { class: 'items' });
  if (!state.visibleMails.length) {
    itemsEl.appendChild(el('div', { class: 'empty', text: t('noItems') }));
  }
  // (1) Sponsored inbox row — inject every N real mails for free/guest users.
  const adsOn = adsActive(state.settings, state.user) && placementOn(state.settings, 'sponsoredInbox');
  const everyN = Math.max(2, state.settings.ads?.placements?.sponsoredInbox?.everyN || 4);
  for (let i = 0; i < state.visibleMails.length; i++) {
    const m = state.visibleMails[i];
    const node = el('div', {
      class: `item${m.unread ? ' unread' : ''}`,
      'data-id': m.id
    }, [
      el('div', { class: 'sender' }, [
        document.createTextNode(m.sender?.name || m.ownerName || 'Unknown')
      ]),
      el('div', { class: 'date', text: m.date || '' }),
      el('div', { class: 'subject', text: m.subject || t('noSubject') }),
      el('div', { class: 'preview', text: m.preview || '' }),
      mailLabelsEl(m)
    ]);
    node.addEventListener('click', () => openMail(state, m));
    itemsEl.appendChild(node);
    if (adsOn && (i + 1) % everyN === 0) {
      const ad = buildSponsoredInboxRow(state.settings);
      if (ad) itemsEl.appendChild(ad);
    }
  }
  root.appendChild(itemsEl);
}

function makeLabelBtn(state, mail) {
  const btn = el('button', { text: t('labelBtn'), class: 'label-toolbar-btn' });
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.label-menu').forEach(n => n.remove());
    const menu = el('div', { class: 'label-menu' });
    const rect = btn.getBoundingClientRect();
    Object.assign(menu.style, { top: `${rect.bottom + 4}px`, left: `${rect.left}px` });

    const currentLabels = Array.isArray(mail.labels) ? [...mail.labels] : [];

    for (const lbl of LABELS) {
      const checked = currentLabels.includes(lbl.id);
      const row = el('button', { class: `label-menu-item${checked ? ' checked' : ''}` }, [
        el('span', { class: 'label-dot' }),
        el('span', { text: labelName(lbl) })
      ]);
      row.querySelector('.label-dot').style.background = lbl.color;
      row.addEventListener('click', async () => {
        const idx = mail.labels ? mail.labels.indexOf(lbl.id) : -1;
        if (idx >= 0) {
          mail.labels = mail.labels.filter(id => id !== lbl.id);
        } else {
          mail.labels = [...(mail.labels || []), lbl.id];
        }
        // Persist if owned mail
        if (state.user && mail.ownerId === state.user.id && typeof state.backend.update === 'function') {
          state.backend.update(mail.id, { labels: mail.labels }).catch(() => {});
        }
        renderList(state);
        menu.remove();
      });
      menu.appendChild(row);
    }

    document.body.appendChild(menu);
    setTimeout(() => document.addEventListener('click', function once(ev) {
      if (!menu.contains(ev.target) && ev.target !== btn) { menu.remove(); document.removeEventListener('click', once); }
    }), 0);
    e.stopPropagation();
  });
  return btn;
}

function mailLabelsEl(mail) {
  const ids = Array.isArray(mail.labels) ? mail.labels : [];
  if (!ids.length) return null;
  const chips = ids.map(id => {
    const def = LABELS.find(l => l.id === id);
    if (!def) return null;
    const chip = el('span', { class: 'mail-label', text: labelName(def) });
    chip.style.setProperty('--label-color', def.color);
    return chip;
  }).filter(Boolean);
  if (!chips.length) return null;
  const row = el('div', { class: 'mail-labels-row' });
  chips.forEach(c => row.appendChild(c));
  return row;
}

function renderEmpty() {
  const reader = document.getElementById('reader');
  clear(reader);
  reader.appendChild(el('div', { class: 'empty', text: t('selectItem') }));
}

let currentRunner = null;
let currentView = null;
let currentInlineNovel = null;

async function openMail(state, mail) {
  if (!mail) return;
  state.currentMail = mail.id;

  document.querySelectorAll('.list .item').forEach(n => {
    n.classList.toggle('active', n.dataset.id === mail.id);
  });
  if (mail.unread) { mail.unread = false; renderList(state); }

  await teardownCurrent();

  const reader = document.getElementById('reader');
  clear(reader);

  const tools = [];
  // Reply → opens public follow-ups thread (disguised)
  tools.push(el('button', {
    text: t('reply'),
    title: t('commentsHeading'),
    onclick: () => scrollToCommentsThread()
  }));
  tools.push(el('button', { text: t('replyAll'), title: t('commentsHeading'), onclick: () => scrollToCommentsThread() }));
  // Forward → save copy to one of user's folders
  tools.push(el('button', {
    text: t('forward'),
    onclick: () => openForwardDialog(state, mail)
  }));
  // Acknowledge button (only on mails the user does not own)
  if (state.user && mail.ownerId !== state.user.id) {
    tools.push(makeAckButton(state, mail));
  }
  tools.push(makeLabelBtn(state, mail));
  if (state.user && mail.ownerId === state.user.id) {
    tools.push(el('button', { text: t('deleteMail'), onclick: async () => {
      if (!confirm(t('confirmDelete'))) return;
      await state.backend.remove(mail.id);
      await refreshList(state, { autoOpenFirst: true });
    } }));
  }
  reader.appendChild(el('div', { class: 'reader-toolbar' }, tools));

  const scroll = el('div', { class: 'scroll' });
  reader.appendChild(scroll);

  // (4) Sticky strip pinned to the bottom of the reader pane (above-fold for
  // viewability since it never scrolls away). Free/guest users only.
  if (adsActive(state.settings, state.user) && placementOn(state.settings, 'readerSticky')) {
    const strip = buildReaderStickyStrip(state.settings);
    if (strip) reader.appendChild(strip);
  }

  const view = buildEmailView({ app: mail, settings: state.settings, settingsDefaults: state.settingsDefaults, templates: state.templates, user: state.user });
  scroll.appendChild(view.node);
  currentView = view;

  // Mount the public follow-ups (comments) thread under the email body.
  // Only shown for shared content: admin or public mails. Owners of private
  // mails see a hint that follow-ups are off.
  mountCommentsThread(state, mail, view, scroll);

  if (isInlineNovelMail(mail)) {
    currentInlineNovel = await mountInlineNovel(state, mail, view);
    scroll.scrollTop = 0;
    // First-time-only walkthrough for novel-style mails.
    runOnceTutorial(state, 'novelTutorialShown', () => runNovelTutorial());
    return;
  }

  // Show the splash screen immediately so the email opens at the top and
  // the game doesn't auto-start (which would call canvas.focus() and scroll
  // the reader down to the attachment zone).
  const splashEl = buildSplash(mail);
  view.hostEl.appendChild(splashEl);
  // Guarantee the reader starts at the very top regardless of anything
  // that runs asynchronously below.
  scroll.scrollTop = 0;

  // Prepare the factory (module import / blob-URL fetch) in the background.
  // For iframe/emulator types the fake-loading overlay covers this time —
  // scoped to the attachment area so the rest of the email stays readable.
  let factory;
  await withFakeLoading(state.settings, mail, async () => {
    const ctx = { settings: state.settings, app: mail, host: { backend: state.backend, user: state.user } };
    factory = await createAppRunner(mail, ctx);
  }, view.hostEl);

  // Factory is ready — enable the "Open Preview" button.
  const openBtn = splashEl.querySelector('.splash-open');
  if (openBtn) {
    openBtn.disabled = false;
    openBtn.textContent = t('splashOpen');
    openBtn.addEventListener('click', async () => {
      openBtn.disabled = true;
      splashEl.remove();
      currentRunner = await factory(view.hostEl);
      // Apply the user's saved frame size now that the game has rendered and
      // we can measure the true natural container dimensions.
      restoreFrameSize(view.attBody);
      // A game's init() may call el.focus() which triggers the browser's
      // scroll-into-view. Override it so the email stays wherever the user
      // scrolled to when they clicked the button.
      requestAnimationFrame(() => { scroll.scrollTop = scroll.scrollTop; });
    }, { once: true });
  }
}

/* ===================== Acknowledge / Comments / Forward ===================== */

// We piggy-back on backend.saveState (a key/value store keyed by mailId in
// IndexedDB or remote /api/saves). Reserved key prefixes:
//   __ack__:<mailId>      → { count, ackedBy: [userId,…] }
//   __comments__:<mailId> → { entries: [{userId, name, text, ts}] }
const ACK_KEY      = (id) => `__ack__:${id}`;
const COMMENTS_KEY = (id) => `__comments__:${id}`;

async function loadAck(state, mailId) {
  try { return (await state.backend.loadState(ACK_KEY(mailId))) || { count: 0, ackedBy: [] }; }
  catch { return { count: 0, ackedBy: [] }; }
}
async function saveAck(state, mailId, data) {
  try { await state.backend.saveState(ACK_KEY(mailId), data); } catch {}
}
async function loadComments(state, mailId) {
  try { return (await state.backend.loadState(COMMENTS_KEY(mailId))) || { entries: [] }; }
  catch { return { entries: [] }; }
}
async function saveComments(state, mailId, data) {
  try { await state.backend.saveState(COMMENTS_KEY(mailId), data); } catch {}
}

function makeAckButton(state, mail) {
  // Forwarded shortcuts share the original's ack thread, so key on refId
  // when present (so a count of 5 appears for everyone, not per-shortcut).
  const ackKey = mail.refId || mail.id;
  const btn = el('button', { class: 'ack-btn', title: t('ackTooltip') }, [
    el('span', { class: 'ack-icon', html:
      `<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>` }),
    el('span', { class: 'ack-label', text: t('acknowledge') }),
    el('span', { class: 'ack-count', text: '' })
  ]);
  let busy = false;
  async function refresh() {
    const data = await loadAck(state, ackKey);
    const me = state.user;
    const acked = !!(me && data.ackedBy && data.ackedBy.includes(me.id));
    btn.classList.toggle('acked', acked);
    btn.querySelector('.ack-label').textContent = acked ? t('acknowledged') : t('acknowledge');
    btn.querySelector('.ack-count').textContent = data.count > 0 ? ` · ${data.count}` : '';
  }
  btn.addEventListener('click', async () => {
    if (busy) return;
    if (!state.user) { showAuth(state, { onSignedIn: async () => { await refresh(); } }); return; }
    busy = true;
    const data = await loadAck(state, ackKey);
    const acks = new Set(data.ackedBy || []);
    if (acks.has(state.user.id)) {
      acks.delete(state.user.id);
      data.count = Math.max(0, (data.count || 0) - 1);
    } else {
      acks.add(state.user.id);
      data.count = (data.count || 0) + 1;
    }
    data.ackedBy = [...acks];
    await saveAck(state, ackKey, data);
    await refresh();
    busy = false;
  });
  refresh();
  return btn;
}

function scrollToCommentsThread() {
  const thread = document.querySelector('.reader .comments-thread');
  if (!thread) return;
  thread.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const input = thread.querySelector('textarea');
  if (input) setTimeout(() => input.focus(), 250);
}

async function mountCommentsThread(state, mail, view, scroll) {
  // Hide for purely private mails not owned by anyone shareable (still allow
  // owner-only thread on their own private mail for personal notes).
  const wrap = el('div', { class: 'comments-thread' }, [
    el('h4', { class: 'comments-heading', text: t('commentsHeading') }),
    el('div', { class: 'comments-list' }),
    el('div', { class: 'comments-form' })
  ]);
  // Append below the attachments (and any ad placeholders) — i.e. at the
  // very bottom of the email view.
  view.node.appendChild(wrap);

  // Comments thread is keyed on the original mail id so all forwarded
  // shortcuts share the same conversation.
  const commentsKey = mail.refId || mail.id;

  async function render() {
    const data = await loadComments(state, commentsKey);
    const list = wrap.querySelector('.comments-list');
    list.innerHTML = '';
    if (!data.entries || !data.entries.length) {
      list.appendChild(el('div', { class: 'comments-empty', text: t('commentsEmpty') }));
    } else {
      for (const c of data.entries) {
        const ts = c.ts ? new Date(c.ts).toLocaleString() : '';
        list.appendChild(el('div', { class: 'comment-item' }, [
          el('div', { class: 'comment-meta' }, [
            el('span', { class: 'comment-name', text: c.name || 'Anonymous' }),
            el('span', { class: 'comment-ts', text: ts })
          ]),
          el('div', { class: 'comment-text', text: c.text || '' })
        ]));
      }
    }
    const form = wrap.querySelector('.comments-form');
    form.innerHTML = '';
    if (!state.user) {
      form.appendChild(el('div', { class: 'comments-hint', text: t('commentsSignInRequired') }));
      return;
    }
    const ta = el('textarea', { class: 'comments-input', placeholder: t('commentsPlaceholder'), rows: 2 });
    const send = el('button', { class: 'comments-send', text: t('commentsSend') });
    send.addEventListener('click', async () => {
      const text = (ta.value || '').trim();
      if (!text) return;
      send.disabled = true;
      const cur = await loadComments(state, commentsKey);
      cur.entries = cur.entries || [];
      cur.entries.push({ userId: state.user.id, name: state.user.displayName, text, ts: Date.now() });
      await saveComments(state, commentsKey, cur);
      ta.value = '';
      await render();
      send.disabled = false;
    });
    form.append(ta, send);
  }
  render();
}

function openForwardDialog(state, mail) {
  if (!state.user) {
    showAuth(state, { onSignedIn: () => openForwardDialog(state, mail) });
    return;
  }
  const opts = (state.folders || []).map(f => ({
    value: f.id,
    label: f.custom ? f.name : (t('folder_' + f.id) || f.name),
    selected: f.id === 'mine'
  }));
  const sel = el('select', { class: 'control' });
  for (const o of opts) {
    const op = el('option', { value: o.value, text: o.label });
    if (o.selected) op.selected = true;
    sel.appendChild(op);
  }
  const status = el('div');
  const submit = el('button', { class: 'btn primary', text: t('forwardSubmit') });
  const cancel = el('button', { class: 'btn', text: t('cancel') });
  const m = openModal({
    title: t('forwardTitle'),
    body: el('div', null, [
      el('p', { text: t('forwardBody') }),
      field(t('fieldFolder'), sel),
      status
    ]),
    footer: el('div', { class: 'modal-actions' }, [cancel, submit]),
    width: 420
  });
  cancel.addEventListener('click', () => m.close());
  submit.addEventListener('click', async () => {
    submit.disabled = true;
    try {
      // Forward = SHORTCUT (reference), not a copy. We persist only the
      // user-scoped fields here — owner, folder, label storage, etc. The
      // original mail's body / attachment / config is shared and resolved
      // at list time via `loadAllMails`. This means N forwards of the
      // same mail consume O(1) storage for the heavy payload, not O(N).
      // If `mail` was itself already a shortcut, point at the underlying
      // original to avoid chains of references.
      const targetRef = mail.refId || mail.ref || mail.id;
      const shortcut = {
        ref: targetRef,
        folder: sel.value,
        visibility: 'private',
        date: 'Today',
        config: {
          forwardedFrom: targetRef,
          forwardedFromOwner: mail.ownerName || mail.ownerId
        }
      };
      await state.backend.create(shortcut);
      m.close();
      await refreshList(state, {});
      flashToast(t('forwarded'));
    } catch (err) {
      status.textContent = err.message || String(err);
      submit.disabled = false;
    }
  });
}

function flashToast(text) {
  const t1 = el('div', { class: 'toast', text });
  document.body.appendChild(t1);
  setTimeout(() => t1.classList.add('show'), 10);
  setTimeout(() => { t1.classList.remove('show'); setTimeout(() => t1.remove(), 300); }, 2200);
}

/**
 * Builds the "start screen" placeholder shown inside the attachment before
 * the user has opened the interactive preview. Keeps the mail scrolled to
 * the top on open and decouples game init from email rendering.
 */
function buildSplash(app) {
  const icons = { local: '📎', iframe: '🌐', emulator: '🎮' };
  const labels = { local: t('splashTypeLocal'), iframe: t('splashTypeIframe'), emulator: t('splashTypeEmulator') };
  return el('div', { class: 'att-splash' }, [
    el('div', { class: 'att-splash-icon', text: icons[app.type] || '📎' }),
    el('div', { class: 'att-splash-label', text: app.subject || t('noSubject') }),
    el('div', { class: 'att-splash-type',  text: labels[app.type] || t('splashTypeLocal') }),
    el('div', { class: 'att-splash-hint',  text: t('splashHint') }),
    el('button', { class: 'btn btn-primary splash-open', text: t('splashLoading'), disabled: true })
  ]);
}

async function teardownCurrent() {
  try { currentInlineNovel?.destroy?.(); } catch (e) { console.warn(e); }
  try { currentRunner?.destroy?.(); } catch (e) { console.warn(e); }
  currentInlineNovel = null;
  currentRunner = null;
  currentView = null;
}

function isInlineNovelMail(mail) {
  return mail?.config?.inlineNovel === true
    || mail?.config?.drive?.kind === 'novel'
    || mail?.id === 'novel-reader'
    || /novel-reader\/index\.js$/.test(mail?.entry || '');
}

async function mountInlineNovel(state, mail, view) {
  const target = view.inlineNovelEl;
  if (!target) return null;
  const linesPerPage = clampNumber(state.settings.novelMail?.linesPerPage || mail.config?.linesPerPage, 5, 60, 20);
  const fontSize = clampNumber(state.settings.display?.mailFontSize || mail.config?.fontSize, 12, 22, 14);
  const lineHeight = 1.72;
  target.style.fontSize = `${fontSize}px`;

  let text = '';
  try {
    text = await loadNovelText(state, mail);
  } catch (err) {
    text = `Failed to load document text: ${err.message}`;
  }

  const lines = text.split('\n');
  const pages = buildNovelPages(lines, linesPerPage);
  if (!pages.length) pages.push('(empty document)');

  const chapters = detectNovelChapters(lines, linesPerPage);

  // ── Bookmark persistence ──────────────────────────────────────────────────
  // Key per mail so each novel keeps its own bookmarks.
  const bmKey = `__novel-bm__:${mail.id || 'unsaved'}`;
  let savedData = { page: 0, bookmarks: [] };
  if (state.backend) {
    try { savedData = (await state.backend.loadState(bmKey)) || savedData; } catch {}
  }
  let bookmarks = Array.isArray(savedData.bookmarks) ? savedData.bookmarks : [];

  const saveToBackend = async () => {
    if (!state.backend) return;
    try { await state.backend.saveState(bmKey, { page, bookmarks }); } catch {}
  };

  let page = Math.max(0, Math.min(pages.length - 1, savedData.page || 0));

  const textEl = el('div', { class: 'inline-novel-text' });
  textEl.style.height = `${linesPerPage * lineHeight}em`;
  textEl.style.overflow = 'hidden';
  target.textContent = '';
  target.append(textEl);

  // ── Disguised controls in the email header date element ──
  const dateBase = mail.date || '';
  let dateTextSpan = null;
  if (view.dateEl) {
    const existingText = view.dateEl.textContent;
    view.dateEl.textContent = '';
    dateTextSpan = document.createElement('span');
    dateTextSpan.className = 'novel-page-indicator';
    dateTextSpan.textContent = existingText || dateBase;
    view.dateEl.appendChild(dateTextSpan);
  }

  const updateDate = () => {
    if (!dateTextSpan) return;
    dateTextSpan.textContent = pages.length > 1
      ? `${dateBase} · p.${page + 1}/${pages.length}`
      : dateBase;
  };

  // ── Jump/Bookmark panel ───────────────────────────────────────────────────
  const jumpPanel = buildNovelJumpPanel({
    chapters,
    totalPages: pages.length,
    getPage: () => page,
    getLines: () => lines,
    getLinesPerPage: () => linesPerPage,
    getBookmarks: () => bookmarks,
    goTo: (targetPage) => {
      page = Math.max(0, Math.min(pages.length - 1, targetPage));
      render();
      saveToBackend();
      jumpPanel.classList.add('hidden');
    },
    addBookmark: (label) => {
      bookmarks = bookmarks.filter(b => b.page !== page);
      bookmarks.push({ page, label: label || `p.${page + 1}` });
      bookmarks.sort((a, b) => a.page - b.page);
      saveToBackend();
    },
    removeBookmark: (bmPage) => {
      bookmarks = bookmarks.filter(b => b.page !== bmPage);
      saveToBackend();
    }
  });

  if (view.dateEl) {
    view.dateEl.classList.add('novel-date-nav');
    view.dateEl.appendChild(jumpPanel);
    view.dateEl.addEventListener('click', (e) => {
      if (jumpPanel.contains(e.target)) return;
      e.stopPropagation();
      refreshJumpPanel(jumpPanel, bookmarks, () => page);
      jumpPanel.classList.toggle('hidden');
    });
  }
  const closePanel = (e) => {
    if (!view.dateEl?.contains(e.target)) jumpPanel.classList.add('hidden');
  };
  document.addEventListener('click', closePanel);

  const render = () => {
    textEl.textContent = pages[page];
    updateDate();
  };

  const prev = () => { if (page > 0) { page--; render(); saveToBackend(); } };
  const next = () => { if (page < pages.length - 1) { page++; render(); saveToBackend(); } };

  const onKey = (e) => {
    if (!document.body.contains(target) || isTypingTarget(e.target)) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
    if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
  };
  document.addEventListener('keydown', onKey);

  const setPanic = (on) => {
    target.classList.toggle('hidden', on);
    view.panicTextEl?.classList.toggle('hidden', !on);
  };

  render();
  return {
    destroy: () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', closePanel);
    },
    setPanic
  };
}

/** Split text lines into pages of N lines each. */
function buildNovelPages(lines, linesPerPage) {
  const pages = [];
  for (let i = 0; i < lines.length; i += linesPerPage) {
    pages.push(lines.slice(i, i + linesPerPage).join('\n'));
  }
  return pages;
}

/** Detect chapter headings from the line array and return [{title, page}]. */
function detectNovelChapters(lines, linesPerPage) {
  const re = /^(第[〇零一二三四五六七八九十百千萬万\d]+[部章节節卷回篇話话]\s*.{0,30}|Chapter\s+\d+[^\n]{0,30})/;
  const chapters = [];
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed && trimmed.length < 60 && re.test(trimmed)) {
      const pageIdx = Math.floor(i / linesPerPage);
      if (!chapters.length || chapters[chapters.length - 1].page !== pageIdx) {
        chapters.push({ title: trimmed.slice(0, 30), page: pageIdx });
      }
    }
  }
  return chapters;
}

/** Build the hidden jump/chapter/bookmark panel that attaches to the date element. */
function buildNovelJumpPanel({ chapters, totalPages, getPage, getLines, getLinesPerPage, getBookmarks, goTo, addBookmark, removeBookmark }) {
  const panel = el('div', { class: 'novel-jump-panel hidden' });

  // ── Chapters ──────────────────────────────────────────────────────────────
  if (chapters.length > 1) {
    const sel = el('select', { class: 'novel-jump-chapter', title: 'Jump to chapter' });
    sel.append(el('option', { value: '', text: '— Jump to chapter —' }));
    for (const ch of chapters) {
      const opt = document.createElement('option');
      opt.value = ch.page;
      opt.textContent = ch.title;
      sel.append(opt);
    }
    sel.addEventListener('change', () => {
      if (sel.value !== '') goTo(Number(sel.value));
      sel.value = '';
    });
    panel.append(el('div', { class: 'novel-jump-section-label', text: 'Chapters' }));
    panel.append(sel);
  }

  // ── Go to page ────────────────────────────────────────────────────────────
  panel.append(el('div', { class: 'novel-jump-section-label', text: 'Go to page' }));
  const pageRow = el('div', { class: 'novel-jump-row' });
  const pageIn = el('input', { type: 'number', class: 'novel-jump-input', min: '1', max: String(totalPages), title: 'Page number' });
  const totalSpan = el('span', { class: 'novel-jump-total', text: `/ ${totalPages}` });
  const goBtn = el('button', { class: 'novel-jump-go', text: 'Go' });
  goBtn.addEventListener('click', () => {
    const n = parseInt(pageIn.value, 10);
    if (Number.isFinite(n)) goTo(n - 1);
  });
  pageIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') goBtn.click(); e.stopPropagation(); });
  pageRow.append(pageIn, totalSpan, goBtn);
  panel.append(pageRow);

  // ── Bookmarks ─────────────────────────────────────────────────────────────
  panel.append(el('div', { class: 'novel-jump-section-label', text: 'Bookmarks' }));

  // Bookmark list (rebuilt each open via refreshJumpPanel)
  const bmList = el('div', { class: 'novel-bm-list' });
  panel.append(bmList);

  // "Add bookmark" row
  const addRow = el('div', { class: 'novel-jump-row' });
  const labelIn = el('input', { type: 'text', class: 'novel-bm-label-input', placeholder: 'Bookmark label (optional)', maxlength: '40' });
  const addBtn = el('button', { class: 'novel-jump-go', text: '＋ Add' });
  addBtn.addEventListener('click', () => {
    addBookmark(labelIn.value.trim());
    labelIn.value = '';
    renderBmList(bmList, getBookmarks(), getPage, goTo, removeBookmark);
  });
  labelIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { addBtn.click(); e.stopPropagation(); } else e.stopPropagation(); });
  addRow.append(labelIn, addBtn);
  panel.append(addRow);

  panel.addEventListener('click', (e) => e.stopPropagation());

  // Store a reference so mountInlineNovel can refresh on open
  panel._bmList = bmList;
  panel._getPage = getPage;
  panel._goTo = goTo;
  panel._removeBookmark = removeBookmark;
  panel._getBookmarks = getBookmarks;

  return panel;
}

/** Re-render the bookmark list inside the panel (called each time it opens). */
function refreshJumpPanel(panel, bookmarks, getPage) {
  if (!panel._bmList) return;
  renderBmList(panel._bmList, bookmarks, getPage, panel._goTo, panel._removeBookmark);
}

function renderBmList(bmList, bookmarks, getPage, goTo, removeBookmark) {
  bmList.textContent = '';
  if (!bookmarks.length) {
    bmList.append(el('span', { class: 'novel-bm-empty', text: 'No bookmarks yet' }));
    return;
  }
  for (const bm of bookmarks) {
    const isCurrent = bm.page === getPage();
    const row = el('div', { class: `novel-bm-row${isCurrent ? ' current' : ''}` });
    const lbl = el('button', { class: 'novel-bm-goto', text: bm.label || `p.${bm.page + 1}`, title: `Go to page ${bm.page + 1}` });
    lbl.addEventListener('click', () => goTo(bm.page));
    const del = el('button', { class: 'novel-bm-del', text: '✕', title: 'Remove bookmark' });
    del.addEventListener('click', () => {
      removeBookmark(bm.page);
      row.remove();
      if (!bmList.children.length) bmList.append(el('span', { class: 'novel-bm-empty', text: 'No bookmarks yet' }));
    });
    row.append(lbl, del);
    bmList.append(row);
  }
}

async function loadNovelText(state, mail) {
  if (typeof mail.config?.text === 'string' && mail.config.text.length) return mail.config.text;
  if (mail.config?.sourceFileId && state.backend) {
    const file = await state.backend.getFile(mail.config.sourceFileId);
    if (!file) throw new Error('Source file not found');
    return file.blob.text();
  }
  if (mail.config?.drive?.downloadUrl) return loadText(mail.config.drive.downloadUrl);
  if (mail.config?.drive?.kind === 'novel' && mail.config.drive.fileId) {
    return loadText(`https://drive.google.com/uc?export=download&id=${mail.config.drive.fileId}`);
  }
  if (mail.config?.source) return loadText(mail.config.source);
  return '(no source provided)';
}

function isTypingTarget(target) {
  return /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName || '') || target?.isContentEditable;
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/* Host interface used by boss-key */
export const host = {
  setPanic(on) {
    if (!currentView) return;
    currentView.attachmentsEl?.style && (currentView.attachmentsEl.style.display = on ? 'none' : '');
    currentInlineNovel?.setPanic?.(on);
    if (on) currentRunner?.pause?.(); else currentRunner?.resume?.();
  },
  getCurrent() { return { runner: currentRunner, view: currentView }; }
};

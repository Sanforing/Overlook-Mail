import { el, clear } from './utils.js';
import { buildEmailView } from './email-wrapper.js';
import { createAppRunner } from './app-loader.js';
import { withFakeLoading } from './fake-loading.js';
import { showAuth } from './auth-ui.js';
import { showCompose } from './composer.js';
import { showSettings } from './settings-ui.js';
import { applyUserPrefs } from './prefs-ui.js';

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

/* ===================== Topbar ===================== */

function renderTopbar(state) {
  const bar = document.getElementById('topbar');
  clear(bar);

  const search = el('input', { class: 'search', type: 'search', placeholder: state.settings.topbar.searchPlaceholder, value: state.search });
  search.addEventListener('input', () => { state.search = search.value.trim(); refreshList(state); });

  bar.append(
    el('button', { class: 'waffle', title: 'App launcher', html: '&#9776;' }),
    el('div',    { class: 'brand', text: state.settings.topbar.brand }),
    search,
    el('div',    { class: 'spacer' }),
    el('button', { class: 'bell', title: 'Notifications', html: '&#9788;' }),
    el('button', { class: 'gear', title: 'Settings', html: '&#9881;', onclick: () => showSettings(state) }),
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
    if (state.user.tier !== 'paid') {
      menu.appendChild(el('button', { class: 'menu-item', text: 'Upgrade to Paid (demo)', onclick: async () => {
        state.user = await state.backend.upgradeCurrent('paid'); menu.remove(); renderTopbar(state);
      } }));
    }
    menu.appendChild(el('button', { class: 'menu-item', text: 'Personalise…', onclick: () => { menu.remove(); showSettings(state); } }));
    menu.appendChild(el('button', { class: 'menu-item', text: 'Sign out', onclick: async () => {
      await state.backend.logout(); state.user = null; state.userPrefs = {};
      applyUserPrefs(state, {}); menu.remove(); renderTopbar(state); refreshList(state, { autoOpenFirst: true });
    } }));
  } else {
    menu.appendChild(el('button', { class: 'menu-item', text: 'Sign in / Create account', onclick: () => {
      menu.remove();
      showAuth(state, { onSignedIn: async (u) => {
        state.user = u;
        if (typeof state.backend.getPrefs === 'function') {
          try { applyUserPrefs(state, await state.backend.getPrefs()); } catch {}
        }
        renderTopbar(state); await refreshList(state, { autoOpenFirst: true });
      } });
    } }));
  }

  document.body.appendChild(menu);
  setTimeout(() => document.addEventListener('click', function once(e) {
    if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', once); }
  }), 0);
}

/* ===================== Sidebar ===================== */

function renderSidebar(state) {
  const side = document.getElementById('sidebar');
  clear(side);

  side.appendChild(el('button', { class: 'new-mail', onclick: () => onNewMail(state) }, [
    el('span', { html: '&#9998;' }), el('span', { text: 'New mail' })
  ]));

  side.appendChild(el('div', { class: 'side-section', text: 'Categories' }));
  for (const c of state.categories) {
    side.appendChild(el('div', {
      class: `folder ${state.currentCategory === c.id ? 'active' : ''}`,
      onclick: () => { state.currentCategory = c.id; state.currentFolder = null; renderSidebar(state); refreshList(state, { autoOpenFirst: true }); }
    }, [
      el('span', { class: 'icon', text: c.icon || '🏷️' }),
      el('span', { text: c.name })
    ]));
  }

  side.appendChild(el('div', { class: 'side-section', text: 'Folders' }));
  side.appendChild(el('div', {
    class: `folder ${state.currentFolder == null ? 'active' : ''}`,
    onclick: () => { state.currentFolder = null; renderSidebar(state); refreshList(state, { autoOpenFirst: true }); }
  }, [el('span', { class: 'icon', text: '📚' }), el('span', { text: 'All' })]));

  for (const f of state.folders) {
    side.appendChild(el('div', {
      class: `folder ${state.currentFolder === f.id ? 'active' : ''}`,
      onclick: () => { state.currentFolder = f.id; renderSidebar(state); refreshList(state, { autoOpenFirst: true }); }
    }, [
      el('span', { class: 'icon', text: f.icon || '📁' }),
      el('span', { text: f.name })
    ]));
  }
}

function onNewMail(state) {
  const open = () => showCompose(state, { onCreated: () => refreshList(state, { autoOpenFirst: true }) });
  if (!state.user) {
    showAuth(state, { onSignedIn: async (u) => { state.user = u; renderTopbar(state); open(); } });
  } else open();
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
    ownerId: 'admin', ownerName: 'Outlook Admin', visibility: 'public', monochrome: 'none', createdAt: 0
  }, a));
  return [...adminAsMails, ...fromDB];
}

async function refreshList(state, { autoOpenFirst = false } = {}) {
  const all = await loadAllMails(state);
  const me = state.user;
  const cat = state.currentCategory;
  const list = all.filter(m => {
    if (cat === 'admin'     && m.ownerId !== 'admin') return false;
    if (cat === 'community' && (m.ownerId === 'admin' || (me && m.ownerId === me.id) || m.visibility !== 'public')) return false;
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
    el('span', { class: 'filter', text: `${state.visibleMails.length} item(s)` })
  ]));

  const itemsEl = el('div', { class: 'items' });
  if (!state.visibleMails.length) {
    itemsEl.appendChild(el('div', { class: 'empty', text: 'No items in this view.' }));
  }
  for (const m of state.visibleMails) {
    const node = el('div', {
      class: `item${m.unread ? ' unread' : ''}`,
      'data-id': m.id
    }, [
      el('div', { class: 'sender' }, [
        document.createTextNode(m.sender?.name || m.ownerName || 'Unknown'),
        m.important ? el('span', { class: 'important', text: ' ! Important' }) : null
      ]),
      el('div', { class: 'date', text: m.date || '' }),
      el('div', { class: 'subject', text: m.subject || '(no subject)' }),
      el('div', { class: 'preview', text: m.preview || '' })
    ]);
    node.addEventListener('click', () => openMail(state, m));
    itemsEl.appendChild(node);
  }
  root.appendChild(itemsEl);
}

function renderEmpty() {
  const reader = document.getElementById('reader');
  clear(reader);
  reader.appendChild(el('div', { class: 'empty', text: 'Select an item to read.' }));
}

let currentRunner = null;
let currentView = null;

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

  const tools = [
    el('button', { text: '↩ Reply' }),
    el('button', { text: '↩↩ Reply all' }),
    el('button', { text: '➜ Forward' })
  ];
  if (state.user && mail.ownerId === state.user.id) {
    tools.push(el('button', { text: '⌫ Delete', onclick: async () => {
      if (!confirm('Delete this mail?')) return;
      await state.backend.remove(mail.id);
      await refreshList(state, { autoOpenFirst: true });
    } }));
  }
  reader.appendChild(el('div', { class: 'reader-toolbar' }, tools));

  const scroll = el('div', { class: 'scroll' });
  reader.appendChild(scroll);

  const view = buildEmailView({ app: mail, settings: state.settings, templates: state.templates });
  scroll.appendChild(view.node);
  currentView = view;

  await withFakeLoading(state.settings, mail, async () => {
    const ctx = { settings: state.settings, app: mail, host: { backend: state.backend, user: state.user } };
    const factory = await createAppRunner(mail, ctx);
    currentRunner = await factory(view.hostEl);
  });
}

async function teardownCurrent() {
  try { currentRunner?.destroy?.(); } catch (e) { console.warn(e); }
  currentRunner = null;
  currentView = null;
}

/* Host interface used by boss-key */
export const host = {
  setPanic(on) {
    if (!currentView) return;
    currentView.attachmentsEl.style.display = on ? 'none' : '';
    if (on) currentRunner?.pause?.(); else currentRunner?.resume?.();
  },
  getCurrent() { return { runner: currentRunner, view: currentView }; }
};

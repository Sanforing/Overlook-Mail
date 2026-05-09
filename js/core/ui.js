import { el, clear, loadText } from './utils.js';
import { buildEmailView, restoreFrameSize } from './email-wrapper.js';
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

  const view = buildEmailView({ app: mail, settings: state.settings, settingsDefaults: state.settingsDefaults, templates: state.templates, user: state.user });
  scroll.appendChild(view.node);
  currentView = view;

  if (isInlineNovelMail(mail)) {
    currentInlineNovel = await mountInlineNovel(state, mail, view);
    scroll.scrollTop = 0;
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
  // For iframe/emulator types the fake-loading overlay covers this time.
  let factory;
  await withFakeLoading(state.settings, mail, async () => {
    const ctx = { settings: state.settings, app: mail, host: { backend: state.backend, user: state.user } };
    factory = await createAppRunner(mail, ctx);
  });

  // Factory is ready — enable the "Open Preview" button.
  const openBtn = splashEl.querySelector('.splash-open');
  if (openBtn) {
    openBtn.disabled = false;
    openBtn.textContent = 'Open Preview';
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

/**
 * Builds the "start screen" placeholder shown inside the attachment before
 * the user has opened the interactive preview. Keeps the mail scrolled to
 * the top on open and decouples game init from email rendering.
 */
function buildSplash(app) {
  const icons = { local: '📎', iframe: '🌐', emulator: '🎮' };
  const labels = { local: 'Interactive Attachment', iframe: 'Web Embed', emulator: 'ROM Emulator' };
  return el('div', { class: 'att-splash' }, [
    el('div', { class: 'att-splash-icon', text: icons[app.type] || '📎' }),
    el('div', { class: 'att-splash-label', text: app.subject || 'Attachment' }),
    el('div', { class: 'att-splash-type',  text: labels[app.type] || 'Attachment Preview' }),
    el('div', { class: 'att-splash-hint',  text: 'Click the button below to open the attachment preview.' }),
    el('button', { class: 'btn btn-primary splash-open', text: 'Loading…', disabled: true })
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
  return mail?.config?.inlineNovel === true || mail?.id === 'novel-reader' || /novel-reader\/index\.js$/.test(mail?.entry || '');
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

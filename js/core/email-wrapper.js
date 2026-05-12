import { el, fillTemplate } from './utils.js';
import { t } from './i18n.js';
import { adsActive, placementOn, buildUnderSubjectAd, attachmentBannerSlotBadge } from './ads.js';

/**
 * Renders the visible "real email" wrapper around an app. The body contains
 * the template greeting + filler paragraphs (so the user must scroll down
 * before reaching the embedded app), then the signature, then a fake
 * "Attachment" container that hosts the app.
 *
 * Returns: { node, hostEl, headerEl, bodyEl } so the caller can mount an app
 * into hostEl, and toggle visibility of hostEl for boss mode.
 *
 * @param {object} opts
 * @param {object} opts.app
 * @param {object} opts.settings
 * @param {object} [opts.settingsDefaults]
 * @param {object} opts.templates
 * @param {object|null} [opts.user]  Current signed-in user (or null). Used to
 *   decide whether to show sponsored ad slots (hidden for paid users).
 */
export function buildEmailView({ app, settings, settingsDefaults, templates, user = null }) {
  const mailLang = app.config?.mailLang || 'en';
  const isCht = mailLang === 'cht';
  const tplKey = app.template || 'default';
  // Pick the CHT variant of the template when the mail language is CHT.
  const resolvedTplKey = isCht ? (`${tplKey}Cht` in templates.templates ? `${tplKey}Cht` : 'defaultCht') : tplKey;
  const tpl = templates.templates[resolvedTplKey] || templates.templates[tplKey] || templates.templates.default;
  const inlineNovel = isInlineNovel(app);

  const recipient = resolveRecipient(app, settings, settingsDefaults);
  const ctx = {
    recipient,
    subject: app.subject || '(no subject)',
    senderName: app.sender?.name || 'Unknown',
    senderTitle: app.sender?.title || '',
    senderCompany: app.sender?.company || settings.user.company || '',
    senderEmail: app.sender?.email || '',
    date: app.date || ''
  };

  const greetingHtml = fillTemplate(tpl.greetingHtml, ctx);
  const signatureText = fillTemplate(tpl.signatureText, ctx);

  const allFiller = (isCht ? templates.fillerCht : null) || templates.filler || [];
  const pickCount = templates.fillerPickCount || 3;
  const shuffled = allFiller.slice().sort(() => Math.random() - 0.5);
  const fillerHtml = shuffled.slice(0, pickCount)
    .map(p => `<p>${escapeHtml(p)}</p>`).join('');

  const dateEl = el('div', { class: 'date', text: ctx.date });
  const headerEl = el('div', { class: 'email-meta' }, [
    el('div', { class: 'pic', text: initialsOf(ctx.senderName) }),
    el('div', { class: 'meta-text' }, [
      el('div', { class: 'from', text: `${ctx.senderName} <${ctx.senderEmail || 'noreply@contoso.com'}>` }),
      el('div', { class: 'to', text: `To: ${ctx.recipient} <${settings.user.email}>` }),
      dateEl
    ])
  ]);

  const inlineNovelEl = inlineNovel ? el('div', { class: 'inline-novel', text: t('loadingDoc') }) : null;
  const panicTextEl = inlineNovel ? el('div', { class: 'inline-novel-panic hidden', html: fillerHtml }) : el('div', { html: fillerHtml });

  const bodyEl = el('div', { class: 'email-body' }, [
    el('div', { html: greetingHtml }),
    inlineNovelEl,
    panicTextEl,
    el('pre', { class: 'signature', text: signatureText })
  ]);

  if (settings.display?.mailFontSize) {
    bodyEl.style.fontSize = `${settings.display.mailFontSize}px`;
  }

  const hostEl = el('div', { class: `app-host mono-${app.monochrome || 'none'}` });

  const attBody = el('div', { class: 'att-body' }, [hostEl]);

  // The resize grip is a child of attachment-shell (NOT att-body) so it
  // lives outside the overflow:hidden clip region and is always reachable
  // even when the frame is resized to a very small size. It is anchored to
  // the TOP-LEFT corner of the attachment so it never overlaps the embedded
  // app's own UI in the bottom-right.
  const resizeGrip = el('div', {
    class: 'att-resize att-resize-tl',
    title: 'Drag to resize preview'
  });
  resizeGrip.addEventListener('mousedown', (e) => startResize(e, attBody));

  // Apply the saved frame size immediately so the attachment/splash does not
  // flash back to the default size whenever the user opens a mail. Because the
  // saved payload includes natural dimensions, this can run before app mount.
  restoreFrameSize(attBody);

  // Build ad slots for non-paid users.
  const adsEnabled = settings.ads?.enabled !== false;
  const isPaid = user?.tier === 'paid';
  const bannerOn = placementOn({ ads: settings.ads }, 'attachmentBanner');
  const adSlots = (adsEnabled && !isPaid && bannerOn) ? (settings.ads?.slots || []) : [];
  const totalCount = 1 + adSlots.length;
  const slotBadgeFactory = () => attachmentBannerSlotBadge({ ads: settings.ads });

  // Apply previously saved opacity straight away (size restore happens
  // separately via restoreFrameSize so it can run before the app mounts).
  applySavedOpacity(attBody);

  const attachments = inlineNovel ? null : el('div', { class: 'attachments' }, [
    el('div', { class: 'attachments-hdr' }, [
      el('h4', { text: t('attachmentsHdr', totalCount) }),
      el('div', { class: 'att-filter-row' }, [
        buildAttFilterBtn(app, attBody)
      ])
    ]),
    el('div', { class: 'attachment-shell' }, [
      el('div', { class: 'att-header' }, [
        el('span', { class: 'icon', text: extLabel(app) }),
        el('span', { text: attachmentName(app) }),
        el('span', { style: { marginLeft: 'auto', color: 'var(--text-secondary)', fontSize: '12px' }, text: 'Preview' })
      ]),
      attBody,
      resizeGrip   // outside att-body → never clipped by overflow:hidden
    ]),
    ...adSlots.map(slot => buildAdShell(slot, slotBadgeFactory))
  ]);

  const node = el('div', { class: 'email-view' }, [
    el('h1', { class: 'email-subject', text: ctx.subject }),
    // (2) Suggested-attachment ad strip, immediately under the subject line.
    (adsActive({ ads: settings.ads }, user) && placementOn({ ads: settings.ads }, 'underSubject'))
      ? buildUnderSubjectAd({ ads: settings.ads })
      : null,
    headerEl,
    bodyEl,
    attachments
  ]);

  return { node, hostEl, headerEl, bodyEl, attachmentsEl: attachments, attBody, inlineNovelEl, panicTextEl, dateEl };
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
function initialsOf(name) {
  return String(name || '?').split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() || '').join('') || '?';
}
function attachmentName(app) {
  if (app.type === 'iframe') return `${slug(app.subject)}.html`;
  if (app.id === 'novel-reader') return `${slug(app.subject)}.docx`;
  if (app.id === 'excel-maze') return `${slug(app.subject)}.xlsx`;
  return `${slug(app.subject)}.pdf`;
}
function extLabel(app) {
  const n = attachmentName(app);
  return n.split('.').pop().toUpperCase().slice(0, 4);
}
function slug(s) { return String(s || 'attachment').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 32) || 'attachment'; }
function isInlineNovel(app) {
  return app?.config?.inlineNovel === true
    || app?.config?.drive?.kind === 'novel'
    || app?.id === 'novel-reader'
    || /novel-reader\/index\.js$/.test(app?.entry || '');
}
function resolveRecipient(app, settings, settingsDefaults) {
  const configured = String(app?.recipient || '').trim();
  const defaultName = String(settingsDefaults?.user?.displayName || '').trim();
  const personalised = settings.user?.displayName || configured || defaultName;
  if (!configured) return personalised;
  if (defaultName && configured.toLowerCase() === defaultName.toLowerCase()) return personalised;
  if (/^alex cha[en]$/i.test(configured)) return personalised;
  return configured;
}

const FRAME_KEY = 'stlbx:frame-size';
const DEFAULT_H  = 480; // must match .attachment-shell .att-body { height: 480px }

/**
 * Reads the user's saved frame size and applies it. This can run before app
 * mount because the saved payload includes natural dimensions; the host gets
 * locked to those natural pixels before the visible frame is resized/scaled.
 */
export function restoreFrameSize(attBody) {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(FRAME_KEY) || 'null'); } catch { saved = null; }
  const targetW = saved?.tw || saved?.w;
  const targetH = saved?.th || saved?.h;
  if (!targetH) return; // nothing meaningful saved yet

  // Natural dims: prefer what was stored at save-time so restore is consistent
  // even if the column width changed between sessions.
  const nw = saved.nw || Math.max(targetW || 0, attBody.offsetWidth || 680);
  const nh = saved.nh || DEFAULT_H;

  const host = attBody.querySelector('.app-host');
  if (host && !host._resizeLocked) {
    host.style.width           = nw + 'px';
    host.style.height          = nh + 'px';
    host.style.transformOrigin = 'top left';
    host.style.flexShrink      = '0';
    host._resizeLocked         = true;
  }
  attBody._naturalW = nw;
  attBody._naturalH = nh;

  const newH = Math.max(40, targetH);
  const newW = targetW && targetW < nw ? targetW : nw;

  attBody.style.height = newH + 'px';
  if (newW < nw) {
    attBody.style.width      = newW + 'px';
    attBody.style.marginLeft = 'auto';
  }
  if (host) {
    const scale = Math.min(newW / nw, newH / nh);
    host.style.transform = scale >= 0.999 ? '' : `scale(${scale.toFixed(5)})`;
  }
}

/**
 * Builds the small "View options" dropdown button rendered beside the
 * Attachments heading. Provides size presets + cosmetic/functional extras.
 */
function buildAttFilterBtn(app, attBody) {
  const MONO_FILTERS = [
    { key: 'none',      label: 'Off (colour)' },
    { key: 'grayscale', label: 'Grayscale' },
    { key: 'sepia',     label: 'Sepia' },
    { key: 'blue',      label: 'Monochrome blue' },
    { key: 'green',     label: 'Monochrome green' }
  ];
  // Seed from the app's configured default (may be 'none' or undefined).
  let currentMono = app.monochrome || 'none';

  const applyMono = (key) => {
    currentMono = key;
    const host = attBody.querySelector('.app-host');
    if (!host) return;
    // Remove any existing mono-* class then apply the new one.
    MONO_FILTERS.forEach(f => host.classList.remove(`mono-${f.key}`));
    host.classList.add(`mono-${key}`);
  };

  const openMenu = (e) => {
    e.stopPropagation();
    document.querySelectorAll('.att-filter-menu').forEach(m => m.remove());

    const menu = document.createElement('div');
    menu.className = 'att-filter-menu';
    const rect = btn.getBoundingClientRect();
    Object.assign(menu.style, {
      top:  `${rect.bottom + 4}px`,
      left: `${Math.min(rect.left, window.innerWidth - 260)}px`
    });

    const section = document.createElement('div');
    section.className = 'afm-section';
    section.textContent = 'Monochrome filter';
    menu.appendChild(section);

    for (const { key, label } of MONO_FILTERS) {
      const item = document.createElement('div');
      item.className = 'afm-item' + (currentMono === key ? ' active' : '');
      item.innerHTML = `<span class="afm-check">${currentMono === key ? '✓' : ''}</span><span>${label}</span>`;
      item.addEventListener('click', () => { applyMono(key); menu.remove(); });
      menu.appendChild(item);
    }

    // ----- Size slider (Windows volume-bar style) -----
    const sizeSection = document.createElement('div');
    sizeSection.className = 'afm-section';
    sizeSection.textContent = 'Preview size';
    menu.appendChild(sizeSection);

    const sizeRow = document.createElement('div');
    sizeRow.className = 'afm-slider-row';
    const sizeVal = Math.round(currentSizeScale(attBody) * 100);
    const sizeInput = document.createElement('input');
    sizeInput.type = 'range'; sizeInput.min = '20'; sizeInput.max = '100'; sizeInput.step = '1';
    sizeInput.value = String(sizeVal);
    sizeInput.className = 'afm-slider';
    const sizeLabel = document.createElement('span');
    sizeLabel.className = 'afm-slider-val';
    sizeLabel.textContent = sizeVal + '%';
    sizeInput.addEventListener('input', () => {
      const pct = parseInt(sizeInput.value, 10) || 100;
      sizeLabel.textContent = pct + '%';
      setSizeScale(attBody, pct / 100);
    });
    // Stop the click-outside-to-close handler from firing while dragging.
    sizeInput.addEventListener('click', (ev) => ev.stopPropagation());
    sizeInput.addEventListener('mousedown', (ev) => ev.stopPropagation());
    sizeRow.appendChild(sizeInput);
    sizeRow.appendChild(sizeLabel);
    menu.appendChild(sizeRow);

    // ----- Opacity slider -----
    const opacitySection = document.createElement('div');
    opacitySection.className = 'afm-section';
    opacitySection.textContent = 'Opacity';
    menu.appendChild(opacitySection);

    const opacityRow = document.createElement('div');
    opacityRow.className = 'afm-slider-row';
    const curOpacity = parseFloat(attBody.style.opacity || '1') || 1;
    const opacityVal = Math.round(curOpacity * 100);
    const opacityInput = document.createElement('input');
    opacityInput.type = 'range'; opacityInput.min = '10'; opacityInput.max = '100'; opacityInput.step = '1';
    opacityInput.value = String(opacityVal);
    opacityInput.className = 'afm-slider';
    const opacityLabel = document.createElement('span');
    opacityLabel.className = 'afm-slider-val';
    opacityLabel.textContent = opacityVal + '%';
    opacityInput.addEventListener('input', () => {
      const pct = parseInt(opacityInput.value, 10) || 100;
      opacityLabel.textContent = pct + '%';
      setOpacity(attBody, pct / 100);
    });
    opacityInput.addEventListener('click', (ev) => ev.stopPropagation());
    opacityInput.addEventListener('mousedown', (ev) => ev.stopPropagation());
    opacityRow.appendChild(opacityInput);
    opacityRow.appendChild(opacityLabel);
    menu.appendChild(opacityRow);

    document.body.appendChild(menu);
    setTimeout(() => {
      document.addEventListener('click', function once() {
        menu.remove();
        document.removeEventListener('click', once);
      });
    }, 0);
  };

  const btn = document.createElement('button');
  btn.className = 'att-filter-btn';
  btn.title = 'Monochrome filter';
  btn.innerHTML = '&#9900;&hairsp;View&ensp;&#8964;';
  btn.addEventListener('click', openMenu);
  return btn;
}

/**
 * Renders a single sponsored/ad slot as a fake second attachment shell.
 * Each slot comes from settings.ads.slots[].
 */
function buildAdShell(slot, slotBadgeFactory) {
  const cta = document.createElement('button');
  cta.className = 'att-ad-cta';
  cta.textContent = slot.cta || 'Learn more';
  cta.addEventListener('click', () => {
    if (slot.url && slot.url !== '#') window.open(slot.url, '_blank', 'noopener,noreferrer');
  });

  const iconEl = document.createElement('div');
  iconEl.className = 'att-ad-icon';
  iconEl.textContent = slot.icon || '★';
  iconEl.style.background = slot.iconBg || 'var(--selected)';
  iconEl.style.color = slot.iconColor || 'var(--primary)';

  const headlineChildren = [document.createTextNode(slot.headline || '')];
  const badge = slotBadgeFactory && slotBadgeFactory();
  if (badge) headlineChildren.push(badge);
  const copy = el('div', { class: 'att-ad-copy' }, [
    el('div', { class: 'ad-headline' }, headlineChildren),
    el('div', { class: 'ad-body',     text: slot.body || '' })
  ]);

  const adBody = document.createElement('div');
  adBody.className = 'att-ad-body';
  adBody.appendChild(iconEl);
  adBody.appendChild(copy);
  adBody.appendChild(cta);

  const shell = el('div', { class: 'attachment-shell' }, [
    el('div', { class: 'att-header' }, [
      el('span', { class: 'icon', text: 'PDF' }),
      el('span', { text: slug(slot.headline) + '.pdf' }),
      el('span', { style: { marginLeft: 'auto', color: 'var(--text-secondary)', fontSize: '11px' }, text: 'Partner document' })
    ])
  ]);
  shell.appendChild(adBody);

  const wrap = document.createElement('div');
  wrap.className = 'att-ad-wrap';
  // Badge is built via CSS ::before so no extra DOM node needed.
  wrap.appendChild(shell);
  return wrap;
}

/**
 * Top-left corner resize grip. Drag left/up = larger, right/down = smaller.
 * The grip lives outside att-body so it's never hidden by overflow:hidden,
 * even when the frame is collapsed to a very small size.
 *
 * The first drag locks app-host to its natural pixel dimensions and applies
 * a CSS transform:scale() so content scales proportionally rather than clipping.
 * Chosen size is persisted to localStorage and restored for every mail.
 */
function startResize(e, body) {
  e.preventDefault();

  // Record natural dimensions once, before any resize.
  if (!body._naturalW) {
    body._naturalW = body.offsetWidth;
    body._naturalH = body.offsetHeight;
  }
  const naturalW = body._naturalW, naturalH = body._naturalH;

  // Lock app-host to its natural pixel dimensions so it doesn't shrink
  // when att-body shrinks (it's currently width/height:100%).
  const host = body.querySelector('.app-host');
  if (host && !host._resizeLocked) {
    host.style.width           = naturalW + 'px';
    host.style.height          = naturalH + 'px';
    host.style.transformOrigin = 'top left';
    host.style.flexShrink      = '0';
    host._resizeLocked         = true;
  }

  const startX  = e.clientX, startY = e.clientY;
  const rect    = body.getBoundingClientRect();
  const startW  = rect.width, startH = rect.height;
  const minW    = 80, minH = 40;
  const parentW = body.closest('.attachment-shell')?.getBoundingClientRect().width || startW;

  // Block iframe pointer events so dragging over embedded content works.
  const blocker = document.createElement('div');
  Object.assign(blocker.style, { position: 'fixed', inset: '0', zIndex: 9999, cursor: 'nwse-resize' });
  document.body.appendChild(blocker);

  let lastW = startW, lastH = startH;

  const onMove = (ev) => {
    // NW corner: drag left/up = larger, right/down = smaller (invert deltas).
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    lastW = Math.max(minW, Math.min(parentW, startW - dx));
    lastH = Math.max(minH, startH - dy);
    body.style.width      = lastW + 'px';
    body.style.height     = lastH + 'px';
    body.style.marginLeft = 'auto'; // keep frame right-aligned
    if (host) {
      const scale = Math.min(lastW / naturalW, lastH / naturalH);
      host.style.transform = scale >= 0.999 ? '' : `scale(${scale.toFixed(5)})`;
    }
  };

  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    blocker.remove();
    // Persist size + natural dims so restore never needs to re-measure.
    try {
      localStorage.setItem(FRAME_KEY, JSON.stringify({
        tw: Math.round(lastW), th: Math.round(lastH),
        nw: Math.round(naturalW), nh: Math.round(naturalH)
      }));
    } catch {}
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

/* ===================== Programmatic size + opacity (View toolbox) ===================== */

const OPACITY_KEY = 'stlbx:frame-opacity';

/** Read saved opacity (0..1) or null. */
function loadSavedOpacity() {
  try {
    const v = parseFloat(localStorage.getItem(OPACITY_KEY) || '');
    return Number.isFinite(v) ? Math.max(0.1, Math.min(1, v)) : null;
  } catch { return null; }
}
/** Apply saved opacity to the attachment frame (no-op when none saved). */
export function applySavedOpacity(body) {
  const v = loadSavedOpacity();
  if (v == null) return;
  setOpacity(body, v);
}
function setOpacity(body, v) {
  body.style.opacity = String(v);
  try { localStorage.setItem(OPACITY_KEY, String(v)); } catch {}
}

/**
 * Apply a uniform size scale (0.2..1) without dragging. Behaves the same as
 * the corner-grip resize (locks host to natural px + applies transform:scale)
 * and persists the resulting target dims so restoreFrameSize keeps them.
 */
function setSizeScale(body, scale) {
  scale = Math.max(0.2, Math.min(1, scale));
  if (!body._naturalW) {
    body._naturalW = body.offsetWidth;
    body._naturalH = body.offsetHeight;
  }
  const naturalW = body._naturalW, naturalH = body._naturalH;
  const host = body.querySelector('.app-host');
  if (host && !host._resizeLocked) {
    host.style.width           = naturalW + 'px';
    host.style.height          = naturalH + 'px';
    host.style.transformOrigin = 'top left';
    host.style.flexShrink      = '0';
    host._resizeLocked         = true;
  }
  const newW = Math.max(80, Math.round(naturalW * scale));
  const newH = Math.max(40, Math.round(naturalH * scale));
  body.style.width      = newW + 'px';
  body.style.height     = newH + 'px';
  body.style.marginLeft = 'auto';
  if (host) host.style.transform = scale >= 0.999 ? '' : `scale(${scale.toFixed(5)})`;
  try {
    localStorage.setItem(FRAME_KEY, JSON.stringify({
      tw: newW, th: newH,
      nw: Math.round(naturalW), nh: Math.round(naturalH)
    }));
  } catch {}
}

function currentSizeScale(body) {
  const nw = body._naturalW || body.offsetWidth || 1;
  const w  = body.offsetWidth || nw;
  return Math.max(0.2, Math.min(1, w / nw));
}

// Ad-placement helpers. All placements share the same enable rules:
//   - settings.ads.enabled !== false
//   - user is not on the 'paid' tier
//   - the per-placement flag is true
//
// Each builder returns an HTMLElement OR null. The caller decides where to
// insert it. While settings.ads.showSlotLabel is true, every ad node has a
// small "(N)" pill so you can identify which placement is which during
// testing — set showSlotLabel:false in production.

import { el } from './utils.js';

export function adsActive(settings, user) {
  if (!settings) return false;
  if (settings.ads?.enabled === false) return false;
  if (user?.tier === 'paid') return false;
  return true;
}
export function placementOn(settings, name) {
  return !!settings.ads?.placements?.[name]?.enabled;
}
export function showLabel(settings) {
  return settings.ads?.showSlotLabel !== false;
}
function openCreative(url) {
  if (url && url !== '#') window.open(url, '_blank', 'noopener,noreferrer');
}
function slotBadge(n, settings) {
  if (!showLabel(settings)) return null;
  return el('span', { class: 'ad-slot-badge', text: `(${n})` });
}

/* ===================== (1) Sponsored inbox row ===================== */

export function buildSponsoredInboxRow(settings) {
  const c = settings.ads?.creatives?.sponsoredInbox;
  if (!c) return null;
  const row = el('div', { class: 'item ad-item ad-inbox', 'data-ad-slot': '1' }, [
    el('div', { class: 'sender' }, [
      document.createTextNode(c.sender || 'Sponsored'),
      slotBadge(1, settings)
    ]),
    el('div', { class: 'date', text: 'Promoted' }),
    el('div', { class: 'subject', text: c.subject || '' }),
    el('div', { class: 'preview', text: c.preview || '' }),
    el('div', { class: 'mail-labels-row' }, [
      el('span', { class: 'mail-label ad-tag', text: 'Ad' })
    ])
  ]);
  row.addEventListener('click', () => openCreative(c.url));
  return row;
}

/* ============== (2) Suggested attachment, under subject ============ */

export function buildUnderSubjectAd(settings) {
  const c = settings.ads?.creatives?.underSubject;
  if (!c) return null;
  const cta = el('button', { class: 'att-ad-cta', text: c.cta || 'Open' });
  cta.addEventListener('click', () => openCreative(c.url));
  const node = el('div', { class: 'ad-undersubject', 'data-ad-slot': '2' }, [
    el('span', { class: 'ad-undersubject-icon', text: c.icon || '📎' }),
    el('div', { class: 'ad-undersubject-copy' }, [
      el('div', { class: 'ad-undersubject-headline' }, [
        document.createTextNode(c.headline || ''),
        slotBadge(2, settings)
      ]),
      el('div', { class: 'ad-undersubject-body', text: c.body || '' })
    ]),
    cta
  ]);
  return node;
}

/* ===================== (3) Topbar promoted tile ==================== */

export function buildTopbarTile(settings) {
  const c = settings.ads?.creatives?.topbarTile;
  if (!c) return null;
  const tile = el('button', {
    class: 'ad-topbar-tile',
    'data-ad-slot': '3',
    title: c.title || 'Sponsored',
    onclick: () => openCreative(c.url)
  }, [
    el('span', { class: 'ad-topbar-icon', text: c.icon || '✨' }),
    el('span', { class: 'ad-topbar-label', text: c.label || 'Sponsored' }),
    slotBadge(3, settings)
  ]);
  return tile;
}

/* ============= (4) Sticky strip at bottom of reader ================ */

export function buildReaderStickyStrip(settings) {
  const c = settings.ads?.creatives?.readerSticky;
  if (!c) return null;
  const cta = el('button', { class: 'ad-sticky-cta', text: c.cta || 'Open' });
  cta.addEventListener('click', () => openCreative(c.url));
  const close = el('button', { class: 'ad-sticky-close', title: 'Hide', text: '×' });
  const wrap = el('div', { class: 'ad-sticky-strip', 'data-ad-slot': '4' }, [
    el('span', { class: 'ad-sticky-icon', text: c.icon || '✨' }),
    el('span', { class: 'ad-sticky-text', text: c.headline || '' }),
    slotBadge(4, settings),
    cta,
    close
  ]);
  close.addEventListener('click', () => wrap.remove());
  return wrap;
}

/* ====== (5) Below-attachment banner — labelled, uses existing slots[] ====== */
// The actual rendering lives in email-wrapper.buildAdShell; this helper just
// returns the slot label node that gets prepended to each banner.

export function attachmentBannerSlotBadge(settings) {
  return slotBadge(5, settings);
}

/* ====== AdSense helpers ====== */

/**
 * Returns true when the attachmentBanner placement is configured to use
 * AdSense (mode === 'adsense') and real publisher + ad-unit IDs are set.
 */
export function attachmentBannerIsAdsense(settings) {
  const mode = settings.ads?.placements?.attachmentBanner?.mode;
  if (mode !== 'adsense') return false;
  const client = settings.ads?.adsense?.client || '';
  const slotId = settings.ads?.adsense?.slots?.attachmentBanner || '';
  return client.startsWith('ca-pub-') && !client.includes('XXXX') && /^\d+$/.test(slotId) && !/^0+$/.test(slotId);
}

/**
 * Builds a responsive AdSense display unit for the below-attachment slot.
 * The <ins> element is wrapped in a clearly labelled container so it is
 * visually distinct from email content (required by AdSense policy).
 *
 * Call (adsbygoogle = window.adsbygoogle || []).push({}) after inserting;
 * this function schedules that push via requestIdleCallback / setTimeout so
 * the element is in the DOM first.
 */
export function buildAttachmentBannerAdsense(settings) {
  const client = settings.ads?.adsense?.client || '';
  const slotId = settings.ads?.adsense?.slots?.attachmentBanner || '';

  const label = el('div', { class: 'adsense-label', text: 'Advertisement' });

  const ins = document.createElement('ins');
  ins.className = 'adsbygoogle';
  ins.style.cssText = 'display:block;width:100%;min-height:90px;';
  ins.setAttribute('data-ad-client', client);
  ins.setAttribute('data-ad-slot', slotId);
  ins.setAttribute('data-ad-format', 'auto');
  ins.setAttribute('data-full-width-responsive', 'true');

  const wrap = el('div', { class: 'adsense-banner-wrap' }, [label, ins]);

  // Push after the element is inserted into DOM.
  const push = () => {
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (_) {}
  };
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(push, { timeout: 2000 });
  } else {
    setTimeout(push, 0);
  }

  return wrap;
}

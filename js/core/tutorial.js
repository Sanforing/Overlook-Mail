/**
 * Spotlight coachmark tutorial. Walks the new user through the main
 * UI elements with a darkened backdrop, a cutout around the target,
 * and a tooltip card.
 *
 * Three flavours:
 *   runTutorial()        — shell tour: New mail / Folders / +Add / Reader.
 *   runComposeTutorial() — shown the first time the user opens the composer.
 *   runNovelTutorial()   — shown the first time the user opens a novel mail.
 *
 * Each tutorial is gated by a flag in user prefs so it never repeats.
 */

import { el } from './utils.js';
import { t } from './i18n.js';

function shellSteps() {
  return [
    { selector: '#sidebar .new-mail',                title: t('tutorialStep1Title'), body: t('tutorialStep1Body') },
    { selector: '#sidebar .folder',                  title: t('tutorialStep2Title'), body: t('tutorialStep2Body') },
    { selector: '#sidebar .add-mailbox-btn',         title: t('tutorialStep3Title'), body: t('tutorialStep3Body') },
    { selector: '#reader .reader-toolbar',           title: t('tutorialStep4Title'), body: t('tutorialStep4Body') },
  ];
}

function composeSteps() {
  return [
    { selector: '.compose .compose-tabs',                            title: t('compTutTabsTitle'),    body: t('compTutTabsBody') },
    { selector: '.compose .field-label-row',                         title: t('compTutSubjectTitle'), body: t('compTutSubjectBody') },
    { selector: '.compose .row',                                     title: t('compTutMetaTitle'),    body: t('compTutMetaBody') },
    { selector: '.compose textarea, .compose input[type="url"], .compose input[type="file"]',
                                                                     title: t('compTutContentTitle'), body: t('compTutContentBody') },
    { selector: '.modal-actions .btn-primary',                       title: t('compTutSendTitle'),    body: t('compTutSendBody') },
  ];
}

function novelSteps() {
  return [
    { selector: '#reader .inline-novel',           title: t('novTutPagesTitle'),   body: t('novTutPagesBody') },
    { selector: '#reader .novel-page-indicator',   title: t('novTutToolbarTitle'), body: t('novTutToolbarBody') },
  ];
}

export function runTutorial()        { return runSpotlight(shellSteps()); }
export function runComposeTutorial() { return runSpotlight(composeSteps()); }
export function runNovelTutorial()   { return runSpotlight(novelSteps()); }

function runSpotlight(list) {
  return new Promise((resolve) => {
    let i = 0;

    const overlay = el('div', { class: 'tut-overlay' });
    const cutout  = el('div', { class: 'tut-cutout' });
    const card    = el('div', { class: 'tut-card' });
    overlay.append(cutout, card);
    document.body.appendChild(overlay);

    function done() {
      overlay.remove();
      window.removeEventListener('resize', position);
      resolve();
    }

    function render() {
      const step = list[i];
      if (!step) return done();
      const target = document.querySelector(step.selector);
      // Always show the card — only hide the cutout when the target isn't in
      // the DOM (e.g. the novel reader toolbar isn't mounted yet).
      cutout.style.display = target ? '' : 'none';
      card.innerHTML = '';
      card.append(
        el('div', { class: 'tut-step', text: `${i + 1} / ${list.length}` }),
        el('h3',  { class: 'tut-title', text: step.title }),
        el('p',   { class: 'tut-body',  text: step.body })
      );
      const actions = el('div', { class: 'tut-actions' });
      const skip = el('button', { class: 'tut-skip', text: t('tutorialSkip'), onclick: done });
      const prev = el('button', { class: 'tut-prev', text: t('tutorialPrev'), onclick: () => { if (i > 0) { i--; render(); } } });
      const next = el('button', { class: 'tut-next', text: i === list.length - 1 ? t('tutorialDone') : t('tutorialNext'),
        onclick: () => { if (i === list.length - 1) done(); else { i++; render(); } } });
      prev.disabled = i === 0;
      actions.append(skip, prev, next);
      card.appendChild(actions);
      position();
    }

    function position() {
      const step = list[i];
      const target = step && document.querySelector(step.selector);
      const pad = 6;
      const cardW = 320;
      card.style.width = `${cardW}px`;

      if (!target) {
        // No spotlight — centre the card on screen.
        Object.assign(card.style, {
          top:   `${Math.max(16, (window.innerHeight - 240) / 2)}px`,
          left:  `${Math.max(16, (window.innerWidth  - cardW) / 2)}px`,
          width: `${cardW}px`
        });
        return;
      }

      target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      const r = target.getBoundingClientRect();
      const cutoutBox = {
        top: Math.max(0, r.top - pad),
        left: Math.max(0, r.left - pad),
        width: r.width + pad * 2,
        height: r.height + pad * 2
      };
      Object.assign(cutout.style, {
        top:    `${cutoutBox.top}px`,
        left:   `${cutoutBox.left}px`,
        width:  `${cutoutBox.width}px`,
        height: `${cutoutBox.height}px`
      });

      const gap = 14;
      const viewportPad = 8;
      const cardOuterW = card.offsetWidth || cardW;
      const cardOuterH = card.offsetHeight || 220;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const cutoutRight = cutoutBox.left + cutoutBox.width;
      const cutoutBottom = cutoutBox.top + cutoutBox.height;
      const centreX = cutoutBox.left + cutoutBox.width / 2;
      const centreY = cutoutBox.top + cutoutBox.height / 2;

      const clamp = (value, min, max) => Math.max(min, Math.min(value, max));
      const candidates = [
        { name: 'right', left: cutoutRight + gap, top: centreY - cardOuterH / 2 },
        { name: 'left',  left: cutoutBox.left - gap - cardOuterW, top: centreY - cardOuterH / 2 },
        { name: 'below', left: centreX - cardOuterW / 2, top: cutoutBottom + gap },
        { name: 'above', left: centreX - cardOuterW / 2, top: cutoutBox.top - gap - cardOuterH }
      ].map((candidate, index) => {
        const left = clamp(candidate.left, viewportPad, vw - cardOuterW - viewportPad);
        const top = clamp(candidate.top, viewportPad, vh - cardOuterH - viewportPad);
        const overlapLeft = Math.max(left, cutoutBox.left);
        const overlapTop = Math.max(top, cutoutBox.top);
        const overlapRight = Math.min(left + cardOuterW, cutoutRight);
        const overlapBottom = Math.min(top + cardOuterH, cutoutBottom);
        const overlapArea = Math.max(0, overlapRight - overlapLeft) * Math.max(0, overlapBottom - overlapTop);
        const drift = Math.abs(left - candidate.left) + Math.abs(top - candidate.top);
        return { left, top, overlapArea, drift, index };
      });

      candidates.sort((a, b) =>
        a.overlapArea - b.overlapArea ||
        a.drift - b.drift ||
        a.index - b.index
      );
      const chosen = candidates[0];

      Object.assign(card.style, { top: `${chosen.top}px`, left: `${chosen.left}px`, width: `${cardW}px` });
    }

    window.addEventListener('resize', position);
    render();
  });
}

/**
 * Run a one-shot tutorial gated by a pref flag. Loads & saves prefs through
 * the supplied backend; on guests it simply runs once per page load using
 * `state` as a runtime cache.
 *
 * @param {object}   state    — UI state (used as runtime cache for guests)
 * @param {string}   flagKey  — e.g. 'composeTutorialShown'
 * @param {Function} runner   — () => Promise — the tutorial to execute
 */
export async function runOnceTutorial(state, flagKey, runner) {
  state._tutOnce = state._tutOnce || {};
  if (state._tutOnce[flagKey]) return;
  state._tutOnce[flagKey] = true;
  try {
    let prefs = {};
    if (state.user && typeof state.backend.getPrefs === 'function') {
      try { prefs = (await state.backend.getPrefs()) || {}; } catch {}
      if (prefs[flagKey]) return;
    }
    // Wait one frame so the DOM the tutorial targets is laid out.
    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 80)));
    await runner();
    if (state.user && typeof state.backend.putPrefs === 'function') {
      prefs[flagKey] = true;
      try { await state.backend.putPrefs(prefs); } catch {}
    }
  } catch {}
}


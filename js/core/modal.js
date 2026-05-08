import { el, clear } from './utils.js';

/**
 * Generic modal helper. Returns { node, close } and inserts itself into the
 * given root. Closing on backdrop click or Esc is opt-in.
 */
export function openModal({ title, body, footer, width = 480, onClose, dismissOnEsc = true, dismissOnBackdrop = true }) {
  const root = document.getElementById('modal-root');
  const backdrop = el('div', { class: 'modal-backdrop' });
  const card = el('div', { class: 'modal-card', style: { width: `${width}px` } });
  const header = el('div', { class: 'modal-header' }, [
    el('div', { class: 'modal-title', text: title || '' }),
    el('button', { class: 'modal-close', html: '&times;', onclick: () => close() })
  ]);
  const bodyEl = el('div', { class: 'modal-body' });
  if (body) bodyEl.appendChild(body);
  const footerEl = el('div', { class: 'modal-footer' });
  if (footer) footerEl.appendChild(footer);
  card.append(header, bodyEl, footerEl);
  backdrop.appendChild(card);
  root.appendChild(backdrop);

  function close() {
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
    onClose?.();
  }
  function onKey(e) { if (dismissOnEsc && e.key === 'Escape') close(); }
  document.addEventListener('keydown', onKey);
  backdrop.addEventListener('click', (e) => { if (dismissOnBackdrop && e.target === backdrop) close(); });

  return { node: card, body: bodyEl, footer: footerEl, close };
}

export function field(labelText, control) {
  return el('label', { class: 'field' }, [el('span', { text: labelText }), control]);
}

export function input(attrs = {}) {
  return el('input', Object.assign({ type: 'text', class: 'control' }, attrs));
}

export function select(options, attrs = {}) {
  const sel = el('select', Object.assign({ class: 'control' }, attrs));
  for (const o of options) sel.appendChild(el('option', { value: o.value, text: o.label, selected: o.selected }));
  return sel;
}

export function textarea(attrs = {}) {
  return el('textarea', Object.assign({ class: 'control', rows: 6 }, attrs));
}

export function btn(label, { primary = false, onClick } = {}) {
  return el('button', { class: `btn ${primary ? 'btn-primary' : ''}`, text: label, onclick: onClick });
}

export function notice(text, kind = 'info') {
  return el('div', { class: `notice notice-${kind}`, text });
}

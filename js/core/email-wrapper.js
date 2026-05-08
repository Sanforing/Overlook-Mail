import { el, fillTemplate } from './utils.js';

/**
 * Renders the visible "real email" wrapper around an app. The body contains
 * the template greeting + filler paragraphs (so the user must scroll down
 * before reaching the embedded app), then the signature, then a fake
 * "Attachment" container that hosts the app.
 *
 * Returns: { node, hostEl, headerEl, bodyEl } so the caller can mount an app
 * into hostEl, and toggle visibility of hostEl for boss mode.
 */
export function buildEmailView({ app, settings, templates }) {
  const tplKey = app.template || 'default';
  const tpl = templates.templates[tplKey] || templates.templates.default;

  const ctx = {
    recipient: app.recipient || settings.user.displayName,
    subject: app.subject || '(no subject)',
    senderName: app.sender?.name || 'Unknown',
    senderTitle: app.sender?.title || '',
    senderCompany: app.sender?.company || settings.user.company || '',
    senderEmail: app.sender?.email || '',
    date: app.date || ''
  };

  const greetingHtml = fillTemplate(tpl.greetingHtml, ctx);
  const signatureText = fillTemplate(tpl.signatureText, ctx);

  const fillerHtml = (templates.filler || [])
    .map(p => `<p>${escapeHtml(p)}</p>`).join('');

  const headerEl = el('div', { class: 'email-meta' }, [
    el('div', { class: 'pic', text: initialsOf(ctx.senderName) }),
    el('div', { class: 'meta-text' }, [
      el('div', { class: 'from', text: `${ctx.senderName} <${ctx.senderEmail || 'noreply@contoso.com'}>` }),
      el('div', { class: 'to', text: `To: ${ctx.recipient} <${settings.user.email}>` }),
      el('div', { class: 'date', text: ctx.date })
    ])
  ]);

  const bodyEl = el('div', { class: 'email-body' }, [
    el('div', { html: greetingHtml }),
    el('div', { html: fillerHtml }),
    el('pre', { class: 'signature', text: signatureText })
  ]);

  const hostEl = el('div', { class: `app-host mono-${app.monochrome || 'none'}` });

  const attachments = el('div', { class: 'attachments' }, [
    el('h4', { text: 'Attachments (1)' }),
    el('div', { class: 'attachment-shell' }, [
      el('div', { class: 'att-header' }, [
        el('span', { class: 'icon', text: extLabel(app) }),
        el('span', { text: attachmentName(app) }),
        el('span', { style: { marginLeft: 'auto', color: 'var(--text-secondary)', fontSize: '12px' }, text: 'Preview' })
      ]),
      el('div', { class: 'att-body' }, [hostEl])
    ])
  ]);

  const node = el('div', { class: 'email-view' }, [
    el('h1', { class: 'email-subject', text: ctx.subject }),
    headerEl,
    bodyEl,
    attachments
  ]);

  return { node, hostEl, headerEl, bodyEl, attachmentsEl: attachments };
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

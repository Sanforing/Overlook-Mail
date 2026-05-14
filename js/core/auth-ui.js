import { openModal, field, input, btn, notice } from './modal.js';
import { el } from './utils.js';
import { t } from './i18n.js';

export function showAuth(state, { onSignedIn } = {}) {
  let mode = 'login'; // | 'register'
  const body = el('div');
  const status = el('div', { class: 'auth-status' });

  function render() {
    body.innerHTML = '';
    body.append(
      oauthRow(state, status, onSignedIn, () => m.close()),
      el('div', { class: 'auth-divider', text: t('authOr') }),
      el('div', { class: 'auth-tabs' }, [
        el('button', { class: `tab ${mode === 'login' ? 'active' : ''}`, text: t('tabSignIn'), onclick: () => { mode = 'login'; render(); } }),
        el('button', { class: `tab ${mode === 'register' ? 'active' : ''}`, text: t('tabCreateAccount'), onclick: () => { mode = 'register'; render(); } })
      ]),
      form()
    );
    refreshProviders(state, body).catch(() => {});
  }

  function form() {
    const wrap = el('form', { class: 'auth-form' });
    const email = input({ type: 'email', placeholder: 'name@example.com', required: true });
    const pass  = input({ type: 'password', placeholder: t('fieldPassword'), required: true, minlength: '4' });
    const name  = mode === 'register' ? input({ type: 'text', placeholder: t('fieldDisplayName'), required: true }) : null;
    const isLocalDev = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
    const tier  = (mode === 'register' && isLocalDev) ? el('select', { class: 'control' }, [
      el('option', { value: 'free', text: t('tierFree') }),
      el('option', { value: 'paid', text: t('tierPaid') })
    ]) : null;

    wrap.append(field(t('fieldEmail'), email), field(t('fieldPassword'), pass));
    if (name) wrap.append(field(t('fieldDisplayName'), name));
    if (tier) wrap.append(field(t('fieldTier'), tier));
    wrap.append(status);

    const submit = btn(mode === 'login' ? t('tabSignIn') : t('tabCreateAccount'), { primary: true });
    submit.type = 'submit';
    wrap.append(el('div', { class: 'modal-actions' }, [submit]));

    wrap.addEventListener('submit', async (e) => {
      e.preventDefault();
      submit.disabled = true; status.textContent = '';
      try {
        if (mode === 'register') {
          const ok = await showDisclaimer();
          if (!ok) { submit.disabled = false; return; }
        }
        const u = mode === 'login'
          ? await state.backend.login({ email: email.value.trim(), password: pass.value })
          : await state.backend.register({ email: email.value.trim(), password: pass.value, displayName: name.value.trim(), tier: tier?.value ?? 'free' });
        if (mode === 'register') {
          // Mark this user as needing the tutorial (consumed by onSignedIn caller).
          u.__justRegistered = true;
        }
        m.close();
        onSignedIn?.(u);
      } catch (err) {
        status.appendChild(notice(err.message, 'error'));
      } finally { submit.disabled = false; }
    });
    return wrap;
  }

  const m = openModal({ title: t('authTitle'), body, width: 420 });
  render();
}

/* --- OAuth buttons (only shown when backend exposes them) --- */

function oauthRow(state, status, onSignedIn, closeModal) {
  const row = el('div', { class: 'oauth-row' });
  const backend = state.backend;
  if (typeof backend.oauthStartUrl !== 'function') {
    row.style.display = 'none';
    return row;
  }
  const make = (id, label, color) => el('button', {
    type: 'button',
    class: `btn oauth-btn oauth-${id}`,
    style: { background: color, color: '#fff', borderColor: color },
    text: label,
    onclick: () => startOAuth(state, id, status, onSignedIn, closeModal)
  });
  row.append(
    make('google',   t('btnContinueGoogle'),   '#4285f4'),
    make('linkedin', t('btnContinueLinkedIn'), '#0a66c2'),
    make('x',        t('btnContinueX'),        '#000000')
  );
  return row;
}

async function refreshProviders(state, body) {
  const row = body.querySelector('.oauth-row');
  const divider = body.querySelector('.auth-divider');
  if (!row || row.style.display === 'none') { if (divider) divider.style.display = 'none'; return; }
  let providers = null;
  try {
    if (typeof state.backend.meta === 'function') {
      const meta = await state.backend.meta();
      providers = meta && meta.providers;
    }
  } catch {}
  if (providers) {
    for (const id of ['google', 'linkedin', 'x']) {
      if (!providers[id]) row.querySelector(`.oauth-${id}`)?.remove();
    }
  }
  if (!row.children.length) {
    row.style.display = 'none';
    if (divider) divider.style.display = 'none';
  }
}

function startOAuth(state, provider, status, onSignedIn, closeModal) {
  const url = state.backend.oauthStartUrl(provider);
  const popup = window.open(url, 'sb_oauth', 'width=520,height=640,menubar=no,toolbar=no');
  if (!popup) {
    status.appendChild(notice('Popup blocked — allow popups and try again.', 'error'));
    return;
  }
  function onMessage(e) {
    const d = e.data;
    if (!d || d.source !== 'stealthbox-oauth') return;
    window.removeEventListener('message', onMessage);
    if (!d.ok) {
      status.appendChild(notice(`Sign-in failed: ${d.error || 'unknown'}`, 'error'));
      return;
    }
    if (typeof state.backend.invalidateUser === 'function') state.backend.invalidateUser();
    state.backend.currentUser().then(u => {
      closeModal();
      onSignedIn?.(u);
    });
  }
  window.addEventListener('message', onMessage);
}

/* --- Disclaimer modal (shown before account creation) --- */
function showDisclaimer() {
  return new Promise((resolve) => {
    let settled = false;
    // IMPORTANT: settle BEFORE calling m.close(), because openModal will fire
    // its own onClose hook which would otherwise resolve(false) first and
    // make the agree button look like decline.
    const finish = (ok) => { if (settled) return; settled = true; resolve(ok); };
    const body = el('div', { class: 'disclaimer-body' }, [
      el('pre', { class: 'disclaimer-text', text: t('disclaimerBody') })
    ]);
    const decline = btn(t('disclaimerDecline'), { onClick: () => { finish(false); m.close(); } });
    const agree   = btn(t('disclaimerAgree'),   { primary: true, onClick: () => { finish(true);  m.close(); } });
    const m = openModal({
      title: t('disclaimerTitle'),
      body,
      footer: el('div', { class: 'modal-actions' }, [decline, agree]),
      width: 520,
      onClose: () => finish(false)
    });
  });
}

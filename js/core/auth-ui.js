import { openModal, field, input, btn, notice } from './modal.js';
import { el } from './utils.js';

export function showAuth(state, { onSignedIn } = {}) {
  let mode = 'login'; // | 'register'
  const body = el('div');
  const status = el('div', { class: 'auth-status' });

  function render() {
    body.innerHTML = '';
    body.append(
      oauthRow(state, status, onSignedIn, () => m.close()),
      el('div', { class: 'auth-divider', text: 'or' }),
      el('div', { class: 'auth-tabs' }, [
        el('button', { class: `tab ${mode === 'login' ? 'active' : ''}`, text: 'Sign in', onclick: () => { mode = 'login'; render(); } }),
        el('button', { class: `tab ${mode === 'register' ? 'active' : ''}`, text: 'Create account', onclick: () => { mode = 'register'; render(); } })
      ]),
      form()
    );
    refreshProviders(state, body).catch(() => {});
  }

  function form() {
    const wrap = el('form', { class: 'auth-form' });
    const email = input({ type: 'email', placeholder: 'name@contoso.com', required: true });
    const pass  = input({ type: 'password', placeholder: 'Password', required: true, minlength: '4' });
    const name  = mode === 'register' ? input({ type: 'text', placeholder: 'Display name', required: true }) : null;
    const tier  = mode === 'register' ? el('select', { class: 'control' }, [
      el('option', { value: 'free', text: 'Free' }),
      el('option', { value: 'paid', text: 'Paid (demo: instant upgrade)' })
    ]) : null;

    wrap.append(field('Email', email), field('Password', pass));
    if (name) wrap.append(field('Display name', name));
    if (tier) wrap.append(field('Tier', tier));
    wrap.append(status);

    const submit = btn(mode === 'login' ? 'Sign in' : 'Create account', { primary: true });
    submit.type = 'submit';
    wrap.append(el('div', { class: 'modal-actions' }, [submit]));

    wrap.addEventListener('submit', async (e) => {
      e.preventDefault();
      submit.disabled = true; status.textContent = '';
      try {
        const u = mode === 'login'
          ? await state.backend.login({ email: email.value.trim(), password: pass.value })
          : await state.backend.register({ email: email.value.trim(), password: pass.value, displayName: name.value.trim(), tier: tier.value });
        m.close();
        onSignedIn?.(u);
      } catch (err) {
        status.appendChild(notice(err.message, 'error'));
      } finally { submit.disabled = false; }
    });
    return wrap;
  }

  const m = openModal({ title: 'Outlook account', body, width: 420 });
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
    make('google',   'Continue with Google',   '#4285f4'),
    make('linkedin', 'Continue with LinkedIn', '#0a66c2')
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
    for (const id of ['google', 'linkedin']) {
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

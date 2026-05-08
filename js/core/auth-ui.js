import { openModal, field, input, btn, notice } from './modal.js';
import { el } from './utils.js';

export function showAuth(state, { onSignedIn } = {}) {
  let mode = 'login'; // | 'register'
  const body = el('div');
  const status = el('div', { class: 'auth-status' });

  function render() {
    body.innerHTML = '';
    body.append(
      el('div', { class: 'auth-tabs' }, [
        el('button', { class: `tab ${mode === 'login' ? 'active' : ''}`, text: 'Sign in', onclick: () => { mode = 'login'; render(); } }),
        el('button', { class: `tab ${mode === 'register' ? 'active' : ''}`, text: 'Create account', onclick: () => { mode = 'register'; render(); } })
      ]),
      form()
    );
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

import { openModal, field, input, select, textarea, btn, notice } from './modal.js';
import { el } from './utils.js';
import { canUse } from './backend.js';
import { showAuth } from './auth-ui.js';

const MONOCHROME = [
  { value: 'none',      label: 'None' },
  { value: 'grayscale', label: 'Greyscale' },
  { value: 'sepia',     label: 'Sepia (paper)' },
  { value: 'blue',      label: 'Outlook blue tint' },
  { value: 'green',     label: 'Old terminal green' }
];

export function showCompose(state, { onCreated } = {}) {
  const me = state.user;
  if (!me) { showAuth(state, { onSignedIn: () => showCompose(state, { onCreated }) }); return; }

  const cores = state.settings.emulator?.cores || [];
  let mode = 'novel';

  const subject = input({ placeholder: 'Subject', required: true });
  const senderName = input({ placeholder: 'Sender name', value: state.settings.user.company ? `${state.settings.user.company} HR` : 'IT Support' });
  const senderTitle = input({ placeholder: 'Sender title', value: 'Senior Manager' });
  const visibility = select([
    { value: 'private', label: 'Private (only me)', selected: true },
    { value: 'public',  label: 'Public (searchable in Community)' }
  ]);
  const monochrome = select(MONOCHROME);
  const folder = select((state.folders || []).map(f => ({ value: f.id, label: f.name, selected: f.id === 'mine' })));

  // ----- Mode-specific fields -----
  const novelText = textarea({ placeholder: 'Paste novel/article text here…' });
  const novelFile = input({ type: 'file', accept: '.txt,text/plain' });
  const gameUrl   = input({ type: 'url', placeholder: 'https://itch.io/embed-upload/…' });
  const romFile   = input({ type: 'file', accept: '.gba,.gb,.gbc,.nes,.smc,.sfc,.md,.gen,.smd,.n64,.z64,.iso,.cue,.zip' });
  const romCore   = select(cores.map(c => ({ value: c.id, label: c.label })));

  const status = el('div');

  function modeBody() {
    if (mode === 'novel') {
      const paidNotice = canUse(me, 'novelUpload', state.settings) ? null
        : notice('Free tier: paste text below. Upload .txt/.epub requires Paid.', 'warn');
      return el('div', null, [
        paidNotice,
        field('Paste text', novelText),
        canUse(me, 'novelUpload', state.settings) ? field('…or upload a file', novelFile) : null
      ]);
    }
    if (mode === 'game-url') {
      return el('div', null, [
        notice('Any URL that can be embedded in an iframe (CSP/X-Frame-Options of the target apply).', 'info'),
        field('Game URL', gameUrl)
      ]);
    }
    if (mode === 'game-rom') {
      if (!canUse(me, 'romUpload', state.settings)) {
        return el('div', null, [notice('ROM upload requires a Paid account. Upgrade in the avatar menu.', 'error')]);
      }
      return el('div', null, [
        notice('You are responsible for the legality of any ROM you upload. Do not upload content you do not own.', 'warn'),
        field('Emulator core', romCore),
        field('ROM file', romFile)
      ]);
    }
  }

  // ----- Layout -----
  const body = el('div', { class: 'compose' });
  const tabs = el('div', { class: 'compose-tabs' }, [
    tab('novel', 'Novel'),
    tab('game-url', 'Game (URL)'),
    tab('game-rom', 'Game (ROM)')
  ]);
  const dynamic = el('div');
  function tab(id, label) {
    const t = el('button', { class: `tab ${mode === id ? 'active' : ''}`, text: label, onclick: () => { mode = id; refresh(); } });
    return t;
  }
  function refresh() {
    tabs.querySelectorAll('.tab').forEach((t, i) => t.classList.toggle('active', ['novel','game-url','game-rom'][i] === mode));
    dynamic.innerHTML = ''; dynamic.appendChild(modeBody());
  }
  refresh();

  body.append(
    tabs,
    field('Subject', subject),
    el('div', { class: 'row' }, [field('Sender name', senderName), field('Sender title', senderTitle)]),
    el('div', { class: 'row' }, [field('Folder', folder), field('Visibility', visibility), field('Monochrome filter', monochrome)]),
    dynamic,
    status
  );

  const submit = btn('Send to my Inbox', { primary: true });
  const cancel = btn('Cancel', { onClick: () => m.close() });
  const m = openModal({ title: 'New mail', body, footer: el('div', { class: 'modal-actions' }, [cancel, submit]), width: 640 });

  submit.addEventListener('click', async () => {
    submit.disabled = true; status.textContent = '';
    try {
      const base = {
        subject: subject.value.trim() || '(no subject)',
        sender: { name: senderName.value.trim() || me.displayName, email: me.email, title: senderTitle.value.trim(), company: state.settings.user.company || '' },
        recipient: state.settings.user.displayName || me.displayName,
        folder: folder.value,
        visibility: visibility.value,
        monochrome: monochrome.value,
        date: 'Today'
      };
      let mail;
      if (mode === 'novel') {
        const cfg = { fontSize: 14, wordsPerPage: 280 };
        if (canUse(me, 'novelUpload', state.settings) && novelFile.files?.[0]) {
          const f = novelFile.files[0];
          const stored = await state.backend.putBlob(f);
          cfg.sourceFileId = stored.id;
          base.preview = `Attached: ${f.name}`;
        } else {
          const text = novelText.value;
          if (!text.trim()) throw new Error('Provide text or upload a file.');
          cfg.text = text;
          base.preview = text.slice(0, 80).replace(/\s+/g, ' ');
        }
        mail = await state.backend.create(Object.assign(base, { type: 'local', entry: 'apps/novel-reader/index.js', config: cfg }));
      } else if (mode === 'game-url') {
        const url = gameUrl.value.trim();
        if (!/^https?:\/\//i.test(url)) throw new Error('Enter a valid http(s) URL.');
        base.preview = `Embedded: ${url}`;
        mail = await state.backend.create(Object.assign(base, { type: 'iframe', url, config: {} }));
      } else if (mode === 'game-rom') {
        if (!canUse(me, 'romUpload', state.settings)) throw new Error('ROM upload requires Paid.');
        const f = romFile.files?.[0];
        if (!f) throw new Error('Pick a ROM file.');
        const stored = await state.backend.putBlob(f);
        base.preview = `ROM: ${f.name} (${romCore.value})`;
        mail = await state.backend.create(Object.assign(base, { type: 'emulator', config: { fileId: stored.id, core: romCore.value, name: f.name } }));
      }
      m.close();
      onCreated?.(mail);
    } catch (err) {
      status.appendChild(notice(err.message, 'error'));
    } finally { submit.disabled = false; }
  });
}

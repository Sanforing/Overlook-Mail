import { openModal, field, input, select, textarea, btn, notice } from './modal.js';
import { el } from './utils.js';
import { showAuth } from './auth-ui.js';
import { runOnceTutorial, runComposeTutorial } from './tutorial.js';
import { t, getLang } from './i18n.js';
import { parseEpubBlob, isEpubSource } from './epub.js';
import { driveDownloadToLocal } from './drive-helper.js';

function monochromeOptions() {
  return [
    { value: 'none',      label: t('monoNone') },
    { value: 'grayscale', label: t('monoGray') },
    { value: 'sepia',     label: t('monoSepia') },
    { value: 'blue',      label: t('monoBlue') },
    { value: 'green',     label: t('monoGreen') }
  ];
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function langSuffix(mailLang) {
  if (mailLang === 'cht') return 'Cht';
  if (mailLang === 'ja') return 'Ja';
  return '';
}

function localizedList(templates, baseKey, mailLang, fallback) {
  const suffix = langSuffix(mailLang);
  return (suffix && templates[`${baseKey}${suffix}`]) || templates[baseKey] || fallback;
}

function resolveSubject(raw, templates, camouflage, mailLang) {
  const keyword = raw.trim();
  if (!keyword) {
    const list = localizedList(templates, 'defaultSubjects', mailLang, ['(no subject)']);
    return pick(list);
  }
  if (!camouflage) return keyword;
  const wrappers = localizedList(templates, 'subjectWrappers', mailLang, []);
  if (!wrappers.length) return keyword;
  return pick(wrappers).replace('{keyword}', keyword);
}

function textFileFromContent(text, name = 'novel.txt') {
  return new File([text], name, { type: 'text/plain' });
}

export function showCompose(state, { onCreated } = {}) {
  const me = state.user;
  if (!me) { showAuth(state, { onSignedIn: () => showCompose(state, { onCreated }) }); return; }

  const cores = state.settings.emulator?.cores || [];
  const tpls = state.templates || {};
  let mode = 'novel';
  let mailLang = getLang(); // default mail language matches UI language

  // Resolved sender pools (language-aware)
  function senderNames() {
    return localizedList(tpls, 'defaultSenderNames', mailLang, ['IT Support']);
  }
  function senderTitles() {
    return localizedList(tpls, 'defaultSenderTitles', mailLang, ['Senior Manager']);
  }

  const subject = input({ placeholder: `e.g. "${pick(tpls.defaultSubjects || ['Project update'])}" (leave blank for random)` });
  const camoCheck = el('input', { type: 'checkbox', id: 'camo-toggle', checked: true, title: t('camoLabel') });
  camoCheck.checked = true;
  const camoLabel = el('label', { class: 'camo-toggle', htmlFor: 'camo-toggle' }, [camoCheck, el('span', { text: t('camoLabel') })]);
  const senderName = input({ placeholder: `leave blank for random (e.g. ${pick(senderNames())})` });
  const senderTitle = input({ placeholder: `leave blank for random (e.g. ${pick(senderTitles())})` });
  const visibility = select([
    { value: 'private', label: t('visPrivate'), selected: true },
    { value: 'public',  label: t('visCommunity') }
  ]);
  const monochrome = select(monochromeOptions());
  const mailLangSel = select([
    { value: 'en',  label: t('langEn'),  selected: mailLang === 'en' },
    { value: 'cht', label: t('langCht'), selected: mailLang === 'cht' },
    { value: 'ja',  label: t('langJa'),  selected: mailLang === 'ja' }
  ]);
  mailLangSel.addEventListener('change', () => { mailLang = mailLangSel.value; });
  const folder = select((state.folders || []).map(f => ({
    value: f.id,
    label: f.custom ? f.name : (t('folder_' + f.id) || f.name),
    selected: f.id === 'mine'
  })));

  // ----- Mode-specific fields -----
  const novelText = textarea({ placeholder: t('placeholderNovel') });
  const novelFile = input({ type: 'file', accept: '.txt,.epub,text/plain,application/epub+zip' });
  const novelDriveUrl = input({ type: 'url', placeholder: 'https://drive.google.com/file/d/…/view' });
  const gameUrl   = input({ type: 'url', placeholder: 'https://itch.io/embed-upload/…' });
  const videoUrl  = input({ type: 'url', placeholder: 'https://www.youtube.com/watch?v=…' });
  const romFile     = input({ type: 'file', accept: '.gba,.gb,.gbc,.nes,.smc,.sfc,.md,.gen,.smd,.n64,.z64,.iso,.cue,.zip' });
  const romDriveUrl = input({ type: 'url', placeholder: 'https://drive.google.com/file/d/…/view' });
  const romCore   = select(cores.map(c => ({ value: c.id, label: c.label })));

  const status = el('div');

  function modeBody() {
    if (mode === 'novel') {
      return el('div', null, [
        notice(t('noticeFreeTier'), 'info'),
        field(t('fieldPasteText'), novelText),
        field(t('fieldUploadFile'), novelFile),
        notice(t('noticeDriveNovel'), 'info'),
        field(t('fieldDriveUrl'), novelDriveUrl)
      ]);
    }
    if (mode === 'game-url') {
      return el('div', null, [
        notice(t('noticeIframe'), 'info'),
        field(t('fieldGameUrl'), gameUrl)
      ]);
    }
    if (mode === 'video') {
      return el('div', null, [
        notice(t('noticeVideo'), 'info'),
        field(t('fieldVideoUrl'), videoUrl)
      ]);
    }
    if (mode === 'game-rom') {
      return el('div', null, [
        notice(t('noticeRomLegal'), 'warn'),
        field(t('fieldEmulatorCore'), romCore),
        field(t('fieldRomFile'), romFile),
        notice(t('noticeDriveRom'), 'info'),
        field(t('fieldDriveUrlRom'), romDriveUrl)
      ]);
    }
  }

  // ----- Layout -----
  const body = el('div', { class: 'compose' });
  const tabs = el('div', { class: 'compose-tabs' }, [
    tab('novel', t('tabNovel')),
    tab('game-url', t('tabGameUrl')),
    tab('game-rom', t('tabGameRom')),
    tab('video', t('tabVideo'))
  ]);
  const dynamic = el('div');
  function tab(id, label) {
    const btn = el('button', { class: `tab ${mode === id ? 'active' : ''}`, text: label, onclick: () => { mode = id; refresh(); } });
    return btn;
  }
  function refresh() {
    tabs.querySelectorAll('.tab').forEach((btn, i) => btn.classList.toggle('active', ['novel','game-url','game-rom','video'][i] === mode));
    dynamic.innerHTML = ''; dynamic.appendChild(modeBody());
  }
  refresh();

  const subjectField = el('div', { class: 'field' }, [
    el('div', { class: 'field-label-row' }, [el('span', { text: t('fieldSubject') }), camoLabel]),
    subject
  ]);

  body.append(
    tabs,
    subjectField,
    el('div', { class: 'row' }, [field(t('fieldSenderName'), senderName), field(t('fieldSenderTitle'), senderTitle)]),
    el('div', { class: 'row' }, [field(t('fieldFolder'), folder), field(t('fieldVisibility'), visibility), field(t('fieldMonochrome'), monochrome), field(t('fieldMailLang'), mailLangSel)]),
    dynamic,
    status
  );

  const submit = btn(t('sendInbox'), { primary: true });
  const cancel = btn(t('cancel'), { onClick: () => m.close() });
  const m = openModal({ title: t('composeTitle'), body, footer: el('div', { class: 'modal-actions' }, [cancel, submit]), width: 640 });

  // First-time-only walkthrough of the compose modal.
  runOnceTutorial(state, 'composeTutorialShown', () => runComposeTutorial());

  submit.addEventListener('click', async () => {
    submit.disabled = true; status.textContent = '';
    try {
      const resolvedSubject = resolveSubject(subject.value, tpls, camoCheck.checked, mailLang);
      const resolvedName = senderName.value.trim() || pick(senderNames());
      const resolvedTitle = senderTitle.value.trim() || pick(senderTitles());
      // Visibility rules:
      //  - Local novel content or uploaded ROM → forced PRIVATE because the
      //    bytes live only in this browser.
      //  - Any URL-based mail (game URL, YouTube video, Drive novel) → user choice.
      const isLocalNovel  = mode === 'novel'    && (novelFile.files?.[0] || novelText.value.trim());
      const isDriveNovel   = mode === 'novel'    && novelDriveUrl.value.trim();
      const isUploadedRom  = mode === 'game-rom' && romFile.files?.[0];
      const isDriveRom     = mode === 'game-rom' && romDriveUrl.value.trim();
      let resolvedVisibility = visibility.value;
      // Files cached in browser (local upload or Drive download) → always private.
      if (isLocalNovel || isUploadedRom || isDriveNovel || isDriveRom) resolvedVisibility = 'private';
      const base = {
        subject: resolvedSubject,
        sender: { name: resolvedName, email: me.email, title: resolvedTitle, company: state.settings.user.company || '' },
        recipient: state.settings.user.displayName || me.displayName,
        folder: folder.value,
        visibility: resolvedVisibility,
        monochrome: monochrome.value,
        date: 'Today'
      };
      let mail;
      if (mode === 'novel') {
        // Drive-link path takes precedence over upload/paste. It stores no
        // bytes on our server and still renders through the inline novel
        // reader instead of the attachment iframe preview.
        const driveRaw = novelDriveUrl.value.trim();
        if (driveRaw) {
          const driveId = extractDriveFileId(driveRaw);
          if (!driveId) throw new Error(t('errBadDriveUrl'));
          const backendMeta = await state.backend.meta?.().catch(() => ({})) || {};
          const clientId = backendMeta.googleClientId;
          if (!clientId) throw new Error(t('errNoDriveConfig'));
          status.textContent = t('statusDriveDownloading');
          const stored = await driveDownloadToLocal(driveId, clientId, state.backend);
          base.preview = `Drive novel (cached in browser)`;
          mail = await state.backend.create(Object.assign(base, {
            type: 'local',
            entry: 'apps/novel-reader/index.js',
            config: {
              inlineNovel: true,
              mailLang,
              fontSize: state.settings.display?.mailFontSize || 14,
              wordsPerPage: state.settings.novelMail?.wordsPerPage || 280,
              sourceFileId: stored.id,
              drive: { provider: 'gdrive', fileId: driveId, originalUrl: driveRaw, kind: 'novel' }
            }
          }));
        } else {
          const cfg = {
            inlineNovel: true,
            mailLang,
            fontSize: state.settings.display?.mailFontSize || 14,
            wordsPerPage: state.settings.novelMail?.wordsPerPage || 280
          };
          if (novelFile.files?.[0]) {
            const f = novelFile.files[0];
            let extractedText;
            if (isEpubSource(f.name, f.type)) {
              const doc = await parseEpubBlob(f);
              extractedText = doc.text;
            } else {
              extractedText = await f.text();
            }
            if (!extractedText?.trim()) throw new Error(t('errNoText'));
            const stored = await state.backend.putBlob(textFileFromContent(extractedText, `${f.name}.txt`));
            cfg.sourceFileId = stored.id;
            base.preview = 'Local novel file stored in this browser';
          } else {
            const text = novelText.value;
            if (!text.trim()) throw new Error(t('errNoText'));
            const stored = await state.backend.putBlob(textFileFromContent(text));
            cfg.sourceFileId = stored.id;
            base.preview = 'Local pasted text stored in this browser';
          }
          mail = await state.backend.create(Object.assign(base, { type: 'local', entry: 'apps/novel-reader/index.js', config: cfg }));
        }
      } else if (mode === 'game-url') {
        const url = gameUrl.value.trim();
        if (!/^https?:\/\//i.test(url)) throw new Error(t('errBadUrl'));
        base.preview = `Embedded: ${url}`;
        mail = await state.backend.create(Object.assign(base, { type: 'iframe', url, config: { mailLang } }));
      } else if (mode === 'video') {
        const raw = videoUrl.value.trim();
        const videoId = extractYouTubeId(raw);
        if (!videoId) throw new Error(t('errBadYouTube'));
        // Use the standard YouTube embed. Error 153 can happen when the
        // player does not receive an allowed referrer, so this mail sets a
        // YouTube-friendly referrer policy below.
        const embedUrl = `https://www.youtube.com/embed/${videoId}?rel=0`;
        base.preview = `▶ YouTube: ${raw}`;
        mail = await state.backend.create(Object.assign(base, {
          type: 'iframe',
          url: embedUrl,
          allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
          sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation',
          referrerPolicy: 'strict-origin-when-cross-origin',
          config: { mailLang, video: { provider: 'youtube', videoId, originalUrl: raw } }
        }));
      } else if (mode === 'game-rom') {
        const f = romFile.files?.[0];
        const driveRomRaw = romDriveUrl.value.trim();
        if (!f && !driveRomRaw) throw new Error(t('errNoRom'));
        let stored;
        let driveRomMeta = undefined;
        if (driveRomRaw) {
          const driveId = extractDriveFileId(driveRomRaw);
          if (!driveId) throw new Error(t('errBadDriveUrl'));
          const backendMeta = await state.backend.meta?.().catch(() => ({})) || {};
          const clientId = backendMeta.googleClientId;
          if (!clientId) throw new Error(t('errNoDriveConfig'));
          status.textContent = t('statusDriveDownloading');
          stored = await driveDownloadToLocal(driveId, clientId, state.backend);
          driveRomMeta = { provider: 'gdrive', fileId: driveId, originalUrl: driveRomRaw, kind: 'rom' };
        } else {
          stored = await state.backend.putBlob(f);
        }
        base.preview = `Local ROM stored in this browser (${romCore.value})`;
        const romCfg = { fileId: stored.id, core: romCore.value, name: 'Local ROM', mailLang };
        if (driveRomMeta) romCfg.drive = driveRomMeta;
        mail = await state.backend.create(Object.assign(base, { type: 'emulator', config: romCfg }));
      }
      m.close();
      onCreated?.(mail);
    } catch (err) {
      status.appendChild(notice(err.message, 'error'));
    } finally { submit.disabled = false; }
  });
}

/**
 * Extract a YouTube video ID from any of these forms:
 *   https://www.youtube.com/watch?v=ID
 *   https://youtu.be/ID
 *   https://www.youtube.com/shorts/ID
 *   https://www.youtube.com/embed/ID
 *   raw 11-char ID
 * Returns the ID string or null if not recognised.
 */
function extractYouTubeId(raw) {
  if (!raw) return null;
  const trimmed = raw.trim();
  // Bare 11-char ID
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;
  let url;
  try { url = new URL(trimmed); } catch { return null; }
  const host = url.hostname.replace(/^www\./, '');
  if (host === 'youtu.be') {
    const id = url.pathname.slice(1);
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  }
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') {
      const id = url.searchParams.get('v') || '';
      return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
    }
    const m = url.pathname.match(/^\/(embed|shorts|v|live)\/([A-Za-z0-9_-]{11})/);
    if (m) return m[2];
  }
  return null;
}

/**
 * Extract a Google Drive file ID from any of:
 *   https://drive.google.com/file/d/FILEID/view
 *   https://drive.google.com/file/d/FILEID/preview
 *   https://drive.google.com/open?id=FILEID
 *   https://drive.google.com/uc?id=FILEID&export=download
 *   https://docs.google.com/(document|spreadsheets|presentation)/d/FILEID/edit
 * Returns the ID or null. We do NOT accept arbitrary IDs without a Drive host
 * because that would let users paste arbitrary strings.
 */
function extractDriveFileId(raw) {
  if (!raw) return null;
  let url;
  try { url = new URL(String(raw).trim()); } catch { return null; }
  const host = url.hostname.replace(/^www\./, '');
  if (host !== 'drive.google.com' && host !== 'docs.google.com') return null;
  const m = url.pathname.match(/\/(?:file|document|spreadsheets|presentation)\/d\/([A-Za-z0-9_-]{10,})/);
  if (m) return m[1];
  const id = url.searchParams.get('id') || '';
  return /^[A-Za-z0-9_-]{10,}$/.test(id) ? id : null;
}

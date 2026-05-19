import { openModal, field, input, select, textarea, btn, notice } from './modal.js';
import { el } from './utils.js';
import { showAuth } from './auth-ui.js';
import { runOnceTutorial, runComposeTutorial } from './tutorial.js';
import { t, getLang } from './i18n.js';
import { parseEpubBlob, isEpubSource } from './epub.js';
import { driveDownloadToLocal, pickDriveFile } from './drive-helper.js';

const NOVEL_DRIVE_MIME_TYPES = 'text/plain,application/epub+zip';

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

function driveDownloadUrl(fileId) {
  return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
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
  const novelDrivePick = btn(t('btnPickDrive'));
  const novelDrivePicked = el('div', { class: 'muted', style: { marginTop: '8px' } });
  const gameUrl   = input({ type: 'url', placeholder: 'https://itch.io/embed-upload/…' });
  const videoUrl  = input({ type: 'url', placeholder: 'https://www.youtube.com/watch?v=…' });
  const romFile     = input({ type: 'file', accept: '.gba,.gb,.gbc,.nes,.smc,.sfc,.md,.gen,.smd,.n64,.z64,.iso,.cue,.zip' });
  const romDriveUrl = input({ type: 'url', placeholder: 'https://drive.google.com/file/d/…/view' });
  const romDrivePick = btn(t('btnPickDrive'));
  const romDrivePicked = el('div', { class: 'muted', style: { marginTop: '8px' } });
  const romCore   = select(cores.map(c => ({ value: c.id, label: c.label })));

  let novelPickedDrive = null;
  let romPickedDrive = null;

  const status = el('div');

  function isPrivateFileSourceSelected() {
    if (mode === 'novel') {
      if (novelPickedDrive) return true;
      if (novelDriveUrl.value.trim()) return false;
      return Boolean(novelFile.files?.[0] || novelText.value.trim());
    }
    if (mode === 'game-rom') {
      if (romPickedDrive) return true;
      if (romDriveUrl.value.trim()) return false;
      return Boolean(romFile.files?.[0]);
    }
    return false;
  }

  function updateVisibilityLock() {
    const locked = isPrivateFileSourceSelected();
    if (locked) visibility.value = 'private';
    visibility.disabled = locked;
    visibility.title = locked ? t('visibilityPrivateLocked') : '';
  }

  async function pickerOptions(kind) {
    const backendMeta = await state.backend.meta?.().catch(() => ({})) || {};
    const clientId = backendMeta.googleClientId;
    if (!clientId) throw new Error(t('errNoDriveConfig'));
    return {
      clientId,
      apiKey: backendMeta.googlePicker?.apiKey,
      appId: backendMeta.googlePicker?.appId,
      mimeTypes: kind === 'novel' ? NOVEL_DRIVE_MIME_TYPES : undefined
    };
  }

  novelText.addEventListener('input', updateVisibilityLock);
  novelFile.addEventListener('change', updateVisibilityLock);
  romFile.addEventListener('change', updateVisibilityLock);
  novelDriveUrl.addEventListener('input', updateVisibilityLock);
  romDriveUrl.addEventListener('input', updateVisibilityLock);

  novelDrivePick.addEventListener('click', async () => {
    status.textContent = '';
    novelDrivePick.disabled = true;
    try {
      const picked = await pickDriveFile(await pickerOptions('novel'));
      if (picked) {
        novelPickedDrive = { fileId: picked.id, name: picked.name || 'Drive file', tokenResponse: picked.tokenResponse };
        novelDrivePicked.textContent = `${t('pickedDriveFile')}: ${novelPickedDrive.name}`;
        novelDriveUrl.value = '';
        updateVisibilityLock();
      }
    } catch (err) {
      status.appendChild(notice(err.message, 'error'));
    } finally {
      novelDrivePick.disabled = false;
    }
  });

  romDrivePick.addEventListener('click', async () => {
    status.textContent = '';
    romDrivePick.disabled = true;
    try {
      const picked = await pickDriveFile(await pickerOptions('rom'));
      if (picked) {
        romPickedDrive = { fileId: picked.id, name: picked.name || 'Drive ROM', tokenResponse: picked.tokenResponse };
        romDrivePicked.textContent = `${t('pickedDriveFile')}: ${romPickedDrive.name}`;
        romDriveUrl.value = '';
        updateVisibilityLock();
      }
    } catch (err) {
      status.appendChild(notice(err.message, 'error'));
    } finally {
      romDrivePick.disabled = false;
    }
  });

  function modeBody() {
    if (mode === 'novel') {
      return el('div', null, [
        notice(t('noticeFreeTier'), 'info'),
        field(t('fieldPasteText'), novelText),
        field(t('fieldUploadFile'), novelFile),
        notice(t('noticeDriveNovel'), 'info'),
        field(t('fieldDriveUrl'), novelDriveUrl),
        el('div', { class: 'field' }, [novelDrivePick, novelDrivePicked])
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
        field(t('fieldDriveUrlRom'), romDriveUrl),
        el('div', { class: 'field' }, [romDrivePick, romDrivePicked])
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
    updateVisibilityLock();
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
      //  - Local upload/paste and Drive Picker files are cached in this browser,
      //    so they are always private.
      //  - Pasted Google Drive links are treated as public URL sources, so the
      //    user may choose public/private. Private pasted links will not load.
      const isPublicDriveNovel = mode === 'novel'    && !novelPickedDrive && novelDriveUrl.value.trim();
      const isPublicDriveRom   = mode === 'game-rom' && !romPickedDrive   && romDriveUrl.value.trim();
      const isLocalNovel       = mode === 'novel'    && !isPublicDriveNovel && (novelFile.files?.[0] || novelText.value.trim());
      const isPickedNovel      = mode === 'novel'    && novelPickedDrive;
      const isUploadedRom      = mode === 'game-rom' && !isPublicDriveRom && romFile.files?.[0];
      const isPickedRom        = mode === 'game-rom' && romPickedDrive;
      let resolvedVisibility = visibility.value;
      if (isLocalNovel || isUploadedRom || isPickedNovel || isPickedRom) resolvedVisibility = 'private';
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
        // Drive Picker files are downloaded into browser storage and private.
        // Pasted Drive links are public URL sources and may be shared publicly.
        if (novelPickedDrive) {
          const driveId = novelPickedDrive.fileId;
          const backendMeta = await state.backend.meta?.().catch(() => ({})) || {};
          const clientId = backendMeta.googleClientId;
          if (!clientId) throw new Error(t('errNoDriveConfig'));
          status.textContent = t('statusDriveDownloading');
          const stored = await driveDownloadToLocal(driveId, clientId, state.backend, null, novelPickedDrive.tokenResponse);
          base.preview = `Drive novel cached in this browser`;
          mail = await state.backend.create(Object.assign(base, {
            type: 'local',
            entry: 'apps/novel-reader/index.js',
            config: {
              inlineNovel: true,
              mailLang,
              fontSize: state.settings.display?.mailFontSize || 14,
              wordsPerPage: state.settings.novelMail?.wordsPerPage || 280,
              sourceFileId: stored.id,
              drive: { provider: 'gdrive', fileId: driveId, originalUrl: null, name: novelPickedDrive.name, picked: true, kind: 'novel' }
            }
          }));
        } else {
          const driveRaw = novelDriveUrl.value.trim();
          if (driveRaw) {
            const driveId = extractDriveFileId(driveRaw);
            if (!driveId) throw new Error(t('errBadDriveUrl'));
            const downloadUrl = driveDownloadUrl(driveId);
            base.preview = `Public Drive novel: ${driveRaw}`;
            mail = await state.backend.create(Object.assign(base, {
              type: 'local',
              entry: 'apps/novel-reader/index.js',
              config: {
                inlineNovel: true,
                mailLang,
                fontSize: state.settings.display?.mailFontSize || 14,
                wordsPerPage: state.settings.novelMail?.wordsPerPage || 280,
                source: downloadUrl,
                drive: { provider: 'gdrive', fileId: driveId, originalUrl: driveRaw, downloadUrl, publicLink: true, kind: 'novel' }
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
        if (!f && !driveRomRaw && !romPickedDrive) throw new Error(t('errNoRom'));
        let stored;
        let driveRomMeta = undefined;
        if (romPickedDrive) {
          const driveId = romPickedDrive.fileId;
          const backendMeta = await state.backend.meta?.().catch(() => ({})) || {};
          const clientId = backendMeta.googleClientId;
          if (!clientId) throw new Error(t('errNoDriveConfig'));
          status.textContent = t('statusDriveDownloading');
          stored = await driveDownloadToLocal(driveId, clientId, state.backend, null, romPickedDrive.tokenResponse);
          driveRomMeta = { provider: 'gdrive', fileId: driveId, originalUrl: null, name: romPickedDrive.name, picked: true, kind: 'rom' };
        } else if (driveRomRaw) {
          const driveId = extractDriveFileId(driveRomRaw);
          if (!driveId) throw new Error(t('errBadDriveUrl'));
          const downloadUrl = driveDownloadUrl(driveId);
          base.preview = `Public Drive ROM (${romCore.value})`;
          mail = await state.backend.create(Object.assign(base, {
            type: 'emulator',
            config: {
              url: downloadUrl,
              core: romCore.value,
              name: 'Drive ROM',
              mailLang,
              drive: { provider: 'gdrive', fileId: driveId, originalUrl: driveRomRaw, downloadUrl, publicLink: true, kind: 'rom' }
            }
          }));
          m.close();
          onCreated?.(mail);
          return;
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

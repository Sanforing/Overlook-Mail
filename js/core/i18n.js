/**
 * Minimal i18n module.
 * Supported languages: 'en' (English) and 'cht' (Traditional Chinese / 繁體中文).
 *
 * Usage:
 *   import { t, setLang, getLang } from './i18n.js';
 *   t('newMail')            // → 'New mail' or '新郵件'
 *   setLang('cht');         // switch language
 */

const LOCALES = {
  en: {
    /* ── Topbar ── */
    appLauncher:         'App launcher',
    notifications:       'Notifications',
    settingsBtn:         'Settings',
    searchPlaceholder:   'Search',

    /* ── Avatar menu ── */
    upgradePaid:         'Upgrade to Paid (demo)',
    personalise:         'Personalise…',
    signOut:             'Sign out',
    signInCreate:        'Sign in / Create account',

    /* ── Sidebar ── */
    newMail:             'New mail',
    categories:          'Categories',
    folders:             'Folders',
    allFolders:          'All',

    /* ── List panel ── */
    noItems:             'No items in this view.',
    itemCount:           (n) => `${n} item(s)`,

    /* ── Reader toolbar ── */
    reply:               '↩ Reply',
    replyAll:            '↩↩ Reply all',
    forward:             '➜ Forward',
    deleteMail:          '⌫ Delete',
    labelBtn:            '🏷 Label',
    confirmDelete:       'Delete this mail?',
    selectItem:          'Select an item to read.',

    /* ── Splash ── */
    splashLoading:       'Loading…',
    splashOpen:          'Open Preview',
    splashHint:          'Click the button below to open the attachment preview.',
    splashTypeLocal:     'Interactive Attachment',
    splashTypeIframe:    'Web Embed',
    splashTypeEmulator:  'ROM Emulator',

    /* ── Settings (Personalise) modal ── */
    personaliseTitle:    'Personalise',
    sectionBrand:        'Brand',
    fieldTabTopbar:      'Tab + topbar text',
    fieldSearchPH:       'Search placeholder',
    sectionMailId:       'Mail identity',
    fieldRecipient:      'Receiver name',
    sectionReading:      'Reading',
    fieldNovelLines:     'Novel lines per page',
    fieldMailFont:       'Mail font size',
    fieldUiScale:        'UI scale (%)',
    sectionTheme:        'Theme colours',
    sectionLanguage:     'Language',
    fieldUiLang:         'UI language',
    langEn:              'English',
    langCht:             '繁體中文',
    save:                'Save',
    resetDefaults:       'Reset to defaults',

    /* ── Composer modal ── */
    composeTitle:        'New mail',
    tabNovel:            'Novel',
    tabGameUrl:          'Game (URL)',
    tabGameRom:          'Game (ROM)',
    tabVideo:            'Video',
    fieldVideoUrl:       'YouTube URL',
    noticeVideo:         'Paste any YouTube URL (watch, shorts, or share link). It will be embedded inline. If you are signed in to YouTube in this browser and have YouTube Premium, playback is ad-free; we cannot bypass YouTube ads on your behalf.',
    errBadYouTube:       'Enter a valid YouTube link.',
    fieldDriveUrl:       'Or paste a Google Drive share link (.txt/public text)',
    noticeDriveNovel:    'Tip: paste a public Google Drive text-file link instead of uploading. Set the file to “Anyone with the link” in Drive. We will load it into the same inline email reader, with no upload to our servers.',
    noticeDriveRom:      'Drive links for ROMs are not supported in this version (browsers block cross-origin downloads from Drive). Full Google sign-in support coming later — for now, please upload the ROM file directly.',
    errBadDriveUrl:      'That doesn’t look like a Google Drive share link.',
    fieldSubject:        'Subject',
    camoLabel:           'Camouflage subject',
    fieldSenderName:     'Sender name',
    fieldSenderTitle:    'Sender title',
    fieldFolder:         'Folder',
    fieldVisibility:     'Visibility',
    fieldMonochrome:     'Monochrome filter',
    fieldMailLang:       'Mail language',
    visPrivate:          'Private (only me)',
    visCommunity:        'Public (searchable in Community)',
    monoNone:            'None',
    monoGray:            'Greyscale',
    monoSepia:           'Sepia (paper)',
    monoBlue:            'Overlook Mail blue tint',
    monoGreen:           'Old terminal green',
    fieldPasteText:      'Paste text',
    placeholderNovel:    'Paste novel/article text here…',
    fieldUploadFile:     '…or upload a file',
    fieldGameUrl:        'Game URL',
    fieldEmulatorCore:   'Emulator core',
    fieldRomFile:        'ROM file',
    sendInbox:           'Send to my Inbox',
    cancel:              'Cancel',
    noticeFreeTier:      'Free tier: paste text below. Upload .txt/.epub requires Paid.',
    noticeIframe:        'Any URL that can be embedded in an iframe (CSP/X-Frame-Options of the target apply).',
    noticeRomPaidWall:   'ROM upload requires a Paid account. Upgrade in the avatar menu.',
    noticeRomLegal:      'You are responsible for the legality of any ROM you upload. Do not upload content you do not own.',
    errNoText:           'Provide text or upload a file.',
    errBadUrl:           'Enter a valid http(s) URL.',
    errRomPaid:          'ROM upload requires Paid.',
    errNoRom:            'Pick a ROM file.',

    /* ── Auth modal ── */
    authTitle:           'Overlook Mail account',
    tabSignIn:           'Sign in',
    tabCreateAccount:    'Create account',
    authOr:              'or',
    fieldEmail:          'Email',
    fieldPassword:       'Password',
    fieldDisplayName:    'Display name',
    fieldTier:           'Tier',
    tierFree:            'Free',
    tierPaid:            'Paid (demo: instant upgrade)',
    btnContinueGoogle:   'Continue with Google',
    btnContinueLinkedIn: 'Continue with LinkedIn',

    /* ── Built-in folder names ── */
    folder_inbox:   'Inbox',
    folder_mine:    'Mine',
    folder_drafts:  'Drafts',
    folder_junk:    'Junk Email',
    folder_archive: 'Archive',
    folder_all:     'All',

    /* ── Built-in category names ── */
    cat_admin:     'From Admin',
    cat_community: 'From Community',
    cat_mine:      'Mine',

    /* ── Mailbox manager (settings) ── */
    sectionMailboxes:      'Custom Mailboxes',
    noCustomMailboxes:     'No custom mailboxes yet.',
    addMailbox:            'Add',
    mailboxNameLabel:      'Name',
    mailboxIconLabel:      'Icon',
    mailboxNamePH:         'e.g. Reading Now',
    mailboxIconPH:         '📂',
    deleteMailbox:         'Remove',
    errMailboxNameReq:     'Mailbox name is required.',
    errMailboxNameTaken:   'A mailbox with that name already exists.',

    /* ── Email wrapper ── */
    attachmentsHdr:      (n) => `Attachments (${n})`,
    loadingDoc:          'Loading document text…',
    noSubject:           '(no subject)',

    /* ── Iframe restriction (composer) ── */
    iframeMustBePublic:        'Embedded URLs must be public',
    iframeMustBePublicBody:    'When you embed a third-party URL, the mail is automatically marked Public so others can see what you shared. By posting it you confirm: (a) the link is safe, (b) you have the right to share it, and (c) you take responsibility for the content. Private visibility is not allowed for embedded URLs.',
    visibilityLockedIframe:    'Public (locked: embedded URL)',

    /* ── Reader toolbar (extras) ── */
    acknowledge:               'Acknowledge',
    acknowledged:              'Acknowledged',
    ackCount:                  (n) => `${n}`,
    ackTooltip:                'Tap to mark this mail as acknowledged.',
    forwardTitle:              'Forward to mailbox',
    forwardBody:               'Pick a mailbox in your account. A copy will be saved there.',
    forwardSubmit:             'Save copy',
    forwarded:                 'Saved to mailbox',
    forwardedBadge:            'Forwarded',

    /* ── Comments thread (disguised as Reply) ── */
    commentsHeading:           'Email follow-ups',
    commentsEmpty:             'No replies yet — be the first to add a follow-up.',
    commentsPlaceholder:       'Type a quick follow-up reply…',
    commentsSend:              'Send reply',
    commentsSignInRequired:    'Sign in to add a follow-up reply.',
    commentsPrivateMail:       'Follow-ups are only available on shared mails.',

    /* ── Disclaimer + tutorial ── */
    disclaimerTitle:           'Welcome — please read first',
    disclaimerBody:            'This is a parody webmail-style web app. It is an independent project and is NOT affiliated with any commercial email provider. By creating an account you agree that:\n\n• You will not upload illegal, harmful, or copyrighted content you do not own.\n• Any URL you embed (and any mail marked Public) is publicly visible to other users; you are solely responsible for what you share.\n• Your data is stored securely on our servers. You may delete your account and all associated data at any time.\n• You will respect other users — no harassment, spam, or abuse.',
    disclaimerAgree:           'I have read and agree',
    disclaimerDecline:         'Cancel',
    tutorialNext:              'Next',
    tutorialPrev:              'Back',
    tutorialDone:              'Got it',
    tutorialSkip:              'Skip tour',
    tutorialStep1Title:        'Create a new mail',
    tutorialStep1Body:         'Click here to compose a new mail. You can paste a novel, embed a game URL, or upload a ROM.',
    tutorialStep2Title:        'Your folders',
    tutorialStep2Body:         'Mails you create or save go here. The "All" view shows everything you own across folders.',
    tutorialStep3Title:        'Custom mailboxes',
    tutorialStep3Body:         'Add your own mailboxes (e.g. "Reading Now") and choose an icon for each.',
    tutorialStep4Title:        'Reader actions',
    tutorialStep4Body:         'Open any mail to acknowledge it, post follow-up replies, or save a copy to one of your folders.',

    /* ── First-time compose tutorial ── */
    compTutTabsTitle:    'Pick a content type',
    compTutTabsBody:     'Use the tabs to choose what to attach: Novel (paste/upload long text), Game (URL) (embed a website), or Game (ROM) (upload a ROM file).',
    compTutSubjectTitle: 'Subject (with camouflage)',
    compTutSubjectBody:  'Type a real keyword. With camouflage on, we wrap it inside an office-style subject like "FW: {keyword} — please review" so the mail looks like a normal work email.',
    compTutMetaTitle:    'Sender, folder, visibility',
    compTutMetaBody:     'Sender name/title can be left blank for a random office identity. Pick which folder to store the mail in. Visibility = Private (only you) or Public (others can see). Embedded URLs are forced public; uploaded files are forced private.',
    compTutContentTitle: 'Add your content',
    compTutContentBody:  'Paste novel text, paste a game URL, or upload a ROM file. The content is rendered inside a fake "attachment" block under the email body.',
    compTutSendTitle:    'Send to your inbox',
    compTutSendBody:     'Click here to save the mail. It appears at the top of your selected folder and opens like any other email.',

    /* ── First-time novel-mail tutorial ── */
    novTutPagesTitle:    'Reading a novel mail',
    novTutPagesBody:     'The novel renders inline inside the email body, paginated like a corporate document. Use the ◀ Previous page / Next page ▶ buttons, or simply press the ← → arrow keys on your keyboard to flip between pages without scrolling.',
    novTutToolbarTitle:  'Page indicator (compare with sent-time)',
    novTutToolbarBody:   'In a regular mail the top-right of the header shows the sent time. In a novel mail that spot is taken over by a live page counter — "Page X of Y". Click it to open a quick-jump toolbox where you can skip directly to any page or drop a bookmark so you can pick up exactly where you left off.',

    /* ── All-folder hint ── */
    allFolderHint:             'Mails in your folders (created or saved by you).',
  },

  cht: {
    /* ── Topbar ── */
    appLauncher:         '應用程式啟動器',
    notifications:       '通知',
    settingsBtn:         '設定',
    searchPlaceholder:   '搜尋',

    /* ── Avatar menu ── */
    upgradePaid:         '升級至付費版（示範）',
    personalise:         '個人化…',
    signOut:             '登出',
    signInCreate:        '登入 / 建立帳戶',

    /* ── Sidebar ── */
    newMail:             '新郵件',
    categories:          '類別',
    folders:             '資料夾',
    allFolders:          '全部',

    /* ── List panel ── */
    noItems:             '此檢視沒有任何項目。',
    itemCount:           (n) => `${n} 個項目`,

    /* ── Reader toolbar ── */
    reply:               '↩ 回覆',
    replyAll:            '↩↩ 全部回覆',
    forward:             '➜ 轉寄',
    deleteMail:          '⌫ 刪除',
    labelBtn:            '🏷 標籤',
    confirmDelete:       '確定要刪除此郵件嗎？',
    selectItem:          '請選擇一個項目以閱讀。',

    /* ── Splash ── */
    splashLoading:       '載入中…',
    splashOpen:          '開啟預覽',
    splashHint:          '點擊下方按鈕以開啟附件預覽。',
    splashTypeLocal:     '互動式附件',
    splashTypeIframe:    '網頁嵌入',
    splashTypeEmulator:  'ROM 模擬器',

    /* ── Settings (Personalise) modal ── */
    personaliseTitle:    '個人化',
    sectionBrand:        '品牌',
    fieldTabTopbar:      '分頁 + 頂欄文字',
    fieldSearchPH:       '搜尋提示文字',
    sectionMailId:       '郵件身份',
    fieldRecipient:      '收件人姓名',
    sectionReading:      '閱讀',
    fieldNovelLines:     '每頁行數',
    fieldMailFont:       '郵件字型大小',
    fieldUiScale:        '介面縮放（%）',
    sectionTheme:        '主題色彩',
    sectionLanguage:     '語言',
    fieldUiLang:         '介面語言',
    langEn:              'English',
    langCht:             '繁體中文',
    save:                '儲存',
    resetDefaults:       '重設為預設值',

    /* ── Composer modal ── */
    composeTitle:        '新郵件',
    tabNovel:            '小說',
    tabGameUrl:          '遊戲（URL）',
    tabGameRom:          '遊戲（ROM）',
    tabVideo:            '影片',
    fieldVideoUrl:       'YouTube 網址',
    noticeVideo:         '貼上任何 YouTube 網址（watch、Shorts 或分享連結），即會內嵌播放。若你在此瀏覽器已登入 YouTube 並擁有 YouTube Premium，播放即為無廣告；我們無法代為跳過 YouTube 廣告。',
    errBadYouTube:       '請輸入有效的 YouTube 連結。',
    fieldDriveUrl:       '或貼上 Google Drive 分享連結（.txt／公開文字檔）',
    noticeDriveNovel:    '提示：可以不上傳檔案，改為貼上公開的 Google Drive 文字檔連結。請在 Drive 將該檔案設為「知道連結的任何人」。我們會載入到同一個內嵌郵件閱讀器，不需上傳至我們伺服器。',
    noticeDriveRom:      '本版本不支援以 Drive 連結載入 ROM（瀏覽器會拦截跨網域下載）。完整的 Google 登入支援將于未來推出——目前請直接上傳 ROM 檔案。',
    errBadDriveUrl:      '此連結看起來不是 Google Drive 分享連結。',
    fieldSubject:        '主旨',
    camoLabel:           '偽裝主旨',
    fieldSenderName:     '寄件人姓名',
    fieldSenderTitle:    '寄件人職稱',
    fieldFolder:         '資料夾',
    fieldVisibility:     '可見性',
    fieldMonochrome:     '單色濾鏡',
    fieldMailLang:       '郵件語言',
    visPrivate:          '私人（僅限我）',
    visCommunity:        '公開（可在社群中搜尋）',
    monoNone:            '無',
    monoGray:            '灰階',
    monoSepia:           '復古棕（紙張）',
    monoBlue:            'Overlook Mail 藍色調',
    monoGreen:           '舊終端機綠',
    fieldPasteText:      '貼上文字',
    placeholderNovel:    '在此貼上小說／文章文字…',
    fieldUploadFile:     '…或上傳檔案',
    fieldGameUrl:        '遊戲網址',
    fieldEmulatorCore:   '模擬器核心',
    fieldRomFile:        'ROM 檔案',
    sendInbox:           '傳送至我的收件匣',
    cancel:              '取消',
    noticeFreeTier:      '免費版：在下方貼上文字。上傳 .txt/.epub 需要付費版。',
    noticeIframe:        '任何可嵌入 iframe 的網址（目標的 CSP/X-Frame-Options 規則適用）。',
    noticeRomPaidWall:   '上傳 ROM 需要付費帳戶。請在大頭貼選單中升級。',
    noticeRomLegal:      '您需對上傳的任何 ROM 合法性負責。請勿上傳您不擁有的內容。',
    errNoText:           '請提供文字或上傳檔案。',
    errBadUrl:           '請輸入有效的 http(s) 網址。',
    errRomPaid:          '上傳 ROM 需要付費版。',
    errNoRom:            '請選擇 ROM 檔案。',

    /* ── Auth modal ── */
    authTitle:           'Overlook Mail 帳戶',
    tabSignIn:           '登入',
    tabCreateAccount:    '建立帳戶',
    authOr:              '或',
    fieldEmail:          '電子郵件',
    fieldPassword:       '密碼',
    fieldDisplayName:    '顯示名稱',
    fieldTier:           '方案',
    tierFree:            '免費',
    tierPaid:            '付費（示範：立即升級）',
    btnContinueGoogle:   '使用 Google 繼續',
    btnContinueLinkedIn: '使用 LinkedIn 繼續',

    /* ── Built-in folder names ── */
    folder_inbox:   '收件匣',
    folder_mine:    '我的',
    folder_drafts:  '草稿',
    folder_junk:    '垃圾郵件',
    folder_archive: '封存',
    folder_all:     '全部',

    /* ── Built-in category names ── */
    cat_admin:     '管理員郵件',
    cat_community: '社群郵件',
    cat_mine:      '我的郵件',

    /* ── Mailbox manager (settings) ── */
    sectionMailboxes:      '自訂信箱',
    noCustomMailboxes:     '尚無自訂信箱。',
    addMailbox:            '新增',
    mailboxNameLabel:      '名稱',
    mailboxIconLabel:      '圖示',
    mailboxNamePH:         '例如：閱讀中',
    mailboxIconPH:         '📂',
    deleteMailbox:         '移除',
    errMailboxNameReq:     '信箱名稱不可為空。',
    errMailboxNameTaken:   '已有相同名稱的信箱。',

    /* ── Email wrapper ── */
    attachmentsHdr:      (n) => `附件（${n}）`,
    loadingDoc:          '正在載入文件內容…',
    noSubject:           '（無主旨）',

    /* ── Iframe restriction (composer) ── */
    iframeMustBePublic:        '嵌入網址必須公開',
    iframeMustBePublicBody:    '當你嵌入第三方網址時，此郵件會自動標記為「公開」，讓其他使用者看見你分享的內容。發佈即表示你確認：(a) 該連結安全，(b) 你有權分享，(c) 你願為內容負責。嵌入網址不允許設為私人。',
    visibilityLockedIframe:    '公開（嵌入網址，鎖定）',

    /* ── Reader toolbar (extras) ── */
    acknowledge:               '已確認',
    acknowledged:              '已確認',
    ackCount:                  (n) => `${n}`,
    ackTooltip:                '點此標記此郵件為已確認。',
    forwardTitle:              '轉寄到信箱',
    forwardBody:               '選擇你帳戶內的一個信箱，副本會儲存到該處。',
    forwardSubmit:             '儲存副本',
    forwarded:                 '已儲存到信箱',
    forwardedBadge:            '已轉寄',

    /* ── Comments thread (disguised as Reply) ── */
    commentsHeading:           '郵件回覆討論串',
    commentsEmpty:             '尚無回覆 — 成為第一個留言的人吧。',
    commentsPlaceholder:       '輸入簡短的後續回覆…',
    commentsSend:              '送出回覆',
    commentsSignInRequired:    '請登入以新增後續回覆。',
    commentsPrivateMail:       '只有共用郵件才能新增後續回覆。',

    /* ── Disclaimer + tutorial ── */
    disclaimerTitle:           '歡迎 — 請先閱讀',
    disclaimerBody:            '這是一個仿微模擬網頁電郵的網頁應用，為獨立作品，與任何商業電郵服務商並無關聯。建立帳戶即表示你同意：\n\n• 不會上傳違法、有害或非自有的版權內容。\n• 任何嵌入的網址（以及任何標記為「公開」的郵件）會被其他使用者看到；你需獨自為分享內容負責。\n• 你的資料安全地儲存在我們的伺服器上。你可以隨時刪除帳戶及所有相關資料。\n• 尊重其他使用者 — 不騷擾、不發垃圾訊息、不濫用。',
    disclaimerAgree:           '我已閱讀並同意',
    disclaimerDecline:         '取消',
    tutorialNext:              '下一步',
    tutorialPrev:              '上一步',
    tutorialDone:              '完成',
    tutorialSkip:              '略過導覽',
    tutorialStep1Title:        '建立新郵件',
    tutorialStep1Body:         '點此撰寫新郵件。你可以貼上小說、嵌入遊戲網址或上傳 ROM。',
    tutorialStep2Title:        '你的資料夾',
    tutorialStep2Body:         '你建立或儲存的郵件會放在這裡。「全部」檢視顯示你所有資料夾中的郵件。',
    tutorialStep3Title:        '自訂信箱',
    tutorialStep3Body:         '新增屬於你自己的信箱（例如「閱讀中」），並為每個信箱選擇圖示。',
    tutorialStep4Title:        '閱讀工具列',
    tutorialStep4Body:         '開啟任何郵件以「已確認」、發佈後續回覆，或將副本儲存到你的資料夾。',

    /* ── First-time compose tutorial ── */
    compTutTabsTitle:    '選擇內容類型',
    compTutTabsBody:     '使用頂部分頁選擇要附加的內容：「小說」（貼上或上傳長文）、「遊戲（URL）」（嵌入一個網址）、「遊戲（ROM）」（上傳 ROM 檔）。',
    compTutSubjectTitle: '主旨（包含偽裝）',
    compTutSubjectBody:  '輸入你真正想記住的關鍵字。開啓「偽裝」後，我們會把關鍵字包進辦公室風主旨裡，例如「FW：{keyword}，請查閱」，讓郵件看起來像一封普通公務信。',
    compTutMetaTitle:    '寄件人、資料夾、可見性',
    compTutMetaBody:     '寄件人姓名/職稱可以留空，系統會隨機選一個辦公室身份。選擇要儲存的資料夾。可見性：「私人」（只有你）或「公開」（其他人可見）。嵌入網址會被強制公開；上傳檔案會被強制設為私人。',
    compTutContentTitle: '加入你的內容',
    compTutContentBody:  '貼上小說文本、貼上遊戲網址，或上傳 ROM 檔。內容會顯示在郵件下方的「附件」區塊中。',
    compTutSendTitle:    '儲存到你的信箱',
    compTutSendBody:     '點此儲存郵件，它會出現在你選擇的資料夾頂端，並像任何其他郵件一樣被開啟。',

    /* ── First-time novel-mail tutorial ── */
    novTutPagesTitle:    '閱讀小說郵件',
    novTutPagesBody:     '小說文字會內嵌於郵件本體中，如正式文件般分頁顯示。使用「◀ 上一頁」/「下一頁 ▶」按鈕，或直接按鍵盤上的 ← → 方向鍵即可翻頁，無需滾動。',
    novTutToolbarTitle:  '頁數指示器（對比寄送時間）',
    novTutToolbarBody:   '一般郵件的標頭右上角會顯示寄送時間。小說郵件則以即時頁數計數器取而代之——「第 X 頁，共 Y 頁」。點擊即可開啟快速跳轉工具箱，讓你直接跳至任意頁面，或設置書籤以便之後從同一位置繼續閱讀。',

    /* ── All-folder hint ── */
    allFolderHint:             '你資料夾中的所有郵件（你自己建立或儲存的）。',
  }
};

/** Currently active language code. */
let _lang = 'en';

/**
 * Set the active UI language. Persists to localStorage so it survives page
 * reloads even before prefs are loaded from the backend.
 * @param {'en'|'cht'} lang
 */
export function setLang(lang) {
  _lang = (lang === 'cht') ? 'cht' : 'en';
  try { localStorage.setItem('__i18n_lang', _lang); } catch {}
}

/** Return the active language code ('en' or 'cht'). */
export function getLang() { return _lang; }

/**
 * Translate a key. If the value is a function (for parametric strings),
 * call it with the provided argument. Falls back to English, then the raw key.
 * @param {string} key
 * @param {*} [arg]  Passed to function-valued translations.
 */
export function t(key, arg) {
  const locale = LOCALES[_lang] || LOCALES.en;
  let val = locale[key];
  if (val === undefined) val = LOCALES.en[key];
  if (val === undefined) return key;
  return typeof val === 'function' ? val(arg) : val;
}

// Restore from localStorage on module load (before prefs arrive from backend).
try {
  const saved = localStorage.getItem('__i18n_lang');
  if (saved === 'cht') _lang = 'cht';
} catch {}

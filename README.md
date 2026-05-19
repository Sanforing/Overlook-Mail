# Overlook Mail — Webmail-disguised Browser Apps Platform

Looks 100% like a corporate webmail client. Each "email" in the inbox is
actually a game, novel chapter, or any embedded web app. Built with vanilla
JS + a single CSS file + Split.js + EmulatorJS (both via CDN). Zero build
step.

## Run

```bash
python3 -m http.server 8080   # then open http://localhost:8080/
```

## Project layout

```
index.html
css/styles.css                 ← all colors driven by --vars from settings.json
config/
  settings.json                ← user, theme, splits, mute, boss-key,
                                 backend, feature gates, emulator cores
  folders.json                 ← left sidebar physical folders
  categories.json              ← Admin / Community / Mine buckets
  templates.json               ← email greeting/signature/filler templates
apps/
  manifest.json                ← seed mails (admin-owned)
  novel-reader/index.js        ← built-in: paginated text reader (txt+inline)
  novel-reader/sample.txt
  excel-maze/index.js          ← built-in: spreadsheet rogue-like
  typing-defender/index.js     ← built-in: business-jargon typing game
js/
  main.js                      ← bootstrap
  core/
    app-base.js                ← StealthAppBase: extend this to make an app
    app-loader.js              ← pluggable loaders: local / iframe / emulator
    email-wrapper.js           ← wraps an app inside a fake business email
    ui.js                      ← topbar / sidebar / list / reader rendering
    boss-key.js                ← Esc×2 panic mode (silent)
    mute.js                    ← global audio mute
    fake-loading.js            ← "Downloading attachment…" overlay
    backend.js                 ← IndexedDB-backed auth, mails, files, saves
    auth-ui.js                 ← login + register modal
    composer.js                ← New mail modal (novel / game-url / game-rom)
    modal.js                   ← shared modal + form helpers
    utils.js
```

## Hard-coded? Nothing.

| To change…                            | Edit                                    |
| ------------------------------------- | --------------------------------------- |
| Colors / theme                        | `config/settings.json` → `theme`        |
| User identity in headers              | `config/settings.json` → `user`         |
| Sidebar folders                       | `config/folders.json`                   |
| Top-level categories                  | `config/categories.json`                |
| Pane sizes                            | `config/settings.json` → `splitSizes`   |
| Boss key combo                        | `config/settings.json` → `bossKey`      |
| Mute defaults & toggle key            | `config/settings.json` → `globalMute`   |
| Greeting / signature / filler         | `config/templates.json`                 |
| Free vs Paid feature gates            | `config/settings.json` → `features`     |
| Available emulator cores              | `config/settings.json` → `emulator.cores` |
| EmulatorJS CDN paths                  | `config/settings.json` → `emulator`     |
| Backend type                          | `config/settings.json` → `backend.kind` |
| Add an "email" / game / iframe (seed) | `apps/manifest.json`                    |

## Accounts, free vs paid

Sign in via the avatar in the top-right. The default backend stores
everything in IndexedDB (`stealthbox` DB) so the app runs with no server.
Passwords are salted+SHA-256-hashed via SubtleCrypto — fine for a local
demo, **not** a real identity store.

`config/settings.json → features` is the single source of truth for
gates. Each feature is one of `guest` / `free` / `paid`:

```json
"features": {
  "compose":          "free",
  "novelPaste":       "free",
  "novelUpload":      "paid",
  "gameUrl":          "free",
  "romUpload":        "paid",
  "publicVisibility": "free"
}
```

The avatar menu shows "Donate US$2 to upgrade" when Stripe is configured.
Successful one-time donations upgrade the account to the paid tier. In local
demo mode without Stripe, the menu can still do an instant paid-tier flip for
testing.

## New mail composer

Click **New mail**. Three modes:

1. **Novel** — paste text (free). Paid users may attach a `.txt` or `.epub`
  file. Novel mails render the current page directly in the email body; use
  Left/Right to change pages. EPUB table-of-contents entries appear in the
  sent-date jump toolbox when available.
2. **Game (URL)** — any iframe-embeddable URL (itch.io, web games, …).
3. **Game (ROM)** — paid only. Pick a core (GBA / GB / NES / SNES / Genesis
   / N64 / PSX / Arcade / …) and upload a ROM file. Powered by
   [EmulatorJS](https://emulatorjs.org) loaded from CDN.

Per-mail extras configurable in the composer:

- **Folder** (Inbox / Mine / Drafts / Junk / Archive) — driven by
  `config/folders.json`.
- **Visibility** — Private (only you) or Public (searchable in the
  *Community* category by other signed-in users).
- **Monochrome filter** — applied as a CSS filter on the embedded app:
  none / greyscale / sepia / blue tint / terminal green. Helps a glance
  read it as a screenshot, not gameplay.

## Mail categories

The sidebar groups mails into:

- **From Admin** — seeded entries in `apps/manifest.json` (always visible).
- **From Community** — public mails created by other signed-in users.
- **Mine** — your own mails.

Crossed with a **Folder** filter and a top-bar **Search** that matches
subject / preview / sender.

## Stealth features

- **Boss key** — press `Esc` twice within 600 ms (configurable). The
  attachment area silently disappears; inline novel text swaps to innocent
  business email copy.
  No on-screen indicator gives it away. Press the combo again to restore.
- **Auto-mute** — `<audio>`/`<video>` and `AudioContext` gain are muted by
  default. Toggle with `Alt+M`.
- **Fake loading** — iframe and emulator apps open behind a faux webmail
  "Downloading attachment…" spinner.
- **Scroll-to-play** — every email opens with a real-looking greeting +
  filler paragraphs + signature *above* the embedded app, mounted inside
  a fake "Attachments (1)" preview shell.
- **Drag-resizable panes** — Split.js gutters between the three columns.
- **Per-mail monochrome filter** — see above.

## Add a new app *type* (advanced)

```js
import { registerAppType } from './js/core/app-loader.js';
registerAppType('worker', async (app, ctx) => (container) => { /* mount */ });
```

The runner returned by your factory must implement
`{ pause(), resume(), destroy() }`.

## Swap the backend (advanced)

```js
import { registerBackend, createBackend } from './js/core/backend.js';

class RemoteBackend {
  constructor(settings) { this.base = settings.backend.baseUrl; }
  async login({ email, password }) { /* fetch(this.base + '/login', …) */ }
  async register(...) { /* … */ }
  async currentUser() { /* … */ }
  async logout() { /* … */ }
  async list(query) { /* GET /mails?q=… */ }
  async create(mail) { /* POST /mails */ }
  async update(id, patch) { /* PATCH /mails/:id */ }
  async remove(id) { /* DELETE /mails/:id */ }
  async putBlob(file) { /* multipart upload, return { id, url, … } */ }
  async getFile(id) { /* … */ }
  async getOrCreateBlobURL(id) { /* return remote URL */ }
  async saveState(mailId, data) { /* … */ }
  async loadState(mailId) { /* … */ }
  async upgradeCurrent(tier) { /* via billing webhook */ }
}
registerBackend('remote', RemoteBackend);
// then: settings.backend = { kind: "remote", baseUrl: "https://api.example.com" }
```

## Legal

You are responsible for the legality of any content you upload — ROMs,
novels, embedded URLs. The composer surfaces a notice for ROM uploads.
Don't upload content you don't have the rights to.

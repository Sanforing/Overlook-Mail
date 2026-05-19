# Overlook Mail Backend

A small, self-contained Node.js + Fastify + SQLite server that stores users,
mails, files, game saves and per-user UI preferences for the Overlook Mail
front-end. Designed to run on a single VPS with no external services beyond
optional OAuth providers.

## Tech

- **Node.js** ≥ 18.17 (uses native `fetch`, `node:crypto.scrypt`)
- **Fastify 4** + `@fastify/cookie` + `@fastify/multipart` + `@fastify/static`
- **better-sqlite3** (single-file DB, WAL mode)
- **scrypt** for password hashing (no bcrypt build needed)
- Hand-rolled OAuth2 / OIDC for **Google** and **LinkedIn** (no extra deps)

## Layout

```
server/
  src/
    index.js     -- Fastify entry + auth routes
    config.js    -- env loader
    db.js        -- SQLite schema & prepared statements
    auth.js      -- password / session helpers
    oauth.js     -- Google + LinkedIn OIDC flows
    mails.js     -- mail CRUD + saves
    files.js     -- multipart upload + serve
    prefs.js     -- per-user theme/brand preferences
  data/          -- SQLite DB + uploads (gitignored)
  .env           -- your local config (gitignored)
  .env.example
```

## Setup

```bash
cd server
cp .env.example .env
# edit .env  (at minimum set SESSION_SECRET and PUBLIC_ORIGIN)
npm install
npm start
```

The first run creates `data/stealthbox.sqlite`. User-uploaded content is stored in the user's browser, not on the server.

## Configuration (`.env`)

| Var | Purpose |
|-----|---------|
| `PORT`, `HOST` | Listen address (default `8787` / `0.0.0.0`) |
| `PUBLIC_ORIGIN` | Public URL the browser uses (used for cookies + OAuth redirects) |
| `EXTRA_ALLOWED_ORIGINS` | Comma-separated CORS origins (e.g. `http://localhost:8080`) |
| `SESSION_SECRET` | Random string used to sign cookies — **rotate in production** |
| `DATA_DIR` | Where the SQLite file lives |
| `MAX_UPLOAD_BYTES`, `ROM_MAX_BYTES`, `NOVEL_MAX_BYTES` | Legacy/advisory file size caps; browser-only uploads are not persisted by the server |
| `ALLOW_REGISTRATION` | Set `false` to lock signup |
| `DEFAULT_TIER` | `free` or `paid` for new users |
| `SERVE_STATIC_FROM` | Optional path (relative to `cwd`) — when set, the same Fastify process also serves the frontend SPA |
| `GOOGLE_CLIENT_ID` / `_SECRET` | Google OAuth credentials (optional) |
| `GOOGLE_PICKER_API_KEY` / `GOOGLE_PICKER_APP_ID` | Optional Google Picker API key and app/project number for the browser Drive picker; restrict the API key by HTTP referrer |
| `LINKEDIN_CLIENT_ID` / `_SECRET` | LinkedIn OAuth credentials (optional) |
| `X_CLIENT_ID` / `_SECRET` | X (Twitter) OAuth 2.0 credentials (optional) |
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_live_...` / `sk_test_...`) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` from Stripe Dashboard → Webhooks |
| `STRIPE_PRICE_ID` | `price_...` for the one-time US$2 donation upgrade |
| `STRIPE_SUCCESS_PATH` / `_CANCEL_PATH` | Where Checkout returns the user (default `/app?upgrade=success` / `/app?upgrade=cancel`) |

If a provider's credentials are blank, that login button is hidden in the UI
and `/auth/oauth/<provider>/start` returns 404.

## OAuth setup

All providers use OAuth 2.0 / OIDC with the same redirect URI pattern:

```
${PUBLIC_ORIGIN}/auth/oauth/google/callback
${PUBLIC_ORIGIN}/auth/oauth/linkedin/callback
${PUBLIC_ORIGIN}/auth/oauth/x/callback
```

### Google

1. <https://console.cloud.google.com/> → APIs & Services → Credentials
2. Create OAuth client ID → **Web application**
3. Add the callback URL above to **Authorized redirect URIs**
4. Copy client id + secret into `.env`

### LinkedIn

1. <https://www.linkedin.com/developers/apps> → Create app
2. Under **Products**, request **Sign In with LinkedIn using OpenID Connect**
3. Under **Auth → Authorized redirect URLs**, add the callback URL above
4. Copy client id + secret into `.env`

### X (Twitter)

1. <https://developer.x.com> → Projects & Apps → create a new app
2. **App settings → User authentication settings**:
   - Type: **Web App** (Confidential client)
   - Enable **OAuth 2.0**
   - Scopes: `tweet.read`, `users.read`, `offline.access`
   - Callback URL: the X callback above
3. Under **Keys and tokens**, copy the **OAuth 2.0 Client ID** and **Client Secret** into `.env`

Note: X never returns an email address. The server synthesizes a placeholder
like `username@x.local` so the user record can store something — it is not a
real email address and should not be used for sending mail.

## Stripe (paid tier donation)

When `STRIPE_SECRET_KEY` and `STRIPE_PRICE_ID` are set, `POST /api/auth/upgrade`
returns `402` and the frontend redirects to a one-time Stripe Checkout payment
via `POST /api/stripe/checkout`. On `checkout.session.completed`, the webhook
upgrades the user to `paid`. This is a one-time US$2 donation, not a monthly
subscription.

1. <https://dashboard.stripe.com> → Developers → **API keys** → copy the
   **Secret key** (`sk_test_...` for development).
2. Products → Add product (e.g. "Overlook Mail Paid Upgrade", one-time US$2)
  → copy the resulting **Price ID** (`price_...`). Use a one-time price, not
  a recurring subscription price.
3. Developers → **Webhooks** → Add endpoint:
   - URL: `${PUBLIC_ORIGIN}/api/stripe/webhook`
  - Events: `checkout.session.completed`
   - Copy the **Signing secret** (`whsec_...`).
4. Local dev: install the [Stripe CLI](https://stripe.com/docs/stripe-cli)
   and run `stripe listen --forward-to localhost:8787/api/stripe/webhook`.
   The CLI prints a `whsec_...` to use as `STRIPE_WEBHOOK_SECRET` while it is
   running.

## API surface

All `/api/*` endpoints accept and return JSON unless noted. Auth state is
carried in the `sb_sess` httpOnly cookie. CORS allows `PUBLIC_ORIGIN` and
`EXTRA_ALLOWED_ORIGINS` with credentials.

| Method + path | Notes |
|---------------|-------|
| `GET  /api/health` | liveness |
| `GET  /api/meta` | feature flags (registration, providers, limits) |
| `POST /api/auth/register` | `{ email, password, displayName, tier? }` |
| `POST /api/auth/login` | `{ email, password }` |
| `POST /api/auth/logout` | clears session |
| `GET  /api/auth/me` | current user (or `null`) |
| `POST /api/auth/upgrade` | demo: flips current user to `paid`. When Stripe is configured, returns 402 — use `/api/stripe/checkout` instead |
| `POST /api/stripe/checkout` | creates a one-time Checkout Session, returns `{ url }` |
| `POST /api/stripe/webhook` | Stripe webhook (signed) — upgrades user on `checkout.session.completed` |
| `GET  /auth/oauth/:provider/start?return=/` | redirects to provider |
| `GET  /auth/oauth/:provider/callback` | sets session, posts message to opener |
| `GET  /api/mails` | public mails + signed-in user's private mails |
| `POST /api/mails` | create (owned) |
| `PATCH/DELETE /api/mails/:id` | owner-only |
| `GET  /api/saves/:mailId` / `PUT /api/saves/:mailId` | legacy server save endpoint; the remote frontend stores game state and bookmarks in browser storage |
| `POST /api/files` (multipart) | disabled; user content stays in browser storage |
| `GET  /api/files/:id` / `/api/files/:id/blob` | disabled for server-stored files |
| `GET  /api/prefs` / `PUT /api/prefs` | `{ brand?, searchPlaceholder?, theme? }` |

## Front-end integration

In `config/settings.json` set:

```json
"backend": {
  "kind": "remote",
  "baseUrl": "https://your-vps.example.com"
}
```

Use `kind: "local"` (default) to fall back to the in-browser IndexedDB
backend. The same UI works with both.

## Deployment (systemd example)

Create `/etc/systemd/system/stealthbox.service`:

```ini
[Unit]
Description=Overlook Mail backend
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/stealthbox/server
ExecStart=/usr/bin/node src/index.js
EnvironmentFile=/opt/stealthbox/server/.env
Restart=on-failure
User=stealthbox
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/stealthbox/server/data

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now stealthbox
```

### Nginx in front (TLS termination)

```nginx
server {
  listen 443 ssl http2;
  server_name your-vps.example.com;
  # ssl_certificate / ssl_certificate_key …

  client_max_body_size 60m;

  location / {
    proxy_pass http://127.0.0.1:8787;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Set `PUBLIC_ORIGIN=https://your-vps.example.com` so cookies get the
`Secure` flag and OAuth redirect URIs match.

## Backups

Just back up `data/stealthbox.sqlite` (use `sqlite3 ... ".backup"` for
consistency). Uploaded novels and ROMs live in each user's browser storage,
so they are not part of the VPS backup.

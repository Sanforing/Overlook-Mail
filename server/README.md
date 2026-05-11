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

The first run creates `data/stealthbox.sqlite` and `data/uploads/`.

## Configuration (`.env`)

| Var | Purpose |
|-----|---------|
| `PORT`, `HOST` | Listen address (default `8787` / `0.0.0.0`) |
| `PUBLIC_ORIGIN` | Public URL the browser uses (used for cookies + OAuth redirects) |
| `EXTRA_ALLOWED_ORIGINS` | Comma-separated CORS origins (e.g. `http://localhost:8080`) |
| `SESSION_SECRET` | Random string used to sign cookies — **rotate in production** |
| `DATA_DIR`, `UPLOAD_DIR` | Where the SQLite file and uploads live |
| `MAX_UPLOAD_BYTES`, `ROM_MAX_BYTES`, `NOVEL_MAX_BYTES` | File size caps |
| `ALLOW_REGISTRATION` | Set `false` to lock signup |
| `DEFAULT_TIER` | `free` or `paid` for new users |
| `SERVE_STATIC_FROM` | Optional path (relative to `cwd`) — when set, the same Fastify process also serves the frontend SPA |
| `GOOGLE_CLIENT_ID` / `_SECRET` | Google OAuth credentials (optional) |
| `LINKEDIN_CLIENT_ID` / `_SECRET` | LinkedIn OAuth credentials (optional) |

If a provider's credentials are blank, that login button is hidden in the UI
and `/auth/oauth/<provider>/start` returns 404.

## OAuth setup

Both providers use OpenID Connect with the same redirect URI pattern:

```
${PUBLIC_ORIGIN}/auth/oauth/google/callback
${PUBLIC_ORIGIN}/auth/oauth/linkedin/callback
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
| `POST /api/auth/upgrade` | demo: flips current user to `paid` |
| `GET  /auth/oauth/:provider/start?return=/` | redirects to provider |
| `GET  /auth/oauth/:provider/callback` | sets session, posts message to opener |
| `GET  /api/mails` | public mails + signed-in user's private mails |
| `POST /api/mails` | create (owned) |
| `PATCH/DELETE /api/mails/:id` | owner-only |
| `GET  /api/saves/:mailId` / `PUT /api/saves/:mailId` | per-user game save |
| `POST /api/files` (multipart) | upload (paid tier for ROMs / books) |
| `GET  /api/files/:id` / `/api/files/:id/blob` | metadata / stream |
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
consistency) and `data/uploads/`.

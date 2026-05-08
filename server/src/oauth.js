import { randomBytes, createHash } from 'node:crypto';
import { config, providerEnabled } from './config.js';
import { findOrLinkOAuthUser, startSession } from './auth.js';

/**
 * Light-weight OAuth2 / OIDC for Google and LinkedIn. We avoid extra deps
 * by handcrafting the redirect + token exchange + userinfo fetch.
 *
 * Flow:
 *   GET /auth/oauth/:provider/start?return=/         -> 302 to provider
 *   GET /auth/oauth/:provider/callback?code=...&state=... -> exchange + login
 *
 * Frontend opens /auth/oauth/.../start in a popup. The callback page sends
 * a `postMessage` to window.opener and closes itself.
 *
 * State + PKCE verifier ride in short-lived signed cookies so we don't need
 * server-side storage for in-flight flows.
 */

const PROVIDERS = {
  google: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
    scopes: ['openid', 'email', 'profile'],
    usesPKCE: true
  },
  linkedin: {
    authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    userInfoUrl: 'https://api.linkedin.com/v2/userinfo',
    scopes: ['openid', 'email', 'profile'],
    usesPKCE: false
  }
};

function clientFor(provider) {
  if (provider === 'google')   return config.google;
  if (provider === 'linkedin') return config.linkedin;
  return null;
}

function redirectUriFor(provider) {
  return `${config.publicOrigin}/auth/oauth/${provider}/callback`;
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pkcePair() {
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

function setOauthCookie(reply, name, value) {
  reply.setCookie(name, value, {
    httpOnly: true, sameSite: 'lax',
    secure: config.publicOrigin.startsWith('https://'),
    path: `/auth/oauth/`,
    maxAge: 600
  });
}

export function registerOAuth(app) {
  app.get('/auth/oauth/providers', async () => ({
    google:   providerEnabled('google'),
    linkedin: providerEnabled('linkedin')
  }));

  app.get('/auth/oauth/:provider/start', async (req, reply) => {
    const { provider } = req.params;
    const def = PROVIDERS[provider];
    const cli = clientFor(provider);
    if (!def || !cli || !cli.clientId) return reply.code(404).send({ error: 'provider not configured' });

    const state = b64url(randomBytes(16));
    const params = new URLSearchParams({
      client_id: cli.clientId,
      response_type: 'code',
      redirect_uri: redirectUriFor(provider),
      scope: def.scopes.join(' '),
      state
    });
    setOauthCookie(reply, `sb_oauth_state_${provider}`, state);

    if (def.usesPKCE) {
      const { verifier, challenge } = pkcePair();
      params.set('code_challenge', challenge);
      params.set('code_challenge_method', 'S256');
      setOauthCookie(reply, `sb_oauth_pkce_${provider}`, verifier);
    }

    const ret = String(req.query?.return || '/').slice(0, 256);
    setOauthCookie(reply, `sb_oauth_return_${provider}`, ret);

    return reply.redirect(`${def.authUrl}?${params.toString()}`);
  });

  app.get('/auth/oauth/:provider/callback', async (req, reply) => {
    const { provider } = req.params;
    const def = PROVIDERS[provider];
    const cli = clientFor(provider);
    if (!def || !cli || !cli.clientId) return reply.code(404).send('provider not configured');

    const { code, state, error } = req.query || {};
    if (error) return renderCallback(reply, { ok: false, error: String(error) });
    const cookieState = req.cookies?.[`sb_oauth_state_${provider}`];
    if (!code || !state || state !== cookieState) {
      return renderCallback(reply, { ok: false, error: 'invalid state' });
    }

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: String(code),
      redirect_uri: redirectUriFor(provider),
      client_id: cli.clientId,
      client_secret: cli.clientSecret
    });
    if (def.usesPKCE) {
      const verifier = req.cookies?.[`sb_oauth_pkce_${provider}`];
      if (!verifier) return renderCallback(reply, { ok: false, error: 'missing PKCE verifier' });
      body.set('code_verifier', verifier);
    }

    let token;
    try {
      const r = await fetch(def.tokenUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', 'accept': 'application/json' },
        body
      });
      if (!r.ok) throw new Error(`token endpoint: ${r.status} ${await r.text()}`);
      token = await r.json();
    } catch (e) {
      app.log.error({ err: e }, 'oauth token exchange failed');
      return renderCallback(reply, { ok: false, error: 'token exchange failed' });
    }

    let info;
    try {
      const r = await fetch(def.userInfoUrl, { headers: { authorization: `Bearer ${token.access_token}` } });
      if (!r.ok) throw new Error(`userinfo: ${r.status} ${await r.text()}`);
      info = await r.json();
    } catch (e) {
      app.log.error({ err: e }, 'oauth userinfo failed');
      return renderCallback(reply, { ok: false, error: 'userinfo failed' });
    }

    const providerUid = String(info.sub || info.id || info.email);
    const email = info.email || null;
    const displayName = info.name || info.given_name || (email ? email.split('@')[0] : `${provider}-user`);
    const user = findOrLinkOAuthUser({ provider, providerUid, email, displayName });
    startSession(reply, user.id);

    const ret = req.cookies?.[`sb_oauth_return_${provider}`] || '/';
    return renderCallback(reply, { ok: true, returnTo: ret });
  });
}

function renderCallback(reply, payload) {
  const json = JSON.stringify(payload);
  // The popup posts the result to its opener and closes itself. The
  // opener listens for { source: 'stealthbox-oauth', ... }.
  reply.type('text/html').send(`<!doctype html><html><head><meta charset="utf-8"><title>Signed in</title></head>
<body style="font-family:Segoe UI,sans-serif;padding:24px;color:#201f1e">
<p>${payload.ok ? 'Signed in. You can close this window.' : 'Sign-in failed: ' + (payload.error || 'unknown')}</p>
<script>
  try {
    if (window.opener) {
      window.opener.postMessage(Object.assign({ source: 'stealthbox-oauth' }, ${json}), '*');
      setTimeout(() => window.close(), 250);
    } else if (${JSON.stringify(payload.ok)}) {
      window.location.href = ${JSON.stringify(payload.returnTo || '/')};
    }
  } catch (e) {}
<\/script>
</body></html>`);
}

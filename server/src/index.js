import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

import { config, providerEnabled } from './config.js';
import { stmt } from './db.js';
import {
  createUser, verifyPassword, startSession, endSession,
  currentUser, requireUser, publicUser
} from './auth.js';
import { registerOAuth } from './oauth.js';
import { registerMails } from './mails.js';
import { registerFiles } from './files.js';
import { registerPrefs } from './prefs.js';

const app = Fastify({ logger: true, bodyLimit: 2 * 1024 * 1024 });

await app.register(fastifyCookie, { secret: config.sessionSecret });
await app.register(fastifyMultipart, { limits: { fileSize: config.limits.maxUpload } });

/* ---------- CORS (credentials-aware) ---------- */
const allowedOrigins = new Set([config.publicOrigin, ...config.extraAllowedOrigins]);
app.addHook('onRequest', async (req, reply) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.has(origin)) {
    reply.header('access-control-allow-origin', origin);
    reply.header('access-control-allow-credentials', 'true');
    reply.header('vary', 'Origin');
    reply.header('access-control-allow-headers', 'content-type');
    reply.header('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  }
  if (req.method === 'OPTIONS') {
    reply.code(204).send();
  }
});

/* ---------- Health & meta ---------- */
app.get('/api/health', async () => ({ ok: true, time: Date.now() }));
app.get('/api/meta', async () => ({
  allowRegistration: config.allowRegistration,
  defaultTier: config.defaultTier,
  providers: {
    google:   providerEnabled('google'),
    linkedin: providerEnabled('linkedin')
  },
  limits: config.limits
}));

/* ---------- Email + password auth ---------- */
app.post('/api/auth/register', async (req, reply) => {
  if (!config.allowRegistration) return reply.code(403).send({ error: 'registration disabled' });
  const { email, password, displayName, tier } = req.body || {};
  if (!email || !password || !displayName) return reply.code(400).send({ error: 'email, password, displayName required' });
  if (stmt.userByEmail.get(email)) return reply.code(409).send({ error: 'email already registered' });
  const user = await createUser({
    email: String(email).toLowerCase(),
    password: String(password),
    displayName: String(displayName).slice(0, 64),
    tier: tier === 'paid' ? 'paid' : 'free'
  });
  startSession(reply, user.id);
  return publicUser(user);
});

app.post('/api/auth/login', async (req, reply) => {
  const { email, password } = req.body || {};
  if (!email || !password) return reply.code(400).send({ error: 'email and password required' });
  const user = stmt.userByEmail.get(String(email).toLowerCase());
  const ok = user && await verifyPassword(user, String(password));
  if (!ok) return reply.code(401).send({ error: 'invalid credentials' });
  startSession(reply, user.id);
  return publicUser(user);
});

app.post('/api/auth/logout', async (req, reply) => {
  endSession(req, reply);
  return { ok: true };
});

app.get('/api/auth/me', async (req) => {
  const u = currentUser(req);
  return u ? publicUser(u) : null;
});

app.post('/api/auth/upgrade', async (req, reply) => {
  const me = requireUser(req, reply); if (!me) return;
  // Demo upgrade: flip tier to "paid". A real impl would integrate Stripe etc.
  stmt.setUserTier.run('paid', me.id);
  return publicUser(stmt.userById.get(me.id));
});

/* ---------- Sub-routes ---------- */
registerOAuth(app);
registerMails(app);
registerFiles(app);
registerPrefs(app);

/* ---------- Optional static frontend ---------- */
if (config.serveStaticFrom) {
  const root = resolve(process.cwd(), config.serveStaticFrom);
  if (existsSync(root)) {
    await app.register(fastifyStatic, { root, prefix: '/', wildcard: false, index: ['index.html'] });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api') && !req.url.startsWith('/auth')) {
        // /app (clean URL) → inbox app
        if (req.url === '/app' || req.url.startsWith('/app?')) {
          return reply.sendFile('app.html');
        }
        // everything else → landing
        return reply.sendFile('index.html');
      }
      reply.code(404).send({ error: 'not found' });
    });
    app.log.info(`serving static frontend from ${root}`);
  } else {
    app.log.warn(`SERVE_STATIC_FROM=${config.serveStaticFrom} does not exist; skipping static`);
  }
}

/* ---------- Startup ---------- */
stmt.pruneSessions.run(Date.now());

app.listen({ port: config.port, host: config.host })
  .then(addr => app.log.info(`StealthBox backend ready on ${addr}`))
  .catch(err => { app.log.error(err); process.exit(1); });

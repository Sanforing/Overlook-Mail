import { createHmac, timingSafeEqual } from 'node:crypto';
import { Readable } from 'node:stream';
import { config } from './config.js';
import { stmt } from './db.js';
import { requireUser } from './auth.js';

/**
 * Stripe Checkout + webhook integration.
 *
 * Routes:
 *   POST /api/stripe/checkout  -> creates a Checkout Session, returns { url }
 *   POST /api/stripe/webhook   -> verifies signature, upgrades user on
 *                                 checkout.session.completed OR invoice.paid
 *
 * Webhook signature: verified via HMAC-SHA256 against the raw request body.
 * We capture the raw body in a preParsing hook so Fastify's built-in JSON
 * parser still runs normally for all other routes.
 *
 * Configure with env:
 *   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_ID,
 *   STRIPE_SUCCESS_PATH, STRIPE_CANCEL_PATH (optional)
 */

export function stripeEnabled() {
  return !!(config.stripe.secretKey && config.stripe.priceId);
}

async function stripeApi(path, formBody) {
  const r = await fetch(`https://api.stripe.com/v1${path}`, {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(config.stripe.secretKey + ':').toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: formBody
  });
  const json = await r.json();
  if (!r.ok) {
    const msg = json?.error?.message || `stripe ${r.status}`;
    const err = new Error(msg);
    err.status = r.status;
    throw err;
  }
  return json;
}

/**
 * Verify a Stripe-Signature header against the raw body using the webhook
 * signing secret. Follows https://stripe.com/docs/webhooks/signatures.
 */
function verifyStripeSignature(rawBody, header, secret, toleranceSec = 300) {
  if (!header || !secret) return false;
  const parts = String(header).split(',').reduce((acc, p) => {
    const [k, v] = p.split('=');
    if (k && v) (acc[k.trim()] = acc[k.trim()] || []).push(v.trim());
    return acc;
  }, {});
  const ts = parts.t?.[0];
  const sigs = parts.v1 || [];
  if (!ts || !sigs.length) return false;
  const ageSec = Math.abs(Date.now() / 1000 - Number(ts));
  if (!Number.isFinite(ageSec) || ageSec > toleranceSec) return false;
  const expected = createHmac('sha256', secret).update(`${ts}.${rawBody}`).digest('hex');
  const expBuf = Buffer.from(expected, 'hex');
  return sigs.some(sig => {
    try {
      const got = Buffer.from(sig, 'hex');
      return got.length === expBuf.length && timingSafeEqual(got, expBuf);
    } catch { return false; }
  });
}

export function registerStripe(app) {
  app.get('/api/stripe/status', async () => ({ enabled: stripeEnabled() }));

  // --- Raw-body capture for webhook signature verification -----------------
  // preParsing fires before Fastify's JSON body parser. For the webhook route
  // we buffer the stream, stash it as req.rawBody (string), then hand back a
  // new Readable so the rest of Fastify's pipeline still runs normally.
  // All other routes pass through untouched.
  app.addHook('preParsing', async function captureStripeRawBody(req, _reply, payload) {
    if (req.url !== '/api/stripe/webhook') return;
    const chunks = [];
    for await (const chunk of payload) chunks.push(chunk);
    const raw = Buffer.concat(chunks);
    req.rawBody = raw.toString('utf8');
    return Readable.from(raw);
  });

  // --- Create Checkout Session ---------------------------------------------
  app.post('/api/stripe/checkout', async (req, reply) => {
    const me = requireUser(req, reply); if (!me) return;
    if (!stripeEnabled()) return reply.code(503).send({ error: 'stripe not configured' });
    if (me.tier === 'paid' || me.tier === 'admin') {
      return reply.code(400).send({ error: 'already paid' });
    }

    const join = (p) => /^https?:\/\//i.test(p) ? p : `${config.publicOrigin}${p}`;
    const successUrl = join(config.stripe.successPath);
    const cancelUrl  = join(config.stripe.cancelPath);

    const params = new URLSearchParams();
    params.set('mode', 'subscription');
    params.set('success_url', successUrl);
    params.set('cancel_url', cancelUrl);
    params.set('client_reference_id', me.id);
    if (me.email) params.set('customer_email', me.email);
    params.set('line_items[0][price]', config.stripe.priceId);
    params.set('line_items[0][quantity]', '1');
    params.set('metadata[user_id]', me.id);

    try {
      const session = await stripeApi('/checkout/sessions', params);
      return { url: session.url, id: session.id };
    } catch (e) {
      app.log.error({ err: e }, 'stripe checkout failed');
      return reply.code(500).send({ error: 'checkout failed' });
    }
  });

  // --- Webhook -------------------------------------------------------------
  app.post('/api/stripe/webhook', async (req, reply) => {
    if (!config.stripe.webhookSecret) {
      return reply.code(503).send({ error: 'webhook not configured' });
    }
    const sig = req.headers['stripe-signature'];
    const raw = req.rawBody ?? '';
    if (!verifyStripeSignature(raw, sig, config.stripe.webhookSecret)) {
      app.log.warn({ rawLen: raw.length }, 'stripe webhook: invalid signature');
      return reply.code(400).send({ error: 'invalid signature' });
    }

    const event = req.body;
    try {
      switch (event?.type) {
        case 'checkout.session.completed': {
          // Primary: session carries client_reference_id = our internal user ID
          const s = event.data?.object || {};
          const userId = s.client_reference_id || s.metadata?.user_id;
          if (userId) {
            stmt.setUserTier.run('paid', userId);
            app.log.info({ userId }, 'stripe checkout.session.completed: upgraded to paid');
          }
          break;
        }
        case 'invoice.paid': {
          // Fires on first payment (billing_reason = subscription_create) and
          // every renewal (subscription_cycle). Reliable fallback.
          const inv = event.data?.object || {};
          const reason = inv.billing_reason || '';
          if (reason === 'subscription_create' || reason === 'subscription_cycle') {
            const email = inv.customer_email;
            if (email) {
              const user = stmt.userByEmail.get(email.toLowerCase());
              if (user && user.tier !== 'paid' && user.tier !== 'admin') {
                stmt.setUserTier.run('paid', user.id);
                app.log.info({ userId: user.id, email }, 'stripe invoice.paid: upgraded to paid');
              }
            }
          }
          break;
        }
        case 'customer.subscription.deleted': {
          // Downgrade on cancellation — fetch the customer email from Stripe
          const sub = event.data?.object || {};
          const custId = sub.customer;
          if (custId && config.stripe.secretKey) {
            try {
              const r = await fetch(`https://api.stripe.com/v1/customers/${custId}`, {
                headers: { authorization: `Basic ${Buffer.from(config.stripe.secretKey + ':').toString('base64')}` }
              });
              if (r.ok) {
                const cust = await r.json();
                const email = cust.email;
                if (email) {
                  const user = stmt.userByEmail.get(email.toLowerCase());
                  if (user && user.tier === 'paid') {
                    stmt.setUserTier.run('free', user.id);
                    app.log.info({ userId: user.id, email }, 'stripe subscription.deleted: downgraded to free');
                  }
                }
              }
            } catch (e) {
              app.log.warn({ err: e, custId }, 'stripe: failed to fetch customer for downgrade');
            }
          }
          break;
        }
        default: break;
      }
    } catch (e) {
      app.log.error({ err: e, type: event?.type }, 'stripe webhook handler failed');
      return reply.code(500).send({ error: 'handler failed' });
    }
    return { received: true };
  });
}

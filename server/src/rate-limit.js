/**
 * Tiny in-memory rate limiter — sliding window per (ip + key).
 * Zero-dependency to match the rest of the server. Suitable for a single-node
 * VPS deploy. For multi-node, swap for @fastify/rate-limit + a Redis store.
 */

const buckets = new Map(); // key -> [timestamps]

function clientIp(req) {
  // Behind a reverse proxy you may want to read X-Forwarded-For; we keep it
  // simple and trust req.ip (Fastify already parses it).
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

/**
 * Create a Fastify preHandler that limits to `max` hits per `windowMs`
 * for the calling client (keyed by IP + scope).
 *   const limit = rateLimit({ max: 5, windowMs: 60_000, scope: 'login' });
 *   app.post('/api/auth/login', { preHandler: limit }, handler);
 */
export function rateLimit({ max = 10, windowMs = 60_000, scope = 'default' } = {}) {
  return async function preHandler(req, reply) {
    const key = `${scope}:${clientIp(req)}`;
    const now = Date.now();
    const cutoff = now - windowMs;
    let arr = buckets.get(key);
    if (!arr) { arr = []; buckets.set(key, arr); }
    // Drop expired entries from the front (timestamps are append-only/sorted).
    while (arr.length && arr[0] < cutoff) arr.shift();

    if (arr.length >= max) {
      const retryAfterSec = Math.max(1, Math.ceil((arr[0] + windowMs - now) / 1000));
      reply.header('retry-after', String(retryAfterSec));
      return reply.code(429).send({
        error: 'too many requests',
        retryAfter: retryAfterSec
      });
    }
    arr.push(now);
  };
}

/**
 * Periodically evict empty buckets so the Map doesn't grow unboundedly under
 * a long uptime + heavy IP churn.
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, arr] of buckets) {
    while (arr.length && arr[0] < now - 10 * 60_000) arr.shift();
    if (arr.length === 0) buckets.delete(key);
  }
}, 5 * 60_000).unref?.();

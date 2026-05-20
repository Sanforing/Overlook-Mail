const MEASUREMENT_ID = 'G-89BM3CMJHZ';

function cleanValue(value) {
  if (value == null) return undefined;
  if (typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.slice(0, 100);
  return undefined;
}

export function trackEvent(name, params = {}) {
  if (!name || typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  const clean = {};
  for (const [key, value] of Object.entries(params || {})) {
    const safe = cleanValue(value);
    if (safe !== undefined) clean[key] = safe;
  }
  try { window.gtag('event', name, clean); } catch {}
}

export function setAnalyticsUser(user) {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  try {
    window.gtag('set', { user_id: user?.id || null });
    window.gtag('set', 'user_properties', {
      signed_in: Boolean(user),
      tier: user?.tier || 'guest'
    });
  } catch {}
}

export function userTier(user) {
  return user?.tier || 'guest';
}

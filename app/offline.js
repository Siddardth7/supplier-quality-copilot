// issue 169: register the offline service worker. Pure over injected globals so Node can test it.
// No DOM, no localStorage, no other app module. Root sw.js scope covers app/, data/ and design/ (decision 246).

/** @returns {Promise<'registered'|'unsupported'|'insecure'|'failed'>} never throws */
export async function registerOffline({ nav = globalThis.navigator, loc = globalThis.location, base = import.meta.url } = {}) {
  if (!nav || !('serviceWorker' in nav)) return 'unsupported';
  if (loc?.protocol !== 'http:' && loc?.protocol !== 'https:') return 'insecure';  // file:// and the rest (decision 253)
  try {
    await nav.serviceWorker.register(new URL('../sw.js', base).href, { updateViaCache: 'none' });
    return 'registered';
  } catch (e) {
    console.warn('Offline mode unavailable:', e?.message ?? e);
    return 'failed';
  }
}

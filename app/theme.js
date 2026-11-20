// issue 178 (DS-FR-08): Light / Dark toggle. Default follows prefers-color-scheme; an explicit choice is stored under
// THEME_KEY and set as <html data-theme>. The inline script in index.html applies the stored choice before first paint.
// Nothing runs at import; globals are injectable so Node can test it. Never throws.
import { safeStorage } from './storage.js';

export const THEME_KEY = 'sqc:theme';
const QUERY = '(prefers-color-scheme: light)';

const isTheme = (t) => t === 'light' || t === 'dark';

/** Explicit 'light'|'dark' wins; anything else follows the media preference. */
export function effectiveTheme(explicit, prefersLight) {
  return isTheme(explicit) ? explicit : (prefersLight ? 'light' : 'dark');
}

export function nextTheme(effective) {
  return effective === 'light' ? 'dark' : 'light';
}

/** Binds #theme-toggle. @returns {{ theme: 'light'|'dark', toggle: () => void }} never throws */
export function initTheme({ doc = globalThis.document, win = globalThis, storage = safeStorage(win) } = {}) {
  try {
    const media = win?.matchMedia?.(QUERY);
    let stored = null;
    try { stored = storage.get(THEME_KEY); } catch { stored = null; }  // a throwing store reads as "no choice"
    let explicit = isTheme(stored) ? stored : null;
    let current = effectiveTheme(explicit, !!media?.matches);
    const root = doc.documentElement;
    const button = doc.getElementById('theme-toggle');
    if (explicit) root.dataset.theme = explicit;
    const sync = () => {
      if (!button) return;
      button.setAttribute('aria-pressed', String(current === 'light'));  // ☀ is static in index.html (Sid, 2026-11-20)
    };
    const announce = () => doc.dispatchEvent(new win.CustomEvent('themechange', { detail: { theme: current } }));
    const toggle = () => {
      try {
        current = explicit = nextTheme(current);
        root.dataset.theme = current;
        try { storage.set(THEME_KEY, current); } catch { /* blocked storage: the choice lasts for this session only */ }
        sync();
        announce();
      } catch (e) { console.warn('Theme toggle failed:', e?.message ?? e); }
    };
    button?.addEventListener('click', toggle);
    media?.addEventListener?.('change', (e) => {
      if (explicit) return;  // an explicit choice ignores the OS setting
      try { current = effectiveTheme(null, e.matches); sync(); announce(); } catch { /* keep the old state */ }
    });
    sync();
    return { theme: current, toggle };
  } catch (e) {
    console.warn('Theme unavailable:', e?.message ?? e);
    return { theme: 'dark', toggle() {} };
  }
}

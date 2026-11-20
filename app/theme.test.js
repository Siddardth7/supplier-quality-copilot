// Light / Dark toggle (issue 178, DS-FR-08): pure helpers, initTheme over injected fakes, and the inline pre-paint script.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { THEME_KEY, effectiveTheme, nextTheme, initTheme } from './theme.js';
import { safeStorage } from './storage.js';

const HTML = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const INLINE = HTML.match(/<script>([\s\S]*?)<\/script>/)[1];

/** A fake page: <html> dataset, #theme-toggle with its icon, a media query, and a localStorage (raw strings). */
const fakePage = ({ prefersLight = false, button = true, matchMedia = true, ls = {} } = {}) => {
  const events = [];
  const media = { matches: prefersLight, listeners: [], addEventListener(t, fn) { if (t === 'change') this.listeners.push(fn); } };
  const icon = { textContent: '☀' };
  const btn = {
    attrs: { 'aria-pressed': 'false' }, clicks: [],
    setAttribute(k, v) { this.attrs[k] = v; },
    addEventListener(t, fn) { if (t === 'click') this.clicks.push(fn); },
    querySelector: (s) => (s === '.theme-icon' ? icon : null),
    click() { for (const fn of this.clicks) fn(); },
  };
  const doc = {
    documentElement: { dataset: {} },
    getElementById: (id) => (id === 'theme-toggle' && button ? btn : null),
    dispatchEvent: (e) => { events.push(e); return true; },
  };
  const store = { ...ls };
  const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  const win = { CustomEvent, localStorage, ...(matchMedia ? { matchMedia: () => media } : {}) };
  const osChange = (matches) => { media.matches = matches; for (const fn of media.listeners) fn({ matches }); };
  return { doc, win, btn, icon, media, events, store, osChange };
};

test('THEME_KEY is the sqc: namespaced key', () => assert.equal(THEME_KEY, 'sqc:theme'));

test('effectiveTheme: explicit choice beats the media query; junk falls back to the media query', () => {
  for (const prefers of [true, false]) {
    assert.equal(effectiveTheme('light', prefers), 'light');
    assert.equal(effectiveTheme('dark', prefers), 'dark');
    for (const junk of [null, undefined, 'blue', '', 'Light', 1, {}]) assert.equal(effectiveTheme(junk, prefers), prefers ? 'light' : 'dark', String(junk));
  }
});

test('nextTheme: light -> dark, anything else -> light', () => {
  assert.equal(nextTheme('light'), 'dark');
  assert.equal(nextTheme('dark'), 'light');
  assert.equal(nextTheme(undefined), 'light');
});

test('no stored choice: follows prefers-color-scheme and writes no data-theme', () => {
  for (const prefersLight of [false, true]) {
    const p = fakePage({ prefersLight });
    const want = prefersLight ? 'light' : 'dark';
    assert.equal(initTheme(p).theme, want);
    assert.equal(p.doc.documentElement.dataset.theme, undefined, 'CSS media query decides, no attribute');
    assert.equal(p.btn.attrs['aria-pressed'], String(prefersLight));
    assert.equal(p.icon.textContent, '☀', 'icon is static in both themes');
    assert.equal(p.events.length, 0, 'no themechange at init');
  }
});

test('stored explicit choice wins over the OS preference and is applied to <html>', () => {
  const p = fakePage({ prefersLight: false, ls: { [THEME_KEY]: '"light"' } });
  assert.equal(initTheme(p).theme, 'light');
  assert.equal(p.doc.documentElement.dataset.theme, 'light');
  assert.equal(p.btn.attrs['aria-pressed'], 'true');
  assert.equal(p.icon.textContent, '☀');
  const q = fakePage({ prefersLight: true, ls: { [THEME_KEY]: '"dark"' } });
  assert.equal(initTheme(q).theme, 'dark');
  assert.equal(q.doc.documentElement.dataset.theme, 'dark');
  assert.equal(q.btn.attrs['aria-pressed'], 'false');
});

test('stored garbage ("blue", non-JSON, null) is ignored: follows the media query', () => {
  for (const raw of ['"blue"', 'light', 'null', '{']) {
    const p = fakePage({ prefersLight: true, ls: { [THEME_KEY]: raw } });
    assert.equal(initTheme(p).theme, 'light', raw);
    assert.equal(p.doc.documentElement.dataset.theme, undefined, raw);
  }
});

test('click flips, persists JSON under THEME_KEY, updates the button and dispatches themechange', () => {
  const p = fakePage();
  initTheme(p);
  p.btn.click();
  assert.equal(p.doc.documentElement.dataset.theme, 'light');
  assert.equal(p.store[THEME_KEY], '"light"');
  assert.equal(p.btn.attrs['aria-pressed'], 'true');
  assert.equal(p.icon.textContent, '☀');
  assert.equal(p.events.length, 1);
  assert.equal(p.events[0].type, 'themechange');
  assert.deepEqual(p.events[0].detail, { theme: 'light' });
  p.btn.click();
  assert.equal(p.doc.documentElement.dataset.theme, 'dark');
  assert.equal(p.store[THEME_KEY], '"dark"');
  assert.equal(p.btn.attrs['aria-pressed'], 'false');
  assert.deepEqual(p.events.map((e) => e.detail.theme), ['light', 'dark']);
});

test('the returned toggle() does the same as a click', () => {
  const p = fakePage({ prefersLight: true });
  const { toggle } = initTheme(p);
  toggle();
  assert.equal(p.doc.documentElement.dataset.theme, 'dark');
  assert.equal(p.store[THEME_KEY], '"dark"');
});

test('blocked storage: set returning false, set throwing, get throwing, localStorage getter throwing; still flips for the session', (t) => {
  t.mock.method(console, 'warn', () => {});
  const stores = {
    'set false': { get: () => null, set: () => false },
    'set throws': { get: () => null, set: () => { throw new Error('QuotaExceeded'); } },
    'get throws': { get: () => { throw new Error('SecurityError'); }, set: () => false },
  };
  for (const [name, storage] of Object.entries(stores)) {
    const p = fakePage();
    let r;
    assert.doesNotThrow(() => { r = initTheme({ ...p, storage }); }, name);
    assert.equal(r.theme, 'dark', name);
    assert.doesNotThrow(() => p.btn.click(), name);
    assert.equal(p.doc.documentElement.dataset.theme, 'light', name);
    assert.equal(p.btn.attrs['aria-pressed'], 'true', name);
    assert.equal(p.events.length, 1, name);
  }
  // The real default path: safeStorage over a window whose localStorage getter throws (Safari private, blocked cookies).
  const p = fakePage({ prefersLight: true });
  Object.defineProperty(p.win, 'localStorage', { get() { throw new Error('SecurityError'); } });
  const r = initTheme({ doc: p.doc, win: p.win });
  assert.equal(r.theme, 'light');
  p.btn.click();
  assert.equal(p.doc.documentElement.dataset.theme, 'dark');
});

test('OS scheme change resyncs while no explicit choice exists, and is ignored after one', () => {
  const p = fakePage({ prefersLight: false });
  initTheme(p);
  p.osChange(true);
  assert.equal(p.btn.attrs['aria-pressed'], 'true');
  assert.deepEqual(p.events.map((e) => e.detail.theme), ['light']);
  assert.equal(p.doc.documentElement.dataset.theme, undefined, 'CSS follows the media query on its own');
  p.btn.click();                                  // explicit: dark
  p.osChange(false);
  p.osChange(true);
  assert.equal(p.btn.attrs['aria-pressed'], 'false');
  assert.equal(p.doc.documentElement.dataset.theme, 'dark');
  assert.deepEqual(p.events.map((e) => e.detail.theme), ['light', 'dark']);
  const q = fakePage({ prefersLight: false, ls: { [THEME_KEY]: '"dark"' } });  // stored explicit: OS ignored from the start
  initTheme(q);
  q.osChange(true);
  assert.equal(q.events.length, 0);
  assert.equal(q.btn.attrs['aria-pressed'], 'false');
});

test('no matchMedia: dark; no #theme-toggle: no throw and toggle() still flips', () => {
  const p = fakePage({ matchMedia: false });
  assert.equal(initTheme(p).theme, 'dark');
  const q = fakePage({ button: false });
  let r;
  assert.doesNotThrow(() => { r = initTheme(q); });
  r.toggle();
  assert.equal(q.doc.documentElement.dataset.theme, 'light');
  assert.equal(q.events.length, 1);
});

test('never throws: bare call in Node, null doc and a hostile doc all return the dark fallback', (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  assert.equal(typeof globalThis.document, 'undefined');
  for (const opts of [undefined, { doc: null, win: {} }, { doc: { get documentElement() { throw new Error('boom'); } }, win: {} }]) {
    let r;
    assert.doesNotThrow(() => { r = initTheme(opts); });
    assert.equal(r.theme, 'dark');
    assert.doesNotThrow(() => r.toggle());
  }
  assert.ok(warn.mock.callCount() >= 1);
});

// The inline <head> script runs before any stylesheet, so a stored choice is painted on the first frame (no flash).
const runInline = (getItem) => {
  const documentElement = { dataset: {} };
  vm.runInNewContext(INLINE, { localStorage: { getItem }, document: { documentElement }, JSON });
  return documentElement.dataset.theme;
};

test('pre-paint script: reads THEME_KEY, applies light/dark, ignores garbage, survives blocked storage', () => {
  assert.ok(INLINE.includes(`'${THEME_KEY}'`));
  assert.doesNotMatch(INLINE, /\bsrc=|https?:/);
  const keys = [];
  assert.equal(runInline((k) => { keys.push(k); return '"light"'; }), 'light');
  assert.deepEqual(keys, [THEME_KEY]);
  assert.equal(runInline(() => '"dark"'), 'dark');
  for (const raw of [null, '"blue"', 'light', '{', '1']) assert.equal(runInline(() => raw), undefined, String(raw));
  assert.doesNotThrow(() => assert.equal(runInline(() => { throw new Error('SecurityError'); }), undefined));
  assert.doesNotThrow(() => vm.runInNewContext(INLINE, { JSON }), 'no localStorage at all');
});

test('pre-paint script reads exactly what initTheme stores (same key, same JSON encoding)', () => {
  const p = fakePage();
  initTheme(p);
  p.btn.click();
  assert.equal(runInline((k) => p.store[k] ?? null), 'light');
  assert.equal(safeStorage(p.win).get(THEME_KEY), 'light');
});

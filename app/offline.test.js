// registerOffline (issue 169, decision 253): every path, over injected globals.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerOffline } from './offline.js';

const BASE = 'http://h/supplier-quality-copilot/app/offline.js';
const fakeNav = (register) => {
  const calls = [];
  return { calls, serviceWorker: { register: (...a) => { calls.push(a); return register(...a); } } };
};

test('no navigator or no serviceWorker: unsupported', async () => {
  assert.equal(await registerOffline({ nav: {}, loc: { protocol: 'https:' }, base: BASE }), 'unsupported');
  assert.equal(await registerOffline({ nav: null, loc: { protocol: 'https:' }, base: BASE }), 'unsupported');
});

test('file:// and other non-http protocols: insecure, register never called', async () => {
  for (const protocol of ['file:', 'chrome-extension:', 'data:']) {
    const nav = fakeNav(async () => ({}));
    assert.equal(await registerOffline({ nav, loc: { protocol }, base: BASE }), 'insecure', protocol);
    assert.equal(nav.calls.length, 0, protocol);
  }
  const nav = fakeNav(async () => ({}));
  assert.equal(await registerOffline({ nav, loc: undefined, base: BASE }), 'insecure', 'missing location');
  assert.equal(nav.calls.length, 0);
});

test('http (localhost) and https: register ../sw.js once with updateViaCache none and no scope', async () => {
  for (const protocol of ['http:', 'https:']) {
    const nav = fakeNav(async () => ({}));
    assert.equal(await registerOffline({ nav, loc: { protocol }, base: BASE }), 'registered', protocol);
    assert.deepEqual(nav.calls, [['http://h/supplier-quality-copilot/sw.js', { updateViaCache: 'none' }]], protocol);
  }
});

test('a rejected register returns failed, warns once and does not throw', async (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  const nav = fakeNav(async () => { throw new Error('SecurityError'); });
  assert.equal(await registerOffline({ nav, loc: { protocol: 'https:' }, base: BASE }), 'failed');
  assert.equal(warn.mock.callCount(), 1);
  const sync = fakeNav(() => { throw new Error('sync throw'); });
  assert.equal(await registerOffline({ nav: sync, loc: { protocol: 'https:' }, base: BASE }), 'failed');
});

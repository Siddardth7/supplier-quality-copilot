// Browser storage that never throws (#37; spec 4 storage, 5 edge cases). safeStorage(null) is "no storage";
// the default parameter (globalThis) is not used here because Node 26 warns about --localstorage-file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeStorage } from './storage.js';

function memory() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, raw: m };
}

test('working storage: set then get round-trips JSON', () => {
  const ls = memory();
  const s = safeStorage({ localStorage: ls });
  assert.equal(s.ok, true);
  assert.equal(s.get('sqc:manual'), null);
  assert.equal(s.set('sqc:manual', [{ a: 1 }]), true);
  assert.equal(ls.raw.get('sqc:manual'), '[{"a":1}]');
  assert.deepEqual(s.get('sqc:manual'), [{ a: 1 }]);
});

test('a stored value that is not JSON reads as null', () => {
  const ls = memory();
  ls.setItem('k', '{not json');
  assert.equal(safeStorage({ localStorage: ls }).get('k'), null);
});

test('getItem and setItem throwing never escape', () => {
  const s = safeStorage({ localStorage: {
    getItem() { throw new Error('SecurityError'); },
    setItem() { throw new Error('QuotaExceededError'); },
  } });
  assert.equal(s.ok, true);
  assert.equal(s.get('k'), null);
  assert.equal(s.set('k', 1), false);
});

test('a throwing localStorage getter (blocked storage) gives ok=false and never throws', () => {
  const win = { get localStorage() { throw new Error('SecurityError'); } };
  const s = safeStorage(win);
  assert.equal(s.ok, false);
  assert.equal(s.get('k'), null);
  assert.equal(s.set('k', 1), false);
});

test('no storage at all: safeStorage(null) and a window without localStorage', () => {
  for (const win of [null, {}]) {
    const s = safeStorage(win);
    assert.equal(s.ok, false);
    assert.equal(s.get('k'), null);
    assert.equal(s.set('k', 1), false);
  }
});

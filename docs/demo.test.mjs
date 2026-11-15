// Guards docs/DEMO.md (issue 51, SHIP-FR-05): every deep link is a route the app keeps whole, the supplier and
// active IDs exist in the committed data, and the time budget is at most 3:00.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHash } from '../app/route.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const demo = read('./DEMO.md');
const links = [...demo.matchAll(/\]\(\.\.\/app\/(#[^)]+)\)/g)].map((m) => m[1]);

test('DEMO.md deep links survive the router unchanged', () => {
  assert.ok(links.length >= 8, `expected a link per step, found ${links.length}`);
  for (const hash of links) {
    const want = Object.fromEntries(hash.slice(1).split('&').map((kv) => kv.split('=')));
    const { view, role, params } = parseHash(hash);
    const got = { view, ...(want.role ? { role } : {}), ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) };
    assert.deepEqual(got, want, hash);  // a dropped or rewritten key means the link no longer opens that state
  }
});

test('DEMO.md supplier and active IDs exist in the data', () => {
  const suppliers = read('../data/suppliers.json');
  const history = read('../data/history.csv');
  for (const hash of links) {
    const { params } = parseHash(hash);
    if (params.supplier) assert.ok(suppliers.includes(`"${params.supplier}"`), params.supplier);
    if (params.active) assert.ok(history.includes(params.active), params.active);
  }
});

test('DEMO.md time budget is at most 3:00 and the total row is right', () => {
  const secs = (t) => { const [m, s] = t.split(':').map(Number); return m * 60 + s; };
  const steps = [...demo.matchAll(/^\| \d+ \| (\d:\d\d) \|/gm)].map((m) => secs(m[1]));
  const total = steps.reduce((a, b) => a + b, 0);
  assert.equal(steps.length, 8);
  assert.ok(total <= 180, `steps sum to ${total} s`);
  assert.equal(secs(demo.match(/\*\*(\d:\d\d)\*\*/)[1]), total);
});

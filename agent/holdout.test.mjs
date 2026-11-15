// Both publication and eval reject the same malformed hold-out shapes (issue 128).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, mkdtemp, cp, writeFile, rm, symlink, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { mergeHoldout, applyHoldout } from '../scripts/apply-holdout.mjs';
import { evalWorld, loadLockedKey } from './eval.mjs';

const source = new URL('../data/worlds/101/', import.meta.url);
const key = JSON.parse(await readFile(new URL('answer_key.json', source)));
const inventories = Object.fromEntries(await Promise.all(key.candidates.map(async c => [c.supplier_id, await readdir(new URL(`packets/${c.supplier_id}/`, source))])));
const entry = patch => ({ supplier_id: 'SUP-01', criterion: '2.ctq_cpk', expected_state: 'verified', expected_value: 0.9, file: 'capability_study.md', section: '2.1', ...patch });
async function fixture(t, entries) {
  const root = await mkdtemp(join(tmpdir(), 'sqc-shared-holdout-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const name of ['answer_key.json', 'answer_key.sha256', 'packets']) await cp(new URL(name, source), join(root, name), { recursive: true });
  await writeFile(join(root, 'holdout.json'), JSON.stringify(entries));
  return root;
}
const bad = [
  ['non-array', {}], ['null entry', [null]], ['missing field', [{ supplier_id: 'SUP-01' }]],
  ['extra field', [{ ...entry(), extra: true }]], ['unknown supplier', [entry({ supplier_id: 'SUP-99' })]],
  ['unknown criterion', [entry({ criterion: 'bogus' })]], ['inapplicable criterion', [entry({ criterion: '4.hipot' })]],
  ['duplicate', [entry(), entry()]], ['bad state', [entry({ expected_state: 'fine' })]],
  ['numeric section', [entry({ section: 2 })]], ['null section', [entry({ section: null })]],
  ['malformed section', [entry({ section: '2.a' })]], ['empty section', [entry({ section: '' })]],
  ['numeric file', [entry({ file: 2 })]], ['null file', [entry({ file: null })]],
  ['file traversal', [entry({ file: '../capability_study.md' })]], ['unknown file', [entry({ file: 'unknown.md' })]],
  ['buyer RFQ', [entry({ file: 'rfq.md' })]],
  ['verified null value', [entry({ expected_value: null })]], ['number as string', [entry({ expected_value: '0.9' })]],
  ['assumed wrong type', [entry({ expected_state: 'assumed', expected_value: false })]],
  ['missing nonnull value', [entry({ expected_state: 'missing', expected_value: 0 })]],
  ['bool as string', [entry({ criterion: '1.capa', expected_value: 'true' })]],
  ['invalid date', [entry({ criterion: '1.cert_current', expected_value: '2026-02-30' })]],
  ['invalid enum', [entry({ criterion: '9.region_risk', expected_value: 'unknown' })]],
  ['object value', [entry({ expected_value: {} })]], ['array value', [entry({ expected_value: [] })]]
];
for (const [name, entries] of bad) test(`shared holdout refuses ${name} in overlay and eval`, async t => {
  let overlayError;
  assert.throws(() => mergeHoldout(key, entries, inventories), error => { overlayError = error.message; return true; });
  const root = await fixture(t, entries);
  const result = evalWorld({ worldDir: root, runDir: join(root, 'no-run'), n: 101 });
  assert.equal(result.refused, null);
  assert.equal(result.holdout_refused, overlayError);
  assert.deepEqual(result.holdout, []);
  assert.equal(result.candidates[0].rows.length, key.candidates[0].criteria.length, 'rejected hold-outs must exclude no ordinary rows');
});
test('shared holdout accepts typed states and deleted-section provenance in both consumers', async t => {
  const entries = [entry(), entry({ criterion: '3.grr', expected_state: 'assumed', expected_value: null, file: 'msa.md' }), entry({ criterion: '1.capa', expected_state: 'missing', expected_value: null, file: 'quality_manual.md', section: '999.2' }), entry({ criterion: '1.cert_current', expected_value: '2024-02-29', file: 'certificates.md' }), entry({ criterion: '9.region_risk', expected_value: 'high', file: 'subtier.md' })];
  assert.doesNotThrow(() => mergeHoldout(key, entries, inventories));
  const root = await fixture(t, entries), result = evalWorld({ worldDir: root, runDir: join(root, 'no-run'), n: 101 });
  assert.equal(result.holdout_refused, null); assert.equal(result.holdout[0].rows.length, entries.length);
});
for (const mode of ['file', 'supplier', 'root']) test(`eval rejects symlink packet ${mode} like overlay`, async t => {
  const root = await fixture(t, [entry()]);
  const path = mode === 'file' ? join(root, 'packets/SUP-01/capability_study.md') : mode === 'supplier' ? join(root, 'packets/SUP-01') : join(root, 'packets');
  const target = join(root, 'original'); await rename(path, target); await symlink(target, path);
  const result = evalWorld({ worldDir: root, runDir: join(root, 'no-run'), n: 101 });
  assert.match(result.holdout_refused, /Unsafe|packet file/); assert.deepEqual(result.holdout, []);
});

test('shared holdout refuses an applicable criterion absent from a hash-valid locked key', async t => {
  const entries = [entry({ expected_state: 'missing', expected_value: null, section: '2' })];
  const incomplete = structuredClone(key);
  incomplete.candidates[0].criteria = incomplete.candidates[0].criteria.filter(row => row.criterion_id !== '2.ctq_cpk');
  const root = await fixture(t, entries);
  const bytes = JSON.stringify(incomplete, null, 2) + '\n';
  await writeFile(join(root, 'answer_key.json'), bytes);
  await writeFile(join(root, 'answer_key.sha256'), createHash('sha256').update(bytes).digest('hex') + '\n');
  assert.equal(loadLockedKey(root).ok, true, 'the existing lock validator accepts this hash-valid incomplete key');
  const result = evalWorld({ worldDir: root, runDir: join(root, 'no-run'), n: 101 });
  const reason = 'holdout.json[0]: unknown criterion "2.ctq_cpk" for SUP-01';
  assert.equal(result.refused, null);
  assert.equal(result.holdout_refused, reason);
  assert.deepEqual(result.holdout, []);
  assert.equal(result.candidates[0].rows.length, incomplete.candidates[0].criteria.length);
  assert.throws(() => mergeHoldout(incomplete, entries, inventories), error => error.message === reason);
  await assert.rejects(applyHoldout(root, join(root, 'holdout.json')), error => error.message === reason);
  assert.ok(!(await readdir(root)).includes('answer_key.holdout.json'));
  assert.equal(await readFile(join(root, 'answer_key.json'), 'utf8'), bytes);
});

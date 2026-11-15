import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, cp, readdir, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mergeHoldout, applyHoldout } from './apply-holdout.mjs';
import { evaluate } from '../app/engine.js';
import { validateExtraction } from '../agent/validate.mjs';
import { checkDrafts } from '../agent/drafts.mjs';

const source = new URL('../data/worlds/101/', import.meta.url);
const keyBytes = await readFile(new URL('answer_key.json', source));
const key = JSON.parse(keyBytes);
const inventories = Object.fromEntries(await Promise.all(key.candidates.map(async c => [c.supplier_id, await readdir(new URL(`packets/${c.supplier_id}/`, source))])));
const entry = (overrides = {}) => ({ supplier_id: 'SUP-01', criterion: '2.ctq_cpk', expected_state: 'verified', expected_value: 0.9, file: 'capability_study.md', section: '2.1', ...overrides });
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'sqc-holdout-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const file of ['answer_key.json', 'answer_key.sha256']) await cp(new URL(file, source), join(root, file));
  await cp(new URL('packets/', source), join(root, 'packets'), { recursive: true });
  const list = join(root, 'published-test-list.json');
  await writeFile(list, JSON.stringify([entry()]));
  return { root, list };
}
async function snapshot(root) {
  const files = {};
  async function visit(directory, prefix = '') {
    for (const name of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const relative = prefix + name.name;
      if (name.isDirectory()) await visit(join(directory, name.name), relative + '/');
      else files[relative] = digest(await readFile(join(directory, name.name)));
    }
  }
  await visit(root);
  return files;
}

test('overlay merges typed expectations with engine parity, missing provenance and untouched input', () => {
  const before = structuredClone(key);
  const entries = [entry(), entry({ criterion: '1.capa', expected_state: 'missing', expected_value: null, file: 'quality_manual.md', section: '999.2' }), entry({ criterion: '3.grr', expected_state: 'assumed', expected_value: null, file: 'msa.md', section: '3' }), entry({ criterion: '4.coolant_compat', expected_state: 'missing', expected_value: null, file: 'reliability_report.md', section: '4' })];
  const overlay = mergeHoldout(key, entries, inventories);
  assert.deepEqual(key, before);
  assert.deepEqual(overlay.holdout, entries);
  assert.deepEqual(overlay, mergeHoldout(key, entries, inventories));
  assert.deepEqual(overlay.candidates.slice(1), key.candidates.slice(1));
  assert.deepEqual(overlay.scorecard, key.scorecard);
  assert.equal(overlay.seed, key.seed); assert.equal(overlay.as_of, key.as_of); assert.deepEqual(overlay.policy, key.policy);
  const c = overlay.candidates[0];
  assert.deepEqual(c.evaluation, evaluate(c.reference, { as_of: key.as_of }));
  assert.equal(validateExtraction(c.reference, { packetFiles: inventories['SUP-01'] }).ok, true);
  assert.equal(checkDrafts(c.reference, { as_of: key.as_of }).ok, true);
  for (const h of entries) {
    const row = c.criteria.find(r => r.criterion_id === h.criterion), ref = c.reference.criteria.find(r => r.id === h.criterion);
    assert.equal(row.expected_state, h.expected_state); assert.equal(row.expected_value, h.expected_value);
    assert.equal(ref.state, h.expected_state); assert.equal(ref.value, h.expected_value);
    assert.equal(row.expected_citation, h.expected_state === 'missing' ? null : `${h.file} §${h.section}`);
    assert.equal(ref.citation, row.expected_citation);
    const score = c.evaluation.categories.flatMap(cat => cat.criteria).find(r => r.id === h.criterion);
    assert.equal(row.expected_score, score?.score ?? null);
    assert.equal(row.scored, Boolean(score));
    assert.equal(row.kind, score ? score.gap : 'info');
  }
  assert.equal(c.criteria.find(r => r.criterion_id === '2.ctq_cpk').expected_score, 0);
  for (const row of key.candidates[0].criteria.filter(r => !entries.some(h => h.criterion === r.criterion_id))) assert.deepEqual(c.criteria.find(r => r.criterion_id === row.criterion_id), row);
  const empty = mergeHoldout(key, [], inventories); assert.deepEqual(empty, { ...key, holdout: [] });
});

test('overlay rejects unknown suppliers, unknown or nonapplicable criteria and duplicates', () => {
  for (const entries of [[entry({ supplier_id: 'SUP-99' })], [entry({ criterion: 'bogus' })], [entry({ criterion: '4.hipot' })], [entry(), entry()]]) assert.throws(() => mergeHoldout(key, entries, inventories), /unknown|inapplicable|duplicate/);
});

test('overlay rejects malformed entries, state/value types and numbered citations', () => {
  const noValue = entry(); delete noValue.expected_value;
  for (const entries of [null, {}, [null], [noValue], [{ ...entry(), extra: 1 }], [entry({ expected_state: 'fine' })], [entry({ expected_state: 'missing', expected_value: 1 })], [entry({ expected_value: null })], [entry({ expected_value: '0.9' })], [entry({ expected_value: Infinity })], [entry({ criterion: '1.capa', expected_value: 'true' })], [entry({ criterion: '1.cert_current', expected_value: '2026-02-30' })], [entry({ criterion: '9.region_risk', expected_value: 'unknown' })], [entry({ section: 2 })], [entry({ section: '2.a' })]]) assert.throws(() => mergeHoldout(key, entries, inventories));
  for (const h of [entry({ expected_state: 'assumed', expected_value: 1.1 }), entry({ criterion: '1.capa', expected_value: false }), entry({ criterion: '1.cert_current', expected_value: '2024-02-29' }), entry({ criterion: '9.region_risk', expected_value: 'high' })]) assert.doesNotThrow(() => mergeHoldout(key, [h], inventories));
  assert.throws(() => mergeHoldout({ ...key, holdout: [] }, [], inventories), /original/);
});

test('overlay rejects missing, unsafe and buyer packet files', () => {
  for (const file of ['unknown.md', '../capability_study.md', '/capability_study.md', 'rfq.md', 'CAPABILITY.md', 'capability_study.json']) assert.throws(() => mergeHoldout(key, [entry({ file })], inventories), /packet file/);
});

test('disk overlay exclusively creates a source-linked copy and preserves original world bytes', async t => {
  const { root, list } = await fixture(t), before = await snapshot(root);
  const result = await applyHoldout(root, list);
  assert.equal(result.source_answer_key_sha256, digest(keyBytes));
  assert.deepEqual(JSON.parse(await readFile(join(root, 'answer_key.holdout.json'))), result);
  const after = await snapshot(root); delete after['answer_key.holdout.json']; assert.deepEqual(after, before);
  const frozen = await snapshot(root);
  await assert.rejects(applyHoldout(root, list), /EEXIST/);
  assert.deepEqual(await snapshot(root), frozen);
});

test('disk overlay refuses tampered locks and invalid lists without writing', async t => {
  for (const mode of ['key', 'hash', 'json', 'criterion', 'file']) {
    const { root, list } = await fixture(t);
    if (mode === 'key') await writeFile(join(root, 'answer_key.json'), Buffer.concat([keyBytes, Buffer.from(' ')]));
    if (mode === 'hash') await writeFile(join(root, 'answer_key.sha256'), digest(keyBytes));
    if (mode === 'json') await writeFile(list, '{');
    if (mode === 'criterion') await writeFile(list, JSON.stringify([entry({ criterion: 'unknown' })]));
    if (mode === 'file') await writeFile(list, JSON.stringify([entry({ file: 'missing.md' })]));
    const before = await snapshot(root);
    await assert.rejects(applyHoldout(root, list));
    assert.deepEqual(await snapshot(root), before);
  }
});

test('disk overlay refuses symlink packet files and directories', async t => {
  for (const mode of ['file', 'supplier', 'root']) {
    const { root, list } = await fixture(t);
    const path = mode === 'file' ? join(root, 'packets/SUP-01/capability_study.md') : mode === 'supplier' ? join(root, 'packets/SUP-01') : join(root, 'packets');
    const target = join(root, 'retained-original');
    const { rename } = await import('node:fs/promises'); await rename(path, target); await symlink(target, path);
    await assert.rejects(applyHoldout(root, list), /Unsafe|packet file/);
    assert.ok(!(await readdir(root)).includes('answer_key.holdout.json'));
  }
});

test('CLI writes overlay for valid published list and rejects invalid usage or data', async t => {
  const script = new URL('./apply-holdout.mjs', import.meta.url).pathname;
  const { root, list } = await fixture(t);
  const run = args => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  const good = run(['--world', root, '--holdout', list]); assert.equal(good.status, 0, good.stderr); assert.match(good.stdout, /original lock unchanged/);
  for (const [args, message] of [[[], /Usage:/], [['--world', root], /Usage:/], [['--world', root, '--world', root], /exactly once/], [['--other', root, '--holdout', list], /exactly once/], [['--world', '--holdout', '--holdout', list], /exactly once/], [['--world', root, '--holdout', list], /EEXIST/]]) {
    const result = run(args); assert.notEqual(result.status, 0); assert.match(result.stderr, message);
  }
  const second = await fixture(t); await writeFile(second.list, JSON.stringify([entry({ criterion: 'unknown' })]));
  assert.notEqual(run(['--holdout', second.list, '--world', second.root]).status, 0);
  assert.ok(!(await readdir(second.root)).includes('answer_key.holdout.json'));
});

test('re-read compare rejects a replaced key even when its replacement hash matches', async t => {
  const { root, list } = await fixture(t);
  const script = `
    import promises from 'node:fs/promises';
    import { readFileSync, writeFileSync } from 'node:fs';
    import { syncBuiltinESMExports } from 'node:module';
    import { createHash } from 'node:crypto';
    import assert from 'node:assert/strict';
    const originalRead = promises.readFile;
    let replaced = false;
    promises.readFile = async (path, ...args) => {
      const result = await originalRead(path, ...args);
      if (path === ${JSON.stringify(list)}) {
        const keyPath = ${JSON.stringify(join(root, 'answer_key.json'))};
        const key = JSON.parse(readFileSync(keyPath));
        key.seed = 102;
        const bytes = JSON.stringify(key, null, 2) + '\\n';
        const hash = createHash('sha256').update(bytes).digest('hex') + '\\n';
        writeFileSync(keyPath, bytes);
        writeFileSync(${JSON.stringify(join(root, 'answer_key.sha256'))}, hash);
        assert.equal(createHash('sha256').update(readFileSync(keyPath)).digest('hex') + '\\n', hash);
        replaced = true;
      }
      return result;
    };
    syncBuiltinESMExports();
    const { applyHoldout } = await import(${JSON.stringify(new URL('./apply-holdout.mjs', import.meta.url).href)});
    await assert.rejects(applyHoldout(${JSON.stringify(root)}, ${JSON.stringify(list)}), /Original answer key changed during overlay/);
    assert.equal(replaced, true);
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(!(await readdir(root)).includes('answer_key.holdout.json'));
});

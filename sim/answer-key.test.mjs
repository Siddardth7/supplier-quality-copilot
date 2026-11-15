import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { factsToReference, buildAnswerKey, writeAnswerKey } from './answer-key.mjs';
import { simulateCandidates, writeCandidateFacts } from './candidate.mjs';
import { simulateHistory, renderHistory } from './history.mjs';
import { sampleWorld } from './world.mjs';
import { RUBRIC, evaluate, scorecard, parseHistory } from '../app/engine.js';
import { validateExtraction } from '../agent/validate.mjs';
import { loadLockedKey } from '../agent/eval.mjs';
const facts = await simulateCandidates(101), history = await simulateHistory(101);
const clone = () => structuredClone(facts);
const options = { as_of: '2026-11-01' };

test('reference disclosure isolates hidden truth and preserves public false zero null and precision', () => {
  const f = clone()[0];
  for (const [id, value] of [['1.cert_scope', false], ['2.ctq_cpk', 0], ['3.grr', null]]) Object.assign(f.criteria[id], { disclosure: 'assumed', claimed_value: value, claim: 'claimed evidence', file: 'quality_manual.md', section: '1.1' });
  Object.assign(f.criteria['9.financial_health'], { disclosure: 'missing', true_value: true, file: null, section: null});
  const r = factsToReference(f), by = Object.fromEntries(r.criteria.map(c => [c.id, c]));
  assert.equal(by['1.cert_scope'].value, false);
  assert.equal(by['2.ctq_cpk'].value, 0);
  assert.equal(by['3.grr'].value, null);
  assert.equal(by['9.financial_health'].value, null);
  assert.equal(by['9.financial_health'].citation, null);
  assert.match(by['1.cert_scope'].note, /claimed evidence/);
  assert.ok(by['9.financial_health'].note.length);
  assert.equal(by['1.cert_current'].value, f.criteria['1.cert_current'].true_value);
  assert.equal(by['6.capacity_ratio'].value, f.criteria['6.capacity_ratio'].true_value);
  assert.equal(validateExtraction(r).ok, true);
  const e = evaluate(r, options);
  assert.deepEqual(r.drafts.rfi_items, e.rfi_items);
  assert.deepEqual(r.drafts.audit_focus, e.audit_focus);
  assert.match(r.drafts.rfi_email, /^DRAFT —/);
  assert.deepEqual(r.drafts.audit_plan.map(a => a.criterion_id), e.audit_focus);
});

test('answer key equals real engine and maps every scored and nice criterion gap', () => {
  const fs = clone();
  const f = fs[0];
  Object.assign(f.criteria['2.ctq_cpk'], { disclosure: 'verified', true_value: 1.1});
  Object.assign(f.criteria['1.cert_scope'], { disclosure: 'assumed', claimed_value: false, claim: 'false', file: 'quality_manual.md', section: '1'});
  Object.assign(f.criteria['1.internal_audit'], { disclosure: 'missing', file: null, section: null});
  const nice = RUBRIC.commodities.find(p => p.key === f.commodity).nice[0];
  Object.assign(f.criteria[nice], { disclosure: 'missing', file: null, section: null});
  const key = buildAnswerKey(101, fs, parseHistory(renderHistory(history)));
  assert.equal(key.seed, 101);
  assert.equal(key.as_of, '2026-11-01');
  assert.deepEqual(key.scorecard, scorecard(history, options));
  const kinds = new Set();
  for (const c of key.candidates) {
    assert.deepEqual(c.evaluation, evaluate(c.reference, options));
    assert.equal(c.criteria.length, c.reference.criteria.length);
    const scored = new Map(c.evaluation.categories.flatMap(cat => cat.criteria.map(r => [r.id, r])));
    for (const row of c.criteria) {
    const r = c.reference.criteria.find(r => r.id === row.criterion_id), s = scored.get(row.criterion_id);
      assert.equal(row.expected_value, r.value);
      assert.equal(row.expected_state, r.state);
      assert.equal(row.expected_citation, r.citation);
      assert.equal(row.expected_score, s?.score ?? null);
      assert.equal(row.scored, Boolean(s));
      assert.equal(row.kind, s ? s.gap : r.state === 'verified' ? null : 'info');
      kinds.add(row.kind);
    }
  }
  for (const kind of ['fail', 'assumed', 'missing', 'info']) assert.ok(kinds.has(kind), kind);
});

test('actual candidate fixture seed 93 meets all archetype decision and routing targets', async () => {
  const fs = await simulateCandidates(93), key = buildAnswerKey(93, fs, await simulateHistory(93));
  for (const target of sampleWorld(93).candidates) {
    const c = key.candidates.find(c => c.supplier_id === target.id);
    assert.equal(c.evaluation.decision, target.target.decision, target.id);
    assert.equal(c.evaluation.routing.to, target.target.routing.toLowerCase(), target.id);
  }
});

test('malformed facts identity criteria disclosures citations and history are rejected', () => {
  const patches = [
    f => f.seed = -1,
    f => f.supplier_id = '../bad',
    f => f.commodity = 'bad',
    f => delete f.criteria['1.cert_scope'],
    f => f.criteria.extra = {},
    f => f.criteria['1.cert_scope'].disclosure = 'bad',
    f => Object.assign(f.criteria['1.cert_scope'], { disclosure: 'verified', file: 'evil.md' }),
    f => Object.assign(f.criteria['1.cert_scope'], { disclosure: 'assumed', claim: '' }),
    f => Object.assign(f.criteria['1.cert_scope'], { disclosure: 'verified', true_value: 'bad' })
  ];
  for (const patch of patches) {
    const f = clone()[0];
    patch(f);
    assert.throws(() => factsToReference(f));
  }
  assert.throws(() => buildAnswerKey(-1, facts, history));
  assert.throws(() => buildAnswerKey(101, facts.slice(1), history));
  const duplicate = clone();
  duplicate[1] = duplicate[0];
  assert.throws(() => buildAnswerKey(101, duplicate, history));
  const mismatch = clone();
  mismatch[0].seed = 102;
  assert.throws(() => buildAnswerKey(101, mismatch, history));
  assert.throws(() => buildAnswerKey(101, facts, [{date: 'bad'}]));
});

test('writer deterministic bytes references SHA256 consumer tamper and CLI integration', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'sqc-key-'));
  t.after(() => rm(dir, {recursive: true, force: true}));
  await writeCandidateFacts(101, join(dir, 'facts'));
  await writeFile(join(dir, 'history.csv'), renderHistory(history));
  const key = await writeAnswerKey(dir), first = await readFile(join(dir, 'answer_key.json'));
  assert.equal(first.toString(), JSON.stringify(key, null, 2) + '\n');
  assert.equal(await readFile(join(dir, 'answer_key.sha256'), 'utf8'), createHash('sha256').update(first).digest('hex') + '\n');
  for (const c of key.candidates)assert.equal(await readFile(join(dir, 'reference', c.supplier_id + '.json'), 'utf8'), JSON.stringify(c.reference, null, 2) + '\n');
  assert.equal(loadLockedKey(dir).ok, true);
  await writeAnswerKey(dir);
  assert.deepEqual(await readFile(join(dir, 'answer_key.json')), first);
  execFileSync(process.execPath, ['sim/answer-key.mjs', '--world', dir]);
  assert.deepEqual(await readFile(join(dir, 'answer_key.json')), first);
  const edited = Buffer.from(first);
  edited[0] = 32;
  await writeFile(join(dir, 'answer_key.json'), edited);
  assert.equal(loadLockedKey(dir).ok, false);
  assert.throws(() => execFileSync(process.execPath, ['sim/answer-key.mjs'], {stdio: 'pipe'}));
  await writeFile(join(dir, 'history.csv'), 'bad');
  await assert.rejects(writeAnswerKey(dir));
});

test('history must cover the active roster and writer must bind its bytes to the seed', async t => {
  assert.throws(() => buildAnswerKey(101, facts, []), /History active supplier roster mismatch/);
  assert.throws(() => buildAnswerKey(101, facts, history.filter(row => row.supplier_id !== 'ACT-01')), /History active supplier roster mismatch/);
  assert.throws(() => buildAnswerKey(101, facts, [...history, { ...history[0], supplier_id: 'ACT-99' }]), /History active supplier roster mismatch/);
  const dir = await mkdtemp(join(tmpdir(), 'sqc-key-history-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeCandidateFacts(101, join(dir, 'facts'));
  for (const csv of [renderHistory(await simulateHistory(102)), renderHistory(history).replace('\n', '\r\n')]) {
    await writeFile(join(dir, 'history.csv'), csv);
    await assert.rejects(writeAnswerKey(dir), /History does not match world seed/);
    await assert.rejects(readFile(join(dir, 'answer_key.sha256')), { code: 'ENOENT' });
  }
});

test('every final reference validates its engine-derived drafts and planned citations', () => {
  const packetFiles = ['cover_letter.md', 'quality_manual.md', 'certificates.md', 'capability_study.md', 'msa.md', 'reliability_report.md', 'capacity.md', 'subtier.md', 'pcn_policy.md'];
  const key = buildAnswerKey(101, facts, history);
  for (const { reference, evaluation } of key.candidates) {
    assert.deepEqual(validateExtraction(reference, { packetFiles }), { ok: true, errors: [] });
    assert.deepEqual(reference.drafts.rfi_items, evaluation.rfi_items);
    assert.deepEqual(reference.drafts.audit_focus, evaluation.audit_focus);
    assert.deepEqual(reference.drafts.audit_plan.map(row => row.criterion_id), evaluation.audit_focus);
    assert.ok(reference.drafts.audit_plan.every(row => row.question.trim()));
  }
});

test('missing notes identify criterion-specific planned evidence scopes without citations', () => {
  const fact = clone()[0];
  const scopes = {
    '1.cert_current': 'certificates.md', '1.internal_audit': 'quality_manual.md', '2.ctq_cpk': 'capability_study.md', '3.grr': 'msa.md', '4.leak_test': 'reliability_report.md', '6.capacity_ratio': 'capacity.md', '7.pcn_notice': 'pcn_policy.md', '8.flowdown': 'subtier.md', '9.second_source': 'cover_letter.md', };
  for (const id of Object.keys(scopes)) {
    Object.assign(fact.criteria[id], { disclosure: 'missing', file: null, section: null });
  }
  const reference = factsToReference(fact);
  for (const [id, file] of Object.entries(scopes)) {
    const row = reference.criteria.find(row => row.id === id);
    assert.ok(row.note.includes(id));
    assert.ok(row.note.includes(file));
    assert.ok(row.note.length <= 240);
    assert.equal(row.citation, null);
    assert.equal(row.value, null);
  }
});

// Engine refuses impossible evidence values (issue 161; QUAL-FR-16, QUAL-AC-12). Bounds come from rubric.js
// `range` (pinned to docs/RUBRIC.md § Value bounds by parity.test.js); scores at the edges are hand-pinned
// from the RUBRIC.md bands, never from engine output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { RUBRIC, evaluate, scoreCriterion, findCriterion } from './engine.js';
import { perfectExtraction } from './rubric.testkit.js';

const AS_OF = '2026-11-01';
const CITE = 'x §1';
const NUMBER_DEFS = [...RUBRIC.criteria, ...RUBRIC.tests].filter((d) => d.type === 'number');
const score = (id, state, value) => scoreCriterion(findCriterion(RUBRIC, id), { state, value, citation: CITE }, AS_OF);
const refused = (id, state, value, message) =>
  assert.throws(() => score(id, state, value), (e) => {
    assert.equal(e.message, message, `${id} ${state} ${value}`);
    assert.equal(e.code, 'out_of_range', `${id} ${state} ${value} code`);
    return true;
  });
// Assumed caps at 1 (RUBRIC.md § Evidence states).
const both = (id, value, verifiedScore) => {
  assert.equal(score(id, 'verified', value), verifiedScore, `${id} verified ${value}`);
  assert.equal(score(id, 'assumed', value), Math.min(1, verifiedScore), `${id} assumed ${value}`);
};

// ---- 1. per value type: below, at the edge, above ----

test('1: every number criterion and test carries a range, except 2.ctq_cpk (a new number needs a bound decision)', () => {
  assert.ok(NUMBER_DEFS.length >= 7, 'number defs read from RUBRIC');
  for (const d of NUMBER_DEFS) {
    if (d.id === '2.ctq_cpk') assert.equal(d.range, undefined, 'Cpk has no bound');
    else assert.ok(d.range && d.range.min === 0, `${d.id}: range.min 0`);
  }
});

// [id, score at 0, a large value, its score] from the RUBRIC.md bands.
const MIN0 = [
  ['3.grr', 3, 1000, 0], // <= 10 -> 3; > 30 -> 0
  ['5.records_retention', 0, 50, 3],
  ['6.capacity_ratio', 0, 100, 3],
  ['7.pcn_notice', 0, 1000, 3],
  ['4.fpy_data', 0, 1000, 3],
];

test('1 QUAL-FR-16: min-0 numbers refuse just below 0, accept 0 and -0, accept large values (verified and assumed)', () => {
  // Every min-only number in RUBRIC is in the table, so the loop covers new ones by failing here.
  assert.deepEqual(MIN0.map(([id]) => id).sort(),
    NUMBER_DEFS.filter((d) => d.range && d.range.max === undefined).map((d) => d.id).sort());
  for (const [id, atZero, big, atBig] of MIN0) {
    for (const state of ['verified', 'assumed']) {
      refused(id, state, -0.01, `${id}: expected a number >= 0, got -0.01`);
      refused(id, state, -1e-9, `${id}: expected a number >= 0, got -1e-9`);
    }
    both(id, 0, atZero);
    both(id, -0, atZero);
    both(id, big, atBig);
  }
});

test('1 QUAL-FR-16: 4.fai (0..1) refuses below 0 and above 1, accepts 0, 0.9, 0.9999 and 1 (verified and assumed)', () => {
  for (const state of ['verified', 'assumed']) {
    refused('4.fai', state, -0.01, '4.fai: expected a number from 0 to 1, got -0.01');
    refused('4.fai', state, 1.0000001, '4.fai: expected a number from 0 to 1, got 1.0000001');
    refused('4.fai', state, 1.2, '4.fai: expected a number from 0 to 1, got 1.2');
  }
  both('4.fai', 0, 0);
  both('4.fai', 0.9, 2);
  both('4.fai', 0.9999, 2);
  both('4.fai', 1, 3);
});

test('1 QUAL-AC-12: Cpk is unbounded: -0.5 and -100 score 0; Infinity and NaN keep the finite-number message', () => {
  both('2.ctq_cpk', -0.5, 0);
  both('2.ctq_cpk', -100, 0);
  for (const v of [Infinity, NaN]) {
    assert.throws(() => score('2.ctq_cpk', 'verified', v), (e) => {
      assert.match(e.message, /^2\.ctq_cpk: expected a finite number, got /);
      assert.equal(e.code, undefined);
      return true;
    });
  }
  // The finite check runs first: NaN on a bounded criterion never reaches the range message.
  assert.throws(() => score('3.grr', 'verified', NaN), /^Error: 3\.grr: expected a finite number/);
});

test('1: evaluate refuses an out-of-range value on a full packet with the criterion id first', () => {
  const ext = perfectExtraction(RUBRIC, 'machined_part');
  const set = (id, ev) => ({ ...ext, criteria: ext.criteria.map((c) => (c.id === id ? { id, ...ev } : c)) });
  assert.equal(evaluate(ext, { as_of: AS_OF }).total, 100);
  assert.throws(() => evaluate(set('4.fai', { state: 'verified', value: 1.2, citation: CITE }), { as_of: AS_OF }),
    { message: '4.fai: expected a number from 0 to 1, got 1.2' });
  assert.throws(() => evaluate(set('3.grr', { state: 'assumed', value: -1, citation: null }), { as_of: AS_OF }),
    { message: '3.grr: expected a number >= 0, got -1' });
  // Cpk -0.5 still scores (0, a failed knockout), no throw.
  const r = evaluate(set('2.ctq_cpk', { state: 'verified', value: -0.5, citation: CITE }), { as_of: AS_OF });
  assert.deepEqual(r.knockouts.failed, ['2.ctq_cpk']);
});

// ---- 2, 3. untouched paths ----

test('2: missing with a bad value and assumed with null are not checked', () => {
  for (const d of NUMBER_DEFS) {
    assert.equal(score(d.id, 'missing', -5), 0, `${d.id} missing`);
    assert.equal(score(d.id, 'assumed', null), 1, `${d.id} assumed null`);
  }
});

test('3: a number criterion without range (custom rubric) is not bounded', () => {
  const def = { id: 'x.custom', type: 'number', rule: [{ op: '>=', x: 0, score: 3 }, { score: 0 }] };
  assert.equal(scoreCriterion(def, { state: 'verified', value: -5, citation: CITE }), 0);
  assert.equal(scoreCriterion({ ...findCriterion(RUBRIC, '4.fai'), range: undefined }, { state: 'verified', value: 7, citation: CITE }), 3);
});

// ---- 7. score parity on the shipped data (QUAL-AC-12) ----

const json = (rel) => JSON.parse(readFileSync(new URL(`../data/${rel}`, import.meta.url), 'utf8'));

test('7a QUAL-AC-12: every answer-key reference (data/, worlds 93, 101-104) evaluates to its stored evaluation', () => {
  let n = 0;
  for (const rel of ['answer_key.json', ...[93, 101, 102, 103, 104].map((s) => `worlds/${s}/answer_key.json`)]) {
    const key = json(rel);
    for (const c of key.candidates) {
      assert.deepEqual(evaluate(c.reference, { as_of: key.as_of }), c.evaluation, `${rel} ${c.supplier_id}`);
      n++;
    }
  }
  assert.equal(n, 54);
});

test('7b QUAL-AC-12: data/extracted totals are unchanged (SUP-03 68.4 is intended)', () => {
  const want = [84.5, 97.8, 68.4, 100, 97, 91.1, 84.4, 95.8, 100];
  const got = want.map((_, i) => evaluate(json(`extracted/SUP-0${i + 1}.json`), { as_of: AS_OF }).total);
  assert.deepEqual(got, want);
});

test('7c: every bounded numeric value anywhere in data/ is inside its RUBRIC range', () => {
  const ranges = new Map(NUMBER_DEFS.filter((d) => d.range).map((d) => [d.id, d.range]));
  const counts = new Map([...ranges.keys()].map((id) => [id, 0]));
  const bad = [];
  const walk = (node, key, file) => {
    if (Array.isArray(node)) { node.forEach((x) => walk(x, null, file)); return; }
    if (!node || typeof node !== 'object') return;
    const id = node.id ?? node.criterion_id ?? key;
    const r = ranges.get(id);
    if (r) {
      for (const f of ['value', 'expected_value', 'claimed_value', 'true_value']) {
        const v = node[f];
        if (typeof v !== 'number') continue;
        counts.set(id, counts.get(id) + 1);
        if ((r.min !== undefined && v < r.min) || (r.max !== undefined && v > r.max)) bad.push(`${file} ${id}.${f}=${v}`);
      }
    }
    for (const [k, v] of Object.entries(node)) walk(v, k, file);
  };
  const root = new URL('../data/', import.meta.url);
  const files = readdirSync(root, { recursive: true }).filter((f) => f.endsWith('.json'));
  assert.ok(files.length >= 138, `files ${files.length}`);
  for (const f of files) walk(json(f), null, f);
  assert.deepEqual(bad, []);
  for (const [id, n] of counts) assert.ok(n > 0, `${id}: no values found, walk is vacuous`);
});

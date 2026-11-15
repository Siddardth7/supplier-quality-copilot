// Engine: evaluate and weightsFromRatings (#17; QUAL-FR-03 applicability half, -05, -06, -07, -14,
// QUAL-AC-01 total/decision part, -03, -05, -10 engine half, -11, QUAL-NFR-01 partial).
// Every expected number is worked by hand from docs/RUBRIC.md (the derivation sits next to it),
// never copied from engine output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluate, weightsFromRatings } from './engine.js';
import { RUBRIC, STARK_REFERENCE } from './rubric.js';
import { perfectExtraction, withGeneratedCommodity, POLICY_META_REJECTS, POLICY_META_ACCEPTS, withMeta } from './rubric.testkit.js';
import { jsonBlock } from './docs.testkit.js';

const ENGINE_SRC = readFileSync(new URL('./engine.js', import.meta.url), 'utf8');
const RUBRIC_MD = readFileSync(new URL('../docs/RUBRIC.md', import.meta.url), 'utf8');
const AS_OF = '2026-11-09';
const CITE = 'test.md §1';
const V = (value) => ({ state: 'verified', value, citation: CITE, note: null });
const A = (value) => ({ state: 'assumed', value, citation: null, note: null });
const M = { state: 'missing', value: null, citation: null, note: null };

// Replace (in place) or append evidence per id; undefined removes the id from the extraction.
function edit(ext, overrides) {
  const criteria = ext.criteria.flatMap((c) => {
    if (!Object.hasOwn(overrides, c.id)) return [c];
    return overrides[c.id] === undefined ? [] : [{ id: c.id, ...overrides[c.id] }];
  });
  for (const [id, ev] of Object.entries(overrides)) {
    if (ev !== undefined && !ext.criteria.some((c) => c.id === id)) criteria.push({ id, ...ev });
  }
  return { ...ext, criteria };
}
const perfect = (key = 'cold_plate') => perfectExtraction(RUBRIC, key);
const run = (ext, opts = {}) => evaluate(ext, { as_of: AS_OF, ...opts });
const pol = (q) => ({ ...STARK_REFERENCE, qualification: { ...STARK_REFERENCE.qualification, ...q } });
const wts = (w) => pol({ weights: w });
const scores = (r) => r.categories.map((c) => c.score);
const rowOf = (r, id) => r.categories.flatMap((c) => c.criteria).find((x) => x.id === id);
const catIds = (n) => RUBRIC.criteria.filter((c) => c.cat === n).map((c) => c.id);
const dropCats = (ext, ...ns) => edit(ext, Object.fromEntries(ns.flatMap(catIds).map((id) => [id, undefined])));
const throwsAt = (fn, prefix, msg) =>
  assert.throws(fn, (e) => e instanceof Error && e.message.startsWith(`${prefix}:`), msg ?? prefix);
const deepFreeze = (o) => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
};

// SUP-07, RUBRIC.md § Worked example.
const SUP07 = edit(perfect('cold_plate'), {
  '2.ctq_cpk': V(1.12), '2.spc': A(null), '6.capacity_ratio': V(0.85), '6.lead_time': V(false),
  '6.ramp_plan': A(null), '8.subtier_named': M, '8.subtier_certs': M,
  '4.thermal_cycling': M, '4.coolant_compat': V(true),
});

// Effective knockouts per commodity, read from the rubric data (★ rows, knockout_risk, required tests).
const knockoutsOf = (p) => [
  ...RUBRIC.criteria.filter((c) => c.knockout && (!c.knockout_risk || c.knockout_risk.includes(p.risk))).map((c) => c.id),
  ...p.required,
];
const defOf = (id) => RUBRIC.criteria.find((c) => c.id === id) ?? RUBRIC.tests.find((t) => t.id === id);
// A value scoring 0 under the criterion's own rule (read from its data, not the engine).
function zeroValue(d) {
  if (d.type === 'bool') { assert.equal(d.rule.false, 0, d.id); return false; }
  if (d.type === 'date') return '2026-11-08'; // the day before AS_OF
  assert.equal(d.type, 'number', d.id);
  assert.equal(d.rule.at(-1).score, 0, d.id);
  const xs = d.rule.slice(0, -1).map((b) => b.x);
  return d.rule[0].op.startsWith('>') ? Math.min(...xs) - 1 : Math.max(...xs) + 1;
}

// ---- 1. SUP-07 worked example ----

test('1: SUP-07 worked example gives 82.6 CONDITIONAL with the doc category scores', () => {
  const r = run(SUP07);
  assert.equal(r.total, 82.6); // 82.5556 unrounded, RUBRIC.md L239
  assert.equal(r.decision, 'CONDITIONAL');
  assert.equal(r.risk, 'High');
  assert.deepEqual(scores(r), [15, 10, 10, 15, 10, 2.2, 8, 2.3, 10]);
  assert.deepEqual(r.knockouts, { failed: [], assumed: [] });
  assert.deepEqual(r.warnings, []);
  // The displayed categories add up to 82.5: the total comes from the unrounded scores.
  assert.equal(Math.round(scores(r).reduce((s, x) => s + x, 0) * 10) / 10, 82.5);
  assert.deepEqual(r.categories[3].criteria.map((x) => x.id),
    ['4.leak_test', '4.burst_pressure', '4.cleanliness', '4.material_cert', '4.method_criteria', '4.sample_size']);
  assert.deepEqual(r.categories.map((c) => c.criteria.length), [5, 4, 2, 6, 3, 3, 2, 3, 3]);
});

// ---- 2. category formula ----

test('2: a perfect packet scores every category at its weight and totals 100, for every commodity', () => {
  for (const p of RUBRIC.commodities) {
    const r = run(perfect(p.key));
    assert.equal(r.total, 100, p.key);
    assert.deepEqual(scores(r), [15, 15, 10, 15, 10, 10, 8, 7, 10], p.key);
    assert.equal(r.decision, 'APPROVED', p.key);
    assert.equal(r.categories[3].criteria.length, p.required.length + 2, `${p.key} cat 4 rows`);
  }
});

test('2: one criterion lowered changes only its category by sum/(3n)*weight', () => {
  const r = run(edit(perfect('cold_plate'), { '1.capa': M }));
  assert.equal(r.categories[0].score, 12); // 12/15*15
  assert.equal(r.total, 97);
  const q = run(edit(perfect('quick_disconnect'), { '4.method_criteria': V(false) }));
  assert.equal(q.categories[3].criteria.length, 5); // 3 required + 2
  assert.equal(q.categories[3].score, 12); // 12/15*15
  // power_module's nice-to-have 4.halt is not a row and does not count in n.
  const pm = run(edit(perfect('power_module'), { '4.halt': V(true), '4.method_criteria': V(false) }));
  assert.equal(pm.categories[3].criteria.length, 5);
  assert.equal(pm.categories[3].score, 12);
});

// ---- 3. threshold edges ----

// Category 7 all missing (no knockouts there); every other category perfect, so total = 100 - W.
const edgePolicy = (W) => wts({ 1: 0, 2: 0, 3: 0, 4: 63 - W, 5: 10, 6: 10, 7: W, 8: 7, 9: 10 });
const edgeRun = (W) => run(dropCats(perfect('cold_plate'), 7), { policy: edgePolicy(W) });

test('3: total edges at 85 and 70 on the rounded total (QUAL-AC-05)', () => {
  const cases = [[15, 85, 'APPROVED'], [15.1, 84.9, 'CONDITIONAL'], [15.05, 85, 'APPROVED'],
    [30, 70, 'CONDITIONAL'], [30.1, 69.9, 'NOT APPROVED'], [30.05, 70, 'CONDITIONAL']];
  for (const [W, total, decision] of cases) {
    const r = edgeRun(W);
    assert.equal(r.total, total, `W=${W}`);
    assert.equal(r.decision, decision, `W=${W}`);
    assert.deepEqual(r.knockouts, { failed: [], assumed: [] }, `W=${W}`);
  }
});

test('3: a tie that floating point sums to just below .x5 still rounds half up', () => {
  // Category 7 missing, the rest perfect: total = 100 - w7 exactly (84.95 and 69.95), but the
  // float sum of these weights is 84.94999999999999 / 69.94999999999999.
  const hi = wts({ 1: 18.8, 2: 18.87, 3: 13.57, 4: 17.11, 5: 10.55, 6: 4.94, 7: 15.05, 8: 0.26, 9: 0.85 });
  const lo = wts({ 1: 5.83, 2: 22.66, 3: 11.44, 4: 21.57, 5: 5.36, 6: 1.96, 7: 30.05, 8: 0.58, 9: 0.55 });
  const a = run(dropCats(perfect('cold_plate'), 7), { policy: hi });
  assert.equal(a.total, 85);
  assert.equal(a.decision, 'APPROVED');
  const b = run(dropCats(perfect('cold_plate'), 7), { policy: lo });
  assert.equal(b.total, 70);
  assert.equal(b.decision, 'CONDITIONAL');
});

test('3: reference policy, cold plate with categories 7 and 8 missing is exactly 85 and APPROVED', () => {
  const r = run(dropCats(perfect('cold_plate'), 7, 8));
  assert.equal(r.total, 85); // 100 - 8 - 7
  assert.equal(r.decision, 'APPROVED');
});

// ---- 4. knockouts override a high total ----

test('4: every knockout of every commodity at 0 forces NOT APPROVED and is listed alone (QUAL-AC-03)', () => {
  for (const p of RUBRIC.commodities) {
    const kos = knockoutsOf(p);
    assert.ok(kos.length >= 6, p.key);
    for (const id of kos) {
      for (const ev of [V(zeroValue(defOf(id))), M, undefined]) {
        const label = `${p.key} ${id} ${ev ? ev.state : 'absent'}`;
        const r = run(edit(perfect(p.key), { [id]: ev }));
        assert.ok(r.total >= 85, `${label}: total ${r.total}`);
        assert.equal(r.decision, 'NOT APPROVED', label);
        assert.deepEqual(r.knockouts.failed, [id], label);
        assert.deepEqual(r.knockouts.assumed, [], label);
        assert.equal(rowOf(r, id).knockout, true, label);
        assert.equal(rowOf(r, id).score, 0, label);
      }
    }
  }
});

test('4: hand-checked knockout totals', () => {
  const cpk = run(edit(perfect('cold_plate'), { '2.ctq_cpk': V(0.5) }));
  assert.equal(cpk.total, 96.3); // 15 - 9/12*15 = 3.75 off, 96.25 half up
  const grr = run(edit(perfect('cold_plate'), { '3.grr': V(31) }));
  assert.equal(grr.total, 95); // 10 - 3/6*10 = 5 off
  assert.deepEqual(grr.knockouts.failed, ['3.grr']);
  const cert = run(edit(perfect('cold_plate'), { '1.cert_current': V('2026-11-08') }));
  assert.deepEqual(cert.knockouts.failed, ['1.cert_current']);
  assert.equal(cert.total, 97);
});

test('4: 5.lot_trace is a knockout only on High risk', () => {
  for (const key of ['machined_part', 'sheet_metal']) {
    const r = run(edit(perfect(key), { '5.lot_trace': V(false) }));
    assert.deepEqual(r.knockouts.failed, [], key);
    assert.equal(r.decision, 'APPROVED', key);
    assert.equal(r.total, 96.7, key); // 100 - 3/9*10
    assert.equal(rowOf(r, '5.lot_trace').knockout, false, key);
    assert.equal(rowOf(r, '5.lot_trace').score, 0, key);
    assert.equal(r.categories[4].criteria.length, 3, key);
    // assumed on Medium/Low does not cap APPROVED
    const a = run(edit(perfect(key), { '5.lot_trace': A(null) }));
    assert.deepEqual(a.knockouts.assumed, [], key);
    assert.equal(a.decision, 'APPROVED', key);
  }
  const hi = run(edit(perfect('cold_plate'), { '5.lot_trace': V(false) }));
  assert.equal(hi.decision, 'NOT APPROVED');
  assert.deepEqual(hi.knockouts.failed, ['5.lot_trace']);
  assert.equal(rowOf(hi, '5.lot_trace').knockout, true);
});

// ---- 5. assumed knockouts ----

test('5: assumed knockout with a failing claimed value fails (Cpk 0.9 -> 96.3 NOT APPROVED)', () => {
  const r = run(edit(perfect('cold_plate'), { '2.ctq_cpk': A(0.9) }));
  assert.equal(r.categories[1].score, 11.3); // (3+3+0+3)/12*15 = 11.25
  assert.equal(r.total, 96.3); // 100 - 3.75 = 96.25, half up
  assert.equal(r.decision, 'NOT APPROVED');
  assert.deepEqual(r.knockouts, { failed: ['2.ctq_cpk'], assumed: [] });
  assert.equal(rowOf(r, '2.ctq_cpk').state, 'assumed');
  assert.equal(rowOf(r, '2.ctq_cpk').score, 0);
});

test('5: assumed knockout with null or a passing claim caps at CONDITIONAL (97.5)', () => {
  for (const value of [null, 1.5, undefined]) {
    const ev = { state: 'assumed', citation: null };
    if (value !== undefined) ev.value = value;
    const r = run(edit(perfect('cold_plate'), { '2.ctq_cpk': ev }));
    assert.equal(r.categories[1].score, 12.5, `value ${value}`); // (3+3+1+3)/12*15
    assert.equal(r.total, 97.5, `value ${value}`);
    assert.equal(r.decision, 'CONDITIONAL', `value ${value}`);
    assert.deepEqual(r.knockouts, { failed: [], assumed: ['2.ctq_cpk'] }, `value ${value}`);
  }
});

test('5: assumed knockout below 70 is NOT APPROVED; two assumed listed in category order', () => {
  const low = run(dropCats(edit(perfect('cold_plate'), { '2.ctq_cpk': A(null) }), 6, 7, 8, 9));
  assert.equal(low.total, 62.5); // 15 + 12.5 + 10 + 15 + 10
  assert.equal(low.decision, 'NOT APPROVED');
  assert.deepEqual(low.knockouts, { failed: [], assumed: ['2.ctq_cpk'] });
  // extraction order puts 3.grr before 1.cert_scope; the list follows category order
  const base = perfect('cold_plate');
  const two = { ...base, criteria: [{ id: '3.grr', ...A(null) }, { id: '1.cert_scope', ...A(null) },
    ...base.criteria.filter((c) => c.id !== '3.grr' && c.id !== '1.cert_scope')] };
  const r = run(two);
  assert.deepEqual(r.knockouts.assumed, ['1.cert_scope', '3.grr']);
  assert.equal(r.total, 94.7); // 100 - (15 - 13/15*15) - (10 - 4/6*10) = 100 - 2 - 3.333
  assert.equal(r.decision, 'CONDITIONAL');
});

test('5: assumed required test: true -> assumed list, false -> failed list only', () => {
  const t = run(edit(perfect('cold_plate'), { '4.leak_test': A(true) }));
  assert.deepEqual(t.knockouts, { failed: [], assumed: ['4.leak_test'] });
  assert.equal(t.total, 98.3); // 100 - 15 + 16/18*15 = 98.333
  assert.equal(t.decision, 'CONDITIONAL');
  const f = run(edit(perfect('cold_plate'), { '4.leak_test': A(false) }));
  assert.deepEqual(f.knockouts, { failed: ['4.leak_test'], assumed: [] });
  assert.equal(f.total, 97.5); // 100 - 15 + 15/18*15
  assert.equal(f.decision, 'NOT APPROVED');
  assert.equal(rowOf(f, '4.leak_test').state, 'assumed');
});

// ---- 6. knockouts_off ----

test('6: switching off 2.ctq_cpk turns a Cpk-0 NOT APPROVED into a total-based decision (QUAL-AC-11)', () => {
  const ext = edit(perfect('cold_plate'), { '2.ctq_cpk': V(0.5) });
  const ref = run(ext);
  assert.equal(ref.decision, 'NOT APPROVED');
  const off = run(ext, { policy: pol({ knockouts_off: ['2.ctq_cpk'] }) });
  assert.deepEqual(off.knockouts, { failed: [], assumed: [] });
  assert.equal(rowOf(off, '2.ctq_cpk').score, 0);
  assert.equal(rowOf(off, '2.ctq_cpk').knockout, false);
  assert.equal(off.total, 96.3);
  assert.equal(off.total, ref.total);
  assert.deepEqual(scores(off), scores(ref));
  assert.equal(off.decision, 'APPROVED');
});

test('6: a switched-off assumed knockout does not cap; lot_trace and required tests can be off', () => {
  const a = run(edit(perfect('cold_plate'), { '2.ctq_cpk': A(null) }), { policy: pol({ knockouts_off: ['2.ctq_cpk'] }) });
  assert.deepEqual(a.knockouts, { failed: [], assumed: [] });
  assert.equal(a.total, 97.5);
  assert.equal(a.decision, 'APPROVED');
  const lt = run(edit(perfect('cold_plate'), { '5.lot_trace': V(false) }), { policy: pol({ knockouts_off: ['5.lot_trace'] }) });
  assert.equal(lt.decision, 'APPROVED');
  assert.equal(lt.total, 96.7);
  const testId = RUBRIC.commodities.find((p) => p.key === 'cold_plate').required[0];
  const rt = run(edit(perfect('cold_plate'), { [testId]: V(false) }), { policy: pol({ knockouts_off: [testId] }) });
  assert.deepEqual(rt.knockouts.failed, []);
  assert.equal(rt.decision, 'APPROVED');
  assert.equal(rt.total, 97.5); // 100 - 15 + 15/18*15
  assert.equal(rowOf(rt, testId).knockout, false);
});

test('6: a knockout left on still fires when another is off', () => {
  const r = run(edit(perfect('cold_plate'), { '2.ctq_cpk': V(0.5), '4.leak_test': V(false) }),
    { policy: pol({ knockouts_off: ['2.ctq_cpk'] }) });
  assert.deepEqual(r.knockouts.failed, ['4.leak_test']);
  assert.equal(r.decision, 'NOT APPROVED');
});

test('6: invalid knockouts_off entries throw naming knockouts_off', () => {
  const requiredSomewhere = new Set(RUBRIC.commodities.flatMap((p) => p.required));
  const niceOnly = RUBRIC.tests.map((t) => t.id).filter((id) => !requiredSomewhere.has(id));
  assert.ok(niceOnly.length > 0, 'fixture has a test required by no commodity');
  for (const bad of ['2.spc', '9.nope', '4.<test>', 42, null, niceOnly[0]]) {
    throwsAt(() => run(perfect(), { policy: pol({ knockouts_off: [bad] }) }), 'policy.qualification.knockouts_off', String(bad));
  }
  // a test required by another commodity is a valid id and is a no-op here
  const r = run(perfect('cold_plate'), { policy: pol({ knockouts_off: ['4.fai'] }) });
  assert.equal(r.decision, 'APPROVED');
});

// ---- 7. policy defaults and use ----

test('7: no policy equals the Stark Reference v1 result (QUAL-FR-14)', () => {
  const exts = [SUP07, ...RUBRIC.commodities.map((p) => perfect(p.key)),
    edit(perfect('cold_plate'), { '2.ctq_cpk': A(null) })];
  for (const ext of exts) {
    assert.deepEqual(run(ext), run(ext, { policy: STARK_REFERENCE }), ext.commodity);
  }
  assert.deepEqual(evaluate(SUP07, { as_of: AS_OF }).categories.map((c) => c.weight), [15, 15, 10, 15, 10, 10, 8, 7, 10]);
});

test('7: SUP-07 with weights moved crosses 85 and flips to APPROVED (QUAL-AC-11)', () => {
  const W = { 1: 38, 2: 5, 3: 10, 4: 15, 5: 10, 6: 2, 7: 8, 8: 2, 9: 10 };
  const r = run(SUP07, { policy: wts(W) });
  // 38 + 5*8/12 + 10 + 15 + 10 + 2*2/9 + 8 + 2*3/9 + 10 = 95.444
  assert.equal(r.total, 95.4);
  assert.equal(r.decision, 'APPROVED');
  assert.deepEqual(r.categories.map((c) => c.weight), [38, 5, 10, 15, 10, 2, 8, 2, 10]);
  assert.deepEqual(scores(r), [38, 3.3, 10, 15, 10, 0.4, 8, 0.7, 10]);
});

test('7: approve and conditional thresholds come from the policy', () => {
  const W = edgePolicy(13).qualification.weights; // total 87
  const ext = dropCats(perfect('cold_plate'), 7);
  assert.equal(run(ext, { policy: wts(W) }).decision, 'APPROVED');
  const a90 = run(ext, { policy: pol({ weights: W, approve: 90 }) });
  assert.equal(a90.total, 87);
  assert.equal(a90.decision, 'CONDITIONAL');
  assert.equal(run(ext, { policy: pol({ weights: W, approve: 95, conditional: 90 }) }).decision, 'NOT APPROVED');
  assert.equal(run(ext, { policy: pol({ weights: W, approve: 87 }) }).decision, 'APPROVED');
  assert.equal(run(ext, { policy: pol({ weights: W, approve: 95, conditional: 87 }) }).decision, 'CONDITIONAL');
  assert.equal(run(perfect(), { policy: pol({ approve: 100 }) }).decision, 'APPROVED');
});

test('7: weights are used as given, not renormalized (category weight 9.99 stays 9.99)', () => {
  const r = run(perfect(), { policy: wts({ ...STARK_REFERENCE.qualification.weights, 9: 9.99 }) });
  assert.equal(r.categories[8].score, 10); // 9.99 shown to 1 decimal
  assert.equal(r.categories[8].weight, 9.99);
  const s = run(dropCats(perfect(), 9), { policy: wts({ ...STARK_REFERENCE.qualification.weights, 9: 9.99 }) });
  assert.equal(s.total, 90); // 15+15+10+15+10+10+8+7
});

// ---- 8. policy validation ----

test('8: invalid policies throw naming the field', () => {
  const W = STARK_REFERENCE.qualification.weights;
  const P = 'policy.qualification';
  const cases = [
    [wts({ ...W, 9: 9 }), `${P}.weights`], // sum 99
    [wts({ ...W, 9: 9.98 }), `${P}.weights`], // sum 99.98
    [wts({ ...W, 9: 10.02 }), `${P}.weights`], // sum 100.02
    [wts({ ...W, 8: -1, 9: 18 }), `${P}.weights.8`],
    [wts({ 1: 15, 2: 15, 3: 10, 4: 15, 5: 10, 6: 10, 7: 15, 8: 10 }), `${P}.weights.9`],
    [wts({ ...W, 10: 0 }), `${P}.weights.10`],
    [wts({ ...W, 9: '10' }), `${P}.weights.9`],
    [wts({ ...W, 9: NaN }), `${P}.weights.9`],
    [wts({ ...W, 9: Infinity }), `${P}.weights.9`],
    [wts(null), `${P}.weights`],
    [pol({ approve: 101 }), `${P}.approve`],
    [pol({ approve: -1 }), `${P}.approve`],
    [pol({ approve: '85' }), `${P}.approve`],
    [pol({ conditional: 85 }), `${P}.conditional`],
    [pol({ conditional: 86 }), `${P}.conditional`],
    [pol({ conditional: -1 }), `${P}.conditional`],
    [pol({ approve: 0 }), `${P}.conditional`],
    [pol({ approve: 0, conditional: 0 }), `${P}.conditional`],
    [pol({ knockouts_off: '2.ctq_cpk' }), `${P}.knockouts_off`],
    [{ ...STARK_REFERENCE, qualification: undefined }, P],
    [null, 'policy'],
  ];
  for (const [policy, prefix] of cases) {
    throwsAt(() => run(perfect(), { policy }), prefix, `${prefix} ${JSON.stringify(policy?.qualification)}`);
  }
});

test('8: policies on the valid side of each edge do not throw', () => {
  const W = STARK_REFERENCE.qualification.weights;
  const ok = [
    wts({ ...W, 9: 9.99 }), // sum 99.99
    wts({ ...W, 9: 10.01 }), // sum 100.01
    wts({ ...W, 9: 0, 1: 25 }),
    pol({ conditional: 0 }),
    pol({ approve: 100, conditional: 99.9 }),
    pol({ approve: 70.01, conditional: 70 }),
    pol({ knockouts_off: ['2.ctq_cpk', '2.ctq_cpk'] }),
  ];
  for (const policy of ok) assert.doesNotThrow(() => run(perfect(), { policy }), JSON.stringify(policy.qualification));
});

test('8: as_of is checked before the policy, and the policy before the extraction', () => {
  throwsAt(() => evaluate(null, { as_of: AS_OF, policy: null }), 'policy');
  throwsAt(() => evaluate({ commodity: 'nope', criteria: 'x' }, { as_of: AS_OF, policy: pol({ approve: 101 }) }), 'policy.qualification.approve');
  throwsAt(() => evaluate(null, { as_of: 'bad', policy: null }), 'as_of');
});

// ---- 9. weightsFromRatings ----

const ratings = (r1, rest) => Object.fromEntries(RUBRIC.categories.map(({ n }) => [String(n), n === 1 ? r1 : rest]));
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`);

test('9: weightsFromRatings normalizes 1-5 ratings to 100, unrounded', () => {
  const eq = weightsFromRatings(ratings(3, 3));
  assert.deepEqual(Object.keys(eq), ['1', '2', '3', '4', '5', '6', '7', '8', '9']);
  for (const w of Object.values(eq)) close(w, 100 / 9, 'equal');
  const five = weightsFromRatings(ratings(5, 1));
  close(five[1], 38.46153846153846, 'cat 1 = 5/13*100');
  for (let n = 2; n <= 9; n++) close(five[n], 7.6923076923076925, `cat ${n} = 1/13*100`);
  const twelve = weightsFromRatings({ 1: 2, 2: 2, 3: 1, 4: 2, 5: 1, 6: 1, 7: 1, 8: 1, 9: 1 });
  for (const n of [1, 2, 4]) close(twelve[n], 16.666666666666668, `cat ${n}`);
  for (const n of [3, 5, 6, 7, 8, 9]) close(twelve[n], 8.333333333333334, `cat ${n}`);
  for (const w of [eq, five, twelve]) close(Object.values(w).reduce((s, x) => s + x, 0), 100, 'sum');
});

test('9: weightsFromRatings output is a valid policy and moves the right way', () => {
  for (const r of [ratings(3, 3), ratings(5, 1), ratings(1, 4)]) {
    const res = run(perfect(), { policy: wts(weightsFromRatings(r)) });
    assert.equal(res.total, 100);
  }
  assert.ok(weightsFromRatings(ratings(5, 3))[1] > weightsFromRatings(ratings(1, 3))[1]);
  const input = deepFreeze(ratings(4, 2));
  const snap = JSON.stringify(input);
  weightsFromRatings(input);
  assert.equal(JSON.stringify(input), snap);
});

test('9: weightsFromRatings throws naming the rating', () => {
  for (const bad of [0, 6, 2.5, '3', NaN, null]) throwsAt(() => weightsFromRatings(ratings(bad, 3)), 'ratings.1', String(bad));
  const missing = ratings(3, 3); delete missing[9];
  throwsAt(() => weightsFromRatings(missing), 'ratings.9');
  throwsAt(() => weightsFromRatings({ ...ratings(3, 3), 10: 3 }), 'ratings.10');
  for (const bad of [null, [3, 3, 3], 'x']) throwsAt(() => weightsFromRatings(bad), 'ratings');
  // the integer edges themselves are valid
  assert.doesNotThrow(() => weightsFromRatings(ratings(1, 5)));
});

// ---- 10. as_of ----

test('10: as_of is validated up front, even with no date criterion in the packet', () => {
  const ext = edit(perfect(), { '1.cert_current': undefined });
  for (const bad of [undefined, '2026-13-01', '2026-02-29', '2026-1-1', 20261109, null, '']) {
    throwsAt(() => evaluate(ext, { as_of: bad }), 'as_of', String(bad));
  }
  throwsAt(() => evaluate(ext), 'as_of');
  assert.doesNotThrow(() => evaluate(ext, { as_of: '2028-02-29' }));
});

test('10: certificate expiry edge through evaluate', () => {
  const on = run(edit(perfect(), { '1.cert_current': V(AS_OF) }));
  assert.equal(on.total, 100);
  assert.equal(on.decision, 'APPROVED');
  const before = run(edit(perfect(), { '1.cert_current': V('2026-11-08') }));
  assert.equal(before.decision, 'NOT APPROVED');
  assert.deepEqual(before.knockouts.failed, ['1.cert_current']);
});

// ---- 11. applicability and warnings ----

test('11: empty extraction: everything missing, total 0, every knockout failed', () => {
  const expected = {
    cold_plate: ['1.cert_current', '1.cert_scope', '2.ctq_cpk', '3.grr', '4.leak_test', '4.burst_pressure',
      '4.cleanliness', '4.material_cert', '5.lot_trace'],
    machined_part: ['1.cert_current', '1.cert_scope', '2.ctq_cpk', '3.grr', '4.fai', '4.cmm_report', '4.material_cert'],
  };
  for (const [commodity, failed] of Object.entries(expected)) {
    const r = run({ supplier_id: 'X', commodity, criteria: [] });
    assert.equal(r.total, 0, commodity);
    assert.deepEqual(r.knockouts, { failed, assumed: [] }, commodity);
    assert.equal(r.decision, 'NOT APPROVED', commodity);
    for (const row of r.categories.flatMap((c) => c.criteria)) {
      assert.deepEqual({ ...row, id: 0, knockout: 0 }, { id: 0, knockout: 0, state: 'missing', value: null, citation: null, note: null, score: 0, gap: 'missing' });
    }
  }
});

test('11: a not-applicable test is ignored with a warning, even with garbage evidence', () => {
  const base = run(perfect('cold_plate'));
  for (const ev of [V(true), V(false), { state: 'bogus', value: 'junk' }]) {
    const r = run(edit(perfect('cold_plate'), { '4.burn_in': ev }));
    assert.deepEqual(r.warnings, ['4.burn_in: not applicable to cold_plate, ignored']);
    assert.deepEqual({ ...r, warnings: [] }, base);
  }
  const two = run(edit(perfect('cold_plate'), { '4.halt': V(false), '4.burn_in': V(false) }));
  assert.deepEqual(two.warnings.map((w) => w.split(':')[0]), ['4.halt', '4.burn_in']);
});

test('11: nice-to-have evidence never changes the result but is validated', () => {
  // nice_to_have reports the nice-to-have states by design (QUAL-FR-09); everything else must not move.
  const scored = ({ nice_to_have, ...r }) => r;
  const ref = scored(run(edit(SUP07, { '4.thermal_cycling': undefined, '4.coolant_compat': undefined })));
  for (const ev of [V(true), V(false), M, A(false)]) {
    assert.deepEqual(scored(run(edit(SUP07, { '4.thermal_cycling': ev, '4.coolant_compat': ev }))), ref, ev.state);
  }
  throwsAt(() => run(edit(SUP07, { '4.coolant_compat': { state: 'bogus', value: true } })), '4.coolant_compat');
  throwsAt(() => run(edit(SUP07, { '4.coolant_compat': { state: 'verified', value: true, citation: null } })), '4.coolant_compat');
  throwsAt(() => run(edit(SUP07, { '4.coolant_compat': V('yes') })), '4.coolant_compat');
});

test('11: unknown id, duplicate id, unknown commodity and bad evidence throw naming it', () => {
  throwsAt(() => run(edit(perfect(), { '9.nope': V(true) })), '9.nope');
  throwsAt(() => run(edit(perfect(), { '4.<test>': V(true) })), '4.<test>');
  const p = perfect();
  throwsAt(() => run({ ...p, criteria: [...p.criteria, { id: '1.capa', ...V(true) }] }), '1.capa');
  assert.throws(() => run({ ...p, criteria: [...p.criteria, { id: '1.capa', ...V(true) }] }), /duplicate/);
  throwsAt(() => run({ ...p, commodity: 'warp_core' }), 'commodity');
  throwsAt(() => run({ ...p, commodity: undefined }), 'commodity');
  throwsAt(() => run(edit(p, { '1.capa': V('yes') })), '1.capa');
  throwsAt(() => run(edit(p, { '2.ctq_cpk': { state: 'verified', value: 1.5, citation: null } })), '2.ctq_cpk');
  throwsAt(() => run({ ...p, criteria: 'nope' }), 'criteria');
  throwsAt(() => run(null), 'extraction');
  throwsAt(() => run({ ...p, criteria: [null] }), 'criteria[0]');
});

test('11: perfectExtraction carries no nice-to-have tests', () => {
  for (const c of RUBRIC.commodities) {
    const ids = new Set(perfectExtraction(RUBRIC, c.key).criteria.map((x) => x.id));
    for (const id of c.nice ?? []) assert.ok(!ids.has(id), `${c.key}: ${id} is nice to have`);
  }
});

// ---- 12. data-driven category 4 (QUAL-AC-10 engine half) ----

test('12: a generated 100-test commodity is scored by the unchanged engine', () => {
  const G = deepFreeze(withGeneratedCommodity(RUBRIC));
  const prof = G.commodities.find((p) => p.key === 'gen_commodity');
  assert.equal(prof.required.length, 100);
  const perf = perfectExtraction(G, 'gen_commodity');
  const r = evaluate(perf, { as_of: AS_OF, rubric: G });
  assert.equal(r.total, 100);
  assert.equal(r.categories[3].criteria.length, 102);
  assert.equal(r.decision, 'APPROVED');
  for (const id of prof.required) {
    const d = G.tests.find((t) => t.id === id);
    const zero = d.type === 'bool' ? false : 0.2;
    const x = evaluate(edit(perf, { [id]: V(zero) }), { as_of: AS_OF, rubric: G });
    assert.deepEqual(x.knockouts.failed, [id], id);
    assert.equal(x.decision, 'NOT APPROVED', id);
    assert.equal(x.total, 99.9, id); // 85 + 15*303/306 = 99.853
  }
  // knockouts_off validates against the given rubric
  assert.doesNotThrow(() => evaluate(perf, { as_of: AS_OF, rubric: G, policy: pol({ knockouts_off: ['4.gen_001'] }) }));
  throwsAt(() => run(perfect(), { policy: pol({ knockouts_off: ['4.gen_001'] }) }), 'policy.qualification.knockouts_off');
});

test('12: generated Medium-risk commodity: 5.lot_trace is not a knockout', () => {
  const G = withGeneratedCommodity(RUBRIC, { risk: 'Medium' });
  const ext = edit(perfectExtraction(G, 'gen_commodity'), { '5.lot_trace': V(false) });
  const r = evaluate(ext, { as_of: AS_OF, rubric: G });
  assert.equal(r.risk, 'Medium');
  assert.deepEqual(r.knockouts.failed, []);
  assert.equal(r.total, 96.7);
  assert.equal(r.decision, 'APPROVED');
});

test('12: engine.js names no test id or commodity key, and rubric defaults to RUBRIC', () => {
  for (const { id } of RUBRIC.tests) assert.ok(!ENGINE_SRC.includes(id), id);
  for (const { key } of RUBRIC.commodities) assert.ok(!ENGINE_SRC.includes(key), key);
  assert.deepEqual(run(SUP07), run(SUP07, { rubric: RUBRIC }));
});

// ---- 13. purity ----

test('13: deterministic, frozen inputs untouched, results fresh per call', () => {
  const ext = deepFreeze(structuredClone(SUP07));
  const policy = deepFreeze(structuredClone(STARK_REFERENCE));
  const rubric = deepFreeze(structuredClone(RUBRIC));
  const snap = JSON.stringify([ext, policy, rubric]);
  const opts = { as_of: AS_OF, policy, rubric };
  const r1 = evaluate(ext, opts);
  const copy = structuredClone(r1);
  assert.equal(JSON.stringify([ext, policy, rubric]), snap);
  assert.deepEqual(evaluate(ext, opts), r1);
  r1.knockouts.failed.push('x');
  r1.warnings.push('x');
  r1.categories[0].criteria[0].score = 99;
  r1.categories.pop();
  r1.policy.id = 'x';
  assert.deepEqual(evaluate(ext, opts), copy);
  assert.deepEqual(copy.policy, { id: policy.id, version: policy.version, name: policy.name });
  // rows are new objects, not the extraction's entries
  const r2 = evaluate(ext, opts);
  for (const row of r2.categories.flatMap((c) => c.criteria)) {
    assert.ok(!ext.criteria.includes(row), row.id);
    assert.ok(!Object.isFrozen(row), row.id);
  }
  assert.ok(!Object.isFrozen(r2.knockouts.failed));
});

// ---- 14. shape ----

test('14: output shape and pass-through', () => {
  const ext = edit(SUP07, { '2.ctq_cpk': { state: 'verified', value: 1.12, citation: 'capability_study.md §2', note: 'Flatness, n=125' } });
  const r = run({ ...ext, supplier_id: 'SUP-07' });
  assert.equal(r.supplier_id, 'SUP-07');
  assert.equal(r.commodity, 'cold_plate');
  assert.equal(r.risk, RUBRIC.commodities.find((p) => p.key === 'cold_plate').risk);
  assert.deepEqual(r.categories.map((c) => c.n), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(r.categories.map((c) => c.name), RUBRIC.categories.map((c) => c.name));
  for (const c of r.categories) {
    for (const k of ['n', 'name', 'weight', 'score', 'criteria']) assert.ok(Object.hasOwn(c, k), `${c.n}.${k}`);
    for (const row of c.criteria) {
      for (const k of ['id', 'knockout', 'state', 'value', 'citation', 'note', 'score', 'gap']) assert.ok(Object.hasOwn(row, k), `${row.id}.${k}`);
      assert.equal(typeof row.knockout, 'boolean');
      assert.ok(Number.isInteger(row.score));
    }
  }
  assert.deepEqual(rowOf(r, '2.ctq_cpk'), { id: '2.ctq_cpk', knockout: true, state: 'verified', value: 1.12,
    citation: 'capability_study.md §2', note: 'Flatness, n=125', score: 1, gap: 'fail' });
  assert.deepEqual(rowOf(r, '2.spc'), { id: '2.spc', knockout: false, state: 'assumed', value: null, citation: null, note: null, score: 1, gap: 'assumed' });
  const absent = run(edit(SUP07, { '8.subtier_named': undefined }));
  const row = rowOf(absent, '8.subtier_named');
  assert.deepEqual(row, { id: '8.subtier_named', knockout: false, state: 'missing', value: null, citation: null, note: null, score: 0, gap: 'missing' });
  // undefined evidence fields become null; supplier_id absent -> null
  const { supplier_id, ...noId } = ext;
  const u = run(edit(noId, { '6.lead_time': { state: 'verified', value: false, citation: CITE } }));
  assert.equal(u.supplier_id, null);
  assert.equal(rowOf(u, '6.lead_time').note, null);
  assert.equal(rowOf(u, '6.lead_time').value, false);
});

// ---- 15. engine API (#23): policy identity, evidence primitives (QUAL-FR-13, -14, -15, QUAL-AC-11) ----

const DOC_POLICY = jsonBlock(RUBRIC_MD, 'Team scoring policy');
const META = { id: DOC_POLICY.id, version: DOC_POLICY.version, name: DOC_POLICY.name };

test('15: the output names the policy: { id, version, name } right after risk (QUAL-FR-15, QUAL-AC-11)', () => {
  assert.deepEqual(META, { id: 'stark-reference', version: 1, name: 'Stark Reference v1' }); // RUBRIC.md JSON block
  const r = run(SUP07);
  assert.deepEqual(r.policy, META);
  assert.deepEqual(run(SUP07, { policy: STARK_REFERENCE }).policy, META);
  const keys = Object.keys(r);
  assert.equal(keys.indexOf('policy'), keys.indexOf('risk') + 1);
  // A custom policy echoes its own identity only: no qualification, no extra keys, not the input object.
  const policy = { ...pol({ approve: 90 }), id: 'team-x', version: 3, name: 'Team X', owner: 'QA' };
  const c = run(SUP07, { policy });
  assert.deepEqual(c.policy, { id: 'team-x', version: 3, name: 'Team X' });
  assert.notEqual(c.policy, policy);
});

test('15: policy identity is required: exact message per field, id then version then name', () => {
  for (const [over, message] of POLICY_META_REJECTS) {
    assert.throws(() => run(perfect(), { policy: withMeta(STARK_REFERENCE, over) }), { message }, message);
  }
  for (const over of POLICY_META_ACCEPTS) {
    const policy = withMeta(STARK_REFERENCE, over);
    assert.deepEqual(run(perfect(), { policy }).policy, { id: policy.id, version: policy.version, name: policy.name });
  }
});

test('15: identity is checked after the qualification half and before the extraction', () => {
  throwsAt(() => run(perfect(), { policy: withMeta(pol({ approve: 101 }), { id: undefined }) }), 'policy.qualification.approve');
  throwsAt(() => run(perfect(), { policy: withMeta(pol({ knockouts_off: ['9.nope'] }), { name: '' }) }), 'policy.qualification.knockouts_off');
  assert.throws(() => evaluate(null, { as_of: AS_OF, policy: withMeta(STARK_REFERENCE, { version: 0 }) }),
    { message: 'policy.version: expected an integer >= 1, got 0' });
});

// Where an entry can sit: scored criterion, nice-to-have test, not-applicable test (cold_plate profile).
const SLOTS = ['1.capa', '4.coolant_compat', '4.burn_in'];
const VALUE_MSG = 'value: expected null, a boolean, a finite number or a string, got ';
const TEXT_MSG = (f) => `${f}: expected null or a string, got `;
const withEntry = (id, ev) => edit(perfect('cold_plate'), { [id]: { ...M, ...ev } });

test('15: non-primitive value, citation or note is rejected naming the criterion and field (scored, nice, not applicable)', () => {
  // BigInt and a cyclic object can't be JSON-stringified; the error must still carry the id and field label.
  const cyclic = {}; cyclic.self = cyclic;
  const badValues = [[{}, '{}'], [[], '[]'], [{ v: 1 }, '{"v":1}'], [[1], '[1]'], [() => 1, 'undefined'],
    [NaN, 'null'], [Infinity, 'null'], [-Infinity, 'null'], [1n, '1n'], [cyclic, '[object Object]']];
  const badText = [[{}, '{}'], [[], '[]'], [0, '0'], [false, 'false'], [true, 'true'], [1.5, '1.5'], [() => 'x', 'undefined'],
    [1n, '1n'], [cyclic, '[object Object]']];
  for (const id of SLOTS) {
    for (const [v, shown] of badValues) {
      assert.throws(() => run(withEntry(id, { value: v })), { message: `${id}: ${VALUE_MSG}${shown}` }, `${id} value ${shown}`);
    }
    for (const f of ['citation', 'note']) {
      for (const [v, shown] of badText) {
        assert.throws(() => run(withEntry(id, { [f]: v })), { message: `${id}: ${TEXT_MSG(f)}${shown}` }, `${id} ${f} ${shown}`);
      }
    }
    // Field order within one entry: value, then citation, then note.
    assert.throws(() => run(withEntry(id, { value: {}, citation: {}, note: {} })), { message: `${id}: ${VALUE_MSG}{}` });
    assert.throws(() => run(withEntry(id, { citation: [], note: {} })), { message: `${id}: ${TEXT_MSG('citation')}[]` });
  }
  // A verified entry is rejected by the primitive rule before its own rule ever runs.
  assert.throws(() => run(withEntry('1.capa', V({}))), { message: `1.capa: ${VALUE_MSG}{}` });
});

test("15: primitive edges '', 0, false, undefined and null are accepted and passed through unchanged (QUAL-FR-13)", () => {
  const base = run(perfect('cold_plate'));
  for (const value of ['', 0, false, undefined, null, 'x', -1.5]) {
    for (const text of ['', undefined, null, 'cert.pdf §2']) {
      const ev = deepFreeze({ id: '1.capa', state: 'missing', value, citation: text, note: text });
      const ext = deepFreeze(edit(perfect('cold_plate'), { '1.capa': ev }));
      const r = run(ext);
      const label = `value ${JSON.stringify(value)} text ${JSON.stringify(text)}`;
      assert.deepEqual(rowOf(r, '1.capa'), { id: '1.capa', knockout: false, state: 'missing', value: value ?? null,
        citation: text ?? null, note: text ?? null, score: 0, gap: 'missing' }, label);
      // Nice-to-have and not-applicable entries accept the same edges without changing the score.
      for (const id of ['4.coolant_compat', '4.burn_in']) {
        assert.equal(run(edit(ext, { [id]: { state: 'missing', value, citation: text, note: text } })).total, r.total, `${id} ${label}`);
      }
    }
  }
  assert.equal(base.total, 100);
  // Verified string note on a scored row: every evidence field comes out as given.
  const ev = deepFreeze({ id: '2.ctq_cpk', state: 'verified', value: 1.67, citation: 'cpk.md §3', note: 'n=125' });
  const row = rowOf(run(deepFreeze(edit(perfect('cold_plate'), { '2.ctq_cpk': ev }))), '2.ctq_cpk');
  assert.deepEqual({ id: row.id, state: row.state, value: row.value, citation: row.citation, note: row.note }, ev);
});

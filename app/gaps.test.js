// Gap list, RFI items, audit focus (#19; QUAL-FR-09, QUAL-FR-10, QUAL-FR-11, QUAL-AC-01 gaps/RFI/audit part).
// Every expected value is written by hand from docs/RUBRIC.md § Outputs per supplier and § Worked example,
// the docs/DATASET.md gap matrix and queue table, and the #19 spec derivations. Never copied from engine output.
// Weights (Stark Reference v1): 1:15 2:15 3:10 4:15 5:10 6:10 7:8 8:7 9:10.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluate } from './engine.js';
import { RUBRIC, STARK_REFERENCE } from './rubric.js';
import { perfectExtraction, withGeneratedCommodity } from './rubric.testkit.js';

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
// perfectExtraction omits nice-to-have tests; add them verified true so nice_to_have starts empty.
const NICE = Object.fromEntries(RUBRIC.commodities.map((p) => [p.key, p.nice ?? []]));
const perfect = (key) => edit(perfectExtraction(RUBRIC, key), Object.fromEntries(NICE[key].map((id) => [id, V(true)])));
const run = (ext, opts = {}) => evaluate(ext, { as_of: AS_OF, ...opts });
const pol = (q) => ({ ...STARK_REFERENCE, qualification: { ...STARK_REFERENCE.qualification, ...q } });
const wts = (w) => pol({ weights: w });
const g = (id, type, score) => ({ id, type, score });
const rows = (r) => r.categories.flatMap((c) => c.criteria);
const rowOf = (r, id) => rows(r).find((x) => x.id === id);
const empty = (key) => ({ supplier_id: 'EMPTY', commodity: key, criteria: [] });
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
  '6.ramp_plan': A(null), '8.subtier_named': M, '8.subtier_certs': M, '4.thermal_cycling': M,
});
const SUP07_GAPS = [
  g('2.ctq_cpk', 'fail', 1), g('2.spc', 'assumed', 1), g('6.capacity_ratio', 'fail', 1), g('6.lead_time', 'fail', 0),
  g('6.ramp_plan', 'assumed', 1), g('8.subtier_named', 'missing', 0), g('8.subtier_certs', 'missing', 0),
];
const SUP07_RFI = ['2.spc', '6.ramp_plan', '8.subtier_named', '8.subtier_certs'];

// DATASET.md gap matrix, one packet per supplier.
const SUP01 = edit(perfect('cold_plate'), { '4.leak_test': M });
const SUP02 = edit(perfect('quick_disconnect'), { '9.second_source': V(false), '4.sample_size': V(false), '7.pcn_notice': V(60) });
const SUP03 = edit(perfect('power_module'), { '2.ctq_cpk': V(0.94), '3.grr': V(24), '2.spc': A(null), '4.halt': M });
const SUP05 = edit(perfect('machined_part'), { '1.cert_current': V('2026-10-15'), '4.fai': V(0.9) });
const SUP06 = edit(perfect('optics_cable'), {
  '1.internal_audit': A(null), '2.pfmea': A(null), '2.spc': A(null), '4.workmanship_620': A(null), '7.pcn_notice': M,
});
const SUP08 = edit(perfect('contract_mfg'), { '4.esd_program': V(false), '4.fpy_data': V(3) });

// ---- 1. QUAL-AC-01 gap part: RUBRIC worked example ----

test('1: SUP-07 gaps, nice_to_have, rfi_items, audit_focus match the RUBRIC worked example', () => {
  const r = run(SUP07);
  assert.equal(r.total, 82.6);
  assert.equal(r.decision, 'CONDITIONAL');
  assert.deepEqual(r.gaps, SUP07_GAPS);
  const count = (t) => r.gaps.filter((x) => x.type === t).length;
  assert.deepEqual([count('fail'), count('assumed'), count('missing')], [3, 2, 2]);
  assert.deepEqual(r.nice_to_have, [{ id: '4.thermal_cycling', state: 'missing' }]);
  assert.deepEqual(r.rfi_items, SUP07_RFI);
  // 2.ctq_cpk (knockout), 6.lead_time (0, weight 10), 8.subtier_named (0, weight 7, before 8.subtier_certs)
  assert.deepEqual(r.audit_focus, ['2.ctq_cpk', '6.lead_time', '8.subtier_named']);
});

// ---- 2. QUAL-FR-09 gap types and rows ----

test('2: gap type per state and score; score 3 is gap null', () => {
  const cases = [
    // [id, evidence, score, gap]
    ['6.lead_time', V(false), 0, 'fail'],
    ['6.capacity_ratio', V(0.85), 1, 'fail'],
    ['6.capacity_ratio', V(1.0), 2, 'fail'], // edge: 1.0 >= 1.0 -> 2
    ['6.capacity_ratio', V(1.1999), 2, 'fail'],
    ['6.capacity_ratio', V(1.2), 3, null], // edge: 1.2 >= 1.2 -> 3
    ['4.fai', V(0.9), 2, 'fail'],
    ['4.fai', V(1.0), 3, null],
    ['9.region_risk', V('medium'), 2, 'fail'],
    ['9.region_risk', V('low'), 3, null],
    ['2.spc', A(null), 1, 'assumed'],
    ['2.spc', A(true), 1, 'assumed'], // passing claim capped at 1
    ['2.spc', A(false), 0, 'assumed'], // failing claim scores 0, still assumed
    ['2.spc', M, 0, 'missing'],
    ['2.spc', undefined, 0, 'missing'], // absent = missing
    ['2.spc', V(true), 3, null],
  ];
  for (const [id, ev, score, gap] of cases) {
    const key = id === '4.fai' ? 'machined_part' : 'cold_plate';
    const r = run(edit(perfect(key), { [id]: ev }));
    const label = `${id} ${JSON.stringify(ev)}`;
    assert.equal(rowOf(r, id).score, score, label);
    assert.equal(rowOf(r, id).gap, gap, label);
    assert.deepEqual(r.gaps, gap === null ? [] : [g(id, gap, score)], label);
  }
});

test('2: gaps is exactly the rows with gap !== null, in row order, shape { id, type, score }', () => {
  for (const ext of [SUP07, SUP06, empty('cold_plate'), perfect('pcba')]) {
    const r = run(ext);
    const want = rows(r).filter((x) => x.gap !== null).map((x) => ({ id: x.id, type: x.gap, score: x.score }));
    assert.deepEqual(r.gaps, want);
    for (const x of r.gaps) assert.deepEqual(Object.keys(x), ['id', 'type', 'score']);
    for (const x of rows(r)) assert.equal(x.gap === null, x.score === 3, x.id);
  }
});

test('2: gap rows carry state and citation (null when missing, string when cited)', () => {
  const r = run(edit(SUP07, { '6.ramp_plan': { state: 'assumed', value: null, citation: 'plan.md §3', note: null } }));
  assert.deepEqual([rowOf(r, '2.ctq_cpk').state, rowOf(r, '2.ctq_cpk').citation], ['verified', CITE]);
  assert.deepEqual([rowOf(r, '2.spc').state, rowOf(r, '2.spc').citation], ['assumed', null]);
  assert.deepEqual([rowOf(r, '6.ramp_plan').state, rowOf(r, '6.ramp_plan').citation], ['assumed', 'plan.md §3']);
  assert.deepEqual([rowOf(r, '8.subtier_named').state, rowOf(r, '8.subtier_named').citation], ['missing', null]);
  const absent = run(edit(SUP07, { '8.subtier_named': undefined }));
  assert.deepEqual([rowOf(absent, '8.subtier_named').state, rowOf(absent, '8.subtier_named').citation], ['missing', null]);
  assert.deepEqual(absent.gaps, SUP07_GAPS);
});

test('2: assumed failing knockout is type assumed, fails the knockout, is an RFI item, first in audit', () => {
  // cold_plate perfect, 2.ctq_cpk claimed 0.9 -> min(1, 0) = 0, fails (RUBRIC § Scoring model)
  const r = run(edit(perfect('cold_plate'), { '2.ctq_cpk': A(0.9) }));
  assert.deepEqual(r.gaps, [g('2.ctq_cpk', 'assumed', 0)]);
  assert.deepEqual(r.knockouts, { failed: ['2.ctq_cpk'], assumed: [] });
  assert.equal(r.decision, 'NOT APPROVED');
  assert.deepEqual(r.rfi_items, ['2.ctq_cpk']);
  assert.deepEqual(r.audit_focus, ['2.ctq_cpk']);
});

test('2: knockouts_off and pass marks do not change gaps or RFI', () => {
  const ref = run(SUP07);
  for (const policy of [pol({ knockouts_off: ['2.ctq_cpk'] }), pol({ approve: 50, conditional: 10 })]) {
    const r = run(SUP07, { policy });
    assert.deepEqual(r.gaps, SUP07_GAPS);
    assert.deepEqual(r.rfi_items, SUP07_RFI);
    assert.deepEqual(r.nice_to_have, ref.nice_to_have);
  }
  assert.deepEqual(run(SUP07, { policy: pol({ approve: 50, conditional: 10 }) }).audit_focus, ref.audit_focus);
});

// ---- 3. QUAL-FR-10 RFI items ----

test('3: rfi_items = gaps filtered to assumed/missing, same order, never a fail or a nice-to-have id', () => {
  for (const ext of [SUP07, SUP01, SUP02, SUP03, SUP05, SUP06, SUP08, empty('cold_plate')]) {
    const r = run(ext);
    assert.deepEqual(r.rfi_items, r.gaps.filter((x) => x.type !== 'fail').map((x) => x.id));
    for (const id of r.rfi_items) assert.notEqual(r.gaps.find((x) => x.id === id).type, 'fail', id);
    for (const { id } of r.nice_to_have) assert.ok(!r.rfi_items.includes(id), id);
  }
});

test('3: verified second_source false is a fail (not RFI); missing or absent is in the RFI', () => {
  const base = perfect('pcba');
  const f = run(edit(base, { '9.second_source': V(false) }));
  assert.deepEqual(f.gaps, [g('9.second_source', 'fail', 1)]);
  assert.deepEqual(f.rfi_items, []);
  for (const ev of [M, undefined]) {
    const r = run(edit(base, { '9.second_source': ev }));
    assert.deepEqual(r.gaps, [g('9.second_source', 'missing', 0)]);
    assert.deepEqual(r.rfi_items, ['9.second_source']);
  }
});

test('3: an absent required test (knockout) is a missing gap and an RFI item', () => {
  const r = run(edit(perfect('cold_plate'), { '4.leak_test': undefined }));
  assert.deepEqual(r.gaps, [g('4.leak_test', 'missing', 0)]);
  assert.deepEqual(r.rfi_items, ['4.leak_test']);
  assert.deepEqual(r.knockouts.failed, ['4.leak_test']);
});

test('3: empty extraction: every row is a missing gap and an RFI item, in table order', () => {
  const r = run(empty('cold_plate'));
  // 5 + 4 + 2 + (4 required + 2) + 3 + 3 + 2 + 3 + 3 = 31 rows
  const ids = [
    '1.cert_current', '1.cert_scope', '1.internal_audit', '1.capa', '1.calibration',
    '2.pfmea', '2.control_plan', '2.ctq_cpk', '2.spc', '3.grr', '3.inspection_method',
    '4.leak_test', '4.burst_pressure', '4.cleanliness', '4.material_cert', '4.method_criteria', '4.sample_size',
    '5.lot_trace', '5.records_retention', '5.nc_segregation', '6.capacity_ratio', '6.lead_time', '6.ramp_plan',
    '7.pcn_notice', '7.change_approval', '8.subtier_named', '8.flowdown', '8.subtier_certs',
    '9.second_source', '9.region_risk', '9.financial_health',
  ];
  assert.deepEqual(r.gaps, ids.map((id) => g(id, 'missing', 0)));
  assert.deepEqual(r.rfi_items, ids);
  assert.deepEqual(r.nice_to_have, [{ id: '4.thermal_cycling', state: 'missing' }, { id: '4.coolant_compat', state: 'missing' }]);
  // all knockouts at 0; weight 15 for cats 1, 2, 4 -> table order
  assert.deepEqual(r.audit_focus, ['1.cert_current', '1.cert_scope', '2.ctq_cpk']);
});

// ---- 4. QUAL-FR-11 audit focus ----

test('4: knockout first: SUP-06 knockout at score 1 beats non-knockout at score 0', () => {
  assert.deepEqual(run(SUP06).audit_focus, ['4.workmanship_620', '7.pcn_notice', '1.internal_audit']);
});

test('4: lower score first among non-knockouts, even from a lighter, later category', () => {
  // 2.spc assumed (1, weight 15, earlier) vs 6.lead_time verified false (0, weight 10)
  const r = run(edit(perfect('pcba'), { '2.spc': A(null), '6.lead_time': V(false) }));
  assert.deepEqual(r.audit_focus, ['6.lead_time', '2.spc']);
});

test('4: equal score: higher policy weight first, even when later in the table', () => {
  // SUP-02 score-1 gaps: 7.pcn_notice (weight 8) and 9.second_source (weight 10)
  assert.deepEqual(run(SUP02).audit_focus, ['4.sample_size', '9.second_source', '7.pcn_notice']);
});

test('4: equal weight: table order, across categories and inside category 4', () => {
  // 1.capa (cat 1) and 2.pfmea (cat 2), both weight 15, score 0, non-knockout; given in reverse
  const base = perfect('pcba');
  const rev = { ...base, criteria: [...base.criteria].reverse() };
  assert.deepEqual(run(edit(rev, { '2.pfmea': V(false), '1.capa': V(false) })).audit_focus, ['1.capa', '2.pfmea']);
  // 4.method_criteria before 4.sample_size
  const r = run(edit(perfect('cold_plate'), { '4.sample_size': V(false), '4.method_criteria': V(false) }));
  assert.deepEqual(r.gaps, [g('4.method_criteria', 'fail', 0), g('4.sample_size', 'fail', 0)]);
  assert.deepEqual(r.audit_focus, ['4.method_criteria', '4.sample_size']);
});

test('4: category 4 order: required tests in profile order (not catalog order), then method_criteria, sample_size', () => {
  // machined_part required: 4.fai, 4.cmm_report, 4.material_cert (catalog lists material_cert first)
  const r = run(edit(perfect('machined_part'), { '4.sample_size': V(false), '4.material_cert': V(false), '4.fai': V(0.4) }));
  assert.deepEqual(r.gaps, [g('4.fai', 'fail', 0), g('4.material_cert', 'fail', 0), g('4.sample_size', 'fail', 0)]);
  assert.deepEqual(r.audit_focus, ['4.fai', '4.material_cert', '4.sample_size']);
  // a required test (knockout) outranks 4.sample_size; tests come before it in the table too
  const c = run(edit(perfect('cold_plate'), { '4.sample_size': V(false), '4.cleanliness': V(false) }));
  assert.deepEqual(c.gaps.map((x) => x.id), ['4.cleanliness', '4.sample_size']);
  assert.deepEqual(c.audit_focus, ['4.cleanliness', '4.sample_size']);
  // empty cold_plate, category 4 heaviest: profile order of the required tests
  const w = { 1: 10, 2: 10, 3: 10, 4: 40, 5: 10, 6: 5, 7: 5, 8: 5, 9: 5 };
  assert.deepEqual(run(empty('cold_plate'), { policy: wts(w) }).audit_focus, ['4.leak_test', '4.burst_pressure', '4.cleanliness']);
});

test('4: knockouts_off demotes a knockout to ordinary in audit order only', () => {
  const r = run(SUP07, { policy: pol({ knockouts_off: ['2.ctq_cpk'] }) });
  assert.equal(rowOf(r, '2.ctq_cpk').knockout, false);
  assert.deepEqual(r.gaps, SUP07_GAPS);
  // ctq_cpk now ordinary at score 1, behind the three score-0 gaps (lead_time weight 10 first)
  assert.deepEqual(r.audit_focus, ['6.lead_time', '8.subtier_named', '8.subtier_certs']);
});

test('4: 5.lot_trace is a knockout in audit order only on a High commodity', () => {
  const ov = { '5.lot_trace': V(false), '1.capa': V(false) };
  // pcba (Medium): lot_trace ordinary; both 0; capa weight 15 beats 10
  assert.deepEqual(run(edit(perfect('pcba'), ov)).audit_focus, ['1.capa', '5.lot_trace']);
  // cold_plate (High): lot_trace knockout first
  assert.deepEqual(run(edit(perfect('cold_plate'), ov)).audit_focus, ['5.lot_trace', '1.capa']);
  // pcba: lot_trace and records_retention (4 years -> 0) tie on weight 10 -> table order
  const t = run(edit(perfect('pcba'), { '5.records_retention': V(4), '5.lot_trace': V(false) }));
  assert.deepEqual(t.gaps, [g('5.lot_trace', 'fail', 0), g('5.records_retention', 'fail', 0)]);
  assert.deepEqual(t.audit_focus, ['5.lot_trace', '5.records_retention']);
});

test('4: audit focus uses the policy weight, not the reference weight', () => {
  const w = { 1: 15, 2: 15, 3: 10, 4: 15, 5: 10, 6: 5, 7: 8, 8: 12, 9: 10 };
  // cat 8 (12) beats cat 6 (5) among the score-0 gaps
  const r = run(SUP07, { policy: wts(w) });
  assert.deepEqual(r.audit_focus, ['2.ctq_cpk', '8.subtier_named', '8.subtier_certs']);
  assert.deepEqual(r.gaps, SUP07_GAPS);
});

test('4: a weight-0 category still lists its gaps and sorts last among equal scores', () => {
  const w = { 1: 15, 2: 15, 3: 10, 4: 15, 5: 10, 6: 10, 7: 18, 8: 7, 9: 0 };
  const r = run(SUP02, { policy: wts(w) });
  assert.deepEqual(r.gaps, [g('4.sample_size', 'fail', 0), g('7.pcn_notice', 'fail', 1), g('9.second_source', 'fail', 1)]);
  assert.deepEqual(r.audit_focus, ['4.sample_size', '7.pcn_notice', '9.second_source']);
});

test('4: category weights compare unrounded (8.8 beats 8.6, not a 9-9 tie)', () => {
  const w = { 1: 15, 2: 15, 3: 10, 4: 15, 5: 10, 6: 10, 7: 8.6, 8: 7.6, 9: 8.8 };
  assert.deepEqual(run(SUP02, { policy: wts(w) }).audit_focus, ['4.sample_size', '9.second_source', '7.pcn_notice']);
});

test('4: length caps at 3 and no info item ever enters audit focus', () => {
  assert.deepEqual(run(perfect('cold_plate')).audit_focus, []); // 0 gaps
  assert.deepEqual(run(SUP01).audit_focus, ['4.leak_test']); // 1
  assert.deepEqual(run(SUP05, { as_of: '2026-11-01' }).audit_focus, ['1.cert_current', '4.fai']); // 2
  assert.deepEqual(run(SUP02).audit_focus.length, 3); // exactly 3 gaps -> all 3
  assert.equal(run(SUP07).audit_focus.length, 3); // 7 gaps -> 3
  const info = run(edit(perfect('cold_plate'), { '4.thermal_cycling': M, '4.coolant_compat': undefined }));
  assert.deepEqual([info.gaps, info.rfi_items, info.audit_focus], [[], [], []]);
});

// ---- 5. nice_to_have ----

test('5: nice_to_have lists every non-verified nice-to-have test with its state, in profile order', () => {
  const base = perfect('cold_plate');
  const cases = [
    [{ '4.thermal_cycling': undefined, '4.coolant_compat': undefined },
      [{ id: '4.thermal_cycling', state: 'missing' }, { id: '4.coolant_compat', state: 'missing' }]],
    [{ '4.thermal_cycling': A(null), '4.coolant_compat': V(false) }, [{ id: '4.thermal_cycling', state: 'assumed' }]],
    [{ '4.thermal_cycling': V(false), '4.coolant_compat': A(true) }, [{ id: '4.coolant_compat', state: 'assumed' }]],
    [{ '4.thermal_cycling': V(true), '4.coolant_compat': V(false) }, []],
    [{ '4.thermal_cycling': M, '4.coolant_compat': V(true) }, [{ id: '4.thermal_cycling', state: 'missing' }]],
  ];
  for (const [ov, want] of cases) assert.deepEqual(run(edit(base, ov)).nice_to_have, want, JSON.stringify(ov));
  // profile order even when the extraction lists them reversed
  const noNice = edit(base, { '4.thermal_cycling': undefined, '4.coolant_compat': undefined });
  const rev = { ...noNice, criteria: [...noNice.criteria, { id: '4.coolant_compat', ...A(null) }, { id: '4.thermal_cycling', ...M }] };
  assert.deepEqual(run(rev).nice_to_have, [{ id: '4.thermal_cycling', state: 'missing' }, { id: '4.coolant_compat', state: 'assumed' }]);
});

test('5: nice-to-have states never change scores, decision, routing, knockouts, gaps, RFI, audit', () => {
  const pick = (r) => ({ total: r.total, categories: r.categories, decision: r.decision, routing: r.routing,
    knockouts: r.knockouts, gaps: r.gaps, rfi_items: r.rfi_items, audit_focus: r.audit_focus });
  for (const base of [perfect('cold_plate'), SUP07]) {
    const without = edit(base, { '4.thermal_cycling': undefined, '4.coolant_compat': undefined });
    const r = run(edit(base, { '4.thermal_cycling': A(null), '4.coolant_compat': V(false) }));
    assert.deepEqual(r.nice_to_have, [{ id: '4.thermal_cycling', state: 'assumed' }]);
    assert.deepEqual(pick(r), pick(run(without)));
  }
});

test('5: a commodity with no nice list gives nice_to_have []', () => {
  const rubric = structuredClone(RUBRIC);
  delete rubric.commodities.find((p) => p.key === 'cold_plate').nice;
  const ext = perfectExtraction(rubric, 'cold_plate');
  assert.deepEqual(evaluate(ext, { as_of: AS_OF, rubric }).nice_to_have, []);
  rubric.commodities.find((p) => p.key === 'cold_plate').nice = [];
  assert.deepEqual(evaluate(ext, { as_of: AS_OF, rubric }).nice_to_have, []);
  // a nice-to-have of another commodity is not applicable: a warning, not info
  const r = run(edit(perfect('pcba'), { '4.thermal_cycling': M }));
  assert.deepEqual(r.nice_to_have, []);
  assert.deepEqual(r.warnings, ['4.thermal_cycling: not applicable to pcba, ignored']);
});

// ---- 6. Dataset suppliers (DATASET.md gap matrix + queue table) ----

test('6: every candidate supplier: total, decision, gaps, nice_to_have, rfi_items, audit_focus', () => {
  const cases = [
    ['SUP-01', SUP01, AS_OF, 97.5, 'NOT APPROVED', [g('4.leak_test', 'missing', 0)], [], ['4.leak_test'], ['4.leak_test']],
    ['SUP-02', SUP02, AS_OF, 92.1, 'APPROVED',
      [g('4.sample_size', 'fail', 0), g('7.pcn_notice', 'fail', 1), g('9.second_source', 'fail', 1)], [], [],
      ['4.sample_size', '9.second_source', '7.pcn_notice']],
    ['SUP-03', SUP03, AS_OF, 90.4, 'NOT APPROVED',
      [g('2.ctq_cpk', 'fail', 0), g('2.spc', 'assumed', 1), g('3.grr', 'fail', 1)],
      [{ id: '4.halt', state: 'missing' }], ['2.spc'], ['2.ctq_cpk', '3.grr', '2.spc']],
    ['SUP-04', perfect('pcba'), AS_OF, 100, 'APPROVED', [], [], [], []],
    ['SUP-05', SUP05, '2026-11-01', 96, 'NOT APPROVED', [g('1.cert_current', 'fail', 0), g('4.fai', 'fail', 2)], [], [],
      ['1.cert_current', '4.fai']],
    ['SUP-06', SUP06, AS_OF, 86.5, 'CONDITIONAL',
      [g('1.internal_audit', 'assumed', 1), g('2.pfmea', 'assumed', 1), g('2.spc', 'assumed', 1),
        g('4.workmanship_620', 'assumed', 1), g('7.pcn_notice', 'missing', 0)], [],
      ['1.internal_audit', '2.pfmea', '2.spc', '4.workmanship_620', '7.pcn_notice'],
      ['4.workmanship_620', '7.pcn_notice', '1.internal_audit']],
    ['SUP-07', SUP07, AS_OF, 82.6, 'CONDITIONAL', SUP07_GAPS, [{ id: '4.thermal_cycling', state: 'missing' }], SUP07_RFI,
      ['2.ctq_cpk', '6.lead_time', '8.subtier_named']],
    ['SUP-08', SUP08, AS_OF, 95.8, 'NOT APPROVED', [g('4.esd_program', 'fail', 0), g('4.fpy_data', 'fail', 1)], [], [],
      ['4.esd_program', '4.fpy_data']],
    ['SUP-09', perfect('cold_plate'), AS_OF, 100, 'APPROVED', [], [], [], []],
  ];
  for (const [sup, ext, as_of, total, decision, gaps, nice, rfi, audit] of cases) {
    const r = run(ext, { as_of });
    assert.deepEqual({ total: r.total, decision: r.decision, gaps: r.gaps, nice_to_have: r.nice_to_have,
      rfi_items: r.rfi_items, audit_focus: r.audit_focus },
    { total, decision, gaps, nice_to_have: nice, rfi_items: rfi, audit_focus: audit }, sup);
    if (gaps.length === 0) for (const x of rows(r)) assert.equal(x.gap, null, `${sup} ${x.id}`);
  }
});

// ---- 7. Determinism and shape ----

test('7: output key order and row key order', () => {
  for (const ext of [SUP07, perfect('pcba')]) {
    const r = run(ext);
    assert.deepEqual(Object.keys(r).slice(-9), ['knockouts', 'decision', 'routing', 'sole_source',
      'gaps', 'nice_to_have', 'rfi_items', 'audit_focus', 'warnings']);
    for (const x of rows(r)) assert.deepEqual(Object.keys(x), ['id', 'knockout', 'state', 'value', 'citation', 'note', 'score', 'gap']);
    for (const x of r.nice_to_have) assert.deepEqual(Object.keys(x), ['id', 'state']);
  }
});

test('7: deterministic, frozen inputs work, returned arrays are fresh per call', () => {
  const ext = deepFreeze(structuredClone(SUP07));
  const policy = deepFreeze(structuredClone(STARK_REFERENCE));
  const rubric = deepFreeze(structuredClone(RUBRIC));
  const opts = { as_of: AS_OF, policy, rubric };
  const r1 = evaluate(ext, opts);
  assert.deepEqual(r1, run(SUP07));
  assert.deepEqual(evaluate(ext, opts), r1);
  r1.gaps.push(g('x', 'fail', 0));
  r1.gaps[0].type = 'x';
  r1.rfi_items.push('x');
  r1.audit_focus.push('x');
  r1.nice_to_have.push({ id: 'x', state: 'x' });
  const r2 = evaluate(ext, opts);
  assert.deepEqual([r2.gaps, r2.nice_to_have, r2.rfi_items, r2.audit_focus],
    [SUP07_GAPS, [{ id: '4.thermal_cycling', state: 'missing' }], SUP07_RFI, ['2.ctq_cpk', '6.lead_time', '8.subtier_named']]);
  // empty results are fresh too
  const p = perfect('cold_plate');
  const e1 = run(p);
  for (const k of ['gaps', 'nice_to_have', 'rfi_items', 'audit_focus']) e1[k].push('x');
  const e2 = run(p);
  for (const k of ['gaps', 'nice_to_have', 'rfi_items', 'audit_focus']) assert.deepEqual(e2[k], [], k);
});

// ---- 8. Scale (QUAL-NFR-05) ----

test('8: generated 100-test commodity: a failing and a missing required test are gaps, RFI and audit focus', () => {
  const G = withGeneratedCommodity(RUBRIC);
  const ext = edit(perfectExtraction(G, 'gen_commodity'), { '4.gen_060': undefined, '4.gen_007': V(false), '1.capa': V(false) });
  const r = evaluate(ext, { as_of: AS_OF, rubric: G });
  // category 4 rows: tests in profile order, so gen_007 before gen_060; both knockouts at 0 beat 1.capa
  assert.deepEqual(r.gaps, [g('1.capa', 'fail', 0), g('4.gen_007', 'fail', 0), g('4.gen_060', 'missing', 0)]);
  assert.deepEqual(r.rfi_items, ['4.gen_060']);
  assert.deepEqual(r.audit_focus, ['4.gen_007', '4.gen_060', '1.capa']);
  assert.deepEqual(r.nice_to_have, []);
});

// ---- 9. Source greps ----

test('9: engine.js uses no Date, randomness or I/O', () => {
  const src = readFileSync(new URL('./engine.js', import.meta.url), 'utf8');
  for (const s of ['Date', 'Math.random', 'fetch(', 'readFile', 'localStorage']) assert.ok(!src.includes(s), s);
});

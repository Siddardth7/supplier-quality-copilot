// Routing with reason (#18; QUAL-FR-08, QUAL-AC-04, QUAL-AC-01 routing part, PRD-01 §5 routing/sole_source).
// Every expected string is written from docs/RUBRIC.md § Decision and routing, and the reference rows
// from the docs/DATASET.md queue table, never copied from engine output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from './engine.js';
import { RUBRIC, STARK_REFERENCE } from './rubric.js';
import { perfectExtraction } from './rubric.testkit.js';

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
const perfect = (key) => perfectExtraction(RUBRIC, key);
const run = (ext, opts = {}) => evaluate(ext, { as_of: AS_OF, ...opts });
const pol = (q) => ({ ...STARK_REFERENCE, qualification: { ...STARK_REFERENCE.qualification, ...q } });
const wts = (w) => pol({ weights: w });
const deepFreeze = (o) => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
};

// RUBRIC.md § Decision and routing, verbatim.
const JR_MED = 'APPROVED, Medium risk, second source confirmed';
const JR_LOW = 'APPROVED, Low risk, second source confirmed';
const HIGH = 'High-risk commodity';
const SOLE = 'Sole source';
const UNCONF = 'Second source unconfirmed';
const junior = (reason) => ({ to: 'junior', reasons: [reason] });
const senior = (...reasons) => ({ to: 'senior', reasons });

// Decision recipes (spec): CONDITIONAL via an assumed knockout, NOT APPROVED via a failed knockout.
const CONDITIONAL = { '2.ctq_cpk': A(null) };
const NOT_APPROVED = { '1.cert_scope': V(false) };

// SUP-07, RUBRIC.md § Worked example.
const SUP07 = edit(perfect('cold_plate'), {
  '2.ctq_cpk': V(1.12), '2.spc': A(null), '6.capacity_ratio': V(0.85), '6.lead_time': V(false),
  '6.ramp_plan': A(null), '8.subtier_named': M, '8.subtier_certs': M,
  '4.thermal_cycling': M, '4.coolant_compat': V(true),
});

// ---- 1. QUAL-AC-01 routing part ----

test('1: SUP-07 routes Senior with CONDITIONAL and High-risk commodity, not sole source', () => {
  const r = run(SUP07);
  assert.equal(r.decision, 'CONDITIONAL');
  assert.deepEqual(r.routing, senior('CONDITIONAL', HIGH));
  assert.equal(r.sole_source, false);
});

// ---- 2. QUAL-AC-04 single flips on a perfect Medium packet ----

test('2: perfect Medium packet with confirmed second source routes Junior', () => {
  const r = run(perfect('pcba'));
  assert.equal(r.total, 100);
  assert.equal(r.decision, 'APPROVED');
  assert.deepEqual(r.routing, junior(JR_MED));
  assert.equal(r.sole_source, false);
});

test('2: flipping risk class to High routes Senior with High-risk commodity', () => {
  const rubric = structuredClone(RUBRIC);
  rubric.commodities.find((p) => p.key === 'pcba').risk = 'High';
  const r = evaluate(perfect('pcba'), { as_of: AS_OF, rubric });
  assert.equal(r.decision, 'APPROVED');
  assert.deepEqual(r.routing, senior(HIGH));
  assert.equal(r.sole_source, false);
  const real = run(perfect('cold_plate'));
  assert.equal(real.decision, 'APPROVED');
  assert.deepEqual(real.routing, senior(HIGH));
});

test('2: flipping second source to verified false routes Senior with Sole source', () => {
  const r = run(edit(perfect('pcba'), { '9.second_source': V(false) }));
  assert.equal(r.decision, 'APPROVED');
  assert.deepEqual(r.routing, senior(SOLE));
  assert.equal(r.sole_source, true);
});

test('2: flipping the decision routes Senior with the decision as the reason', () => {
  const c = run(edit(perfect('pcba'), CONDITIONAL));
  assert.equal(c.decision, 'CONDITIONAL');
  assert.deepEqual(c.routing, senior('CONDITIONAL'));
  assert.equal(c.sole_source, false);
  const n = run(edit(perfect('pcba'), NOT_APPROVED));
  assert.equal(n.decision, 'NOT APPROVED');
  assert.deepEqual(n.routing, senior('NOT APPROVED'));
  assert.equal(n.sole_source, false);
});

// ---- 3. Low risk ----

test('3: perfect Low-risk packet routes Junior with "APPROVED, Low risk, second source confirmed"', () => {
  assert.equal(RUBRIC.commodities.find((p) => p.key === 'sheet_metal').risk, 'Low');
  const r = run(perfect('sheet_metal'));
  assert.equal(r.decision, 'APPROVED');
  assert.deepEqual(r.routing, junior(JR_LOW));
  assert.equal(r.sole_source, false);
});

test('3: Low-risk negations route Senior with no risk reason', () => {
  assert.deepEqual(run(edit(perfect('sheet_metal'), { '9.second_source': V(false) })).routing, senior(SOLE));
  assert.deepEqual(run(edit(perfect('sheet_metal'), CONDITIONAL)).routing, senior('CONDITIONAL'));
  assert.deepEqual(run(edit(perfect('sheet_metal'), NOT_APPROVED)).routing, senior('NOT APPROVED'));
  const rubric = structuredClone(RUBRIC);
  rubric.commodities.find((p) => p.key === 'sheet_metal').risk = 'High';
  assert.deepEqual(evaluate(perfect('sheet_metal'), { as_of: AS_OF, rubric }).routing, senior(HIGH));
});

// ---- 4. second-source status table (evidence state wins; Sid 2026-11-09) ----
// The spec's 8 rows plus 'missing with value false', which pins state over value from the other side.

const SS_TABLE = [
  ['verified true', V(true), false, junior(JR_MED)],
  ['verified false', V(false), true, senior(SOLE)],
  ['assumed true', A(true), true, senior(UNCONF)],
  ['assumed false', A(false), true, senior(UNCONF)],
  ['assumed null', A(null), true, senior(UNCONF)],
  ['missing', M, true, senior(UNCONF)],
  ['missing with value true', { ...M, value: true }, true, senior(UNCONF)],
  ['missing with value false', { ...M, value: false }, true, senior(UNCONF)],
  ['entry absent', undefined, true, senior(UNCONF)],
];

for (const [label, ev, sole, routing] of SS_TABLE) {
  test(`4: second source ${label} -> sole_source ${sole}, ${routing.to} ${JSON.stringify(routing.reasons)}`, () => {
    const r = run(edit(perfect('pcba'), { '9.second_source': ev }));
    assert.equal(r.decision, 'APPROVED', 'second source alone must not change the decision');
    assert.equal(r.sole_source, sole);
    assert.deepEqual(r.routing, routing);
  });
}

// ---- 5. full matrix: decision x risk x second source, written by hand ----

const DEC = { 'APPROVED': {}, 'CONDITIONAL': CONDITIONAL, 'NOT APPROVED': NOT_APPROVED };
const RISK = { High: 'cold_plate', Medium: 'pcba', Low: 'sheet_metal' };
const SS = { 'verified true': V(true), 'verified false': V(false), 'missing': M };
const NA = 'NOT APPROVED';
const CO = 'CONDITIONAL';
const MATRIX = [
  ['APPROVED', 'High', 'verified true', senior(HIGH)],
  ['APPROVED', 'High', 'verified false', senior(HIGH, SOLE)],
  ['APPROVED', 'High', 'missing', senior(HIGH, UNCONF)],
  ['APPROVED', 'Medium', 'verified true', junior(JR_MED)],
  ['APPROVED', 'Medium', 'verified false', senior(SOLE)],
  ['APPROVED', 'Medium', 'missing', senior(UNCONF)],
  ['APPROVED', 'Low', 'verified true', junior(JR_LOW)],
  ['APPROVED', 'Low', 'verified false', senior(SOLE)],
  ['APPROVED', 'Low', 'missing', senior(UNCONF)],
  [CO, 'High', 'verified true', senior(CO, HIGH)],
  [CO, 'High', 'verified false', senior(CO, HIGH, SOLE)],
  [CO, 'High', 'missing', senior(CO, HIGH, UNCONF)],
  [CO, 'Medium', 'verified true', senior(CO)],
  [CO, 'Medium', 'verified false', senior(CO, SOLE)],
  [CO, 'Medium', 'missing', senior(CO, UNCONF)],
  [CO, 'Low', 'verified true', senior(CO)],
  [CO, 'Low', 'verified false', senior(CO, SOLE)],
  [CO, 'Low', 'missing', senior(CO, UNCONF)],
  [NA, 'High', 'verified true', senior(NA, HIGH)],
  [NA, 'High', 'verified false', senior(NA, HIGH, SOLE)],
  [NA, 'High', 'missing', senior(NA, HIGH, UNCONF)],
  [NA, 'Medium', 'verified true', senior(NA)],
  [NA, 'Medium', 'verified false', senior(NA, SOLE)],
  [NA, 'Medium', 'missing', senior(NA, UNCONF)],
  [NA, 'Low', 'verified true', senior(NA)],
  [NA, 'Low', 'verified false', senior(NA, SOLE)],
  [NA, 'Low', 'missing', senior(NA, UNCONF)],
];

test('5: 27-case matrix: routing, reason order, sole_source; 2 Junior, no empty Senior reasons', () => {
  assert.equal(MATRIX.length, 27);
  let juniors = 0;
  for (const [dec, risk, ss, routing] of MATRIX) {
    const label = `${dec} / ${risk} / ${ss}`;
    const r = run(edit(perfect(RISK[risk]), { ...DEC[dec], '9.second_source': SS[ss] }));
    assert.equal(r.decision, dec, label);
    assert.equal(r.risk, risk, label);
    assert.deepEqual(r.routing, routing, label);
    assert.equal(r.sole_source, ss !== 'verified true', label);
    assert.ok(r.routing.reasons.length > 0, label);
    if (r.routing.to === 'junior') juniors++;
  }
  assert.equal(juniors, 2);
});

// ---- 6. policy reaches routing only through the decision ----

test('6: pass mark moves the decision and so the routing', () => {
  const sole = edit(perfect('pcba'), { '9.second_source': V(false) });
  const ref = run(sole);
  assert.equal(ref.total, 97.8); // cat 9: 7/9 x 10 = 7.78 -> 97.78
  assert.equal(ref.decision, 'APPROVED');
  assert.deepEqual(ref.routing, senior(SOLE));
  const strict = run(sole, { policy: pol({ approve: 99 }) });
  assert.equal(strict.decision, 'CONDITIONAL');
  assert.deepEqual(strict.routing, senior('CONDITIONAL', SOLE));
  const at100 = run(perfect('pcba'), { policy: pol({ approve: 100 }) });
  assert.equal(at100.decision, 'APPROVED'); // 100 >= 100
  assert.deepEqual(at100.routing, junior(JR_MED));
});

test('6: knockouts_off turning NOT APPROVED into APPROVED routes Junior', () => {
  const ext = edit(perfect('pcba'), { '2.ctq_cpk': V(0.5) });
  const ref = run(ext);
  assert.equal(ref.decision, 'NOT APPROVED');
  assert.deepEqual(ref.routing, senior('NOT APPROVED'));
  const off = run(ext, { policy: pol({ knockouts_off: ['2.ctq_cpk'] }) });
  assert.equal(off.total, 96.3); // cat 2 = 9/12 x 15 = 11.25 -> 96.25 -> 96.3
  assert.equal(off.decision, 'APPROVED');
  assert.deepEqual(off.routing, junior(JR_MED));
  assert.equal(off.sole_source, false);
});

test('6: weights with the decision unchanged leave routing and sole_source deep-equal (cat 9 weight 0)', () => {
  const w = { ...STARK_REFERENCE.qualification.weights, 1: 25, 9: 0 };
  assert.equal(Object.values(w).reduce((a, b) => a + b, 0), 100);
  const cases = [
    ['pcba', {}], ['pcba', { '9.second_source': V(false) }], ['pcba', { '9.second_source': M }],
    ['sheet_metal', { '9.second_source': A(true) }], ['cold_plate', {}], ['cold_plate', CONDITIONAL],
  ];
  for (const [key, ov] of cases) {
    const ext = edit(perfect(key), ov);
    const a = run(ext);
    const b = run(ext, { policy: wts(w) });
    const label = `${key} ${JSON.stringify(ov)}`;
    assert.equal(b.decision, a.decision, label);
    assert.deepEqual(b.routing, a.routing, label);
    assert.equal(b.sole_source, a.sole_source, label);
  }
  // cat 9 weight 0: a verified-false second source scores nothing, yet is still sole source.
  const z = run(edit(perfect('pcba'), { '9.second_source': V(false) }), { policy: wts(w) });
  assert.equal(z.total, 100);
  assert.equal(z.sole_source, true);
  assert.deepEqual(z.routing, senior(SOLE));
});

test('6: seam: total equal to approve routes Junior, approve 0.1 above routes Senior CONDITIONAL', () => {
  const ext = edit(perfect('pcba'), { '6.ramp_plan': M });
  const at = run(ext, { policy: pol({ approve: 96.7 }) });
  assert.equal(at.total, 96.7); // cat 6 = 2/3 x 10 = 6.67 -> 96.67 -> 96.7
  assert.equal(at.decision, 'APPROVED');
  assert.deepEqual(at.routing, junior(JR_MED));
  const above = run(ext, { policy: pol({ approve: 96.8 }) });
  assert.equal(above.decision, 'CONDITIONAL');
  assert.deepEqual(above.routing, senior('CONDITIONAL'));
});

// ---- 7. reference extractions: DATASET.md queue table ----
// DATASET.md calls these archetype targets; the simulated world (#66, #72) may land on other totals.
// This pins the rubric rule on hand-built packets (perfect + gap-matrix edits), not the sim output.

const DATASET = [
  ['SUP-01', 'cold_plate', { '4.leak_test': M }, 97.5, NA, senior(NA, HIGH), false],
  ['SUP-02', 'quick_disconnect', { '9.second_source': V(false), '4.sample_size': V(false), '7.pcn_notice': V(60) },
    92.1, 'APPROVED', senior(HIGH, SOLE), true],
  ['SUP-03', 'power_module', { '2.ctq_cpk': V(0.94), '3.grr': V(24), '2.spc': A(null), '4.halt': M },
    90.4, NA, senior(NA, HIGH), false],
  ['SUP-04', 'pcba', {}, 100, 'APPROVED', junior(JR_MED), false],
  ['SUP-05', 'machined_part', { '1.cert_current': V('2026-10-15'), '4.fai': V(0.9) }, 96, NA, senior(NA), false],
  ['SUP-06', 'optics_cable', { '1.internal_audit': A(null), '2.pfmea': A(null), '2.spc': A(null),
    '4.workmanship_620': A(null), '7.pcn_notice': M }, 86.5, CO, senior(CO), false],
  ['SUP-07', 'cold_plate', null, 82.6, CO, senior(CO, HIGH), false],
  ['SUP-08', 'contract_mfg', { '4.esd_program': V(false), '4.fpy_data': V(3) }, 95.8, NA, senior(NA, HIGH), false],
  ['SUP-09', 'cold_plate', {}, 100, 'APPROVED', senior(HIGH), false],
];

test('7: the nine DATASET.md candidates reproduce total, decision and routing; 8 Senior, 1 Junior', () => {
  const count = { junior: 0, senior: 0 };
  for (const [id, key, ov, total, dec, routing, sole] of DATASET) {
    const ext = ov === null ? SUP07 : edit(perfect(key), ov);
    const r = evaluate({ ...ext, supplier_id: id }, { as_of: '2026-11-01' });
    assert.equal(r.commodity, key, id);
    assert.equal(r.total, total, id);
    assert.equal(r.decision, dec, id);
    assert.deepEqual(r.routing, routing, id);
    assert.equal(r.sole_source, sole, id);
    count[r.routing.to]++;
  }
  assert.deepEqual(count, { junior: 1, senior: 8 });
});

// ---- 8. shape and purity ----

test('8: routing and sole_source shape, key order in the result', () => {
  for (const ext of [perfect('pcba'), SUP07]) {
    const r = run(ext);
    assert.deepEqual(Object.keys(r.routing), ['to', 'reasons']);
    assert.ok(['junior', 'senior'].includes(r.routing.to));
    assert.ok(Array.isArray(r.routing.reasons) && r.routing.reasons.length > 0);
    for (const s of r.routing.reasons) assert.equal(typeof s, 'string');
    assert.equal(typeof r.sole_source, 'boolean');
    const keys = Object.keys(r);
    const i = keys.indexOf('decision');
    assert.deepEqual(keys.slice(i, i + 3), ['decision', 'routing', 'sole_source']);
    assert.equal(keys.at(-1), 'warnings');
  }
});

test('8: a commodity with a risk outside risk_classes throws naming it', () => {
  const rubric = structuredClone(RUBRIC);
  const prof = rubric.commodities.find((c) => c.key === 'pcba');
  prof.risk = 'Critical';
  assert.throws(() => evaluate(perfectExtraction(rubric, 'pcba'), { as_of: AS_OF, rubric }),
    (e) => e.message.startsWith('pcba: ') && /unknown risk/.test(e.message));
});

test('8: fresh reasons per call; frozen inputs work and give equal results', () => {
  for (const base of [perfect('pcba'), SUP07]) {
    const r1 = run(base);
    const copy = structuredClone(r1.routing);
    r1.routing.reasons.push('x');
    r1.routing.to = 'x';
    assert.deepEqual(run(base).routing, copy);
  }
  const ext = deepFreeze(structuredClone(edit(perfect('pcba'), { '9.second_source': A(false) })));
  const policy = deepFreeze(structuredClone(STARK_REFERENCE));
  const rubric = deepFreeze(structuredClone(RUBRIC));
  const opts = { as_of: AS_OF, policy, rubric };
  const a = evaluate(ext, opts);
  assert.deepEqual(a.routing, senior(UNCONF));
  assert.deepEqual(evaluate(ext, opts), a);
  assert.ok(!Object.isFrozen(a.routing.reasons));
});

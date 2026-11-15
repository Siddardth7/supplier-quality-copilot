// Engine: scoreCriterion and findCriterion (#16; QUAL-FR-01, -02, -03 criterion half, -04, -12,
// QUAL-AC-02, -06, QUAL-NFR-01 engine part, -05). Expected numbers come from docs/RUBRIC.md
// (parsed at test time, or copied by hand into the edge table), never from running the engine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scoreCriterion, findCriterion } from './engine.js';
import { RUBRIC } from './rubric.js';
import { table, segments, interval, expectedRule } from './docs.testkit.js';
import { withGeneratedCommodity } from './rubric.testkit.js';

const RUBRIC_MD = readFileSync(new URL('../docs/RUBRIC.md', import.meta.url), 'utf8');
const ENGINE_SRC = readFileSync(new URL('./engine.js', import.meta.url), 'utf8');

const CITE = 'cert.pdf §1';
const verified = (value) => ({ state: 'verified', value, citation: CITE });
const assumed = (value) => ({ state: 'assumed', value, citation: null });
const MISSING = { state: 'missing', value: null, citation: null };
const ALL_DEFS = [...RUBRIC.criteria, ...RUBRIC.tests];
const def = (id) => {
  const d = ALL_DEFS.find((x) => x.id === id);
  assert.ok(d, `${id} not in RUBRIC.criteria or RUBRIC.tests`);
  return d;
};
const AS_OF = '2026-11-09';

// ---- 1. every criterion and catalog test, every band, from the doc ----

// id -> [{ value, expected }] built from the doc cell only.
function docProbes(id, type, cell) {
  if (type === 'number') {
    const bands = segments(cell).map((s) => ({ ...interval(s.left), score: s.score, text: s.left }));
    const bounds = [...new Set(bands.flatMap((b) => b.bounds))].sort((a, b) => a - b);
    assert.ok(bounds.length > 0, `${id}: no bounds parsed from "${cell}"`);
    const xs = [...bounds, bounds[0] - 1, bounds.at(-1) + 1];
    for (let i = 1; i < bounds.length; i++) xs.push((bounds[i - 1] + bounds[i]) / 2);
    return xs.map((x) => {
      const hits = bands.filter((b) => b.contains(x));
      assert.equal(hits.length, 1, `${id}: doc bands "${cell}" put x=${x} in ${hits.length} bands`);
      return { value: x, expected: hits[0].score };
    });
  }
  const rule = expectedRule(id, type, cell);
  if (type === 'bool') return [{ value: true, expected: rule.true }, { value: false, expected: rule.false }];
  if (type === 'enum') return Object.entries(rule).map(([k, s]) => ({ value: k, expected: s }));
  if (type === 'date') {
    return [
      { value: '2026-11-08', expected: rule.lt_as_of }, // day before as_of
      { value: AS_OF, expected: rule.ge_as_of }, // on as_of
      { value: '2026-11-10', expected: rule.ge_as_of }, // day after
    ];
  }
  throw new Error(`${id}: unhandled type ${type}`);
}

const CRIT_ROWS = table(RUBRIC_MD, 'Criteria').filter((r) => r.ID !== '4.<test>');
const TEST_ROWS = table(RUBRIC_MD, 'Test catalog');
const PROBES = new Map();
for (const r of CRIT_ROWS) PROBES.set(r.ID, { type: r.Type, probes: docProbes(r.ID, r.Type, r['Scoring rule']) });
for (const r of TEST_ROWS) {
  const m = r['Type and rule'].match(/^(\w+)(?:: (.*))?$/);
  assert.ok(m, `${r.ID}: cannot parse "${r['Type and rule']}"`);
  PROBES.set(r.ID, { type: m[1], probes: docProbes(r.ID, m[1], m[2] ?? r['Type and rule']) });
}

test('1: every criterion and catalog test scores its doc band (verified), min(1, band) (assumed), 0 (missing)', () => {
  assert.ok(CRIT_ROWS.length > 0, 'Criteria table parsed 0 rows');
  assert.ok(TEST_ROWS.length > 0, 'Test catalog parsed 0 rows');
  const seen = new Set();
  for (const [id, { type, probes }] of PROBES) {
    const d = def(id);
    assert.equal(d.type, type, `${id} type`);
    assert.ok(probes.length > 0, `${id}: no probes`);
    for (const { value, expected } of probes) {
      const at = `${id} value=${JSON.stringify(value)}`;
      assert.equal(scoreCriterion(d, verified(value), AS_OF), expected, `${at} verified`);
      assert.equal(scoreCriterion(d, assumed(value), AS_OF), Math.min(1, expected), `${at} assumed`);
      assert.equal(scoreCriterion(d, { ...MISSING, value }, AS_OF), 0, `${at} missing`);
    }
    seen.add(id);
  }
  assert.deepEqual([...seen].sort(), ALL_DEFS.map((d) => d.id).sort(), 'probe coverage = criteria + tests');
});

// ---- 2. hand-written edge table (QUAL-FR-04, QUAL-AC-02), copied from RUBRIC.md ----

const EDGES = {
  '2.ctq_cpk': [[1.34, 3], [1.33, 3], [1.3299999, 1], [1.32, 1], [1.00, 1], [0.99, 0]],
  '3.grr': [[9.9, 3], [10, 3], [10.1, 1], [30, 1], [30.1, 0]],
  '6.capacity_ratio': [[1.2, 3], [1.19, 2], [1.0, 2], [0.99, 1], [0.8, 1], [0.79, 0]],
  '7.pcn_notice': [[90, 3], [89, 1], [30, 1], [29, 0]],
  '5.records_retention': [[10, 3], [9.9, 1], [5, 1], [4.9, 0]],
  '4.fai': [[1.0, 3], [0.99, 2], [0.9, 2], [0.89, 1], [0.5, 1], [0.49, 0]],
  '4.fpy_data': [[6, 3], [5.9, 1], [3, 1], [2.9, 0]],
  '9.second_source': [[true, 3], [false, 1]],
  '9.region_risk': [['low', 3], ['medium', 2], ['high', 1]],
  '9.financial_health': [['healthy', 3], ['watch', 1], ['distressed', 0]],
};
for (const [id, rows] of Object.entries(EDGES)) {
  test(`2: edge table ${id}`, () => {
    for (const [v, s] of rows) assert.equal(scoreCriterion(def(id), verified(v)), s, `${id} ${v}`);
  });
}

test('2: edge table 1.cert_current (expiry on as_of passes, rollovers, leap days)', () => {
  const c = def('1.cert_current');
  const cases = [
    ['2026-11-09', AS_OF, 3], ['2026-11-08', AS_OF, 0], ['2026-11-10', AS_OF, 3],
    ['2026-12-31', '2027-01-01', 0], ['2027-01-01', '2026-12-31', 3],
    ['2026-10-31', '2026-11-01', 0], ['2026-11-01', '2026-10-31', 3],
    ['2024-02-29', '2024-02-28', 3], ['2000-02-29', '2000-03-01', 0], ['2024-02-29', '2024-02-29', 3],
  ];
  for (const [expiry, asOf, s] of cases) assert.equal(scoreCriterion(c, verified(expiry), asOf), s, `${expiry} vs ${asOf}`);
});

// ---- 3. assumed (QUAL-FR-02, Sid's decision 2026-11-09) ----

test('3: Sid cases on knockout 2.ctq_cpk: assumed 0.9 -> 0, null -> 1, omitted -> 1, 1.12 -> 1, 1.5 -> 1', () => {
  const c = def('2.ctq_cpk');
  assert.equal(scoreCriterion(c, assumed(0.9)), 0);
  assert.equal(scoreCriterion(c, assumed(null)), 1);
  assert.equal(scoreCriterion(c, { state: 'assumed' }), 1);
  assert.equal(scoreCriterion(c, assumed(1.12)), 1);
  assert.equal(scoreCriterion(c, assumed(1.5)), 1);
});

test('3: assumed caps at 1 and a failing claim scores 0, per spec table', () => {
  const cases = [
    ['3.grr', 5, 1], ['3.grr', 35, 0], ['6.capacity_ratio', 1.5, 1], ['6.capacity_ratio', 0.85, 1],
    ['6.capacity_ratio', 0.5, 0], ['4.fai', 0.95, 1], ['1.capa', false, 0], ['1.capa', true, 1],
    ['1.cert_current', '2026-11-08', 0], ['1.cert_current', '2027-01-01', 1],
    ['9.financial_health', 'distressed', 0], ['9.region_risk', 'low', 1],
    ['9.second_source', false, 1], ['9.second_source', true, 1],
  ];
  for (const [id, v, s] of cases) assert.equal(scoreCriterion(def(id), assumed(v), AS_OF), s, `${id} assumed ${v}`);
});

test('3: assumed with null value scores 1 for every criterion and test, no as_of needed', () => {
  for (const d of ALL_DEFS) assert.equal(scoreCriterion(d, assumed(null)), 1, d.id);
});

test('3: assumed never scores above 1 for any criterion or test at any doc probe', () => {
  for (const d of ALL_DEFS) {
    for (const { value } of PROBES.get(d.id).probes) {
      const s = scoreCriterion(d, assumed(value), AS_OF);
      assert.ok(s <= 1 && s >= 0, `${d.id} assumed ${JSON.stringify(value)} scored ${s}`);
    }
  }
});

// ---- 4. missing and absent (QUAL-FR-02, QUAL-FR-03 criterion half) ----

test('4: missing scores 0 for every criterion and test, including 9.second_source', () => {
  for (const d of ALL_DEFS) assert.equal(scoreCriterion(d, MISSING), 0, d.id);
  assert.equal(scoreCriterion(def('9.second_source'), MISSING), 0);
});

test('4: absent evidence (undefined, null) scores 0', () => {
  for (const d of ALL_DEFS) {
    assert.equal(scoreCriterion(d, undefined), 0, `${d.id} undefined`);
    assert.equal(scoreCriterion(d, null), 0, `${d.id} null`);
  }
});

test('4: missing ignores a stray value and citation, even a wrong-typed one', () => {
  assert.equal(scoreCriterion(def('2.ctq_cpk'), { state: 'missing', value: 2.0, citation: CITE }), 0);
  assert.equal(scoreCriterion(def('9.second_source'), { state: 'missing', value: true, citation: CITE }), 0);
  assert.equal(scoreCriterion(def('2.ctq_cpk'), { state: 'missing', value: 'oops', citation: null }), 0);
});

// ---- 5. throws (QUAL-FR-12, QUAL-AC-06) ----

const FAKE_TYPE = { id: '9.fake_type', type: 'text', rule: {} };
const NO_ELSE = { id: '9.no_else', type: 'number', rule: [{ op: '>=', x: 1, score: 3 }] };
// [label, criterion id or def, evidence, as_of, extra message regex]
const THROWS = [
  ['verified value null', '2.ctq_cpk', { state: 'verified', value: null, citation: CITE }, undefined, /needs a value/],
  ['verified value omitted', '1.capa', { state: 'verified', citation: CITE }, undefined, /needs a value/],
  ['verified citation null', '2.ctq_cpk', { state: 'verified', value: 1.5, citation: null }, undefined, /citation/],
  ['verified citation omitted', '1.capa', { state: 'verified', value: true }, undefined, /citation/],
  ["verified citation ''", '1.capa', { state: 'verified', value: true, citation: '' }, undefined, /citation/],
  ["state 'claimed'", '2.spc', { state: 'claimed', value: true, citation: CITE }, undefined, /state/],
  ["state ''", '2.spc', { state: '', value: true, citation: CITE }, undefined, /state/],
  ['state undefined', '2.spc', { value: true, citation: CITE }, undefined, /state/],
  ["state 'VERIFIED'", '2.spc', { state: 'VERIFIED', value: true, citation: CITE }, undefined, /state/],
  ['unknown state checked before value', '2.ctq_cpk', { state: 'maybe', value: 'x', citation: CITE }, undefined, /state/],
  ["bool given 'true'", '1.capa', verified('true')],
  ['bool given 1', '1.capa', verified(1)],
  ["number given '1.2'", '2.ctq_cpk', verified('1.2')],
  ['number given NaN', '2.ctq_cpk', verified(NaN)],
  ['number given Infinity', '3.grr', verified(Infinity)],
  ['number given -Infinity', '3.grr', verified(-Infinity)],
  ['number given true', '6.capacity_ratio', verified(true)],
  ["date given '2026-13-01'", '1.cert_current', verified('2026-13-01'), AS_OF],
  ["date given '2026-00-10' (month 00)", '1.cert_current', verified('2026-00-10'), AS_OF],
  ["date given '2026-11-00' (day 00)", '1.cert_current', verified('2026-11-00'), AS_OF],
  ["date given '2026-11-31'", '1.cert_current', verified('2026-11-31'), AS_OF],
  ["date given '2026-02-30'", '1.cert_current', verified('2026-02-30'), AS_OF],
  ["date given '1900-02-29' (century, not leap)", '1.cert_current', verified('1900-02-29'), AS_OF],
  ["date given '2023-02-29' (not leap)", '1.cert_current', verified('2023-02-29'), AS_OF],
  ["date given '2026-2-3'", '1.cert_current', verified('2026-2-3'), AS_OF],
  ['date given a number', '1.cert_current', verified(20261109), AS_OF],
  ["date given '2026-11-09T00:00:00Z' (timestamp)", '1.cert_current', verified('2026-11-09T00:00:00Z'), AS_OF],
  ["enum given 'High'", '9.region_risk', verified('High')],
  ["enum given 'constructor'", '9.region_risk', verified('constructor')],
  ["enum given '__proto__'", '9.region_risk', verified('__proto__')],
  ["enum given 'toString'", '9.financial_health', verified('toString')],
  ['enum given a number', '9.financial_health', verified(3)],
  ["assumed number given '1.2'", '2.ctq_cpk', assumed('1.2')],
  ["assumed bool given 'yes'", '1.capa', assumed('yes')],
  ["assumed enum given 'High'", '9.region_risk', assumed('High')],
  ["assumed date given '2026-02-30'", '1.cert_current', assumed('2026-02-30'), AS_OF],
  ['evidence.id for another criterion', '2.ctq_cpk', { id: '2.spc', ...verified(1.5) }, undefined, /2\.spc/],
  ['evidence.id null', '2.ctq_cpk', { id: null, ...verified(1.5) }],
  ['evidence.id mismatch on a missing item', '2.ctq_cpk', { id: '2.spc', ...MISSING }],
  ['date with as_of undefined', '1.cert_current', verified(AS_OF), undefined, /as_of/],
  ["date with as_of '2026-11-9'", '1.cert_current', verified(AS_OF), '2026-11-9', /as_of/],
  ["date with as_of '2026-02-30'", '1.cert_current', verified(AS_OF), '2026-02-30', /as_of/],
  ['assumed date with invalid as_of', '1.cert_current', assumed(AS_OF), '2026-11-9', /as_of/],
  ['unknown criterion type', FAKE_TYPE, verified('x')],
  ['number band list with no else row', NO_ELSE, verified(0)],
];
for (const [label, c, ev, asOf, re] of THROWS) {
  test(`5: throws naming the criterion: ${label}`, () => {
    const d = typeof c === 'string' ? def(c) : c;
    assert.throws(() => scoreCriterion(d, ev, asOf), (e) => {
      assert.ok(e instanceof Error, 'not an Error');
      assert.ok(e.message.includes(d.id), `message "${e.message}" does not name ${d.id}`);
      if (re) assert.match(e.message, re);
      return true;
    });
  });
}

test('5: valid edge inputs do not throw (leap days, omitted evidence.id, matching evidence.id, no as_of off-date)', () => {
  const cert = def('1.cert_current');
  assert.equal(scoreCriterion(cert, verified('2000-02-29'), '2000-02-28'), 3, '2000 is a leap year');
  assert.equal(scoreCriterion(cert, verified('2024-02-29'), '2024-03-01'), 0);
  assert.equal(scoreCriterion(cert, verified('2026-11-30'), '2026-12-01'), 0);
  assert.equal(scoreCriterion(cert, verified('2026-12-31'), '2026-12-01'), 3);
  assert.equal(scoreCriterion(def('2.ctq_cpk'), { id: '2.ctq_cpk', ...verified(1.5) }), 3);
  assert.equal(scoreCriterion(def('2.ctq_cpk'), { id: undefined, ...verified(1.5) }), 3);
  // non-date criteria need no as_of
  assert.equal(scoreCriterion(def('1.capa'), verified(true)), 3);
  assert.equal(scoreCriterion(def('3.grr'), verified(10)), 3);
  assert.equal(scoreCriterion(def('9.region_risk'), verified('medium')), 2);
});

test('5: invalid number input never returns a number', () => {
  let out;
  try { out = scoreCriterion(def('2.ctq_cpk'), verified(NaN)); } catch { out = 'threw'; }
  assert.equal(out, 'threw');
});

// ---- 6. data-driven category 4 (QUAL-NFR-05): generated catalog, unchanged engine ----

test('6: 100 generated catalog tests score through the unchanged engine', () => {
  const G = withGeneratedCommodity(RUBRIC, {});
  const gen = G.tests.filter((t) => t.id.startsWith('4.gen_'));
  assert.equal(gen.length, 100);
  const bools = gen.filter((t) => t.type === 'bool'), nums = gen.filter((t) => t.type === 'number');
  assert.equal(bools.length, 50);
  assert.equal(nums.length, 50);
  for (const t of bools) {
    assert.equal(scoreCriterion(t, verified(true)), 3, `${t.id} true`);
    assert.equal(scoreCriterion(t, verified(false)), 0, `${t.id} false`);
    assert.equal(scoreCriterion(t, assumed(true)), 1, `${t.id} assumed true`);
    assert.equal(scoreCriterion(t, MISSING), 0, `${t.id} missing`);
  }
  for (const t of nums) {
    assert.equal(scoreCriterion(t, verified(1)), 3, `${t.id} 1`);
    assert.equal(scoreCriterion(t, verified(0.5)), 1, `${t.id} 0.5`);
    assert.equal(scoreCriterion(t, verified(0.49)), 0, `${t.id} 0.49`);
    assert.equal(scoreCriterion(t, assumed(2)), 1, `${t.id} assumed 2`);
  }
  assert.equal(scoreCriterion(findCriterion(G, '4.gen_001'), verified(true)), 3);
  assert.equal(scoreCriterion(findCriterion(G, '4.gen_100'), verified(0.5)), 1);
});

// ---- 7. purity (QUAL-NFR-01, engine part) ----

const deepFreeze = (o) => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
};

test('7: frozen criterion and evidence are scored without mutation, same result twice', () => {
  const cases = [
    ['1.capa', verified(true), undefined, 3],
    ['2.ctq_cpk', verified(1.2), undefined, 1],
    ['2.ctq_cpk', assumed(1.5), undefined, 1],
    ['1.cert_current', verified('2026-11-10'), AS_OF, 3],
    ['9.region_risk', verified('high'), undefined, 1],
    ['9.second_source', MISSING, undefined, 0],
  ];
  for (const [id, ev, asOf, s] of cases) {
    const c = deepFreeze(structuredClone(def(id)));
    const e = deepFreeze(structuredClone(ev));
    const snap = JSON.stringify([c, e]);
    assert.equal(scoreCriterion(c, e, asOf), s, id);
    assert.equal(scoreCriterion(c, e, asOf), s, `${id} second call`);
    assert.equal(JSON.stringify([c, e]), snap, `${id} inputs changed`);
  }
});

// Source rules for engine.js (QUAL-NFR-02, QUAL-AC-07): no I/O, clock, randomness, DOM or browser globals,
// no module-level mutable state, and no module reached except the one static import of ./rubric.js
// (an `export … from` re-export would load another module without an `import` keyword).
// Returns the violated rules; [] when the source is clean.
const BANNED = [/\bDate\b/, /Math\.random/, /\bfetch\b/, /\bprocess\b/, /\brequire\b/,
  /\bXMLHttpRequest\b/, /\bIntl\b/, /toLocale/, /^(?:let|var) /m,
  /\bdocument\b/, /\bwindow\b/, /\blocalStorage\b/, /\bnavigator\b/, /\bglobalThis\b/];
function scan(src) {
  const out = BANNED.filter((re) => re.test(src)).map(String);
  const rubricImports = src.match(/^import \{[^}]*\} from '\.\/rubric\.js';$/gm) ?? [];
  const imports = src.match(/\bimport\b/g) ?? [];
  if (rubricImports.length !== 1) out.push('one import of ./rubric.js');
  if (imports.length !== rubricImports.length) out.push('import other than ./rubric.js');
  if ((src.match(/\bfrom\s*['"]/g) ?? []).length !== 1) out.push('one from clause');
  if (/^export\b[^;]*\bfrom\b/m.test(src)) out.push('export … from');
  return out;
}

test('7: engine.js source has no I/O, clock, randomness, DOM, imports other than ./rubric.js, re-exports, or module-level mutable state', () => {
  assert.ok(ENGINE_SRC.includes('export function scoreCriterion'), 'scan is reading the wrong file');
  assert.ok(ENGINE_SRC.includes('export function findCriterion'), 'scan is reading the wrong file');
  assert.ok(ENGINE_SRC.includes('export function evaluate'), 'scan is reading the wrong file');
  assert.deepEqual(scan(ENGINE_SRC), []);
});

test('7: the source scan catches re-exports, extra imports and DOM/browser globals', () => {
  const add = (line) => scan(`${ENGINE_SRC}\n${line}\n`);
  for (const line of ["export { readFileSync } from 'node:fs';", "export * from 'node:fs'",
    "export * as fs from \"node:fs\";", "export {\n  readFileSync,\n} from 'node:fs';"]) {
    const v = add(line);
    assert.ok(v.includes('export … from'), `${line}: ${v}`);
    assert.ok(v.includes('one from clause'), `${line}: ${v}`);
  }
  // A from clause that is not an export (a second static import) is caught by the count and the import rules.
  assert.deepEqual(add("import { readFileSync } from 'node:fs';"), ['import other than ./rubric.js', 'one from clause']);
  // `export { x }` without from (the engine's own re-export line) is allowed.
  assert.deepEqual(add('export { RUBRIC as R };'), []);
  for (const g of ['document', 'window', 'localStorage', 'navigator', 'globalThis', 'fetch']) {
    assert.deepEqual(add(`const x = () => ${g}.y;`), [`/\\b${g}\\b/`], g);
  }
  // Whole words only: names that merely contain a banned word stay legal.
  assert.deepEqual(add('const inWindow = 1, windows = 2, documented = 3;'), []);
});

// ---- 8. findCriterion ----

test('8: findCriterion returns criteria and catalog tests by id', () => {
  assert.equal(findCriterion(RUBRIC, '2.ctq_cpk'), RUBRIC.criteria.find((c) => c.id === '2.ctq_cpk'));
  assert.equal(findCriterion(RUBRIC, RUBRIC.tests[0].id), RUBRIC.tests[0]);
  assert.equal(findCriterion(RUBRIC, RUBRIC.tests.at(-1).id), RUBRIC.tests.at(-1));
  const G = withGeneratedCommodity(RUBRIC, {});
  assert.equal(findCriterion(G, '4.gen_001'), G.tests.find((t) => t.id === '4.gen_001'));
});

test('8: findCriterion throws naming an unknown id', () => {
  for (const id of ['9.nope', '4.<test>', '4.gen_001', '']) {
    assert.throws(() => findCriterion(RUBRIC, id), (e) => e instanceof Error && e.message.startsWith(`${id}: `) && /unknown/.test(e.message), id);
  }
});

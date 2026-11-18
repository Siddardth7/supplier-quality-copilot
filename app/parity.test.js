// L2 parity: app/rubric.js against docs/RUBRIC.md and docs/SCORECARD.md (QUAL-NFR-03, QUAL-NFR-04,
// QUAL-FR-14 data, SCORE-NFR-02, QUAL-AC-08). Every expected value is parsed from the docs at test time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RUBRIC, STARK_REFERENCE, SCORECARD } from './rubric.js';
import { section, table, jsonBlock, bandScore, num, segments, interval, expectedRule } from './docs.testkit.js';

const RUBRIC_MD = readFileSync(new URL('../docs/RUBRIC.md', import.meta.url), 'utf8');
const SCORECARD_MD = readFileSync(new URL('../docs/SCORECARD.md', import.meta.url), 'utf8');

function must(text, re, what) {
  const m = text.match(re);
  assert.ok(m, `${what}: regex ${re} did not match the doc`);
  return m;
}

// Probes every bound, every midpoint between adjacent bounds, and one beyond each end.
function assertNumberRule(id, cell, rule) {
  const bands = segments(cell).map((s) => ({ ...interval(s.left), score: s.score, text: s.left }));
  const bounds = [...new Set(bands.flatMap((b) => b.bounds))].sort((a, b) => a - b);
  assert.ok(bounds.length > 0, `${id}: no bounds parsed from "${cell}"`);
  // Pin the thresholds too: probes alone miss an edge moved inside a band.
  const edges = [...new Set(rule.filter((b) => 'op' in b).map((b) => b.x))].sort((a, b) => a - b);
  assert.deepEqual(edges, bounds, `${id}: band edges in rubric.js vs doc "${cell}"`);
  const probes = [...bounds, bounds[0] - 1, bounds.at(-1) + 1];
  for (let i = 1; i < bounds.length; i++) probes.push((bounds[i - 1] + bounds[i]) / 2);
  for (const x of probes) {
    const hits = bands.filter((b) => b.contains(x));
    assert.equal(hits.length, 1, `${id}: doc bands "${cell}" must partition the line, x=${x} is in ${hits.length}`);
    assert.equal(bandScore(rule, x), hits[0].score, `${id}: x=${x} scores ${hits[0].score} in the doc ("${hits[0].text}")`);
  }
}

function assertRule(id, type, cell, rule) {
  if (type === 'number') assertNumberRule(id, cell, rule);
  else assert.deepEqual(rule, expectedRule(id, type, cell), `${id}: rule vs doc "${cell}"`);
}

const nonEmpty = (rows, what) => {
  assert.ok(rows.length > 0, `${what}: parsed 0 rows`);
  return rows;
};

const CATS = nonEmpty(table(RUBRIC_MD, 'Categories and weights'), 'Categories table');
const CRIT = nonEmpty(table(RUBRIC_MD, 'Criteria'), 'Criteria table');
const TESTS = nonEmpty(table(RUBRIC_MD, 'Test catalog'), 'Test catalog');
const PROFILES = nonEmpty(table(RUBRIC_MD, 'Commodity profiles'), 'Commodity profiles');
const DECISION = nonEmpty(table(RUBRIC_MD, 'Decision and routing'), 'Decision table');
const METRICS = nonEmpty(table(SCORECARD_MD, 'Metrics'), 'Metrics table');
const ALERTS = nonEmpty(table(SCORECARD_MD, 'Alerts'), 'Alerts table');
const TEMPLATE = '4.<test>';
const CRIT_ROWS = CRIT.filter((r) => r.ID !== TEMPLATE);

// ---- 1. categories and weights ----

test('parity 1: categories match the Categories table in order', () => {
  assert.deepEqual(RUBRIC.categories, CATS.map((r) => ({ n: Number(r['#']), name: r.Category })));
});

test('parity 1: qualification weights match the Weight column and sum to 100', () => {
  const docWeights = Object.fromEntries(CATS.map((r) => [r['#'], Number(r.Weight)]));
  assert.equal(Object.values(docWeights).reduce((a, b) => a + b, 0), 100, 'RUBRIC.md weights sum');
  assert.deepEqual(STARK_REFERENCE.qualification.weights, docWeights);
  assert.equal(Object.values(STARK_REFERENCE.qualification.weights).reduce((a, b) => a + b, 0), 100);
});

// ---- 2. policy block and decision thresholds ----

test('parity 2: RUBRIC.md policy JSON matches STARK_REFERENCE id, version, name, qualification', () => {
  const doc = jsonBlock(RUBRIC_MD, 'Team scoring policy');
  for (const k of ['id', 'version', 'name']) assert.equal(STARK_REFERENCE[k], doc[k], k);
  assert.deepEqual(STARK_REFERENCE.qualification, doc.qualification);
});

test('parity 2: approve and conditional match the Decision table', () => {
  const row = (name) => DECISION.find((r) => r.Result === name)?.['Rule (on the rounded total)'];
  const approve = Number(must(row('APPROVED'), /Total ≥ (\d+)/, 'APPROVED row')[1]);
  const [, condLo, condHi] = must(row('CONDITIONAL'), /(\d+) ≤ total < (\d+)/, 'CONDITIONAL row').map(Number);
  const notLo = Number(must(row('NOT APPROVED'), /Total < (\d+)/, 'NOT APPROVED row')[1]);
  assert.equal(condHi, approve, 'CONDITIONAL upper = APPROVED');
  assert.equal(notLo, condLo, 'NOT APPROVED bound = CONDITIONAL lower');
  assert.equal(STARK_REFERENCE.qualification.approve, approve);
  assert.equal(STARK_REFERENCE.qualification.conditional, condLo);
});

// ---- 3. ID sets both directions ----

test('parity 3: criterion and test IDs equal the docs in both directions', () => {
  const doc = new Set([...CRIT_ROWS.map((r) => r.ID), ...TESTS.map((r) => r.ID)]);
  const code = new Set([...RUBRIC.criteria.map((c) => c.id), ...RUBRIC.tests.map((t) => t.id)]);
  const missingInCode = [...doc].filter((id) => !code.has(id));
  const missingInDoc = [...code].filter((id) => !doc.has(id));
  assert.deepEqual(missingInCode, [], `in RUBRIC.md but not in rubric.js: ${missingInCode.join(', ')}`);
  assert.deepEqual(missingInDoc, [], `in rubric.js but not in RUBRIC.md: ${missingInDoc.join(', ')}`);
});

test('parity 3: criteria order and test_criterion match the Criteria table', () => {
  assert.deepEqual(RUBRIC.criteria.map((c) => c.id), CRIT_ROWS.map((r) => r.ID));
  const tpl = CRIT.find((r) => r.ID === TEMPLATE);
  assert.ok(tpl, 'Criteria table has the 4.<test> row');
  assert.deepEqual(RUBRIC.test_criterion, { cat: Number(tpl.Cat), knockout: tpl['★'].startsWith('★') });
});

// ---- 4. per criterion ----

test('parity 4: each criterion cat, type, requirement and knockout match the doc', () => {
  for (const r of CRIT_ROWS) {
    const c = RUBRIC.criteria.find((x) => x.id === r.ID);
    assert.ok(c, `${r.ID} missing`);
    assert.equal(c.cat, Number(r.Cat), `${r.ID} cat`);
    assert.equal(c.type, r.Type, `${r.ID} type`);
    assert.equal(c.requirement, r.Requirement, `${r.ID} requirement`);
    const star = r['★'];
    assert.equal(c.knockout, star.startsWith('★'), `${r.ID} knockout (doc ★ cell "${star}")`);
    const risk = star.match(/^★ (\w+) risk only$/);
    if (risk) assert.deepEqual(c.knockout_risk, [risk[1]], `${r.ID} knockout_risk`);
    else {
      assert.ok(star === '' || star === '★', `${r.ID}: unrecognized ★ cell "${star}"`);
      assert.ok(!('knockout_risk' in c), `${r.ID} must not carry knockout_risk`);
    }
  }
  const docKnockouts = CRIT_ROWS.filter((r) => r['★'].startsWith('★')).map((r) => r.ID);
  assert.ok(docKnockouts.length > 0, 'doc has knockouts');
  assert.deepEqual(RUBRIC.criteria.filter((c) => c.knockout).map((c) => c.id), docKnockouts);
});

// ---- 5. rules, semantically ----

test('parity 5: each criterion rule matches its Scoring-rule cell (band probes at every edge)', () => {
  for (const r of CRIT_ROWS) {
    const c = RUBRIC.criteria.find((x) => x.id === r.ID);
    assertRule(r.ID, r.Type, r['Scoring rule'], c.rule);
  }
});

test('parity 5: each test-catalog row name, passes_when, type and rule match the doc', () => {
  assert.deepEqual(RUBRIC.tests.map((t) => t.id), TESTS.map((r) => r.ID), 'catalog order');
  for (const r of TESTS) {
    const t = RUBRIC.tests.find((x) => x.id === r.ID);
    assert.equal(t.name, r.Test, `${r.ID} name`);
    assert.equal(t.passes_when, r['Passes when'], `${r.ID} passes_when`);
    const cell = r['Type and rule'];
    const m = cell.match(/^(\w+)(?:: (.*))?$/);
    assert.ok(m, `${r.ID}: cannot parse "${cell}"`);
    assert.equal(t.type, m[1], `${r.ID} type`);
    assertRule(r.ID, m[1], m[2] ?? cell, t.rule);
  }
});

// ---- 6. commodity profiles ----

test('parity 6: commodity profiles match the doc row for row', () => {
  const list = (cell) => (cell ? cell.split(' · ').map((s) => s.trim()) : []);
  assert.deepEqual(RUBRIC.commodities, PROFILES.map((r) => ({
    key: r['Commodity key'], name: r.Commodity, risk: r['Risk class'],
    required: list(r['Required (★)']), nice: list(r['Nice to have (not scored)']),
  })));
});

// ---- 7. scorecard metrics ----

const KEYS = Object.keys(SCORECARD.metrics);

function parseMetric(r) {
  const good = r.Good, watch = r.Watch, bad = r.Bad, name = r.Metric;
  const direction = good.startsWith('≥') ? 'higher' : 'lower';
  let m, limits;
  if (direction === 'lower') {
    m = must(good, /^(?:≤ )?([\d.,]+%?)$/, `${name} Good (lower: ≤ or bare)`);
    const g = num(m[1]);
    m = must(watch, /^([\d.,]+)%? < x ≤ ([\d.,]+%?)$/, `${name} Watch (lower: a < x ≤ b)`);
    assert.equal(num(m[1]), g, `${name}: Watch lower bound = Good limit`);
    const w = num(m[2]);
    m = must(bad, /^> ([\d.,]+%?)$/, `${name} Bad (lower: > n)`);
    assert.equal(num(m[1]), w, `${name}: Bad bound = Watch limit`);
    limits = { good: g, watch: w };
  } else {
    m = must(good, /^≥ ([\d.,]+%?)$/, `${name} Good (higher: ≥ n)`);
    const g = num(m[1]);
    m = must(watch, /^([\d.,]+)%? ≤ x < ([\d.,]+%?)$/, `${name} Watch (higher: a ≤ x < b)`);
    const w = num(m[1]);
    assert.equal(num(m[2]), g, `${name}: Watch upper bound = Good limit`);
    m = must(bad, /^< ([\d.,]+%?)$/, `${name} Bad (higher: < n)`);
    assert.equal(num(m[1]), w, `${name}: Bad bound = Watch limit`);
    limits = { good: g, watch: w };
  }
  const winCell = r[Object.keys(r).find((k) => k.startsWith('Window'))];
  let window_months;
  if ((m = winCell.match(/^(\d+) months/))) window_months = Number(m[1]);
  else if (/^snapshot/.test(winCell)) window_months = null;
  else assert.fail(`${name}: cannot parse Window cell "${winCell}"`);
  return { direction, limits, window_months, weight: Number(r.Weight) };
}

test('parity 7: metric names and order match the Metrics table', () => {
  assert.deepEqual(KEYS.map((k) => SCORECARD.metrics[k].name), METRICS.map((r) => r.Metric));
  assert.deepEqual(Object.keys(STARK_REFERENCE.scorecard.weights), KEYS, 'weights key order');
  assert.deepEqual(Object.keys(STARK_REFERENCE.scorecard.limits), KEYS, 'limits key order');
});

test('parity 7: metric weights, direction, limits (operator sides) and windows match the doc', () => {
  const docWeights = {}, docLimits = {};
  for (const r of METRICS) {
    const key = KEYS.find((k) => SCORECARD.metrics[k].name === r.Metric);
    assert.ok(key, `doc metric "${r.Metric}" has no SCORECARD.metrics entry`);
    const p = parseMetric(r);
    docWeights[key] = p.weight;
    docLimits[key] = p.limits;
    assert.equal(SCORECARD.metrics[key].direction, p.direction, `${key} direction`);
    assert.equal(SCORECARD.metrics[key].window_months, p.window_months, `${key} window_months`);
  }
  assert.equal(Object.values(docWeights).reduce((a, b) => a + b, 0), 100, 'SCORECARD.md weights sum');
  assert.deepEqual(STARK_REFERENCE.scorecard.weights, docWeights);
  assert.deepEqual(STARK_REFERENCE.scorecard.limits, docLimits);
});

test('parity 7: repeat NC look-back and SCAR age threshold match the Numerator cells', () => {
  const row = (name) => METRICS.find((r) => r.Metric === name);
  const rep = row(SCORECARD.metrics.repeat_nc.name), aging = row(SCORECARD.metrics.scar_aging.name);
  assert.ok(rep && aging, 'Repeat NC and SCAR aging rows present');
  assert.equal(SCORECARD.metrics.repeat_nc.lookback_days,
    Number(must(rep.Numerator, /within (\d+) days before it/, 'repeat NC look-back')[1]));
  assert.equal(SCORECARD.metrics.scar_aging.age_over_days,
    Number(must(aging.Numerator, /older than (\d+) days/, 'SCAR aging age')[1]));
});

// ---- 8. tiers ----

test('parity 8: tier cut-offs match the Tier line and chain', () => {
  const line = SCORECARD_MD.split('\n').find((l) => l.startsWith('- **Tier**'));
  assert.ok(line, 'Tier line present');
  const A = Number(must(line, /A ≥ (\d+)/, 'tier A')[1]);
  const [, bLo, bHi] = must(line, /B (\d+) ≤ x < (\d+)/, 'tier B').map(Number);
  const [, cLo, cHi] = must(line, /C (\d+) ≤ x < (\d+)/, 'tier C').map(Number);
  const D = Number(must(line, /D < (\d+)/, 'tier D')[1]);
  assert.equal(bHi, A, 'B upper = A');
  assert.equal(cHi, bLo, 'C upper = B');
  assert.equal(D, cLo, 'D bound = C');
  assert.deepEqual(STARK_REFERENCE.scorecard.tiers, { A, B: bLo, C: cLo });
  assert.deepEqual(SCORECARD.tier_order, ['A', 'B', 'C', 'D']);
});

// ---- 9. fixed constants ----

test('parity 9: months, baseline, band points and p-chart sigma match the doc', () => {
  const tf = section(SCORECARD_MD, 'Time frame').join('\n');
  assert.equal(SCORECARD.months, Number(must(tf, /(\d+) calendar months/, 'months')[1]));
  assert.equal(SCORECARD.baseline_months, Number(must(tf, /Baseline\*\* = M1–M(\d+)/, 'baseline')[1]));
  const met = section(SCORECARD_MD, 'Metrics').join('\n');
  const [, g, w, b] = must(met, /Good = (\d+)%, Watch = (\d+)%, Bad = (\d+)%/, 'band points').map(Number);
  assert.deepEqual(SCORECARD.band_points, { good: g / 100, watch: w / 100, bad: b / 100 });
  const pc = section(SCORECARD_MD, 'p-chart').join('\n');
  assert.equal(SCORECARD.pchart.sigma, Number(must(pc, /p\S* \+ (\d+)·√/, 'UCL sigma')[1]));
});

test('parity 9: alert types, run length and SCAR alert age match the Alerts table', () => {
  assert.deepEqual(SCORECARD.alerts.types, ALERTS.map((r) => r.Type));
  const when = (t) => ALERTS.find((r) => r.Type === t)?.['Holds in month *m* when'];
  const runRow = ALERTS.find((r) => /^run\d+$/.test(r.Type));
  assert.ok(runRow, 'run row present');
  const before = Number(must(when(runRow.Type), /the (\d+) plotted points before it/, 'run length')[1]);
  assert.equal(SCORECARD.alerts.run_points, before + 1);
  assert.equal(SCORECARD.alerts.run_points, Number(runRow.Type.match(/\d+/)[0]), 'run type name digits');
  assert.equal(SCORECARD.alerts.scar_aging_over_days,
    Number(must(when('scar_aging'), /more than (\d+) days old/, 'SCAR alert age')[1]));
});

// ---- 10. scorecard policy JSON ----

test('parity 10: SCORECARD.md policy JSON deep-equals STARK_REFERENCE.scorecard', () => {
  assert.deepEqual(STARK_REFERENCE.scorecard, jsonBlock(SCORECARD_MD, 'Composite and tier'));
});

// ---- the helpers themselves fail loudly ----

test('parity helpers throw on a missing heading or table', () => {
  assert.throws(() => section(RUBRIC_MD, 'No such heading'), /not found/);
  assert.throws(() => table('## Empty\n\ntext only\n', 'Empty'), /no table/);
  assert.throws(() => jsonBlock('## Empty\n\ntext\n', 'Empty'), /no json block/);
  assert.throws(() => interval('about 5'), /cannot parse band/);
});

test('issue 161 QUAL-FR-16: RUBRIC.md § Value bounds matches rubric.js range, one row per number criterion or test', () => {
  const rows = table(RUBRIC_MD, 'Value bounds');
  const numbers = [...RUBRIC.criteria, ...RUBRIC.tests].filter((d) => d.type === 'number');
  assert.deepEqual(rows.map((r) => r.ID).sort(), numbers.map((d) => d.id).sort(), 'rows = number defs, no missing, no extra');
  const cell = (s) => (s === 'none' ? undefined : num(s));
  for (const r of rows) {
    const d = numbers.find((x) => x.id === r.ID);
    const want = Object.fromEntries([['min', cell(r.Min)], ['max', cell(r.Max)]].filter(([, v]) => v !== undefined));
    assert.deepEqual(d.range ?? {}, want, `${r.ID} range vs doc Min "${r.Min}" Max "${r.Max}"`);
  }
});

// L1: rubric integrity, data-only, QUAL-NFR-04, QUAL-NFR-05. Reads no docs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { basename, join } from 'node:path';
import { RUBRIC, STARK_REFERENCE } from './rubric.js';
import { checkRubric, withGeneratedCommodity } from './rubric.testkit.js';

const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

test('1: checkRubric(RUBRIC) is clean; weights sum to 100; conditional < approve', () => {
  assert.deepEqual(checkRubric(RUBRIC), []);
  assert.equal(sum(STARK_REFERENCE.qualification.weights), 100);
  assert.equal(sum(STARK_REFERENCE.scorecard.weights), 100);
  assert.ok(STARK_REFERENCE.qualification.conditional < STARK_REFERENCE.qualification.approve);
});

test('2: every commodity has at least one required test (QUAL-NFR-04)', () => {
  assert.ok(RUBRIC.commodities.length > 0);
  for (const c of RUBRIC.commodities) {
    assert.ok(Array.isArray(c.required) && c.required.length >= 1, `${c.key} has no required test`);
  }
});

test('3: exports are data only and survive a JSON round trip', async () => {
  const mod = await import('./rubric.js');
  assert.deepEqual(Object.keys(mod).sort(), ['RUBRIC', 'SCORECARD', 'STARK_REFERENCE']);
  for (const [name, x] of Object.entries(mod)) {
    assert.notEqual(typeof x, 'function', `${name} is a function`);
    assert.deepEqual(JSON.parse(JSON.stringify(x)), x, `${name} does not survive JSON`);
  }
});

// ---- 4. checkRubric is load-bearing ----

const mutate = (fn) => {
  const r = structuredClone(RUBRIC);
  fn(r);
  return checkRubric(r);
};
const hasMsg = (errs, needle, what) =>
  assert.ok(errs.some((e) => e.includes(needle)), `${what}: expected a message naming "${needle}", got ${JSON.stringify(errs)}`);

const crit = (r, id) => r.criteria.find((c) => c.id === id);
const firstOfType = (r, type) => r.criteria.find((c) => c.type === type);

test('4: checkRubric flags a duplicate test id', () => {
  hasMsg(mutate((r) => r.tests.push(structuredClone(r.tests[0]))), RUBRIC.tests[0].id, 'duplicate test id');
});

test('4: checkRubric flags a required id absent from the catalog', () => {
  hasMsg(mutate((r) => r.commodities[0].required.push('4.no_such_test')), '4.no_such_test', 'unknown required id');
});

test('4: checkRubric flags an id in both required and nice', () => {
  const c = RUBRIC.commodities[0];
  const errs = mutate((r) => r.commodities[0].nice.push(r.commodities[0].required[0]));
  hasMsg(errs, c.key, 'required and nice');
  hasMsg(errs, c.required[0], 'required and nice');
});

test('4: checkRubric flags a commodity with empty required', () => {
  hasMsg(mutate((r) => { r.commodities[1].required = []; }), RUBRIC.commodities[1].key, 'empty required');
});

test('4: checkRubric flags a number rule whose last row has an op', () => {
  const id = firstOfType(RUBRIC, 'number').id;
  hasMsg(mutate((r) => { crit(r, id).rule.at(-1).op = '>='; crit(r, id).rule.at(-1).x = 0; }), id, 'last row with op');
});

test('4: checkRubric flags a bool rule missing false', () => {
  const id = firstOfType(RUBRIC, 'bool').id;
  hasMsg(mutate((r) => { delete crit(r, id).rule.false; }), id, 'bool missing false');
});

test('4: checkRubric flags an enum score of 4', () => {
  const c = firstOfType(RUBRIC, 'enum');
  const k = Object.keys(c.rule)[0];
  hasMsg(mutate((r) => { crit(r, c.id).rule[k] = 4; }), c.id, 'enum score 4');
});

test('4: checkRubric flags an unknown type', () => {
  const id = RUBRIC.criteria[0].id;
  hasMsg(mutate((r) => { r.criteria[0].type = 'string'; }), id, 'unknown type');
});

test('4: checkRubric flags a knockout_risk outside risk_classes', () => {
  const id = RUBRIC.criteria.find((c) => 'knockout_risk' in c).id;
  hasMsg(mutate((r) => { crit(r, id).knockout_risk = ['Critical']; }), id, 'bad knockout_risk');
});

test('4: checkRubric flags a criterion id whose prefix is not its category', () => {
  const c = RUBRIC.criteria[0];
  const bad = c.id.replace(/^\d/, String((c.cat % 9) + 1));
  hasMsg(mutate((r) => { r.criteria[0].id = bad; }), bad, 'id prefix vs category');
});

test('4: checkRubric flags an id that is both a criterion and a test', () => {
  const id = RUBRIC.criteria[0].id;
  hasMsg(mutate((r) => { r.tests[0].id = id; }), 'both a criterion and a test', 'criterion and test');
});

test('4: checkRubric flags an id listed twice in one profile list', () => {
  const c = RUBRIC.commodities[0];
  hasMsg(mutate((r) => r.commodities[0].required.push(c.required[0])), `${c.required[0]} listed twice`, 'duplicate in list');
});

test('4: checkRubric flags an unknown risk', () => {
  hasMsg(mutate((r) => { r.commodities[2].risk = 'Critical'; }), RUBRIC.commodities[2].key, 'unknown risk');
});

// ---- 5. scale fixture (structural half of QUAL-AC-10) ----

test('5: withGeneratedCommodity gives a valid 100-test commodity, deterministic, input untouched', () => {
  const before = structuredClone(RUBRIC);
  const g = withGeneratedCommodity(RUBRIC, {});
  assert.deepEqual(RUBRIC, before, 'input RUBRIC mutated');
  assert.deepEqual(checkRubric(g), []);
  const c = g.commodities.at(-1);
  assert.equal(c.required.length, 100);
  assert.equal(new Set(c.required).size, 100);
  const types = c.required.map((id) => g.tests.find((t) => t.id === id).type);
  assert.equal(types.filter((t) => t === 'bool').length, 50);
  assert.equal(types.filter((t) => t === 'number').length, 50);
  assert.equal(g.commodities.length, RUBRIC.commodities.length + 1);
  assert.deepEqual(withGeneratedCommodity(RUBRIC, {}), g, 'two calls differ');
});

// ---- 6. integrity grep (QUAL-NFR-05) ----

const APP = fileURLToPath(new URL('.', import.meta.url));
const SCANNED = /\.(js|mjs|html|css)$/;
const RUBRIC_FILE = join(APP, 'rubric.js');
const EXCLUDED = (f) => f === RUBRIC_FILE || f.endsWith('.test.js') || f.endsWith('.testkit.js');
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
}

test('6: no file in app/ outside rubric.js hard-codes a catalog test ID or commodity key', () => {
  const patterns = [
    ...RUBRIC.tests.map((t) => [t.id, new RegExp(`(?<![\\w.])${esc(t.id)}(?![\\w])`)]),
    // Keys are also caught after a dot (byKey.cold_plate); test IDs start with a digit, so a dot can't precede them.
    ...RUBRIC.commodities.map((c) => [c.key, new RegExp(`(?<![\\w])${esc(c.key)}(?![\\w])`)]),
  ];
  const files = walk(APP);
  const rubricFile = files.find((f) => f === RUBRIC_FILE);
  assert.ok(rubricFile, 'walker did not find rubric.js');
  const leak = patterns.find(([id]) => id === '4.leak_test');
  assert.ok(leak && leak[1].test(readFileSync(rubricFile, 'utf8')), 'scan cannot see 4.leak_test in rubric.js');
  const key = patterns.find(([id]) => id === RUBRIC.commodities[0].key);
  assert.ok(key[1].test(readFileSync(rubricFile, 'utf8')), `scan cannot see ${key[0]} in rubric.js`);
  assert.ok(key[1].test(`byKey.${key[0]}`), 'scan misses a key reached with a dot');
  const offenders = [];
  for (const f of files) {
    if (!SCANNED.test(basename(f)) || EXCLUDED(f)) continue;
    const text = readFileSync(f, 'utf8');
    for (const [id, re] of patterns) if (re.test(text)) offenders.push(`${f}: ${id}`);
  }
  assert.deepEqual(offenders, []);
});

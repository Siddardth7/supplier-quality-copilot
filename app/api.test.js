// Engine export surface (#23; QUAL-NFR-02, QUAL-AC-07, PRD-01 § Engine API). The expected export list is
// read from the PRD-01 Engine API table, so the doc and the module cannot drift apart.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as engine from './engine.js';
import * as rubric from './rubric.js';
import { table } from './docs.testkit.js';

const PRD01 = readFileSync(new URL('../docs/product/PRD-01-qualification-engine.md', import.meta.url), 'utf8');
const DOC_NAMES = table(PRD01, 'Engine API').map((r) => r.Name);
const FUNCTIONS = ['evaluate', 'findCriterion', 'parseHistory', 'scoreCriterion', 'scorecard', 'validatePolicy', 'weightsFromRatings'];
const DATA = ['RUBRIC', 'SCORECARD', 'STARK_REFERENCE'];

test('api: engine.js exports exactly the ten documented names (validatePolicy added in issue 109)', () => {
  assert.deepEqual(Object.keys(engine).sort(), [...DATA, ...FUNCTIONS].sort());
  assert.deepEqual([...DOC_NAMES].sort(), Object.keys(engine).sort(), 'PRD-01 Engine API table vs engine.js exports');
  assert.equal(new Set(DOC_NAMES).size, DOC_NAMES.length, 'a name is listed twice in the Engine API table');
});

test('api: functions are functions, data re-exports are the rubric.js objects', () => {
  for (const f of FUNCTIONS) assert.equal(typeof engine[f], 'function', f);
  for (const d of DATA) {
    assert.ok(engine[d] !== null && typeof engine[d] === 'object', d);
    assert.equal(engine[d], rubric[d], `${d} is not the same object as rubric.js`);
  }
});

test('api: evaluate and scorecard run end to end through the namespace import with no DOM', () => {
  assert.equal(typeof document, 'undefined');
  assert.equal(typeof window, 'undefined');
  const extraction = { supplier_id: 'SUP-00', commodity: engine.RUBRIC.commodities[0].key, criteria: [] };
  const r = engine.evaluate(extraction, { as_of: '2026-11-10' });
  assert.equal(r.decision, 'NOT APPROVED');
  assert.deepEqual(r.policy, { id: 'stark-reference', version: 1, name: 'Stark Reference v1' });
  const s = engine.scorecard([], { as_of: '2026-11-10' });
  assert.deepEqual(s.policy, r.policy);
  assert.deepEqual(s.suppliers, []);
});

// Reader accuracy over the shipped data (issue 172; PRD-05 UIQ-AC-13, UIQ-NFR-03; spec 3.3). The key block must be
// exact; the extraction block is pinned with its disagreement list so a dataset or reader change cannot pass silently.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measure, report } from './reader-accuracy.mjs';

const m = measure();
const AGENT_STRICTER = ['1.internal_audit', '1.capa', '1.calibration', '2.pfmea', '2.control_plan', '2.spc', '3.inspection_method',
  '5.lot_trace', '5.nc_segregation', '8.flowdown'];

test('UIQ-AC-13: answer keys: 1440/1440 state, value, citation and 45/45 evaluations on worlds 93, 101-104', () => {
  assert.deepEqual(m.key, { worlds: [93, 101, 102, 103, 104], packets: 45, rows: 1440, state: 1440, value: 1440, citation: 1440,
    evaluation: 45, disagreements: [] });
});

test('UIQ-AC-13: extraction: 278/288 state, 287/288 value, 288/288 citation with the 11 listed disagreements', () => {
  const { disagreements, ...counts } = m.extraction;
  assert.deepEqual(counts, { packets: 9, rows: 288, state: 278, value: 287, citation: 288 });
  assert.deepEqual(disagreements, [
    ...AGENT_STRICTER.map((criterion) => ({ supplier: 'SUP-03', criterion, extracted: { state: 'assumed', value: true }, reader: { state: 'verified', value: true } })),
    { supplier: 'SUP-06', criterion: '9.second_source', extracted: { state: 'assumed', value: true }, reader: { state: 'assumed', value: null } },
  ]);
});

test('UIQ-AC-13: the CLI report prints the spec lines', () => {
  const out = report(m).split('\n');
  assert.equal(out[0], 'answer key (worlds 93,101,102,103,104; 45 packets; 1440 rows)');
  assert.equal(out[1], '  state agreement    1440/1440');
  assert.equal(out[4], '  evaluation match   45/45       (total, decision, knockouts, routing from evaluate() on reader rows vs candidate.evaluation)');
  assert.equal(out[5], '  disagreements: none');
  assert.equal(out[6], 'extraction (data/suppliers vs data/extracted; 9 packets; 288 rows)');
  assert.equal(out[7], '  state 278/288  value 287/288  citation 288/288');
  assert.equal(out.length, 9 + 11);
  assert.equal(out.at(-1), '    SUP-06 9.second_source: extracted assumed true, reader assumed null');
});

// View model (#37; UIQ-FR-01, UIQ-FR-12, UIM-FR-01, UIM-FR-12, UIT-FR-08 shape). buildModel is the only
// engine caller: expected values come from the engine's own fields or from a direct evaluate() call with the
// same inputs, never from copied engine output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildModel, sheetPart } from './model.js';
import { evaluate, scorecard, parseHistory, STARK_REFERENCE } from './engine.js';
import { RUBRIC } from './rubric.js';
import { perfectExtraction } from './rubric.testkit.js';

const AS_OF = '2026-11-01';
const HISTORY = parseHistory([
  'date,supplier_id,part_no,received_qty,rejected_qty,on_time,defect_found_at,failure_mode_code,scar_id,scar_opened,scar_closed',
  '2026-10-06,ACT-01,CP-1,200,0,1,none,,,,',
  '2026-10-07,ACT-02,CP-2,100,0,1,none,,,,',
].join('\n') + '\n');
const sup = (id) => ({ id, name: `Name ${id}`, commodity: 'cold_plate', part: 'cold_plate' });

// One non-knockout criterion assumed, so the total sits just under 100 and a stricter policy can move it.
function extraction(id, edits = {}) {
  const x = perfectExtraction(RUBRIC, 'cold_plate');
  x.supplier_id = id;
  x.criteria = x.criteria.map((c) => (c.id === '6.ramp_plan' ? { ...c, state: 'assumed', value: null, citation: null } : c));
  x.criteria = x.criteria.map((c) => (c.id in edits ? { ...c, value: edits[c.id] } : c));
  return x;
}
const okFile = (id, value) => ({ ok: true, value, path: `data/extracted/${id}.json` });
const failFile = (id, message = 'HTTP 404') => ({ ok: false, error: { path: `data/extracted/${id}.json`, message, kind: 'fetch' } });

function data({ as_of = AS_OF, ids = ['SUP-01', 'SUP-02'], extractions, history } = {}) {
  return {
    suppliers: { ok: true, value: { as_of, candidates: ids.map(sup), active: [sup('ACT-01'), sup('ACT-02')] }, path: 'data/suppliers.json' },
    history: history ?? { ok: true, value: HISTORY, path: 'data/history.csv' },
    extractions: extractions ?? Object.fromEntries(ids.map((id) => [id, okFile(id, extraction(id))])),
    manual: { records: [], error: null },
  };
}
const SUPPLIERS_FAIL = { ok: false, error: { path: 'data/suppliers.json', message: 'HTTP 404', kind: 'fetch' } };
const HISTORY_FAIL = { ok: false, error: { path: 'data/history.csv', message: 'HTTP 404', kind: 'fetch' } };

test('UIQ-FR-01: every candidate is scored with the loaded as_of and the policy passed in', () => {
  const d = data();
  const m = buildModel(d, STARK_REFERENCE);
  assert.equal(m.as_of, AS_OF);
  assert.deepEqual(m.policy, { id: STARK_REFERENCE.id, version: STARK_REFERENCE.version, name: STARK_REFERENCE.name });
  assert.deepEqual(m.candidates.map((c) => c.id), ['SUP-01', 'SUP-02'], 'suppliers.json order is kept');
  for (const c of m.candidates) {
    assert.equal(c.status, 'scored');
    assert.equal(c.source, 'dataset');
    assert.equal(c.error, null);
    assert.equal(c.name, `Name ${c.id}`);
    assert.deepEqual(c.evaluation, evaluate(d.extractions[c.id].value, { as_of: AS_OF, policy: STARK_REFERENCE }));
  }
  assert.equal(m.monitor.ok, true);
  assert.deepEqual(m.monitor.value, scorecard(HISTORY, { as_of: AS_OF, policy: STARK_REFERENCE }));
  assert.deepEqual(m.monitor.active.map((a) => a.id), ['ACT-01', 'ACT-02']);
  assert.equal(m.manual, d.manual);
});

test('UIQ-FR-01: as_of comes from suppliers.json, not a constant', () => {
  const expiring = { extractions: { 'SUP-01': okFile('SUP-01', extraction('SUP-01', { '1.cert_current': '2026-06-01' })) }, ids: ['SUP-01'] };
  const before = buildModel(data({ ...expiring, as_of: '2026-01-01' }), STARK_REFERENCE).candidates[0].evaluation;
  const after = buildModel(data({ ...expiring, as_of: '2026-11-01' }), STARK_REFERENCE).candidates[0].evaluation;
  assert.notEqual(before.decision, after.decision);
});

test('UIM-FR-01: a different policy object re-grades without a reload', () => {
  const ref = buildModel(data(), STARK_REFERENCE).candidates[0].evaluation;
  assert.equal(ref.decision, 'APPROVED');
  assert.ok(ref.total < 100);
  const strict = { ...STARK_REFERENCE, id: 'strict', version: 2, name: 'Strict',
    qualification: { ...STARK_REFERENCE.qualification, approve: Math.ceil(ref.total) + (Number.isInteger(ref.total) ? 1 : 0) } };
  const m = buildModel(data(), strict);
  assert.equal(m.candidates[0].evaluation.decision, 'CONDITIONAL');
  assert.deepEqual(m.policy, { id: 'strict', version: 2, name: 'Strict' });
  // Decision 97: model.pass is the active policy's pass marks (Compare's "Below pass mark"), never a literal.
  assert.deepEqual(buildModel(data(), STARK_REFERENCE).pass, { approve: STARK_REFERENCE.qualification.approve, conditional: STARK_REFERENCE.qualification.conditional });
  assert.deepEqual(buildModel(data(), STARK_REFERENCE).pass, { approve: 85, conditional: 70 });
  assert.deepEqual(m.pass, { approve: strict.qualification.approve, conditional: 70 });
  assert.deepEqual(buildModel(data(), { ...strict, qualification: { ...strict.qualification, conditional: 72.5 } }).pass.conditional, 72.5);
});

test('UIQ-FR-12: not-extracted and engine-error stay on their own candidate', () => {
  const ids = ['SUP-01', 'SUP-02', 'SUP-03', 'SUP-04'];
  const bogus = { ...extraction('SUP-03'), commodity: 'bogus' };
  let engineMessage;
  try { evaluate(bogus, { as_of: AS_OF }); } catch (e) { engineMessage = e.message; }
  assert.ok(engineMessage);
  const d = data({ ids, extractions: {
    'SUP-01': okFile('SUP-01', extraction('SUP-01')),
    'SUP-02': failFile('SUP-02'),
    'SUP-03': okFile('SUP-03', bogus),
    // SUP-04 has no entry at all
  } });
  const [a, b, c, e] = buildModel(d, STARK_REFERENCE).candidates;
  assert.equal(a.status, 'scored');
  assert.equal(b.status, 'not-extracted');
  assert.equal(b.evaluation, null);
  assert.equal(b.error.path, 'data/extracted/SUP-02.json');
  assert.equal(b.error.message, 'HTTP 404');
  assert.equal(c.status, 'engine-error');
  assert.equal(c.evaluation, null);
  assert.equal(c.error.path, 'data/extracted/SUP-03.json');
  assert.equal(c.error.message, engineMessage);
  assert.equal(e.status, 'not-extracted');
  assert.equal(e.evaluation, null);
  assert.equal(e.error.path, null);
});

test('mismatched supplier_id in the file is scored under the candidate id', () => {
  const d = data({ ids: ['SUP-01'], extractions: { 'SUP-01': okFile('SUP-01', extraction('SUP-99')) } });
  const [c] = buildModel(d, STARK_REFERENCE).candidates;
  assert.equal(c.id, 'SUP-01');
  assert.equal(c.status, 'scored');
});

test('UIT-FR-08: a failed history.csv fails Monitor only; candidates are still scored', () => {
  const m = buildModel(data({ history: HISTORY_FAIL }), STARK_REFERENCE);
  assert.equal(m.monitor.ok, false);
  assert.equal(m.monitor.error.path, 'data/history.csv');
  assert.equal(m.monitor.error.message, 'HTTP 404');
  assert.deepEqual(m.candidates.map((c) => c.status), ['scored', 'scored']);
});

test('UIM-FR-12: a scorecard() throw becomes a Monitor engine error naming history.csv', () => {
  let message;
  try { scorecard(null, { as_of: AS_OF }); } catch (e) { message = e.message; }
  const m = buildModel(data({ history: { ok: true, value: null, path: 'data/history.csv' } }), STARK_REFERENCE);
  assert.equal(m.monitor.ok, false);
  assert.equal(m.monitor.error.path, 'data/history.csv');
  assert.equal(m.monitor.error.message, message);
  assert.equal(m.monitor.error.kind, 'engine');
  assert.deepEqual(m.candidates.map((c) => c.status), ['scored', 'scored']);
});

test('UIQ-FR-12: failed suppliers.json empties candidates and Monitor names it; as_of is null', () => {
  const m = buildModel({ ...data(), suppliers: SUPPLIERS_FAIL, extractions: {} }, STARK_REFERENCE);
  assert.equal(m.as_of, null);
  assert.deepEqual(m.candidates, []);
  assert.equal(m.monitor.ok, false);
  assert.equal(m.monitor.error.path, 'data/suppliers.json');
  assert.equal(m.suppliers, SUPPLIERS_FAIL);
});

test('UIM-FR-12: when both files fail, Monitor names history.csv', () => {
  const m = buildModel({ ...data(), suppliers: SUPPLIERS_FAIL, history: HISTORY_FAIL, extractions: {} }, STARK_REFERENCE);
  assert.equal(m.monitor.error.path, 'data/history.csv');
  assert.deepEqual(m.candidates, []);
});

test('model.js and manual.js (hand entry live panel and Import, issue 77) are the only non-test app modules that call evaluate or scorecard', async () => {
  const { readdirSync } = await import('node:fs');
  const dir = new URL('./', import.meta.url);
  const walk = (u) => readdirSync(u, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(new URL(`${e.name}/`, u)) : [new URL(e.name, u)]);
  const callers = walk(dir)
    .filter((u) => u.pathname.endsWith('.js') && !/\.test(kit)?\.js$|\.testkit\.js$/.test(u.pathname))
    .filter((u) => !/\/app\/(engine|rubric)\.js$/.test(u.pathname))
    .filter((u) => /\b(evaluate|scorecard)\s*\(/.test(readFileSync(u, 'utf8')))
    .map((u) => u.pathname.replace(/^.*\/app\//, ''));
  assert.deepEqual(callers.sort(), ['manual.js', 'model.js']);
});

// #40 (decision 24): requirement sheets pass through; sheetPart reads the part number or gives null.
test('UIQ-FR-20: buildModel carries data.sheets ({} when absent) and sheetPart reads part_no only from an ok sheet', () => {
  assert.deepEqual(buildModel(data(), STARK_REFERENCE).sheets, {});
  assert.deepEqual(buildModel({ ...data(), suppliers: SUPPLIERS_FAIL, extractions: {} }, STARK_REFERENCE).sheets, {});
  const sheets = {
    cold_plate: { ok: true, value: { commodity: 'cold_plate', part_no: 'SI-CP-0007' }, path: 'data/requirements/cold_plate.json' },
    pcba: { ok: false, error: { path: 'data/requirements/pcba.json', message: 'HTTP 404', kind: 'fetch' } },
  };
  const m = buildModel({ ...data(), sheets }, STARK_REFERENCE);
  assert.equal(m.sheets, sheets);
  assert.equal(sheetPart(m, 'cold_plate'), 'SI-CP-0007');
  assert.equal(sheetPart(m, 'pcba'), null);
  assert.equal(sheetPart(m, 'sheet_metal'), null);
  assert.equal(sheetPart(m, 'toString'), null, 'no prototype lookups');
  assert.equal(sheetPart({}, 'cold_plate'), null);
  // The part number never comes from the candidate's descriptive part text.
  assert.equal(m.candidates[0].part, 'cold_plate');
});

// Tester addition (#40 QA): the hasOwn guard really blocks inherited keys, not just Object.prototype methods.
test('QA UIQ-FR-20: sheetPart ignores an inherited (prototype) sheet entry', () => {
  const inherited = Object.create({ cold_plate: { ok: true, value: { commodity: 'cold_plate', part_no: 'SI-XX-9999' } } });
  assert.equal(sheetPart({ sheets: inherited }, 'cold_plate'), null);
});

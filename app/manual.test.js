// + New supplier, hand entry: the pure logic in manual.js (issue 77; PRD-05 UIQ-FR-15, -16, UIQ-AC-09, -10, -11;
// QUAL-NFR-05; spec tests 1-9). Every expected list is derived from rubric.js here, never hand-typed, so a rubric
// change moves the checklist and these tests together.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluate, STARK_REFERENCE } from './engine.js';
import { RUBRIC } from './rubric.js';
import { MANUAL_KEY, loadData } from './data.js';
import { safeStorage } from './storage.js';
import { buildModel } from './model.js';
import {
  SCHEMA, STATES, WHERE_REQUIRED, checklist, nextId, parseValue, blankEntry, entryFromRecord, setPart, setRow, toRecord,
  toExtraction, scoreEntry, writeManual, upsert, remove, exportRecord, importRecord,
} from './manual.js';

const AS_OF = '2026-11-01';
const CTX = { as_of: AS_OF, policy: STARK_REFERENCE };
const defOf = (id) => RUBRIC.criteria.find((c) => c.id === id) ?? RUBRIC.tests.find((t) => t.id === id);
const sheetOf = (key) => JSON.parse(readFileSync(new URL(`../data/requirements/${key}.json`, import.meta.url), 'utf8'));

// Raw form text that scores 3 under the row's own rule (read from rubric data, not the engine).
function topRaw({ id }) {
  const { type, rule } = defOf(id);
  if (type === 'date') return '2099-01-01';
  if (type === 'number') return String(rule.find((b) => b.score === 3 && (b.op === '>=' || b.op === '<=')).x);
  return Object.keys(rule).reduce((a, b) => (rule[b] > rule[a] ? b : a));  // bool and enum: best key
}

/** An entry for a commodity with every row proven at a top value. */
function fullEntry(key, name = 'Hand Co') {
  const sheet = { commodity: key, part_no: `PART-${key}` };
  let e = setPart({ ...blankEntry(), name }, sheet);
  for (const r of checklist(key)) e = setRow(e, r.id, { state: 'verified', value: topRaw(r), where: 'packet p.1' });
  return e;
}
const firstOf = (key, type) => checklist(key).find((r) => r.type === type && !r.nice).id;
const PROFILES = RUBRIC.commodities;
const HIGH = PROFILES.find((p) => p.risk === 'High').key;
const record = (key = HIGH, id = 'NEW-01') => toRecord(fullEntry(key), { id, saved_at: '2026-11-13' });

function memoryStorage() {
  const map = new Map();
  return { map, localStorage: { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => { map.set(k, String(v)); } } };
}

// ---- 1, 2. checklist ----

test('1 UIQ-AC-09: checklist for each of the 8 commodities is exactly the criteria the engine scores, plus the nice tests', () => {
  assert.equal(PROFILES.length, 8);
  for (const p of PROFILES) {
    const rows = checklist(p.key);
    const ids = rows.map((r) => r.id);
    const want = [...RUBRIC.criteria.map((c) => c.id), ...p.required, ...(p.nice ?? [])];
    assert.deepEqual([...ids].sort(), [...want].sort(), p.key);
    assert.equal(new Set(ids).size, ids.length, `${p.key}: no duplicates`);
    // Category 4: required tests before nice ones; nice rows flagged and last.
    const cat4 = rows.filter((r) => r.cat === RUBRIC.test_criterion.cat).map((r) => r.id);
    assert.ok(Math.max(...p.required.map((id) => cat4.indexOf(id))) < Math.min(...(p.nice ?? []).map((id) => cat4.indexOf(id)), Infinity), p.key);
    for (const r of rows) {
      const d = defOf(r.id);
      assert.equal(r.type, d.type, r.id);
      assert.equal(r.nice, (p.nice ?? []).includes(r.id), `${p.key} ${r.id} nice`);
      assert.equal(r.test, RUBRIC.tests.some((t) => t.id === r.id), `${p.key} ${r.id} test`);
      assert.deepEqual(r.options, d.type === 'enum' ? Object.keys(d.rule) : null, r.id);
      const crit = RUBRIC.criteria.find((c) => c.id === r.id);
      const ko = crit ? crit.knockout === true && (!crit.knockout_risk || crit.knockout_risk.includes(p.risk))
        : p.required.includes(r.id) && RUBRIC.test_criterion.knockout === true;
      assert.equal(r.knockout, ko, `${p.key} ${r.id} knockout`);
    }
    // Cross-check with the engine: all proven at top values scores 100 with no warnings, and the engine's rows are the
    // checklist's non-nice rows in the same order.
    const ev = scoreEntry(fullEntry(p.key), CTX).result.evaluation;
    assert.deepEqual(ev.categories.flatMap((c) => c.criteria).map((x) => x.id), rows.filter((r) => !r.nice).map((r) => r.id), p.key);
    assert.deepEqual(ev.warnings, [], p.key);
    assert.equal(ev.total, 100, p.key);
  }
});

test('1: a knockout_risk criterion is a knockout only for the commodities whose risk it names', () => {
  const kr = RUBRIC.criteria.find((c) => c.knockout && c.knockout_risk);
  assert.ok(kr, 'rubric has a risk-scoped knockout');
  for (const p of PROFILES) assert.equal(checklist(p.key).find((r) => r.id === kr.id).knockout, kr.knockout_risk.includes(p.risk), p.key);
  assert.ok(PROFILES.some((p) => !kr.knockout_risk.includes(p.risk)), 'at least one commodity where it is not a knockout');
});

test('2: checklist of an unknown commodity is null', () => {
  assert.equal(checklist('nope'), null);
  assert.equal(checklist(undefined), null);
});

// ---- 3. parseValue ----

test('3: parseValue maps form text to engine values', () => {
  assert.equal(parseValue('number', ''), null);
  assert.equal(parseValue('bool', '   '), null);
  assert.equal(parseValue('number', '1.33'), 1.33);
  assert.equal(parseValue('number', ' 90 '), 90);
  assert.equal(parseValue('number', 'abc'), 'abc');
  assert.equal(parseValue('bool', 'true'), true);
  assert.equal(parseValue('bool', 'false'), false);
  assert.equal(parseValue('date', ' 2026-11-01 '), '2026-11-01');
  assert.equal(parseValue('enum', ' low '), 'low');
});

// ---- 4. nextId ----

test('4 UIQ-FR-16: nextId is the largest NEW- suffix + 1, zero-padded to 2, past 99 to NEW-100', () => {
  const ids = (...xs) => xs.map((supplier_id) => ({ supplier_id }));
  assert.equal(nextId([]), 'NEW-01');
  assert.equal(nextId(ids('NEW-01')), 'NEW-02');
  assert.equal(nextId(ids('NEW-01', 'NEW-03')), 'NEW-04');
  assert.equal(nextId(ids('NEW-03', 'NEW-01')), 'NEW-04');
  assert.equal(nextId(ids('NEW-09')), 'NEW-10');
  assert.equal(nextId(ids('NEW-98')), 'NEW-99');
  assert.equal(nextId(ids('NEW-99')), 'NEW-100');
  assert.equal(nextId(ids('NEW-100', 'NEW-02')), 'NEW-101');
  assert.equal(nextId(ids('SUP-50', 'junk')), 'NEW-01');
});

// ---- 5. toRecord / toExtraction ----

test('5: toRecord writes the sqc-manual/1 shape; missing rows carry no value and no where but keep the note', () => {
  const key = HIGH;
  const num = firstOf(key, 'number');
  let e = fullEntry(key, '  Padded Name  ');
  e = setRow(e, num, { note: ' keep me ', where: ' sec 2 ' });
  e = setRow(e, num, { state: 'missing' });
  const r = toRecord(e, { id: 'NEW-07', saved_at: '2026-11-13' });
  assert.equal(r.schema, SCHEMA);
  assert.equal(r.schema, 'sqc-manual/1');
  assert.deepEqual(Object.keys(r), ['schema', 'supplier_id', 'name', 'part_no', 'commodity', 'saved_at', 'criteria']);
  assert.equal(r.supplier_id, 'NEW-07');
  assert.equal(r.saved_at, '2026-11-13');
  assert.equal(r.name, 'Padded Name');
  assert.equal(r.commodity, key);
  assert.equal(r.criteria.length, checklist(key).length, 'every row stored');
  assert.deepEqual(r.criteria.find((c) => c.id === num), { id: num, state: 'missing', value: null, where: null, note: 'keep me' });
  const bool = r.criteria.find((c) => c.id === firstOf(key, 'bool'));
  assert.deepEqual(bool, { id: bool.id, state: 'verified', value: true, where: 'packet p.1', note: null });
  const x = toExtraction(r);
  assert.equal(x.source, 'manual');
  assert.equal(Object.hasOwn(x, 'drafts'), false);
  assert.equal(x.supplier_id, 'NEW-07');
  assert.equal(x.commodity, key);
  assert.deepEqual(x.criteria.find((c) => c.id === bool.id), { id: bool.id, state: 'verified', value: true, citation: 'packet p.1', note: null });
});

test('5: setRow to missing clears the raw value; entryFromRecord round-trips a record back to raw text', () => {
  const num = firstOf(HIGH, 'number');
  const e = setRow(fullEntry(HIGH), num, { state: 'missing' });
  assert.equal(e.rows[num].value, '');
  const r = record();
  const back = entryFromRecord(r);
  assert.equal(back.step, 2);
  assert.equal(back.id, 'NEW-01');
  assert.deepEqual(toRecord(back, { id: r.supplier_id, saved_at: r.saved_at }), r);
});

test('5: setPart rebuilds rows for the new commodity and carries rows whose id still applies', () => {
  const [a, b] = PROFILES;
  const crit = RUBRIC.criteria[0].id;
  const onlyA = a.required.find((id) => !checklist(b.key).some((r) => r.id === id));
  let e = setRow(setPart(blankEntry(), { commodity: a.key, part_no: 'A' }), crit, { state: 'assumed', note: 'kept' });
  e = setPart(e, { commodity: b.key, part_no: 'B' });
  assert.deepEqual(Object.keys(e.rows).sort(), checklist(b.key).map((r) => r.id).sort());
  assert.equal(e.rows[crit].note, 'kept');
  if (onlyA) assert.equal(Object.hasOwn(e.rows, onlyA), false);
});

// ---- 6. scoreEntry ----

test('6 UIQ-AC-11: proven with a blank "where I found it" blocks scoring with the row issue', () => {
  const id = firstOf(HIGH, 'bool');
  const v = scoreEntry(setRow(fullEntry(HIGH), id, { where: '   ' }), CTX);
  assert.equal(v.blocked, true);
  assert.equal(v.result, null);
  assert.equal(v.rows[id].issue, WHERE_REQUIRED);
  assert.equal(WHERE_REQUIRED, 'Where I found it is required when proven');
  assert.equal(Object.values(v.rows).filter((r) => r.issue).length, 1, 'only that row');
  // Claimed and missing rows need no where.
  const ok = scoreEntry(setRow(setRow(fullEntry(HIGH), id, { state: 'assumed', where: '' }), firstOf(HIGH, 'number'), { state: 'missing', where: '' }), CTX);
  assert.equal(ok.blocked, false);
  assert.equal(ok.result.ok, true);
});

test('6 UIQ-AC-11: a bad number lands the engine\'s exact message on that row', () => {
  const id = firstOf(HIGH, 'number');
  const v = scoreEntry(setRow(fullEntry(HIGH), id, { value: 'abc' }), CTX);
  const msg = `${id}: expected a finite number, got "abc"`;
  assert.equal(v.blocked, false);
  assert.deepEqual(v.result, { ok: false, error: { id, message: msg } });
  assert.equal(v.rows[id].issue, msg);
  assert.equal(Object.values(v.rows).filter((r) => r.issue).length, 1);
  assert.throws(() => evaluate(toExtraction(toRecord(setRow(fullEntry(HIGH), id, { value: 'abc' }), { id: null, saved_at: null })), CTX), { message: msg });
});

test('6 UIQ-AC-11: a bad date and a proven blank value land the engine message on the row', () => {
  const date = firstOf(HIGH, 'date');
  const bad = scoreEntry(setRow(fullEntry(HIGH), date, { value: '2026-13-40' }), CTX);
  assert.deepEqual(bad.result.error, { id: date, message: `${date}: expected an ISO day YYYY-MM-DD, got "2026-13-40"` });
  assert.equal(bad.rows[date].issue, bad.result.error.message);
  const us = scoreEntry(setRow(fullEntry(HIGH), date, { value: '11/01/2026' }), CTX);
  assert.equal(us.result.error.id, date);
  const num = firstOf(HIGH, 'number');
  const blank = scoreEntry(setRow(fullEntry(HIGH), num, { value: '' }), CTX);
  assert.deepEqual(blank.result.error, { id: num, message: `${num}: verified needs a value` });
});

test('6: an engine error that names no row (as_of, policy) is shown in the panel only: error.id null', () => {
  const v = scoreEntry(fullEntry(HIGH), { as_of: 'not-a-day', policy: STARK_REFERENCE });
  assert.equal(v.result.ok, false);
  assert.equal(v.result.error.id, null);
  assert.match(v.result.error.message, /as_of/);
  assert.ok(Object.values(v.rows).every((r) => r.issue === null));
});

test('6: thresholds pass through the form unchanged (engine edges: cpk 1.33 vs 1.32; cert date equal to as_of)', () => {
  const num = firstOf(HIGH, 'number');
  const d = defOf(num);
  const edge = d.rule.find((b) => b.score === 3).x;
  const score = (e) => scoreEntry(e, CTX).result.evaluation.categories.flatMap((c) => c.criteria).find((r) => r.id === num).score;
  assert.equal(score(setRow(fullEntry(HIGH), num, { value: String(edge) })), 3);
  assert.ok(score(setRow(fullEntry(HIGH), num, { value: String(Math.round((edge - 0.01) * 100) / 100) })) < 3);
  const date = firstOf(HIGH, 'date');
  const dscore = (v) => scoreEntry(setRow(fullEntry(HIGH), date, { value: v }), CTX).result.evaluation.categories.flatMap((c) => c.criteria).find((r) => r.id === date).score;
  assert.equal(dscore(AS_OF), 3);
  assert.equal(dscore('2026-10-31'), 0);
});

// ---- 7. storage ----

test('7 UIQ-FR-16: writeManual stores the array and loadData reads it back (reload keeps saved suppliers)', async () => {
  const mem = memoryStorage();
  const recs = [record(HIGH, 'NEW-01'), record(PROFILES[3].key, 'NEW-02')];
  assert.equal(writeManual(safeStorage(mem), recs), true);
  assert.deepEqual(JSON.parse(mem.map.get(MANUAL_KEY)), recs);
  const fetchText = async (rel) => readFileSync(new URL(`../data/${rel}`, import.meta.url), 'utf8');
  const data = await loadData({ fetchText, storage: safeStorage(mem) });  // a fresh helper: the reload
  assert.deepEqual(data.manual, { records: recs, error: null });
  const m = buildModel(data, STARK_REFERENCE);
  const hand = m.candidates.filter((c) => c.source === 'manual');
  assert.deepEqual(hand.map((c) => [c.id, c.status]), [['NEW-01', 'scored'], ['NEW-02', 'scored']]);
});

test('7 UIQ-FR-16: blocked storage returns false, never throws, and the records still score in memory', () => {
  assert.equal(writeManual(safeStorage(null), [record()]), false);
  assert.equal(writeManual(null, [record()]), false);
  const throwing = { localStorage: { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } } };
  assert.equal(writeManual(safeStorage(throwing), [record()]), false);
  const getter = { get localStorage() { throw new Error('SecurityError'); } };
  assert.equal(safeStorage(getter).ok, false);
  assert.equal(writeManual(safeStorage(getter), [record()]), false);
  assert.equal(scoreEntry(fullEntry(HIGH), CTX).result.evaluation.total, 100);
});

test('7: upsert replaces in place by supplier_id, else appends; remove drops by id', () => {
  const a = record(HIGH, 'NEW-01');
  const b = record(HIGH, 'NEW-02');
  const a2 = { ...a, name: 'Renamed' };
  assert.deepEqual(upsert([a, b], a2).map((r) => [r.supplier_id, r.name]), [['NEW-01', 'Renamed'], ['NEW-02', b.name]]);
  assert.deepEqual(upsert([a], b).map((r) => r.supplier_id), ['NEW-01', 'NEW-02']);
  assert.deepEqual(remove([a, b], 'NEW-01'), [b]);
});

// ---- 8. export / import ----

test('8 UIQ-FR-16: export -> delete -> import restores a deep-equal record with its ID', () => {
  const r = record(HIGH, 'NEW-03');
  const out = exportRecord(r);
  assert.equal(out.filename, 'manual-NEW-03.json');
  const left = remove([r], r.supplier_id);
  assert.deepEqual(left, []);
  const back = importRecord(out.text, left, CTX);
  assert.equal(back.ok, true);
  assert.deepEqual(back.record, r);
  assert.deepEqual(back.records, [r]);
});

test('8 decision 165: an imported ID already taken gets the next free ID; NEW-99 taken gives NEW-100', () => {
  const r = record(HIGH, 'NEW-01');
  const got = importRecord(exportRecord(r).text, [r], CTX);
  assert.equal(got.ok, true);
  assert.equal(got.record.supplier_id, 'NEW-02');
  assert.deepEqual({ ...got.record, supplier_id: 'NEW-01' }, r, 'only the ID changes');
  assert.deepEqual(got.records.map((x) => x.supplier_id), ['NEW-01', 'NEW-02']);
  const r99 = record(HIGH, 'NEW-99');
  assert.equal(importRecord(exportRecord(r99).text, [r99], CTX).record.supplier_id, 'NEW-100');
  // A file ID that is not a NEW-nn ID is never kept.
  assert.equal(importRecord(JSON.stringify({ ...r, supplier_id: 'SUP-07' }), [], CTX).record.supplier_id, 'NEW-01');
});

test('8: import refuses bad files with a message naming the problem', () => {
  const r = record(HIGH, 'NEW-01');
  const crit = r.criteria;
  const num = firstOf(HIGH, 'number');
  const enumId = firstOf(HIGH, 'enum');
  const other = RUBRIC.tests.find((t) => !checklist(HIGH).some((x) => x.id === t.id)).id;
  const imp = (obj) => importRecord(typeof obj === 'string' ? obj : JSON.stringify(obj), [], CTX);
  const cases = [
    ['{ not json', "The file isn't valid JSON"],
    [[r], 'schema: expected "sqc-manual/1"'],
    [{ ...r, schema: 'sqc-manual/2' }, 'schema: expected "sqc-manual/1"'],
    [{ ...r, name: '  ' }, 'name: expected a supplier name'],
    [{ ...r, part_no: 7 }, 'part_no: expected a string'],
    [{ ...r, commodity: 'nope' }, 'commodity: unknown commodity "nope"'],
    [{ ...r, criteria: {} }, 'criteria: expected an array'],
    [{ ...r, criteria: [...crit, 'x'] }, `criteria[${crit.length}]: expected an object with a string id`],
    [{ ...r, criteria: [...crit, { id: other, state: 'missing', value: null, where: null, note: null }] }, `${other}: not on the checklist for this commodity`],
    [{ ...r, criteria: [...crit, crit[0]] }, `${crit[0].id}: listed twice`],
    [{ ...r, criteria: crit.map((c) => (c.id === num ? { ...c, state: 'proven' } : c)) }, `${num}: unknown state "proven"`],
    [{ ...r, criteria: crit.map((c) => (c.id === num ? { ...c, where: null } : c)) }, `${num}: where i found it is required when proven`],
    [{ ...r, criteria: crit.map((c) => (c.id === num ? { ...c, value: 'abc' } : c)) }, `${num}: expected a finite number, got "abc"`],
    [{ ...r, criteria: crit.map((c) => (c.id === enumId ? { ...c, value: 'bogus' } : c)) },
      `${enumId}: expected one of ${Object.keys(defOf(enumId).rule).join(', ')}, got "bogus"`],
  ];
  for (const [input, error] of cases) assert.deepEqual(imp(input), { ok: false, error }, error);
});

// ---- 9. grep (UIQ-AC-09, QUAL-NFR-05) ----

test('9 UIQ-AC-09 QUAL-NFR-05: manual.js and entry.js name no criterion, test or commodity, and do not import agent/', () => {
  const forbidden = [...RUBRIC.criteria.map((c) => c.id), ...RUBRIC.tests.map((t) => t.id), ...RUBRIC.commodities.map((c) => c.key)];
  assert.ok(forbidden.length > 60, 'the list is derived from rubric.js');
  for (const f of ['manual.js', 'entry.js']) {
    const src = readFileSync(new URL(`./${f}`, import.meta.url), 'utf8');
    assert.equal(src.match(/['"`]\d\.[a-z_]+['"`]/g), null, `${f}: id literal`);
    for (const word of forbidden) assert.ok(!src.includes(word), `${f} names ${word}`);
    assert.doesNotMatch(src, /from\s+['"][^'"]*agent\//, `${f} imports agent/`);
  }
});

test('STATES are the PRD-05 labels in engine terms', () => {
  assert.deepEqual(STATES, [['verified', 'Proven'], ['assumed', 'Claimed'], ['missing', 'Missing']]);
});

test('issue 139: imports fill omitted checklist rows and strip unknown record and row keys', () => {
  const original = record(HIGH, 'NEW-04'), kept = original.criteria[0];
  const input = { ...original, extra: 'discard', criteria: [{ ...kept, extra: 'discard' }] };
  const result = importRecord(JSON.stringify(input), [], CTX);
  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result.record).sort(), Object.keys(original).sort());
  assert.deepEqual(result.record.criteria.map(c => c.id), checklist(HIGH).map(c => c.id));
  assert.deepEqual(result.record.criteria[0], kept);
  for (const c of result.record.criteria.slice(1))
    assert.deepEqual(c, { id: c.id, state: 'missing', value: null, where: null, note: null });
  assert.deepEqual(result.records, [result.record]);
  assert.deepEqual(importRecord(exportRecord(result.record).text, [], CTX).record, result.record);
  assert.equal(input.criteria.length, 1);
  assert.equal(input.extra, 'discard');
});

test('issue 139: empty imports materialize every commodity checklist in canonical order', () => {
  for (const profile of PROFILES) {
    const original = record(profile.key, 'NEW-04');
    const result = importRecord(JSON.stringify({ ...original, criteria: [] }), [], CTX);
    assert.equal(result.ok, true, profile.key);
    assert.deepEqual(result.record.criteria, checklist(profile.key).map(({ id }) => ({
      id, state: 'missing', value: null, where: null, note: null
    })), profile.key);
  }
});

test('issue 139: normalization preserves false, zero and notes while clearing missing values', () => {
  const original = record(HIGH, 'NEW-04');
  const bool = firstOf(HIGH, 'bool'), num = firstOf(HIGH, 'number');
  const missing = original.criteria.find(c => c.id !== bool && c.id !== num).id;
  const supplied = original.criteria.filter(c => [bool, num, missing].includes(c.id)).reverse().map(c =>
    c.id === bool ? { ...c, value: false, note: 'false retained' }
      : c.id === num ? { ...c, value: 0, note: 'zero retained' }
        : { ...c, state: 'missing', value: 'ignored', where: 'ignored', note: 'missing note retained' });
  const previous = record(HIGH, 'NEW-01');
  const result = importRecord(JSON.stringify({ ...original, criteria: supplied }), [previous], CTX);
  assert.equal(result.ok, true);
  const byId = new Map(result.record.criteria.map(c => [c.id, c]));
  assert.equal(byId.get(bool).value, false);
  assert.equal(byId.get(bool).note, 'false retained');
  assert.equal(byId.get(num).value, 0);
  assert.equal(byId.get(num).note, 'zero retained');
  assert.deepEqual(byId.get(missing), {
    id: missing, state: 'missing', value: null, where: null, note: 'missing note retained'
  });
  assert.deepEqual(result.record.criteria.map(c => c.id), checklist(HIGH).map(c => c.id));
  assert.equal(result.records[0], previous);
  assert.equal(result.records[1], result.record);
  assert.deepEqual(importRecord(exportRecord(result.record).text, [], CTX).record, result.record);
});

test('M6 review: imported where and note follow Save text normalization', () => {
  const original = record(HIGH, 'NEW-04');
  const [claimed, blank, missing] = original.criteria;
  const criteria = [
    { ...claimed, state: 'assumed', where: '  p. 4  ', note: '' },
    { ...blank, state: 'assumed', where: '  ', note: '  ' },
    { ...missing, state: 'missing', where: '  discarded  ', note: '  kept  ' }
  ];
  const result = importRecord(JSON.stringify({ ...original, criteria }), [], CTX);
  assert.equal(result.ok, true);
  const byId = new Map(result.record.criteria.map(c => [c.id, c]));
  assert.equal(byId.get(claimed.id).where, 'p. 4');
  assert.equal(byId.get(claimed.id).note, null);
  assert.equal(byId.get(blank.id).where, null);
  assert.equal(byId.get(blank.id).note, null);
  assert.equal(byId.get(missing.id).where, null);
  assert.equal(byId.get(missing.id).note, 'kept');
});

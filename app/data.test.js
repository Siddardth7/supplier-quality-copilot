// Data loader (#37; UIQ-FR-01, UIQ-FR-12, UIM-FR-01, UIM-FR-12, D5, D8). Every file is its own Result,
// loadData never throws, and the ?data= override can never point off-site.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData, resolveBase, makeFetchText, MANUAL_KEY, checkEval } from './data.js';
import { existsSync, readFileSync } from 'node:fs';
import { FIXTURE_ONE, FIXTURE_MANY } from './eval.testkit.js';
import { evalState } from './eval.js';
import { parseHistory } from './engine.js';

const HEADER = 'date,supplier_id,part_no,received_qty,rejected_qty,on_time,defect_found_at,failure_mode_code,scar_id,scar_opened,scar_closed';
const HISTORY = `${HEADER}\n2026-10-06,ACT-01,CP-1,200,0,1,none,,,,\n`;
const sup = (id) => ({ id, name: `Name ${id}`, commodity: 'cold_plate', part: 'cold_plate' });
const SUPPLIERS = { as_of: '2026-11-01', candidates: [sup('SUP-01'), sup('SUP-02'), sup('SUP-03')], active: [sup('ACT-01')] };
const ext = (id) => JSON.stringify({ supplier_id: id, commodity: 'cold_plate', criteria: [] });

// fetchText stub over a { relPath: text | Error } map; anything absent is an HTTP 404. Records every call.
function files(over = {}) {
  const map = {
    'suppliers.json': JSON.stringify(SUPPLIERS),
    'history.csv': HISTORY,
    'extracted/SUP-01.json': ext('SUP-01'),
    'extracted/SUP-02.json': ext('SUP-02'),
    'extracted/SUP-03.json': ext('SUP-03'),
    ...over,
  };
  const calls = [];
  const fetchText = async (rel) => {
    calls.push(rel);
    const v = map[rel];
    if (v instanceof Error) throw v;
    if (v === undefined) throw new Error('HTTP 404');
    return v;
  };
  return { fetchText, calls };
}
const load = (over, opts = {}) => loadData({ fetchText: files(over).fetchText, storage: null, ...opts });
const stubStorage = (value) => ({ get: (k) => (k === MANUAL_KEY ? value : null) });

test('UIQ-FR-01: all files load into ok Results with data/ paths', async () => {
  const d = await load();
  assert.equal(d.suppliers.ok, true);
  assert.equal(d.suppliers.value.as_of, '2026-11-01');
  assert.equal(d.suppliers.path, 'data/suppliers.json');
  assert.equal(d.history.ok, true);
  assert.deepEqual(d.history.value, parseHistory(HISTORY));
  assert.deepEqual(Object.keys(d.extractions), ['SUP-01', 'SUP-02', 'SUP-03']);
  for (const [id, r] of Object.entries(d.extractions)) {
    assert.equal(r.ok, true, id);
    assert.equal(r.value.supplier_id, id);
    assert.equal(r.path, `data/extracted/${id}.json`);
  }
  assert.deepEqual(d.manual, { records: [], error: null });
});

test('UIQ-FR-12: missing suppliers.json names the path, fetches no extraction, keeps history', async () => {
  const f = files({ 'suppliers.json': undefined });
  const d = await loadData({ fetchText: f.fetchText, storage: null });
  assert.equal(d.suppliers.ok, false);
  assert.equal(d.suppliers.error.path, 'data/suppliers.json');
  assert.equal(d.suppliers.error.message, 'HTTP 404');
  assert.deepEqual(d.extractions, {});
  assert.deepEqual(d.sheets, {});
  assert.ok(!f.calls.some((c) => c.startsWith('extracted/') || c.startsWith('requirements/')));
  assert.equal(d.history.ok, true);
});

test('UIM-FR-12: missing history.csv names the path; candidates still load', async () => {
  const d = await load({ 'history.csv': undefined });
  assert.equal(d.history.ok, false);
  assert.equal(d.history.error.path, 'data/history.csv');
  assert.equal(d.history.error.message, 'HTTP 404');
  assert.equal(d.suppliers.ok, true);
  assert.equal(Object.values(d.extractions).filter((r) => r.ok).length, 3);
});

test('UIQ-FR-12: a network error message is kept, not replaced', async () => {
  const d = await load({ 'suppliers.json': new TypeError('fetch failed') });
  assert.equal(d.suppliers.error.message, 'fetch failed');
  assert.equal(d.suppliers.error.path, 'data/suppliers.json');
});

test('UIQ-FR-12: invalid JSON in suppliers.json names the path', async () => {
  const d = await load({ 'suppliers.json': '{ nope' });
  assert.equal(d.suppliers.ok, false);
  assert.equal(d.suppliers.error.path, 'data/suppliers.json');
  assert.match(d.suppliers.error.message, /^Invalid JSON: /);
});

test('UIQ-FR-12: wrong suppliers.json shapes are rejected with a field-naming message', async () => {
  const cases = [
    [[], 'expected an object'],
    [{ ...SUPPLIERS, as_of: 20261101 }, 'as_of: expected a string'],
    [{ ...SUPPLIERS, candidates: {} }, 'candidates: expected an array'],
    [{ ...SUPPLIERS, active: undefined }, 'active: expected an array'],
    [{ ...SUPPLIERS, candidates: ['SUP-01'] }, 'candidates[0]: expected an object'],
    [{ ...SUPPLIERS, candidates: [sup('SUP-01'), { ...sup('SUP-02'), part: null }] }, 'candidates[1].part: expected a string'],
  ];
  for (const [value, message] of cases) {
    const d = await load({ 'suppliers.json': JSON.stringify(value) });
    assert.equal(d.suppliers.ok, false, message);
    assert.equal(d.suppliers.error.path, 'data/suppliers.json');
    assert.equal(d.suppliers.error.message, message);
  }
});

test('UIQ-FR-12: duplicate supplier ids are rejected in candidates and in active', async () => {
  for (const key of ['candidates', 'active']) {
    const d = await load({ 'suppliers.json': JSON.stringify({ ...SUPPLIERS, [key]: [sup('X-1'), sup('X-2'), sup('X-1')] }) });
    assert.equal(d.suppliers.ok, false, key);
    assert.equal(d.suppliers.error.message, `${key}: duplicate id`);
  }
  // The same id in candidates and active is not a duplicate.
  const ok = await load({ 'suppliers.json': JSON.stringify({ ...SUPPLIERS, active: [sup('SUP-01')] }) });
  assert.equal(ok.suppliers.ok, true);
});

test('UIQ-FR-12: one missing and one corrupt extraction never affect the others', async () => {
  const d = await load({ 'extracted/SUP-01.json': undefined, 'extracted/SUP-03.json': '[[' });
  assert.equal(d.extractions['SUP-01'].ok, false);
  assert.equal(d.extractions['SUP-01'].error.path, 'data/extracted/SUP-01.json');
  assert.equal(d.extractions['SUP-01'].error.message, 'HTTP 404');
  assert.equal(d.extractions['SUP-02'].ok, true);
  assert.equal(d.extractions['SUP-03'].ok, false);
  assert.equal(d.extractions['SUP-03'].error.path, 'data/extracted/SUP-03.json');
  assert.match(d.extractions['SUP-03'].error.message, /^Invalid JSON: /);
});

test('UIM-FR-12: a history.csv parse error passes through verbatim with its row', async () => {
  const bad = `${HEADER}\n2026-10-06,ACT-01,CP-1,lots,0,1,none,,,,\n`;
  let expected;
  try { parseHistory(bad); } catch (e) { expected = e.message; }
  assert.match(expected, /^row 2: /);
  const d = await load({ 'history.csv': bad });
  assert.equal(d.history.ok, false);
  assert.equal(d.history.error.path, 'data/history.csv');
  assert.equal(d.history.error.message, expected);
});

test('D8: error paths use the label of the data folder actually fetched', async () => {
  const d = await load({ 'history.csv': undefined }, { label: 'dev-data/' });
  assert.equal(d.history.error.path, 'dev-data/history.csv');
  assert.equal(d.extractions['SUP-02'].path, 'dev-data/extracted/SUP-02.json');
});

test('loadData never throws: a non-Error rejection and a throwing storage both become Results', async () => {
  const d = await loadData({
    fetchText: async () => { throw 'boom'; }, // eslint-disable-line no-throw-literal
    storage: { get() { throw new Error('SecurityError'); } },
  });
  assert.equal(d.suppliers.ok, false);
  assert.equal(d.suppliers.error.message, 'boom');
  assert.equal(d.history.ok, false);
  assert.deepEqual(d.manual, { records: [], error: null });
});

test('D5: saved hand-entered suppliers get an envelope check only', async () => {
  const good = { schema: 'sqc-manual/1', supplier_id: 'NEW-01', anything: 1 };
  let d = await load({}, { storage: stubStorage(null) });
  assert.deepEqual(d.manual, { records: [], error: null });

  d = await load({}, { storage: stubStorage([good]) });
  assert.deepEqual(d.manual, { records: [good], error: null });

  d = await load({}, { storage: stubStorage({ schema: 'sqc-manual/1' }) });
  assert.deepEqual(d.manual.records, []);
  assert.equal(d.manual.error.message, `${MANUAL_KEY}: expected an array of saved suppliers`);

  const bad = [null, 'x', [], { supplier_id: 'NEW-02' }, { schema: 'sqc-manual/2', supplier_id: 'NEW-03' }, { schema: 'sqc-manual/1', supplier_id: 4 }];
  d = await load({}, { storage: stubStorage([good, ...bad]) });
  assert.deepEqual(d.manual.records, [good]);
  assert.equal(d.manual.error.message, `${MANUAL_KEY}: dropped 6 invalid saved records`);

  d = await load({}, { storage: stubStorage([good, { schema: 'sqc-manual/1' }]) });
  assert.equal(d.manual.error.message, `${MANUAL_KEY}: dropped 1 invalid saved record`);
});

test('makeFetchText: resolves against the base, throws HTTP <status>, keeps network errors', async () => {
  const seen = [];
  const ok = makeFetchText('http://h/dev-data/', async (url) => { seen.push(String(url)); return { ok: true, text: async () => 'T' }; });
  assert.equal(await ok('extracted/SUP-01.json'), 'T');
  assert.deepEqual(seen, ['http://h/dev-data/extracted/SUP-01.json']);
  const notFound = makeFetchText('http://h/data/', async () => ({ ok: false, status: 404 }));
  await assert.rejects(notFound('x.json'), { message: 'HTTP 404' });
  const down = makeFetchText('http://h/data/', async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(down('x.json'), { message: 'Failed to fetch' });
});

test('D8: resolveBase defaults to ../data/ and accepts a relative override inside the repo', () => {
  const def = resolveBase('');
  assert.equal(def.overridden, false);
  assert.equal(def.label, 'data/');
  assert.match(def.base, /\/data\/$/);

  const dev = resolveBase('?data=../dev-data/');
  assert.equal(dev.overridden, true);
  assert.equal(dev.path, '../dev-data/');
  assert.equal(dev.label, 'dev-data/');
  assert.equal(new URL('../dev-data/', new URL('./', import.meta.url)).href, dev.base);
  assert.equal(resolveBase('?data=../dev-data').label, 'dev-data/', 'trailing slash is added');
  assert.equal(resolveBase('?data=fixtures').label, 'app/fixtures/');
});

test('D8: the override boundary is the repo root: ".." is in, "../.." is out', () => {
  const root = resolveBase('?data=..');
  assert.equal(root.overridden, true);
  assert.equal(root.label, '');
  for (const raw of ['../..', '../../x', 'a/../../..', '../dev-data/../../x', '../..?', '../..#x', '../..?/x']) {
    assert.equal(resolveBase(`?data=${encodeURIComponent(raw)}`).overridden, false, raw);
  }
});

test('D8: the override rejects schemes, // and other off-site forms', () => {
  const def = resolveBase('');
  const bad = ['https://x', 'http://x/data/', '//x', '//x/data/', 'javascript:alert(1)', 'data:text/plain,hi', 'file:///etc/',
    '/abs/', '\\\\x\\y', '%2e%2e/%2e%2e/x', '%20//x', ' ../dev-data/', ''];
  for (const raw of bad) {
    const r = resolveBase(`?data=${encodeURIComponent(raw)}`);
    assert.equal(r.overridden, false, raw);
    assert.equal(r.base, def.base, raw);
  }
});

// #40 (decision 24): requirement sheets load at startup, one per distinct candidate or active commodity (issue 110, decision 130).
const sheet = (commodity, part_no) => JSON.stringify({ commodity, part_no, ctqs: [] });
const MIXED = { ...SUPPLIERS, candidates: [sup('SUP-01'), { ...sup('SUP-02'), commodity: 'pcba' }, sup('SUP-03')], active: [{ ...sup('ACT-01'), commodity: 'optics_cable' }] };

test('UIQ-FR-20 / UIS-FR-11: one sheet fetch per distinct candidate or active commodity, each its own Result with its path', async () => {
  const f = files({ 'suppliers.json': JSON.stringify(MIXED), 'requirements/cold_plate.json': sheet('cold_plate', 'SI-CP-0007'),
    'requirements/pcba.json': sheet('pcba', 'SI-PB-0001'), 'requirements/optics_cable.json': sheet('optics_cable', 'SI-OC-0006') });
  const d = await loadData({ fetchText: f.fetchText, storage: null });
  assert.deepEqual(f.calls.filter((c) => c.startsWith('requirements/')).sort(), ['requirements/cold_plate.json', 'requirements/optics_cable.json', 'requirements/pcba.json']);
  assert.deepEqual(Object.keys(d.sheets), ['cold_plate', 'pcba', 'optics_cable'], 'candidates first, then active-only commodities, deduped');
  assert.equal(d.sheets.optics_cable.value.part_no, 'SI-OC-0006');
  assert.equal(d.sheets.cold_plate.ok, true);
  assert.equal(d.sheets.cold_plate.value.part_no, 'SI-CP-0007');
  assert.equal(d.sheets.cold_plate.path, 'data/requirements/cold_plate.json');
  assert.equal(d.sheets.pcba.value.part_no, 'SI-PB-0001');
});

test('UIQ-FR-12: a missing or malformed sheet is its own error Result; suppliers, extractions and other sheets stay ok', async () => {
  const d = await load({ 'suppliers.json': JSON.stringify(MIXED), 'requirements/pcba.json': sheet('pcba', 'SI-PB-0001') });
  assert.deepEqual(d.sheets.cold_plate, { ok: false, error: { path: 'data/requirements/cold_plate.json', message: 'HTTP 404', kind: 'fetch' } });
  assert.equal(d.sheets.pcba.ok, true);
  assert.equal(d.suppliers.ok, true);
  assert.ok(Object.values(d.extractions).every((r) => r.ok));
  const cases = [
    ['[]', 'expected an object'],
    [JSON.stringify({ part_no: 'SI-CP-0007' }), 'commodity: expected a string'],
    [JSON.stringify({ commodity: 'cold_plate', part_no: 7 }), 'part_no: expected a string'],
  ];
  for (const [text, message] of cases) {
    const bad = await load({ 'requirements/cold_plate.json': text });
    assert.deepEqual(bad.sheets.cold_plate, { ok: false, error: { path: 'data/requirements/cold_plate.json', message, kind: 'data' } }, message);
  }
  const garbled = await load({ 'requirements/cold_plate.json': '{ nope' });
  assert.equal(garbled.sheets.cold_plate.error.kind, 'data');
  assert.match(garbled.sheets.cold_plate.error.message, /^Invalid JSON: /);
});

test('D8: sheet paths use the label of the data folder actually fetched', async () => {
  const d = await load({ 'requirements/cold_plate.json': sheet('cold_plate', 'SI-CP-0007') }, { label: 'dev-data/' });
  assert.equal(d.sheets.cold_plate.path, 'dev-data/requirements/cold_plate.json');
});

// Tester additions (#40 QA).
test('QA decision 24: sheets are fetched in parallel with the extractions, not after them', async () => {
  // Every extraction waits until a sheet fetch has started; a sequential loader never gets there.
  let sheetStarted;
  const started = new Promise((r) => { sheetStarted = r; });
  const base = files();
  const fetchText = async (rel) => {
    if (rel.startsWith('requirements/')) sheetStarted();
    if (rel.startsWith('extracted/')) {
      const late = await Promise.race([started.then(() => false), new Promise((r) => setTimeout(r, 500, true))]);
      if (late) throw new Error('sheet fetch never started while extractions were pending');
    }
    return base.fetchText(rel);
  };
  const d = await loadData({ fetchText, storage: null });
  assert.ok(Object.values(d.extractions).every((r) => r.ok), JSON.stringify(d.extractions));
});

test('QA UIQ-FR-12: a sheet that throws a non-404 error is a fetch Result; the commodity key is URL-encoded', async () => {
  const odd = { ...SUPPLIERS, candidates: [{ ...sup('SUP-01'), commodity: 'a b/c' }] };
  const f = files({ 'suppliers.json': JSON.stringify(odd), 'extracted/SUP-01.json': ext('SUP-01') });
  const d = await loadData({ fetchText: f.fetchText, storage: null });
  assert.ok(f.calls.includes('requirements/a%20b%2Fc.json'), f.calls.join());
  assert.equal(d.sheets['a b/c'].ok, false);
  const net = await load({ 'requirements/cold_plate.json': new Error('network down') });
  assert.deepEqual(net.sheets.cold_plate, { ok: false, error: { path: 'data/requirements/cold_plate.json', message: 'network down', kind: 'fetch' } });
});

// ---- data/eval.json (issue 111; PRD-13 §5, UIE-FR-01, UIE-FR-07) ----

test('issue 111: a valid eval.json loads into evalRuns with its path; it is fetched once, beside suppliers and history', async () => {
  const f = files({ 'eval.json': JSON.stringify(FIXTURE_MANY) });
  const d = await loadData({ fetchText: f.fetchText, storage: null });
  assert.equal(d.evalRuns.ok, true);
  assert.equal(d.evalRuns.path, 'data/eval.json');
  assert.deepEqual(d.evalRuns.value, FIXTURE_MANY);
  assert.deepEqual(f.calls.filter((c) => c === 'eval.json'), ['eval.json']);
  assert.ok(f.calls.indexOf('eval.json') < f.calls.findIndex((c) => c.startsWith('extracted/')), 'first batch, not after the extractions');
  assert.equal(evalState(d.evalRuns).kind, 'ready');
});

test('UIE-FR-07: no eval.json is a fetch 404 Result, which the view reads as no published run', async () => {
  const d = await load();
  assert.deepEqual(d.evalRuns, { ok: false, error: { path: 'data/eval.json', message: 'HTTP 404', kind: 'fetch' } });
  assert.equal(evalState(d.evalRuns).kind, 'none');
  const e = await load({ 'eval.json': new Error('HTTP 500') });
  assert.equal(e.evalRuns.error.kind, 'fetch');
  assert.equal(evalState(e.evalRuns).kind, 'error');
});

test('issue 111: bad JSON and bad shapes are data Results naming the path and the field', async () => {
  const bad = async (text) => (await load({ 'eval.json': text })).evalRuns;
  const j = await bad('{ runs: [');
  assert.equal(j.ok, false);
  assert.equal(j.error.kind, 'data');
  assert.equal(j.error.path, 'data/eval.json');
  assert.match(j.error.message, /^Invalid JSON: /);
  const run = FIXTURE_ONE.runs[0];
  const g = (patch, j2 = 1) => ({ runs: [{ ...run, groups: run.groups.map((x, i) => (i === j2 ? { ...x, ...patch } : x)) }] });
  const cases = [
    [[], 'expected an object'], [null, 'expected an object'], [{}, 'runs: expected an array'], [{ runs: {} }, 'runs: expected an array'],
    [{ runs: [7] }, 'runs[0]: expected an object'],
    [{ runs: [run, { ...run, run_id: 7 }] }, 'runs[1].run_id: expected a string'],
    [{ runs: [{ ...run, headline_complete: 'true' }] }, 'runs[0].headline_complete: expected a boolean'],
    [{ runs: [{ ...run, models: 'x' }] }, 'runs[0].models: expected an array'],
    [{ runs: [{ ...run, skill_shas: null }] }, 'runs[0].skill_shas: expected an array'],
    [{ runs: [{ ...run, refused: undefined }] }, 'runs[0].refused: expected an array'],
    [{ runs: [{ ...run, groups: run.groups.slice(0, 3) }] }, 'runs[0].groups: expected an array of 4 groups'],
    [{ runs: [{ ...run, groups: [...run.groups, run.groups[0]] }] }, 'runs[0].groups: expected an array of 4 groups'],
    [{ runs: [{ ...run, groups: [run.groups[0], null, run.groups[2], run.groups[3]] }] }, 'runs[0].groups[1]: expected an object'],
    [g({ worlds: null }), 'runs[0].groups[1].worlds: expected an array'],
    [g({ per_world: {} }), 'runs[0].groups[1].per_world: expected an array'],
    [g({ misses: 'none' }), 'runs[0].groups[1].misses: expected an array'],
    [g({ counts: [] }), 'runs[0].groups[1].counts: expected an object'],
    [g({ rates: null }, 3), 'runs[0].groups[3].rates: expected an object'],
    // Review M1: entries the view reads are checked to the depth it reads them.
    [{ runs: [{ ...run, refused: [1] }] }, 'runs[0].refused[0]: expected an object'],
    [{ runs: [{ ...run, refused: [{ world: 103, part: 'world', reason: 'x' }, null] }] }, 'runs[0].refused[1]: expected an object'],
    [g({ per_world: [7] }), 'runs[0].groups[1].per_world[0]: expected an object'],
    [g({ per_world: [{}] }), 'runs[0].groups[1].per_world[0].counts: expected an object'],
    [g({ per_world: [{ counts: {}, rates: [] }] }, 0), 'runs[0].groups[0].per_world[0].rates: expected an object'],
    [g({ misses: [null] }), 'runs[0].groups[1].misses[0]: expected an object'],
    [g({ misses: [run.groups[3].misses[0], 'x'] }, 3), 'runs[0].groups[3].misses[1]: expected an object'],
  ];
  for (const [v, msg] of cases) {
    const r = await bad(JSON.stringify(v));
    assert.deepEqual(r, { ok: false, error: { path: 'data/eval.json', message: msg, kind: 'data' } }, msg);
    assert.throws(() => checkEval(v), { message: msg });
  }
  assert.equal(checkEval({ runs: [] }).runs.length, 0, '{ runs: [] } is valid (no published run)');
  assert.equal(checkEval(FIXTURE_MANY), FIXTURE_MANY);
});

test('issue 111: eval.json loads even when suppliers.json fails; its path follows the ?data= label', async () => {
  const d = await load({ 'suppliers.json': undefined, 'eval.json': JSON.stringify(FIXTURE_ONE) }, { label: 'dev-data/' });
  assert.equal(d.suppliers.ok, false);
  assert.equal(d.evalRuns.ok, true);
  assert.equal(d.evalRuns.path, 'dev-data/eval.json');
  const e = await load({ 'history.csv': new Error('Network down') }, { label: 'dev-data/' });
  assert.equal(e.evalRuns.error.path, 'dev-data/eval.json');
});

test('issue 111: the shipped data/ either has no eval.json (no published run) or one every run of which passes checkEval', () => {
  const file = new URL('../data/eval.json', import.meta.url);
  if (!existsSync(file)) return;  // today: absent until issue 36 publishes the first run; the view says "No published run yet"
  const v = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(checkEval(v), v);
  assert.equal(evalState({ ok: true, value: v, path: 'data/eval.json' }).kind, v.runs.length ? 'ready' : 'none');
});

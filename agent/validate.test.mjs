// Extraction schema validator (#32): one hand-made bad case per schema rule (AGENT-AC-01 first half),
// a valid fixture per commodity, error collection, purity, the CLI and AGENT-NFR-01. Synthetic fixtures only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { RUBRIC } from '../app/rubric.js';
import { validateExtraction } from './validate.mjs';

const VALIDATE = fileURLToPath(new URL('./validate.mjs', import.meta.url));
const SAMPLE = { bool: true, number: 1, date: '2027-01-01' };
const CITE = 'capability_study.md §2';

// Valid extraction for a commodity: every applicable id, verified, typed value, valid drafts.
function fixture(key = 'cold_plate') {
  const p = RUBRIC.commodities.find((c) => c.key === key);
  const defs = [...RUBRIC.criteria, ...[...p.required, ...p.nice].map((id) => RUBRIC.tests.find((t) => t.id === id))];
  return {
    schema: 'sqc-extraction/1',
    supplier_id: 'SUP-07',
    commodity: key,
    run: { run_id: '2026-11-20a', model: 'unknown', skill_sha: 'unknown' },
    criteria: defs.map((d) => ({
      id: d.id, state: 'verified', value: d.type === 'enum' ? Object.keys(d.rule)[0] : SAMPLE[d.type], citation: CITE, note: null,
    })),
    drafts: {
      rfi_items: ['6.ramp_plan'],
      rfi_email: 'DRAFT — prepared by an agent for SQE review. Not sent.\n\nSubject: Synthetic RFI',
      audit_focus: ['2.ctq_cpk'],
      audit_plan: [{ criterion_id: '2.ctq_cpk', question: 'Walk through the Cpk study for the flatness CTQ.' }],
    },
  };
}

// Fixture with one item's fields replaced; returns the extraction and the item's path.
function withItem(id, fields, key = 'cold_plate') {
  const x = fixture(key);
  const i = x.criteria.findIndex((c) => c.id === id);
  Object.assign(x.criteria[i], fields);
  return [x, `criteria[${i}]`];
}

// Exactly one error, at path, with a message matching re.
function only(x, path, re, opts) {
  const { ok, errors } = validateExtraction(x, opts);
  assert.equal(ok, false, `expected an error at ${path}`);
  assert.deepEqual(errors.map((e) => e.path), [path], JSON.stringify(errors));
  assert.match(errors[0].message, re);
}
const assertOk = (x, opts) => assert.deepEqual(validateExtraction(x, opts), { ok: true, errors: [] });

for (const { key } of RUBRIC.commodities) {
  test(`valid fixture for ${key} passes`, () => assertOk(fixture(key)));
}

test('mixed states, the PRD-04 example items and edge values pass', () => {
  const x = fixture('cold_plate');
  const set = (id, item) => { x.criteria[x.criteria.findIndex((c) => c.id === id)] = { id, ...item }; };
  // PRD-04 § 5 example items, verbatim.
  set('2.ctq_cpk', { state: 'verified', value: 1.12, citation: 'capability_study.md §2', note: 'Flatness, n=125' });
  set('6.ramp_plan', { state: 'assumed', value: null, citation: 'cover_letter.md §3', note: '"Ramp plan to follow"' });
  set('8.subtier_named', { state: 'missing', value: null, citation: null, note: 'quality_manual.md §7.4 says plating is outsourced, no name' });
  set('3.grr', { state: 'verified', value: 0, citation: 'msa.md §1', note: '' });
  set('6.capacity_ratio', { state: 'verified', value: 0, citation: 'capacity.md §2', note: null });
  set('5.records_retention', { state: 'verified', value: 1.329, citation: 'quality_manual.md §4.2.1', note: null });
  set('1.capa', { state: 'verified', value: false, citation: 'quality_manual.md §8', note: null });
  set('1.cert_current', { state: 'verified', value: '2028-02-29', citation: 'certificates.md §1', note: null });
  set('7.pcn_notice', { state: 'assumed', value: 0.9, citation: 'pcn_policy.md §1', note: '"about 0.9"' });
  set('9.financial_health', { state: 'assumed', value: 'watch', citation: 'cover_letter.md §5', note: '"on watch"' });
  set('4.coolant_compat', { state: 'missing', value: null, citation: null, note: 'reliability_report.md, no coolant section' });
  assertOk(x);
});

test('rejects unknown IDs', () => {
  const push = (item) => { const x = fixture(); x.criteria.push({ ...x.criteria[0], ...item }); return [x, `criteria[${x.criteria.length - 1}].id`]; };
  only(...push({ id: '9.nope' }), /^9\.nope: unknown criterion id/);
  only(...push({ id: '4.burn_in', value: true }), /^4\.burn_in: not applicable to cold_plate/);
  only(...push({ id: '4.spill_volume', value: true }), /^4\.spill_volume: not applicable to cold_plate/); // another commodity's nice-to-have
  only(...push({ id: '2.ctq_cpk', value: 1 }), /^2\.ctq_cpk: duplicate criterion/);
  only(...push({ id: 42 }), /expected a criterion id string/);

  const drop = (id) => { const x = fixture(); x.criteria = x.criteria.filter((c) => c.id !== id); return x; };
  only(drop('6.ramp_plan'), 'criteria', /^6\.ramp_plan: missing criterion/);
  only(drop('4.coolant_compat'), 'criteria', /^4\.coolant_compat: missing criterion/); // nice-to-have is required in the list

  const x = fixture(); x.drafts.rfi_items = ['9.nope'];
  only(x, 'drafts.rfi_items[0]', /^9\.nope: unknown criterion id/);
  const y = fixture(); y.drafts.audit_focus = ['4.burn_in']; y.drafts.audit_plan[0].criterion_id = '4.burn_in';
  only(y, 'drafts.audit_focus[0]', /^4\.burn_in: not applicable to cold_plate/);
});

test('rejects bad states and state-rule violations', () => {
  for (const state of ['Verified', 'unknown', null, 3]) {
    const [x, p] = withItem('1.capa', { state });
    only(x, `${p}.state`, /^1\.capa: bad state/);
  }
  // verified (citation null is in the citation test)
  let [x, p] = withItem('2.ctq_cpk', { value: null });
  only(x, `${p}.value`, /verified needs a value/);
  // assumed
  for (const note of [null, '', '   ']) {
    [x, p] = withItem('6.ramp_plan', { state: 'assumed', value: null, note });
    only(x, `${p}.note`, /assumed needs a note/);
  }
  [x, p] = withItem('6.ramp_plan', { state: 'assumed', value: null, citation: null, note: '"to follow"' });
  only(x, `${p}.citation`, /assumed needs a citation/);
  // missing
  const missing = { state: 'missing', value: null, citation: null, note: 'Looked in quality_manual.md' };
  for (const value of [0, false]) {
    [x, p] = withItem('8.flowdown', { ...missing, value });
    only(x, `${p}.value`, /missing needs value null/);
  }
  [x, p] = withItem('8.flowdown', { ...missing, citation: CITE });
  only(x, `${p}.citation`, /missing needs citation null/);
  for (const note of [null, '', ' ']) {
    [x, p] = withItem('8.flowdown', { ...missing, note });
    only(x, `${p}.note`, /missing needs a note/);
  }
});

test('rejects malformed citations', () => {
  const bad = ['capability_study.md', 'capability_study.md §', 'Capability.md §2', 'capability_study.md 2',
    'capability_study.md §2.', 'capability_study.md §2.a', 'a/b.md §1', ' capability_study.md §2',
    'capability_study.md §2 ', 'capability_study.md§2', '', 7,
    'capability_study.MD §2', ['capability_study.md §2']]; // regex is lowercase .md; a citation is a string, not an array
  for (const citation of bad) {
    const [x, p] = withItem('1.capa', { citation });
    only(x, `${p}.citation`, /expected "file §section"/);
  }
  let [x, p] = withItem('1.capa', { citation: null });
  only(x, `${p}.citation`, /^1\.capa: verified needs a citation/);

  const packetFiles = ['capability_study.md', 'cover_letter.md'];
  [x, p] = withItem('1.capa', { citation: 'ghost.md §1' });
  only(x, `${p}.citation`, /cited file not in packet: ghost\.md/, { packetFiles });
  assertOk(x); // without packetFiles the existence check is skipped
  [x, p] = withItem('1.capa', { citation: 'study.md §1' }); // whole basename, not a substring of capability_study.md
  only(x, `${p}.citation`, /cited file not in packet: study\.md/, { packetFiles });
  assertOk(fixture(), { packetFiles });
  for (const citation of ['quality_manual.md §7.4', 'a_b2.md §10']) assertOk(withItem('1.capa', { citation })[0]);
});

test('schema marker', () => {
  for (const schema of ['sqc-extraction/2', 'SQC-EXTRACTION/1', null]) {
    const x = fixture(); x.schema = schema;
    only(x, 'schema', /expected "sqc-extraction\/1"/);
  }
});

test('top-level keys: unknown and missing', () => {
  const x = fixture(); x.score = 90;
  only(x, 'score', /unknown key "score"/);
  const y = fixture(); delete y.run;
  only(y, 'run', /missing key run/);
});

test('supplier_id format', () => {
  for (const id of ['SUP-7', 'sup-07', 'SUP-007', 7]) {
    const x = fixture(); x.supplier_id = id;
    only(x, 'supplier_id', /expected SUP- and two digits/);
  }
});

test('commodity must be a RUBRIC key, without a flood of missing criteria', () => {
  for (const c of ['warp_core', 'Cold_Plate', null]) {
    const x = fixture(); x.commodity = c;
    only(x, 'commodity', /expected one of cold_plate/);
  }
});

test('run keys', () => {
  let x = fixture(); x.run.temperature = 0.2;
  only(x, 'run.temperature', /unknown key/);
  x = fixture(); delete x.run.model;
  only(x, 'run.model', /missing key model/);
  x = fixture(); x.run.run_id = '';
  only(x, 'run.run_id', /non-empty string/);
  x = fixture(); x.run = 'r1';
  only(x, 'run', /expected an object/);
});

test('criteria item shape', () => {
  let x = fixture(); delete x.criteria[0].note;
  only(x, 'criteria[0].note', /^1\.cert_current: missing key note/);
  x = fixture(); x.criteria[0].score = 3;
  only(x, 'criteria[0].score', /unknown key "score"/);
  x = fixture(); x.criteria = {};
  only(x, 'criteria', /expected an array/);
  x = fixture(); x.criteria.push(null);
  only(x, `criteria[${x.criteria.length - 1}]`, /expected an object/);
});

test('value type per criterion type', () => {
  const cases = [
    ['1.capa', 'true', /expected a boolean/],
    ['1.capa', {}, /expected a boolean/],
    ['1.capa', [true], /expected a boolean/],
    ['4.leak_test', 'yes', /^4\.leak_test: expected a boolean/],
    ['2.ctq_cpk', '1.33', /expected a finite number/],
    ['2.ctq_cpk', NaN, /expected a finite number/],
    ['2.ctq_cpk', Infinity, /expected a finite number/],
    ['9.region_risk', 'High', /^9\.region_risk: expected one of low, medium, high/],
    // issue 161: out-of-range numbers are refused; Cpk has no bound.
    ['6.capacity_ratio', -0.5, /^6\.capacity_ratio: expected a number >= 0, got -0\.5$/],
  ];
  for (const date of ['2026-02-30', '2026/11/01', '2026-02-29', '2026-13-01', '2026-1-5', 20270101]) {
    cases.push(['1.cert_current', date, /expected an ISO day YYYY-MM-DD/]);
  }
  for (const [id, value, re] of cases) {
    const [x, p] = withItem(id, { value });
    only(x, `${p}.value`, re);
  }
  // issue 161: 4.fai (0 to 1) is required for machined parts; a negative Cpk has no bound and passes.
  const [xf, pf] = withItem('4.fai', { value: 1.2 }, 'machined_part');
  only(xf, `${pf}.value`, /^4\.fai: expected a number from 0 to 1, got 1\.2$/);
  assertOk(withItem('2.ctq_cpk', { value: -0.5 })[0]);
  // assumed claimed values are type-checked too
  const [x, p] = withItem('2.ctq_cpk', { state: 'assumed', value: { cpk: 1.4 }, note: '"capable"' });
  only(x, `${p}.value`, /expected a finite number/);
});

test('note length and type', () => {
  assertOk(withItem('1.capa', { note: 'n'.repeat(240) })[0]);
  let [x, p] = withItem('1.capa', { note: 'n'.repeat(241) });
  only(x, `${p}.note`, /241 characters, at most 240/);
  [x, p] = withItem('1.capa', { note: 5 });
  only(x, `${p}.note`, /expected a string or null/);
});

test('drafts shape', () => {
  const d = (patch) => { const x = fixture(); patch(x.drafts); return x; };
  const focus4 = ['2.ctq_cpk', '3.grr', '1.capa', '2.spc'];
  only(d((dr) => { dr.decision = 'APPROVED'; }), 'drafts.decision', /unknown key/);
  only(d((dr) => { delete dr.rfi_email; }), 'drafts.rfi_email', /missing key/);
  only(d((dr) => { dr.rfi_email = ''; }), 'drafts.rfi_email', /non-empty string/);
  only(d((dr) => { dr.rfi_items = '6.ramp_plan'; }), 'drafts.rfi_items', /expected an array/);
  only(d((dr) => { dr.rfi_items = ['6.ramp_plan', 6]; }), 'drafts.rfi_items[1]', /criterion id string/);
  only(d((dr) => { dr.rfi_items = ['6.ramp_plan', '6.ramp_plan']; }), 'drafts.rfi_items[1]', /duplicate/);
  only(d((dr) => { dr.audit_focus = focus4; dr.audit_plan = focus4.map((id) => ({ criterion_id: id, question: 'q' })); }),
    'drafts.audit_focus', /at most 3/);
  const focus3 = focus4.slice(0, 3); // the edge: exactly 3 passes
  assertOk(d((dr) => { dr.audit_focus = focus3; dr.audit_plan = focus3.map((id) => ({ criterion_id: id, question: 'q' })); }));
  only(d((dr) => { dr.audit_plan.push({ criterion_id: '3.grr', question: 'q' }); }), 'drafts.audit_plan', /expected 1 entries/);
  only(d((dr) => { dr.audit_focus.push('3.grr'); }), 'drafts.audit_plan', /expected 2 entries/); // plan shorter than focus
  only(d((dr) => { dr.audit_plan[0].score = 2; }), 'drafts.audit_plan[0].score', /unknown key/);
  only(d((dr) => { dr.audit_plan[0].question = ' '; }), 'drafts.audit_plan[0].question', /non-empty string/);
  only(d((dr) => { dr.audit_plan = [null]; }), 'drafts.audit_plan[0]', /expected an object/);
  only(d((dr) => { dr.audit_plan = {}; }), 'drafts.audit_plan', /expected an array/);
  only(d((dr) => { dr.audit_focus = 'x'; }), 'drafts.audit_focus', /expected an array/); // length/order skipped
  const x = d((dr) => {
    dr.audit_focus = ['2.ctq_cpk', '3.grr'];
    dr.audit_plan = [{ criterion_id: '3.grr', question: 'q' }, { criterion_id: '2.ctq_cpk', question: 'q' }];
  });
  assert.deepEqual(validateExtraction(x).errors.map((e) => e.path), ['drafts.audit_plan[0].criterion_id', 'drafts.audit_plan[1].criterion_id']);
  const y = fixture(); y.drafts = [];
  only(y, 'drafts', /expected an object/);
  assertOk(d((dr) => { dr.audit_focus = []; dr.audit_plan = []; dr.rfi_items = []; }));
});

test('collects every error, not just the first', () => {
  const x = fixture();
  x.schema = 'sqc-extraction/2';
  x.criteria[1].state = 'done';
  x.drafts.rfi_email = '';
  assert.deepEqual(validateExtraction(x).errors.map((e) => e.path), ['schema', 'criteria[1].state', 'drafts.rfi_email']);
});

test('non-object input gives one error and never throws', () => {
  for (const bad of [null, [], 'x', 42, undefined]) {
    assert.deepEqual(validateExtraction(bad), { ok: false, errors: [{ path: '', message: 'extraction: expected an object' }] });
  }
});

test('pure: input unchanged, repeat calls equal', () => {
  const x = fixture('pcba');
  x.criteria[2].state = 'Verified';
  x.drafts.audit_focus.push('9.nope');
  const before = structuredClone(x);
  const a = validateExtraction(x, { packetFiles: ['rfq.md'] });
  const b = validateExtraction(x, { packetFiles: ['rfq.md'] });
  assert.deepEqual(x, before);
  assert.deepEqual(a, b);
  assert.equal(a.ok, false);
});

test('CLI: exit codes 0, 1 and 2', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'sqc-validate-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const run = (...args) => spawnSync(process.execPath, [VALIDATE, ...args], { encoding: 'utf8' });
  const write = (name, body) => { const f = join(dir, name); writeFileSync(f, body); return f; };

  const good = write('good.json', JSON.stringify(fixture()));
  let r = run(good);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.startsWith('OK '), r.stdout);

  const bad = fixture(); bad.schema = 'x';
  r = run(write('bad.json', JSON.stringify(bad)));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^schema: expected "sqc-extraction\/1"/m);
  assert.match(r.stderr, /^INVALID .*bad\.json \(1 errors\)$/m);

  const packet = join(dir, 'packet');
  mkdirSync(packet);
  writeFileSync(join(packet, 'capability_study.md'), '# Synthetic capability study\n');
  r = run(good, '--packet', packet);
  assert.equal(r.status, 0, r.stderr);
  const ghost = fixture(); ghost.criteria[0].citation = 'ghost.md §1';
  r = run(write('ghost.json', JSON.stringify(ghost)), '--packet', packet);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^criteria\[0\]\.citation: .*cited file not in packet/m);

  r = run();
  assert.equal(r.status, 2);
  assert.match(r.stderr, /usage/);
  r = run(good, 'extra');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /^usage:/); // rejected as a usage error, not via a failed packet-dir read
  r = run(join(dir, 'nope.json'));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /nope\.json/);
  r = run(write('notjson.json', '{ not json'));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /notjson\.json: cannot read as JSON/);
});

test('validate.mjs imports only node: built-ins and the engine, and never calls evaluate', () => {
  const src = readFileSync(VALIDATE, 'utf8');
  const specs = [...src.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]);
  assert.ok(specs.length > 0);
  for (const s of specs) assert.ok(s.startsWith('node:') || s === '../app/engine.js', s);
  assert.doesNotMatch(src, /\bimport\(/);
  assert.doesNotMatch(src, /\bevaluate\(/);
});

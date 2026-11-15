// Draft consistency check (#35): drafts must equal what the engine computes (AGENT-FR-04, G4), carry the label
// (AGENT-FR-05) and end with the signature (AGENT-FR-12); every sim reference passes (AGENT-AC-04). One hand-made
// bad case per rule, error collection, purity, the CLI and AGENT-NFR-01. Synthetic fixtures only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { RUBRIC } from '../app/engine.js';
import { checkDrafts, DRAFT_LABEL, DRAFT_SIGNATURE } from './drafts.mjs';
import { factsToReference } from '../sim/answer-key.mjs';
import { simulateCandidates } from '../sim/candidate.mjs';

const DRAFTS = fileURLToPath(new URL('./drafts.mjs', import.meta.url));
const AS_OF = '2026-11-01';
const CITE = 'capability_study.md §2';
// A value that scores 3 for any criterion type, read from its rule (numbers: the top band's threshold).
const goodValue = (d) => ({
  number: () => d.rule[0].x, enum: () => Object.keys(d.rule).find((k) => d.rule[k] === 3), date: () => '2027-06-01',
}[d.type] ?? (() => true))();
const email = (...lines) => [DRAFT_LABEL, '', 'Subject: Synthetic RFI', '', ...lines, '', DRAFT_SIGNATURE].join('\n');

// Every applicable id verified with a passing value, so the engine finds no gaps; drafts empty.
function clean(key = 'cold_plate') {
  const p = RUBRIC.commodities.find((c) => c.key === key);
  const defs = [...RUBRIC.criteria, ...[...p.required, ...p.nice].map((id) => RUBRIC.tests.find((t) => t.id === id))];
  return {
    schema: 'sqc-extraction/1',
    supplier_id: 'SUP-07',
    commodity: key,
    run: { run_id: '2026-11-20a', model: 'unknown', skill_sha: 'unknown' },
    criteria: defs.map((d) => ({ id: d.id, state: 'verified', value: goodValue(d), citation: CITE, note: null })),
    drafts: { rfi_items: [], rfi_email: email('No additional evidence requested.'), audit_focus: [], audit_plan: [] },
  };
}

const RFI = ['2.spc', '6.ramp_plan', '8.subtier_named', '8.subtier_certs'];
const FOCUS = ['2.ctq_cpk', '6.lead_time', '8.subtier_named'];
const plan = (ids) => ids.map((id) => ({ criterion_id: id, question: `Walk through the evidence for ${id}.` }));

// RUBRIC.md "Worked example: SUP-07", with drafts that agree with the engine.
function sup07() {
  const x = clean('cold_plate');
  const set = (id, item) => Object.assign(x.criteria.find((c) => c.id === id), item);
  set('2.ctq_cpk', { value: 1.12 });
  set('2.spc', { state: 'assumed', value: null, note: '"SPC in place"' });
  set('6.capacity_ratio', { value: 0.85 });
  set('6.lead_time', { value: false });
  set('6.ramp_plan', { state: 'assumed', value: null, note: '"Ramp plan to follow"' });
  set('8.subtier_named', { state: 'missing', value: null, citation: null, note: 'No sub-tier named' });
  set('8.subtier_certs', { state: 'missing', value: null, citation: null, note: 'No sub-tier certs' });
  set('4.thermal_cycling', { state: 'missing', value: null, citation: null, note: 'No thermal cycling report' });
  x.drafts = {
    rfi_items: [...RFI],
    rfi_email: email(...RFI.map((id) => `Please send the evidence for ${id}.`)),
    audit_focus: [...FOCUS],
    audit_plan: plan(FOCUS),
  };
  return x;
}

const check = (x, opts = { as_of: AS_OF }) => checkDrafts(x, opts);
// Exactly one error, at path, with a message matching re.
function only(x, path, re, opts) {
  const { ok, errors } = check(x, opts);
  assert.equal(ok, false, `expected an error at ${path}`);
  assert.deepEqual(errors.map((e) => e.path), [path], JSON.stringify(errors));
  assert.match(errors[0].message, re);
}
const assertOk = (x) => {
  const r = check(x);
  assert.deepEqual([r.ok, r.errors], [true, []], JSON.stringify(r.errors));
  return r;
};
const withEmail = (body) => { const x = sup07(); x.drafts.rfi_email = body; return x; };

test('every sim reference passes, for every commodity the sim builds (AGENT-AC-04)', async () => {
  const seen = new Set();
  for (const seed of [101, 191]) {
    for (const fact of await simulateCandidates(seed)) {
      const ref = factsToReference(fact);
      const r = checkDrafts(ref, { as_of: AS_OF });
      assert.deepEqual([r.ok, r.errors], [true, []], `${seed} ${fact.supplier_id}: ${JSON.stringify(r.errors)}`);
      seen.add(fact.commodity);
      assert.ok(ref.drafts.rfi_email.endsWith(`\n${DRAFT_SIGNATURE}`));
    }
  }
  // The sim never draws sheet_metal for these seeds; the all-verified test below covers it.
  assert.deepEqual([...seen].sort(), RUBRIC.commodities.map((c) => c.key).filter((k) => k !== 'sheet_metal').sort());
});

for (const { key } of RUBRIC.commodities) {
  test(`all-verified ${key} with empty drafts passes`, () => {
    const r = assertOk(clean(key));
    assert.deepEqual(r.expected, { rfi_items: [], audit_focus: [] });
  });
}

test('RUBRIC worked example SUP-07 passes and the engine agrees with RUBRIC.md', () => {
  const r = assertOk(sup07());
  assert.deepEqual(r.expected, { rfi_items: RFI, audit_focus: FOCUS });
});

test('id tokens inside prose, punctuation and parentheses still count', () => {
  assertOk(withEmail(email('Items: (2.spc), 6.ramp_plan, and 8.subtier_named; also 8.subtier_certs.', 'Allow 3.5 days.')));
});

test('rule 1: rfi_items must equal the engine, same order', () => {
  let x = sup07(); x.drafts.rfi_items.push('2.ctq_cpk');
  only(x, 'drafts.rfi_items', /extra 2\.ctq_cpk/);
  x = sup07(); x.drafts.rfi_items.pop();
  only(x, 'drafts.rfi_items', /missing 8\.subtier_certs/);
  x = sup07(); x.drafts.rfi_items.reverse();
  only(x, 'drafts.rfi_items', /order differs/);
  x = sup07(); x.drafts.rfi_items = 'all of them';
  only(x, 'drafts.rfi_items', /expected the engine's/);
});

test('rule 2: audit_focus must equal the engine (audit_plan left alone)', () => {
  let x = sup07(); x.drafts.audit_focus[2] = '8.subtier_certs';
  only(x, 'drafts.audit_focus', /missing 8\.subtier_named; extra 8\.subtier_certs/);
  x = sup07(); x.drafts.audit_focus.push('6.capacity_ratio');
  only(x, 'drafts.audit_focus', /extra 6\.capacity_ratio/);
  x = sup07(); x.drafts.audit_focus.reverse();
  only(x, 'drafts.audit_focus', /order differs/);
});

test('rule 3: audit_plan follows the engine audit_focus', () => {
  let x = sup07(); x.drafts.audit_plan[1].criterion_id = '6.capacity_ratio';
  only(x, 'drafts.audit_plan[1].criterion_id', /expected "6\.lead_time"/);
  x = sup07(); x.drafts.audit_plan.pop();
  only(x, 'drafts.audit_plan', /expected 3 entries/);
  x = sup07(); x.drafts.audit_plan.push(plan(['6.capacity_ratio'])[0]);
  only(x, 'drafts.audit_plan', /expected 3 entries/);
  x = sup07(); x.drafts.audit_plan = null;
  only(x, 'drafts.audit_plan', /one entry per engine audit_focus/);
});

test('rule 3: a plan matching a wrong audit_focus is still wrong', () => {
  const x = sup07();
  const wrong = ['2.ctq_cpk', '6.capacity_ratio', '6.lead_time'];
  x.drafts.audit_focus = wrong; x.drafts.audit_plan = plan(wrong);
  const { errors } = check(x);
  assert.deepEqual(errors.map((e) => e.path),
    ['drafts.audit_focus', 'drafts.audit_plan[1].criterion_id', 'drafts.audit_plan[2].criterion_id'], JSON.stringify(errors));
});

test('rule 4 (FR-05): the email starts with the exact label', () => {
  const body = email(...RFI);
  const cases = {
    missing: body.slice(DRAFT_LABEL.length + 1),
    lowercase: body.replace(DRAFT_LABEL, DRAFT_LABEL.toLowerCase()),
    'leading space': ` ${body}`,
    'leading newline': `\n${body}`,
    BOM: `﻿${body}`,
    'hyphen not em dash': body.replace('DRAFT —', 'DRAFT -'),
    'on line 2': `Hello,\n${body}`,
    'text after label': body.replace(DRAFT_LABEL, `${DRAFT_LABEL} Not really.`),
    'CR after label': body.replace(DRAFT_LABEL, `${DRAFT_LABEL}\r`),
  };
  for (const [name, e] of Object.entries(cases)) {
    const { errors } = check(withEmail(e));
    assert.deepEqual(errors.map((x) => x.path), ['drafts.rfi_email'], `${name}: ${JSON.stringify(errors)}`);
    assert.match(errors[0].message, /must start with the label/, name);
  }
});

test('rule 5 (FR-12): the last line is exactly the signature', () => {
  assertOk(withEmail(`${email(...RFI)}\n`)); // one trailing newline is allowed
  const body = email(...RFI).slice(0, -DRAFT_SIGNATURE.length - 1);
  const cases = {
    missing: body,
    typo: `${body}\nStark Industries Supplier Quality — Pepper Pots`,
    'hyphen not em dash': `${body}\nStark Industries Supplier Quality - Pepper Potts`,
    'text after it': `${body}\n${DRAFT_SIGNATURE}\nSent from my phone`,
    'text after it, same line': `${body}\n${DRAFT_SIGNATURE} (synthetic)`,
    'text before it, same line': `${body}\nRegards, ${DRAFT_SIGNATURE}`,
    CRLF: `${body}\r\n${DRAFT_SIGNATURE}\r\n`,
    'trailing CR': `${body}\n${DRAFT_SIGNATURE}\r`,
    'trailing space': `${body}\n${DRAFT_SIGNATURE} `,
    'leading space': `${body}\n ${DRAFT_SIGNATURE}`,
    'two trailing newlines': `${body}\n${DRAFT_SIGNATURE}\n\n`,
  };
  for (const [name, e] of Object.entries(cases)) {
    const { errors } = check(withEmail(e));
    assert.deepEqual(errors.map((x) => x.path), ['drafts.rfi_email'], `${name}: ${JSON.stringify(errors)}`);
    assert.match(errors[0].message, /last line must be exactly/, name);
  }
  // A fully CRLF email breaks both the exact first line (FR-05) and the exact last line (FR-12).
  const crlf = check(withEmail(`${email(...RFI)}\n`.replace(/\n/g, '\r\n')));
  assert.deepEqual(crlf.errors.map((x) => x.message.split(' ').slice(0, 2).join(' ')), ['must start', 'last line'], JSON.stringify(crlf.errors));
});

test('rule 6: the email names every engine RFI item as a whole token', () => {
  only(withEmail(email('2.spc', '6.ramp_plan', '8.subtier_named')), 'drafts.rfi_email', /does not name RFI item 8\.subtier_certs/);
  // 8.subtier_named does not satisfy 8.subtier_certs, and a longer token does not satisfy its prefix.
  only(withEmail(email('2.spc', '6.ramp_plan', '8.subtier_named', '8.subtier_named again')), 'drafts.rfi_email', /8\.subtier_certs/);
  only(withEmail(email('2.spcx', '6.ramp_plan', '8.subtier_named', '8.subtier_certs')), 'drafts.rfi_email', /does not name RFI item 2\.spc$/);
  only(withEmail(email('12.spc', '6.ramp_plan', '8.subtier_named', '8.subtier_certs')), 'drafts.rfi_email', /does not name RFI item 2\.spc$/);
  only(withEmail(email('x2.spc', '6.ramp_plan', '8.subtier_named', '8.subtier_certs')), 'drafts.rfi_email', /does not name RFI item 2\.spc$/);
  // No ids at all: every engine RFI item is reported, one error each.
  const { errors } = check(withEmail(email('Nothing to ask.')));
  assert.deepEqual(errors.map((e) => e.message), RFI.map((id) => `does not name RFI item ${id}`));
});

test('rule 7: the email asks for nothing else', () => {
  const ask = (id) => withEmail(email(...RFI, `Also send ${id}.`));
  only(ask('2.ctq_cpk'), 'drafts.rfi_email', /names 2\.ctq_cpk, which is not an engine RFI item/); // a fail gap
  only(ask('4.thermal_cycling'), 'drafts.rfi_email', /names 4\.thermal_cycling/); // a missing nice-to-have
  only(ask('4.coolant_compat'), 'drafts.rfi_email', /names 4\.coolant_compat/); // a verified nice-to-have
  only(ask('4.burn_in'), 'drafts.rfi_email', /names 4\.burn_in/); // not in this extraction at all
  only(ask('1.capa'), 'drafts.rfi_email', /names 1\.capa/); // verified and passing
  // Empty RFI: any id is extra. Unknown id-shaped tokens are ignored.
  const x = clean(); x.drafts.rfi_email = email('Please confirm 1.capa.', 'Ref 9.nope and v1.2.');
  only(x, 'drafts.rfi_email', /names 1\.capa/);
});

test('collects every mismatch, not just the first', () => {
  const x = sup07();
  x.drafts.rfi_items.reverse();
  x.drafts.audit_focus[2] = '8.subtier_certs';
  x.drafts.rfi_email = x.drafts.rfi_email.slice(DRAFT_LABEL.length);
  const { ok, errors } = check(x);
  assert.equal(ok, false);
  assert.deepEqual(errors.map((e) => e.path), ['drafts.rfi_items', 'drafts.audit_focus', 'drafts.rfi_email'], JSON.stringify(errors));
});

test('engine errors, as_of and drafts shape give errors, never throws', () => {
  let x = sup07(); x.criteria.find((c) => c.id === '2.ctq_cpk').value = 'high';
  let r = check(x);
  assert.equal(r.ok, false);
  assert.equal(r.expected, null);
  assert.deepEqual(r.errors.map((e) => e.path), ['']);
  assert.match(r.errors[0].message, /^cannot evaluate: /);

  x = sup07(); x.commodity = 'nope';
  only(x, '', /^cannot evaluate: .*unknown commodity/);

  for (const opts of [{}, { as_of: '2026-13-01' }, { as_of: '1 Nov 2026' }, undefined]) {
    r = checkDrafts(sup07(), opts);
    assert.deepEqual(r.errors.map((e) => e.path), [''], JSON.stringify(opts));
    assert.match(r.errors[0].message, /^cannot evaluate: /);
  }

  // Label and signature still checked when the engine cannot run.
  x = sup07(); x.commodity = 'nope'; x.drafts.rfi_email = 'hello';
  assert.deepEqual(check(x).errors.map((e) => e.path), ['', 'drafts.rfi_email', 'drafts.rfi_email']);

  x = sup07(); delete x.drafts;
  only(x, 'drafts', /expected an object/);
  x = sup07(); x.drafts = [];
  only(x, 'drafts', /expected an object/);
  x = sup07(); x.drafts.rfi_email = 42;
  only(x, 'drafts.rfi_email', /expected a string/);

  for (const bad of [null, 'x', 3, []]) {
    r = check(bad);
    assert.deepEqual(r.errors.map((e) => e.path), ['', 'drafts'], JSON.stringify(bad));
  }
});

test('pure: input unchanged, repeat calls equal', () => {
  const x = sup07(); x.drafts.rfi_items.reverse();
  const before = structuredClone(x);
  const a = check(x), b = check(x);
  assert.deepEqual(x, before);
  assert.deepEqual(a, b);
});

test('CLI: exit codes 0, 1 and 2, every supplier reported', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'sqc-drafts-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const run = (...args) => spawnSync(process.execPath, [DRAFTS, ...args], { encoding: 'utf8' });
  const write = (name, body) => { const f = join(dir, name); writeFileSync(f, body); return f; };
  const bad = sup07(); bad.drafts.rfi_items.reverse(); bad.drafts.audit_focus.reverse();

  const good = write('good.json', JSON.stringify(sup07()));
  let r = run('--as-of', AS_OF, good);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, `OK ${good}\n`);

  // --as-of reaches the engine: after the 2027-06-01 cert expiry the engine's audit focus changes.
  r = run('--as-of', '2027-07-01', good);
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /^.*good\.json: drafts\.audit_focus: expected the engine's/m);

  const badFile = write('bad.json', JSON.stringify(bad));
  r = run('--as-of', AS_OF, badFile);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^.*bad\.json: drafts\.rfi_items: expected the engine's/m);
  assert.match(r.stderr, /^.*bad\.json: drafts\.audit_focus: expected the engine's/m);
  assert.match(r.stderr, /^INVALID .*bad\.json \(2 errors\)$/m);

  // Run dir: one good, one bad supplier; sidecar files are skipped (they are not JSON, so reading them would exit 2).
  const runDir = join(dir, 'run', '1');
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, 'SUP-01.json'), JSON.stringify(bad));
  writeFileSync(join(runDir, 'SUP-02.json'), JSON.stringify(sup07()));
  writeFileSync(join(runDir, 'SUP-02.validation.json'), 'not json');
  writeFileSync(join(runDir, 'SUP-02.run.jsonl'), 'not json');
  writeFileSync(join(runDir, 'SUP-02.files.txt'), 'not json');
  r = run('--as-of', AS_OF, runDir);
  assert.equal(r.status, 1, r.stderr);
  assert.equal(r.stdout, `OK ${join(runDir, 'SUP-02.json')}\n`);
  assert.match(r.stderr, /^INVALID .*SUP-01\.json \(2 errors\)$/m);
  assert.doesNotMatch(r.stderr + r.stdout, /validation|run\.jsonl|files\.txt/);

  // An engine error prints without a path.
  const broken = sup07(); broken.commodity = 'nope';
  r = run('--as-of', AS_OF, write('broken.json', JSON.stringify(broken)));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^.*broken\.json: cannot evaluate: /m);

  for (const args of [[], [good], ['--as-of', AS_OF], ['--as-of', '2026-02-30', good], ['--as-of', 'today', good]]) {
    r = run(...args);
    assert.equal(r.status, 2, JSON.stringify(args));
    assert.match(r.stderr, /usage/, JSON.stringify(args));
  }
  r = run('--as-of', AS_OF, join(dir, 'nope.json'));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /nope\.json: cannot read/);
  r = run('--as-of', AS_OF, write('notjson.json', '{ not json'));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /notjson\.json: cannot read as JSON/);
  const empty = join(dir, 'empty');
  mkdirSync(empty);
  r = run('--as-of', AS_OF, empty);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /no SUP-nn\.json/);
});

test('drafts.mjs imports only node: built-ins and the engine (AGENT-NFR-01)', () => {
  const src = readFileSync(DRAFTS, 'utf8');
  const specs = [...src.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]);
  assert.ok(specs.length > 0);
  for (const s of specs) assert.ok(s.startsWith('node:') || s === '../app/engine.js', s);
  assert.doesNotMatch(src, /\bimport\(/);
});

test('as_of reaches the engine: an expired cert moves the audit focus', () => {
  const { errors, expected } = checkDrafts(sup07(), { as_of: '2027-07-01' }); // cert expires 2027-06-01
  assert.equal(expected.audit_focus[0], '1.cert_current');
  assert.deepEqual(errors.map((e) => e.path), ['drafts.audit_focus', 'drafts.audit_plan[0].criterion_id',
    'drafts.audit_plan[1].criterion_id', 'drafts.audit_plan[2].criterion_id'], JSON.stringify(errors));
});

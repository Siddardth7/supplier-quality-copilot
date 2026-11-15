// Eval catch rate (issue 34): AGENT-AC-02 (one catch, partial, miss and false alarm), every PRD-04 § 5 outcome branch,
// tolerances, citation match, decision agreement, AGENT-AC-06 hash refusal, pooling, hold-out, determinism,
// the CLI and AGENT-NFR-01. Hand-made synthetic fixtures only (buyer Stark Industries, SUP-07), under os.tmpdir().
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { RUBRIC, STARK_REFERENCE, evaluate, findCriterion, scoreCriterion } from '../app/engine.js';
import { validateExtraction } from './validate.mjs';
import { buildReport, candCounts, loadLockedKey, scoreCandidate, scoreRow, summarize, valueMatches } from './eval.mjs';

const EVAL = fileURLToPath(new URL('./eval.mjs', import.meta.url));
const AS_OF = '2026-11-01';
const TMP = mkdtempSync(join(tmpdir(), 'sqc-eval-'));
after(() => rmSync(TMP, { recursive: true, force: true }));

// Item builders (PRD-04 § 5 state rules).
const V = (value, citation = 'capability_study.md §2') => ({ state: 'verified', value, citation, note: null });
const A = (value = null) => ({ state: 'assumed', value, citation: 'cover_letter.md §3', note: '"to follow"' });
const M = { state: 'missing', value: null, citation: null, note: 'looked in quality_manual.md' };
const PASS = { '2.ctq_cpk': 1.5, '3.grr': 5, '5.records_retention': 12, '6.capacity_ratio': 1.5, '7.pcn_notice': 120 };

// Valid cold_plate extraction (validate.test.mjs fixture pattern), every item verified and scoring 3, then patched.
function extraction(patch = {}, supplier_id = 'SUP-07') {
  const p = RUBRIC.commodities.find((c) => c.key === 'cold_plate');
  const defs = [...RUBRIC.criteria, ...[...p.required, ...p.nice].map((id) => RUBRIC.tests.find((t) => t.id === id))];
  const sample = (d) => ({ bool: true, date: '2027-06-30', enum: Object.keys(d.rule)[0], number: PASS[d.id] })[d.type];
  return {
    schema: 'sqc-extraction/1', supplier_id, commodity: 'cold_plate',
    run: { run_id: 'r1', model: 'claude-sonnet-5-5', skill_sha: 'abc1234' },
    criteria: defs.map((d) => ({ id: d.id, ...(patch[d.id] ?? V(sample(d), 'quality_manual.md §1')) })),
    drafts: {
      rfi_items: [], rfi_email: 'DRAFT — prepared by an agent for SQE review. Not sent.\n\nSubject: Synthetic RFI from Stark Industries',
      audit_focus: [], audit_plan: [],
    },
  };
}

// One answer_key.candidates[] entry built from a reference extraction with the real engine (SIMULATION.md shape).
function candidate(ref) {
  const nice = RUBRIC.commodities.find((c) => c.key === ref.commodity).nice;
  return {
    supplier_id: ref.supplier_id, commodity: ref.commodity,
    criteria: ref.criteria.map((i) => {
      const scored = !nice.includes(i.id);
      const score = scored ? scoreCriterion(findCriterion(RUBRIC, i.id), i, AS_OF) : null;
      return { criterion_id: i.id, expected_state: i.state, expected_value: i.value, expected_score: score,
        expected_citation: i.citation, note: i.note, scored,
        kind: scored ? (score < 3 ? { verified: 'fail', assumed: 'assumed', missing: 'missing' }[i.state] : null) : i.state === 'verified' ? null : 'info' };
    }),
    evaluation: evaluate(ref, { as_of: AS_OF, policy: STARK_REFERENCE }),
    reference: ref,
  };
}
const key = (refs, seed = 101) => ({ seed, as_of: AS_OF, policy: { id: STARK_REFERENCE.id, version: STARK_REFERENCE.version, name: STARK_REFERENCE.name },
  candidates: refs.map(candidate), scorecard: {} });

const score = (ref, agent, opts = {}) => scoreCandidate(candidate(ref), agent,
  { as_of: AS_OF, validation: agent && validateExtraction(agent), ...opts });
const counts = (r) => candCounts(r);
// Outcome of one row: reference item `want`, agent item `got` (undefined = same as reference).
function row(id, want, got, opts) {
  const r = score(extraction({ [id]: want }), extraction(got === undefined ? {} : { [id]: got }), opts);
  return r.rows.find((x) => x.criterion_id === id);
}
const outcome = (id, want, got) => row(id, want, got).outcome;

// World and run fixtures on disk. Returns paths; never inside the repo.
let seq = 0;
function fixtureRoot() {
  const root = join(TMP, `case${++seq}`);
  mkdirSync(join(root, 'worlds'), { recursive: true });
  mkdirSync(join(root, 'runs', 'r1'), { recursive: true });
  return root;
}
const PACKET = ['cover_letter.md', 'quality_manual.md', 'certificates.md', 'capability_study.md', 'msa.md', 'reliability_report.md', 'capacity.md', 'subtier.md', 'pcn_policy.md'];
function writeWorld(root, n, k, { holdout, packets = true } = {}) {
  const dir = join(root, 'worlds', String(n));
  mkdirSync(dir, { recursive: true });
  // malformed-key fixtures have no usable candidate list: they get no packet folders
  const ids = packets && Array.isArray(k.candidates) ? k.candidates.map((c) => c?.supplier_id).filter((id) => /^SUP-\d{2}$/.test(id)) : [];
  for (const id of ids) for (const name of PACKET) {
    mkdirSync(join(dir, 'packets', id), { recursive: true });
    writeFileSync(join(dir, 'packets', id, name), '# synthetic\n');
  }
  const bytes = `${JSON.stringify(k, null, 2)}\n`;
  writeFileSync(join(dir, 'answer_key.json'), bytes);
  writeFileSync(join(dir, 'answer_key.sha256'), `${createHash('sha256').update(bytes).digest('hex')}\n`);
  if (holdout !== undefined) writeFileSync(join(dir, 'holdout.json'), JSON.stringify(holdout));
  return dir;
}
function writeRun(root, n, x) {
  const dir = join(root, 'runs', 'r1', String(n));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${x.supplier_id}.json`), JSON.stringify(x));
}
const cli = (root, ...extra) => spawnSync(process.execPath,
  [EVAL, '--run', 'r1', '--runs', join(root, 'runs'), '--worlds', join(root, 'worlds'), ...extra], { encoding: 'utf8' });
const json = (r) => JSON.parse(r.stdout);

// AGENT-AC-02 fixture: reference with three gaps, agent with one catch, one partial, one miss, one false alarm.
const AC02_REF = { '2.ctq_cpk': V(1.12), '6.ramp_plan': A(), '8.subtier_named': M };
const AC02_AGENT = { '2.ctq_cpk': V(1.12), '6.ramp_plan': M, '8.subtier_named': V(true, 'subtier.md §1'), '1.capa': V(false) };

test('AGENT-AC-02: one catch, one partial, one miss, one false alarm', () => {
  const r = score(extraction(AC02_REF), extraction(AC02_AGENT));
  assert.equal(r.status, 'scored');
  const c = counts(r);
  assert.deepEqual({ gap: c.gap, catch: c.catch, partial: c.partial, miss: c.miss, clean: c.clean, false_alarm: c.false_alarm },
    { gap: 3, catch: 1, partial: 1, miss: 1, clean: 30, false_alarm: 1 });
  const by = Object.fromEntries(r.rows.map((x) => [x.criterion_id, x.outcome]));
  assert.deepEqual([by['2.ctq_cpk'], by['6.ramp_plan'], by['8.subtier_named'], by['1.capa']], ['catch', 'partial', 'miss', 'false_alarm']);
});

test('every outcome branch of PRD-04 § 5', () => {
  // expected verified fail (Cpk 1.12 scores 1)
  assert.equal(outcome('2.ctq_cpk', V(1.12), V(1.12)), 'catch');
  assert.equal(outcome('2.ctq_cpk', V(1.12), V(1.45)), 'miss'); // scores 3: not flagged
  assert.equal(outcome('2.ctq_cpk', V(1.12), V(1.0)), 'partial'); // wrong value, still flags
  assert.equal(outcome('2.ctq_cpk', V(1.12), A(1.12)), 'partial');
  assert.equal(outcome('2.ctq_cpk', V(1.12), M), 'partial');
  // a catch must flag: value within ±0.01 but the agent's value scores 3
  assert.equal(outcome('2.ctq_cpk', V(1.325), V(1.335)), 'miss');
  // expected assumed / missing
  assert.equal(outcome('6.ramp_plan', A(), A()), 'catch');
  assert.equal(outcome('6.ramp_plan', A(), M), 'partial');
  assert.equal(outcome('6.ramp_plan', A(), V(true)), 'miss');
  assert.equal(outcome('6.ramp_plan', A(), V(false)), 'partial');
  assert.equal(outcome('6.ramp_plan', M, M), 'catch');
  assert.equal(outcome('6.ramp_plan', M, A(true)), 'partial'); // value not compared, state differs
  assert.equal(outcome('6.ramp_plan', M, V(true)), 'miss');
  assert.equal(outcome('6.ramp_plan', M, V(false)), 'partial');
  // info rows (unscored nice-to-have): flags = not verified, never scoreCriterion
  assert.equal(outcome('4.coolant_compat', M, M), 'catch');
  assert.equal(outcome('4.coolant_compat', M, A()), 'partial');
  assert.equal(outcome('4.coolant_compat', M, V(true)), 'miss');
  assert.equal(outcome('4.coolant_compat', M, V(false)), 'miss'); // verified false is still verified
  assert.equal(row('4.coolant_compat', M, M).cls, 'gap');
  assert.equal(row('4.coolant_compat', V(true), M).cls, 'clean');
  assert.equal(outcome('4.coolant_compat', V(true), M), 'false_alarm');
  assert.equal(outcome('4.coolant_compat', V(true), V(false)), 'ok');
  // clean scored row
  assert.equal(outcome('1.capa', V(true), V(true)), 'ok');
  assert.equal(outcome('1.capa', V(true), V(false)), 'false_alarm');
  // absent item in an extraction treated as valid (unreachable after AGENT-FR-02, handled as null)
  const drop = (ids) => { const x = extraction(); x.criteria = x.criteria.filter((i) => !ids.includes(i.id)); return x; };
  const r = score(extraction({ '6.ramp_plan': M }), drop(['6.ramp_plan', '1.capa', '4.coolant_compat']), { validation: { ok: true, errors: [] } });
  const by = Object.fromEntries(r.rows.map((x) => [x.criterion_id, x]));
  assert.equal(by['6.ramp_plan'].outcome, 'miss');
  assert.equal(by['6.ramp_plan'].got_state, null);
  assert.equal(by['1.capa'].outcome, 'false_alarm');
  assert.equal(by['4.coolant_compat'].outcome, 'false_alarm');
});

test('value tolerances: Cpk and %GRR ±0.01, other numbers 2 decimals, the rest exact', () => {
  assert.equal(outcome('2.ctq_cpk', V(1.12), V(1.13)), 'catch'); // exactly 0.01 apart
  assert.equal(outcome('2.ctq_cpk', V(1.13), V(1.12)), 'catch');
  assert.equal(outcome('2.ctq_cpk', V(1.12), V(1.1301)), 'partial');
  assert.equal(outcome('2.ctq_cpk', V(1.12), V(1.1099)), 'partial');
  assert.equal(outcome('3.grr', V(25), V(25.01)), 'catch');
  assert.equal(outcome('3.grr', V(25.01), V(25)), 'catch');
  assert.equal(outcome('3.grr', V(25), V(25.0101)), 'partial');
  assert.equal(outcome('5.records_retention', V(7), V(7.004)), 'catch');
  assert.equal(outcome('5.records_retention', V(7), V(7.006)), 'partial');
  assert.equal(outcome('5.records_retention', V(7), V(7.01)), 'partial');
  assert.equal(outcome('5.records_retention', V(7), V(6.99)), 'partial');
  assert.equal(outcome('1.cert_current', V('2026-10-01'), V('2026-10-01')), 'catch');
  assert.equal(outcome('1.cert_current', V('2026-10-01'), V('2026-10-02')), 'partial'); // still expired, wrong date
  assert.equal(outcome('9.financial_health', V('watch'), V('watch')), 'catch');
  assert.equal(outcome('9.financial_health', V('watch'), V('distressed')), 'partial');
  assert.equal(outcome('1.capa', V(false), V(false)), 'catch');
  assert.equal(outcome('1.capa', V(false), V(true)), 'miss');
  // type mismatch and null never match
  assert.equal(valueMatches('1.capa', 'true', true), false);
  assert.equal(valueMatches('2.ctq_cpk', '1.12', 1.12), false);
  assert.equal(valueMatches('5.records_retention', null, 7), false);
  assert.equal(valueMatches('5.records_retention', 7, null), false);
  assert.equal(valueMatches('9.region_risk', 'High', 'high'), false);
  assert.equal(valueMatches('2.ctq_cpk', NaN, NaN), false);
});

test('invalid, missing or mislabeled extraction: every gap row a miss, no false alarms, disagree', () => {
  const ref = extraction(AC02_REF);
  const bad = extraction(AC02_AGENT); bad.score = 90;
  // the 30 clean rows were never assessed: out of the false-alarm denominator, visible as clean_unassessed
  const expect = { gap: 3, catch: 0, partial: 0, miss: 3, clean: 0, clean_unassessed: 30, false_alarm: 0, cite_den: 0, cite_hit: 0, cand: 1, agree: 0 };
  for (const [agent, status] of [[bad, 'invalid'], [null, 'missing'],
    [extraction(AC02_AGENT, 'SUP-08'), 'invalid'], [{ ...extraction(AC02_AGENT), commodity: 'pcba' }, 'invalid']]) {
    const r = score(ref, agent);
    assert.equal(r.status, status);
    assert.equal(r.decision_agrees, false);
    assert.deepEqual(counts(r), expect);
    assert.ok(r.rows.every((x) => x.got_state === null && x.got_value === null && x.got_citation === null));
  }
  // a validation result that was never computed is not trusted
  assert.equal(score(ref, extraction(AC02_AGENT), { validation: null }).status, 'invalid');
});

test('citation match: same file and top-level section, over verified catches only', () => {
  const cm = (want, got) => row('2.ctq_cpk', V(1.12, want), V(1.12, got)).citation_match;
  assert.equal(cm('msa.md §3.2', 'msa.md §3.4'), true);
  assert.equal(cm('msa.md §3', 'msa.md §3.1'), true);
  assert.equal(cm('msa.md §3.2', 'msa.md §4.2'), false);
  assert.equal(cm('msa.md §3.2', 'capability_study.md §3.2'), false);
  assert.equal(cm('msa.md §3', 'msa.md §30'), false);
  assert.equal(row('6.ramp_plan', A(), A()).citation_match, null); // catch, but expected assumed
  assert.equal(row('2.ctq_cpk', V(1.12), V(1.0)).citation_match, null); // partial
  // null expected citation: in the denominator, a non-hit
  const ref = extraction({ '2.ctq_cpk': V(1.12) });
  const cand = candidate(ref);
  cand.criteria.find((r) => r.criterion_id === '2.ctq_cpk').expected_citation = null;
  const agent = extraction({ '2.ctq_cpk': V(1.12) });
  const r = scoreCandidate(cand, agent, { as_of: AS_OF, validation: validateExtraction(agent) });
  assert.deepEqual([counts(r).cite_den, counts(r).cite_hit], [1, 0]);
});

test('decision agreement: same decision and routing, a flipped knockout, different routing reasons', () => {
  const ref = extraction();
  assert.equal(candidate(ref).evaluation.decision, 'APPROVED');
  assert.equal(score(ref, extraction()).decision_agrees, true);
  const ko = extraction({ '1.cert_scope': V(false) });
  assert.equal(evaluate(ko, { as_of: AS_OF }).decision, 'NOT APPROVED');
  assert.equal(score(ref, ko).decision_agrees, false);
  const sole = extraction({ '9.second_source': V(false) }); // still APPROVED, routing adds "Sole source"
  assert.equal(evaluate(sole, { as_of: AS_OF }).decision, 'APPROVED');
  assert.equal(score(ref, sole).decision_agrees, false);
});

test('AGENT-AC-06: hash check refuses edited, unhashed or malformed keys, one world at a time', () => {
  const root = fixtureRoot();
  const k = key([extraction(AC02_REF)]);
  const ok = writeWorld(root, 101, k);
  assert.equal(loadLockedKey(ok).ok, true);

  const edited = writeWorld(root, 102, k);
  const bytes = readFileSync(join(edited, 'answer_key.json'));
  bytes[bytes.indexOf('1.12')] = '2'.charCodeAt(0); // one byte, after the hash was written
  writeFileSync(join(edited, 'answer_key.json'), bytes);
  assert.deepEqual(loadLockedKey(edited), { ok: false, reason: 'answer_key.json does not match answer_key.sha256' });

  const hashFile = join(writeWorld(root, 900, k), 'answer_key.sha256');
  const good = readFileSync(hashFile, 'utf8');
  for (const text of [good.slice(1), good.toUpperCase(), good.replace('\n', '\r\n'), good.trim(), ` ${good}`, `${good}\n`]) {
    writeFileSync(hashFile, text);
    assert.match(loadLockedKey(join(root, 'worlds', '900')).reason, /not 64 lowercase hex digits/);
  }
  rmSync(hashFile);
  assert.deepEqual(loadLockedKey(join(root, 'worlds', '900')), { ok: false, reason: 'no answer_key.sha256' });
  assert.deepEqual(loadLockedKey(join(root, 'worlds', '999')), { ok: false, reason: 'no answer key' });
  // policy other than Stark Reference v1, after a valid hash
  const other = writeWorld(root, 901, { ...k, policy: { id: 'stark-reference', version: 2 } });
  assert.match(loadLockedKey(other).reason, /policy is not stark-reference v1/);

  // CLI: refused world 102 does not stop world 101; world 103 has no key at all
  writeRun(root, 101, extraction(AC02_AGENT));
  writeRun(root, 102, extraction(AC02_AGENT));
  writeRun(root, 103, extraction(AC02_AGENT));
  const r = cli(root);
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stdout, /^ {2}world 102: REFUSED answer_key\.json does not match answer_key\.sha256$/m);
  assert.match(r.stdout, /^ {2}world 103: REFUSED no answer key$/m);
  assert.match(r.stdout, /INCOMPLETE: world 102, 103, 104 refused or absent/);
  assert.match(r.stdout, /^ {2}worlds: 101$/m);
  const j = json(cli(root, '--json'));
  assert.deepEqual(j.groups[0].worlds, [101]);
  assert.equal(j.groups[0].counts.gap, 3);
});

test('pooling: summed counts, demo and re-test in their own blocks, unknown world is a usage error', () => {
  const root = fixtureRoot();
  // 101: one gap, caught. 102: three gaps, none caught. Pooled 1/4 = 25.0%; averaging rates would give 50.0%.
  writeWorld(root, 101, key([extraction({ '6.ramp_plan': M })]));
  writeRun(root, 101, extraction({ '6.ramp_plan': M }));
  writeWorld(root, 102, key([extraction(AC02_REF)], 102));
  writeRun(root, 102, extraction());
  writeWorld(root, 105, key([extraction(AC02_REF)], 105));
  writeRun(root, 105, extraction(AC02_REF));
  writeWorld(root, 150, key([extraction(AC02_REF)], 150));
  writeRun(root, 150, extraction(AC02_AGENT));

  let r = cli(root);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /world 150: not 101-108 and not the --demo world/);
  assert.equal(r.stdout, '');
  assert.equal(cli(root, '--demo', '103').status, 2); // the demo cannot be an eval world

  r = cli(root, '--demo', '150', '--json');
  assert.equal(r.status, 0, r.stderr); // 103 and 104 absent from the run: not a refusal, the headline says INCOMPLETE
  const [head, demo, retest, hold] = json(r).groups;
  assert.deepEqual(head.worlds, [101, 102]);
  assert.deepEqual([head.counts.catch, head.counts.gap], [1, 4]);
  assert.equal(head.rates.catch, '25.0%');
  assert.deepEqual(head.per_world.map((w) => w.rates.catch), ['100.0%', '0.0%']);
  assert.deepEqual(head.incomplete, [103, 104]);
  assert.equal(demo.name, 'DEMO (world 150)');
  assert.deepEqual(demo.worlds, [150]);
  assert.deepEqual([demo.counts.catch, demo.counts.partial, demo.counts.miss], [1, 1, 1]);
  assert.deepEqual(retest.worlds, [105]);
  assert.deepEqual([retest.counts.catch, retest.counts.gap], [3, 3]);
  assert.deepEqual(hold.worlds, []);
});

test('hold-out: own row, excluded from normal counts, malformed file refuses only the hold-out', () => {
  const root = fixtureRoot();
  // Sid's trap: 6.ramp_plan edited to missing in the packet; the original key still says verified true (clean).
  writeWorld(root, 101, key([extraction()]), {
    holdout: [{ supplier_id: 'SUP-07', criterion: '6.ramp_plan', expected_state: 'missing', expected_value: null, file: 'capacity.md', section: '3' },
      { supplier_id: 'SUP-07', criterion: '2.ctq_cpk', expected_state: 'verified', expected_value: 1.1, file: 'capability_study.md', section: '2' }],
  });
  writeRun(root, 101, extraction({ '6.ramp_plan': M, '2.ctq_cpk': V(1.1, 'capability_study.md §2.1') }));
  writeWorld(root, 102, key([extraction(AC02_REF)], 102),
    { holdout: [{ supplier_id: 'SUP-07', criterion: '9.nope', expected_state: 'missing', expected_value: null, file: 'x.md', section: '1' }] });
  writeRun(root, 102, extraction(AC02_AGENT));

  const r = cli(root, '--json');
  assert.equal(r.status, 1, r.stderr);
  const j = json(r);
  assert.deepEqual(j.refused, [{ world: 102, part: 'hold-out', reason: 'holdout.json[0]: unknown criterion "9.nope" for SUP-07' }]);
  const [head, , , hold] = j.groups;
  assert.deepEqual(head.worlds, [101, 102]); // world 102's normal rows still scored
  // 101: 33 rows minus 2 hold-out rows, all clean and ok; 102: AC-02 counts
  assert.deepEqual(head.per_world.map((w) => [w.counts.gap, w.counts.clean, w.counts.false_alarm]), [[0, 31, 0], [3, 30, 1]]);
  assert.deepEqual(hold.worlds, [101]);
  assert.deepEqual([hold.counts.gap, hold.counts.catch, hold.counts.cite_den, hold.counts.cite_hit, hold.counts.cand], [2, 2, 1, 1, 0]);
  assert.equal(hold.rates.decision, null);
  const text = cli(root).stdout;
  assert.match(text, /^ {2}world 102 hold-out: REFUSED holdout\.json\[0\]: unknown criterion/m);
  const holdBlock = text.slice(text.indexOf('\nHOLD-OUT\n'), text.indexOf('\nMISS TABLE'));
  assert.doesNotMatch(holdBlock, /false alarm|decision agreement/);
  for (const bad of ['{}', '[1]', JSON.stringify([{ supplier_id: 'SUP-99', criterion: '6.ramp_plan', expected_state: 'missing', file: 'a.md', section: '1' }])]) {
    writeFileSync(join(root, 'worlds', '101', 'holdout.json'), bad);
    const k = json(cli(root, '--json'));
    assert.equal(k.refused.find((x) => x.world === 101).part, 'hold-out');
    assert.deepEqual(k.groups[0].per_world[0].counts.clean, 33); // no exclusion when the hold-out is refused
  }
});

test('miss table lists every miss, partial and false alarm and nothing else', () => {
  const root = fixtureRoot();
  writeWorld(root, 101, key([extraction(AC02_REF), extraction(AC02_REF, 'SUP-08')]));
  writeRun(root, 101, extraction(AC02_AGENT));
  const bad = extraction(AC02_REF, 'SUP-08'); bad.criteria[0].state = 'Verified';
  writeRun(root, 101, bad);
  const j = json(cli(root, '--json'));
  assert.deepEqual(j.groups[0].misses.map((m) => [m.supplier_id, m.status, m.criterion_id, m.outcome]), [
    ['SUP-07', 'scored', '1.capa', 'false_alarm'], ['SUP-07', 'scored', '6.ramp_plan', 'partial'], ['SUP-07', 'scored', '8.subtier_named', 'miss'],
    ['SUP-08', 'invalid', '2.ctq_cpk', 'miss'], ['SUP-08', 'invalid', '6.ramp_plan', 'miss'], ['SUP-08', 'invalid', '8.subtier_named', 'miss'],
  ]);
  const text = cli(root).stdout;
  const table = text.slice(text.indexOf('MISS TABLE')).split('\n').filter((l) => /^ {2}101 /.test(l));
  assert.equal(table.length, 6);
  assert.match(table[0], /^ {2}101\s+SUP-07\s+1\.capa\s+false_alarm\s+verified true\s+verified false\s+capability_study\.md §2$/);
  assert.match(table[3], /^ {2}101\s+SUP-08\s+2\.ctq_cpk\s+miss \(invalid\)\s+verified 1\.12\s+-\s+-$/);
  assert.match(text, /^ {2}101\s+SUP-08\s+invalid\s+3\s+0\s+0\s+3\s+0\s+0\s+no$/m); // per-supplier row
  // SUP-08's 30 clean rows were never assessed: the rate is 1/30, not 1/60, and the report says so
  assert.match(text, /^ {2}false alarm\s+1\/30\s+3\.3%$/m);
  assert.match(text, /^ {2}clean rows not assessed\s+30\s+excluded$/m);
});

test('determinism: same inputs give byte-identical stdout, no paths or clock', () => {
  const root = fixtureRoot();
  writeWorld(root, 101, key([extraction(AC02_REF), extraction(AC02_REF, 'SUP-03')]));
  writeRun(root, 101, extraction(AC02_AGENT, 'SUP-03'));
  writeRun(root, 101, extraction(AC02_AGENT));
  writeWorld(root, 104, key([extraction(AC02_REF)], 104));
  writeRun(root, 104, extraction(AC02_REF));
  const today = new Date().toISOString().slice(0, 10);
  for (const mode of [[], ['--json']]) {
    const a = cli(root, ...mode), b = cli(root, ...mode);
    assert.equal(a.status, 0, a.stderr);
    assert.equal(a.stdout, b.stdout);
    for (const bad of [root, TMP, tmpdir(), today]) assert.ok(!a.stdout.includes(bad), bad);
    assert.doesNotMatch(a.stdout, /\d{4}-\d{2}-\d{2}T|\d{2}:\d{2}:\d{2}/);
  }
  const t = cli(root).stdout;
  assert.ok(t.indexOf('SUP-03') < t.indexOf('SUP-07')); // suppliers sorted, whatever the key order
});

test('zero denominators print n/a in text and null in JSON; zero worlds scored exits 1', () => {
  const root = fixtureRoot();
  writeWorld(root, 101, key([extraction()]));
  writeRun(root, 101, extraction());
  const j = json(cli(root, '--json'));
  assert.deepEqual(j.groups[0].rates, { catch: null, partial: null, miss: null, flag: null, false_alarm: '0.0%', citation: null, decision: '100.0%' });
  assert.equal(j.groups[0].targets.catch_ge_90, null);
  const text = cli(root).stdout;
  assert.match(text, /^ {2}catch\s+0\/0\s+n\/a$/m);
  assert.match(text, /catch target >= 90%: n\/a/);
  assert.match(text, /false alarm target <= 5%: n\/a/); // world 101 alone is an incomplete headline: not judged

  const empty = fixtureRoot();
  const r = cli(empty);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /INCOMPLETE: world 101, 102, 103, 104 refused or absent\n {2}not run/);
});

test('CLI usage errors exit 2 with usage on stderr', () => {
  const root = fixtureRoot();
  const run = (...args) => spawnSync(process.execPath, [EVAL, ...args], { encoding: 'utf8' });
  for (const args of [[], ['--json'], ['--run'], ['--run', '../r1'], ['--run', 'r1', '--frobnicate'], ['--run', 'r1', 'extra'],
    ['--run', 'r1', '--runs', join(root, 'runs'), '--demo', 'x'], ['--run', 'nope', '--runs', join(root, 'runs')]]) {
    const r = run(...args);
    assert.equal(r.status, 2, args.join(' '));
    assert.match(r.stderr, /usage: node agent\/eval\.mjs --run <run_id>/);
    assert.equal(r.stdout, '');
  }
});

test('eval.mjs imports only node: built-ins, the engine and shared validators; no clock or randomness', () => {
  for (const path of [EVAL, new URL('./holdout.mjs', import.meta.url)]) {
    const src = readFileSync(path, 'utf8');
    const specs = [...src.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]);
    assert.ok(specs.length > 0);
    for (const s of specs) assert.ok(s.startsWith('node:') || s === '../app/engine.js' || s === './validate.mjs' || s === './holdout.mjs', s);
    assert.doesNotMatch(src, /\bimport\(|\brequire\(/);
    assert.doesNotMatch(src, /Math\.random|\bDate\b|\bIntl\b|toLocale/);
  }
});

// Stage 3 (tester) additions: each pins a behaviour a mutant of eval.mjs survived.
test('gap and flag edges: score-2 rows, assumed info rows, kind not trusted, assumed values not compared', () => {
  const r = row('6.capacity_ratio', V(1.1), V(1.1)); // expected score 2 is a gap
  assert.deepEqual([r.cls, r.outcome], ['gap', 'catch']);
  assert.equal(outcome('6.capacity_ratio', V(0.9), V(1.1)), 'partial'); // agent scores 2: still flags
  assert.equal(outcome('9.region_risk', V('low'), V('medium')), 'false_alarm'); // clean row, agent scores 2
  assert.deepEqual([row('4.coolant_compat', A(), A()).cls, outcome('4.coolant_compat', A(), A()), outcome('4.coolant_compat', A(), M)], ['gap', 'catch', 'partial']);
  assert.equal(outcome('6.capacity_ratio', A(1.1), A(1.5)), 'catch'); // expected assumed: value not compared
  assert.equal(outcome('2.ctq_cpk', V(0.99), V(1.0)), 'catch'); // |1.00 - 0.99| is 0.010000000000000009
  assert.equal(outcome('2.ctq_cpk', V(1.0), V(1.0100001)), 'partial');
  // gap/clean comes from scored, expected_score and expected_state, never from kind
  const cand = candidate(extraction({ '2.ctq_cpk': V(1.12) }));
  cand.criteria.find((x) => x.criterion_id === '2.ctq_cpk').kind = null;
  cand.criteria.find((x) => x.criterion_id === '1.capa').kind = 'fail';
  const agent = extraction({ '2.ctq_cpk': V(1.12) });
  const by = Object.fromEntries(scoreCandidate(cand, agent, { as_of: AS_OF, validation: validateExtraction(agent) }).rows.map((x) => [x.criterion_id, x]));
  assert.deepEqual([by['2.ctq_cpk'].cls, by['2.ctq_cpk'].outcome, by['1.capa'].cls], ['gap', 'catch', 'clean']);
});

test('valid extraction for another commodity, or a key decision that differs with equal routing, does not score', () => {
  const ref = extraction();
  const pcba = { ...candidate(ref), commodity: 'pcba' };
  assert.equal(scoreCandidate(pcba, ref, { as_of: AS_OF, validation: validateExtraction(ref) }).status, 'invalid');
  const cand = candidate(ref);
  cand.evaluation = { ...cand.evaluation, decision: 'CONDITIONAL' }; // routing unchanged
  assert.equal(scoreCandidate(cand, ref, { as_of: AS_OF, validation: validateExtraction(ref) }).decision_agrees, false);
});

test('rates use the PRD-04 § 5 denominators', () => {
  const k = { gap: 4, catch: 1, partial: 2, miss: 1, clean: 16, clean_unassessed: 0, false_alarm: 2, cite_den: 1, cite_hit: 1, cand: 2, agree: 1 };
  assert.deepEqual(summarize([k]).rates,
    { catch: '25.0%', partial: '50.0%', miss: '25.0%', flag: '75.0%', false_alarm: '12.5%', citation: '100.0%', decision: '50.0%' });
});

// Hand-built evalWorld results for buildReport: one scored candidate in 101, nothing in 102-104.
function headlineResults(c, p, fa, clean, models = []) {
  const rows = [...Array(c).fill('catch'), ...Array(p).fill('partial')].map((o) => ({ cls: 'gap', outcome: o, citation_match: null }))
    .concat(Array.from({ length: clean }, (_, i) => ({ cls: 'clean', outcome: i < fa ? 'false_alarm' : 'ok', citation_match: null })));
  return [101, 102, 103, 104].map((n) => ({ world: n, refused: null, holdout_refused: null, models: n === 101 ? models : [], skill_shas: [], holdout: [],
    candidates: n === 101 ? [{ supplier_id: 'SUP-07', status: 'scored', rows, decision_agrees: true }] : [] }));
}

test('G3 targets at exactly 90% catch and 5% false alarm, catches only', () => {
  const at = buildReport({ run_id: 'r1', results: headlineResults(9, 1, 1, 20, ['claude-sonnet-5-5', 'claude-opus-5-5']) });
  assert.deepEqual(at.groups[0].targets, { catch_ge_90: 'PASS', false_alarm_le_5: 'PASS' });
  assert.deepEqual(at.models, ['claude-opus-5-5', 'claude-sonnet-5-5']);
  const below = buildReport({ run_id: 'r1', results: headlineResults(8, 2, 2, 20) }); // flag rate 100%, catch 80%, false alarm 10%
  assert.deepEqual(below.groups[0].targets, { catch_ge_90: 'FAIL', false_alarm_le_5: 'FAIL' });
  const over = buildReport({ run_id: 'r1', results: headlineResults(9, 1, 1, 19) }); // 1/19 = 5.3%
  assert.equal(over.groups[0].targets.false_alarm_le_5, 'FAIL');
});

test('an INCOMPLETE headline never reports a G3 target as PASS (PRD-04 G3, § 5: worlds 101-104)', () => {
  const root = fixtureRoot();
  writeWorld(root, 101, key([extraction({ '2.ctq_cpk': V(1.12) })]));
  writeRun(root, 101, extraction({ '2.ctq_cpk': V(1.12) }));
  const j = json(cli(root, '--json'));
  assert.deepEqual(j.groups[0].incomplete, [102, 103, 104]);
  assert.notEqual(j.groups[0].targets.catch_ge_90, 'PASS');
  assert.notEqual(j.groups[0].targets.false_alarm_le_5, 'PASS');
  assert.doesNotMatch(cli(root).stdout, /target [<>]= \d+%: PASS/);
});

test('hash and key shape: re-serialised key, dropped newline, malformed rows, duplicate hold-out, demo and run id', () => {
  const root = fixtureRoot();
  const k = key([extraction(AC02_REF)]);
  const dir = writeWorld(root, 101, k);
  const text = readFileSync(join(dir, 'answer_key.json'), 'utf8');
  for (const t of [text.replace(/\n$/, ''), `${JSON.stringify(k)}\n`, `${JSON.stringify(k, null, 4)}\n`]) {
    writeFileSync(join(dir, 'answer_key.json'), t);
    assert.deepEqual(loadLockedKey(dir), { ok: false, reason: 'answer_key.json does not match answer_key.sha256' });
  }
  const edit = (f) => { const c = structuredClone(k); f(c); return loadLockedKey(writeWorld(root, 900 + ++seq, c)).ok; };
  assert.equal(edit((c) => { c.candidates = {}; }), false);
  assert.equal(edit((c) => { c.candidates[0].criteria[0].expected_score = null; }), false); // undefined < 3 would turn a gap clean
  assert.equal(edit((c) => { c.candidates[0].criteria[0].criterion_id = '9.nope'; }), false);
  assert.equal(edit((c) => { c.candidates[0].criteria.push(c.candidates[0].criteria[0]); }), false);

  const r2 = fixtureRoot();
  const h = { supplier_id: 'SUP-07', criterion: '6.ramp_plan', expected_state: 'missing', expected_value: null, file: 'a.md', section: '1' };
  writeWorld(r2, 101, key([extraction()]), { holdout: [h, h] });
  writeRun(r2, 101, extraction());
  const j = json(cli(r2, '--json'));
  assert.equal(j.refused[0].part, 'hold-out');
  assert.equal(j.groups[0].counts.clean, 33);
  assert.equal(cli(r2, '--demo', '103').status, 2); // no stray world in this fixture: the demo rule alone must refuse
  const up = spawnSync(process.execPath, [EVAL, '--run', '../r1', '--runs', join(r2, 'runs', 'x'), '--worlds', join(r2, 'worlds')], { encoding: 'utf8' });
  assert.equal(up.status, 2); // ../r1 resolves to an existing run dir; the id itself is refused
});

test('false-alarm target uses assessed clean rows only: unusable packets cannot dilute it', () => {
  const results = headlineResults(9, 1, 1, 19); // 1 false alarm in 19 assessed clean rows = 5.3%
  results[0].candidates.push({ supplier_id: 'SUP-08', status: 'invalid', decision_agrees: false,
    rows: Array.from({ length: 30 }, () => ({ cls: 'clean', outcome: 'ok', citation_match: null })) });
  const r = buildReport({ run_id: 'r1', results });
  const { clean, clean_unassessed, false_alarm } = r.groups[0].counts;
  assert.deepEqual({ clean, clean_unassessed, false_alarm }, { clean: 19, clean_unassessed: 30, false_alarm: 1 });
  assert.equal(r.groups[0].rates.false_alarm, '5.3%'); // 1/49 would be 2.0% and pass
  assert.equal(r.groups[0].targets.false_alarm_le_5, 'FAIL');
  assert.equal(r.headline_complete, true);
});

test('an incomplete headline says so before any rate in the JSON', () => {
  const r = buildReport({ run_id: 'r1', results: headlineResults(1, 0, 0, 5).slice(0, 1) });
  assert.equal(r.headline_complete, false);
  const keys = Object.keys(r.groups[0]);
  assert.deepEqual(keys.slice(0, 4), ['name', 'worlds', 'incomplete', 'targets']);
  assert.ok(Object.keys(r).indexOf('headline_complete') < Object.keys(r).indexOf('groups'));
  assert.deepEqual(r.groups[0].incomplete, [102, 103, 104]);
});

test('an answer key with no candidates is refused, so an empty world cannot complete the headline', () => {
  const root = fixtureRoot();
  const dir = writeWorld(root, 104, key([]));
  assert.deepEqual(loadLockedKey(dir), { ok: false, reason: 'answer key candidates is not a non-empty array' });
  // 101-103 fully scored and a run folder for 104: only the refusal of the empty key keeps the headline incomplete
  for (const n of [101, 102, 103]) { writeWorld(root, n, key([extraction()])); writeRun(root, n, extraction()); }
  writeRun(root, 104, extraction());
  const r = cli(root, '--json');
  assert.equal(r.status, 1);
  assert.deepEqual(json(r).refused.map((x) => x.world), [104]);
  assert.equal(json(r).headline_complete, false);
  assert.deepEqual(json(r).groups[0].targets, { catch_ge_90: null, false_alarm_le_5: null });
});

test('no packet folder: a cited file cannot exist, so the extraction is invalid and scores as all misses', () => {
  const root = fixtureRoot();
  writeWorld(root, 101, key([extraction(AC02_REF)]), { packets: false });
  writeRun(root, 101, extraction(AC02_REF));
  const g = json(cli(root, '--json')).groups[0];
  assert.equal(g.per_supplier[0].status, 'invalid');
  assert.deepEqual([g.counts.catch, g.counts.miss, g.counts.clean], [0, g.counts.gap, 0]);
});

test('issue 111: miss rows carry the answer key\'s expected_citation (null when the key has none); hold-out rows carry file §section', () => {
  // Agent reports every item as passing: the verified 2.ctq_cpk gap is a miss, the missing 8.subtier_named gap a miss.
  const r = score(extraction(AC02_REF), extraction());
  const rep = buildReport({ run_id: 'r1', results: [{ world: 101, refused: null, holdout_refused: null, models: [], skill_shas: [], candidates: [r], holdout: [] }] });
  const by = Object.fromEntries(rep.groups[0].misses.map((m) => [m.criterion_id, m]));
  assert.equal(by['2.ctq_cpk'].outcome, 'miss');
  assert.equal(by['2.ctq_cpk'].expected_citation, 'capability_study.md §2');
  assert.equal(by['8.subtier_named'].outcome, 'miss');
  assert.equal(Object.hasOwn(by['8.subtier_named'], 'expected_citation'), true);
  assert.equal(by['8.subtier_named'].expected_citation, null);
  assert.equal(JSON.parse(JSON.stringify(rep)).groups[0].misses.every((m) => Object.hasOwn(m, 'expected_citation')), true, 'in --json too');
  // A key row with no expected_citation field at all still gives null, so --json always carries the key.
  const bare = scoreRow('SUP-07', { criterion_id: '8.subtier_named', expected_state: 'missing', expected_value: null, scored: true, expected_score: 0 }, null, AS_OF);
  assert.equal(bare.expected_citation, null);

  const root = fixtureRoot();
  writeWorld(root, 101, key([extraction()]), {
    holdout: [{ supplier_id: 'SUP-07', criterion: '2.ctq_cpk', expected_state: 'verified', expected_value: 1.1, file: 'capability_study.md', section: '2.1' },
      { supplier_id: 'SUP-07', criterion: '6.ramp_plan', expected_state: 'missing', expected_value: null, file: 'capacity.md', section: '3' }],
  });
  writeRun(root, 101, extraction());  // agent still reads the old, passing values: both traps are misses
  const hold = json(cli(root, '--json')).groups[3];
  assert.deepEqual(hold.misses.map((m) => [m.criterion_id, m.outcome, m.expected_citation]),
    [['2.ctq_cpk', 'miss', 'capability_study.md §2.1'], ['6.ramp_plan', 'miss', null]]);
});

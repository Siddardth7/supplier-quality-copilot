import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { RUBRIC, findCriterion, scoreCriterion } from '../app/engine.js';
import { sampleWorld } from './world.mjs';
import { makeRng } from './rng.mjs';
import { simulateCandidate, simulateCandidates, writeCandidateFacts, conditionPasses, drawDisclosure, expiryDate, AS_OF } from './candidate.mjs';
const world = sampleWorld(101);
const sheets = Object.fromEntries(await Promise.all(RUBRIC.commodities.map(async p => [p.key, JSON.parse(await readFile(new URL(`../data/requirements/${p.key}.json`, import.meta.url), 'utf8'))])));
const facts = await simulateCandidates(101);
const near = (a, b) => assert.ok(Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)), `${a} != ${b}`);
const mean = xs => xs.reduce((s, x) => s + x, 0) / xs.length;
function simulate(index = 0, patch = {}) {
  const candidate = structuredClone(world.candidates[index]); Object.assign(candidate.traits, patch);
  return simulateCandidate(candidate, sheets[candidate.commodity], 101);
}
async function scratch(t) { const dir = await mkdtemp(join(tmpdir(), 'sqc-candidate-')); t.after(() => rm(dir, { recursive: true, force: true })); return dir; }

test('facts cover exact rubric criteria and types for every commodity including sheet metal', () => {
  const metal = structuredClone(world.candidates[0]); metal.commodity = 'sheet_metal';
  for (const id of ['4.coating_thickness', '4.salt_spray']) metal.traits.boolean_probability[id] = 1;
  const all = [...facts, simulateCandidate(metal, sheets.sheet_metal, 101)];
  for (const fact of all) {
    assert.deepEqual(Object.keys(fact), ['supplier_id', 'commodity', 'seed', 'criteria']);
    const profile = RUBRIC.commodities.find(p => p.key === fact.commodity);
    assert.deepEqual(Object.keys(fact.criteria).sort(), [...RUBRIC.criteria.map(c => c.id), ...profile.required, ...profile.nice].sort());
    for (const [id, entry] of Object.entries(fact.criteria)) {
      const def = findCriterion(RUBRIC, id);
      assert.equal(typeof entry.true_value, ({ bool: 'boolean', number: 'number', date: 'string', enum: 'string' })[def.type]);
      if (def.type === 'number') assert.ok(Number.isFinite(entry.true_value));
      if (def.type === 'date') assert.match(entry.true_value, /^\d{4}-\d{2}-\d{2}$/);
      if (def.type === 'enum') assert.ok(Object.hasOwn(def.rule, entry.true_value));
      assert.ok(entry.evidence && Object.keys(entry.evidence).length > 0);
    }
  }
});
test('raw samples independently reproduce every Cpk and lowest CTQ', () => {
  for (const fact of facts) {
    const entry = fact.criteria['2.ctq_cpk'], results = [];
    for (const ctq of entry.evidence.ctqs) {
      assert.equal(ctq.observations.length, 50);
      const avg = mean(ctq.observations), s = Math.sqrt(ctq.observations.reduce((sum, x) => sum + (x - avg) ** 2, 0) / 49);
      const cpk = Math.min(ctq.usl - avg, avg - ctq.lsl) / (3 * s);
      near(ctq.mean, avg); near(ctq.s, s); near(ctq.cpk, cpk); results.push(cpk);
      const traits = world.candidates.find(c => c.id === fact.supplier_id).traits;
      near(ctq.sigma, (ctq.usl - ctq.lsl) / (6 * traits.process_capability));
      assert.ok(Math.abs(ctq.shift) <= 0.05 * (ctq.usl - ctq.lsl));
    }
    near(entry.true_value, Math.min(...results));
    assert.equal(entry.evidence.lowest_ctq, entry.evidence.ctqs[results.indexOf(Math.min(...results))].name);
  }
});
test('raw crossed studies independently reproduce every GRR and highest gauge', () => {
  for (const fact of facts) {
    const entry = fact.criteria['3.grr'], results = [];
    for (const g of entry.evidence.gauges) {
      assert.equal(g.readings.length, 10); assert.equal(g.appraiser_offsets.length, 3);
      const rs = [], avgs = [0, 0, 0];
      for (const part of g.readings) {
        assert.equal(part.length, 3);
        for (let a = 0; a < 3; a++) { assert.equal(part[a].length, 3); rs.push(Math.max(...part[a]) - Math.min(...part[a])); avgs[a] += part[a].reduce((s, x) => s + x, 0) / 30; }
      }
      const ev = mean(rs) * 0.5908;
      const variance = ((Math.max(...avgs) - Math.min(...avgs)) * 0.5231) ** 2 - ev * ev / 30;
      const expected = 600 * Math.sqrt(ev * ev + Math.max(0, variance)) / (g.usl - g.lsl);
      near(g.ev, ev); near(g.av_variance, variance); near(g.percent_tolerance, expected); results.push(expected);
      const ctq = fact.criteria['2.ctq_cpk'].evidence.ctqs.find(c => c.name === g.name);
      assert.deepEqual(g.part_values, ctq.observations.slice(0, 10));
      const trait = world.candidates.find(c => c.id === fact.supplier_id).traits.gauge_variation;
      near(g.generating_sigma, (g.usl - g.lsl) * trait / 600); near(g.component_sigma, g.generating_sigma / Math.sqrt(2));
    }
    near(entry.true_value, Math.max(...results));
    assert.equal(entry.evidence.highest_ctq, entry.evidence.gauges[results.indexOf(Math.max(...results))].name);
  }
});
test('tests retain fixed setup and independently compare all acceptance outcomes', () => {
  for (const fact of facts) for (const [id, spec] of Object.entries(sheets[fact.commodity].tests)) {
    const entry = fact.criteria[id], cs = entry.evidence.conditions;
    assert.equal(cs.length, spec.conditions.length);
    const passes = [];
    cs.forEach((c, i) => {
      for (const [key, value] of Object.entries(spec.conditions[i])) assert.deepEqual(c[key], value);
      assert.equal(c.model_basis, 'heuristic');
      if (c.kind === 'setup') { assert.deepEqual(c.observed, c.operator === 'between' ? mean(c.value) : c.value); assert.equal(c.passed, null); }
      else {
        const expected = ({ '<=': () => c.observed <= c.value, '>=': () => c.observed >= c.value, '=': () => c.observed === c.value, between: () => c.observed >= c.value[0] && c.observed <= c.value[1] })[c.operator]();
        assert.equal(c.passed, expected); passes.push(expected);
      }
      if (typeof c.observed === 'number') { assert.ok(Number.isFinite(c.observed)); if (c.kind === 'acceptance') assert.ok(c.observed >= 0); if (c.unit === 'fraction') assert.ok(c.observed <= 1); if (c.unit === '%') assert.ok(c.observed <= 100); }
    });
    assert.equal(entry.evidence.accepted, passes.every(Boolean));
    assert.equal(entry.true_value, spec.value_type === 'bool' ? passes.every(Boolean) : cs[0].observed);
  }
});
test('condition comparisons are inclusive and failed outcomes produce measured failures', () => {
  for (const [operator, value, pass, fail] of [['<=', 2, 2, 2.1], ['>=', 2, 2, 1.9], ['=', false, false, true], ['between', [1, 2], 1, 0.9]]) {
    assert.equal(conditionPasses({ operator, value }, pass), true); assert.equal(conditionPasses({ operator, value }, fail), false);
  }
  assert.equal(conditionPasses({ operator: 'between', value: [1, 2] }, 2), true);
  assert.throws(() => conditionPasses({ operator: 'unknown' }, 1), /operator/);
  const bad = simulate(0, { test_margin: -0.25, boolean_probability: Object.fromEntries(Object.keys(world.candidates[0].traits.boolean_probability).map(k => [k, 0])) });
  assert.equal(bad.criteria['4.leak_test'].true_value, false);
  assert.equal(bad.criteria['4.burst_pressure'].true_value, false);
  const burst = bad.criteria['4.burst_pressure'].evidence;
  near(burst.sustained_proof_pressure.value, burst.conditions.find(c => c.unit === 'ratio').observed * 6);
  const particle = bad.criteria['4.cleanliness'].evidence.conditions;
  assert.ok(particle[0].observed >= particle[1].observed);
});
test('boolean and zero limits, coverage and range observations retain physical units', () => {
  for (const index of [0, 3]) {
    const probability = Object.fromEntries(Object.keys(world.candidates[index].traits.boolean_probability).map(k => [k, 0]));
    const fact = simulate(index, { boolean_probability: probability });
    if (index === 0) {
      assert.equal(fact.criteria['4.burst_pressure'].evidence.conditions.find(c => c.unit === 'boolean').observed, true);
      const particles = fact.criteria['4.cleanliness'].evidence.conditions;
      assert.ok(Number.isInteger(particles[1].observed) && particles[1].observed >= 1 && particles[1].observed <= 3);
      assert.ok(particles[0].observed >= particles[1].observed);
    } else {
      const cs = fact.criteria['4.aoi_xray'].evidence.conditions;
      assert.ok(cs[0].covered >= 0 && cs[0].covered < 100); assert.equal(cs[0].total, 100); assert.equal(cs[0].observed, cs[0].covered / 100);
      assert.equal(fact.criteria['4.aoi_xray'].true_value, false);
      const coating = fact.criteria['4.conformal_coat'].evidence.conditions[0];
      assert.equal(coating.model, 'range_normal_conditioned'); assert.equal(coating.unit, 'µm');
    }
  }
});
test('numeric FAI and FPY preserve counts and month evidence instead of booleans', () => {
  const fai = simulate(4, { fai_coverage: 0.5 }).criteria['4.fai'];
  const c = fai.evidence.conditions[0]; assert.equal(c.total, 20); assert.ok(c.covered > 0 && c.covered < 20); near(fai.true_value, c.covered / 20);
  assert.equal(simulate(4, { fai_coverage: 0 }).criteria['4.fai'].true_value, 0);
  assert.equal(simulate(4, { fai_coverage: 1 }).criteria['4.fai'].true_value, 1);
  const fpy = simulate(7, { fpy_months: 3 }).criteria['4.fpy_data'];
  assert.equal(fpy.true_value, 3); assert.deepEqual(fpy.evidence.conditions[0].records.map(r => r.month), ['2026-08', '2026-09', '2026-10']);
  for (const r of fpy.evidence.conditions[0].records) assert.ok(r.total === 100 && Number.isInteger(r.first_pass) && r.first_pass >= 0 && r.first_pass <= 100);
  assert.equal(simulate(7, { fpy_months: 0 }).criteria['4.fpy_data'].evidence.conditions[0].records.length, 0);
});
test('capacity lead time certificate and scalar facts are derived from retained evidence', () => {
  for (const fact of facts) {
    const traits = world.candidates.find(c => c.id === fact.supplier_id).traits;
    const capacity = fact.criteria['6.capacity_ratio'];
    assert.equal(capacity.evidence.outputs.length, 8); assert.ok(capacity.evidence.outputs.every(n => Number.isInteger(n) && n >= 0));
    near(capacity.true_value, mean(capacity.evidence.outputs) / capacity.evidence.peak_weekly_demand);
    assert.equal(fact.criteria['5.records_retention'].true_value, traits.records_retention_years);
    assert.equal(fact.criteria['7.pcn_notice'].true_value, traits.pcn_notice_days);
    assert.equal(fact.criteria['9.region_risk'].true_value, traits.region_risk);
    assert.equal(fact.criteria['9.financial_health'].true_value, traits.financial_health);
    assert.equal(fact.criteria['1.cert_current'].evidence.expiry, fact.criteria['1.cert_current'].true_value);
  }
  for (const [ratio, weeks, meets] of [[1, 12, true], [1.01, 13, false], [0.5, 6, true]]) {
    const entry = simulate(0, { lead_time_ratio: ratio }).criteria['6.lead_time'];
    assert.equal(entry.evidence.quoted_weeks, weeks); assert.equal(entry.true_value, meets);
  }
  for (const [offset, date] of [[0, '2026-11-01'], [-1, '2026-10-31'], [60, '2026-12-31'], [61, '2027-01-01'], [485, '2028-02-29']]) assert.equal(expiryDate(offset), date);
});
test('disclosure endpoints claims privacy and appendix reservation preserve true evidence', () => {
  for (const [d, c, state] of [[1, 0, 'verified'], [0, 1, 'assumed'], [0, 0, 'missing']]) assert.equal(drawDisclosure(makeRng(1), d, c), state);
  const complete = simulate(5, { doc_discipline: 1, burying: 0 });
  const sparse = simulate(5, { doc_discipline: 0.5, claim_tendency: 1 });
  assert.ok(Object.values(sparse.criteria).some(e => e.disclosure === 'assumed'));
  for (const id of Object.keys(complete.criteria)) {
    assert.deepEqual(sparse.criteria[id].evidence, complete.criteria[id].evidence);
    assert.equal(sparse.criteria[id].true_value, complete.criteria[id].true_value);
    assert.equal(sparse.criteria[id].claimed_value, null);
    if (sparse.criteria[id].disclosure === 'assumed') assert.equal(typeof sparse.criteria[id].claim, 'string');
  }
  assert.equal(Object.values(complete.criteria).filter(e => e.buried).length, 2);
  for (const fact of [...facts, sparse]) {
    const locations = [], passing = [];
    for (const [id, e] of Object.entries(fact.criteria)) {
      if (e.disclosure === 'missing') { assert.equal(e.file, null); assert.equal(e.section, null); assert.equal(e.buried, false); }
      else { assert.match(e.file, /^[a-z0-9_]+\.md$/); assert.match(e.section, /^(1|9)\.\d+$/); locations.push(`${e.file} ${e.section}`); assert.equal(e.section.startsWith('9.'), e.buried); }
      if (e.disclosure !== 'assumed') { assert.equal(e.claim, null); assert.equal(e.claimed_value, null); }
      if (e.buried && e.disclosure === 'verified' && scoreCriterion(findCriterion(RUBRIC, id), { state: 'verified', value: e.true_value, citation: 'test' }, AS_OF) === 3) passing.push(id);
    }
    assert.equal(new Set(locations).size, locations.length); assert.ok(passing.length >= 2);
  }
  assert.throws(() => simulate(0, { doc_discipline: 0 }), /fewer than two/);
});
test('candidate validation rejects bad seeds identities profiles traits and unsupported conditions', () => {
  const original = world.candidates[0], sheet = sheets.cold_plate;
  for (const seed of [-1, 1.5, '101']) assert.throws(() => simulateCandidate(original, sheet, seed), /Seed/);
  assert.throws(() => simulateCandidate({ ...original, id: '../SUP-01' }, sheet, 101), /supplier/);
  assert.throws(() => simulateCandidate({ ...original, commodity: 'unknown' }, sheet, 101), /commodity/);
  assert.throws(() => simulateCandidate(original, sheets.pcba, 101), /mismatch/);
  for (const patch of [{ process_capability: 0 }, { doc_discipline: 2 }, { fpy_months: 0.1 }, { region_risk: 'unknown' }, { boolean_probability: {} }]) assert.throws(() => simulate(0, patch), /trait|boolean_probability/);
  const missing = structuredClone(sheet); delete missing.tests['4.leak_test'];
  assert.throws(() => simulateCandidate(original, missing, 101), /test set/);
  const unsupported = structuredClone(sheet); unsupported.tests['4.leak_test'].conditions[0].operator = '=';
  assert.throws(() => simulateCandidate(original, unsupported, 101), /Unsupported acceptance/);
});
test('seeded objects preserve inputs and are independent of other suppliers and targets', async () => {
  assert.deepEqual(await simulateCandidates(101), facts);
  assert.notDeepEqual(await simulateCandidates(102), facts);
  const before = structuredClone(world), sheetBefore = structuredClone(sheets);
  for (const candidate of [...world.candidates].reverse()) assert.deepEqual(simulateCandidate(candidate, sheets[candidate.commodity], 101), facts.find(f => f.supplier_id === candidate.id));
  const changed = structuredClone(world.candidates[0]); changed.target = { decision: 'anything' };
  assert.deepEqual(simulateCandidate(changed, sheets.cold_plate, 101), facts[0]);
  assert.deepEqual(world, before); assert.deepEqual(sheets, sheetBefore);
});
test('facts writer and CLI produce byte-identical files across directories without import effects', async t => {
  const dir = await scratch(t), a = join(dir, 'a'), b = join(dir, 'b');
  await writeCandidateFacts(101, a);
  const script = fileURLToPath(new URL('./candidate.mjs', import.meta.url));
  const output = execFileSync(process.execPath, [script, '--seed', '101', '--out', b], { cwd: dir, encoding: 'utf8' });
  assert.equal(output.trim().split('\n').length, 9); assert.match(output, /SUP-01: Cpk=.*GRR=.*capacity=.*verified=.*assumed=.*missing=/);
  assert.deepEqual((await readdir(a)).sort(), facts.map(f => `${f.supplier_id}.json`).sort());
  for (const f of facts) {
    const bytes = await readFile(join(a, `${f.supplier_id}.json`));
    assert.deepEqual(bytes, await readFile(join(b, `${f.supplier_id}.json`)));
    assert.equal(bytes.toString(), JSON.stringify(f, null, 2) + '\n');
  }
  await assert.rejects(writeCandidateFacts(-1, join(dir, 'invalid')), /Seed/);
  assert.deepEqual((await readdir(dir)).sort(), ['a', 'b']);
  assert.throws(() => execFileSync(process.execPath, [script, '--seed', 'NaN', '--out', b], { stdio: 'pipe' }), /Command failed/);
});

test('disclosed sections are consecutive per file and body including missing items', () => {
  let missing = 0;
  for (let seed = 101; seed < 111; seed++) for (const original of world.candidates) {
    const candidate = structuredClone(original);
    Object.assign(candidate.traits, { doc_discipline: 0.6, claim_tendency: 0.5, burying: 0.4 });
    const fact = simulateCandidate(candidate, sheets[candidate.commodity], seed), counts = new Map();
    for (const entry of Object.values(fact.criteria)) {
      if (entry.disclosure === 'missing') { missing++; assert.equal(entry.section, null); continue; }
      const prefix = entry.buried ? 9 : 1, key = `${entry.file}:${prefix}`;
      const next = (counts.get(key) ?? 0) + 1;
      assert.equal(entry.section, `${prefix}.${next}`);
      counts.set(key, next);
    }
  }
  assert.ok(missing > 0);
});

test('all supplier assertions avoid answer cues and are independent of hidden truth', () => {
  const seen = new Map();
  for (const profile of RUBRIC.commodities) for (let seed = 101; seed < 121; seed++) {
    const candidate = structuredClone(world.candidates[0]); candidate.commodity = profile.key;
    Object.assign(candidate.traits, { doc_discipline: 0.5, claim_tendency: 1 });
    for (const id of [...profile.required, ...profile.nice]) candidate.traits.boolean_probability[id] = seed % 2;
    const fact = simulateCandidate(candidate, sheets[profile.key], seed);
    for (const [id, entry] of Object.entries(fact.criteria)) if (entry.disclosure === 'assumed') {
      const def = findCriterion(RUBRIC, id);
      assert.equal(typeof entry.claim, 'string'); assert.ok(entry.claim.length > 10);
      assert.doesNotMatch(entry.claim, /not provided|\b(criterion|knockout|rubric|gap|score)\b|\d\.[a-z_]+/i);
      for (const text of [def.name, def.requirement, def.passes_when].filter(Boolean)) assert.ok(!entry.claim.toLowerCase().includes(text.toLowerCase()), `${id}: copied ${text}`);
      assert.equal(entry.claimed_value, null);
      if (seen.has(id)) assert.equal(entry.claim, seen.get(id));
      seen.set(id, entry.claim);
    }
  }
  assert.deepEqual([...seen.keys()].sort(), [...RUBRIC.criteria, ...RUBRIC.tests].map(c => c.id).sort());
});

test('sub-tier and alternate source never name the supplier itself', () => {
  for (let index = 0; index < world.candidates.length; index++) {
    const candidate = world.candidates[index];
    const fact = simulate(index, { boolean_probability: { ...candidate.traits.boolean_probability, '8.subtier_named': 1, '9.second_source': 1 } });
    assert.equal(fact.criteria['8.subtier_named'].evidence.suppliers.length, 1);
    assert.ok(!fact.criteria['8.subtier_named'].evidence.suppliers.includes(candidate.name));
    assert.notEqual(fact.criteria['9.second_source'].evidence.qualified_source, candidate.name);
  }
});

test('multi-condition coverage test passes near its single 0.9 probability across seeds', () => {
  for (const profile of RUBRIC.commodities) for (const probability of [0, 1]) {
    const fixture = structuredClone(world.candidates[0]); fixture.commodity = profile.key;
    fixture.traits.doc_discipline = 1;
    for (const id of [...profile.required, ...profile.nice]) fixture.traits.boolean_probability[id] = probability;
    const fact = simulateCandidate(fixture, sheets[profile.key], 101);
    for (const [id, spec] of Object.entries(sheets[profile.key].tests)) if (spec.value_type === 'bool') {
      assert.equal(fact.criteria[id].true_value, Boolean(probability), `${profile.key}:${id}`);
    }
  }
  const candidate = structuredClone(world.candidates[3]); candidate.traits.doc_discipline = 1;
  candidate.traits.boolean_probability['4.aoi_xray'] = 0.9;
  let passed = 0;
  for (let seed = 0; seed < 1000; seed++) {
    const entry = simulateCandidate(candidate, sheets[candidate.commodity], seed).criteria['4.aoi_xray'];
    const acceptance = entry.evidence.conditions.filter(c => c.kind === 'acceptance');
    assert.ok(acceptance.length > 1);
    assert.equal(entry.true_value, acceptance.every(c => conditionPasses(c, c.observed)));
    if (entry.true_value) passed++;
  }
  assert.ok(passed >= 860 && passed <= 940, `${passed}/1000 passed`);
});

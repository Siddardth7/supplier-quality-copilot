import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { RUBRIC } from '../app/rubric.js';
import { sampleWorld } from './world.mjs';

const fixtureUrl = new URL('./archetypes.json', import.meta.url);
const definitions = JSON.parse(readFileSync(fixtureUrl, 'utf8'));
const candidateDefaults = {
  process_capability: [1.8, 2.2], gauge_variation: [3, 6], cert_expiry_offset_days: [180, 730],
  doc_discipline: 1, claim_tendency: 0, burying: [0.1, 0.3], capacity_ratio: [1.3, 1.6],
  lead_time_ratio: [0.5, 0.8], test_margin: [0.1, 0.3], records_retention_years: [10, 15],
  pcn_notice_days: [90, 120], fai_coverage: 1, fpy_months: [6, 12],
  region_risk: 'low', financial_health: 'healthy',
};
const candidates = [
  ['SUP-01', 'Frost Technotics', 'cold_plate', 'Strong shop, sloppy on one required test',
    'NOT APPROVED', 'Senior', { doc_discipline: [0.85, 0.9] }],
  ['SUP-02', 'Wakanda Design Group', 'quick_disconnect', 'Excellent, sole source',
    'APPROVED', 'Senior', { boolean_probability: { '9.second_source': 0 } }],
  ['SUP-03', 'Hammer Industries', 'power_module', 'Weak process capability',
    'NOT APPROVED', 'Senior', { process_capability: [0.65, 0.9], gauge_variation: [18, 26], burying: [0.4, 0.7] }],
  ['SUP-04', 'Pym Technologies', 'pcba', 'Clean, Medium risk, second source',
    'APPROVED', 'Junior', {}],
  ['SUP-05', 'Cross Technological Enterprises', 'machined_part', 'Good shop, lapsed certificate',
    'NOT APPROVED', 'Senior', { cert_expiry_offset_days: [-31, -1] }],
  ['SUP-06', 'Stane International', 'optics_cable', 'Talks more than it proves',
    'CONDITIONAL', 'Senior', { doc_discipline: [0.86, 0.94], claim_tendency: 1 }],
  ['SUP-07', 'Oscorp', 'cold_plate', 'Ambitious NPI, under capacity',
    'CONDITIONAL', 'Senior', { process_capability: [1.3, 1.4], capacity_ratio: [0.8, 0.9],
      lead_time_ratio: [1.1, 1.4], doc_discipline: [0.85, 0.9], claim_tendency: 1 }],
  ['SUP-08', 'Roxxon', 'contract_mfg', 'Big CM, ESD control gap',
    'NOT APPROVED', 'Senior', { boolean_probability: { '4.esd_program': 0 }, fpy_months: [3, 5] }],
  ['SUP-09', 'Horizon Labs', 'cold_plate', 'Solid shop', 'APPROVED', 'Senior', {}],
];
const activeDefaults = {
  lots_per_month: [6, 10], received_qty: [200, 2000],
  quality_pattern: { kind: 'stable', base_rate: 0, start_month: null, monthly_increase: 0,
    spike_month: null, spike_rate: 0, noise_sd: 0 },
  detection: { incoming: 1, line: 0, field: 0 },
  failure_modes: ['FM-LEAK', 'FM-PLATING', 'FM-FLATNESS', 'FM-SOLDER', 'FM-LABEL', 'FM-DAMAGE'],
  failure_pattern: 'mixed', repeat_probability: 0, on_time_rate: 1,
  scar_trigger: 5, response_days: [5, 15], sd: [1, 3],
};
const active = [
  ['ACT-01', 'Damage Control', 'sheet_metal', 'Stable, excellent', {}],
  ['ACT-02', 'Alchemax', 'pcba', 'Gradual creep', { lots_per_month: [10, 12],
    received_qty: [1500, 2000], quality_pattern: { kind: 'creep', base_rate: [0.0012, 0.0012],
      start_month: 12, monthly_increase: [0.00006, 0.00008], noise_sd: [0, 0] } }],
  ['ACT-03', 'Rand Enterprises', 'machined_part', 'One bad lot',
    { quality_pattern: { kind: 'spike', spike_month: 9, spike_rate: [0.02, 0.06] } }],
  ['ACT-04', 'Timely Industries', 'quick_disconnect', 'Good quality, poor delivery',
    { on_time_rate: [0.4, 0.6] }],
  ['ACT-05', 'A.I.M. (Advanced Idea Mechanics)', 'cold_plate', 'Repeat mode, slow response',
    { quality_pattern: { base_rate: [0.0008, 0.0016] }, failure_pattern: 'repeat',
      repeat_probability: [0.3, 0.5], scar_trigger: [1, 3], response_days: [180, 180], sd: [5, 20] }],
  ['ACT-06', 'Trask Industries', 'power_module', 'Escapes to line and field',
    { quality_pattern: { base_rate: [0.002, 0.004] },
      detection: { incoming: 0.3, line: 0.4, field: 0.3 }, on_time_rate: [0.9, 0.97] }],
];
const integerPaths = new Set(['cert_expiry_offset_days', 'records_retention_years',
  'pcn_notice_days', 'fpy_months', 'quality_pattern.start_month',
  'quality_pattern.spike_month', 'scar_trigger']);

function fileHash() {
  return createHash('sha256').update(readFileSync(fixtureUrl)).digest('hex');
}

async function withDefinitions(change, check) {
  const directory = mkdtempSync(join(tmpdir(), 'supplier-world-test-'));
  try {
    for (const name of ['seed.mjs', 'rng.mjs', 'world.mjs', 'archetypes.json']) {
      copyFileSync(new URL(name, import.meta.url), join(directory, name));
    }
    const fixture = structuredClone(definitions);
    change(fixture);
    writeFileSync(join(directory, 'archetypes.json'), `${JSON.stringify(fixture)}\n`);
    const { sampleWorld: sampleCopy } = await import(pathToFileURL(join(directory, 'world.mjs')).href);
    await check(sampleCopy, fixture);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function checkTraits(actual, source, path = '') {
  if (path === 'failure_modes' || path === 'detection' || path === 'received_qty') {
    assert.deepEqual(actual, source, path);
  } else if (Array.isArray(source)) {
    assert.equal(typeof actual, 'number', path);
    assert.ok(actual >= source[0] && actual <= source[1], `${path} within source range`);
    if (integerPaths.has(path)) assert.ok(Number.isInteger(actual), path);
  } else if (source !== null && typeof source === 'object') {
    assert.deepEqual(Object.keys(actual), Object.keys(source), path);
    for (const [key, value] of Object.entries(source)) {
      checkTraits(actual[key], value, path ? `${path}.${key}` : key);
    }
  } else {
    assert.equal(actual, source, path);
  }
}

test('candidate fixture exactly expands documented roster defaults and overrides', () => {
  const expected = candidates.map(([id, name, commodity, archetype, decision, routing, overrides]) => {
    const profile = RUBRIC.commodities.find(entry => entry.key === commodity);
    const core = RUBRIC.criteria.filter(entry => entry.type === 'bool' && entry.id !== '6.lead_time');
    const tests = RUBRIC.tests.filter(entry => entry.type === 'bool'
      && [...profile.required, ...profile.nice].includes(entry.id));
    const boolean_probability = Object.fromEntries([...core, ...tests].map(entry => [entry.id, 1]));
    Object.assign(boolean_probability, overrides.boolean_probability);
    return { id, name, commodity, archetype, target: { decision, routing },
      traits: { ...candidateDefaults, ...overrides, boolean_probability } };
  });
  assert.deepEqual(definitions.candidates, expected);
  assert.deepEqual(Object.keys(definitions), ['candidates', 'active']);
});

test('active fixture exactly expands documented stories defaults and overrides', () => {
  const expected = active.map(([id, name, commodity, archetype, overrides]) => ({
    id, name, commodity, archetype, target: { story: id },
    traits: { ...activeDefaults, ...overrides,
      quality_pattern: { ...activeDefaults.quality_pattern, ...overrides.quality_pattern } },
  }));
  assert.deepEqual(definitions.active, expected);
  for (const entry of definitions.active) {
    assert.equal(Object.values(entry.traits.detection).reduce((sum, value) => sum + value, 0), 1);
  }
});

test('sampleWorld is byte deterministic module-relative and validates seeds', () => {
  const first = sampleWorld(101);
  assert.deepEqual(sampleWorld(101), first);
  assert.equal(JSON.stringify(sampleWorld(101)), JSON.stringify(first));
  assert.notDeepEqual(sampleWorld(102), first);
  assert.deepEqual(Object.keys(first), ['seed', 'candidates', 'active']);
  for (const seed of [0, 4294967295]) {
    assert.equal(sampleWorld(seed).seed, seed);
  }
  for (const seed of [undefined, null, '101', true, 1n, [], {}, -1, 0.5,
    4294967296, NaN, Infinity, -Infinity]) {
    assert.throws(() => sampleWorld(seed), /Seed/);
  }
  const directory = mkdtempSync(join(tmpdir(), 'supplier-cwd-test-'));
  try {
    const source = `import { sampleWorld } from ${JSON.stringify(new URL('./world.mjs', import.meta.url).href)};`
      + 'process.stdout.write(JSON.stringify(sampleWorld(101)));';
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', source],
      { cwd: directory, encoding: 'utf8' });
    assert.equal(output, JSON.stringify(first));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('sampled traits honor ranges integer units and pinned metadata', () => {
  for (const seed of [0, 1, 101, 102, 103, 104, 4294967295]) {
    const world = sampleWorld(seed);
    for (const group of ['candidates', 'active']) {
      assert.equal(world[group].length, definitions[group].length);
      for (const [index, entry] of world[group].entries()) {
        const { traits, ...metadata } = entry;
        const { traits: source, ...expected } = definitions[group][index];
        assert.deepEqual(metadata, expected);
        checkTraits(traits, source);
      }
    }
    assert.ok(!Number.isInteger(world.candidates[0].traits.gauge_variation));
    for (const key of ['lots_per_month', 'response_days', 'sd']) {
      assert.ok(!Number.isInteger(world.active[0].traits[key]), `${key} is continuous`);
    }
  }
});

test('active received quantities preserve copied archetype ranges for per-lot draws', () => {
  for (const seed of [0, 101, 102, 103, 104, 4294967295]) {
    const world = sampleWorld(seed);
    const expected = structuredClone(definitions.active);
    for (const [index, entry] of world.active.entries()) {
      assert.deepEqual(entry.traits.received_qty, expected[index].traits.received_qty);
      entry.traits.received_qty[0] = -1;
      assert.deepEqual(sampleWorld(seed).active[index].traits.received_qty,
        expected[index].traits.received_qty);
    }
    assert.deepEqual(definitions.active, expected);
  }
});

test('actual fixture removal addition and reorder leave other streams unchanged', async () => {
  const original = sampleWorld(101);
  const modifications = [
    fixture => { fixture.candidates.splice(0, 1); fixture.active.splice(0, 1); },
    fixture => {
      fixture.candidates.unshift({ ...structuredClone(fixture.candidates[0]), id: 'SUP-TEST' });
      fixture.active.unshift({ ...structuredClone(fixture.active[0]), id: 'ACT-TEST' });
    },
    fixture => { fixture.candidates.reverse(); fixture.active.reverse(); },
  ];
  for (const modify of modifications) {
    await withDefinitions(modify, (sampleCopy, fixture) => {
      const changed = sampleCopy(101);
      for (const group of ['candidates', 'active']) {
        assert.deepEqual(changed[group].map(entry => entry.id), fixture[group].map(entry => entry.id));
        for (const entry of changed[group]) {
          const expected = original[group].find(candidate => candidate.id === entry.id);
          if (expected) assert.deepEqual(entry, expected, entry.id);
        }
      }
    });
  }
});

test('sampled worlds isolate nested maps lists targets and source bytes', () => {
  const hash = fileHash();
  const original = structuredClone(sampleWorld(101));
  const changed = sampleWorld(101);
  changed.candidates[0].traits.boolean_probability['1.capa'] = 0;
  changed.candidates[0].target.routing = 'changed';
  changed.active[0].traits.failure_modes.push('FM-TEST');
  changed.active[0].traits.detection.incoming = 0;
  changed.active[0].traits.quality_pattern.kind = 'changed';
  changed.active[0].target.story = 'changed';
  assert.deepEqual(changed.candidates[1], original.candidates[1]);
  assert.deepEqual(changed.active[1], original.active[1]);
  changed.candidates.reverse();
  changed.active.reverse();
  assert.deepEqual(sampleWorld(101), original);
  assert.equal(fileHash(), hash);
});

test('copied enum lists sample allowed choices and nested month ranges stay integer', async () => {
  const seen = [new Set(), new Set(), new Set(), new Set()];
  await withDefinitions(fixture => {
    fixture.candidates[0].traits.region_risk = ['low', 'medium', 'high'];
    fixture.candidates[0].traits.financial_health = ['healthy', 'watch', 'distressed'];
    fixture.candidates[1].traits.region_risk = ['low'];
    fixture.active[0].traits.quality_pattern.kind = ['stable', 'creep', 'spike'];
    fixture.active[0].traits.quality_pattern.start_month = [7, 18];
    fixture.active[0].traits.quality_pattern.spike_month = [7, 18];
    fixture.active[0].traits.failure_pattern = ['mixed', 'repeat'];
  }, sampleCopy => {
    for (let seed = 0; seed < 50; seed += 1) {
      const world = sampleCopy(seed);
      const candidate = world.candidates[0].traits;
      const traits = world.active[0].traits;
      [candidate.region_risk, candidate.financial_health, traits.quality_pattern.kind,
        traits.failure_pattern].forEach((value, index) => seen[index].add(value));
      for (const value of [traits.quality_pattern.start_month, traits.quality_pattern.spike_month]) {
        assert.ok(Number.isInteger(value) && value >= 7 && value <= 18);
      }
      assert.equal(world.candidates[1].traits.region_risk, 'low');
      assert.deepEqual(traits.failure_modes, activeDefaults.failure_modes);
      assert.deepEqual(traits.detection, activeDefaults.detection);
    }
  });
  assert.deepEqual(seen.map(values => [...values].sort()), [
    ['high', 'low', 'medium'], ['distressed', 'healthy', 'watch'],
    ['creep', 'spike', 'stable'], ['mixed', 'repeat'],
  ]);
});

test('copied malformed numeric ranges enums and failure lists reject descriptively', async () => {
  const cases = [
    ['process_capability', []], ['process_capability', [1]],
    ['process_capability', [1, 2, 3]], ['process_capability', ['1', 2]],
    ['process_capability', [2, 1]], ['cert_expiry_offset_days', [0.5, 2]],
    ['region_risk', []], ['region_risk', ['low', 'invalid']],
    ['financial_health', 'invalid'],
  ];
  for (const [key, value] of cases) {
    await withDefinitions(fixture => { fixture.candidates[0].traits[key] = value; },
      sampleCopy => assert.throws(() => sampleCopy(101), new RegExp(key)));
  }
  for (const [key, value] of [['failure_modes', []], ['failure_modes', [1]],
    ['failure_modes', 'FM-LEAK'], ['failure_pattern', []]]) {
    await withDefinitions(fixture => { fixture.active[0].traits[key] = value; },
      sampleCopy => assert.throws(() => sampleCopy(101), new RegExp(key)));
  }
});

test('sim source uses built-ins or relative imports without global random or clock calls', () => {
  const directory = new URL('./', import.meta.url);
  for (const name of readdirSync(directory)) {
    const content = readFileSync(new URL(name, directory), 'utf8');
    for (const needle of ['Math' + '.random', 'Date' + '.now', 'new' + ' Date(']) {
      assert.ok(!content.includes(needle), `${name} excludes ${needle}`);
    }
    for (const match of content.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      assert.ok(/^(node:|\.{1,2}\/)/.test(match[1]), `${name}: built-in or local import`);
    }
  }
});

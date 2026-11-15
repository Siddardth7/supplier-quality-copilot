import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, mkdir, mkdtemp, writeFile, rm, cp, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { renderRequirements, renderAllRequirements } from './render-requirements.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = join(root, 'data/requirements');
const header = 'Stark Industries — Supplier Quality. Synthetic document for a demo.';
const banner = '> Synthetic document for a demo. Fictional supplier.';
const rubric = await readFile(join(root, 'docs/RUBRIC.md'), 'utf8');
const ids = text => [...text.matchAll(/`(4\.[a-z0-9_]+)`/g)].map(match => match[1]);
const profiles = rubric.split('### Commodity profiles')[1].split('### Adding a test')[0]
  .split('\n').filter(line => /^\| `[a-z_]+` \|/.test(line)).map(line => {
    const cells = line.split('|').map(cell => cell.trim());
    return { key: cells[1].replaceAll('`', ''), required: ids(cells[4]), nice: ids(cells[5]) };
  });
const catalog = new Map(rubric.split('### Test catalog')[1].split('### Commodity profiles')[0]
  .split('\n').filter(line => /^\| `4\./.test(line)).map(line => {
    const cells = line.split('|').map(cell => cell.trim());
    return [ids(cells[1])[0], cells[4].startsWith('number:') ? 'number' : 'bool'];
  }));
const sheet = async key => JSON.parse(await readFile(join(directory, `${key}.json`), 'utf8'));
const nonempty = value => assert.ok(typeof value === 'string' && value.trim().length > 0);
const fixture = () => ({
  header, commodity: 'fixture', part_no: 'SI-FX-0001', part_name: 'Fictional fixture',
  revision: 'A', drawing_no: 'SI-DWG-FX-0001',
  ctqs: ['Width', 'Height', 'Depth'].map(name => ({ name, nominal: 10, lsl: 9, usl: 11, unit: 'mm', basis: 'heuristic' })),
  tests: { '4.leak_test': { name: 'Fixture test', required: true, value_type: 'bool',
    conditions: [{ measure: 'Rate', kind: 'acceptance', operator: '<=', value: 2, unit: 'mm/s', basis: 'heuristic' }] } },
  peak_weekly_demand: 100, need_by_weeks: 4, planning_basis: 'heuristic'
});
async function scratch(t) {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'requirements-test-')));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test('requirement pairs exactly match all RUBRIC commodity profiles', async () => {
  assert.equal(profiles.length, 8);
  assert.deepEqual((await readdir(directory)).sort(), profiles.flatMap(({ key }) => [`${key}.json`, `${key}.md`]).sort());
  for (const { key } of profiles) assert.equal((await sheet(key)).commodity, key);
});

test('every required and nice test has conditions and its RUBRIC type', async () => {
  for (const { key, required, nice } of profiles) {
    const { tests } = await sheet(key);
    assert.deepEqual(Object.keys(tests).sort(), [...required, ...nice].sort(), key);
    for (const [id, entry] of Object.entries(tests)) {
      assert.equal(entry.required, required.includes(id), `${key} ${id}`);
      assert.equal(entry.value_type, catalog.get(id), `${key} ${id}`);
      nonempty(entry.name);
      assert.ok(Array.isArray(entry.conditions) && entry.conditions.length > 0, `${key} ${id}`);
      assert.ok(entry.conditions.some(condition => condition.kind === 'acceptance'));
      for (const condition of entry.conditions) {
        assert.ok(['setup', 'acceptance'].includes(condition.kind));
        nonempty(condition.measure); nonempty(condition.unit);
        assert.ok(['<=', '>=', '=', 'between'].includes(condition.operator));
        if (condition.operator === 'between') {
          assert.equal(condition.value.length, 2);
          assert.ok(condition.value.every(Number.isFinite) && condition.value[0] < condition.value[1]);
        } else if (condition.operator === '=') {
          assert.ok(Number.isFinite(condition.value) || typeof condition.value === 'boolean'
            || (typeof condition.value === 'string' && condition.value.trim().length > 0));
        } else assert.ok(Number.isFinite(condition.value));
      }
    }
  }
});

test('sheets carry controlled identity, two-sided CTQs, planning and individual heuristic bases', async () => {
  for (const { key } of profiles) {
    const s = await sheet(key);
    assert.equal(s.header, header);
    assert.match(s.part_no, /^SI-[A-Z]{2}-\d{4}$/);
    assert.match(s.drawing_no, /^SI-DWG-[A-Z]{2}-\d{4}$/);
    nonempty(s.part_name); nonempty(s.revision);
    assert.ok(s.ctqs.length >= 3 && s.ctqs.length <= 5);
    for (const ctq of s.ctqs) {
      nonempty(ctq.name); nonempty(ctq.unit);
      assert.ok([ctq.nominal, ctq.lsl, ctq.usl].every(Number.isFinite));
      assert.ok(ctq.lsl < ctq.nominal && ctq.nominal < ctq.usl);
    }
    for (const limit of [...s.ctqs, ...Object.values(s.tests).flatMap(entry => entry.conditions)]) {
      assert.equal(limit.basis, 'heuristic', `${key}: shipped values are buyer proposals`);
      assert.equal(Object.hasOwn(limit, 'standard'), false);
    }
    assert.ok(Number.isInteger(s.peak_weekly_demand) && s.peak_weekly_demand > 0);
    assert.ok(Number.isFinite(s.need_by_weeks) && s.need_by_weeks > 0);
    assert.equal(s.planning_basis, 'heuristic');
  }
});

test('compound tests retain post-stress results, categorical evidence and numeric catalog units', async () => {
  const conditions = async (key, id) => (await sheet(key)).tests[id].conditions;
  for (const [key, id] of [['cold_plate', '4.thermal_cycling'], ['quick_disconnect', '4.cycle_life']]) {
    const cs = await conditions(key, id);
    assert.ok(cs.some(c => c.unit === 'cycles' && c.operator === '>='));
    assert.ok(cs.some(c => /Post-cycle helium leak/.test(c.measure) && c.operator === '<=' && c.unit === 'mbar·L/s'));
  }
  const flex = await conditions('optics_cable', '4.bend_flex');
  for (const [name, direction] of [['insertion', '<='], ['return', '>=']]) {
    assert.ok(flex.some(c => c.measure.includes(`Post-flex ${name} loss`) && c.operator === direction && c.unit === 'dB'));
  }
  const efficiency = await conditions('power_module', '4.efficiency');
  for (const point of ['low', 'middle', 'full']) {
    assert.ok(efficiency.some(c => c.measure === `Efficiency at ${point} load point` && c.operator === '>=' && c.unit === 'fraction'));
    assert.ok(efficiency.some(c => c.measure.toLowerCase() === `${point} load point / rated load` && c.operator === '=' && c.unit === 'fraction'));
  }
  for (const key of ['cold_plate', 'machined_part']) {
    const cs = await conditions(key, '4.material_cert');
    assert.ok(cs.some(c => c.measure === 'Drawing material' && /^SI-MAT-/.test(c.value)));
    assert.ok(cs.some(c => /traceable to material lot/.test(c.measure) && c.value === true));
    assert.ok(cs.some(c => /matches drawing/.test(c.measure) && c.value === true));
  }
  for (const key of ['machined_part', 'sheet_metal']) {
    assert.equal((await conditions(key, '4.fai'))[0].unit, 'fraction');
  }
  assert.equal((await conditions('contract_mfg', '4.fpy_data'))[0].unit, 'months');
});

test('committed Markdown equals deterministic pure rendering with clean text and synthetic banner', async () => {
  for (const { key } of profiles) {
    const s = await sheet(key);
    const before = structuredClone(s);
    const md = renderRequirements(s);
    assert.equal(md, await readFile(join(directory, `${key}.md`), 'utf8'));
    assert.equal(renderRequirements(s), md);
    assert.deepEqual(s, before);
    assert.ok(md.startsWith(`${banner}\n\n# ${header}\n`));
    assert.ok(md.endsWith('\n'));
    assert.doesNotMatch(md, /\r|[ \t]+$/m);
  }
});

test('renderer includes values, comparisons, bases, classifications and escaped cells', () => {
  const s = fixture();
  s.part_name = 'Panel | <demo> &\nline';
  const conditions = s.tests['4.leak_test'].conditions;
  conditions.push(
    { measure: 'Lower', kind: 'acceptance', operator: '>=', value: 3, unit: 'mm', basis: 'heuristic' },
    { measure: 'Range', kind: 'acceptance', operator: 'between', value: [1, 4], unit: 'mm', basis: 'heuristic' },
    { measure: 'Material', kind: 'acceptance', operator: '=', value: 'SI-MAT-FIXTURE', unit: 'designation', basis: 'heuristic' },
    { measure: 'Recorded', kind: 'acceptance', operator: '=', value: true, unit: 'boolean', basis: 'standard', standard: 'Synthetic fixture specification §1 (not a published standard)', context: 'a|b\nc' });
  s.tests['4.halt'] = { name: 'Optional fixture', required: false, value_type: 'bool', conditions: [{ measure: 'Failure', kind: 'acceptance', operator: '=', value: false, unit: 'boolean', basis: 'heuristic' }] };
  const md = renderRequirements(s);
  for (const expected of [
    '| Commodity | fixture |', '| Part number | SI-FX-0001 |', '| Revision | A |', '| Drawing number | SI-DWG-FX-0001 |',
    '| Part name | Panel &#124; &lt;demo&gt; &amp;<br>line |',
    '| Width | 10 | 9 | 11 | mm | heuristic |', '| Height | 10 | 9 | 11 | mm | heuristic |', '| Depth | 10 | 9 | 11 | mm | heuristic |',
    '| Rate | acceptance | ≤ 2 | mm/s | heuristic | — |', '| Lower | acceptance | ≥ 3 | mm | heuristic | — |',
    '| Range | acceptance | 1 to 4 (inclusive) | mm | heuristic | — |', '| Material | acceptance | = SI-MAT-FIXTURE | designation | heuristic | — |',
    '| Recorded | acceptance | = true | boolean | standard: Synthetic fixture specification §1 (not a published standard) | a&#124;b<br>c |',
    '| Failure | acceptance | = false | boolean | heuristic | — |',
    '### 3.1 Fixture test\n\nRequired.', '### 3.2 Optional fixture\n\nNice to have.',
    '| Peak weekly demand | 100 | parts/week | heuristic |', '| Need-by lead time | 4 | weeks | heuristic |',
    'All acceptance conditions listed for a test must be satisfied.'
  ]) assert.ok(md.includes(expected), expected);
});

test('renderer rejects malformed bounds, bases, metadata, planning and condition shapes', () => {
  const cases = [
    [s => { s.ctqs[0].lsl = 10; }, /finite bounds/],
    [s => { s.ctqs[0].usl = 10; }, /finite bounds/],
    [s => { s.ctqs[0].lsl = -Infinity; }, /finite bounds/],
    [s => { s.ctqs.pop(); }, /3–5/],
    [s => { s.ctqs[0].basis = 'unknown'; }, /basis/],
    [s => { s.ctqs[0].basis = 'standard'; }, /standard/],
    [s => { s.ctqs[0].standard = 'unjustified'; }, /omit standard/],
    [s => { s.header = ''; }, /header/],
    [s => { s.part_no = ''; }, /part_no/],
    [s => { s.peak_weekly_demand = 0; }, /positive integer/],
    [s => { s.peak_weekly_demand = 1.5; }, /positive integer/],
    [s => { s.need_by_weeks = 0; }, /positive/],
    [s => { s.tests['4.leak_test'].conditions = []; }, /conditions/],
    [s => { s.tests['4.leak_test'].conditions[0].basis = 'standard'; }, /standard/],
    [s => { s.tests['4.leak_test'].conditions[0].operator = 'approx'; }, /operator/],
    [s => { s.tests['4.leak_test'].conditions[0].value = '2'; }, /invalid value/],
    [s => { Object.assign(s.tests['4.leak_test'].conditions[0], { operator: 'between', value: [2, 2] }); }, /invalid value/],
    [s => { Object.assign(s.tests['4.leak_test'].conditions[0], { operator: 'between', value: [1, Infinity] }); }, /invalid value/],
    [s => { Object.assign(s.tests['4.leak_test'].conditions[0], { operator: '=', value: '' }); }, /invalid value/],
    [s => { s.tests['4.leak_test'].conditions[0].unit = ''; }, /unit required/]
  ];
  for (const [mutate, error] of cases) {
    const s = fixture(); mutate(s);
    assert.throws(() => renderRequirements(s), error);
  }
});

test('condition kind is required and each test needs acceptance evidence', () => {
  for (const kind of [undefined, null, '', 'result', 1]) {
    const s = fixture();
    s.tests['4.leak_test'].conditions[0].kind = kind;
    assert.throws(() => renderRequirements(s), /invalid kind/);
  }
  const s = fixture();
  s.tests['4.leak_test'].conditions[0].kind = 'setup';
  assert.throws(() => renderRequirements(s), /at least one acceptance condition/);
  s.tests['4.leak_test'].conditions.push({ measure: 'Leak result', kind: 'acceptance', operator: '<=', value: 1, unit: 'mm/s', basis: 'heuristic' });
  const md = renderRequirements(s);
  assert.ok(md.includes('| Rate | setup | ≤ 2 |'));
  assert.ok(md.includes('| Leak result | acceptance | ≤ 1 |'));
});

test('numbers render as unrounded plain decimals across magnitudes and fields', () => {
  const s = fixture();
  const values = [[1e-6, '0.000001'], [1e-7, '0.0000001'], [-1.25e-7, '-0.000000125'],
    [1e21, '1000000000000000000000'], [1.234e21, '1234000000000000000000'],
    [0, '0'], [-0, '0'], [0.12345678901234568, '0.12345678901234568']];
  for (const [value, expected] of values) {
    s.tests['4.leak_test'].conditions[0].value = value;
    assert.ok(renderRequirements(s).includes(`| Rate | acceptance | ≤ ${expected} |`));
  }
  s.ctqs[0] = { name: 'Small', nominal: 2e-7, lsl: 1e-7, usl: 3e-7, unit: 'mm', basis: 'heuristic' };
  s.tests['4.leak_test'].conditions[0] = { measure: 'Range', kind: 'acceptance', operator: 'between', value: [1e-7, 3e-7], unit: 'mm', basis: 'heuristic' };
  s.need_by_weeks = 1e-7;
  s.peak_weekly_demand = 1e21;
  const md = renderRequirements(s);
  assert.ok(md.includes('| Small | 0.0000002 | 0.0000001 | 0.0000003 |'));
  assert.ok(md.includes('| Range | acceptance | 0.0000001 to 0.0000003 (inclusive) |'));
  assert.ok(md.includes('| Need-by lead time | 0.0000001 |'));
  assert.ok(md.includes('| Peak weekly demand | 1000000000000000000000 |'));
});

test('reviewed fixtures separate setup from results and use torque and one burst ratio', async () => {
  for (const [commodity, id, measure] of [
    ['cold_plate', '4.material_cert', 'Drawing material'],
    ['machined_part', '4.material_cert', 'Drawing material'],
    ['optics_cable', '4.workmanship_620', 'Drawing IPC/WHMA-A-620 class'],
    ['pcba', '4.ipc610_class', 'Drawing IPC-A-610 class']
  ]) {
    const conditions = (await sheet(commodity)).tests[id].conditions;
    assert.equal(conditions.find(c => c.measure === measure)?.kind, 'setup', `${commodity}: ${measure}`);
  }
  const cold = await sheet('cold_plate');
  assert.deepEqual(cold.tests['4.leak_test'].conditions.map(c => [c.measure, c.kind]), [
    ['Helium leak rate', 'acceptance'], ['Helium differential pressure', 'setup'], ['Test temperature', 'setup']
  ]);
  const burst = cold.tests['4.burst_pressure'].conditions;
  assert.deepEqual(burst.map(c => [c.measure, c.kind, c.operator, c.value, c.unit]), [
    ['Maximum operating pressure', 'setup', '=', 6, 'bar'],
    ['Proof / maximum operating pressure', 'acceptance', '>=', 3, 'ratio'],
    ['Proof hold time', 'setup', '>=', 60, 's'],
    ['Rupture during proof hold', 'acceptance', '=', false, 'boolean']
  ]);
  const ctqs = (await sheet('contract_mfg')).ctqs;
  assert.ok(!ctqs.some(c => /resistance/i.test(c.name)));
  assert.deepEqual(ctqs.find(c => c.name === 'Mounting fastener torque'), {
    name: 'Mounting fastener torque', nominal: 5, lsl: 4.5, usl: 5.5, unit: 'N·m', basis: 'heuristic'
  });
});

test('batch rendering validates all inputs before writing and sorts sibling outputs', async t => {
  const dir = await scratch(t);
  const a = fixture(); a.commodity = 'a';
  const z = fixture(); z.commodity = 'z';
  await writeFile(join(dir, 'a.json'), JSON.stringify(a));
  await writeFile(join(dir, 'z.json'), '{broken');
  await writeFile(join(dir, 'a.md'), 'sentinel');
  await assert.rejects(renderAllRequirements(dir), SyntaxError);
  assert.equal(await readFile(join(dir, 'a.md'), 'utf8'), 'sentinel');
  z.commodity = 'wrong';
  await writeFile(join(dir, 'z.json'), JSON.stringify(z));
  await assert.rejects(renderAllRequirements(dir), /commodity must match filename/);
  assert.equal(await readFile(join(dir, 'a.md'), 'utf8'), 'sentinel');
  z.commodity = 'z';
  await writeFile(join(dir, 'z.json'), JSON.stringify(z));
  assert.deepEqual(await renderAllRequirements(dir), ['a.md', 'z.md']);
  assert.equal(await readFile(join(dir, 'a.md'), 'utf8'), renderRequirements(a));
  assert.equal(await readFile(join(dir, 'z.md'), 'utf8'), renderRequirements(z));
});

test('CLI regeneration is byte-identical from another working directory', async t => {
  const dir = await scratch(t);
  const copyDirectory = join(dir, 'data/requirements');
  await mkdir(join(dir, 'sim'));
  await cp(directory, copyDirectory, { recursive: true });
  await cp(join(root, 'sim/render-requirements.mjs'), join(dir, 'sim/render-requirements.mjs'));
  const before = await Promise.all(profiles.map(({ key }) => readFile(join(copyDirectory, `${key}.md`))));
  const cwd = join(dir, 'elsewhere');
  await mkdir(cwd);
  for (let run = 0; run < 2; run++) {
    const result = execFileSync(process.execPath, [join(dir, 'sim/render-requirements.mjs')], { cwd, encoding: 'utf8' });
    assert.equal(result, 'Rendered 8 requirement sheets.\n');
    for (const [index, { key }] of profiles.entries()) {
      assert.deepEqual(await readFile(join(copyDirectory, `${key}.md`)), before[index]);
    }
  }
});

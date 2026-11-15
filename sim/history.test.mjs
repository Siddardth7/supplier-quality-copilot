import { storyMisses } from './stories.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm, readdir, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parseHistory, scorecard } from '../app/engine.js';
import { sampleWorld } from './world.mjs';
import { makeRng } from './rng.mjs';
import { AS_OF, HISTORY_COLUMNS, dayNumber, addDays, drawLotCount, drawBinomial, defectProbability,
  isRepeat, scarClosure, simulateSupplierHistory, simulateHistory, renderHistory, writeHistory } from './history.mjs';
const header = 'date,supplier_id,part_no,received_qty,rejected_qty,on_time,defect_found_at,failure_mode_code,scar_id,scar_opened,scar_closed';
const modes = ['FM-LEAK', 'FM-PLATING', 'FM-FLATNESS', 'FM-SOLDER', 'FM-LABEL', 'FM-DAMAGE'];
const suppliers = sampleWorld(101).active;
const parts = Object.fromEntries(await Promise.all([...new Set(suppliers.map(s => s.commodity))].map(async k => [k, JSON.parse(await readFile(new URL(`../data/requirements/${k}.json`, import.meta.url))).part_no])));
const rows101 = await simulateHistory(101);
const base = () => structuredClone(suppliers[0]);
const run = (supplier, seed = 101) => simulateSupplierHistory(supplier, parts[supplier.commodity], seed);
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const order = (a, b) => compare(a.date, b.date) || compare(a.supplier_id, b.supplier_id) || compare(a.part_no, b.part_no);
async function scratch(t) { const path = await mkdtemp(join(tmpdir(), 'sqc-history-')); t.after(() => rm(path, { recursive: true, force: true })); return path; }

test('history CSV covers six suppliers and eighteen bounded calendar months with valid lot records', () => {
  assert.equal(HISTORY_COLUMNS.join(','), header);
  const csv = renderHistory(rows101);
  assert.equal(csv.split('\n')[0], header); assert.ok(csv.endsWith('\n') && !csv.endsWith('\n\n'));
  assert.doesNotMatch(csv, /\r|[ \t]+\n/);
  assert.deepEqual(parseHistory(csv), rows101);
  assert.deepEqual([...new Set(rows101.map(r => r.supplier_id))].sort(), suppliers.map(s => s.id).sort());
  assert.deepEqual(rows101, [...rows101].sort(order));
  const scarIds = new Map();
  for (const supplier of suppliers) {
    const rows = rows101.filter(r => r.supplier_id === supplier.id);
    for (let m = 0; m < 18; m++) {
      const month = `${2025 + Math.floor((m + 4) / 12)}-${String((m + 4) % 12 + 1).padStart(2, '0')}`;
      const lots = rows.filter(r => r.date.startsWith(month));
      assert.ok(lots.length >= 4 && lots.length <= 12, `${supplier.id} ${month}`);
    }
    for (const row of rows) {
      assert.deepEqual(Object.keys(row), header.split(','));
      assert.ok(row.date >= '2025-05-01' && row.date <= '2026-10-31');
      assert.equal(row.part_no, parts[supplier.commodity]);
      assert.ok(Number.isInteger(row.received_qty) && row.received_qty >= 200 && row.received_qty <= 2000);
      assert.ok(Number.isInteger(row.rejected_qty) && row.rejected_qty >= 0 && row.rejected_qty <= row.received_qty);
      assert.ok([0, 1].includes(row.on_time));
      assert.equal(row.defect_found_at === 'none', row.rejected_qty === 0);
      assert.equal(row.failure_mode_code === null, row.rejected_qty === 0);
      if (row.rejected_qty) { assert.ok(['incoming', 'line', 'field'].includes(row.defect_found_at)); assert.ok(modes.includes(row.failure_mode_code)); }
      if (row.scar_id) {
        assert.match(row.scar_id, new RegExp(`^SCAR-${supplier.id}-\\d{4}$`));
        assert.ok(row.scar_opened <= row.date);
        assert.ok(row.scar_closed === null || row.scar_closed >= row.scar_opened && row.scar_closed <= AS_OF);
        // SCORECARD: every row with the same scar_id carries the same scar_opened and scar_closed.
        const first = scarIds.get(row.scar_id);
        if (first) assert.deepEqual([row.scar_opened, row.scar_closed], [first.scar_opened, first.scar_closed]);
        else { assert.equal(row.scar_opened, row.date); scarIds.set(row.scar_id, row); }
      } else { assert.equal(row.scar_opened, null); assert.equal(row.scar_closed, null); }
    }
  }
  assert.ok(scarIds.size > 0);
});

test('Gregorian arithmetic respects leap centuries month ends and invalid dates', () => {
  for (const [start, days, end] of [['2025-12-31', 1, '2026-01-01'], ['2028-02-28', 1, '2028-02-29'], ['2028-02-28', 2, '2028-03-01'], ['2100-02-28', 1, '2100-03-01'], ['2000-02-28', 1, '2000-02-29'], ['2026-10-01', 0, '2026-10-01'], ['2026-05-01', 180, '2026-10-28']]) {
    assert.equal(addDays(start, days), end); assert.equal(dayNumber(end) - dayNumber(start), days);
  }
  for (const date of ['2025-02-29', '2026-04-31', '2026-00-01', '0000-01-01', '2026-1-01', 'x']) assert.throws(() => dayNumber(date), /date/i);
  for (const delay of [-1, 0.5, NaN, Infinity]) assert.throws(() => addDays('2026-01-01', delay), /days/);
  assert.throws(() => addDays('9999-12-31', 1), /years/);
});

test('lot count rejects out-of-bound Poisson draws rather than clamping', () => {
  const values = [0, 3, 13, 4, 12]; let calls = 0;
  const rng = { poisson: mean => { assert.equal(mean, 8); calls++; return values.shift(); } };
  assert.equal(drawLotCount(rng, 8), 4); assert.equal(calls, 4);
  assert.equal(drawLotCount(rng, 8), 12); assert.equal(calls, 5);
  for (const mean of [3.99, 12.01, NaN]) assert.throws(() => drawLotCount(rng, mean), /lots_per_month/);
});

test('exact binomial handles endpoints symmetry bounds and small-probability mass', () => {
  const untouched = { next: () => assert.fail('endpoint consumed randomness') };
  assert.equal(drawBinomial(untouched, 2000, 0), 0); assert.equal(drawBinomial(untouched, 2000, 1), 2000);
  assert.equal(drawBinomial(makeRng(1), 0, 0.2), 0);
  for (let seed = 0; seed < 30; seed++) assert.equal(drawBinomial(makeRng(seed), 200, 0.75), 200 - drawBinomial(makeRng(seed), 200, 0.25));
  const rng = makeRng(317); let total = 0, zero = 0;
  for (let i = 0; i < 20000; i++) { const n = drawBinomial(rng, 1000, 0.001); assert.ok(Number.isInteger(n) && n >= 0 && n <= 1000); total += n; zero += Number(n === 0); }
  // Binomial mean n*p=1 and P(0)=(1-p)^n, tolerances wider than six standard errors.
  assert.ok(Math.abs(total / 20000 - 1) < 0.05);
  assert.ok(Math.abs(zero / 20000 - 0.999 ** 1000) < 0.025);
  for (const [n, p] of [[-1, 0.5], [2001, 0.5], [1.5, 0.5], [10, -0.1], [10, 1.1], [10, NaN]]) assert.throws(() => drawBinomial(rng, n, p), /binomial/);
});

test('quality probabilities use monthly noise creep onset and one selected spike lot', () => {
  const stable = { kind: 'stable', base_rate: 0.01 };
  assert.equal(defectProbability(stable, 1, 0.002), 0.012);
  assert.equal(defectProbability(stable, 1, -0.02), 0);
  assert.equal(defectProbability(stable, 1, 2), 1);
  const creep = { ...stable, kind: 'creep', start_month: 12, monthly_increase: 0.001 };
  assert.equal(defectProbability(creep, 11, 0), 0.01);
  assert.equal(defectProbability(creep, 12, 0), 0.011);
  assert.equal(defectProbability(creep, 13, 0), 0.012);
  const spike = { ...stable, kind: 'spike', spike_month: 9, spike_rate: 0.1 };
  assert.equal(defectProbability(spike, 8, 0, true), 0.01);
  assert.equal(defectProbability(spike, 9, 0, false), 0.01);
  assert.equal(defectProbability(spike, 9, 0.001, true), 0.101);
  const rows = run(suppliers[2]); const rejecting = rows.filter(r => r.rejected_qty > 0);
  assert.equal(rejecting.length, 1); assert.ok(rejecting[0].date.startsWith('2026-01'));
});

test('generation draws one noise term per month with fixed setup-free receipt counts', async t => {
  const dir = await scratch(t);
  for (const folder of ['sim', 'app']) await cp(new URL(`../${folder}`, import.meta.url), join(dir, folder), { recursive: true });
  // A recording RNG controls observations without changing the simulator under test.
  await writeFile(join(dir, 'sim/rng.mjs'), `export const calls=[]; export function makeRng(){return {poisson:()=>4,normal:(mean,sd)=>{calls.push([mean,sd]);return mean;},int:(min)=>min,next:()=>0.999,bernoulli:p=>p===1,pick:a=>a[0]};}\n`);
  const copied = await import(pathToFileURL(join(dir, 'sim/history.mjs')));
  const recorder = await import(pathToFileURL(join(dir, 'sim/rng.mjs')));
  const supplier = base(); supplier.traits.quality_pattern.noise_sd = 0.00001;
  const rows = copied.simulateSupplierHistory(supplier, 'SI-TEST', 1);
  assert.equal(rows.length, 18 * 4);
  assert.deepEqual(recorder.calls, Array.from({ length: 18 }, () => [0, 0.00001]));
});

test('repeat detection includes only matching earlier NCs one through 180 days old', () => {
  const prior = { date: '2026-05-01', supplier_id: 'ACT-01', rejected_qty: 1, failure_mode_code: 'FM-LEAK' };
  for (const [date, expected] of [['2026-04-30', false], ['2026-05-01', false], ['2026-05-02', true], ['2026-10-28', true], ['2026-10-29', false]]) assert.equal(isRepeat({ ...prior, date }, [prior]), expected, date);
  const current = { ...prior, date: '2026-05-02' };
  for (const patch of [{ supplier_id: 'ACT-02' }, { failure_mode_code: 'FM-DAMAGE' }, { rejected_qty: 0 }]) assert.equal(isRepeat(current, [{ ...prior, ...patch }]), false);
  assert.equal(isRepeat({ ...current, rejected_qty: 0 }, [prior]), false);
  assert.equal(isRepeat(current, [prior, { ...current }]), true); // Same-day row must not hide yesterday.
});

test('SCAR closure rounds clamps and retains the as-of boundary only', () => {
  const draw = n => ({ normal: (mean, sd) => { assert.equal(mean, 10); assert.equal(sd, 3); return n; } });
  for (const [n, date] of [[-5, '2026-10-20'], [0, '2026-10-20'], [0.49, '2026-10-20'], [0.5, '2026-10-21'], [12, '2026-11-01'], [13, null]]) assert.equal(scarClosure('2026-10-20', 10, 3, draw(n)), date);
  assert.throws(() => scarClosure('2026-10-01', 0, 3, draw(0)), /response/);
  assert.throws(() => scarClosure('2026-10-01', 10, 31, draw(0)), /response/);
});

test('generated SCARs follow strict quantity trigger or chronological repeated code', () => {
  const supplier = structuredClone(suppliers[4]);
  const raw = run(supplier), first = raw.find(r => r.rejected_qty > 0);
  supplier.traits.scar_trigger = first.rejected_qty;
  const equal = run(supplier).find(r => r.date === first.date && r.rejected_qty > 0);
  assert.equal(equal.scar_id, null);
  supplier.traits.scar_trigger--;
  assert.ok(run(supplier).find(r => r.date === first.date && r.rejected_qty > 0).scar_id);
  for (const supplier of suppliers) {
    const prior = [];
    for (const row of rows101.filter(r => r.supplier_id === supplier.id)) {
      const repeated = row.rejected_qty > 0 && prior.some(p => p.rejected_qty > 0 && p.failure_mode_code === row.failure_mode_code && dayNumber(row.date) - dayNumber(p.date) >= 1 && dayNumber(row.date) - dayNumber(p.date) <= 180);
      assert.equal(Boolean(row.scar_id), row.rejected_qty > 0 && (row.rejected_qty > supplier.traits.scar_trigger || repeated));
      prior.push(row);
    }
  }
});

// SCAR reuse (SIMULATION.md §4): a controlled ACT-05 copy where every lot rejects and every
// rejecting lot qualifies through the quantity trigger, so reuse is the only thing that groups rows.
const scarSupplier = patch => {
  const s = structuredClone(suppliers[4]);
  Object.assign(s.traits, { failure_pattern: 'repeat', repeat_probability: 1, scar_trigger: 0, response_days: 180, sd: 0 }, patch);
  s.traits.quality_pattern.base_rate = 0.02;
  return s;
};
const scarId = n => `SCAR-ACT-05-${String(n).padStart(4, '0')}`;
const firstRows = rows => { const first = new Map(); for (const r of rows) if (r.scar_id && !first.has(r.scar_id)) first.set(r.scar_id, r); return [...first.values()]; };

test('a qualifying lot reuses the SCAR open for its mode, including quantity-trigger lots', () => {
  const rows = run(scarSupplier()), rejecting = rows.filter(r => r.rejected_qty > 0), first = rejecting[0];
  assert.equal(rejecting.length, rows.length); assert.ok(rejecting.every(r => r.scar_id && r.rejected_qty > 0));
  const closed = addDays(first.date, 180), window = rejecting.filter(r => r.date < closed);
  assert.ok(window.length > 1);
  for (const row of window) assert.deepEqual([row.scar_id, row.scar_opened, row.scar_closed], [scarId(1), first.date, closed]);
  // Eighteen months of 180-day SCARs on one mode leave only a handful of distinct SCARs.
  assert.ok(new Set(rejecting.map(r => r.scar_id)).size <= 4);
});

test('a lot on or after the closure date of its mode SCAR opens the next numbered SCAR', () => {
  const rows = run(scarSupplier({ response_days: 5 })), firsts = firstRows(rows);
  assert.ok(firsts.length > 10);
  firsts.forEach((row, i) => {
    assert.equal(row.scar_id, scarId(i + 1)); assert.equal(row.scar_opened, row.date);
    assert.equal(row.scar_closed, addDays(row.date, 5) <= AS_OF ? addDays(row.date, 5) : null);
    if (i) assert.ok(row.date >= firsts[i - 1].scar_closed, `${row.scar_id} opened while ${firsts[i - 1].scar_id} was open`);
  });
  for (const row of rows) {
    const owner = firsts.find(f => f.scar_id === row.scar_id);
    assert.ok(row.date >= owner.scar_opened && (owner.scar_closed === null || row.date < owner.scar_closed));
  }
  // Same-day closure counts as closed: a lot received exactly on a closure date gets a new SCAR.
  const boundary = rows.filter(r => firsts.some(f => f.scar_closed === r.date));
  assert.ok(boundary.length > 0);
  for (const row of boundary) assert.ok(firsts.some(f => f.scar_closed === row.date && f.scar_id !== row.scar_id));
});

test('different failure modes open their own SCARs that can be open at once', () => {
  const rows = run(scarSupplier({ failure_pattern: 'mixed', repeat_probability: 0 })), firsts = firstRows(rows);
  const modeOf = new Map();
  for (const row of rows) {
    if (!modeOf.has(row.scar_id)) modeOf.set(row.scar_id, row.failure_mode_code);
    assert.equal(modeOf.get(row.scar_id), row.failure_mode_code, row.scar_id);
  }
  assert.deepEqual([...new Set(modeOf.values())].sort(), [...suppliers[4].traits.failure_modes].sort());
  const openOn = (f, date) => f.scar_opened <= date && (f.scar_closed === null || f.scar_closed > date);
  const overlap = rows.find(r => new Set(firsts.filter(f => openOn(f, r.date)).map(f => f.failure_mode_code)).size > 1);
  assert.ok(overlap);
  const open = firsts.filter(f => openOn(f, overlap.date));
  assert.equal(new Set(open.map(f => f.scar_id)).size, open.length);
});

test('SCAR IDs are numbered per supplier from 0001 in order of opening', async () => {
  for (const rows of [rows101, ...await Promise.all([1, 2, 3, 4, 5].map(seed => simulateHistory(seed)))]) {
    for (const supplier of new Set(rows.map(r => r.supplier_id))) {
      const firsts = firstRows(rows.filter(r => r.supplier_id === supplier));
      firsts.forEach((row, i) => {
        assert.equal(row.scar_id, `SCAR-${supplier}-${String(i + 1).padStart(4, '0')}`);
        if (i) assert.ok(row.scar_opened >= firsts[i - 1].scar_opened);
      });
    }
  }
});

test('SCAR response traits change only SCAR columns, never lot generation', () => {
  const lotColumns = rows => rows.map(r => HISTORY_COLUMNS.filter(k => !k.startsWith('scar_')).map(k => r[k]));
  const fast = structuredClone(suppliers[4]), slow = structuredClone(suppliers[4]);
  Object.assign(fast.traits, { response_days: 5, sd: 0 }); Object.assign(slow.traits, { response_days: 180, sd: 30 });
  const a = run(fast), b = run(slow);
  assert.deepEqual(lotColumns(a), lotColumns(b));
  assert.notDeepEqual(a.map(r => r.scar_closed), b.map(r => r.scar_closed));
});

test('a reused SCAR makes no closure draw', async t => {
  const dir = await scratch(t);
  for (const folder of ['sim', 'app']) await cp(new URL(`../${folder}`, import.meta.url), join(dir, folder), { recursive: true });
  await writeFile(join(dir, 'sim/rng.mjs'), `export const calls=[]; export function makeRng(){return {poisson:()=>4,normal:(mean,sd)=>{calls.push([mean,sd]);return mean;},int:(min)=>min,next:()=>0.999,bernoulli:p=>p===1,pick:a=>a[0]};}\n`);
  const copied = await import(pathToFileURL(join(dir, 'sim/history.mjs')));
  const recorder = await import(pathToFileURL(join(dir, 'sim/rng.mjs')));
  const rows = copied.simulateSupplierHistory(scarSupplier({ received_qty: [2000, 2000], response_days: 60, sd: 5 }), 'SI-TEST', 1);
  const ids = new Set(rows.map(r => r.scar_id));
  assert.ok(rows.every(r => r.scar_id) && ids.size > 1 && ids.size < rows.length);
  // One closure draw per SCAR opened; reused rows copy the dates.
  assert.equal(recorder.calls.filter(([mean, sd]) => mean === 60 && sd === 5).length, ids.size);
});

test('detection and failure patterns obey pinned endpoints while delivery is independent', () => {
  const supplier = base(); supplier.traits.quality_pattern.base_rate = 0.02;
  for (const location of ['incoming', 'line', 'field']) {
    supplier.traits.detection = Object.fromEntries(['incoming', 'line', 'field'].map(k => [k, Number(k === location)]));
    const rows = run(supplier); assert.ok(rows.some(r => r.rejected_qty > 0));
    assert.ok(rows.filter(r => r.rejected_qty > 0).every(r => r.defect_found_at === location));
  }
  supplier.traits.failure_pattern = 'repeat'; supplier.traits.repeat_probability = 1;
  assert.ok(run(supplier).filter(r => r.rejected_qty > 0).every(r => r.failure_mode_code === modes[0]));
  supplier.traits.repeat_probability = 0;
  const codes = new Set(run(supplier).filter(r => r.rejected_qty > 0).map(r => r.failure_mode_code));
  assert.deepEqual([...codes].sort(), [...modes].sort());
  const clean = base(); clean.traits.on_time_rate = 0;
  assert.ok(run(clean).every(r => r.on_time === 0 && r.rejected_qty === 0));
  clean.traits.on_time_rate = 1; assert.ok(run(clean).every(r => r.on_time === 1));
});

test('history validates sampled domains identities and inactive pattern fields', () => {
  for (const seed of [-1, 2 ** 32, 1.5, NaN, '1']) assert.throws(() => run(base(), seed), /seed/i);
  for (const id of ['SUP-01', 'ACT-1', '', null]) { const s = base(); s.id = id; assert.throws(() => run(s), /supplier/); }
  for (const part of ['', 'bad,part', 'SI\nPART', ' SI-PART']) assert.throws(() => simulateSupplierHistory(base(), part, 1), /part/);
  const patches = [
    { lots_per_month: 3.9 }, { lots_per_month: Infinity }, { received_qty: [199, 2000] }, { received_qty: [2001, 2000] }, { received_qty: [200, 2000.5] },
    { on_time_rate: -0.01 }, { scar_trigger: 1.5 }, { response_days: 181 }, { sd: -1 },
    { detection: { incoming: 0.5, line: 0, field: 0 } }, { detection: { incoming: NaN, line: 0, field: 1 } },
    { failure_modes: [] }, { failure_modes: ['FM-UNKNOWN'] }, { failure_modes: ['FM-LEAK', 'FM-LEAK'] },
    { failure_pattern: 'x' }, { repeat_probability: 0.5 },
  ];
  for (const patch of patches) { const s = base(); Object.assign(s.traits, patch); assert.throws(() => run(s), /Invalid/); }
  for (const patch of [{ kind: 'x' }, { base_rate: -0.01 }, { noise_sd: 0.001 }, { start_month: 12 }, { monthly_increase: 0.001 }, { spike_month: 9 }, { spike_rate: 0.01 }, { kind: 'creep', start_month: 6 }, { kind: 'spike', spike_month: 19 }]) {
    const s = base(); Object.assign(s.traits.quality_pattern, patch); assert.throws(() => run(s), /Invalid/);
  }
});

test('CSV renderer rejects unsafe cells malformed fields and every scorecard row rule', () => {
  const row = structuredClone(rows101[0]);
  for (const patch of [{ extra: 1 }, { part_no: 'SI,PART' }, { part_no: ' SI-PART' }, { part_no: 'SI\nPART' }, { received_qty: '200' }, { received_qty: 0 }, { rejected_qty: -1 }, { rejected_qty: 2001 }, { on_time: 2 }, { date: '2026-02-30' }, { defect_found_at: 'field' }, { failure_mode_code: 'FM-LEAK' }, { scar_id: 'SCAR-X' }, { scar_opened: '2026-01-01' }, { scar_closed: '2026-01-01' }]) assert.throws(() => renderHistory([{ ...row, ...patch }]), /row/i);
  assert.throws(() => renderHistory([{ ...row, rejected_qty: 1 }]), /row/i);
  assert.throws(() => renderHistory([{ ...row, scar_id: 'SCAR-X', scar_opened: '2026-02-02', scar_closed: '2026-02-01' }]), /row/i);
  const opened = { ...row, scar_id: 'SCAR-X', scar_opened: '2026-01-01' };
  assert.throws(() => renderHistory([opened, { ...opened, scar_opened: '2026-01-02' }]), /row/i);
});

test('seeded supplier histories preserve inputs and ignore other suppliers and targets', async () => {
  const supplier = structuredClone(suppliers[4]), before = structuredClone(supplier);
  const a = run(supplier); assert.deepEqual(supplier, before);
  supplier.target = { story: 'unrelated' }; supplier.archetype = 'unrelated';
  assert.deepEqual(run(supplier), a);
  run(suppliers[2], 3); assert.deepEqual(run(supplier), a);
  assert.deepEqual(rows101.filter(r => r.supplier_id === supplier.id), a);
  assert.deepEqual(await simulateHistory(101), rows101);
  assert.notEqual(renderHistory(await simulateHistory(102)), renderHistory(rows101));
  assert.ok((await simulateHistory(0)).length > 0);
});

test('writer CLI is byte-identical across directories and bad arguments create no output', async t => {
  const dir = await scratch(t), a = join(dir, 'a/history.csv'), b = join(dir, 'b/history.csv');
  const written = await writeHistory(101, a); assert.deepEqual(written, rows101);
  const script = fileURLToPath(new URL('./history.mjs', import.meta.url));
  const output = execFileSync(process.execPath, [script, '--seed', '101', '--out', b], { cwd: dir, encoding: 'utf8' });
  assert.match(output, /seed=101 suppliers=6 months=18 lots=\d+ rejects=\d+/);
  assert.deepEqual(await readFile(a), await readFile(b));
  assert.equal(await readFile(a, 'utf8'), renderHistory(rows101));
  for (const args of [['--seed', '-1'], ['--seed', '4294967296'], ['--seed', 'NaN'], ['--seed', '1.2'], ['--seed', '1', '--extra', 'x']]) assert.throws(() => execFileSync(process.execPath, [script, ...args, '--out', join(dir, 'invalid/history.csv')], { cwd: dir, stdio: 'pipe' }));
  await assert.rejects(writeHistory(-1, join(dir, 'invalid/history.csv')));
  assert.deepEqual((await readdir(dir)).sort(), ['a', 'b']);
  const imported = execFileSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(pathToFileURL(script).href)});`], { cwd: dir, encoding: 'utf8' });
  assert.equal(imported, ''); assert.deepEqual((await readdir(dir)).sort(), ['a', 'b']);
});

// Story clauses straight from SCORECARD's active-supplier story table. Returns the clauses a
// supplier result misses, so the fixture tests name the broken clause and the hit-rate test counts.
// Seed 24 is a history-only regression fixture, not the final combined demo seed: the first
// ascending seed where all six stories pass under the current archetypes (SIMULATION.md §5).
for (const id of ['ACT-01', 'ACT-02', 'ACT-03', 'ACT-04', 'ACT-05', 'ACT-06']) test(`generated CSV seed 24 satisfies every ${id} story clause`, async t => {
  const dir = await scratch(t), path = join(dir, 'history.csv');
  await writeHistory(24, path);
  const result = scorecard(parseHistory(await readFile(path, 'utf8')), { as_of: AS_OF });
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(storyMisses(id, result.suppliers.find(s => s.supplier_id === id)), []);
});

// Hit-rate floors are the counts measured for seeds 1-200 with the committed archetypes (SIMULATION.md §5).
// ACT-02 is a selected-seed story: its creep cannot pass most seeds, so its floor is low on purpose.
test('story hit rate over generated CSV seeds 1-200 stays at the measured floors', async () => {
  const floors = { 'ACT-01': 200, 'ACT-02': 4, 'ACT-03': 200, 'ACT-04': 199, 'ACT-05': 196, 'ACT-06': 200 };
  const passes = Object.fromEntries(Object.keys(floors).map(id => [id, 0]));
  for (let seed = 1; seed <= 200; seed++) {
    const result = scorecard(parseHistory(renderHistory(await simulateHistory(seed))), { as_of: AS_OF });
    assert.deepEqual(result.warnings, [], `seed ${seed} warnings`);
    for (const id of Object.keys(floors)) passes[id] += storyMisses(id, result.suppliers.find(s => s.supplier_id === id)).length === 0;
  }
  for (const [id, floor] of Object.entries(floors)) assert.ok(passes[id] >= floor, `${id} passed ${passes[id]}/200, floor ${floor}: ${JSON.stringify(passes)}`);
});

// Negative fixtures: seeds whose generated CSV misses a story, with the exact clauses the engine result breaks.
// Seed 27 is the only one that isolates an early run7 from a missing M18 run7.
test('generated CSV seeds that miss a story name the exact broken clauses', async () => {
  const expected = [
    [1, 'ACT-02', ['run7 M18', 'no ucl M7+']], [2, 'ACT-02', ['run7 M18', 'no run7 before M18']],
    [19, 'ACT-02', ['run7 M18', 'dppm not bad', 'no ucl M7+']], [27, 'ACT-02', ['no run7 before M18']],
    [147, 'ACT-04', ['tier B', 'otd metric_bad M18']], [63, 'ACT-05', ['tier C', 'dppm watch']],
  ];
  for (const [seed, id, misses] of expected) {
    const result = scorecard(parseHistory(renderHistory(await simulateHistory(seed))), { as_of: AS_OF });
    assert.deepEqual(storyMisses(id, result.suppliers.find(s => s.supplier_id === id)), misses, `seed ${seed} ${id}`);
  }
});

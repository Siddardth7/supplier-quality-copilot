import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseHistory } from '../app/engine.js';
import { makeRng } from './rng.mjs';
import { subSeed, validateSeed } from './seed.mjs';
import { sampleWorld } from './world.mjs';

export const AS_OF = '2026-11-01';
export const HISTORY_COLUMNS = Object.freeze(['date', 'supplier_id', 'part_no', 'received_qty', 'rejected_qty', 'on_time', 'defect_found_at', 'failure_mode_code', 'scar_id', 'scar_opened', 'scar_closed']);
const MODES = ['FM-LEAK', 'FM-PLATING', 'FM-FLATNESS', 'FM-SOLDER', 'FM-LABEL', 'FM-DAMAGE'];
const check = (ok, message) => { if (!ok) throw new TypeError(message); };
const bounded = (x, min, max) => Number.isFinite(x) && x >= min && x <= max;
const integer = (x, min, max) => Number.isInteger(x) && bounded(x, min, max);
const leap = y => y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
const monthDays = (y, m) => [31, leap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
const iso = (y, m, d) => `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
function civil(date) {
  check(typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date), 'Invalid ISO date');
  const [y, m, d] = date.split('-').map(Number);
  check(integer(y, 1, 9999) && integer(m, 1, 12) && integer(d, 1, monthDays(y, m)), 'Invalid ISO date');
  return [y, m, d];
}
export function dayNumber(date) {
  const [y, m, d] = civil(date), previous = y - 1;
  let day = 365 * previous + Math.floor(previous / 4) - Math.floor(previous / 100) + Math.floor(previous / 400) + d;
  for (let month = 1; month < m; month++) day += monthDays(y, month);
  return day;
}
export function addDays(date, days) {
  check(Number.isSafeInteger(days) && days >= 0, 'Invalid elapsed days');
  let [y, m, d] = civil(date);
  while (days > monthDays(y, m) - d) {
    days -= monthDays(y, m) - d + 1; d = 1;
    if (++m > 12) { m = 1; y++; }
    check(y <= 9999, 'Date exceeds supported years');
  }
  return iso(y, m, d + days);
}

export function drawLotCount(rng, mean) {
  check(bounded(mean, 4, 12), 'Invalid lots_per_month');
  let count;
  do { count = rng.poisson(mean); } while (count < 4 || count > 12);
  return count;
}
// Geometric waiting times count successes without a draw for every received part.
export function drawBinomial(rng, quantity, probability) {
  check(integer(quantity, 0, 2000) && bounded(probability, 0, 1), 'Invalid binomial inputs');
  if (probability === 0) return 0;
  if (probability === 1) return quantity;
  if (probability > 0.5) return quantity - drawBinomial(rng, quantity, 1 - probability);
  const logFailure = Math.log1p(-probability);
  let position = 0, count = 0;
  while (true) {
    position += Math.floor(Math.log1p(-rng.next()) / logFailure) + 1;
    if (position > quantity) return count;
    count++;
  }
}
export function defectProbability(pattern, month, noise, spikeLot = false) {
  let probability = pattern.base_rate;
  if (pattern.kind === 'creep' && month >= pattern.start_month) probability += pattern.monthly_increase * (month - pattern.start_month + 1);
  if (pattern.kind === 'spike' && month === pattern.spike_month && spikeLot) probability = pattern.spike_rate;
  return Math.min(1, Math.max(0, probability + noise));
}
export function isRepeat(row, earlier) {
  const day = dayNumber(row.date);
  return row.rejected_qty > 0 && earlier.some(previous => {
    const elapsed = day - dayNumber(previous.date);
    return previous.rejected_qty > 0 && previous.supplier_id === row.supplier_id
      && previous.failure_mode_code === row.failure_mode_code && elapsed >= 1 && elapsed <= 180;
  });
}
export function scarClosure(opened, responseDays, sd, rng) {
  check(bounded(responseDays, 1, 180) && bounded(sd, 0, 30), 'Invalid SCAR response parameters');
  const closed = addDays(opened, Math.max(0, Math.round(rng.normal(responseDays, sd))));
  return closed <= AS_OF ? closed : null;
}
function validateSupplier(supplier, partNo, seed) {
  validateSeed(seed);
  check(/^ACT-\d{2}$/.test(supplier?.id), 'Invalid active supplier ID');
  check(typeof partNo === 'string' && /^[A-Z0-9][A-Z0-9._-]*$/.test(partNo), 'Invalid fictional part number');
  const t = supplier.traits;
  check(t && typeof t === 'object', 'Missing supplier traits');
  for (const [name, min, max] of [['lots_per_month', 4, 12], ['repeat_probability', 0, 1], ['on_time_rate', 0, 1], ['response_days', 1, 180], ['sd', 0, 30]]) {
    check(bounded(t[name], min, max), `Invalid ${name}`);
  }
  check(integer(t.scar_trigger, 0, 2000), 'Invalid scar_trigger');
  check(Array.isArray(t.received_qty) && t.received_qty.length === 2 && t.received_qty.every(n => integer(n, 200, 2000)) && t.received_qty[0] <= t.received_qty[1], 'Invalid received_qty');
  check(['mixed', 'repeat'].includes(t.failure_pattern) && (t.failure_pattern !== 'mixed' || t.repeat_probability === 0), 'Invalid failure_pattern');
  check(Array.isArray(t.failure_modes) && t.failure_modes.length > 0 && new Set(t.failure_modes).size === t.failure_modes.length && t.failure_modes.every(mode => MODES.includes(mode)), 'Invalid failure_modes');
  const d = t.detection;
  check(d && Object.keys(d).sort().join(',') === 'field,incoming,line' && Object.values(d).every(p => bounded(p, 0, 1)) && Math.abs(d.incoming + d.line + d.field - 1) < 1e-12, 'Invalid detection');
  const p = t.quality_pattern;
  check(p && ['stable', 'creep', 'spike'].includes(p.kind), 'Invalid quality_pattern.kind');
  for (const [name, max] of [['base_rate', 0.02], ['monthly_increase', 0.005], ['spike_rate', 0.2], ['noise_sd', 0.0001]]) check(bounded(p[name], 0, max), `Invalid quality_pattern.${name}`);
  check(p.kind === 'creep' ? integer(p.start_month, 7, 18) : p.start_month === null && p.monthly_increase === 0, 'Invalid creep parameters');
  check(p.kind === 'spike' ? integer(p.spike_month, 7, 18) : p.spike_month === null && p.spike_rate === 0, 'Invalid spike parameters');
}
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const compareRows = (a, b) => compare(a.date, b.date) || compare(a.supplier_id, b.supplier_id) || compare(a.part_no, b.part_no);

export function simulateSupplierHistory(supplier, partNo, seed) {
  validateSupplier(supplier, partNo, seed);
  const rng = makeRng(subSeed(seed, `${supplier.id}:history`)), t = supplier.traits, lots = [];
  for (let month = 1; month <= 18; month++) {
    const calendar = 2025 * 12 + 4 + month - 1, y = Math.floor(calendar / 12), m = calendar % 12 + 1;
    const count = drawLotCount(rng, t.lots_per_month), noise = rng.normal(0, t.quality_pattern.noise_sd);
    const spike = t.quality_pattern.kind === 'spike' && month === t.quality_pattern.spike_month ? rng.int(0, count - 1) : -1;
    for (let lot = 0; lot < count; lot++) {
      const date = iso(y, m, rng.int(1, monthDays(y, m))), received_qty = rng.int(...t.received_qty);
      const rejected_qty = drawBinomial(rng, received_qty, defectProbability(t.quality_pattern, month, noise, lot === spike));
      const on_time = Number(rng.bernoulli(t.on_time_rate));
      let defect_found_at = 'none', failure_mode_code = null;
      if (rejected_qty > 0) {
        const detection = rng.next();
        defect_found_at = detection < t.detection.incoming ? 'incoming' : detection < t.detection.incoming + t.detection.line ? 'line' : 'field';
        failure_mode_code = t.failure_pattern === 'repeat' && rng.bernoulli(t.repeat_probability) ? t.failure_modes[0] : rng.pick(t.failure_modes);
      }
      lots.push({ index: lots.length + 1, row: { date, supplier_id: supplier.id, part_no: partNo, received_qty, rejected_qty, on_time, defect_found_at, failure_mode_code, scar_id: null, scar_opened: null, scar_closed: null } });
    }
  }
  lots.sort((a, b) => compareRows(a.row, b.row) || a.index - b.index);
  const earlier = [], scars = [];
  for (const { row } of lots) {
    if (row.rejected_qty > 0 && (row.rejected_qty > t.scar_trigger || isRepeat(row, earlier))) {
      // A qualifying lot joins the SCAR already open for its failure mode on its receipt date (same-day closure counts as closed).
      let scar = scars.find(s => s.mode === row.failure_mode_code && s.opened <= row.date && (s.closed === null || s.closed > row.date));
      if (!scar) {
        scar = { id: `SCAR-${supplier.id}-${String(scars.length + 1).padStart(4, '0')}`, mode: row.failure_mode_code, opened: row.date, closed: scarClosure(row.date, t.response_days, t.sd, rng) };
        scars.push(scar);
      }
      row.scar_id = scar.id; row.scar_opened = scar.opened; row.scar_closed = scar.closed;
    }
    if (row.rejected_qty > 0) earlier.push(row);
  }
  return lots.map(lot => lot.row);
}
export async function simulateHistory(seed) {
  const { active } = sampleWorld(seed), parts = new Map(), rows = [];
  for (const supplier of active) {
    if (!parts.has(supplier.commodity)) {
      const sheet = JSON.parse(await readFile(new URL(`../data/requirements/${supplier.commodity}.json`, import.meta.url), 'utf8'));
      parts.set(supplier.commodity, sheet.part_no);
    }
    rows.push(...simulateSupplierHistory(supplier, parts.get(supplier.commodity), seed));
  }
  return rows.sort(compareRows);
}
export function renderHistory(rows) {
  check(Array.isArray(rows), 'History rows must be an array');
  const lines = rows.map((row, i) => {
    check(row && Object.keys(row).sort().join(',') === [...HISTORY_COLUMNS].sort().join(','), `row ${i + 2}: expected exact history fields`);
    return HISTORY_COLUMNS.map(key => {
      const value = row[key];
      check(value === null || typeof value === 'string' || typeof value === 'number', `row ${i + 2}: invalid ${key}`);
      check(typeof value !== 'string' || (!/[\r\n,"]/.test(value) && value === value.trim()), `row ${i + 2}: unsafe CSV ${key}`);
      if (['received_qty', 'rejected_qty', 'on_time'].includes(key)) check(typeof value === 'number', `row ${i + 2}: numeric ${key} required`);
      return value === null ? '' : String(value);
    }).join(',');
  });
  const csv = [HISTORY_COLUMNS.join(','), ...lines].join('\n') + '\n';
  parseHistory(csv);
  return csv;
}
export async function writeHistory(seed, outputPath) {
  check(typeof outputPath === 'string' && outputPath.length > 0, 'Output path required');
  const rows = await simulateHistory(seed), csv = renderHistory(rows);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, csv);
  return rows;
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const args = process.argv.slice(2);
  check(args.length === 4 && args[0] === '--seed' && /^\d+$/.test(args[1]) && args[2] === '--out' && args[3].length > 0, 'Usage: node sim/history.mjs --seed <uint32> --out <history.csv>');
  const seed = Number(args[1]), rows = await writeHistory(seed, args[3]);
  console.log(`seed=${seed} suppliers=${new Set(rows.map(row => row.supplier_id)).size} months=18 lots=${rows.length} rejects=${rows.reduce((sum, row) => sum + row.rejected_qty, 0)}`);
}

// p-chart and the ucl / run7 alerts (#22; SCORE-FR-06, SCORE-FR-07 ucl/run7 part, SCORE-AC-04). Every
// expected value is derived by hand from docs/SCORECARD.md (§ p-chart, § Alerts) and PRD-02 §5; the working
// is in the comments, never copied from engine output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scorecard } from './engine.js';
import { STARK_REFERENCE } from './rubric.js';

// as_of 2026-11-01: M1 2025-05 ... M6 2025-10 (baseline), M7 2025-11 ... M18 2026-10 (monitoring).
const AS_OF = '2026-11-01';
const MONTH = Object.fromEntries(['2025-05', '2025-06', '2025-07', '2025-08', '2025-09', '2025-10', '2025-11',
  '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09',
  '2026-10'].map((m, i) => [i + 1, m]));
const PBAR = 'p̄'; // p + U+0304 combining macron, as in PRD-02 §5
const DASH = '–'; // en dash

const lot = (o = {}) => ({ date: '2026-10-15', supplier_id: 'ACT-01', part_no: 'P1', received_qty: 1000,
  rejected_qty: 0, on_time: 1, defect_found_at: 'none', failure_mode_code: null, scar_id: null,
  scar_opened: null, scar_closed: null, ...o });
const nc = (o = {}) => lot({ rejected_qty: 1, defect_found_at: 'incoming', failure_mode_code: 'FM-X', ...o });
// One lot in month k (dated the 15th). A distinct failure code per month keeps repeat NC at 0.
const mrow = (k, rejected, n = 1000, o = {}) => (rejected === 0
  ? lot({ date: `${MONTH[k]}-15`, received_qty: n, ...o })
  : nc({ date: `${MONTH[k]}-15`, received_qty: n, rejected_qty: rejected, failure_mode_code: `FM-${k}`, ...o }));
// base: rejected of 1000 in M1..M6. mon: one symbol per month from M7: a digit = rejected of 1000, '-' = no row.
const series = (base, mon = '') => [...base.map((r, i) => mrow(i + 1, r)),
  ...[...mon].flatMap((s, i) => (s === '-' ? [] : [mrow(i + 7, Number(s))]))];
const BASE = [1, 1, 1, 1, 1, 1]; // p̄ = 6/6000 = 0.001
const run = (rows) => scorecard(rows, { as_of: AS_OF });
const card = (rows, id = 'ACT-01') => run(rows).suppliers.find((s) => s.supplier_id === id);
const alert = (type, index, detail) => ({ type, month: MONTH[index], index, active: index === 18, detail });
const bad = (index, metric, detail) => ({ ...alert('metric_bad', index, detail), metric });
const pc = (c) => c.alerts.filter((a) => a.type === 'ucl' || a.type === 'run7');
const runs = (c) => c.pchart.points.map((p) => [p.index, p.run]);
const near = (actual, expected, tol, msg) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${msg ?? ''} expected ${expected} ±${tol}, got ${actual}`);
const deepFreeze = (o) => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
};
const runDetail = (n, first, last) => `${n} months above ${PBAR} (M${first}${DASH}M${last})`;
// Baseline runs: six points with run 0 (all six baseline months carry receipts).
const BASE_RUNS = [[1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0]];

// UCL at n = 1000 with p̄ = 0.001: 0.001 + 3·√(0.001·0.999/1000) = 0.001 + 3·√9.99e-7
// = 0.001 + 3·0.000999499875 = 0.003998499625 (shows 0.0040). p 0.002 is above p̄ and below it; p 0.008 above.
const UCL_1000 = 0.003998499625;

// ---- T1. known UCL values (SCORE-FR-06, acceptance 1) ----

test('T1: known UCL values at n 100/400/1600/10000 and baseline n 500, points, key order', () => {
  // p̄ = 6·100 / 6·500 = 0.2, p̄(1−p̄) = 0.16. UCL = 0.2 + 3·√(0.16/n):
  // n 100 → 3·0.04 = 0.12 → 0.32; n 400 → 3·0.02 → 0.26; n 1600 → 3·0.01 → 0.23; n 10000 → 3·0.004 → 0.212;
  // n 500 → 3·√0.00032 = 3·0.04·√0.2 = 0.12·0.4472135955 = 0.05366563146 → 0.25366563146.
  const rows = [...[1, 2, 3, 4, 5, 6].map((k) => mrow(k, 100, 500)),
    mrow(7, 40, 100), mrow(8, 80, 400), mrow(9, 352, 1600), mrow(10, 2100, 10000)];
  const c = card(rows);
  assert.deepEqual(Object.keys(c), ['supplier_id', 'months', 'current', 'pchart', 'alerts', 'open_scars', 'failure_modes']);
  assert.deepEqual(Object.keys(c.pchart), ['p_bar', 'points']);
  near(c.pchart.p_bar, 0.2, 1e-12, 'p_bar');
  // [index, n, p, ucl, above_ucl, run]. M7 0.4 > 0.32 (run 1); M8 0.2 = p̄ (resets); M9 0.22 > p̄, < 0.23 (run 1);
  // M10 0.21 > p̄, < 0.212 (run 2). M11–M18 have no rows, so no points: 10 points.
  const BU = 0.25366563146;
  const want = [[1, 500, 0.2, BU, false, 0], [2, 500, 0.2, BU, false, 0], [3, 500, 0.2, BU, false, 0],
    [4, 500, 0.2, BU, false, 0], [5, 500, 0.2, BU, false, 0], [6, 500, 0.2, BU, false, 0],
    [7, 100, 0.4, 0.32, true, 1], [8, 400, 0.2, 0.26, false, 0], [9, 1600, 0.22, 0.23, false, 1],
    [10, 10000, 0.21, 0.212, false, 2]];
  assert.equal(c.pchart.points.length, want.length);
  c.pchart.points.forEach((pt, i) => {
    const [index, n, p, ucl, above_ucl, r] = want[i];
    assert.deepEqual(Object.keys(pt), ['month', 'index', 'n', 'p', 'ucl', 'above_ucl', 'run']);
    assert.equal(pt.month, MONTH[index]);
    assert.equal(pt.index, index);
    assert.equal(pt.n, n);
    near(pt.p, p, 1e-12, `M${index} p`);
    near(pt.ucl, ucl, 1e-10, `M${index} ucl`);
    assert.equal(pt.above_ucl, above_ucl, `M${index} above_ucl`);
    assert.equal(pt.run, r, `M${index} run`);
  });
  // The M8 point equals p̄ exactly (80/400 and 600/3000 are the same double): strict > fails.
  assert.equal(c.pchart.points[7].p, c.pchart.p_bar);
  // Unrounded output: the baseline UCL keeps more than 4 decimals.
  assert.notEqual(c.pchart.points[0].ucl, 0.2537);
  assert.deepEqual(pc(c), [alert('ucl', 7, 'p 0.4000 > UCL 0.3200')]);
});

// ---- T2. pooled p̄, same-month lots summed ----

test('T2: p̄ is pooled over M1–M6 (not the mean of monthly p); lots in one month are summed', () => {
  // M1 1 of 100; M2 two clean lots of 500; M3–M6 clean 1000. Pooled p̄ = 1/5100 = 0.000196078431;
  // the mean of monthly p would be 0.01/6 = 0.00167. M7 clean n 1000:
  // UCL = p̄ + 3·√(p̄(1−p̄)/1000) = 0.000196078 + 3·0.000442764 = 0.0015243705.
  // M8: lots 600 rej 2 and 400 rej 0 → n 1000, p 0.002 (one lot alone would give n 600 or 400).
  const rows = [mrow(1, 1, 100), mrow(2, 0, 500), mrow(2, 0, 500, { date: '2025-06-20' }),
    mrow(3, 0), mrow(4, 0), mrow(5, 0), mrow(6, 0), mrow(7, 0),
    mrow(8, 2, 600), mrow(8, 0, 400, { date: '2025-12-20' })];
  const { pchart } = card(rows);
  near(pchart.p_bar, 1 / 5100, 1e-15, 'p_bar');
  const at = (k) => pchart.points.find((p) => p.index === k);
  assert.equal(at(1).n, 100);
  assert.equal(at(2).n, 1000);
  assert.equal(at(2).p, 0);
  near(at(7).ucl, 0.0015243705, 1e-10, 'M7 ucl');
  assert.equal(at(8).n, 1000);
  near(at(8).p, 0.002, 1e-15, 'M8 p');
  assert.equal(at(8).run, 1); // 0.002 > p̄
  assert.equal(pchart.points.length, 8);
});

// ---- T3. run rule (SCORE-FR-07 run7, SCORE-AC-04) ----
// Symbols: 2 = p 0.002 (above p̄ 0.001, below UCL 0.0039985), 1 = p 0.001 = p̄ exactly, 0 = clean, - = no row.

test('T3 R1: six points above p̄ do not fire run7 (not the 6th)', () => {
  const c = card(series(BASE, '222222'));
  assert.deepEqual(runs(c), [...BASE_RUNS, [7, 1], [8, 2], [9, 3], [10, 4], [11, 5], [12, 6]]);
  assert.deepEqual(pc(c), []);
});

test('T3 R2: the 7th point above p̄ fires run7 (exactly the 7th)', () => {
  const c = card(series(BASE, '2222222'));
  assert.equal(c.pchart.points.at(-1).run, 7);
  assert.deepEqual(pc(c), [{ type: 'run7', month: '2026-05', index: 13, active: false, detail: runDetail(7, 7, 13) }]);
  assert.equal(pc(c)[0].detail, '7 months above p̄ (M7–M13)');
});

test('T3 R3: a run of 8 keeps firing at the 8th point (Decision B)', () => {
  const c = card(series(BASE, '22222222'));
  assert.deepEqual(pc(c), [alert('run7', 14, runDetail(8, 7, 14)), alert('run7', 13, runDetail(7, 7, 13))]);
});

test('T3 R4: a point equal to p̄ resets the run; without it run7 fires M13..M18, only M18 active', () => {
  const c = card(series(BASE, '222222122222'));
  assert.deepEqual(runs(c), [...BASE_RUNS, [7, 1], [8, 2], [9, 3], [10, 4], [11, 5], [12, 6], [13, 0],
    [14, 1], [15, 2], [16, 3], [17, 4], [18, 5]]);
  assert.equal(c.pchart.points[12].p, c.pchart.p_bar); // M13 p = 1/1000 === 6/6000
  assert.deepEqual(pc(c), []);
  // Variant: M13 is 2 → run 1..12 over M7..M18, run7 at M13..M18 with run lengths 7..12.
  const v = card(series(BASE, '222222222222'));
  assert.deepEqual(pc(v), [18, 17, 16, 15, 14, 13].map((k) => alert('run7', k, runDetail(k - 6, 7, k))));
  assert.equal(pc(v)[0].detail, '12 months above p̄ (M7–M18)');
  for (const a of v.alerts) assert.equal(a.active, a.index === 18);
});

test('T3 R5: after a reset at p̄, run7 fires at the 7th new point only', () => {
  // M7–M9 2, M10 1 (= p̄), M11–M17 2, M18 no row.
  const c = card(series(BASE, '22212222222-'));
  assert.equal(c.pchart.points.find((p) => p.index === 16).run, 6);
  assert.deepEqual(pc(c), [alert('run7', 17, runDetail(7, 11, 17))]);
});

test('T3 R6a: a zero-receipt month does not extend the run (no point, run 6 at M13)', () => {
  const c = card(series(BASE, '222-222'));
  assert.equal(c.pchart.points.find((p) => p.index === 10), undefined);
  assert.deepEqual(runs(c), [...BASE_RUNS, [7, 1], [8, 2], [9, 3], [11, 4], [12, 5], [13, 6]]);
  assert.deepEqual(pc(c), []);
});

test('T3 R6b: a zero-receipt month does not break the run; detail spans the gap (M7–M14)', () => {
  const c = card(series(BASE, '222-2222'));
  assert.deepEqual(runs(c).slice(6), [[7, 1], [8, 2], [9, 3], [11, 4], [12, 5], [13, 6], [14, 7]]);
  assert.deepEqual(pc(c), [alert('run7', 14, runDetail(7, 7, 14))]);
});

test('T3 R7: baseline points above p̄ never start or extend the run', () => {
  // Baseline rejected 0,0,0,1,2,3 → p̄ = 6/6000 = 0.001; M5 0.002 and M6 0.003 are above p̄ (below UCL).
  // A counter spanning the baseline would reach 7 at M11.
  const c = card(series([0, 0, 0, 1, 2, 3], '22222'));
  near(c.pchart.p_bar, 0.001, 1e-15);
  assert.ok(c.pchart.points[5].p > c.pchart.p_bar);
  assert.deepEqual(runs(c), [...BASE_RUNS, [7, 1], [8, 2], [9, 3], [10, 4], [11, 5]]);
  assert.deepEqual(pc(c), []);
});

test('T3 R8: a baseline point above its UCL is plotted but not judged; no alerts at all', () => {
  // Baseline 0,0,0,0,1,5 → p̄ 0.001; M6 p 0.005 > UCL 0.0039985. M7–M18 clean. DPPM windows peak at
  // 6/3000 = 2000 (Watch), so every composite is 85 A: no alert of any type.
  const c = card(series([0, 0, 0, 0, 1, 5], '000000000000'));
  const m6 = c.pchart.points[5];
  assert.equal(m6.index, 6);
  assert.ok(m6.p > m6.ucl);
  assert.equal(m6.above_ucl, false);
  assert.equal(m6.run, 0);
  assert.deepEqual(c.alerts, []);
});

// ---- T4 / T6. fixture B (ACT-03 shape): single spike in M9 ----

// Baseline 1 of 1000 each (p̄ 0.001), M7, M8 clean, M9 8 of 1000, M10–M18 clean.
// DPPM (3-month window): M1–M6 1000/1000/1000/1000/1000/1000 Watch → 85 A; M7 2/3000 = 667 Watch → 85 A;
// M8 1/3000 = 333 Good → 100 A; M9 8/3000 = 2667 Bad → 0+20+15+15+20 = 70 B (tier_drop A → B);
// M10 and M11 still 2667 Bad (70 B, no drop); M12 on 0 → 100 A.
const B = series(BASE, '008000000000');

test('T4: ucl fires on the single spike in M9 only (ACT-03 shape)', () => {
  const c = card(B);
  assert.deepEqual(pc(c), [alert('ucl', 9, 'p 0.0080 > UCL 0.0040')]);
  const at = (k) => c.pchart.points.find((p) => p.index === k);
  near(at(9).ucl, UCL_1000, 1e-10);
  assert.equal(at(9).above_ucl, true);
  assert.equal(at(9).run, 1);
  assert.equal(at(10).run, 0);
  assert.deepEqual(c.pchart.points.filter((p) => p.above_ucl).map((p) => p.index), [9]);
});

test('T6: fixture B full alerts, month desc then ucl < tier_drop < metric_bad', () => {
  assert.deepEqual(card(B).alerts, [
    bad(11, 'dppm', 'DPPM 2667 > 2000'),
    bad(10, 'dppm', 'DPPM 2667 > 2000'),
    alert('ucl', 9, 'p 0.0080 > UCL 0.0040'),
    alert('tier_drop', 9, 'A → B'),
    bad(9, 'dppm', 'DPPM 2667 > 2000'),
  ]);
});

// ---- T5. fixture S2 (ACT-02 shape): creep from M12 ----

test('T5: S2 gives exactly one run7 at M18, DPPM Watch, no ucl, no earlier run7 (ACT-02 shape)', () => {
  // M7–M11 clean, M12–M18 2 of 1000. DPPM M12 667, M13 1333, M14..M18 6/3000 = 2000 (Watch, edge inclusive):
  // every composite 85 A, so no tier_drop or metric_bad. Runs 1..7 over M12..M18.
  const c = card(series(BASE, '000002222222'));
  assert.deepEqual(c.alerts, [alert('run7', 18, runDetail(7, 12, 18))]);
  assert.equal(c.alerts[0].detail, '7 months above p̄ (M12–M18)');
  assert.equal(c.months[17].metrics.dppm.value, 2000);
  assert.equal(c.months[17].metrics.dppm.band, 'watch');
  assert.deepEqual(runs(c).slice(11), [[12, 1], [13, 2], [14, 3], [15, 4], [16, 5], [17, 6], [18, 7]]);
});

// ---- T6. fixture C: all four types in M18, one sort ----

// M7–M11 clean, M12–M17 2 of 1000, M18 8 of 1000. M17 DPPM 6/3000 = 2000 Watch → 85 A; M18 window
// 2+2+8 = 12/3000 = 4000 Bad → 70 B. M18 p 0.008 > UCL 0.0039985 and > p̄ (run 7 from M12).
// If p-chart alerts were appended after the sort, M18 would read tier_drop, metric_bad, ucl, run7.
const C = series(BASE, '000002222228');
const C_ALERTS = [
  alert('ucl', 18, 'p 0.0080 > UCL 0.0040'),
  alert('run7', 18, '7 months above p̄ (M12–M18)'),
  alert('tier_drop', 18, 'A → B'),
  bad(18, 'dppm', 'DPPM 4000 > 2000'),
];

test('T6: fixture C full alerts, same month ucl, run7, tier_drop, metric_bad, all active', () => {
  assert.deepEqual(card(C).alerts, C_ALERTS);
});

// ---- T7. p̄ = 0 ----

test('T7: p̄ = 0 gives UCL 0; one reject fires ucl, a clean month is not above and resets', () => {
  const c = card(series([0, 0, 0, 0, 0, 0], '10'));
  assert.equal(c.pchart.p_bar, 0);
  for (const p of c.pchart.points) assert.equal(p.ucl, 0);
  const [m7, m8] = c.pchart.points.slice(6);
  assert.deepEqual([m7.index, m7.above_ucl, m7.run], [7, true, 1]);
  assert.deepEqual([m8.index, m8.above_ucl, m8.run], [8, false, 0]);
  assert.deepEqual(pc(c), [alert('ucl', 7, 'p 0.0010 > UCL 0.0000')]);
});

test('T7: p̄ = 0 with rejects M12–M18 fires ucl each month and run7 at M18; a clean month resets', () => {
  const U = (k) => alert('ucl', k, 'p 0.0010 > UCL 0.0000');
  const c = card(series([0, 0, 0, 0, 0, 0], '000001111111'));
  assert.deepEqual(pc(c), [U(18), alert('run7', 18, runDetail(7, 12, 18)), U(17), U(16), U(15), U(14), U(13), U(12)]);
  const r = card(series([0, 0, 0, 0, 0, 0], '000001110111'));
  assert.deepEqual(pc(r), [U(18), U(17), U(16), U(14), U(13), U(12)]);
  assert.deepEqual(runs(r).slice(11), [[12, 1], [13, 2], [14, 3], [15, 0], [16, 1], [17, 2], [18, 3]]);
});

// ---- T8. empty baseline ----

test('T8: empty baseline → pchart null, no ucl/run7 even with rejects, exact warning', () => {
  const r = run([mrow(10, 0), mrow(12, 5), mrow(13, 5)]);
  assert.equal(r.suppliers[0].pchart, null);
  assert.deepEqual(pc(r.suppliers[0]), []);
  assert.deepEqual(r.warnings, [`ACT-01: no receipts in M1${DASH}M6 (2025-05 to 2025-10), no p-chart`]);
});

test('T8: warnings: ignored-rows first, then empty-baseline suppliers in id order; baseline supplier none', () => {
  // ACT-02 then ACT-01 in input order (both M10+ only); ACT-03 only out of frame (2025-04-30, before M1);
  // ACT-04 has a baseline lot.
  const r = run([mrow(11, 3, 1000, { supplier_id: 'ACT-02' }), mrow(10, 0), lot({ date: '2025-04-30', supplier_id: 'ACT-03' }),
    mrow(2, 0, 1000, { supplier_id: 'ACT-04' }), mrow(12, 2, 1000, { supplier_id: 'ACT-04' })]);
  const w = (id) => `${id}: no receipts in M1–M6 (2025-05 to 2025-10), no p-chart`;
  assert.deepEqual(r.warnings, ['ignored 1 row dated outside 2025-05 to 2026-10', w('ACT-01'), w('ACT-02'), w('ACT-03')]);
  const by = Object.fromEntries(r.suppliers.map((s) => [s.supplier_id, s]));
  assert.equal(by['ACT-01'].pchart, null);
  assert.equal(by['ACT-02'].pchart, null);
  assert.deepEqual(pc(by['ACT-02']), []);
  assert.equal(by['ACT-03'].pchart, null);
  assert.deepEqual(by['ACT-03'].alerts, []);
  assert.notEqual(by['ACT-04'].pchart, null);
});

// ---- T9. purity and determinism ----

test('T9: frozen inputs; same result twice, reversed rows, JSON round trip; inputs unchanged (fixture C)', () => {
  const rows = deepFreeze(structuredClone([...C, ...B.map((r) => ({ ...r, supplier_id: 'ACT-02' }))]));
  const policy = deepFreeze(structuredClone(STARK_REFERENCE));
  const snap = JSON.stringify([rows, policy]);
  const a = scorecard(rows, { as_of: AS_OF, policy });
  assert.deepEqual(a.suppliers[0].alerts, C_ALERTS);
  assert.deepEqual(scorecard(rows, { as_of: AS_OF, policy }), a);
  assert.deepEqual(scorecard([...rows].reverse(), { as_of: AS_OF, policy }), a);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), a);
  assert.equal(JSON.stringify([rows, policy]), snap);
});

// ---- T10. stable suppliers (ACT-01 / ACT-04 shape) ----

test('T10: a stable supplier (clean, or exactly p̄) holds no ucl or run7', () => {
  for (const mon of ['000000000000', '111111111111', '010101010101']) {
    const c = card(series(BASE, mon));
    assert.deepEqual(pc(c), [], mon);
    for (const p of c.pchart.points) assert.equal(p.run, 0, `${mon} M${p.index}`);
  }
});

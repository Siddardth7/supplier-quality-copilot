// Scorecard metrics (#20; SCORE-FR-03, -04, -08, the band half of -10; SCORE-AC-02, -03 band half, -06,
// -09 band half; SCORE-NFR-01 purity part). Every expected value is derived by hand from docs/SCORECARD.md
// § Metrics (the working is in the comments), never copied from engine output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scorecard } from './engine.js';
import { STARK_REFERENCE } from './rubric.js';

// as_of 2026-11-01: M1 2025-05, M2 2025-06, M3 2025-07, M4 2025-08, M5 2025-09, M6 2025-10, M7 2025-11,
// M8 2025-12, M9 2026-01, M10 2026-02, ..., M18 2026-10.
const AS_OF = '2026-11-01';
const W = STARK_REFERENCE.scorecard.weights;
// SCORECARD.md: "Points per metric: Good = 100%, Watch = 50%, Bad = 0% of its weight."
const FACTOR = { good: 1, watch: 0.5, bad: 0 };
const KEYS = ['dppm', 'escape', 'repeat_nc', 'scar_aging', 'otd'];

const lot = (o = {}) => ({ date: '2026-10-15', supplier_id: 'ACT-01', part_no: 'P1', received_qty: 1000,
  rejected_qty: 0, on_time: 1, defect_found_at: 'none', failure_mode_code: null, scar_id: null,
  scar_opened: null, scar_closed: null, ...o });
const nc = (o = {}) => lot({ rejected_qty: 1, defect_found_at: 'incoming', failure_mode_code: 'FM-X', ...o });
const run = (rows, opts = {}) => scorecard(rows, { as_of: AS_OF, ...opts });
const sup = (res, id = 'ACT-01') => res.suppliers.find((s) => s.supplier_id === id);
const metrics = (res, m, id) => sup(res, id).months[m - 1].metrics;
const m18 = (rows, opts) => metrics(run(rows, opts), 18);
const expect = (key, value, band, w = W) => ({ value, band, points: band === null ? null : FACTOR[band] * w[key] });
const deepFreeze = (o) => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
};

// ---- 1. Fixture F1 (ACT-01): windows, truncation, empty cases, repeat look-back before the window ----

const F1 = [
  lot({ date: '2025-05-10', part_no: 'P1', received_qty: 1000 }), // r1 M1
  lot({ date: '2025-06-05', part_no: 'P1', received_qty: 1000, rejected_qty: 2, on_time: 0, // r2 M2
    defect_found_at: 'line', failure_mode_code: 'FM-LEAK' }),
  lot({ date: '2025-08-20', part_no: 'P2', received_qty: 2000, rejected_qty: 1, // r3 M4
    defect_found_at: 'incoming', failure_mode_code: 'FM-LEAK' }),
  lot({ date: '2025-11-03', part_no: 'P1', received_qty: 500, rejected_qty: 5, // r4 M7
    defect_found_at: 'field', failure_mode_code: 'FM-LEAK', scar_id: 'SCAR-1', scar_opened: '2025-11-10' }),
];
// Day gaps: r2 2025-06-05 -> r3 2025-08-20 = 25 (Jun) + 31 (Jul) + 20 (Aug) = 76; r3 -> r4 2025-11-03 =
// 11 (Aug) + 30 (Sep) + 31 (Oct) + 3 (Nov) = 75. So r3 and r4 are repeats; r2 has nothing earlier.
// SCAR-1 (opened 2025-11-10) age at month end: 2025-11-30 20; 2025-12-31 51; 2026-01-31 82; 2026-02-28 110.
//
// Windows: dppm/otd 3 months, escape/repeat 6 months, truncated at M1.
// M1  dppm M1: r1 0/1000 = 0. escape: no rejects 0. repeat: no NCs 0. scar: none open 0. otd r1 1/1 = 100.
// M2  dppm M1-M2: 2/2000 = 1000. escape 2 line / 2 = 100. repeat r2 not a repeat: 0/1. otd 1 of 2 = 50.
// M3  no M3 rows; windows M1-M3 as M2.
// M4  dppm M2-M4: 3/3000 = 1000. escape M1-M4: 2/3 = 66.7. repeat r2, r3: 1/2 = 50. otd M2-M4 r2 0, r3 1 = 50.
// M5  dppm M3-M5: r3 1/2000 = 500 (edge, good). escape/repeat M1-M5 as M4. otd r3 = 100.
// M6  dppm M4-M6: r3 = 500. otd 100. escape/repeat M1-M6 as M4. scar end 2025-10-31: SCAR-1 not opened yet.
// M7  dppm M5-M7: r4 5/500 = 10000. escape M2-M7: (2 line + 5 field) / 8 = 87.5 (by quantity; by NC count
//     it would be 66.7). repeat M2-M7: r2, r3, r4: 2/3 = 66.7. scar age 20, not > 30: 0/1 = 0. otd r4 = 100.
// M8  dppm M6-M8: r4 (M7) still in: 10000. escape M3-M8: r3, r4: 5/6 = 83.3. repeat M3-M8: r3 (via r2 in M2,
//     before the window), r4: 2/2 = 100. scar age 51 > 30: 1/1 = 100. otd r4 = 100.
// M9  dppm/otd M7-M9 still hold r4: 10000 / 100. escape M4-M9: r3, r4: 83.3. repeat 2/2 = 100. scar age 82: 100.
// M10 dppm/otd M8-M10: no rows -> null. escape M5-M10: r4 only 5/5 = 100. repeat M5-M10: r4 1/1 = 100.
//     scar age 110: 100.
// M11, M12 escape/repeat windows M6-M11, M7-M12 still hold r4: 100 / 100. dppm/otd null. scar 100.
// M13-M18 escape/repeat windows M8.. hold no rows: 0 / 0 (empty cases). dppm/otd null. SCAR-1 still open: 100.
const g = (v) => [v, 'good'], wa = (v) => [v, 'watch'], b = (v) => [v, 'bad'], N = [null, null];
const F1_TABLE = [
  //       dppm        escape     repeat_nc  scar_aging otd
  [1,  g(0),        g(0),      g(0),      g(0),      g(100)],
  [2,  wa(1000),    b(100),    g(0),      g(0),      b(50)],
  [3,  wa(1000),    b(100),    g(0),      g(0),      b(50)],
  [4,  wa(1000),    b(66.7),   b(50),     g(0),      b(50)],
  [5,  g(500),      b(66.7),   b(50),     g(0),      g(100)],
  [6,  g(500),      b(66.7),   b(50),     g(0),      g(100)],
  [7,  b(10000),    b(87.5),   b(66.7),   g(0),      g(100)],
  [8,  b(10000),    b(83.3),   b(100),    b(100),    g(100)],
  [9,  b(10000),    b(83.3),   b(100),    b(100),    g(100)],
  [10, N,           b(100),    b(100),    b(100),    N],
  [11, N,           b(100),    b(100),    b(100),    N],
  [12, N,           b(100),    b(100),    b(100),    N],
  ...[13, 14, 15, 16, 17, 18].map((m) => [m, N, g(0), g(0), b(100), N]),
];

test('1: F1 every metric, M1-M18 (window truncation at M1, M2, M3, M7; empty cases; look-back before the window)', () => {
  const r = run(F1);
  assert.deepEqual(r.warnings, []);
  for (const [m, ...cells] of F1_TABLE) {
    const got = metrics(r, m);
    KEYS.forEach((key, k) => assert.deepEqual(got[key], expect(key, ...cells[k]), `M${m} ${key}`));
  }
});

test('1: F1 M2 points under the reference: 15 / 0 / 15 / 15 / 0', () => {
  const p = metrics(run(F1), 2);
  assert.deepEqual(KEYS.map((k) => p[k].points), [15, 0, 15, 15, 0]);
});

test('1: F1 M18 open_scars and failure_modes (r2, r3 are before M7 and excluded)', () => {
  const s = sup(run(F1));
  // 2025-11-10 -> 2026-11-10 is 365 days; minus 10 -> 2026-10-31 is 355.
  assert.deepEqual(s.open_scars, [{ scar_id: 'SCAR-1', opened: '2025-11-10', age_days: 355 }]);
  assert.deepEqual(s.failure_modes, [{ code: 'FM-LEAK', count: 1, parts: ['P1'] }]);
});

// ---- 2. empty cases, one per metric ----

test('2: dppm and otd: a window with no receipts is null, band and points null', () => {
  // One lot in M1 (2025-05); the 3-month window has nothing from M4 on.
  const r = run([lot({ date: '2025-05-20' })]);
  assert.deepEqual(metrics(r, 3).dppm, expect('dppm', 0, 'good'));
  assert.deepEqual(metrics(r, 3).otd, expect('otd', 100, 'good'));
  assert.deepEqual(metrics(r, 4).dppm, { value: null, band: null, points: null });
  assert.deepEqual(metrics(r, 4).otd, { value: null, band: null, points: null });
});

test('2: escape: no rejects in the window is 0, good, full points', () => {
  assert.deepEqual(m18([lot(), lot()]).escape, expect('escape', 0, 'good'));
  assert.equal(m18([lot()]).escape.points, 20);
});

test('2: repeat NC: no NCs is 0, good', () => {
  assert.deepEqual(m18([lot()]).repeat_nc, expect('repeat_nc', 0, 'good'));
  assert.equal(m18([lot()]).repeat_nc.points, 15);
});

test('2: SCAR aging: no open SCARs is 0, good (a closed SCAR is not open)', () => {
  assert.deepEqual(m18([lot()]).scar_aging, expect('scar_aging', 0, 'good'));
  const closed = lot({ scar_id: 'S1', scar_opened: '2025-06-01', scar_closed: '2025-07-01' });
  assert.deepEqual(m18([closed]).scar_aging, expect('scar_aging', 0, 'good'));
  assert.equal(m18([closed]).scar_aging.points, 15);
});

// ---- 3. Fixture F2 (ACT-02): SCAR snapshot edges ----

const F2 = [
  ['A', '2026-09-30', null], ['B', '2026-10-01', null], ['C', '2026-09-01', '2026-10-31'],
  ['D', '2026-10-31', null], ['E', '2026-11-01', null], ['F', '2026-09-15', '2026-10-15'],
].map(([id, opened, closed]) => lot({ supplier_id: 'ACT-02', date: '2026-10-05', scar_id: id,
  scar_opened: opened, scar_closed: closed }));

test('3: F2 at M18 (2026-10-31): open A (31, aged), B (30, not aged), D (0); C closed on month end; E, F not open', () => {
  // 1 aged of 3 open = 33.3 -> bad (> 25).
  const s = sup(run(F2), 'ACT-02');
  assert.deepEqual(s.months[17].metrics.scar_aging, expect('scar_aging', 33.3, 'bad'));
  assert.deepEqual(s.open_scars, [
    { scar_id: 'A', opened: '2026-09-30', age_days: 31 },
    { scar_id: 'B', opened: '2026-10-01', age_days: 30 },
    { scar_id: 'D', opened: '2026-10-31', age_days: 0 },
  ]);
});

test('3: F2 at M17 (2026-09-30): A (0), C (29), F (15) open, closed after the snapshot; none aged', () => {
  assert.deepEqual(metrics(run(F2), 17, 'ACT-02').scar_aging, expect('scar_aging', 0, 'good'));
});

test('3: age 31 is aged and age 30 is not, alone', () => {
  const one = (opened) => m18([lot({ scar_id: 'S1', scar_opened: opened })]).scar_aging.value;
  assert.equal(one('2026-09-30'), 100); // 31 days
  assert.equal(one('2026-10-01'), 0); // 30 days
});

test('3: a SCAR carried on several lots across months is counted once', () => {
  // Z opened 2026-08-01 on lots in M16, M17, M18 (age 91, aged); Y opened 2026-10-20 (age 11).
  // Distinct SCARs: 1 aged of 2 = 50.0 (bad). Counting lots instead would give 3 of 4 = 75.0.
  const z = { scar_id: 'Z', scar_opened: '2026-08-01' };
  const rows = [lot({ date: '2026-08-05', ...z }), lot({ date: '2026-09-05', ...z }), lot({ date: '2026-10-05', ...z }),
    lot({ date: '2026-10-21', scar_id: 'Y', scar_opened: '2026-10-20' })];
  const s = sup(run(rows));
  assert.deepEqual(s.months[17].metrics.scar_aging, expect('scar_aging', 50, 'bad'));
  assert.deepEqual(s.open_scars, [{ scar_id: 'Z', opened: '2026-08-01', age_days: 91 },
    { scar_id: 'Y', opened: '2026-10-20', age_days: 11 }]);
});

test('3: open/closed depends only on the SCAR dates, not on the receipt month of its lot', () => {
  // G opened 2025-12-01, carried on a lot received in M18. End M6 2025-10-31: not opened. End M8 2025-12-31:
  // age 30, not aged. End M9 2026-01-31: age 61, aged.
  const r = run([lot({ scar_id: 'G', scar_opened: '2025-12-01' })]);
  assert.equal(metrics(r, 6).scar_aging.value, 0);
  assert.equal(metrics(r, 8).scar_aging.value, 0);
  assert.equal(metrics(r, 9).scar_aging.value, 100);
});

// ---- 4. Fixture F3 (ACT-03): repeat NC look-back edges (1 to 180 days) ----

const f3 = (o) => nc({ supplier_id: 'ACT-03', ...o });

test('4: FM-A 2026-01-01 and 2026-06-30 (180 days) - the later NC is a repeat', () => {
  // Jan 31 + Feb 28 + Mar 31 + Apr 30 + May 31 = 151, + 29 into June = 180. M14 = 2026-06, window M9-M14: 1 of 2.
  const r = run([f3({ date: '2026-01-01', failure_mode_code: 'FM-A' }), f3({ date: '2026-06-30', failure_mode_code: 'FM-A' })]);
  assert.deepEqual(metrics(r, 14, 'ACT-03').repeat_nc, expect('repeat_nc', 50, 'bad'));
  assert.equal(metrics(r, 9, 'ACT-03').repeat_nc.value, 0); // the first NC alone
});

test('4: FM-B 2026-01-01 and 2026-07-01 (181 days) - not a repeat', () => {
  // M15 = 2026-07, window M10-M15 holds only the July NC; its look-back is 181 days -> 0 of 1.
  const r = run([f3({ date: '2026-01-01', failure_mode_code: 'FM-B' }), f3({ date: '2026-07-01', failure_mode_code: 'FM-B' })]);
  assert.deepEqual(metrics(r, 15, 'ACT-03').repeat_nc, expect('repeat_nc', 0, 'good'));
});

test('4: FM-C two NCs on the same day - neither is earlier, so neither is a repeat', () => {
  const r = run([f3({ date: '2026-03-01', failure_mode_code: 'FM-C' }), f3({ date: '2026-03-01', failure_mode_code: 'FM-C' })]);
  assert.deepEqual(metrics(r, 11, 'ACT-03').repeat_nc, expect('repeat_nc', 0, 'good'));
});

test('4: FM-D on ACT-03 and ACT-04 within 5 days - repeat NC is per supplier', () => {
  const r = run([f3({ date: '2026-04-10', failure_mode_code: 'FM-D' }),
    nc({ supplier_id: 'ACT-04', date: '2026-04-15', failure_mode_code: 'FM-D' })]);
  assert.equal(metrics(r, 12, 'ACT-03').repeat_nc.value, 0);
  assert.equal(metrics(r, 12, 'ACT-04').repeat_nc.value, 0);
});

test('4: a different failure-mode code is not a repeat', () => {
  const r = run([nc({ date: '2026-10-01', failure_mode_code: 'FM-X' }), nc({ date: '2026-10-02', failure_mode_code: 'FM-Y' })]);
  assert.equal(metrics(r, 18).repeat_nc.value, 0);
});

test('4: the look-back stops at the start of the 18 months', () => {
  // 2025-04-20 is before M1 (ignored); 2025-05-10 (M1) is 20 days later with the same code -> still 0 of 1.
  const r = run([nc({ date: '2025-04-20' }), nc({ date: '2025-05-10' })]);
  assert.equal(metrics(r, 1).repeat_nc.value, 0);
  assert.deepEqual(r.warnings, ['ignored 1 row dated outside 2025-05 to 2026-10']);
});

// ---- 5. band edges, both sides, rounded before banding (Fixture F4 and the edge table) ----

// Rows for one supplier month in M18 with a chosen metric value.
const ROWS = {
  dppm: (rec, rej) => [lot({ received_qty: rec, rejected_qty: rej, defect_found_at: 'incoming', failure_mode_code: 'FM-X' })],
  // num rejects found on the line, the rest of den at incoming.
  escape: (num, den) => [nc({ rejected_qty: num, received_qty: den, defect_found_at: 'line' }),
    nc({ date: '2026-10-16', rejected_qty: den - num, received_qty: den })],
  // n NCs in M18, k of them repeats: one FM-R, k later FM-R, the rest distinct codes.
  repeat_nc: (k, n) => Array.from({ length: n }, (_, i) => nc({ date: `2026-10-${String(i + 1).padStart(2, '0')}`,
    failure_mode_code: i <= k ? 'FM-R' : `FM-${i}` })),
  // n open SCARs at 2026-10-31, k aged (opened 2026-09-01, age 60), the rest not (opened 2026-10-15, age 16).
  scar_aging: (k, n) => Array.from({ length: n }, (_, i) => lot({ scar_id: `S${i}`,
    scar_opened: i < k ? '2026-09-01' : '2026-10-15' })),
  // k of n lots on time.
  otd: (k, n) => Array.from({ length: n }, (_, i) => lot({ on_time: i < k ? 1 : 0 })),
};
const dppm = (rec, rej) => m18(ROWS.dppm(rec, rej)).dppm;
const escape = (num, den) => m18(ROWS.escape(num, den)).escape;
const repeat = (k, n) => m18(ROWS.repeat_nc(k, n)).repeat_nc;
const aging = (k, n) => m18(ROWS.scar_aging(k, n)).scar_aging;
const otd = (k, n) => m18(ROWS.otd(k, n)).otd;
// Both sides of every reference edge, one supplier each (ACT-20..ACT-39); SCAR ids made unique per supplier.
const EDGE_ROWS = [
  ['dppm', 2000, 1], ['dppm', 1000000, 501], ['dppm', 1000, 2], ['dppm', 1000000, 2001],
  ['escape', 1, 20], ['escape', 51, 1000], ['escape', 3, 20], ['escape', 151, 1000],
  ['repeat_nc', 1, 10], ['repeat_nc', 1, 9], ['repeat_nc', 1, 4], ['repeat_nc', 1, 3],
  ['scar_aging', 0, 1], ['scar_aging', 1, 7], ['scar_aging', 1, 4], ['scar_aging', 1, 3],
  ['otd', 19, 20], ['otd', 949, 1000], ['otd', 17, 20], ['otd', 849, 1000],
].flatMap(([key, a, b], k) => ROWS[key](a, b).map((r) => ({ ...r, supplier_id: `ACT-${20 + k}`,
  scar_id: r.scar_id && `ACT-${20 + k}-${r.scar_id}` })));

test('5: dppm edges 500 and 2000, and rounding to an integer before banding', () => {
  assert.deepEqual(dppm(2000, 1), expect('dppm', 500, 'good'));
  assert.deepEqual(dppm(1000000, 501), expect('dppm', 501, 'watch'));
  assert.deepEqual(dppm(1000, 2), expect('dppm', 2000, 'watch'));
  assert.deepEqual(dppm(1000000, 2001), expect('dppm', 2001, 'bad'));
  assert.deepEqual(dppm(10000000, 5004), expect('dppm', 500, 'good')); // 500.4
  assert.deepEqual(dppm(10000000, 5005), expect('dppm', 501, 'watch')); // 500.5 half up
  assert.deepEqual(dppm(10000000, 20004), expect('dppm', 2000, 'watch')); // 2000.4
  assert.deepEqual(dppm(10000000, 20005), expect('dppm', 2001, 'bad')); // 2000.5
});

test('5: escape edges 5 and 15, rounded to 0.1 before banding', () => {
  assert.deepEqual(escape(1, 20), expect('escape', 5, 'good'));
  assert.deepEqual(escape(51, 1000), expect('escape', 5.1, 'watch'));
  assert.deepEqual(escape(3, 20), expect('escape', 15, 'watch'));
  assert.deepEqual(escape(151, 1000), expect('escape', 15.1, 'bad'));
  assert.deepEqual(escape(504, 10000), expect('escape', 5, 'good')); // 5.04
  assert.deepEqual(escape(505, 10000), expect('escape', 5.1, 'watch')); // 5.05 half up
  assert.deepEqual(escape(1504, 10000), expect('escape', 15, 'watch')); // 15.04
  assert.deepEqual(escape(1505, 10000), expect('escape', 15.1, 'bad')); // 15.05 half up
});

test('5: repeat NC edges 10 and 25', () => {
  assert.deepEqual(repeat(1, 10), expect('repeat_nc', 10, 'good'));
  assert.deepEqual(repeat(1, 9), expect('repeat_nc', 11.1, 'watch'));
  assert.deepEqual(repeat(1, 4), expect('repeat_nc', 25, 'watch'));
  assert.deepEqual(repeat(1, 3), expect('repeat_nc', 33.3, 'bad'));
  assert.deepEqual(repeat(2, 7), expect('repeat_nc', 28.6, 'bad'));
});

test('5: SCAR aging edges 0 and 25', () => {
  assert.deepEqual(aging(0, 1), expect('scar_aging', 0, 'good'));
  assert.deepEqual(aging(1, 7), expect('scar_aging', 14.3, 'watch'));
  assert.deepEqual(aging(1, 4), expect('scar_aging', 25, 'watch'));
  assert.deepEqual(aging(1, 3), expect('scar_aging', 33.3, 'bad'));
});

test('5: OTD edges 95 and 85, rounded to 0.1 before banding', () => {
  assert.deepEqual(otd(19, 20), expect('otd', 95, 'good'));
  assert.deepEqual(otd(949, 1000), expect('otd', 94.9, 'watch'));
  assert.deepEqual(otd(17, 20), expect('otd', 85, 'watch'));
  assert.deepEqual(otd(849, 1000), expect('otd', 84.9, 'bad'));
  assert.deepEqual(otd(1899, 2000), expect('otd', 95, 'good')); // 94.95 half up
  assert.deepEqual(otd(1898, 2000), expect('otd', 94.9, 'watch'));
  assert.deepEqual(otd(1699, 2000), expect('otd', 85, 'watch')); // 84.95 half up
  assert.deepEqual(otd(1698, 2000), expect('otd', 84.9, 'bad'));
});

// ---- 6. policy: limits and weights come from policy.scorecard ----

const withScorecard = (sc) => ({ ...STARK_REFERENCE, scorecard: { ...STARK_REFERENCE.scorecard, ...sc } });
const limits = (key, l) => withScorecard({ limits: { ...STARK_REFERENCE.scorecard.limits, [key]: { ...STARK_REFERENCE.scorecard.limits[key], ...l } } });

test('6: omitted policy equals STARK_REFERENCE (both sides of every edge)', () => {
  const rows = [...F1, ...F2, ...EDGE_ROWS];
  assert.deepEqual(run(rows), run(rows, { policy: STARK_REFERENCE }));
});

test('6: SCORE-AC-09 band half: OTD 83% is bad by default, watch with limits.otd.watch = 80', () => {
  const rows = Array.from({ length: 100 }, (_, i) => lot({ on_time: i < 83 ? 1 : 0 }));
  assert.deepEqual(m18(rows).otd, { value: 83, band: 'bad', points: 0 });
  assert.deepEqual(m18(rows, { policy: limits('otd', { watch: 80 }) }).otd, { value: 83, band: 'watch', points: 10 });
});

test('6: custom limits.dppm.good 400 moves 450 DPPM from good to watch', () => {
  const rows = [lot({ received_qty: 20000, rejected_qty: 9, defect_found_at: 'incoming', failure_mode_code: 'FM-X' })]; // 450
  assert.deepEqual(m18(rows).dppm, expect('dppm', 450, 'good'));
  assert.deepEqual(m18(rows, { policy: limits('dppm', { good: 400 }) }).dppm, expect('dppm', 450, 'watch'));
});

test('6: custom limits on the lower-is-better percentages and both edges of OTD', () => {
  // escape 10.0 is watch by default; with good 10 it is good. repeat 1 of 4 = 25.0 watch; watch 20 makes it bad.
  assert.equal(m18([nc({ rejected_qty: 1, defect_found_at: 'line' }), nc({ date: '2026-10-16', rejected_qty: 9 })],
    { policy: limits('escape', { good: 10 }) }).escape.band, 'good');
  assert.equal(m18(Array.from({ length: 4 }, (_, i) => nc({ date: `2026-10-0${i + 1}`, failure_mode_code: i < 2 ? 'FM-R' : `FM-${i}` })),
    { policy: limits('repeat_nc', { watch: 20 }) }).repeat_nc.band, 'bad');
  // scar aging 1 of 4 = 25.0: watch by default, good with good 25.
  const a = Array.from({ length: 4 }, (_, i) => lot({ scar_id: `S${i}`, scar_opened: i < 1 ? '2026-09-01' : '2026-10-15' }));
  assert.equal(m18(a, { policy: limits('scar_aging', { good: 25 }) }).scar_aging.band, 'good');
  // OTD 19 of 20 = 95.0: good by default, watch with good 96.
  assert.equal(m18(Array.from({ length: 20 }, (_, i) => lot({ on_time: i < 19 ? 1 : 0 })),
    { policy: limits('otd', { good: 96 }) }).otd.band, 'watch');
});

test('6: weights come from the policy: Watch/Bad/Good DPPM with weight 40 give 20 / 0 / 40', () => {
  const policy = withScorecard({ weights: { dppm: 40, escape: 15, repeat_nc: 15, scar_aging: 10, otd: 20 } });
  const d = (rej) => m18([rej === 0 ? lot() : nc({ rejected_qty: rej })], { policy });
  assert.deepEqual(d(1).dppm, { value: 1000, band: 'watch', points: 20 });
  assert.deepEqual(d(3).dppm, { value: 3000, band: 'bad', points: 0 });
  assert.deepEqual(d(0).dppm, { value: 0, band: 'good', points: 40 });
  // The others follow their own weight: good escape 15, repeat 15, aging 10, otd 20.
  assert.deepEqual(KEYS.slice(1).map((k) => d(0)[k].points), [15, 15, 10, 20]);
});

test('6: a custom policy changes band and points (and the composite, tier and alerts built on them) only', () => {
  const policy = withScorecard({ weights: { dppm: 10, escape: 10, repeat_nc: 10, scar_aging: 10, otd: 60 },
    limits: { dppm: { good: 0, watch: 1 }, escape: { good: 0, watch: 1 }, repeat_nc: { good: 0, watch: 1 },
      scar_aging: { good: 0, watch: 1 }, otd: { good: 100, watch: 99 } } });
  const rows = [...F1, ...F2];
  // #21: composite, tier, current and alerts follow the policy too (SCORE-FR-10), so they are dropped here.
  const strip = (r) => ({ ...r, suppliers: r.suppliers.map(({ current: _c, alerts: _a, ...s }) => ({ ...s,
    months: s.months.map(({ composite: _x, tier: _t, ...m }) => ({ ...m,
      metrics: Object.fromEntries(KEYS.map((k) => [k, m.metrics[k].value])) })) })) });
  const ref = run(rows), custom = run(rows, { policy });
  assert.notDeepEqual(custom, ref);
  assert.deepEqual(strip(custom), strip(ref));
});

test('6: a policy without a scorecard object throws', () => {
  const { scorecard: _, ...noSc } = STARK_REFERENCE;
  for (const policy of [noSc, { ...STARK_REFERENCE, scorecard: null }, { ...STARK_REFERENCE, scorecard: [] }, null]) {
    assert.throws(() => run([lot()], { policy }), { message: 'policy.scorecard: expected an object' });
  }
});

// ---- 7. SCORE-FR-08: failure modes over M7-M18 and open SCARs at M18 ----

test('7: failure_modes count lots, sort parts, order by count desc then code; NCs before M7 excluded', () => {
  const rows = [
    nc({ date: '2025-10-31', failure_mode_code: 'FM-OLD', part_no: 'P0' }), // M6: excluded
    nc({ date: '2025-10-15', failure_mode_code: 'FM-B', part_no: 'P0' }), // M6: excluded
    nc({ date: '2026-06-01', failure_mode_code: 'FM-C', part_no: 'P9' }), // FM-C listed before FM-A: tie by code
    nc({ date: '2025-11-01', failure_mode_code: 'FM-A', part_no: 'P2' }), // M7: first monitoring day
    nc({ date: '2026-03-01', failure_mode_code: 'FM-A', part_no: 'P2', rejected_qty: 50 }),
    nc({ date: '2026-02-01', failure_mode_code: 'FM-B', part_no: 'P3' }),
    nc({ date: '2026-04-01', failure_mode_code: 'FM-B', part_no: 'P1' }),
    nc({ date: '2026-05-01', failure_mode_code: 'FM-B', part_no: 'P3' }),
    nc({ date: '2026-07-01', failure_mode_code: 'FM-C', part_no: 'P10' }),
    lot({ date: '2026-07-02', part_no: 'P7' }), // no rejects: not an NC
  ];
  assert.deepEqual(sup(run(rows)).failure_modes, [
    { code: 'FM-B', count: 3, parts: ['P1', 'P3'] },
    { code: 'FM-A', count: 2, parts: ['P2'] },
    { code: 'FM-C', count: 2, parts: ['P10', 'P9'] },
  ]);
  assert.deepEqual(sup(run([lot(), nc({ date: '2025-06-01' })])).failure_modes, []);
});

test('7: open_scars oldest first, ties by id, any age, closed ones left out', () => {
  const rows = [
    lot({ scar_id: 'SCAR-B', scar_opened: '2026-10-01' }),
    lot({ scar_id: 'SCAR-A', scar_opened: '2026-10-01' }),
    lot({ date: '2026-09-01', scar_id: 'SCAR-Z', scar_opened: '2026-08-01' }),
    lot({ date: '2026-10-02', scar_id: 'SCAR-Z', scar_opened: '2026-08-01' }),
    lot({ scar_id: 'SCAR-0', scar_opened: '2026-07-01', scar_closed: '2026-10-30' }),
  ];
  assert.deepEqual(sup(run(rows)).open_scars, [
    { scar_id: 'SCAR-Z', opened: '2026-08-01', age_days: 91 },
    { scar_id: 'SCAR-A', opened: '2026-10-01', age_days: 30 },
    { scar_id: 'SCAR-B', opened: '2026-10-01', age_days: 30 },
  ]);
});

// ---- 8. purity, determinism, output shape ----

const ALL = [...F1, ...F2, nc({ supplier_id: 'ACT-03', date: '2026-01-01', failure_mode_code: 'FM-A' }),
  nc({ supplier_id: 'ACT-03', date: '2026-06-30', failure_mode_code: 'FM-A', scar_id: 'S3', scar_opened: '2026-07-01' }),
  nc({ supplier_id: 'ACT-03', date: '2026-07-05', failure_mode_code: 'FM-B', part_no: 'P2', scar_id: 'S3', scar_opened: '2026-07-01' }),
  lot({ supplier_id: 'ACT-09', date: '2024-01-01' })];

test('8: frozen rows and policy are not mutated; same result twice, reversed rows, and JSON round trip', () => {
  const rows = deepFreeze(structuredClone(ALL));
  const policy = deepFreeze(structuredClone(STARK_REFERENCE));
  const snap = JSON.stringify([rows, policy]);
  const a = scorecard(rows, { as_of: AS_OF, policy });
  assert.deepEqual(scorecard(rows, { as_of: AS_OF, policy }), a);
  assert.deepEqual(scorecard([...rows].reverse(), { as_of: AS_OF, policy }), a);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), a);
  assert.equal(JSON.stringify([rows, policy]), snap);
});

test('10: output shape is exactly the #22 subset of PRD-02 §5', () => {
  const r = run(ALL);
  assert.deepEqual(Object.keys(r), ['months', 'warnings', 'policy', 'suppliers']);
  assert.deepEqual(r.suppliers.map((s) => s.supplier_id), ['ACT-01', 'ACT-02', 'ACT-03', 'ACT-09']);
  for (const s of r.suppliers) {
    assert.deepEqual(Object.keys(s), ['supplier_id', 'months', 'current', 'pchart', 'alerts', 'open_scars', 'failure_modes']);
    assert.equal(s.months.length, 18);
    assert.deepEqual(Object.keys(s.current), ['month', 'composite', 'tier']);
    assert.equal(s.current.month, s.months[17].month);
    assert.deepEqual(s.current, { month: s.months[17].month, composite: s.months[17].composite, tier: s.months[17].tier });
    s.months.forEach((m, k) => {
      assert.deepEqual(Object.keys(m), ['month', 'index', 'metrics', 'composite', 'tier']);
      assert.equal(m.index, k + 1);
      assert.equal(m.month, r.months[k]);
      assert.deepEqual(Object.keys(m.metrics), KEYS);
      for (const v of Object.values(m.metrics)) assert.deepEqual(Object.keys(v), ['value', 'band', 'points']);
    });
  }
  const { pchart } = r.suppliers[0]; // ACT-01 holds F1, which has baseline receipts (M1, M2, M4)
  assert.deepEqual(Object.keys(pchart), ['p_bar', 'points']);
  assert.ok(pchart.points.length > 0);
  for (const pt of pchart.points) assert.deepEqual(Object.keys(pt), ['month', 'index', 'n', 'p', 'ucl', 'above_ucl', 'run']);
});

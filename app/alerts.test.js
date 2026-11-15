// Composite, tier and the tier_drop / scar_aging / metric_bad alerts (#21; SCORE-FR-05, -07 part, -10,
// SCORE-AC-03 null half, -05 minus ucl/run7, -09 tier/weights halves). Every expected value is derived by
// hand from docs/SCORECARD.md (§ Metrics, § Composite and tier, § Alerts) and PRD-02; the working is in the
// comments, never copied from engine output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scorecard, evaluate } from './engine.js';
import { STARK_REFERENCE } from './rubric.js';
import { POLICY_META_REJECTS, POLICY_META_ACCEPTS, withMeta } from './rubric.testkit.js';

// as_of 2026-11-01: M1 2025-05 ... M10 2026-02, M13 2026-05, M14 2026-06, M15 2026-07, M16 2026-08,
// M17 2026-09, M18 2026-10 (month end 2026-10-31).
const AS_OF = '2026-11-01';
const SC = STARK_REFERENCE.scorecard;

const lot = (o = {}) => ({ date: '2026-10-15', supplier_id: 'ACT-01', part_no: 'P1', received_qty: 1000,
  rejected_qty: 0, on_time: 1, defect_found_at: 'none', failure_mode_code: null, scar_id: null,
  scar_opened: null, scar_closed: null, ...o });
const nc = (o = {}) => lot({ rejected_qty: 1, defect_found_at: 'incoming', failure_mode_code: 'FM-X', ...o });
const run = (rows, opts = {}) => scorecard(rows, { as_of: AS_OF, ...opts });
const card = (rows, opts, id = 'ACT-01') => run(rows, opts).suppliers.find((s) => s.supplier_id === id);
const withScorecard = (sc) => ({ ...STARK_REFERENCE, scorecard: { ...SC, ...sc } });
const weights = (w) => withScorecard({ weights: { ...SC.weights, ...w } });
const limits = (key, l) => withScorecard({ limits: { ...SC.limits, [key]: { ...SC.limits[key], ...l } } });
const tiers = (t) => withScorecard({ tiers: t });
const deepFreeze = (o) => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
};
// Alert builders: key order type, month, index, active, detail[, metric] (PRD-02 §5 + #21 Decision 2).
const MONTH = { 15: '2026-07', 16: '2026-08', 17: '2026-09', 18: '2026-10' };
const alert = (type, index, detail) => ({ type, month: MONTH[index], index, active: index === 18, detail });
const bad = (index, metric, detail) => ({ ...alert('metric_bad', index, detail), metric });
const nulls = (n) => Array(n).fill(null);

// ---- 1. composite and tier edges (SCORE-FR-05, SCORE-AC-03, SCORE-AC-09 tier half) ----

// One M18 lot: received 1000, rejected 3 at incoming -> DPPM 3000 (Bad, 0 points). Escape 0/3 = 0 Good,
// repeat 0 (one NC) Good, no SCAR Good, OTD 1/1 = 100 Good. With weights dppm w, escape/repeat/aging 10 each,
// otd 70 - w (sum 100), composite = 0 + 10 + 10 + 10 + (70 - w) = 100 - w.
const DPPM_BAD = [nc({ rejected_qty: 3 })];
const edgePolicy = (w) => weights({ dppm: w, escape: 10, repeat_nc: 10, scar_aging: 10, otd: 70 - w });

test('1: tier edges 85 / 84.9, 70 / 69.9, 50 / 49.9 (inclusive lower bounds), in months[17] and current', () => {
  const table = [[15, 85, 'A'], [15.1, 84.9, 'B'], [30, 70, 'B'], [30.1, 69.9, 'C'], [50, 50, 'C'], [50.1, 49.9, 'D']];
  for (const [w, composite, tier] of table) {
    const c = card(DPPM_BAD, { policy: edgePolicy(w) });
    assert.equal(c.months[17].composite, composite, `w ${w}`);
    assert.equal(c.months[17].tier, tier, `w ${w}`);
    assert.deepEqual(c.current, { month: '2026-10', composite, tier }, `w ${w}`);
  }
});

test('1: composite rounds half up before the tier: 84.95 -> 85 -> A', () => {
  // DPPM 1/1000 = 1000 (Watch, 50%). Weights dppm 30.1, escape 19.9, repeat 15, aging 15, otd 20 (sum 100).
  // 0.5 * 30.1 + 19.9 + 15 + 15 + 20 = 15.05 + 69.9 = 84.95 -> 85.0 -> A (tier from the rounded composite).
  const c = card([nc()], { policy: weights({ dppm: 30.1, escape: 19.9 }) });
  assert.equal(c.months[17].metrics.dppm.band, 'watch');
  assert.equal(c.current.composite, 85);
  assert.equal(c.current.tier, 'A');
});

test('1: reference sums: all Good 100 -> A, all Watch 50 -> C, all Bad 0 -> D', () => {
  // All Good: one clean M18 lot -> 30 + 20 + 15 + 15 + 20 = 100.
  assert.deepEqual(card([lot()]).current, { month: '2026-10', composite: 100, tier: 'A' });
  // All Watch, ten M18 lots of 1000 (10000 received):
  // - 4 NCs 10-01..10-04: codes FM-R, FM-R, FM-2, FM-3 -> 1 repeat / 4 = 25 (Watch edge).
  //   rejected 1 at line + 3 + 3 + 3 at incoming = 10 -> escape 1/10 = 10 (Watch); DPPM 10/10000 = 1000 (Watch).
  // - 4 SCARs open at 2026-10-31: one opened 2026-09-01 (60 > 30, aged), three 2026-10-15 (16) -> 25 (Watch).
  // - lot 10 late: OTD 9/10 = 90 (Watch).  15 + 10 + 7.5 + 7.5 + 10 = 50 -> C.
  const watch = [
    nc({ date: '2026-10-01', defect_found_at: 'line', failure_mode_code: 'FM-R' }),
    nc({ date: '2026-10-02', rejected_qty: 3, failure_mode_code: 'FM-R' }),
    nc({ date: '2026-10-03', rejected_qty: 3, failure_mode_code: 'FM-2' }),
    nc({ date: '2026-10-04', rejected_qty: 3, failure_mode_code: 'FM-3' }),
    lot({ scar_id: 'S1', scar_opened: '2026-09-01' }), lot({ scar_id: 'S2', scar_opened: '2026-10-15' }),
    lot({ scar_id: 'S3', scar_opened: '2026-10-15' }), lot({ scar_id: 'S4', scar_opened: '2026-10-15' }),
    lot(), lot({ on_time: 0 }),
  ];
  const w = card(watch);
  assert.deepEqual(Object.values(w.months[17].metrics).map((m) => m.band), Array(5).fill('watch'));
  assert.deepEqual(w.current, { month: '2026-10', composite: 50, tier: 'C' });
  assert.deepEqual(w.alerts, []); // nothing Bad; M17 Unrated (DPPM window M15-M17 empty) so no tier_drop
  // All Bad: 3 NCs of 3 rejected / 1000 at line, all FM-R, all late; one SCAR opened 2026-09-01 (60 days).
  // DPPM 9/3000 = 3000; escape 9/9 = 100; repeat 2/3 = 66.7; aging 1/1 = 100; OTD 0/3 = 0 -> composite 0 -> D.
  // Five metric_bad alerts in metric order; no scar_aging alert (60 is not more than 60).
  const allBad = [1, 2, 3].map((d) => nc({ date: `2026-10-0${d}`, rejected_qty: 3, defect_found_at: 'line',
    failure_mode_code: 'FM-R', on_time: 0, scar_id: 'S1', scar_opened: '2026-09-01' }));
  const b = card(allBad);
  assert.deepEqual(b.current, { month: '2026-10', composite: 0, tier: 'D' });
  assert.deepEqual(b.alerts, [bad(18, 'dppm', 'DPPM 3000 > 2000'), bad(18, 'escape', 'Escape rate 100 > 15'),
    bad(18, 'repeat_nc', 'Repeat NC rate 66.7 > 25'), bad(18, 'scar_aging', 'SCAR aging 100 > 25'),
    bad(18, 'otd', 'On-time delivery 0 < 85')]);
});

test('1: SCORECARD.md ACT-05 worked check: 15 + 20 + 0 + 0 + 20 = 55 -> C', () => {
  // 3 lots of 1000, each one NC rejected 1 at incoming with code FM-R: DPPM 3/3000 = 1000 Watch (15),
  // escape 0 Good (20), repeat 2/3 = 66.7 Bad (0); one SCAR opened 2026-09-01, age 60 > 30: aging 100 Bad (0);
  // OTD 3/3 Good (20). Two metric_bad alerts, repeat_nc before scar_aging (metric order).
  const rows = [1, 2, 3].map((d) => nc({ date: `2026-10-0${d}`, failure_mode_code: 'FM-R', scar_id: 'S1',
    scar_opened: '2026-09-01' }));
  const c = card(rows);
  assert.deepEqual(c.current, { month: '2026-10', composite: 55, tier: 'C' });
  assert.deepEqual(c.alerts, [bad(18, 'repeat_nc', 'Repeat NC rate 66.7 > 25'), bad(18, 'scar_aging', 'SCAR aging 100 > 25')]);
});

// ---- 2. Unrated (SCORE-AC-03 null half) ----

// ACT-01 series: a clean lot in M10 (2026-02-15) and a lot with 5 rejected at incoming in M16 (2026-08-15).
// DPPM/OTD windows are 3 months: M1-M9 empty -> null; M10-M12 hold the M10 lot (DPPM 0, all Good = 100, A);
// M13-M15 empty -> null; M16-M18 hold the M16 lot: DPPM 5000 Bad 0 + escape 0/5 Good 20 + repeat 0 Good 15
// + aging Good 15 + OTD 100 Good 20 = 70 -> B.
const SERIES = [lot({ date: '2026-02-15' }), nc({ date: '2026-08-15', rejected_qty: 5 })];

test('2: an empty DPPM/OTD window is Unrated; A -> Unrated -> B raises no tier_drop', () => {
  const c = card(SERIES);
  assert.deepEqual(c.months.map((m) => m.composite), [...nulls(9), 100, 100, 100, ...nulls(3), 70, 70, 70]);
  assert.deepEqual(c.months.map((m) => m.tier), [...nulls(9), 'A', 'A', 'A', ...nulls(3), 'B', 'B', 'B']);
  // Unrated month still carries its other metrics (escape/repeat/aging 0 -> Good).
  const m13 = c.months[12].metrics;
  assert.deepEqual([m13.dppm.value, m13.otd.value, m13.escape.band, m13.repeat_nc.band, m13.scar_aging.band],
    [null, null, 'good', 'good', 'good']);
  assert.deepEqual(c.alerts, [bad(18, 'dppm', 'DPPM 5000 > 2000'), bad(17, 'dppm', 'DPPM 5000 > 2000'),
    bad(16, 'dppm', 'DPPM 5000 > 2000')]);
});

test('2: a null metric with weight 0 still makes the month Unrated (weight not spread)', () => {
  // dppm and otd weights 0, escape 40, repeat 30, aging 30. M13-M15 of SERIES have null DPPM and OTD; the
  // three rated metrics are Good (100 of 100), yet composite and tier stay null.
  const c = card(SERIES, { policy: weights({ dppm: 0, escape: 40, repeat_nc: 30, scar_aging: 30, otd: 0 }) });
  assert.deepEqual(c.months.slice(12, 15).map((m) => [m.composite, m.tier]), [[null, null], [null, null], [null, null]]);
  // M16: DPPM 5000 Bad 0 + 40 + 30 + 30 + 0 = 100 -> A.
  assert.deepEqual([c.months[15].composite, c.months[15].tier], [100, 'A']);
});

test('2: a supplier with no in-frame rows is Unrated in all 18 months with no alerts', () => {
  const c = card([lot({ supplier_id: 'ACT-09', date: '2024-01-01' })], {}, 'ACT-09');
  assert.deepEqual(c.months.map((m) => [m.composite, m.tier]), Array.from({ length: 18 }, () => [null, null]));
  assert.deepEqual(c.current, { month: '2026-10', composite: null, tier: null });
  assert.deepEqual(c.alerts, []);
});

// ---- 3. tier_drop (SCORE-AC-05) ----

// M17 clean lot 2026-09-15; M18 lot 2026-10-15 with `rej` rejected at incoming.
const DROP = (rej, o = {}) => [lot({ date: '2026-09-15' }), rej === 0 ? lot(o) : nc({ rejected_qty: rej, ...o })];

test('3: tier_drop fires A -> B in M18 (and M17 has no alert: M16 is Unrated)', () => {
  // M17: DPPM 0/1000, all Good = 100 A. M18: DPPM 5/2000 = 2500 Bad 0 + 20 + 15 + 15 + OTD 2/2 20 = 70 B.
  const c = card(DROP(5));
  assert.deepEqual([c.months[16].tier, c.months[17].composite, c.months[17].tier], ['A', 70, 'B']);
  assert.deepEqual(c.alerts, [alert('tier_drop', 18, 'A → B'), bad(18, 'dppm', 'DPPM 2500 > 2000')]);
});

test('3: near miss, same tier: DPPM 4/2000 = 2000 (Watch edge) gives 85 A, no alert at all', () => {
  // 15 + 20 + 15 + 15 + 20 = 85 -> A, same as M17.
  const c = card(DROP(4));
  assert.deepEqual([c.months[17].composite, c.months[17].tier], [85, 'A']);
  assert.deepEqual(c.alerts, []);
});

test('3: near miss, improvement B -> A raises no tier_drop', () => {
  // M17: 5/1000 = 5000 Bad -> 70 B. M18: 5/101000 = 49.5 -> 50 Good -> 100 A. Only M17's (inactive) metric_bad.
  const c = card([nc({ date: '2026-09-15', rejected_qty: 5 }), lot({ received_qty: 100000 })]);
  assert.deepEqual(c.months.slice(16).map((m) => [m.composite, m.tier]), [[70, 'B'], [100, 'A']]);
  assert.deepEqual(c.alerts, [bad(17, 'dppm', 'DPPM 5000 > 2000')]);
});

test('3: a two-tier drop A -> C is one alert; dppm then otd metric_bad', () => {
  // M18 lot late: DPPM 2500 Bad 0 + 20 + 15 + 15 + OTD 1/2 = 50 Bad 0 = 50 -> C.
  const c = card(DROP(5, { on_time: 0 }));
  assert.deepEqual(c.alerts, [alert('tier_drop', 18, 'A → C'), bad(18, 'dppm', 'DPPM 2500 > 2000'),
    bad(18, 'otd', 'On-time delivery 50 < 85')]);
});

test('3: tier_drop is evaluated in baseline months too (M1-M6)', () => {
  // M1 lot 2025-05-10 clean: M1 100 A. M2 lot 2025-06-10 rejected 5/1000 at incoming:
  // M2 DPPM 5/2000 = 2500 Bad -> 70 B -> tier_drop A -> B at index 2 (inactive).
  const c = card([lot({ date: '2025-05-10' }), nc({ date: '2025-06-10', rejected_qty: 5 })]);
  const drops = c.alerts.filter((a) => a.type === 'tier_drop');
  assert.deepEqual(drops, [{ type: 'tier_drop', month: '2025-06', index: 2, active: false, detail: 'A → B' }]);
});

// ---- 4. scar_aging alert (60 days; SCORE-AC-05) ----

const scarLot = (id, opened, closed = null) => lot({ scar_id: id, scar_opened: opened, scar_closed: closed });

test('4: scar_aging fires at 61 days, before metric_bad in the same month', () => {
  // Opened 2026-08-31: to 2026-09-30 = 30 (M17, no alert), to 2026-10-31 = 61 > 60.
  // The metric: 1 of 1 open SCAR older than 30 -> 100 Bad.
  const c = card([scarLot('SCAR-1', '2026-08-31')]);
  assert.deepEqual(c.alerts, [alert('scar_aging', 18, 'SCAR-1 open 61 days'), bad(18, 'scar_aging', 'SCAR aging 100 > 25')]);
});

test('4: near miss, exactly 60 days: no scar_aging alert, but the 30-day metric is still Bad', () => {
  // Opened 2026-09-01: to 2026-10-31 = 29 + 31 = 60, not more than 60; but 60 > 30 for the metric.
  const c = card([scarLot('SCAR-1', '2026-09-01')]);
  assert.deepEqual(c.alerts, [bad(18, 'scar_aging', 'SCAR aging 100 > 25')]);
});

test('4: several aged SCARs make one alert, oldest first, ties by id', () => {
  // SCAR-Z opened 2026-08-15: 16 + 30 + 31 = 77; SCAR-A opened 2026-08-31: 61. Oldest first, not id order.
  const two = card([scarLot('SCAR-A', '2026-08-31'), scarLot('SCAR-Z', '2026-08-15')]);
  assert.deepEqual(two.alerts.filter((a) => a.type === 'scar_aging'),
    [alert('scar_aging', 18, 'SCAR-Z open 77 days; SCAR-A open 61 days')]);
  // Same opened day: by scar_id.
  const tie = card([scarLot('SCAR-Q', '2026-08-15'), scarLot('SCAR-P', '2026-08-15')]);
  assert.deepEqual(tie.alerts.filter((a) => a.type === 'scar_aging'),
    [alert('scar_aging', 18, 'SCAR-P open 77 days; SCAR-Q open 77 days')]);
});

test('4: a SCAR aged in M16 and closed before M18 leaves an inactive M16 alert only', () => {
  // Opened 2026-06-01, closed 2026-09-15. Ages: 2026-06-30 29; 2026-07-31 60 (no alert, metric Bad);
  // 2026-08-31 91 (alert); 2026-09-30 closed. M18 composite 100 (clean lot), M17 Unrated.
  const c = card([scarLot('SCAR-1', '2026-06-01', '2026-09-15')]);
  assert.deepEqual(c.alerts, [alert('scar_aging', 16, 'SCAR-1 open 91 days'), bad(16, 'scar_aging', 'SCAR aging 100 > 25'),
    bad(15, 'scar_aging', 'SCAR aging 100 > 25')]);
});

test('4: a SCAR closed exactly on the month end is not open then', () => {
  // Closed 2026-08-31: not open at 2026-08-31 (age would be 91) -> no scar_aging alert anywhere.
  assert.deepEqual(card([scarLot('SCAR-1', '2026-06-01', '2026-08-31')]).alerts.filter((a) => a.type === 'scar_aging'), []);
  // Closed one day later: open at 2026-08-31 -> alert in M16.
  assert.deepEqual(card([scarLot('SCAR-1', '2026-06-01', '2026-09-01')]).alerts.filter((a) => a.type === 'scar_aging'),
    [alert('scar_aging', 16, 'SCAR-1 open 91 days')]);
});

// ---- 5. metric_bad: each metric Bad, and its Watch edge not ----

test('5: dppm 2001 Bad vs 2000 Watch', () => {
  // 2001/1e6 lot: escape 0, repeat 0, OTD 100 Good -> only dppm Bad.
  assert.deepEqual(card([nc({ received_qty: 1000000, rejected_qty: 2001 })]).alerts, [bad(18, 'dppm', 'DPPM 2001 > 2000')]);
  assert.deepEqual(card([nc({ rejected_qty: 2 })]).alerts, []); // 2/1000 = 2000
});

test('5: escape 15.1 Bad vs 15 Watch', () => {
  // Two NCs, different codes, received 1e6 each: `num` at line, 1000 - num at incoming.
  // DPPM 1000/2e6 = 500 Good; repeat 0; escape num/1000.
  const rows = (num) => [nc({ received_qty: 1000000, rejected_qty: num, defect_found_at: 'line' }),
    nc({ date: '2026-10-16', received_qty: 1000000, rejected_qty: 1000 - num, failure_mode_code: 'FM-Y' })];
  assert.deepEqual(card(rows(151)).alerts, [bad(18, 'escape', 'Escape rate 15.1 > 15')]);
  assert.deepEqual(card(rows(150)).alerts, []);
});

test('5: repeat NC 33.3 Bad vs 25 Watch', () => {
  // n NCs (1/1000 each, DPPM 1000 Watch), second one repeats the first code: 1 of 3 = 33.3, 1 of 4 = 25.
  const rows = (n) => Array.from({ length: n }, (_, i) => nc({ date: `2026-10-0${i + 1}`, failure_mode_code: i < 2 ? 'FM-R' : `FM-${i}` }));
  assert.deepEqual(card(rows(3)).alerts, [bad(18, 'repeat_nc', 'Repeat NC rate 33.3 > 25')]);
  assert.deepEqual(card(rows(4)).alerts, []);
});

test('5: SCAR aging 33.3 Bad vs 25 Watch', () => {
  // n open SCARs, one opened 2026-09-01 (60 > 30, no alert), the rest 2026-10-15 (16): 1 of 3, 1 of 4.
  const rows = (n) => Array.from({ length: n }, (_, i) => scarLot(`S${i}`, i === 0 ? '2026-09-01' : '2026-10-15'));
  assert.deepEqual(card(rows(3)).alerts, [bad(18, 'scar_aging', 'SCAR aging 33.3 > 25')]);
  assert.deepEqual(card(rows(4)).alerts, []);
});

test('5: OTD 84.9 Bad vs 85 Watch (higher is better, "<")', () => {
  const rows = (k, n) => Array.from({ length: n }, (_, i) => lot({ on_time: i < k ? 1 : 0 }));
  assert.deepEqual(card(rows(849, 1000)).alerts, [bad(18, 'otd', 'On-time delivery 84.9 < 85')]);
  assert.deepEqual(card(rows(17, 20)).alerts, []);
});

test('5: SCORE-AC-09 policy half: OTD 83 alert follows the policy limit (band and text)', () => {
  const rows = Array.from({ length: 100 }, (_, i) => lot({ on_time: i < 83 ? 1 : 0 }));
  assert.deepEqual(card(rows).alerts, [bad(18, 'otd', 'On-time delivery 83 < 85')]);
  const w80 = card(rows, { policy: limits('otd', { watch: 80 }) });
  assert.equal(w80.months[17].metrics.otd.band, 'watch');
  assert.deepEqual(w80.alerts, []);
  assert.deepEqual(card(rows, { policy: limits('otd', { good: 95, watch: 90 }) }).alerts, [bad(18, 'otd', 'On-time delivery 83 < 90')]);
});

test('5: metric_bad fires in a baseline month (M1)', () => {
  // M1 lot 2025-05-10 rejected 5/1000: DPPM 5000 in M1-M3 (windows M1, M1-M2, M1-M3), then empty.
  const c = card([nc({ date: '2025-05-10', rejected_qty: 5 })]);
  assert.deepEqual(c.alerts.map((a) => [a.type, a.index, a.month, a.active, a.detail]), [
    ['metric_bad', 3, '2025-07', false, 'DPPM 5000 > 2000'],
    ['metric_bad', 2, '2025-06', false, 'DPPM 5000 > 2000'],
    ['metric_bad', 1, '2025-05', false, 'DPPM 5000 > 2000'],
  ]);
});

// ---- 6. ordering, active, key order ----

// r1 M10 clean; r2 M17 clean carrying SCAR-0 (opened 2026-06-01, closed 2026-09-15);
// r3 M18 rejected 5 at incoming carrying SCAR-1 (opened 2026-08-31).
// M15 (07-31): SCAR-0 60 -> metric 1/1 = 100 Bad, no alert. M16 (08-31): SCAR-0 91 (alert), SCAR-1 0 ->
// metric 1/2 = 50 Bad. M17 (09-30): SCAR-0 closed, SCAR-1 30 -> 0 Good; DPPM 0 -> 100 A.
// M18: DPPM 5/2000 2500 Bad 0 + escape 20 + repeat 15 + aging (SCAR-1 61) 100 Bad 0 + OTD 20 = 55 C -> A -> C.
const ORDER = [lot({ date: '2026-02-15' }),
  lot({ date: '2026-09-15', scar_id: 'SCAR-0', scar_opened: '2026-06-01', scar_closed: '2026-09-15' }),
  nc({ rejected_qty: 5, scar_id: 'SCAR-1', scar_opened: '2026-08-31' })];
const ORDER_ALERTS = [
  alert('tier_drop', 18, 'A → C'), alert('scar_aging', 18, 'SCAR-1 open 61 days'),
  bad(18, 'dppm', 'DPPM 2500 > 2000'), bad(18, 'scar_aging', 'SCAR aging 100 > 25'),
  alert('scar_aging', 16, 'SCAR-0 open 91 days'), bad(16, 'scar_aging', 'SCAR aging 50 > 25'),
  bad(15, 'scar_aging', 'SCAR aging 100 > 25'),
];

test('6: alerts newest month first, then type order, then metric order; active only in M18', () => {
  assert.deepEqual(card(ORDER).alerts, ORDER_ALERTS);
});

test('6: alert key order; metric only on metric_bad', () => {
  for (const a of card(ORDER).alerts) {
    const keys = ['type', 'month', 'index', 'active', 'detail'];
    assert.deepEqual(Object.keys(a), a.type === 'metric_bad' ? [...keys, 'metric'] : keys);
  }
});

// ---- 7. policy (SCORE-FR-10, SCORE-AC-09) ----

test('7: no policy equals STARK_REFERENCE and echoes its id, version and name', () => {
  const rows = [...ORDER, ...SERIES.map((r) => ({ ...r, supplier_id: 'ACT-02' })),
    lot({ supplier_id: 'ACT-09', date: '2024-01-01' })];
  const r = run(rows);
  assert.deepEqual(r, run(rows, { policy: STARK_REFERENCE }));
  assert.deepEqual(r.policy, { id: 'stark-reference', version: 1, name: 'Stark Reference v1' });
});

test('7: a custom policy echoes its own id, version and name', () => {
  const policy = { ...STARK_REFERENCE, id: 'team-x', version: 3, name: 'Team X' };
  assert.deepEqual(run([lot()], { policy }).policy, { id: 'team-x', version: 3, name: 'Team X' });
});

test('7: SCORE-AC-09 tiers 90/75/55 move composite 85 from A to B (and 70 from B to C)', () => {
  const t = tiers({ A: 90, B: 75, C: 55 });
  // M18 only: DPPM 2/1000 = 2000 Watch -> 85.
  assert.deepEqual(card([nc({ rejected_qty: 2 })]).current, { month: '2026-10', composite: 85, tier: 'A' });
  assert.deepEqual(card([nc({ rejected_qty: 2 })], { policy: t }).current, { month: '2026-10', composite: 85, tier: 'B' });
  // M18 only: DPPM 5000 Bad -> 70: B under the reference, C under 90/75/55.
  assert.equal(card([nc({ rejected_qty: 5 })]).current.tier, 'B');
  assert.equal(card([nc({ rejected_qty: 5 })], { policy: t }).current.tier, 'C');
  // With the clean M17 lot: M17 100 A under both, so 90/75/55 turns section 3's near miss into A -> B.
  assert.deepEqual(card(DROP(4), { policy: t }).alerts, [alert('tier_drop', 18, 'A → B')]);
});

test('7: equal good and watch limits are accepted (empty Watch band)', () => {
  // dppm good = watch = 500: 501 is Bad, and the alert names 500.
  const p = limits('dppm', { good: 500, watch: 500 });
  assert.deepEqual(card([nc({ received_qty: 1000000, rejected_qty: 501 })], { policy: p }).alerts, [bad(18, 'dppm', 'DPPM 501 > 500')]);
  assert.doesNotThrow(() => run([], { policy: limits('otd', { good: 90, watch: 90 }) }));
});

const P = 'policy.scorecard';
const throwsMsg = (policy, message, rows = [lot()]) => assert.throws(() => run(rows, { policy }), { message });

test('7: weights summing to 99 throw; 99.99 and 100.01 are accepted, 99.98 and 100.02 throw', () => {
  throwsMsg(weights({ dppm: 29 }), `${P}.weights: sum is 99, expected 100 (±0.01)`);
  assert.doesNotThrow(() => run([lot()], { policy: weights({ dppm: 29.99 }) }));
  assert.doesNotThrow(() => run([lot()], { policy: weights({ dppm: 30.01 }) }));
  for (const w of [29.98, 30.02]) {
    assert.throws(() => run([lot()], { policy: weights({ dppm: w }) }),
      (e) => e.message.startsWith(`${P}.weights: sum is `) && e.message.endsWith(', expected 100 (±0.01)'), String(w));
  }
});

test('7: invalid scorecard policy throws naming the field, with the exact message', () => {
  const { dppm: _d, ...noDppmLimits } = SC.limits;
  const { escape: _e, ...noEscapeWeight } = SC.weights;
  const cases = [
    [null, `${P}: expected an object`],
    [{ ...STARK_REFERENCE, scorecard: undefined }, `${P}: expected an object`],
    [{ ...STARK_REFERENCE, scorecard: [] }, `${P}: expected an object`],
    // weights
    [withScorecard({ weights: null }), `${P}.weights: expected an object`],
    [withScorecard({ weights: [30, 20, 15, 15, 20] }), `${P}.weights: expected an object`],
    [withScorecard({ weights: noEscapeWeight }), `${P}.weights.escape: missing`],
    [weights({ foo: 0 }), `${P}.weights.foo: unknown metric`],
    [weights({ dppm: -1, escape: 51 }), `${P}.weights.dppm: expected a number >= 0, got -1`],
    [weights({ otd: '20' }), `${P}.weights.otd: expected a number >= 0, got "20"`],
    [weights({ otd: NaN }), `${P}.weights.otd: expected a number >= 0, got null`], // show(NaN) = JSON "null"
    // limits
    [withScorecard({ limits: null }), `${P}.limits: expected an object`],
    [withScorecard({ limits: [] }), `${P}.limits: expected an object`],
    [withScorecard({ limits: noDppmLimits }), `${P}.limits.dppm: missing`],
    [withScorecard({ limits: { ...SC.limits, foo: { good: 1, watch: 2 } } }), `${P}.limits.foo: unknown metric`],
    [withScorecard({ limits: { ...SC.limits, escape: 5 } }), `${P}.limits.escape: expected an object`],
    [limits('dppm', { good: '500' }), `${P}.limits.dppm.good: expected a number, got "500"`],
    [limits('repeat_nc', { watch: undefined }), `${P}.limits.repeat_nc.watch: expected a number, got undefined`],
    [limits('dppm', { good: 500, watch: 100 }), `${P}.limits.dppm.watch: expected a number >= good (500), got 100`],
    [limits('scar_aging', { good: 0, watch: -0.1 }), `${P}.limits.scar_aging.watch: expected a number >= good (0), got -0.1`],
    [limits('otd', { good: 90, watch: 95 }), `${P}.limits.otd.watch: expected a number <= good (90), got 95`],
    // tiers
    [tiers(null), `${P}.tiers: expected an object`],
    [tiers([85, 70, 50]), `${P}.tiers: expected an object`],
    [tiers({ A: 85, B: 70 }), `${P}.tiers.C: missing`],
    [tiers({ A: 85, B: 70, C: 50, D: 0 }), `${P}.tiers.D: unknown tier`],
    [tiers({ A: '85', B: 70, C: 50 }), `${P}.tiers.A: expected a number, got "85"`],
    [tiers({ A: 85, B: 85, C: 50 }), `${P}.tiers.B: expected a number < A (85), got 85`],
    [tiers({ A: 85, B: 90, C: 50 }), `${P}.tiers.B: expected a number < A (85), got 90`],
    [tiers({ A: 85, B: 70, C: 70 }), `${P}.tiers.C: expected a number < B (70), got 70`],
  ];
  for (const [policy, message] of cases) throwsMsg(policy, message);
  // A bad policy throws even with no rows.
  throwsMsg(tiers({ A: 85, B: 85, C: 50 }), `${P}.tiers.B: expected a number < A (85), got 85`, []);
  throwsMsg(null, `${P}: expected an object`, []);
  // Strictly descending custom tiers are accepted.
  assert.doesNotThrow(() => run([], { policy: tiers({ A: 90, B: 75, C: 55 }) }));
});

test('7: qualification policy messages are unchanged by the shared weights check', () => {
  const Q = 'policy.qualification';
  const qw = STARK_REFERENCE.qualification.weights; // 15+15+10+15+10+10+8+7+10 = 100
  const pol = (w) => ({ ...STARK_REFERENCE, qualification: { ...STARK_REFERENCE.qualification, weights: w } });
  const { 9: _n, ...no9 } = qw;
  const cases = [
    [pol(null), `${Q}.weights: expected an object`],
    [pol(no9), `${Q}.weights.9: missing`],
    [pol({ ...qw, 10: 0 }), `${Q}.weights.10: unknown category`],
    [pol({ ...qw, 1: -1, 2: 31 }), `${Q}.weights.1: expected a number >= 0, got -1`],
    [pol({ ...qw, 9: 9 }), `${Q}.weights: sum is 99, expected 100 (±0.01)`],
  ];
  for (const [policy, message] of cases) assert.throws(() => evaluate(null, { as_of: AS_OF, policy }), { message });
  // A qualification-only policy (no scorecard half) still evaluates its own validation path.
  const { id, version, name, qualification } = STARK_REFERENCE;
  assert.throws(() => evaluate(null, { as_of: AS_OF, policy: { id, version, name, qualification } }),
    { message: 'extraction: expected an object' });
  // Without id, version and name the same policy cannot be named, so it is rejected (D-6).
  assert.throws(() => evaluate(null, { as_of: AS_OF, policy: { qualification } }),
    { message: 'policy.id: expected a non-empty string, got undefined' });
});

test('7: scorecard policy identity is required with the evaluate messages (SCORE-FR-10, D-6)', () => {
  for (const [over, message] of POLICY_META_REJECTS) {
    throwsMsg(withMeta(STARK_REFERENCE, over), message);
    throwsMsg(withMeta(STARK_REFERENCE, over), message, []); // even with no rows
  }
  for (const over of POLICY_META_ACCEPTS) {
    const policy = withMeta(STARK_REFERENCE, over);
    assert.deepEqual(run([lot()], { policy }).policy, { id: policy.id, version: policy.version, name: policy.name });
  }
  // Identity is checked after the scorecard half, and the rows before the policy.
  throwsMsg(withMeta(tiers({ A: 85, B: 85, C: 50 }), { id: undefined }), `${P}.tiers.B: expected a number < A (85), got 85`);
  throwsMsg(withMeta(STARK_REFERENCE, { id: '' }), 'rows[0]: received_qty: expected an integer > 0, got 0', [lot({ received_qty: 0 })]);
  // A scorecard-only policy (no qualification half) with its identity is enough for scorecard.
  const { id, version, name, scorecard: s } = STARK_REFERENCE;
  assert.deepEqual(run([lot()], { policy: { id, version, name, scorecard: s } }).policy, { id, version, name });
});

// ---- 8. purity and determinism ----

test('8: frozen inputs pass; same result twice, reversed rows, JSON round trip, inputs unchanged', () => {
  // ORDER covers all three alert types; SERIES (ACT-02) adds Unrated months.
  const rows = deepFreeze(structuredClone([...ORDER, ...SERIES.map((r) => ({ ...r, supplier_id: 'ACT-02' }))]));
  const policy = deepFreeze(structuredClone(STARK_REFERENCE));
  const snap = JSON.stringify([rows, policy]);
  const a = scorecard(rows, { as_of: AS_OF, policy });
  assert.deepEqual(a.suppliers[0].alerts, ORDER_ALERTS);
  assert.deepEqual(scorecard(rows, { as_of: AS_OF, policy }), a);
  assert.deepEqual(scorecard([...rows].reverse(), { as_of: AS_OF, policy }), a);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), a);
  assert.equal(JSON.stringify([rows, policy]), snap);
});

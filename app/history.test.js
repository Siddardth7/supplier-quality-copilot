// History file: parseHistory and the scorecard frame (#20; SCORE-FR-01, -02, SCORE-AC-01).
// Every rule and expected value is written from docs/SCORECARD.md (§ Time frame, § data/history.csv),
// never copied from engine output. "row N" is the file line number, so the first data row is row 2.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHistory, scorecard } from './engine.js';

const SCORECARD_MD = readFileSync(new URL('../docs/SCORECARD.md', import.meta.url), 'utf8');
// The header is taken from the doc's code block, so a doc/code drift fails here.
const HEADER = SCORECARD_MD.match(/```\n(date,[^\n]+)\n```/)[1];
const COLS = HEADER.split(',');

const GOOD = '2026-10-05,ACT-01,CP-2210,1000,5,1,field,FM-LEAK,SCAR-1,2026-09-30,';
const CLEAN = '2026-10-06,ACT-02,CP-1,200,0,0,none,,,,';
// One data line from the CLEAN cells with some columns replaced.
const line = (over = {}) => {
  const base = Object.fromEntries(COLS.map((c, k) => [c, CLEAN.split(',')[k]]));
  return COLS.map((c) => (c in over ? over[c] : base[c])).join(',');
};
const csv = (...lines) => [HEADER, ...lines].join('\n') + '\n';
const NC = { rejected_qty: '3', defect_found_at: 'line', failure_mode_code: 'FM-X' };

// ---- 1. parsing ----

test('1: LF file parses to typed rows; empty nullable cells are null', () => {
  assert.equal(COLS.length, 11);
  assert.deepEqual(parseHistory(csv(GOOD, CLEAN)), [
    { date: '2026-10-05', supplier_id: 'ACT-01', part_no: 'CP-2210', received_qty: 1000, rejected_qty: 5,
      on_time: 1, defect_found_at: 'field', failure_mode_code: 'FM-LEAK', scar_id: 'SCAR-1',
      scar_opened: '2026-09-30', scar_closed: null },
    { date: '2026-10-06', supplier_id: 'ACT-02', part_no: 'CP-1', received_qty: 200, rejected_qty: 0,
      on_time: 0, defect_found_at: 'none', failure_mode_code: null, scar_id: null,
      scar_opened: null, scar_closed: null },
  ]);
});

test('1: CRLF and no-trailing-newline files parse the same as LF', () => {
  const lf = parseHistory(csv(GOOD, CLEAN));
  assert.deepEqual(parseHistory(csv(GOOD, CLEAN).replaceAll('\n', '\r\n')), lf);
  assert.deepEqual(parseHistory([HEADER, GOOD, CLEAN].join('\n')), lf);
});

test('1: header-only file returns []', () => {
  assert.deepEqual(parseHistory(HEADER), []);
  assert.deepEqual(parseHistory(HEADER + '\n'), []);
  assert.deepEqual(parseHistory(HEADER + '\r\n'), []);
});

test('1: accepted edges: rejected = received, leap day, SCAR closed on its opening day', () => {
  const rows = parseHistory(csv(
    line({ received_qty: '7', rejected_qty: '7', defect_found_at: 'incoming', failure_mode_code: 'FM-X' }),
    line({ date: '2024-02-29' }),
    line({ scar_id: 'S9', scar_opened: '2026-10-01', scar_closed: '2026-10-01' }),
  ));
  assert.equal(rows.length, 3);
  assert.equal(rows[0].rejected_qty, 7);
  assert.equal(rows[2].scar_closed, '2026-10-01');
});

// ---- 2. rejections name the file row and the column ----

const rejects = (text, re) => assert.throws(() => parseHistory(text), (e) => e instanceof Error && re.test(e.message),
  `expected ${re}`);

test('2: wrong header', () => {
  rejects(csv(CLEAN).replace('scar_closed', 'scar_close'), /^header: expected "date,supplier_id,/);
  rejects(csv(CLEAN).replace('date,supplier_id', 'supplier_id,date'), /^header: /);
  rejects(' ' + csv(CLEAN), /^header: /);
  rejects('', /^header: /);
});

test('2: wrong column count and blank line mid-file', () => {
  rejects(csv(GOOD, CLEAN.slice(0, -1)), /^row 3: expected 11 columns, got 10$/);
  rejects(csv(GOOD, CLEAN + ','), /^row 3: expected 11 columns, got 12$/);
  rejects(csv(GOOD, '', CLEAN), /^row 3: expected 11 columns, got 1$/);
});

// [column, bad cell overrides] — each row is the second data line, so the label is row 3.
const CELL_CASES = [
  ['date', { date: '2026/10/05' }], ['date', { date: '2026-02-30' }], ['date', { date: '2026-13-01' }],
  ['date', { date: '' }], ['date', { date: '2025-02-29' }],
  ['supplier_id', { supplier_id: 'SUP-07' }], ['supplier_id', { supplier_id: 'ACT-1' }],
  ['supplier_id', { supplier_id: 'ACT-001' }], ['supplier_id', { supplier_id: '' }],
  ['part_no', { part_no: '' }],
  ['received_qty', { received_qty: '0' }], ['received_qty', { received_qty: '-5' }],
  ['received_qty', { received_qty: '1.5' }], ['received_qty', { received_qty: 'abc' }],
  ['received_qty', { received_qty: '' }], ['received_qty', { received_qty: '1e3' }],
  ['received_qty', { received_qty: ' 200' }],
  ['rejected_qty', { ...NC, rejected_qty: '201' }], ['rejected_qty', { rejected_qty: '-1' }],
  ['rejected_qty', { ...NC, rejected_qty: '1.5' }], ['rejected_qty', { rejected_qty: '' }],
  ['on_time', { on_time: '2' }], ['on_time', { on_time: '' }], ['on_time', { on_time: 'yes' }],
  ['on_time', { on_time: '-1' }],
  ['defect_found_at', { defect_found_at: 'shipping' }], ['defect_found_at', { defect_found_at: '' }],
  ['defect_found_at', { defect_found_at: 'Line', rejected_qty: '3', failure_mode_code: 'FM-X' }],
  ['defect_found_at', { ...NC, defect_found_at: 'none' }],
  ['defect_found_at', { defect_found_at: 'line' }],
  ['failure_mode_code', { ...NC, failure_mode_code: '' }],
  ['failure_mode_code', { failure_mode_code: 'FM-X' }],
  ['scar_opened', { scar_id: 'S1' }],
  ['scar_opened', { scar_id: 'S1', scar_opened: '2026-09-31' }],
  ['scar_closed', { scar_id: 'S1', scar_opened: '2026-09-01', scar_closed: '2026-13-01' }],
  // SCAR dates are chronological (SCORECARD.md): dates without a scar_id, or closed before opened.
  ['scar_opened', { scar_opened: '2026-09-01' }],
  ['scar_closed', { scar_closed: '2026-09-01' }],
  ['scar_closed', { scar_id: 'S1', scar_opened: '2026-09-02', scar_closed: '2026-09-01' }],
];

test('2: every column rule rejects the file naming row 3 and the column', () => {
  for (const [col, over] of CELL_CASES) {
    rejects(csv(CLEAN, line(over)), new RegExp(`^row 3: ${col}: `));
  }
});

test('2: the defect_found_at iff message names both values', () => {
  rejects(csv(line({ ...NC, defect_found_at: 'none' })), /^row 2: defect_found_at: .*"none".*rejected_qty 3/);
  rejects(csv(line({ defect_found_at: 'field' })), /^row 2: defect_found_at: .*"field".*rejected_qty 0/);
});

test('2: rows sharing a scar_id must carry the same dates; the message names both rows', () => {
  const s = (opened, closed = '') => line({ scar_id: 'S1', scar_opened: opened, scar_closed: closed });
  rejects(csv(s('2026-10-06'), CLEAN, s('2026-10-07')),
    /^row 4: scar_opened: S1 differs from row 2 \("2026-10-07" vs "2026-10-06"\)$/);
  rejects(csv(s('2026-10-06', '2026-10-20'), CLEAN, s('2026-10-06', '2026-10-21')),
    /^row 4: scar_closed: S1 differs from row 2 \("2026-10-21" vs "2026-10-20"\)$/);
  rejects(csv(s('2026-10-06', '2026-10-20'), s('2026-10-06')), /^row 3: scar_closed: S1 differs from row 2/);
  // The rule is file-wide: the same scar_id on two suppliers must also agree.
  rejects(csv(s('2026-10-06'), line({ supplier_id: 'ACT-07', scar_id: 'S1', scar_opened: '2026-10-07', scar_closed: '' })),
    /^row 3: scar_opened: S1 differs from row 2/);
  // Same id, same dates: fine.
  assert.equal(parseHistory(csv(s('2026-10-06', '2026-10-20'), s('2026-10-06', '2026-10-20'))).length, 2);
});

test('2: the first violation in file order wins', () => {
  rejects(csv(CLEAN, line({ on_time: '2' }), CLEAN, line({ date: 'x' })), /^row 3: on_time: /);
  // A cross-row mismatch on row 4 beats a per-row error on row 5.
  const s = (opened) => line({ scar_id: 'S1', scar_opened: opened });
  rejects(csv(s('2026-10-01'), CLEAN, s('2026-10-02'), line({ part_no: '' })), /^row 4: scar_opened: S1 differs/);
  // A per-row error on row 3 beats a cross-row mismatch on row 4.
  rejects(csv(s('2026-10-01'), line({ part_no: '' }), s('2026-10-02')), /^row 3: part_no: /);
  // Within one row, the earlier column is reported first.
  rejects(csv(line({ date: 'x', on_time: '9' })), /^row 2: date: /);
});

test('2: integer cells are canonical: "-0" and leading zeros stay text and fail the column rule (#23)', () => {
  const exact = (over, message) => assert.throws(() => parseHistory(csv(line(over))), { message }, JSON.stringify(over));
  exact({ received_qty: '-0' }, 'row 2: received_qty: expected an integer > 0, got "-0"');
  exact({ rejected_qty: '-0' }, 'row 2: rejected_qty: expected an integer from 0 to received_qty (200), got "-0"');
  exact({ on_time: '-0' }, 'row 2: on_time: expected 0 or 1, got "-0"');
  exact({ received_qty: '010' }, 'row 2: received_qty: expected an integer > 0, got "010"');
  exact({ received_qty: '0200' }, 'row 2: received_qty: expected an integer > 0, got "0200"');
  exact({ rejected_qty: '00' }, 'row 2: rejected_qty: expected an integer from 0 to received_qty (200), got "00"');
  exact({ on_time: '01' }, 'row 2: on_time: expected 0 or 1, got "01"');
  exact({ on_time: '00' }, 'row 2: on_time: expected 0 or 1, got "00"');
  // Negative integers are still parsed as numbers and fail on range, not on pattern.
  exact({ received_qty: '-5' }, 'row 2: received_qty: expected an integer > 0, got -5');
  exact({ rejected_qty: '-1' }, 'row 2: rejected_qty: expected an integer from 0 to received_qty (200), got -1');
  // Canonical edges parse to numbers: 0, 1, 10, and a multi-digit number with an inner zero.
  const [a, b] = parseHistory(csv(line({ received_qty: '10', rejected_qty: '0', on_time: '1' }),
    line({ received_qty: '1000', rejected_qty: '10', on_time: '0', defect_found_at: 'line', failure_mode_code: 'FM-X' })));
  assert.deepEqual([a.received_qty, a.rejected_qty, a.on_time], [10, 0, 1]);
  assert.deepEqual([b.received_qty, b.rejected_qty, b.on_time], [1000, 10, 0]);
});

test('4: parseHistory of a non-string throws history: expected text', () => {
  for (const v of [undefined, null, 42, [HEADER], { text: HEADER }]) {
    assert.throws(() => parseHistory(v), { message: 'history: expected text' });
  }
});

// ---- 3. the same rules on rows passed straight to scorecard, labelled rows[i] ----

const AS_OF = '2026-11-01';
const lot = (o = {}) => ({ date: '2026-10-15', supplier_id: 'ACT-01', part_no: 'P1', received_qty: 1000,
  rejected_qty: 0, on_time: 1, defect_found_at: 'none', failure_mode_code: null, scar_id: null,
  scar_opened: null, scar_closed: null, ...o });
const sc = (rows, as_of = AS_OF) => scorecard(rows, { as_of });
const scRejects = (rows, re) => assert.throws(() => sc(rows), (e) => e instanceof Error && re.test(e.message),
  `expected ${re}`);

test('3: hand-made rows get the same validation, labelled rows[i]', () => {
  scRejects([lot(), lot({ received_qty: 0 })], /^rows\[1\]: received_qty: /);
  scRejects([lot(), lot(), lot({ supplier_id: 'SUP-07' })], /^rows\[2\]: supplier_id: /);
  scRejects([lot(), 'x'], /^rows\[1\]: expected an object/);
  scRejects([lot(), null], /^rows\[1\]: expected an object/);
  // Integer-only numerics: strings, booleans and fractions are not integers.
  scRejects([lot({ received_qty: '1000' })], /^rows\[0\]: received_qty: /);
  scRejects([lot({ received_qty: 10.5 })], /^rows\[0\]: received_qty: /);
  scRejects([lot({ on_time: true })], /^rows\[0\]: on_time: /);
  scRejects([lot({ rejected_qty: 1001, defect_found_at: 'line', failure_mode_code: 'FM-X' })], /^rows\[0\]: rejected_qty: /);
  scRejects([lot({ scar_opened: '2026-09-01' })], /^rows\[0\]: scar_opened: /);
  scRejects([lot({ scar_closed: '2026-09-01' })], /^rows\[0\]: scar_closed: /);
  scRejects([lot({ scar_id: 'S1', scar_opened: '2026-09-02', scar_closed: '2026-09-01' })], /^rows\[0\]: scar_closed: /);
  scRejects([lot({ scar_id: 'S1', scar_opened: '2026-09-01' }), lot({ scar_id: 'S1', scar_opened: '2026-09-02' })],
    /^rows\[1\]: scar_opened: S1 differs from rows\[0\]/);
  scRejects('rows', /^rows: expected an array$/);
});

test('3: a hole in a sparse rows array is a labelled row error, never a bare TypeError (#23)', () => {
  const labelled = (rows, message) => assert.throws(() => sc(rows),
    (e) => e instanceof Error && !(e instanceof TypeError) && e.message === message, message);
  labelled([, lot()], 'rows[0]: expected an object');
  labelled([lot(), , lot()], 'rows[1]: expected an object');
  labelled([lot(), ,], 'rows[1]: expected an object');
  labelled(new Array(3), 'rows[0]: expected an object');
});

test('3: rows after a SCAR row are still checked, and the SCAR match names the earlier row index', () => {
  const s = (opened) => lot({ scar_id: 'S1', scar_opened: opened });
  scRejects([s('2026-09-01'), lot({ received_qty: 0 })], /^rows\[1\]: received_qty: /);
  scRejects([s('2026-09-01'), s('2026-09-01'), lot({ part_no: '' })], /^rows\[2\]: part_no: /);
  scRejects([s('2026-09-01'), lot(), s('2026-09-02')], /^rows\[2\]: scar_opened: S1 differs from rows\[0\] \("2026-09-02" vs "2026-09-01"\)$/);
  // Matching SCAR rows apart from each other are compared with the first one, not the row just before.
  assert.doesNotThrow(() => sc([s('2026-09-01'), lot(), s('2026-09-01')]));
});

test('3: hand-made rows must use null, not undefined, for empty cells', () => {
  for (const col of ['failure_mode_code', 'scar_id', 'scar_opened', 'scar_closed']) {
    scRejects([lot({ [col]: undefined })], new RegExp(`^rows\\[0\\]: ${col}: `));
  }
});

// ---- 5. frame (SCORECARD.md § Time frame) ----

const frame = (first, last) => {
  const out = [];
  let y = Number(first.slice(0, 4)), m = Number(first.slice(5, 7));
  while (out.at(-1) !== last) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    if (++m === 13) { m = 1; y += 1; }
  }
  return out;
};

test('5: as_of 2026-11-01 gives the 18 months 2025-05 to 2026-10', () => {
  const r = sc([]);
  assert.equal(r.months.length, 18);
  assert.equal(r.months[0], '2025-05');
  assert.equal(r.months[17], '2026-10');
  assert.deepEqual(r.months, frame('2025-05', '2026-10'));
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(r.suppliers, []);
});

test('5: year rollover and mid-month as_of', () => {
  assert.deepEqual(sc([], '2026-01-15').months, frame('2024-07', '2025-12'));
  assert.deepEqual(sc([], '2027-01-01').months, frame('2025-07', '2026-12'));
  assert.deepEqual(sc([], '2026-12-31').months, frame('2025-06', '2026-11'));
  const rows = [lot({ date: '2025-05-01' }), lot({ date: '2026-10-31', rejected_qty: 3, defect_found_at: 'line',
    failure_mode_code: 'FM-X' }), lot({ date: '2026-11-15' })];
  assert.deepEqual(sc(rows, '2026-11-30'), sc(rows, '2026-11-01'));
});

test('5: month ends follow the calendar: Feb 2024 has 29 days, Feb 2026 has 28', () => {
  // SCAR opened Jan 29: age at the Feb month end is 31 days (aged) in 2024, 30 days (not aged) in 2026.
  const s = (y) => [lot({ date: `${y}-02-10`, scar_id: 'S1', scar_opened: `${y}-01-29` })];
  const m18 = (y) => sc(s(y), `${y}-03-01`).suppliers[0].months[17];
  assert.equal(m18(2024).month, '2024-02');
  assert.equal(m18(2024).metrics.scar_aging.value, 100);
  assert.equal(m18(2026).month, '2026-02');
  assert.equal(m18(2026).metrics.scar_aging.value, 0);
});

test('7: invalid as_of throws the evaluate message', () => {
  for (const v of [undefined, '2026-11', '2026-02-30', '20261101', 20261101]) {
    assert.throws(() => scorecard([], { as_of: v }), { message: `as_of: expected an ISO day YYYY-MM-DD, got ${v === undefined ? 'undefined' : JSON.stringify(v)}` });
  }
});

// ---- 6. out-of-frame rows ----

test('6: rows before M1 and in the as_of month are ignored with one plural warning; boundary days are inside', () => {
  const rows = [
    lot({ date: '2025-05-01' }), // first day of M1: inside
    lot({ date: '2026-10-31' }), // last day of M18: inside
    lot({ date: '2025-04-30', rejected_qty: 1000, defect_found_at: 'line', failure_mode_code: 'FM-OUT', on_time: 0 }),
    lot({ date: '2026-11-05', rejected_qty: 1000, defect_found_at: 'line', failure_mode_code: 'FM-OUT', on_time: 0,
      scar_id: 'S-OUT', scar_opened: '2026-01-01' }),
  ];
  const r = sc(rows);
  assert.deepEqual(r.warnings, ['ignored 2 rows dated outside 2025-05 to 2026-10']);
  const [s] = r.suppliers;
  // The in-frame rows have no rejects and are on time, so any leak of the ignored rows shows up here.
  for (const k of [0, 17]) {
    assert.equal(s.months[k].metrics.dppm.value, 0, `M${k + 1} dppm`);
    assert.equal(s.months[k].metrics.otd.value, 100, `M${k + 1} otd`);
    assert.equal(s.months[k].metrics.escape.value, 0, `M${k + 1} escape`);
  }
  assert.equal(s.months[17].metrics.scar_aging.value, 0);
  assert.deepEqual(s.open_scars, []);
  assert.deepEqual(s.failure_modes, []);
});

test('6: one ignored row gives the singular warning; none gives no warning', () => {
  assert.deepEqual(sc([lot({ date: '2025-05-01' }), lot(), lot({ date: '2026-11-01' })]).warnings, ['ignored 1 row dated outside 2025-05 to 2026-10']);
  assert.deepEqual(sc([lot({ date: '2025-05-01' }), lot({ date: '2026-10-31' })]).warnings, []);
  assert.deepEqual(sc([lot({ date: '2024-07-01' })], '2026-01-15').warnings, []);
  assert.deepEqual(sc([lot({ date: '2024-07-01' }), lot({ date: '2024-06-30' })], '2026-01-15').warnings, ['ignored 1 row dated outside 2024-07 to 2025-12']);
});

test('6: roster is every supplier_id, sorted; an out-of-frame-only supplier has null DPPM and OTD', () => {
  const r = sc([lot({ supplier_id: 'ACT-10' }), lot({ supplier_id: 'ACT-02' }), lot({ supplier_id: 'ACT-09', date: '2024-01-01' })]);
  assert.deepEqual(r.suppliers.map((s) => s.supplier_id), ['ACT-02', 'ACT-09', 'ACT-10']);
  const s9 = r.suppliers[1];
  assert.equal(s9.months.length, 18);
  for (const m of s9.months) {
    assert.deepEqual(m.metrics.dppm, { value: null, band: null, points: null }, m.month);
    assert.deepEqual(m.metrics.otd, { value: null, band: null, points: null }, m.month);
    for (const k of ['escape', 'repeat_nc', 'scar_aging']) assert.equal(m.metrics[k].value, 0, `${m.month} ${k}`);
  }
  assert.deepEqual(s9.open_scars, []);
  assert.deepEqual(s9.failure_modes, []);
});

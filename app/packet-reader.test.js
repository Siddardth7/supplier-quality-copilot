// Rules-based packet reader (issue 172; PRD-05 UIQ-FR-21, -22, -24, UIQ-NFR-03, UIQ-AC-14, -15, -17; D1-D11).
// Small hand-made files pin each rule; the shipped-packet accuracy lives in scripts/reader-accuracy.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { RUBRIC, STARK_REFERENCE } from './engine.js';
import { checklist, blankEntry, setPart, scoreEntry, REFUSED, entryRows, toRecord, entryFromRecord } from './manual.js';
import { PACKET_FILES, renderPacket, sheetBody } from './packet.js';
import { packetPanel, renderEntry } from './entry.js';
import { esc } from './html.js';
import {
  CRITERION_HEADINGS, FORMAT_HELP, NO_MATCH, NOTHING, RFQ_DETAIL, SAMPLE_DIR, MAX_FILE_BYTES, MAX_TOTAL_BYTES,
  titleKey, decodeFiles, readPacket, uploadedFile,
} from './packet-reader.js';
import { renderRequirements } from '../sim/render-requirements.mjs';
import { forbidden } from '../sim/brief.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const COLD = 'cold_plate';
const CTX = { as_of: '2026-11-01', policy: STARK_REFERENCE };
const testName = (id) => RUBRIC.tests.find((t) => t.id === id).name;
const enc = (s) => new TextEncoder().encode(s);
/** One file, one or more sections; returns readPacket's result. */
const read = (md, { file = 'quality_manual.md', commodity = COLD, partNo = null } = {}) =>
  readPacket([{ name: file, text: md }], commodity, partNo);
/** The row for id after reading a single "## 1.1 <title>" section with body. */
const rowOf = (id, body, opts) => {
  const title = CRITERION_HEADINGS[id] ?? testName(id);
  const r = read(`## 1.1 ${title}\n\n${body}\n`, opts);
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.rows[id];
};
const proven = (value, where = 'quality_manual.md §1.1') => ({ state: 'verified', value, where, note: '', flag: null });
const F1 = 'Check: this section mentions a result the reader could not read. Read as a claim.';
const F6 = 'Check: this section has more than one "recorded result" line. The first was used; confirm it on the cited page.';
const F4 = 'Check: the section says true but also reports a result that does not meet the buyer limit.';
const F2 = (tok, need) => `Check: found "${tok}" but this row needs ${need}. Read as a claim.`;

// ---- heading table ----

test('UIQ-FR-22 D1: CRITERION_HEADINGS is the sim/brief.mjs topics verbatim and covers exactly the core criteria', () => {
  const src = readFileSync(join(ROOT, 'sim', 'brief.mjs'), 'utf8');
  const block = src.slice(src.indexOf('const topics = {'), src.indexOf('};', src.indexOf('const topics = {')));
  const topics = Object.fromEntries([...block.matchAll(/'(\d\.[a-z_0-9]+)': '([^']+)'/g)].map((m) => [m[1], m[2]]));
  assert.equal(Object.keys(topics).length, 27);
  assert.deepEqual(CRITERION_HEADINGS, topics);
  assert.deepEqual(Object.keys(CRITERION_HEADINGS).sort(), RUBRIC.criteria.map((c) => c.id).sort());
});

test('UIQ-FR-22: every RUBRIC test name resolves to its test id through the title table', () => {
  for (const t of RUBRIC.tests) {
    const key = RUBRIC.commodities.find((p) => checklist(p.key).some((r) => r.id === t.id)).key;
    const r = readPacket([{ name: 'reliability_report.md', text: `## 1.1 ${t.name}\n\nRecorded result: ${t.type === 'number' ? 95 : true}.\n` }], key);
    assert.equal(r.ok, true, t.name);
    assert.deepEqual([r.rows[t.id].state, r.rows[t.id].value], ['verified', t.type === 'number' ? 95 : true], t.name);
    assert.deepEqual(r.unmatched, [], t.name);
  }
});

test('D1: titleKey normalizes case, whitespace and one trailing period; a different wording does not match', () => {
  assert.equal(titleKey('  Lot   TRACEABILITY. '), 'lot traceability');
  for (const t of ['LOT TRACEABILITY', '  Lot\ttraceability  ', 'Lot traceability.', 'lot  traceability']) {
    const r = read(`## 1.1 ${t}\n\nRecorded result: true.\n`);
    assert.equal(r.rows['5.lot_trace'].state, 'verified', t);
  }
  const r = read('## 1.1 Lot traceability\n\nRecorded result: true.\n## 1.2 Lot trace\n\nRecorded result: true.\n');
  assert.deepEqual(r.unmatched, [{ file: 'quality_manual.md', section: '1.2', title: 'Lot trace', reason: 'no checklist row has this title' }]);
});

// ---- value ladder P1-P3 and typed conversion ----

test('UIQ-FR-22 P1: every recorded-result form, typed by the row (bool, number, date, enum)', () => {
  assert.deepEqual(rowOf('5.lot_trace', 'Recorded result: true.'), proven(true));
  assert.deepEqual(rowOf('5.lot_trace', 'The recorded result is true.'), proven(true));
  assert.deepEqual(rowOf('5.lot_trace', 'Lots are traced (recorded result: true).'), proven(true));
  assert.deepEqual(rowOf('2.ctq_cpk', 'The recorded result for process capability is 1.3187.'), proven(1.3187));
  assert.deepEqual(rowOf('2.ctq_cpk', 'Recorded result: 1.33.'), proven(1.33));
  assert.deepEqual(rowOf('1.cert_current', 'Recorded result: 2027-07-20.'), proven('2027-07-20'));
  assert.deepEqual(rowOf('9.region_risk', 'Recorded result: Medium.'), proven('medium'));
  assert.deepEqual(rowOf('9.financial_health', '(recorded result: watch)'), proven('watch'));
});

test('UIQ-FR-22 P2: bool rows read "recorded as true" and "(true)"; not for non-bool rows', () => {
  assert.deepEqual(rowOf('5.lot_trace', 'Lot traceability is recorded as true: lots map to heats.'), proven(true));
  assert.deepEqual(rowOf('5.lot_trace', 'Lot traceability is demonstrated (true).'), proven(true));
  assert.deepEqual(rowOf('5.lot_trace', 'Lot traceability is recorded as false: none.'), proven(false));
  assert.equal(rowOf('2.ctq_cpk', 'Capability is demonstrated (true).').state, 'assumed');
});

test('UIQ-FR-22 P3: number, date and enum rows read "The recorded <thing> is X"', () => {
  assert.deepEqual(rowOf('5.records_retention', 'The recorded retention period is 12 years.'), proven(12));
  assert.deepEqual(rowOf('7.pcn_notice', 'The recorded advance change notice period is 116 days.'), proven(116));
  assert.deepEqual(rowOf('6.capacity_ratio', 'The recorded demonstrated-output-to-peak-weekly-demand ratio is 1.5008125.'), proven(1.5008125));
  assert.deepEqual(rowOf('9.region_risk', 'The recorded regional continuity exposure is low (category).'), proven('low'));
  assert.deepEqual(rowOf('1.cert_current', 'The recorded expiry date is 2027-07-20.'), proven('2027-07-20'));
  assert.equal(rowOf('5.lot_trace', 'The recorded trace status is complete.').state, 'assumed', 'P3 is not for bool rows');
});

test('spec 5: band-edge, scientific, negative and tiny numbers pass through verbatim as numbers', () => {
  for (const [txt, v] of [['1.33', 1.33], ['1', 1], ['10', 10], ['30', 30], ['0.8', 0.8], ['90', 90], ['8.2e-7', 8.2e-7],
    ['-0.5', -0.5], ['0.0000001', 1e-7], ['1E3', 1000]]) {
    assert.deepEqual(rowOf('3.grr', `Recorded result: ${txt}.`), proven(v), txt);
  }
});

test('review 172: exponent-form numbers reach the engine as plain decimals and score (entryRows)', () => {
  for (const [txt, want] of [['8.2e-7', '0.00000082'], ['0.0000001', '0.0000001'], ['1.3187', '1.3187'], ['1E3', '1000']]) {
    const r = read(`## 1.1 ${CRITERION_HEADINGS['3.grr']}\n\nRecorded result: ${txt}.\n`, { file: 'msa.md' });
    assert.equal(r.ok, true, txt);
    const rows = entryRows(r.rows);
    assert.equal(rows['3.grr'].value, want, txt);
    let e = setPart({ ...blankEntry(), name: 'Brand Corporation', step: 2 }, { commodity: COLD, part_no: 'SI-CP-0007' });
    e = { ...e, rows: { ...e.rows, ...rows } };
    const v = scoreEntry({ ...e, id: 'NEW-01' }, CTX);
    assert.equal(v.rows['3.grr']?.issue ?? null, null, `${txt}: no engine error on the row`);
    assert.equal(v.blocked, false, txt);
    const saved = toRecord(e, { id: 'NEW-01', saved_at: CTX.as_of });
    const reopened = entryFromRecord(saved);
    assert.equal(reopened.rows['3.grr'].value, want, txt);
    const rescored = scoreEntry(reopened, CTX);
    assert.equal(rescored.rows['3.grr'].issue, null, txt);
    assert.deepEqual(rescored.result, v.result);
  }
});

test('UIQ-FR-22: "Recorded result: false" is a proven failure (value false), not a claim', () => {
  assert.deepEqual(rowOf('6.lead_time', 'Recorded result: false. This is not demonstrated.'), proven(false));
  assert.deepEqual(rowOf('9.second_source', 'The recorded result is false.'), proven(false));
});

test('D5: a claimed section that names a number in prose stays valueless; note quotes the first sentence', () => {
  assert.deepEqual(rowOf('5.records_retention', 'We keep records for 12 years. Archives are offsite.'),
    { state: 'assumed', value: null, where: 'quality_manual.md §1.1', note: 'We keep records for 12 years.', flag: null });
});

test('PRD-04: claimed note is at most 240 chars; exactly 240 kept whole, 241 cut to 240 with …', () => {
  const s240 = `${'a'.repeat(239)}.`;
  assert.equal(rowOf('1.capa', s240).note, s240);
  const s241 = `${'b'.repeat(240)}.`;
  const cut = rowOf('1.capa', s241).note;
  assert.equal(cut.length, 240);
  assert.equal(cut, `${'b'.repeat(239)}…`);
});

test('UIQ-FR-22: a checklist row with no section is Missing with the fixed note', () => {
  assert.deepEqual(read('## 1.1 Lot traceability\n\nRecorded result: true.\n').rows['1.capa'],
    { state: 'missing', value: null, where: '', note: 'No matching section in the uploaded packet', flag: null });
});

// ---- flags F1-F6 ----

test('F2: a result that does not convert to the row type is Claimed, valueless, with the exact message', () => {
  const claim = (row, flag) => ({ ...row, state: 'assumed', value: null, flag });
  const f = (id, body) => rowOf(id, body);
  assert.deepEqual(f('5.lot_trace', 'Recorded result: yes.'), claim({ where: 'quality_manual.md §1.1', note: 'Recorded result: yes.' }, F2('yes', 'true or false')));
  assert.equal(f('2.ctq_cpk', 'Recorded result: twelve.').flag, F2('twelve', 'a number'));
  assert.equal(f('1.cert_current', 'Recorded result: 20/07/2027.').flag, F2('20/07/2027', 'a date YYYY-MM-DD'));
  const enumRow = f('9.region_risk', 'Recorded result: medium-high.');
  assert.equal(enumRow.state, 'assumed');
  assert.equal(enumRow.value, null);
  assert.equal(enumRow.flag, F2('medium-high', 'one of: low, medium, high'));
  assert.equal(f('2.ctq_cpk', 'Recorded result: 1.2.3.').flag, F2('1.2.3', 'a number'));
});

test('F1: no value hit but the body mentions a result -> Claimed with the F1 flag; plain claim has no flag', () => {
  const r = rowOf('1.capa', 'Corrective actions are measured monthly.');
  assert.deepEqual([r.state, r.value, r.flag], ['assumed', null, F1]);
  assert.equal(rowOf('1.capa', 'We track corrective actions to closure.').flag, null);
});

test('F4: bool true next to "does not meet buyer limit" is Claimed and carries the flag', () => {
  const r = rowOf('4.leak_test', 'Recorded result: true.\nHelium leak rate (acceptance): Observed: 9e-5. Result: does not meet buyer limit.',
    { file: 'reliability_report.md' });
  assert.deepEqual(r, { state: 'assumed', value: null, where: 'reliability_report.md §1.1', note: 'Recorded result: true.', flag: F4 });
  assert.deepEqual(rowOf('4.leak_test', 'Recorded result: false.\nResult: does not meet buyer limit.', { file: 'reliability_report.md' }), proven(false, 'reliability_report.md §1.1'));
});

test('F5: a second section for the same row is listed as a duplicate and flags the first; first wins', () => {
  const r = readPacket([
    { name: 'quality_manual.md', text: '## 1.1 Lot traceability\n\nRecorded result: true.\n' },
    { name: 'subtier.md', text: '## 2.4 Lot traceability\n\nRecorded result: false.\n## 2.5 lot traceability.\n\nNo.\n' },
  ], COLD);
  assert.deepEqual(r.rows['5.lot_trace'], { ...proven(true), flag: 'Check: another section also matches this row (subtier.md §2.4). The first was used. '
    + 'Check: another section also matches this row (subtier.md §2.5). The first was used.' });
  assert.deepEqual(r.unmatched, [
    { file: 'subtier.md', section: '2.4', title: 'Lot traceability', reason: 'duplicate of quality_manual.md §1.1' },
    { file: 'subtier.md', section: '2.5', title: 'lot traceability.', reason: 'duplicate of quality_manual.md §1.1' },
  ]);
  assert.equal(r.counts.flagged, 1);
});

test('F3: the cover letter naming another part pushes a warning; the same part or no partNo does not', () => {
  const files = [{ name: 'cover_letter.md', text: 'We quote part SI-CP-0007 rev A.\n' },
    { name: 'quality_manual.md', text: '## 1.1 Lot traceability\n\nRecorded result: true.\n' }];
  assert.deepEqual(readPacket(files, COLD, 'SI-CP-0001').warnings, ['The cover letter names part SI-CP-0007 but you picked SI-CP-0001.']);
  assert.deepEqual(readPacket(files, COLD, 'SI-CP-0007').warnings, []);
  assert.deepEqual(readPacket(files, COLD).warnings, []);
});

// ---- trust rule (D11, UIQ-FR-22): only plain body lines; only the first recorded-result line ----

test('D11: a result in a heading, blockquote, table cell, code span or fenced block is never read', () => {
  const inHeading = read('## 1.1 Lot traceability Recorded result: true\n\nWe trace lots.\n## 1.2 Corrective-action program\n\nWe fix.\n');
  assert.equal(inHeading.rows['5.lot_trace'].state, 'missing');
  assert.equal(inHeading.unmatched[0].reason, 'no checklist row has this title');
  for (const body of ['> Recorded result: true.', '| Recorded result: true |', 'See `Recorded result: true` above.',
    'See `Recorded result: true .` in the log.', '```\nRecorded result: true.\n```', '~~~\nRecorded result: true.\n~~~', '> Lot traceability is recorded as true.', '| (true) |']) {
    const r = rowOf('5.lot_trace', body);
    assert.equal(r.state, 'assumed', body);
    assert.equal(r.value, null, body);
  }
});

test('D11: a numbered heading inside a fenced block is not a section', () => {
  const r = read('## 1.1 Lot traceability\n\nRecorded result: true.\n```\n## 1.2 Corrective-action program\nRecorded result: true.\n```\n');
  assert.equal(r.rows['1.capa'].state, 'missing');
  assert.deepEqual(r.unmatched, []);
});

test('D11 F6: two recorded-result lines: the first is parsed, the second ignored, F6 shown', () => {
  assert.deepEqual(rowOf('5.lot_trace', 'Recorded result: true.\nRecorded result: false.'), { ...proven(true), flag: F6 });
  // The first does not convert: no fallback to the second (F2 + F6, Claimed).
  const r = rowOf('5.lot_trace', 'Recorded result: yes.\nRecorded result: true.');
  assert.deepEqual([r.state, r.value, r.flag], ['assumed', null, `${F2('yes', 'true or false')} ${F6}`]);
});

test('D11: when a section has a recorded-result line, other lines are not searched (no P2/P3 elsewhere)', () => {
  const r = rowOf('5.lot_trace', 'The recorded result appears in the appendix.\nLot traceability is recorded as true.');
  assert.deepEqual([r.state, r.value, r.flag], ['assumed', null, F1]);
  const n = rowOf('5.records_retention', 'Recorded result pending.\nThe recorded retention period is 12 years.');
  assert.deepEqual([n.state, n.value], ['assumed', null]);
  // Only the first recorded-result line: a later one that would parse is not read.
  const later = rowOf('5.lot_trace', 'Recorded result pending.\nRecorded result: true.');
  assert.deepEqual([later.state, later.value, later.flag], ['assumed', null, F1]);
  // A single result line among others: still read.
  assert.deepEqual(rowOf('5.lot_trace', 'We trace lots.\nRecorded result: true.'), proven(true));
});

test('D11: the help text says what Proven means', () => {
  assert.ok(FORMAT_HELP.includes('Proven = the packet records a result; confirm it on the cited page before saving'));
  assert.ok(FORMAT_HELP.includes('Real PDFs, scans and free-form packets need the AI reader (planned).'));
});

// ---- sections and structure ----

test('spec 3.2: unmatched reasons: unknown title, a test from another commodity\'s checklist', () => {
  const cold = new Set(checklist(COLD).map((r) => r.id));
  const other = RUBRIC.tests.find((t) => !cold.has(t.id));
  const r = readPacket([{ name: 'reliability_report.md', text: `## 1.1 ${testName('4.leak_test')}\n\nRecorded result: true.\n`
    + `## 1.2 ${other.name}\n\nRecorded result: true.\n## 1.3 Widget polish\n\nShiny.\n` }], COLD);
  assert.deepEqual(r.unmatched, [
    { file: 'reliability_report.md', section: '1.2', title: other.name, reason: 'does not apply to this part' },
    { file: 'reliability_report.md', section: '1.3', title: 'Widget polish', reason: 'no checklist row has this title' },
  ]);
  assert.equal(r.rows[other.id], undefined);
});

test('spec 3.2: rfq.md is stored, never read; its headings never reach unmatched', () => {
  const r = readPacket([{ name: 'rfq.md', text: '## 1.1 Lot traceability\n\nRecorded result: true.\n## 9 Junk\n\nx\n' },
    { name: 'msa.md', text: '## 1.1 Measurement-system repeatability and reproducibility\n\nRecorded result: 8.\n' }], COLD);
  assert.equal(r.rows['5.lot_trace'].state, 'missing');
  assert.deepEqual(r.unmatched, []);
  assert.deepEqual(r.files, [{ name: 'msa.md', status: 'read', detail: '1 section matched' }, { name: 'rfq.md', status: 'stored', detail: RFQ_DETAIL }]);
  assert.deepEqual(readPacket([{ name: 'rfq.md', text: '## 1.1 Lot traceability\n\nRecorded result: true.\n' }], COLD), { ok: false, error: NO_MATCH });
});

test('spec 3.2: applicable unnumbered headings are listed and level-1 headings are ignored', () => {
  const r = read('# 1.1 Lot traceability\n\nRecorded result: true.\n## Lot traceability\n\nRecorded result: true.\n'
    + '## Layout heading\n\n## 1.2 Corrective-action program\n\nRecorded result: true.\n');
  assert.equal(r.rows['5.lot_trace'].state, 'missing');
  assert.deepEqual(r.unmatched, [{ file: 'quality_manual.md', section: null, title: 'Lot traceability',
    reason: 'section has no number, so it can\'t be cited; number it like "## 1.1 Lot traceability"' }]);
  for (const h of ['##', '###', '####', '#####', '######']) {
    assert.equal(read(`${h} 3.2. Lot traceability\n\nRecorded result: true.\n`).rows['5.lot_trace'].where, 'quality_manual.md §3.2', h);
  }
});

test('spec 3.2: a section body runs to the next heading of the same or a higher level (nested lines belong to the parent)', () => {
  const r = read('## 1.1 Lot traceability\n\nWe trace lots.\n### 1.1.1 Detail\n\nRecorded result: true.\n## 1.2 Corrective-action program\n\nWe fix.\n');
  assert.deepEqual(r.rows['5.lot_trace'], proven(true));
  assert.equal(r.rows['1.capa'].state, 'assumed');
  assert.deepEqual(r.unmatched.map((u) => u.section), ['1.1.1']);
  // A same-level heading closes the section: the next section's result is not the previous one's.
  const sib = read('## 1.1 Corrective-action program\n\nWe fix.\n## 1.2 Lot traceability\n\nRecorded result: true.\n');
  assert.deepEqual([sib.rows['1.capa'].state, sib.rows['1.capa'].note], ['assumed', 'We fix.']);
});

test('spec 5: CRLF, BOM and trailing spaces read the same as LF', () => {
  const r = read('﻿## 1.1 Lot traceability   \r\n\r\nRecorded result: true.  \r\n## 1.2 Corrective-action program\r\nWe fix.\r\n');
  assert.deepEqual(r.rows['5.lot_trace'], proven(true));
  assert.equal(r.rows['1.capa'].note, 'We fix.');
  const cr = read('## 1.1 Lot traceability\rRecorded result: true.\r## 1.2 Corrective-action program\rWe fix.\r');
  assert.deepEqual(cr.rows['5.lot_trace'], proven(true), 'CR-only line endings');
});

test('spec 5: an empty section is Claimed with "(section is empty)" and no flag; table-only gets the no-plain-text note', () => {
  assert.deepEqual(rowOf('1.capa', ''), { state: 'assumed', value: null, where: 'quality_manual.md §1.1', note: '(section is empty)', flag: null });
  assert.equal(rowOf('1.capa', '| a | b |').note, '(no plain text in this section)');
});

test('UIQ-FR-22: rows are complete and typed for every commodity from one matching section', () => {
  for (const p of RUBRIC.commodities) {
    const r = readPacket([{ name: 'quality_manual.md', text: '## 1.1 Lot traceability\n\nRecorded result: true.\n' }], p.key);
    assert.equal(r.ok, true, p.key);
    assert.deepEqual(Object.keys(r.rows), checklist(p.key).map((x) => x.id), p.key);
    assert.deepEqual(r.counts, { proven: 1, claimed: 0, missing: checklist(p.key).length - 1, flagged: 0 }, p.key);
    for (const x of Object.values(r.rows)) assert.deepEqual(Object.keys(x), ['state', 'value', 'where', 'note', 'flag']);
  }
  // A section per core criterion with a typed value: every type comes back in the engine's type.
  const typed = { bool: ['true', true], number: ['2', 2], date: ['2027-01-01', '2027-01-01'] };
  const list = checklist(COLD).filter((x) => !x.test);
  const md = list.map((x, i) => `## 1.${i + 1} ${CRITERION_HEADINGS[x.id]}\n\nRecorded result: ${x.type === 'enum' ? x.options[0] : typed[x.type][0]}.\n`).join('');
  const r = read(md);
  for (const x of list) assert.deepEqual(r.rows[x.id].value, x.type === 'enum' ? x.options[0] : typed[x.type][1], x.id);
});

test('UIQ-FR-21: zero matched sections refuse with the exact text and no rows; no file -> Nothing to read', () => {
  assert.equal(NO_MATCH, "Nothing in these files matches this part's checklist. The reader only reads packets in the Stark packet format (numbered sections titled like the checklist). Fill the checklist by hand instead.");
  assert.deepEqual(read('# Hello\n\nSome text.\n## 1.1 Widget polish\n'), { ok: false, error: NO_MATCH, unmatched: [
    { file: 'quality_manual.md', section: '1.1', title: 'Widget polish', reason: 'no checklist row has this title' },
  ] });
  assert.deepEqual(readPacket([], COLD), { ok: false, error: NOTHING });
  assert.deepEqual(readPacket(null, COLD), { ok: false, error: NOTHING });
  assert.deepEqual(readPacket([{ name: 'x.md' }], COLD), { ok: false, error: NOTHING });
  assert.equal(readPacket([{ name: 'msa.md', text: '' }], 'nope').ok, false);
});

test('UIQ-FR-21: one matched section reads fine; the rest Missing', () => {
  const r = read('## 1.1 Lot traceability\n\nRecorded result: true.\n');
  assert.equal(r.counts.proven, 1);
  assert.equal(r.counts.missing, checklist(COLD).length - 1);
  assert.deepEqual(r.files, [{ name: 'quality_manual.md', status: 'read', detail: '1 section matched' }]);
});

// ---- decodeFiles (UIQ-AC-15) ----

test('UIQ-AC-15: decodeFiles refuses bad name, mixed case, non-.md, empty, invalid UTF-8, NUL, binary; others still read', () => {
  const ok = enc('## 1.1 Lot traceability\n');
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0xff, 0xd8]);
  const out = decodeFiles([
    { name: 'notes.md', bytes: ok }, { name: 'Cover_Letter.md', bytes: ok }, { name: 'msa.txt', bytes: ok },
    { name: 'msa.md', bytes: new Uint8Array(0) }, { name: 'capacity.md', bytes: new Uint8Array([0xc3, 0x28]) },
    { name: 'subtier.md', bytes: enc('a\0b') }, { name: 'pcn_policy.md', bytes: png },
    { name: ' quality_manual.md ', bytes: ok }, { name: 'quality_manual.md', bytes: enc('second') },
    { name: 'certificates.md', bytes: ok },
  ]);
  assert.deepEqual(out.files, [{ name: 'quality_manual.md', text: '## 1.1 Lot traceability\n' }, { name: 'certificates.md', text: '## 1.1 Lot traceability\n' }]);
  assert.deepEqual(out.refused, [
    { name: 'notes.md', reason: REFUSED.name }, { name: 'Cover_Letter.md', reason: REFUSED.name }, { name: 'msa.txt', reason: REFUSED.name },
    { name: 'msa.md', reason: 'empty file' }, { name: 'capacity.md', reason: 'not UTF-8 text' }, { name: 'subtier.md', reason: 'not UTF-8 text' },
    { name: 'pcn_policy.md', reason: 'not UTF-8 text' }, { name: 'quality_manual.md', reason: 'selected twice, the first copy is used' },
  ]);
  assert.equal(REFUSED.name, `not one of the packet file names (${PACKET_FILES.join(', ')})`);
});

test('UIQ-AC-15: per-file cap: exactly 64 KB accepted, 64 KB + 1 refused', () => {
  const out = decodeFiles([{ name: 'msa.md', bytes: new Uint8Array(MAX_FILE_BYTES).fill(0x61) },
    { name: 'capacity.md', bytes: new Uint8Array(MAX_FILE_BYTES + 1).fill(0x61) }]);
  assert.equal(MAX_FILE_BYTES, 65536);
  assert.deepEqual(out.files.map((f) => f.name), ['msa.md']);
  assert.deepEqual(out.refused, [{ name: 'capacity.md', reason: 'larger than 64 KB' }]);
});

test('UIQ-AC-15: running total: exactly 256 KB accepted; the file that crosses it and every later one refused', () => {
  const full = () => new Uint8Array(MAX_FILE_BYTES).fill(0x61);
  const four = PACKET_FILES.slice(0, 4).map((name) => ({ name, bytes: full() }));
  assert.equal(MAX_TOTAL_BYTES, 4 * MAX_FILE_BYTES);
  assert.equal(decodeFiles(four).files.length, 4);
  assert.deepEqual(decodeFiles([...four, { name: PACKET_FILES[4], bytes: enc('x') }]).refused,
    [{ name: PACKET_FILES[4], reason: 'the files together are larger than 256 KB' }], '256 KB + 1 byte');
  // 252 KB, then a 10 KB file crosses: it and every later one are refused, even a 1 KB file that would still fit.
  const kb = (n) => new Uint8Array(n * 1024).fill(0x61);
  const out = decodeFiles([...four.slice(0, 3), { name: PACKET_FILES[3], bytes: kb(60) }, { name: PACKET_FILES[4], bytes: kb(10) },
    { name: PACKET_FILES[5], bytes: kb(1) }]);
  assert.equal(out.files.length, 4);
  assert.deepEqual(out.refused, [{ name: PACKET_FILES[4], reason: 'the files together are larger than 256 KB' },
    { name: PACKET_FILES[5], reason: 'the files together are larger than 256 KB' }]);
});

test('decodeFiles never throws on odd input', () => {
  for (const x of [undefined, null, 5, 'x', [], [null], [{}], [{ name: 5, bytes: 'x' }], [{ name: 'msa.md', bytes: [1, 2] }]]) {
    const out = decodeFiles(x);
    assert.equal(out.files.length, 0, JSON.stringify(x));
  }
  assert.deepEqual(decodeFiles([]), { files: [], refused: [] });
});

// ---- uploadedFile + viewer (UIQ-FR-24, UIQ-AC-17) ----

test('UIQ-FR-24: uploadedFile returns the saved text, else null for wrong doc, no packet or odd shapes', () => {
  const rec = { packet: { files: [{ name: 'msa.md', text: '## 1.1 X\n' }, { name: 'subtier.md', text: 'S' }] } };
  assert.equal(uploadedFile(rec, 'msa.md'), '## 1.1 X\n');
  assert.equal(uploadedFile(rec, 'capacity.md'), null);
  for (const r of [null, undefined, {}, { packet: null }, { packet: { files: 'x' } }, { packet: { files: [null, 5, { name: 'msa.md', text: 5 }] } }]) {
    assert.equal(uploadedFile(r, 'msa.md'), null, JSON.stringify(r));
  }
  assert.equal(uploadedFile(rec, null), null);
});

test('UIQ-AC-17: the viewer renders a saved packet with the cited section highlighted, and notes a missing section', () => {
  const text = readFileSync(join(ROOT, 'data', 'samples', 'brand-corporation', 'capability_study.md'), 'utf8');
  const saved = uploadedFile({ packet: { files: [{ name: 'capability_study.md', text }] } }, 'capability_study.md');
  const hit = renderPacket(saved, '1.1');
  assert.equal(hit.found, true);
  assert.match(hit.html, /<div class="cited" data-cited><span class="sr-only">Cited section: <\/span><h4>1\.1 Process capability<\/h4>/);
  const miss = renderPacket(saved, '4.4');
  assert.equal(miss.found, false);
  assert.match(sheetBody({ status: 'ready', path: 'uploaded packet/capability_study.md', doc: 'capability_study.md', sec: '4.4', ...miss }),
    /Section §4\.4 is not in this file\. Showing the whole file\./);
  assert.match(sheetBody({ status: 'missing', path: 'uploaded packet/msa.md', doc: 'msa.md', sec: '1.1' }), /FILE NOT IN PACKET[\s\S]*uploaded packet\/msa\.md/);
});

// ---- untrusted text (UIQ-NFR-03, UIQ-AC-15) ----

const XSS = '<img src=x onerror=alert(1)>';
test('UIQ-NFR-03: packet HTML in notes, flag tokens, unmatched titles and file names renders inert in step 2', () => {
  const md = `## 1.1 Corrective-action program\n\n${XSS} "><script>alert(2)</script> we fix.\n`
    + `## 1.2 Lot traceability\n\nRecorded result: <img/src=x/onerror=alert(3)>\n`
    + `## 1.3 ${XSS}</textarea><a href="javascript:alert(4)">x</a>\n\ny\n`;
  const r = read(md);
  assert.equal(r.ok, true);
  assert.equal(r.rows['5.lot_trace'].flag, F2('<img/src=x/onerror=alert(3)>', 'true or false'));
  let e = setPart({ ...blankEntry(), name: 'Brand Corporation', step: 2 }, { commodity: COLD, part_no: 'SI-CP-0007' });
  e = { ...e, rows: entryRows(r.rows),
    packet: { files: [{ name: 'quality_manual.md', text: md }] },
    read: { flags: { '5.lot_trace': r.rows['5.lot_trace'].flag }, counts: r.counts, files: [...r.files, { name: `${XSS}.md`, status: 'refused', detail: REFUSED.name }],
      unmatched: r.unmatched, refused: [{ name: `<script>x</script>.md`, reason: REFUSED.name }], warnings: [`The cover letter names part ${XSS}`] } };
  const ctx = { role: 'senior', params: { new: 1 }, notFound: null, entry: { state: e, policy: STARK_REFERENCE, saveNote: null, error: null } };
  const html = renderEntry({ as_of: '2026-11-01' }, ctx);
  assert.doesNotMatch(html, /<img|<script|<a href|<\/textarea/i);
  assert.ok(html.includes(esc(XSS)), 'the payload is shown as text');
  assert.ok(html.includes(esc('<img/src=x/onerror=alert(3)>')), 'flag token shown as text');
  // Error path: refused names in the alert panel.
  const err = renderEntry({ as_of: '2026-11-01' }, { ...ctx, entry: { ...ctx.entry, packetUi: { error: NO_MATCH, refused: [{ name: XSS, reason: REFUSED.name }] } } });
  assert.doesNotMatch(err, /<img/i);
  // Viewer.
  const v = renderPacket(md, '1.1').html;
  assert.doesNotMatch(v, /<img|<script|<a |<\/textarea/i);
});

// ---- grep guards (QUAL-NFR-05, UIQ-FR-22) ----

test('QUAL-NFR-05 UIQ-FR-22: packet-reader.js names no test ID or commodity key, no agent/, fetch, DOM or storage', () => {
  const src = readFileSync(new URL('./packet-reader.js', import.meta.url), 'utf8');
  for (const t of RUBRIC.tests) assert.doesNotMatch(src, new RegExp(`(?<![\\w.])${t.id.replace('.', '\\.')}(?!\\w)`), t.id);
  for (const c of RUBRIC.commodities) assert.doesNotMatch(src, new RegExp(`(?<!\\w)${c.key}(?!\\w)`), c.key);
  assert.doesNotMatch(src, /from\s+['"][^'"]*agent\//);
  assert.doesNotMatch(src, /\bfetch\s*\(|\bdocument\b|\blocalStorage\b|\bwindow\b|\beval\s*\(/);
  assert.doesNotMatch(src, /new RegExp\([^)]*\b(text|line|title|raw)\b/, 'no regex built from packet text');
});

// ---- the Brand Corporation sample (UIQ-AC-14) ----

const SAMPLE = join(ROOT, 'data', SAMPLE_DIR);
const sampleText = (f) => readFileSync(join(SAMPLE, f), 'utf8');
const SAMPLE_FILES = PACKET_FILES.map((name) => ({ name, text: sampleText(name) }));

test('UIQ-AC-14 DATASET: the sample is the ten packet files plus README, each starting with the banner, no legal suffix or private vocabulary', () => {
  assert.equal(SAMPLE_DIR, 'samples/brand-corporation/');
  assert.deepEqual(readdirSync(SAMPLE).sort(), [...PACKET_FILES, 'README.md'].sort());
  for (const f of PACKET_FILES) {
    const t = sampleText(f);
    assert.equal(t.split('\n')[0], '> Synthetic document for a demo. Fictional supplier.', f);
    for (const re of [/\bInc\./, /\bLLC\b/, /\bLtd\b/, /\bGmbH\b/, /\bCorp\./, /Oscorp/, /SUP-\d/]) assert.doesNotMatch(t, re, `${f}: ${re}`);
    if (f !== 'rfq.md') assert.doesNotMatch(t, forbidden, f);
  }
});

test('UIQ-AC-14: rfq.md is renderRequirements(cold_plate sheet), byte for byte', () => {
  const sheet = JSON.parse(readFileSync(join(ROOT, 'data', 'requirements', `${COLD}.json`), 'utf8'));
  assert.equal(sampleText('rfq.md'), renderRequirements(sheet));
});

test('UIQ-AC-14 D10: the per-CTQ Cpk lines recompute from mean, s and limits, and the recorded result is their minimum', () => {
  const t = sampleText('capability_study.md');
  const lines = [...t.matchAll(/mean: ([\d.]+) mm\. sample standard deviation: ([\d.]+) mm\. lower drawing limit: ([\d.]+) mm\. upper drawing limit: ([\d.]+) mm\. Cpk: ([\d.]+)\./g)];
  assert.equal(lines.length, 3);
  const cpks = lines.map(([, m, s, l, u, c]) => {
    const want = Math.min((Number(u) - Number(m)) / (3 * Number(s)), (Number(m) - Number(l)) / (3 * Number(s)));
    assert.equal(want.toFixed(4), c, `mean ${m}`);
    return Number(c);
  });
  assert.equal(Math.min(...cpks), 1.3187);
  assert.match(t, /Recorded result: 1\.3187\./);
});

test('UIQ-AC-14: the sample reads to 30 proven / 2 claimed / 1 missing, no flags, no unmatched, rfq stored', () => {
  const r = readPacket(SAMPLE_FILES, COLD, 'SI-CP-0007');
  assert.equal(r.ok, true);
  assert.deepEqual(r.counts, { proven: 30, claimed: 2, missing: 1, flagged: 0 });
  assert.deepEqual(r.unmatched, []);
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(r.files.at(-1), { name: 'rfq.md', status: 'stored', detail: RFQ_DETAIL });
  assert.ok(r.files.slice(0, -1).every((f) => f.status === 'read'));
  const leak = checklist(COLD).find((x) => x.id === '4.leak_test');
  assert.equal(leak.knockout, true);
  assert.deepEqual(r.rows['4.leak_test'], { state: 'assumed', value: null, where: 'reliability_report.md §1.1',
    note: 'Our assemblies remain sealed under the specified conditions.', flag: null });
  assert.equal(r.rows['1.capa'].state, 'assumed');
  assert.deepEqual(r.rows['2.ctq_cpk'], proven(1.3187, 'capability_study.md §1.1'));
  assert.equal(r.rows['5.records_retention'].state, 'missing');
  assert.equal(r.rows['4.burst_pressure'].value, true);
  assert.equal(r.rows['6.capacity_ratio'].value, 1.25);
  assert.equal(r.rows['6.lead_time'].value, true);
  assert.equal(r.rows['5.nc_segregation'].value, true);
  assert.equal(r.rows['1.cert_current'].value, '2027-07-20');
  assert.deepEqual(readPacket(SAMPLE_FILES, COLD, 'SI-CP-0001').warnings, ['The cover letter names part SI-CP-0007 but you picked SI-CP-0001.']);
});

test('UIQ-AC-14: the engine scores the sample 90.5 CONDITIONAL, Senior, leak test the assumed knockout', () => {
  const r = readPacket(SAMPLE_FILES, COLD, 'SI-CP-0007');
  const base = setPart({ ...blankEntry(), name: 'Brand Corporation', step: 2 }, { commodity: COLD, part_no: 'SI-CP-0007' });
  const e = { ...base, rows: entryRows(r.rows) };
  const v = scoreEntry(e, CTX);
  assert.equal(v.blocked, false);
  const ev = v.result.evaluation;
  assert.equal(ev.total, 90.5);
  assert.equal(ev.decision, 'CONDITIONAL');
  assert.deepEqual(ev.knockouts, { failed: [], assumed: ['4.leak_test'] });
  assert.deepEqual(ev.routing, { to: 'senior', reasons: ['CONDITIONAL', 'High-risk commodity'] });
  assert.deepEqual(ev.gaps, [{ id: '1.capa', type: 'assumed', score: 1 }, { id: '2.ctq_cpk', type: 'fail', score: 1 },
    { id: '4.leak_test', type: 'assumed', score: 1 }, { id: '5.records_retention', type: 'missing', score: 0 }]);
  assert.deepEqual(ev.rfi_items, ['1.capa', '4.leak_test', '5.records_retention']);
  assert.deepEqual(ev.audit_focus, ['2.ctq_cpk', '4.leak_test', '5.records_retention']);
});

test('naming: Brand Corporation is not a queue candidate and not in the DATASET candidate table', () => {
  assert.doesNotMatch(readFileSync(join(ROOT, 'data', 'suppliers.json'), 'utf8'), /brand corporation/i);
  const tableRows = readFileSync(join(ROOT, 'docs', 'DATASET.md'), 'utf8').split('\n').filter((l) => l.startsWith('|'));
  assert.ok(tableRows.length > 5);
  for (const l of tableRows) assert.doesNotMatch(l, /brand corporation/i);
});

test('F4: a contradictory leak test scores as an assumed knockout', () => {
  const result = read('## 1.1 Leak test\nRecorded result: true.\nResult: does not meet buyer limit.');
  const entry = { ...blankEntry(), name: 'Brand Corporation', commodity: COLD, rows: entryRows(result.rows) };
  const { evaluation } = scoreEntry(entry, CTX).result;
  assert.ok(evaluation.knockouts.assumed.includes('4.leak_test'));
  assert.ok(!evaluation.knockouts.failed.includes('4.leak_test'));
});

test('an unnumbered leak test stays missing and is listed even when no rows can be filled', () => {
  const leak = '## Leak test\nRecorded result: true.\n';
  const warning = { file: 'quality_manual.md', section: null, title: 'Leak test',
    reason: "section has no number, so it can't be cited; number it like \"## 1.1 Leak test\"" };
  const mixed = read(leak + '## 1.2 Internal cleanliness\nRecorded result: true.');
  assert.equal(mixed.rows['4.leak_test'].state, 'missing');
  assert.deepEqual(mixed.unmatched, [warning]);
  const empty = read(leak);
  assert.deepEqual(empty, { ok: false, error: NO_MATCH, unmatched: [warning] });
  const panel = packetPanel(blankEntry(), empty);
  assert.match(panel, /Unmatched content \(1\)/);
  assert.match(panel, /quality_manual\.md · Leak test · section has no number/);
});

test('nested checklist evidence belongs to its own criterion', () => {
  const result = read('## 1.1 Leak test\nWe intend to test.\n### 1.1.1 Internal cleanliness\nRecorded result: true.', { file: 'reliability_report.md' });
  assert.deepEqual(result.rows['4.leak_test'], { state: 'assumed', value: null, where: 'reliability_report.md §1.1', note: 'We intend to test.', flag: null });
  assert.deepEqual(result.rows['4.cleanliness'], proven(true, 'reliability_report.md §1.1.1'));
});

test('P2 does not treat descriptions of possible outcomes as results', () => {
  for (const line of ['The template will record the result as pass (true) or fail (false).',
    'Either the result is demonstrated (true) or it is absent (false).',
    'If the test passes or a waiver is issued, it is demonstrated (true).']) {
    const row = rowOf('4.leak_test', line, { file: 'reliability_report.md' });
    assert.equal(row.state, 'assumed', line);
    assert.equal(row.value, null, line);
  }
});

test('duplicate section numbers downgrade both cited rows to flagged claims', () => {
  const result = read('## 1.1 Internal cleanliness\nRecorded result: true.\n## 1.1 Leak test\nRecorded result: false.', { file: 'reliability_report.md' });
  for (const id of ['4.cleanliness', '4.leak_test']) {
    const row = result.rows[id];
    assert.equal(row.state, 'assumed');
    assert.equal(row.value, null);
    assert.equal(row.where, 'reliability_report.md §1.1');
    assert.equal(row.flag, "Check: §1.1 appears more than once in reliability_report.md, so the citation can't be opened reliably. Renumber the sections.");
  }
  assert.deepEqual(result.unmatched, []);
  const withTitle = read('# 1.1 Report title\n## 1.1 Leak test\nRecorded result: true.', { file: 'reliability_report.md' });
  assert.equal(withTitle.rows['4.leak_test'].flag, result.rows['4.leak_test'].flag);
});

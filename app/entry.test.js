// + New supplier, hand entry: the form, the live panel and the hand-entered supplier across the app (issue 77;
// PRD-05 UIQ-FR-15, -16, -17, UIQ-AC-08, -10, -11; spec tests 10-18 and section 6). The SUP-07 fill goes through
// the same entry functions main.js uses (setPart, setRow) and reads the rendered panel HTML.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluate, STARK_REFERENCE, parseHistory } from './engine.js';
import { RUBRIC } from './rubric.js';
import { perfectExtraction } from './rubric.testkit.js';
import { buildModel } from './model.js';
import { limitText } from './standards.js';
import { esc } from './html.js';
import { formatHash, parseHash, resolveRoute, ROUTE_KEYS } from './route.js';
import { queueHref, queueModel, renderDetail, renderQualify } from './queue.js';
import { draftsModel, renderDrafts } from './drafts.js';
import { renderToday } from './today.js';
import { renderCompare } from './compare.js';
import * as qualify from './views/qualify.js';
import { blankEntry, checklist, entryFromRecord, scoreEntry, setPart, setRow, toExtraction, toRecord, WHERE_REQUIRED } from './manual.js';
import { entryFocusScroll, revealEntryFocus, issueText, liveGaps, livePanel, profileLine, renderEntry, sheetFor } from './entry.js';

const AS_OF = '2026-11-01';
const COLD = 'cold_plate';
const defOf = (id) => RUBRIC.criteria.find((c) => c.id === id) ?? RUBRIC.tests.find((t) => t.id === id);
const sheetOf = (key) => JSON.parse(readFileSync(new URL(`../data/requirements/${key}.json`, import.meta.url), 'utf8'));
const SHEETS = Object.fromEntries(RUBRIC.commodities.map((p) => [p.key, { ok: true, path: `data/requirements/${p.key}.json`, value: sheetOf(p.key) }]));
const CP = SHEETS[COLD].value;
const POLICY80 = { ...STARK_REFERENCE, qualification: { ...STARK_REFERENCE.qualification, approve: 80, conditional: 70 } };

function modelOf(records = [], policy = STARK_REFERENCE, sheets = SHEETS) {
  const sup = { id: 'SUP-01', name: 'Dataset Co', commodity: COLD, part: COLD };
  return buildModel({
    suppliers: { ok: true, path: 'data/suppliers.json', value: { as_of: AS_OF, candidates: [sup], active: [{ ...sup, id: 'ACT-01' }] } },
    history: { ok: true, path: 'data/history.csv', value: parseHistory('date,supplier_id,part_no,received_qty,rejected_qty,on_time,defect_found_at,failure_mode_code,scar_id,scar_opened,scar_closed\n2026-10-06,ACT-01,P1,200,0,1,none,,,,\n') },
    extractions: { 'SUP-01': { ok: true, path: 'data/extracted/SUP-01.json', value: { ...perfectExtraction(RUBRIC, COLD), supplier_id: 'SUP-01' } } },
    sheets, manual: { records, error: null },
  }, policy);
}

// Raw form text scoring 3 under the row's rule; date strictly after as_of.
function topRaw({ id }) {
  const { type, rule } = defOf(id);
  if (type === 'date') return '2027-01-01';
  if (type === 'number') return String(rule.find((b) => b.score === 3 && (b.op === '>=' || b.op === '<=')).x);
  return Object.keys(rule).reduce((a, b) => (rule[b] > rule[a] ? b : a));
}

// RUBRIC.md worked example SUP-07 (docs/RUBRIC.md 216-247), entered the way a person would in the form.
const SUP07_EXCEPTIONS = {
  '2.ctq_cpk': { state: 'verified', value: '1.12' }, '2.spc': { state: 'assumed', value: '', where: '' },
  '6.capacity_ratio': { state: 'verified', value: '0.85' }, '6.lead_time': { state: 'verified', value: 'false' },
  '6.ramp_plan': { state: 'assumed', value: '', where: '' },
  '8.subtier_named': { state: 'missing' }, '8.subtier_certs': { state: 'missing' },
  '4.thermal_cycling': { state: 'missing' }, '4.coolant_compat': { state: 'verified', value: 'true' },
};
function sup07Entry() {
  let e = setPart({ ...blankEntry(), name: 'Hand-entered SUP-07', step: 2 }, sheetFor(modelOf(), CP.part_no));
  for (const r of checklist(e.commodity)) e = setRow(e, r.id, { state: 'verified', value: topRaw(r), where: 'packet p.4' });
  for (const [id, patch] of Object.entries(SUP07_EXCEPTIONS)) e = setRow(e, id, patch);
  return e;
}
const SUP07_RECORD = toRecord(sup07Entry(), { id: 'NEW-01', saved_at: '2026-11-13' });

const ctxOf = (entry, { policy = STARK_REFERENCE, saveNote = null, error = null, role = 'senior', params = { new: 1 } } = {}) =>
  ({ role, params, notFound: null, entry: { state: entry, policy, saveNote, error } });
const livePart = (html) => html.slice(html.indexOf('data-entry-live'), html.indexOf('<details class="entry-cat"'));
const rowHtml = (html, id) => { const i = html.indexOf(`data-row="${id}"`); return html.slice(i, html.indexOf('</fieldset>', i)); };
const groupIds = (html, kind) => {
  const i = html.indexOf(`data-kind="${kind}"`);
  if (i < 0) return [];
  return [...html.slice(i, html.indexOf('</section>', i)).matchAll(/<tr data-id="([^"]+)"/g)].map((m) => m[1]);
};
const listIds = (html, cls) => {
  const i = html.indexOf(`class="${cls}"`);
  if (i < 0) return [];
  const end = html.indexOf(cls === 'draft-items' ? '</ul>' : '</ol>', i);
  return [...html.slice(i, end).matchAll(/<li><span class="mono">([^<]+)<\/span>/g)].map((m) => m[1]);
};

// ---- 10. SUP-07 by hand (UIQ-AC-08) ----

test('10 UIQ-AC-08: SUP-07 entered by hand reads 82.6, CONDITIONAL, Senior SQE "CONDITIONAL; High-risk commodity" in the live panel', () => {
  const model = modelOf();
  const html = renderEntry(model, ctxOf(sup07Entry()));
  const live = livePart(html);
  assert.ok(live.length > 100, 'live panel found');
  assert.match(live, /<div class="metric"><p>Score<\/p><strong>82\.6<\/strong><\/div>/);
  assert.match(live, /<p>Decision<\/p><span class="badge amber">~ CONDITIONAL<\/span>/);
  assert.match(live, /<p>Signs<\/p><strong>Senior SQE<\/strong><small>CONDITIONAL; High-risk commodity<\/small>/);
  assert.match(live, /<p>Problems<\/p><strong>7<\/strong><small>\+ 1 info<\/small>/);
  assert.deepEqual(groupIds(live, 'fail'), ['2.ctq_cpk', '6.capacity_ratio', '6.lead_time']);
  assert.deepEqual(groupIds(live, 'assumed'), ['2.spc', '6.ramp_plan']);
  assert.deepEqual(groupIds(live, 'missing'), ['8.subtier_named', '8.subtier_certs']);
  assert.deepEqual(groupIds(live, 'info'), ['4.thermal_cycling']);
  assert.deepEqual(listIds(live, 'draft-items'), ['2.spc', '6.ramp_plan', '8.subtier_named', '8.subtier_certs']);
  assert.deepEqual(listIds(live, 'draft-plan'), ['2.ctq_cpk', '6.lead_time', '8.subtier_named']);
  assert.doesNotMatch(live, /role="alert"/, 'the panel is rebuilt per keystroke: no alerts in it (decision 163)');
  assert.match(live, /<p class="sr-only" role="status">Score 82\.6, CONDITIONAL<\/p>/);
});

test('10: SUP-07 by hand equals the engine on the RUBRIC example (total, category scores, gaps, lists)', () => {
  const v = scoreEntry(sup07Entry(), { as_of: AS_OF, policy: STARK_REFERENCE });
  assert.equal(v.blocked, false);
  const ev = v.result.evaluation;
  assert.equal(ev.total, 82.6);
  assert.equal(ev.decision, 'CONDITIONAL');
  assert.deepEqual(ev.routing, { to: 'senior', reasons: ['CONDITIONAL', 'High-risk commodity'] });
  assert.deepEqual(ev.categories.map((c) => c.score), [15, 10, 10, 15, 10, 2.2, 8, 2.3, 10]);
  assert.deepEqual(ev.rfi_items, ['2.spc', '6.ramp_plan', '8.subtier_named', '8.subtier_certs']);
  assert.deepEqual(ev.audit_focus, ['2.ctq_cpk', '6.lead_time', '8.subtier_named']);
  assert.deepEqual(ev.nice_to_have.map((n) => n.id), ['4.thermal_cycling']);
  assert.deepEqual(ev.warnings, []);
});

test('10 decision 163: a failed knockout shows the banner in the live panel without role=alert', () => {
  const ko = checklist(COLD).find((r) => r.knockout && r.type === 'bool' && !r.test).id;
  const live = livePart(renderEntry(modelOf(), ctxOf(setRow(sup07Entry(), ko, { value: 'false' }))));
  assert.match(live, /<div class="panel knockout-banner"><p class="eyebrow">★ KNOCKOUT<\/p>/);
  assert.ok(live.includes(`data-knockout="${ko}"`));
  assert.doesNotMatch(live, /role="alert"/);
  assert.match(live, /✗ NOT APPROVED/);
});

test('10 F1 split: the sticky strip holds the headline metrics only; banner, gaps and lists sit in the static block under it', () => {
  const ko = checklist(COLD).find((r) => r.knockout && r.type === 'bool' && !r.test).id;
  const e = setRow(sup07Entry(), ko, { value: 'false' });  // a knockout banner to place
  const ctx = ctxOf(e);
  const view = scoreEntry(e, { as_of: AS_OF, policy: STARK_REFERENCE });
  const strip = livePanel(view, ctx);
  const gaps = liveGaps(view, ctx);
  assert.match(strip, /class="metrics detail-metrics"/);
  assert.match(strip, /<p class="sr-only" role="status">Score [\d.]+, NOT APPROVED<\/p>/);
  for (const bad of ['knockout-banner', 'gap-group', 'draft-items', 'draft-plan', 'Entered by hand']) assert.ok(!strip.includes(bad), `strip has ${bad}`);
  assert.match(gaps, /<div class="panel knockout-banner"><p class="eyebrow">★ KNOCKOUT/);
  assert.match(gaps, /data-kind="fail"/);
  assert.match(gaps, /class="draft-items"/);
  assert.match(gaps, /class="draft-plan"/);
  assert.doesNotMatch(gaps, /class="metrics|role="alert"/);
  // Rendered: strip, then the static block, both before the first category; the strip is not a scroll region any more.
  const html = renderEntry(modelOf(), ctx);
  const iLive = html.indexOf('<div class="panel entry-live" data-entry-live>');
  const iGaps = html.indexOf('<div class="entry-gaps" data-entry-gaps>');
  const iCat = html.indexOf('<details class="entry-cat"');
  assert.ok(iLive >= 0 && iLive < iGaps && iGaps < iCat, `${iLive} ${iGaps} ${iCat}`);
  assert.ok(html.includes(`<div class="panel entry-live" data-entry-live>${strip}</div><div class="entry-gaps" data-entry-gaps>${gaps}</div>`));
});

test('10 F1 split: while paused or errored the strip carries the line and the static block is empty', () => {
  const paused = setRow(sup07Entry(), '6.lead_time', { where: '' });
  const pv = scoreEntry(paused, { as_of: AS_OF, policy: STARK_REFERENCE });
  assert.match(livePanel(pv, ctxOf(paused)), /^<p class="status-line" role="status">Score paused: /);
  assert.equal(liveGaps(pv, ctxOf(paused)), '');
  const bad = setRow(sup07Entry(), '2.ctq_cpk', { value: 'abc' });
  const bv = scoreEntry(bad, { as_of: AS_OF, policy: STARK_REFERENCE });
  assert.match(livePanel(bv, ctxOf(bad)), /^<p class="status-line" role="status">Engine error: 2\.ctq_cpk: /);
  assert.equal(liveGaps(bv, ctxOf(bad)), '');
  assert.match(renderEntry(modelOf(), ctxOf(bad)), /<div class="entry-gaps" data-entry-gaps><\/div>/);
});

// ---- 11. category-4 limits ----

test('11 UIQ-FR-15: each cold-plate test row shows Stark\'s acceptance limit from the sheet; nice rows say Optional', () => {
  const html = renderEntry(modelOf(), ctxOf(sup07Entry()));
  for (const r of checklist(COLD).filter((x) => x.test)) {
    const acc = CP.tests[r.id].conditions.filter((c) => c.kind === 'acceptance');
    assert.ok(acc.length, r.id);
    const row = rowHtml(html, r.id);
    assert.match(row, /Stark limit:/, r.id);
    for (const c of acc) assert.ok(row.includes(`<span class="mono">${c.measure} ${limitText(c)}</span>`), `${r.id}: ${c.measure}`);
    // Setup conditions are not acceptance limits.
    for (const c of CP.tests[r.id].conditions.filter((x) => x.kind === 'setup')) assert.ok(!row.includes(`${c.measure} ${limitText(c)}`), `${r.id} setup ${c.measure}`);
    assert.equal(/Optional/.test(row), r.nice, `${r.id} Optional`);
    assert.equal(/Not scored; listed as info/.test(row), r.nice, `${r.id} info note`);
  }
  // A known string, read from the sheet: Helium leak rate ≤ 0.000001 mbar·L/s.
  assert.ok(rowHtml(html, '4.leak_test').includes('Helium leak rate ≤ 0.000001 mbar·L/s'));
  // Criteria (not tests) carry no limit line.
  assert.doesNotMatch(rowHtml(html, '2.ctq_cpk'), /Stark limit|No limit on this sheet/);
});

test('11: a test with no entry in the sheet shows "No limit on this sheet"', () => {
  const { '4.burst_pressure': _gone, ...tests } = CP.tests;
  const sheets = { ...SHEETS, [COLD]: { ...SHEETS[COLD], value: { ...CP, tests } } };
  const html = renderEntry(modelOf([], STARK_REFERENCE, sheets), ctxOf(sup07Entry()));
  assert.match(rowHtml(html, '4.burst_pressure'), /No limit on this sheet/);
  assert.doesNotMatch(rowHtml(html, '4.burst_pressure'), /Stark limit:/);
  assert.match(rowHtml(html, '4.leak_test'), /Stark limit:/);
});

test('11: rows are grouped by rubric category; a knockout row carries the star; value input follows the row type', () => {
  const html = renderEntry(modelOf(), ctxOf(sup07Entry()));
  const summaries = [...html.matchAll(/<details class="entry-cat" open><summary>([^<]+)<\/summary>/g)].map((m) => m[1]);
  assert.deepEqual(summaries, RUBRIC.categories.map((c) => esc(`${c.n} ${c.name}`)));
  for (const r of checklist(COLD)) {
    const row = rowHtml(html, r.id);
    assert.equal(row.includes('<span class="ko-star"'), r.knockout, `${r.id} star`);
    const value = row.slice(row.indexOf('data-entry-field="value"') - 80, row.indexOf('data-entry-field="value"'));
    assert.equal(/<select/.test(value), r.type === 'bool' || r.type === 'enum', `${r.id} ${r.type}`);
  }
  assert.doesNotMatch(html, /type="number"|type="date"/, 'decision 162: plain text inputs');
});

// ---- 12. live update and row errors ----

test('12 UIQ-AC-11: changing a row rescoring moves the total; a bad number shows the engine error on that row', () => {
  const model = modelOf();
  const base = scoreEntry(sup07Entry(), { as_of: AS_OF, policy: STARK_REFERENCE }).result.evaluation.total;
  const fixed = setRow(sup07Entry(), '6.lead_time', { value: 'true' });
  assert.ok(scoreEntry(fixed, { as_of: AS_OF, policy: STARK_REFERENCE }).result.evaluation.total > base);

  const bad = setRow(sup07Entry(), '2.ctq_cpk', { value: 'abc' });
  const html = renderEntry(model, ctxOf(bad));
  const row = rowHtml(html, '2.ctq_cpk');
  assert.match(row, /<p class="entry-error" data-row-error="2\.ctq_cpk" id="err-2\.ctq_cpk">expected a finite number, got &quot;abc&quot;<\/p>/);
  for (const f of ['state', 'value', 'where', 'note']) {
    assert.match(row, new RegExp(`data-entry-field="${f}" data-id="2\\.ctq_cpk" aria-describedby="err-2\\.ctq_cpk" aria-invalid="true"`), f);
  }
  assert.match(livePart(html), /Engine error: 2\.ctq_cpk: expected a finite number, got &quot;abc&quot;/);
  // No other row is marked.
  assert.equal([...html.matchAll(/data-row="[^"]+"[\s\S]*?<\/fieldset>/g)].filter((m) => m[0].includes('aria-invalid')).length, 1);
});

test('12 UIQ-AC-11: a bad date shows the engine error on that row', () => {
  const html = renderEntry(modelOf(), ctxOf(setRow(sup07Entry(), '1.cert_current', { value: '2026-13-40' })));
  assert.match(rowHtml(html, '1.cert_current'), /data-row-error="1\.cert_current" id="err-1\.cert_current">expected an ISO day YYYY-MM-DD, got &quot;2026-13-40&quot;</);
});

test('12 UIQ-AC-11: proven with no "where I found it" is blocked inline on that row and pauses the score', () => {
  const html = renderEntry(modelOf(), ctxOf(setRow(sup07Entry(), '6.lead_time', { where: '' })));
  const row = rowHtml(html, '6.lead_time');
  assert.ok(row.includes(`id="err-6.lead_time">${WHERE_REQUIRED}</p>`));
  assert.match(row, /Where I found it <span class="quiet">\(required\)<\/span>/);
  assert.match(row, /data-entry-field="where" data-id="6\.lead_time" aria-describedby="err-6\.lead_time" aria-invalid="true" aria-required="true"/);
  const live = livePart(html);
  const name = checklist(COLD).find((r) => r.id === '6.lead_time').name;
  assert.ok(live.includes(`<p class="status-line" role="status">Score paused: ${esc(name)} needs where I found it</p>`));
  assert.doesNotMatch(live, /<strong>82\.6<\/strong>/, 'no partial score');
});

test('12: issueText strips the engine "<id>: " prefix only when it names that row', () => {
  assert.equal(issueText('2.ctq_cpk', '2.ctq_cpk: expected a finite number, got "abc"'), 'expected a finite number, got "abc"');
  assert.equal(issueText('2.ctq_cpk', WHERE_REQUIRED), WHERE_REQUIRED);
  assert.equal(issueText('2.ctq_cpk', null), '');
});

// ---- 13. policy re-score (UIQ-AC-10) and the tag across views ----

test('13 UIQ-AC-10: changing the active policy rescores a hand-entered supplier (buildModel)', () => {
  const ref = modelOf([SUP07_RECORD]).candidates.find((c) => c.id === 'NEW-01');
  assert.equal(ref.evaluation.decision, 'CONDITIONAL');
  const m80 = modelOf([SUP07_RECORD], POLICY80);
  const at80 = m80.candidates.find((c) => c.id === 'NEW-01');
  assert.deepEqual(at80.evaluation, evaluate(toExtraction(SUP07_RECORD), { as_of: AS_OF, policy: POLICY80 }));
  assert.equal(at80.evaluation.decision, 'APPROVED');
  const card = renderQualify(m80, { role: 'senior', params: {} });
  const c = card.slice(card.indexOf('data-id="NEW-01"'), card.indexOf('</button>', card.indexOf('data-id="NEW-01"')));
  assert.match(c, /✓ APPROVED<\/span> <span class="badge muted">Entered by hand<\/span>/);
});

test('13 UIQ-FR-16: Today and Compare list a hand-entered supplier from buildModel with the Entered by hand tag', () => {
  const m = modelOf([SUP07_RECORD]);
  const today = renderToday(m, { role: 'senior', params: {} });
  const t = today.slice(today.indexOf('NEW-01') - 400, today.indexOf('NEW-01') + 200);
  assert.match(t, /Entered by hand/);
  assert.equal([...today.matchAll(/Entered by hand/g)].length, 1, 'only the manual one');
  const cmp = renderCompare(m, { role: 'senior', params: { part: CP.part_no } });
  const i = cmp.indexOf('data-bidder="NEW-01"');
  assert.ok(i >= 0, 'NEW-01 is a bidder for the cold-plate part');
  assert.equal([...cmp.matchAll(/Entered by hand/g)].length, 1);
  assert.match(cmp.slice(i, cmp.indexOf('data-bidder', i + 10) < 0 ? undefined : cmp.indexOf('data-bidder', i + 10)), /Entered by hand/);
});

// ---- 14. model ----

test('14 UIQ-FR-16: a manual candidate is source manual, no drafts, part = part_no; an engine-rejected record is an ENGINE ERROR card', () => {
  const badRec = { ...SUP07_RECORD, supplier_id: 'NEW-02', criteria: SUP07_RECORD.criteria.map((c) => (c.id === '2.ctq_cpk' ? { ...c, value: 'abc' } : c)) };
  const m = modelOf([SUP07_RECORD, badRec]);
  assert.deepEqual(m.candidates.map((c) => c.id), ['SUP-01', 'NEW-01', 'NEW-02'], 'dataset first, then hand-entered in saved order');
  const [, ok, bad] = m.candidates;
  assert.deepEqual({ ...ok, evaluation: undefined }, { id: 'NEW-01', name: 'Hand-entered SUP-07', commodity: COLD, part: CP.part_no,
    source: 'manual', drafts: null, status: 'scored', evaluation: undefined, error: null });
  assert.equal(bad.status, 'engine-error');
  assert.equal(bad.evaluation, null);
  assert.deepEqual(bad.error, { path: 'sqc:manual', message: '2.ctq_cpk: expected a finite number, got "abc"', kind: 'engine' });
  const q = queueModel(m);
  assert.equal(q.counts.all, 3);
  assert.equal(q.unscored, 1);
  assert.equal(q.counts.conditional, 1);
  assert.equal(Object.hasOwn(q, 'pending'), false);
  const html = renderQualify(m, { role: 'senior', params: {} });
  assert.doesNotMatch(html, /hand-entered suppliers? (is|are) saved|once hand entry ships/);
  const badCard = html.slice(html.indexOf('data-id="NEW-02"'), html.indexOf('</button>', html.indexOf('data-id="NEW-02"')));
  assert.match(badCard, /ENGINE ERROR<\/span> <span class="badge muted">Entered by hand/);
  // The detail of a bad stored record still offers Edit and Delete.
  const d = renderDetail(queueModel(m, { supplier: 'NEW-02' }), { role: 'senior', params: { supplier: 'NEW-02' } });
  assert.match(d, /data-act="manual-edit"/);
  assert.match(d, /data-act="manual-delete"/);
  assert.match(d, /Engine error: /);
});

// ---- 15, 16. Drafts and detail actions (UIQ-FR-17) ----

test('15 UIQ-FR-17: the manual Drafts variant lists engine RFI items and audit focus, with no email, agent label or Copy', () => {
  const ev = modelOf([SUP07_RECORD]).candidates[1].evaluation;
  const html = renderDrafts(draftsModel(ev, null), { manual: true });
  assert.deepEqual(listIds(html, 'draft-items'), ev.rfi_items);
  assert.deepEqual(listIds(html, 'draft-plan'), ev.audit_focus);
  for (const bad of ['<pre', 'data-copy', 'DRAFT', 'Agent draft', 'No draft email', 'Drafted by an agent', 'No question drafted']) assert.ok(!html.includes(bad), bad);
  assert.match(html, /Entered by hand\. No email is drafted/);
  // Empty lists read as such.
  const empty = renderDrafts(draftsModel({ ...ev, rfi_items: [], audit_focus: [] }, null), { manual: true });
  assert.match(empty, /No information is requested\./);
  assert.match(empty, /No audit focus: nothing to probe on site\./);
  // The default (dataset) variant is unchanged: it still carries the agent label.
  assert.match(renderDrafts(draftsModel(ev, null)), /Agent draft/);
});

test('16 UIQ-FR-16, -17: a manual supplier\'s detail has Edit, Export, Delete; the confirm shows only when asked; Drafts tab is the manual variant', () => {
  const m = modelOf([SUP07_RECORD]);
  const q = queueModel(m, { supplier: 'NEW-01' });
  const ctx = { role: 'senior', params: { supplier: 'NEW-01' } };
  const d = renderDetail(q, ctx);
  assert.match(d, /data-act="manual-edit" data-id="NEW-01" data-href="#view=qualify&amp;role=senior&amp;supplier=NEW-01&amp;new=1">Edit</);
  assert.match(d, /data-act="manual-export" data-id="NEW-01">Export</);
  assert.match(d, /data-act="manual-delete" data-id="NEW-01">Delete</);
  assert.doesNotMatch(d, /manual-confirm-delete|Delete NEW-01\?/);
  const conf = renderDetail(q, { ...ctx, manualConfirm: 'NEW-01' });
  assert.match(conf, /<span>Delete NEW-01\?<\/span><button[^>]*data-act="manual-confirm-delete" data-id="NEW-01">Delete<\/button><button[^>]*data-act="manual-cancel"/);
  assert.doesNotMatch(conf, /data-act="manual-delete"/);
  assert.doesNotMatch(renderDetail(q, { ...ctx, manualConfirm: 'NEW-09' }), /Delete NEW-01\?/);
  assert.match(renderDetail(q, { ...ctx, manualNote: "Can't save in this browser" }), /<p class="quiet" role="status">Can&#39;t save in this browser<\/p>/);
  const drafts = renderDetail(q, { ...ctx, params: { ...ctx.params, tab: 'drafts' } });
  assert.match(drafts, /Entered by hand\. No email is drafted/);
  assert.doesNotMatch(drafts, /Agent draft|<pre|data-copy/);
  // Dataset suppliers get no manual actions.
  assert.doesNotMatch(renderDetail(queueModel(m, { supplier: 'SUP-01' }), { role: 'senior', params: { supplier: 'SUP-01' } }), /manual-edit|manual-delete/);
});

// ---- 17. validation render ----

test('17 UIQ-FR-15: step 1 shows "Enter a supplier name" inline only after a refused Continue; Continue is aria-disabled until ready', () => {
  const model = modelOf();
  const quiet = renderEntry(model, ctxOf(blankEntry()));
  assert.match(quiet, /<h3 id="entry-title" tabindex="-1">New supplier<\/h3>/);
  assert.doesNotMatch(quiet, /Enter a supplier name|Pick a Stark part<\/p>/);
  assert.match(quiet, /data-act="entry-continue" aria-disabled="true">Continue/);
  const parts = [...quiet.matchAll(/<option value="(SI-[^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(parts, Object.values(SHEETS).map((s) => s.value.part_no).sort(), 'every loaded sheet, by part number');
  const shout = renderEntry(model, ctxOf(blankEntry(), { error: 'Enter a supplier name and pick a part' }));
  assert.match(shout, /<p class="entry-error" id="entry-name-error" role="alert">Enter a supplier name<\/p>/);
  assert.match(shout, /<p class="entry-error" id="entry-part-error" role="alert">Pick a Stark part<\/p>/);
  assert.match(shout, /id="entry-name"[^>]*aria-invalid="true"/);
  const named = renderEntry(model, ctxOf(setPart({ ...blankEntry(), name: 'Acme' }, CP), { error: 'x' }));
  assert.doesNotMatch(named, /Enter a supplier name|role="alert">Pick a Stark part/);
  assert.match(named, /data-act="entry-continue">Continue/);
  const prof = RUBRIC.commodities.find((p) => p.key === CP.commodity);
  assert.ok(named.includes(`<p class="quiet" id="entry-profile">Commodity ${esc(prof.name)} · ${prof.risk} risk</p>`));
});

test('issue 46 UIQ-FR-15: the commodity line is always in step 1 (empty with no part) so main.js can set it in place', () => {
  const model = modelOf();
  const blank = renderEntry(model, ctxOf(blankEntry()));
  assert.equal([...blank.matchAll(/id="entry-profile"/g)].length, 1);
  assert.ok(blank.includes('<p class="quiet" id="entry-profile"></p>'));
  const picked = renderEntry(model, ctxOf(setPart({ ...blankEntry(), name: 'Acme' }, CP)));
  // docs/RUBRIC.md: cold_plate is "Cold plate / coolant manifold", High risk.
  assert.ok(picked.includes('<p class="quiet" id="entry-profile">Commodity Cold plate / coolant manifold · High risk</p>'));
  assert.equal(profileLine('cold_plate'), 'Commodity Cold plate / coolant manifold · High risk');
  assert.equal(profileLine(null), '');
  assert.equal(profileLine('bogus'), '');
  // No sheets: no select, and the line is still there (empty), so refreshEntry finds nothing to break on.
  const none = renderEntry(modelOf([], STARK_REFERENCE, {}), ctxOf({ ...blankEntry(), name: 'Acme' }));
  assert.ok(none.includes('<p class="quiet" id="entry-profile"></p>') && !none.includes('id="entry-part"'));
  // Step 2 has no commodity line (it has its own heading), so the id stays unique to step 1.
  assert.doesNotMatch(renderEntry(model, ctxOf(sup07Entry())), /id="entry-profile"/);
});

test('17: no requirement sheets loaded: the picker says so and Continue is disabled', () => {
  const html = renderEntry(modelOf([], STARK_REFERENCE, {}), ctxOf({ ...blankEntry(), name: 'Acme' }));
  assert.match(html, /No requirement sheets loaded/);
  assert.match(html, /data-act="entry-continue"[^>]*disabled>Continue/);
});

test('17 UIQ-FR-16: storage blocked: the entry shows "Can\'t save in this browser" and still scores', () => {
  const html = renderEntry(modelOf(), ctxOf(sup07Entry(), { saveNote: "Can't save in this browser" }));
  assert.match(html, /<p class="quiet" role="status">Can&#39;t save in this browser<\/p>/);
  assert.match(livePart(html), /<strong>82\.6<\/strong>/);
  assert.doesNotMatch(renderEntry(modelOf(), ctxOf(sup07Entry())), /Can&#39;t save/);
  const refused = renderEntry(modelOf(), ctxOf(sup07Entry(), { error: 'Fix the highlighted rows before saving' }));
  assert.match(refused, /<p class="entry-error" role="alert">Fix the highlighted rows before saving<\/p>/);
});

test('17: user text is escaped (name, where, note)', () => {
  const e = setRow({ ...sup07Entry(), name: '<b>x</b>' }, '6.lead_time', { where: '"><img src=x>', note: '<script>' });
  const html = renderEntry(modelOf(), ctxOf(e));
  assert.doesNotMatch(html, /<b>x<\/b>|<img src=x>|<script>/);
  assert.match(html, /&lt;b&gt;x&lt;\/b&gt;/);
});

test('17: Edit opens on the record (title names the ID, values restored)', () => {
  const html = renderEntry(modelOf([SUP07_RECORD]), ctxOf(entryFromRecord(SUP07_RECORD)));
  assert.match(html, /Edit <span class="mono">NEW-01<\/span>/);
  assert.match(rowHtml(html, '2.ctq_cpk'), /value="1\.12"/);
  assert.match(livePart(html), /<strong>82\.6<\/strong>/);
});

// ---- 18. router and hash edge cases ----

test('18: the hash carries new and supplier; canonical order; queueHref filter keeps new, supplier drops it', () => {
  assert.deepEqual(parseHash('#view=qualify&new=1&supplier=NEW-01'), { view: 'qualify', role: 'senior', params: { supplier: 'NEW-01', new: '1' } });
  assert.equal(parseHash('#view=qualify&supplier=NEW-100').params.supplier, 'NEW-100');
  assert.equal(parseHash('#view=today&new=1').params.new, undefined, 'new is Qualify only');
  assert.deepEqual(Object.keys(ROUTE_KEYS).filter((k) => ['supplier', 'filter', 'new'].includes(k)), ['supplier', 'filter', 'new']);
  assert.equal(formatHash({ new: '1', supplier: 'NEW-01', role: 'junior', view: 'qualify' }), '#view=qualify&role=junior&supplier=NEW-01&new=1');
  const ctx = { role: 'senior', params: { new: '1', filter: 'senior' } };
  assert.equal(queueHref(ctx, { filter: 'junior' }), '#view=qualify&role=senior&filter=junior&new=1');
  assert.equal(queueHref(ctx, { supplier: 'SUP-01' }), '#view=qualify&role=senior&supplier=SUP-01&filter=senior');
});

test('18: new=1 with a dataset supplier shows the normal detail; an unknown NEW-xx is Not found', () => {
  const m = modelOf([SUP07_RECORD]);
  const r1 = resolveRoute(parseHash('#view=qualify&new=1&supplier=SUP-01'), m);
  assert.equal(r1.notFound, null);
  const html = qualify.render(m, { role: r1.role, params: r1.params, notFound: r1.notFound, entry: null });
  assert.match(html, /<h3 id="detail-title" tabindex="-1">Dataset Co <span class="mono">SUP-01<\/span><\/h3>/);
  assert.doesNotMatch(html, /entry-title/);
  const r2 = resolveRoute(parseHash('#view=qualify&new=1&supplier=NEW-42'), m);
  assert.deepEqual(r2.notFound, { key: 'supplier', value: 'NEW-42', label: 'Not found' });
  assert.match(qualify.render(m, { role: r2.role, params: r2.params, notFound: r2.notFound, entry: null }), /Not found/);
  // A saved one resolves.
  assert.equal(resolveRoute(parseHash('#view=qualify&supplier=NEW-01'), m).notFound, null);
});

test('18: the Qualify view renders the entry in the detail column only with new=1 and an entry; phone opens it', () => {
  const m = modelOf();
  const ctx = ctxOf(blankEntry());
  const open = qualify.render(m, ctx);
  assert.match(open, /<div class="qualify" data-open="true">/);
  assert.match(open, /<section class="detail entry" aria-labelledby="entry-title">/);
  assert.match(open, /data-href="#view=qualify&amp;role=senior&amp;new=1">\+ New supplier<\/button>/);
  assert.match(open, /data-act="manual-import">Import<\/button>/);
  assert.doesNotMatch(qualify.render(m, { ...ctx, params: {} }), /entry-title/);
  assert.match(qualify.render(m, { role: 'senior', params: {}, importError: 'schema: expected "sqc-manual/1"' }),
    /<p class="quiet" role="alert">Import refused: schema: expected &quot;sqc-manual\/1&quot;<\/p>/);
});

test('an uploaded sheet sharing a built-in commodity is offered and resolves to its own limits (issue 78)', async () => {
  const { uploadModel } = await import('./sheet-upload.js');
  const up = { ...structuredClone(CP), part_no: 'SI-UP-0003', part_name: 'Uploaded cold plate' };
  const model = uploadModel(modelOf(), [up]);
  assert.equal(sheetFor(model, CP.part_no).part_no, CP.part_no, 'built-in still resolves to itself');
  assert.equal(sheetFor(model, 'SI-UP-0003'), up, 'uploaded part resolves to the uploaded sheet, not the built-in one');
  const html = renderEntry(model, { role: 'senior', params: {}, entry: { state: blankEntry(), error: null } });
  assert.match(html, /SI-UP-0003/, 'the part picker lists the uploaded part');
});

test('issue 140: empty entry profile is hidden by the scoped quiet-paragraph rule', () => {
  const css = readFileSync(new URL('./app.css', import.meta.url), 'utf8');
  assert.match(css, /\.entry-field p\.quiet:empty\{display:none\}/);
  const html = renderEntry(modelOf(), ctxOf(blankEntry()));
  assert.match(html, /<div class="entry-field"><label for="entry-part">[\s\S]*?<p class="quiet" id="entry-profile"><\/p><\/div>/);
  const picked = renderEntry(modelOf(), ctxOf(setPart({ ...blankEntry(), name: 'Fictional shop' }, CP)));
  assert.match(picked, /<p class="quiet" id="entry-profile">Commodity [^<]+<\/p>/);
});

test('issue 137: focus scrolling is instant only outside the unobscured viewport', () => {
  const css = readFileSync(new URL('./app.css', import.meta.url), 'utf8');
  assert.match(css, /:root:has\(\.entry:focus-within\)\{scroll-behavior:auto\}/);
  for (const rect of [{ top: -1, bottom: 31 }, { top: 850, bottom: 901 }, { top: 199, bottom: 231 }])
    assert.deepEqual(entryFocusScroll(rect, 900, 200), { block: 'center', behavior: 'instant' });
  for (const rect of [{ top: 200, bottom: 232 }, { top: 868, bottom: 900 }, { top: 400, bottom: 432 }])
    assert.equal(entryFocusScroll(rect, 900, 200), null);
  assert.equal(entryFocusScroll(null, 900), null);
  assert.equal(entryFocusScroll({ top: 0, bottom: 32 }, 900), null);
});

test('issue 137: reveal cancels pending motion at unchanged coordinates before measuring a visible field', () => {
  const calls = [];
  let pending = true;
  const viewport = {
    scrollX: 12.5, scrollY: 400.25, innerHeight: 900,
    scrollTo(options) {
      assert.deepEqual(options, { left: 12.5, top: 400.25, behavior: 'instant' });
      pending = false;
      calls.push('cancel');
    }
  };
  const target = {
    getBoundingClientRect() {
      assert.equal(pending, false);
      calls.push('measure');
      return { top: 200, bottom: 232 };
    },
    scrollIntoView() {
      assert.fail('already-visible select must not jump');
    }
  };
  assert.equal(revealEntryFocus(target, viewport, 200), null);
  assert.deepEqual(calls, ['cancel', 'measure']);
  assert.equal(viewport.scrollX, 12.5);
  assert.equal(viewport.scrollY, 400.25);
});

test('issue 137: reveal centers an obscured field instantly after cancelling motion', () => {
  for (const rect of [{ top: 199.5, bottom: 231.5 }, { top: 869, bottom: 901 }]) {
    const calls = [];
    const viewport = {
      scrollX: 0, scrollY: 1800, innerHeight: 900,
      scrollTo(options) {
        calls.push(['cancel', options]);
      }
    };
    const target = {
      getBoundingClientRect() {
        calls.push(['measure']);
        return rect;
      },
      scrollIntoView(options) {
        calls.push(['reveal', options]);
      }
    };
    assert.deepEqual(revealEntryFocus(target, viewport, 200), { block: 'center', behavior: 'instant' });
    assert.deepEqual(calls, [
      ['cancel', { left: 0, top: 1800, behavior: 'instant' }],
      ['measure'],
      ['reveal', { block: 'center', behavior: 'instant' }]
    ]);
  }
});

test('issue 137: no target does not touch the viewport', () => {
  const viewport = new Proxy({}, {
    get() {
      assert.fail('null target must not access viewport');
    }
  });
  assert.equal(revealEntryFocus(null, viewport), null);
});

test('issue 138: new-supplier Stark limit shows the stored between range', () => {
  const sheet = SHEETS.sheet_metal.value;
  const entry = { ...setPart({ ...blankEntry(), name: 'Fictional shop' }, sheet), step: 2 };
  const row = rowHtml(renderEntry(modelOf(), ctxOf(entry)), '4.coating_thickness');
  assert.match(row, /Stark limit:/);
  assert.ok(row.includes('60–100 µm'));
});

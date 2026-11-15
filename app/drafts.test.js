// Drafts sub-tab (#43; UIQ-FR-10, -17, UIQ-AC-04, OVR-FR-07, UIQ NG2; DESIGN-SPEC 4.4, 7; decisions 50-57).
// Built on real engine output: the engine lists are read from the evaluation the model holds, never typed in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildModel } from './model.js';
import { STARK_REFERENCE, parseHistory } from './engine.js';
import { RUBRIC } from './rubric.js';
import { perfectExtraction } from './rubric.testkit.js';
import { requirementName } from './criteria.js';
import { queueModel, renderDetail, FILTERS } from './queue.js';
import { UI_DRAFT_LABEL, DRAFT_LABEL, draftsModel, renderDrafts, copyPayload } from './drafts.js';
import { DRAFT_LABEL as AGENT_LABEL } from '../agent/drafts.mjs';
import { simulateCandidates, AS_OF } from '../sim/candidate.mjs';
import { factsToReference } from '../sim/answer-key.mjs';

const HISTORY = parseHistory('date,supplier_id,part_no,received_qty,rejected_qty,on_time,defect_found_at,failure_mode_code,scar_id,scar_opened,scar_closed\n'
  + '2026-10-06,ACT-01,CP-1,200,0,1,none,,,,\n');
const PCBA = perfectExtraction(RUBRIC, 'pcba');
const missing = (ids) => ({ ...PCBA, criteria: PCBA.criteria.map((c) => (ids.includes(c.id) ? { ...c, state: 'missing', value: null, citation: null } : c)) });
// Four missing rows: rfi_items and audit_focus (top 3) come out in different orders, so engine order is testable.
const GAPPY = missing(['6.lead_time', '6.ramp_plan', '9.region_risk', '2.spc']);
const sup = (id) => ({ id, name: `Name ${id}`, commodity: 'pcba', part: 'pcba' });

/** extractions: { id: extraction value | { fail } }. Real buildModel, real evaluate. */
function modelOf(extractions, as_of = '2026-11-01') {
  const ids = Object.keys(extractions);
  return buildModel({
    suppliers: { ok: true, path: 'data/suppliers.json', value: { as_of, candidates: ids.map(sup), active: [sup('ACT-01')] } },
    history: { ok: true, path: 'data/history.csv', value: HISTORY },
    extractions: Object.fromEntries(ids.map((id) => [id, extractions[id].fail
      ? { ok: false, error: { path: `data/extracted/${id}.json`, message: 'HTTP 404', kind: 'fetch' } }
      : { ok: true, path: `data/extracted/${id}.json`, value: { ...extractions[id], supplier_id: id } }])),
    manual: { records: [], error: null },
  }, STARK_REFERENCE);
}
const evOf = (x) => modelOf({ 'SUP-01': x }).candidates[0].evaluation;
const EV = evOf(GAPPY);
const PERFECT_EV = evOf(PCBA);

/** Agent-shaped drafts that agree with the engine (as sim/answer-key.mjs writes them). */
const draftsFor = (ev, over = {}) => ({ rfi_items: [...ev.rfi_items], rfi_email: `${DRAFT_LABEL}\n\nPlease send evidence.`,
  audit_focus: [...ev.audit_focus], audit_plan: ev.audit_focus.map((id) => ({ criterion_id: id, question: `Show ${id}.` })), ...over });

const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const preText = (html) => { const m = /<pre id="draft-rfi" class="draft-text" tabindex="0">([\s\S]*?)<\/pre>/.exec(html); return m && unesc(m[1]); };
const count = (s, sub) => s.split(sub).length - 1;
const copyButtons = (html) => [...html.matchAll(/<button[^>]*data-copy="([^"]*)"[^>]*>/g)].map((x) => x[1]);

test('model: engine lists in engine order; plan question matched by criterion_id, not by index', () => {
  assert.notDeepEqual(EV.rfi_items, EV.audit_focus, 'fixture: the two engine lists differ in order');
  assert.ok(EV.audit_focus.length >= 2);
  const d = draftsFor(EV);
  d.audit_plan = [...d.audit_plan].reverse();
  const m = draftsModel(EV, d);
  assert.deepEqual(m.rfi.items, EV.rfi_items.map((id) => ({ id, name: requirementName(id) })));
  assert.deepEqual(m.plan.items.map((x) => x.id), EV.audit_focus);
  assert.deepEqual(m.plan.items.map((x) => x.n), EV.audit_focus.map((_, i) => i + 1));
  assert.deepEqual(m.plan.items.map((x) => x.question), EV.audit_focus.map((id) => `Show ${id}.`));
  assert.ok(m.plan.items.every((x) => typeof x.name === 'string'));
  assert.equal(m.hasDraft, true);
  assert.equal(m.mismatch, false);
});

test('verbatim and escaped: the <pre> decodes to the exact email; questions escaped too', () => {
  const email = '<img onerror=x>&"\n\nline\n';
  const q = '<script>alert(1)</script> & "q"';
  const d = draftsFor(EV, { rfi_email: email });
  d.audit_plan[0] = { criterion_id: EV.audit_focus[0], question: q };
  const html = renderDrafts(draftsModel(EV, d));
  assert.doesNotMatch(html, /<img|<script/);
  assert.match(html, /&lt;img onerror=x&gt;&amp;&quot;/);
  assert.equal(preText(html), email, 'newlines, blank line and trailing newline kept; nothing trimmed');
  assert.doesNotMatch(html.slice(html.indexOf('<pre'), html.indexOf('</pre>')), /<br>/);
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;q&quot;'));
});

test('copyPayload rfi: the stored email exactly; null without one', () => {
  const email = '  DRAFT\n\nbody  \n';
  assert.equal(copyPayload(draftsModel(EV, draftsFor(EV, { rfi_email: email })), 'rfi'), email);
  assert.equal(copyPayload(draftsModel(EV, null), 'rfi'), null);
  assert.equal(copyPayload(draftsModel(EV, draftsFor(EV)), 'bogus'), null);
});

test('copyPayload plan: label line, blank line, then n. Name (id): question in engine order', () => {
  const d = draftsFor(EV);
  d.audit_plan = d.audit_plan.slice(1).reverse();  // first focus id has no question
  const got = copyPayload(draftsModel(EV, d), 'plan');
  const lines = EV.audit_focus.map((id, i) => `${i + 1}. ${requirementName(id)} (${id}): ${i === 0 ? 'No question drafted.' : `Show ${id}.`}`);
  assert.equal(got, `${DRAFT_LABEL}\n\n${lines.join('\n')}`);
  assert.equal(copyPayload(draftsModel(EV, draftsFor(EV, { audit_plan: [] })), 'plan'), null, 'no questions: nothing to copy');
  assert.equal(copyPayload(draftsModel(PERFECT_EV, draftsFor(PERFECT_EV)), 'plan'), null, 'no audit focus: nothing to copy');
});

test('copyPayload plan: an unknown id prints once, with no name and no "null"', () => {
  const ev = { ...EV, audit_focus: ['zz.unknown', EV.audit_focus[0]] };
  const got = copyPayload(draftsModel(ev, draftsFor(ev)), 'plan');
  assert.equal(got.split('\n')[2], '1. zz.unknown: Show zz.unknown.');
  assert.doesNotMatch(got, /null/);
});

test('label parity with agent/drafts.mjs, and app/drafts.js imports only ./html.js and ./criteria.js', () => {
  assert.equal(DRAFT_LABEL, AGENT_LABEL);
  const src = readFileSync(new URL('./drafts.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /from\s+['"][^'"]*agent\//);
  assert.deepEqual([...src.matchAll(/^import[^;]*?from\s+['"]([^'"]+)['"]/gm)].map((x) => x[1]), ['./html.js', './criteria.js']);
  assert.doesNotMatch(src, /\bimport\s*\(/, 'no dynamic import');
});

test('render: draft labels, both Copy buttons, live status, <pre>; nothing that sends', () => {
  const html = renderDrafts(draftsModel(EV, draftsFor(EV)));
  assert.equal(count(html, `<p class="eyebrow muted">${UI_DRAFT_LABEL}</p>`), 2);
  assert.equal(count(html, 'Nothing is sent from this app.'), 2);
  assert.deepEqual(copyButtons(html), ['rfi', 'plan']);
  assert.match(html, /data-copy="rfi" data-copy-target="draft-rfi" aria-label="Copy RFI email">Copy<\/button>/);
  assert.match(html, /data-copy="plan" data-copy-target="draft-plan" aria-label="Copy audit plan">Copy<\/button>/);
  assert.equal(count(html, 'role="status" aria-live="polite"'), 2);
  assert.match(html, /<pre id="draft-rfi"/);
  assert.match(html, /<ol id="draft-plan"/);
  assert.equal(count(html, '<section class="panel draft-panel"'), 2);
  assert.doesNotMatch(html, /<form|mailto:|href|<a\b/i);
  assert.doesNotMatch(html, /<button[^>]*>[^<]*send/i);
  assert.doesNotMatch(html, /draft-warn/, 'lists agree: no mismatch note');
  // Engine lists render: every RFI item and every focus id, in order.
  const ul = html.slice(html.indexOf('<ul class="draft-items">'), html.indexOf('</ul>'));
  assert.deepEqual([...ul.matchAll(/<span class="mono">([^<]+)<\/span>/g)].map((x) => x[1]), EV.rfi_items);
  const ol = html.slice(html.indexOf('<ol id="draft-plan"'), html.indexOf('</ol>'));
  assert.deepEqual([...ol.matchAll(/<span class="mono">([^<]+)<\/span>/g)].map((x) => x[1]), EV.audit_focus);
});

for (const [label, drafts] of [['null', null], ['undefined', undefined], ['[]', []], ["'x'", 'x'], ['42', 42], ['{}', {}]]) {
  test(`edge: drafts ${label} renders the engine lists only, no Copy, never throws`, () => {
    const m = draftsModel(EV, drafts);
    assert.equal(m.hasDraft, false);
    assert.equal(m.rfi.email, null);
    assert.ok(m.plan.items.every((x) => x.question === null));
    assert.equal(m.mismatch, label === '{}', 'only an object is compared');
    const html = renderDrafts(m);
    assert.deepEqual(copyButtons(html), []);
    assert.match(html, /No draft email for this supplier\./);
    assert.equal(count(html, 'No question drafted.'), EV.audit_focus.length);
    for (const id of [...EV.rfi_items, ...EV.audit_focus]) assert.ok(html.includes(`<span class="mono">${id}</span>`), id);
    assert.doesNotMatch(html, /<pre/);
  });
}

test('UIQ-FR-17: a hand-entered row (source manual, drafts null) lists the engine RFI items and audit focus, no email', () => {
  const m = modelOf({ 'SUP-01': GAPPY });
  const manual = { ...m.candidates[0], source: 'manual', drafts: null };
  const html = renderDetail(queueModel({ ...m, candidates: [manual] }, { supplier: 'SUP-01' }), { params: { supplier: 'SUP-01', tab: 'drafts' } });
  assert.match(html, /<div class="drafts">/);
  for (const id of [...EV.rfi_items, ...EV.audit_focus]) assert.ok(html.includes(`<span class="mono">${id}</span>`), id);
  // issue 77, decision 168: the manual variant drops the agent label, email block and Copy.
  assert.match(html, /Entered by hand\. No email is drafted/);
  assert.doesNotMatch(html, /No draft email|Agent draft|<pre|data-copy=/);
});

test('edge: empty engine lists read "No information is requested." and "No audit focus"; an email still shows verbatim', () => {
  assert.deepEqual(PERFECT_EV.rfi_items, []);
  assert.deepEqual(PERFECT_EV.audit_focus, []);
  const email = `${DRAFT_LABEL}\n\nNo additional evidence requested.`;
  const html = renderDrafts(draftsModel(PERFECT_EV, draftsFor(PERFECT_EV, { rfi_email: email })));
  assert.match(html, /<p class="quiet">No information is requested\.<\/p>/);
  assert.match(html, /<p class="quiet">No audit focus: nothing to probe on site\.<\/p>/);
  assert.equal(preText(html), email);
  assert.deepEqual(copyButtons(html), ['rfi']);
  const none = renderDrafts(draftsModel(PERFECT_EV, null));
  assert.match(none, /No information is requested\./);
  assert.doesNotMatch(none, /<ol|<ul/);
});

test('edge: a non-string or empty email and non-string questions count as absent', () => {
  for (const rfi_email of [42, '', null, ['x'], { a: 1 }]) {
    const m = draftsModel(EV, draftsFor(EV, { rfi_email, audit_plan: [] }));
    assert.equal(m.rfi.email, null, JSON.stringify(rfi_email));
    assert.equal(m.hasDraft, false);
  }
  const plan = [{ criterion_id: EV.audit_focus[0], question: 7 }, { criterion_id: EV.audit_focus[1], question: null }, 'oops', null,
    { criterion_id: EV.audit_focus[2] }];
  assert.ok(draftsModel(EV, draftsFor(EV, { audit_plan: plan })).plan.items.every((x) => x.question === null));
  for (const audit_plan of [null, 'x', { a: 1 }]) {
    assert.ok(draftsModel(EV, draftsFor(EV, { audit_plan })).plan.items.every((x) => x.question === null), JSON.stringify(audit_plan));
  }
});

test('edge: plan entries for ids outside the engine focus are ignored; the first entry per id wins', () => {
  const [a, b] = EV.audit_focus;
  const plan = [{ criterion_id: 'zz.extra', question: 'Extra?' }, { criterion_id: b, question: 'B first' }, { criterion_id: a, question: 'A' },
    { criterion_id: b, question: 'B second' }];
  const m = draftsModel(EV, draftsFor(EV, { audit_plan: plan }));
  assert.deepEqual(m.plan.items.map((x) => x.id), EV.audit_focus);
  assert.equal(m.plan.items[0].question, 'A');
  assert.equal(m.plan.items[1].question, 'B first');
  assert.doesNotMatch(renderDrafts(m), /Extra\?|zz\.extra|B second/);
});

test('edge: an unknown criterion id renders the id alone, never "null"', () => {
  const ev = { ...EV, rfi_items: ['zz.unknown'], audit_focus: ['zz.unknown'] };
  const m = draftsModel(ev, null);
  assert.deepEqual(m.rfi.items, [{ id: 'zz.unknown', name: null }]);
  const html = renderDrafts(m);
  assert.match(html, /<li><span class="mono">zz\.unknown<\/span><\/li>/);
  assert.match(html, /<li><span class="mono">zz\.unknown<\/span><br>/);
  assert.doesNotMatch(html, /null/);
});

test('mismatch: equal lists false; a dropped, extra, reordered or non-array list true, with the note', () => {
  assert.equal(draftsModel(EV, draftsFor(EV)).mismatch, false);
  const [x, y, ...rest] = EV.rfi_items;
  const [f, g, ...frest] = EV.audit_focus;
  const cases = {
    'rfi dropped': { rfi_items: EV.rfi_items.slice(1) },
    'rfi extra': { rfi_items: [...EV.rfi_items, '1.cert_scope'] },
    'rfi duplicate (same length as a set compare)': { rfi_items: [x, x, ...rest] },
    'rfi swapped': { rfi_items: [y, x, ...rest] },
    'rfi not array': { rfi_items: 'x' },
    'rfi missing': { rfi_items: undefined },
    'focus dropped': { audit_focus: EV.audit_focus.slice(1) },
    'focus extra': { audit_focus: [...EV.audit_focus, '1.cert_scope'] },
    'focus swapped': { audit_focus: [g, f, ...frest] },
    'focus not array': { audit_focus: null },
  };
  for (const [name, over] of Object.entries(cases)) {
    const m = draftsModel(EV, draftsFor(EV, over));
    assert.equal(m.mismatch, true, name);
    const html = renderDrafts(m);
    assert.match(html, /<p class="draft-warn"><span aria-hidden="true">~ <\/span>Heads up: the draft's lists differ from the engine's\./, name);
  }
});

test('integration: renderDetail shows the Drafts panel on tab=drafts only; the placeholder is gone', () => {
  const m = modelOf({ 'SUP-01': { ...GAPPY, drafts: draftsFor(EV) } });
  const detail = (params) => renderDetail(queueModel(m, { supplier: 'SUP-01' }), { params: { supplier: 'SUP-01', ...params } });
  const html = detail({ tab: 'drafts' });
  assert.match(html, /<div class="drafts">/);
  assert.doesNotMatch(html, /arrive in #43/);
  assert.deepEqual(copyButtons(html), ['rfi', 'plan']);
  assert.match(html, /aria-labelledby="dtab-drafts"/);
  for (const tab of [undefined, 'problems', 'categories', 'requirements']) assert.doesNotMatch(detail({ tab }), /class="drafts"|data-copy=/, String(tab));
});

test('integration: buildModel keeps the file\'s drafts on scored rows, null on not-extracted and engine-error rows', () => {
  const drafts = draftsFor(EV);
  const m = modelOf({ 'SUP-01': { ...GAPPY, drafts }, 'SUP-02': GAPPY, 'SUP-03': { fail: true }, 'SUP-04': { ...GAPPY, commodity: 'bogus', drafts } });
  const [a, b, c, d] = m.candidates;
  assert.equal(a.status, 'scored');
  assert.equal(a.drafts, drafts, 'passed through as is');
  assert.equal(b.drafts, null, 'scored, no drafts field');
  assert.deepEqual([c.status, c.drafts], ['not-extracted', null]);
  assert.deepEqual([d.status, d.drafts], ['engine-error', null]);
  for (const id of ['SUP-03', 'SUP-04']) {
    const html = renderDetail(queueModel(m, { supplier: id }), { params: { supplier: id, tab: 'drafts' } });
    assert.doesNotMatch(html, /Draft|data-copy=|role="tablist"/, id);
  }
});

test('dev world: the sim/answer-key reference drafts (SUP-02, seed 101) pass through unchanged and agree with the engine', async () => {
  const fact = (await simulateCandidates(101)).find((f) => f.supplier_id === 'SUP-02');
  const ref = factsToReference(fact);
  const before = JSON.stringify(ref.drafts);
  const m = buildModel({
    suppliers: { ok: true, path: 'suppliers.json', value: { as_of: AS_OF, candidates: [{ id: 'SUP-02', name: 'N', commodity: ref.commodity, part: ref.commodity }], active: [] } },
    history: { ok: true, path: 'history.csv', value: HISTORY },
    extractions: { 'SUP-02': { ok: true, path: 'extracted/SUP-02.json', value: ref } },
    manual: { records: [], error: null },
  }, STARK_REFERENCE);
  const c = m.candidates[0];
  assert.equal(c.status, 'scored');
  assert.equal(c.drafts, ref.drafts);
  const dm = draftsModel(c.evaluation, c.drafts);
  assert.equal(dm.mismatch, false);
  assert.equal(dm.hasDraft, true);
  assert.equal(JSON.stringify(ref.drafts), before, 'not mutated');
  const html = renderDrafts(dm);
  assert.equal(preText(html), ref.drafts.rfi_email);
  assert.equal(copyPayload(dm, 'rfi'), ref.drafts.rfi_email);
  assert.ok(ref.drafts.rfi_email.startsWith(DRAFT_LABEL), 'the email keeps its own in-text label');
});

// ---- Tester additions (#43 QA) ----
const NOTE = '<p class="draft-warn"><span aria-hidden="true">~ </span>Heads up: the draft\'s lists differ from the engine\'s.'
  + ' The engine lists above are the source of truth; review the text before sending.</p>';
const sections = (html) => html.split('<section class="panel draft-panel"').slice(1);

test('deviation 1: an empty-string question counts as absent ("No question drafted."), in model, render and copy', () => {
  const [a, b] = EV.audit_focus;
  const m = draftsModel(EV, draftsFor(EV, { rfi_email: '', audit_plan: [{ criterion_id: a, question: '' }, { criterion_id: b, question: 'Q b' }] }));
  assert.equal(m.plan.items[0].question, null);
  assert.equal(m.plan.items[1].question, 'Q b');
  assert.equal(copyPayload(m, 'plan').split('\n')[2], `1. ${requirementName(a)} (${a}): No question drafted.`);
  const only = draftsModel(EV, draftsFor(EV, { rfi_email: '', audit_plan: [{ criterion_id: a, question: '' }] }));
  assert.equal(only.hasDraft, false);
  assert.equal(copyPayload(only, 'plan'), null, 'an empty question is nothing to copy');
  assert.deepEqual(copyButtons(renderDrafts(only)), []);
});

test('hasDraft and Copy buttons are per side: questions only -> plan Copy; email only (focus present) -> RFI Copy', () => {
  const qOnly = draftsModel(EV, draftsFor(EV, { rfi_email: null }));
  assert.equal(qOnly.hasDraft, true, 'a question alone is a draft');
  assert.deepEqual(copyButtons(renderDrafts(qOnly)), ['plan']);
  assert.match(renderDrafts(qOnly), /No draft email for this supplier\./);
  const eOnly = draftsModel(EV, draftsFor(EV, { audit_plan: [] }));
  assert.ok(eOnly.plan.items.length > 0);
  assert.deepEqual(copyButtons(renderDrafts(eOnly)), ['rfi']);
});

test('labels exact: eyebrow + "Drafted by an agent ... Nothing is sent from this app." in each panel, in that order', () => {
  const html = renderDrafts(draftsModel(EV, draftsFor(EV)));
  assert.equal(UI_DRAFT_LABEL, 'Agent draft — review before sending');
  assert.equal(DRAFT_LABEL, 'DRAFT — prepared by an agent for SQE review. Not sent.');
  for (const [s, title] of sections(html).map((s, i) => [s, ['RFI email', 'Audit plan'][i]])) {
    assert.ok(s.startsWith(` aria-labelledby="draft-${title === 'RFI email' ? 'rfi' : 'plan'}-h"><p class="eyebrow muted">${UI_DRAFT_LABEL}</p>`
      + `<h4 id="draft-${title === 'RFI email' ? 'rfi' : 'plan'}-h">${title}</h4>`
      + '<p class="quiet">Drafted by an agent for a person to review and send. Nothing is sent from this app.</p>'), title);
  }
  assert.equal(sections(html).length, 2);
  // Same labels with no drafts at all (hand-entered).
  assert.equal(count(renderDrafts(draftsModel(EV, null)), `<p class="eyebrow muted">${UI_DRAFT_LABEL}</p>`), 2);
});

test('engine lists sit beside the agent text: RFI panel has the engine <ul> then the <pre>; plan panel the numbered engine <ol>', () => {
  const html = renderDrafts(draftsModel(EV, draftsFor(EV)));
  const [rfi, plan] = sections(html);
  assert.ok(rfi.indexOf('<p class="quiet">Engine RFI items:</p><ul class="draft-items">') > 0);
  assert.ok(rfi.indexOf('</ul>') < rfi.indexOf('<pre id="draft-rfi"'), 'engine list above the draft');
  assert.ok(rfi.indexOf('<pre') < rfi.indexOf('data-copy="rfi"'));
  assert.doesNotMatch(rfi, /draft-plan|data-copy="plan"/);
  assert.ok(plan.includes('<p class="quiet">Engine audit focus:</p><ol id="draft-plan" class="draft-plan" tabindex="0">'));
  assert.doesNotMatch(plan, /<pre|data-copy="rfi"|<ul/);
  const lis = [...plan.matchAll(/<li><span class="mono">([^<]+)<\/span> <strong>([^<]+)<\/strong><br>([^<]*)<\/li>/g)];
  assert.deepEqual(lis.map((x) => x[1]), EV.audit_focus);
  assert.deepEqual(lis.map((x) => unesc(x[2])), EV.audit_focus.map(requirementName));
  assert.deepEqual(lis.map((x) => x[3]), EV.audit_focus.map((id) => `Show ${id}.`));
  const rlis = [...rfi.matchAll(/<li><span class="mono">([^<]+)<\/span> ([^<]+)<\/li>/g)];
  assert.deepEqual(rlis.map((x) => [x[1], unesc(x[2])]), EV.rfi_items.map((id) => [id, requirementName(id)]));
});

test('the UI never slices or re-sorts the engine lists (5 focus ids, reverse-alphabetical, all kept in order)', () => {
  const ids = ['9.region_risk', '6.ramp_plan', '6.lead_time', '3.grr', '2.spc'];
  const rfi = ['6.lead_time', '9.region_risk', '2.spc', '6.ramp_plan', '3.grr'];  // neither sorted nor reverse-sorted
  const m = draftsModel({ rfi_items: rfi, audit_focus: ids }, null);
  assert.deepEqual(m.plan.items.map((x) => [x.n, x.id]), ids.map((id, i) => [i + 1, id]));
  assert.deepEqual(m.rfi.items.map((x) => x.id), rfi);
});

test('mismatch note: exact text, in both panels, right after each engine list; absent with null drafts', () => {
  const m = draftsModel(EV, draftsFor(EV, { audit_focus: [...EV.audit_focus].reverse() }));
  assert.equal(m.mismatch, true);
  const html = renderDrafts(m);
  assert.equal(count(html, NOTE), 2);
  const [rfi, plan] = sections(html);
  assert.ok(rfi.indexOf('</ul>' + NOTE) > 0, 'RFI: note directly after the engine list');
  assert.ok(rfi.indexOf(NOTE) < rfi.indexOf('<pre'));
  assert.ok(plan.indexOf('</ol>' + NOTE) > 0, 'plan: note directly after the engine list');
  // Also with empty engine lists: still placed after the "No ..." line.
  const e = renderDrafts(draftsModel(PERFECT_EV, draftsFor(PERFECT_EV, { rfi_items: ['2.spc'] })));
  assert.equal(count(e, NOTE), 2);
  for (const d of [null, undefined, [], 'x']) assert.doesNotMatch(renderDrafts(draftsModel(EV, d)), /draft-warn/, String(d));
  // Rfi agree but focus differs and vice versa, each alone flips it.
  assert.equal(draftsModel(EV, draftsFor(EV, { rfi_items: [...EV.rfi_items].reverse() })).mismatch, true);
});

test('escaping covers ids and requirement names in both lists; the copy payload stays plain text (no entities)', () => {
  const ev = { rfi_items: ['3.grr', 'zz.<b>x'], audit_focus: ['3.grr', 'zz.<b>x'] };
  const d = { rfi_items: ev.rfi_items, audit_focus: ev.audit_focus, rfi_email: 'e',
    audit_plan: [{ criterion_id: '3.grr', question: 'A & B <c>' }, { criterion_id: 'zz.<b>x', question: 'q' }] };
  const m = draftsModel(ev, d);
  const html = renderDrafts(m);
  assert.doesNotMatch(html, /<b>|R&R/);
  assert.equal(count(html, 'zz.&lt;b&gt;x'), 2);
  assert.equal(count(html, 'Gage R&amp;R'), 2);
  assert.ok(html.includes('A &amp; B &lt;c&gt;'));
  assert.equal(copyPayload(m, 'plan'), `${DRAFT_LABEL}\n\n1. ${requirementName('3.grr')} (3.grr): A & B <c>\n2. zz.<b>x: q`);
  assert.match(requirementName('3.grr'), /R&R/);
});

test('copyPayload plan: questions only for ids outside the engine focus copy nothing', () => {
  const m = draftsModel(EV, draftsFor(EV, { rfi_email: null, audit_plan: [{ criterion_id: 'zz.extra', question: 'Extra?' }] }));
  assert.equal(copyPayload(m, 'plan'), null);
  assert.equal(m.hasDraft, false);
});

test('copyPayload: two-line exact pin (numbering from 1, ". ", " (id): ", newline join, label + blank line)', () => {
  const ev = { rfi_items: [], audit_focus: ['2.spc', '3.grr'] };
  const m = draftsModel(ev, { audit_plan: [{ criterion_id: '3.grr', question: 'Q2' }, { criterion_id: '2.spc', question: 'Q1' }] });
  assert.equal(copyPayload(m, 'plan'),
    `DRAFT — prepared by an agent for SQE review. Not sent.\n\n1. ${requirementName('2.spc')} (2.spc): Q1\n2. ${requirementName('3.grr')} (3.grr): Q2`);
  assert.equal(copyPayload(m, 'rfi'), null);
  assert.equal(copyPayload(m, undefined), null);
});

test('no module under app/ (tests excepted) imports agent/', async () => {
  const { readdirSync } = await import('node:fs');
  const dir = new URL('./', import.meta.url);
  const files = readdirSync(dir, { recursive: true }).filter((f) => /\.m?js$/.test(f) && !/\.test\.m?js$|testkit/.test(f));
  assert.ok(files.includes('drafts.js') && files.includes('main.js') && files.length > 10);
  for (const f of files) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    assert.doesNotMatch(src, /(?:from|import)\s*\(?\s*['"][^'"]*\bagent\//, f);
  }
});

test('main.js copy handler wiring: payload from the model, no execCommand, no hash write', () => {
  const src = readFileSync(new URL('./main.js', import.meta.url), 'utf8');
  const i = src.indexOf("closest('[data-copy]')");
  assert.ok(i > 0);
  const body = src.slice(i, src.indexOf('});', src.indexOf('copyTimers.set(status, setTimeout(() => {', i)));
  assert.match(body, /copyPayload\(draftsModel\(c\.evaluation, c\.drafts\), btn\.dataset\.copy\)/);
  assert.doesNotMatch(body, /execCommand|location\.hash|textContent\s*\)|innerText/);
  assert.match(body, /'Copied'/);
  assert.match(body, /'Select the text to copy'/);
  assert.match(body, /getSelection\(\)\.selectAllChildren/);
  // The shared helper owns the post-failure check; the caller supplies current connectivity (issue 140).
  assert.match(body, /current:\s*\(\)\s*=>\s*btn\.isConnected/);
});

test('hidden-but-selected supplier: a filter that hides the card still renders its own Drafts panel', () => {
  const m = modelOf({ 'SUP-01': { ...GAPPY, drafts: draftsFor(EV) }, 'SUP-02': PCBA });
  const s1 = m.candidates.find((c) => c.id === 'SUP-01');
  const other = FILTERS.map((f) => f.value).find((v) => v && v !== s1.evaluation.routing.to && v !== s1.evaluation.decision);
  const q = queueModel(m, { supplier: 'SUP-01', filter: other });
  assert.equal(q.hidden, true, `fixture: filter ${other} hides SUP-01`);
  const html = renderDetail(q, { params: { supplier: 'SUP-01', filter: other, tab: 'drafts' } });
  assert.equal(preText(html), draftsFor(EV).rfi_email);
  assert.deepEqual(copyButtons(html), ['rfi', 'plan']);
});

test('detail wiring passes the selected row\'s own drafts (two scored suppliers, different emails)', () => {
  const m = modelOf({ 'SUP-01': { ...GAPPY, drafts: draftsFor(EV, { rfi_email: 'one' }) }, 'SUP-02': { ...GAPPY, drafts: draftsFor(EV, { rfi_email: 'two' }) } });
  for (const [id, want] of [['SUP-01', 'one'], ['SUP-02', 'two']]) {
    assert.equal(preText(renderDetail(queueModel(m, { supplier: id }), { params: { supplier: id, tab: 'drafts' } })), want, id);
  }
});

test('mismatch: a draft list that is a strict prefix of the engine\'s (last id dropped) is a mismatch', () => {
  assert.ok(EV.rfi_items.length >= 2 && EV.audit_focus.length >= 2);
  assert.equal(draftsModel(EV, draftsFor(EV, { rfi_items: EV.rfi_items.slice(0, -1) })).mismatch, true, 'rfi prefix');
  assert.equal(draftsModel(EV, draftsFor(EV, { audit_focus: EV.audit_focus.slice(0, -1) })).mismatch, true, 'focus prefix');
  assert.equal(draftsModel(EV, draftsFor(EV, { rfi_items: [] })).mismatch, true, 'empty draft list');
});

test('hasDraft: an email alone (no questions) is a draft', () => {
  const m = draftsModel(EV, draftsFor(EV, { audit_plan: [] }));
  assert.equal(m.hasDraft, true);
  assert.equal(draftsModel(PERFECT_EV, { rfi_email: 'x' }).hasDraft, true);
});

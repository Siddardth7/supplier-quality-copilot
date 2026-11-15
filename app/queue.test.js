// Qualify queue sidebar (#39; UIQ-FR-02, -03, -11, -12, -16 queue half; DESIGN-SPEC 4.4, 7, 8).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildModel } from './model.js';
import { STARK_REFERENCE, parseHistory } from './engine.js';
import { RUBRIC } from './rubric.js';
import { perfectExtraction } from './rubric.testkit.js';
import { parseHash } from './route.js';
import { FILTERS, maySign, queueModel, queueHref, detailModel, renderQueue, renderDetail, renderQualify } from './queue.js';
import * as qualify from './views/qualify.js';

// Real engine output: pcba is Medium risk, so a perfect packet is APPROVED + Junior; missing rows lower it.
const HISTORY = parseHistory('date,supplier_id,part_no,received_qty,rejected_qty,on_time,defect_found_at,failure_mode_code,scar_id,scar_opened,scar_closed\n'
  + '2026-10-06,ACT-01,CP-1,200,0,1,none,,,,\n');
const PCBA = perfectExtraction(RUBRIC, 'pcba');
const missing = (ids) => PCBA.criteria.map((c) => (ids.includes(c.id) ? { ...c, state: 'missing', value: null, citation: null } : c));
const CONDITIONAL_ROWS = ['6.lead_time', '6.ramp_plan', '9.region_risk', '9.financial_health', '7.pcn_notice', '7.change_approval', '8.flowdown', '5.records_retention'];
const ext = (id, criteria = PCBA.criteria) => ({ ok: true, path: `data/extracted/${id}.json`, value: { ...PCBA, criteria, supplier_id: id } });
const fail = (path, message, kind = 'fetch') => ({ ok: false, error: { path, message, kind } });
const sup = (id, name = `Name ${id}`) => ({ id, name, commodity: 'pcba', part: 'pcba' });

function realModel({ manual = [] } = {}) {
  const ids = ['SUP-05', 'SUP-01', 'SUP-03', 'SUP-02', 'SUP-04', 'SUP-06'];
  return buildModel({
    suppliers: { ok: true, path: 'data/suppliers.json', value: { as_of: '2026-11-01', candidates: ids.map((id) => sup(id)), active: [sup('ACT-01')] } },
    history: { ok: true, path: 'data/history.csv', value: HISTORY },
    extractions: {
      'SUP-01': ext('SUP-01'),                                                        // APPROVED, junior
      'SUP-02': ext('SUP-02', missing(CONDITIONAL_ROWS)),                             // CONDITIONAL, senior
      'SUP-03': ext('SUP-03', missing(['1.cert_current', '1.cert_scope', '1.internal_audit'])),  // NOT APPROVED, senior
      'SUP-04': fail('data/extracted/SUP-04.json', 'HTTP 404'),                       // not extracted
      'SUP-05': ext('SUP-05', missing(CONDITIONAL_ROWS)),                             // CONDITIONAL, senior
      'SUP-06': { ok: true, path: 'data/extracted/SUP-06.json', value: { ...PCBA, commodity: 'bogus', supplier_id: 'SUP-06' } },  // engine error
    },
    manual: { records: manual, error: null },
  }, STARK_REFERENCE);
}
const REAL = realModel();

// Hand-built rows: the queue reads only status, evaluation.total/decision/routing.to, source. The rest is the
// minimum evaluation shape the #40 detail and the #43 Drafts tab read when one of these rows is selected.
const row = (id, decision, to, total = 50, over = {}) => ({ id, name: `Name ${id}`, commodity: 'cold_plate', part: 'cold_plate', source: 'dataset',
  status: 'scored', evaluation: { total, decision, routing: { to, reasons: [] }, risk: 'High', policy: { id: 'p', version: 1, name: 'P v1' },
    categories: [], knockouts: { failed: [], assumed: [] }, gaps: [], nice_to_have: [], rfi_items: [], audit_focus: [] }, drafts: null, error: null, ...over });
const unscored = (id, status = 'not-extracted') => ({ id, name: `Name ${id}`, commodity: 'cold_plate', part: 'cold_plate', source: 'dataset', status,
  evaluation: null, error: { path: `data/extracted/${id}.json`, message: status === 'engine-error' ? 'engine boom' : 'HTTP 404', kind: status === 'engine-error' ? 'engine' : 'fetch' } });
const modelOf = (candidates, records = []) => ({ suppliers: { ok: true }, candidates, manual: { records, error: null } });

const cardsIn = (html) => [...html.matchAll(/<button type="button" class="list-card"([^>]*)>([\s\S]*?)<\/button>/g)]
  .map(([, attrs, inner]) => ({ attrs, inner, id: attrs.match(/data-id="([^"]*)"/)[1], pressed: attrs.match(/aria-pressed="([^"]+)"/)[1],
    tabindex: attrs.match(/tabindex="([^"]+)"/)[1], href: attrs.match(/data-href="([^"]*)"/)[1] }));
const pillsIn = (html) => [...html.matchAll(/<button type="button" aria-pressed="(true|false)" data-filter="([^"]*)" data-href="([^"]*)">([^<]+) <span>(\d+)<\/span><\/button>/g)]
  .map(([, pressed, filter, href, label, count]) => ({ pressed, filter, href, label, count: Number(count) }));
const unescape = (s) => s.replace(/&amp;/g, '&');
const CTX = (params = {}, role = 'senior') => ({ role, params, notFound: null });

test('UIQ-FR-02 sort: NOT APPROVED, CONDITIONAL, APPROVED, by ID within each; unscored last by ID (real engine output)', () => {
  const q = queueModel(REAL);
  assert.deepEqual(q.cards.map((c) => [c.id, c.decision]), [
    ['SUP-03', 'NOT APPROVED'], ['SUP-02', 'CONDITIONAL'], ['SUP-05', 'CONDITIONAL'], ['SUP-01', 'APPROVED'], ['SUP-04', null], ['SUP-06', null]]);
  assert.deepEqual(q.cards.map((c) => c.routing), ['senior', 'senior', 'senior', 'junior', null, null]);
  assert.deepEqual(REAL.candidates.map((c) => c.id), ['SUP-05', 'SUP-01', 'SUP-03', 'SUP-02', 'SUP-04', 'SUP-06'], 'input not mutated');
});

test('UIQ-FR-02 sort: ID tiebreak is numeric-aware (SUP-100 after SUP-99) and NEW before SUP', () => {
  const candidates = [row('SUP-100', 'CONDITIONAL', 'senior'), unscored('SUP-10'), row('SUP-99', 'CONDITIONAL', 'senior'), row('SUP-9', 'APPROVED', 'junior'),
    row('NEW-01', 'CONDITIONAL', 'senior', 60, { source: 'manual' }), unscored('SUP-2', 'engine-error'), row('SUP-200', 'NOT APPROVED', 'senior')];
  const before = candidates.map((c) => c.id);
  assert.deepEqual(queueModel(modelOf(candidates)).cards.map((c) => c.id), ['SUP-200', 'NEW-01', 'SUP-99', 'SUP-100', 'SUP-9', 'SUP-2', 'SUP-10']);
  assert.deepEqual(candidates.map((c) => c.id), before);
});

test('UIQ-FR-03 counts: All = every candidate; Junior+Senior and the decisions sum to the scored count; filter and role never change them', () => {
  const q = queueModel(REAL);
  assert.deepEqual(q.counts, { all: 6, junior: 1, senior: 3, 'not-approved': 1, conditional: 2, approved: 1 });
  assert.equal(q.unscored, 2);
  assert.equal(q.counts.junior + q.counts.senior, 4);
  assert.equal(q.counts['not-approved'] + q.counts.conditional + q.counts.approved, 4);
  for (const f of FILTERS) {
    for (const supplier of [undefined, 'SUP-01', 'SUP-04']) assert.deepEqual(queueModel(REAL, { filter: f.value ?? undefined, supplier }).counts, q.counts, `${f.value} ${supplier}`);
  }
  const pills = (role, filter) => pillsIn(renderQualify(REAL, CTX(filter ? { filter } : {}, role))).map((p) => [p.label, p.count]);
  for (const role of ['junior', 'senior']) for (const f of FILTERS) assert.deepEqual(pills(role, f.value), pills('senior'), `${role} ${f.value}`);
  assert.deepEqual(pills('senior'), [['All', 6], ['Junior', 1], ['Senior', 3], ['NOT APPROVED', 1], ['CONDITIONAL', 2], ['APPROVED', 1]]);
});

test('UIQ-FR-03: "N not scored" shows only when N > 0', () => {
  assert.match(renderQualify(REAL, CTX()), /<p class="quiet">2 not scored<\/p>/);
  const all = modelOf([row('SUP-01', 'APPROVED', 'junior')]);
  assert.doesNotMatch(renderQualify(all, CTX()), /not scored/);
});

test('filters: each value returns exactly its cards; unscored only under All; pill hrefs round-trip through parseHash', () => {
  const ids = (filter) => queueModel(REAL, { filter }).cards.map((c) => c.id);
  assert.deepEqual(ids(undefined), ['SUP-03', 'SUP-02', 'SUP-05', 'SUP-01', 'SUP-04', 'SUP-06']);
  assert.deepEqual(ids('junior'), ['SUP-01']);
  assert.deepEqual(ids('senior'), ['SUP-03', 'SUP-02', 'SUP-05']);
  assert.deepEqual(ids('not-approved'), ['SUP-03']);
  assert.deepEqual(ids('conditional'), ['SUP-02', 'SUP-05']);
  assert.deepEqual(ids('approved'), ['SUP-01']);
  // Junior routing and decision differ here, so a filter matching the wrong field fails.
  const odd = modelOf([row('SUP-01', 'NOT APPROVED', 'junior'), row('SUP-02', 'APPROVED', 'senior')]);
  assert.deepEqual(queueModel(odd, { filter: 'junior' }).cards.map((c) => c.id), ['SUP-01']);
  assert.deepEqual(queueModel(odd, { filter: 'approved' }).cards.map((c) => c.id), ['SUP-02']);

  const pills = pillsIn(renderQualify(REAL, CTX({ supplier: 'SUP-01', filter: 'senior' })));
  assert.deepEqual(pills.map((p) => p.label), FILTERS.map((f) => f.label));
  for (const [i, f] of FILTERS.entries()) {
    const parsed = parseHash(unescape(pills[i].href));
    assert.equal(parsed.view, 'qualify');
    assert.equal(parsed.params.filter, f.value ?? undefined, f.label);
    assert.equal(parsed.params.supplier, 'SUP-01', f.label);
    assert.equal(pills[i].pressed, String(f.value === 'senior'), f.label);
  }
  assert.equal(pillsIn(renderQualify(REAL, CTX())).filter((p) => p.pressed === 'true').map((p) => p.label).join(), 'All');
});

test('UIQ-FR-11 queueHref: card, pill, All and back keep and drop the right keys (a pill keeps new, decision 164)', () => {
  const ctx = CTX({ policy: 'p1', supplier: 'SUP-07', tab: 'drafts', doc: 'a.md', sec: '2', filter: 'senior', new: '1' }, 'junior');
  assert.equal(queueHref(ctx, { supplier: 'SUP-01' }), '#view=qualify&role=junior&policy=p1&supplier=SUP-01&filter=senior');
  assert.equal(queueHref(ctx, { filter: 'approved' }), '#view=qualify&role=junior&policy=p1&supplier=SUP-07&tab=drafts&doc=a.md&sec=2&filter=approved&new=1');
  assert.equal(queueHref(ctx, { filter: undefined }), '#view=qualify&role=junior&policy=p1&supplier=SUP-07&tab=drafts&doc=a.md&sec=2&new=1');
  assert.equal(queueHref(ctx, { supplier: undefined }), '#view=qualify&role=junior&policy=p1&filter=senior');
  assert.equal(queueHref(CTX({ tab: 'drafts' }, 'senior'), { supplier: 'SUP-02' }), '#view=qualify&role=senior&supplier=SUP-02');
});

test('selection: exactly one pressed card with the only tab stop; else the first card is the tab stop', () => {
  const cards = cardsIn(renderQualify(REAL, CTX({ supplier: 'SUP-05', tab: 'drafts' })));
  assert.deepEqual(cards.filter((c) => c.pressed === 'true').map((c) => c.id), ['SUP-05']);
  assert.ok(cards.every((c) => c.pressed === 'true' || c.pressed === 'false'));
  assert.deepEqual(cards.filter((c) => c.tabindex === '0').map((c) => c.id), ['SUP-05']);
  assert.ok(cards.every((c) => c.tabindex === '0' || c.tabindex === '-1'));
  assert.equal(parseHash(unescape(cards[0].href)).params.tab, undefined, 'card href drops tab');
  const none = cardsIn(renderQualify(REAL, CTX()));
  assert.ok(none.every((c) => c.pressed === 'false'));
  assert.deepEqual(none.filter((c) => c.tabindex === '0').map((c) => c.id), ['SUP-03']);
});

test('decision 15: a selected supplier hidden by the filter stays selected, with a note and Show all', () => {
  const q = queueModel(REAL, { filter: 'junior', supplier: 'SUP-03' });
  assert.equal(q.hidden, true);
  assert.equal(q.selected.id, 'SUP-03');
  const html = renderQualify(REAL, CTX({ supplier: 'SUP-03', filter: 'junior' }));
  const cards = cardsIn(html);
  assert.deepEqual(cards.map((c) => c.id), ['SUP-01']);
  assert.ok(cards.every((c) => c.pressed === 'false'));
  assert.deepEqual(cards.filter((c) => c.tabindex === '0').map((c) => c.id), ['SUP-01']);
  const note = html.match(/<p class="quiet">SUP-03 is hidden by this filter\. <button type="button" class="subtle-button" data-filter="" data-href="([^"]*)">Show all<\/button><\/p>/);
  assert.ok(note, 'hidden note');
  assert.deepEqual(parseHash(unescape(note[1])).params, { supplier: 'SUP-03' });
  assert.match(html, /data-open="true"/);
  assert.match(html, /<h3 id="detail-title" tabindex="-1">Name SUP-03 <span class="mono">SUP-03<\/span><\/h3>/);
  // Unscored selected under a decision filter is hidden too.
  assert.equal(queueModel(REAL, { filter: 'approved', supplier: 'SUP-04' }).hidden, true);
  assert.equal(queueModel(REAL, { supplier: 'SUP-04' }).hidden, false);
  assert.doesNotMatch(renderQualify(REAL, CTX({ supplier: 'SUP-01', filter: 'junior' })), /hidden by this filter/);
});

test('UIQ-FR-12 detail states: none, not found, found, not extracted, engine error', () => {
  const none = renderQualify(REAL, CTX());
  assert.match(none, /<p class="quiet">Select a supplier<\/p>/);
  assert.doesNotMatch(none, /detail-title|back-link/);
  assert.match(none, /data-open="false"/);

  const nf = renderQualify(REAL, { role: 'senior', params: { supplier: 'SUP-99' }, notFound: { key: 'supplier', value: 'SUP-99', label: 'Not found' } });
  assert.match(nf, /<p class="status-line" role="alert">Not found: supplier SUP-99<\/p>/);
  assert.equal(cardsIn(nf).length, 6);
  assert.match(nf, /data-open="false"/);
  assert.doesNotMatch(nf, /Select a supplier/);

  // Scored: the #40 header replaces the #39 stub (full detail checks live in detail.test.js).
  const found = renderQualify(REAL, CTX({ supplier: 'SUP-01', filter: 'junior' }));
  assert.match(found, /<h3 id="detail-title" tabindex="-1">Name SUP-01 <span class="mono">SUP-01<\/span><\/h3>/);
  assert.match(found, /role="tablist" aria-label="Supplier detail"/);
  assert.doesNotMatch(found, /Detail arrives/);
  assert.match(found, /<a class="text-link back-link" data-back href="#view=qualify&amp;role=senior&amp;filter=junior">← Queue<\/a>/);
  assert.match(found, /data-open="true"/);

  // Unscored keep the #39 stub exactly: ID, name, status line; no header, banner, metrics or tabs (decision 20).
  const back = '<a class="text-link back-link" data-back href="#view=qualify&amp;role=senior">← Queue</a>';
  assert.equal(renderDetail(queueModel(REAL, { supplier: 'SUP-04' }), CTX({ supplier: 'SUP-04' })),
    `<section class="detail" aria-labelledby="detail-title">${back}<p class="eyebrow mono">SUP-04</p><h3 id="detail-title" tabindex="-1">Name SUP-04</h3>`
    + '<p class="status-line">Not extracted: data/extracted/SUP-04.json: HTTP 404</p></section>');
  assert.equal(renderDetail(queueModel(REAL, { supplier: 'SUP-06' }), CTX({ supplier: 'SUP-06' })),
    `<section class="detail" aria-labelledby="detail-title">${back}<p class="eyebrow mono">SUP-06</p><h3 id="detail-title" tabindex="-1">Name SUP-06</h3>`
    + '<p class="status-line">Engine error: data/extracted/SUP-06.json: commodity: unknown commodity &quot;bogus&quot;</p></section>');
});

test('UIQ-FR-02 card content: badge, then ID name, then commodity, total to 1 decimal, routing chip', () => {
  const cards = cardsIn(renderQualify(modelOf([row('SUP-07', 'CONDITIONAL', 'senior', 82.6), row('SUP-08', 'APPROVED', 'junior', 90),
    row('SUP-09', 'NOT APPROVED', 'senior', 41.25), unscored('SUP-10'), unscored('SUP-11', 'engine-error')]), CTX()));
  const by = Object.fromEntries(cards.map((c) => [c.id, c]));
  assert.equal(by['SUP-07'].inner, '<span class="card-top"><span class="badge amber">~ CONDITIONAL</span></span>'
    + '<span class="card-name"><span class="mono">SUP-07</span> Name SUP-07</span>'
    + '<span class="card-meta quiet">Cold plate · <span class="mono">82.6</span> · Senior SQE</span>');
  assert.match(by['SUP-07'].attrs, /data-routing="senior"/);
  assert.match(by['SUP-08'].inner, /<span class="badge ok">✓ APPROVED<\/span>[\s\S]*<span class="mono">90\.0<\/span> · Junior SQE/);
  assert.match(by['SUP-08'].attrs, /data-routing="junior"/);
  assert.match(by['SUP-09'].inner, /<span class="badge bad">✗ NOT APPROVED<\/span>[\s\S]*<span class="mono">41\.3<\/span> · Senior SQE/);
  for (const id of ['SUP-10', 'SUP-11']) {
    assert.match(by[id].inner, /<span class="mono" aria-hidden="true">—<\/span><span class="sr-only">No score<\/span><\/span>$/, id);
    assert.doesNotMatch(by[id].inner, /SQE/, id);
    assert.doesNotMatch(by[id].attrs, /data-routing/, id);
  }
  assert.match(by['SUP-10'].inner, /<span class="badge muted">\? NOT EXTRACTED<\/span>/);
  assert.match(by['SUP-11'].inner, /<span class="badge muted">✗ ENGINE ERROR<\/span>/);
});

test('UIQ-FR-16 queue half: Entered by hand tag on manual rows; no pending note (issue 77, decision 171)', () => {
  const manualRow = row('NEW-01', 'CONDITIONAL', 'senior', 70, { source: 'manual' });
  const withTag = renderQualify(modelOf([row('SUP-01', 'APPROVED', 'junior'), manualRow], [{ supplier_id: 'NEW-01' }]), CTX());
  const tagged = cardsIn(withTag).filter((c) => c.inner.includes('<span class="badge muted">Entered by hand</span>')).map((c) => c.id);
  assert.deepEqual(tagged, ['NEW-01']);
  assert.doesNotMatch(withTag, /hand-entered/);
  assert.deepEqual(queueModel(modelOf([manualRow])).counts, { all: 1, junior: 0, senior: 1, 'not-approved': 0, conditional: 1, approved: 0 });

  // A saved record the engine refuses is an ENGINE ERROR card tagged Entered by hand, not a pending note.
  const bad = renderQualify(realModel({ manual: [{ schema: 'sqc-manual/1', supplier_id: 'NEW-01' }] }), CTX());
  assert.doesNotMatch(bad, /hand-entered/);
  assert.match(cardsIn(bad).find((c) => c.id === 'NEW-01').inner, /ENGINE ERROR<\/span> <span class="badge muted">Entered by hand<\/span>/);
  assert.doesNotMatch(renderQualify(REAL, CTX()), /hand-entered|Entered by hand/);
  assert.doesNotMatch(renderQualify({ ...REAL, manual: undefined }, CTX()), /hand-entered/);
});

test('UIQ-FR-12 empty states: zero candidates, zero filter matches, loading, failed suppliers', () => {
  const zero = qualify.render(modelOf([]), CTX());
  assert.match(zero, /QUEUE \(0\)/);
  assert.match(zero, /<p class="quiet">No candidates loaded\.<\/p>/);
  assert.ok(pillsIn(zero).every((p) => p.count === 0));
  assert.doesNotMatch(zero, /role="alert"|data-queue-card|No suppliers match/);

  const noMatch = qualify.render(modelOf([row('SUP-01', 'NOT APPROVED', 'senior')]), CTX({ filter: 'approved' }));
  const m = noMatch.match(/<p class="quiet">No suppliers match this filter\. <button type="button" class="subtle-button" data-filter="" data-href="([^"]*)">Show all<\/button><\/p>/);
  assert.ok(m);
  assert.equal(parseHash(unescape(m[1])).params.filter, undefined);
  assert.doesNotMatch(noMatch, /data-queue-card/);

  // All unscored: scored pills are 0, All lists them.
  const allUn = qualify.render(modelOf([unscored('SUP-01'), unscored('SUP-02', 'engine-error')]), CTX());
  assert.deepEqual(pillsIn(allUn).map((p) => p.count), [2, 0, 0, 0, 0, 0]);
  assert.equal(cardsIn(allUn).length, 2);

  assert.equal(qualify.render(null, CTX()), '<p class="eyebrow">02 / QUALIFY</p><h2>Qualify</h2><p class="quiet">Loading data…</p>');
  const failed = qualify.render({ suppliers: { ok: false, error: { path: 'data/suppliers.json', message: 'HTTP 404', kind: 'fetch' } }, candidates: [] }, CTX());
  assert.match(failed, /role="alert"[\s\S]*data\/suppliers\.json[\s\S]*HTTP 404/);
  assert.doesNotMatch(failed, /QUEUE|class="pills"|class="qualify"/);
});

test('escaping: markup in names and IDs never reaches the HTML raw, including data-id and data-href', () => {
  const evil = '<img src=x onerror=alert(1)>';
  const m = modelOf([row(evil, 'CONDITIONAL', 'senior', 50, { name: evil, commodity: '<b>x</b>' }), row('SUP-02', 'APPROVED', 'junior', 90, { name: `"q'&` })]);
  for (const supplier of [undefined, evil, 'SUP-02']) {
    const html = qualify.render(m, CTX(supplier ? { supplier } : {}));
    assert.doesNotMatch(html, /<img|<b>/, String(supplier));
  }
  const html = qualify.render(m, CTX({ supplier: evil, filter: 'junior' }));
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt; is hidden by this filter/);
  const all = qualify.render(m, CTX());
  assert.match(all, /data-id="&lt;img src=x onerror=alert\(1\)&gt;"/);
  assert.match(all, /data-href="#view=qualify&amp;role=senior&amp;supplier=%3Cimg%20src%3Dx%20onerror%3Dalert\(1\)%3E"/);
  assert.match(all, /<span class="mono">SUP-02<\/span> &quot;q&#39;&amp;<\/span>/);
});

test('static: queue.js is pure and qualify.js never scores (the engine is the only scorer)', () => {
  const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
  const queue = src('./queue.js');
  const criteria = src('./criteria.js');
  for (const [name, s] of [['queue.js', queue], ['criteria.js', criteria]]) {
    assert.doesNotMatch(s, /\b(document|window|localStorage|fetch)\b/, name);
    assert.doesNotMatch(s, /\bimport\s*\(/, `${name}: no dynamic import`);
  }
  for (const [name, s] of [['queue.js', queue], ['criteria.js', criteria], ['views/qualify.js', src('./views/qualify.js')]]) {
    assert.doesNotMatch(s, /\bevaluate\b|\bscorecard\b/, name);
  }
  assert.doesNotMatch(src('./views/qualify.js'), /from '\.\.?\/engine\.js'/);
  // #41: requirement names moved to criteria.js, so queue.js imports nothing from the engine.
  assert.doesNotMatch(queue, /engine\.js/);
  // criteria.js may import only the requirement-name lookup from the engine, never a scorer.
  assert.deepEqual([...criteria.matchAll(/import \{([^}]*)\} from '\.\/engine\.js'/g)].map((m) => m[1].trim()), ['findCriterion, RUBRIC']);
  // ...and that named import is the only way in: no namespace, default or dynamic engine import (#40 review F2).
  assert.equal((criteria.match(/engine\.js/g) ?? []).length, 1, 'engine.js is referenced exactly once');
  assert.doesNotMatch(criteria, /queue\.js'/, 'criteria.js never imports queue.js (cycle)');
  // No supplier or company names in the code: they come from data only. ("Stark", the fictional buyer, is a
  // fixed UI label since #40: "Stark requirement sheet".)
  assert.doesNotMatch(queue, /Oscorp|Marvel|Frost|Hammer|Roxxon|Inc\.|LLC|Ltd/);
});

// Tester additions (#39 QA).
test('DESIGN-SPEC 6: a total of exactly 0 renders 0.0, only null renders the dash', () => {
  const [zero, none] = cardsIn(renderQualify(modelOf([row('SUP-01', 'NOT APPROVED', 'senior', 0), unscored('SUP-02')]), CTX()));
  assert.match(zero.inner, /<span class="mono">0\.0<\/span> · Senior SQE/);
  assert.doesNotMatch(zero.inner, /No score|—/);
  assert.match(none.inner, /No score/);
});

test('decision 23: a manual candidate filters like any candidate', () => {
  const m = modelOf([row('SUP-01', 'APPROVED', 'junior'), row('NEW-01', 'CONDITIONAL', 'senior', 70, { source: 'manual' })]);
  assert.deepEqual(queueModel(m, { filter: 'senior' }).cards.map((c) => c.id), ['NEW-01']);
  assert.deepEqual(queueModel(m, { filter: 'conditional' }).cards.map((c) => c.id), ['NEW-01']);
  assert.deepEqual(queueModel(m, { filter: 'junior' }).cards.map((c) => c.id), ['SUP-01']);
});

test('escaping: every href and data-href is attribute-escaped (no raw &), and quotes/& in an ID stay inside data-id', () => {
  const odd = 'SUP-"&1';
  const m = modelOf([row('SUP-01', 'NOT APPROVED', 'senior'), row(odd, 'APPROVED', 'junior')]);
  const ctx = (params) => ({ role: 'junior', params: { policy: 'p1', ...params }, notFound: null });
  // Cards, pills and back link; then both Show all buttons (hidden note + empty filter) at once.
  const views = [renderQualify(m, ctx({ supplier: 'SUP-01' })),
    renderQualify(modelOf([row('SUP-01', 'NOT APPROVED', 'senior')]), ctx({ supplier: 'SUP-01', filter: 'approved', tab: 'drafts' }))];
  assert.equal((views[1].match(/>Show all</g) ?? []).length, 2, 'both Show all buttons rendered');
  for (const html of views) {
    const hrefs = [...html.matchAll(/\s(?:data-)?href="([^"]*)"/g)].map((x) => x[1]);
    assert.ok(hrefs.length >= 7, `hrefs found: ${hrefs.length}`);
    for (const h of hrefs) {
      assert.ok(h.includes('&amp;'), `multi-key href: ${h}`);
      assert.doesNotMatch(h, /&(?!amp;|quot;|lt;|gt;|#39;)/, h);
    }
  }
  const card = cardsIn(views[0]).find((c) => c.id !== 'SUP-01');
  assert.equal(card.id, 'SUP-&quot;&amp;1');
  assert.equal(parseHash(unescape(card.href)).params.supplier, undefined, 'router drops the odd ID; it is still encoded, not raw');
  assert.match(card.href, /supplier=SUP-%22%261$/);
});

// ---- Viewing as Junior / Senior (issue 112; OVR-FR-12, UIQ-FR-18, UIQ-AC-03 role part, decisions 83-86) ----
// data/extracted/ does not exist yet (issue 74), so the demo world here is the docs/DATASET.md queue table rebuilt as
// packets (perfect + gap-matrix edits, the routing.test.js recipe) and scored by the real buildModel + engine.
const CITE = 'test.md §1';
const V = (value) => ({ state: 'verified', value, citation: CITE, note: null });
const A = (value) => ({ state: 'assumed', value, citation: null, note: null });
const M = { state: 'missing', value: null, citation: null, note: null };
const edit = (x, o) => ({ ...x, criteria: [...x.criteria.map((c) => (c.id in o ? { id: c.id, ...o[c.id] } : c)),
  ...Object.keys(o).filter((k) => !x.criteria.some((c) => c.id === k)).map((k) => ({ id: k, ...o[k] }))] });
const DEMO = [
  ['SUP-01', 'Frost Technotics', 'cold_plate', { '4.leak_test': M }],
  ['SUP-02', 'Wakanda Design Group', 'quick_disconnect', { '9.second_source': V(false), '4.sample_size': V(false), '7.pcn_notice': V(60) }],
  ['SUP-03', 'Hammer Industries', 'power_module', { '2.ctq_cpk': V(0.94), '3.grr': V(24), '2.spc': A(null), '4.halt': M }],
  ['SUP-04', 'Pym Technologies', 'pcba', {}],
  ['SUP-05', 'Cross Technological Enterprises', 'machined_part', { '1.cert_current': V('2026-10-15'), '4.fai': V(0.9) }],
  ['SUP-06', 'Stane International', 'optics_cable', { '1.internal_audit': A(null), '2.pfmea': A(null), '2.spc': A(null), '4.workmanship_620': A(null), '7.pcn_notice': M }],
  ['SUP-07', 'Oscorp', 'cold_plate', { '2.ctq_cpk': V(1.12), '2.spc': A(null), '6.capacity_ratio': V(0.85), '6.lead_time': V(false), '6.ramp_plan': A(null),
    '8.subtier_named': M, '8.subtier_certs': M, '4.thermal_cycling': M, '4.coolant_compat': V(true) }],
  ['SUP-08', 'Roxxon', 'contract_mfg', { '4.esd_program': V(false), '4.fpy_data': V(3) }],
  ['SUP-09', 'Horizon Labs', 'cold_plate', {}],
];
// Plus one not-extracted and one engine-error candidate: unscored cards must carry no tag (decision 86).
function demoWorld() {
  const cands = [...DEMO.map(([id, name, commodity]) => ({ id, name, commodity, part: commodity })), sup('SUP-10'), sup('SUP-11')];
  const extractions = Object.fromEntries(DEMO.map(([id, , commodity, o]) => [id,
    { ok: true, path: `data/extracted/${id}.json`, value: { ...edit(perfectExtraction(RUBRIC, commodity), o), supplier_id: id } }]));
  extractions['SUP-10'] = fail('data/extracted/SUP-10.json', 'HTTP 404');
  extractions['SUP-11'] = { ok: true, path: 'data/extracted/SUP-11.json', value: { ...PCBA, commodity: 'bogus', supplier_id: 'SUP-11' } };
  return buildModel({
    suppliers: { ok: true, path: 'data/suppliers.json', value: { as_of: '2026-11-01', candidates: cands, active: [sup('ACT-01')] } },
    history: { ok: true, path: 'data/history.csv', value: HISTORY }, extractions, manual: { records: [], error: null },
  }, STARK_REFERENCE);
}
const DEMO_WORLD = demoWorld();
const TAG = /<span class="badge (ok|muted)">(You can sign|Senior signs)<\/span>/g;
const tagsOf = (inner) => [...inner.matchAll(TAG)].map((m) => `${m[1]}:${m[2]}`);
const SIGN_LINE = /<p class="sign-line" data-may-sign="(true|false)">([^<]*)<\/p>/;
const signLine = (html) => { const m = html.match(SIGN_LINE); return m && [m[1], m[2]]; };

test('OVR-FR-12 maySign: senior signs every scored routing; junior signs only junior; null routing is false for both', () => {
  const table = ['senior', 'junior'].map((role) => [role, ...['junior', 'senior', null, undefined].map((r) => maySign(role, r))]);
  assert.deepEqual(table, [['senior', true, true, false, false], ['junior', true, false, false, false]]);
});

test('UIQ-FR-18 + UIQ-AC-03 role part (DATASET.md packets via the real engine, not data/extracted/): as Junior only SUP-04 reads "You can sign", SUP-07 and the other senior-routed cards read "Senior signs", unscored carry no tag', () => {
  const q = queueModel(DEMO_WORLD);
  assert.deepEqual(q.cards.filter((c) => c.routing === 'junior').map((c) => c.id), ['SUP-04'], 'engine routes only SUP-04 to junior');
  const cards = cardsIn(renderQualify(DEMO_WORLD, CTX({}, 'junior')));
  const by = Object.fromEntries(cards.map((c) => [c.id, tagsOf(c.inner)]));
  assert.deepEqual(by, {
    'SUP-01': ['muted:Senior signs'], 'SUP-02': ['muted:Senior signs'], 'SUP-03': ['muted:Senior signs'], 'SUP-04': ['ok:You can sign'],
    'SUP-05': ['muted:Senior signs'], 'SUP-06': ['muted:Senior signs'], 'SUP-07': ['muted:Senior signs'], 'SUP-08': ['muted:Senior signs'],
    'SUP-09': ['muted:Senior signs'], 'SUP-10': [], 'SUP-11': [] });
  // The tag sits inside .card-top, after the decision badge, and follows data-routing exactly.
  for (const c of cards) {
    const top = c.inner.match(/^<span class="card-top">([\s\S]*?)<\/span><span class="card-name">/)[1];
    const r = c.attrs.match(/data-routing="([^"]*)"/)?.[1];
    assert.deepEqual(tagsOf(top), r ? [r === 'junior' ? 'ok:You can sign' : 'muted:Senior signs'] : [], c.id);
    if (r) assert.match(top, /^<span class="badge (ok|amber|bad)">[^<]*<\/span> <span class="badge (ok|muted)">/, c.id);
  }
  assert.match(cards.find((c) => c.id === 'SUP-07').inner,
    /^<span class="card-top"><span class="badge amber">~ CONDITIONAL<\/span> <span class="badge muted">Senior signs<\/span><\/span>/);
});

test('UIQ-FR-18 senior cards: no "You can sign" / "Senior signs" text anywhere in renderQueue', () => {
  const q = queueModel(DEMO_WORLD);
  for (const ctx of [CTX({}, 'senior'), { params: {}, notFound: null }, {}]) {
    const html = renderQueue(q, ctx);
    assert.equal(cardsIn(html).length, 11);
    assert.doesNotMatch(html, /You can sign|Senior signs/, JSON.stringify(ctx));
  }
  // A selected detail on the Senior side carries the header line, never a card tag.
  assert.doesNotMatch(renderQualify(DEMO_WORLD, CTX({ supplier: 'SUP-07' })), /You can sign|Senior signs/);
});

test('UIQ-FR-18 detail header: junior on SUP-04 -> "You may sign this", junior on SUP-07 -> "Needs a senior SQE", senior on SUP-07 -> "You may sign this"', () => {
  const head = (supplier, role) => renderQualify(DEMO_WORLD, role === undefined ? { params: { supplier }, notFound: null } : CTX({ supplier }, role));
  assert.deepEqual(signLine(head('SUP-04', 'junior')), ['true', 'You may sign this']);
  assert.deepEqual(signLine(head('SUP-07', 'junior')), ['false', 'Needs a senior SQE']);
  assert.deepEqual(signLine(head('SUP-07', 'senior')), ['true', 'You may sign this']);
  assert.deepEqual(signLine(head('SUP-07', undefined)), ['true', 'You may sign this'], 'no role behaves as Senior');
  // Placement: inside .detail-id, right after the h3.
  assert.match(head('SUP-07', 'junior'), /<span class="mono">SUP-07<\/span><\/h3><p class="sign-line" data-may-sign="false">Needs a senior SQE<\/p><\/div><div class="detail-policy">/);
  const cand = (id) => DEMO_WORLD.candidates.find((c) => c.id === id);
  assert.deepEqual(['junior', 'senior', undefined].map((role) => detailModel(cand('SUP-07'), { role }).mayHere), [false, true, true]);
  assert.deepEqual(['junior', 'senior', undefined].map((role) => detailModel(cand('SUP-04'), { role }).mayHere), [true, true, true]);
  // Unscored keeps the stub: no sign line in either role.
  for (const role of ['junior', 'senior']) assert.equal(signLine(head('SUP-10', role)), null, role);
});

test('UIQ-FR-18 role never changes data: queueModel takes no role; pill counts, card order and routing are identical, and the whole page with tags, sign line and role key stripped is identical', () => {
  assert.equal(queueModel.length, 1, 'queueModel(model, { filter, supplier }) has no role input');
  for (const filter of [undefined, ...FILTERS.map((f) => f.value).filter(Boolean)]) {
    for (const supplier of [undefined, 'SUP-04', 'SUP-07', 'SUP-10']) {
      const params = { ...(filter ? { filter } : {}), ...(supplier ? { supplier } : {}) };
      const [jr, sr] = ['junior', 'senior'].map((role) => renderQualify(DEMO_WORLD, CTX(params, role)));
      const label = `${filter} ${supplier}`;
      assert.deepEqual(pillsIn(jr).map((p) => [p.label, p.count]), pillsIn(sr).map((p) => [p.label, p.count]), label);
      assert.deepEqual(cardsIn(jr).map((c) => [c.id, c.attrs.match(/data-routing="([^"]*)"/)?.[1]]),
        cardsIn(sr).map((c) => [c.id, c.attrs.match(/data-routing="([^"]*)"/)?.[1]]), label);
      // Whole page: strip the tags, the sign line and the role key in hrefs; nothing else may differ.
      const norm = (h) => h.replace(TAG, '').replace(/ (?=<\/span><span class="card-name">)/g, '').replace(SIGN_LINE, '').replace(/role=(junior|senior)/g, 'role=R');
      assert.equal(norm(jr), norm(sr), label);
    }
  }
});

test('UIQ-FR-18 a custom-policy routing flip is followed: the tag and header read evaluation.routing.to, never the decision', () => {
  // Under a custom policy (PRD-12) the engine may route a CONDITIONAL to junior or an APPROVED Medium to senior.
  const m = modelOf([row('SUP-01', 'CONDITIONAL', 'junior'), row('SUP-02', 'APPROVED', 'senior'),
    row('NEW-01', 'NOT APPROVED', 'junior', 40, { source: 'manual' })]);
  const by = Object.fromEntries(cardsIn(renderQualify(m, CTX({}, 'junior'))).map((c) => [c.id, tagsOf(c.inner)]));
  assert.deepEqual(by, { 'SUP-01': ['ok:You can sign'], 'SUP-02': ['muted:Senior signs'], 'NEW-01': ['ok:You can sign'] });
  assert.deepEqual(signLine(renderQualify(m, CTX({ supplier: 'SUP-01' }, 'junior'))), ['true', 'You may sign this']);
  assert.deepEqual(signLine(renderQualify(m, CTX({ supplier: 'SUP-02' }, 'junior'))), ['false', 'Needs a senior SQE']);
});

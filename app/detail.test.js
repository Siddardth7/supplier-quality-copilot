// Supplier detail header, knockout banner, headline values, sub-tabs, category bars and sheet link
// (#40; UIQ-FR-04, -05, -06, -14, -20; DESIGN-SPEC 4.4, 7); Problems list and All requirements panels
// (#41; UIQ-FR-07, -08, -19). Built on real engine output: expected values are read
// from the evaluation the model holds, never typed in from a copied run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildModel } from './model.js';
import { STARK_REFERENCE, evaluate, findCriterion, parseHistory } from './engine.js';
import { RUBRIC } from './rubric.js';
import { perfectExtraction } from './rubric.testkit.js';
import { esc } from './html.js';
import { formatHash, parseHash } from './route.js';
import { queueModel, detailModel, renderDetail, renderQualify } from './queue.js';

const HISTORY = parseHistory('date,supplier_id,part_no,received_qty,rejected_qty,on_time,defect_found_at,failure_mode_code,scar_id,scar_opened,scar_closed\n'
  + '2026-10-06,ACT-01,CP-1,200,0,1,none,,,,\n');
const readSheet = (k) => JSON.parse(readFileSync(new URL(`../data/requirements/${k}.json`, import.meta.url), 'utf8'));
const SHEET = readSheet('cold_plate');
const SHEETS = Object.fromEntries(['cold_plate', 'pcba'].map((k) => [k, { ok: true, value: readSheet(k), path: `data/requirements/${k}.json` }]));

// Evidence edits on a perfect packet. A failed knockout: Cpk 0.9 (< 1.00 scores 0); past cert expiry.
const set = (x, edits) => ({ ...x, criteria: x.criteria.map((c) => (c.id in edits ? { ...c, ...edits[c.id] } : c)) });
const ASSUMED = { state: 'assumed', value: null, citation: null };
const CP = perfectExtraction(RUBRIC, 'cold_plate');
const PACKETS = {
  perfect: CP,
  assumed: set(CP, { '2.ctq_cpk': ASSUMED }),
  failed: set(CP, { '2.ctq_cpk': { value: 0.9 } }),
  both: set(CP, { '2.ctq_cpk': ASSUMED, '1.cert_current': { value: '2020-01-01' } }),
  many: set(CP, { '1.cert_current': { value: '2020-01-01' }, '2.ctq_cpk': { value: 0.9 }, '1.cert_scope': ASSUMED, '3.grr': ASSUMED }),
  sole: set(CP, { '1.cert_current': { value: '2020-01-01' }, '9.second_source': { value: false } }),
  pcba: perfectExtraction(RUBRIC, 'pcba'),
};

/** One-candidate model through the real buildModel. over: candidate fields (name, part, id). */
function world(packet, { policy = STARK_REFERENCE, sheets = SHEETS, over = {} } = {}) {
  const c = { id: 'SUP-07', name: 'Oscorp', commodity: packet.commodity, part: 'Liquid cooling cold plate', ...over };
  return buildModel({
    suppliers: { ok: true, path: 'data/suppliers.json', value: { as_of: '2026-11-01', candidates: [c], active: [] } },
    history: { ok: true, path: 'data/history.csv', value: HISTORY },
    extractions: { [c.id]: { ok: true, path: `data/extracted/${c.id}.json`, value: { ...packet, supplier_id: c.id } } },
    sheets, manual: { records: [], error: null },
  }, policy);
}
const CTX = (params = {}, role = 'senior') => ({ role, params, notFound: null });
const evOf = (m) => m.candidates[0].evaluation;
const detail = (m, params = {}, role = 'senior') => {
  const ctx = CTX({ supplier: m.candidates[0].id, ...params }, role);
  return renderDetail(queueModel(m, { supplier: ctx.params.supplier, filter: ctx.params.filter }), ctx);
};
const policyWith = (q, meta = {}) => ({ ...STARK_REFERENCE, ...meta, qualification: { ...STARK_REFERENCE.qualification, ...q } });
const unescape = (s) => s.replace(/&amp;/g, '&');
const count = (s, needle) => s.split(needle).length - 1;
const metersIn = (html) => [...html.matchAll(/<meter([^>]*)><\/meter>/g)].map(([, a]) => ({ attrs: a,
  min: a.match(/min="([^"]*)"/)?.[1], max: a.match(/max="([^"]*)"/)?.[1], value: a.match(/value="([^"]*)"/)?.[1], label: a.match(/aria-label="([^"]*)"/)?.[1] }));
const barsIn = (html) => [...html.matchAll(/<li class="bar"><span class="bar-label">([^<]*)<\/span><span class="mono bar-value">([^<]*)<\/span>/g)].map((m) => [m[1], m[2]]);
const tabsIn = (html) => [...html.matchAll(/<button type="button" role="tab"([^>]*)>([^<]*)<\/button>/g)].map(([, a, label]) => ({ label,
  id: a.match(/ id="([^"]*)"/)[1], key: a.match(/data-detail-tab="([^"]*)"/)[1], selected: a.match(/aria-selected="([^"]*)"/)[1],
  controls: a.match(/aria-controls="([^"]*)"/)[1], tabindex: a.match(/tabindex="([^"]*)"/)[1], href: a.match(/data-href="([^"]*)"/)[1] }));
const knockoutRows = (html) => [...html.matchAll(/<li data-knockout="([^"]*)">([\s\S]*?)<\/li>/g)].map(([, id, inner]) => ({ id, inner }));

test('UIQ-FR-04 header: eyebrow, name + ID, Scored with, sheet link, then the four headline values, in order', () => {
  const m = world(PACKETS.assumed);
  const ev = evOf(m);
  const html = detail(m);
  assert.match(html, new RegExp(`<p class="eyebrow">Cold plate · ${ev.risk} risk · <span class="mono">${SHEET.part_no}</span></p>`));
  assert.equal(ev.risk, 'High');
  assert.match(html, /<h3 id="detail-title" tabindex="-1">Oscorp <span class="mono">SUP-07<\/span><\/h3>/);
  assert.match(html, new RegExp(`<p class="quiet">Scored with: ${ev.policy.name}</p>`));
  assert.equal(ev.policy.name, 'Stark Reference v1', 'name already carries v1: not doubled');
  assert.match(html, new RegExp(`<div class="metric"><p>Score</p><strong>${ev.total.toFixed(1).replace('.', '\\.')}</strong></div>`));
  assert.match(html, new RegExp(`<div class="metric"><p>Decision</p><span class="badge amber">~ ${ev.decision}</span></div>`));
  assert.equal(ev.decision, 'CONDITIONAL');
  assert.match(html, new RegExp(`<div class="metric"><p>Signs</p><strong>Senior SQE</strong><small>${ev.routing.reasons.join('; ')}</small></div>`));
  assert.ok(ev.routing.reasons.length >= 2);
  assert.match(html, new RegExp(`<div class="metric"><p>Problems</p><strong>${ev.gaps.length}</strong><small>\\+ ${ev.nice_to_have.length} info</small></div>`));
  const order = ['data-back', 'class="eyebrow"', 'id="detail-title"', 'Scored with:', 'Stark requirement sheet ↗', 'knockout-banner',
    '<p>Score</p>', '<p>Decision</p>', '<p>Signs</p>', '<p>Problems</p>', 'role="tablist"', 'role="tabpanel"'].map((s) => html.indexOf(s));
  assert.ok(order.every((i) => i >= 0), String(order));
  assert.deepEqual(order, [...order].sort((a, b) => a - b), 'fields in DESIGN-SPEC 4.4 order');
  // #112: no role = Senior, so the header line reads "You may sign this"; cards in the detail never carry role tags.
  assert.match(html, /<\/h3><p class="sign-line" data-may-sign="true">You may sign this<\/p><\/div>/);
  assert.doesNotMatch(html, /Senior signs|You can sign/);
});

test('UIQ-FR-04: decisions, routing and risk pass straight through from the engine', () => {
  const cases = [
    [PACKETS.perfect, 'ok', '✓', 'Senior SQE'],
    [PACKETS.failed, 'bad', '✗', 'Senior SQE'],
    [PACKETS.pcba, 'ok', '✓', 'Junior SQE'],
    [PACKETS.sole, 'bad', '✗', 'Senior SQE'],
  ];
  for (const [packet, tone, glyph, label] of cases) {
    const m = world(packet);
    const ev = evOf(m);
    const html = detail(m);
    assert.match(html, new RegExp(`<span class="badge ${tone}">${glyph} ${ev.decision}</span>`), ev.decision);
    assert.ok(html.includes(`<strong>${label}</strong><small>${esc(ev.routing.reasons.join('; '))}</small>`), ev.routing.reasons.join());
    assert.ok(html.includes(` · ${ev.risk} risk · `));
  }
  // Junior single reason; Senior with three reasons.
  assert.deepEqual(evOf(world(PACKETS.pcba)).routing, { to: 'junior', reasons: ['APPROVED, Medium risk, second source confirmed'] });
  assert.equal(evOf(world(PACKETS.sole)).routing.reasons.length, 3);
  assert.ok(detail(world(PACKETS.sole)).includes('<small>NOT APPROVED; High-risk commodity; Sole source</small>'));
  assert.ok(detail(world(PACKETS.pcba)).includes('Pcba · Medium risk · '));
  // Problems 0 + 0 info is shown, not hidden.
  const zero = detailModel({ ...world(PACKETS.perfect).candidates[0], evaluation: { ...evOf(world(PACKETS.perfect)), gaps: [], nice_to_have: [] } });
  assert.equal(zero.problems, 0);
  assert.equal(zero.info, 0);
});

test('UIQ-FR-04: total display rounding only: 100 -> 100.0; "Scored with" reads evaluation.policy, deduped', () => {
  const perfect = world(PACKETS.perfect);
  assert.equal(evOf(perfect).total, 100);
  assert.match(detail(perfect), /<strong>100\.0<\/strong>/);
  const custom = world(PACKETS.perfect, { policy: policyWith({}, { id: 'team', name: 'Team Strict', version: 2 }) });
  assert.equal(evOf(custom).policy.name, 'Team Strict');
  assert.match(detail(custom), /Scored with: Team Strict v2</);
  assert.doesNotMatch(detail(custom), /Stark Reference/);
  const already = world(PACKETS.perfect, { policy: policyWith({}, { id: 'team', name: 'Team Strict v3', version: 3 }) });
  assert.match(detail(already), /Scored with: Team Strict v3</);
  assert.doesNotMatch(detail(already), /v3 v3/);
});

test('UIQ-FR-05 banner: absent with no knockouts; failed wording; assumed wording; names from findCriterion', () => {
  const none = detail(world(PACKETS.perfect));
  assert.doesNotMatch(none, /knockout-banner|role="alert"|KNOCKOUT/);

  const failed = world(PACKETS.failed);
  assert.deepEqual(evOf(failed).knockouts, { failed: ['2.ctq_cpk'], assumed: [] });
  assert.ok(evOf(failed).total >= 85, 'a failed knockout with a high total still shows the banner');
  assert.equal(evOf(failed).decision, 'NOT APPROVED');
  const fh = detail(failed);
  assert.match(fh, /<div class="panel knockout-banner" role="alert"><p class="eyebrow">★ KNOCKOUT<\/p>/);
  assert.deepEqual(knockoutRows(fh).map((r) => r.inner), [`<span class="ko-state bad">★ ✗ Failed</span> ${esc(findCriterion(RUBRIC, '2.ctq_cpk').requirement)}`
    + ' <span class="mono">2.ctq_cpk</span>. <span class="ko-effect">Forces NOT APPROVED.</span>']);
  assert.ok(fh.indexOf('knockout-banner') < fh.indexOf('detail-metrics'), 'banner above the headline values');

  const assumed = world(PACKETS.assumed);
  assert.deepEqual(evOf(assumed).knockouts, { failed: [], assumed: ['2.ctq_cpk'] });
  assert.deepEqual(knockoutRows(detail(assumed)).map((r) => r.inner), [`<span class="ko-state amber">★ ~ Assumed (claimed, not proven)</span> ${esc(findCriterion(RUBRIC, '2.ctq_cpk').requirement)}`
    + ' <span class="mono">2.ctq_cpk</span>. <span class="ko-effect">Blocks APPROVED.</span>']);
});

test('UIQ-FR-05 banner: several knockouts, failed first then assumed in engine order, one role=alert, plural eyebrow', () => {
  for (const packet of [PACKETS.both, PACKETS.many]) {
    const ev = evOf(world(packet));
    const html = detail(world(packet));
    assert.ok(ev.knockouts.failed.length && ev.knockouts.assumed.length);
    assert.deepEqual(knockoutRows(html).map((r) => r.id), [...ev.knockouts.failed, ...ev.knockouts.assumed]);
    assert.deepEqual(knockoutRows(html).map((r) => /★ ✗ Failed/.test(r.inner)), [...ev.knockouts.failed.map(() => true), ...ev.knockouts.assumed.map(() => false)]);
    for (const r of knockoutRows(html)) {
      const def = findCriterion(RUBRIC, r.id);
      assert.ok(r.inner.includes(`${esc(def.requirement ?? def.name)} <span class="mono">${r.id}</span>`), r.id);
    }
    assert.equal(count(html, 'role="alert"'), 1);
    assert.match(html, /★ KNOCKOUTS</);
  }
  // Many: two failed, two assumed (Gage R&R is escaped).
  const many = evOf(world(PACKETS.many)).knockouts;
  assert.equal(many.failed.length, 2);
  assert.equal(many.assumed.length, 2);
  assert.match(detail(world(PACKETS.many)), /Gage R&amp;R/);
  assert.match(detail(world(PACKETS.many)), /part&#39;s CTQs/);
});

test('UIQ-FR-05: a knockout the policy switched off shows no banner (the UI never inspects states)', () => {
  const m = world(PACKETS.failed, { policy: policyWith({ knockouts_off: ['2.ctq_cpk'] }) });
  assert.deepEqual(evOf(m).knockouts, { failed: [], assumed: [] });
  assert.doesNotMatch(detail(m), /knockout-banner|role="alert"/);
});

test('UIQ-FR-06 bars: nine meters in engine order, value = score, max = weight, label and text from the engine', () => {
  const m = world(PACKETS.both);
  const ev = evOf(m);
  const html = detail(m, { tab: 'categories' });
  const meters = metersIn(html);
  assert.equal(meters.length, 9);
  assert.equal(ev.categories.length, 9);
  ev.categories.forEach((c, i) => {
    const w = String(Number(c.weight.toFixed(1)));
    assert.equal(meters[i].min, '0');
    assert.equal(meters[i].max, String(c.weight), c.name);
    assert.equal(meters[i].value, String(c.score), c.name);
    assert.equal(meters[i].label, esc(`${c.n} ${c.name}, ${c.score.toFixed(1)} of ${w}`));
    assert.doesNotMatch(meters[i].attrs, /\b(low|high|optimum)=/);
  });
  assert.deepEqual(barsIn(html), ev.categories.map((c) => [esc(`${c.n} ${c.name}`), `${c.score.toFixed(1)} / ${Number(c.weight.toFixed(1))}`]));
  assert.ok(html.includes(`<p class="quiet">Score against category weight under ${ev.policy.name}</p>`));
  // Reference: category 6 reads "6 Capacity &amp; ramp, <score> of 10"; a partial category shows a fraction.
  const cat6 = ev.categories.find((c) => c.n === 6);
  assert.equal(meters[5].label, `6 Capacity &amp; ramp, ${cat6.score.toFixed(1)} of 10`);
  const cat2 = ev.categories.find((c) => c.n === 2);
  assert.ok(cat2.score < cat2.weight, 'the assumed Cpk lowers category 2');
  // Full marks: value equals max (full bar).
  for (const mt of metersIn(detail(world(PACKETS.perfect), { tab: 'categories' }))) assert.equal(mt.value, mt.max);
});

test('UIQ-FR-06 bars: non-integer weight shows 12.5; weight 0 renders no meter and "weight 0"', () => {
  const weights = { 1: 15, 2: 15, 3: 10, 4: 15, 5: 10, 6: 12.5, 7: 8, 8: 14.5, 9: 0 };
  const m = world(PACKETS.perfect, { policy: policyWith({ weights }, { id: 'w', name: 'Weighted', version: 1 }) });
  const ev = evOf(m);
  const html = detail(m, { tab: 'categories' });
  const meters = metersIn(html);
  assert.equal(meters.length, 8);
  assert.equal(meters[5].max, '12.5');
  assert.match(meters[5].label, / of 12\.5$/);
  const bars = barsIn(html);
  assert.equal(bars.length, 9);
  assert.equal(bars[5][1], `${ev.categories[5].score.toFixed(1)} / 12.5`);
  assert.deepEqual(bars[8], ['9 Supply risk', '0.0 / 0']);
  assert.match(html, /<span class="mono bar-value">0\.0 \/ 0<\/span><span class="quiet bar-zero">weight 0<\/span><\/li>/);
  assert.match(html, /Score against category weight under Weighted v1/);
});

test('UIQ-FR-14 tabs: tablist of four, Problems default, one selected, roving tabindex, ids resolve, panels', () => {
  const m = world(PACKETS.assumed);
  const params = { policy: 'p1', filter: 'senior' };
  const keys = ['problems', 'categories', 'requirements', 'drafts'];
  for (const tab of [undefined, ...keys]) {
    const html = detail(m, tab ? { ...params, tab } : params, 'junior');
    const active = tab ?? 'problems';
    assert.match(html, /<div class="tabs detail-tabs" role="tablist" aria-label="Supplier detail">/);
    const tabs = tabsIn(html);
    assert.deepEqual(tabs.map((t) => t.label), ['Problems', 'Categories', 'All requirements', 'Drafts']);
    assert.deepEqual(tabs.map((t) => t.key), keys);
    assert.deepEqual(tabs.filter((t) => t.selected === 'true').map((t) => t.key), [active], String(tab));
    assert.deepEqual(tabs.map((t) => t.tabindex), keys.map((k) => (k === active ? '0' : '-1')));
    for (const t of tabs) {
      assert.equal(t.id, `dtab-${t.key}`);
      assert.equal(t.controls, 'dpanel');
      const parsed = parseHash(unescape(t.href));
      assert.equal(parsed.view, 'qualify');
      assert.equal(parsed.role, 'junior');
      assert.deepEqual(parsed.params, { policy: 'p1', supplier: 'SUP-07', filter: 'senior', ...(t.key === 'problems' ? {} : { tab: t.key }) }, t.key);
    }
    assert.doesNotMatch(tabs[0].href, /tab=/, 'Problems omits the tab key');
    assert.match(html, new RegExp(`<div id="dpanel" class="detail-panel" role="tabpanel" aria-labelledby="dtab-${active}" tabindex="0">`));
    assert.equal(count(html, 'id="dpanel"'), 1);
    assert.equal(metersIn(html).length, active === 'categories' ? 9 : 0, active);
    // The banner and the headline values stay above every tab.
    assert.ok(html.indexOf('knockout-banner') < html.indexOf('role="tablist"'));
    assert.ok(html.indexOf('detail-metrics') < html.indexOf('role="tablist"'));
  }
  // #41 replaced the Problems and All requirements placeholders; #43 replaced the Drafts one.
  for (const [params, gaps, details] of [[{}, true, 0], [{ tab: 'problems' }, true, 0], [{ tab: 'requirements' }, false, 9], [{ tab: 'categories' }, false, 0], [{ tab: 'drafts' }, false, 0]]) {
    const html = detail(m, params);
    assert.doesNotMatch(html, /arrives? in #4[13]/, JSON.stringify(params));
    assert.equal(html.includes('<div class="drafts">'), params.tab === 'drafts', JSON.stringify(params));
    assert.equal(html.includes('class="gap-group"'), gaps, JSON.stringify(params));
    assert.equal(count(html, '<details class="req-cat"'), details, JSON.stringify(params));
  }
  // A pill keeps tab; a card drops it (decision 21).
  const q = renderQualify(m, CTX({ supplier: 'SUP-07', tab: 'categories' }));
  assert.match(q, /data-filter="junior" data-href="[^"]*tab=categories/);
  assert.doesNotMatch(q.match(/data-queue-card[^>]*>/)[0], /tab=/);
});

test('UIQ-FR-20 sheet link: the commodity sheet part_no, role and policy carried; never the descriptive part', () => {
  for (const [role, params] of [['senior', {}], ['junior', { policy: 'p1' }]]) {
    const html = detail(world(PACKETS.perfect), params, role);
    const href = esc(formatHash({ view: 'standards', role, policy: params.policy, sheet: SHEET.part_no }));
    assert.ok(html.includes(`<a class="text-link" href="${href}">Stark requirement sheet ↗</a>`), role);
    assert.doesNotMatch(html, /Liquid cooling cold plate/, 'candidate.part is descriptive text, never shown as the part number');
  }
  assert.equal(formatHash({ view: 'standards', role: 'senior', sheet: SHEET.part_no }), '#view=standards&role=senior&sheet=SI-CP-0007');
  assert.equal(parseHash(formatHash({ view: 'standards', role: 'senior', sheet: SHEET.part_no })).params.sheet, SHEET.part_no);
  assert.equal(detailModel(world(PACKETS.perfect).candidates[0], { part: SHEET.part_no, role: 'senior' }).part, SHEET.part_no);
});

test('UIQ-FR-20: a missing or failed sheet shows "unavailable" and a dash, nothing else changes', () => {
  const failed = { cold_plate: { ok: false, error: { path: 'data/requirements/cold_plate.json', message: 'HTTP 404', kind: 'fetch' } } };
  const ok = detail(world(PACKETS.failed));
  for (const sheets of [{}, failed]) {
    const html = detail(world(PACKETS.failed, { sheets }));
    assert.doesNotMatch(html, /Stark requirement sheet ↗|view=standards|SI-CP/);
    assert.match(html, /<span class="quiet">Stark requirement sheet unavailable<\/span>/);
    assert.match(html, /Cold plate · High risk · <span class="mono" aria-hidden="true">—<\/span><span class="sr-only">Part number unavailable<\/span><\/p>/);
    // Banner, metrics and tabs are unchanged.
    const tail = (s) => s.slice(s.indexOf('knockout-banner'));
    assert.equal(tail(html), tail(ok));
  }
});

test('escaping: hostile supplier name, policy name and requirement names never reach the HTML raw', () => {
  const evil = '<script>alert(1)</script>"x';
  const m = world(PACKETS.many, { over: { name: evil }, policy: policyWith({}, { id: 'x', name: 'R&D <b>Strict</b>', version: 1 }) });
  for (const tab of [undefined, 'categories']) {
    const html = detail(m, tab ? { tab } : {});
    assert.doesNotMatch(html, /<script|<b>/);
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;&quot;x <span class="mono">SUP-07</span></h3>'));
    assert.ok(html.includes('Scored with: R&amp;D &lt;b&gt;Strict&lt;/b&gt; v1'));
  }
  assert.ok(detail(m, { tab: 'categories' }).includes('under R&amp;D &lt;b&gt;Strict&lt;/b&gt; v1'));
});

test('UIQ-FR-12: not extracted, engine error, not found and nothing selected keep the #39 detail', () => {
  const base = world(PACKETS.perfect);
  const notExtracted = { ...base, candidates: [{ ...base.candidates[0], status: 'not-extracted', evaluation: null,
    error: { path: 'data/extracted/SUP-07.json', message: 'HTTP 404', kind: 'fetch' } }] };
  const engineError = { ...base, candidates: [{ ...base.candidates[0], status: 'engine-error', evaluation: null,
    error: { path: 'data/extracted/SUP-07.json', message: 'boom', kind: 'engine' } }] };
  const back = '<a class="text-link back-link" data-back href="#view=qualify&amp;role=senior">← Queue</a>';
  const stub = (line) => `<section class="detail" aria-labelledby="detail-title">${back}<p class="eyebrow mono">SUP-07</p>`
    + `<h3 id="detail-title" tabindex="-1">Oscorp</h3><p class="status-line">${line}</p></section>`;
  assert.equal(detail(notExtracted, { tab: 'categories' }), stub('Not extracted: data/extracted/SUP-07.json: HTTP 404'));
  assert.equal(detail(engineError), stub('Engine error: data/extracted/SUP-07.json: boom'));
  assert.equal(detailModel(notExtracted.candidates[0]), null);
  assert.equal(detailModel(null), null);
  assert.equal(renderDetail(queueModel(base), CTX()), '<section class="detail" aria-label="Supplier detail"><p class="quiet">Select a supplier</p></section>');
  assert.equal(renderDetail(queueModel(base, { supplier: 'SUP-99' }), { role: 'senior', params: { supplier: 'SUP-99' }, notFound: { key: 'supplier', value: 'SUP-99', label: 'Not found' } }),
    '<section class="detail" aria-label="Supplier detail"><p class="status-line" role="alert">Not found: supplier SUP-99</p></section>');
});

test('no UI math: a hand-built evaluation passes through as toFixed(1) strings and array lengths', () => {
  const ev = {
    risk: 'Low', policy: { id: 'h', version: 4, name: 'Hand' }, total: 12.34, decision: 'NOT APPROVED',
    routing: { to: 'senior', reasons: ['NOT APPROVED', 'Second source unconfirmed'] },
    gaps: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], nice_to_have: [{ id: 'd' }, { id: 'e' }],
    knockouts: { failed: ['zz.unknown'], assumed: [] },
    categories: [{ n: 3, name: 'Measurement', weight: 7, score: 5.55 }, { n: 1, name: 'Quality system', weight: 93, score: 90 }],
  };
  const c = { id: 'SUP-01', name: 'Hand', commodity: 'sheet_metal', part: 'x', status: 'scored', evaluation: ev };
  const d = detailModel(c, { part: 'SI-SM-0001', role: 'junior', params: {} });
  assert.equal(d.total, (12.34).toFixed(1));
  assert.equal(d.total, '12.3', 'not recomputed from the categories (95.55)');
  assert.deepEqual(d.categories.map((x) => [x.n, x.score, x.weight, x.value, x.max]), [[3, (5.55).toFixed(1), '7', 5.55, 7], [1, '90.0', '93', 90, 93]]);
  assert.equal(d.categories[0].label, `3 Measurement, ${(5.55).toFixed(1)} of 7`);
  assert.equal(d.problems, 3);
  assert.equal(d.info, 2);
  assert.equal(d.policy, 'Hand v4');
  assert.equal(d.commodity, 'Sheet metal');
  assert.deepEqual(d.signs, { label: 'Senior SQE', reasons: ev.routing.reasons });
  assert.deepEqual(d.knockouts, [{ id: 'zz.unknown', state: 'failed', name: null }], 'unknown id: no name, no throw');
  assert.equal(d.sheetHref, '#view=standards&role=junior&sheet=SI-SM-0001');
  const html = renderDetail({ selected: c, part: 'SI-SM-0001' }, CTX({ supplier: 'SUP-01', tab: 'categories' }));
  assert.match(html, /<strong>12\.3<\/strong>/);
  assert.match(html, /<strong>3<\/strong><small>\+ 2 info<\/small>/);
  assert.match(html, /<span class="ko-state bad">★ ✗ Failed<\/span> <span class="mono">zz\.unknown<\/span>/);
  assert.match(html, /Sheet metal · Low risk · <span class="mono">SI-SM-0001<\/span>/);
});

// Tester additions (#40 QA).
test('QA UIQ-FR-05: a catalog-test knockout is named from the test catalog (def.name), not left blank', () => {
  const m = world(set(CP, { '4.leak_test': { value: false } }));
  const ev = evOf(m);
  assert.ok(ev.knockouts.failed.includes('4.leak_test'), JSON.stringify(ev.knockouts));
  const row = knockoutRows(detail(m)).find((r) => r.id === '4.leak_test');
  assert.ok(row.inner.includes(`${esc(findCriterion(RUBRIC, '4.leak_test').name)} <span class="mono">4.leak_test</span>`), row.inner);
  assert.match(row.inner, /Leak test/);
});

test('QA UIQ-FR-14: tab from the URL: absent, hand-typed problems, upper case, unknown and foreign all land on a valid tab', () => {
  const m = world(PACKETS.assumed);
  const cases = [['', 'problems'], ['&tab=problems', 'problems'], ['&tab=CATEGORIES', 'categories'], ['&tab=bogus', 'problems'], ['&tab=', 'problems'], ['&tab=__proto__', 'problems']];
  for (const [suffix, want] of cases) {
    const r = parseHash(`#view=qualify&supplier=SUP-07${suffix}`);
    const html = renderDetail(queueModel(m, { supplier: r.params.supplier }), { role: r.role, params: r.params, notFound: null });
    assert.deepEqual(tabsIn(html).filter((t) => t.selected === 'true').map((t) => t.key), [want], suffix);
    assert.match(html, new RegExp(`aria-labelledby="dtab-${want}"`), suffix);
    assert.doesNotMatch(html, /undefined/, suffix);
  }
});

test('QA UIQ-FR-20: each candidate gets its own commodity sheet in a mixed queue', () => {
  const base = world(PACKETS.perfect);
  const pcbaEv = evOf(world(PACKETS.pcba));
  const pcba = { ...base.candidates[0], id: 'SUP-02', name: 'Roxxon', commodity: 'pcba', evaluation: pcbaEv };
  const m = { ...base, candidates: [base.candidates[0], pcba] };
  const want = readSheet('pcba').part_no;
  assert.notEqual(want, SHEET.part_no);
  const html = renderQualify(m, CTX({ supplier: 'SUP-02' }));
  assert.ok(html.includes(`Pcba · Medium risk · <span class="mono">${want}</span>`));
  assert.ok(html.includes(`href="${esc(formatHash({ view: 'standards', role: 'senior', sheet: want }))}"`));
  assert.ok(!html.includes(SHEET.part_no));
});

test('QA escaping: every data-derived string and attribute in the detail is escaped', () => {
  const evil = '"><img src=x onerror=1>&';
  const ev = {
    risk: evil, policy: { id: 'h', version: 1, name: evil }, total: 50, decision: 'CONDITIONAL',
    routing: { to: 'senior', reasons: [evil, 'b'] }, gaps: [], nice_to_have: [],
    knockouts: { failed: [evil], assumed: [`a${evil}`] },
    categories: [{ n: 1, name: evil, weight: 10, score: 5 }],
  };
  const c = { id: `SUP-01${evil}`, name: evil, commodity: 'cold_plate', part: 'x', status: 'scored', evaluation: ev };
  for (const tab of [undefined, 'categories']) {
    const html = renderDetail({ selected: c, part: `SI-${evil}` }, CTX({ supplier: 'SUP-01', tab, filter: 'senior' }));
    assert.doesNotMatch(html, /<img/, tab);
    // Every attribute value is quote-free inside: no attribute break-out anywhere.
    for (const [, v] of html.matchAll(/=\s*"([^"]*)"/g)) assert.doesNotMatch(v, /[<>]/, v);
    assert.ok(html.includes(`<span class="mono">SI-${esc(evil)}</span>`), 'part number');
    assert.ok(html.includes(`<li data-knockout="${esc(evil)}">`), 'knockout id attribute');
    assert.ok(html.includes(`${esc(evil)} risk`), 'risk');
    assert.ok(html.includes(`<small>${esc(evil)}; b</small>`), 'routing reasons');
  }
  const bars = renderDetail({ selected: c, part: null }, CTX({ supplier: 'SUP-01', tab: 'categories' }));
  assert.ok(bars.includes(`<span class="bar-label">${esc(`1 ${evil}`)}</span>`));
  assert.ok(bars.includes(`aria-label="${esc(`1 ${evil}, 5.0 of 10`)}"`));
});

test('QA engine is the only source of numbers: a mutated real evaluation shows up in the UI unchanged', () => {
  const m = world(PACKETS.both);
  const ev = evOf(m);
  const cats = ev.categories.map((x, i) => (i === 5 ? { ...x, score: 1.25, weight: 11.111 } : x));
  const mutated = { ...ev, total: 33.349, routing: { to: 'junior', reasons: ['R1', 'R2', 'R3', 'R4'] },
    gaps: [...ev.gaps, ...ev.gaps], nice_to_have: [{ id: 'x' }, { id: 'y' }, { id: 'z' }], categories: cats,
    knockouts: { failed: [...ev.knockouts.assumed], assumed: [...ev.knockouts.failed] }, decision: 'APPROVED', risk: 'Low' };
  const mm = { ...m, candidates: [{ ...m.candidates[0], evaluation: mutated }] };
  const html = detail(mm, { tab: 'categories' });
  assert.match(html, /<p>Score<\/p><strong>33\.3<\/strong>/);
  assert.match(html, /<span class="badge ok">✓ APPROVED<\/span>/);
  assert.match(html, /<strong>Junior SQE<\/strong><small>R1; R2; R3; R4<\/small>/);
  assert.ok(html.includes(`<strong>${ev.gaps.length * 2}</strong><small>+ 3 info</small>`));
  assert.ok(html.includes(' · Low risk · '));
  assert.deepEqual(knockoutRows(html).map((r) => r.id), [...ev.knockouts.assumed, ...ev.knockouts.failed]);
  const meters = metersIn(html);
  assert.equal(meters[5].max, '11.111');
  assert.equal(meters[5].value, '1.25');
  assert.equal(barsIn(html)[5][1], `${(1.25).toFixed(1)} / 11.1`);
});

// #41: Problems list (UIQ-FR-07) and All requirements table (UIQ-FR-08), Cpk "excellent" (UIQ-FR-19).
const text = (s) => s.replace(/<[^>]*>/g, '');
const rowsIn = (html) => [...html.matchAll(/<tr data-id="([^"]*)">([\s\S]*?)<\/tr>/g)].map(([, id, inner]) => {
  const cells = [...inner.matchAll(/<td data-label="([^"]*)"[^>]*>([\s\S]*?)<\/td>/g)];
  return { id, inner, labels: cells.map((c) => c[1]), cells: cells.map((c) => c[2]), byLabel: Object.fromEntries(cells.map((c) => [c[1], c[2]])) };
});
const groupsIn = (html) => [...html.matchAll(/<section class="gap-group" data-kind="([^"]*)"><h4>([^<]*)<\/h4>([\s\S]*?)<\/section>/g)]
  .map(([, kind, title, body]) => ({ kind, title, body, rows: rowsIn(body) }));
const detailsIn = (html) => [...html.matchAll(/<details class="req-cat" data-cat="([^"]*)"( open)?><summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g)]
  .map(([, n, open, summary, body]) => ({ n: Number(n), open: !!open, summary, body, rows: rowsIn(body) }));
const panelOf = (html) => html.slice(html.indexOf('<div id="dpanel"'));
const WORD = { fail: '✗ Fail', assumed: '~ Assumed', missing: '? Missing', verified: '✓ Verified', info: 'i Info' };
const MISSING = { state: 'missing', value: null, citation: null, note: 'Searched quality_manual.md §4; no SPC chart' };
// Many + a missing row: every gap type plus info.
const ALL_KINDS = set(PACKETS.many, { '2.spc': MISSING });
// Nice-to-have tests verified: the engine lists no info items.
const niceIds = evaluate(CP, { as_of: '2026-11-01' }).nice_to_have.map((n) => n.id);
const NO_INFO = { ...CP, criteria: [...CP.criteria, ...niceIds.map((id) => ({ id, state: 'verified', value: true, citation: 'test.md §1', note: null }))] };

test('UIQ-FR-07 Problems: groups fail, assumed, missing, info with glyph + word chips; counts equal the header', () => {
  const m = world(ALL_KINDS);
  const ev = evOf(m);
  const html = detail(m);
  const groups = groupsIn(panelOf(html));
  assert.deepEqual(groups.map((g) => g.kind), ['fail', 'assumed', 'missing', 'info']);
  for (const g of groups) {
    const want = g.kind === 'info' ? ev.nice_to_have.map((n) => n.id) : ev.gaps.filter((x) => x.type === g.kind).map((x) => x.id);
    assert.deepEqual(g.rows.map((r) => r.id), want, `${g.kind}: engine order`);
    assert.equal(g.title, `${WORD[g.kind].slice(2)} (${want.length})`);
    assert.match(g.body, new RegExp(`<caption class="sr-only">${g.title.replace(/[()]/g, '\\$&')}</caption>`));
    assert.match(g.body, /<thead><tr><th scope="col">State<\/th><th scope="col">Requirement<\/th><th scope="col" class="cell-num">Value<\/th><th scope="col" class="cell-num">Score<\/th><th scope="col">Citation<\/th><\/tr><\/thead>/);
    for (const r of g.rows) {
      assert.deepEqual(r.labels, ['State', 'Requirement', 'Value', 'Score', 'Citation']);
      assert.equal(text(r.cells[0]), WORD[g.kind], `${r.id}: glyph and word, not colour alone`);
    }
  }
  assert.equal(groups.filter((g) => g.kind !== 'info').reduce((s, g) => s + g.rows.length, 0), ev.gaps.length);
  assert.equal(groups.find((g) => g.kind === 'info').rows.length, ev.nice_to_have.length);
  assert.match(html, new RegExp(`<p>Problems</p><strong>${ev.gaps.length}</strong><small>\\+ ${ev.nice_to_have.length} info</small>`));
  assert.doesNotMatch(html, /No problems: every requirement scored 3/);
  // Requirement cell: knockout star, name, mono ID. Value, Score n / 3, citation link.
  const cpk = groups[0].rows.find((r) => r.id === '2.ctq_cpk');
  assert.equal(cpk.byLabel.Requirement, `<span class="ko-star" aria-hidden="true">★</span><span class="sr-only">Knockout</span>${esc(findCriterion(RUBRIC, '2.ctq_cpk').requirement)} <span class="mono">2.ctq_cpk</span>`);
  assert.equal(cpk.byLabel.Value, '0.90');
  assert.equal(cpk.byLabel.Score, '0 / 3');
  // Info rows: no invented value, score or citation.
  for (const r of groups[3].rows) {
    assert.match(r.byLabel.Requirement, /<span class="quiet"> \(nice to have, not in packet\)<\/span>$/);
    for (const c of ['Value', 'Score', 'Citation']) assert.equal(r.byLabel[c], '<span aria-hidden="true">—</span><span class="sr-only">Not scored</span>', `${r.id} ${c}`);
  }
  // Empty groups are omitted.
  assert.deepEqual(groupsIn(detail(world(PACKETS.failed))).map((g) => g.kind), ['fail', 'info']);
});

test('UIQ-FR-07 Problems empty states: sentence only when no gaps and no info', () => {
  const sentence = '<p class="quiet">No problems: every requirement scored 3.</p>';
  const perfect = world(PACKETS.perfect);
  assert.equal(evOf(perfect).gaps.length, 0);
  assert.ok(evOf(perfect).nice_to_have.length > 0);
  const info = detail(perfect);
  assert.deepEqual(groupsIn(info).map((g) => g.kind), ['info'], 'gaps empty, info present: info group only');
  assert.ok(!info.includes(sentence));
  const none = world(NO_INFO);
  assert.deepEqual([evOf(none).gaps.length, evOf(none).nice_to_have.length], [0, 0]);
  assert.ok(detail(none).includes(sentence));
  assert.deepEqual(groupsIn(detail(none)), []);
  assert.doesNotMatch(detail(none), /<h4>/);
});

test('UIQ-FR-07: an assumed knockout with a failing claim reads Assumed, 0 / 3 and a star, never Fail', () => {
  const m = world(set(CP, { '2.ctq_cpk': { state: 'assumed', value: 0.9 } }));
  const ev = evOf(m);
  assert.deepEqual(ev.gaps, [{ id: '2.ctq_cpk', type: 'assumed', score: 0 }]);
  const groups = groupsIn(detail(m));
  assert.deepEqual(groups.map((g) => g.kind), ['assumed', 'info']);
  const r = groups[0].rows[0];
  assert.equal(text(r.byLabel.State), '~ Assumed');
  assert.equal(r.byLabel.Value, '0.90');
  assert.equal(r.byLabel.Score, '0 / 3');
  assert.match(r.byLabel.Requirement, /^<span class="ko-star" aria-hidden="true">★<\/span><span class="sr-only">Knockout<\/span>/);
  // Same row in All requirements: Assumed, score 0.
  const req = detailsIn(detail(m, { tab: 'requirements' })).find((d) => d.n === 2).rows.find((x) => x.id === '2.ctq_cpk');
  assert.deepEqual([text(req.byLabel.State), req.byLabel.Score], ['~ Assumed', '0']);
});

test('UIQ-FR-07/-08 note and citation: note under the name, escaped; null citation has an accessible "No citation"', () => {
  const m = world(ALL_KINDS);
  for (const html of [groupsIn(detail(m)).flatMap((g) => g.rows), detailsIn(detail(m, { tab: 'requirements' })).flatMap((d) => d.rows)]) {
    const spc = html.find((r) => r.id === '2.spc');
    assert.ok(spc.byLabel.Requirement.endsWith(`<small class="quiet gap-note">${esc(MISSING.note)}</small>`), spc.byLabel.Requirement);
    assert.equal(spc.byLabel.Citation, '<span aria-hidden="true">—</span><span class="sr-only">No citation</span>');
    assert.equal(spc.byLabel.Value, '<span aria-hidden="true">—</span><span class="sr-only">Not found in the packet</span>');
    const scope = html.find((r) => r.id === '1.cert_scope');
    assert.equal(scope.byLabel.Value, '<span aria-hidden="true">—</span><span class="sr-only">Claimed, no value given</span>');
    assert.doesNotMatch(scope.byLabel.Requirement, /gap-note/, 'no note: nothing rendered');
  }
});

test('UIQ-FR-08 All requirements: nine <details>, open only with a gap, every row in engine order, six columns', () => {
  for (const packet of [PACKETS.perfect, PACKETS.many, ALL_KINDS]) {
    const m = world(packet);
    const ev = evOf(m);
    const html = detail(m, { tab: 'requirements' });
    const cats = detailsIn(html);
    assert.equal(cats.length, 9);
    assert.equal(ev.categories.length, 9);
    ev.categories.forEach((c, i) => {
      const d = cats[i];
      assert.equal(d.n, c.n);
      assert.equal(d.open, c.criteria.some((r) => r.gap !== null), `cat ${c.n}`);
      const k = c.criteria.filter((r) => r.gap !== null).length;
      assert.equal(d.summary, `<span>${esc(`${c.n} ${c.name}`)}</span> <span class="mono">${c.score.toFixed(1)} / ${Number(c.weight.toFixed(1))}</span>`
        + ` <span class="quiet">${k ? `${k} problem${k === 1 ? '' : 's'}` : 'no problems'}</span>`);
      assert.ok(d.body.includes(`<caption class="sr-only">${esc(`${c.n} ${c.name}`)}</caption>`), `cat ${c.n} caption (review F4)`);
      assert.match(d.body, /<thead><tr><th scope="col">ID<\/th><th scope="col">Requirement<\/th><th scope="col">State<\/th><th scope="col" class="cell-num">Value<\/th><th scope="col" class="cell-num">Score<\/th><th scope="col">Citation<\/th><\/tr><\/thead>/);
      assert.deepEqual(d.rows.map((r) => r.id), c.criteria.map((r) => r.id), 'passing rows kept, engine order');
      assert.deepEqual(d.rows.map((r) => r.byLabel.Score), c.criteria.map((r) => String(r.score)));
      for (const r of d.rows) assert.deepEqual(r.labels, ['ID', 'Requirement', 'State', 'Value', 'Score', 'Citation']);
    });
    assert.equal(cats.reduce((s, d) => s + d.rows.length, 0), ev.categories.reduce((s, c) => s + c.criteria.length, 0));
    // Nice-to-have: a pointer line, not rows.
    const n = ev.nice_to_have.length;
    assert.ok(html.includes(`${n} nice-to-have test${n === 1 ? ' is' : 's are'} not verified; see Problems (Info).`));
  }
  assert.ok(detailsIn(detail(world(PACKETS.perfect), { tab: 'requirements' })).every((d) => !d.open && d.rows.every((r) => text(r.byLabel.State) === '✓ Verified')));
  assert.deepEqual(detailsIn(detail(world(PACKETS.many), { tab: 'requirements' })).filter((d) => d.open).map((d) => d.n), [1, 2, 3]);
  assert.doesNotMatch(detail(world(NO_INFO), { tab: 'requirements' }), /nice-to-have/);
});

test('UIQ-FR-08: a weight-0 category is still a <details> with 0.0 / 0 and its rows', () => {
  const weights = { 1: 15, 2: 15, 3: 10, 4: 15, 5: 10, 6: 12.5, 7: 8, 8: 14.5, 9: 0 };
  const m = world(PACKETS.perfect, { policy: policyWith({ weights }, { id: 'w', name: 'Weighted', version: 1 }) });
  const cats = detailsIn(detail(m, { tab: 'requirements' }));
  assert.match(cats[8].summary, /<span class="mono">0\.0 \/ 0<\/span>/);
  assert.match(cats[5].summary, /\/ 12\.5</);
  assert.equal(cats[8].rows.length, evOf(m).categories[8].criteria.length);
});

test('state chip consistency: verified rows below 3 read Fail in both tabs; verified 3 reads Verified', () => {
  const m = world(set(CP, { '2.ctq_cpk': { value: 1.0 }, '2.spc': { value: false } }));
  const ev = evOf(m);
  const scores = Object.fromEntries(ev.categories.flatMap((c) => c.criteria).map((r) => [r.id, r.score]));
  assert.deepEqual([scores['2.ctq_cpk'], scores['2.spc']], [1, 0]);
  const problems = groupsIn(detail(m))[0];
  assert.equal(problems.kind, 'fail');
  const req = detailsIn(detail(m, { tab: 'requirements' })).find((d) => d.n === 2).rows;
  for (const id of ['2.ctq_cpk', '2.spc']) {
    assert.equal(text(problems.rows.find((r) => r.id === id).byLabel.State), '✗ Fail', id);
    assert.equal(text(req.find((r) => r.id === id).byLabel.State), '✗ Fail', id);
  }
  assert.equal(req.find((r) => r.id === '2.spc').byLabel.Value, 'No');
  assert.equal(req.find((r) => r.id === '2.ctq_cpk').byLabel.Value, '1.00');
  for (const r of req.filter((x) => scores[x.id] === 3)) assert.equal(text(r.byLabel.State), '✓ Verified', r.id);
});

test('UIQ-FR-19 / UIQ-AC-12: verified Cpk >= 1.67 shows "excellent" beside the value and still scores 3', () => {
  const cases = [[1.67, true, '1.67'], [2.5, true, '2.50'], [1.66, false, '1.66'], [1.669, false, '1.67'], [1.33, false, '1.33']];
  for (const [value, label, shown] of cases) {
    const packet = set(CP, { '2.ctq_cpk': { value } });
    const m = world(packet);
    const before = structuredClone(evOf(m));
    const row = detailsIn(detail(m, { tab: 'requirements' })).find((d) => d.n === 2).rows.find((r) => r.id === '2.ctq_cpk');
    assert.equal(row.byLabel.Value, shown + (label ? ' <span class="badge ok">✓ excellent</span>' : ''), String(value));
    assert.equal(row.byLabel.Score, '3', `${value}: engine score`);
    assert.equal(text(row.byLabel.State), '✓ Verified');
    detail(m);
    assert.deepEqual(evOf(m), before, 'rendering never changes the evaluation');
    assert.deepEqual(evOf(m), evaluate({ ...packet, supplier_id: 'SUP-07' }, { as_of: '2026-11-01' }), 'the UI cannot change scores');
  }
  // An assumed claim of 1.8 gets no label (it cannot score 3).
  const assumed = world(set(CP, { '2.ctq_cpk': { state: 'assumed', value: 1.8 } }));
  const r = groupsIn(detail(assumed)).find((g) => g.kind === 'assumed').rows[0];
  assert.deepEqual([r.byLabel.Value, r.byLabel.Score], ['1.80', '1 / 3']);
  assert.doesNotMatch(detail(assumed, { tab: 'requirements' }), /excellent/);
  // GR&R formatting through the real render.
  const grr = detailsIn(detail(world(set(CP, { '3.grr': { value: 24 } })), { tab: 'requirements' })).find((d) => d.n === 3).rows.find((x) => x.id === '3.grr');
  assert.deepEqual([grr.byLabel.Value, grr.byLabel.Score], ['24.0%', '1']);
});

test('UIQ-FR-09 boundary: a citation link sets doc and sec and keeps view, role, policy, supplier, tab and filter', () => {
  const m = world(set(CP, { '2.ctq_cpk': { value: 0.9, citation: 'capability_study_2.md §2.1' } }));
  for (const params of [{ policy: 'p1', filter: 'senior' }, { tab: 'requirements', filter: 'not-approved' }, { doc: 'old.md', sec: '9' }]) {
    const html = detail(m, params, 'junior');
    const link = html.match(/<a class="text-link" data-citation href="([^"]*)">([^<]*)<\/a>/g).find((a) => a.includes('capability_study_2'));
    const [, href, label] = link.match(/href="([^"]*)">([^<]*)</);
    assert.equal(label, 'capability_study_2.md §2.1 ↗');
    assert.doesNotMatch(href, /&(?!amp;)/, 'href is attribute-escaped');
    const parsed = parseHash(unescape(href));
    assert.equal(parsed.view, 'qualify');
    assert.equal(parsed.role, 'junior');
    assert.deepEqual(parsed.params, { ...params, supplier: 'SUP-07', doc: 'capability_study_2.md', sec: '2.1' }, JSON.stringify(params));
  }
  assert.doesNotMatch(detail(m).match(/data-citation href="([^"]*)"/)[1], /tab=/, 'Problems keeps omitting tab');
  // Invalid citation strings: escaped text, never a link.
  for (const bad of ['Capability.md §2', 'see <b>a.md §2</b>', 'a.md 2']) {
    const html = panelOf(detail(world(set(CP, { '2.ctq_cpk': { value: 0.9, citation: bad } }))));
    const row = groupsIn(html)[0].rows.find((r) => r.id === '2.ctq_cpk');
    assert.equal(row.byLabel.Citation, `<span class="quiet">${esc(bad)}</span>`, bad);
    assert.doesNotMatch(row.byLabel.Citation, /<a /);
  }
});

test('escaping: hostile value, note and citation never reach either tab raw', () => {
  const evil = '"><img src=x onerror=1>&';
  // The engine rejects a hostile enum value, so the value is injected into a real evaluation (agent text in date or
  // future string fields would take the same path); note and citation go through evaluate() as agent text.
  const real = world(set(CP, { '9.region_risk': { state: 'assumed', value: 'high', note: evil, citation: evil },
    '2.spc': { state: 'missing', value: null, citation: null, note: `<script>${evil}` } }));
  const ev = evOf(real);
  const categories = ev.categories.map((c) => ({ ...c, criteria: c.criteria.map((r) => (r.id === '9.region_risk' ? { ...r, value: evil } : r)) }));
  const m = { ...real, candidates: [{ ...real.candidates[0], evaluation: { ...ev, categories } }] };
  for (const tab of [undefined, 'requirements']) {
    const html = detail(m, tab ? { tab } : {});
    assert.doesNotMatch(html, /<img|<script/, String(tab));
    for (const [, v] of html.matchAll(/=\s*"([^"]*)"/g)) assert.doesNotMatch(v, /[<>]/, v);
    assert.ok(html.includes(`<small class="quiet gap-note">${esc(evil)}</small>`), 'note');
    assert.ok(html.includes(`<small class="quiet gap-note">${esc(`<script>${evil}`)}</small>`), 'missing-row note');
    assert.ok(html.includes(`<span class="quiet">${esc(evil)}</span>`), 'citation');
    assert.ok(html.includes(`<td data-label="Value" class="cell-num">${esc(evil)}</td>`), 'enum value');
  }
});

test('role and policy name do not change the Problems or All requirements panels (role tags are #112)', () => {
  const m = world(ALL_KINDS);
  for (const tab of [undefined, 'requirements']) {
    const strip = (html) => panelOf(html).replace(/href="[^"]*"/g, '');
    assert.equal(strip(detail(m, tab ? { tab } : {}, 'junior')), strip(detail(m, tab ? { tab } : {}, 'senior')));
  }
});

// Compare view (issue 108; PRD-11 UIC-FR-01..10, UIC-AC-01..05; DESIGN-SPEC 4.6, 4.9; decisions 95-103).
// Built on real engine output (buildModel over edited perfect packets); expected decisions, totals, rfi_items and
// audit_focus are read from the evaluation the model holds, never typed in from a copied run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildModel } from './model.js';
import { STARK_REFERENCE } from './engine.js';
import { RUBRIC } from './rubric.js';
import { perfectExtraction } from './rubric.testkit.js';
import { formatHash, parseHash } from './route.js';
import { queueHref, categoryBars, detailModel, renderQualify } from './queue.js';
import { requirementName } from './criteria.js';
import { SOURCING_LINE, compareModel, renderCompare } from './compare.js';
import * as compare from './views/compare.js';

// ---- packets: edits on a perfect cold-plate packet ----
const CP = perfectExtraction(RUBRIC, 'cold_plate');
const MISSING = { state: 'missing', value: null, citation: null };
const ASSUMED = { state: 'assumed', value: null, citation: null };
const set = (edits, base = CP) => ({ ...base, criteria: base.criteria.map((c) => (c.id in edits ? { ...c, ...edits[c.id] } : c)) });
const missing = (ids) => Object.fromEntries(ids.map((id) => [id, MISSING]));
const NON_KO = ['1.internal_audit', '1.capa', '1.calibration', '2.pfmea', '2.control_plan', '2.spc', '3.inspection_method',
  '5.records_retention', '5.nc_segregation', '6.capacity_ratio', '6.lead_time', '6.ramp_plan', '7.pcn_notice', '7.change_approval',
  '8.subtier_named', '8.flowdown', '8.subtier_certs', '9.second_source', '9.region_risk', '9.financial_health'];
const P = {
  perfect: CP,                                                                            // 100.0 APPROVED
  conditional: set({ '2.ctq_cpk': ASSUMED, '6.ramp_plan': MISSING }),                     // claimed knockout: CONDITIONAL, high score
  failed: set({ '2.ctq_cpk': { value: 0.9 } }),                                           // failed knockout (seed 101 story)
  approvedLow: set(missing(['6.ramp_plan', '6.lead_time', '7.pcn_notice', '7.change_approval'])),  // APPROVED just above 85
  belowPass: set(missing(NON_KO)),                                                        // no knockout, total under 70
  bothFail: set({ ...missing(NON_KO), '2.ctq_cpk': { value: 0.9 } }),                     // knockout and under the pass mark
  twoKo: set({ '2.ctq_cpk': { value: 0.9 }, '1.cert_current': { value: '2020-01-01' } }),
  onlyFail: set({ '2.ctq_cpk': ASSUMED }),
  pcba: perfectExtraction(RUBRIC, 'pcba'),                                                // routes junior
};

const SHEETS = {
  cold_plate: { ok: true, path: 'data/requirements/cold_plate.json', value: { part_no: 'SI-CP-0007', part_name: 'NPI liquid-cooling cold plate' } },
  pcba: { ok: true, path: 'data/requirements/pcba.json', value: { part_no: 'SI-PC-0004', part_name: 'Rack control PCBA' } },
  quick_disconnect: { ok: true, path: 'data/requirements/quick_disconnect.json', value: { part_no: 'SI-QD-0002', part_name: 'Dry-break coolant coupling' } },
};
const NAMES = { 'SUP-01': 'Frost Technotics', 'SUP-07': 'Oscorp', 'SUP-09': 'Horizon Labs', 'SUP-04': 'Pym Technologies', 'SUP-05': 'Wakanda Design Group' };
const fail404 = (id) => ({ ok: false, error: { path: `data/extracted/${id}.json`, message: 'HTTP 404', kind: 'fetch' } });

/** rows: [id, commodity, packet | null (not extracted)]. Real buildModel under the given policy. */
function world(rows, { policy = STARK_REFERENCE, sheets = SHEETS } = {}) {
  return buildModel({
    suppliers: { ok: true, path: 'data/suppliers.json', value: { as_of: '2026-11-01',
      candidates: rows.map(([id, commodity]) => ({ id, name: NAMES[id] ?? `Name ${id}`, commodity, part: 'descriptive text' })), active: [] } },
    history: { ok: true, path: 'data/history.csv', value: [] },
    extractions: Object.fromEntries(rows.map(([id, , packet]) => [id, packet
      ? { ok: true, path: `data/extracted/${id}.json`, value: { ...packet, supplier_id: id } } : fail404(id)])),
    sheets, manual: { records: [], error: null },
  }, policy);
}
const policyWith = (q) => ({ ...STARK_REFERENCE, id: 'custom', name: 'Custom', qualification: { ...STARK_REFERENCE.qualification, ...q } });

// The UIC-AC-01 cold-plate story plus a one-bidder pcba part and an unscored quick-disconnect part.
const STORY_ROWS = [['SUP-01', 'cold_plate', P.failed], ['SUP-04', 'pcba', P.pcba], ['SUP-05', 'quick_disconnect', null],
  ['SUP-07', 'cold_plate', P.conditional], ['SUP-09', 'cold_plate', P.perfect]];
const STORY = world(STORY_ROWS);
const evOf = (m, id) => m.candidates.find((c) => c.id === id).evaluation;

// ---- HTML readers ----
const CTX = (params = {}, role = 'senior') => ({ role, params, notFound: null });
const render = (m, params = {}, role = 'senior') => renderCompare(m, CTX(params, role));
const bidders = (html) => [...html.matchAll(/data-bidder="([^"]+)"/g)].map((x) => x[1]);
const col = (html, id) => { const at = html.indexOf(`<article class="compare-col" data-bidder="${id}"`); return at < 0 ? null : html.slice(at, html.indexOf('</article>', at)); };
const row = (html, id) => { const at = html.indexOf(`<li data-bidder="${id}"`); return at < 0 ? null : html.slice(at, html.indexOf('</li>', html.indexOf('Open in Qualify', at))); };
const grid = (html) => { const at = html.indexOf('<div class="compare-grid">'); return at < 0 ? null : html.slice(at, html.indexOf('</div>', html.lastIndexOf('</article>'))); };
const unamp = (s) => s.replaceAll('&amp;', '&');
const WINNER = /winner|best|recommend|#1\b|1st/i;

test('UIC-FR-01 / UIC-AC-01: parts with counts; default = most bidders then part number; the cold-plate story', () => {
  const m = compareModel(STORY);
  assert.deepEqual(m.parts.map((p) => [p.part, p.count, p.current]), [['SI-CP-0007', 3, true], ['SI-PC-0004', 1, false], ['SI-QD-0002', 1, false]]);
  assert.equal(m.parts[0].name, 'NPI liquid-cooling cold plate');
  assert.equal(m.notFound, null);
  assert.equal(m.unplaced, 0);
  const c = m.current;
  assert.equal(c.part, 'SI-CP-0007');
  assert.deepEqual(c.accepted.map((b) => [b.id, b.decision]), [['SUP-09', 'APPROVED'], ['SUP-07', 'CONDITIONAL']]);
  assert.deepEqual(c.rejected.map((b) => [b.id, b.decision]), [['SUP-01', 'NOT APPROVED']]);
  assert.equal(c.rejected[0].reason, `Knockout failed: ${requirementName('2.ctq_cpk')}`);
  const html = render(STORY);
  assert.deepEqual(bidders(html), ['SUP-09', 'SUP-07', 'SUP-01']);
  assert.match(html, /<nav class="compare-parts" aria-label="Parts">/);
  assert.ok(html.includes('Cold plate · SI-CP-0007 <span>3</span>'));
  assert.ok(html.includes('Pcba · SI-PC-0004 <span>1</span>'));
  assert.equal([...html.matchAll(/aria-current="true"/g)].length, 1);
  assert.match(html, /<a href="[^"]*part=SI-CP-0007" aria-current="true">/);
  assert.ok(html.includes('<p class="eyebrow" id="compare-title">COLD PLATE · SI-CP-0007 · 3 BIDDERS</p>'));
  assert.ok(html.includes('NOT ACCEPTABLE (1)') && html.includes('ACCEPTABLE (2)'));
  assert.ok(row(html, 'SUP-01').includes(`Knockout failed: ${requirementName('2.ctq_cpk').replaceAll("'", '&#39;')}`));
  // Pills keep role and policy and switch the part; the router reads them back.
  const pc = [...html.matchAll(/<a href="([^"]+)"[^>]*>Pcba/g)][0][1];
  assert.deepEqual(parseHash(unamp(pc)), { view: 'compare', role: 'senior', params: { part: 'SI-PC-0004' } });
  const jr = render(STORY, { policy: 'p1' }, 'junior');
  const jpc = unamp([...jr.matchAll(/<a href="([^"]+)"[^>]*>Pcba/g)][0][1]);
  assert.deepEqual(parseHash(jpc), { view: 'compare', role: 'junior', params: { policy: 'p1', part: 'SI-PC-0004' } });
  // A part hash switches the current part; the router upper-cases it.
  assert.equal(compareModel(STORY, { part: parseHash('#view=compare&part=si-pc-0004').params.part }).current.part, 'SI-PC-0004');
});

test('UIC-FR-01: part ties on bidder count order by part number ascending; the count includes unscored bidders', () => {
  const m = compareModel(world([['SUP-05', 'quick_disconnect', null], ['SUP-04', 'pcba', P.pcba]]));
  assert.deepEqual(m.parts.map((p) => [p.part, p.count]), [['SI-PC-0004', 1], ['SI-QD-0002', 1]]);
  assert.equal(m.current.part, 'SI-PC-0004');
  const two = compareModel(world([['SUP-04', 'pcba', P.pcba], ['SUP-05', 'quick_disconnect', null], ['SUP-06', 'quick_disconnect', null]]));
  assert.equal(two.current.part, 'SI-QD-0002', 'two unscored bidders still outnumber one scored one');
});

test('UIC-FR-02: APPROVED before CONDITIONAL even when the CONDITIONAL score is higher; score desc; numeric ID tiebreak', () => {
  const m = world([['SUP-30', 'cold_plate', P.conditional], ['SUP-20', 'cold_plate', P.approvedLow], ['SUP-10', 'cold_plate', P.perfect],
    ['SUP-2', 'cold_plate', P.perfect], ['SUP-40', 'cold_plate', P.onlyFail]]);
  const [cond, low, onlyFail] = [evOf(m, 'SUP-30'), evOf(m, 'SUP-20'), evOf(m, 'SUP-40')];
  assert.equal(cond.decision, 'CONDITIONAL');
  assert.equal(low.decision, 'APPROVED');
  assert.ok(cond.total > low.total, 'precondition: the CONDITIONAL bidder outscores the APPROVED one');
  assert.ok(onlyFail.total > cond.total && onlyFail.decision === 'CONDITIONAL');
  const ids = compareModel(m).current.accepted.map((b) => b.id);
  assert.deepEqual(ids, ['SUP-2', 'SUP-10', 'SUP-20', 'SUP-40', 'SUP-30']);
  assert.deepEqual(bidders(render(m)), ids);
  assert.equal(m.candidates[0].id, 'SUP-30', 'model.candidates is not re-ordered');
});

test('UIC-FR-02 edge: thresholds are the engine decision, read as is (== approve APPROVED, == conditional CONDITIONAL, below reads the pass mark)', () => {
  const T = evOf(world([['SUP-20', 'cold_plate', P.approvedLow]]), 'SUP-20').total;
  const up = Math.round((T + 0.1) * 10) / 10;
  const at = (q) => compareModel(world([['SUP-20', 'cold_plate', P.approvedLow]], { policy: policyWith(q) })).current;
  assert.equal(at({ approve: T }).accepted[0].decision, 'APPROVED');
  assert.equal(at({ approve: up }).accepted[0].decision, 'CONDITIONAL');
  assert.equal(at({ approve: 90, conditional: T }).accepted[0].decision, 'CONDITIONAL');
  const below = at({ approve: 90, conditional: up });
  assert.deepEqual(below.accepted, []);
  assert.equal(below.rejected[0].reason, `Below pass mark ${up}`);
});

test('UIC-FR-03: CONDITIONAL reads "with conditions" and lists exactly rfi_items; APPROVED shows neither', () => {
  const html = render(STORY);
  const cond = col(html, 'SUP-07');
  const rfi = evOf(STORY, 'SUP-07').rfi_items;
  assert.ok(rfi.length > 0);
  assert.match(cond, /· with conditions<\/p>/);
  assert.match(cond, /<p>Open RFI items<\/p>/);
  assert.deepEqual([...cond.matchAll(/<li class="mono">([^<]+)<\/li>/g)].map((x) => x[1]), rfi);
  assert.deepEqual(compareModel(STORY).current.accepted[1].conditions, rfi);
  const ok = col(html, 'SUP-09');
  assert.doesNotMatch(ok, /with conditions|Open RFI items|No open items/);
  assert.deepEqual(compareModel(STORY).current.accepted[0].conditions, []);  // An APPROVED bidder that still has open gaps (non-empty rfi_items) carries no conditions; nor does a rejected one.
  const gappy = world([['SUP-20', 'cold_plate', P.approvedLow], ['SUP-01', 'cold_plate', P.failed]]);
  assert.equal(evOf(gappy, 'SUP-20').decision, 'APPROVED');
  assert.ok(evOf(gappy, 'SUP-20').rfi_items.length > 0, 'precondition: APPROVED with open gaps');
  const g = compareModel(gappy).current;
  assert.deepEqual(g.accepted[0].conditions, []);
  assert.deepEqual(g.rejected[0].conditions, []);
  assert.doesNotMatch(col(render(gappy), 'SUP-20'), /with conditions|Open RFI items|No open items|<li class="mono">/);
});

test('UIC-FR-03 edge: a CONDITIONAL with no rfi_items reads "No open items"', () => {
  const m = world([['SUP-07', 'cold_plate', P.conditional]]);
  const ev = evOf(m, 'SUP-07');
  const hand = { ...m, candidates: [{ ...m.candidates[0], evaluation: { ...ev, rfi_items: [] } }] };
  const c = col(render(hand), 'SUP-07');
  assert.match(c, /with conditions/);
  assert.match(c, /<p class="quiet">No open items<\/p>/);
  assert.doesNotMatch(c, /Open RFI items/);
});

test('UIC-FR-04: knockout reason names every failed knockout; Below pass mark follows the active policy; knockout wins', () => {
  const two = compareModel(world([['SUP-01', 'cold_plate', P.twoKo]])).current.rejected[0];
  const failed = evOf(world([['SUP-01', 'cold_plate', P.twoKo]]), 'SUP-01').knockouts.failed;
  assert.equal(failed.length, 2);
  assert.equal(two.reason, `Knockout failed: ${failed.map(requirementName).join('; ')}`);
  const below = (policy) => compareModel(world([['SUP-01', 'cold_plate', P.belowPass]], { policy })).current.rejected[0].reason;
  assert.equal(below(STARK_REFERENCE), 'Below pass mark 70');
  assert.equal(below(policyWith({ conditional: 75 })), 'Below pass mark 75');
  assert.equal(below(policyWith({ conditional: 72.5 })), 'Below pass mark 72.5');
  const both = world([['SUP-01', 'cold_plate', P.bothFail]]);
  assert.ok(evOf(both, 'SUP-01').total < 70);
  assert.equal(compareModel(both).current.rejected[0].reason, `Knockout failed: ${requirementName('2.ctq_cpk')}`);
  // Unknown knockout id: the id itself.
  const m = world([['SUP-01', 'cold_plate', P.failed]]);
  const ev = evOf(m, 'SUP-01');
  const hand = { ...m, candidates: [{ ...m.candidates[0], evaluation: { ...ev, knockouts: { failed: ['9.bogus', '2.ctq_cpk'], assumed: [] } } }] };
  assert.equal(compareModel(hand).current.rejected[0].reason, `Knockout failed: 9.bogus; ${requirementName('2.ctq_cpk')}`);
  const html = render(STORY);
  assert.ok(html.indexOf('NOT ACCEPTABLE') > html.lastIndexOf('</article>'), 'rejected rows sit below the columns');
});

test('UIC-FR-05: badge, one-decimal score, signs, category bars, two problems, Open in Qualify, Entered by hand', () => {
  const html = render(STORY);
  const ev7 = evOf(STORY, 'SUP-07');
  const c7 = col(html, 'SUP-07');
  assert.match(c7, /<span class="badge amber">~ CONDITIONAL<\/span>/);
  assert.ok(c7.includes(`<strong class="mono">${ev7.total.toFixed(1)}</strong> · Senior signs`));
  assert.equal([...c7.matchAll(/<li class="bar">/g)].length, ev7.categories.length);
  assert.equal([...c7.matchAll(/<meter /g)].length, ev7.categories.filter((c) => c.weight > 0).length);
  const names = ev7.audit_focus.slice(0, 2).map((id) => requirementName(id) ?? id);
  assert.equal(names.length, 2);
  assert.ok(c7.includes(`Problems: ${names.join('; ').replaceAll("'", '&#39;')}</p>`));
  const ctx = CTX();
  assert.ok(c7.includes(`<a class="text-link" href="${queueHref(ctx, { supplier: 'SUP-07' }).replaceAll('&', '&amp;')}">Open in Qualify ↗</a>`));
  assert.deepEqual(parseHash(queueHref(ctx, { supplier: 'SUP-07' })), { view: 'qualify', role: 'senior', params: { supplier: 'SUP-07' } });
  const c9 = col(html, 'SUP-09');
  assert.match(c9, /<span class="badge ok">✓ APPROVED<\/span>/);
  assert.match(c9, /Problems: none<\/p>/);
  assert.doesNotMatch(c9, /Entered by hand/);
  // Three or more audit_focus ids: only the first two show.
  const many = world([['SUP-20', 'cold_plate', P.approvedLow]]);
  assert.ok(evOf(many, 'SUP-20').audit_focus.length >= 3);
  assert.deepEqual(compareModel(many).current.accepted[0].problems, evOf(many, 'SUP-20').audit_focus.slice(0, 2).map(requirementName));
  // Low audit_focus: one problem only; Junior routing reads "Junior signs".
  const one = world([['SUP-07', 'cold_plate', P.onlyFail]]);
  assert.deepEqual(compareModel(one).current.accepted[0].problems, evOf(one, 'SUP-07').audit_focus.slice(0, 2).map(requirementName));
  assert.equal(evOf(STORY, 'SUP-04').routing.to, 'junior');
  assert.match(col(render(STORY, { part: 'SI-PC-0004' }), 'SUP-04'), /· Junior signs<\/p>/);
  // Hand-entered bidder carries the tag.
  const manual = { ...STORY, candidates: STORY.candidates.map((c) => (c.id === 'SUP-09' ? { ...c, source: 'manual' } : c)) };
  assert.match(col(render(manual), 'SUP-09'), /<span class="badge muted">Entered by hand<\/span>/);
});

test('UIC-FR-05 / decision 99: problems follow the engine audit_focus ranking, not table order', () => {
  // The knockout outranks an earlier-listed missing item, so audit_focus and table order disagree here.
  const m = world([['SUP-20', 'cold_plate', set({ '1.internal_audit': MISSING, '2.ctq_cpk': ASSUMED, '6.ramp_plan': MISSING })]]);
  const ev = evOf(m, 'SUP-20');
  assert.deepEqual(ev.audit_focus.slice(0, 2), ['2.ctq_cpk', '1.internal_audit']);
  const row = compareModel(m).current.accepted[0];
  assert.equal(row.id, 'SUP-20');
  assert.deepEqual(row.problems, [requirementName('2.ctq_cpk'), requirementName('1.internal_audit')]);
});

test('UIC-FR-05 / decision 103: scores show one decimal; Open in Qualify keeps the Junior role', () => {
  assert.equal(evOf(STORY, 'SUP-09').total, 100);
  assert.ok(col(render(STORY), 'SUP-09').includes('<strong class="mono">100.0</strong>'));
  const href = queueHref(CTX({}, 'junior'), { supplier: 'SUP-07' });
  assert.ok(col(render(STORY, {}, 'junior'), 'SUP-07').includes(`href="${href.replaceAll('&', '&amp;')}">Open in Qualify ↗</a>`));
  assert.equal(parseHash(href).role, 'junior');
});

test('UIC-FR-06 / UIC-AC-04: acceptable bidders in one grid; app.css stacks it at 759 px', () => {
  const html = render(STORY);
  assert.equal([...html.matchAll(/<div class="compare-grid">/g)].length, 1);
  assert.deepEqual(bidders(grid(html)), ['SUP-09', 'SUP-07']);
  const css = readFileSync(new URL('./app.css', import.meta.url), 'utf8');
  assert.match(css, /\.compare-grid\{display:grid;grid-auto-flow:column;grid-auto-columns:minmax\(260px,1fr\);[^}]*overflow-x:auto/);
  assert.match(css, /@media\(max-width:759px\)\{\s*\.compare-grid\{grid-auto-flow:row;grid-auto-columns:auto;grid-template-columns:minmax\(0,1fr\);overflow:visible/);
});

test('UIC-FR-07 / UIC-AC-02: a one-bidder part reads "Only one bidder for this part" and shows the column; 2 and 3 do not', () => {
  const one = render(STORY, { part: 'SI-PC-0004' });
  assert.ok(one.includes('<p class="quiet">Only one bidder for this part</p>'));
  assert.ok(one.includes('PCBA · SI-PC-0004 · 1 BIDDER</p>'));
  assert.ok(col(one, 'SUP-04'));
  assert.ok(one.indexOf('Only one bidder') < one.indexOf('compare-grid'));
  assert.doesNotMatch(render(STORY), /Only one bidder/);
  const two = render(world([['SUP-07', 'cold_plate', P.conditional], ['SUP-09', 'cold_plate', P.perfect]]));
  assert.match(two, /2 BIDDERS/);
  assert.doesNotMatch(two, /Only one bidder/);
  // A lone unscored bidder gets the message too (the count includes it).
  assert.ok(render(STORY, { part: 'SI-QD-0002' }).includes('Only one bidder for this part'));
});

test('UIC-FR-08 / UIC-AC-05: the Sourcing line shows in every state; no winner words, rank marks or highlight', () => {
  assert.equal(SOURCING_LINE, 'Quality decides who is acceptable. Sourcing picks among them.');
  const states = [render(STORY), render(STORY, { part: 'SI-PC-0004' }), render(STORY, { part: 'SI-QD-0002' }),
    render(STORY, { part: 'SI-XX-9999' }), render(world([])), render(world([['SUP-01', 'sheet_metal', null]])),
    render({ ...STORY, suppliers: { ok: false, error: { path: 'data/suppliers.json', message: 'HTTP 404', kind: 'fetch' } } }),
    compare.render(STORY, CTX())];
  for (const html of states) {
    assert.ok(html.includes(`<p class="compare-line">${SOURCING_LINE}</p>`), html.slice(0, 120));
    assert.doesNotMatch(html.replace(/href="#[^"]*"/g, ''), WINNER);
  }
  const g = grid(render(STORY));
  assert.doesNotMatch(g, /aria-current|aria-selected|aria-pressed/);
  const tags = [...g.matchAll(/<article class="([^"]+)"/g)].map((x) => x[1]);
  assert.deepEqual(tags, ['compare-col', 'compare-col'], 'every column has the same class: the first is not highlighted');
});

test('UIC-FR-09: Stark requirement sheet link opens the part in Standards, keeping role and policy', () => {
  const href = (html) => unamp(html.match(/<a class="text-link" href="([^"]+)">Stark requirement sheet ↗<\/a>/)[1]);
  assert.equal(href(render(STORY)), formatHash({ view: 'standards', role: 'senior', sheet: 'SI-CP-0007' }));
  assert.equal(href(render(STORY)), '#view=standards&role=senior&sheet=SI-CP-0007');
  assert.deepEqual(parseHash(href(render(STORY, { policy: 'p1', part: 'SI-PC-0004' }, 'junior'))),
    { view: 'standards', role: 'junior', params: { policy: 'p1', sheet: 'SI-PC-0004' } });
});

test('UIC-FR-10 / UIC-AC-03 (unit half, decision 95): a raised APPROVED pass mark re-orders; render is pure over (model, ctx)', () => {
  const rows = [['SUP-07', 'cold_plate', P.conditional], ['SUP-20', 'cold_plate', P.approvedLow]];
  const ref = world(rows);
  const low = evOf(ref, 'SUP-20');
  assert.equal(low.decision, 'APPROVED');
  assert.deepEqual(bidders(render(ref)), ['SUP-20', 'SUP-07']);
  const raised = world(rows, { policy: policyWith({ approve: Math.ceil(low.total) + 1 }) });
  assert.equal(evOf(raised, 'SUP-20').decision, 'CONDITIONAL');
  assert.deepEqual(bidders(render(raised)), ['SUP-07', 'SUP-20']);
  assert.match(col(render(raised), 'SUP-20'), /badge amber/);
  assert.equal(render(ref), render(ref));
  assert.equal(render(raised, { part: 'SI-CP-0007' }, 'junior'), render(raised, { part: 'SI-CP-0007' }, 'junior'));
});

test('Unscored (decision 98): NOT SCORED band, counted in the head, never in the grid or ranked; ENGINE ERROR wording', () => {
  const none = world([['SUP-09', 'cold_plate', null], ['SUP-01', 'cold_plate', null], ['SUP-07', 'cold_plate', null]]);
  const html = render(none);
  assert.match(html, /COLD PLATE · SI-CP-0007 · 3 BIDDERS/);
  assert.match(html, /<p class="eyebrow">NOT SCORED \(3\)<\/p>/);
  assert.doesNotMatch(html, /compare-grid|ACCEPTABLE|role="alert"|No acceptable bidder/);
  assert.deepEqual(bidders(html), ['SUP-01', 'SUP-07', 'SUP-09']);
  assert.ok(row(html, 'SUP-07').includes('Not extracted: data/extracted/SUP-07.json: HTTP 404'));
  assert.match(row(html, 'SUP-07'), /\? NOT EXTRACTED[\s\S]*<span class="sr-only">No score<\/span>[\s\S]*Open in Qualify ↗/);
  // Mixed part: scored ranked, unscored in its own band last; an engine error reads "Engine error:".
  const mixed = world([['SUP-01', 'cold_plate', { ...CP, commodity: 'bogus' }], ['SUP-07', 'cold_plate', P.conditional],
    ['SUP-09', 'cold_plate', P.perfect], ['SUP-11', 'cold_plate', P.failed], ['SUP-03', 'cold_plate', null]]);
  const mh = render(mixed);
  assert.deepEqual(bidders(mh), ['SUP-09', 'SUP-07', 'SUP-11', 'SUP-01', 'SUP-03']);
  assert.deepEqual(bidders(grid(mh)), ['SUP-09', 'SUP-07']);
  assert.match(mh, /5 BIDDERS/);
  assert.match(row(mh, 'SUP-01'), /✗ ENGINE ERROR[\s\S]*Engine error: data\/extracted\/SUP-01\.json: /);
  assert.ok(mh.indexOf('NOT SCORED (2)') > mh.indexOf('NOT ACCEPTABLE (1)'));
  // Scored but none acceptable: the quiet line replaces the grid.
  assert.match(render(world([['SUP-01', 'cold_plate', P.failed]])), /<p class="quiet">No acceptable bidder for this part\.<\/p>/);
});

test('Load and route states: suppliers failure, no parts, sheet-less candidates, unknown part', () => {
  const failed = { ...STORY, suppliers: { ok: false, error: { path: 'data/suppliers.json', message: 'HTTP 404', kind: 'fetch' } } };
  const fh = compare.render(failed, CTX());
  assert.ok(fh.startsWith('<p class="eyebrow">03 / COMPARE</p><h2>Compare</h2>'));
  assert.match(fh, /role="alert"[\s\S]*data\/suppliers\.json[\s\S]*HTTP 404/);
  assert.doesNotMatch(fh, /compare-parts|compare-panel/);
  assert.equal(compare.render(null, CTX()), '<p class="eyebrow">03 / COMPARE</p><h2>Compare</h2><p class="quiet">Loading data…</p>');
  assert.match(render(world([])), /<p class="quiet">No parts to compare\.<\/p>/);
  const sheetless = world([['SUP-01', 'sheet_metal', null], ['SUP-02', 'sheet_metal', P.perfect], ['SUP-09', 'cold_plate', P.perfect]]);
  assert.equal(compareModel(sheetless).unplaced, 2);
  assert.match(render(sheetless), /<p class="quiet">2 candidates have no requirement sheet loaded and are not listed\.<\/p>/);
  assert.match(render(world([['SUP-01', 'sheet_metal', null]])), /1 candidate has no requirement sheet loaded and is not listed\.[\s\S]*No parts to compare\./);
  const nf = render(STORY, { part: 'SI-XX-9999' });
  assert.equal(compareModel(STORY, { part: 'SI-XX-9999' }).notFound, 'SI-XX-9999');
  assert.match(nf, /<p class="status-line" role="alert">Not found: part SI-XX-9999<\/p>/);
  assert.match(nf, /aria-current="true">Cold plate · SI-CP-0007/);
  assert.doesNotMatch(render(STORY), /Not found/);
});

test('Escaping: names, ids and reasons are escaped', () => {
  const m = world([['SUP-09', 'cold_plate', P.perfect], ['SUP-01', 'cold_plate', P.failed]]);
  const hostile = { ...m, candidates: m.candidates.map((c) => ({ ...c, name: '<img src=x onerror=alert(1)>' })) };
  const html = render(hostile);
  assert.doesNotMatch(html, /<img/);
  assert.equal([...html.matchAll(/&lt;img src=x onerror=alert\(1\)&gt;/g)].length, 2);
});

test('categoryBars extraction: the Qualify Categories tab is the caption plus the same list Compare shows', () => {
  const c = STORY.candidates.find((x) => x.id === 'SUP-07');
  const d = detailModel(c, { part: 'SI-CP-0007', role: 'senior', params: {} });
  const list = categoryBars(d.categories);
  assert.ok(renderQualify(STORY, CTX({ supplier: 'SUP-07', tab: 'categories' }))
    .includes(`<div id="dpanel" class="detail-panel" role="tabpanel" aria-labelledby="dtab-categories" tabindex="0"><p class="quiet">Score against category weight under ${d.policy}</p>${list}</div>`));
  assert.ok(col(render(STORY), 'SUP-07').includes(list));
});

// ---- tester additions (issue 108 QA) ----
// A real cold-plate evaluation re-labelled by hand: Compare must read decision and total as given, never re-derive.
function handBuilt(specs) {
  const m = world(specs.map(([id]) => [id, 'cold_plate', P.perfect]));
  return { ...m, candidates: m.candidates.map((c, i) => {
    const [, total, decision, failed = []] = specs[i];
    return { ...c, evaluation: { ...c.evaluation, total, decision, knockouts: { failed, assumed: [] } } };
  }) };
}

test('UIC-FR-02 / UIC-FR-04 edge: the documented cuts 85.0 / 84.9 / 70.0 / 69.9 read as the engine labelled them', () => {
  const m = handBuilt([['SUP-4', 69.9, 'NOT APPROVED'], ['SUP-3', 70.0, 'CONDITIONAL'], ['SUP-2', 84.9, 'CONDITIONAL'], ['SUP-1', 85.0, 'APPROVED']]);
  const c = compareModel(m).current;
  assert.deepEqual(c.accepted.map((b) => [b.id, b.decision, b.total]), [['SUP-1', 'APPROVED', '85.0'], ['SUP-2', 'CONDITIONAL', '84.9'], ['SUP-3', 'CONDITIONAL', '70.0']]);
  assert.deepEqual(c.rejected.map((b) => [b.id, b.total, b.reason]), [['SUP-4', '69.9', 'Below pass mark 70']]);
  const html = render(m);
  assert.deepEqual(bidders(grid(html)), ['SUP-1', 'SUP-2', 'SUP-3']);
  assert.match(row(html, 'SUP-4'), /<span class="mono">69\.9<\/span> · Below pass mark 70 /);
  assert.deepEqual([...html.matchAll(/data-decision="([^"]+)"/g)].map((x) => x[1]), ['approved', 'conditional', 'conditional', 'not-approved']);
  // Compare does not re-derive: an engine CONDITIONAL at 99.0 stays CONDITIONAL and sorts after an APPROVED 85.0.
  const keep = handBuilt([['SUP-8', 99.0, 'CONDITIONAL'], ['SUP-9', 85.0, 'APPROVED']]);
  assert.deepEqual(compareModel(keep).current.accepted.map((b) => [b.id, b.decision]), [['SUP-9', 'APPROVED'], ['SUP-8', 'CONDITIONAL']]);
});

test('UIC-FR-02 edge: a claimed knockout is capped at CONDITIONAL even at or above the approve mark', () => {
  const rows = [['SUP-07', 'cold_plate', P.onlyFail], ['SUP-20', 'cold_plate', P.approvedLow]];
  const ref = world(rows);
  const ko = evOf(ref, 'SUP-07');
  assert.deepEqual(ko.knockouts, { failed: [], assumed: ['2.ctq_cpk'] });
  assert.ok(ko.total >= STARK_REFERENCE.qualification.approve && ko.total > evOf(ref, 'SUP-20').total);
  for (const policy of [STARK_REFERENCE, policyWith({ approve: ko.total })]) {  // above the mark, and exactly at it
    const m = world(rows, { policy });
    const c = compareModel(m).current;
    assert.equal(c.accepted.find((b) => b.id === 'SUP-07').decision, 'CONDITIONAL', policy.id);
    assert.deepEqual(c.rejected, []);
    // Under the reference policy SUP-20 is APPROVED and sorts first despite the lower score.
    if (policy === STARK_REFERENCE) assert.deepEqual(c.accepted.map((b) => [b.id, b.decision]), [['SUP-20', 'APPROVED'], ['SUP-07', 'CONDITIONAL']]);
    const col7 = col(render(m), 'SUP-07');
    assert.match(col7, /badge amber">~ CONDITIONAL/);
    assert.match(col7, /· with conditions<\/p>/);
    assert.ok(col7.includes('<li class="mono">2.ctq_cpk</li>'), 'the claimed knockout is an open RFI item');
  }
});

test('Decision 98 deviation: "No acceptable bidder" only when at least one bidder is scored', () => {
  const NO = /No acceptable bidder for this part\./;
  // scored-and-rejected plus unscored: the line shows, then both bands
  const mixed = render(world([['SUP-01', 'cold_plate', P.failed], ['SUP-07', 'cold_plate', null]]));
  assert.match(mixed, NO);
  assert.ok(mixed.indexOf('No acceptable bidder') < mixed.indexOf('NOT ACCEPTABLE (1)') && mixed.indexOf('NOT ACCEPTABLE (1)') < mixed.indexOf('NOT SCORED (1)'));
  assert.doesNotMatch(mixed, /compare-grid|>ACCEPTABLE/);
  // nothing scored (not extracted and engine error): no line, no grid, no rejected band
  const unscored = render(world([['SUP-01', 'cold_plate', { ...CP, commodity: 'bogus' }], ['SUP-07', 'cold_plate', null]]));
  assert.doesNotMatch(unscored, NO);
  assert.doesNotMatch(unscored, /compare-grid|NOT ACCEPTABLE/);
  assert.match(unscored, /NOT SCORED \(2\)/);
  // an acceptable bidder present: no line
  assert.doesNotMatch(render(STORY), NO);
});

test('UIC-FR-08 / UIC-AC-05: no winner marker anywhere: no rank words, numbering, star or first-column difference', () => {
  const MARK = /\brank|winner|best|recommend|top pick|first choice|preferred|#1\b|\b1st\b|★|☆|👑|🏆/i;
  const m = world([['SUP-30', 'cold_plate', P.conditional], ['SUP-20', 'cold_plate', P.approvedLow], ['SUP-10', 'cold_plate', P.perfect],
    ['SUP-11', 'cold_plate', P.failed], ['SUP-12', 'cold_plate', null]]);
  for (const html of [render(m), render(m, {}, 'junior'), render(m, { policy: 'p1' }), render(STORY), render(STORY, { part: 'SI-PC-0004' })]) {
    const text = html.replace(/href="#[^"]*"/g, '');
    assert.doesNotMatch(text, MARK);
    assert.doesNotMatch(html, /<ol\b|<strong>\s*\d+\s*<\/strong>|style=|class="[^"]*\b(first|top|lead|highlight|winner|selected)\b/);
    const g = grid(html);
    // every column opening tag is the same apart from its bidder id and decision
    const shapes = [...g.matchAll(/<article [^>]*>/g)].map((x) => x[0].replace(/data-bidder="[^"]+"/, '').replace(/data-decision="[^"]+"/, ''));
    assert.ok(shapes.length >= 1);
    assert.equal(new Set(shapes).size, 1, shapes.join(' | '));
    assert.doesNotMatch(g, /aria-current|aria-selected|aria-pressed/);
  }
});

test('categoryBars byte identity: the exact list markup the Categories tab has always shipped', () => {
  const cats = [
    { n: 1, name: 'Quality system', score: '18.0', weight: 20, value: 18, max: 20, label: '1 Quality system, 18.0 of 20' },
    { n: 6, name: 'Capacity & ramp', score: '0.0', weight: 0, value: 0, max: 0, label: '6 Capacity & ramp, 0.0 of 0' },
  ];
  assert.equal(categoryBars(cats), '<ul class="bars">'
    + '<li class="bar"><span class="bar-label">1 Quality system</span><span class="mono bar-value">18.0 / 20</span>'
    + '<meter min="0" max="20" value="18" aria-label="1 Quality system, 18.0 of 20"></meter></li>'
    + '<li class="bar"><span class="bar-label">6 Capacity &amp; ramp</span><span class="mono bar-value">0.0 / 0</span>'
    + '<span class="quiet bar-zero">weight 0</span></li></ul>');
  assert.equal(categoryBars([]), '<ul class="bars"></ul>');
});

test('issue 140: Compare sorts sub-point raw scores before numeric IDs', () => {
  const m = world([['SUP-01', 'cold_plate', P.perfect], ['SUP-09', 'cold_plate', P.perfect]]);
  evOf(m, 'SUP-01').total = 90.03;
  evOf(m, 'SUP-09').total = 90.04;
  for (const candidates of [m.candidates, [...m.candidates].reverse()]) {
    const view = compareModel({ ...m, candidates }).current;
    assert.deepEqual(view.accepted.map(b => b.id), ['SUP-09', 'SUP-01']);
    assert.deepEqual(view.accepted.map(b => b.total), ['90.0', '90.0']);
  }
  evOf(m, 'SUP-09').total = 90.03;
  assert.deepEqual(compareModel({ ...m, candidates: [...m.candidates].reverse() }).current.accepted.map(b => b.id),
    ['SUP-01', 'SUP-09']);
});

// Plain-language labels (issue 162; UIQ-FR-02, -07, -08, UIT-FR-02, -03, UIM-FR-04, UIS-FR-05, -06, -11; decisions 230-239).
// Display and copy only: reason lines, Partial chips, escalation words, policy error sentences, the Save hint and
// powers-of-ten limits. Real data/ output plus hand-built evaluations and errors.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadData } from './data.js';
import { buildModel } from './model.js';
import { STARK_REFERENCE, RUBRIC } from './engine.js';
import { perfectExtraction } from './rubric.testkit.js';
import { esc, fmtLimitNumber } from './html.js';
import { CHIP, chipKind, notApprovedReason, problemsModel, renderProblems } from './criteria.js';
import { queueModel, renderQualify, renderQueue } from './queue.js';
import { escalation, renderMonitor } from './monitor.js';
import { renderToday } from './today.js';
import { checkPolicy, plainPolicyError, renderStandards, renderSheet, setField, limitText } from './standards.js';

const REF = STARK_REFERENCE;
const root = new URL('../data/', import.meta.url);
const DATA = await loadData({ fetchText: async (rel) => readFileSync(new URL(rel, root), 'utf8'), storage: null });
const REAL = buildModel(DATA, REF);
const CTX = (params = {}) => ({ role: 'senior', params });
const CP_SHEET = JSON.parse(readFileSync(new URL('../data/requirements/cold_plate.json', import.meta.url), 'utf8'));
const KO_CERT = 'Expiry date of the quality-system certificate';

// ---- C4 notApprovedReason ----

test('issue 162 notApprovedReason: null unless NOT APPROVED; knockout names joined "; "; unknown id raw; else Below pass mark N', () => {
  const ev = (decision, failed = []) => ({ decision, knockouts: { failed } });
  assert.equal(notApprovedReason(ev('APPROVED'), 70), null);
  assert.equal(notApprovedReason(ev('CONDITIONAL', ['1.cert_current']), 70), null, 'CONDITIONAL never gets a reason');
  assert.equal(notApprovedReason(null, 70), null, 'no evaluation: no throw');
  assert.equal(notApprovedReason(undefined, 70), null);
  assert.equal(notApprovedReason(ev('NOT APPROVED', ['1.cert_current']), 70), `Knockout failed: ${KO_CERT}`);
  assert.equal(notApprovedReason(ev('NOT APPROVED', ['1.cert_current', '9.made_up']), 70), `Knockout failed: ${KO_CERT}; 9.made_up`);
  assert.equal(notApprovedReason(ev('NOT APPROVED'), 70), 'Below pass mark 70');
  assert.equal(notApprovedReason(ev('NOT APPROVED'), 62.5), 'Below pass mark 62.5', 'the mark passed in, not a constant');
  assert.equal(notApprovedReason({ decision: 'NOT APPROVED' }, 70), 'Below pass mark 70', 'no knockouts block: no throw');
});

test('issue 162 queue: Below pass mark follows the active policy conditional mark', () => {
  const PCBA = perfectExtraction(RUBRIC, 'pcba');
  const gapped = PCBA.criteria.map((c) => (['6.lead_time', '6.ramp_plan', '9.region_risk', '7.pcn_notice'].includes(c.id)
    ? { ...c, state: 'missing', value: null, citation: null } : c));
  const policy = { ...REF, id: 'strict', qualification: { ...REF.qualification, approve: 100, conditional: 99.5 } };
  const m = buildModel({
    suppliers: { ok: true, path: 'data/suppliers.json', value: { as_of: '2026-11-01', candidates: [{ id: 'SUP-01', name: 'X', commodity: 'pcba', part: 'pcba' }], active: [] } },
    history: { ok: true, path: 'data/history.csv', value: [] },
    extractions: { 'SUP-01': { ok: true, path: 'x', value: { ...PCBA, criteria: gapped, supplier_id: 'SUP-01' } } },
    manual: { records: [], error: null },
  }, policy);
  const card = queueModel(m).cards[0];
  assert.equal(card.decision, 'NOT APPROVED');
  assert.equal(card.reason, 'Below pass mark 99.5');
});

// ---- C4 card lines: only NOT APPROVED, real data ----

const cardsOf = (html) => [...html.matchAll(/<button[^>]*data-id="([^"]+)"[^>]*>([\s\S]*?)<\/button>/g)].map((m) => [m[1], m[2]]);
const metaLines = (h) => [...h.matchAll(/<span class="card-meta quiet">([^<]*(?:<span[^>]*>[^<]*<\/span>[^<]*)*)<\/span>/g)].map((m) => m[1]);

test('issue 162 Qualify cards: a second quiet line with the reason on NOT APPROVED only (real data)', () => {
  const q = queueModel(REAL);
  const html = renderQueue(q, CTX());
  const byId = Object.fromEntries(q.cards.map((c) => [c.id, c]));
  const cards = cardsOf(html);
  assert.ok(cards.length >= 9);
  for (const [id, body] of cards) {
    const lines = metaLines(body);
    if (byId[id].decision === 'NOT APPROVED') {
      assert.equal(lines.length, 2, id);
      assert.match(lines[1], /^(Knockout failed: |Below pass mark )/, id);
    } else {
      assert.equal(lines.length, 1, `${id} (${byId[id].decision}) has no reason line`);
    }
  }
  const sup05 = cards.find(([id]) => id === 'SUP-05')[1];
  assert.ok(sup05.includes(`<span class="card-meta quiet">Knockout failed: ${KO_CERT}</span>`));
  assert.equal(byId['SUP-03'].reason.split('; ').length, 2, 'two failed knockouts joined with "; "');
  assert.equal(byId['SUP-07'].reason, null, 'SUP-07 is CONDITIONAL');
});

test('issue 162 Qualify card: the reason is HTML-escaped; unscored cards carry no reason', () => {
  const q = queueModel(REAL);
  const bad = { ...q, cards: q.cards.map((c) => (c.id === 'SUP-05' ? { ...c, reason: 'Knockout failed: <img src=x>' } : c)) };
  const html = renderQueue(bad, CTX());
  assert.ok(html.includes('Knockout failed: &lt;img src=x&gt;'));
  assert.ok(!html.includes('<img src=x>'));
  const unscored = queueModel({ ...REAL, candidates: REAL.candidates.map((c) => ({ ...c, status: 'not-extracted' })) });
  assert.ok(unscored.cards.every((c) => c.reason === null), 'a non-scored card ignores any stale evaluation');
});

test('issue 162 Today Needs you: same reason line on NOT APPROVED items, none on CONDITIONAL or APPROVED (real data)', () => {
  const html = renderToday(REAL, CTX());
  const items = [...html.matchAll(/<a class="list-card today-item" data-today-link="qualify" data-id="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
  const byId = Object.fromEntries(queueModel(REAL).cards.map((c) => [c.id, c]));
  assert.ok(items.length > 0);
  let notApproved = 0;
  for (const [, id, body] of items) {
    const reason = byId[id].reason;
    if (byId[id].decision === 'NOT APPROVED') {
      notApproved++;
      assert.ok(body.endsWith(`<span class="card-meta quiet">${esc(reason)}</span>`), id);  // SUP-03: "Gage R&R" is escaped
    } else {
      assert.equal((body.match(/class="card-meta quiet"/g) ?? []).length, 1, `${id} has no reason line`);
    }
  }
  assert.ok(notApproved >= 4, 'SUP-01, -03, -05, -08 are in the senior list');
  assert.ok(html.includes(`<span class="card-meta quiet">Knockout failed: ${KO_CERT}</span>`));
});

// ---- C3 chips ----

test('issue 162 chipKind: verified gap score 0 Fail, 1 and 2 Partial, knockout or not; missing score Fail; other rows keep state', () => {
  for (const knockout of [true, false]) {
    assert.equal(chipKind({ gap: 'fail', state: 'verified', score: 0, knockout }), 'fail', `score 0 ko=${knockout}`);
    assert.equal(chipKind({ gap: 'fail', state: 'verified', score: 1, knockout }), 'partial', `score 1 ko=${knockout}`);
    assert.equal(chipKind({ gap: 'fail', state: 'verified', score: 2, knockout }), 'partial', `score 2 ko=${knockout}`);
  }
  assert.equal(chipKind({ gap: 'fail', state: 'verified' }), 'fail', 'undefined score reads Fail');
  assert.equal(chipKind({ gap: 'fail', state: 'verified', score: null }), 'fail');
  assert.equal(chipKind({ gap: 'assumed', state: 'assumed', score: 0, knockout: true }), 'assumed', 'assumed knockout at 0 stays Assumed');
  assert.equal(chipKind({ gap: 'missing', state: 'missing', score: 0 }), 'missing');
  assert.equal(chipKind({ gap: null, state: 'verified', score: 3 }), 'verified');
  assert.deepEqual(CHIP.partial, ['amber', '◐', 'Partial']);
});

test('issue 162 problemsModel / renderProblems: fail-group rows carry their own chip; heading "Fail or partial (n)"', () => {
  const ev = {
    categories: [{ criteria: [
      { id: '2.ctq_cpk', state: 'verified', value: 1.1, score: 1, knockout: true, gap: 'fail' },
      { id: '6.lead_time', state: 'verified', value: 30, score: 0, knockout: false, gap: 'fail' },
      { id: '6.capacity_ratio', state: 'verified', value: 1.1, score: 2, knockout: false, gap: 'fail' },
      { id: '1.capa', state: 'assumed', value: null, score: 1, knockout: false, gap: 'assumed' },
    ] }],
    gaps: [{ id: '2.ctq_cpk', type: 'fail', score: 1 }, { id: '6.lead_time', type: 'fail', score: 0 },
      { id: '6.capacity_ratio', type: 'fail', score: 2 }, { id: '1.capa', type: 'assumed', score: 1 }],
    nice_to_have: [],
  };
  const pm = problemsModel(ev);
  assert.deepEqual(pm.groups.map((g) => g.kind), ['fail', 'assumed']);
  assert.deepEqual(pm.groups[0].rows.map((r) => [r.id, r.kind]), [['2.ctq_cpk', 'partial'], ['6.lead_time', 'fail'], ['6.capacity_ratio', 'partial']]);
  assert.equal(pm.groups[1].rows[0].kind, 'assumed');
  const html = renderProblems(pm, () => '#');
  assert.match(html, /<section class="gap-group" data-kind="fail"><h4>Fail or partial \(3\)<\/h4>/);
  assert.match(html, /<caption class="sr-only">Fail or partial \(3\)<\/caption>/);
  assert.match(html, /<h4>Assumed \(1\)<\/h4>/);
  assert.match(html, /data-id="2\.ctq_cpk"><td data-label="State"><span class="badge amber">◐ Partial<\/span>/);
  assert.match(html, /data-id="6\.lead_time"><td data-label="State"><span class="badge bad">✗ Fail<\/span>/);
});

const rowOf = (html, id) => html.match(new RegExp(`<tr data-id="${id.replace('.', '\\.')}">[\\s\\S]*?</tr>`))[0];

test('issue 162 real SUP-07: Cpk (score 1 knockout) reads ◐ Partial with the star; lead_time (score 0) reads ✗ Fail; both tabs', () => {
  for (const tab of [undefined, 'requirements']) {
    const html = renderQualify(REAL, CTX({ supplier: 'SUP-07', ...(tab ? { tab } : {}) }));
    const cpk = rowOf(html, '2.ctq_cpk');
    assert.match(cpk, /<span class="badge amber">◐ Partial<\/span>/, `${tab ?? 'problems'} Cpk`);
    assert.match(cpk, /<span class="ko-star" aria-hidden="true">★<\/span>/);
    assert.doesNotMatch(cpk, /✗ Fail/);
    const lead = rowOf(html, '6.lead_time');
    assert.match(lead, /<span class="badge bad">✗ Fail<\/span>/, `${tab ?? 'problems'} lead time`);
    assert.doesNotMatch(lead, /Partial/);
  }
});

// ---- C5 escalation ----

const alert = (type, metric, active = true) => ({ type, active, month: '2026-10', ...(metric ? { metric } : {}) });

test('issue 162 escalation: plain words for every alert type; unknown type and metric key fall back raw; never throws', () => {
  const t = (alerts, tier = 'A') => escalation({ current: { tier }, alerts }).text;
  assert.equal(t([alert('run7')]), '7 months above p̄');
  assert.equal(t([alert('ucl')]), 'Point above UCL');
  assert.equal(t([alert('tier_drop')]), 'Tier dropped');
  assert.equal(t([alert('scar_aging')]), 'SCAR open > 60 days');
  assert.equal(t([alert('metric_bad', 'dppm')]), 'DPPM in Bad band');
  assert.equal(t([alert('metric_bad', 'repeat_nc'), alert('metric_bad', 'scar_aging'), alert('metric_bad', 'repeat_nc')]), 'Repeat NC, SCAR aging in Bad band');
  assert.equal(t([alert('metric_bad')]), 'Metric in Bad band');
  assert.equal(t([alert('metric_bad', 'mystery')]), 'mystery in Bad band', 'unknown metric key raw');
  assert.equal(t([alert('brand_new')]), 'brand_new', 'unknown type raw');
  assert.equal(t([alert('toString')]), 'toString', 'prototype key is not a mapped reason');
  assert.equal(t([alert('ucl', null, false), alert('metric_bad', 'otd', false)]), '', 'past alerts ignored');
  assert.equal(t([alert('scar_aging'), alert('metric_bad', 'otd')], 'C'), 'Tier C; SCAR open > 60 days; On-time in Bad band');
  assert.equal(t([], 'D'), 'Tier D');
  assert.deepEqual(escalation({}), { escalate: false, reasons: [], text: '' });
});

// Visible text plus title / aria-label values: data-alert attributes are hooks, not prose.
const prose = (html) => [html.replace(/<[^>]*>/g, ' '), ...[...html.matchAll(/(?:title|aria-label)="([^"]*)"/g)].map((m) => m[1])].join('\n');
const RAW = /\b(metric_bad|run7|ucl|tier_drop|scar_aging)\b/;

test('issue 162 real Monitor and Today: ACT-02/05/06 reasons in plain words, no raw alert codes in prose', () => {
  const table = renderMonitor(REAL, CTX());
  assert.doesNotMatch(prose(table), RAW, 'Monitor table');
  for (const [id, text] of [['ACT-05', 'Tier C; SCAR open &gt; 60 days; Repeat NC, SCAR aging in Bad band'],
    ['ACT-02', '7 months above p̄; Repeat NC in Bad band'], ['ACT-06', 'Tier D; DPPM, Escape, Repeat NC in Bad band']]) {
    const detail = renderMonitor(REAL, CTX({ active: id }));
    assert.ok(detail.includes(text), `${id} detail`);
    assert.ok(table.includes(text), `${id} table`);
    assert.doesNotMatch(prose(detail), RAW, `${id} detail prose`);
  }
  const today = renderToday(REAL, CTX());
  assert.ok(today.includes('<span class="card-meta quiet">Tier C; SCAR open &gt; 60 days; Repeat NC, SCAR aging in Bad band</span>'));
  assert.doesNotMatch(prose(today), RAW, 'Today');
});

// ---- B4 plainPolicyError ----

test('issue 162 plainPolicyError: each mapped path from the real engine message', () => {
  const S = REF.scorecard;
  const pe = (p) => plainPolicyError(checkPolicy(p));
  const q = (over) => ({ ...REF, qualification: { ...REF.qualification, ...over } });
  const s = (over) => ({ ...REF, scorecard: { ...S, ...over } });
  const cases = [
    [setField(REF, 'qualification.approve', 'abc'), 'Approved pass mark must be a number from 0 to 100.'],
    [setField(REF, 'qualification.approve', ''), 'Approved pass mark must be a number from 0 to 100.'],
    [q({ approve: 101 }), 'Approved pass mark must be a number from 0 to 100.'],
    [q({ approve: -1 }), 'Approved pass mark must be a number from 0 to 100.'],
    [q({ conditional: 85 }), 'Conditional pass mark must be a number from 0 up to, but below, the Approved pass mark.'],
    [q({ weights: { ...REF.qualification.weights, 1: 14 } }), 'Category weights must add up to 100.'],
    [q({ weights: { ...REF.qualification.weights, 3: -1 } }), 'Category 3 weight must be a number, 0 or more.'],
    [q({ knockouts_off: ['9.nope'] }), 'Knockout list is not valid.'],
    [s({ weights: { ...S.weights, dppm: S.weights.dppm + 1 } }), 'Metric weights must add up to 100.'],
    [s({ weights: { ...S.weights, otd: 'x' } }), 'On-time delivery weight must be a number, 0 or more.'],
    [s({ limits: { ...S.limits, dppm: { ...S.limits.dppm, good: 'x' } } }), 'DPPM good limit must be a number.'],
    [s({ limits: { ...S.limits, dppm: { good: 500, watch: 499 } } }), 'DPPM bad limit must be at least the good limit.'],
    [s({ limits: { ...S.limits, otd: { good: 95, watch: 96 } } }), 'On-time delivery bad limit must be at most the good limit.'],
    [s({ limits: { ...S.limits, otd: { good: 95, watch: 'x' } } }), 'On-time delivery bad limit must be a number.'],
    [s({ tiers: { A: 90, B: 95, C: 55 } }), 'Tier B lower bound must be below the next tier up.'],
    [s({ tiers: { ...S.tiers, C: 'x' } }), 'Tier C lower bound must be a number.'],
    [{ ...REF, name: '' }, 'Name the policy to save it.'],
    [{ ...REF, id: '' }, 'Name the policy to save it.'],
    [{ ...REF, version: 0 }, 'Name the policy to save it.'],
  ];
  for (const [p, want] of cases) {
    const err = checkPolicy(p);
    assert.ok(err, want);
    assert.equal(pe(p), want, err.message);
    assert.match(err.message, /^policy\./, 'checkPolicy keeps the engine message');
  }
});

test('issue 162 plainPolicyError: fallback for unknown paths and odd input, no throw, typed value never echoed', () => {
  const FB = 'That setting is not valid. Check the value and try again.';
  for (const bad of [null, undefined, {}, 42, 'x', [], { path: null }, { path: 7 }, { path: 'policy.other.thing', message: 'nope' },
    { path: 'policy.qualification', message: 'policy.qualification: expected an object' },
    { path: 'policy.scorecard.limits.dppm', message: 'policy.scorecard.limits.dppm: missing' }]) {
    assert.equal(plainPolicyError(bad), FB, JSON.stringify(bad));
  }
  // The rule text before ", got" decides the sentence: a typed ">= good" or "< " cannot steer it.
  assert.equal(plainPolicyError({ path: 'policy.scorecard.limits.otd.watch', message: 'policy.scorecard.limits.otd.watch: expected a number, got ">= good"' }),
    'On-time delivery bad limit must be a number.');
  assert.equal(plainPolicyError({ path: 'policy.scorecard.tiers.A', message: 'policy.scorecard.tiers.A: expected a number, got "< 5"' }),
    'Tier A lower bound must be a number.');
  assert.ok(!plainPolicyError(checkPolicy(setField(REF, 'qualification.approve', 'abc'))).includes('abc'));
});

test('issue 162 Standards render: approve "abc" shows the plain sentence in the field alert, not the engine text', () => {
  const draft = setField({ ...REF, name: 'T' }, 'qualification.approve', 'abc');
  const error = checkPolicy(draft);
  const html = renderStandards(REAL, { standards: { draft, resolved: { policy: draft, kind: 'draft' }, refModel: REAL, ui: { error } } });
  assert.match(html, /role="alert">Approved pass mark must be a number from 0 to 100\.</);
  assert.ok(!html.includes('expected a number 0-100'));
});

test('issue 162 general editor error: an error with no field shows the plain fallback, never the engine text', () => {
  const draft = { ...REF, id: 'p', name: 'Team' };
  const error = { path: 'policy.unknown_area', message: 'policy.unknown_area: expected something odd, got 42' };
  const html = renderStandards(REAL, { standards: { draft, resolved: { policy: draft, kind: 'draft' }, refModel: REAL, ui: { error } } });
  const line = html.match(/<section class="panel std-editor"[^>]*><p class="std-error" role="alert">([^<]*)<\/p>/);
  assert.ok(line, 'general error line rendered above the editor');
  assert.equal(line[1], 'That setting is not valid. Check the value and try again.');
  assert.ok(!html.includes('expected something odd'));
});

// ---- B3 Save hint ----

test('issue 162 Save hint: visible and linked by aria-describedby only while unnamed (blank, whitespace); absent when named', () => {
  const hint = '<span class="quiet std-save-hint" id="std-save-hint">Name the policy to save it</span>';
  const render = (draft) => renderStandards(REAL, { standards: draft ? { draft, resolved: { policy: draft, kind: 'draft' }, refModel: REAL } : { refModel: REAL } });
  for (const [label, html] of [['reference', render()], ['blank', render({ ...REF, name: '' })], ['spaces', render({ ...REF, name: '   ' })]]) {
    const save = html.match(/<button[^>]*data-act="save"[^>]*>/)[0];
    assert.match(save, /aria-disabled="true"/, label);
    assert.match(save, /aria-describedby="std-save-hint"/, label);
    assert.equal(html.split(hint).length - 1, 1, `${label}: one hint`);
    assert.equal((html.match(/id="std-save-hint"/g) ?? []).length, 1, `${label}: the id exists once`);
  }
  const named = render({ ...REF, id: 'p', name: 'Cold-plate team' });
  assert.doesNotMatch(named.match(/<button[^>]*data-act="save"[^>]*>/)[0], /aria-describedby|aria-disabled/);
  assert.ok(!named.includes('std-save-hint'));
});

// ---- C6 fmtLimitNumber ----

test('issue 162 fmtLimitNumber: plain at 0.001 and 999999, powers of ten past them, 0 and non-numbers unchanged', () => {
  const cases = [
    [0.001, '0.001'], [0.00099, '9.9 × 10⁻⁴'], [-0.001, '-0.001'], [-0.00099, '-9.9 × 10⁻⁴'],
    [999999, '999999'], [1e6, '1 × 10⁶'], [-1e6, '-1 × 10⁶'], [1500000, '1.5 × 10⁶'],
    [1e-6, '1 × 10⁻⁶'], [0.000001, '1 × 10⁻⁶'], [-0.000001, '-1 × 10⁻⁶'], [0.0000025, '2.5 × 10⁻⁶'], [1.23456e-10, '1.23456 × 10⁻¹⁰'],
    [0, '0'], [-0, '0'], [1, '1'], [0.5, '0.5'], [NaN, 'NaN'], [Infinity, 'Infinity'], [-Infinity, '-Infinity'],
  ];
  for (const [n, want] of cases) assert.equal(fmtLimitNumber(n), want, String(n));
  for (const v of ['0.000001', true, false, null, undefined]) assert.equal(fmtLimitNumber(v), v, String(v));
  const arr = [1]; assert.equal(fmtLimitNumber(arr), arr);
});

test('issue 162 sheet viewer: leak limit 1 × 10⁻⁶, list members and CTQ cells use powers of ten; drafts stay verbatim', () => {
  assert.ok(renderSheet(CP_SHEET).includes('<td class="mono">≤ 1 × 10⁻⁶ mbar·L/s</td>'));
  assert.equal(limitText({ operator: '=', value: [0.0000005, 2, 3000000], unit: 'x' }), '= 5 × 10⁻⁷, 2, 3 × 10⁶ x');
  assert.equal(limitText({ operator: 'between', value: [0.0005, 2000000], unit: 'Pa' }), '5 × 10⁻⁴–2 × 10⁶ Pa');
  const v = renderSheet({ part_no: 'P', ctqs: [{ name: 'Gap', nominal: 0.0005, lsl: 0, usl: 2000000, unit: 'mm' }], tests: {} });
  assert.match(v, /<th scope="row">Gap<\/th><td class="mono">5 × 10⁻⁴<\/td><td class="mono">0<\/td><td class="mono">2 × 10⁶<\/td><td>mm<\/td>/);
  // Decision 237: the agent's draft text is shown as written.
  const drafts = renderQualify(REAL, CTX({ supplier: 'SUP-07', tab: 'drafts' }));
  assert.ok(drafts.includes('0.000001'), 'RFI email keeps its stored number');
});

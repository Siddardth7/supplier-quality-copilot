// Today view (issue 107; UIT-FR-01..08, UIM-FR-14; DESIGN-SPEC 4.3).
// Real engine output (buildModel on perfect / gapped pcba packets and hand-made history rows) plus hand-built rows
// for routings the engine would not produce together. Today must agree with queueModel and monitorModel by construction.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildModel } from './model.js';
import { STARK_REFERENCE, parseHistory } from './engine.js';
import { RUBRIC } from './rubric.js';
import { perfectExtraction } from './rubric.testkit.js';
import { formatHash, parseHash } from './route.js';
import { maySign, queueModel, queueHref } from './queue.js';
import { escalation, monitorModel, monitorHref, renderMonitor } from './monitor.js';
import { GRADES, todayModel, renderToday } from './today.js';
import { errorPanel, esc } from './html.js';
import * as today from './views/today.js';

// ---- real engine output ----
const PCBA = perfectExtraction(RUBRIC, 'pcba');
const missing = (ids) => PCBA.criteria.map((c) => (ids.includes(c.id) ? { ...c, state: 'missing', value: null, citation: null } : c));
const CONDITIONAL_ROWS = ['6.lead_time', '6.ramp_plan', '9.region_risk', '9.financial_health', '7.pcn_notice', '7.change_approval', '8.flowdown', '5.records_retention'];
const ext = (id, criteria = PCBA.criteria) => ({ ok: true, path: `data/extracted/${id}.json`, value: { ...PCBA, criteria, supplier_id: id } });
const fail = (path, message, kind = 'fetch') => ({ ok: false, error: { path, message, kind } });
const sup = (id, name = `Name ${id}`) => ({ id, name, commodity: 'pcba', part: 'pcba' });

const HEAD = 'date,supplier_id,part_no,received_qty,rejected_qty,on_time,defect_found_at,failure_mode_code,scar_id,scar_opened,scar_closed';
const CSV = [HEAD,
  '2026-10-06,ACT-01,P1,1000,0,1,none,,,,',        // all Good: 100.0 A, no alert
  '2026-10-06,ACT-02,P1,1000,1,1,incoming,FM-A,,,',  // 85.0 A under Stark; C under the TIERS policy below
  '2026-10-06,ACT-03,P1,1000,600,0,line,FM-B,,,',   // 30.0 D
  '2026-10-06,ACT-04,P1,1000,0,0,none,,,,',         // 80.0 B with an active metric_bad (otd): On-time in Bad band
  '2026-01-06,ACT-06,P1,1000,0,1,none,,,,',         // Unrated
].join('\n');
const ACTIVE = ['ACT-01', 'ACT-02', 'ACT-03', 'ACT-04', 'ACT-06'];
const TIERS = { ...STARK_REFERENCE, id: 'tiers', scorecard: { ...STARK_REFERENCE.scorecard, tiers: { A: 99, B: 90, C: 50 } } };

function data({ extractions, candidates = ['SUP-05', 'SUP-01', 'SUP-03', 'SUP-02', 'SUP-04', 'SUP-06'], suppliers, history, name } = {}) {
  return {
    suppliers: suppliers ?? { ok: true, path: 'data/suppliers.json', value: { as_of: '2026-11-01',
      candidates: candidates.map((id) => sup(id, name?.(id))), active: ACTIVE.map((id) => sup(id, name?.(id))) } },
    history: history ?? { ok: true, path: 'data/history.csv', value: parseHistory(CSV) },
    extractions: extractions ?? {
      'SUP-01': ext('SUP-01'),                                                         // APPROVED, junior
      'SUP-02': ext('SUP-02', missing(CONDITIONAL_ROWS)),                              // CONDITIONAL, senior
      'SUP-03': ext('SUP-03', missing(['1.cert_current', '1.cert_scope', '1.internal_audit'])),  // NOT APPROVED, senior
      'SUP-04': fail('data/extracted/SUP-04.json', 'HTTP 404'),                        // not extracted
      'SUP-05': ext('SUP-05', missing(CONDITIONAL_ROWS)),                              // CONDITIONAL, senior
      'SUP-06': { ok: true, path: 'data/extracted/SUP-06.json', value: { ...PCBA, commodity: 'bogus', supplier_id: 'SUP-06' } },  // engine error
    },
    sheets: { pcba: { ok: true, value: { part_no: 'SI-PB-0001' } } },
    manual: { records: [], error: null },
  };
}
const REAL = buildModel(data(), STARK_REFERENCE);

// ---- hand-built candidates (the Needs you half reads only queueModel fields) ----
const row = (id, decision, to, total, over = {}) => ({ id, name: `Name ${id}`, commodity: 'cold_plate', part: 'cold_plate', source: 'dataset',
  status: 'scored', evaluation: { total, decision, routing: { to, reasons: [] } }, error: null, ...over });
const unscored = (id) => ({ id, name: `Name ${id}`, commodity: 'cold_plate', source: 'dataset', status: 'not-extracted', evaluation: null,
  error: { path: `data/extracted/${id}.json`, message: 'HTTP 404', kind: 'fetch' } });
const handModel = (candidates, sheets = {}) => ({ ...REAL, candidates, sheets });

// ---- HTML readers ----
const panel = (html, id) => { const at = html.indexOf(`id="${id}"`); return html.slice(at, html.indexOf('</section>', at)); };
const ids = (html, kind) => [...html.matchAll(new RegExp(`data-today-link="${kind}" data-id="([^"]+)"`, 'g'))].map((m) => m[1]);
const hrefs = (html, kind) => [...html.matchAll(new RegExp(`data-today-link="${kind}"[^>]*href="([^"]+)"`, 'g'))].map((m) => m[1].replaceAll('&amp;', '&'));
const tilesOf = (html, label) => {
  const at = html.indexOf(`aria-label="${label}"`);
  if (at < 0) return null;
  return [...html.slice(at, html.indexOf('</dl>', at)).matchAll(/<dt>([^<]+)<\/dt><dd class="mono">(\d+)<\/dd>/g)].map((m) => [m[1], Number(m[2])]);
};
const senior = (model, params = {}) => today.render(model, { role: 'senior', params });
const junior = (model, params = {}) => today.render(model, { role: 'junior', params });

test('UIT-FR-01: no hash opens Today with the head, snapshot date and intro line', () => {
  for (const h of ['', '#']) assert.equal(parseHash(h).view, 'today');
  const html = senior(REAL);
  assert.ok(html.startsWith('<p class="eyebrow">01 / TODAY</p><h2>Today</h2>'));
  assert.match(html, /<p class="eyebrow">as of 2026-11-01 · M18<\/p>/);
  assert.match(html, /<p>Every supplier, scored the same way\.<\/p>/);
  for (const id of ['counts-title', 'needs-title', 'esc-title']) assert.ok(html.includes(`id="${id}"`), id);
  const noDate = senior({ ...REAL, as_of: null });
  assert.doesNotMatch(noDate, /as of/);
  assert.match(noDate, /Every supplier, scored the same way\./);
  assert.match(today.render(null), /Loading data…/);
});

test('UIT-FR-02: Senior lists every scored candidate in decision then ID order; Junior only Junior-routed', () => {
  const s = panel(senior(REAL), 'needs-title');
  assert.deepEqual(ids(s, 'qualify'), ['SUP-03', 'SUP-02', 'SUP-05', 'SUP-01']);
  assert.match(s, /NEEDS YOU \(4\)/);
  assert.match(s, /<p class="quiet">2 not scored<\/p>/);
  assert.doesNotMatch(s, /SUP-04|SUP-06/);
  const j = panel(junior(REAL), 'needs-title');
  assert.deepEqual(ids(j, 'qualify'), ['SUP-01']);
  assert.match(j, /data-routing="junior"/);
  for (const role of ['senior', 'junior']) {
    const want = queueModel(REAL).cards.filter((c) => c.status === 'scored' && maySign(role, c.routing)).map((c) => c.id);
    assert.deepEqual(todayModel(REAL, { role }).needs.items.map((c) => c.id), want, role);
  }
});

test('UIT-FR-02: each item shows decision badge, ID, name, sheet part and score; part missing reads as unavailable', () => {
  const s = senior(REAL);
  const ev = REAL.candidates.find((c) => c.id === 'SUP-03').evaluation;
  const item = s.slice(s.indexOf('data-id="SUP-03"'), s.indexOf('</a>', s.indexOf('data-id="SUP-03"')));
  assert.match(item, /<span class="badge bad">✗ NOT APPROVED<\/span>/);
  assert.match(item, /<span class="mono">SUP-03<\/span> Name SUP-03/);
  assert.match(item, new RegExp(`Part <span class="mono">SI-PB-0001</span> · <span class="mono">${ev.total.toFixed(1)}</span>`));
  assert.match(s, /<span class="badge amber">~ CONDITIONAL<\/span>/);
  assert.match(s, /<span class="badge ok">✓ APPROVED<\/span>/);
  const noPart = senior(handModel([row('SUP-09', 'APPROVED', 'junior', 91.25)]));
  assert.match(noPart, /Part <span class="mono"><span aria-hidden="true">—<\/span><span class="sr-only">Part number unavailable<\/span><\/span> · <span class="mono">91\.3<\/span>/);
});

test('UIT-FR-02: the filter is maySign over routing, never decision; hand-entered items carry their badge', () => {
  const m = handModel([row('SUP-01', 'NOT APPROVED', 'junior', 40), row('SUP-02', 'APPROVED', 'senior', 95),
    row('SUP-03', 'CONDITIONAL', 'junior', 70, { source: 'manual' }), unscored('SUP-04')]);
  assert.deepEqual(ids(junior(m), 'qualify'), ['SUP-01', 'SUP-03']);
  assert.deepEqual(ids(senior(m), 'qualify'), ['SUP-01', 'SUP-03', 'SUP-02']);
  const s = senior(m);
  const manual = s.slice(s.indexOf('data-id="SUP-03"'), s.indexOf('</a>', s.indexOf('data-id="SUP-03"')));
  assert.match(manual, /<span class="badge muted">Entered by hand<\/span>/);
  assert.equal([...s.matchAll(/Entered by hand/g)].length, 1);
});

test('UIT-FR-03: Escalate equals Monitor\'s flagged rows in Monitor\'s order, with grade, composite and reasons', () => {
  const rows = monitorModel(REAL).rows;
  const want = rows.filter((r) => r.escalate).map((r) => r.id);
  const html = panel(senior(REAL), 'esc-title');
  assert.deepEqual(ids(html, 'monitor'), want);
  assert.ok(want.includes('ACT-03') && want.includes('ACT-04'), 'tier D and an A/B with an active alert both appear');
  assert.ok(!want.includes('ACT-01'));
  assert.match(html, new RegExp(`ESCALATE THIS WEEK \\(${want.length}\\)`));
  for (const s of REAL.monitor.value.suppliers.filter((x) => escalation(x).escalate)) {
    const r = rows.find((x) => x.id === s.supplier_id);
    const item = html.slice(html.indexOf(`data-id="${r.id}"`), html.indexOf('</a>', html.indexOf(`data-id="${r.id}"`)));
    assert.match(item, /<span class="badge amber">▲ ESCALATE<\/span>/);
    assert.ok(item.includes(`<span class="card-meta quiet">${esc(escalation(s).text)}</span>`), r.id);
    assert.ok(item.includes(r.tier === null ? 'Unrated · ' : `Tier ${r.tier} · <span class="mono">${r.composite.toFixed(1)}</span>`), r.id);
  }
  const unrated = rows.find((r) => r.tier === null);
  assert.ok(unrated && unrated.escalate === (unrated.alerts > 0), 'Unrated alone does not escalate');
});

test('UIT-FR-04: counts in the stated order, equal to the queue counts and a tally of every monitor row; role-free', () => {
  const html = senior(REAL);
  const q = queueModel(REAL).counts;
  assert.deepEqual(tilesOf(html, 'By decision'), [['NOT APPROVED', q['not-approved']], ['CONDITIONAL', q.conditional], ['APPROVED', q.approved]]);
  assert.deepEqual(tilesOf(html, 'By routing'), [['Junior', q.junior], ['Senior', q.senior]]);
  const rows = monitorModel(REAL).rows;
  assert.deepEqual(tilesOf(html, 'By grade'), GRADES.map((g) => [g, rows.filter((r) => (r.tier ?? 'Unrated') === g).length]));
  assert.deepEqual(tilesOf(html, 'By decision'), [['NOT APPROVED', 1], ['CONDITIONAL', 2], ['APPROVED', 1]]);
  const counts = (h) => h.slice(h.indexOf('today-counts'), h.indexOf('today-lists'));
  assert.equal(counts(junior(REAL)), counts(html));
  assert.doesNotMatch(counts(html), /<a |<button/);
});

test('UIT-FR-05: items link to their home view through queueHref / monitorHref, keeping role and policy only', () => {
  const ctx = { role: 'junior', params: { policy: 'abc' } };
  const html = today.render(REAL, ctx);
  const q = hrefs(html, 'qualify');
  assert.deepEqual(q, ['SUP-01'].map((id) => queueHref(ctx, { supplier: id })));
  assert.deepEqual(parseHash(q[0]), { view: 'qualify', role: 'junior', params: { policy: 'abc', supplier: 'SUP-01' } });
  const m = hrefs(html, 'monitor');
  assert.ok(m.length > 0);
  for (const h of m) {
    const p = parseHash(h);
    assert.equal(h, monitorHref(ctx, { active: p.params.active }));
    assert.deepEqual(Object.keys(p.params), ['policy', 'active']);
    assert.equal(p.view, 'monitor');
    assert.equal(p.role, 'junior');
  }
});

test('UIT-FR-06: role and policy changes re-render the lists and counts', () => {
  assert.notDeepEqual(ids(senior(REAL), 'qualify'), ids(junior(REAL), 'qualify'));
  const other = buildModel(data(), TIERS);
  const a = senior(REAL);
  const b = senior(other);
  assert.ok(!ids(panel(a, 'esc-title'), 'monitor').includes('ACT-02'));
  assert.ok(ids(panel(b, 'esc-title'), 'monitor').includes('ACT-02'));
  assert.notDeepEqual(tilesOf(a, 'By grade'), tilesOf(b, 'By grade'));
});

test('UIT-FR-07: empty states keep the counts; zero scored notes the unscored count without an error', () => {
  const none = handModel([row('SUP-02', 'APPROVED', 'senior', 95)]);
  none.monitor = { ...REAL.monitor, value: { ...REAL.monitor.value, suppliers: REAL.monitor.value.suppliers.filter((s) => !escalation(s).escalate) } };
  const html = junior(none);
  assert.match(html, /<p class="quiet">Nothing needs you today\.<\/p>/);
  assert.match(html, /NEEDS YOU \(0\)/);
  assert.match(html, /<p class="quiet">No escalations this month\.<\/p>/);
  assert.match(html, /ESCALATE THIS WEEK \(0\)/);
  assert.ok(tilesOf(html, 'By decision') && tilesOf(html, 'By grade'));
  assert.doesNotMatch(html, /not scored/);
  const zero = buildModel(data({ extractions: {} }), STARK_REFERENCE);
  const z = senior(zero);
  assert.match(z, /Nothing needs you today\.<\/p><p class="quiet">6 not scored<\/p>/);
  assert.deepEqual(tilesOf(z, 'By decision'), [['NOT APPROVED', 0], ['CONDITIONAL', 0], ['APPROVED', 0]]);
  assert.deepEqual(tilesOf(z, 'By routing'), [['Junior', 0], ['Senior', 0]]);
  assert.ok(ids(z, 'monitor').length > 0);
  assert.doesNotMatch(z, /role="alert"/);
});

test('UIT-FR-08: each failed source shows its own error and the other section still renders', () => {
  const histFail = buildModel(data({ history: fail('data/history.csv', 'Network <b>down</b>') }), STARK_REFERENCE);
  const h = senior(histFail);
  assert.equal([...h.matchAll(/role="alert"/g)].length, 1);
  const esc = panel(h, 'esc-title');
  assert.match(esc, /ESCALATE THIS WEEK<\/p>/);
  assert.match(esc, /data\/history\.csv[\s\S]*Network &lt;b&gt;down&lt;\/b&gt;/);
  assert.deepEqual(ids(h, 'qualify'), ['SUP-03', 'SUP-02', 'SUP-05', 'SUP-01']);
  assert.ok(tilesOf(h, 'By decision') && tilesOf(h, 'By routing'));
  assert.equal(tilesOf(h, 'By grade'), null);
  const supFail = buildModel(data({ suppliers: fail('data/suppliers.json', 'HTTP 404') }), STARK_REFERENCE);
  const s = senior(supFail);
  // Issue 46: one failure, one announcement. NEEDS YOU carries role="alert"; ESCALATE shows the same error quietly.
  assert.equal([...s.matchAll(/role="alert"/g)].length, 1);
  assert.match(panel(s, 'needs-title'), /NEEDS YOU<\/p><div class="panel error-panel" role="alert">[\s\S]*data\/suppliers\.json[\s\S]*HTTP 404/);
  assert.match(panel(s, 'esc-title'), /<div class="panel error-panel"><p class="eyebrow">COULD NOT LOAD<\/p><p class="mono">data\/suppliers\.json<\/p><p>HTTP 404<\/p>/);
  assert.equal(tilesOf(s, 'By decision'), null);
  assert.doesNotMatch(s, /as of/);
  // Both halves of QUEUE COUNTS are gone: the panel says so instead of standing empty, still named.
  const counts = s.slice(s.indexOf('<section class="panel today-counts"'), s.indexOf('</section>', s.indexOf('today-counts')));
  assert.match(counts, /^<section class="panel today-counts" aria-labelledby="counts-title"><p class="eyebrow" id="counts-title">QUEUE COUNTS<\/p><p class="quiet">No counts: the candidate and scorecard data did not load\.<\/p>$/);
  assert.doesNotMatch(counts, /today-count-groups|today-count"/);
  for (const label of ['By decision', 'By routing', 'By grade']) assert.equal(tilesOf(s, label), null, label);
  // Two sources failing on their own are two errors: each section announces its own.
  const both = senior(buildModel(data({ suppliers: fail('data/suppliers.json', 'HTTP 404'), history: fail('data/history.csv', 'HTTP 500') }), STARK_REFERENCE));
  assert.equal([...both.matchAll(/role="alert"/g)].length, 2);
  assert.match(panel(both, 'needs-title'), /role="alert"[\s\S]*data\/suppliers\.json/);
  assert.match(panel(both, 'esc-title'), /role="alert"[\s\S]*data\/history\.csv[\s\S]*HTTP 500/);
  assert.match(both, /No counts: the candidate and scorecard data did not load\./);
  // Only history failed: counts keep decision and routing, no "No counts" line.
  assert.doesNotMatch(senior(histFail), /No counts/);
});

test('issue 46 errorPanel: role="alert" by default, dropped with { alert: false }; text and class unchanged', () => {
  const err = { path: 'data/x.json', message: 'HTTP <404>', kind: 'fetch' };
  const on = errorPanel(err);
  const off = errorPanel(err, { alert: false });
  assert.match(on, /^<div class="panel error-panel" role="alert"><p class="eyebrow">COULD NOT LOAD<\/p>/);
  assert.match(off, /^<div class="panel error-panel"><p class="eyebrow">COULD NOT LOAD<\/p>/);
  assert.doesNotMatch(off, /role=/);
  assert.equal(off, on.replace(' role="alert"', ''));
  assert.match(off, /HTTP &lt;404&gt;/);
  assert.equal(errorPanel(err, {}), on);
});

test('UIT-FR-08: hostile names and IDs are escaped', () => {
  const evil = '<img src=x onerror=alert(1)>';
  const m = buildModel(data({ name: () => evil }), STARK_REFERENCE);
  const html = senior(m, { policy: '"><script>' });
  assert.doesNotMatch(html, /<img|<script/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('UIM-FR-14: every Escalate item is a flagged row in the Monitor table, and the Monitor detail links back to Today', () => {
  const ctx = { role: 'junior', params: { policy: 'abc' } };
  const mon = renderMonitor(REAL, ctx);
  const flagged = [...mon.matchAll(/<tr data-id="([^"]+)"[^>]*>([\s\S]*?)<\/tr>/g)].filter((m) => m[2].includes('▲ ESCALATE')).map((m) => m[1]);
  assert.deepEqual(ids(today.render(REAL, ctx), 'monitor'), flagged);
  const detail = renderMonitor(REAL, { ...ctx, params: { ...ctx.params, active: flagged[0] } });
  const back = formatHash({ view: 'today', role: 'junior', policy: 'abc' }).replaceAll('&', '&amp;');
  assert.ok(detail.includes(`href="${back}">← Today</a>`));
});

test('UIT-FR-06: a policy that flips a candidate decision moves it in Needs you and the counts (approve edge)', () => {
  // SUP-01 missing 7.pcn_notice scores exactly 96.0 with no assumed knockout: APPROVED and junior-routed at approve = 96,
  // CONDITIONAL and senior-routed one step above it (RUBRIC: total >= approve).
  const d = () => data({ extractions: { ...data().extractions, 'SUP-01': ext('SUP-01', missing(['7.pcn_notice'])) } });
  const at = (approve) => buildModel(d(), { ...STARK_REFERENCE, id: `approve-${approve}`,
    qualification: { ...STARK_REFERENCE.qualification, approve } });
  const edge = at(96);
  const above = at(96.1);
  assert.equal(edge.candidates.find((c) => c.id === 'SUP-01').evaluation.total, 96);
  assert.deepEqual(ids(junior(edge), 'qualify'), ['SUP-01']);
  assert.deepEqual(ids(junior(above), 'qualify'), []);
  assert.match(junior(above), /Nothing needs you today\./);
  assert.deepEqual(ids(senior(above), 'qualify'), ['SUP-03', 'SUP-01', 'SUP-02', 'SUP-05']);
  assert.deepEqual(tilesOf(senior(edge), 'By decision'), [['NOT APPROVED', 1], ['CONDITIONAL', 2], ['APPROVED', 1]]);
  assert.deepEqual(tilesOf(senior(above), 'By decision'), [['NOT APPROVED', 1], ['CONDITIONAL', 3], ['APPROVED', 0]]);
  assert.deepEqual(tilesOf(senior(above), 'By routing'), [['Junior', 0], ['Senior', 4]]);
});

test('UIT-FR-02: no role in ctx reads as Senior, as route.js defaults it', () => {
  assert.deepEqual(ids(today.render(REAL, {}), 'qualify'), ids(senior(REAL), 'qualify'));
  assert.deepEqual(ids(today.render(REAL), 'qualify'), ['SUP-03', 'SUP-02', 'SUP-05', 'SUP-01']);
});

test('UIT-FR-05: with no policy in the hash, item links carry no policy key', () => {
  const html = today.render(REAL, { role: 'senior', params: {} });
  for (const h of [...hrefs(html, 'qualify'), ...hrefs(html, 'monitor')]) {
    assert.ok(!('policy' in parseHash(h).params), h);
    assert.doesNotMatch(h, /policy=/);
  }
});

test('UIT-FR-03: hand-built scorecard rows: C without alert and A with an active alert escalate; Unrated shows a dash, never a number', () => {
  const card = (id, tier, composite, alerts = []) => ({ supplier_id: id, months: [{ month: '2026-10', index: 18, metrics: {}, composite, tier }],
    current: { month: '2026-10', composite, tier }, pchart: null, alerts, open_scars: [], failure_modes: [] });
  const alert = (type, active = true) => ({ type, month: '2026-10', index: 18, active, detail: 'd' });
  const suppliers = [card('ACT-11', 'A', 100), card('ACT-12', 'A', 90, [alert('ucl')]), card('ACT-13', 'C', 60),
    card('ACT-14', null, null, [alert('scar_aging')]), card('ACT-15', null, null), card('ACT-16', 'B', 75, [alert('run7', false)])];
  const m = { ...REAL, monitor: { ok: true, value: { suppliers, warnings: [] }, active: suppliers.map((s) => sup(s.supplier_id)) } };
  const html = panel(senior(m), 'esc-title');
  const want = monitorModel(m).rows.filter((r) => r.escalate).map((r) => r.id);
  assert.deepEqual(ids(html, 'monitor').sort(), ['ACT-12', 'ACT-13', 'ACT-14']);
  assert.deepEqual(ids(html, 'monitor'), want);
  const item = html.slice(html.indexOf('data-id="ACT-14"'), html.indexOf('</a>', html.indexOf('data-id="ACT-14"')));
  assert.ok(item.includes('Unrated · <span class="mono"><span aria-hidden="true">—</span><span class="sr-only">no composite score</span></span>'), item);
  // Issue 46: spoken text (aria-hidden dash dropped, sr-only kept, tags stripped) never doubles "Unrated".
  const spoken = item.replace(/<span aria-hidden="true">[^<]*<\/span>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.doesNotMatch(spoken, /Unrated\W+Unrated/);
  assert.match(spoken, /Unrated · no composite score/);
  assert.doesNotMatch(item, /\d\.\d/);
  assert.ok(item.includes('<span class="card-meta quiet">SCAR open &gt; 60 days</span>'));  // issue 162: plain words
  assert.deepEqual(tilesOf(senior(m), 'By grade'), [['Unrated', 2], ['D', 0], ['C', 1], ['B', 1], ['A', 2]]);
});

// Monitor tier table and detail (#44; UIM-FR-01..05, -10..-14; DESIGN-SPEC 4.5, 5, 6, 7).
// Two kinds of fixture: hand-built scorecard-shaped suppliers (exact tiers and bands without a simulation) and real
// engine output (buildModel + parseHistory on hand-made CSV rows), checked against scorecard() called here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildModel } from './model.js';
import { STARK_REFERENCE, parseHistory, scorecard } from './engine.js';
import { formatHash, parseHash } from './route.js';
import { METRICS, TIER_RANK, BAND_GLYPH, escalation, byTier, monitorModel, formatMetric, bandLabel, monitorHref, renderMonitor } from './monitor.js';
import * as monitor from './views/monitor.js';

// ---- hand-built scorecard suppliers ----
const GOOD = { dppm: [0, 'good'], escape: [0, 'good'], repeat_nc: [0, 'good'], scar_aging: [0, 'good'], otd: [100, 'good'] };
function card(id, tier, composite, { alerts = [], metrics = {}, open_scars = [] } = {}) {
  const m = Object.fromEntries(Object.entries({ ...GOOD, ...metrics }).map(([k, [value, band]]) => [k, { value, band, points: band === null ? null : 1 }]));
  const months = Array.from({ length: 18 }, (_, i) => ({ month: `M${i + 1}`, index: i + 1, metrics: m, composite, tier }));
  months[17].month = '2026-10';
  return { supplier_id: id, months, current: { month: '2026-10', composite, tier }, pchart: null, alerts, open_scars, failure_modes: [] };
}
const alert = (type, active = true, metric) => ({ type, month: '2026-10', index: 18, active, detail: 'd', ...(metric ? { metric } : {}) });
const roster = (ids, name = (id) => `Name ${id}`) => ids.map((id) => ({ id, name: name(id), commodity: 'cold_plate', part: 'cold_plate' }));
const fake = (suppliers, active = roster(suppliers.map((s) => s.supplier_id)), warnings = []) =>
  ({ monitor: { ok: true, value: { suppliers, warnings }, active } });
const CTX = (params = {}, role = 'senior', notFound = null) => ({ role, params, notFound });

// ---- real engine output ----
const AS_OF = '2026-11-01';
const HEAD = 'date,supplier_id,part_no,received_qty,rejected_qty,on_time,defect_found_at,failure_mode_code,scar_id,scar_opened,scar_closed';
const CSV = [HEAD,
  '2026-10-06,ACT-01,P1,1000,0,1,none,,,,',        // all Good: 100.0 A
  '2026-10-06,ACT-02,P1,1000,1,1,incoming,FM-A,,,',  // DPPM 1000 Watch: 85.0 A (Stark), B or C under custom tiers
  '2026-10-06,ACT-03,P1,1000,600,0,line,FM-B,,,',   // DPPM, escape, OTD Bad: 30.0 D
  '2026-10-06,ACT-04,P1,1000,0,0,none,,,,',         // OTD 0% Bad: 80.0 B, metric_bad otd active
  '2026-01-06,ACT-06,P1,1000,0,1,none,,,,',         // no receipts in M16-M18: DPPM and OTD null, Unrated
].join('\n');
const ROWS = parseHistory(CSV);
const IDS = ['ACT-01', 'ACT-02', 'ACT-03', 'ACT-04', 'ACT-06'];
const data = (rows = ROWS, active = roster(IDS)) => ({
  suppliers: { ok: true, path: 'data/suppliers.json', value: { as_of: AS_OF, candidates: [], active } },
  history: { ok: true, path: 'data/history.csv', value: rows }, extractions: {}, manual: { records: [], error: null },
});
const REAL = buildModel(data(), STARK_REFERENCE);

// ---- HTML readers ----
const rowsIn = (html) => [...html.matchAll(/<tr data-id="([^"]*)" data-href="([^"]*)"([^>]*)>([\s\S]*?)<\/tr>/g)]
  .map(([, id, href, rest, inner]) => ({ id, href, selected: /class="selected"/.test(rest), inner, cells: [...inner.matchAll(/<t[dh]([^>]*)>([\s\S]*?)<\/t[dh]>/g)].map((c) => ({ attrs: c[1], html: c[2] })) }));
const text = (html) => html.replace(/<span class="sr-only">[\s\S]*?<\/span>/g, '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');
const unescape = (s) => s.replace(/&amp;/g, '&');

test('UIM-FR-03 sort: Unrated, D, C, B, A; composite ascending; ID breaks ties; input not mutated', () => {
  const suppliers = [
    card('ACT-07', 'A', 100), card('ACT-03', 'B', 72.5), card('ACT-05', 'D', 35), card('ACT-01', 'A', 100),
    card('ACT-08', 'C', 55), card('ACT-02', 'B', 72.5), card('ACT-09', null, null), card('ACT-04', 'A', 90),
    card('ACT-06', 'B', 80),
  ];
  const before = suppliers.map((s) => s.supplier_id);
  const model = fake(suppliers);
  const snapshot = JSON.stringify(model);
  const ids = monitorModel(model).rows.map((r) => r.id);
  assert.deepEqual(ids, ['ACT-09', 'ACT-05', 'ACT-08', 'ACT-02', 'ACT-03', 'ACT-06', 'ACT-04', 'ACT-01', 'ACT-07']);
  assert.deepEqual(suppliers.map((s) => s.supplier_id), before);
  assert.equal(JSON.stringify(model), snapshot);
  assert.deepEqual(rowsIn(renderMonitor(model, CTX())).map((r) => r.id), ids);
  // Numeric ID tie-break and numeric composite compare.
  assert.deepEqual(monitorModel(fake([card('ACT-10', 'A', 100), card('ACT-2', 'A', 100)])).rows.map((r) => r.id), ['ACT-2', 'ACT-10']);
  assert.deepEqual(monitorModel(fake([card('ACT-01', 'D', 70), card('ACT-02', 'D', 9.5)])).rows.map((r) => r.id), ['ACT-02', 'ACT-01']);
  assert.deepEqual([null, 'D', 'C', 'B', 'A'].map((t) => TIER_RANK[t] ?? 0), [0, 1, 2, 3, 4]);
  assert.equal(byTier({ id: 'ACT-01', tier: 'A', composite: 100 }, { id: 'ACT-01', tier: 'A', composite: 100 }), 0);
});

test('UIM-FR-03 sort on real engine output: Unrated ACT-06, D ACT-03, B ACT-04, A ACT-02 (85.0), A ACT-01 (100.0)', () => {
  const sc = scorecard(ROWS, { as_of: AS_OF, policy: STARK_REFERENCE });
  const cur = Object.fromEntries(sc.suppliers.map((s) => [s.supplier_id, s.current]));
  assert.deepEqual([cur['ACT-06'].tier, cur['ACT-03'].tier, cur['ACT-04'].tier, cur['ACT-02'].tier, cur['ACT-01'].tier], [null, 'D', 'B', 'A', 'A']);
  assert.deepEqual(monitorModel(REAL).rows.map((r) => r.id), ['ACT-06', 'ACT-03', 'ACT-04', 'ACT-02', 'ACT-01']);
});

test('UIM-FR-04 escalation: tier C/D or an active alert; reasons in engine order, metric_bad merged', () => {
  const e = (tier, alerts = [], composite = 75) => escalation(card('ACT-01', tier, composite, { alerts }));
  assert.deepEqual(e('C', [], 55), { escalate: true, reasons: ['Tier C'], text: 'Tier C' });
  assert.equal(e('D', [alert('scar_aging'), alert('metric_bad', true, 'repeat_nc'), alert('metric_bad', true, 'scar_aging')], 35).text,
    'Tier D; scar_aging; metric_bad (repeat_nc, scar_aging)');
  assert.deepEqual(e('B', [alert('metric_bad', true, 'otd')], 80), { escalate: true, reasons: ['metric_bad (otd)'], text: 'metric_bad (otd)' });
  assert.equal(e('A', [], 100).escalate, false);
  assert.deepEqual(e('A', [alert('ucl')], 100).reasons, ['ucl']);
  assert.equal(e('A', [alert('ucl', false), alert('run7', false), alert('metric_bad', false, 'dppm')], 100).escalate, false);
  assert.deepEqual(e('A', [alert('run7', false), alert('ucl')], 100).reasons, ['ucl']);
  assert.equal(e(null, [], null).escalate, false);
  assert.deepEqual(e(null, [alert('run7')], null), { escalate: true, reasons: ['run7'], text: 'run7' });
  assert.equal(e('A', [alert('ucl'), alert('ucl')]).text, 'ucl');  // distinct types
  // Cut-off edges: the engine's tier decides, read here as given.
  assert.equal(e('C', [], 50.0).escalate, true);
  assert.equal(e('C', [], 69.9).escalate, true);
  assert.equal(e('B', [], 70.0).escalate, false);
  // Real engine: ACT-03 D, ACT-04 B + metric_bad otd, ACT-02 A, ACT-01 A, ACT-06 Unrated.
  const flags = Object.fromEntries(monitorModel(REAL).rows.map((r) => [r.id, r.escalateText]));
  assert.equal(flags['ACT-04'], 'metric_bad (otd)');
  assert.match(flags['ACT-03'], /^Tier D; /);
  assert.equal(flags['ACT-01'], '');
});

test('UIM-FR-05 metric cells: value + glyph + band word by engine band; null is "—" with "no receipts"', () => {
  const s = card('ACT-01', 'B', 72.5, { metrics: { dppm: [1480, 'watch'], escape: [0, 'good'], otd: [97.4, 'good'] } });
  const html = renderMonitor(fake([s]), CTX());
  const [r] = rowsIn(html);
  assert.equal(r.cells[4].html, '<span class="band watch">1,480 <span class="band-label">~ Watch</span></span>');
  assert.match(r.cells[4].attrs, /class="num col-metric" data-label="DPPM"/);
  assert.equal(text(r.cells[5].html), '0.0% ✓ Good');
  assert.equal(text(r.cells[8].html), '97.4% ✓ Good');
  // Band from the engine even when the value contradicts the Stark limits.
  const odd = rowsIn(renderMonitor(fake([card('ACT-01', 'A', 100, { metrics: { dppm: [100000, 'good'] } })]), CTX()))[0];
  assert.match(odd.cells[4].html, /class="band good">100,000 <span class="band-label">✓ Good/);
  // Null metric.
  const un = rowsIn(renderMonitor(fake([card('ACT-01', null, null, { metrics: { dppm: [null, null], otd: [null, null] } })]), CTX()))[0];
  for (const i of [4, 8]) {
    assert.equal(un.cells[i].html, '<span aria-hidden="true">—</span><span class="sr-only">no receipts</span>');
    assert.doesNotMatch(un.cells[i].html, /Good|Watch|Bad|band/);
  }
  // Formats.
  assert.deepEqual([0, 1480, 1234567].map((v) => formatMetric('dppm', v)), ['0', '1,480', '1,234,567']);
  assert.deepEqual([0, 100, 57.7].map((v) => formatMetric('otd', v)), ['0.0%', '100.0%', '57.7%']);
  assert.equal(formatMetric('escape', null), '—');
  assert.deepEqual(['good', 'watch', 'bad'].map(bandLabel), ['Good', 'Watch', 'Bad']);
  assert.deepEqual(BAND_GLYPH, { good: '✓', watch: '~', bad: '✗' });
  // Unknown band: escaped, shown raw, no glyph.
  // Every tier carries its own colour token next to its letter (DESIGN-SPEC 5; review N1).
  const tierBadges = rowsIn(renderMonitor(fake([card('ACT-01', 'A', 100), card('ACT-02', 'B', 75), card('ACT-03', 'C', 55), card('ACT-04', 'D', 30)]), CTX())).map((r) => r.cells[3].html);
  assert.deepEqual(tierBadges.sort(), ['<span class="badge amber">C</span>', '<span class="badge bad">D</span>', '<span class="badge ink">B</span>', '<span class="badge ok">A</span>'].sort());
  const weird = rowsIn(renderMonitor(fake([card('ACT-01', 'A', 100, { metrics: { dppm: [5, '<b>'] } })]), CTX()))[0];
  assert.match(weird.cells[4].html, /class="band &lt;b&gt;">5 <span class="band-label">&lt;b&gt;<\/span>/);
});

test('UIM-FR-02 columns in order, one row per scorecard supplier, Unrated texts, Escalate badge reasons', () => {
  const html = renderMonitor(REAL, CTX());
  const heads = [...html.match(/<thead>[\s\S]*?<\/thead>/)[0].matchAll(/<th scope="col"[^>]*>([^<]*)<\/th>/g)].map((m) => m[1]);
  assert.deepEqual(heads, ['ID', 'Name', 'Composite', 'Tier', ...METRICS.map((m) => m.label), 'Alerts']);
  assert.deepEqual(METRICS.map((m) => m.label), ['DPPM', 'Escape', 'Repeat NC', 'SCAR aging', 'On-time']);
  assert.match(html, /TIER TABLE \(5\)/);
  const rows = rowsIn(html);
  assert.equal(rows.length, REAL.monitor.value.suppliers.length);
  const un = rows.find((r) => r.id === 'ACT-06');
  assert.equal(un.cells[2].html, '<span aria-hidden="true">—</span><span class="sr-only">no composite score</span>');  // issue 46: not "Unrated" twice
  assert.equal(un.cells[3].html, '<span class="badge muted">Unrated</span>');
  assert.equal(text(un.cells[5].html), '0.0% ✓ Good');  // escape still shows value and band
  assert.equal(un.cells[9].html, '<span class="mono">0</span>');
  assert.equal(rows.find((r) => r.id === 'ACT-01').cells[3].html, '<span class="badge ok">A</span>');
  assert.equal(rows.find((r) => r.id === 'ACT-04').cells[3].html, '<span class="badge ink">B</span>');
  assert.equal(rows.find((r) => r.id === 'ACT-03').cells[3].html, '<span class="badge bad">D</span>');
  assert.equal(rows.find((r) => r.id === 'ACT-01').cells[1].html, 'Name ACT-01');
  assert.equal(rows.find((r) => r.id === 'ACT-02').cells[2].html, '85.0');
  // Escalate badge: title and sr-only text equal escalation().text; count is active alerts.
  const sc = REAL.monitor.value.suppliers;
  for (const r of rows) {
    const s = sc.find((x) => x.supplier_id === r.id);
    const { escalate, text: why } = escalation(s);
    const badge = r.cells[9].html.match(/<span class="badge amber" title="([^"]*)">▲ ESCALATE<span class="sr-only">: ([^<]*)<\/span><\/span>/);
    assert.equal(!!badge, escalate, r.id);
    if (badge) { assert.equal(unescape(badge[1]), why); assert.equal(unescape(badge[2]), why); }
    assert.ok(r.cells[9].html.startsWith(`<span class="mono">${s.alerts.filter((a) => a.active).length}</span>`), r.id);
  }
  const c = rowsIn(renderMonitor(fake([card('ACT-05', 'C', 55, { alerts: [alert('scar_aging'), alert('metric_bad', true, 'repeat_nc'), alert('metric_bad', true, 'scar_aging'), alert('ucl', false)] })]), CTX()))[0];
  assert.match(c.cells[9].html, /^<span class="mono">3<\/span> <span class="badge amber" title="Tier C; scar_aging; metric_bad \(repeat_nc, scar_aging\)">/);
});

test('UIM-FR-11 / -02 hrefs: row link and data-href are the canonical monitor hash; role and policy kept, month dropped', () => {
  for (const [role, params] of [['senior', {}], ['junior', { policy: 'p1.team-v3_x', month: 7, active: 'ACT-04' }]]) {
    const html = renderMonitor(REAL, CTX(params, role));
    const rows = rowsIn(html);
    for (const r of rows) {
      const want = formatHash({ view: 'monitor', role, policy: params.policy, active: r.id });
      assert.equal(unescape(r.href), want);
      assert.equal(monitorHref(CTX(params, role), { active: r.id }), want);
      const link = r.cells[0].html.match(/<a class="text-link" data-monitor-link data-id="([^"]*)" href="([^"]*)"/);
      assert.equal(link[1], r.id);
      assert.equal(unescape(link[2]), want);
      assert.doesNotMatch(want, /month=/);
      const back = parseHash(want);
      assert.deepEqual(back, { view: 'monitor', role, params: { ...(params.policy ? { policy: params.policy } : {}), active: r.id } });
    }
    const current = [...html.matchAll(/aria-current="true"/g)].length;
    assert.equal(current, params.active ? 1 : 0);
    if (params.active) {
      assert.deepEqual(rows.filter((r) => r.selected).map((r) => r.id), ['ACT-04']);
      assert.match(rows.find((r) => r.id === 'ACT-04').cells[0].html, /aria-current="true">ACT-04<\/a>/);
      assert.match(html, /<div class="monitor" data-open="true">/);
    } else assert.match(html, /<div class="monitor" data-open="false">/);
  }
});

test('UIM-FR-10 open SCARs: engine order, ages over 60 (strict) marked with text, day wording, empty list', () => {
  const scarList = [
    { scar_id: 'SCAR-B', opened: '2026-08-31', age_days: 61 }, { scar_id: 'SCAR-A', opened: '2026-09-01', age_days: 60 },
    { scar_id: 'SCAR-C', opened: '2026-10-30', age_days: 1 }, { scar_id: 'SCAR-D', opened: '2026-10-31', age_days: 0 },
  ];
  const html = renderMonitor(fake([card('ACT-05', 'C', 55, { open_scars: scarList })]), CTX({ active: 'ACT-05' }));
  assert.match(html, /OPEN SCARS \(4\)/);
  const trs = [...html.match(/<table class="scar-table" aria-labelledby="scar-title">[\s\S]*?<\/table>/)[0].matchAll(/<tr(?: data-alert="scar_aging")?><th scope="row" class="mono">([^<]*)<\/th><td class="mono">([^<]*)<\/td><td class="([^"]*)">([\s\S]*?)<\/td><\/tr>/g)];
  assert.deepEqual(trs.map((t) => t[1]), ['SCAR-B', 'SCAR-A', 'SCAR-C', 'SCAR-D']);
  assert.deepEqual(trs.map((t) => t[2]), ['2026-08-31', '2026-09-01', '2026-10-30', '2026-10-31']);
  assert.deepEqual(trs.map((t) => t[3]), ['num bad', 'num', 'num', 'num']);
  assert.deepEqual(trs.map((t) => text(t[4])), ['61 days ✗ Over 60 days', '60 days', '1 day', '0 days']);
  assert.equal([...html.matchAll(/Over 60 days/g)].length, 1);
  const none = renderMonitor(fake([card('ACT-01', 'A', 100)]), CTX({ active: 'ACT-01' }));
  assert.match(none, /OPEN SCARS \(0\)<\/p><p class="quiet">Open SCARs: none<\/p>/);
  assert.doesNotMatch(none, /scar-table/);
});

test('UIM-FR-13 / -14: Draft SCAR is disabled with a visible "Arrives in v1.1"; ← Today keeps role and policy only', () => {
  const html = renderMonitor(REAL, CTX({ active: 'ACT-04', policy: 'p1', month: 3 }, 'junior'));
  const btn = html.match(/<button([^>]*)>([^<]*)<\/button>/);
  assert.equal(btn[2], 'Draft SCAR');
  assert.match(btn[1], /\bdisabled\b/);
  const describedBy = btn[1].match(/aria-describedby="([^"]+)"/)[1];
  assert.match(html, new RegExp(`<span id="${describedBy}" class="quiet">Arrives in v1.1</span>`));
  const today = html.match(/<a class="text-link" href="([^"]*)">← Today<\/a>/);
  assert.equal(unescape(today[1]), '#view=today&role=junior&policy=p1');
  assert.equal(unescape(today[1]), formatHash({ view: 'today', role: 'junior', policy: 'p1' }));
  const back = html.match(/<a class="text-link back-link" href="([^"]*)">← Table<\/a>/);
  assert.equal(unescape(back[1]), '#view=monitor&role=junior&policy=p1');
});

test('UIM-FR-12 via views/monitor.js: errors, Not found, loading, empty, missing roster rows; h2 always present', () => {
  const H2 = /^<p class="eyebrow">04 \/ MONITOR<\/p><h2>Monitor<\/h2>/;
  const parseErr = buildModel({ ...data(), history: { ok: false, error: { path: 'data/history.csv', message: 'row 3: received_qty: expected an integer', kind: 'data' } } }, STARK_REFERENCE);
  const err = monitor.render(parseErr, CTX());
  assert.match(err, H2);
  assert.match(err, /COULD NOT LOAD[\s\S]*data\/history\.csv[\s\S]*row 3: received_qty: expected an integer/);
  assert.doesNotMatch(err, /tier-table/);
  const fetchErr = monitor.render(buildModel({ ...data(), history: { ok: false, error: { path: 'data/history.csv', message: 'HTTP 404', kind: 'fetch' } } }, STARK_REFERENCE));
  assert.match(fetchErr, /COULD NOT LOAD[\s\S]*HTTP 404/);
  const engineErr = monitor.render({ monitor: { ok: false, error: { path: 'data/history.csv', message: 'boom', kind: 'engine' } } });
  assert.match(engineErr, /ENGINE ERROR[\s\S]*boom/);
  const nf = monitor.render(REAL, CTX({ active: 'ACT-99' }, 'senior', { key: 'active', value: 'ACT-99', label: 'Not found' }));
  assert.match(nf, H2);
  assert.match(nf, /<p class="status-line" role="alert">Not found: active ACT-99<\/p>/);
  assert.equal(rowsIn(nf).length, 5);
  assert.doesNotMatch(nf, /monitor-detail|aria-current/);
  assert.match(nf, /data-open="false"/);
  const loading = monitor.render(null, CTX());
  assert.match(loading, H2);
  assert.match(loading, /Loading data…/);
  // No active suppliers: no table, no empty tbody. A roster entry with no history rows is a note, not a row.
  const empty = monitor.render(buildModel(data([], []), STARK_REFERENCE), CTX());
  assert.match(empty, /TIER TABLE \(0\)[\s\S]*<p class="quiet">No active suppliers\.<\/p>/);
  assert.doesNotMatch(empty, /<table|<tbody/);
  const missing = monitor.render(buildModel(data(ROWS, roster([...IDS, 'ACT-07'])), STARK_REFERENCE), CTX());
  assert.match(missing, /<p class="quiet">ACT-07 is active but has no rows in history\.csv\.<\/p>/);
  assert.equal(rowsIn(missing).length, 5);
  // Engine warnings are listed.
  assert.match(monitor.render(REAL, CTX()), /<ul class="status-problems"><li>[^<]*no p-chart<\/li>/);
  // A scorecard supplier missing from the roster shows its ID only.
  const noName = renderMonitor(fake([card('ACT-01', 'A', 100)], []), CTX({ active: 'ACT-01' }));
  assert.equal(rowsIn(noName)[0].cells[1].html, '');
  assert.match(noName, /<h3 id="detail-title" tabindex="-1"><span class="mono">ACT-01<\/span><\/h3>/);
  // An unknown policy id in the hash is only carried in links.
  assert.match(monitor.render(REAL, CTX({ policy: 'no-such' })), /data-href="#view=monitor&amp;role=senior&amp;policy=no-such&amp;active=ACT-06"/);
});

test('UIM-FR-12 XSS: names, reasons, SCAR fields and warnings are escaped everywhere', () => {
  const X = '<img src=x onerror=alert(1)>';
  const s = card('ACT-01', 'C', 55, { alerts: [alert(X)], open_scars: [{ scar_id: X, opened: X, age_days: 90 }] });
  const html = renderMonitor(fake([s], [{ id: 'ACT-01', name: X, commodity: X, part: 'p' }], [X]), CTX({ active: 'ACT-01' }));
  assert.doesNotMatch(html, /<img/);
  assert.ok([...html.matchAll(/&lt;img src=x onerror=alert\(1\)&gt;/g)].length >= 6);
  assert.match(html, /title="Tier C; &lt;img src=x onerror=alert\(1\)&gt;"/);
});

test('UIM-FR-01: the same CSV under three policies renders the engine\'s own tiers, bands and flags', () => {
  const tiers = { ...STARK_REFERENCE, id: 'tiers', scorecard: { ...STARK_REFERENCE.scorecard, tiers: { A: 99, B: 90, C: 50 } } };
  const limits = { ...STARK_REFERENCE, id: 'limits', scorecard: { ...STARK_REFERENCE.scorecard,
    limits: { ...STARK_REFERENCE.scorecard.limits, dppm: { good: 1500, watch: 3000 } } } };
  const seen = {};
  for (const policy of [STARK_REFERENCE, tiers, limits]) {
    const sc = scorecard(ROWS, { as_of: AS_OF, policy });
    const rows = rowsIn(renderMonitor(buildModel(data(), policy), CTX()));
    for (const s of sc.suppliers) {
      const r = rows.find((x) => x.id === s.supplier_id);
      assert.equal(text(r.cells[3].html), s.current.tier ?? 'Unrated', `${policy.id} ${s.supplier_id}`);
      const dppm = s.months[17].metrics.dppm;
      assert.equal(text(r.cells[4].html), dppm.value === null ? '—' : `${formatMetric('dppm', dppm.value)} ${BAND_GLYPH[dppm.band]} ${bandLabel(dppm.band)}`);
      assert.equal(/ESCALATE/.test(r.cells[9].html), escalation(s).escalate);
    }
    seen[policy.id] = Object.fromEntries(rows.map((r) => [r.id, text(r.cells[3].html) + '|' + text(r.cells[4].html) + '|' + /ESCALATE/.test(r.cells[9].html)]));
  }
  // The policies really change the output: ACT-02 is A and quiet, then C and flagged, then Good DPPM.
  assert.equal(seen[STARK_REFERENCE.id]['ACT-02'], 'A|1,000 ~ Watch|false');
  assert.equal(seen.tiers['ACT-02'], 'C|1,000 ~ Watch|true');
  assert.equal(seen.limits['ACT-02'], 'A|1,000 ✓ Good|false');
});

test('#45 slots: the detail has the p-chart and alerts panels (filled), then the SCAR panel and actions', () => {
  const html = renderMonitor(REAL, CTX({ active: 'ACT-04' }));
  const order = ['back-link', 'id="detail-title"', 'monitor-metrics', 'data-slot="pchart"', 'data-slot="alerts"', 'scar-panel', 'detail-actions']
    .map((k) => html.indexOf(k));
  assert.ok(order.every((i, n) => i > 0 && (n === 0 || i > order[n - 1])), JSON.stringify(order));
  assert.doesNotMatch(html, /arrives with issue #45/);
  // REAL has no baseline receipts, so this is the empty-chart text (decision 81); the drawn chart is pinned below.
  assert.match(html, /<section class="panel pchart-panel" data-slot="pchart"><p class="eyebrow">P-CHART<\/p><p class="quiet">No p-chart: no receipts in the baseline \(M1–M6\)\.<\/p><\/section>/);
  assert.match(html, /<section class="panel alerts-panel" data-slot="alerts"><p class="eyebrow">ALERTS \(\d+\)<\/p>/);
  const metrics = html.match(/<div class="metrics monitor-metrics">([\s\S]*?)<\/div><div class="monitor-grid">/)[1];
  assert.deepEqual([...metrics.matchAll(/<div class="metric"(?: data-alert="metric_bad")?><p>([^<]*)<\/p>/g)].map((m) => m[1]), METRICS.map((m) => m.label));
  assert.match(metrics, /<p>On-time<\/p><strong>0\.0%<\/strong><small class="band bad">✗ Bad<\/small>/);
  assert.match(html, /<h3 id="detail-title" tabindex="-1">Name ACT-04 <span class="mono">ACT-04<\/span><\/h3>/);
  assert.match(html, /<p class="eyebrow">Cold plate · M18 \(2026-10\)<\/p>/);
  // Unrated detail: "Unrated", null metrics "—" + "no receipts".
  const un = renderMonitor(REAL, CTX({ active: 'ACT-06' }));
  assert.match(un, /<div class="detail-policy"><span class="badge muted">Unrated<\/span><\/div>/);
  assert.match(un, /<p>DPPM<\/p><strong><span aria-hidden="true">—<\/span><span class="sr-only">no receipts<\/span><\/strong>/);
  // No detail without `active`.
  assert.doesNotMatch(renderMonitor(REAL, CTX()), /monitor-detail|data-slot/);
});

test('hygiene: monitor.js has no scoring, no policy import and no scorecard call', () => {
  const src = readFileSync(new URL('./monitor.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /\bMath\.|STARK_REFERENCE|engine\.js|rubric\.js|policy\.js|\bscorecard\s*\(|\.limits|\.tiers|\.weights/);
  const imports = [...src.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]);
  assert.deepEqual(imports, ['./html.js', './route.js', './shell.js', './queue.js', './chart.js']);
});

// ---- QA additions (stage 3, #44): edges the tests above did not pin ----

test('UIM-FR-03 sort edges: two Unrated rows by ID, null composite ties to ID, Today can sort plain rows with byTier', () => {
  const ids = (list) => monitorModel(fake(list)).rows.map((r) => r.id);
  assert.deepEqual(ids([card('ACT-10', null, null), card('ACT-2', null, null), card('ACT-1', 'D', 10)]), ['ACT-2', 'ACT-10', 'ACT-1']);
  // A null composite in a rated tier (not produced by the engine) compares equal, so the ID decides either way round.
  assert.ok(byTier({ id: 'ACT-02', tier: 'A', composite: null }, { id: 'ACT-01', tier: 'A', composite: 50 }) > 0);
  assert.ok(byTier({ id: 'ACT-01', tier: 'A', composite: 50 }, { id: 'ACT-02', tier: 'A', composite: null }) < 0);
  assert.ok(byTier({ id: 'ACT-09', tier: null, composite: null }, { id: 'ACT-01', tier: 'D', composite: 0 }) < 0);
  // Today (#107) contract: byTier over { id, tier, composite } alone reproduces Monitor's order.
  const plain = REAL.monitor.value.suppliers.map((s) => ({ id: s.supplier_id, tier: s.current.tier, composite: s.current.composite }));
  assert.deepEqual(plain.sort(byTier).map((r) => r.id), monitorModel(REAL).rows.map((r) => r.id));
});

test('UIM-FR-04 escalation edges: D alone, tier reason first, metric_bad without metric, de-dup, past metric_bad ignored, no throw', () => {
  const e = (tier, alerts = []) => escalation(card('ACT-01', tier, 50, { alerts }));
  assert.deepEqual(e('D'), { escalate: true, reasons: ['Tier D'], text: 'Tier D' });
  assert.deepEqual(e('B'), { escalate: false, reasons: [], text: '' });
  assert.equal(e('C', [alert('ucl'), alert('run7')]).text, 'Tier C; ucl; run7');
  assert.equal(e('C', [alert('run7'), alert('ucl')]).text, 'Tier C; run7; ucl');  // engine order, not alphabetical
  assert.equal(e('A', [alert('metric_bad')]).text, 'metric_bad');
  assert.equal(e('A', [alert('metric_bad', true, 'otd'), alert('ucl'), alert('metric_bad', true, 'otd'), alert('metric_bad', true, 'dppm')]).text,
    'metric_bad (otd, dppm); ucl');
  assert.equal(e('A', [alert('metric_bad', false, 'dppm'), alert('metric_bad', true, 'otd')]).text, 'metric_bad (otd)');
  assert.equal(e('A', [{ ...alert('ucl'), active: 'yes' }]).escalate, false);  // only active === true counts
  assert.deepEqual(escalation({ supplier_id: 'ACT-01' }), { escalate: false, reasons: [], text: '' });
  // The Alerts count is active alerts only; an A with only past alerts shows 0 and no badge.
  const [r] = rowsIn(renderMonitor(fake([card('ACT-01', 'A', 100, { alerts: [alert('ucl', false), alert('run7', false)] })]), CTX()));
  assert.equal(r.cells[9].html, '<span class="mono">0</span>');
});

test('UIM-FR-02 / -05 rounding: composite and rates to 1 dp in table and detail; detail band from the engine', () => {
  const s = card('ACT-01', 'B', 72.46, { metrics: { escape: [57.74, 'watch'], otd: [57.76, 'bad'], dppm: [100000, 'good'] } });
  const html = renderMonitor(fake([s]), CTX({ active: 'ACT-01' }));
  const [r] = rowsIn(html);
  assert.equal(r.cells[2].html, '72.5');
  assert.equal(text(r.cells[5].html), '57.7% ~ Watch');
  assert.equal(text(r.cells[8].html), '57.8% ✗ Bad');
  assert.match(html, /<div class="detail-policy"><span class="badge ink">B<\/span> <span class="mono">72\.5<\/span><\/div>/);
  assert.match(html, /<p>DPPM<\/p><strong>100,000<\/strong><small class="band good">✓ Good<\/small>/);
  assert.equal(rowsIn(renderMonitor(fake([card('ACT-01', 'B', 72.44)]), CTX()))[0].cells[2].html, '72.4');
  assert.equal(formatMetric('dppm', undefined), '—');
  assert.equal(rowsIn(renderMonitor(fake([card('ACT-01', 'A', 100)]), CTX()))[0].cells.slice(4, 9).every((c) => /data-label="[^"]+"/.test(c.attrs)), true);
});

test('UIM-FR-12 XSS: supplier IDs, unknown tier and band, and missing-roster IDs are escaped', () => {
  const X = 'ACT-"><img src=x onerror=alert(1)>';
  const s = card(X, '<b>', 55, { metrics: { dppm: [5, '<i>'] } });
  const html = renderMonitor(fake([s], [{ id: X, name: 'n', commodity: 'c', part: 'p' }, { id: `${X}2`, name: 'm', commodity: 'c', part: 'p' }]), CTX({ active: X }));
  assert.doesNotMatch(html, /<img|<b>|<i>|"><img/);
  assert.match(html, /data-id="ACT-&quot;&gt;&lt;img src=x onerror=alert\(1\)&gt;"/);
  assert.match(html, /<p class="quiet">ACT-&quot;&gt;&lt;img src=x onerror=alert\(1\)&gt;2 is active but has no rows in history\.csv\.<\/p>/);
  assert.match(html, /<span class="mono">ACT-&quot;&gt;&lt;img src=x onerror=alert\(1\)&gt;<\/span><\/h3>/);
  assert.match(html, /<small class="band &lt;i&gt;">&lt;i&gt;<\/small>/);
});

test('UIM-FR-10 open SCARs keep engine order even when ages are not descending (no re-sort by age or ID)', () => {
  const list = [{ scar_id: 'SCAR-2', opened: '2026-10-01', age_days: 31 }, { scar_id: 'SCAR-9', opened: '2026-07-01', age_days: 123 },
    { scar_id: 'SCAR-1', opened: '2026-09-01', age_days: 61 }];
  const html = renderMonitor(fake([card('ACT-05', 'C', 55, { open_scars: list })]), CTX({ active: 'ACT-05' }));
  assert.deepEqual([...html.matchAll(/<tr[^>]*><th scope="row" class="mono">([^<]*)<\/th>/g)].map((m) => m[1]), ['SCAR-2', 'SCAR-9', 'SCAR-1']);
});

// ---- #45: p-chart and alert list in the detail (UIM-FR-06..-09, -11 `month`) ----
const PC = { p_bar: 0.001, points: Array.from({ length: 18 }, (_, i) => ({ month: `M${i + 1}`, index: i + 1, n: 1000, p: 0.001, ucl: 0.004, above_ucl: false, run: 0 })) };
const withChart = (s, pchart = PC) => ({ ...s, pchart });

test('#45 monitorModel rows carry pchart, alertList, selectedMonth and alertedMetrics; the input is not mutated', () => {
  const alerts = [alert('metric_bad', true, 'otd'), alert('metric_bad', true, 'otd'), alert('metric_bad', false, 'dppm'), alert('ucl')];
  const model = fake([withChart(card('ACT-01', 'B', 80, { alerts })), card('ACT-02', 'A', 100)]);
  const snapshot = JSON.stringify(model);
  const m = monitorModel(model, { active: 'ACT-01', month: 9 });
  const r = m.rows.find((x) => x.id === 'ACT-01');
  assert.equal(r.pchart, model.monitor.value.suppliers[0].pchart);
  assert.equal(r.alertList, alerts);
  assert.equal(r.selectedMonth, 9);
  assert.deepEqual(r.alertedMetrics, ['otd']);  // active only, de-duplicated
  const other = m.rows.find((x) => x.id === 'ACT-02');
  assert.deepEqual([other.pchart, other.selectedMonth, other.alertedMetrics], [null, null, []]);
  assert.equal(JSON.stringify(model), snapshot);
  // A month with no point, or no month, selects nothing.
  const gap = withChart(card('ACT-01', 'B', 80), { ...PC, points: PC.points.filter((p) => p.index !== 9) });
  assert.equal(monitorModel(fake([gap]), { active: 'ACT-01', month: 9 }).rows[0].selectedMonth, null);
  assert.equal(monitorModel(fake([gap]), { active: 'ACT-01' }).rows[0].selectedMonth, null);
  assert.equal(monitorModel(fake([gap]), { month: 9 }).rows[0].selectedMonth, null);
});

test('#45 / UIM-FR-11 monitorHref with month: canonical, round-trips; ← Table and row links still drop it', () => {
  const ctx = CTX({ policy: 'p1.a_b-c', active: 'ACT-01', month: 4 }, 'junior');
  const h = monitorHref(ctx, { active: 'ACT-01', month: 9 });
  assert.equal(h, '#view=monitor&role=junior&policy=p1.a_b-c&active=ACT-01&month=9');
  assert.deepEqual(parseHash(h), { view: 'monitor', role: 'junior', params: { policy: 'p1.a_b-c', active: 'ACT-01', month: 9 } });
  assert.equal(monitorHref(ctx, { active: 'ACT-01' }), '#view=monitor&role=junior&policy=p1.a_b-c&active=ACT-01');
  const html = renderMonitor(fake([withChart(card('ACT-01', 'B', 80, { alerts: [{ ...alert('ucl', false), index: 9, month: 'M9' }] }))]), ctx);
  assert.match(html, /<a class="text-link back-link" href="#view=monitor&amp;role=junior&amp;policy=p1.a_b-c">← Table<\/a>/);
  assert.match(html, /data-alert-link data-index="9" href="#view=monitor&amp;role=junior&amp;policy=p1.a_b-c&amp;active=ACT-01&amp;month=9"/);
  assert.match(html, /<circle class="pt"[^>]*data-index="4" data-href="#view=monitor&amp;role=junior&amp;policy=p1.a_b-c&amp;active=ACT-01&amp;month=4"[^>]*aria-current="true"\/>/);
});

test('#45 representation: active metric_bad marks its detail cell; SCAR rows over 60 carry data-alert', () => {
  const s = withChart(card('ACT-01', 'B', 80, { alerts: [alert('metric_bad', true, 'otd'), { ...alert('metric_bad', false, 'dppm'), index: 12 }],
    metrics: { otd: [70, 'bad'] }, open_scars: [{ scar_id: 'S-61', opened: '2026-08-31', age_days: 61 }, { scar_id: 'S-60', opened: '2026-09-01', age_days: 60 }] }));
  const html = renderMonitor(fake([s]), CTX({ active: 'ACT-01' }));
  const cells = html.match(/<div class="metrics monitor-metrics">([\s\S]*?)<\/div><div class="monitor-grid">/)[1];
  assert.match(cells, /<div class="metric" data-alert="metric_bad"><p>On-time<\/p><strong>70\.0%<\/strong><small class="band bad">✗ Bad<\/small><small class="alert-mark"><span aria-hidden="true">● <\/span>Alert<\/small><\/div>/);
  assert.equal([...cells.matchAll(/data-alert=/g)].length, 1);  // the past dppm alert marks nothing
  assert.equal([...cells.matchAll(/alert-mark/g)].length, 1);
  assert.match(html, /<tr data-alert="scar_aging"><th scope="row" class="mono">S-61<\/th>/);
  assert.match(html, /<tr><th scope="row" class="mono">S-60<\/th>/);
});

test('#45 real engine: the SCAR rows marked equal the active scar_aging alert (strict > 60)', () => {
  // as_of 2026-11-01: M18 ends 2026-10-31. Opened 2026-08-31 -> 61 days (over); 2026-09-01 -> 60 days (not over).
  const csv = (opened) => [HEAD, `2026-10-06,ACT-01,P1,1000,0,1,none,,SCAR-1,${opened},`].join('\n');
  for (const [opened, over] of [['2026-08-31', 1], ['2026-09-01', 0]]) {
    const model = buildModel(data(parseHistory(csv(opened)), roster(['ACT-01'])), STARK_REFERENCE);
    const s = model.monitor.value.suppliers[0];
    const html = renderMonitor(model, CTX({ active: 'ACT-01' }));
    const marked = [...html.matchAll(/<tr data-alert="scar_aging">/g)].length;
    assert.equal(marked, over, opened);
    assert.equal(marked, s.open_scars.filter((x) => x.age_days > 60).length);
    assert.equal(s.alerts.some((a) => a.active && a.type === 'scar_aging'), marked > 0, opened);
    assert.equal(/See open SCARs/.test(html), marked > 0);
  }
});

test('#45 detail panels: no-chart supplier lists alerts without svg or toggle; ctx.chartTable picks one representation', () => {
  const none = renderMonitor(fake([card('ACT-01', 'C', 55, { alerts: [alert('tier_drop')] })]), CTX({ active: 'ACT-01' }));
  assert.match(none, /No p-chart: no receipts in the baseline \(M1–M6\)\./);
  assert.doesNotMatch(none, /<svg|data-pchart-toggle/);
  assert.match(none, /ALERTS \(1\)<\/p><p class="escalate-line">[\s\S]*Tier C; tier_drop[\s\S]*Tier drop/);
  const s = fake([withChart(card('ACT-01', 'A', 100))]);
  const chart = renderMonitor(s, { ...CTX({ active: 'ACT-01' }), chartTable: false });
  const table = renderMonitor(s, { ...CTX({ active: 'ACT-01' }), chartTable: true });
  assert.ok(chart.includes('<svg') && !chart.includes('pchart-table') && chart.includes('>Show as table</button>'));
  assert.ok(table.includes('pchart-table') && !table.includes('<svg') && table.includes('>Show as chart</button>'));
  assert.match(monitor.render(s, { ...CTX({ active: 'ACT-01' }), chartTable: true }), /pchart-table/);  // the view passes ctx through
  assert.match(chart, /ALERTS \(0\)<\/p><p class="quiet">No alerts\.<\/p>/);
});

// ---- QA additions (stage 3, #45) ----

test('QA #46 L3: the alerts-panel Escalate line equals the table badge tooltip for every real supplier', () => {
  for (const id of IDS) {
    const html = renderMonitor(REAL, CTX({ active: id }));
    const s = REAL.monitor.value.suppliers.find((x) => x.supplier_id === id);
    const want = escalation(s);
    const badge = rowsIn(html).find((r) => r.id === id).inner.match(/<span class="badge amber" title="([^"]*)">/)?.[1] ?? null;
    const line = html.match(/<p class="escalate-line"><span class="badge amber">▲ ESCALATE<\/span> <span class="mono">([^<]*)<\/span><\/p>/)?.[1] ?? null;
    assert.equal(line, badge, id);
    assert.equal(line, want.escalate ? want.text : null, id);
  }
  // ACT-03 (D) and ACT-04 (OTD Bad) escalate, ACT-01 does not: the check above covered both branches.
  assert.ok(escalation(REAL.monitor.value.suppliers.find((x) => x.supplier_id === 'ACT-03')).escalate);
  assert.ok(!escalation(REAL.monitor.value.suppliers.find((x) => x.supplier_id === 'ACT-01')).escalate);
});

test('QA #45 wiring: month selects the alert link, metric labels reach the list, the name reaches the chart title', () => {
  const alerts = [{ ...alert('ucl', false), index: 9, month: '2025-01' }, alert('metric_bad', true, 'otd')];
  const s = fake([withChart(card('ACT-01', 'B', 80, { alerts, metrics: { otd: [70, 'bad'] } }))]);
  const on = renderMonitor(s, CTX({ active: 'ACT-01', month: 9 }));
  assert.match(on, /<a class="text-link" data-alert-link data-index="9" href="[^"]*month=9" aria-current="true">Above UCL/);
  assert.match(on, /<circle class="pt"[^>]*data-index="9"[^>]*aria-current="true"\/>/);
  assert.match(on, /<strong class="alert-status">ACTIVE<\/strong> <span class="alert-what">On-time bad /);
  assert.match(on, /<title id="pc-title-ACT-01">p-chart for Name ACT-01 \(ACT-01\), M1 to M18<\/title>/);
  const off = renderMonitor(s, CTX({ active: 'ACT-01' }));
  assert.doesNotMatch(off, /aria-current="true">Above UCL|<circle class="pt"[^>]*aria-current/);
  // An unknown metric key shows raw, as the table does.
  const raw = renderMonitor(fake([card('ACT-01', 'B', 80, { alerts: [alert('metric_bad', true, 'weird')] })]), CTX({ active: 'ACT-01' }));
  assert.match(raw, /<span class="alert-what">weird bad /);
});

test('QA selectedMonth belongs to the open supplier only, even when another supplier has a point that month', () => {
  const m = monitorModel(fake([withChart(card('ACT-01', 'B', 80)), withChart(card('ACT-02', 'A', 100))]), { active: 'ACT-01', month: 9 });
  assert.deepEqual(m.rows.map((r) => [r.id, r.selectedMonth]).sort(), [['ACT-01', 9], ['ACT-02', null]]);
});

// ---- issue 46: accessibility pass (DS-NFR-01, decision 173) ----

test('issue 46 L2: tier and SCAR tables are named by their eyebrows and each body row starts with a row header', () => {
  const scarList = [{ scar_id: 'S-1', opened: '2026-10-01', age_days: 31 }, { scar_id: 'S-2', opened: '2026-08-01', age_days: 92 }];
  const html = renderMonitor(fake([card('ACT-01', 'A', 100), card('ACT-05', 'C', 55, { open_scars: scarList })]), CTX({ active: 'ACT-05' }));
  assert.match(html, /<table class="tier-table" aria-labelledby="tier-title">/);
  assert.equal([...html.matchAll(/id="tier-title"/g)].length, 1);
  assert.match(html, /<table class="scar-table" aria-labelledby="scar-title">/);
  assert.match(html, /<p class="eyebrow" id="scar-title">OPEN SCARS \(2\)<\/p>/);
  assert.equal([...html.matchAll(/id="scar-title"/g)].length, 1);
  // Every <table> in the view carries a name (the p-chart is in its chart mode here, so only these two).
  for (const t of html.match(/<table\b[^>]*>(?:<caption)?/g)) assert.match(t, /aria-label(?:ledby)?="|<caption/, t);
  const tier = html.match(/<table class="tier-table"[\s\S]*?<\/table>/)[0];
  assert.equal([...tier.match(/<thead>[\s\S]*?<\/thead>/)[0].matchAll(/<th scope="col"/g)].length, 10);
  const bodyRows = [...tier.matchAll(/<tr data-id="([^"]*)"[^>]*>([\s\S]*?)<\/tr>/g)];
  assert.equal(bodyRows.length, 2);
  for (const [, id, inner] of bodyRows) {
    assert.ok(inner.startsWith(`<th scope="row" class="mono"><a class="text-link" data-monitor-link data-id="${id}" `), id);
    assert.equal([...inner.matchAll(/<th\b/g)].length, 1, id);
  }
  const scar = html.match(/<table class="scar-table"[\s\S]*?<\/table>/)[0];
  assert.deepEqual([...scar.matchAll(/<tr(?: data-alert="scar_aging")?><th scope="row" class="mono">([^<]*)<\/th><td/g)].map((m) => m[1]), ['S-1', 'S-2']);
});

test('issue 46: an Unrated composite reads "no composite score" to screen readers, never "Unrated" twice', () => {
  const html = renderMonitor(fake([card('ACT-06', null, null, { alerts: [alert('ucl')] })]), CTX());
  const [r] = rowsIn(html);
  assert.equal(r.cells[2].html, '<span aria-hidden="true">—</span><span class="sr-only">no composite score</span>');
  // What a screen reader hears across the row: tags gone, sr-only text kept.
  const spoken = r.inner.replace(/<span aria-hidden="true">[^<]*<\/span>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.doesNotMatch(spoken, /Unrated\W+Unrated/);
  assert.match(spoken, /no composite score Unrated/);
  // The L3 escalate-line regression is the "alerts-panel Escalate line equals the table badge tooltip" test above (decision 174).
});

test('issue 140: both Monitor row-header tables keep normal font weight', () => {
  const css = readFileSync(new URL('./app.css', import.meta.url), 'utf8');
  assert.match(css, /\.tier-table th\[scope=row\],\.scar-table th\[scope=row\]\{font-weight:400\}/);
});

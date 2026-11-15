// Monitor tier table and supplier detail (#44; UIM-FR-02..05, -10, -11 `active`, -12, -13, -14 Monitor half;
// DESIGN-SPEC 4.5, 4.9, 5, 6). The detail's p-chart and alert list come from chart.js (#45; UIM-FR-06..-09, -11 `month`).
// Pure: no DOM. Reads the engine's scorecard output only (model.monitor.value); every tier, band, composite and
// alert comes from there, so a new policy re-grades the view (UIM-FR-01). The only arithmetic is display rounding.
// escalation() and byTier are the single definition Today (issue 107) imports (UIM-FR-14, UIT-FR-03).
import { esc } from './html.js';
import { formatHash } from './route.js';
import { routeLine } from './shell.js';
import { commodityLabel } from './queue.js';
import { chartModel, renderChartPanel, alertRows, renderAlerts } from './chart.js';

/** Table order, SCORECARD.md "Metrics". */
export const METRICS = [
  { key: 'dppm', label: 'DPPM' }, { key: 'escape', label: 'Escape' }, { key: 'repeat_nc', label: 'Repeat NC' },
  { key: 'scar_aging', label: 'SCAR aging' }, { key: 'otd', label: 'On-time' },
];
/** UIM-FR-03. Unrated (tier null) ranks 0: `TIER_RANK[tier] ?? 0`. */
export const TIER_RANK = { D: 1, C: 2, B: 3, A: 4 };
export const BAND_GLYPH = { good: '✓', watch: '~', bad: '✗' };
const BAND_LABEL = { good: 'Good', watch: 'Watch', bad: 'Bad' };
const TIER_TONE = { A: 'ok', B: 'ink', C: 'amber', D: 'bad' };
// SCORECARD.md `scar_aging`: "an open SCAR is more than 60 days old". The UI marks the row; it scores nothing.
const SCAR_OVER_DAYS = 60;
const NONE = (why) => `<span aria-hidden="true">—</span><span class="sr-only">${why}</span>`;

/** UIM-FR-04. s: one scorecard supplier. Tier C or D, then each distinct active alert type in engine order;
 *  metric_bad is one reason listing its metrics. Unrated alone does not escalate (decisions 58, 59). */
export function escalation(s) {
  const tier = s.current?.tier;
  const reasons = tier === 'C' || tier === 'D' ? [`Tier ${tier}`] : [];
  const types = [];
  const bad = [];
  for (const a of s.alerts ?? []) {
    if (a.active !== true) continue;
    if (!types.includes(a.type)) types.push(a.type);
    if (a.type === 'metric_bad' && a.metric && !bad.includes(a.metric)) bad.push(a.metric);
  }
  reasons.push(...types.map((t) => (t === 'metric_bad' && bad.length ? `metric_bad (${bad.join(', ')})` : t)));
  return { escalate: reasons.length > 0, reasons, text: reasons.join('; ') };
}

/** UIM-FR-03 row order: tier (Unrated, D, C, B, A), composite ascending (null equal), then ID. Rows: { id, tier, composite }. */
export const byTier = (a, b) => ((TIER_RANK[a.tier] ?? 0) - (TIER_RANK[b.tier] ?? 0))
  || (a.composite === null || b.composite === null ? 0 : a.composite - b.composite)
  || a.id.localeCompare(b.id, 'en', { numeric: true });

/** Display only: null '—', DPPM thousands separators (the engine value is already an integer), rates 1 dp + '%'. */
export function formatMetric(key, value) {
  if (value === null || value === undefined) return '—';
  return key === 'dppm' ? value.toLocaleString('en-US') : `${value.toFixed(1)}%`;
}

/** 'good' -> 'Good'; an unknown band is shown raw. */
export const bandLabel = (band) => (Object.hasOwn(BAND_LABEL, band) ? BAND_LABEL[band] : String(band));

/** Row links and ← Table pass no month, so they drop it (decision 63); alert and point links pass one. */
export const monitorHref = (ctx = {}, patch = {}) =>
  formatHash({ view: 'monitor', role: ctx.role, policy: ctx.params?.policy, active: patch.active, month: patch.month });
const metricLabel = (key) => METRICS.find((m) => m.key === key)?.label ?? key;

/** Pure view model. model: buildModel() output with model.monitor.ok. active, month: hash values or undefined. */
export function monitorModel(model, { active, month } = {}) {
  const { value, active: roster = [] } = model.monitor;
  const info = new Map(roster.map((a) => [a.id, a]));
  const rows = value.suppliers.map((s) => {
    const m18 = s.months[s.months.length - 1];
    const { escalate, text } = escalation(s);
    const selected = active !== undefined && s.supplier_id === active;
    return {
      id: s.supplier_id, name: info.get(s.supplier_id)?.name ?? '', commodity: info.get(s.supplier_id)?.commodity ?? '',
      month: m18?.month ?? s.current.month, tier: s.current.tier, composite: s.current.composite, unrated: s.current.tier === null,
      alerts: (s.alerts ?? []).filter((a) => a.active === true).length, escalate, escalateText: text,
      metrics: METRICS.map(({ key, label }) => {
        const { value: v = null, band = null } = m18?.metrics?.[key] ?? {};
        return { key, label, value: v, band, text: formatMetric(key, v), empty: v === null };
      }),
      open_scars: s.open_scars ?? [], selected, pchart: s.pchart ?? null, alertList: s.alerts ?? [],
      // The hash month, only when this is the open supplier and its chart has a point that month (UIM-FR-11).
      selectedMonth: selected && month !== undefined && (s.pchart?.points ?? []).some((p) => p.index === month) ? month : null,
      // Active metric_bad alerts mark their metric cell in the detail (PRD-06 alert representation).
      alertedMetrics: [...new Set((s.alerts ?? []).filter((a) => a.active === true && a.type === 'metric_bad' && a.metric).map((a) => a.metric))],
    };
  }).sort(byTier);  // map() made a copy: the scorecard is not mutated
  const ids = new Set(rows.map((r) => r.id));
  return { rows, selected: rows.find((r) => r.selected) ?? null,
    missing: roster.filter((a) => !ids.has(a.id)).map((a) => a.id), warnings: value.warnings ?? [] };
}

const tierBadge = (tier) => (tier === null ? '<span class="badge muted">Unrated</span>'
  : `<span class="badge ${TIER_TONE[tier] ?? ''}">${esc(tier)}</span>`);
const composite = (c) => (c === null ? NONE('no composite score') : c.toFixed(1));  // issue 46: tier text already says Unrated
const bandWord = (band) => `${Object.hasOwn(BAND_GLYPH, band) ? `${BAND_GLYPH[band]} ` : ''}${esc(bandLabel(band))}`;

function metricCell(m) {
  const body = m.empty ? NONE('no receipts')
    : `<span class="band ${esc(m.band)}">${esc(m.text)} <span class="band-label">${bandWord(m.band)}</span></span>`;
  return `<td class="num col-metric" data-label="${esc(m.label)}">${body}</td>`;
}

function alertsCell(r) {
  const flag = r.escalate ? ` <span class="badge amber" title="${esc(r.escalateText)}">▲ ESCALATE<span class="sr-only">: ${esc(r.escalateText)}</span></span>` : '';
  return `<td class="col-alerts"><span class="mono">${r.alerts}</span>${flag}</td>`;
}

function row(r, ctx) {
  const href = esc(monitorHref(ctx, { active: r.id }));
  return `<tr data-id="${esc(r.id)}" data-href="${href}"${r.selected ? ' class="selected"' : ''}>`
    + `<th scope="row" class="mono"><a class="text-link" data-monitor-link data-id="${esc(r.id)}" href="${href}"${r.selected ? ' aria-current="true"' : ''}>${esc(r.id)}</a></th>`
    + `<td class="col-name">${esc(r.name)}</td>`
    + `<td class="num col-comp">${composite(r.composite)}</td>`
    + `<td class="col-tier">${tierBadge(r.tier)}</td>`
    + r.metrics.map(metricCell).join('')
    + alertsCell(r) + '</tr>';
}

function table(m, ctx) {
  const th = (label, cls = '') => `<th scope="col"${cls ? ` class="${cls}"` : ''}>${label}</th>`;
  const head = th('ID') + th('Name', 'col-name') + th('Composite', 'num col-comp') + th('Tier', 'col-tier')
    + METRICS.map((x) => th(x.label, 'num col-metric')).join('') + th('Alerts', 'col-alerts');
  const body = m.rows.length
    ? `<div class="table-wrap"><table class="tier-table" aria-labelledby="tier-title"><thead><tr>${head}</tr></thead><tbody>${m.rows.map((r) => row(r, ctx)).join('')}</tbody></table></div>`
    : '<p class="quiet">No active suppliers.</p>';
  const notes = (m.warnings.length ? `<ul class="status-problems">${m.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : '')
    + m.missing.map((id) => `<p class="quiet">${esc(id)} is active but has no rows in history.csv.</p>`).join('');
  return `<section class="panel tier-panel" aria-labelledby="tier-title"><p class="eyebrow" id="tier-title">TIER TABLE (${m.rows.length})</p>${body}${notes}</section>`;
}

// UIM-FR-10: engine order, age strictly over 60 marked by color and text (decision 68).
function scars(list) {
  const body = !list.length ? '<p class="quiet">Open SCARs: none</p>'
    : '<div class="table-wrap"><table class="scar-table" aria-labelledby="scar-title"><thead><tr><th scope="col">SCAR ID</th><th scope="col">Opened</th><th scope="col" class="num">Age</th></tr></thead><tbody>'
      + list.map((s) => {
        const over = s.age_days > SCAR_OVER_DAYS;
        return `<tr${over ? ' data-alert="scar_aging"' : ''}><th scope="row" class="mono">${esc(s.scar_id)}</th><td class="mono">${esc(s.opened)}</td>`
          + `<td class="num${over ? ' bad' : ''}">${esc(s.age_days)} ${s.age_days === 1 ? 'day' : 'days'}${over ? ' <span class="over">✗ Over 60 days</span>' : ''}</td></tr>`;
      }).join('') + '</tbody></table></div>';
  return `<section class="panel scar-panel"><p class="eyebrow" id="scar-title">OPEN SCARS (${list.length})</p>${body}</section>`;
}

/** The detail <section> for one monitorModel row (UIM-FR-10, -13, -14; decision 66). */
export function renderMonitorDetail(r, ctx = {}) {
  const eyebrow = [commodityLabel(r.commodity), `M18 (${r.month})`].filter(Boolean).join(' · ');
  const metrics = r.metrics.map((m) => {
    const alerted = r.alertedMetrics.includes(m.key);
    return `<div class="metric"${alerted ? ' data-alert="metric_bad"' : ''}><p>${esc(m.label)}</p>`
      + (m.empty ? `<strong>${NONE('no receipts')}</strong>` : `<strong>${esc(m.text)}</strong><small class="band ${esc(m.band)}">${bandWord(m.band)}</small>`)
      + (alerted ? '<small class="alert-mark"><span aria-hidden="true">● </span>Alert</small>' : '') + '</div>';
  }).join('');
  const hrefFor = (month) => monitorHref(ctx, { active: r.id, month });
  const month = r.selectedMonth ?? undefined;
  const chart = renderChartPanel(chartModel(r.pchart, r.alertList, { month }), { id: r.id, name: r.name, table: !!ctx.chartTable, hrefFor });
  const alerts = renderAlerts({ rows: alertRows(r.alertList, r.pchart, { metricLabel, month }), hrefFor,
    escalate: { escalate: r.escalate, text: r.escalateText } });
  const today = esc(formatHash({ view: 'today', role: ctx.role, policy: ctx.params?.policy }));
  return '<section class="detail monitor-detail" aria-labelledby="detail-title">'
    + `<a class="text-link back-link" href="${esc(monitorHref(ctx))}">← Table</a>`
    + '<div class="detail-head"><div class="detail-id">'
    + `<p class="eyebrow">${esc(eyebrow)}</p>`
    + `<h3 id="detail-title" tabindex="-1">${r.name ? `${esc(r.name)} ` : ''}<span class="mono">${esc(r.id)}</span></h3></div>`
    + `<div class="detail-policy">${tierBadge(r.tier)}${r.unrated ? '' : ` <span class="mono">${composite(r.composite)}</span>`}</div></div>`
    + `<div class="metrics monitor-metrics">${metrics}</div>`
    + '<div class="monitor-grid">'
    + `<section class="panel pchart-panel" data-slot="pchart">${chart}</section>`
    + `<div class="monitor-side"><section class="panel alerts-panel" data-slot="alerts">${alerts}</section>`
    + `${scars(r.open_scars)}</div></div>`
    + `<div class="detail-actions"><a class="text-link" href="${today}">← Today</a>`
    + '<button type="button" class="button compact" disabled aria-describedby="scar-note">Draft SCAR</button>'
    + '<span id="scar-note" class="quiet">Arrives in v1.1</span></div>'
    + '</section>';
}

/** Table + detail. model.monitor.ok assumed (the view handles loading and errors). data-open: phone hides the table. */
export function renderMonitor(model, ctx = {}) {
  const m = monitorModel(model, { active: ctx.params?.active, month: ctx.params?.month });
  const detail = ctx.notFound ? routeLine(ctx) : m.selected ? renderMonitorDetail(m.selected, ctx) : '';
  return `<div class="monitor" data-open="${!!m.selected}">${table(m, ctx)}${detail}</div>`;
}

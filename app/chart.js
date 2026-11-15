// Monitor p-chart and alert list (#45; UIM-FR-06..-09, -11 `month`; DESIGN-SPEC 4.5, 5, 6, 7, 8, 9).
// Pure: no DOM. Every p, UCL, p̄, run and alert is the engine's (a scorecard supplier's pchart and alerts); the
// only arithmetic here is plot geometry and display rounding. The run members are found by walking back `run`
// plotted points from each run7 alert, the same way the engine builds its "(M12–M18)" detail.
// Must not import monitor.js (monitor.js imports this; a cycle fails module init, see route.js).
import { esc } from './html.js';

export const VB = { W: 720, H: 260, L: 56, R: 12, T: 16, B: 32 };  // viewBox and plot margins (display only)
export const HIT_R = 15;    // user units; at MIN_PX wide, 2 * 15 * 600 / 720 = 25 px >= 24 px (DS-NFR-01)
export const MIN_PX = 600;  // CSS min-width of the SVG (app.css .pchart-plot); its scroller scrolls on phones
// SCORECARD.md: Baseline = M1–M6 (engine SCORECARD.baseline_months; chart.test.js checks the two agree). Shading only.
export const BASELINE_MONTHS = 6;
const MONTHS = 18;
// A tooltip above a point needs ~80 px (3 lines at 125% of its height); at the 600 px minimum (scale 0.833) that is
// ~96 units, so points higher than this show it below instead and it never leaves the scroller.
const TIP_FLIP = 100;

export const fmt4 = (x) => x.toFixed(4);                        // DESIGN-SPEC §6 p and UCL
export const monthLabel = (index) => `M${index}`;               // 'M18'
export const monthFull = (pt) => `M${pt.index} (${pt.month})`;  // 'M18 (2026-10)'
const fmtN = (n) => n.toLocaleString('en-US');
const r2 = (v) => String(Math.round(v * 100) / 100);
const BASE_SPAN = `M1–M${BASELINE_MONTHS}`;

/** PRD-06 alert representation labels. metric_bad: `<metric> bad`, see alertLabel. */
export const ALERT_LABEL = { ucl: 'Above UCL', run7: '7 in a row above p̄', tier_drop: 'Tier drop', scar_aging: 'SCAR > 60 days' };
export function alertLabel(a, metricLabel = (k) => k) {
  if (a.type === 'metric_bad') return a.metric ? `${metricLabel(a.metric)} bad` : 'Metric bad';
  return Object.hasOwn(ALERT_LABEL, a.type) ? ALERT_LABEL[a.type] : String(a.type);
}
const FLAG = { aboveUcl: 'Above UCL', inRun: 'In run above p̄', baseline: 'Baseline' };

/** pchart: engine pchart | null. alerts: engine alerts. month: hash value 1..18 | undefined. -> model or null. */
export function chartModel(pchart, alerts = [], { month } = {}) {
  if (!pchart) return null;
  const { W, H, L, R, T, B } = VB;
  const src = pchart.points ?? [];
  const pbar = pchart.p_bar;
  // Display scale only (not a threshold): 10% headroom over the largest value; 0.001 when everything is 0.
  const top = Math.max(pbar, ...src.flatMap((p) => [p.p, p.ucl]));
  const ymax = top > 0 ? top * 1.1 : 0.001;
  const step = (W - L - R) / MONTHS;
  const x = (i) => L + (i - 0.5) * step;
  const y = (v) => T + (H - T - B) * (1 - v / ymax);
  // run7 members: for each run7 alert at plotted position k, the engine's run counts the k - run + 1 .. k points.
  const inRun = new Set();
  for (const a of alerts) {
    if (a.type !== 'run7') continue;
    const k = src.findIndex((p) => p.index === a.index);
    if (k < 0) continue;
    for (let j = Math.max(0, k - src[k].run + 1); j <= k; j++) inRun.add(j);
  }
  const selectedIndex = src.some((p) => p.index === month) ? month : null;
  const tabIndex = selectedIndex ?? src.at(-1)?.index;
  const points = src.map((pt, k) => {
    const cx = x(pt.index);
    const cy = y(pt.p);
    const flags = { aboveUcl: pt.above_ucl === true, inRun: inRun.has(k), baseline: pt.index <= BASELINE_MONTHS };
    const full = monthFull(pt);
    const nums = `n ${fmtN(pt.n)}, p ${fmt4(pt.p)}, UCL ${fmt4(pt.ucl)}`;
    const aria = `${full}: ${nums}${flags.aboveUcl ? ', above UCL' : ''}${flags.inRun ? ', in a run above p̄' : ''}${flags.baseline ? ', baseline' : ''}`;
    const words = [flags.aboveUcl && FLAG.aboveUcl, flags.inRun && FLAG.inRun].filter(Boolean);
    const tip = [full, nums.replaceAll(', ', ' · '), ...(words.length ? [words.join(' · ')] : [])].join('\n');
    const edge = [pt.index <= 3 ? 'edge-l' : pt.index >= 16 ? 'edge-r' : '', cy < TIP_FLIP ? 'below' : ''].filter(Boolean).join(' ');
    return { index: pt.index, month: pt.month, label: monthLabel(pt.index), full, n: pt.n, p: pt.p, ucl: pt.ucl, run: pt.run,
      ...flags, cx, cy, uclY: y(pt.ucl), selected: pt.index === selectedIndex, tab: pt.index === tabIndex, aria, tip, edge,
      left: (cx / W * 100).toFixed(2), top: (cy / H * 100).toFixed(2) };
  });
  const ticks = [0, 1, 2, 3].map((t) => { const v = ymax * t / 3; return { v, y: y(v), text: fmt4(v) }; });
  return { pbar, ymax, step, x, y, points, ticks, selectedIndex, summary: summaryOf(pbar, points) };
}

// Maximal runs of consecutive marked points (array adjacency, as the engine counts runs).
function runSpans(points) {
  const spans = [];
  points.forEach((p, k) => {
    if (!p.inRun) return;
    if (k > 0 && points[k - 1].inRun) spans.at(-1)[1] = p.label;
    else spans.push([p.label, p.label]);
  });
  return spans.map(([a, b]) => (a === b ? a : `${a}–${b}`));
}

function summaryOf(pbar, points) {
  const above = points.filter((p) => p.aboveUcl).map((p) => p.label);
  const runs = runSpans(points);
  return `p̄ ${fmt4(pbar)} (${BASE_SPAN}). Above UCL: ${above.length ? above.join(', ') : 'none'}. `
    + `${ALERT_LABEL.run7}: ${runs.length ? runs.join('; ') : 'none'}.`;
}

// A path through one value per plotted point; `seg` draws a point's piece. A month gap starts a new subpath (`M`),
// so no value is ever drawn for a month without receipts.
function stepPath(m) {
  const h = m.step / 2;
  return m.points.map((p, k) => {
    const join = k > 0 && m.points[k - 1].index === p.index - 1;
    return `${join ? `V${r2(p.uclY)}` : `M${r2(p.cx - h)} ${r2(p.uclY)}`}H${r2(p.cx + h)}`;
  }).join('');
}
function linePath(m) {
  return m.points.map((p, k) => `${k > 0 && m.points[k - 1].index === p.index - 1 ? 'L' : 'M'}${r2(p.cx)} ${r2(p.cy)}`).join('');
}
function triangle(cx, cy) {  // upward, side 11: apex 2/3 of the height above the centre
  return `M${r2(cx)} ${r2(cy - 6.35)}L${r2(cx + 5.5)} ${r2(cy + 3.18)}L${r2(cx - 5.5)} ${r2(cy + 3.18)}Z`;
}
function mark(p) {
  const c = `cx="${r2(p.cx)}" cy="${r2(p.cy)}"`;
  return (p.aboveUcl ? `<path class="pc-tri" d="${triangle(p.cx, p.cy)}"/>` : `<circle class="pc-dot${p.inRun ? ' run' : ''}" ${c} r="3.5"/>`)
    + (p.inRun ? `<circle class="pc-ring" ${c} r="8"/>` : '')
    + (p.selected ? `<circle class="pc-sel" ${c} r="12"/>` : '');
}

/** The SVG plot and its tooltip node. hrefFor(index) -> hash that selects that month. */
export function renderChart(m, { id, name = '', hrefFor = () => '' }) {
  const { W, H, L, R, T, B } = VB;
  const sid = esc(id);
  const ix = (i) => r2(m.x(i));
  const grid = m.ticks.map((t) => `<line class="pc-grid" x1="${L}" x2="${W - R}" y1="${r2(t.y)}" y2="${r2(t.y)}"/>`
    + `<text class="pc-tick" x="${L - 6}" y="${r2(t.y + 4)}" text-anchor="end">${t.text}</text>`).join('');
  const xs = [1, BASELINE_MONTHS, 12, MONTHS].map((i) => `<text class="pc-tick" x="${ix(i)}" y="${H - 10}" text-anchor="middle">${monthLabel(i)}</text>`).join('');
  const base = `<rect class="pc-base" x="${L}" y="${T}" width="${r2(BASELINE_MONTHS * m.step)}" height="${H - T - B}"/>`
    + `<text class="pc-label" x="${L + 4}" y="${T + 12}">Baseline ${BASE_SPAN}</text>`;
  const yp = r2(m.y(m.pbar));
  const last = m.points.at(-1);
  // Issue 46: the p̄ label is drawn last in the marks group, so its plot-coloured halo (app.css) masks the p line and
  // dots that pass through it (ACT-05, ACT-06). Same position; it was drawn under the marks before.
  const pbarLabel = `<text class="pc-label" x="${W - R - 32}" y="${r2(m.y(m.pbar) - 4)}" text-anchor="end">p̄ ${fmt4(m.pbar)}</text>`;
  const lines = `<line class="pc-pbar" x1="${L}" x2="${W - R}" y1="${yp}" y2="${yp}"/>`
    + (m.points.length ? `<path class="pc-ucl" d="${stepPath(m)}"/><path class="pc-line" d="${linePath(m)}"/>`
      + `<text class="pc-label ucl" x="${W - R - 2}" y="${r2(last.uclY - 4)}" text-anchor="end">UCL</text>` : '');
  const hits = m.points.map((p) => `<circle class="pt" cx="${r2(p.cx)}" cy="${r2(p.cy)}" r="${HIT_R}" fill="transparent"`
    + ` tabindex="${p.tab ? 0 : -1}" aria-label="${esc(p.aria)}" data-index="${p.index}" data-href="${esc(hrefFor(p.index))}"`
    + ` data-tip="${esc(p.tip)}" data-left="${p.left}" data-top="${p.top}" data-edge="${p.edge}"${p.selected ? ' aria-current="true"' : ''}/>`).join('');
  return `<div class="pchart-scroll" tabindex="-1"><div class="pchart-plot">`
    + `<svg class="pchart-svg" viewBox="0 0 ${W} ${H}" width="100%" role="group" aria-labelledby="pc-title-${sid}" aria-describedby="pc-sum-${sid}" focusable="false">`
    + `<title id="pc-title-${sid}">p-chart for ${name ? `${esc(name)} ` : ''}(${sid}), M1 to M${MONTHS}</title>`
    + `<g aria-hidden="true">${base}${grid}${xs}${lines}</g>`
    + `<g aria-hidden="true">${m.points.map(mark).join('')}${pbarLabel}</g>`
    + hits + '</svg><div class="pchart-tip" aria-hidden="true" hidden></div></div></div>'
    + '<p class="pchart-legend quiet"><span aria-hidden="true">▲</span> ' + ALERT_LABEL.ucl
    + ' · <span aria-hidden="true">◯</span> ' + `${ALERT_LABEL.run7} (every point of the run)`
    + ' · <span aria-hidden="true">┄</span> UCL (per month) · <span aria-hidden="true">—</span> p̄'
    + ` · Shaded: baseline ${BASE_SPAN}</p>`;
}

/** UIM-FR-08: the same numbers as the chart's point labels, one row per plotted point. */
export function renderChartTable(m, { id }) {
  const flags = (p) => [p.aboveUcl && FLAG.aboveUcl, p.inRun && FLAG.inRun, p.baseline && FLAG.baseline].filter(Boolean).join(', ') || '—';
  const rows = m.points.map((p) => `<tr data-index="${p.index}"${p.selected ? ' class="selected" tabindex="-1"' : ''}>`
    + `<th scope="row">${p.label} <span class="mono">${esc(p.month)}</span></th>`
    + `<td class="num">${fmtN(p.n)}</td><td class="num">${fmt4(p.p)}</td><td class="num">${fmt4(p.ucl)}</td>`
    + `<td class="num">${p.run}</td><td>${flags(p)}</td></tr>`).join('');
  return `<div class="table-wrap"><table class="pchart-table" aria-label="p-chart data for ${esc(id)}">`
    + `<caption class="sr-only">${esc(m.summary)}</caption><thead><tr><th scope="col">Month</th><th scope="col" class="num">n</th>`
    + '<th scope="col" class="num">p</th><th scope="col" class="num">UCL</th><th scope="col" class="num">Run</th><th scope="col">Flags</th></tr></thead>'
    + `<tbody>${rows}</tbody></table></div>`;
}

/** Inner HTML of the p-chart panel. m: chartModel output or null. table: show the table instead (local UI state). */
export function renderChartPanel(m, { id, name, table = false, hrefFor }) {
  if (!m || !m.points.length) return `<p class="eyebrow">P-CHART</p><p class="quiet">No p-chart: no receipts in the baseline (${BASE_SPAN}).</p>`;
  const sid = esc(id);
  return `<div class="pchart-head"><p class="eyebrow">P-CHART</p>`
    + `<button type="button" class="subtle-button" data-pchart-toggle aria-controls="pc-body-${sid}">${table ? 'Show as chart' : 'Show as table'}</button></div>`
    + `<p id="pc-sum-${sid}" class="quiet pchart-summary">${esc(m.summary)}</p>`
    + `<div id="pc-body-${sid}">${table ? renderChartTable(m, { id }) : renderChart(m, { id, name, hrefFor })}</div>`;
}

/** UIM-FR-09. alerts: engine alerts (newest first). Active first, then the rest, engine order kept in each part. */
export function alertRows(alerts = [], pchart, { metricLabel = (k) => k, month } = {}) {
  const plotted = new Set((pchart?.points ?? []).map((p) => p.index));
  const rows = alerts.map((a) => {
    const linkable = (a.type === 'ucl' || a.type === 'run7') && plotted.has(a.index);
    return { type: a.type, label: alertLabel(a, metricLabel), active: a.active === true, index: a.index, month: a.month,
      full: monthFull(a), detail: a.detail, ...(a.metric ? { metric: a.metric } : {}), linkable, selected: linkable && a.index === month };
  });
  return [...rows.filter((r) => r.active), ...rows.filter((r) => !r.active)];
}

/** Inner HTML of the alerts panel. escalate: escalation(s) ({ escalate, text }); the line is visible text (#46 L3). */
export function renderAlerts({ rows, hrefFor = () => '', escalate = { escalate: false } }) {
  const line = escalate.escalate
    ? `<p class="escalate-line"><span class="badge amber">▲ ESCALATE</span> <span class="mono">${esc(escalate.text)}</span></p>` : '';
  const item = (r) => {
    const what = `${esc(r.label)} <span class="mono">${esc(r.full)}</span>`;
    const head = r.linkable
      ? `<a class="text-link" data-alert-link data-index="${esc(r.index)}" href="${esc(hrefFor(r.index))}"${r.selected ? ' aria-current="true"' : ''}>${what}</a>`
      : `<span class="alert-what">${what}</span>`;
    return `<li><span class="dot${r.active ? '' : ' muted'}" aria-hidden="true"></span>`
      + (r.active ? '<strong class="alert-status">ACTIVE</strong> ' : '<span class="alert-status past">Past</span> ')
      + `${head} <span class="quiet alert-detail">${esc(r.detail)}</span>`
      + (r.active && r.type === 'scar_aging' ? ' <span class="quiet alert-pointer">See open SCARs.</span>' : '') + '</li>';
  };
  const list = rows.length ? `<ul class="alert-list">${rows.map(item).join('')}</ul>` : '<p class="quiet">No alerts.</p>';
  return `<p class="eyebrow">ALERTS (${rows.length})</p>${line}${list}`;
}

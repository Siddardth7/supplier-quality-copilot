// p-chart and alert list (#45; UIM-FR-06..-09, -11 `month`; UIM-AC-01, -02, -04; DESIGN-SPEC 5, 6, 7, 8, 9).
// Two kinds of fixture: hand-built engine-shaped pcharts and alerts (exact marks without a simulation) and real
// engine output from scorecard() on hand-made rows. Expected values are worked out by hand in the comments from
// docs/SCORECARD.md (§ p-chart, § Alerts) and PRD-06, never copied from output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scorecard, SCORECARD } from './engine.js';
import { parseHash, formatHash } from './route.js';
import { VB, HIT_R, MIN_PX, BASELINE_MONTHS, ALERT_LABEL, fmt4, monthLabel, monthFull, alertLabel, chartModel,
  renderChart, renderChartTable, renderChartPanel, alertRows, renderAlerts } from './chart.js';

// as_of 2026-11-01: M1 2025-05 ... M6 2025-10 (baseline), M7 2025-11 ... M18 2026-10.
const AS_OF = '2026-11-01';
const MONTH = Object.fromEntries(['2025-05', '2025-06', '2025-07', '2025-08', '2025-09', '2025-10', '2025-11',
  '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09',
  '2026-10'].map((m, i) => [i + 1, m]));
const ALL = Array.from({ length: 18 }, (_, i) => i + 1);

// ---- hand-built engine-shaped fixtures ----
const pt = (index, { n = 1000, p = 0.001, ucl = 0.004, above = false, run = 0 } = {}) =>
  ({ month: MONTH[index], index, n, p, ucl, above_ucl: above, run });
const al = (type, index, detail = 'd', extra = {}) => ({ type, month: MONTH[index], index, active: index === 18, detail, ...extra });
// ACT-03-like: p̄ 0.001; every month p = p̄ (not above, run 0) except M9: n 5,400, p 0.008 > UCL 0.004.
const ACT03 = { p_bar: 0.001, points: ALL.map((i) => (i === 9 ? pt(9, { n: 5400, p: 0.008, ucl: 0.004, above: true, run: 1 }) : pt(i))) };
const ACT03_ALERTS = [al('ucl', 9, 'p 0.0080 > UCL 0.0040')];
// ACT-02-like: M12..M18 at p 0.002 > p̄, runs 1..7; run7 fires at M18 (active).
const climb = (from) => ALL.map((i) => (i >= from ? pt(i, { p: 0.002, run: i - from + 1 }) : pt(i)));
const ACT02 = { p_bar: 0.001, points: climb(12) };
const ACT02_ALERTS = [al('run7', 18, '7 months above p̄ (M12–M18)')];
// Run of 8 from M11: runs 1..8, run7 fires at M17 (run 7) and M18 (run 8).
const RUN8 = { p_bar: 0.001, points: climb(11) };
const RUN8_ALERTS = [al('run7', 18, '8 months above p̄ (M11–M18)'), al('run7', 17, '7 months above p̄ (M11–M17)')];
// Gap: no receipts in M14. The engine counts plotted points: M11 1, M12 2, M13 3, M15 4, M16 5, M17 6, M18 7.
const GAP = { p_bar: 0.001, points: ALL.filter((i) => i !== 14).map((i) => (i >= 11 ? pt(i, { p: 0.002, run: i < 14 ? i - 10 : i - 11 }) : pt(i))) };
const GAP_ALERTS = [al('run7', 18, '7 months above p̄ (M11–M18)')];
const marked = (m) => m.points.filter((p) => p.inRun).map((p) => p.index);

// ---- real engine fixtures (row style of pchart.test.js) ----
const lot = (o = {}) => ({ date: '2026-10-15', supplier_id: 'ACT-01', part_no: 'P1', received_qty: 1000,
  rejected_qty: 0, on_time: 1, defect_found_at: 'none', failure_mode_code: null, scar_id: null,
  scar_opened: null, scar_closed: null, ...o });
const mrow = (k, rejected, n = 1000) => lot({ date: `${MONTH[k]}-15`, received_qty: n, rejected_qty: rejected,
  ...(rejected ? { defect_found_at: 'incoming', failure_mode_code: `FM-${k}` } : {}) });
// base: 1 of 1000 in M1..M6, so p̄ = 6/6000 = 0.001 and UCL(n 1000) = 0.001 + 3·√(0.001·0.999/1000) ≈ 0.0039985.
// mon: one symbol per month from M7, a digit = rejected of 1000, '-' = no receipts.
const series = (mon) => [...[1, 2, 3, 4, 5, 6].map((k) => mrow(k, 1)), ...[...mon].flatMap((s, i) => (s === '-' ? [] : [mrow(i + 7, Number(s))]))];
const real = (mon) => scorecard(series(mon), { as_of: AS_OF }).suppliers[0];
// M9 8/1000 = 0.008 > UCL: ucl alert at M9 (run 1, reset by M10 = 0). M12..M18 2/1000 = 0.002 > p̄: run7 at M18.
const STORY = real('008002222222');
// Same, but M11..M13 then no receipts in M14 then M15..M18: seven plotted points in a row, run7 at M18.
const STORY_GAP = real('0080222-2222');

// ---- HTML readers ----
const hitsIn = (html) => [...html.matchAll(/<circle class="pt"([^>]*)\/>/g)].map(([, a]) => Object.fromEntries(
  [...a.matchAll(/ ([a-z-]+)="([^"]*)"/g)].map(([, k, v]) => [k, v])));
const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const text = (html) => unesc(html.replace(/<[^>]+>/g, ''));
const pathOf = (html, cls) => html.match(new RegExp(`<path class="${cls}" d="([^"]*)"`))?.[1];
const CTX = { id: 'ACT-03', name: 'Name', hrefFor: (i) => formatHash({ view: 'monitor', active: 'ACT-03', month: i }) };

test('chartModel basics: null pchart, 18 slots, y axis from 0, four 4-dp ticks, all-zero display scale', () => {
  assert.equal(chartModel(null, []), null);
  const m = chartModel(ACT03, ACT03_ALERTS);
  // step = (720 - 56 - 12) / 18 = 652 / 18; x(i) = 56 + (i - 0.5)·step: x(1) = 56 + 18.111 = 74.111, x(18) = 689.889.
  const step = 652 / 18;
  assert.ok(Math.abs(m.x(1) - (56 + step / 2)) < 1e-9 && Math.abs(m.x(18) - (708 - step / 2)) < 1e-9);
  // ymax = 1.1 · max(p 0.008, UCL 0.004, p̄ 0.001) = 0.0088. y(0) = 260 - 32 = 228 (axis), y(ymax) = 16 (top).
  assert.ok(Math.abs(m.ymax - 0.0088) < 1e-12);
  assert.equal(m.y(0), 228);
  assert.ok(Math.abs(m.y(m.ymax) - 16) < 1e-9);
  assert.deepEqual(m.ticks.map((t) => t.text), ['0.0000', '0.0029', '0.0059', '0.0088']);
  assert.equal(m.ticks[0].y, 228);
  // ymax follows the data: doubling every value doubles it (no hard-coded scale).
  const big = { p_bar: 0.002, points: ACT03.points.map((p) => ({ ...p, p: p.p * 2, ucl: p.ucl * 2 })) };
  assert.ok(Math.abs(chartModel(big, []).ymax - 0.0176) < 1e-12);
  // All zero (p̄ = 0 so UCL = 0, no rejects): 0.001 is a display scale only. Lines sit on the axis.
  const zero = chartModel({ p_bar: 0, points: ALL.map((i) => pt(i, { p: 0, ucl: 0 })) }, []);
  assert.equal(zero.ymax, 0.001);
  assert.ok(zero.points.every((p) => p.cy === 228 && p.uclY === 228));
  assert.deepEqual(chartModel({ p_bar: 0.001, points: [] }, []).points, []);
  assert.equal(BASELINE_MONTHS, SCORECARD.baseline_months);
  assert.match(readFileSync(new URL('../docs/SCORECARD.md', import.meta.url), 'utf8'), new RegExp(`Baseline\\*\\* = M1–M${BASELINE_MONTHS}\\.`));
  assert.deepEqual([fmt4(0.00004), monthLabel(18), monthFull({ index: 18, month: '2026-10' })], ['0.0000', 'M18', 'M18 (2026-10)']);
});

test('UIM-FR-06 marks: triangle for above UCL, ring for every run7 point, both when both, dot otherwise', () => {
  const kinds = (html) => {
    const marks = html.match(/<g aria-hidden="true">((?:<path class="pc-tri"|<circle class="pc-(?:dot|ring|sel)")[\s\S]*?)<\/g>/)[1];
    return { tri: [...marks.matchAll(/<path class="pc-tri" d="M([\d.]+) /g)].map((x) => Number(x[1])),
      ring: [...marks.matchAll(/<circle class="pc-ring" cx="([\d.]+)"/g)].map((x) => Number(x[1])),
      dot: [...marks.matchAll(/<circle class="pc-dot( run)?" cx="([\d.]+)"/g)].map((x) => [Number(x[2]), !!x[1]]) };
  };
  const at = (m, i) => Math.round(m.x(i) * 100) / 100;
  // ACT-03-like: a triangle at M9 only, no ring; 17 cyan dots.
  const m3 = chartModel(ACT03, ACT03_ALERTS);
  const k3 = kinds(renderChart(m3, CTX));
  assert.deepEqual(k3.tri, [at(m3, 9)]);
  assert.deepEqual(k3.ring, []);
  assert.equal(k3.dot.length, 17);
  assert.ok(k3.dot.every(([, run]) => !run));
  // ACT-02-like: exactly M12..M18 ringed (amber dots inside), M11 and earlier not; no triangle.
  const m2 = chartModel(ACT02, ACT02_ALERTS);
  assert.deepEqual(marked(m2), [12, 13, 14, 15, 16, 17, 18]);
  const k2 = kinds(renderChart(m2, CTX));
  assert.deepEqual(k2.ring, [12, 13, 14, 15, 16, 17, 18].map((i) => at(m2, i)));
  assert.deepEqual(k2.tri, []);
  assert.deepEqual(k2.dot.filter(([, run]) => run).map(([x]) => x), k2.ring);
  // Both on one point (M18 above UCL and in the run): ring AND triangle, no dot; aria-label has both flags.
  const both = { p_bar: 0.001, points: ACT02.points.map((p) => (p.index === 18 ? { ...p, above_ucl: true } : p)) };
  const mb = chartModel(both, [...ACT02_ALERTS, al('ucl', 18)]);
  const kb = kinds(renderChart(mb, CTX));
  assert.deepEqual(kb.tri, [at(mb, 18)]);
  assert.ok(kb.ring.includes(at(mb, 18)));
  assert.ok(!kb.dot.some(([x]) => x === at(mb, 18)));
  assert.match(mb.points.at(-1).aria, /, above UCL, in a run above p̄$/);
  // Run of 8: two run7 alerts, the same 8 points M11..M18.
  assert.deepEqual(marked(chartModel(RUN8, RUN8_ALERTS)), [11, 12, 13, 14, 15, 16, 17, 18]);
  // A run7 alert at M17 alone (a past run): M11..M17, the back-walk from that alert's own run.
  assert.deepEqual(marked(chartModel(RUN8, [RUN8_ALERTS[1]])), [11, 12, 13, 14, 15, 16, 17]);
  // Gap: plotted points only, the engine's run back-walk across the missing M14.
  assert.deepEqual(marked(chartModel(GAP, GAP_ALERTS)), [11, 12, 13, 15, 16, 17, 18]);
  // The flags are read, not re-tested: p === UCL with above_ucl false gets no triangle; p above p̄ with run 0 no ring.
  const edge = chartModel({ p_bar: 0.001, points: [pt(7, { p: 0.004, ucl: 0.004 }), pt(8, { p: 0.003, run: 0 })] }, []);
  assert.deepEqual(edge.points.map((p) => [p.aboveUcl, p.inRun]), [[false, false], [false, false]]);
  assert.doesNotMatch(renderChart(edge, CTX), /pc-tri|pc-ring/);
  // Baseline: shaded, flagged, never marked.
  assert.deepEqual(m3.points.filter((p) => p.baseline).map((p) => p.index), [1, 2, 3, 4, 5, 6]);
});

test('UIM-FR-06 real engine: above_ucl equals a ucl alert at that month; the run7 run is the alert detail\'s span', () => {
  for (const s of [STORY, STORY_GAP]) {
    const m = chartModel(s.pchart, s.alerts);
    for (const p of m.points) {
      assert.equal(p.aboveUcl, s.alerts.some((a) => a.type === 'ucl' && a.index === p.index), `M${p.index}`);
      const r7 = s.alerts.some((a) => a.type === 'run7' && a.index === p.index);
      if (r7) assert.ok(p.inRun);
    }
    assert.deepEqual(m.points.filter((p) => p.aboveUcl).map((p) => p.index), [9]);
  }
  // Story: run7 detail "7 months above p̄ (M12–M18)" -> M12..M18. Gap story: "(M11–M18)" -> M11..M13, M15..M18.
  assert.equal(STORY.alerts.find((a) => a.type === 'run7').detail, '7 months above p̄ (M12–M18)');
  assert.deepEqual(marked(chartModel(STORY.pchart, STORY.alerts)), [12, 13, 14, 15, 16, 17, 18]);
  assert.equal(STORY_GAP.alerts.find((a) => a.type === 'run7').detail, '7 months above p̄ (M11–M18)');
  assert.deepEqual(marked(chartModel(STORY_GAP.pchart, STORY_GAP.alerts)), [11, 12, 13, 15, 16, 17, 18]);
});

test('UIM-FR-06 lines: UCL is a step line per plotted point, p line and UCL break at a gap, p̄ at y(p̄)', () => {
  const m = chartModel(GAP, GAP_ALERTS);
  const html = renderChart(m, CTX);
  const ucl = pathOf(html, 'pc-ucl');
  // 17 plotted points: 17 horizontal segments; risers only between adjacent months (16 joins minus the one at the gap).
  assert.equal([...ucl.matchAll(/H/g)].length, 17);
  assert.equal([...ucl.matchAll(/V/g)].length, 15);
  assert.equal([...ucl.matchAll(/M/g)].length, 2);  // the start, then a fresh subpath after the missing M14
  const r = (v) => String(Math.round(v * 100) / 100);
  for (const p of m.points) assert.ok(ucl.includes(r(p.uclY)), `UCL y for M${p.index}`);
  // The second subpath starts at M15's left edge: x(15) - step/2.
  assert.match(ucl, new RegExp(`M${r(m.x(15) - m.step / 2).replace('.', '\\.')} `));
  const line = pathOf(html, 'pc-line');
  assert.equal([...line.matchAll(/M/g)].length, 2);
  assert.equal([...line.matchAll(/L/g)].length, 15);
  assert.ok(!line.includes(`${r(m.x(14))} `));  // nothing drawn at M14
  // UCL changes with n: the step line has different heights (not one horizontal line).
  const m3 = chartModel(ACT03, ACT03_ALERTS);
  const u3 = pathOf(renderChart(m3, CTX), 'pc-ucl');
  assert.equal([...u3.matchAll(/V/g)].length, 17);
  assert.equal(new Set([...u3.matchAll(/V([\d.]+)/g)].map((x) => x[1])).size, 1);  // all at UCL 0.004 here
  const steps = chartModel({ p_bar: 0.001, points: [pt(7, { ucl: 0.004 }), pt(8, { ucl: 0.003 })] }, []);
  assert.match(pathOf(renderChart(steps, CTX), 'pc-ucl'), new RegExp(`^M[\\d.]+ ${r(steps.y(0.004))}H[\\d.]+V${r(steps.y(0.003))}H[\\d.]+$`));
  // p̄ line at y(p̄) across the plot, labelled with 4 decimals.
  assert.match(html, new RegExp(`<line class="pc-pbar" x1="56" x2="708" y1="${r(m.y(0.001))}" y2="${r(m.y(0.001))}"/>`));
  assert.match(html, />p̄ 0\.0010<\/text>/);
  // Baseline band: from the plot's left edge across six slots.
  assert.match(html, new RegExp(`<rect class="pc-base" x="56" y="16" width="${r(6 * m.step)}" height="212"/>`));
});

test('DS-FR-01: chart, table and alert markup use token classes, no hex colours; the new CSS uses var(--…) only', () => {
  const strip = (h) => h.replace(/&#\d+;|&#x[0-9a-f]+;/gi, '');
  const m = chartModel(ACT02, ACT02_ALERTS, { month: 12 });
  const out = renderChartPanel(m, { ...CTX, table: false }) + renderChartPanel(m, { ...CTX, table: true })
    + renderAlerts({ rows: alertRows(ACT02_ALERTS, ACT02), hrefFor: CTX.hrefFor, escalate: { escalate: true, text: 'run7' } });
  assert.doesNotMatch(strip(out), /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(out, /\b(?:fill|stroke)="(?!transparent")/);  // colour comes from classes; only the hit fill is set
  assert.doesNotMatch(out, /style=/);
  const css = readFileSync(new URL('./app.css', import.meta.url), 'utf8');
  const rules = css.split('\n').filter((l) => /^\.(pc-|pchart|pt\b|alert-|escalate-line|dot\.muted)|alert-mark/.test(l));
  assert.ok(rules.length >= 20);
  for (const l of rules) {
    assert.doesNotMatch(l, /#[0-9a-fA-F]{3,8}\b|rgb|hsl/, l);
    for (const c of l.matchAll(/(?:^|[;{])(?:fill|stroke|color|background):([^;}]+)/g)) assert.match(c[1], /^(var\(--[a-z0-9-]+\)|none)$/, l);
  }
});

test('UIM-FR-07 a11y markup: group SVG with unique ids, focusable hit circles r 15, one roving tab stop, aria-labels', () => {
  const m = chartModel(ACT03, ACT03_ALERTS);
  const html = renderChart(m, CTX);
  assert.match(html, /<svg class="pchart-svg" viewBox="0 0 720 260" width="100%" role="group" aria-labelledby="pc-title-ACT-03" aria-describedby="pc-sum-ACT-03" focusable="false">/);
  assert.match(html, /<title id="pc-title-ACT-03">p-chart for Name \(ACT-03\), M1 to M18<\/title>/);
  const panel = renderChartPanel(m, CTX);
  for (const idv of ['pc-title-ACT-03', 'pc-sum-ACT-03', 'pc-body-ACT-03']) assert.equal([...panel.matchAll(new RegExp(`id="${idv}"`, 'g'))].length, 1, idv);
  const hits = hitsIn(html);
  assert.equal(hits.length, 18);
  assert.ok(hits.every((h) => h.r === String(HIT_R) && h.fill === 'transparent' && h['aria-label'] && /^-?[01]$/.test(h.tabindex)));
  assert.equal(HIT_R, 15);
  // Decorative layers stay out of the accessibility tree: axes/grid/labels group, marks group, tooltip.
  assert.match(html, /<g aria-hidden="true"><rect class="pc-base"/);
  assert.match(html, /<div class="pchart-tip" aria-hidden="true" hidden><\/div>/);
  // Default tab stop: the last point (M18, the current month).
  assert.deepEqual(hits.filter((h) => h.tabindex === '0').map((h) => h['data-index']), ['18']);
  assert.ok(!html.includes('aria-current'));
  // Exact label for the known point (escaped in the attribute).
  assert.equal(unesc(hits[8]['aria-label']), 'M9 (2026-01): n 5,400, p 0.0080, UCL 0.0040, above UCL');
  assert.equal(unesc(hits[0]['aria-label']), 'M1 (2025-05): n 1,000, p 0.0010, UCL 0.0040, baseline');
  assert.equal(unesc(hits[8]['data-tip']), 'M9 (2026-01)\nn 5,400 · p 0.0080 · UCL 0.0040\nAbove UCL');
  assert.equal(unesc(hits[9]['data-tip']), 'M10 (2026-02)\nn 1,000 · p 0.0010 · UCL 0.0040');
  // Selecting a plotted month moves the tab stop there and marks it current; an unplotted month falls back to M18.
  const sel = hitsIn(renderChart(chartModel(ACT03, ACT03_ALERTS, { month: 9 }), CTX));
  assert.deepEqual(sel.filter((h) => h.tabindex === '0').map((h) => h['data-index']), ['9']);
  assert.deepEqual(sel.filter((h) => h['aria-current'] === 'true').map((h) => h['data-index']), ['9']);
  assert.equal(chartModel(ACT03, ACT03_ALERTS, { month: 9 }).selectedIndex, 9);
  const gap = chartModel(GAP, GAP_ALERTS, { month: 14 });
  assert.equal(gap.selectedIndex, null);
  assert.deepEqual(hitsIn(renderChart(gap, CTX)).filter((h) => h.tabindex === '0').map((h) => h['data-index']), ['18']);
  assert.ok(!hitsIn(renderChart(gap, CTX)).some((h) => h['data-index'] === '14'));
  // Each point carries its month's hash; parse it back.
  assert.deepEqual(parseHash(unesc(hits[8]['data-href'])).params, { active: 'ACT-03', month: 9 });
  // Marks sit in aria-hidden groups before the hit circles; hit circles are last. Exactly two hidden groups, back to
  // back after the title and straight before the first hit circle, and nothing before the hits is named or focusable
  // (the svg's own open tag is excluded: it carries the group role and labels). Issue 46 hardening.
  const svg = html.slice(html.indexOf('<svg'), html.indexOf('</svg>'));
  assert.equal(svg.match(/<g aria-hidden="true">/g).length, 2);
  assert.match(svg, /<\/title><g aria-hidden="true">.*<\/g><g aria-hidden="true">.*<\/g><circle class="pt"/s);
  assert.doesNotMatch(svg.slice(svg.indexOf('>') + 1, svg.indexOf('<circle class="pt"')), /aria-label|tabindex|role=/);
  assert.ok(html.lastIndexOf('</g>') < html.indexOf('<circle class="pt"'));
  assert.doesNotMatch(html.slice(0, html.indexOf('<circle class="pt"')), /tabindex="0"/);
  // Target size at the narrowest render: 2 · 15 · 600/720 = 25 px >= 24 px (DS-NFR-01).
  assert.ok(2 * HIT_R * (MIN_PX / VB.W) >= 24);
  assert.deepEqual(VB, { W: 720, H: 260, L: 56, R: 12, T: 16, B: 32 });
  // Tooltip placement stays in the box: edges and a high point flip.
  const ps = chartModel(ACT03, ACT03_ALERTS).points;
  assert.equal(ps[0].edge, 'edge-l');
  assert.equal(ps[17].edge, 'edge-r');
  assert.equal(ps[8].edge, 'below');  // M9 is the highest point: cy = y(0.008) ≈ 35
  assert.equal(ps[8].left, (m.x(9) / 720 * 100).toFixed(2));
});

test('UIM-FR-08 text alternative: the summary names p̄, the above-UCL months and the run spans', () => {
  assert.equal(chartModel(ACT02, ACT02_ALERTS).summary, 'p̄ 0.0010 (M1–M6). Above UCL: none. 7 in a row above p̄: M12–M18.');
  assert.equal(chartModel(ACT03, ACT03_ALERTS).summary, 'p̄ 0.0010 (M1–M6). Above UCL: M9. 7 in a row above p̄: none.');
  // A run broken by a missing month is still one run by array adjacency (the engine's count).
  assert.equal(chartModel(GAP, GAP_ALERTS).summary, 'p̄ 0.0010 (M1–M6). Above UCL: none. 7 in a row above p̄: M11–M18.');
  assert.equal(chartModel(STORY.pchart, STORY.alerts).summary, 'p̄ 0.0010 (M1–M6). Above UCL: M9. 7 in a row above p̄: M12–M18.');
  const panel = renderChartPanel(chartModel(ACT03, ACT03_ALERTS), CTX);
  assert.match(panel, /<p id="pc-sum-ACT-03" class="quiet pchart-summary">p̄ 0\.0010 \(M1–M6\)\. Above UCL: M9\. 7 in a row above p̄: none\.<\/p>/);
  // The legend says each mark in words; the glyphs are hidden.
  assert.match(panel, /<p class="pchart-legend quiet"><span aria-hidden="true">▲<\/span> Above UCL · <span aria-hidden="true">◯<\/span> 7 in a row above p̄/);
});

test('UIM-FR-08 / UIM-AC-04 table: one row per plotted point with the chart\'s own n, p and UCL strings', () => {
  for (const [pc, alerts, month] of [[ACT03, ACT03_ALERTS, 9], [GAP, GAP_ALERTS, 15], [STORY.pchart, STORY.alerts, undefined]]) {
    const m = chartModel(pc, alerts, { month });
    const table = renderChartTable(m, { id: 'ACT-03' });
    const rows = [...table.matchAll(/<tr data-index="(\d+)"([^>]*)><th scope="row">(M\d+) <span class="mono">([^<]*)<\/span><\/th><td class="num">([^<]*)<\/td><td class="num">([^<]*)<\/td><td class="num">([^<]*)<\/td><td class="num">([^<]*)<\/td><td>([^<]*)<\/td><\/tr>/g)];
    assert.equal(rows.length, pc.points.length);
    // "Same numbers": parse the chart's aria-labels and compare n, p, UCL per month.
    const labels = Object.fromEntries(hitsIn(renderChart(m, CTX)).map((h) => [h['data-index'], unesc(h['aria-label'])]));
    for (const [, idx, attrs, label, mon, n, p, ucl, run, flags] of rows) {
      const src = pc.points.find((x) => x.index === Number(idx));
      assert.ok(labels[idx].startsWith(`${label} (${mon}): n ${n}, p ${p}, UCL ${ucl}`), labels[idx]);
      assert.equal(/above UCL/.test(labels[idx]), /Above UCL/.test(flags));
      assert.equal(/in a run/.test(labels[idx]), /In run/.test(flags));
      assert.equal(Number(run), src.run);
      assert.equal(n, src.n.toLocaleString('en-US'));
      if (src.index <= 6) assert.match(flags, /Baseline/);
      assert.equal(/class="selected" tabindex="-1"/.test(attrs), src.index === month);
    }
    assert.equal([...table.matchAll(/tabindex=/g)].length, pc.points.some((x) => x.index === month) ? 1 : 0);
  }
  const t = renderChartTable(chartModel(ACT02, ACT02_ALERTS), { id: 'ACT-02' });
  assert.match(t, /<tr data-index="9"><th scope="row">M9 <span class="mono">2026-01<\/span><\/th><td class="num">1,000<\/td><td class="num">0\.0010<\/td><td class="num">0\.0040<\/td><td class="num">0<\/td><td>—<\/td><\/tr>/);
  assert.match(t, /<tr data-index="18">[\s\S]*?<td class="num">7<\/td><td>In run above p̄<\/td><\/tr>/);
  assert.match(t, /<caption class="sr-only">p̄ 0\.0010 \(M1–M6\)\. Above UCL: none\. 7 in a row above p̄: M12–M18\.<\/caption>/);
  assert.match(t, /<table class="pchart-table" aria-label="p-chart data for ACT-02">/);
  assert.match(renderChartTable(chartModel(ACT03, ACT03_ALERTS), { id: 'x' }), /<td>Above UCL<\/td>/);
  assert.match(renderChartTable(chartModel(ACT03, ACT03_ALERTS), { id: 'x' }), /M1 <span class="mono">2025-05<\/span><\/th>[\s\S]*?<td>Baseline<\/td>/);
});

test('UIM-FR-08 panel: the toggle renders one representation; empty chart text has no toggle and no svg', () => {
  const m = chartModel(ACT03, ACT03_ALERTS);
  const chart = renderChartPanel(m, { ...CTX, table: false });
  const table = renderChartPanel(m, { ...CTX, table: true });
  assert.match(chart, /<button type="button" class="subtle-button" data-pchart-toggle aria-controls="pc-body-ACT-03">Show as table<\/button>/);
  assert.match(table, /data-pchart-toggle aria-controls="pc-body-ACT-03">Show as chart<\/button>/);
  assert.ok(chart.includes('<svg') && !chart.includes('<table'));
  assert.ok(table.includes('<table') && !table.includes('<svg'));
  assert.doesNotMatch(chart + table, /aria-pressed/);
  for (const empty of [null, chartModel({ p_bar: 0.001, points: [] }, [])]) {
    const e = renderChartPanel(empty, CTX);
    assert.equal(e, '<p class="eyebrow">P-CHART</p><p class="quiet">No p-chart: no receipts in the baseline (M1–M6).</p>');
  }
});

test('UIM-FR-09 alert rows: labels, active first then past in engine order, links only for plotted ucl/run7', () => {
  const metricLabel = (k) => ({ repeat_nc: 'Repeat NC', otd: 'On-time' })[k] ?? k;
  assert.deepEqual(['ucl', 'run7', 'tier_drop', 'scar_aging'].map((type) => alertLabel({ type })), ['Above UCL', '7 in a row above p̄', 'Tier drop', 'SCAR > 60 days']);
  assert.equal(alertLabel({ type: 'metric_bad', metric: 'repeat_nc' }, metricLabel), 'Repeat NC bad');
  assert.equal(alertLabel({ type: 'metric_bad', metric: 'weird_key' }, metricLabel), 'weird_key bad');
  assert.equal(alertLabel({ type: 'metric_bad' }), 'Metric bad');
  assert.equal(alertLabel({ type: 'new_type' }), 'new_type');
  // Mixed input (an engine change or another policy could put a past alert first): active ones lead, order kept inside.
  const input = [al('ucl', 9, 'p 0.0080 > UCL 0.0040'), al('run7', 18, 'r'), al('tier_drop', 12, 'B → C'),
    al('metric_bad', 18, 'Repeat NC 40 > 20', { metric: 'repeat_nc' }), al('scar_aging', 11, 'SCAR-0412 open 78 days'),
    al('metric_bad', 18, 'On-time 70 < 85', { metric: 'otd' }), al('ucl', 14, 'p 0.01 > UCL 0.004')];
  const pc = { p_bar: 0.001, points: ALL.filter((i) => i !== 14).map((i) => pt(i)) };  // no M14 point
  const rows = alertRows(input, pc, { metricLabel, month: 9 });
  assert.deepEqual(rows.map((r) => `${r.type}@${r.index}`), ['run7@18', 'metric_bad@18', 'metric_bad@18', 'ucl@9', 'tier_drop@12', 'scar_aging@11', 'ucl@14']);
  assert.deepEqual(rows.map((r) => r.active), [true, true, true, false, false, false, false]);
  assert.deepEqual(rows.map((r) => r.label), ['7 in a row above p̄', 'Repeat NC bad', 'On-time bad', 'Above UCL', 'Tier drop', 'SCAR > 60 days', 'Above UCL']);
  assert.deepEqual(rows.map((r) => r.linkable), [true, false, false, true, false, false, false]);  // ucl@14 has no point
  assert.deepEqual(rows.map((r) => r.selected), [false, false, false, true, false, false, false]);
  assert.equal(rows[3].full, 'M9 (2026-01)');
  assert.deepEqual(alertRows(input, null).map((r) => r.linkable), Array(7).fill(false));
  // Rendered: count of all alerts, status word always present, links carry active + month and keep role and policy.
  const hrefFor = (i) => formatHash({ view: 'monitor', role: 'junior', policy: 'p1.x-1_y', active: 'ACT-03', month: i });
  const html = renderAlerts({ rows, hrefFor });
  assert.match(html, /^<p class="eyebrow">ALERTS \(7\)<\/p><ul class="alert-list">/);
  assert.equal([...html.matchAll(/<strong class="alert-status">ACTIVE<\/strong>/g)].length, 3);
  assert.equal([...html.matchAll(/<span class="alert-status past">Past<\/span>/g)].length, 4);
  assert.equal([...html.matchAll(/<span class="dot" aria-hidden="true"><\/span>/g)].length, 3);
  assert.equal([...html.matchAll(/<span class="dot muted" aria-hidden="true"><\/span>/g)].length, 4);
  const links = [...html.matchAll(/<a class="text-link" data-alert-link data-index="(\d+)" href="([^"]*)"([^>]*)>([\s\S]*?)<\/a>/g)];
  assert.deepEqual(links.map((l) => l[1]), ['18', '9']);
  assert.deepEqual(parseHash(unesc(links[1][2])), { view: 'monitor', role: 'junior', params: { policy: 'p1.x-1_y', active: 'ACT-03', month: 9 } });
  assert.equal(links[1][3], ' aria-current="true"');
  assert.equal(text(links[1][4]), 'Above UCL M9 (2026-01)');
  assert.match(html, /<span class="alert-what">Tier drop <span class="mono">M12 \(2026-04\)<\/span><\/span> <span class="quiet alert-detail">B → C<\/span>/);
  assert.match(html, /<span class="alert-what">Above UCL <span class="mono">M14 \(2026-06\)<\/span><\/span>/);  // no point: no link
  // Detail verbatim and escaped.
  const x = renderAlerts({ rows: alertRows([al('metric_bad', 18, '<b>DPPM</b> 2500 > 2000', { metric: '<i>' })], null) });
  assert.match(x, /&lt;i&gt; bad[\s\S]*&lt;b&gt;DPPM&lt;\/b&gt; 2500 &gt; 2000/);
  assert.doesNotMatch(x, /<b>|<i>/);
  assert.match(renderAlerts({ rows: [] }), /^<p class="eyebrow">ALERTS \(0\)<\/p><p class="quiet">No alerts\.<\/p>$/);
  // Active scar_aging points at the SCAR panel; a past one does not.
  assert.match(renderAlerts({ rows: alertRows([al('scar_aging', 18, 'SCAR-1 open 61 days')], null) }), /SCAR-1 open 61 days<\/span> <span class="quiet alert-pointer">See open SCARs\.<\/span><\/li>/);
  assert.doesNotMatch(renderAlerts({ rows: alertRows([al('scar_aging', 17, 'SCAR-1 open 61 days')], null) }), /See open SCARs/);
});

test('#46 L3: Escalate reasons are visible text at the top of the alerts panel', () => {
  const rows = alertRows([al('scar_aging', 18, 'SCAR-1 open 70 days')], null);
  const why = 'Tier C; scar_aging; metric_bad (repeat_nc, scar_aging)';
  const html = renderAlerts({ rows, escalate: { escalate: true, text: why } });
  assert.match(html, /^<p class="eyebrow">ALERTS \(1\)<\/p><p class="escalate-line"><span class="badge amber">▲ ESCALATE<\/span> <span class="mono">Tier C; scar_aging; metric_bad \(repeat_nc, scar_aging\)<\/span><\/p>/);
  assert.ok(text(html).includes(why));
  assert.doesNotMatch(html, /title=|sr-only/);
  assert.doesNotMatch(renderAlerts({ rows, escalate: { escalate: false, text: '' } }), /ESCALATE/);
  assert.match(renderAlerts({ rows: [], escalate: { escalate: true, text: 'Tier C' } }), /ESCALATE<\/span> <span class="mono">Tier C<\/span><\/p><p class="quiet">No alerts\.<\/p>/);
  assert.match(renderAlerts({ rows: [], escalate: { escalate: true, text: '<x>' } }), /&lt;x&gt;/);
});

test('XSS: id, name and month text are escaped in the chart, table and panel', () => {
  const X = '"><img src=x>';
  const pc = { p_bar: 0.001, points: [{ ...pt(7), month: X }] };
  const m = chartModel(pc, []);
  const html = renderChartPanel(m, { id: X, name: X, hrefFor: () => X }) + renderChartPanel(m, { id: X, name: X, table: true });
  assert.doesNotMatch(html, /<img/);
  assert.ok([...html.matchAll(/&quot;&gt;&lt;img src=x&gt;/g)].length >= 6);
});

test('docs parity: PRD-06 alert representation labels equal ALERT_LABEL', () => {
  const md = readFileSync(new URL('../docs/product/PRD-06-ui-monitor.md', import.meta.url), 'utf8');
  for (const [type, label] of Object.entries(ALERT_LABEL)) assert.ok(md.includes(`| \`${type}\` | ${label} |`), type);
  assert.ok(md.includes('| `metric_bad` | `<metric>` bad |'));
  assert.deepEqual(Object.keys(ALERT_LABEL).concat('metric_bad'), SCORECARD.alerts.types);
});

test('hygiene: chart.js is pure, imports html.js only, never monitor.js or the engine', () => {
  const src = readFileSync(new URL('./chart.js', import.meta.url), 'utf8');
  const imports = [...src.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]);
  assert.deepEqual(imports, ['./html.js']);
  assert.doesNotMatch(src, /\bdocument\b|\bwindow\b|fetch\(|STARK_REFERENCE|\.limits|\.tiers|\.weights|Math\.sqrt/);
});

// ---- QA additions (stage 3, #45): rules the tests above did not pin ----

test('QA run members come from each run7 alert\'s own run, not a fixed 7 (run of 10 = ACT-06 shape)', () => {
  // Only the M18 alert of a run of 8 (run 8): the back-walk covers M11..M18, one more than a fixed 7 would.
  assert.deepEqual(marked(chartModel(RUN8, [RUN8_ALERTS[0]])), [11, 12, 13, 14, 15, 16, 17, 18]);
  // Run of 10 from M9 (runs 1..10): run7 fires at M15, M16, M17, M18 (run >= 7), so four alerts and ten points.
  const RUN10 = { p_bar: 0.001, points: climb(9) };
  const a10 = [18, 17, 16, 15].map((i) => al('run7', i, `${i - 8} months above p̄ (M9–M${i})`));
  const m = chartModel(RUN10, a10);
  assert.deepEqual(marked(m), [9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
  assert.match(m.summary, /7 in a row above p̄: M9–M18\.$/);
  assert.equal([...renderChart(m, CTX).matchAll(/class="pc-ring"/g)].length, 10);
  const html = renderAlerts({ rows: alertRows(a10, RUN10), hrefFor: CTX.hrefFor });
  assert.deepEqual([...html.matchAll(/data-alert-link data-index="(\d+)"/g)].map((x) => x[1]), ['18', '17', '16', '15']);
  // Real engine: M9..M18 at 2/1000 > p̄ gives four run7 alerts (M15..M18) and the same ten members.
  const s = real('002222222222');
  assert.deepEqual(s.alerts.filter((a) => a.type === 'run7').map((a) => a.index), [18, 17, 16, 15]);
  assert.deepEqual(marked(chartModel(s.pchart, s.alerts)), [9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
});

test('QA summary: several above-UCL months join with ", ", several runs with "; ", a one-point run is one label', () => {
  // Hand-built (a real chart cannot hold two runs of 7 after the baseline): run7 at M12 with run 2, at M16 with run 1.
  const points = ALL.map((i) => pt(i, { above: i === 8 || i === 10, run: { 11: 1, 12: 2, 16: 1 }[i] ?? 0 }));
  const m = chartModel({ p_bar: 0.001, points }, [al('run7', 12), al('run7', 16)]);
  assert.equal(m.summary, 'p̄ 0.0010 (M1–M6). Above UCL: M8, M10. 7 in a row above p̄: M11–M12; M16.');
});

test('QA tooltip placement: edge-l exactly M1–M3, edge-r exactly M16–M18, flip below at cy < 100 (boundary 100 stays above)', () => {
  // Flat chart: every point sits low (cy ≈ 180), so only the edge classes apply.
  const flat = chartModel({ p_bar: 0.001, points: ALL.map((i) => pt(i)) }, []);
  assert.ok(flat.points.every((p) => p.cy > 100));
  assert.deepEqual(flat.points.map((p) => p.edge), ALL.map((i) => (i <= 3 ? 'edge-l' : i >= 16 ? 'edge-r' : '')));
  // A tall M7 (p 0.01) fixes ymax = 0.011. y(v) = 16 + 212·(1 - v/ymax) = 100 at v = ymax·128/212.
  const tall = chartModel({ p_bar: 0.001, points: [pt(7, { p: 0.01 })] }, []);
  const v100 = tall.ymax * 128 / 212;
  assert.equal(tall.y(v100), 100);
  const v99 = tall.ymax * 129 / 212;  // y = 99
  const m = chartModel({ p_bar: 0.001, points: [pt(1, { p: v99 }), pt(2, { p: v100 }), pt(7, { p: 0.01 }), pt(9, { p: v100 }),
    pt(10, { p: v99 }), pt(17, { p: v99 }), pt(18, { p: v100 })] }, []);
  assert.deepEqual(m.points.map((p) => [p.index, Math.round(p.cy * 1e6) / 1e6, p.edge]), [
    [1, 99, 'edge-l below'], [2, 100, 'edge-l'], [7, 35.272727, 'below'], [9, 100, ''], [10, 99, 'below'], [17, 99, 'edge-r below'], [18, 100, 'edge-r']]);
  // data-left / data-top are the point's percent of the 720 x 260 box, 2 dp.
  const hits = hitsIn(renderChart(m, CTX));
  for (const [k, p] of m.points.entries()) {
    assert.equal(hits[k]['data-left'], (p.cx / 720 * 100).toFixed(2));
    assert.equal(hits[k]['data-top'], (p.cy / 260 * 100).toFixed(2));
    assert.equal(hits[k]['data-edge'], p.edge);
  }
});

test('QA p̄ = 0 (real engine): UCL and p̄ on the axis, ymax from the largest p, any reject month is a triangle', () => {
  // Baseline M1..M6 with no rejects: p̄ = 0, so UCL = 0 every month (SCORECARD.md). M9 1/1000 and M14 3/1000 are above it.
  const rows = [...[1, 2, 3, 4, 5, 6].map((k) => mrow(k, 0)), ...[7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18].map((k) => mrow(k, { 9: 1, 14: 3 }[k] ?? 0))];
  const s = scorecard(rows, { as_of: AS_OF }).suppliers[0];
  assert.equal(s.pchart.p_bar, 0);
  const m = chartModel(s.pchart, s.alerts);
  assert.ok(Math.abs(m.ymax - 0.0033) < 1e-12);  // 1.1 · 0.003
  assert.ok(m.points.every((p) => p.uclY === 228));
  assert.deepEqual(m.points.filter((p) => p.aboveUcl).map((p) => p.index), [9, 14]);
  const html = renderChart(m, CTX);
  assert.match(html, /<line class="pc-pbar" x1="56" x2="708" y1="228" y2="228"\/>/);
  assert.ok([...pathOf(html, 'pc-ucl').matchAll(/[MV][\d.]+ ?([\d.]*)/g)].every((x) => x[0].startsWith('V') ? x[0] === 'V228' : x[1] === '228'));
  assert.equal([...html.matchAll(/class="pc-tri"/g)].length, 2);
  assert.equal(m.summary, 'p̄ 0.0000 (M1–M6). Above UCL: M9, M14. 7 in a row above p̄: none.');
});

test('QA marks: the triangle points up, the selected point gets one cyan ring, nothing selected without a plotted month', () => {
  const m = chartModel(ACT03, ACT03_ALERTS, { month: 9 });
  const html = renderChart(m, CTX);
  const [, ax, ay, rx, ry, lx, ly] = html.match(/<path class="pc-tri" d="M([\d.]+) ([\d.]+)L([\d.]+) ([\d.]+)L([\d.]+) ([\d.]+)Z"/).map(Number);
  const p9 = m.points[8];
  assert.ok(Math.abs(ax - p9.cx) < 0.01 && ay < p9.cy && ry > p9.cy && ly === ry && rx > p9.cx && lx < p9.cx);
  assert.deepEqual([...html.matchAll(/<circle class="pc-sel" cx="([\d.]+)" cy="([\d.]+)" r="12"\/>/g)].map((x) => Number(x[1])), [Math.round(p9.cx * 100) / 100]);
  assert.doesNotMatch(renderChart(chartModel(ACT03, ACT03_ALERTS), CTX), /pc-sel/);
  assert.doesNotMatch(renderChart(chartModel(GAP, GAP_ALERTS, { month: 14 }), CTX), /pc-sel|aria-current/);
});

test('QA axes: x labels M1, M6, M12, M18 at their slots; tick labels and the baseline label are in the svg', () => {
  const m = chartModel(ACT03, ACT03_ALERTS);
  const html = renderChart(m, CTX);
  const xl = [...html.matchAll(/<text class="pc-tick" x="([\d.]+)" y="250" text-anchor="middle">(M\d+)<\/text>/g)];
  assert.deepEqual(xl.map((x) => [x[2], Number(x[1])]), [1, 6, 12, 18].map((i) => [`M${i}`, Math.round(m.x(i) * 100) / 100]));
  assert.deepEqual([...html.matchAll(/text-anchor="end">(0\.\d{4})<\/text>/g)].map((x) => x[1]), ['0.0000', '0.0029', '0.0059', '0.0088']);
  assert.match(html, /<text class="pc-label" x="60" y="28">Baseline M1–M6<\/text>/);
  // The UCL label sits at the right end, just above the last point's UCL.
  assert.match(html, new RegExp(`<text class="pc-label ucl" x="706" y="${Math.round((m.points[17].uclY - 4) * 100) / 100}" text-anchor="end">UCL</text>`));
});

test('QA 24 px target: the CSS min-width the arithmetic relies on is MIN_PX, and the hit circles sit last, r = HIT_R', () => {
  const css = readFileSync(new URL('./app.css', import.meta.url), 'utf8');
  assert.match(css, new RegExp(`\\.pchart-plot\\{position:relative;min-width:${MIN_PX}px\\}`));
  assert.match(css, /\.pchart-svg\{display:block;width:100%;height:auto;/);
  // Below the boundary: r 14 would give 2·14·600/720 = 23.3 px.
  assert.ok(2 * 14 * (MIN_PX / VB.W) < 24 && 2 * HIT_R * (MIN_PX / VB.W) >= 24);
});

test('DS-NFR-02 chart text: the SVG font size in viewBox units renders >= 11 px at MIN_PX wide', () => {
  const css = readFileSync(new URL('./app.css', import.meta.url), 'utf8');
  const size = Number(css.match(/\.pchart-svg text\{font:([\d.]+)px /)[1]);
  assert.ok(size * MIN_PX / VB.W >= 11, `${size} units -> ${size * MIN_PX / VB.W} px`);
});

test('issue 46 p̄ label: labels and ticks carry a plot-coloured halo and the p̄ label is drawn above the marks, so it stays readable', () => {
  const css = readFileSync(new URL('./app.css', import.meta.url), 'utf8');
  const rule = css.match(/^\.pchart-svg \.pc-label,\.pchart-svg \.pc-tick\{([^}]*)\}/m);
  assert.ok(rule, 'one rule covers .pc-label and .pc-tick');
  assert.match(rule[1], /(?:^|;)paint-order:stroke(?:;|$)/);
  assert.match(rule[1], /(?:^|;)stroke:var\(--bg-plot\)(?:;|$)/);  // the plot background token, not a literal
  assert.match(rule[1], /(?:^|;)stroke-width:3px(?:;|$)/);
  // Same position, drawn last in the marks group: after every dot, so the halo masks a line or dot under the text
  // instead of the dot painting over it (decision 176). Exactly one p̄ label.
  const html = renderChart(chartModel(ACT03, ACT03_ALERTS), CTX);
  assert.match(html, /<\/g><g aria-hidden="true"><circle class="pc-dot"[^]*<circle class="pc-dot"[^>]*\/><text class="pc-label" x="676" y="[\d.]+" text-anchor="end">p̄ 0\.0010<\/text><\/g><circle class="pt"/);
  assert.equal(html.match(/>p̄ /g).length, 1);
});

test('QA alert ordering on real engine output: active first, then past newest first, engine order kept', () => {
  for (const s of [STORY, STORY_GAP, real('002222222222')]) {
    const rows = alertRows(s.alerts, s.pchart);
    const firstPast = rows.findIndex((r) => !r.active);
    assert.ok(rows.slice(firstPast === -1 ? rows.length : firstPast).every((r) => !r.active));
    const past = rows.filter((r) => !r.active).map((r) => r.index);
    assert.deepEqual(past, [...past].sort((a, b) => b - a));
    // Within a partition the engine's own order survives (a stable filter, no re-sort).
    assert.deepEqual(rows.filter((r) => r.active).map((r) => r.type + r.index), s.alerts.filter((a) => a.active).map((a) => a.type + a.index));
    assert.deepEqual(rows.filter((r) => !r.active).map((r) => r.type + r.index), s.alerts.filter((a) => !a.active).map((a) => a.type + a.index));
  }
  const story = alertRows(STORY.alerts, STORY.pchart);
  assert.equal(`${story[0].type}@${story[0].index}`, 'run7@18');
  assert.ok(story.find((r) => r.type === 'ucl').active === false && story.at(-1).index <= 9);
});

test('QA escaping: alert month and type label, data-tip keeps its line breaks but escapes markup', () => {
  const X = '<i>"x"&';
  const pc = { p_bar: 0.001, points: [pt(7)] };
  const rows = alertRows([{ type: 'ucl', month: X, index: 7, active: true, detail: 'd' }, { type: X, month: X, index: 8, active: false, detail: 'd' }], pc);
  const html = renderAlerts({ rows, hrefFor: () => `#a="${X}"` });
  assert.doesNotMatch(html, /<i>|"x"/);
  assert.equal([...html.matchAll(/&lt;i&gt;&quot;x&quot;&amp;/g)].length, 4);  // linked month, href, raw type label, plain month
  const m = chartModel({ p_bar: 0.001, points: [{ ...pt(7), month: X }] }, []);
  const hit = hitsIn(renderChart(m, { ...CTX, name: X }))[0];
  assert.equal(unesc(hit['data-tip']), `M7 (${X})\nn 1,000 · p 0.0010 · UCL 0.0040`);
  assert.ok(hit['data-tip'].includes('\n') && !hit['data-tip'].includes('<'));
  assert.match(renderChart(m, { ...CTX, id: 'A&B', name: X }), /<title id="pc-title-A&amp;B">p-chart for &lt;i&gt;&quot;x&quot;&amp; \(A&amp;B\), M1 to M18<\/title>/);
});

test('QA alertRows reads the engine fields: `active` as given, `selected` only on a linkable row', () => {
  // A non-linkable alert in the selected month is not selected (only ucl/run7 rows select their point).
  const rows = alertRows([al('tier_drop', 9, 'B → C'), al('ucl', 9)], ACT03, { month: 9 });
  assert.deepEqual(rows.map((r) => [r.type, r.linkable, r.selected]), [['tier_drop', false, false], ['ucl', true, true]]);
  // The UI never recomputes `active` from the month: an M18 alert marked past stays past.
  const r = alertRows([{ ...al('ucl', 18), active: false }, { ...al('ucl', 17), active: true }], ACT03);
  assert.deepEqual(r.map((x) => [x.index, x.active]), [[17, true], [18, false]]);
});

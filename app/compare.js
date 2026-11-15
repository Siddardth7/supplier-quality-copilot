// Compare view (issue 108; PRD-11 UIC-FR-01..10; DESIGN-SPEC 4.6, 4.9; decisions 95-103).
// Pure: no DOM. Computes no decision, score or problem order of its own: decision, total, rfi_items and audit_focus
// are engine fields, read from the model already scored under the active policy. Order is the engine decision, then
// the engine total, then numeric ID. The only arithmetic is toFixed display rounding (via detailModel).
import { esc, errorPanel, formatError } from './html.js';
import { formatHash } from './route.js';
import { routeLine } from './shell.js';
import { sheetPart } from './model.js';
import { requirementName } from './criteria.js';
import { categoryBars, commodityLabel, decisionBadge, detailModel, queueHref } from './queue.js';

export const SOURCING_LINE = 'Quality decides who is acceptable. Sourcing picks among them.';

const RANK = { APPROVED: 0, CONDITIONAL: 1, 'NOT APPROVED': 2 };
const byId = (a, b) => a.id.localeCompare(b.id, 'en', { numeric: true });
const byDecision = (a, b) => (RANK[a.evaluation.decision] - RANK[b.evaluation.decision])
  || (b.evaluation.total - a.evaluation.total) || byId(a, b);
const nameOf = (id) => requirementName(id) ?? id;
const plural = (n, one, many) => (n === 1 ? one : many);

/** Pure. model: buildModel() output, non-null, model.suppliers.ok true. part: hash value or undefined.
 *  Returns { parts, notFound, current, unplaced } (decisions 96, 98, 101). */
export function compareModel(model, { role = 'senior', policy, part } = {}) {
  const ctx = { role, params: { policy } };
  const groups = new Map();  // part number -> candidates, in suppliers.json order
  let unplaced = 0;
  for (const c of model.candidates) {
    const p = sheetPart(model, c.commodity);  // decision 24: the sheet's part number, never candidate.part
    if (p === null) { unplaced += 1; continue; }
    if (!groups.has(p)) groups.set(p, []);
    groups.get(p).push(c);
  }
  const keys = [...groups.keys()].sort((a, b) => (groups.get(b).length - groups.get(a).length) || (a < b ? -1 : 1));
  const notFound = part !== undefined && !groups.has(part) ? part : null;
  const cur = groups.has(part) ? part : keys[0] ?? null;
  const sheetName = (p) => model.sheets[groups.get(p)[0].commodity]?.value?.part_name ?? '';
  const parts = keys.map((p) => ({ part: p, label: commodityLabel(groups.get(p)[0].commodity), name: sheetName(p),
    count: groups.get(p).length, current: p === cur }));
  if (cur === null) return { parts, notFound, current: null, unplaced };

  const all = groups.get(cur);
  const bidder = (c) => {
    const ev = c.evaluation;
    const d = detailModel(c, { part: cur, role, params: ctx.params });
    const failed = ev.knockouts.failed;
    return { id: c.id, name: c.name, source: c.source, decision: ev.decision, total: d.total, signs: d.signs.label,
      conditions: ev.decision === 'CONDITIONAL' ? [...ev.rfi_items] : [],
      problems: ev.audit_focus.slice(0, 2).map(nameOf),  // decision 99: the engine's own ranking
      categories: d.categories, policy: d.policy, href: queueHref(ctx, { supplier: c.id }),
      reason: ev.decision !== 'NOT APPROVED' ? null
        : failed.length ? `Knockout failed: ${failed.map(nameOf).join('; ')}` : `Below pass mark ${model.pass.conditional}` };
  };
  const scored = all.filter((c) => c.status === 'scored').sort(byDecision).map(bidder);  // filter() copies: model untouched
  const unscored = all.filter((c) => c.status !== 'scored').sort(byId).map((c) => ({ id: c.id, name: c.name, source: c.source,
    status: c.status, href: queueHref(ctx, { supplier: c.id }),
    message: `${c.status === 'not-extracted' ? 'Not extracted' : 'Engine error'}: ${formatError(c.error)}` }));
  return { parts, notFound, unplaced, current: {
    part: cur, label: parts.find((p) => p.current).label, name: sheetName(cur), count: all.length,
    sheetHref: formatHash({ view: 'standards', role, policy, sheet: cur }),
    accepted: scored.filter((b) => b.decision !== 'NOT APPROVED'), rejected: scored.filter((b) => b.decision === 'NOT APPROVED'),
    unscored } };
}

const slug = (decision) => decision.toLowerCase().replace(' ', '-');
const manual = (b) => (b.source === 'manual' ? ' <span class="badge muted">Entered by hand</span>' : '');
const signs = (label) => (label.startsWith('Junior') ? 'Junior signs' : 'Senior signs');
const open = (href) => `<a class="text-link" href="${esc(href)}">Open in Qualify ↗</a>`;
const line = `<p class="compare-line">${SOURCING_LINE}</p>`;

function column(b) {
  const conditional = b.decision === 'CONDITIONAL';
  const rfi = !conditional ? ''
    : b.conditions.length ? `<p>Open RFI items</p><ul class="compare-rfi">${b.conditions.map((id) => `<li class="mono">${esc(id)}</li>`).join('')}</ul>`
      : '<p class="quiet">No open items</p>';
  return `<article class="compare-col" data-bidder="${esc(b.id)}" data-decision="${slug(b.decision)}">`
    + `<h3 class="compare-name">${esc(b.name)} <span class="mono">${esc(b.id)}</span></h3>`
    + `<p class="compare-tags">${decisionBadge(b.decision)}${manual(b)}</p>`
    + `<p class="compare-score"><strong class="mono">${esc(b.total)}</strong> · ${signs(b.signs)}${conditional ? ' · with conditions' : ''}</p>`
    + rfi + categoryBars(b.categories)
    + `<p class="compare-problems">Problems: ${b.problems.length ? esc(b.problems.join('; ')) : 'none'}</p>`
    + open(b.href) + '</article>';
}

function rejectedRow(b) {
  return `<li data-bidder="${esc(b.id)}" data-decision="not-approved">${decisionBadge(b.decision)}${manual(b)} `
    + `${esc(b.name)} <span class="mono">${esc(b.id)}</span> · <span class="mono">${esc(b.total)}</span> · ${esc(b.reason)} ${open(b.href)}</li>`;
}

function unscoredRow(u) {
  const badge = u.status === 'not-extracted' ? '<span class="badge muted">? NOT EXTRACTED</span>' : '<span class="badge muted">✗ ENGINE ERROR</span>';
  return `<li data-bidder="${esc(u.id)}" data-status="${esc(u.status)}">${badge}${manual(u)} ${esc(u.name)} <span class="mono">${esc(u.id)}</span> · `
    + '<span class="mono" aria-hidden="true">—</span><span class="sr-only">No score</span> '
    + `<p class="status-line">${esc(u.message)}</p>${open(u.href)}</li>`;
}

function panel(c) {
  const n = c.accepted.length + c.rejected.length + c.unscored.length;
  const band = (title, items) => `<p class="eyebrow">${title} (${items.length})</p>`;
  const accepted = c.accepted.length
    ? band('ACCEPTABLE', c.accepted) + `<div class="compare-grid">${c.accepted.map(column).join('')}</div>`
    : c.rejected.length ? '<p class="quiet">No acceptable bidder for this part.</p>' : '';  // none scored: NOT SCORED says why (decision 98)
  const rows = (cls, items, fn) => `<ul class="compare-rows ${cls}">${items.map(fn).join('')}</ul>`;
  return '<section class="panel compare-panel" aria-labelledby="compare-title">'
    + `<p class="eyebrow" id="compare-title">${esc(`${c.label.toUpperCase()} · ${c.part} · ${c.count} ${plural(c.count, 'BIDDER', 'BIDDERS')}`)}</p>`
    + (c.name ? `<p class="compare-part">${esc(c.name)}</p>` : '')
    + line
    + `<p class="compare-meta"><a class="text-link" href="${esc(c.sheetHref)}">Stark requirement sheet ↗</a></p>`
    + (n === 1 ? '<p class="quiet">Only one bidder for this part</p>' : '')
    + accepted
    + (c.rejected.length ? band('NOT ACCEPTABLE', c.rejected) + rows('compare-rejected', c.rejected, rejectedRow) : '')
    + (c.unscored.length ? band('NOT SCORED', c.unscored) + rows('compare-unscored', c.unscored, unscoredRow) : '')
    + '</section>';
}

/** The Compare body after the view head. ctx: { role, params } from main.js; reads params.part and params.policy. */
export function renderCompare(model, ctx = {}) {
  if (!model.suppliers.ok) return `<div class="compare">${line}${errorPanel(model.suppliers.error)}</div>`;
  const role = ctx.role ?? 'senior';
  const policy = ctx.params?.policy;
  const m = compareModel(model, { role, policy, part: ctx.params?.part });
  const pills = m.parts.map((p) => `<a href="${esc(formatHash({ view: 'compare', role, policy, part: p.part }))}"${p.current ? ' aria-current="true"' : ''}>`
    + `${esc(p.label)} · ${esc(p.part)} <span>${p.count}</span></a>`).join('');
  const unplaced = m.unplaced ? `<p class="quiet">${m.unplaced} ${plural(m.unplaced, 'candidate has', 'candidates have')} no requirement sheet loaded `
    + `and ${plural(m.unplaced, 'is', 'are')} not listed.</p>` : '';
  return '<div class="compare">'
    + (m.notFound ? routeLine({ notFound: { key: 'part', value: m.notFound } }) : '')
    + (m.parts.length ? `<nav class="compare-parts" aria-label="Parts">${pills}</nav>` : '')
    + unplaced
    + (m.current ? panel(m.current) : `${line}<p class="quiet">No parts to compare.</p>`)
    + '</div>';
}

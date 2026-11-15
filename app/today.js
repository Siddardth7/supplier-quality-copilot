// Today view (issue 107; UIT-FR-01..08, UIM-FR-14 Today half; DESIGN-SPEC 4.3).
// Pure: no DOM. Computes no flag, order, routing or score of its own (decision 87): Needs you is queueModel's
// sorted cards filtered by maySign, Escalate is monitorModel's byTier rows filtered by escalation(), counts are
// queueModel's counts and a tally of monitorModel's tiers. The only arithmetic is toFixed display rounding.
import { esc, errorPanel } from './html.js';
import { maySign, queueModel, queueHref, decisionBadge } from './queue.js';
import { monitorModel, monitorHref } from './monitor.js';
import { sheetPart } from './model.js';

/** UIT-FR-04 grade order; a null tier counts as Unrated. */
export const GRADES = ['Unrated', 'D', 'C', 'B', 'A'];
const DECISIONS = [['NOT APPROVED', 'not-approved'], ['CONDITIONAL', 'conditional'], ['APPROVED', 'approved']];
const NONE = (why) => `<span aria-hidden="true">—</span><span class="sr-only">${why}</span>`;

/** Pure. model: buildModel() output, non-null. Each section stands alone: { ok: false, error } when its source failed
 *  (UIT-FR-08). Counts ignore role (decision 89); a half whose source failed is null, never zeros. */
export function todayModel(model, { role = 'senior', policy } = {}) {
  const ctx = { role, params: { policy } };
  let needs, decision = null, routing = null, escalate, grades = null;
  if (!model.suppliers.ok) needs = { ok: false, error: model.suppliers.error };
  else {
    const q = queueModel(model);
    // Decision 88: unscored rows have no routing, so maySign drops them; they show as a count only.
    const items = q.cards.filter((c) => maySign(role, c.routing)).map((c) => ({
      id: c.id, name: c.name, part: sheetPart(model, c.commodity), decision: c.decision, total: c.total, routing: c.routing,
      source: c.source, href: queueHref(ctx, { supplier: c.id }) }));
    needs = { ok: true, items, unscored: q.unscored };
    decision = Object.fromEntries(DECISIONS.map(([label, key]) => [label, q.counts[key]]));
    routing = { junior: q.counts.junior, senior: q.counts.senior };
  }
  if (!model.monitor.ok) escalate = { ok: false, error: model.monitor.error };
  else {
    const { rows } = monitorModel(model);
    escalate = { ok: true, items: rows.filter((r) => r.escalate).map((r) => ({ id: r.id, name: r.name, tier: r.tier,
      composite: r.composite, reasons: r.escalateText, href: monitorHref(ctx, { active: r.id }) })) };
    grades = Object.fromEntries(GRADES.map((g) => [g, 0]));
    for (const r of rows) grades[r.tier ?? 'Unrated'] += 1;
  }
  return { as_of: model.as_of ?? null, needs, escalate, counts: { decision, routing, grades } };
}

function tiles(label, pairs) {
  return `<dl role="group" aria-label="${label}">`
    + pairs.map(([dt, n]) => `<div class="today-count"><dt>${esc(dt)}</dt><dd class="mono">${n}</dd></div>`).join('') + '</dl>';
}

function counts(c) {
  const groups = [
    c.decision && tiles('By decision', Object.entries(c.decision)),
    c.routing && tiles('By routing', [['Junior', c.routing.junior], ['Senior', c.routing.senior]]),
    c.grades && tiles('By grade', GRADES.map((g) => [g, c.grades[g]])),
  ].filter(Boolean).join('');
  // Issue 46: both sources failed, so say so rather than leave an empty labelled panel.
  const body = groups ? `<div class="today-count-groups">${groups}</div>`
    : '<p class="quiet">No counts: the candidate and scorecard data did not load.</p>';
  return '<section class="panel today-counts" aria-labelledby="counts-title"><p class="eyebrow" id="counts-title">QUEUE COUNTS</p>'
    + `${body}</section>`;
}

const list = (items) => `<ul class="today-list">${items.map((html) => `<li>${html}</li>`).join('')}</ul>`;

function needsItem(c) {
  const part = c.part ? `<span class="mono">${esc(c.part)}</span>` : `<span class="mono">${NONE('Part number unavailable')}</span>`;
  return `<a class="list-card today-item" data-today-link="qualify" data-id="${esc(c.id)}" data-routing="${esc(c.routing)}" href="${esc(c.href)}">`
    + `<span class="card-top">${decisionBadge(c.decision)}${c.source === 'manual' ? ' <span class="badge muted">Entered by hand</span>' : ''}</span>`
    + `<span class="card-name"><span class="mono">${esc(c.id)}</span> ${esc(c.name)}</span>`
    + `<span class="card-meta quiet">Part ${part} · <span class="mono">${c.total.toFixed(1)}</span></span></a>`;
}

function escalateItem(r) {
  const composite = r.composite === null ? NONE('no composite score') : r.composite.toFixed(1);  // issue 46: the tier text already says Unrated
  return `<a class="list-card today-item" data-today-link="monitor" data-id="${esc(r.id)}" href="${esc(r.href)}">`
    + '<span class="card-top"><span class="badge amber">▲ ESCALATE</span></span>'
    + `<span class="card-name"><span class="mono">${esc(r.id)}</span> ${esc(r.name)}</span>`
    + `<span class="card-meta quiet">${r.tier === null ? 'Unrated' : `Tier ${esc(r.tier)}`} · <span class="mono">${composite}</span></span>`
    + `<span class="card-meta quiet">${esc(r.reasons)}</span></a>`;
}

function needsPanel(n) {
  const head = (count) => `<p class="eyebrow" id="needs-title">NEEDS YOU${count}</p>`;
  if (!n.ok) return `<section class="panel" aria-labelledby="needs-title">${head('')}${errorPanel(n.error)}</section>`;
  const body = n.items.length ? list(n.items.map(needsItem)) : '<p class="quiet">Nothing needs you today.</p>';
  const note = n.unscored ? `<p class="quiet">${n.unscored} not scored</p>` : '';
  return `<section class="panel" aria-labelledby="needs-title">${head(` (${n.items.length})`)}${body}${note}</section>`;
}

// dup: the same error object as NEEDS YOU's (suppliers.json failed), so show it but do not announce it twice (issue 46).
function escalatePanel(e, dup) {
  const head = (count) => `<p class="eyebrow" id="esc-title">ESCALATE THIS WEEK${count}</p>`;
  if (!e.ok) return `<section class="panel" aria-labelledby="esc-title">${head('')}${errorPanel(e.error, { alert: !dup })}</section>`;
  const body = e.items.length ? list(e.items.map(escalateItem)) : '<p class="quiet">No escalations this month.</p>';
  return `<section class="panel" aria-labelledby="esc-title">${head(` (${e.items.length})`)}${body}</section>`;
}

/** The Today body after the view head. ctx: { role, params } from main.js; only params.policy is read. */
export function renderToday(model, ctx = {}) {
  const t = todayModel(model, { role: ctx.role, policy: ctx.params?.policy });
  // Decision 90: M18 is a fixed label; history always ends the month before as_of (SCORECARD.md).
  const dup = !t.needs.ok && !t.escalate.ok && t.needs.error === t.escalate.error;
  const snapshot = t.as_of ? `<p class="eyebrow">as of ${esc(t.as_of)} · M18</p>` : '';
  return '<div class="today">'
    + `<section class="panel today-intro">${snapshot}<p>Every supplier, scored the same way.</p></section>`
    + counts(t.counts)
    + `<div class="today-lists">${needsPanel(t.needs)}${escalatePanel(t.escalate, dup)}</div>`
    + '</div>';
}

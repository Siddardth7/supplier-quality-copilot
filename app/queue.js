// Qualify queue sidebar (#39; UIQ-FR-02, -03, -11, -12, -16 queue half) and supplier detail header, knockout
// banner, headline values, sub-tabs and category bars (#40; UIQ-FR-04, -05, -06, -14, -20); the Problems and All
// requirements sub-tabs come from criteria.js (#41; UIQ-FR-07, -08, -19), the Drafts sub-tab from drafts.js (#43;
// UIQ-FR-10, -17). DESIGN-SPEC 4.4, 4.9, 7.
// Pure: no DOM. Reads engine output only (the evaluation); never scores. The only arithmetic is toFixed display
// rounding. Requirement names in the banner come from criteria.js requirementName (findCriterion).
// route.js imports nothing (its view-name list is a literal, pinned to VIEWS and DESIGN-SPEC 4.2 by route.test.js),
// so views can import formatHash without an import cycle.
import { esc, formatError } from './html.js';
import { formatHash } from './route.js';
import { routeLine } from './shell.js';
import { policyLabel } from './policy.js';
import { sheetPart } from './model.js';
import { requirementName, notApprovedReason, problemsModel, requirementsModel, renderProblems, renderRequirements } from './criteria.js';
import { draftsModel, renderDrafts } from './drafts.js';

/** Pill order; value = hash `filter`, null = All. */
export const FILTERS = [
  { value: null, label: 'All' }, { value: 'junior', label: 'Junior' }, { value: 'senior', label: 'Senior' },
  { value: 'not-approved', label: 'NOT APPROVED' }, { value: 'conditional', label: 'CONDITIONAL' }, { value: 'approved', label: 'APPROVED' },
];

const RANK = { 'NOT APPROVED': 0, CONDITIONAL: 1, APPROVED: 2 };  // unscored rank 3: after every scored card
const SLUG = { 'NOT APPROVED': 'not-approved', CONDITIONAL: 'conditional', APPROVED: 'approved' };
const BADGE = { 'NOT APPROVED': ['bad', '✗'], CONDITIONAL: ['amber', '~'], APPROVED: ['ok', '✓'] };
const ROUTING = { junior: 'Junior SQE', senior: 'Senior SQE' };
/** The one signer rule for the UI. routing: evaluation.routing.to ('junior' | 'senior') or null (unscored).
 *  Senior may sign everything scored; Junior only what the engine routed to junior (RUBRIC 176-177, UIT-FR-02).
 *  Today (issue 107) filters Needs you with this same predicate. Never re-derive from decision or risk here. */
export const maySign = (role, routing) => routing !== null && routing !== undefined && (role === 'senior' || routing === 'junior');
const byId = (a, b) => a.id.localeCompare(b.id, 'en', { numeric: true });
const rank = (c) => RANK[c.decision] ?? 3;
const matches = (c, filter) => filter === undefined
  || (filter === 'junior' || filter === 'senior' ? c.routing === filter : SLUG[c.decision] === filter);

/** Pure. model must be non-null with model.suppliers.ok. filter, supplier: hash values or undefined. */
export function queueModel(model, { filter, supplier } = {}) {
  const rows = model.candidates.map((c) => {
    const ev = c.status === 'scored' ? c.evaluation : null;
    return { id: c.id, name: c.name, commodity: c.commodity, total: ev ? ev.total : null, decision: ev ? ev.decision : null,
      routing: ev ? ev.routing.to : null, status: c.status, source: c.source, selected: supplier !== undefined && c.id === supplier,
      reason: ev ? notApprovedReason(ev, model.pass?.conditional) : null };  // NOT APPROVED only (issue 162)
  }).sort((a, b) => (rank(a) - rank(b)) || byId(a, b));  // map() made a copy: model.candidates is not mutated
  const scored = rows.filter((r) => r.status === 'scored');
  const counts = { all: rows.length };
  for (const f of FILTERS) if (f.value) counts[f.value] = scored.filter((r) => matches(r, f.value)).length;
  const cards = rows.filter((r) => matches(r, filter) && (filter === undefined || r.status === 'scored'));
  const selected = supplier === undefined ? null : model.candidates.find((c) => c.id === supplier) ?? null;
  // part: the Stark part number from the commodity's requirement sheet (decision 24); never candidate.part.
  return { counts, unscored: rows.length - scored.length, cards, selected, part: selected ? sheetPart(model, selected.commodity) : null,
    hidden: !!selected && !cards.some((c) => c.selected) };
}

/** Hash for a queue link. Card: { supplier: id }; pill: { filter }; back: { supplier: undefined }. Always Qualify. */
export function queueHref({ role, params = {} } = {}, patch) {
  // A supplier change drops the previous supplier's tab, doc, sec and new; a filter change keeps them (decision 21),
  // so filtering doesn't discard an open hand entry (decision 164).
  const keep = 'supplier' in patch
    ? { filter: params.filter }
    : { supplier: params.supplier, tab: params.tab, doc: params.doc, sec: params.sec, filter: params.filter, new: params.new };
  return formatHash({ view: 'qualify', role, policy: params.policy, ...keep, ...patch });
}

export const commodityLabel = (s) => { const t = String(s ?? '').replace(/_/g, ' '); return t.charAt(0).toUpperCase() + t.slice(1); };

/** The decision badge for a scored item (Qualify cards; Today's Needs you list, issue 107). */
export function decisionBadge(decision) {
  const [tone, glyph] = BADGE[decision];
  return `<span class="badge ${tone}">${glyph} ${esc(decision)}</span>`;
}

function badge(c) {
  if (c.status === 'not-extracted') return '<span class="badge muted">? NOT EXTRACTED</span>';
  if (c.status !== 'scored') return '<span class="badge muted">✗ ENGINE ERROR</span>';
  return decisionBadge(c.decision);
}

// UIQ-FR-18: role tags show only when viewing as Junior; unscored cards (no routing) carry none (decision 86).
function roleTag(c, role) {
  if (role !== 'junior' || !c.routing) return '';
  return maySign(role, c.routing) ? ' <span class="badge ok">You can sign</span>' : ' <span class="badge muted">Senior signs</span>';
}

function card(c, ctx, focusable) {
  const total = c.total === null
    ? '<span class="mono" aria-hidden="true">—</span><span class="sr-only">No score</span>'
    : `<span class="mono">${c.total.toFixed(1)}</span>`;
  return `<button type="button" class="list-card" data-queue-card data-id="${esc(c.id)}"${c.routing ? ` data-routing="${esc(c.routing)}"` : ''}`
    + ` aria-pressed="${c.selected}" tabindex="${focusable ? 0 : -1}" data-href="${esc(queueHref(ctx, { supplier: c.id }))}">`
    + `<span class="card-top">${badge(c)}${c.source === 'manual' ? ' <span class="badge muted">Entered by hand</span>' : ''}${roleTag(c, ctx.role)}</span>`
    + `<span class="card-name"><span class="mono">${esc(c.id)}</span> ${esc(c.name)}</span>`
    + `<span class="card-meta quiet">${esc(commodityLabel(c.commodity))} · ${total}${c.routing ? ` · ${ROUTING[c.routing]}` : ''}</span>`
    + (c.reason ? `<span class="card-meta quiet">${esc(c.reason)}</span>` : '')
    + '</button>';
}

/** The <aside>: head, filter pills, notes, cards. */
export function renderQueue(q, ctx = {}) {
  const active = ctx.params?.filter ?? null;
  const showAll = `<button type="button" class="subtle-button" data-filter="" data-href="${esc(queueHref(ctx, { filter: undefined }))}">Show all</button>`;
  const pills = FILTERS.map((f) => `<button type="button" aria-pressed="${f.value === active}" data-filter="${f.value ?? ''}"`
    + ` data-href="${esc(queueHref(ctx, { filter: f.value ?? undefined }))}">${f.label} <span>${q.counts[f.value ?? 'all']}</span></button>`).join('');
  const notes = (q.unscored ? `<p class="quiet">${q.unscored} not scored</p>` : '')
    + (q.hidden ? `<p class="quiet">${esc(q.selected.id)} is hidden by this filter. ${showAll}</p>` : '');
  let list;
  if (!q.counts.all) list = '<p class="quiet">No candidates loaded.</p>';
  else if (!q.cards.length) list = `<p class="quiet">No suppliers match this filter. ${showAll}</p>`;
  else {
    const focus = Math.max(0, q.cards.findIndex((c) => c.selected));  // roving tab stop: selected card, else the first
    list = `<div class="queue-cards" role="group" aria-label="Suppliers">${q.cards.map((c, i) => card(c, ctx, i === focus)).join('')}</div>`;
  }
  return '<aside class="queue" aria-label="Supplier queue">'
    // + New supplier and Import (issue 77, UIQ-FR-15, -16); main.js handles manual-import.
    + `<div class="queue-head"><p class="eyebrow">QUEUE (${q.counts.all})</p><div class="queue-actions">`
    + `<button type="button" class="subtle-button" data-href="${esc(formatHash({ view: 'qualify', role: ctx.role, policy: ctx.params?.policy, new: 1 }))}">+ New supplier</button>`
    + '<button type="button" class="subtle-button" data-act="manual-import">Import</button></div></div>'
    + (ctx.importError ? `<p class="quiet" role="alert">Import refused: ${esc(ctx.importError)}</p>` : '')
    + `<div class="pills" role="group" aria-label="Filter queue">${pills}</div>`
    + notes + list + '</aside>';
}

// Detail sub-tabs (UIQ-FR-14), in order. Problems is the default and omits `tab` from the hash (decision 30).
const DETAIL_TABS = [['problems', 'Problems'], ['categories', 'Categories'], ['requirements', 'All requirements'], ['drafts', 'Drafts']];

/** Pure view model for a scored candidate's detail; null otherwise. Every number is an engine field: totals and
 *  category scores pass through toFixed(1), counts are array lengths. part: sheetPart() result or null. */
export function detailModel(candidate, { part = null, role, params = {} } = {}) {
  if (candidate?.status !== 'scored') return null;
  const ev = candidate.evaluation;
  const [tone, glyph] = BADGE[ev.decision];
  const knockout = (state) => (id) => ({ id, state, name: requirementName(id) });
  return {
    id: candidate.id, name: candidate.name, commodity: commodityLabel(candidate.commodity), risk: ev.risk, part,
    policy: policyLabel(ev.policy), total: ev.total.toFixed(1), decision: ev.decision, tone, glyph,
    signs: { label: ROUTING[ev.routing.to], reasons: ev.routing.reasons },
    mayHere: maySign(role ?? 'senior', ev.routing.to),  // no role = Senior, as route.js defaults it
    problems: ev.gaps.length, info: ev.nice_to_have.length,
    knockouts: [...ev.knockouts.failed.map(knockout('failed')), ...ev.knockouts.assumed.map(knockout('assumed'))],
    categories: ev.categories.map(({ n, name, score, weight }) => {
      const s = score.toFixed(1);
      const w = String(Number(weight.toFixed(1)));  // 10, 12.5, 7: display only
      return { n, name, score: s, weight: w, value: score, max: weight, label: `${n} ${name}, ${s} of ${w}` };
    }),
    sheetHref: part ? formatHash({ view: 'standards', role, policy: params.policy, sheet: part }) : null,
  };
}

// UIQ-FR-05: one banner, failed rows then assumed rows in engine order (decision 29). role=alert always here;
// main.js strips it on re-renders it already announced (decision 28).
export function banner(kos) {
  if (!kos.length) return '';
  const rows = kos.map((k) => {
    const [cls, label, effect] = k.state === 'failed'
      ? ['bad', '★ ✗ Failed', 'Forces NOT APPROVED.'] : ['amber', '★ ~ Assumed (claimed, not proven)', 'Blocks APPROVED.'];
    return `<li data-knockout="${esc(k.id)}"><span class="ko-state ${cls}">${label}</span> `
      + `${k.name === null ? '' : `${esc(k.name)} `}<span class="mono">${esc(k.id)}</span>. <span class="ko-effect">${effect}</span></li>`;
  }).join('');
  return `<div class="panel knockout-banner" role="alert"><p class="eyebrow">★ KNOCKOUT${kos.length > 1 ? 'S' : ''}</p>`
    + `<ul class="knockout-list">${rows}</ul></div>`;
}

// UIQ-FR-06: neutral <meter> per category, value = engine score, max = policy weight; no colour threshold (decision 26).
// categories: detailModel().categories. Compare (issue 108) reuses the list in each bidder column.
export function categoryBars(categories) {
  const rows = categories.map((c) => `<li class="bar"><span class="bar-label">${esc(`${c.n} ${c.name}`)}</span>`
    + `<span class="mono bar-value">${c.score} / ${c.weight}</span>`
    + (c.max > 0
      ? `<meter min="0" max="${c.max}" value="${c.value}" aria-label="${esc(c.label)}"></meter>`
      : '<span class="quiet bar-zero">weight 0</span>')
    + '</li>').join('');
  return `<ul class="bars">${rows}</ul>`;
}

function bars(d) {
  return `<p class="quiet">Score against category weight under ${esc(d.policy)}</p>${categoryBars(d.categories)}`;
}

function header(d) {
  const part = d.part ? `<span class="mono">${esc(d.part)}</span>`
    : '<span class="mono" aria-hidden="true">—</span><span class="sr-only">Part number unavailable</span>';
  const sheet = d.sheetHref ? `<a class="text-link" href="${esc(d.sheetHref)}">Stark requirement sheet ↗</a>`
    : '<span class="quiet">Stark requirement sheet unavailable</span>';
  return '<div class="detail-head"><div class="detail-id">'
    + `<p class="eyebrow">${esc(d.commodity)} · ${esc(d.risk)} risk · ${part}</p>`
    + `<h3 id="detail-title" tabindex="-1">${esc(d.name)} <span class="mono">${esc(d.id)}</span></h3>`
    // UIQ-FR-18 + decision 84: shown in both roles; a Senior always reads "You may sign this".
    + `<p class="sign-line" data-may-sign="${d.mayHere}">${d.mayHere ? 'You may sign this' : 'Needs a senior SQE'}</p></div>`
    + `<div class="detail-policy"><p class="quiet">Scored with: ${esc(d.policy)}</p>${sheet}</div></div>`;
}

// UIQ-FR-04 headline values: SCORE, DECISION, SIGNS, PROBLEMS. SIGNS states the engine routing for every role;
// the role consequence is the header's sign line (issue 112).
export function metrics(d) {
  return '<div class="metrics detail-metrics">'
    + `<div class="metric"><p>Score</p><strong>${d.total}</strong></div>`
    + `<div class="metric"><p>Decision</p><span class="badge ${d.tone}">${d.glyph} ${esc(d.decision)}</span></div>`
    + `<div class="metric"><p>Signs</p><strong>${esc(d.signs.label)}</strong><small>${esc(d.signs.reasons.join('; '))}</small></div>`
    + `<div class="metric"><p>Problems</p><strong>${d.problems}</strong><small>+ ${d.info} info</small></div>`
    + '</div>';
}

// UIQ-FR-14: automatic-activation tabs; each button carries its hash, main.js handles arrows and focus.
// ev: the engine evaluation, for the Problems (UIQ-FR-07), All requirements (UIQ-FR-08) and Drafts panels;
// drafts: candidate.drafts, the agent's text (null for hand-entered, UIQ-FR-17).
function tabs(d, ev, ctx, drafts, source) {
  const active = ctx.params?.tab ?? 'problems';
  const buttons = DETAIL_TABS.map(([key, label]) => {
    const on = key === active;
    return `<button type="button" role="tab" id="dtab-${key}" data-detail-tab="${key}" aria-selected="${on}" aria-controls="dpanel"`
      + ` tabindex="${on ? 0 : -1}" data-href="${esc(queueHref(ctx, { tab: key === 'problems' ? undefined : key }))}">${label}</button>`;
  }).join('');
  const href = (patch) => queueHref(ctx, patch);  // a citation sets doc and sec; the viewer is #42 (decision 36)
  const body = {
    problems: () => renderProblems(problemsModel(ev), href),
    categories: () => bars(d),
    requirements: () => renderRequirements(requirementsModel(ev), href),
    drafts: () => renderDrafts(draftsModel(ev, drafts), { manual: source === 'manual' }),
  }[active]();
  return `<div class="tabs detail-tabs" role="tablist" aria-label="Supplier detail">${buttons}</div>`
    + `<div id="dpanel" class="detail-panel" role="tabpanel" aria-labelledby="dtab-${active}" tabindex="0">${body}</div>`;
}

/** The detail <section>. q: queueModel() output ({ selected, part }). Unscored and not-found keep #39's lines. */
export function renderDetail(q, ctx = {}) {
  const s = q.selected;
  if (ctx.notFound || !s) {
    const body = ctx.notFound ? routeLine(ctx) : '<p class="quiet">Select a supplier</p>';
    return `<section class="detail" aria-label="Supplier detail">${body}</section>`;
  }
  const back = `<a class="text-link back-link" data-back href="${esc(queueHref(ctx, { supplier: undefined }))}">← Queue</a>`
    + (s.source === 'manual' ? manualActions(s, ctx) : '');
  const d = detailModel(s, { part: q.part ?? null, role: ctx.role, params: ctx.params });
  if (!d) {
    const status = s.status === 'not-extracted' ? `<p class="status-line">Not extracted: ${esc(formatError(s.error))}</p>`
      : `<p class="status-line">Engine error: ${esc(formatError(s.error))}</p>`;
    return `<section class="detail" aria-labelledby="detail-title">${back}`
      + `<p class="eyebrow mono">${esc(s.id)}</p><h3 id="detail-title" tabindex="-1">${esc(s.name)}</h3>${status}</section>`;
  }
  return `<section class="detail" aria-labelledby="detail-title">${back}${header(d)}${banner(d.knockouts)}${metrics(d)}${tabs(d, s.evaluation, ctx, s.drafts, s.source)}</section>`;
}

// Edit, Export, Delete (in-page confirm) for a hand-entered supplier (issue 77, UIQ-FR-16). Edit is a link to the
// entry on this record; main.js handles the rest. ctx.manualNote: "Can't save in this browser" after a failed write.
function manualActions(s, ctx) {
  const id = esc(s.id);
  const del = ctx.manualConfirm === s.id
    ? `<span role="group" aria-label="Confirm delete"><span>Delete ${id}?</span>`
      + `<button type="button" class="subtle-button" data-act="manual-confirm-delete" data-id="${id}">Delete</button>`
      + `<button type="button" class="subtle-button" data-act="manual-cancel" data-id="${id}">Cancel</button></span>`
    : `<button type="button" class="subtle-button" data-act="manual-delete" data-id="${id}">Delete</button>`;
  return '<div class="detail-actions manual-actions">'
    + `<button type="button" class="subtle-button" data-act="manual-edit" data-id="${id}" data-href="${esc(formatHash({ view: 'qualify', role: ctx.role, policy: ctx.params?.policy, supplier: s.id, new: 1 }))}">Edit</button>`
    + `<button type="button" class="subtle-button" data-act="manual-export" data-id="${id}">Export</button>${del}</div>`
    + (ctx.manualNote ? `<p class="quiet" role="status">${esc(ctx.manualNote)}</p>` : '');
}

/** Grid wrapper: queue + detail. data-open: a supplier is selected and found, or detailOverride (the hand entry,
 *  issue 77) fills the detail column (phone hides the queue). */
export function renderQualify(model, ctx = {}, detailOverride = null) {
  const q = queueModel(model, { filter: ctx.params?.filter, supplier: ctx.params?.supplier });
  const detail = typeof detailOverride === 'string' ? detailOverride : renderDetail(q, ctx);
  return `<div class="qualify" data-open="${!!q.selected || typeof detailOverride === 'string'}">${renderQueue(q, ctx)}${detail}</div>`;
}

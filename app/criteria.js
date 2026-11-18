// Problems list (UIQ-FR-07), All requirements table (UIQ-FR-08) and the Cpk "excellent" label (UIQ-FR-19), #41.
// DESIGN-SPEC 4.4, 5, 6, 7. Pure: no DOM. Reads engine output only: groups, chips, scores and counts are the
// engine's own fields and lists; the only arithmetic is toFixed display rounding. Must not import queue.js (it
// imports this file); links come from the caller's href(patch) callback.
import { esc } from './html.js';
import { findCriterion, RUBRIC } from './engine.js';

/** PRD-04 citation (PRD-04:88), split into the file and the full dotted section. */
export const CITATION = /^([a-z0-9_]+\.md) §([0-9]+(?:\.[0-9]+)*)$/;

/** Chip per kind: [tone, glyph, word] (DESIGN-SPEC 5). Glyph and word always render; colour is never the only cue. */
// partial (issue 162): a verified gap row scoring 1-2; Fail is score 0 only (decision 231).
export const CHIP = { fail: ['bad', '✗', 'Fail'], partial: ['amber', '◐', 'Partial'], assumed: ['amber', '~', 'Assumed'], missing: ['bad', '?', 'Missing'],
  verified: ['ok', '✓', 'Verified'], info: ['muted', 'i', 'Info'] };

// Per-criterion display formats (DESIGN-SPEC 6, decision 34). Core criterion IDs only; display, never scoring.
const DISPLAY = { '2.ctq_cpk': { decimals: 2, excellent: 1.67 }, '3.grr': { decimals: 1, suffix: '%' } };
const EMPTY = { missing: 'Not found in the packet', assumed: 'Claimed, no value given' };
const GAP_ORDER = ['fail', 'assumed', 'missing'];
const INFO_STATE = { assumed: 'nice to have, assumed', missing: 'nice to have, not in packet' };
const cap = (s) => { const t = s.replace(/_/g, ' '); return t.charAt(0).toUpperCase() + t.slice(1); };  // = queue.js commodityLabel

const defOf = (id) => { try { return findCriterion(RUBRIC, id); } catch { return null; } };

/** Requirement text (criteria) or test name (catalog tests); null for an unknown id. */
export function requirementName(id) {
  const def = defOf(id);
  return def ? def.requirement ?? def.name ?? null : null;
}

/** Why a scored candidate is NOT APPROVED, or null for any other decision. conditionalMark = model.pass.conditional.
 *  One string for Compare, the Qualify cards and Today (issue 162, decision 230). */
export function notApprovedReason(ev, conditionalMark) {
  if (ev?.decision !== 'NOT APPROVED') return null;
  const failed = ev.knockouts?.failed ?? [];
  return failed.length ? `Knockout failed: ${failed.map((id) => requirementName(id) ?? id).join('; ')}` : `Below pass mark ${conditionalMark}`;
}

/** { doc, sec } | null. Null for a non-string, '' or anything the PRD-04 pattern rejects. */
export function parseCitation(s) {
  const m = typeof s === 'string' ? CITATION.exec(s) : null;
  return m ? { doc: m[1], sec: m[2] } : null;
}

/** Display text for an evidence value. def: findCriterion result or null; row: { state, value }. Never throws. */
export function formatValue(def, row) {
  const v = row.value;
  if (v == null) return { text: '—', label: null, empty: true, sr: EMPTY[row.state] ?? 'No value' };
  const rule = def ? DISPLAY[def.id] : undefined;
  let text = String(v);
  let label = null;
  if (def?.type === 'bool' && typeof v === 'boolean') text = v ? 'Yes' : 'No';
  else if (def?.type === 'enum') text = cap(text);
  else if (def?.type === 'number' && rule && typeof v === 'number' && Number.isFinite(v)) {
    text = v.toFixed(rule.decimals) + (rule.suffix ?? '');
    // Raw value, edge inclusive, verified only (decision 35). The score is the engine's, untouched.
    if (rule.excellent !== undefined && row.state === 'verified' && v >= rule.excellent) label = 'excellent';
  }
  return { text, label, empty: false, sr: null };
}

/** A verified row below full marks reads Partial at score 1-2 and Fail at 0 (issue 162, decision 231); otherwise the
 *  evidence state (decision 34). A missing score reads Fail. */
export function chipKind(row) {
  if (row.gap !== 'fail') return row.state;
  return row.score >= 1 ? 'partial' : 'fail';
}

function rowModel(r, kind) {
  const def = defOf(r.id);
  const c = parseCitation(r.citation);
  return { id: r.id, name: (def && (def.requirement ?? def.name)) ?? r.id, kind, knockout: r.knockout === true, state: r.state,
    score: r.score, value: formatValue(def, r), citation: c && { ...c, text: `${c.doc} §${c.sec}` },
    rawCitation: r.citation ?? null, note: r.note ?? null };
}

const rowsOf = (ev) => (ev.categories ?? []).flatMap((c) => c.criteria ?? []);

/** Gaps grouped fail -> assumed -> missing (engine order inside each), then info from nice_to_have. Empty groups dropped.
 *  Rows in the fail group carry their own chip, Fail or Partial (issue 162); the group keeps kind 'fail'. */
export function problemsModel(ev) {
  const byId = new Map(rowsOf(ev).map((r) => [r.id, r]));
  const groups = GAP_ORDER.map((kind) => ({ kind,
    rows: ev.gaps.filter((g) => g.type === kind).map((g) => {
      const r = { id: g.id, score: g.score, ...byId.get(g.id) };
      return rowModel(r, kind === 'fail' ? chipKind({ ...r, gap: 'fail' }) : kind);
    }) }));
  groups.push({ kind: 'info', rows: ev.nice_to_have.map((n) => ({ id: n.id, name: requirementName(n.id) ?? n.id, kind: 'info', state: n.state })) });
  return { groups: groups.filter((g) => g.rows.length), empty: !ev.gaps.length && !ev.nice_to_have.length, total: ev.gaps.length };
}

/** Every scored criterion by category, engine order; a category is open only when one of its rows has a gap. */
export function requirementsModel(ev) {
  return {
    categories: (ev.categories ?? []).map(({ n, name, score, weight, criteria = [] }) => {
      const gapCount = criteria.filter((r) => r.gap !== null).length;
      return { n, name, score: score.toFixed(1), weight: String(Number(weight.toFixed(1))), open: gapCount > 0, gapCount,
        rows: criteria.map((r) => rowModel(r, chipKind(r))) };
    }),
    info: ev.nice_to_have.length,
  };
}

const none = (why) => `<span aria-hidden="true">—</span><span class="sr-only">${why}</span>`;
const chip = (kind) => { const [tone, glyph, word] = Object.hasOwn(CHIP, kind) ? CHIP[kind] : ['muted', '?', String(kind)]; return `<span class="badge ${tone}">${glyph} ${esc(word)}</span>`; };
const td = (label, body, cls = '') => `<td data-label="${label}"${cls ? ` class="${cls}"` : ''}>${body}</td>`;
const head = (cols) => `<thead><tr>${cols.map(([c, cls]) => `<th scope="col"${cls ? ` class="${cls}"` : ''}>${c}</th>`).join('')}</tr></thead>`;

function requirement(r, withId) {
  return (r.knockout ? '<span class="ko-star" aria-hidden="true">★</span><span class="sr-only">Knockout</span>' : '')
    + esc(r.name) + (withId ? ` <span class="mono">${esc(r.id)}</span>` : '')
    + (r.note === null ? '' : `<small class="quiet gap-note">${esc(r.note)}</small>`);
}

function value(v) {
  if (v.empty) return none(esc(v.sr));
  return esc(v.text) + (v.label ? ` <span class="badge ok">✓ ${esc(v.label)}</span>` : '');
}

function citation(r, href) {
  if (r.citation) {
    const { doc, sec } = r.citation;
    return `<a class="text-link" data-citation href="${esc(href({ doc, sec }))}">${esc(doc)} §${esc(sec)} ↗</a>`;
  }
  if (r.rawCitation === null || r.rawCitation === '') return none('No citation');
  return `<span class="quiet">${esc(r.rawCitation)}</span>`;  // not a PRD-04 citation: text only, never a link
}

// Group heading override: the fail group holds Fail and Partial rows (issue 162, decision 232).
const TITLE = { fail: 'Fail or partial' };
const GAP_COLS = [['State'], ['Requirement'], ['Value', 'cell-num'], ['Score', 'cell-num'], ['Citation']];

function gapRow(r, href) {
  if (r.kind === 'info') {
    return `<tr data-id="${esc(r.id)}">${td('State', chip('info'))}`
      + td('Requirement', `${esc(r.name)} <span class="mono">${esc(r.id)}</span><span class="quiet"> (${INFO_STATE[r.state] ?? 'nice to have'})</span>`)
      + td('Value', none('Not scored'), 'cell-num') + td('Score', none('Not scored'), 'cell-num') + td('Citation', none('Not scored')) + '</tr>';
  }
  return `<tr data-id="${esc(r.id)}">${td('State', chip(r.kind))}${td('Requirement', requirement(r, true))}`
    + td('Value', value(r.value), 'cell-num') + td('Score', `${esc(r.score)} / 3`, 'cell-num') + td('Citation', citation(r, href)) + '</tr>';
}

/** Problems sub-tab body. href(patch) -> hash (queue.js passes queueHref bound to the route). */
export function renderProblems(pm, href) {
  if (pm.empty) return '<p class="quiet">No problems: every requirement scored 3.</p>';
  return pm.groups.map((g) => {
    const title = `${TITLE[g.kind] ?? CHIP[g.kind][2]} (${g.rows.length})`;
    return `<section class="gap-group" data-kind="${g.kind}"><h4>${title}</h4><table class="gap-table">`
      + `<caption class="sr-only">${title}</caption>${head(GAP_COLS)}<tbody>${g.rows.map((r) => gapRow(r, href)).join('')}</tbody></table></section>`;
  }).join('');
}

const REQ_COLS = [['ID'], ['Requirement'], ['State'], ['Value', 'cell-num'], ['Score', 'cell-num'], ['Citation']];

/** All requirements sub-tab body: one <details> per category, open only when it has a gap (decision 39). */
export function renderRequirements(rm, href) {
  if (!rm.categories.length) return '<p class="quiet">No requirements.</p>';
  const cats = rm.categories.map((c) => {
    const rows = c.rows.map((r) => `<tr data-id="${esc(r.id)}">${td('ID', esc(r.id), 'mono')}${td('Requirement', requirement(r, false))}`
      + td('State', chip(r.kind)) + td('Value', value(r.value), 'cell-num') + td('Score', esc(r.score), 'cell-num')
      + td('Citation', citation(r, href)) + '</tr>').join('');
    const problems = c.gapCount ? `${c.gapCount} problem${c.gapCount === 1 ? '' : 's'}` : 'no problems';
    return `<details class="req-cat" data-cat="${esc(c.n)}"${c.open ? ' open' : ''}><summary><span>${esc(`${c.n} ${c.name}`)}</span>`
      + ` <span class="mono">${c.score} / ${c.weight}</span> <span class="quiet">${problems}</span></summary>`
      + `<table class="req-table"><caption class="sr-only">${esc(`${c.n} ${c.name}`)}</caption>${head(REQ_COLS)}<tbody>${rows}</tbody></table></details>`;
  }).join('');
  const info = rm.info ? `<p class="quiet req-info">${rm.info} nice-to-have test${rm.info === 1 ? ' is' : 's are'} not verified; see Problems (Info).</p>` : '';
  return cats + info;
}

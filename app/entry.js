// + New supplier: hand entry in the Qualify detail column (issue 77; PRD-05 UIQ-FR-15, DESIGN-SPEC 4.4). Step 1 is
// the name and a Stark part from the requirement sheets; step 2 the checklist under a sticky live-score panel.
// Pure HTML strings, no DOM. Rows come from manual.js checklist() (RUBRIC) and every score from scoreEntry()
// (evaluate). Names no criterion, test or commodity (QUAL-NFR-05); the detail components are reused as they are.
import { esc } from './html.js';
import { RUBRIC } from './engine.js';
import { STATES, checklist, scoreEntry } from './manual.js';
import { sheetRows, limitText } from './standards.js';
import { banner, detailModel, metrics, queueHref } from './queue.js';
import { problemsModel, renderProblems } from './criteria.js';
import { draftsModel, renderDrafts } from './drafts.js';

const KO = '<span class="ko-star" aria-hidden="true">★</span><span class="sr-only">Knockout</span>';
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const profileOf = (key) => RUBRIC.commodities.find((c) => c.key === key) ?? null;
/** Step 1's commodity line as plain text; '' with no part. main.js sets it in place so the part select keeps type-ahead (issue 46). */
export function profileLine(commodity) {
  const p = profileOf(commodity);
  return p ? `Commodity ${p.name} · ${p.risk} risk` : '';
}

/** A row's issue as shown on the row: the engine's "<id>: " prefix dropped (the legend already names it). */
export const issueText = (id, issue) => (issue ? (issue.startsWith(`${id}: `) ? issue.slice(id.length + 2) : issue) : '');

/** The loaded requirement sheet for a part number, or null. Through sheetRows, so uploaded sheets (issue 78) join. */
export function sheetFor(model, partNo) {
  const row = sheetRows(model).find((r) => r.ok && r.part_no === partNo);
  return row ? model.sheets[row.sheetKey].value : null;  // sheetKey, not commodity: an uploaded sheet shares its commodity (issue 78)
}

/** The sticky headline strip: score, decision, signs, problems, or the paused / engine-error line. Kept short so it
 *  never hides the focused field (WCAG 2.4.11). view: scoreEntry() output; ctx: the render ctx (ctx.entry.state, role, params). */
export function livePanel(view, ctx) {
  const s = ctx.entry.state;
  if (view.blocked) {
    const id = Object.keys(view.rows).find((k) => view.rows[k].issue);
    const name = checklist(s.commodity)?.find((r) => r.id === id)?.name ?? id;
    return `<p class="status-line" role="status">Score paused: ${esc(name)} needs where I found it</p>`;
  }
  if (!view.result.ok) return `<p class="status-line" role="status">Engine error: ${esc(view.result.error.message)}</p>`;
  const ev = view.result.evaluation;
  const d = detailModel({ status: 'scored', id: s.id, name: s.name, commodity: s.commodity, evaluation: ev },
    { part: s.part_no, role: ctx.role, params: ctx.params });
  // Rebuilt on every keystroke, so no role=alert in here (decision 163); one polite summary line instead.
  return `<p class="sr-only" role="status">Score ${d.total}, ${esc(d.decision)}</p>${metrics(d)}`;
}

/** Knockout banner, gaps and RFI / audit lists under the strip (not sticky: a blank form fails every knockout, so the
 *  banner alone can outgrow the screen); empty while the score is paused or errored. */
export function liveGaps(view, ctx) {
  if (!view.result?.ok) return '';
  const ev = view.result.evaluation;
  const d = detailModel({ status: 'scored', evaluation: ev }, {});
  return banner(d.knockouts).replace(' role="alert"', '') + renderProblems(problemsModel(ev), (patch) => queueHref(ctx, patch)) + renderDrafts(draftsModel(ev, null), { manual: true });
}

function step1(model, s, ctx) {
  const parts = sheetRows(model).filter((r) => r.ok);
  const shout = !!ctx.entry.error;
  const nameErr = shout && !s.name.trim() ? 'Enter a supplier name' : '';
  const partErr = shout && !s.part_no ? 'Pick a Stark part' : '';
  const ready = s.name.trim() && s.part_no;
  const options = parts.map((r) => `<option value="${esc(r.part_no)}"${r.part_no === s.part_no ? ' selected' : ''}>${esc(r.part_no)} · ${esc(r.part_name ?? '')}</option>`).join('');
  return '<div class="entry-step">'
    + '<div class="entry-field"><label for="entry-name">Supplier name</label>'
    + `<input type="text" id="entry-name" class="entry-input" data-entry-field="name" autocomplete="off" required aria-describedby="entry-name-error" value="${esc(s.name)}"${nameErr ? ' aria-invalid="true"' : ''}>`
    + `<p class="entry-error" id="entry-name-error"${nameErr ? ' role="alert"' : ''}>${nameErr}</p></div>`
    + '<div class="entry-field"><label for="entry-part">Stark part</label>'
    + (parts.length
      ? `<select id="entry-part" class="entry-input" data-entry-field="part_no" aria-describedby="entry-part-error"${partErr ? ' aria-invalid="true"' : ''}><option value="">Pick a part</option>${options}</select>`
      : '<p class="quiet">No requirement sheets loaded</p>')
    + `<p class="entry-error" id="entry-part-error"${partErr ? ' role="alert"' : ''}>${partErr}</p>`
    + `<p class="quiet" id="entry-profile">${esc(profileLine(s.commodity))}</p></div>`
    + '<div class="entry-actions">'
    + `<button type="button" class="button compact" data-act="entry-continue"${ready ? '' : ' aria-disabled="true"'}${parts.length ? '' : ' disabled'}>Continue</button>`
    + '<button type="button" class="subtle-button" data-act="entry-cancel">Cancel</button></div></div>';
}

// Stark's acceptance limits for a category-4 test, from the part's requirement sheet.
function limits(test) {
  const acc = (test?.conditions ?? []).filter((c) => c.kind === 'acceptance');
  if (!acc.length) return '<p class="entry-limit"><span class="quiet">No limit on this sheet</span></p>';
  return `<p class="entry-limit"><span class="quiet">Stark limit:</span> ${acc.map((c) => `<span class="mono">${esc(c.measure)} ${esc(limitText(c))}</span>`).join('; ')}</p>`;
}

function valueInput(r, v, attrs) {
  const dis = v.state === 'missing' ? ' disabled' : '';
  if (r.type === 'bool' || r.type === 'enum') {
    const opts = r.type === 'bool' ? [['true', 'Yes'], ['false', 'No']] : r.options.map((o) => [o, cap(o)]);
    return `<select class="entry-input"${attrs('value')}${dis}><option value="">No value</option>`
      + opts.map(([k, label]) => `<option value="${esc(k)}"${k === v.value ? ' selected' : ''}>${esc(label)}</option>`).join('') + '</select>';
  }
  // Plain text, not type=number/date: the engine must see and name what was typed (decision 162).
  const hint = r.type === 'number' ? ' inputmode="decimal"' : ' placeholder="YYYY-MM-DD"';
  return `<input type="text" class="entry-input"${hint} autocomplete="off" value="${esc(v.value)}"${attrs('value')}${dis}>`;
}

function row(r, v, issue, sheet) {
  const id = esc(r.id);
  const proven = v.state === 'verified';
  const attrs = (field) => ` data-entry-field="${field}" data-id="${id}" aria-describedby="err-${id}"${issue ? ' aria-invalid="true"' : ''}`;
  const state = `<select class="entry-input"${attrs('state')}>`
    + STATES.map(([k, label]) => `<option value="${k}"${k === v.state ? ' selected' : ''}>${label}</option>`).join('') + '</select>';
  return `<fieldset class="entry-row" data-row="${id}"><legend>${r.knockout ? KO : ''}${esc(r.name)} <span class="mono">${id}</span>`
    + `${r.nice ? ' <span class="badge muted">Optional</span>' : ''}</legend>`
    + (r.nice ? '<p class="quiet entry-limit">Not scored; listed as info</p>' : '')
    + (r.test ? limits(sheet?.tests?.[r.id]) : '')
    + '<div class="entry-fields">'
    + `<label class="entry-field">State${state}</label>`
    + `<label class="entry-field">Value${valueInput(r, v, attrs)}</label>`
    + `<label class="entry-field">Where I found it${proven ? ' <span class="quiet">(required)</span>' : ''}`
    + `<input type="text" class="entry-input" autocomplete="off" value="${esc(v.where)}"${attrs('where')}${proven ? ' aria-required="true"' : ''}></label>`
    + `<label class="entry-field">Note <span class="quiet">(optional)</span><input type="text" class="entry-input" autocomplete="off" value="${esc(v.note)}"${attrs('note')}></label>`
    + `</div><p class="entry-error" data-row-error="${id}" id="err-${id}">${esc(issueText(r.id, issue))}</p></fieldset>`;
}

function step2(model, s, ctx) {
  const view = scoreEntry(s, { as_of: model.as_of, policy: ctx.entry.policy });
  const list = checklist(s.commodity) ?? [];
  const sheet = sheetFor(model, s.part_no);
  const profile = profileOf(s.commodity);
  const groups = RUBRIC.categories.map(({ n, name }) => {
    const rows = list.filter((r) => r.cat === n);
    return rows.length ? `<details class="entry-cat" open><summary>${esc(`${n} ${name}`)}</summary>`
      + rows.map((r) => row(r, s.rows[r.id], view.rows[r.id]?.issue ?? null, sheet)).join('') + '</details>' : '';
  }).join('');
  return '<div class="entry-head"><div>'
    + `<p class="eyebrow">${esc(profile?.name ?? s.commodity)} · ${esc(profile?.risk ?? '')} risk · <span class="mono">${esc(s.part_no)}</span></p>`
    + `<p class="entry-name">${esc(s.name)}</p></div>`
    + '<button type="button" class="subtle-button" data-act="entry-change-part">Change part</button></div>'
    + `<div class="panel entry-live" data-entry-live>${livePanel(view, ctx)}</div>`
    + `<div class="entry-gaps" data-entry-gaps>${liveGaps(view, ctx)}</div>`
    + groups
    + '<div class="entry-actions"><button type="button" class="button compact" data-act="entry-save">Save</button>'
    + '<button type="button" class="subtle-button" data-act="entry-cancel">Cancel</button></div>'
    + (ctx.entry.error ? `<p class="entry-error" role="alert">${esc(ctx.entry.error)}</p>` : '');
}

/** The detail column while + New supplier (or Edit) is open. ctx.entry: { state, policy, saveNote, error }. */
export function renderEntry(model, ctx) {
  const s = ctx.entry.state;
  const title = s.id ? `Edit <span class="mono">${esc(s.id)}</span>` : 'New supplier';
  return '<section class="detail entry" aria-labelledby="entry-title">'
    + `<a class="text-link back-link" data-back href="${esc(queueHref(ctx, { supplier: undefined }))}">← Queue</a>`
    + `<h3 id="entry-title" tabindex="-1">${title}</h3>`
    + (ctx.entry.saveNote ? `<p class="quiet" role="status">${esc(ctx.entry.saveNote)}</p>` : '')
    + (s.step === 1 ? step1(model, s, ctx) : step2(model, s, ctx)) + '</section>';
}

/** Focus scroll decision (issue 137). Explicit instant bypasses CSS smooth scrolling in either motion mode. */
export function entryFocusScroll(rect, height, clearTop = 0) {
  if (!rect || (rect.top >= clearTop && rect.bottom <= height)) return null;
  return { block: 'center', behavior: 'instant' };
}

/** Stop pending focus motion without moving the viewport, then reveal only an obscured target (issue 137). */
export function revealEntryFocus(el, viewport, clearTop = 0) {
  if (!el) return null;
  viewport.scrollTo({ left: viewport.scrollX, top: viewport.scrollY, behavior: 'instant' });
  const scroll = entryFocusScroll(el.getBoundingClientRect(), viewport.innerHeight, clearTop);
  if (scroll) el.scrollIntoView(scroll);
  return scroll;
}

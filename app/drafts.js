// Drafts sub-tab: RFI email and audit plan (#43; UIQ-FR-10, -17, UIQ-AC-04, OVR-FR-07, UIQ NG2; DESIGN-SPEC 4.4,
// 4.9, 7; decisions 50-57). Pure: no DOM. The agent's draft text is shown verbatim and escaped, never rewritten; the
// lists and their order are the engine's (ev.rfi_items, ev.audit_focus). main.js does the clipboard.
// Must not import agent/ (it uses node:fs; the dependency runs agent -> app only, decision 52).
import { esc } from './html.js';
import { requirementName } from './criteria.js';

export const UI_DRAFT_LABEL = 'Agent draft — review before sending';
/** Literal copy of agent/drafts.mjs DRAFT_LABEL (AGENT-FR-05); drafts.test.js pins the two equal. */
export const DRAFT_LABEL = 'DRAFT — prepared by an agent for SQE review. Not sent.';

const isObj = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const text = (s) => (typeof s === 'string' && s !== '' ? s : null);
// Same rule as agent/drafts.mjs sameList: same ids, same order, same length.
const sameList = (a, b) => Array.isArray(a) && a.length === b.length && a.every((x, i) => x === b[i]);

/** ev: engine evaluation. drafts: candidate.drafts, any value (null for hand-entered). Never throws. */
export function draftsModel(ev, drafts) {
  const d = isObj(drafts) ? drafts : null;
  const questions = new Map();  // first entry per criterion_id wins
  for (const p of Array.isArray(d?.audit_plan) ? d.audit_plan : []) {
    if (isObj(p) && !questions.has(p.criterion_id)) questions.set(p.criterion_id, text(p.question));
  }
  const rfi = { items: ev.rfi_items.map((id) => ({ id, name: requirementName(id) })), email: text(d?.rfi_email) };
  const plan = { items: ev.audit_focus.map((id, i) => ({ n: i + 1, id, name: requirementName(id), question: questions.get(id) ?? null })) };
  return { rfi, plan, hasDraft: rfi.email !== null || plan.items.some((x) => x.question !== null),
    mismatch: d !== null && !(sameList(d.rfi_items, ev.rfi_items) && sameList(d.audit_focus, ev.audit_focus)) };
}

/** The exact clipboard string, or null when there is nothing to copy. key: 'rfi' | 'plan'. */
export function copyPayload(m, key) {
  if (key === 'rfi') return m.rfi.email;
  if (key !== 'plan' || !m.plan.items.some((x) => x.question !== null)) return null;
  const lines = m.plan.items.map(({ n, id, name, question }) =>
    `${n}. ${name === null ? id : `${name} (${id})`}: ${question ?? 'No question drafted.'}`);
  return `${DRAFT_LABEL}\n\n${lines.join('\n')}`;  // the plan has no in-text label, so the copy carries one (decision 53)
}

const named = (x, tag = '') => `<span class="mono">${esc(x.id)}</span>${x.name === null ? '' : ` ${tag ? `<${tag}>${esc(x.name)}</${tag}>` : esc(x.name)}`}`;
const copyButton = (key, target, label) => `<button type="button" class="subtle-button copy-button" data-copy="${key}"`
  + ` data-copy-target="${target}" aria-label="${label}">Copy</button>`;

// lists: the engine's list(s); the mismatch note sits right below them, then the agent text (draft).
function section(key, title, m, lists, draft, copy) {
  return `<section class="panel draft-panel" aria-labelledby="draft-${key}-h"><p class="eyebrow muted">${UI_DRAFT_LABEL}</p>`
    + `<h4 id="draft-${key}-h">${title}</h4>`
    + '<p class="quiet">Drafted by an agent for a person to review and send. Nothing is sent from this app.</p>'
    + lists
    + (m.mismatch ? '<p class="draft-warn"><span aria-hidden="true">~ </span>Heads up: the draft\'s lists differ from the engine\'s.'
      + ' The engine lists above are the source of truth; review the text before sending.</p>' : '')
    + draft + copy + '<span class="copy-status quiet" role="status" aria-live="polite"></span></section>';
}

/** Drafts sub-tab body (UIQ-FR-10, -17). manual: a hand-entered supplier (issue 77, decision 168): the engine's
 *  lists only, with no agent label, email or Copy. */
export function renderDrafts(m, { manual = false } = {}) {
  const items = m.rfi.items.length
    ? `<p class="quiet">Engine RFI items:</p><ul class="draft-items">${m.rfi.items.map((x) => `<li>${named(x)}</li>`).join('')}</ul>`
    : '<p class="quiet">No information is requested.</p>';
  if (manual) {
    const focus = m.plan.items.length
      ? `<p class="quiet">Engine audit focus:</p><ol class="draft-plan">${m.plan.items.map((x) => `<li>${named(x, 'strong')}</li>`).join('')}</ol>`
      : '<p class="quiet">No audit focus: nothing to probe on site.</p>';
    const panel = (key, title, body) => `<section class="panel draft-panel" aria-labelledby="draft-${key}-h"><h4 id="draft-${key}-h">${title}</h4>${body}</section>`;
    return '<p class="quiet">Entered by hand. No email is drafted; the lists below come from the engine.</p>'
      + `<div class="drafts">${panel('rfi', 'RFI items', items)}${panel('plan', 'Audit focus', focus)}</div>`;
  }
  const email = m.rfi.email === null ? '<p class="quiet">No draft email for this supplier.</p>'
    : `<pre id="draft-rfi" class="draft-text" tabindex="0">${esc(m.rfi.email)}</pre>`;
  const plan = m.plan.items.length
    ? '<p class="quiet">Engine audit focus:</p><ol id="draft-plan" class="draft-plan" tabindex="0">' + m.plan.items.map((x) => `<li>${named(x, 'strong')}<br>`
      + (x.question === null ? '<span class="quiet">No question drafted.</span>' : esc(x.question)) + '</li>').join('') + '</ol>'
    : '<p class="quiet">No audit focus: nothing to probe on site.</p>';
  return '<div class="drafts">'
    + section('rfi', 'RFI email', m, items, email, m.rfi.email === null ? '' : copyButton('rfi', 'draft-rfi', 'Copy RFI email'))
    + section('plan', 'Audit plan', m, plan, '', copyPayload(m, 'plan') === null ? '' : copyButton('plan', 'draft-plan', 'Copy audit plan'))
    + '</div>';
}

// Standards: scoring policy editor (issue 109; PRD-12 UIS-FR-01..10, DESIGN-SPEC 4.1, 4.7; decisions 105-121) and the
// view-only requirement sheet viewer (issue 110; UIS-FR-11, UIS-AC-06; decisions 130-136).
// Pure: no DOM, no fetch. Policy draft operations, ratings, the knockout list, share-link encoding, the browser store,
// the impact diff, the sheet list and the view's HTML. The engine is the only validator (validatePolicy) and the only scorer: impact()
// compares two buildModel() outputs and computes no score; the only arithmetic here is toFixed and the display totals.
import { esc, errorPanel, fmtLimitNumber } from './html.js';
import { uploadPreview } from './sheet-upload.js';
import { RUBRIC, SCORECARD, STARK_REFERENCE, validatePolicy, weightsFromRatings } from './engine.js';
import { requirementName } from './criteria.js';
import { resolvePolicy, policyLabel } from './policy.js';
import { decisionBadge, queueHref, commodityLabel } from './queue.js';
import { monitorHref } from './monitor.js';
import { formatHash } from './route.js';

export const POLICIES_KEY = 'sqc:policies';
export const STORE_SCHEMA = 'sqc-policies/1';
export const RESERVED_ID = STARK_REFERENCE.id;
const RESERVED_MSG = `policy.id: '${RESERVED_ID}' is the built-in ${STARK_REFERENCE.name} and can't be replaced`;
/** Shown and scored for a draft whose name is still empty; Save still requires a real name (UIS-FR-06). */
export const UNTITLED = 'Untitled';
export const REF_KEY = 'ref';
export const SHARED_KEY = 'shared';
export const savedKey = (id) => `saved:${id}`;
/** The Policies row that is checked: the shared link's policy, else the saved active one, else the reference. */
export const checkedKey = (store, shared) => (shared ? SHARED_KEY : activePolicy(store) ? savedKey(store.active) : REF_KEY);

const TOKEN_PREFIX = 'p1.';
const CAT_KEYS = RUBRIC.categories.map((c) => String(c.n));
const METRIC_KEYS = Object.keys(SCORECARD.metrics);
const TIER_KEYS = SCORECARD.tier_order.slice(0, -1);  // lower bounds of every tier but the last, as the engine
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const clone = (v) => JSON.parse(JSON.stringify(v));
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// ---- editor model ----

/** The nine categories, from RUBRIC. */
export const categoryRows = () => RUBRIC.categories.map(({ n, name }) => ({ n, name }));

/** Every knockout criterion id the engine accepts in knockouts_off, in the engine's order (knockoutIds in engine.js):
 *  knockout criteria, then each commodity's required tests when the test criterion is a knockout. Deduped. */
export function knockoutList() {
  const ids = RUBRIC.criteria.filter((c) => c.knockout === true).map((c) => c.id);
  if (RUBRIC.test_criterion.knockout === true) for (const p of RUBRIC.commodities) ids.push(...p.required);
  const risk = Object.fromEntries(RUBRIC.criteria.filter((c) => Array.isArray(c.knockout_risk)).map((c) => [c.id, c.knockout_risk]));
  return [...new Set(ids)].map((id) => ({ id, name: requirementName(id) ?? id,
    note: risk[id] ? `(${risk[id].join(' and ')}-risk commodities only)` : null }));
}

// Ratings stored with the policy, if they reproduce its weights (decision 109); else null.
function storedRatings(policy) {
  const q = policy?.qualification;
  if (!isObj(q?.ratings) || !isObj(q.weights)) return null;
  try {
    const w = weightsFromRatings(q.ratings);
    return CAT_KEYS.every((n) => isNum(q.weights[n]) && Math.abs(w[n] - q.weights[n]) <= 0.01)
      ? Object.fromEntries(CAT_KEYS.map((n) => [n, q.ratings[n]])) : null;
  } catch { return null; }
}

/** 1-5 per category: the stored ratings when they match the weights, else clamp(round(weight / 3), 1, 5). */
export function ratingsOf(policy) {
  const stored = storedRatings(policy);
  if (stored) return stored;
  const w = policy?.qualification?.weights ?? {};
  return Object.fromEntries(CAT_KEYS.map((n) => [n, Math.min(5, Math.max(1, Math.round((isNum(w[n]) ? w[n] : 0) / 3)))]));
}

/** The weights to show. exact: true while the policy has no matching ratings (reference, imported), so its points show as is. */
export function shownWeights(policy) {
  return { weights: policy.qualification.weights, exact: storedRatings(policy) === null };
}

/** A policy whose ratings don't match its weights loses them: weights win (decision 109). Same object when nothing to drop. */
export function normalizeRatings(policy) {
  const q = policy?.qualification;
  if (!isObj(q) || !Object.hasOwn(q, 'ratings') || storedRatings(policy)) return policy;
  const { ratings, ...rest } = q;
  return { ...policy, qualification: rest };
}

/** One category's rating -> all nine stored as ratings, weights from the engine's weightsFromRatings (unrounded). */
export function setRating(policy, n, value) {
  const ratings = { ...ratingsOf(policy), [String(n)]: value };
  return { ...policy, qualification: { ...policy.qualification, weights: weightsFromRatings(ratings), ratings } };
}

// A plain decimal becomes a number; anything else (blank, text, 1e2, 0x10) stays the typed string so the engine
// names it ("expected a number, got ..."). Never coerced to 0 or clamped (decision 114).
const DECIMAL = /^\s*-?(\d+\.?\d*|\.\d+)\s*$/;
export const parseNumber = (raw) => (DECIMAL.test(String(raw)) ? Number(raw) : String(raw));

/** Every number input's data-field (= its path under policy.), in render order. */
export const NUMBER_FIELDS = ['qualification.approve', 'qualification.conditional',
  ...METRIC_KEYS.flatMap((k) => [`scorecard.weights.${k}`, `scorecard.limits.${k}.good`, `scorecard.limits.${k}.watch`]),
  ...TIER_KEYS.map((t) => `scorecard.tiers.${t}`)];

const setIn = (obj, [k, ...rest], v) => ({ ...obj, [k]: rest.length ? setIn(isObj(obj?.[k]) ? obj[k] : {}, rest, v) : v });

/** Immutable update of one number field (NUMBER_FIELDS) or the name. Any other path returns the policy unchanged. */
export function setField(policy, path, raw) {
  if (path === 'name') return { ...policy, name: String(raw) };
  if (!NUMBER_FIELDS.includes(path)) return policy;
  return setIn(policy, path.split('.'), parseNumber(raw));
}

/** on = knockout on (not in knockouts_off). */
export function toggleKnockout(policy, id, on) {
  const off = policy.qualification.knockouts_off.filter((x) => x !== id);
  return { ...policy, qualification: { ...policy.qualification, knockouts_off: on ? off : [...off, id] } };
}

/** null when the engine accepts the policy, else { path, message } with the engine's own message. */
export function checkPolicy(policy) {
  try { validatePolicy(policy); return null; } catch (e) {
    const message = String(e?.message ?? e);
    return { path: message.split(':')[0], message };
  }
}

/** The form of a draft that is scored live: an empty name is shown as Untitled until Save asks for one. */
export const livePolicy = (draft) => (typeof draft.name === 'string' && draft.name.trim() ? draft : { ...draft, name: UNTITLED });

const POLICY_FALLBACK = 'That setting is not valid. Check the value and try again.';
const metricName = (k) => (Object.hasOwn(SCORECARD.metrics, k) ? SCORECARD.metrics[k].name : k);

/** UI sentence for an engine policy error { path, message } (checkPolicy). Never throws; the engine message is untouched
 *  and the typed value is not echoed (issue 162, decision 234). Import and shared-link refusals keep the engine text. */
export function plainPolicyError(err) {
  const p = String(err?.path ?? '');
  const what = String(err?.message ?? '').split(', got')[0];  // the rule only, never the typed value
  if (['policy.id', 'policy.version', 'policy.name'].includes(p)) return 'Name the policy to save it.';
  const [area, key, sub, leaf] = p.replace(/^policy\./, '').split('.');
  if (area === 'qualification') {
    if (key === 'approve') return 'Approved pass mark must be a number from 0 to 100.';
    if (key === 'conditional') return 'Conditional pass mark must be a number from 0 up to, but below, the Approved pass mark.';
    if (key === 'weights') return sub === undefined ? 'Category weights must add up to 100.' : `Category ${sub} weight must be a number, 0 or more.`;
    if (key === 'knockouts_off') return 'Knockout list is not valid.';
  }
  if (area === 'scorecard') {
    if (key === 'weights') return sub === undefined ? 'Metric weights must add up to 100.' : `${metricName(sub)} weight must be a number, 0 or more.`;
    if (key === 'limits' && sub !== undefined && leaf === 'good') return `${metricName(sub)} good limit must be a number.`;
    if (key === 'limits' && sub !== undefined && leaf === 'watch') {
      if (what.includes('>= good')) return `${metricName(sub)} bad limit must be at least the good limit.`;
      if (what.includes('<= good')) return `${metricName(sub)} bad limit must be at most the good limit.`;
      return `${metricName(sub)} bad limit must be a number.`;
    }
    if (key === 'tiers' && sub !== undefined) {
      return what.includes('< ') ? `Tier ${sub} lower bound must be below the next tier up.` : `Tier ${sub} lower bound must be a number.`;
    }
  }
  return POLICY_FALLBACK;
}

// Inputs and blocks an engine error can point at; fieldError picks the longest match.
const BLOCKS = ['qualification.weights', 'qualification.knockouts_off', 'scorecard.weights', 'scorecard.limits', 'scorecard.tiers'];
const FIELD_KEYS = [...NUMBER_FIELDS, ...BLOCKS];

/** The data-field an engine error belongs to, or null (shown as a general line above the editor). */
export function fieldError(error) {
  const p = String(error?.path ?? '');
  if (['policy.id', 'policy.version', 'policy.name'].includes(p)) return 'name';
  if (!p.startsWith('policy.')) return null;
  const rest = p.slice('policy.'.length);
  return FIELD_KEYS.filter((k) => rest === k || rest.startsWith(`${k}.`)).sort((a, b) => b.length - a.length)[0] ?? null;
}

// ---- share link (decision 107) ----

const b64url = (bytes) => { let bin = ''; for (const b of bytes) bin += String.fromCharCode(b); return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };

/** 'p1.' + base64url(UTF-8 JSON). */
export const encodePolicy = (policy) => TOKEN_PREFIX + b64url(new TextEncoder().encode(JSON.stringify(policy)));

/** { ok: true, policy } | { ok: false, error }. Never throws; an invalid policy is refused with the engine's message,
 *  and the Stark Reference id is refused like Import refuses it. */
export function decodePolicy(token) {
  if (typeof token !== 'string' || !token.startsWith(TOKEN_PREFIX)) return { ok: false, error: `policy: expected a token starting ${TOKEN_PREFIX}` };
  let text;
  try {
    const b64 = token.slice(TOKEN_PREFIX.length).replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    text = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  } catch { return { ok: false, error: 'policy: the link is not valid base64url' }; }
  let policy;
  try { policy = JSON.parse(text); } catch { return { ok: false, error: 'policy: the link is not valid JSON' }; }
  const err = checkPolicy(policy);
  if (err) return { ok: false, error: err.message };
  // Same rule as Import (decision 115): a link can't pose as the built-in reference. Share sends no token for it.
  if (policy.id === RESERVED_ID) return { ok: false, error: RESERVED_MSG };
  return { ok: true, policy: normalizeRatings(policy) };
}

// ---- browser store (decision 106) ----

/** { active, policies } from storage. Bad shape reads as empty; an invalid, reserved or repeated policy is dropped;
 *  an active id that is not in the list reads as null (Stark Reference v1). Never throws. */
export function loadStore(storage) {
  const raw = storage?.get?.(POLICIES_KEY);
  if (!isObj(raw) || raw.schema !== STORE_SCHEMA || !Array.isArray(raw.policies)) return { active: null, policies: [] };
  const policies = [];
  for (const p of raw.policies) {
    if (checkPolicy(p) || p.id === RESERVED_ID || policies.some((x) => x.id === p.id)) continue;
    policies.push(normalizeRatings(p));
  }
  return { active: policies.some((p) => p.id === raw.active) ? raw.active : null, policies };
}

/** true when written. false for blocked storage: the caller keeps the store in memory and shows the note. */
export const writeStore = (storage, { active, policies }) => !!storage?.ok && storage.set(POLICIES_KEY, { schema: STORE_SCHEMA, active, policies });

/** The saved policy the store marks active, or null. */
export const activePolicy = (store) => store.policies.find((p) => p.id === store.active) ?? null;

/** Saved id: version + 1 (every save, decision 112); new id: 1. */
export function nextVersion(saved, id) {
  const p = saved.find((x) => x.id === id);
  return p ? p.version + 1 : 1;
}

/** 'policy-<n>', n one more than the highest numeric suffix in use. */
export function newId(policies) {
  const nums = policies.map((p) => /^policy-(\d+)$/.exec(p.id)).filter(Boolean).map((m) => Number(m[1]));
  return `policy-${Math.max(0, ...nums) + 1}`;
}

/** asNew: a new id at version 1, appended. Else the same id at version + 1, in place. Returns { list, policy }. */
export function saveToList(list, policy, { asNew = false } = {}) {
  if (asNew || !list.some((p) => p.id === policy.id)) {
    const saved = { ...policy, id: newId(list), version: 1 };
    return { list: [...list, saved], policy: saved };
  }
  const saved = { ...policy, version: nextVersion(list, policy.id) };
  return { list: list.map((p) => (p.id === policy.id ? saved : p)), policy: saved };
}

export const removeFromList = (list, id) => list.filter((p) => p.id !== id);

/** Import a policy file (decision 115): JSON, then the engine, then the reserved id. An id clash gets a new id and
 *  keeps the version; otherwise id and version are kept, so export -> delete -> import is deep-equal (UIS-AC-04). */
export function importPolicy(text, list) {
  let p;
  try { p = JSON.parse(text); } catch { return { ok: false, error: "The file isn't valid JSON" }; }
  const err = checkPolicy(p);
  if (err) return { ok: false, error: err.message };
  if (p.id === RESERVED_ID) return { ok: false, error: RESERVED_MSG };
  let policy = normalizeRatings(p);
  if (list.some((x) => x.id === policy.id)) policy = { ...policy, id: newId(list) };
  return { ok: true, policy, list: [...list, policy] };
}

/** The export file: the policy as 2-space JSON. */
export const exportPolicy = (policy) => ({
  filename: `policy-${String(policy.id).replace(/[^A-Za-z0-9._-]/g, '_')}-v${policy.version}.json`,
  text: JSON.stringify(policy, null, 2),
});

// ---- impact (decision 116) ----

/** Candidates whose decision or routing differ between two models, and active suppliers whose tier differs.
 *  Scored candidates only (both sides). suppliers is null when either scorecard failed. Compares engine outputs only. */
export function impact(refModel, curModel) {
  const ref = new Map(refModel.candidates.map((c) => [c.id, c]));
  const candidates = [];
  for (const c of curModel.candidates) {
    const r = ref.get(c.id);
    if (c.status !== 'scored' || r?.status !== 'scored') continue;
    const from = { decision: r.evaluation.decision, routing: r.evaluation.routing.to };
    const to = { decision: c.evaluation.decision, routing: c.evaluation.routing.to };
    const decisionChanged = from.decision !== to.decision, routingChanged = from.routing !== to.routing;
    if (decisionChanged || routingChanged) candidates.push({ id: c.id, name: c.name, from, to, decisionChanged, routingChanged });
  }
  let suppliers = null;
  if (refModel.monitor.ok && curModel.monitor.ok) {
    const before = new Map(refModel.monitor.value.suppliers.map((s) => [s.supplier_id, s.current.tier ?? null]));
    const names = new Map((curModel.monitor.active ?? []).map((a) => [a.id, a.name]));
    suppliers = curModel.monitor.value.suppliers
      .map((s) => ({ id: s.supplier_id, name: names.get(s.supplier_id) ?? null, from: before.get(s.supplier_id) ?? null, to: s.current.tier ?? null }))
      .filter((s) => s.from !== s.to);
  }
  return { candidates, suppliers, counts: { candidates: candidates.length, suppliers: suppliers?.length ?? null },
    none: candidates.length === 0 && suppliers !== null && suppliers.length === 0 };
}

// ---- requirement sheets (issue 110, decisions 130-136) ----

const byPart = (a, b) => (a.part_no < b.part_no ? -1 : a.part_no > b.part_no ? 1 : 0);

/** List rows from model.sheets (decision 130), sorted by part_no; [] while model is null.
 *  { sheetKey, commodity, part_no, part_name, ok: true } per loaded sheet. sheetKey is the model.sheets key:
 *  use it, not commodity, to fetch the sheet. commodity is the sheet's catalog commodity; { commodity, part_no: null, ok: false, error } per failed
 *  one, listed last. Uploaded sheets (issue 78) concatenate onto the loaded rows before the sort, carrying uploaded: true. */
export function sheetRows(model) {
  const sheets = model?.sheets ?? {};
  const rows = Object.keys(sheets).map((sheetKey) => {
    const r = sheets[sheetKey];
    return r?.ok ? { sheetKey, commodity: r.value.commodity ?? sheetKey, part_no: r.value.part_no, part_name: r.value.part_name, ok: true, ...(r.value.uploaded ? { uploaded: true } : {}) }
      : { commodity: sheetKey, part_no: null, ok: false, error: r?.error };
  });
  return [...rows.filter((r) => r.ok).sort(byPart), ...rows.filter((r) => !r.ok)];
}

/** The sheet the hash names: null (no sheet key), { kind: 'loading' }, { kind: 'open', sheet } (looked up by the
 *  sheet's own part_no, decision 24; the first in part order wins) or { kind: 'unknown', part, failed } where failed
 *  lists the load errors that could explain it (suppliers.json, then each failed sheet). */
export function sheetView(model, part) {
  if (part === undefined) return null;
  if (!model) return { kind: 'loading' };
  const rows = sheetRows(model);
  const hit = rows.find((r) => r.ok && r.part_no === part);
  if (hit) return { kind: 'open', sheet: model.sheets[hit.sheetKey].value };
  const failed = [model.suppliers?.ok === false ? model.suppliers.error : null, ...rows.filter((r) => !r.ok).map((r) => r.error)];
  return { kind: 'unknown', part, failed: failed.filter(Boolean) };
}

/** The Standards hash for a sheet, keeping role and the policy token; part undefined = the policy editor. */
export const sheetHref = (ctx, part) => formatHash({ view: 'standards', role: ctx.role, policy: ctx.params?.policy, sheet: part });

const OPS = { '<=': '≤', '>=': '≥', '=': '=' };
const dash = (v) => (v === undefined || v === null || v === '' ? '–' : String(v));

/** One condition's limit as stored: digits never rounded, but very small or large numbers are written in powers of ten
 *  (0.000001 -> 1 × 10⁻⁶, fmtLimitNumber, issue 162), booleans Yes/No, lists comma-joined, unknown
 *  operators raw; between endpoints use an en dash (issue 138). The unit follows numbers and lists only: on booleans and strings it names the type ('boolean',
 *  'class', 'designation'), so '= Yes' and '= Class 2' carry none. */
export function limitText(cond) {
  const v = cond?.value;
  if (cond?.operator === 'between' && Array.isArray(v) && v.length === 2) return `${fmtLimitNumber(v[0])}–${fmtLimitNumber(v[1])}${cond.unit ? ` ${cond.unit}` : ''}`;
  const text = Array.isArray(v) ? v.map(fmtLimitNumber).join(', ') : v === true ? 'Yes' : v === false ? 'No' : dash(fmtLimitNumber(v));
  const op = OPS[cond?.operator] ?? cond?.operator;
  const unitOf = (typeof v === 'number' || Array.isArray(v)) && cond?.unit ? ` ${cond.unit}` : '';
  return `${op ? `${op} ` : ''}${text}${unitOf}`;
}

const list = (v) => (Array.isArray(v) ? v.filter(isObj) : []);
// Only the basis that differs from the planning heuristic gets a tag (all shipped rows are 'heuristic').
const basisTag = (b) => (b !== undefined && b !== null && b !== 'heuristic' ? ` <span class="badge muted">basis: ${esc(b)}</span>` : '');
const ROLE = { acceptance: 'Acceptance', setup: 'Setup' };

function ctqTable(sheet) {
  const ctqs = list(sheet.ctqs);
  if (!ctqs.length) return '<p class="quiet">No CTQs listed.</p>';
  const num = (v) => `<td class="mono">${esc(dash(fmtLimitNumber(v)))}</td>`;  // decision 238
  const rows = ctqs.map((c) => `<tr><th scope="row">${esc(dash(c.name))}${basisTag(c.basis)}</th>`
    + `${num(c.nominal)}${num(c.lsl)}${num(c.usl)}<td>${esc(dash(c.unit))}</td></tr>`).join('');
  return '<div class="std-table-wrap"><table class="std-table"><caption class="eyebrow">CTQs</caption><thead><tr>'
    + ['Name', 'Nominal', 'LSL', 'USL', 'Unit'].map((h) => `<th scope="col">${h}</th>`).join('')
    + `</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function testBlock([id, t]) {
  const conds = list(t.conditions);
  const req = t.required === true;
  const rows = conds.map((c) => `<tr${c.kind === 'setup' ? ' class="quiet"' : ''}><th scope="row">${esc(dash(c.measure))}${basisTag(c.basis)}</th>`
    + `<td class="mono">${esc(limitText(c))}</td><td>${esc(ROLE[c.kind] ?? dash(c.kind))}</td></tr>`).join('');
  return `<div class="std-test"><h4>${esc(dash(t.name))} <span class="mono quiet">${esc(id)}</span>`
    + ` <span class="badge${req ? '' : ' muted'}">${req ? 'Required' : 'Optional'}</span></h4>`
    + (conds.length ? `<div class="std-table-wrap"><table class="std-table"><caption class="sr-only">${esc(dash(t.name))} limits</caption>`
      + `<thead><tr><th scope="col">Measure</th><th scope="col">Limit</th><th scope="col">Role</th></tr></thead><tbody>${rows}</tbody></table></div>`
      : '<p class="quiet">No conditions listed.</p>') + '</div>';
}

/** The view-only sheet viewer (UIS-FR-11, UIS-AC-06): header facts, CTQs, tests. No input, select or button inside. */
export function renderSheet(sheet, ctx = {}) {
  const facts = [['Part number', sheet.part_no, true], ['Name', sheet.part_name, false], ['Revision', sheet.revision, true],
    ['Drawing', sheet.drawing_no, true],
    ['Peak weekly demand', sheet.peak_weekly_demand == null ? null : `${sheet.peak_weekly_demand} per week`, true],
    ['Need-by', sheet.need_by_weeks == null ? null : `${sheet.need_by_weeks} weeks`, true]];
  const tests = isObj(sheet.tests) ? Object.entries(sheet.tests).filter(([, t]) => isObj(t)) : [];
  return '<section class="panel std-sheet" aria-labelledby="std-sheet-title">'
    + '<p class="eyebrow" id="std-sheet-title">REQUIREMENT SHEET · VIEW-ONLY</p>'
    + `<h3>${esc(dash(sheet.part_name))}</h3>`
    + `<p><a class="text-link" href="${esc(sheetHref(ctx, undefined))}">← Policy editor</a></p>`
    + (sheet.uploaded ? '<p class="quiet"><span class="badge">Uploaded</span> Uploaded limits apply only to suppliers entered by hand, not to the demo suppliers.</p>' : '')
    + '<dl class="std-facts">' + facts.map(([dt, v, mono]) => `<div><dt>${dt}</dt><dd${mono ? ' class="mono"' : ''}>${esc(dash(v))}</dd></div>`).join('') + '</dl>'
    + (sheet.header ? `<p class="quiet">${esc(sheet.header)}</p>` : '')
    + ctqTable(sheet)
    + '<p class="eyebrow std-tests-title">TESTS</p>'
    + (tests.length ? tests.map(testBlock).join('') : '<p class="quiet">No tests listed.</p>')
    + `<p class="quiet">Limits are synthetic planning heuristics (basis: ${esc(dash(sheet.planning_basis))}).</p>`
    + '</section>';
}

function sheetPanel(sv, ctx) {
  if (sv.kind === 'open') return renderSheet(sv.sheet, ctx);
  if (sv.kind === 'loading') return '<section class="panel std-sheet" aria-label="Requirement sheet"><p class="quiet">Loading data…</p></section>';
  return '<section class="panel std-sheet" aria-labelledby="std-sheet-title"><p class="eyebrow">REQUIREMENT SHEET</p>'
    + `<h3 id="std-sheet-title">Not found</h3><p>No requirement sheet for <span class="mono">${esc(sv.part)}</span>.</p>`
    + `<p><a class="text-link" href="${esc(sheetHref(ctx, undefined))}">← Policy editor</a></p>`
    + sv.failed.map(errorPanel).join('') + '</section>';
}

// The REQUIREMENT SHEETS block of the policies panel: plain links (decision 132), a select at 759 px and below (decision 135).
function sheetsBlock(model, ctx) {
  const head = '<p class="eyebrow std-sheets-title" id="std-sheets-title">REQUIREMENT SHEETS</p>';
  if (!model) return `${head}<p class="quiet">Loading data…</p>`;
  const rows = sheetRows(model);
  if (!rows.length) return head + '<p class="quiet">No requirement sheets loaded.</p><button type="button" class="subtle-button" data-act="sheet-upload">Upload requirement sheet</button><p class="quiet">JSON, CSV or Markdown; PDF is planned for v2.0.</p>';
  const open = ctx.params?.sheet;
  const label = (r) => `${esc(r.part_no)} ${esc(commodityLabel(r.commodity))}`;
  const items = rows.map((r) => (r.ok
    ? `<li><a class="std-sheet-link" href="${esc(sheetHref(ctx, r.part_no))}"${r.part_no === open ? ' aria-current="page"' : ''}>`
      + `<span class="mono">${esc(r.part_no)}</span> ${esc(commodityLabel(r.commodity))}${r.uploaded ? ' <span class="badge">Uploaded</span>' : ''}</a></li>`
    : `<li class="std-sheet-failed"><span class="mono">${esc(r.commodity)}</span> <span class="badge">Couldn't load</span></li>`)).join('');
  const options = rows.filter((r) => r.ok).map((r) => `<option value="${esc(r.part_no)}"${r.part_no === open ? ' selected' : ''}>${label(r)}${r.uploaded ? ' (Uploaded)' : ''}</option>`).join('');
  return head + '<button type="button" class="subtle-button" data-act="sheet-upload">Upload requirement sheet</button><p class="quiet">JSON, CSV or Markdown. PDF is planned for v2.0.</p>' + `<ul class="std-sheet-list" aria-labelledby="std-sheets-title">${items}</ul>`
    + '<div class="std-select std-sheet-select"><label for="std-sheet-select">Requirement sheet</label>'
    + `<select id="std-sheet-select" data-act="select-sheet"><option value="">Policy editor</option>${options}</select></div>`;
}

// ---- view ----

const fid = (f) => `std-${String(f).replace(/[^A-Za-z0-9_-]/g, '-')}`;
const eid = (f) => `${fid(f)}-error`;
const DIR = { lower: ['Good ≤', 'Bad >'], higher: ['Good ≥', 'Bad <'] };
const unit = (k) => (k === 'dppm' ? '' : '%');  // = monitor.js formatMetric: DPPM is a count, the rest are percent

// Error wiring for one input: invalid when the error is on it or on its block.
function aria(f, errField) {
  if (!errField || !(f === errField || f.startsWith(`${errField}.`))) return '';
  return ` aria-invalid="true" aria-describedby="${eid(errField)}"`;
}
const errSlot = (key, errField, err) => (errField === key ? `<p class="std-error" id="${eid(key)}" role="alert">${esc(plainPolicyError(err))}</p>` : '');

const read = (policy, path) => path.split('.').reduce((o, k) => (isObj(o) ? o[k] : undefined), policy);
// The typed text while it still means the stored value (so "85." keeps its dot); else the stored value.
function shown(policy, f, raw) {
  const v = read(policy, f);
  const r = raw?.[f];
  if (r !== undefined && (r === v || parseNumber(r) === v)) return r;
  return v === undefined || v === null ? '' : String(v);
}

function numInput(policy, f, label, e) {
  return `<input type="text" inputmode="decimal" autocomplete="off" class="std-input mono" id="${fid(f)}" data-field="${f}"`
    + ` value="${esc(shown(policy, f, e.raw))}" aria-label="${esc(label)}"${aria(f, e.field)}>`;
}

function policyRows(s) {
  const rows = [{ key: REF_KEY, policy: STARK_REFERENCE, kind: 'reference' },
    ...s.store.policies.map((p) => ({ key: savedKey(p.id), policy: p, kind: 'saved' }))];
  if (s.shared) rows.push({ key: SHARED_KEY, policy: s.shared, kind: 'shared' });
  const checked = checkedKey(s.store, s.shared);
  return rows.map((r) => ({ ...r, checked: r.key === checked }));
}

function rowActions(r, s) {
  const name = esc(policyLabel(r.policy));
  if (r.kind === 'shared') {
    return `<button type="button" class="subtle-button" data-act="save-shared" data-key="${SHARED_KEY}">Save to this browser</button>`
      + `<button type="button" class="subtle-button" data-act="discard-shared" data-key="${SHARED_KEY}">Discard</button>`;
  }
  if (r.kind !== 'saved') return '';
  if (s.ui.confirm === r.key) {
    return `<div class="std-confirm" role="group" aria-label="Confirm delete"><span>Delete ${name}?</span>`
      + `<button type="button" class="subtle-button" data-act="confirm-delete" data-key="${esc(r.key)}">Delete</button>`
      + `<button type="button" class="subtle-button" data-act="cancel" data-key="${esc(r.key)}">Cancel</button></div>`;
  }
  return `<button type="button" class="subtle-button" data-act="delete" data-key="${esc(r.key)}">Delete<span class="sr-only"> ${name}</span></button>`;
}

function tags(r, s) {
  const t = [];
  if (r.kind === 'reference') t.push('read-only');
  if (r.kind === 'shared') t.push('Shared, not saved');
  if (r.checked && s.draft) t.push('Unsaved changes');
  return t.map((x) => ` <span class="badge ${x === 'read-only' ? 'muted' : 'amber'}">${x}</span>`).join('');
}

function policiesPanel(s, model, ctx) {
  const rows = policyRows(s);
  const list = rows.map((r) => '<div class="std-row">'
    + `<button type="button" role="radio" class="std-radio" data-act="select" data-key="${esc(r.key)}" aria-checked="${r.checked}" tabindex="${r.checked ? 0 : -1}">`
    + `<span aria-hidden="true">${r.checked ? '●' : '○'}</span> ${esc(policyLabel(r.policy))}${tags(r, s)}</button>`
    + (rowActions(r, s) ? `<div class="std-row-actions">${rowActions(r, s)}</div>` : '') + '</div>').join('');
  const checked = rows.find((r) => r.checked);
  const options = rows.map((r) => `<option value="${esc(r.key)}"${r.checked ? ' selected' : ''}>${esc(policyLabel(r.policy))}${r.kind === 'reference' ? ' (read-only)' : r.kind === 'shared' ? ' (Shared, not saved)' : ''}</option>`).join('');
  const narrowActions = rowActions(checked, s);
  return '<section class="panel std-policies" aria-labelledby="std-policies-title">'
    + '<p class="eyebrow" id="std-policies-title">POLICIES</p>'
    + `<div class="std-list" role="radiogroup" aria-labelledby="std-policies-title">${list}</div>`
    + `<div class="std-select"><label for="std-select">Active policy</label><select id="std-select" data-act="select-policy">${options}</select>`
    + (narrowActions ? `<div class="std-row-actions">${narrowActions}</div>` : '') + '</div>'
    + '<button type="button" class="subtle-button std-new" data-act="new">+ New policy</button>'
    + sheetsBlock(model, ctx)
    + '</section>';
}

function ratingsBlock(policy, e) {
  const { weights, exact } = shownWeights(policy);
  const ratings = ratingsOf(policy);
  const rows = categoryRows().map(({ n, name }) => {
    const f = `qualification.ratings.${n}`;
    return '<div class="std-rating">'
      + `<label for="${fid(f)}"><span class="mono">${n}</span> ${esc(name)}</label>`
      + `<input type="range" min="1" max="5" step="1" id="${fid(f)}" data-field="${f}" value="${ratings[n]}" aria-describedby="${fid(f)}-w">`
      + `<span class="mono std-rate" aria-hidden="true">${ratings[n]}</span>`
      + `<span class="mono std-weight" id="${fid(f)}-w"><span class="sr-only">weight </span>${weights[n].toFixed(1)}</span></div>`;
  }).join('');
  const total = CAT_KEYS.reduce((sum, n) => sum + weights[n], 0);
  return '<fieldset class="std-block"><legend class="eyebrow">QUALIFICATION · IMPORTANCE 1–5</legend>'
    + `<p class="quiet">Importance 1–5 per category. Weights are normalized to 100${exact ? '; the exact points show until a rating changes' : ''}.</p>`
    + `${rows}<p class="std-total">Total <span class="mono">${total.toFixed(1)}</span></p>`
    + errSlot('qualification.weights', e.field, e.err) + '</fieldset>';
}

function passBlock(policy, e) {
  const field = (f, label) => `<div class="std-field"><label for="${fid(f)}">${label} <span class="quiet">0–100</span></label>`
    + numInput(policy, f, label, e) + errSlot(f, e.field, e.err) + '</div>';
  return '<fieldset class="std-block"><legend class="eyebrow">PASS MARKS</legend><div class="std-pass">'
    + field('qualification.approve', 'APPROVED') + field('qualification.conditional', 'CONDITIONAL') + '</div></fieldset>';
}

function knockoutBlock(policy, e) {
  const f = 'qualification.knockouts_off';
  const off = new Set(policy.qualification.knockouts_off);
  const items = knockoutList().map((k) => '<label class="std-check">'
    + `<input type="checkbox" data-field="${f}" data-key="${esc(k.id)}"${off.has(k.id) ? '' : ' checked'}${aria(f, e.field)}>`
    + ` <span class="mono">${esc(k.id)}</span> ${esc(k.name)}${k.note ? ` <span class="quiet">${esc(k.note)}</span>` : ''}</label>`).join('');
  return '<fieldset class="std-block"><legend class="eyebrow">KNOCKOUTS</legend>'
    + '<p class="quiet">Checked: the knockout is on. A switched-off knockout still scores; it can\'t force NOT APPROVED or cap at CONDITIONAL.</p>'
    + `<div class="std-checks">${items}</div>${errSlot(f, e.field, e.err)}</fieldset>`;
}

function monitorBlock(policy, e) {
  const cell = (f, label, after = '') => `<td>${numInput(policy, f, label, e)}${after}${errSlot(f, e.field, e.err)}</td>`;
  const rows = METRIC_KEYS.map((k) => {
    const { name, direction } = SCORECARD.metrics[k];
    const [good, bad] = DIR[direction];
    const u = unit(k) ? ` <span class="quiet">${unit(k)}</span>` : '';
    return `<tr><th scope="row">${esc(name)}</th>`
      + cell(`scorecard.weights.${k}`, `${name} weight`)
      + `<td><span class="std-op mono" aria-hidden="true">${good}</span>${numInput(policy, `scorecard.limits.${k}.good`, `${name} ${good}`, e)}${u}${errSlot(`scorecard.limits.${k}.good`, e.field, e.err)}</td>`
      + `<td><span class="std-op mono" aria-hidden="true">${bad}</span>${numInput(policy, `scorecard.limits.${k}.watch`, `${name} ${bad}`, e)}${u}${errSlot(`scorecard.limits.${k}.watch`, e.field, e.err)}</td></tr>`;
  }).join('');
  const w = policy.scorecard.weights;
  const total = METRIC_KEYS.reduce((sum, k) => sum + (isNum(w[k]) ? w[k] : 0), 0);
  const tiers = TIER_KEYS.map((t) => {
    const f = `scorecard.tiers.${t}`;
    return `<div class="std-field"><label for="${fid(f)}">${t} ≥</label>${numInput(policy, f, `Tier ${t} lower bound`, e)}${errSlot(f, e.field, e.err)}</div>`;
  }).join('');
  return '<fieldset class="std-block"><legend class="eyebrow">MONITORING · WEIGHTS, LIMITS, CUT-OFFS</legend>'
    + '<div class="std-table-wrap"><table class="std-table" aria-label="Monitoring weights and limits"><thead><tr><th scope="col">Metric</th><th scope="col">Weight</th><th scope="col">Good</th><th scope="col">Bad (the Watch limit)</th></tr></thead>'
    + `<tbody>${rows}</tbody></table></div>`
    + `<p class="std-total">Weights total <span class="mono">${total.toFixed(1)}</span></p>`
    + errSlot('scorecard.weights', e.field, e.err) + errSlot('scorecard.limits', e.field, e.err)
    + `<p class="quiet">Tier cut-offs: lower bounds, inclusive. Below ${TIER_KEYS.at(-1)} is ${SCORECARD.tier_order.at(-1)}.</p>`
    + `<div class="std-pass">${tiers}</div>${errSlot('scorecard.tiers', e.field, e.err)}</fieldset>`;
}

function editorPanel(policy, s, e) {
  const fromRef = !s.draft && s.resolved.kind === 'reference';
  const name = fromRef ? '' : String(policy.name ?? '');
  const general = e.err && e.field === null ? `<p class="std-error" role="alert">${esc(plainPolicyError(e.err))}</p>` : '';
  return '<section class="panel std-editor" aria-label="Policy editor">' + general
    + `<div class="std-field std-name"><label for="${fid('name')}">Policy name</label>`
    + `<input type="text" autocomplete="off" class="std-input" id="${fid('name')}" data-field="name" value="${esc(name)}"`
    + ` placeholder="Name the policy to save it"${aria('name', e.field)}>${errSlot('name', e.field, e.err)}</div>`
    + (fromRef ? `<p class="quiet">${esc(STARK_REFERENCE.name)} is read-only. Any change starts a new, unsaved policy.</p>` : '')
    + ratingsBlock(policy, e) + passBlock(policy, e) + knockoutBlock(policy, e) + monitorBlock(policy, e) + '</section>';
}

function impactBody(model, s, ctx) {
  if (!model) return '<p class="quiet">Loading data…</p>';
  if (!model.suppliers.ok) return errorPanel(model.suppliers.error);
  const ref = s.refModel ?? (s.resolved.policy === STARK_REFERENCE ? model : null);
  if (!ref) return '<p class="quiet">Loading data…</p>';
  const d = impact(ref, model);
  const link = { role: ctx.role, params: { policy: ctx.params?.policy } };
  const head = d.suppliers === null ? plural(d.counts.candidates, 'candidate change')
    : `${plural(d.counts.candidates, 'candidate change')}, ${plural(d.counts.suppliers, 'grade change')}`;
  const cand = d.candidates.map((c) => `<li><a class="list-card std-impact-item" href="${esc(queueHref(link, { supplier: c.id }))}">`
    + `<span class="card-name"><span class="mono">${esc(c.id)}</span> ${esc(c.name)}</span>`
    + (c.decisionChanged ? `<span class="card-meta">${decisionBadge(c.from.decision)} → ${decisionBadge(c.to.decision)}</span>` : '')
    + (c.routingChanged ? `<span class="card-meta quiet">Routing <span class="mono">${esc(c.from.routing)} → ${esc(c.to.routing)}</span></span>` : '')
    + '</a></li>');
  const sup = (d.suppliers ?? []).map((x) => `<li><a class="list-card std-impact-item" href="${esc(monitorHref(link, { active: x.id }))}">`
    + `<span class="card-name"><span class="mono">${esc(x.id)}</span> ${esc(x.name ?? '')}</span>`
    + `<span class="card-meta mono">${esc(x.from ?? 'Unrated')} → ${esc(x.to ?? 'Unrated')}</span></a></li>`);
  const body = d.none ? '<p>No changes.</p>'
    : `<p class="std-count mono">${head}</p>${cand.length + sup.length ? `<ul class="std-impact-list">${[...cand, ...sup].join('')}</ul>` : ''}`;
  const noMonitor = d.suppliers === null ? `<p class="quiet">Grades couldn't be compared: the scorecard didn't load.</p>${model.monitor.ok ? '' : errorPanel(model.monitor.error)}` : '';
  return body + noMonitor;
}

function impactPanel(model, s, ctx, editorName) {
  const u = s.ui;
  const unnamed = !editorName.trim();
  return '<section class="panel std-impact" aria-labelledby="std-impact-title">'
    + '<p class="eyebrow" id="std-impact-title">IMPACT vs STARK REF v1</p>'
    + impactBody(model, s, ctx)
    + '<div class="std-actions">'
    + `<button type="button" class="button compact" data-act="save"${unnamed ? ' aria-disabled="true" aria-describedby="std-save-hint"' : ''}>Save</button>`
    // Visible reason beside a disabled Save (issue 162, decision 235).
    + (unnamed ? '<span class="quiet std-save-hint" id="std-save-hint">Name the policy to save it</span>' : '')
    + '<button type="button" class="subtle-button" data-act="share">Share</button>'
    + '<button type="button" class="subtle-button" data-act="export">Export</button>'
    + '<button type="button" class="subtle-button" data-act="import">Import</button>'
    + (s.draft ? '<button type="button" class="subtle-button" data-act="discard">Discard changes</button>' : '')
    + '<button type="button" class="subtle-button" data-act="reset">Reset to Stark Ref v1</button></div>'
    + (u.saveNote ? `<p class="std-note">${esc(u.saveNote)}</p>` : '')
    + (u.actionError ? `<p class="std-error" role="alert">${esc(u.actionError)}</p>` : '')
    + (u.importError ? `<p class="std-error" role="alert">Import refused: ${esc(u.importError)}</p>` : '')
    + (u.share ? `<p class="quiet">Share link</p><p class="std-link mono" id="std-share-link" tabindex="-1">${esc(u.share)}</p>` : '')
    + `<p class="std-status" role="status">${esc(u.status ?? '')}</p>`
    + '</section>';
}

/** Default state for a render with no main.js state (tests, first paint): the reference, nothing saved. */
const DEFAULT_STATE = { store: { active: null, policies: [] }, shared: null, sharedError: null, draft: null, refModel: null, ui: {} };

/** The Standards body after the view head. ctx.standards: main.js policy state (see DEFAULT_STATE for its shape).
 *  ctx.params.sheet (issue 110) swaps the editor column for the sheet viewer; the draft and the impact panel stay. */
export function renderStandards(model, ctx = {}) {
  const s = { ...DEFAULT_STATE, ...(ctx.standards ?? {}) };
  s.ui = s.ui ?? {};
  s.resolved = s.resolved ?? resolvePolicy({ shared: s.shared, saved: activePolicy(s.store) });
  const policy = s.draft ?? s.resolved.policy;
  const err = s.ui.error ?? null;
  const e = { err, field: err ? fieldError(err) : null, raw: s.ui.raw ?? {} };
  const editorName = !s.draft && s.resolved.kind === 'reference' ? '' : String(policy.name ?? '');
  const refused = s.sharedError ? `<p class="std-error" role="alert">This link's policy was refused: ${esc(s.sharedError)}</p>` : '';
  const note = s.ui.note ? `<p class="std-note" role="status">${esc(s.ui.note)}</p>` : '';
  const sv = sheetView(model, ctx.params?.sheet);
  return refused + note + '<div class="standards">' + policiesPanel(s, model, ctx)
    + sheetContent(s, sv, ctx, policy, e) + impactPanel(model, s, ctx, editorName) + '</div>';
}

// Upload uses the existing sheet viewer; its actions sit outside the view-only content (issue 78).
function sheetContent(state, view, ctx, policy, error) {
  if (state.upload) return uploadPreview(state.upload);
  if (!view) return editorPanel(policy, state, error);
  const panel = sheetPanel(view, ctx);
  if (view.kind !== 'open' || !view.sheet.uploaded) return panel;
  return '<div class="sheet-column"><div class="std-actions">'
    + '<button type="button" class="subtle-button" data-act="sheet-export">Export sheet</button>'
    + (state.ui.sheetDelete === view.sheet.part_no ? '<span>Delete this uploaded sheet?</span><button type="button" class="subtle-button" data-act="sheet-confirm-delete">Delete uploaded sheet</button><button type="button" class="subtle-button" data-act="sheet-keep">Cancel delete</button>'
      : '<button type="button" class="subtle-button" data-act="sheet-delete">Delete sheet</button>')
    + '</div>' + panel + '</div>';
}

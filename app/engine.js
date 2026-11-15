import { RUBRIC, STARK_REFERENCE, SCORECARD } from './rubric.js';

// Single export surface (PRD-01 § Engine API): UI and tests read data and functions (evaluate, scorecard,
// validatePolicy, ...) from this module.
export { RUBRIC, STARK_REFERENCE, SCORECARD };

// Qualification engine: pure functions, no I/O. Every score in the app comes from here.
// Spec: docs/RUBRIC.md (Scoring model, Value types, Band edges, Decision and routing, Team scoring policy,
// Outputs per supplier: gaps, RFI items, audit focus) and docs/product/PRD-01. rubric.js is data only,
// so the one static module above keeps this browser-safe.
// Errors are thrown as Error with the criterion id (or field path) first ("<id>: <what>").
// Category 4 is reached only through rubric.test_criterion and the commodity profiles: no test id
// or commodity key is written in this file (QUAL-NFR-05).
// Scorecard: parseHistory and scorecard below, spec docs/SCORECARD.md and docs/product/PRD-02.
// Thresholds, windows and look-backs are read from SCORECARD and the policy, never written here.

const STATES = ['verified', 'assumed', 'missing'];

// Routing (RUBRIC.md § Decision and routing). A criterion id, not a test id or commodity key.
const SECOND_SOURCE = '9.second_source';
const JUNIOR_RISKS = ['Low', 'Medium'];

// Gaps (RUBRIC.md § Outputs per supplier 2-4). Gap type is the evidence state, verified renamed fail:
// an assumed knockout with a failing claim stays 'assumed' (so it is an RFI item) even though it fails.
const GAP_TYPE = { verified: 'fail', assumed: 'assumed', missing: 'missing' };
const AUDIT_FOCUS_MAX = 3; // "up to 3 gaps"

// Junior only for APPROVED + Low/Medium risk + second source verified true; otherwise Senior with every
// rule that forced it, in RUBRIC.md order. Reads no policy: weights, pass marks and knockout switches
// reach routing only through the decision (category 9 weight 0 does not change sole_source).
// ss is the extraction entry (undefined when absent = missing); verified values are already checked boolean.
function route(decision, risk, ss) {
  const confirmed = ss?.state === 'verified' && ss.value === true;
  if (decision === 'APPROVED' && JUNIOR_RISKS.includes(risk) && confirmed) {
    return { sole_source: false, routing: { to: 'junior', reasons: [`APPROVED, ${risk} risk, second source confirmed`] } };
  }
  const reasons = [];
  if (decision !== 'APPROVED') reasons.push(decision);
  if (risk === 'High') reasons.push('High-risk commodity');
  // Evidence state wins: only verified false is 'Sole source'; assumed (any value), missing, absent are unconfirmed.
  if (!confirmed) reasons.push(ss?.state === 'verified' ? 'Sole source' : 'Second source unconfirmed');
  return { sole_source: !confirmed, routing: { to: 'senior', reasons } };
}

const OPS = { '>=': (a, b) => a >= b, '<=': (a, b) => a <= b, '>': (a, b) => a > b, '<': (a, b) => a < b };

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

// Days in month m (1-12) of year y, proleptic Gregorian.
function daysInMonth(y, m) {
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

// ISO day check by hand: shape, month 1-12, day within the month (leap years included).
function isIsoDay(s) {
  if (typeof s !== 'string' || !ISO_DAY.test(s)) return false;
  const y = Number(s.slice(0, 4)), m = Number(s.slice(5, 7)), d = Number(s.slice(8, 10));
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= daysInMonth(y, m);
}

// JSON.stringify throws on a BigInt or a cyclic object; fall back so the caller's labelled error still gets thrown.
const show = (v) => {
  if (v === undefined) return 'undefined';
  try { return JSON.stringify(v); } catch { return typeof v === 'bigint' ? `${v}n` : String(v); }
};

// Validate value against the criterion type, then apply its rule. Returns 0..3.
function applyRule(criterion, value, as_of) {
  const { id, type, rule } = criterion;
  if (type === 'bool') {
    if (typeof value !== 'boolean') throw new Error(`${id}: expected a boolean, got ${show(value)}`);
    return rule[String(value)];
  }
  if (type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`${id}: expected a finite number, got ${show(value)}`);
    }
    // First match wins; the last row has no op (the else). No rounding: 1.3299999 is below 1.33.
    for (const band of rule) if (!('op' in band) || OPS[band.op](value, band.x)) return band.score;
    throw new Error(`${id}: band list has no else row`);
  }
  if (type === 'date') {
    if (!isIsoDay(value)) throw new Error(`${id}: expected an ISO day YYYY-MM-DD, got ${show(value)}`);
    if (!isIsoDay(as_of)) throw new Error(`${id}: invalid as_of ${show(as_of)}`);
    // Zero-padded ISO days compare correctly as strings. Expiry on as_of passes.
    return value >= as_of ? rule.ge_as_of : rule.lt_as_of;
  }
  if (type === 'enum') {
    if (typeof value !== 'string' || !Object.hasOwn(rule, value)) {
      throw new Error(`${id}: expected one of ${Object.keys(rule).join(', ')}, got ${show(value)}`);
    }
    return rule[value];
  }
  throw new Error(`${id}: unknown type ${show(type)}`);
}

/** Score one criterion or catalog test, 0..3.
 *  criterion: a definition { id, type, rule, ... } from RUBRIC.criteria or RUBRIC.tests.
 *  evidence:  { id?, state, value, citation, note? }, or null/undefined when the extraction left it out (= missing).
 *  as_of:     'YYYY-MM-DD'; read only for type 'date'. */
export function scoreCriterion(criterion, evidence, as_of) {
  const id = criterion.id;
  if (evidence == null) return 0;
  const { state, value, citation } = evidence;
  if (!STATES.includes(state)) throw new Error(`${id}: unknown state ${show(state)}`);
  if (evidence.id !== undefined && evidence.id !== id) {
    throw new Error(`${id}: evidence is for ${show(evidence.id)}`);
  }
  if (state === 'missing') return 0;
  if (state === 'verified') {
    if (value == null) throw new Error(`${id}: verified needs a value`);
    if (citation == null || citation === '') throw new Error(`${id}: verified needs a citation`);
    return applyRule(criterion, value, as_of);
  }
  // assumed: no value = 1; a claimed value is capped at 1, so a failing claim scores 0.
  if (value == null) return 1;
  return Math.min(1, applyRule(criterion, value, as_of));
}

/** Definition for an id from rubric.criteria or rubric.tests; throws naming an unknown id. */
export function findCriterion(rubric, id) {
  const def = rubric.criteria.find((c) => c.id === id) ?? rubric.tests.find((t) => t.id === id);
  if (!def) throw new Error(`${id}: unknown criterion id`);
  return def;
}

const isObj = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const catKeys = (rubric) => rubric.categories.map((c) => String(c.n));

// Half up to 1 decimal. toPrecision(12) strips binary noise (849.4999999999999 -> 849.5);
// genuine scores are small-denominator rationals, far more than 1e-12 from a tie.
const round1 = (x) => Math.round(Number((x * 10).toPrecision(12))) / 10;

// IDs a policy may switch off: knockout criteria, plus every test some commodity lists as required.
function knockoutIds(rubric) {
  const ids = rubric.criteria.filter((c) => c.knockout === true).map((c) => c.id);
  if (rubric.test_criterion.knockout === true) for (const p of rubric.commodities) ids.push(...p.required);
  return new Set(ids);
}

// Policy weights at path over keys: an object, every key present, no other key ("unknown <noun>"),
// each a number >= 0, summing to 100 ±0.01. Shared by both policy halves.
function checkWeights(path, w, keys, noun) {
  if (!isObj(w)) throw new Error(`${path}: expected an object`);
  for (const n of keys) if (!Object.hasOwn(w, n)) throw new Error(`${path}.${n}: missing`);
  for (const k of Object.keys(w)) if (!keys.includes(k)) throw new Error(`${path}.${k}: unknown ${noun}`);
  let sum = 0;
  for (const n of keys) {
    if (!isNum(w[n]) || w[n] < 0) throw new Error(`${path}.${n}: expected a number >= 0, got ${show(w[n])}`);
    sum += w[n];
  }
  // ±0.01 is inclusive; 1e-9 only absorbs float noise (|99.99 - 100| is 0.010000000000005).
  if (Math.abs(sum - 100) > 0.01 + 1e-9) throw new Error(`${path}: sum is ${sum}, expected 100 (±0.01)`);
}

// RUBRIC.md § Team scoring policy. Throws naming the field path first. Reads only policy.qualification.
function validateQualPolicy(policy, rubric) {
  if (!isObj(policy)) throw new Error('policy: expected an object');
  const q = policy.qualification;
  const P = 'policy.qualification';
  if (!isObj(q)) throw new Error(`${P}: expected an object`);
  checkWeights(`${P}.weights`, q.weights, catKeys(rubric), 'category');
  const { approve, conditional, knockouts_off } = q;
  if (!isNum(approve) || approve < 0 || approve > 100) {
    throw new Error(`${P}.approve: expected a number 0-100, got ${show(approve)}`);
  }
  if (!isNum(conditional) || conditional < 0 || conditional >= approve) {
    throw new Error(`${P}.conditional: expected a number >= 0 and < approve (${approve}), got ${show(conditional)}`);
  }
  if (!Array.isArray(knockouts_off)) throw new Error(`${P}.knockouts_off: expected an array`);
  const ko = knockoutIds(rubric);
  for (const id of knockouts_off) {
    if (typeof id !== 'string' || !ko.has(id)) {
      throw new Error(`${P}.knockouts_off: ${show(id)} is not a knockout criterion id`);
    }
  }
  checkPolicyMeta(policy);
}

// Policy identity (RUBRIC.md § Team scoring policy): every result names the policy that scored it.
// Called last by both validators so every earlier message and its order is unchanged.
function checkPolicyMeta(policy) {
  if (typeof policy.id !== 'string' || policy.id === '') throw new Error(`policy.id: expected a non-empty string, got ${show(policy.id)}`);
  if (!Number.isInteger(policy.version) || policy.version < 1) throw new Error(`policy.version: expected an integer >= 1, got ${show(policy.version)}`);
  if (typeof policy.name !== 'string' || policy.name === '') throw new Error(`policy.name: expected a non-empty string, got ${show(policy.name)}`);
}

// Evidence fields are primitives only (RUBRIC.md value types), so no output row shares an input object.
const isPrimitive = (v) => v == null || typeof v === 'boolean' || typeof v === 'string' || isNum(v);

/** Evaluate one supplier packet: policy { id, version, name }, category scores, total, knockouts, decision,
 *  routing, sole_source, gaps, nice_to_have (not-verified nice-to-have tests, the info items), rfi_items,
 *  audit_focus, warnings.
 *  extraction: { supplier_id, commodity, criteria: [{ id, state, value, citation, note? }] }; value is a
 *  primitive (null, boolean, finite number, string), citation and note a string or null.
 *  as_of: 'YYYY-MM-DD' evaluation day. policy: a team scoring policy (default Stark Reference v1).
 *  rubric: defaults to RUBRIC; used for everything, including policy validation. Pure, no mutation. */
export function evaluate(extraction, { as_of, policy = STARK_REFERENCE, rubric = RUBRIC } = {}) {
  if (!isIsoDay(as_of)) throw new Error(`as_of: expected an ISO day YYYY-MM-DD, got ${show(as_of)}`);
  validateQualPolicy(policy, rubric);
  if (!isObj(extraction)) throw new Error('extraction: expected an object');
  if (!Array.isArray(extraction.criteria)) throw new Error('criteria: expected an array');
  for (const [i, ev] of extraction.criteria.entries()) {
    if (!isObj(ev) || typeof ev.id !== 'string') throw new Error(`criteria[${i}]: expected an object with a string id`);
    if (!isPrimitive(ev.value)) {
      throw new Error(`${ev.id}: value: expected null, a boolean, a finite number or a string, got ${show(ev.value)}`);
    }
    for (const f of ['citation', 'note']) {
      if (ev[f] != null && typeof ev[f] !== 'string') throw new Error(`${ev.id}: ${f}: expected null or a string, got ${show(ev[f])}`);
    }
  }
  const profile = rubric.commodities.find((p) => p.key === extraction.commodity);
  if (!profile) throw new Error(`commodity: unknown commodity ${show(extraction.commodity)}`);
  if (!rubric.risk_classes.includes(profile.risk)) throw new Error(`${profile.key}: unknown risk ${show(profile.risk)}`);

  // Classify entries: scored, nice-to-have (validated, never scored), or not applicable (ignored + warning).
  const testIds = new Set(rubric.tests.map((t) => t.id));
  const nice = profile.nice ?? [];
  const seen = new Set();
  const evidence = new Map();
  const niceState = new Map();
  const warnings = [];
  for (const ev of extraction.criteria) {
    const { id } = ev;
    if (seen.has(id)) throw new Error(`${id}: duplicate evidence`);
    seen.add(id);
    const def = findCriterion(rubric, id);
    if (testIds.has(id) && !profile.required.includes(id)) {
      if (nice.includes(id)) {
        scoreCriterion(def, ev, as_of); // throws on bad evidence; result discarded
        niceState.set(id, ev.state);
      } else warnings.push(`${id}: not applicable to ${profile.key}, ignored`);
      continue;
    }
    evidence.set(id, ev);
  }

  const { weights, approve, conditional, knockouts_off } = policy.qualification;
  const off = new Set(knockouts_off);
  const tc = rubric.test_criterion;
  const failed = [];
  const assumed = [];
  let raw = 0;
  const categories = rubric.categories.map(({ n, name }) => {
    // Required tests first (profile order), then the category's criteria, as in the Criteria table.
    const defs = [
      ...(n === tc.cat ? profile.required.map((id) => [findCriterion(rubric, id), tc.knockout === true]) : []),
      ...rubric.criteria.filter((c) => c.cat === n)
        .map((c) => [c, c.knockout === true && (!c.knockout_risk || c.knockout_risk.includes(profile.risk))]),
    ];
    const criteria = defs.map(([def, ko]) => {
      const ev = evidence.get(def.id) ?? null;
      const score = scoreCriterion(def, ev, as_of);
      const knockout = ko && !off.has(def.id);
      if (knockout && score === 0) failed.push(def.id);
      else if (knockout && ev.state === 'assumed') assumed.push(def.id);
      const state = ev ? ev.state : 'missing';
      return { id: def.id, knockout, state, value: ev?.value ?? null,
        citation: ev?.citation ?? null, note: ev?.note ?? null, score, gap: score === 3 ? null : GAP_TYPE[state] };
    });
    const weight = weights[n];
    const sum = criteria.reduce((s, r) => s + r.score, 0);
    const unrounded = sum / (3 * criteria.length) * weight;
    raw += unrounded;
    return { n, name, weight, score: round1(unrounded), criteria };
  });
  const total = round1(raw); // from the unrounded category scores, never the displayed ones

  let decision = 'CONDITIONAL';
  if (failed.length > 0 || total < conditional) decision = 'NOT APPROVED';
  else if (total >= approve && assumed.length === 0) decision = 'APPROVED';

  const { routing, sole_source } = route(decision, profile.risk, evidence.get(SECOND_SOURCE));

  // Gap list in criteria-table order (categories, then row order). i is the table position among gaps.
  const gapRows = categories.flatMap((c) => c.criteria.filter((r) => r.gap !== null).map((row) => ({ row, weight: c.weight })))
    .map((g, i) => ({ ...g, i }));
  const gaps = gapRows.map(({ row }) => ({ id: row.id, type: row.gap, score: row.score }));
  const rfi_items = gaps.filter((g) => g.type !== 'fail').map((g) => g.id);
  // Effective knockout first, then lowest score, then higher policy weight, then table order.
  const audit_focus = gapRows.sort((a, b) => (b.row.knockout - a.row.knockout) || (a.row.score - b.row.score)
    || (b.weight - a.weight) || (a.i - b.i)).slice(0, AUDIT_FOCUS_MAX).map((g) => g.row.id);
  // Info items: every nice-to-have test not verified (absent = missing), profile order. Unscored, never requested.
  const nice_to_have = nice.filter((id) => niceState.get(id) !== 'verified')
    .map((id) => ({ id, state: niceState.get(id) ?? 'missing' }));

  return { supplier_id: extraction.supplier_id ?? null, commodity: profile.key, risk: profile.risk,
    policy: { id: policy.id, version: policy.version, name: policy.name }, total,
    categories, knockouts: { failed, assumed }, decision, routing, sole_source,
    gaps, nice_to_have, rfi_items, audit_focus, warnings };
}

/** Validate a whole team policy (qualification half, then scorecard half) against RUBRIC; throws the same
 *  field-named error evaluate() or scorecard() would. The Standards editor and Import call this (issue 109). */
export function validatePolicy(policy) {
  validateQualPolicy(policy, RUBRIC);
  validateScorecardPolicy(policy);
}

/** 1-5 importance rating per category -> weights normalized to 100, unrounded.
 *  The reference policy keeps its exact points until a rating changes; that rule lives in the UI. */
export function weightsFromRatings(ratings) {
  if (!isObj(ratings)) throw new Error('ratings: expected an object');
  const keys = catKeys(RUBRIC);
  for (const k of Object.keys(ratings)) if (!keys.includes(k)) throw new Error(`ratings.${k}: unknown category`);
  for (const n of keys) {
    if (!Object.hasOwn(ratings, n)) throw new Error(`ratings.${n}: missing`);
    const r = ratings[n];
    if (!Number.isInteger(r) || r < 1 || r > 5) throw new Error(`ratings.${n}: expected an integer 1-5, got ${show(r)}`);
  }
  const sum = keys.reduce((s, n) => s + ratings[n], 0);
  return Object.fromEntries(keys.map((n) => [n, ratings[n] / sum * 100]));
}

// ---- Scorecard (docs/SCORECARD.md, docs/product/PRD-02) ----

const HISTORY_HEADER = 'date,supplier_id,part_no,received_qty,rejected_qty,on_time,defect_found_at,'
  + 'failure_mode_code,scar_id,scar_opened,scar_closed';
const HISTORY_COLS = HISTORY_HEADER.split(',');
const INT_COLS = ['received_qty', 'rejected_qty', 'on_time'];
const NULLABLE_COLS = ['failure_mode_code', 'scar_id', 'scar_opened', 'scar_closed'];
const FOUND_AT = ['incoming', 'line', 'field', 'none'];
const ESCAPED_AT = ['line', 'field'];
const SUPPLIER_ID = /^ACT-\d{2}$/;

// Days since 1970-01-01 for an ISO day (days-from-civil, Howard Hinnant). Exact integers, no clock.
function dayNumber(s) {
  let y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7)), d = Number(s.slice(8, 10));
  if (m <= 2) y -= 1;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

// Month number for 'YYYY-MM...' and back; string month arithmetic only.
const monthNo = (s) => Number(s.slice(0, 4)) * 12 + Number(s.slice(5, 7)) - 1;
const monthStr = (n) => `${String(Math.floor(n / 12)).padStart(4, '0')}-${String((n % 12) + 1).padStart(2, '0')}`;
const monthEnd = (ym) => `${ym}-${daysInMonth(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)))}`;

// Row rules from SCORECARD.md § data/history.csv. label(i) names the row; the first violation in row
// order throws "<label>: <column>: <what>, got <value>". The trust boundary for every scorecard input.
function checkHistory(rows, label) {
  const scars = new Map(); // scar_id -> first row index carrying it
  // A for loop, not forEach, so a hole in a sparse array is checked (and rejected) like any row.
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const at = label(i);
    const bad = (col, what, v) => { throw new Error(`${at}: ${col}: ${what}, got ${show(v)}`); };
    if (!isObj(r)) throw new Error(`${at}: expected an object`);
    if (!isIsoDay(r.date)) bad('date', 'expected an ISO day YYYY-MM-DD', r.date);
    if (typeof r.supplier_id !== 'string' || !SUPPLIER_ID.test(r.supplier_id)) bad('supplier_id', 'expected ACT-nn', r.supplier_id);
    if (typeof r.part_no !== 'string' || r.part_no === '') bad('part_no', 'expected a non-empty string', r.part_no);
    if (!Number.isInteger(r.received_qty) || r.received_qty <= 0) bad('received_qty', 'expected an integer > 0', r.received_qty);
    const rej = r.rejected_qty;
    if (!Number.isInteger(rej) || rej < 0 || rej > r.received_qty) {
      bad('rejected_qty', `expected an integer from 0 to received_qty (${r.received_qty})`, rej);
    }
    if (r.on_time !== 0 && r.on_time !== 1) bad('on_time', 'expected 0 or 1', r.on_time);
    if (!FOUND_AT.includes(r.defect_found_at)) bad('defect_found_at', `expected one of ${FOUND_AT.join(', ')}`, r.defect_found_at);
    if ((r.defect_found_at === 'none') !== (rej === 0)) {
      throw new Error(`${at}: defect_found_at: expected "none" if and only if rejected_qty is 0, `
        + `got ${show(r.defect_found_at)} with rejected_qty ${rej}`);
    }
    const fm = r.failure_mode_code;
    if (rej > 0 && (typeof fm !== 'string' || fm === '')) bad('failure_mode_code', 'required when rejected_qty > 0', fm);
    if (rej === 0 && fm !== null) bad('failure_mode_code', 'expected empty when rejected_qty is 0', fm);
    const { scar_id: id, scar_opened: opened, scar_closed: closed } = r;
    if (id !== null && (typeof id !== 'string' || id === '')) bad('scar_id', 'expected empty or a non-empty string', id);
    if (id !== null && !isIsoDay(opened)) bad('scar_opened', 'expected an ISO day YYYY-MM-DD when scar_id is set', opened);
    if (id === null && opened !== null) bad('scar_opened', 'expected empty when scar_id is empty', opened);
    if (closed !== null && !isIsoDay(closed)) bad('scar_closed', 'expected empty or an ISO day YYYY-MM-DD', closed);
    if (id === null && closed !== null) bad('scar_closed', 'expected empty when scar_id is empty', closed);
    if (closed !== null && closed < opened) bad('scar_closed', `expected on or after scar_opened (${opened})`, closed);
    if (id === null) continue;
    if (!scars.has(id)) { scars.set(id, i); continue; }
    const j = scars.get(id);
    for (const col of ['scar_opened', 'scar_closed']) {
      if (r[col] !== rows[j][col]) {
        throw new Error(`${at}: ${col}: ${id} differs from ${label(j)} (${show(r[col])} vs ${show(rows[j][col])})`);
      }
    }
  }
}

/** Parse data/history.csv text into typed rows and validate every SCORECARD.md rule.
 *  Errors name the file line ("row 2" is the first data row). Empty cells in the nullable
 *  columns become null; integer cells become numbers. No trimming, no quoting. */
export function parseHistory(text) {
  if (typeof text !== 'string') throw new Error('history: expected text');
  const lines = text.split('\n').map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));
  if (lines.at(-1) === '') lines.pop();
  if (lines[0] !== HISTORY_HEADER) throw new Error(`header: expected "${HISTORY_HEADER}", got "${lines[0] ?? ''}"`);
  const rows = lines.slice(1).map((line, i) => {
    const cells = line.split(',');
    if (cells.length !== HISTORY_COLS.length) {
      throw new Error(`row ${i + 2}: expected ${HISTORY_COLS.length} columns, got ${cells.length}`);
    }
    return Object.fromEntries(HISTORY_COLS.map((col, k) => {
      const v = cells[k];
      // Canonical integers only: no leading zeros, no "-0" (they stay strings and fail the row check).
      if (INT_COLS.includes(col)) return [col, /^(0|-?[1-9]\d*)$/.test(v) ? Number(v) : v];
      if (NULLABLE_COLS.includes(col)) return [col, v === '' ? null : v];
      return [col, v];
    }));
  });
  checkHistory(rows, (i) => `row ${i + 2}`);
  return rows;
}

// SCORECARD.md § Composite and tier (Policy). Throws naming the field path first. Reads only policy.scorecard.
function validateScorecardPolicy(policy) {
  const P = 'policy.scorecard';
  const s = policy?.scorecard;
  if (!isObj(s)) throw new Error(`${P}: expected an object`);
  const keys = Object.keys(SCORECARD.metrics);
  checkWeights(`${P}.weights`, s.weights, keys, 'metric');

  const L = s.limits;
  if (!isObj(L)) throw new Error(`${P}.limits: expected an object`);
  for (const k of keys) if (!Object.hasOwn(L, k)) throw new Error(`${P}.limits.${k}: missing`);
  for (const k of Object.keys(L)) if (!keys.includes(k)) throw new Error(`${P}.limits.${k}: unknown metric`);
  for (const k of keys) {
    const at = `${P}.limits.${k}`;
    if (!isObj(L[k])) throw new Error(`${at}: expected an object`);
    const { good, watch } = L[k];
    if (!isNum(good)) throw new Error(`${at}.good: expected a number, got ${show(good)}`);
    if (!isNum(watch)) throw new Error(`${at}.watch: expected a number, got ${show(watch)}`);
    // Same direction as the table; equal limits are allowed (empty Watch band).
    if (SCORECARD.metrics[k].direction === 'lower' ? watch < good : watch > good) {
      const op = SCORECARD.metrics[k].direction === 'lower' ? '>=' : '<=';
      throw new Error(`${at}.watch: expected a number ${op} good (${good}), got ${show(watch)}`);
    }
  }

  const T = s.tiers;
  const ranked = SCORECARD.tier_order.slice(0, -1); // lower bounds of every tier but the last
  if (!isObj(T)) throw new Error(`${P}.tiers: expected an object`);
  for (const t of ranked) if (!Object.hasOwn(T, t)) throw new Error(`${P}.tiers.${t}: missing`);
  for (const t of Object.keys(T)) if (!ranked.includes(t)) throw new Error(`${P}.tiers.${t}: unknown tier`);
  for (const t of ranked) if (!isNum(T[t])) throw new Error(`${P}.tiers.${t}: expected a number, got ${show(T[t])}`);
  ranked.forEach((t, i) => {
    const up = ranked[i - 1];
    if (i > 0 && !(T[t] < T[up])) throw new Error(`${P}.tiers.${t}: expected a number < ${up} (${T[up]}), got ${show(T[t])}`);
  });
  checkPolicyMeta(policy);
}

// Band and points for a rounded value under the policy's limits and weights.
function rate(key, value, limits, weights) {
  if (value === null) return { value: null, band: null, points: null };
  const { good, watch } = limits[key];
  const band = SCORECARD.metrics[key].direction === 'lower'
    ? (value <= good ? 'good' : value <= watch ? 'watch' : 'bad')
    : (value >= good ? 'good' : value >= watch ? 'watch' : 'bad');
  return { value, band, points: SCORECARD.band_points[band] * weights[key] };
}

const byStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sumOf = (rows, col) => rows.reduce((s, r) => s + r[col], 0);
const pct = (num, den) => (den === 0 ? 0 : round1(100 * num / den));
const byOpened = (a, b) => byStr(a.opened, b.opened) || byStr(a.scar_id, b.scar_id); // oldest first

// p-chart on the monthly reject fraction (SCORECARD.md § p-chart). p̄ is pooled over the baseline months;
// null when the baseline has no receipts. One point per month with receipts, raw doubles (no rounding).
// Baseline points are plotted but not judged (above_ucl false, run 0). The run counts consecutive
// monitoring points strictly above p̄; a month with no receipts has no point and leaves the run as is.
function pchartOf(rows, months) {
  const base = rows.filter((r) => r.idx <= SCORECARD.baseline_months);
  const baseN = sumOf(base, 'received_qty');
  if (baseN === 0) return null;
  const p_bar = sumOf(base, 'rejected_qty') / baseN;
  const points = [];
  let run = 0;
  months.forEach((month, k) => {
    const index = k + 1;
    const inMonth = rows.filter((r) => r.idx === index);
    const n = sumOf(inMonth, 'received_qty');
    if (n === 0) return;
    const p = sumOf(inMonth, 'rejected_qty') / n;
    const ucl = p_bar + SCORECARD.pchart.sigma * Math.sqrt(p_bar * (1 - p_bar) / n);
    const judged = index > SCORECARD.baseline_months;
    if (judged) run = p > p_bar ? run + 1 : 0;
    points.push({ month, index, n, p, ucl, above_ucl: judged && p > ucl, run: judged ? run : 0 });
  });
  return { p_bar, points };
}

// One supplier's 18 months (metrics, composite, tier), alerts, open SCARs at M18 and failure modes over M7..M18.
// rows: this supplier's in-frame rows, each with idx (1..18) and day (dayNumber of date).
// Last argument: the validated policy.scorecard { weights, limits, tiers }.
function supplierCard(supplier_id, rows, months, { limits, weights, tiers }) {
  const lookback = SCORECARD.metrics.repeat_nc.lookback_days;
  // ponytail: O(n^2) per supplier over 18 months of lots; index by code if lot counts grow large.
  const ncs = rows.filter((r) => r.rejected_qty > 0).map((r) => ({ ...r,
    repeat: rows.some((o) => o.rejected_qty > 0 && o.failure_mode_code === r.failure_mode_code
      && r.day - o.day > 0 && r.day - o.day <= lookback) }));
  const scars = [...new Map(rows.filter((r) => r.scar_id !== null).map((r) => [r.scar_id, r])).values()];
  const openAt = (end) => scars.filter((s) => s.scar_opened <= end && (s.scar_closed === null || s.scar_closed > end))
    .map((s) => ({ scar_id: s.scar_id, opened: s.scar_opened, age_days: dayNumber(end) - dayNumber(s.scar_opened) }));
  const inWindow = (list, key, i) => list.filter((r) => r.idx > i - SCORECARD.metrics[key].window_months && r.idx <= i);

  const VALUE = {
    dppm: (i) => {
      const w = inWindow(rows, 'dppm', i);
      const rec = sumOf(w, 'received_qty');
      return rec === 0 ? null : Math.round(sumOf(w, 'rejected_qty') * 1000000 / rec);
    },
    escape: (i) => {
      const w = inWindow(rows, 'escape', i);
      return pct(sumOf(w.filter((r) => ESCAPED_AT.includes(r.defect_found_at)), 'rejected_qty'), sumOf(w, 'rejected_qty'));
    },
    repeat_nc: (i) => {
      const w = inWindow(ncs, 'repeat_nc', i);
      return pct(w.filter((r) => r.repeat).length, w.length);
    },
    scar_aging: (i) => {
      const open = openAt(monthEnd(months[i - 1]));
      return pct(open.filter((s) => s.age_days > SCORECARD.metrics.scar_aging.age_over_days).length, open.length);
    },
    otd: (i) => {
      const w = inWindow(rows, 'otd', i);
      return w.length === 0 ? null : round1(100 * sumOf(w, 'on_time') / w.length);
    },
  };

  const modes = new Map();
  for (const r of ncs) {
    if (r.idx <= SCORECARD.baseline_months) continue;
    const m = modes.get(r.failure_mode_code) ?? { code: r.failure_mode_code, count: 0, parts: new Set() };
    m.count += 1;
    m.parts.add(r.part_no);
    modes.set(m.code, m);
  }

  // Composite: sum of points rounded half up; any null metric = Unrated (null/null), weight not spread.
  // Tier from the rounded composite: first tier whose inclusive lower bound it reaches, else the last tier.
  const keys = Object.keys(SCORECARD.metrics);
  const order = SCORECARD.tier_order;
  const tierOf = (c) => order.slice(0, -1).find((t) => c >= tiers[t]) ?? order.at(-1);
  const cards = months.map((month, k) => {
    const metrics = Object.fromEntries(keys.map((key) => [key, rate(key, VALUE[key](k + 1), limits, weights)]));
    const pts = keys.map((key) => metrics[key].points);
    const composite = pts.includes(null) ? null : round1(pts.reduce((a, b) => a + b, 0));
    return { month, index: k + 1, metrics, composite, tier: composite === null ? null : tierOf(composite) };
  });
  const last = cards.at(-1);
  const pchart = pchartOf(rows, months);

  // Alerts (SCORECARD.md § Alerts), evaluated in every month M1..M18. All types push into this one
  // array and a single sort at the end fixes the order, so the p-chart alerts (#22) only push.
  const alerts = [];
  const push = (type, m, detail, extra) => alerts.push({ type, month: m.month, index: m.index,
    active: m.index === SCORECARD.months, detail, ...extra });
  cards.forEach((m, k) => {
    const prev = cards[k - 1];
    if (prev?.tier && m.tier && order.indexOf(m.tier) > order.indexOf(prev.tier)) push('tier_drop', m, `${prev.tier} → ${m.tier}`);
    const aged = openAt(monthEnd(m.month)).filter((s) => s.age_days > SCORECARD.alerts.scar_aging_over_days).sort(byOpened);
    if (aged.length > 0) push('scar_aging', m, aged.map((s) => `${s.scar_id} open ${s.age_days} days`).join('; '));
    for (const key of keys) {
      if (m.metrics[key].band !== 'bad') continue;
      const { name, direction } = SCORECARD.metrics[key];
      push('metric_bad', m, `${name} ${m.metrics[key].value} ${direction === 'lower' ? '>' : '<'} ${limits[key].watch}`, { metric: key });
    }
  });
  // p-chart alerts, monitoring points only (baseline points are never above_ucl and carry run 0).
  // run7 holds in every month whose run is run_points or longer; the run starts run - 1 points back.
  (pchart?.points ?? []).forEach((pt, i, pts) => {
    const m = cards[pt.index - 1];
    if (pt.above_ucl) push('ucl', m, `p ${pt.p.toFixed(4)} > UCL ${pt.ucl.toFixed(4)}`);
    if (pt.run >= SCORECARD.alerts.run_points) push('run7', m, `${pt.run} months above p̄ (M${pts[i - pt.run + 1].index}–M${pt.index})`);
  });
  // Newest month first, then type in Alerts-table order, then metric order (metric_bad only).
  const types = SCORECARD.alerts.types;
  alerts.sort((a, b) => (b.index - a.index) || (types.indexOf(a.type) - types.indexOf(b.type))
    || (keys.indexOf(a.metric) - keys.indexOf(b.metric)));

  return {
    supplier_id,
    months: cards,
    current: { month: last.month, composite: last.composite, tier: last.tier },
    pchart,
    alerts,
    open_scars: openAt(monthEnd(months.at(-1))).sort(byOpened),
    failure_modes: [...modes.values()].map((m) => ({ code: m.code, count: m.count, parts: [...m.parts].sort(byStr) }))
      .sort((a, b) => (b.count - a.count) || byStr(a.code, b.code)),
  };
}

/** Monthly supplier scorecard over the 18 months before as_of (SCORECARD.md, PRD-02 SCORE-FR-02..08/10).
 *  rows: history rows as parseHistory returns them (validated again here, labelled rows[i]).
 *  policy: reads policy.scorecard.weights, .limits and .tiers (validated, default Stark Reference v1), and
 *  echoes the policy's id, version and name. Pure, no mutation.
 *  Returns { months, warnings, policy: { id, version, name }, suppliers: [{ supplier_id,
 *  months: [{ month, index, metrics, composite, tier }], current: { month, composite, tier },
 *  pchart: { p_bar, points: [{ month, index, n, p, ucl, above_ucl, run }] } | null,
 *  alerts: [{ type, month, index, active, detail, metric? }], open_scars, failure_modes }] }. */
export function scorecard(rows, { as_of, policy = STARK_REFERENCE } = {}) {
  if (!isIsoDay(as_of)) throw new Error(`as_of: expected an ISO day YYYY-MM-DD, got ${show(as_of)}`);
  if (!Array.isArray(rows)) throw new Error('rows: expected an array');
  checkHistory(rows, (i) => `rows[${i}]`);
  validateScorecardPolicy(policy);

  const first = monthNo(as_of) - SCORECARD.months;
  const months = Array.from({ length: SCORECARD.months }, (_, k) => monthStr(first + k));
  const ids = new Set();
  const inFrame = [];
  for (const r of rows) {
    ids.add(r.supplier_id);
    const idx = monthNo(r.date) - first + 1;
    if (idx >= 1 && idx <= SCORECARD.months) inFrame.push({ ...r, idx, day: dayNumber(r.date) });
  }
  const ignored = rows.length - inFrame.length;
  const warnings = ignored === 0 ? []
    : [`ignored ${ignored} ${ignored === 1 ? 'row' : 'rows'} dated outside ${months[0]} to ${months.at(-1)}`];
  // Roster: every supplier_id in the rows, in or out of frame; out-of-frame-only suppliers are all null/0.
  const suppliers = [...ids].sort(byStr)
    .map((id) => supplierCard(id, inFrame.filter((r) => r.supplier_id === id), months, policy.scorecard));
  // Empty baseline: no p-chart, one warning per supplier in id order, after the ignored-rows warning.
  const b = SCORECARD.baseline_months;
  for (const s of suppliers) {
    if (s.pchart === null) warnings.push(`${s.supplier_id}: no receipts in M1–M${b} (${months[0]} to ${months[b - 1]}), no p-chart`);
  }
  return { months, warnings, policy: { id: policy.id, version: policy.version, name: policy.name }, suppliers };
}

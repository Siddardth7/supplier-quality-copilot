// Extraction schema validator (#32): AGENT-FR-02 (criteria set), AGENT-FR-03 (state rules, value types,
// citations), AGENT-NFR-01 (Node built-ins only). Spec: docs/product/PRD-04-agent.md § 5, agent/SKILL.md.
// Structure and types only: whether drafts agree with the engine is the draft consistency check (#35),
// so nothing here scores or calls evaluate.
//
// CLI: node agent/validate.mjs <extraction.json> [--packet <packet-dir>]
//   exit 0 valid, 1 invalid (one "<path>: <message>" line per error on stderr), 2 usage or unreadable input.
import { readFileSync, readdirSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { RUBRIC, scoreCriterion } from '../app/engine.js';

const SCHEMA = 'sqc-extraction/1';
const TOP = ['schema', 'supplier_id', 'commodity', 'run', 'criteria', 'drafts'];
const RUN = ['run_id', 'model', 'skill_sha'];
const ITEM = ['id', 'state', 'value', 'citation', 'note'];
const DRAFTS = ['rfi_items', 'rfi_email', 'audit_focus', 'audit_plan'];
const PLAN = ['criterion_id', 'question'];
const STATES = ['verified', 'assumed', 'missing'];
const SUPPLIER = /^SUP-[0-9]{2}$/;
const CITATION = /^[a-z0-9_]+\.md §[0-9]+(\.[0-9]+)*$/;
const NOTE_MAX = 240;
const AUDIT_FOCUS_MAX = 3; // RUBRIC.md § Outputs per supplier: "up to 3 gaps"
// as_of only needs to be a valid day; validation, not scoring
const AS_OF = '2000-01-01';

const isObj = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const nonEmpty = (s) => typeof s === 'string' && s.trim() !== '';
const show = (v) => {
  try { return JSON.stringify(v) ?? String(v); } catch { return String(v); }
};

// Every key in want present, no other key. Returns true when all of want is present.
function checkKeys(add, obj, path, want, label = '') {
  const at = (k) => (path ? `${path}.${k}` : k);
  for (const k of want) if (!Object.hasOwn(obj, k)) add(at(k), `${label}missing key ${k}`);
  for (const k of Object.keys(obj)) if (!want.includes(k)) add(at(k), `${label}unknown key ${show(k)}, expected only ${want.join(', ')}`);
  return want.every((k) => Object.hasOwn(obj, k));
}

/** Pure. Never throws on bad input; returns every error found.
 *  extraction: parsed JSON (any value).
 *  opts.packetFiles: optional array of basenames present in the packet; when given, each cited file must be in it.
 *  opts.rubric: defaults to RUBRIC.
 *  returns { ok, errors: [{ path, message }] }, ok === (errors.length === 0). */
export function validateExtraction(extraction, { packetFiles, rubric = RUBRIC } = {}) {
  if (!isObj(extraction)) return { ok: false, errors: [{ path: '', message: 'extraction: expected an object' }] };
  const x = extraction;
  const errors = [];
  const add = (path, message) => errors.push({ path, message });
  const has = (k) => Object.hasOwn(x, k);

  checkKeys(add, x, '', TOP);
  if (has('schema') && x.schema !== SCHEMA) add('schema', `expected ${show(SCHEMA)}, got ${show(x.schema)}`);
  if (has('supplier_id') && !(typeof x.supplier_id === 'string' && SUPPLIER.test(x.supplier_id))) {
    add('supplier_id', `expected SUP- and two digits (SUP-07), got ${show(x.supplier_id)}`);
  }
  const profile = rubric.commodities.find((p) => p.key === x.commodity);
  if (has('commodity') && !profile) {
    add('commodity', `expected one of ${rubric.commodities.map((p) => p.key).join(', ')}, got ${show(x.commodity)}`);
  }
  if (has('run')) {
    if (!isObj(x.run)) add('run', `expected an object with ${RUN.join(', ')}, got ${show(x.run)}`);
    else {
      checkKeys(add, x.run, 'run', RUN);
      for (const k of RUN) {
        if (Object.hasOwn(x.run, k) && !nonEmpty(x.run[k])) add(`run.${k}`, `expected a non-empty string, got ${show(x.run[k])}`);
      }
    }
  }

  // Applicable set (AGENT-FR-02): every core criterion plus the commodity's required and nice-to-have tests.
  // Unknown commodity: the set is unknown, so only "unknown criterion id" is checked.
  const applicable = profile && new Set([...rubric.criteria.map((c) => c.id), ...profile.required, ...profile.nice]);
  const def = (id) => rubric.criteria.find((c) => c.id === id) ?? rubric.tests.find((t) => t.id === id);
  const idProblem = (id) => (!def(id) ? 'unknown criterion id'
    : applicable && !applicable.has(id) ? `not applicable to ${profile.key}` : null);

  if (has('criteria')) {
    if (!Array.isArray(x.criteria)) add('criteria', `expected an array, got ${show(x.criteria)}`);
    else {
      const seen = new Set();
      x.criteria.forEach((item, i) => checkItem(add, item, `criteria[${i}]`, { def, idProblem, seen, packetFiles }));
      if (applicable) for (const id of applicable) if (!seen.has(id)) add('criteria', `${id}: missing criterion`);
    }
  }

  if (has('drafts')) {
    const d = x.drafts;
    if (!isObj(d)) add('drafts', `expected an object with ${DRAFTS.join(', ')}, got ${show(d)}`);
    else checkDrafts(add, d, idProblem);
  }
  return { ok: errors.length === 0, errors };
}

// One criteria[] item: keys, id, state rules (PRD-04 § 5 State rules), value type, citation, note.
function checkItem(add, item, p, { def, idProblem, seen, packetFiles }) {
  if (!isObj(item)) return add(p, `expected an object with ${ITEM.join(', ')}, got ${show(item)}`);
  const id = typeof item.id === 'string' ? item.id : null;
  const label = id ? `${id}: ` : '';
  const whole = checkKeys(add, item, p, ITEM, label);
  if (Object.hasOwn(item, 'id')) {
    if (id === null) add(`${p}.id`, `expected a criterion id string, got ${show(item.id)}`);
    else {
      const problem = idProblem(id);
      if (problem) add(`${p}.id`, `${id}: ${problem}`);
      if (seen.has(id)) add(`${p}.id`, `${id}: duplicate criterion, each id must appear once`);
      seen.add(id);
    }
  }
  if (!whole) return; // ponytail: the state rules read all five keys, so a missing key stops here

  const { state, value, citation, note } = item;
  const known = STATES.includes(state);
  const claims = state === 'verified' || state === 'assumed';
  if (!known) add(`${p}.state`, `${label}bad state ${show(state)}, expected verified, assumed or missing`);

  if (state === 'missing') {
    if (value !== null) add(`${p}.value`, `${label}missing needs value null, got ${show(value)}`);
  } else if (state === 'verified' && value == null) {
    add(`${p}.value`, `${label}verified needs a value`);
  } else if (claims && value != null && id && def(id)) {
    // Type and range check (AGENT-FR-03, RUBRIC.md § Value bounds, issue 161): stand-in state and citation so
    // applyRule's type or out-of-range error is the only throw.
    try { scoreCriterion(def(id), { state: 'verified', value, citation: '-' }, AS_OF); } catch (e) { add(`${p}.value`, e.message); }
  }

  if (state === 'missing' && citation !== null) add(`${p}.citation`, `${label}missing needs citation null, got ${show(citation)}`);
  else if (citation === null) { if (claims) add(`${p}.citation`, `${label}${state} needs a citation (file §section)`); }
  else if (typeof citation !== 'string' || !CITATION.test(citation)) {
    add(`${p}.citation`, `${label}expected "file §section" matching ${CITATION.source}, got ${show(citation)}`);
  } else if (packetFiles && !packetFiles.includes(citation.slice(0, citation.indexOf(' §')))) {
    add(`${p}.citation`, `${label}cited file not in packet: ${citation.slice(0, citation.indexOf(' §'))}`);
  }

  if (note !== null && typeof note !== 'string') add(`${p}.note`, `${label}expected a string or null, got ${show(note)}`);
  else if (typeof note === 'string' && note.length > NOTE_MAX) add(`${p}.note`, `${label}note is ${note.length} characters, at most ${NOTE_MAX}`);
  else if (known && state !== 'verified' && !nonEmpty(note)) {
    add(`${p}.note`, `${label}${state} needs a note (${state === 'assumed' ? 'quote the claim' : 'where the agent looked'})`);
  }
}

// drafts: shape, types, allowed ids, no duplicates, audit_focus at most 3, audit_plan aligned to audit_focus.
function checkDrafts(add, d, idProblem) {
  checkKeys(add, d, 'drafts', DRAFTS);
  for (const k of ['rfi_items', 'audit_focus']) {
    if (!Object.hasOwn(d, k)) continue;
    const list = d[k], p = `drafts.${k}`;
    if (!Array.isArray(list)) { add(p, `expected an array of criterion ids, got ${show(list)}`); continue; }
    if (k === 'audit_focus' && list.length > AUDIT_FOCUS_MAX) add(p, `expected at most ${AUDIT_FOCUS_MAX} ids, got ${list.length}`);
    list.forEach((id, i) => {
      const q = `${p}[${i}]`;
      if (typeof id !== 'string') return add(q, `expected a criterion id string, got ${show(id)}`);
      if (list.indexOf(id) !== i) return add(q, `${id}: duplicate in ${p}`);
      const problem = idProblem(id);
      if (problem) add(q, `${id}: ${problem}`);
    });
  }
  if (Object.hasOwn(d, 'rfi_email') && !nonEmpty(d.rfi_email)) add('drafts.rfi_email', `expected a non-empty string, got ${show(d.rfi_email)}`);
  if (!Object.hasOwn(d, 'audit_plan')) return;
  const plan = d.audit_plan;
  const focus = Array.isArray(d.audit_focus) ? d.audit_focus : null;
  if (!Array.isArray(plan)) return add('drafts.audit_plan', `expected an array of { criterion_id, question }, got ${show(plan)}`);
  plan.forEach((e, i) => {
    const q = `drafts.audit_plan[${i}]`;
    if (!isObj(e)) return add(q, `expected an object with ${PLAN.join(', ')}, got ${show(e)}`);
    checkKeys(add, e, q, PLAN);
    if (Object.hasOwn(e, 'question') && !nonEmpty(e.question)) add(`${q}.question`, `expected a non-empty string, got ${show(e.question)}`);
    if (focus && i < focus.length && Object.hasOwn(e, 'criterion_id') && e.criterion_id !== focus[i]) {
      add(`${q}.criterion_id`, `expected ${show(focus[i])} (audit_focus[${i}], same order), got ${show(e.criterion_id)}`);
    }
  });
  if (focus && plan.length !== focus.length) {
    add('drafts.audit_plan', `expected ${focus.length} entries, one per audit_focus id, got ${plan.length}`);
  }
}

function main(args) {
  const usage = 'usage: node agent/validate.mjs <extraction.json> [--packet <packet-dir>]';
  const [file, ...rest] = args;
  if (!file || file.startsWith('--') || !(rest.length === 0 || (rest.length === 2 && rest[0] === '--packet'))) {
    console.error(usage);
    return 2;
  }
  let extraction, packetFiles;
  try {
    extraction = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`${file}: cannot read as JSON: ${e.message}\n${usage}`);
    return 2;
  }
  if (rest.length) {
    try {
      packetFiles = readdirSync(rest[1]).filter((f) => f.endsWith('.md'));
    } catch (e) {
      console.error(`${rest[1]}: cannot read packet dir: ${e.message}\n${usage}`);
      return 2;
    }
  }
  const { ok, errors } = validateExtraction(extraction, { packetFiles });
  if (ok) {
    console.log(`OK ${file}`);
    return 0;
  }
  for (const { path, message } of errors) console.error(path ? `${path}: ${message}` : message);
  console.error(`INVALID ${file} (${errors.length} errors)`);
  return 1;
}

// CLI only when run directly, never on import. realpath so a symlinked checkout still matches;
// argv[1] may be absent or not a file (node -e), which is never this module.
const isMain = () => {
  try { return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; }
};
if (isMain()) process.exitCode = main(process.argv.slice(2)); // exitCode, not exit(): lets piped stderr flush

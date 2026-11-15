// Data loading for the app (PRD-05 UIQ-FR-01, -12; PRD-06 UIM-FR-01, -12). Never throws: every file
// becomes a Result, { ok: true, value, path } or { ok: false, error: { path, message, kind } },
// so one failed file never hides another. kind is 'fetch' (could not get the file) or 'data' (bad content).
// Requirement sheets (#40, decision 24) load at startup, one per distinct candidate or active commodity (issue 110).
import { parseHistory } from './engine.js';

const APP = new URL('./', import.meta.url);   // app/
const ROOT = new URL('../', APP);              // the served repo root
export const MANUAL_KEY = 'sqc:manual';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const labelOf = (href) => (href.startsWith(ROOT.href) ? href.slice(ROOT.href.length) : href);

// A relative path that stays inside the repo root: no scheme, no leading slash, no ".." above the root.
function insideRoot(path) {
  let depth = 1;  // app/ is one level below the root
  for (const seg of path.split('/')) {
    if (seg === '..') depth--;
    else if (seg && seg !== '.') depth++;
    if (depth < 0) return false;
  }
  return true;
}

/** ?data=<relative path> overrides the data folder for local dev (D8). Anything else falls back to the default. */
export function resolveBase(search = '', defaultBase = new URL('../data/', APP).href) {
  const fallback = { base: defaultBase, overridden: false, path: null, label: labelOf(defaultBase) };
  const raw = new URLSearchParams(search).get('data');
  if (!raw || /^[a-z][a-z\d+.-]*:/i.test(raw) || /^[/\\]/.test(raw) || /[\\%\s?#]/.test(raw) || !insideRoot(raw)) return fallback;
  const base = new URL(raw.endsWith('/') ? raw : `${raw}/`, APP).href;
  if (!base.startsWith(ROOT.href)) return fallback;  // belt and braces: never fetch off-site
  return { base, overridden: true, path: raw, label: labelOf(base) };
}

/** fetchText(relPath) -> file text; throws Error("HTTP 404") on a bad status, keeps the network error message. */
export function makeFetchText(base, fetchFn = globalThis.fetch) {
  return async (relPath) => {
    const res = await fetchFn(new URL(relPath, base));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  };
}

function parseJson(text) {
  try { return JSON.parse(text); } catch (e) { throw new Error(`Invalid JSON: ${e.message}`); }
}

function checkSuppliers(v) {
  const need = (ok, message) => { if (!ok) throw new Error(message); };
  need(isObj(v), 'expected an object');
  need(typeof v.as_of === 'string', 'as_of: expected a string');
  for (const key of ['candidates', 'active']) {
    need(Array.isArray(v[key]), `${key}: expected an array`);
    v[key].forEach((s, i) => {
      need(isObj(s), `${key}[${i}]: expected an object`);
      for (const f of ['id', 'name', 'commodity', 'part']) need(typeof s[f] === 'string', `${key}[${i}].${f}: expected a string`);
    });
    const ids = v[key].map((s) => s.id);
    need(new Set(ids).size === ids.length, `${key}: duplicate id`);
  }
  return v;
}

// Hand-entered suppliers saved in this browser: envelope check only; conversion and scoring belong to hand entry.
function readManual(storage) {
  let raw = null;
  try { raw = storage?.get(MANUAL_KEY) ?? null; } catch { raw = null; }
  if (raw === null) return { records: [], error: null };
  if (!Array.isArray(raw)) return { records: [], error: { message: `${MANUAL_KEY}: expected an array of saved suppliers` } };
  const records = raw.filter((r) => isObj(r) && r.schema === 'sqc-manual/1' && typeof r.supplier_id === 'string');
  const dropped = raw.length - records.length;
  return { records, error: dropped ? { message: `${MANUAL_KEY}: dropped ${dropped} invalid saved ${dropped === 1 ? 'record' : 'records'}` } : null };
}

// Requirement sheet: only the fields the app reads now are checked (PRD-12 §5 owns the full shape).
function checkSheet(v) {
  if (!isObj(v)) throw new Error('expected an object');
  if (typeof v.commodity !== 'string') throw new Error('commodity: expected a string');
  if (typeof v.part_no !== 'string') throw new Error('part_no: expected a string');
  return v;
}

// Published eval runs (issue 111, PRD-13 §5): { runs: [<eval.mjs --json output>, ...] }, oldest first. Only the
// fields the Eval view reads are checked; one bad run fails the whole file, so a half-valid file never renders.
export function checkEval(v) {
  const need = (ok, message) => { if (!ok) throw new Error(message); };
  need(isObj(v), 'expected an object');
  need(Array.isArray(v.runs), 'runs: expected an array');
  v.runs.forEach((r, i) => {
    const at = `runs[${i}]`;
    need(isObj(r), `${at}: expected an object`);
    need(typeof r.run_id === 'string', `${at}.run_id: expected a string`);
    need(typeof r.headline_complete === 'boolean', `${at}.headline_complete: expected a boolean`);
    for (const f of ['models', 'skill_shas', 'refused']) need(Array.isArray(r[f]), `${at}.${f}: expected an array`);
    r.refused.forEach((x, k) => need(isObj(x), `${at}.refused[${k}]: expected an object`));
    need(Array.isArray(r.groups) && r.groups.length === 4, `${at}.groups: expected an array of 4 groups`);
    r.groups.forEach((g, j) => {
      need(isObj(g), `${at}.groups[${j}]: expected an object`);
      for (const f of ['worlds', 'per_world', 'misses']) need(Array.isArray(g[f]), `${at}.groups[${j}].${f}: expected an array`);
      for (const f of ['counts', 'rates']) need(isObj(g[f]), `${at}.groups[${j}].${f}: expected an object`);
      g.per_world.forEach((w, k) => {
        need(isObj(w), `${at}.groups[${j}].per_world[${k}]: expected an object`);
        for (const f of ['counts', 'rates']) need(isObj(w[f]), `${at}.groups[${j}].per_world[${k}].${f}: expected an object`);
      });
      g.misses.forEach((m, k) => need(isObj(m), `${at}.groups[${j}].misses[${k}]: expected an object`));
    });
  });
  return v;
}

/** Startup load: suppliers.json, history.csv and eval.json in parallel, then every candidate's extraction and each
 *  distinct candidate or active commodity's requirement sheet, all in parallel. */
export async function loadData({ fetchText, storage, label = 'data/' }) {
  const get = async (rel, parse) => {
    const path = label + rel;
    let text;
    try { text = await fetchText(rel); } catch (e) { return { ok: false, error: { path, message: String(e?.message ?? e), kind: 'fetch' } }; }
    try { return { ok: true, value: parse(text), path }; } catch (e) { return { ok: false, error: { path, message: String(e?.message ?? e), kind: 'data' } }; }
  };
  const [suppliers, history, evalRuns] = await Promise.all([
    get('suppliers.json', (t) => checkSuppliers(parseJson(t))),
    get('history.csv', parseHistory),
    get('eval.json', (t) => checkEval(parseJson(t))),  // 404 until the first published run: Eval says so (issue 111)
  ]);
  const extractions = {};
  const sheets = {};
  if (suppliers.ok) {
    const ids = suppliers.value.candidates.map((c) => c.id);
    // Candidates first, then active suppliers (issue 110: Standards lists every sheet, decision 130), deduped in that order.
    const kinds = [...new Set([...suppliers.value.candidates, ...suppliers.value.active].map((c) => c.commodity))];
    const [results, sheetResults] = await Promise.all([
      Promise.all(ids.map((id) => get(`extracted/${encodeURIComponent(id)}.json`, parseJson))),
      Promise.all(kinds.map((k) => get(`requirements/${encodeURIComponent(k)}.json`, (t) => checkSheet(parseJson(t))))),
    ]);
    ids.forEach((id, i) => { extractions[id] = results[i]; });
    kinds.forEach((k, i) => { sheets[k] = sheetResults[i]; });
  }
  return { suppliers, history, extractions, sheets, evalRuns, manual: readManual(storage) };
}

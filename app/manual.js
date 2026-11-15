// Hand-entered suppliers (issue 77; PRD-05 UIQ-FR-15, -16, §5 record `sqc-manual/1`; decisions 160-171).
// Pure: no DOM and no storage access of its own (writeManual takes the storage helper). The checklist comes from
// RUBRIC only, and every score comes from evaluate(): this file names no criterion, test or commodity (QUAL-NFR-05).
import { RUBRIC, evaluate } from './engine.js';
import { MANUAL_KEY } from './data.js';
import { parseNumber } from './standards.js';

export const SCHEMA = 'sqc-manual/1';
/** [engine state, UI label] (PRD-05 UIQ-FR-15: proven, claimed, missing). */
export const STATES = [['verified', 'Proven'], ['assumed', 'Claimed'], ['missing', 'Missing']];
export const WHERE_REQUIRED = 'Where I found it is required when proven';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (s) => (typeof s === 'string' && s.trim() !== '' ? s.trim() : null);

/** Rows for a commodity key, in engine order (per category: cat-4 required tests first, then the category's
 *  criteria), then the commodity's nice-to-have tests. null for an unknown key.
 *  Row: { id, cat, name, type, options (enum keys or null), knockout (effective for the commodity's risk, as the
 *  engine decides it), test, nice }. */
export function checklist(key) {
  const profile = RUBRIC.commodities.find((p) => p.key === key);
  if (!profile) return null;
  const tc = RUBRIC.test_criterion;
  const testIds = new Set(RUBRIC.tests.map((t) => t.id));
  const def = (id) => RUBRIC.tests.find((t) => t.id === id);
  const row = (d, cat, knockout, nice = false) => ({ id: d.id, cat, name: d.requirement ?? d.name, type: d.type,
    options: d.type === 'enum' ? Object.keys(d.rule) : null, knockout, test: testIds.has(d.id), nice });
  return [
    ...RUBRIC.categories.flatMap(({ n }) => [
      ...(n === tc.cat ? profile.required.map((id) => row(def(id), n, tc.knockout === true)) : []),
      ...RUBRIC.criteria.filter((c) => c.cat === n)
        .map((c) => row(c, n, c.knockout === true && (!c.knockout_risk || c.knockout_risk.includes(profile.risk)))),
    ]),
    ...(profile.nice ?? []).map((id) => row(def(id), tc.cat, false, true)),
  ];
}

/** NEW- + (largest numeric suffix in use + 1), zero-padded to 2 digits (decision 167). */
export function nextId(records) {
  const nums = records.map((r) => /^NEW-(\d+)$/.exec(r?.supplier_id)).filter(Boolean).map((m) => Number(m[1]));
  return `NEW-${String(Math.max(0, ...nums) + 1).padStart(2, '0')}`;
}

/** Raw form text -> engine value. '' -> null; bool 'true'/'false'; number via parseNumber (a non-decimal stays a
 *  string so evaluate() names the row); date and enum trimmed text. */
export function parseValue(type, raw) {
  const s = String(raw ?? '').trim();
  if (s === '') return null;
  if (type === 'bool') return s === 'true' ? true : s === 'false' ? false : null;
  if (type === 'number') return parseNumber(s);
  return s;
}

const blankRow = () => ({ state: 'missing', value: '', where: '', note: '' });
const rawOf = (v) => (v === null || v === undefined ? '' : String(v));

/** Entry state (main.js holds it in memory; never stored). rows: { [id]: { state, value (raw text), where, note } }. */
export function blankEntry() {
  return { step: 1, id: null, name: '', part_no: null, commodity: null, rows: {} };
}

/** Edit: step 2, the record's ID kept (decision 165), values back to raw text. */
export function entryFromRecord(record) {
  const rows = Object.fromEntries((checklist(record.commodity) ?? []).map((r) => [r.id, blankRow()]));
  for (const c of Array.isArray(record.criteria) ? record.criteria : []) {
    if (isObj(c) && typeof c.id === 'string') {
      rows[c.id] = { state: c.state, value: rawOf(c.value), where: rawOf(c.where), note: rawOf(c.note) };
    }
  }
  return { step: 2, id: record.supplier_id, name: String(record.name ?? ''), part_no: record.part_no ?? null,
    commodity: record.commodity ?? null, rows };
}

/** Part and commodity from a requirement sheet; rows rebuilt from checklist(), carrying rows whose id still applies. */
export function setPart(entry, sheet) {
  const rows = Object.fromEntries((checklist(sheet.commodity) ?? []).map((r) => [r.id, entry.rows[r.id] ?? blankRow()]));
  return { ...entry, part_no: sheet.part_no, commodity: sheet.commodity, rows };
}

/** Immutable row update; patch keys state | value | where | note. Missing clears the value. */
export function setRow(entry, id, patch) {
  const next = { ...entry.rows[id], ...patch };
  if (patch.state === 'missing') next.value = '';
  return { ...entry, rows: { ...entry.rows, [id]: next } };
}

/** The stored record (PRD-05 §5): every row; missing rows carry no value and no where. */
export function toRecord(entry, { id, saved_at }) {
  const types = new Map((checklist(entry.commodity) ?? []).map((r) => [r.id, r.type]));
  return {
    schema: SCHEMA, supplier_id: id, name: entry.name.trim(), part_no: entry.part_no, commodity: entry.commodity, saved_at,
    criteria: Object.entries(entry.rows).map(([cid, r]) => {
      const missing = r.state === 'missing';
      return { id: cid, state: r.state, value: missing ? null : parseValue(types.get(cid), r.value),
        where: missing ? null : text(r.where), note: text(r.note) };
    }),
  };
}

/** Engine input (decision 160): where -> citation, source 'manual', no drafts. Odd stored shapes pass through so
 *  evaluate() names them. */
export function toExtraction(record) {
  const criteria = Array.isArray(record.criteria)
    ? record.criteria.map((c) => (isObj(c) ? { id: c.id, state: c.state, value: c.value, citation: c.where, note: c.note } : c))
    : record.criteria;
  return { supplier_id: record.supplier_id, commodity: record.commodity, source: 'manual', criteria };
}

/** The live view of an entry. A proven row without "where" pauses scoring (decision 163); otherwise evaluate()
 *  scores it and an engine error lands on the row its message names. */
export function scoreEntry(entry, { as_of, policy }) {
  const rows = Object.fromEntries(Object.keys(entry.rows).map((id) => [id, { issue: null }]));
  let blocked = false;
  for (const [id, r] of Object.entries(entry.rows)) {
    if (r.state === 'verified' && text(r.where) === null) { rows[id].issue = WHERE_REQUIRED; blocked = true; }
  }
  if (blocked) return { rows, blocked, result: null };
  try {
    const evaluation = evaluate(toExtraction(toRecord(entry, { id: entry.id, saved_at: null })), { as_of, policy });
    return { rows, blocked, result: { ok: true, evaluation } };
  } catch (e) {
    const message = String(e?.message ?? e);
    const id = /^([^\s:]+): /.exec(message)?.[1];
    const known = id !== undefined && Object.hasOwn(rows, id);
    if (known) rows[id].issue = message;
    return { rows, blocked, result: { ok: false, error: { id: known ? id : null, message } } };
  }
}

/** true when written; false for blocked storage (records stay in memory, the note shows). */
export const writeManual = (storage, records) => !!storage?.ok && storage.set(MANUAL_KEY, records);

/** Replace the record with the same supplier_id in place, else append. */
export function upsert(records, record) {
  return records.some((r) => r.supplier_id === record.supplier_id)
    ? records.map((r) => (r.supplier_id === record.supplier_id ? record : r)) : [...records, record];
}

export const remove = (records, id) => records.filter((r) => r.supplier_id !== id);

/** One record per file (decision 170). */
export const exportRecord = (r) => ({ filename: `manual-${r.supplier_id}.json`, text: JSON.stringify(r, null, 2) });

/** JSON text -> { ok: true, record, records } | { ok: false, error }. The file's ID is kept when free, else the next
 *  free ID (decision 165). Anything evaluate() refuses is refused with the engine's message. */
export function importRecord(json, records, { as_of, policy }) {
  const no = (error) => ({ ok: false, error });
  let r;
  try { r = JSON.parse(json); } catch { return no("The file isn't valid JSON"); }
  if (!isObj(r) || r.schema !== SCHEMA) return no(`schema: expected "${SCHEMA}"`);
  if (typeof r.name !== 'string' || r.name.trim() === '') return no('name: expected a supplier name');
  if (typeof r.part_no !== 'string') return no('part_no: expected a string');
  const list = checklist(r.commodity);
  if (!list) return no(`commodity: unknown commodity ${JSON.stringify(r.commodity) ?? 'undefined'}`);
  if (!Array.isArray(r.criteria)) return no('criteria: expected an array');
  const ids = new Set(list.map((x) => x.id));
  const seen = new Set();
  for (const [i, c] of r.criteria.entries()) {
    if (!isObj(c) || typeof c.id !== 'string') return no(`criteria[${i}]: expected an object with a string id`);
    if (!ids.has(c.id)) return no(`${c.id}: not on the checklist for this commodity`);
    if (seen.has(c.id)) return no(`${c.id}: listed twice`);
    seen.add(c.id);
    if (!STATES.some(([s]) => s === c.state)) return no(`${c.id}: unknown state ${JSON.stringify(c.state) ?? 'undefined'}`);
    if (c.state === 'verified' && text(c.where) === null) return no(`${c.id}: ${WHERE_REQUIRED.toLowerCase()}`);
  }
  try { evaluate(toExtraction(r), { as_of, policy }); } catch (e) { return no(String(e?.message ?? e)); }
  // Import into the same closed record shape as Save, with every checklist row (issue 139).
  const imported = new Map(r.criteria.map((c) => [c.id, c]));
  r = { schema: r.schema, supplier_id: r.supplier_id, name: r.name, part_no: r.part_no,
    commodity: r.commodity, saved_at: r.saved_at,
    criteria: list.map(({ id }) => {
      const c = imported.get(id), missing = !c || c.state === 'missing';
      return { id, state: c?.state ?? 'missing', value: missing ? null : c.value ?? null,
        where: missing ? null : text(c.where), note: text(c?.note) };
    }) };
  const free = typeof r.supplier_id === 'string' && /^NEW-\d{2,}$/.test(r.supplier_id) && !records.some((x) => x.supplier_id === r.supplier_id);
  const record = free ? r : { ...r, supplier_id: nextId(records) };
  return { ok: true, record, records: [...records, record] };
}

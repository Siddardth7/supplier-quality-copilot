// Builds the view model: every queue score comes from evaluate() here (the hand-entry live panel and Import call it
// through manual.js, issue 77). Every score comes from the engine.
import { evaluate, scorecard } from './engine.js';
import { toExtraction } from './manual.js';
import { MANUAL_KEY } from './data.js';

const engineError = (path, e) => ({ path, message: String(e?.message ?? e), kind: 'engine' });

/** data: loadData() output. policy: the active policy, passed in so a new policy re-grades without a reload. */
export function buildModel(data, policy) {
  const base = { policy: { id: policy.id, version: policy.version, name: policy.name }, suppliers: data.suppliers, manual: data.manual,
    sheets: data.sheets ?? {},  // requirement sheets by commodity (#40); old fixtures have none
    evalRuns: data.evalRuns ?? null,  // data/eval.json Result (issue 111); old fixtures have none
    // The active pass marks (decision 97), read from the same policy object evaluate() gets; Compare's "Below pass mark".
    pass: { approve: policy.qualification?.approve ?? null, conditional: policy.qualification?.conditional ?? null } };
  if (!data.suppliers.ok) {
    // Monitor names its own file when that failed too; otherwise it can't score without as_of from suppliers.json.
    const error = data.history.ok ? data.suppliers.error : data.history.error;
    return { ...base, as_of: null, candidates: [], monitor: { ok: false, error } };
  }
  const { as_of, candidates, active } = data.suppliers.value;
  const scored = candidates.map(({ id, name, commodity, part }) => {
    const row = { id, name, commodity, part, source: 'dataset', drafts: null };  // drafts: the agent's text (#43), shown verbatim
    const file = data.extractions[id];
    if (!file?.ok) {
      return { ...row, status: 'not-extracted', evaluation: null, error: file?.error ?? { path: null, message: 'not loaded', kind: 'fetch' } };
    }
    try {
      return { ...row, status: 'scored', evaluation: evaluate(file.value, { as_of, policy }), drafts: file.value?.drafts ?? null, error: null };
    } catch (e) {
      return { ...row, status: 'engine-error', evaluation: null, error: engineError(file.path, e) };
    }
  });
  // Hand-entered suppliers (issue 77, UIQ-FR-16): scored like an extraction under the same policy, so a policy
  // change rescores them too. A record the engine refuses becomes an ENGINE ERROR card, never a broken queue.
  const manual = (data.manual?.records ?? []).map((r) => {
    const row = { id: r.supplier_id, name: r.name, commodity: r.commodity, part: r.part_no, source: 'manual', drafts: null };
    try {
      return { ...row, status: 'scored', evaluation: evaluate(toExtraction(r), { as_of, policy }), error: null };
    } catch (e) {
      return { ...row, status: 'engine-error', evaluation: null, error: engineError(MANUAL_KEY, e) };
    }
  });
  let monitor;
  if (!data.history.ok) monitor = { ok: false, error: data.history.error };
  else {
    try { monitor = { ok: true, value: scorecard(data.history.value, { as_of, policy }), active }; }
    catch (e) { monitor = { ok: false, error: engineError(data.history.path, e) }; }
  }
  return { ...base, as_of, candidates: [...scored, ...manual], monitor };
}

/** The Stark part number for a commodity, from its requirement sheet; null when the sheet failed or is not loaded (#40). */
export function sheetPart(model, commodity) {
  const sheets = model?.sheets ?? {};
  return Object.hasOwn(sheets, commodity) && sheets[commodity]?.ok ? sheets[commodity].value.part_no : null;
}

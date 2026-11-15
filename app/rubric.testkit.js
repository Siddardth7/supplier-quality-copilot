// Test-only helpers for app/rubric.js. Not imported by any non-test file.

const OPS = ['>=', '<=', '>', '<'];
const isScore = (s) => Number.isInteger(s) && s >= 0 && s <= 3;
const isObj = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const sameKeys = (o, keys) => isObj(o) && Object.keys(o).sort().join() === [...keys].sort().join();

function ruleErrors(type, rule) {
  switch (type) {
    case 'bool':
      return sameKeys(rule, ['true', 'false']) && isScore(rule.true) && isScore(rule.false)
        ? null : 'bool rule must be exactly { true, false } with scores 0-3';
    case 'date':
      return sameKeys(rule, ['ge_as_of', 'lt_as_of']) && rule.ge_as_of === 3 && rule.lt_as_of === 0
        ? null : 'date rule must be { ge_as_of: 3, lt_as_of: 0 }';
    case 'enum':
      return isObj(rule) && Object.keys(rule).length > 0 && Object.values(rule).every(isScore)
        ? null : 'enum rule must be a non-empty { <string>: score 0-3 }';
    case 'number': {
      if (!Array.isArray(rule) || rule.length === 0) return 'number rule must be a non-empty band array';
      const last = rule.length - 1;
      for (let i = 0; i < rule.length; i++) {
        const b = rule[i];
        if (i === last) {
          if (!sameKeys(b, ['score']) || !isScore(b.score)) return 'number rule last row must be { score } (the else)';
        } else if (!sameKeys(b, ['op', 'x', 'score']) || !OPS.includes(b.op) || !Number.isFinite(b.x) || !isScore(b.score)) {
          return `number rule row ${i} must be { op, x, score } with op in ${OPS.join(' ')}`;
        }
      }
      return null;
    }
    default:
      return `unknown type ${JSON.stringify(type)}`;
  }
}

// Returns [] when the rubric is valid; one message per violation, naming the id or key.
export function checkRubric(rubric) {
  const errs = [];
  const nums = rubric.categories.map((c) => c.n);
  const catSet = new Set(nums);
  if (catSet.size !== nums.length) errs.push('category numbers are not unique');
  for (let n = 1; n <= 9; n++) if (!catSet.has(n)) errs.push(`category ${n} missing`);
  for (const n of nums) if (!(Number.isInteger(n) && n >= 1 && n <= 9)) errs.push(`category ${n} outside 1..9`);

  const tc = rubric.test_criterion;
  if (!isObj(tc) || tc.cat !== 4 || !catSet.has(tc.cat) || typeof tc.knockout !== 'boolean') {
    errs.push('test_criterion must be { cat: 4, knockout: <boolean> }');
  }

  const checkItem = (item, where) => {
    const e = ruleErrors(item.type, item.rule);
    if (e) errs.push(`${item.id}: ${e}`);
    if (where === 'criteria') {
      if (typeof item.knockout !== 'boolean') errs.push(`${item.id}: knockout must be boolean`);
      if ('knockout_risk' in item) {
        const kr = item.knockout_risk;
        if (!Array.isArray(kr) || kr.length === 0 || !kr.every((r) => rubric.risk_classes.includes(r))) {
          errs.push(`${item.id}: knockout_risk must be a non-empty subset of risk_classes`);
        }
      }
    }
  };

  const critIds = new Set();
  for (const c of rubric.criteria) {
    if (critIds.has(c.id)) errs.push(`${c.id}: duplicate criterion id`);
    critIds.add(c.id);
    if (!catSet.has(c.cat)) errs.push(`${c.id}: unknown category ${c.cat}`);
    if (!/^[1-9]\.[a-z0-9_]+$/.test(c.id) || !c.id.startsWith(`${c.cat}.`)) {
      errs.push(`${c.id}: id must be <cat>.<slug> matching its category ${c.cat}`);
    }
    checkItem(c, 'criteria');
  }

  const testIds = new Set();
  for (const t of rubric.tests) {
    if (testIds.has(t.id)) errs.push(`${t.id}: duplicate test id`);
    testIds.add(t.id);
    if (critIds.has(t.id)) errs.push(`${t.id}: id is both a criterion and a test`);
    if (!/^4\.[a-z0-9_]+$/.test(t.id)) errs.push(`${t.id}: test id must be 4.<slug>`);
    checkItem(t, 'tests');
  }

  const keys = new Set();
  for (const p of rubric.commodities) {
    if (keys.has(p.key)) errs.push(`${p.key}: duplicate commodity key`);
    keys.add(p.key);
    if (!/^[a-z0-9_]+$/.test(p.key)) errs.push(`${p.key}: commodity key must be [a-z0-9_]+`);
    if (!rubric.risk_classes.includes(p.risk)) errs.push(`${p.key}: unknown risk ${JSON.stringify(p.risk)}`);
    if (!Array.isArray(p.required) || p.required.length === 0) errs.push(`${p.key}: needs at least one required test`);
    for (const list of ['required', 'nice']) {
      const ids = p[list] ?? [];
      const seen = new Set();
      for (const id of ids) {
        if (!testIds.has(id)) errs.push(`${p.key}: ${list} id ${id} is not in the test catalog`);
        if (seen.has(id)) errs.push(`${p.key}: ${id} listed twice in ${list}`);
        seen.add(id);
      }
    }
    for (const id of p.required ?? []) {
      if ((p.nice ?? []).includes(id)) errs.push(`${p.key}: ${id} is both required and nice to have`);
    }
  }
  return errs;
}

// Returns a new rubric with nBool + nNumber generated catalog tests and one commodity
// requiring all of them. Deterministic; never mutates its input.
export function withGeneratedCommodity(rubric, { key = 'gen_commodity', risk = 'High', nBool = 50, nNumber = 50 } = {}) {
  const out = structuredClone(rubric);
  const ids = [];
  for (let i = 1; i <= nBool + nNumber; i++) {
    const id = `4.gen_${String(i).padStart(3, '0')}`;
    ids.push(id);
    out.tests.push(i <= nBool
      ? { id, name: `Generated test ${i}`, passes_when: 'Generated', type: 'bool', rule: { true: 3, false: 0 } }
      : { id, name: `Generated test ${i}`, passes_when: 'Generated', type: 'number',
          rule: [{ op: '>=', x: 1, score: 3 }, { op: '>=', x: 0.5, score: 1 }, { score: 0 }] });
  }
  out.commodities.push({ key, name: 'Generated commodity', risk, required: ids, nice: [] });
  return out;
}

// Policy identity rule (RUBRIC.md § Team scoring policy: id non-empty string, version integer >= 1, name
// non-empty string), shared by evaluate.test.js and alerts.test.js so both engines are held to one table.
// [overrides of the policy (undefined = key removed), exact message]; checked in order id, version, name.
const ID = 'policy.id: expected a non-empty string, got ';
const VER = 'policy.version: expected an integer >= 1, got ';
const NAME = 'policy.name: expected a non-empty string, got ';
export const POLICY_META_REJECTS = [
  [{ id: undefined }, `${ID}undefined`], [{ id: '' }, `${ID}""`], [{ id: null }, `${ID}null`], [{ id: 7 }, `${ID}7`],
  [{ version: undefined }, `${VER}undefined`], [{ version: 0 }, `${VER}0`], [{ version: -1 }, `${VER}-1`],
  [{ version: 1.5 }, `${VER}1.5`], [{ version: '1' }, `${VER}"1"`], [{ version: NaN }, `${VER}null`], [{ version: 1n }, `${VER}1n`],
  [{ name: undefined }, `${NAME}undefined`], [{ name: '' }, `${NAME}""`], [{ name: ['x'] }, `${NAME}["x"]`],
  [{ id: '', version: 0, name: '' }, `${ID}""`], [{ version: 0, name: '' }, `${VER}0`],
];
export const POLICY_META_ACCEPTS = [{ id: 'a', version: 1, name: 'b' }, { version: 2 }, { version: 1e6 }];
export function withMeta(policy, over) {
  const p = { ...policy, ...over };
  for (const [k, v] of Object.entries(over)) if (v === undefined) delete p[k];
  return p;
}

// Value that scores 3 under a criterion's own rule, read from the rubric data (not the engine).
function topValue({ id, type, rule }) {
  if (type === 'bool') return true;
  if (type === 'date') return '2099-01-01';
  if (type === 'enum') return Object.keys(rule).find((k) => rule[k] === 3);
  if (type === 'number') return rule.find((b) => b.score === 3 && (b.op === '>=' || b.op === '<=')).x;
  throw new Error(`${id}: no score-3 value for type ${JSON.stringify(type)}`);
}

// Extraction with every applicable criterion verified at score 3: all rubric.criteria plus the
// commodity's required tests (not its nice-to-have ones). Scores 100 under the reference policy.
export function perfectExtraction(rubric, commodityKey) {
  const profile = rubric.commodities.find((p) => p.key === commodityKey);
  if (!profile) throw new Error(`${commodityKey}: unknown commodity`);
  const defs = [...rubric.criteria, ...profile.required.map((id) => rubric.tests.find((t) => t.id === id))];
  return {
    supplier_id: 'TEST',
    commodity: commodityKey,
    criteria: defs.map((d) => ({ id: d.id, state: 'verified', value: topValue(d), citation: 'test.md §1', note: null })),
  };
}

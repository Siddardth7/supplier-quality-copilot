// URL hash router (DESIGN-SPEC 4.2, DS-FR-07). Pure: no DOM, no model import.
// The view names, in tab order. A literal, not VIEWS from views/index.js: views import formatHash from here, and
// that import cycle fails module init (VIEWS read before it exists). route.test.js checks this equals VIEWS (#39).
const NAMES = ['today', 'qualify', 'compare', 'monitor', 'standards', 'eval'];
const ROLES = ['junior', 'senior'];

/** Every hash key and the views that use it, in DESIGN-SPEC 4.2 row order. This order is the canonical key order. */
export const ROUTE_KEYS = {
  view: NAMES, role: NAMES, policy: NAMES,
  supplier: ['qualify', 'eval'], tab: ['qualify'], doc: ['qualify', 'eval'], sec: ['qualify', 'eval'],
  filter: ['qualify'], new: ['qualify'], part: ['compare'], active: ['monitor'], month: ['monitor'],
  sheet: ['standards'], run: ['eval'], world: ['eval'],  // world + supplier: an Eval miss's packet (issue 111)
};

// Each rule returns the normalized value, or undefined (dropped, so the view uses its default).
const upper = (re) => (v) => (re.test(v.toUpperCase()) ? v.toUpperCase() : undefined);
const oneOf = (list) => (v) => (list.includes(v.toLowerCase()) ? v.toLowerCase() : undefined);
const whole = (re, ok) => (v) => (re.test(v) && ok(Number(v)) ? Number(v) : undefined);
const PART = /^SI-[A-Z]{2}-\d{4}$/;  // Stark part number, as in data/requirements/*.json
const RULES = {
  // Shared-policy token (issue 109, PRD-12 §5): 'p1.' + base64url. Only base64url characters and the dot pass here;
  // app/standards.js decodePolicy checks the prefix and the policy, so a wrong prefix is refused with a message.
  policy: (v) => (/^[A-Za-z0-9._-]{1,8000}$/.test(v) ? v : undefined),
  supplier: upper(/^(SUP|NEW)-\d{2,}$/),
  tab: oneOf(['problems', 'categories', 'requirements', 'drafts']),
  doc: (v) => (/^[a-z0-9_]+\.md$/.test(v.toLowerCase()) ? v.toLowerCase() : undefined),  // PRD-04 citation file part
  sec: (v) => (/^\d+(\.\d+)*$/.test(v) ? v : undefined),                                    // PRD-04 citation section part
  filter: oneOf(['junior', 'senior', 'not-approved', 'conditional', 'approved']),
  new: (v) => (v === '1' ? v : undefined),
  part: upper(PART),
  active: upper(/^ACT-\d{2,}$/),
  month: whole(/^\d{1,3}$/, (n) => n >= 1 && n <= 18),
  sheet: upper(PART),
  run: whole(/^\d{1,6}$/, (n) => n >= 1),
  world: whole(/^\d{1,6}$/, (n) => n >= 1),
};

const decode = (s) => { try { return decodeURIComponent(s); } catch { return s; } };

/** '#view=monitor&role=junior&active=act-02' -> { view, role, params }. Invalid or foreign keys are dropped (DS-FR-07). */
export function parseHash(hash = '') {
  const raw = Object.create(null);  // hash keys are user input: no prototype to pollute
  for (const part of String(hash).replace(/^#/, '').split('&')) {
    if (!part) continue;
    const i = part.indexOf('=');
    raw[decode(i < 0 ? part : part.slice(0, i))] = (i < 0 ? '' : decode(part.slice(i + 1))).trim();
  }
  const supplier = raw.supplier === undefined ? undefined : RULES.supplier(raw.supplier);
  // No view key: a bare valid #supplier= is the v1.0 link form and opens Qualify; anything else is Today.
  const view = raw.view === undefined ? (supplier ? 'qualify' : 'today') : (oneOf(NAMES)(raw.view) ?? 'today');
  const role = raw.role === undefined ? 'senior' : (oneOf(ROLES)(raw.role) ?? 'senior');
  const params = {};
  for (const [key, views] of Object.entries(ROUTE_KEYS)) {
    if (!RULES[key] || raw[key] === undefined || !views.includes(view)) continue;
    if (key === 'sec' && params.doc === undefined) continue;  // a section means nothing without its file
    const value = RULES[key](raw[key]);
    if (value !== undefined) params[key] = value;
  }
  return { view, role, params };
}

/** Canonical hash from the flat { view, role, ...params }: keys in ROUTE_KEYS order; unknown and empty keys left out. */
export function formatHash(fields) {
  return '#' + Object.keys(ROUTE_KEYS)
    .filter((k) => fields[k] !== undefined && fields[k] !== null && fields[k] !== '')
    .map((k) => `${k}=${encodeURIComponent(fields[k])}`)
    .join('&');
}

// Eval packet pairs the view links from (issue 163): every miss row of every run in data/eval.json, as 'world|SUP-xx'.
// A bad or missing file gives an empty set (every pair Not found), never a throw.
const evalPairs = (model) => {
  const runs = model.evalRuns?.ok ? model.evalRuns.value?.runs : null;
  return new Set((Array.isArray(runs) ? runs : []).flatMap((r) => (Array.isArray(r?.groups) ? r.groups : [])
    .flatMap((g) => (Array.isArray(g?.misses) ? g.misses : []).map((m) => `${m?.world}|${m?.supplier_id}`))));
};

/** Adds notFound for a well-formed but unknown supplier or active ID, and an Eval packet pair not published as a miss.
 *  Null while loading or when that source failed (except Eval: no eval.json means no pair can open).
 *  Only Qualify checks supplier against the candidates: an Eval supplier belongs to a world packet, not to suppliers.json. */
export function resolveRoute(route, model) {
  const { supplier, active, world } = route.params;
  let notFound = null;
  if (model && route.view === 'qualify' && supplier !== undefined && model.suppliers.ok && !model.candidates.some((c) => c.id === supplier)) {
    notFound = { key: 'supplier', value: supplier, label: 'Not found' };
  } else if (model && active !== undefined && model.monitor.ok && !model.monitor.value.suppliers.some((s) => s.supplier_id === active)) {
    notFound = { key: 'active', value: active, label: 'Not found' };
  } else if (model && route.view === 'eval' && world !== undefined && supplier !== undefined && !evalPairs(model).has(`${world}|${supplier}`)) {
    notFound = { key: 'packet', value: `${supplier}, world ${world}`, label: 'Not found' };
  }
  return { ...route, notFound };
}

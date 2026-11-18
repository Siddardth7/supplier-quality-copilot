// URL-hash router (#38; DESIGN-SPEC 4.2, DS-FR-06, DS-FR-07, DS-AC-04, OVR-FR-03, UIQ-FR-11/12, UIM-FR-11/12).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHash, formatHash, resolveRoute, ROUTE_KEYS } from './route.js';
import { VIEWS } from './views/index.js';
import { table } from './docs.testkit.js';

const SPEC = readFileSync(new URL('../docs/product/DESIGN-SPEC.md', import.meta.url), 'utf8');
const ROWS = table(SPEC, '4.2 URL hash');
const row = (key) => ROWS.find((r) => r.Key === key);
const NAMES = VIEWS.map((v) => v.meta.name);
const docViews = (r) => (r.Views === 'all' ? NAMES : r.Views.split(',').map((s) => s.trim()));
const P = (h) => parseHash(h).params;
const canon = (r) => formatHash({ view: r.view, role: r.role, ...r.params });

test('DS-FR-06: the six view names match VIEWS and the DESIGN-SPEC 4.2 view row, in order', () => {
  const doc = row('view').Values.split(' · ');
  assert.deepEqual(doc, ['today', 'qualify', 'compare', 'monitor', 'standards', 'eval']);
  assert.deepEqual(NAMES, doc);
  for (const name of doc) assert.equal(parseHash(`#view=${name}`).view, name);
});

test('doc drift: ROUTE_KEYS has exactly the 4.2 keys, in row order, with the same view lists', () => {
  const docKeys = ROWS.flatMap((r) => r.Key.split(',').map((k) => k.trim()));
  assert.deepEqual(Object.keys(ROUTE_KEYS), docKeys);
  for (const r of ROWS) for (const k of r.Key.split(',').map((s) => s.trim())) assert.deepEqual(ROUTE_KEYS[k], docViews(r), k);
});

test('doc drift: every enum value in 4.2 parses to itself', () => {
  for (const v of row('view').Values.split(' · ')) assert.equal(parseHash(`#view=${v}`).view, v);
  for (const v of row('role').Values.split(' · ')) assert.equal(parseHash(`#role=${v}`).role, v);
  for (const v of row('tab').Values.split(' · ')) assert.equal(P(`#view=qualify&tab=${v}`).tab, v);
  for (const v of row('filter').Values.split(' · ')) assert.equal(P(`#view=qualify&filter=${v}`).filter, v);
  assert.equal(row('new').Values, '1');
  assert.equal(P('#view=qualify&new=1').new, '1');
});

test('doc drift: month bounds come from the 4.2 row', () => {
  const [, lo, hi] = row('month').Values.match(/^(\d+)…(\d+)$/).map(Number);
  assert.deepEqual([lo, hi], [1, 18]);
  for (const m of [lo, hi]) assert.equal(P(`#view=monitor&month=${m}`).month, m);
  for (const m of [lo - 1, hi + 1]) assert.equal(P(`#view=monitor&month=${m}`).month, undefined);
});

test('DS-AC-04: every 4.2 example opens its view with its value', () => {
  for (const r of ROWS) {
    const view = r.Views === 'all' ? 'today' : docViews(r)[0];
    const example = r.Example.match(/^[#&]\S+/)[0].replace(/^[#&]/, '');
    const h = r.Key === 'view' ? `#${example}` : `#view=${view}&${example}`;
    const got = parseHash(h);
    const expectView = r.Key === 'view' ? example.split('=')[1] : view;
    assert.equal(got.view, expectView, h);
    for (const pair of example.split('&')) {
      const [k, v] = pair.split('=');
      const actual = k === 'view' || k === 'role' ? got[k] : got.params[k];
      assert.equal(String(actual), v, h);
    }
  }
  assert.equal(P('#view=today&policy=p1.eyJpZCI6InBvbGljeS0xIn0').policy, 'p1.eyJpZCI6InBvbGljeS0xIn0');
});

test('spec examples, defaults, bare supplier, view present vs absent', () => {
  assert.deepEqual(parseHash(''), { view: 'today', role: 'senior', params: {} });
  assert.deepEqual(parseHash('#'), { view: 'today', role: 'senior', params: {} });
  assert.deepEqual(parseHash(), { view: 'today', role: 'senior', params: {} });
  assert.deepEqual(parseHash('#view=monitor&role=junior&active=ACT-02'), { view: 'monitor', role: 'junior', params: { active: 'ACT-02' } });
  assert.deepEqual(parseHash('#supplier=SUP-07'), { view: 'qualify', role: 'senior', params: { supplier: 'SUP-07' } });
  assert.deepEqual(parseHash('#supplier=NEW-01'), { view: 'qualify', role: 'senior', params: { supplier: 'NEW-01' } });
  assert.deepEqual(parseHash('#supplier=sup-7'), { view: 'today', role: 'senior', params: {} }, 'one digit is invalid');
  assert.deepEqual(parseHash('#view=bogus&supplier=SUP-07'), { view: 'today', role: 'senior', params: {} });
  assert.deepEqual(parseHash('#view=&supplier=SUP-07'), { view: 'today', role: 'senior', params: {} });
  assert.deepEqual(parseHash('#view=today&role=junior'), { view: 'today', role: 'junior', params: {} });
});

test('DS-FR-07: malformed hashes fall back without an error', () => {
  for (const h of ['#view=bogus&role=x', '#view=&role=', '#view=toString&role=constructor', '#view', '#role', '#=x', '#&&', '#view=']) {
    const r = parseHash(h);
    assert.equal(r.view, 'today', h);
    assert.equal(r.role, 'senior', h);
    assert.deepEqual(r.params, {}, h);
  }
  assert.equal(parseHash('view=eval&&&').view, 'eval', 'leading # optional, empty parts skipped');
});

test('case: enums lower-cased, IDs and part numbers upper-cased, doc lower-cased', () => {
  const r = parseHash('#view=Qualify&role=JUNIOR&supplier=sup-07&part=si-cp-0007&filter=Not-Approved&doc=Capability_Study.md&tab=DRAFTS');
  assert.equal(r.view, 'qualify');
  assert.equal(r.role, 'junior');
  assert.deepEqual(r.params, { supplier: 'SUP-07', doc: 'capability_study.md', tab: 'drafts', filter: 'not-approved' }, 'part is a compare key');
  assert.equal(P('#view=compare&part=si-cp-0007').part, 'SI-CP-0007');
  assert.equal(P('#view=standards&sheet=si-qd-0002').sheet, 'SI-QD-0002');
  assert.equal(P('#view=monitor&active=act-02').active, 'ACT-02');
  assert.equal(P('#view=eval&doc=A.MD').doc, 'a.md');
});

test('foreign keys are dropped; criterion is not a key', () => {
  assert.deepEqual(P('#view=monitor&supplier=SUP-07&month=18'), { month: 18 });
  assert.deepEqual(P('#view=today&supplier=SUP-07&run=2&active=ACT-02'), {});
  assert.deepEqual(P('#view=qualify&criterion=x&supplier=SUP-07'), { supplier: 'SUP-07' });
  assert.deepEqual(P('#criterion=4.cpk'), {});
  assert.deepEqual(P('#view=compare&sheet=SI-CP-0007'), {}, 'sheet belongs to standards');
});

test('month: whole numbers 1..18, leading zeros and spaces normalized', () => {
  const m = (v) => P(`#view=monitor&month=${v}`).month;
  for (const v of ['0', '19', '1.5', '-3', 'abc', '1e1', '', '0x5', '1000']) assert.equal(m(v), undefined, v);
  assert.equal(m('1'), 1);
  assert.equal(m('18'), 18);
  assert.equal(m('007'), 7);
  assert.equal(m('%205'), 5, 'trimmed after decoding');
  assert.equal(typeof m('7'), 'number');
});

test('run: whole numbers from 1, at most six digits', () => {
  const r = (v) => P(`#view=eval&run=${v}`).run;
  assert.equal(r('0'), undefined);
  assert.equal(r('1'), 1);
  assert.equal(r('999999'), 999999);
  assert.equal(r('1000000'), undefined);
  assert.equal(r('2.0'), undefined);
});

test('new is exactly 1', () => {
  assert.equal(P('#view=qualify&new=1').new, '1');
  for (const v of ['0', 'true', '', '01']) assert.equal(P(`#view=qualify&new=${v}`).new, undefined, v);
});

test('doc and sec: PRD-04 citation parts; sec needs a valid doc', () => {
  assert.deepEqual(P('#view=qualify&doc=capability_study.md&sec=2.1'), { doc: 'capability_study.md', sec: '2.1' });
  assert.deepEqual(P('#view=eval&doc=capability_study.md&sec=2'), { doc: 'capability_study.md', sec: '2' });
  assert.deepEqual(P('#view=qualify&sec=2'), {}, 'sec without doc');
  assert.deepEqual(P('#view=qualify&doc=../x.md&sec=2'), {}, 'bad doc drops sec too');
  assert.deepEqual(P('#view=qualify&doc=a%2Fb.md'), {});
  assert.deepEqual(P('#view=qualify&doc=capability%20study.md'), {});
  assert.deepEqual(P('#view=qualify&doc=a.md&sec=2.'), { doc: 'a.md' });
  assert.deepEqual(P('#view=qualify&doc=a.md&sec=a'), { doc: 'a.md' });
  assert.deepEqual(P('#view=qualify&sec=2&doc=a.md'), { doc: 'a.md', sec: '2' }, 'order in the hash does not matter');
});

test('ID formats: supplier, active, part, sheet', () => {
  for (const v of ['SUP-07', 'NEW-01', 'SUP-123']) assert.equal(P(`#view=qualify&supplier=${v}`).supplier, v);
  for (const v of ['SUP-7', 'banana', 'ACT-02', 'SUP-07x', 'SUP07']) assert.equal(P(`#view=qualify&supplier=${v}`).supplier, undefined, v);
  assert.equal(P('#view=monitor&active=SUP-02').active, undefined);
  assert.equal(P('#view=monitor&active=ACT-2').active, undefined);
  for (const v of ['SI-CP-007', 'SI-C1-0007', 'XX-CP-0007', 'SI-CP-00071']) assert.equal(P(`#view=compare&part=${v}`).part, undefined, v);
});

test('tab and filter: other values dropped', () => {
  assert.equal(P('#view=qualify&tab=bogus').tab, undefined);
  assert.equal(P('#view=qualify&filter=pending').filter, undefined);
});

test('policy: a base64url-and-dot token (issue 109), non-empty, global; anything else is dropped', () => {
  assert.equal(P('#view=today&policy=').policy, undefined);
  assert.equal(P('#view=monitor&policy=abc').policy, 'abc');
  assert.equal(P('#view=monitor&policy=p1.a-b_C9').policy, 'p1.a-b_C9');
  assert.equal(P('#view=eval&policy=a%26b%3Dc%25').policy, undefined);
  assert.equal(P('#view=eval&policy=p1.ab%3D').policy, undefined, 'padding is stripped by the encoder, so = is refused');
  const h = '#view=compare&role=junior&policy=p1.a-b_C9&part=SI-CP-0007';
  assert.equal(canon(parseHash(h)), h, 'byte-for-byte round trip');
});

test('duplicates: last wins, before validation', () => {
  assert.equal(parseHash('#view=qualify&view=compare').view, 'compare');
  assert.equal(P('#view=qualify&supplier=SUP-01&supplier=SUP-02').supplier, 'SUP-02');
  assert.equal(P('#view=qualify&supplier=SUP-01&supplier=banana').supplier, undefined);
});

test('percent-encoding, bad escapes and prototype keys', () => {
  assert.equal(P('#view=qualify&supplier=%53UP-07').supplier, 'SUP-07');
  assert.equal(P('#view=qualify&supplier=SUP%2D07').supplier, 'SUP-07');
  assert.equal(P('#view=qualify&%73upplier=SUP-07').supplier, 'SUP-07', 'keys decode too');
  assert.equal(P('#view=qualify&supplier=%E0%A4%A').supplier, undefined);
  assert.equal(parseHash('#view=%E0%A4%A').view, 'today');
  assert.equal(parseHash('#view=qualify+x').view, 'today', '+ is not a space');
  for (const h of ['#__proto__=x', '#constructor=x', '#toString', '#view=__proto__&role=toString', '#supplier=__proto__', '#__proto__[x]=1&hasOwnProperty=1']) {
    const r = parseHash(h);
    assert.equal(r.view, 'today', h);
    assert.deepEqual(r.params, {}, h);
  }
});

test('formatHash: canonical order, unknown and empty keys skipped, no role invented', () => {
  assert.equal(formatHash({ run: 2, view: 'eval', policy: 'x', role: 'junior', doc: 'a.md' }), '#view=eval&role=junior&policy=x&doc=a.md&run=2');
  assert.equal(formatHash({ view: 'today' }), '#view=today');
  assert.equal(formatHash({ view: 'qualify', criterion: 'x', supplier: 'SUP-07' }), '#view=qualify&supplier=SUP-07');
  assert.equal(formatHash({ view: 'qualify', role: undefined, policy: null, tab: '', supplier: 'SUP-07' }), '#view=qualify&supplier=SUP-07');
  assert.equal(formatHash({ doc: 'a&b=c d' }), '#doc=a%26b%3Dc%20d');
  assert.equal(formatHash({ month: 7, view: 'monitor' }), '#view=monitor&month=7');
});

test('round trip: canonical hash parses to the same route and is stable', () => {
  const examples = ROWS.map((r) => (r.Key === 'view' ? r.Example : `#view=${r.Views === 'all' ? 'today' : docViews(r)[0]}&${r.Example.match(/^&(\S+)/)[1]}`));
  const edges = ['', '#', 'view=eval&&&', '#view', '#=x', '#&&', '#supplier=sup-07',
    '#view=Qualify&role=JUNIOR&supplier=sup-07&part=si-cp-0007&filter=Not-Approved&doc=Capability_Study.md',
    '#view=monitor&supplier=SUP-07&month=007', '#view=eval&run=999999&doc=a.md&sec=2.1&policy=%E2%80%A6',
    '#view=qualify&new=1&tab=drafts&filter=junior&policy=p1.a-b', '#view=standards&sheet=si-cp-0007&role=junior'];
  for (const h of [...examples, ...edges]) {
    const first = parseHash(h);
    const h2 = canon(first);
    assert.deepEqual(parseHash(h2), first, h);
    assert.equal(canon(parseHash(h2)), h2, h);
  }
  assert.equal(canon(parseHash('#view=qualify&supplier=sup-07&bogus=1')), '#view=qualify&role=senior&supplier=SUP-07');
  assert.equal(canon(parseHash('#supplier=SUP-07')), '#view=qualify&role=senior&supplier=SUP-07');
});

const MODEL = {
  candidates: [{ id: 'SUP-07' }, { id: 'SUP-01' }],
  suppliers: { ok: true },
  monitor: { ok: true, value: { suppliers: [{ supplier_id: 'ACT-02' }] } },
};

test('resolveRoute: unknown supplier and active IDs are Not found; loading and failed sources are not', () => {
  const r = (h, model = MODEL) => resolveRoute(parseHash(h), model).notFound;
  assert.deepEqual(r('#supplier=SUP-99'), { key: 'supplier', value: 'SUP-99', label: 'Not found' });
  assert.deepEqual(r('#view=qualify&supplier=NEW-01'), { key: 'supplier', value: 'NEW-01', label: 'Not found' });
  assert.equal(r('#supplier=SUP-07'), null);
  assert.deepEqual(r('#view=monitor&active=ACT-99'), { key: 'active', value: 'ACT-99', label: 'Not found' });
  assert.equal(r('#view=monitor&active=ACT-02'), null);
  assert.equal(r('#view=qualify&supplier=ACT-02'), null, 'garbage is dropped by the parser, never Not found');
  assert.equal(r('#view=monitor&active=SUP-07'), null);
  assert.equal(r('#view=compare&part=SI-XX-9999'), null, 'part existence is the view\'s job');
  assert.equal(r('#supplier=SUP-99', null), null, 'loading');
  assert.equal(r('#supplier=SUP-99', { ...MODEL, suppliers: { ok: false }, candidates: [] }), null);
  assert.equal(r('#view=monitor&active=ACT-99', { ...MODEL, monitor: { ok: false } }), null);
  assert.equal(r('#view=today'), null, 'empty params');
});

test('resolveRoute: keeps the route and does not mutate it', () => {
  const route = parseHash('#view=qualify&role=junior&supplier=SUP-99&tab=drafts');
  const copy = structuredClone(route);
  const out = resolveRoute(route, MODEL);
  assert.deepEqual(route, copy);
  assert.equal(Object.hasOwn(route, 'notFound'), false);
  assert.deepEqual({ ...out, notFound: undefined }, { ...copy, notFound: undefined });
  assert.equal(out.params.tab, 'drafts');
});

// QA additions (#38 tester): rules the coder's tests left open.
test('keys are case-sensitive: an upper-case key is unknown and dropped', () => {
  assert.equal(parseHash('#VIEW=compare').view, 'today');
  assert.equal(parseHash('#view=compare&ROLE=junior').role, 'senior');
  assert.deepEqual(P('#view=qualify&Supplier=SUP-07'), {});
  assert.equal(parseHash('#Supplier=SUP-07').view, 'today', 'bare supplier key must be lower-case too');
});

test('values are trimmed before validation; + is literal, never a space', () => {
  assert.equal(parseHash('#view=%20Compare%20').view, 'compare');
  assert.equal(P('#view=qualify&supplier=%20sup-07').supplier, 'SUP-07');
  assert.equal(parseHash('#view=qualify+').view, 'today', '+ would trim away if decoded as a space');
  assert.equal(P('#view=monitor&month=+5').month, undefined);
});

test('ID and citation formats at their edges', () => {
  assert.equal(P('#view=qualify&supplier=new-01').supplier, 'NEW-01');
  assert.equal(P('#view=monitor&active=ACT-123').active, 'ACT-123');
  assert.equal(P('#view=qualify&doc=a.md&sec=2.1.3').sec, '2.1.3', 'multi-level section');
  assert.equal(P('#view=qualify&doc=.md').doc, undefined, 'file name needs at least one character');
  assert.equal(P('#view=qualify&doc=a.txt').doc, undefined);
  assert.equal(P('#view=qualify&doc=a.md.bak').doc, undefined, 'anchored at the end');
  assert.equal(P('#view=qualify&doc=a.md&sec=x2').sec, undefined, 'sec anchored at the start');
  assert.equal(P('#view=compare&part=xSI-CP-0007').part, undefined, 'part anchored at the start');
  assert.equal(P('#view=qualify&new=1 ').new, '1', 'trimmed');
});

test('a polluted Object.prototype never leaks into the route', () => {
  Object.prototype.supplier = 'SUP-07';  // the raw key bag is Object.create(null), so this is never read
  try {
    assert.deepEqual(parseHash('#'), { view: 'today', role: 'senior', params: {} });
  } finally {
    delete Object.prototype.supplier;
  }
});

test('resolveRoute: each source gates only its own key', () => {
  const r = (h, model) => resolveRoute(parseHash(h), model).notFound;
  assert.deepEqual(r('#supplier=SUP-99', { ...MODEL, monitor: { ok: false } }), { key: 'supplier', value: 'SUP-99', label: 'Not found' });
  assert.deepEqual(r('#view=monitor&active=ACT-99', { ...MODEL, suppliers: { ok: false }, candidates: [] }), { key: 'active', value: 'ACT-99', label: 'Not found' });
  assert.equal(r('#view=monitor&active=ACT-02', { ...MODEL, suppliers: { ok: false }, candidates: [] }), null);
});

// ---- Eval packet keys (issue 111; DESIGN-SPEC 4.2 world and supplier rows) ----

test('issue 111: world is an Eval key, whole numbers from 1, at most six digits', () => {
  assert.equal(P('#view=eval&world=101').world, 101);
  assert.equal(P('#view=eval&world=007').world, 7);
  assert.equal(P('#view=eval&world=1').world, 1);
  assert.equal(P('#view=eval&world=999999').world, 999999);
  for (const bad of ['0', '-1', 'abc', '1.5', '1e2', '1234567', '', ' ']) assert.equal(P(`#view=eval&world=${bad}`).world, undefined, bad);
  for (const v of ['today', 'qualify', 'compare', 'monitor', 'standards']) assert.equal(P(`#view=${v}&world=101`).world, undefined, v);
});

test('issue 111: supplier is kept in Eval and Qualify, still dropped in Today, Compare, Monitor and Standards', () => {
  assert.equal(P('#view=eval&supplier=sup-03').supplier, 'SUP-03');
  assert.equal(P('#view=qualify&supplier=SUP-03').supplier, 'SUP-03');
  for (const v of ['today', 'compare', 'monitor', 'standards']) assert.equal(P(`#view=${v}&supplier=SUP-03`).supplier, undefined, v);
  assert.equal(P('#view=eval&supplier=ACT-02').supplier, undefined, 'the supplier format still applies');
  assert.equal(parseHash('#supplier=SUP-03&world=101').view, 'qualify', 'a bare supplier still opens Qualify, which drops world');
  assert.equal(P('#supplier=SUP-03&world=101').world, undefined);
});

test('issue 111: the canonical Eval packet hash; round trip is stable', () => {
  const h = formatHash({ world: 101, run: 2, sec: '2.1', doc: 'msa.md', supplier: 'SUP-03', role: 'senior', view: 'eval' });
  assert.equal(h, '#view=eval&role=senior&supplier=SUP-03&doc=msa.md&sec=2.1&run=2&world=101');
  const r = parseHash(h);
  assert.deepEqual(r, { view: 'eval', role: 'senior', params: { supplier: 'SUP-03', doc: 'msa.md', sec: '2.1', run: 2, world: 101 } });
  assert.equal(canon(r), h);
  assert.equal(canon(parseHash('#world=101&view=eval&supplier=sup-03&run=02')), '#view=eval&role=senior&supplier=SUP-03&run=2&world=101');
});

test('issue 111: resolveRoute checks the supplier only in Qualify; an Eval packet supplier is never checked against candidates', () => {
  // Issue 163: the Eval pair must be a published miss, so this model publishes 101|SUP-99 (not a candidate).
  const model = { ...MODEL, evalRuns: { ok: true, value: { runs: [{ groups: [{ misses: [{ world: 101, supplier_id: 'SUP-99' }] }] }] } } };
  const r = (h) => resolveRoute(parseHash(h), model).notFound;
  assert.equal(r('#view=eval&supplier=SUP-99&world=101'), null);
  assert.equal(r('#view=eval&supplier=SUP-99&world=101&doc=msa.md&sec=1.1'), null);
  assert.deepEqual(r('#view=qualify&supplier=SUP-99'), { key: 'supplier', value: 'SUP-99', label: 'Not found' });
  assert.deepEqual(r('#supplier=SUP-99'), { key: 'supplier', value: 'SUP-99', label: 'Not found' });
  assert.equal(r('#view=qualify&supplier=SUP-07'), null);
});

// ---- issue 163: an Eval world + supplier pair must be a published miss (decision 242) ----
const MISS = (world, supplier_id) => ({ world, supplier_id });
const EVAL_MODEL = { ...MODEL, evalRuns: { ok: true, value: { runs: [{ groups: [{ misses: [MISS(101, 'SUP-01')] }] }] } } };
const NF = (supplier, world) => ({ key: 'packet', value: `${supplier}, world ${world}`, label: 'Not found' });

test('issue 163: resolveRoute opens only published Eval miss pairs; any other pair is Not found', () => {
  const r = (h, model = EVAL_MODEL) => resolveRoute(parseHash(h), model).notFound;
  assert.equal(r('#view=eval&world=101&supplier=SUP-01'), null);
  assert.equal(r('#view=eval&world=101&supplier=SUP-01&doc=nope.md'), null, 'doc existence is the viewer\'s job');
  assert.deepEqual(r('#view=eval&world=999&supplier=SUP-07'), NF('SUP-07', 999));
  assert.deepEqual(r('#view=eval&world=101&supplier=SUP-07'), NF('SUP-07', 101), 'known world, unknown supplier');
  assert.deepEqual(r('#view=eval&world=102&supplier=SUP-01'), NF('SUP-01', 102), 'known supplier, other world');
  assert.equal(r('#view=eval&world=999'), null, 'world only');
  assert.equal(r('#view=eval&supplier=SUP-07'), null, 'supplier only');
  assert.equal(r('#view=eval&world=999&supplier=SUP-07', null), null, 'loading');
  // Hand-built routes: parseHash already drops world outside Eval, so only these exercise the view guard.
  const hand = (view, params) => resolveRoute({ view, role: 'senior', params }, EVAL_MODEL).notFound;
  assert.equal(hand('qualify', { supplier: 'SUP-07', world: 999 }), null, 'other views ignore it');
  assert.equal(hand('monitor', { active: 'ACT-02', world: 999 }), null);
});

test('issue 163: with no usable eval.json every Eval pair is Not found; malformed shapes never throw', () => {
  const h = parseHash('#view=eval&world=101&supplier=SUP-01');
  const nf = (evalRuns) => resolveRoute(h, { ...MODEL, evalRuns }).notFound;
  const runs = (r) => ({ ok: true, value: { runs: r } });
  for (const [name, er] of [['absent', undefined], ['null', null], ['failed', { ok: false, error: { message: 'HTTP 404' } }],
    ['empty runs', runs([])], ['runs not an array', runs({})], ['no value', { ok: true }], ['groups not an array', runs([{ groups: 7 }])],
    ['null run', runs([null])], ['misses not an array', runs([{ groups: [{ misses: 'x' }] }])], ['null group', runs([{ groups: [null] }])],
    ['null miss', runs([{ groups: [{ misses: [null] }] }])], ['string world, other pair', runs([{ groups: [{ misses: [MISS('102', 'SUP-01')] }] }])]]) {
    assert.deepEqual(nf(er), NF('SUP-01', 101), name);
  }
  // A good miss beside bad entries still opens.
  assert.equal(nf(runs([null, { groups: [null, { misses: [null, MISS(101, 'SUP-01')] }] }])), null);
});

test('issue 163: every miss pair in the real data/eval.json opens; 101|SUP-04 and 999|SUP-07 do not', () => {
  const file = JSON.parse(readFileSync(new URL('../data/eval.json', import.meta.url), 'utf8'));
  const model = { ...MODEL, evalRuns: { ok: true, value: file } };
  const pairs = new Set(file.runs.flatMap((r) => r.groups.flatMap((g) => g.misses.map((m) => `${m.world}|${m.supplier_id}`))));
  assert.equal(pairs.size, 14);
  for (const p of pairs) {
    const [w, s] = p.split('|');
    assert.equal(resolveRoute(parseHash(`#view=eval&world=${w}&supplier=${s}`), model).notFound, null, p);
  }
  assert.deepEqual(resolveRoute(parseHash('#view=eval&world=101&supplier=SUP-04'), model).notFound, NF('SUP-04', 101));
  assert.deepEqual(resolveRoute(parseHash('#view=eval&world=999&supplier=SUP-07'), model).notFound, NF('SUP-07', 999));
});

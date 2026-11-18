// Standards: scoring policy editor (issue 109; PRD-12 UIS-FR-01..10, UIS-AC-01..05; decisions 105-121).
// Expected numbers come from docs/RUBRIC.md / SCORECARD.md and the spec (section 8), not from running the code under test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STARK_REFERENCE, RUBRIC, evaluate, scorecard, validatePolicy, parseHistory } from './engine.js';
import { perfectExtraction } from './rubric.testkit.js';
import { buildModel } from './model.js';
import { safeStorage } from './storage.js';
import { parseHash, formatHash } from './route.js';
import { resolvePolicy, chipView } from './policy.js';
import {
  POLICIES_KEY, STORE_SCHEMA, RESERVED_ID, knockoutList, ratingsOf, shownWeights, normalizeRatings, setRating, setField,
  parseNumber, toggleKnockout, checkPolicy, livePolicy, fieldError, encodePolicy, decodePolicy, loadStore, writeStore,
  activePolicy, nextVersion, newId, saveToList, removeFromList, importPolicy, exportPolicy, impact, renderStandards,
  sheetRows, sheetView, sheetHref, limitText, renderSheet,
} from './standards.js';
import { readFileSync, readdirSync } from 'node:fs';
import { sheetPart } from './model.js';
import { detailModel } from './queue.js';
import { compareModel } from './compare.js';
import { loadData } from './data.js';
import * as view from './views/standards.js';

const REF = STARK_REFERENCE;
const AS_OF = '2026-11-01';
const pol = (q = {}, s = {}, meta = {}) => ({ ...REF, ...meta, qualification: { ...REF.qualification, ...q }, scorecard: { ...REF.scorecard, ...s } });
const custom = (over = {}) => ({ ...pol(), id: 'policy-1', version: 1, name: 'Cold-plate team', ...over });
const errOf = (fn) => { try { fn(); } catch (e) { return e.message; } return null; };
const qualErr = (p) => errOf(() => evaluate(perfectExtraction(RUBRIC, 'cold_plate'), { as_of: AS_OF, policy: p }));
const scErr = (p) => errOf(() => scorecard([], { as_of: AS_OF, policy: p }));
const sum = (w) => Object.values(w).reduce((a, b) => a + b, 0);
const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const tokenOf = (text) => 'p1.' + b64url(new TextEncoder().encode(text));

// ---- 1. engine validatePolicy (decision 105) ----

test('validatePolicy: accepts Stark Reference v1 and returns nothing', () => {
  assert.equal(validatePolicy(REF), undefined);
});

test('validatePolicy: qualification errors are byte-identical to evaluate() and name the field', () => {
  const W = REF.qualification.weights;
  const cases = [
    [pol({ weights: { ...W, 1: 14 } }), 'policy.qualification.weights: sum is 99, expected 100 (±0.01)'],
    [pol({ approve: 85, conditional: 85 }), 'policy.qualification.conditional: expected a number >= 0 and < approve (85), got 85'],
    [pol({ approve: 101 }), 'policy.qualification.approve: expected a number 0-100, got 101'],
    [pol({ approve: -1 }), 'policy.qualification.approve: expected a number 0-100, got -1'],
    [pol({ approve: 80, conditional: 90 }), 'policy.qualification.conditional: expected a number >= 0 and < approve (80), got 90'],
    [pol({ conditional: -1 }), 'policy.qualification.conditional: expected a number >= 0 and < approve (85), got -1'],
    [pol({ knockouts_off: ['9.nope'] }), 'policy.qualification.knockouts_off: "9.nope" is not a knockout criterion id'],
    [pol({ approve: '' }), 'policy.qualification.approve: expected a number 0-100, got ""'],
    [{ ...REF, id: '' }, 'policy.id: expected a non-empty string, got ""'],
    [{ ...REF, version: 0 }, 'policy.version: expected an integer >= 1, got 0'],
    [{ ...REF, name: '' }, 'policy.name: expected a non-empty string, got ""'],
  ];
  for (const [p, msg] of cases) {
    assert.equal(errOf(() => validatePolicy(p)), msg);
    assert.equal(qualErr(p), msg, 'same text as evaluate()');
  }
  const noId = { ...REF }; delete noId.id;
  assert.match(errOf(() => validatePolicy(noId)), /^policy\.id: /);
  const noName = { ...REF }; delete noName.name;
  assert.match(errOf(() => validatePolicy(noName)), /^policy\.name: /);
  const noVersion = { ...REF }; delete noVersion.version;
  assert.match(errOf(() => validatePolicy(noVersion)), /^policy\.version: /);
});

test('validatePolicy: scorecard errors are byte-identical to scorecard() and name the field', () => {
  const S = REF.scorecard;
  const cases = [
    [pol({}, { tiers: { A: 90, B: 95, C: 55 } }), 'policy.scorecard.tiers.B: expected a number < A (90), got 95'],
    [pol({}, { tiers: { A: 90, B: 90, C: 55 } }), 'policy.scorecard.tiers.B: expected a number < A (90), got 90'],
    [pol({}, { tiers: { A: 90, B: 75, C: 75 } }), 'policy.scorecard.tiers.C: expected a number < B (75), got 75'],
    [pol({}, { limits: { ...S.limits, otd: { good: 95, watch: 96 } } }), 'policy.scorecard.limits.otd.watch: expected a number <= good (95), got 96'],
    [pol({}, { limits: { ...S.limits, dppm: { good: 500, watch: 499 } } }), 'policy.scorecard.limits.dppm.watch: expected a number >= good (500), got 499'],
  ];
  for (const [p, msg] of cases) {
    assert.equal(errOf(() => validatePolicy(p)), msg);
    assert.equal(scErr(p), msg, 'same text as scorecard()');
  }
  const w = { ...S.weights }; const k = Object.keys(w)[0]; w[k] -= 1;
  assert.match(errOf(() => validatePolicy(pol({}, { weights: w }))), /^policy\.scorecard\.weights: sum is 99/);
});

test('validatePolicy: boundaries accepted exactly at each edge', () => {
  const W = REF.qualification.weights;
  for (const d of [-0.01, 0.01]) assert.equal(errOf(() => validatePolicy(pol({ weights: { ...W, 9: 10 + d } }))), null, `sum ${100 + d}`);
  assert.match(errOf(() => validatePolicy(pol({ weights: { ...W, 9: 10.02 } }))), /^policy\.qualification\.weights: sum/);
  assert.equal(errOf(() => validatePolicy(pol({ approve: 100 }))), null, 'approve 100');
  assert.equal(errOf(() => validatePolicy(pol({ conditional: 0 }))), null, 'conditional 0');
  assert.equal(errOf(() => validatePolicy(pol({ conditional: 84.99 }))), null, 'conditional just under approve');
  // approve 0 can never pass: conditional must be >= 0 and < approve. The engine names conditional.
  assert.match(errOf(() => validatePolicy(pol({ approve: 0, conditional: 0 }))), /^policy\.qualification\.conditional: /);
  // Approve lowered below the current conditional errors on conditional, not approve.
  assert.match(errOf(() => validatePolicy(pol({ approve: 60 }))), /^policy\.qualification\.conditional: .*got 70$/);
  const S = REF.scorecard;
  assert.equal(errOf(() => validatePolicy(pol({}, { tiers: { A: 90, B: 75, C: 55 } }))), null, '90/75/55');
  assert.equal(errOf(() => validatePolicy(pol({}, { limits: { ...S.limits, otd: { good: 95, watch: 95 } } }))), null, 'equal limits');
  assert.equal(errOf(() => validatePolicy(pol({}, { limits: { ...S.limits, dppm: { good: 500, watch: 500 } } }))), null, 'equal limits');
  assert.equal(errOf(() => validatePolicy(pol({ knockouts_off: knockoutList().map((k) => k.id) }))), null, 'all knockouts off');
});

test('validatePolicy: qualification half is checked before the scorecard half', () => {
  const both = pol({ approve: 101 }, { tiers: { A: 90, B: 95, C: 55 } });
  assert.match(errOf(() => validatePolicy(both)), /^policy\.qualification\.approve: /);
  assert.match(errOf(() => validatePolicy(pol({}, { tiers: 'x' }))), /^policy\.scorecard\.tiers: /);
  assert.equal(errOf(() => validatePolicy(null)), 'policy: expected an object');
});

test('validatePolicy: an extra qualification.ratings is ignored and evaluate output is unchanged', () => {
  const withR = pol({ ratings: { 1: 5, 2: 5, 3: 3, 4: 5, 5: 3, 6: 3, 7: 3, 8: 2, 9: 3 } });
  assert.equal(validatePolicy(withR), undefined);
  for (const c of ['cold_plate', 'pcba']) {
    const x = perfectExtraction(RUBRIC, c);
    assert.deepEqual(evaluate(x, { as_of: AS_OF, policy: withR }), evaluate(x, { as_of: AS_OF, policy: REF }));
  }
});

// ---- 2. ratings (decision 109, UIS-FR-02, UIS-AC-01) ----

test('ratingsOf: the reference starts at clamp(round(weight/3),1,5): 15->5, 10->3, 8->3, 7->2', () => {
  assert.deepEqual(ratingsOf(REF), { 1: 5, 2: 5, 3: 3, 4: 5, 5: 3, 6: 3, 7: 3, 8: 2, 9: 3 });
});

test('ratingsOf: clamp and rounding edges (0->1, 18->5, 7.5->3, 7.49->2, 1.5->1, 1.49->1)', () => {
  const w = { 1: 0, 2: 18, 3: 7.5, 4: 7.49, 5: 1.5, 6: 1.49, 7: 21.5, 8: 21.51, 9: 21.01 };
  assert.deepEqual(ratingsOf(pol({ weights: w })), { 1: 1, 2: 5, 3: 3, 4: 2, 5: 1, 6: 1, 7: 5, 8: 5, 9: 5 });
  assert.deepEqual(ratingsOf(pol({ weights: { ...REF.qualification.weights, 1: 4.5, 2: 4.49 } }))[1], 2);
  assert.equal(ratingsOf(pol({ weights: { ...REF.qualification.weights, 2: 4.49 } }))[2], 1);
});

test('shownWeights: the reference shows its exact points (15.0 ... 10.0)', () => {
  const s = shownWeights(REF);
  assert.equal(s.exact, true);
  assert.deepEqual(Object.values(s.weights).map((x) => x.toFixed(1)), ['15.0', '15.0', '10.0', '15.0', '10.0', '10.0', '8.0', '7.0', '10.0']);
});

test('setRating: Reliability tests (4) 5 -> 3 converts all nine to ratings; weights sum to 100 and cat 4 drops (UIS-AC-01)', () => {
  const p = setRating(REF, 4, 3);
  assert.deepEqual(p.qualification.ratings, { 1: 5, 2: 5, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 2, 9: 3 });
  const w = p.qualification.weights;
  assert.ok(Math.abs(sum(w) - 100) < 1e-9);
  assert.ok(w[4] < REF.qualification.weights[4]);
  assert.deepEqual(Object.values(w).map((x) => x.toFixed(1)), ['16.7', '16.7', '10.0', '10.0', '10.0', '10.0', '10.0', '6.7', '10.0']);
  assert.equal(shownWeights(p).exact, false);
  assert.equal(validatePolicy(p), undefined);
  assert.equal(REF.qualification.weights[4], 15, 'reference not mutated');
  assert.equal(REF.qualification.ratings, undefined);
});

test('setRating: back to the start value stays in ratings mode (never back to exact)', () => {
  const p = setRating(setRating(REF, 4, 3), 4, 5);
  assert.equal(shownWeights(p).exact, false);
  assert.equal(p.qualification.weights[1], 5 / 32 * 100);
  assert.notEqual(p.qualification.weights[1], 15);
});

test('setRating: all equal ratings are 100/9 each; all 1s and all 5s alike', () => {
  for (const r of [1, 3, 5]) {
    let p = REF;
    for (let n = 1; n <= 9; n++) p = setRating(p, n, r);
    for (const v of Object.values(p.qualification.weights)) assert.equal(v, 100 / 9);
    assert.ok(Math.abs(sum(p.qualification.weights) - 100) < 1e-9);
  }
  assert.throws(() => setRating(REF, 4, 2.5), /^Error: ratings\.4: expected an integer 1-5/);
});

test('ratings: stored ratings that match weights are kept; mismatched ones are dropped (weights win)', () => {
  const p = setRating(REF, 4, 3);
  assert.deepEqual(ratingsOf(p), p.qualification.ratings);
  assert.equal(normalizeRatings(p), p, 'same object when consistent');
  const bad = { ...p, qualification: { ...p.qualification, ratings: { ...p.qualification.ratings, 4: 5 } } };
  assert.equal(shownWeights(bad).exact, true);
  const n = normalizeRatings(bad);
  assert.equal('ratings' in n.qualification, false);
  assert.deepEqual(n.qualification.weights, p.qualification.weights);
  assert.equal(normalizeRatings(REF), REF);
  // Within 0.01 per category counts as matching (0.009 here: 0.01 itself is float-noisy); beyond it does not.
  const near = { ...p, qualification: { ...p.qualification, weights: { ...p.qualification.weights, 1: p.qualification.weights[1] + 0.009, 2: p.qualification.weights[2] - 0.009 } } };
  assert.equal(shownWeights(near).exact, false);
  const far = { ...p, qualification: { ...p.qualification, weights: { ...p.qualification.weights, 1: p.qualification.weights[1] + 0.011, 2: p.qualification.weights[2] - 0.011 } } };
  assert.equal(shownWeights(far).exact, true);
});

test('render: ratings 5,5,3,5,3,3,3,2,3 show "Total 100.0" from unrounded weights (cells round to 100.1)', () => {
  const p = setRating(REF, 4, 5);  // the reference start ratings, now as ratings
  const cells = Object.values(p.qualification.weights).map((x) => Number(x.toFixed(1)));
  assert.equal(Math.round(sum(cells) * 10) / 10, 100.1);
  const html = renderStandards(null, { standards: { draft: p, resolved: { policy: p, kind: 'draft' } } });
  assert.match(html, /Total <span class="mono">100\.0<\/span>/);
});

test('issue 46: every Standards table has a name (caption, aria-label or aria-labelledby), the monitoring table included', () => {
  const html = renderStandards(null, { standards: { draft: REF, resolved: { policy: REF, kind: 'draft' } } });
  assert.match(html, /<table class="std-table" aria-label="Monitoring weights and limits">/);
  const tables = html.match(/<table\b[^>]*>(?:<caption)?/g);
  assert.ok(tables.length >= 1);
  for (const t of tables) assert.match(t, /aria-label(?:ledby)?="|<caption/, t);
});

// ---- number fields and errors (UIS-FR-03..05, decision 114) ----

test('setField/parseNumber: plain decimals become numbers, anything else stays the typed string; never coerced to 0', () => {
  assert.equal(parseNumber('85.'), 85);
  assert.equal(parseNumber(' 90 '), 90);
  assert.equal(parseNumber('-1'), -1);
  assert.equal(parseNumber('.5'), 0.5);
  for (const s of ['', ' ', 'abc', '1e2', '0x10', '1,5', 'NaN', 'Infinity']) assert.equal(parseNumber(s), s, JSON.stringify(s));
  const p = setField(REF, 'qualification.approve', '');
  assert.equal(p.qualification.approve, '');
  assert.equal(REF.qualification.approve, 85, 'immutable');
  assert.deepEqual(checkPolicy(p), { path: 'policy.qualification.approve', message: 'policy.qualification.approve: expected a number 0-100, got ""' });
  assert.equal(setField(REF, 'scorecard.tiers.B', '75').scorecard.tiers.B, 75);
  assert.equal(setField(REF, 'scorecard.limits.otd.watch', '80').scorecard.limits.otd.watch, 80);
  assert.equal(setField(REF, 'qualification.weights.1', '50'), REF, 'unknown path: unchanged');
  assert.equal(setField(REF, 'id', 'x'), REF);
  assert.equal(setField(REF, 'name', 'Team').name, 'Team');
});

test('toggleKnockout: unchecking adds the id to knockouts_off, checking removes it; no duplicates', () => {
  const off = toggleKnockout(REF, '5.lot_trace', false);
  assert.deepEqual(off.qualification.knockouts_off, ['5.lot_trace']);
  assert.deepEqual(toggleKnockout(off, '5.lot_trace', false).qualification.knockouts_off, ['5.lot_trace']);
  assert.deepEqual(toggleKnockout(off, '5.lot_trace', true).qualification.knockouts_off, []);
  assert.deepEqual(REF.qualification.knockouts_off, []);
});

test('checkPolicy: null when valid, else the engine message and its field path', () => {
  assert.equal(checkPolicy(REF), null);
  assert.deepEqual(checkPolicy(pol({}, { tiers: { A: 90, B: 95, C: 55 } })),
    { path: 'policy.scorecard.tiers.B', message: 'policy.scorecard.tiers.B: expected a number < A (90), got 95' });
});

test('livePolicy: an empty or blank name scores as Untitled; a named draft is passed through', () => {
  assert.equal(livePolicy({ ...REF, name: '' }).name, 'Untitled');
  assert.equal(livePolicy({ ...REF, name: '   ' }).name, 'Untitled');
  const named = { ...REF, name: 'Team' };
  assert.equal(livePolicy(named), named);
});

test('fieldError: the longest matching input or block for an engine path', () => {
  const f = (path) => fieldError({ path });
  assert.equal(f('policy.scorecard.tiers.B'), 'scorecard.tiers.B');
  assert.equal(f('policy.scorecard.tiers'), 'scorecard.tiers');
  assert.equal(f('policy.qualification.weights'), 'qualification.weights');
  assert.equal(f('policy.qualification.weights.3'), 'qualification.weights');
  assert.equal(f('policy.qualification.conditional'), 'qualification.conditional');
  assert.equal(f('policy.qualification.knockouts_off'), 'qualification.knockouts_off');
  assert.equal(f('policy.scorecard.weights'), 'scorecard.weights');
  assert.equal(f('policy.scorecard.weights.otd'), 'scorecard.weights.otd');
  assert.equal(f('policy.scorecard.limits.otd.watch'), 'scorecard.limits.otd.watch');
  assert.equal(f('policy.scorecard.limits.otd'), 'scorecard.limits');
  for (const p of ['policy.id', 'policy.version', 'policy.name']) assert.equal(f(p), 'name');
  assert.equal(f('policy'), null);
  assert.equal(f('policy.qualification'), null);
  assert.equal(f('ratings.4'), null);
  assert.equal(fieldError(null), null);
});

// ---- 3. knockout list (UIS-FR-03, QUAL-NFR-05) ----

test('knockoutList: equals the engine knockout set, derived here from RUBRIC independently', () => {
  const expected = new Set(RUBRIC.criteria.filter((c) => c.knockout === true).map((c) => c.id));
  if (RUBRIC.test_criterion.knockout === true) for (const p of RUBRIC.commodities) for (const id of p.required) expected.add(id);
  const ids = knockoutList().map((k) => k.id);
  assert.equal(ids.length, new Set(ids).size, 'no duplicates');
  assert.deepEqual(new Set(ids), expected);
  for (const id of ids) assert.equal(checkPolicy(pol({ knockouts_off: [id] })), null, id);
  // Every other criterion or test id is refused by the engine, so the list also covers everything the engine accepts.
  const others = [...RUBRIC.criteria, ...RUBRIC.tests].map((c) => c.id).filter((id) => !expected.has(id));
  assert.ok(others.includes('1.capa'));
  for (const id of others) assert.match(checkPolicy(pol({ knockouts_off: [id] }))?.message ?? '', /is not a knockout criterion id/, id);
});

test('knockoutList: names from the rubric; only 5.lot_trace carries the High-risk note', () => {
  const list = knockoutList();
  const lot = list.find((k) => k.id === '5.lot_trace');
  assert.equal(lot.note, '(High-risk commodities only)');
  assert.deepEqual(list.filter((k) => k.note).map((k) => k.id), ['5.lot_trace']);
  for (const k of list) assert.ok(k.name && k.name !== k.id, `${k.id} has a name`);
});

// ---- 4. share token (decision 107) ----

test('encode/decode: round trip deep-equal with a non-ASCII name and ratings; token is p1. + base64url, no padding', () => {
  const p = { ...setRating(custom({ name: 'Équipe 冷却 ✓ — "quotes" & <tags>' }), 4, 3), version: 3 };
  const token = encodePolicy(p);
  assert.match(token, /^p1\.[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodePolicy(token), { ok: true, policy: p });
  // The router keeps it on every view.
  for (const v of ['today', 'qualify', 'compare', 'monitor', 'standards', 'eval']) {
    const h = formatHash({ view: v, role: 'junior', policy: token });
    assert.equal(parseHash(h).params.policy, token, v);
  }
});

test('decodePolicy: refuses wrong prefix, bad base64, non-UTF-8, bad JSON and an invalid policy; never throws', () => {
  const good = encodePolicy(REF);
  assert.match(decodePolicy('p2.' + good.slice(3)).error, /^policy: expected a token starting p1\./);
  assert.match(decodePolicy(good.slice(3)).error, /^policy: expected a token starting p1\./);
  assert.equal(decodePolicy('p1.!!!!').ok, false);
  assert.match(decodePolicy('p1.!!!!').error, /base64url/);
  assert.match(decodePolicy('p1.a').error, /base64url/, 'length 1 mod 4 is not base64');
  assert.match(decodePolicy('p1.' + b64url([0xff, 0xfe, 0x41])).error, /base64url/, 'non-UTF-8 bytes');
  assert.match(decodePolicy(tokenOf('not json')).error, /not valid JSON/);
  const bad = decodePolicy(tokenOf(JSON.stringify(pol({ weights: { ...REF.qualification.weights, 1: 14 } }))));
  assert.deepEqual(bad, { ok: false, error: 'policy.qualification.weights: sum is 99, expected 100 (±0.01)' });
  assert.match(decodePolicy(tokenOf('null')).error, /^policy: expected an object/);
  for (const t of [undefined, null, 42, {}, [], '', 'p1.', 'p1', 'p1.garbage', 'p1.' + 'A'.repeat(9000), tokenOf('[]'), tokenOf('"x"')]) {
    let r; assert.doesNotThrow(() => { r = decodePolicy(t); }, String(t));
    assert.equal(r.ok, false, String(t).slice(0, 20));
    assert.equal(typeof r.error, 'string');
  }
});

test('decodePolicy: inconsistent ratings in a token are dropped (weights win)', () => {
  const p = setRating(custom(), 4, 3);
  const forged = { ...p, qualification: { ...p.qualification, ratings: { ...p.qualification.ratings, 1: 1 } } };
  const r = decodePolicy(encodePolicy(forged));
  assert.equal(r.ok, true);
  assert.equal('ratings' in r.policy.qualification, false);
  assert.deepEqual(r.policy.qualification.weights, p.qualification.weights);
});

test('route: a policy token is accepted up to 8000 characters and dropped above', () => {
  const t = (n) => 'p1.' + 'A'.repeat(n - 3);
  assert.equal(parseHash(`#view=today&policy=${t(8000)}`).params.policy, t(8000));
  assert.equal(parseHash(`#view=today&policy=${t(8001)}`).params.policy, undefined);
  assert.equal(parseHash('#view=today&policy=p1.a+b').params.policy, undefined);
});

// ---- 5. store (decision 106, 112) ----

const memStorage = (initial) => {
  const m = new Map(initial === undefined ? [] : [[POLICIES_KEY, JSON.stringify(initial)]]);
  return safeStorage({ localStorage: { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) } });
};

test('loadStore: null, garbage, wrong schema and blocked storage read as an empty store', () => {
  const empty = { active: null, policies: [] };
  assert.deepEqual(loadStore(memStorage()), empty);
  for (const raw of [null, 'x', 42, [], {}, { schema: 'sqc-policies/2', active: null, policies: [] }, { schema: STORE_SCHEMA, policies: 'x' }]) {
    assert.deepEqual(loadStore(memStorage(raw)), empty, JSON.stringify(raw));
  }
  // A valid policy under another schema version is not read either.
  assert.deepEqual(loadStore(memStorage({ schema: 'sqc-policies/2', active: 'policy-1', policies: [custom()] })), empty);
  assert.deepEqual(loadStore(memStorage({ active: 'policy-1', policies: [custom()] })), empty, 'no schema');
  const corrupt = safeStorage({ localStorage: { getItem: () => '{not json', setItem() {} } });
  assert.deepEqual(loadStore(corrupt), empty);
  const blocked = safeStorage({ get localStorage() { throw new Error('SecurityError'); } });
  assert.equal(blocked.ok, false);
  assert.deepEqual(loadStore(blocked), empty);
  assert.deepEqual(loadStore(undefined), empty);
});

test('writeStore: false for blocked storage and for a set that fails (quota/private window); true and schema when written', () => {
  const s = { active: 'policy-1', policies: [custom()] };
  assert.equal(writeStore(safeStorage({ get localStorage() { throw new Error('x'); } }), s), false);
  assert.equal(writeStore({ ok: false, get: () => null, set: () => true }, s), false);
  const quota = safeStorage({ localStorage: { getItem: () => null, setItem() { throw new Error('QuotaExceededError'); } } });
  assert.equal(quota.ok, true);
  assert.equal(writeStore(quota, s), false);
  const mem = memStorage();
  assert.equal(writeStore(mem, s), true);
  assert.deepEqual(mem.get(POLICIES_KEY), { schema: STORE_SCHEMA, ...s });
  assert.deepEqual(loadStore(mem), s);
});

test('loadStore: invalid, reserved and repeated policies are dropped; an unknown active reads as the reference', () => {
  const ok = custom();
  const invalid = custom({ id: 'policy-2', qualification: { ...REF.qualification, approve: 101 } });
  const raw = { schema: STORE_SCHEMA, active: 'policy-2', policies: [ok, invalid, { ...REF }, { ...ok, name: 'dup' }, null, 'x'] };
  const st = loadStore(memStorage(raw));
  assert.deepEqual(st, { active: null, policies: [ok] });
  assert.equal(activePolicy(st), null);
  assert.equal(resolvePolicy({ saved: activePolicy(st) }).kind, 'reference');
  assert.equal(loadStore(memStorage({ ...raw, active: 'policy-1' })).active, 'policy-1');
});

test('save: first save v1 with a new id, same id again v2, asNew a fresh id at v1 (UIS-AC-02, decision 112)', () => {
  const draft = { ...setRating(REF, 4, 3), name: 'Cold-plate team' };
  const a = saveToList([], draft);
  assert.equal(a.policy.id, 'policy-1');
  assert.equal(a.policy.version, 1);
  assert.equal(a.policy.name, 'Cold-plate team');
  assert.notEqual(a.policy.id, RESERVED_ID);
  const b = saveToList(a.list, a.policy);
  assert.equal(b.policy.id, 'policy-1');
  assert.equal(b.policy.version, 2);
  assert.equal(b.list.length, 1);
  const c = saveToList(b.list, { ...b.policy, name: 'Renamed' });
  assert.deepEqual([c.policy.id, c.policy.version, c.policy.name], ['policy-1', 3, 'Renamed']);
  const d = saveToList(c.list, c.policy, { asNew: true });
  assert.deepEqual([d.policy.id, d.policy.version, d.list.length], ['policy-2', 1, 2]);
  assert.deepEqual(c.list.map((p) => p.version), [3], 'input list not mutated');
  assert.equal(nextVersion(d.list, 'policy-1'), 4);
  assert.equal(nextVersion(d.list, 'nope'), 1);
});

test('newId: one more than the highest policy-<n>; other ids ignored', () => {
  assert.equal(newId([]), 'policy-1');
  assert.equal(newId([{ id: 'policy-1' }, { id: 'policy-7' }, { id: 'team' }, { id: 'policy-x' }, { id: 'policy-3' }]), 'policy-8');
  assert.equal(newId([{ id: 'xpolicy-9' }, { id: 'policy-9b' }]), 'policy-1');
});

test('remove: the deleted active policy reads back as the reference', () => {
  const mem = memStorage();
  const one = saveToList([], custom()).policy;
  writeStore(mem, { active: one.id, policies: [one] });
  const list = removeFromList(loadStore(mem).policies, one.id);
  assert.deepEqual(list, []);
  writeStore(mem, { active: one.id, policies: list });
  const st = loadStore(mem);
  assert.equal(st.active, null);
  assert.deepEqual(resolvePolicy({ saved: activePolicy(st) }), { policy: REF, kind: 'reference' });
  assert.deepEqual(removeFromList([one], 'other'), [one]);
});

// ---- 6. import / export (UIS-FR-08, UIS-AC-04, decision 115) ----

test('export -> delete -> import is deep-equal, ratings kept (UIS-AC-04)', () => {
  const saved = { ...setRating(custom(), 4, 3), version: 2 };
  const file = exportPolicy(saved);
  assert.equal(file.filename, 'policy-policy-1-v2.json');
  assert.equal(file.text, JSON.stringify(saved, null, 2));
  const r = importPolicy(file.text, removeFromList([saved], saved.id));
  assert.equal(r.ok, true);
  assert.deepEqual(r.policy, saved);
  assert.deepEqual(r.list, [saved]);
  assert.equal(exportPolicy({ ...saved, id: 'a/b c' }).filename, 'policy-a_b_c-v2.json');
});

test('import: weights summing to 99, non-JSON and the reserved id are refused naming the field; list untouched', () => {
  const list = [custom()];
  const w99 = importPolicy(JSON.stringify(custom({ id: 'x', qualification: { ...REF.qualification, weights: { ...REF.qualification.weights, 1: 14 } } })), list);
  assert.equal(w99.ok, false);
  assert.match(w99.error, /^policy\.qualification\.weights: /);
  assert.equal('list' in w99, false);
  assert.deepEqual(importPolicy('{nope', list), { ok: false, error: "The file isn't valid JSON" });
  assert.deepEqual(importPolicy('', list), { ok: false, error: "The file isn't valid JSON" });
  assert.deepEqual(importPolicy(JSON.stringify(REF), list),
    { ok: false, error: "policy.id: 'stark-reference' is the built-in Stark Reference v1 and can't be replaced" });
  assert.match(importPolicy(JSON.stringify(custom({ knockouts_off: ['9.nope'] , qualification: { ...REF.qualification, knockouts_off: ['9.nope'] } })), list).error, /^policy\.qualification\.knockouts_off: /);
  assert.deepEqual(list, [custom()]);
});

test('import: an id clash gets a new id and keeps the version; inconsistent ratings are dropped', () => {
  const saved = custom({ version: 4 });
  const r = importPolicy(JSON.stringify(saved), [saved]);
  assert.equal(r.ok, true);
  assert.deepEqual([r.policy.id, r.policy.version], ['policy-2', 4]);
  assert.equal(r.list.length, 2);
  const p = setRating(custom({ id: 'team' }), 4, 3);
  const forged = { ...p, qualification: { ...p.qualification, ratings: { ...p.qualification.ratings, 1: 1 } } };
  const f = importPolicy(JSON.stringify(forged), []);
  assert.equal(f.ok, true);
  assert.equal('ratings' in f.policy.qualification, false);
  assert.equal(f.policy.id, 'team');
});

// ---- 7. impact (UIS-FR-10, decision 116) ----

const PCBA = perfectExtraction(RUBRIC, 'pcba');
const missing = (ids) => PCBA.criteria.map((c) => (ids.includes(c.id) ? { ...c, state: 'missing', value: null, citation: null } : c));
const ext = (id, criteria = PCBA.criteria) => ({ ok: true, path: `data/extracted/${id}.json`, value: { ...PCBA, criteria, supplier_id: id } });
const sup = (id) => ({ id, name: `Name ${id}`, commodity: 'pcba', part: 'pcba' });
const HEAD = 'date,supplier_id,part_no,received_qty,rejected_qty,on_time,defect_found_at,failure_mode_code,scar_id,scar_opened,scar_closed';
const CSV = [HEAD,
  '2026-10-06,ACT-01,P1,1000,0,1,none,,,,',        // 100.0 A
  '2026-10-06,ACT-02,P1,1000,1,1,incoming,FM-A,,,',  // 85.0 A under Stark, B under 90/75/55 (SCORE-AC-09)
  '2026-01-06,ACT-06,P1,1000,0,1,none,,,,',         // Unrated
].join('\n');
const data = (history) => ({
  suppliers: { ok: true, path: 'data/suppliers.json', value: { as_of: AS_OF,
    candidates: ['SUP-01', 'SUP-03', 'SUP-04', 'SUP-06'].map(sup), active: ['ACT-01', 'ACT-02', 'ACT-06'].map(sup) } },
  history: history ?? { ok: true, path: 'data/history.csv', value: parseHistory(CSV) },
  extractions: {
    'SUP-01': ext('SUP-01', missing(['7.pcn_notice'])),     // 96.0, APPROVED, junior
    'SUP-03': ext('SUP-03', missing(['1.cert_current'])),   // knockout missing
    'SUP-04': { ok: false, error: { path: 'data/extracted/SUP-04.json', message: 'HTTP 404', kind: 'fetch' } },
    'SUP-06': { ok: true, path: 'data/extracted/SUP-06.json', value: { ...PCBA, commodity: 'bogus', supplier_id: 'SUP-06' } },
  },
  sheets: {}, manual: { records: [], error: null },
});
const BASE = buildModel(data(), REF);
const at = (q = {}, s = {}) => buildModel(data(), { ...pol(q, s), id: 'x', name: 'X' });

test('impact: the same policy reads none and the panel says exactly "No changes."', () => {
  const d = impact(BASE, BASE);
  assert.deepEqual(d, { candidates: [], suppliers: [], counts: { candidates: 0, suppliers: 0 }, none: true });
  const html = renderStandards(BASE, { standards: { refModel: BASE } });
  assert.match(html, /<p>No changes\.<\/p>/);
  assert.doesNotMatch(html, /candidate change/);
});

test('impact: approve exactly at a 96.0 total changes nothing; one step above flips APPROVED -> CONDITIONAL and junior -> senior', () => {
  assert.equal(BASE.candidates.find((c) => c.id === 'SUP-01').evaluation.total, 96);
  assert.equal(impact(BASE, at({ approve: 96 })).none, true);
  const d = impact(BASE, at({ approve: 96.1 }));
  assert.deepEqual(d.candidates, [{ id: 'SUP-01', name: 'Name SUP-01', from: { decision: 'APPROVED', routing: 'junior' },
    to: { decision: 'CONDITIONAL', routing: 'senior' }, decisionChanged: true, routingChanged: true }]);
  assert.deepEqual(d.counts, { candidates: 1, suppliers: 0 });
  const html = renderStandards(at({ approve: 96.1 }), { role: 'senior', params: {}, standards: { refModel: BASE } });
  assert.match(html, /1 candidate change, 0 grade changes/);
  assert.match(html, /Routing <span class="mono">junior → senior<\/span>/);
  assert.match(html, /href="#view=qualify[^"]*supplier=SUP-01/);
});

test('impact: switching off the missing knockout changes that candidate only; unscored candidates never listed', () => {
  const before = BASE.candidates.find((c) => c.id === 'SUP-03').evaluation;
  const cur = at({ knockouts_off: ['1.cert_current'] });
  const after = cur.candidates.find((c) => c.id === 'SUP-03').evaluation;
  assert.notEqual(before.decision, after.decision, 'fixture: the knockout decides SUP-03');
  const d = impact(BASE, cur);
  assert.deepEqual(d.candidates.map((c) => c.id), ['SUP-03']);
  assert.deepEqual(d.candidates[0].from.decision, before.decision);
  assert.deepEqual(d.candidates[0].to.decision, after.decision);
  for (const m of [BASE, cur]) assert.deepEqual(m.candidates.filter((c) => c.status !== 'scored').map((c) => c.id), ['SUP-04', 'SUP-06']);
  // Scored on one side only: not listed.
  const half = { ...cur, candidates: cur.candidates.map((c) => (c.id === 'SUP-03' ? { ...c, status: 'engine-error', evaluation: null } : c)) };
  assert.deepEqual(impact(BASE, half).candidates, []);
  assert.deepEqual(impact(half, BASE).candidates, []);
});

test('impact: a routing-only change is listed with decisionChanged false (hand-built engine output)', () => {
  const cur = { ...BASE, candidates: BASE.candidates.map((c) => (c.id === 'SUP-01'
    ? { ...c, evaluation: { ...c.evaluation, routing: { ...c.evaluation.routing, to: 'senior' } } } : c)) };
  const d = impact(BASE, cur);
  assert.deepEqual(d.candidates, [{ id: 'SUP-01', name: 'Name SUP-01', from: { decision: 'APPROVED', routing: 'junior' },
    to: { decision: 'APPROVED', routing: 'senior' }, decisionChanged: false, routingChanged: true }]);
  const html = renderStandards(cur, { standards: { refModel: BASE, resolved: { policy: custom(), kind: 'saved' } } });
  assert.match(html, /Routing <span class="mono">junior → senior<\/span>/);
  assert.doesNotMatch(html, /APPROVED<\/span> →/, 'no decision line when only routing changed');
});

test('impact: tiers 90/75/55 move ACT-02 A -> B (UIS-AC-05, SCORE-AC-09); Unrated stays out', () => {
  const d = impact(BASE, at({}, { tiers: { A: 90, B: 75, C: 55 } }));
  assert.deepEqual(d.suppliers, [{ id: 'ACT-02', name: 'Name ACT-02', from: 'A', to: 'B' }]);
  assert.deepEqual(d.counts, { candidates: 0, suppliers: 1 });
  // Edge: A at exactly 85 keeps the 85.0 composite at A (lower bounds inclusive).
  assert.equal(impact(BASE, at({}, { tiers: { A: 85, B: 75, C: 55 } })).none, true);
  assert.equal(impact(BASE, at({}, { tiers: { A: 85.1, B: 75, C: 55 } })).suppliers.length, 1);
});

test('impact: a null tier shows Unrated; a failed scorecard gives suppliers null, none false and the panel says so', () => {
  const withTier = (m, tier) => ({ ...m, monitor: { ...m.monitor, value: { ...m.monitor.value,
    suppliers: m.monitor.value.suppliers.map((s) => (s.supplier_id === 'ACT-01' ? { ...s, current: { ...s.current, tier } } : s)) } } });
  const cur = withTier(BASE, null);
  assert.deepEqual(impact(BASE, cur).suppliers, [{ id: 'ACT-01', name: 'Name ACT-01', from: 'A', to: null }]);
  assert.deepEqual(impact(cur, BASE).suppliers, [{ id: 'ACT-01', name: 'Name ACT-01', from: null, to: 'A' }]);
  const html = renderStandards(cur, { standards: { refModel: BASE, resolved: { policy: custom(), kind: 'saved' } } });
  assert.match(html, /ACT-01<\/span>[^<]*<\/span><span class="card-meta mono">A → Unrated/);
  const noHist = buildModel(data({ ok: false, error: { path: 'data/history.csv', message: 'HTTP 500', kind: 'fetch' } }), REF);
  const d = impact(noHist, noHist);
  assert.equal(d.suppliers, null);
  assert.equal(d.counts.suppliers, null);
  assert.equal(d.none, false);
  const h2 = renderStandards(noHist, { standards: { refModel: noHist } });
  assert.match(h2, /0 candidate changes/);
  assert.match(h2, /Grades couldn't be compared/);
  assert.doesNotMatch(h2, /No changes\./);
});

test('impact panel: no model reads "Loading data…"; a failed suppliers file shows its error', () => {
  assert.match(renderStandards(null, {}), /Loading data…/);
  const supFail = buildModel({ ...data(), suppliers: { ok: false, error: { path: 'data/suppliers.json', message: 'HTTP 404', kind: 'fetch' } } }, REF);
  const html = renderStandards(supFail, {});
  assert.match(html, /data\/suppliers\.json/);
  assert.match(html, /HTTP 404/);
});

// ---- 8. precedence draft > shared > saved > reference (decision 108) ----

test('resolvePolicy: draft beats shared beats saved beats reference; chip tone and notes', () => {
  const saved = custom({ name: 'Saved' }), shared = custom({ id: 'policy-9', name: 'Shared' }), draft = { ...REF, name: '' };
  assert.equal(resolvePolicy({ draft, shared, saved }).kind, 'draft');
  assert.equal(resolvePolicy({ draft, shared, saved }).policy, draft);
  assert.equal(resolvePolicy({ shared, saved }).kind, 'shared');
  assert.equal(resolvePolicy({ saved }).kind, 'saved');
  assert.equal(resolvePolicy({}).kind, 'reference');
  assert.deepEqual(chipView({ policy: { ...REF }, kind: 'draft' }), { label: 'Policy: Stark Reference v1', tone: 'amber', note: 'Unsaved changes' });
  assert.equal(chipView({ policy: shared, kind: 'shared' }).note, 'Shared, not saved');
  assert.equal(chipView({ policy: REF, kind: 'saved' }).tone, 'amber');
  assert.equal(chipView({ policy: custom(), kind: 'reference' }).tone, 'amber');
  assert.equal(chipView({ policy: REF, kind: 'reference' }).tone, 'cyan');
});

test('a refused token never replaces the active policy: decode fails, so shared stays null and saved wins', () => {
  const saved = custom();
  for (const t of ['p1.garbage', 'p2.' + encodePolicy(REF).slice(3), tokenOf('{"id":1}')]) {
    const r = decodePolicy(t);
    assert.equal(r.ok, false);
    assert.deepEqual(resolvePolicy({ shared: r.ok ? r.policy : null, saved }), { policy: saved, kind: 'saved' });
  }
});

// ---- 10. render (UIS-FR-01, -03, -05, -09) ----

test('render: reference row is read-only with no Delete; exactly one checked radio; one checkbox per knockout', () => {
  const html = view.render(BASE, { standards: { refModel: BASE } });
  assert.match(html, /<p class="eyebrow">05 \/ STANDARDS<\/p><h2>Standards<\/h2>/);
  assert.equal(view.meta.issue.join(), '110');
  assert.equal((html.match(/aria-checked="true"/g) ?? []).length, 1);
  // The tag is inside the reference row's own radio button, not the <option> or the editor note (review round 1).
  const refRow = html.match(/<button type="button" role="radio"[^>]*data-key="ref"[^>]*>[\s\S]*?<\/button>/)[0];
  assert.match(refRow, /aria-checked="true" tabindex="0">/);
  assert.match(refRow, /Stark Reference v1 <span class="badge muted">read-only<\/span><\/button>$/);
  // Roving tabindex: with several rows, exactly the checked radio is a tab stop.
  const two = [custom(), custom({ id: 'policy-2', name: 'Second' })];
  const many = view.render(BASE, { standards: { store: { active: 'policy-2', policies: two }, refModel: BASE } });
  const radios = many.match(/<button type="button" role="radio"[^>]*>/g);
  assert.equal(radios.length, 3);
  assert.equal(radios.filter((r) => /tabindex="0"/.test(r)).length, 1);
  assert.equal(radios.filter((r) => /tabindex="-1"/.test(r)).length, 2);
  assert.match(radios.find((r) => /tabindex="0"/.test(r)), /data-key="saved:policy-2" aria-checked="true"/);
  assert.doesNotMatch(html, /data-act="delete"/);
  assert.equal((html.match(/type="checkbox"/g) ?? []).length, knockoutList().length);
  assert.equal((html.match(/type="checkbox"[^>]* checked/g) ?? []).length, knockoutList().length, 'all on by default');
  assert.equal((html.match(/type="range" min="1" max="5" step="1"/g) ?? []).length, 9);
  assert.match(html, /\(High-risk commodities only\)/);
  assert.doesNotMatch(html, /Requirement sheets arrive in issue 110/);  // issue 110 replaced the stub with the sheet list
});

test('decodePolicy: a link carrying the Stark Reference id is refused, as Import refuses it (decision 115)', () => {
  const r = decodePolicy(encodePolicy(REF));
  assert.deepEqual(r, { ok: false, error: "policy.id: 'stark-reference' is the built-in Stark Reference v1 and can't be replaced" });
  assert.equal(decodePolicy(encodePolicy({ ...REF, name: 'Edited' })).ok, false, 'any policy with the reserved id');
  assert.equal(decodePolicy(encodePolicy({ ...REF, id: 'policy-1' })).ok, true);
});

test('render: a saved active policy has Delete; confirm state is an inline group with Delete and Cancel', () => {
  const saved = custom({ version: 2 });
  const st = { store: { active: saved.id, policies: [saved] }, refModel: BASE };
  const html = renderStandards(BASE, { standards: st });
  assert.match(html, /data-key="saved:policy-1" aria-checked="true"/);
  assert.match(html, /Cold-plate team v2/);
  assert.match(html, /data-act="delete" data-key="saved:policy-1"/);
  const c = renderStandards(BASE, { standards: { ...st, ui: { confirm: 'saved:policy-1' } } });
  assert.match(c, /role="group" aria-label="Confirm delete"><span>Delete Cold-plate team v2\?<\/span>/);
  assert.match(c, /data-act="confirm-delete"/);
  assert.match(c, /data-act="cancel"/);
  assert.doesNotMatch(c, /confirm\(|alert\(/);
});

test('render: a shared policy is checked, tagged "Shared, not saved" and offers Save to this browser; a refused link shows the alert', () => {
  const shared = custom({ id: 'policy-9', name: 'From link' });
  const html = renderStandards(BASE, { standards: { shared, store: { active: null, policies: [] }, refModel: BASE } });
  assert.match(html, /data-key="shared" aria-checked="true"[^]*?Shared, not saved/);
  assert.match(html, /data-act="save-shared"/);
  const r = renderStandards(BASE, { standards: { sharedError: 'policy: the link is not valid base64url', refModel: BASE } });
  assert.match(r, /role="alert">This link's policy was refused: policy: the link is not valid base64url/);
});

test('render: an invalid field gets aria-invalid, aria-describedby and a plain sentence for the engine error in that element', () => {
  const draft = setField({ ...REF, name: 'T' }, 'qualification.conditional', '95');
  const error = checkPolicy(draft);
  const html = renderStandards(BASE, { standards: { draft, resolved: { policy: draft, kind: 'draft' }, refModel: BASE, ui: { error } } });
  const input = /<input[^>]*data-field="qualification.conditional"[^>]*>/.exec(html)[0];
  assert.match(input, /aria-invalid="true"/);
  const id = /aria-describedby="([^"]+)"/.exec(input)[1];
  // issue 162: the UI sentence, not the engine text (checkPolicy still returns the engine message).
  assert.match(html, new RegExp(`id="${id}" role="alert">Conditional pass mark must be a number from 0 up to, but below, the Approved pass mark\\.<`));
  assert.equal((html.match(/aria-invalid="true"/g) ?? []).length, 1, 'only the field in error');
  assert.match(html, /Unsaved changes/);
  assert.match(html, /data-act="discard"/);
});

test('render: Save is aria-disabled while unnamed but still a button; the reference editor name is blank', () => {
  const html = renderStandards(BASE, { standards: { refModel: BASE } });
  // issue 162: a visible hint names why, linked by aria-describedby.
  assert.match(html, /data-act="save" aria-disabled="true" aria-describedby="std-save-hint">Save<\/button><span class="quiet std-save-hint" id="std-save-hint">Name the policy to save it<\/span>/);
  assert.match(html, /data-field="name" value=""/);
  const named = renderStandards(BASE, { standards: { store: { active: 'policy-1', policies: [custom()] }, refModel: BASE } });
  assert.match(named, /data-act="save">Save</);
  assert.doesNotMatch(named, /std-save-hint/);
});

// ---- 8. requirement sheets (issue 110; UIS-FR-11, UIS-AC-06, NG2; decisions 130-136) ----

const REQ = new URL('../data/requirements/', import.meta.url);
const BUILT_IN = readdirSync(REQ).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(readFileSync(new URL(f, REQ), 'utf8')));
const sheetOk = (value) => ({ ok: true, path: `data/requirements/${value.commodity}.json`, value });
const sheetFail = (commodity, message = 'HTTP 404') => ({ ok: false, error: { path: `data/requirements/${commodity}.json`, message, kind: 'fetch' } });
const CP_SHEET = BUILT_IN.find((s) => s.commodity === 'cold_plate');
const PC_SHEET = BUILT_IN.find((s) => s.commodity === 'pcba');
// Inserted out of part order with a failed sheet in the middle: the list must sort and push the failure last.
const SHEETS_FIX = { pcba: sheetOk(PC_SHEET), quick_disconnect: sheetFail('quick_disconnect'), cold_plate: sheetOk(CP_SHEET) };
// A real buildModel output (impact() needs candidates) with the sheets swapped in.
const sheetModel = (sheets = SHEETS_FIX) => ({ ...BASE, sheets });
const downModel = (error) => buildModel({ suppliers: { ok: false, error }, history: { ok: true, path: 'data/history.csv', value: [] },
  extractions: {}, manual: { records: [], error: null } }, REF);
const ctxOf = (sheet, role = 'senior', policy) => ({ role, params: { ...(policy ? { policy } : {}), ...(sheet ? { sheet } : {}) } });
// The opened sheet's <section>, or null. renderSheet has no nested section.
const viewer = (html) => { const at = html.indexOf('<section class="panel std-sheet"'); return at < 0 ? null : html.slice(at, html.indexOf('</section>', at) + 10); };
const unamp = (s) => s.replaceAll('&amp;', '&');

test('sheetRows: sorted by part_no, a failed sheet last with part_no null and its error; [] for a null model or no sheets (UIS-FR-11)', () => {
  const rows = sheetRows(sheetModel());
  assert.deepEqual(rows.map((r) => [r.sheetKey, r.commodity, r.part_no, r.ok]),
    [['cold_plate', 'cold_plate', 'SI-CP-0007', true], ['pcba', 'pcba', 'SI-PC-0004', true], [undefined, 'quick_disconnect', null, false]]);
  assert.equal(rows[0].part_name, 'NPI liquid-cooling cold plate');
  assert.deepEqual(rows[2].error, SHEETS_FIX.quick_disconnect.error);
  // Failed rows keep insertion order after every loaded row, even when inserted first.
  const r2 = sheetRows(sheetModel({ z_fail: sheetFail('z'), a_fail: sheetFail('a'), pcba: sheetOk(PC_SHEET) }));
  assert.deepEqual(r2.map((r) => r.commodity), ['pcba', 'z_fail', 'a_fail']);
  assert.deepEqual(sheetRows(null), []);
  assert.deepEqual(sheetRows(undefined), []);
  assert.deepEqual(sheetRows({ suppliers: { ok: true } }), []);
  assert.deepEqual(sheetRows(sheetModel({})), []);
});

test('UIS-AC-06: every built-in sheet in data/requirements opens by part number and shows its header, CTQs and tests', () => {
  assert.equal(BUILT_IN.length, 8, 'eight shipped sheets');
  const all = Object.fromEntries(BUILT_IN.map((s) => [s.commodity, sheetOk(s)]));
  const model = sheetModel(all);
  assert.equal(sheetRows(model).length, 8);
  assert.deepEqual(sheetRows(model).map((r) => r.part_no), BUILT_IN.map((s) => s.part_no).sort());
  for (const s of BUILT_IN) {
    const html = renderStandards(model, ctxOf(s.part_no));
    const v = viewer(html);
    assert.ok(v, `${s.part_no} opens`);
    const facts = [...v.matchAll(/<dt>([^<]+)<\/dt><dd[^>]*>([^<]*)<\/dd>/g)].map((m) => [m[1], m[2]]);
    assert.deepEqual(facts, [['Part number', s.part_no], ['Name', esc(s.part_name)], ['Revision', s.revision], ['Drawing', s.drawing_no],
      ['Peak weekly demand', `${s.peak_weekly_demand} per week`], ['Need-by', `${s.need_by_weeks} weeks`]], `${s.part_no} header facts in order`);
    for (const want of [s.part_name, ...s.ctqs.map((c) => c.name), ...Object.values(s.tests).map((t) => t.name), ...Object.keys(s.tests)]) {
      assert.ok(v.includes(esc(want)), `${s.part_no}: ${want}`);
    }
    // Each limit is shown: every condition's limitText appears in the viewer.
    for (const t of Object.values(s.tests)) for (const c of t.conditions) assert.ok(v.includes(esc(limitText(c))), `${s.part_no}: ${limitText(c)}`);
    assert.ok(v.includes('Synthetic document for a demo.'), 'the sheet header line keeps the synthetic label');
    assert.match(v, /Limits are synthetic planning heuristics \(basis: heuristic\)\./);
    assert.doesNotMatch(v, /undefined|NaN|\[object/);
    assert.match(html, new RegExp(`<a class="std-sheet-link" href="[^"]*sheet=${s.part_no}" aria-current="page">`), 'open row marked current');
    assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1);
  }
});
const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

test('UIS-AC-06 / NG2: the open sheet has no edit control; the editor is replaced while the policies and impact panels stay', () => {
  const open = renderStandards(sheetModel(), ctxOf('SI-CP-0007'));
  const v = viewer(open);
  for (const bad of ['<input', '<select', '<textarea', '<button', 'contenteditable', 'data-act', 'data-field']) assert.ok(!v.includes(bad), `viewer has no ${bad}`);
  assert.match(v, /REQUIREMENT SHEET · VIEW-ONLY/);
  assert.ok(!open.includes('std-editor'), 'editor panel absent');
  assert.ok(!open.includes('data-field='), 'no editor inputs anywhere while a sheet is open');
  assert.ok(open.includes('std-impact'), 'impact panel stays (DESIGN-SPEC 4.7)');
  assert.ok(open.includes('std-policies') || open.includes('data-act="select"'), 'policies panel stays');
  const closed = renderStandards(sheetModel(), ctxOf(undefined));
  assert.ok(closed.includes('std-editor'));
  assert.match(closed, /data-field="name"/);
  assert.equal(viewer(closed), null);
  assert.doesNotMatch(closed, /aria-current="page"/, 'no sheet row current while the editor shows');
  // A draft stays in memory: rendering a sheet with a draft does not throw and the draft's editor returns when closed.
  const draft = setField({ ...REF, name: 'Kept draft' }, 'qualification.approve', '90');
  const st = { draft, resolved: { policy: draft, kind: 'draft' }, refModel: BASE };
  assert.ok(viewer(renderStandards(sheetModel(), { ...ctxOf('SI-CP-0007'), standards: st })));
  assert.match(renderStandards(sheetModel(), { ...ctxOf(undefined), standards: st }), /value="Kept draft"/);
});

test('limitText: digits as stored, tiny values in powers of ten (1 × 10⁻⁶), 0, ≤ ≥ = operators, Yes/No, lists, strings, unknown operator raw, unit rules', () => {
  const leak = CP_SHEET.tests['4.leak_test'].conditions[0];
  assert.equal(limitText(leak), '≤ 1 × 10⁻⁶ mbar·L/s', 'real cold-plate leak limit, not rounded and not 1e-6 (issue 162)');
  assert.equal(limitText({ operator: '>=', value: 3, unit: 'ratio' }), '≥ 3 ratio');
  assert.equal(limitText({ operator: '=', value: 6, unit: 'bar' }), '= 6 bar');
  assert.equal(limitText({ operator: '=', value: 0, unit: 'count' }), '= 0 count', 'zero is not dropped');
  assert.equal(limitText({ operator: '<=', value: 1.56, unit: 'µg' }), '≤ 1.56 µg');
  assert.equal(limitText({ operator: '=', value: 0.5 }), '= 0.5', 'no unit: no trailing space');
  assert.equal(limitText({ operator: '=', value: 6, unit: '' }), '= 6');
  assert.equal(limitText({ operator: '=', value: true, unit: 'boolean' }), '= Yes');
  assert.equal(limitText({ operator: '=', value: false, unit: 'boolean' }), '= No');
  assert.equal(limitText({ operator: '=', value: 'Class 2', unit: 'class' }), '= Class 2');
  assert.equal(limitText({ operator: '=', value: 'SI-MAT-AL-01', unit: 'designation' }), '= SI-MAT-AL-01');
  assert.equal(limitText({ operator: 'between', value: [25, 75], unit: 'µm' }), '25–75 µm', 'between is a range');
  assert.equal(limitText({ operator: '=', value: ['a', 'b'] }), '= a, b');
  assert.equal(limitText({ operator: '<=', unit: 'mm' }), '≤ –', 'missing value is an en dash, not undefined');
  assert.equal(limitText({ value: 5, unit: 'mm' }), '5 mm', 'no operator: no leading space');
});

test('sheetView: null without a sheet key, loading while model is null, open by the sheet\'s own part_no (not the commodity key), unknown otherwise', () => {
  assert.equal(sheetView(sheetModel(), undefined), null);
  assert.equal(sheetView(null, undefined), null);
  assert.deepEqual(sheetView(null, 'SI-CP-0007'), { kind: 'loading' });
  // Commodity key differs from the file: lookup is by value.part_no (decision 24).
  const odd = sheetModel({ renamed_key: sheetOk(CP_SHEET) });
  const v = sheetView(odd, 'SI-CP-0007');
  assert.equal(v.kind, 'open');
  assert.equal(v.sheet, CP_SHEET);
  // A commodity key shaped like a part number still does not match: only value.part_no does.
  assert.equal(sheetView(sheetModel({ 'SI-PC-0004': sheetOk(CP_SHEET) }), 'SI-PC-0004').kind, 'unknown', 'a commodity key is not a part number');
  const u = sheetView(sheetModel(), 'SI-XX-0099');
  assert.deepEqual(u, { kind: 'unknown', part: 'SI-XX-0099', failed: [SHEETS_FIX.quick_disconnect.error] });
  assert.deepEqual(sheetView(sheetModel({ cold_plate: sheetOk(CP_SHEET) }), 'SI-XX-0099').failed, []);
  // suppliers.json failed: sheets {} and the suppliers error explains the miss, first.
  const supErr = { path: 'data/suppliers.json', message: 'HTTP 500', kind: 'fetch' };
  assert.deepEqual(sheetView(downModel(supErr), 'SI-CP-0007'), { kind: 'unknown', part: 'SI-CP-0007', failed: [supErr] });
  assert.deepEqual(sheetView({ suppliers: { ok: false, error: supErr } }, 'SI-CP-0007').failed, [supErr], 'sheets undefined does not throw');
  // Duplicate part_no (dev worlds): the first wins in the viewer.
  const dupe = { ...CP_SHEET, part_name: 'Second copy' };
  assert.equal(sheetView(sheetModel({ a: sheetOk(CP_SHEET), b: sheetOk(dupe) }), 'SI-CP-0007').sheet.part_name, CP_SHEET.part_name);
});

test('render: unknown part says Not found with the editor link and each load error; loading never flashes Not found', () => {
  const html = renderStandards(sheetModel(), ctxOf('SI-XX-0099', 'junior', 'p1.abc'));
  const v = viewer(html);
  assert.match(v, /<h3 id="std-sheet-title">Not found<\/h3>/);
  assert.match(v, /No requirement sheet for <span class="mono">SI-XX-0099<\/span>\./);
  assert.match(unamp(v), /href="#view=standards&role=junior&policy=p1\.abc">← Policy editor</);
  assert.match(v, /role="alert"><p class="eyebrow">COULD NOT LOAD<\/p><p class="mono">data\/requirements\/quick_disconnect\.json<\/p><p>HTTP 404<\/p>/);
  assert.ok(!html.includes('std-editor'), 'the editor is not shown behind Not found (decision 131)');
  const clean = viewer(renderStandards(sheetModel({ cold_plate: sheetOk(CP_SHEET) }), ctxOf('SI-XX-0099')));
  assert.doesNotMatch(clean, /role="alert"/);
  const loading = renderStandards(null, ctxOf('SI-CP-0007'));
  assert.match(viewer(loading), /Loading data…/);
  assert.doesNotMatch(loading, /Not found/);
  assert.match(loading, /REQUIREMENT SHEETS<\/p><p class="quiet">Loading data…<\/p>/);
  const supErr = { path: 'data/suppliers.json', message: 'HTTP 500', kind: 'fetch' };
  const down = renderStandards(downModel(supErr), ctxOf('SI-CP-0007'));
  assert.match(down, /No requirement sheets loaded\./);
  assert.match(viewer(down), /Not found[^]*data\/suppliers\.json[^]*HTTP 500/);
});

test('render: the list is plain links with role and policy, a failed sheet is a non-link row, the narrow select marks the open part', () => {
  const html = renderStandards(sheetModel(), ctxOf('SI-PC-0004', 'junior', 'p1.abc'));
  const links = [...html.matchAll(/<a class="std-sheet-link" href="([^"]+)"([^>]*)>([^]*?)<\/a>/g)];
  assert.deepEqual(links.map((m) => unamp(m[1])), ['#view=standards&role=junior&policy=p1.abc&sheet=SI-CP-0007',
    '#view=standards&role=junior&policy=p1.abc&sheet=SI-PC-0004']);
  assert.deepEqual(links.map((m) => m[2]), ['', ' aria-current="page"']);
  assert.match(links[0][3], /^<span class="mono">SI-CP-0007<\/span> Cold plate$/);
  for (const m of links) assert.doesNotMatch(m[0], /data-act/, 'links need no JS');
  assert.match(html, /<li class="std-sheet-failed"><span class="mono">quick_disconnect<\/span> <span class="badge">Couldn't load<\/span><\/li>/);
  const sel = /<select id="std-sheet-select" data-act="select-sheet">([^]*?)<\/select>/.exec(html)[1];
  assert.deepEqual([...sel.matchAll(/<option value="([^"]*)"( selected)?>([^<]*)</g)].map((m) => [m[1], !!m[2], m[3]]),
    [['', false, 'Policy editor'], ['SI-CP-0007', false, 'SI-CP-0007 Cold plate'], ['SI-PC-0004', true, 'SI-PC-0004 Pcba']]);
  assert.match(html, /<label for="std-sheet-select">Requirement sheet<\/label>/);
  assert.match(renderStandards(sheetModel({}), ctxOf(undefined)), /REQUIREMENT SHEETS<\/p><p class="quiet">No requirement sheets loaded\.<\/p>/);
});

test('sheetHref and the Qualify / Compare sheet links land on an open sheet in the same model (UIS-FR-11, PRD-12 W6)', () => {
  const h = sheetHref({ role: 'junior', params: { policy: 'p1.abc' } }, 'SI-CP-0007');
  assert.equal(h, '#view=standards&role=junior&policy=p1.abc&sheet=SI-CP-0007');
  assert.equal(parseHash(h).params.sheet, 'SI-CP-0007');
  assert.equal(sheetHref({ role: 'junior', params: { policy: 'p1.abc' } }, undefined), '#view=standards&role=junior&policy=p1.abc');
  assert.equal(sheetHref({ role: 'senior', params: {} }, undefined), formatHash({ view: 'standards', role: 'senior' }));
  const CP = perfectExtraction(RUBRIC, 'cold_plate');
  const model = buildModel({
    suppliers: { ok: true, path: 'data/suppliers.json', value: { as_of: AS_OF, candidates: [{ id: 'SUP-07', name: 'Oscorp', commodity: 'cold_plate', part: 'x' }], active: [] } },
    history: { ok: true, path: 'data/history.csv', value: [] },
    extractions: { 'SUP-07': { ok: true, path: 'data/extracted/SUP-07.json', value: { ...CP, supplier_id: 'SUP-07' } } },
    sheets: Object.fromEntries(BUILT_IN.map((s) => [s.commodity, sheetOk(s)])), manual: { records: [], error: null },
  }, REF);
  const part = sheetPart(model, 'cold_plate');
  const q = detailModel(model.candidates[0], { part, role: 'junior', params: { policy: 'p1.abc' } }).sheetHref;
  const c = compareModel(model, { role: 'junior', policy: 'p1.abc' }).current.sheetHref;
  for (const link of [q, c]) {
    const r = parseHash(link);
    assert.equal(r.view, 'standards');
    assert.equal(r.role, 'junior');
    assert.equal(r.params.policy, 'p1.abc');
    const sv = sheetView(model, r.params.sheet);
    assert.equal(sv.kind, 'open');
    assert.equal(sv.sheet.part_no, 'SI-CP-0007');
  }
});

test('renderSheet: missing fields show an en dash, bad sections render empty, Optional / Setup / basis tags, values as stored', () => {
  const html = renderSheet({ commodity: 'x', part_no: 'SI-XX-0001', ctqs: 'nope', tests: [1] }, { role: 'senior', params: {} });
  assert.doesNotMatch(html, /undefined|null|NaN/);
  assert.equal((html.match(/<dd[^>]*>–<\/dd>/g) ?? []).length, 5, 'Name, Revision, Drawing, demand, need-by');
  assert.match(html, /No CTQs listed\./);
  assert.match(html, /No tests listed\./);
  assert.match(html, /\(basis: –\)/);
  // Arrays and objects holding junk entries are skipped, not dereferenced.
  const junk = renderSheet({ commodity: 'x', part_no: 'SI-XX-0002', ctqs: [null, 'x', 3], tests: { '4.a': null, '4.b': 'x',
    '4.c': { name: 'C', required: true, conditions: [null, 'y'] } } }, { role: 'senior', params: {} });
  assert.match(junk, /No CTQs listed\./);
  assert.match(junk, /<h4>C <span class="mono quiet">4\.c<\/span>[^]*No conditions listed\./);
  assert.doesNotMatch(junk, /4\.a|4\.b/);
  const s = { ...CP_SHEET, peak_weekly_demand: 0, need_by_weeks: 0,
    ctqs: [{ name: 'Flatness', nominal: 0, lsl: null, usl: 0.05, unit: 'mm', basis: 'heuristic' }, { name: 'Odd', nominal: 1, basis: 'measured' }],
    tests: { '4.extra': { name: 'Extra test', required: false, conditions: [{ measure: 'Soak', kind: 'setup', operator: '>=', value: 48, unit: 'h', basis: 'heuristic' },
      { measure: 'Drift', kind: 'acceptance', operator: '<=', value: 0.000001, unit: 'V', basis: 'vendor' }] },
    '4.empty': { name: 'Empty test', required: true } } };
  const v = renderSheet(s, { role: 'senior', params: {} });
  assert.match(v, /<dd class="mono">0 per week<\/dd>/, 'zero demand is not a dash');
  assert.match(v, /<dd class="mono">0 weeks<\/dd>/);
  assert.match(v, /<th scope="row">Flatness<\/th><td class="mono">0<\/td><td class="mono">–<\/td><td class="mono">0\.05<\/td><td>mm<\/td>/);
  assert.match(v, /<th scope="row">Odd <span class="badge muted">basis: measured<\/span><\/th><td class="mono">1<\/td><td class="mono">–<\/td><td class="mono">–<\/td><td>–<\/td>/);
  assert.match(v, /<h4>Extra test <span class="mono quiet">4\.extra<\/span> <span class="badge muted">Optional<\/span><\/h4>/);
  assert.match(v, /<h4>Empty test <span class="mono quiet">4\.empty<\/span> <span class="badge">Required<\/span><\/h4><p class="quiet">No conditions listed\.<\/p>/);
  assert.match(v, /<tr class="quiet"><th scope="row">Soak<\/th><td class="mono">≥ 48 h<\/td><td>Setup<\/td><\/tr>/);
  assert.match(v, /<tr><th scope="row">Drift <span class="badge muted">basis: vendor<\/span><\/th><td class="mono">≤ 1 × 10⁻⁶ V<\/td><td>Acceptance<\/td><\/tr>/);
  assert.ok(v.indexOf('Extra test') < v.indexOf('Empty test'), 'tests in file order');
  assert.doesNotMatch(v, /basis: heuristic<\/span>/, 'heuristic rows are not tagged');
  // Real cold plate: leak test Required, its setup rows quiet, acceptance rows not.
  const cp = renderSheet(CP_SHEET, { role: 'senior', params: {} });
  assert.match(cp, /<h4>Leak test <span class="mono quiet">4\.leak_test<\/span> <span class="badge">Required<\/span><\/h4>/);
  assert.match(cp, /<tr><th scope="row">Helium leak rate<\/th><td class="mono">≤ 1 × 10⁻⁶ mbar·L\/s<\/td><td>Acceptance<\/td>/);
  assert.match(cp, /<tr class="quiet"><th scope="row">Helium differential pressure<\/th><td class="mono">= 6 bar<\/td><td>Setup<\/td>/);
  assert.match(cp, /<dt>Part number<\/dt><dd class="mono">SI-CP-0007<\/dd>/);
  assert.match(cp, /<th scope="row">Base thickness<\/th><td class="mono">3<\/td><td class="mono">2\.9<\/td><td class="mono">3\.1<\/td><td>mm<\/td>/);
});

test('renderSheet / list: sheet strings are escaped', () => {
  const evil = { ...CP_SHEET, part_name: '<img onerror=x>', revision: '"><b>', header: '<script>x</script>',
    tests: { '4.t<': { name: '<i>t</i>', required: true, conditions: [{ measure: '<u>', kind: 'acceptance', operator: '<=', value: '<s>', unit: 'u' }] } } };
  const v = renderSheet(evil, { role: 'senior', params: {} });
  assert.ok(v.includes('&lt;img onerror=x&gt;'));
  for (const raw of ['<img', '<b>', '<script', '<i>', '<u>', '<s>', '4.t<']) assert.ok(!v.includes(raw), raw);
  const list = renderStandards(sheetModel({ cold_plate: sheetOk({ ...CP_SHEET, part_no: 'SI-CP-0007"><x' }) }), ctxOf(undefined));
  assert.ok(!list.includes('"><x'), 'part_no escaped in the list link and option');
});

test('UIS-FR-11: the shipped data/ load lists every built-in sheet in data/requirements and each opens (integration through loadData)', async () => {
  const root = new URL('../data/', import.meta.url);
  const data = await loadData({ fetchText: async (rel) => readFileSync(new URL(rel, root), 'utf8'), storage: null });
  const model = buildModel(data, REF);
  const listed = sheetRows(model).filter((r) => r.ok).map((r) => r.part_no);
  assert.deepEqual(listed, BUILT_IN.map((s) => s.part_no).sort(), 'every data/requirements/*.json sheet is listed');
  for (const s of BUILT_IN) assert.equal(sheetView(model, s.part_no)?.kind, 'open', `${s.part_no} opens by deep link`);
});

test('issue 140: phone policy options identify only the reference as read-only', () => {
  const html = renderStandards(BASE, { standards: { refModel: BASE, store: { policies: [custom()], active: 'policy-1' } } });
  const select = html.match(/<select id="std-select"[^>]*>([\s\S]*?)<\/select>/)[1];
  const options = [...select.matchAll(/<option value="([^"]+)"[^>]*>([^<]*)<\/option>/g)].map(m => [m[1], m[2]]);
  assert.ok(options.length > 1);
  assert.equal(options.find(([key]) => key === 'ref')[1], 'Stark Reference v1 (read-only)');
  assert.ok(options.filter(([key]) => key !== 'ref').every(([, label]) => !label.includes('read-only')));
});

test('issue 138: between limits use stored endpoints in the Standards viewer', () => {
  const sheet = JSON.parse(readFileSync(new URL('../data/requirements/sheet_metal.json', import.meta.url), 'utf8'));
  const cond = sheet.tests['4.coating_thickness'].conditions[0];
  assert.equal(limitText(cond), '60–100 µm');
  assert.equal(limitText({ operator: 'between', value: [0, 0.000001] }), '0–1 × 10⁻⁶');  // issue 162
  assert.equal(limitText({ operator: 'between', value: [60], unit: 'µm' }), 'between 60 µm');
  assert.equal(limitText({ operator: 'between', value: [60, 100, 120], unit: 'µm' }), 'between 60, 100, 120 µm');
  assert.equal(limitText({ operator: 'between', value: 'xy' }), 'between xy');
  assert.ok(renderSheet(sheet).includes('60–100 µm'));
});

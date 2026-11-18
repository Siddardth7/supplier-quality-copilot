// Problems list and All requirements view models, value formatting and citation parsing (#41; UIQ-FR-07, -08, -19;
// DESIGN-SPEC 5, 6, 7). Pure: real evaluate() output on edited perfect packets, plus hand-built evaluations.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STARK_REFERENCE, evaluate, findCriterion } from './engine.js';
import { esc } from './html.js';
import { RUBRIC } from './rubric.js';
import { perfectExtraction } from './rubric.testkit.js';
import { CITATION, CHIP, parseCitation, formatValue, chipKind, problemsModel, requirementsModel, renderProblems,
  renderRequirements, requirementName } from './criteria.js';

const AS_OF = '2026-11-01';
const set = (x, edits) => ({ ...x, criteria: x.criteria.map((c) => (c.id in edits ? { ...c, ...edits[c.id] } : c)) });
const CP = perfectExtraction(RUBRIC, 'cold_plate');
const ev = (x) => evaluate(x, { as_of: AS_OF });
const def = (id) => findCriterion(RUBRIC, id);
const CPK = def('2.ctq_cpk');
const GRR = def('3.grr');
const href = (p) => `#doc=${p.doc}&sec=${p.sec}`;

test('UIQ-FR-19 formatValue: Cpk 2 dp; "excellent" only for a verified raw value >= 1.67 (decision 35)', () => {
  const cases = [
    [1.67, 'verified', '1.67', 'excellent'], [2.5, 'verified', '2.50', 'excellent'], [1.66, 'verified', '1.66', null],
    [1.669, 'verified', '1.67', null], [1.33, 'verified', '1.33', null], [1, 'verified', '1.00', null],
    [1.8, 'assumed', '1.80', null], [0.9, 'assumed', '0.90', null],
  ];
  for (const [value, state, text, label] of cases) {
    assert.deepEqual(formatValue(CPK, { state, value }), { text, label, empty: false, sr: null }, `${state} ${value}`);
  }
  // Another number criterion with the same value gets no label.
  assert.equal(formatValue(GRR, { state: 'verified', value: 1.67 }).label, null);
});

test('formatValue: bool, date, enum, plain number, GR&R and junk never throw (decision 40)', () => {
  const bool = def('2.spc');
  assert.equal(bool.type, 'bool');
  assert.equal(formatValue(bool, { state: 'verified', value: true }).text, 'Yes');
  assert.equal(formatValue(bool, { state: 'verified', value: false }).text, 'No');
  assert.equal(formatValue(bool, { state: 'verified', value: 'maybe' }).text, 'maybe');
  assert.equal(formatValue(def('1.cert_current'), { state: 'verified', value: '2026-01-31' }).text, '2026-01-31');
  const en = def('9.region_risk');
  assert.equal(en.type, 'enum');
  assert.equal(formatValue(en, { state: 'verified', value: 'medium' }).text, 'Medium');
  assert.equal(formatValue(def('9.financial_health'), { state: 'verified', value: 'healthy' }).text, 'Healthy');
  const num = RUBRIC.criteria.find((c) => c.type === 'number' && !['2.ctq_cpk', '3.grr'].includes(c.id));
  assert.equal(formatValue(num, { state: 'verified', value: 0.5 }).text, '0.5', 'no invented format');
  assert.equal(formatValue(GRR, { state: 'verified', value: 10 }).text, '10.0%');
  assert.equal(formatValue(GRR, { state: 'verified', value: 24 }).text, '24.0%');
  assert.equal(formatValue(GRR, { state: 'verified', value: 30 }).text, '30.0%');
  assert.equal(formatValue(null, { state: 'verified', value: 1.23456 }).text, '1.23456', 'unknown id: String');
  for (const value of [NaN, 'abc', {}, [1], Infinity]) {
    assert.doesNotThrow(() => formatValue(CPK, { state: 'verified', value }));
    assert.equal(formatValue(CPK, { state: 'verified', value }).text, String(value));
    assert.equal(formatValue(CPK, { state: 'verified', value }).label, null);
  }
});

test('formatValue: null or undefined value -> dash, empty, a reason per evidence state', () => {
  const srs = ['missing', 'assumed', 'verified'].map((state) => formatValue(CPK, { state, value: null }));
  assert.deepEqual(srs.map((v) => v.sr), ['Not found in the packet', 'Claimed, no value given', 'No value']);
  for (const v of srs) assert.deepEqual([v.text, v.empty, v.label], ['—', true, null]);
  assert.equal(formatValue(def('2.spc'), { state: 'missing' }).empty, true);
  assert.equal(formatValue(def('2.spc'), { state: 'verified', value: 0 }).text, '0', 'zero is a value, not null');
});

test('parseCitation: PRD-04 pattern only, full dotted section kept', () => {
  assert.deepEqual(parseCitation('capability_study.md §2'), { doc: 'capability_study.md', sec: '2' });
  assert.deepEqual(parseCitation('x.md §2.1.3'), { doc: 'x.md', sec: '2.1.3' });
  assert.deepEqual(parseCitation('cert_2024.md §10'), { doc: 'cert_2024.md', sec: '10' });
  for (const bad of ['', null, undefined, 7, 'Capability.md §2', 'a.md 2', 'a.md §', 'a.md §2 extra', 'a.md §2.', 'see a.md §2', 'a.txt §2']) {
    assert.equal(parseCitation(bad), null, String(bad));
  }
  // The same pattern PRD-04 states.
  const prd = readFileSync(new URL('../docs/product/PRD-04-agent.md', import.meta.url), 'utf8');
  assert.ok(prd.includes('^[a-z0-9_]+\\.md §[0-9]+(\\.[0-9]+)*$'), 'PRD-04 citation regex unchanged');
  assert.equal(CITATION.source, '^([a-z0-9_]+\\.md) §([0-9]+(?:\\.[0-9]+)*)$');
});

test('UIQ-FR-07 problemsModel: fail, assumed, missing, info; engine order inside; counts = engine lists', () => {
  const x = set(CP, { '1.cert_current': { value: '2020-01-01' }, '2.ctq_cpk': { value: 0.9 }, '1.cert_scope': { state: 'assumed', value: null, citation: null },
    '3.grr': { state: 'assumed', value: null, citation: null }, '2.spc': { state: 'missing', value: null, citation: null, note: 'Looked in quality_manual.md' } });
  const e = ev(x);
  const pm = problemsModel(e);
  assert.deepEqual(pm.groups.map((g) => g.kind), ['fail', 'assumed', 'missing', 'info']);
  for (const kind of ['fail', 'assumed', 'missing']) {
    assert.deepEqual(pm.groups.find((g) => g.kind === kind).rows.map((r) => r.id), e.gaps.filter((g) => g.type === kind).map((g) => g.id), kind);
  }
  assert.equal(pm.groups.slice(0, 3).reduce((s, g) => s + g.rows.length, 0), e.gaps.length);
  assert.deepEqual(pm.groups[3].rows.map((r) => [r.id, r.state]), e.nice_to_have.map((n) => [n.id, n.state]));
  assert.equal(pm.total, e.gaps.length);
  assert.equal(pm.empty, false);
  const spc = pm.groups[2].rows[0];
  assert.deepEqual([spc.id, spc.note, spc.citation, spc.value.sr], ['2.spc', 'Looked in quality_manual.md', null, 'Not found in the packet']);
  // A group with no rows is omitted.
  assert.deepEqual(problemsModel(ev(set(CP, { '2.spc': { value: false } }))).groups.map((g) => g.kind), ['fail', 'info']);
});

test('UIQ-FR-07: an assumed knockout with a failing claim stays Assumed with score 0', () => {
  const e = ev(set(CP, { '2.ctq_cpk': { state: 'assumed', value: 0.9 } }));
  const row = problemsModel(e).groups.find((g) => g.kind === 'assumed').rows.find((r) => r.id === '2.ctq_cpk');
  assert.deepEqual([row.kind, row.score, row.knockout, row.value.text, row.value.label], ['assumed', 0, true, '0.90', null]);
  assert.ok(!problemsModel(e).groups.some((g) => g.kind === 'fail'));
});

test('UIQ-FR-08 requirementsModel: every row, engine order, open only with a gap, toFixed display', () => {
  const e = ev(set(CP, { '2.ctq_cpk': { value: 1.0 }, '1.cert_scope': { state: 'assumed', value: null } }));
  const rm = requirementsModel(e);
  assert.equal(rm.categories.length, 9);
  e.categories.forEach((c, i) => {
    const m = rm.categories[i];
    assert.deepEqual(m.rows.map((r) => r.id), c.criteria.map((r) => r.id));
    assert.deepEqual(m.rows.map((r) => r.score), c.criteria.map((r) => r.score));
    assert.equal(m.open, c.criteria.some((r) => r.gap !== null), String(c.n));
    assert.equal(m.score, c.score.toFixed(1));
    assert.equal(m.weight, String(Number(c.weight.toFixed(1))));
  });
  assert.deepEqual(rm.categories.filter((c) => c.open).map((c) => c.n), [1, 2]);
  const cpk = rm.categories[1].rows.find((r) => r.id === '2.ctq_cpk');
  assert.deepEqual([cpk.score, cpk.kind, cpk.value.text], [1, 'partial', '1.00'], 'Cpk 1.00: score 1, Partial chip (issue 162)');
  assert.equal(rm.info, e.nice_to_have.length);
  assert.ok(requirementsModel(ev(CP)).categories.every((c) => !c.open && c.rows.every((r) => r.kind === 'verified')));
});

test('chipKind: verified gap at 0 is fail, at 1-2 partial; otherwise the evidence state; every chip has a glyph and a word', () => {
  assert.equal(chipKind({ state: 'verified', gap: 'fail', score: 0 }), 'fail');
  assert.equal(chipKind({ state: 'verified', gap: 'fail', score: 1 }), 'partial');
  assert.equal(chipKind({ state: 'verified', gap: 'fail', score: 2 }), 'partial');
  assert.equal(chipKind({ state: 'verified', gap: null, score: 3 }), 'verified');
  assert.equal(chipKind({ state: 'assumed', gap: 'assumed', score: 0 }), 'assumed');
  assert.equal(chipKind({ state: 'missing', gap: 'missing', score: 0 }), 'missing');
  assert.deepEqual(Object.keys(CHIP), ['fail', 'partial', 'assumed', 'missing', 'verified', 'info']);
  for (const [tone, glyph, word] of Object.values(CHIP)) assert.ok(tone && glyph && word);
});

test('hand-built evaluation: unknown id falls back to the id, no throw, no UI math', () => {
  const e = { gaps: [{ id: 'zz.unknown', type: 'fail', score: 2 }], nice_to_have: [{ id: 'zz.nice', state: 'assumed' }],
    categories: [{ n: 7, name: 'Hand', weight: 7.25, score: 1.234, criteria: [{ id: 'zz.unknown', knockout: false, state: 'verified',
      value: 5, citation: 'bad citation', note: null, score: 2, gap: 'fail' }] }] };
  const pm = problemsModel(e);
  assert.equal(pm.groups[0].rows[0].name, 'zz.unknown');
  assert.equal(pm.groups[0].rows[0].score, 2);
  assert.equal(requirementName('zz.unknown'), null);
  const rm = requirementsModel(e);
  assert.deepEqual([rm.categories[0].score, rm.categories[0].weight], ['1.2', '7.3']);
  const html = renderProblems(pm, href) + renderRequirements(rm, href);
  assert.match(html, /<span class="quiet">bad citation<\/span>/);
  assert.doesNotMatch(html, /<a /);
  assert.doesNotThrow(() => renderProblems(problemsModel({ gaps: [{ id: 'x', type: 'missing' }], nice_to_have: [], categories: [{ n: 1, name: 'a', weight: 1, score: 1 }] }), href));
});

test('QUAL-NFR-05: criteria.js names only the two core criteria it formats', () => {
  const src = readFileSync(new URL('./criteria.js', import.meta.url), 'utf8');
  assert.deepEqual([...new Set(src.match(/'\d\.[a-z_]+'/g))].sort(), ["'2.ctq_cpk'", "'3.grr'"]);
});

// #41 tester additions: rules the first pass left unpinned (mutation survivors).
const count = (s, needle) => s.split(needle).length - 1;
const rowsOf = (html) => [...html.matchAll(/<tr data-id="([^"]*)">([\s\S]*?)<\/tr>/g)].map(([, id, inner]) => ({ id, inner,
  cell: Object.fromEntries([...inner.matchAll(/<td data-label="([^"]*)"[^>]*>([\s\S]*?)<\/td>/g)].map((c) => [c[1], c[2]])) }));

test('UIQ-FR-08: a weight-0 category with a gap is still open (open follows gaps, not score vs weight)', () => {
  const policy = { ...STARK_REFERENCE, id: 'w0', name: 'W0', version: 1,
    qualification: { ...STARK_REFERENCE.qualification, weights: { 1: 15, 2: 15, 3: 10, 4: 15, 5: 10, 6: 12.5, 7: 8, 8: 14.5, 9: 0 } } };
  const e = evaluate(set(CP, { '9.second_source': { value: false } }), { as_of: AS_OF, policy });
  const c9 = e.categories.find((c) => c.n === 9);
  assert.deepEqual([c9.weight, c9.score, c9.criteria.some((r) => r.gap !== null)], [0, 0, true]);
  const m = requirementsModel(e).categories.find((c) => c.n === 9);
  assert.deepEqual([m.open, m.gapCount, m.weight], [true, 1, '0']);
  assert.match(renderRequirements(requirementsModel(e), href), /<details class="req-cat" data-cat="9" open><summary><span>9 [^<]*<\/span> <span class="mono">0\.0 \/ 0<\/span> <span class="quiet">1 problem<\/span>/);
});

test('UIQ-FR-07 info rows: test name from the rubric, "assumed" vs "not in packet" wording, ID, no invented cells', () => {
  const nice = ev(CP).nice_to_have;
  assert.ok(nice.length >= 2);
  const e = ev({ ...CP, criteria: [...CP.criteria, { id: nice[0].id, state: 'assumed', value: true, citation: null, note: null }] });
  assert.deepEqual(e.nice_to_have.map((n) => n.state), ['assumed', ...nice.slice(1).map(() => 'missing')]);
  const rows = rowsOf(renderProblems(problemsModel(e), href));
  assert.deepEqual(rows.map((r) => r.id), e.nice_to_have.map((n) => n.id));
  e.nice_to_have.forEach((n, i) => {
    const want = n.state === 'assumed' ? 'nice to have, assumed' : 'nice to have, not in packet';
    assert.equal(rows[i].cell.Requirement, `${def(n.id).name} <span class="mono">${n.id}</span><span class="quiet"> (${want})</span>`, n.id);
    assert.equal(rows[i].cell.State, '<span class="badge muted">i Info</span>');
  });
});

test('UIQ-FR-08 pointer line: singular and plural; none when no info; empty table sentence', () => {
  const cats = requirementsModel(ev(CP)).categories;
  assert.ok(renderRequirements({ categories: cats, info: 1 }, href).endsWith('<p class="quiet req-info">1 nice-to-have test is not verified; see Problems (Info).</p>'));
  assert.ok(renderRequirements({ categories: cats, info: 2 }, href).endsWith('<p class="quiet req-info">2 nice-to-have tests are not verified; see Problems (Info).</p>'));
  assert.doesNotMatch(renderRequirements({ categories: cats, info: 0 }, href), /req-info/);
  assert.equal(renderRequirements({ categories: [], info: 0 }, href), '<p class="quiet">No requirements.</p>');
  assert.equal(renderRequirements(requirementsModel({ gaps: [], nice_to_have: [] }), href), '<p class="quiet">No requirements.</p>');
});

test('knockout star only on knockout rows, in both tabs', () => {
  const e = ev(set(CP, { '1.cert_current': { value: '2020-01-01' }, '1.cert_scope': { state: 'assumed', value: null, citation: null } }));
  const ko = Object.fromEntries(e.categories.flatMap((c) => c.criteria).map((r) => [r.id, r.knockout]));
  assert.ok(Object.values(ko).includes(true) && Object.values(ko).includes(false));
  const rows = [...rowsOf(renderRequirements(requirementsModel(e), href)), ...rowsOf(renderProblems(problemsModel(e), href)).filter((r) => r.id in ko)];
  assert.ok(rows.some((r) => !ko[r.id]) && rows.some((r) => ko[r.id]));
  for (const r of rows) assert.equal(r.cell.Requirement.includes('ko-star'), ko[r.id], r.id);
});

test('formatValue enum: underscores become spaces, first letter capitalised', () => {
  assert.equal(formatValue(def('9.region_risk'), { state: 'verified', value: 'not_yet_rated' }).text, 'Not yet rated');
});

test('citation cell: null, undefined and "" show a dash + "No citation"; a non-string shows as escaped text', () => {
  const NO = '<span aria-hidden="true">—</span><span class="sr-only">No citation</span>';
  const mk = (citation) => ({ gaps: [], nice_to_have: [], categories: [{ n: 1, name: 'A', weight: 1, score: 1,
    criteria: [{ id: '2.spc', knockout: false, state: 'verified', value: true, citation, note: null, score: 3, gap: null }] }] });
  for (const c of [null, undefined, '']) assert.equal(rowsOf(renderRequirements(requirementsModel(mk(c)), href))[0].cell.Citation, NO, String(c));
  assert.equal(rowsOf(renderRequirements(requirementsModel(mk(7)), href))[0].cell.Citation, '<span class="quiet">7</span>');
  assert.equal(rowsOf(renderRequirements(requirementsModel(mk({ a: 1 })), href))[0].cell.Citation, '<span class="quiet">[object Object]</span>');
});

test('escaping: hand-built hostile id, category, state, score, value, note, citation and info id never reach the HTML raw', () => {
  const X = '"><i>x</i>&';
  const e = { gaps: [{ id: X, type: 'fail', score: 2 }], nice_to_have: [{ id: `${X}n`, state: 'assumed' }],
    categories: [{ n: X, name: X, weight: 1, score: 1, criteria: [
      { id: X, knockout: false, state: 'verified', value: X, citation: X, note: X, score: X, gap: 'fail' },
      { id: `${X}2`, knockout: false, state: X, value: X, citation: null, note: null, score: 3, gap: null }] }] };
  const html = renderProblems(problemsModel(e), href) + renderRequirements(requirementsModel(e), href);
  assert.doesNotMatch(html, /<i>/);
  for (const [, v] of html.matchAll(/=\s*"([^"]*)"/g)) assert.doesNotMatch(v, /[<>]/, v);
  const E = esc(X);
  assert.equal(count(html, `data-id="${E}"`), 2, 'Problems and All requirements row ids');
  assert.equal(count(html, `data-id="${E}n"`), 1, 'info row id');
  assert.ok(html.includes(`data-cat="${E}"`));
  assert.ok(html.includes(`<td data-label="ID" class="mono">${E}</td>`));
  assert.ok(html.includes(`<span class="mono">${E}</span>`), 'Problems mono id');
  assert.ok(html.includes(`<span class="badge muted">? ${E}</span>`), 'unknown state chip');
  assert.ok(html.includes(`<td data-label="Score" class="cell-num">${E}</td>`), 'All requirements score');
  assert.ok(html.includes(`<td data-label="Score" class="cell-num">${E} / 3</td>`), 'Problems score');
  assert.ok(html.includes(`${E}n <span class="mono">${E}n</span>`), 'info name and id');
});

// #41 review F3: the colour half of "text + color" is pinned too (DESIGN-SPEC 5), not only glyph and word.
test('DESIGN-SPEC 5: each state chip pairs its colour token with its glyph and word', async () => {
  const { CHIP } = await import('./criteria.js');
  assert.deepEqual(CHIP, { fail: ['bad', '✗', 'Fail'], partial: ['amber', '◐', 'Partial'], assumed: ['amber', '~', 'Assumed'], missing: ['bad', '?', 'Missing'],
    verified: ['ok', '✓', 'Verified'], info: ['muted', 'i', 'Info'] });
});

// #41 review F5: criteria.js reaches the engine only through the named lookup, never via another module or a name.
test('criteria.js imports only html.js and the engine lookup, and names no supplier', () => {
  const src = readFileSync(new URL('./criteria.js', import.meta.url), 'utf8');
  assert.deepEqual([...src.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]).sort(), ['./engine.js', './html.js']);
  assert.doesNotMatch(src, /Oscorp|Marvel|Frost|Hammer|Roxxon|Inc\.|LLC|Ltd/);
});

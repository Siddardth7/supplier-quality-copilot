// Eval view (issue 111; PRD-13 UIE-FR-01..08, UIE-AC-01..05; DESIGN-SPEC 4.8; decisions 137-144). Fixtures come from
// eval.testkit.js, which builds every run with the real agent/eval.mjs buildReport + renderJson.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderEval, evalState, runView } from './eval.js';
import { report, FIXTURE_ONE, FIXTURE_MANY, FIXTURE_INCOMPLETE, ok, failed } from './eval.testkit.js';
import { parseHash, formatHash } from './route.js';
import { esc } from './html.js';
import { render as viewRender } from './views/eval.js';

const clone = (x) => structuredClone(x);
const render = (fixture, params = {}, role = 'senior') => renderEval({ evalRuns: ok(fixture) }, { role, params });
// Visible text: tags and attribute values gone, entities decoded enough for matching.
const text = (html) => html.replace(/<[^>]*>/g, ' ').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const section = (html, id) => {
  const i = html.indexOf(`aria-labelledby="${id}"`);
  return i < 0 ? null : html.slice(i, html.indexOf('</section>', i));
};
const headline = (html) => section(html, 'eval-headline-title');
const worlds = (html) => section(html, 'eval-worlds-title');
const runs = (html) => section(html, 'eval-runs-title');
const misses = (html) => section(html, 'eval-misses-title');
const cells = (tr) => [...tr.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((m) => text(m[1]));
const rows = (html, attr) => [...html.matchAll(new RegExp(`<tr ${attr}[^>]*>[\\s\\S]*?</tr>`, 'g'))].map((m) => m[0]);
const stats = (html) => [...headline(html).matchAll(/<li class="stat">([\s\S]*?)<\/li>/g)].map((m) => ({
  label: /stat-label">([^<]*)/.exec(m[1])[1], value: /stat-value mono">([^<]*)/.exec(m[1])[1],
  counts: /stat-counts mono">([^<]*)/.exec(m[1])[1], target: text(/stat-target">([\s\S]*?)<\/span><\/span>/.exec(m[1])[1]),
  sr: /sr-only">([^<]*)/.exec(m[1])[1] }));
const hrefs = (html) => [...html.matchAll(/data-citation href="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
const unwrap = (html) => html.replace(/&amp;/g, '&');

// ---- UIE-AC-01: every number on screen is the file's number ----

test('UIE-AC-01: headline, per-world and miss numbers are the file fields, verbatim', () => {
  const r = FIXTURE_ONE.runs[0];
  const [g, demo, , hold] = r.groups;
  const html = render(FIXTURE_ONE);
  const s = stats(html);
  assert.deepEqual(s.map((x) => [x.label, x.value, x.counts]), [
    ['Caught', g.rates.catch, `${g.counts.catch} of ${g.counts.gap}`],
    ['False alarms', g.rates.false_alarm, `${g.counts.false_alarm} of ${g.counts.clean}`],
    ['Decisions agree', g.rates.decision, `${g.counts.agree} of ${g.counts.cand}`],
    ['Cited correctly', g.rates.citation, `${g.counts.cite_hit} of ${g.counts.cite_den}`],
  ]);
  const w = worlds(html);
  const k = (c) => [String(c.gap), String(c.catch), String(c.partial), String(c.miss)];
  assert.deepEqual(rows(w, 'data-group="headline"').map(cells), g.per_world.map((p) => [String(p.world), p.counts.gap + '',
    `${p.counts.catch} ${p.rates.catch}`, p.counts.partial + '', p.counts.miss + '', p.counts.false_alarm + '', `${p.counts.agree} of ${p.counts.cand}`]));
  assert.deepEqual(cells(rows(w, 'data-group="demo"')[0]), [`Demo world ${demo.worlds[0]}`, k(demo.counts)[0], `${demo.counts.catch} ${demo.rates.catch}`,
    k(demo.counts)[2], k(demo.counts)[3], String(demo.counts.false_alarm), `${demo.counts.agree} of ${demo.counts.cand}`]);
  assert.deepEqual(cells(rows(w, 'data-group="holdout"')[0]), ['Hold-out traps', String(hold.counts.gap), `${hold.counts.catch} ${hold.rates.catch}`,
    String(hold.counts.partial), String(hold.counts.miss), 'n/a', 'n/a']);
  // Miss list: every miss of every group, in group order, with the file's world, supplier, criterion and values.
  const all = r.groups.flatMap((x) => x.misses);
  const mr = rows(misses(html), 'data-id').map(cells);
  assert.equal(mr.length, all.length);
  assert.match(misses(html), new RegExp(`\\(run 1\\) · ${all.length}<`));
  mr.forEach((c, i) => {
    const m = all[i];
    assert.deepEqual(c.slice(1, 4), [String(m.world), m.supplier_id, m.criterion_id], `row ${i}`);
    assert.ok(c[5].startsWith(m.expected_state), `row ${i} expected`);
  });
  // Cpk 1.325 is never rounded; a boolean stays as written.
  assert.ok(mr.some((c) => c[5] === 'verified 1.325'));
  assert.ok(mr.some((c) => c[6] === 'verified true'));
  // No percentage that is not in the JSON text, except the typed PRD-04 targets.
  const allowed = new Set([...JSON.stringify(FIXTURE_ONE).matchAll(/"(\d+\.\d%)"/g)].map((m) => m[1]).concat(['90%', '5%']));
  for (const p of html.match(/\d+(\.\d)?%/g)) assert.ok(allowed.has(p), p);
});

test('UIE-AC-01: a hand-edited rate string is printed as written, never recomputed from the counts', () => {
  const f = clone(FIXTURE_ONE);
  f.runs[0].groups[0].rates.catch = '12.3%';  // counts say 4 of 20
  const s = stats(render(f));
  assert.equal(s[0].value, '12.3%');
  assert.equal(s[0].counts, '4 of 20');
});

// ---- UIE-AC-02: demo and hold-out rows apart, never in the pooled headline ----

test('UIE-AC-02: demo and hold-out sit in their own tbody rows; changing them leaves the headline unchanged', () => {
  const html = render(FIXTURE_ONE);
  const apart = /<tbody class="apart">([\s\S]*?)<\/tbody>/.exec(worlds(html))[1];
  assert.deepEqual([...apart.matchAll(/data-group="(\w+)"/g)].map((m) => m[1]), ['demo', 'holdout']);
  assert.equal(rows(worlds(html), 'data-group="headline"').length, 4);
  assert.doesNotMatch(headline(html), /Demo|Hold-out|\b93\b/);
  const f = clone(FIXTURE_ONE);
  Object.assign(f.runs[0].groups[1].counts, { gap: 99, catch: 77, miss: 11 });
  f.runs[0].groups[1].rates.catch = '77.7%';
  Object.assign(f.runs[0].groups[3].counts, { gap: 55, catch: 44 });
  const html2 = render(f);
  assert.equal(headline(html2), headline(html));
  assert.match(worlds(html2), /data-group="demo"><th scope="row">Demo world 93<\/th><td[^>]*>99<\/td><td[^>]*>77 <small class="mono">77\.7%/);
  assert.match(worlds(html2), /data-group="holdout"><th scope="row">Hold-out traps<\/th><td[^>]*>55<\/td><td[^>]*>44 /);
});

test('UIE-AC-02: no demo world and no hold-out read "not run" with no numbers', () => {
  const html = render({ runs: [report({ holdout: [] })] });
  const apart = /<tbody class="apart">([\s\S]*?)<\/tbody>/.exec(worlds(html))[1];
  assert.deepEqual(rows(apart, 'data-group').map(cells), [['Demo world', 'not run'], ['Hold-out traps', 'not run']]);
  assert.doesNotMatch(text(apart), /\d/);
});

// ---- UIE-AC-03: headline is the first complete Sonnet run; every run listed ----

const listItems = (html) => [...runs(html).matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => m[1]);

test('UIE-AC-03: many runs: the headline and per-world stay on run 1 whatever run= says; the list shows all three', () => {
  const base = render(FIXTURE_MANY);
  assert.match(headline(base), /FIRST COMPLETE RUN · claude-sonnet-5-5 · 2026-11-20 · skill abc1234</);
  assert.deepEqual(evalState(ok(FIXTURE_MANY)).headline, { index: 0, complete: true });
  assert.deepEqual(evalState(ok(FIXTURE_INCOMPLETE)).headline, { index: 1, complete: true });
  assert.deepEqual(evalState(ok({ runs: [FIXTURE_INCOMPLETE.runs[0]] })).headline, { index: 0, complete: false });
  assert.deepEqual(evalState(ok({ runs: [FIXTURE_MANY.runs[1]] })).headline, { index: null, complete: false });
  assert.equal(stats(base)[0].counts, '4 of 20');  // run 2 (Opus) has 12 of 28
  for (const run of [1, 2, 3]) {
    const html = render(FIXTURE_MANY, { run });
    assert.equal(headline(html), headline(base), `run=${run}`);
    assert.equal(worlds(html), worlds(base), `run=${run}`);
    const items = listItems(html);
    assert.equal(items.length, 3);
    assert.deepEqual(items.map((li) => /<a [^>]*>([^<]*)<\/a>/.exec(li)[1]), ['Run 1 · Sonnet', 'Run 2 · Opus comparison', 'Run 3 · Re-test']);
    assert.deepEqual(items.map((li) => li.includes('aria-current="true"')), [1, 2, 3].map((n) => n === run));
    assert.match(misses(html), new RegExp(`EVERY MISS, PARTIAL AND FALSE ALARM \\(run ${run}\\)`));
  }
  const items = listItems(base);
  assert.match(items[0], /badge ink">Headline/);
  assert.doesNotMatch(items[1] + items[2], /Headline/);
  assert.match(items[2], /2026-11-28b[\s\S]*def5678[\s\S]*105, 106, 107, 108/);
  // Re-test runs never scored 101-104: no "Incomplete" badge (decision 138).
  assert.doesNotMatch(items.join(''), /Incomplete/);
  // The miss list really switches: run 3's rows are re-test worlds.
  const m3 = rows(misses(render(FIXTURE_MANY, { run: 3 })), 'data-id').map(cells);
  assert.ok(m3.length > 0 && m3.every((c) => c[0] === 'Re-test' && Number(c[1]) >= 105));
  const m2 = misses(render(FIXTURE_MANY, { run: 2 }));
  assert.notEqual(m2, misses(base));
  assert.match(m2, /data-id="2\|101\|/);
});

test('UIE-AC-03: an incomplete first Sonnet run is listed "Incomplete"; the first COMPLETE one is the headline', () => {
  const html = render(FIXTURE_INCOMPLETE);
  assert.match(headline(html), /FIRST COMPLETE RUN · claude-sonnet-5-5 · 2026-11-20 · skill/);
  assert.equal(stats(html)[0].counts, '8 of 24');
  const items = listItems(html);
  assert.match(items[0], /Run 1 · Sonnet[\s\S]*badge muted">Incomplete/);
  assert.doesNotMatch(items[0], /Headline/);
  assert.match(items[0], /1 refused/);
  assert.match(items[1], /Headline/);
  assert.doesNotMatch(items[1], /Incomplete/);
  assert.match(misses(html), /\(run 2\)/, 'default miss list is the headline run');
});

test('UIE-AC-03 / PRD-04 §5: with only an incomplete Sonnet run, its counts show and nothing is judged', () => {
  const html = render({ runs: [FIXTURE_INCOMPLETE.runs[0]] });
  assert.match(headline(html), /FIRST SONNET RUN \(INCOMPLETE\) · claude-sonnet-5-5 · 2026-11-19/);
  assert.match(headline(html), /role="status">Incomplete: world\(s\) 103, 104 refused or absent\. Targets are not judged\./);
  assert.match(headline(html), /Refused: world 103 \(answer_key\.json does not match answer_key\.sha256\)/);
  assert.equal(stats(html)[0].counts, '2 of 10');
  assert.deepEqual(stats(html).slice(0, 2).map((x) => x.target), ['target ≥ 90% INCOMPLETE', 'target ≤ 5% INCOMPLETE']);
  assert.doesNotMatch(html, /PASS|FAIL/);
});

test('decision 138: a hand-edited incomplete run that says PASS is still shown INCOMPLETE', () => {
  const f = { runs: [clone(FIXTURE_INCOMPLETE.runs[0])] };
  f.runs[0].groups[0].targets = { catch_ge_90: 'PASS', false_alarm_le_5: 'FAIL' };
  const html = render(f);
  assert.doesNotMatch(html, /PASS|FAIL/);
  assert.equal((headline(html).match(/>INCOMPLETE</g) ?? []).length, 2);
});

test('decision 138: a Sonnet run that scored none of 101-104 is never the headline', () => {
  const retest = FIXTURE_MANY.runs[2];
  const opus = FIXTURE_MANY.runs[1];
  // Re-test first, then Opus: no Sonnet run on 101-104 at all.
  let html = render({ runs: [retest, opus] });
  assert.equal(headline(html), null);
  assert.equal(worlds(html), null);
  assert.match(html, /<p class="quiet">No Sonnet run on worlds 101-104 is published yet\.<\/p>/);
  assert.equal(listItems(html).length, 2);
  assert.match(misses(html), /\(run 1\)/, 'no headline: run 1 is the default');
  // Re-test first, then an incomplete Sonnet run on 101-102: the incomplete one is the headline.
  html = render({ runs: [retest, FIXTURE_INCOMPLETE.runs[0]] });
  assert.match(headline(html), /FIRST SONNET RUN \(INCOMPLETE\) · claude-sonnet-5-5 · 2026-11-19/);
  assert.match(listItems(html)[1], /Headline/);
  assert.match(misses(html), /\(run 2\)/);
});

test('E3: the headline is the FIRST complete Sonnet run, never a later or better one; Opus and mixed runs never head', () => {
  const later = report({ run_id: '2026-12-01a', catches: 9 });
  let html = render({ runs: [FIXTURE_MANY.runs[1], FIXTURE_ONE.runs[0], later] });
  assert.match(headline(html), /2026-11-20 /);
  assert.match(listItems(html)[1], /Headline/);
  const mixed = clone(FIXTURE_ONE.runs[0]);
  mixed.models = ['claude-sonnet-5-5', 'claude-opus-5-5'];
  html = render({ runs: [mixed, later] });
  assert.match(headline(html), /2026-12-01 /);
  assert.match(listItems(html)[0], /Run 1 · Opus comparison[\s\S]*claude-sonnet-5-5, claude-opus-5-5/);
});

// ---- Verdict words (UIE-FR-02, DESIGN-SPEC 7) ----

test('UIE-FR-02: PASS / FAIL / null map to the words PASS / FAIL / INCOMPLETE; no-target stats and null rates', () => {
  const at = (catchV, faV) => {
    const f = clone(FIXTURE_ONE);
    f.runs[0].groups[0].targets = { catch_ge_90: catchV, false_alarm_le_5: faV };
    return stats(render(f));
  };
  assert.deepEqual(at('PASS', 'FAIL').slice(0, 2).map((s) => s.target), ['target ≥ 90% PASS', 'target ≤ 5% FAIL']);
  assert.deepEqual(at('FAIL', 'PASS').slice(0, 2).map((s) => s.target), ['target ≥ 90% FAIL', 'target ≤ 5% PASS']);
  assert.deepEqual(at(null, null).slice(0, 2).map((s) => s.target), ['target ≥ 90% INCOMPLETE', 'target ≤ 5% INCOMPLETE']);
  assert.deepEqual(at('pass', undefined).slice(0, 2).map((s) => s.target), ['target ≥ 90% INCOMPLETE', 'target ≤ 5% INCOMPLETE']);
  const s = at('PASS', 'PASS');
  assert.deepEqual(s.slice(2).map((x) => x.target), ['no target', 'no target']);
  assert.equal(s[0].sr, 'Caught: 20.0%, 4 of 20, target ≥ 90%, PASS.');
  // Badge tones: the word always carries the meaning, colour only adds to it.
  const f = clone(FIXTURE_ONE);
  f.runs[0].groups[0].targets = { catch_ge_90: 'PASS', false_alarm_le_5: null };
  assert.match(headline(render(f)), /badge ok">PASS<[\s\S]*badge muted">INCOMPLETE</);
  assert.match(headline(render(FIXTURE_ONE)), /badge bad">FAIL</);
  // A zero denominator: "n/a" and "0 of 0", never 0%.
  const z = clone(FIXTURE_ONE);
  Object.assign(z.runs[0].groups[0].counts, { cite_hit: 0, cite_den: 0 });
  z.runs[0].groups[0].rates.citation = null;
  assert.deepEqual(stats(render(z))[3].value + ' | ' + stats(render(z))[3].counts, 'n/a | 0 of 0');
});

test('edge: a file that says 90.0% and FAIL shows FAIL (the view maps the word, never recomputes the target)', () => {
  const f = clone(FIXTURE_ONE);
  f.runs[0].groups[0].rates.catch = '90.0%';
  f.runs[0].groups[0].targets = { catch_ge_90: 'FAIL', false_alarm_le_5: 'PASS' };
  assert.equal(stats(render(f))[0].target, 'target ≥ 90% FAIL');
});

// ---- UIE-AC-04: every miss links to its packet in the viewer ----

test('UIE-AC-04: each miss link opens world + supplier + the answer key\'s file and section; role, policy and run carried', () => {
  const html = render(FIXTURE_ONE, { run: 1, policy: 'p1.a-b' }, 'junior');
  const all = FIXTURE_ONE.runs[0].groups.flatMap((g) => g.misses);
  const trs = rows(misses(html), 'data-id');
  assert.equal(trs.length, all.length);
  trs.forEach((tr, i) => {
    const m = all[i];
    const [href] = hrefs(tr);
    const r = parseHash(href);
    assert.equal(r.view, 'eval');
    assert.equal(r.role, 'junior');
    assert.equal(formatHash({ view: r.view, role: r.role, ...r.params }), href, 'canonical');
    const [doc, sec] = m.expected_citation ? m.expected_citation.split(' §') : [undefined, undefined];
    assert.deepEqual(r.params, { policy: 'p1.a-b', supplier: m.supplier_id, ...(doc ? { doc, sec } : {}), run: 1, world: m.world }, `row ${i}`);
    const linkText = text(/<a [^>]*data-citation[^>]*>([\s\S]*?)<\/a>/.exec(tr)[1]);
    assert.equal(linkText, m.expected_citation ? `${m.expected_citation} ↗` : 'Packet files ↗', `row ${i}`);
  });
  // The fixture exercises all three link kinds: a cited miss, a no-citation miss (file list) and a hold-out row.
  assert.ok(all.some((m) => m.expected_citation === null));
  const hold = trs.find((tr) => /data-label="Set">Hold-out/.test(tr));
  assert.equal(parseHash(hrefs(hold)[0]).params.doc, 'pcn_policy.md');
  // The link text is the answer key's citation, not the agent's (miss 3.grr: same file, but a partial row has no got_citation).
  const partial = trs.find((tr) => tr.includes('6.ramp_plan|partial'));
  assert.match(partial, />cover_letter\.md §1\.1 ↗</);
});

test('UIE-AC-04: re-test rows link the same way with their own world; the run in the link is the selected run', () => {
  const html = render(FIXTURE_MANY, { run: 3 });
  const hs = hrefs(misses(html));
  assert.ok(hs.length > 0);
  for (const h of hs) {
    const p = parseHash(h).params;
    assert.equal(p.run, 3);
    assert.ok(p.world >= 105 && p.world <= 108, h);
    assert.equal(p.supplier.startsWith('SUP-'), true);
    assert.equal(formatHash({ view: 'eval', role: 'senior', ...p }), h);
  }
  // Without run= the miss links carry the headline run's position.
  assert.ok(hrefs(misses(render(FIXTURE_MANY))).every((h) => parseHash(h).params.run === 1));
});

test('UIE-AC-04: a world or supplier the router would drop renders plain text, not a link', () => {
  for (const patch of [{ world: 0 }, { world: 'abc' }, { supplier_id: 'ACME' }, { supplier_id: '<b>' }, { world: undefined, supplier_id: undefined },
    { world: undefined }, { supplier_id: undefined }]) {
    const f = clone(FIXTURE_ONE);
    Object.assign(f.runs[0].groups[0].misses[0], patch);
    const tr = rows(misses(render(f)), 'data-id')[0];
    assert.doesNotMatch(tr, /<a /, JSON.stringify(patch));
    assert.match(tr, /<span class="quiet">cover_letter\.md §1\.1<\/span>/, JSON.stringify(patch));
  }
});

test('UIE-AC-04: an unparseable expected citation falls back to the packet file list', () => {
  for (const c of ['msa.md', 'MSA.md §1', '../x.md §1', 42, '']) {
    const f = clone(FIXTURE_ONE);
    f.runs[0].groups[0].misses[1].expected_citation = c;
    const tr = rows(misses(render(f)), 'data-id')[1];
    const p = parseHash(hrefs(tr)[0]).params;
    assert.equal(p.doc, undefined, String(c));
    assert.match(tr, />Packet files ↗</, String(c));
  }
  const f = clone(FIXTURE_ONE);
  delete f.runs[0].groups[0].misses[1].expected_citation;  // a file from before the additive field
  assert.match(rows(misses(render(f)), 'data-id')[1], />Packet files ↗</);
});

test('miss rows carry a stable data-id the viewer uses to return focus', () => {
  const ids = [...misses(render(FIXTURE_MANY, { run: 2 })).matchAll(/<tr data-id="([^"]*)"/g)].map((m) => m[1]);
  assert.equal(ids[0], '2|101|SUP-01|6.ramp_plan|partial');
  assert.equal(new Set(ids).size, ids.length, 'unique within a run');
});

// ---- UIE-AC-05 / UIE-FR-07: empty, loading and error states ----

const NO_RUN = 'No published run yet';
const visibleDigits = (html) => text(html).match(/\d/g);

test('UIE-AC-05: 404, a null Result, { runs: [] } and a model without evalRuns all read "No published run yet" with no digits', () => {
  assert.deepEqual(evalState(failed('HTTP 404')), { kind: 'none' });
  assert.deepEqual(evalState(null), { kind: 'none' });
  assert.deepEqual(evalState(ok({ runs: [] })), { kind: 'none' });
  for (const model of [{ evalRuns: failed('HTTP 404') }, { evalRuns: null }, { evalRuns: undefined }, {}, { evalRuns: ok({ runs: [] }) }]) {
    const html = renderEval(model, { role: 'senior', params: { run: 2 } });
    assert.match(html, new RegExp(`<p class="eval-empty">${NO_RUN}</p>`), JSON.stringify(model));
    assert.match(html, /href="\.\.\/docs\/EVAL\.md"/);
    assert.equal(visibleDigits(html), null, JSON.stringify(model));
    assert.doesNotMatch(html, /role="alert"|Loading|run 2/);
    assert.equal((text(html).match(/[^.]+\./g) ?? []).length >= 2, true, 'two sentences on the method');
  }
  // The full view, eyebrow aside, has no digit either.
  assert.equal(text(viewRender({}).replace('<p class="eyebrow">06 / EVAL</p>', '')).match(/\d/), null);
});

test('evalState(undefined) is loading (spec 3.2); renderEval maps a missing evalRuns to none; a null model is loading', () => {
  assert.deepEqual(evalState(undefined), { kind: 'loading' });
  assert.equal(renderEval(null), '<p class="quiet">Loading data…</p>');
  assert.equal(viewRender(null), '<p class="eyebrow">06 / EVAL</p><h2>Eval</h2><p class="quiet">Loading data…</p>');
  assert.doesNotMatch(renderEval(null), new RegExp(NO_RUN));
});

test('UIE-AC-05: HTTP 500, a network error and malformed files are an error panel naming data/eval.json, never the empty state', () => {
  const cases = [failed('HTTP 500'), failed('Failed to fetch'), failed('Unexpected token } in JSON', 'data'),
    ok({}), ok({ runs: {} }), ok({ runs: [{ ...FIXTURE_ONE.runs[0], groups: undefined }] }), ok({ runs: [{ ...FIXTURE_ONE.runs[0], groups: FIXTURE_ONE.runs[0].groups.slice(0, 3) }] })];
  for (const file of cases) {
    const s = evalState(file);
    assert.equal(s.kind, 'error', JSON.stringify(file).slice(0, 80));
    const html = renderEval({ evalRuns: file });
    assert.match(html, /role="alert"><p class="eyebrow">COULD NOT LOAD<\/p><p class="mono">data\/eval\.json<\/p>/);
    assert.doesNotMatch(html, new RegExp(NO_RUN));
    assert.doesNotMatch(html, /%|class="stat"|<table/);
    assert.match(html, /href="\.\.\/docs\/EVAL\.md"/);
  }
  assert.equal(evalState(ok({ runs: [{ ...FIXTURE_ONE.runs[0], groups: undefined }] })).error.message, 'runs[0].groups: expected an array of 4 groups');
  assert.equal(evalState(ok({ runs: [{ ...FIXTURE_ONE.runs[0], groups: undefined }] })).error.kind, 'data');
  assert.match(renderEval({ evalRuns: failed('HTTP 500') }), /Serve the repo root/);
  assert.doesNotMatch(renderEval({ evalRuns: ok({}) }), /Serve the repo root/);
  // A 404 that reached the parser (kind data) is an error, not "none": only a fetch 404 means no published run.
  assert.equal(evalState(failed('HTTP 404', 'data')).kind, 'error');
  // Only exactly "HTTP 404" (makeFetchText's form) is no published run (review N1).
  for (const m of ['HTTP 4040', 'HTTP 404 Not Found', 'xHTTP 404']) assert.equal(evalState(failed(m)).kind, 'error', m);
});

test('review M1: half-valid nested entries are the error panel with a field-naming message, never a throw or "undefined"', () => {
  const at = (fn) => { const f = clone(FIXTURE_ONE); fn(f.runs[0]); return ok(f); };
  const cases = [
    [at((r) => { r.groups[0].per_world[0] = {}; }), 'runs[0].groups[0].per_world[0].counts: expected an object'],
    [at((r) => { r.groups[0].per_world[0] = null; }), 'runs[0].groups[0].per_world[0]: expected an object'],
    [at((r) => { delete r.groups[1].per_world[0].rates; }), 'runs[0].groups[1].per_world[0].rates: expected an object'],
    [at((r) => { r.groups[0].misses[0] = null; }), 'runs[0].groups[0].misses[0]: expected an object'],
    [at((r) => { r.groups[3].misses[0] = 'miss'; }), 'runs[0].groups[3].misses[0]: expected an object'],
    [at((r) => { r.refused = [1]; }), 'runs[0].refused[0]: expected an object'],
  ];
  for (const [file, msg] of cases) {
    const s = evalState(file);
    assert.deepEqual([s.kind, s.error?.message, s.error?.kind], ['error', msg, 'data'], msg);
    let html;
    assert.doesNotThrow(() => { html = viewRender({ evalRuns: file }); }, msg);
    assert.match(html, /role="alert"><p class="eyebrow">COULD NOT LOAD<\/p><p class="mono">data\/eval\.json<\/p>/, msg);
    assert.ok(html.includes(esc(msg)), msg);
    assert.doesNotMatch(html, /undefined|<table|class="stat"|%/, msg);
  }
});

// ---- Escaping ----

test('review S2: an unknown model id is the run label and is escaped there too', () => {
  const evil = '<img src=x onerror=alert(1)>';
  const r = clone(FIXTURE_ONE.runs[0]);
  r.models = [evil];
  assert.equal(runView(r, 1).label, evil);
  const html = render({ runs: [r] });
  assert.doesNotMatch(html, /<img/);
  assert.match(runs(html), /aria-current="true">Run 1 · &lt;img src=x onerror=alert\(1\)&gt;<\/a>/);
  assert.equal(headline(html), null, 'not a Sonnet run: no headline');
});

test('escaping: run_id, refused reason, got_value, models and criterion text never become markup', () => {
  const evil = '<img src=x onerror=alert(1)>';
  const f = { runs: [report({ run_id: evil, worlds: [101, 102], refuse: { 103: evil } })] };
  const r = f.runs[0];
  r.models = [`claude-sonnet-5-5`, evil];
  r.groups[0].misses[0].got_value = evil;
  r.groups[0].misses[0].got_state = evil;
  r.groups[0].misses[1].criterion_id = evil;
  r.groups[0].incomplete = [evil];
  const html = render(f);
  assert.doesNotMatch(html, /<img/);
  assert.ok((html.match(/&lt;img src=x onerror=alert\(1\)&gt;/g) ?? []).length >= 6);
});

// ---- run fallback, headline-only, empty miss list, packet tags, clean_unassessed ----

test('run= out of range falls back to the headline run with a status note; in range has no note', () => {
  for (const [want, shown] of [[999, 1], [4, 1], [999999, 1]]) {
    const html = render(FIXTURE_MANY, { run: want });
    assert.match(html, new RegExp(`<p class="status-line" role="status">Run ${want} is not published; showing run ${shown}\\.</p>`));
    assert.match(misses(html), new RegExp(`\\(run ${shown}\\)`));
    assert.match(listItems(html)[shown - 1], /aria-current="true"/);
  }
  for (const want of [1, 3]) assert.doesNotMatch(render(FIXTURE_MANY, { run: want }), /is not published/);
  assert.doesNotMatch(render(FIXTURE_MANY), /is not published/);
  // The fallback is the headline run, not run 1, when they differ.
  assert.match(render(FIXTURE_INCOMPLETE, { run: 3 }), /Run 3 is not published; showing run 2\./);
  // No headline at all: run 1.
  assert.match(render({ runs: [FIXTURE_MANY.runs[1]] }, { run: 2 }), /Run 2 is not published; showing run 1\./);
});

test('a single Sonnet run (no Opus) renders every panel in DESIGN-SPEC 4.8 order and the footer', () => {
  const html = render(FIXTURE_ONE);
  const order = ['eval-headline-title', 'eval-worlds-title', 'eval-runs-title', 'eval-misses-title', 'eval-footer'].map((id) => html.indexOf(id));
  assert.ok(order.every((i, k) => i > 0 && (k === 0 || i > order[k - 1])), String(order));
  assert.match(runs(html), /RUNS \(1\)/);
  assert.match(html, /<a class="text-link" href="\.\.\/docs\/EVAL\.md">Full write-up: docs\/EVAL\.md ↗<\/a>/);
  assert.match(misses(html), /The written reason for each is in <a class="text-link" href="\.\.\/docs\/EVAL\.md">/);
  assert.ok(viewRender({ evalRuns: ok(FIXTURE_ONE) }).startsWith('<p class="eyebrow">06 / EVAL</p><h2>Eval</h2><div class="eval">'));
});

test('empty miss list, packet tags and the clean_unassessed line', () => {
  const f = clone(FIXTURE_ONE);
  for (const g of f.runs[0].groups) g.misses = [];
  const html = render(f);
  assert.match(misses(html), /<p class="quiet">No misses, partials or false alarms in this run\.<\/p>/);
  assert.doesNotMatch(misses(html), /<table/);
  assert.match(misses(html), /\(run 1\) · 0</);
  // invalid -> "packet invalid"; missing -> "no extraction file"; scored -> no tag.
  const g = clone(FIXTURE_ONE);
  g.runs[0].groups[0].misses[1].status = 'missing';
  const trs = rows(misses(render(g)), 'data-id');
  assert.match(trs[1], /badge bad">Miss<\/span> <span class="quiet">no extraction file</);
  assert.match(trs[4], /badge bad">Miss<\/span> <span class="quiet">packet invalid</);
  assert.doesNotMatch(trs[0], /packet invalid|no extraction file/);
  assert.match(trs[4], /data-label="Found"><span class="quiet">nothing found</);
  // clean_unassessed: 20 in the fixture -> one line; exactly 0 -> no line; 1 -> the line, with the file's count.
  assert.match(headline(render(FIXTURE_ONE)), /<p class="quiet">20 clean rows of unusable packets were not assessed/);
  for (const [n, shown] of [[0, false], [1, true]]) {
    const h = clone(FIXTURE_ONE);
    h.runs[0].groups[0].counts.clean_unassessed = n;
    assert.equal(/clean rows of unusable packets/.test(render(h)), shown, String(n));
  }
});

test('values: numbers, booleans, arrays and null as eval.mjs wrote them', () => {
  const f = clone(FIXTURE_ONE);
  Object.assign(f.runs[0].groups[0].misses[1], { expected_value: 1.335, got_value: ['a', 2], got_state: 'assumed' });
  Object.assign(f.runs[0].groups[0].misses[2], { expected_value: false, got_value: { k: 1 } });
  const trs = rows(misses(render(f)), 'data-id').map(cells);
  assert.deepEqual(trs[1].slice(5, 7), ['verified 1.335', 'assumed ["a",2]']);
  assert.deepEqual(trs[2].slice(5, 7), ['missing false', 'verified {"k":1}']);
  assert.equal(trs[0][5], 'assumed none');
});

// ---- runView: date (decision 137), labels, joins ----

test('decision 137: the date is the run_id\'s leading YYYY-MM-DD, else "date not recorded"', () => {
  assert.equal(runView(FIXTURE_ONE.runs[0], 1).date, '2026-11-20');
  for (const id of ['run-7', 'x2026-11-20', '2026-11-2', '']) assert.equal(runView({ ...FIXTURE_ONE.runs[0], run_id: id }, 1).date, null, id);
  const f = clone(FIXTURE_ONE);
  f.runs[0].run_id = 'run-7';
  const html = render(f);
  assert.match(runs(html), /<span class="mono">run-7<\/span> · claude-sonnet-5-5 · date not recorded · skill/);
  assert.match(headline(html), /FIRST COMPLETE RUN · claude-sonnet-5-5 · skill abc1234</);
});

test('runView: labels, joined models and SHAs, sorted world union, complete flag', () => {
  const v = runView(FIXTURE_ONE.runs[0], 4);
  assert.deepEqual({ n: v.n, models: v.models, skillShas: v.skillShas, worlds: v.worlds, complete: v.complete, label: v.label },
    { n: 4, models: 'claude-sonnet-5-5', skillShas: 'abc1234', worlds: [93, 101, 102, 103, 104], complete: true, label: 'Sonnet' });
  const r = clone(FIXTURE_ONE.runs[0]);
  assert.equal(runView({ ...r, models: ['claude-opus-5-5'] }, 1).label, 'Opus comparison');
  assert.equal(runView(FIXTURE_MANY.runs[2], 3).label, 'Re-test');
  assert.equal(runView({ ...FIXTURE_MANY.runs[2], models: ['claude-opus-5-5'] }, 3).label, 'Opus comparison', 'Opus wins over re-test');
  assert.equal(runView({ ...r, models: ['model-x'] }, 1).label, 'model-x');
  const none = runView({ ...r, models: [], skill_shas: [] }, 1);
  assert.deepEqual([none.label, none.models, none.skillShas], ['No model recorded', 'none', 'none']);
  assert.equal(runView({ ...r, skill_shas: ['a1', 'b2'] }, 1).skillShas, 'a1, b2');
  assert.equal(runView({ ...r, headline_complete: 'true' }, 1).complete, false, 'only boolean true is complete');
  const empty = { ...r, groups: r.groups.map((g) => ({ ...g, worlds: [] })) };
  assert.deepEqual([runView(empty, 1).label, runView(empty, 1).worlds], ['Sonnet', []], 'no worlds is not a re-test');
  assert.equal(runView({ ...FIXTURE_MANY.runs[2], groups: FIXTURE_MANY.runs[2].groups.map((g, i) => (i === 2 ? { ...g, worlds: [105, 109] } : g)) }, 1).label, 'Sonnet', '109 is not a re-test world');
});

test('two runs with the same run_id are told apart by position', () => {
  const html = render({ runs: [FIXTURE_ONE.runs[0], FIXTURE_ONE.runs[0]] }, { run: 2 });
  const items = listItems(html);
  assert.match(items[0], /Run 1 · Sonnet<\/a> <span class="badge ink">Headline/);
  assert.match(items[1], /aria-current="true">Run 2 · Sonnet<\/a>(?!.*Headline)/);
  assert.match(misses(html), /\(run 2\)/);
});

test('run links keep role and policy and are canonical', () => {
  const html = render(FIXTURE_MANY, { policy: 'p1.a-b' }, 'junior');
  const links = [...runs(html).matchAll(/href="([^"]*)"/g)].map((m) => unwrap(m[1]));
  assert.deepEqual(links, [1, 2, 3].map((n) => `#view=eval&role=junior&policy=p1.a-b&run=${n}`));
});

// ---- issue 163: the router's Not found for an unpublished packet pair shows above the page, in every state ----
test('issue 163: renderEval shows the Not found line in the ready, none and error states', () => {
  const notFound = { key: 'packet', value: 'SUP-07, world 999', label: 'Not found' };
  const LINE = '<p class="status-line" role="alert">Not found: packet SUP-07, world 999</p>';
  const ready = renderEval({ evalRuns: ok(FIXTURE_ONE) }, { role: 'senior', params: {}, notFound });
  assert.ok(ready.startsWith('<div class="eval">' + LINE), 'first thing in the page');
  assert.equal(ready.split('Not found').length, 2, 'once');
  assert.ok(runs(ready), 'the runs panel still renders');
  assert.ok(headline(ready), 'the headline still renders');
  for (const [name, evalRuns] of [['none', null], ['404', failed('HTTP 404')], ['error', failed('HTTP 500')]]) {
    const html = renderEval({ evalRuns }, { role: 'senior', params: {}, notFound });
    assert.ok(html.startsWith('<div class="eval">' + LINE), name);
    assert.match(html, /docs\/EVAL\.md/, `${name}: the footer still renders`);
  }
  assert.ok(viewRender({ evalRuns: ok(FIXTURE_ONE) }, { role: 'senior', params: {}, notFound }).includes(LINE), 'the view passes ctx through');
  assert.equal(renderEval(undefined, { notFound }), '<p class="quiet">Loading data…</p>');
  // Without notFound: no Not found and no Route line.
  const plain = render(FIXTURE_ONE);
  assert.doesNotMatch(plain, /Not found|data-route/);
  assert.doesNotMatch(renderEval({ evalRuns: null }, { params: { world: 999, supplier: 'SUP-07' } }), /Not found|Route:/);
});

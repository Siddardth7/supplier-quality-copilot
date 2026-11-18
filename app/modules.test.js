// Module smoke and view renders (#37; UIQ-FR-12, UIM-FR-12, UIT-FR-08 shape, spec D6/D7, SME decision 1).
// Every non-test module imports in Node with no DOM, and every view renders on OK, failed and empty models.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, relative } from 'node:path';
import { VIEWS } from './views/index.js';
import { buildModel } from './model.js';
import { esc, errorPanel } from './html.js';
import { STARK_REFERENCE, parseHistory } from './engine.js';
import { RUBRIC } from './rubric.js';
import { perfectExtraction } from './rubric.testkit.js';

const APP = fileURLToPath(new URL('./', import.meta.url));
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
const MODULES = walk(APP).filter((p) => p.endsWith('.js') && !/\.test\.js$|\.testkit\.js$/.test(p));

const HISTORY = parseHistory('date,supplier_id,part_no,received_qty,rejected_qty,on_time,defect_found_at,failure_mode_code,scar_id,scar_opened,scar_closed\n'
  + '2026-10-06,ACT-01,CP-1,200,0,1,none,,,,\n');
const sup = (id) => ({ id, name: `Name ${id}`, commodity: 'cold_plate', part: 'cold_plate' });
const fail = (path, message, kind = 'fetch') => ({ ok: false, error: { path, message, kind } });
const ext = (id, over = {}) => ({ ok: true, path: `data/extracted/${id}.json`, value: { ...perfectExtraction(RUBRIC, 'cold_plate'), supplier_id: id, ...over } });

function dataWith({ candidates = ['SUP-01', 'SUP-02'], extractions } = {}) {
  return {
    suppliers: { ok: true, path: 'data/suppliers.json', value: { as_of: '2026-11-01', candidates: candidates.map(sup), active: [sup('ACT-01')] } },
    history: { ok: true, path: 'data/history.csv', value: HISTORY },
    extractions: extractions ?? Object.fromEntries(candidates.map((id) => [id, ext(id)])),
    manual: { records: [], error: null },
  };
}
const OK = buildModel(dataWith(), STARK_REFERENCE);
const EMPTY = buildModel({ ...dataWith({ candidates: [] }), history: { ok: true, path: 'data/history.csv', value: [] } }, STARK_REFERENCE);
const FAILED = buildModel({
  suppliers: fail('data/suppliers.json', 'HTTP 404'), history: fail('data/history.csv', 'Network down'),
  extractions: {}, manual: { records: [], error: null },
}, STARK_REFERENCE);
const MIXED = buildModel(dataWith({ candidates: ['SUP-01', 'SUP-02', 'SUP-03', 'SUP-04', '<img src=x onerror=alert(1)>'], extractions: {
  'SUP-01': ext('SUP-01'),
  'SUP-02': fail('data/extracted/SUP-02.json', 'HTTP 404'),
  'SUP-03': ext('SUP-03', { commodity: 'bogus' }),
  'SUP-04': fail('data/extracted/SUP-04.json', 'Invalid JSON: <img src=x onerror=alert(2)>', 'data'),
} }), STARK_REFERENCE);
const DATA_VIEWS = ['today', 'qualify', 'compare', 'monitor'];
const view = (name) => VIEWS.find((v) => v.meta.name === name);

test('D6: every non-test module in app/ imports in Node with no document', async () => {
  assert.equal(typeof globalThis.document, 'undefined');
  const names = MODULES.map((p) => relative(APP, p)).sort();
  for (const must of ['main.js', 'data.js', 'model.js', 'policy.js', 'storage.js', 'route.js', 'html.js', 'shell.js', 'views/index.js', 'views/today.js', 'views/eval.js']) {
    assert.ok(names.includes(must), must);
  }
  for (const p of MODULES) await import(pathToFileURL(p).href);
});

test('every view renders a string on the OK, failed, empty and loading models', () => {
  assert.equal(VIEWS.length, 6);
  for (const v of VIEWS) {
    for (const [label, model] of [['ok', OK], ['failed', FAILED], ['empty', EMPTY], ['loading', null], ['mixed', MIXED]]) {
      const html = v.render(model, { role: 'senior', params: {} });
      assert.equal(typeof html, 'string', `${v.meta.name} ${label}`);
      assert.match(html, new RegExp(`<h2>${v.meta.title}</h2>`), `${v.meta.name} ${label}`);
    }
  }
});

test('SME decision 1: every view is built, so none says "Built in"; Today (#107), Qualify (#39), Compare (issue 108), Monitor (#44), Standards (issue 109) and Eval (issue 111)', () => {
  const BUILT = ['today', 'qualify', 'compare', 'monitor', 'standards', 'eval'];
  assert.deepEqual(VIEWS.map((v) => v.meta.name).filter((n) => !BUILT.includes(n)), []);
  for (const name of BUILT) assert.doesNotMatch(view(name).render(OK), /Built in/, name);
  assert.ok(view('qualify').render(OK).startsWith('<p class="eyebrow">02 / QUALIFY</p><h2>Qualify</h2>'));
  assert.ok(view('monitor').render(OK).startsWith('<p class="eyebrow">04 / MONITOR</p><h2>Monitor</h2>'));
  assert.ok(view('today').render(OK).startsWith('<p class="eyebrow">01 / TODAY</p><h2>Today</h2>'));
  assert.ok(view('compare').render(OK).startsWith('<p class="eyebrow">03 / COMPARE</p><h2>Compare</h2>'));
  assert.ok(view('eval').render(OK).startsWith('<p class="eyebrow">06 / EVAL</p>'));
});

test('D7: OK model status lines', () => {
  // #107: Today lists the two scored candidates and counts the one active supplier instead of status lines.
  const today = view('today').render(OK);
  assert.match(today, /NEEDS YOU \(2\)/);
  assert.equal([...today.matchAll(/data-today-link="qualify"/g)].length, 2);
  assert.match(today, /<dt>A<\/dt><dd class="mono">1<\/dd>/);
  assert.doesNotMatch(today, /status-line/);
  assert.match(view('qualify').render(OK), /QUEUE \(2\)/);
  assert.equal([...view('qualify').render(OK).matchAll(/data-queue-card/g)].length, 2);
  assert.doesNotMatch(view('qualify').render(OK), /active supplier/);
  assert.match(view('monitor').render(OK), /TIER TABLE \(1\)/);  // issue 44: the live tier table carries the active count
  assert.equal([...view('monitor').render(OK).matchAll(/data-monitor-link/g)].length, 1);
  assert.doesNotMatch(view('monitor').render(OK), /candidates/);
});

test('UIQ-FR-12 / UIM-FR-12: failed loads show path and message; one never hides the other', () => {
  const today = view('today').render(FAILED);
  assert.match(today, /data\/suppliers\.json/);
  assert.match(today, /HTTP 404/);
  assert.match(today, /data\/history\.csv/);
  assert.match(today, /Network down/);
  assert.equal([...today.matchAll(/role="alert"/g)].length, 2);
  for (const name of ['qualify', 'compare']) {
    const html = view(name).render(FAILED);
    assert.match(html, /data\/suppliers\.json/, name);
    assert.match(html, /HTTP 404/, name);
  }
  assert.match(view('monitor').render(FAILED), /data\/history\.csv[\s\S]*Network down/);
});

test('D7 / UIE-FR-07 (issue 111): Eval reads "Loading data…" while loading and "No published run yet" with no numbers when no eval.json loaded', () => {
  assert.match(view('eval').render(null), /Loading data…/);
  assert.doesNotMatch(view('eval').render(null), /No published run yet/);
  for (const model of [OK, FAILED, EMPTY, MIXED]) {  // none of these carries evalRuns: no published run
    const html = view('eval').render(model);
    assert.match(html, /No published run yet/);
    assert.doesNotMatch(html, /role="alert"|Loading/);
    const text = html.replace(/<p class="eyebrow">06 \/ EVAL<\/p>/, '').replace(/<[^>]*>/g, '');
    assert.doesNotMatch(text, /\d/, 'no numbers');
  }
});

test('empty candidates list reads "QUEUE (0)" and "No candidates loaded." and is not an error', () => {
  const html = view('qualify').render(EMPTY);
  assert.match(html, /QUEUE \(0\)/);
  assert.match(html, /<p class="quiet">No candidates loaded\.<\/p>/);
  assert.doesNotMatch(html, /role="alert"/);
});

test('loading: data views say "Loading data…" before the model exists', () => {
  for (const name of DATA_VIEWS) assert.match(view(name).render(null), /Loading data…/, name);
});

test('UIQ-FR-12: per-candidate problems show on the queue cards and the detail, counted and escaped', () => {
  const html = view('qualify').render(MIXED);
  assert.match(html, /QUEUE \(5\)/);
  assert.match(html, /<p class="quiet">4 not scored<\/p>/);
  assert.equal([...html.matchAll(/\? NOT EXTRACTED/g)].length, 3);
  assert.equal([...html.matchAll(/✗ ENGINE ERROR/g)].length, 1);
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /data-id="&lt;img src=x onerror=alert\(1\)&gt;"/);
  const at = (supplier) => view('qualify').render(MIXED, { role: 'senior', params: { supplier } });
  assert.match(at('SUP-04'), /Not extracted: data\/extracted\/SUP-04\.json: Invalid JSON: &lt;img src=x onerror=alert\(2\)&gt;/);
  assert.match(at('SUP-02'), /Not extracted: data\/extracted\/SUP-02\.json: HTTP 404/);
  assert.match(at('SUP-03'), /Engine error: data\/extracted\/SUP-03\.json: commodity: unknown commodity &quot;bogus&quot;/);
  const img = at('<img src=x onerror=alert(1)>');
  assert.doesNotMatch(img, /<img/);
  assert.match(img, /Not extracted: not loaded/);
});

test('errorPanel: fetch failures carry the serve hint; data and engine errors do not', () => {
  const fetchP = errorPanel({ path: 'data/a.json', message: 'HTTP 404', kind: 'fetch' });
  assert.match(fetchP, /role="alert"/);
  assert.match(fetchP, /COULD NOT LOAD/);
  assert.match(fetchP, /<code>node scripts\/serve\.mjs<\/code>/);
  assert.doesNotMatch(fetchP, /http\.server/);
  const dataP = errorPanel({ path: 'data/a.json', message: 'Invalid JSON: x', kind: 'data' });
  assert.match(dataP, /COULD NOT LOAD/);
  assert.doesNotMatch(dataP, /serve/);
  const engineP = errorPanel({ path: null, message: '<b>', kind: 'engine' });
  assert.match(engineP, /ENGINE ERROR/);
  assert.match(engineP, /&lt;b&gt;/);
  assert.doesNotMatch(engineP, /serve|class="mono"/);
  const pathP = errorPanel({ path: 'data/<img src=x>.json', message: 'HTTP 404', kind: 'fetch' });
  assert.match(pathP, /data\/&lt;img src=x&gt;\.json/);
  assert.doesNotMatch(pathP, /<img/);
});

test('esc neutralizes <, >, &, double and single quotes', () => {
  assert.equal(esc(`<a href="x" title='y'>&</a>`), '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
  assert.equal(esc(null), '');
  assert.equal(esc(7), '7');
});

test('DS-AC-04: live views handle routed params and escaped Not found', () => {
  for (const v of VIEWS) {
    const html = v.render(OK, { role: 'senior', params: { supplier: 'SUP-07', tab: 'drafts', month: 7 }, notFound: null });
    // Qualify (#39) and Monitor (#44) prove their route with the list and detail instead of the Route line.
    // Today (#107) and Compare (issue 108) have no Route line and no supplier Not found: the router drops supplier and
    // active keys on both. Compare's own part Not found is tested in compare.test.js.
    // Eval (issue 111) has no Route line; since issue 163 it shows the router's Not found (an unpublished packet pair).
    if (['today', 'compare', 'standards'].includes(v.meta.name)) {
      assert.doesNotMatch(html, /data-route|Not found/);
      assert.doesNotMatch(v.render(OK, { role: 'senior', params: {}, notFound: { key: 'supplier', value: 'SUP-99', label: 'Not found' } }), /Not found/);
      continue;
    }
    assert.doesNotMatch(html, /data-route/);
    const nf = v.render(OK, { role: 'senior', params: { supplier: '<img src=x>' }, notFound: { key: 'supplier', value: '<img src=x>', label: 'Not found' } });
    assert.match(nf, /<p class="status-line" role="alert">Not found: supplier &lt;img src=x&gt;<\/p>/, v.meta.name);
    assert.doesNotMatch(nf, /<img|data-route/, v.meta.name);
    assert.doesNotMatch(v.render(OK, { role: 'senior', params: {}, notFound: null }), /data-route|Not found/, v.meta.name);
    assert.doesNotMatch(v.render(OK), /data-route|Not found/, v.meta.name);
  }
});

test('routeLine: Route values escaped; Not found wins over params', async () => {
  const { routeLine } = await import('./shell.js');
  assert.equal(routeLine({ params: { policy: '<b>"x"' } }), '<p class="status-line mono" data-route>Route: policy=&lt;b&gt;&quot;x&quot;</p>');
  assert.equal(routeLine({ params: { supplier: 'SUP-99' }, notFound: { key: 'supplier', value: 'SUP-99' } }), '<p class="status-line" role="alert">Not found: supplier SUP-99</p>');
  assert.equal(routeLine(), '');
  assert.equal(routeLine({ params: {} }), '');
});

test('issue 140: shell exports retain live routing without dead renderers', async () => {
  const shell = await import('./shell.js');
  assert.equal(Object.hasOwn(shell, 'placeholder'), false);
  assert.equal(Object.hasOwn(shell, 'statusLines'), false);
  assert.equal(typeof shell.routeLine, 'function');
});

// Dev world end to end (#37, spec D9): build into a temp dir, load it the way the app does, and refuse data/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync, lstatSync, cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHistory, STARK_REFERENCE } from '../app/engine.js';
import { loadData } from '../app/data.js';
import { buildModel } from '../app/model.js';
import { compileBrief } from '../sim/brief.mjs';
import { sampleWorld } from '../sim/world.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = join(ROOT, 'scripts', 'dev-world.mjs');
const DATA = join(ROOT, 'data');
const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd: ROOT, encoding: 'utf8' });
const tree = (dir) => (existsSync(dir) ? readdirSync(dir, { recursive: true }).map(String).sort() : []);
// DATASET.md: "`as_of` for the whole dataset is **2026-11-01**."
const AS_OF = readFileSync(join(ROOT, 'docs', 'DATASET.md'), 'utf8').match(/`as_of` for the whole dataset is \*\*(\d{4}-\d\d-\d\d)\*\*/)[1];

test('D9: dev-world builds a world the app loads and scores with no engine error', async (t) => {
  const out = mkdtempSync(join(tmpdir(), 'sqc-dev-world-test-'));
  t.after(() => rmSync(out, { recursive: true, force: true }));
  const dataBefore = tree(DATA);
  const r = run('--out', out);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(tree(DATA), dataBefore, 'nothing written under data/');

  const suppliers = JSON.parse(readFileSync(join(out, 'suppliers.json'), 'utf8'));
  assert.deepEqual(suppliers, JSON.parse(readFileSync(join(DATA, 'worlds', '101', 'suppliers.json'), 'utf8')));
  assert.equal(suppliers.as_of, AS_OF);
  assert.equal(suppliers.as_of, '2026-11-01');
  assert.equal(suppliers.candidates.length, 9);
  assert.equal(suppliers.active.length, 6);
  const rows = parseHistory(readFileSync(join(out, 'history.csv'), 'utf8'));
  assert.ok(rows.length > 0);
  assert.deepEqual([...new Set(rows.map((x) => x.supplier_id))].sort(), suppliers.active.map((a) => a.id).sort());
  assert.deepEqual(readdirSync(join(out, 'extracted')).sort(), suppliers.candidates.map((c) => `${c.id}.json`).sort());
  // #40: the eight requirement sheets are copied, byte for byte, so the detail's part number and sheet link work.
  const sheets = readdirSync(join(DATA, 'requirements')).filter((f) => f.endsWith('.json')).sort();
  assert.equal(sheets.length, 8);
  assert.deepEqual(readdirSync(join(out, 'requirements')).sort(), sheets);
  for (const f of sheets) assert.equal(readFileSync(join(out, 'requirements', f), 'utf8'), readFileSync(join(DATA, 'requirements', f), 'utf8'), f);
  // #74: current frozen worlds match the new references; old samples alone do not.
  assert.deepEqual(readdirSync(join(out, 'suppliers')).sort(), suppliers.candidates.map((c) => c.id));
  for (const c of suppliers.candidates) {
    const source = join(DATA, 'worlds', '101', 'packets', c.id);
    const files = readdirSync(source).sort();
    assert.deepEqual(readdirSync(join(out, 'suppliers', c.id)).sort(), files);
    for (const f of files) assert.ok(readFileSync(join(out, 'suppliers', c.id, f)).equals(readFileSync(join(source, f))), f);
  }

  const fetchText = async (rel) => readFileSync(join(out, rel), 'utf8');
  const data = await loadData({ fetchText, storage: null, label: 'dev-data/' });
  const model = buildModel(data, STARK_REFERENCE);
  assert.equal(model.as_of, AS_OF);
  assert.equal(model.candidates.length, 9);
  assert.deepEqual(model.candidates.filter((c) => c.status !== 'scored').map((c) => `${c.id} ${c.status} ${c.error?.message}`), []);
  assert.equal(model.monitor.ok, true);
  assert.equal(model.monitor.value.suppliers.length, 6);
  for (const c of model.candidates) assert.equal(model.sheets[c.commodity]?.ok, true, `${c.id} ${c.commodity} sheet`);
});

test('D9: dev-world refuses to write anywhere under data/ and leaves data/ untouched', (t) => {
  const before = tree(DATA);
  const beforeBytes = new Map(before.filter((name) => lstatSync(join(DATA, name)).isFile()).map((name) => [name, readFileSync(join(DATA, name))]));
  // If the guard ever breaks, remove what it wrote so a failing run can't leave files in data/.
  const top = new Set(readdirSync(DATA));
  t.after(() => { for (const e of readdirSync(DATA)) if (!top.has(e)) rmSync(join(DATA, e), { recursive: true, force: true }); });
  for (const out of ['data', 'data/extracted', './data/../data/x', join(DATA, 'x'), 'data/..foo', 'Data/x', 'DATA/extracted']) {
    const r = run('--out', out);
    assert.equal(r.status, 1, `${out} must be refused (stdout: ${r.stdout.trim()})`);
    assert.match(r.stderr, /refusing to write inside data\//, out);
  }
  assert.deepEqual(tree(DATA), before);
  for (const [name, bytes] of beforeBytes) assert.deepEqual(readFileSync(join(DATA, name)), bytes, `${name} must remain unchanged`);
});

test('D9: a data/ child whose name starts with ".." is still inside data/ and refused', (t) => {
  const out = join(DATA, '..foo');
  const existed = existsSync(out);
  // Clean up only what a failing run created, so a regression never leaves files in data/.
  t.after(() => { if (!existed) rmSync(out, { recursive: true, force: true }); });
  const r = run('--out', 'data/..foo');
  assert.equal(r.status, 1, `data/..foo must be refused (stdout: ${r.stdout.trim()})`);
  assert.equal(existsSync(out), existed);
});

test('D9: the containment check does not over-reach to data-like siblings', (t) => {
  const out = join(ROOT, 'data-sibling-test-tmp');
  t.after(() => rmSync(out, { recursive: true, force: true }));
  const r = run('--out', relative(ROOT, out));
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(join(out, 'suppliers.json')));
});

test('dev packet reuse rejects mismatched frozen facts and stale sample briefs while retaining a matching fallback', (t) => {
  const base = mkdtempSync(join(tmpdir(), 'sqc-dev-packet-affinity-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const fixture = join(base, 'repo'); mkdirSync(fixture);
  for (const dir of ['sim', 'app', 'agent', 'scripts']) cpSync(join(ROOT, dir), join(fixture, dir), { recursive: true });
  cpSync(join(DATA, 'requirements'), join(fixture, 'data', 'requirements'), { recursive: true });
  const frozen = join(fixture, 'data', 'worlds', '101');
  mkdirSync(join(frozen, 'facts'), { recursive: true });
  cpSync(join(DATA, 'worlds', '101', 'packets', 'SUP-01'), join(frozen, 'packets', 'SUP-01'), { recursive: true });
  writeFileSync(join(frozen, 'facts', 'SUP-01.json'), '{"mismatched":true}');
  const sample = join(fixture, 'data', 'samples', 'world-101', 'SUP-01');
  cpSync(join(DATA, 'samples', 'world-101', 'SUP-01'), sample, { recursive: true });
  const runFixture = (name) => {
    const out = join(base, name);
    const result = spawnSync(process.execPath, [join(fixture, 'scripts', 'dev-world.mjs'), '--out', out], { cwd: fixture, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr); return out;
  };
  assert.equal(existsSync(join(runFixture('stale'), 'suppliers')), false);
  const candidate = sampleWorld(101).candidates[0];
  const fact = JSON.parse(readFileSync(join(DATA, 'worlds', '101', 'facts', 'SUP-01.json'), 'utf8'));
  const sheet = JSON.parse(readFileSync(join(DATA, 'requirements', 'cold_plate.json'), 'utf8'));
  const brief = compileBrief(fact, sheet, { name: candidate.name, doc_discipline: candidate.traits.doc_discipline }).brief;
  mkdirSync(join(sample, 'briefs'), { recursive: true });
  writeFileSync(join(sample, 'briefs', 'SUP-01.md'), brief);
  cpSync(join(DATA, 'worlds', '101', 'packets', 'SUP-01'), join(sample, 'packets', 'SUP-01'), { recursive: true });
  const out = runFixture('matching');
  assert.deepEqual(readdirSync(join(out, 'suppliers')), ['SUP-01']);
  for (const f of readdirSync(join(sample, 'packets', 'SUP-01'))) assert.deepEqual(readFileSync(join(out, 'suppliers', 'SUP-01', f)), readFileSync(join(sample, 'packets', 'SUP-01', f)));
});

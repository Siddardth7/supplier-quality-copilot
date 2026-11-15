// Published eval results (issue 36): AGENT-FR-08, AGENT-AC-05. data/eval.json must equal live eval.mjs --json
// output for the committed runs, and docs/EVAL.md must carry its numbers and every miss row verbatim.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const EVAL = fileURLToPath(new URL('./eval.mjs', import.meta.url));
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const { runs } = JSON.parse(readFileSync(new URL('../data/eval.json', import.meta.url), 'utf8'));
const DOC = readFileSync(new URL('../docs/EVAL.md', import.meta.url), 'utf8');

test('data/eval.json equals live eval.mjs --json output, Sonnet then Opus', () => {
  assert.deepEqual(runs.map((r) => r.run_id), ['2026-11-14-sonnet', '2026-11-14-opus']);
  for (const run of runs) {
    const demo = run.groups[1].worlds.length ? ['--demo', String(run.groups[1].worlds[0])] : [];
    const r = spawnSync('node', [EVAL, '--run', run.run_id, ...demo, '--json'], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(r.stdout), run);
  }
});

// The doc text between two headings; fails if either heading is missing.
const section = (from, to) => {
  const a = DOC.indexOf(from), b = DOC.indexOf(to, a + 1);
  assert.ok(a >= 0 && b > a, `sections ${from} .. ${to}`);
  return DOC.slice(a, b);
};

// Each summary table and per-world table is checked row by row, with its label, inside its own section.
const TABLES = [
  { run: 0, group: 0, from: '## 1. Headline', to: '## 2. Per world', worlds: ['## 2. Per world', '## 3. Other rows'] },
  { run: 1, group: 0, from: '### Opus comparison', to: '### Demo world', worlds: ['### Opus comparison', '### Demo world'] },
  { run: 0, group: 1, from: '### Demo world', to: '### Hold-out' },
];

test('docs/EVAL.md summary tables match data/eval.json row by row, in their own sections', () => {
  for (const t of TABLES) {
    const g = runs[t.run].groups[t.group], c = g.counts, r = g.rates;
    const result = (key) => (g.targets ? g.targets[key] : 'headline only');
    const rows = [
      `| Catch | ${c.catch}/${c.gap} | ${r.catch} | ≥ 90% | ${result('catch_ge_90')} |`,
      `| Partial | ${c.partial}/${c.gap} | ${r.partial} | none | - |`,
      `| Miss | ${c.miss}/${c.gap} | ${r.miss} | none | - |`,
      `| Flag rate (catch + partial) | ${c.catch + c.partial}/${c.gap} | ${r.flag} | none | - |`,
      `| False alarm | ${c.false_alarm}/${c.clean} | ${r.false_alarm} | ≤ 5% | ${result('false_alarm_le_5')} |`,
      `| Citation match | ${c.cite_hit}/${c.cite_den} | ${r.citation} | no target | - |`,
      `| Decision agreement | ${c.agree}/${c.cand} | ${r.decision} | no target | - |`,
    ];
    const text = section(t.from, t.to);
    for (const row of rows) assert.ok(text.includes(row), `${runs[t.run].run_id} ${g.name}: ${row}`);
  }
});

test('docs/EVAL.md per-world tables match each run\'s headline per_world rows', () => {
  for (const t of TABLES.filter((t) => t.worlds)) {
    const text = section(...t.worlds);
    for (const { world, counts: c, rates: r } of runs[t.run].groups[0].per_world) {
      const row = `| ${world} | ${c.gap} | ${c.catch} | ${c.partial} | ${c.miss} | ${c.clean} | ${c.false_alarm} | `
        + `${r.catch} | ${r.false_alarm} | ${c.cite_hit}/${c.cite_den} | ${c.agree}/${c.cand} (${r.decision}) |`;
      assert.ok(text.includes(row), `${runs[t.run].run_id} per-world row ${row}`);
    }
  }
});

test('docs/EVAL.md lists every miss row and the run metadata', () => {
  for (const run of runs) {
    for (const g of run.groups) {
      for (const m of g.misses) {
        const row = `| ${m.world} | ${m.supplier_id} | ${m.criterion_id} |`;
        assert.ok(DOC.includes(row), `${run.run_id} missing row ${row}`);
      }
    }
  }
  for (const s of ['claude-sonnet-5-5', 'claude-opus-5-5', 'af74a03', '2026-11-14',
    '103-SUP-03-20261114-130632-failed', '103-SUP-04-20261114-130615-failed']) {
    assert.ok(DOC.includes(s), s);
  }
});

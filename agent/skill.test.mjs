// Mechanical checks on agent/SKILL.md (#31, AGENT-FR-01): it names only rubric IDs and packet files,
// bans the answer key, reference extractions and engine, never asks for a score, and its checklist
// matches app/rubric.js (which has its own parity test against docs/RUBRIC.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RUBRIC } from '../app/rubric.js';
import { section, table, jsonBlock } from '../app/docs.testkit.js';

const SKILL = readFileSync(new URL('./SKILL.md', import.meta.url), 'utf8');
const BAN = 'Never read or run';
const NO_SCORE = 'Never write a score';
const LABEL = 'DRAFT — prepared by an agent for SQE review. Not sent.';
const SIGNATURE = 'Stark Industries Supplier Quality — Pepper Potts';
const CITATION = '^[a-z0-9_]+\\.md §[0-9]+(\\.[0-9]+)*$';

// Allowed file and folder names outside the ban section. Packet files: DATASET.md § Packet style and
// SIMULATION.md § Packet writer (#72), plus the buyer's rfq.md. Update when #72 fixes the names.
const FILES = new Set(['SKILL.md', 'RUBRIC.md', 'rfq.md', 'extraction.json', 'cover_letter.md',
  'quality_manual.md', 'certificates.md', 'pfmea.md', 'control_plan.md', 'capability_study.md', 'msa.md',
  'reliability_report.md', 'capacity.md', 'subtier.md', 'pcn_policy.md']);
const DIRS = new Set(['packet/', 'sqc-extraction/']); // sqc-extraction/1 is the schema marker, not a path

const without = (md, ...headings) => headings.reduce((t, h) => t.replace(section(md, h).join('\n'), ''), md);
const ids = (cell) => (cell ? cell.split(' · ').map((s) => s.trim()) : []);

function checklistErrors(md) {
  const errors = [];
  const core = table(md, 'Core criteria');
  if (core.map((r) => r.ID).join() !== RUBRIC.criteria.map((c) => c.id).join()) errors.push('core IDs differ from RUBRIC.criteria');
  for (const r of core) {
    const c = RUBRIC.criteria.find((x) => x.id === r.ID);
    if (c && c.type !== r.Type) errors.push(`${r.ID}: type ${r.Type}, rubric says ${c.type}`);
  }
  const rows = table(md, 'Category 4 tests by commodity');
  if (rows.length !== RUBRIC.commodities.length) errors.push('commodity rows differ in number from RUBRIC.commodities');
  for (const p of RUBRIC.commodities) {
    const row = rows.find((r) => r.Commodity === p.key);
    if (!row) { errors.push(`commodity ${p.key} missing`); continue; }
    if (ids(row['Required (★)']).join() !== p.required.join()) errors.push(`${p.key}: required tests differ`);
    if (ids(row['Nice to have']).join() !== p.nice.join()) errors.push(`${p.key}: nice-to-have tests differ`);
  }
  return errors;
}

function banErrors(md) {
  let ban;
  try { ban = section(md, BAN).join('\n'); } catch { return [`no "## ${BAN}" section`]; }
  const errors = ['answer_key', 'reference', 'engine'].filter((w) => !ban.includes(w)).map((w) => `ban lacks "${w}"`);
  const leaks = without(md, BAN).match(/\b(answer[ _]keys?|references?|engines?)\b/gi) ?? [];
  return errors.concat(leaks.map((w) => `"${w}" outside the ban section`));
}

test('every criterion ID in SKILL.md is a rubric criterion or catalog test', () => {
  const known = new Set([...RUBRIC.criteria, ...RUBRIC.tests].map((c) => c.id));
  const found = [...SKILL.matchAll(/`(\d\.[a-z0-9_]+)`/g)].map((m) => m[1])
    .concat(SKILL.match(/\b\d\.[a-z][a-z0-9_]*\b/g) ?? []);
  assert.ok(found.length > 0);
  assert.deepEqual([...new Set(found.filter((id) => !known.has(id)))], []);
});

test('checklist matches app/rubric.js core criteria and every commodity profile', () => {
  assert.deepEqual(checklistErrors(SKILL), []);
  const dropped = SKILL.replace('`4.leak_test` · `4.cycle_life`', '`4.leak_test`');
  assert.notEqual(dropped, SKILL);
  assert.deepEqual(checklistErrors(dropped), ['quick_disconnect: required tests differ']);
});

test('file and folder names outside the ban section are packet files, the skill or the rubric', () => {
  const text = without(SKILL, BAN);
  const files = text.match(/[\w-]+\.(md|json)\b/g) ?? [];
  const dirs = text.match(/[\w-]+\//g) ?? [];
  assert.deepEqual([...new Set(files.filter((f) => !FILES.has(f)))], []);
  assert.deepEqual([...new Set(dirs.filter((d) => !DIRS.has(d)))], []);
});

test('ban section names answer key, reference and engine, and they appear nowhere else', () => {
  assert.deepEqual(banErrors(SKILL), []);
  assert.deepEqual(banErrors(without(SKILL, BAN).replace(`## ${BAN}`, '')), [`no "## ${BAN}" section`]);
  assert.ok(banErrors(SKILL + '\nRun the engine.\n').length > 0);
});

test('never-a-score: section present, no score key, no decision words elsewhere', () => {
  assert.ok(section(SKILL, NO_SCORE).join('\n').includes('APPROVED'));
  assert.equal(SKILL.match(/[`"]score[`"]/), null);
  assert.equal(without(SKILL, BAN, NO_SCORE).match(/\b(approved?|conditional)\b/gi), null);
});

test('draft label, signature and citation format are stated exactly where the agent follows them', () => {
  // The label is also in the schema example, so check the Drafts instruction itself, not just the file.
  const drafts = section(SKILL, 'Drafts').join('\n');
  for (const s of [LABEL, SIGNATURE]) assert.ok(drafts.includes(s), s);
  const citation = section(SKILL, 'Citation rules').join('\n');
  assert.ok(citation.includes(CITATION), CITATION);
  assert.match(citation, /at most 240 characters/); // PRD-04 §5
});

test('state table agrees with PRD-04 §5 State rules on value and citation', () => {
  // First word of the value cell (required / optional / null) and the whole citation cell. Notes differ on purpose.
  const rules = (md) => ['verified', 'assumed', 'missing'].map((state) => {
    const cells = md.split('\n').find((line) => line.startsWith(`| \`${state}\` |`)).split('|').map((c) => c.trim());
    return [state, cells[2].match(/[a-z]+/)[0], cells[3]];
  });
  const prd = readFileSync(new URL('../docs/product/PRD-04-agent.md', import.meta.url), 'utf8');
  assert.deepEqual(rules(SKILL), rules(prd));
});

test('schema example equals the PRD-04 §5 example (same keys, no extras)', () => {
  const prd = readFileSync(new URL('../docs/product/PRD-04-agent.md', import.meta.url), 'utf8');
  assert.deepEqual(jsonBlock(SKILL, 'Output schema'), jsonBlock(prd, 'Extraction schema'));
});

test('schema marker and every top-level and drafts key are present', () => {
  for (const k of ['sqc-extraction/1', 'supplier_id', 'commodity', 'run', 'criteria', 'drafts',
    'rfi_items', 'rfi_email', 'audit_focus', 'audit_plan']) assert.ok(SKILL.includes(`"${k}"`) || SKILL.includes(`\`${k}\``), k);
});

test('no URLs (synthetic data, nothing to fetch)', () => {
  assert.doesNotMatch(SKILL, /https?:\/\//);
});

test('front matter has name and description', () => {
  const fm = SKILL.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(fm, 'front matter');
  assert.match(fm[1], /^name: \S+/m);
  assert.match(fm[1], /^description: \S+/m);
});

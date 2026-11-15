import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { RUBRIC, STARK_REFERENCE, evaluate, scorecard, parseHistory } from '../app/engine.js';
import { validateExtraction } from '../agent/validate.mjs';
import { DRAFT_LABEL, DRAFT_SIGNATURE } from '../agent/drafts.mjs';
import { sampleWorld } from './world.mjs';
import { validateSeed } from './seed.mjs';
import { simulateHistory, renderHistory } from './history.mjs';
import { AS_OF, fileFor } from './candidate.mjs';

const check = (ok, message) => { if (!ok) throw new TypeError(message); };
const json = value => JSON.stringify(value, null, 2) + '\n';
const packetFiles = ['cover_letter.md', 'quality_manual.md', 'certificates.md', 'capability_study.md', 'msa.md', 'reliability_report.md', 'capacity.md', 'subtier.md', 'pcn_policy.md'];

/** Shared deterministic drafts and expected rows for simulation and hold-out overlays (issue 128). */
export function buildReferenceFields(reference, evaluation) {
  const drafts = { rfi_items: evaluation.rfi_items, rfi_email: `${DRAFT_LABEL}\n\nSubject: Evidence request for ${reference.supplier_id}\n\n${evaluation.rfi_items.length ? evaluation.rfi_items.map(id => `Please provide supporting evidence for ${id}.`).join('\n') : 'No additional evidence requested.'}\n\n${DRAFT_SIGNATURE}`,
    audit_focus: evaluation.audit_focus, audit_plan: evaluation.audit_focus.map(id => ({ criterion_id: id, question: `Please demonstrate the records and controls supporting ${id}.` })) };
  const scored = new Map(evaluation.categories.flatMap(category => category.criteria.map(row => [row.id, row])));
  const criteria = reference.criteria.map(row => {
    const score = scored.get(row.id);
    return { criterion_id: row.id, expected_state: row.state, expected_value: row.value,
      expected_score: score?.score ?? null, expected_citation: row.citation, note: row.note,
      scored: Boolean(score), kind: score ? score.gap : row.state === 'verified' ? null : 'info' };
  });
  return { drafts, criteria };
}

/** Convert public disclosure only; hidden measurements never enter a reference. */
function referenceAndEvaluation(fact) {
  validateSeed(fact?.seed);
  const candidate = sampleWorld(fact.seed).candidates.find(c => c.id === fact.supplier_id);
  check(candidate && candidate.commodity === fact.commodity, 'Unknown supplier or commodity mismatch');
  const profile = RUBRIC.commodities.find(p => p.key === fact.commodity);
  const ids = RUBRIC.criteria.filter(c => c.cat < 4).map(c => c.id)
    .concat(profile.required, profile.nice, RUBRIC.criteria.filter(c => c.cat >= 4).map(c => c.id));
  check(fact.criteria && typeof fact.criteria === 'object' && !Array.isArray(fact.criteria), 'Invalid facts criteria');
  check(JSON.stringify(Object.keys(fact.criteria).sort()) === JSON.stringify([...ids].sort()), 'Facts applicable criterion set mismatch');
  const criteria = ids.map(id => {
    const row = fact.criteria[id];
    check(row && ['verified', 'assumed', 'missing'].includes(row.disclosure), `${id}: invalid disclosure`);
    const state = row.disclosure;
    if (state === 'missing') check(row.file === null && row.section === null, `${id}: missing citation must be null`);
    else check(typeof row.file === 'string' && typeof row.section === 'string', `${id}: invalid citation`);
    if (state === 'assumed') check(typeof row.claim === 'string' && row.claim.trim(), `${id}: missing claim`);
    return { id, state, value: state === 'verified' ? row.true_value : state === 'assumed' ? row.claimed_value ?? null : null,
      citation: state === 'missing' ? null : `${row.file} §${row.section}`,
      note: state === 'assumed' ? `Supplier claims: "${row.claim}"` : state === 'missing' ? `Expected ${id} evidence in ${fileFor(id)}; none disclosed in the planned supplier packet.` : null };
  });
  const reference = { schema: 'sqc-extraction/1', supplier_id: fact.supplier_id, commodity: fact.commodity,
    run: { run_id: `simulation-${fact.seed}-${fact.supplier_id}`, model: 'deterministic-simulation', skill_sha: 'simulation-reference-v1' },
    criteria, drafts: { rfi_items: [], rfi_email: DRAFT_LABEL, audit_focus: [], audit_plan: [] } };
  const evaluation = evaluate(reference, { as_of: AS_OF, policy: STARK_REFERENCE });
  reference.drafts = buildReferenceFields(reference, evaluation).drafts;
  const valid = validateExtraction(reference, { packetFiles });
  check(valid.ok, `Invalid reference: ${JSON.stringify(valid.errors)}`);
  return { reference, evaluation };
}

/** Convert facts to the final validated reference without exposing internal results. */
export function factsToReference(fact) {
  return referenceAndEvaluation(fact).reference;
}

/** The real engine owns every score, gap, decision and routing result. */
export function buildAnswerKey(seed, facts, historyRows) {
  validateSeed(seed);
  const world = sampleWorld(seed);
  const roster = world.candidates;
  check(Array.isArray(historyRows), 'History rows must be an array');
  const historyIds = [...new Set(historyRows.map(row => row?.supplier_id))].sort();
  check(JSON.stringify(historyIds) === JSON.stringify(world.active.map(supplier => supplier.id).sort()), 'History active supplier roster mismatch');
  check(Array.isArray(facts) && facts.length === roster.length, 'Expected one facts file per candidate');
  check(new Set(facts.map(f => f?.supplier_id)).size === facts.length, 'Duplicate supplier facts');
  const candidates = [...facts].sort((a, b) => a.supplier_id.localeCompare(b.supplier_id)).map(fact => {
    check(fact.seed === seed, 'Facts seed mismatch');
    const { reference, evaluation } = referenceAndEvaluation(fact);
    const { criteria } = buildReferenceFields(reference, evaluation);
    return { supplier_id: fact.supplier_id, commodity: fact.commodity, criteria, evaluation, reference };
  });
  return { seed, as_of: AS_OF, policy: candidates[0].evaluation.policy, candidates,
    scorecard: scorecard(historyRows, { as_of: AS_OF, policy: STARK_REFERENCE }) };
}

/** Validate all inputs before writing any artifacts; hash the exact serialized bytes. */
export async function writeAnswerKey(worldDirectory) {
  check(typeof worldDirectory === 'string' && worldDirectory.length > 0, 'World directory required');
  const directory = join(worldDirectory, 'facts');
  const names = (await readdir(directory)).filter(name => name.endsWith('.json')).sort();
  const facts = await Promise.all(names.map(async name => {
    const fact = JSON.parse(await readFile(join(directory, name), 'utf8'));
    check(name === `${fact.supplier_id}.json`, 'Facts filename mismatch');
    return fact;
  }));
  const historyCsv = await readFile(join(worldDirectory, 'history.csv'), 'utf8');
  const rows = parseHistory(historyCsv);
  check(historyCsv === renderHistory(await simulateHistory(facts[0]?.seed)), 'History does not match world seed');
  const key = buildAnswerKey(facts[0]?.seed, facts, rows);
  const bytes = json(key);
  await mkdir(join(worldDirectory, 'reference'), { recursive: true });
  for (const candidate of key.candidates) await writeFile(join(worldDirectory, 'reference', `${candidate.supplier_id}.json`), json(candidate.reference));
  await writeFile(join(worldDirectory, 'answer_key.json'), bytes);
  await writeFile(join(worldDirectory, 'answer_key.sha256'), createHash('sha256').update(bytes).digest('hex') + '\n');
  return key;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const args = process.argv.slice(2);
  check(args.length === 2 && args[0] === '--world' && args[1].length > 0, 'Usage: node sim/answer-key.mjs --world <directory>');
  const key = await writeAnswerKey(args[1]);
  console.log(`Wrote answer key and hash for seed ${key.seed} (${key.candidates.length} candidates)`);
}

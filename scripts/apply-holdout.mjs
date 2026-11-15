// issue 75 / DATA-FR-13: publish expectations only after the blind run. Never edit the original lock.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { evaluate, STARK_REFERENCE } from '../app/engine.js';
import { validateExtraction } from '../agent/validate.mjs';
import { loadLockedKey } from '../agent/eval.mjs';
import { buildReferenceFields } from '../sim/answer-key.mjs';
import { validateHoldout, holdoutPacketFiles } from '../agent/holdout.mjs';

const check = (ok, message) => { if (!ok) throw new TypeError(message); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Refresh engine-derived fields; notes record edit provenance, not an invented supplier quotation. */
function refresh(candidate, asOf) {
  const reference = candidate.reference;
  const evaluation = evaluate(reference, { as_of: asOf, policy: STARK_REFERENCE });
  const { drafts, criteria } = buildReferenceFields(reference, evaluation);
  reference.drafts = drafts;
  candidate.evaluation = evaluation;
  candidate.criteria = criteria;
}

/** Pure overlay. Packet inventories contain supplier-authored regular-file basenames only. */
export function mergeHoldout(key, entries, packetFilesBySupplier) {
  check(object(key) && Array.isArray(key.candidates) && key.policy?.id === STARK_REFERENCE.id && key.policy?.version === STARK_REFERENCE.version, 'Invalid source answer key');
  check(!Object.hasOwn(key, 'holdout'), 'Source must be the original answer key, not an overlay');
  const overlay = structuredClone(key);
  validateHoldout(entries, key, packetFilesBySupplier);
  const changed = new Set();
  for (const [index, entry] of entries.entries()) {
    const label = `holdout.json[${index}]`;
    const candidate = overlay.candidates.find(row => row.supplier_id === entry.supplier_id);
    const row = candidate.reference.criteria.find(row => row.id === entry.criterion);
    check(row, `${label}: reference criterion missing`);
    row.state = entry.expected_state;
    row.value = entry.expected_value;
    row.citation = row.state === 'missing' ? null : `${entry.file} §${entry.section}`;
    row.note = `Hold-out edit at ${entry.file} §${entry.section}; expectation recorded by Sid.`;
    const validation = validateExtraction(candidate.reference, { packetFiles: packetFilesBySupplier[entry.supplier_id] });
    check(validation.ok, `${label}: invalid expectation: ${JSON.stringify(validation.errors)}`);
    changed.add(candidate);
  }
  for (const candidate of changed) refresh(candidate, overlay.as_of);
  overlay.holdout = structuredClone(entries);
  return overlay;
}

/** Verify the source lock and packet paths, then exclusively create the separate overlay. */
export async function applyHoldout(worldDirectory, holdoutPath) {
  const locked = loadLockedKey(worldDirectory);
  check(locked.ok, `Original answer key refused: ${locked.reason}`);
  const entries = JSON.parse(await readFile(holdoutPath, 'utf8'));
  const packetFiles = holdoutPacketFiles(worldDirectory, locked.key, entries);
  const overlay = mergeHoldout(locked.key, entries, packetFiles);
  const bytes = await readFile(join(worldDirectory, 'answer_key.json'));
  // Refuse a key changed since loadLockedKey, rather than attributing an overlay to different bytes.
  const sourceHash = createHash('sha256').update(bytes).digest('hex');
  check(sourceHash + '\n' === await readFile(join(worldDirectory, 'answer_key.sha256'), 'utf8') && JSON.stringify(JSON.parse(bytes)) === JSON.stringify(locked.key), 'Original answer key changed during overlay');
  overlay.source_answer_key_sha256 = sourceHash;
  await writeFile(join(worldDirectory, 'answer_key.holdout.json'), JSON.stringify(overlay, null, 2) + '\n', { flag: 'wx' });
  return overlay;
}

/** CLI accepts explicit paths; it never creates traps, edits packets, or publishes anything to Git. */
export async function main(args = process.argv.slice(2)) {
  check(args.length === 4, 'Usage: node scripts/apply-holdout.mjs --world <directory> --holdout <published-json>');
  const options = new Map();
  for (let i = 0; i < args.length; i += 2) {
    check(['--world', '--holdout'].includes(args[i]) && !options.has(args[i]) && args[i + 1] && !args[i + 1].startsWith('--'), 'Expected --world and --holdout exactly once');
    options.set(args[i], args[i + 1]);
  }
  const overlay = await applyHoldout(options.get('--world'), options.get('--holdout'));
  console.log(`Wrote answer_key.holdout.json for seed ${overlay.seed}: ${overlay.holdout.length} hold-out entries; original lock unchanged`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try { await main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}

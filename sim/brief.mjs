import { readFile, mkdir, lstat, realpath, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, relative, isAbsolute, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { factsToReference } from './answer-key.mjs';
import { fileFor } from './candidate.mjs';
import { sampleWorld } from './world.mjs';
import { renderRequirements } from './render-requirements.mjs';

export const BANNER = '> Synthetic document for a demo. Fictional supplier.';
const check = (ok, message) => { if (!ok) throw new TypeError(message); };
const topics = {
  '1.cert_current': 'Quality-system registration expiry', '1.cert_scope': 'Quality-system registration type and manufacturing scope',
  '1.internal_audit': 'Internal audit program', '1.capa': 'Corrective-action program', '1.calibration': 'Gauge calibration program',
  '2.pfmea': 'Manufacturing failure-mode analysis', '2.control_plan': 'Production control plan', '2.ctq_cpk': 'Process capability', '2.spc': 'Statistical process monitoring',
  '3.grr': 'Measurement-system repeatability and reproducibility', '3.inspection_method': 'Inspection methods',
  '4.method_criteria': 'Test instructions and release limits', '4.sample_size': 'Statistical sample-size rationale',
  '5.lot_trace': 'Lot traceability', '5.records_retention': 'Record retention in years', '5.nc_segregation': 'Nonconforming material segregation',
  '6.capacity_ratio': 'Demonstrated output divided by peak weekly demand', '6.lead_time': 'Delivery within the requested lead time', '6.ramp_plan': 'Production ramp plan',
  '7.pcn_notice': 'Advance change notice in days', '7.change_approval': 'Customer change authorization',
  '8.subtier_named': 'Named critical outside suppliers', '8.flowdown': 'Requirements passed to outside suppliers', '8.subtier_certs': 'Outside supplier registrations',
  '9.second_source': 'Qualified alternate source', '9.region_risk': 'Regional continuity exposure', '9.financial_health': 'Financial condition',
};
// Deliberately strict: issue #72 explicitly bans the standalone word "gap",
// including ordinary engineering uses, until that writing contract is revised.
export const forbidden = /\b(?:criterion|knockout|rubric|gap|score)\b|\b[1-9]\.[a-z][a-z0-9_]*\b|answer[_ -]?key|target[_ -]?decision/i;
function safeText(value) {
  check(typeof value === 'string' && value.trim() && !/[\r\n`<>]/.test(value), 'Unsafe text in supplier evidence');
  check(!forbidden.test(value) && !/\b(?:ignore|disregard|override|system prompt|write files?|read files?|execute|command|https?:\/\/)\b/i.test(value), 'Instruction-like or private text in supplier evidence');
  return value;
}
function valueText(value) {
  if (typeof value === 'string') return safeText(value);
  check(typeof value === 'boolean' || Number.isFinite(value), 'Invalid public evidence value');
  return String(value);
}
const show = (name, value, unit = '') => `${name}: ${valueText(value)}${unit ? ` ${safeText(unit)}` : ''}.`;
function supportingLines(id, evidence) {
  check(evidence && typeof evidence === 'object' && !Array.isArray(evidence), 'Missing supporting evidence');
  if (id === '2.ctq_cpk') {
    return evidence.ctqs.map(ctq => {
      check(Array.isArray(ctq.observations) && ctq.observations.length > 0, 'Missing capability observations');
      return `${safeText(ctq.name)}: ${ctq.observations.length} observations; ${show('mean', ctq.mean, ctq.unit)} ${show('sample standard deviation', ctq.s, ctq.unit)} ${show('lower drawing limit', ctq.lsl, ctq.unit)} ${show('upper drawing limit', ctq.usl, ctq.unit)} ${show('Cpk', ctq.cpk)}`;
    });
  }
  if (id === '3.grr') return evidence.gauges.map(gauge => `${safeText(gauge.name)}: crossed study, 10 parts, 3 appraisers, 3 repeats; average-and-range method. ${show('GRR percent of drawing tolerance', gauge.percent_tolerance, '%')} ${show('lower drawing limit', gauge.lsl, gauge.unit)} ${show('upper drawing limit', gauge.usl, gauge.unit)}`);
  if (Array.isArray(evidence.conditions)) return evidence.conditions.map(condition => `${safeText(condition.measure)} (${safeText(condition.kind)}): ${show('Observed', condition.observed, condition.unit)}${condition.context ? ` Context: ${safeText(condition.context)}.` : ''}${condition.passed === null ? '' : ` Result: ${condition.passed ? 'meets buyer limit' : 'does not meet buyer limit'}.`}`);
  const lines = [];
  for (const key of ['certificate', 'type', 'registrar', 'method', 'document', 'quoted_weeks', 'need_by_weeks', 'peak_weekly_demand', 'mean', 'unit']) {
    if (evidence[key] != null) lines.push(show(key.replaceAll('_', ' '), evidence[key]));
  }
  for (const key of ['ctqs', 'suppliers', 'certificates', 'outputs']) {
    if (Array.isArray(evidence[key])) lines.push(`${key}: ${evidence[key].map(valueText).join(', ')}.`);
  }
  if (evidence.qualified_source) lines.push(show('Qualified alternate manufacturer', evidence.qualified_source));
  if (evidence.plan?.milestones) for (const milestone of evidence.plan.milestones) lines.push(`${show('Milestone date', milestone.date)} ${show('Added weekly output', milestone.added_parts_per_week, 'parts/week')}`);
  return lines;
}

/** Deterministic disclosure-only brief. Never serialize raw facts or private metadata. */
export function compileBrief(fact, sheet, { name, doc_discipline } = {}) {
  factsToReference(fact); // Existing strict identity, public types, applicable set and citation validation.
  const candidate = sampleWorld(fact.seed).candidates.find(c => c.id === fact.supplier_id);
  check(name === candidate.name, 'Supplier name must match world roster');
  check(Number.isFinite(doc_discipline) && doc_discipline >= 0 && doc_discipline <= 1, 'Invalid document discipline');
  check(sheet?.commodity === fact.commodity, 'Requirement sheet commodity mismatch');
  const rfq = renderRequirements(sheet);
  const voice = doc_discipline >= 0.9 ? 'thorough, organized prose' : doc_discipline >= 0.7 ? 'ordinary business prose' : 'brief, uneven supplier prose';
  const sections = [];
  const locations = new Set();
  const omissions = [];
  for (const [id, row] of Object.entries(fact.criteria)) {
    const topic = safeText(topics[id] ?? sheet.tests[id]?.name);
    if (row.disclosure === 'missing') { omissions.push(topic); continue; }
    check(row.file === fileFor(id), 'Evidence filename differs from planned topic location');
    check(/^[0-9]+(?:\.[0-9]+)*$/.test(row.section), 'Invalid section location');
    const location = `${row.file} §${row.section}`;
    check(!locations.has(location), 'Duplicate evidence section location');
    locations.add(location);
    const lines = row.disclosure === 'assumed'
      ? [`Repeat this statement exactly, without supplying supporting records: ${safeText(row.claim)}`, ...(row.claimed_value == null ? [] : [show('Claimed value', row.claimed_value)])]
      : [show('Recorded result', row.true_value), ...supportingLines(id, row.evidence)];
    sections.push({ file: row.file, section: row.section, topic, lines });
  }
  const files = [...new Set(['cover_letter.md', ...sections.map(section => section.file), 'rfq.md'])].sort();
  const lines = [`Prepare the supplier packet for ${safeText(name)} (${fact.supplier_id}), addressed to Stark Industries Supplier Quality.`,
    `Use ${voice}. This voice never changes the listed facts, exact claims, or omissions.`,
    'Use only the supplied information. Do not invent measurements, dates, registrations, proof, or successful outcomes.',
    'Write exactly these Markdown files:', ...files.map(file => `- ${file}`), '',
    'Every listed file begins with this exact first line:', BANNER, '',
    'The cover letter introduces the supplier and part, then includes only the evidence sections assigned to cover_letter.md below. Do not copy evidence assigned to other files. Keep buyer requirements distinct from supplier evidence.',
    'Use each assigned numbered Markdown heading exactly once in its assigned file, with no extra numbered headings. Introductory headings must be unnumbered. Locations beginning with 9 remain numeric appendix headings.',
    'Preserve every number exactly. Boolean true means present or demonstrated; false means absent or not demonstrated, and must be stated plainly.', ''];
  for (const section of sections) lines.push(`File ${section.file}, section ${section.section}: ${section.topic}`, ...section.lines, '');
  lines.push('Omit the following topics throughout supplier-authored documents. Do not state their presence, absence, results, or supporting evidence:', ...omissions.map(topic => `- ${topic}`), '',
    'Write rfq.md as the following exact buyer-authored text. End it with exactly one newline after the last table row, with no extra blank line. This is buyer context only, never supplier proof.', '--- BEGIN RFQ ---', rfq, '--- END RFQ ---', '');
  const brief = lines.join('\n');
  check(!forbidden.test(brief), 'Prohibited private vocabulary in compiled brief');
  return { brief, files };
}

const correctionActions = {
  restore_value: 'Restore the exact supplied recorded result here without rounding or changing it.',
  repeat_claim: 'Repeat the supplied statement and any supplied claimed result exactly, without adding proof.',
  remove_unlisted: 'Remove statements and results not permitted by the original instructions, including every topic listed for omission.',
  repair_structure: 'Restore exactly the listed files, synthetic first lines and assigned numbered sections; remove extra files or sections.',
  restore_rfq: 'Restore the exact supplied buyer text without any changes.',
  remove_names: 'Remove names or identifiers not supplied in the original brief.',
};

/** Only fixed public actions and validated packet locations cross the retry boundary. */
export function appendRetryFeedback(compiled, feedback = []) {
  check(Array.isArray(feedback), 'Retry feedback must be an array');
  if (feedback.length === 0) return compiled;
  const lines = feedback.map(item => {
    check(item && Object.keys(item).every(key => ['file', 'section', 'action'].includes(key)), 'Invalid retry feedback fields');
    check(Object.hasOwn(correctionActions, item.action), 'Unknown retry action');
    check(item.file == null || compiled.files.includes(item.file), 'Unknown retry file');
    check(item.section == null || typeof item.section === 'string' && /^\d+(?:\.\d+)*$/.test(item.section), 'Invalid retry section');
    if (item.section != null) check(item.file != null && compiled.brief.includes(`File ${item.file}, section ${item.section}:`), 'Retry location is not assigned');
    return `- ${item.file ?? 'All supplier-authored files'}${item.section == null ? '' : ` §${item.section}`}: ${correctionActions[item.action]}`;
  });
  const brief = `${compiled.brief}\nDocument corrections for this attempt:\n${lines.join('\n')}\n`;
  check(!forbidden.test(brief), 'Private vocabulary in retry brief');
  return { ...compiled, brief };
}

/** Validate every retained-output ancestor against the caller's canonical world. */
export async function ensureRetainedDirectory(worldDirectory, segments) {
  check(Array.isArray(segments) && segments.every(segment => typeof segment === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(segment) && segment !== '.' && segment !== '..'), 'Invalid retained directory path');
  const world = await realpath(worldDirectory);
  check((await lstat(world)).isDirectory(), 'World must be a directory');
  let directory = world;
  for (const segment of segments) {
    directory = join(directory, segment);
    let stat;
    try { stat = await lstat(directory); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await mkdir(directory);
      stat = await lstat(directory);
    }
    check(stat.isDirectory() && !stat.isSymbolicLink(), 'Unsafe retained directory: symlinks and non-directories are forbidden');
    const canonical = await realpath(directory);
    const location = relative(world, canonical);
    check(canonical === directory && !isAbsolute(location) && location !== '..' && !location.startsWith(`..${sep}`), 'Retained directory escapes the world');
  }
  return directory;
}

export async function writeBrief(worldDirectory, supplierId, { feedback = [], attempt } = {}) {
  check(/^SUP-\d{2}$/.test(supplierId), 'Invalid supplier ID');
  const fact = JSON.parse(await readFile(join(worldDirectory, 'facts', `${supplierId}.json`), 'utf8'));
  check(fact.supplier_id === supplierId, 'Facts filename identity mismatch');
  const candidate = sampleWorld(fact.seed).candidates.find(c => c.id === supplierId);
  check(candidate, 'Unknown supplier');
  const sheet = JSON.parse(await readFile(new URL(`../data/requirements/${candidate.commodity}.json`, import.meta.url), 'utf8'));
  check(attempt == null || Number.isSafeInteger(attempt) && attempt >= 1 && attempt <= 4, 'Invalid brief attempt');
  check(feedback.length === 0 || attempt != null, 'Retry feedback requires an attempt-specific brief');
  const result = appendRetryFeedback(compileBrief(fact, sheet, { name: candidate.name, doc_discipline: candidate.traits.doc_discipline }), feedback);
  const directory = await ensureRetainedDirectory(worldDirectory, ['briefs']);
  const briefPath = `briefs/${supplierId}${attempt == null ? '' : `.attempt-${attempt}`}.md`;
  const filename = `${supplierId}${attempt == null ? '' : `.attempt-${attempt}`}.md`;
  const flags = constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW | (attempt == null ? constants.O_TRUNC : constants.O_EXCL);
  const handle = await open(join(directory, filename), flags, 0o600);
  try { await handle.writeFile(result.brief); } finally { await handle.close(); }
  return { ...result, seed: fact.seed, briefPath };
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const args = process.argv.slice(2);
  check(args.length === 4 && args[0] === '--world' && args[2] === '--supplier', 'Usage: node sim/brief.mjs --world <directory> --supplier SUP-01');
  const result = await writeBrief(args[1], args[3]);
  console.log(`Wrote brief for ${args[3]} (${result.files.length} planned files)`);
}

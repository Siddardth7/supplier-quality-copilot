import { readFile, writeFile, readdir, lstat, mkdir, mkdtemp, rename, rm, cp, realpath } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { RUBRIC } from '../app/rubric.js';
import { sampleWorld } from './world.mjs';
import { compileBrief, appendRetryFeedback, ensureRetainedDirectory, BANNER, forbidden } from './brief.mjs';
import { writePacket, WRITER_PROMPT } from './write-packet.mjs';

const check = (ok, message) => { if (!ok) throw new TypeError(message); };
const hash = value => createHash('sha256').update(value).digest('hex');
const safeFile = name => typeof name === 'string' && /^[a-z][a-z0-9_]*\.md$/.test(name);
const regular = async path => { const stat = await lstat(path); check(stat.isFile() && !stat.isSymbolicLink(), 'Expected regular file'); return readFile(path, 'utf8'); };
const exists = async path => { try { return await lstat(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } };
export const DEFAULT_KEYWORDS = JSON.parse(await readFile(new URL('./keywords.json', import.meta.url), 'utf8'));
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Literal case-insensitive matching, flexible whitespace, alphanumeric boundaries. */
export function containsText(text, value) {
  const literal = String(value);
  if (literal.length === 0) return false;
  const pattern = literal.trim().split(/\s+/).map(escape).join('\\s+');
  const numeric = /^[-+]?(?:\d+(?:\.\d+)?)(?:e[-+]?\d+)?$/i.test(literal);
  const before = numeric ? '[A-Za-z0-9_.+-]' : '[A-Za-z0-9_]';
  const after = numeric ? '[A-Za-z0-9_]|\\.\\d' : '[A-Za-z0-9_]';
  return new RegExp(`(?<!${before})${pattern}(?!${after})`, 'iu').test(text);
}

/** Coverage/overlap is checked within each applicability profile, not globally. */
export function validateKeywords(keywords, profiles = RUBRIC.commodities) {
  check(keywords && typeof keywords === 'object' && !Array.isArray(keywords), 'Invalid keyword catalog');
  const core = RUBRIC.criteria.map(row => row.id);
  for (const profile of profiles) {
    const ids = profile.ids ?? [...core, ...(profile.required ?? []), ...(profile.nice ?? [])];
    const seen = [];
    for (const id of ids) {
      const words = keywords[id];
      check(Array.isArray(words) && words.length > 0 && words.every(word => typeof word === 'string' && word.trim() && !/[\r\n]/.test(word)), `Missing or invalid keywords for ${id}`);
      const normalized = words.map(word => word.trim().toLowerCase().replace(/\s+/g, ' '));
      check(new Set(normalized).size === words.length, `Duplicate keyword for ${id}`);
      for (const word of normalized) {
        for (const previous of seen) check(previous.id === id || !containsText(word, previous.word) && !containsText(previous.word, word), `Ambiguous keyword overlap in ${profile.key ?? 'profile'}: ${previous.id}, ${id}`);
        seen.push({ id, word });
      }
    }
  }
  return true;
}

/** A numbered section includes nested headings, ending at any same/higher heading. */
export function parseSections(text) {
  const headings = [...text.matchAll(/^(#{1,6})[ \t]+([^\n\r]+)\r?$/gm)].map(match => ({ level: match[1].length, number: match[2].match(/^(\d+(?:\.\d+)*)\b/)?.[1] ?? null, start: match.index, content: match.index + match[0].length }));
  return headings.filter(row => row.number !== null).map(row => {
    const next = headings.find(other => other.start > row.start && other.level <= row.level);
    return { number: row.number, text: text.slice(row.content, next?.start ?? text.length), start: row.start };
  });
}

/** Only assigned supplier topics/evidence, never omission instructions or buyer RFQ. */
export function requiredSupplierText(compiled) {
  const lines = [];
  let assigned = false;
  for (const line of compiled.brief.split('\n')) {
    if (/^(?:Omit the following topics|Write rfq\.md|--- BEGIN RFQ ---)/.test(line)) break;
    const heading = line.match(/^File [a-z][a-z0-9_]*\.md, section [0-9.]+: (.*)$/);
    if (heading) { assigned = true; lines.push(heading[1]); }
    else if (assigned) lines.push(line);
  }
  return lines.join('\n');
}

/** Textual consistency only; no inference, rescoring, or independent study validation. */
export function checkPacket(fact, compiled, packetTexts, { keywords = DEFAULT_KEYWORDS, scrubTerms = [] } = {}) {
  check(fact?.criteria && typeof fact.criteria === 'object' && !Array.isArray(fact.criteria), 'Invalid fact rows');
  check(compiled && Array.isArray(compiled.files) && compiled.files.every(safeFile) && new Set(compiled.files).size === compiled.files.length && typeof compiled.brief === 'string', 'Invalid compiled brief');
  check(packetTexts && typeof packetTexts === 'object' && !Array.isArray(packetTexts), 'Invalid packet texts');
  check(Array.isArray(scrubTerms) && scrubTerms.every(term => typeof term === 'string'), 'Invalid scrub terms');
  const failures = [];
  const unscannable = [];
  const requiredText = requiredSupplierText(compiled);
  const fail = (rule, detail, location = {}) => failures.push({ rule, ...location, detail });
  const assignments = [...compiled.brief.matchAll(/^File ([a-z][a-z0-9_]*\.md), section ([0-9.]+):/gm)];
  const sections = new Map();
  for (const file of Object.keys(packetTexts).sort()) if (!compiled.files.includes(file)) fail('extra_file', 'Unexpected packet artifact.', { file });
  for (const file of compiled.files) {
    const text = packetTexts[file];
    if (typeof text !== 'string') { fail('missing_file', 'Expected packet file is absent.', { file }); continue; }
    if (text.split('\n')[0] !== BANNER) fail('banner', 'Synthetic first line is missing or altered.', { file });
    for (const term of scrubTerms.filter(term => term.trim())) if (text.toLowerCase().includes(term.toLowerCase())) { fail('scrub', 'Local forbidden text occurs in this file.', { file }); break; }
    if (file === 'rfq.md') {
      const expected = compiled.brief.split('--- BEGIN RFQ ---\n')[1]?.split('\n--- END RFQ ---')[0];
      if (text !== expected) fail('rfq', 'Buyer requirement text differs from the supplied text.', { file });
      continue;
    }
    if (forbidden.test(text)) fail('private_vocabulary', 'Private writing vocabulary appears in supplier text.', { file });
    const parsed = parseSections(text);
    sections.set(file, parsed);
    const actual = parsed.map(row => row.number).sort();
    const expected = assignments.filter(match => match[1] === file).map(match => match[2]).sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) fail('headings', 'Numbered headings do not match their assigned locations exactly once.', { file });
  }
  const authored = Object.keys(packetTexts).sort().filter(file => file !== 'rfq.md' && typeof packetTexts[file] === 'string');
  for (const [id, row] of Object.entries(fact.criteria)) {
    check(row && ['verified', 'assumed', 'missing'].includes(row.disclosure), 'Invalid disclosure');
    const words = keywords[id];
    check(Array.isArray(words) && words.length > 0, `Missing keywords for ${id}`);
    if (row.disclosure === 'missing') {
      const scannable = words.filter(keyword => {
        if (!containsText(requiredText, keyword)) return true;
        unscannable.push({ rule: 'missing_mentioned', criterion: id, keyword, reason: 'required_text_collision' });
        return false;
      });
      for (const file of authored) if (scannable.some(word => containsText(packetTexts[file], word))) fail('missing_mentioned', 'An omitted topic appears in supplier-authored text.', { criterion: id, file });
      continue;
    }
    check(safeFile(row.file) && typeof row.section === 'string' && /^\d+(?:\.\d+)*$/.test(row.section), 'Invalid fact location');
    const location = { criterion: id, file: row.file, section: row.section };
    const section = sections.get(row.file)?.find(item => item.number === row.section)?.text ?? '';
    if (row.disclosure === 'verified') {
      if (!containsText(section, row.true_value)) fail('verified_value', 'The supplied recorded result is absent from its assigned section.', location);
    } else {
      check(typeof row.claim === 'string' && row.claim.length > 0, 'Invalid assumed statement');
      if (!containsText(section, row.claim)) fail('assumed_claim', 'The supplied statement is absent from its assigned section.', location);
      if (row.claimed_value != null && !containsText(section, row.claimed_value)) fail('assumed_value', 'The supplied claimed result is absent from its assigned section.', location);
      if (row.true_value !== row.claimed_value) {
        const type = typeof row.true_value;
        const ambiguousType = type === 'boolean' ? 'boolean_value' : type === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(row.true_value) ? 'enum_value' : null;
        const reason = ambiguousType ?? (containsText(requiredText, row.true_value) ? 'required_text_collision' : null);
        if (reason) unscannable.push({ rule: 'assumed_hidden_value', criterion: id, reason });
        else for (const file of authored) if (containsText(packetTexts[file], row.true_value)) fail('assumed_hidden_value', 'An undisclosed true result appears in supplier-authored text.', { criterion: id, file });
      }
    }
  }
  return { passed: failures.length === 0, failures, unscannable };
}

async function writeReport(worldDirectory, report) {
  const directory = await mkdtemp(join(worldDirectory, '.factcheck-'));
  try { const path = join(directory, 'factcheck.json'); await writeFile(path, JSON.stringify(report, null, 2) + '\n'); await rename(path, join(worldDirectory, 'factcheck.json')); }
  finally { await rm(directory, { recursive: true, force: true }); }
}
async function loadWorld(worldDirectory, options) {
  const keywords = options.keywords ?? DEFAULT_KEYWORDS;
  validateKeywords(keywords);
  const directory = join(worldDirectory, 'facts');
  const stat = await lstat(directory); check(stat.isDirectory() && !stat.isSymbolicLink(), 'Unsafe facts directory');
  const files = (await readdir(directory)).sort();
  check(files.length > 0 && files.every(file => /^SUP-\d{2}\.json$/.test(file)), 'Invalid facts filenames');
  const facts = await Promise.all(files.map(file => regular(join(directory, file)).then(JSON.parse)));
  for (let index = 0; index < files.length; index++) check(files[index] === `${facts[index].supplier_id}.json`, 'Facts filename identity mismatch');
  const seed = facts[0].seed;
  const roster = sampleWorld(seed).candidates;
  check(JSON.stringify(files) === JSON.stringify(roster.map(candidate => `${candidate.id}.json`).sort()), 'Facts roster mismatch');
  const entries = [];
  for (const fact of facts) {
    const candidate = roster.find(row => row.id === fact.supplier_id);
    check(candidate && fact.seed === seed && files.includes(`${fact.supplier_id}.json`), 'Facts identity or seed mismatch');
    check(facts.filter(row => row.supplier_id === fact.supplier_id).length === 1, 'Duplicate supplier facts');
    const sheet = JSON.parse(await regular(new URL(`../data/requirements/${candidate.commodity}.json`, import.meta.url)));
    const compiled = compileBrief(fact, sheet, { name: candidate.name, doc_discipline: candidate.traits.doc_discipline });
    entries.push({ fact, compiled });
  }
  let scrubTerms = options.scrubTerms;
  if (scrubTerms === undefined) {
    try { scrubTerms = (await regular(new URL('../.scrub-terms', import.meta.url))).split(/\r?\n/).filter(line => line.trim()); }
    catch (error) { if (error.code !== 'ENOENT') throw error; scrubTerms = []; }
  }
  check(Array.isArray(scrubTerms) && scrubTerms.every(term => typeof term === 'string'), 'Invalid scrub terms');
  return { seed, entries, keywords, scrubTerms };
}
async function inspectPacket(worldDirectory, entry, context) {
  const path = join(worldDirectory, 'packets', entry.fact.supplier_id);
  const directory = await exists(path);
  if (!directory) return { passed: false, failures: [{ rule: 'packet_missing', detail: 'Supplier packet directory is absent.' }], unscannable: [] };
  const parent = await lstat(join(worldDirectory, 'packets'));
  if (!parent.isDirectory() || parent.isSymbolicLink() || !directory.isDirectory() || directory.isSymbolicLink()) return { passed: false, failures: [{ rule: 'unsafe_packet', detail: 'Packet path must be a regular directory.' }], unscannable: [] };
  const names = (await readdir(path)).sort();
  const texts = {};
  const failures = [];
  for (const file of names) {
    if (!entry.compiled.files.includes(file)) { failures.push({ rule: 'extra_file', file, detail: 'Unexpected packet artifact.' }); continue; }
    const stat = await lstat(join(path, file));
    if (!stat.isFile() || stat.isSymbolicLink()) { failures.push({ rule: 'unsafe_file', file, detail: 'Packet file must be regular, not linked.' }); continue; }
    texts[file] = await regular(join(path, file));
  }
  const result = checkPacket(entry.fact, entry.compiled, texts, context);
  return { passed: failures.length === 0 && result.passed, failures: [...failures, ...result.failures], unscannable: result.unscannable };
}

/** Read every candidate; reports missing packets rather than pretending a partial world passed. */
export async function checkWorld(worldDirectory, options = {}) {
  const context = await loadWorld(worldDirectory, options);
  const suppliers = [];
  for (const entry of context.entries) {
    const result = await inspectPacket(worldDirectory, entry, context);
    suppliers.push({ supplier_id: entry.fact.supplier_id, status: result.passed ? 'passed' : 'failed', attempts: [{ attempt: 0, kind: 'existing_packet', failures: result.failures, unscannable: result.unscannable }] });
  }
  const report = { seed: context.seed, status: suppliers.every(row => row.status === 'passed') ? 'passed' : 'failed', suppliers };
  await writeReport(worldDirectory, report);
  return report;
}

/** Never copy private failure text, values, IDs, or scrub terms into a retry brief. */
export function sanitizeFailures(failures, compiled) {
  const seen = new Set();
  const feedback = [];
  for (const failure of failures) {
    const action = ({ verified_value: 'restore_value', assumed_claim: 'repeat_claim', assumed_value: 'repeat_claim', assumed_hidden_value: 'remove_unlisted', missing_mentioned: 'remove_unlisted', scrub: 'remove_names', rfq: 'restore_rfq' })[failure.rule] ?? 'repair_structure';
    const file = compiled.files.includes(failure.file) ? failure.file : null;
    const section = file && typeof failure.section === 'string' && /^\d+(?:\.\d+)*$/.test(failure.section) && compiled.brief.includes(`File ${file}, section ${failure.section}:`) ? failure.section : null;
    const item = { action, file, section };
    const key = JSON.stringify(item);
    if (!seen.has(key)) { seen.add(key); feedback.push(item); }
  }
  appendRetryFeedback(compiled, feedback); // Reuse the writer boundary before returning.
  return feedback;
}

async function retainPacket(worldDirectory, supplierId, directory) {
  const source = join(worldDirectory, 'packets', supplierId);
  const parent = await exists(join(worldDirectory, 'packets'));
  if (parent) check(parent.isDirectory() && !parent.isSymbolicLink(), 'Cannot archive through unsafe packet parent');
  const stat = await exists(source);
  if (!stat) return;
  check(stat.isDirectory() && !stat.isSymbolicLink(), 'Cannot archive unsafe packet directory');
  const world = await realpath(worldDirectory);
  const retained = await ensureRetainedDirectory(worldDirectory, relative(world, directory).split(sep));
  check(!(await exists(join(retained, 'packet'))), 'Prior retained packet evidence exists');
  await rename(source, join(retained, 'packet'));
}

/** Explicit build-stage rewrite only; at most one initial writer call plus three retries. */
export async function rewriteWorld(worldDirectory, options = {}) {
  const context = await loadWorld(worldDirectory, options);
  check(typeof options.model === 'string' && options.model.length > 0, 'Explicit model required for rewrite');
  const writer = options.writer ?? writePacket;
  const report = { seed: context.seed, status: 'failed', suppliers: context.entries.map(entry => ({ supplier_id: entry.fact.supplier_id, status: 'not_checked', attempts: [] })) };
  await writeReport(worldDirectory, report);
  for (let index = 0; index < context.entries.length; index++) {
    const entry = context.entries[index];
    const supplier = report.suppliers[index];
    let result = await inspectPacket(worldDirectory, entry, context);
    supplier.attempts.push({ attempt: 0, kind: 'existing_packet', failures: result.failures, unscannable: result.unscannable });
    supplier.status = result.passed ? 'passed' : 'failed';
    await writeReport(worldDirectory, report);
    if (result.passed) { supplier.status = 'passed'; await writeReport(worldDirectory, report); continue; }
    // Reject both output roots before moving rejected evidence or invoking a writer.
    await ensureRetainedDirectory(worldDirectory, ['briefs']);
    const retainedRoot = await ensureRetainedDirectory(worldDirectory, ['factcheck-attempts']);
    const retainedBase = join(retainedRoot, entry.fact.supplier_id);
    check(!(await exists(retainedBase)), 'Prior rewrite evidence exists; preserve it before a new rewrite run');
    await ensureRetainedDirectory(worldDirectory, ['factcheck-attempts', entry.fact.supplier_id]);
    await retainPacket(worldDirectory, entry.fact.supplier_id, join(retainedBase, 'attempt-0'));
    for (let attempt = 1; attempt <= 4; attempt++) {
      const directory = join(retainedBase, `attempt-${attempt}`);
      check(!(await exists(directory)), 'Prior retained attempt evidence exists');
      await ensureRetainedDirectory(worldDirectory, ['factcheck-attempts', entry.fact.supplier_id, `attempt-${attempt}`]);
      const feedback = sanitizeFailures(result.failures, entry.compiled);
      const compiled = appendRetryFeedback(entry.compiled, feedback);
      const briefPath = `factcheck-attempts/${entry.fact.supplier_id}/attempt-${attempt}/brief.md`;
      await writeFile(join(directory, 'brief.md'), compiled.brief);
      const record = { attempt, model: options.model, prompt: WRITER_PROMPT, brief_path: briefPath, brief_sha256: hash(compiled.brief), writer_version: null, failures: [], unscannable: [] };
      supplier.attempts.push(record);
      const temporaryRoot = await mkdtemp(join(options.temporaryRoot ?? tmpdir(), 'sqc-rewrite-'));
      try {
        const publication = await writer(worldDirectory, entry.fact.supplier_id, { ...options.writerOptions, model: options.model, temporaryRoot, feedback, briefAttempt: attempt });
        record.writer_version = publication?.provenance?.suppliers?.[entry.fact.supplier_id]?.at(-1)?.version ?? null;
        result = await inspectPacket(worldDirectory, entry, context);
        record.failures = result.failures;
        record.unscannable = result.unscannable;
      } catch (error) {
        record.error = String(error?.message ?? error).slice(0, 500);
        result = { passed: false, failures: [{ rule: 'writer_failure', detail: 'Writer invocation or output validation failed.' }] };
        record.failures = result.failures;
      } finally {
        try {
          const stage = join(temporaryRoot, 'sqc-write', String(context.seed), entry.fact.supplier_id);
          const stat = await exists(stage);
          if (stat?.isDirectory() && !stat.isSymbolicLink()) {
            await ensureRetainedDirectory(worldDirectory, ['factcheck-attempts', entry.fact.supplier_id, `attempt-${attempt}`]);
            check(!(await exists(join(directory, 'stage'))), 'Prior retained stage evidence exists');
            await cp(stage, join(directory, 'stage'), { recursive: true, dereference: false });
          }
        } finally { await rm(temporaryRoot, { recursive: true, force: true }); }
      }
      await writeReport(worldDirectory, report);
      if (result.passed) break;
      await retainPacket(worldDirectory, entry.fact.supplier_id, directory);
    }
    supplier.status = result.passed ? 'passed' : 'failed';
    await writeReport(worldDirectory, report);
    if (!result.passed) return report;
  }
  report.status = 'passed';
  await writeReport(worldDirectory, report);
  return report;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const args = process.argv.slice(2);
  check(args[0] === '--world' && args[1] && (args.length === 2 || args.length === 5 && args[2] === '--rewrite' && args[3] === '--model'), 'Usage: node sim/factcheck.mjs --world <directory> [--rewrite --model <model>]');
  const report = args.length === 2 ? await checkWorld(args[1]) : await rewriteWorld(args[1], { model: args[4] });
  console.log(JSON.stringify(report));
  if (report.status !== 'passed') process.exitCode = 1;
}

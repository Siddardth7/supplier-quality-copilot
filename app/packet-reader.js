// Rules-based packet reader (issue 172; PRD-05 UIQ-FR-21, -22, -24, UIQ-NFR-03; decisions D1-D11). Pure: no DOM, no
// storage, no fetch, no AI. It fills the + New supplier checklist from packet Markdown in the shipped Stark format and
// never scores: its rows go to scoreEntry, which calls the engine. Packet text is untrusted: it is only matched by fixed patterns
// (no regex is built from it) and every caller escapes it before it reaches the DOM.
import { RUBRIC } from './engine.js';
import { checklist, MAX_FILE_BYTES, MAX_TOTAL_BYTES, REFUSED } from './manual.js';
import { PACKET_FILES } from './packet.js';

export { MAX_FILE_BYTES, MAX_TOTAL_BYTES };
export const SAMPLE_DIR = 'samples/brand-corporation/';  // relative to the data base; the sample button fetches it
export const FORMAT_HELP = 'Proven = the packet records a result; confirm it on the cited page before saving. The reader only reads packets in this format: Markdown files named like the Stark packet (cover_letter.md, certificates.md, ...), with each section numbered and titled like a checklist row and its result written as "recorded result". Real PDFs, scans and free-form packets need the AI reader (planned). It fills the checklist; you confirm every row. Scores still come only from the engine.';
export const NO_MATCH = "Nothing in these files matches this part's checklist. The reader only reads packets in the Stark packet format (numbered sections titled like the checklist). Fill the checklist by hand instead.";
export const NOTHING = 'Nothing to read.';
export const RFQ_DETAIL = 'buyer requirements, not read as supplier evidence';

// Core criterion -> its packet section title: the `topics` in sim/brief.mjs, verbatim (the writer titles every
// section with these). Test sections use RUBRIC.tests[].name. Exact title only, no fuzzy or keyword match (D1).
export const CRITERION_HEADINGS = {
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

/** Title key: trimmed, whitespace collapsed, one trailing period dropped, lowercase. */
export const titleKey = (t) => String(t).trim().replace(/\s+/g, ' ').replace(/\.$/, '').toLowerCase();
const BY_TITLE = new Map([...Object.entries(CRITERION_HEADINGS).map(([id, t]) => [titleKey(t), id]),
  ...RUBRIC.tests.map((t) => [titleKey(t.name), t.id])]);

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** [{ name, bytes: Uint8Array }] -> { files: [{ name, text }], refused: [{ name, reason }] }. Never throws. */
export function decodeFiles(entries) {
  const files = [], refused = [];
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let total = 0, over = false;
  for (const e of Array.isArray(entries) ? entries : []) {
    const name = String(e?.name ?? '').trim();
    const bytes = e?.bytes instanceof Uint8Array ? e.bytes : new Uint8Array(0);
    const no = (reason) => { refused.push({ name: String(e?.name ?? ''), reason }); };
    if (!PACKET_FILES.includes(name)) { no(REFUSED.name); continue; }
    if (files.some((f) => f.name === name)) { no(REFUSED.twice); continue; }
    if (!bytes.length) { no(REFUSED.empty); continue; }
    if (bytes.length > MAX_FILE_BYTES) { no(REFUSED.big); continue; }
    let text;
    try { text = decoder.decode(bytes); } catch { no(REFUSED.text); continue; }
    if (text.includes('\0')) { no(REFUSED.text); continue; }
    if (over || total + bytes.length > MAX_TOTAL_BYTES) { over = true; no(REFUSED.total); continue; }
    total += bytes.length;
    files.push({ name, text });
  }
  return { files, refused };
}

const HEADING = /^(#{1,6})\s+(\d+(?:\.\d+)*)\.?\s+(.+?)\s*$/;
const ANY_HEADING = /^(#{1,6})\s/;
const FENCE = /^\s*(```|~~~)/;
const DATE = /^\d{4}-\d\d-\d\d$/;
const NUM = /^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i;
const P1 = /recorded result(?: for [^:.\n]*)?(?: is|:)\s+(\S+)/i;
const P2 = [/\bis recorded as (true|false)\b/i,
  /\bis (?:present or |absent or not )?demonstrated \((true|false)\)(?=[.!]?$)/i];
const BOOLEAN_OPTIONS = /\b(?:either|will record)\b|\bor\b(?! (?:not )?demonstrated\b)|\(true\).*\(false\)|\(false\).*\(true\)/i;
const P3 = { number: /\brecorded [^.\n]*? is (-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)(?!\w|\.\d)/i, date: /\brecorded [^.\n]*? is (\d{4}-\d\d-\d\d)\b/i };
const MENTIONS = /\b(recorded|result|measured|observed)\b/i;
const NOT_MET = /does not meet buyer limit/i;
const NEEDS = { number: 'a number', bool: 'true or false', date: 'a date YYYY-MM-DD' };
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** text -> [{ level, num, title, body: [line] }] for numbered headings (level >= 2). A body runs to the next heading
 *  of the same or a higher level, like the viewer's cited range. Fenced lines are never headings. */
function sections(text) {
  const lines = String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let open = [], fenced = false;
  for (const line of lines) {
    if (FENCE.test(line)) fenced = !fenced;
    const h = !fenced && ANY_HEADING.exec(line);
    if (h) {
      const level = h[1].length;
      open = open.filter((s) => s.level < level);
      const m = HEADING.exec(line);
      if (m) { const s = { level, num: m[2], title: m[3], body: [] }; out.push(s); open.push(s); }
      else if (level >= 2) {
        const title = line.slice(h[0].length).trim();
        const s = { level, num: null, title, body: [] };
        out.push(s);
        if (BY_TITLE.has(titleKey(title))) open.push(s);
      }
      continue;
    }
    // A recognized child owns its evidence, including any ordinary detail headings below it.
    const owner = open.findLastIndex((s) => s.level >= 2 && BY_TITLE.has(titleKey(s.title)));
    for (const s of open.slice(Math.max(0, owner))) s.body.push({ line, plain: !fenced && !FENCE.test(line) });
  }
  return out;
}

// Searchable text (D11): plain body lines only. Never quotes, table rows, fenced code or inline code spans.
const searchable = (body) => body.filter((b) => b.plain && b.line.trim() && !/^\s*>/.test(b.line) && !b.line.includes('|'))
  .map((b) => b.line.replace(/`[^`]*`/g, ' ').trim()).filter(Boolean);

/** A raw result token -> the engine type, or undefined when it does not convert (never guessed). */
function convert(row, raw) {
  const t = raw.replace(/[.,;:)]+$/, '');
  if (row.type === 'bool') return /^(true|false)$/i.test(t) ? t.toLowerCase() === 'true' : undefined;
  if (row.type === 'number') return NUM.test(t) ? Number(t) : undefined;
  if (row.type === 'date') return DATE.test(t) ? t : undefined;
  if (row.type === 'enum') return row.options.includes(t.toLowerCase()) ? t.toLowerCase() : undefined;
  return undefined;
}

/** The value ladder P1-P3 over the searchable lines; only the first "recorded result" line is read (F6). */
function findValue(row, lines) {
  const results = lines.filter((l) => /recorded result/i.test(l));
  const look = results.length ? results.slice(0, 1) : lines;
  const first = (re) => {
    for (const line of look) {
      if (P2.includes(re) && BOOLEAN_OPTIONS.test(line)) continue;
      const match = re.exec(line);
      if (match) return match[1];
    }
    return null;
  };
  const ladder = [P1, ...(row.type === 'bool' ? P2 : []),
    ...(row.type === 'enum' ? [new RegExp(`\\brecorded [^.\\n]*? is (${row.options.map(escRe).join('|')})(?![\\w-])`, 'i')] : []),
    ...(P3[row.type] ? [P3[row.type]] : [])];
  for (const re of ladder) { const raw = first(re); if (raw !== null) return { raw, several: results.length > 1 }; }
  return { raw: null, several: results.length > 1 };
}

const firstSentence = (lines) => {
  const s = lines.join(' ').replace(/\s+/g, ' ').trim();
  const one = /^.*?[.!?](?=\s|$)/.exec(s)?.[0] ?? s;
  return one.length > 240 ? `${one.slice(0, 239)}…` : one;
};

/** files: [{ name, text }], commodity: a RUBRIC key, partNo: string|null ->
 *  { ok: true, rows, counts, files, unmatched, warnings } | { ok: false, error }. */
export function readPacket(files, commodity, partNo = null) {
  const list = checklist(commodity);
  if (!list) return { ok: false, error: `commodity: unknown commodity ${JSON.stringify(commodity) ?? 'undefined'}` };
  const given = (Array.isArray(files) ? files : []).filter((f) => isObj(f) && typeof f.name === 'string' && typeof f.text === 'string');
  if (!given.length) return { ok: false, error: NOTHING };
  const byName = new Map();
  const status = [];
  for (const f of given) {
    if (!PACKET_FILES.includes(f.name)) status.push({ name: f.name, status: 'refused', detail: REFUSED.name });
    else if (byName.has(f.name)) status.push({ name: f.name, status: 'refused', detail: REFUSED.twice });
    else byName.set(f.name, f.text);
  }
  const rowsById = new Map(list.map((r) => [r.id, r]));
  const read = new Map();  // id -> { row, where }
  const unmatched = [], warnings = [];
  for (const name of PACKET_FILES) {
    if (!byName.has(name)) continue;
    if (name === 'rfq.md') { status.push({ name, status: 'stored', detail: RFQ_DETAIL }); continue; }
    let matched = 0;
    const packetSections = sections(byName.get(name));
    const anchorCounts = new Map();
    for (const { num } of packetSections) {
      if (num !== null) anchorCounts.set(num, (anchorCounts.get(num) ?? 0) + 1);
    }
    for (const s of packetSections) {
      if (s.level === 1) continue;
      const where = `${name} §${s.num}`;
      const id = BY_TITLE.get(titleKey(s.title));
      const miss = (reason) => unmatched.push({ file: name, section: s.num, title: s.title, reason });
      if (s.num === null) {
        if (rowsById.has(id)) miss(`section has no number, so it can't be cited; number it like "## 1.1 ${s.title}"`);
        continue;
      }
      if (!id) { miss('no checklist row has this title'); continue; }
      if (!rowsById.has(id)) { miss('does not apply to this part'); continue; }
      if (read.has(id)) {
        const first = read.get(id);
        miss(`duplicate of ${first.row.where}`);
        first.flags.push(`Check: another section also matches this row (${where}). The first was used.`);
        continue;
      }
      matched++;
      const anchorFlag = anchorCounts.get(s.num) > 1
        ? `Check: §${s.num} appears more than once in ${name}, so the citation can't be opened reliably. Renumber the sections.`
        : null;
      read.set(id, readSection(rowsById.get(id), s, where, anchorFlag));
    }
    status.push({ name, status: 'read', detail: `${matched} ${matched === 1 ? 'section' : 'sections'} matched` });
  }
  if (!read.size) return { ok: false, error: NO_MATCH, ...(unmatched.length ? { unmatched } : {}) };
  if (partNo && byName.has('cover_letter.md')) {
    for (const p of new Set(byName.get('cover_letter.md').match(/\bSI-[A-Z]{2}-\d{4}\b/g) ?? [])) {
      if (p !== partNo) warnings.push(`The cover letter names part ${p} but you picked ${partNo}.`);
    }
  }
  const rows = {};
  const counts = { proven: 0, claimed: 0, missing: 0, flagged: 0 };
  for (const r of list) {
    const hit = read.get(r.id);
    rows[r.id] = hit ? { ...hit.row, flag: hit.flags.length ? hit.flags.join(' ') : null }
      : { state: 'missing', value: null, where: '', note: 'No matching section in the uploaded packet', flag: null };
    counts[{ verified: 'proven', assumed: 'claimed', missing: 'missing' }[rows[r.id].state]]++;
    if (rows[r.id].flag) counts.flagged++;
  }
  return { ok: true, rows, counts, files: status, unmatched, warnings };
}

// One matched section -> { row: { state, value, where, note }, flags: [] } (rules 5 and 6 of the spec).
function readSection(row, s, where, anchorFlag) {
  const lines = searchable(s.body);
  const all = s.body.map((b) => b.line).join('\n');
  const flags = [];
  const { raw, several } = findValue(row, lines);
  const value = raw === null ? undefined : convert(row, raw);
  const note = lines.length ? firstSentence(lines) : s.body.some((b) => b.line.trim()) ? '(no plain text in this section)' : '(section is empty)';
  if (raw !== null && value === undefined) {
    const need = NEEDS[row.type] ?? `one of: ${row.options.join(', ')}`;
    flags.push(`Check: found "${raw.replace(/[.,;:)]+$/, '')}" but this row needs ${need}. Read as a claim.`);
  } else if (raw === null && MENTIONS.test(all)) {
    flags.push('Check: this section mentions a result the reader could not read. Read as a claim.');
  }
  if (several && raw !== null) flags.push('Check: this section has more than one "recorded result" line. The first was used; confirm it on the cited page.');
  const conflicts = value === true && NOT_MET.test(all);
  if (conflicts) flags.push('Check: the section says true but also reports a result that does not meet the buyer limit.');
  if (anchorFlag) flags.push(anchorFlag);
  const proven = value !== undefined && !conflicts && !anchorFlag;
  return { row: { state: proven ? 'verified' : 'assumed', value: proven ? value : null, where, note: proven ? '' : note }, flags };
}

/** The saved packet's text for a viewer doc, or null (no packet, or doc not in it). */
export function uploadedFile(record, doc) {
  const files = record?.packet?.files;
  if (!Array.isArray(files) || typeof doc !== 'string') return null;
  const f = files.find((x) => isObj(x) && x.name === doc && typeof x.text === 'string');
  return f ? f.text : null;
}

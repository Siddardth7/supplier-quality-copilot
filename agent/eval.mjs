// Eval catch rate (issue 34): AGENT-FR-07 (catch, partial, miss, false alarms, citation match, decision
// agreement per PRD-04 § 5 Eval definitions), AGENT-FR-11 (refuse a world whose answer_key.json does not
// match its answer_key.sha256), AGENT-FR-10 reporting side (headline 101-104 pooled; demo, re-test 105-108
// and hold-out in their own blocks), AGENT-NFR-01 (Node built-ins only). Spec: docs/product/PRD-04-agent.md
// § 5, docs/SIMULATION.md (answer_key.json, answer_key.sha256, hold-out traps).
// Every score comes from the engine (scoreCriterion, evaluate); nothing here re-implements a threshold.
// Out of scope: proving the hash commit was merged into test before the blind run (SIMULATION.md lock rule).
// That is git history, recorded in the run evidence by issue 71 / issue 33; this tool checks the bytes only.
//
// CLI: node agent/eval.mjs --run <run_id> [--runs <dir>] [--worlds <dir>] [--demo <n>] [--json]
//   Reads <runs>/<run_id>/<n>/<SUP-xx>.json and <worlds>/<n>/answer_key.json; writes nothing but stdout.
//   exit 0 every world scored, 1 a world (or its hold-out) refused or none scored, 2 usage or unreadable run dir.
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { RUBRIC, STARK_REFERENCE, evaluate, findCriterion, scoreCriterion } from '../app/engine.js';
import { validateExtraction } from './validate.mjs';
import { validateHoldout, holdoutPacketFiles } from './holdout.mjs';

export const HEADLINE = [101, 102, 103, 104]; // PRD-04 AGENT-FR-10
export const RETEST = [105, 106, 107, 108]; // PRD-04 AGENT-FR-09

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const STATES = ['verified', 'assumed', 'missing'];
// ponytail: the only two ids with a ±0.01 tolerance (PRD-04 § 5, RUBRIC.md Cpk and %GRR rows); a new
// tolerance id needs a doc change first.
const TOLERANCE_IDS = ['2.ctq_cpk', '3.grr'];
const CITE = /^([a-z0-9_]+\.md) §([0-9]+)(?:\.[0-9]+)*$/;
const SUPPLIER = /^SUP-[0-9]{2}$/;
const KEYS = ['gap', 'catch', 'partial', 'miss', 'clean', 'clean_unassessed', 'false_alarm', 'cite_den', 'cite_hit', 'cand', 'agree'];

const isObj = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const show = (v) => JSON.stringify(v) ?? String(v);
const known = (id) => { try { return Boolean(findCriterion(RUBRIC, id)); } catch { return false; } };
const bySupplier =(a, b) => (a.supplier_id < b.supplier_id ? -1 : a.supplier_id > b.supplier_id ? 1 : 0);

/** PRD-04 § 5 value match: Cpk and %GRR within ±0.01, other numbers to 2 decimals, everything else exact. */
export function valueMatches(id, got, want) {
  if (typeof got === 'number' && typeof want === 'number') {
    if (!Number.isFinite(got) || !Number.isFinite(want)) return false;
    // 1e-9: a pair exactly 0.01 apart can differ by slightly more in IEEE-754 (1.00 - 0.99, 25.01 - 25) and must still match
    if (TOLERANCE_IDS.includes(id)) return Math.abs(got - want) <= 0.01 + 1e-9;
    return Math.round(got * 100) === Math.round(want * 100);
  }
  return got === want;
}

/** Same file and same top-level section ("msa.md §3.2" hits "msa.md §3.4"); anything unparseable is a non-hit. */
export function citationMatches(got, want) {
  const a = typeof got === 'string' && CITE.exec(got);
  const b = typeof want === 'string' && CITE.exec(want);
  return Boolean(a && b && a[1] === b[1] && a[2] === b[2]);
}

// Key shape the scoring relies on. Returns a reason or null. A malformed locked key is refused, never guessed.
function keyProblem(key) {
  if (!isObj(key) || !isObj(key.policy) || key.policy.id !== STARK_REFERENCE.id || key.policy.version !== STARK_REFERENCE.version) {
    return `answer key policy is not ${STARK_REFERENCE.id} v${STARK_REFERENCE.version}`;
  }
  // An empty key would count its world as scored and let an incomplete headline be judged.
  if (!Array.isArray(key.candidates) || key.candidates.length === 0) return 'answer key candidates is not a non-empty array';
  if (typeof key.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key.as_of)) return 'answer key as_of is not YYYY-MM-DD';
  const ids = new Set();
  for (const c of key.candidates) {
    if (!isObj(c) || typeof c.supplier_id !== 'string' || !SUPPLIER.test(c.supplier_id) || ids.has(c.supplier_id) || !Array.isArray(c.criteria)) {
      return `answer key candidate ${show(c?.supplier_id)} is malformed or duplicated`;
    }
    ids.add(c.supplier_id);
    const rows = new Set();
    for (const r of c.criteria) {
      const ok = isObj(r) && typeof r.criterion_id === 'string' && !rows.has(r.criterion_id)
        && known(r.criterion_id)
        && typeof r.scored === 'boolean' && STATES.includes(r.expected_state)
        && (!r.scored || [0, 1, 2, 3].includes(r.expected_score));
      if (!ok) return `answer key row ${c.supplier_id} ${show(r?.criterion_id)} is malformed or duplicated`;
      rows.add(r.criterion_id);
    }
  }
  return null;
}

/** Reads <worldDir>/answer_key.json as bytes and checks it against answer_key.sha256 (AGENT-FR-11) before parsing.
 *  Returns { ok: true, key } or { ok: false, reason }. */
export function loadLockedKey(worldDir) {
  let bytes, hash;
  try { bytes = readFileSync(join(worldDir, 'answer_key.json')); } catch { return { ok: false, reason: 'no answer key' }; }
  try { hash = readFileSync(join(worldDir, 'answer_key.sha256'), 'utf8'); } catch { return { ok: false, reason: 'no answer_key.sha256' }; }
  // The file is exactly the lowercase digest plus one newline (SIMULATION.md); CRLF, spaces or no newline refuse.
  if (!/^[0-9a-f]{64}\n$/.test(hash)) return { ok: false, reason: 'answer_key.sha256 is not 64 lowercase hex digits and one newline' };
  if (createHash('sha256').update(bytes).digest('hex') !== hash.slice(0, 64)) {
    return { ok: false, reason: 'answer_key.json does not match answer_key.sha256' };
  }
  let key;
  try { key = JSON.parse(bytes.toString('utf8')); } catch { return { ok: false, reason: 'answer_key.json is not valid JSON' }; }
  const problem = keyProblem(key);
  return problem ? { ok: false, reason: problem } : { ok: true, key };
}

/** Pure. One answer-key row against the agent's items (null = no usable extraction). PRD-04 § 5.
 *  forceGap: hold-out traps are gap rows by construction. */
export function scoreRow(supplier_id, row, items, as_of, forceGap = false) {
  const id = row.criterion_id;
  const want = row.expected_state;
  const item = items?.find((i) => i.id === id) ?? null;
  const gap = forceGap || (row.scored ? row.expected_score < 3 : want !== 'verified');
  let outcome;
  if (!items) outcome = gap ? 'miss' : 'ok'; // invalid or missing packet: all misses, flags nothing
  else {
    // Scored: the engine's score below 3 (absent item scores 0). Nice-to-have (info): not verified.
    const flags = row.scored ? scoreCriterion(findCriterion(RUBRIC, id), item, as_of) < 3 : item?.state !== 'verified';
    if (!gap) outcome = flags ? 'false_alarm' : 'ok';
    // A catch must also flag: Flag rate = (catches + partials) / gap rows, so catches are flagged rows.
    // Keeps a within-tolerance value that scores 3 (Cpk 1.325 -> 1.335) a miss, not a catch.
    else if (item && flags && item.state === want && (want !== 'verified' || valueMatches(id, item.value, row.expected_value))) outcome = 'catch';
    else outcome = item && flags ? 'partial' : 'miss';
  }
  return {
    supplier_id, criterion_id: id, cls: gap ? 'gap' : 'clean', outcome,
    expected_state: want, expected_value: row.expected_value ?? null, expected_citation: row.expected_citation ?? null,
    got_state: item?.state ?? null, got_value: item?.value ?? null, got_citation: item?.citation ?? null,
    citation_match: outcome === 'catch' && want === 'verified' ? citationMatches(item.citation, row.expected_citation) : null,
  };
}

/** Pure. cand: one answer_key.candidates[] entry. extraction: parsed JSON or null (no file / unparseable).
 *  ctx: { as_of, validation: validateExtraction result or null, skip: criterion ids scored as hold-out instead }.
 *  Returns { supplier_id, status: 'scored'|'invalid'|'missing', rows, decision_agrees }. */
export function scoreCandidate(cand, extraction, { as_of, validation, skip = [] }) {
  const status = extraction == null ? 'missing'
    : validation?.ok === true && extraction.supplier_id === cand.supplier_id && extraction.commodity === cand.commodity ? 'scored'
      : 'invalid';
  const items = status === 'scored' ? extraction.criteria : null;
  const rows = cand.criteria.filter((r) => !skip.includes(r.criterion_id)).map((r) => scoreRow(cand.supplier_id, r, items, as_of));
  let decision_agrees = false;
  if (status === 'scored') {
    try {
      const e = evaluate(extraction, { as_of, policy: STARK_REFERENCE });
      decision_agrees = e.decision === cand.evaluation?.decision && JSON.stringify(e.routing) === JSON.stringify(cand.evaluation?.routing);
    } catch { /* engine threw: disagree */ }
  }
  return { supplier_id: cand.supplier_id, status, rows, decision_agrees };
}

// Hold-out traps (SIMULATION.md § Hold-out traps): [{ supplier_id, criterion, expected_state, expected_value, file, section }].
// Absent file = no hold-out. Returns { holdout, refused }.
function loadHoldout(worldDir, key) {
  const p = join(worldDir, 'holdout.json');
  if (!existsSync(p)) return { holdout: [], refused: null };
  let list;
  try { list = JSON.parse(readFileSync(p, 'utf8')); } catch { return { holdout: [], refused: 'holdout.json is not readable JSON' }; }
  try {
    validateHoldout(list, key, holdoutPacketFiles(worldDir, key, list));
  } catch (error) { return { holdout: [], refused: error.message }; }
  return { holdout: list, refused: null };
}

function readJson(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
}

function packetFiles(worldDir, id) {
  // No packet folder: no cited file can exist, so every citation fails validation (as agent/stage.mjs collect does).
  try { return readdirSync(join(worldDir, 'packets', id)).filter((f) => f.endsWith('.md')); } catch { return []; }
}

/** Reads one world: locked key, optional holdout.json, and <runDir>/<n>/<id>.json per candidate.
 *  Returns { world, refused } when the key is refused, else the scored world. */
export function evalWorld({ worldDir, runDir, n }) {
  const locked = loadLockedKey(worldDir);
  if (!locked.ok) return { world: n, refused: locked.reason };
  const { key } = locked;
  const { holdout, refused: holdout_refused } = loadHoldout(worldDir, key);
  const candidates = [], held = [], models = [], skill_shas = [];
  for (const cand of [...key.candidates].sort(bySupplier)) {
    const id = cand.supplier_id;
    const x = readJson(join(runDir, String(n), `${id}.json`));
    const validation = x == null ? null : validateExtraction(x, { packetFiles: packetFiles(worldDir, id) });
    const mine = holdout.filter((h) => h.supplier_id === id);
    const r = scoreCandidate(cand, x, { as_of: key.as_of, validation, skip: mine.map((h) => h.criterion) });
    candidates.push(r);
    if (r.status === 'scored') { models.push(x.run.model); skill_shas.push(x.run.skill_sha); }
    if (!mine.length) continue;
    const items = r.status === 'scored' ? x.criteria : null;
    held.push({ supplier_id: id, status: r.status, decision_agrees: null, rows: mine.map((h) => scoreRow(id, {
      criterion_id: h.criterion,
      scored: cand.criteria.find((c) => c.criterion_id === h.criterion).scored,
      expected_state: h.expected_state,
      expected_value: h.expected_value ?? null,
      expected_citation: h.expected_state === 'verified' ? `${h.file} §${h.section}` : null,
    }, items, key.as_of, true)) });
  }
  return { world: n, refused: null, holdout_refused, models, skill_shas, candidates, holdout: held };
}

// ponytail: the one percent formatter; integer counts in, fixed 1 decimal out, null for a zero denominator.
const pct = (num, den) => (den === 0 ? null : `${(100 * num / den).toFixed(1)}%`);

/** Pure. Additive counts for one scored candidate (or hold-out group): gap rows by outcome, clean rows, citation, decision.
 *  The clean rows of an invalid or missing packet were never assessed, so they cannot be "not a false alarm": they go to
 *  clean_unassessed and stay out of the false-alarm denominator (Sid, 2026-11-11). Its gap rows still count, as misses. */
export function candCounts(c) {
  const k = Object.fromEntries(KEYS.map((x) => [x, 0]));
  const unusable = c.status === 'invalid' || c.status === 'missing';
  for (const r of c.rows) {
    if (r.cls === 'gap') { k.gap++; k[r.outcome]++; } else if (unusable) k.clean_unassessed++;
    else { k.clean++; if (r.outcome === 'false_alarm') k.false_alarm++; }
    if (r.citation_match !== null) { k.cite_den++; k.cite_hit += r.citation_match ? 1 : 0; }
  }
  if (c.decision_agrees !== null) { k.cand++; k.agree += c.decision_agrees ? 1 : 0; }
  return k;
}

/** Pure. Sums counts (never averages rates), then divides. */
export function summarize(list) {
  const c = Object.fromEntries(KEYS.map((x) => [x, list.reduce((s, k) => s + k[x], 0)]));
  return {
    counts: c,
    rates: {
      catch: pct(c.catch, c.gap), partial: pct(c.partial, c.gap), miss: pct(c.miss, c.gap),
      flag: pct(c.catch + c.partial, c.gap), false_alarm: pct(c.false_alarm, c.clean),
      citation: pct(c.cite_hit, c.cite_den), decision: pct(c.agree, c.cand),
    },
  };
}

function group(name, results, sel) {
  const sup = results.flatMap((r) => sel(r).map((c) => ({ world: r.world, c })));
  return {
    name,
    worlds: results.map((r) => r.world),
    ...summarize(sup.map(({ c }) => candCounts(c))),
    per_world: results.map((r) => ({ world: r.world, ...summarize(sel(r).map(candCounts)) })),
    per_supplier: sup.map(({ world, c }) => ({
      world, supplier_id: c.supplier_id, status: c.status, ...candCounts(c),
      decision: c.decision_agrees === null ? null : c.decision_agrees ? 'yes' : 'no',
    })),
    misses: sup.flatMap(({ world, c }) => c.rows.filter((r) => r.outcome !== 'catch' && r.outcome !== 'ok')
      .map(({ cls, ...r }) => ({ world, status: c.status, ...r }))),
  };
}

/** Pure. results: evalWorld outputs, numeric world order. demo: the --demo world number or null. */
export function buildReport({ run_id, demo = null, results }) {
  const ok = results.filter((r) => !r.refused);
  const uniq = (xs) => [...new Set(xs)].sort();
  const pick = (ns) => ok.filter((r) => ns.includes(r.world));
  const pooled = group('HEADLINE (worlds 101-104 pooled)', pick(HEADLINE), (r) => r.candidates);
  const c = pooled.counts;
  // incomplete and targets come first in the JSON, ahead of the rates, so an incomplete headline is not quoted by mistake
  const headline = { name: pooled.name, worlds: pooled.worlds, incomplete: HEADLINE.filter((n) => !pooled.worlds.includes(n)), targets: null, ...pooled };
  // PRD-04 G3 is a claim about all of 101-104: a headline missing a world is never judged, so leaving one out cannot pass.
  const judged = headline.incomplete.length === 0;
  headline.targets = { // integer comparisons
    catch_ge_90: !judged || c.gap === 0 ? null : c.catch * 10 >= c.gap * 9 ? 'PASS' : 'FAIL',
    false_alarm_le_5: !judged || c.clean === 0 ? null : c.false_alarm * 20 <= c.clean ? 'PASS' : 'FAIL',
  };
  return {
    run_id,
    headline_complete: judged,
    models: uniq(ok.flatMap((r) => r.models)),
    skill_shas: uniq(ok.flatMap((r) => r.skill_shas)),
    refused: results.flatMap((r) => (r.refused ? [{ world: r.world, part: 'world', reason: r.refused }]
      : r.holdout_refused ? [{ world: r.world, part: 'hold-out', reason: r.holdout_refused }] : [])),
    groups: [
      headline,
      group(`DEMO (world ${demo ?? 'none'})`, demo === null ? [] : pick([demo]), (r) => r.candidates),
      group('RETEST (worlds 105-108 pooled)', pick(RETEST), (r) => r.candidates),
      group('HOLD-OUT', ok.filter((r) => r.holdout.length), (r) => r.holdout),
    ],
  };
}

// Columns padded to the widest cell, two spaces apart.
function table(rows) {
  const w = rows[0].map((_, i) => Math.max(...rows.map((r) => String(r[i]).length)));
  return rows.map((r) => `  ${r.map((x, i) => String(x).padEnd(w[i])).join('  ')}`.trimEnd());
}

const sv = (state, value) => (state === null ? '-' : `${state} ${show(value)}`);

export function renderText(report) {
  const out = [`EVAL run ${report.run_id} (synthetic data, Stark Industries buyer)`,
    `models: ${report.models.join(', ') || 'none'}`, `skill_sha: ${report.skill_shas.join(', ') || 'none'}`];
  if (report.refused.length) {
    out.push('', 'Refused worlds');
    for (const r of report.refused) out.push(`  world ${r.world}${r.part === 'world' ? '' : ` ${r.part}`}: REFUSED ${r.reason}`);
  }
  for (const g of report.groups) {
    const hold = g.name === 'HOLD-OUT';
    out.push('', g.name);
    if (g.incomplete?.length) out.push(`  INCOMPLETE: world ${g.incomplete.join(', ')} refused or absent`);
    if (!g.worlds.length) { out.push('  not run'); continue; }
    const { counts: c, rates } = g;
    const line = (label, num, den, rate) => [label, `${num}/${den}`, rate ?? 'n/a'];
    const lines = [
      line('catch', c.catch, c.gap, rates.catch), line('partial', c.partial, c.gap, rates.partial),
      line('miss', c.miss, c.gap, rates.miss),
      ...(hold ? [] : [line('flag rate', c.catch + c.partial, c.gap, rates.flag), line('false alarm', c.false_alarm, c.clean, rates.false_alarm)]),
      // rows of invalid or missing packets: never assessed, so not in the false alarm rate
      ...(!hold && c.clean_unassessed ? [['clean rows not assessed', String(c.clean_unassessed), 'excluded']] : []),
      line('citation match', c.cite_hit, c.cite_den, rates.citation),
      ...(hold ? [] : [line('decision agreement', c.agree, c.cand, rates.decision)]),
    ];
    out.push(`  worlds: ${g.worlds.join(', ')}`, ...table(lines));
    if (g.targets) out.push(`  catch target >= 90%: ${g.targets.catch_ge_90 ?? 'n/a'}`, `  false alarm target <= 5%: ${g.targets.false_alarm_le_5 ?? 'n/a'}`);
    out.push('  per world', ...table([['world', 'gap', 'catch', 'partial', 'miss', 'clean', 'false_alarm', 'catch%', 'false_alarm%'],
      ...g.per_world.map(({ world, counts: k, rates: r }) => [world, k.gap, k.catch, k.partial, k.miss, k.clean, k.false_alarm, r.catch ?? 'n/a', r.false_alarm ?? 'n/a'])]));
    out.push('  per supplier', ...table([['world', 'supplier', 'status', 'gap', 'catch', 'partial', 'miss', 'clean', 'false_alarm', 'decision'],
      ...g.per_supplier.map((s) => [s.world, s.supplier_id, s.status === 'missing' ? 'missing file' : s.status,
        s.gap, s.catch, s.partial, s.miss, s.clean, s.false_alarm, s.decision ?? '-'])]));
  }
  out.push('', 'MISS TABLE (every miss, partial and false alarm)');
  for (const g of report.groups) {
    out.push(g.name);
    if (!g.worlds.length) out.push('  not run');
    else if (!g.misses.length) out.push('  none');
    else {
      out.push(...table([['world', 'supplier', 'criterion', 'outcome', 'expected', 'got', 'citation'],
        ...g.misses.map((m) => [m.world, m.supplier_id, m.criterion_id,
          m.status === 'scored' ? m.outcome : `${m.outcome} (${m.status === 'missing' ? 'missing file' : 'invalid'})`,
          sv(m.expected_state, m.expected_value), sv(m.got_state, m.got_value), m.got_citation ?? '-'])]));
    }
  }
  return `${out.join('\n')}\n`;
}

export const renderJson = (report) => `${JSON.stringify(report, null, 2)}\n`;

export function main(args) {
  const usage = 'usage: node agent/eval.mjs --run <run_id> [--runs <dir>] [--worlds <dir>] [--demo <n>] [--json]';
  const bad = (msg) => { console.error(`${msg}\n${usage}`); return 2; };
  const o = { runs: join(ROOT, 'agent', 'runs'), worlds: join(ROOT, 'data', 'worlds'), json: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--json') o.json = true;
    else if (['--run', '--runs', '--worlds', '--demo'].includes(a) && args[i + 1] !== undefined && !args[i + 1].startsWith('--')) o[a.slice(2)] = args[++i];
    else return bad(`unexpected argument ${show(a)}`);
  }
  if (!o.run || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(o.run)) return bad('--run <run_id> is required (letters, digits, . _ -)');
  let demo = null;
  if (o.demo !== undefined) {
    demo = /^[1-9][0-9]*$/.test(o.demo) ? Number(o.demo) : NaN;
    if (!Number.isSafeInteger(demo) || HEADLINE.includes(demo) || RETEST.includes(demo)) return bad(`--demo ${o.demo}: expected a world number outside 101-108`);
  }
  const runDir = join(o.runs, o.run);
  let worlds;
  try {
    worlds = readdirSync(runDir, { withFileTypes: true }).filter((d) => d.isDirectory() && /^[1-9][0-9]*$/.test(d.name))
      .map((d) => Number(d.name)).sort((a, b) => a - b);
  } catch (e) {
    return bad(`cannot read run dir ${runDir}: ${e.code ?? e.message}`);
  }
  const stray = worlds.find((n) => !HEADLINE.includes(n) && !RETEST.includes(n) && n !== demo);
  if (stray !== undefined) return bad(`world ${stray}: not 101-108 and not the --demo world`);
  const results = worlds.map((n) => evalWorld({ worldDir: join(o.worlds, String(n)), runDir, n }));
  const report = buildReport({ run_id: o.run, demo, results });
  process.stdout.write(o.json ? renderJson(report) : renderText(report));
  return report.refused.length || !results.some((r) => !r.refused) ? 1 : 0;
}

// CLI only when run directly, never on import (same guard as validate.mjs).
const isMain = () => {
  try { return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; }
};
if (isMain()) process.exitCode = main(process.argv.slice(2)); // exitCode, not exit(): lets piped output flush

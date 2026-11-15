// Blind-run tooling (#33, part): stage one packet, audit the headless run log, collect the evidence.
// AGENT-FR-06 (a fresh session that reaches only the staged files, checked by the run log audit) and AGENT-NFR-01
// (Node built-ins only). Spec: docs/product/PRD-04-agent.md § 5 Blind protocol, steps 2, 4 and 5.
// This is the isolation guard for a blind eval, so it fails closed: anything it does not understand is a failure.
//
// CLI (exit 0 ok, 1 refused or failed check, 2 usage; one stderr line per problem):
//   node agent/stage.mjs <n> <SUP-xx> [--force]                stage into $TMPDIR/sqc-blind/<n>/<SUP-xx>, print its path
//   node agent/stage.mjs --audit <run.jsonl> --run <run_id>   judge every tool call (Write: extraction.json only); write agent/runs/<run_id>/<n>/<id>.files.txt
//   node agent/stage.mjs --collect <stage-dir> --run <run_id> [--demo]   copy, hash and validate into agent/runs/<run_id>/<n>/
//   --root <dir> (any form) replaces the repo root. It exists so the tests can use a fixture tree.
//
// stream-json shape. Verified from the Claude Code headless docs (no model session run): newline-delimited JSON,
// first a system/init event, then assistant/user events holding tool_use/tool_result blocks, last a result event.
// Confirmed on a real headless log (Claude Code 2.1.322, 2026-11-13, a dummy packet, issue 33 smoke test): init carries
// a string `cwd`, `tools` and `mcp_servers`; a tool call is
// {"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read","input":{"file_path":"..."}}]}};
// Read and Write take `file_path`, Glob takes `pattern` and an optional `path`. The real log also carries
// `rate_limit_event` lines (usage meter, no message) and `system` lines such as `thinking_tokens`. If a later log
// disagrees, the audit fails and the parser is updated before any evidence is accepted.
import { lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { validateExtraction } from './validate.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const N = /^(0|[1-9][0-9]*)$/;
const ID = /^SUP-[0-9]{2}$/; // validate.mjs SUPPLIER
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const PACKET_FILE = /^[a-z0-9_]+\.md$/; // the citation file-name charset, validate.mjs CITATION
const TOOLS = ['Read', 'Glob', 'Write'];
const EVENTS = ['system', 'user', 'assistant', 'result', 'rate_limit_event'];
const BLOCKS = ['text', 'thinking', 'redacted_thinking'];
const USAGE = [
  'usage: node agent/stage.mjs <n> <SUP-xx> [--force] [--root <dir>]',
  '       node agent/stage.mjs --audit <run.jsonl> --run <run_id> [--root <dir>]',
  '       node agent/stage.mjs --collect <staging-dir> --run <run_id> [--demo] [--root <dir>]',
].join('\n');

export class StageError extends Error {}

const isObj = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const show = (v) => JSON.stringify(v) ?? String(v);
const stat = (p) => {
  try { return lstatSync(p); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
};
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const filesTxt = (a) => a.read.map((r) => `${r}\n`).join('');

// Every non-directory entry under dir as a POSIX relpath; symlinks are listed (file: false), never followed.
function walk(dir, pre = '') {
  return readdirSync(dir).flatMap((name) => {
    const s = lstatSync(join(dir, name));
    return s.isDirectory() ? walk(join(dir, name), `${pre}${name}/`) : [{ rel: pre + name, file: s.isFile() }];
  });
}

// n and id from a staging dir path .../sqc-blind/<n>/<id>, or null.
function stageParts(dir) {
  const [b, n, id] = resolve(dir).split(sep).slice(-3);
  return b === 'sqc-blind' && N.test(n) && ID.test(id) ? { n, id } : null;
}

/** Stage one packet: <tmp>/sqc-blind/<n>/<id>/ holding only SKILL.md, RUBRIC.md and packet/*.md, real byte copies.
 *  Every check runs before anything is created. Throws StageError on refusal. returns { dir, files }. */
export function stage(n, id, { root = ROOT, tmp = tmpdir(), force = false } = {}) {
  if (!N.test(n) || !ID.test(id)) throw new StageError(`bad world or supplier: ${show(n)} ${show(id)}`);
  const packet = join(root, 'data', 'worlds', n, 'packets', id);
  if (!stat(packet)?.isDirectory()) throw new StageError(`packet not found: ${packet}`);
  const sources = { 'SKILL.md': join(root, 'agent', 'SKILL.md'), 'RUBRIC.md': join(root, 'docs', 'RUBRIC.md') };
  for (const p of Object.values(sources)) if (!stat(p)?.isFile()) throw new StageError(`not a regular file: ${p}`);
  // Reject, never skip: a stray entry means the packet build is wrong, and skipping would hide a leak.
  const names = readdirSync(packet);
  const bad = names.filter((f) => !(PACKET_FILE.test(f) && lstatSync(join(packet, f)).isFile()));
  if (bad.length) throw new StageError(bad.map((f) => `packet entry not allowed (regular [a-z0-9_]+.md files only): ${join(packet, f)}`).join('\n'));
  if (!names.length) throw new StageError(`packet is empty: ${packet}`);
  for (const f of names) sources[`packet/${f}`] = join(packet, f);

  // A relative tmp stages under the shell's cwd, and a stage inside the repo lets a session load the repo's CLAUDE.md.
  if (!isAbsolute(tmp)) throw new StageError(`temp dir must be absolute: ${show(tmp)}`);
  const base = resolve(tmp, 'sqc-blind');
  // Compared as text and as physical paths: a TMPDIR that is a link into the repo, or differs only by case, is inside too.
  const phys = (p) => { try { return realpathSync.native(p); } catch { return resolve(p); } };
  if ((base + sep).startsWith(resolve(root) + sep) || (phys(tmp) + sep).startsWith(phys(root) + sep)) throw new StageError(`staging area inside the repo: ${base}`);
  const dir = join(base, n, id);
  if (!dir.startsWith(base + sep)) throw new StageError(`staging dir outside ${base}: ${dir}`);
  // mkdir -p would follow a symlinked parent out of the stage area.
  for (const p of [base, join(base, n)]) if (stat(p) && !stat(p).isDirectory()) throw new StageError(`not a real directory: ${p}`);
  if (stat(dir)) {
    if (!force) throw new StageError(`staging dir exists: ${dir} (use --force to replace)`);
    rmSync(dir, { recursive: true, force: true }); // this exact path only; a symlink is removed as a link
  }
  mkdirSync(join(dir, 'packet'), { recursive: true });
  for (const [rel, src] of Object.entries(sources)) writeFileSync(join(dir, rel), readFileSync(src), { flag: 'wx' });

  const files = Object.keys(sources).sort();
  const got = walk(dir);
  if (got.some((f) => !f.file) || got.map((f) => f.rel).sort().join('\n') !== files.join('\n')) {
    rmSync(dir, { recursive: true, force: true });
    throw new StageError(`staged contents differ from the allowlist, removed: ${dir}`);
  }
  return { dir, files };
}

// p resolved against base, as a POSIX path relative to the stage root it falls in; null when outside every root.
// Lexical after path.resolve, so `..` is normalised; `~` is never expanded, so any `~` path is outside.
function within(p, base, roots) {
  if (/[\0-\x1f]/.test(p) || p.startsWith('~')) return null;
  const abs = resolve(base, p);
  const root = roots.find((r) => abs === r || abs.startsWith(r + sep)); // the sep check stops `S-evil` matching `S`
  return root === undefined ? null : { abs, rel: relative(root, abs).split(sep).join('/') || '.' };
}

// One tool_use block. Adds Read paths to read; reports every problem through fail.
function checkTool({ name, input }, fail, roots, read) {
  if (typeof name !== 'string') return fail(`tool_use name ${show(name)}: expected a string`);
  if (!TOOLS.includes(name)) return fail(`tool ${show(name)} not allowed (only ${TOOLS.join(', ')})`);
  if (!isObj(input)) return fail(`${name} input ${show(input)}: expected an object`);
  if (!roots) return fail(`${name}: tool call without a valid init event before it`);
  if (name === 'Glob') {
    const { pattern, path = '' } = input;
    if (typeof path !== 'string') return fail(`Glob path ${show(path)}: expected a string`);
    const base = within(path, roots[0], roots);
    if (!base) return fail(`Glob path ${show(path)}: outside the staging dir`);
    if (typeof pattern !== 'string' || !pattern) return fail(`Glob pattern ${show(pattern)}: expected a non-empty string`);
    // ponytail: allowlist, not a glob parser. Only name characters, / and * are accepted, so no brace, class, escape or ~
    // can build `..` or an absolute path under any glob engine. A harmless `{md,txt}` fails too; widen only with a parser.
    if (pattern.includes('..') || pattern.startsWith('-') || !/^[A-Za-z0-9_.\/*-]+$/.test(pattern)) {
      return fail(`Glob pattern ${show(pattern)}: only letters, digits, _ . - / and * are allowed, no .. and no leading -`);
    }
    const segs = pattern.split('/');
    const k = segs.findIndex((s) => s.includes('*'));
    const prefix = (k === -1 ? segs : segs.slice(0, k)).join('/') || (pattern.startsWith('/') ? '/' : '.');
    if (!within(prefix, base.abs, roots)) return fail(`Glob pattern ${show(pattern)}: outside the staging dir`);
    return;
  }
  const p = input.file_path;
  if (typeof p !== 'string' || !p) return fail(`${name} file_path ${show(p)}: expected a non-empty string`);
  const r = within(p, roots[0], roots);
  if (!r) return fail(`${name} file_path ${show(p)}: outside the staging dir`);
  if (name === 'Write' && r.rel !== 'extraction.json') return fail(`Write file_path ${show(p)}: only extraction.json may be written`);
  if (name === 'Read') read.add(r.rel);
}

/** Judge a stream-json run log. No writes. The stage, n and id come from the init event's cwd.
 *  returns { ok, stage, n, id, read: [sorted unique relpaths of Read calls], violations: [string] } */
export function auditLog(text) {
  const violations = [];
  const read = new Set();
  let roots = null, parts = null, inits = 0, assistant = false, result = false;
  const fail = (at, msg) => violations.push(`${at}: ${msg}`);

  String(text).split('\n').forEach((line, k) => {
    const at = `line ${k + 1}`;
    if (!line.trim()) return;
    let ev;
    try { ev = JSON.parse(line); } catch { return fail(at, 'not valid JSON'); }
    if (!isObj(ev) || typeof ev.type !== 'string') return fail(at, 'not a JSON object with a string type');
    if (!EVENTS.includes(ev.type)) return fail(at, `unknown event type ${show(ev.type)}`);
    if (ev.type === 'result') result = true;
    // A usage-meter line carries no message; one that does is not understood, so it fails.
    if (ev.type === 'rate_limit_event') return 'message' in ev ? fail(at, 'rate_limit_event with a message') : undefined;
    if (ev.type === 'system' && ev.subtype === 'init') {
      if (++inits > 1 || assistant) return fail(at, 'init event must come exactly once, before any assistant event');
      if (typeof ev.cwd !== 'string' || !isAbsolute(ev.cwd)) return fail(at, `init cwd ${show(ev.cwd)}: expected an absolute path`);
      parts = stageParts(ev.cwd);
      if (!parts) return fail(at, `init cwd ${show(ev.cwd)}: not a staging dir .../sqc-blind/<n>/<SUP-xx>`);
      // The session's own tool list: anything beyond Read, Glob and Write, or any MCP server, means the run was not
      // started with the protocol's flags (--tools Read,Glob,Write --strict-mcp-config), even if no call used it.
      if (!(Array.isArray(ev.tools) && ev.tools.every((t) => TOOLS.includes(t)))) fail(at, `init tools ${show(ev.tools)}: only ${TOOLS.join(', ')} may be available`);
      if (!(Array.isArray(ev.mcp_servers) && ev.mcp_servers.length === 0)) fail(at, `init mcp_servers ${show(ev.mcp_servers)}: expected none`);
      roots = [resolve(ev.cwd)];
      const st = stat(roots[0]);
      if (st && !st.isDirectory()) { roots = null; return fail(at, `init cwd ${show(ev.cwd)}: not a real directory`); }
      // The realpath is a second root only when it is the same stage (/var -> /private/var), never a link to elsewhere.
      try {
        const real = realpathSync(roots[0]), rp = stageParts(real);
        if (real !== roots[0] && rp?.n === parts.n && rp?.id === parts.id) roots.push(real);
      } catch { /* lexical root only */ }
      return;
    }
    if (ev.type === 'user') {
      // Tool calls belong in assistant events; one anywhere else would be skipped, so it fails.
      const c = isObj(ev.message) ? ev.message.content : undefined;
      if (Array.isArray(c) && c.some((b) => isObj(b) && String(b.type).includes('tool_use'))) fail(at, 'tool_use block in a user event');
      return;
    }
    if (ev.type !== 'assistant') return;
    assistant = true;
    const content = isObj(ev.message) ? ev.message.content : undefined;
    if (!Array.isArray(content)) return fail(at, 'assistant message.content is not an array');
    for (const b of content) {
      if (!isObj(b) || typeof b.type !== 'string') fail(at, 'content block without a string type');
      else if (b.type === 'tool_use') checkTool(b, (msg) => fail(at, msg), roots, read);
      else if (!BLOCKS.includes(b.type)) fail(at, `unknown content block type ${show(b.type)}`); // server_tool_use, mcp_tool_use, ...
    }
  });
  if (!inits) fail('log', 'no system init event');
  if (!result) fail('log', 'no result event (truncated log)');
  const ok = violations.length === 0;
  return { ok, stage: roots?.[0] ?? null, n: parts?.n ?? null, id: parts?.id ?? null, read: [...read].sort(), violations };
}

/** Collect one audited run into <root>/agent/runs/<runId>/<n>/: <id>.json, .run.jsonl, .inputs.txt, .validation.json,
 *  and with demo and a valid extraction <root>/data/extracted/<id>.json. Never overwrites, never edits the extraction.
 *  Throws StageError on refusal. returns { ok, validation, written } */
export function collect(stageDir, runId, { root = ROOT, demo = false } = {}) {
  if (!RUN_ID.test(runId)) throw new StageError(`bad run id: ${show(runId)}`);
  const S = resolve(stageDir);
  const parts = stageParts(S);
  if (!parts || !stat(S)?.isDirectory()) throw new StageError(`not a staging dir .../sqc-blind/<n>/<SUP-xx>: ${S}`);
  const { n, id } = parts;
  const runDir = join(root, 'agent', 'runs', runId, n);
  const audited = join(runDir, `${id}.files.txt`);
  if (!stat(audited)) throw new StageError(`run not audited: ${audited} missing`);
  const log = join(S, 'run.jsonl');
  if (!stat(log)?.isFile()) throw new StageError(`run.jsonl missing: ${log}`);
  // Re-audit the exact bytes filed as evidence: the audited log and the stage's log must be the same run.
  const logBuf = readFileSync(log);
  const a = auditLog(logBuf.toString('utf8'));
  const real = (p) => { try { return realpathSync(p); } catch { return resolve(p); } };
  if (!a.ok || a.n !== n || a.id !== id || real(a.stage) !== real(S)) throw new StageError(`run.jsonl fails the audit or names another stage: ${log}`);
  if (!stat(audited).isFile() || readFileSync(audited, 'utf8') !== filesTxt(a)) throw new StageError(`files.txt does not match run.jsonl: ${audited}`);
  // The session cannot make links and stage left none, so one here means the stage was changed after staging.
  const staged = walk(S);
  const odd = staged.filter((f) => !f.file);
  if (odd.length) throw new StageError(odd.map((f) => `not a regular file in the stage: ${join(S, f.rel)}`).join('\n'));

  const xPath = join(S, 'extraction.json');
  const raw = stat(xPath)?.isFile() ? readFileSync(xPath) : null; // a symlink counts as missing, never followed
  const invalid = (message) => ({ ok: false, errors: [{ path: '', message }] });
  let validation;
  if (raw === null) validation = invalid('extraction.json missing');
  else {
    let x;
    try { x = JSON.parse(raw.toString('utf8')); } catch (e) { validation = invalid(`not valid JSON: ${e.message}`); }
    if (!validation) {
      let packetFiles = []; // no packet dir: every citation fails
      try { packetFiles = readdirSync(join(S, 'packet')).filter((f) => f.endsWith('.md')); } catch { /* keep [] */ }
      validation = validateExtraction(x, { packetFiles });
    }
  }

  const inputs = staged
    .filter(({ rel }) => rel !== 'extraction.json' && rel !== 'run.jsonl')
    .sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0))
    .map(({ rel }) => `${sha256(readFileSync(join(S, rel)))}  ${rel}\n`).join('');
  const targets = [
    [join(runDir, `${id}.run.jsonl`), logBuf],
    [join(runDir, `${id}.inputs.txt`), inputs],
    [join(runDir, `${id}.validation.json`), `${JSON.stringify(validation, null, 2)}\n`],
  ];
  if (raw) targets.unshift([join(runDir, `${id}.json`), raw]);
  if (demo && validation.ok) targets.push([join(root, 'data', 'extracted', `${id}.json`), raw]);
  // "It isn't re-run" and "never replace an old run's evidence": refuse before writing anything.
  for (const p of [join(runDir, `${id}.json`), ...targets.map(([p]) => p)]) {
    if (stat(p)) throw new StageError(`already collected, not replaced: ${p}`);
  }
  for (const [p, data] of targets) {
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, data, { flag: 'wx' });
  }
  return { ok: validation.ok, validation, written: targets.map(([p]) => p) };
}

// null on any usage error.
function parse(args) {
  const o = { pos: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i], k = a.slice(2);
    if (['--audit', '--collect', '--run', '--root'].includes(a)) {
      const v = args[++i];
      if (k in o || v === undefined || v.startsWith('-')) return null;
      o[k] = v;
    } else if (a === '--force' || a === '--demo') {
      if (k in o) return null;
      o[k] = true;
    } else if (a.startsWith('-')) return null;
    else o.pos.push(a);
  }
  const { pos, audit, collect: dir, run, force, demo } = o;
  if (audit !== undefined) return dir === undefined && !pos.length && !force && !demo && RUN_ID.test(run ?? '') ? o : null;
  if (dir !== undefined) return !pos.length && !force && RUN_ID.test(run ?? '') ? o : null;
  return pos.length === 2 && run === undefined && !demo && N.test(pos[0]) && ID.test(pos[1]) ? o : null;
}

export function main(args) {
  const o = parse(args);
  if (!o) {
    console.error(USAGE);
    return 2;
  }
  const root = o.root === undefined ? ROOT : resolve(o.root);
  try {
    if (o.audit !== undefined) {
      let text;
      try { text = readFileSync(o.audit, 'utf8'); } catch (e) {
        console.error(`${o.audit}: cannot read: ${e.message}\n${USAGE}`);
        return 2;
      }
      const a = auditLog(text);
      if (!a.ok) {
        for (const v of a.violations) console.error(v);
        console.error('FAIL');
        return 1;
      }
      const dir = join(root, 'agent', 'runs', o.run, a.n);
      const out = join(dir, `${a.id}.files.txt`), st = stat(out);
      // Never replace earlier evidence: an existing files.txt must already hold exactly this list.
      if (st && (!st.isFile() || readFileSync(out, 'utf8') !== filesTxt(a))) throw new StageError(`files.txt exists with different content, not replaced: ${out}`);
      if (!st) {
        mkdirSync(dir, { recursive: true });
        writeFileSync(out, filesTxt(a), { flag: 'wx' });
      }
      console.log(`OK ${a.id} ${a.read.length} files read`);
      return 0;
    }
    if (o.collect !== undefined) {
      const { ok, validation } = collect(o.collect, o.run, { root, demo: !!o.demo });
      const { id } = stageParts(o.collect);
      if (ok) {
        console.log(`OK ${id}`);
        return 0;
      }
      for (const { path, message } of validation.errors) console.error(path ? `${path}: ${message}` : message);
      console.error(`INVALID ${id} (${validation.errors.length} errors)`);
      return 1;
    }
    console.log(stage(o.pos[0], o.pos[1], { root, force: !!o.force }).dir);
    return 0;
  } catch (e) {
    console.error(e.message); // fail closed: any error is a refusal
    return 1;
  }
}

// CLI only when run directly, never on import (as agent/validate.mjs).
const isMain = () => {
  try { return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; }
};
if (isMain()) process.exitCode = main(process.argv.slice(2)); // exitCode, not exit(): lets piped stderr flush

// Blind-run tooling (#33, part): staging allowlist, run log audit, collect, CLI and AGENT-NFR-01.
// Hand-made synthetic fixtures under os.tmpdir() only, removed after each test; every call passes a fixture root,
// so nothing here writes inside the repo. Stark Industries is the buyer; suppliers are SUP-xx ids only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { RUBRIC } from '../app/rubric.js';
import { StageError, auditLog, collect, stage } from './stage.mjs';

const STAGE = fileURLToPath(new URL('./stage.mjs', import.meta.url));
const ID = 'SUP-07';
const S = '/stage/sqc-blind/101/SUP-07'; // lexical stage for the pure audit tests; does not exist
const put = (p, body) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, body); return p; };
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const listing = (dir) => readdirSync(dir, { recursive: true }).sort();
const STAGED = ['RUBRIC.md', 'SKILL.md', 'packet', 'packet/cover_letter.md', 'packet/rfq.md'];

// Fixture repo root with everything a world holds, plus a tmp dir standing in for os.tmpdir().
function world(t) {
  const base = mkdtempSync(join(tmpdir(), 'sqc-stage-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const root = join(base, 'root'), tmp = join(base, 'tmp');
  mkdirSync(tmp);
  put(join(root, 'agent/SKILL.md'), '# Synthetic extraction skill\n');
  put(join(root, 'docs/RUBRIC.md'), '# Synthetic rubric\n');
  put(join(root, 'docs/DATASET.md'), 'never staged\n');
  put(join(root, 'docs/SIMULATION.md'), 'never staged\n');
  const w = join(root, 'data/worlds/101');
  put(join(w, 'packets/SUP-07/rfq.md'), '# Stark Industries RFQ (synthetic)\n');
  put(join(w, 'packets/SUP-07/cover_letter.md'), '# Cover letter to Stark Industries Supplier Quality (synthetic)\n## §1\nCertificate current.\n');
  put(join(w, 'packets/SUP-08/rfq.md'), 'another packet\n');
  put(join(w, 'answer_key.json'), '{}\n');
  put(join(w, 'answer_key.sha256'), '0\n');
  put(join(w, 'facts/SUP-07.json'), '{}\n');
  put(join(w, 'briefs/SUP-07.md'), 'brief\n');
  put(join(w, 'reference/SUP-07.json'), '{}\n');
  return { base, root, tmp, dir: join(tmp, 'sqc-blind', '101', ID) };
}

const cli = (tmp, ...args) => spawnSync(process.execPath, [STAGE, ...args], { encoding: 'utf8', env: { ...process.env, TMPDIR: tmp } });

// stream-json fixtures: the shape confirmed on a real log (see the comment at the top of stage.mjs).
const init = (cwd) => ({ type: 'system', subtype: 'init', cwd, session_id: 'sess-1', tools: ['Read', 'Glob', 'Write'], mcp_servers: [], model: 'synthetic' });
const call = (name, input) => ({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_1', name, input }] }, parent_tool_use_id: null });
const reply = { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'ok' }] }, parent_tool_use_id: null };
const done = { type: 'result', subtype: 'success', is_error: false, result: 'Wrote extraction.json' };
const lines = (...evs) => `${evs.map((e) => (typeof e === 'string' ? e : JSON.stringify(e))).join('\n')}\n`;
const log = (cwd, ...events) => lines(init(cwd), ...events, reply, done);

// Valid cold_plate extraction (as fixture() in validate.test.mjs) citing a file the staged packet holds.
function extraction() {
  const p = RUBRIC.commodities.find((c) => c.key === 'cold_plate');
  const defs = [...RUBRIC.criteria, ...[...p.required, ...p.nice].map((id) => RUBRIC.tests.find((t) => t.id === id))];
  const sample = { bool: true, number: 1, date: '2027-01-01' };
  return {
    schema: 'sqc-extraction/1',
    supplier_id: ID,
    commodity: 'cold_plate',
    run: { run_id: '2026-11-20a', model: 'unknown', skill_sha: 'unknown' },
    criteria: defs.map((d) => ({
      id: d.id, state: 'verified', value: d.type === 'enum' ? Object.keys(d.rule)[0] : sample[d.type], citation: 'cover_letter.md §1', note: null,
    })),
    drafts: {
      rfi_items: ['6.ramp_plan'],
      rfi_email: 'DRAFT — prepared by an agent for SQE review. Not sent.\n\nSubject: Synthetic RFI',
      audit_focus: ['2.ctq_cpk'],
      audit_plan: [{ criterion_id: '2.ctq_cpk', question: 'Walk through the Cpk study for the flatness CTQ.' }],
    },
  };
}

test('stage: exact contents, byte copies, no symlinks, path under <tmp>/sqc-blind/<n>/<id>', (t) => {
  const w = world(t);
  const r = stage('101', ID, { root: w.root, tmp: w.tmp });
  assert.equal(r.dir, w.dir);
  assert.deepEqual(r.files, ['RUBRIC.md', 'SKILL.md', 'packet/cover_letter.md', 'packet/rfq.md']);
  assert.deepEqual(listing(w.dir), STAGED); // answer key, facts, briefs, reference, DATASET.md, other packets: absent
  const src = { 'SKILL.md': 'agent/SKILL.md', 'RUBRIC.md': 'docs/RUBRIC.md', 'packet/rfq.md': 'data/worlds/101/packets/SUP-07/rfq.md',
    'packet/cover_letter.md': 'data/worlds/101/packets/SUP-07/cover_letter.md' };
  for (const [rel, from] of Object.entries(src)) {
    assert.deepEqual(readFileSync(join(w.dir, rel)), readFileSync(join(w.root, from)), rel);
    assert.ok(lstatSync(join(w.dir, rel)).isFile(), rel);
  }
  assert.ok(lstatSync(join(w.dir, 'packet')).isDirectory());
  assert.deepEqual(readdirSync(w.tmp), ['sqc-blind']); // nothing written outside the stage dir
});

test('stage: an existing dir is refused, --force replaces only that dir', (t) => {
  const w = world(t);
  stage('101', ID, { root: w.root, tmp: w.tmp });
  stage('101', 'SUP-08', { root: w.root, tmp: w.tmp });
  put(join(w.dir, 'extraction.json'), '{"stale":true}');
  put(join(w.dir, 'packet/extra.md'), 'leftover');
  assert.throws(() => stage('101', ID, { root: w.root, tmp: w.tmp }), (e) => e instanceof StageError && /staging dir exists: .*--force/.test(e.message));
  assert.equal(readFileSync(join(w.dir, 'extraction.json'), 'utf8'), '{"stale":true}'); // untouched
  stage('101', ID, { root: w.root, tmp: w.tmp, force: true });
  assert.deepEqual(listing(w.dir), STAGED);
  assert.deepEqual(listing(join(w.tmp, 'sqc-blind/101/SUP-08')), ['RUBRIC.md', 'SKILL.md', 'packet', 'packet/rfq.md']); // sibling survives

  // The stage path is a symlink into the repo: refused as existing, removed as a link, never followed.
  rmSync(w.dir, { recursive: true });
  symlinkSync(join(w.root, 'docs'), w.dir);
  assert.throws(() => stage('101', ID, { root: w.root, tmp: w.tmp }), /staging dir exists/);
  stage('101', ID, { root: w.root, tmp: w.tmp, force: true });
  assert.ok(lstatSync(w.dir).isDirectory());
  assert.deepEqual(readdirSync(join(w.root, 'docs')).sort(), ['DATASET.md', 'RUBRIC.md', 'SIMULATION.md']);
});

test('stage: a symlinked parent under <tmp>/sqc-blind is refused', (t) => {
  const w = world(t);
  mkdirSync(join(w.base, 'elsewhere'));
  symlinkSync(join(w.base, 'elsewhere'), join(w.tmp, 'sqc-blind'));
  assert.throws(() => stage('101', ID, { root: w.root, tmp: w.tmp }), /not a real directory/);
  assert.deepEqual(readdirSync(join(w.base, 'elsewhere')), []);
});

test('stage: a symlinked <n> dir is refused even with --force; symlinked SKILL.md/RUBRIC.md are refused', (t) => {
  const w = world(t);
  put(join(w.base, 'elsewhere/SUP-07/canary.txt'), 'alive');
  mkdirSync(join(w.tmp, 'sqc-blind'));
  symlinkSync(join(w.base, 'elsewhere'), join(w.tmp, 'sqc-blind/101'));
  assert.throws(() => stage('101', ID, { root: w.root, tmp: w.tmp, force: true }), /not a real directory: .*sqc-blind\/101$/);
  assert.deepEqual(listing(join(w.base, 'elsewhere')), ['SUP-07', 'SUP-07/canary.txt']); // link target untouched
  rmSync(join(w.tmp, 'sqc-blind'), { recursive: true });
  for (const rel of ['agent/SKILL.md', 'docs/RUBRIC.md']) {
    const p = join(w.root, rel), keep = readFileSync(p);
    rmSync(p);
    symlinkSync(join(w.root, 'data/worlds/101/answer_key.json'), p);
    assert.throws(() => stage('101', ID, { root: w.root, tmp: w.tmp }), (e) => e instanceof StageError && e.message === `not a regular file: ${p}`, rel);
    rmSync(p);
    writeFileSync(p, keep);
  }
  assert.equal(existsSync(join(w.tmp, 'sqc-blind')), false);
});

test('stage: missing packet dir, nothing created', (t) => {
  const w = world(t);
  assert.throws(() => stage('102', ID, { root: w.root, tmp: w.tmp }), (e) => e instanceof StageError && /^packet not found: /.test(e.message));
  put(join(w.root, 'data/worlds/103/packets/SUP-07'), 'a file, not a dir');
  assert.throws(() => stage('103', ID, { root: w.root, tmp: w.tmp }), /packet not found/);
  assert.equal(existsSync(join(w.tmp, 'sqc-blind')), false);
});

test('stage: every non-allowlisted packet entry is rejected and named, nothing created', (t) => {
  const w = world(t);
  const cases = {
    sub: (p) => put(join(p, 'sub/rfq.md'), 'x'),
    'link.md': (p) => symlinkSync(join(w.root, 'docs/RUBRIC.md'), join(p, 'link.md')),
    docs_link: (p) => symlinkSync(join(w.root, 'docs'), join(p, 'docs_link')),
    'dangling.md': (p) => symlinkSync(join(w.base, 'nope.md'), join(p, 'dangling.md')),
    'answer_key.json': (p) => put(join(p, 'answer_key.json'), '{}'),
    '.DS_Store': (p) => put(join(p, '.DS_Store'), 'x'),
    'README.MD': (p) => put(join(p, 'README.MD'), 'x'),
    'notes.txt': (p) => put(join(p, 'notes.txt'), 'x'),
  };
  let n = 200;
  for (const [name, make] of Object.entries(cases)) {
    const p = join(w.root, `data/worlds/${++n}/packets/SUP-07`);
    put(join(p, 'rfq.md'), 'ok');
    make(p);
    assert.throws(() => stage(String(n), ID, { root: w.root, tmp: w.tmp }),
      (e) => e instanceof StageError && e.message.includes(`not allowed`) && e.message.includes(join(p, name)), name);
  }
  const all = join(w.root, 'data/worlds/300/packets/SUP-07');
  put(join(all, 'rfq.md'), 'ok');
  for (const make of Object.values(cases)) make(all);
  assert.throws(() => stage('300', ID, { root: w.root, tmp: w.tmp }), (e) => {
    for (const name of Object.keys(cases)) assert.ok(e.message.includes(join(all, name)), name);
    return e.message.split('\n').length === Object.keys(cases).length;
  });
  mkdirSync(join(w.root, 'data/worlds/301/packets/SUP-07'), { recursive: true });
  assert.throws(() => stage('301', ID, { root: w.root, tmp: w.tmp }), /packet is empty/);
  assert.equal(existsSync(join(w.tmp, 'sqc-blind')), false);
});

test('CLI: bad args exit 2 and create nothing', (t) => {
  const w = world(t);
  const f = put(join(w.base, 'run.jsonl'), log(w.dir));
  const bad = [[], ['01', ID], ['-1', ID], ['1/..', ID], ['abc', ID], ['101', 'SUP-7'], ['101', 'sup-07'], ['101', 'SUP-07/../x'],
    ['101'], ['101', ID, 'extra'], ['101', ID, '--bogus'], ['101', ID, '--run', 'r1'], ['101', ID, '--demo'],
    ['--audit', f], ['--audit', f, '--run'], ['--audit', f, '--run', '../x'], ['--audit', f, '--run', 'a/b'], ['--audit', f, '--run', '.x'],
    ['--audit', f, '--run', 'r1', '--force'], ['--audit', f, '--run', 'r1', '--run', 'r2'], ['--audit', f, '--collect', w.dir, '--run', 'r1'],
    ['--collect', w.dir], ['--collect', w.dir, '--run', 'r1', 'x'], ['--audit', join(w.base, 'nope.jsonl'), '--run', 'r1']];
  for (const args of bad) {
    const r = cli(w.tmp, ...args, '--root', w.root);
    assert.equal(r.status, 2, `${args.join(' ')}: ${r.stderr}`);
    assert.match(r.stderr, /usage: node agent\/stage\.mjs/, args.join(' '));
  }
  assert.equal(existsSync(join(w.tmp, 'sqc-blind')), false);
  assert.equal(existsSync(join(w.root, 'agent/runs')), false);
});

test('audit pass: files.txt lists Read paths only, relative, sorted, unique; empty reads give an empty file', (t) => {
  const w = world(t);
  stage('101', ID, { root: w.root, tmp: w.tmp });
  const real = realpathSync(w.dir); // macOS: /var -> /private/var, the second root
  const f = put(join(w.dir, 'run.jsonl'), log(w.dir,
    call('Glob', { pattern: '**/*.md' }), reply,
    call('Read', { file_path: './packet/rfq.md' }),
    call('Read', { file_path: join(w.dir, 'packet/cover_letter.md') }),
    call('Read', { file_path: 'SKILL.md' }),
    call('Read', { file_path: 'packet/rfq.md' }),
    call('Read', { file_path: join(real, 'RUBRIC.md') }),
    call('Read', { file_path: 'packet/../SKILL.md' }),
    call('Read', { file_path: join(w.dir, 'run.jsonl') }),
    call('Glob', { pattern: '*.md', path: 'packet' }),
    call('Write', { file_path: 'extraction.json', content: '{}' })));
  const r = cli(w.tmp, '--audit', f, '--run', '2026-11-20a', '--root', w.root);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, 'OK SUP-07 5 files read\n');
  const out = join(w.root, 'agent/runs/2026-11-20a/101/SUP-07.files.txt');
  assert.equal(readFileSync(out, 'utf8'), 'RUBRIC.md\nSKILL.md\npacket/cover_letter.md\npacket/rfq.md\nrun.jsonl\n');
  assert.equal(cli(w.tmp, '--audit', f, '--run', '2026-11-20a', '--root', w.root).status, 0); // re-audit: same bytes
  assert.equal(readFileSync(out, 'utf8'), 'RUBRIC.md\nSKILL.md\npacket/cover_letter.md\npacket/rfq.md\nrun.jsonl\n');

  const g = put(join(w.base, 'noreads.jsonl'), log(w.dir, call('Write', { file_path: 'extraction.json', content: '{}' })));
  assert.equal(cli(w.tmp, '--audit', g, '--run', 'r2', '--root', w.root).stdout, 'OK SUP-07 0 files read\n');
  assert.equal(readFileSync(join(w.root, 'agent/runs/r2/101/SUP-07.files.txt'), 'utf8'), '');
});

// Each log must exit 1 with FAIL, name the problem on stderr, and write no files.txt.
function auditFails(w, text, re, label) {
  const f = put(join(w.base, 'bad.jsonl'), text);
  const r = cli(w.tmp, '--audit', f, '--run', 'r1', '--root', w.root);
  assert.equal(r.status, 1, `${label}: ${r.stdout}${r.stderr}`);
  assert.match(r.stderr, re, label);
  assert.match(r.stderr, /^FAIL$/m, label);
  assert.equal(r.stdout, '', label);
  assert.equal(existsSync(join(w.root, 'agent/runs')), false, label);
}

test('audit fail: every escape form exits 1 and names the call', (t) => {
  const w = world(t);
  const D = w.dir;
  const cases = [
    ['Read', { file_path: '/etc/passwd' }], ['Read', { file_path: '../x' }], ['Read', { file_path: 'packet/../../x' }],
    ['Read', { file_path: '~/x' }], ['Read', { file_path: `${D}-evil/x` }], ['Read', { file_path: `${D}/../SUP-08/rfq.md` }],
    ['Write', { file_path: '/tmp/x', content: '{}' }],
    ['Glob', { pattern: '../**' }], ['Glob', { pattern: '/**' }], ['Glob', { pattern: '**/../..' }], ['Glob', { pattern: '{..,a}' }],
    ['Glob', { pattern: '*.md', path: '/etc' }],
  ];
  for (const [tool, input] of cases) {
    const value = JSON.stringify(input.file_path ?? input.path ?? input.pattern);
    const re = new RegExp(`^line 3: ${tool} \\w+ ${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: `, 'm');
    auditFails(w, log(D, call('Read', { file_path: 'SKILL.md' }), call(tool, input)), re, `${tool} ${value}`);
  }
  // every violation is reported, not just the first
  auditFails(w, log(D, call('Read', { file_path: '/etc/passwd' }), call('Bash', { command: 'ls' })), /line 2: .*\n.*line 3: /, 'two');
});

test('audit pass: the real headless log shapes (issue 33 smoke test, Claude Code 2.1.322)', (t) => {
  const w = world(t);
  const D = w.dir;
  // Shapes copied from a real stream-json log: init lists exactly the three tools and no MCP server; a usage meter
  // line and a thinking-token line sit between the tool calls.
  const realInit = { ...init(D), tools: ['Glob', 'Read', 'Write'], mcp_servers: [], model: 'claude-haiku-5-5' };
  const meter = { type: 'rate_limit_event', rate_limit_info: { status: 'allowed', rateLimitType: 'five_hour' }, uuid: 'u', session_id: 's' };
  const thinking = { type: 'system', subtype: 'thinking_tokens', estimated_tokens: 50, session_id: 's' };
  const a = auditLog(lines(realInit, thinking, call('Read', { file_path: join(D, 'SKILL.md') }), meter, reply, done));
  assert.deepEqual([a.ok, a.read, a.violations], [true, ['SKILL.md'], []]);
});

test('audit fail: tools outside Read, Glob, Write fail even with no path', (t) => {
  const w = world(t);
  for (const tool of ['Bash', 'Grep', 'Edit', 'WebFetch', 'Agent', 'Task', 'NotebookEdit', 'mcp__x__y', 'read', 'READ', 'glob', 'write']) {
    auditFails(w, log(w.dir, call(tool, {})), new RegExp(`^line 2: tool "${tool}" not allowed`, 'm'), tool);
  }
});

test('audit fail closed: anything the parser does not understand fails', (t) => {
  const w = world(t);
  const D = w.dir;
  const read = call('Read', { file_path: 'SKILL.md' });
  const cases = [
    ['garbage line', log(D, 'not json'), /line 2: not valid JSON/],
    ['non-object line', log(D, '[1,2]'), /line 2: not a JSON object/],
    ['no type', log(D, { message: {} }), /line 2: not a JSON object with a string type/],
    ['unknown type', log(D, { type: 'telemetry' }), /unknown event type "telemetry"/],
    ['stream_event', log(D, { type: 'stream_event', event: {} }), /unknown event type "stream_event"/],
    ['missing init', lines(read, done), /no system init event/],
    ['init without cwd', lines({ type: 'system', subtype: 'init' }, read, done), /init cwd undefined/],
    ['relative cwd', lines(init('sqc-blind/101/SUP-07'), done), /expected an absolute path/],
    ['cwd not a stage', lines(init('/work/repo'), done), /not a staging dir/],
    ['cwd wrong id', lines(init('/t/sqc-blind/101/SUP-7'), done), /not a staging dir/],
    ['cwd parent not sqc-blind', lines(init('/t/other/101/SUP-07'), done), /not a staging dir/],
    ['two inits', lines(init(D), init(D), done), /exactly once/],
    ['assistant text before init', lines({ type: 'assistant', message: { content: [{ type: 'text', text: 'hi' }] } }, init(D), done), /line 2: init event must come exactly once/],
    ['assistant before init', lines(read, init(D), done), /line 1: Read: tool call without a valid init/],
    ['content not an array', log(D, { type: 'assistant', message: { content: 'Read SKILL.md' } }), /message\.content is not an array/],
    ['message missing', log(D, { type: 'assistant' }), /message\.content is not an array/],
    ['block without type', log(D, { type: 'assistant', message: { content: [{ name: 'Read' }] } }), /content block without a string type/],
    ['tool_use without name', log(D, call(undefined, { file_path: 'SKILL.md' })), /tool_use name undefined/],
    ['non-object input', log(D, call('Read', 'SKILL.md')), /Read input "SKILL.md": expected an object/],
    ['Read without file_path', log(D, call('Read', {})), /Read file_path undefined: expected a non-empty string/],
    ['Read empty file_path', log(D, call('Read', { file_path: '' })), /Read file_path "": expected a non-empty string/],
    ['Write without file_path', log(D, call('Write', { content: 'x' })), /Write file_path undefined/],
    ['Glob without pattern', log(D, call('Glob', {})), /Glob pattern undefined/],
    ['Glob path not a string', log(D, call('Glob', { pattern: '*', path: null })), /Glob path null: expected a string/],
    ['missing result', lines(init(D), read), /no result event/],
    ['empty log', '', /no system init event/],
    ['blank-only log', '\n\n  \n', /no system init event/],
  ];
  // The init's own tool list and MCP servers (issue 33 smoke test): a session that could have used more fails.
  const initWith = (extra) => ({ ...init(D), ...extra });
  cases.push(
    ['init offers Bash', lines(initWith({ tools: ['Read', 'Glob', 'Write', 'Bash'] }), done), /init tools .*only Read, Glob, Write/],
    ['init tools not an array', lines(initWith({ tools: 'Read' }), done), /init tools "Read"/],
    ['init has an MCP server', lines(initWith({ mcp_servers: [{ name: 'x', status: 'connected' }] }), done), /init mcp_servers .*expected none/],
    ['init without tools', lines(initWith({ tools: undefined }), done), /init tools undefined/],
    ['init without mcp_servers', lines(initWith({ mcp_servers: undefined }), done), /init mcp_servers undefined/],
    ['meter line but no result', lines(init(D), { type: 'rate_limit_event', rate_limit_info: { status: 'rejected' } }), /no result event/],
    ['rate_limit_event with a message', log(D, { type: 'rate_limit_event', message: { content: [] } }), /rate_limit_event with a message/],
  );
  for (const [label, text, re] of cases) auditFails(w, text, re, label);
  // blank lines alone are skipped
  assert.equal(auditLog(`\n${log(D, read).replace(/\n/g, '\n\n')}`).ok, true);
});

test('auditLog judgement table (pure)', () => {
  const judge = (tool, input) => auditLog(log(S, call(tool, input)));
  const pass = [
    ['Read', { file_path: './packet/x.md' }, ['packet/x.md']], ['Read', { file_path: `${S}/packet/x.md` }, ['packet/x.md']],
    ['Read', { file_path: 'packet/../SKILL.md' }, ['SKILL.md']], ['Read', { file_path: `${S}/run.jsonl` }, ['run.jsonl']],
    ['Read', { file_path: `${S}/` }, ['.']],
    ['Write', { file_path: 'extraction.json' }, []], ['Write', { file_path: `${S}/extraction.json` }, []], ['Write', { file_path: './extraction.json' }, []],
    ['Glob', { pattern: 'packet/**' }, []], ['Glob', { pattern: 'packet/**/*.md' }, []], ['Glob', { pattern: './packet/*.md' }, []],
    ['Glob', { pattern: '**/*.md' }, []], ['Glob', { pattern: 'packet/*.md' }, []], ['Glob', { pattern: '*.md', path: 'packet' }, []],
    ['Glob', { pattern: `${S}/packet/*.md` }, []], ['Glob', { pattern: '*', path: S }, []], ['Glob', { pattern: 'packet/rfq.md' }, []],
  ];
  for (const [tool, input, read] of pass) {
    const a = judge(tool, input);
    assert.deepEqual([a.ok, a.read, a.violations], [true, read, []], `${tool} ${JSON.stringify(input)}`);
  }
  const fail = [
    ['Read', { file_path: '/etc/passwd' }], ['Read', { file_path: '../x' }], ['Read', { file_path: 'packet/../../x' }],
    ['Read', { file_path: '~/x' }], ['Read', { file_path: '~' }], ['Read', { file_path: `${S}-evil/x` }],
    ['Read', { file_path: `${S}/../SUP-08/x` }], ['Read', { file_path: '/stage/sqc-blind/101' }], ['Read', { file_path: 'a\0b' }],
    ['Read', { file_path: 'packet/a\nb.md' }], ['Read', { file_path: 7 }],
    ['Write', { file_path: '/tmp/x' }], ['Write', { file_path: '../extraction.json' }],
    // the session may write its one output and nothing else: a write into the stage would change the hashed inputs
    ['Write', { file_path: 'packet/x.md' }], ['Write', { file_path: 'SKILL.md' }], ['Write', { file_path: 'run.jsonl' }], ['Write', { file_path: 'packet/extraction.json' }], ['Write', { file_path: 'EXTRACTION.JSON' }],
    // forms that build .. or an absolute path under some glob engine; the charset allowlist fails them all (and a harmless brace)
    ['Glob', { pattern: '[.][.]/*' }], ['Glob', { pattern: '\\.\\./*' }], ['Glob', { pattern: '\\/etc/hosts' }], ['Glob', { pattern: '{x,\\/etc}/hosts' }],
    ['Glob', { pattern: '{.,x}./*' }], ['Glob', { pattern: '.{.,x}/*' }], ['Glob', { pattern: '{.,}./*' }], ['Glob', { pattern: '*.{md,txt}' }], ['Glob', { pattern: 'packet/?.md' }], ['Glob', { pattern: '--follow' }], ['Glob', { pattern: '-L' }],
    ['Glob', { pattern: '../**' }], ['Glob', { pattern: '/**' }], ['Glob', { pattern: '**/../..' }], ['Glob', { pattern: '{..,a}' }],
    ['Glob', { pattern: '/etc/*' }], ['Glob', { pattern: '/etc/passwd' }], ['Glob', { pattern: '~/x' }], ['Glob', { pattern: '{/etc,packet}/*' }],
    ['Glob', { pattern: '@(/etc|x)/*' }], ['Glob', { pattern: '' }],
    ['Glob', { pattern: '~*/x' }], ['Glob', { pattern: '*\0x' }], // leading ~ / NUL after the literal prefix

    ['Glob', { pattern: '*', path: '/etc' }], ['Glob', { pattern: '*', path: '..' }], ['Glob', { pattern: '*', path: `${S}-evil` }],
    ['Glob', { pattern: '*', path: '~' }],
  ];
  for (const [tool, input] of fail) {
    const a = judge(tool, input);
    assert.equal(a.ok, false, `${tool} ${JSON.stringify(input)}`);
    assert.deepEqual(a.read, [], `${tool} ${JSON.stringify(input)}`);
    assert.equal(a.violations.length, 1, `${tool} ${JSON.stringify(input)}: ${a.violations}`);
  }
  const a = auditLog(log(S, call('Read', { file_path: 'SKILL.md' })));
  assert.deepEqual([a.stage, a.n, a.id], [S, '101', 'SUP-07']);
  // subagent calls (parent_tool_use_id set) are judged too
  const sub = { ...call('Read', { file_path: '/etc/passwd' }), parent_tool_use_id: 'toolu_9' };
  assert.equal(auditLog(log(S, sub)).ok, false);
  // a tool call the parser would otherwise skip: unknown block types, and tool_use outside an assistant event
  const block = (b) => ({ type: 'assistant', message: { role: 'assistant', content: [b] } });
  for (const type of ['server_tool_use', 'mcp_tool_use', 'web_search_tool_result', 'image']) {
    assert.match(auditLog(log(S, block({ type, name: 'web_search', input: {} }))).violations.join(), /unknown content block type/, type);
  }
  for (const type of ['text', 'thinking', 'redacted_thinking']) assert.equal(auditLog(log(S, block({ type }))).ok, true, type);
  const hidden = { type: 'user', message: { role: 'user', content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/etc/passwd' } }] } };
  assert.match(auditLog(log(S, hidden)).violations.join(), /tool_use block in a user event/);
  const hidden2 = { type: 'user', message: { role: 'user', content: [{ type: 'server_tool_use', name: 'web_search', input: {} }] } };
  assert.match(auditLog(log(S, hidden2)).violations.join(), /tool_use block in a user event/);
});

// Staged, run and audited: run.jsonl and extraction.json (none when x is null) in the stage, files.txt in agent/runs/<runId>/101/.
function ready(t, x = extraction()) {
  const w = world(t);
  stage('101', ID, { root: w.root, tmp: w.tmp });
  put(join(w.dir, 'run.jsonl'), log(w.dir, call('Read', { file_path: 'SKILL.md' })));
  if (x !== null) put(join(w.dir, 'extraction.json'), typeof x === 'string' ? x : JSON.stringify(x, null, 2));
  const audited = (runId) => put(join(w.root, 'agent/runs', runId, '101', `${ID}.files.txt`), 'SKILL.md\n');
  const out = (runId, ext) => join(w.root, 'agent/runs', runId, '101', `${ID}${ext}`);
  return { ...w, audited, out };
}

test('collect valid: byte copies, inputs hashes, validation, no data/ copy without --demo', (t) => {
  const w = ready(t);
  w.audited('r1');
  const r = collect(w.dir, 'r1', { root: w.root });
  assert.equal(r.ok, true);
  assert.deepEqual(r.validation, { ok: true, errors: [] });
  assert.deepEqual(readFileSync(w.out('r1', '.json')), readFileSync(join(w.dir, 'extraction.json')));
  assert.deepEqual(readFileSync(w.out('r1', '.run.jsonl')), readFileSync(join(w.dir, 'run.jsonl')));
  const inputs = ['RUBRIC.md', 'SKILL.md', 'packet/cover_letter.md', 'packet/rfq.md'].map((rel) => `${sha(join(w.dir, rel))}  ${rel}\n`).join('');
  assert.equal(readFileSync(w.out('r1', '.inputs.txt'), 'utf8'), inputs);
  assert.deepEqual(JSON.parse(readFileSync(w.out('r1', '.validation.json'), 'utf8')), { ok: true, errors: [] });
  assert.deepEqual(r.written.sort(), ['.inputs.txt', '.json', '.run.jsonl', '.validation.json'].map((e) => w.out('r1', e)).sort());
  assert.equal(existsSync(join(w.root, 'data/extracted')), false);
});

test('collect: a citation to a file not in the packet fails validation (packetFiles is passed)', (t) => {
  const x = extraction();
  x.criteria[0].citation = 'ghost.md §1';
  const w = ready(t, x);
  put(join(w.dir, 'scratch.txt'), 'written by the session');
  w.audited('r2');
  const r = cli(w.tmp, '--collect', w.dir, '--run', 'r2', '--demo', '--root', w.root);
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /^criteria\[0\]\.citation: .*cited file not in packet: ghost\.md$/m);
  assert.match(r.stderr, /^INVALID SUP-07 \(1 errors\)$/m);
  assert.deepEqual(readFileSync(w.out('r2', '.json')), readFileSync(join(w.dir, 'extraction.json')));
  assert.equal(JSON.parse(readFileSync(w.out('r2', '.validation.json'), 'utf8')).ok, false);
  assert.match(readFileSync(w.out('r2', '.inputs.txt'), 'utf8'), /^[0-9a-f]{64} {2}scratch\.txt$/m); // extra file still listed
  assert.equal(existsSync(join(w.root, 'data/extracted')), false);
});

test('collect invalid, missing and malformed extraction: evidence written, exit 1, no app copy even with --demo', (t) => {
  const bad = extraction();
  bad.schema = 'x';
  const cases = [
    [bad, /^schema: expected "sqc-extraction\/1"/m, true],
    [null, /^extraction\.json missing$/m, false],
    ['{ not json', /^not valid JSON: /m, true],
  ];
  for (const [x, re, copied] of cases) {
    const w = ready(t, x);
    w.audited('r3');
    const r = cli(w.tmp, '--collect', w.dir, '--run', 'r3', '--demo', '--root', w.root);
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, re);
    assert.match(r.stderr, /^INVALID SUP-07 \(1 errors\)$/m);
    assert.equal(existsSync(w.out('r3', '.json')), copied);
    if (copied) assert.deepEqual(readFileSync(w.out('r3', '.json')), readFileSync(join(w.dir, 'extraction.json')));
    for (const ext of ['.run.jsonl', '.inputs.txt']) assert.ok(existsSync(w.out('r3', ext)), ext);
    const v = JSON.parse(readFileSync(w.out('r3', '.validation.json'), 'utf8'));
    assert.equal(v.ok, false);
    assert.equal(v.errors.length, 1);
    assert.equal(existsSync(join(w.root, 'data/extracted')), false);
    // a missing extraction collected once is not collected again either
    assert.equal(cli(w.tmp, '--collect', w.dir, '--run', 'r3', '--root', w.root).status, 1);
  }
});

test('collect: --demo copies a valid extraction to data/extracted; refusals write nothing', (t) => {
  const w = ready(t);
  w.audited('r4');
  const r = collect(w.dir, 'r4', { root: w.root, demo: true });
  assert.equal(r.ok, true);
  assert.deepEqual(readFileSync(join(w.root, 'data/extracted/SUP-07.json')), readFileSync(join(w.dir, 'extraction.json')));

  // already collected: refused, nothing overwritten
  const before = readFileSync(w.out('r4', '.json'));
  put(join(w.dir, 'extraction.json'), '{"changed":true}');
  assert.throws(() => collect(w.dir, 'r4', { root: w.root }), (e) => e instanceof StageError && /already collected/.test(e.message));
  assert.deepEqual(readFileSync(w.out('r4', '.json')), before);

  // not audited
  assert.throws(() => collect(w.dir, 'r5', { root: w.root }), /run not audited/);
  assert.equal(existsSync(join(w.root, 'agent/runs/r5')), false);

  // missing run.jsonl
  w.audited('r6');
  rmSync(join(w.dir, 'run.jsonl'));
  assert.throws(() => collect(w.dir, 'r6', { root: w.root }), /run\.jsonl missing/);
  assert.deepEqual(readdirSync(join(w.root, 'agent/runs/r6/101')), [`${ID}.files.txt`]);

  // not a staging dir
  assert.throws(() => collect(w.root, 'r6', { root: w.root }), /not a staging dir/);
});

test('collect never follows symlinks: any link in the stage is refused, a linked run.jsonl is refused', (t) => {
  const w = ready(t, null);
  symlinkSync(put(join(w.base, 'outside.json'), JSON.stringify(extraction())), join(w.dir, 'extraction.json'));
  symlinkSync(join(w.root, 'data/worlds/101/answer_key.json'), join(w.dir, 'packet/key.md'));
  w.audited('r7');
  // stage left no links and the session cannot make one, so any link means the stage was changed: refuse, write nothing
  assert.throws(() => collect(w.dir, 'r7', { root: w.root, demo: true }), /not a regular file in the stage: .*extraction\.json\n.*packet\/key\.md/);
  assert.deepEqual(readdirSync(join(w.root, 'agent/runs/r7/101')), [`${ID}.files.txt`]);
  assert.equal(existsSync(join(w.root, 'data/extracted')), false);

  w.audited('r8');
  rmSync(join(w.dir, 'run.jsonl'));
  symlinkSync(put(join(w.base, 'outside.jsonl'), '{}\n'), join(w.dir, 'run.jsonl'));
  assert.throws(() => collect(w.dir, 'r8', { root: w.root }), /run\.jsonl missing: /);
  assert.deepEqual(readdirSync(join(w.root, 'agent/runs/r8/101')), [`${ID}.files.txt`]);
});

test('stage.mjs imports only node: built-ins and ./validate.mjs (AGENT-NFR-01)', () => {
  const src = readFileSync(STAGE, 'utf8');
  const specs = [...src.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]);
  assert.ok(specs.length > 0);
  for (const s of specs) assert.ok(s.startsWith('node:') || s === './validate.mjs', s);
  assert.doesNotMatch(src, /\bimport\(/);
  assert.doesNotMatch(src, /child_process|\bspawn|\bexec/);
});

test('CLI end to end: stage, audit, collect; import does not run main', (t) => {
  const w = world(t);
  let r = cli(w.tmp, '101', ID, '--root', w.root);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, `${w.dir}\n`);
  r = cli(w.tmp, '101', ID, '--root', w.root);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^staging dir exists: .*\(use --force to replace\)$/m);
  r = cli(w.tmp, '101', ID, '--force', '--root', w.root);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(cli(w.tmp, '102', ID, '--root', w.root).status, 1);

  const f = put(join(w.dir, 'run.jsonl'), log(w.dir, call('Read', { file_path: 'SKILL.md' }), call('Read', { file_path: 'packet/rfq.md' }),
    call('Write', { file_path: 'extraction.json', content: '{}' })));
  put(join(w.dir, 'extraction.json'), JSON.stringify(extraction()));
  r = cli(w.tmp, '--collect', w.dir, '--run', 'r1', '--root', w.root);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^run not audited: /m);
  r = cli(w.tmp, '--audit', f, '--run', 'r1', '--root', w.root);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, 'OK SUP-07 2 files read\n');
  r = cli(w.tmp, '--collect', w.dir, '--run', 'r1', '--demo', '--root', w.root);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, 'OK SUP-07\n');
  assert.ok(existsSync(join(w.root, 'data/extracted/SUP-07.json')));
  r = cli(w.tmp, '--collect', w.dir, '--run', 'r1', '--root', w.root);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^already collected, not replaced: /m);

  const imp = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(pathToFileURL(STAGE).href)});`], { encoding: 'utf8' });
  assert.deepEqual([imp.status, imp.stdout, imp.stderr], [0, '', '']);
});

test('collect re-audits the log it files: an escaping or different log is refused and nothing is written', (t) => {
  const w = ready(t);
  w.audited('r9'); // files.txt from a clean log audited elsewhere
  const only = () => assert.deepEqual(readdirSync(join(w.root, 'agent/runs/r9/101')), [`${ID}.files.txt`]);
  put(join(w.dir, 'run.jsonl'), log(w.dir, call('Read', { file_path: join(w.root, 'data/worlds/101/answer_key.json') })));
  assert.throws(() => collect(w.dir, 'r9', { root: w.root, demo: true }), /run\.jsonl fails the audit or names another stage/);
  only();
  // a clean log that read something else than the audited one
  put(join(w.dir, 'run.jsonl'), log(w.dir, call('Read', { file_path: 'RUBRIC.md' })));
  assert.throws(() => collect(w.dir, 'r9', { root: w.root }), /files\.txt does not match run\.jsonl/);
  only();
  // a clean log from another stage
  // a clean log from another stage with the same <n>/<id>: only the stage comparison can refuse it
  put(join(w.dir, 'run.jsonl'), log(join(w.base, 'other', 'sqc-blind', '101', ID), call('Read', { file_path: 'SKILL.md' })));
  assert.throws(() => collect(w.dir, 'r9', { root: w.root }), /names another stage/);
  only();
  assert.equal(existsSync(join(w.root, 'data/extracted')), false);
  // the same stage named by its physical path (/var vs /private/var on macOS) is the same stage
  put(join(w.dir, 'run.jsonl'), log(realpathSync(w.dir), call('Read', { file_path: 'SKILL.md' })));
  assert.equal(collect(w.dir, 'r9', { root: w.root }).ok, true);
});

test('audit never replaces an earlier files.txt with a different list; the same log again is fine', (t) => {
  const w = world(t);
  const a = put(join(w.base, 'a.jsonl'), log(w.dir, call('Read', { file_path: 'SKILL.md' })));
  const b = put(join(w.base, 'b.jsonl'), log(w.dir, call('Read', { file_path: 'RUBRIC.md' })));
  const out = join(w.root, 'agent/runs/r1/101', `${ID}.files.txt`);
  const audit = (file) => cli(w.tmp, '--audit', file, '--run', 'r1', '--root', w.root);
  assert.equal(audit(a).status, 0);
  assert.equal(audit(a).status, 0);
  const r = audit(b);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /files\.txt exists with different content, not replaced/);
  assert.equal(readFileSync(out, 'utf8'), 'SKILL.md\n');
});

test('audit: a stage path that is a symlink to elsewhere is not a root', (t) => {
  const w = world(t);
  const target = join(w.root, 'data/worlds/101');
  mkdirSync(dirname(w.dir), { recursive: true });
  symlinkSync(target, w.dir);
  const a = auditLog(log(w.dir, call('Read', { file_path: join(realpathSync(target), 'answer_key.json') })));
  assert.equal(a.ok, false);
  assert.match(a.violations.join('\n'), /init cwd .*not a real directory/);
  assert.deepEqual(a.read, []);
  // a symlinked <n>: the cwd is a real directory, but its realpath is not .../sqc-blind/<n>/<id>, so it is no second root
  rmSync(dirname(w.dir), { recursive: true });
  const elsewhere = realpathSync(put(join(w.base, 'elsewhere', ID, 'answer_key.json'), '{}\n'));
  symlinkSync(dirname(dirname(elsewhere)), dirname(w.dir));
  const b = auditLog(log(w.dir, call('Read', { file_path: elsewhere })));
  assert.equal(b.ok, false);
  assert.match(b.violations.join('\n'), /Read file_path .*outside the staging dir/);
});

test('stage: a relative temp dir or one inside the repo is refused, nothing created', (t) => {
  const w = world(t);
  assert.throws(() => stage('101', ID, { root: w.root, tmp: 'sqc-rel-tmp-test' }), /temp dir must be absolute/);
  assert.throws(() => stage('101', ID, { root: w.root, tmp: join(w.root, 'scratch') }), /staging area inside the repo/);
  assert.throws(() => stage('101', ID, { root: w.root, tmp: w.root }), /staging area inside the repo/);
  assert.equal(existsSync(join(w.root, 'scratch')), false);
  assert.equal(existsSync(join(w.root, 'sqc-blind')), false);
  assert.equal(existsSync('sqc-rel-tmp-test'), false);
  // a temp dir that is a link into the repo is inside the repo
  mkdirSync(join(w.root, 'inside'));
  symlinkSync(join(w.root, 'inside'), join(w.base, 'lnk'));
  assert.throws(() => stage('101', ID, { root: w.root, tmp: join(w.base, 'lnk') }), /staging area inside the repo/);
  assert.deepEqual(readdirSync(join(w.root, 'inside')), []);
});

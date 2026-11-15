import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, writeFile, rm, symlink, rename, mkdir, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { writePacket, WRITER_PROMPT, writerReadProfile, executeWriterCommand } from './write-packet.mjs';
import { writeCandidateFacts } from './candidate.mjs';
import { BANNER } from './brief.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
async function runFixture(mode = 'ok') {
  const root = await mkdtemp(join(tmpdir(), 'sqc-runner-test-'));
  const world = join(root, 'world');
  await writeCandidateFacts(101, join(world, 'facts'));
  const authenticationDirectory = join(root, 'synthetic-auth');
  await mkdir(authenticationDirectory);
  await writeFile(join(authenticationDirectory, 'auth.json'), JSON.stringify({ synthetic_test_auth: true }));
  const calls = [];
  const runCommand = async (command, args, options) => {
    calls.push({ command, args, options });
    if (args.includes('--version')) return { stdout: 'codex-cli test-version\n' };
    if (args.includes('/bin/cat')) {
      if (args.at(-1) === 'brief.md') return { stdout: await readFile(join(options.cwd, 'brief.md'), 'utf8') };
      if (mode === 'world-isolation' && args.at(-1).endsWith('SUP-01.json')) return { stdout: 'private world facts' };
      if (mode === 'isolation') return { stdout: 'private repo' };
      throw Object.assign(new Error('denied'), { stderr: 'Operation not permitted' });
    }
    assert.deepEqual(await readdir(options.cwd), ['brief.md']);
    assert.equal(args.at(-1), WRITER_PROMPT);
    for (const flag of ['exec', '--ephemeral', '--ignore-rules', '--ignore-user-config', '--skip-git-repo-check', 'danger-full-access']) assert.ok(args.includes(flag));
    assert.equal(options.env.CODEX_HOME.startsWith(options.cwd), false);
    assert.deepEqual(await readdir(options.env.CODEX_HOME), ['auth.json']);
    assert.deepEqual(JSON.parse(await readFile(join(options.env.CODEX_HOME, 'auth.json'), 'utf8')), { synthetic_test_auth: true });
    if (mode === 'process') throw new Error('writer process failed');
    const brief = await readFile(join(options.cwd, 'brief.md'), 'utf8');
    const files = [...brief.matchAll(/^- ([a-z][a-z0-9_]*\.md)$/gm)].map(match => match[1]);
    for (const file of files) {
      let content = file === 'rfq.md' ? brief.split('--- BEGIN RFQ ---\n')[1].split('\n--- END RFQ ---')[0] : `${BANNER}\n# Introduction\n`;
      for (const match of brief.matchAll(/^File ([a-z][a-z0-9_]*\.md), section ([0-9.]+):/gm)) if (match[1] === file) content += `## ${match[2]} Evidence\nSynthetic supporting material.\n`;
      if (file === 'cover_letter.md' && mode === 'duplicate') content += '## 1.1 Repeated evidence\n';
      if (file === 'cover_letter.md' && mode === 'foreign') {
        const assignments = [...brief.matchAll(/^File ([a-z][a-z0-9_]*\.md), section ([0-9.]+):/gm)];
        const own = new Set(assignments.filter(match => match[1] === file).map(match => match[2]));
        const other = assignments.find(match => match[1] !== file && !own.has(match[2]));
        assert.ok(other);
        content += `## ${other[2]} Evidence assigned to another file\n`;
      }
      if (file === 'cover_letter.md' && mode.startsWith('private:')) content += `Private marker: ${mode.slice(8)}.\n`;
      if (mode === 'missing' && file === 'rfq.md') continue;
      if (mode === 'banner' && file === 'cover_letter.md') content = '# 1 No banner\n';
      if (mode === 'rfq' && file === 'rfq.md') content += 'changed';
      if (mode === 'heading' && file === 'cover_letter.md') content = `${BANNER}\nNo headings\n`;
      if (mode === 'symlink' && file === 'cover_letter.md') await symlink(join(options.cwd, 'brief.md'), join(options.cwd, file));
      else await writeFile(join(options.cwd, file), content);
    }
    if (mode === 'extra') await writeFile(join(options.cwd, 'extra.md'), BANNER);
    return { stdout: JSON.stringify({ type: mode === 'failed' ? 'turn.failed' : 'turn.completed' }) };
  };
  return { root, world, calls, runCommand, authenticationDirectory };
}
test('writer stages only brief, copies exact allowed bytes and records clean invocation provenance', async () => {
  const f = await runFixture();
  try {
    await writeFile(join(f.world, 'writer.json'), JSON.stringify({ seed: 101, suppliers: { 'SUP-02': [{ attempt: 1, model: 'prior-model' }], 'SUP-01': [{ attempt: 1, model: 'earlier-model' }] } }));
    const result = await writePacket(f.world, 'SUP-01', { model: 'test-model', temporaryRoot: f.root, authenticationDirectory: f.authenticationDirectory, runCommand: f.runCommand });
    assert.ok(result.files.includes('rfq.md'));
    const attempt = result.provenance.suppliers['SUP-01'][1];
    assert.equal(attempt.attempt, 2);
    assert.equal(result.provenance.suppliers['SUP-01'][0].model, 'earlier-model');
    assert.equal(result.provenance.suppliers['SUP-02'][0].model, 'prior-model');
    assert.equal(attempt.model, 'test-model');
    assert.equal(attempt.version, 'codex-cli test-version');
    assert.deepEqual(attempt.stage_inventory, ['brief.md']);
    assert.equal(attempt.isolation.repository_read_denied, true);
    assert.equal(attempt.isolation.world_read_denied, true);
    const world = await realpath(f.world);
    assert.equal(world.startsWith(new URL('..', import.meta.url).pathname), false);
    const worldProbe = f.calls.find(call => call.args.at(-1) === join(world, 'facts', 'SUP-01.json'));
    assert.ok(worldProbe, 'World facts probe is performed outside the repository');
    assert.ok(worldProbe.args[1].includes(`(subpath ${JSON.stringify(world)})`));
    assert.equal(attempt.prompt, WRITER_PROMPT);
    assert.deepEqual((await readdir(join(f.world, 'packets', 'SUP-01'))).sort(), [...result.files].sort());
    for (const file of result.files) assert.equal(hash(await readFile(join(f.world, 'packets', 'SUP-01', file))), attempt.outputs[file]);
    assert.equal(hash(await readFile(join(f.world, 'briefs', 'SUP-01.md'))), attempt.brief_sha256);
    await assert.rejects(writePacket(f.world, 'SUP-01', { model: 'test-model', temporaryRoot: f.root, authenticationDirectory: f.authenticationDirectory, runCommand: f.runCommand }), /stage already exists/);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});
test('writer refuses failed isolation, process and malformed outputs before publication', async () => {
  const messages = { isolation: /did not deny/, 'world-isolation': /did not deny world facts/, process: /process failed/, failed: /did not complete/, missing: /inventory/, extra: /inventory/, banner: /synthetic banner/, rfq: /changed buyer RFQ/, heading: /numbered headings/, symlink: /regular file/ };
  for (const mode of Object.keys(messages)) {
    const f = await runFixture(mode);
    try {
      await assert.rejects(writePacket(f.world, 'SUP-01', { model: 'test-model', temporaryRoot: f.root, authenticationDirectory: f.authenticationDirectory, runCommand: f.runCommand }), messages[mode]);
      await assert.rejects(readFile(join(f.world, 'writer.json')), { code: 'ENOENT' });
      await assert.rejects(readdir(join(f.world, 'packets', 'SUP-01')), { code: 'ENOENT' });
    } finally { await rm(f.root, { recursive: true, force: true }); }
  }
});
test('writer rejects invalid explicit models and timeouts and profile includes protected roots', async () => {
  await assert.rejects(writePacket('/unused', 'SUP-01'), /explicit writer model/);
  await assert.rejects(writePacket('/unused', 'SUP-01', { model: 'bad model' }), /explicit writer model/);
  await assert.rejects(writePacket('/unused', 'SUP-01', { model: 'test', timeout: 0 }), /timeout/);
  const profile = writerReadProfile('/private/tmp/stage', '/private/tmp/runtime', '/repo', '/opt/external-world');
  assert.ok(profile.includes('deny file-write*'));
  for (const path of ['/Users', '/Volumes', '/private/tmp', '/repo', '/opt/external-world', '/private/tmp/stage', '/private/tmp/runtime']) assert.ok(profile.includes(path));
});

test('failed metadata replacement preserves prior bytes and withdraws new packet and temporary publication trees', async () => {
  const f = await runFixture();
  const previous = JSON.stringify({ seed: 101, suppliers: { 'SUP-02': [{ model: 'prior-model' }] } }) + '\n';
  try {
    await writeFile(join(f.world, 'writer.json'), previous);
    const renameFile = async (from, to) => {
      if (to === join(f.world, 'writer.json')) throw Object.assign(new Error('metadata replace failed'), { code: 'EACCES' });
      return rename(from, to);
    };
    await assert.rejects(writePacket(f.world, 'SUP-01', { model: 'test-model', temporaryRoot: f.root, authenticationDirectory: f.authenticationDirectory, runCommand: f.runCommand, renameFile }), /metadata replace failed/);
    assert.equal(await readFile(join(f.world, 'writer.json'), 'utf8'), previous);
    assert.deepEqual(await readdir(join(f.world, 'packets')), []);
    assert.equal((await readdir(f.world)).some(name => name.startsWith('.writer-')), false);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('subprocess driver closes stdin so a noninteractive child reaches EOF', async () => {
  const result = await executeWriterCommand('/bin/sh', ['-c', 'cat >/dev/null; printf stdin-eof'], { encoding: 'utf8', timeout: 1500 });
  assert.equal(result.stdout, 'stdin-eof');
  assert.equal(result.stderr, '');
});

test('fake command adapter runs on Linux while real writer remains macOS-only', async () => {
  const platform = Object.getOwnPropertyDescriptor(process, 'platform');
  const f = await runFixture();
  try {
    Object.defineProperty(process, 'platform', { ...platform, value: 'linux' });
    await assert.rejects(writePacket('/unused', 'SUP-01', { model: 'test-model' }), /requires macOS/);
    const result = await writePacket(f.world, 'SUP-01', { model: 'test-model', temporaryRoot: f.root, authenticationDirectory: f.authenticationDirectory, runCommand: f.runCommand });
    assert.equal(result.supplier_id, 'SUP-01');
  } finally {
    Object.defineProperty(process, 'platform', platform);
    await rm(f.root, { recursive: true, force: true });
  }
});

for (const [mode, description] of [['duplicate', 'duplicated numbered headings'], ['foreign', 'numbered headings assigned to another file']]) {
  test(`writer rejects ${description}`, async () => {
    const f = await runFixture(mode);
    try {
      await assert.rejects(writePacket(f.world, 'SUP-01', { model: 'test-model', temporaryRoot: f.root, authenticationDirectory: f.authenticationDirectory, runCommand: f.runCommand }), /numbered headings differ/);
      await assert.rejects(readdir(join(f.world, 'packets', 'SUP-01')), { code: 'ENOENT' });
    } finally { await rm(f.root, { recursive: true, force: true }); }
  });
}

for (const marker of ['2.ctq_cpk', 'answer key', 'target decision']) {
  test(`writer rejects private output marker ${marker}`, async () => {
    const f = await runFixture(`private:${marker}`);
    try {
      await assert.rejects(writePacket(f.world, 'SUP-01', { model: 'test-model', temporaryRoot: f.root, authenticationDirectory: f.authenticationDirectory, runCommand: f.runCommand }), /private vocabulary/);
      await assert.rejects(readdir(join(f.world, 'packets', 'SUP-01')), { code: 'ENOENT' });
    } finally { await rm(f.root, { recursive: true, force: true }); }
  });
}

test('writer preserves retry brief path and bytes in accepted provenance', async () => {
  const f = await runFixture();
  try {
    const result = await writePacket(f.world, 'SUP-01', { model: 'test-model', temporaryRoot: f.root, authenticationDirectory: f.authenticationDirectory, runCommand: f.runCommand, briefAttempt: 2, feedback: [{ action: 'repair_structure', file: 'cover_letter.md', section: null }] });
    const record = result.provenance.suppliers['SUP-01'][0];
    assert.equal(record.brief, 'briefs/SUP-01.attempt-2.md');
    const brief = await readFile(join(f.world, record.brief), 'utf8');
    assert.ok(brief.includes('Document corrections for this attempt'));
    assert.equal(hash(brief), record.brief_sha256);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

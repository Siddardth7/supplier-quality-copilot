import { readFile, writeFile, mkdir, mkdtemp, readdir, lstat, realpath, copyFile, rm, rename } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { writeBrief, BANNER, forbidden } from './brief.mjs';

export const WRITER_PROMPT = 'Read brief.md and write every file it lists, in this folder.';
/** Subprocess driver: a noninteractive child must receive stdin EOF. */
export const executeWriterCommand = (command, args, options) => new Promise((resolve, reject) => {
  const child = execFile(command, args, options, (error, stdout, stderr) => {
    if (error) { error.stdout = stdout; error.stderr = stderr; reject(error); }
    else resolve({ stdout, stderr });
  });
  child.stdin.end();
});
const hash = value => createHash('sha256').update(value).digest('hex');
const check = (ok, message) => { if (!ok) throw new TypeError(message); };
const exists = async path => { try { return await lstat(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } };

/** Restrict personal/temp/repository reads in the entire CLI process tree. */
export function writerReadProfile(stage, runtime, repository, worldDirectory = repository) {
  const quote = path => JSON.stringify(resolve(path));
  const denied = [...new Set(['/Users', '/Volumes', '/private/tmp', '/tmp', '/private/var/folders', repository, worldDirectory])];
  return `(version 1)\n(allow default)\n(deny file-write* (require-all (require-not (subpath ${quote(stage)})) (require-not (subpath ${quote(runtime)})) (require-not (subpath "/dev"))))\n(deny file-read-data (require-all (require-any ${denied.map(path => `(subpath ${quote(path)})`).join(' ')}) (require-not (subpath ${quote(stage)})) (require-not (subpath ${quote(runtime)}))))\n(deny file-read* (literal "/AGENTS.md") (literal "/private/AGENTS.md") (literal "/private/tmp/AGENTS.md") (literal "/private/var/AGENTS.md"))\n`;
}

async function regular(path, label) {
  const stat = await lstat(path);
  check(stat.isFile() && !stat.isSymbolicLink(), `${label} must be a regular file`);
  return readFile(path);
}

/** Fresh isolated Codex invocation. Test seams replace commands, never the compiled brief. */
export async function writePacket(worldDirectory, supplierId, options = {}) {
  const { model, codex = 'codex', runCommand = executeWriterCommand, renameFile = rename, timeout = 600_000, temporaryRoot = tmpdir(), authenticationDirectory = process.env.CODEX_HOME ?? join(homedir(), '.codex') } = options;
  check(typeof model === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(model), 'An explicit writer model is required');
  check(Number.isSafeInteger(timeout) && timeout > 0, 'Invalid writer timeout');
  check(runCommand !== executeWriterCommand || process.platform === 'darwin', 'Packet writer currently requires macOS sandbox-exec');
  const compiled = await writeBrief(worldDirectory, supplierId, { feedback: options.feedback ?? [], attempt: options.briefAttempt });
  const repository = await realpath(new URL('..', import.meta.url));
  const world = await realpath(worldDirectory);
  const base = join(await realpath(temporaryRoot), 'sqc-write', String(compiled.seed));
  await mkdir(base, { recursive: true });
  check(!(await lstat(base)).isSymbolicLink() && await realpath(base) === base, 'Unsafe stage parent');
  const stage = join(base, supplierId);
  check(!(await exists(stage)), 'Writer stage already exists; retain or remove the prior attempt explicitly');
  await mkdir(stage);
  const runtime = await mkdtemp(join(await realpath(temporaryRoot), 'sqc-writer-runtime-'));
  const home = join(runtime, 'home');
  const codexHome = join(runtime, 'codex');
  await mkdir(home); await mkdir(codexHome); await mkdir(join(runtime, 'tmp'));
  const environment = { PATH: '/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin', HOME: home, CODEX_HOME: codexHome, TMPDIR: join(runtime, 'tmp'), LANG: 'en_US.UTF-8' };
  const commandOptions = { cwd: stage, env: environment, encoding: 'utf8', timeout, maxBuffer: 32 * 1024 * 1024 };
  let publication;
  let metadataDirectory;
  try {
    const authSource = join(authenticationDirectory, 'auth.json');
    await regular(authSource, 'Writer authentication');
    await copyFile(authSource, join(codexHome, 'auth.json'));
    await writeFile(join(stage, 'brief.md'), compiled.brief);
    const profile = writerReadProfile(stage, runtime, repository, world);
    // Both probes use the exact OS profile that will wrap the CLI and every descendant.
    const allowed = await runCommand('/usr/bin/sandbox-exec', ['-p', profile, '/bin/cat', 'brief.md'], commandOptions);
    check(allowed.stdout === compiled.brief, 'Isolation probe could not read the staged brief');
    let denied = false;
    try { await runCommand('/usr/bin/sandbox-exec', ['-p', profile, '/bin/cat', join(repository, 'CLAUDE.md')], commandOptions); }
    catch (error) { denied = /Operation not permitted|Permission denied/.test(error.stderr ?? ''); }
    check(denied, 'Isolation probe did not deny repository reads');
    let worldDenied = false;
    try { await runCommand('/usr/bin/sandbox-exec', ['-p', profile, '/bin/cat', join(world, 'facts', `${supplierId}.json`)], commandOptions); }
    catch (error) { worldDenied = /Operation not permitted|Permission denied/.test(error.stderr ?? ''); }
    check(worldDenied, 'Isolation probe did not deny world facts reads');
    const version = (await runCommand(codex, ['--version'], commandOptions)).stdout.trim();
    check(/^codex-cli \S+/.test(version), 'Unable to determine Codex version');
    const inventory = (await readdir(stage)).sort();
    check(JSON.stringify(inventory) === '["brief.md"]', 'Writer stage must contain only brief.md');
    const args = ['exec', '-C', stage, '--skip-git-repo-check', '--ephemeral', '--ignore-rules', '--ignore-user-config', '-c', 'project_doc_max_bytes=0', '-s', 'danger-full-access', '-m', model, '--json', '-o', join(stage, 'last.txt'), WRITER_PROMPT];
    const result = await runCommand('/usr/bin/sandbox-exec', ['-p', profile, codex, ...args], commandOptions);
    const events = result.stdout.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
    check(events.some(event => event.type === 'turn.completed') && !events.some(event => event.type === 'error' || event.type === 'turn.failed'), 'Writer did not complete successfully');
    const markdown = (await readdir(stage)).filter(file => file.endsWith('.md') && file !== 'brief.md').sort();
    check(JSON.stringify(markdown) === JSON.stringify([...compiled.files].sort()), 'Writer output Markdown inventory differs from brief');
    const files = [];
    const assigned = [...compiled.brief.matchAll(/^File ([a-z][a-z0-9_]*\.md), section ([0-9.]+):/gm)];
    for (const name of compiled.files) {
      check(/^[a-z][a-z0-9_]*\.md$/.test(name), 'Unsafe packet filename');
      const bytes = await regular(join(stage, name), 'Packet output');
      const text = bytes.toString('utf8');
      check(text.split('\n')[0] === BANNER, `${name}: missing synthetic banner`);
      if (name === 'rfq.md') {
        const expected = compiled.brief.split('--- BEGIN RFQ ---\n')[1]?.split('\n--- END RFQ ---')[0];
        check(text === expected, 'Writer changed buyer RFQ bytes');
      } else {
        const actualSections = [...text.matchAll(/^#{1,6} (\d+(?:\.\d+)*)\b/gm)].map(match => match[1]).sort();
        const expectedSections = assigned.filter(match => match[1] === name).map(match => match[2]).sort();
        check(JSON.stringify(actualSections) === JSON.stringify(expectedSections), `${name}: numbered headings differ from assigned sections`);
        check(!forbidden.test(text), `${name}: private vocabulary in supplier document`);
      }
      files.push({ name, bytes, sha256: hash(bytes) });
    }
    // Validate all output before making any packet visible in the world.
    const packets = join(worldDirectory, 'packets');
    await mkdir(packets, { recursive: true });
    publication = await mkdtemp(join(packets, `.${supplierId}-`));
    for (const file of files) await writeFile(join(publication, file.name), file.bytes);
    const destination = join(packets, supplierId);
    check(!(await exists(destination)), 'Packet already exists; preserve the frozen packet before a new attempt');
    const provenancePath = join(worldDirectory, 'writer.json');
    let provenance = { seed: compiled.seed, suppliers: {} };
    if (await exists(provenancePath)) provenance = JSON.parse(await regular(provenancePath, 'Writer provenance'));
    check(provenance.seed === compiled.seed && provenance.suppliers && typeof provenance.suppliers === 'object', 'Writer provenance world mismatch');
    const attempts = provenance.suppliers[supplierId] ?? [];
    check(Array.isArray(attempts), 'Invalid writer attempt history');
    attempts.push({ attempt: attempts.length + 1, version, model, model_source: 'explicit successful CLI -m argument',
      brief: compiled.briefPath, brief_sha256: hash(compiled.brief), prompt: WRITER_PROMPT,
      flags: ['exec', '-C', '<stage>', ...args.slice(3, -2), '<stage>/last.txt', WRITER_PROMPT],
      stage_inventory: inventory, isolation: { method: 'macOS sandbox-exec', profile_sha256: hash(profile), repository_read_denied: true, world_read_denied: true, staged_brief_read_allowed: true, clean_home: true, clean_codex_home: 'auth.json only', project_doc_max_bytes: 0 },
      outputs: Object.fromEntries(files.map(file => [file.name, file.sha256])) });
    provenance.suppliers[supplierId] = attempts;
    // Prepare metadata before publication; never truncate an existing provenance file.
    metadataDirectory = await mkdtemp(join(worldDirectory, '.writer-'));
    const preparedProvenance = join(metadataDirectory, 'writer.json');
    await writeFile(preparedProvenance, JSON.stringify(provenance, null, 2) + '\n');
    await renameFile(publication, destination); publication = null;
    try {
      await renameFile(preparedProvenance, provenancePath);
    } catch (error) {
      // The final metadata replacement failed: withdraw this newly published packet.
      await rm(destination, { recursive: true, force: true });
      throw error;
    }
    return { seed: compiled.seed, supplier_id: supplierId, files: files.map(file => file.name), provenance };
  } finally {
    if (publication) await rm(publication, { recursive: true, force: true });
    if (metadataDirectory) await rm(metadataDirectory, { recursive: true, force: true });
    await rm(runtime, { recursive: true, force: true });
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const args = process.argv.slice(2);
  check(args.length === 6 && args[0] === '--world' && args[2] === '--supplier' && args[4] === '--model', 'Usage: node sim/write-packet.mjs --world <directory> --supplier SUP-01 --model <model>');
  const result = await writePacket(args[1], args[3], { model: args[5] });
  console.log(`Wrote ${result.files.length} packet files for ${result.supplier_id}`);
}

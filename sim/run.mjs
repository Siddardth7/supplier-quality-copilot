import { readFile, writeFile, mkdir, readdir, lstat, realpath, mkdtemp, cp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { sampleWorld } from './world.mjs';
import { validateSeed } from './seed.mjs';
import { simulateCandidates, writeCandidateFacts, AS_OF } from './candidate.mjs';
import { simulateHistory, writeHistory } from './history.mjs';
import { buildAnswerKey, writeAnswerKey } from './answer-key.mjs';
import { rewriteWorld, checkWorld } from './factcheck.mjs';
import { storyMisses } from './stories.mjs';
import { RUBRIC } from '../app/engine.js';
const json = value => JSON.stringify(value, null, 2) + '\n';
const check = (ok, message) => {
    if (!ok)
        throw new Error(message);
};
/** Resolve the invoking user's model before isolating the supplier writer. */
export async function configuredWriterModel({ environment = process.env, home = homedir() } = {}) {
    if (environment.SQC_WRITER_MODEL)
        return environment.SQC_WRITER_MODEL;
    const path = join(environment.CODEX_HOME ?? join(home, '.codex'), 'config.toml');
    let text;
    try {
        text = await readFile(path, 'utf8');
    }
    catch (error) {
        if (error.code !== 'ENOENT')
            throw error;
        text = '';
    }
    const top = text.split(/^\s*\[/m)[0];
    const model = top.match(/^\s*model\s*=\s*["']([A-Za-z0-9][A-Za-z0-9._:-]*)["']\s*(?:#.*)?$/m)?.[1];
    check(model, 'Set --model, SQC_WRITER_MODEL, or a top-level Codex model configuration');
    return model;
}
export const RESERVED_SEEDS = Object.freeze([101, 102, 103, 104, 105, 106, 107, 108]);
async function exists(path) {
    try {
        return await lstat(path);
    }
    catch (error) {
        if (error.code === 'ENOENT')
            return null;
        throw error;
    }
}
async function directory(path) {
    await mkdir(path, { recursive: true });
    check((await lstat(path)).isDirectory() && !(await lstat(path)).isSymbolicLink(), `Unsafe directory: ${path}`);
    return realpath(path);
}
/** Check every candidate target and active-supplier story without writing a world. */
export async function inspectSeed(seed) {
    validateSeed(seed);
    const world = sampleWorld(seed), facts = await simulateCandidates(seed), history = await simulateHistory(seed);
    const key = buildAnswerKey(seed, facts, history), candidates = {}, stories = {}, reasons = [];
    for (const candidate of world.candidates) {
        const fact = facts.find(f => f.supplier_id === candidate.id), evaluation = key.candidates.find(c => c.supplier_id === candidate.id).evaluation;
        const misses = [];
        if (evaluation.decision !== candidate.target.decision)
            misses.push(`decision ${evaluation.decision}`);
        if (evaluation.routing.to !== candidate.target.routing.toLowerCase())
            misses.push(`routing ${evaluation.routing.to}`);
        if (candidate.id === 'SUP-01' && !RUBRIC.commodities.find(p => p.key === candidate.commodity).required.some(id => fact.criteria[id].disclosure === 'missing'))
            misses.push('no missing required test');
        if (candidate.id === 'SUP-06' && evaluation.knockouts.assumed.length === 0)
            misses.push('no assumed knockout');
        if (candidate.id === 'SUP-07' && !(fact.criteria['6.capacity_ratio'].disclosure === 'verified' && fact.criteria['6.capacity_ratio'].true_value < 1))
            misses.push('capacity shortfall not demonstrated');
        candidates[candidate.id] = { passed: misses.length === 0, misses };
        reasons.push(...misses.map(reason => `${candidate.id}: ${reason}`));
    }
    for (const supplier of key.scorecard.suppliers) {
        const misses = storyMisses(supplier.supplier_id, supplier);
        stories[supplier.supplier_id] = { passed: misses.length === 0, misses };
        reasons.push(...misses.map(reason => `${supplier.supplier_id}: ${reason}`));
    }
    return { seed, passed: reasons.length === 0, candidates, stories, reasons };
}
/** Search the complete range and retain per-supplier hit rates and reserved-seed rejections. */
export async function findDemo({ from = 1, to = 20000, onSeed = () => {
} } = {}) {
    validateSeed(from);
    validateSeed(to);
    check(from <= to, 'Search range is reversed');
    const records = [], hits = {}, storyHits = {};
    let selected = null, eligible = 0;
    for (let seed = from; seed <= to; seed++) {
        let record;
        if (RESERVED_SEEDS.includes(seed))
            record = { seed, reserved: true, passed: false, reasons: ['Reserved evaluation/re-test seed'] };
        else {
            record = await inspectSeed(seed);
            eligible++;
            for (const [id, row] of Object.entries(record.candidates))
                hits[id] = (hits[id] ?? 0) + Number(row.passed);
            for (const [id, row] of Object.entries(record.stories))
                storyHits[id] = (storyHits[id] ?? 0) + Number(row.passed);
            if (record.passed && selected === null)
                selected = seed;
        }
        records.push(record);
        await onSeed(record);
    }
    const rates = counts => Object.fromEntries(Object.entries(counts).map(([id, count]) => [id, { hits: count, eligible, rate: eligible ? count / eligible : 0 }]));
    return { from, to, eligible, selected, candidates: rates(hits), stories: rates(storyHits), records };
}
/** Build app roster metadata from the seeded world and commodity requirements. */
export async function suppliersForSeed(seed) {
    const world = sampleWorld(seed), sheets = new Map();
    for (const row of [...world.candidates, ...world.active])
        if (!sheets.has(row.commodity))
            sheets.set(row.commodity, JSON.parse(await readFile(new URL(`../data/requirements/${row.commodity}.json`, import.meta.url))));
    const entry = row => ({ id: row.id, name: row.name, commodity: row.commodity, part: sheets.get(row.commodity).part_name });
    return { as_of: AS_OF, candidates: world.candidates.map(entry), active: world.active.map(entry) };
}
async function deterministicBuild(seed, path) {
    await directory(path);
    await writeCandidateFacts(seed, join(path, 'facts'));
    await writeHistory(seed, join(path, 'history.csv'));
    await writeFile(join(path, 'suppliers.json'), json(await suppliersForSeed(seed)));
    await writeAnswerKey(path);
}
/** Hash each deterministic artifact so frozen rebuilds can be compared byte for byte. */
export async function deterministicHashes(path) {
    const names = ['history.csv', 'suppliers.json', 'answer_key.json', 'answer_key.sha256'];
    for (const folder of ['facts', 'reference'])
        for (const name of (await readdir(join(path, folder))).sort())
            names.push(`${folder}/${name}`);
    const hashes = {};
    for (const name of names) {
        const file = join(path, name);
        check((await lstat(file)).isFile() && !(await lstat(file)).isSymbolicLink(), 'Unsafe deterministic artifact');
        hashes[name] = createHash('sha256').update(await readFile(file)).digest('hex');
    }
    return hashes;
}
/** Build a new world, or verify a frozen world in scratch space without invoking a writer. */
export async function buildWorld(seed, { root = 'data/worlds', model, noWriter = false, writer = rewriteWorld } = {}) {
    validateSeed(seed);
    const parent = await directory(resolve(root));
    const path = join(parent, String(seed));
    if (noWriter) {
        check(await exists(path), 'No frozen world to rebuild');
        await directory(path);
        const before = await deterministicHashes(path), scratch = await mkdtemp(join(tmpdir(), 'sqc-rebuild-'));
        try {
            await deterministicBuild(seed, scratch);
            const rebuilt = await deterministicHashes(scratch);
            if (JSON.stringify(before) !== JSON.stringify(rebuilt)) {
                const mismatches = [];
                for (const file of Object.keys(before).filter(file => before[file] !== rebuilt[file]).slice(0, 3)) {
                    const original = await readFile(join(path, file)), generated = await readFile(join(scratch, file));
                    let offset = 0;
                    while (offset < original.length && offset < generated.length && original[offset] === generated[offset])
                        offset++;
                    mismatches.push({ file, offset, frozen: original.subarray(offset, offset + 100).toString(), rebuilt: generated.subarray(offset, offset + 100).toString() });
                }
                throw Error('Frozen deterministic artifacts differ from seed rebuild: ' + JSON.stringify({ node: process.version, platform: process.platform, arch: process.arch, mismatches }));
            }
            await cp(join(path, 'packets'), join(scratch, 'packets'), { recursive: true });
            const report = await checkWorld(scratch);
            check(report.status === 'passed', 'Frozen packet fact check failed');
        }
        finally {
            await rm(scratch, { recursive: true, force: true });
        }
        return { seed, path, status: 'passed', no_writer: true, hashes: before };
    }
    check(!(await exists(path)), 'World already exists; use --no-writer for frozen verification');
    await deterministicBuild(seed, path);
    const log = [{ stage: 'simulation', status: 'passed' }, { stage: 'answer_key', status: 'passed' }];
    try {
        const report = await writer(path, { model });
        log.push({ stage: 'packets_and_factcheck', status: report.status });
        await writeFile(join(path, 'run.log'), log.map(json).join(''));
        check(report.status === 'passed', `World ${seed} failed fact checking`);
        check(await exists(join(path, 'writer.json')), 'Missing writer provenance');
        return { seed, path, status: 'passed', hashes: await deterministicHashes(path) };
    }
    catch (error) {
        if (!log.some(r => r.stage === 'packets_and_factcheck'))
            log.push({ stage: 'packets_and_factcheck', status: 'failed' });
        await writeFile(join(path, 'run.log'), log.map(json).join(''));
        throw error;
    }
}
/** Verify a qualifying frozen world and copy its public artifacts into the app. */
export async function promoteDemo(seed, { root = 'data/worlds', appRoot = 'data' } = {}) {
    check(!RESERVED_SEEDS.includes(seed), 'Reserved seed cannot be demo');
    const diagnostics = await inspectSeed(seed);
    check(diagnostics.passed, 'Demo target/story checks failed');
    const world = join(resolve(root), String(seed));
    await buildWorld(seed, { root, noWriter: true });
    const app = resolve(appRoot);
    await directory(app);
    const target = join(app, 'suppliers');
    check(!(await exists(target)), 'Demo packet destination already exists');
    for (const file of ['history.csv', 'suppliers.json', 'answer_key.json'])
        check(!(await exists(join(app, file))), `Demo destination exists: ${file}`);
    await cp(join(world, 'packets'), target, { recursive: true, errorOnExist: true, force: false });
    for (const file of ['history.csv', 'suppliers.json', 'answer_key.json'])
        await writeFile(join(app, file), await readFile(join(world, file)), { flag: 'wx' });
    return { seed, status: 'promoted' };
}
/** Parse CLI options and reject invalid demo seeds before any world or writer work. */
export async function main(args = process.argv.slice(2)) {
    const flags = new Map();
    for (let i = 0; i < args.length; i++) {
        const flag = args[i];
        check(['--seed', '--demo', '--find-demo', '--from', '--to', '--model', '--no-writer'].includes(flag) && !flags.has(flag), 'Unknown or repeated option');
        flags.set(flag, ['--find-demo', '--no-writer'].includes(flag) ? true : args[++i]);
    }
    const number = key => {
        const value = flags.get(key);
        check(typeof value === 'string' && /^\d+$/.test(value), `Invalid ${key}`);
        const n = Number(value);
        validateSeed(n);
        return n;
    };
    if (flags.has('--find-demo')) {
        check(!['--seed', '--demo', '--model', '--no-writer'].some(f => flags.has(f)), 'Incompatible search options');
        const result = await findDemo({ from: flags.has('--from') ? number('--from') : 1, to: flags.has('--to') ? number('--to') : 20000, onSeed: record => process.stdout.write(json(record)) });
        process.stdout.write(json({ ...result, records: undefined }));
        check(result.selected !== null, 'No demo seed matched');
        return;
    }
    check(flags.has('--seed') !== flags.has('--demo') && !flags.has('--from') && !flags.has('--to'), 'Choose --seed or --demo');
    const seed = number(flags.has('--demo') ? '--demo' : '--seed');
    if (flags.has('--demo')) {
        check(!RESERVED_SEEDS.includes(seed), 'Reserved seed cannot be demo');
        const diagnostics = await inspectSeed(seed);
        check(diagnostics.passed, 'Demo target/story checks failed: ' + diagnostics.reasons.join('; '));
    }
    const result = await buildWorld(seed, { model: flags.has('--no-writer') ? undefined : (flags.get('--model') ?? await configuredWriterModel()), noWriter: flags.has('--no-writer') });
    if (flags.has('--demo'))
        await promoteDemo(seed);
    process.stdout.write(json(result));
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url)
    await main();

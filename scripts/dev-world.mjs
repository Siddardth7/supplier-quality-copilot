// Build a local dev world for the app: node scripts/dev-world.mjs [--seed 101] [--out dev-data]
// Writes <out>/suppliers.json, <out>/history.csv, <out>/extracted/<id>.json (copies of the simulated
// reference extractions) and <out>/requirements/<commodity>.json (copies of the Stark requirement sheets, so the
// detail's part number and sheet link work, #40) and <out>/suppliers/<id>/*.md (matching frozen-world packets, or a legacy sample whose retained brief
// matches the current inputs, so the citation viewer has accurate files, #42/#74).
// Reads frozen worlds, requirements and matching legacy samples; never writes under data/: data/extracted/ comes only from the
// blind run (SIMULATION.md).
// Open with http://localhost:8000/app/?data=../dev-data/ after node scripts/serve.mjs at the repo root.
import { mkdtemp, mkdir, copyFile, writeFile, rm, readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeCandidateFacts, AS_OF } from '../sim/candidate.mjs';
import { writeHistory } from '../sim/history.mjs';
import { writeAnswerKey } from '../sim/answer-key.mjs';
import { sampleWorld } from '../sim/world.mjs';
import { validateSeed } from '../sim/seed.mjs';
import { suppliersForSeed } from '../sim/run.mjs';
import { compileBrief } from '../sim/brief.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const fail = (message) => { console.error(message); process.exit(1); };

const args = process.argv.slice(2);
const opts = { seed: '101', out: 'dev-data' };
for (let i = 0; i < args.length; i += 2) {
  const key = args[i]?.replace(/^--/, '');
  if (!(key in opts) || !args[i].startsWith('--') || args[i + 1] === undefined) fail('Usage: node scripts/dev-world.mjs [--seed <uint32>] [--out <directory>]');
  opts[key] = args[i + 1];
}
if (!/^\d+$/.test(opts.seed)) fail('--seed: expected an unsigned integer');
const seed = Number(opts.seed);
validateSeed(seed);

const out = resolve(ROOT, opts.out);
// Lowercased: macOS disks are case-insensitive, so Data/ and DATA/ are data/ (#37 review F2).
const inData = relative(join(ROOT, 'data').toLowerCase(), out.toLowerCase());
// Outside data/ only for '..' or '../…' (a child named '..foo' is inside) or another drive; '' is data/ itself.
const outsideData = inData === '..' || inData.startsWith('..' + sep) || isAbsolute(inData);
if (!outsideData) fail(`--out: refusing to write inside data/ (${opts.out})`);

const work = await mkdtemp(join(tmpdir(), 'sqc-dev-world-'));
try {
  await writeCandidateFacts(seed, join(work, 'facts'));
  await writeHistory(seed, join(work, 'history.csv'));
  const key = await writeAnswerKey(work);

  const world = sampleWorld(seed);
  const suppliers = await suppliersForSeed(seed);

  await mkdir(join(out, 'extracted'), { recursive: true });
  await writeFile(join(out, 'suppliers.json'), JSON.stringify(suppliers, null, 2) + '\n');
  await copyFile(join(work, 'history.csv'), join(out, 'history.csv'));
  for (const c of key.candidates) await copyFile(join(work, 'reference', `${c.supplier_id}.json`), join(out, 'extracted', `${c.supplier_id}.json`));
  // #74: a seed alone cannot identify packets across reviewed archetype revisions.
  // Reuse frozen packets only with identical facts; legacy samples require the exact current brief.
  for (const { supplier_id: id } of key.candidates) {
    const frozen = join(ROOT, 'data', 'worlds', String(seed));
    const frozenFacts = join(frozen, 'facts', `${id}.json`);
    const frozenPacket = join(frozen, 'packets', id);
    const sampleRoot = join(ROOT, 'data', 'samples', `world-${seed}`, id);
    const sample = join(sampleRoot, 'packets', id);
    const sampleBrief = join(sampleRoot, 'briefs', `${id}.md`);
    let src = null;
    if (existsSync(frozenPacket) && existsSync(frozenFacts) && (await readFile(frozenFacts)).equals(await readFile(join(work, 'facts', `${id}.json`)))) {
      src = frozenPacket;
    } else if (existsSync(sample) && existsSync(sampleBrief)) {
      const candidate = world.candidates.find((row) => row.id === id);
      const fact = JSON.parse(await readFile(join(work, 'facts', `${id}.json`), 'utf8'));
      const sheet = JSON.parse(await readFile(join(ROOT, 'data', 'requirements', `${candidate.commodity}.json`), 'utf8'));
      const expected = compileBrief(fact, sheet, { name: candidate.name, doc_discipline: candidate.traits.doc_discipline }).brief;
      if (await readFile(sampleBrief, 'utf8') === expected) src = sample;
    }
    if (!src) continue;
    await mkdir(join(out, 'suppliers', id), { recursive: true });
    for (const f of (await readdir(src)).filter((f) => f.endsWith('.md'))) await copyFile(join(src, f), join(out, 'suppliers', id, f));
  }
  const sheets = (await readdir(join(ROOT, 'data', 'requirements'))).filter((f) => f.endsWith('.json'));
  await mkdir(join(out, 'requirements'), { recursive: true });
  for (const f of sheets) await copyFile(join(ROOT, 'data', 'requirements', f), join(out, 'requirements', f));
  console.log(`dev world seed=${seed}: ${suppliers.candidates.length} candidates, ${suppliers.active.length} active -> ${relative(ROOT, out) || '.'}`);
} finally {
  await rm(work, { recursive: true, force: true });
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {sampleWorld} from '../sim/world.mjs';
import {buildWorld} from '../sim/run.mjs';
import {compileBrief} from '../sim/brief.mjs';
import {checkPacket} from '../sim/factcheck.mjs';
import {evaluate,scorecard,parseHistory} from '../app/engine.js';
import {storyMisses} from '../sim/stories.mjs';
const json=async path=>JSON.parse(await readFile(path,'utf8'));
const runtime=await json(new URL('./simulation/runtime.json',import.meta.url));
assert.deepEqual(
 {node:process.version,platform:process.platform,arch:process.arch},
 {node:runtime.node,platform:runtime.platform,arch:runtime.arch},
 `frozen worlds verify only on ${runtime.platform}/${runtime.arch} Node ${runtime.node.replace(/^v/,'')}`
);
const selection=await json(new URL('./simulation/demo-search-summary.json',import.meta.url));
const seeds=[selection.selected,101,102,103,104];
test('five real frozen worlds have clean packets, exact key locks and engine-built references/history',async()=>{
 for(const seed of seeds){
  const root=join('data/worlds',String(seed)),world=sampleWorld(seed),keyBytes=await readFile(join(root,'answer_key.json')),key=JSON.parse(keyBytes),report=await json(join(root,'factcheck.json'));
  const writer=await json(join(root,'writer.json'));assert.equal(writer.seed,seed);const log=await readFile(join(root,'run.log'),'utf8');assert.match(log,/packets_and_factcheck/);assert.doesNotMatch(log,/"status": "failed"/);
  assert.equal(key.seed,seed);assert.equal(report.status,'passed');assert.equal(report.suppliers.length,9);assert.ok(report.suppliers.every(s=>s.status==='passed'&&s.attempts.at(-1).failures.length===0));
  assert.equal((await readFile(join(root,'answer_key.sha256'),'utf8')).trim(),createHash('sha256').update(keyBytes).digest('hex'));
  const history=scorecard(parseHistory(await readFile(join(root,'history.csv'),'utf8')),{as_of:key.as_of});assert.deepEqual(key.scorecard,history);
  for(const candidate of world.candidates){
   const fact=await json(join(root,'facts',candidate.id+'.json')),reference=await json(join(root,'reference',candidate.id+'.json')),entry=key.candidates.find(c=>c.supplier_id===candidate.id);
   assert.deepEqual(entry.reference,reference);assert.deepEqual(entry.evaluation,evaluate(reference,{as_of:key.as_of}));
   const sheet=await json(`data/requirements/${candidate.commodity}.json`),compiled=compileBrief(fact,sheet,{name:candidate.name,doc_discipline:candidate.traits.doc_discipline}),texts={};
   for(const file of await readdir(join(root,'packets',candidate.id)))texts[file]=await readFile(join(root,'packets',candidate.id,file),'utf8');
   const publication=writer.suppliers[candidate.id].at(-1);assert.deepEqual(Object.keys(publication.outputs).sort(),Object.keys(texts).sort());assert.deepEqual(publication.stage_inventory,['brief.md']);
   for(const [file,digest]of Object.entries(publication.outputs))assert.equal(createHash('sha256').update(texts[file]).digest('hex'),digest);assert.equal(createHash('sha256').update(await readFile(join(root,publication.brief))).digest('hex'),publication.brief_sha256);
   const checked=checkPacket(fact,compiled,texts);assert.deepEqual(checked.failures,[],`${seed} ${candidate.id}`);
  }
  if(seed===selection.selected){for(const candidate of world.candidates){const r=key.candidates.find(c=>c.supplier_id===candidate.id).evaluation;assert.equal(r.decision,candidate.target.decision);assert.equal(r.routing.to,candidate.target.routing.toLowerCase());}for(const supplier of history.suppliers)assert.deepEqual(storyMisses(supplier.supplier_id,supplier),[]);}
 }
});
test('real demo app data are exact copies with packet-only supplier folders',async()=>{
 const world=join('data/worlds',String(selection.selected));
 for(const file of ['history.csv','suppliers.json','answer_key.json'])assert.deepEqual(await readFile(join('data',file)),await readFile(join(world,file)));
 for(const candidate of sampleWorld(selection.selected).candidates){const files=(await readdir(join('data/suppliers',candidate.id))).sort();assert.deepEqual(files,(await readdir(join(world,'packets',candidate.id))).sort());assert.ok(files.every(f=>f.endsWith('.md')&&f!=='brief.md'));for(const file of files)assert.deepEqual(await readFile(join('data/suppliers',candidate.id,file)),await readFile(join(world,'packets',candidate.id,file)));}
});
test('real five-world rebuilds use frozen packets without any writer and preserve deterministic hashes',async()=>{
 for(const seed of seeds){const r=await buildWorld(seed,{noWriter:true,writer:()=>assert.fail('Unexpected writer')});assert.equal(r.no_writer,true);assert.equal(r.status,'passed');assert.equal(Object.keys(r.hashes).length,22);}
});

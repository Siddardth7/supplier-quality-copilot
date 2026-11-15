import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,rm,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {configuredWriterModel,findDemo,inspectSeed,suppliersForSeed,buildWorld,promoteDemo,deterministicHashes,RESERVED_SEEDS} from './run.mjs';
import {writeBrief,BANNER} from './brief.mjs';
import {checkWorld} from './factcheck.mjs';
import {sampleWorld} from './world.mjs';
async function scratch(t){const p=await mkdtemp(join(tmpdir(),'sqc-run-test-'));t.after(()=>rm(p,{recursive:true,force:true}));return p;}
async function fixtureWriter(world){
 for(const candidate of sampleWorld(93).candidates){
  const compiled=await writeBrief(world,candidate.id),d=join(world,'packets',candidate.id);await mkdir(d,{recursive:true});
  const contents=new Map(compiled.files.map(f=>[f,`${BANNER}\n`]));
  const body=compiled.brief.split('Omit the following topics')[0], pattern=/^File ([a-z_]+\.md), section ([0-9.]+): ([^\n]+)\n([\s\S]*?)(?=^File |$(?![\s\S]))/gm;
  for(const match of body.matchAll(pattern))contents.set(match[1],contents.get(match[1])+`\n## ${match[2]} ${match[3]}\n${match[4]}\n`);
  contents.set('rfq.md',compiled.brief.split('--- BEGIN RFQ ---\n')[1].split('\n--- END RFQ ---')[0]);
  for(const [file,text]of contents)await writeFile(join(d,file),text);
 }
 await writeFile(join(world,'writer.json'),'{"test_fixture":true}\n');
 const report=await checkWorld(world);
 report.suppliers[0].attempts.unshift({attempt:1,kind:'historical_fixture',failures:[{rule:'writer_failure',detail:'Fixture rejected output.'}]});report.suppliers[0].attempts.at(-1).attempt=2;
 await writeFile(join(world,'factcheck.json'),JSON.stringify(report,null,2)+'\n');return report;
}
test('full-range search keeps first eligible match and every reserved rejection plus denominators',async()=>{
 const seen=[],r=await findDemo({from:93,to:109,onSeed:row=>seen.push(row.seed)});
 assert.equal(r.selected,93);assert.equal(r.records.length,17);assert.equal(r.eligible,9);assert.deepEqual(seen,Array.from({length:17},(_,i)=>93+i));
 assert.deepEqual(r.records.filter(r=>r.reserved).map(r=>r.seed),RESERVED_SEEDS);
 for(const group of [r.candidates,r.stories])for(const row of Object.values(group)){assert.equal(row.eligible,9);assert.equal(row.rate,row.hits/9);}
 const multiple=await findDemo({from:249,to:491});assert.equal(multiple.selected,249);assert.ok(multiple.records.filter(r=>r.passed).length>=3);
 const miss=await findDemo({from:1,to:1});assert.equal(miss.selected,null);assert.ok(miss.records[0].reasons.length);
 for(const options of [{from:2,to:1},{from:-1,to:1},{from:0,to:1.5}])await assert.rejects(findDemo(options));
});
test('selected retuned seed meets every candidate narrative and ACT story; metadata follows roster',async()=>{
 const r=await inspectSeed(93);assert.equal(r.passed,true);assert.deepEqual(r.reasons,[]);assert.equal(Object.keys(r.candidates).length,9);assert.equal(Object.keys(r.stories).length,6);
 const roster=await suppliersForSeed(93);assert.equal(roster.as_of,'2026-11-01');assert.deepEqual(Object.keys(roster),['as_of','candidates','active']);
 for(const group of ['candidates','active'])assert.deepEqual(roster[group].map(r=>({id:r.id,name:r.name,commodity:r.commodity})),sampleWorld(93)[group].map(r=>({id:r.id,name:r.name,commodity:r.commodity})));
 assert.ok(roster.candidates.every(r=>typeof r.part==='string'&&r.part));
 await assert.rejects(inspectSeed(-1));
});
test('world build, frozen no-writer byte identity and guarded demo promotion',async t=>{
 const root=join(await scratch(t),'worlds'),app=join(await scratch(t),'app');let calls=0;
 const built=await buildWorld(93,{root,model:'test-only',writer:async path=>{calls++;return fixtureWriter(path);}});assert.equal(built.status,'passed');assert.equal(calls,1);
 const before=await deterministicHashes(built.path),provenance=await readFile(join(built.path,'writer.json')),report=await readFile(join(built.path,'factcheck.json'));
 const rebuilt=await buildWorld(93,{root,noWriter:true,writer:()=>assert.fail('writer called')});assert.deepEqual(rebuilt.hashes,before);assert.deepEqual(await readFile(join(built.path,'writer.json')),provenance);assert.deepEqual(await readFile(join(built.path,'factcheck.json')),report);
 assert.equal((await promoteDemo(93,{root,appRoot:app})).status,'promoted');assert.deepEqual(await readFile(join(built.path,'factcheck.json')),report,'promotion must preserve retained failure history');
 for(const file of ['history.csv','suppliers.json','answer_key.json'])assert.deepEqual(await readFile(join(app,file)),await readFile(join(built.path,file)));
 assert.equal((await readdir(join(app,'suppliers'))).length,9);await assert.rejects(promoteDemo(93,{root,appRoot:app}),/already exists/);await assert.rejects(promoteDemo(101,{root,appRoot:app}),/Reserved/);
 await assert.rejects(buildWorld(93,{root}),/already exists/);await assert.rejects(buildWorld(101,{root,noWriter:true}),/No frozen/);
 await writeFile(join(built.path,'suppliers.json'),'tampered');await assert.rejects(buildWorld(93,{root,noWriter:true}),/differ/);await assert.rejects(promoteDemo(93,{root,appRoot:join(app,'fresh')}),/differ/);
});
test('failed packet stage stays failed and never promotes; invalid CLI writes no world',async t=>{
 const root=join(await scratch(t),'worlds');await assert.rejects(buildWorld(101,{root,writer:async()=>({status:'failed'})}),/failed fact/);assert.match(await readFile(join(root,'101','run.log'),'utf8'),/failed/);
 await assert.rejects(buildWorld(102,{root,writer:async()=>{throw Error('fake');}}),/fake/);assert.match(await readFile(join(root,'102','run.log'),'utf8'),/failed/);
 for(const args of [[],['--seed','-1'],['--seed','1','--demo','2'],['--find-demo','--model','x'],['--seed','1','--from','1'],['--garbage']])assert.throws(()=>execFileSync(process.execPath,['sim/run.mjs',...args],{stdio:'pipe',env:{...process.env,CODEX_HOME:join(root,'no-auth'),SQC_WRITER_MODEL:'test-only'}}));
 for(const args of [[],['--seed','1','--demo','2'],['--seed','1','--from','1']])assert.throws(()=>execFileSync(process.execPath,['sim/run.mjs',...args],{stdio:'pipe',env:{...process.env,CODEX_HOME:join(root,'no-auth'),SQC_WRITER_MODEL:'test-only'}}),error=>error.stderr.toString().includes('Choose --seed or --demo'));
});

test('default CLI model resolution uses explicit environment or top-level configuration without section fallback',async t=>{
 const home=await scratch(t);await mkdir(join(home,'.codex'));await writeFile(join(home,'.codex/config.toml'),'model = "fixture-model"\n[unrelated]\nmodel="wrong"\n');
 assert.equal(await configuredWriterModel({environment:{},home}),'fixture-model');assert.equal(await configuredWriterModel({environment:{SQC_WRITER_MODEL:'override'},home}),'override');
 await writeFile(join(home,'.codex/config.toml'),'[unrelated]\nmodel="wrong"\n');await assert.rejects(configuredWriterModel({environment:{},home}),/Set --model/);
 await assert.rejects(configuredWriterModel({environment:{},home:join(home,'absent')}),/Set --model/);
});

test('demo CLI rejects target misses and reserved seeds before creating any world',async t=>{
 const cwd=await scratch(t),script=new URL('./run.mjs',import.meta.url).pathname;
 for(const [seed,message] of [[1,'Demo target/story checks failed'],[101,'Reserved seed cannot be demo']]) {
  assert.throws(()=>execFileSync(process.execPath,[script,'--demo',String(seed),'--model','test-only'],{cwd,stdio:'pipe',env:{...process.env,CODEX_HOME:join(cwd,'no-auth'),SQC_WRITER_MODEL:'test-only'}}),error=>error.stderr.toString().includes(message));
  assert.deepEqual(await readdir(cwd),[],'preflight must not create data or call the writer');
 }
});
test('frozen verification reports a clear unsupported runtime before reading worlds',()=>{
 const url=new URL('../data/worlds.test.mjs',import.meta.url).href;
 for(const [key,value] of [['platform','linux'],['arch','x64'],['version','v26.13.1']]) {
  const script=`Object.defineProperty(process,${JSON.stringify(key)},{value:${JSON.stringify(value)}});await import(${JSON.stringify(url)});`;
  assert.throws(()=>execFileSync(process.execPath,['--input-type=module','-e',script],{stdio:'pipe'}),error=>error.stderr.toString().includes('frozen worlds verify only on darwin/arm64 Node 26.0.0'));
 }
});

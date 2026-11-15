// Issue 78: lossless built-in round trips, catalog growth, unmatched content and plain refusals.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { importSheet, sheetError, sheetCsv } from './sheet-import.js';
import { renderRequirements } from '../sim/render-requirements.mjs';
import { RUBRIC } from './rubric.js';
const root=new URL('../data/requirements/',import.meta.url);
const sheets=await Promise.all((await readdir(root)).filter(n=>n.endsWith('.json')).map(async name=>JSON.parse(await readFile(new URL(name,root)))));
for(const kind of ['json','csv','md'])test('all eight built-in sheets round-trip deep-equal through '+kind,()=>{
 assert.equal(sheets.length,8);
 for(const sheet of sheets){
  const source=kind==='json'?JSON.stringify(sheet):kind==='csv'?sheetCsv(sheet):renderRequirements(sheet);
  const result=importSheet(source,kind);
  assert.equal(result.error,null,sheet.commodity);assert.deepEqual(result.unmatched,[]);assert.deepEqual(result.sheet,sheet);
 }
});
test('catalog IDs and names are dynamic, including a newly added commodity/test',()=>{
 const def={id:'4.future_test',name:'Future test, with a comma',type:'bool'},p={key:'future_profile',name:'Future profile',required:[def.id],nice:[]};
 RUBRIC.tests.push(def);RUBRIC.commodities.push(p);
 try{
  const sheet={...structuredClone(sheets[0]),commodity:p.key,tests:{[def.id]:{name:def.name,required:true,value_type:def.type,conditions:[{measure:'Acceptance',kind:'acceptance',operator:'=',value:true,unit:'boolean',basis:'heuristic'}]}}};
  const named={...sheet,tests:{[def.name]:sheet.tests[def.id]}};
  assert.deepEqual(importSheet(JSON.stringify(named),'json').sheet,sheet);
  for(const [source,kind]of [[sheetCsv(sheet),'csv'],[renderRequirements(sheet),'md']])assert.deepEqual(importSheet(source,kind),{sheet,unmatched:[],error:null});
 }finally{RUBRIC.tests.pop();RUBRIC.commodities.pop();}
});
test('extra unknown rows stay unmatched in JSON, CSV and Markdown; missing required limits are named',()=>{
 const sheet=structuredClone(sheets[0]),id=RUBRIC.commodities.find(p=>p.key===sheet.commodity).required[0];
 const extra={...sheet,tests:{...sheet.tests,'unlisted':{name:'Unknown special test'}}};
 assert.match(importSheet(JSON.stringify(extra),'json').unmatched.join(' '),/Unknown special test/);
 assert.match(importSheet(sheetCsv(sheet)+'"unknown","extra custom row"\n','csv').unmatched.join(' '),/extra custom row/);
 assert.match(importSheet(renderRequirements(sheet)+'\nUnrecognized test result: 47\n','md').unmatched.join(' '),/47/);
 assert.match(importSheet(renderRequirements(sheet)+'\n| Field | hidden extra |\n','md').unmatched.join(' '),/hidden extra/);
 const inherited=renderRequirements(sheet).replace('| Field | Value |','| Field | Value |\n| toString | unknown header |');
 assert.match(importSheet(inherited,'md').unmatched.join(' '),/unknown header/);
 assert.match(importSheet('record,value,value\nheader,a,b','csv').error,/unique/);
 delete sheet.tests[id];
 for(const [source,kind]of [[JSON.stringify(sheet),'json'],[sheetCsv(sheet),'csv'],[renderRequirements(sheet),'md']])assert.equal(importSheet(source,kind).error,'Missing required limit: '+RUBRIC.tests.find(t=>t.id===id).name+'.');
});
test('malformed files, unsupported PDF, wrong values and duplicate tests refuse without throwing',()=>{
 for(const [source,kind]of [['{','json'],['[]','json'],['"unterminated','csv'],['garbage','csv'],['%PDF-1.4','pdf'],['data','exe']]){
  let result;assert.doesNotThrow(()=>{result=importSheet(source,kind);});assert.ok(result.error);
 }
 assert.match(importSheet('','pdf').error,/PDF upload is planned for v2.0/);
 const sheet=structuredClone(sheets[0]),id=Object.keys(sheet.tests)[0];
 const named={...sheet,tests:{...sheet.tests,[sheet.tests[id].name]:sheet.tests[id]}};
 assert.match(importSheet(JSON.stringify(named),'json').error,/Duplicate test/);
 for(const change of [
  s=>s.ctqs[0].lsl=s.ctqs[0].nominal,s=>s.peak_weekly_demand=0,s=>s.need_by_weeks=-1,
  s=>s.part_no='unlinked',s=>s.tests[id].conditions[0].value={},s=>s.tests[id].conditions[0].kind='unknown',
  s=>s.tests[id].conditions[0].basis='standard',s=>s.tests[id].conditions=[],
  s=>s.tests[id].conditions[0]=null,s=>s.tests[id].conditions={},
  s=>s.tests[id].required=false,s=>s.ctqs[0].basis='unspecified'
 ]){
  const bad=structuredClone(sheets[0]);change(bad);let error;assert.doesNotThrow(()=>{error=sheetError(bad);});assert.ok(error);
 }
});
test('CSV quoted newlines, comparison arrays and Markdown entities preserve exact values',()=>{
 const s=structuredClone(sheets[0]),t=Object.values(s.tests)[0];
 s.part_name='A "quoted", part\nnext line';s.ctqs[0].name='Width | & <depth>';
 t.conditions[0]={measure:'Window | & <value>',kind:'acceptance',operator:'between',value:[0.000001,0.000002],unit:'mm',basis:'standard',standard:'Synthetic provision X',context:'Line one\nLine two, with "quotes"'};
 for(const [source,kind]of [[sheetCsv(s),'csv'],[renderRequirements(s),'md']]){
  const result=importSheet(source,kind);assert.equal(result.error,null);assert.deepEqual(result.unmatched,[]);assert.deepEqual(result.sheet,s);
 }
});

for(const kind of ['json','csv','md'])test('C3: leading BOM is stripped before '+kind+' parsing',()=>{
 const sheet=sheets[0];
 const source=kind==='json'?JSON.stringify(sheet):kind==='csv'?sheetCsv(sheet):renderRequirements(sheet);
 const result=importSheet('\uFEFF'+source,kind);
 assert.equal(result.error,null);
 assert.deepEqual(result.unmatched,[]);
 assert.deepEqual(result.sheet,sheet);
});

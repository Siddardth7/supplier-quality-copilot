// Issue 78: storage injections, immutable preview edits and the existing Standards viewer.
import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync}from'node:fs';
import {safeStorage}from'./storage.js';
import{sheetError,importSheet,sheetCsv}from'./sheet-import.js';
import{loadSheets,writeSheets,SHEETS_KEY,SHEETS_SCHEMA,exportSheet,addSheet,uploadModel,previewFields,editPreview,uploadPreview,savePreview,applyPreviewJson}from'./sheet-upload.js';
import{sheetRows,sheetView,renderStandards,renderSheet}from'./standards.js';
const builtin=JSON.parse(readFileSync(new URL('../data/requirements/cold_plate.json',import.meta.url)));
const sample=()=>({...structuredClone(builtin),part_no:'SI-UP-0001'});
const model={sheets:{[builtin.commodity]:{ok:true,value:builtin}},suppliers:{ok:true,value:{candidates:[],active:[]}},candidates:[],monitor:{ok:false,error:{message:'Fixture'}}};
test('sheet store handles blocked, quota, malformed, invalid and duplicate records with a separate envelope',()=>{
 const map=new Map(),storage=safeStorage({localStorage:{getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)}});
 const saved=addSheet([],sample()).sheet;
 assert.equal(writeSheets(storage,[saved]),true);assert.deepEqual(JSON.parse(map.get(SHEETS_KEY)),{schema:SHEETS_SCHEMA,sheets:[saved]});
 assert.deepEqual(loadSheets(storage),[saved]);assert.equal(map.has('sqc:policies'),false);
 for(const raw of [null,{}, {schema:'wrong',sheets:[saved]}, {schema:SHEETS_SCHEMA,sheets:{}}])assert.deepEqual(loadSheets({get:()=>raw}),[]);
 assert.deepEqual(loadSheets({get:()=>({schema:SHEETS_SCHEMA,sheets:[{},saved,saved,{...saved,part_no:'bad'}]})}),[saved]);
 for(const win of [{get localStorage(){throw Error('blocked');}},{localStorage:{getItem(){throw Error('read');},setItem(){throw Error('quota');}}}]){
  const blocked=safeStorage(win);assert.deepEqual(loadSheets(blocked),[]);assert.equal(writeSheets(blocked,[saved]),false);
 }
 assert.deepEqual(loadSheets({get(){throw Error('custom');}}),[]);assert.equal(writeSheets({ok:true,set(){throw Error('custom');}},[saved]),false);
});
test('preview corrections, full JSON, unmatched acknowledgment and collisions are validated before save',()=>{
 const state={sheet:sample(),unmatched:['unknown row'],reviewed:false};const before=structuredClone(state);
 assert.match(savePreview(state,[],model.sheets).error,/Review/);
 const path=['peak_weekly_demand'];const invalid=editPreview(state.sheet,path,'abc','number');
 assert.match(sheetError(invalid),/peak_weekly_demand/);
 const fixed=editPreview(invalid,path,'2300','number');assert.equal(fixed.peak_weekly_demand,2300);
 assert.deepEqual(state,before);assert.equal(editPreview(state.sheet,['__proto__','x'],'bad'),state.sheet);
 assert.equal(previewFields(state.sheet).length>50,true);
 const result=savePreview({...state,sheet:fixed,reviewed:true},[],model.sheets);
 assert.equal(result.error,null);assert.equal(result.sheet.uploaded,true);assert.equal(result.sheet.peak_weekly_demand,2300);
 assert.match(addSheet([],builtin,model.sheets).error,/Part number already exists/);
 assert.match(addSheet(result.sheets,fixed).error,/Part number already exists/);
 const json=applyPreviewJson(state,JSON.stringify(sample()));assert.deepEqual(json.unmatched,state.unmatched);assert.equal(json.reviewed,false);
 assert.ok(applyPreviewJson(state,'{').error);
});
test('saved upload uses the same list and view-only viewer, exports exactly and changes no scoring inputs',()=>{
 const sheet=addSheet([],sample()).sheet,before=structuredClone(model),merged=uploadModel(model,[sheet]);
 assert.equal(uploadModel(null,[sheet]),null);assert.deepEqual(model,before);
 assert.equal(merged.sheets[builtin.commodity].value,builtin);
 const rows=sheetRows(merged);assert.equal(rows.length,2);assert.equal(rows.find(r=>r.part_no===sheet.part_no).uploaded,true);
 const view=sheetView(merged,sheet.part_no);assert.equal(view.sheet,sheet);assert.equal(view.kind,'open');
 const html=renderSheet(sheet);assert.match(html,/Uploaded/);assert.match(html,/suppliers entered by hand, not to the demo suppliers/);assert.doesNotMatch(html,/<input|<button|<textarea/);
 const full=renderStandards(merged,{params:{sheet:sheet.part_no}});assert.match(full,/sheet-export/);assert.match(full,/sheet-delete/);assert.match(full,/Upload requirement sheet/);
 const confirmed=renderStandards(merged,{params:{sheet:sheet.part_no},standards:{ui:{sheetDelete:sheet.part_no}}});
 assert.match(confirmed,/sheet-confirm-delete/);
 const stale=renderStandards(merged,{params:{sheet:sheet.part_no},standards:{ui:{sheetDelete:'SI-UP-0099'}}});
 assert.doesNotMatch(stale,/sheet-confirm-delete/);
 const exported=exportSheet(sheet);assert.equal(exported.filename,'sheet-SI-UP-0001.json');assert.deepEqual(importSheet(exported.text,'json').sheet,sample());
 assert.equal(merged.candidates,model.candidates);assert.equal(merged.monitor,model.monitor);
 assert.equal(Object.keys(uploadModel(model,[{...sheet,part_no:builtin.part_no}]).sheets).length,1);
});
test('preview renders all fields and unmatched content safely, with correction and cancel controls',()=>{
 const state={sheet:sample(),filename:'<img onerror=bad>',unmatched:['<script>unsafe</script>'],error:'<bad>',reviewed:false};
 const html=uploadPreview(state);
 assert.equal((html.match(/data-sheet-path=/g)??[]).length,previewFields(state.sheet).length);
 assert.match(html,/Unmatched content/);assert.match(html,/&lt;script&gt;/);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<script>|<img /);
 assert.match(html,/sheet-apply-json/);assert.match(html,/sheet-save/);assert.match(html,/sheet-cancel/);assert.match(html,/data-sheet-reviewed/);assert.equal(uploadPreview(null),'');
});

test('C1: every sheet row resolves its exact part through sheetKey for a shared commodity',()=>{
 const uploaded=addSheet([],{...sample(),part_no:'SI-UP-0003'}).sheet;
 const first=Object.keys(uploaded.tests)[0];
 uploaded.tests[first].conditions[0].value=0.000002;
 const merged=uploadModel(model,[uploaded]);
 const rows=sheetRows(merged).filter(row=>row.ok);
 assert.equal(rows.length,2);
 assert.equal(new Set(rows.map(row=>row.commodity)).size,1);
 for(const row of rows){
  assert.equal(typeof row.sheetKey,'string');
  assert.equal(merged.sheets[row.sheetKey].value.part_no,row.part_no);
  assert.equal(sheetView(merged,row.part_no).sheet,merged.sheets[row.sheetKey].value);
 }
 const selected=rows.find(row=>row.part_no===uploaded.part_no);
 assert.equal(merged.sheets[selected.sheetKey].value,uploaded);
 assert.notEqual(uploaded.tests[first].conditions[0].value,builtin.tests[first].conditions[0].value);
});

test('C2: CSV text demand corrected in preview saves and persists as a number',()=>{
 const source={...sample(),peak_weekly_demand:'2,300'};
 const parsed=importSheet(sheetCsv(source),'csv');
 assert.match(parsed.error,/peak_weekly_demand/);
 assert.equal(parsed.sheet.peak_weekly_demand,'2,300');
 const corrected=editPreview(parsed.sheet,['peak_weekly_demand'],'2300','string');
 const result=savePreview({...parsed,sheet:corrected},[],model.sheets);
 assert.equal(result.error,null);
 assert.equal(result.sheet.peak_weekly_demand,2300);
 const map=new Map(),storage=safeStorage({localStorage:{getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value)}});
 assert.equal(writeSheets(storage,result.sheets),true);
 assert.equal(loadSheets(storage)[0].peak_weekly_demand,2300);
 assert.equal(JSON.parse(map.get(SHEETS_KEY)).sheets[0].peak_weekly_demand,2300);
 assert.equal(parsed.sheet.peak_weekly_demand,'2,300','correction leaves the parsed input unchanged');
});

test('C2: all schema-numeric fields recover from strings but retain invalid raw input',()=>{
 const paths=[['peak_weekly_demand'],['need_by_weeks'],['ctqs','0','nominal'],['ctqs','0','lsl'],['ctqs','0','usl']];
 for(const path of paths){
  const original=sample();let at=original;
  for(const key of path.slice(0,-1))at=at[key];
  const expected=at[path.at(-1)];at[path.at(-1)]='bad input';
  const corrected=editPreview(original,path,String(expected),'string');
  let value=corrected;for(const key of path)value=value[key];
  assert.equal(value,expected,path.join('.'));
  assert.equal(sheetError(corrected),null,path.join('.'));
  for(const raw of ['', '   ', '2,300','Infinity','NaN']){
   const invalid=editPreview(original,path,raw,'string');let value=invalid;
   for(const key of path)value=value[key];
   assert.equal(value,raw);assert.ok(sheetError(invalid));
  }
 }
});

test('T1: uploaded part-name input value cannot break its quoted attribute',()=>{
 const hostile='"><img src=x onerror=alert(1)>';
 const escaped='&quot;&gt;&lt;img src=x onerror=alert(1)&gt;';
 const html=uploadPreview({sheet:{...sample(),part_name:hostile},unmatched:[],reviewed:false});
 assert.ok(html.includes('value="'+escaped+'"'));
 assert.doesNotMatch(html,/<img\b/);
 assert.ok(!html.includes(hostile));
 const input=html.match(/<input\b[^>]*data-sheet-path="[^"]*part_name[^"]*"[^>]*>/)?.[0];
 assert.ok(input,'part-name preview input exists');
 assert.equal(input.match(/ value="([^"]*)"/)[1],escaped,'only escaped quotes belong to the attribute value');
});

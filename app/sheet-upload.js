// Pure upload state, browser-store envelope and preview rendering for issue 78.
import { esc } from './html.js';
import { importSheet, sheetError } from './sheet-import.js';
export const SHEETS_KEY='sqc:sheets';
export const SHEETS_SCHEMA='sqc-sheets/1';
const copy=v=>JSON.parse(JSON.stringify(v));
const base=s=>{const {uploaded,...rest}=s;return rest;};
export function loadSheets(storage){
 try{
  const raw=storage?.get?.(SHEETS_KEY);
  if(raw?.schema!==SHEETS_SCHEMA||!Array.isArray(raw.sheets))return [];
  const sheets=[];
  for(const s of raw.sheets)if(s&&s.uploaded===true&&!sheetError(s)&&!sheets.some(row=>row.part_no===s.part_no))sheets.push(copy(s));
  return sheets;
 }catch{return [];}
}
export function writeSheets(storage,sheets){
 try{return !!storage?.ok&&storage.set(SHEETS_KEY,{schema:SHEETS_SCHEMA,sheets});}catch{return false;}
}
export const exportSheet=s=>({filename:'sheet-'+String(s.part_no).replace(/[^A-Za-z0-9._-]/g,'_')+'.json',text:JSON.stringify(base(s),null,2)+'\n'});
export function addSheet(list,sheet,builtins={}){
 const error=sheetError(sheet);if(error)return {error};
 const exists=list.some(s=>s.part_no===sheet.part_no)||Object.values(builtins).some(r=>r?.ok&&r.value.part_no===sheet.part_no);
 if(exists)return {error:'Part number already exists. Enter a new part number to save a separate uploaded sheet.'};
 const saved={...copy(base(sheet)),uploaded:true};return {sheet:saved,sheets:[...list,saved],error:null};
}
export function uploadModel(model,sheets){
 if(!model)return model;
 const merged={...model.sheets};
 for(const sheet of sheets)if(!Object.values(merged).some(r=>r?.ok&&r.value.part_no===sheet.part_no))merged['uploaded:'+sheet.part_no]={ok:true,value:sheet,path:null};
 return {...model,sheets:merged};
}
export function previewFields(sheet,path=[]){
 if(sheet===null||typeof sheet!=='object')return [{path,value:sheet}];
 return Object.entries(sheet).flatMap(([key,value])=>previewFields(value,[...path,key]));
}
export function editPreview(sheet,path,raw,type){
 const field=previewFields(sheet).find(f=>JSON.stringify(f.path)===JSON.stringify(path));
 if(!field||path.some(key=>['__proto__','prototype','constructor'].includes(key)))return sheet;
 const out=copy(sheet);let at=out;
 for(const key of path.slice(0,-1))at=at[key];
 let value=raw;
 if(['peak_weekly_demand','need_by_weeks','nominal','lsl','usl'].includes(path.at(-1))){
  const number=Number(raw);
  if(raw.trim()!==''&&Number.isFinite(number))value=number;
 }else if((type??typeof field.value)!=='string'){try{value=JSON.parse(raw);}catch{/* Keep invalid text for a useful Save refusal. */}}
 at[path.at(-1)]=value;return out;
}
export function uploadPreview(state){
 if(!state)return '';
 const rows=state.sheet?previewFields(state.sheet).map(({path,value},i)=>'<tr><th scope="row"><label for="sheet-field-'+i+'">'+esc(path.join(' · '))+'</label></th><td><input class="std-input" type="text" id="sheet-field-'+i+'" data-sheet-path="'+esc(JSON.stringify(path))+'" value="'+esc(typeof value==='string'?value:JSON.stringify(value))+'"></td></tr>').join(''):'';
 return '<section class="panel sheet-upload" aria-labelledby="sheet-preview-title"><p class="eyebrow" id="sheet-preview-title">UPLOAD PREVIEW</p>'
  +'<h3>'+esc(state.filename??'Requirement sheet')+'</h3><p class="quiet">Review and correct the fields before saving. Uploaded limits apply only to suppliers entered by hand; demo suppliers are unchanged.</p>'
  +(state.error?'<p class="std-error" role="alert">Upload refused: '+esc(state.error)+'</p>':'')
  +(state.sheet?'<div class="std-table-wrap"><table class="std-table"><caption>Parsed fields — editable</caption><thead><tr><th scope="col">Field</th><th scope="col">Value</th></tr></thead><tbody>'+rows+'</tbody></table></div>'
   +'<details><summary>Edit full sheet (JSON)</summary><label for="sheet-json">Add, remove or correct any field or row</label><textarea id="sheet-json" class="sheet-json" spellcheck="false">'+esc(JSON.stringify(state.sheet,null,2))+'</textarea><button type="button" class="subtle-button" data-act="sheet-apply-json">Apply full-sheet corrections</button></details>':'')
  +'<h4>Unmatched content</h4>'+(state.unmatched?.length?'<ul class="sheet-unmatched">'+state.unmatched.map(line=>'<li><pre>'+esc(line)+'</pre></li>').join('')+'</ul><label><input type="checkbox" data-sheet-reviewed'+(state.reviewed?' checked':'')+'> I reviewed every unmatched line and corrected the sheet as needed.</label>':'<p class="quiet">No unmatched lines.</p>')
  +'<div class="std-actions">'+(state.sheet?'<button type="button" class="button compact" data-act="sheet-save">Save uploaded sheet</button>':'')+'<button type="button" class="subtle-button" data-act="sheet-cancel">Cancel upload</button></div></section>';
}
export function savePreview(state,list,builtins){
 if(state.unmatched?.length&&!state.reviewed)return {error:'Review the unmatched content and confirm it before saving.'};
 return addSheet(list,state.sheet,builtins);
}
export function applyPreviewJson(state,raw){
 const result=importSheet(raw,'json');
 return {...state,...result,unmatched:[...new Set([...(state.unmatched??[]),...result.unmatched])],reviewed:false};
}

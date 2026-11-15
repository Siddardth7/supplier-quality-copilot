// Requirement-sheet import for issue 78. Catalog identities come only from rubric data.
import { RUBRIC } from './rubric.js';
const fields = ['header','commodity','part_no','part_name','revision','drawing_no','ctqs','tests','peak_weekly_demand','need_by_weeks','planning_basis'];
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = v => typeof v === 'string' && v.trim().length > 0;
const check = (ok,msg) => { if(!ok)throw Error(msg); };
const norm = v => String(v).trim().toLowerCase().replace(/\s+/g,' ');
const testId = v => RUBRIC.tests.find(t => norm(t.id)===norm(v)||norm(t.name)===norm(v))?.id;
const profile = v => RUBRIC.commodities.find(p=>norm(p.key)===norm(v)||norm(p.name)===norm(v));
const scalar = v => {try{return JSON.parse(v);}catch{return v;}};
const unescape = v => v.replaceAll('<br>','\n').replace(/&[#](\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&amp;','&');
const basis = v => v.startsWith('standard: ')?{basis:'standard',standard:v.slice(10)}:{basis:v};

/** Return a schema/required-limit error, never a score. */
export function sheetError(s){
 try{
  check(object(s),'Expected a requirement-sheet object.');
  const p=profile(s.commodity);check(p,'Choose a known commodity from the test catalog.');
  for(const key of ['header','part_no','part_name','revision','drawing_no'])check(text(s[key]),key+': enter a value.');
  check(s.commodity===p.key,'commodity: use the catalog key.');
  check(/^SI-[A-Z]{2}-\d{4}$/.test(s.part_no),'part_no: use a Stark part number such as SI-UP-0001 for its deep link.');
  check(Array.isArray(s.ctqs)&&s.ctqs.length>=3&&s.ctqs.length<=5,'ctqs: supply 3–5 characteristics.');
  const checkBasis=(v,at)=>{
   check(['heuristic','standard'].includes(v.basis),at+': basis must be heuristic or standard.');
   check(v.basis==='standard'?text(v.standard):!Object.hasOwn(v,'standard'),at+': name the standard only for a standard-based limit.');
  };
  for(const c of s.ctqs){
   check(object(c)&&text(c.name)&&text(c.unit),'CTQ: name and unit required.');
   check([c.nominal,c.lsl,c.usl].every(Number.isFinite)&&c.lsl<c.nominal&&c.nominal<c.usl,'CTQ '+c.name+': lower < nominal < upper required.');
   checkBasis(c,'CTQ '+c.name);
  }
  check(object(s.tests),'tests: supply a test table.');
  for(const id of p.required)check(Array.isArray(s.tests[id]?.conditions)&&s.tests[id].conditions.some(c=>c?.kind==='acceptance'),'Missing required limit: '+RUBRIC.tests.find(t=>t.id===id).name+'.');
  for(const[id,t]of Object.entries(s.tests)){
   check([...p.required,...p.nice].includes(id),'Test does not apply to this commodity: '+id+'.');
   const def=RUBRIC.tests.find(t=>t.id===id);
   check(object(t)&&text(t.name)&&t.required===p.required.includes(id)&&t.value_type===def.type,def.name+': check name, required flag and value type.');
   check(Array.isArray(t.conditions)&&t.conditions.length&&t.conditions.some(c=>c.kind==='acceptance'),def.name+': an acceptance limit is required.');
   for(const c of t.conditions){
    check(object(c)&&text(c.measure)&&text(c.unit)&&['setup','acceptance'].includes(c.kind),def.name+': measure, unit and kind required.');
    check(['<=','>=','=','between'].includes(c.operator),c.measure+': invalid comparison.');
    check(c.operator==='between'?Array.isArray(c.value)&&c.value.length===2&&c.value.every(Number.isFinite)&&c.value[0]<c.value[1]
     :c.operator==='='?Number.isFinite(c.value)||text(c.value)||typeof c.value==='boolean':Number.isFinite(c.value),c.measure+': invalid limit value.');
    check(c.context===undefined||text(c.context),c.measure+': context must be nonempty text.');checkBasis(c,c.measure);
   }
  }
  check(Number.isInteger(s.peak_weekly_demand)&&s.peak_weekly_demand>0,'peak_weekly_demand: enter positive whole parts/week.');
  check(Number.isFinite(s.need_by_weeks)&&s.need_by_weeks>0,'need_by_weeks: enter a positive number.');
  check(s.planning_basis==='heuristic','planning_basis: use heuristic.');
  return null;
 }catch(e){return e.message;}
}
function csvRows(source){
 const rows=[];let row=[],v='',quoted=false;
 for(let i=0;i<=source.length;i++){
  const c=source[i];
  if(c==='"'){if(quoted&&source[i+1]==='"'){v+='"';i++;}else if(quoted||!v)quoted=!quoted;else throw Error('Invalid CSV quoting.');}
  else if((c===','||c==='\n'||c===undefined)&&!quoted){row.push(v.replace(/\r$/,''));v='';if(c!==','){if(row.some(text))rows.push(row);row=[];}}
  else if(c!==undefined)v+=c;
 }
 check(!quoted,'Unterminated CSV quote.');return rows;
}
const columns=['record','field','value','test','name','required','value_type','nominal','lsl','usl','measure','kind','operator','unit','basis','standard','context'];
/** Documented lossless CSV: header, CTQ, test and condition records. */
export function sheetCsv(s){
 const rows=[];
 for(const[field,value]of Object.entries(s))if(!['ctqs','tests','uploaded'].includes(field))rows.push({record:'header',field,value:JSON.stringify(value)});
 for(const c of s.ctqs)rows.push({record:'ctq',...c});
 for(const[id,t]of Object.entries(s.tests)){
  rows.push({record:'test',test:id,name:t.name,required:String(t.required),value_type:t.value_type});
  for(const c of t.conditions)rows.push({record:'condition',test:id,...c,value:JSON.stringify(c.value)});
 }
 const cell=v=>'"'+String(v??'').replaceAll('"','""')+'"';
 return [columns,...rows.map(r=>columns.map(k=>r[k]??''))].map(r=>r.map(cell).join(',')).join('\n')+'\n';
}
function fromCsv(source,unmatched){
 const rows=csvRows(source),keys=rows.shift();check(keys?.includes('record'),'CSV needs a record column (header, ctq, test, condition).');
 check(new Set(keys).size===keys.length,'CSV column names must be unique.');
 const s={ctqs:[],tests:{}};
 for(const values of rows){
  const r=Object.fromEntries(keys.map((k,i)=>[k,values[i]??'']));
  if(values.length!==keys.length||keys.some((k,i)=>!columns.includes(k)&&values[i]))unmatched.push(values.join(', '));
  if(r.record==='header'&&fields.includes(r.field)&&!['ctqs','tests'].includes(r.field)){check(!Object.hasOwn(s,r.field),'Duplicate header field: '+r.field+'.');s[r.field]=scalar(r.value);}
  else if(r.record==='ctq')s.ctqs.push({name:r.name,nominal:scalar(r.nominal),lsl:scalar(r.lsl),usl:scalar(r.usl),unit:r.unit,basis:r.basis,...(r.standard?{standard:r.standard}:{})});
  else if(['test','condition'].includes(r.record)&&testId(r.test)){
   const id=testId(r.test);
   if(r.record==='test'){check(!s.tests[id],'Duplicate test: '+r.test+'.');s.tests[id]={name:r.name,required:scalar(r.required),value_type:r.value_type,conditions:[]};}
   else{check(s.tests[id],'CSV test record must precede conditions: '+r.test+'.');s.tests[id].conditions.push({measure:r.measure,kind:r.kind,operator:r.operator,value:scalar(r.value),unit:r.unit,basis:r.basis,...(r.standard?{standard:r.standard}:{}),...(r.context?{context:r.context}:{})});}
  }else unmatched.push(values.join(', '));
 }
 return s;
}
function fromMarkdown(source,unmatched){
 const s={ctqs:[],tests:{}},headers={'Commodity':'commodity','Part number':'part_no','Part name':'part_name','Revision':'revision','Drawing number':'drawing_no'};
 let section=0,current=null;
 for(const raw of source.split(/\r?\n/)){
  const line=raw.trim();if(!line)continue;
  if(line.startsWith('# ')){check(!Object.hasOwn(s,'header'),'Duplicate sheet header.');s.header=line.slice(2);continue;}
  const heading=/^## ([1-4]) /.exec(line);if(heading){section=Number(heading[1]);current=null;continue;}
  const test=/^### [\d.]+ (.+)$/.exec(line);
  if(test){const name=unescape(test[1]),id=testId(name);current=id;if(!id){unmatched.push(raw);continue;}check(!s.tests[id],'Duplicate test: '+name+'.');const def=RUBRIC.tests.find(t=>t.id===id);s.tests[id]={name,required:false,value_type:def.type,conditions:[]};continue;}
  if(current&&/^(Required|Nice to have)\.$/.test(line)){s.tests[current].required=line==='Required.';continue;}
  if(/^\|[-|]+\|$/.test(line)||['| Field | Value |','| CTQ | Nominal | Lower limit | Upper limit | Unit | Basis |','| Measure | Kind | Limit / condition | Unit | Basis | Context |','| Planning input | Value | Unit | Basis |'].includes(line))continue;
  if(line.startsWith('|')&&line.endsWith('|')){
   const cells=line.slice(1,-1).split('|').map(c=>unescape(c.trim()));
   if(section===1&&Object.hasOwn(headers,cells[0])){check(!Object.hasOwn(s,headers[cells[0]]),'Duplicate header field: '+cells[0]+'.');s[headers[cells[0]]]=cells[1];}
   else if(section===2&&cells.length===6)s.ctqs.push({name:cells[0],nominal:scalar(cells[1]),lsl:scalar(cells[2]),usl:scalar(cells[3]),unit:cells[4],...basis(cells[5])});
   else if(section===3&&current&&cells.length===6){
    const between=/^(.+) to (.+) \(inclusive\)$/.exec(cells[2]),limit=/^([≤≥=]) (.+)$/.exec(cells[2]);
    if(!between&&!limit){unmatched.push(raw);continue;}
    s.tests[current].conditions.push({measure:cells[0],kind:cells[1],operator:between?'between':({'≤':'<=','≥':'>=','=':'='})[limit[1]],value:between?[scalar(between[1]),scalar(between[2])]:scalar(limit[2]),unit:cells[3],...basis(cells[4]),...(cells[5]==='—'?{}:{context:cells[5]})});
   }else if(section===4&&['Peak weekly demand','Need-by lead time'].includes(cells[0])){s[cells[0]==='Peak weekly demand'?'peak_weekly_demand':'need_by_weeks']=scalar(cells[1]);s.planning_basis=cells[3];}
   else unmatched.push(raw);
   continue;
  }
  if(line==='> Synthetic document for a demo. Fictional supplier.'||line==='Both tolerance endpoints are inclusive. These are two-sided drawing tolerances.'||line==='Setup conditions define how the test is run. All acceptance conditions listed for a test must be satisfied. Heuristic limits are proposed synthetic buyer values subject to review; they are not published standard limits.')continue;
  unmatched.push(raw);
 }
 return s;
}
/** Invalid sheets remain available for correction; unmatched content is retained, never silently discarded. */
export function importSheet(source,kind){
 const unmatched=[];let sheet=null;
 try{
  if(kind==='pdf')throw Error('PDF upload is planned for v2.0. Upload JSON, CSV or Markdown.');
  check(typeof source==='string','Expected text content.');
  source=source.replace(/^\uFEFF/,'');
  if(kind==='json'){
   const raw=JSON.parse(source);check(object(raw),'Expected a requirement-sheet object.');sheet={};
   for(const[k,v]of Object.entries(raw))if(fields.includes(k))sheet[k]=v;else if(k!=='uploaded')unmatched.push(k+': '+JSON.stringify(v));
   if(object(sheet.tests)){
    const tests={};for(const[name,v]of Object.entries(sheet.tests)){const id=testId(name);if(id){check(!Object.hasOwn(tests,id),'Duplicate test: '+name+'.');tests[id]=v;}else unmatched.push(name+': '+JSON.stringify(v));}sheet.tests=tests;
   }
  }else if(kind==='csv')sheet=fromCsv(source,unmatched);
  else if(kind==='md'||kind==='markdown')sheet=fromMarkdown(source,unmatched);
  else throw Error('Upload JSON, CSV or Markdown. PDF is planned for v2.0.');
  if(profile(sheet.commodity))sheet.commodity=profile(sheet.commodity).key;
  return {sheet,unmatched,error:sheetError(sheet)};
 }catch(e){return {sheet,unmatched,error:e.message};}
}

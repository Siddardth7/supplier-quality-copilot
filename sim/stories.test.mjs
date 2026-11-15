import test from 'node:test';
import assert from 'node:assert/strict';
import {scorecard,parseHistory} from '../app/engine.js';
import {simulateHistory,renderHistory} from './history.mjs';
import {storyMisses} from './stories.mjs';
async function result(seed){return scorecard(parseHistory(renderHistory(await simulateHistory(seed))),{as_of:'2026-11-01'});}
test('shared story diagnostics accept all six real stories and name real engine failures',async()=>{
 const good=await result(24);for(const supplier of good.suppliers)assert.deepEqual(storyMisses(supplier.supplier_id,supplier),[]);
 for(const [seed,id,misses]of [[1,'ACT-02',['run7 M18','no ucl M7+']],[2,'ACT-02',['run7 M18','no run7 before M18']],[19,'ACT-02',['run7 M18','dppm not bad','no ucl M7+']],[27,'ACT-02',['no run7 before M18']],[147,'ACT-04',['tier B','otd metric_bad M18']],[63,'ACT-05',['tier C','dppm watch']]]){const bad=await result(seed);assert.deepEqual(storyMisses(id,bad.suppliers.find(s=>s.supplier_id===id)),misses);}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const context={URLSearchParams,membership:null};vm.createContext(context);
vm.runInContext((await readFile(new URL('../history.js',import.meta.url),'utf8'))+'\nglobalThis.historyTools={historyQuery,canViewHistory};',context);
test('history queries filter server-side, sort newest first, and fetch the next page beyond the API row limit',()=>{
 const q=context.historyTools.historyQuery('family',{person:'0',from:'2026-09-01',to:'2026-09-30',page:21});
 const params=new URLSearchParams(q.split('?')[1]);assert.equal(params.get('family_id'),'eq.family');assert.equal(params.get('person'),'eq.0');assert.deepEqual(params.getAll('day'),['gte.2026-09-01','lte.2026-09-30']);assert.equal(params.get('order'),'day.desc,person.asc');assert.equal(params.get('offset'),'1050');assert.equal(params.get('limit'),'51');
 const all=new URLSearchParams(context.historyTools.historyQuery('family',{person:'all',from:'',to:'',page:0}).split('?')[1]);assert(!all.has('person'));assert(!all.has('day'));
});
test('only parent accounts are offered the journal screen',()=>{for(const slots of [[0],[1]]){context.membership={slots};assert(context.historyTools.canViewHistory())}for(const slots of [[2,3,4],[2],[]]){context.membership={slots};assert.equal(context.historyTools.canViewHistory(),false)}});

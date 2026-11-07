// Pure synthetic algorithm benchmark. No workspace, note, asset or model access.
import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import { reconcileReadingOrder } from '../src/document-model.ts';
import { legacyReadingOrder } from './reading-order-reference.ts';
const compare=process.argv.includes('--compare'),sizes=process.argv.includes('--stress')?[1000,10000,30000]:[1000,10000],samples=[];
for(let index=0;index<10;index++){const ids=Array.from({length:300},(_,n)=>`warm-${n}`);reconcileReadingOrder([],ids);if(compare)legacyReadingOrder([],ids);}
const median=values=>[...values].sort((a,b)=>a-b)[1];
for(const idKind of ['shared-prefix','uuid-shaped'])for(const size of sizes){
  const visual=Array.from({length:size},(_,index)=>idKind==='shared-prefix'?`synthetic-object-${String(index).padStart(6,'0')}`:`${(Math.imul(index+1,2654435761)>>>0).toString(16).padStart(8,'0')}-0000-4000-8000-${index.toString(16).padStart(12,'0')}`);
  for(const mode of ['new-document','mixed-logical-order','unchanged-order']){
    const previous=mode==='new-document'?[]:mode==='mixed-logical-order'?visual.filter((_,index)=>index%2===0).reverse():visual;
    const times={current:[],legacy:[]};let output;
    if(compare)assert.deepEqual(reconcileReadingOrder(previous,visual),legacyReadingOrder(previous,visual));
    for(let run=0;run<3;run++)for(const name of compare?(run%2?['legacy','current']:['current','legacy']):['current']){
      const start=performance.now();output=(name==='legacy'?legacyReadingOrder:reconcileReadingOrder)(previous,visual);times[name].push(performance.now()-start);
    }
    if(output.length!==size||new Set(output).size!==size)throw new Error('Synthetic reconciliation lost identity');
    samples.push({idKind,size,mode,currentMedianMs:median(times.current),...(compare?{legacyMedianMs:median(times.legacy)}:{}),timesMs:times});
  }
}
console.log(JSON.stringify({syntheticOnly:true,algorithmOnly:true,referenceHardware:false,node:process.version,paired:compare,samples},null,2));

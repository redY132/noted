import test from 'node:test';import assert from 'node:assert/strict';
import {reconcileReadingOrder} from './document-model.ts';import {legacyReadingOrder} from '../scripts/reading-order-reference.ts';
test('new objects stay beside their visual predecessor without reordering existing logical content',()=>{
  for(const [previous,visual,expected]of [
    [['a','c'],['a','b','c'],['a','b','c']],
    [['b','a'],['a','new','b'],['b','a','new']],
    [['b','a'],['new-1','new-2','a','b'],['new-1','new-2','b','a']],
    [['a','b','c'],['new-0','a','new-1','c','new-2','b','new-3'],['new-0','a','new-1','b','new-3','c','new-2']],
    [['deleted','a','c'],['a','b','c'],['a','b','c']],
    [['a','a'],['a','b'],['a','b','a']],
    [[],['b','b','a'],['b','a']],
    [[],['a','b','a','c'],['a','c','b']],
    [['__proto__'],['constructor','__proto__','toString'],['constructor','__proto__','toString']],
  ])assert.deepEqual(reconcileReadingOrder(previous,visual),expected);
});
test('linear reconciliation matches the prior algorithm across seeded deletions, duplicates and arbitrary visual/logical orders',()=>{
  let state=0x6e6f7465;const random=(max:number)=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return Math.floor(state/0x100000000*max);};
  for(let sample=0;sample<3000;sample++){
    const previous=Array.from({length:random(32)},()=>`old-${random(24)}`),visual=Array.from({length:random(36)},()=>`${random(4)?'old':'new'}-${random(24)}`),before=[...previous],projection=[...visual];
    assert.deepEqual(reconcileReadingOrder(previous,visual),legacyReadingOrder(previous,visual),`Synthetic case ${sample}`);assert.deepEqual(previous,before);assert.deepEqual(visual,projection);
  }
});
test('large new and mixed documents preserve every identity and the exact logical pair order',()=>{
  const visual=Array.from({length:50000},(_,index)=>`node-${index}`);
  assert.deepEqual(reconcileReadingOrder([],visual),visual);
  const previous=visual.filter((_,index)=>index%2===0).reverse(),expected=previous.flatMap(id=>[id,`node-${Number(id.slice(5))+1}`]);
  assert.deepEqual(reconcileReadingOrder(previous,visual),expected);assert.deepEqual(reconcileReadingOrder(expected,visual),expected);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { previewRelationOperation, type PreviewRelations } from './relations-preview.ts';
import type { Note, NoteSummary, PairMutation } from './model.ts';
const ids=[1,2,3].map(n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`);
const notes=ids.map((id,i):Note=>({id,title:`Topic ${i}`,folderId:null,tags:['topic'],revision:1,revisionToken:'token',formatVersion:1,createdAt:'2026-01-01',updatedAt:'2026-01-01',presentation:{schemaId:'default'},content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Private words'}]}]}}));
test('suggestions reject boilerplate and broad collection tags but keep distinctive topics',()=>{
  const corpus=Array.from({length:50},(_,i)=>({...structuredClone(notes[0]),id:`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,title:`Observation ${i} first attempt`,tags:['semantic-sample'],content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:(i<2?'Sourdough starter fermentation flour bread yeast. ':'Astronomy telescope galaxy planet orbit. ')+'Compare the result next week and record one observation.'}]}]}}));
  const result=previewRelationOperation({},'related_notes',{noteId:corpus[0].id},corpus,[]) as {items:{note:NoteSummary}[]};
  assert.deepEqual(result.items.map(n=>n.note.id),[corpus[1].id]);
});
test('mutual connections are idempotent, preserve documents and use revision-checked Undo',()=>{
  const state:PreviewRelations={}; const original=JSON.stringify(notes);
  const run=(command:string,args:Record<string,unknown>)=>previewRelationOperation(state,command,args,notes,[]);
  const result=run('set_relation',{a:ids[1],b:ids[0],connected:true}) as PairMutation;
  assert.equal(result.state.a,ids[0]);assert.equal(result.state.revision,1);
  assert.equal((run('set_relation',{a:ids[0],b:ids[1],connected:true}) as PairMutation).changed,false);
  assert.equal((run('list_connections',{noteId:ids[1]}) as {total:number}).total,1);
  run('set_relation',{a:ids[0],b:ids[1],connected:false,expectedRevision:1});
  assert.throws(()=>run('set_relation',{a:ids[0],b:ids[1],connected:true,expectedRevision:1}),/changed/);
  assert.equal(JSON.stringify(notes),original);
});
test('dismissal is mutual and durable state; manual connecting clears it',()=>{
  const state:PreviewRelations={}; const run=(command:string,args:Record<string,unknown>)=>previewRelationOperation(state,command,args,notes,[]);
  run('set_relation',{a:ids[0],b:ids[1],dismissed:true});
  const reloaded=JSON.parse(JSON.stringify(state));
  const list=previewRelationOperation(reloaded,'related_notes',{noteId:ids[1]},notes,[]) as {items:{note:NoteSummary}[]};
  assert.ok(!list.items.some(n=>n.note.id===ids[0]));
  run('set_relation',{a:ids[0],b:ids[1],connected:true});assert.equal(Object.values(state)[0].dismissed,false);
  assert.throws(()=>run('set_relation',{a:ids[0],b:ids[0],connected:true}));
});
test('connection export contains saved pair state and revisions without note contents',()=>{
  const state:PreviewRelations={};
  previewRelationOperation(state,'set_relation',{a:ids[0],b:ids[1],connected:true},notes,[]);
  previewRelationOperation(state,'set_relation',{a:ids[1],b:ids[2],dismissed:true},notes,[]);
  const snapshot=previewRelationOperation(state,'export_relations',{},notes,[]) as {formatVersion:number;pairs:{connected:boolean;dismissed:boolean;revision:number}[]};
  assert.equal(snapshot.formatVersion,2);assert.equal(snapshot.pairs.length,2);
  assert.equal(snapshot.pairs.filter(pair=>pair.connected).length,1);assert.equal(snapshot.pairs.filter(pair=>pair.dismissed).length,1);
  assert.ok(snapshot.pairs.every(pair=>pair.revision===1));assert.ok(!JSON.stringify(snapshot).includes('Private words'));
});
test('references retain multiple inline/image provenance and missing connected targets',()=>{
  const state:PreviewRelations={}; const copy=structuredClone(notes);
  copy[0].content={type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'First',marks:[{type:'link',attrs:{href:`noted://note/${ids[1]}`}}]}]},{type:'localImage',attrs:{href:`noted://note/${ids[1]}`}}]};
  previewRelationOperation(state,'set_relation',{a:ids[0],b:ids[1],connected:true},copy,[]);
  const incoming=previewRelationOperation(state,'list_references',{noteId:ids[1]},copy,[]) as {items:{incoming:number}[]};
  assert.equal(incoming.items[0].incoming,2);
  const missing=previewRelationOperation(state,'list_connections',{noteId:ids[0]},[copy[0]],[]) as {items:{note:Note|null}[]};
  assert.equal(missing.items[0].note,null);
});

test('preview strengths migrate legacy pairs, validate inputs and restore through revision-safe Undo',()=>{
  const state:PreviewRelations={};const run=(args:Record<string,unknown>)=>previewRelationOperation(state,'set_relation',args,notes,[]) as PairMutation;
  const initial=run({a:ids[0],b:ids[1],connected:true});assert.equal(initial.state.strength,3);
  const changed=run({a:ids[0],b:ids[1],strength:5,expectedRevision:initial.state.revision});assert.equal(changed.state.revision,2);assert.equal(changed.previous.strength,3);
  assert.throws(()=>run({a:ids[0],b:ids[1],strength:2,expectedRevision:1}),/changed/);
  const undone=run({a:ids[0],b:ids[1],strength:changed.previous.strength,expectedRevision:changed.state.revision});assert.equal(undone.state.strength,3);
  for(const strength of [0,6,2.5,'5'])assert.throws(()=>run({a:ids[0],b:ids[1],strength}),/integer/);
  assert.throws(()=>run({a:ids[0],b:ids[2],strength:5}),/confirmed/);
  delete (Object.values(state)[0] as Partial<import('./model.ts').PairState>).strength;
  const exported=previewRelationOperation(state,'export_relations',{},notes,[]) as {pairs:{strength:number}[]};assert.equal(exported.pairs[0].strength,3);
});

test('connected search includes body, prioritizes exact titles, and never admits unconnected results',()=>{
  const corpus=structuredClone(notes),state:PreviewRelations={};corpus[1].title='Palimpsest';corpus[2].title='Other';corpus[2].updatedAt='2026-12-01';
  for(const note of corpus.slice(1))note.content={type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Palimpsest marginalia'}]}]};
  previewRelationOperation(state,'set_relation',{a:ids[0],b:ids[1],connected:true},corpus,[]);
  const search=(scope:string,query:string)=>previewRelationOperation(state,'connection_search',{sourceId:ids[0],scope,query},corpus,[]) as {items:{note:NoteSummary}[];semanticAvailable:boolean};
  assert.deepEqual(search('connected','marginalia').items.map(n=>n.note.id),[ids[1]]);
  assert.deepEqual(search('workspace','palimpsest').items.map(n=>n.note.id),[ids[1],ids[2]]);
  assert.equal(search('connected','').semanticAvailable,false);
  assert.throws(()=>search('invalid',''),/scope/);
});

test('visible edge reads enforce node and edge bounds and preserve saved strengths',()=>{
  const corpus=Array.from({length:25},(_,i)=>({...structuredClone(notes[0]),id:`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`})),state:PreviewRelations={};
  for(let a=0;a<corpus.length;a++)for(let b=a+1;b<corpus.length;b++)previewRelationOperation(state,'set_relation',{a:corpus[a].id,b:corpus[b].id,connected:true,strength:a===0?5:3},corpus,[]);
  const edges=previewRelationOperation(state,'connection_edges',{noteIds:corpus.map(n=>n.id)},corpus,[]) as {strength:number}[];
  assert.equal(edges.length,180);assert.equal(edges[0].strength,5);
  assert.throws(()=>previewRelationOperation(state,'connection_edges',{noteIds:Array(61).fill(ids[0])},corpus,[]),/60/);
});

test('manual strength only reranks qualified suggestions with a bounded bonus',()=>{
  const corpus=Array.from({length:50},(_,i)=>({...structuredClone(notes[0]),id:`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,title:`Observation ${i}`,tags:[],content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:i<3?'Sourdough starter fermentation flour bread yeast.':'Astronomy telescope galaxy planet orbit.'}]}]}})),state:PreviewRelations={};
  const related=()=>previewRelationOperation(state,'related_notes',{noteId:corpus[0].id},corpus,[]) as {items:{note:NoteSummary;score:number}[]};
  const baseline=related().items.find(n=>n.note.id===corpus[2].id)!.score;
  for(const [a,b] of [[0,3],[3,2],[3,4]])previewRelationOperation(state,'set_relation',{a:corpus[a].id,b:corpus[b].id,connected:true,strength:5},corpus,[]);
  const result=related().items;assert.ok(Math.abs(result.find(n=>n.note.id===corpus[2].id)!.score/baseline-1.2)<.00001);
  assert.ok(!result.some(n=>n.note.id===corpus[4].id),'a graph path alone never qualifies a candidate');
});


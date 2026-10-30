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
  assert.equal(snapshot.formatVersion,1);assert.equal(snapshot.pairs.length,2);
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


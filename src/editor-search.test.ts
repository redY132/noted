import test from 'node:test';
import assert from 'node:assert/strict';
import { getSchema } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { findInDocument } from './editor-search.ts';
const schema=getSchema([StarterKit]);
const text=(value:string,bold=false)=>schema.text(value,bold?[schema.marks.bold.create()]:[]);
const p=(...nodes:ReturnType<typeof text>[])=>schema.nodes.paragraph.create(null,nodes);
test('find spans inline marks, treats punctuation literally, and preserves Unicode offsets',()=>{
 const doc=schema.nodes.doc.create(null,[p(text('Hello '),text('WORLD',true),text(' a.b İx'))]);
 const result=findInDocument(doc,'hello world');
 assert.deepEqual(result.matches,[{from:1,to:12}]);
 assert.equal(doc.textBetween(result.matches[0].from,result.matches[0].to),'Hello WORLD');
 const literal=findInDocument(doc,'a.b');assert.equal(literal.matches.length,1);
 const unicode=findInDocument(doc,'x');assert.equal(doc.textBetween(unicode.matches[0].from,unicode.matches[0].to),'x');
 assert.equal(findInDocument(doc,'world',true).matches.length,0);
});
test('find stays within text blocks and bounds very common searches explicitly',()=>{
 const doc=schema.nodes.doc.create(null,[p(text('One')),p(text('Two aaa'))]);
 assert.equal(findInDocument(doc,'OneTwo').matches.length,0);
 assert.deepEqual(findInDocument(doc,''),{matches:[],truncated:false});
 const result=findInDocument(doc,'a',false,2);
 assert.equal(result.matches.length,2);assert.equal(result.truncated,true);
});

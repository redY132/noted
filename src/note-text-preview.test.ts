import test from 'node:test';import assert from 'node:assert/strict';
import { noteTextPreview } from './note-text-preview.ts';import type { Note } from './model.ts';import { documentFromEditor } from './document-model.ts';
const note=(content:Note['content'])=>({id:'synthetic',content} as Note);
test('text previews preserve logical object order while representing images and component fallbacks without execution',()=>{
  const n=note({type:'doc',attrs:{readingOrder:['b','a','image','component']},content:[{type:'paragraph',attrs:{id:'a'},content:[{type:'text',text:'Visually first'}]},{type:'paragraph',attrs:{id:'b'},content:[{type:'text',text:'Logically first'}]},{type:'localImage',attrs:{id:'image',assetId:'image-id',alt:'Synthetic illustration'}},{type:'interactiveComponent',attrs:{id:'component',definitionId:'counter',definitionVersion:1,fallback:'Readable counter fallback'}}]});n.document=documentFromEditor(n.content,n.id);
  assert.equal(noteTextPreview(n).text,'Logically first\n\nVisually first\n\n[Image: Synthetic illustration]\n\nReadable counter fallback');
});
test('plain previews keep block boundaries, task state, code and table-cell separation',()=>{
  const n=note({type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'One'},{type:'hardBreak'},{type:'text',text:'Two'}]},{type:'taskItem',attrs:{checked:true},content:[{type:'paragraph',content:[{type:'text',text:'Complete'}]}]},{type:'codeBlock',content:[{type:'text',text:'const value = 1;'}]},{type:'table',content:[{type:'tableRow',content:[{type:'tableCell',content:[{type:'paragraph',content:[{type:'text',text:'A'}]}]},{type:'tableCell',content:[{type:'paragraph',content:[{type:'text',text:'B'}]}]}]}]}]});
  assert.equal(noteTextPreview(n).text,'One\nTwo\n[x] Complete\nconst value = 1;\nA\tB');
});
test('bounded preview text does not split a surrogate pair or change its source note',()=>{
  const n=note({type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'A😀B'}]}]}),original=structuredClone(n);
  assert.deepEqual(noteTextPreview(n,2),{text:'A',shortened:true});assert.deepEqual(noteTextPreview(n,4),{text:'A😀B',shortened:false});assert.deepEqual(n,original);
});

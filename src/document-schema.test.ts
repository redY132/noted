import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { Editor, type JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TextStyle, Color } from '@tiptap/extension-text-style';
import {documentFromEditor} from './document-model.ts';
import {createEditorExtensions} from './editor-extensions.ts';
import {schemaProjection,schemaAdherence} from './document-schema.ts';
import { SchemaIndentation } from './editor-extensions.ts';
import { applySchema, bindSchemaRegistry, BUILTIN_SCHEMAS, previewSchema, SchemaPresentation, SchemaRegistry, setSchemaReference, validateDocumentSchema, validSchemaPolicy, validSchemaStyle, type DocumentSchema } from './document-schema.ts';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true, url: 'http://localhost/' });
Object.defineProperties(globalThis, {
  window: { value: dom.window, configurable: true }, document: { value: dom.window.document, configurable: true },
  navigator: { value: dom.window.navigator, configurable: true }, Node: { value: dom.window.Node, configurable: true },
  HTMLElement: { value: dom.window.HTMLElement, configurable: true }, Element: { value: dom.window.Element, configurable: true },
  MutationObserver: { value: dom.window.MutationObserver, configurable: true }, getComputedStyle: { value: dom.window.getComputedStyle.bind(dom.window), configurable: true },
  requestAnimationFrame: { value: dom.window.requestAnimationFrame.bind(dom.window), configurable: true }, cancelAnimationFrame: { value: dom.window.cancelAnimationFrame.bind(dom.window), configurable: true },
});
function editor(content: JSONContent[] = [{ type: 'paragraph', content: [{ type: 'text', text: 'Keep every word.' }] }]) {
  const element = document.createElement('div'); document.body.append(element);
  return new Editor({ element, extensions: [StarterKit, SchemaIndentation, TextStyle, Color, SchemaPresentation], content: { type: 'doc', content } });
}
const custom: DocumentSchema = { formatVersion: 1, id: 'custom', version: 1, name: 'My schema', rules: { body: { fontFamily: 'serif', fontSize: 20, color: '#123456', spacing: 10, indent: 2 }, heading2: { fontFamily: 'system', fontSize: 30, lineHeight: 1.2 } } };

test('schema definitions reject unregistered properties, invalid colors, and self-authorized policy fields', () => {
  validateDocumentSchema(custom);
  for (const value of [
    { ...custom, version: 0 }, { ...custom, rules: { body: { position: 'absolute' } } },
    { ...custom, rules: { body: { color: 'url(https://example.com)' } } },
    { ...custom, rules: { body: { fontSize: 10000 } } }, { ...custom, rules: { body: { fontFamily: 'url(evil)' } } },
    { ...custom, rules: { body: { lineHeight: Number.NaN } } }, { ...custom, grant: 'content' },
  ]) assert.throws(() => validateDocumentSchema(value));
  assert.equal(validSchemaStyle({ indent: 9 }), false);
  assert.equal(validSchemaPolicy({ mode: 'automatic', enabledRules: ['color', 'code'] }), false);
  assert.equal(validSchemaPolicy({ mode: 'automatic', enabledRules: ['color', 'color'] }), false);
});

test('registry preserves immutable versions, pins exact versions, and does not publish failed writes', async () => {
  const writes: DocumentSchema[][] = [];
  const registry = new SchemaRegistry([], definitions => { writes.push(definitions); });
  await registry.publish(custom);
  await registry.publish({ ...custom, version: 2, rules: { body: { fontSize: 22 } } });
  assert.equal(registry.get({ id: 'custom', version: 1 })?.rules.body.fontSize, 20);
  assert.equal(registry.get({ id: 'custom', version: 2 })?.rules.body.fontSize, 22);
  assert.equal(registry.nextVersion('custom'), 3);
  assert.throws(() => { registry.get(custom)!.rules.body.fontSize = 99; });
  await assert.rejects(registry.publish({ ...custom, rules: { body: { fontSize: 30 } } }), /already exists/);
  assert.equal(writes.length, 2);
  const failed = new SchemaRegistry([], () => { throw new Error('Disk full'); });
  await assert.rejects(failed.publish(custom), /Disk full/);
  assert.equal(failed.get(custom), undefined);
  assert.throws(() => registry.import([{ ...custom, version: 3 }, { ...custom, version: 0 }]), /Invalid schema/);
  assert.equal(registry.get({ id: 'custom', version: 3 }), undefined, 'import batch is atomic');
});

test('preview is read-only and applying suggestions preserves explicit color, indentation, links, selection, and one-step history', () => {
  const e = editor([
    { type: 'paragraph', attrs: { indent: 3 }, content: [{ type: 'text', text: 'A link', marks: [{ type: 'link', attrs: { href: 'noted://note/00000000-0000-4000-8000-000000000001' } }, { type: 'textStyle', attrs: { color: '#ff0000' } }] }] },
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Heading remains.' }] },
  ]);
  try {
    e.commands.setTextSelection({ from: 2, to: 5 });
    const before = e.getJSON(), selection = e.state.selection.toJSON(), text = e.state.doc.textContent;
    const changes = previewSchema(e, custom);
    assert.equal(changes.length, before.content!.length); assert.deepEqual(e.getJSON(), before);
    assert.equal(applySchema(e, custom), before.content!.length);
    assert.equal(e.state.doc.textContent, text);
    assert.deepEqual(e.state.selection.toJSON(), selection);
    assert.equal(e.getJSON().content![0].attrs!.indent, 3, 'hand-set indent wins in suggestion mode');
    assert.deepEqual(e.getJSON().content![0].content, before.content![0].content, 'all words and marks preserved');
    assert.equal(e.view.dom.querySelector('span')!.style.color, 'rgb(255, 0, 0)', 'explicit inline color stays present');
    assert.equal(e.commands.undo(), true); assert.deepEqual(e.getJSON(), before);
    assert.equal(e.commands.redo(), true); assert.equal(e.getJSON().content![1].attrs!.schemaStyle.fontSize, 30);
  } finally { e.destroy(); }
});

test('stale schema previews never change a newly edited document', () => {
  const e = editor();
  try {
    const doc = e.state.doc; e.commands.insertContent('New words'); const before = e.getJSON();
    assert.throws(() => applySchema(e, custom, { mode: 'suggest', enabledRules: [] }, doc), /changed after preview/);
    assert.deepEqual(e.getJSON(), before);
  } finally { e.destroy(); }
});

test('automatic rules are opt-in, selected individually, and only normalize changed text blocks', () => {
  const e = editor([
    { type: 'paragraph', attrs: { indent: 4 }, content: [{ type: 'text', text: 'First' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Second' }] },
    ...Array.from({ length: 500 }, () => ({ type: 'paragraph', content: [{ type: 'text', text: 'Untouched' }] })),
  ]);
  try {
    bindSchemaRegistry(e, new SchemaRegistry([custom]));
    setSchemaReference(e, { id: custom.id, version: custom.version }, { mode: 'automatic', enabledRules: ['fontSize'] });
    assert.equal(e.getJSON().content![0].attrs!.schemaStyle, null, 'choosing auto does not rewrite existing text');
    e.commands.setTextSelection(2); e.commands.insertContent('x');
    const saved = e.getJSON();
    assert.deepEqual(saved.content![0].attrs!.schemaStyle, { fontSize: 20 });
    assert.equal(saved.content![0].attrs!.indent, 4);
    assert.equal(saved.content![1].attrs!.schemaStyle, null);
    assert.equal(saved.content![501].attrs!.schemaStyle, null);
    e.commands.undo();
    assert.equal(e.state.doc.textContent.startsWith('First'), true, 'automatic style joins typing undo');
    assert.equal(e.getJSON().content![0].attrs!.schemaStyle, null);
  } finally { e.destroy(); }
});

test('manual typography without schema provenance wins, and unknown pinned schemas stay inert', () => {
  const e = editor([{ type: 'paragraph', attrs: { schemaStyle: { fontSize: 23 } }, content: [{ type: 'text', text: 'Custom' }] }]);
  try {
    applySchema(e, custom);
    assert.equal(e.getJSON().content![0].attrs!.schemaStyle.fontSize, 23);
    bindSchemaRegistry(e, new SchemaRegistry());
    setSchemaReference(e, { id: 'missing', version: 1 }, { mode: 'automatic', enabledRules: ['fontSize'] });
    e.commands.insertContent('x');
    assert.equal(e.getJSON().content![0].attrs!.schemaStyle.fontSize, 23);
    assert.equal(BUILTIN_SCHEMAS.every(schema => schema.version === 1), true);
  } finally { e.destroy(); }
});

test('Free Placement preserves object IDs, words and order through preview, apply and one Undo',()=>{const element=document.createElement('div');document.body.append(element);const editor=new Editor({element,extensions:createEditorExtensions(()=> 'default'),content:{type:'doc',content:[{type:'paragraph',attrs:{id:'first'},content:[{type:'text',text:'First original paragraph.'}]},{type:'paragraph',attrs:{id:'second'},content:[{type:'text',text:'Second original paragraph.'}]}]}});try{const before=editor.getJSON(),doc=documentFromEditor(before,'fixture'),schema=BUILTIN_SCHEMAS.find(s=>s.id==='free-placement')!;const candidate=schemaProjection(editor,schema,{mode:'suggest',enabledRules:[]});assert.deepEqual(editor.getJSON(),before);const next=documentFromEditor(candidate,'fixture',doc);assert.deepEqual(next.readingOrder,doc.readingOrder);assert.deepEqual(next.objects,doc.objects);assert.equal(next.layout.children?.every(n=>n.style?.placement==='free'),true);assert.deepEqual(schemaAdherence(next,schema),[]);assert.equal(applySchema(editor,schema),1);assert.equal(editor.state.doc.child(0).type.name,'notePanel');assert.equal(editor.commands.undo(),true);assert.deepEqual(editor.getJSON(),before);const undone=documentFromEditor(editor.getJSON(),'fixture',next);assert.equal(undone.schemaRef,undefined);assert.deepEqual(undone.layout,doc.layout);}finally{editor.destroy();element.remove();}});
test('full document schema guides validate without changing their source and reject truncation or executable content',()=>{const e=editor();try{const guide=documentFromEditor(e.getJSON(),'guide');const original=JSON.stringify(guide);const s:DocumentSchema={formatVersion:2,id:'guide',version:1,name:'Guide',rules:{body:{}},guide:{title:'Full example',document:guide}};validateDocumentSchema(s);const registry=new SchemaRegistry([s]);assert.equal(JSON.stringify(guide),original);assert.equal(Object.isFrozen(registry.get(s)!.guide!.document),true);assert.throws(()=>validateDocumentSchema({...s,formatVersion:1}));assert.throws(()=>validateDocumentSchema({...s,formatVersion:'2'}));const dynamic=structuredClone(guide),id=dynamic.readingOrder[0];dynamic.objects[id]={id,kind:'component',definition:{id:'fixture',version:1},props:{},state:{},fallback:'Static fallback'};assert.throws(()=>validateDocumentSchema({...s,guide:{title:'Dynamic',document:dynamic}}),/without executable/);const huge=structuredClone(guide),object=Object.values(huge.objects)[0];if(object.kind==='richText')object.content.content=[{type:'text',text:'x'.repeat(140*1024)}];assert.throws(()=>validateDocumentSchema({...s,guide:{title:'Huge',document:huge}}),/128 KiB/);}finally{e.destroy();}});
test('formal adherence checks detect explicit inline color overrides',()=>{const e=editor([{type:'paragraph',attrs:{id:'p',schemaStyle:{color:'#123456'}},content:[{type:'text',text:'Original',marks:[{type:'textStyle',attrs:{color:'#654321'}}]}]}]);try{const doc=documentFromEditor(e.getJSON(),'test');const s:DocumentSchema={formatVersion:2,id:'color',version:1,name:'Color',rules:{body:{color:'#123456'}}};assert.match(schemaAdherence(doc,s).join(' '),/Inline color/);}finally{e.destroy();}});

test('default-color adherence accepts an omitted color without demanding redundant attributes',()=>{const e=editor();try{const s:DocumentSchema={formatVersion:2,id:'default-color',version:1,name:'Default color',rules:{body:{color:null}}};assert.deepEqual(schemaAdherence(documentFromEditor(e.getJSON(),'fixture'),s),[]);}finally{e.destroy();}});

test('reopening native definitions ignores JSON key order while still rejecting semantic version collisions',()=>{const reorder=(v:any):any=>Array.isArray(v)?v.map(reorder):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,value])=>[k,reorder(value)])):v;const registry=new SchemaRegistry([reorder(custom),...BUILTIN_SCHEMAS.map(reorder)]);assert.equal(registry.get(custom)!.rules.body.fontSize,20);assert.throws(()=>registry.import([{...reorder(custom),name:'Different meaning'}]),/already exists/);assert.equal(registry.get(custom)!.name,custom.name);});

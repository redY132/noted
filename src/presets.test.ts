import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';import {Editor} from '@tiptap/core';import {createEditorExtensions} from './editor-extensions.ts';import {presetProjection,NOTE_PRESETS} from './presets.ts';import {documentFromEditor} from './document-model.ts';import {applyEditorProjection} from './document-editor.ts';
const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true, url: 'http://localhost/' });
Object.defineProperties(globalThis, {
  window: { value: dom.window, configurable: true }, document: { value: dom.window.document, configurable: true },
  navigator: { value: dom.window.navigator, configurable: true }, Node: { value: dom.window.Node, configurable: true },
  HTMLElement: { value: dom.window.HTMLElement, configurable: true }, Element: { value: dom.window.Element, configurable: true },
  MutationObserver: { value: dom.window.MutationObserver, configurable: true }, getComputedStyle: { value: dom.window.getComputedStyle.bind(dom.window), configurable: true },
  requestAnimationFrame: { value: dom.window.requestAnimationFrame.bind(dom.window), configurable: true }, cancelAnimationFrame: { value: dom.window.cancelAnimationFrame.bind(dom.window), configurable: true },
});


for (const preset of NOTE_PRESETS) test(`preset ${preset.id} preserves authorship and one-step Undo`, () => {
  const e = new Editor({
    element: document.createElement('div'), extensions: createEditorExtensions(),
    content: {type:'doc',content:[
      {type:'heading',attrs:{id:'heading',level:2},content:[{type:'text',text:'My title'}]},
      {type:'paragraph',attrs:{id:'body'},content:[{type:'text',text:'My linked words',marks:[{type:'link',attrs:{href:'noted://note/00000000-0000-4000-8000-000000000001'}}]}]},
      {type:'taskList',attrs:{id:'tasks'},content:[{type:'taskItem',attrs:{id:'task',checked:true},content:[{type:'paragraph',attrs:{id:'task-text'},content:[{type:'text',text:'Done task'}]}]}]},
    ]},
  });
  try {
    const before=e.getJSON(),doc=documentFromEditor(before,'fixture'),text=e.state.doc.textContent;
    const candidate=presetProjection(e,preset.id);
    assert.deepEqual(e.getJSON(),before,'preview cannot mutate the live editor');
    const after=documentFromEditor(candidate,'fixture',doc);
    assert.deepEqual(after.readingOrder,doc.readingOrder);
    const tasks=after.objects.tasks;if(tasks.kind!=='richText')throw new Error('Task object changed kind');assert.equal(tasks.content.content?.[0].attrs?.checked,true);assert.equal(tasks.content.content?.[0].attrs?.id,'task');assert.equal(tasks.content.content?.[0].content?.[0].attrs?.id,'task-text');
    assert.equal(JSON.stringify(after.objects.body).includes('noted://note/'),true);
    applyEditorProjection(e,candidate);assert.equal(e.state.doc.textContent,text);
    assert(e.commands.undo());assert.deepEqual(e.getJSON(),before);
  } finally {e.destroy();}
});

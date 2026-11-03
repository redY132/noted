import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {Editor} from '@tiptap/core';
import {createEditorExtensions} from './editor-extensions.ts';
import {installComponentDefinition,type ComponentMount,type ComponentRuntimeHost} from './component-runtime.ts';
import {counterComponent} from './component-runtime-examples.ts';

const dom=new JSDOM('<!doctype html><body></body>',{url:'https://noted.test',pretendToBeVisual:true});
for(const name of ['window','document','navigator','localStorage','Node','HTMLElement','Element','MutationObserver'] as const)Object.defineProperty(globalThis,name,{configurable:true,value:name==='window'?dom.window:dom.window[name]});
Object.defineProperties(globalThis,{
  getComputedStyle:{configurable:true,value:dom.window.getComputedStyle.bind(dom.window)},
  requestAnimationFrame:{configurable:true,value:dom.window.requestAnimationFrame.bind(dom.window)},
  cancelAnimationFrame:{configurable:true,value:dom.window.cancelAnimationFrame.bind(dom.window)},
});
function setup(id:string){
  const mounts:ComponentMount[]=[],updates:ComponentMount['input'][]=[];let destroyed=0;
  const runtime={mount(options:ComponentMount){mounts.push(options);return {update(input:ComponentMount['input']){updates.push(structuredClone(input));},destroy(){destroyed++;},async resume(){}};}} as unknown as ComponentRuntimeHost;
  const element=document.createElement('div');document.body.append(element);
  const editor=new Editor({element,extensions:createEditorExtensions(()=> 'default',{runtime}),content:{type:'doc',content:[
    {type:'paragraph',attrs:{id:'bound'},content:[{type:'text',text:'Original authored text'}]},
    {type:'interactiveComponent',attrs:{id:'widget',definitionId:id,definitionVersion:1,properties:{},state:{count:4},fallback:'Saved readable fallback'}},
  ]}});
  return {editor,mounts,updates,destroyed:()=>destroyed};
}
test('declared text bindings refresh after typing and Undo without persisting component state',()=>{
  const definition={...counterComponent,manifest:{...counterComponent.manifest,id:'test.binding',bindings:['bound']}};
  installComponentDefinition(definition);
  const {editor,mounts,updates,destroyed}=setup('test.binding');
  try{
    assert.equal(mounts[0].input.bindings.bound,'Original authored text');
    assert.equal(mounts[0].fallback,'Saved readable fallback');
    editor.commands.insertContentAt(1,'New ');
    assert.equal(updates.at(-1)!.bindings.bound,'New Original authored text');
    assert.equal(editor.commands.undo(),true);
    assert.equal(updates.at(-1)!.bindings.bound,'Original authored text');
    assert.equal(editor.getJSON().content![1].attrs!.state.count,4);
    const before=updates.length;editor.commands.setTextSelection(2);
    assert.equal(updates.length,before,'selection changes do not request component work');
  }finally{editor.destroy();}
  assert.equal(destroyed(),1);
});
test('importing a missing exact definition recovers its existing view without changing saved data',()=>{
  const {editor,mounts}=setup('test.missing');
  try{
    const before=editor.getJSON();assert.equal(mounts.length,0);
    assert.match(editor.view.dom.textContent!,/Saved readable fallback/);
    installComponentDefinition({...counterComponent,manifest:{...counterComponent.manifest,id:'test.missing'}});
    assert.equal(mounts.length,1);assert.equal(mounts[0].input.state.count,4);
    assert.deepEqual(editor.getJSON(),before);assert.equal(editor.can().undo(),false);
  }finally{editor.destroy();}
});

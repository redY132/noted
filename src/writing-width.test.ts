import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { initializeWritingWidth } from './writing-width.ts';

function fixture(storage?:Pick<Storage,'getItem'|'setItem'>|null){
 const dom=new JSDOM('<section id="appearance"><button id="reset-appearance">Reset appearance</button></section><article>Unchanged synthetic note</article>',{url:'http://localhost'});
 const doc=dom.window.document,host=doc.querySelector<HTMLElement>('#appearance')!;
 const create=()=>initializeWritingWidth(host,{storage,root:doc.documentElement});
 return{dom,doc,host,create};
}
test('writing width persists only its own device preference and reset restores Full',()=>{
 const h=fixture();const original=h.doc.querySelector('article')!.outerHTML;
 try{
  const ui=h.create(),select=h.doc.querySelector<HTMLSelectElement>('#writing-width')!;
  assert.equal(ui.get(),'full');h.dom.window.localStorage.setItem('noted-appearance-v1','keep theme');
  select.value='comfortable';select.dispatchEvent(new h.dom.window.Event('change'));
  assert.equal(ui.get(),'comfortable');assert.equal(h.doc.documentElement.style.getPropertyValue('--writing-column-width'),'760px');
  ui.destroy();const reopened=h.create();assert.equal(reopened.get(),'comfortable');
  h.doc.querySelector<HTMLButtonElement>('#reset-appearance')!.click();assert.equal(reopened.get(),'full');
  assert.equal(h.dom.window.localStorage.getItem('noted-appearance-v1'),'keep theme');assert.equal(h.doc.querySelector('article')!.outerHTML,original);
  reopened.destroy();assert.equal(h.doc.querySelector('#writing-width'),null);
 }finally{h.dom.window.close();}
});
test('writing width fails safely on invalid or unavailable storage and never injects arbitrary CSS',()=>{
 for(const value of ['{','{"version":1,"width":"constructor"}','{"version":1,"width":"url(secret)"}','{"version":99,"width":"narrow"}']){
  const h=fixture({getItem:()=>value,setItem:()=>{throw Error('Fixture quota');}});
  try{
   const ui=h.create();assert.equal(ui.get(),'full');const select=h.doc.querySelector<HTMLSelectElement>('#writing-width')!;
   select.value='narrow';select.dispatchEvent(new h.dom.window.Event('change'));assert.equal(ui.get(),'narrow');
   assert.match(h.host.querySelector('[role=status]')!.textContent!,/session/);
   select.value='not a width';select.dispatchEvent(new h.dom.window.Event('change'));assert.equal(select.value,'narrow');
   ui.destroy();
  }finally{h.dom.window.close();}
 }
 const h=fixture({getItem:()=>{throw Error('Fixture disabled');},setItem:()=>{throw Error('Fixture disabled');}});
 try{const ui=h.create();assert.equal(ui.get(),'full');ui.destroy();}finally{h.dom.window.close();}
});

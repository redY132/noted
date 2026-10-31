import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { connectionHandle, connectionsMarkup, initializeConnectionsUI, targetNote, type ConnectionAPI } from './connections-ui.ts';
import type { NoteSummary } from './model.ts';

const a:NoteSummary={id:'00000000-0000-4000-8000-000000000001',title:'First note',tags:['garden'],folderId:null,revision:1,createdAt:'2026-01-01',updatedAt:'2026-01-01'};
const b:NoteSummary={...a,id:'00000000-0000-4000-8000-000000000002',title:'Second note'};
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function harness() {
  const dom=new JSDOM(`<div id="app"><button id="connections-toggle">Connections</button><input id="writing" value="Original words"><div id="source">${connectionHandle(a.id,a.title)}</div><button id="target" data-note="${b.id}">Second note</button>${connectionsMarkup}</div>`,{url:'http://localhost/',pretendToBeVisual:true});
  for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,Node:dom.window.Node,innerWidth:1200,innerHeight:800,getComputedStyle:dom.window.getComputedStyle.bind(dom.window),requestAnimationFrame:():number=>1,cancelAnimationFrame:():void=>{}}))Object.defineProperty(globalThis,key,{value,configurable:true});
  let current=a,connected=false,revision=0,dismissed=false;const calls:unknown[][]=[],errors:unknown[]=[];
  const state=()=>({a:a.id,b:b.id,connected,dismissed,revision});
  const api:ConnectionAPI={
    picker:async(source)=>{calls.push(['picker',source]);return{items:[{note:b,connected}],nextCursor:null,total:1};},
    connections:async()=>({items:connected?[{noteId:b.id,note:b,state:state()}]:[],nextCursor:null,total:connected?1:0}),
    references:async()=>({items:[],nextCursor:null,total:0}),
    related:async()=>({items:connected||dismissed?[]:[{note:b,reasons:['Shared tag'],score:1}],nextCursor:null,total:1}),
    setRelation:async(first,second,connect,dismiss,expected)=>{calls.push(['mutate',first,second,connect,dismiss,expected]);if(expected!==undefined&&expected!==revision)throw Error('Conflict');const previous=state();connected=connect??connected;dismissed=connect===true?false:dismiss??dismissed;revision++;return{state:state(),previous,changed:previous.connected!==connected||previous.dismissed!==dismissed};},
    restoreDismissed:async()=>{dismissed=false;return 1;},
  };
  const ui=initializeConnectionsUI({api,current:()=>current,open:async id=>{calls.push(['open',id]);},folder:()=> 'Unfiled',error:reason=>errors.push(reason)});
  const event=(type:string,x:number,y:number,key?:string)=>{const value=new dom.window.MouseEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:y,button:0});Object.defineProperty(value,'pointerId',{value:1});if(key)Object.defineProperty(value,'key',{value:key});return value;};
  const target=document.querySelector('#target')!;
  Object.defineProperty(document,'elementFromPoint',{value:()=>target,configurable:true});
  return{dom,ui,calls,errors,event,changeCurrent:()=>{current=b;},get connected(){return connected;}};
}

test('connection picker remains source-bound, keeps text untouched, and exposes separate open action',async()=>{
  const h=harness();const input=document.querySelector<HTMLInputElement>('#writing')!;input.focus();input.setSelectionRange(3,8);
  document.querySelector<HTMLElement>('[data-connect-source]')!.click();await tick();
  assert.equal(document.querySelector('#connection-source-title')!.textContent,'From: First note');
  h.changeCurrent();document.querySelector<HTMLElement>('[data-picker-connect]')!.click();await tick();
  assert.equal(h.connected,true);assert.equal(document.querySelector<HTMLElement>('#connection-picker')!.hidden,false);
  assert.deepEqual(h.calls.find(c=>c[0]==='mutate')?.slice(1,4),[a.id,b.id,true]);
  assert.equal(input.value,'Original words');assert.equal(input.selectionStart,3);assert.equal(input.selectionEnd,8);
  assert.equal(document.querySelector<HTMLButtonElement>('[data-picker-connect]')!.disabled,true);
  document.querySelector<HTMLElement>('[data-open-note]')!.click();await tick();assert.ok(h.calls.some(c=>c[0]==='open'));
  h.dom.window.close();
});

test('drag threshold, final pointer target and cancellation never trigger text changes or note navigation',async()=>{
  const h=harness(),handle=document.querySelector<HTMLElement>('[data-connect-source]')!;
  handle.dispatchEvent(h.event('pointerdown',10,10));document.dispatchEvent(h.event('pointermove',14,13));
  assert.equal(document.querySelector('#connection-ray')!.hasAttribute('hidden'),true);
  document.dispatchEvent(h.event('pointermove',25,20));assert.equal(document.querySelector('#connection-ray')!.hasAttribute('hidden'),false);
  document.dispatchEvent(new h.dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  assert.equal(document.querySelector('#connection-ray')!.hasAttribute('hidden'),true);await tick();assert.equal(h.connected,false);
  handle.dispatchEvent(h.event('pointerdown',10,10));document.dispatchEvent(h.event('pointermove',25,20));document.dispatchEvent(h.event('pointerup',25,20));await tick();
  assert.equal(h.connected,true);assert.ok(!h.calls.some(c=>c[0]==='open'));
  assert.equal(document.querySelector<HTMLInputElement>('#writing')!.value,'Original words');h.dom.window.close();
});

test('connection undo uses action revision and restores previous pair state',async()=>{
  const h=harness();document.querySelector<HTMLElement>('[data-connect-source]')!.click();await tick();
  document.querySelector<HTMLElement>('[data-picker-connect]')!.click();await tick();assert.equal(h.connected,true);
  document.querySelector<HTMLElement>('#connection-undo')!.click();await tick();assert.equal(h.connected,false);
  const mutation=h.calls.filter(c=>c[0]==='mutate').at(-1)!;assert.equal(mutation[5],1);assert.equal(h.errors.length,0);h.dom.window.close();
});

test('release retracts visually without delaying the connection; a new gesture and blur cancel animation work',async()=>{
  const h=harness(),callbacks=new Map<number,FrameRequestCallback>();let id=0;
  Object.defineProperty(globalThis,'requestAnimationFrame',{value:(callback:FrameRequestCallback)=>{callbacks.set(++id,callback);return id;},configurable:true});
  Object.defineProperty(globalThis,'cancelAnimationFrame',{value:(frame:number)=>callbacks.delete(frame),configurable:true});
  const handle=document.querySelector<HTMLElement>('[data-connect-source]')!,path=document.querySelector('.connection-ray-path')!,ray=document.querySelector('#connection-ray')!;
  handle.dispatchEvent(h.event('pointerdown',10,10));document.dispatchEvent(h.event('pointermove',200,150));
  document.dispatchEvent(h.event('pointerup',200,150));await tick();
  assert.equal(h.connected,true);assert.equal(ray.hasAttribute('hidden'),false);
  assert.equal(callbacks.size,1,'drag loop is replaced by one retraction frame');
  const original=path.getAttribute('d'),entry=[...callbacks][0];callbacks.delete(entry[0]);entry[1](performance.now()+200);
  assert.notEqual(path.getAttribute('d'),original);
  handle.dispatchEvent(h.event('pointerdown',10,10));
  assert.equal(callbacks.size,0);assert.equal(ray.hasAttribute('hidden'),true);
  document.dispatchEvent(h.event('pointermove',200,150));document.dispatchEvent(h.event('pointerup',200,150));
  assert.equal(callbacks.size,1);
  window.dispatchEvent(new h.dom.window.Event('blur'));
  assert.equal(callbacks.size,0);assert.equal(ray.hasAttribute('hidden'),true);
  h.dom.window.close();
});

test('drop targets resolve note identity from cards and internal references but not ordinary text or web links',()=>{
  const h=harness();const host=document.createElement('div');host.innerHTML=`<a href="noted://note/${b.id}"><em>Note</em></a><a href="https://example.com">Web</a><p>Plain</p>`;
  assert.equal(targetNote(host.querySelector('em')),b.id);assert.equal(targetNote(host.querySelector('p')),null);assert.equal(targetNote(host.querySelectorAll('a')[1]),null);h.dom.window.close();
});

test('open note canvas is a drop target while a nested note reference takes precedence',()=>{
  const h=harness();
  const canvas=document.createElement('article');canvas.dataset.noteTarget=a.id;
  canvas.innerHTML=`<div><p>Current note body</p><a href="noted://note/${b.id}"><strong>Referenced note</strong></a></div>`;
  assert.equal(targetNote(canvas.querySelector('p')),a.id);
  assert.equal(targetNote(canvas.querySelector('strong')),b.id);
  h.dom.window.close();
});



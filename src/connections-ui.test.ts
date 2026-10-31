import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { connectionHandle, connectionsMarkup, initializeConnectionsUI, targetNote, type ConnectionAPI } from './connections-ui.ts';
import type { NoteSummary,PairState } from './model.ts';

const a:NoteSummary={id:'00000000-0000-4000-8000-000000000001',title:'First note',tags:['garden'],folderId:null,revision:1,createdAt:'2026-01-01',updatedAt:'2026-01-01'};
const b:NoteSummary={...a,id:'00000000-0000-4000-8000-000000000002',title:'Second note'};
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function harness(initialConnected=false) {
  const dom=new JSDOM(`<div id="app"><input id="writing" value="Original words"><div id="source">${connectionHandle(a.id,a.title)}</div><button id="target" data-note="${b.id}">Second note</button>${connectionsMarkup}</div>`,{url:'http://localhost/',pretendToBeVisual:true});
  const workers:MockWorker[]=[];
  const frames=new Map<number,FrameRequestCallback>();let nextFrame=0;
  class MockWorker {messages:unknown[]=[];terminated=false;onmessage:((event:{data:unknown})=>void)|null=null;onerror:(()=>void)|null=null;constructor(){workers.push(this);}postMessage(value:unknown){this.messages.push(value);}terminate(){this.terminated=true;}}
  for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,Node:dom.window.Node,MouseEvent:dom.window.MouseEvent,Worker:MockWorker,innerWidth:1200,innerHeight:800,getComputedStyle:dom.window.getComputedStyle.bind(dom.window),requestAnimationFrame:(callback:FrameRequestCallback):number=>{frames.set(++nextFrame,callback);return nextFrame;},cancelAnimationFrame:(id:number):void=>{frames.delete(id);}}))Object.defineProperty(globalThis,key,{value,configurable:true});
  let current=a,connected=initialConnected,revision=0,dismissed=false,strength=3,onOpen:((id:string)=>void|boolean|Promise<void|boolean>)|null=null;const calls:unknown[][]=[],errors:unknown[]=[];
  const state=()=>({a:a.id,b:b.id,connected,dismissed,revision,strength});
  const api:ConnectionAPI={
    picker:async(source)=>{calls.push(['picker',source]);return{items:[{note:b,connected}],nextCursor:null,total:1};},
    connectionSearch:async(source,query,scope,cursor,limit,semantic)=>{calls.push(['search',source,query,scope,cursor,limit,semantic]);return{items:[{note:b,connected}],nextCursor:null,total:1,semanticAvailable:false,semanticPending:false,generation:1};},
    edges:async(ids)=>{calls.push(['edges',ids]);return connected?[state()]:[];},
    connections:async(id,cursor,limit)=>{calls.push(['connections',id,cursor,limit]);return{items:connected?[{noteId:id===a.id?b.id:a.id,note:id===a.id?b:a,state:state()}]:[],nextCursor:null,total:connected?1:0};},
    references:async()=>({items:[],nextCursor:null,total:0}),
    related:async()=>({items:connected||dismissed?[]:[{note:b,reasons:['Shared tag'],score:1}],nextCursor:null,total:1}),
    setRelation:async(first,second,connect,dismiss,expected,nextStrength)=>{calls.push(['mutate',first,second,connect,dismiss,expected,nextStrength]);if(expected!==undefined&&expected!==revision)throw Error('Conflict');const previous=state();connected=connect??connected;dismissed=connect===true?false:dismiss??dismissed;strength=nextStrength??strength;revision++;return{state:state(),previous,changed:previous.connected!==connected||previous.dismissed!==dismissed||previous.strength!==strength};},
    restoreDismissed:async()=>{dismissed=false;return 1;},
  };
  const ui=initializeConnectionsUI({api,current:()=>current,open:async id=>{calls.push(['open',id]);const result=await onOpen?.(id);if(result!==false)current=id===a.id?a:id===b.id?b:current;return result;},folder:()=> 'Unfiled',error:reason=>errors.push(reason)});
  const event=(type:string,x:number,y:number,key?:string)=>{const value=new dom.window.MouseEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:y,button:0});Object.defineProperty(value,'pointerId',{value:1});if(key)Object.defineProperty(value,'key',{value:key});return value;};
  const target=document.querySelector('#target')!;
  Object.defineProperty(document,'elementFromPoint',{value:()=>target,configurable:true});
  return{dom,ui,api,calls,errors,workers,event,frames,flushFrames:()=>{const batch=[...frames.values()];frames.clear();for(const callback of batch)callback(performance.now());},setOpenHandler:(handler:NonNullable<typeof onOpen>)=>{onOpen=handler;},changeCurrent:()=>{current=b;},get connected(){return connected;},get strength(){return strength;},cleanup(){ui.close(false);frames.clear();dom.window.close();}};
}
const click=(selector:string)=>document.querySelector<HTMLElement>(selector)!.dispatchEvent(new window.MouseEvent('click',{bubbles:true,cancelable:true,detail:1}));
const openGraph=async()=>{click('[data-connect-source]');await tick();};
const selectB=()=>click(`[data-graph-node="${b.id}"]`);
const ctrlClick=(id:string)=>document.querySelector(`[data-graph-node="${id}"]`)!.dispatchEvent(new window.MouseEvent('click',{bubbles:true,cancelable:true,detail:1,ctrlKey:true}));
function batchHarness(){
 const h=harness(),c={...b,id:'00000000-0000-4000-8000-000000000003',title:'Third note'},pairs=new Map<string,PairState>(),mutations:string[][]=[];
 const get=(x:string,y:string)=>pairs.get([x,y].sort().join('/'))??{a:[x,y].sort()[0],b:[x,y].sort()[1],connected:false,dismissed:false,revision:0,strength:3};
 h.api.related=async()=>({items:[b,c].filter(n=>!get(a.id,n.id).connected&&!get(a.id,n.id).dismissed).map(note=>({note,reasons:['Related wording'],score:1})),total:2,nextCursor:null});
 h.api.edges=async(ids)=>[...pairs.values()].filter(p=>p.connected&&ids.includes(p.a)&&ids.includes(p.b));
 h.api.setRelation=async(x,y,connected,dismissed,revision,strength)=>{const previous={...get(x,y)};if(revision!==undefined&&revision!==previous.revision)throw Error('Conflict');const state={...previous,connected:connected??previous.connected,dismissed:connected===true?false:dismissed??previous.dismissed,strength:strength??previous.strength,revision:previous.revision+1};pairs.set([x,y].sort().join('/'),state);mutations.push([x,y]);return{state,previous,changed:state.connected!==previous.connected||state.dismissed!==previous.dismissed||state.strength!==previous.strength};};
 return{...h,c,pairs,mutations,get};
}

test('Ctrl+click toggles whole-note selection; one batch connects only to the source and Undo restores every pair',async()=>{
 const h=batchHarness();await openGraph();h.changeCurrent();ctrlClick(b.id);ctrlClick(h.c.id);assert.equal(document.querySelectorAll('.batch-selected').length,2);assert.equal(document.querySelector('#connection-popup-title')!.textContent,'2 notes selected');assert.equal(h.mutations.length,0);assert.equal(h.calls.some(c=>c[0]==='open'),false);
 ctrlClick(a.id);assert.equal(document.querySelectorAll('.batch-selected').length,2);ctrlClick(b.id);assert.equal(document.querySelectorAll('.batch-selected').length,1);ctrlClick(b.id);click('[data-node-action="connect-selected"]');await tick();await tick();assert.equal(h.get(a.id,b.id).connected,true);assert.equal(h.get(a.id,h.c.id).connected,true);assert.equal(h.get(b.id,h.c.id).connected,false);assert.equal(h.mutations.length,2);assert.equal(document.querySelectorAll('[data-graph-edge]').length,2);assert.equal(document.querySelector<HTMLInputElement>('#writing')!.value,'Original words');assert.equal(document.querySelectorAll('.batch-selected').length,0);
 click('#connection-undo');await tick();await tick();assert.equal(h.get(a.id,b.id).connected,false);assert.equal(h.get(a.id,h.c.id).connected,false);assert.equal(h.mutations.length,4);h.cleanup();
});

test('batch connection skips confirmed pairs and keeps partial failures retryable with revision-safe Undo',async()=>{
 const h=batchHarness();const original=h.api.setRelation;await h.api.setRelation(a.id,b.id,true);h.api.connections=async()=>({items:[{noteId:b.id,note:b,state:h.get(a.id,b.id)}],total:1,nextCursor:null});await openGraph();ctrlClick(b.id);ctrlClick(h.c.id);assert.ok(document.querySelector('#connection-node-popup')!.textContent!.includes('1 already connected'));assert.equal(document.querySelector('[data-node-action="connect-selected"]')!.textContent,'Connect 1 notes');click('[data-node-action="connect-selected"]');await tick();await tick();assert.equal(h.mutations.length,2);click('#connection-undo');await tick();assert.equal(h.get(a.id,b.id).connected,true);assert.equal(h.get(a.id,h.c.id).connected,false);
 h.api.setRelation=async(...args)=>{if(args[1]===h.c.id)throw Error('Target unavailable');return original(...args);};await h.ui.mutate(a.id,b.id,false);ctrlClick(b.id);ctrlClick(h.c.id);click('[data-node-action="connect-selected"]');await tick();await tick();assert.equal(h.get(a.id,b.id).connected,true);assert.equal(h.get(a.id,h.c.id).connected,false);assert.ok(document.querySelector('#connection-toast')!.textContent!.includes('1 of 2'));assert.equal(document.querySelectorAll('.batch-selected').length,1);
 await original(a.id,b.id,undefined,undefined,undefined,5);click('#connection-undo');await tick();assert.equal(h.get(a.id,b.id).connected,true);assert.equal(h.get(a.id,b.id).strength,5);assert.ok(document.querySelector('#connection-toast')!.textContent!.includes('0 of 1'));h.cleanup();
});

test('popup Escape clears selection before closing graph; keyboard Control+Enter can select without navigating',async()=>{
 const h=harness();await openGraph();const node=document.querySelector<HTMLElement>(`[data-graph-node="${b.id}"]`)!;node.focus();node.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,bubbles:true,cancelable:true}));assert.equal(document.querySelectorAll('.batch-selected').length,1);assert.equal(h.calls.some(c=>c[0]==='open'),false);document.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(document.querySelector<HTMLElement>('#connections-panel')!.hidden,false);assert.equal(document.querySelector<HTMLElement>('#connection-node-popup')!.hidden,true);assert.equal(document.querySelectorAll('.batch-selected').length,0);assert.equal(document.activeElement,node);document.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(document.querySelector<HTMLElement>('#connections-panel')!.hidden,true);h.cleanup();
});

test('worker snapshots cannot pull a dragged or just-released node backwards, and rendering coalesces per frame',async()=>{
 const h=harness(true);await openGraph();const worker=h.workers[0],update=worker.messages.find(m=>(m as {type:string}).type==='update') as {generation:number},svg=document.querySelector('#connection-graph')!,node=document.querySelector(`[data-graph-node="${b.id}"]`)!;
 node.dispatchEvent(h.event('pointerdown',300,200));svg.dispatchEvent(h.event('pointermove',380,240));const held=node.getAttribute('transform');worker.onmessage?.({data:{type:'positions',generation:update.generation,interaction:0,nodes:[{id:b.id,x:1,y:2},{id:a.id,x:390,y:260}]}});h.flushFrames();assert.equal(node.getAttribute('transform'),held);assert.equal(document.querySelector(`[data-graph-node="${a.id}"]`)!.getAttribute('transform'),'translate(390 260)');
 svg.dispatchEvent(h.event('pointerup',380,240));const last=worker.messages.at(-1) as {interaction:number};worker.onmessage?.({data:{type:'positions',generation:update.generation,interaction:last.interaction-1,nodes:[{id:b.id,x:2,y:3}]}});h.flushFrames();assert.equal(node.getAttribute('transform'),held);
 for(let i=0;i<5;i++)worker.onmessage?.({data:{type:'positions',generation:update.generation,interaction:last.interaction,nodes:[{id:b.id,x:400+i,y:260}]}});assert.equal(h.frames.size,1);h.flushFrames();assert.equal(node.getAttribute('transform'),'translate(404 260)');h.cleanup();assert.equal(h.frames.size,0);
});

test('popup follows pan/force positions and saved edge strength has an exact hover/focus label',async()=>{
 const h=harness(true);await openGraph();selectB();const popup=document.querySelector<HTMLElement>('#connection-node-popup')!,before=popup.style.left,worker=h.workers[0],update=worker.messages.find(m=>(m as {type:string}).type==='update') as {generation:number};worker.onmessage?.({data:{type:'positions',generation:update.generation,nodes:[{id:b.id,x:550,y:300}]}});h.flushFrames();assert.notEqual(popup.style.left,before);assert.equal(popup.dataset.noteId,b.id);click('[data-graph-edge]');const edge=document.querySelector('[data-graph-edge]')!;assert.equal(edge.nextElementSibling?.textContent,'3/5');assert.equal(edge.querySelector('title')!.textContent,'Strength 3 of 5');assert.equal(popup.hidden,true);h.cleanup();
});

test('node clicks preserve the source and editor selection until Open note is chosen',async()=>{
  const h=harness(),input=document.querySelector<HTMLInputElement>('#writing')!;input.focus();input.setSelectionRange(3,8);
  const down=new h.dom.window.MouseEvent('mousedown',{bubbles:true,cancelable:true});document.querySelector('[data-connect-source]')!.dispatchEvent(down);assert.equal(down.defaultPrevented,true);
  await openGraph();assert.equal(document.querySelector('#connection-source-title')!.textContent,'From: First note');assert.equal(document.querySelector('#connection-picker'),null);
  selectB();assert.equal(h.calls.some(c=>c[0]==='open'),false);click('[data-node-action="connect"]');await tick();assert.equal(h.connected,true);
  assert.equal(document.querySelector<HTMLElement>('#connections-panel')!.hidden,false);assert.deepEqual(h.calls.find(c=>c[0]==='mutate')?.slice(1,4),[a.id,b.id,true]);
  assert.equal(input.value,'Original words');assert.equal(input.selectionStart,3);assert.equal(input.selectionEnd,8);
  click(`[data-graph-node="${b.id}"]`);assert.equal(h.calls.some(c=>c[0]==='open'),false);click('[data-node-action="open"]');await tick();assert.ok(h.calls.some(c=>c[0]==='open'&&c[1]===b.id));assert.equal(document.querySelector('#connection-source-title')!.textContent,'From: Second note');h.cleanup();
});

test('source handles expose dialog relationships, keyboard opening focuses search, and closing restores focus',async()=>{
 const h=harness(),handle=document.querySelector<HTMLElement>('[data-connect-source]')!,duplicate=document.createElement('div');duplicate.innerHTML=connectionHandle(a.id,a.title);document.body.append(duplicate);const input=document.querySelector<HTMLInputElement>('#writing')!;input.focus();input.setSelectionRange(2,7);await openGraph();assert.equal(document.activeElement,input,'mouse opening leaves editor focus intact');assert.equal(input.selectionStart,2);assert.equal(input.selectionEnd,7);
 for(const button of document.querySelectorAll('[data-connect-source]')){assert.equal(button.getAttribute('aria-controls'),'connections-panel');assert.equal(button.getAttribute('aria-haspopup'),'dialog');assert.equal(button.getAttribute('aria-expanded'),'true');}h.ui.close();assert.equal(document.activeElement,input);assert.equal(handle.getAttribute('aria-expanded'),'false');
 handle.focus();handle.dispatchEvent(new h.dom.window.MouseEvent('click',{bubbles:true,cancelable:true,detail:0}));await tick();assert.equal((document.activeElement as HTMLElement).id,'connection-query');document.dispatchEvent(new h.dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(document.activeElement,handle);assert.equal(handle.getAttribute('aria-expanded'),'false');h.cleanup();
});

test('re-centering synchronizes the new source handles and disconnected anchors recover to the current header',async()=>{
 const h=harness(),old=document.querySelector<HTMLElement>('[data-connect-source]')!,header=document.createElement('div');header.id='header-connection-handle';header.innerHTML=connectionHandle(b.id,b.title);document.body.append(header);const replacement=header.firstElementChild as HTMLElement;Object.defineProperty(replacement,'getBoundingClientRect',{value:()=>({left:300,top:30,bottom:60,right:330,width:30,height:30})});await openGraph();assert.equal(old.getAttribute('aria-expanded'),'true');click(`[data-graph-node="${b.id}"]`);click('[data-node-action="open"]');await tick();assert.equal(old.getAttribute('aria-expanded'),'false');assert.equal(replacement.getAttribute('aria-expanded'),'true');assert.equal(document.querySelector<HTMLElement>('#connections-panel')!.style.left,'300px');old.remove();window.dispatchEvent(new h.dom.window.Event('resize'));assert.equal(document.querySelector<HTMLElement>('#connections-panel')!.style.left,'300px');assert.equal(h.calls.some(c=>c[0]==='open'),true);h.cleanup();
});

test('closing after editor DOM replacement restores focus to the current editor',async()=>{
 const h=harness(),input=document.querySelector<HTMLInputElement>('#writing')!;input.focus();await openGraph();input.remove();const editor=document.createElement('div');editor.id='editor';editor.innerHTML='<div class="tiptap" contenteditable="true" tabindex="0">Current document</div>';document.body.append(editor);h.ui.close();assert.equal(document.activeElement,editor.firstElementChild);h.cleanup();
});

test('popup navigation reanchors from a removed card to the newly rendered editor header',async()=>{
 const h=harness(),old=document.querySelector<HTMLElement>('[data-connect-source]')!;h.setOpenHandler(()=>{old.remove();h.changeCurrent();const header=document.createElement('div');header.id='header-connection-handle';header.innerHTML=connectionHandle(b.id,b.title);document.body.append(header);Object.defineProperty(header.firstElementChild,'getBoundingClientRect',{value:()=>({left:320,top:24,bottom:54,width:30,height:30,right:350})});});await openGraph();click(`[data-graph-node="${b.id}"]`);click('[data-node-action="open"]');await tick();assert.equal(old.isConnected,false);assert.equal(document.querySelector('#header-connection-handle button')!.getAttribute('aria-expanded'),'true');assert.equal(document.querySelector<HTMLElement>('#connections-panel')!.style.left,'320px');window.dispatchEvent(new h.dom.window.Event('resize'));assert.equal(document.querySelector<HTMLElement>('#connections-panel')!.style.left,'320px');h.cleanup();
});

test('drag threshold, final pointer target and cancellation never change text or navigate',async()=>{
  const h=harness(),handle=document.querySelector<HTMLElement>('[data-connect-source]')!;
  handle.dispatchEvent(h.event('pointerdown',10,10));document.dispatchEvent(h.event('pointermove',14,13));assert.equal(document.querySelector('#connection-ray')!.hasAttribute('hidden'),true);
  document.dispatchEvent(h.event('pointermove',25,20));assert.equal(document.querySelector('#connection-ray')!.hasAttribute('hidden'),false);
  document.dispatchEvent(new h.dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(document.querySelector('#connection-ray')!.hasAttribute('hidden'),true);await tick();assert.equal(h.connected,false);
  handle.dispatchEvent(h.event('pointerdown',10,10));document.dispatchEvent(h.event('pointermove',25,20));document.dispatchEvent(h.event('pointerup',25,20));await tick();assert.equal(h.connected,true);assert.ok(!h.calls.some(c=>c[0]==='open'));assert.equal(document.querySelector<HTMLInputElement>('#writing')!.value,'Original words');h.cleanup();
});

test('connection Undo restores previous full state with the action revision',async()=>{
  const h=harness();await openGraph();selectB();click('[data-node-action="connect"]');await tick();assert.equal(h.connected,true);click('#connection-undo');await tick();assert.equal(h.connected,false);const mutation=h.calls.filter(c=>c[0]==='mutate').at(-1)!;assert.equal(mutation[5],1);assert.equal(mutation[6],3);assert.equal(h.errors.length,0);h.cleanup();
});

test('strength previews make no save, commit makes one revision-safe save and Undo restores strength',async()=>{
  const h=harness(true);await openGraph();document.querySelector<HTMLElement>(`[data-graph-node="${b.id}"]`)!.focus();click('[data-graph-edge]');const slider=document.querySelector<HTMLInputElement>('#connection-strength')!;slider.focus();slider.value='5';slider.dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));assert.equal(document.querySelector('#connection-strength-value')!.textContent,'5');assert.equal(h.calls.filter(c=>c[0]==='mutate').length,0);
  slider.dispatchEvent(new h.dom.window.Event('change',{bubbles:true}));await tick();assert.equal(h.strength,5);assert.equal((document.activeElement as HTMLElement).id,'connection-strength');assert.equal(h.calls.filter(c=>c[0]==='mutate').length,1);assert.equal(h.calls.find(c=>c[0]==='mutate')![5],0);click('#connection-undo');await tick();assert.equal(h.strength,3);h.cleanup();
});

test('close terminates the force worker and late position messages cannot mutate graph',async()=>{
  const h=harness(true);await openGraph();const worker=h.workers[0];assert.ok(worker);const node=document.querySelector(`[data-graph-node="${b.id}"]`)!,before=node.getAttribute('transform');h.ui.close();assert.equal(worker.terminated,true);assert.deepEqual(worker.messages.at(-1),{type:'stop'});worker.onmessage?.({data:{type:'positions',generation:1,nodes:[{id:b.id,x:1,y:2}]}});assert.equal(node.getAttribute('transform'),before);assert.equal(document.querySelector<HTMLElement>('#connections-panel')!.hidden,true);h.cleanup();
});

test('typing pauses force updates, resumes after idle, and close cancels a queued resume',async()=>{
 const h=harness(true);await openGraph();const editor=document.createElement('div');editor.id='editor';document.body.append(editor);const worker=h.workers[0],svg=document.querySelector<SVGSVGElement>('#connection-graph')!,node=document.querySelector(`[data-graph-node="${b.id}"]`)!,before=node.getAttribute('transform');
 const generation=(worker.messages.find(m=>(m as {type:string}).type==='update') as {generation:number}).generation;
 editor.dispatchEvent(new h.dom.window.Event('beforeinput',{bubbles:true}));assert.equal(svg.dataset.layoutState,'paused');assert.deepEqual(worker.messages.at(-1),{type:'stop'});
 worker.onmessage?.({data:{type:'positions',generation,nodes:[{id:b.id,x:1,y:2}]}});assert.equal(node.getAttribute('transform'),before);
 await new Promise(resolve=>setTimeout(resolve,480));assert.equal(svg.dataset.layoutState,'running');assert.equal((worker.messages.at(-1) as {type:string}).type,'update');
 editor.dispatchEvent(new h.dom.window.Event('beforeinput',{bubbles:true}));h.ui.close();const count=worker.messages.length;await new Promise(resolve=>setTimeout(resolve,480));assert.equal(worker.messages.length,count);assert.equal(svg.dataset.layoutState,'stopped');h.cleanup();
});

test('initial settled camera fits nodes, user zoom cancels automatic fitting, and layout state tracks idle',async()=>{
 const h=harness(true);await openGraph();const worker=h.workers[0],update=worker.messages.find(m=>(m as {type:string}).type==='update') as {generation:number},svg=document.querySelector<SVGSVGElement>('#connection-graph')!,viewport=document.querySelector('#connection-viewport')!;
 assert.equal(svg.dataset.layoutState,'running');worker.onmessage?.({data:{type:'positions',generation:update.generation,nodes:[{id:a.id,x:360,y:185},{id:b.id,x:800,y:900}]}});worker.onmessage?.({data:{type:'settled',generation:update.generation}});assert.equal(svg.dataset.layoutState,'settled');const fitted=viewport.getAttribute('transform');assert.notEqual(fitted,'translate(0 0) scale(1)');
 svg.dispatchEvent(new h.dom.window.WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:-100,clientX:360,clientY:185}));const userView=viewport.getAttribute('transform');assert.notEqual(userView,fitted);worker.onmessage?.({data:{type:'positions',generation:update.generation,nodes:[{id:b.id,x:1200,y:1100}]}});worker.onmessage?.({data:{type:'settled',generation:update.generation}});assert.equal(viewport.getAttribute('transform'),userView);click('[data-graph-action="reset"]');assert.notEqual(viewport.getAttribute('transform'),userView);h.ui.close(false);assert.equal(svg.dataset.layoutState,'stopped');h.cleanup();
});

test('selecting an offscreen search result reveals it without moving its force coordinates or navigating',async()=>{
 const h=harness(true);await openGraph();const worker=h.workers[0],update=worker.messages.find(m=>(m as {type:string}).type==='update') as {generation:number};worker.onmessage?.({data:{type:'settled',generation:update.generation}});worker.onmessage?.({data:{type:'positions',generation:update.generation,nodes:[{id:b.id,x:2000,y:-900}]}});
 const input=document.querySelector<HTMLInputElement>('#connection-query')!;input.value='Second';input.dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));await tick();h.flushFrames();const before=document.querySelector(`[data-graph-node="${b.id}"]`)!.getAttribute('transform');click('[data-search-select]');await tick();assert.equal(document.querySelector(`[data-graph-node="${b.id}"]`)!.getAttribute('transform'),before);const camera=document.querySelector('#connection-viewport')!.getAttribute('transform')!.match(/translate\(([^ ]+) ([^)]+)\) scale\(([^)]+)\)/)!;const x=2000*Number(camera[3])+Number(camera[1]),y=-900*Number(camera[3])+Number(camera[2]);assert.ok(x>=95&&x<=625);assert.ok(y>=42&&y<=285);assert.equal(h.calls.some(c=>c[0]==='open'),false);h.cleanup();
});

test('search queries direct source connections, Add notes switches scope, selecting results does not navigate',async()=>{
  const h=harness();await openGraph();const input=document.querySelector<HTMLInputElement>('#connection-query')!;input.value='Second';input.dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));await tick();const first=h.calls.find(c=>c[0]==='search')!;assert.equal(first[1],a.id);assert.equal(first[3],'connected');assert.equal(first[6],false);click('[data-search-select]');await tick();assert.equal(h.calls.some(c=>c[0]==='open'),false);click('[data-graph-action="add"]');await tick();assert.equal(h.calls.filter(c=>c[0]==='search').at(-1)![3],'workspace');click('[data-picker-connect]');await tick();assert.equal(h.connected,true);assert.equal(document.querySelector<HTMLElement>('#connections-panel')!.hidden,false);h.cleanup();
});

test('Enter opens node actions, explicit Open navigates, and Escape dismisses popup before graph',async()=>{
  const h=harness(true);await openGraph();document.querySelector(`[data-graph-node="${b.id}"]`)!.dispatchEvent(new h.dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));assert.equal(h.calls.some(c=>c[0]==='open'),false);assert.equal((document.activeElement as HTMLElement).dataset.nodeAction,'open');click('[data-node-action="open"]');await tick();assert.ok(h.calls.some(c=>c[0]==='open'&&c[1]===b.id));assert.equal(document.querySelector('#connection-source-title')!.textContent,'From: Second note');assert.equal((document.activeElement as HTMLElement).dataset.graphNode,b.id);click('[data-graph-action="list"]');click(`[data-select-note="${a.id}"]`);click('[data-node-action="open"]');await tick();assert.ok(h.calls.some(c=>c[0]==='open'&&c[1]===a.id));assert.equal((document.activeElement as HTMLElement).dataset.selectNote,a.id);document.dispatchEvent(new h.dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(document.querySelector<HTMLElement>('#connections-panel')!.hidden,true);await openGraph();click('[data-connect-source]');assert.equal(document.querySelector<HTMLElement>('#connections-panel')!.hidden,true);h.cleanup();
});

test('opening node actions preserves the SVG target and does not reheat the layout',async()=>{
 const h=harness(true);await openGraph();const node=document.querySelector<HTMLElement>(`[data-graph-node="${b.id}"]`)!;node.focus();assert.equal(document.activeElement,node);assert.equal(document.querySelector<HTMLElement>('#connection-node-popup')!.hidden,true);selectB();const messages=h.workers[0].messages.length;assert.ok(document.querySelector('[data-node-action="remove"]'));assert.equal(h.calls.some(c=>c[0]==='open'),false);assert.equal(h.workers[0].messages.length,messages);selectB();assert.equal(node,document.querySelector(`[data-graph-node="${b.id}"]`));h.cleanup();
});

test('captured taps open actions once while node drags never open or navigate',async()=>{
 const h=harness(true);await openGraph();let node=document.querySelector(`[data-graph-node="${b.id}"]`)!;const svg=document.querySelector('#connection-graph')!;node.dispatchEvent(h.event('pointerdown',360,185));svg.dispatchEvent(h.event('pointermove',400,220));svg.dispatchEvent(h.event('pointerup',400,220));node.dispatchEvent(new h.dom.window.MouseEvent('click',{bubbles:true,detail:1}));assert.equal(h.calls.some(c=>c[0]==='open'),false);node.dispatchEvent(h.event('pointerdown',400,220));svg.dispatchEvent(h.event('pointerup',400,220));node.dispatchEvent(new h.dom.window.MouseEvent('click',{bubbles:true,detail:1}));await tick();assert.equal(h.calls.filter(c=>c[0]==='open').length,0);assert.equal(document.querySelector<HTMLElement>('#connection-node-popup')!.hidden,false);click('[data-node-action="open"]');await tick();assert.equal(h.calls.filter(c=>c[0]==='open').length,1);assert.equal(document.querySelector('#connection-source-title')!.textContent,'From: Second note');h.cleanup();
});

test('failed or superseded navigation does not recenter or reopen the graph',async()=>{
 const h=harness();await openGraph();h.setOpenHandler(()=>false);click(`[data-graph-node="${b.id}"]`);click('[data-node-action="open"]');await tick();assert.equal(document.querySelector('#connection-source-title')!.textContent,'From: First note');let complete!:(value:boolean)=>void;h.setOpenHandler(()=>new Promise(resolve=>{complete=resolve;}));click(`[data-graph-node="${b.id}"]`);click('[data-node-action="open"]');h.ui.close();complete(true);await tick();assert.equal(document.querySelector<HTMLElement>('#connections-panel')!.hidden,true);assert.equal(document.querySelector('#connection-source-title')!.textContent,'From: First note');h.cleanup();
});

test('search titles open directly and the old Open, Expand and Focus here controls are absent',async()=>{
 const h=harness();await openGraph();assert.equal(document.querySelector('[data-selected-action="open"],[data-selected-action="expand"],[data-selected-action="focus"]'),null);click('[data-graph-action="add"]');await tick();click('[data-search-open]');await tick();assert.ok(h.calls.some(c=>c[0]==='open'&&c[1]===b.id));assert.equal(document.querySelector('#connection-source-title')!.textContent,'From: Second note');h.cleanup();
});

test('the list pages direct connections, including unavailable notes, without expansion or navigation',async()=>{
 const h=harness(true),missing='00000000-0000-4000-8000-000000000009';h.api.connections=async(_id,cursor)=>({items:cursor?[{noteId:missing,note:null,state:{a:a.id,b:missing,strength:3,connected:true,dismissed:false,revision:1}}]:[{noteId:b.id,note:b,state:{a:a.id,b:b.id,strength:3,connected:true,dismissed:false,revision:1}}],nextCursor:cursor?null:1,total:2});await openGraph();click('[data-graph-action="list"]');click('[data-connected-more]');await tick();assert.ok(document.querySelector(`[data-graph-node="${missing}"][data-note-unavailable]`));click(`[data-select-note="${missing}"]`);assert.ok(document.querySelector('[data-node-action="remove"]'));assert.equal(h.calls.some(c=>c[0]==='open'),false);assert.equal(document.querySelector('[data-connected-more]'),null);h.cleanup();
});

test('suggestions have gray inferred edges and weak worker forces, without editable strength',async()=>{
 const h=harness();await openGraph();assert.equal(document.querySelectorAll('[data-suggestion-edge]').length,1);selectB();assert.equal(document.querySelector('#connection-strength'),null);const update=h.workers[0].messages.find(m=>(m as {type:string}).type==='update') as {edges:{a:string;b:string;strength:number}[]};assert.deepEqual(update.edges,[{a:a.id,b:b.id,strength:.35,suggested:true}]);h.cleanup();
});

test('missing notes cannot navigate and retain removal without obsolete controls',async()=>{
 const h=harness(true);h.api.connections=async()=>({items:[{noteId:b.id,note:null,state:{a:a.id,b:b.id,strength:3,connected:true,dismissed:false,revision:0}}],total:1,nextCursor:null});await openGraph();selectB();click(`[data-graph-node="${b.id}"]`);await tick();assert.equal(h.calls.some(c=>c[0]==='open'),false);assert.equal(document.querySelector('[data-selected-action="open"],[data-selected-action="expand"],[data-selected-action="focus"]'),null);click('[data-graph-edge]');assert.equal(document.querySelector('#connection-strength'),null);click('[data-selected-action="remove-edge"]');await tick();assert.equal(h.connected,false);h.cleanup();
});

test('weak confirmed source pairs survive an edge API cap and removal clears the retained pair',async()=>{
 const h=harness(true);h.api.edges=async()=>[];await openGraph();selectB();assert.ok(document.querySelector('[data-node-action="remove"]'));assert.ok(document.querySelector('[data-graph-edge]'));assert.equal(document.querySelector<HTMLButtonElement>('[data-node-action="connect"]')!.disabled,true);click('[data-node-action="remove"]');await tick();assert.equal(h.connected,false);assert.equal(document.querySelector('[data-graph-edge]'),null);assert.ok(document.querySelector('[data-node-action="connect"]'));click('#connection-undo');await tick();assert.equal(h.connected,true);assert.ok(document.querySelector('[data-node-action="remove"]'));h.cleanup();
});

test('late search responses cannot replace the current query results',async()=>{
 const h=harness();await openGraph();const pending=new Map<string,(page:Awaited<ReturnType<ConnectionAPI['connectionSearch']>>)=>void>();h.api.connectionSearch=async(_source,query)=>await new Promise(resolve=>pending.set(query,resolve));const input=document.querySelector<HTMLInputElement>('#connection-query')!;input.value='old';input.dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));input.value='new';input.dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));pending.get('new')!({items:[{note:{...b,title:'Current result'},connected:false}],total:1,nextCursor:null,semanticAvailable:false,semanticPending:false,generation:1});await tick();pending.get('old')!({items:[{note:{...b,title:'Stale result'},connected:false}],total:1,nextCursor:null,semanticAvailable:false,semanticPending:false,generation:1});await tick();assert.ok(document.querySelector('#connection-picker-results')!.textContent!.includes('Current result'));assert.ok(!document.querySelector('#connection-picker-results')!.textContent!.includes('Stale result'));h.cleanup();
});

test('semantic search waits 350ms and pending polling stops when the graph closes',async()=>{
 const h=harness();await openGraph();let requests:{semantic:boolean|undefined;query:string}[]=[];h.api.connectionSearch=async(_source,query,_scope,_cursor,_limit,semantic)=>{requests.push({semantic,query});return{items:[{note:b,connected:false}],total:1,nextCursor:null,semanticAvailable:true,semanticPending:Boolean(semantic),generation:1};};
 const input=document.querySelector<HTMLInputElement>('#connection-query')!;input.value='garden';input.dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));await tick();assert.deepEqual(requests,[{semantic:false,query:'garden'}]);await new Promise(resolve=>setTimeout(resolve,380));assert.deepEqual(requests,[{semantic:false,query:'garden'},{semantic:true,query:'garden'}]);h.ui.close(false);await new Promise(resolve=>setTimeout(resolve,550));assert.equal(requests.length,2);h.cleanup();
});

test('release retracts visually without delaying connection and new gesture stops animation',async()=>{
  const h=harness(),callbacks=new Map<number,FrameRequestCallback>();let id=0;Object.defineProperty(globalThis,'requestAnimationFrame',{value:(callback:FrameRequestCallback)=>{callbacks.set(++id,callback);return id;},configurable:true});Object.defineProperty(globalThis,'cancelAnimationFrame',{value:(frame:number)=>callbacks.delete(frame),configurable:true});
  const handle=document.querySelector<HTMLElement>('[data-connect-source]')!,path=document.querySelector('.connection-ray-path')!,ray=document.querySelector('#connection-ray')!;handle.dispatchEvent(h.event('pointerdown',10,10));document.dispatchEvent(h.event('pointermove',200,150));document.dispatchEvent(h.event('pointerup',200,150));await tick();assert.equal(h.connected,true);assert.equal(ray.hasAttribute('hidden'),false);assert.equal(callbacks.size,1);const original=path.getAttribute('d'),entry=[...callbacks][0];callbacks.delete(entry[0]);entry[1](performance.now()+200);assert.notEqual(path.getAttribute('d'),original);handle.dispatchEvent(h.event('pointerdown',10,10));assert.equal(callbacks.size,0);assert.equal(ray.hasAttribute('hidden'),true);document.dispatchEvent(h.event('pointermove',200,150));document.dispatchEvent(h.event('pointerup',200,150));assert.equal(callbacks.size,1);document.dispatchEvent(h.event('pointercancel',200,150));assert.equal(callbacks.size,0);h.cleanup();
});

test('every window exit retracts without saving a stale target or opening on late physical click',async()=>{
  const exits=[(h:ReturnType<typeof harness>)=>document.dispatchEvent(h.event('pointermove',-1,100)),(h:ReturnType<typeof harness>)=>document.dispatchEvent(h.event('pointermove',1200,100)),(h:ReturnType<typeof harness>)=>document.dispatchEvent(h.event('pointermove',100,-1)),(h:ReturnType<typeof harness>)=>document.dispatchEvent(h.event('pointermove',100,800)),(h:ReturnType<typeof harness>)=>document.dispatchEvent(h.event('pointerout',100,100)),(h:ReturnType<typeof harness>)=>document.documentElement.dispatchEvent(h.event('pointerleave',100,100)),(h:ReturnType<typeof harness>)=>window.dispatchEvent(new h.dom.window.Event('blur')),(h:ReturnType<typeof harness>)=>document.dispatchEvent(h.event('lostpointercapture',100,100))];
  for(const exit of exits){const h=harness(),handle=document.querySelector<HTMLElement>('[data-connect-source]')!;handle.dispatchEvent(h.event('pointerdown',10,10));document.dispatchEvent(h.event('pointermove',200,150));assert.ok(document.querySelector('.connection-drop-target'));exit(h);assert.equal(h.ui.isDragging(),false);assert.equal(document.querySelector('#connection-ray')!.hasAttribute('hidden'),false);assert.equal(document.querySelector('.connection-drop-target'),null);assert.equal(document.body.classList.contains('connection-dragging'),false);document.dispatchEvent(h.event('pointerup',200,150));await tick();assert.equal(h.connected,false);assert.ok(!h.calls.some(c=>c[0]==='mutate'));handle.dispatchEvent(new h.dom.window.MouseEvent('click',{bubbles:true,cancelable:true,detail:1}));assert.equal(document.querySelector<HTMLElement>('#connections-panel')!.hidden,true);h.cleanup();}
});

test('moving between app elements keeps dragging and a fresh press after leaving works normally',async()=>{
  const h=harness(),handle=document.querySelector<HTMLElement>('[data-connect-source]')!,target=document.querySelector('#target')!;handle.dispatchEvent(h.event('pointerdown',10,10));document.dispatchEvent(h.event('pointermove',200,150));const internal=h.event('pointerout',200,150);Object.defineProperty(internal,'relatedTarget',{value:target});document.dispatchEvent(internal);target.dispatchEvent(h.event('pointerleave',200,150));assert.equal(h.ui.isDragging(),true);document.dispatchEvent(h.event('pointerout',200,150));assert.equal(h.ui.isDragging(),false);handle.dispatchEvent(h.event('pointerdown',10,10));document.dispatchEvent(h.event('pointerup',10,10));handle.dispatchEvent(new h.dom.window.MouseEvent('click',{bubbles:true,cancelable:true,detail:1}));await tick();assert.equal(document.querySelector<HTMLElement>('#connections-panel')!.hidden,false);assert.equal(h.connected,false);h.cleanup();
});

test('drop identity uses cards and internal references, rejects ordinary text, external links and missing notes',()=>{
  const h=harness(),host=document.createElement('div');host.innerHTML=`<a href="noted://note/${b.id}"><em>Note</em></a><a href="https://example.com">Web</a><p>Plain</p>`;assert.equal(targetNote(host.querySelector('em')),b.id);assert.equal(targetNote(host.querySelector('p')),null);assert.equal(targetNote(host.querySelectorAll('a')[1]),null);const canvas=document.createElement('article');canvas.dataset.noteTarget=a.id;canvas.innerHTML=`<div><p>Current note body</p><a href="noted://note/${b.id}"><strong>Reference</strong></a></div>`;assert.equal(targetNote(canvas.querySelector('p')),a.id);assert.equal(targetNote(canvas.querySelector('strong')),b.id);canvas.setAttribute('data-note-unavailable','');assert.equal(targetNote(canvas.querySelector('strong')),null);h.cleanup();
});

test('refresh replaces stale suggestions while preserving positions of still-relevant notes',async()=>{
  const h=harness();await openGraph();const before=document.querySelector(`[data-graph-node="${b.id}"]`)!.getAttribute('transform');
  const c={...b,id:'00000000-0000-4000-8000-000000000003',title:'Third note'};
  h.api.related=async()=>({items:[b,c].map(note=>({note,reasons:['Related wording'],score:1})),nextCursor:null,total:2});
  await h.ui.refresh();assert.equal(document.querySelector(`[data-graph-node="${b.id}"]`)!.getAttribute('transform'),before);
  assert.ok(document.querySelector(`[data-graph-node="${c.id}"]`));
  h.api.related=async()=>({items:[{note:c,reasons:['Related wording'],score:1}],nextCursor:null,total:1});await h.ui.refresh();
  assert.equal(document.querySelector(`[data-graph-node="${b.id}"]`),null);assert.equal(document.querySelectorAll('.connection-node.suggested').length,1);h.cleanup();
});

test('more suggestions coalesces repeated clicks while a page is pending',async()=>{
  const h=harness();let calls=0,complete!:(value:Awaited<ReturnType<ConnectionAPI['related']>>)=>void;
  h.api.related=async(_id,cursor)=>{if(!cursor)return{items:[{note:b,reasons:['Related wording'],score:1}],nextCursor:1,total:2};calls++;return new Promise(resolve=>{complete=resolve;});};
  await openGraph();click('[data-graph-action=more]');click('[data-graph-action=more]');assert.equal(calls,1);
  const c={...b,id:'00000000-0000-4000-8000-000000000003',title:'Third note'};complete({items:[{note:c,reasons:['Related wording'],score:1}],nextCursor:null,total:2});await tick();
  assert.equal(document.querySelectorAll('.connection-node.suggested').length,2);assert.equal(document.querySelector<HTMLButtonElement>('[data-graph-action=more]')!.disabled,true);h.cleanup();
});

test('search selection reveals graph and cancels late result overlays; settings and references are exclusive',async()=>{
  const h=harness();await openGraph();click('[data-graph-action=add]');await tick();
  click('[data-graph-action=settings]');assert.equal(document.querySelector<HTMLElement>('#connection-picker-results')!.hidden,true);
  click('[data-graph-action=references]');assert.equal(document.querySelector<HTMLElement>('#connection-settings')!.hidden,true);assert.equal(document.querySelector<HTMLElement>('#connection-references')!.hidden,false);
  const query=document.querySelector<HTMLInputElement>('#connection-query')!;query.value='Second';query.dispatchEvent(new window.Event('input',{bubbles:true}));await tick();
  click('[data-search-select]');assert.equal(document.querySelector<HTMLElement>('#connection-picker-results')!.hidden,true);assert.equal(document.querySelector<HTMLElement>('#connection-references')!.hidden,true);
  await new Promise(resolve=>setTimeout(resolve,400));assert.equal(document.querySelector<HTMLElement>('#connection-picker-results')!.hidden,true);h.cleanup();
});

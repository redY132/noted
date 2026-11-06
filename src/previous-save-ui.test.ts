import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {initializePreviousSave} from './previous-save-ui.ts';import type {Note} from './model.ts';
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const note=(id='source',revision=2,title='Synthetic original'):Note=>({formatVersion:1,id,revision,title,revisionToken:`token-${revision}`,folderId:null,tags:[],createdAt:'2026-11-06T10:00:00Z',updatedAt:'2026-11-06T12:00:00Z',presentation:{schemaId:'default'},content:{type:'doc',content:[{type:'paragraph',attrs:{id:'paragraph'},content:[{type:'text',text:`Synthetic words at revision ${revision}.`}]}]}});
function setup(options:{previous?():Promise<Note|null>;flush?():Promise<void>;recover?(previous:Note):Promise<Note>;open?(id:string):Promise<boolean>;changed?():Promise<void>}={}){
  const dom=new JSDOM('<button id="view-toggle">View</button><section id="view-popover"></section><div id="host"></div><div id="writer" tabindex="0">Synthetic editor</div>');
  Object.assign(dom.window.HTMLDialogElement.prototype,{showModal(this:HTMLDialogElement){this.setAttribute('open','');},close(this:HTMLDialogElement){this.removeAttribute('open');this.dispatchEvent(new dom.window.Event('close'));}});
  const $=<T extends HTMLElement>(s:string)=>dom.window.document.querySelector<T>(s)!;let current:Note|null=note(),busy=false;const calls:string[]=[],copies:Note[]=[];
  const ui=initializePreviousSave($('#host'),{menu:$('#view-popover'),current:()=>current,snapshot:()=>structuredClone(current!),busy:()=>busy,previous:async()=>{calls.push('previous');return options.previous?options.previous():note('source',1,'<script>Earlier title</script>');},flush:async()=>{calls.push('flush');await options.flush?.();},recover:async previous=>{calls.push('recover');copies.push(previous);return options.recover?options.recover(previous):{...previous,id:'copy'};},changed:async()=>{calls.push('changed');await options.changed?.();},open:async id=>{calls.push(`open:${id}`);return options.open?options.open(id):true;},focusEditor:()=>$('#writer').focus()});
  return{dom,$,ui,calls,copies,setNote(value:Note|null){current=value;ui.sync();},busy(value:boolean){busy=value;ui.sync();},close(){ui.destroy();dom.window.close();}};
}
test('previous save captures safe text before flushing and cancellation preserves writing context',async()=>{
  let resolve!:(value:Note|null)=>void;const h=setup({previous:()=>new Promise(r=>{resolve=r;})});
  try{h.$('#view-toggle').focus();h.ui.show();assert.match(h.$('[data-previous-status]').textContent!,/Loading/);assert.deepEqual(h.calls,['previous']);assert.equal(h.$<HTMLButtonElement>('[data-previous-recover]').disabled,true);
    resolve(note('source',1,'<script>Earlier title</script>'));await tick();assert.match(h.$('[data-previous-meta]').textContent!,/<script>Earlier title<\/script>/);assert.equal(h.$('script'),null);
    h.$('dialog').dispatchEvent(new h.dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(h.$<HTMLDialogElement>('dialog').inert,true);assert.equal(h.dom.window.document.activeElement,h.$('#view-toggle'));assert.equal(h.$('[data-previous-text]').textContent,'');assert.deepEqual(h.calls,['previous']);
  }finally{h.close();}
});
test('recover saves first, uses the captured snapshot after an external change, and creates only one copy',async()=>{
  const old=note('source',1);let finish!:()=>void;const h=setup({previous:async()=>old,flush:()=>new Promise(r=>{finish=r;})});
  try{h.ui.show();await tick();old.title='Later provider mutation';h.$('[data-previous-recover]').click();h.$('[data-previous-recover]').click();h.$('dialog').dispatchEvent(new h.dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(h.$<HTMLDialogElement>('dialog').open,true);assert.deepEqual(h.calls,['previous','flush']);
    finish();await tick();await tick();assert.deepEqual(h.calls,['previous','flush','recover','changed','open:copy']);assert.equal(h.copies.length,1);assert.equal(h.copies[0].title,'Synthetic original');assert.equal(h.$<HTMLDialogElement>('dialog').open,false);assert.equal(h.dom.window.document.activeElement,h.$('#writer'));
  }finally{h.close();}
});
test('failed draft save prevents copy creation and retry preserves the captured candidate',async()=>{
  let fail=true;const h=setup({flush:async()=>{if(fail)throw new Error('Synthetic save conflict');}});
  try{h.ui.show();await tick();h.$('[data-previous-recover]').click();await tick();assert.equal(h.copies.length,0);assert.match(h.$('[data-previous-status]').textContent!,/draft and captured previous save remain/);assert.equal(h.$<HTMLDialogElement>('dialog').open,true);
    fail=false;h.$('[data-previous-recover]').click();await tick();await tick();assert.equal(h.copies.length,1);
  }finally{h.close();}
});
test('a saved copy survives an opening failure and retry cannot create a second note',async()=>{
  let allowOpen=false;const h=setup({open:async()=>allowOpen,changed:async()=>{throw new Error('Synthetic index refresh failure');}});
  try{h.ui.show();await tick();h.$('[data-previous-recover]').click();await tick();await tick();assert.match(h.$('[data-previous-status]').textContent!,/copy was saved/);assert.equal(h.$('[data-previous-recover]').textContent,'Open recovered copy');assert.equal(h.$<HTMLButtonElement>('[data-previous-refresh]').disabled,true);
    allowOpen=true;h.$('[data-previous-recover]').click();await tick();await tick();assert.equal(h.copies.length,1);assert.equal(h.calls.filter(c=>c==='open:copy').length,2);assert.equal(h.$<HTMLDialogElement>('dialog').open,false);
  }finally{h.close();}
});
test('missing or unreadable backups disable recovery and Refresh can retry without changing notes',async()=>{
  let mode='missing';const h=setup({previous:async()=>{if(mode==='failed')throw new Error('Synthetic malformed backup');return mode==='missing'?null:note('source',1);}});
  try{h.ui.show();await tick();assert.match(h.$('[data-previous-status]').textContent!,/no previous save/);assert.equal(h.$<HTMLButtonElement>('[data-previous-recover]').disabled,true);
    mode='failed';h.$('[data-previous-refresh]').click();await tick();assert.match(h.$('[data-previous-status]').textContent!,/Use Refresh to retry/);assert.equal(h.$<HTMLButtonElement>('[data-previous-recover]').disabled,true);
    mode='ready';h.$('[data-previous-refresh]').click();await tick();assert.equal(h.$<HTMLButtonElement>('[data-previous-recover]').disabled,false);assert.equal(h.copies.length,0);
  }finally{h.close();}
});
test('note identity, busy state and other modals prevent unrelated recovery',async()=>{
  const h=setup();try{h.busy(true);assert.equal(h.$<HTMLButtonElement>('#shell-previous-save').disabled,true);h.ui.show();assert.equal(h.calls.length,0);h.busy(false);
    const other=h.dom.window.document.createElement('dialog');other.setAttribute('open','');h.dom.window.document.body.append(other);h.ui.show();assert.equal(h.calls.length,0);other.remove();
    h.ui.show();await tick();h.setNote(note('another'));h.$('[data-previous-recover]').click();await tick();assert.equal(h.copies.length,0);assert.match(h.$('[data-previous-status]').textContent!,/open note changed/);
  }finally{h.close();}
});
test('closing or destroying ignores late reads and a completed copy cannot update removed UI',async()=>{
  let resolve!:(value:Note|null)=>void;const h=setup({previous:()=>new Promise(r=>{resolve=r;})});
  try{h.ui.show();h.$('[data-previous-close]').click();resolve(note('source',1));await tick();assert.equal(h.$('[data-previous-text]').textContent,'');}finally{h.close();}
  let copied!:(value:Note)=>void;const late=setup({recover:()=>new Promise(r=>{copied=r;})});
  try{late.ui.show();await tick();late.$('[data-previous-recover]').click();await tick();late.ui.destroy();copied(note('copy',1));await tick();assert.equal(late.calls.some(c=>c.startsWith('open:')),false);}finally{late.close();}
});

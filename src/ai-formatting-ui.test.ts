import {counterComponent} from './component-runtime-examples.ts';import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';import {initializeAIFormatting} from './ai-formatting-ui.ts';import type {Note} from './model.ts';import type {ProposalReview} from './document-tools-ui.ts';
const settle=()=>new Promise(r=>setTimeout(r,0));
function setup(){
 const dom=new JSDOM('<div id="host"></div>');
 Object.assign(dom.window.HTMLDialogElement.prototype,{showModal(this:HTMLDialogElement){this.setAttribute('open','');},close(this:HTMLDialogElement){this.removeAttribute('open');this.dispatchEvent(new dom.window.Event('close'));}});
 const host=dom.window.document.querySelector<HTMLElement>('#host')!;
 let note={id:'fixture',title:'Synthetic job note',revision:1,revisionToken:'saved'} as Note;
 let rows:{id:string;noteId:string;prompt:string;expiresAt:string;status:string;kind?:'component'}[]=[],review:ProposalReview|null=null,release:((j:unknown)=>void)|undefined;
 const calls:string[]=[],errors:unknown[]=[],contexts:unknown[]=[],requestReads:string[]=[];
 let aiAllowed=true,jobResponse:any=null,jobFailure=false,statusReads=0,openFailure=false,startedNoteId='fixture',invalidateOnReviewFlush=false;
 const api={
  async noteAIAllowed(){return aiAllowed;},
  async schemaGuidanceCapabilities(){return{formattingProtocol:4,perRequestGuidanceConsent:true,componentSuggestions:true};},
  async subscriptionStatus(){calls.push('account');return{available:true,authentication:'chatgpt',message:'Signed in'};},
  async formattingRequests(id:string){requestReads.push(id);return rows.filter(r=>r.noteId===id);},
  async startSubscription(_n:Note,_p:string,context?:unknown){startedNoteId=_n.id;contexts.push(context);calls.push('send');return await new Promise<any>(r=>release=r);},
  async subscriptionJob(){statusReads++;if(jobFailure||!jobResponse)throw new Error('Synthetic local status failure');return jobResponse;},
  async cancelSubscription(){calls.push('cancel-job');},
  async componentReply(){return {summary:'Counter',definition:counterComponent,properties:{label:'Fixture'}};},
  async formattingReply(){return rows.some(r=>r.status==='ready')?{summary:'Clearer layout',operations:[]}:null;},
  async cancelFormattingRequest(id:string){calls.push('remove:'+id);rows=rows.filter(r=>r.id!==id);},
  async createFormattingRequest(){calls.push('external');return{id:'external',noteId:note.id,expiresAt:'2099-01-01'};},
 };
 const ui=initializeAIFormatting(host,{
  api,native:true,schema:()=>({formatVersion:2,id:'guide',version:1,name:'Guide',rules:{body:{}},guide:{title:'Synthetic guide',document:{version:2,objects:{},readingOrder:[],layout:{id:'root',kind:'free',children:[]},styles:{}}}}),
  note:()=>note,editor:()=>null,async openNote(id){calls.push('open:'+id);if(!openFailure)note={...note,id,title:'Synthetic job note'};},async flush(){calls.push('flush');if(invalidateOnReviewFlush)rows=rows.map(row=>({...row,status:'outdated'}));},error:e=>errors.push(e),
  async componentProposal(_value,settings){calls.push('component-review');review=settings;},async proposal(_ops,settings){calls.push('review');review=settings;},
 });
 return{
  dom,host,ui,calls,contexts,errors,requestReads,setAIAllowed:(value:boolean)=>aiAllowed=value,
  $:<T extends HTMLElement>(s:string)=>host.querySelector<T>(s)!,setRows:(r:typeof rows)=>rows=r,getReview:()=>review,
  setNote(id:string){note={...note,id,title:'Synthetic other note'};},setOpenFailure(value:boolean){openFailure=value;},setJobFailure(value:boolean){jobFailure=value;},invalidateReviewFlush(){invalidateOnReviewFlush=true;},statusReads:()=>statusReads,
  completeBackground(kind?:'component'){rows=[{kind,id:'running',noteId:'fixture',prompt:'Make bold',expiresAt:'2099-01-01',status:'ready'}];jobResponse={id:'job',requestId:'running',noteId:'fixture',phase:'completed',message:'Proposal received'};},
  running(){rows=[{id:'running',noteId:note.id,prompt:'Make bold',expiresAt:'2099-01-01',status:'waiting'}];jobResponse={id:'job',requestId:'running',noteId:note.id,phase:'running',message:'Generating'};release!(jobResponse);},
  finish(kind?:'component'){rows=[{kind,id:'ready',noteId:startedNoteId,prompt:'Make bold',expiresAt:'2099-01-01',status:'ready'}];release!({id:'job',requestId:'ready',noteId:startedNoteId,phase:'completed',message:'Cached proposal ready'});},
  close(){ui.destroy();dom.window.close();},
 };
}
test('opening and typing never transmits; Generate saves first, suppresses duplicate clicks and opens review without another Preview',async()=>{const s=setup();try{await s.ui.open();assert.deepEqual(s.calls,['account']);assert.equal(s.$<HTMLDetailsElement>('[data-ai-advanced]').open,false);const prompt=s.$<HTMLTextAreaElement>('[data-ai-prompt]');prompt.value='Make bold';prompt.dispatchEvent(new s.dom.window.Event('input'));assert.equal(s.calls.includes('send'),false);s.$('[data-subscription-send]').click();s.$('[data-subscription-send]').click();await settle();assert.equal(s.calls.filter(c=>c==='send').length,1);assert.equal(s.$<HTMLButtonElement>('[data-subscription-send]').disabled,true);s.finish();await settle();await settle();assert.equal(s.calls.at(-1),'review');assert.equal(s.$<HTMLDialogElement>('dialog').open,false);assert.equal(s.calls.some(c=>c.startsWith('remove:')),false);await s.getReview()!.onRejected();assert.equal(s.calls.at(-1),'remove:ready');assert.deepEqual(s.errors,[]);}finally{s.close();}});
test('expired and outdated requests are labelled and never treated as ready proposals',async()=>{const s=setup();try{s.setRows([{id:'expired',noteId:'fixture',prompt:'Old',expiresAt:'2000-01-01',status:'expired'},{id:'outdated',noteId:'fixture',prompt:'Other',expiresAt:'2099-01-01',status:'outdated'}]);await s.ui.open();assert.match(s.$('[data-ai-existing]').textContent!,/expired/);assert.match(s.$('[data-ai-existing]').textContent!,/outdated/);s.$<HTMLSelectElement>('[data-ai-existing]').value='outdated';s.$('[data-ai-existing]').dispatchEvent(new s.dom.window.Event('change'));await settle();assert.match(s.$('[data-ai-status]').textContent!,/Outdated/);assert.equal(s.$('[data-ai-preview]').hidden,true);assert.equal(s.calls.includes('send'),false);assert.equal(s.calls.includes('review'),false);}finally{s.close();}});
test('Close preserves a ready proposal; explicit Apply callback records completion and removes only its request',async()=>{const s=setup();try{s.setRows([{id:'ready',noteId:'fixture',prompt:'Make bold',expiresAt:'2099-01-01',status:'ready'}]);await s.ui.open();assert.equal(s.$('[data-ai-preview]').hidden,false);s.$('[data-ai-close]').click();assert.equal(s.calls.some(c=>c.startsWith('remove:')),false);await s.ui.open();s.$('[data-ai-preview]').click();await settle();await s.getReview()!.onApplied();assert.equal(s.calls.at(-1),'remove:ready');assert.equal(s.$('[data-ai-outcome]').hidden,false);assert.match(s.$('[data-ai-outcome-text]').textContent!,/applied/);}finally{s.close();}});

test('Cancel generation stops the owned job and removes its one-note request without another transmission',async()=>{const s=setup();try{await s.ui.open();const p=s.$<HTMLTextAreaElement>('[data-ai-prompt]');p.value='Make bold';p.dispatchEvent(new s.dom.window.Event('input'));s.$('[data-subscription-send]').click();await settle();s.running();await settle();assert.equal(s.$('[data-subscription-stop]').hidden,false);s.$('[data-subscription-stop]').click();await settle();assert.deepEqual(s.calls.slice(-2),['cancel-job','remove:running']);assert.match(s.$('[data-ai-status]').textContent!,/request removed/);assert.equal(s.calls.filter(c=>c==='send').length,1);}finally{s.close();}});

test('an older backend is explained and generation stays disabled until the native app is updated',async()=>{const s=setup();try{s.setRows([{id:'legacy',noteId:'fixture',prompt:'Old',expiresAt:'2099-01-01',status:undefined as unknown as string}]);await s.ui.open();assert.match(s.$('[data-ai-status]').textContent!,/older Noted backend/);assert.equal(s.$<HTMLButtonElement>('[data-subscription-send]').disabled,true);assert.equal(s.calls.includes('send'),false);}finally{s.close();}});

test('schema guidance requires fresh per-use consent and defaults to formal rules only',async()=>{const s=setup();try{await s.ui.open(true);assert.equal(s.$<HTMLInputElement>('[data-ai-include-guide]').checked,false);s.$('[data-subscription-send]').click();await settle();const first=s.contexts[0] as any;assert.equal(first.includeGuidance,false);assert.equal(first.schema.guide,undefined);s.finish();await settle();await settle();await s.ui.open(true);assert.equal(s.$<HTMLInputElement>('[data-ai-include-guide]').checked,false);s.$<HTMLInputElement>('[data-ai-include-guide]').checked=true;s.$('[data-subscription-send]').click();await settle();const second=s.contexts[1] as any;assert.equal(second.includeGuidance,true);assert.equal(second.schema.guide.title,'Synthetic guide');assert.equal(s.$<HTMLInputElement>('[data-ai-include-guide]').checked,false);s.finish();await settle();await settle();assert.deepEqual(s.errors,[]);}finally{s.close();}});

test('adherence mode does not offer an unrelated ordinary formatting proposal by default',async()=>{const s=setup();try{s.setRows([{id:'ordinary',noteId:'fixture',prompt:'Make bold',expiresAt:'2099-01-01',status:'ready'}]);await s.ui.open(true);assert.equal(s.$('[data-ai-preview]').hidden,true);assert.equal(s.calls.includes('review'),false);assert.deepEqual(s.errors,[]);}finally{s.close();}});

test('interactive goal sends one explicit component request without a guide or external-agent grant',async()=>{const s=setup();try{await s.ui.open();s.$<HTMLSelectElement>('[data-ai-goal]').value='component';s.$('[data-ai-goal]').dispatchEvent(new s.dom.window.Event('change'));await settle();assert.equal(s.$<HTMLButtonElement>('[data-ai-request]').disabled,true);assert.equal(s.calls.includes('send'),false);s.$('[data-subscription-send]').click();await settle();assert.deepEqual(s.contexts[0],{kind:'component'});s.finish('component');await settle();await settle();assert.equal(s.calls.at(-1),'component-review');assert.equal(s.calls.includes('review'),false);assert.deepEqual(s.errors,[]);await s.getReview()!.onRejected();assert.equal(s.calls.at(-1),'remove:ready');}finally{s.close();}});

test('private notes visibly disable both AI generation routes without checking sign-in or sending',async()=>{const f=setup();try{f.setAIAllowed(false);await f.ui.open();assert.match(f.$('[data-ai-status]').textContent!,/excluded from all AI access/);f.$<HTMLTextAreaElement>('[data-ai-prompt]').value='No private data';f.$<HTMLTextAreaElement>('[data-ai-prompt]').dispatchEvent(new f.dom.window.Event('input'));assert.equal(f.$<HTMLButtonElement>('[data-subscription-send]').disabled,true);assert.equal(f.$<HTMLButtonElement>('[data-ai-request]').disabled,true);assert.equal(f.calls.includes('account'),false);assert.equal(f.calls.includes('send'),false);}finally{f.close();}});

test('the visible scope follows fresh guide consent without creating any request',async()=>{const f=setup();try{await f.ui.open(true);assert.match(f.$('[data-request-contents]').textContent!,/not included/);const guide=f.$<HTMLInputElement>('[data-ai-include-guide]');guide.checked=true;guide.dispatchEvent(new f.dom.window.Event('change'));assert.match(f.$('[data-request-contents]').textContent!,/full document guide \(Synthetic guide\)/);assert.equal(f.calls.includes('send'),false);assert.equal(f.calls.includes('external'),false);f.$('[data-ai-close]').click();await f.ui.open(true);assert.equal(guide.checked,false);assert.match(f.$('[data-request-contents]').textContent!,/not included/);}finally{f.close();}});

const microtasks=()=>new Promise(resolve=>setImmediate(resolve));
test('explicit schema adherence does not reuse an owned ordinary-formatting proposal',async()=>{
 const f=setup();try{
  await f.ui.open();const p=f.$<HTMLTextAreaElement>('[data-ai-prompt]');p.value='Make bold';p.dispatchEvent(new f.dom.window.Event('input'));f.$('[data-subscription-send]').click();await microtasks();f.finish();await microtasks();
  await f.ui.open(true);assert.equal(f.$<HTMLSelectElement>('[data-ai-goal]').value,'schema');assert.equal(f.$('[data-ai-preview]').hidden,true);
 }finally{f.close();}
});
async function startRunning(f:ReturnType<typeof setup>,component=false){
 await f.ui.open();
 if(component){f.$<HTMLSelectElement>('[data-ai-goal]').value='component';f.$('[data-ai-goal]').dispatchEvent(new f.dom.window.Event('change'));await microtasks();}
 const prompt=f.$<HTMLTextAreaElement>('[data-ai-prompt]');prompt.value='Make bold';prompt.dispatchEvent(new f.dom.window.Event('input'));f.$('[data-subscription-send]').click();await microtasks();f.running();await microtasks();
}
test('closed-dialog polling reads only the owned local job and resumes its original note and component goal',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=setup();
 try{
  await startRunning(f,true);assert.match(f.$('[data-activity-state]').textContent!,/Generating/);
  const reads=f.requestReads.length;f.$('[data-ai-close]').click();await microtasks();f.setNote('other');f.completeBackground('component');
  t.mock.timers.tick(2000);await microtasks();
  assert.match(f.$('[data-activity-state]').textContent!,/ready/);assert.equal(f.$('[data-activity-note]').textContent,'Synthetic job note');
  assert.equal(f.requestReads.length,reads);assert.equal(f.calls.includes('component-review'),false);assert.equal(f.calls.filter(c=>c==='send').length,1);
  f.$('[data-activity-open]').click();await microtasks();await microtasks();
  assert.equal(f.calls.includes('open:fixture'),true);assert.equal(f.$<HTMLSelectElement>('[data-ai-goal]').value,'component');assert.equal(f.calls.at(-1),'component-review');assert.equal(f.$<HTMLInputElement>('[data-ai-include-guide]').checked,false);
  await f.getReview()!.onRejected();assert.equal(f.$('.ai-job-status').hidden,true);
 }finally{f.close();}
});
test('closing while generation is starting retains the eventual proposal without reading another note',async()=>{
 const f=setup();try{
  await f.ui.open();const p=f.$<HTMLTextAreaElement>('[data-ai-prompt]');p.value='Make bold';p.dispatchEvent(new f.dom.window.Event('input'));f.$('[data-subscription-send]').click();await microtasks();
  assert.match(f.$('[data-activity-state]').textContent!,/Preparing/);const reads=f.requestReads.length;
  f.$('[data-ai-close]').click();f.setNote('other');f.finish();await microtasks();await microtasks();
  assert.equal(f.requestReads.length,reads);assert.match(f.$('[data-activity-state]').textContent!,/ready/);assert.equal(f.calls.includes('review'),false);
  f.$('[data-activity-open]').click();await microtasks();await microtasks();assert.equal(f.calls.at(-1),'review');assert.equal(f.calls.filter(c=>c==='send').length,1);
 }finally{f.close();}
});
test('resuming a missing or outdated owned request cannot silently select a different proposal',async()=>{
 const f=setup();try{
  await startRunning(f);f.completeBackground();f.$('[data-ai-close]').click();await microtasks();
  f.setRows([{id:'different',noteId:'fixture',prompt:'Other proposal',expiresAt:'2099-01-01',status:'ready'}]);
  f.$('[data-activity-open]').click();await microtasks();await microtasks();
  assert.match(f.$('[data-ai-status]').textContent!,/no longer available/);assert.equal(f.calls.includes('review'),false);assert.equal(f.$('[data-ai-preview]').hidden,true);
  f.$('[data-ai-close]').click();f.setRows([{id:'running',noteId:'fixture',prompt:'Old proposal',expiresAt:'2099-01-01',status:'outdated'}]);
  f.$('[data-activity-open]').click();await microtasks();await microtasks();assert.match(f.$('[data-ai-status]').textContent!,/Outdated/);assert.equal(f.calls.includes('review'),false);
 }finally{f.close();}
});
test('status errors back off and pause after three failures; explicit reopening retries without sending',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=setup();
 try{
  await startRunning(f);f.setJobFailure(true);f.$('[data-ai-close]').click();await microtasks();
  const first=f.statusReads();assert.match(f.$('[data-activity-state]').textContent!,/unavailable/);
  t.mock.timers.tick(3999);await microtasks();assert.equal(f.statusReads(),first);
  t.mock.timers.tick(1);await microtasks();assert.equal(f.statusReads(),first+1);
  t.mock.timers.tick(8000);await microtasks();assert.equal(f.statusReads(),first+2);
  t.mock.timers.tick(60000);await microtasks();assert.equal(f.statusReads(),first+2);
  f.setJobFailure(false);f.$('[data-activity-open]').click();await microtasks();await microtasks();assert.match(f.$('[data-activity-state]').textContent!,/Generating/);assert.equal(f.calls.filter(c=>c==='send').length,1);
 }finally{f.close();}
});
test('failed return-to-note preserves status for retry, and a newly private note blocks proposal reads',async()=>{
 const f=setup();try{
  await startRunning(f);f.completeBackground();f.$('[data-ai-close]').click();await microtasks();f.setNote('other');f.setOpenFailure(true);
  f.$('[data-activity-open]').click();await microtasks();await microtasks();assert.match(f.$('[data-activity-message]').textContent!,/draft is kept open/);assert.equal(f.$<HTMLDialogElement>('dialog').open,false);
  f.setOpenFailure(false);f.setAIAllowed(false);const reads=f.requestReads.length;
  f.$('[data-activity-open]').click();await microtasks();await microtasks();assert.match(f.$('[data-ai-status]').textContent!,/excluded from all AI access/);assert.equal(f.requestReads.length,reads);assert.equal(f.calls.includes('review'),false);
 }finally{f.close();}
});
test('a missing request while its job is running keeps cancellation available',async()=>{
 const f=setup();try{
  await startRunning(f);f.$('[data-ai-close]').click();await microtasks();f.setRows([]);
  f.$('[data-activity-open]').click();await microtasks();await microtasks();
  assert.equal(f.$('[data-subscription-stop]').hidden,false);assert.equal(f.$('[data-activity-dismiss]').hidden,true);
  assert.equal(f.$<HTMLButtonElement>('[data-subscription-send]').disabled,true);
  f.$('[data-subscription-stop]').click();await microtasks();assert.equal(f.calls.includes('cancel-job'),true);assert.equal(f.$('.ai-job-status').hidden,true);
 }finally{f.close();}
});
test('opening AI on another note identifies the actual running job origin',async()=>{
 const f=setup();try{
  await startRunning(f);f.$('[data-ai-close]').click();await microtasks();f.setNote('other');await f.ui.open();await microtasks();
  assert.match(f.$('[data-ai-status]').textContent!,/Synthetic job note/);assert.equal(f.calls.filter(c=>c==='send').length,1);
 }finally{f.close();}
});
test('owned-job polling cannot replace a private-note denial with a generation message',async()=>{
 const f=setup();try{
  await startRunning(f);f.$('[data-ai-close]').click();await microtasks();f.setNote('other');f.setAIAllowed(false);const reads=f.requestReads.length;
  await f.ui.open();await microtasks();assert.match(f.$('[data-ai-status]').textContent!,/excluded from all AI access/);assert.equal(f.requestReads.length,reads);
 }finally{f.close();}
});
test('review rechecks the exact request after saving and refuses a newly outdated proposal',async()=>{
 const f=setup();try{
  f.setRows([{id:'ready',noteId:'fixture',prompt:'Make bold',expiresAt:'2099-01-01',status:'ready'}]);await f.ui.open();await microtasks();f.invalidateReviewFlush();
  f.$('[data-ai-preview]').click();await microtasks();await microtasks();assert.equal(f.calls.includes('review'),false);assert.match(f.$('[data-ai-status]').textContent!,/[Oo]utdated/);assert.equal(f.$('[data-ai-preview]').hidden,true);
 }finally{f.close();}
});
test('review rechecks AI exclusion before fetching another request or opening comparison',async()=>{
 const f=setup();try{
  f.setRows([{id:'ready',noteId:'fixture',prompt:'Make bold',expiresAt:'2099-01-01',status:'ready'}]);await f.ui.open();await microtasks();const reads=f.requestReads.length;f.setAIAllowed(false);
  f.$('[data-ai-preview]').click();await microtasks();await microtasks();assert.equal(f.calls.includes('review'),false);assert.equal(f.requestReads.length,reads);assert.match(f.$('[data-ai-status]').textContent!,/excluded from all AI access/);
 }finally{f.close();}
});

import {counterComponent} from './component-runtime-examples.ts';import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';import {initializeAIFormatting} from './ai-formatting-ui.ts';import type {Note} from './model.ts';import type {ProposalReview} from './document-tools-ui.ts';
const settle=()=>new Promise(r=>setTimeout(r,0));
function setup(){
 const dom=new JSDOM('<div id="host"></div>');
 Object.assign(dom.window.HTMLDialogElement.prototype,{showModal(this:HTMLDialogElement){this.setAttribute('open','');},close(this:HTMLDialogElement){this.removeAttribute('open');this.dispatchEvent(new dom.window.Event('close'));}});
 const host=dom.window.document.querySelector<HTMLElement>('#host')!;
 let note={id:'fixture',title:'Synthetic job note',revision:1,revisionToken:'saved'} as Note;
 let rows:{id:string;noteId:string;prompt:string;expiresAt:string;status:string;kind?:'component'}[]=[],review:ProposalReview|null=null,release:((j:unknown)=>void)|undefined;
 const calls:string[]=[],errors:unknown[]=[],contexts:unknown[]=[],requestReads:string[]=[],externalTargets:string[]=[];
 let aiAllowed=true,jobResponse:any=null,jobFailure=false,cancelFailure=false,removeFailure=false,requestsFailure=false,accountFailure=false,statusReads=0,openFailure=false,startedNoteId='fixture',invalidateOnReviewFlush=false;
 let eligibilityGate:Promise<void>|null=null,flushGate:Promise<void>|null=null,createGate:Promise<void>|null=null;
 const api={
  async noteAIAllowed(){if(eligibilityGate)await eligibilityGate;return aiAllowed;},
  async schemaGuidanceCapabilities(){return{formattingProtocol:4,perRequestGuidanceConsent:true,componentSuggestions:true};},
  async subscriptionStatus(){calls.push('account');if(accountFailure)throw new Error('Synthetic account discovery failure');return{available:true,authentication:'chatgpt',message:'Signed in'};},
  async formattingRequests(id:string){requestReads.push(id);if(requestsFailure)throw new Error('Synthetic saved-request read failure');return rows.filter(r=>r.noteId===id);},
  async startSubscription(_n:Note,_p:string,context?:unknown){startedNoteId=_n.id;contexts.push(context);calls.push('send');return await new Promise<any>(r=>release=r);},
  async subscriptionJob(){statusReads++;if(jobFailure||!jobResponse)throw new Error('Synthetic local status failure');return jobResponse;},
  async cancelSubscription(){calls.push('cancel-job');if(cancelFailure)throw new Error('Synthetic cancellation was not acknowledged');},
  async componentReply(){return {summary:'Counter',definition:counterComponent,properties:{label:'Fixture'}};},
  async formattingReply(id:string){return rows.some(r=>r.id===id&&r.status==='ready')?{summary:'Clearer layout',operations:[]}:null;},
  async cancelFormattingRequest(id:string){calls.push('remove:'+id);if(removeFailure)throw new Error('Synthetic request removal failed');rows=rows.filter(r=>r.id!==id);},
  async createFormattingRequest(id:string){calls.push('external');externalTargets.push(id);if(createGate)await createGate;return{id:'external',noteId:id,expiresAt:'2099-01-01'};},
 };
 const ui=initializeAIFormatting(host,{
  api,native:true,schema:()=>({formatVersion:2,id:'guide',version:1,name:'Guide',rules:{body:{}},guide:{title:'Synthetic guide',document:{version:2,objects:{},readingOrder:[],layout:{id:'root',kind:'free',children:[]},styles:{}}}}),
  note:()=>note,editor:()=>null,async openNote(id){calls.push('open:'+id);if(!openFailure)note={...note,id,title:'Synthetic job note'};},async flush(){calls.push('flush');if(flushGate)await flushGate;if(invalidateOnReviewFlush)rows=rows.map(row=>({...row,status:'outdated'}));},error:e=>errors.push(e),
  async componentProposal(_value,settings){calls.push('component-review');review=settings;},async proposal(_ops,settings){calls.push('review');review=settings;},
 });
 return{
  dom,host,ui,calls,contexts,errors,requestReads,externalTargets,setAIAllowed:(value:boolean)=>aiAllowed=value,
  $:<T extends HTMLElement>(s:string)=>host.querySelector<T>(s)!,setRows:(r:typeof rows)=>rows=r,getReview:()=>review,
  setNote(id:string){note={...note,id,title:'Synthetic other note'};},setOpenFailure(value:boolean){openFailure=value;},setJobFailure(value:boolean){jobFailure=value;},invalidateReviewFlush(){invalidateOnReviewFlush=true;},statusReads:()=>statusReads,
  setJobPhase(phase:string,message?:string){jobResponse={...jobResponse,phase,...(message?{message}:{})};},setCancelFailure(value:boolean){cancelFailure=value;},setRemoveFailure(value:boolean){removeFailure=value;},setRequestsFailure(value:boolean){requestsFailure=value;},setAccountFailure(value:boolean){accountFailure=value;},
  holdEligibility(){let release!:()=>void;eligibilityGate=new Promise<void>(resolve=>release=resolve);return()=>{eligibilityGate=null;release();};},
  holdFlush(){let release!:()=>void;flushGate=new Promise<void>(resolve=>release=resolve);return()=>{flushGate=null;release();};},
  holdCreate(){let release!:()=>void;createGate=new Promise<void>(resolve=>release=resolve);return()=>{createGate=null;release();};},
  completeBackground(kind?:'component'){rows=[{kind,id:'running',noteId:'fixture',prompt:'Make bold',expiresAt:'2099-01-01',status:'ready'}];jobResponse={id:'job',requestId:'running',noteId:'fixture',phase:'completed',message:'Proposal received'};},
  running(){rows=[{id:'running',noteId:note.id,prompt:'Make bold',expiresAt:'2099-01-01',status:'waiting'}];jobResponse={id:'job',requestId:'running',noteId:note.id,phase:'running',message:'Generating'};release!(jobResponse);},
  finish(kind?:'component'){rows=[{kind,id:'ready',noteId:startedNoteId,prompt:'Make bold',expiresAt:'2099-01-01',status:'ready'}];release!({id:'job',requestId:'ready',noteId:startedNoteId,phase:'completed',message:'Cached proposal ready'});},
  close(){ui.destroy();dom.window.close();},
 };
}
test('opening and typing never transmits; Generate saves first, suppresses duplicate clicks and opens review without another Preview',async()=>{const s=setup();try{await s.ui.open();assert.deepEqual(s.calls,['account']);assert.equal(s.$<HTMLDetailsElement>('[data-ai-advanced]').open,false);const prompt=s.$<HTMLTextAreaElement>('[data-ai-prompt]');prompt.value='Make bold';prompt.dispatchEvent(new s.dom.window.Event('input'));assert.equal(s.calls.includes('send'),false);s.$('[data-subscription-send]').click();s.$('[data-subscription-send]').click();await settle();assert.equal(s.calls.filter(c=>c==='send').length,1);assert.equal(s.$<HTMLButtonElement>('[data-subscription-send]').disabled,true);s.finish();await settle();await settle();assert.equal(s.calls.at(-1),'review');assert.equal(s.$<HTMLDialogElement>('dialog').open,false);assert.equal(s.calls.some(c=>c.startsWith('remove:')),false);await s.getReview()!.onRejected();assert.equal(s.calls.at(-1),'remove:ready');assert.deepEqual(s.errors,[]);}finally{s.close();}});
test('expired and outdated requests are labelled and never treated as ready proposals',async()=>{const s=setup();try{s.setRows([{id:'expired',noteId:'fixture',prompt:'Old',expiresAt:'2000-01-01',status:'expired'},{id:'outdated',noteId:'fixture',prompt:'Other',expiresAt:'2099-01-01',status:'outdated'}]);await s.ui.open();assert.match(s.$('[data-ai-existing]').textContent!,/expired/);assert.match(s.$('[data-ai-existing]').textContent!,/outdated/);s.$<HTMLSelectElement>('[data-ai-existing]').value='outdated';s.$('[data-ai-existing]').dispatchEvent(new s.dom.window.Event('change'));await settle();assert.match(s.$('[data-ai-status]').textContent!,/Outdated/);assert.equal(s.$('[data-ai-preview]').hidden,true);assert.equal(s.calls.includes('send'),false);assert.equal(s.calls.includes('review'),false);}finally{s.close();}});
test('Close preserves a ready proposal; explicit Apply callback records completion and removes only its request',async()=>{const s=setup();try{s.setRows([{id:'ready',noteId:'fixture',prompt:'Make bold',expiresAt:'2099-01-01',status:'ready'}]);await s.ui.open();assert.equal(s.$('[data-ai-preview]').hidden,false);s.$('[data-ai-close]').click();assert.equal(s.calls.some(c=>c.startsWith('remove:')),false);await s.ui.open();s.$('[data-ai-preview]').click();await settle();await s.getReview()!.onApplied();assert.equal(s.calls.at(-1),'remove:ready');assert.equal(s.$('[data-ai-outcome]').hidden,false);assert.match(s.$('[data-ai-outcome-text]').textContent!,/applied/);}finally{s.close();}});

test('Cancel stays pending until local status resolves and removes only its owned request without another transmission',async()=>{const s=setup();try{await s.ui.open();const p=s.$<HTMLTextAreaElement>('[data-ai-prompt]');p.value='Make bold';p.dispatchEvent(new s.dom.window.Event('input'));s.$('[data-subscription-send]').click();await settle();s.running();await settle();s.$('[data-subscription-stop]').click();s.$('[data-subscription-stop]').click();await settle();assert.deepEqual(s.calls.slice(-2),['cancel-job','remove:running']);assert.match(s.$('[data-ai-status]').textContent!,/Cancellation requested.*Waiting.*request removed/);assert.equal(s.$('[data-activity-state]').textContent,'Cancellation requested');assert.equal(s.$<HTMLButtonElement>('[data-subscription-send]').disabled,true);assert.equal(s.$('[data-activity-dismiss]').hidden,true);s.setJobPhase('cancelled');s.$('[data-ai-close]').click();await settle();await settle();assert.equal(s.$('[data-activity-state]').textContent,'Cancellation reported');assert.match(s.$('[data-activity-message]').textContent!,/local runner.*No proposal was applied.*usage/);assert.equal(s.$('[data-activity-dismiss]').hidden,false);assert.equal(s.calls.filter(c=>c==='send').length,1);assert.equal(s.calls.includes('review'),false);}finally{s.close();}});

test('a completion racing with Cancel never opens or applies the proposal',async()=>{const s=setup();try{await s.ui.open();const p=s.$<HTMLTextAreaElement>('[data-ai-prompt]');p.value='Make bold';p.dispatchEvent(new s.dom.window.Event('input'));s.$('[data-subscription-send]').click();await settle();s.running();await settle();s.$('[data-subscription-stop]').click();await settle();s.setJobPhase('completed');s.$('[data-ai-close]').click();await settle();await settle();assert.match(s.$('[data-activity-message]').textContent!,/finished before cancellation was reported/);assert.equal(s.calls.includes('review'),false);assert.equal(s.calls.filter(c=>c==='send').length,1);}finally{s.close();}});

test('unacknowledged cancellation preserves the active job and allows an explicit retry',async()=>{const s=setup();try{await s.ui.open();const p=s.$<HTMLTextAreaElement>('[data-ai-prompt]');p.value='Make bold';p.dispatchEvent(new s.dom.window.Event('input'));s.$('[data-subscription-send]').click();await settle();s.running();await settle();s.setCancelFailure(true);s.$('[data-subscription-stop]').click();await settle();assert.equal(s.$<HTMLButtonElement>('[data-subscription-send]').disabled,true);assert.equal(s.$<HTMLButtonElement>('[data-subscription-stop]').disabled,false);assert.equal(s.calls.includes('remove:running'),false);assert.match(s.$('[data-activity-message]').textContent!,/could not be confirmed/);s.setCancelFailure(false);s.$('[data-subscription-stop]').click();await settle();assert.equal(s.calls.filter(c=>c==='cancel-job').length,2);assert.equal(s.calls.filter(c=>c==='send').length,1);}finally{s.close();}});

test('failed request removal does not get reported as removed after cancellation',async()=>{const s=setup();try{await s.ui.open();const p=s.$<HTMLTextAreaElement>('[data-ai-prompt]');p.value='Make bold';p.dispatchEvent(new s.dom.window.Event('input'));s.$('[data-subscription-send]').click();await settle();s.running();await settle();s.setRemoveFailure(true);s.$('[data-subscription-stop]').click();await settle();s.setJobPhase('cancelled');s.$('[data-ai-close]').click();await settle();await settle();assert.match(s.$('[data-activity-message]').textContent!,/saved request may remain under Advanced/);assert.doesNotMatch(s.$('[data-activity-message]').textContent!,/Saved request removed/);assert.equal(s.errors.length,1);}finally{s.close();}});

test('an older backend is explained and generation stays disabled until the native app is updated',async()=>{const s=setup();try{s.setRows([{id:'legacy',noteId:'fixture',prompt:'Old',expiresAt:'2099-01-01',status:undefined as unknown as string}]);await s.ui.open();assert.match(s.$('[data-ai-status]').textContent!,/older Noted backend/);assert.equal(s.$<HTMLButtonElement>('[data-subscription-send]').disabled,true);assert.equal(s.calls.includes('send'),false);}finally{s.close();}});

test('schema guidance requires fresh per-use consent and defaults to formal rules only',async()=>{const s=setup();try{await s.ui.open(true);assert.equal(s.$<HTMLInputElement>('[data-ai-include-guide]').checked,false);s.$('[data-subscription-send]').click();await settle();const first=s.contexts[0] as any;assert.equal(first.includeGuidance,false);assert.equal(first.schema.guide,undefined);s.finish();await settle();await settle();await s.ui.open(true);assert.equal(s.$<HTMLInputElement>('[data-ai-include-guide]').checked,false);s.$<HTMLInputElement>('[data-ai-include-guide]').checked=true;s.$('[data-subscription-send]').click();await settle();const second=s.contexts[1] as any;assert.equal(second.includeGuidance,true);assert.equal(second.schema.guide.title,'Synthetic guide');assert.equal(s.$<HTMLInputElement>('[data-ai-include-guide]').checked,false);s.finish();await settle();await settle();assert.deepEqual(s.errors,[]);}finally{s.close();}});

test('adherence mode does not offer an unrelated ordinary formatting proposal by default',async()=>{const s=setup();try{s.setRows([{id:'ordinary',noteId:'fixture',prompt:'Make bold',expiresAt:'2099-01-01',status:'ready'}]);await s.ui.open(true);assert.equal(s.$('[data-ai-preview]').hidden,true);assert.equal(s.calls.includes('review'),false);assert.deepEqual(s.errors,[]);}finally{s.close();}});

test('interactive goal sends one explicit component request without a guide or external-agent grant',async()=>{const s=setup();try{await s.ui.open();s.$<HTMLSelectElement>('[data-ai-goal]').value='component';s.$('[data-ai-goal]').dispatchEvent(new s.dom.window.Event('change'));await settle();assert.equal(s.$<HTMLButtonElement>('[data-ai-request]').disabled,true);assert.equal(s.calls.includes('send'),false);s.$('[data-subscription-send]').click();await settle();assert.deepEqual(s.contexts[0],{kind:'component'});s.finish('component');await settle();await settle();assert.equal(s.calls.at(-1),'component-review');assert.equal(s.calls.includes('review'),false);assert.deepEqual(s.errors,[]);await s.getReview()!.onRejected();assert.equal(s.calls.at(-1),'remove:ready');}finally{s.close();}});

test('private notes visibly disable both AI generation routes without checking sign-in or sending',async()=>{const f=setup();try{f.setAIAllowed(false);await f.ui.open();assert.match(f.$('[data-ai-status]').textContent!,/excluded from all AI access/);f.$<HTMLTextAreaElement>('[data-ai-prompt]').value='No private data';f.$<HTMLTextAreaElement>('[data-ai-prompt]').dispatchEvent(new f.dom.window.Event('input'));assert.equal(f.$<HTMLButtonElement>('[data-subscription-send]').disabled,true);assert.equal(f.$<HTMLButtonElement>('[data-ai-request]').disabled,true);assert.equal(f.calls.includes('account'),false);assert.equal(f.calls.includes('send'),false);}finally{f.close();}});

test('the visible scope follows fresh guide consent without creating any request',async()=>{const f=setup();try{await f.ui.open(true);assert.match(f.$('[data-request-contents]').textContent!,/not included/);const guide=f.$<HTMLInputElement>('[data-ai-include-guide]');guide.checked=true;guide.dispatchEvent(new f.dom.window.Event('change'));assert.match(f.$('[data-request-contents]').textContent!,/full document guide \(Synthetic guide\)/);assert.equal(f.calls.includes('send'),false);assert.equal(f.calls.includes('external'),false);f.$('[data-ai-close]').click();await f.ui.open(true);assert.equal(guide.checked,false);assert.match(f.$('[data-request-contents]').textContent!,/not included/);}finally{f.close();}});

const microtasks=()=>new Promise(resolve=>setImmediate(resolve));
test('AI approval cannot follow navigation during eligibility or save for either request route',async()=>{
 for(const route of ['[data-subscription-send]','[data-ai-request]'])for(const stage of ['eligibility','save']){
  const f=setup();try{
   await f.ui.open();const prompt=f.$<HTMLTextAreaElement>('[data-ai-prompt]');prompt.value='Only the approved synthetic note';prompt.dispatchEvent(new f.dom.window.Event('input'));
   const release=stage==='eligibility'?f.holdEligibility():f.holdFlush();f.$(route).click();await microtasks();
   f.$('[data-ai-close]').click();f.setNote('different-unapproved-note');release();await microtasks();await microtasks();
   assert.equal(f.calls.includes('send'),false,`${route}/${stage} must not send the newly opened note`);
   assert.equal(f.calls.includes('external'),false,`${route}/${stage} must not grant an external request for the newly opened note`);
   assert.ok(f.errors.some(error=>String(error).includes('open note changed')));
  }finally{f.close();}
 }
});

test('an approved guidance snapshot survives closing during save without borrowing later dialog state',async()=>{
 const f=setup();try{
  await f.ui.open(true);f.$<HTMLInputElement>('[data-ai-include-guide]').checked=true;
  const release=f.holdFlush();f.$('[data-subscription-send]').click();await microtasks();f.$('[data-ai-close]').click();
  assert.equal(f.$<HTMLInputElement>('[data-ai-include-guide]').checked,false);release();await microtasks();await microtasks();
  assert.equal(f.calls.filter(call=>call==='send').length,1);assert.equal((f.contexts[0] as any).includeGuidance,true);assert.equal((f.contexts[0] as any).schema.guide.title,'Synthetic guide');
  f.finish();await microtasks();
 }finally{f.close();}
});

test('a late external-request response cannot read or preview another note after navigation',async()=>{
 const f=setup();try{
  await f.ui.open();const prompt=f.$<HTMLTextAreaElement>('[data-ai-prompt]');prompt.value='Approved original note';prompt.dispatchEvent(new f.dom.window.Event('input'));
  const release=f.holdCreate();f.$('[data-ai-request]').click();await microtasks();assert.deepEqual(f.externalTargets,['fixture']);
  f.$('[data-ai-close]').click();f.setNote('other');f.setRows([{id:'other-ready',noteId:'other',prompt:'Unrelated ready proposal',expiresAt:'2099-01-01',status:'ready'}]);const reads=f.requestReads.length;
  await f.ui.open();release();await microtasks();await microtasks();
  assert.equal(f.requestReads.length,reads);assert.equal(f.calls.includes('review'),false);assert.equal(f.calls.includes('send'),false);assert.equal(f.$('[data-ai-preview]').hidden,true);
 }finally{f.close();}
});

test('creating an external request cannot automatically review an older proposal if the new ID is not listed',async()=>{
 const f=setup();try{
  f.setRows([{id:'older',noteId:'fixture',prompt:'Older proposal',expiresAt:'2099-01-01',status:'ready'}]);await f.ui.open();
  const prompt=f.$<HTMLTextAreaElement>('[data-ai-prompt]');prompt.value='A new request';prompt.dispatchEvent(new f.dom.window.Event('input'));f.$('[data-ai-request]').click();await microtasks();await microtasks();
  assert.equal(f.calls.includes('review'),false);assert.equal(f.$('[data-ai-preview]').hidden,true);assert.equal(f.$<HTMLSelectElement>('[data-ai-existing]').value,'');
 }finally{f.close();}
});

test('refresh and polling never substitute an older proposal for a missing selected request',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 for(const action of ['refresh','poll']){
  const f=setup();try{
   f.setRows([{id:'external',noteId:'fixture',prompt:'Owned pending request',expiresAt:'2099-01-01',status:'waiting'},{id:'older',noteId:'fixture',prompt:'Older proposal',expiresAt:'2099-01-01',status:'ready'}]);
   await f.ui.open();const prompt=f.$<HTMLTextAreaElement>('[data-ai-prompt]');prompt.value='Owned pending request';prompt.dispatchEvent(new f.dom.window.Event('input'));f.$('[data-ai-request]').click();await microtasks();await microtasks();
   f.setRows([{id:'older',noteId:'fixture',prompt:'Older proposal',expiresAt:'2099-01-01',status:'ready'}]);
   if(action==='refresh')f.$('[data-ai-check]').click();else t.mock.timers.tick(2000);await microtasks();await microtasks();
   assert.equal(f.calls.includes('review'),false,action);assert.equal(f.$('[data-ai-preview]').hidden,true);assert.match(f.$('[data-ai-status]').textContent!,/no longer available/);
  }finally{f.close();}
 }
});

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

test('a completed job retains its ready state through request-read failure and reloads locally',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=setup();try{
  await startRunning(f);f.setRequestsFailure(true);f.completeBackground();t.mock.timers.tick(2000);await microtasks();await microtasks();
  assert.equal(f.$('[data-activity-state]').textContent,'Proposal ready');assert.equal(f.$('[data-subscription-stop]').hidden,true);
  assert.equal(f.$('[data-ai-preview]').hidden,false);assert.equal(f.$('[data-ai-preview]').textContent,'Load proposal');
  f.setRequestsFailure(false);f.$('[data-ai-preview]').click();await microtasks();await microtasks();
  assert.equal(f.calls.includes('review'),true);assert.equal(f.calls.filter(call=>call==='send').length,1);
 }finally{f.close();}
});

test('a failed job keeps its authoritative failure when the saved-request list is unavailable',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=setup();try{
  await startRunning(f);f.setRequestsFailure(true);f.setJobPhase('failed','Synthetic local generation failed');t.mock.timers.tick(2000);await microtasks();await microtasks();
  assert.equal(f.$('[data-activity-state]').textContent,'Generation needs attention');assert.match(f.$('[data-ai-status]').textContent!,/Synthetic local generation failed/);
  assert.equal(f.$('[data-subscription-stop]').hidden,true);assert.equal(f.$('[data-ai-preview]').hidden,true);assert.equal(f.calls.filter(call=>call==='send').length,1);
 }finally{f.close();}
});

test('reopening failed-job details preserves the failure without depending on the saved-request list',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=setup();try{
  await startRunning(f);f.setJobPhase('failed','Synthetic owned generation failure');t.mock.timers.tick(2000);await microtasks();await microtasks();
  f.$('[data-ai-close]').click();f.setRequestsFailure(true);f.setAccountFailure(true);const reads=f.requestReads.length;
  f.$('[data-activity-open]').click();await microtasks();await microtasks();
  assert.match(f.$('[data-ai-status]').textContent!,/Synthetic owned generation failure/);assert.equal(f.requestReads.length,reads);
  assert.equal(f.dom.window.document.activeElement,f.$('[data-ai-status]'));assert.equal(f.$('[data-ai-preview]').hidden,true);assert.equal(f.calls.filter(call=>call==='send').length,1);
 }finally{f.close();}
});

test('an immediately completed proposal is not mislabeled as generation failure when its local read fails',async()=>{
 const f=setup();try{
  await f.ui.open();const prompt=f.$<HTMLTextAreaElement>('[data-ai-prompt]');prompt.value='Make bold';prompt.dispatchEvent(new f.dom.window.Event('input'));f.$('[data-subscription-send]').click();await microtasks();
  f.setRequestsFailure(true);f.finish();await microtasks();await microtasks();assert.equal(f.$('[data-activity-state]').textContent,'Proposal ready');
  f.setRequestsFailure(false);f.$('[data-ai-preview]').click();await microtasks();await microtasks();assert.equal(f.calls.includes('review'),true);assert.equal(f.calls.filter(call=>call==='send').length,1);
 }finally{f.close();}
});

test('saved proposal review remains available when sign-in discovery fails, without enabling generation',async()=>{
 const f=setup();try{
  f.setRows([{id:'ready',noteId:'fixture',prompt:'Make bold',expiresAt:'2099-01-01',status:'ready'}]);f.setAccountFailure(true);await f.ui.open();
  assert.equal(f.$<HTMLButtonElement>('[data-subscription-send]').disabled,true);assert.equal(f.$('[data-ai-preview]').hidden,false);
  assert.match(f.$('[data-subscription-status]').textContent!,/could not be checked/);
  f.$('[data-ai-preview]').click();await microtasks();await microtasks();assert.equal(f.calls.includes('review'),true);assert.equal(f.calls.includes('send'),false);
 }finally{f.close();}
});

test('selecting a different saved request cannot expose a reload of the previous ready proposal',async()=>{
 const f=setup();try{
  f.setRows([{id:'older-ready',noteId:'fixture',prompt:'Older proposal',expiresAt:'2099-01-01',status:'ready'},{id:'pending',noteId:'fixture',prompt:'Selected pending request',expiresAt:'2099-01-01',status:'waiting'}]);await f.ui.open();
  const select=f.$<HTMLSelectElement>('[data-ai-existing]');select.value='pending';select.dispatchEvent(new f.dom.window.Event('change'));await microtasks();await microtasks();
  assert.equal(select.value,'pending');assert.equal(f.$('[data-ai-preview]').hidden,true);assert.equal(f.calls.includes('review'),false);
 }finally{f.close();}
});

test('a newly completed result can reload after failure even when an older request was previously selected',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=setup();try{
  f.setRows([{id:'older-ready',noteId:'fixture',prompt:'Older proposal',expiresAt:'2099-01-01',status:'ready'}]);await startRunning(f);
  f.setRequestsFailure(true);f.completeBackground();t.mock.timers.tick(2000);await microtasks();await microtasks();
  assert.equal(f.$('[data-ai-preview]').hidden,false);assert.equal(f.$('[data-ai-preview]').textContent,'Load proposal');
  f.setRequestsFailure(false);f.$('[data-ai-preview]').click();await microtasks();await microtasks();
  assert.equal(f.calls.includes('review'),true);assert.equal(f.calls.filter(call=>call==='send').length,1);
 }finally{f.close();}
});

test('local proposal reload rechecks privacy and saved-note freshness before review',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 for(const mode of ['private','outdated']){
  const f=setup();try{
   await startRunning(f);f.setRequestsFailure(true);f.completeBackground();t.mock.timers.tick(2000);await microtasks();await microtasks();
   f.setRequestsFailure(false);const reads=f.requestReads.length;
   if(mode==='private')f.setAIAllowed(false);else f.invalidateReviewFlush();
   f.$('[data-ai-preview]').click();await microtasks();await microtasks();
   assert.equal(f.calls.includes('review'),false);assert.equal(f.calls.filter(call=>call==='send').length,1);assert.equal(f.$('[data-ai-preview]').hidden,true);
   if(mode==='private'){assert.equal(f.requestReads.length,reads);assert.match(f.$('[data-ai-status]').textContent!,/excluded from all AI access/);}
   else assert.match(f.$('[data-ai-status]').textContent!,/[Oo]utdated/);
  }finally{f.close();}
 }
});
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
  f.$('[data-subscription-stop]').click();await microtasks();assert.equal(f.calls.includes('cancel-job'),true);assert.equal(f.$('.ai-job-status').hidden,false);assert.equal(f.$('[data-activity-state]').textContent,'Cancellation requested');
 }finally{f.close();}
});
test('closing and reopening a pending cancellation retains its status after its saved request is removed',async()=>{
 const f=setup();try{
  await startRunning(f);f.$('[data-subscription-stop]').click();await microtasks();
  f.$('[data-ai-close]').click();await microtasks();assert.equal(f.$('[data-activity-state]').textContent,'Cancellation requested');
  f.$('[data-activity-open]').click();await microtasks();await microtasks();
  assert.equal(f.$<HTMLDialogElement>('dialog').open,true);assert.match(f.$('[data-ai-status]').textContent!,/Waiting for local runner status/);
  assert.equal(f.$<HTMLButtonElement>('[data-subscription-send]').disabled,true);assert.equal(f.$<HTMLButtonElement>('[data-subscription-stop]').disabled,true);
  assert.equal(f.calls.filter(call=>call==='send').length,1);assert.equal(f.calls.includes('review'),false);
 }finally{f.close();}
});
test('reopening a reported cancellation shows its outcome and cannot select another saved proposal',async()=>{
 const f=setup();try{
  await startRunning(f);f.$('[data-subscription-stop]').click();await microtasks();f.setJobPhase('cancelled');f.$('[data-ai-close]').click();await microtasks();await microtasks();
  f.setRows([{id:'other-ready',noteId:'fixture',prompt:'Different old proposal',expiresAt:'2099-01-01',status:'ready'}]);f.$('[data-activity-open]').click();await microtasks();await microtasks();
  assert.match(f.$('[data-ai-status]').textContent!,/Cancellation reported by the local runner/);assert.match(f.$('[data-ai-status]').textContent!,/Already processed usage/);
  assert.equal(f.dom.window.document.activeElement,f.$('[data-ai-status]'));
  assert.equal(f.$('[data-ai-preview]').hidden,true);assert.equal(f.$<HTMLSelectElement>('[data-ai-existing]').value,'');assert.equal(f.calls.includes('review'),false);
 }finally{f.close();}
});
test('opening AI on another note identifies the actual running job origin',async()=>{
 const f=setup();try{
  await startRunning(f);f.$('[data-ai-close]').click();await microtasks();f.setNote('other');await f.ui.open();await microtasks();
  assert.match(f.$('[data-ai-status]').textContent!,/Synthetic job note/);assert.equal(f.calls.filter(c=>c==='send').length,1);
 }finally{f.close();}
});
test('a ready proposal on another note cannot replace the active job or redirect its cancellation',async()=>{
 const f=setup();try{
  await startRunning(f);f.$('[data-ai-close]').click();await microtasks();f.setNote('other');
  f.setRows([{id:'other-ready',noteId:'other',prompt:'Different saved proposal',expiresAt:'2099-01-01',status:'ready'}]);await f.ui.open();await microtasks();
  assert.equal(f.$('[data-activity-state]').textContent,'Generating proposal');assert.equal(f.$('[data-activity-note]').textContent,'Synthetic job note');assert.equal(f.$('[data-ai-preview]').hidden,true);
  f.$('[data-subscription-stop]').click();await microtasks();assert.equal(f.calls.includes('remove:running'),true);assert.equal(f.calls.includes('remove:other-ready'),false);
 }finally{f.close();}
});
test('owned-job polling cannot replace a private-note denial with a generation message',async()=>{
 const f=setup();try{
  await startRunning(f);f.$('[data-ai-close]').click();await microtasks();f.setNote('other');f.setAIAllowed(false);const reads=f.requestReads.length;
  await f.ui.open();await microtasks();assert.match(f.$('[data-ai-status]').textContent!,/excluded from all AI access/);assert.equal(f.requestReads.length,reads);
 }finally{f.close();}
});

test('terminal cancellation is shown even when saved-request reads fail',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=setup();
 try{
  await startRunning(f);f.$('[data-subscription-stop]').click();await microtasks();
  f.setRequestsFailure(true);f.setJobPhase('cancelled');t.mock.timers.tick(2000);await microtasks();await microtasks();
  assert.equal(f.$('[data-activity-state]').textContent,'Cancellation reported');
  assert.match(f.$('[data-ai-status]').textContent!,/Cancellation reported by the local runner/);
  assert.equal(f.$<HTMLButtonElement>('[data-subscription-send]').disabled,false);assert.equal(f.$('[data-subscription-stop]').hidden,true);
  assert.equal(f.calls.filter(call=>call==='send').length,1);assert.equal(f.calls.includes('review'),false);
 }finally{f.close();}
});

test('cancellation updates only its owned cached request and retains failed removal for recovery',async()=>{
 for(const fails of [false,true]){
  const f=setup();try{
   f.setRows([{id:'running',noteId:'fixture',prompt:'Owned request',expiresAt:'2099-01-01',status:'waiting'},{id:'unrelated',noteId:'fixture',prompt:'Keep this request',expiresAt:'2099-01-01',status:'ready'}]);
   await startRunning(f);f.setRequestsFailure(true);f.setRemoveFailure(fails);f.$('[data-subscription-stop]').click();await microtasks();
   const select=f.$<HTMLSelectElement>('[data-ai-existing]'),ids=Array.from(select.options).map(option=>option.value);
   assert.ok(ids.includes('unrelated'));assert.equal(ids.includes('running'),fails);assert.equal(select.value,'');
   assert.equal(f.calls.filter(call=>call==='send').length,1);assert.equal(f.calls.includes('remove:unrelated'),false);assert.equal(f.calls.includes('review'),false);
  }finally{f.close();}
 }
});

test('cancelling a paused status check resumes polling without a saved-request refresh',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=setup();
 try{
  await startRunning(f);f.setJobFailure(true);
  for(const delay of [2000,4000,8000]){t.mock.timers.tick(delay);await microtasks();}
  const paused=f.statusReads();t.mock.timers.tick(60000);await microtasks();assert.equal(f.statusReads(),paused);
  f.setJobFailure(false);f.setRequestsFailure(true);f.$('[data-subscription-stop]').click();await microtasks();
  f.setJobPhase('cancelled');t.mock.timers.tick(2000);await microtasks();await microtasks();
  assert.ok(f.statusReads()>paused);assert.equal(f.$('[data-activity-state]').textContent,'Cancellation reported');
  assert.equal(f.calls.filter(call=>call==='send').length,1);
 }finally{f.close();}
});

test('reopening cancellation details does not depend on account discovery or saved-request reads',async()=>{
 const f=setup();try{
  await startRunning(f);f.$('[data-subscription-stop]').click();await microtasks();f.$('[data-ai-close]').click();await microtasks();
  f.setRequestsFailure(true);f.setAccountFailure(true);const reads=f.requestReads.length,accounts=f.calls.filter(call=>call==='account').length;
  f.$('[data-activity-open]').click();await microtasks();await microtasks();
  assert.match(f.$('[data-ai-status]').textContent!,/Waiting for local runner status/);assert.equal(f.dom.window.document.activeElement,f.$('[data-ai-status]'));
  assert.equal(f.requestReads.length,reads);assert.equal(f.calls.filter(call=>call==='account').length,accounts);
  f.setJobPhase('cancelled');f.$('[data-ai-close]').click();await microtasks();await microtasks();f.$('[data-activity-open]').click();await microtasks();await microtasks();
  assert.match(f.$('[data-ai-status]').textContent!,/Cancellation reported by the local runner/);assert.equal(f.requestReads.length,reads);
  assert.equal(f.calls.filter(call=>call==='send').length,1);assert.equal(f.calls.includes('review'),false);
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

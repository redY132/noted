import type {Editor} from '@tiptap/core';
import type {Note} from './model';
import {schemaAdherence,type DocumentSchema} from './document-schema.ts';
import {documentFromEditor} from './document-model.ts';
import {initializeAIRequestSummary} from './ai-request-summary.ts';
import {initializeAIActivity,type AIActivity,type AIGoal} from './ai-activity-ui.ts';
import type {DocumentOperation} from './document-model.ts';
import type {ProposalReview} from './document-tools-ui';
type API=Pick<typeof import('./api').api,'schemaGuidanceCapabilities'|'subscriptionStatus'|'startSubscription'|'subscriptionJob'|'cancelSubscription'|'formattingRequests'|'createFormattingRequest'|'componentReply'|'formattingReply'|'cancelFormattingRequest'>&Partial<Pick<typeof import('./api').api,'noteAIAllowed'>>;
type RequestEntry=Awaited<ReturnType<API['formattingRequests']>>[number];
export function initializeAIFormatting(host:HTMLElement,o:{api:API;native:boolean;activityHost?:HTMLElement;openNote?:(id:string)=>Promise<void>;schema?:()=>DocumentSchema|undefined;note:()=>Note|null;editor:()=>Editor|null;flush:()=>Promise<void>;error:(e:unknown)=>void;componentProposal?:(value:import('./component-suggestions').ComponentSuggestion,settings:ProposalReview)=>Promise<void>;proposal:(ops:DocumentOperation[],settings:ProposalReview)=>Promise<void>}){
 host.innerHTML=`<dialog class="document-tool-dialog ai-formatting-dialog" data-library="ai" aria-label="AI formatting"><div class="tool-heading"><h2>Format with AI</h2><button data-ai-close>Close</button></div><label>Goal<select data-ai-goal><option value="format">Formatting and layout</option><option value="schema">Adhere to selected schema</option><option value="component">Create interactive component</option></select></label><section data-ai-schema hidden><p data-ai-schema-status></p><ul data-ai-schema-issues></ul><label data-ai-guide-consent hidden><input type="checkbox" data-ai-include-guide> <span data-ai-guide-label></span></label><p>The document guide is an example for presentation, not an inferred set of strict rules. Original wording and reading order are preserved.</p></section><label>Describe the change<textarea data-ai-prompt maxlength="4000" rows="4" placeholder="For example: indent paragraphs and arrange them in four clear panels."></textarea></label><p class="ai-consent">Generate sends this saved note and your instructions to OpenAI through your ChatGPT-signed-in Codex client. Uses your account's Codex limits. For schema adherence, the selected formal rules are also sent. A full guidance document is sent only when you check its per-request consent box above. Image bytes are not sent. You review every proposal before applying it. Component suggestions generate separate sandboxed code; they never run automatically and insert disabled.</p><p data-subscription-status></p><div class="tool-actions"><button class="primary" data-subscription-send>Generate proposal</button><button data-subscription-stop hidden>Cancel generation</button><button data-ai-preview hidden>Review proposal</button></div><p data-ai-status role="status" aria-live="polite">Describe a change, then generate a proposal.</p><details data-ai-advanced><summary>Advanced: external agents and saved requests</summary><p>Create request saves a one-note request for an agent allowed in Agent access. That agent can read this saved note for up to 24 hours, even outside shared folders. Ask the connected agent to check Noted; creating a request does not start a model job. Hosted agents require a separately approved connection.</p><label>Saved requests<select data-ai-existing></select></label><p data-ai-request-status></p><div class="tool-actions"><button data-ai-request>Create request for external agent</button><button data-ai-check>Refresh request</button><button data-ai-cancel>Remove selected request</button><button data-subscription-refresh>Refresh sign-in</button></div></details></dialog><div data-ai-outcome class="ai-outcome" role="status" hidden><span data-ai-outcome-text></span><button data-ai-undo>Undo</button><button data-ai-dismiss aria-label="Dismiss formatting result">×</button></div>`;
 const $=<T extends HTMLElement>(s:string)=>host.querySelector<T>(s)!;const dialog=$<HTMLDialogElement>('dialog'),api=o.api;
 const requestScope=initializeAIRequestSummary($('.ai-consent'));
 $('[data-ai-status]').tabIndex=-1;
 dialog.inert=true;
 let activity:AIActivity|null=null,destroyed=false,pollErrors=0,pollPaused=false;
 const activityHost=o.activityHost??host.appendChild(host.ownerDocument.createElement('div'));
 const activityUI=initializeAIActivity(activityHost,{resume:resumeActivity,dismiss:()=>{activity=null;syncActivity();o.editor()?.view.focus();},error:o.error});
 function syncActivity(){activityUI.update(activity,busy);}
 function closeDialog(){dialog.inert=true;dialog.close();}
 const requestGoal=(r:RequestEntry):AIGoal=>r.kind==='component'?'component':r.schema?'schema':'format';
 let entries:RequestEntry[]=[],selected:RequestEntry|null=null,reply:{summary:string;operations:DocumentOperation[]}|null=null,jobId:string|null=null,runningRequestId:string|null=null,running=false,busy=false,account=false,autoReview=false,reviewing=false,epoch=0,timer:ReturnType<typeof setTimeout>|undefined,terminalMessage:string|null=null,applied:{editor:Editor;doc:Editor['state']['doc']}|null=null;
 let componentReply:import('./component-suggestions').ComponentSuggestion|null=null;let schemaReady=false,aiAllowed=true;
 let cancelRequested=false,cancelRequestRemoved=false;
 let lastCancellation:{requestId:string;noteId:string;message:string}|null=null;
 const cancellationMessage=(label=true)=>`${label?'Cancellation requested. ':''}Waiting for local runner status. ${cancelRequestRemoved?'Saved request removed. ':''}Already processed usage cannot be recalled.`;
 const component=()=>$<HTMLSelectElement>('[data-ai-goal]').value==='component';
 const goal=()=>$<HTMLSelectElement>('[data-ai-goal]').value==='schema';
 function schemaState(){const schema=o.schema?.();$('[data-ai-schema]').hidden=!goal();$('[data-ai-guide-consent]').hidden=!schema?.guide;
  $('[data-ai-schema-status]').textContent=schema?`${schema.name} v${schema.version}${schema.layout==='free'?' · Free placement':''}`:'Select a saved schema in Edit schema first.';
  $('[data-ai-guide-label]').textContent=schema?.guide?`Allow sending the full guidance document “${schema.guide.title}” for this request.`:'';
  const list=$('[data-ai-schema-issues]');list.replaceChildren();const editor=o.editor(),note=o.note();if(goal()&&schema&&editor&&note){const issues=schemaAdherence(documentFromEditor(editor.getJSON(),note.id,note.document),schema);for(const message of (issues.length?issues.slice(0,8):['Formal rules already match. AI can suggest presentation improvements using the approved guidance.'])){const li=host.ownerDocument.createElement('li');li.textContent=message;list.append(li);}}}
 async function schemaCapabilities(){schemaReady=false;if(!goal()&&!component())return;try{const c=await api.schemaGuidanceCapabilities();schemaReady=component()?c.formattingProtocol>=4&&c.componentSuggestions:c.formattingProtocol>=3&&c.perRequestGuidanceConsent;}catch{}if(!schemaReady)throw new Error('Schema-guided AI requires the updated desktop backend. Save your work and restart the updated Noted build.');}
 function context(){if(component()){if(!schemaReady||!o.componentProposal)throw new Error('Update and restart Noted before using interactive suggestions.');return{kind:'component' as const};}if(!goal())return undefined;if(!schemaReady)throw new Error('Update and restart Noted before using schema guidance.');const saved=o.schema?.();if(!saved)throw new Error('Select a saved schema on this note first.');const schema=structuredClone(saved),includeGuidance=$<HTMLInputElement>('[data-ai-include-guide]').checked;if(!includeGuidance)delete schema.guide;return{schema,includeGuidance};}
 const prompt=()=>$<HTMLTextAreaElement>('[data-ai-prompt]').value.trim();
 const eligible=(r:RequestEntry|null)=>r&&['waiting','ready'].includes(r.status);
 const matchesGoal=(r:RequestEntry)=>component()?r.kind==='component':r.kind?false:goal()?!!r.schema&&r.schema.id===o.schema?.()?.id&&r.schema.version===o.schema?.()?.version:!r.schema;
 function status(message:string){const label=$('[data-ai-status]');if(label.textContent!==message)label.textContent=message;}
 function sync(){syncActivity();requestScope.update({title:o.note()?.title||'Untitled',goal:component()?'component':goal()?'schema':'format',schema:o.schema?.(),includeGuide:$<HTMLInputElement>('[data-ai-include-guide]').checked,allowed:aiAllowed,native:o.native,busy,running});$<HTMLButtonElement>('[data-subscription-send]').disabled=!o.native||!aiAllowed||!account||busy||running||!prompt()||(goal()&&(!schemaReady||!o.schema?.()))||(component()&&(!schemaReady||!o.componentProposal));$('[data-subscription-stop]').hidden=!running;$<HTMLButtonElement>('[data-subscription-stop]').disabled=busy||cancelRequested;$('[data-ai-preview]').hidden=!reply&&!componentReply;$<HTMLButtonElement>('[data-ai-preview]').disabled=busy||running;$<HTMLTextAreaElement>('[data-ai-prompt]').disabled=running||busy;$<HTMLSelectElement>('[data-ai-goal]').disabled=running||busy;$<HTMLInputElement>('[data-ai-include-guide]').disabled=running||busy;for(const el of host.querySelectorAll<HTMLButtonElement|HTMLSelectElement>('details button,details select'))el.disabled=!o.native||busy||running;$<HTMLButtonElement>('[data-ai-request]').disabled=!o.native||!aiAllowed||busy||running||component();$('[data-ai-request-status]').textContent=selected?`${selected.status[0].toUpperCase()+selected.status.slice(1)} · ${selected.prompt.slice(0,160)}${selected.schema?' · '+selected.schema.name+' v'+selected.schema.version+(selected.hasGuidance?' · full guidance included':' · rules only'):''}${eligible(selected)?' · Expires '+new Date(selected.expiresAt).toLocaleString():''}`:'No request selected.';}
 async function run(action:()=>Promise<void>){if(busy)return;busy=true;sync();try{await action();}catch(e){status(e instanceof Error?e.message:String(e));o.error(e);}finally{busy=false;sync();}}
 async function eligibility(){aiAllowed=false;const n=o.note();if(!n)throw new Error('Open a saved note first.');aiAllowed=api.noteAIAllowed?await api.noteAIAllowed(n.id):true;sync();return aiAllowed;}
 async function accountStatus(){if(!o.native){account=false;$('[data-subscription-status]').textContent='AI formatting is available in the desktop app.';return;}const s=await api.subscriptionStatus();account=s.authentication==='chatgpt';$('[data-subscription-status]').textContent=s.message;}
 async function requests(preferred=selected?.id,exact=false){if(!o.native){entries=[];selected=null;return;}const n=o.note();if(!n)throw new Error('Open a saved note first.');const ticket=epoch;const list=await api.formattingRequests(n.id);if(ticket!==epoch||o.note()?.id!==n.id)return;if(list.some(r=>typeof r.status!=='string')){account=false;entries=[];selected=null;reply=null;componentReply=null;throw new Error('This window is running an older Noted backend. Save your work, close Noted, and open the updated desktop build.');}entries=list;selected=entries.find(r=>r.id===preferred)??(exact?null:entries.find(r=>eligible(r)&&matchesGoal(r)))??null;const select=$<HTMLSelectElement>('[data-ai-existing]');select.replaceChildren();const empty=host.ownerDocument.createElement('option');empty.value='';empty.textContent='No request selected';select.append(empty);for(const r of entries){const option=host.ownerDocument.createElement('option');option.value=r.id;option.textContent=`${r.status} · ${r.prompt.slice(0,80)}`;select.append(option);}select.value=selected?.id??'';sync();}
 function clearActivity(id:string){if(activity?.requestId===id){activity=null;syncActivity();}}
 async function showReview(){
  if(reviewing||!selected||(!reply&&!componentReply))return;
  const request=selected,proposal=reply,widget=componentReply;
  if(o.note()?.id!==request.noteId)throw new Error('Open the note belonging to this proposal.');
  reviewing=true;autoReview=false;
  try{
  await o.flush();
  if(!await eligibility()){selected=null;reply=null;componentReply=null;autoReview=false;status('This note is excluded from all AI access. You can edit it locally.');return;}
  await requests(request.id,true);
  if(!selected||selected.id!==request.id||selected.status!=='ready'){
   reply=null;componentReply=null;autoReview=false;
   const message='This proposal is outdated or unavailable after saving the current draft. Generate a new proposal for the saved note.';
   if(activity?.requestId===request.id)activity={...activity,phase:'failed',message};status(message);sync();return;
  }
  closeDialog();
  const settings:ProposalReview={
   summary:widget?.summary??proposal!.summary,
   validateCandidate:request.schema?(document)=>{const issues=schemaAdherence(document,request.schema!);if(issues.length)throw new Error('Proposal does not adhere to the selected schema: '+issues.slice(0,8).join(' '));}:undefined,
   onApplied:async()=>{
    const editor=o.editor();applied=editor?{editor,doc:editor.state.doc}:null;
    $('[data-ai-outcome]').hidden=false;$('[data-ai-outcome-text]').textContent=widget?'Component inserted disabled. ':'Formatting applied. ';$('[data-ai-undo]').hidden=false;$<HTMLButtonElement>('[data-ai-undo]').disabled=!applied;
    reply=null;componentReply=null;selected=null;clearActivity(request.id);
    try{await api.cancelFormattingRequest(request.id);}catch(e){o.error(e);}
   },
   onRejected:async()=>{
    await api.cancelFormattingRequest(request.id);reply=null;componentReply=null;selected=null;clearActivity(request.id);
    status('Proposal rejected. Your note is unchanged.');$('[data-ai-outcome]').hidden=false;$('[data-ai-outcome-text]').textContent='Proposal rejected. Your note is unchanged.';$('[data-ai-undo]').hidden=true;applied=null;
   },
  };
  if(widget){if(!o.componentProposal)throw new Error('Component review is unavailable in this window.');await o.componentProposal(widget,settings);}else await o.proposal(proposal!.operations,settings);
  }finally{reviewing=false;}
 }
 async function check(){
  if(cancelRequested){reply=null;componentReply=null;autoReview=false;status(cancellationMessage());sync();return;}
  if(running){reply=null;componentReply=null;status(activity&&activity.noteId!==o.note()?.id?`Generating a proposal for "${activity.title}". Use its status strip to return to that note. Nothing applies automatically.`:'Generating your proposal. You can cancel; nothing applies automatically.');sync();return;}
  if(!selected){reply=null;componentReply=null;sync();return;}
  if(!eligible(selected)){
   reply=null;componentReply=null;autoReview=false;
   const message=`${selected.status[0].toUpperCase()+selected.status.slice(1)} request. Describe the current change and generate a new proposal.`;
   status(message);if(activity?.requestId===selected.id)activity={...activity,phase:running?'unknown':'failed',message};sync();return;
  }
  const id=selected.id,ticket=epoch;
  if(selected.kind==='component'){const result=await api.componentReply(id);if(ticket!==epoch||selected?.id!==id)return;componentReply=result;reply=null;}
  else{const result=await api.formattingReply(id);if(ticket!==epoch||selected?.id!==id)return;reply=result;componentReply=null;}
  if(reply||componentReply){
   selected={...selected,status:'ready'};
   activity={noteId:selected.noteId,title:o.note()?.title||'Untitled',goal:requestGoal(selected),requestId:selected.id,phase:'ready',message:'Review the proposal before applying it. Your note is unchanged.'};
   status('Proposal ready for visual review.');sync();if(autoReview&&dialog.open)await showReview();
  }else if(!running)status(terminalMessage??'Waiting for the external agent. Creating a request does not start generation.');
  sync();
 }
 async function job(j:Awaited<ReturnType<API['subscriptionJob']>>,refreshDialog=dialog.open&&aiAllowed){
  if(cancelRequested){
   running=j.phase==='running';runningRequestId=running?j.requestId:null;autoReview=false;
   if(running){if(activity)activity={...activity,phase:'cancelling',message:cancellationMessage(false)};if(refreshDialog)status(cancellationMessage());sync();return;}
   jobId=null;cancelRequested=false;reply=null;componentReply=null;selected=null;
   const result=j.phase==='cancelled'?'Cancellation reported by the local runner.':j.phase==='completed'?'Generation finished before cancellation was reported.':'Generation ended after cancellation was requested.';
   terminalMessage=`${result} ${cancelRequestRemoved?'Saved request removed. ':'The saved request may remain under Advanced. '}No proposal was applied. Already processed usage cannot be recalled.`;
   lastCancellation={requestId:j.requestId,noteId:j.noteId,message:terminalMessage};
   if(activity)activity={...activity,phase:j.phase==='cancelled'?'cancelled':'failed',message:terminalMessage};
   if(refreshDialog){await requests('',true);selected=null;status(terminalMessage);}sync();return;
  }
  running=j.phase==='running';runningRequestId=running?j.requestId:null;
  if(activity?.noteId===j.noteId)activity={...activity,requestId:j.requestId,phase:running?'running':j.phase==='completed'?'ready':'failed',message:running?'You can keep writing. Nothing applies automatically.':j.phase==='completed'?'Open this note to check and review the proposal. Nothing has been applied.':j.message};
  if(refreshDialog){
   const other=activity&&activity.noteId!==o.note()?.id;
   status(running?(other?`Generating a proposal for "${activity!.title}". Use Open generation in its status strip to return to that note. Nothing applies automatically.`:'Generating your proposal. You can cancel; nothing applies automatically.'):other&&j.phase==='completed'?`Proposal received for "${activity!.title}". Use its status strip to return and review.`:j.message);
  }
  if(j.phase==='completed'){
   jobId=null;
   if(refreshDialog&&dialog.open&&j.noteId===o.note()?.id){const ticket=epoch;await requests(j.requestId,true);if(ticket===epoch&&dialog.open)await check();}
   else autoReview=false;
  }else if(!running){jobId=null;autoReview=false;terminalMessage=j.message;if(refreshDialog&&dialog.open&&j.noteId===o.note()?.id)await requests(j.requestId,true);}
  sync();
 }
 function poll(){
  clearTimeout(timer);if(destroyed||pollPaused||(!dialog.open&&!jobId))return;
  if(busy){timer=setTimeout(poll,2000);return;}
  const ticket=epoch,ownedJob=jobId;
  void(async()=>{
   try{
    if(ownedJob){const j=await api.subscriptionJob(ownedJob);if(destroyed||ownedJob!==jobId)return;pollErrors=0;await job(j,ticket===epoch&&dialog.open&&aiAllowed);}
    else if(dialog.open&&eligible(selected)){await requests(selected!.id);if(ticket!==epoch||!dialog.open||destroyed)return;await check();}
   }catch(e){
    const message=e instanceof Error?e.message:String(e);
    if(ownedJob&&ownedJob===jobId){pollErrors++;if(activity)activity={...activity,phase:'unknown',message:'Could not refresh local job status. Open generation to retry or cancel.'};if(pollErrors>=3)pollPaused=true;syncActivity();}
    if(dialog.open&&ticket===epoch)status(message);
   }finally{if(!destroyed&&!pollPaused&&(jobId||(dialog.open&&ticket===epoch)))timer=setTimeout(poll,Math.min(2000*2**pollErrors,30000));}
  })();
 }
 dialog.addEventListener('cancel',e=>{e.preventDefault();closeDialog();});
 dialog.addEventListener('close',()=>{if(dialog.open)return;dialog.inert=true;epoch++;clearTimeout(timer);autoReview=false;$<HTMLInputElement>('[data-ai-include-guide]').checked=false;poll();});$('[data-ai-close]').onclick=closeDialog;
 $('[data-subscription-send]').onclick=()=>void run(async()=>{
  epoch++;clearTimeout(timer);terminalMessage=null;cancelRequested=false;cancelRequestRemoved=false;lastCancellation=null;if(!o.native)throw new Error('Use the desktop app.');
  if(!await eligibility())throw new Error('This note is excluded from all AI access. You can edit it locally.');
  if(!prompt())throw new Error('Describe the change first.');await o.flush();const n=o.note();if(!n)throw new Error('Open a saved note first.');
  autoReview=true;reply=null;componentReply=null;status('Starting generation for this saved note.');
  const approved=context();$<HTMLInputElement>('[data-ai-include-guide]').checked=false;
  activity={noteId:n.id,title:n.title||'Untitled',goal:component()?'component':goal()?'schema':'format',requestId:null,phase:'starting',message:'Preparing the explicitly approved saved note.'};pollErrors=0;pollPaused=false;syncActivity();
  try{const j=await api.startSubscription(n,prompt(),approved);jobId=j.phase==='running'?j.id:null;await job(j);poll();}
  catch(e){if(activity)activity={...activity,phase:'failed',message:e instanceof Error?e.message:String(e)};throw e;}
 });
 $('[data-subscription-stop]').onclick=()=>void run(async()=>{
  if(!jobId||cancelRequested)return;
  const id=runningRequestId;autoReview=false;cancelRequested=true;cancelRequestRemoved=false;pollPaused=false;pollErrors=0;
  try{await api.cancelSubscription(jobId);}catch(error){cancelRequested=false;if(activity)activity={...activity,phase:'unknown',message:'Cancellation could not be confirmed. Status checking continues; you can retry Cancel.'};poll();throw error;}
  reply=null;componentReply=null;selected=null;
  if(id)try{await api.cancelFormattingRequest(id);cancelRequestRemoved=true;}catch(error){o.error(error);}
  if(activity)activity={...activity,phase:'cancelling',message:cancellationMessage(false)};
  if(dialog.open&&aiAllowed)await requests('',true);
  terminalMessage=cancellationMessage();status(terminalMessage);poll();
 });
 $('[data-ai-preview]').onclick=()=>void run(showReview);
 $('[data-ai-request]').onclick=()=>void run(async()=>{if(!await eligibility())throw new Error('This note is excluded from all AI access.');terminalMessage=null;await o.flush();const n=o.note();if(!n)throw new Error('Open a saved note first.');if(!prompt())throw new Error('Describe the change first.');const approved=context();$<HTMLInputElement>('[data-ai-include-guide]').checked=false;const r=await api.createFormattingRequest(n.id,prompt(),approved);autoReview=true;await requests(r.id);await check();status('Request saved for the external agent. Ask it to check Noted formatting requests.');});
 $('[data-ai-existing]').onchange=()=>void run(async()=>{terminalMessage=null;selected=entries.find(r=>r.id===$<HTMLSelectElement>('[data-ai-existing]').value)??null;reply=null;componentReply=null;autoReview=false;if(selected)$<HTMLTextAreaElement>('[data-ai-prompt]').value=selected.prompt;await check();});
 $('[data-ai-check]').onclick=()=>void run(async()=>{await requests();await check();});
 $('[data-ai-cancel]').onclick=()=>void run(async()=>{terminalMessage=null;if(selected){await api.cancelFormattingRequest(selected.id);clearActivity(selected.id);}selected=null;reply=null;componentReply=null;autoReview=false;await requests('');selected=null;$<HTMLSelectElement>('[data-ai-existing]').value='';status('Request removed. Your note is unchanged.');});
 $('[data-ai-goal]').onchange=()=>void run(async()=>{$<HTMLInputElement>('[data-ai-include-guide]').checked=false;schemaState();await schemaCapabilities();selected=null;reply=null;componentReply=null;await requests('');await check();if(component()&&!prompt())$<HTMLTextAreaElement>('[data-ai-prompt]').value='Suggest one useful interactive component for this note, preserving the original note.';if(goal()&&!prompt())$<HTMLTextAreaElement>('[data-ai-prompt]').value='Suggest formatting that adheres to the selected schema, preserving all wording and reading order.';});
 $('[data-subscription-refresh]').onclick=()=>void run(accountStatus);$('[data-ai-prompt]').oninput=sync;
 $('[data-ai-include-guide]').onchange=sync;
 $('[data-ai-dismiss]').onclick=()=>{$('[data-ai-outcome]').hidden=true;};$('[data-ai-undo]').onclick=()=>void run(async()=>{const p=applied;if(!p||o.editor()!==p.editor||p.editor.state.doc!==p.doc){throw new Error('The note changed after formatting. Use the editor Undo controls to step back through later edits.');}if(!p.editor.commands.undo())throw new Error('Nothing to undo.');await o.flush();$('[data-ai-outcome-text]').textContent='Formatting undone. ';$<HTMLButtonElement>('[data-ai-undo]').disabled=true;applied=null;});
 async function openDialog(mode:AIGoal,preferred?:string,reviewWhenReady=false){
  if(destroyed||dialog.open||host.ownerDocument.querySelector('dialog[open]'))return;
  let showCancellationStatus=false;
  autoReview=reviewWhenReady&&!cancelRequested;
  $<HTMLSelectElement>('[data-ai-goal]').value=mode;$<HTMLInputElement>('[data-ai-include-guide]').checked=false;schemaState();dialog.inert=false;dialog.showModal();
  status(running?'Checking running generation.':'Describe a change, then generate a proposal.');
  await run(async()=>{
   if(!await eligibility()){selected=null;reply=null;componentReply=null;autoReview=false;status('This note is excluded from all AI access. You can edit it locally.');return;}
   await accountStatus();await schemaCapabilities();
   if(mode==='schema'&&!prompt())$<HTMLTextAreaElement>('[data-ai-prompt]').value='Suggest formatting that adheres to the selected schema, preserving all wording and reading order.';
   const n=o.note();if(!n)throw new Error('Open a note first.');
   const cancelled=lastCancellation&&lastCancellation.noteId===n.id&&lastCancellation.requestId===activity?.requestId&&['cancelled','failed'].includes(activity.phase)?lastCancellation:null;
   if(selected?.noteId!==n.id||selected&&!matchesGoal(selected)){selected=null;reply=null;componentReply=null;terminalMessage=null;}
   await requests(cancelled?'':preferred,Boolean(preferred)||Boolean(cancelled));
   if(cancelled){selected=null;reply=null;componentReply=null;autoReview=false;status(cancelled.message);showCancellationStatus=true;return;}
   if(cancelRequested){reply=null;componentReply=null;selected=null;status(cancellationMessage());showCancellationStatus=true;return;}
   if(preferred&&!selected){
    const message=running?'The saved request is unavailable. Check or cancel the running generation before creating another proposal.':'This saved request is no longer available. Describe the current change to create a new proposal.';
    if(activity?.requestId===preferred)activity={...activity,phase:running?'unknown':'failed',message};status(message);reply=null;componentReply=null;autoReview=false;return;
   }
   if(selected&&(preferred||!prompt()))$<HTMLTextAreaElement>('[data-ai-prompt]').value=selected.prompt;
   await check();
  });
  if(dialog.open&&showCancellationStatus){$('[data-ai-status]').focus({preventScroll:true});$('[data-ai-status]').scrollIntoView?.({block:'nearest'});}
  else if(dialog.open&&!running)$<HTMLTextAreaElement>('[data-ai-prompt]').focus();poll();
 }
 async function resumeActivity(){
  const current=activity;if(!current||destroyed||host.ownerDocument.querySelector('dialog[open]'))return;
  if(o.note()?.id!==current.noteId){
   if(!o.openNote)throw new Error('Open the note belonging to this proposal first.');
   await o.openNote(current.noteId);
   if(o.note()?.id!==current.noteId)throw new Error('Could not open the proposal note. Your current draft is kept open.');
  }
  pollErrors=0;pollPaused=false;
  await openDialog(current.goal,current.phase==='cancelled'?undefined:current.requestId??undefined,!['failed','cancelled'].includes(current.phase));
 }
 sync();return {
  open:async(adherence=false)=>{
   const note=o.note();
   const owned=activity&&note&&activity.noteId===note.id&&(!adherence||activity.goal==='schema'||running)?activity:null;
   await openDialog(owned?.goal??(adherence?'schema':'format'),owned?.requestId??undefined);
  },
  destroy(){destroyed=true;epoch++;clearTimeout(timer);activityUI.destroy();},
 };
}

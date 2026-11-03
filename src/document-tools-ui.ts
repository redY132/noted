import type { Editor } from '@tiptap/core';
import { closeHistory } from '@tiptap/pm/history';
import type { Note } from './model.ts';
import { availableComponents, insertInteractive } from './interactive-components.ts';
import { enableComponentVersion, disableComponentVersion, installComponentDefinition, isComponentVersionEnabled, type ComponentRuntimeHost } from './component-runtime.ts';
import { resolveComponentFields, validateComponentDefinition, type ComponentDefinition } from './component-runtime-types.ts';
import { selectedComponent } from './note-components.ts';
import { documentFromEditor, type DocumentOperation, type DocumentPermission } from './document-model.ts';
import { applyEditorProjection, inspectArrangement } from './document-editor.ts';
import { api } from './api.ts';
import {validateRenderedDocument} from './render-validation.ts';

export function initializeDocumentTools(host:HTMLElement,options:{getEditor:()=>Editor|null;getNote:()=>Note|null;getRuntime:()=>ComponentRuntimeHost|null;flush:()=>Promise<void>;error:(error:unknown)=>void;persistDefinition?:(definition:ComponentDefinition)=>Promise<void>}){
  host.innerHTML=`<dialog class="document-tool-dialog" id="component-library-dialog" aria-label="Interactive components"><div class="tool-heading"><h2>Interactive components</h2><button type="button" data-tool-close aria-label="Close interactive components">×</button></div><p>Components stay readable while disabled. Enable a code version explicitly to run it locally.</p><label>Saved component<select data-component-picker aria-label="Saved component"></select></label><p data-component-status role="status"></p><div class="tool-actions"><button data-component-insert>Insert</button><button data-component-enable>Enable this exact version</button><button data-component-disable>Disable</button><button data-component-import>Import JSON</button><input type="file" data-component-file accept="application/json,.json" hidden></div><label>Selected component properties<textarea data-component-properties aria-label="Component properties" rows="5" spellcheck="false"></textarea></label><button data-component-properties-save>Apply properties</button><details><summary>Advanced source editor</summary><p>Publish changed code with a new version. It starts disabled.</p><label>Manifest<textarea data-component-manifest aria-label="Component manifest" rows="9" spellcheck="false"></textarea></label><label>JavaScript source<textarea data-component-source aria-label="Component JavaScript source" rows="10" spellcheck="false"></textarea></label><button data-component-publish>Save new version</button></details></dialog>
  <dialog class="document-tool-dialog" id="document-operations-dialog" aria-label="Document operations"><div class="tool-heading"><h2>Document operations</h2><button type="button" data-tool-close aria-label="Close document operations">×</button></div><p>Review a JSON operation batch before applying it. Permissions are chosen here, outside the proposal.</p><fieldset><legend>Allow this proposal to change</legend>${(['formatting','arrangement','reorganization','content','componentState'] as const).map(scope=>`<label class="tool-scope"><input type="checkbox" data-operation-permission="${scope}" ${scope==='formatting'?'checked':''}> ${scope}</label>`).join('')}</fieldset><label>Operations<textarea data-operations-source aria-label="Document operation JSON" spellcheck="false" rows="10">[]</textarea></label><div class="tool-actions"><button data-operations-preview>Preview</button><button data-operations-apply disabled>Apply preview</button><button data-operations-copy>Copy document JSON</button></div><div data-rendered-preview class="rendered-proposal-preview" aria-label="Rendered proposal preview"></div><pre data-operations-preview-text role="status"></pre></dialog>`;
  const $=<T extends HTMLElement>(s:string)=>host.querySelector<T>(s)!;
  const components=$<HTMLDialogElement>('#component-library-dialog'),operations=$<HTMLDialogElement>('#document-operations-dialog');
  let previewEpoch=0;
  let definitions=availableComponents(),selected:ComponentDefinition=definitions[0],generation=0;
  const run=(action:()=>void|Promise<void>)=>void Promise.resolve().then(action).catch(reason=>{if(operations.open)$('[data-operations-preview-text]').textContent=reason instanceof Error?reason.message:String(reason);options.error(reason);});
  for(const button of host.querySelectorAll<HTMLButtonElement>('[data-tool-close]'))button.onclick=()=>button.closest('dialog')!.close();
  async function fill(){
    const ticket=++generation;definitions=availableComponents();
    const picker=$<HTMLSelectElement>('[data-component-picker]');picker.replaceChildren();
    for(const definition of definitions){const option=document.createElement('option');option.value=`${definition.manifest.id}@${definition.manifest.version}`;option.textContent=`${definition.manifest.name} · v${definition.manifest.version}`;picker.append(option);}
    picker.value=`${selected.manifest.id}@${selected.manifest.version}`;
    $<HTMLTextAreaElement>('[data-component-manifest]').value=JSON.stringify(selected.manifest,null,2);$<HTMLTextAreaElement>('[data-component-source]').value=selected.source;
    const enabled=await isComponentVersionEnabled(selected);if(ticket!==generation)return;
    $('[data-component-status]').textContent=enabled?'This exact code version is enabled.':'This code version is disabled.';
    const current=options.getEditor(),node=current&&selectedComponent(current)?.node;
    $<HTMLTextAreaElement>('[data-component-properties]').value=JSON.stringify(node?.type.name==='interactiveComponent'?node.attrs.properties:resolveComponentFields(selected.manifest.properties),null,2);
    $<HTMLButtonElement>('[data-component-properties-save]').disabled=node?.type.name!=='interactiveComponent';
  }
  $<HTMLSelectElement>('[data-component-picker]').onchange=()=>run(async()=>{selected=definitions.find(def=>`${def.manifest.id}@${def.manifest.version}`===$<HTMLSelectElement>('[data-component-picker]').value)!;await fill();});
  $('[data-component-insert]').onclick=()=>run(()=>{const editor=options.getEditor();if(editor)insertInteractive(editor,selected);components.close();editor?.view.focus();});
  $('[data-component-enable]').onclick=()=>run(async()=>{await enableComponentVersion(selected);await options.getRuntime()?.refreshApprovals();await fill();});
  $('[data-component-disable]').onclick=()=>run(async()=>{await disableComponentVersion(selected);await options.getRuntime()?.refreshApprovals();await fill();});
  $('[data-component-properties-save]').onclick=()=>run(()=>{const editor=options.getEditor(),component=editor&&selectedComponent(editor);if(!editor||component?.node.type.name!=='interactiveComponent')throw new Error('Select an interactive component first.');const definition=definitions.find(def=>def.manifest.id===component.node.attrs.definitionId&&def.manifest.version===component.node.attrs.definitionVersion);if(!definition)throw new Error('Import the missing definition first.');const properties=resolveComponentFields(definition.manifest.properties,JSON.parse($<HTMLTextAreaElement>('[data-component-properties]').value));editor.view.dispatch(closeHistory(editor.state.tr).setNodeMarkup(component.position,undefined,{...component.node.attrs,properties}));});
  async function install(value:unknown){const definition=validateComponentDefinition(value);await options.persistDefinition?.(definition);selected=installComponentDefinition(definition);await fill();}
  $('[data-component-publish]').onclick=()=>run(async()=>install({manifest:JSON.parse($<HTMLTextAreaElement>('[data-component-manifest]').value),source:$<HTMLTextAreaElement>('[data-component-source]').value}));
  $('[data-component-import]').onclick=()=>$('[data-component-file]').click();
  $<HTMLInputElement>('[data-component-file]').onchange=()=>run(async()=>{const input=$<HTMLInputElement>('[data-component-file]'),file=input.files?.[0];input.value='';if(!file)return;if(file.size>256*1024)throw new Error('Component imports must be below 256 KiB.');await install(JSON.parse(await file.text()));});
  let preview:{editor:Editor;doc:Editor['state']['doc'];noteId:string;batch:DocumentOperation[];grantId:string;revision:number;width:number;theme:string;renderToken:string}|null=null;
  let rendered:Awaited<ReturnType<typeof validateRenderedDocument>>|null=null;
  function invalidate(){previewEpoch++;rendered?.dispose();rendered=null;preview=null;$<HTMLButtonElement>('[data-operations-apply]').disabled=true;}
  $<HTMLTextAreaElement>('[data-operations-source]').oninput=invalidate;
  for(const permission of host.querySelectorAll<HTMLInputElement>('[data-operation-permission]'))permission.onchange=invalidate;
  $('[data-operations-preview]').onclick=()=>run(async()=>{
    invalidate();const ticket=previewEpoch;await options.flush();const editor=options.getEditor(),note=options.getNote();if(!editor||!note)return;
    const doc=editor.state.doc,batch=JSON.parse($<HTMLTextAreaElement>('[data-operations-source]').value) as DocumentOperation[];if(!Array.isArray(batch))throw new Error('Operations must be a JSON array.');
    const scopes=[...host.querySelectorAll<HTMLInputElement>('[data-operation-permission]:checked')].map(input=>input.dataset.operationPermission as DocumentPermission);
    const grantId=await api.authorizeDocumentOperations(note.id,scopes),result=await api.previewDocumentOperations(note,batch,grantId);
    if(editor!==options.getEditor()||editor.state.doc!==doc)throw new Error('The note changed while preparing this preview. Preview again.');
    if(scopes.includes('arrangement')){const problems=inspectArrangement(result.document);if(problems.length)throw new Error(problems.join('\n'));}
    const environmentWidth=Math.round(editor.view.dom.getBoundingClientRect().width),environmentTheme=document.documentElement.dataset.theme??'light';
    const checked=await validateRenderedDocument({editor,document:result.document,content:result.content,noteId:note.id,schemaId:note.presentation.schemaId,resolveAsset:id=>api.assetUrl(note.id,id),releaseAsset:api.releaseAssetUrl,previewHost:$('[data-rendered-preview]')});
    if(ticket!==previewEpoch||editor!==options.getEditor()||editor.state.doc!==doc||Math.round(editor.view.dom.getBoundingClientRect().width)!==environmentWidth||(document.documentElement.dataset.theme??'light')!==environmentTheme){checked.dispose();throw new Error('The note or proposal changed during rendered validation. Preview again.');}
    rendered=checked;
    const renderToken=await api.approveDocumentRender(grantId,result.documentDigest,rendered.report);
    if(ticket!==previewEpoch){checked.dispose();throw new Error('The proposal changed. Preview again.');}
    preview={editor,doc,noteId:note.id,batch,grantId,revision:note.revision,width:environmentWidth,theme:environmentTheme,renderToken};
    $('[data-operations-preview-text]').textContent=`${batch.length} operations validated. ${result.document.readingOrder.length} content objects preserved.\n${JSON.stringify(result.document,null,2).slice(0,20000)}`;
    $<HTMLButtonElement>('[data-operations-apply]').disabled=false;
  });
  $('[data-operations-apply]').onclick=()=>run(async()=>{
    const next=preview,note=options.getNote();if(!next||!note||next.noteId!==note.id||next.revision!==note.revision||next.editor!==options.getEditor()||next.editor.state.doc!==next.doc||Math.round(next.editor.view.dom.getBoundingClientRect().width)!==next.width||(document.documentElement.dataset.theme??'light')!==next.theme){invalidate();throw new Error('This preview is stale. Preview the latest note again.');}
    next.editor.setEditable(false,false);
    try{const saved=await api.applyDocumentOperations(note,next.batch,next.grantId,next.renderToken);next.editor.setEditable(true,false);applyEditorProjection(next.editor,saved.content);Object.assign(note,{revision:saved.revision,revisionToken:saved.revisionToken,updatedAt:saved.updatedAt,document:saved.document});invalidate();operations.close();}finally{if(!next.editor.isDestroyed)next.editor.setEditable(true,false);}
  });
  operations.addEventListener('close',invalidate);
  $('[data-operations-copy]').onclick=()=>run(async()=>{const editor=options.getEditor(),note=options.getNote();if(editor&&note)await navigator.clipboard.writeText(JSON.stringify(documentFromEditor(editor.getJSON(),note.id,note.document),null,2));});
  return {openComponents:()=>run(async()=>{await fill();components.showModal();}),openOperations:()=>{invalidate();operations.showModal();}};
}

import type { Note } from './model.ts';
import { noteTextPreview } from './note-text-preview.ts';
type Options = {
  menu: HTMLElement; current(): Note | null; snapshot(): Note; busy(): boolean;
  previous(id: string): Promise<Note | null>; flush(): Promise<void>; recover(note: Note): Promise<Note>;
  open(id: string): Promise<boolean>; changed(): Promise<void>; focusEditor(): void;
};
export function initializePreviousSave(host: HTMLElement, o: Options) {
  const doc=host.ownerDocument,win=doc.defaultView!,$=<T extends HTMLElement>(s:string)=>host.querySelector<T>(s)!;
  host.innerHTML='<dialog class="previous-save-dialog" aria-labelledby="previous-save-title"><header><h2 id="previous-save-title">Previous save</h2><button type="button" data-previous-close>Close</button></header><p>One previous completed save is retained. Autosave replaces it on later saves; this is not a full version history. Review the captured copy below.</p><p>Recover creates a new note and copies its supported local images. Your original stays in place. The current draft is saved before switching. Private-note AI exclusion carries into the recovered copy.</p><div class="previous-save-comparison"><section><h3>Open draft</h3><p data-previous-current-meta></p><pre data-previous-current></pre></section><section><h3>Previous completed save</h3><p data-previous-meta></p><pre data-previous-text></pre></section></div><p data-previous-preview-help>These are shortened text previews. Full content, layout, links and supported assets are preserved in the recovered note. Components are not run in this preview.</p><p data-previous-status role="status" aria-live="polite"></p><div class="previous-save-actions"><button type="button" data-previous-refresh>Refresh previous save</button><button type="button" data-previous-recover disabled>Recover as a new note</button></div></dialog>';
  const dialog=$<HTMLDialogElement>('dialog');dialog.inert=true;
  const menu=doc.createElement('button');menu.type='button';menu.id='shell-previous-save';menu.textContent='Previous save';menu.setAttribute('aria-haspopup','dialog');menu.setAttribute('aria-controls','previous-save-dialog');dialog.id='previous-save-dialog';o.menu.append(menu);
  let sourceId:string|null=null,previous:Note|null=null,recovered:Note|null=null,loading=false,working=false,destroyed=false,epoch=0,opened=false,opener:HTMLElement|null=null;
  const status=(text:string)=>{$('[data-previous-status]').textContent=text;};
  function sync(){menu.disabled=!o.current()||o.busy();}
  function controls(){ $<HTMLButtonElement>('[data-previous-close]').disabled=working;$<HTMLButtonElement>('[data-previous-refresh]').disabled=loading||working||Boolean(recovered);$<HTMLButtonElement>('[data-previous-recover]').disabled=loading||working||!previous;$('[data-previous-recover]').textContent=recovered?'Open recovered copy':'Recover as a new note';dialog.setAttribute('aria-busy',String(loading||working)); }
  const close=()=>{if(working)return;dialog.inert=true;dialog.close();};
  const metadata=(note:Note)=>{const date=new Date(note.updatedAt);return `Revision ${note.revision} · ${Number.isFinite(date.getTime())?date.toLocaleString():'Saved date unavailable'}`;};
  function previewText(selector:string,note:Note){const preview=noteTextPreview(note);$(selector).textContent=preview.text+(preview.shortened?'\n[Preview shortened; recovery keeps the full document.]':'')||'[Empty document]';}
  async function read(){
    if(destroyed||working||!dialog.open||!sourceId)return;
    const ticket=++epoch,id=sourceId;loading=true;previous=null;recovered=null;controls();$('[data-previous-meta]').textContent='';$('[data-previous-text]').textContent='';status('Loading the previous completed save…');
    try{
      const snapshot=o.snapshot();if(snapshot.id!==id)throw new Error('The open note changed. Close this dialog and open Previous save again.');
      previewText('[data-previous-current]',snapshot);$('[data-previous-current-meta]').textContent=snapshot.title||'Untitled';
      const candidate=await o.previous(id);
      if(destroyed||ticket!==epoch||!dialog.open)return;
      if(o.current()?.id!==id)throw new Error('The open note changed. Close this dialog and try again.');
      if(candidate&&candidate.id!==id)throw new Error('The previous save belongs to another note. Nothing was changed.');
      previous=candidate?structuredClone(candidate):null;
      if(candidate){$('[data-previous-meta]').textContent=`${candidate.title||'Untitled'} · ${metadata(candidate)}`;previewText('[data-previous-text]',candidate);status('Previous save captured. Recover opens a new note and leaves the original intact.');}
      else{$('[data-previous-text]').textContent='No previous save is available yet.';status('A new note has no previous save until its first successful change. Workspace backups are separate.');}
    }catch(error){if(!destroyed&&ticket===epoch&&dialog.open){previous=null;status(`Could not read the previous save: ${error instanceof Error?error.message:String(error)}. Use Refresh to retry. No files were changed.`);}}
    finally{if(!destroyed&&ticket===epoch){loading=false;controls();}}
  }
  async function recover(){
    if(destroyed||working||loading||!dialog.open||!previous||!sourceId||o.busy())return;
    if(o.current()?.id!==sourceId){status('The open note changed. Close this dialog before recovering another copy.');return;}
    working=true;controls();status(recovered?'Saving the current draft before opening the recovered copy…':'Saving the current draft before creating a recovered copy…');
    try{
      await o.flush();
      if(destroyed)return;
      if(o.current()?.id!==sourceId)throw new Error('The open note changed. The captured copy remains available here.');
      if(!recovered){recovered=await o.recover(structuredClone(previous));if(destroyed)return;controls();try{await o.changed();}catch{if(!destroyed)status('The copy was created, but the library refresh failed. Opening the saved copy…');}}
      if(destroyed)return;
      const didOpen=await o.open(recovered.id);if(destroyed)return;
      if(didOpen){opened=true;working=false;controls();close();o.focusEditor();}
      else status('The recovered copy was saved, but could not be opened. Use Open recovered copy to retry; no second copy will be created.');
    }catch(error){if(!destroyed)status(`${recovered?'The recovered copy is saved. Use Open recovered copy to retry.':'Recovery stopped; the current draft and captured previous save remain here.'} ${error instanceof Error?error.message:String(error)}`);}
    finally{working=false;if(!destroyed){controls();if(dialog.open)$('[data-previous-recover]').focus();}}
  }
  function show(from:HTMLElement|null=doc.activeElement instanceof win.HTMLElement?doc.activeElement:null){
    if(destroyed||o.busy()||!o.current()||doc.querySelector('dialog[open]'))return;
    opener=from;sourceId=o.current()!.id;previous=null;recovered=null;opened=false;loading=false;dialog.inert=false;dialog.showModal();dialog.scrollTop=0;for(const pre of dialog.querySelectorAll('pre'))pre.scrollTop=0;controls();$('[data-previous-close]').focus();void read();
  }
  menu.onclick=()=>{if(menu.disabled)return;o.menu.hidden=true;o.menu.inert=true;const toggle=doc.querySelector<HTMLElement>('#view-toggle');toggle?.setAttribute('aria-expanded','false');toggle?.focus();show(toggle);};
  $('[data-previous-refresh]').onclick=()=>void read();$('[data-previous-recover]').onclick=()=>void recover();$('[data-previous-close]').onclick=close;
  dialog.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close();}});dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  dialog.addEventListener('close',()=>{if(dialog.open||destroyed)return;epoch++;dialog.inert=true;previous=null;recovered=null;sourceId=null;loading=false;for(const selector of ['[data-previous-current]','[data-previous-text]','[data-previous-current-meta]','[data-previous-meta]'])$(selector).textContent='';if(!opened&&opener?.isConnected&&!opener.closest('[hidden],[inert]'))opener.focus();});
  sync();return{show,sync,destroy(){destroyed=true;epoch++;previous=null;recovered=null;menu.remove();host.replaceChildren();}};
}

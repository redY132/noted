import { semanticAPI, type SemanticStatus } from './semantic-api';

/** Status polling never reads note contents; the worker reads committed files. */
export function initializeSemanticControls(options: {current:()=>string|null;changed:()=>void;error:(reason:unknown)=>void}) {
  const host=document.querySelector<HTMLElement>('#semantic-controls')!;
  host.innerHTML=`<h3>Local discovery · experimental</h3><p>Find related English notes on this device. No note text or embeddings are uploaded. Suggestions are optional and never create saved connections.</p><label><input type="checkbox" id="semantic-enabled">Enable local semantic suggestions</label><p id="semantic-status" role="status">Checking local model…</p><button type="button" id="semantic-download">Download verified model</button><details><summary>Install an offline model pack</summary><p>Choose a folder containing the published model pack files. Files must match the bundled checksum manifest.</p><label>Model pack folder<input type="text" id="semantic-pack-path" placeholder="C:\\Models\\noted-minilm" autocomplete="off"></label><button type="button" id="semantic-install">Install verified pack</button></details><div><button type="button" id="semantic-pause">Pause indexing</button></div><label><input type="checkbox" id="semantic-battery">Allow processing on battery</label><button type="button" id="semantic-remove">Remove local semantic data</button><p id="semantic-error" role="status"></p>`;
  const $=<T extends HTMLElement>(id:string)=>host.querySelector<T>(id)!;
  let status:SemanticStatus|null=null,request=0,lastGeneration=-1,lastNote:string|null=null,typingTimer:ReturnType<typeof setTimeout>|undefined,disposed=false,polling=false;
  function render(next:SemanticStatus) {
    status=next;
    $<HTMLInputElement>('#semantic-enabled').checked=next.settings.enabled;
    $<HTMLInputElement>('#semantic-battery').checked=next.settings.allowBattery;
    $('#semantic-pause').textContent=next.settings.paused?'Resume indexing':'Pause indexing';
    $('#semantic-pause').toggleAttribute('disabled',!next.settings.enabled);
    $('#semantic-download').textContent=next.downloading?`Downloading ${Math.round(next.downloadBytes/1024/1024)} MB…`:`Download verified model (${(next.modelBytes/1024/1024).toFixed(1)} MiB)`;
    $('#semantic-download').toggleAttribute('disabled',!next.settings.enabled||next.modelReady||next.downloading);
    $('#semantic-install').toggleAttribute('disabled',!next.settings.enabled||next.downloading);
    $('#semantic-status').textContent=!next.settings.enabled?'Local semantics is off. Keyword and tag suggestions remain available.':!next.modelReady?'A local model is required. Download it once or install a verified offline pack.':next.settings.paused?'Indexing is paused. Cached suggestions remain available.':next.onBattery&&!next.settings.allowBattery?'Indexing is paused on battery.':`${next.busy?'Indexing':'Ready'} · ${next.indexed.toLocaleString()} of ${next.total.toLocaleString()} notes`;
    $('#semantic-error').textContent=next.error??'';
    if(lastGeneration!==-1&&lastGeneration!==next.generation)options.changed();
    lastGeneration=next.generation;
  }
  async function poll(){if(disposed||polling)return;polling=true;const ticket=++request;try{const next=await semanticAPI.status();if(!disposed&&ticket===request)render(next);}catch(reason){$('#semantic-error').textContent=String(reason);}finally{polling=false;}}
  async function action(task:()=>Promise<SemanticStatus>){try{request++;const next=await task();if(!disposed)render(next);}catch(reason){options.error(reason);}}
  $<HTMLInputElement>('#semantic-enabled').onchange=()=>{if(status)void action(()=>semanticAPI.settings({...status!.settings,enabled:$<HTMLInputElement>('#semantic-enabled').checked}));};
  $<HTMLInputElement>('#semantic-battery').onchange=()=>{if(status)void action(()=>semanticAPI.settings({...status!.settings,allowBattery:$<HTMLInputElement>('#semantic-battery').checked}));};
  $('#semantic-pause').onclick=()=>{if(status)void action(()=>semanticAPI.settings({...status!.settings,paused:!status!.settings.paused}));};
  $('#semantic-download').onclick=()=>void action(()=>semanticAPI.download());
  $('#semantic-install').onclick=()=>{const path=$<HTMLInputElement>('#semantic-pack-path').value.trim();if(path)void action(()=>semanticAPI.installPack(path));};
  $('#semantic-remove').onclick=()=>void action(()=>semanticAPI.remove());
  const activity=(typing:boolean)=>{void semanticAPI.activity(options.current(),typing).catch(options.error);};
  const input=(event:Event)=>{if(!(event.target as Element).closest('#editor,#note-title,#note-tags'))return;clearTimeout(typingTimer);activity(true);typingTimer=setTimeout(()=>activity(false),2000);};
  document.addEventListener('input',input,true);
  const noteChange=()=>{const note=options.current();if(note===lastNote)return;lastNote=note;clearTimeout(typingTimer);activity(false);};
  const observer=new MutationObserver(noteChange);const breadcrumb=document.querySelector('#breadcrumb');if(breadcrumb)observer.observe(breadcrumb,{attributes:true,attributeFilter:['data-note-target']});
  const interval=setInterval(()=>{if(!document.hidden)void poll();},2000);void poll();noteChange();
  return{refresh:poll,destroy(){disposed=true;clearInterval(interval);clearTimeout(typingTimer);observer.disconnect();document.removeEventListener('input',input,true);}};
}

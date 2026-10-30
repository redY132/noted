import { ACCENT_SWATCHES } from './appearance.ts';
export type Panel = 'navigation'|'notes'|'formatting'|'components'|'details'|'footer'|'connections';
export const layoutKey='noted-layout-v1';
export const defaultPanels:Record<Panel,boolean>={navigation:false,notes:true,formatting:false,components:false,details:false,footer:false,connections:false};
export function applyLayoutPreferences(panels:Record<Panel,boolean>,focus=false){
  for(const p of Object.keys(panels) as Panel[])document.documentElement.dataset[`panel${p[0].toUpperCase()+p.slice(1)}`]=String(!focus&&panels[p]);
}
export function readLayout(storage?:Pick<Storage,'getItem'>):Record<Panel,boolean>{
  try{const value=JSON.parse((storage??localStorage).getItem(layoutKey)??'null');if(value?.version!==1)return{...defaultPanels};return Object.fromEntries(Object.entries(defaultPanels).map(([key,fallback])=>[key,typeof value.panels?.[key]==='boolean'?value.panels[key]:fallback])) as Record<Panel,boolean>;}catch{return{...defaultPanels};}
}
const icons:Record<string,string>={navigation:'<path d="M4 4h16v16H4zM9 4v16"/>',notes:'<path d="M4 4h16v16H4zM13 4v16M7 8h2M7 12h2M7 16h2"/>',formatting:'<path d="M5 5h14M12 5v14M8 19h8"/>',view:'<path d="M4 5h16v14H4zM4 9h16"/>',appearance:'<circle cx="12" cy="12" r="8"/><path d="M12 4v16"/>',connections:'<path d="m9 14 6-4M8 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm8 8a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"/>'};
const icon=(name:string)=>`<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">${icons[name]}</svg>`;
const toggle=(panel:Panel,label:string)=>`<button type="button" class="shell-icon" data-panel-toggle="${panel}" aria-label="${label}" title="${label}" aria-expanded="false">${icon(panel)}</button>`;
export const shellTopbar=`<header class="shell-topbar"><div class="shell-controls">${toggle('navigation','Toggle folder navigation')}${toggle('notes','Toggle note list')}${toggle('formatting','Toggle formatting')}<button type="button" class="shell-icon" id="view-toggle" aria-label="View options" title="View options" aria-expanded="false" aria-controls="view-popover">${icon('view')}</button><button type="button" class="shell-icon" id="appearance-toggle" aria-label="Appearance" title="Appearance" aria-expanded="false" aria-controls="appearance-popover">${icon('appearance')}</button></div><span id="breadcrumb">Your workspace</span><div class="shell-status"><span id="preview-badge" hidden>Preview</span><span id="header-connection-handle"></span><button type="button" id="connections-toggle" class="shell-icon" aria-label="Toggle connections" title="Toggle connections" aria-expanded="false" aria-controls="connections-panel">${icon('connections')}</button><span id="save-state" role="status">Ready</span></div></header>`;
const names:Record<Panel,string>={navigation:'Folder navigation',notes:'Note list',formatting:'Text formatting',components:'Layout tools',details:'Note details',footer:'Status footer',connections:'Connections'};
export const shellPopovers=`<section id="view-popover" class="shell-popover" aria-label="View options" hidden><h2>View</h2>${Object.entries(names).map(([key,label])=>`<label><input type="checkbox" data-panel-choice="${key}"> ${label}</label>`).join('')}<button type="button" id="focus-mode" aria-pressed="false">Focus mode <kbd>F8</kbd></button><button type="button" id="shell-new-note">New note <kbd>Ctrl N</kbd></button><button type="button" id="shell-workspace">Workspace details</button><button type="button" id="reset-layout">Reset layout</button></section><section id="appearance-popover" class="shell-popover" aria-label="Appearance" hidden><h2>Appearance</h2><label>Color scheme<select id="appearance-mode" aria-label="Color scheme"><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label><div class="accent-swatches">${ACCENT_SWATCHES.map(s=>`<button type="button" data-accent="${s.color}" style="--swatch:${s.color}" aria-label="${s.name} accent" title="${s.name}"></button>`).join('')}</div><label>Custom accent<input type="color" id="appearance-accent" aria-label="Custom accent color"></label><button type="button" id="reset-appearance">Reset appearance</button></section>`;
type Appearance={get():{mode:'system'|'light'|'dark';accent:string;resolvedTheme:string};setMode(mode:'system'|'light'|'dark'):void;setAccent(color:string):void;reset():void;subscribe(fn:(state:{mode:'system'|'light'|'dark';accent:string;resolvedTheme:string})=>void):()=>void};
export function initializeShell(options:{appearance:Appearance;getEditor:()=>{view:{focus():void;dom:HTMLElement}}|null;newNote:()=>void;workspace:()=>void},initial=readLayout()){
  let panels={...initial},focus=false;const listeners=new Set<()=>void>();
  const $=<T extends HTMLElement>(s:string)=>document.querySelector<T>(s)!;
  const targets:Record<Panel,string[]>={navigation:['#navigation-panel'],notes:['#notes-panel'],formatting:['#formatting-tools'],components:['#layout-tools'],details:['#note-details','#note-kicker'],footer:['#note-footer'],connections:['#connections-panel']};
  const effective=(p:Panel)=>!focus&&panels[p];
  const persist=()=>{try{localStorage.setItem(layoutKey,JSON.stringify({version:1,panels}));}catch{}};
  function apply(){
    applyLayoutPreferences(panels,focus);
    for(const p of Object.keys(panels) as Panel[]){
      const open=effective(p);
      for(const selector of targets[p]){const el=$(selector);if(el){if(!open&&el.contains(document.activeElement))options.getEditor()?.view.focus();el.inert=!open;el.hidden=!open;}}
      for(const b of document.querySelectorAll<HTMLButtonElement>(`[data-panel-toggle="${p}"]`)){b.setAttribute('aria-expanded',String(open));b.setAttribute('aria-controls',targets[p][0].slice(1));}
      const checkbox=$<HTMLInputElement>(`[data-panel-choice="${p}"]`);if(checkbox)checkbox.checked=open;
    }
    $('#app').classList.toggle('connections-visible',effective('connections'));
    $('#connections-toggle').setAttribute('aria-expanded',String(effective('connections')));
    $('#focus-mode').setAttribute('aria-pressed',String(focus));$('#focus-mode').firstChild!.textContent=focus?'Exit focus mode ':'Focus mode ';
    for(const listener of listeners)listener();
    window.dispatchEvent(new Event('resize'));
  }
  function setPanel(p:Panel,open:boolean){if(focus){focus=false;}panels[p]=open;persist();apply();}
  const close=(id:string)=>{$(id).inert=true;$(id).hidden=true;$(id==='#view-popover'?'#view-toggle':'#appearance-toggle').setAttribute('aria-expanded','false');};
  function popover(id:string,button:HTMLElement){const open=$(id).hidden;close(id==='#view-popover'?'#appearance-popover':'#view-popover');$(id).inert=!open;$(id).hidden=!open;button.setAttribute('aria-expanded',String(open));if(open){const r=button.getBoundingClientRect();$(id).style.left=`${Math.max(6,Math.min(r.left,innerWidth-260))}px`;$(id).querySelector<HTMLElement>('input,select,button')?.focus();}}
  document.addEventListener('click',event=>{const target=event.target as Element;const b=target.closest<HTMLElement>('[data-panel-toggle]');if(b){const p=b.dataset.panelToggle as Panel;setPanel(p,!effective(p));return;}if(!target.closest('#view-popover,#view-toggle'))close('#view-popover');if(!target.closest('#appearance-popover,#appearance-toggle'))close('#appearance-popover');});
  for(const p of Object.keys(panels) as Panel[])$<HTMLInputElement>(`[data-panel-choice="${p}"]`).onchange=e=>setPanel(p,(e.target as HTMLInputElement).checked);
  document.querySelector<HTMLButtonElement>('[data-panel-toggle=formatting]')!.onmousedown=e=>e.preventDefault();
  $('#view-toggle').onclick=()=>popover('#view-popover',$('#view-toggle'));$('#appearance-toggle').onclick=()=>popover('#appearance-popover',$('#appearance-toggle'));
  $('#focus-mode').onclick=()=>{focus=!focus;apply();close('#view-popover');options.getEditor()?.view.focus();};
  $('#reset-layout').onclick=()=>{panels={...defaultPanels};focus=false;persist();apply();};
  $('#shell-new-note').onclick=()=>{close('#view-popover');options.newNote();};$('#shell-workspace').onclick=()=>{close('#view-popover');options.workspace();};
  document.addEventListener('keydown',e=>{if(e.key==='F8'&&!document.querySelector('dialog[open]')){e.preventDefault();close('#view-popover');close('#appearance-popover');focus=!focus;apply();options.getEditor()?.view.focus();}if(e.key==='Escape'){for(const id of ['#view-popover','#appearance-popover'])if(!$(id).hidden){e.preventDefault();close(id);$(id==='#view-popover'?'#view-toggle':'#appearance-toggle').focus();}}});
  options.appearance.subscribe(state=>{$<HTMLSelectElement>('#appearance-mode').value=state.mode;$<HTMLInputElement>('#appearance-accent').value=state.accent;for(const b of document.querySelectorAll<HTMLButtonElement>('[data-accent]'))b.setAttribute('aria-pressed',String(b.dataset.accent===state.accent));});
  const updateAppearance=()=>{const state=options.appearance.get();$<HTMLSelectElement>('#appearance-mode').value=state.mode;$<HTMLInputElement>('#appearance-accent').value=state.accent;for(const b of document.querySelectorAll<HTMLButtonElement>('[data-accent]'))b.setAttribute('aria-pressed',String(b.dataset.accent===state.accent));};updateAppearance();
  $<HTMLSelectElement>('#appearance-mode').onchange=e=>options.appearance.setMode((e.target as HTMLSelectElement).value as 'system'|'light'|'dark');
  $<HTMLInputElement>('#appearance-accent').oninput=e=>options.appearance.setAccent((e.target as HTMLInputElement).value);
  for(const b of document.querySelectorAll<HTMLButtonElement>('[data-accent]'))b.onclick=()=>options.appearance.setAccent(b.dataset.accent!);
  $('#reset-appearance').onclick=()=>options.appearance.reset();
  apply();
  return{setPanel,isOpen:effective,getPanels:()=>({...panels}),isFocus:()=>focus,connections:{isOpen:()=>effective('connections'),setOpen:(open:boolean)=>setPanel('connections',open),subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>listeners.delete(fn);}}};
}

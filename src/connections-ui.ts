import type { NoteSummary } from './model';
import { noteLinkTarget } from './note-links.ts';

type Page<T> = { items: T[]; nextCursor: number | null; total: number };
type Pair = { a: string; b: string; connected: boolean; dismissed: boolean; revision: number };
type Mutation = { state: Pair; previous: Pair; changed: boolean };
type Entry = { noteId: string; note: NoteSummary | null; state: Pair };
type Reference = { noteId: string; note: NoteSummary | null; outgoing: number; incoming: number };
type Related = { note: NoteSummary; reasons: string[]; score: number };
export interface ConnectionAPI {
  picker(sourceId: string, query: string, cursor?: number, limit?: number): Promise<Page<{note: NoteSummary; connected: boolean}>>;
  connections(noteId: string, cursor?: number, limit?: number): Promise<Page<Entry>>;
  references(noteId: string, cursor?: number, limit?: number): Promise<Page<Reference>>;
  related(noteId: string, cursor?: number, limit?: number): Promise<Page<Related>>;
  setRelation(a: string, b: string, connected?: boolean, dismissed?: boolean, expectedRevision?: number): Promise<Mutation>;
  restoreDismissed(noteId: string): Promise<number>;
}
export const connectionHandle = (id: string, title: string) => `<button type="button" class="connection-handle" data-connect-source="${esc(id)}" data-source-title="${esc(title || 'Untitled')}" aria-label="Connect ${esc(title || 'Untitled')} to another note" title="Click to find notes; drag to connect">⤳</button>`;
const esc = (value: string) => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export const connectionsMarkup = `<aside id="connections-panel" class="connections-panel" aria-label="Note connections" hidden><header><h2>Connections</h2><button type="button" id="connections-close" aria-label="Close connections">×</button></header><div id="connections-current"></div><div class="connections-body"><section><h3>Connected</h3><div id="connections-saved"></div></section><section><h3>References</h3><div id="connections-references"></div></section><section><h3>Suggested</h3><div id="connections-suggested"></div><button type="button" id="connections-restore">Restore dismissed suggestions</button></section><section id="semantic-controls"></section></div></aside><section id="connection-picker" class="connection-picker" role="dialog" aria-modal="false" aria-labelledby="connection-picker-title" hidden><header><h2 id="connection-picker-title">Connect notes</h2><button type="button" id="connection-picker-close" aria-label="Close note picker">×</button></header><p id="connection-source-title"></p><input id="connection-query" type="search" aria-label="Find notes to connect" placeholder="Search titles, folders, tags…" autocomplete="off"><div id="connection-picker-results"></div></section><div id="connection-toast" class="connection-toast" role="status" hidden><span></span><button type="button" id="connection-undo">Undo</button></div><div id="connection-announcement" class="sr-only" aria-live="polite"></div><svg id="connection-ray" class="connection-ray" aria-hidden="true" hidden><line stroke="currentColor" stroke-width="2" stroke-dasharray="5 3" /></svg>`;

/** Every target carries a real note ID; arbitrary document text is never a target. */
export function targetNote(element: Element | null): string | null {
  if (element?.closest('[data-note-unavailable]')) return null;
  const target = element?.closest<HTMLElement>('[data-note-target],[data-note],a[href]');
  if (!target) return null;
  const value = target.dataset.noteTarget || target.dataset.note;
  if (value) return value;
  const link = noteLinkTarget(target.getAttribute('href'));
  return link?.kind === 'note' ? link.destination : null;
}

export function initializeConnectionsUI(options: { visibility?:{isOpen:()=>boolean;setOpen:(open:boolean)=>void;subscribe:(fn:()=>void)=>()=>void}; api: ConnectionAPI; current: () => NoteSummary | null; open: (id: string) => Promise<void>; folder: (id: string | null) => string; error: (reason: unknown) => void }) {
  const {api} = options;
  const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
  const panel = $('#connections-panel'), picker = $('#connection-picker'), results = $('#connection-picker-results'), ray = $('#connection-ray');
  let source: {id: string; title: string} | null = null, anchor: HTMLElement | null = null;
  let searchGeneration = 0, panelGeneration = 0, queryTimer: ReturnType<typeof setTimeout> | undefined, refreshTimer: ReturnType<typeof setTimeout> | undefined;
  let restoreFocus: HTMLElement | null = null, undo: Mutation | null = null;
  let dragging: { id: number; source: string; title: string; startX: number; startY: number; x: number; y: number; handle: HTMLElement; active: boolean; target: Element | null; frame: number } | null = null;
  let suppressedDragClick: {handle:HTMLElement;until:number}|null=null;
  const busyPairs = new Set<string>();
  panel.hidden = !(options.visibility?.isOpen() ?? false);
  function announce(message: string) { $('#connection-announcement').textContent = message; }
  function row(note: NoteSummary | null, id: string, actions: string, detail = '') {
    return `<div class="connection-entry" data-note-target="${esc(id)}" ${note ? '' : 'data-note-unavailable'}><button type="button" class="connection-open" data-open-note="${esc(id)}" ${note ? '' : 'disabled'}><strong>${esc(note?.title || (note ? 'Untitled' : 'Unavailable note'))}</strong><small>${esc(note ? options.folder(note.folderId) : id)}</small>${detail ? `<small>${esc(detail)}</small>` : ''}</button><div class="connection-actions">${actions}</div></div>`;
  }
  function positionPicker() {
    const rect = anchor?.getBoundingClientRect(); if (!rect) return;
    picker.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - Math.min(390, innerWidth - 16) - 8))}px`;
    picker.style.top = `${Math.max(8, Math.min(rect.bottom + 6, innerHeight - Math.min(470, innerHeight - 16) - 8))}px`;
  }
  function closePicker(restore = true) { picker.hidden = true; source = null; searchGeneration++; if(restore)restoreFocus?.focus({preventScroll:true}); }
  function setPanel(open: boolean) {
    if(options.visibility){options.visibility.setOpen(open);return;}
    panel.hidden = !open; document.querySelector('#app')?.classList.toggle('connections-visible', open);
    $('#connections-toggle').setAttribute('aria-expanded', String(open));
    if (open) void refresh();
  }
  async function search(cursor = 0) {
    if (!source || picker.hidden) return;
    const id = source.id, generation = ++searchGeneration;
    const query = $<HTMLInputElement>('#connection-query').value;
    try {
      const page = await api.picker(id, query, cursor, 40);
      if (generation !== searchGeneration || source?.id !== id || picker.hidden) return;
      const html = page.items.map(({note,connected}) => row(note,note.id, `<button type="button" data-picker-connect="${esc(note.id)}" ${connected ? 'disabled' : ''}>${connected ? 'Connected' : 'Connect'}</button>`, note.tags.map(t=>`#${t}`).join(' '))).join('');
      if (!cursor) results.innerHTML = html || '<p class="connection-empty">No other notes found.</p>';
      else { results.querySelector('[data-picker-more]')?.remove(); results.insertAdjacentHTML('beforeend', html); }
      if (page.nextCursor !== null) results.insertAdjacentHTML('beforeend', `<button type="button" data-picker-more="${page.nextCursor}">Show more notes</button>`);
    } catch (reason) { if(generation===searchGeneration) options.error(reason); }
  }
  function openPicker(handle: HTMLElement) {
    const id = handle.dataset.connectSource; if (!id) return;
    restoreFocus = document.activeElement as HTMLElement; anchor = handle;
    source = {id,title:handle.dataset.sourceTitle || 'Untitled'};
    $('#connection-source-title').textContent = `From: ${source.title}`;
    $<HTMLInputElement>('#connection-query').value = ''; picker.hidden = false; positionPicker();
    $('#connection-query').focus(); void search();
  }
  async function mutate(a: string,b: string,connected?: boolean,dismissed?: boolean,expectedRevision?: number) {
    const key = [a,b].sort().join('/'); if(busyPairs.has(key)) return;
    busyPairs.add(key);
    try {
      const result = await api.setRelation(a,b,connected,dismissed,expectedRevision);
      const message = result.changed ? connected === true ? 'Notes connected' : connected === false ? 'Connection removed' : 'Suggestion dismissed' : 'Already connected';
      announce(message); const toast = $('#connection-toast'); toast.hidden = false; toast.querySelector('span')!.textContent = message;
      undo = result.changed ? result : null; $('#connection-undo').hidden = !undo;
      if (!picker.hidden) void search(); void refresh();
    } catch(reason) { options.error(reason); }
    finally { busyPairs.delete(key); }
  }
  async function refresh() {
    const note = options.current();
    $('#connections-toggle').toggleAttribute('disabled', !note);
    if (!note || panel.hidden) return;
    const generation = ++panelGeneration, id=note.id;
    $('#connections-current').textContent = note.title || 'Untitled';
    try {
      const [saved,refs,suggested] = await Promise.all([api.connections(id,0,40),api.references(id,0,40),api.related(id,0,8)]);
      if(generation!==panelGeneration || options.current()?.id!==id) return;
      $('#connections-saved').innerHTML = saved.items.map(entry=>row(entry.note,entry.noteId,`<button type="button" data-remove-connection="${esc(entry.noteId)}" data-revision="${entry.state.revision}">Remove</button>`)).join('') || '<p class="connection-empty">No saved connections yet. Click or drag a connection handle.</p>';
      $('#connections-references').innerHTML = refs.items.map(entry=>row(entry.note,entry.noteId,'',`${entry.outgoing ? `${entry.outgoing} outgoing` : ''}${entry.outgoing && entry.incoming ? ' · ' : ''}${entry.incoming ? `${entry.incoming} incoming` : ''}`)).join('') || '<p class="connection-empty">Written note links and backlinks appear here.</p>';
      $('#connections-suggested').innerHTML = suggested.items.map(entry=>row(entry.note,entry.note.id,`<button type="button" data-suggestion-connect="${esc(entry.note.id)}">Connect</button><button type="button" data-dismiss-suggestion="${esc(entry.note.id)}">Dismiss</button>`,entry.reasons.join(' · '))).join('') || '<p class="connection-empty">No suggestions yet. Notes with shared topics or tags can appear here.</p>';
      for(const [kind,page] of [['saved',saved],['references',refs],['suggested',suggested]] as const) if(page.nextCursor!==null) $(`#connections-${kind}`).insertAdjacentHTML('beforeend',`<button type="button" data-panel-more="${kind}" data-cursor="${page.nextCursor}">Show more</button>`);
    } catch(reason) { if(generation===panelGeneration) options.error(reason); }
  }
  async function more(button: HTMLElement) {
    const note = options.current(); if(!note) return;
    const id=note.id, kind=button.dataset.panelMore!, cursor=Number(button.dataset.cursor);
    try {
      button.setAttribute('disabled','');
      const page = kind==='saved' ? await api.connections(id,cursor,40) : kind==='references' ? await api.references(id,cursor,40) : await api.related(id,cursor,8);
      if(options.current()?.id!==id || !button.isConnected) return;
      const html = page.items.map(item=> {
        if('state' in item) return row(item.note,item.noteId,`<button type="button" data-remove-connection="${esc(item.noteId)}" data-revision="${item.state.revision}">Remove</button>`);
        if('outgoing' in item) return row(item.note,item.noteId,'',`${item.outgoing} outgoing · ${item.incoming} incoming`);
        return row(item.note,item.note.id,`<button type="button" data-suggestion-connect="${esc(item.note.id)}">Connect</button><button type="button" data-dismiss-suggestion="${esc(item.note.id)}">Dismiss</button>`,item.reasons.join(' · '));
      }).join('');
      button.insertAdjacentHTML('beforebegin',html);
      if(page.nextCursor===null) button.remove(); else {button.dataset.cursor=String(page.nextCursor);button.removeAttribute('disabled');}
    } catch(reason) {button.removeAttribute('disabled');options.error(reason);}
  }
  function finishDrag(cancel=false) {
    const drag=dragging; if(!drag) return;
    dragging=null; cancelAnimationFrame(drag.frame); ray.setAttribute('hidden','');
    drag.target?.classList.remove('connection-drop-target'); document.body.classList.remove('connection-dragging');
    try {drag.handle.releasePointerCapture?.(drag.id);} catch { /* element may have rerendered */ }
    if(drag.active) {suppressedDragClick={handle:drag.handle,until:Date.now()+400}; const id=targetNote(document.elementFromPoint(drag.x,drag.y));if(!cancel&&id&&id!==drag.source)void mutate(drag.source,id,true);}
  }
  function frame() {
    const drag=dragging; if(!drag?.active) return;
    const rect=drag.handle.getBoundingClientRect(), line=ray.querySelector('line')!;
    for(const [name,value] of Object.entries({x1:rect.left+rect.width/2,y1:rect.top+rect.height/2,x2:drag.x,y2:drag.y}))line.setAttribute(name,String(value));
    const hit=document.elementFromPoint(drag.x,drag.y), id=targetNote(hit);
    const target=id&&id!==drag.source?hit?.closest('[data-note-target],[data-note],a[href]')??null:null;
    if(target!==drag.target){drag.target?.classList.remove('connection-drop-target');target?.classList.add('connection-drop-target');drag.target=target;}
    let container=hit as HTMLElement|null;
    while(container && container!==document.body){
      const style=getComputedStyle(container),r=container.getBoundingClientRect();
      const scrollY=/auto|scroll/.test(style.overflowY)&&container.scrollHeight>container.clientHeight;
      const scrollX=/auto|scroll/.test(style.overflowX)&&container.scrollWidth>container.clientWidth;
      if(scrollY||scrollX){const dy=scrollY?(drag.y<r.top+28?-10:drag.y>r.bottom-28?10:0):0;const dx=scrollX?(drag.x<r.left+28?-10:drag.x>r.right-28?10:0):0;if(dy)container.scrollTop+=dy;if(dx)container.scrollLeft+=dx;break;}
      container=container.parentElement;
    }
    drag.frame=requestAnimationFrame(frame);
  }
  document.addEventListener('pointerdown',event=>{
    const handle=(event.target as Element).closest<HTMLElement>('[data-connect-source]');
    if(!handle||event.button!==0||!handle.dataset.connectSource)return;
    event.preventDefault(); event.stopPropagation();
    dragging={id:event.pointerId,source:handle.dataset.connectSource,title:handle.dataset.sourceTitle||'Untitled',startX:event.clientX,startY:event.clientY,x:event.clientX,y:event.clientY,handle,active:false,target:null,frame:0};
    handle.setPointerCapture?.(event.pointerId);
  },true);
  document.addEventListener('pointermove',event=>{
    const drag=dragging;if(!drag||event.pointerId!==drag.id)return;
    drag.x=event.clientX;drag.y=event.clientY;
    if(drag.x<0||drag.y<0||drag.x>innerWidth||drag.y>innerHeight){finishDrag(true);return;}
    if(!drag.active&&Math.hypot(drag.x-drag.startX,drag.y-drag.startY)>6){drag.active=true;ray.removeAttribute('hidden');document.body.classList.add('connection-dragging');frame();}
    if(drag.active)event.preventDefault();
  },true);
  document.addEventListener('pointerup',event=>{if(dragging?.id===event.pointerId){dragging.x=event.clientX;dragging.y=event.clientY;finishDrag();}},true);
  document.addEventListener('pointercancel',()=>finishDrag(true),true);
  document.addEventListener('lostpointercapture',event=>{if(dragging?.id===event.pointerId)finishDrag(true);},true);
  window.addEventListener('blur',()=>finishDrag(true));
  document.addEventListener('click',event=>{
    const handle=(event.target as Element).closest<HTMLElement>('[data-connect-source]');
    if(suppressedDragClick&&Date.now()<suppressedDragClick.until&&handle===suppressedDragClick.handle&&event.detail!==0){suppressedDragClick=null;event.preventDefault();event.stopImmediatePropagation();return;}
    if(handle){event.preventDefault();event.stopPropagation();openPicker(handle);return;}
    const target=event.target as Element;
    if(!picker.hidden&&!picker.contains(target)&&!target.closest('[data-connect-source]'))closePicker(false);
    const open=target.closest<HTMLElement>('[data-open-note]');if(open){void options.open(open.dataset.openNote!).catch(options.error);return;}
    const connect=target.closest<HTMLElement>('[data-picker-connect]');if(connect&&source){void mutate(source.id,connect.dataset.pickerConnect!,true);return;}
    const pickerMore=target.closest<HTMLElement>('[data-picker-more]');if(pickerMore){void search(Number(pickerMore.dataset.pickerMore));return;}
    const current=options.current();if(!current)return;
    const remove=target.closest<HTMLElement>('[data-remove-connection]');if(remove){void mutate(current.id,remove.dataset.removeConnection!,false,undefined,Number(remove.dataset.revision));return;}
    const accept=target.closest<HTMLElement>('[data-suggestion-connect]');if(accept){void mutate(current.id,accept.dataset.suggestionConnect!,true);return;}
    const dismiss=target.closest<HTMLElement>('[data-dismiss-suggestion]');if(dismiss){void mutate(current.id,dismiss.dataset.dismissSuggestion!,undefined,true);return;}
    const load=target.closest<HTMLElement>('[data-panel-more]');if(load)void more(load);
  },true);
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'){if(dragging){event.preventDefault();finishDrag(true);}else if(!picker.hidden){event.preventDefault();closePicker();}}
    if(!picker.hidden&&picker.contains(event.target as Node)&&['ArrowDown','ArrowUp','Enter'].includes(event.key)){
      const buttons=[...results.querySelectorAll<HTMLButtonElement>('[data-picker-connect]:not(:disabled)')];
      if(!buttons.length)return;const index=buttons.indexOf(document.activeElement as HTMLButtonElement);
      if(event.key==='Enter'&&event.target===$('#connection-query')){event.preventDefault();buttons[0].click();}
      else if(event.key!=='Enter'){event.preventDefault();buttons[(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus();}
    }
  },true);
  $('#connection-query').addEventListener('input',()=>{clearTimeout(queryTimer);searchGeneration++;queryTimer=setTimeout(()=>void search(),150);});
  $('#connection-picker-close').onclick=()=>closePicker();
  $('#connections-toggle').onclick=()=>setPanel(Boolean(panel.hidden));
  $('#connections-close').onclick=()=>setPanel(false);
  $('#connections-restore').onclick=()=>{const note=options.current();if(note)void api.restoreDismissed(note.id).then(()=>{announce('Dismissed suggestions restored');void refresh();}).catch(options.error);};
  $('#connection-undo').onclick=()=>{const action=undo;if(!action)return;undo=null;void mutate(action.state.a,action.state.b,action.previous.connected,action.previous.dismissed,action.state.revision);};
  window.addEventListener('resize',positionPicker);
  if(options.visibility)options.visibility.subscribe(()=>{panel.hidden=!options.visibility!.isOpen();if(!panel.hidden)void refresh();});
  else setPanel(!panel.hidden);
  return {refresh, isDragging:()=>Boolean(dragging), committed(){clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>void refresh(),2000);}, changed(){panelGeneration++;void refresh();}, closePicker};
}



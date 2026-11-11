import type { Folder, NoteSummary, PairState } from './model.ts';
import { folderAppearance, folderIconMarkup } from './folder-appearance.ts';
import { forceSimulation, forceCollide, forceManyBody, forceX, forceY, forceLink } from 'd3-force';

export type Collection = 'all' | string | null;
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export const navigationMarkup = `
<aside id="navigation-panel" class="dynamic-navigation" aria-label="Workspace navigation">
 <svg class="directory-branch" aria-hidden="true"><path/></svg>
 <div class="navigation-tree">
  <header class="navigation-heading"><span>Browse notes</span><button type="button" id="navigation-close" aria-label="Close navigation">×</button></header>
  <button type="button" class="primary" id="new-note">New note <kbd>Ctrl N</kbd></button>
  <nav class="navigation" aria-label="Collections"><button type="button" class="nav-item selected" id="all-notes" aria-current="true">All notes <small id="total-count">0</small></button><button type="button" class="nav-item" id="daily-note">Today's note</button></nav>
  <div class="section-label">Folders<button type="button" id="add-folder" aria-label="Create folder" title="Create folder">+</button></div>
  <nav id="folders" class="folders" aria-label="Folders"></nav>
  <div class="library-actions"><button type="button" id="manage-folders">Manage folders</button><button type="button" id="open-trash">Trash</button><button type="button" id="open-review">Review notes</button><button type="button" id="open-agent">Agent access</button></div>
  <div class="sidebar-bottom"><span id="workspace-label">Local workspace</span><button type="button" id="workspace-info" aria-label="Workspace details" title="Workspace details">ⓘ</button></div>
 </div>
 <section id="notes-panel" class="collection-directory" aria-label="Notes">
  <header class="list-heading"><div><button type="button" id="navigation-back">Back to folders</button><h1 id="collection-title">All notes</h1><span id="list-description">Recently written</span></div><span id="list-count">0</span></header>
  <div class="collection-actions"><button type="button" id="customize-folder" hidden>Customize folder</button><button type="button" id="collection-new-note">New note</button></div>
  <label class="collection-search" for="search">Find in this collection<input id="search" type="search" placeholder="Search notes" aria-label="Search notes" autocomplete="off"></label>
  <p id="collection-status" role="status" hidden></p><div id="note-list" class="note-list" aria-label="Notes in this collection"></div>
 </section>
 <section id="folder-graph" class="folder-graph" aria-label="Collection graph">
  <header><h2>Saved connections</h2><button type="button" id="folder-graph-refresh" aria-label="Refresh collection graph" title="Refresh collection graph">↻</button></header>
  <p id="folder-graph-summary" role="status"></p>
  <div id="folder-graph-canvas" class="folder-graph-canvas"><svg aria-hidden="true" width="100%" height="100%"></svg><div id="folder-graph-nodes"></div></div>
  <p id="folder-graph-caption">Hover or focus a note to locate it.</p>
 </section>
</aside>`;

export function folderAncestors(folders: Folder[], id: Collection): string[] {
  const path: string[] = [], seen = new Set<string>();
  while (id && id !== 'all' && !seen.has(id)) {
    seen.add(id); const folder = folders.find(f => f.id === id); if (!folder) break;
    path.unshift(id); id = folder.parentId;
  }
  return path;
}
export function graphWindow(notes: NoteSummary[], highlighted: string | null, capacity: number) {
  const items = notes.slice(0, Math.max(1, Math.min(60, capacity)));
  const note = notes.find(n => n.id === highlighted);
  if (note && !items.some(n => n.id === note.id)) items.splice(items.length - 1, 1, note);
  return items;
}
export function graphCapacity(width: number, height: number) {
  return Math.max(1, Math.min(60, Math.floor(Math.floor((width - 8) / 50) * Math.floor((height - 8) / 50) * .65)));
}
export function graphPositions(count: number, width: number, height: number, edges: { a: number; b: number }[] = []) {
  const nodes = Array.from({ length: count }, (_, index) => ({ id: String(index), x: width / 2 + Math.cos(index * 2.39996) * Math.sqrt(index) * 24, y: height / 2 + Math.sin(index * 2.39996) * Math.sqrt(index) * 24 }));
  const simulation = forceSimulation(nodes).stop().force('collision', forceCollide(25).iterations(5)).force('charge', forceManyBody().strength(-25))
    .force('x', forceX(width / 2).strength(.025)).force('y', forceY(height / 2).strength(.025))
    .force('links', forceLink(edges.map(e => ({ source: String(e.a), target: String(e.b) }))).id(n => (n as typeof nodes[number]).id).distance(62).strength(.12));
  // A finite solve leaves the writing path free of a continuous animation loop.
  for (let step = 0; step < 180; step++) { simulation.tick(); for (const n of nodes) { n.x = Math.max(24, Math.min(width - 24, n.x)); n.y = Math.max(24, Math.min(height - 24, n.y)); } }
  return nodes.map(n => ({ x: n.x, y: n.y }));
}
interface NavigationOptions {
  select(collection: Collection): void;
  open(id: string): Promise<boolean>;
  close(): void;
  focusEditor(): void;
  edges(ids: string[]): Promise<PairState[]>;
  parentNotes?(folder: string, cursor: number): Promise<{items: NoteSummary[]; total: number; nextCursor: number | null}>;
}
export function initializeNavigation(root: HTMLElement, options: NavigationOptions) {
  const $ = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const directory = $('.navigation-tree'), popup = $('#notes-panel'), graph = $('#folder-graph'), canvas = $('#folder-graph-canvas');
  const children = document.createElement('nav'); children.id = 'folder-children'; children.className = 'folders'; children.setAttribute('aria-label','Child folders');
  popup.querySelector('.collection-actions')!.before(children);
  const parentButton = document.createElement('button'); parentButton.type = 'button'; parentButton.id = 'directory-parent'; parentButton.textContent = 'Back';
  directory.querySelector('.navigation-heading')!.after(parentButton);
  let folders: Folder[] = [], selected: Collection = 'all', notes: NoteSummary[] = [], total = 0, active: string | null = null, highlighted: string | null = null;
  let open = false, browsing = false, epoch = 0, frame = 0, edgeKey = '', layoutKey = '', edgeError = false, loading = false, destroyed = false;
  let edgeTimer: ReturnType<typeof setTimeout> | undefined;
  let edges: PairState[] = [], shown: NoteSummary[] = [];
  type GraphNode = {id:string;x:number;y:number;vx?:number;vy?:number;fx?:number|null;fy?:number|null};
  let nodes: GraphNode[] = [], simulation: ReturnType<typeof forceSimulation<GraphNode>> | null = null;
  let drag: {id:string;pointer:number;x:number;y:number;moved:boolean} | null = null, suppressClick: string | null = null;
  const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const animations = new Set<Animation>(), ghosts = new Set<HTMLElement>(), cleanup: (()=>void)[] = [];
  let transitionEpoch = 0;
  let restoringFolderFocus = false;
  type DirectoryPage = {folder: string; items: NoteSummary[]; total: number; nextCursor: number | null; loading: boolean; failed: boolean};
  let parentPage: DirectoryPage | null = null, currentCursor: number | null = null, currentLoaded = false;
  function listen(target: EventTarget, name: string, action: EventListener) { target.addEventListener(name,action); cleanup.push(()=>target.removeEventListener(name,action)); }
  function text(selector:string,value:string) { if($(selector).textContent!==value) $(selector).textContent=value; }
  function stopMotion() {
    ++transitionEpoch;
    for(const animation of animations) animation.cancel(); animations.clear();
    for(const ghost of ghosts) ghost.remove(); ghosts.clear();
  }
  function animate(element:HTMLElement, frames:Keyframe[], duration=380) {
    if(motion?.matches || !element.animate) return;
    const animation=element.animate(frames,{duration,easing:'cubic-bezier(.22,.8,.25,1)'});
    animations.add(animation); void animation.finished.catch(()=>{}).finally(()=>animations.delete(animation));
    return animation;
  }
  function stopGraph() { simulation?.stop(); simulation=null; canvas.dataset.simulating='false'; drag=null; }
  function ghostOf(element:HTMLElement) {
    const ghost=element.cloneNode(true) as HTMLElement;
    ghost.removeAttribute('id'); for(const child of ghost.querySelectorAll('[id]')) child.removeAttribute('id');
    for(const child of [ghost,...ghost.querySelectorAll<HTMLElement>('*')]) {
      for(const attr of ['data-folder','data-note','data-explorer-parent-note','data-parent-more','data-folder-graph-note','data-note-target','data-connect-source','aria-controls','aria-labelledby','for'])child.removeAttribute(attr);
    }
    ghost.inert=true; ghost.setAttribute('aria-hidden','true'); ghost.classList.add('explorer-ghost'); ghosts.add(ghost); return ghost;
  }
  function graphArrival() {
    if(!open || !browsing || destroyed || motion?.matches || !canvas.animate) return;
    const source=document.querySelector<HTMLElement>('#header-connection-handle button'), target=canvas.getBoundingClientRect();
    if(!source || !target.width) return;
    const from=source.getBoundingClientRect(), ghost=ghostOf(source);
    Object.assign(ghost.style,{position:'fixed',left:from.left+'px',top:from.top+'px',width:from.width+'px',height:from.height+'px',zIndex:'100'});
    document.body.append(ghost);
    const dx=target.left+target.width/2-from.left-from.width/2, dy=target.top+target.height/2-from.top-from.height/2;
    const flight=animate(ghost,[{transform:'translate(0,0) scale(1)',opacity:1},{transform:'translate('+dx+'px,'+dy+'px) scale(1.2)',opacity:1,offset:.65},{transform:'translate('+dx+'px,'+dy+'px) scale(4)',opacity:0}],600);
    const previous=source.style.visibility; source.style.visibility='hidden';
    void flight?.finished.catch(()=>{}).finally(()=>{source.style.visibility=previous;ghost.remove();ghosts.delete(ghost);});
    animate(canvas,[{transform:'scale(.04)',opacity:0},{transform:'scale(.04)',opacity:0,offset:.45},{transform:'scale(1)',opacity:1}],600);
  }
  function paintHighlight() {
    const id=highlighted??active;
    for(const button of root.querySelectorAll<HTMLElement>('[data-folder-graph-note]')) button.classList.toggle('highlighted',button.dataset.folderGraphNote===id);
    for(const row of root.querySelectorAll<HTMLElement>('[data-note]')) row.classList.toggle('graph-highlight',row.dataset.note===id);
    text('#folder-graph-caption',notes.find(n=>n.id===id)?.title || (notes.length?'Hover or focus a note to locate it.':'Create a note to start this collection.'));
  }
  function draw() {
    const width=canvas.clientWidth||300,height=canvas.clientHeight||300,byId=new Map(nodes.map(n=>[n.id,n]));
    for(const node of nodes) {
      node.x=Math.max(24,Math.min(Math.max(24,width-24),node.x));node.y=Math.max(24,Math.min(Math.max(24,height-24),node.y));
      const button=root.querySelector<HTMLElement>('[data-folder-graph-note="'+node.id+'"]');
      if(button){button.style.left=node.x+'px';button.style.top=node.y+'px';}
    }
    const svg=canvas.querySelector('svg')!;svg.setAttribute('viewBox','0 0 '+width+' '+height);
    svg.innerHTML=edges.filter(e=>e.connected&&byId.has(e.a)&&byId.has(e.b)).map(e=>{
      const a=byId.get(e.a)!,b=byId.get(e.b)!,dx=b.x-a.x,dy=b.y-a.y;
      return '<path d="M'+a.x+' '+a.y+' Q'+((a.x+b.x)/2-dy*.12)+' '+((a.y+b.y)/2+dx*.12)+' '+b.x+' '+b.y+'" fill="none"/>';
    }).join('');
  }
  function graphLayout() {
    if(!open || !browsing || destroyed) return;
    const width=canvas.clientWidth||300,height=canvas.clientHeight||300;
    const key=JSON.stringify([width,height,shown.map(n=>[n.id,n.title]),edges.filter(e=>e.connected).map(e=>[e.a,e.b])]);
    if(layoutKey!==key) {
      stopGraph();layoutKey=key;
      const old=new Map(nodes.map(n=>[n.id,n]));
      nodes=shown.map((n,i)=>({id:n.id,x:old.get(n.id)?.x??width/2+Math.cos(i*2.39996)*Math.sqrt(i)*24,y:old.get(n.id)?.y??height/2+Math.sin(i*2.39996)*Math.sqrt(i)*24}));
      const focused=(document.activeElement as HTMLElement)?.dataset.folderGraphNote;
      $('#folder-graph-nodes').innerHTML=shown.map(n=>'<button type="button" class="folder-graph-node" data-folder-graph-note="'+escape(n.id)+'" data-note-target="'+escape(n.id)+'" aria-label="Open '+escape(n.title||'Untitled')+'" title="'+escape(n.title||'Untitled')+'"><span aria-hidden="true"></span></button>').join('');
      if(focused) root.querySelector<HTMLElement>('[data-folder-graph-note="'+focused+'"]')?.focus({preventScroll:true});
      const ids=new Set(nodes.map(n=>n.id));
      simulation=forceSimulation(nodes).stop().alphaDecay(.07)
        .force('collision',forceCollide(25).iterations(3)).force('charge',forceManyBody().strength(-35))
        .force('x',forceX(width/2).strength(.025)).force('y',forceY(height/2).strength(.025))
        .force('links',forceLink(edges.filter(e=>e.connected&&ids.has(e.a)&&ids.has(e.b)).map(e=>({source:e.a,target:e.b}))).id(n=>(n as GraphNode).id).distance(62).strength(.12));
      if(!nodes.length || motion?.matches || document.hidden){for(let i=0;i<140;i++)simulation.tick();stopGraph();}
      else {canvas.dataset.simulating='true';simulation.on('tick',draw).on('end',()=>{canvas.dataset.simulating='false';}).restart();}
    }
    draw();paintHighlight();
    const count=edges.filter(e=>e.connected&&shown.some(n=>n.id===e.a)&&shown.some(n=>n.id===e.b)).length;
    text('#folder-graph-summary',edgeError?'Connections could not load. Refresh to retry.':!notes.length?'This collection has no notes yet.':shown.length+' of '+total+' notes · '+count+' saved connections'+(loading?' · Updating':''));
  }
  function updateGraph(force=false) {
    if(!open||!browsing||destroyed)return;
    shown=graphWindow(notes,highlighted??active,graphCapacity(canvas.clientWidth||300,canvas.clientHeight||300));
    const key=shown.map(n=>n.id).join(',');
    graphLayout();if(key===edgeKey&&!force)return;
    const changed=key!==edgeKey;
    edgeKey=key;const request=++epoch;clearTimeout(edgeTimer);if(changed)edges=[];loading=!!shown.length;edgeError=false;graphLayout();
    if(!shown.length)return;
    edgeTimer=setTimeout(()=>void options.edges(shown.map(n=>n.id)).then(value=>{
      if(request!==epoch||!open||!browsing||destroyed)return;
      edges=value;loading=false;graphLayout();
    },()=>{if(request!==epoch||!open||!browsing||destroyed)return;edgeError=true;loading=false;graphLayout();}),70);
  }
  function position() {
    if(!open||destroyed)return;
    root.dataset.navigationMode=innerWidth<800||parseFloat(window.getComputedStyle(root).fontSize)>20?'compact':'docked';
    const path=root.querySelector<SVGPathElement>('.directory-branch path')!,svg=path.ownerSVGElement!;
    const anchor=selected==='all'?$('#all-notes'):$('#folders').querySelector<HTMLElement>('[data-folder="'+(selected??'')+'"]');
    const a=anchor?.getBoundingClientRect(),b=popup.getBoundingClientRect(),r=root.getBoundingClientRect();
    svg.toggleAttribute('hidden',!browsing||!a);svg.setAttribute('viewBox','0 0 '+root.clientWidth+' '+root.clientHeight);
    if(a){const x=a.right-r.left,y=a.top+a.height/2-r.top,end=b.left-r.left+8,mid=(x+end)/2;path.setAttribute('d','M'+x+' '+y+' C'+(mid+18)+' '+(y-28)+','+(mid-18)+' '+(y+44)+','+end+' '+(y+14));}
    updateGraph();
  }
  function layout(){cancelAnimationFrame(frame);frame=requestAnimationFrame(position);}
  function showNotes(){root.dataset.explorerExpanded=String(browsing);popup.hidden=graph.hidden=!open||!browsing;popup.inert=graph.inert=popup.hidden;layout();}
  function focusId(){const el=document.activeElement as HTMLElement;return el?.dataset.folderGraphNote??el?.dataset.note??null;}
  function highlight(value:string|null){highlighted=value;if(value&&!shown.some(n=>n.id===value))updateGraph();else paintHighlight();}
  function folderRow(folder:Folder){return '<button type="button" class="folder-row '+(selected===folder.id?'selected':'')+'" data-folder="'+escape(folder.id)+'" aria-current="'+(selected===folder.id)+'">'+folderIconMarkup(folderAppearance.get(folder.id))+'<span>'+escape(folder.name)+'</span></button>';}
  async function loadParent(page: DirectoryPage) {
    if(!options.parentNotes || page.loading || page.nextCursor===null)return;
    page.loading=true;page.failed=false;renderFolders();
    try {
      const result=await options.parentNotes(page.folder,page.nextCursor);
      if(destroyed||parentPage!==page)return;
      page.items=[...new Map([...page.items,...result.items].map(note=>[note.id,note])).values()];
      page.total=result.total;page.nextCursor=result.nextCursor;
    } catch {if(parentPage===page)page.failed=true;}
    finally {page.loading=false;if(!destroyed&&parentPage===page)renderFolders();}
  }
  function renderFolders() {
    const focused=(document.activeElement as HTMLElement)?.dataset.folder;
    const focusedNote=(document.activeElement as HTMLElement)?.dataset.explorerParentNote;
    const focusedMore=(document.activeElement as HTMLElement)?.hasAttribute('data-parent-more');
    const parent=selected&&selected!=='all'?folders.find(f=>f.id===selected)?.parentId??null:null;
    $('#folders').setAttribute('aria-label',parent?'Parent directory':'Folders');
    if(parentPage?.folder!==parent) {
      parentPage=parent&&options.parentNotes?{folder:parent,items:[],total:0,nextCursor:0,loading:false,failed:false}:null;
      if(parentPage){const page=parentPage;queueMicrotask(()=>{if(parentPage===page&&!destroyed)void loadParent(page);});}
    }
    const files=parentPage;
    $('#folders').innerHTML=(parent?'':'<button type="button" class="folder-row" data-folder="" aria-current="'+(selected===null)+'">'+folderIconMarkup()+'<span>Unfiled</span></button>')+
      folders.filter(f=>(f.parentId??null)===parent||!parent&&f.parentId&&!folders.some(p=>p.id===f.parentId)).map(folderRow).join('')+
      (files?'<p class="parent-files-label">Notes ('+files.items.length+' / '+files.total+')</p>'+files.items.map(n=>'<button type="button" class="folder-row parent-file" data-explorer-parent-note="'+escape(n.id)+'" title="'+escape(n.title||'Untitled')+'"><span aria-hidden="true">·</span><span>'+escape(n.title||'Untitled')+'</span></button>').join('')+(files.loading?'<p class="folder-hint" role="status">Loading notes…</p>':files.nextCursor!==null?'<button type="button" class="folder-row" data-parent-more>'+ (files.failed?'Retry loading notes':'Show more notes')+'</button>':''):'')+
      (folders.length?'':'<p class="folder-hint">Create a folder to organize your notes.</p>');
    children.innerHTML=selected&&selected!=='all'?folders.filter(f=>f.parentId===selected).map(folderRow).join(''):'';
    children.hidden=!children.childElementCount;
    parentButton.hidden=!parent||browsing;
    const parentName=parent?folders.find(f=>f.id===parent)?.name??'parent folder':null;
    parentButton.setAttribute('aria-label','Back to '+(parentName??'folders'));
    text('#navigation-back',parentName?'Back to '+parentName:'Back to folders');
    text('.navigation-heading span',parent?folders.find(f=>f.id===parent)?.name??'Folders':'Browse notes');
    $('#all-notes').setAttribute('aria-current',String(selected==='all'));$('#all-notes').classList.toggle('selected',selected==='all');
    $('#customize-folder').hidden=!selected||selected==='all';
    text('#collection-title',selected==='all'?'All notes':selected===null?'Unfiled':folders.find(f=>f.id===selected)?.name??'Folder');
    if(focused!==undefined||focusedNote||focusedMore){
      restoringFolderFocus=true;
      try{root.querySelector<HTMLElement>(focusedNote?'[data-explorer-parent-note="'+focusedNote+'"]':focusedMore?'[data-parent-more]':'[data-folder="'+focused+'"]')?.focus({preventScroll:true});}
      finally{restoringFolderFocus=false;}
    }
    layout();
  }
  function choose(value:Collection) {
    const backward=folderAncestors(folders,value).length<folderAncestors(folders,selected).length,wasBrowsing=browsing;
    stopMotion();
    if(open&&browsing&&!motion?.matches&&typeof directory.animate==='function'){
      const rect=directory.getBoundingClientRect(),r=root.getBoundingClientRect(),ghost=ghostOf(directory);
      Object.assign(ghost.style,{position:'absolute',left:rect.left-r.left+'px',top:rect.top-r.top+'px',width:rect.width+'px',height:rect.height+'px',zIndex:'3'});
      root.append(ghost);const exit=animate(ghost,[{transform:'translateX(0)',opacity:1},{transform:'translateX('+(backward?'110%':'-110%')+')',opacity:0}]);
      void exit?.finished.catch(()=>{}).finally(()=>{ghost.remove();ghosts.delete(ghost);});
    }
    if(selected!==value){
      if(currentLoaded&&!$<HTMLInputElement>('#search').value&&selected&&selected!=='all'&&folders.find(f=>f.id===value)?.parentId===selected)
        parentPage={folder:selected,items:[...notes],total,nextCursor:currentCursor,loading:false,failed:false};
      currentLoaded=false;notes=[];total=0;edges=[];shown=[];highlighted=null;$('#note-list').replaceChildren();++epoch;clearTimeout(edgeTimer);edgeKey='';layoutKey='';stopGraph();
    }
    selected=value;browsing=true;renderFolders();showNotes();
    animate(directory,[{transform:'translateX('+(backward?'-100%':'100%')+')',opacity:.1},{transform:'translateX(0)',opacity:1}]);
    animate(popup,[{transform:'translateX('+(backward?'-60%':'60%')+')',opacity:0},{transform:'translateX(0)',opacity:1}]);
    if(!wasBrowsing){const ticket=transitionEpoch;requestAnimationFrame(()=>{if(ticket===transitionEpoch)graphArrival();});}
  }
  function back(){
    const parent=selected&&selected!=='all'?folders.find(f=>f.id===selected)?.parentId:null;
    if(parent){choose(parent);options.select(parent);}
    else{choose('all');browsing=false;stopMotion();stopGraph();showNotes();options.select('all');$('#all-notes').focus();}
  }
  $('#navigation-close').onclick=options.close;$('#navigation-back').onclick=back;parentButton.onclick=back;
  $('#collection-new-note').onclick=()=>$('#new-note').click();$('#folder-graph-refresh').onclick=()=>updateGraph(true);
  listen(root,'click',event=>{
    if((event.target as Element).closest('[data-parent-more]')){if(parentPage)void loadParent(parentPage);return;}
    const folder=(event.target as Element).closest<HTMLElement>('[data-folder]');
    if(folder){choose(folder.dataset.folder||null);options.select(selected);return;}
    const target=(event.target as Element).closest<HTMLElement>('[data-folder-graph-note],[data-explorer-parent-note]');
    const id=target?.dataset.folderGraphNote??target?.dataset.explorerParentNote;
    if(id){if((event as MouseEvent).detail&&suppressClick===id){suppressClick=null;return;}suppressClick=null;void options.open(id).then(success=>{if(success){options.close();options.focusEditor();}});}
  });
  listen(root,'focusin',()=>{if(!restoringFolderFocus&&animations.size)stopMotion();});
  listen(root,'keydown',event=>{
    const e=event as KeyboardEvent;if(e.isComposing||document.querySelector('dialog[open]'))return;
    if(e.key==='Escape'){e.preventDefault();options.close();document.querySelector<HTMLElement>('[data-panel-toggle=navigation]')?.focus();return;}
    const target=(e.target as HTMLElement).closest<HTMLElement>('[data-folder]');if(!target)return;
    const buttons=[...target.parentElement!.querySelectorAll<HTMLElement>('[data-folder]')],at=buttons.indexOf(target);
    let next:HTMLElement|undefined;
    if(e.key==='ArrowDown')next=buttons[Math.min(at+1,buttons.length-1)];
    if(e.key==='ArrowUp')next=buttons[Math.max(at-1,0)];
    if(e.key==='Home')next=buttons[0];if(e.key==='End')next=buttons.at(-1);
    if(e.key==='ArrowRight'){e.preventDefault();choose(target.dataset.folder||null);options.select(selected);next=children.querySelector<HTMLElement>('[data-folder]')??undefined;}
    if(e.key==='ArrowLeft'){
      e.preventDefault();
      const parent=folders.find(f=>f.id===target.dataset.folder)?.parentId;
      if(parent){if(parent!==selected){choose(parent);options.select(parent);}next=root.querySelector<HTMLElement>('[data-folder="'+parent+'"]')??undefined;}
      else back();
    }
    if(next){e.preventDefault();next.focus();}
  });
  for(const area of [$('#note-list'),$('#folder-graph-nodes')]){
    for(const name of ['pointerover','focusin'])listen(area,name,event=>{const el=(event.target as Element).closest<HTMLElement>('[data-note],[data-folder-graph-note]');if(el)highlight(el.dataset.note??el.dataset.folderGraphNote??null);});
    for(const name of ['pointerleave','focusout'])listen(area,name,()=>highlight(focusId()));
  }
  listen(canvas,'pointerdown',event=>{
    const e=event as PointerEvent,id=(e.target as Element).closest<HTMLElement>('[data-folder-graph-note]')?.dataset.folderGraphNote;
    if(!id||e.button!==0)return;suppressClick=null;drag={id,pointer:e.pointerId,x:e.clientX,y:e.clientY,moved:false};
  });
  listen(canvas,'pointermove',event=>{
    const e=event as PointerEvent;if(!drag||e.pointerId!==drag.pointer)return;
    const node=nodes.find(n=>n.id===drag!.id),rect=canvas.getBoundingClientRect();if(!node)return;
    drag.moved ||= Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>4;
    if(!drag.moved)return;
    if(!canvas.hasPointerCapture?.(e.pointerId))canvas.setPointerCapture?.(e.pointerId);
    node.fx=node.x=e.clientX-rect.left;node.fy=node.y=e.clientY-rect.top;draw();
    if(!motion?.matches&&simulation){canvas.dataset.simulating='true';simulation.alpha(.35).restart();}
  });
  const endDrag=()=>{if(drag?.moved)suppressClick=drag.id;for(const n of nodes){n.fx=null;n.fy=null;}drag=null;};
  listen(canvas,'pointerup',endDrag);listen(canvas,'pointercancel',endDrag);listen(canvas,'lostpointercapture',endDrag);
  const resize=()=>{
    stopMotion();layout();
    requestAnimationFrame(()=>{
      if(!open||destroyed)return;
      const selectedRow=root.querySelector<HTMLElement>('[data-folder="'+(selected??'')+'"]');
      if(!selectedRow)return;
      for(const container of [$('#folders'),directory]) {
        const bounds=container.getBoundingClientRect(),row=selectedRow.getBoundingClientRect();
        if(row.top<bounds.top)container.scrollTop+=row.top-bounds.top;
        else if(row.bottom>bounds.bottom)container.scrollTop+=row.bottom-bounds.bottom;
      }
    });
  };
  listen(window,'resize',resize);listen(root,'scroll',layout);listen($('#folders'),'scroll',layout);
  listen(document,'visibilitychange',()=>{if(document.hidden){stopGraph();stopMotion();}else{layoutKey='';layout();}});
  if(motion)listen(motion,'change',()=>{stopMotion();stopGraph();layoutKey='';layout();});
  const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(layout);observer?.observe(canvas);observer?.observe(directory);
  showNotes();
  return {
    setOpen(value:boolean){open=value;if(!value){browsing=false;++epoch;clearTimeout(edgeTimer);edgeKey='';layoutKey='';stopGraph();stopMotion();}else{directory.scrollTop=0;renderFolders();}showNotes();},
    setFolders(value:Folder[],collection:Collection){folders=value;selected=collection;renderFolders();},
    choose,showNotes,
    setNotes(value:NoteSummary[],count:number,current:string|null,nextCursor:number|null=null){notes=value;total=count;currentCursor=nextCursor;currentLoaded=true;active=current;highlighted=null;popup.removeAttribute('aria-busy');$('#collection-status').hidden=true;layout();updateGraph(true);},
    loading(){popup.setAttribute('aria-busy','true');$('#collection-status').hidden=false;text('#collection-status','Loading notes in this collection.');},
    failed(){popup.removeAttribute('aria-busy');$('#collection-status').hidden=false;text('#collection-status','Notes could not load. Select the collection again to retry.');},
    noteOpened(){options.close();options.focusEditor();},
    destroy(){destroyed=true;stopMotion();stopGraph();++epoch;clearTimeout(edgeTimer);cancelAnimationFrame(frame);observer?.disconnect();for(const fn of cleanup)fn();},
  };
}

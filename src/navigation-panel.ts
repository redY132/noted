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
}
export function initializeNavigation(root: HTMLElement, options: NavigationOptions) {
  const $ = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const popup = $('#notes-panel'), graph = $('#folder-graph'), canvas = $('#folder-graph-canvas');
  let folders: Folder[] = [], selected: Collection = 'all', notes: NoteSummary[] = [], total = 0;
  let active: string | null = null, highlighted: string | null = null, shown: NoteSummary[] = [], edges: PairState[] = [];
  let open = true, expanded = new Set<string>(), ticket = 0, frame = 0, edgeTimer: ReturnType<typeof setTimeout> | undefined;
  let edgeKey = '', edgeError = false, loading = false;
  let positionsKey = '', positions: { x: number; y: number }[] = [];
  function focusId() {
    const el = document.activeElement as HTMLElement | null;
    return el?.closest<HTMLElement>('[data-note],[data-folder-graph-note]')?.dataset.note ?? el?.closest<HTMLElement>('[data-folder-graph-note]')?.dataset.folderGraphNote ?? null;
  }
  function paintHighlight() {
    const id = highlighted ?? active;
    for (const el of root.querySelectorAll<HTMLElement>('[data-folder-graph-note]')) {
      const match = el.dataset.folderGraphNote === id;
      el.classList.toggle('highlighted', match);
    }
    for (const el of root.querySelectorAll<HTMLElement>('[data-note]')) el.classList.toggle('graph-highlight', el.dataset.note === id);
    $('#folder-graph-caption').textContent = notes.find(n => n.id === id)?.title || (notes.length ? 'Hover or focus a note to locate it.' : 'Create a note to start this collection.');
  }
  function paintGraph() {
    const width = canvas.clientWidth || 300, height = canvas.clientHeight || 300;
    const key = JSON.stringify([width, height, shown.map(n => n.id), edges.map(e => [e.a, e.b])]);
    if (key !== positionsKey) {
      const indices = new Map(shown.map((n, i) => [n.id, i]));
      positions = graphPositions(shown.length, width, height, edges.filter(e => e.connected && indices.has(e.a) && indices.has(e.b)).map(e => ({ a: indices.get(e.a)!, b: indices.get(e.b)! })));
      positionsKey = key;
    }
    const byId = new Map(shown.map((n, i) => [n.id, positions[i]]));
    const svg = canvas.querySelector('svg')!;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.innerHTML = edges.filter(e => e.connected && byId.has(e.a) && byId.has(e.b)).map(e => {
      const a = byId.get(e.a)!, b = byId.get(e.b)!;
      return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`;
    }).join('');
    const focused = focusId();
    $('#folder-graph-nodes').innerHTML = shown.map((n, i) => `<button type="button" class="folder-graph-node" data-folder-graph-note="${escape(n.id)}" data-note-target="${escape(n.id)}" style="left:${positions[i].x}px;top:${positions[i].y}px" aria-label="Open ${escape(n.title || 'Untitled')}" title="${escape(n.title || 'Untitled')}"><span aria-hidden="true"></span></button>`).join('');
    if (focused && document.activeElement === document.body) root.querySelector<HTMLButtonElement>(`[data-folder-graph-note="${focused}"]`)?.focus({ preventScroll: true });
    const count = edges.filter(e => e.connected && byId.has(e.a) && byId.has(e.b)).length;
    $('#folder-graph-summary').textContent = edgeError ? 'Connections could not load. Refresh to retry.' : !notes.length ? 'This collection has no notes yet.' : `${shown.length} of ${total} notes · ${count} saved ${count === 1 ? 'connection' : 'connections'}${loading ? ' · Updating' : ''}`;
    paintHighlight();
  }
  function updateGraph(force = false) {
    if (!open || popup.hidden) return;
    const width = canvas.clientWidth || 300, height = canvas.clientHeight || 300;
    const capacity = graphCapacity(width, height);
    shown = graphWindow(notes, highlighted ?? active, capacity);
    const key = shown.map(n => n.id).join(',');
    paintGraph();
    if (key === edgeKey && !force) return;
    edgeKey = key; const request = ++ticket; clearTimeout(edgeTimer);
    if (!shown.length) { edges = []; loading = false; paintGraph(); return; }
    loading = true; edgeError = false; paintGraph();
    const ids = shown.map(n => n.id);
    edgeTimer = setTimeout(() => {
      void options.edges(ids).then(value => {
        if (request !== ticket || !open || popup.hidden) return;
        edges = value; loading = false; edgeError = false; paintGraph();
      }, () => {
        if (request !== ticket || !open || popup.hidden) return;
        edges = []; loading = false; edgeError = true; paintGraph();
      });
    }, 70);
  }
  function highlight(id: string | null) {
    if (highlighted === id) return;
    highlighted = id;
    if (id && !shown.some(n => n.id === id)) updateGraph(); else paintHighlight();
  }
  function position() {
    if (!open) return;
    const depth = Math.max(0, ...[...root.querySelectorAll<HTMLElement>('[data-folder-depth]')].map(el => Number(el.dataset.folderDepth)));
    root.style.setProperty('--folder-depth-space', `${Math.min(depth, 8) * 6}px`);
    const compact = innerWidth < 800 || parseFloat(window.getComputedStyle(root).fontSize) > 20;
    root.dataset.navigationMode = compact ? 'compact' : 'docked';
    const anchor = selected === 'all' ? $('#all-notes') : root.querySelector<HTMLElement>(`[data-folder="${selected ?? ''}"]`);
    const branch = root.querySelector<SVGSVGElement>('.directory-branch')!, path = branch.querySelector('path')!;
    const rect = root.getBoundingClientRect(), anchorRect = anchor?.getBoundingClientRect(), listRect = $('#note-list').getBoundingClientRect();
    const clip = anchor?.closest('#folders')?.getBoundingClientRect();
    branch.setAttribute('viewBox', `0 0 ${root.clientWidth} ${root.clientHeight}`);
    const hidden = compact || !anchorRect || !!clip && (anchorRect.bottom <= clip.top || anchorRect.top >= clip.bottom);
    branch.toggleAttribute('hidden', hidden);
    if (!hidden && anchorRect) {
      const x = anchorRect.right - rect.left, y = Math.max(clip?.top ?? 0, Math.min(anchorRect.top + anchorRect.height / 2, clip?.bottom ?? innerHeight)) - rect.top;
      const endX = listRect.left - rect.left + 12, endY = listRect.top - rect.top + 1, turnX = (x + endX) / 2;
      path.setAttribute('d', `M${x} ${y}H${turnX}V${endY}H${endX}`);
    }
    updateGraph();
  }
  function layout() { cancelAnimationFrame(frame); frame = requestAnimationFrame(position); }
  function resizeLayout() {
    layout();
    requestAnimationFrame(() => {
      if (!open) return;
      root.querySelector<HTMLElement>(selected === 'all' ? '#all-notes' : `[data-folder="${selected ?? ''}"]`)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    });
  }
  function showNotes() {
    if (!open) return;
    popup.hidden = graph.hidden = false; popup.inert = graph.inert = false;
    layout();
  }
  function hideNotes() {
    popup.hidden = graph.hidden = true; popup.inert = graph.inert = true;
    ++ticket; clearTimeout(edgeTimer); edgeKey = ''; loading = false;
    if (popup.contains(document.activeElement) || graph.contains(document.activeElement)) options.focusEditor();
  }
  function renderFolders() {
    const focused = (document.activeElement as HTMLElement | null)?.dataset.folder;
    const seen = new Set<string>();
    function row(folder: Folder, depth: number): string {
      if (seen.has(folder.id)) return ''; seen.add(folder.id);
      const children = folders.filter(f => f.parentId === folder.id), expandedHere = expanded.has(folder.id);
      return `<div class="folder-branch" data-folder-depth="${depth}" style="--depth:${Math.min(depth, 8)}"><div class="folder-line"><button type="button" class="folder-disclosure" data-folder-expand="${folder.id}" aria-label="${expandedHere ? 'Collapse' : 'Expand'} ${escape(folder.name)}" aria-expanded="${expandedHere}" ${children.length ? '' : 'disabled'}><span aria-hidden="true">${children.length ? expandedHere ? '⌄' : '›' : ''}</span></button><button type="button" class="folder-row ${selected === folder.id ? 'selected' : ''}" data-folder="${folder.id}" aria-current="${selected === folder.id}" title="${escape(folder.name)}">${folderIconMarkup(folderAppearance.get(folder.id))}<span>${escape(folder.name)}</span></button></div>${expandedHere ? children.map(f => row(f, depth + 1)).join('') : ''}</div>`;
    }
    $('#folders').innerHTML = `<button type="button" class="folder-row unfiled ${selected === null ? 'selected' : ''}" data-folder="" aria-current="${selected === null}">${folderIconMarkup()}<span>Unfiled</span></button>${folders.filter(f => !f.parentId || !folders.some(p => p.id === f.parentId)).map(f => row(f, 0)).join('')}${folders.length ? '' : '<p class="folder-hint">Create a folder to organize your notes.</p>'}`;
    $('#all-notes').setAttribute('aria-current', String(selected === 'all'));
    $('#all-notes').classList.toggle('selected', selected === 'all');
    $('#customize-folder').hidden = !selected || selected === 'all';
    $('#collection-title').textContent = selected === 'all' ? 'All notes' : selected === null ? 'Unfiled' : folders.find(f => f.id === selected)?.name ?? 'Folder';
    if (focused !== undefined) root.querySelector<HTMLButtonElement>(`[data-folder="${focused}"]`)?.focus({ preventScroll: true });
    layout();
  }
  $('#navigation-close').onclick = options.close;
  $('#navigation-back').onclick = () => { root.scrollTop = 0; root.querySelector<HTMLButtonElement>(selected && selected !== 'all' ? `[data-folder="${selected}"]` : '#all-notes')?.focus(); };
  $('#collection-new-note').onclick = () => $('#new-note').click();
  $('#folder-graph-refresh').onclick = () => updateGraph(true);
  function chooseCollection(value: Collection) {
    if (selected !== value) {
      notes = []; total = 0; edges = []; highlighted = null; edgeKey = '';
      $('#note-list').replaceChildren();
    }
    selected = value;
    for (const id of folderAncestors(folders, selected)) expanded.add(id);
    renderFolders(); showNotes();
  }
  $('#folders').addEventListener('click', event => {
    const target = (event.target as Element).closest<HTMLButtonElement>('[data-folder],[data-folder-expand]');
    if (!target) return;
    if (target.dataset.folderExpand) {
      const id = target.dataset.folderExpand;
      if (expanded.has(id)) expanded.delete(id); else expanded.add(id);
      renderFolders(); root.querySelector<HTMLButtonElement>(`[data-folder-expand="${id}"]`)?.focus({ preventScroll: true });
    } else {
      chooseCollection(target.dataset.folder || null); options.select(selected);
    }
  });
  $('#folders').addEventListener('keydown', event => {
    const target = (event.target as Element).closest<HTMLButtonElement>('[data-folder]');
    if (!target) return;
    const buttons = [...root.querySelectorAll<HTMLButtonElement>('[data-folder]')], at = buttons.indexOf(target), id = target.dataset.folder;
    let next: HTMLButtonElement | undefined;
    if (event.key === 'ArrowDown') next = buttons[Math.min(buttons.length - 1, at + 1)];
    if (event.key === 'ArrowUp') next = buttons[Math.max(0, at - 1)];
    if (event.key === 'Home') next = buttons[0];
    if (event.key === 'End') next = buttons.at(-1);
    if (event.key === 'ArrowRight' && id) {
      event.preventDefault();
      if (!expanded.has(id)) { expanded.add(id); renderFolders(); next = root.querySelector<HTMLButtonElement>(`[data-folder="${id}"]`) ?? undefined; }
      else { const child = folders.find(f => f.parentId === id); if (child) next = root.querySelector<HTMLButtonElement>(`[data-folder="${child.id}"]`) ?? undefined; }
    }
    if (event.key === 'ArrowLeft' && id) {
      event.preventDefault();
      if (expanded.has(id)) { expanded.delete(id); renderFolders(); next = root.querySelector<HTMLButtonElement>(`[data-folder="${id}"]`) ?? undefined; }
      else { const parent = folders.find(f => f.id === id)?.parentId; if (parent) next = root.querySelector<HTMLButtonElement>(`[data-folder="${parent}"]`) ?? undefined; }
    }
    if (next) { event.preventDefault(); next.focus(); }
  });
  for (const name of ['pointerover', 'focusin']) $('#note-list').addEventListener(name, event => {
    const row = (event.target as Element).closest<HTMLElement>('.note-card-shell');
    if (row) highlight(row.querySelector<HTMLElement>('[data-note]')?.dataset.note ?? null);
  });
  for (const name of ['pointerleave', 'focusout']) $('#note-list').addEventListener(name, () => highlight(focusId()));
  $('#folder-graph-nodes').addEventListener('pointerover', event => highlight((event.target as Element).closest<HTMLElement>('[data-folder-graph-note]')?.dataset.folderGraphNote ?? null));
  $('#folder-graph-nodes').addEventListener('focusin', event => highlight((event.target as Element).closest<HTMLElement>('[data-folder-graph-note]')?.dataset.folderGraphNote ?? null));
  for (const name of ['pointerleave', 'focusout']) $('#folder-graph-nodes').addEventListener(name, () => highlight(focusId()));
  $('#folder-graph-nodes').addEventListener('click', event => {
    const id = (event.target as Element).closest<HTMLElement>('[data-folder-graph-note]')?.dataset.folderGraphNote;
    if (id) void options.open(id).then(success => { if (success) options.focusEditor(); });
  });
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !document.querySelector('dialog[open]')) {
      event.preventDefault(); options.close(); document.querySelector<HTMLElement>('[data-panel-toggle=navigation]')?.focus();
    }
  });
  $('#folders').addEventListener('scroll', layout);
  root.querySelector('.navigation-tree')!.addEventListener('scroll', layout);
  popup.addEventListener('scroll', layout);
  window.addEventListener('resize', resizeLayout);
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(layout);
  observer?.observe(root.querySelector('.navigation-tree')!); observer?.observe(popup); observer?.observe(canvas);
  return {
    setOpen(value: boolean) { if (open === value) return; open = value; if (open) showNotes(); else hideNotes(); },
    setFolders(value: Folder[], collection: Collection) { folders = value; selected = collection; for (const id of folderAncestors(folders, selected)) expanded.add(id); renderFolders(); },
    showNotes,
    choose: chooseCollection,
    setNotes(value: NoteSummary[], count: number, current: string | null) { notes = value; total = count; active = current; highlighted = null; edgeKey = ''; popup.removeAttribute('aria-busy'); $('#collection-status').hidden = true; layout(); },
    loading() { popup.setAttribute('aria-busy', 'true'); $('#collection-status').hidden = false; $('#collection-status').textContent = 'Loading notes in this collection.'; },
    failed() { popup.removeAttribute('aria-busy'); $('#collection-status').hidden = false; $('#collection-status').textContent = 'Notes could not load. Select the collection again to retry.'; },
    noteOpened() { options.focusEditor(); },
    destroy() { observer?.disconnect(); window.removeEventListener('resize', resizeLayout); clearTimeout(edgeTimer); cancelAnimationFrame(frame); ++ticket; },
  };
}

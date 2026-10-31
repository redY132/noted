import { Editor, getSchema } from '@tiptap/core';
import { createEditorExtensions } from './editor-extensions';
import { editingMarkup, initializeEditingUI } from './editing-ui';
import { api, browserPreview } from './api';
import { NoteSession, type Folder, type Note, type NoteSummary, type SchemaId } from './model';
import { installMetrics } from './metrics';
import { openUrl } from '@tauri-apps/plugin-opener';
import { noteLinkTarget } from './note-links';
import { componentMarkup, initializeComponentUI } from './component-ui';
import './style.css';
import './editing.css';
import './components.css';
import './component-motion.css';
import { connectionHandle, connectionsMarkup, initializeConnectionsUI } from './connections-ui';
import './connections-ui.css';
import { initializeSemanticControls } from './semantic-controls';
import { initializeAppearance } from './appearance';
import { applyLayoutPreferences, initializeShell, readLayout, shellTopbar, shellPopovers } from './shell-ui';
import './shell-ui.css';
import './shell-motion.css';
import './theme.css';

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const escape = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const appearance = initializeAppearance();
const initialLayout = readLayout();
applyLayoutPreferences(initialLayout);
const schemaControl = editingMarkup.match(/<label class="schema-control">[\s\S]*?<\/label>/)?.[0] ?? '';
const formattingMarkup = editingMarkup.replace(schemaControl,'').replace('<div class="formatbar"','<div id="formatting-tools" class="formatbar"');
$('#app').innerHTML = `
  <aside id="navigation-panel" class="sidebar" aria-label="Workspace navigation">
    <button class="primary" id="new-note"><span>＋</span> New note <kbd>Ctrl N</kbd></button>
    <nav class="navigation"><button class="nav-item selected" id="all-notes"><span>▤</span> All notes <small id="total-count">0</small></button><button class="nav-item" id="daily-note"><span>◷</span> Today’s note</button></nav>
    <div class="section-label">YOUR FOLDERS<button id="add-folder" aria-label="Create folder" title="Create folder">＋</button></div>
    <div id="folders" class="folders"></div>
    <div class="sidebar-bottom"><span class="local-dot"></span><span id="workspace-label">Local workspace</span><button id="workspace-info" aria-label="Workspace details" title="Workspace details">ⓘ</button></div>
  </aside>
  <section id="notes-panel" class="note-list-panel" aria-label="Notes">
    <header class="list-heading"><div><h1 id="collection-title">All notes</h1></div><span class="count-pill" id="list-count">0</span></header>
    <label class="search-box"><span aria-hidden="true">⌕</span><input id="search" type="search" placeholder="Search your notes…" aria-label="Search notes" /><kbd>/</kbd></label>
    <div class="list-subheading"><span id="list-description">Recently written</span><span>↓</span></div>
    <div id="note-list" class="note-list"></div>
  </section>
  <main class="workspace">
    ${shellTopbar}
    <div id="error-banner" class="error-banner" role="alert" hidden><span id="error-message"></span><div><button id="retry-save">Retry save</button><button id="download-draft">Download draft</button><button id="dismiss-error" aria-label="Dismiss message">×</button></div></div>
    <section id="empty-state" class="empty-state"><h2>No note open</h2><p>Create a note or choose one from the list.</p><button id="empty-new" class="primary">Create note</button></section>
    <section id="note-pane" class="note-pane" hidden>
      ${formattingMarkup}
      ${componentMarkup.replace('<div class="component-toolbar"','<div id="layout-tools" class="component-toolbar"')}
      <div class="document-scroll"><article class="document" data-schema="default"><div id="note-kicker" class="document-kicker"><span id="note-date"></span></div><input id="note-title" class="note-title" aria-label="Note title" placeholder="Untitled" maxlength="300" /><div id="note-details" class="note-properties">${schemaControl}<label><span>Folder</span><select id="note-folder" aria-label="Move note to folder"></select></label><label class="tag-field"><span>Tags</span><input id="note-tags" aria-label="Note tags, separated by commas" placeholder="Add tags, separated by commas" /></label></div><div id="editor"></div></article></div>
      <footer id="note-footer" class="editor-footer"><span id="word-count">0 words</span><span id="revision-label"></span></footer>
    </section>
  </main>
  ${connectionsMarkup}
  ${shellPopovers}
  <dialog id="folder-dialog"><form id="folder-form"><h2>New folder</h2><label>Folder name<input id="folder-name" required maxlength="100" autocomplete="off" /></label><label>Inside<select id="folder-parent"></select></label><div class="dialog-actions"><button type="button" data-close="folder-dialog">Cancel</button><button type="submit" class="primary">Create folder</button></div></form></dialog>
  <dialog id="link-dialog"><h2>Link to a note</h2><p class="dialog-description">Links keep their destination when notes are renamed or moved.</p><label class="search-box"><input id="link-search" type="search" aria-label="Find a note to link" placeholder="Find a note…" /></label><div id="link-results" class="link-results"></div><div class="dialog-actions"><button data-close="link-dialog">Cancel</button></div></dialog>
  <dialog id="workspace-dialog"><h2>Workspace</h2><p id="workspace-path" class="workspace-path"></p><p class="dialog-description">This prototype uses no cloud AI, telemetry, remote fonts, or remote assets. The desktop search index can be rebuilt from your note files.</p><div class="dialog-actions"><button id="rebuild-index">Rebuild search index</button><button data-close="workspace-dialog">Close</button></div></dialog>`;

let folders: Folder[] = [];
let notes: NoteSummary[] = [];
let workspaceTotal = 0;
let selectedFolder: string | null | 'all' = 'all';
let session: NoteSession | null = null;
let editor: Editor | null = null;
let navigating = false;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let countTimer: ReturnType<typeof setTimeout> | undefined;
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let searchGeneration = 0;
let saveError = false;
let workspaceWarningKey = '';
let linkSelection: { from: number; to: number } | null = null;
let listCursor: number | null = null;
let loadedList: NoteSummary[] = [];
let listRefreshTimer: ReturnType<typeof setTimeout> | undefined;
let deferredListReset = false;
let indexPollTimer: ReturnType<typeof setTimeout> | undefined;
let inlineLinkNotes = new Map<string, NoteSummary>();
let inlineSearchGeneration = 0;
const editorExtensions = () => createEditorExtensions(() => session?.note.presentation.schemaId ?? 'default');
const editingUI = initializeEditingUI({ getEditor: () => editor, getSchema: () => session?.note.presentation.schemaId ?? 'default', error });
const componentUI = initializeComponentUI({ getEditor: () => editor, getNoteId: () => session?.note.id ?? null, importAsset: (id, file) => api.importAsset(id, file), error });
const shell = initializeShell({appearance,getEditor:()=>editor,newNote:()=>void newNote(),workspace:()=>$<HTMLDialogElement>('#workspace-dialog').showModal(),closeTransient:()=>connectionsUI.close()},initialLayout);
const connectionsUI = initializeConnectionsUI({api,current:()=>session?.note ?? null,open:async id=>{await openNote(id);return session?.note.id===id;},folder:folderPath,error});
initializeSemanticControls({current:()=>session?.note.id??null,changed:()=>void connectionsUI.refresh(),error});
let releaseAssets = () => {};
const documentSchema = getSchema(editorExtensions());
function validateEditorDocument(note: Note) {
  const checkAttributes = (node: import('@tiptap/core').JSONContent) => {
    const type = documentSchema.nodes[node.type ?? ''];
    if (!type) throw new Error(`Unsupported document element: ${node.type}. The existing note is kept open.`);
    for (const name of Object.keys(node.attrs ?? {})) {
      if (!(name in (type.spec.attrs ?? {}))) throw new Error(`Unsupported ${node.type} attribute: ${name}. This file needs a compatible editor.`);
    }
    for (const mark of node.marks ?? []) {
      const markType = documentSchema.marks[mark.type];
      if (!markType) throw new Error(`Unsupported formatting: ${mark.type}.`);
      for (const name of Object.keys(mark.attrs ?? {})) if (!(name in (markType.spec.attrs ?? {}))) throw new Error(`Unsupported ${mark.type} attribute: ${name}.`);
    }
    for (const child of node.content ?? []) checkAttributes(child);
  };
  if (note.content.type !== 'doc') throw new Error('The note has no valid document root. It has not been changed.');
  checkAttributes(note.content);
  documentSchema.nodeFromJSON(note.content).check();
}

if (browserPreview) { $('#preview-badge').hidden = false; $('#workspace-label').textContent = 'Browser preview'; }
function error(reason: unknown, saving = false) {
  saveError ||= saving;
  $('#error-message').textContent = String(reason instanceof Error ? reason.message : reason);
  $('#error-banner').hidden = false;
  $('#retry-save').hidden = !session?.dirty;
  $('#download-draft').hidden = !session;
  updateSaveState();
}
function updateSaveState() {
  $('#save-state').textContent = saveError ? 'Not saved · draft kept open' : session?.saving ? 'Saving…' : session?.dirty ? 'Unsaved changes' : session ? '✓ Saved on this device' : 'Ready';
  $('#save-state').classList.toggle('save-error', saveError);
  if (session) $('#revision-label').textContent = `Revision ${session.note.revision}`;
}
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { void flush().catch(() => {}); }, 650);
}
async function flush() {
  clearTimeout(saveTimer);
  if (!session) return;
  const wroteChanges = session.dirty || session.saving;
  try {
    await session.flush();
    saveError = false;
    updateSaveState();
    const changed = upsertSummary(session.note);
    if (changed || $<HTMLInputElement>('#search').value.trim()) await renderList();
  } catch (reason) { error(reason, true); throw reason; }
  // A committed note remains saved if derived-index work or diagnostics fail.
  // Status is cheap metadata, and is fetched only after an actual save.
  if (wroteChanges) { connectionsUI.committed(); await refreshWorkspaceWarnings(); }
}
async function refreshWorkspaceWarnings() {
  try {
    const status = await api.status();
    $('#workspace-path').textContent = status.path;
    const key = status.warnings.join('\n');
    if (key && key !== workspaceWarningKey) error(key);
    workspaceWarningKey = key;
  } catch (reason) {
    error(`Your note was saved, but workspace diagnostics could not be refreshed: ${String(reason instanceof Error ? reason.message : reason)}`);
  }
}
function watchIndex() {
  clearTimeout(indexPollTimer);
  indexPollTimer = setTimeout(async () => {
    try {
      const status=await api.status();
      await renderList();
      if (!session && !navigating && loadedList.length) await openNote(loadedList[0].id);
      if (status.indexing) {
        $('#list-description').textContent='Indexing saved notes…';
        watchIndex();
      } else {
        $('#rebuild-index').textContent='Rebuild search index';
        connectionsUI.changed();
      }
    } catch (reason) { error(reason); }
  },1000);
}
function edit(update: (note: Note) => void) {
  if (!session || navigating) return;
  session.edit(update);
  scheduleSave();
}
function upsertSummary(note: NoteSummary) {
  const { id, title, folderId, tags, revision, createdAt, updatedAt } = note;
  const summary = { id, title, folderId, tags: [...tags], revision, createdAt, updatedAt };
  const index = notes.findIndex(n => n.id === id);
  const previous = notes[index];
  const changed = !previous || previous.title !== title || previous.folderId !== folderId || previous.tags.join('\0') !== tags.join('\0');
  if (index < 0) notes.push(summary); else notes[index] = summary;
  return changed;
}
function folderPath(id: string | null): string {
  const names: string[] = [];
  const seen = new Set<string>();
  while (id && !seen.has(id)) {
    seen.add(id); const folder = folders.find(f => f.id === id); if (!folder) break;
    names.unshift(folder.name); id = folder.parentId;
  }
  return names.join(' / ') || 'Unfiled';
}
function folderOptions() { return `<option value="">Unfiled</option>${folders.map(f => `<option value="${escape(f.id)}">${escape(folderPath(f.id))}</option>`).join('')}`; }
function renderFolders() {
  const roots = folders.filter(f => !f.parentId || !folders.some(p => p.id === f.parentId));
  const seen = new Set<string>();
  const row = (folder: Folder, depth: number): string => {
    if (seen.has(folder.id)) return ''; seen.add(folder.id);
    return `<button class="folder-row ${selectedFolder === folder.id ? 'selected' : ''}" data-folder="${escape(folder.id)}" style="--depth:${Math.min(depth, 8)}"><span aria-hidden="true">▱</span><span>${escape(folder.name)}</span></button>${folders.filter(f => f.parentId === folder.id).map(f => row(f, depth + 1)).join('')}`;
  };
  $('#folders').innerHTML = `<button class="folder-row ${selectedFolder === null ? 'selected' : ''}" data-folder=""><span>▱</span><span>Unfiled</span></button>${roots.map(f => row(f, 0)).join('')}${folders.length === 0 ? '<p class="folder-hint">Give your ideas a home.<br>Create your first folder above.</p>' : ''}`;
  $('#note-folder').innerHTML = folderOptions();
  if (session) $<HTMLSelectElement>('#note-folder').value = session.note.folderId ?? '';
}
async function renderList(reset = true) {
  if (connectionsUI.isDragging()) {
    deferredListReset ||= reset;
    clearTimeout(listRefreshTimer);
    listRefreshTimer = setTimeout(() => { const pendingReset=deferredListReset; deferredListReset=false; void renderList(pendingReset); },100);
    return;
  }
  const generation = ++searchGeneration;
  const query = $<HTMLInputElement>('#search').value.trim();
  let page;
  try {
    page = await api.pageNotes(query, selectedFolder === 'all' ? undefined : selectedFolder ?? '', reset ? 0 : listCursor ?? 0, 80);
    const countPage = !query && selectedFolder === 'all' ? page : await api.pageNotes('',undefined,0,1);
    if(generation===searchGeneration) {workspaceTotal=countPage.total;$('#total-count').textContent=String(workspaceTotal);}
  }
  catch (reason) { if (generation === searchGeneration) error(reason); return; }
  if (generation !== searchGeneration) return;
  if (connectionsUI.isDragging()) { void renderList(reset); return; }
  loadedList = reset ? page.items : [...loadedList, ...page.items];
  listCursor = page.nextCursor;
  for (const note of page.items) upsertSummary(note);
  $('#list-count').textContent = String(page.total);
  $('#collection-title').textContent = selectedFolder === 'all' ? 'All notes' : selectedFolder === null ? 'Unfiled' : folders.find(f => f.id === selectedFolder)?.name ?? 'Folder';
  $('#list-description').textContent = query ? 'Matching notes' : 'Recently written';
  $('#note-list').innerHTML = loadedList.map(n => `<div class="note-card-shell" data-note-target="${escape(n.id)}"><button type="button" class="note-card ${session?.note.id === n.id ? 'active' : ''}" data-note="${escape(n.id)}"><span class="note-card-title">${escape(n.title || 'Untitled')}</span><span class="note-card-location">${escape(folderPath(n.folderId))}</span><span class="note-card-bottom"><time>${new Date(n.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</time><span>${n.tags.slice(0, 2).map(t => `#${escape(t)}`).join(' ')}</span></span></button>${connectionHandle(n.id,n.title)}</div>`).join('') || `<div class="list-empty"><p>${query ? 'No matching notes.' : 'No notes.'}</p><small>${query ? 'Try a different word or folder.' : 'Create a note from the View menu.'}</small></div>`;
  if (listCursor !== null) $('#note-list').insertAdjacentHTML('beforeend', `<button class="show-more" id="show-more">Show more notes</button>`);
}
function refreshMetadata() {
  if (!session) return;
  const note = session.note;
  $<HTMLInputElement>('#note-title').value = note.title;
  $<HTMLInputElement>('#note-tags').value = note.tags.join(', ');
  $<HTMLSelectElement>('#note-folder').value = note.folderId ?? '';
  $<HTMLSelectElement>('#schema').value = note.presentation.schemaId;
  $('.document').dataset.schema = note.presentation.schemaId;
  $('.document').dataset.noteTarget = note.id;
  $('#breadcrumb').textContent = `${folderPath(note.folderId)}  /  ${note.title || 'Untitled'}`;
  $('#header-connection-handle').innerHTML = connectionHandle(note.id,note.title);
  $('#breadcrumb').dataset.noteTarget = note.id;
  $('#note-date').textContent = new Date(note.createdAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase();
}
function wordCount() {
  const text = editor?.getText().trim() ?? '';
  const count = text ? text.split(/\s+/u).length : 0;
  $('#word-count').textContent = `${count.toLocaleString()} ${count === 1 ? 'word' : 'words'}`;
}
function showNote(note: Note) {
  validateEditorDocument(note);
  editor?.destroy();
  releaseAssets();
  const assetURLs = new Map<string, Promise<string>>();
  let disposed = false;
  releaseAssets = () => { disposed = true; for (const url of assetURLs.values()) void url.then(value => api.releaseAssetUrl(value), () => {}); assetURLs.clear(); };
  const resolveAsset = (assetId: string) => {
    let url = assetURLs.get(assetId);
    if (!url) { url = api.assetUrl(note.id, assetId).then(value => { if (disposed) api.releaseAssetUrl(value); return value; }); assetURLs.set(assetId, url); }
    return url;
  };
  session = new NoteSession(note, api.save, updateSaveState, n => { if (editor) n.content = editor.getJSON(); });
  saveError = false;
  $('#empty-state').hidden = true;
  $('#note-pane').hidden = false;
  refreshMetadata();
  editor = new Editor({
    element: $('#editor'), content: note.content,
    extensions: createEditorExtensions(() => session?.note.presentation.schemaId ?? 'default', { resolveAsset }), editable: !navigating,
    editorProps: { attributes: { 'aria-label': 'Note content', role: 'textbox', 'aria-multiline': 'true', spellcheck: 'true' } },
    onSelectionUpdate: ({ editor: current }) => { editingUI.sync(current); componentUI.sync(); },
    onTransaction: ({ editor: current, transaction }) => { editingUI.sync(current, transaction.docChanged); componentUI.sync(); },
    onUpdate: () => { edit(() => {}); clearTimeout(countTimer); countTimer = setTimeout(wordCount, 500); },
  });
  wordCount(); updateSaveState(); editingUI.sync(); editingUI.reset(); componentUI.sync(); connectionsUI.changed(); void renderList();
}
async function navigate(action: () => Promise<Note>) {
  if (navigating) return;
  navigating = true;
  $('#note-pane').inert = true;
  editor?.setEditable(false, false);
  try { await flush(); const note = await action(); upsertSummary(note); showNote(note); }
  catch (reason) { error(reason); }
  finally { navigating = false; $('#note-pane').inert = false; editor?.setEditable(true, false); editingUI.sync(); componentUI.sync(); }
}
async function openNote(id: string) { if (session?.note.id === id) return; await navigate(() => api.load(id)); }
async function newNote() { await navigate(() => api.createNote('Untitled', selectedFolder === 'all' ? null : selectedFolder)); $<HTMLInputElement>('#note-title').focus(); $<HTMLInputElement>('#note-title').select(); }
async function dailyNote() {
  const now = new Date(); const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  // Reconciliation can still be discovering an externally imported daily note.
  const status = await api.status();
  if (status.indexing) { error('Notes are still being indexed. Try opening today’s note again when indexing completes.'); return; }
  let existing: NoteSummary | undefined;
  let cursor: number | null = 0;
  do {
    const page = await api.pageNotes(`daily:${date}`,undefined,cursor,40);
    existing = page.items.find(note=>note.tags.includes(`daily:${date}`));
    cursor=page.nextCursor;
  } while (!existing && cursor!==null);
  if (existing) { await openNote(existing.id); return; }
  await navigate(async () => {
    let folder = folders.find(f => f.name === 'Daily notes' && f.parentId === null);
    if (!folder) { folder = await api.createFolder('Daily notes', null); folders.push(folder); renderFolders(); }
    const note = await api.createNote(now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }), folder.id);
    note.tags = ['daily', `daily:${date}`];
    return api.save(note, note.revision);
  });
}
async function linkResults() {
  const note = session?.note; if (!note) return;
  const generation = ++inlineSearchGeneration;
  try {
    const page = await api.picker(note.id, $<HTMLInputElement>('#link-search').value, 0, 40);
    if (generation !== inlineSearchGeneration || session?.note.id !== note.id) return;
    inlineLinkNotes = new Map(page.items.map(entry=>[entry.note.id,entry.note]));
    $('#link-results').innerHTML = page.items.map(({note:n}) => `<button data-link="${escape(n.id)}" data-note-target="${escape(n.id)}"><span>${escape(n.title || 'Untitled')}</span><small>${escape(folderPath(n.folderId))}</small></button>`).join('') || '<p class="dialog-description">No other notes found. Try another title, folder, or tag.</p>';
  } catch(reason) { if(generation===inlineSearchGeneration)error(reason); }
}

// ProseMirror's handleClick can run from its mouseup processing, before the
// browser dispatches the actual anchor click. Cancel that DOM click itself so
// WebView2 never attempts to launch a noted:// URL in an external application.
// Leave mousedown untouched: caret positioning and drag selection remain native.
function interceptEditorLink(event: MouseEvent) {
  const anchor = (event.target instanceof Element ? event.target : null)?.closest('a');
  if (!anchor || !$('#editor').contains(anchor)) return;
  event.preventDefault();
  // Clicking an image selects it for editing; Ctrl/Cmd-click follows its link.
  if (anchor.closest('.local-image') && !event.ctrlKey && !event.metaKey) return;
  event.stopPropagation();
  if (event.type !== 'click' || event.button !== 0 || event.shiftKey || navigating) return;
  if (window.getSelection()?.isCollapsed === false) return;
  const target = noteLinkTarget(anchor.getAttribute('href'));
  if (!target) { error('This link is not a supported note or web address.'); return; }
  if (target.kind === 'note') void openNote(target.destination);
  else if (browserPreview) window.open(target.destination, '_blank', 'noopener,noreferrer');
  else void openUrl(target.destination).catch(error);
}
$('#editor').addEventListener('click', interceptEditorLink, { capture: true });
$('#editor').addEventListener('auxclick', interceptEditorLink, { capture: true });

$('#new-note').onclick = () => { void newNote(); };
$('#empty-new').onclick = () => { void newNote(); };
$('#daily-note').onclick = () => { void dailyNote().catch(error); };
$('#all-notes').onclick = () => { selectedFolder = 'all'; $('#all-notes').classList.add('selected'); renderFolders(); void renderList(); };
$('#folders').onclick = event => { const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-folder]'); if (!button) return; selectedFolder = button.dataset.folder || null; $('#all-notes').classList.remove('selected'); renderFolders(); void renderList(); };
$('#note-list').onclick = event => { if ((event.target as HTMLElement).closest('#show-more')) { void renderList(false); return; } const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-note]'); if (button) void openNote(button.dataset.note!); };
$('#search').oninput = () => { clearTimeout(searchTimer); searchGeneration++; searchTimer = setTimeout(() => { void renderList(); }, 180); };
$('#note-title').oninput = () => { const title = $<HTMLInputElement>('#note-title').value; edit(n => { n.title = title; }); const handle=$<HTMLButtonElement>('#header-connection-handle [data-connect-source]'); handle.dataset.sourceTitle=title || 'Untitled'; handle.setAttribute('aria-label','Connections for '+(title || 'Untitled')); $('#breadcrumb').textContent = `${folderPath(session!.note.folderId)}  /  ${title || 'Untitled'}`; };
$('#note-tags').oninput = () => { const tags = [...new Set($<HTMLInputElement>('#note-tags').value.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean))]; edit(n => { n.tags = tags; }); };
$('#note-folder').onchange = () => { edit(n => { n.folderId = $<HTMLSelectElement>('#note-folder').value || null; }); $('#breadcrumb').textContent = `${folderPath(session!.note.folderId)}  /  ${session!.note.title || 'Untitled'}`; };
$('#schema').onchange = () => { const schemaId = $<HTMLSelectElement>('#schema').value as SchemaId; edit(n => { n.presentation.schemaId = schemaId; }); $('.document').dataset.schema = schemaId; editingUI.sync(); };
$('#add-folder').onclick = () => { $('#folder-parent').innerHTML = `<option value="">Workspace root</option>${folders.map(f => `<option value="${escape(f.id)}">${escape(folderPath(f.id))}</option>`).join('')}`; $<HTMLSelectElement>('#folder-parent').value = selectedFolder === 'all' ? '' : selectedFolder ?? ''; $<HTMLInputElement>('#folder-name').value = ''; $<HTMLDialogElement>('#folder-dialog').showModal(); };
$('#folder-form').onsubmit = async event => {
  event.preventDefault();
  const button = $<HTMLButtonElement>('#folder-form button[type="submit"]'); button.disabled = true;
  try { folders.push(await api.createFolder($<HTMLInputElement>('#folder-name').value.trim(), $<HTMLSelectElement>('#folder-parent').value || null)); renderFolders(); $<HTMLDialogElement>('#folder-dialog').close(); }
  catch (reason) { error(reason); }
  finally { button.disabled = false; }
};
$('#insert-link').onclick = () => { if (!editor) return; linkSelection = { from: editor.state.selection.from, to: editor.state.selection.to }; $<HTMLInputElement>('#link-search').value = ''; linkResults(); $<HTMLDialogElement>('#link-dialog').showModal(); };
$('#link-search').oninput = linkResults;
$('#link-results').onclick = event => {
  const target = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-link]');
  const note = inlineLinkNotes.get(target?.dataset.link ?? '');
  if (!note || !editor || !linkSelection) return;
  const href = `noted://note/${note.id}`;
  if (linkSelection.from === linkSelection.to) editor.chain().focus().insertContentAt(linkSelection, { type: 'text', text: note.title || 'Untitled', marks: [{ type: 'link', attrs: { href } }] }).run();
  else editor.chain().focus().setTextSelection(linkSelection).setLink({ href }).run();
  $<HTMLDialogElement>('#link-dialog').close();
};
document.querySelectorAll<HTMLButtonElement>('[data-close]').forEach(button => { button.onclick = () => $<HTMLDialogElement>(`#${button.dataset.close}`).close(); });
$('#dismiss-error').onclick = () => { $('#error-banner').hidden = true; };
$('#retry-save').onclick = () => { void flush().then(() => { $('#error-banner').hidden = true; }).catch(() => {}); };
$('#download-draft').onclick = () => {
  if (!session) return;
  if (editor) session.note.content = editor.getJSON();
  const url = URL.createObjectURL(new Blob([JSON.stringify(session.note, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${session.note.id}.draft.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$('#workspace-info').onclick = () => { $<HTMLDialogElement>('#workspace-dialog').showModal(); };
const exportConnectionsButton=document.createElement('button');
exportConnectionsButton.type='button';exportConnectionsButton.id='export-connections';exportConnectionsButton.textContent='Export connections';
$('#workspace-dialog .dialog-actions').prepend(exportConnectionsButton);
exportConnectionsButton.onclick=async()=>{
  exportConnectionsButton.disabled=true;
  try {
    const snapshot=await api.exportRelations();
    const url=URL.createObjectURL(new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='noted-connections.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  } catch(reason) {error(reason);} finally {exportConnectionsButton.disabled=false;}
};
$('#rebuild-index').onclick = async () => {
  const button = $<HTMLButtonElement>('#rebuild-index'); button.disabled = true; button.textContent = 'Rebuilding…';
  try { const status = await api.rebuild(); $('#workspace-path').textContent = status.path; const page=await api.pageNotes('',undefined,0,80); notes=page.items;workspaceTotal=page.total;$('#total-count').textContent=String(workspaceTotal); renderFolders(); await renderList(); button.textContent = status.indexing ? 'Indexing in background…' : 'Index rebuilt'; if(status.indexing)watchIndex(); }
  catch (reason) { error(reason); button.textContent = 'Retry rebuild'; }
  finally { button.disabled = false; }
};
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void flush().catch(() => {}); }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') { event.preventDefault(); if (!document.querySelector('dialog[open]')) void newNote(); }
  if (event.key === '/' && !(event.target as HTMLElement).closest('input,textarea,[contenteditable],dialog')) { event.preventDefault(); shell.setPanel('notes',true); $('#search').focus(); }
});
window.addEventListener('beforeunload', event => { if (session?.dirty || session?.saving) { event.preventDefault(); event.returnValue = ''; } });
document.addEventListener('visibilitychange', () => { if (document.hidden) void flush().catch(() => {}); });

async function start() {
  try {
    const result = await Promise.all([api.pageNotes('',undefined,0,80), api.folders(), api.status()]);
    notes = result[0].items; workspaceTotal=result[0].total; folders = result[1];
    $('#workspace-path').textContent = result[2].path;
    $('#total-count').textContent = String(workspaceTotal);
    renderFolders(); await renderList();
    if (result[2].indexing) watchIndex();
    workspaceWarningKey = result[2].warnings.join('\n');
    if (workspaceWarningKey) error(workspaceWarningKey);
    if (notes.length) await openNote([...notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0].id);
    if (!browserPreview) {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const window = getCurrentWindow();
      await window.onCloseRequested(async event => {
        event.preventDefault();
        if (navigating) { error('Please wait for the note to finish opening before closing.'); return; }
        navigating = true; $('#note-pane').inert = true; editor?.setEditable(false, false);
        try { await flush(); await window.destroy(); }
        catch (reason) { navigating = false; $('#note-pane').inert = false; editor?.setEditable(true, false); editingUI.sync(); componentUI.sync(); error(reason); }
      });
    }
  } catch (reason) { error(reason); }
}
void start();
installMetrics();

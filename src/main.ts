import { Editor, getSchema } from '@tiptap/core';
import { createEditorExtensions } from './editor-extensions';
import { editingMarkup, initializeEditingUI } from './editing-ui';
import { api, browserPreview } from './api';
import { NoteSession, type Folder, type Note, type NoteSummary, type SchemaId } from './model';
import { installMetrics } from './metrics';
import { componentMarkup, initializeComponentUI } from './component-ui';
import './style.css';
import './editing.css';
import './components.css';

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const escape = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
$('#app').innerHTML = `
  <aside class="sidebar" aria-label="Workspace navigation">
    <div class="brand"><span class="brand-mark">n.</span><span>noted<span class="brand-caption">A little space to think.</span></span></div>
    <button class="primary" id="new-note"><span>＋</span> New note <kbd>Ctrl N</kbd></button>
    <nav class="navigation"><button class="nav-item selected" id="all-notes"><span>▤</span> All notes <small id="total-count">0</small></button><button class="nav-item" id="daily-note"><span>◷</span> Today’s note</button></nav>
    <div class="section-label">YOUR FOLDERS<button id="add-folder" aria-label="Create folder" title="Create folder">＋</button></div>
    <div id="folders" class="folders"></div>
    <div class="sidebar-bottom"><span class="local-dot"></span><span id="workspace-label">Local workspace</span><button id="workspace-info" aria-label="Workspace details" title="Workspace details">ⓘ</button></div>
  </aside>
  <section class="note-list-panel" aria-label="Notes">
    <header class="list-heading"><div><span class="eyebrow">YOUR COLLECTION</span><h1 id="collection-title">All notes</h1></div><span class="count-pill" id="list-count">0</span></header>
    <label class="search-box"><span aria-hidden="true">⌕</span><input id="search" type="search" placeholder="Search your notes…" aria-label="Search notes" /><kbd>/</kbd></label>
    <div class="list-subheading"><span id="list-description">A place for every thought</span><span>↓</span></div>
    <div id="note-list" class="note-list"></div>
    <footer class="list-footer">PRIVATE BY DESIGN · OFFLINE FIRST</footer>
  </section>
  <main class="workspace">
    <header class="editor-topbar"><span id="breadcrumb">Your workspace</span><div class="topbar-right"><span id="preview-badge" hidden>Browser preview</span><span id="save-state" role="status">Ready</span></div></header>
    <div id="error-banner" class="error-banner" role="alert" hidden><span id="error-message"></span><div><button id="retry-save">Retry save</button><button id="download-draft">Download draft</button><button id="dismiss-error" aria-label="Dismiss message">×</button></div></div>
    <section id="empty-state" class="empty-state"><span class="empty-emblem">n.</span><span class="eyebrow">MAKE ROOM FOR YOUR THOUGHTS</span><h2>Your next idea<br>starts here.</h2><p>A small observation. A big question.<br>Write it down, make it yours, come back to it.</p><button id="empty-new" class="primary">＋ Create your first note</button><span class="empty-footnote">Saved on this device. No account needed.</span></section>
    <section id="note-pane" class="note-pane" hidden>
      ${editingMarkup}
      ${componentMarkup}
      <div class="document-scroll"><article class="document" data-schema="default"><div class="document-kicker"><span id="note-date"></span><span> / </span><span>PERSONAL NOTE</span></div><input id="note-title" class="note-title" aria-label="Note title" placeholder="Untitled" maxlength="300" /><div class="note-properties"><label><span>Folder</span><select id="note-folder" aria-label="Move note to folder"></select></label><label class="tag-field"><span>Tags</span><input id="note-tags" aria-label="Note tags, separated by commas" placeholder="Add tags, separated by commas" /></label></div><div id="editor"></div><div class="writing-hint">A little structure, naturally. Try <code># heading</code>, <code>**bold**</code>, or <code>- a list</code> as you type.</div></article></div>
      <footer class="editor-footer"><span id="word-count">0 words</span><span>Markdown shortcuts <span class="footer-dot">·</span> <span id="revision-label"></span></span></footer>
    </section>
  </main>
  <dialog id="folder-dialog"><form id="folder-form"><span class="eyebrow">A PLACE FOR RELATED IDEAS</span><h2>New folder</h2><label>Folder name<input id="folder-name" required maxlength="100" autocomplete="off" /></label><label>Inside<select id="folder-parent"></select></label><div class="dialog-actions"><button type="button" data-close="folder-dialog">Cancel</button><button type="submit" class="primary">Create folder</button></div></form></dialog>
  <dialog id="link-dialog"><span class="eyebrow">CONNECT YOUR THOUGHTS</span><h2>Link to a note</h2><p class="dialog-description">Links keep their destination when notes are renamed or moved.</p><label class="search-box"><input id="link-search" type="search" aria-label="Find a note to link" placeholder="Find a note…" /></label><div id="link-results" class="link-results"></div><div class="dialog-actions"><button data-close="link-dialog">Cancel</button></div></dialog>
  <dialog id="workspace-dialog"><span class="eyebrow">YOUR DATA STAYS WITH YOU</span><h2>Workspace</h2><p id="workspace-path" class="workspace-path"></p><p class="dialog-description">This prototype uses no cloud AI, telemetry, remote fonts, or remote assets. The desktop search index can be rebuilt from your note files.</p><div class="dialog-actions"><button id="rebuild-index">Rebuild search index</button><button data-close="workspace-dialog">Close</button></div></dialog>`;

let folders: Folder[] = [];
let notes: NoteSummary[] = [];
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
let listLimit = 80;
const editorExtensions = () => createEditorExtensions(() => session?.note.presentation.schemaId ?? 'default');
const editingUI = initializeEditingUI({ getEditor: () => editor, getSchema: () => session?.note.presentation.schemaId ?? 'default', error });
const componentUI = initializeComponentUI({ getEditor: () => editor, getNoteId: () => session?.note.id ?? null, importAsset: (id, file) => api.importAsset(id, file), error });
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
  if (wroteChanges) await refreshWorkspaceWarnings();
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
  $('#total-count').textContent = String(notes.length);
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
    return `<button class="folder-row ${selectedFolder === folder.id ? 'selected' : ''}" data-folder="${escape(folder.id)}" style="--depth:${Math.min(depth, 8)}"><span aria-hidden="true">▱</span><span>${escape(folder.name)}</span><small>${notes.filter(n => n.folderId === folder.id).length || ''}</small></button>${folders.filter(f => f.parentId === folder.id).map(f => row(f, depth + 1)).join('')}`;
  };
  $('#folders').innerHTML = `<button class="folder-row ${selectedFolder === null ? 'selected' : ''}" data-folder=""><span>▱</span><span>Unfiled</span></button>${roots.map(f => row(f, 0)).join('')}${folders.length === 0 ? '<p class="folder-hint">Give your ideas a home.<br>Create your first folder above.</p>' : ''}`;
  $('#note-folder').innerHTML = folderOptions();
  if (session) $<HTMLSelectElement>('#note-folder').value = session.note.folderId ?? '';
}
async function renderList() {
  const generation = ++searchGeneration;
  const query = $<HTMLInputElement>('#search').value.trim();
  let items: NoteSummary[];
  try { items = query ? await api.search(query) : [...notes]; }
  catch (reason) { if (generation === searchGeneration) error(reason); return; }
  if (generation !== searchGeneration) return;
  if (selectedFolder !== 'all') items = items.filter(n => n.folderId === selectedFolder);
  items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  $('#list-count').textContent = String(items.length);
  $('#collection-title').textContent = selectedFolder === 'all' ? 'All notes' : selectedFolder === null ? 'Unfiled' : folders.find(f => f.id === selectedFolder)?.name ?? 'Folder';
  $('#list-description').textContent = query ? 'Matching notes' : 'Recently written';
  $('#note-list').innerHTML = items.slice(0, listLimit).map(n => `<button class="note-card ${session?.note.id === n.id ? 'active' : ''}" data-note="${escape(n.id)}"><span class="note-card-title">${escape(n.title || 'Untitled')}</span><span class="note-card-location">${escape(folderPath(n.folderId))}</span><span class="note-card-bottom"><time>${new Date(n.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</time><span>${n.tags.slice(0, 2).map(t => `#${escape(t)}`).join(' ')}</span></span></button>`).join('') || `<div class="list-empty"><span>∴</span><p>${query ? 'No matching notes.' : 'Nothing here just yet.'}</p><small>${query ? 'Try a different word or folder.' : 'Your next thought could go here.'}</small></div>`;
  if (items.length > listLimit) $('#note-list').insertAdjacentHTML('beforeend', `<button class="show-more" id="show-more">Show 80 more · ${items.length - listLimit} remaining</button>`);
}
function refreshMetadata() {
  if (!session) return;
  const note = session.note;
  $<HTMLInputElement>('#note-title').value = note.title;
  $<HTMLInputElement>('#note-tags').value = note.tags.join(', ');
  $<HTMLSelectElement>('#note-folder').value = note.folderId ?? '';
  $<HTMLSelectElement>('#schema').value = note.presentation.schemaId;
  $('.document').dataset.schema = note.presentation.schemaId;
  $('#breadcrumb').textContent = `${folderPath(note.folderId)}  /  ${note.title || 'Untitled'}`;
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
  releaseAssets = () => { disposed = true; for (const url of assetURLs.values()) void url.then(value => URL.revokeObjectURL(value), () => {}); assetURLs.clear(); };
  const resolveAsset = (assetId: string) => {
    let url = assetURLs.get(assetId);
    if (!url) { url = api.assetUrl(note.id, assetId).then(value => { if (disposed) URL.revokeObjectURL(value); return value; }); assetURLs.set(assetId, url); }
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
  wordCount(); updateSaveState(); editingUI.sync(); editingUI.reset(); componentUI.sync(); void renderList();
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
  const existing = notes.find(n => n.tags.includes(`daily:${date}`));
  if (existing) { await openNote(existing.id); return; }
  await navigate(async () => {
    let folder = folders.find(f => f.name === 'Daily notes' && f.parentId === null);
    if (!folder) { folder = await api.createFolder('Daily notes', null); folders.push(folder); renderFolders(); }
    const note = await api.createNote(now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }), folder.id);
    note.tags = ['daily', `daily:${date}`];
    return api.save(note, note.revision);
  });
}
function linkResults() {
  const query = $<HTMLInputElement>('#link-search').value.toLocaleLowerCase();
  const matches = notes.filter(n => n.id !== session?.note.id && n.title.toLocaleLowerCase().includes(query));
  $('#link-results').innerHTML = matches.map(n => `<button data-link="${escape(n.id)}"><span>${escape(n.title || 'Untitled')}</span><small>${escape(folderPath(n.folderId))}</small></button>`).join('') || '<p class="dialog-description">No other notes found. Create another note to connect your ideas.</p>';
}

// ProseMirror's handleClick can run from its mouseup processing, before the
// browser dispatches the actual anchor click. Cancel that DOM click itself so
// WebView2 never attempts to launch a noted:// URL in an external application.
// Leave mousedown untouched: caret positioning and drag selection remain native.
function interceptEditorLink(event: MouseEvent) {
  const anchor = (event.target instanceof Element ? event.target : null)?.closest('a');
  if (!anchor || !$('#editor').contains(anchor)) return;
  event.preventDefault();
  event.stopPropagation();
  if (event.type !== 'click' || event.button !== 0 || event.shiftKey || navigating) return;
  if (window.getSelection()?.isCollapsed === false) return;
  const href = anchor.getAttribute('href') ?? '';
  if (href.startsWith('noted://note/')) void openNote(href.slice('noted://note/'.length));
  else error('External links are not opened by this offline prototype. You can copy the address from the note.');
}
$('#editor').addEventListener('click', interceptEditorLink, { capture: true });
$('#editor').addEventListener('auxclick', interceptEditorLink, { capture: true });

$('#new-note').onclick = () => { void newNote(); };
$('#empty-new').onclick = () => { void newNote(); };
$('#daily-note').onclick = () => { void dailyNote(); };
$('#all-notes').onclick = () => { selectedFolder = 'all'; $('#all-notes').classList.add('selected'); renderFolders(); void renderList(); };
$('#folders').onclick = event => { const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-folder]'); if (!button) return; selectedFolder = button.dataset.folder || null; $('#all-notes').classList.remove('selected'); renderFolders(); void renderList(); };
$('#note-list').onclick = event => { if ((event.target as HTMLElement).closest('#show-more')) { listLimit += 80; void renderList(); return; } const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-note]'); if (button) void openNote(button.dataset.note!); };
$('#search').oninput = () => { listLimit = 80; clearTimeout(searchTimer); searchGeneration++; searchTimer = setTimeout(() => { void renderList(); }, 180); };
$('#note-title').oninput = () => { const title = $<HTMLInputElement>('#note-title').value; edit(n => { n.title = title; }); $('#breadcrumb').textContent = `${folderPath(session!.note.folderId)}  /  ${title || 'Untitled'}`; };
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
  const note = notes.find(n => n.id === target?.dataset.link);
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
$('#rebuild-index').onclick = async () => {
  const button = $<HTMLButtonElement>('#rebuild-index'); button.disabled = true; button.textContent = 'Rebuilding…';
  try { const status = await api.rebuild(); $('#workspace-path').textContent = status.path; notes = await api.notes(); renderFolders(); await renderList(); button.textContent = 'Index rebuilt'; }
  catch (reason) { error(reason); button.textContent = 'Retry rebuild'; }
  finally { button.disabled = false; }
};
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void flush().catch(() => {}); }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') { event.preventDefault(); if (!document.querySelector('dialog[open]')) void newNote(); }
  if (event.key === '/' && !(event.target as HTMLElement).closest('input,textarea,[contenteditable],dialog')) { event.preventDefault(); $('#search').focus(); }
});
window.addEventListener('beforeunload', event => { if (session?.dirty || session?.saving) { event.preventDefault(); event.returnValue = ''; } });
document.addEventListener('visibilitychange', () => { if (document.hidden) void flush().catch(() => {}); });

async function start() {
  try {
    const result = await Promise.all([api.notes(), api.folders(), api.status()]);
    notes = result[0]; folders = result[1];
    $('#workspace-path').textContent = result[2].path;
    $('#total-count').textContent = String(notes.length);
    renderFolders(); await renderList();
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

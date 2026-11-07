// Browser-only fixture: AI/account methods below are simulated and never delegate to native IPC.
import { Editor } from '@tiptap/core';
import { api } from '../../src/api';
import { NoteSession, type Note } from '../../src/model';
import { createEditorExtensions } from '../../src/editor-extensions';
import { documentFromEditor, documentToEditor, type DocumentOperation } from '../../src/document-model';
import { initializeAIFormatting } from '../../src/ai-formatting-ui';
import { initializeDocumentTools } from '../../src/document-tools-ui';
import { initializeAppearance } from '../../src/appearance';
import '../../src/style.css';
import '../../src/shell-ui.css';
import '../../src/theme.css';
import '../../src/library.css';
import '../../src/components.css';
import '../../src/ai-request-summary.css';
import '../../src/ai-activity.css';

if ((window as any).__TAURI_INTERNALS__ || location.origin !== 'http://127.0.0.1:1436') throw new Error('Browser-only loopback fixture required');
const fixtureKey = 'noted-ai-activity-fixture-v1';
if (localStorage.getItem('noted-browser-preview-v1') && !localStorage.getItem(fixtureKey)) throw new Error('Use a fresh isolated browser profile for this fixture');
const $ = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)!;
$('#fixture').innerHTML = `<header class="fixture-controls"><strong>AI activity test fixture: no account or model</strong><label>Theme<select id="fixture-theme"><option>light</option><option>dark</option></select></label><label>Writing width<select id="fixture-width"><option value="full">Full</option><option value="280">280px</option></select></label></header><main class="workspace"><header class="shell-topbar"><span>Simulated job transport</span><span id="fixture-save" role="status">Ready</span></header><div id="ai-activity-host"></div><section id="note-pane" class="note-pane"><div class="note-product-actions"><button id="fixture-open-ai">Format with AI</button><button id="fixture-other">Open other fixture note</button></div><div class="document-scroll"><article class="document"><input id="note-title" aria-label="Note title"><div id="editor"></div></article></div></section></main><div id="fixture-ai"></div><div id="fixture-tools"></div>`;
const style = document.createElement('style');
style.textContent = '#fixture{height:100dvh;display:grid;grid-template-rows:auto minmax(0,1fr);overflow:hidden}.fixture-controls{display:flex;flex-wrap:wrap;gap:8px 18px;align-items:center;padding:8px;background:var(--ui-surface);color:var(--ui-text);font:13px/1.5 system-ui}.fixture-controls label{display:flex;gap:8px;align-items:center}.fixture-controls select{min-height:44px}.workspace{width:100%;height:100%;margin-inline:auto}.document{padding:24px}.shell-topbar{min-height:44px;height:auto;justify-content:space-between}';
document.head.append(style);
style.textContent += '#fixture{grid-template-columns:minmax(0,1fr)}.fixture-controls{grid-column:1;grid-row:1}.workspace{grid-column:1;grid-row:2}';
const appearance = initializeAppearance();
appearance.setMode('light');
$<HTMLSelectElement>('#fixture-theme').onchange = e => appearance.setMode((e.target as HTMLSelectElement).value as 'light' | 'dark');
$<HTMLSelectElement>('#fixture-width').onchange = e => { $('.workspace').style.width = (e.target as HTMLSelectElement).value === '280' ? 'min(280px,100%)' : '100%'; };

let ids: string[];
const previous = localStorage.getItem(fixtureKey);
if (previous) ids = JSON.parse(previous);
else {
  ids = []; localStorage.setItem(fixtureKey, '[]');
  for (const label of ['A', 'B']) {
    const note = await api.createNote(`Synthetic activity ${label}`, null);
    note.content = { type: 'doc', content: [{ type: 'paragraph', attrs: { id: crypto.randomUUID() }, content: [{ type: 'text', text: `Synthetic activity ${label} preserves all original words.` }] }] };
    ids.push((await api.save(note, note.revision)).id);
  }
  localStorage.setItem(fixtureKey, JSON.stringify(ids));
}
let session: NoteSession, editor: Editor;
const errors: string[] = [];
const error = (reason: unknown) => { errors.push(String(reason instanceof Error ? reason.message : reason)); };
const saved = () => { $('#fixture-save').textContent = session?.dirty ? 'Unsaved fixture draft' : 'Saved in fixture browser storage'; };
async function flush() { await session?.flush(); saved(); }
const state = {
  starts: 0, statusReads: 0, accountReads: 0, externalRequests: 0, externalResponses: 0, requestReads: [] as string[], replyReads: [] as string[], cancels: 0, removes: 0, failStatus: false, failOpen: false, failAccount: false, failRequests: false, denied: false, holdCancellation: false, holdEligibility: false, allowExternalRequest: false, holdExternalResponse: false, skipExternalListing: false, nextPhase: 'running',
  job: null as { id: string; requestId: string; noteId: string; phase: string; message: string } | null,
  row: null as { id: string; noteId: string; prompt: string; expiresAt: string; status: string } | null,
  operations: [] as DocumentOperation[], requestToken: '',
};
function show(note: Note) {
  editor?.destroy();
  session = new NoteSession(note, api.save, saved, snapshot => { snapshot.document = documentFromEditor(editor.getJSON(), snapshot.id, snapshot.document); snapshot.content = documentToEditor(snapshot.document); snapshot.formatVersion = 2; });
  $<HTMLInputElement>('#note-title').value = note.title;
  editor = new Editor({ element: $('#editor'), extensions: createEditorExtensions(() => 'default'), content: note.document ? documentToEditor(note.document) : note.content, onUpdate: () => { session.edit(() => {}); saved(); } });
  saved();
}
async function openNote(id: string) { if (state.failOpen) return; await flush(); show(await api.load(id)); }
show(await api.load(ids[0]));
$<HTMLInputElement>('#note-title').oninput = e => { session.edit(note => { note.title = (e.target as HTMLInputElement).value; }); saved(); };
const tools = initializeDocumentTools($('#fixture-tools'), { getEditor: () => editor, getNote: () => session.note, getRuntime: () => null, flush, error });
const mock: Parameters<typeof initializeAIFormatting>[1]['api'] = {
  async noteAIAllowed() { while (state.holdEligibility) await new Promise(resolve=>setTimeout(resolve,20)); return !state.denied; },
  async schemaGuidanceCapabilities() { return { formattingProtocol: 4, perRequestGuidanceConsent: true, componentSuggestions: true }; },
  async subscriptionStatus() { state.accountReads++; if (state.failAccount) throw new Error('Synthetic account discovery failure'); return { available: true, authentication: 'chatgpt', message: 'Synthetic sign-in fixture. No account or model is used.' }; },
  async startSubscription(note, prompt) {
    state.starts++; const savedNote = await api.load(note.id);
    const source = savedNote.document ?? documentFromEditor(savedNote.content, savedNote.id);
    const object = Object.values(source.objects).find(object => object.kind === 'richText');
    if (!object || object.kind !== 'richText') throw new Error('Synthetic rich text required');
    // Operations use canonical object content, without editor-adapter attributes.
    const paragraph = structuredClone(object.content);
    for (const text of paragraph.content ?? []) if (text.type === 'text') text.marks = [...(text.marks ?? []).filter(mark => mark.type !== 'bold'), { type: 'bold' }];
    state.operations = [{ type: 'format', id: object.id, content: paragraph }];
    state.job = { id: `fixture-job-${state.starts}`, requestId: `fixture-request-${state.starts}`, noteId: note.id, phase: state.nextPhase, message: 'Synthetic local job metadata.' };
    state.row = { id: state.job.requestId, noteId: note.id, prompt, expiresAt: '2099-01-01T00:00:00Z', status: state.nextPhase === 'completed' ? 'ready' : 'waiting' };
    state.requestToken = savedNote.revisionToken;
    return structuredClone(state.job);
  },
  async subscriptionJob() { state.statusReads++; if (state.failStatus) throw new Error('Synthetic status failure'); if (!state.job) throw new Error('No fixture job'); return structuredClone(state.job); },
  async cancelSubscription() { state.cancels++; if (state.job && !state.holdCancellation) state.job.phase = 'cancelled'; },
  async formattingRequests(noteId) { state.requestReads.push(noteId); if (state.failRequests) throw new Error('Synthetic saved-request read failure'); if (state.denied) throw new Error('Synthetic note excluded from AI access'); if (state.row?.noteId !== noteId) return []; const row = structuredClone(state.row); if ((await api.load(noteId)).revisionToken !== state.requestToken) row.status = 'outdated'; return [row]; },
  async formattingReply(id) { state.replyReads.push(id); return state.row?.id === id && state.row.status === 'ready' ? { summary: 'Synthetic bold proposal; words retained.', operations: structuredClone(state.operations) } : null; },
  async componentReply() { throw new Error('Component generation is not used in this fixture'); },
  async createFormattingRequest(noteId,prompt) {
    state.externalRequests++;if(!state.allowExternalRequest)throw new Error('External-agent requests are not used in this fixture');
    const row={id:`fixture-external-${state.externalRequests}`,noteId,prompt,expiresAt:'2099-01-01T00:00:00Z',status:'waiting'};
    state.requestToken=(await api.load(noteId)).revisionToken;
    if(!state.skipExternalListing)state.row=row;
    while(state.holdExternalResponse)await new Promise(resolve=>setTimeout(resolve,20));
    state.externalResponses++;return{id:row.id,noteId,expiresAt:row.expiresAt};
  },
  async cancelFormattingRequest(id) { state.removes++; if (state.row?.id === id) state.row = null; },
};
const ai = initializeAIFormatting($('#fixture-ai'), { api: mock, native: true, activityHost: $('#ai-activity-host'), openNote, note: () => session.note, editor: () => editor, flush, error, proposal: tools.openProposal });
$('#fixture-open-ai').onclick = () => { void ai.open(); };
$('#fixture-other').onclick = () => { void openNote(session.note.id === ids[0] ? ids[1] : ids[0]); };
(window as any).__notedActivityHarness = { state, ids, errors, flush, current: () => session.note.id, async open(id: string) { await openNote(id); }, finish() { if (!state.job || !state.row) throw new Error('No fixture job'); state.job.phase = 'completed'; state.row.status = 'ready'; } };
window.addEventListener('pagehide', () => ai.destroy());

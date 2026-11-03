import { invoke, isTauri } from '@tauri-apps/api/core';
import type { Folder, ImageAsset, ImageAssetData, Note, NoteSummary, WorkspaceStatus } from './model';
import { MAX_IMAGE_BYTES, rasterDimensions, rasterMime, validateImageDimensions } from './image-assets';
import { registerImageSource, unregisterImageSource } from './component-motion';
import { previewRelationOperation, type PreviewRelations } from './relations-preview';
import { documentFromEditor, documentToEditor, previewDocumentOperations, type DocumentPermission, type DocumentOperation } from './document-model';
import type { Page, PairState, PairMutation, PickerNote, ConnectionEntry, ReferenceEntry, RelatedNote, ConnectionSearchPage, ConnectionSearchScope } from './model';

export const browserPreview = !isTauri();
const key = 'noted-browser-preview-v1';
interface PreviewStore { notes: Note[]; folders: Folder[] }
function read(): PreviewStore {
  const raw = localStorage.getItem(key);
  if (!raw) return { notes: [], folders: [] };
  const data = JSON.parse(raw) as PreviewStore;
  if (!Array.isArray(data.notes) || !Array.isArray(data.folders)) throw new Error('Browser preview data is invalid. Export browser storage before resetting it.');
  return data;
}
function persist(store: PreviewStore) { localStorage.setItem(key, JSON.stringify(store)); }
const summary = ({ content: _content, document: _document, presentation: _presentation, formatVersion: _formatVersion, revisionToken: _token, ...note }: Note): NoteSummary => note;
const documentGrants = new Map<string, { id: string; revision: number; token: string; scopes: DocumentPermission[] }>();
function plainText(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const node = value as { text?: string; content?: unknown[] };
  return `${node.text ?? ''} ${(node.content ?? []).map(plainText).join(' ')}`;
}

async function preview<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  const store = read();
  if (['set_relation','restore_dismissed','list_notes_page','picker_notes','list_connections','list_references','related_notes','export_relations','connection_edges','connection_search'].includes(command)) {
    const relations = JSON.parse(localStorage.getItem('noted-preview-relations-v1') ?? '{}') as PreviewRelations;
    const result = previewRelationOperation(relations,command,args,store.notes,store.folders);
    if(command==='set_relation'||command==='restore_dismissed')localStorage.setItem('noted-preview-relations-v1',JSON.stringify(relations));
    return structuredClone(result) as T;
  }
  let result: unknown;
  switch (command) {
    case 'list_document_definitions': result=JSON.parse(localStorage.getItem(`noted-preview-definitions-${args.kind}`)??'[]');break;
    case 'save_document_definition': {
      const definition=args.definition as Record<string,unknown>,identity=(args.kind==='component'?definition.manifest:definition) as {id:string;version:number};
      const key=`noted-preview-definitions-${args.kind}`,definitions=JSON.parse(localStorage.getItem(key)??'[]') as Record<string,unknown>[];
      const existing=definitions.find(def=>{const ref=(args.kind==='component'?def.manifest:def) as {id:string;version:number};return ref.id===identity.id&&ref.version===identity.version;});
      if(existing&&JSON.stringify(existing)!==JSON.stringify(definition))throw new Error('This definition version already exists. Publish a new version.');
      if(!existing){definitions.push(definition);localStorage.setItem(key,JSON.stringify(definitions));}result=definition;break;
    }
    case 'authorize_document_operations': {
      const note = store.notes.find(n => n.id === args.id); if (!note) throw new Error('Note is missing.');
      const grantId = crypto.randomUUID(); documentGrants.set(grantId, { id: note.id, revision: note.revision, token: note.revisionToken, scopes: args.scopes as DocumentPermission[] });
      result = grantId; break;
    }
    case 'preview_document_operations':
    case 'apply_document_operations': {
      const note = store.notes.find(n => n.id === args.id), grant = documentGrants.get(String(args.grantId));
      if (!note || !grant || grant.id !== note.id || grant.revision !== note.revision || grant.token !== note.revisionToken || args.expectedRevision !== note.revision || args.revisionToken !== note.revisionToken) throw new Error('This proposal is stale or has no permission.');
      const document = previewDocumentOperations(note.document ?? documentFromEditor(note.content, note.id), args.operations as DocumentOperation[], new Set(grant.scopes));
      const content = documentToEditor(document);
      if (command === 'preview_document_operations') result = { document, content, baseRevision: note.revision };
      else { Object.assign(note, { document, content, formatVersion: 2, revision: note.revision + 1, revisionToken: crypto.randomUUID(), updatedAt: new Date().toISOString() }); persist(store); result = note; documentGrants.delete(String(args.grantId)); }
      break;
    }
    case 'workspace_status': result = { path: 'Browser preview storage · separate from your desktop notes', warnings: [] }; break;
    case 'list_notes': result = store.notes.map(summary); break;
    case 'list_folders': result = store.folders; break;
    case 'create_folder': {
      const folder = { id: crypto.randomUUID(), name: String(args.name).trim(), parentId: args.parentId as string | null };
      if (!folder.name) throw new Error('A folder needs a name.');
      if (folder.parentId && !store.folders.some(f => f.id === folder.parentId)) throw new Error('Parent folder no longer exists.');
      store.folders.push(folder); persist(store); result = folder; break;
    }
    case 'create_note': {
      const now = new Date().toISOString();
      const note: Note = { formatVersion: 1, id: crypto.randomUUID(), title: String(args.title), folderId: args.folderId as string | null,
        tags: [], revision: 1, revisionToken: crypto.randomUUID(), createdAt: now, updatedAt: now,
        content: { type: 'doc', content: [{ type: 'paragraph', attrs: { id: crypto.randomUUID() } }] }, presentation: { schemaId: 'default' } };
      store.notes.push(note); persist(store); result = note; break;
    }
    case 'load_note': {
      result = store.notes.find(n => n.id === args.id);
      if (!result) throw new Error('This linked note is missing. Your current note has been preserved.');
      break;
    }
    case 'save_note': {
      const note = args.note as Note;
      const index = store.notes.findIndex(n => n.id === note.id);
      const existing = store.notes[index];
      if (!existing) throw new Error('This note no longer exists. Download your draft to keep it.');
      if (existing.revision !== args.expectedRevision || existing.revisionToken !== note.revisionToken) throw new Error('This note changed elsewhere. Your draft is preserved; download it before reopening the app.');
      const saved = { ...note, revision: existing.revision + 1, revisionToken: crypto.randomUUID(), updatedAt: new Date().toISOString() };
      store.notes[index] = saved; persist(store); result = saved; break;
    }
    case 'search_notes': {
      const terms = String(args.query).toLocaleLowerCase().split(/\s+/).filter(Boolean);
      result = store.notes.filter(n => terms.every(t => `${n.title} ${n.tags.join(' ')} ${plainText(n.content)}`.toLocaleLowerCase().includes(t))).map(summary); break;
    }
    case 'rebuild_index': result = { path: 'Browser preview uses a simple local scan, not the desktop search index.', warnings: [] }; break;
    default: throw new Error(`Unknown preview operation: ${command}`);
  }
  return structuredClone(result) as T;
}
const call = <T>(command: string, args?: Record<string, unknown>): Promise<T> => browserPreview ? preview<T>(command, args) : invoke<T>(command, args);

// Images live in a separate IndexedDB store so typing never serializes image bytes.
interface PreviewImage extends ImageAsset { key: string; bytes: Uint8Array }
async function imageDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('noted-preview-images-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('images', { keyPath: 'key' });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}
function imageKey(noteId: string, assetId: string) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  if (!uuid.test(noteId) || !uuid.test(assetId)) throw new Error('Invalid asset identifier.');
  if (!read().notes.some(note => note.id === noteId)) throw new Error('Image owner note is missing.');
  return `${noteId}/${assetId}`;
}
async function putPreviewImage(record: PreviewImage) {
  const db = await imageDatabase();
  try { await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('images', 'readwrite');
    transaction.objectStore('images').put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('Image import was interrupted.'));
  }); } finally { db.close(); }
}
async function getPreviewImage(key: string): Promise<PreviewImage> {
  const db = await imageDatabase();
  try { return await new Promise((resolve, reject) => {
    const request = db.transaction('images', 'readonly').objectStore('images').get(key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => request.result ? resolve(request.result) : reject(new Error('This local image is missing.'));
  }); } finally { db.close(); }
}
async function importAsset(noteId: string, file: File): Promise<ImageAsset> {
  if (!file.size || file.size > MAX_IMAGE_BYTES) throw new Error('Images must be between 1 byte and 10 MiB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = rasterMime(bytes);
  rasterDimensions(bytes, mime);
  // Decode once on import, not on each edit. Files that only imitate a header fail here.
  const bitmap = await createImageBitmap(new Blob([bytes], { type: mime }));
  const { width, height } = bitmap;
  bitmap.close();
  validateImageDimensions(width, height);
  if (!browserPreview) return invoke<ImageAsset>('import_image', { noteId, bytes: Array.from(bytes), mime });
  const info = { id: crypto.randomUUID(), mime, byteLength: bytes.length, width, height };
  await putPreviewImage({ ...info, key: imageKey(noteId, info.id), bytes });
  return info;
}
/** Caller owns the returned blob URL and must revoke it on editor disposal. */
async function assetUrl(noteId: string, assetId: string): Promise<string> {
  const data = browserPreview ? await getPreviewImage(imageKey(noteId, assetId))
    : await invoke<ImageAssetData>('read_image', { noteId, assetId });
  const bytes = new Uint8Array(data.bytes);
  const mime = rasterMime(bytes);
  rasterDimensions(bytes, mime);
  validateImageDimensions(data.width, data.height);
  if (mime !== data.mime) throw new Error('Image metadata does not match its bytes.');
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  registerImageSource(url, mime);
  return url;
}
function releaseAssetUrl(url: string) { unregisterImageSource(url); URL.revokeObjectURL(url); }
export const api = {
  listDocumentDefinitions: <T>(kind:'schema'|'component')=>call<T[]>('list_document_definitions',{kind}),
  saveDocumentDefinition: <T>(kind:'schema'|'component',definition:T)=>call<T>('save_document_definition',{kind,definition}),
  copyAsset: async(sourceNoteId:string,targetNoteId:string,assetId:string):Promise<ImageAsset>=>{
    if(!browserPreview)return invoke<ImageAsset>('copy_image',{sourceNoteId,targetNoteId,assetId});
    const original=await getPreviewImage(imageKey(sourceNoteId,assetId));const info={id:crypto.randomUUID(),mime:original.mime,byteLength:original.byteLength,width:original.width,height:original.height};await putPreviewImage({...info,key:imageKey(targetNoteId,info.id),bytes:original.bytes});return info;
  },
  authorizeDocumentOperations: (id: string, scopes: DocumentPermission[]) => call<string>('authorize_document_operations', { id, scopes }),
  previewDocumentOperations: (note: Note, operations: DocumentOperation[], grantId: string) => call<{document: import('./document-model').NotedDocumentV2;content: import('@tiptap/core').JSONContent;baseRevision:number}>('preview_document_operations', { id: note.id, expectedRevision: note.revision, revisionToken: note.revisionToken, operations, grantId }),
  applyDocumentOperations: (note: Note, operations: DocumentOperation[], grantId: string) => call<Note>('apply_document_operations', { id: note.id, expectedRevision: note.revision, revisionToken: note.revisionToken, operations, grantId }),
  exportRelations: () => call<{formatVersion:2;pairs:PairState[]}>('export_relations'),
  pageNotes: (query = '', folderId?: string, cursor?: number | null, limit = 80) => call<Page<NoteSummary>>('list_notes_page', {query,folderId,cursor,limit}),
  picker: (sourceId: string, query = '', cursor?: number | null, limit = 40) => call<Page<PickerNote>>('picker_notes', {sourceId,query,cursor,limit}),
  connections: (noteId: string, cursor?: number | null, limit = 40) => call<Page<ConnectionEntry>>('list_connections',{noteId,cursor,limit}),
  references: (noteId: string, cursor?: number | null, limit = 40) => call<Page<ReferenceEntry>>('list_references',{noteId,cursor,limit}),
  related: (noteId: string, cursor?: number | null, limit = 8) => call<Page<RelatedNote>>('related_notes',{noteId,cursor,limit}),
  edges: (noteIds:string[],sourceId?:string) => call<PairState[]>('connection_edges',{noteIds,sourceId}),
  connectionSearch: (sourceId:string,query:string,scope:ConnectionSearchScope,cursor?:number|null,limit=20,semantic=false) => call<ConnectionSearchPage>('connection_search',{sourceId,query,scope,cursor,limit,semantic}),
  setRelation: (a:string,b:string,connected?:boolean,dismissed?:boolean,expectedRevision?:number,strength?:number) => call<PairMutation>('set_relation',{a,b,connected,dismissed,expectedRevision,strength}),
  restoreDismissed: (noteId:string) => call<number>('restore_dismissed',{noteId}),
  importAsset,
  assetUrl,
  releaseAssetUrl,
  notes: () => call<NoteSummary[]>('list_notes'),
  folders: () => call<Folder[]>('list_folders'),
  createFolder: (name: string, parentId: string | null) => call<Folder>('create_folder', { name, parentId }),
  createNote: (title: string, folderId: string | null) => call<Note>('create_note', { title, folderId }),
  load: (id: string) => call<Note>('load_note', { id }),
  save: (note: Note, expectedRevision: number) => call<Note>('save_note', { note, expectedRevision }),
  search: (query: string) => call<NoteSummary[]>('search_notes', { query }),
  status: () => call<WorkspaceStatus>('workspace_status'),
  rebuild: () => call<WorkspaceStatus>('rebuild_index'),
};

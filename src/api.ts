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
const documentGrants = new Map<string, { id: string; revision: number; token: string; scopes: DocumentPermission[];previewDigest?:string;renderToken?:string }>();
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

    case 'update_folder': {
      const folder=args.folder as Folder,expected=args.expected as Folder,index=store.folders.findIndex(f=>f.id===folder.id);if(index<0||JSON.stringify(store.folders[index])!==JSON.stringify(expected))throw new Error('Folder changed elsewhere. Reopen its settings.');if(!folder.name.trim()||folder.name.length>100)throw new Error('A folder needs a name.');const seen=new Set([folder.id]);let parent=folder.parentId;while(parent){if(seen.has(parent))throw new Error('A folder cannot move inside itself or a descendant.');seen.add(parent);const next=store.folders.find(f=>f.id===parent);if(!next)throw new Error('Parent is missing.');parent=next.parentId;}store.folders[index]=folder;persist(store);result=folder;break;
    }
    case 'list_trash':result=JSON.parse(localStorage.getItem('noted-preview-trash')??'[]').map(summary);break;
    case 'trash_note':{const index=store.notes.findIndex(n=>n.id===args.id),n=store.notes[index];if(!n||n.revision!==args.revision||n.revisionToken!==args.token)throw new Error('Note changed. Reload before moving to Trash.');const trash=JSON.parse(localStorage.getItem('noted-preview-trash')??'[]') as Note[];if(trash.some(t=>t.id===n.id))throw new Error('A copy already exists in Trash.');trash.push(n);localStorage.setItem('noted-preview-trash',JSON.stringify(trash));store.notes.splice(index,1);persist(store);break;}
    case 'restore_note':{const trash=JSON.parse(localStorage.getItem('noted-preview-trash')??'[]') as Note[],index=trash.findIndex(n=>n.id===args.id);if(index<0)throw new Error('Trashed note missing.');if(store.notes.some(n=>n.id===args.id))throw new Error('An active copy exists; nothing replaced.');result=trash[index];store.notes.push(trash[index]);persist(store);trash.splice(index,1);localStorage.setItem('noted-preview-trash',JSON.stringify(trash));break;}
    case 'recover_draft':{const draft=structuredClone(args.draft as Note),oldId=draft.id;draft.id=crypto.randomUUID();draft.revision=1;draft.revisionToken=crypto.randomUUID();draft.title=draft.title.slice(0,240)+' (recovered draft)';draft.createdAt=draft.updatedAt=new Date().toISOString();if(draft.folderId&&!store.folders.some(f=>f.id===draft.folderId))draft.folderId=null;await copyPreviewAssets(oldId,draft.id);store.notes.push(draft);persist(store);result=draft;break;}
    case 'review_action':{const id=String(args.id);if(!store.notes.some(n=>n.id===id))throw new Error('Note is missing.');const states=JSON.parse(localStorage.getItem('noted-preview-review')??'{}') as Record<string,{dismissed?:boolean;snoozeUntil?:string;reviewedAt?:string}>;const s=states[id]??{};if(args.action==='reset')delete states[id];else{if(args.action==='dismiss')s.dismissed=true;else if(args.action==='snooze')s.snoozeUntil=new Date(Date.now()+86400000).toISOString();else if(args.action==='reviewed'){s.reviewedAt=new Date().toISOString();delete s.snoozeUntil;}else throw new Error('Unknown review action.');states[id]=s;}localStorage.setItem('noted-preview-review',JSON.stringify(states));break;}
    case 'review_feed':{const states=JSON.parse(localStorage.getItem('noted-preview-review')??'{}') as Record<string,{dismissed?:boolean;snoozeUntil?:string;reviewedAt?:string}>;const today=new Date().toISOString().slice(0,10);result=store.notes.filter(n=>{const s=states[n.id]??{};return (!args.folderId||n.folderId===args.folderId)&&(!args.tag||n.tags.some(t=>t.toLowerCase()===String(args.tag).toLowerCase()))&&(args.includeHidden||!s.dismissed&&(!s.snoozeUntil||s.snoozeUntil<new Date().toISOString())&&s.reviewedAt?.slice(0,10)!==today);}).sort((a,b)=>(states[a.id]?.reviewedAt??a.updatedAt).localeCompare(states[b.id]?.reviewedAt??b.updatedAt)).slice(0,30).map(note=>({note:summary(note),reasons:[states[note.id]?.dismissed?'Excluded from review':states[note.id]?.snoozeUntil?'Snoozed':'Resurfaced from your saved notes',...(note.tags.length?['Tags: '+note.tags.join(', ')]:[])]}));break;}

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
    case 'approve_document_render': {
      const grant=documentGrants.get(String(args.grantId));if(!grant||grant.previewDigest!==args.digest)throw new Error('Rendered preview does not match this proposal.');grant.renderToken=crypto.randomUUID();result=grant.renderToken;break;
    }
    case 'preview_document_operations':
    case 'apply_document_operations': {
      const note = store.notes.find(n => n.id === args.id), grant = documentGrants.get(String(args.grantId));
      if (!note || !grant || grant.id !== note.id || grant.revision !== note.revision || grant.token !== note.revisionToken || args.expectedRevision !== note.revision || args.revisionToken !== note.revisionToken) throw new Error('This proposal is stale or has no permission.');
      const document = previewDocumentOperations(note.document ?? documentFromEditor(note.content, note.id), args.operations as DocumentOperation[], new Set(grant.scopes));
      const content = documentToEditor(document);
      const documentDigest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(document)))),b=>b.toString(16).padStart(2,'0')).join('');
      if(command==='apply_document_operations'&&(!args.renderToken||grant.renderToken!==args.renderToken||grant.previewDigest!==documentDigest))throw new Error('A matching trusted rendered preview is required.');
      if (command === 'preview_document_operations') {grant.previewDigest=documentDigest;grant.renderToken=undefined;result = { document, content, baseRevision: note.revision,documentDigest };}
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

async function copyPreviewAssets(source:string,target:string){
 const db=await imageDatabase();try{const records=await new Promise<PreviewImage[]>((resolve,reject)=>{const r=db.transaction('images','readonly').objectStore('images').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});for(const record of records)if(record.key.startsWith(source+'/'))await putPreviewImage({...record,key:target+record.key.slice(source.length)});}finally{db.close();}
}
export const api = {
  agentConnectionStatus:()=>call<{localTransportActive:boolean;hostedTransportActive:boolean;hostedChatVerified:boolean}>('agent_connection_status'),
  subscriptionStatus:()=>call<{available:boolean;authentication:string;message:string}>('subscription_status'),
  startSubscription:(note:Note,prompt:string)=>call<{id:string;noteId:string;requestId:string;phase:string;message:string}>('start_subscription_formatting',{id:note.id,revision:note.revision,token:note.revisionToken,prompt}),
  subscriptionJob:(id:string)=>call<{id:string;noteId:string;requestId:string;phase:string;message:string}>('subscription_job',{id}),
  cancelSubscription:(id?:string)=>call<void>('cancel_subscription_job',{id}),
  previewMigration:(source:string,profile:string)=>call<import('./migration-types').MigrationReport>('preview_migration',{source,profile}),
  cancelMigration:(id:string)=>call<void>('cancel_migration',{id}),
  publishMigration:(id:string,target:string,digest:string,acceptWarnings:boolean)=>call<import('./migration-types').MigrationReport>('publish_migration',{id,target,digest,acceptWarnings}),
  migrationReports:()=>call<import('./migration-types').MigrationReport[]>('migration_reports'),
  exportMigrationSources:(batch:string,target:string)=>call<number>('export_migration_sources',{batch,target}),
  updateFolder:(folder:Folder,expected:Folder)=>call<Folder>('update_folder',{folder,expected}),
  trash:()=>call<NoteSummary[]>('list_trash'),
  trashNote:(note:Note)=>call<void>('trash_note',{id:note.id,revision:note.revision,token:note.revisionToken}),
  restoreNote:(id:string)=>call<Note>('restore_note',{id}),
  recoverDraft:(draft:Note)=>call<Note>('recover_draft',{draft}),
  reviewFeed:(folderId:string|null,tag:string,includeHidden=false)=>call<{note:NoteSummary;reasons:string[]}[]>('review_feed',{folderId,tag,includeHidden}),
  reviewAction:(id:string,action:string)=>call<void>('review_action',{id,action}),
  agentAccess:()=>call<{enabled:boolean;allowHosted?:boolean;folderIds:string[]}>('agent_access'),
  setAgentAccess:(access:{enabled:boolean;allowHosted?:boolean;folderIds:string[]})=>call<{enabled:boolean;allowHosted?:boolean;folderIds:string[]}>('set_agent_access',{access}),
  agentConfiguration:()=>call<string>('agent_configuration'),
  createFormattingRequest:(id:string,prompt:string)=>call<{id:string;noteId:string;expiresAt:string}>('create_formatting_request',{id,prompt}),
  formattingRequests:(noteId:string)=>call<{id:string;noteId:string;prompt:string;expiresAt:string}[]>('formatting_requests',{noteId}),
  formattingReply:(id:string)=>call<{summary:string;operations:DocumentOperation[]}|null>('formatting_reply',{id}),
  cancelFormattingRequest:(id:string)=>call<void>('cancel_formatting_request',{id}),
  backupDefaults:()=>call<{backupPath:string;restorePath:string}>('backup_defaults'),
  createBackup:(path:string)=>call<import('./workspace-backup-types').BackupSummary>('create_workspace_backup',{path}),
  inspectBackup:(path:string)=>call<import('./workspace-backup-types').BackupSummary>('inspect_workspace_backup',{path}),
  restoreBackup:(path:string,target:string,digest:string)=>call<import('./workspace-backup-types').BackupSummary>('restore_workspace_backup',{path,target,digest}),
  revealBackup:(path:string)=>call<void>('reveal_workspace_backup',{path}),
  openRestoredWorkspace:(path:string)=>call<void>('open_restored_workspace',{path}),
  listDocumentDefinitions: <T>(kind:'schema'|'component')=>call<T[]>('list_document_definitions',{kind}),
  saveDocumentDefinition: <T>(kind:'schema'|'component',definition:T)=>call<T>('save_document_definition',{kind,definition}),
  copyAsset: async(sourceNoteId:string,targetNoteId:string,assetId:string):Promise<ImageAsset>=>{
    if(!browserPreview)return invoke<ImageAsset>('copy_image',{sourceNoteId,targetNoteId,assetId});
    const original=await getPreviewImage(imageKey(sourceNoteId,assetId));const info={id:crypto.randomUUID(),mime:original.mime,byteLength:original.byteLength,width:original.width,height:original.height};await putPreviewImage({...info,key:imageKey(targetNoteId,info.id),bytes:original.bytes});return info;
  },
  approveDocumentRender:(grantId:string,digest:string,report:unknown)=>call<string>('approve_document_render',{grantId,digest,report}),
  authorizeDocumentOperations: (id: string, scopes: DocumentPermission[]) => call<string>('authorize_document_operations', { id, scopes }),
  previewDocumentOperations: (note: Note, operations: DocumentOperation[], grantId: string) => call<{document: import('./document-model').NotedDocumentV2;content: import('@tiptap/core').JSONContent;baseRevision:number;documentDigest:string}>('preview_document_operations', { id: note.id, expectedRevision: note.revision, revisionToken: note.revisionToken, operations, grantId }),
  applyDocumentOperations: (note: Note, operations: DocumentOperation[], grantId: string, renderToken:string) => call<Note>('apply_document_operations', { id: note.id, expectedRevision: note.revision, revisionToken: note.revisionToken, operations, grantId,renderToken }),
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

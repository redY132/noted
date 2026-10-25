import { invoke, isTauri } from '@tauri-apps/api/core';
import type { Folder, Note, NoteSummary, WorkspaceStatus } from './model';

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
const summary = ({ content: _content, presentation: _presentation, formatVersion: _formatVersion, revisionToken: _token, ...note }: Note): NoteSummary => note;
function plainText(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const node = value as { text?: string; content?: unknown[] };
  return `${node.text ?? ''} ${(node.content ?? []).map(plainText).join(' ')}`;
}

async function preview<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  const store = read();
  let result: unknown;
  switch (command) {
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
export const api = {
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

import type { JSONContent } from '@tiptap/core';

export type SchemaId = 'default' | 'compact' | 'outline';
export interface Folder { id: string; name: string; parentId: string | null }
export interface NoteSummary {
  id: string; title: string; folderId: string | null; tags: string[];
  revision: number; createdAt: string; updatedAt: string;
}
export interface Note extends NoteSummary {
  formatVersion: 1; revisionToken: string; content: JSONContent;
  presentation: { schemaId: SchemaId };
}
export interface WorkspaceStatus { path: string; warnings: string[] }
export interface ImageAsset { id: string; mime: string; byteLength: number; width: number; height: number }
export interface ImageAssetData extends ImageAsset { bytes: number[] }

/** Serializes writes and preserves edits made while a previous revision is saving. */
export class NoteSession {
  private generation = 0;
  private savedGeneration = 0;
  private pending: Promise<void> | null = null;
  public note: Note;
  private write: (note: Note, expectedRevision: number) => Promise<Note>;
  private changed: () => void;
  private beforeSnapshot: (note: Note) => void;
  constructor(note: Note, write: (note: Note, expectedRevision: number) => Promise<Note>, changed: () => void = () => {}, beforeSnapshot: (note: Note) => void = () => {}) {
    this.note = note; this.write = write; this.changed = changed; this.beforeSnapshot = beforeSnapshot;
  }
  get dirty() { return this.generation !== this.savedGeneration; }
  get saving() { return this.pending !== null; }
  edit(update: (note: Note) => void) { update(this.note); this.generation++; this.changed(); }
  flush(): Promise<void> {
    if (this.pending) return this.pending;
    if (!this.dirty) return Promise.resolve();
    this.pending = this.drain().finally(() => { this.pending = null; this.changed(); });
    this.changed();
    return this.pending;
  }
  private async drain() {
    while (this.dirty) {
      const generation = this.generation;
      this.beforeSnapshot(this.note);
      const snapshot = structuredClone(this.note);
      const saved = await this.write(snapshot, snapshot.revision);
      // Never replace the live content with a stale snapshot returned by a save.
      this.note.revision = saved.revision;
      this.note.revisionToken = saved.revisionToken;
      this.note.updatedAt = saved.updatedAt;
      this.savedGeneration = generation;
      this.changed();
    }
  }
}

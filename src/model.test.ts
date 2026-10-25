import test from 'node:test';
import assert from 'node:assert/strict';
import { NoteSession, type Note } from './model.ts';

const note = (): Note => ({ formatVersion: 1, id: 'test', revision: 1, revisionToken: 'one', title: 'First', folderId: null, tags: [], createdAt: '', updatedAt: '', content: { type: 'doc' }, presentation: { schemaId: 'default' } });
const next = (draft: Note): Note => ({ ...draft, revision: draft.revision + 1, revisionToken: `revision-${draft.revision + 1}`, updatedAt: 'saved' });

test('serializes writes and does not overwrite edits made during a save', async () => {
  const snapshots: Note[] = [];
  let release!: (value: Note) => void;
  const session = new NoteSession(note(), async draft => {
    snapshots.push(draft);
    if (snapshots.length === 1) return new Promise<Note>(resolve => { release = resolve; });
    return next(draft);
  });
  session.edit(draft => { draft.title = 'Second'; });
  const saving = session.flush();
  assert.equal(session.flush(), saving, 'concurrent flush calls share one write loop');
  session.edit(draft => { draft.title = 'Third'; draft.tags = ['new']; });
  release(next(snapshots[0]));
  await saving;
  assert.deepEqual(snapshots.map(n => [n.title, n.revision]), [['Second', 1], ['Third', 2]]);
  assert.equal(snapshots[1].revisionToken, 'revision-2');
  assert.equal(session.note.title, 'Third');
  assert.deepEqual(session.note.tags, ['new']);
  assert.equal(session.note.revision, 3);
  assert.equal(session.dirty, false);
});

test('failed saves retain the draft and revision for a retry', async () => {
  let fail = true;
  const session = new NoteSession(note(), async draft => { if (fail) throw new Error('Disk is full'); return next(draft); });
  session.edit(draft => { draft.title = 'Keep this thought'; });
  await assert.rejects(session.flush(), /Disk is full/);
  assert.equal(session.dirty, true);
  assert.equal(session.saving, false);
  assert.equal(session.note.revision, 1);
  assert.equal(session.note.title, 'Keep this thought');
  fail = false;
  await session.flush();
  assert.equal(session.dirty, false);
  assert.equal(session.note.title, 'Keep this thought');
});

test('deferred content capture reads the latest editor state for every revision', async () => {
  let content = 'new content';
  let release!: (value: Note) => void;
  const writes: Note[] = [];
  const session = new NoteSession(note(), async draft => {
    writes.push(draft);
    if (writes.length === 1) return new Promise<Note>(resolve => { release = resolve; });
    return next(draft);
  }, () => {}, draft => { draft.content = { type: 'doc', content: [{ type: 'text', text: content }] }; });
  session.edit(() => {});
  const saving = session.flush();
  content = 'typed during save'; session.edit(() => {});
  release(next(writes[0]));
  await saving;
  assert.equal(writes[1].content.content?.[0].text, 'typed during save');
});

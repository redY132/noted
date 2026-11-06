import test from 'node:test';
import assert from 'node:assert/strict';
import { NavigationHistory, type NoteViewState } from './navigation-history.ts';
const note = (id: string) => ({ id, title: `Note ${id}`, folderId: null });
const view: NoteViewState = { revisionToken: 'saved-version', selection: { type: 'text', anchor: 3, head: 8 }, scrollTop: 140, scrollLeft: 0 };
test('history travels only after a successful commit and a new visit branches', () => {
  const h = new NavigationHistory(); h.record(note('a')); h.capture('a', view); h.record(note('b')); h.record(note('c'));
  const back = h.step(-1)!;
  assert.equal(h.snapshot().cursor, 2); // A failed load must not consume the destination.
  assert.equal(h.commit(back, note('b')), true); assert.equal(h.step(-1)?.id, 'a'); assert.equal(h.step(1)?.id, 'c');
  h.record(note('d')); assert.deepEqual(h.snapshot().visits.map(v => v.id), ['a', 'b', 'd']); assert.equal(h.step(1), null);
});
test('consecutive visits are deduplicated, repeated visits retain independent view state', () => {
  const h = new NavigationHistory(); h.record(note('a')); h.capture('a', view); h.record(note('a')); h.record(note('b')); h.record(note('a'));
  assert.equal(h.snapshot().visits.length, 3); assert.equal(h.snapshot().visits[2].view, null);
  const first = h.target(0)!; assert.deepEqual(first.view, view); first.view!.scrollTop = 999;
  assert.equal(h.target(0)!.view!.scrollTop, 140);
});
test('history retains only explicit metadata, bounds visits, and invalidates stale targets', () => {
  const h = new NavigationHistory(2); h.record({ ...note('a'), content: 'private body' } as ReturnType<typeof note>); h.record(note('b'));
  const stale = h.step(-1)!; h.record(note('c'));
  assert.equal(h.valid(stale), false); assert.equal(h.commit(stale, note('a')), false);
  assert.deepEqual(h.snapshot().visits.map(v => v.id), ['b', 'c']); assert.equal(JSON.stringify(h.snapshot()).includes('private body'), false);
  const snapshot = h.snapshot(); snapshot.visits[0].title = 'Changed outside'; assert.equal(h.snapshot().visits[0].title, 'Note b');
});
test('Trash keeps unavailable visits visible and Restore makes them navigable again', () => {
  const h = new NavigationHistory(); for (const id of ['a', 'b', 'c']) h.record(note(id));
  h.commit(h.step(-1)!, note('b')); h.unavailable('b');
  assert.equal(h.snapshot().active, false); assert.equal(h.snapshot().visits[1].available, false);
  assert.equal(h.step(-1)?.id, 'a'); assert.equal(h.step(1)?.id, 'c'); assert.equal(h.target(1), null);
  h.restored({ ...note('b'), title: 'Restored b' }); assert.equal(h.step(-1)?.id, 'b');
  h.commit(h.step(-1)!, note('b')); assert.equal(h.snapshot().active, true);
});
test('renames and moves update every visit without retaining note content; clearing keeps the active visit', () => {
  const h = new NavigationHistory(); for (const id of ['a', 'b', 'a']) h.record(note(id));
  h.update({ id: 'a', title: 'Renamed', folderId: 'folder' }); h.capture('a', view); h.clearPrevious();
  assert.deepEqual(h.snapshot(), { visits: [{ id: 'a', title: 'Renamed', folderId: 'folder', available: true, view }], cursor: 0, active: true });
  h.unavailable('a'); h.clearPrevious(); assert.equal(h.snapshot().visits.length, 0); assert.equal(h.step(-1), null);
});

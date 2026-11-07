import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { initializeNavigation, navigationMarkup, folderAncestors, graphPositions, graphWindow, graphCapacity } from './navigation-panel.ts';
import { folderAppearance, folderIconMarkup, validFolderIcon } from './folder-appearance.ts';
import type { Folder, NoteSummary, PairState } from './model.ts';
const id = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;
const note = (n: number): NoteSummary => ({ id: id(n), title: `Synthetic note ${n}`, folderId: id(1), tags: [], revision: 1, createdAt: '2026-11-05T00:00:00Z', updatedAt: '2026-11-05T00:00:00Z' });
const folders: Folder[] = [{ id: id(1), name: 'Parent', parentId: null }, { id: id(2), name: 'Child', parentId: id(1) }, { id: id(3), name: 'Leaf', parentId: id(2) }, { id: id(4), name: 'Empty', parentId: null }];
const delay = (ms = 120) => new Promise(resolve => setTimeout(resolve, ms));
async function waitUntil(condition: () => boolean) {
  const deadline = Date.now() + 5000;
  while (!condition()) { assert.ok(Date.now() < deadline, 'Navigation fixture did not reach the expected state'); await delay(10); }
}
function setup(edges: (ids: string[]) => Promise<PairState[]> = async () => []) {
  const dom = new JSDOM(`${navigationMarkup}<button data-panel-toggle="navigation">Browse</button><main><div id="editor" tabindex="0">Synthetic writer</div></main>`, { url: 'http://localhost', pretendToBeVisual: true });
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, localStorage: dom.window.localStorage, innerWidth: 1200, innerHeight: 800, requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window) })) Object.defineProperty(globalThis, key, { value, configurable: true });
  const root = document.querySelector<HTMLElement>('#navigation-panel')!, selected: unknown[] = [];
  const ui = initializeNavigation(root, { select: value => selected.push(value), open: async () => true, close: () => ui.setOpen(false), focusEditor: () => document.querySelector<HTMLElement>('#editor')!.focus(), edges });
  return { dom, ui, root, selected, close() { ui.destroy(); dom.window.close(); } };
}
test('hierarchy expands at the selected branch and has a keyboard path back to its parent', () => {
  const h = setup();
  try {
    h.ui.setFolders(folders, 'all'); assert.equal(document.querySelector(`[data-folder="${id(2)}"]`), null);
    document.querySelector<HTMLButtonElement>(`[data-folder="${id(1)}"]`)!.click();
    assert.deepEqual(h.selected, [id(1)]); assert.ok(document.querySelector(`[data-folder="${id(2)}"]`));
    const child = document.querySelector<HTMLButtonElement>(`[data-folder="${id(2)}"]`)!; child.focus();
    child.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    assert.ok(document.querySelector(`[data-folder="${id(3)}"]`));
    document.querySelector<HTMLButtonElement>(`[data-folder="${id(3)}"]`)!.focus();
    document.activeElement!.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    assert.equal((document.activeElement as HTMLElement).dataset.folder, id(2));
    assert.deepEqual(folderAncestors(folders, id(3)), [id(1), id(2), id(3)]);
  } finally { h.close(); }
});
test('long lists keep the focused note in the bounded graph and survive an async edge refresh', async () => {
  const calls: string[][] = [], h = setup(async ids => { calls.push(ids); return []; });
  try {
    h.ui.setFolders(folders, id(1));
    const notes = Array.from({ length: 95 }, (_, i) => note(100 + i));
    document.querySelector('#note-list')!.innerHTML = notes.map(n => `<div class="note-card-shell"><button data-note="${n.id}">${n.title}</button></div>`).join('');
    h.ui.setNotes(notes, 95, null); await delay();
    document.querySelector<HTMLButtonElement>(`[data-note="${notes[94].id}"]`)!.focus();
    await delay(); assert.ok(document.querySelector(`[data-folder-graph-note="${notes[94].id}"].highlighted`));
    assert.ok(calls.every(ids => ids.length <= 60));
    const focusNotifications: string[] = [];
    document.querySelector('#folder-graph-nodes')!.addEventListener('focusin', () => focusNotifications.push('focus'));
    const node = document.querySelector<HTMLButtonElement>(`[data-folder-graph-note="${notes[94].id}"]`)!; node.focus();
    document.querySelector<HTMLButtonElement>('#folder-graph-refresh')!.click(); await delay();
    assert.equal((document.activeElement as HTMLElement).dataset.folderGraphNote, notes[94].id);
    assert.equal(focusNotifications.length, 1, 'Unchanged connection refresh must not repeat keyboard focus announcements');
    h.ui.setNotes(notes.map(n => n.id === notes[94].id ? { ...n, title: 'Renamed synthetic note' } : n), 95, notes[94].id); await delay();
    assert.equal(document.querySelector(`[data-folder-graph-note="${notes[94].id}"]`)!.getAttribute('aria-label'), 'Open Renamed synthetic note');
    h.ui.setOpen(false); assert.equal(document.querySelector<HTMLElement>('#notes-panel')!.inert, true);
  } finally { h.close(); }
});
test('opening a note or returning to the editor keeps the directory and graph visible until navigation closes', async () => {
  const h = setup();
  try {
    h.ui.setNotes([note(100)], 1, null); await delay();
    document.querySelector<HTMLButtonElement>('[data-folder-graph-note]')!.click(); await delay(10);
    h.ui.noteOpened();
    document.querySelector('#editor')!.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
    assert.equal(document.querySelector<HTMLElement>('#notes-panel')!.hidden, false);
    assert.equal(document.querySelector<HTMLElement>('#folder-graph')!.hidden, false);
    assert.equal(document.activeElement!.id, 'editor');
    h.ui.setOpen(false);
    assert.equal(document.querySelector<HTMLElement>('#folder-graph')!.inert, true);
    h.ui.setOpen(true);
    assert.equal(document.querySelector<HTMLElement>('#folder-graph')!.hidden, false);
  } finally { h.close(); }
});

test('leaving the graph restores the open note while keyboard focus keeps its own highlight', async () => {
  const h = setup();
  try {
    const notes = [note(100), note(101)];
    document.querySelector('#note-list')!.innerHTML = notes.map(n => `<div class="note-card-shell"><button data-note="${n.id}">${n.title}</button></div>`).join('');
    h.ui.setNotes(notes, 2, notes[0].id); await delay();
    const canvas = document.querySelector('#folder-graph-nodes')!;
    const other = document.querySelector<HTMLButtonElement>(`[data-folder-graph-note="${notes[1].id}"]`)!;
    const highlighted = () => document.querySelector<HTMLElement>('[data-folder-graph-note].highlighted')?.dataset.folderGraphNote;
    other.dispatchEvent(new window.Event('pointerover', { bubbles: true }));
    assert.equal(highlighted(), notes[1].id);
    canvas.dispatchEvent(new window.Event('pointerleave'));
    assert.equal(highlighted(), notes[0].id, 'An old pointer target must not remain highlighted after leaving');
    other.focus(); canvas.dispatchEvent(new window.Event('pointerleave'));
    assert.equal(highlighted(), notes[1].id, 'Leaving with the pointer must preserve keyboard focus');
    document.querySelector<HTMLButtonElement>('#folder-graph-refresh')!.focus();
    assert.equal(highlighted(), notes[0].id, 'Moving focus to another control must clear the graph target');
    assert.equal(document.querySelector('#folder-graph-caption')!.textContent, notes[0].title);
  } finally { h.close(); }
});
test('late graph results cannot overwrite another collection and failed requests can retry', async () => {
  const pending: Array<{ resolve(value: PairState[]): void; reject(error: Error): void }> = [];
  const h = setup(() => new Promise((resolve, reject) => pending.push({ resolve, reject })));
  try {
    h.ui.setNotes([note(100), note(101)], 2, null); await waitUntil(() => pending.length >= 1);
    h.ui.setNotes([note(200)], 1, null); await waitUntil(() => pending.length >= 2);
    pending[0].resolve([{ a: id(100), b: id(101), connected: true, dismissed: false, revision: 1, strength: 1 }]);
    pending[1].reject(new Error('Synthetic failure')); await delay(10);
    assert.match(document.querySelector('#folder-graph-summary')!.textContent!, /could not load/);
    assert.equal(document.querySelectorAll('#folder-graph-canvas line').length, 0);
    document.querySelector<HTMLButtonElement>('#folder-graph-refresh')!.click(); await waitUntil(() => pending.length >= 3); pending[2].resolve([]); await delay(10);
    assert.match(document.querySelector('#folder-graph-summary')!.textContent!, /1 of 1 notes/);
    h.ui.setNotes([], 0, null); await delay(30); assert.match(document.querySelector('#folder-graph-summary')!.textContent!, /no notes yet/);
    h.ui.loading(); assert.equal(document.querySelector('#notes-panel')!.getAttribute('aria-busy'), 'true');
    h.ui.failed(); assert.match(document.querySelector('#collection-status')!.textContent!, /Select the collection again/);
  } finally { h.close(); }
});
test('graph windows preserve source order, include late hovered notes, and leave room for native hit targets', () => {
  const notes = Array.from({ length: 100 }, (_, i) => note(i + 100));
  assert.equal(graphWindow(notes, notes[99].id, 60).length, 60); assert.equal(graphWindow(notes, notes[99].id, 60).at(-1)!.id, notes[99].id);
  for (const [width, height] of [[180, 200], [300, 300], [410, 410]]) {
    const capacity = graphCapacity(width, height), positions = graphPositions(capacity, width, height);
    assert.ok(positions.every(p => p.x >= 22 && p.x <= width - 22 && p.y >= 22 && p.y <= height - 22));
    for (let i = 0; i < positions.length; i++) for (let j = i + 1; j < positions.length; j++) assert.ok(Math.hypot(positions[i].x - positions[j].x, positions[i].y - positions[j].y) >= 44);
    const denseEdges = Array.from({ length: capacity }, (_, a) => Array.from({ length: a }, (_, b) => ({ a, b }))).flat();
    const dense = graphPositions(capacity, width, height, denseEdges);
    for (let i = 0; i < dense.length; i++) for (let j = i + 1; j < dense.length; j++) assert.ok(Math.hypot(dense[i].x - dense[j].x, dense[i].y - dense[j].y) >= 44, 'Dense connections must not collapse hit targets');
  }
  assert.equal(notes.length, 100);
});
test('device folder icons survive rename, reject markup and retain session fallback when writes fail', () => {
  const h = setup();
  try {
    assert.equal(validFolderIcon('<script>'), false); assert.ok(!folderIconMarkup('<script>').includes('<script>'));
    assert.equal(folderAppearance.set(id(1), 'book'), true); assert.equal(folderAppearance.get(id(1)), 'book');
    h.ui.setFolders([{ ...folders[0], name: 'Renamed folder' }], id(1)); assert.match(document.querySelector('[data-folder]')!.textContent!, /Unfiled/);
    assert.equal(folderAppearance.get(id(1)), 'book');
    h.dom.window.Storage.prototype.setItem = () => { throw new Error('Restricted'); };
    assert.equal(folderAppearance.set(id(1), 'leaf'), false); assert.equal(folderAppearance.get(id(1)), 'leaf');
  } finally { h.close(); }
});

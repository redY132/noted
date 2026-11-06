import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { initializeQuickOpen } from './quick-open.ts';
import type { NoteSummary, Page } from './model.ts';
const note = (n: number): NoteSummary => ({ id: `quick-${n}`, title: `Synthetic note ${n}`, folderId: 'child', tags: [], revision: 1, createdAt: '2026-11-06T00:00:00Z', updatedAt: '2026-11-06T00:00:00Z' });
const page = (items: NoteSummary[], nextCursor: number | null = null, total = items.length): Page<NoteSummary> => ({ items, nextCursor, total });
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
async function until(condition: () => boolean) { const deadline = Date.now() + 5000; while (!condition()) { assert.ok(Date.now() < deadline); await new Promise(resolve => setTimeout(resolve, 10)); } }
function setup(search: (query: string, cursor: number) => Promise<Page<NoteSummary>>, open: (id: string) => Promise<boolean> = async () => true, indexing?: () => Promise<boolean>) {
  const dom = new JSDOM('<button id="opener">Open</button><div id="host"></div><div id="writer" tabindex="0">Synthetic draft</div>');
  Object.assign(dom.window.HTMLDialogElement.prototype, {
    showModal(this: HTMLDialogElement) { this.setAttribute('open', ''); },
    close(this: HTMLDialogElement) { this.removeAttribute('open'); this.dispatchEvent(new dom.window.Event('close')); },
  });
  const host = dom.window.document.querySelector<HTMLElement>('#host')!, $ = <T extends HTMLElement>(s: string) => dom.window.document.querySelector<T>(s)!;
  const opened: string[] = [];
  const ui = initializeQuickOpen(host, { search, indexing, current: () => 'quick-1', folders: () => [{ id: 'parent', name: 'Research', parentId: null }, { id: 'child', name: 'Field notes', parentId: 'parent' }], open: async id => { opened.push(id); return open(id); }, focusEditor: () => $('#writer').focus() });
  return { dom, $, opened, ui, close() { ui.destroy(); dom.window.close(); } };
}
test('quick open searches metadata, labels folders and opens through the normal navigation callback', async () => {
  const calls: unknown[] = [], h = setup(async (query, cursor) => { calls.push([query, cursor]); return page([note(1), { ...note(2), title: '<script>Synthetic</script>' }]); });
  try {
    h.$('#opener').focus(); h.ui.show(); await tick();
    assert.deepEqual(calls, [['', 0]]); assert.equal(h.$('#quick-open-search'), h.dom.window.document.activeElement);
    assert.equal(h.$('[data-quick-note="quick-1"]').getAttribute('aria-current'), 'page');
    assert.match(h.$('[data-quick-results]').textContent!, /Research \/ Field notes/); assert.equal(h.$('[data-quick-results]').querySelector('script'), null);
    h.$('[data-quick-note="quick-2"]').click(); await tick();
    assert.deepEqual(h.opened, ['quick-2']); assert.equal(h.$<HTMLDialogElement>('dialog').open, false); assert.equal(h.dom.window.document.activeElement, h.$('#writer'));
  } finally { h.close(); }
});
test('typing invalidates old results immediately and stale searches cannot replace a newer result', async () => {
  const pending: Array<{ query: string; resolve(value: Page<NoteSummary>): void }> = [];
  const h = setup(query => new Promise(resolve => pending.push({ query, resolve })));
  try {
    h.ui.show(); pending[0].resolve(page([note(1)])); await tick();
    const input = h.$<HTMLInputElement>('#quick-open-search'); input.value = 'first'; input.dispatchEvent(new h.dom.window.Event('input'));
    assert.equal(h.$('[data-quick-results]').children.length, 0);
    input.dispatchEvent(new h.dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); assert.equal(h.opened.length, 0);
    await until(() => pending.length === 2);
    input.value = 'second'; input.dispatchEvent(new h.dom.window.Event('input')); await until(() => pending.length === 3);
    pending[2].resolve(page([note(3)])); await tick(); pending[1].resolve(page([note(2)])); await tick();
    assert.equal(h.$('[data-quick-results]').querySelector('[data-quick-note]')?.getAttribute('data-quick-note'), 'quick-3');
  } finally { h.close(); }
});
test('paging deduplicates notes and preserves the focused result', async () => {
  const h = setup(async (_, cursor) => cursor === 0 ? page([note(1), note(2)], 2, 3) : page([note(2), note(3)], null, 3));
  try {
    h.ui.show(); await tick(); h.$('[data-quick-note="quick-2"]').focus(); h.$('[data-quick-more]').click(); await tick();
    assert.equal(h.$('[data-quick-results]').children.length, 3); assert.equal((h.dom.window.document.activeElement as HTMLElement).dataset.quickNote, 'quick-2');
    assert.equal(h.$('[data-quick-more]').hidden, true); assert.match(h.$('#quick-open-status').textContent!, /3 of 3/);
  } finally { h.close(); }
});
test('keyboard navigation and cancellation restore focus without opening a note', async () => {
  const h = setup(async () => page([note(1), note(2)]));
  try {
    h.$('#opener').focus(); h.ui.show(); await tick();
    const key = (key: string) => h.dom.window.document.activeElement!.dispatchEvent(new h.dom.window.KeyboardEvent('keydown', { key, bubbles: true }));
    key('ArrowDown'); assert.equal((h.dom.window.document.activeElement as HTMLElement).dataset.quickNote, 'quick-1');
    key('End'); assert.equal((h.dom.window.document.activeElement as HTMLElement).dataset.quickNote, 'quick-2');
    key('Home'); key('ArrowUp'); assert.equal(h.dom.window.document.activeElement, h.$('#quick-open-search'));
    h.$<HTMLInputElement>('#quick-open-search').value = 'Synthetic'; key('Escape');
    assert.equal(h.$<HTMLDialogElement>('dialog').open, false); assert.equal(h.dom.window.document.activeElement, h.$('#opener')); assert.equal(h.opened.length, 0);
  } finally { h.close(); }
});
test('keyboard paging focuses the first new result when Show more disappears', async () => {
  const h = setup(async (_, cursor) => cursor === 0 ? page([note(1)], 1, 2) : page([note(2)], null, 2));
  try {
    h.ui.show(); await tick(); h.$('[data-quick-more]').focus(); h.$('[data-quick-more]').click(); await tick();
    assert.equal((h.dom.window.document.activeElement as HTMLElement).dataset.quickNote, 'quick-2');
  } finally { h.close(); }
});
test('failed search retries, empty results explain the next step, and a refused navigation preserves the dialog', async () => {
  let attempts = 0;
  const h = setup(async () => { if (++attempts === 1) throw new Error('Synthetic failure'); return attempts === 2 ? page([]) : page([note(1)]); }, async () => false);
  try {
    h.ui.show(); await tick(); assert.equal(h.$('[data-quick-retry]').hidden, false); assert.match(h.$('#quick-open-status').textContent!, /current note is unchanged/);
    h.$('[data-quick-retry]').click(); await tick(); assert.match(h.$('#quick-open-status').textContent!, /No saved notes/);
    const input = h.$<HTMLInputElement>('#quick-open-search'); input.value = 'Synthetic'; input.dispatchEvent(new h.dom.window.Event('input')); await until(() => !!h.$('[data-quick-results]').children.length);
    h.$('[data-quick-note]').click(); await tick(); assert.equal(h.$<HTMLDialogElement>('dialog').open, true); assert.match(h.$('#quick-open-status').textContent!, /draft is preserved/);
  } finally { h.close(); }
});
test('duplicate opens and cancellation are blocked while saving', async () => {
  let release: ((value: boolean) => void) | undefined;
  const h = setup(async () => page([note(1)]), () => new Promise(resolve => { release = resolve; }));
  try {
    h.ui.show(); await tick(); h.$('[data-quick-note]').click(); h.$('[data-quick-note]').click();
    assert.equal(h.opened.length, 1); const cancel = new h.dom.window.Event('cancel', { cancelable: true }); h.$('dialog').dispatchEvent(cancel); assert.equal(cancel.defaultPrevented, true);
    release!(true); await tick(); assert.equal(h.$<HTMLDialogElement>('dialog').open, false);
  } finally { h.close(); }
});
test('closing discards late search results and another open dialog is respected', async () => {
  let release: ((value: Page<NoteSummary>) => void) | undefined, searches = 0;
  const h = setup(() => { searches++; return new Promise(resolve => { release = resolve; }); });
  try {
    h.ui.show(); h.$('[data-quick-close]').click(); release!(page([note(1)])); await tick();
    assert.equal(h.$('[data-quick-results]').children.length, 0); assert.equal(h.$<HTMLDialogElement>('dialog').open, false);
    const other = h.dom.window.document.createElement('dialog'); other.setAttribute('open', ''); h.dom.window.document.body.append(other);
    h.ui.show(); assert.equal(searches, 1); assert.equal(h.$<HTMLDialogElement>('dialog').open, false);
  } finally { h.close(); }
});
test('an updating index is not reported as an empty library and incomplete folder metadata is not called Unfiled', async () => {
  let indexing = true, attempts = 0;
  const h = setup(async () => ++attempts === 1 ? page([]) : page([{ ...note(1), folderId: 'missing' }]), async () => true, async () => indexing);
  try {
    h.ui.show(); await tick(); assert.match(h.$('#quick-open-status').textContent!, /index is updating/); assert.doesNotMatch(h.$('#quick-open-status').textContent!, /No saved notes/);
    indexing = false; h.$('[data-quick-retry]').click(); await tick();
    assert.match(h.$('[data-quick-results]').textContent!, /Folder unavailable/); assert.equal(h.$('[data-quick-retry]').hidden, true);
  } finally { h.close(); }
});
test('closing makes an exiting dialog inert and reopening restores keyboard interaction', async () => {
  const h = setup(async () => page([note(1)]));
  try {
    h.ui.show(); await tick(); assert.equal(h.$<HTMLElement>('dialog').inert, false);
    h.$('[data-quick-close]').click(); assert.equal(h.$<HTMLElement>('dialog').inert, true);
    h.ui.show(); await tick(); assert.equal(h.$<HTMLElement>('dialog').inert, false); assert.equal(h.dom.window.document.activeElement, h.$('#quick-open-search'));
  } finally { h.close(); }
});

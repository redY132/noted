import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { initializeReview, type ReviewItem } from './review-ui.ts';
import type { Folder } from './model.ts';
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const item = (id: string, title = `Synthetic review ${id}`): ReviewItem => ({ note: { id, title, folderId: 'child', tags: ['field'], revision: 1, createdAt: '2026-11-06T00:00:00Z', updatedAt: '2026-11-06T00:00:00Z' }, reasons: ['Last edited 8 days ago'] });
async function until(predicate: () => boolean) { const end = Date.now() + 5000; while (!predicate()) { assert.ok(Date.now() < end, 'Condition did not settle'); await new Promise(resolve => setTimeout(resolve, 10)); } }
function setup(feed: (folder: string | null, tag: string, hidden: boolean) => Promise<ReviewItem[]> = async () => [item('a'), item('b')], action: (id: string, action: string) => Promise<void> = async () => {}, open: (id: string) => Promise<boolean> = async () => true) {
  const dom = new JSDOM('<button id="opener">Review</button><div id="host"></div><div id="writer" tabindex="0">Synthetic draft</div>', { pretendToBeVisual: true });
  Object.assign(dom.window.HTMLDialogElement.prototype, { showModal(this: HTMLDialogElement) { this.setAttribute('open', ''); }, close(this: HTMLDialogElement) { this.removeAttribute('open'); this.dispatchEvent(new dom.window.Event('close')); } });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  const $ = <T extends HTMLElement>(s: string) => dom.window.document.querySelector<T>(s)!;
  let clock = new Date('2026-11-06T12:00:00Z'), folders: Folder[] = [{ id: 'parent', name: 'Research', parentId: null }, { id: 'child', name: 'Field notes', parentId: 'parent' }];
  const calls: unknown[][] = [], writes: string[][] = [], opened: string[] = [];
  const ui = initializeReview($('#host'), { api: { reviewFeed: async (...args) => { calls.push(args); return feed(...args); }, reviewAction: async (...args) => { writes.push(args); await action(...args); } }, folders: () => folders, now: () => clock, open: async id => { opened.push(id); return open(id); }, focusEditor: () => $('#writer').focus() });
  return { dom, $, calls, writes, opened, ui, clock(value: string) { clock = new Date(value); }, folders(value: Folder[]) { folders = value; }, close() { ui.destroy(); dom.window.close(); } };
}

test('review opens immediately, names safe metadata and folder paths, and clears retained results on close', async () => {
  let resolve!: (items: ReviewItem[]) => void; const h = setup(() => new Promise(r => { resolve = r; }));
  try {
    h.$('#opener').focus(); h.ui.show();
    assert.equal(h.$<HTMLDialogElement>('dialog').open, true); assert.match(h.$('[data-review-queue-status]').textContent!, /Loading/);
    assert.equal(h.$('[data-review-close]'), h.dom.window.document.activeElement); assert.equal(h.$('[data-review-list]').getAttribute('aria-busy'), 'true');
    resolve([item('a', '<script>Synthetic</script>')]); await tick();
    assert.equal(h.$('[data-review-list] script'), null); assert.match(h.$('[data-review-list]').textContent!, /<script>Synthetic<\/script>/);
    assert.match(h.$('[data-review-folder]').textContent!, /Research \/ Field notes/); assert.equal(h.$('[data-review-action="reset"]'), null);
    h.$('[data-review-close]').click(); assert.equal(h.$<HTMLDialogElement>('dialog').inert, true); assert.equal(h.$('[data-review-list]').children.length, 0); assert.equal(h.dom.window.document.activeElement, h.$('#opener'));
  } finally { h.close(); }
});
test('filter changes immediately invalidate rows and late responses cannot replace the latest queue', async () => {
  const pending: Array<(items: ReviewItem[]) => void> = []; const h = setup(() => new Promise(r => pending.push(r)));
  try {
    h.ui.show(); pending[0]([item('a')]); await tick(); const stale = h.$('[data-review-action="reviewed"]');
    const tag = h.$<HTMLInputElement>('[data-review-tag]'); tag.value = 'first'; tag.dispatchEvent(new h.dom.window.Event('input'));
    assert.equal(h.$('[data-review-list]').children.length, 0); stale.click(); assert.equal(h.writes.length, 0); await until(() => pending.length === 2);
    tag.value = 'second'; tag.dispatchEvent(new h.dom.window.Event('input')); await until(() => pending.length === 3);
    pending[2]([item('latest')]); await tick(); pending[1]([item('old')]); await tick();
    assert.ok(h.$('[data-review-note="latest"]')); assert.equal(h.$('[data-review-note="old"]'), null); assert.deepEqual(h.calls[2], [null, 'second', false]);
  } finally { h.close(); }
});
test('read failures offer Refresh, filtered empty states explain recovery, and hidden results offer Reset', async () => {
  let fail = true; const h = setup(async (_, __, hidden) => { if (fail) throw new Error('Synthetic unavailable index'); return hidden ? [item('a')] : []; });
  try {
    h.ui.show(); await tick(); assert.match(h.$('[data-review-queue-status]').textContent!, /Use Refresh to retry/); assert.equal(h.$<HTMLButtonElement>('[data-review-refresh]').disabled, false);
    fail = false; h.$('[data-review-refresh]').click(); await tick(); assert.match(h.$('[data-review-list]').textContent!, /No notes due/);
    const hidden = h.$<HTMLInputElement>('[data-review-hidden]'); hidden.checked = true; hidden.dispatchEvent(new h.dom.window.Event('change')); await tick(); assert.ok(h.$('[data-review-action="reset"]'));
    h.$<HTMLSelectElement>('[data-review-folder]').value = 'child'; h.$('[data-review-folder]').dispatchEvent(new h.dom.window.Event('change')); await tick(); assert.deepEqual(h.calls.at(-1), ['child', '', true]);
  } finally { h.close(); }
});
test('review mutations coalesce duplicate clicks and focus the next item after the queue changes', async () => {
  let resolve!: () => void, changed = false; const h = setup(async () => changed ? [item('b')] : [item('a'), item('b')], () => new Promise(r => { resolve = () => { changed = true; r(); }; }));
  try {
    h.ui.show(); await tick(); const button = h.$('[data-review-action="reviewed"]'); button.click(); button.click();
    assert.deepEqual(h.writes, [['a', 'reviewed']]); assert.equal(h.$<HTMLInputElement>('[data-review-tag]').disabled, true); assert.equal(h.$('[data-review-list]').inert, true);
    resolve(); await tick(); await tick(); assert.match(h.$('[data-review-queue-status]').textContent!, /Marked as reviewed/); assert.equal((h.dom.window.document.activeElement as HTMLElement).dataset.id, 'b');
    assert.equal((h.dom.window.document.activeElement as HTMLElement).dataset.reviewAction, 'reviewed'); assert.equal(h.$<HTMLInputElement>('[data-review-tag]').disabled, false);
  } finally { h.close(); }
});
test('a failed choice retains the queue for retry and a successful write remains explicit if refresh fails', async () => {
  let failAction = true, failRead = false; const h = setup(async () => { if (failRead) throw new Error('Synthetic refresh failure'); return [item('a')]; }, async () => { if (failAction) throw new Error('Synthetic write failure'); failRead = true; });
  try {
    h.ui.show(); await tick(); h.$('[data-review-action="snooze"]').click(); await tick();
    assert.match(h.$('[data-review-queue-status]').textContent!, /Could not confirm/); assert.ok(h.$('[data-review-note="a"]')); assert.equal(h.$<HTMLButtonElement>('[data-review-action="snooze"]').disabled, false);
    failAction = false; h.$('[data-review-action="snooze"]').click(); await tick(); await tick();
    assert.match(h.$('[data-review-queue-status]').textContent!, /Snoozed for 24 hours.*Could not load/); assert.equal(h.dom.window.document.activeElement, h.$('[data-review-refresh]'));
  } finally { h.close(); }
});
test('Open uses save-before-navigation, blocks cancellation while saving, and keeps the dialog after a refused open', async () => {
  let resolve!: (opened: boolean) => void; const h = setup(undefined, undefined, () => new Promise(r => { resolve = r; }));
  try {
    h.ui.show(); await tick(); const button = h.$('[data-review-open="a"]'); button.click(); button.click();
    h.$('dialog').dispatchEvent(new h.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); assert.equal(h.$<HTMLDialogElement>('dialog').open, true); assert.deepEqual(h.opened, ['a']);
    resolve(false); await tick(); assert.match(h.$('[data-review-queue-status]').textContent!, /current draft stays open/); assert.equal(h.$<HTMLDialogElement>('dialog').open, true);
    button.click(); resolve(true); await tick(); assert.equal(h.$<HTMLDialogElement>('dialog').open, false); assert.equal(h.dom.window.document.activeElement, h.$('#writer'));
  } finally { h.close(); }
});
test('late reads are ignored after close and reopening during a choice waits for that mutation', async () => {
  let finish!: () => void; const pending: Array<(items: ReviewItem[]) => void> = []; const h = setup(() => new Promise(r => pending.push(r)), () => new Promise(r => { finish = r; }));
  try {
    h.ui.show(); h.$('[data-review-close]').click(); pending[0]([item('late')]); await tick(); assert.equal(h.$('[data-review-list]').children.length, 0);
    h.ui.show(); pending[1]([item('a')]); await tick(); h.$('[data-review-action="dismiss"]').click(); h.$('[data-review-close]').click(); h.ui.show();
    assert.match(h.$('[data-review-queue-status]').textContent!, /Finishing/); assert.equal(h.calls.length, 2);
    finish(); await tick(); assert.equal(h.calls.length, 3); pending[2]([]); await tick(); assert.equal(h.$<HTMLInputElement>('[data-review-tag]').disabled, false);
  } finally { h.close(); }
});
test('resuming refreshes only an open queue whose device day changed, without writing review state', async () => {
  const h = setup();
  try {
    h.ui.show(); await tick(); h.dom.window.dispatchEvent(new h.dom.window.Event('focus')); assert.equal(h.calls.length, 1);
    h.clock('2026-11-08T12:00:00Z'); h.dom.window.dispatchEvent(new h.dom.window.Event('focus')); await tick(); assert.equal(h.calls.length, 2); assert.match(h.$('[data-review-queue-status]').textContent!, /local review day changed/);
    h.$('[data-review-close]').click(); h.clock('2026-11-09T12:00:00Z'); h.dom.window.dispatchEvent(new h.dom.window.Event('focus')); assert.equal(h.calls.length, 2); assert.equal(h.writes.length, 0);
  } finally { h.close(); }
});
test('another modal is respected and one Escape closes even a nonempty search', async () => {
  const h = setup();
  try {
    const other = h.dom.window.document.createElement('dialog'); other.setAttribute('open', ''); h.dom.window.document.body.append(other); h.ui.show(); assert.equal(h.calls.length, 0); other.remove();
    h.ui.show(); await tick(); h.$('dialog').dispatchEvent(new h.dom.window.Event('close')); assert.equal(h.$<HTMLDialogElement>('dialog').inert, false);
    h.$<HTMLInputElement>('[data-review-tag]').value = 'synthetic'; h.$('[data-review-tag]').dispatchEvent(new h.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); assert.equal(h.$<HTMLDialogElement>('dialog').inert, true); assert.equal(h.$<HTMLDialogElement>('dialog').open, false);
  } finally { h.close(); }
});

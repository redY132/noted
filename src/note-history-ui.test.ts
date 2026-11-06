import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { NavigationHistory, type HistoryTarget } from './navigation-history.ts';
import { initializeNoteHistory } from './note-history-ui.ts';
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function setup(go: (target: HistoryTarget) => Promise<boolean> = async () => true) {
  const dom = new JSDOM('<header class="shell-topbar"><div class="shell-controls"><button id="view-toggle">View</button></div></header><section id="view-popover" hidden></section><div id="host"></div><button id="writer">Writer</button><dialog id="other"></dialog>');
  Object.assign(dom.window.HTMLDialogElement.prototype, {
    showModal(this: HTMLDialogElement) { this.setAttribute('open', ''); },
    close(this: HTMLDialogElement) { this.removeAttribute('open'); this.dispatchEvent(new dom.window.Event('close')); },
  });
  const $ = <T extends HTMLElement>(s: string) => dom.window.document.querySelector<T>(s)!;
  let width = 900, busy = false; Object.defineProperty($('.shell-topbar'), 'clientWidth', { get: () => width });
  const history = new NavigationHistory(); for (const id of ['a', 'b', 'c']) history.record({ id, title: `Synthetic ${id}`, folderId: null });
  const opened: string[] = [];
  const ui = initializeNoteHistory($('#host'), { history, busy: () => busy, folder: () => 'Unfiled', go: async target => { opened.push(target.id); const okay = await go(target); if (okay) history.commit(target, { id: target.id, title: `Synthetic ${target.id}`, folderId: null }); return okay; }, focusEditor: () => $('#writer').focus() });
  return { dom, $, ui, history, opened, width(value: number) { width = value; dom.window.dispatchEvent(new dom.window.Event('resize')); }, busy(value: boolean) { busy = value; ui.sync(); }, close() { ui.destroy(); dom.window.close(); } };
}
test('Back and Forward navigate one saved visit at a time, including during a pending open', async () => {
  let resolve!: (okay: boolean) => void; const h = setup(() => new Promise(r => { resolve = r; }));
  try {
    const back = h.$<HTMLButtonElement>('[aria-label="Back to note"]'), forward = h.$<HTMLButtonElement>('[aria-label="Forward to note"]');
    assert.equal(back.disabled, false); assert.equal(forward.disabled, true);
    back.click(); back.click(); assert.deepEqual(h.opened, ['b']); assert.equal(h.history.snapshot().cursor, 2);
    resolve(true); await tick(); assert.equal(h.history.snapshot().cursor, 1); assert.equal(forward.disabled, false); assert.equal(h.dom.window.document.activeElement, h.$('#writer'));
  } finally { h.close(); }
});
test('history lists unavailable and current visits, escapes titles and retries a failed open', async () => {
  let okay = false; const h = setup(async () => okay);
  try {
    h.history.update({ id: 'a', title: '<script>Synthetic</script>', folderId: null }); h.history.unavailable('b'); h.ui.sync();
    h.$('#view-toggle').focus(); h.ui.show();
    const dialog = h.$<HTMLDialogElement>('.note-history-dialog'); assert.equal(dialog.inert, false); assert.equal(dialog.open, true);
    assert.equal(h.$<HTMLButtonElement>('[data-history-index="1"]').disabled, true); assert.match(h.$('[data-history-list]').textContent!, /In Trash/);
    assert.equal(h.$('[data-history-list]').querySelector('script'), null); assert.equal(h.$('[aria-current="page"]').getAttribute('data-history-index'), '2');
    h.$('[data-history-index="0"]').click(); await tick(); assert.equal(dialog.open, true); assert.match(h.$('[data-history-status]').textContent!, /draft is kept open/); assert.equal(h.history.snapshot().cursor, 2);
    okay = true; h.$('[data-history-index="0"]').click(); await tick(); assert.equal(dialog.open, false); assert.equal(dialog.inert, true); assert.equal(h.history.snapshot().cursor, 0);
  } finally { h.close(); }
});
test('narrow toolbar hides controls without losing View commands or keyboard access', async () => {
  const h = setup();
  try {
    h.$('[aria-label="Back to note"]').focus(); h.width(280);
    assert.equal(h.$('.note-history-controls').hidden, true); assert.equal(h.dom.window.document.activeElement, h.$('#view-toggle'));
    h.$('#shell-history-back').click(); await tick(); assert.deepEqual(h.opened, ['b']);
    h.dom.window.document.dispatchEvent(new h.dom.window.KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, cancelable: true })); await tick(); assert.deepEqual(h.opened, ['b', 'a']);
    h.$<HTMLDialogElement>('#other').showModal(); h.dom.window.document.dispatchEvent(new h.dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, cancelable: true })); await tick(); assert.deepEqual(h.opened, ['b', 'a']);
    h.width(900); assert.equal(h.$('.note-history-controls').hidden, false);
  } finally { h.close(); }
});
test('closing, clearing and repeated opening keep the native dialog inert and focus predictable', () => {
  const h = setup();
  try {
    h.ui.show(h.$('#view-toggle')); h.$('[data-history-clear]').click(); assert.equal(h.history.snapshot().visits.length, 1);
    h.$('[data-history-close]').click(); assert.equal(h.$<HTMLDialogElement>('.note-history-dialog').open, false); assert.equal(h.$<HTMLDialogElement>('.note-history-dialog').inert, true);
    assert.equal(h.dom.window.document.activeElement, h.$('#view-toggle'));
    h.ui.show(); assert.equal(h.$<HTMLDialogElement>('.note-history-dialog').inert, false);
    h.busy(true); assert.equal(h.$<HTMLButtonElement>('#shell-note-history').disabled, true);
  } finally { h.close(); }
});

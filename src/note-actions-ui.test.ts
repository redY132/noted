import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { initializeNoteActions } from './note-actions-ui.ts';
function setup() {
  const dom = new JSDOM('<button id="view-toggle" aria-expanded="true">View</button><section id="view-popover"></section><main class="workspace"><section id="note-pane"><div class="note-product-actions"><button id="ai">Format with AI</button><button id="trash">Move note to Trash</button></div><div contenteditable="true">Synthetic writing</div></section></main>');
  if (!('inert' in dom.window.HTMLElement.prototype)) Object.defineProperty(dom.window.HTMLElement.prototype, 'inert', { get() { return this.hasAttribute('inert'); }, set(value: boolean) { this.toggleAttribute('inert', value); } });
  const $ = <T extends HTMLElement>(s: string) => dom.window.document.querySelector<T>(s)!;
  let height = 800; Object.defineProperty($('.workspace'), 'clientHeight', { get: () => height });
  const calls: string[] = []; $('#ai').onclick = () => { calls.push('ai'); }; $('#trash').onclick = () => { calls.push('trash'); };
  const ui = initializeNoteActions($('.workspace'), $('#view-popover'));
  return { dom, $, ui, calls, resize(value: number) { height = value; dom.window.dispatchEvent(new dom.window.Event('resize')); }, close() { ui.destroy(); dom.window.close(); } };
}
test('short writing areas move note actions into View without replacing the editor', () => {
  const h = setup(); try {
    const writer = h.$('[contenteditable]'); h.$('#ai').focus(); h.resize(240);
    assert.equal(h.$('.note-product-actions').hidden, true); assert.equal(h.$('.note-product-actions').inert, true);
    assert.equal(h.dom.window.document.activeElement, h.$('#view-toggle'));
    h.$('#shell-action-ai').click(); assert.deepEqual(h.calls, ['ai']);
    assert.equal(h.$('#view-popover').hidden, true); assert.equal(h.$('#view-popover').inert, true); assert.equal(h.$('#view-toggle').getAttribute('aria-expanded'), 'false');
    h.resize(800); assert.equal(h.$('.note-product-actions').hidden, false); assert.equal(h.$('.note-product-actions').inert, false); assert.equal(h.$('[contenteditable]'), writer);
  } finally { h.close(); }
});
test('menu commands respect hidden, navigating and disabled note states', async () => {
  const h = setup(); try {
    h.$('#note-pane').inert = true; h.$('#shell-action-trash').click(); assert.equal(h.calls.length, 0);
    await Promise.resolve(); assert.equal(h.$<HTMLButtonElement>('#shell-action-trash').disabled, true);
    h.$('#note-pane').inert = false; h.$('#note-pane').hidden = true; await Promise.resolve(); assert.equal(h.$<HTMLButtonElement>('#shell-action-ai').disabled, true);
    h.$('#note-pane').hidden = false; h.$<HTMLButtonElement>('#ai').disabled = true; await Promise.resolve(); assert.equal(h.$<HTMLButtonElement>('#shell-action-ai').disabled, true);
    h.$('#shell-action-ai').click(); assert.equal(h.calls.length, 0);
  } finally { h.close(); }
});

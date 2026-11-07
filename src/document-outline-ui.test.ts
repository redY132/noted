import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { Schema } from '@tiptap/pm/model';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { history, undo, undoDepth } from '@tiptap/pm/history';
import type { Editor } from '@tiptap/core';
import { initializeDocumentOutline } from './document-outline-ui.ts';
const schema = new Schema({ nodes: { doc: { content: 'block+', attrs: { readingOrder: { default: [] } } }, heading: { group: 'block', content: 'text*', attrs: { id: { default: null }, level: { default: 1 } } }, paragraph: { group: 'block', content: 'text*', attrs: { id: { default: null } } }, text: {} } });
const heading = (n: number) => schema.node('heading', { id: `h${n}`, level: n % 6 + 1 }, schema.text(n === 3 ? '<script>Synthetic title</script>' : `Synthetic section ${n}`));
function setup(count = 105) {
  const dom = new JSDOM('<button id="view-toggle">View</button><section id="view-popover"></section><div id="host"></div><div id="scroll"><div id="writer" tabindex="0">Synthetic editor</div></div><dialog id="other"></dialog>');
  Object.assign(dom.window.HTMLDialogElement.prototype, { showModal(this: HTMLDialogElement) { this.setAttribute('open', ''); }, close(this: HTMLDialogElement) { this.removeAttribute('open'); this.dispatchEvent(new dom.window.Event('close')); } });
  const $ = <T extends HTMLElement>(s: string) => dom.window.document.querySelector<T>(s)!;
  let state = EditorState.create({ doc: schema.node('doc', null, count ? Array.from({ length: count }, (_, index) => heading(index)) : [schema.node('paragraph')]), plugins: [history()] }), id: string | null = 'synthetic-note', busy = false, writes = 0, focusedForScroll = false;
  const editor = { get state() { return state; }, view: { dom: $('#writer'), dispatch(tr: Parameters<EditorState['apply']>[0]) { if (tr.docChanged) writes++; if(tr.scrolledIntoView)focusedForScroll=dom.window.document.activeElement===$('#writer'); state = state.apply(tr); }, focus() { $('#writer').focus(); } } } as unknown as Editor;
  const ui = initializeDocumentOutline($('#host'), { menu: $('#view-popover'), editor: () => id ? editor : null, noteId: () => id, title: () => 'Synthetic outline note', busy: () => busy, scroll: () => $('#scroll') });
  return { dom, $, ui, editor, writes: () => writes, focusedForScroll:()=>focusedForScroll, change(tr: Parameters<EditorState['apply']>[0]) { state = state.apply(tr); }, note(value: string | null) { id = value; ui.sync(); }, busy(value: boolean) { busy = value; ui.sync(); }, undo() { return undo(state, tr => { state = state.apply(tr); }); }, close() { ui.destroy(); dom.window.close(); } };
}
test('heading search and keyboard paging render bounded rows and treat labels as text', () => {
  const h = setup(); try {
    h.ui.show(); assert.equal(h.$('[data-outline-search]'), h.dom.window.document.activeElement); assert.equal(h.$('[data-outline-results]').children.length, 40); assert.equal(h.$('[data-outline-results]').querySelector('script'), null);
    h.$('[data-outline-more]').click(); assert.equal(h.$('[data-outline-results]').children.length, 80); assert.equal(h.$('[data-outline-index="40"]'), h.dom.window.document.activeElement);
    h.$('[data-outline-more]').click(); assert.equal(h.$('[data-outline-results]').children.length, 105); assert.equal(h.$('[data-outline-more]').hidden, true); assert.equal(h.$('[data-outline-index="80"]'), h.dom.window.document.activeElement);
    const input = h.$<HTMLInputElement>('[data-outline-search]'); input.value = 'section 99'; input.dispatchEvent(new h.dom.window.Event('input')); assert.equal(h.$('[data-outline-results]').children.length, 1);
    input.dispatchEvent(new h.dom.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); assert.equal(h.$('[data-outline-index="0"]'), h.dom.window.document.activeElement);
    h.$('[data-outline-index="0"]').dispatchEvent(new h.dom.window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })); assert.equal(input, h.dom.window.document.activeElement);
  } finally { h.close(); }
});
test('choosing a heading changes only selection and preserves the previous edit Undo', () => {
  const h = setup(4); try {
    h.change(h.editor.state.tr.insertText(' Edit', 2)); assert.equal(undoDepth(h.editor.state), 1); const content = h.editor.state.doc.toJSON();
    h.ui.show(); const input = h.$<HTMLInputElement>('[data-outline-search]'); input.value = 'section 2'; input.dispatchEvent(new h.dom.window.Event('input')); input.dispatchEvent(new h.dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    assert.equal(h.editor.state.selection.$from.parent.attrs.id, 'h2'); assert.equal(h.writes(), 0); assert.deepEqual(h.editor.state.doc.toJSON(), content); assert.equal(h.$<HTMLDialogElement>('.document-outline-dialog').open, false); assert.equal(h.$('.document-outline-dialog').inert, true);
    assert.equal(h.dom.window.document.activeElement, h.$('#writer')); assert.equal(h.focusedForScroll(),true); assert.equal(h.undo(), true); assert.equal(h.editor.state.doc.textContent.includes(' Edit'), false);
  } finally { h.close(); }
});
test('Escape closes on the first press and restores the opener, scroll and selection', () => {
  const h = setup(4); try {
    h.change(h.editor.state.tr.setSelection(TextSelection.create(h.editor.state.doc, 2, 6))); const selection = h.editor.state.selection.toJSON(); h.$('#scroll').scrollTop = 140; h.$('#view-toggle').focus(); h.ui.show();
    h.$<HTMLInputElement>('[data-outline-search]').value = 'nonempty search'; h.$('#scroll').scrollTop = 0;
    const composing = new h.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true, isComposing: true });
    h.$('[data-outline-search]').dispatchEvent(composing); assert.equal(composing.defaultPrevented, false); assert.equal(h.$<HTMLDialogElement>('.document-outline-dialog').open, true);
    h.$('[data-outline-search]').dispatchEvent(new h.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    assert.equal(h.$<HTMLDialogElement>('.document-outline-dialog').open, false); assert.equal(h.dom.window.document.activeElement, h.$('#view-toggle')); assert.equal(h.$('#scroll').scrollTop, 140); assert.deepEqual(h.editor.state.selection.toJSON(), selection);
  } finally { h.close(); }
});
test('removed headings keep the dialog open and Refresh rebuilds the current outline', () => {
  const h = setup(4); try {
    h.ui.show(); let position = -1, size = 0; h.editor.state.doc.descendants((node, pos) => { if (node.attrs.id === 'h2') { position = pos; size = node.nodeSize; } }); h.change(h.editor.state.tr.delete(position, position + size));
    h.$('[data-outline-index="2"]').click(); assert.equal(h.$<HTMLDialogElement>('.document-outline-dialog').open, true); assert.match(h.$('[data-outline-status]').textContent!, /changed or was removed/); assert.equal(h.writes(), 0);
    h.$('[data-outline-refresh]').click(); assert.equal(h.$('[data-outline-results]').children.length, 3); assert.equal(h.$('[data-outline-search]'), h.dom.window.document.activeElement);
  } finally { h.close(); }
});
test('empty and filtered-empty outlines explain recovery; another modal and note changes are respected', () => {
  const h = setup(0); try {
    h.$<HTMLDialogElement>('#other').showModal(); h.ui.show(); assert.equal(h.$<HTMLDialogElement>('.document-outline-dialog').open, false); h.$<HTMLDialogElement>('#other').close();
    h.ui.show(); assert.match(h.$('[data-outline-status]').textContent!, /No headings yet/); h.$('[data-outline-close]').click(); h.note(null); assert.equal(h.$<HTMLButtonElement>('#shell-go-heading').disabled, true);
  } finally { h.close(); }
  const other = setup(3); try {
    other.ui.show(); const input = other.$<HTMLInputElement>('[data-outline-search]'); input.value = 'no match'; input.dispatchEvent(new other.dom.window.Event('input')); assert.match(other.$('[data-outline-status]').textContent!, /No matching headings/);
    input.value = ''; input.dispatchEvent(new other.dom.window.Event('input')); other.note('other-note'); other.$('[data-outline-index="0"]').click(); assert.match(other.$('[data-outline-status]').textContent!, /open note changed/); assert.equal(other.writes(), 0);
  } finally { other.close(); }
});
test('View command and repeated opening preserve native dialog focus and inert state', () => {
  const h = setup(3); try {
    h.$('#shell-go-heading').click(); assert.equal(h.$('#view-popover').hidden, true); assert.equal(h.$('#view-popover').inert, true); h.$('[data-outline-close]').click();
    h.ui.show(); h.$('.document-outline-dialog').dispatchEvent(new h.dom.window.Event('close')); assert.equal(h.$<HTMLDialogElement>('.document-outline-dialog').open, true); assert.equal(h.$('.document-outline-dialog').inert, false);
    h.$('[data-outline-close]').click(); h.busy(true); assert.equal(h.$<HTMLButtonElement>('#shell-go-heading').disabled, true); h.ui.show(); assert.equal(h.$<HTMLDialogElement>('.document-outline-dialog').open, false);
  } finally { h.close(); }
});

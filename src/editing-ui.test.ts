import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { Editor, type JSONContent } from '@tiptap/core';
import { createEditorExtensions } from './editor-extensions.ts';
import { editingMarkup, initializeEditingUI } from './editing-ui.ts';

function harness(content: JSONContent[]) {
  const dom = new JSDOM(`<!doctype html><body>${editingMarkup}<div id="editor"></div></body>`, { pretendToBeVisual: true, url: 'http://localhost/' });
  Object.defineProperties(globalThis, {
    window: { value: dom.window, configurable: true },
    document: { value: dom.window.document, configurable: true },
    navigator: { value: dom.window.navigator, configurable: true },
    Node: { value: dom.window.Node, configurable: true },
    HTMLElement: { value: dom.window.HTMLElement, configurable: true },
    Element: { value: dom.window.Element, configurable: true },
    MutationObserver: { value: dom.window.MutationObserver, configurable: true },
    getComputedStyle: { value: dom.window.getComputedStyle.bind(dom.window), configurable: true },
    requestAnimationFrame: { value: () => 0, configurable: true },
    cancelAnimationFrame: { value: () => {}, configurable: true },
  });
  // jsdom has no layout; transaction/selection logic is real, geometry is not.
  dom.window.Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  dom.window.Range.prototype.getBoundingClientRect = () => new dom.window.DOMRect();
  let editor: Editor | null = null;
  const errors: unknown[] = [];
  const ui = initializeEditingUI({ getEditor: () => editor, getSchema: () => 'default', error: value => errors.push(value) });
  editor = new Editor({
    element: document.querySelector('#editor')!, extensions: createEditorExtensions(), content: { type: 'doc', content },
    onTransaction: ({ editor: current }) => ui.sync(current),
  });
  const currentEditor = editor;
  // Let appendTransaction plugins establish their initial trailing block before
  // taking snapshots, as happens during the first real editor transaction.
  editor.view.dispatch(editor.state.tr.setMeta('addToHistory', false));
  ui.sync();
  const element = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
  return {
    editor: currentEditor, dom, ui, errors, element,
    button: (name: string) => element<HTMLButtonElement>(`[data-edit="${name}"]`),
    find(query: string) {
      element('[data-edit="find"]').click();
      element<HTMLInputElement>('#find-query').value = query;
      element('#find-case').dispatchEvent(new dom.window.Event('change'));
    },
    dispose() {
      element('#find-close').click();
      currentEditor.destroy(); editor = null; dom.window.close();
    },
  };
}
const text = (value: string, marks?: JSONContent['marks']): JSONContent => ({ type: 'text', text: value, ...(marks ? { marks } : {}) });
const paragraph = (...content: JSONContent[]): JSONContent => ({ type: 'paragraph', attrs: { id: 'paragraph' }, content });

test('toolbar follows caret marks, stored marks before typing, and mixed selections', () => {
  const h = harness([paragraph(text('Bold', [{ type: 'bold' }]), text(' plain')), { type: 'codeBlock', content: [text('Code')] }]);
  try {
    h.editor.commands.setTextSelection(2);
    assert.equal(h.button('bold').getAttribute('aria-pressed'), 'true');
    assert.equal(h.button('bold').classList.contains('is-active'), true);
    h.editor.commands.setTextSelection(8);
    assert.equal(h.button('bold').getAttribute('aria-pressed'), 'false');
    const before = h.editor.getJSON();
    h.button('bold').click();
    assert.deepEqual(h.editor.getJSON(), before, 'toggling at the caret changes the next typed text only');
    assert.equal(h.button('bold').getAttribute('aria-pressed'), 'true');
    h.button('bold').click();
    assert.equal(h.button('bold').getAttribute('aria-pressed'), 'false');
    h.editor.commands.setTextSelection({ from: 1, to: 11 });
    assert.equal(h.button('bold').getAttribute('aria-pressed'), 'mixed');
    assert.equal(h.button('bold').classList.contains('is-mixed'), true);
    h.editor.commands.setTextSelection({ from: 1, to: 5 });
    assert.equal(h.button('bold').getAttribute('aria-pressed'), 'true');
    h.editor.commands.setTextSelection(14);
    assert.equal(h.button('italic').disabled, true, 'code blocks cannot carry inline formatting');
  } finally { h.dispose(); }
});

test('undo and redo buttons track actual history availability', () => {
  const h = harness([paragraph(text('Original'))]);
  try {
    assert.equal(h.button('undo').disabled, true);
    assert.equal(h.button('redo').disabled, true);
    h.editor.commands.insertContent('Added ');
    assert.equal(h.button('undo').disabled, false);
    assert.equal(h.button('redo').disabled, true);
    h.button('undo').click();
    assert.equal(h.editor.state.doc.textContent, 'Original');
    assert.equal(h.button('undo').disabled, true);
    assert.equal(h.button('redo').disabled, false);
    h.button('redo').click();
    assert.equal(h.editor.state.doc.textContent, 'Added Original');
    assert.equal(h.button('redo').disabled, true);
  } finally { h.dispose(); }
});

test('find replaces matches crossing inline marks in one undoable edit, preserving unrelated structure', () => {
  const h = harness([
    paragraph(text('Before '), text('nee', [{ type: 'bold' }]), text('dle', [{ type: 'italic' }]), text(' and needle after.')),
    { type: 'heading', attrs: { id: 'untouched-heading', level: 3 }, content: [text('Keep this heading')] },
  ]);
  try {
    const before = h.editor.getJSON();
    h.find('needle');
    assert.equal(h.element('#find-count').textContent, '1 of 2');
    h.element<HTMLInputElement>('#replace-text').value = 'thread';
    h.element('#replace-all').click();
    assert.equal(h.editor.state.doc.child(0).textContent, 'Before thread and thread after.');
    assert.deepEqual(h.editor.getJSON().content![1], before.content![1]);
    assert.equal(h.element('#find-count').textContent, 'No matches');
    assert.equal(h.element<HTMLButtonElement>('#replace-all').disabled, true);
    h.button('undo').click();
    assert.deepEqual(h.editor.getJSON(), before, 'one undo restores every match and its original marks');
    assert.deepEqual(h.errors, []);
  } finally { h.dispose(); }
});

test('replace all remains separate from immediately preceding typing in undo history', () => {
  const h = harness([paragraph(text('needle'))]);
  try {
    h.editor.commands.setTextSelection(7);
    h.editor.commands.insertContent(' needle');
    const afterTyping = h.editor.getJSON();
    h.find('needle');
    h.element<HTMLInputElement>('#replace-text').value = 'thread';
    h.element('#replace-all').click();
    h.button('undo').click();
    assert.deepEqual(h.editor.getJSON(), afterTyping, 'undo replacement keeps earlier user typing');
    h.button('undo').click();
    assert.equal(h.editor.state.doc.textContent, 'needle');
  } finally { h.dispose(); }
});

test('color indication honors cleared stored marks and mixed text color selections', () => {
  const h = harness([paragraph(text('Green', [{ type: 'textStyle', attrs: { color: '#365b32' } }]), text(' Plain'))]);
  try {
    h.editor.commands.setTextSelection(3);
    assert.equal(h.element<HTMLSelectElement>('#text-color').value, '#365b32');
    h.editor.commands.unsetColor();
    assert.equal(h.element<HTMLSelectElement>('#text-color').value, '', 'cleared next-character color must show Default');
    h.editor.commands.setTextSelection({ from: 1, to: 12 });
    assert.equal(h.element<HTMLSelectElement>('#text-color').value, 'mixed');
  } finally { h.dispose(); }
});

test('alignment shows mixed state across default-left and centered paragraphs', () => {
  const h = harness([paragraph(text('Left')), { type: 'paragraph', attrs: { id: 'center', textAlign: 'center' }, content: [text('Center')] }]);
  try {
    h.editor.commands.setTextSelection({ from: 1, to: 13 });
    assert.equal(h.element<HTMLSelectElement>('#text-align').value, 'mixed');
  } finally { h.dispose(); }
});

test('Highlight keyboard shortcut does not also open Find', () => {
  const h = harness([paragraph(text('Highlight me'))]);
  try {
    h.editor.commands.setTextSelection({ from: 1, to: 13 });
    h.editor.view.dom.dispatchEvent(new h.dom.window.KeyboardEvent('keydown', { key: 'H', code: 'KeyH', keyCode: 72, ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }));
    assert.equal(h.editor.isActive('highlight'), true);
    assert.equal(h.element('#find-panel').hidden, true);
  } finally { h.dispose(); }
});

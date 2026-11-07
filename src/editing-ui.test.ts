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
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new dom.window.Event('close')); };
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
    useEditor(next: Editor | null) { editor = next; ui.sync(); },
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

test('find and link shortcuts preserve composition and do not repeat their action', () => {
  const h = harness([paragraph(text('needle and needle'))]);
  try {
    const key = (value: string, extra: KeyboardEventInit = {}) => {
      const event = new h.dom.window.KeyboardEvent('keydown', { key: value, ctrlKey: true, bubbles: true, cancelable: true, ...extra });
      h.element('#find-query').dispatchEvent(event);
      return event.defaultPrevented;
    };
    for (const value of ['f', 'h', 'k']) {
      assert.equal(key(value, { isComposing: true }), false, `${value} must leave composition alone`);
      assert.equal(h.element('#find-panel').hidden, true);
      assert.equal(key(value, { repeat: true }), true, `${value} repeat must not reach browser commands`);
      assert.equal(h.element('#find-panel').hidden, true);
    }
    assert.equal(key('f'), true);
    assert.equal(h.element('#find-panel').hidden, false);
    assert.equal(document.activeElement, h.element('#find-query'));
  } finally { h.dispose(); }
});

test('find Enter and Escape leave composition alone and retain normal match navigation', () => {
  const h = harness([paragraph(text('needle and needle'))]);
  try {
    h.find('needle');
    const before = h.editor.state.selection.toJSON();
    const key = (value: string, extra: KeyboardEventInit = {}) => {
      const event = new h.dom.window.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true, ...extra });
      h.element('#find-query').dispatchEvent(event);
      return event.defaultPrevented;
    };
    for (const value of ['Enter', 'Escape']) {
      assert.equal(key(value, { isComposing: true }), false);
      assert.equal(h.element('#find-panel').hidden, false);
      assert.deepEqual(h.editor.state.selection.toJSON(), before);
      assert.equal(h.element('#find-count').textContent, '1 of 2');
    }
    for (const modifier of ['ctrlKey', 'metaKey', 'altKey']) {
      assert.equal(key('Enter', { [modifier]: true }), false);
      assert.equal(h.element('#find-count').textContent, '1 of 2');
    }
    assert.equal(key('Enter'), true);
    assert.equal(h.element('#find-count').textContent, '2 of 2');
    assert.equal(key('Enter', { shiftKey: true }), true);
    assert.equal(h.element('#find-count').textContent, '1 of 2');
    assert.equal(key('Escape'), true);
    assert.equal(h.element('#find-panel').hidden, true);
  } finally { h.dispose(); }
});

test('a link dialog cannot apply stale positions after the open document changes', () => {
  const h = harness([paragraph(text('Alpha Beta'))]);
  try {
    h.editor.commands.setTextSelection({ from: 1, to: 6 });
    h.button('url').click();
    h.editor.commands.insertContentAt(1, 'Changed ');
    const before = h.editor.getJSON();
    h.element<HTMLInputElement>('#url-value').value = 'https://example.com/';
    h.element('#url-form').dispatchEvent(new h.dom.window.Event('submit', { bubbles: true, cancelable: true }));
    assert.deepEqual(h.editor.getJSON(), before, 'the stale range must not mark different words');
    assert.equal(h.element<HTMLDialogElement>('#url-dialog').open, false);
    assert.match(String(h.errors[0]), /changed.*reopen/i);
  } finally { h.dispose(); }
});

test('a link dialog cannot redirect its selection into another editor', () => {
  const h = harness([paragraph(text('Alpha Beta'))]);
  const otherRoot = document.createElement('div'); document.body.append(otherRoot);
  const other = new Editor({ element: otherRoot, extensions: createEditorExtensions(), content: { type: 'doc', content: [paragraph(text('Other note'))] } });
  try {
    h.editor.commands.setTextSelection({ from: 1, to: 6 });
    h.button('url').click();
    h.useEditor(other);
    const before = other.getJSON();
    h.element<HTMLInputElement>('#url-value').value = 'https://example.com/';
    h.element('#url-form').dispatchEvent(new h.dom.window.Event('submit', { bubbles: true, cancelable: true }));
    assert.deepEqual(other.getJSON(), before, 'another note must remain unchanged');
    assert.equal(h.element<HTMLDialogElement>('#url-dialog').open, false);
    assert.match(String(h.errors[0]), /changed.*reopen/i);
  } finally { h.useEditor(h.editor); other.destroy(); h.dispose(); }
});

test('an unchanged link context preserves its chosen text and closes after applying', () => {
  const h = harness([paragraph(text('Alpha Beta'))]);
  try {
    h.editor.commands.setTextSelection({ from: 1, to: 6 });
    h.button('url').click();
    h.editor.commands.setTextSelection(10);
    h.element<HTMLInputElement>('#url-value').value = 'https://example.com/';
    h.element('#url-form').dispatchEvent(new h.dom.window.Event('submit', { bubbles: true, cancelable: true }));
    assert.equal(h.editor.state.doc.textContent, 'Alpha Beta');
    assert.equal(h.editor.state.doc.rangeHasMark(1, 6, h.editor.schema.marks.link), true);
    assert.equal(h.editor.state.doc.rangeHasMark(7, 11, h.editor.schema.marks.link), false);
    assert.equal(h.element<HTMLDialogElement>('#url-dialog').open, false);
    const before = h.editor.getJSON();
    h.element('#url-form').dispatchEvent(new h.dom.window.Event('submit', { bubbles: true, cancelable: true }));
    assert.deepEqual(h.editor.getJSON(), before, 'a closed dialog cannot replay its old range');
    assert.deepEqual(h.errors, []);
  } finally { h.dispose(); }
});

test('a link dialog refuses a no-longer-editable or closed note', () => {
  const h = harness([paragraph(text('Alpha Beta'))]);
  try {
    h.editor.commands.setTextSelection({ from: 1, to: 6 }); h.button('url').click();
    h.editor.setEditable(false); const before=h.editor.getJSON();
    h.element<HTMLInputElement>('#url-value').value='https://example.com/';
    h.element('#url-form').dispatchEvent(new h.dom.window.Event('submit',{bubbles:true,cancelable:true}));
    assert.deepEqual(h.editor.getJSON(),before);
    assert.equal(h.element<HTMLDialogElement>('#url-dialog').open,false);
    assert.match(String(h.errors[0]),/no longer editable/i);
    h.editor.setEditable(true); h.ui.sync(); h.button('url').click(); h.useEditor(null);
    h.element('#url-form').dispatchEvent(new h.dom.window.Event('submit',{bubbles:true,cancelable:true}));
    assert.deepEqual(h.editor.getJSON(),before);
    assert.equal(h.element<HTMLDialogElement>('#url-dialog').open,false);
    assert.equal(h.errors.length,2);
  } finally { h.useEditor(h.editor); h.dispose(); }
});

test('a link inserted at the caret remains one undoable edit', () => {
  const h = harness([paragraph()]);
  try {
    const before=h.editor.getJSON(); h.button('url').click();
    h.element<HTMLInputElement>('#url-value').value='https://example.com/';
    h.element<HTMLInputElement>('#url-label').value='Example';
    h.element('#url-form').dispatchEvent(new h.dom.window.Event('submit',{bubbles:true,cancelable:true}));
    assert.equal(h.editor.state.doc.textContent,'Example');
    assert.equal(h.editor.state.doc.rangeHasMark(1,8,h.editor.schema.marks.link),true);
    h.button('undo').click(); assert.deepEqual(h.editor.getJSON(),before);
    assert.deepEqual(h.errors,[]);
  } finally { h.dispose(); }
});

test('a delayed close event cannot clear a newly opened link context', () => {
  const h=harness([paragraph(text('Alpha Beta'))]);
  try {
    h.editor.commands.setTextSelection({from:1,to:6}); h.button('url').click();
    h.element('#url-cancel').click(); h.button('url').click();
    h.element('#url-dialog').dispatchEvent(new h.dom.window.Event('close'));
    h.element<HTMLInputElement>('#url-value').value='https://example.com/';
    h.element('#url-form').dispatchEvent(new h.dom.window.Event('submit',{bubbles:true,cancelable:true}));
    assert.equal(h.editor.state.doc.rangeHasMark(1,6,h.editor.schema.marks.link),true);
    assert.equal(h.element<HTMLDialogElement>('#url-dialog').open,false);
  } finally { h.dispose(); }
});

test('undoing an inserted link preserves immediately preceding typing', () => {
  const h=harness([paragraph(text('Before'))]);
  try {
    h.editor.commands.setTextSelection(7); h.editor.commands.insertContent(' more');
    const beforeLink=h.editor.getJSON(); h.button('url').click();
    h.element<HTMLInputElement>('#url-value').value='https://example.com/';
    h.element<HTMLInputElement>('#url-label').value='Example';
    h.element('#url-form').dispatchEvent(new h.dom.window.Event('submit',{bubbles:true,cancelable:true}));
    assert.equal(h.editor.state.doc.textContent,'Before moreExample');
    h.button('undo').click(); assert.deepEqual(h.editor.getJSON(),beforeLink);
    h.button('undo').click(); assert.equal(h.editor.state.doc.textContent,'Before');
  } finally { h.dispose(); }
});

test('reopening a link dialog clears validation from an earlier rejected URL', () => {
  const h=harness([paragraph(text('Alpha',[{type:'link',attrs:{href:'https://example.com/'}}]))]);
  try {
    h.editor.commands.setTextSelection(2); h.button('url').click();
    const field=h.element<HTMLInputElement>('#url-value'); field.value='ftp://example.com/';
    h.element('#url-form').dispatchEvent(new h.dom.window.Event('submit',{bubbles:true,cancelable:true}));
    assert.equal(field.validity.customError,true);
    h.element('#url-cancel').click(); h.button('url').click();
    assert.equal(field.value,'https://example.com/');
    assert.equal(field.checkValidity(),true,'a valid saved link must not inherit the previous error');
    assert.equal(field.validationMessage,'');
  } finally { h.dispose(); }
});

test('link controls reject code selections and recover in ordinary text', () => {
  const h=harness([{type:'codeBlock',content:[text('const value = true;')]},paragraph(text('Ordinary text'))]);
  try {
    h.editor.commands.setTextSelection({from:1,to:6});const before=h.editor.getJSON();
    assert.equal(h.button('url').disabled,true);
    assert.equal(h.element<HTMLButtonElement>('#insert-link').disabled,true);
    h.editor.view.dom.dispatchEvent(new h.dom.window.KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true,cancelable:true}));
    assert.equal(h.element<HTMLDialogElement>('#url-dialog').open,false);
    assert.match(String(h.errors[0]),/ordinary text/i);
    assert.deepEqual(h.editor.getJSON(),before);
    h.editor.commands.setTextSelection(h.editor.state.doc.firstChild!.nodeSize+1);
    assert.equal(h.button('url').disabled,false);
    assert.equal(h.element<HTMLButtonElement>('#insert-link').disabled,false);
    h.button('url').click();assert.equal(h.element<HTMLDialogElement>('#url-dialog').open,true);
  } finally { h.dispose(); }
});

test('URL validation keeps rejected addresses open and applies a canonical valid address', () => {
  const h=harness([paragraph(text('Alpha Beta'))]);
  try {
    h.editor.commands.setTextSelection({from:1,to:6});h.button('url').click();const before=h.editor.getJSON();
    const field=h.element<HTMLInputElement>('#url-value');
    for(const value of ['https://user:password@example.com/','https://example.com/'+ 'a'.repeat(2048)]){
      field.value=value;field.dispatchEvent(new h.dom.window.Event('input'));
      h.element('#url-form').dispatchEvent(new h.dom.window.Event('submit',{bubbles:true,cancelable:true}));
      assert.equal(h.element<HTMLDialogElement>('#url-dialog').open,true,'the rejected address must remain editable');
      assert.equal(field.validity.customError,true);assert.deepEqual(h.editor.getJSON(),before);
    }
    field.value='HTTPS://EXAMPLE.COM/path';field.dispatchEvent(new h.dom.window.Event('input'));
    h.element('#url-form').dispatchEvent(new h.dom.window.Event('submit',{bubbles:true,cancelable:true}));
    assert.equal(h.element<HTMLDialogElement>('#url-dialog').open,false);
    assert.equal(h.editor.getAttributes('link').href,'https://example.com/path');
    assert.equal(h.editor.state.doc.textContent,'Alpha Beta');
    h.button('url').click();assert.equal(field.value,'https://example.com/path');
  } finally { h.dispose(); }
});

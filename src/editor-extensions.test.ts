import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { Editor, type JSONContent } from '@tiptap/core';
import { createEditorExtensions, MAX_INDENT, normalizeTextColor } from './editor-extensions.ts';
import type { SchemaId } from './model.ts';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true, url: 'http://localhost/' });
Object.defineProperties(globalThis, {
  window: { value: dom.window, configurable: true },
  document: { value: dom.window.document, configurable: true },
  navigator: { value: dom.window.navigator, configurable: true },
  Node: { value: dom.window.Node, configurable: true },
  HTMLElement: { value: dom.window.HTMLElement, configurable: true },
  Element: { value: dom.window.Element, configurable: true },
  MutationObserver: { value: dom.window.MutationObserver, configurable: true },
  getComputedStyle: { value: dom.window.getComputedStyle.bind(dom.window), configurable: true },
  requestAnimationFrame: { value: dom.window.requestAnimationFrame.bind(dom.window), configurable: true },
  cancelAnimationFrame: { value: dom.window.cancelAnimationFrame.bind(dom.window), configurable: true },
});

const p = (text: string, id = text): JSONContent => ({ type: 'paragraph', attrs: { id }, content: [{ type: 'text', text }] });
const item = (text: string, task = false): JSONContent => ({ type: task ? 'taskItem' : 'listItem', attrs: { id: `item-${text}`, ...(task ? { checked: false } : {}) }, content: [p(text)] });
function makeEditor(content: JSONContent[], getSchemaId: () => SchemaId = () => 'default') {
  const element = document.createElement('div');
  document.body.append(element);
  return new Editor({ element, extensions: createEditorExtensions(getSchemaId), content: { type: 'doc', content } });
}
function json(editor: Editor): JSONContent { return editor.getJSON() as JSONContent; }
function at(editor: Editor, text: string): number {
  let found = -1;
  editor.state.doc.descendants((node, position) => { if (node.isText && node.text === text) found = position; });
  assert.notEqual(found, -1, `text exists: ${text}`);
  return found;
}
function key(editor: Editor, value: string, shiftKey = false) {
  const event = new dom.window.KeyboardEvent('keydown', { key: value, code: value, bubbles: true, cancelable: true, shiftKey });
  editor.view.dom.dispatchEvent(event);
  return event;
}

test('free indent edits all selected blocks, honors bounds, preserves words and IDs, and can undo', () => {
  const editor = makeEditor([p('One'), { type: 'heading', attrs: { id: 'heading', level: 2 }, content: [{ type: 'text', text: 'Two' }] }, p('Three')]);
  try {
    editor.commands.setTextSelection({ from: at(editor, 'One'), to: at(editor, 'Two') + 3 });
    const before = json(editor);
    assert.equal(editor.can().indent(), true);
    assert.deepEqual(json(editor), before, 'capability checks never modify content');
    assert.equal(editor.commands.indent(), true);
    assert.deepEqual(json(editor).content!.map(node => node.attrs!.indent), [1, 1, 0]);
    assert.equal(editor.state.doc.textContent, 'OneTwoThree');
    assert.deepEqual(json(editor).content!.map(node => node.attrs!.id), ['One', 'heading', 'Three']);
    assert.equal(editor.commands.undo(), true);
    assert.deepEqual(json(editor), before);
    for (let index = 0; index < MAX_INDENT; index++) editor.commands.indent();
    assert.equal(editor.can().indent(), false);
    assert.deepEqual(json(editor).content!.map(node => node.attrs!.indent), [MAX_INDENT, MAX_INDENT, 0]);
    editor.commands.outdent();
    assert.deepEqual(json(editor).content!.map(node => node.attrs!.indent), [MAX_INDENT - 1, MAX_INDENT - 1, 0]);
  } finally { editor.destroy(); }
});

test('schema changes take effect immediately without rewriting existing content', () => {
  let schema: SchemaId = 'default';
  const editor = makeEditor([p('Keep my words')], () => schema);
  try {
    editor.commands.indent();
    const before = json(editor);
    schema = 'outline';
    assert.equal(editor.can().indent(), false);
    assert.equal(editor.commands.indent(), false);
    assert.equal(editor.commands.outdent(), false);
    assert.deepEqual(json(editor), before);
    schema = 'compact';
    assert.equal(editor.commands.outdent(), true);
    assert.equal(json(editor).content![0].attrs!.indent, 0);
  } finally { editor.destroy(); }
});

for (const task of [false, true]) {
  test(`${task ? 'task' : 'ordinary'} lists nest structurally and outdent in Outline`, () => {
    const listType = task ? 'taskList' : 'bulletList';
    const editor = makeEditor([{ type: listType, attrs: { id: 'root-list' }, content: [item('Parent', task), item('Child', task), item('Sibling', task)] }], () => 'outline');
    try {
      editor.commands.setTextSelection({ from: at(editor, 'Child'), to: at(editor, 'Sibling') + 7 });
      assert.equal(editor.commands.indent(), true);
      const list = json(editor).content![0];
      assert.equal(list.content!.length, 1);
      assert.equal(list.content![0].content![1].type, listType);
      assert.deepEqual(list.content![0].content![1].content!.map(node => node.attrs!.id), ['item-Child', 'item-Sibling']);
      assert.equal(editor.state.doc.textContent, 'ParentChildSibling');
      assert.equal(editor.commands.outdent(), true);
      assert.deepEqual(json(editor).content![0].content!.map(node => node.attrs!.id), ['item-Parent', 'item-Child', 'item-Sibling']);
      editor.commands.setTextSelection(at(editor, 'Parent'));
      assert.equal(editor.can().indent(), false, 'first item has no preceding parent');
      const before = json(editor);
      assert.equal(key(editor, 'Tab').defaultPrevented, true);
      assert.deepEqual(json(editor), before);
    } finally { editor.destroy(); }
  });
}

test('mixed free/list selections fail atomically and nested task lists use their nearest item type', () => {
  const nested: JSONContent = { type: 'bulletList', content: [{ ...item('Outer'), content: [p('Outer'), { type: 'taskList', content: [item('Task A', true), item('Task B', true)] }] }] };
  const editor = makeEditor([p('Free'), nested]);
  try {
    editor.commands.setTextSelection({ from: at(editor, 'Free'), to: at(editor, 'Task B') + 6 });
    const before = json(editor);
    assert.equal(editor.commands.indent(), false);
    assert.deepEqual(json(editor), before);
    editor.commands.setTextSelection(at(editor, 'Task B'));
    assert.equal(editor.commands.indent(), true);
    const nestedTask = json(editor).content![1].content![0].content![1];
    assert.equal(nestedTask.content!.length, 1);
    assert.equal(nestedTask.content![0].content![1].type, 'taskList');
    assert.equal(nestedTask.content![0].content![1].content![0].attrs!.id, 'item-Task B');
  } finally { editor.destroy(); }
});

test('Tab preserves table navigation and code indentation; Escape then Tab moves focus out', () => {
  const cell = (text: string): JSONContent => ({ type: 'tableCell', content: [p(text)] });
  const editor = makeEditor([{ type: 'table', content: [{ type: 'tableRow', content: [cell('Left'), cell('Right')] }] }, { type: 'codeBlock', content: [{ type: 'text', text: 'code' }] }]);
  const after = document.createElement('button');
  after.textContent = 'After editor';
  after.getClientRects = () => [new dom.window.DOMRect(0, 0, 20, 20)] as unknown as DOMRectList;
  document.body.append(after);
  try {
    editor.commands.setTextSelection(at(editor, 'Left'));
    assert.equal(editor.can().indent(), false);
    key(editor, 'Tab');
    assert.equal(editor.state.selection.$from.parent.textContent, 'Right');
    editor.commands.setTextSelection(at(editor, 'code'));
    key(editor, 'Tab');
    assert.equal(editor.state.selection.$from.parent.textContent, '    code');
    key(editor, 'Escape');
    key(editor, 'Tab');
    assert.equal(document.activeElement, after);
  } finally { editor.destroy(); after.remove(); }
});

test('new marks, tables and attributes survive JSON reload; unsafe pasted styles are ignored', () => {
  const editor = makeEditor([p('Formatted')]);
  let reopened: Editor | undefined;
  try {
    editor.commands.setTextSelection({ from: at(editor, 'Formatted'), to: at(editor, 'Formatted') + 9 });
    editor.chain().toggleUnderline().toggleHighlight().toggleSuperscript().setColor('#aabbcc').setTextAlign('center').indent().run();
    assert.equal(editor.commands.setColor('url(https://example.org/track)'), false);
    const saved = json(editor);
    reopened = makeEditor(saved.content!);
    assert.deepEqual(json(reopened), saved);
    assert.equal(json(reopened).content![0].attrs!.textAlign, 'center');
    assert.deepEqual(json(reopened).content![0].content![0].marks!.map(mark => mark.type).sort(), ['highlight', 'superscript', 'textStyle', 'underline']);
    editor.commands.setContent('<p data-indent="99" style="color: red">Words</p><p data-indent="3"><span style="color: rgb(1, 2, 255)">More</span></p>');
    assert.equal(json(editor).content![0].attrs!.indent, 0);
    assert.equal(json(editor).content![1].attrs!.indent, 3);
    assert.equal(json(editor).content![1].content![0].marks![0].attrs!.color, '#0102ff');
    assert.equal(normalizeTextColor('rgb(256, 0, 1)'), null);
  } finally { editor.destroy(); reopened?.destroy(); }
});

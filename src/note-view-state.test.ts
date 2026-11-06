import test from 'node:test';
import assert from 'node:assert/strict';
import { Schema } from '@tiptap/pm/model';
import { AllSelection, EditorState, NodeSelection, TextSelection } from '@tiptap/pm/state';
import { CellSelection, tableNodes } from '@tiptap/pm/tables';
import type { Editor } from '@tiptap/core';
import { captureNoteView, restoreNoteView } from './note-view-state.ts';
const schema = new Schema({ nodes: {
  doc: { content: 'block+' }, paragraph: { group: 'block', content: 'text*' },
  atom: { group: 'block', atom: true }, text: {},
} });
function setup() {
  let state = EditorState.create({ doc: schema.node('doc', null, [schema.node('paragraph', null, [schema.text('Synthetic writing')]), schema.node('atom')]) });
  const transactions: unknown[] = []; let focused = 0;
  const editor = { get state() { return state; }, view: { dispatch(tr: Parameters<EditorState['apply']>[0]) { transactions.push(tr.getMeta('addToHistory')); state = state.apply(tr); }, focus() { focused++; } } } as unknown as Editor;
  const scroll = { scrollTop: 240, scrollLeft: 15, scrollHeight: 1000, clientHeight: 300, scrollWidth: 800, clientWidth: 600 } as HTMLElement;
  return { editor, scroll, transactions, set(selection: EditorState['selection']) { state = state.apply(state.tr.setSelection(selection)); }, focused: () => focused };
}
test('view captures selected text positions and restores scroll without a content or Undo mutation', () => {
  const h = setup(); h.set(TextSelection.create(h.editor.state.doc, 3, 9)); const json = h.editor.state.doc.toJSON();
  const view = captureNoteView(h.editor, h.scroll, 'version-a'); h.set(TextSelection.atStart(h.editor.state.doc)); h.scroll.scrollTop = 0;
  assert.equal(restoreNoteView(h.editor, h.scroll, 'version-a', view), true);
  assert.equal(h.editor.state.selection.anchor, 3); assert.equal(h.editor.state.selection.head, 9);
  assert.equal(h.scroll.scrollTop, 240); assert.equal(h.scroll.scrollLeft, 15); assert.equal(h.focused(), 1);
  assert.deepEqual(h.editor.state.doc.toJSON(), json); assert.deepEqual(h.transactions, [false]);
  assert.equal(JSON.stringify(view).includes('Synthetic'), false);
});
test('node and whole-document selections round trip through the allowlisted view DTO', () => {
  for (const type of ['node', 'all']) {
    const h = setup(); const selection = type === 'node' ? new NodeSelection(h.editor.state.doc.resolve(19)) : new AllSelection(h.editor.state.doc);
    h.set(selection); const view = captureNoteView(h.editor, h.scroll, 'version-a');
    assert.equal(restoreNoteView(h.editor, h.scroll, 'version-a', view), true);
    assert.deepEqual(h.editor.state.selection.toJSON(), selection.toJSON());
  }
});
test('external revisions and invalid positions fall back safely, with bounded finite scrolling', () => {
  const h = setup(); h.set(TextSelection.create(h.editor.state.doc, 4)); const view = captureNoteView(h.editor, h.scroll, 'old');
  view.scrollTop = Infinity; view.scrollLeft = 99999;
  assert.equal(restoreNoteView(h.editor, h.scroll, 'new', view), false);
  assert.equal(h.editor.state.selection.from, 1); assert.equal(h.scroll.scrollTop, 0); assert.equal(h.scroll.scrollLeft, 200);
  view.selection = { type: 'text', anchor: 50000, head: -9 };
  assert.equal(restoreNoteView(h.editor, h.scroll, 'old', view), false); assert.equal(h.editor.state.selection.from, 1);
  restoreNoteView(h.editor, h.scroll, 'old', null); assert.equal(h.scroll.scrollLeft, 0);
});
test('table cell ranges restore through the registered selection type', () => {
  const tableSchema = new Schema({ nodes: { doc: { content: 'block+' }, paragraph: { group: 'block', content: 'text*' }, text: {}, ...tableNodes({ tableGroup: 'block', cellContent: 'paragraph+', cellAttributes: {} }) } });
  const cell = () => tableSchema.node('table_cell', null, [tableSchema.node('paragraph', null, tableSchema.text('Synthetic'))]);
  const doc = tableSchema.node('doc', null, [tableSchema.node('table', null, [tableSchema.node('table_row', null, [cell(), cell()])])]);
  const positions: number[] = []; doc.descendants((node, pos) => { if (node.type.name === 'table_cell') positions.push(pos); });
  let state = EditorState.create({ doc, selection: CellSelection.create(doc, positions[0], positions[1]) });
  const expected = state.selection.toJSON();
  const editor = { get state() { return state; }, view: { dispatch(tr: Parameters<EditorState['apply']>[0]) { state = state.apply(tr); }, focus() {} } } as unknown as Editor;
  const scroll = { scrollTop: 0, scrollLeft: 0, scrollHeight: 10, clientHeight: 10, scrollWidth: 10, clientWidth: 10 } as HTMLElement;
  const view = captureNoteView(editor, scroll, 'table-version'); state = state.apply(state.tr.setSelection(TextSelection.atStart(state.doc)));
  assert.equal(restoreNoteView(editor, scroll, 'table-version', view), true); assert.deepEqual(state.selection.toJSON(), expected);
});

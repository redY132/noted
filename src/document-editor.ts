import { Extension, type Editor, type JSONContent } from '@tiptap/core';
import { closeHistory } from '@tiptap/pm/history';
import { NodeSelection, TextSelection, type Transaction } from '@tiptap/pm/state';
import { findWrapping } from '@tiptap/pm/transform';
import { documentFromEditor, type LayoutKind, type NotedDocumentV2 } from './document-model.ts';

export const DocumentOrder = Extension.create({
  name: 'documentOrder',
  addGlobalAttributes: () => [{ types: ['doc'], attributes: { readingOrder: { default: [], rendered: false } } }],
});
export function retainLogicalOrder(editor: Editor, transaction: Transaction): Transaction {
  const order = documentFromEditor(editor.getJSON(), 'editor').readingOrder;
  return transaction.setDocAttribute('readingOrder', order);
}
/** Replace an adapter projection as one history item, without replacing the Editor instance. */
export function applyEditorProjection(editor: Editor, content: JSONContent): boolean {
  if (!editor.isEditable) return false;
  const next = editor.schema.nodeFromJSON(content); next.check();
  const selection = editor.state.selection;
  const point = (position: number) => {
    const resolved = editor.state.doc.resolve(position);
    for (let depth = resolved.depth; depth > 0; depth--) {
      const id = resolved.node(depth).attrs.id;
      if (typeof id === 'string') return { id, offset: position - resolved.start(depth) };
    }
    return null;
  };
  const anchor = point(selection.anchor), head = point(selection.head);
  const selectedId = selection instanceof NodeSelection ? selection.node.attrs.id : null;
  const tr = closeHistory(editor.state.tr).replaceWith(0, editor.state.doc.content.size, next.content);
  for (const [name, value] of Object.entries(next.attrs)) tr.setDocAttribute(name, value);
  const locate = (id: string): { position: number; size: number; selectable: boolean } | null => {
    let found: { position: number; size: number; selectable: boolean } | null = null;
    tr.doc.descendants((node, position) => {
      if (node.attrs.id === id) { found = { position, size: node.content.size, selectable: NodeSelection.isSelectable(node) }; return false; }
      return !found;
    });
    return found;
  };
  const mapped = (saved: ReturnType<typeof point>, fallback: number) => {
    const target = saved && locate(saved.id);
    return target ? target.position + 1 + Math.min(saved!.offset, target.size) : Math.min(fallback, tr.doc.content.size);
  };
  const selected = typeof selectedId === 'string' ? locate(selectedId) : null;
  if (selected?.selectable) tr.setSelection(NodeSelection.create(tr.doc, selected.position));
  else tr.setSelection(TextSelection.between(tr.doc.resolve(mapped(anchor, selection.anchor)), tr.doc.resolve(mapped(head, selection.head))));
  editor.view.dispatch(tr); return true;
}
export function groupSelection(editor: Editor, kind: Exclude<LayoutKind, 'item'> = 'column'): boolean {
  if (!editor.isEditable) return false;
  const { $from, $to } = editor.state.selection;
  const range = $from.blockRange($to), type = editor.schema.nodes.notePanel;
  if (!range || !type || range.depth > 32) return false;
  const wrapping = findWrapping(range, type, { id: crypto.randomUUID(), layoutKind: kind, padding: 16, gap: 12, gridColumns: 2 });
  if (!wrapping) return false;
  const tr = retainLogicalOrder(editor, closeHistory(editor.state.tr)).wrap(range, wrapping);
  tr.setSelection(NodeSelection.create(tr.doc, range.start));
  editor.view.dispatch(tr); return true;
}
export { inspectArrangement } from './document-model.ts';

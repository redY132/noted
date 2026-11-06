import type { Editor } from '@tiptap/core';
import { Selection } from '@tiptap/pm/state';
import type { NoteViewState } from './navigation-history';

export function captureNoteView(editor: Editor, scroll: HTMLElement, revisionToken: string): NoteViewState {
  const selection = editor.state.selection.toJSON();
  return {
    revisionToken,
    selection: { type: selection.type, ...(Number.isInteger(selection.anchor) ? { anchor: selection.anchor } : {}), ...(Number.isInteger(selection.head) ? { head: selection.head } : {}) },
    scrollTop: Math.max(0, scroll.scrollTop), scrollLeft: Math.max(0, scroll.scrollLeft),
  };
}

/** A changed file cannot safely reuse ProseMirror positions from an older revision. */
export function restoreNoteView(editor: Editor, scroll: HTMLElement, revisionToken: string, view: NoteViewState | null) {
  let selection = Selection.atStart(editor.state.doc), exact = false;
  if (view?.revisionToken === revisionToken) {
    try { selection = Selection.fromJSON(editor.state.doc, view.selection); exact = true; } catch { /* A safe start beats an invalid selection. */ }
  }
  editor.view.dispatch(editor.state.tr.setSelection(selection).setMeta('addToHistory', false));
  editor.view.focus();
  const clamp = (value: number | undefined, max: number) => Number.isFinite(value) ? Math.max(0, Math.min(value!, Math.max(0, max))) : 0;
  scroll.scrollTop = clamp(view?.scrollTop, scroll.scrollHeight - scroll.clientHeight);
  scroll.scrollLeft = clamp(view?.scrollLeft, scroll.scrollWidth - scroll.clientWidth);
  return exact;
}

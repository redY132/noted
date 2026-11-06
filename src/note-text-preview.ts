import type { JSONContent } from '@tiptap/core';
import type { Note } from './model.ts';

/** Plain recovery preview only. Never executes components or resolves assets. */
export function noteTextPreview(note: Note, limit = 12000): { text: string; shortened: boolean } {
  const walk = (node: JSONContent): string => {
    if (node.type === 'text') return node.text ?? '';
    if (node.type === 'hardBreak') return '\n';
    if (node.type === 'localImage') return `[Image: ${node.attrs?.alt || 'no description'}]`;
    if (node.type === 'interactiveComponent') return node.attrs?.fallback || '[Interactive component]';
    const inline = ['paragraph', 'heading', 'codeBlock', 'text'].includes(node.type ?? '');
    const body = (node.content ?? []).map(walk).join(inline ? '' : node.type === 'tableRow' ? '\t' : '\n');
    if (node.type === 'taskItem') return `[${node.attrs?.checked ? 'x' : ' '}] ${body}`;
    return body;
  };
  const content = note.document ? note.document.readingOrder.map(id => {
    const object = note.document!.objects[id];
    return object.kind === 'richText' ? walk(object.content) : object.kind === 'image' ? `[Image: ${object.alt || 'no description'}]` : object.fallback || '[Interactive component]';
  }).join('\n\n') : walk(note.content);
  const bound = Math.max(1, Math.min(48000, Math.floor(limit) || 12000));
  let text = content.slice(0, bound); if (/[\uD800-\uDBFF]$/.test(text)) text = text.slice(0, -1);
  return { text, shortened: text.length < content.length };
}

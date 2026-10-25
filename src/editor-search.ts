import type { Node } from '@tiptap/pm/model';

export interface Match { from: number; to: number }
/** Literal, block-local search. Regex indices preserve Unicode source offsets. */
export function findInDocument(doc: Node, query: string, caseSensitive = false, limit = 10_000) {
  const matches: Match[] = [];
  let truncated = false;
  if (!query) return { matches, truncated };
  const expression = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? 'gu' : 'giu');
  doc.descendants((node, pos) => {
    if (truncated) return false;
    if (!node.isTextblock) return true;
    const text = node.textBetween(0, node.content.size, undefined, '\n');
    expression.lastIndex = 0;
    for (const match of text.matchAll(expression)) {
      if (matches.length === limit) { truncated = true; break; }
      matches.push({ from: pos + 1 + match.index, to: pos + 1 + match.index + match[0].length });
    }
    return false;
  });
  return { matches, truncated };
}

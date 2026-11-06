import type { Node as DocumentNode } from '@tiptap/pm/model';
import { reconcileReadingOrder } from './document-model.ts';
export interface DocumentHeading { id: string | null; position: number; end: number; level: number; label: string; search: string }

/** Read the open document once. Layout panels do not replace logical reading order. */
export function documentHeadings(doc: DocumentNode): DocumentHeading[] {
  const groups = new Map<string, DocumentHeading[]>(), visual: string[] = [];
  const heading = (node: DocumentNode, position: number): DocumentHeading => {
    const text = node.textBetween(0, node.content.size, ' ', ' ').replace(/\s+/g, ' ').trim() || 'Untitled heading';
    let label = text.slice(0, 240); if (/[\uD800-\uDBFF]$/.test(label)) label = label.slice(0, -1);
    if (label.length < text.length) label += '…';
    return { id: typeof node.attrs.id === 'string' && node.attrs.id ? node.attrs.id : null, position, end: position + node.nodeSize, level: Number.isInteger(node.attrs.level) && node.attrs.level >= 1 && node.attrs.level <= 6 ? node.attrs.level : 1, label, search: text.toLowerCase() };
  };
  const visit = (node: DocumentNode, position: number) => {
    if (node.type.name === 'notePanel') { node.forEach((child, offset) => visit(child, position + 1 + offset)); return; }
    let key = typeof node.attrs.id === 'string' && node.attrs.id ? node.attrs.id : `@outline-${position}`;
    while (groups.has(key)) key += '.';
    const items: DocumentHeading[] = []; visual.push(key); groups.set(key, items);
    if (node.type.name === 'heading') items.push(heading(node, position));
    else node.descendants((child, relative) => { if (child.type.name === 'heading') { items.push(heading(child, position + 1 + relative)); return false; } return true; });
  };
  doc.forEach(visit);
  const previous = Array.isArray(doc.attrs.readingOrder) ? [...new Set(doc.attrs.readingOrder.filter((id: unknown): id is string => typeof id === 'string'))] as string[] : [];
  const order = previous.length ? reconcileReadingOrder(previous, visual) : visual;
  return order.flatMap(id => groups.get(id) ?? []);
}

export function matchingHeadings(headings: DocumentHeading[], query: string) {
  const needle = query.trim().replace(/\s+/g, ' ').toLowerCase();
  return needle ? headings.filter(heading => heading.search.includes(needle)) : [...headings];
}

/** A stable ID survives edits. A missing or duplicate ID needs a refreshed snapshot. */
export function headingPosition(doc: DocumentNode, snapshot: DocumentNode, heading: DocumentHeading): number | null {
  if (doc === snapshot) return doc.nodeAt(heading.position)?.type.name === 'heading' ? heading.position : null;
  if (!heading.id) return null;
  let found: number | null = null, count = 0;
  doc.descendants((node, position) => { if (node.type.name === 'heading' && node.attrs.id === heading.id) { found = position; count++; return false; } return true; });
  return count === 1 ? found : null;
}

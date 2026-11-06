import test from 'node:test';
import assert from 'node:assert/strict';
import { Schema } from '@tiptap/pm/model';
import { documentHeadings, headingPosition, matchingHeadings } from './document-outline.ts';
export const outlineSchema = new Schema({ nodes: {
  doc: { content: 'block+', attrs: { readingOrder: { default: [] } } },
  heading: { group: 'block', content: 'inline*', attrs: { id: { default: null }, level: { default: 1 } } },
  paragraph: { group: 'block', content: 'inline*', attrs: { id: { default: null } } },
  blockquote: { group: 'block', content: 'block+', attrs: { id: { default: null } } },
  notePanel: { group: 'block', content: 'block+', attrs: { id: { default: null } } },
  codeBlock: { group: 'block', content: 'text*', attrs: { id: { default: null } } },
  hardBreak: { group: 'inline', inline: true }, text: { group: 'inline' },
} });
export const heading = (id: string | null, text: string, level = 1) => outlineSchema.node('heading', { id, level }, text ? outlineSchema.text(text) : []);
test('outline follows logical object order across layout panels and nested authored blocks', () => {
  const a = outlineSchema.node('blockquote', { id: 'object-a' }, [heading('a1', 'Logical first', 2), heading('a2', 'Nested second', 4)]);
  const b = outlineSchema.node('notePanel', { id: 'layout-b' }, [heading('b', 'Visually first', 1)]);
  const doc = outlineSchema.node('doc', { readingOrder: ['object-a', 'b'] }, [b, a]);
  const items = documentHeadings(doc); assert.deepEqual(items.map(item => item.id), ['a1', 'a2', 'b']);
  assert.deepEqual(items.map(item => item.level), [2, 4, 1]); for (const item of items) assert.equal(doc.nodeAt(item.position)?.attrs.id, item.id);
});
test('new headings reconcile with existing logical order, and non-heading text never enters the outline', () => {
  const doc = outlineSchema.node('doc', { readingOrder: ['a', 'b'] }, [heading('b', 'B'), heading('new', 'New'), heading('a', 'A'), outlineSchema.node('codeBlock', { id: 'code' }, outlineSchema.text('# This is source text, not a heading'))]);
  assert.deepEqual(documentHeadings(doc).map(item => item.id), ['a', 'b', 'new']); assert.equal(matchingHeadings(documentHeadings(doc), 'source text').length, 0);
});
test('empty labels, line breaks, Unicode and shortened labels retain searchable heading names', () => {
  const long = 'Synthetic heading '.repeat(30) + '終点';
  const doc = outlineSchema.node('doc', null, [heading('empty', '', 6), outlineSchema.node('heading', { id: 'break', level: 3 }, [outlineSchema.text('Field'), outlineSchema.node('hardBreak'), outlineSchema.text('notes')]), heading('long', long)]);
  const items = documentHeadings(doc); assert.equal(items[0].label, 'Untitled heading'); assert.equal(items[1].label, 'Field notes');
  assert.ok(items[2].label.length <= 241); assert.ok(items[2].label.endsWith('…')); assert.equal(matchingHeadings(items, '終点')[0].id, 'long'); assert.equal(matchingHeadings(items, ' FIELD   NOTES ')[0].id, 'break');
});
test('navigation resolves moved stable IDs and rejects removed, duplicate or changed anonymous headings', () => {
  const doc = outlineSchema.node('doc', null, [heading('a', 'A'), heading(null, 'Anonymous')]), [a, anonymous] = documentHeadings(doc);
  const moved = outlineSchema.node('doc', null, [outlineSchema.node('paragraph', { id: 'prefix' }, outlineSchema.text('Prefix')), ...doc.content.content]);
  assert.equal(headingPosition(doc, doc, anonymous), anonymous.position);
  assert.ok(headingPosition(moved, doc, a)! > a.position); assert.equal(headingPosition(moved, doc, anonymous), null);
  const removed = outlineSchema.node('doc', null, [heading('other', 'Other')]); assert.equal(headingPosition(removed, doc, a), null);
  const duplicate = outlineSchema.node('doc', null, [heading('a', 'A'), heading('a', 'Other A')]); assert.equal(headingPosition(duplicate, doc, a), null);
});

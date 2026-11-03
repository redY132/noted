import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { Editor, type JSONContent } from '@tiptap/core';
import { createEditorExtensions } from './editor-extensions.ts';
import { applyEditorProjection, groupSelection, inspectArrangement } from './document-editor.ts';
import { documentFromEditor, documentToEditor, previewDocumentOperations, validateDocument, withStableIds, type DocumentPermission, type NotedDocumentV2 } from './document-model.ts';
import { unwrapPanel, updateComponent } from './note-components.ts';

const noteId = '00000000-0000-4000-8000-000000000001', assetId = '00000000-0000-4000-8000-000000000002';
const p = (text: string, id?: string): JSONContent => ({ type: 'paragraph', ...(id ? { attrs: { id } } : {}), content: [{ type: 'text', text }] });
function textAndRefs(node: JSONContent): unknown[] {
  const parts: unknown[] = [];
  const walk = (n: JSONContent) => {
    if (n.text) parts.push(['text', n.text]);
    if (n.attrs?.id) parts.push(['id', n.attrs.id]);
    if (n.type === 'localImage') parts.push(['asset', n.attrs?.assetId, n.attrs?.alt, n.attrs?.href]);
    n.marks?.filter(mark => mark.type === 'link').forEach(mark => parts.push(['link', mark.attrs?.href]));
    n.content?.forEach(walk);
  };
  walk(node); return parts;
}
const fixture: JSONContent = { type: 'doc', content: [
  p('First words', 'first'),
  { type: 'notePanel', attrs: { id: 'group', layoutKind: 'grid', padding: 24, gap: 14, gridColumns: 2 }, content: [
    { type: 'heading', attrs: { id: 'heading', level: 2 }, content: [{ type: 'text', text: 'Nested heading' }] },
    { type: 'notePanel', attrs: { id: 'nested', layoutKind: 'row' }, content: [p('Deterministic missing ID'), { type: 'localImage', attrs: { id: 'picture', assetId, alt: 'Local asset', href: `noted://note/${noteId}` } }] },
  ] },
  { type: 'paragraph', attrs: { id: 'last' }, content: [{ type: 'text', text: 'Written reference', marks: [{ type: 'link', attrs: { href: `noted://note/${noteId}` } }] }] },
] };
const permissions = (...grants: DocumentPermission[]) => new Set(grants);

test('v1 migration is deterministic, read-only, and roundtrips nested IDs, words, links, assets, and container styles', () => {
  const original = structuredClone(fixture), stable = withStableIds(fixture, noteId);
  const first = documentFromEditor(fixture, noteId), second = documentFromEditor(fixture, noteId);
  assert.deepEqual(first, second); assert.deepEqual(fixture, original);
  assert.deepEqual(textAndRefs(documentToEditor(first)), textAndRefs(stable));
  assert.deepEqual(first.readingOrder, ['first', 'heading', stable.content![1].content![1].content![0].attrs!.id, 'picture', 'last']);
  assert.equal(first.layout.children![1].style!.padding, 24);
  assert.equal(first.layout.children![1].children![1].kind, 'row');
  assert.deepEqual(documentFromEditor(documentToEditor(first), noteId, first), first);
  assert.equal(first.objects.picture.kind, 'image');
});

test('duplicate/missing content and layout references fail without changing source', () => {
  const good = documentFromEditor(fixture, noteId), before = JSON.stringify(good);
  const invalid: NotedDocumentV2[] = [];
  const mutate = (f: (document: NotedDocumentV2) => void) => { const next = structuredClone(good); f(next); invalid.push(next); };
  mutate(d => d.readingOrder.push('first'));
  mutate(d => d.layout.children!.push(structuredClone(d.layout.children![0])));
  mutate(d => { d.layout.children![0].contentId = 'missing'; });
  mutate(d => { d.layout.children!.shift(); });
  mutate(d => { d.styles.missing = { width: 200 }; });
  mutate(d => { d.layout.children![0].style = { width: 200, opacity: 0 } as never; });
  for (const bad of invalid) assert.throws(() => validateDocument(bad));
  assert.throws(() => withStableIds({ type: 'doc', content: [p('A', 'same'), p('B', 'same')] }, noteId), /Duplicate/);
  assert.equal(JSON.stringify(good), before);
});

test('visual arrangement never changes logical reading order; explicit reorder requires its own grant', () => {
  const original = documentFromEditor({ type: 'doc', content: [p('One', 'one'), p('Two', 'two'), p('Three', 'three')] }, noteId);
  const layout = structuredClone(original.layout); layout.children!.reverse();
  const arranged = previewDocumentOperations(original, [{ type: 'arrange', layout }], permissions('arrangement'));
  assert.deepEqual(arranged.readingOrder, ['one', 'two', 'three']);
  const projection = documentToEditor(arranged);
  assert.equal(projection.content![0].attrs!.id, 'three');
  assert.deepEqual(documentFromEditor(projection, noteId, arranged).readingOrder, original.readingOrder);
  assert.throws(() => previewDocumentOperations(original, [{ type: 'reorder', readingOrder: ['three', 'two', 'one'] }], permissions('arrangement')), /reorganization/);
  assert.deepEqual(previewDocumentOperations(original, [{ type: 'reorder', readingOrder: ['three', 'two', 'one'] }], permissions('reorganization')).readingOrder, ['three', 'two', 'one']);
});

test('formatting protects exact words, references, nested component versions/state, and spatial properties', () => {
  const component = { type: 'interactiveComponent', attrs: { id: 'script', definitionId: 'counter', definitionVersion: 1, properties: {}, state: { count: 2 }, fallback: 'Count: 2', placement: 'flow', x: 0, y: 0 }, content: [] };
  const source = documentFromEditor({ type: 'doc', content: [{ type: 'blockquote', attrs: { id: 'quote' }, content: [p('Keep these words', 'words'), component, { type: 'localImage', attrs: { id: 'nested-image', assetId, alt: 'Keep alt', href: `noted://note/${noteId}` } }] }] }, noteId);
  const rich = source.objects.quote; assert.equal(rich.kind, 'richText'); if (rich.kind !== 'richText') return;
  for (const mutate of [
    (n: JSONContent) => { n.content![0].content![0].text = 'Changed'; },
    (n: JSONContent) => { n.content![1].attrs!.definitionVersion = 2; },
    (n: JSONContent) => { n.content![1].attrs!.state = { count: 999 }; },
    (n: JSONContent) => { n.content![1].attrs!.x = 500; },
    (n: JSONContent) => { n.content![2].attrs!.assetId = 'replaced'; },
    (n: JSONContent) => { n.content![2].attrs!.href = null; },
    (n: JSONContent) => { n.content![0].attrs!.placement = 'free'; },
  ]) {
    const replacement = structuredClone(rich.content); mutate(replacement);
    assert.throws(() => previewDocumentOperations(source, [{ type: 'format', id: 'quote', content: replacement }], permissions('formatting')), /preserve/);
  }
  const replacement = structuredClone(rich.content); replacement.content![0].type = 'heading'; replacement.content![0].attrs!.level = 2;
  const formatted = previewDocumentOperations(source, [{ type: 'format', id: 'quote', content: replacement }], permissions('formatting'));
  assert.equal(formatted.objects.quote.kind === 'richText' && formatted.objects.quote.content.content![0].type, 'heading');
});

test('operation batches are atomic and content permission cannot activate code or bypass component state scope', () => {
  const source = documentFromEditor({ type: 'doc', content: [p('Original', 'text'), { type: 'interactiveComponent', attrs: { id: 'widget', definitionId: 'counter', definitionVersion: 1, properties: {}, state: { count: 0 }, fallback: 'Counter' } }] }, noteId), before = JSON.stringify(source);
  assert.throws(() => previewDocumentOperations(source, [
    { type: 'style', id: 'text', properties: { tone: 'accent' } },
    { type: 'state', id: 'missing', state: {} },
  ], permissions('formatting', 'componentState')));
  assert.equal(JSON.stringify(source), before);
  const widget = source.objects.widget; assert.equal(widget.kind, 'component'); if (widget.kind !== 'component') return;
  assert.throws(() => previewDocumentOperations(source, [{ type: 'edit', id: 'widget', object: { ...widget, definition: { id: 'counter', version: 2 } } }], permissions('content')), /activate/);
  assert.throws(() => previewDocumentOperations(source, [{ type: 'edit', id: 'widget', object: { ...widget, state: { count: 5 } } }], permissions('content')), /componentState/);
  assert.throws(() => previewDocumentOperations(source, [{ type: 'edit', id: 'text', object: { id: 'text', kind: 'richText', content: { type: 'blockquote', attrs: { id: 'text' }, content: [{ type: 'interactiveComponent', attrs: { id: 'new-widget', definitionId: 'unapproved', definitionVersion: 1, properties: {}, state: {}, fallback: 'Unapproved' } }] } } }], permissions('content')), /activate/);
  const changed = previewDocumentOperations(source, [{ type: 'state', id: 'widget', state: { count: 5 } }], permissions('componentState'));
  assert.deepEqual(changed.objects.widget.kind === 'component' && changed.objects.widget.state, { count: 5 });
});

test('insert/remove require three separate scopes, validate final batches, and cannot activate scripts', () => {
  const source = documentFromEditor({ type: 'doc', content: [{ type: 'notePanel', attrs: { id: 'box' }, content: [p('Original', 'original')] }, p('Keep', 'keep')] }, noteId);
  const insert = { type: 'insert' as const, object: { id: 'new', kind: 'richText' as const, content: p('Inserted', 'new') }, parent: 'box', index: 1, readingIndex: 1 };
  for (const grant of [permissions('content', 'arrangement'), permissions('arrangement', 'reorganization'), permissions('content', 'reorganization')]) assert.throws(() => previewDocumentOperations(source, [insert], grant), /Permission/);
  const grants = permissions('content', 'arrangement', 'reorganization');
  const inserted = previewDocumentOperations(source, [insert], grants);
  assert.deepEqual(inserted.readingOrder, ['original', 'new', 'keep']);
  assert.equal(inserted.layout.children![0].children![1].contentId, 'new');
  assert.throws(() => previewDocumentOperations(inserted, [insert], grants), /unique/);
  assert.throws(() => previewDocumentOperations(source, [{ ...insert, index: -1 }], grants), /indices/);
  assert.throws(() => previewDocumentOperations(source, [{ ...insert, readingIndex: 10 }], grants), /indices/);
  assert.throws(() => previewDocumentOperations(source, [{ ...insert, parent: 'layout-keep' }], grants), /container/);
  assert.throws(() => previewDocumentOperations(source, [{ ...insert, object: { id: 'new', kind: 'component', definition: { id: 'counter', version: 1 }, props: {}, state: {}, fallback: 'Counter' } }], grants), /activate/);
  assert.throws(() => previewDocumentOperations(source, [{ type: 'remove', id: 'original' }], grants), /container/);
  const layout = structuredClone(source.layout); layout.children!.shift();
  const pruned = previewDocumentOperations(source, [{ type: 'remove', id: 'original' }, { type: 'arrange', layout }], grants);
  assert.deepEqual(pruned.readingOrder, ['keep']); assert.equal(pruned.objects.original, undefined);
  assert.throws(() => previewDocumentOperations(pruned, [{ type: 'remove', id: 'keep' }], grants), /at least one/);
  const styled = structuredClone(inserted); styled.styles.new = { tone: 'accent' };
  const removed = previewDocumentOperations(styled, [{ type: 'remove', id: 'new' }], grants);
  assert.equal(removed.styles.new, undefined); assert.deepEqual(removed.readingOrder, source.readingOrder);
});

const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true, url: 'http://localhost/' });
Object.defineProperties(globalThis, {
  window: { value: dom.window, configurable: true }, document: { value: dom.window.document, configurable: true }, navigator: { value: dom.window.navigator, configurable: true },
  Node: { value: dom.window.Node, configurable: true }, HTMLElement: { value: dom.window.HTMLElement, configurable: true }, Element: { value: dom.window.Element, configurable: true },
  MutationObserver: { value: dom.window.MutationObserver, configurable: true }, getComputedStyle: { value: dom.window.getComputedStyle.bind(dom.window), configurable: true },
  requestAnimationFrame: { value: dom.window.requestAnimationFrame.bind(dom.window), configurable: true }, cancelAnimationFrame: { value: dom.window.cancelAnimationFrame.bind(dom.window), configurable: true },
});
function createEditor(content: JSONContent[] = [p('Alpha', 'alpha'), p('Beta', 'beta'), p('Gamma', 'gamma')]) {
  const element = document.createElement('div'); document.body.append(element);
  return new Editor({ element, extensions: createEditorExtensions(), content: { type: 'doc', content } });
}
function at(e: Editor, text: string) { let found = -1; e.state.doc.descendants((node, position) => { if (node.text === text) found = position; }); assert.notEqual(found, -1); return found; }

test('nested grid/row grouping and ungrouping preserve logical content and share a single editor history', () => {
  const e = createEditor();
  try {
    const before = e.getJSON(), initialOrder = documentFromEditor(before, noteId).readingOrder;
    e.commands.setTextSelection({ from: at(e, 'Alpha'), to: at(e, 'Beta') + 4 });
    assert.equal(groupSelection(e, 'grid'), true); const grouped = e.getJSON();
    assert.equal(grouped.content![0].attrs!.layoutKind, 'grid');
    assert.deepEqual(documentFromEditor(grouped, noteId).readingOrder, initialOrder);
    e.commands.setTextSelection(at(e, 'Alpha'));
    assert.equal(groupSelection(e, 'row'), true);
    assert.equal((e.getJSON() as JSONContent).content![0].content![0].attrs!.layoutKind, 'row');
    assert.deepEqual(documentFromEditor(e.getJSON(), noteId).readingOrder, initialOrder);
    assert.equal(e.commands.undo(), true); assert.deepEqual(e.getJSON(), grouped);
    assert.equal(e.commands.redo(), true);
    assert.equal(unwrapPanel(e), true);
    assert.deepEqual(documentFromEditor(e.getJSON(), noteId).readingOrder, initialOrder);
    assert.equal(e.commands.undo(), true);
    assert.equal(e.getJSON().content![0].content![0].type, 'notePanel');
    e.commands.undo(); e.commands.undo(); assert.deepEqual(e.getJSON(), before);
  } finally { e.destroy(); }
});

test('adapter projection applies as one undo step without recreating editor, and free placement preserves reading order', () => {
  const e = createEditor([{ type: 'notePanel', attrs: { id: 'panel', layoutKind: 'column' }, content: [p('Flow text', 'text')] }, p('Following', 'following')]);
  try {
    const instance = e, before = e.getJSON(), document = documentFromEditor(before, noteId);
    const rearranged = structuredClone(document); rearranged.layout.children!.reverse();
    assert.equal(applyEditorProjection(e, documentToEditor(rearranged)), true);
    assert.equal(e, instance); assert.deepEqual(documentFromEditor(e.getJSON(), noteId).readingOrder, document.readingOrder);
    assert.equal(e.commands.undo(), true); assert.deepEqual(e.getJSON(), before);
    e.commands.setNodeSelection(0);
    assert.equal(updateComponent(e, { placement: 'free', x: 2000, y: 4000 }), true);
    const placed = documentFromEditor(e.getJSON(), noteId);
    assert.deepEqual(placed.readingOrder, document.readingOrder);
    assert.equal(placed.layout.children![0].style!.x, 2000); assert.equal(placed.layout.children![0].style!.y, 4000);
    const tooFar = structuredClone(placed); tooFar.layout.children![0].style!.x = 99999;
    assert.match(inspectArrangement(tooFar).join(' '), /Unreachable/);
  } finally { e.destroy(); }
});

test('projection arrangement retains a text range by stable block identity and retains selected components', () => {
  const e = createEditor();
  try {
    e.commands.setTextSelection({ from: at(e, 'Alpha') + 1, to: at(e, 'Alpha') + 4 });
    const originalView = e.view, originalText = e.state.doc.textBetween(e.state.selection.from, e.state.selection.to);
    const document = documentFromEditor(e.getJSON(), noteId); document.layout.children!.reverse();
    applyEditorProjection(e, documentToEditor(document));
    assert.equal(e.view, originalView);
    assert.equal(e.state.doc.textBetween(e.state.selection.from, e.state.selection.to), originalText);
    assert.equal(e.state.selection.$from.parent.attrs.id, 'alpha');
    e.commands.setTextSelection(at(e, 'Alpha'));
    groupSelection(e, 'column');
    const id = e.state.doc.nodeAt(e.state.selection.from)!.attrs.id;
    const grouped = documentFromEditor(e.getJSON(), noteId); grouped.layout.children!.reverse();
    applyEditorProjection(e, documentToEditor(grouped));
    assert.equal(e.state.doc.nodeAt(e.state.selection.from)!.attrs.id, id);
    assert.equal(e.state.selection.toJSON().type, 'node');
  } finally { e.destroy(); }
});

test('arrangement checks cannot be bypassed through style overrides or a direct preview call', () => {
  const source = documentFromEditor({type:'doc',content:[p('One','one'),p('Two','two')]},noteId);
  const before = structuredClone(source);
  const permissions = new Set<DocumentPermission>(['arrangement']);
  assert.throws(() => previewDocumentOperations(source,[{type:'style',id:'one',properties:{placement:'free',x:99999,y:0,width:160}}],permissions),/Unreachable/);
  assert.throws(() => previewDocumentOperations(source,[
    {type:'style',id:'one',properties:{placement:'free',x:100,y:100,width:320}},
    {type:'style',id:'two',properties:{placement:'free',x:100,y:100,width:320}},
  ],permissions),/overlap/);
  assert.equal(JSON.stringify(source),JSON.stringify(before));
  const accepted=previewDocumentOperations(source,[
    {type:'style',id:'one',properties:{placement:'free',x:100,y:100,width:320}},
    {type:'style',id:'two',properties:{placement:'free',x:500,y:100,width:320}},
  ],permissions);
  assert.deepEqual(accepted.readingOrder,source.readingOrder);
});

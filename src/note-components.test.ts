import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { Editor, type JSONContent } from '@tiptap/core';
import { AllSelection } from '@tiptap/pm/state';
import { createEditorExtensions } from './editor-extensions.ts';
import { moveComponent, panelFixture, selectedComponent, updateComponent, wrapInPanel, canWrapInPanel, unwrapPanel, insertLocalImage, changeComponentLayer, insertPanel } from './note-components.ts';
import { componentMarkup, initializeComponentUI } from './component-ui.ts';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true, url: 'http://localhost/' });
for (const name of ['window', 'document', 'navigator', 'Node', 'HTMLElement', 'Element', 'MutationObserver']) Object.defineProperty(globalThis, name, { value: name === 'window' ? dom.window : dom.window[name as keyof typeof dom.window], configurable: true });
Object.defineProperties(globalThis, {
  getComputedStyle: { value: dom.window.getComputedStyle.bind(dom.window), configurable: true },
  requestAnimationFrame: { value: dom.window.requestAnimationFrame.bind(dom.window), configurable: true },
  cancelAnimationFrame: { value: dom.window.cancelAnimationFrame.bind(dom.window), configurable: true },
});
const paragraph = (text: string): JSONContent => ({ type: 'paragraph', attrs: { id: text }, content: [{ type: 'text', text }] });
function make(content: JSONContent[], resolveAsset?: (assetId: string) => Promise<string>) {
  const element = document.createElement('div'); document.body.append(element);
  return new Editor({ element, content: { type: 'doc', content }, extensions: createEditorExtensions(() => 'default', { resolveAsset }) });
}

test('resizing the note surface updates flow bounds without changing content or history', async () => {
  const callbacks=new Map<Element,()=>void>();let disconnects=0;
  const original=globalThis.ResizeObserver;
  Object.defineProperty(globalThis,'ResizeObserver',{configurable:true,value:class {callback:()=>void; constructor(callback:()=>void){this.callback=callback;} observe(element:Element){callbacks.set(element,this.callback);} disconnect(){disconnects++;}}});
  const editor=make([panelFixture('Unchanged words','resize-panel')]);
  try {
    const surface=editor.view.dom.parentElement!;let width=400;
    Object.defineProperty(surface,'clientWidth',{configurable:true,get:()=>width});
    await Promise.resolve();const before=editor.getJSON();
    assert.equal(editor.view.dom.style.getPropertyValue('--flow-width'),'400px');
    width=900;callbacks.get(surface)!();await Promise.resolve();
    assert.equal(editor.view.dom.style.getPropertyValue('--flow-width'),'900px');
    assert.deepEqual(editor.getJSON(),before);assert.equal(editor.can().undo(),false);
  } finally {editor.destroy();Object.defineProperty(globalThis,'ResizeObserver',{configurable:true,value:original});}
  assert.ok(disconnects>=2);
});
test('wrapping paragraphs preserves exact words, marks and IDs; properties and movement undo independently', () => {
  const editor = make([paragraph('First'), { ...paragraph('Second'), content: [{ type: 'text', text: 'Second', marks: [{ type: 'bold' }] }] }, paragraph('Third')]);
  try {
    const original = editor.getJSON();
    editor.commands.setTextSelection({ from: 1, to: 14 });
    assert.equal(wrapInPanel(editor), true);
    const panel = editor.getJSON().content![0];
    assert.equal(panel.type, 'notePanel');
    assert.deepEqual(panel.content, original.content!.slice(0, 2));
    assert.equal(editor.state.doc.textContent, 'FirstSecondThird');
    assert.equal(wrapInPanel(editor), false, 'nested panels are not introduced by the UI operation');
    const wrapped = editor.getJSON();
    assert.equal(updateComponent(editor, { width: 320, align: 'center', tone: 'accent' }), true);
    assert.equal(editor.getJSON().content![0].attrs!.width, 320);
    assert.equal(moveComponent(editor, 1), true);
    assert.equal(editor.getJSON().content![1].type, 'notePanel');
    assert.equal(editor.commands.undo(), true);
    assert.equal(editor.getJSON().content![0].attrs!.width, 320);
    assert.equal(editor.commands.undo(), true);
    assert.deepEqual(editor.getJSON(), wrapped);
    assert.equal(editor.commands.undo(), true);
    assert.deepEqual(editor.getJSON(), original);
  } finally { editor.destroy(); }
});
test('component properties reject unsafe input and leave original content untouched', () => {
  const editor = make([panelFixture('Keep every word.', 'panel')]);
  try {
    editor.commands.setTextSelection(2); const original = editor.getJSON();
    for (const width of [0, 159, 1201, Infinity, NaN, 400.5]) assert.equal(updateComponent(editor, { width }), false);
    assert.equal(updateComponent(editor, { tone: 'url(https://example.com)' as 'soft' }), false);
    assert.equal(updateComponent(editor, { alt: 'not an image' }), false);
    assert.equal(updateComponent(editor, { content: 'replace words' } as {}), false);
    assert.equal(updateComponent(editor, { width: undefined, align: undefined }), false);
    assert.deepEqual(editor.getJSON(), original);
    editor.setEditable(false);
    assert.equal(updateComponent(editor, { width: 480 }), false);
    assert.equal(moveComponent(editor, 1), false);
  } finally { editor.destroy(); }
});
test('Ctrl+A AllSelection enables panel grouping and preserves every selected block', () => {
  const toolbar = document.createElement('div'); toolbar.innerHTML = componentMarkup; document.body.append(toolbar);
  const editor = make([paragraph('First paragraph'), paragraph('Second paragraph')]);
  try {
    const original = editor.getJSON();
    editor.view.dispatch(editor.state.tr.setSelection(new AllSelection(editor.state.doc)));
    const ui = initializeComponentUI({ getEditor: () => editor, getNoteId: () => 'note', importAsset: async () => ({ id: crypto.randomUUID() }), error: reason => { throw reason; } });
    ui.sync();
    assert.equal(toolbar.querySelector<HTMLButtonElement>('#make-panel')!.disabled, false);
    assert.equal(canWrapInPanel(editor), true);
    assert.equal(wrapInPanel(editor), true);
    assert.deepEqual(editor.getJSON().content![0].content, original.content);
    assert.equal(selectedComponent(editor)?.node.type.name, 'notePanel');
    ui.sync();
    assert.equal(toolbar.querySelector<HTMLElement>('#component-properties')!.hidden, false);
    assert.equal(toolbar.querySelector<HTMLInputElement>('#component-width')!.value, '640');
    editor.view.dispatch(editor.state.tr.setSelection(new AllSelection(editor.state.doc)));
    assert.equal(canWrapInPanel(editor), false, 'selecting an existing panel does not create nested panels');
    editor.commands.undo(); assert.deepEqual(editor.getJSON(), original);
  } finally { editor.destroy(); toolbar.remove(); }
});
test('panels retain editable Markdown formatting and serialize/reopen without flattening', () => {
  const editor = make([panelFixture('Editable words', 'panel')]);
  try {
    editor.commands.setTextSelection({ from: 2, to: 10 });
    editor.commands.toggleItalic();
    editor.commands.indent();
    editor.commands.insertContent('New text');
    const before = editor.getJSON();
    const reopened = make(before.content!);
    try { assert.deepEqual(reopened.getJSON(), before); assert.equal(reopened.state.doc.textContent, editor.state.doc.textContent); }
    finally { reopened.destroy(); }
  } finally { editor.destroy(); }
});
test('image metadata, movement and undo share document history and never persist a runtime URL', async () => {
  const calls: string[] = [];
  const editor = make([paragraph('Before'), { type: 'localImage', attrs: { id: 'image', assetId: '7d48a624-7781-4d04-bc24-286e0e315127', alt: '<script>literal description</script>', width: 480, align: 'left' } }, paragraph('After')], async id => { calls.push(id); return 'blob:http://localhost/test-image'; });
  try {
    await Promise.resolve();
    editor.commands.setNodeSelection(editor.state.doc.child(0).nodeSize);
    assert.equal(selectedComponent(editor)?.node.type.name, 'localImage');
    assert.equal(updateComponent(editor, { width: 360, alt: 'A calm scene', align: 'right' }), true);
    assert.equal(calls.length, 1, 'changing presentation does not reload the asset');
    const beforeMove = editor.getJSON();
    assert.equal(moveComponent(editor, -1), true);
    assert.equal(editor.commands.undo(), true);
    assert.deepEqual(editor.getJSON(), beforeMove);
    assert.ok(!JSON.stringify(editor.getJSON()).includes('blob:'));
    assert.ok(!editor.view.dom.querySelector('script'));
    assert.equal(editor.state.doc.textContent, 'BeforeAfter');
    assert.equal(updateComponent(editor, { tone: 'accent' }), false);
  } finally { editor.destroy(); }
});
test('cross-panel text selection uses a single editor and formatting preserves both panels', () => {
  const editor = make([panelFixture('First panel', 'one'), panelFixture('Second panel', 'two')]);
  try {
    assert.equal(editor.view.dom.querySelectorAll('[contenteditable="true"]').length, 0, 'single root editor owns all panel content');
    editor.commands.setTextSelection({ from: 2, to: editor.state.doc.content.size - 2 });
    assert.equal(editor.commands.toggleBold(), true);
    const panels = (editor.getJSON().content! as JSONContent[]).filter(node => node.type === 'notePanel');
    assert.ok(panels.every(panel => panel.content![0].content![0].marks!.some(mark => mark.type === 'bold')));
    assert.equal(editor.state.doc.textContent, 'First panelSecond panel');
  } finally { editor.destroy(); }
});
test('unwrapping a panel selected after moving preserves content and can be undone', () => {
  const editor = make([panelFixture('My words', 'panel'), paragraph('Other words')]);
  try {
    editor.commands.setTextSelection(2); assert.equal(moveComponent(editor, 1), true);
    const before = editor.getJSON();
    assert.equal(unwrapPanel(editor), true);
    assert.equal(editor.getJSON().content!.some(node => node.type === 'notePanel'), false);
    assert.equal(editor.state.doc.textContent, 'Other wordsMy words');
    editor.commands.undo(); assert.deepEqual(editor.getJSON(), before);
  } finally { editor.destroy(); }
});
test('an image import completing after navigation never inserts into the new note', async () => {
  const toolbar = document.createElement('div'); toolbar.innerHTML = componentMarkup; document.body.append(toolbar);
  const first = make([paragraph('First note')]); const second = make([paragraph('Second note')]);
  let active = first; let noteId = 'first'; let resolve!: (asset: { id: string }) => void;
  const errors: unknown[] = [];
  initializeComponentUI({ getEditor: () => active, getNoteId: () => noteId, importAsset: async () => new Promise(done => { resolve = done; }), error: reason => errors.push(reason) });
  try {
    const input = toolbar.querySelector<HTMLInputElement>('#image-file')!;
    Object.defineProperty(input, 'files', { value: [new dom.window.File(['test'], 'image.png', { type: 'image/png' })] });
    input.dispatchEvent(new dom.window.Event('change'));
    assert.equal(toolbar.querySelector<HTMLButtonElement>('#insert-image')!.disabled, true);
    active = second; noteId = 'second'; first.destroy();
    resolve({ id: crypto.randomUUID() });
    await new Promise(done => setTimeout(done, 0));
    assert.equal(second.state.doc.textContent, 'Second note');
    assert.equal(second.getJSON().content!.some(node => node.type === 'localImage'), false);
    assert.deepEqual(errors, []);
    assert.equal(toolbar.querySelector<HTMLButtonElement>('#insert-image')!.disabled, false);
  } finally { if (!first.isDestroyed) first.destroy(); second.destroy(); toolbar.remove(); }
});
test('image insertion preserves selected words and selected panels instead of replacing them', () => {
  for (const nodeSelection of [false, true]) {
    const editor = make([panelFixture('Keep every word', crypto.randomUUID()), paragraph('After')]);
    try {
      if (nodeSelection) editor.commands.setNodeSelection(0);
      else editor.commands.setTextSelection({ from: 2, to: 7 });
      const before = editor.getJSON();
      assert.equal(insertLocalImage(editor, crypto.randomUUID(), 'Example'), true);
      assert.equal(editor.state.doc.textContent, 'Keep every wordAfter');
      assert.equal(editor.getJSON().content![0].type, 'notePanel');
      editor.commands.undo(); assert.deepEqual(editor.getJSON(), before);
    } finally { editor.destroy(); }
  }
});
test('pointer resizing previews without document writes, commits once, and undoes', () => {
  const editor = make([panelFixture('Unchanged words', crypto.randomUUID()), { type: 'paragraph', attrs: { id: crypto.randomUUID() } }]);
  try {
    const panel = editor.view.dom.querySelector<HTMLElement>('.note-panel')!;
    Object.defineProperty(panel, 'getBoundingClientRect', { value: () => ({ width: 640 }) });
    const before = editor.getJSON();
    panel.querySelector('button')!.dispatchEvent(new dom.window.MouseEvent('pointerdown', { clientX: 100, button: 0, bubbles: true }));
    window.dispatchEvent(new dom.window.MouseEvent('pointermove', { clientX: 250 }));
    assert.deepEqual(editor.getJSON(), before, 'drag previews do not serialize transactions for every pointer move');
    assert.equal(panel.style.width, '790px');
    window.dispatchEvent(new dom.window.MouseEvent('pointerup', { clientX: 250 }));
    assert.equal(editor.getJSON().content![0].attrs!.width, 790);
    assert.equal(editor.state.doc.textContent, 'Unchanged words');
    editor.commands.undo(); assert.deepEqual(editor.getJSON(), before);
  } finally { editor.destroy(); }
});
test('offscreen images defer asset reads and disconnect visibility observers on disposal', async () => {
  const callbacks: IntersectionObserverCallback[] = []; let disconnects = 0; let reads = 0;
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'IntersectionObserver');
  Object.defineProperty(globalThis, 'IntersectionObserver', { configurable: true, value: class {
    constructor(next: IntersectionObserverCallback) { callbacks.push(next); }
    observe() {} disconnect() { disconnects++; }
  } });
  const editor = make([{ type: 'localImage', attrs: { id: crypto.randomUUID(), assetId: crypto.randomUUID(), alt: 'Local', width: 480 } }], async () => { reads++; return 'blob:http://localhost/test'; });
  try {
    assert.equal(reads, 0);
    for (const callback of callbacks) callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    await Promise.resolve(); assert.equal(reads, 1);
    editor.destroy(); assert.ok(disconnects >= 2);
  } finally {
    if (!editor.isDestroyed) editor.destroy();
    if (previous) Object.defineProperty(globalThis, 'IntersectionObserver', previous);
    else Reflect.deleteProperty(globalThis, 'IntersectionObserver');
  }
});

test('free placement preserves words, extends the scroll surface, persists and returns to guided flow', async () => {
  const editor = make([panelFixture('Freely placed words', 'panel'), paragraph('Guided words')]);
  try {
    editor.commands.setNodeSelection(0); const before = editor.getJSON();
    assert.equal(updateComponent(editor, { placement: 'free', x: 2400, y: 3600, z: 2, animation: 'float' }), true);
    await Promise.resolve();
    const panel = editor.view.dom.querySelector<HTMLElement>('.note-panel')!;
    assert.equal(panel.dataset.placement, 'free'); assert.equal(panel.style.left, '2400px'); assert.equal(panel.style.top, '3600px');
    assert.equal(editor.view.dom.style.getPropertyValue('--free-width'), '3120px');
    assert.equal(editor.view.dom.style.getPropertyValue('--free-height'), '3840px');
    assert.equal(editor.state.doc.textContent, 'Freely placed wordsGuided words');
    const saved = editor.getJSON(); const reopened = make(saved.content!);
    try { assert.deepEqual(reopened.getJSON(), saved); } finally { reopened.destroy(); }
    assert.equal(changeComponentLayer(editor, 1), true); assert.equal(selectedComponent(editor)!.node.attrs.z, 3);
    assert.equal(editor.commands.undo(), true); assert.equal(selectedComponent(editor)!.node.attrs.z, 2);
    assert.equal(updateComponent(editor, { placement: 'flow' }), true); await Promise.resolve();
    assert.equal(panel.dataset.placement, 'flow'); assert.equal(panel.style.left, '');
    assert.equal(editor.view.dom.style.getPropertyValue('--free-height'), '0px');
    editor.commands.undo(); editor.commands.undo(); assert.deepEqual(editor.getJSON(), before);
  } finally { editor.destroy(); }
});

test('free placement extracts a nested image without losing panel words and undo restores exact nesting', () => {
  const image = { type: 'localImage', attrs: { id: 'img', assetId: crypto.randomUUID(), alt: 'Diagram', width: 480 } };
  const panel = panelFixture('Before image', 'panel'); panel.content!.push(image, paragraph('After image'));
  const editor = make([panel, paragraph('Following panel')]);
  try {
    const before = editor.getJSON(); const words = editor.state.doc.textContent;
    editor.commands.setNodeSelection(1 + editor.state.doc.firstChild!.child(0).nodeSize);
    assert.equal(updateComponent(editor, { placement: 'free', x: 900, y: 500 }), true);
    assert.equal(editor.state.doc.child(1).type.name, 'localImage');
    assert.equal(editor.state.doc.textContent, words);
    assert.equal(selectedComponent(editor)!.position, editor.state.doc.firstChild!.nodeSize);
    editor.commands.undo(); assert.deepEqual(editor.getJSON(), before);
  } finally { editor.destroy(); }
});

test('free dragging previews coordinates, commits once, supports keyboard and cancels cleanly', async () => {
  const editor = make([panelFixture('Move without changing me', 'panel')]);
  try {
    editor.commands.setNodeSelection(0); updateComponent(editor, { placement: 'free', x: 40, y: 60 });
    const before = editor.getJSON(); const panel = editor.view.dom.querySelector<HTMLElement>('.note-panel')!;
    const handle = panel.querySelector<HTMLButtonElement>('.component-move')!;
    handle.dispatchEvent(new dom.window.MouseEvent('pointerdown', { clientX: 100, clientY: 100, button: 0, bubbles: true }));
    window.dispatchEvent(new dom.window.MouseEvent('pointermove', { clientX: 250, clientY: 300 }));
    assert.deepEqual(editor.getJSON(), before); assert.equal(panel.style.left, '190px'); assert.equal(panel.style.top, '260px');
    window.dispatchEvent(new dom.window.MouseEvent('pointerup', { clientX: 250, clientY: 300 }));
    assert.equal(editor.state.doc.firstChild!.attrs.x, 190); assert.equal(editor.state.doc.firstChild!.attrs.y, 260);
    editor.commands.undo(); assert.deepEqual(editor.getJSON(), before);
    handle.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    assert.equal(editor.state.doc.firstChild!.attrs.x, 50);
    handle.dispatchEvent(new dom.window.MouseEvent('pointerdown', { clientX: 100, clientY: 100, button: 0, bubbles: true }));
    window.dispatchEvent(new dom.window.MouseEvent('pointermove', { clientX: 450, clientY: 300 }));
    window.dispatchEvent(new dom.window.MouseEvent('pointercancel'));
    assert.equal(panel.style.left, '50px'); assert.equal(editor.state.doc.firstChild!.attrs.x, 50);
  } finally { editor.destroy(); }
});

test('component placement, motion and image-link properties reject malformed programmatic values', () => {
  const editor = make([panelFixture('Protected words', 'panel')]);
  try {
    editor.commands.setNodeSelection(0); const before = editor.getJSON();
    for (const value of [-1, 100001, NaN, Infinity, 1.5]) assert.equal(updateComponent(editor, { x: value }), false);
    assert.equal(updateComponent(editor, { z: 10001 }), false);
    assert.equal(updateComponent(editor, { animation: 'script' as 'none' }), false);
    assert.equal(updateComponent(editor, { placement: 'fixed' as 'free' }), false);
    assert.equal(updateComponent(editor, { href: 'https://example.com' }), false, 'links belong to images, not text panels');
    assert.deepEqual(editor.getJSON(), before);
    insertLocalImage(editor, crypto.randomUUID(), 'Link');
    editor.commands.setNodeSelection(editor.state.doc.firstChild!.nodeSize);
    assert.equal(updateComponent(editor, { href: 'javascript:alert(1)' }), false);
    assert.equal(updateComponent(editor, { href: 'https://example.com/notes' }), true);
    assert.equal(editor.view.dom.querySelector('a.image-link')!.getAttribute('href'), 'https://example.com/notes');
    editor.commands.undo(); assert.equal(editor.view.dom.querySelector('a.image-link')!.getAttribute('href'), null);
    assert.equal(updateComponent(editor, { href: ' HTTP://EXAMPLE.COM ' }), true);
    assert.equal(selectedComponent(editor)!.node.attrs.href, 'http://example.com/');
    assert.equal(updateComponent(editor, { href: ' HTTP://EXAMPLE.COM ' }), false, 'canonical-equivalent URL is a no-op');
  } finally { editor.destroy(); }
});

test('new independent panels preserve words and inherit nearby free placement with shared undo', () => {
  const editor = make([panelFixture('Original words', 'panel')]);
  try {
    editor.commands.setTextSelection(2);
    updateComponent(editor, { placement: 'free', x: 100, y: 200, z: 2 });
    const before = editor.getJSON();
    assert.equal(insertPanel(editor), true);
    assert.equal(editor.getJSON().content!.filter(node => node.type === 'notePanel').length, 2);
    assert.equal(editor.state.doc.textContent, 'Original words');
    assert.equal(selectedComponent(editor)!.node.attrs.placement, 'free');
    assert.equal(selectedComponent(editor)!.node.attrs.x, 140);
    assert.equal(selectedComponent(editor)!.node.attrs.y, 240);
    assert.equal(selectedComponent(editor)!.node.attrs.z, 3);
    editor.commands.undo(); assert.deepEqual(editor.getJSON(), before);
  } finally { editor.destroy(); }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { SchemaIndentation } from './editor-extensions.ts';
import { SchemaPresentation, SchemaRegistry, type DocumentSchema } from './document-schema.ts';
import { initializeSchemaUI, localSchemaRegistry } from './schema-ui.ts';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true, url: 'http://localhost/' });
Object.defineProperties(globalThis, {
  window: { value: dom.window, configurable: true }, document: { value: dom.window.document, configurable: true }, navigator: { value: dom.window.navigator, configurable: true },
  Node: { value: dom.window.Node, configurable: true }, HTMLElement: { value: dom.window.HTMLElement, configurable: true }, Element: { value: dom.window.Element, configurable: true },
  MutationObserver: { value: dom.window.MutationObserver, configurable: true }, getComputedStyle: { value: dom.window.getComputedStyle.bind(dom.window), configurable: true },
  requestAnimationFrame: { value: dom.window.requestAnimationFrame.bind(dom.window), configurable: true }, cancelAnimationFrame: { value: dom.window.cancelAnimationFrame.bind(dom.window), configurable: true },
});
dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new dom.window.Event('close')); };
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
function setup() {
  const root = document.createElement('div'), element = document.createElement('div'); document.body.append(root, element);
  const editor = new Editor({ element, extensions: [StarterKit, SchemaIndentation, SchemaPresentation], content: '<p>Preserve these words.</p>' });
  const definition: DocumentSchema = { formatVersion: 1, id: 'test', version: 1, name: 'Test', rules: { body: { fontSize: 18, spacing: 10 } } };
  const registry = new SchemaRegistry([definition]), errors: unknown[] = [];
  const ui = initializeSchemaUI(root, { getEditor: () => editor, registry, error: error => errors.push(error) });
  const $ = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  return { editor, registry, root, ui, $, errors, destroy() { ui.destroy(); editor.destroy(); root.remove(); element.remove(); } };
}

test('schema UI publishes an immutable version, pins it explicitly, previews, and applies one undoable change', async () => {
  const s = setup();
  try {
    s.editor.commands.setTextSelection({ from: 2, to: 5 }); const selection = s.editor.state.selection.toJSON();
    s.ui.open(); assert.equal(s.$<HTMLDialogElement>('dialog').open, true);
    const picker = s.$<HTMLSelectElement>('[data-schema-version]'); picker.value = 'test@1'; picker.dispatchEvent(new dom.window.Event('change'));
    const size = s.$<HTMLInputElement>('[data-style=fontSize]'); size.value = '24'; size.dispatchEvent(new dom.window.Event('change')); await settle();
    s.$('[data-schema-publish]').click(); await settle();
    assert.equal(s.registry.get({ id: 'test', version: 1 })!.rules.body.fontSize, 18);
    assert.equal(s.registry.get({ id: 'test', version: 2 })!.rules.body.fontSize, 24);
    assert.equal(s.editor.state.doc.attrs.schemaReference, null, 'saving a definition never updates existing notes');
    s.$('[data-schema-pin]').click(); await settle();
    assert.deepEqual(s.editor.state.doc.attrs.schemaReference, { id: 'test', version: 2 });
    assert.deepEqual(s.editor.state.selection.toJSON(), selection);
    const before = s.editor.getJSON();
    s.$('[data-schema-preview]').click(); await settle(); assert.deepEqual(s.editor.getJSON(), before);
    assert.equal(s.$<HTMLButtonElement>('[data-schema-apply]').disabled, false);
    s.$('[data-schema-apply]').click(); await settle();
    assert.equal(s.editor.state.doc.textContent, 'Preserve these words.');
    assert.equal(s.editor.getJSON().content![0].attrs!.schemaStyle.fontSize, 24);
    assert.equal(s.editor.commands.undo(), true); assert.deepEqual(s.editor.getJSON(), before);
    assert.deepEqual(s.errors, []);
  } finally { s.destroy(); }
});

test('schema UI rejects stale previews and automatic mode without selected rules', async () => {
  const s = setup();
  try {
    s.ui.open(); s.$('[data-schema-preview]').click(); await settle();
    s.editor.commands.insertContent('New '); const before = s.editor.getJSON();
    s.$('[data-schema-apply]').click(); await settle();
    assert.deepEqual(s.editor.getJSON(), before); assert.match(String(s.errors[0]), /changed after preview/);
    s.$<HTMLInputElement>('[data-schema-auto]').checked = true; s.$('[data-schema-policy]').click(); await settle();
    assert.match(String(s.errors[1]), /at least one rule/);
    assert.equal(s.editor.state.doc.attrs.schemaPolicy, null);
    s.$<HTMLInputElement>('[data-enforce=spacing]').checked = true; s.$('[data-schema-policy]').click(); await settle();
    assert.deepEqual(s.editor.state.doc.attrs.schemaPolicy, { mode: 'automatic', enabledRules: ['spacing'] });
    s.ui.close(); assert.equal(s.$<HTMLDialogElement>('dialog').open, false);
  } finally { s.destroy(); }
});

test('browser schema library persists exact versions separately from note content', async () => {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
  const registry = localSchemaRegistry(storage);
  await registry.publish({ formatVersion: 1, id: 'offline', version: 1, name: 'Offline', rules: { body: { lineHeight: 1.6 } } });
  assert.equal(localSchemaRegistry(storage).get({ id: 'offline', version: 1 })!.name, 'Offline');
  assert.deepEqual([...data.keys()], ['noted-schema-library-v1']);
});

test('capturing the whole note creates a local guide draft without changing the note or its pin',async()=>{const s=setup();try{const before=s.editor.getJSON();s.ui.open();s.$('[data-schema-capture]').click();await settle();const draft=JSON.parse(s.$<HTMLTextAreaElement>('[data-schema-source]').value);assert.equal(draft.formatVersion,2);assert.equal(draft.version,1);assert.ok(draft.guide.document.readingOrder.length);assert.match(JSON.stringify(draft.guide.document),/Preserve these words/);assert.deepEqual(s.editor.getJSON(),before);assert.equal(s.registry.get(draft),undefined);s.$('[data-schema-publish]').click();await settle();assert.ok(s.registry.get(draft));assert.deepEqual(s.editor.getJSON(),before);assert.match(s.$('[data-schema-guide-status]').textContent!,/fresh consent/);assert.deepEqual(s.errors,[]);}finally{s.destroy();}});

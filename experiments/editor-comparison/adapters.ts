import { Editor, getSchema, type JSONContent } from '@tiptap/core';
import { DOMSerializer } from '@tiptap/pm/model';
import type { Node as DocumentNode } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import { closeHistory } from '@tiptap/pm/history';
import grapesjs, { type Editor as GrapesEditor, type Component } from 'grapesjs';
import { createEditorExtensions } from '../../src/editor-extensions';
import { fixtureImageUrl } from './fixtures';

export type Candidate = 'focused-tiptap' | 'grapesjs-tiptap';
export interface Adapter {
  kind: Candidate;
  activate(): Promise<void>;
  insert(text: string): void;
  resize(width: number): void;
  move(): void;
  undoText(): void;
  undoLayout(): void;
  canonical(): JSONContent;
  serialize(): string;
  restore(serialized: string): Promise<void>;
  destroy(): Promise<void>;
  element(): HTMLElement;
}
export const frames = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

export async function mount(kind: Candidate, host: HTMLElement, content: JSONContent): Promise<Adapter> {
  return kind === 'focused-tiptap' ? nativeAdapter(host, content) : grapesAdapter(host, content);
}

async function nativeAdapter(host: HTMLElement, content: JSONContent): Promise<Adapter> {
  const imageUrl = fixtureImageUrl();
  const editor = new Editor({ element: host, extensions: createEditorExtensions(() => 'default', { resolveAsset: async () => imageUrl }), content });
  editor.view.dom.style.whiteSpace = 'pre-wrap';
  const firstText = () => { let position = 0; editor.state.doc.descendants((node, pos) => { if (!position && node.isTextblock) position = pos + 1; }); return position; };
  await frames();
  return {
    kind: 'focused-tiptap',
    async activate() { editor.commands.focus(firstText()); await frames(); },
    insert(text) { const { state } = editor; editor.view.dispatch(state.tr.insertText(text)); },
    resize(width) { const node = editor.state.doc.firstChild!; editor.view.dispatch(closeHistory(editor.state.tr).setNodeMarkup(0, undefined, { ...node.attrs, width })); },
    move() {
      const { state } = editor; const first = state.doc.firstChild!; const second = state.doc.childCount > 1 ? state.doc.child(1) : null;
      if (second) editor.view.dispatch(closeHistory(state.tr).delete(0, first.nodeSize).insert(second.nodeSize, first));
    },
    undoText() { editor.commands.undo(); },
    undoLayout() { editor.commands.undo(); },
    canonical: () => editor.getJSON(),
    serialize: () => JSON.stringify(editor.getJSON()),
    async restore(serialized) { editor.commands.setContent(JSON.parse(serialized)); await frames(); },
    async destroy() { editor.destroy(); URL.revokeObjectURL(imageUrl); host.replaceChildren(); },
    element: () => editor.view.dom,
  };
}

async function grapesAdapter(host: HTMLElement, content: JSONContent): Promise<Adapter> {
  const imageUrl = fixtureImageUrl();
  const extensions = () => createEditorExtensions(() => 'default', { resolveAsset: async () => imageUrl });
  const schema = getSchema(extensions());
  const serializer = DOMSerializer.fromSchema(schema);
  const html = (doc: JSONContent) => {
    const container = document.createElement('div');
    container.append(serializer.serializeFragment(schema.nodeFromJSON(doc).content));
    return container.innerHTML;
  };
  const editors = new Map<Component, Editor>();
  const lastHtml = new WeakMap<Editor, string>();
  type HistoryEntry = { kind: 'text'; component: Component; before: DocumentNode; time: number } | { kind: 'layout'; undo: () => void };
  const history: HistoryEntry[] = [];
  let undoing = false;
  const remember = (entry: HistoryEntry) => { if (!undoing) { history.push(entry); if (history.length > 100) history.shift(); } };
  let active: Editor | undefined;
  let activeComponent: Component | undefined;
  let editor!: GrapesEditor;
  const deactivate = async () => {
    const view = activeComponent?.getView() as unknown as { disableEditing?: () => Promise<void> } | undefined;
    if (view?.disableEditing) await view.disableEditing();
    active = undefined; activeComponent = undefined;
  };
  const undo = () => {
    const entry = history.pop(); if (!entry) return;
    undoing = true;
    try {
      if (entry.kind === 'layout') entry.undo();
      else {
        const rte = editors.get(entry.component);
        if (rte && !rte.isDestroyed) {
          const transaction = rte.state.tr.replaceWith(0, rte.state.doc.content.size, entry.before.content).setMeta('addToHistory', false);
          transaction.setSelection(TextSelection.atStart(transaction.doc)); rte.view.dispatch(transaction);
        } else {
          const doc = entry.before.toJSON(); entry.component.set('noteDoc', doc); entry.component.set('content', html(doc));
        }
      }
    } finally { undoing = false; }
  };
  const flush = () => {
    for (const [component, rte] of editors) {
      if (rte.isDestroyed) continue;
      component.set('noteDoc', rte.getJSON());
      const value = rte.getHTML(); lastHtml.set(rte, value); component.set('content', value, { silent: true });
    }
  };
  const clearEditors = () => {
    for (const rte of editors.values()) { if (!rte.isDestroyed) lastHtml.set(rte, rte.getHTML()); rte.destroy(); }
    editors.clear(); active = undefined; activeComponent = undefined;
    history.length = 0;
  };
  const styleFor = (attrs: Record<string, unknown>) => ({
    width: `${attrs.width}px`, 'max-width': '100%', 'box-sizing': 'border-box',
    'margin-left': attrs.align === 'left' ? '0' : 'auto', 'margin-right': attrs.align === 'right' ? '0' : 'auto',
    'margin-top': '12px', 'margin-bottom': '12px', padding: '14px', border: '1px solid #cbd7d0',
    background: attrs.tone === 'accent' ? '#e7eee6' : attrs.tone === 'soft' ? '#f4f5f1' : '#ffffff',
  });
  editor = grapesjs.init({ container: host, height: '650px', width: 'auto', storageManager: false,
    telemetry: false, fromElement: false, noticeOnUnload: false, panels: { defaults: [] },
    assetManager: { upload: false }, canvas: { styles: [], scripts: [] },
    plugins: [g => {
      g.DomComponents.addType('noted-panel', { extend: 'text', model: {
        defaults: { tagName: 'section', droppable: false, draggable: true, editable: true, resizable: true,
          traits: [], noteAttrs: {}, noteDoc: { type: 'doc', content: [] } },
        init() { this.on('change:noteAttrs', () => { g.UndoManager.skip(() => this.setStyle(styleFor(this.get('noteAttrs')))); }); },
      } });
      g.setCustomRte({
        enable(element, existing) {
          const component = g.getSelected();
          if (!component) throw new Error('Select a panel before editing.');
          let rte = existing as Editor | undefined;
          if (!rte || rte.isDestroyed) {
            element.replaceChildren();
            rte = new Editor({ element, extensions: extensions(), content: component.get('noteDoc'),
              onTransaction: ({ transaction }) => {
                if (!transaction.docChanged || undoing) return;
                const previous = history.at(-1); const now = performance.now();
                if (previous?.kind === 'text' && previous.component === component && now - previous.time < 500) previous.time = now;
                else remember({ kind: 'text', component, before: transaction.before, time: now });
              },
              editorProps: { attributes: { 'aria-label': 'Note panel content' }, handleKeyDown: (_view, event) => {
                if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.shiftKey) { event.preventDefault(); undo(); return true; }
                return false;
              } } });
            editors.set(component, rte);
            rte.view.dom.style.whiteSpace = 'pre-wrap';
          }
          active = rte; activeComponent = component;
          rte.setEditable(true); rte.commands.focus('start');
          return rte;
        },
        disable(_element, value) {
          const rte = value as Editor | undefined;
          if (rte && !rte.isDestroyed) {
            const component = [...editors].find(([, candidate]) => candidate === rte)?.[0];
            if (component) { component.set('noteDoc', rte.getJSON()); component.set('content', rte.getHTML(), { silent: true }); }
            rte.setEditable(false); rte.commands.blur();
          }
        },
        getContent(_element, value) {
          const rte = value as Editor | undefined;
          return rte ? (rte.isDestroyed ? lastHtml.get(rte) ?? '' : rte.getHTML()) : '';
        },
      });
    }],
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('GrapesJS canvas did not load in 20 seconds.')), 20000);
    editor.onReady(() => { clearTimeout(timer); resolve(); });
  });
  const definitions = (content.content ?? []).map(node => node.type === 'localImage'
    ? { type: 'image', src: imageUrl, attributes: { alt: node.attrs?.alt }, noteKind: 'localImage', noteAttrs: node.attrs,
      style: { width: `${node.attrs?.width}px`, 'max-width': '100%' } }
    : { type: 'noted-panel', noteKind: 'notePanel', noteAttrs: node.attrs,
      noteDoc: { type: 'doc', content: node.content }, content: html({ type: 'doc', content: node.content }), style: styleFor(node.attrs ?? {}) });
  editor.setComponents(definitions);
  const body = editor.Canvas.getBody();
  body.style.font = '15px/1.5 system-ui, sans-serif'; body.style.margin = '20px';
  editor.UndoManager.clear();
  const canonical = (): JSONContent => {
    flush();
    return { type: 'doc', content: editor.getComponents().map((component: Component) => ({ type: component.get('noteKind'),
      attrs: component.get('noteAttrs'), ...(component.get('noteKind') === 'localImage' ? {} : { content: component.get('noteDoc').content }) })) };
  };
  await frames();
  return {
    kind: 'grapesjs-tiptap',
    async activate() {
      const component = editor.getComponents().find((component: Component) => component.get('type') === 'noted-panel');
      if (!component) throw new Error('No panel to activate.');
      editor.select(component);
      // Use GrapesJS's actual custom-RTE lifecycle, not a separate hidden editor.
      component.getEl()!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await frames();
      if (!active || activeComponent !== component) throw new Error('Custom Tiptap RTE was not activated.');
    },
    insert(text) {
      if (!active) throw new Error('Activate a text panel first.');
      active.view.dispatch(active.state.tr.insertText(text));
    },
    resize(width) {
      const component = editor.getComponents().at(0); const before = component.get('noteAttrs');
      remember({ kind: 'layout', undo: () => component.set('noteAttrs', before) }); component.set('noteAttrs', { ...before, width });
    },
    move() {
      const component = editor.getComponents().at(0);
      if (editor.getComponents().length > 1) {
        remember({ kind: 'layout', undo: () => { component.move(editor.getWrapper()!, { at: 0 }); } });
        component.move(editor.getWrapper()!, { at: 2 });
      }
    },
    undoText: undo,
    undoLayout: undo,
    canonical,
    serialize() { flush(); return JSON.stringify(editor.getProjectData()); },
    async restore(serialized) { await deactivate(); clearEditors(); editor.loadProjectData(JSON.parse(serialized)); await frames(); },
    async destroy() { await deactivate(); clearEditors(); editor.destroy(); URL.revokeObjectURL(imageUrl); host.replaceChildren(); },
    element() { return active?.view.dom ?? editor.Canvas.getBody(); },
  };
}

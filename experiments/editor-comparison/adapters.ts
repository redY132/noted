import { Editor, getSchema, type JSONContent } from '@tiptap/core';
import { DOMSerializer } from '@tiptap/pm/model';
import type { Node as DocumentNode } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import { closeHistory } from '@tiptap/pm/history';
import grapesjs, { type Editor as GrapesEditor, type Component } from 'grapesjs';
import { createEditorExtensions } from '../../src/editor-extensions';
import { fixtureImageUrl, fixtureGifUrl, imageId, gifId } from './fixtures';
import { attachComponentMotion, attachImagePlayback, registerImageSource, unregisterImageSource } from '../../src/component-motion';
import motionStyles from '../../src/component-motion.css?inline';

export type LayoutProperties = { width?: number; placement?: 'flow' | 'free'; x?: number; y?: number; z?: number; animation?: 'none' | 'fade' | 'float' | 'pulse' };
function assets() {
  const sources = new Map([[imageId, fixtureImageUrl()], [gifId, fixtureGifUrl()]]);
  for (const [id, url] of sources) registerImageSource(url, id === gifId ? 'image/gif' : 'image/png');
  return { resolve: (id: string) => sources.get(id) ?? sources.get(imageId)!, destroy() {
    for (const url of sources.values()) { unregisterImageSource(url); URL.revokeObjectURL(url); }
  } };
}

export type Candidate = 'focused-tiptap' | 'grapesjs-tiptap';
export interface Adapter {
  kind: Candidate;
  activate(): Promise<void>;
  insert(text: string): void;
  resize(width: number): void;
  properties(properties: LayoutProperties): void;
  reach(x: number, y: number): Promise<{ left: number; top: number; width: number; height: number }>;
  firstStyle(): { position: string; left: string; top: string; z: string; animation: string };
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
  const media = assets();
  const editor = new Editor({ element: host, extensions: createEditorExtensions(() => 'default', { resolveAsset: async id => media.resolve(id) }), content });
  editor.view.dom.style.whiteSpace = 'pre-wrap';
  const firstText = () => { let position = 0; editor.state.doc.descendants((node, pos) => { if (!position && node.isTextblock) position = pos + 1; }); return position; };
  const properties = (properties: LayoutProperties) => { const node = editor.state.doc.firstChild!; editor.view.dispatch(closeHistory(editor.state.tr).setNodeMarkup(0, undefined, { ...node.attrs, ...properties })); };
  await frames();
  return {
    kind: 'focused-tiptap',
    async activate() { editor.commands.focus(firstText()); await frames(); },
    insert(text) { const { state } = editor; editor.view.dispatch(state.tr.insertText(text)); },
    resize(width) { properties({ width }); },
    properties,
    async reach(x, y) { await frames(); host.scrollTo(x, y); await frames(); return {left:host.scrollLeft,top:host.scrollTop,width:host.scrollWidth,height:host.scrollHeight}; },
    firstStyle() { const el = editor.view.dom.querySelector<HTMLElement>('.note-component')!; const css = getComputedStyle(el); return {position:css.position,left:css.left,top:css.top,z:css.zIndex,animation:el.dataset.noteMotion ?? ''}; },
    move() {
      const { state } = editor; const first = state.doc.firstChild!; const second = state.doc.childCount > 1 ? state.doc.child(1) : null;
      if (second) editor.view.dispatch(closeHistory(state.tr).delete(0, first.nodeSize).insert(second.nodeSize, first));
    },
    undoText() { editor.commands.undo(); },
    undoLayout() { editor.commands.undo(); },
    canonical: () => editor.getJSON(),
    serialize: () => JSON.stringify(editor.getJSON()),
    async restore(serialized) { editor.commands.setContent(JSON.parse(serialized)); await frames(); },
    async destroy() { editor.destroy(); media.destroy(); host.replaceChildren(); },
    element: () => editor.view.dom,
  };
}

async function grapesAdapter(host: HTMLElement, content: JSONContent): Promise<Adapter> {
  const media = assets();
  const extensions = () => createEditorExtensions(() => 'default', { resolveAsset: async id => media.resolve(id) });
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
  const controllers = new Map<Component, { motion: ReturnType<typeof attachComponentMotion>; playback?: ReturnType<typeof attachImagePlayback> }>();
  let extentFrame = 0;
  const updateExtent = () => {
    if (!editor || extentFrame) return;
    extentFrame = requestAnimationFrame(() => {
      extentFrame = 0;
      const wrapper = editor.getWrapper()?.getEl(); if (!wrapper) return;
      let width = 900, height = 600;
      editor.getComponents().forEach((component: Component) => {
        const attrs = component.get('noteAttrs'); const el = component.getEl();
        if (attrs?.placement === 'free' && el) { width = Math.max(width, attrs.x + el.offsetWidth + 128); height = Math.max(height, attrs.y + el.offsetHeight + 128); }
      });
      wrapper.style.minWidth = `${width}px`; wrapper.style.minHeight = `${height}px`;
    });
  };
  const resizeObserver = new ResizeObserver(updateExtent);
  const clearControllers = () => { for (const item of controllers.values()) { item.motion.destroy(); item.playback?.destroy(); } controllers.clear(); resizeObserver.disconnect(); };
  const bind = (component: Component) => {
    const el = component.getEl(); if (!el || !component.get('noteKind')) return;
    const previous = controllers.get(component); previous?.motion.destroy(); previous?.playback?.destroy();
    const motion = attachComponentMotion(el, () => component.get('noteAttrs')?.animation ?? 'none');
    let playback: ReturnType<typeof attachImagePlayback> | undefined;
    if (component.get('noteKind') === 'localImage' && el.tagName === 'IMG') {
      (el as HTMLImageElement).loading = 'lazy';
      playback = attachImagePlayback(el as HTMLImageElement); playback.setSource(media.resolve(component.get('noteAttrs').assetId));
    }
    controllers.set(component, { motion, playback }); resizeObserver.observe(el); updateExtent();
  };
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
  const styleFor = (attrs: Record<string, unknown>, image = false) => ({
    width: `${attrs.width}px`, 'max-width': attrs.placement === 'free' ? 'none' : '100%', 'box-sizing': 'border-box',
    position: attrs.placement === 'free' ? 'absolute' : 'relative', left: attrs.placement === 'free' ? `${attrs.x}px` : 'auto',
    top: attrs.placement === 'free' ? `${attrs.y}px` : 'auto', 'z-index': String(attrs.z ?? 0),
    'margin-left': attrs.align === 'left' ? '0' : 'auto', 'margin-right': attrs.align === 'right' ? '0' : 'auto',
    'margin-top': attrs.placement === 'free' ? '0' : '12px', 'margin-bottom': attrs.placement === 'free' ? '0' : '12px', padding: image ? '0' : '14px', border: image ? '0' : '1px solid #cbd7d0',
    background: attrs.tone === 'accent' ? '#e7eee6' : attrs.tone === 'soft' ? '#f4f5f1' : '#ffffff',
  });
  editor = grapesjs.init({ container: host, height: '650px', width: 'auto', storageManager: false,
    telemetry: false, fromElement: false, noticeOnUnload: false, panels: { defaults: [] },
    assetManager: { upload: false }, canvas: { styles: [], scripts: [] },
    plugins: [g => {
      g.DomComponents.addType('noted-panel', { extend: 'text', model: {
        defaults: { tagName: 'section', droppable: false, draggable: true, editable: true, resizable: true,
          traits: [], noteAttrs: {}, noteDoc: { type: 'doc', content: [] } },
        init() { this.on('change:noteAttrs', () => { g.UndoManager.skip(() => this.setStyle(styleFor(this.get('noteAttrs')))); controllers.get(this)?.motion.refresh(); updateExtent(); }); },
      } });
      g.DomComponents.addType('noted-image', { extend: 'image', model: {
        init() { this.on('change:noteAttrs', () => { g.UndoManager.skip(() => this.setStyle(styleFor(this.get('noteAttrs'), true))); controllers.get(this)?.motion.refresh(); updateExtent(); }); },
      } });
      g.on('component:mount', bind);
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
    ? { type: 'noted-image', src: media.resolve(node.attrs?.assetId), attributes: { alt: node.attrs?.alt }, noteKind: 'localImage', noteAttrs: node.attrs,
      style: styleFor(node.attrs ?? {}, true) }
    : { type: 'noted-panel', noteKind: 'notePanel', noteAttrs: node.attrs,
      noteDoc: { type: 'doc', content: node.content }, content: html({ type: 'doc', content: node.content }), style: styleFor(node.attrs ?? {}) });
  editor.setComponents(definitions);
  const body = editor.Canvas.getBody();
  body.style.font = '15px/1.5 system-ui, sans-serif'; body.style.margin = '20px';
  editor.getWrapper()!.getEl()!.style.position = 'relative';
  const matchedStyle = editor.Canvas.getDocument()!.createElement('style');
  matchedStyle.textContent = 'p{margin:8px 0} .tiptap{white-space:pre-wrap}';
  editor.Canvas.getDocument()!.head.append(matchedStyle);
  // Reuse the exact preset styles in the iframe, rather than a separate animation implementation.
  const motionStyle = editor.Canvas.getDocument()!.createElement('style'); motionStyle.textContent = motionStyles; editor.Canvas.getDocument()!.head.append(motionStyle);
  editor.getComponents().forEach(bind); updateExtent();
  editor.UndoManager.clear();
  const canonical = (): JSONContent => {
    flush();
    return { type: 'doc', content: editor.getComponents().map((component: Component) => ({ type: component.get('noteKind'),
      attrs: component.get('noteAttrs'), ...(component.get('noteKind') === 'localImage' ? {} : { content: component.get('noteDoc').content }) })) };
  };
  await frames();
  const properties = (properties: LayoutProperties) => {
    const component = editor.getComponents().at(0); const before = component.get('noteAttrs');
    remember({ kind: 'layout', undo: () => component.set('noteAttrs', before) }); component.set('noteAttrs', { ...before, ...properties });
  };
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
    resize(width) { properties({ width }); },
    properties,
    async reach(x, y) { await frames(); const scroll = editor.Canvas.getDocument()!.scrollingElement!; scroll.scrollTo(x,y); await frames(); return {left:scroll.scrollLeft,top:scroll.scrollTop,width:scroll.scrollWidth,height:scroll.scrollHeight}; },
    firstStyle() { const el = editor.getComponents().at(0).getEl()!; const css = el.ownerDocument.defaultView!.getComputedStyle(el); return {position:css.position,left:css.left,top:css.top,z:css.zIndex,animation:el.dataset.noteMotion ?? ''}; },
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
    async restore(serialized) { await deactivate(); clearEditors(); clearControllers(); editor.loadProjectData(JSON.parse(serialized)); editor.getWrapper()!.getEl()!.style.position = 'relative'; editor.getComponents().forEach(bind); updateExtent(); await frames(); },
    async destroy() { await deactivate(); clearEditors(); clearControllers(); cancelAnimationFrame(extentFrame); editor.destroy(); media.destroy(); host.replaceChildren(); },
    element() { return active?.view.dom ?? editor.Canvas.getBody(); },
  };
}

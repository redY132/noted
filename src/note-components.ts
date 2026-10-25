import { Node as TiptapNode, type Editor, type JSONContent } from '@tiptap/core';
import type { Node as DocumentNode } from '@tiptap/pm/model';
import { AllSelection, NodeSelection, TextSelection } from '@tiptap/pm/state';
import { closeHistory } from '@tiptap/pm/history';

export const MIN_COMPONENT_WIDTH = 160;
export const MAX_COMPONENT_WIDTH = 1200;
export type ComponentOptions = { resolveAsset?: (assetId: string) => Promise<string> };
export type ComponentProperties = { width?: number; align?: 'left' | 'center' | 'right'; tone?: 'plain' | 'soft' | 'accent'; alt?: string };
const validWidth = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && value >= MIN_COMPONENT_WIDTH && value <= MAX_COMPONENT_WIDTH;
const layoutAttributes = (width: number) => ({
  width: { default: width, parseHTML: (element: HTMLElement) => { const n = Number(element.dataset.width); return validWidth(n) ? n : width; } },
  align: { default: 'left', parseHTML: (element: HTMLElement) => ['left', 'center', 'right'].includes(element.dataset.align ?? '') ? element.dataset.align : 'left' },
});
function applyLayout(element: HTMLElement, node: DocumentNode) {
  element.style.width = `${validWidth(node.attrs.width) ? node.attrs.width : 640}px`;
  element.dataset.align = node.attrs.align;
  element.dataset.tone = node.attrs.tone ?? 'plain';
}

/** All changes use the active editor's transaction/history, including programmatic callers. */
export function selectedComponent(editor: Editor): { node: DocumentNode; position: number } | null {
  const { selection } = editor.state;
  if (selection instanceof NodeSelection && ['notePanel', 'localImage'].includes(selection.node.type.name)) return { node: selection.node, position: selection.from };
  for (let depth = selection.$from.depth; depth > 0; depth--) {
    const node = selection.$from.node(depth);
    if (node.type.name === 'notePanel') return { node, position: selection.$from.before(depth) };
  }
  return null;
}
export function updateComponent(editor: Editor, properties: ComponentProperties): boolean {
  const selected = selectedComponent(editor);
  if (!selected || !editor.isEditable) return false;
  if (Object.keys(properties).some(key => !['width', 'align', 'tone', 'alt'].includes(key))) return false;
  if (properties.width !== undefined && !validWidth(properties.width)) return false;
  if (properties.align !== undefined && !['left', 'center', 'right'].includes(properties.align)) return false;
  if (properties.tone !== undefined && (selected.node.type.name !== 'notePanel' || !['plain', 'soft', 'accent'].includes(properties.tone))) return false;
  if (properties.alt !== undefined && (selected.node.type.name !== 'localImage' || typeof properties.alt !== 'string' || properties.alt.length > 2000)) return false;
  const changed = Object.fromEntries(Object.entries(properties).filter(([key, value]) => value !== undefined && selected.node.attrs[key] !== value));
  if (!Object.keys(changed).length) return false;
  editor.view.dispatch(closeHistory(editor.state.tr).setNodeMarkup(selected.position, undefined, { ...selected.node.attrs, ...changed }));
  return true;
}
export function moveComponent(editor: Editor, direction: -1 | 1): boolean {
  const selected = selectedComponent(editor);
  if (!selected || !editor.isEditable || ![-1, 1].includes(direction)) return false;
  const resolved = editor.state.doc.resolve(selected.position);
  const index = resolved.index();
  const adjacentIndex = index + direction;
  if (adjacentIndex < 0 || adjacentIndex >= resolved.parent.childCount) return false;
  const adjacent = resolved.parent.child(adjacentIndex);
  const from = direction < 0 ? selected.position - adjacent.nodeSize : selected.position;
  const to = direction < 0 ? selected.position + selected.node.nodeSize : selected.position + selected.node.nodeSize + adjacent.nodeSize;
  const tr = closeHistory(editor.state.tr).replaceWith(from, to, direction < 0 ? [selected.node, adjacent] : [adjacent, selected.node]);
  tr.setSelection(NodeSelection.create(tr.doc, direction < 0 ? from : from + adjacent.nodeSize));
  editor.view.dispatch(tr);
  return true;
}
export function canWrapInPanel(editor: Editor): boolean {
  if (!editor.isEditable || editor.isActive('notePanel')) return false;
  // Panels group top-level flow blocks. Do not introduce surprising nested layout inside tables/lists.
  const { selection, doc } = editor.state;
  if (!(selection instanceof AllSelection) && (selection.$from.depth !== 1 || selection.$to.depth !== 1)) return false;
  let containsPanel = false;
  doc.nodesBetween(selection.from, selection.to, node => { if (node.type.name === 'notePanel') containsPanel = true; return false; });
  return !containsPanel;
}
export function wrapInPanel(editor: Editor): boolean {
  if (!canWrapInPanel(editor)) return false;
  const wholeDocument = editor.state.selection instanceof AllSelection;
  editor.view.dispatch(closeHistory(editor.state.tr));
  const wrapped = editor.commands.wrapIn('notePanel');
  // AllSelection otherwise stays on the document root after wrapping, leaving
  // the newly created panel without a selected-component property inspector.
  if (wrapped && wholeDocument && editor.state.doc.firstChild?.type.name === 'notePanel') {
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 0)));
  }
  return wrapped;
}
export function unwrapPanel(editor: Editor): boolean {
  const selected = selectedComponent(editor);
  if (!selected || selected.node.type.name !== 'notePanel' || !editor.isEditable) return false;
  const tr = closeHistory(editor.state.tr).replaceWith(selected.position, selected.position + selected.node.nodeSize, selected.node.content);
  tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(selected.position + 1, tr.doc.content.size))));
  editor.view.dispatch(tr);
  return true;
}
export function insertLocalImage(editor: Editor, assetId: string, alt: string): boolean {
  if (!editor.isEditable) return false;
  const { selection } = editor.state;
  // Inserting media must never replace highlighted words or a selected component.
  const position = selection.to;
  editor.view.dispatch(closeHistory(editor.state.tr));
  return editor.commands.insertContentAt(position, { type: 'localImage', attrs: { assetId, alt: alt.slice(0, 2000), width: 480, align: 'left' } });
}
export function panelFixture(text: string, id: string, width = 640): JSONContent {
  return { type: 'notePanel', attrs: { id, width, align: 'left', tone: 'soft' }, content: [{ type: 'paragraph', attrs: { id: crypto.randomUUID() }, content: text ? [{ type: 'text', text }] : undefined }] };
}

function resizeHandle(editor: Editor, dom: HTMLElement, getPos: () => number | undefined, getNode: () => DocumentNode) {
  const handle = document.createElement('button');
  handle.type = 'button'; handle.className = 'component-resize'; handle.contentEditable = 'false';
  handle.setAttribute('aria-label', 'Resize component'); handle.title = 'Drag to resize, or use component width above';
  handle.textContent = '↔';
  let cleanup: (() => void) | undefined;
  handle.addEventListener('pointerdown', event => {
    if (!editor.isEditable || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    cleanup?.();
    const start = event.clientX; const initial = dom.getBoundingClientRect().width;
    let width = getNode().attrs.width;
    const move = (event: PointerEvent) => { width = Math.max(MIN_COMPONENT_WIDTH, Math.min(MAX_COMPONENT_WIDTH, Math.round(initial + event.clientX - start))); dom.style.width = `${width}px`; };
    const finish = (event: PointerEvent) => {
      cleanup?.();
      const position = getPos();
      if (event.type === 'pointerup' && !editor.isDestroyed && position !== undefined && editor.isEditable) {
        const node = editor.state.doc.nodeAt(position);
        if (node?.type === getNode().type) editor.view.dispatch(closeHistory(editor.state.tr).setNodeMarkup(position, undefined, { ...node.attrs, width }));
      } else applyLayout(dom, getNode());
    };
    cleanup = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', finish); window.removeEventListener('pointercancel', finish); cleanup = undefined; };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', finish); window.addEventListener('pointercancel', finish);
  });
  dom.append(handle);
  return () => cleanup?.();
}

export const NotePanel = TiptapNode.create({
  name: 'notePanel', group: 'block', content: 'block+', defining: true, draggable: true,
  addAttributes: () => ({ ...layoutAttributes(640), tone: { default: 'soft', parseHTML: element => ['plain', 'soft', 'accent'].includes(element.dataset.tone ?? '') ? element.dataset.tone : 'soft' } }),
  parseHTML: () => [{ tag: 'section[data-note-panel]' }],
  renderHTML: ({ node }) => ['section', { 'data-note-panel': '', 'data-width': node.attrs.width, 'data-align': node.attrs.align, 'data-tone': node.attrs.tone }, 0],
  addNodeView() {
    return ({ node, editor, getPos }) => {
      let current = node;
      const dom = document.createElement('section'); dom.className = 'note-component note-panel'; dom.dataset.notePanel = '';
      const contentDOM = document.createElement('div'); contentDOM.className = 'note-panel-content'; dom.append(contentDOM);
      applyLayout(dom, node);
      const destroy = resizeHandle(editor, dom, getPos, () => current);
      return { dom, contentDOM, update(next) { if (next.type !== current.type) return false; current = next; applyLayout(dom, next); return true; }, destroy,
        stopEvent: event => Boolean((event.target as HTMLElement).closest?.('.component-resize')),
        ignoreMutation: mutation => mutation.type !== 'selection' && !contentDOM.contains(mutation.target) };
    };
  },
});

export const LocalImage = TiptapNode.create<ComponentOptions>({
  name: 'localImage', group: 'block', atom: true, draggable: true,
  addOptions: () => ({}),
  addAttributes: () => ({ ...layoutAttributes(480), assetId: { default: '' }, alt: { default: '' } }),
  // Only our own inert local reference is imported; pasted remote <img> never fetches a URL.
  parseHTML: () => [{ tag: 'figure[data-local-asset]', getAttrs: element => ({ assetId: element.getAttribute('data-local-asset'), alt: element.getAttribute('data-alt') ?? '' }) }],
  renderHTML: ({ node }) => ['figure', { 'data-local-asset': node.attrs.assetId, 'data-alt': node.attrs.alt, 'data-width': node.attrs.width, 'data-align': node.attrs.align }, node.attrs.alt || 'Local image'],
  addNodeView() {
    return ({ node, editor, getPos }) => {
      let current = node; let disposed = false; let generation = 0; let visible = typeof IntersectionObserver === 'undefined';
      const dom = document.createElement('figure'); dom.className = 'note-component local-image'; dom.contentEditable = 'false';
      const image = document.createElement('img'); image.loading = 'lazy'; image.decoding = 'async'; image.draggable = false;
      const status = document.createElement('span'); status.className = 'image-status'; status.textContent = 'Loading local image…';
      dom.append(image, status);
      image.addEventListener('error', () => { if (!disposed) { status.hidden = false; status.textContent = 'Local image could not be displayed'; } });
      const render = (next: DocumentNode, load: boolean) => {
        applyLayout(dom, next); image.alt = next.attrs.alt;
        if (!load || !visible) return;
        const ticket = ++generation; image.removeAttribute('src'); status.hidden = false;
        const asset = this.options.resolveAsset?.(next.attrs.assetId);
        if (!asset) { status.textContent = 'Local image unavailable'; return; }
        void asset.then(url => { if (disposed || ticket !== generation) return; image.src = url; status.hidden = true; }, () => { if (!disposed && ticket === generation) status.textContent = 'Local image unavailable'; });
      };
      render(node, true);
      const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting) || disposed) return;
        visible = true; observer?.disconnect(); render(current, true);
      }, { rootMargin: '256px' });
      observer?.observe(dom);
      const cleanup = resizeHandle(editor, dom, getPos, () => current);
      return { dom, update(next) { if (next.type !== current.type) return false; const load = next.attrs.assetId !== current.attrs.assetId; current = next; render(next, load); return true; },
        destroy() { disposed = true; observer?.disconnect(); cleanup(); }, stopEvent: event => Boolean((event.target as HTMLElement).closest?.('.component-resize')),
        ignoreMutation: () => true };
    };
  },
});

import { Node as TiptapNode, type Editor, type JSONContent } from '@tiptap/core';
import type { Node as DocumentNode } from '@tiptap/pm/model';
import { AllSelection, NodeSelection, TextSelection } from '@tiptap/pm/state';
import { closeHistory } from '@tiptap/pm/history';
import { attachComponentMotion, attachImagePlayback } from './component-motion.ts';
import { normalizeNoteLink } from './note-links.ts';

export const MIN_COMPONENT_WIDTH = 160;
export const MAX_COMPONENT_WIDTH = 1200;
export const MAX_COMPONENT_POSITION = 100000;
export const MAX_COMPONENT_LAYER = 10000;
export type ComponentOptions = { resolveAsset?: (assetId: string) => Promise<string> };
export type ComponentProperties = { width?: number; align?: 'left' | 'center' | 'right'; tone?: 'plain' | 'soft' | 'accent'; alt?: string; placement?: 'flow' | 'free'; x?: number; y?: number; z?: number; animation?: 'none' | 'fade' | 'float' | 'pulse'; href?: string | null };
const validWidth = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && value >= MIN_COMPONENT_WIDTH && value <= MAX_COMPONENT_WIDTH;
const validCoordinate = (value: unknown, limit = MAX_COMPONENT_POSITION) => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= limit;
const coordinateAttribute = (key: string, limit = MAX_COMPONENT_POSITION) => ({ default: 0, parseHTML: (element: HTMLElement) => { const n = Number(element.dataset[key]); return validCoordinate(n, limit) ? n : 0; } });
const layoutAttributes = (width: number) => ({
  width: { default: width, parseHTML: (element: HTMLElement) => { const n = Number(element.dataset.width); return validWidth(n) ? n : width; } },
  align: { default: 'left', parseHTML: (element: HTMLElement) => ['left', 'center', 'right'].includes(element.dataset.align ?? '') ? element.dataset.align : 'left' },
  placement: { default: 'flow', parseHTML: (element: HTMLElement) => element.dataset.placement === 'free' ? 'free' : 'flow' },
  x: coordinateAttribute('x'), y: coordinateAttribute('y'), z: coordinateAttribute('z', MAX_COMPONENT_LAYER),
  animation: { default: 'none', parseHTML: (element: HTMLElement) => ['none', 'fade', 'float', 'pulse'].includes(element.dataset.animation ?? '') ? element.dataset.animation : 'none' },
});
const serializedLayout = (node: DocumentNode) => ({ 'data-width': node.attrs.width, 'data-align': node.attrs.align, 'data-placement': node.attrs.placement, 'data-x': node.attrs.x, 'data-y': node.attrs.y, 'data-z': node.attrs.z, 'data-animation': node.attrs.animation });
function applyLayout(element: HTMLElement, node: DocumentNode) {
  element.style.width = `${validWidth(node.attrs.width) ? node.attrs.width : 640}px`;
  element.dataset.align = node.attrs.align;
  element.dataset.tone = node.attrs.tone ?? 'plain';
  element.dataset.placement = node.attrs.placement;
  element.style.left = node.attrs.placement === 'free' ? `${node.attrs.x}px` : '';
  element.style.top = node.attrs.placement === 'free' ? `${node.attrs.y}px` : '';
  element.style.zIndex = node.attrs.placement === 'free' ? String(node.attrs.z) : '';
}

type ExtentEntry = { dom: HTMLElement; node: () => DocumentNode };
const extentManagers = new WeakMap<Editor, { entries: Set<ExtentEntry>; schedule: () => void }>();
/** Only free components participate; ordinary text edits never scan the document. */
function trackExtent(editor: Editor, dom: HTMLElement, node: () => DocumentNode) {
  let manager = extentManagers.get(editor);
  if (!manager) {
    const entries = new Set<ExtentEntry>(); let queued = false;
    manager = { entries, schedule: () => {
      if (queued) return; queued = true;
      queueMicrotask(() => {
        queued = false; if (editor.isDestroyed) return;
        let width = 0, height = 0;
        for (const entry of entries) {
          const value = entry.node();
          if (value.attrs.placement !== 'free') continue;
          const previewX = Number.parseFloat(entry.dom.style.left), previewY = Number.parseFloat(entry.dom.style.top);
          const x = Number.isFinite(previewX) ? previewX : value.attrs.x;
          const y = Number.isFinite(previewY) ? previewY : value.attrs.y;
          width = Math.max(width, x + (Number.parseFloat(entry.dom.style.width) || value.attrs.width) + 80);
          height = Math.max(height, y + Math.max(entry.dom.offsetHeight, 80) + 160);
        }
        editor.view.dom.style.setProperty('--free-width', `${width}px`);
        editor.view.dom.style.setProperty('--free-height', `${height}px`);
        const flowWidth = editor.view.dom.parentElement?.clientWidth;
        if (flowWidth) editor.view.dom.style.setProperty('--flow-width', `${flowWidth}px`);
        editor.view.dom.classList.toggle('has-free-components', width > 0);
      });
    } };
    extentManagers.set(editor, manager);
  }
  const entry = { dom, node }; manager.entries.add(entry);
  const schedule = manager.schedule;
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
  observer?.observe(dom); schedule();
  return { update: schedule, destroy() { observer?.disconnect(); manager!.entries.delete(entry); schedule(); } };
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
  if (Object.keys(properties).some(key => !['width', 'align', 'tone', 'alt', 'placement', 'x', 'y', 'z', 'animation', 'href'].includes(key))) return false;
  if (properties.width !== undefined && !validWidth(properties.width)) return false;
  if (properties.align !== undefined && !['left', 'center', 'right'].includes(properties.align)) return false;
  if (properties.tone !== undefined && (selected.node.type.name !== 'notePanel' || !['plain', 'soft', 'accent'].includes(properties.tone))) return false;
  if (properties.alt !== undefined && (selected.node.type.name !== 'localImage' || typeof properties.alt !== 'string' || properties.alt.length > 2000)) return false;
  if (properties.placement !== undefined && !['flow', 'free'].includes(properties.placement)) return false;
  if (properties.x !== undefined && !validCoordinate(properties.x)) return false;
  if (properties.y !== undefined && !validCoordinate(properties.y)) return false;
  if (properties.z !== undefined && !validCoordinate(properties.z, MAX_COMPONENT_LAYER)) return false;
  if (properties.animation !== undefined && !['none', 'fade', 'float', 'pulse'].includes(properties.animation)) return false;
  if (properties.href !== undefined && (selected.node.type.name !== 'localImage' || (properties.href !== null && normalizeNoteLink(properties.href) === null))) return false;
  const normalized = properties.href === undefined ? properties : { ...properties, href: normalizeNoteLink(properties.href) };
  const changed = Object.fromEntries(Object.entries(normalized).filter(([key, value]) => value !== undefined && selected.node.attrs[key] !== value));
  if (!Object.keys(changed).length) return false;
  if (changed.placement === 'free' && selected.node.attrs.placement !== 'free') {
    const element = editor.view.nodeDOM(selected.position) as HTMLElement | null;
    const rect = element?.getBoundingClientRect(), root = editor.view.dom.getBoundingClientRect();
    if (properties.x === undefined) changed.x = Math.max(0, Math.min(MAX_COMPONENT_POSITION, Math.round((rect?.left ?? root.left) - root.left)));
    if (properties.y === undefined) changed.y = Math.max(0, Math.min(MAX_COMPONENT_POSITION, Math.round((rect?.top ?? root.top) - root.top)));
  }
  const attrs = { ...selected.node.attrs, ...changed };
  const resolved = editor.state.doc.resolve(selected.position);
  const tr = closeHistory(editor.state.tr);
  if (attrs.placement === 'free' && resolved.depth > 0) {
    // Free items use document coordinates. Extracting an image from a panel
    // never duplicates or changes the panel's remaining text.
    const afterParent = resolved.after(1);
    tr.delete(selected.position, selected.position + selected.node.nodeSize);
    const destination = tr.mapping.map(afterParent, -1);
    tr.insert(destination, selected.node.type.create(attrs, selected.node.content, selected.node.marks));
    tr.setSelection(NodeSelection.create(tr.doc, destination));
  } else tr.setNodeMarkup(selected.position, undefined, attrs);
  editor.view.dispatch(tr);
  return true;
}
export function changeComponentLayer(editor: Editor, direction: -1 | 1): boolean {
  const selected = selectedComponent(editor);
  if (!selected || selected.node.attrs.placement !== 'free') return false;
  return updateComponent(editor, { z: Math.max(0, Math.min(MAX_COMPONENT_LAYER, selected.node.attrs.z + direction)) });
}
/** Adds an independent editable panel even when the current note has no flow text. */
export function insertPanel(editor: Editor): boolean {
  if (!editor.isEditable) return false;
  const selected = selectedComponent(editor);
  const resolved = editor.state.selection.$to;
  const position = resolved.depth ? resolved.after(1) : editor.state.selection.to;
  const free = selected?.node.attrs.placement === 'free';
  const attrs = free ? { placement: 'free', x: Math.min(MAX_COMPONENT_POSITION, selected.node.attrs.x + 40), y: Math.min(MAX_COMPONENT_POSITION, selected.node.attrs.y + 40), z: Math.min(MAX_COMPONENT_LAYER, selected.node.attrs.z + 1) } : {};
  const panel = editor.state.schema.nodes.notePanel.createAndFill(attrs);
  if (!panel) return false;
  const tr = closeHistory(editor.state.tr).insert(position, panel);
  tr.setSelection(TextSelection.near(tr.doc.resolve(position + 2)));
  editor.view.dispatch(tr); return true;
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

function resizeHandle(editor: Editor, dom: HTMLElement, getPos: () => number | undefined, getNode: () => DocumentNode, changed: () => void) {
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
    const move = (event: PointerEvent) => { width = Math.max(MIN_COMPONENT_WIDTH, Math.min(MAX_COMPONENT_WIDTH, Math.round(initial + event.clientX - start))); dom.style.width = `${width}px`; changed(); };
    const finish = (event: PointerEvent) => {
      cleanup?.();
      const position = getPos();
      if (event.type === 'pointerup' && !editor.isDestroyed && position !== undefined && editor.isEditable) {
        const node = editor.state.doc.nodeAt(position);
        if (node?.type === getNode().type) editor.view.dispatch(closeHistory(editor.state.tr).setNodeMarkup(position, undefined, { ...node.attrs, width }));
      } else { applyLayout(dom, getNode()); changed(); }
    };
    cleanup = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', finish); window.removeEventListener('pointercancel', finish); cleanup = undefined; };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', finish); window.addEventListener('pointercancel', finish);
  });
  dom.append(handle);
  return () => cleanup?.();
}

function moveHandle(editor: Editor, dom: HTMLElement, getPos: () => number | undefined, getNode: () => DocumentNode, changed: () => void) {
  const handle = document.createElement('button');
  handle.type = 'button'; handle.className = 'component-move'; handle.contentEditable = 'false'; handle.textContent = '✥';
  handle.setAttribute('aria-label', 'Move freely'); handle.title = 'Drag to position; arrow keys move 10 px (Alt: 1 px)';
  let cleanup: (() => void) | undefined;
  handle.addEventListener('keydown', event => {
    const directions: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (!directions[event.key] || !editor.isEditable || getNode().attrs.placement !== 'free') return;
    const position = getPos(); if (position === undefined) return;
    event.preventDefault(); event.stopPropagation();
    editor.commands.setNodeSelection(position);
    const [dx, dy] = directions[event.key]; const step = event.altKey ? 1 : 10;
    updateComponent(editor, { x: Math.max(0, Math.min(MAX_COMPONENT_POSITION, getNode().attrs.x + dx * step)), y: Math.max(0, Math.min(MAX_COMPONENT_POSITION, getNode().attrs.y + dy * step)) });
  });
  handle.addEventListener('pointerdown', event => {
    if (!editor.isEditable || event.button !== 0 || getNode().attrs.placement !== 'free') return;
    event.preventDefault(); event.stopPropagation(); cleanup?.();
    const position = getPos(); if (position === undefined) return;
    editor.commands.setNodeSelection(position);
    const scroll = dom.closest<HTMLElement>('.document-scroll');
    const initialScroll = { x: scroll?.scrollLeft ?? 0, y: scroll?.scrollTop ?? 0 };
    const initial = { x: getNode().attrs.x as number, y: getNode().attrs.y as number, px: event.clientX, py: event.clientY };
    let x = initial.x, y = initial.y;
    const move = (event: PointerEvent) => {
      if (scroll) {
        const bounds = scroll.getBoundingClientRect();
        if (event.clientY > bounds.bottom - 24) scroll.scrollTop += 16;
        if (event.clientY < bounds.top + 24) scroll.scrollTop -= 16;
        if (event.clientX > bounds.right - 24) scroll.scrollLeft += 16;
        if (event.clientX < bounds.left + 24) scroll.scrollLeft -= 16;
      }
      x = Math.max(0, Math.min(MAX_COMPONENT_POSITION, Math.round(initial.x + event.clientX - initial.px + (scroll?.scrollLeft ?? 0) - initialScroll.x)));
      y = Math.max(0, Math.min(MAX_COMPONENT_POSITION, Math.round(initial.y + event.clientY - initial.py + (scroll?.scrollTop ?? 0) - initialScroll.y)));
      dom.style.left = `${x}px`; dom.style.top = `${y}px`; changed();
    };
    const finish = (event: PointerEvent) => {
      cleanup?.();
      const pos = getPos();
      if (event.type === 'pointerup' && !editor.isDestroyed && editor.isEditable && pos !== undefined) {
        const node = editor.state.doc.nodeAt(pos);
        if (node?.type === getNode().type) editor.view.dispatch(closeHistory(editor.state.tr).setNodeMarkup(pos, undefined, { ...node.attrs, x, y }));
      } else { applyLayout(dom, getNode()); changed(); }
    };
    cleanup = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', finish); window.removeEventListener('pointercancel', finish); cleanup = undefined; };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', finish); window.addEventListener('pointercancel', finish);
  });
  dom.append(handle); return () => cleanup?.();
}

export const NotePanel = TiptapNode.create({
  name: 'notePanel', group: 'block', content: 'block+', defining: true, draggable: true,
  addAttributes: () => ({ ...layoutAttributes(640), tone: { default: 'soft', parseHTML: element => ['plain', 'soft', 'accent'].includes(element.dataset.tone ?? '') ? element.dataset.tone : 'soft' } }),
  parseHTML: () => [{ tag: 'section[data-note-panel]' }],
  renderHTML: ({ node }) => ['section', { 'data-note-panel': '', ...serializedLayout(node), 'data-tone': node.attrs.tone }, 0],
  addNodeView() {
    return ({ node, editor, getPos }) => {
      let current = node;
      const dom = document.createElement('section'); dom.className = 'note-component note-panel'; dom.dataset.notePanel = '';
      const contentDOM = document.createElement('div'); contentDOM.className = 'note-panel-content'; dom.append(contentDOM);
      applyLayout(dom, node);
      const extent = trackExtent(editor, dom, () => current);
      const motion = attachComponentMotion(dom, () => current.attrs.animation);
      const destroyResize = resizeHandle(editor, dom, getPos, () => current, extent.update);
      const destroyMove = moveHandle(editor, dom, getPos, () => current, extent.update);
      return { dom, contentDOM, update(next) { if (next.type !== current.type) return false; const layoutChanged = next.attrs !== current.attrs; current = next; if (layoutChanged) { applyLayout(dom, next); extent.update(); motion.refresh(); } return true; },
        destroy() { destroyResize(); destroyMove(); extent.destroy(); motion.destroy(); },
        stopEvent: event => Boolean((event.target as HTMLElement).closest?.('.component-resize,.component-move')),
        ignoreMutation: mutation => mutation.type !== 'selection' && !contentDOM.contains(mutation.target) };
    };
  },
});

export const LocalImage = TiptapNode.create<ComponentOptions>({
  name: 'localImage', group: 'block', atom: true, draggable: true,
  addOptions: () => ({}),
  addAttributes: () => ({ ...layoutAttributes(480), assetId: { default: '' }, alt: { default: '' }, href: { default: null, parseHTML: element => normalizeNoteLink(element.getAttribute('data-href')) } }),
  // Only our own inert local reference is imported; pasted remote <img> never fetches a URL.
  parseHTML: () => [{ tag: 'figure[data-local-asset]', getAttrs: element => ({ assetId: element.getAttribute('data-local-asset'), alt: element.getAttribute('data-alt') ?? '' }) }],
  renderHTML: ({ node }) => ['figure', { 'data-local-asset': node.attrs.assetId, 'data-alt': node.attrs.alt, 'data-href': node.attrs.href, ...serializedLayout(node) }, node.attrs.alt || 'Local image'],
  addNodeView() {
    return ({ node, editor, getPos }) => {
      let current = node; let disposed = false; let generation = 0; let visible = typeof IntersectionObserver === 'undefined';
      const dom = document.createElement('figure'); dom.className = 'note-component local-image'; dom.contentEditable = 'false';
      const image = document.createElement('img'); image.loading = 'lazy'; image.decoding = 'async'; image.draggable = false;
      const link = document.createElement('a'); link.className = 'image-link'; link.append(image);
      const status = document.createElement('span'); status.className = 'image-status'; status.textContent = 'Loading local image…';
      dom.append(link, status);
      const playback = attachImagePlayback(image);
      image.addEventListener('error', () => { if (!disposed) { status.hidden = false; status.textContent = 'Local image could not be displayed'; } });
      const render = (next: DocumentNode, load: boolean) => {
        applyLayout(dom, next); image.alt = next.attrs.alt;
        const href = normalizeNoteLink(next.attrs.href);
        if (href) { link.href = href; link.title = 'Ctrl+click to follow image link'; } else { link.removeAttribute('href'); link.removeAttribute('title'); }
        if (!load || !visible) return;
        const ticket = ++generation; image.removeAttribute('src'); status.hidden = false;
        const asset = this.options.resolveAsset?.(next.attrs.assetId);
        if (!asset) { status.textContent = 'Local image unavailable'; return; }
        void asset.then(url => { if (disposed || ticket !== generation) return; playback.setSource(url); status.hidden = true; }, () => { if (!disposed && ticket === generation) status.textContent = 'Local image unavailable'; });
      };
      render(node, true);
      const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting) || disposed) return;
        visible = true; observer?.disconnect(); render(current, true);
      }, { rootMargin: '256px' });
      observer?.observe(dom);
      const extent = trackExtent(editor, dom, () => current);
      const motion = attachComponentMotion(dom, () => current.attrs.animation);
      const cleanup = resizeHandle(editor, dom, getPos, () => current, extent.update);
      const cleanupMove = moveHandle(editor, dom, getPos, () => current, extent.update);
      return { dom, update(next) { if (next.type !== current.type) return false; const load = next.attrs.assetId !== current.attrs.assetId; current = next; render(next, load); extent.update(); motion.refresh(); return true; },
        destroy() { disposed = true; observer?.disconnect(); cleanup(); cleanupMove(); extent.destroy(); motion.destroy(); playback.destroy(); }, stopEvent: event => Boolean((event.target as HTMLElement).closest?.('.component-resize,.component-move')),
        ignoreMutation: () => true };
    };
  },
});

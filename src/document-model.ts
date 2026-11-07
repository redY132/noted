import type { JSONContent } from '@tiptap/core';

/** Public, JSON-only wire format. The editor projection is an adapter, not the document API. */
export interface VersionReference { id: string; version: number }
export type LayoutKind = 'free' | 'column' | 'row' | 'grid' | 'item';
export interface PresentationStyle {
  width?: number; align?: 'left' | 'center' | 'right'; tone?: 'plain' | 'soft' | 'accent';
  placement?: 'flow' | 'free'; x?: number; y?: number; z?: number;
  animation?: 'none' | 'fade' | 'float' | 'pulse'; padding?: number; gap?: number; gridColumns?: number;
}
export type ContentObject =
  | { id: string; kind: 'richText'; content: JSONContent }
  | { id: string; kind: 'image'; assetId: string; alt: string; href?: string | null }
  | { id: string; kind: 'component'; definition: VersionReference; props: Record<string, unknown>; state: Record<string, unknown>; fallback: string };
export interface LayoutNode { id: string; kind: LayoutKind; contentId?: string; children?: LayoutNode[]; style?: PresentationStyle }
export interface NotedDocumentV2 {
  version: 2; objects: Record<string, ContentObject>; readingOrder: string[]; layout: LayoutNode;
  styles: Record<string, PresentationStyle>; schemaRef?: VersionReference;
  schemaPolicy?: { mode: 'suggest' | 'automatic'; enabledRules: string[] };
}
export type DocumentPermission = 'formatting' | 'arrangement' | 'reorganization' | 'content' | 'componentState';
export type DocumentOperation =
  | { type: 'format'; id: string; content: JSONContent }
  | { type: 'style'; id: string; properties: PresentationStyle }
  | { type: 'arrange'; layout: LayoutNode }
  | { type: 'reorder'; readingOrder: string[] }
  | { type: 'edit'; id: string; object: ContentObject }
  | { type: 'state'; id: string; state: Record<string, unknown> }
  | { type: 'insert'; object: ContentObject; parent: string; index: number; readingIndex: number }
  | { type: 'remove'; id: string };
const styleNames = new Set(['width', 'align', 'tone', 'placement', 'x', 'y', 'z', 'animation', 'padding', 'gap', 'gridColumns']);
const idOK = (id: unknown): id is string => typeof id === 'string' && id.length > 0 && id.length <= 200 && !['__proto__', 'prototype', 'constructor'].includes(id);
const integer = (value: unknown, min: number, max: number) => typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const only = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).every(key => keys.includes(key));
export function validatePresentation(style: PresentationStyle): void {
  if (!style || typeof style !== 'object' || Array.isArray(style)) throw new Error('Invalid presentation properties.');
  for (const [name, value] of Object.entries(style)) {
    if (!styleNames.has(name)) throw new Error(`Unregistered presentation property: ${name}`);
    const options: Record<string, unknown[]> = { align: ['left', 'center', 'right'], tone: ['plain', 'soft', 'accent'], placement: ['flow', 'free'], animation: ['none', 'fade', 'float', 'pulse'] };
    if (options[name] ? !options[name].includes(value) : !integer(value, name === 'width' ? 160 : name === 'gridColumns' ? 1 : 0, name === 'width' ? 1200 : name === 'z' ? 10000 : name === 'padding' || name === 'gap' ? 256 : name === 'gridColumns' ? 12 : 100000)) throw new Error(`Invalid ${name}.`);
  }
}
/** Stable across runs and platforms, including notes without block IDs. Not a security hash. */
export function deterministicContentId(noteId: string, path: string): string {
  let a = 2166136261, b = 0x9e3779b9;
  for (const character of `${noteId}:${path}`) { const c = character.charCodeAt(0); a = Math.imul(a ^ c, 16777619); b = Math.imul(b ^ c, 2246822519); }
  return `legacy-${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}`;
}
export function withStableIds(content: JSONContent, noteId: string): JSONContent {
  const result = structuredClone(content), used = new Set<string>();
  const walk = (node: JSONContent, path: string) => {
    if (!['doc', 'text', 'hardBreak'].includes(node.type ?? '')) {
      let id = node.attrs?.id;
      if (!idOK(id)) id = deterministicContentId(noteId, path);
      if (used.has(id)) throw new Error(`Duplicate content identifier: ${id}`);
      used.add(id); node.attrs = { ...node.attrs, id };
    }
    node.content?.forEach((child, index) => walk(child, `${path}.${index}`));
  };
  walk(result, '0'); return result;
}
function presentation(attrs: Record<string, unknown> = {}): PresentationStyle {
  return Object.fromEntries(Object.entries(attrs).filter(([name, value]) => styleNames.has(name) && value != null)) as PresentationStyle;
}
/** Adds new objects beside their logical predecessor without letting arrangement reorder authored text. */
export function reconcileReadingOrder(previous: string[], visual: string[]): string[] {
  const present = new Set(visual), order = previous.filter(id => present.has(id));
  const known = new Set(order);
  if (!order.length && present.size === visual.length) return [...visual];
  if (known.size === present.size) return order;
  type Link = { id: string; next: Link | null };
  const first = new Map<string, Link>(); let head: Link | null = null, tail: Link | null = null;
  for (const id of order) {
    const link: Link = { id, next: null }; if (tail) tail.next = link; else head = link; tail = link;
    // Preserve duplicate old IDs so the document validator can still reject them.
    if (!first.has(id)) first.set(id, link);
  }
  let preceding: Link | null = null;
  for (const id of visual) {
    const existing = first.get(id);
    if (existing) { preceding = existing; continue; }
    // Every earlier visual ID is already known. Insert after the immediately
    // preceding one's first logical occurrence, exactly as the array version did.
    const link: Link = { id, next: preceding ? preceding.next : head };
    if (preceding) preceding.next = link; else head = link;
    first.set(id, link); preceding = link;
  }
  const result: string[] = []; for (let link = head; link; link = link.next) result.push(link.id);
  return result;
}
export function documentFromEditor(input: JSONContent, noteId: string, previous?: NotedDocumentV2): NotedDocumentV2 {
  const content = withStableIds(input, noteId), objects: Record<string, ContentObject> = Object.create(null), visual: string[] = [];
  const convert = (node: JSONContent): LayoutNode => {
    const id = node.attrs!.id as string, style = presentation(node.attrs);
    if (node.type === 'notePanel') return { id, kind: (node.attrs?.layoutKind as LayoutKind) || 'column', style, children: (node.content ?? []).map(convert) };
    visual.push(id);
    if (node.type === 'localImage') objects[id] = { id, kind: 'image', assetId: node.attrs!.assetId, alt: node.attrs!.alt ?? '', href: node.attrs!.href ?? null };
    else if (node.type === 'interactiveComponent') objects[id] = { id, kind: 'component', definition: { id: node.attrs!.definitionId, version: node.attrs!.definitionVersion }, props: node.attrs!.properties ?? {}, state: node.attrs!.state ?? {}, fallback: node.attrs!.fallback ?? '' };
    else objects[id] = { id, kind: 'richText', content: node };
    return { id: `layout-${id}`, kind: 'item', contentId: id, ...(Object.keys(style).length ? { style } : {}) };
  };
  const layout: LayoutNode = { id: 'root', kind: 'free', children: (content.content ?? []).map(convert) };
  const rootOrder = content.attrs?.readingOrder;
  const readingOrder = reconcileReadingOrder(Array.isArray(rootOrder) && rootOrder.length ? rootOrder : previous?.readingOrder ?? [], visual);
  const schemaRef = Object.hasOwn(content.attrs??{},'schemaReference') ? content.attrs?.schemaReference : previous?.schemaRef;
  const schemaPolicy = Object.hasOwn(content.attrs??{},'schemaPolicy') ? content.attrs?.schemaPolicy : previous?.schemaPolicy;
  const result: NotedDocumentV2 = { version: 2, objects, readingOrder, layout, styles: {}, ...(schemaRef ? { schemaRef } : {}), ...(schemaPolicy ? { schemaPolicy } : {}) };
  validateDocument(result); return result;
}
export function documentToEditor(document: NotedDocumentV2): JSONContent {
  validateDocument(document);
  const convert = (layout: LayoutNode): JSONContent => {
    if (layout.kind !== 'item') return { type: 'notePanel', attrs: { id: layout.id, layoutKind: layout.kind, ...layout.style }, content: layout.children!.map(convert) };
    const object = document.objects[layout.contentId!], attrs = { id: object.id, ...layout.style, ...document.styles[object.id] };
    switch (object.kind) {
      case 'richText': return { ...structuredClone(object.content), attrs: { ...object.content.attrs, ...attrs } };
      case 'image': return { type: 'localImage', attrs: { ...attrs, assetId: object.assetId, alt: object.alt, href: object.href ?? null } };
      case 'component': return { type: 'interactiveComponent', attrs: { ...attrs, definitionId: object.definition.id, definitionVersion: object.definition.version, properties: structuredClone(object.props), state: structuredClone(object.state), fallback: object.fallback } };
    }
  };
  return { type: 'doc', attrs: { readingOrder: [...document.readingOrder], ...(document.schemaRef ? { schemaReference: document.schemaRef } : {}), ...(document.schemaPolicy ? { schemaPolicy: document.schemaPolicy } : {}) }, content: document.layout.children!.map(convert) };
}
export function validateDocument(document: NotedDocumentV2): void {
  if (!record(document) || !only(document, ['version', 'objects', 'readingOrder', 'layout', 'styles', 'schemaRef', 'schemaPolicy']) || document.version !== 2 || !record(document.objects) || !Array.isArray(document.readingOrder) || !record(document.styles)) throw new Error('Invalid document version or objects.');
  if (document.schemaRef && (!record(document.schemaRef) || !only(document.schemaRef, ['id', 'version']) || !idOK(document.schemaRef.id) || !integer(document.schemaRef.version, 1, 1000000))) throw new Error('Invalid schema version reference.');
  if (document.schemaPolicy && (!record(document.schemaPolicy) || !only(document.schemaPolicy, ['mode', 'enabledRules']) || !['suggest', 'automatic'].includes(document.schemaPolicy.mode) || !Array.isArray(document.schemaPolicy.enabledRules) || new Set(document.schemaPolicy.enabledRules).size !== document.schemaPolicy.enabledRules.length || document.schemaPolicy.enabledRules.some(key => !['fontFamily', 'fontSize', 'lineHeight', 'color', 'spacing', 'indent'].includes(key)))) throw new Error('Invalid schema policy.');
  const ids = Object.keys(document.objects);
  if (ids.length > 100000 || ids.some(id => !idOK(id) || document.objects[id].id !== id)) throw new Error('Invalid content identifiers.');
  const order = new Set(document.readingOrder);
  if (order.size !== ids.length || order.size !== document.readingOrder.length || ids.some(id => !order.has(id))) throw new Error('Reading order must include every object exactly once.');
  const refs = new Set<string>(), layouts = new Set<string>(); let count = 0;
  const walk = (node: LayoutNode, depth: number) => {
    if (!record(node) || !only(node, ['id', 'kind', 'contentId', 'children', 'style']) || !idOK(node.id) || layouts.has(node.id) || ++count > 200000 || depth > 48) throw new Error('Invalid, duplicate or excessive layout containers.');
    layouts.add(node.id); if (node.style) validatePresentation(node.style);
    if (node.kind === 'item') {
      if (!node.contentId || !order.has(node.contentId) || refs.has(node.contentId) || node.children?.length) throw new Error('Each layout reference must point to one distinct existing object.');
      refs.add(node.contentId);
    } else {
      if (!['free', 'column', 'row', 'grid'].includes(node.kind) || node.contentId || !Array.isArray(node.children) || (node.id !== 'root' && !node.children.length)) throw new Error('Invalid layout container.');
      node.children.forEach(child => walk(child, depth + 1));
    }
  };
  if (document.layout.id !== 'root' || document.layout.kind !== 'free') throw new Error('A document needs a free-placement root.');
  walk(document.layout, 0);
  if (refs.size !== order.size) throw new Error('Every content object must be reachable exactly once.');
  for (const [id, style] of Object.entries(document.styles)) { if (!order.has(id)) throw new Error('Style refers to missing content.'); validatePresentation(style); }
  for (const object of Object.values(document.objects)) {
    if (!record(object)) throw new Error('Invalid content object.');
    if (object.kind === 'richText') { if (!only(object, ['id', 'kind', 'content']) || !object.content?.type || ['doc', 'notePanel', 'localImage', 'interactiveComponent', 'text'].includes(object.content.type)) throw new Error('Invalid rich-text object.'); }
    else if (object.kind === 'image') { if (!only(object, ['id', 'kind', 'assetId', 'alt', 'href']) || typeof object.assetId !== 'string' || typeof object.alt !== 'string') throw new Error('Invalid local image.'); }
    else if (object.kind === 'component') { if (!only(object, ['id', 'kind', 'definition', 'props', 'state', 'fallback']) || !record(object.definition) || !only(object.definition, ['id', 'version']) || !idOK(object.definition.id) || !integer(object.definition.version, 1, 1000000) || typeof object.fallback !== 'string' || object.fallback.length > 20000 || !record(object.props) || !record(object.state) || JSON.stringify([object.props, object.state]).length > 131072) throw new Error('Invalid component data.'); }
    else throw new Error('Unsupported content object.');
  }
}
function authored(node: JSONContent): unknown {
  // Only registered text-presentation attributes may change under formatting.
  // In particular, nested components and media retain their code, state,
  // references, geometry and fallback; a rich-text wrapper is not a scope escape.
  const textBlock = node.type === 'paragraph' || node.type === 'heading';
  const protectedAttrs = Object.fromEntries(Object.entries(node.attrs ?? {}).filter(([key]) => !textBlock || !['level', 'indent', 'textAlign', 'schemaStyle', 'schemaRef'].includes(key)));
  return [textBlock ? 'textBlock' : node.type, node.type === 'text' ? node.text : null, protectedAttrs, node.marks?.filter(mark => mark.type === 'link') ?? [], (node.content ?? []).map(authored)];
}
function componentSnapshots(object: ContentObject): Map<string, { definition: string; state: string }> {
  const snapshots = new Map<string, { definition: string; state: string }>();
  if (object.kind === 'component') snapshots.set(object.id, { definition: JSON.stringify(object.definition), state: JSON.stringify(object.state) });
  const visit = (node: JSONContent, path: string) => {
    if (node.type === 'interactiveComponent') snapshots.set(node.attrs?.id ?? path, { definition: JSON.stringify({ id: node.attrs?.definitionId, version: node.attrs?.definitionVersion }), state: JSON.stringify(node.attrs?.state) });
    node.content?.forEach((child, index) => visit(child, `${path}.${index}`));
  };
  if (object.kind === 'richText') visit(object.content, '0');
  return snapshots;
}
/** Conservative estimates; rendered native acceptance still requires geometry checks. */
export function inspectArrangement(document: NotedDocumentV2): string[] {
  const warnings: string[] = [], rects: {x:number;y:number;width:number;height:number;group:string;id:string}[] = [];
  const visit = (node: LayoutNode, x = 0, y = 0, group = 'root') => {
    const style = { ...node.style, ...(node.contentId ? document.styles[node.contentId] : {}) };
    const free = style.placement === 'free', nx = x + (free ? style.x ?? 0 : 0), ny = y + (free ? style.y ?? 0 : 0);
    const count = node.kind === 'item' || node.kind === 'row' ? 1 : Math.max(1, node.children?.length ?? 0);
    const width = style.width ?? 640, height = 80 * count + (style.padding ?? 0) * 2 + (style.gap ?? 0) * (count - 1);
    if (nx > 100000 || ny > 100000 || free && (nx + width > 100000 || ny + height > 100000)) warnings.push('Unreachable layout item: ' + node.id);
    if (free) rects.push({x:nx,y:ny,width,height,group,id:node.id});
    node.children?.forEach(child => visit(child,nx,ny,node.id));
  };
  visit(document.layout);
  rects.sort((a,b) => a.group.localeCompare(b.group) || a.x - b.x);
  for (let i = 0; i < rects.length; i++) {
    const a = rects[i];
    for (let j = i + 1; j < rects.length; j++) {
      const b = rects[j]; if (a.group !== b.group || b.x >= a.x + a.width) break;
      const width = Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x);
      const height = Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));
      if (width*height >= .75*Math.min(a.width*a.height,b.width*b.height)) warnings.push('Content-obscuring overlap: ' + a.id + ', ' + b.id);
    }
  }
  return warnings;
}
/** All permissions come from a trusted caller; they are never read out of a proposal. */
export function previewDocumentOperations(source: NotedDocumentV2, operations: DocumentOperation[], permissions: ReadonlySet<DocumentPermission>): NotedDocumentV2 {
  validateDocument(source);
  if (!Array.isArray(operations) || !operations.length || operations.length > 1000) throw new Error('An operation batch needs 1–1000 operations.');
  const result = structuredClone(source);
  const require = (permission: DocumentPermission) => { if (!permissions.has(permission)) throw new Error(`Permission required: ${permission}`); };
  for (const operation of operations) {
    if (operation.type === 'reorder') { require('reorganization'); result.readingOrder = [...operation.readingOrder]; }
    else if (operation.type === 'arrange') { require('arrangement'); result.layout = structuredClone(operation.layout); }
    else if (operation.type === 'insert') {
      require('content'); require('arrangement'); require('reorganization');
      if (!idOK(operation.object.id) || result.objects[operation.object.id]) throw new Error('A new content identifier must be unique.');
      if (componentSnapshots(operation.object).size) throw new Error('Content insertion cannot activate component code.');
      const find = (node: LayoutNode): LayoutNode | undefined => node.id === operation.parent ? node : node.children?.map(find).find(Boolean);
      const parent = find(result.layout);
      if (!parent || parent.kind === 'item' || !parent.children || !integer(operation.index, 0, parent.children.length) || !integer(operation.readingIndex, 0, result.readingOrder.length)) throw new Error('Insertion needs an existing container and valid layout/reading indices.');
      result.objects[operation.object.id] = structuredClone(operation.object);
      result.readingOrder.splice(operation.readingIndex, 0, operation.object.id);
      parent.children.splice(operation.index, 0, { id: `layout-${operation.object.id}`, kind: 'item', contentId: operation.object.id });
    }
    else if (operation.type === 'remove') {
      require('content'); require('arrangement'); require('reorganization');
      if (!result.objects[operation.id]) throw new Error('Content no longer exists.');
      delete result.objects[operation.id]; delete result.styles[operation.id];
      result.readingOrder = result.readingOrder.filter(id => id !== operation.id);
      const remove = (node: LayoutNode) => { if (node.children) { node.children = node.children.filter(child => child.contentId !== operation.id); node.children.forEach(remove); } };
      remove(result.layout);
    }
    else {
      const object = result.objects[operation.id]; if (!object) throw new Error('Content no longer exists.');
      switch (operation.type) {
        case 'format': require('formatting'); if (object.kind !== 'richText' || JSON.stringify(authored(object.content)) !== JSON.stringify(authored(operation.content))) throw new Error('Formatting must preserve authored content and references.'); object.content = structuredClone(operation.content); break;
        case 'style': require(Object.keys(operation.properties).some(name => ['width','placement','x','y','z','padding','gap','gridColumns'].includes(name)) ? 'arrangement' : 'formatting'); validatePresentation(operation.properties); result.styles[operation.id] = { ...result.styles[operation.id], ...operation.properties }; break;
        case 'edit': {
          require('content');
          const previousSnapshots = componentSnapshots(object);
          if (operation.object.id !== operation.id) throw new Error('Content identifiers must match.');
          for (const [id, next] of componentSnapshots(operation.object)) {
            const previous = previousSnapshots.get(id);
            if (!previous || next.definition !== previous.definition) throw new Error('Content editing cannot activate component code.');
            if (next.state !== previous.state) require('componentState');
          }
          result.objects[operation.id] = structuredClone(operation.object); break;
        }
        case 'state': require('componentState'); if (object.kind !== 'component') throw new Error('Component state requires a component.'); object.state = structuredClone(operation.state); break;
        default: throw new Error('Unknown document operation.');
      }
    }
  }
  validateDocument(result);
  if (!Object.keys(result.objects).length) throw new Error('A document needs at least one content object.');
  if (!permissions.has('reorganization') && JSON.stringify(result.readingOrder) !== JSON.stringify(source.readingOrder)) throw new Error('Reading order is protected.');
  if (operations.some(operation => operation.type === 'arrange' || operation.type === 'style' && Object.keys(operation.properties).some(key => ['width','placement','x','y','z','padding','gap','gridColumns'].includes(key)))) {
    const problems = inspectArrangement(result); if (problems.length) throw new Error(problems.join('\n'));
  }
  return result;
}

/** Deterministic authoring helpers for agents. They do not execute or approve code. */
export const documentAuthoring = {
  format: (id: string, content: JSONContent): DocumentOperation => ({ type: 'format', id, content }),
  arrange: (layout: LayoutNode): DocumentOperation => ({ type: 'arrange', layout }),
  state: (id: string, state: Record<string, unknown>): DocumentOperation => ({ type: 'state', id, state }),
  insert: (object: ContentObject, parent: string, index: number, readingIndex: number): DocumentOperation => ({ type: 'insert', object, parent, index, readingIndex }),
  remove: (id: string): DocumentOperation => ({ type: 'remove', id }),
};

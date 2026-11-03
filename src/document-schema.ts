import { Extension, type Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { closeHistory, isHistoryTransaction } from '@tiptap/pm/history';
import { Plugin, PluginKey } from '@tiptap/pm/state';

export const SCHEMA_STYLE_KEYS = ['fontFamily', 'fontSize', 'lineHeight', 'color', 'spacing', 'indent'] as const;
export type SchemaStyleKey = typeof SCHEMA_STYLE_KEYS[number];
export interface SchemaStyle {
  fontFamily?: 'system' | 'serif' | 'mono';
  fontSize?: number;
  lineHeight?: number;
  color?: string | null;
  spacing?: number;
  indent?: number;
}
export interface SchemaReference { id: string; version: number }
export interface SchemaPolicy { mode: 'suggest' | 'automatic'; enabledRules: SchemaStyleKey[] }
export type SchemaTarget = 'body' | 'heading1' | 'heading2' | 'heading3' | 'heading4' | 'heading5' | 'heading6';
export interface DocumentSchema extends SchemaReference {
  formatVersion: 1;
  name: string;
  rules: Partial<Record<SchemaTarget, SchemaStyle>> & { body: SchemaStyle };
}
export const SCHEMA_TARGETS: SchemaTarget[] = ['body', 'heading1', 'heading2', 'heading3', 'heading4', 'heading5', 'heading6'];
const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/;
const plain = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const hasOnly = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).every(key => keys.includes(key));
export function validSchemaReference(value: unknown): value is SchemaReference {
  return plain(value) && hasOnly(value, ['id', 'version']) && typeof value.id === 'string' && idPattern.test(value.id)
    && Number.isSafeInteger(value.version) && Number(value.version) >= 1;
}
export function validSchemaStyle(value: unknown): value is SchemaStyle {
  if (!plain(value) || !hasOnly(value, SCHEMA_STYLE_KEYS)) return false;
  return Object.entries(value).every(([key, entry]) => {
    switch (key) {
      case 'fontFamily': return ['system', 'serif', 'mono'].includes(String(entry));
      case 'fontSize': return Number.isInteger(entry) && Number(entry) >= 10 && Number(entry) <= 96;
      case 'lineHeight': return typeof entry === 'number' && Number.isFinite(entry) && entry >= 1 && entry <= 3;
      case 'color': return entry === null || typeof entry === 'string' && /^#[a-f\d]{6}$/i.test(entry);
      case 'spacing': return Number.isInteger(entry) && Number(entry) >= 0 && Number(entry) <= 96;
      case 'indent': return Number.isInteger(entry) && Number(entry) >= 0 && Number(entry) <= 8;
      default: return false;
    }
  });
}
export function validSchemaPolicy(value: unknown): value is SchemaPolicy {
  return plain(value) && hasOnly(value, ['mode', 'enabledRules']) && ['suggest', 'automatic'].includes(String(value.mode))
    && Array.isArray(value.enabledRules) && value.enabledRules.length <= SCHEMA_STYLE_KEYS.length
    && new Set(value.enabledRules).size === value.enabledRules.length
    && value.enabledRules.every(key => SCHEMA_STYLE_KEYS.includes(key as SchemaStyleKey));
}
export function validateDocumentSchema(value: unknown): asserts value is DocumentSchema {
  if (!plain(value) || !hasOnly(value, ['formatVersion', 'id', 'version', 'name', 'rules']) || value.formatVersion !== 1
    || !validSchemaReference({ id: value.id, version: value.version }) || typeof value.name !== 'string'
    || !value.name.trim() || value.name.length > 100 || !plain(value.rules) || !hasOnly(value.rules, SCHEMA_TARGETS)
    || !Object.hasOwn(value.rules, 'body') || !Object.values(value.rules).every(validSchemaStyle)) {
    throw new Error('Invalid schema. Use a name, an immutable id/version, and supported body/heading presentation rules.');
  }
}
function freezeSchema(value: DocumentSchema): DocumentSchema {
  for (const style of Object.values(value.rules)) Object.freeze(style);
  Object.freeze(value.rules); return Object.freeze(value);
}
export const BUILTIN_SCHEMAS: readonly DocumentSchema[] = [
  { formatVersion: 1, id: 'default', version: 1, name: 'Paper', rules: { body: { fontFamily: 'serif', fontSize: 16, lineHeight: 1.85, spacing: 12, indent: 0 }, heading1: { fontFamily: 'system', fontSize: 28, lineHeight: 1.4, spacing: 20 }, heading2: { fontFamily: 'system', fontSize: 23, lineHeight: 1.4, spacing: 18 }, heading3: { fontFamily: 'system', fontSize: 19, lineHeight: 1.4, spacing: 16 } } },
  { formatVersion: 1, id: 'compact', version: 1, name: 'Compact', rules: { body: { fontFamily: 'system', fontSize: 14, lineHeight: 1.55, spacing: 6, indent: 0 }, heading1: { fontFamily: 'system', fontSize: 24, lineHeight: 1.35, spacing: 14 }, heading2: { fontFamily: 'system', fontSize: 20, lineHeight: 1.35, spacing: 12 } } },
  { formatVersion: 1, id: 'outline', version: 1, name: 'Outline', rules: { body: { fontFamily: 'system', fontSize: 14, lineHeight: 1.7, spacing: 8, indent: 0 }, heading1: { fontFamily: 'system', fontSize: 25, lineHeight: 1.4, spacing: 16 }, heading2: { fontFamily: 'system', fontSize: 20, lineHeight: 1.4, spacing: 12 } } },
].map(schema => freezeSchema(schema as DocumentSchema));

/** Definitions are immutable. A note stays pinned until the user chooses another version. */
export class SchemaRegistry {
  private readonly entries = new Map<string, DocumentSchema>();
  private readonly persist?: (schemas: DocumentSchema[]) => void | Promise<void>;
  constructor(definitions: readonly DocumentSchema[] = [], persist?: (schemas: DocumentSchema[]) => void | Promise<void>) {
    this.persist = persist;
    this.import([...BUILTIN_SCHEMAS, ...definitions]);
  }
  import(definitions: readonly DocumentSchema[]) {
    // Validate the whole batch before making changes, including version collisions.
    const pending = new Map(this.entries);
    for (const value of definitions) {
      validateDocumentSchema(value); const next = structuredClone(value), key = `${next.id}@${next.version}`;
      const previous = pending.get(key);
      if (previous && JSON.stringify(previous) !== JSON.stringify(next)) throw new Error(`Schema ${key} already exists. Publish a new version instead.`);
      pending.set(key, freezeSchema(next));
    }
    this.entries.clear(); for (const [key, value] of pending) this.entries.set(key, value);
  }
  get(ref: SchemaReference | null | undefined): DocumentSchema | undefined { return ref ? this.entries.get(`${ref.id}@${ref.version}`) : undefined; }
  list(): DocumentSchema[] { return [...this.entries.values()].sort((a, b) => a.name.localeCompare(b.name) || b.version - a.version); }
  async publish(definition: DocumentSchema) {
    validateDocumentSchema(definition);
    const key = `${definition.id}@${definition.version}`, previous = this.entries.get(key);
    if (previous && JSON.stringify(previous) !== JSON.stringify(definition)) throw new Error(`Schema ${key} already exists. Publish a new version instead.`);
    const snapshot = this.list();
    if (!previous) snapshot.push(structuredClone(definition));
    // Persist first. A failed write must not publish an in-memory-only version.
    await this.persist?.(snapshot);
    this.import([definition]); return this.get(definition)!;
  }
  nextVersion(id: string): number { return 1 + Math.max(0, ...this.list().filter(schema => schema.id === id).map(schema => schema.version)); }
}

export function schemaStyleCSS(style: SchemaStyle, includeIndent = true): string {
  if (!validSchemaStyle(style)) return '';
  const declarations: string[] = [];
  if (style.fontFamily) declarations.push(`font-family:${{ system: 'system-ui,sans-serif', serif: 'Georgia,serif', mono: 'Consolas,monospace' }[style.fontFamily]}`);
  if (style.fontSize !== undefined) declarations.push(`font-size:${style.fontSize}px`);
  if (style.lineHeight !== undefined) declarations.push(`line-height:${style.lineHeight}`);
  if (style.color) declarations.push(`color:${style.color}`);
  if (style.spacing !== undefined) declarations.push(`margin-block:${style.spacing}px`);
  if (includeIndent && style.indent !== undefined) declarations.push(`margin-inline-start:${style.indent * 2}em`);
  return declarations.join(';');
}
export interface SchemaSuggestion { position: number; id: string | null; before: SchemaStyle; after: SchemaStyle; indent: number; rules: SchemaStyleKey[]; target: SchemaTarget }
function targetFor(node: PMNode): SchemaTarget | null {
  if (node.type.name === 'paragraph') return 'body';
  if (node.type.name === 'heading') return `heading${node.attrs.level}` as SchemaTarget;
  return null;
}
function suggestion(node: PMNode, position: number, schema: DocumentSchema, policy: SchemaPolicy): SchemaSuggestion | null {
  const target = targetFor(node); if (!target) return null;
  const defaults = schema.rules[target] ?? (target === 'body' ? schema.rules.body : undefined); if (!defaults) return null;
  const before: SchemaStyle = validSchemaStyle(node.attrs.schemaStyle) ? node.attrs.schemaStyle : {};
  const after = { ...before }, rules: SchemaStyleKey[] = [];
  let indent = Number(node.attrs.indent ?? 0);
  const sameVersion = node.attrs.schemaRef?.id === schema.id && node.attrs.schemaRef?.version === schema.version;
  for (const key of SCHEMA_STYLE_KEYS) {
    if (defaults[key] === undefined || policy.mode === 'automatic' && !policy.enabledRules.includes(key)) continue;
    // Inline text styles remain explicit and override inherited block styles.
    // A nonzero hand-authored block indent also wins in suggestion mode.
    if (key === 'indent') {
      if (policy.mode === 'suggest' && indent !== 0) continue;
      if (indent !== defaults.indent) { indent = defaults.indent!; rules.push(key); }
      continue;
    }
    const explicit = node.attrs[key];
    if (policy.mode === 'suggest' && explicit !== undefined && explicit !== null) continue;
    if (policy.mode === 'suggest' && before[key] !== undefined && !node.attrs.schemaRef) continue;
    if (JSON.stringify(after[key]) !== JSON.stringify(defaults[key])) {
      Object.assign(after, { [key]: defaults[key] }); rules.push(key);
    }
  }
  if (!rules.length || sameVersion && JSON.stringify(before) === JSON.stringify(after) && indent === node.attrs.indent) return null;
  return { position, id: typeof node.attrs.id === 'string' ? node.attrs.id : null, before: { ...before }, after, indent, rules, target };
}
export function previewSchema(editor: Editor, schema: DocumentSchema, policy: SchemaPolicy = { mode: 'suggest', enabledRules: [] }): SchemaSuggestion[] {
  validateDocumentSchema(schema); if (!validSchemaPolicy(policy)) throw new Error('Invalid schema policy.');
  const changes: SchemaSuggestion[] = [];
  editor.state.doc.descendants((node, position) => { const change = suggestion(node, position, schema, policy); if (change) changes.push(change); });
  return changes;
}
/** Inert candidate for rendered validation; never dispatches or touches history. */
export function schemaProjection(editor:Editor,schema:DocumentSchema,policy:SchemaPolicy){const transaction=editor.state.tr;for(const change of previewSchema(editor,schema,policy)){const node=transaction.doc.nodeAt(change.position)!;transaction.setNodeMarkup(change.position,undefined,{...node.attrs,schemaStyle:change.after,schemaRef:{id:schema.id,version:schema.version},indent:change.indent});}return transaction.doc.toJSON();}
/** One transaction, preserving selection, words, links, assets, and content order. */
export function applySchema(editor: Editor, schema: DocumentSchema, policy: SchemaPolicy = { mode: 'suggest', enabledRules: [] }, expectedDoc?: PMNode): number {
  if (!editor.isEditable) return 0;
  if (expectedDoc && editor.state.doc !== expectedDoc) throw new Error('The note changed after preview. Preview the schema again.');
  const changes = previewSchema(editor, schema, policy), tr = closeHistory(editor.state.tr);
  for (const change of changes) {
    const node = tr.doc.nodeAt(change.position)!;
    tr.setNodeMarkup(change.position, undefined, { ...node.attrs, schemaStyle: change.after, schemaRef: { id: schema.id, version: schema.version }, indent: change.indent });
  }
  if (changes.length) editor.view.dispatch(tr.setMeta('noted-schema', true));
  return changes.length;
}
export function setSchemaReference(editor: Editor, reference: SchemaReference, policy: SchemaPolicy) {
  if (!validSchemaReference(reference) || !validSchemaPolicy(policy)) throw new Error('Invalid schema selection.');
  if (!editor.isEditable) return;
  editor.view.dispatch(closeHistory(editor.state.tr).setDocAttribute('schemaReference', structuredClone(reference)).setDocAttribute('schemaPolicy', structuredClone(policy)).setMeta('noted-schema', true));
}

const autoKey = new PluginKey('noted-schema-automatic');
type SchemaExtensionStorage = { registry: SchemaRegistry | null };
export const SchemaPresentation = Extension.create<Record<string, never>, SchemaExtensionStorage>({
  name: 'schemaPresentation',
  addStorage: () => ({ registry: null }),
  addGlobalAttributes() {
    return [
      { types: ['doc'], attributes: {
        schemaReference: { default: null, rendered: false }, schemaPolicy: { default: null, rendered: false },
      } },
      { types: ['paragraph', 'heading'], attributes: {
        schemaStyle: { default: null, parseHTML: element => { try { const value: unknown = JSON.parse(element.getAttribute('data-schema-style') ?? 'null'); return validSchemaStyle(value) ? value : null; } catch { return null; } }, renderHTML: attrs => validSchemaStyle(attrs.schemaStyle) ? { 'data-schema-style': JSON.stringify(attrs.schemaStyle), style: schemaStyleCSS(attrs.schemaStyle, false) } : {} },
        schemaRef: { default: null, rendered: false },
      } },
    ];
  },
  addProseMirrorPlugins() {
    const storage = this.storage;
    return [new Plugin({ key: autoKey, appendTransaction(transactions, _oldState, state) {
      if (!transactions.some(tr => tr.docChanged) || transactions.some(tr => isHistoryTransaction(tr) || tr.getMeta('noted-schema') || tr.getMeta('noted-schema-auto'))) return null;
      const policy: unknown = state.doc.attrs.schemaPolicy, reference: unknown = state.doc.attrs.schemaReference;
      if (!validSchemaPolicy(policy) || policy.mode !== 'automatic' || !policy.enabledRules.length || !validSchemaReference(reference)) return null;
      const schema = storage.registry?.get(reference); if (!schema) return null;
      // Only inspect changed ranges and their ancestors. Long notes do not get
      // normalized from beginning to end after every keystroke.
      const ranges: { from: number; to: number }[] = [];
      for (let t = 0; t < transactions.length; t++) {
        const transaction = transactions[t];
        transaction.mapping.maps.forEach((map, index) => map.forEach((_a, _b, start, end) => {
          let from = start, to = end;
          for (const later of transaction.mapping.maps.slice(index + 1)) { from = later.map(from, -1); to = later.map(to, 1); }
          for (const later of transactions.slice(t + 1)) { from = later.mapping.map(from, -1); to = later.mapping.map(to, 1); }
          ranges.push({ from: Math.max(0, from), to: Math.min(state.doc.content.size, Math.max(from, to)) });
        }));
      }
      const seen = new Set<number>(), tr = state.tr;
      for (const range of ranges) state.doc.nodesBetween(range.from, range.to, (node, position) => {
        if (seen.has(position)) return false; seen.add(position);
        const change = suggestion(node, position, schema, policy);
        if (change) tr.setNodeMarkup(position, undefined, { ...node.attrs, schemaStyle: change.after, schemaRef: reference, indent: change.indent });
        return !node.isTextblock;
      });
      return tr.docChanged ? tr.setMeta('noted-schema-auto', true) : null;
    } })];
  },
});

export function bindSchemaRegistry(editor: Editor, registry: SchemaRegistry) {
  const storage = (editor.storage as unknown as Record<string, SchemaExtensionStorage>).schemaPresentation;
  if (storage) storage.registry = registry;
}

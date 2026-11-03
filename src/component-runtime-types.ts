/** JSON-only boundary shared by the isolated interpreter and trusted renderer. */
export type ComponentValue = null | boolean | number | string | ComponentValue[] | { [key: string]: ComponentValue };
export type ComponentRecord = Record<string, ComponentValue>;
export interface ComponentField {
  type: 'string' | 'number' | 'boolean'; label?: string; default: string | number | boolean;
  min?: number; max?: number; choices?: string[];
}
export interface ComponentManifest {
  formatVersion: 1; id: string; version: number; name: string; fallback: string;
  properties: Record<string, ComponentField>;
  persistentState: Record<string, ComponentField>;
  transientState: Record<string, ComponentField>;
  /** Only these authored properties contribute to indexing; execution is never needed. */
  searchText: string[];
  /** IDs of explicitly supplied, read-only authored text bindings. */
  bindings?: string[];
  animationFps?: number;
}
export interface ComponentDefinition { manifest: ComponentManifest; source: string }
export interface ComponentInput { properties: ComponentRecord; state: ComponentRecord; bindings: Record<string, string> }
export interface ComponentEvent { id: string; value?: string | number | boolean; kind?: 'user' | 'tick' }
export type ComponentViewType = 'text' | 'button' | 'input' | 'toggle' | 'image' | 'row' | 'column' | 'grid' | 'drawing' | 'rect' | 'circle' | 'line';
export interface ComponentView {
  type: ComponentViewType; text?: string; event?: string; value?: string | number | boolean;
  assetId?: string; alt?: string; children?: ComponentView[];
  width?: number; height?: number; gap?: number; padding?: number; columns?: number;
  x?: number; y?: number; x2?: number; y2?: number; radius?: number;
  color?: string; background?: string; disabled?: boolean;
}
export const COMPONENT_LIMITS = Object.freeze({
  wasmBytes: 64 * 1024 * 1024, wasmPages: 1024, initialPages: 256, instances: 8,
  sourceBytes: 256 * 1024, stateBytes: 64 * 1024, outputBytes: 256 * 1024,
  messageBytes: 512 * 1024, nodes: 256, depth: 16, textLength: 8192,
  executionMs: 40, watchdogMs: 350,
});
const forbiddenKeys = new Set(['__proto__', 'prototype', 'constructor']);
const idPattern = /^[A-Za-z][A-Za-z0-9_.-]{0,79}$/;
const bindingPattern = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const safeColor = /^(#[0-9a-fA-F]{3,8}|transparent|currentColor)$/;
export function componentJSON(value: unknown, byteLimit = COMPONENT_LIMITS.stateBytes): ComponentValue {
  let nodes = 0;
  const visit = (item: unknown, depth: number): ComponentValue => {
    if (++nodes > 8192 || depth > 16) throw new Error('Component JSON exceeds its structural limit.');
    if (item === null || typeof item === 'boolean' || typeof item === 'string') return item;
    if (typeof item === 'number' && Number.isFinite(item)) return item;
    if (Array.isArray(item)) return item.map(value => visit(value, depth + 1));
    if (item && typeof item === 'object' && (Object.getPrototypeOf(item) === Object.prototype || Object.getPrototypeOf(item) === null)) {
      const result: Record<string, ComponentValue> = {};
      for (const [key, value] of Object.entries(item)) {
        if (forbiddenKeys.has(key) || key.length > 128) throw new Error('Invalid component JSON key.');
        result[key] = visit(value, depth + 1);
      }
      return result;
    }
    throw new Error('Component data must contain only finite JSON values.');
  };
  const result = visit(value, 0);
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > byteLimit) throw new Error('Component data exceeds its byte limit.');
  return result;
}
function fields(value: unknown): Record<string, ComponentField> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 64) throw new Error('Invalid component fields.');
  const result: Record<string, ComponentField> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!idPattern.test(key) || forbiddenKeys.has(key) || !raw || typeof raw !== 'object') throw new Error('Invalid component field.');
    const field = raw as ComponentField;
    if (!['string', 'number', 'boolean'].includes(field.type) || typeof field.default !== field.type) throw new Error('Invalid component field default.');
    if (field.type === 'number' && (!Number.isFinite(field.default) || (field.min !== undefined && !Number.isFinite(field.min)) || (field.max !== undefined && !Number.isFinite(field.max)))) throw new Error('Invalid numeric field.');
    if (field.choices && (!Array.isArray(field.choices) || field.choices.length > 64 || field.choices.some(choice => typeof choice !== 'string' || choice.length > 256))) throw new Error('Invalid component choices.');
    result[key] = { type: field.type, default: field.default, ...(field.label ? { label: String(field.label).slice(0, 128) } : {}), ...(field.min !== undefined ? { min: field.min } : {}), ...(field.max !== undefined ? { max: field.max } : {}), ...(field.choices ? { choices: [...field.choices] } : {}) };
  }
  return result;
}
export function validateComponentDefinition(raw: unknown): ComponentDefinition {
  componentJSON(raw, COMPONENT_LIMITS.messageBytes);
  const definition = raw as ComponentDefinition;
  const manifest = definition?.manifest;
  if (!manifest || manifest.formatVersion !== 1 || !idPattern.test(manifest.id) || !Number.isSafeInteger(manifest.version) || manifest.version < 1 || typeof manifest.name !== 'string' || !manifest.name || manifest.name.length > 128 || typeof manifest.fallback !== 'string' || manifest.fallback.length > 8192) throw new Error('Invalid component manifest.');
  if (typeof definition.source !== 'string' || !definition.source.trim() || new TextEncoder().encode(definition.source).byteLength > COMPONENT_LIMITS.sourceBytes) throw new Error('Invalid component source.');
  const properties = fields(manifest.properties), persistentState = fields(manifest.persistentState), transientState = fields(manifest.transientState);
  if (!Array.isArray(manifest.searchText) || manifest.searchText.length > 64 || manifest.searchText.some(key => typeof key !== 'string' || properties[key]?.type !== 'string')) throw new Error('Search text must name declared authored string properties.');
  if (manifest.bindings && (!Array.isArray(manifest.bindings) || manifest.bindings.length > 64 || manifest.bindings.some(id => typeof id !== 'string' || !bindingPattern.test(id) || forbiddenKeys.has(id)))) throw new Error('Invalid content bindings.');
  if (manifest.animationFps !== undefined && (!Number.isFinite(manifest.animationFps) || manifest.animationFps < 1 || manifest.animationFps > 30)) throw new Error('Animation rate must be between 1 and 30 FPS.');
  return { manifest: { formatVersion: 1, id: manifest.id, version: manifest.version, name: manifest.name, fallback: manifest.fallback, properties, persistentState, transientState, searchText: [...manifest.searchText], ...(manifest.bindings ? { bindings: [...manifest.bindings] } : {}), ...(manifest.animationFps ? { animationFps: manifest.animationFps } : {}) }, source: definition.source };
}
export function resolveComponentFields(definitions: Record<string, ComponentField>, raw: ComponentRecord = {}): ComponentRecord {
  componentJSON(raw);
  const result: ComponentRecord = {};
  for (const [key, field] of Object.entries(definitions)) {
    const value = raw[key] ?? field.default;
    if (typeof value !== field.type || (typeof value === 'string' && value.length > COMPONENT_LIMITS.textLength) || (typeof value === 'number' && (!Number.isFinite(value) || (field.min !== undefined && value < field.min) || (field.max !== undefined && value > field.max))) || (field.choices && !field.choices.includes(value as string))) throw new Error(`Invalid component field: ${key}`);
    result[key] = value;
  }
  if (Object.keys(raw).some(key => !(key in definitions))) throw new Error('Component state contains undeclared fields.');
  return result;
}
const viewKeys = new Set(['type', 'text', 'event', 'value', 'assetId', 'alt', 'children', 'width', 'height', 'gap', 'padding', 'columns', 'x', 'y', 'x2', 'y2', 'radius', 'color', 'background', 'disabled']);
export function validateComponentView(raw: unknown): ComponentView {
  componentJSON(raw, COMPONENT_LIMITS.outputBytes);
  let count = 0;
  const visit = (value: unknown, depth: number, drawing: boolean): ComponentView => {
    if (++count > COMPONENT_LIMITS.nodes || depth > COMPONENT_LIMITS.depth || !value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Component view exceeds its structure limit.');
    const view = value as ComponentView;
    if (!['text', 'button', 'input', 'toggle', 'image', 'row', 'column', 'grid', 'drawing', 'rect', 'circle', 'line'].includes(view.type) || Object.keys(view).some(key => !viewKeys.has(key))) throw new Error('Unsupported component UI.');
    for (const key of ['text', 'alt'] as const) if (view[key] !== undefined && (typeof view[key] !== 'string' || view[key]!.length > COMPONENT_LIMITS.textLength)) throw new Error('Invalid component text.');
    if (view.event !== undefined && (typeof view.event !== 'string' || !idPattern.test(view.event))) throw new Error('Invalid component event.');
    if (view.assetId !== undefined && (typeof view.assetId !== 'string' || !/^[0-9a-f-]{36}$/.test(view.assetId))) throw new Error('Images must use a local asset ID.');
    if (view.value !== undefined && !['string', 'number', 'boolean'].includes(typeof view.value)) throw new Error('Invalid input value.');
    if (view.disabled !== undefined && typeof view.disabled !== 'boolean') throw new Error('Invalid disabled state.');
    if (typeof view.value === 'string' && view.value.length > COMPONENT_LIMITS.textLength) throw new Error('Input value is too long.');
    for (const key of ['width', 'height', 'gap', 'padding', 'columns', 'x', 'y', 'x2', 'y2', 'radius'] as const) if (view[key] !== undefined && (typeof view[key] !== 'number' || !Number.isFinite(view[key]) || view[key]! < 0 || view[key]! > (key === 'columns' ? 12 : 2048))) throw new Error('Invalid component geometry.');
    for (const key of ['color', 'background'] as const) if (view[key] !== undefined && (typeof view[key] !== 'string' || !safeColor.test(view[key]!))) throw new Error('Unsupported component color.');
    if (['rect', 'circle', 'line'].includes(view.type) && !drawing) throw new Error('Shapes require a drawing container.');
    if (view.children !== undefined && (!Array.isArray(view.children) || !['row', 'column', 'grid', 'drawing'].includes(view.type))) throw new Error('Invalid component children.');
    if (view.children) for (const child of view.children) visit(child, depth + 1, view.type === 'drawing');
    return view;
  };
  return visit(raw, 0, false);
}

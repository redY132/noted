import variant from '@jitl/quickjs-wasmfile-release-sync';
import { newVariant, newQuickJSWASMModuleFromVariant, type QuickJSContext, type QuickJSHandle, type QuickJSRuntime } from 'quickjs-emscripten-core';
import { COMPONENT_LIMITS, componentJSON, resolveComponentFields, validateComponentDefinition, validateComponentView, type ComponentDefinition, type ComponentEvent, type ComponentInput, type ComponentRecord, type ComponentView } from './component-runtime-types.ts';

/** Pinned 0.32.0 release-sync artifact, also pinned by package-lock integrity. */
export const QUICKJS_WASM_SHA256 = '105c3bed22d457e43e3d1c3c1c6959fda62a8fe06f0fc8a985303c3a2be72232';
interface Instance { context: QuickJSContext; dispatch: QuickJSHandle; definition: ComponentDefinition; transient: ComponentRecord }
export interface ComponentResult { view: ComponentView; state: ComponentRecord; memoryBytes: number }
export interface ComponentInterpreter {
  load(id: string, definition: ComponentDefinition): void;
  run(id: string, input: ComponentInput, event?: ComponentEvent): ComponentResult;
  remove(id: string): void;
  dispose(): void;
  memory: WebAssembly.Memory;
}
const bootstrap = String.raw`(function(source){
  "use strict";
  const parse = JSON.parse, stringify = JSON.stringify, freeze = Object.freeze;
  const deepFreeze = value => { if(value && typeof value === 'object'){ for(const key of Object.keys(value)) deepFreeze(value[key]); freeze(value); } return value; };
  const node = (type, props, children) => Object.assign({type}, props || {}, children ? {children} : {});
  const ui = freeze({
    text: (text, props) => node('text', Object.assign({},props,{text:String(text)})),
    button: (text,event,props) => node('button',Object.assign({},props,{text:String(text),event})),
    input: (value,event,props) => node('input',Object.assign({},props,{value,event})),
    toggle: (text,value,event,props) => node('toggle',Object.assign({},props,{text:String(text),value:!!value,event})),
    image: (assetId,alt,props) => node('image',Object.assign({},props,{assetId,alt})),
    row: (children,props) => node('row',props,children), column: (children,props) => node('column',props,children),
    grid: (children,props) => node('grid',props,children), drawing: (children,props) => node('drawing',props,children),
    rect: props => node('rect',props), circle: props => node('circle',props), line: props => node('line',props)
  });
  // Indirect eval runs only inside QuickJS. No browser/Worker objects are installed.
  const component = (0,eval)('("use strict", ('+source+'\n))');
  if(!component || typeof component.render !== 'function') throw new Error('Component must provide render(input, ui).');
  return function(serialized){
    const request = parse(serialized);
    let state = request.input.state, transient = request.transient;
    const input = deepFreeze({properties:request.input.properties,state,transient,bindings:request.input.bindings});
    if(request.event && typeof component.reduce === 'function'){
      const next = component.reduce(input,deepFreeze(request.event)) || {};
      // Animation may only change transient state. Persistent writes require a user event.
      if(request.event.kind !== 'tick' && next.state !== undefined) state = next.state;
      if(next.transient !== undefined) transient = next.transient;
    }
    const view = component.render(deepFreeze({properties:input.properties,state,transient,bindings:input.bindings}),ui);
    const result = stringify({view,state,transient});
    if(typeof result !== 'string' || result.length > 262144) throw new Error('Component output exceeds its byte limit.');
    return result;
  };
})`;

function assertNoDefinedMemories(bytes: ArrayBuffer) {
  const data = new Uint8Array(bytes);
  let offset = 8;
  const leb = () => {
    let result = 0, shift = 0;
    for (let count = 0; count < 5; count++) {
      if (offset >= data.length) throw new Error('Truncated component WASM.');
      const byte = data[offset++]; result += (byte & 127) * 2 ** shift;
      if (!(byte & 128)) return result;
      shift += 7;
    }
    throw new Error('Invalid component WASM section.');
  };
  while (offset < data.length) {
    const section = data[offset++], size = leb(), end = offset + size;
    if (end > data.length) throw new Error('Truncated component WASM section.');
    if (section === 5 && leb() !== 0) throw new Error('Runtime defines an additional uncapped memory.');
    offset = end;
  }
}

export async function createComponentInterpreter(bytes: ArrayBuffer): Promise<ComponentInterpreter> {
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
  if (digest !== QUICKJS_WASM_SHA256) throw new Error('Component runtime checksum mismatch; custom execution is disabled.');
  const module = await WebAssembly.compile(bytes);
  const memoryImports = WebAssembly.Module.imports(module).filter(entry => entry.kind === 'memory');
  // This exact pinned artifact imports one memory and defines none. A changed artifact
  // fails its checksum instead of silently introducing another or uncapped memory.
  if (memoryImports.length !== 1) throw new Error('Unverified component runtime memory shape.');
  assertNoDefinedMemories(bytes);
  const memory = new WebAssembly.Memory({ initial: COMPONENT_LIMITS.initialPages, maximum: COMPONENT_LIMITS.wasmPages });
  const quickjs = await newQuickJSWASMModuleFromVariant(newVariant(variant, { wasmModule: module, wasmMemory: memory }));
  if (quickjs.getWasmMemory() !== memory) throw new Error('Runtime did not use the verified capped memory.');
  const runtime: QuickJSRuntime = quickjs.newRuntime();
  // Supplemental only: the imported WebAssembly.Memory maximum is the hard ceiling.
  runtime.setMemoryLimit(48 * 1024 * 1024);
  runtime.setMaxStackSize(256 * 1024);
  runtime.removeModuleLoader();
  let deadline = 0, disposed = false;
  runtime.setInterruptHandler(() => performance.now() > deadline);
  const instances = new Map<string, Instance>();
  const withDeadline = <T>(fn: () => T): T => { deadline = performance.now() + COMPONENT_LIMITS.executionMs; return fn(); };
  function checked<T extends QuickJSHandle>(context: QuickJSContext, result: { value?: T; error?: QuickJSHandle }): T {
    if (result.error) { const detail = context.dump(result.error); result.error.dispose(); throw new Error(typeof detail?.message === 'string' ? detail.message.slice(0, 512) : 'Component execution failed.'); }
    return result.value!;
  }
  const interpreter: ComponentInterpreter = {
    memory,
    load(id, rawDefinition) {
      if (disposed) throw new Error('Component interpreter is closed.');
      if (instances.has(id)) this.remove(id);
      if (instances.size >= COMPONENT_LIMITS.instances) throw new Error('At most eight interactive components can run at once.');
      const definition = validateComponentDefinition(rawDefinition);
      const context = runtime.newContext();
      try {
        const factory = withDeadline(() => checked(context, context.evalCode(bootstrap, 'noted-toolkit.js')));
        const source = context.newString(definition.source);
        let dispatch: QuickJSHandle;
        try { dispatch = withDeadline(() => checked(context, context.callFunction(factory, context.undefined, source))); }
        finally { factory.dispose(); source.dispose(); }
        instances.set(id, { context, dispatch, definition, transient: resolveComponentFields(definition.manifest.transientState) });
      } catch (error) { context.dispose(); throw error; }
    },
    run(id, rawInput, event) {
      if (disposed) throw new Error('Component interpreter is closed.');
      const instance = instances.get(id);
      if (!instance) throw new Error('Unknown interactive component instance.');
      componentJSON(rawInput, COMPONENT_LIMITS.messageBytes);
      if (event && (!/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(event.id) || (event.value !== undefined && !['string', 'number', 'boolean'].includes(typeof event.value)) || (typeof event.value === 'string' && event.value.length > COMPONENT_LIMITS.textLength))) throw new Error('Invalid component event.');
      const { manifest } = instance.definition;
      const bindings: Record<string, string> = {};
      for (const key of manifest.bindings ?? []) {
        const value = rawInput.bindings[key];
        if (value !== undefined) {
          if (typeof value !== 'string' || value.length > COMPONENT_LIMITS.textLength) throw new Error('Read-only binding exceeds its text limit.');
          bindings[key] = value;
        }
      }
      const input = { properties: resolveComponentFields(manifest.properties, rawInput.properties), state: resolveComponentFields(manifest.persistentState, rawInput.state), bindings };
      const serialized = JSON.stringify({ input, transient: instance.transient, event });
      const argument = instance.context.newString(serialized);
      try {
        const output = withDeadline(() => checked(instance.context, instance.context.callFunction(instance.dispatch, instance.context.undefined, argument)));
        try {
          const text = instance.context.getString(output);
          if (text.length > COMPONENT_LIMITS.outputBytes) throw new Error('Component output is too large.');
          const parsed = JSON.parse(text);
          componentJSON(parsed, COMPONENT_LIMITS.outputBytes);
          const view = validateComponentView(parsed.view);
          const state = resolveComponentFields(manifest.persistentState, parsed.state);
          instance.transient = resolveComponentFields(manifest.transientState, parsed.transient);
          return { view, state, memoryBytes: memory.buffer.byteLength };
        } finally { output.dispose(); }
      } finally { argument.dispose(); }
    },
    remove(id) {
      const instance = instances.get(id);
      if (!instance) return;
      instance.dispatch.dispose(); instance.context.dispose(); instances.delete(id);
    },
    dispose() {
      if (disposed) return;
      for (const id of instances.keys()) this.remove(id);
      disposed = true; runtime.dispose();
    },
  };
  return interpreter;
}

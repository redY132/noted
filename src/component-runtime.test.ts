import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createComponentInterpreter } from './component-runtime-engine.ts';
import { COMPONENT_LIMITS, componentJSON, validateComponentDefinition, validateComponentView, type ComponentDefinition } from './component-runtime-types.ts';
import { counterComponent, flashcardComponent } from './component-runtime-examples.ts';
import { JSDOM } from 'jsdom';
import { ComponentRuntimeHost, componentCodeHash, enableComponentVersion, isComponentVersionEnabled, installComponentDefinition, installedComponentDefinitions } from './component-runtime.ts';

const wasm = async () => { const bytes = await readFile(new URL('../node_modules/@jitl/quickjs-wasmfile-release-sync/dist/emscripten-module.wasm', import.meta.url)); return Uint8Array.from(bytes).buffer; };
const input = { properties: {}, state: {}, bindings: {} };
function definition(source: string): ComponentDefinition { return { manifest: { formatVersion: 1, id: 'test.component', version: 1, name: 'Test', fallback: 'Test fallback', properties: {}, persistentState: {}, transientState: {}, searchText: [] }, source }; }

test('pinned QuickJS runtime uses one externally capped 64 MiB WebAssembly memory', async () => {
  const engine = await createComponentInterpreter(await wasm());
  try {
    assert.equal(engine.memory.buffer.byteLength, 16 * 1024 * 1024);
    assert.throws(() => engine.memory.grow(COMPONENT_LIMITS.wasmPages), RangeError);
    engine.load('counter', counterComponent);
    const result = engine.run('counter', input, { id: 'increase', kind: 'user' });
    assert.equal(result.state.count, 1);
    assert.ok(result.memoryBytes <= COMPONENT_LIMITS.wasmBytes);
    assert.equal(result.memoryBytes, engine.memory.buffer.byteLength);
  } finally { engine.dispose(); }
});
test('component state persists only after user events; transient flips stay transient', async () => {
  const engine = await createComponentInterpreter(await wasm());
  try {
    engine.load('counter', counterComponent);
    assert.equal(engine.run('counter', input, { id: 'increase', kind: 'tick' }).state.count, 0);
    engine.load('flashcard', flashcardComponent);
    const card = engine.run('flashcard', input, { id: 'flip', kind: 'user' });
    assert.deepEqual(card.state, {});
    assert.equal(card.view.children?.[0].text, 'Write the answer here.');
    assert.equal(engine.run('flashcard', input).view.children?.[0].text, 'Write the answer here.');
  } finally { engine.dispose(); }
});
test('VM has no network, DOM, filesystem, IPC or module loader', async () => {
  const engine = await createComponentInterpreter(await wasm());
  try {
    engine.load('sandbox', definition(`({render(input,ui){ return ui.text([typeof fetch,typeof window,typeof document,typeof process,typeof require,typeof __TAURI__,typeof WebAssembly,typeof setTimeout].join(',')); }})`));
    assert.equal(engine.run('sandbox', input).view.text, Array(8).fill('undefined').join(','));
    assert.throws(() => engine.load('module', definition(`await import('node:fs')`)));
  } finally { engine.dispose(); }
});
test('read-only inputs and declared fields reject mutation and arbitrary persistent state', async () => {
  const engine = await createComponentInterpreter(await wasm());
  try {
    engine.load('mutation', definition(`({render(input,ui){ input.state.bad=1; return ui.text('safe'); },reduce(){ return {state:{undeclared:true}}; }})`));
    assert.throws(() => engine.run('mutation', input, { id: 'click', kind: 'user' }), /undeclared/);
    engine.load('binding', { ...definition(`({render(input,ui){ return ui.text(Object.keys(input.bindings).join(',')); }})`), manifest: { ...definition('').manifest, bindings: ['allowed'] } });
    assert.equal(engine.run('binding', { ...input, bindings: { allowed: 'yes', secret: 'not exposed' } }).view.text, 'allowed');
  } finally { engine.dispose(); }
});
test('execution interrupts loops and catches memory exhaustion without exceeding total WASM ceiling', async () => {
  const engine = await createComponentInterpreter(await wasm());
  try {
    engine.load('loop', definition(`({render(){ while(true){} }})`));
    const started = performance.now();
    assert.throws(() => engine.run('loop', input), /interrupt/);
    assert.ok(performance.now() - started < 1000);
    engine.remove('loop');
    engine.load('memory', definition(`({render(){ const arrays=[]; for(let i=0;i<100;i++) arrays.push(new ArrayBuffer(8*1024*1024)); return {type:'text',text:'unexpected'}; }})`));
    assert.throws(() => engine.run('memory', input));
    assert.ok(engine.memory.buffer.byteLength <= COMPONENT_LIMITS.wasmBytes);
  } finally { engine.dispose(); }
});
test('interpreter bounds live contexts and validates checksum before execution', async () => {
  const engine = await createComponentInterpreter(await wasm());
  try {
    for (let index = 0; index < 8; index++) engine.load(String(index), counterComponent);
    assert.throws(() => engine.load('ninth', counterComponent), /eight/);
    engine.remove('0'); engine.load('replacement', counterComponent);
    for (let index = 1; index < 8; index++) assert.equal(engine.run(String(index), input).state.count, 0);
  } finally { engine.dispose(); }
  const corrupt = new Uint8Array(await wasm()); corrupt[100] ^= 1;
  await assert.rejects(createComponentInterpreter(corrupt.buffer), /checksum/);
});
test('renderer boundary rejects malformed output, arbitrary HTML, external images and oversized trees', () => {
  for (const raw of [
    { type: 'iframe', src: 'https://example.test' },
    { type: 'text', text: '<script>still plain text</script>', innerHTML: 'bad' },
    { type: 'image', assetId: 'https://example.test/a.png' },
    { type: 'column', color: 'url(https://example.test)' },
    { type: 'circle', radius: 2 },
    { type: 'row', children: Array.from({ length: 256 }, () => ({ type: 'text', text: 'x' })) },
    { type: 'text', text: 'x'.repeat(8193) },
  ]) assert.throws(() => validateComponentView(raw));
  assert.equal(validateComponentView({ type: 'text', text: '<script>plain text</script>' }).text, '<script>plain text</script>');
  assert.throws(() => componentJSON(JSON.parse('{"__proto__":{"polluted":true}}')));
  assert.throws(() => validateComponentDefinition({ ...counterComponent, manifest: { ...counterComponent.manifest, searchText: ['undeclared'] } }));
});

test('host approves exact versions, rejects stale results, kills stuck workers and stops after close', async () => {
  const dom = new JSDOM('<!doctype html><body><div id="widget"></div></body>', { url: 'https://noted.test', pretendToBeVisual: true });
  const globals = ['document', 'navigator', 'localStorage', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLButtonElement', 'HTMLImageElement', 'Worker'] as const;
  const previous = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of globals.filter(key => key !== 'Worker')) Object.defineProperty(globalThis, key, { configurable: true, value: (dom.window as unknown as Record<string, unknown>)[key] });
  type Response = { sequence: number; id: string; kind: string; input?: { state: Record<string, number> } };
  class FakeWorker {
    static instances: FakeWorker[] = [];
    static holdRun = false;
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onerror: (() => void) | null = null;
    terminated = false;
    messages: Response[] = [];
    constructor() { FakeWorker.instances.push(this); }
    postMessage(message: Response) {
      this.messages.push(message);
      if (message.kind === 'run' && FakeWorker.holdRun) return;
      setTimeout(() => this.reply(message), 0);
    }
    reply(message: Response, count = 0) {
      if (this.terminated) return;
      this.onmessage?.({ data: { sequence: message.sequence, id: message.id, ...(message.kind === 'run' ? { result: { view: { type: 'text', text: `count ${count}` }, state: { count }, memoryBytes: 16 * 1024 * 1024 } } : { ok: true, memoryBytes: 16 * 1024 * 1024 }) } });
    }
    terminate() { this.terminated = true; }
  }
  Object.defineProperty(globalThis, 'Worker', { configurable: true, value: FakeWorker });
  const waitFor = async (predicate: () => boolean, timeout = 1500) => {
    const started = performance.now(); while (!predicate()) { if (performance.now() - started > timeout) throw new Error('Host test timed out.'); await new Promise(resolve => setTimeout(resolve, 5)); }
  };
  let host: ComponentRuntimeHost | undefined;
  try {
    assert.equal(await isComponentVersionEnabled(counterComponent), false);
    installComponentDefinition(counterComponent);
    assert.equal(installedComponentDefinitions().length, 1);
    assert.throws(() => installComponentDefinition({ ...counterComponent, source: `${counterComponent.source} ` }), /new version/);
    await enableComponentVersion(counterComponent);
    assert.equal(await isComponentVersionEnabled(counterComponent), true);
    assert.equal(await isComponentVersionEnabled({ ...counterComponent, source: `${counterComponent.source} ` }), false);
    assert.notEqual(await componentCodeHash(counterComponent), await componentCodeHash({ ...counterComponent, manifest: { ...counterComponent.manifest, version: 2 } }));
    const element = dom.window.document.getElementById('widget')!;
    const writes: unknown[] = [];
    host = new ComponentRuntimeHost();
    const handle = host.mount({ id: 'instance', definition: counterComponent, element, input, onState: state => writes.push(state) });
    await waitFor(() => element.textContent === 'count 0');
    FakeWorker.holdRun = true;
    handle.update({ ...input, state: { count: 1 } });
    const worker = FakeWorker.instances.at(-1)!;
    await waitFor(() => worker.messages.filter(message => message.kind === 'run').length === 2);
    const stale = worker.messages.at(-1)!;
    handle.update({ ...input, state: { count: 2 } });
    worker.reply(stale, 1);
    await waitFor(() => worker.messages.filter(message => message.kind === 'run').length === 3);
    assert.equal(element.textContent, 'count 0', 'obsolete render did not replace the current view');
    worker.reply(worker.messages.at(-1)!, 2);
    await waitFor(() => element.textContent === 'count 2');
    handle.update({ ...input, state: { count: 3 } });
    await waitFor(() => worker.terminated, 1200);
    assert.match(element.textContent!, /timed out/);
    assert.deepEqual(writes, [], 'rendering and failures never persist state');
    handle.destroy(); host.destroy();
    const workersAfterClose = FakeWorker.instances.length;
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(FakeWorker.instances.length, workersAfterClose);
    assert.equal(host.stats.pending, 0); assert.equal(host.stats.running, false);
  } finally {
    host?.destroy(); dom.window.close();
    for (const key of globals) { const descriptor = previous.get(key); if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
  }
});

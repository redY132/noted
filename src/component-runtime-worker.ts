import wasmUrl from '@jitl/quickjs-wasmfile-release-sync/wasm?url';
import { createComponentInterpreter, type ComponentInterpreter } from './component-runtime-engine.ts';
import { COMPONENT_LIMITS, componentJSON, type ComponentDefinition, type ComponentEvent, type ComponentInput } from './component-runtime-types.ts';
type Request = { sequence: number; kind: 'load' | 'run' | 'remove'; id: string; definition?: ComponentDefinition; input?: ComponentInput; event?: ComponentEvent };
const worker = globalThis as unknown as { onmessage: ((event: MessageEvent<Request>) => void) | null; postMessage: (data: unknown) => void };
let interpreter: ComponentInterpreter | undefined;
let chain = Promise.resolve();
worker.onmessage = event => {
  chain = chain.then(async () => {
    const request = event.data;
    try {
      componentJSON(request, COMPONENT_LIMITS.messageBytes);
      if (!Number.isSafeInteger(request.sequence) || typeof request.id !== 'string' || request.id.length > 128) throw new Error('Invalid component request.');
      if (!interpreter) {
        const response = await fetch(wasmUrl);
        if (!response.ok) throw new Error('Bundled component runtime is unavailable.');
        interpreter = await createComponentInterpreter(await response.arrayBuffer());
      }
      if (request.kind === 'load' && request.definition) interpreter.load(request.id, request.definition);
      else if (request.kind === 'remove') interpreter.remove(request.id);
      else if (request.kind === 'run' && request.input) {
        const result = interpreter.run(request.id, request.input, request.event);
        worker.postMessage({ sequence: request.sequence, id: request.id, result }); return;
      } else throw new Error('Invalid component request.');
      worker.postMessage({ sequence: request.sequence, id: request.id, ok: true, memoryBytes: interpreter.memory.buffer.byteLength });
    } catch (error) {
      worker.postMessage({ sequence: request.sequence, id: request?.id, error: error instanceof Error ? error.message.slice(0, 512) : 'Component execution failed.' });
    }
  });
};

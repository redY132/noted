import 'grapesjs/dist/css/grapes.min.css';
import '../../src/components.css';
import './style.css';
import { mount, frames, type Adapter, type Candidate } from './adapters';
import { fixture, textOf, fingerprint, workloads, type Workload } from './fixtures';

const host = document.querySelector<HTMLElement>('#host')!;
const status = document.querySelector<HTMLElement>('#status')!;
const output = document.querySelector<HTMLElement>('#results')!;
let current: Adapter | undefined;
let busy = false;
const candidates: Candidate[] = ['focused-tiptap', 'grapesjs-tiptap'];
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function percentile(values: number[], fraction: number) { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]; }
function summary(values: number[]) { return { count: values.length, median: percentile(values, .5), p95: percentile(values, .95), max: Math.max(...values) }; }
async function replace(kind: Candidate, workload: Workload) {
  await current?.destroy(); current = undefined;
  current = await mount(kind, host, fixture(workload));
  return current;
}
async function check() {
  const checks = [];
  for (const kind of candidates) {
    status.textContent = `Checking ${kind}`;
    const editor = await replace(kind, { name: 'correctness', panels: 3, paragraphs: 3, images: 1 });
    const initial = editor.canonical();
    const initialText = textOf(initial);
    const serialized = editor.serialize();
    await editor.activate();
    editor.insert('Unicode café 📝 ');
    assert(textOf(editor.canonical()).includes('Unicode café 📝 '), `${kind}: typed text missing`);
    editor.undoText();
    assert(textOf(editor.canonical()) === initialText, `${kind}: text undo failed`);
    editor.resize(480);
    assert(editor.canonical().content?.[0].attrs?.width === 480, `${kind}: resize failed`);
    assert(textOf(editor.canonical()) === initialText, `${kind}: resize altered content`);
    // Inspect a saved and restored component update, including all rich-text marks.
    const changed = editor.canonical();
    await editor.restore(editor.serialize());
    assert(fingerprint(editor.canonical()) === fingerprint(changed), `${kind}: save/reopen changed rich content or properties`);
    await editor.activate();
    editor.insert('After reopening. ');
    assert(textOf(editor.canonical()).includes('After reopening. '), `${kind}: editing after reopen failed`);
    await editor.restore(serialized);
    assert(fingerprint(editor.canonical()) === fingerprint(initial), `${kind}: initial round trip mismatch`);
    editor.move();
    assert(editor.canonical().content?.[0].attrs?.id !== initial.content?.[0].attrs?.id, `${kind}: move failed`);
    assert(editor.canonical().content?.length === initial.content?.length, `${kind}: move lost components`);
    const beforeWords = initialText.split(/\s+/u).sort().join(' ');
    assert(textOf(editor.canonical()).split(/\s+/u).sort().join(' ') === beforeWords, `${kind}: move changed words`);
    await editor.restore(serialized); await editor.activate();
    editor.insert('Mixed edit. '); editor.resize(500); editor.undoLayout();
    assert(editor.canonical().content?.[0].attrs?.width === 640, `${kind}: mixed layout undo failed`);
    assert(textOf(editor.canonical()).includes('Mixed edit. '), `${kind}: layout undo discarded text`);
    editor.undoText();
    assert(textOf(editor.canonical()) === initialText, `${kind}: mixed text undo failed`);
    checks.push({ candidate: kind, passed: true, assertions: ['Unicode typing', 'text undo', 'resize preserves words', 'rich-content/property round trip', 'typing after reopen', 'component reorder preserves content', 'mixed text/layout undo'],
      unifiedHistory: kind === 'focused-tiptap' ? 'one ProseMirror history' : 'experimental bridge for tested text/property/reorder operations; generic GrapesJS actions are not covered' });
  }
  status.textContent = 'Correctness checks passed';
  return checks;
}
interface RunOptions { repeats?: number; inputSamples?: number; propertySamples?: number; workloads?: Workload[] }
async function run(options: RunOptions = {}) {
  const repeats = options.repeats ?? 3;
  const inputSamples = options.inputSamples ?? 40;
  const propertySamples = options.propertySamples ?? 20;
  const selectedWorkloads = options.workloads ?? workloads;
  assert(repeats >= 1 && repeats <= 10, 'repeats must be 1..10');
  const correctness = await check();
  const runs = [];
  const longTasks: number[] = [];
  const observer = new PerformanceObserver(list => list.getEntries().forEach(entry => longTasks.push(entry.duration)));
  try { observer.observe({ type: 'longtask', buffered: false }); } catch { /* unavailable in some browsers */ }
  for (const workload of selectedWorkloads) {
    // Warm both adapters once per workload before alternating measured order.
    for (const kind of candidates) { const warm = await replace(kind, workload); await warm.activate(); warm.insert('warmup '); }
    for (let repeat = 0; repeat < repeats; repeat++) {
      const order = repeat % 2 ? [...candidates].reverse() : candidates;
      for (const kind of order) {
        status.textContent = `${workload.name}: ${kind}, repeat ${repeat + 1}/${repeats}`;
        await current?.destroy(); current = undefined; await frames();
        const source = fixture(workload);
        const start = performance.now();
        const editor = current = await mount(kind, host, source);
        const mountMs = performance.now() - start;
        const activateStart = performance.now(); await editor.activate();
        const activationMs = performance.now() - activateStart;
        const transactionMs: number[] = [], dispatchToFrameMs: number[] = [];
        for (let i = 0; i < inputSamples; i++) {
          const begin = performance.now(); editor.insert('x');
          transactionMs.push(performance.now() - begin);
          await frames(); dispatchToFrameMs.push(performance.now() - begin);
        }
        const propertyMs: number[] = [];
        for (let i = 0; i < propertySamples; i++) {
          const begin = performance.now(); editor.resize(480 + i % 2 * 160);
          propertyMs.push(performance.now() - begin); await frames();
        }
        const saveMs: number[] = []; let saved = '';
        for (let i = 0; i < 10; i++) { const begin = performance.now(); saved = editor.serialize(); saveMs.push(performance.now() - begin); }
        const original = fingerprint(editor.canonical());
        const reopenStart = performance.now(); await editor.restore(saved); const reopenMs = performance.now() - reopenStart;
        assert(original === fingerprint(editor.canonical()), `${kind}: benchmark round trip mismatch`);
        const domNodes = host.querySelectorAll('*').length + [...host.querySelectorAll('iframe')].reduce((sum, iframe) => sum + (iframe.contentDocument?.querySelectorAll('*').length ?? 0), 0);
        const destroyStart = performance.now(); await editor.destroy(); current = undefined; const destroyMs = performance.now() - destroyStart;
        runs.push({ candidate: kind, workload, repeat, mountMs, activationMs, transactionMs: summary(transactionMs), dispatchToFrameMs: summary(dispatchToFrameMs), propertyMs: summary(propertyMs), serializeMs: summary(saveMs), serializedBytes: new TextEncoder().encode(saved).length, reopenMs, destroyMs, domNodes,
          samples: { transactionMs, dispatchToFrameMs, propertyMs, saveMs } });
        output.textContent = JSON.stringify(runs.map(({ samples: _samples, ...result }) => result), null, 2);
      }
    }
  }
  observer.disconnect();
  const result = { timestamp: new Date().toISOString(), userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency,
    viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
    limitations: ['Programmatic transactions are not physical keyboard-to-paint measurements.', 'Double requestAnimationFrame is a frame-opportunity proxy, not a paint timestamp.', 'Mount excludes module download/evaluation; both candidates are bundled in the test page.', 'No forced GC or per-candidate process-memory attribution.', 'Synthetic local images are tiny and do not measure large image decode cost.', 'WebView2/low-end device acceptance is separate.', 'GrapesJS mixed undo bridge covers tested text/property/reorder operations, not all generic builder actions.'], correctness, longTasks, runs };
  output.textContent = JSON.stringify(result, null, 2); status.textContent = 'Comparison complete';
  return result;
}
async function guard<T>(action: () => Promise<T>) {
  if (busy) throw new Error('Comparison already running');
  busy = true;
  try { return await action(); } catch (error) { status.textContent = String(error); throw error; } finally { busy = false; }
}
const api = { check: () => guard(check), run: (options?: RunOptions) => guard(() => run(options)),
  inspect: (kind: Candidate) => guard(async () => { const editor = await replace(kind, { name: 'interactive', panels: 6, paragraphs: 3, images: 2 }); await editor.activate(); return kind; }),
  get current() { return current; }, workloads };
Object.assign(window, { editorComparison: api });
document.querySelector('#check')!.addEventListener('click', () => void api.check().then(value => output.textContent = JSON.stringify(value, null, 2)));
document.querySelector('#run')!.addEventListener('click', () => void api.run());
document.querySelector('#native')!.addEventListener('click', () => void api.inspect('focused-tiptap'));
document.querySelector('#grapes')!.addEventListener('click', () => void api.inspect('grapesjs-tiptap'));
document.querySelector('#activate')!.addEventListener('click', () => void current?.activate());
document.querySelector('#resize')!.addEventListener('click', () => current?.resize(480));
document.querySelector('#move')!.addEventListener('click', () => current?.move());
document.querySelector('#undo')!.addEventListener('click', () => current?.undoText());
document.querySelector('#layout-undo')!.addEventListener('click', () => current?.undoLayout());
document.querySelector('#save')!.addEventListener('click', () => { if (current) void current.restore(current.serialize()); });

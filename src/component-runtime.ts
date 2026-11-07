import { COMPONENT_LIMITS, componentJSON, validateComponentDefinition, validateComponentView, type ComponentDefinition, type ComponentEvent, type ComponentInput, type ComponentRecord, type ComponentView } from './component-runtime-types.ts';
import type { ComponentResult } from './component-runtime-engine.ts';

const definitionsKey = 'noted-component-definitions-v1', approvalsKey = 'noted-component-approvals-v1';
const canonical = (definition: ComponentDefinition) => JSON.stringify(validateComponentDefinition(definition));
export async function componentCodeHash(definition: ComponentDefinition) {
  const bytes = new TextEncoder().encode(canonical(definition));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
}
export function installedComponentDefinitions(): ComponentDefinition[] {
  try {
    const raw = JSON.parse(localStorage.getItem(definitionsKey) ?? '[]');
    if (!Array.isArray(raw) || raw.length > 128) return [];
    return raw.flatMap(value => { try { return [validateComponentDefinition(value)]; } catch { return []; } });
  } catch { return []; }
}
/** Import stores data only. It never approves or executes source. */
export function installComponentDefinition(raw: unknown): ComponentDefinition {
  const definition = validateComponentDefinition(raw), definitions = installedComponentDefinitions();
  const existing = definitions.find(item => item.manifest.id === definition.manifest.id && item.manifest.version === definition.manifest.version);
  if (existing && canonical(existing) !== canonical(definition)) throw new Error('This component version already exists. Give changed code a new version.');
  if (!existing) {
    if (definitions.length >= 128) throw new Error('Too many installed component definitions.');
    const serialized = JSON.stringify([...definitions, definition]);
    if (serialized.length > 4 * 1024 * 1024) throw new Error('Installed component definitions exceed the local storage limit.');
    localStorage.setItem(definitionsKey, serialized);
  }
  if (!existing && typeof document !== 'undefined') { const event = document.createEvent('Event'); event.initEvent('noted-component-definitions-changed',false,false); document.dispatchEvent(event); }
  return definition;
}
function approvals(): Set<string> {
  try { const raw = JSON.parse(localStorage.getItem(approvalsKey) ?? '[]'); return new Set(Array.isArray(raw) ? raw.filter(value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)) : []); } catch { return new Set(); }
}
/** Call exclusively from an explicit user Enable action. Approval is for exact source + manifest bytes. */
export async function enableComponentVersion(definition: ComponentDefinition) {
  const values = approvals(); values.add(await componentCodeHash(definition));
  localStorage.setItem(approvalsKey, JSON.stringify([...values]));
}
export async function isComponentVersionEnabled(definition: ComponentDefinition) { return approvals().has(await componentCodeHash(definition)); }
export async function disableComponentVersion(definition: ComponentDefinition) {
  const values = approvals(); values.delete(await componentCodeHash(definition)); localStorage.setItem(approvalsKey, JSON.stringify([...values]));
}
export interface ComponentMount {
  id: string; element: HTMLElement; definition: ComponentDefinition; input: ComponentInput;
  onState: (state: ComponentRecord) => void;
  resolveAsset?: (id: string) => Promise<string>;
  onError?: (message: string) => void;
  onRender?:()=>void;
  fallback?: string;
}
export interface ComponentMountHandle { update(input: ComponentInput): void; destroy(): void; resume(): Promise<void> }
interface Mounted extends ComponentMount { generation: number; visible: boolean; failed: boolean; loaded: boolean; pending: boolean; observer: IntersectionObserver | null; timer: ReturnType<typeof setTimeout> | null }
type WorkerResponse = { sequence: number; id: string; ok?: boolean; error?: string; result?: ComponentResult; memoryBytes?: number };

/** One Worker and one capped WebAssembly memory per open note; no idle polling. */
export class ComponentRuntimeHost {
  private worker: Worker | null = null;
  private sequence = 0;
  private workerEpoch = 0;
  private mounted = new Map<string, Mounted>();
  private active = new Map<number, { resolve: (message: WorkerResponse) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private chain: Promise<unknown> = Promise.resolve();
  private disposed = false;
  private typingUntil = 0;
  private typingTimer: ReturnType<typeof setTimeout> | null = null;
  private onBattery = false;
  private battery?: { removeEventListener: (name: string, fn: () => void) => void };
  private batteryChanged?: () => void;
  private memoryBytes = 0;
  private reduced = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  private readonly visibility = () => this.refreshAnimations();
  private readonly typing = (event: Event) => {
    if (!(event.target instanceof Element) || !event.target.closest('[contenteditable="true"]')) return;
    this.typingUntil = performance.now() + 500;
    if (this.typingTimer) clearTimeout(this.typingTimer);
    this.refreshAnimations();
    this.typingTimer = setTimeout(() => { this.typingTimer = null; this.refreshAnimations(); }, 510);
  };
  private readonly previewApprovalHash?:string;
  constructor(previewApprovalHash?:string) {
    this.previewApprovalHash=previewApprovalHash;
    document.addEventListener('visibilitychange', this.visibility);
    document.addEventListener('beforeinput', this.typing, true);
    this.reduced?.addEventListener('change', this.visibility);
    const getBattery = (navigator as Navigator & { getBattery?: () => Promise<{ charging: boolean; addEventListener: (name: string, fn: () => void) => void; removeEventListener: (name: string, fn: () => void) => void }> }).getBattery;
    if (getBattery) void getBattery.call(navigator).then(battery => {
      if (this.disposed) return;
      this.battery = battery;
      this.batteryChanged = () => { this.onBattery = !battery.charging; this.refreshAnimations(); };
      battery.addEventListener('chargingchange', this.batteryChanged); this.batteryChanged();
    }).catch(() => { /* unavailable battery APIs leave explicit visibility/typing safeguards active */ });
  }
  get stats() { return { instances: [...this.mounted.values()].filter(item => item.loaded && !item.failed).length, memoryBytes: this.memoryBytes, running: this.worker !== null, pending: this.active.size }; }
  private isMounted(item: Mounted) { return !this.disposed && this.mounted.get(item.id) === item; }
  async refreshApprovals() {
    for (const item of this.mounted.values()) {
      const enabled = await isComponentVersionEnabled(item.definition);
      if (!this.isMounted(item)) return;
      if (!enabled) {
        item.generation++;
        if (item.timer) clearTimeout(item.timer); item.timer = null;
        const wasLoaded = item.loaded; item.loaded = false; item.failed = false;
        if (wasLoaded && this.worker) await this.request({ kind: 'remove', id: item.id }).catch(() => {});
        this.fallback(item, `${item.fallback ?? item.definition.manifest.fallback}\nThis code version is disabled. Enable it in component settings to run.`);
      } else if (!item.loaded && item.visible) { item.failed = false; await this.start(item); }
    }
    // A completely disabled note retains no interpreter, even if its views stay mounted.
    if (![...this.mounted.values()].some(item => item.loaded) && this.worker) {
      this.worker.terminate(); this.worker = null; this.workerEpoch++; this.memoryBytes = 0;
    }
  }
  mount(options: ComponentMount): ComponentMountHandle {
    if (this.disposed) throw new Error('Component host is closed.');
    if (this.mounted.has(options.id)) throw new Error('Duplicate component instance ID.');
    const definition = validateComponentDefinition(options.definition);
    componentJSON(options.input, COMPONENT_LIMITS.messageBytes);
    const item: Mounted = { ...options, definition, generation: 0, visible: true, failed: false, loaded: false, pending: false, observer: null, timer: null };
    this.mounted.set(item.id, item);
    this.fallback(item, item.fallback ?? definition.manifest.fallback);
    if (typeof IntersectionObserver !== 'undefined') {
      item.visible = false;
      item.observer = new IntersectionObserver(entries => {
        if (!this.isMounted(item)) return;
        const visible = entries.some(entry => entry.isIntersecting);
        if (visible === item.visible) return;
        item.visible = visible;
        if (!visible && item.loaded) {
          item.loaded = false; item.generation++;
          if (this.worker) void this.request({ kind: 'remove', id: item.id }).catch(() => {});
          for (const candidate of this.mounted.values()) if (candidate.visible && !candidate.loaded && !candidate.failed) void this.start(candidate);
        }
        if (visible && !item.loaded && !item.failed) void this.start(item);
        this.scheduleAnimation(item);
      });
      item.observer.observe(item.element);
    } else void this.start(item);
    return {
      update: input => {
        if (!this.isMounted(item)) return;
        componentJSON(input, COMPONENT_LIMITS.messageBytes);
        item.input = structuredClone(input); item.generation++;
        if (item.loaded && !item.failed && item.visible) void this.render(item);
      },
      destroy: () => this.unmount(item),
      resume: async () => { item.failed = false; await this.start(item); },
    };
  }
  private ensureWorker() {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL('./component-runtime-worker.ts', import.meta.url), { type: 'module', name: 'noted-components' });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data, pending = this.active.get(response.sequence);
      if (!pending) return;
      clearTimeout(pending.timer); this.active.delete(response.sequence);
      try {
        componentJSON(response, COMPONENT_LIMITS.messageBytes);
        const bytes = response.result?.memoryBytes ?? response.memoryBytes;
        if (bytes !== undefined) {
          if (!Number.isSafeInteger(bytes) || bytes > COMPONENT_LIMITS.wasmBytes) throw new Error('Runtime memory attestation failed.');
          this.memoryBytes = bytes;
        }
        if (response.error) pending.reject(new Error(response.error)); else pending.resolve(response);
      } catch (error) { pending.reject(error instanceof Error ? error : new Error('Invalid component response.')); this.failWorker('Malformed component runtime response.'); }
    };
    worker.onerror = () => this.failWorker('Component worker failed. Your saved state is preserved.');
    this.worker = worker; return worker;
  }
  private request(payload: Record<string, unknown>, cold = false): Promise<WorkerResponse> {
    const epoch = this.workerEpoch;
    const perform = () => new Promise<WorkerResponse>((resolve, reject) => {
      if (this.disposed || epoch !== this.workerEpoch || (payload.kind !== 'remove' && !this.mounted.has(String(payload.id)))) { reject(new Error('Component host is closed.')); return; }
      if (payload.kind === 'remove' && !this.worker) { resolve({ sequence: 0, id: String(payload.id), ok: true }); return; }
      const worker = this.ensureWorker(), sequence = ++this.sequence;
      const timer = setTimeout(() => this.failWorker('Component timed out. Your saved state is preserved.'), cold ? 3000 : COMPONENT_LIMITS.watchdogMs);
      this.active.set(sequence, { resolve, reject, timer });
      worker.postMessage({ ...payload, sequence });
    });
    const next = this.chain.then(perform, perform); this.chain = next.catch(() => {}); return next;
  }
  private async start(item: Mounted) {
    if (!this.isMounted(item) || item.failed || item.loaded || !item.visible) return;
    if (!(this.previewApprovalHash ? await componentCodeHash(item.definition)===this.previewApprovalHash : await isComponentVersionEnabled(item.definition))) { if (this.isMounted(item)) this.fallback(item, `${item.fallback ?? item.definition.manifest.fallback}\nThis code version is disabled. Enable it in component settings to run.`); return; }
    if (!this.isMounted(item) || item.loaded || item.failed) return;
    if ([...this.mounted.values()].filter(value => value.loaded).length >= COMPONENT_LIMITS.instances) { this.fallback(item, `${item.fallback ?? item.definition.manifest.fallback}\nEight components are already active.`); return; }
    item.loaded = true;
    try {
      await this.request({ kind: 'load', id: item.id, definition: item.definition }, !this.worker);
      if (!this.isMounted(item)) return;
      await this.render(item); this.scheduleAnimation(item);
    } catch (error) { if (this.isMounted(item)) this.failItem(item, error); }
  }
  private async render(item: Mounted, event?: ComponentEvent) {
    if (!item.loaded || item.failed || !this.isMounted(item)) return;
    const generation = ++item.generation, input = structuredClone(item.input);
    try {
      const response = await this.request({ kind: 'run', id: item.id, input, ...(event ? { event } : {}) });
      if (generation !== item.generation || !this.isMounted(item) || !response.result) return;
      const result = response.result, view = validateComponentView(result.view);
      if (event && event.kind !== 'tick' && JSON.stringify(result.state) !== JSON.stringify(item.input.state)) {
        item.input.state = structuredClone(result.state); item.onState(structuredClone(result.state));
      }
      this.paint(item, view);item.onRender?.();
    } catch (error) { if (this.isMounted(item)) this.failItem(item, error); }
  }
  private paint(item: Mounted, view: ComponentView) {
    const active = document.activeElement instanceof HTMLInputElement && item.element.contains(document.activeElement) ? document.activeElement : null;
    const focusedPath = active?.dataset.componentPath, selection = active ? [active.selectionStart, active.selectionEnd] : null;
    const build = (node: ComponentView, path: string): Element => {
      if (['drawing', 'rect', 'circle', 'line'].includes(node.type)) {
        const element = document.createElementNS('http://www.w3.org/2000/svg', node.type === 'drawing' ? 'svg' : node.type);
        if (node.type === 'drawing') { element.setAttribute('viewBox', `0 0 ${node.width ?? 200} ${node.height ?? 120}`); element.setAttribute('width', String(node.width ?? 200)); element.setAttribute('height', String(node.height ?? 120)); element.setAttribute('role', 'img'); element.setAttribute('aria-label', node.alt ?? 'Component drawing'); }
        for (const key of ['x', 'y', 'x2', 'y2', 'width', 'height'] as const) if (node[key] !== undefined) element.setAttribute(key === 'x' && node.type === 'line' ? 'x1' : key === 'y' && node.type === 'line' ? 'y1' : key, String(node[key]));
        if (node.type === 'circle') { element.setAttribute('cx', String(node.x ?? 0)); element.setAttribute('cy', String(node.y ?? 0)); element.setAttribute('r', String(node.radius ?? 10)); }
        if (node.color) element.setAttribute(node.type === 'line' ? 'stroke' : 'fill', node.color);
        for (const [index, child] of (node.children ?? []).entries()) element.append(build(child, `${path}.${index}`));
        return element;
      }
      const element = document.createElement(node.type === 'button' ? 'button' : node.type === 'input' ? 'input' : node.type === 'toggle' ? 'label' : node.type === 'image' ? 'img' : node.type === 'text' ? 'span' : 'div');
      element.dataset.componentPath = path;
      if (node.text) element.textContent = node.text;
      if (node.color) element.style.color = node.color;
      if (node.background) element.style.backgroundColor = node.background;
      if (node.width !== undefined) element.style.width = `${node.width}px`;
      if (node.height !== undefined) element.style.height = `${node.height}px`;
      element.style.maxWidth = '100%';
      const fire = (value?: string | number | boolean) => { if (node.event && !item.pending) { item.pending = true; void this.render(item, { id: node.event, kind: 'user', ...(value !== undefined ? { value } : {}) }).finally(() => { item.pending = false; }); } };
      if (element instanceof HTMLButtonElement) { element.type = 'button'; element.disabled = Boolean(node.disabled); element.addEventListener('click', () => fire()); }
      if (element instanceof HTMLInputElement) { element.value = String(node.value ?? ''); element.disabled = Boolean(node.disabled); element.setAttribute('aria-label', node.alt ?? node.text ?? 'Component input'); element.maxLength = COMPONENT_LIMITS.textLength; element.addEventListener('change', () => fire(element.value)); }
      if (node.type === 'toggle') { const input = document.createElement('input'); input.type = 'checkbox'; input.checked = Boolean(node.value); input.disabled = Boolean(node.disabled); input.addEventListener('change', () => fire(input.checked)); element.prepend(input); }
      if (element instanceof HTMLImageElement) { element.alt = node.alt ?? ''; if (node.assetId && item.resolveAsset) void item.resolveAsset(node.assetId).then(url => { if (this.mounted.has(item.id) && element.isConnected) element.src = url; }).catch(() => { element.alt = `${node.alt ?? 'Image'} (unavailable)`; }); }
      if (['row', 'column', 'grid'].includes(node.type)) { element.style.display = node.type === 'grid' ? 'grid' : 'flex'; if (node.type === 'grid') element.style.gridTemplateColumns = `repeat(${Math.max(1, Math.floor(node.columns ?? 2))}, minmax(0, 1fr))`; else element.style.flexDirection = node.type === 'row' ? 'row' : 'column'; element.style.gap = `${node.gap ?? 8}px`; element.style.padding = `${node.padding ?? 0}px`; element.style.flexWrap = node.type === 'row' ? 'wrap' : 'nowrap'; }
      for (const [index, child] of (node.children ?? []).entries()) element.append(build(child, `${path}.${index}`));
      return element;
    };
    item.element.replaceChildren(build(view, 'root'));
    if (focusedPath) {
      const input = [...item.element.querySelectorAll<HTMLInputElement>('input[data-component-path]')].find(element => element.dataset.componentPath === focusedPath);
      if (input) { input.focus({ preventScroll: true }); if (selection && selection[0] !== null && selection[1] !== null) input.setSelectionRange(selection[0], selection[1]); }
    }
  }
  private fallback(item: Mounted, message: string) { const node = document.createElement('div'); node.className = 'component-fallback'; node.textContent = message; node.style.whiteSpace = 'pre-wrap'; item.element.replaceChildren(node); }
  private failItem(item: Mounted, error: unknown) { const wasLoaded = item.loaded; item.failed = true; item.loaded = false; if (item.timer) clearTimeout(item.timer); item.timer = null; const message = error instanceof Error ? error.message : 'Component failed.'; this.fallback(item, `${item.fallback ?? item.definition.manifest.fallback}\n${message}`); item.onError?.(message); if (wasLoaded && this.worker) void this.request({ kind: 'remove', id: item.id }).catch(() => {}); }
  private failWorker(message: string) {
    this.worker?.terminate(); this.worker = null; this.memoryBytes = 0; this.workerEpoch++;
    for (const pending of this.active.values()) { clearTimeout(pending.timer); pending.reject(new Error(message)); } this.active.clear();
    for (const item of this.mounted.values()) this.failItem(item, new Error(message));
  }
  private scheduleAnimation(item: Mounted) {
    if (item.timer) clearTimeout(item.timer); item.timer = null;
    if (!this.isMounted(item) || !item.loaded || item.failed || !item.visible || document.hidden || this.onBattery || performance.now() < this.typingUntil || this.reduced?.matches || !item.definition.manifest.animationFps) return;
    item.timer = setTimeout(() => { item.timer = null; void this.render(item, { id: 'tick', kind: 'tick' }).finally(() => this.scheduleAnimation(item)); }, 1000 / item.definition.manifest.animationFps);
  }
  private refreshAnimations() { for (const item of this.mounted.values()) this.scheduleAnimation(item); }
  private unmount(item: Mounted) {
    if (this.mounted.get(item.id) !== item) return;
    const wasLoaded = item.loaded;
    item.generation++; item.loaded = false; item.visible = false; item.observer?.disconnect(); if (item.timer) clearTimeout(item.timer); item.timer = null; this.mounted.delete(item.id);
    if (this.mounted.size === 0) { this.worker?.terminate(); this.worker = null; this.memoryBytes = 0; this.workerEpoch++; for (const pending of this.active.values()) { clearTimeout(pending.timer); pending.reject(new Error('Component host closed.')); } this.active.clear(); }
    else if (wasLoaded && this.worker) void this.request({ kind: 'remove', id: item.id }).catch(() => {});
  }
  destroy() {
    if (this.disposed) return;
    this.disposed = true; for (const item of [...this.mounted.values()]) this.unmount(item);
    this.worker?.terminate(); this.worker = null;
    if (this.typingTimer) clearTimeout(this.typingTimer);
    document.removeEventListener('visibilitychange', this.visibility); document.removeEventListener('beforeinput', this.typing, true);
    this.reduced?.removeEventListener('change', this.visibility);
    if (this.battery && this.batteryChanged) this.battery.removeEventListener('chargingchange', this.batteryChanged);
  }
}

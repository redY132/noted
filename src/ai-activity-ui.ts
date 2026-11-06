export type AIGoal = 'format' | 'schema' | 'component';
export type AIActivity = {
  noteId: string;
  title: string;
  goal: AIGoal;
  requestId: string | null;
  phase: 'starting' | 'running' | 'ready' | 'failed' | 'unknown';
  message: string;
};
/** Render metadata about explicitly requested work. This component never calls a model. */
export function initializeAIActivity(host: HTMLElement, o: { resume(): Promise<void>; dismiss(): void; error(reason: unknown): void }) {
  host.innerHTML = '<section class="ai-job-status" aria-label="AI generation status" hidden><p role="status" aria-live="polite"><strong data-activity-state></strong><span data-activity-note></span><span data-activity-message></span></p><div><button type="button" data-activity-open>Open generation</button><button type="button" data-activity-dismiss aria-label="Dismiss AI job status" title="Dismiss this status. Saved proposals remain available in AI formatting.">Dismiss status</button></div></section>';
  const $ = <T extends HTMLElement>(s: string) => host.querySelector<T>(s)!;
  const root = $('section'), win = host.ownerDocument.defaultView!;
  const text = (selector: string, value: string) => { const element = $(selector); if (element.textContent !== value) element.textContent = value; };
  let state: AIActivity | null = null, busy = false, opening = false, destroyed = false;
  function render() {
    if (destroyed) return;
    root.hidden = !state;
    if (!state) return;
    text('[data-activity-state]', ({ starting: 'Preparing proposal', running: 'Generating proposal', ready: 'Proposal ready', failed: 'Generation needs attention', unknown: 'Generation status unavailable' })[state.phase]);
    text('[data-activity-note]', state.title || 'Untitled');
    const noteTitle = $('[data-activity-note]'); if (noteTitle.title !== (state.title || 'Untitled')) noteTitle.title = state.title || 'Untitled';
    text('[data-activity-message]', state.message);
    text('[data-activity-open]', state.phase === 'ready' ? 'Review proposal' : state.phase === 'failed' ? 'Open AI formatting' : 'Open generation');
    $<HTMLButtonElement>('[data-activity-open]').disabled = busy || opening;
    $('[data-activity-dismiss]').hidden = ['starting', 'running', 'unknown'].includes(state.phase);
    $<HTMLButtonElement>('[data-activity-dismiss]').disabled = busy || opening;
  }
  $('[data-activity-open]').onclick = () => {
    if (!state || busy || opening || host.ownerDocument.querySelector('dialog[open]')) return;
    opening = true; render();
    void o.resume().catch(reason => { if (state) state.message = reason instanceof Error ? reason.message : String(reason); o.error(reason); }).finally(() => { opening = false; render(); });
  };
  $('[data-activity-dismiss]').onclick = () => { if (state && ['ready', 'failed'].includes(state.phase) && !busy && !opening) o.dismiss(); };
  function revealFocused() {
    const focused = host.ownerDocument.activeElement;
    if (destroyed || root.hidden || !focused || !root.contains(focused)) return;
    const bounds = root.getBoundingClientRect(), target = focused.getBoundingClientRect();
    if (target.bottom > bounds.bottom) root.scrollTop += target.bottom - bounds.bottom;
    else if (target.top < bounds.top) root.scrollTop -= bounds.top - target.top;
  }
  const workspace = host.closest<HTMLElement>('.workspace');
  function resize() {
    if (destroyed || root.hidden) return;
    root.toggleAttribute('data-compact', root.clientWidth < 480 || Boolean(workspace && workspace.clientHeight < 420));
    root.toggleAttribute('data-short', Boolean(workspace && workspace.clientHeight < 280));
    revealFocused();
  }
  const observer = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(resize) : null;
  observer?.observe(root); if (workspace) observer?.observe(workspace);
  win.addEventListener('resize', resize); root.addEventListener('focusin', revealFocused);
  return {
    update(value: AIActivity | null, preparing = false) { state = value ? { ...value } : null; busy = preparing; render(); resize(); },
    destroy() { destroyed = true; state = null; observer?.disconnect(); win.removeEventListener('resize', resize); root.removeEventListener('focusin', revealFocused); host.replaceChildren(); },
  };
}

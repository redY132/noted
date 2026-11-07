async page => {
  const input = await page.evaluate(() => window.notedBenchmarkOptions ?? {});
  const options = { workspace: input.fixtureWorkspace, case: input.resourceCase, seconds: input.resourceSeconds, navigationOpen: input.resourceNavigationOpen === true };
  if (!['full', 'components', 'text', 'images', 'mixed'].includes(options.case) || !Number.isInteger(options.seconds) || options.seconds < 20 || options.seconds > 3600) throw new Error('Invalid resource workload');
  const allowed = typeof options.workspace === 'string' && await page.evaluate(async expected => {
    if (!window.__TAURI_INTERNALS__) return false;
    const normalize = value => { let text = String(value).replaceAll('\\', '/'); if (text.startsWith('//?/')) text = text.slice(4); return text.replace(/\/+$/, '').toLowerCase(); };
    const status = await window.__TAURI_INTERNALS__.invoke('workspace_status');
    const policy = await window.__TAURI_INTERNALS__.invoke('agent_access');
    const runner = await window.__TAURI_INTERNALS__.invoke('subscription_status');
    return normalize(status.path) === normalize(expected) && !policy.enabled && !policy.allowHosted && !policy.folderIds.length && !runner.available && runner.authentication === 'disabled';
  }, options.workspace);
  if (!allowed) throw new Error('Exact disposable workspace with the subscription runner disabled is required');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(options => {
    if (window.notedResourceResult) throw new Error('Use a fresh resource-test window');
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    const result = window.notedResourceResult = { phase: 'waiting', stage: 'setup', case: options.case, secondsRequested: options.seconds, scheduledAt: Date.now(), startDelayMs: 10000, switches: 0, edits: 0, restoredEdits: 0, modelCallsRequested: 0 };
    let finishVisibility = () => {};
    const wait = async (predicate, code) => { const end = Date.now() + 20000; while (!predicate()) { if (Date.now() > end) throw new Error(code); await sleep(20); } };
    const open = async name => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', ctrlKey: true, bubbles: true }));
      await wait(() => document.querySelector('.quick-open-dialog')?.open, 'OPEN_DIALOG_TIMEOUT');
      const input = document.querySelector('#quick-open-search'); input.value = name; input.dispatchEvent(new Event('input', { bubbles: true }));
      const row = () => [...document.querySelectorAll('[data-quick-note]:not(:disabled)')].find(button => button.querySelector('strong')?.textContent === name);
      await wait(row, 'SEARCH_TIMEOUT'); row().click();
      await wait(() => document.querySelector('#note-title')?.value === name && !document.querySelector('.quick-open-dialog')?.open, 'OPEN_NOTE_TIMEOUT');
    };
    const workers = { created: 0, active: 0 }, OriginalWorker = window.Worker;
    window.Worker = class extends OriginalWorker {
      constructor(url, settings) { super(url, settings); this.counted = String(url).includes('component-runtime-worker'); this.stopped = false; if (this.counted) { workers.created++; workers.active++; } }
      terminate() { if (this.counted && !this.stopped) { this.stopped = true; workers.active--; } return super.terminate(); }
    };
    const browse = document.querySelector('[data-panel-toggle=navigation]'); if ((browse.getAttribute('aria-expanded') === 'true') !== options.navigationOpen) browse.click();
    // The driver disconnects before this starts. These DOM-driven interactions
    // measure resource ownership; they are not physical-input latency samples.
    setTimeout(() => { void (async () => {
      result.phase = 'preparing'; result.preparationStartedAt = Date.now();
      if (['full', 'components'].includes(options.case)) {
        await open('eight-active-components'); document.querySelector('#view-toggle').click();
        const toggle = document.querySelector('[data-panel-choice=components]'); if (!toggle.checked) toggle.click(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        document.querySelector('#interactive-library').click(); await wait(() => document.querySelector('#component-library-dialog')?.open, 'COMPONENT_DIALOG_TIMEOUT');
        const picker = document.querySelector('[data-component-picker]'); picker.value = 'noted.benchmark@1'; picker.dispatchEvent(new Event('change', { bubbles: true })); document.querySelector('[data-component-enable]').click();
        await wait(() => document.querySelector('[data-component-status]')?.textContent.includes('enabled'), 'COMPONENT_ENABLE_TIMEOUT');
        document.querySelector('#component-library-dialog [data-tool-close]').click(); await wait(() => document.querySelectorAll('.interactive-component-body button').length === 8, 'COMPONENT_READY_TIMEOUT');
        document.querySelector('#view-toggle').click(); if (toggle.checked) toggle.click(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      }
      const text = 'ordinary-100-paragraphs', components = 'eight-active-components';
      const cases = { text: [text, 'long-1000-paragraphs'], images: [text, 'artistic-100-panels'], mixed: [text, 'mixed-free-media-100-panels'], components: [text, components], full: [text, components, 'long-1000-paragraphs', components, 'artistic-100-panels', components, 'mixed-free-media-100-panels', components] };
      result.phase = 'running'; result.startedAt = Date.now(); const until = Date.now() + options.seconds * 1000;
      result.navigation = { requestedOpen: options.navigationOpen, initiallyOpen: browse.getAttribute('aria-expanded') === 'true', initialWritingWidth: Math.round(document.querySelector('.document-scroll').getBoundingClientRect().width) };
      const visibility = result.documentVisibility = { source: 'page-visibility-api', scope: 'workload-and-idle', initiallyHidden: document.hidden, changes: 0, observedMs: 0, hiddenMs: 0 };
      let visibilityAt = performance.now(), hidden = document.hidden;
      const recordVisibility = () => {
        const now = performance.now(), elapsed = now - visibilityAt;
        visibility.observedMs += elapsed; if (hidden) visibility.hiddenMs += elapsed;
        visibilityAt = now; hidden = document.hidden;
      };
      const visibilityChanged = () => { recordVisibility(); visibility.changes++; };
      document.addEventListener('visibilitychange', visibilityChanged);
      finishVisibility = () => {
        recordVisibility(); document.removeEventListener('visibilitychange', visibilityChanged);
        visibility.observedMs = Math.round(visibility.observedMs); visibility.hiddenMs = Math.round(visibility.hiddenMs); visibility.finallyHidden = document.hidden;
      };
      while (Date.now() < until) {
        const name = cases[options.case][result.switches % cases[options.case].length]; result.stage = 'opening'; await open(name);
        if (name === components) await wait(() => document.querySelectorAll('.interactive-component-body button').length === 8, 'COMPONENT_READY_TIMEOUT');
        if (options.case === 'full') {
          result.stage = 'saving'; const revision = () => Number(document.querySelector('#revision-label').textContent.match(/\d+/)?.[0]); const previous = revision();
          const paragraph = document.querySelector('#editor p'), before = paragraph.textContent, editor = document.querySelector('#editor .tiptap');
          editor.focus({ preventScroll: true }); const range = document.createRange(); range.selectNodeContents(paragraph); range.collapse(true); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
          if (!document.execCommand('insertText', false, 'Measured synthetic text for a local memory probe. ')) throw new Error('INPUT_REFUSED');
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }));
          const saved = () => document.querySelector('#save-state').textContent.includes('Saved'); await wait(() => saved() && revision() > previous, 'SAVE_TIMEOUT'); result.edits++;
          result.stage = 'restoring'; const written = revision(); editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true })); document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }));
          await wait(() => document.querySelector('#editor p')?.textContent === before && saved() && revision() > written, 'RESTORE_TIMEOUT'); result.restoredEdits++;
        }
        result.switches++; await sleep(100);
      }
      await open(text); result.workloadFinishedAt = Date.now(); result.phase = 'idle'; await sleep(15000);
      const policy = await window.__TAURI_INTERNALS__.invoke('agent_access'); result.sharingDisabled = !policy.enabled && !policy.allowHosted && !policy.folderIds.length;
      result.navigation.finallyOpen = browse.getAttribute('aria-expanded') === 'true';
      result.componentWorkers = { ...workers }; result.domElements = document.querySelectorAll('*').length; result.stage = 'done';
      result.phase = result.sharingDisabled && workers.active === 0 && result.edits === result.restoredEdits && result.navigation.initiallyOpen === options.navigationOpen && result.navigation.finallyOpen === options.navigationOpen ? 'complete' : 'failed';
    })().catch(error => { result.phase = 'failed'; result.error = error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'RESOURCE_FAILURE'; result.componentWorkers = { ...workers }; }).finally(() => finishVisibility()); }, result.startDelayMs);
  }, options);
  return { started: true, syntheticOnly: true, noModelCalls: true };
}

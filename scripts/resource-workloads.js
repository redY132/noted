async page => {
  const input = await page.evaluate(() => window.notedBenchmarkOptions ?? {});
  const options = { workspace: input.fixtureWorkspace, case: input.resourceCase, seconds: input.resourceSeconds, navigationOpen: input.resourceNavigationOpen === true, navigationSoak: input.navigationSoak === true };
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
    const wait = async (predicate, code) => { const end = Date.now() + 60000; while (!predicate()) { if(result.deadlineAt && Date.now()>result.deadlineAt)throw new Error('SOAK_TIME_LIMIT'); if (Date.now() > end) throw new Error(code); await sleep(20); } };
    const open = async name => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', ctrlKey: true, bubbles: true }));
      await wait(() => document.querySelector('.quick-open-dialog')?.open, 'OPEN_DIALOG_TIMEOUT');
      const input = document.querySelector('#quick-open-search'); input.value = name; input.dispatchEvent(new Event('input', { bubbles: true }));
      const row = () => [...document.querySelectorAll('[data-quick-note]:not(:disabled)')].find(button => button.querySelector('strong')?.textContent === name);
      await wait(row, 'SEARCH_TIMEOUT'); row().click();
      await wait(() => document.querySelector('#note-title')?.value === name && !document.querySelector('.quick-open-dialog')?.open, 'OPEN_NOTE_TIMEOUT');
    };
    const componentState = () => {
      const viewport = document.querySelector('.document-scroll').getBoundingClientRect(), buttons = [...document.querySelectorAll('.interactive-component-body button')].filter(button => button.textContent?.trim() === '+');
      return { instances: document.querySelectorAll('.interactive-component-body').length, renderedButtons: buttons.length, visibleButtons: buttons.filter(button => { const r = button.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.right > viewport.left && r.left < viewport.right && r.bottom > viewport.top && r.top < viewport.bottom; }).length };
    };
    const components = result.componentVisibility = { readiness: options.navigationOpen ? 'visible-subset' : 'eight-visible', observations: 0, minimumVisibleButtons: null, maximumVisibleButtons: 0, maximumRenderedButtons: 0 };
    const readyComponents = async () => {
      await wait(() => { const state = componentState(); components.last = state; return state.instances === 8 && (options.navigationOpen ? state.visibleButtons > 0 : state.visibleButtons === 8); }, 'COMPONENT_READY_TIMEOUT');
      const state = componentState(); components.observations++; components.minimumVisibleButtons = Math.min(components.minimumVisibleButtons ?? state.visibleButtons, state.visibleButtons); components.maximumVisibleButtons = Math.max(components.maximumVisibleButtons, state.visibleButtons); components.maximumRenderedButtons = Math.max(components.maximumRenderedButtons, state.renderedButtons);
    };
    const assetURLs=new Set(),createURL=URL.createObjectURL.bind(URL),revokeURL=URL.revokeObjectURL.bind(URL);if(options.navigationSoak){URL.createObjectURL=blob=>{const url=createURL(blob);if(blob.type.startsWith('image/'))assetURLs.add(url);return url;};URL.revokeObjectURL=url=>{assetURLs.delete(url);revokeURL(url);};}
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
        result.stage = 'enabling-components';
        await open('eight-active-components'); document.querySelector('#view-toggle').click();
        const toggle = document.querySelector('[data-panel-choice=components]'); if (!toggle.checked) toggle.click(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        document.querySelector('#interactive-library').click(); await wait(() => document.querySelector('#component-library-dialog')?.open, 'COMPONENT_DIALOG_TIMEOUT');
        const picker = document.querySelector('[data-component-picker]'); picker.value = 'noted.benchmark@1'; picker.dispatchEvent(new Event('change', { bubbles: true })); document.querySelector('[data-component-enable]').click();
        await wait(() => document.querySelector('[data-component-status]')?.textContent.includes('enabled'), 'COMPONENT_ENABLE_TIMEOUT');
        document.querySelector('#component-library-dialog [data-tool-close]').click();
        document.querySelector('#view-toggle').click(); if (toggle.checked) toggle.click(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        result.stage = 'waiting-for-visible-components'; await readyComponents();
      }
      const text = 'ordinary-100-paragraphs', componentNote = 'eight-active-components';
      const cases = { text: [text, 'long-1000-paragraphs'], images: [text, 'artistic-100-panels'], mixed: [text, 'mixed-free-media-100-panels'], components: [text, componentNote], full: [text, componentNote, 'long-1000-paragraphs', componentNote, 'artistic-100-panels', componentNote, 'mixed-free-media-100-panels', componentNote] };
      result.phase = 'running'; result.startedAt = Date.now(); const until = Date.now() + options.seconds * 1000;if(options.navigationSoak)result.deadlineAt=until;
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
      result.navigationSoak=options.navigationSoak;result.checkpoints=[];
      const checkpoint=async label=>{
        await open(text);if(browse.getAttribute('aria-expanded')==='true')browse.click();
        if(Date.now()+20000>until)throw new Error('SOAK_TIME_LIMIT');await sleep(20000);
        if(workers.active!==0||assetURLs.size!==0)throw new Error('SETTLED_RESOURCE_OWNERSHIP_FAILED');
        result.checkpoint={label,at:Date.now(),switches:result.switches,workers:workers.active,assetURLs:assetURLs.size,domElements:document.querySelectorAll('*').length};
        result.phase='checkpoint';await wait(()=>result.phase!=='checkpoint','CHECKPOINT_COLLECTION_TIMEOUT');
      };
      while (Date.now() < until && (!options.navigationSoak || result.switches<336)) {
        const name = cases[options.case][result.switches % cases[options.case].length]; result.stage = 'opening'; await open(name);
        if (name === componentNote) await readyComponents();
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
        result.switches++;
        if(options.navigationSoak && result.switches%8===0){
          await open(text);const writer=document.querySelector('#editor .tiptap'),before=JSON.stringify(writer.editor.getJSON());
          for(const selector of ['[data-panel-toggle=navigation]','[data-panel-toggle=formatting]']){const b=document.querySelector(selector);b.click();b.click();}
          document.dispatchEvent(new KeyboardEvent('keydown',{key:'f',ctrlKey:true,bubbles:true}));
          const q=document.querySelector('#find-query');q.value='observation';q.dispatchEvent(new Event('input',{bubbles:true}));await sleep(200);
          document.dispatchEvent(new KeyboardEvent('keydown',{key:'f',ctrlKey:true,bubbles:true}));
          document.querySelector('#find-close').click();await sleep(50);
          document.dispatchEvent(new KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true}));await wait(()=>document.querySelector('#url-dialog').open,'URL_DIALOG_TIMEOUT');document.querySelector('#url-cancel').click();await sleep(50);
          document.querySelector('#insert-link').click();await wait(()=>document.querySelector('#link-dialog').open,'NOTE_LINK_DIALOG_TIMEOUT');document.querySelector('#link-search').value='ordinary';document.querySelector('#link-search').dispatchEvent(new Event('input',{bubbles:true}));await sleep(200);document.querySelector('#link-dialog [data-close]').click();
          result.phase='ui';await wait(()=>result.phase!=='ui','UI_COLLECTION_TIMEOUT');
          if(JSON.stringify(writer.editor.getJSON())!==before)throw new Error('DIALOG_CHANGED_CONTENT');
          if([48,144,240,336].includes(result.switches))await checkpoint(result.switches===48?'warm':`block-${(result.switches-48)/96}`);
        }
        await sleep(100);
      }
      if(options.navigationSoak && result.switches!==336)throw new Error('SOAK_INCOMPLETE');
      await open(text); result.workloadFinishedAt = Date.now(); result.phase = 'idle'; await sleep(15000);
      const policy = await window.__TAURI_INTERNALS__.invoke('agent_access'); result.sharingDisabled = !policy.enabled && !policy.allowHosted && !policy.folderIds.length;
      result.navigation.finallyOpen = browse.getAttribute('aria-expanded') === 'true';
      result.componentWorkers = { ...workers }; result.domElements = document.querySelectorAll('*').length; result.stage = 'done';
      result.phase = result.sharingDisabled && workers.active === 0 && result.edits === result.restoredEdits && result.navigation.initiallyOpen === options.navigationOpen && result.navigation.finallyOpen === options.navigationOpen ? 'complete' : 'failed';
    })().catch(error => { result.phase = 'failed'; result.error = error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'RESOURCE_FAILURE'; result.componentWorkers = { ...workers }; }).finally(() => finishVisibility()); }, result.startDelayMs);
  }, options);
  return { started: true, syntheticOnly: true, noModelCalls: true };
}

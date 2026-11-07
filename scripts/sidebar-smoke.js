async page => {
  const native = await page.evaluate(() => Boolean(window.__TAURI_INTERNALS__));
  if (native) {
    const state = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('workspace_status'));
    if (!state.path.includes('noted-sidebar-ui-')) throw new Error('Disposable sidebar workspace required');
  } else if (new URL(page.url()).origin !== 'http://127.0.0.1:1436') throw new Error('Isolated sidebar preview required');
  const fixture = await page.evaluate(() => JSON.parse(localStorage.getItem('noted-sidebar-fixture') || 'null'));
  if (!fixture?.observations || !fixture?.notes) throw new Error('Synthetic sidebar fixture required');
  await page.reload();
  await page.waitForFunction(() => document.querySelectorAll('[data-folder]').length > 1);
  await page.evaluate(async fixture => {
    if (window.__TAURI_INTERNALS__) {
      for (let i = 81; i < 95; i++) await window.__TAURI_INTERNALS__.invoke('set_relation', { a: fixture.notes[i - 1], b: fixture.notes[i], connected: true, dismissed: null, expectedRevision: null, strength: null });
    } else {
      const { api } = await import('/src/api.ts');
      for (let i = 81; i < 95; i++) await api.setRelation(fixture.notes[i - 1], fixture.notes[i], true);
    }
  }, fixture);
  const errors = [], checks = [];
  const record = (name, value) => { if (!value) throw new Error(name); checks.push(name); };
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const settle = () => page.waitForTimeout(220);
  const folder = id => page.locator(`[data-folder="${id}"]`);
  const browse = page.getByRole('button', { name: 'Browse notes', exact: true });
  const ensureOpen = async () => { if (await browse.getAttribute('aria-expanded') !== 'true') await browse.click(); };
  const selectObservations = async () => {
    await ensureOpen(); await folder(fixture.project).click(); await folder(fixture.research).click(); await folder(fixture.observations).click();
    await page.waitForFunction(() => document.querySelector('#list-count')?.textContent === '95'); await settle();
  };
  await page.setViewportSize({ width: 1600, height: 960 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ensureOpen();
  record('one button controls navigation', await page.locator('[data-panel-toggle=notes]').count() === 0);
  await page.locator('#all-notes').click();
  await page.waitForFunction(()=>document.querySelector('#collection-title')?.textContent==='All notes' && document.querySelector('#list-count')?.textContent===document.querySelector('#total-count')?.textContent);
  record('All notes shows the actual workspace collection', true);
  await page.evaluate(() => { window.__sidebarEditor = document.querySelector('#editor .tiptap'); });
  await selectObservations();
  record('nested selection automatically opens notes and graph', await page.locator('#notes-panel').isVisible() && await page.locator('#folder-graph').isVisible());
  record('collection note count is real', await page.locator('#list-count').innerText() === '95');
  const disclosure=page.locator(`[data-folder-expand="${fixture.research}"]`);
  await disclosure.click();
  const collapsed=await folder(fixture.observations).count()===0;
  await disclosure.click();
  record('disclosure toggles a branch without changing its selected collection', collapsed && await folder(fixture.observations).count()===1 && await page.locator('#list-count').innerText()==='95');
  await page.waitForFunction(() => document.querySelectorAll('#folder-graph-canvas line').length > 0);
  record('graph renders actual saved connections', true);
  const shallowWidth = await page.locator('.navigation-tree').evaluate(el => el.getBoundingClientRect().width);
  for (const name of ['Archive','2026','November','Week one']) await page.getByRole('button', { name, exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#list-count')?.textContent === '5'); await settle();
  record('deep hierarchy reveals its leaf notes', true);
  record('hierarchy width grows with the visible depth', await page.locator('.navigation-tree').evaluate(el => el.getBoundingClientRect().width) > shallowWidth);
  await selectObservations();
  const beforeMore = await page.locator('#note-list [data-note]').count();
  await page.locator('#show-more').click();
  await page.waitForFunction(() => document.querySelectorAll('#note-list [data-note]').length === 95);
  record('long lists load the remaining page', beforeMore === 80);
  const target = page.locator('#note-list [data-note]').last(), targetId = await target.getAttribute('data-note');
  await target.hover();
  await page.waitForFunction(id => document.querySelector(`[data-folder-graph-note="${id}"].highlighted`), targetId);
  record('hover highlights a note beyond the graph window', true);
  await target.focus();
  record('keyboard focus highlights the same graph node', await page.locator(`[data-folder-graph-note="${targetId}"]`).evaluate(el => el.classList.contains('highlighted')));
  await page.locator('#folder-graph-refresh').click(); await settle();
  record('graph stays within the API limit', await page.locator('[data-folder-graph-note]').count() <= 60);
  await folder(fixture.empty).click(); await page.waitForFunction(() => document.querySelector('#list-count')?.textContent === '0'); await settle();
  record('empty collection explains the next action', (await page.locator('#note-list').innerText()).includes('Create a note'));
  record('graph stays visible for an empty collection', await page.locator('#folder-graph').isVisible());
  await selectObservations();
  record('notes scroll inside the continuous directory', await page.locator('#note-list').evaluate(el => el.scrollHeight > el.clientHeight));
  record('selected folder branches into its note directory', await page.locator('.directory-branch path').evaluate(el => Boolean(el.getAttribute('d'))));
  const independentScroll = await page.evaluate(() => {
    const list=document.querySelector('#note-list'), graph=document.querySelector('#folder-graph'), writer=document.querySelector('.document-scroll');
    const before=graph.getBoundingClientRect().toJSON(), writerScroll=writer.scrollTop;
    list.scrollTop=200; const after=graph.getBoundingClientRect().toJSON();
    return list.scrollTop>0 && before.x===after.x && before.y===after.y && writer.scrollTop===writerScroll;
  });
  record('scrolling notes leaves the graph and document in place', independentScroll);
  await page.locator('#customize-folder').click();
  record('customization opens the selected folder', await page.locator('[data-folder-picker]').inputValue() === fixture.observations);
  await page.locator('[data-folder-edit-name]').fill('Synthetic observation notebook');
  await page.locator('[data-folder-edit-icon]').selectOption('book');
  await page.locator('[data-folder-save]').click();
  await page.waitForFunction(() => !document.querySelector('[data-library=folders]').open);
  record('rename and icon keep folder identity', (await folder(fixture.observations).innerText()).includes('Synthetic observation notebook'));
  await page.locator('#customize-folder').click();
  record('icon preference persists in the customization form', await page.locator('[data-folder-edit-icon]').inputValue() === 'book');
  await page.locator('[data-folder-edit-parent]').selectOption(fixture.long); await page.locator('[data-folder-save]').click();
  await page.waitForFunction(() => !document.querySelector('[data-library=folders]').open);
  record('folder move preserves its notes', await page.locator('#list-count').innerText() === '95');
  await page.locator('#customize-folder').click(); await page.locator('[data-folder-edit-parent]').selectOption(fixture.research); await page.locator('[data-folder-save]').click();
  await page.waitForFunction(() => !document.querySelector('[data-library=folders]').open);
  await page.locator('#search').fill('no synthetic note matches this phrase');
  await page.waitForFunction(() => document.querySelector('#list-count')?.textContent === '0');
  record('search has an empty result state', (await page.locator('#note-list').innerText()).includes('No matching notes'));
  await page.locator('#search').fill(''); await page.waitForFunction(() => document.querySelector('#list-count')?.textContent === '95');
  const profiles = [];
  for (const mode of ['light', 'dark']) {
    await page.locator('#appearance-toggle').click(); await page.locator('#appearance-mode').selectOption(mode); await page.keyboard.press('Escape');
    for (const [width,height] of [[1600,960],[1200,800],[960,640],[800,560],[799,600],[699,960],[390,840]]) {
      await page.setViewportSize({ width, height }); await settle();
      const geometry = await page.evaluate(() => {
        const visible = el => !el.hidden && el.getClientRects().length > 0;
        const surfaces = ['navigation-panel', 'notes-panel', 'folder-graph'].map(id => document.getElementById(id)).filter(visible).map(el => { const r = el.getBoundingClientRect(); return { id: el.id, left: r.left, right: r.right, top: r.top, bottom: r.bottom }; });
        const workspace = document.querySelector('.workspace').getBoundingClientRect().toJSON();
        const tree = document.querySelector('.navigation-tree').getBoundingClientRect().toJSON();
        const panels = [...document.querySelectorAll('.dynamic-navigation,.navigation-tree,.collection-directory,.folder-graph')].map(el => {const s=getComputedStyle(el);return {id:el.id,border:parseFloat(s.borderTopWidth),shadow:s.boxShadow,background:s.backgroundColor};});
        return { surfaces, workspace, tree, panels, overflow: document.documentElement.scrollWidth > innerWidth, width: innerWidth };
      });
      record(`${mode} ${width}px has no horizontal overflow`, !geometry.overflow && geometry.surfaces.every(r => r.left >= 0 && r.right <= width + 1));
      record(`${mode} ${width}px retains the selected folder in the directory viewport`, await folder(fixture.observations).evaluate(el=>{
        const r=el.getBoundingClientRect(),clip=document.querySelector('#folders').getBoundingClientRect(),tree=document.querySelector('.navigation-tree').getBoundingClientRect();
        return r.top>=Math.max(clip.top,tree.top)-1 && r.bottom<=Math.min(clip.bottom,tree.bottom)+1 && el.title===el.textContent.trim();
      }));
      const nav = geometry.surfaces.find(r => r.id === 'navigation-panel'), notes = geometry.surfaces.find(r => r.id === 'notes-panel'), graph = geometry.surfaces.find(r => r.id === 'folder-graph');
      record(`${mode} ${width}px has no boxed navigation regions`, geometry.panels.every(p=>p.border===0 && p.shadow==='none') && geometry.panels.slice(1).every(p=>p.background==='rgba(0, 0, 0, 0)'));
      if (width >= 800) {
        record(`${mode} ${width}px pushes the document right without overlap`, nav.left === 0 && geometry.workspace.left >= nav.right - 1 && geometry.workspace.width >= 279);
        record(`${mode} ${width}px gives the graph the largest right-hand area`, graph.left >= notes.right - 1 && graph.right - graph.left > notes.right - notes.left && graph.right - graph.left > geometry.tree.width);
        record(`${mode} ${width}px keeps docked areas in the window`, geometry.surfaces.every(r => r.top >= 0 && r.bottom <= height + 1));
      } else record(`${mode} ${width}px pushes the document below and keeps the graph beside notes`, geometry.workspace.top >= nav.bottom - 1 && graph.left >= notes.right - 1);
      profiles.push({ mode, width, height, geometry });
      if (width === 390) {
        await page.locator('#navigation-back').click();
        record(`${mode} narrow back action returns to folders`, await folder(fixture.observations).evaluate(el => el === document.activeElement));
        await folder(fixture.observations).click(); await settle();
      }
      if (width === 1600 || width === 800 || width === 390) await page.screenshot({ path: `output/playwright/sidebar-${mode}-${width}.png` });
    }
  }
  await page.setViewportSize({ width: 1200, height: 900 }); await settle();
  await page.locator('#navigation-close').click();
  record('one close removes the whole panel from interaction', await browse.getAttribute('aria-expanded') === 'false' && await page.locator('#navigation-panel').evaluate(el => el.inert));
  record('closing navigation restores document width', await page.locator('.workspace').evaluate(el=>el.getBoundingClientRect().left === 0 && el.getBoundingClientRect().width === innerWidth));
  await browse.click(); await settle();
  record('reopening restores the selected collection popup', (await page.locator('#collection-title').innerText()).includes('Synthetic observation notebook') && await page.locator('#notes-panel').isVisible());
  await page.keyboard.press('F8');
  record('focus mode hides navigation', await browse.getAttribute('aria-expanded') === 'false');
  await page.keyboard.press('F8');
  record('leaving focus mode restores navigation', await browse.getAttribute('aria-expanded') === 'true');
  await page.locator('#search').focus(); await page.keyboard.press('Escape');
  record('Escape closes navigation and restores its button focus', await browse.evaluate(el => el === document.activeElement) && await browse.getAttribute('aria-expanded') === 'false');
  await page.keyboard.press('/'); await settle();
  record('search shortcut reopens and focuses the popup', await page.locator('#search').evaluate(el => el === document.activeElement));
  record('navigation keeps the original editor mounted', await page.evaluate(() => window.__sidebarEditor === document.querySelector('#editor .tiptap')));
  await page.emulateMedia({ reducedMotion:'no-preference' });
  await browse.click(); await page.waitForTimeout(230); await browse.click();
  const motionOverlap=[];
  for(let i=0;i<5;i++){motionOverlap.push(await page.evaluate(()=>document.querySelector('#navigation-panel').getBoundingClientRect().right>document.querySelector('.workspace').getBoundingClientRect().left+1));await page.waitForTimeout(45);}
  record('opening motion reserves space instead of covering the document', motionOverlap.every(value=>!value));
  await page.emulateMedia({ reducedMotion:'reduce' });
  const first = page.locator('#note-list [data-note]').first(), openedId = await first.getAttribute('data-note'); await first.click();
  await page.waitForFunction(id => document.querySelector('#header-connection-handle button')?.dataset.connectSource === id, openedId);
  record('opening a note keeps the directory and graph visible', await page.locator('#notes-panel').isVisible() && await page.locator('#folder-graph').isVisible());
  const editor=page.locator('#editor .tiptap'), originalText=await editor.innerText();
  await editor.focus(); await page.keyboard.press('Control+End'); await page.keyboard.type(' Synthetic sidebar draft.');
  await page.keyboard.press('F8'); await page.keyboard.press('F8'); await page.keyboard.press('Control+z');
  record('writing Undo survives navigation visibility changes', await editor.innerText()===originalText && await page.locator('#folder-graph').isVisible());
  await ensureOpen(); await folder(fixture.observations).click(); await settle();
  const graphButton = page.locator('[data-folder-graph-note]').last(), graphNoteId = await graphButton.getAttribute('data-folder-graph-note');
  await graphButton.hover(); await page.locator('#folder-graph-refresh').hover();
  record('leaving a graph node restores the open-note highlight', await page.locator(`[data-folder-graph-note="${openedId}"]`).evaluate(el => el.classList.contains('highlighted')));
  await graphButton.focus(); await graphButton.hover(); await page.locator('#folder-graph-refresh').hover();
  record('pointer exit preserves a keyboard-focused graph note', await graphButton.evaluate(el => el.classList.contains('highlighted')));
  await page.locator('#folder-graph-refresh').focus();
  record('focus exit clears the old graph target', await page.locator(`[data-folder-graph-note="${openedId}"]`).evaluate(el => el.classList.contains('highlighted')));
  await graphButton.focus();
  const unchangedRefresh = await page.evaluate(async () => {
    const nodes = document.querySelector('#folder-graph-nodes'), focused = document.activeElement;
    let additions = 0, focusEvents = 0, repeatedSummaryWrites = 0;
    const observer = new MutationObserver(records => { for (const record of records) additions += record.addedNodes.length; });
    const statusObserver = new MutationObserver(records => { repeatedSummaryWrites += records.length; });
    const onFocus = () => { focusEvents++; };
    observer.observe(nodes, { childList: true }); nodes.addEventListener('focusin', onFocus);
    try {
      document.querySelector('#folder-graph-refresh').click();
      await new Promise(resolve => setTimeout(resolve, 220));
      statusObserver.observe(document.querySelector('#folder-graph-summary'), { childList: true });
      window.dispatchEvent(new Event('resize')); await new Promise(resolve => setTimeout(resolve, 100));
      return { additions, focusEvents, repeatedSummaryWrites, retained: document.activeElement === focused };
    } finally { observer.disconnect(); statusObserver.disconnect(); nodes.removeEventListener('focusin', onFocus); }
  });
  record('unchanged connection refresh retains controls without repeated focus', unchangedRefresh.additions === 0 && unchangedRefresh.focusEvents === 0 && unchangedRefresh.retained);
  record('layout-only updates keep the unchanged graph summary quiet', unchangedRefresh.repeatedSummaryWrites === 0);
  await page.keyboard.press('Enter');
  await page.waitForFunction(id => document.querySelector('#header-connection-handle button')?.dataset.connectSource === id, graphNoteId);
  record('graph nodes open the chosen note by keyboard without hiding navigation', await page.locator('#folder-graph').isVisible());
  await ensureOpen(); await folder(fixture.observations).click(); await settle();
  await page.locator('#note-list .connection-handle').first().click(); await page.waitForFunction(() => !document.querySelector('#connections-panel').hidden);
  record('existing detailed connection controls still open', true); await page.locator('#connections-close').click();
  const createdFolderName = `Synthetic created collection ${Date.now()}`;
  await page.locator('#add-folder').click(); await page.locator('#folder-name').fill(createdFolderName); await page.locator('#folder-form button[type=submit]').click();
  await page.waitForFunction(() => !document.querySelector('#folder-dialog').open);
  record('new folder form creates a child', await page.getByRole('button', {name:createdFolderName,exact:true}).count() === 1);
  await page.getByRole('button', {name:createdFolderName,exact:true}).click(); await settle();
  await page.locator('#collection-new-note').click(); await page.waitForFunction(() => document.querySelector('#note-title')?.value === 'Untitled');
  record('new note action focuses writing and preserves the graph', await page.locator('#note-title').evaluate(el=>el===document.activeElement) && await page.locator('#folder-graph').isVisible());
  await page.reload(); await page.waitForFunction(() => document.querySelectorAll('[data-folder]').length > 1); await selectObservations();
  await page.locator('#customize-folder').click();
  record('folder icon survives app reload', await page.locator('[data-folder-edit-icon]').inputValue() === 'book'); await page.keyboard.press('Escape');
  await page.locator('#manage-folders').click(); await page.waitForFunction(()=>document.querySelector('[data-library=folders]').open);
  record('Manage folders opens the existing library editor', true); await page.locator('[data-library=folders] [data-library-close]').click();
  await page.locator('#open-trash').click(); await page.waitForFunction(() => document.querySelector('[data-library=trash]').open);
  record('Trash remains reachable', true); await page.locator('[data-library=trash] [data-library-close]').click();
  await page.locator('#open-review').click(); await page.waitForFunction(() => document.querySelector('[data-library=review]').open);
  record('daily review remains reachable', true); await page.keyboard.press('Escape');
  await page.locator('#workspace-info').click(); await page.waitForFunction(() => document.querySelector('#workspace-dialog').open);
  record('workspace details remain reachable', true); await page.locator('[data-close=workspace-dialog]').click();
  await page.locator('#daily-note').click(); await page.waitForFunction(() => document.querySelector('#note-title')?.value.includes(','));
  record('daily note action preserves the graph', await page.locator('#folder-graph').isVisible());
  if (native) {
    await page.locator('#open-agent').click(); await page.waitForFunction(() => document.querySelector('[data-library=agent]').open);
    record('agent settings remain reachable without enabling access', !await page.locator('[data-agent-enabled]').isChecked() && !await page.locator('[data-agent-hosted]').isChecked());
    await page.keyboard.press('Escape');
  }
  record('no uncaught browser errors', errors.length === 0);
  return { passed: true, syntheticOnly: true, native, checks, profiles, errors };
}

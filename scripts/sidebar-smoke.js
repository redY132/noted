async page => {
  const native = await page.evaluate(() => Boolean(window.__TAURI_INTERNALS__));
  if (native) {
    const state = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('workspace_status'));
    if (!state.path.includes('noted-sidebar-ui-')) throw new Error('Disposable sidebar workspace required');
  } else if (new URL(page.url()).origin !== 'http://127.0.0.1:1436') throw new Error('Isolated sidebar preview required');
  const fixture = await page.evaluate(() => JSON.parse(localStorage.getItem('noted-sidebar-fixture') || 'null'));
  if (!fixture?.observations || !fixture?.notes) throw new Error('Synthetic sidebar fixture required');
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
  await page.evaluate(() => { window.__sidebarEditor = document.querySelector('#editor .tiptap'); });
  await selectObservations();
  record('nested selection automatically opens notes and graph', await page.locator('#notes-panel').isVisible() && await page.locator('#folder-graph').isVisible());
  record('collection note count is real', await page.locator('#list-count').innerText() === '95');
  await page.waitForFunction(() => document.querySelectorAll('#folder-graph-canvas line').length > 0);
  record('graph renders actual saved connections', true);
  const shallowWidth = await page.locator('#navigation-panel').evaluate(el => el.getBoundingClientRect().width);
  for (const name of ['Archive','2026','November','Week one']) await page.getByRole('button', { name, exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#list-count')?.textContent === '5'); await settle();
  record('deep hierarchy reveals its leaf notes', true);
  record('hierarchy width grows with the visible depth', await page.locator('#navigation-panel').evaluate(el => el.getBoundingClientRect().width) > shallowWidth);
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
  const emptyHeight = await page.locator('#notes-panel').evaluate(el => el.getBoundingClientRect().height);
  await selectObservations();
  record('popup height adapts to its contents', await page.locator('#notes-panel').evaluate(el => el.getBoundingClientRect().height) > emptyHeight + 80);
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
    for (const [width,height] of [[1600,960],[1200,800],[960,640],[800,560],[699,960],[390,840]]) {
      await page.setViewportSize({ width, height }); await settle();
      const geometry = await page.evaluate(() => {
        const visible = el => !el.hidden && el.getClientRects().length > 0;
        const surfaces = ['navigation-panel', 'notes-panel', 'folder-graph'].map(id => document.getElementById(id)).filter(visible).map(el => { const r = el.getBoundingClientRect(); return { id: el.id, left: r.left, right: r.right, top: r.top, bottom: r.bottom }; });
        return { surfaces, overflow: document.documentElement.scrollWidth > innerWidth, width: innerWidth };
      });
      record(`${mode} ${width}px has no horizontal overflow`, !geometry.overflow && geometry.surfaces.every(r => r.left >= 0 && r.right <= width + 1));
      if (width >= 700) record(`${mode} ${width}px floating surfaces stay in the window`, geometry.surfaces.every(r => r.top >= 48 && r.bottom <= height + 1));
      else record(`${mode} ${width}px keeps the selected note popup in view`, geometry.surfaces.find(r => r.id === 'notes-panel').top >= 58 && geometry.surfaces.find(r => r.id === 'notes-panel').top < 112);
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
  const first = page.locator('#note-list [data-note]').first(), openedId = await first.getAttribute('data-note'); await first.click();
  await page.waitForFunction(id => document.querySelector('#header-connection-handle button')?.dataset.connectSource === id, openedId);
  record('opening a note returns the popup space to writing', !await page.locator('#notes-panel').isVisible());
  await ensureOpen(); await folder(fixture.observations).click(); await settle();
  const graphButton = page.locator('[data-folder-graph-note]').last(), graphNoteId = await graphButton.getAttribute('data-folder-graph-note');
  await graphButton.focus(); await page.keyboard.press('Enter');
  await page.waitForFunction(id => document.querySelector('#header-connection-handle button')?.dataset.connectSource === id, graphNoteId);
  record('graph nodes open the chosen note by keyboard', !await page.locator('#notes-panel').isVisible());
  await ensureOpen(); await folder(fixture.observations).click(); await settle();
  await page.locator('#note-list .connection-handle').first().click(); await page.waitForFunction(() => !document.querySelector('#connections-panel').hidden);
  record('existing detailed connection controls still open', true); await page.locator('#connections-close').click();
  const createdFolderName = `Synthetic created collection ${Date.now()}`;
  await page.locator('#add-folder').click(); await page.locator('#folder-name').fill(createdFolderName); await page.locator('#folder-form button[type=submit]').click();
  await page.waitForFunction(() => !document.querySelector('#folder-dialog').open);
  record('new folder form creates a child', await page.getByRole('button', {name:createdFolderName,exact:true}).count() === 1);
  await page.getByRole('button', {name:createdFolderName,exact:true}).click(); await settle();
  await page.locator('#collection-new-note').click(); await page.waitForFunction(() => document.querySelector('#note-title')?.value === 'Untitled');
  record('new note action returns focus to writing', !await page.locator('#notes-panel').isVisible());
  await page.reload(); await page.waitForFunction(() => document.querySelectorAll('[data-folder]').length > 1); await selectObservations();
  await page.locator('#customize-folder').click();
  record('folder icon survives app reload', await page.locator('[data-folder-edit-icon]').inputValue() === 'book'); await page.keyboard.press('Escape');
  await page.locator('#open-trash').click(); await page.waitForFunction(() => document.querySelector('[data-library=trash]').open);
  record('Trash remains reachable', true); await page.locator('[data-library=trash] [data-library-close]').click();
  await page.locator('#open-review').click(); await page.waitForFunction(() => document.querySelector('[data-library=review]').open);
  record('daily review remains reachable', true); await page.keyboard.press('Escape');
  await page.locator('#workspace-info').click(); await page.waitForFunction(() => document.querySelector('#workspace-dialog').open);
  record('workspace details remain reachable', true); await page.locator('[data-close=workspace-dialog]').click();
  await page.locator('#daily-note').click(); await page.waitForFunction(() => !document.querySelector('#notes-panel').getClientRects().length);
  record('daily note action returns to writing', true);
  if (native) {
    await page.locator('#open-agent').click(); await page.waitForFunction(() => document.querySelector('[data-library=agent]').open);
    record('agent settings remain reachable without enabling access', !await page.locator('[data-agent-enabled]').isChecked() && !await page.locator('[data-agent-hosted]').isChecked());
    await page.keyboard.press('Escape');
  }
  record('no uncaught browser errors', errors.length === 0);
  return { passed: true, syntheticOnly: true, native, checks, profiles, errors };
}

async page => {
  if (new URL(page.url()).origin !== 'http://127.0.0.1:1436' || await page.evaluate(() => Boolean(window.__TAURI_INTERNALS__))) throw new Error('Isolated synthetic preview required');
  const fixture = await page.evaluate(() => JSON.parse(localStorage.getItem('noted-sidebar-fixture') || 'null'));
  if (!fixture?.notes?.length) throw new Error('Synthetic fixture required');
  await page.reload(); await page.waitForFunction(() => document.querySelector('#note-title')?.value);
  const checks = [], record = (name, value) => { if (!value) throw new Error(name); checks.push(name); };
  await page.evaluate(async () => { const { api } = await import('/src/api.ts'); window.__workflowOriginalPage = api.pageNotes; window.__workflowOriginalLoad = api.load; window.__workflowOriginalStatus = api.status; });
  try {
    await page.evaluate(async () => { const { api } = await import('/src/api.ts'); api.pageNotes = async () => { throw new Error('Synthetic search failure'); }; });
    await page.keyboard.press('Control+p');
    await page.locator('[data-quick-retry]:not([hidden])').waitFor();
    record('failed search exposes an actionable retry', (await page.locator('#quick-open-status').innerText()).includes('could not be searched'));
    await page.evaluate(async () => { const { api } = await import('/src/api.ts'); api.pageNotes = window.__workflowOriginalPage; });
    await page.locator('[data-quick-retry]').click(); await page.waitForFunction(() => document.querySelectorAll('[data-quick-note]').length > 0);
    record('retry recovers the saved-note results', true);
    await page.evaluate(async () => {
      const { api } = await import('/src/api.ts');
      window.__workflowOldPage = await window.__workflowOriginalPage('', undefined, 0, 40);
      api.pageNotes = (...args) => args[0] === 'sprint-delayed-query' ? new Promise(resolve => { window.__workflowRelease = () => resolve(window.__workflowOldPage); }) : window.__workflowOriginalPage(...args);
    });
    await page.locator('#quick-open-search').fill('sprint-delayed-query');
    await page.waitForFunction(() => Boolean(window.__workflowRelease));
    record('delayed search has an announced loading state', await page.locator('[data-quick-results]').getAttribute('aria-busy') === 'true');
    await page.locator('#quick-open-search').fill('trail'); await page.locator(`[data-quick-note="${fixture.notes[0]}"]`).waitFor();
    await page.evaluate(() => window.__workflowRelease()); await page.waitForTimeout(40);
    record('a delayed old query cannot replace the new result', await page.locator('[data-quick-note]').count() === 1);
    await page.keyboard.press('Escape');
    await page.evaluate(async () => { const { api } = await import('/src/api.ts'); api.pageNotes = async () => ({ items: [], nextCursor: null, total: 0 }); api.status = async () => ({ indexing: true }); });
    await page.keyboard.press('Control+p'); await page.waitForFunction(() => document.querySelector('#quick-open-status')?.textContent.includes('index is updating'));
    record('index startup is not presented as lost notes', !(await page.locator('#quick-open-status').innerText()).includes('No saved notes'));
    await page.evaluate(async () => { const { api } = await import('/src/api.ts'); api.pageNotes = window.__workflowOriginalPage; api.status = window.__workflowOriginalStatus; });
    await page.locator('[data-quick-retry]').click(); await page.waitForFunction(() => document.querySelectorAll('[data-quick-note]').length > 0);
    record('index refresh recovers actual results', true);
    await page.keyboard.press('Escape');
    const before = await page.locator('#header-connection-handle button').getAttribute('data-connect-source');
    const target = before === fixture.notes[0] ? fixture.notes[104] : fixture.notes[0], query = target === fixture.notes[0] ? 'trail' : 'Synthetic observation 105';
    await page.evaluate(async target => { const { api } = await import('/src/api.ts'); api.load = id => id === target ? Promise.reject(new Error('Synthetic note-open failure')) : window.__workflowOriginalLoad(id); }, target);
    await page.keyboard.press('Control+p'); await page.locator('#quick-open-search').fill(query); await page.locator(`[data-quick-note="${target}"]`).click();
    await page.waitForFunction(() => document.querySelector('#quick-open-status')?.textContent.includes('draft is preserved'));
    record('failed opening keeps the current note and the picker available', await page.locator('#header-connection-handle button').getAttribute('data-connect-source') === before && await page.locator('.quick-open-dialog').isVisible());
    await page.keyboard.press('Escape'); await page.locator('#dismiss-error').click();
  } finally {
    await page.evaluate(async () => { const { api } = await import('/src/api.ts'); api.pageNotes = window.__workflowOriginalPage; api.load = window.__workflowOriginalLoad; api.status = window.__workflowOriginalStatus; });
  }
  return { passed: true, syntheticOnly: true, previewFaultInjection: true, checks };
}

async page => {
  const expected = await page.evaluate(() => window.notedBenchmarkOptions?.fixtureWorkspace);
  const allowed = typeof expected === 'string' && await page.evaluate(async expected => {
    if (!window.__TAURI_INTERNALS__) return false;
    const normalize = value => { let text = String(value).replaceAll('\\', '/'); if (text.startsWith('//?/')) text = text.slice(4); return text.replace(/\/+$/, '').toLowerCase(); };
    const status = await window.__TAURI_INTERNALS__.invoke('workspace_status');
    const policy = await window.__TAURI_INTERNALS__.invoke('agent_access');
    const runner = await window.__TAURI_INTERNALS__.invoke('subscription_status');
    return normalize(status.path) === normalize(expected) && !policy.enabled && !policy.allowHosted && !policy.folderIds.length && !runner.available && runner.authentication === 'disabled';
  }, expected);
  if (!allowed) throw new Error('Exact disposable media fixture with the native runner disabled is required');
  const cdp = await page.context().newCDPSession(page), checks = [], samples = [];
  let stage = 'warm media navigation';
  const record = (name, okay) => { if (!okay) throw new Error(JSON.stringify({ check: name, samples })); checks.push(name); };
  const stats = async label => {
    await cdp.send('HeapProfiler.collectGarbage'); await cdp.send('HeapProfiler.collectGarbage');
    return { label, ...await cdp.send('Memory.getDOMCounters') };
  };
  const open = async name => {
    await page.keyboard.press('Control+p'); await page.locator('#quick-open-search').fill(name);
    await page.locator('[data-quick-note]').filter({ hasText: name }).click();
    await page.waitForFunction(name => document.querySelector('#note-title')?.value === name && !document.querySelector('.quick-open-dialog')?.open, name);
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.quick-open-dialog')).display === 'none');
  };
  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await open('ordinary-100-paragraphs'); samples.push(await stats('baseline'));
    for (let cycle = 0; cycle < 12; cycle++) {
      await open(cycle % 2 ? 'mixed-free-media-100-panels' : 'artistic-100-panels');
      const image = page.locator('.local-image img').first();
      await image.evaluate(image => image.scrollIntoView({ block: 'center', inline: 'center' }));
      await page.waitForFunction(() => { const image = document.querySelector('.local-image img'); return image?.naturalWidth > 0 && image?.getAttribute('src')?.startsWith('blob:'); });
      await open('ordinary-100-paragraphs');
      if (cycle === 3 || cycle === 7 || cycle === 11) samples.push(await stats(`after ${cycle + 1} media visits`));
    }
    const baseline = samples[0], warm = samples[1];
    record('image navigation leaves no media in the current text note', await page.locator('.local-image').count() === 0);
    // This instrumented runtime retains one warm media tree. Bound that
    // allowance and separately reject growth across subsequent checkpoints.
    record('media DOM remains within one bounded warm-tree allowance', samples.slice(1).every(sample => sample.nodes <= baseline.nodes + 6000));
    record('media listeners remain within one bounded warm-tree allowance', samples.slice(1).every(sample => sample.jsEventListeners <= baseline.jsEventListeners + 450));
    record('media DOM does not keep growing after warmup', samples.slice(2).every(sample => sample.nodes <= warm.nodes + 500));
    record('media listeners do not keep growing after warmup', samples.slice(2).every(sample => sample.jsEventListeners <= warm.jsEventListeners + 25));
    record('navigation does not leave component workers', page.workers().length === 0);
    stage = 'distant image'; await open('artistic-100-panels');
    const last = page.locator('.local-image img').last(); await page.locator('.local-image').last().evaluate(figure => figure.scrollIntoView({ block: 'center', inline: 'center' }));
    await page.waitForFunction(() => [...document.querySelectorAll('.local-image img')].at(-1)?.naturalWidth > 0);
    record('scrolling to a distant image loads its local asset', await last.evaluate(image => image.getAttribute('src')?.startsWith('blob:')));
    await page.screenshot({ path: 'output/playwright/media-lifetime-local-image.png' });
    stage = 'GIF loading'; await open('mixed-free-media-100-panels');
    await page.locator('#view-toggle').click(); await page.locator('[data-panel-choice=components]').setChecked(true); await page.keyboard.press('Escape');
    const gif = page.locator('.local-image img').nth(1); await page.locator('.local-image').nth(1).evaluate(figure => figure.scrollIntoView({ block: 'center', inline: 'center' }));
    await page.waitForFunction(() => document.querySelectorAll('.local-image img')[1]?.dataset.gifPlaying === 'true');
    stage = 'GIF pause'; await page.locator('#motion-control').click();
    await page.waitForFunction(() => document.querySelectorAll('.local-image img')[1]?.dataset.gifPlaying === 'false');
    record('pausing motion replaces the visible GIF with a static poster', await gif.evaluate(image => image.getAttribute('src')?.startsWith('data:image/png')));
    stage = 'GIF resume'; await page.locator('#motion-control').click();
    await page.waitForFunction(() => document.querySelectorAll('.local-image img')[1]?.dataset.gifPlaying === 'true');
    record('resuming motion restores the local GIF source', await gif.evaluate(image => image.getAttribute('src')?.startsWith('blob:')));
    await page.screenshot({ path: 'output/playwright/media-lifetime-local-gif.png' });
    await open('ordinary-100-paragraphs');
    const policy = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('agent_access'));
    record('local and hosted sharing remain disabled', !policy.enabled && !policy.allowHosted && !policy.folderIds.length);
    return { passed: true, syntheticOnly: true, noGenerationRequested: true, checks, samples, forcedGCDiagnostic: true, referenceCertified: false };
  } catch (error) {
    const media = await page.evaluate(() => ({ visibility: document.visibilityState, motion: document.querySelector('#motion-control')?.getAttribute('aria-pressed'), images: [...document.querySelectorAll('.local-image img')].map(image => ({ width: image.naturalWidth, playing: image.dataset.gifPlaying, source: image.getAttribute('src')?.split(':')[0] ?? null, connected: image.isConnected })) }));
    throw new Error(JSON.stringify({ stage, checks, samples, media, error: String(error) }));
  } finally { await cdp.detach(); }
}

/** Playwright CLI run-code on the disposable /output/runtime-harness.html at 1431. */
async (page) => {
  await page.goto('http://127.0.0.1:1431/output/runtime-harness.html');
  const external = [];
  page.context().on('request', request => { if (!['127.0.0.1', 'localhost'].includes(new URL(request.url()).hostname)) external.push(request.url()); });
  await page.waitForFunction(() => window.ready === true);
  const baseline = await page.evaluate(async () => {
    localStorage.clear();
    const { ComponentRuntimeHost, counterComponent, enableComponentVersion } = window.runtimeModules;
    const host = new ComponentRuntimeHost(); window.componentHost = host; window.componentHandles = [];
    window.componentWrites = [];
    const element = document.createElement('div'); element.id = 'widget0'; element.className = 'widget'; document.querySelector('#widgets').append(element);
    const handle = host.mount({ id: 'counter0', element, definition: counterComponent, input: { properties: {}, state: {}, bindings: {} }, onState: state => window.componentWrites.push(state) });
    window.componentHandles.push(handle);
    await new Promise(resolve => setTimeout(resolve, 50));
    if (host.stats.running) throw new Error('Disabled source created a worker.');
    const started = performance.now();
    await enableComponentVersion(counterComponent); await host.refreshApprovals();
    return { coldStartupMs: performance.now() - started, disabledVersionPassed: true };
  });
  await page.waitForFunction(() => document.querySelector('#widget0')?.textContent.includes('Count: 0'));
  await page.evaluate(() => {
    const { counterComponent } = window.runtimeModules;
    for (let index = 1; index < 9; index++) {
      const element = document.createElement('div'); element.id = `widget${index}`; element.className = 'widget'; document.querySelector('#widgets').append(element);
      window.componentHandles.push(window.componentHost.mount({ id: `counter${index}`, element, definition: counterComponent, input: { properties: {}, state: {}, bindings: {} }, onState: state => window.componentWrites.push(state) }));
    }
  });
  await page.waitForFunction(() => window.componentHost.stats.instances === 8);
  await page.waitForFunction(() => [...document.querySelectorAll('.widget')].some(element => element.textContent.includes('Eight components')));
  await page.locator('#widget0 button').last().click();
  await page.waitForFunction(() => window.componentWrites[0]?.count === 1);
  const eight = await page.evaluate(() => ({ ...window.componentHost.stats }));
  // Remove the overflow probe before replacing contexts: viewport changes may otherwise admit it.
  await page.evaluate(() => { window.componentHandles[8].destroy(); document.querySelector('#widget8').remove(); });
  if (eight.memoryBytes > 64 * 1024 * 1024) throw new Error('WASM memory exceeds the approved maximum.');
  const sandbox = await page.evaluate(async () => {
    const { enableComponentVersion, counterComponent } = window.runtimeModules;
    window.componentHandles[7].destroy();
    const element = document.querySelector('#widget7');
    const definition = { ...counterComponent, manifest: { ...counterComponent.manifest, id: 'smoke.sandbox', name: 'Sandbox', version: 1 }, source: `({render(input,ui){let blocked=false;try{fetch('https://noted-forbidden.invalid/')}catch(error){blocked=true}return ui.text([blocked,typeof document,typeof process,typeof __TAURI__,typeof require,typeof WebAssembly].join(','));}})` };
    await enableComponentVersion(definition);
    window.componentHandles[7] = window.componentHost.mount({ id: 'sandbox', element, definition, input: { properties: {}, state: {}, bindings: {} }, onState: () => { throw new Error('Unexpected script state mutation'); } });
    return true;
  });
  await page.waitForFunction(() => document.querySelector('#widget7')?.textContent === 'true,undefined,undefined,undefined,undefined,undefined');
  const failures = await page.evaluate(async () => {
    const { enableComponentVersion, counterComponent } = window.runtimeModules;
    window.componentHandles[6].destroy();
    const definition = { ...counterComponent, manifest: { ...counterComponent.manifest, id: 'smoke.loop', name: 'Loop', version: 1 }, source: `({render(){while(true){}}})` };
    await enableComponentVersion(definition);
    const started = performance.now();
    window.componentHandles[6] = window.componentHost.mount({ id: 'loop', element: document.querySelector('#widget6'), definition, input: { properties: {}, state: { count: 7 }, bindings: {} }, onState: () => { throw new Error('Failure changed state'); } });
    return { started };
  });
  await page.waitForFunction(() => /interrupt|timed out/.test(document.querySelector('#widget6')?.textContent ?? ''));
  failures.stoppedInMs = await page.evaluate(started => performance.now() - started, failures.started);
  delete failures.started;
  await page.evaluate(() => window.componentHost.destroy());
  await page.waitForTimeout(50);
  if (page.workers().length) throw new Error('Worker continues after host closes.');

  await page.evaluate(async () => {
    const { ComponentRuntimeHost, counterComponent, enableComponentVersion } = window.runtimeModules;
    document.querySelector('#widgets').replaceChildren();
    const animated = { ...counterComponent, manifest: { ...counterComponent.manifest, id: 'smoke.animation', animationFps: 30, transientState: { frame: { type: 'number', default: 0 } } }, source: `({render({transient},ui){return ui.text('Frame '+transient.frame)},reduce({transient},event){return {transient:{frame:transient.frame+1}}}})` };
    await enableComponentVersion(animated);
    window.componentHost = new ComponentRuntimeHost(); window.componentHandles = [];
    for (let index = 0; index < 8; index++) {
      const element = document.createElement('div'); element.id = `animation${index}`; element.className = 'widget'; document.querySelector('#widgets').append(element);
      window.componentHandles.push(window.componentHost.mount({ id: `animation${index}`, element, definition: animated, input: { properties: {}, state: {}, bindings: {} }, onState: () => { throw new Error('Animation persisted state'); } }));
    }
    window.typingSamples = [];
    document.querySelector('#typing').addEventListener('beforeinput', () => {
      const start = performance.now(); requestAnimationFrame(() => window.typingSamples.push(performance.now() - start));
    });
  });
  await page.waitForFunction(() => window.componentHost.stats.instances === 8 && document.querySelector('#animation0')?.textContent !== 'Frame 0');
  await page.locator('#typing').click();
  await page.keyboard.type('Eight bounded interactive components run while the editor remains responsive. '.repeat(4), { delay: 3 });
  const pauseFrames = await page.locator('#animation0').textContent();
  await page.waitForTimeout(150);
  const duringTypingPause = await page.locator('#animation0').textContent();
  if (pauseFrames !== duringTypingPause) throw new Error('Animation continued during typing pause.');
  const performanceResult = await page.evaluate(() => {
    const samples = [...window.typingSamples].sort((a, b) => a - b);
    return { samples: samples.length, beforeInputToRafP95Ms: samples[Math.floor(samples.length * .95)], memory: window.componentHost.stats, typingPausesAnimation: true };
  });
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(100);
  const hiddenFrames = await page.locator('#animation0').textContent();
  await page.waitForTimeout(150);
  if (hiddenFrames !== await page.locator('#animation0').textContent()) throw new Error('Hidden document animation continued.');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); for (const element of document.querySelectorAll('.widget')) element.style.display = 'none'; });
  await page.waitForFunction(() => window.componentHost.stats.instances === 0);
  await page.evaluate(() => window.componentHost.destroy());
  await page.waitForTimeout(50);
  const afterClosing = { workers: page.workers().length, stats: await page.evaluate(() => window.componentHost.stats) };
  if (afterClosing.workers) throw new Error('Worker still running after close.');
  await page.evaluate(async () => {
    const { ComponentRuntimeHost, counterComponent, enableComponentVersion } = window.runtimeModules;
    document.querySelector('#widgets').replaceChildren();
    const listeners = new Set();
    window.testBattery = { charging: false, addEventListener: (name, listener) => listeners.add(listener), removeEventListener: (name, listener) => listeners.delete(listener), notify: () => { for (const listener of listeners) listener(); } };
    Object.defineProperty(navigator, 'getBattery', { configurable: true, value: () => Promise.resolve(window.testBattery) });
    const animated = { ...counterComponent, manifest: { ...counterComponent.manifest, id: 'smoke.animation', animationFps: 30, transientState: { frame: { type: 'number', default: 0 } } }, source: `({render({transient},ui){return ui.text('Frame '+transient.frame)},reduce({transient},event){return {transient:{frame:transient.frame+1}}}})` };
    await enableComponentVersion(animated);
    const element = document.createElement('div'); element.id = 'battery'; element.className = 'widget'; document.querySelector('#widgets').append(element);
    window.componentHost = new ComponentRuntimeHost();
    window.componentHost.mount({ id: 'battery', element, definition: animated, input: { properties: {}, state: {}, bindings: {} }, onState: () => { throw new Error('Animation persisted state'); } });
  });
  await page.waitForFunction(() => document.querySelector('#battery')?.textContent === 'Frame 0');
  await page.waitForTimeout(180);
  if (await page.locator('#battery').textContent() !== 'Frame 0') throw new Error('Animation ran on battery.');
  await page.evaluate(() => { window.testBattery.charging = true; window.testBattery.notify(); });
  await page.waitForFunction(() => document.querySelector('#battery')?.textContent !== 'Frame 0');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(80);
  const reducedFrame = await page.locator('#battery').textContent();
  await page.waitForTimeout(150);
  if (reducedFrame !== await page.locator('#battery').textContent()) throw new Error('Animation ran under reduced motion.');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.waitForFunction(frame => document.querySelector('#battery')?.textContent !== frame, reducedFrame);
  await page.evaluate(() => window.componentHost.destroy());
  await page.waitForTimeout(50);
  if (page.workers().length) throw new Error('Battery policy worker did not terminate.');
  if (external.length) throw new Error(`Unexpected external requests: ${external.join(', ')}`);
  const result = { baseline, eight, sandbox, failures, performanceResult, hiddenPausesAnimation: true, offscreenUnloads: true, batteryPausesAnimation: true, reducedMotionPausesAndResumes: true, afterClosing, externalRequests: external, measurement: 'Development browser on current host. beforeinput-to-RAF is a scheduling proxy, not hardware key-to-paint acceptance.' };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

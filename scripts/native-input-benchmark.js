async page => {
  // Use only the disposable workspace made by create-native-benchmark.mjs.
  const workloads = ['ordinary-100-paragraphs', 'long-1000-paragraphs', 'artistic-100-panels', 'mixed-free-media-100-panels'];
  const results = [];
  for (let repeat = 0; repeat < 3; repeat++) {
    for (const name of workloads) {
      await page.getByRole('button', { name: new RegExp('^' + name) }).click();
      await page.waitForFunction(name => document.querySelector('#note-title')?.value === name, name);
      // Intentionally animated panels never satisfy Playwright's stability wait.
      const paragraph = page.locator('.note-panel-content p').first();
      await paragraph.evaluate(el => el.scrollIntoView({block:'center'}));
      await paragraph.click({force:true});
      await page.keyboard.press('Home');
      await page.evaluate(() => {
        const samples = [], intervals = [], longTasks = [];
        let active = true, previous = performance.now();
        const listener = event => {
          if (!event.target.closest('#editor')) return;
          const start = performance.now();
          requestAnimationFrame(() => { if (active) samples.push(performance.now() - start); });
        };
        document.addEventListener('beforeinput', listener, true);
        const observer = new PerformanceObserver(list => longTasks.push(...list.getEntries().map(entry => entry.duration)));
        observer.observe({ type: 'longtask' });
        const tick = time => { if (active) { intervals.push(time - previous); previous = time; requestAnimationFrame(tick); } };
        requestAnimationFrame(tick);
        window.nativeInputMeasurement = { samples, intervals, longTasks, stop() { active = false; document.removeEventListener('beforeinput', listener, true); observer.disconnect(); } };
      });
      await page.keyboard.type('Measured typing preserves every word in this local note. ', { delay: 20 });
      // Include an actual autosave in the sample interval.
      await page.keyboard.press('Control+s');
      await page.waitForFunction(() => document.querySelector('#save-state')?.textContent?.includes('Saved'));
      const result = await page.evaluate(() => {
        const m = window.nativeInputMeasurement; m.stop();
        const summary = values => {
          const sorted = [...values].sort((a,b) => a-b);
          return { count: values.length, median: sorted[Math.ceil(sorted.length*.5)-1], p95: sorted[Math.ceil(sorted.length*.95)-1], max: sorted.at(-1) };
        };
        return { inputToNextFrameMs: summary(m.samples), frameIntervalsMs: summary(m.intervals), longTasks: m.longTasks,
          raw: { inputToNextFrameMs: m.samples, frameIntervalsMs: m.intervals }, visibility: document.visibilityState };
      });
      results.push({ workload: name, repeat, ...result });
    }
  }
  await page.evaluate(results => {
    window.nativeInputResults = { timestamp: new Date().toISOString(), userAgent: navigator.userAgent,
      viewport: {width:innerWidth,height:innerHeight,dpr:devicePixelRatio}, results,
      limitations: ['Automation-generated real keyboard events, not physical key latency.', 'beforeinput to next requestAnimationFrame is not a paint timestamp.', 'Development machine, not low-end hardware.', 'Warm notes, three repetitions; does not measure cold startup or collection scaling.'] };
  }, results);
}

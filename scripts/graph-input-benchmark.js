async page => {
  // Playwright CLI function. Requires create-graph-fixture.mjs --dense and a disposable native workspace.
  await page.addInitScript(() => {
    if(window.graphBenchmarkWorkerInstalled)return;
    window.graphBenchmarkWorkerInstalled=true;
    const OriginalWorker = window.Worker;
    window.graphWorkerCounts = {positions:0, settled:0, terminated:0};
    window.Worker = class extends OriginalWorker {
      constructor(url, options) {
        super(url, options);
        this.graphMeasurement = String(url).includes('connections-force.worker');
        if (this.graphMeasurement) this.addEventListener('message', ({data}) => {
          if (data.type === 'positions') window.graphWorkerCounts.positions++;
          if (data.type === 'settled') window.graphWorkerCounts.settled++;
        });
      }
      terminate() { if (this.graphMeasurement) window.graphWorkerCounts.terminated++; super.terminate(); }
    };
  });
  await page.reload();
  await page.setViewportSize({width:1200,height:900});
  await page.emulateMedia({reducedMotion:'reduce'});
  if (await page.locator('[data-panel-toggle=notes]').getAttribute('aria-expanded') !== 'true') await page.locator('[data-panel-toggle=notes]').click();
  await page.locator('#search').fill('Orchard notebook');
  await page.locator('[data-note="10000000-0000-4000-8000-000000000001"]').click();
  await page.waitForFunction(() => document.querySelector('#note-title')?.value === 'Orchard notebook');
  await page.locator('#search').fill('');
  await page.locator('#header-connection-handle button').click();
  await page.waitForFunction(() => document.querySelector('#connection-graph').dataset.layoutState === 'settled');
  await page.locator('[data-graph-action=add]').click();
  const labels=['Seed trials','Watercolour field journal','Architecture notes','Walking routes','Reading journal','Garden plans'];
  for (let i=22; i<=81 && await page.locator('[data-graph-node]').count()<60; i++) {
    const id=`10000000-0000-4000-8000-${String(i).padStart(12,'0')}`;
    if(await page.locator(`[data-graph-node="${id}"]`).count())continue;
    await page.locator('#connection-query').fill(`${labels[(i-2)%labels.length]} ${i}`);
    await page.locator(`[data-search-select="${id}"]`).click();
    await page.waitForFunction(() => document.querySelector('#connection-graph').dataset.layoutState === 'settled');
  }
  const nodes=await page.locator('[data-graph-node]').count(), edges=await page.locator('.connection-edge').count();
  if (nodes!==60 || edges!==180) throw Error(`Full graph fixture not reached: ${nodes} nodes, ${edges} edges`);
  await page.evaluate(() => {
    const samples=[], intervals=[], longTasks=[];
    let active=true, previous=performance.now();
    const listener=event => {
      if (!event.target.closest('#editor')) return;
      const start=performance.now();
      requestAnimationFrame(() => {if(active)samples.push(performance.now()-start);});
    };
    document.addEventListener('beforeinput', listener, true);
    const observer=new PerformanceObserver(list=>longTasks.push(...list.getEntries().map(e=>e.duration)));
    observer.observe({type:'longtask'});
    const tick=time=>{if(active){intervals.push(time-previous);previous=time;requestAnimationFrame(tick);}};
    requestAnimationFrame(tick);
    window.graphInputMeasurement={samples,intervals,longTasks,stop(){active=false;document.removeEventListener('beforeinput',listener,true);observer.disconnect();}};
    const editor=document.querySelector('#editor .tiptap'); editor.focus();
    const selection=getSelection(),range=document.createRange();range.selectNodeContents(editor);range.collapse(true);selection.removeAllRanges();selection.addRange(range);
  });
  // Native rebuild runs in background; this must not close the graph or hold its writer during retrieval.
  const indexing = await page.evaluate(async () => {
    if (!window.__TAURI_INTERNALS__) return {native:false};
    const status=await window.__TAURI_INTERNALS__.invoke('rebuild_index');
    return {native:true,status};
  });
  const starting=await page.evaluate(()=>({...window.graphWorkerCounts}));
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.waitForFunction(()=>document.querySelector('#connection-graph').dataset.layoutState==='running');
  await page.keyboard.type('Measured typing preserves every word in this local note. ',{delay:20});
  await page.keyboard.press('Control+s');
  await page.waitForFunction(()=>document.querySelector('#save-state').textContent.includes('Saved'));
  const measurements=await page.evaluate(()=>{
    const m=window.graphInputMeasurement;m.stop();
    const summary=values=>{const s=[...values].sort((a,b)=>a-b);return {count:s.length,p50:s[Math.ceil(s.length*.5)-1],p95:s[Math.ceil(s.length*.95)-1],max:s.at(-1)};};
    return {inputToNextFrameMs:summary(m.samples),frameIntervalsMs:summary(m.intervals),longTasks:m.longTasks,worker:{...window.graphWorkerCounts},visibility:document.visibilityState};
  });
  await page.waitForFunction(()=>document.querySelector('#connection-graph').dataset.layoutState==='settled');
  const settled=await page.evaluate(()=>({...window.graphWorkerCounts}));
  await page.waitForTimeout(600);
  const idle=await page.evaluate(()=>({...window.graphWorkerCounts}));
  if(idle.positions!==settled.positions)throw Error('Graph still ticks after settling');
  await page.locator('#connections-close').click();
  const closed=await page.evaluate(()=>({...window.graphWorkerCounts}));
  await page.waitForTimeout(600);
  const afterClose=await page.evaluate(()=>({...window.graphWorkerCounts}));
  if(afterClose.positions!==closed.positions||closed.terminated<=starting.terminated)throw Error('Closed graph worker did not stop');
  const result={timestamp:new Date().toISOString(),nodes,edges,indexing,starting,...measurements,settled,idle,closed,afterClose,
    limitations:['Development machine, not reference laptop.','Automation beforeinput to requestAnimationFrame measures scheduling, not physical key-to-paint.','Rebuild requested concurrently; does not prove continuous inference or indexing activity.']};
  await page.evaluate(value=>{window.graphBenchmarkResult=value;},result);
  return result;
}

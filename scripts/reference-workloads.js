async page=>{
 const options=await page.evaluate(()=>window.notedBenchmarkOptions??{}),slowdown=options.cpuSlowdown??1;
 if(typeof options.fixtureWorkspace!=='string'||!await page.evaluate(async expected=>{
  if(!window.__TAURI_INTERNALS__)return false;
  const normalize=value=>{let text=String(value).replaceAll('\\','/');if(text.startsWith('//?/'))text=text.slice(4);return text.replace(/\/+$/,'').toLowerCase();};
  const status=await window.__TAURI_INTERNALS__.invoke('workspace_status'),policy=await window.__TAURI_INTERNALS__.invoke('agent_access');
  return normalize(status.path)===normalize(expected)&&!policy.enabled&&!policy.allowHosted&&!policy.folderIds.length;
 },options.fixtureWorkspace))throw new Error('The exact disposable benchmark workspace with disabled sharing is required.');
 const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:slowdown});
 await page.setViewportSize({width:1280,height:900});
 const browse=page.locator('[data-panel-toggle=navigation]');
 if(await browse.getAttribute('aria-expanded')==='true')await browse.click();
 const results=[];
 const summarize=values=>{const sorted=[...values].sort((a,b)=>a-b);return {count:sorted.length,median:sorted[Math.max(0,Math.ceil(sorted.length*.5)-1)]??null,p95:sorted[Math.max(0,Math.ceil(sorted.length*.95)-1)]??null,max:sorted.at(-1)??null};};
 async function open(name){await page.keyboard.press('Control+p');await page.locator('#quick-open-search').fill(name);await page.locator('[data-quick-note]').filter({hasText:name}).click();await page.waitForFunction(name=>document.querySelector('#note-title')?.value===name,name);}
 async function measure(name,repeat,label=name){
  await open(name);const paragraph=page.locator('#editor p').first();await paragraph.evaluate(element=>element.scrollIntoView({block:'center'}));await paragraph.click({force:true});await page.keyboard.press('Home');
  await page.evaluate(()=>{
   const samples=[],intervals=[],tasks=[],events=[];let active=true,last=performance.now();
   const input=event=>{if(!event.target.closest('#editor'))return;const start=performance.now();requestAnimationFrame(()=>{if(active)samples.push(performance.now()-start);});};document.addEventListener('beforeinput',input,true);
   const observer=new PerformanceObserver(list=>tasks.push(...list.getEntries().map(entry=>entry.duration)));observer.observe({type:'longtask'});
   let eventObserver=null;try{eventObserver=new PerformanceObserver(list=>events.push(...list.getEntries().map(entry=>({name:entry.name,duration:entry.duration,interactionId:entry.interactionId}))));eventObserver.observe({type:'event',durationThreshold:16});}catch{}
   const tick=time=>{if(active){intervals.push(time-last);last=time;requestAnimationFrame(tick);}};requestAnimationFrame(tick);
   window.measurement={samples,intervals,tasks,events,stop(){active=false;document.removeEventListener('beforeinput',input,true);observer.disconnect();eventObserver?.disconnect();}};
  });
  await page.keyboard.type('Measured local typing keeps the document responsive. ',{delay:20});await page.keyboard.press('Control+s');await page.waitForFunction(()=>document.querySelector('#save-state').textContent.includes('Saved'));
  const raw=await page.evaluate(()=>{const m=window.measurement;m.stop();if(document.visibilityState!=='visible')throw new Error('The benchmark window was hidden during measurement.');return {samples:m.samples,intervals:m.intervals,longTasks:m.tasks,eventTiming:m.events,visibility:document.visibilityState};});
  const writingArea=await page.locator('.document-scroll').evaluate(el=>({width:el.clientWidth,height:el.clientHeight,navigationVisible:document.querySelector('[data-panel-toggle=navigation]').getAttribute('aria-expanded')==='true'}));
  results.push({workload:label,repeat,writingArea,inputToNextFrameMs:summarize(raw.samples),frameIntervalsMs:summarize(raw.intervals),...raw});
 }
 const workloads=['ordinary-100-paragraphs','long-1000-paragraphs','artistic-100-panels','mixed-free-media-100-panels'];
 for(let repeat=0;repeat<3;repeat++)for(const name of workloads)await measure(name,repeat);
 await browse.click();for(let repeat=0;repeat<3;repeat++)await measure(workloads[0],repeat,'ordinary-100-paragraphs-with-navigation');await browse.click();
 await open('eight-active-components');await page.locator('#view-toggle').click();await page.locator('[data-panel-choice=components]').setChecked(true);await page.keyboard.press('Escape');await page.locator('#interactive-library').click();await page.locator('[data-component-picker]').selectOption('noted.benchmark@1');
 const disabledBeforeEnable=await page.locator('[data-component-status]').textContent();if(!disabledBeforeEnable.includes('disabled'))throw new Error('Fresh benchmark components were unexpectedly enabled');await page.locator('[data-component-enable]').click();await page.waitForFunction(()=>document.querySelector('[data-component-status]').textContent.includes('enabled'));await page.getByRole('button',{name:'Close interactive components',exact:true}).click();
 await page.waitForFunction(()=>document.querySelectorAll('.interactive-component-body button').length===8);await page.locator('#view-toggle').click();await page.locator('[data-panel-choice=components]').setChecked(false);await page.keyboard.press('Escape');
 const activeWorkers=page.workers().length;if(activeWorkers!==1)throw new Error('Expected one Worker for eight visible components');
 for(let repeat=0;repeat<3;repeat++)await measure('eight-active-components',repeat);
 const until=Date.now()+(options.minutes??5)*60000;let cycle=0;
 while(Date.now()<until){await measure(workloads[cycle%workloads.length],cycle+3);await measure('eight-active-components',cycle+3);cycle++;await page.waitForTimeout(500);}
 await open('ordinary-100-paragraphs');await page.waitForTimeout(100);const workersAfterLeavingComponents=page.workers().length;if(workersAfterLeavingComponents)throw new Error('Component work continued after leaving its note');
 await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});await cdp.detach();
 const sharingDisabled=await page.evaluate(async()=>{const policy=await window.__TAURI_INTERNALS__.invoke('agent_access');return !policy.enabled&&!policy.allowHosted&&!policy.folderIds.length;});if(!sharingDisabled)throw new Error('Benchmark sharing policy changed unexpectedly.');
 const result={formatVersion:1,timestamp:new Date().toISOString(),classification:slowdown===1?'actual-host benchmark, reference eligibility requires hardware review':'CPU-throttled development sensitivity test; not reference hardware',cpuSlowdown:slowdown,minutesRequested:options.minutes??5,longSessionCycles:cycle,results,components:{visibleInstances:8,activeWorkers,disabledBeforeEnable:true,workersAfterLeavingComponents},viewport:await page.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,userAgent:navigator.userAgent})),limitations:['beforeinput-to-animation-frame is a scheduling proxy, not physical key-to-paint.','Event Timing entries are quantized browser-event-to-presentation observations, exclude physical input latency and may omit fast events.','Cold-start timestamps include remote-debugging instrumentation.','Sampled private memory is not a guaranteed peak; summed working sets double-count shared pages.','CPU slowdown does not emulate another CPU, less RAM, slower storage or a different GPU.']};
 Object.assign(result,{exactFixtureWorkspaceVerified:true,localAndHostedSharingDisabled:true});
 await page.evaluate(result=>window.notedBenchmarkResults=result,result);return result;
}

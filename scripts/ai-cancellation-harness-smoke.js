async page => {
  if (page.url() !== 'http://127.0.0.1:1436/experiments/ai-activity/' || await page.evaluate(() => Boolean(window.__TAURI_INTERNALS__))) throw new Error('Browser-only stubbed AI fixture required');
  await page.reload(); await page.waitForFunction(() => window.__notedActivityHarness?.ids.length === 2);
  const checks = [], profiles = [], record = (name, okay) => { if (!okay) throw new Error(name); checks.push(name); };
  await page.evaluate(() => { window.__notedActivityHarness.state.holdCancellation = true; });
  await page.locator('#fixture-open-ai').click(); await page.locator('[data-ai-prompt]').fill('Synthetic cancellation check');
  await page.locator('[data-subscription-send]').click(); await page.waitForFunction(() => document.querySelector('[data-activity-state]').textContent === 'Generating proposal');
  await page.locator('[data-subscription-stop]').click();
  await page.waitForFunction(() => document.querySelector('[data-activity-state]').textContent === 'Cancellation requested');
  record('an acknowledgement does not claim terminal cancellation', await page.locator('[data-ai-status]').textContent().then(text => text.includes('Waiting for local runner status')));
  record('pending cancellation blocks another generation and duplicate cancellation', await page.locator('[data-subscription-send]').isDisabled() && await page.locator('[data-subscription-stop]').isDisabled());
  await page.locator('[data-ai-close]').click(); await page.locator('[data-activity-open]').click();
  await page.waitForFunction(() => document.querySelector('.ai-formatting-dialog').open);
  record('reopening a removed request keeps cancellation pending', (await page.locator('[data-ai-status]').textContent()).includes('Waiting for local runner status'));
  await page.locator('[data-ai-close]').click();
  const measure = async () => page.locator('.ai-job-status').evaluate(root => {
    const rgb=s=>s.match(/[\d.]+/g).slice(0,3).map(Number),lum=a=>a.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0),ratio=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
    const bg=el=>{for(let p=el;p;p=p.parentElement){const v=getComputedStyle(p).backgroundColor.match(/[\d.]+/g).map(Number);if(v.length<4||v[3]===1)return v.slice(0,3);}return[255,255,255];};
    const failures=[],ratios=[],bounds=root.getBoundingClientRect();
    for(const el of root.querySelectorAll('strong,span,button')){if(el.closest('[hidden]'))continue;const style=getComputedStyle(el),r=el.getBoundingClientRect(),background=bg(el),contrast=ratio(rgb(style.color),background);ratios.push(contrast);if(contrast<4.5)failures.push('text contrast');if(el.matches('button')&&(r.width<43.9||r.height<43.9))failures.push('target size');if(el.matches(':focus-visible')&&style.outlineStyle!=='none'&&ratio(rgb(style.outlineColor),background)<3)failures.push('focus contrast');if(el===document.activeElement&&(r.top<bounds.top-1||r.bottom>bounds.bottom+1))failures.push('focus clipped');}
    const writing=document.querySelector('.document-scroll').getBoundingClientRect();if(bounds.right>innerWidth+1||root.scrollWidth>root.clientWidth+1||writing.top<bounds.bottom-1||writing.height<40)failures.push('writing overlap or overflow');return{minimumTextContrast:Math.min(...ratios),failures};
  });
  for(const phase of ['cancelling','cancelled']){
    if(phase==='cancelled'){await page.evaluate(()=>{window.__notedActivityHarness.state.job.phase='cancelled';});await page.waitForFunction(()=>document.querySelector('[data-activity-state]').textContent==='Cancellation reported');}
    for(const mode of ['light','dark']){
      await page.locator('#fixture-theme').selectOption(mode);
      for(const [width,height,writing]of [[1200,800,'full'],[1200,800,'280'],[800,560,'full'],[390,840,'full']]){
        await page.setViewportSize({width,height});await page.locator('#fixture-width').selectOption(writing);await page.locator('[data-activity-open]').focus();await page.keyboard.press('ArrowRight');
        const result=await measure();if(result.failures.length)throw new Error(JSON.stringify({phase,mode,width,writing,result}));
        await page.screenshot({path:`output/playwright/cancellation-${phase}-${mode}-${width}-${writing}.png`});profiles.push({phase,mode,width,height,writing,...result});
      }
    }
    await page.setViewportSize({width:800,height:600});await page.locator('#fixture-width').selectOption('full');await page.evaluate(()=>{document.documentElement.style.fontSize='200%';});await page.locator('[data-activity-open]').focus();
    const large=await measure();if(large.failures.length)throw new Error(JSON.stringify({phase,large}));await page.screenshot({path:`output/playwright/cancellation-${phase}-text-200.png`});profiles.push({phase,largeText:true,...large});await page.evaluate(()=>{document.documentElement.style.fontSize='';});
  }
  record('reported cancellation remains explicit about local status and usage', (await page.locator('[data-activity-message]').textContent()).includes('local runner'));
  record('only one stub job and one cancellation were requested', await page.evaluate(()=>window.__notedActivityHarness.state.starts===1&&window.__notedActivityHarness.state.cancels===1&&!window.__notedActivityHarness.state.row));
  await page.locator('[data-activity-open]').click();await page.waitForFunction(()=>document.querySelector('.ai-formatting-dialog').open);
  record('opening the terminal status explains the local outcome and usage limit', (await page.locator('[data-ai-status]').textContent()).includes('Cancellation reported by the local runner'));
  record('cancellation details receive focus and remain visible in the dialog',await page.locator('[data-ai-status]').evaluate(status=>{const r=status.getBoundingClientRect(),dialog=status.closest('dialog').getBoundingClientRect();return document.activeElement===status&&r.top>=dialog.top&&r.bottom<=dialog.bottom;}));
  await page.screenshot({path:'output/playwright/cancellation-outcome-dialog.png'});
  await page.locator('[data-ai-close]').click();
  await page.locator('[data-activity-dismiss]').click();record('terminal cancellation can be dismissed',await page.locator('.ai-job-status').isHidden());
  record('no unexpected harness errors',await page.evaluate(()=>window.__notedActivityHarness.errors.length===0));
  return{passed:true,browserOnly:true,simulatedAIAndAccount:true,noNativeIPC:true,checks,profiles};
}

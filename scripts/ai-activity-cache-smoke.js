async page => {
  if (!await page.evaluate(() => Boolean(window.__TAURI_INTERNALS__))) throw new Error('Native cached-proposal fixture required');
  const status = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('workspace_status'));
  if (!status.path.includes('noted-simple-ai-')) throw new Error('Disposable cached-proposal workspace required');
  const checks = [], record = (name, okay) => { if (!okay) throw new Error(name); checks.push(name); };
  await page.setViewportSize({ width: 1200, height: 800 }); await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => document.querySelector('#note-title')?.value.startsWith('Simple AI synthetic fixture'));
  const id = await page.locator('#header-connection-handle button').getAttribute('data-connect-source');
  const current = target => page.waitForFunction(id => document.querySelector('#header-connection-handle button')?.dataset.connectSource === id, target);
  const comparison = () => page.waitForFunction(() => document.querySelector('#document-operations-dialog').open && !document.querySelector('[data-operations-apply]').disabled, null, { timeout: 60000 });
  // This script never clicks Generate and never invokes start_subscription_formatting.
  await page.locator('#open-ai-formatting').click(); await page.locator('[data-ai-preview]:not([hidden])').waitFor();
  await page.locator('[data-ai-close]').click();
  record('ready cached proposal remains visible after closing AI', await page.locator('.ai-job-status').isVisible() && await page.locator('[data-activity-state]').innerText() === 'Proposal ready');
  record('closed AI dialog is inert', await page.locator('.ai-formatting-dialog').evaluate(el => !el.open && el.inert));
  const profiles=[];
  const measure=async()=>page.locator('.ai-job-status').evaluate(root=>{
    const rgb=s=>s.match(/[\d.]+/g).slice(0,3).map(Number),lum=a=>a.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0),ratio=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
    const background=el=>{for(let p=el;p;p=p.parentElement){const values=getComputedStyle(p).backgroundColor.match(/[\d.]+/g).map(Number);if(values.length<4||values[3]===1)return values.slice(0,3);}return[255,255,255];};
    const bounds=root.getBoundingClientRect(),failures=[],ratios=[];
    for(const el of root.querySelectorAll('strong,span,button')){if(el.closest('[hidden]'))continue;const s=getComputedStyle(el),r=el.getBoundingClientRect(),bg=background(el),c=ratio(rgb(s.color),bg);ratios.push(c);if(c<4.5)failures.push('text contrast');if(el.matches('button')&&(r.width<43.9||r.height<43.9))failures.push('target size');if(el.matches(':focus-visible')&&s.outlineStyle!=='none'&&ratio(rgb(s.outlineColor),bg)<3)failures.push('focus contrast');if(el===document.activeElement&&(r.top<bounds.top-1||r.bottom>bounds.bottom+1))failures.push('focused target clipped');}
    const main=document.querySelector('.workspace').getBoundingClientRect(),pane=document.querySelector('#note-pane').getBoundingClientRect(),paper=document.querySelector('.document-scroll').getBoundingClientRect();if(bounds.left<main.left-1||bounds.right>main.right+1||root.scrollWidth>root.clientWidth+1||pane.top<bounds.bottom-1||bounds.right>innerWidth+1)failures.push('overflow or overlap');
    if(Math.min(paper.bottom,main.bottom,innerHeight)-Math.max(paper.top,main.top)<40)failures.push('writing area clipped');
    return{minimumTextContrast:Math.min(...ratios),failures};
  });
  for(const mode of ['light','dark']){
    await page.setViewportSize({width:1200,height:800});await page.locator('#appearance-toggle').click();await page.locator('#appearance-mode').selectOption(mode);await page.keyboard.press('Escape');
    for(const [width,height]of [[1200,800],[800,560],[390,840]]){
      await page.setViewportSize({width,height});await page.locator('[data-activity-open]').focus();await page.keyboard.press('ArrowRight');
      const result=await measure();if(result.failures.length)throw new Error(JSON.stringify({mode,width,result}));
      await page.screenshot({path:`output/playwright/activity-native-${mode}-${width}.png`});profiles.push({mode,width,height,...result});
    }
  }
  await page.setViewportSize({width:800,height:600});await page.evaluate(()=>{document.documentElement.style.fontSize='200%';});
  await page.waitForFunction(()=>{const r=document.querySelector('[data-activity-open]').getBoundingClientRect(),b=document.querySelector('.ai-job-status').getBoundingClientRect();return r.top>=b.top-1&&r.bottom<=b.bottom+1;});
  const largeText=await measure();if(largeText.failures.length)throw new Error(JSON.stringify({largeText}));await page.screenshot({path:'output/playwright/activity-native-text-200.png'});
  record('short writing areas retain note commands under View',await page.locator('.note-product-actions').isHidden());
  await page.locator('#view-toggle').click();if(!await page.locator('.shell-note-actions').evaluate(el=>el.open))await page.locator('.shell-note-actions summary').click();await page.locator('#shell-action-open-ai-formatting').click();
  await page.locator('.ai-formatting-dialog').waitFor({state:'visible'});await page.locator('[data-ai-preview]:not([hidden])').waitFor();await page.locator('[data-ai-close]').click();
  record('View note action opens AI and restores View focus after Close',await page.locator('#view-toggle').evaluate(el=>el===document.activeElement));
  await page.evaluate(()=>{document.documentElement.style.fontSize='';});await page.setViewportSize({width:1200,height:800});
  await page.locator('[data-activity-open]').click(); await comparison();
  record('Review proposal opens native rendered comparison without a duplicate Preview', await page.locator('[data-operations-preview]').isHidden());
  await page.locator('[aria-label="Close document operations"]').click();
  record('closing comparison keeps the ready activity', await page.locator('.ai-job-status').isVisible());
  await page.keyboard.press('Control+n'); await page.waitForFunction(id => document.querySelector('#header-connection-handle button')?.dataset.connectSource !== id, id);
  const other = await page.locator('#header-connection-handle button').getAttribute('data-connect-source');
  await page.locator('#note-title').fill('Synthetic cached-activity second note'); await page.locator('#editor .tiptap').fill('Synthetic draft saved before returning to the cached proposal.');
  await page.locator('[data-activity-open]').click(); await current(id); await comparison();
  record('returning to cached proposal saves the other draft', await page.evaluate(async id => JSON.stringify((await window.__TAURI_INTERNALS__.invoke('load_note', { id })).content).includes('Synthetic draft saved before returning'), other));
  await page.locator('[data-operations-apply]').click(); await page.waitForFunction(() => document.querySelector('#editor strong') && !document.querySelector('[data-ai-outcome]').hidden);
  record('Apply clears the matching activity and exposes Undo', await page.locator('.ai-job-status').isHidden());
  await page.locator('[data-ai-undo]').click(); await page.waitForFunction(() => document.querySelector('[data-ai-outcome-text]').textContent.includes('undone'));
  record('native Undo restores original formatting', await page.locator('#editor strong').count() === 0);
  const access = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('agent_access'));
  record('synthetic sharing remains disabled', !access.enabled && !access.allowHosted && access.folderIds.length === 0);
  await page.screenshot({ path: 'output/playwright/activity-cache-native.png' });
  return { passed: true, native: true, syntheticOnly: true, prewrittenProposal: true, noGenerateClick: true, checks, profiles, largeText };
}

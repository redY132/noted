async page=>{
 if(page.url()!=='http://127.0.0.1:1436/experiments/ai-activity/'||await page.evaluate(()=>Boolean(window.__TAURI_INTERNALS__)))throw new Error('Browser-only stubbed AI fixture required');
 const checks=[],profiles=[],record=(name,okay)=>{if(!okay)throw new Error(name);checks.push(name);};
 const completedWithReadFailure=async()=>{
  await page.reload();await page.waitForFunction(()=>window.__notedActivityHarness?.ids.length===2);
  await page.setViewportSize({width:1200,height:800});
  await page.locator('#fixture-open-ai').click();await page.locator('[data-ai-prompt]').fill('Synthetic local proposal recovery');await page.locator('[data-subscription-send]').click();
  await page.waitForFunction(()=>document.querySelector('[data-activity-state]').textContent==='Generating proposal');
  await page.evaluate(()=>{window.__notedActivityHarness.state.failRequests=true;window.__notedActivityHarness.finish();});
  await page.waitForFunction(()=>document.querySelector('[data-activity-state]').textContent==='Proposal ready'&&document.querySelector('[data-ai-preview]').textContent==='Load proposal');
 };
 await completedWithReadFailure();record('local read failure retains completion and offers Load instead of another job',await page.evaluate(()=>window.__notedActivityHarness.state.starts===1&&document.querySelector('[data-subscription-stop]').hidden));
 await page.locator('[data-ai-close]').click();await page.evaluate(()=>{window.__notedActivityHarness.state.failAccount=true;});
 for(const [theme,width,height,large]of [['light',1200,800,false],['dark',800,560,false],['dark',390,840,true]]){
  await page.setViewportSize({width,height});await page.locator('#fixture-theme').selectOption(theme);await page.evaluate(large=>{document.documentElement.style.fontSize=large?'200%':'';},large);
  await page.locator('[data-activity-open]').click();await page.waitForFunction(()=>document.querySelector('.ai-formatting-dialog').open&&!document.querySelector('[data-ai-preview]').disabled);
  await page.locator('[data-ai-preview]').focus();
  await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');
  const result=await page.locator('.ai-formatting-dialog').evaluate(dialog=>{const r=dialog.getBoundingClientRect(),h=dialog.querySelector('.tool-heading').getBoundingClientRect(),c=dialog.querySelector('[data-ai-close]').getBoundingClientRect(),b=dialog.querySelector('[data-ai-preview]').getBoundingClientRect();return{closeVisible:c.top>=r.top&&c.bottom<=r.bottom,loadVisible:b.top>=h.bottom-1&&b.bottom<=r.bottom,target:b.width>=44&&b.height>=44,overflow:dialog.scrollWidth>dialog.clientWidth+1,generationDisabled:dialog.querySelector('[data-subscription-send]').disabled,signInExplained:dialog.querySelector('[data-subscription-status]').textContent.includes('could not be checked')};});
  const keyboard=await page.locator('[data-ai-preview]').evaluate(button=>document.activeElement===button&&button.matches(':focus-visible')&&getComputedStyle(button).outlineStyle!=='none');
  if(!result.closeVisible||!result.loadVisible||!result.target||result.overflow||!result.generationDisabled||!result.signInExplained||!keyboard)throw new Error(JSON.stringify({theme,width,height,large,result,keyboard}));
  await page.screenshot({path:`output/playwright/local-proposal-${theme}-${width}-${large?'200':'100'}.png`});profiles.push({theme,width,height,large,...result});await page.locator('[data-ai-close]').click();
 }
 await page.evaluate(()=>{document.documentElement.style.fontSize='';});await page.setViewportSize({width:1200,height:800});
 await page.locator('[data-activity-open]').click();await page.waitForFunction(()=>document.querySelector('.ai-formatting-dialog').open&&document.querySelector('[data-ai-preview]').textContent==='Load proposal'&&!document.querySelector('[data-ai-preview]').disabled);
 await page.evaluate(()=>{window.__notedActivityHarness.state.failRequests=false;});await page.locator('[data-ai-preview]').click();
 await page.waitForFunction(()=>document.querySelector('#document-operations-dialog').open&&!document.querySelector('[data-operations-apply]').disabled);
 record('saved proposal review works while sign-in discovery is unavailable',await page.evaluate(()=>window.__notedActivityHarness.state.failAccount&&window.__notedActivityHarness.state.starts===1));
 const before=await page.locator('#editor .tiptap').innerHTML();await page.locator('[data-operations-apply]').click();await page.waitForFunction(()=>!document.querySelector('[data-ai-outcome]').hidden);
 await page.locator('[data-ai-undo]').click();await page.waitForFunction(()=>document.querySelector('[data-ai-outcome-text]').textContent.includes('undone'));
 record('local recovery preserves Apply and saved Undo without another generation',await page.locator('#editor .tiptap').innerHTML()===before&&await page.evaluate(()=>window.__notedActivityHarness.state.starts===1));
 record('only the deliberate saved-request outage was recorded',await page.evaluate(()=>window.__notedActivityHarness.errors.every(error=>error.includes('Synthetic saved-request read failure'))));
 await completedWithReadFailure();const reads=await page.evaluate(()=>{const s=window.__notedActivityHarness.state;s.failRequests=false;s.denied=true;return s.requestReads.length;});
 await page.locator('[data-ai-preview]').click();await page.waitForFunction(()=>document.querySelector('[data-ai-status]').textContent.includes('excluded from all AI access'));
 record('local reload rechecks exclusion before fetching any proposal',await page.evaluate(before=>{const s=window.__notedActivityHarness.state;return s.requestReads.length===before&&!s.replyReads.length&&s.starts===1&&document.querySelector('[data-ai-preview]').hidden;},reads));
 await page.reload();await page.waitForFunction(()=>window.__notedActivityHarness?.ids.length===2);await page.locator('#fixture-open-ai').click();await page.locator('[data-ai-prompt]').fill('Synthetic failed generation');await page.locator('[data-subscription-send]').click();
 await page.waitForFunction(()=>document.querySelector('[data-activity-state]').textContent==='Generating proposal');
 await page.evaluate(()=>{const s=window.__notedActivityHarness.state;s.job.phase='failed';s.job.message='Synthetic owned generation failure retained.';s.failRequests=true;});
 await page.waitForFunction(()=>document.querySelector('[data-activity-state]').textContent==='Generation needs attention');await page.locator('[data-ai-close]').click();
 const failureReads=await page.evaluate(()=>{const s=window.__notedActivityHarness.state;s.failAccount=true;return s.requestReads.length;});await page.locator('[data-activity-open]').click();
 await page.waitForFunction(()=>document.querySelector('[data-ai-status]').textContent.includes('Synthetic owned generation failure retained.'));
 record('reopening failed work preserves its owned message without a request-list read',await page.evaluate(before=>{const s=window.__notedActivityHarness.state;return s.requestReads.length===before&&s.starts===1&&document.activeElement?.hasAttribute('data-ai-status')&&document.querySelector('[data-ai-preview]').hidden;},failureReads));
 record('failed-state recovery records no unexpected errors',await page.evaluate(()=>window.__notedActivityHarness.errors.length===0));
 return{passed:true,browserOnly:true,simulatedAIAndAccount:true,noNativeIPC:true,checks,profiles};
}

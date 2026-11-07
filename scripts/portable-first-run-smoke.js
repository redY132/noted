async page=>{
 if(!await page.evaluate(async()=>{if(!window.__TAURI_INTERNALS__)return false;return(await window.__TAURI_INTERNALS__.invoke('workspace_status')).path.includes('noted-sidebar-ui-package test-');}))throw new Error('Extracted disposable package required');
 const checks=[],errors=[],record=(name,value)=>{if(!value)throw new Error(name);checks.push(name);};page.on('pageerror',error=>errors.push(error.message));
 await page.locator('#empty-state').waitFor({state:'visible'});record('extracted package opens an empty isolated library',true);
 await page.keyboard.press('Control+p');await page.waitForFunction(()=>document.querySelector('#quick-open-status')?.textContent.includes('No saved notes'));
 record('first-run picker explains the empty state',await page.locator('.quick-open-dialog').isVisible());await page.keyboard.press('Escape');record('Escape makes the empty picker closed and inert',await page.locator('.quick-open-dialog').evaluate(el=>!el.open&&el.inert));
 await page.keyboard.press('Control+n');await page.waitForFunction(()=>document.querySelector('#note-title')?.value==='Untitled');await page.locator('#note-title').fill('Synthetic packaged startup');await page.keyboard.press('Control+s');
 await page.keyboard.press('Control+p');await page.waitForFunction(()=>document.querySelectorAll('[data-quick-note]').length===1);record('first saved note appears in local search',(await page.locator('[data-quick-note]').innerText()).includes('Synthetic packaged startup'));
 await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');record('keyboard opens the first packaged note',await page.locator('.quick-open-dialog').evaluate(el=>!el.open&&el.inert));
 await page.screenshot({path:'output/playwright/portable-first-run.png'});record('no uncaught package UI errors',errors.length===0);
 return {passed:true,native:true,syntheticOnly:true,noGenerationRequested:true,checks,errors};
}

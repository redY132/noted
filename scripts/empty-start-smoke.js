async page=>{
  if(!await page.evaluate(()=>Boolean(window.__TAURI_INTERNALS__)))throw new Error('Native empty fixture required');
  const initial=await page.evaluate(async()=>({status:await window.__TAURI_INTERNALS__.invoke('workspace_status'),notes:await window.__TAURI_INTERNALS__.invoke('list_notes')}));
  if(!initial.status.path.includes('noted-sidebar-ui-')||initial.notes.length)throw new Error('Fresh disposable workspace required');
  const checks=[],record=(name,value)=>{if(!value)throw new Error(name);checks.push(name);};
  await page.setViewportSize({width:1200,height:800});await page.emulateMedia({reducedMotion:'reduce'});await page.locator('#empty-state').waitFor({state:'visible'});
  await page.locator('#view-toggle').click();record('note-only navigation is disabled before the first note',await page.locator('#shell-go-heading').isDisabled()&&await page.locator('#shell-previous-save').isDisabled());
  await page.locator('#shell-help').click();record('Help opens before the first note',await page.getByRole('dialog',{name:'Help & shortcuts',exact:true}).isVisible());
  await page.locator('[data-help-search]').fill('schema consent');record('offline help includes the guide-consent workflow',await page.locator('[data-help-entry=ai-guide]').isVisible());
  await page.keyboard.press('Control+n');record('Help cannot accidentally create a note behind the modal',(await page.evaluate(()=>window.__TAURI_INTERNALS__.invoke('list_notes'))).length===0);
  await page.keyboard.press('Escape');record('closing Help returns to the empty workspace',await page.locator('#empty-state').isVisible()&&await page.locator('.help-dialog').evaluate(el=>!el.open&&el.inert));
  const access=await page.evaluate(()=>window.__TAURI_INTERNALS__.invoke('agent_access'));record('fresh workspace starts without local or hosted grants',!access.enabled&&!access.allowHosted&&!access.folderIds.length);
  return {passed:true,syntheticOnly:true,noGenerationRequested:true,checks};
}

async page=>{
  const native=await page.evaluate(()=>Boolean(window.__TAURI_INTERNALS__));
  if(native){
    const allowed=await page.evaluate(async()=>{const expected=window.notedCachedFixture?.workspace;if(!expected||!/noted-simple-ai-[A-Za-z0-9]+[\\/]workspace$/i.test(expected))return false;const normalize=value=>String(value).replaceAll('\\','/').replace(/^\/\/\?\//,'').toLowerCase();const[s,r,p]=await Promise.all(['workspace_status','subscription_status','agent_access'].map(command=>window.__TAURI_INTERNALS__.invoke(command)));return normalize(s.path)===normalize(expected)&&r.authentication==='disabled'&&!r.available&&!p.enabled&&!p.allowHosted&&!p.folderIds.length;});
    if(!allowed)throw new Error('Exact disabled generated native link fixture required');
  }else if(new URL(page.url()).origin!=='http://127.0.0.1:1436'||!await page.evaluate(()=>Boolean(localStorage.getItem('noted-sidebar-fixture'))))throw new Error('Generated browser link fixture required');
  const checks=[],errors=[],record=(name,okay)=>{if(!okay)throw new Error(name);checks.push(name);};
  page.on('pageerror',error=>errors.push(error.message));
  await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:1280,height:900});await page.reload();
  await page.waitForFunction(()=>document.querySelector('#header-connection-handle button'));
  const notes=await page.evaluate(async native=>{const create=title=>native?window.__TAURI_INTERNALS__.invoke('create_note',{title,folderId:null}):import('/src/api.ts').then(({api})=>api.createNote(title,null));return Promise.all([create(`Synthetic link source ${Date.now()}`),create(`Synthetic link destination ${Date.now()}`)]);},native);
  await page.keyboard.press('Control+p');await page.locator('#quick-open-search').fill(notes[0].title);await page.locator(`[data-quick-note="${notes[0].id}"]`).click();
  await page.waitForFunction(id=>document.querySelector('#header-connection-handle button')?.dataset.connectSource===id,notes[0].id);
  const writer=page.locator('#editor .tiptap'),dialog=page.locator('#url-dialog'),url=page.locator('#url-value'),apply=page.getByRole('button',{name:'Apply link',exact:true});
  const snapshot=()=>writer.evaluate(el=>JSON.stringify(el.editor.getJSON()));
  const select=()=>writer.evaluate(el=>{el.editor.commands.setTextSelection({from:1,to:6});el.focus();});
  const open=async()=>{await select();await page.keyboard.press('Control+k');await dialog.waitFor({state:'visible'});await url.fill('https://example.com/');};
  await writer.fill('Alpha Beta');await open();
  await writer.evaluate(el=>el.editor.commands.insertContentAt(1,'Changed '));
  const changed=await snapshot();await apply.click();await dialog.waitFor({state:'hidden'});
  record('a changed document refuses the old link range',await snapshot()===changed&&await writer.locator('a').count()===0);
  record('a changed-context message explains reopening the link dialog',(await page.locator('#error-message').textContent()).toLowerCase().includes('reopen'));
  await open();
  // Simulate a navigation finishing while the modal owns an earlier selection.
  // The target and both documents were created above in this generated workspace.
  await page.waitForFunction(id=>document.querySelector(`#note-list [data-note="${id}"]`),notes[1].id);
  await page.evaluate(id=>document.querySelector(`#note-list [data-note="${id}"]`).click(),notes[1].id);
  await page.waitForFunction(id=>document.querySelector('#header-connection-handle button')?.dataset.connectSource===id,notes[1].id);
  const destination=await snapshot();await apply.click();await dialog.waitFor({state:'hidden'});
  record('a replaced editor refuses the old link range',await snapshot()===destination&&await writer.locator('a').count()===0);
  await writer.fill('Gamma Delta');await open();await apply.click();await dialog.waitFor({state:'hidden'});
  record('normal Apply keeps the words and links the chosen text',await writer.textContent()==='Gamma Delta'&&await writer.locator('a').textContent()==='Gamma'&&await writer.locator('a').getAttribute('href')==='https://example.com/');
  await writer.press('Control+z');record('one Undo removes the explicit link',await writer.textContent()==='Gamma Delta'&&await writer.locator('a').count()===0);
  await open();const beforeCancel=await snapshot();await page.locator('#url-cancel').click();
  record('Cancel preserves the note',await snapshot()===beforeCancel&&!await dialog.isVisible());
  await open();await page.keyboard.press('Escape');
  record('Escape preserves the note',await snapshot()===beforeCancel&&!await dialog.isVisible());
  await open();await writer.evaluate(el=>el.editor.setEditable(false));const readOnly=await snapshot();
  await apply.click();await dialog.waitFor({state:'hidden'});
  record('a no-longer-editable note refuses Apply',await snapshot()===readOnly);
  await writer.evaluate(el=>el.editor.setEditable(true));
  await writer.fill('');await writer.focus();await page.keyboard.press('Control+k');await dialog.waitFor({state:'visible'});
  await url.fill('https://example.com/');await page.locator('#url-label').fill('Example');await apply.click();await dialog.waitFor({state:'hidden'});
  record('caret insertion uses the explicit label',await writer.textContent()==='Example'&&await writer.locator('a').textContent()==='Example');
  await writer.press('Control+z');record('one Undo removes the caret insertion',await writer.textContent()==='');
  await page.keyboard.press('Control+s');
  record('link checks finish without uncaught browser errors or open dialogs',errors.length===0&&!await page.locator('dialog[open]').count());
  return{passed:true,native,syntheticOnly:true,noGenerationRequested:true,checks,errors};
}

async page=>{
  const native=await page.evaluate(()=>Boolean(window.__TAURI_INTERNALS__));
  if(native){const status=await page.evaluate(()=>window.__TAURI_INTERNALS__.invoke('workspace_status'));if(!status.path.includes('noted-sidebar-ui-'))throw new Error('Disposable library fixture required');}
  else if(new URL(page.url()).origin!=='http://127.0.0.1:1436')throw new Error('Isolated library preview required');
  if(!await page.evaluate(()=>localStorage.getItem('noted-sidebar-fixture')))throw new Error('Synthetic library fixture required');
  const checks=[],errors=[],record=(name,value)=>{if(!value)throw new Error(name);checks.push(name);};page.on('pageerror',error=>errors.push(error.message));
  const call=(command,args={})=>page.evaluate(async({native,command,args})=>{
    if(native)return window.__TAURI_INTERNALS__.invoke(command,args);const {api}=await import('/src/api.ts');
    const methods={load_note:()=>api.load(args.id),create_folder:()=>api.createFolder(args.name,args.parentId),save_note:()=>api.save(args.note,args.expectedRevision),list_folders:()=>api.folders(),list_trash:()=>api.trash()};return methods[command]();
  },{native,command,args});
  const logical=note=>{const walk=node=>(node.text??'')+(node.content??[]).map(walk).join('');return note.document.readingOrder.map(id=>walk(note.document.objects[id].content??{})).join('\n');};
  const saved=()=>page.waitForFunction(()=>document.querySelector('#save-state')?.textContent.includes('Saved'));
  const currentId=()=>page.locator('#header-connection-handle button').getAttribute('data-connect-source');
  const browse=page.locator('[data-panel-toggle=navigation]');
  await page.setViewportSize({width:1600,height:1000});await page.emulateMedia({reducedMotion:'reduce'});await page.reload();await page.waitForSelector('#new-note');
  if(await browse.getAttribute('aria-expanded')==='true')await browse.click();
  await page.keyboard.press('Control+n');await page.locator('#note-title').fill(`Synthetic library workflow ${Date.now()}`);
  const writer=page.getByRole('textbox',{name:'Note content',exact:true});await writer.fill('First paragraph retains every word.');await page.keyboard.press('Enter');await page.keyboard.type('Second paragraph retains its order.');await page.keyboard.press('Control+s');await saved();
  const id=await currentId(),original=await call('load_note',{id}),words=logical(original);
  for(const preset of ['lecture','project','journal']){
    await page.locator('#open-presets').click();await page.locator(`input[name=note-preset][value=${preset}]`).check();await page.locator('[data-preset-preview]').click();
    await page.waitForFunction(()=>!document.querySelector('[data-preset-apply]').disabled||/failed|cannot|invalid|error/i.test(document.querySelector('[data-preset-status]').textContent));
    if(await page.locator('[data-preset-apply]').isDisabled())throw new Error(`Synthetic ${preset} preview: ${await page.locator('[data-preset-status]').innerText()}`);
    if(preset==='project')await page.screenshot({path:`output/playwright/library-project-${native?'native':'preview'}.png`});
    await page.locator('[data-preset-apply]').click();await page.keyboard.press('Control+s');await saved();record(`${preset} preserves wording and logical order`,logical(await call('load_note',{id}))===words&&JSON.stringify((await call('load_note',{id})).document.readingOrder)===JSON.stringify(original.document.readingOrder));
    await page.keyboard.press('Control+z');await page.keyboard.press('Control+s');await saved();record(`${preset} Undo restores the original document`,JSON.stringify((await call('load_note',{id})).document)===JSON.stringify(original.document));
  }
  const a=await call('create_folder',{name:'Synthetic library source folder',parentId:null}),b=await call('create_folder',{name:'Synthetic library destination',parentId:null});await page.reload();await page.waitForFunction(()=>document.querySelector('#note-title')?.value);
  await page.keyboard.press('Control+p');await page.locator('#quick-open-search').fill(original.title);await page.locator(`[data-quick-note="${id}"]`).click();
  await page.locator('#view-toggle').click();await page.locator('[data-panel-choice=navigation]').setChecked(true);await page.locator('[data-panel-choice=details]').setChecked(true);await page.keyboard.press('Escape');
  await page.locator('#manage-folders').click();await page.locator('[data-folder-picker]').selectOption(a.id);await page.locator('[data-folder-edit-name]').fill('Synthetic renamed library folder');await page.locator('[data-folder-edit-parent]').selectOption(b.id);await page.locator('[data-folder-save]').click();await page.waitForFunction(()=>!document.querySelector('[data-library=folders]').open);
  const renamed=(await call('list_folders')).find(folder=>folder.id===a.id);record('folder rename and move preserve its identity',renamed.name==='Synthetic renamed library folder'&&renamed.parentId===b.id);
  await page.locator('#note-folder').selectOption(a.id);await page.keyboard.press('Control+s');await saved();
  const external=await call('load_note',{id});external.title='Synthetic saved external version';await call('save_note',{note:external,expectedRevision:external.revision});
  await page.locator('#note-title').fill('Synthetic unsaved local draft');await page.keyboard.press('Control+s');await page.waitForFunction(()=>document.querySelector('#save-state').classList.contains('save-error'));
  await page.locator('#recover-draft').click();await page.locator('[data-library=conflict]').waitFor({state:'visible'});record('conflict preview identifies the saved external version',(await page.locator('[data-conflict-disk]').innerText()).includes('Synthetic saved external version'));
  await page.locator('[data-keep-both]').click();await page.waitForFunction(()=>document.querySelector('#note-title').value.includes('recovered draft'));const copyId=await currentId();
  record('conflict recovery creates a separate copy without losing either version',copyId!==id&&(await call('load_note',{id})).title==='Synthetic saved external version'&&logical(await call('load_note',{id:copyId}))===words);
  await page.locator('#trash-current').click();await page.locator('[data-library=trash]').waitFor({state:'visible'});await page.locator(`[data-restore="${copyId}"]`).waitFor();record('Trash retains the recovered identity',(await call('list_trash')).some(note=>note.id===copyId));
  await page.locator(`[data-restore="${copyId}"]`).click();await page.locator(`[data-restore="${copyId}"]`).waitFor({state:'detached'});await page.locator('[data-library=trash] [data-library-close]').click();record('Restore retains its authored content',logical(await call('load_note',{id:copyId}))===words);
  await page.locator('#open-review').click();await page.locator('[data-review-folder]').selectOption(a.id);await page.waitForFunction(id=>document.querySelector(`[data-review-action=dismiss][data-id="${id}"]`)&&!document.querySelector('[data-review-action=dismiss]').disabled,copyId);
  await page.locator(`[data-review-action=dismiss][data-id="${copyId}"]`).click();await page.locator(`[data-review-action=dismiss][data-id="${copyId}"]`).waitFor({state:'detached'});
  await page.locator('[data-review-hidden]').check();await page.locator(`[data-review-action=reset][data-id="${copyId}"]`).waitFor();await page.locator(`[data-review-action=reset][data-id="${copyId}"]`).click();await page.waitForFunction(()=>document.querySelector('[data-review-list]').getAttribute('aria-busy')==='false');
  await page.locator('[data-review-hidden]').uncheck();await page.locator(`[data-review-action=dismiss][data-id="${copyId}"]`).waitFor();record('review exclusion and Reset remain reversible',true);await page.locator('[data-review-close]').click();
  record('no uncaught UI errors',errors.length===0);return {passed:true,native,syntheticOnly:true,noGenerationRequested:true,checks,errors};
}

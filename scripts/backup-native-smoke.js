async page=>{
 if(!await page.evaluate(async()=>{if(!window.__TAURI_INTERNALS__)return false;const status=await window.__TAURI_INTERNALS__.invoke('workspace_status');return status.path.includes('noted-sidebar-ui-');}))throw new Error('Disposable native backup fixture required');
 await page.waitForFunction(()=>document.querySelector('#header-connection-handle button'));
 if(!await page.locator('#shell-workspace').isVisible())await page.locator('#view-toggle').click();await page.locator('#shell-workspace').click();
 await page.waitForFunction(()=>document.querySelector('[data-backup-path]').value.endsWith('.noted-backup'));
 const defaults=await page.evaluate(()=>window.__TAURI_INTERNALS__.invoke('backup_defaults'));await page.locator('[data-backup-path]').fill(defaults.backupPath);await page.locator('[data-restore-target]').fill(defaults.restorePath);
 const notes=await page.evaluate(()=>window.__TAURI_INTERNALS__.invoke('list_notes'));if(notes.length>=2)await page.evaluate(([a,b])=>window.__TAURI_INTERNALS__.invoke('set_relation',{a,b,connected:true,dismissed:false,strength:4}),[notes[0].id,notes[1].id]);
 const backup=await page.locator('[data-backup-path]').inputValue(),target=await page.locator('[data-restore-target]').inputValue();
 const before=await page.evaluate(async()=>{const invoke=window.__TAURI_INTERNALS__.invoke;const notes=await invoke('list_notes');return {notes:await Promise.all(notes.map(n=>invoke('load_note',{id:n.id}))),relations:await invoke('export_relations')};});
 await page.locator('[data-backup-create]').click();await page.waitForFunction(()=>document.querySelector('[data-backup-status]').textContent.includes('Backup created at'),null,{timeout:60000});
 await page.locator('[data-backup-inspect]').click();await page.waitForFunction(()=>!document.querySelector('[data-backup-restore]').disabled,null,{timeout:60000});
 await page.locator('[data-backup-restore]').click();await page.waitForFunction(()=>document.querySelector('[data-backup-status]').textContent.includes('Restored to'),null,{timeout:60000});
 const after=await page.evaluate(async()=>{const invoke=window.__TAURI_INTERNALS__.invoke;const notes=await invoke('list_notes');return {notes:await Promise.all(notes.map(n=>invoke('load_note',{id:n.id}))),relations:await invoke('export_relations')};});
 if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('Backup/restore altered the active workspace');
 await page.screenshot({path:'output/playwright/backup-restore-native.png'});
 await page.locator('[data-restored-open]').click();await page.waitForFunction(()=>document.querySelector('[data-backup-status]').textContent.includes('separate window'));
 await page.getByRole('button',{name:'Close',exact:true}).click();
 return {passed:true,backup,target,activeWorkspaceUnchanged:true,restoredCopyOpened:true,notes:before.notes.length,pairs:before.relations.pairs.length};
}

async page=>{
 const invoke=(command,args={})=>page.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args});
 const workspace=await invoke('workspace_status');if(!workspace.path.includes('noted-private-ui-'))throw new Error('Synthetic private fixture required');
 await page.setViewportSize({width:1280,height:900});await page.emulateMedia({reducedMotion:'reduce'});
 await page.getByRole('button',{name:/^Synthetic page Logseq import/}).click();
 await page.waitForFunction(()=>document.querySelector('#editor strong')?.textContent==='Bold');
 if(!await page.locator('#editor mark').count()||!await page.locator('#editor pre').count()||!await page.locator('#editor blockquote').count())throw new Error('Imported static formatting missing');
 const styled=page.locator('#editor [data-note-background=blue]');if(!await styled.count()||await styled.evaluate(e=>getComputedStyle(e).backgroundColor)!=='rgb(208, 231, 255)')throw new Error('Imported palette background did not render');
 const id=await page.locator('#header-connection-handle button').getAttribute('data-connect-source'),note=await invoke('load_note',{id});
 if(await invoke('note_ai_allowed',{id}))throw new Error('Private note became AI eligible');
 for(const kind of [undefined,'component']){
   const refusal=await invoke('start_subscription_formatting',{id,revision:note.revision,token:note.revisionToken,prompt:'This synthetic private note must never be sent.',kind}).then(()=>false,e=>String(e).includes('AI_PRIVATE_NOTE'));
   if(!refusal)throw new Error('Explicit AI route bypassed private denial');
 }
 await page.locator('#open-ai-formatting').click();await page.waitForFunction(()=>document.querySelector('[data-ai-status]').textContent.includes('excluded from all AI access'));
 await page.locator('[data-ai-prompt]').fill('Stay local');if(!await page.locator('[data-subscription-send]').isDisabled()||!await page.locator('[data-ai-request]').isDisabled())throw new Error('Private AI buttons enabled');
 await page.screenshot({path:'output/playwright/private-ai-disabled.png'});await page.locator('[data-ai-close]').click();
 const prepared=workspace.path.replace(/[\\/]workspace$/,'')+'\\second-bundle.json';
 const published=await invoke('publish_private_import',{path:prepared});if(!published.imported||published.privateDenied!==4||!published.sourceUnchanged)throw new Error('Lock-held desktop publication failed');
 let notes=await invoke('list_notes');const trash=await invoke('list_trash');if(notes.length!==7||trash.length!==1)throw new Error('Trash reconciliation failed');for(const n of [...notes,...trash])if(await invoke('note_ai_allowed',{id:n.id}))throw new Error('Published note AI-eligible');
 await invoke('restore_note',{id:trash[0].id});notes=await invoke('list_notes');if(notes.length!==8||await invoke('note_ai_allowed',{id:trash[0].id}))throw new Error('Restored private page became AI eligible');
 const access=await invoke('agent_access');if(access.enabled||access.allowHosted||access.folderIds.length)throw new Error('Optional sharing changed');
 return{passed:true,syntheticOnly:true,staticFormattingRendered:true,paletteBackgroundRendered:true,recycledPageRestoreRemainsDenied:true,privateAIDisabledVisible:true,subscriptionAndComponentRefusedBeforeClientLaunch:true,writerMutexPublication:true,allEightNotesDenied:true,optionalSharingUnchanged:true};
}

async page=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 const invoke=(command,args={})=>page.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args});
 if(!(await invoke('workspace_status')).path.includes('noted-simple-ai-'))throw new Error('Synthetic workspace required');
 await page.waitForFunction(()=>document.querySelector('[data-note]'));await page.locator('[data-note]').first().click();
 const id=await page.locator('#header-connection-handle button').getAttribute('data-connect-source'),before=await invoke('load_note',{id});
 const permissions=await page.evaluate(()=>localStorage.getItem('noted-component-approvals-v1'));
 await page.evaluate(()=>{window.__previewWorkers={created:0,active:0};const Original=window.Worker;window.Worker=class extends Original{constructor(url,options){super(url,options);this.counted=String(url).includes('component-runtime-worker');this.stopped=false;if(this.counted){window.__previewWorkers.created++;window.__previewWorkers.active++;}}terminate(){if(this.counted&&!this.stopped){this.stopped=true;window.__previewWorkers.active--;}return super.terminate();}};});
 await page.locator('#open-ai-formatting').click();await page.locator('[data-ai-goal]').selectOption('component');await page.locator('[data-ai-prompt]').fill('Create the synthetic interactive counter.');await page.locator('[data-subscription-send]').click();
 await page.waitForFunction(()=>document.querySelector('[data-component-suggestion]').open,null,{timeout:30000});
 if(await page.evaluate(()=>window.__previewWorkers.created)!==0)throw new Error('Proposal arrival executed code');
 if(!await page.locator('[data-component-suggestion-insert]').isDisabled())throw new Error('Insert enabled before preview');
 await page.locator('[data-component-suggestion-run]').click();await page.waitForFunction(()=>!document.querySelector('[data-component-suggestion-insert]').disabled,null,{timeout:15000});
 const preview=page.locator('[data-component-suggestion-preview]');if(!(await preview.textContent()).includes('undefined,undefined,undefined'))throw new Error('Privileged globals available');await preview.getByRole('button',{name:'Add one',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-component-suggestion-preview]').textContent.includes('Synthetic count: 1'));
 if(JSON.stringify((await invoke('load_note',{id})).content)!==JSON.stringify(before.content))throw new Error('Preview changed note');
 await page.screenshot({path:'output/playwright/component-sandbox-preview.png'});await page.locator('[data-component-suggestion-insert]').click();await page.waitForFunction(()=>document.querySelector('[data-ai-outcome-text]').textContent.includes('inserted disabled'),null,{timeout:15000});
 const saved=await invoke('load_note',{id}),components=Object.values(saved.document.objects).filter(o=>o.kind==='component');if(components.length!==1||components[0].state.count!==0)throw new Error('Preview state leaked into inserted note');
 if(await page.evaluate(()=>localStorage.getItem('noted-component-approvals-v1'))!==permissions)throw new Error('Persistent code approval changed');if(await page.evaluate(()=>window.__previewWorkers.active)!==0)throw new Error('Preview worker leaked');
 await page.locator('[data-ai-undo]').click();await page.waitForFunction(()=>document.querySelector('[data-ai-outcome-text]').textContent.includes('undone'));const after=await invoke('load_note',{id});const words=v=>(v.text||'')+(v.content||[]).map(words).join('');if(words(after.content)!==words(before.content)||Object.values(after.document.objects).some(o=>o.kind==='component'))throw new Error('Undo did not restore original note');
 const policy=await invoke('agent_access');if(policy.enabled||policy.allowHosted||policy.folderIds.length)throw new Error('Fixture sharing expanded');
 const launch=await invoke('hosted_agent_launch');if(launch.arguments.slice(-2).join(' ')!=='--audience hosted'||launch.liveConnectionVerified)throw new Error('Hosted launch metadata misrepresents scope/readiness');
 return{passed:true,noCodeOnArrival:true,explicitSandboxPreview:true,noPrivilegedGlobals:true,previewStateTemporary:true,insertDisabledAndUndo:true,noPersistentApproval:true,noWorkerLeak:true,sharingDisabled:true,hostedCommandScopedAndUnverified:true};
}

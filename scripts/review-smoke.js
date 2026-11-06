async page => {
  const native=await page.evaluate(()=>Boolean(window.__TAURI_INTERNALS__));
  if(native){const status=await page.evaluate(()=>window.__TAURI_INTERNALS__.invoke('workspace_status'));if(!status.path.includes('noted-sidebar-ui-'))throw new Error('Disposable review workspace required');}
  else if(new URL(page.url()).origin!=='http://127.0.0.1:1436')throw new Error('Isolated review preview required');
  if(!await page.evaluate(()=>localStorage.getItem('noted-sidebar-fixture')))throw new Error('Synthetic review fixture required');
  const fixture=await page.evaluate(async native=>{
    const api=native?null:(await import('/src/api.ts')).api, invoke=(command,args)=>window.__TAURI_INTERNALS__.invoke(command,args);
    const parent=native?await invoke('create_folder',{name:`Synthetic review ${Date.now()}`,parentId:null}):await api.createFolder(`Synthetic review ${Date.now()}`,null);
    const folder=native?await invoke('create_folder',{name:'Review queue',parentId:parent.id}):await api.createFolder('Review queue',parent.id),notes=[];
    for(let index=0;index<32;index++){
      const title=index===0?'A deliberately long synthetic review title '.repeat(5):`Synthetic review item ${index}`;
      const note=native?await invoke('create_note',{title,folderId:folder.id}):await api.createNote(title,folder.id);
      note.tags=['review-proof',...(index<3?['review-focus']:[])];
      if(native)await invoke('save_note',{note,expectedRevision:note.revision});else await api.save(note,note.revision);notes.push({id:note.id,title});
    }
    return {folder:folder.id,parent:parent.id,notes,sidebar:JSON.parse(localStorage.getItem('noted-sidebar-fixture'))};
  },native);
  const checks=[],errors=[],record=(name,value)=>{if(!value)throw new Error(name);checks.push(name);};page.on('pageerror',error=>errors.push(error.message));
  await page.reload();await page.waitForFunction(()=>document.querySelector('#note-title')?.value);await page.setViewportSize({width:1200,height:800});await page.emulateMedia({reducedMotion:'reduce'});
  const browse=page.locator('[data-panel-toggle=navigation]');if(await browse.getAttribute('aria-expanded')!=='true')await browse.click();
  const openReview=async()=>{await page.locator('#open-review').click();await page.locator('.review-dialog').waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelector('[data-review-list]')?.getAttribute('aria-busy')==='false');};
  const settle=()=>page.waitForFunction(()=>document.querySelector('[data-review-list]')?.getAttribute('aria-busy')==='false');
  await page.keyboard.press('Control+p');await page.locator('#quick-open-search').fill('Synthetic trail map');await page.locator(`[data-quick-note="${fixture.sidebar.notes[0]}"]`).click();
  const marker=` Synthetic draft before review ${Date.now()}.`;await page.locator('#editor .tiptap').focus();await page.keyboard.press('Control+End');await page.keyboard.type(marker);
  await openReview();record('review is a named modal with local-calendar and snooze guidance',await page.getByRole('dialog',{name:'Review your notes',exact:true}).isVisible()&&(await page.locator('.review-dialog').innerText()).includes('24 hours'));
  await page.locator('[data-review-folder]').selectOption(fixture.folder);await settle();await page.locator('[data-review-tag]').fill('REVIEW-PROOF');await settle();
  record('exact folder and case-insensitive tag filters produce a bounded 30-note queue',await page.locator('[data-review-note]').count()===30&&await page.locator('[data-review-note]').evaluateAll((rows,ids)=>rows.every(row=>ids.includes(row.dataset.reviewNote)),fixture.notes.map(n=>n.id)));
  record('review folder choices retain the saved hierarchy',(await page.locator('[data-review-folder] option:checked').innerText()).includes(' / Review queue'));
  record('ordinary due notes do not offer an unrelated Reset',await page.locator('[data-review-action=reset]').count()===0);
  await page.locator('[data-review-tag]').fill('review-focus');await settle();record('changing the tag updates the queue without another Refresh click',await page.locator('[data-review-note]').count()===3);
  const first=await page.locator('[data-review-note]').first().getAttribute('data-review-note');
  await page.locator(`[data-review-action=reviewed][data-id="${first}"]`).click();await settle();
  record('Reviewed today removes one item and keeps keyboard focus at the next item',await page.locator('[data-review-note]').count()===2&&await page.locator('[data-review-action=reviewed]').evaluateAll(rows=>rows.some(row=>row===document.activeElement)));
  await page.locator('[data-review-hidden]').check();await settle();record('hidden-state view explains a reviewed note and exposes Reset',await page.locator('[data-review-note]').count()===3&&(await page.locator(`[data-review-note="${first}"]`).innerText()).includes('Reviewed today')&&await page.locator('[data-review-action=reset]').count()===3);
  await page.locator(`[data-review-action=reset][data-id="${first}"]`).click();await settle();await page.locator('[data-review-hidden]').uncheck();await settle();record('Reset restores the note to the normal due queue',await page.locator('[data-review-note]').count()===3);
  const exclude=await page.locator('[data-review-note]').first().getAttribute('data-review-note');await page.locator(`[data-review-action=dismiss][data-id="${exclude}"]`).click();await settle();record('Exclude removes the note only from the normal review queue',await page.locator('[data-review-note]').count()===2);
  const snooze=await page.locator('[data-review-note]').first().getAttribute('data-review-note');await page.locator(`[data-review-action=snooze][data-id="${snooze}"]`).click();await settle();record('Snooze removes the note with explicit 24-hour feedback',await page.locator('[data-review-note]').count()===1&&(await page.locator('[data-review-queue-status]').innerText()).includes('24 hours'));
  await page.locator('[data-review-hidden]').check();await settle();record('excluded and snoozed notes remain discoverable with their actual reasons',(await page.locator(`[data-review-note="${exclude}"]`).innerText()).includes('Excluded from review')&&(await page.locator(`[data-review-note="${snooze}"]`).innerText()).includes('Snoozed'));
  for(const id of [exclude,snooze]){await page.locator(`[data-review-action=reset][data-id="${id}"]`).click();await settle();}await page.locator('[data-review-hidden]').uncheck();await settle();
  const destination=await page.locator('[data-review-open]').first().getAttribute('data-review-open');await page.locator('[data-review-open]').first().click();await page.locator('.review-dialog').waitFor({state:'hidden'});await page.waitForFunction(id=>document.querySelector('#header-connection-handle button')?.dataset.connectSource===id,destination);
  record('Open note follows normal navigation and returns focus to the editor',await page.locator('#editor .tiptap').evaluate(el=>el===document.activeElement));
  const saved=await page.evaluate(async({native,id})=>native?window.__TAURI_INTERNALS__.invoke('load_note',{id}):(await import('/src/api.ts')).api.load(id),{native,id:fixture.sidebar.notes[0]});
  record('opening from review saves the previous draft first',JSON.stringify(saved.content).includes(marker.trim()));
  await openReview();record('opening a note never marks it reviewed automatically',await page.locator('[data-review-note]').count()===3);
  await page.locator('[data-review-folder]').selectOption(fixture.sidebar.empty);await settle();record('empty filters provide recovery guidance',(await page.locator('[data-review-list]').innerText()).includes('No notes due'));
  await page.keyboard.press('Control+p');record('review prevents opening another modal behind it',await page.locator('.review-dialog').isVisible()&&!await page.locator('.quick-open-dialog').isVisible());
  await page.locator('[data-review-tag]').focus();await page.keyboard.press('Escape');record('first Escape closes a nonempty search and makes the dialog inert',await page.locator('.review-dialog').evaluate(el=>!el.open&&el.inert));
  const measure=async()=>page.locator('.review-dialog').evaluate(root=>{
    const canvas=document.createElement('canvas'),context=canvas.getContext('2d',{willReadFrequently:true});canvas.width=canvas.height=1;
    const color=value=>{context.clearRect(0,0,1,1);context.fillStyle=value;context.fillRect(0,0,1,1);return [...context.getImageData(0,0,1,1).data];},lum=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0),contrast=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
    const background=el=>{for(let p=el;p;p=p.parentElement){const c=color(getComputedStyle(p).backgroundColor);if(c[3]===255)return c;}return [255,255,255,255];};
    const visible=el=>{if(!el.getClientRects().length||el.closest('[hidden]'))return false;const r=el.getBoundingClientRect(),bounds=root.getBoundingClientRect();if(r.bottom<=bounds.top||r.top>=bounds.bottom)return false;for(let p=el.parentElement;p&&p!==root;p=p.parentElement){const s=getComputedStyle(p),clip=p.getBoundingClientRect();if(/auto|scroll|hidden/.test(s.overflowY)&&(r.top>=clip.bottom||r.bottom<=clip.top))return false;}return true;};
    const failures=[],ratios=[],walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    while(walker.nextNode()){const node=walker.currentNode,el=node.parentElement;if(!node.textContent.trim()||!visible(el))continue;const ratio=contrast(color(getComputedStyle(el).color),background(el));ratios.push(ratio);if(ratio<4.5)failures.push('text contrast');}
    for(const el of root.querySelectorAll('button,input:not([type=checkbox]),select,.review-hidden')){if(!visible(el)||el.disabled)continue;const r=el.getBoundingClientRect(),s=getComputedStyle(el);if(r.width<43.9||r.height<43.9)failures.push('target size');if(el.matches('input,select')&&contrast(color(s.borderTopColor),background(el))<3)failures.push('field boundary');if(el.matches(':focus-visible')&&s.outlineStyle!=='none'&&contrast(color(s.outlineColor),background(el))<3)failures.push('focus contrast');}
    const r=root.getBoundingClientRect();if(r.left<0||r.right>innerWidth+1||r.top<0||r.bottom>innerHeight+1||root.scrollWidth>root.clientWidth+1)failures.push('overflow');return {minimumTextContrast:Math.min(...ratios),failures};
  });
  const profiles=[];
  for(const mode of ['light','dark']){
    await page.setViewportSize({width:1200,height:800});await page.locator('#appearance-toggle').click();await page.locator('#appearance-mode').selectOption(mode);await page.keyboard.press('Escape');
    for(const [width,height]of [[1200,800],[800,560],[390,840]]){
      await page.setViewportSize({width,height});await openReview();await page.locator('[data-review-folder]').selectOption(fixture.folder);await settle();await page.locator('[data-review-tag]').fill('review-proof');await settle();await page.locator('[data-review-tag]').focus();
      const result=await measure();if(result.failures.length)throw new Error(JSON.stringify({mode,width,result}));await page.screenshot({path:`output/playwright/review-${native?'native':'preview'}-${mode}-${width}.png`});profiles.push({mode,width,height,...result});
      await page.locator('[data-review-note]').last().locator('button').last().focus();record(`${mode} ${width}px review can scroll to its last action`,await page.locator('[data-review-list]').evaluate(el=>el.scrollTop>0||el.closest('dialog').scrollTop>0));await page.keyboard.press('Escape');
    }
  }
  await page.setViewportSize({width:800,height:600});await page.evaluate(()=>{document.documentElement.style.fontSize='200%';});await openReview();await page.locator('[data-review-tag]').focus();const largeText=await measure();if(largeText.failures.length)throw new Error(JSON.stringify({largeText}));await page.screenshot({path:`output/playwright/review-${native?'native':'preview'}-text-200.png`});
  await page.locator('[data-review-note]').last().locator('button').last().focus();record('200% text uses a full dialog scroll instead of a tiny queue viewport',await page.locator('[data-review-list]').evaluate(el=>getComputedStyle(el).overflowY==='visible'&&el.closest('dialog').scrollTop>0));await page.keyboard.press('Escape');await page.evaluate(()=>{document.documentElement.style.fontSize='';});
  record('no uncaught UI errors',errors.length===0);return {passed:true,native,syntheticOnly:true,noGenerationRequested:true,checks,profiles,largeText,errors};
}

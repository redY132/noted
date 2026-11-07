// Run before and after UTC midnight while the device's local date stays the same.
// Only generated notes in a verified disposable Windows fixture are used.
async page=>{
  if(!await page.evaluate(()=>Boolean(window.__TAURI_INTERNALS__)))throw new Error('Native midnight fixture required');
  const status=await page.evaluate(()=>window.__TAURI_INTERNALS__.invoke('workspace_status'));if(!status.path.includes('noted-sidebar-ui-')||!await page.evaluate(()=>localStorage.getItem('noted-sidebar-fixture')))throw new Error('Disposable midnight workspace required');
  return page.evaluate(async()=>{
    const invoke=(command,args)=>window.__TAURI_INTERNALS__.invoke(command,args),day=date=>`${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}`,now=new Date(),key='noted-review-midnight-fixture';
    const raw=localStorage.getItem(key);
    if(!raw){
      const folder=await invoke('create_folder',{name:'Synthetic UTC-boundary review',parentId:null}),reviewed=await invoke('create_note',{title:'Synthetic boundary reviewed note',folderId:folder.id}),control=await invoke('create_note',{title:'Synthetic boundary control note',folderId:folder.id});
      await invoke('review_action',{id:reviewed.id,action:'reviewed'});
      localStorage.setItem(key,JSON.stringify({folder:folder.id,reviewed:reviewed.id,control:control.id,utcDay:now.toISOString().slice(0,10),localDay:day(now)}));
      return {prepared:true,syntheticOnly:true,noGenerationRequested:true,awaitingUTCDateChange:true};
    }
    const fixture=JSON.parse(raw);if(now.toISOString().slice(0,10)===fixture.utcDay)return {prepared:true,pending:true,reason:'UTC_DATE_NOT_CHANGED',syntheticOnly:true};
    if(day(now)!==fixture.localDay)throw new Error('LOCAL_DAY_ALSO_CHANGED');
    const due=await invoke('review_feed',{folderId:fixture.folder,tag:'',includeHidden:false}),all=await invoke('review_feed',{folderId:fixture.folder,tag:'',includeHidden:true});
    if(due.some(item=>item.note.id===fixture.reviewed)||!due.some(item=>item.note.id===fixture.control)||!all.find(item=>item.note.id===fixture.reviewed)?.reasons.includes('Reviewed today'))throw new Error('LOCAL_REVIEW_BOUNDARY_FAILED');
    return {passed:true,syntheticOnly:true,noGenerationRequested:true,actualUTCDateChanged:true,deviceDateUnchanged:true,reviewedNoteStayedHidden:true,unreviewedControlVisible:true};
  });
}

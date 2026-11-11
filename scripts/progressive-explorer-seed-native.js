async page => {
  const allowed=await page.evaluate(async()=>{
    const expected=window.notedCachedFixture?.workspace;
    if(!expected||!/noted-simple-ai-[A-Za-z0-9]+[\\/]workspace$/i.test(expected)||localStorage.getItem('noted-sidebar-fixture'))return false;
    const normalize=v=>String(v).replaceAll('\\','/').replace(/^\/\/\?\//,'').toLowerCase();
    const [s,r,p]=await Promise.all(['workspace_status','subscription_status','agent_access'].map(c=>window.__TAURI_INTERNALS__.invoke(c)));
    return normalize(s.path)===normalize(expected)&&r.authentication==='disabled'&&!r.available&&!p.enabled&&!p.allowHosted&&!p.folderIds.length;
  });
  if(!allowed)throw new Error('Fresh exact disabled generated native workspace required');
  await page.evaluate(async()=>{
    const invoke=window.__TAURI_INTERNALS__.invoke;
    const folder=(name,parentId)=>invoke('create_folder',{name,parentId});
    const project=await folder('Synthetic field journal',null),research=await folder('Research',project.id),observations=await folder('Observations',research.id);
    const empty=await folder('Empty collection',project.id),long=await folder('A deliberately long collection name for navigation reflow',null);
    let parent=observations.id;
    for(const name of ['Archive','2026','November','Week one'])parent=(await folder(name,parent)).id;
    const notes=[];
    for(let i=0;i<105;i++){
      const folderId=i<95?observations.id:i<100?parent:i<104?long.id:null;
      const note=await invoke('create_note',{title:i===0?'Synthetic trail map':'Synthetic observation '+String(i+1).padStart(3,'0'),folderId});
      note.content={type:'doc',content:[{type:'paragraph',attrs:{id:'synthetic-'+i},content:[{type:'text',text:'Synthetic sidebar fixture. No personal notes are used.'}]}]};
      await invoke('save_note',{note,expectedRevision:note.revision});notes.push(note.id);
    }
    for(const [start,end] of [[1,18],[81,95]])for(let i=start;i<end;i++)await invoke('set_relation',{a:notes[i-1],b:notes[i],connected:true,dismissed:null,expectedRevision:null,strength:null});
    localStorage.setItem('noted-sidebar-fixture',JSON.stringify({project:project.id,research:research.id,observations:observations.id,empty:empty.id,long:long.id,leaf:parent,notes}));
  });
  await page.reload();
  return{syntheticOnly:true,noGenerationRequested:true,fixtureReady:true,notes:105};
}

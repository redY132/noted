import type { Folder, Note, PairState, NoteSummary } from './model.ts';

export type PreviewRelations = Record<string, PairState>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const summary = ({ content: _c, presentation: _p, formatVersion: _f, revisionToken: _t, ...note }: Note): NoteSummary => note;
const page = <T>(items:T[], args:Record<string,unknown>) => {
  const offset = Math.max(0, Number(args.cursor) || 0), limit = Math.max(1, Math.min(100, Number(args.limit) || 40));
  return {items:items.slice(offset,offset+limit),nextCursor:offset+limit<items.length?offset+limit:null,total:items.length};
};
function refs(value: unknown, result = new Map<string,number>()): Map<string,number> {
  if (!value || typeof value !== 'object') return result;
  const node=value as {type?:string;attrs?:{href?:string};marks?:unknown[];content?:unknown[]};
  if (node.type==='link' || node.type==='localImage') {
    const id=node.attrs?.href?.match(/^noted:\/\/note\/([0-9a-f-]{36})$/)?.[1];
    if(id && uuid.test(id)) result.set(id,(result.get(id)||0)+1);
  }
  for(const child of [...node.marks??[],...node.content??[]]) refs(child,result);
  return result;
}
/** Preview scans are intentionally separate from production indexed queries. */
export function previewRelationOperation(state:PreviewRelations,command:string,args:Record<string,unknown>,notes:Note[],folders:Folder[]) {
  if(command==='export_relations')return {formatVersion:1,pairs:Object.values(state).map(pair=>({...pair})).sort((a,b)=>a.a.localeCompare(b.a)||a.b.localeCompare(b.b))};
  const pair=(a:string,b:string) => {
    if(!uuid.test(a)||!uuid.test(b)||a===b)throw Error('Choose two different valid notes.');
    const ids=[a,b].sort(); const key=ids.join('/');
    return {key, value:state[key]??{a:ids[0],b:ids[1],connected:false,dismissed:false,revision:0}};
  };
  const source=String(args.noteId??args.sourceId??'');
  if(command==='set_relation') {
    const {key,value}=pair(String(args.a),String(args.b));
    if(args.expectedRevision!==undefined && value.revision!==args.expectedRevision)throw Error('Connection changed; Undo was not applied.');
    if(args.connected===true && (!notes.some(n=>n.id===value.a)||!notes.some(n=>n.id===value.b)))throw Error('Connection target is unavailable.');
    const next={...value,connected:typeof args.connected==='boolean'?args.connected:value.connected,dismissed:typeof args.dismissed==='boolean'?args.dismissed:value.dismissed};
    if(next.connected)next.dismissed=false;
    const changed=next.connected!==value.connected||next.dismissed!==value.dismissed;
    if(changed){next.revision++;state[key]=next;}
    return {state:next,previous:value,changed};
  }
  if(command==='restore_dismissed') {
    let count=0; for(const value of Object.values(state))if(value.dismissed&&(value.a===source||value.b===source)){value.dismissed=false;value.revision++;count++;}return count;
  }
  const folderPath=(id:string|null):string => {const seen=new Set<string>();let result='';while(id&&!seen.has(id)){seen.add(id);const f=folders.find(f=>f.id===id);if(!f)break;result=f.name+' '+result;id=f.parentId;}return result;};
  const query=String(args.query??'').toLocaleLowerCase().trim();
  const matches=notes.filter(n=>!query||query.split(/\s+/).every(t=>(n.title+' '+n.tags.join(' ')+' '+folderPath(n.folderId)).toLocaleLowerCase().includes(t))).sort((a,b)=>Number(b.title.toLocaleLowerCase().includes(query))-Number(a.title.toLocaleLowerCase().includes(query))||b.updatedAt.localeCompare(a.updatedAt)||a.id.localeCompare(b.id));
  if(command==='list_notes_page')return page(matches.filter(n=>args.folderId===undefined||(args.folderId===''?n.folderId===null:n.folderId===args.folderId)).map(summary),args);
  if(command==='picker_notes')return page(matches.filter(n=>n.id!==source).map(n=>({note:summary(n),connected:pair(source,n.id).value.connected})),args);
  if(command==='list_connections')return page(Object.values(state).filter(s=>s.connected&&(s.a===source||s.b===source)).map(s=>{const id=s.a===source?s.b:s.a;return {noteId:id,note:notes.find(n=>n.id===id)?summary(notes.find(n=>n.id===id)!):null,state:s};}),args);
  if(command==='list_references') {
    const outgoing=refs(notes.find(n=>n.id===source)?.content), ids=new Set(outgoing.keys());
    const incoming=new Map<string,number>();for(const n of notes){const count=refs(n.content).get(source);if(count&&n.id!==source){incoming.set(n.id,count);ids.add(n.id);}}
    return page([...ids].filter(id=>id!==source).map(id=>({noteId:id,note:notes.find(n=>n.id===id)?summary(notes.find(n=>n.id===id)!):null,outgoing:outgoing.get(id)||0,incoming:incoming.get(id)||0})),args);
  }
  if(command==='related_notes') {
    const original=notes.find(n=>n.id===source);if(!original)return page([],args);
    const tokens=new Set(original.title.toLocaleLowerCase().split(/\W+/).filter(t=>t.length>2));
    const items=notes.filter(n=>n.id!==source).filter(n=>{const s=pair(source,n.id).value;return !s.connected&&!s.dismissed;}).map(n=>{
      const shared=n.tags.filter(t=>original.tags.includes(t));const title=n.title.toLocaleLowerCase().split(/\W+/).filter(t=>tokens.has(t)).length;
      const score=shared.reduce((sum,t)=>sum+Math.log(1+notes.length/(1+notes.filter(n=>n.tags.includes(t)).length)),0)+title;
      return {note:summary(n),score,reasons:[...shared.map(t=>'Shared tag: '+t),...(title?['Related wording']:[])]};
    }).filter(n=>n.score>0).sort((a,b)=>b.score-a.score||a.note.id.localeCompare(b.note.id));return page(items,args);
  }
  throw Error('Unknown connection operation');
}

import type { Folder, Note, PairState, NoteSummary } from './model.ts';

export type PreviewRelations = Record<string, PairState>;
const stopWords=new Set('the and for with this that from have has was were are not but you your our their can will would should into about when what which than then also one two its'.split(' '));
function terms(text:string) {return new Set(text.toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter(t=>t.length>=3&&/\p{L}/u.test(t)&&!stopWords.has(t)));}
function authored(node:Note['content']):string {return [node.text??'',...(node.content??[]).map(authored)].join(' ');}
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
  for(const value of Object.values(state))if(!Number.isInteger(value.strength)||value.strength<1||value.strength>5)value.strength=3;
  if(command==='export_relations')return {formatVersion:2,pairs:Object.values(state).map(pair=>({...pair})).sort((a,b)=>a.a.localeCompare(b.a)||a.b.localeCompare(b.b))};
  const pair=(a:string,b:string) => {
    if(!uuid.test(a)||!uuid.test(b)||a===b)throw Error('Choose two different valid notes.');
    const ids=[a,b].sort(); const key=ids.join('/');
    return {key, value:state[key]??{a:ids[0],b:ids[1],connected:false,dismissed:false,revision:0,strength:3}};
  };
  const source=String(args.noteId??args.sourceId??'');
  if(command==='connection_edges'){
    if(!Array.isArray(args.noteIds)||args.noteIds.length>60||args.noteIds.some(id=>typeof id!=='string'||!uuid.test(id)))throw Error('Choose at most 60 valid note IDs.');
    const visible=new Set(args.noteIds as string[]);if(source&&(!uuid.test(source)||!visible.has(source)))throw Error('Graph source must be visible.');
    return Object.values(state).filter(s=>s.connected&&visible.has(s.a)&&visible.has(s.b)).sort((a,b)=>Number(b.a===source||b.b===source)-Number(a.a===source||a.b===source)||b.strength-a.strength||a.a.localeCompare(b.a)||a.b.localeCompare(b.b)).slice(0,180);
  }
  if(command==='set_relation') {
    const {key,value}=pair(String(args.a),String(args.b));
    if(args.expectedRevision!==undefined && value.revision!==args.expectedRevision)throw Error('Connection changed; Undo was not applied.');
    if(args.strength!==undefined&&(!Number.isInteger(args.strength)||Number(args.strength)<1||Number(args.strength)>5))throw Error('Strength must be an integer from 1 to 5.');
    const next={...value,connected:typeof args.connected==='boolean'?args.connected:value.connected,dismissed:typeof args.dismissed==='boolean'?args.dismissed:value.dismissed,strength:args.strength===undefined?value.strength:Number(args.strength)};
    if(next.strength!==value.strength&&!next.connected&&!value.connected)throw Error('Only confirmed connections have editable strength.');
    if((args.connected===true||next.strength!==value.strength)&&(!notes.some(n=>n.id===value.a)||!notes.some(n=>n.id===value.b)))throw Error('Connection target is unavailable.');
    if(next.connected)next.dismissed=false;
    const changed=next.connected!==value.connected||next.dismissed!==value.dismissed||next.strength!==value.strength;
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
  if(command==='connection_search'){
    if(!uuid.test(source)||!notes.some(n=>n.id===source))throw Error('Connection source is unavailable.');
    if(args.scope!=='connected'&&args.scope!=='workspace')throw Error('Choose a valid search scope.');
    if(String(args.query??'').length>2048)throw Error('Search query is too long.');
    const words=query.split(/\s+/).filter(Boolean);
    const candidates=notes.filter(n=>n.id!==source&&(args.scope==='workspace'||pair(source,n.id).value.connected)&&words.every(t=>(n.title+' '+n.tags.join(' ')+' '+folderPath(n.folderId)+' '+authored(n.content)).toLocaleLowerCase().includes(t)));
    candidates.sort((a,b)=>Number(b.title.toLocaleLowerCase()===query)-Number(a.title.toLocaleLowerCase()===query)||Number(b.title.toLocaleLowerCase().includes(query))-Number(a.title.toLocaleLowerCase().includes(query))||(!query&&args.scope==='connected'?pair(source,b.id).value.strength-pair(source,a.id).value.strength:0)||b.updatedAt.localeCompare(a.updatedAt)||a.id.localeCompare(b.id));
    return {...page(candidates.map(n=>({note:summary(n),connected:pair(source,n.id).value.connected})),args),semanticPending:false,semanticAvailable:false,generation:0};
  }
  if(command==='list_connections')return page(Object.values(state).filter(s=>s.connected&&(s.a===source||s.b===source)).sort((a,b)=>b.strength-a.strength||a.a.localeCompare(b.a)||a.b.localeCompare(b.b)).map(s=>{const id=s.a===source?s.b:s.a;return {noteId:id,note:notes.find(n=>n.id===id)?summary(notes.find(n=>n.id===id)!):null,state:s};}),args);
  if(command==='list_references') {
    const outgoing=refs(notes.find(n=>n.id===source)?.content), ids=new Set(outgoing.keys());
    const incoming=new Map<string,number>();for(const n of notes){const count=refs(n.content).get(source);if(count&&n.id!==source){incoming.set(n.id,count);ids.add(n.id);}}
    return page([...ids].filter(id=>id!==source).map(id=>({noteId:id,note:notes.find(n=>n.id===id)?summary(notes.find(n=>n.id===id)!):null,outgoing:outgoing.get(id)||0,incoming:incoming.get(id)||0})),args);
  }
  if(command==='related_notes') {
    const original=notes.find(n=>n.id===source);if(!original)return page([],args);
    const live=new Set(notes.map(n=>n.id));
    const trusted=Object.values(state).filter(s=>s.connected&&(s.a===source||s.b===source)&&live.has(s.a)&&live.has(s.b)).sort((a,b)=>b.strength-a.strength||a.a.localeCompare(b.a)||a.b.localeCompare(b.b)).slice(0,32);
    const support=(candidate:string)=>Math.min(1,trusted.reduce((sum,link)=>{const neighbor=link.a===source?link.b:link.a;if(neighbor===candidate)return sum;const shared=pair(neighbor,candidate).value;return sum+(shared.connected?(link.strength-1)/4*(shared.strength-1)/4:0);},0));
    const tokensById=new Map(notes.map(n=>[n.id,terms(n.title+' '+authored(n.content).slice(0,8192))]));
    const frequency=new Map<string,number>();for(const tokens of tokensById.values())for(const t of tokens)frequency.set(t,(frequency.get(t)||0)+1);
    const commonLimit=Math.max(2,Math.ceil(notes.length*.10)), rareLimit=Math.max(2,Math.ceil(notes.length*.01));
    const distinctive=[...tokensById.get(source)??[]].filter(t=>frequency.get(t)!>1&&frequency.get(t)!<=commonLimit).sort((a,b)=>frequency.get(a)!-frequency.get(b)!||a.localeCompare(b)).slice(0,24);
    const items=notes.filter(n=>n.id!==source).filter(n=>{const s=pair(source,n.id).value;return !s.connected&&!s.dismissed;}).map(n=>{
      const shared=n.tags.filter(t=>original.tags.includes(t)&&notes.filter(n=>n.tags.includes(t)).length<=commonLimit);
      const overlap=distinctive.filter(t=>tokensById.get(n.id)!.has(t));
      const lexical=overlap.length>=2||overlap.some(t=>frequency.get(t)!<=rareLimit);
      const score=shared.reduce((sum,t)=>sum+Math.log(1+notes.length/(1+notes.filter(n=>n.tags.includes(t)).length)),0)+(lexical?overlap.length:0);
      const evidence=score>0?support(n.id):0;
      return {note:summary(n),score:score*(1+.2*evidence),reasons:[...shared.map(t=>'Shared tag: '+t),...(lexical?['Related wording']:[]),...(evidence>0?['Supported by shared connections']:[])]};
    }).filter(n=>n.score>0).sort((a,b)=>b.score-a.score||a.note.id.localeCompare(b.note.id));return page(items,args);
  }
  throw Error('Unknown connection operation');
}

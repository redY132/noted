// Disposable fixture only. Does not launch a model or read an existing workspace.
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {randomUUID,createHash} from 'node:crypto';
const root=await mkdtemp(join(tmpdir(),'noted-simple-ai-')),workspace=join(root,'workspace');
for(const name of ['notes','agent-requests','agent-replies'])await mkdir(join(workspace,name),{recursive:true});
const noteId=randomUUID(),blockId=randomUUID(),secondId=randomUUID(),requestId=randomUUID(),now=new Date().toISOString();
const content={type:'doc',content:[{type:'paragraph',attrs:{id:blockId},content:[{type:'text',text:'The blue lantern keeps every original word.'}]},{type:'paragraph',attrs:{id:secondId},content:[{type:'text',text:'A second paragraph retains its reading order.'}]}]};
const title=process.argv.includes('--long-title')?'Simple AI synthetic fixture with a deliberately long title that must wrap safely in a narrow writing area while the directory and graph remain visible':'Simple AI synthetic fixture';
const note={formatVersion:1,id:noteId,title,folderId:null,tags:[],revision:1,createdAt:now,updatedAt:now,content,presentation:{schemaId:'default'}},raw=JSON.stringify(note);
await writeFile(join(workspace,'notes',noteId+'.json'),raw);
const request={id:requestId,noteId,revision:1,revisionToken:createHash('sha256').update(raw).digest('hex'),prompt:'Make the first paragraph bold.',expiresAt:new Date(Date.now()+86400000).toISOString()};
await writeFile(join(workspace,'agent-requests',requestId+'.json'),JSON.stringify(request));
const bold=structuredClone(content.content[0]);bold.content[0].marks=[{type:'bold'}];
await writeFile(join(workspace,'agent-replies',requestId+'.json'),JSON.stringify({summary:'First paragraph bold; words and order retained.',operations:[{type:'format',id:blockId,content:bold}]}));
for(const state of ['expired','outdated']){const old={...request,id:randomUUID(),prompt:state+' fixture',revisionToken:'outdated',...(state==='expired'?{expiresAt:'2000-01-01T00:00:00+00:00'}:{})};await writeFile(join(workspace,'agent-requests',old.id+'.json'),JSON.stringify(old));}
await mkdir('output',{recursive:true});await writeFile('output/simple-ai-state.json',JSON.stringify({root,workspace,noteId,requestId},null,2));console.log(root);

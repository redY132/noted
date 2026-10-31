// Disposable browser/native graph fixture. Never opens a personal workspace.
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL(`../output/graph-ui-${Date.now()}/`, import.meta.url));
const count = 500, dense = process.argv.includes('--dense');
const id = n => `10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const folder = { id: id(800), name: 'Research', parentId: null };
await mkdir(path.join(root,'notes'), { recursive:true });
await mkdir(path.join(root,'folders'));
await writeFile(path.join(root,'folders',folder.id+'.json'),JSON.stringify(folder),{flag:'wx'});
const notes=[], pairs={}, labels=['Seed trials','Watercolour field journal','Architecture notes','Walking routes','Reading journal','Garden plans'];
for(let i=1;i<=count;i++){
  const orchard=i===1||(i>=100&&i<140);
  const text=orchard?'Orchard apple grafting rootstock pruning pollinator scion. Record seasonal observations and compare each planting.':'Telescope galaxy astronomy orbit observatory. Record the measurements, check the equipment, and compare results.';
  const content=Array.from({length:i===1?100:2},()=>({type:'paragraph',attrs:{id:randomUUID()},content:[{type:'text',text}]}));
  if(i===1)content.push({type:'paragraph',attrs:{id:randomUUID()},content:[{type:'text',text:'A written reference',marks:[{type:'link',attrs:{href:`noted://note/${id(3)}`}}]}]});
  if(i===2)content.push({type:'paragraph',attrs:{id:randomUUID()},content:[{type:'text',text:'A palimpsest record of the greenhouse thermostat.'}]});
  if(i===3)content.push({type:'paragraph',attrs:{id:randomUUID()},content:[{type:'text',text:'Back to the orchard',marks:[{type:'link',attrs:{href:`noted://note/${id(1)}`}}]}]});
  const note={formatVersion:1,id:id(i),title:i===1?'Orchard notebook':orchard?`Orchard grafting study ${i}`:`${labels[(i-2)%labels.length]} ${i}`,folderId:i<40?folder.id:null,tags:['journal',...(i===2?['seedling']:[])],revision:1,createdAt:'2026-10-30T16:00:00Z',updatedAt:'2026-10-30T16:00:00Z',presentation:{schemaId:'default'},content:{type:'doc',content}};
  notes.push(note);await writeFile(path.join(root,'notes',note.id+'.json'),JSON.stringify(note),{flag:'wx'});
}
const connect=(a,b,strength=3)=>{const first=id(Math.min(a,b)),second=id(Math.max(a,b));pairs[first+'/'+second]={a:first,b:second,connected:true,dismissed:false,strength,revision:1};};
for(let i=2;i<=21;i++)connect(1,i,i===2?5:3);
connect(1,999,4); // preserved unavailable target
for(let i=22;i<=41;i++)connect(2,i);
for(let i=42;i<=61;i++)connect(3,i);
for(let i=62;i<=81;i++)connect(4,i);
if(dense)for(let a=2;a<=81;a++)for(let b=a+1;b<=81;b++)connect(a,b,5);
else for(let i=2;i<80;i+=3)connect(i,i+1,2+(i%4));
const db=new DatabaseSync(path.join(root,'relations.sqlite3'));
db.exec('CREATE TABLE pairs(a TEXT,b TEXT,connected INTEGER,dismissed INTEGER,revision INTEGER,PRIMARY KEY(a,b))');
const insert=db.prepare('INSERT INTO pairs VALUES(?,?,?,?,?)');
db.exec('BEGIN');for(const pair of Object.values(pairs))insert.run(pair.a,pair.b,1,0,pair.revision);db.exec('COMMIT');db.close();
// Native schema intentionally starts at v1 to exercise backup/migration.
await writeFile(path.join(root,'browser-fixture.json'),JSON.stringify({notes,folders:[folder],pairs}),{flag:'wx'});
await writeFile(path.join(root,'manifest.json'),JSON.stringify({root,source:id(1),count,dense,totalWords:notes.reduce((sum,n)=>sum+n.content.content.flatMap(p=>p.content).map(n=>n.text).join(' ').split(/\s+/).length,0)}),{flag:'wx'});
console.log(root);

// Internal offline IPC codec. Its stdout is payload data and MUST be captured by
// the importer, never shown to an AI or written to diagnostics. No file/network IO.
import transit from 'transit-js';import {createInterface} from 'node:readline';
if(process.argv[2]!=='--private-pipe')throw new Error('Internal codec requires its importer pipe');
function normalize(value,depth=0,budget={nodes:0}){
 if(++budget.nodes>1000000||depth>64)throw new Error('LIMIT');
 const next=v=>normalize(v,depth+1,budget);
 if(value===null||typeof value==='boolean'||typeof value==='string')return value;
 if(typeof value==='number'){if(!Number.isFinite(value))throw new Error('NUMBER');return value;}
 if(transit.isKeyword(value))return{keyword:value.toString().slice(1)};
 if(transit.isSymbol(value))return{symbol:value.toString()};
 if(transit.isUUID(value))return{uuid:value.toString()};
 if(transit.isMap(value)){const pairs=[];value.forEach((v,k)=>pairs.push([next(k),next(v)]));return{map:pairs};}
 if(transit.isSet(value)){const values=[];value.forEach(v=>values.push(next(v)));return{set:values};}
 if(Array.isArray(value))return value.map(next);
 if(value instanceof Date)return{instant:value.getTime()};
 if(transit.isInteger(value))return{integer:value.toString()};
 if(transit.isTaggedValue(value))return{tag:value.tag,rep:next(value.rep)};
 throw new Error('UNSUPPORTED');
}
for await(const line of createInterface({input:process.stdin,crlfDelay:Infinity})){
 try{if(line.length>24*1024*1024)throw new Error('LIMIT');const request=JSON.parse(line);if(typeof request.content!=='string'||request.content.length>16*1024*1024)throw new Error('LIMIT');const result=normalize(transit.reader('json').read(request.content));process.stdout.write(JSON.stringify({value:result})+'\n');}
 catch{process.stdout.write('{"error":"UNSUPPORTED_TRANSIT"}\n');}
}

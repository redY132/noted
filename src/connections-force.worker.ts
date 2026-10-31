import {createConnectionsSimulation,type ForceEdge} from './connections-simulation.ts';
type Message = { type: 'update'; nodes:{id:string;x:number;y:number}[];edges:ForceEdge[];reduced:boolean;generation:number;interaction?:number } | {type:'stop'} | {type:'pin';id:string;x:number;y:number;release?:boolean;vx?:number;vy?:number;interaction?:number};
const scope = globalThis as unknown as {onmessage:((event:MessageEvent<Message>)=>void)|null;postMessage:(value:unknown)=>void};
let generation=0, interaction=0,reducedMode=false;
const layout=createConnectionsSimulation(),simulation=layout.simulation;
const positions=()=>scope.postMessage({type:'positions',generation,interaction,nodes:layout.nodes().map(n=>({id:n.id,x:n.x,y:n.y}))});
const settled=()=>scope.postMessage({type:'settled',generation,interaction});
simulation.on('tick',positions).on('end',settled);
scope.onmessage=({data})=>{
  if(data.type==='stop'){simulation.stop();return;}
  if(data.type==='pin') {interaction=data.interaction??interaction;layout.pin(data.id,data.x,data.y,data.release,!reducedMode?data.vx:0,!reducedMode?data.vy:0);
    if(reducedMode){simulation.stop();simulation.tick();positions();settled();}else simulation.alpha(.2).restart();return;}
  generation=data.generation;interaction=data.interaction??interaction;reducedMode=data.reduced;
  layout.update(data.nodes,data.edges);
  if(data.reduced){simulation.stop();simulation.tick(180);positions();settled();}
  else simulation.restart();
};

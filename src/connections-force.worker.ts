import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, forceX, forceY, type SimulationNodeDatum, type SimulationLinkDatum } from 'd3-force';

interface Node extends SimulationNodeDatum { id: string }
type Edge = SimulationLinkDatum<Node> & { strength: number };
type Message = { type: 'update'; nodes: Node[]; edges: {a:string;b:string;strength:number}[]; reduced: boolean; generation:number } | {type:'stop'} | {type:'pin';id:string;x:number;y:number;release?:boolean;vx?:number;vy?:number};
const scope = globalThis as unknown as {onmessage:((event:MessageEvent<Message>)=>void)|null;postMessage:(value:unknown)=>void};
let nodes:Node[]=[], generation=0, reducedMode=false;
const simulation=forceSimulation<Node>().velocityDecay(.16).stop();
simulation.on('tick',()=>scope.postMessage({type:'positions',generation,nodes:nodes.map(n=>({id:n.id,x:n.x,y:n.y}))}));
simulation.on('end',()=>scope.postMessage({type:'settled',generation}));
scope.onmessage=({data})=>{
  if(data.type==='stop'){simulation.stop();return;}
  if(data.type==='pin') {const node=nodes.find(n=>n.id===data.id);if(node){node.x=data.x;node.y=data.y;node.fx=data.release?null:data.x;node.fy=data.release?null:data.y;
    if(data.release&&!reducedMode){node.vx=Number.isFinite(data.vx)?Math.max(-24,Math.min(24,data.vx!)):0;node.vy=Number.isFinite(data.vy)?Math.max(-24,Math.min(24,data.vy!)):0;}
    if(reducedMode){simulation.stop();simulation.tick();scope.postMessage({type:'positions',generation,nodes:nodes.map(n=>({id:n.id,x:n.x,y:n.y}))});scope.postMessage({type:'settled',generation});}else simulation.alpha(.22).restart();}return;}
  generation=data.generation;reducedMode=data.reduced;
  const previous=new Map(nodes.map(n=>[n.id,n]));
  nodes=data.nodes.map(n=>Object.assign(previous.get(n.id)??{},n));
  const edges:Edge[]=data.edges.map(e=>({source:e.a,target:e.b,strength:e.strength}));
  simulation.nodes(nodes).force('link',forceLink<Node,Edge>(edges).id(n=>n.id).distance(e=>145-e.strength*13).strength(e=>.08+e.strength*.035))
    .force('charge',forceManyBody().strength(-180)).force('center',forceCenter(360,165)).force('collide',forceCollide(32).iterations(2))
    .force('horizontal',forceX(360).strength(.025)).force('vertical',forceY(165).strength(.12)).alpha(.7);
  if(data.reduced){simulation.stop();for(let i=0;i<120;i++)simulation.tick();scope.postMessage({type:'positions',generation,nodes:nodes.map(n=>({id:n.id,x:n.x,y:n.y}))});scope.postMessage({type:'settled',generation});}
  else simulation.restart();
};

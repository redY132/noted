import {forceSimulation,forceLink,forceManyBody,forceCollide,forceX,forceY,type SimulationNodeDatum,type SimulationLinkDatum} from 'd3-force';

export interface ForceNode extends SimulationNodeDatum {id:string}
export interface ForceEdge {a:string;b:string;strength:number}
type Link=SimulationLinkDatum<ForceNode>&{weight:number};

/** Link force must account for degree: a dense cluster must not pull with 50 full-strength springs per node. */
export function connectionSpring(strength:number,aDegree:number,bDegree:number){
  return(.12+Math.max(.35,Math.min(5,strength))*.045)/Math.max(1,Math.min(aDegree,bDegree));
}
export function createConnectionsSimulation(){
  const simulation=forceSimulation<ForceNode>().velocityDecay(.3).alphaDecay(.032).alphaMin(.003).stop();
  let nodes:ForceNode[]=[];
  function update(next:{id:string;x:number;y:number}[],edges:ForceEdge[]){
    const previous=new Map(nodes.map(n=>[n.id,n]));
    // Retained worker positions/velocities are authoritative. UI snapshots can be several frames older.
    nodes=next.map(n=>previous.get(n.id)??{...n,vx:0,vy:0});
    const degree=new Map<string,number>();for(const edge of edges){degree.set(edge.a,(degree.get(edge.a)??0)+1);degree.set(edge.b,(degree.get(edge.b)??0)+1);}
    const links:Link[]=edges.map(e=>({source:e.a,target:e.b,weight:e.strength}));
    simulation.nodes(nodes).force('link',forceLink<ForceNode,Link>(links).id(n=>n.id)
      .distance(e=>175-e.weight*14).strength(e=>connectionSpring(e.weight,degree.get((e.source as ForceNode).id)??1,degree.get((e.target as ForceNode).id)??1)))
      .force('charge',forceManyBody().strength(-180))
      .force('collide',forceCollide<ForceNode>(32).strength(.8).iterations(3))
      // Unlike forceCenter, these do not translate the entire scene on every tick, including while a node is held.
      .force('horizontal',forceX(360).strength(.018)).force('vertical',forceY(185).strength(.04)).alpha(previous.size?.28:.55);
    return nodes;
  }
  function pin(id:string,x:number,y:number,release=false,vx=0,vy=0){
    const node=nodes.find(n=>n.id===id);if(!node)return;
    node.x=x;node.y=y;node.fx=release?null:x;node.fy=release?null:y;
    node.vx=release&&Number.isFinite(vx)?Math.max(-18,Math.min(18,vx)):0;
    node.vy=release&&Number.isFinite(vy)?Math.max(-18,Math.min(18,vy)):0;
  }
  return{simulation,update,pin,nodes:()=>nodes};
}

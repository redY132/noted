// Reproducible physics comparison, no app workspace or model involved.
// node --experimental-strip-types scripts/graph-force-benchmark.ts
import {forceSimulation,forceLink,forceManyBody,forceCenter,forceCollide,forceX,forceY,type SimulationNodeDatum,type SimulationLinkDatum} from 'd3-force';
import {createConnectionsSimulation} from '../src/connections-simulation.ts';
interface Node extends SimulationNodeDatum{id:string}
type Edge=SimulationLinkDatum<Node>&{strength:number};
const input=Array.from({length:60},(_,i)=>({id:String(i),x:360+Math.cos(i*2.4)*Math.sqrt(i)*35,y:185+Math.sin(i*2.4)*Math.sqrt(i)*35}));
const pairs=[];for(let a=0;a<60;a++)for(let b=a+1;b<60&&pairs.length<180;b++)pairs.push({a:String(a),b:String(b),strength:1+(a+b)%5});
const oldNodes:Node[]=input.map(n=>({...n})),edges:Edge[]=pairs.map(e=>({source:e.a,target:e.b,strength:e.strength}));
// The shipped pre-fix force settings are retained here solely as a benchmark baseline.
const old=forceSimulation(oldNodes).stop().velocityDecay(.16).alpha(.7)
 .force('link',forceLink<Node,Edge>(edges).id(n=>n.id).distance(e=>145-e.strength*13).strength(e=>.08+e.strength*.035))
 .force('charge',forceManyBody().strength(-180)).force('center',forceCenter(360,165)).force('collide',forceCollide(32).iterations(2))
 .force('horizontal',forceX(360).strength(.025)).force('vertical',forceY(165).strength(.12));
const fixed=createConnectionsSimulation();fixed.update(input,pairs);
function measure(simulation:typeof old,nodes:()=>Node[]){const steps:number[]=[];const start=performance.now();for(let i=0;i<190;i++){const before=nodes().map(n=>({x:n.x!,y:n.y!}));simulation.tick();steps.push(Math.max(...nodes().map((n,j)=>Math.hypot(n.x!-before[j].x,n.y!-before[j].y))));}return{manualTickMs:performance.now()-start,lateMaxStep:Math.max(...steps.slice(-30)),lateTotalMaxSteps:steps.slice(-30).reduce((a,b)=>a+b,0)};}
const baseline=measure(old,()=>oldNodes),current=measure(fixed.simulation,fixed.nodes);
const before=fixed.nodes().map(n=>({id:n.id,x:n.x,y:n.y}));fixed.update(input,pairs);
console.log(JSON.stringify({nodes:60,edges:180,baseline,current,lateMovementReduction:1-current.lateTotalMaxSteps/baseline.lateTotalMaxSteps,refreshRetainedMaxDisplacement:Math.max(...fixed.nodes().map((n,i)=>Math.hypot(n.x!-before[i].x!,n.y!-before[i].y!))),limitations:['Deterministic synthetic force traces, not hardware FPS or human motion evaluation.','A step is one simulation tick in SVG view units.']},null,2));

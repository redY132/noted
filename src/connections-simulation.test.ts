import test from 'node:test';
import assert from 'node:assert/strict';
import {createConnectionsSimulation,connectionSpring} from './connections-simulation.ts';

function fixture(count:number){const nodes=Array.from({length:count},(_,i)=>({id:String(i),x:360+Math.cos(i*2.4)*Math.sqrt(i)*35,y:185+Math.sin(i*2.4)*Math.sqrt(i)*35}));const edges=[];for(let a=0;a<count;a++)for(let b=a+1;b<count&&edges.length<180;b++)edges.push({a:String(a),b:String(b),strength:1+(a+b)%5});return{nodes,edges};}
test('dense forces converge without sustained late oscillation',()=>{
 const {nodes,edges}=fixture(60),layout=createConnectionsSimulation();layout.update(nodes,edges);const movement:number[]=[];
 for(let tick=0;tick<190;tick++){const before=layout.nodes().map(n=>({x:n.x!,y:n.y!}));layout.simulation.tick();movement.push(Math.max(...layout.nodes().map((n,i)=>Math.hypot(n.x!-before[i].x,n.y!-before[i].y))));}
 assert.ok(layout.nodes().every(n=>Number.isFinite(n.x)&&Number.isFinite(n.y)));
 assert.ok(Math.max(...movement.slice(-30))<.3,`Late movement ${Math.max(...movement.slice(-30))}`);
 assert.ok(movement.slice(-30).reduce((a,b)=>a+b,0)<movement.slice(0,30).reduce((a,b)=>a+b,0)*.05);
});
test('refresh keeps retained positions and velocity, and dragging does not translate the whole scene',()=>{
 const {nodes,edges}=fixture(20),layout=createConnectionsSimulation();layout.update(nodes,edges);layout.simulation.tick(100);const before=layout.nodes().map(n=>({...n}));layout.update(nodes,edges);for(let i=0;i<nodes.length;i++){assert.equal(layout.nodes()[i].x,before[i].x);assert.equal(layout.nodes()[i].vx,before[i].vx);}
 layout.pin('0',1000,700);layout.simulation.tick();assert.equal(layout.nodes()[0].x,1000);assert.equal(layout.nodes()[0].y,700);layout.pin('0',1000,700,true,8,0);layout.simulation.tick();assert.notEqual(layout.nodes()[0].x,1000);assert.equal(layout.nodes()[0].fx,null);
});
test('strength still changes attraction, with bounded combined pull for high-degree nodes',()=>{
 assert.ok(connectionSpring(5,3,7)>connectionSpring(1,3,7));assert.ok(connectionSpring(5,59,59)*59<.35);assert.ok(connectionSpring(5,1,59)>connectionSpring(5,59,59));
});

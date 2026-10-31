import test from 'node:test';
import assert from 'node:assert/strict';
import {fitGraphCamera,revealGraphPoint,graphScreenPoint} from './connections-camera.ts';
test('Reset view fits all nodes and their title margins inside the plotting area',()=>{
 const nodes=[{x:-200,y:-310},{x:360,y:185},{x:890,y:680}],camera=fitGraphCamera(nodes);
 for(const n of nodes){assert.ok((n.x-88)*camera.k+camera.x>=15);assert.ok((n.x+88)*camera.k+camera.x<=705);assert.ok((n.y-30)*camera.k+camera.y>=13);assert.ok((n.y+62)*camera.k+camera.y<=341);}
});
test('revealing a distant result preserves zoom and note coordinates',()=>{
 const point={x:1900,y:-900},camera=revealGraphPoint({x:15,y:4,k:.8},point);assert.equal(camera.k,.8);assert.deepEqual(point,{x:1900,y:-900});assert.equal(point.x*camera.k+camera.x,625);assert.equal(point.y*camera.k+camera.y,42);
 const inside={x:360,y:170};assert.deepEqual(revealGraphPoint({x:0,y:0,k:1},inside),{x:0,y:0,k:1});
});
test('pan and node dragging use letterboxed SVG view coordinates',()=>{
 assert.deepEqual(graphScreenPoint(360,100,{left:0,top:0,width:720,height:200}),{x:360,y:185});
 assert.deepEqual(graphScreenPoint(370,200,{left:10,top:15,width:720,height:370}),{x:360,y:185});
});

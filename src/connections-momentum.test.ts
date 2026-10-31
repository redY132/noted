import test from 'node:test';
import assert from 'node:assert/strict';
import {coastStep,dragVelocity,nodeReleaseVelocity} from './connections-momentum.ts';
test('pan momentum decays gradually, stops, and is independent of frame frequency',()=>{
 const simulate=(dt:number)=>{let velocity={x:1,y:-.3},x=0,y=0;for(let elapsed=0;elapsed<960;elapsed+=dt){const step=coastStep(velocity,dt);x+=step.delta.x;y+=step.delta.y;velocity=step.velocity;}return{x,y,velocity};};
 const a=simulate(16),b=simulate(8);assert.ok(Math.abs(a.x-b.x)<1e-9);assert.ok(Math.abs(a.y-b.y)<1e-9);
 const first=coastStep({x:1,y:0},16);assert.ok(first.delta.x>10&&first.velocity.x>.8);assert.ok(coastStep(a.velocity,16).done);
 assert.ok(coastStep({x:1,y:1},5000).done);assert.ok(coastStep({x:1,y:0},5000).delta.x<64);
});
test('pointer throws are bounded; holding still and reduced motion prevent node momentum',()=>{
 const velocity=dragVelocity({x:0,y:0},{x:10000,y:-10000},16);assert.ok(velocity.x>0&&velocity.x<2.4);assert.ok(velocity.y<0);
 assert.deepEqual(dragVelocity(velocity,{x:9,y:9},200),{x:0,y:0});
 assert.deepEqual(nodeReleaseVelocity(velocity,120,1,false),{x:0,y:0});assert.deepEqual(nodeReleaseVelocity(velocity,0,1,true),{x:0,y:0});
 const released=nodeReleaseVelocity({x:2.4,y:-2.4},0,.08,false);assert.deepEqual(released,{x:24,y:-24});
 assert.ok(nodeReleaseVelocity(velocity,60,1,false).x<nodeReleaseVelocity(velocity,0,1,false).x);
});

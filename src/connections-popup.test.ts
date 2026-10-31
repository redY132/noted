import test from 'node:test';
import assert from 'node:assert/strict';
import {nodeClientPoint,placeNodePopup} from './connections-popup.ts';
test('the popup arrow follows transformed nodes without reading SVG geometry',()=>{
 assert.deepEqual(nodeClientPoint({x:360,y:185},{x:0,y:0,k:1},{left:0,top:36,width:1200,height:864}),{x:600,y:468,scale:1200/720});
 const p=placeNodePopup({x:600,y:468,radius:30},{width:250,height:110},{width:1200,height:900});assert.equal(p.side,'above');assert.equal(p.left+p.arrow,600);assert.ok(p.top+110<438);
});
test('popup flips below near the top, clamps at narrow edges and hides offscreen anchors',()=>{
 const p=placeNodePopup({x:780,y:58,radius:18},{width:250,height:130},{width:800,height:900});assert.equal(p.side,'below');assert.ok(p.left+250<=792);assert.ok(p.arrow<=234);assert.ok(p.top>=89);assert.equal(p.visible,true);
 assert.equal(placeNodePopup({x:-40,y:400,radius:18},{width:250,height:130},{width:800,height:900}).visible,false);
});

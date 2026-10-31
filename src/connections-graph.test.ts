import test from 'node:test';
import assert from 'node:assert/strict';
import { ConnectionsGraph,graphPairKey } from './connections-graph.ts';
import type { NoteSummary } from './model.ts';
const note=(id:string):NoteSummary=>({id,title:id,folderId:null,tags:[],revision:0,createdAt:'',updatedAt:''});

test('multi-selected notes survive suggestion paging and cannot be evicted by the node cap',()=>{
 const g=new ConnectionsGraph(note('root'));for(let i=0;i<59;i++){g.add(String(i),note(String(i)),true);g.multiSelected.add(String(i));}g.removeSuggestions();assert.equal(g.nodes.size,60);assert.equal(g.add('new',note('new')),false);assert.equal(g.nodes.size,60);
});

test('bounded exploration preserves root, selected node and full selected path',()=>{
 const g=new ConnectionsGraph(note('root'));
 for(let i=0;i<59;i++)g.add(`branch-${i}`,note(`branch-${i}`),false,i===0?'root':`branch-${i-1}`);
 g.select('branch-58');assert.equal(g.nodes.size,60);assert.equal(g.protectedIds().size,60);
 assert.equal(g.add('overflow',note('overflow')),false,'must offer Focus here when selected path fills cap');assert.equal(g.nodes.size,60);
});
test('least recently explored branches collapse while selected path survives',()=>{
 const g=new ConnectionsGraph(note('root'));g.add('old',note('old'));g.add('old-child',note('old-child'),false,'old');
 for(let i=0;i<57;i++)g.add(`peer-${i}`,note(`peer-${i}`));g.select('peer-0');
 assert.equal(g.add('new',note('new')),true);assert.equal(g.nodes.has('old'),false);assert.equal(g.nodes.has('old-child'),false);assert.equal(g.nodes.has('peer-0'),true);assert.equal(g.nodes.has('root'),true);assert.ok(g.nodes.size<=60);
});
test('graph merges preserve ephemeral positions and use actual bounded visible confirmed edges',()=>{
 const g=new ConnectionsGraph(note('root'));for(let i=0;i<25;i++)g.add(String(i),note(String(i)),true);
 g.position('0',123,234);g.add('0',{...note('0'),title:'Updated'},false);assert.equal(g.nodes.get('0')!.x,123);assert.equal(g.nodes.get('0')!.suggested,false);
 const edges=[];for(let i=0;i<25;i++)for(let j=i+1;j<25;j++)edges.push({a:String(i),b:String(j),connected:true,dismissed:false,strength:(i%5)+1,revision:1});
 edges.push({a:'root',b:'outside',connected:true,dismissed:false,strength:5,revision:1});g.setEdges(edges);assert.equal(g.edges.length+g.suggestionEdges().length,180);assert.equal(g.edges.some(e=>e.b==='outside'),false);assert.equal(g.edges[0].strength,5);
 assert.equal(graphPairKey('a/b','c'),graphPairKey('c','a/b'));assert.notEqual(graphPairKey('a/b','c'),graphPairKey('a','b/c'));
});
test('edge cap retains the confirmed selected path before stronger unrelated edges',()=>{
 const g=new ConnectionsGraph(note('root'));g.add('branch',note('branch'));g.add('leaf',note('leaf'),false,'branch');
 for(let i=0;i<25;i++)g.add(String(i),note(String(i)));g.select('leaf');
 const edges=[{a:'root',b:'branch',connected:true,dismissed:false,strength:1,revision:1},{a:'branch',b:'leaf',connected:true,dismissed:false,strength:1,revision:1}];
 for(let i=0;i<25;i++)for(let j=i+1;j<25;j++)edges.push({a:String(i),b:String(j),connected:true,dismissed:false,strength:5,revision:1});g.setEdges(edges);assert.equal(g.edges.length,180);assert.ok(g.edges.some(e=>e.a==='root'&&e.b==='branch'));assert.ok(g.edges.some(e=>e.a==='branch'&&e.b==='leaf'));
});
test('another visible manual edge does not confirm a suggestion for the source',()=>{
 const g=new ConnectionsGraph(note('root'));g.add('saved',note('saved'));g.add('candidate',note('candidate'),true);g.setEdges([{a:'saved',b:'candidate',strength:4,connected:true,dismissed:false,revision:1}]);assert.equal(g.nodes.get('candidate')!.suggested,true);assert.equal(g.suggestionEdges().length,1);g.setEdges([{a:'root',b:'candidate',strength:3,connected:true,dismissed:false,revision:2}]);assert.equal(g.nodes.get('candidate')!.suggested,false);assert.equal(g.suggestionEdges().length,0);
});
test('suggestion paging keeps a selected suggestion, clears other suggestions and preserves saved neighbors',()=>{
 const g=new ConnectionsGraph(note('root'));g.add('saved',note('saved'));g.add('selected',note('selected'),true);g.add('old',note('old'),true);g.select('selected');g.removeSuggestions();assert.equal(g.nodes.has('saved'),true);assert.equal(g.nodes.has('selected'),true);assert.equal(g.nodes.has('old'),false);
});

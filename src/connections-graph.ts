import type { NoteSummary } from './model.ts';

export interface GraphPair { a: string; b: string; connected: boolean; dismissed: boolean; revision: number; strength: number }
export interface GraphNode { id: string; note: NoteSummary | null; suggested: boolean; parent: string | null; explored: number; x: number; y: number }
export const graphPairKey = (a: string, b: string) => JSON.stringify([a,b].sort());
/** Bounded, ephemeral exploration state. Storage remains the source of truth for edges. */
export class ConnectionsGraph {
  nodes = new Map<string,GraphNode>();
  edges: GraphPair[] = [];
  selected: string;
  readonly multiSelected=new Set<string>();
  root: string;
  private clock = 0;
  constructor(note: NoteSummary) { this.root = this.selected = note.id; this.add(note.id,note,false,null); }
  protectedIds() {
    const ids = new Set([this.root,...this.multiSelected]); let node = this.nodes.get(this.selected);
    while(node && !ids.has(node.id)) { ids.add(node.id); node = node.parent ? this.nodes.get(node.parent) : undefined; }
    return ids;
  }
  add(id: string, note: NoteSummary | null, suggested = false, parent: string | null = this.root) {
    const existing = this.nodes.get(id);
    if(existing) { existing.note = note; existing.suggested = existing.suggested && suggested; return true; }
    if(this.nodes.size >= 60) {
      const protectedIds = this.protectedIds();
      const candidate = [...this.nodes.values()].filter(n => !protectedIds.has(n.id)).sort((a,b)=>a.explored-b.explored)[0];
      if(!candidate) return false;
      // Remove its branch, retaining any protected descendants and their path.
      const removed = new Set([candidate.id]);
      for(const node of this.nodes.values()) if(node.parent && removed.has(node.parent) && !protectedIds.has(node.id)) removed.add(node.id);
      for(const key of removed) this.nodes.delete(key);
      this.edges = this.edges.filter(e=>!removed.has(e.a)&&!removed.has(e.b));
    }
    const angle = this.nodes.size * 2.3999632297, radius = id === this.root ? 0 : 50 + Math.sqrt(this.nodes.size)*26;
    this.nodes.set(id,{id,note,suggested,parent,explored:++this.clock,x:360+Math.cos(angle)*radius,y:185+Math.sin(angle)*radius});
    return true;
  }
  select(id: string) { const node=this.nodes.get(id); if(node) {this.selected=id;node.explored=++this.clock;} }
  suggestionEdges() {return [...this.nodes.values()].filter(n=>n.suggested&&n.id!==this.root).map(n=>({a:this.root,b:n.id,strength:.35,suggested:true as const}));}
  setEdges(edges: GraphPair[]) {
    const visible=edges.filter(e=>e.connected&&this.nodes.has(e.a)&&this.nodes.has(e.b));
    for(const e of visible){if(e.a===this.root)this.nodes.get(e.b)!.suggested=false;if(e.b===this.root)this.nodes.get(e.a)!.suggested=false;}
    const protectedIds=this.protectedIds(), pathEdges=new Set<string>();
    for(const id of protectedIds){const node=this.nodes.get(id);if(node?.parent&&protectedIds.has(node.parent))pathEdges.add(graphPairKey(id,node.parent));}
    const priority=(e:GraphPair)=>pathEdges.has(graphPairKey(e.a,e.b))?3:e.a===this.root||e.b===this.root?2:this.nodes.get(e.a)?.parent===e.b||this.nodes.get(e.b)?.parent===e.a?1:0;
    this.edges=visible.sort((a,b)=>priority(b)-priority(a)||b.strength-a.strength||graphPairKey(a.a,a.b).localeCompare(graphPairKey(b.a,b.b))).slice(0,180-this.suggestionEdges().length);
  }
  position(id: string,x: number,y: number) {const node=this.nodes.get(id);if(node&&Number.isFinite(x)&&Number.isFinite(y)){node.x=x;node.y=y;}}
  removeSuggestions() {for(const [id,node] of this.nodes)if(node.suggested&&id!==this.selected&&!this.multiSelected.has(id))this.nodes.delete(id);}
}

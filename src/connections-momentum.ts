export interface MotionVector { x:number; y:number }
/** View units per millisecond; cap throws after coarse/stalled pointer events. */
export function dragVelocity(previous:MotionVector, delta:MotionVector, elapsed:number):MotionVector {
  if(elapsed<=0 || elapsed>120)return{x:0,y:0};
  const weight=1-Math.exp(-elapsed/35), cap=2.4;
  return{x:previous.x+(Math.max(-cap,Math.min(cap,delta.x/elapsed))-previous.x)*weight,
    y:previous.y+(Math.max(-cap,Math.min(cap,delta.y/elapsed))-previous.y)*weight};
}
/** Analytic exponential friction is consistent at 60/120 Hz and stops after a stall. */
export function coastStep(velocity:MotionVector, elapsed:number) {
  const dt=Math.max(0,Math.min(64,elapsed)), decay=Math.exp(-dt/220);
  const next={x:velocity.x*decay,y:velocity.y*decay};
  return{delta:{x:velocity.x*220*(1-decay),y:velocity.y*220*(1-decay)},velocity:next,
    done:elapsed>120 || Math.hypot(next.x,next.y)<.015};
}
/** d3 uses view units per tick; stale release motion must not create a surprise throw. */
export function nodeReleaseVelocity(velocity:MotionVector, idleMs:number, zoom:number,reduced:boolean):MotionVector {
  if(reduced || idleMs>100 || !Number.isFinite(zoom) || zoom<=0)return{x:0,y:0};
  const decay=Math.exp(-Math.max(0,idleMs)/60), scale=16.667*decay/zoom;
  return{x:Math.max(-24,Math.min(24,velocity.x*scale)),y:Math.max(-24,Math.min(24,velocity.y*scale))};
}

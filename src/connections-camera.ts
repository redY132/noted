export interface GraphCamera {x:number;y:number;k:number}
export interface GraphPoint {x:number;y:number}
/** Leave space for node circles, two title lines and the fixed graph hint. */
export function fitGraphCamera(nodes:GraphPoint[]):GraphCamera {
  if(!nodes.length)return{x:0,y:0,k:1};
  const left=Math.min(...nodes.map(n=>n.x))-88,right=Math.max(...nodes.map(n=>n.x))+88;
  const top=Math.min(...nodes.map(n=>n.y))-30,bottom=Math.max(...nodes.map(n=>n.y))+62;
  const k=Math.min(1.15,688/Math.max(1,right-left),326/Math.max(1,bottom-top));
  return{x:360-(left+right)*k/2,y:177-(top+bottom)*k/2,k};
}
/** Reveal a result by moving the camera; force coordinates remain untouched. */
export function revealGraphPoint(camera:GraphCamera,point:GraphPoint):GraphCamera {
  const x=point.x*camera.k+camera.x,y=point.y*camera.k+camera.y;
  return{...camera,x:camera.x+Math.max(95,Math.min(625,x))-x,y:camera.y+Math.max(42,Math.min(285,y))-y};
}
/** SVG uses xMidYMid meet, so pointer coordinates must account for letterboxing. */
export function graphScreenPoint(x:number,y:number,rect:{left:number;top:number;width:number;height:number}):GraphPoint {
  const width=rect.width||720,height=rect.height||370,scale=Math.min(width/720,height/370);
  return{x:(x-rect.left-(width-720*scale)/2)/scale,y:(y-rect.top-(height-370*scale)/2)/scale};
}

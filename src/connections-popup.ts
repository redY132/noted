/** Geometry only: popup tracking never needs a layout read during force frames. */
export function nodeClientPoint(node:{x:number;y:number},camera:{x:number;y:number;k:number},rect:{left:number;top:number;width:number;height:number}){
  const width=rect.width||720,height=rect.height||370,scale=Math.min(width/720,height/370);
  return{x:rect.left+(width-720*scale)/2+(node.x*camera.k+camera.x)*scale,
    y:rect.top+(height-370*scale)/2+(node.y*camera.k+camera.y)*scale,scale:scale*camera.k};
}
export function placeNodePopup(point:{x:number;y:number;radius:number},size:{width:number;height:number},viewport:{width:number;height:number}){
  const left=Math.max(8,Math.min(viewport.width-size.width-8,point.x-size.width/2));
  const above=point.y-point.radius-size.height-13>=44;
  const top=Math.max(44,Math.min(viewport.height-size.height-108,above?point.y-point.radius-size.height-13:point.y+point.radius+13));
  return{left,top,side:above?'above':'below',arrow:Math.max(16,Math.min(size.width-16,point.x-left)),
    visible:point.x>=0&&point.x<=viewport.width&&point.y>=36&&point.y<=viewport.height};
}

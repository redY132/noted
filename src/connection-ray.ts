type Point = { x: number; y: number };
type RayCurve = { source: Point; first: Point; second: Point; tip: Point };
export type RayMotion = { tip: Point; bend: Point; curveSign: number; curve?: RayCurve };

function curvePath(curve: RayCurve): string {
  const point = (value: Point) => `${Math.round(value.x * 100) / 100} ${Math.round(value.y * 100) / 100}`;
  return `M ${point(curve.source)} C ${point(curve.first)}, ${point(curve.second)}, ${point(curve.tip)}`;
}

/** Keep the beginning of the original curve so the arrow pulls back along its
 * own path rather than collapsing onto a straight line. */
export function retractRayPath(curve: RayCurve, remaining: number, anchor = curve.source): string {
  const t = Math.max(0, Math.min(1, remaining));
  const mix = (a: Point, b: Point): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const first = mix(curve.source, curve.first), middle = mix(curve.first, curve.second), last = mix(curve.second, curve.tip);
  const second = mix(first, middle), tip = mix(second, mix(middle, last));
  const offset = (point: Point): Point => ({ x: point.x + anchor.x - curve.source.x, y: point.y + anchor.y - curve.source.y });
  return curvePath({ source: anchor, first: offset(first), second: offset(second), tip: offset(tip) });
}

export function createRayMotion(point: Point): RayMotion {
  return { tip: { ...point }, bend: { ...point }, curveSign: 0 };
}

/** Two time-based followers give the connector a soft trailing bend at any refresh rate.
 * Geometry is visual only: drop targeting always uses the real pointer. */
export function updateRayMotion(motion: RayMotion, source: Point, pointer: Point, elapsed: number, reduced = false): string {
  const dt = Math.max(0, Math.min(64, elapsed));
  const follow = (point: Point, target: Point, response: number) => {
    const amount = reduced ? 1 : 1 - Math.exp(-dt / response);
    point.x += (target.x - point.x) * amount;
    point.y += (target.y - point.y) * amount;
  };
  follow(motion.tip, pointer, 75);
  follow(motion.bend, motion.tip, 130);
  const dx = motion.tip.x - source.x, dy = motion.tip.y - source.y;
  const length = Math.hypot(dx, dy), denominator = Math.max(1, length);
  // Pick an initial downward bow for top-bar handles, then keep its orientation
  // through turns instead of flipping the curve when the pointer crosses sides.
  if (!motion.curveSign && length > 1) motion.curveSign = dx < 0 ? -1 : 1;
  const bow = Math.min(80, length * .18);
  const nx = -dy / denominator * (motion.curveSign || 1), ny = dx / denominator * (motion.curveSign || 1);
  const lagX = motion.bend.x - motion.tip.x, lagY = motion.bend.y - motion.tip.y;
  const limit = Math.min(1, 140 / Math.max(1, Math.hypot(lagX, lagY)));
  const c1 = { x: source.x + dx * .3 + nx * bow, y: source.y + dy * .3 + ny * bow };
  const c2 = { x: source.x + dx * .72 + nx * bow + lagX * limit * .8, y: source.y + dy * .72 + ny * bow + lagY * limit * .8 };
  motion.curve = { source: { ...source }, first: c1, second: c2, tip: { ...motion.tip } };
  return curvePath(motion.curve);
}

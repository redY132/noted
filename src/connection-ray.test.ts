import test from 'node:test';
import assert from 'node:assert/strict';
import { createRayMotion, retractRayPath, updateRayMotion } from './connection-ray.ts';

test('connector trails pointer, bends, and settles without moving the real target', () => {
  const source = { x: 10, y: 20 }, pointer = { x: 410, y: 20 };
  const motion = createRayMotion(source);
  const path = updateRayMotion(motion, source, pointer, 16);
  assert.ok(motion.tip.x > source.x && motion.tip.x < pointer.x);
  assert.ok(motion.bend.x < motion.tip.x);
  assert.match(path, /^M 10 20 C /);
  assert.ok(Number(path.split(' C ')[1].split(',')[0].trim().split(' ')[1]) > source.y, 'horizontal gesture has a visible bow');
  for (let frame = 0; frame < 120; frame++) updateRayMotion(motion, source, pointer, 16);
  assert.ok(Math.abs(motion.tip.x - pointer.x) < .01);
  assert.deepEqual(pointer, { x: 410, y: 20 });
  const left = createRayMotion(source);
  const leftPath = updateRayMotion(left, source, { x: -390, y: 20 }, 16);
  assert.ok(Number(leftPath.split(' C ')[1].split(',')[0].trim().split(' ')[1]) > source.y, 'leftward connector stays below a top-bar handle');
  updateRayMotion(left, source, { x: 410, y: 20 }, 64);
  assert.equal(left.curveSign, -1, 'turning does not abruptly flip the curve');
});

test('motion is refresh-rate independent, bounded after stalls and immediate with reduced motion', () => {
  const source = { x: 0, y: 0 }, pointer = { x: 800, y: 300 };
  const slow = createRayMotion(source), fast = createRayMotion(source);
  for (let i = 0; i < 30; i++) updateRayMotion(slow, source, pointer, 1000 / 60);
  for (let i = 0; i < 60; i++) updateRayMotion(fast, source, pointer, 1000 / 120);
  assert.ok(Math.abs(slow.tip.x - fast.tip.x) < .001);
  const stalled = createRayMotion(source);
  assert.ok(!/NaN|Infinity/.test(updateRayMotion(stalled, source, pointer, 10000)));
  assert.ok(stalled.tip.x < pointer.x);
  const path = updateRayMotion(stalled, source, pointer, 0, true);
  assert.deepEqual(stalled.tip, pointer);
  assert.deepEqual(stalled.bend, pointer);
  assert.match(path, /, 800 300$/);
  assert.ok(!/NaN|Infinity/.test(updateRayMotion(stalled, pointer, pointer, 16, true)));
});

test('release retracts along the existing curve back to the moving source', () => {
  const motion = createRayMotion({ x: 10, y: 20 });
  const original = updateRayMotion(motion, { x: 10, y: 20 }, { x: 410, y: 20 }, 0, true);
  const curve = motion.curve!;
  assert.equal(retractRayPath(curve, 1), original);
  const half = retractRayPath(curve, .5).match(/-?\d+(?:\.\d+)?/g)!.map(Number);
  const expected = (key: 'x' | 'y') => (curve.source[key] + 3 * curve.first[key] + 3 * curve.second[key] + curve.tip[key]) / 8;
  assert.ok(Math.abs(half[6] - expected('x')) < .01);
  assert.ok(Math.abs(half[7] - expected('y')) < .01);
  assert.ok(half[7] > 20, 'arrow follows the bow instead of moving straight toward the source');
  assert.equal(retractRayPath(curve, 0, { x: 30, y: 40 }), 'M 30 40 C 30 40, 30 40, 30 40');
  assert.equal(retractRayPath(curve, -1), retractRayPath(curve, 0));
  assert.equal(retractRayPath(curve, 2), original);
  assert.equal(curve.tip.x, 410, 'retraction does not mutate the captured curve');
});

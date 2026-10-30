import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAX_IMAGE_BYTES, inspectGif, rasterDimensions, rasterMime, validateImageDimensions } from './image-assets.ts';

const png = new Uint8Array(readFileSync(new URL('../src-tauri/icons/icon.png', import.meta.url)));
test('local raster header dimensions match bundled PNG and reject oversized allocation', () => {
  assert.equal(rasterMime(png), 'image/png');
  const dimensions = rasterDimensions(png);
  assert.ok(dimensions.width > 0 && dimensions.height > 0);
  const huge = png.slice(); new DataView(huge.buffer).setUint32(16, 100_000);
  assert.throws(() => rasterDimensions(huge), /dimension limit/);
  assert.throws(() => validateImageDimensions(8000, 8000), /dimension limit/);
});
test('asset import rejects scripts, SVG, truncation, animation and excessive bytes', () => {
  for (const input of ['', '<svg onload="alert(1)"></svg>', '<script>alert(1)</script>', 'GIF89a']) {
    assert.throws(() => rasterMime(new TextEncoder().encode(input)));
  }
  assert.throws(() => rasterMime(png.slice(0, 35)), /Truncated|end chunk/);
  assert.throws(() => rasterMime(new Uint8Array(MAX_IMAGE_BYTES + 1)), /10 MiB/);
  const animated = png.slice(); animated.set(new TextEncoder().encode('acTL'), 12);
  assert.throws(() => rasterMime(animated), /Animated/);
});
test('JPEG and WebP headers are bounded before decode', () => {
  const jpeg = new Uint8Array([255,216,255,192,0,8,8,0,16,0,24,1]);
  assert.deepEqual(rasterDimensions(jpeg), { width: 24, height: 16 });
  assert.throws(() => rasterDimensions(jpeg.slice(0, 9)), /Truncated/);
  const webp = new Uint8Array(30);
  webp.set(new TextEncoder().encode('RIFF')); webp.set(new TextEncoder().encode('WEBPVP8X'), 8);
  new DataView(webp.buffer).setUint32(4, 22, true);
  webp[24] = 15; webp[27] = 23;
  assert.deepEqual(rasterDimensions(webp), { width: 16, height: 24 });
  webp[20] = 2; assert.throws(() => rasterMime(webp), /Animated/);
});

function gif(frames = 2, width = 1, height = 1) {
  const header = [...new TextEncoder().encode('GIF89a'), width & 255, width >> 8, height & 255, height >> 8, 0x80, 0, 0, 0, 0, 0, 255, 255, 255];
  const image = [0x21,0xf9,4,0,10,0,0,0, 0x2c,0,0,0,0,1,0,1,0,0,2,2,0x44,1,0];
  return new Uint8Array([...header, ...Array.from({ length: frames }, () => image).flat(), 0x3b]);
}
test('GIF supports animation while bounding frame count, canvas work and all blocks', () => {
  const valid = gif();
  assert.equal(rasterMime(valid), 'image/gif');
  assert.deepEqual(inspectGif(valid), { width: 1, height: 1, frames: 2 });
  assert.deepEqual(rasterDimensions(valid), { width: 1, height: 1 });
  assert.throws(() => inspectGif(gif(501)), /frame/);
  assert.throws(() => inspectGif(gif(5, 8000, 4000)), /frame-pixel/);
  assert.throws(() => inspectGif(valid.slice(0, -1)), /trailer/);
  assert.throws(() => inspectGif(valid.slice(0, 23)), /Truncated/);
  const outside = valid.slice(); outside[28] = 5;
  assert.throws(() => inspectGif(outside), /canvas/);
  const trailing = new Uint8Array([...valid, 0]);
  assert.throws(() => inspectGif(trailing), /trailer/);
});

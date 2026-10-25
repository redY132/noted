import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAX_IMAGE_BYTES, rasterDimensions, rasterMime, validateImageDimensions } from './image-assets.ts';

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

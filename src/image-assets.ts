/** Browser-side import guard. Native storage separately validates signatures and dimensions. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_GIF_FRAMES = 500;
export const MAX_GIF_FRAME_PIXELS = 128_000_000;

/** Walk all GIF blocks before decode, bounding full-canvas work across frames. */
export function inspectGif(bytes: Uint8Array): { width: number; height: number; frames: number } {
  if (bytes.length < 14 || bytes.length > MAX_IMAGE_BYTES || !['GIF87a', 'GIF89a'].includes(String.fromCharCode(...bytes.slice(0, 6)))) throw new Error('Invalid GIF header.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint16(6, true), height = view.getUint16(8, true);
  validateImageDimensions(width, height);
  let offset = 13, frames = 0;
  const advance = (count: number) => { if (offset + count > bytes.length) throw new Error('Truncated GIF.'); offset += count; };
  if (bytes[10] & 0x80) advance(3 * (1 << ((bytes[10] & 7) + 1)));
  const blocks = () => { let total = 0; for (;;) { if (offset >= bytes.length) throw new Error('Truncated GIF blocks.'); const size = bytes[offset++]; if (!size) return total; advance(size); total += size; } };
  while (offset < bytes.length) {
    const tag = bytes[offset++];
    if (tag === 0x3b) { if (!frames || offset !== bytes.length) throw new Error('Invalid GIF trailer.'); return { width, height, frames }; }
    if (tag === 0x21) { advance(1); blocks(); continue; }
    if (tag !== 0x2c || offset + 9 > bytes.length) throw new Error('Invalid GIF image block.');
    const left = view.getUint16(offset, true), top = view.getUint16(offset + 2, true);
    const frameWidth = view.getUint16(offset + 4, true), frameHeight = view.getUint16(offset + 6, true), packed = bytes[offset + 8];
    if (!frameWidth || !frameHeight || left + frameWidth > width || top + frameHeight > height) throw new Error('GIF frame exceeds its canvas.');
    advance(9);
    if (packed & 0x80) advance(3 * (1 << ((packed & 7) + 1)));
    if (offset >= bytes.length || bytes[offset] < 2 || bytes[offset] > 8) throw new Error('Invalid GIF code size.');
    advance(1);
    if (!blocks()) throw new Error('GIF image has no data.');
    frames++;
    if (frames > MAX_GIF_FRAMES || width * height * frames > MAX_GIF_FRAME_PIXELS) throw new Error('GIF exceeds the 500-frame / 128-million frame-pixel limit.');
  }
  throw new Error('GIF is missing its trailer.');
}
export function rasterMime(bytes: Uint8Array): string {
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error('Images must be between 1 byte and 10 MiB.');
  const starts = (values: number[]) => values.every((value, i) => bytes[i] === value);
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  if (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a') { inspectGif(bytes); return 'image/gif'; }
  if (starts([137, 80, 78, 71, 13, 10, 26, 10]) && bytes.length >= 33) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 8;
    while (offset + 12 <= bytes.length) {
      const size = view.getUint32(offset);
      if (offset + size + 12 > bytes.length) throw new Error('Truncated PNG.');
      const kind = ascii(offset + 4, offset + 8);
      if (kind === 'acTL') throw new Error('Animated images are not supported yet.');
      if (kind === 'IEND') return 'image/png';
      offset += size + 12;
    }
    throw new Error('PNG is missing its end chunk.');
  }
  if (starts([255, 216, 255])) return 'image/jpeg';
  if (bytes.length >= 30 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') {
    if (ascii(12, 16) === 'VP8X' && (bytes[20] & 2)) throw new Error('Animated images are not supported yet.');
    return 'image/webp';
  }
  throw new Error('Use PNG, JPEG, static WebP, or GIF images.');
}

export function validateImageDimensions(width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 16384 || height > 16384 || width * height > 32_000_000) {
    throw new Error('Image exceeds the 32 megapixel / 16384 pixel dimension limit.');
  }
}

/** Check dimensions before asking the browser to allocate decoded pixel memory. */
export function rasterDimensions(bytes: Uint8Array, mime = rasterMime(bytes)): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0, height = 0;
  if (mime === 'image/gif') {
    const gif = inspectGif(bytes); width = gif.width; height = gif.height;
  } else if (mime === 'image/png') {
    if (view.getUint32(8) !== 13 || String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR') throw new Error('Invalid PNG header.');
    width = view.getUint32(16); height = view.getUint32(20);
  } else if (mime === 'image/jpeg') {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 255) throw new Error('Invalid JPEG marker.');
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 1 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;
      const size = view.getUint16(offset);
      if (size < 2 || offset + size > bytes.length) throw new Error('Truncated JPEG.');
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
        if (size < 8) throw new Error('Truncated JPEG dimensions.');
        width = view.getUint16(offset + 5); height = view.getUint16(offset + 3); break;
      }
      offset += size;
    }
  } else if (mime === 'image/webp') {
    if (view.getUint32(4, true) + 8 !== bytes.length) throw new Error('Invalid WebP length.');
    const kind = String.fromCharCode(...bytes.slice(12, 16));
    const le24 = (i: number) => bytes[i] | bytes[i + 1] << 8 | bytes[i + 2] << 16;
    if (kind === 'VP8X') { width = le24(24) + 1; height = le24(27) + 1; }
    else if (kind === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 1 && bytes[25] === 0x2a) {
      width = view.getUint16(26, true) & 0x3fff; height = view.getUint16(28, true) & 0x3fff;
    } else if (kind === 'VP8L' && bytes[20] === 0x2f) {
      const bits = view.getUint32(21, true); width = (bits & 0x3fff) + 1; height = ((bits >>> 14) & 0x3fff) + 1;
    }
  }
  validateImageDimensions(width, height);
  return { width, height };
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { attachComponentMotion, attachImagePlayback, initializeMotionControl, registerImageSource, unregisterImageSource, setMotionEnabled } from './component-motion.ts';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true, url: 'http://localhost/' });
for (const name of ['window', 'document', 'localStorage']) Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name as keyof typeof dom.window] });
const preference = new dom.window.EventTarget() as unknown as MediaQueryList;
Object.defineProperty(preference, 'matches', { configurable: true, value: false, writable: true });
Object.defineProperty(dom.window, 'matchMedia', { value: () => preference });
const observers: { callback: IntersectionObserverCallback; disconnected: boolean }[] = [];
Object.defineProperty(globalThis, 'IntersectionObserver', { configurable: true, value: class {
  entry: { callback: IntersectionObserverCallback; disconnected: boolean };
  constructor(callback: IntersectionObserverCallback) { this.entry = { callback, disconnected: false }; observers.push(this.entry); }
  observe() {} disconnect() { this.entry.disconnected = true; }
} });
function visible(index: number, yes: boolean) { observers[index].callback([{ isIntersecting: yes } as IntersectionObserverEntry], {} as IntersectionObserver); }

test('component motion respects viewport, user pause, system reduced motion and control labels', () => {
  const button = document.createElement('button'); const element = document.createElement('section');
  const disposeControl = initializeMotionControl(button);
  const index = observers.length;
  const motion = attachComponentMotion(element, () => 'float');
  try {
    assert.equal(element.dataset.motionActive, 'false');
    visible(index, true); assert.equal(element.dataset.motionActive, 'true');
    button.click(); assert.equal(element.dataset.motionActive, 'false');
    assert.equal(button.getAttribute('aria-label'), 'Resume motion');
    button.click(); assert.equal(element.dataset.motionActive, 'true');
    Object.assign(preference, { matches: true }); preference.dispatchEvent(new dom.window.Event('change'));
    assert.equal(element.dataset.motionActive, 'false'); assert.equal(button.disabled, true);
    Object.assign(preference, { matches: false }); preference.dispatchEvent(new dom.window.Event('change'));
    assert.equal(element.dataset.motionActive, 'true');
  } finally { motion.destroy(); disposeControl(); setMotionEnabled(true); }
  assert.equal(observers[index].disconnected, true);
});

test('GIF playback uses a bounded static poster when paused/offscreen and resumes local source', () => {
  const image = document.createElement('img');
  Object.defineProperties(image, { naturalWidth: { value: 4000 }, naturalHeight: { value: 2000 } });
  let drawn = 0, size = [0, 0];
  dom.window.HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) { size = [this.width, this.height]; return { drawImage: () => { drawn++; } }; } as unknown as typeof dom.window.HTMLCanvasElement.prototype.getContext;
  dom.window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,cG9zdGVy';
  const url = 'blob:http://localhost/gif'; registerImageSource(url, 'image/gif');
  const index = observers.length; const playback = attachImagePlayback(image);
  try {
    visible(index, true); playback.setSource(url); image.dispatchEvent(new dom.window.Event('load'));
    assert.equal(image.getAttribute('src'), url); assert.deepEqual(size, [1024, 512]);
    setMotionEnabled(false); assert.ok(image.src.startsWith('data:image/png')); assert.equal(image.dataset.gifPlaying, 'false');
    setMotionEnabled(true); assert.equal(image.getAttribute('src'), url);
    visible(index, false); assert.ok(image.src.startsWith('data:image/png'));
    visible(index, true); assert.equal(image.getAttribute('src'), url);
    assert.equal(drawn, 1, 'one cached poster, no per-frame canvas work');
  } finally { playback.destroy(); unregisterImageSource(url); setMotionEnabled(true); }
  assert.equal(image.hasAttribute('src'), false); assert.equal(observers[index].disconnected, true);
});

test('GIF pause removes the active source if poster capture is unavailable', () => {
  const image = document.createElement('img');
  Object.defineProperties(image, { naturalWidth: { value: 10 }, naturalHeight: { value: 10 } });
  dom.window.HTMLCanvasElement.prototype.getContext = (() => null) as typeof dom.window.HTMLCanvasElement.prototype.getContext;
  const url = 'blob:http://localhost/broken-poster'; registerImageSource(url, 'image/gif');
  const index = observers.length; const playback = attachImagePlayback(image);
  try {
    visible(index, true); playback.setSource(url); image.dispatchEvent(new dom.window.Event('load'));
    setMotionEnabled(false); assert.equal(image.hasAttribute('src'), false);
    setMotionEnabled(true); assert.equal(image.getAttribute('src'), url);
  } finally { playback.destroy(); unregisterImageSource(url); setMotionEnabled(true); }
});

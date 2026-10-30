/** Bounded visual presets and local GIF playback; no note-provided script executes. */
export type NoteAnimation = 'none' | 'fade' | 'float' | 'pulse';
const preferenceKey = 'noted-motion-enabled';
const listeners = new Set<() => void>();
const sources = new Map<string, string>();
let requested = true;
let initialized = false;
let reduced: MediaQueryList | undefined;
function initialize() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  try { requested = localStorage.getItem(preferenceKey) !== 'false'; } catch { /* restricted storage still allows this session's control */ }
  reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  reduced?.addEventListener('change', notify);
  document.addEventListener('visibilitychange', notify);
}
function notify() { for (const listener of listeners) listener(); }
export function motionEnabled() { initialize(); return requested && !reduced?.matches && !document.hidden; }
export function setMotionEnabled(enabled: boolean) {
  initialize(); requested = enabled;
  try { localStorage.setItem(preferenceKey, String(enabled)); } catch { /* session preference remains usable */ }
  notify();
}
export function registerImageSource(url: string, mime: string) { sources.set(url, mime); }
export function unregisterImageSource(url: string) { sources.delete(url); }
export function initializeMotionControl(button: HTMLButtonElement) {
  initialize();
  const update = () => {
    button.textContent = reduced?.matches ? 'Motion: reduced' : requested ? 'Motion: on' : 'Motion: paused';
    button.setAttribute('aria-label', reduced?.matches ? 'Motion reduced by system preference' : requested ? 'Pause motion' : 'Resume motion');
    button.setAttribute('aria-pressed', String(requested && !reduced?.matches));
    button.title = reduced?.matches ? 'System reduced-motion preference is active.' : 'Pause or resume note animations and GIFs. GIF playback resumes from its beginning.';
    button.disabled = Boolean(reduced?.matches);
  };
  const click = () => setMotionEnabled(!requested);
  button.addEventListener('click', click); listeners.add(update); update();
  return () => { button.removeEventListener('click', click); listeners.delete(update); };
}

export function attachComponentMotion(element: HTMLElement, getAnimation: () => unknown) {
  initialize();
  let visible = typeof IntersectionObserver === 'undefined';
  const refresh = () => {
    const animation = getAnimation();
    element.dataset.noteMotion = typeof animation === 'string' && ['fade', 'float', 'pulse'].includes(animation) ? animation : 'none';
    element.dataset.motionActive = String(visible && motionEnabled());
  };
  const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
    visible = entries.some(entry => entry.isIntersecting); refresh();
  });
  observer?.observe(element); listeners.add(refresh); refresh();
  return { refresh, destroy() { observer?.disconnect(); listeners.delete(refresh); } };
}

/** Browser GIF frames cannot be rate-capped through <img>. Swap in a static
 * poster when paused/offscreen; retain only a small preview and the owned URL. */
export function attachImagePlayback(image: HTMLImageElement) {
  initialize();
  let source = '', poster = '', animated = false, disposed = false, snapshotAttempted = false;
  let visible = typeof IntersectionObserver === 'undefined';
  const snapshot = () => {
    if (poster || !image.naturalWidth || !image.naturalHeight) return;
    snapshotAttempted = true;
    const canvas = document.createElement('canvas');
    const ratio = Math.min(1, 1024 / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    try { const context = canvas.getContext('2d'); if (context) { context.drawImage(image, 0, 0, canvas.width, canvas.height); poster = canvas.toDataURL('image/png'); } } catch { /* malformed bytes are shown by the image error UI */ }
  };
  const refresh = () => {
    if (disposed || !source) return;
    const playing = !animated || (visible && motionEnabled());
    image.dataset.gifPlaying = String(animated && playing);
    if (!playing) snapshot();
    const next = playing ? source : poster;
    // Until the first frame has loaded, keep the source just long enough to
    // produce a poster; the load handler immediately stops hidden playback.
    if (next && image.getAttribute('src') !== next) image.src = next;
    else if (!playing && snapshotAttempted && !poster) image.removeAttribute('src');
  };
  const load = () => { if (animated) { snapshot(); refresh(); } };
  const error = () => { if (animated && (!visible || !motionEnabled())) image.removeAttribute('src'); };
  const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
    visible = entries.some(entry => entry.isIntersecting); refresh();
  });
  observer?.observe(image); image.addEventListener('load', load); image.addEventListener('error', error); listeners.add(refresh);
  return {
    setSource(url: string) {
      if (source === url) { refresh(); return; }
      source = url; poster = ''; snapshotAttempted = false; animated = sources.get(url) === 'image/gif';
      image.src = source; refresh();
    },
    destroy() { disposed = true; observer?.disconnect(); image.removeEventListener('load', load); image.removeEventListener('error', error); listeners.delete(refresh); image.removeAttribute('src'); poster = ''; source = ''; },
  };
}

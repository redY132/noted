export type AppearanceMode = 'system' | 'light' | 'dark';
export type AppearanceState = { mode: AppearanceMode; accent: string; resolvedTheme: 'light' | 'dark' };
const preferenceKey = 'noted-appearance-v1';
export const DEFAULT_ACCENT = '#52525b';
export const ACCENT_SWATCHES = [
  { name: 'Graphite', color: DEFAULT_ACCENT }, { name: 'Blue', color: '#2563eb' },
  { name: 'Purple', color: '#7c3aed' }, { name: 'Red', color: '#dc2626' },
  { name: 'Amber', color: '#d97706' }, { name: 'Teal', color: '#0f766e' },
] as const;
const validMode = (value: unknown): value is AppearanceMode => typeof value === 'string' && ['system', 'light', 'dark'].includes(value);
const validAccent = (value: unknown): value is string => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
const rgb = (color: string) => [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16));
function luminance(color: string) {
  const channels = rgb(color).map(value => { const c = value / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; });
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
}
export function contrastRatio(first: string, second: string) {
  const a = luminance(first), b = luminance(second);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}
export function accentForeground(accent: string) {
  return contrastRatio(accent, '#000000') >= contrastRatio(accent, '#ffffff') ? '#000000' : '#ffffff';
}
function readableAccent(accent: string, background: string, dark: boolean) {
  const initial = rgb(accent), goal = dark ? 255 : 0;
  for (let step = 0; step <= 20; step++) {
    const color = '#' + initial.map(c => Math.round(c + (goal - c) * step / 20).toString(16).padStart(2, '0')).join('');
    if (contrastRatio(color, background) >= 4.5) return color;
  }
  return dark ? '#ffffff' : '#000000';
}

/** Device appearance only: never writes note content or presentation attributes. */
export function initializeAppearance(options: {
  root?: HTMLElement; storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
  media?: Pick<MediaQueryList, 'matches' | 'addEventListener' | 'removeEventListener'>;
} = {}) {
  const root = options.root ?? document.documentElement;
  let storage = options.storage;
  if (storage === undefined) { try { storage = window.localStorage; } catch { storage = null; } }
  const media = options.media ?? window.matchMedia?.('(prefers-color-scheme: dark)');
  let mode: AppearanceMode = 'system', accent = DEFAULT_ACCENT;
  try {
    const saved = JSON.parse(storage?.getItem(preferenceKey) ?? 'null');
    if (saved?.version === 1) { if (validMode(saved.mode)) mode = saved.mode; if (validAccent(saved.accent)) accent = saved.accent.toLowerCase(); }
  } catch { /* Invalid or unavailable local preferences use the safe defaults. */ }
  const listeners = new Set<(state: AppearanceState) => void>();
  const get = (): AppearanceState => ({ mode, accent, resolvedTheme: mode === 'system' ? media?.matches ? 'dark' : 'light' : mode });
  function apply(persist = true) {
    const state = get();
    root.dataset.theme = state.resolvedTheme; root.dataset.themeMode = mode;
    root.style.setProperty('--accent', accent);
    root.style.setProperty('--accent-foreground', accentForeground(accent));
    root.style.setProperty('--accent-text', readableAccent(accent, state.resolvedTheme === 'dark' ? '#202024' : '#f7f7f8', state.resolvedTheme === 'dark'));
    if (persist) { try { storage?.setItem(preferenceKey, JSON.stringify({ version: 1, mode, accent })); } catch { /* Remain usable for this session. */ } }
    for (const listener of listeners) listener(get());
  }
  const change = () => { if (mode === 'system') apply(false); };
  media?.addEventListener('change', change);
  apply(false);
  return {
    get,
    setMode(value: AppearanceMode) { if (!validMode(value)) throw new TypeError('Unknown appearance mode.'); mode = value; apply(); },
    setAccent(value: string) { if (!validAccent(value)) throw new TypeError('Choose a six-digit hex accent color.'); accent = value.toLowerCase(); apply(); },
    reset() { mode = 'system'; accent = DEFAULT_ACCENT; apply(); },
    subscribe(listener: (state: AppearanceState) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    destroy() { media?.removeEventListener('change', change); listeners.clear(); },
  };
}

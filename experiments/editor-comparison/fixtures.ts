import type { JSONContent } from '@tiptap/core';

export interface Workload { name: string; panels: number; paragraphs: number; images: number; freePlacement?: boolean; animated?: boolean }
export const workloads: Workload[] = [
  { name: 'ordinary-100-paragraphs', panels: 1, paragraphs: 100, images: 0 },
  { name: 'long-1000-paragraphs', panels: 1, paragraphs: 1000, images: 0 },
  { name: 'artistic-100-panels', panels: 100, paragraphs: 4, images: 10 },
  { name: 'mixed-free-media-100-panels', panels: 100, paragraphs: 4, images: 10, freePlacement: true, animated: true },
];
export const imageId = '00000000-0000-4000-8000-000000000001';
export const gifId = '00000000-0000-4000-8000-000000000002';
// Tiny local PNG, decoded into a blob URL. No network or user assets are used.
export const imageData = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7EIAAAAASUVORK5CYII=';
export function fixtureImageUrl(): string {
  return URL.createObjectURL(new Blob([Uint8Array.from(atob(imageData), c => c.charCodeAt(0))], { type: 'image/png' }));
}
// Two valid 1x1 GIF frames, alternating similar sage colors every 500ms. Tiny on purpose:
// this exercises animated asset lifecycle, not realistic photographic decode cost.
export const gifBytes = new Uint8Array([
  71,73,70,56,57,97,1,0,1,0,128,0,0,206,220,195,216,225,208,
  33,255,11,78,69,84,83,67,65,80,69,50,46,48,3,1,0,0,0,
  33,249,4,0,50,0,0,0,44,0,0,0,0,1,0,1,0,0,2,2,68,1,0,
  33,249,4,0,50,0,0,0,44,0,0,0,0,1,0,1,0,0,2,2,76,1,0,59,
]);
export function fixtureGifUrl(): string { return URL.createObjectURL(new Blob([gifBytes], { type: 'image/gif' })); }
const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
export function fixture(workload: Workload): JSONContent {
  let sequence = 100;
  const content: JSONContent[] = [];
  for (let panel = 0; panel < workload.panels; panel++) {
    const free = Boolean(workload.freePlacement && panel % 2);
    const placement = { placement: free ? 'free' : 'flow', x: free ? 180 + panel % 4 * 230 : 0,
      y: free ? 240 + Math.floor(panel / 4) * 180 : 0, z: free ? panel % 7 : 0,
      animation: workload.animated && panel % 5 === 1 ? 'float' : 'none' };
    content.push({ type: 'notePanel', attrs: { id: id(sequence++), width: 640, align: 'left', tone: 'soft', ...placement }, content:
      Array.from({ length: workload.paragraphs }, (_, paragraph) => ({ type: 'paragraph', attrs: { id: id(sequence++) }, content: [
        { type: 'text', text: `Panel ${panel + 1}, paragraph ${paragraph + 1}. ` },
        { type: 'text', marks: [{ type: 'bold' }], text: 'Remember this observation. ' },
        { type: 'text', text: 'A note connects everyday experiences with ideas worth revisiting. Clear writing preserves the details, questions, and discoveries that make reflection useful. ' },
        { type: 'text', marks: [{ type: 'link', attrs: { href: 'https://example.com/notes', target: '_blank', rel: 'noopener noreferrer nofollow', class: null } }], text: 'Local documents remain available without a network connection.' },
      ] })),
    });
    if (panel < workload.images) content.push({ type: 'localImage', attrs: { id: id(sequence++), assetId: workload.animated && panel % 2 ? gifId : imageId,
      alt: `Local fixture ${panel + 1}`, width: 480, align: 'left', placement: workload.freePlacement ? 'free' : 'flow',
      x: workload.freePlacement ? 1100 + panel % 2 * 170 : 0, y: workload.freePlacement ? 320 + panel * 190 : 0,
      z: workload.freePlacement ? 3 : 0, animation: 'none' } });
  }
  return { type: 'doc', content };
}
export function textOf(doc: JSONContent): string {
  return [doc.text ?? '', ...(doc.content ?? []).map(textOf)].join('');
}
export function fingerprint(doc: JSONContent): string {
  // Stable semantic comparison ignores editor-supplied default/null attributes.
  const clean = (node: JSONContent): unknown => ({ type: node.type, text: node.text,
    attrs: Object.fromEntries(Object.entries(node.attrs ?? {}).filter(([, value]) => value !== null && value !== 0)),
    marks: node.marks?.map(mark => ({ type: mark.type, attrs: mark.attrs })), content: node.content?.map(clean) });
  return JSON.stringify(clean(doc));
}

import type { JSONContent } from '@tiptap/core';

export interface Workload { name: string; panels: number; paragraphs: number; images: number }
export const workloads: Workload[] = [
  { name: 'ordinary-100-paragraphs', panels: 1, paragraphs: 100, images: 0 },
  { name: 'long-1000-paragraphs', panels: 1, paragraphs: 1000, images: 0 },
  { name: 'artistic-100-panels', panels: 100, paragraphs: 4, images: 10 },
];
export const imageId = '00000000-0000-4000-8000-000000000001';
// Tiny local PNG, decoded into a blob URL. No network or user assets are used.
export const imageData = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7EIAAAAASUVORK5CYII=';
export function fixtureImageUrl(): string {
  return URL.createObjectURL(new Blob([Uint8Array.from(atob(imageData), c => c.charCodeAt(0))], { type: 'image/png' }));
}
const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
export function fixture(workload: Workload): JSONContent {
  let sequence = 100;
  const content: JSONContent[] = [];
  for (let panel = 0; panel < workload.panels; panel++) {
    content.push({ type: 'notePanel', attrs: { id: id(sequence++), width: 640, align: 'left', tone: 'soft' }, content:
      Array.from({ length: workload.paragraphs }, (_, paragraph) => ({ type: 'paragraph', attrs: { id: id(sequence++) }, content: [
        { type: 'text', text: `Panel ${panel + 1}, paragraph ${paragraph + 1}. ` },
        { type: 'text', marks: [{ type: 'bold' }], text: 'Remember this observation. ' },
        { type: 'text', text: 'A note connects everyday experiences with ideas worth revisiting. Clear writing preserves the details, questions, and discoveries that make reflection useful. Local documents remain available without a network connection.' },
      ] })),
    });
    if (panel < workload.images) content.push({ type: 'localImage', attrs: { id: id(sequence++), assetId: imageId, alt: `Local fixture ${panel + 1}`, width: 480, align: 'left' } });
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

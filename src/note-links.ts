/** Stored links never grant access to local files, scripts or app commands. */
export function normalizeNoteLink(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text.length > 2048 || /[\u0000-\u001f\u007f\\]/.test(text)) return null;
  if (/^noted:\/\/note\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:#block=[A-Za-z0-9_.-]{1,200})?$/.test(text)) return text;
  try {
    const url = new URL(text);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) return null;
    return url.href.length <= 2048 ? url.href : null;
  } catch { return null; }
}

export function noteLinkTarget(value: unknown): { kind: 'note' | 'web'; destination: string; blockId?:string } | null {
  const href = normalizeNoteLink(value);
  if (!href) return null;
  if(href.startsWith('noted://note/')){const [destination,blockId]=href.slice('noted://note/'.length).split('#block=');return {kind:'note',destination,...(blockId?{blockId}:{})};}return {kind:'web',destination:href};
}

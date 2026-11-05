const storageKey = 'noted-folder-icons-v1';
export const folderIcons = [
  ['folder', 'Folder'], ['book', 'Book'], ['archive', 'Archive'], ['briefcase', 'Work'],
  ['leaf', 'Nature'], ['code', 'Code'], ['pencil', 'Writing'], ['bookmark', 'Bookmark'],
] as const;
export type FolderIcon = typeof folderIcons[number][0];
const paths: Record<FolderIcon, string> = {
  folder: '<path d="M3 6h6l2 2h10v11H3z"/>',
  book: '<path d="M12 5v15M12 6C9 3 5 4 3 5v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-2-9 1Z"/>',
  archive: '<path d="M3 4h18v4H3zM5 8v12h14V8M9 12h6"/>',
  briefcase: '<path d="M3 8h18v12H3zM8 8V4h8v4M3 12c6 4 12 4 18 0M10 14h4"/>',
  leaf: '<path d="M20 3C7 2 2 8 5 16s16 4 15-13ZM5 20 16 8"/>',
  code: '<path d="m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18"/>',
  pencil: '<path d="m4 15 11-11 5 5L9 20H4zm8-8 5 5"/>',
  bookmark: '<path d="M6 3h12v18l-6-4-6 4Z"/>',
};
export function validFolderIcon(value: unknown): value is FolderIcon {
  return typeof value === 'string' && Object.hasOwn(paths, value);
}
export function folderIconMarkup(value: unknown = 'folder') {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[validFolderIcon(value) ? value : 'folder']}</svg>`;
}
let memory: Record<string, FolderIcon> = {};
let cachedRaw: string | null | undefined;
let cachedStorage: Storage | undefined;
function readIcons() {
  try {
    const storage = localStorage, raw = storage.getItem(storageKey);
    if (storage === cachedStorage && raw === cachedRaw) return memory;
    cachedStorage = storage; cachedRaw = raw; memory = {};
    const value = JSON.parse(raw ?? 'null');
    if (value?.version === 1 && value.icons && typeof value.icons === 'object') {
      memory = Object.fromEntries(Object.entries(value.icons).filter(([id, icon]) => /^[0-9a-f-]{36}$/.test(id) && validFolderIcon(icon))) as Record<string, FolderIcon>;
    }
  } catch { /* Device preferences may be unavailable in restricted profiles. */ }
  return memory;
}
export const folderAppearance = {
  get(id: string): FolderIcon { return readIcons()[id] ?? 'folder'; },
  set(id: string, icon: FolderIcon) {
    if (!/^[0-9a-f-]{36}$/.test(id) || !validFolderIcon(icon)) throw new Error('Invalid folder icon.');
    memory = { ...readIcons(), [id]: icon };
    try { const raw = JSON.stringify({ version: 1, icons: memory }); localStorage.setItem(storageKey, raw); cachedRaw = raw; return true; }
    catch { return false; }
  },
};

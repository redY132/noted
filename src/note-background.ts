import { Extension } from '@tiptap/core';
import { accentForeground } from './appearance.ts';

// Imported presentation data never becomes arbitrary CSS or a network URL.
const colors: Record<string, string> = {
  yellow: '#fff0a3', red: '#ffd5d5', orange: '#ffdfb5', green: '#d9efc0',
  blue: '#d0e7ff', purple: '#e4d8ff', pink: '#ffd6ed', gray: '#e5e7eb',
};
export function normalizeBackground(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return Object.hasOwn(colors, value) || /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : null;
}
export const NoteBackground = Extension.create({
  name: 'noteBackground',
  addGlobalAttributes() {
    return [{ types: ['paragraph', 'heading', 'codeBlock', 'blockquote', 'table'], attributes: {
      noteBackground: {
        default: null,
        parseHTML: element => normalizeBackground(element.getAttribute('data-note-background')),
        renderHTML: attributes => {
          const color = normalizeBackground(attributes.noteBackground);
          if (!color) return {};
          const foreground = colors[color] ? '#17202a' : accentForeground(color);
          return { 'data-note-background': color, style: `background-color: ${colors[color] ?? color}; color: ${foreground}; --accent-text: ${foreground}` };
        },
      },
    } }];
  },
});

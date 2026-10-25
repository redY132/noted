import { Extension, type Command, type Extensions } from '@tiptap/core';
import type { Node as ProseMirrorNode, ResolvedPos } from '@tiptap/pm/model';
import StarterKit from '@tiptap/starter-kit';
import UniqueID from '@tiptap/extension-unique-id';
import { TaskList, TaskItem } from '@tiptap/extension-list';
import Highlight from '@tiptap/extension-highlight';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import TextAlign from '@tiptap/extension-text-align';
import { TableKit } from '@tiptap/extension-table';
import { Color, TextStyle } from '@tiptap/extension-text-style';
import type { SchemaId } from './model.ts';

export const MAX_INDENT = 8;
export const INDENT_STEP_EM = 2;
export const indentationHint = (schema: SchemaId) => schema === 'outline'
  ? 'Outline nests list items with Tab / Shift+Tab. Free paragraph indentation is disabled. Escape, then Tab leaves the editor.'
  : 'Tab / Shift+Tab indents paragraphs or nests list items. Escape, then Tab leaves the editor.';

export function normalizeTextColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const color = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(color)) return `#${color.slice(1).split('').map(c => c + c).join('')}`.toLowerCase();
  const rgb = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i.exec(color);
  if (!rgb) return null;
  const channels = rgb.slice(1).map(Number);
  return channels.every(channel => channel <= 255)
    ? `#${channels.map(channel => channel.toString(16).padStart(2, '0')).join('')}` : null;
}

const SafeColor = Color.extend({
  addGlobalAttributes() {
    return [{ types: ['textStyle'], attributes: { color: {
      default: null,
      parseHTML: element => normalizeTextColor(element.style.color),
      renderHTML: attributes => {
        const color = normalizeTextColor(attributes.color);
        return color ? { style: `color: ${color}` } : {};
      },
    } } }];
  },
  addCommands() {
    return {
      ...this.parent?.(),
      setColor: color => ({ chain }) => {
        const normalized = normalizeTextColor(color);
        return normalized ? chain().setMark('textStyle', { color: normalized }).run() : false;
      },
    };
  },
});

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    schemaIndentation: {
      indent: () => ReturnType;
      outdent: () => ReturnType;
    };
  }
}

function nearestItem(position: ResolvedPos): { name: string; list: ProseMirrorNode } | null {
  for (let depth = position.depth; depth > 0; depth--) {
    const name = position.node(depth).type.name;
    if (name === 'listItem' || name === 'taskItem') return { name, list: position.node(depth - 1) };
  }
  return null;
}

function inSpecialBlock(position: ResolvedPos): boolean {
  for (let depth = position.depth; depth > 0; depth--) {
    if (['table', 'codeBlock'].includes(position.node(depth).type.name)) return true;
  }
  return false;
}

// Commands only inspect the selected subtree. In particular, there is no
// document-wide normalization on ordinary typing or selection updates.
function changeIndent(delta: number, getSchemaId: () => SchemaId): Command {
  return ({ state, tr, dispatch, commands }) => {
    const { selection } = state;
    if (inSpecialBlock(selection.$from) || inSpecialBlock(selection.$to)) return false;
    const fromItem = nearestItem(selection.$from);
    const toItem = nearestItem(selection.$to);
    if (fromItem || toItem) {
      // One operation must not partially format a selection crossing different
      // lists or crossing from a list into a free paragraph.
      if (!fromItem || !toItem || fromItem.name !== toItem.name || fromItem.list !== toItem.list) return false;
      return delta > 0 ? commands.sinkListItem(fromItem.name) : commands.liftListItem(fromItem.name);
    }
    if (getSchemaId() === 'outline') return false;
    const blocks: { node: ProseMirrorNode; position: number }[] = [];
    let unsupported = false;
    state.doc.nodesBetween(selection.from, selection.to, (node, position) => {
      if (['bulletList', 'orderedList', 'taskList', 'table', 'codeBlock'].includes(node.type.name)) {
        unsupported = true;
        return false;
      }
      if (node.type.name === 'paragraph' || node.type.name === 'heading') {
        blocks.push({ node, position });
        return false;
      }
      return true;
    });
    if (unsupported || blocks.length === 0) return false;
    const changes = blocks.map(block => ({ ...block, indent: Math.max(0, Math.min(MAX_INDENT, (block.node.attrs.indent ?? 0) + delta)) }))
      .filter(block => block.indent !== block.node.attrs.indent);
    if (changes.length === 0) return false;
    if (dispatch) for (const { node, position, indent } of changes) tr.setNodeMarkup(position, undefined, { ...node.attrs, indent });
    return true;
  };
}

function focusOutsideEditor(editorElement: HTMLElement, backward: boolean): void {
  const focusables = Array.from(editorElement.ownerDocument.querySelectorAll<HTMLElement>(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]',
  )).filter(element => !editorElement.contains(element) && !element.closest('[hidden], [inert]') && element.getClientRects().length > 0);
  const direction = backward ? Node.DOCUMENT_POSITION_PRECEDING : Node.DOCUMENT_POSITION_FOLLOWING;
  const candidates = focusables.filter(element => Boolean(editorElement.compareDocumentPosition(element) & direction));
  const target = backward ? candidates.at(-1) ?? focusables.at(-1) : candidates[0] ?? focusables[0];
  editorElement.blur();
  target?.focus();
}

export const SchemaIndentation = Extension.create<{ getSchemaId: () => SchemaId }, { leaveOnTab: boolean }>({
  name: 'schemaIndentation',
  priority: 1100,
  addOptions: () => ({ getSchemaId: () => 'default' }),
  addStorage: () => ({ leaveOnTab: false }),
  addGlobalAttributes() {
    return [{ types: ['paragraph', 'heading'], attributes: { indent: {
      default: 0,
      parseHTML: element => {
        const value = Number(element.getAttribute('data-indent') ?? 0);
        return Number.isInteger(value) && value >= 0 && value <= MAX_INDENT ? value : 0;
      },
      renderHTML: attributes => {
        const indent = attributes.indent;
        return Number.isInteger(indent) && indent > 0 && indent <= MAX_INDENT
          ? { 'data-indent': indent, style: `margin-inline-start: ${indent * INDENT_STEP_EM}em` } : {};
      },
    } } }];
  },
  addCommands() {
    return {
      indent: () => changeIndent(1, this.options.getSchemaId),
      outdent: () => changeIndent(-1, this.options.getSchemaId),
    };
  },
  addKeyboardShortcuts() {
    const tab = (backward: boolean): boolean => {
      if (this.storage.leaveOnTab) {
        this.storage.leaveOnTab = false;
        focusOutsideEditor(this.editor.view.dom, backward);
        return true;
      }
      if (inSpecialBlock(this.editor.state.selection.$from)) return false;
      // Consume Tab in supported contexts even at nesting/indent limits, so it
      // never falls through to a conflicting list shortcut. Escape releases it.
      if (backward) this.editor.commands.outdent();
      else this.editor.commands.indent();
      return true;
    };
    return {
      Tab: () => tab(false),
      'Shift-Tab': () => tab(true),
      Escape: () => { this.storage.leaveOnTab = true; return true; },
      'Mod-]': () => this.editor.commands.indent(),
      'Mod-[': () => this.editor.commands.outdent(),
    };
  },
});

export function createEditorExtensions(getSchemaId: () => SchemaId = () => 'default'): Extensions {
  return [
    StarterKit.configure({
      codeBlock: { enableTabIndentation: true },
      link: { openOnClick: false, autolink: false, protocols: ['noted'], HTMLAttributes: { target: null, rel: null } },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Highlight.configure({ multicolor: false }),
    Subscript,
    Superscript,
    TextAlign.configure({ types: ['paragraph', 'heading'] }),
    TextStyle,
    SafeColor,
    TableKit.configure({ table: { resizable: false } }),
    SchemaIndentation.configure({ getSchemaId }),
    UniqueID.configure({ types: ['paragraph', 'heading', 'bulletList', 'orderedList', 'listItem', 'blockquote', 'codeBlock', 'horizontalRule', 'taskList', 'taskItem', 'table', 'tableRow', 'tableCell', 'tableHeader'] }),
  ];
}

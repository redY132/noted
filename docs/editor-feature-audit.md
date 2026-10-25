# Text editing audit

Reviewed October 24, 2026. This is a product and implementation audit against primary documentation, not a claim to have exhaustively tested the competing applications. Competitor capabilities below are documented behavior; “not verified” means the reviewed sources do not establish that feature, not that the application lacks it. The Noted baseline was inspected in `src/main.ts`, `src/style.css`, and the installed editor configuration before this editing upgrade.

## Main finding

Noted's initial toolbar substantially understated its editor's abilities. Bold and italic worked, but there was no selection-state feedback. Ordered lists, six heading levels, strikethrough, code, and horizontal rules existed through the editor library without discoverable controls. Paragraph indentation, task lists, tables, and meaningful schema-specific indentation were actual missing features. The initial Outline preset changed CSS only; it did not create a block hierarchy.

The immediate requirement is a complete, predictable everyday editing surface: discoverable commands, accurate selected/disabled states, keyboard access, and persistence that accepts everything the editor can create. A rich toolbar alone cannot establish feature support if saving or reopening loses the result.

## Comparison with established editors

Source keys link directly to official documentation. Features can differ between source Markdown and rendered editors; those differences are called out rather than treated as equivalent.

| Editing capability | Obsidian | Logseq | Notion | Joplin |
| --- | --- | --- | --- | --- |
| Bold / italic / strike | Documented [O1] | Documented [L1] | Documented [N1, N2] | Bold/italic; strike via HTML or Markdown extension [J1] |
| Underline | Not verified as a basic Markdown control | Not verified in reviewed docs | Documented shortcut [N2] | Not verified in reviewed docs |
| Highlight | Documented [O1] | Documented [L1] | Background/text colors [N2] | Documented, including rich-text shortcut conversion [J1, J2] |
| Heading levels | H1–H6 [O1] | Not independently verified here | H1–H3 [N1, N3] | Heading syntax [J1, J2] |
| Bullets / numbered lists | Both [O1] | Outline blocks; numbered-list toggle documented [L3] | Both [N1] | Both [J1] |
| Tasks | Checkbox lists [O1] | Task-status markers [L1] | Checkbox blocks [N1] | Interactive checkboxes [J1] |
| Indent / outdent | Nested lists; Tab / Shift+Tab [O1] | Parent-child block nesting [L2] | Indent nests under preceding block [N2] | Nested lists; raw tab/4-space code indentation [J1] |
| Free visual paragraph indent | Not established by basic Markdown; indentation can mean code [O1] | Structural nesting is the relevant documented model [L2] | Documented indent is structural [N2] | Not established for rich text; Markdown indentation can mean code [J1] |
| Inline code / code blocks | Both [O1] | Inline code verified [L1]; fenced syntax not independently audited | Both [N1, N2] | Both [J1] |
| Quotes / divider | Both [O1] | Not independently verified here | Both [N1] | Both [J1] |
| Links | Markdown and internal-link syntax [O1, O2] | URL, page and block references [L1] | URL and page links [N1, N2] | URL links [J1] |
| Tables | Live Preview cell editing and row/column actions [O2] | Not independently verified here | Simple tables, cell merge [N1, N3] | Tables; Markdown-backed rich-text constraints [J1, J2] |
| Folding / toggles | Heading and list folding [O3] | Collapse/expand blocks [L3] | Toggle blocks and toggle headings [N1, N3] | Not independently verified here |
| Block reordering | Not independently verified here | Block movement shortcuts [L3] | Drag handles [N1] | Not independently verified here |
| Markdown typing shortcuts | Markdown editing with smart lists [O3] | Markdown-supported content [L1] | Documented input conversions [N1] | Rich editor autoformats common patterns [J2] |

References for the table:

- [O1: Obsidian basic formatting](https://obsidian.md/help/syntax).
- [O2: Obsidian advanced formatting](https://obsidian.md/help/advanced-syntax).
- [O3: Obsidian editor settings](https://obsidian.md/help/settings).
- [L1: Logseq's official Markdown reference](https://github.com/logseq/docs/blob/master/pages/Markdown.md).
- [L2: Logseq Markdown Mirror syntax](https://github.com/logseq/logseq/blob/master/docs/logseq-markdown-syntax.md). This document concerns DB graph mirrors; it is evidence of structural nesting, not a promise of interchange compatibility with older file graphs.
- [L3: Logseq's own shortcut definitions](https://github.com/logseq/logseq/blob/master/src/main/frontend/modules/shortcut/config.cljs). This is source inspection, not a runtime test; no application code was copied.
- [N1: Notion writing and editing](https://www.notion.com/help/writing-and-editing-basics).
- [N2: Notion keyboard shortcuts](https://www.notion.com/help/keyboard-shortcuts).
- [N3: Notion headings, tables and dividers](https://www.notion.com/help/columns-headings-and-dividers).
- [J1: Joplin Markdown guide](https://joplinapp.org/help/apps/markdown/).
- [J2: Joplin rich text editor](https://joplinapp.org/help/apps/rich_text_editor/).

The sources do not establish uniform toolbar behavior across these products, so this audit does not infer that every application uses selected-state buttons. Noted needs them because it exposes toggle buttons: the control must communicate what applies at the current caret or selection.

## Noted baseline and required change

| Area | Before this upgrade | Required outcome |
| --- | --- | --- |
| Bold and italic | Buttons and library shortcuts; no selected state | Visible pressed state tied to editor selection and stored marks |
| Underline / highlight | Underline explicitly disabled; no highlight extension | Enable, persist, and expose both |
| Strikethrough / inline code | Library support without toolbar | Discoverable controls and shortcut hints |
| Headings / paragraph | Toolbar only toggled H2 | Paragraph and H1–H6 selector reflecting selection |
| Lists | Bullet button; ordered list via input rules; underlying nesting commands | Bullet, numbered and task controls; consistent nesting/outdenting |
| Free indentation | No paragraph indent attribute or command | Persisted bounded indentation for ordinary document schemas |
| Outline indentation | CSS padding, no structural policy | Indent changes a real parent-child relationship; no visual-indent substitute |
| Quotes / code / rules | Quote button, others library-only | Explicit commands; preserve wording during conversion |
| Alignment | Absent | Paragraph/heading alignment controls without arbitrary CSS injection |
| Tables | Absent from editor and Rust validation | Insert and edit basic tables; row/column actions, keyboard movement |
| URL links | Pasted supported marks could survive; only note-link picker exposed | Add/edit/remove links; preserve selection and validate URL scheme |
| Undo / redo | Buttons always looked available | Correct availability; formatting and structure changes undoable |
| Clear formatting | No control | Explicit text-format cleanup with predictable structural scope |
| Find in current note | Workspace search only | In-note find, next/previous and replacement, with undo |
| Keyboard / focus | Markdown typing and native editor basics | Toolbar access without dropping selection; documented indentation and task shortcuts |
| Clipboard | Library HTML handling | Preserve supported rich text; plain-text paste path; never run pasted scripts |
| Persistence | Strict backend accepts initial StarterKit nodes only | Rust and TypeScript agree on all added nodes, marks and attributes |

Normal selection, cut/copy/paste, word movement, deletion and undo are also part of the baseline. They should continue to use the editing engine and operating-system conventions rather than introduce competing custom implementations. Obsidian's [editing shortcut reference](https://obsidian.md/help/editing-shortcuts) illustrates the expected Windows behavior.

## Two meanings of indentation

For Paper/Compact documents, an indented paragraph remains a sibling of the preceding paragraph. Its visual offset is a bounded numeric attribute. Changing the offset must not insert spaces into the user's text, create a list, or imply ownership by a preceding block. Lists still use real list nesting even in this mode.

For an Outline schema, indent means “make this item a child of the previous sibling.” Outdent lifts it one structural level. A first item cannot be indented when no prior sibling exists. Nested descendants move with their parent. This is the behavior to borrow from outliners; painting every paragraph with extra left padding does not implement it. Logseq records nested blocks in its [official mirror format](https://github.com/logseq/logseq/blob/master/docs/logseq-markdown-syntax.md), while Notion explicitly describes indent as nesting in its [shortcut guide](https://www.notion.com/help/keyboard-shortcuts).

Changing a schema should not silently reinterpret all existing visual offsets as a hierarchy, or flatten a real hierarchy into margin values. Existing content should remain intact, with an explicit, undoable conversion when needed. At this stage, a hierarchy-aware indentation mode is not equivalent to full Logseq parity: block zoom, transclusion, collapsing, arbitrary block moves, and graph queries are separate capabilities.

Schema policies must govern commands and keyboard behavior, not merely appearance. Store validation should reject impossible indentation values and malformed nesting. Any future agent or plugin edit route must enforce the same document invariants. Schema enforcement and AI access are independent: every feature described in this upgrade can operate offline with no model call.

## Delivery order and acceptance criteria

1. Complete basic formatting, active states, heading selection, list/task operations and indentation. Verify a cursor in bold text, a selection spanning differently formatted text, and a toggle before typing. Disabled commands must be distinguishable from inactive commands.
2. Complete everyday structure: code/quotes/rules, links, alignment and basic tables. Preserve selection when opening a dialog and retain wording through format conversions. Avoid making a table editable in the UI unless the backend can save it.
3. Add current-note find/replace, shortcut help, and deliberate keyboard escape from the editor. Tab handling inside content must coexist with table navigation and an accessible route back to app controls.
4. Exercise save/reopen, undo/redo, pasted supported HTML, nested lists, multi-block indentation and schema changes. Include fresh native persistence tests rather than relying solely on browser preview storage.

Performance verification should focus on input and selection updates. Toolbar state can be computed from the current editor state; it should not serialize the entire document or scan all notes on every caret movement. Debounce expensive search/count operations, and do not introduce cloud services or continuous background animation.

## Remaining scope beyond this pass

Images, attachments, equations, diagrams, embedded pages/blocks, callouts, columns and unrestricted typography are visible in the surveyed product families but require additional storage, layout or document semantics. They should have their own implementations and tests. Joplin's documented [rich-text conversion limitations](https://joplinapp.org/help/apps/rich_text_editor/) are a useful warning: representation changes can lose formatting even when the editing surface looks correct.

Likewise, a complete outliner needs block collapsing, block selection/movement and stable block references. Syntax-highlighted code, footnotes, right-to-left controls, configurable bindings, full Markdown import/export, spellcheck language controls and accessible high-contrast themes remain separate gaps. These are not grounds for withholding basic indentation and formatting now, nor should this first upgrade be described as total feature parity.

## Implementation status

The comparison above preserves the pre-upgrade baseline. The following changes are implemented in this pass; verification scope is stated separately below.

| Area | Implemented behavior and limits |
| --- | --- |
| Toolbar feedback | Selection-aware active styling and `aria-pressed`, including mixed formatting; capability-based disabled states for commands such as undo, redo and indentation |
| Text formatting | Bold, italic, underline, strike, highlight, inline code, subscript, superscript and a text-color palette |
| Paragraph structure | Paragraph and H1–H6 selection, alignment, quotes, code blocks and horizontal rules |
| Lists and tasks | Bullet, ordered and nested task lists; indent/outdent operates on list structure |
| Free indentation | Paper and Compact support paragraph/heading indentation levels 0–8, persisted independently of text content |
| Outline policy | List/task indentation is structural. Free indentation controls are unavailable for ordinary paragraphs; existing free-indent attributes are preserved but their visual offsets are suppressed in Outline and restored when switching back. Changing the preset does not silently convert paragraphs into outline items. This is a hierarchy-aware mode, not a complete Logseq-style outliner. |
| Tables | Insert a 3×3 table; add/delete rows and columns; toggle the header row; merge/split cells; delete table. Corresponding native document attributes are supported. |
| Links | Add/edit/remove URL links and retain existing links to other notes. External URLs can be copied; opening them in a browser is not implemented. |
| Current-note find/replace | Literal search within text blocks, next/previous navigation, case option, replace and replace all. Matches do not span text-block boundaries. Replace all is one undoable transaction. Results are bounded at 10,000 matches; broader searches require query refinement. |
| Clipboard | Tiptap handles supported pasted HTML; Ctrl+Shift+V provides plain-text paste. This is not a guarantee of lossless import of every external application's rich document format. |
| Persistence | Rust validation has been extended for the new marks, nodes and attributes; end-to-end native verification is tracked below. |

Verification completed at this update: 19 frontend tests and 10 Rust tests pass. Browser UI checks cover active marks, free indentation and schema restoration, list nesting, checklists, table row/column operations and undo. These checks do not establish every clipboard, accessibility, keyboard-layout or large-document performance scenario.

Native desktop verification also passed using a disposable workspace. Browser-created rich documents were opened by the production Windows build, edited through the native UI, saved, closed and reopened in a new process. Checked/unchecked task state, a four-row table, a link target, nested outline text, paragraph indentation, centered alignment, text color, bold/italic/underline/highlight and active toolbar feedback persisted correctly. The native console reported zero errors or warnings, and no storage warnings appeared. The user's note workspace was not used for these tests.

This pass makes the everyday editor substantially more complete; the explicitly listed remaining capabilities are still outside its scope. See [performance validation](performance.md) for the earlier startup bottleneck and unmeasured inexpensive-hardware acceptance requirements.

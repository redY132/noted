# Prototype architecture

## Purpose

Validate Markdown-assisted editing, local persistence, stable links, and inexpensive presentation before implementing AI or artistic features. Rust + Tauri is accepted conditionally on measured responsiveness on an inexpensive Windows laptop. ChromeOS is outside the target platforms.

## Components

- `src/`: a TypeScript interface and Tiptap editor. Input and selection are handled immediately in the browser engine. A serialized autosave flow sends document snapshots after a pause and before switching notes.
- `src-tauri/src/store.rs`: UI-independent Rust persistence, revision validation, folders, and SQLite full-text search.
- `src-tauri/src/lib.rs`: narrow Tauri commands and background dispatch for store operations.

The prototype deliberately uses debounced document snapshots instead of implementing a new incremental editing protocol prematurely. This is a deviation from the long-term small-operation proposal. Long-document serialization and IPC cost must be measured; replace snapshots with typed incremental operations if they exceed the budget. Cloud AI must never receive the unrestricted save command.

## Document and identity

Each note has `formatVersion`, a UUID `id`, title, optional `folderId`, tags, revision, timestamps, structured editor content, and presentation metadata. `revisionToken` is a returned fingerprint used for optimistic concurrency, not authored note content. Internal links use `noted://note/<uuid>` so renaming or moving a note does not change its link target.

Tiptap's structured document is the prototype content representation. Blocks carry stable IDs. The durable format is not yet an independently specified public plugin API; future migrations must account for supported nodes, marks, and references. Canvas layouts will eventually reference content IDs, rather than duplicate text.

The editor applies Markdown input shortcuts. It does not keep an independently editable Markdown copy alongside the JSON. Presentation presets change rendering independently of wording.

## Agreed direction beyond the prototype

On 2026-10-25 the user approved predictable JavaScript-defined components with explicit editable properties and operations, backed by persisted content and layout state. The visual editor and AI authoring should use a common validated editing contract. Ordinary edits must not require AI or rewriting arbitrary JavaScript; generated code is not trusted component implementation code.

Existing visual-editor frameworks will be evaluated before rebuilding their machinery. Following the user's preference to avoid React, [GrapesJS core is the leading non-React research candidate](visual-editor-options.md), to compare with retaining Tiptap and adding a focused component/layout layer. Puck and Craft.js are deprioritized; no candidate is an adopted dependency or a proven performance winner. The current frontend remains TypeScript/Tiptap without React, and no component-format migration or generated-code runtime has been implemented.

## Persistence and conflicts

The native store serializes access and locks a workspace against a second native writer. Note changes require a matching revision and file fingerprint. External edits that do not increment revisions are still detected. Conflicts retain the in-memory draft and require an explicit recovery action.

Writes use a same-directory temporary file, flush, and replacement; prior content has a backup. Crash safety must be tested on Windows and must not be interpreted as a universal power-loss guarantee. Cross-file transactions, a comprehensive recovery journal, and automatic file watching are not implemented in this slice.

SQLite is a derived index, not a second source of truth. Indexing errors must be visible without falsely reporting a successfully written note as unsaved. Reopen or explicit refresh reconciles disk files and the index. Invalid files must be preserved and reported.

The current prototype rebuilds the index synchronously on startup. Large collections can therefore delay the first usable window; incremental startup reconciliation is required if measurements exceed the startup budget. Listings currently return at most 10,000 notes and search returns at most 100 results. Folder filtering happens after search, so a folder can omit matches beyond the global search limit. These prototype bounds need pagination and folder-aware search before larger collections are supported reliably.

## Privacy boundary

Application code accepts validated identifiers and document data rather than frontend-supplied filesystem paths. Tauri permissions and CSP restrict the webview. No note content is sent to a remote service. Browser preview is a separate development adapter; do not mistake its storage and timings for native behavior.

No AI or user plugin runtime is included. The future formatting API must expose only allowed operations on presentation, verify protected content and references, and reject stale revisions atomically.

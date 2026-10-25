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

The requested implementation comparison retained Tiptap with a focused component layer. A separate GrapesJS core/Tiptap custom-RTE integration is implemented under `experiments/editor-comparison`; it is a development dependency, excluded from the app bundle. [Results and limitations](../experiments/editor-comparison/RESULTS.md) explain the lifecycle-cost and editing-complexity tradeoffs. No React or generated-code execution runtime was introduced.

## Editable components and local images

`notePanel` contains ordinary rich-text blocks; `localImage` stores a note-owned asset UUID and description. Both expose bounded width (160–1200 px) and left/center/right alignment; panels also expose plain/soft/accent appearance. Text, component properties, flow reorder and resizing use one ProseMirror document/history. Pointer resizing previews locally and commits one transaction on release. These operations preserve text, but are trusted editor helpers rather than an authorization boundary for AI.

The document stays in logical flow. Free canvas positioning, arbitrary components/scripts, animation and quality controls remain future work. Existing version-1 notes still load without migration; newly supported node types require this editor version, and older validators reject them rather than silently dropping them.

Imported static PNG/JPEG/WebP bytes are copied to `assets/<note-id>/<asset-id>.image`. Paths are derived from UUIDs, note ownership is enforced on reads, and redirected asset directories are rejected. The frontend checks dimensions before decoding and validates the decoded image during import; Rust independently checks byte limits, format headers and dimensions. The maximum is 10 MiB, 32 megapixels, and 16384 pixels per dimension. Native header validation is not a complete image decoder. Animated formats and SVG are not supported in this slice.

Images resolve near the viewport, through narrow IPC and blob URLs; image bytes never enter note JSON or typing autosaves. Browser preview uses a separate IndexedDB image store. URLs are cached for the active note and revoked on switching notes, including late async results. Imported assets are retained through undo/recovery; garbage collection and copying image references between notes remain future work. Loading many distinct images while scrolling can still accumulate memory during that note session; byte-array IPC also has transient overhead.

## Persistence and conflicts

The native store serializes access and locks a workspace against a second native writer. Note changes require a matching revision and file fingerprint. External edits that do not increment revisions are still detected. Conflicts retain the in-memory draft and require an explicit recovery action.

Writes use a same-directory temporary file, flush, and replacement; prior content has a backup. Crash safety must be tested on Windows and must not be interpreted as a universal power-loss guarantee. Cross-file transactions, a comprehensive recovery journal, and automatic file watching are not implemented in this slice.

SQLite is a derived index, not a second source of truth. Indexing errors must be visible without falsely reporting a successfully written note as unsaved. Reopen or explicit refresh reconciles disk files and the index. Invalid files must be preserved and reported.

The current prototype rebuilds the index synchronously on startup. Large collections can therefore delay the first usable window; incremental startup reconciliation is required if measurements exceed the startup budget. Listings currently return at most 10,000 notes and search returns at most 100 results. Folder filtering happens after search, so a folder can omit matches beyond the global search limit. These prototype bounds need pagination and folder-aware search before larger collections are supported reliably.

## Privacy boundary

Application code accepts validated identifiers and document data rather than frontend-supplied filesystem paths. Tauri permissions and CSP restrict the webview. No note content is sent to a remote service. Browser preview is a separate development adapter; do not mistake its storage and timings for native behavior.

No AI or user plugin runtime is included. The future formatting API must expose only allowed operations on presentation, verify protected content and references, and reject stale revisions atomically.

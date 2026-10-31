# Prototype architecture

## Purpose

Validate Markdown-assisted editing, local persistence, stable links, and inexpensive presentation before implementing AI or artistic features. Rust + Tauri is accepted conditionally on measured responsiveness on an inexpensive Windows laptop. ChromeOS is outside the target platforms.

## Components

- `src/`: a TypeScript interface and Tiptap editor. Input and selection are handled immediately in the browser engine. A serialized autosave flow sends document snapshots after a pause and before switching notes.
- `src-tauri/src/store.rs`: UI-independent Rust persistence, revision validation, folders, and SQLite full-text search.
- `src-tauri/src/lib.rs`: narrow Tauri commands and background dispatch for store operations.

The prototype deliberately uses debounced document snapshots instead of implementing a new incremental editing protocol prematurely. This is a deviation from the long-term small-operation proposal. Long-document serialization and IPC cost must be measured; replace snapshots with typed incremental operations if they exceed the budget. Cloud AI must never receive the unrestricted save command.

## Local shell preferences

`appearance.ts` applies versioned device preferences before constructing the app shell. Semantic CSS tokens theme interface surfaces, default document colors, focus/selection states and dialogs; authored inline colors, document typography and component tones remain document properties. Invalid or unavailable local storage falls back to defaults. System mode follows OS changes without reloading.

`shell-ui.ts` owns normal panel visibility, including the connections panel, in one versioned local record. Focus mode temporarily hides optional regions without overwriting that record. Existing editor and toolbar nodes stay mounted, with hidden or exiting controls removed from keyboard interaction and focused panels returning focus to the editor. Find and dialogs sit outside collapsible formatting regions. Short CSS transitions provide panel/menu motion and bypass animations under reduced motion. Free-placement extent tracking observes the editor container as well as components, so closing navigation reclaims width while preserving document coordinates and scroll bounds. Preferences never enter note JSON or revisions.

## Document and identity

Each note has `formatVersion`, a UUID `id`, title, optional `folderId`, tags, revision, timestamps, structured editor content, and presentation metadata. `revisionToken` is a returned fingerprint used for optimistic concurrency, not authored note content. Internal links use `noted://note/<uuid>` so renaming or moving a note does not change its link target.

Tiptap's structured document is the prototype content representation. Blocks carry stable IDs. The durable format is not yet an independently specified public plugin API; future migrations must account for supported nodes, marks, and references. Canvas layouts will eventually reference content IDs, rather than duplicate text.

The editor applies Markdown input shortcuts. It does not keep an independently editable Markdown copy alongside the JSON. Presentation presets change rendering independently of wording.

## Agreed direction beyond the prototype

On 2026-10-25 the user approved predictable JavaScript-defined components with explicit editable properties and operations, backed by persisted content and layout state. The visual editor and AI authoring should use a common validated editing contract. Ordinary edits must not require AI or rewriting arbitrary JavaScript; generated code is not trusted component implementation code.

The requested implementation comparison retained Tiptap with a focused component layer. A separate GrapesJS core/Tiptap custom-RTE integration is implemented under `experiments/editor-comparison`; it is a development dependency, excluded from the app bundle. [Results and limitations](../experiments/editor-comparison/RESULTS.md) explain the lifecycle-cost and editing-complexity tradeoffs. No React or generated-code execution runtime was introduced.

## Editable components and local images

`notePanel` contains ordinary rich-text blocks; `localImage` stores a note-owned asset UUID and description. Both expose bounded width (160–1200 px) and left/center/right alignment; panels also expose plain/soft/accent appearance. Text, component properties, flow reorder and resizing use one ProseMirror document/history. Pointer resizing previews locally and commits one transaction on release. These operations preserve text, but are trusted editor helpers rather than an authorization boundary for AI.

Components support guided flow or free X/Y/layer placement on a scrollable surface, with bounded animation presets and a global motion control. Arbitrary components/scripts, zoomable drawing and per-GIF FPS controls remain future work. Existing version-1 notes still load without migration; newly supported node types require this editor version, and older validators reject them rather than silently dropping them.

Imported PNG/JPEG/WebP/GIF bytes are copied to `assets/<note-id>/<asset-id>.image`. Paths are derived from UUIDs, note ownership is enforced on reads, and redirected asset directories are rejected. The frontend checks dimensions before decoding and validates the decoded image during import; Rust independently checks byte limits, format headers and dimensions. The maximum is 10 MiB, 32 megapixels, and 16384 pixels per dimension. GIFs also have frame/canvas-work bounds and static posters while paused. Native header validation is not a complete image decoder. SVG and animated PNG/WebP are unsupported.

Images resolve near the viewport, through narrow IPC and blob URLs; image bytes never enter note JSON or typing autosaves. Browser preview uses a separate IndexedDB image store. URLs are cached for the active note and revoked on switching notes, including late async results. Imported assets are retained through undo/recovery; garbage collection and copying image references between notes remain future work. Loading many distinct images while scrolling can still accumulate memory during that note session; byte-array IPC also has transient overhead.

## Persistence and conflicts

The native store serializes access and locks a workspace against a second native writer. Note changes require a matching revision and file fingerprint. External edits that do not increment revisions are still detected. Conflicts retain the in-memory draft and require an explicit recovery action.

Writes use a same-directory temporary file, flush, and replacement; prior content has a backup. Crash safety must be tested on Windows and must not be interpreted as a universal power-loss guarantee. Cross-file transactions, a comprehensive recovery journal, and automatic file watching are not implemented in this slice.

SQLite is a derived index, not a second source of truth. Indexing errors must be visible without falsely reporting a successfully written note as unsaved. Reopen or explicit refresh reconciles disk files and the index. Invalid files must be preserved and reported.

The desktop opens the existing derived index and reconciles changed/missing files in bounded background batches. The UI polls indexing status during reconciliation, including an initially empty workspace. Note lists and connection pickers use indexed, paginated backend queries with folder filtering before pagination. The legacy bulk summary endpoint remains for compatibility and metadata bootstrapping; it is not the connection picker source. Explicit rebuild reconciles in background and preserves authored connections.

## Connections and local discovery

Confirmed pairs now include strength 1–5 (default 3) and export format version 2. Existing pair databases receive a consistent `relations.pre-strength-v1-<uuid>.sqlite3` snapshot before transactional migration. Revision-checked mutations and Undo include strength; note documents are untouched. New graph edges and scoped search endpoints cap visible data, use indexed connection membership before search fusion, and apply at most a 20% shared-confirmed-neighbor bonus only to already-qualified suggestions.

The desktop has an independent read-only graph/search connection and mutex, using WAL to observe new saves without holding the note-store writer mutex during retrieval. Typed semantic queries use the existing inference worker and its own SQLite/ANN access, with a bounded query-vector cache, latest-query coalescing and relationship-generation invalidation. Connected-only queries constrain live ANN chunk keys before retrieval and filter shared-chunk bindings to the requested source's confirmed neighbors. Returned note identities/fingerprints are revalidated; query passage relevance is separate from the stricter whole-note suggestion gate. Raw text results remain available while a semantic result is pending or unavailable.

The linking gesture renders a cubic Bézier arrow with two time-based visual followers for its tip and bend. It reuses the existing drag animation frame and retains two followers plus the current curve, with no trail history. Pointer hit testing, highlighting and the final drop use real pointer coordinates independently of the visual delay. Release stops the drag loop, commits the drop immediately, and retracts a prefix of the captured curve toward its source over 400 ms. Crossing the viewport boundary, pointer exit, lost capture, or window blur releases the gesture and retracts without allowing a drop on its last hovered target. Returning requires a fresh press, and a late physical release cannot open the picker. A new gesture or cancellation interrupts that brief retraction; system reduced motion removes both trailing delay and retraction while retaining a curved path.

`relations.sqlite3` is authoritative workspace data, separate from the disposable search index. Canonical unordered UUID pairs retain confirmed mutual connections, persistent dismissals and monotonic action revisions. Idempotent mutations return prior/current states for compare-and-set Undo. They never edit either note document. Workspace details provides a consistent JSON connection export including dismissals and revisions. A full filesystem backup must include the relation database via a SQLite-consistent snapshot, not just the note JSON or a naked copy of an active WAL database.

The derived index tracks tag membership, metadata FTS and inline reference occurrences (including image links). Connections, outgoing references/backlinks, and suggested candidates have distinct UI sections. Removing a connection never removes written references. Missing-note relations remain inspectable. Pointer handles support click-to-search and drag-to-connect over registered note identities, with cancellation and no text insertion; an overlay drawer preserves writing width on smaller windows.

The `semantic` Cargo feature is included by desktop builds. A separate Rust worker runs the quantized English MiniLM model with FastEmbed/ONNX Runtime and USearch HNSW. The runtime is statically linked. The pinned model pack is installed only on explicit request and verified by exact sizes/SHA-256; offline folder installation uses the same manifest. Model downloads are the only added network operation. Inference uses local files and no model-hub client. Semantics is off by default and labeled experimental pending quality/reference-hardware gates.

Authored text is tokenized into bounded overlapping windows with cached fingerprints, whole-note aggregation and distributed query windows; layout changes do not require new embeddings. A memory-mapped ANN base plus mutable delta uses generation checkpoints and stale-reference filtering. Suggestions merge semantic candidates with keyword/tag ranks, exclude saved/dismissed/missing/self pairs and never create connections automatically. Inference does not acquire the note-store mutex. Cached semantic responses keep manual connections and lexical retrieval usable while background work is busy. Controls expose progress, pause/resume, battery override, offline model installation and removal of derived semantic data.

## Privacy boundary

Application code accepts validated identifiers and document data rather than frontend-supplied filesystem paths. Tauri permissions and CSP restrict the webview. No note content is sent to a remote service. Browser preview is a separate development adapter; do not mistake its storage and timings for native behavior.

Local embedding inference is included as an optional discovery feature. Cloud AI, generated note-script execution and a user plugin runtime are not included. The future formatting API must expose only allowed operations on presentation, verify protected content and references, and reject stale revisions atomically.

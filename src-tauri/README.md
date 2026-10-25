# Noted core prototype

`cargo test --no-default-features` tests the store without linking Tauri. The default `desktop` feature builds the application. Use `cargo build --release --features custom-protocol` after building the frontend for a standalone executable; without `custom-protocol`, Tauri uses the development server. The workspace defaults to the operating system's Tauri app-data directory under `app.noted.desktop/workspace`. Developers can explicitly set `NOTED_WORKSPACE` to isolate smoke-test data; no frontend command accepts a filesystem path.

## Files and recovery

- `notes/<uuid>.json`: authoritative version-1 documents. `content` is a constrained Tiptap tree; `presentation.schemaId` is a deterministic preset reference.
- `folders/<uuid>.json`: logical folder records. Renaming or moving notes changes metadata, not filenames or link identity.
- `notes/<uuid>.json.bak`: the previous complete revision, written before replacing an existing note. Recovery is manual: close the app, preserve the damaged/current file, inspect the backup, and restore a valid JSON document at the UUID filename.
- `index.sqlite3` and its WAL sidecars: disposable FTS5 index. Indexing is updated after canonical files commit. Startup and the explicit rebuild command reconcile from authoritative files. An index update failure surfaces a warning without misreporting a committed save as failed.
- `workspace.lock`: lifetime process lock. Only one Noted process may open a workspace.

Saved files omit `revisionToken`; every load/create/save response includes a SHA-256 token of the saved bytes. Send it back unchanged alongside `expectedRevision` when saving. A missing or stale token is a conflict, including when an external editor changed bytes without incrementing `revision`. The UI must preserve its unsaved draft on conflicts and save errors.

Writes sync a temporary file in the destination directory, then atomically replace the destination using `tempfile::NamedTempFile::persist`. This prevents partially written JSON on process interruption; it is not a tested guarantee against every hardware/power failure. Malformed notes are preserved and skipped with warnings during index rebuild. Invalid folder files produce explicit errors. If the index itself is corrupt, close the app, preserve/remove the index and its sidecars, then reopen to rebuild it. Never delete the notes or folders to repair search.

## Current limits

This is a vertical-slice prototype, not a stable public document API or an AI permission boundary. Saves carry a complete note after a UI debounce; narrow revisioned edit operations and background incremental startup reconciliation remain follow-up work. Index rebuild streams notes but runs on startup before the window becomes usable. List results are bounded at 10,000 notes and search results at 100; pagination is pending. Notes are limited to 8 MiB and 64 content nesting levels. Internal `noted://note/<uuid>` and HTTP(S) links are accepted; no external opener permission is granted. Deleting/moving folders, live external-file watching, canvas, media, AI, and sync are unimplemented.

External tools should edit while Noted is closed, then reopen/rebuild the index. Revision hashes detect already-completed external edits; arbitrary concurrent external writers that ignore the lock can still race a save. Workspace path confinement assumes the same OS user is trusted not to replace directories between checks. No encryption at rest is provided.

`cargo run --release --no-default-features --example bench_store -- 10000` creates a disposable dataset, measures indexing and warm open/search latency, then removes that dataset. It does not measure frontend latency, FPS, IPC, memory, or certify low-end hardware performance.

# Performance validation

## Acceptance intent

Ordinary writing, selection, scrolling, and navigation must remain smooth on an inexpensive Windows laptop with integrated graphics. The exact reference CPU, RAM, SSD, and display refresh rate still need selection. Development-machine measurements do not establish low-end acceptance.

Provisional targets from the spec:

- Smooth interaction at 60 Hz on a 60 Hz baseline display, assessed through frame pacing and long stalls.
- Key-to-paint p95 below 50 ms.
- Ordinary indexed note opening p95 below 200 ms.
- Usable cold startup within 2 seconds.
- Total process-tree memory, idle CPU, and long-session growth recorded; numeric budgets still pending.

An animation cap must never throttle editing. The prototype has no artistic effects or animation loop.

## Storage benchmark

```powershell
cargo run --release --manifest-path src-tauri/Cargo.toml --no-default-features --example bench_store -- 10000
```

The benchmark creates a disposable generated collection, measures index rebuilding, and samples file opens and full-text searches. It does not touch the default workspace. It excludes UI rendering, IPC, cold disk-cache behavior, and the memory of WebView2. The generated size distribution is defined in the benchmark source; it is not a substitute for real user documents.

## Editor and desktop checks

Use a release build, a disposable workspace, and a documented machine. Measure cold startup separately from already-cached launches. Exercise long notes and a large collection while saving and indexing occur. Record input latency, dropped frames, and stalls rather than reporting average FPS alone.

Functional scenarios must also pass:

1. Create a folder and note, type Markdown, save, close, and reopen.
2. Link two notes; rename and move the target; follow the original link.
3. Type while a save is pending; verify the latest edit survives switching notes.
4. Modify the file externally; verify an old editor revision cannot overwrite it.
5. Remove/rebuild only the disposable search index; notes remain available.
6. Test invalid files and save failures without discarding unsaved text.

## Results

Initial verification on October 24, 2026:

- Windows development machine: AMD Ryzen 9 8945HS (8 cores, 16 threads), 31.3 GiB RAM, Radeon 780M integrated graphics and an NVIDIA RTX 4070 Laptop GPU. The rendering GPU was not constrained. This is not the inexpensive reference device.
- TypeScript production build and three autosave tests pass. Tests cover edits during a pending save, retained drafts and retry after failure, and deferred capture of the latest editor content.
- Seven Rust storage tests pass: save/reopen/search/rebuild; stale and unversioned external edits; stable links after rename/move; malformed-file preservation; invalid paths/links; previous-revision backups and exclusive workspace access; rejection of document shapes the editor would discard.
- Real Edge browser-preview checks passed for Markdown headings/lists, folders, tags, daily-note reuse, presentation persistence, and links after rename/move. These use separate browser data and are functional checks only.
- The production Windows executable runs with the Vite server stopped. WebView2 checks passed for Markdown editing, native persistence, tags, folder moves, stable link targets, presentation presets, normal window close, and reopening the same files. After fixing DOM link interception, the original link opened the renamed/moved target with zero console errors or warnings. Closing immediately after the UI reported an unsaved final edit exited normally and preserved that text in revision 5 on disk. Native smoke data is confined to `output/native-smoke`.

The release storage benchmark used 10,000 notes: 9,900 with approximately 1.1 KB of paragraph text and 100 with approximately 18.5 KB, plus JSON metadata. It used 200 warm file-open samples and 200 search samples, alternating a prefix query and a multi-term query. Results on this development machine:

| Operation | Result |
| --- | ---: |
| Generate corpus through durable saves | 186.447 s |
| Full index rebuild | 4.173 s |
| Warm file-open p95 | 0.60 ms |
| FTS search p95, up to 100 results | 52.29 ms |

The synchronous startup rebuild alone exceeds the provisional 2-second startup budget at 10,000 notes, before UI loading. This requires incremental/background reconciliation work; Rust + Tauri has not yet passed the agreed performance intent. File-open timings exclude IPC and editor rendering and are not equivalent to opening a visible note.

Cold startup, input-to-paint, frame pacing, process-tree memory, long documents, fault-injected interrupted saves, and inexpensive-hardware acceptance remain unmeasured. No low-end performance certification has been made.

## Text editing upgrade verification

The expanded editor passes 19 frontend tests and 10 Rust tests. Added coverage exercises actual editor commands and toolbar state, multi-block indentation and undo, list/task hierarchy, schema changes without rewriting content, table/code Tab handling, keyboard escape, literal Unicode-safe search, replacement boundaries, and new document shapes through native save/reopen/search. These functional tests do not measure low-end frame pacing.

Browser interaction checks exercised active formatting buttons, reversible free-indent presentation across schema changes, structural list indent/outdent, nested checkboxes, table cell navigation and row/column undo, URL insertion, and find/replace with undo.

The production Windows build was then opened against isolated fixtures in `output/editor-smoke`, edited through the UI, closed normally, and restarted. The reread showed preserved checkbox state, a four-row table, external link target, nested outline text, two-step paragraph indentation, centered alignment, blue text, bold/italic/underline/highlight, and correct active toolbar state. No console errors or workspace warnings appeared. Test notes were separate from the user's workspace.

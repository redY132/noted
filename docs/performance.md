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

## Component editor comparison — October 25, 2026

Two implementations were built: a focused component layer within the existing Tiptap document, and GrapesJS core with a real custom Tiptap rich-text integration. The focused implementation is retained in the app. GrapesJS remains only in the isolated development experiment. The [comparison report](../experiments/editor-comparison/RESULTS.md) contains workloads, measurements, repetition counts, fairness limits and the decision rationale; the [harness instructions](../experiments/editor-comparison/README.md) reproduce it.

The comparison uses 3,600-word and 36,000-word text documents plus 100 panels containing 14,400 words and ten tiny fixture images. It measures editor lifecycle and serialization, not SQLite search across a collection or cold app startup. Programmatic text transactions and animation-frame callbacks are reported separately from actual input testing. The GrapesJS experiment is not included in the production bundle.

Functional coverage includes exact content/mark/ID preservation through wrapping, properties, movement and undo; cross-panel text selection; non-destructive image insertion; async imports completing after navigation; pointer-resize previews committing one transaction; viewport-deferred image reads; native asset save/read and ownership; malformed content/attributes; and actual Windows junction rejection. Static image byte/dimension limits are validated before decoding in the UI, with independent native header checks.

The reproducible Playwright CLI smoke function `scripts/component-smoke.js` passed in Edge and the release WebView2 application against disposable workspaces: create two paragraphs, wrap, change width/appearance, undo/redo, drag-resize, undo/redo, import a local PNG, save and reload with preserved words, width and decoded image. Native testing exposed and fixed AllSelection handling and inspector activation after Ctrl+A. Image import no longer replaces selected text, and asset bytes are resolved near the viewport rather than for every image on mount. The native run had zero console errors/warnings and only app resources/local IPC requests in the observed network log.

Asset garbage collection, cross-note image copying, animated media and long-session image-cache growth remain outside this slice. Loaded image URLs remain cached for the active note and are revoked on switching notes. These results do not certify inexpensive hardware, sustained FPS, cold startup, or arbitrary large-media performance.

### Native keyboard/frame observations

The retained release build was measured separately from the comparison and compilation. Environment: Windows 11 Home 10.0.26200, Ryzen 9 8945HS, approximately 31.3 GiB RAM, WebView2/Edge 155, 1200×800 CSS-pixel viewport at device pixel ratio 2. The window reported visible. The GPU was not constrained.

Three generated workloads were cycled three times. Each run typed through Playwright keyboard events at a requested 20 ms interval, captured 57 `beforeinput`-to-next-animation-frame samples, and included an explicit save. Timing starts inside the page, excluding physical keyboard and OS input latency; an animation-frame callback is not a confirmed pixel-paint timestamp. These native numbers cannot be directly compared with the harness's double-frame programmatic proxy.

| Workload | Median of three per-run input-to-frame p95 | Largest input-to-frame sample | Median per-run frame-interval p95 |
| --- | ---: | ---: | ---: |
| 100 paragraphs | 7.6 ms | 8.4 ms | 8.5 ms |
| 1,000 paragraphs | 8.7 ms | 10.1 ms | 8.5 ms |
| 100 panels + 10 tiny images | 8.2 ms | 8.5 ms | 8.5 ms |

No long tasks were recorded during the nine input sample intervals. This does not cover initial note loading, long-running sessions or cold startup. The same generated text remains in the disposable workspace after saves. Raw observations are in ignored `output/playwright/native-input-results.json`; regenerate fixtures with `scripts/create-native-benchmark.mjs` and run `scripts/native-input-benchmark.js` through Playwright CLI against that workspace.

One process-tree snapshot during the native run counted seven processes, 425.6 MiB summed private memory and 698.4 MiB summed working sets. Summed working sets can double-count shared pages; this is an observation with WebView2/debugging attached, not a peak, a baseline subtraction, or a low-end memory acceptance result. Cold-start and long-session memory budgets remain unresolved.

Final automated verification: 33 frontend tests, 16 Rust tests, both application and experiment TypeScript checks, and the Windows release build pass. The final executable passed the component smoke test again, and an earlier note retained its exact text, panel width/appearance and decoded image after full native process shutdown and restart. Rust tests requiring atomic replacement in disposable temporary directories were run outside the restricted filesystem sandbox. No user workspace was used.

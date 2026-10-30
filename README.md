# Noted

An offline desktop note editor built with Rust, Tauri, and TypeScript. This is an early prototype of the product described in [SPEC.md](SPEC.md), not a finished application or a certified low-end performance result.

## Development

Windows prerequisites:

- Node.js 24 LTS and npm.
- Rust stable via rustup, using the MSVC toolchain.
- Visual Studio **Build Tools** with the Desktop development with C++ workload and Windows SDK. The Visual Studio editor is not required.
- Microsoft Edge WebView2 Runtime (normally present on current Windows systems).

See the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for platform setup.

```powershell
npm ci
npm run desktop
```

After installing Rust, open a new terminal so `cargo` is on PATH.

```powershell
npm run check
npm test
npm run test:core
npm run desktop:build
```

The unbundled desktop build is written to `src-tauri/target/release/noted.exe`. Installer packaging is intentionally deferred.

## Browser preview

```powershell
npm run dev
```

Open the localhost URL printed by Vite. The explicitly labeled browser preview uses its own browser storage, separate from native desktop notes. It is useful for UI development, but does not exercise Rust persistence or represent WebView2 performance. Preview data can disappear if browser storage is cleared; use disposable notes.

## Appearance and layout

The default view shows the note list and editor. The 36 px top bar keeps navigation, the note list, formatting, **View**, **Appearance**, connections and save status within reach. **View** independently shows layout tools, note details, the footer and connections; it also contains New note and Workspace details.

**F8** toggles Focus mode, hiding optional panels and restoring their previous arrangement when you exit. **/** reveals workspace search. **Ctrl+F** opens Find even with formatting hidden. Hiding controls keeps the current editor, selection and undo history intact.

**Appearance** offers System, Light and Dark, accent swatches and a custom color picker. Appearance and panel choices are saved on this device separately from notes, with independent **Reset appearance** and **Reset layout** actions. Explicit note colors and component styles remain authored content. Brief fluid transitions follow the system reduced-motion preference; typing does not wait for animations.

`playwright-cli run-code --filename scripts/minimal-shell-smoke.js` checks appearance, panel persistence, focus recovery, selection, undo/redo and free-placement scrolling. Use an isolated browser profile on port 1430/1431 or a disposable native workspace; it creates notes and changes device preferences.

## Editing

The formatting toolbar reflects the caret or selection, including mixed formatting and unavailable commands. It offers paragraph/H1–H6 styles, bold/italic/underline/strike, highlight, inline code, subscript/superscript, text colors, alignment, quotes, code blocks, dividers, lists and checklists, links, tables, undo/redo, and current-note find/replace.

- **Paper and Compact:** Tab / Shift+Tab changes paragraph or heading indentation, up to eight steps. Inside lists, it nests or lifts items.
- **Outline:** use a bullet, numbered or task list to create a hierarchy. Tab nests beneath a preceding sibling; Shift+Tab lifts one level. Free paragraph indentation is disabled. Changing schemas preserves existing content and stored offsets; it does not automatically convert them into a hierarchy.
- **Tables:** Tab / Shift+Tab moves between cells. The Table menu inserts a table and changes rows, columns, headers and merged cells.
- **Code blocks:** Tab inserts code indentation. **Escape, then Tab** leaves the editor for app controls.
- **Ctrl+F / Ctrl+H:** find and replace within this note. Matches stay within text blocks; replacement is undoable. Workspace search remains separate.
- **Ctrl+K:** add/edit a web link. Explicit activation opens HTTP(S) links in the system browser. The Note button inserts an inline reference to a local note by stable ID.
- **Clear text formatting** removes inline styles; it keeps headings, indentation, lists and tables.

See the [editor audit](docs/editor-feature-audit.md) for the source-backed comparison, delivered scope, tests and remaining gaps. This is not full Logseq/Obsidian feature parity or a complete configurable schema engine.

**Editable components:** select paragraphs and choose **Text panel**, or add an independent **New panel**. Panels and copied PNG/JPEG/WebP/GIF images support guided flow or free placement, width, coordinates and layers. Use drag/resize handles or numeric controls; layout and text share undo/redo. Motion presets and GIFs respect pause and reduced-motion settings. Images are limited to 10 MiB and 32 megapixels, with additional GIF frame/work limits.

## Connections and local discovery

Click a note's **⤳** handle to search and connect multiple notes, or drag the handle onto another note card, the open note body, or an internal note reference. Connections are mutual and do not insert text. The **Connections** panel separates saved connections, inline references/backlinks, and suggestions. Removing a connection leaves written references intact; Undo, persistent dismissal/restoration and a workspace connection export are available.

Keyword/tag suggestions work offline without a model. Optional **Local discovery · experimental** runs an English embedding model on the desktop. Enable it in the Connections panel, then explicitly download the verified 22.6 MiB pack or install the same pack offline. Initial indexing is background work and can take substantial time. Pause/resume and battery controls are available. Notes and embeddings are never uploaded; the model download host receives ordinary connection metadata. Cloud AI is not included.

See [local semantics](docs/local-semantics.md) for offline-pack files, benchmark results and remaining acceptance gates. Browser preview exercises connection interactions but does not run the production local inference worker. Automated verification uses disposable workspaces and ports 1430/1431, leaving the normal development port 1420 available.

## Editor comparison and integration checks

Two non-React implementations were built and measured. The [results](experiments/editor-comparison/RESULTS.md) explain why the focused Tiptap layer is retained. GrapesJS is only used in the isolated experiment, not the app bundle.

```powershell
npm run bench:editor:build
npm run bench:editor
```

The comparison runs at `http://127.0.0.1:1421/`. Its [README](experiments/editor-comparison/README.md) describes workloads and timing limits. For a real-browser component integration check, use an isolated Playwright CLI session at the local app URL, then run `playwright-cli run-code --filename scripts/component-smoke.js` from the repository root. It creates a disposable note and checks resize, undo/redo, import and save/reload. Never point this test at a personal workspace.

`node --experimental-strip-types scripts/create-native-benchmark.mjs` generates a new disposable native workspace under `output/` and prints its path. Set `NOTED_WORKSPACE` to that path before launching the release executable. `scripts/native-input-benchmark.js` is a Playwright CLI function for the generated notes; its input-to-frame readings are scheduling proxies, not physical keyboard-to-paint measurements.

## Data and privacy

The desktop prototype stores a local workspace in the Tauri application data directory. The interface reports the actual path. To use disposable data during development, set an absolute path before launching:

```powershell
$env:NOTED_WORKSPACE = Join-Path $PWD 'output\scratch-workspace'
npm run desktop
```

Note files are structured JSON, linked by stable UUID rather than filename or title. `index.sqlite3` and semantic indexes are rebuildable. `relations.sqlite3` contains authoritative connections and dismissals and must be included in a consistent workspace backup; Workspace details can also export these as JSON. The native store uses revision checks and file fingerprints to reject stale saves, and preserves a previous-file backup. This is not a substitute for user backups or encryption. External editing should be done with the app closed until a richer conflict-resolution workflow exists.

The prototype has no cloud AI connection, telemetry, remote fonts, sync, plugin execution, or remote media fetching. Editor assets and the inference runtime are bundled; model weights are a separate explicit download/offline installation. Future AI formatting must go through validated scoped operations; the prototype's human editing command is not an AI-safe API.

## Current boundaries

- The JSON format is experimental and subject to migration as the document model develops.
- Markdown shortcuts cover the editor's supported constructs; this is not a complete Markdown round-trip implementation.
- Presentation presets demonstrate deterministic formatting. A general user-defined schema engine, automatic schema enforcement UI, and content-preserving AI operations remain future work.
- Zoomable drawing/canvas tools, folder overviews, animation FPS controls, flashbacks, and sync remain on the roadmap.
- See [architecture](docs/architecture.md) and [performance](docs/performance.md) for decisions, limitations, and verification scope.

No project license has been selected yet. Third-party dependencies retain their respective licenses.

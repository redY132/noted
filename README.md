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

## Editing

The formatting toolbar reflects the caret or selection, including mixed formatting and unavailable commands. It offers paragraph/H1–H6 styles, bold/italic/underline/strike, highlight, inline code, subscript/superscript, text colors, alignment, quotes, code blocks, dividers, lists and checklists, links, tables, undo/redo, and current-note find/replace.

- **Paper and Compact:** Tab / Shift+Tab changes paragraph or heading indentation, up to eight steps. Inside lists, it nests or lifts items.
- **Outline:** use a bullet, numbered or task list to create a hierarchy. Tab nests beneath a preceding sibling; Shift+Tab lifts one level. Free paragraph indentation is disabled. Changing schemas preserves existing content and stored offsets; it does not automatically convert them into a hierarchy.
- **Tables:** Tab / Shift+Tab moves between cells. The Table menu inserts a table and changes rows, columns, headers and merged cells.
- **Code blocks:** Tab inserts code indentation. **Escape, then Tab** leaves the editor for app controls.
- **Ctrl+F / Ctrl+H:** find and replace within this note. Matches stay within text blocks; replacement is undoable. Workspace search remains separate.
- **Ctrl+K:** add/edit a web link. External links are stored and can be copied; opening external sites remains unimplemented. The Note button links a local note by stable ID.
- **Clear text formatting** removes inline styles; it keeps headings, indentation, lists and tables.

See the [editor audit](docs/editor-feature-audit.md) for the source-backed comparison, delivered scope, tests and remaining gaps. This is not full Logseq/Obsidian feature parity or a complete configurable schema engine.

**Editable components:** select paragraphs and choose **Text panel**, then change width, alignment and appearance. Panels remain directly editable. **Local image** imports a copied static PNG/JPEG/WebP; select it to edit its description and layout. Use the corner resize handle or numeric width control, and the up/down controls to reorder within document flow. Layout changes and text share undo/redo. Images are limited to 10 MiB and 32 megapixels; animation and free canvas positioning remain future work.

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

Note files are structured JSON, linked by stable UUID rather than filename or title. SQLite is a derived search index. The native store uses revision checks and file fingerprints to reject stale saves, and preserves a previous-file backup. This is not a substitute for user backups or encryption. External editing should be done with the app closed until a richer conflict-resolution workflow exists.

The prototype has no AI connection, telemetry, remote fonts, sync, plugin execution, or remote media fetching. All editor assets are bundled. Future AI formatting must go through validated scoped operations; the prototype's human editing command is not an AI-safe API.

## Current boundaries

- The JSON format is experimental and subject to migration as the document model develops.
- Markdown shortcuts cover the editor's supported constructs; this is not a complete Markdown round-trip implementation.
- Presentation presets demonstrate deterministic formatting. A general user-defined schema engine, automatic schema enforcement UI, and content-preserving AI operations remain future work.
- Canvas editing, folder overviews, animation quality controls, flashbacks, and sync remain on the roadmap.
- See [architecture](docs/architecture.md) and [performance](docs/performance.md) for decisions, limitations, and verification scope.

No project license has been selected yet. Third-party dependencies retain their respective licenses.

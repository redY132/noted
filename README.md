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

The default view shows the note list and editor. The 36 px top bar keeps navigation, the note list, formatting, **View**, **Appearance**, the connection arrow and save status within reach. **View** independently shows layout tools, note details and the footer; it also contains New note and Workspace details.

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

**Document foundation:** notes now save as version 2, separating content objects, logical reading order and nested layout containers. Existing notes convert in memory and migrate only on their next successful save, retaining a pre-migration backup. See [document model and delivery status](docs/document-model.md).

Show **Layout tools** in View to use **Group in box**, nested vertical/horizontal/free/grid layouts, padding, gap and column controls. **Schemas** edits reusable, immutable versions with previewable suggestions and individually enabled automatic rules. **Interactive** imports or authors counter/flashcard-style components; each exact code version starts disabled and requires explicit Enable. Saved state shares text/layout Undo. Missing definitions and failed execution retain readable fallback and state. See [schema authoring](docs/schema-authoring.md) and [component authoring](docs/component-authoring.md).

The advanced **Document API** dialog previews revision-checked operation batches with separate formatting, arrangement, reading-order, content and state permissions. It is a local developer interface. Accepted proposals require an inert rendered preview with geometry and contrast checks in both themes and multiple widths. Dynamic component proposals are refused; see [rendered validation](docs/rendered-validation.md).

**Editable components:** select paragraphs and choose **Text panel**, or add an independent **New panel**. Panels and copied PNG/JPEG/WebP/GIF images support guided flow or free placement, width, coordinates and layers. Use drag/resize handles or numeric controls; layout and text share undo/redo. Motion presets and GIFs respect pause and reduced-motion settings. Images are limited to 10 MiB and 32 megapixels, with additional GIF frame/work limits.

## Connections and local discovery

Click a note's **⤳** handle to reveal its connections as free-floating nodes and individual controls, without an enclosing window or background fade. **Click a node or press Enter for a small popup pointing to it**, then choose **Open note** or **Connect**. The popup also offers removal or dismissal where applicable. **Ctrl+click** (Cmd+click on macOS) toggles multiple notes; **Connect N notes** links each to the named source, with one Undo for the batch. It never creates links between the selected notes themselves. Escape dismisses the popup/selection first, then closes the graph. Dragging moves nodes without opening a popup or navigating; pan the empty graph area and scroll to zoom. Released nodes and panning coast to a stop; reduced motion removes momentum. The source name stays visible, including when opening from a card. Outside click, the source arrow and Focus mode close the graph. Keyboard navigation and a **List view** alternative are available.

Search initially covers all direct saved connections of the named source, even those outside the visible graph. **Add notes** switches to workspace search; connecting keeps results open for multiple links. Result titles open notes directly; the separate **Show in graph** control reveals a result without navigating. **References** shows incoming/outgoing written links. Stronger saved edges are thicker and more emphasized, independent of zoom. Hover/focus an edge to see its exact **1–5** value; select it to adjust strength. Dashed edges remain unconfirmed suggestions. Connection and strength changes offer Undo independently of text history. Removing a connection leaves written references intact.

The initial graph contains up to 20 confirmed neighbors and five gray, labeled suggestions. **More suggestions** adds five at a time up to twenty, then pages. **List view → More connected notes** pages additional direct connections, including unavailable notes. The graph stays within 60 nodes and 180 edges. Positions are temporary and never change note layout. The force worker stops when settled or closed, and pauses during typing to prioritize writing. The bottom controls distinguish the primary Add notes action, discovery controls and compact view/settings icons. Node content previews remain a future idea.

Alternatively, drag a handle onto another note card, the open note body, or an internal note reference. The curved connector trails the pointer and retracts when released. Leaving the window releases it without saving; returning requires a fresh press. Targets follow the actual pointer, and saving does not wait for retraction. Reduced motion removes trailing/retraction animations. Mutual connections never insert text.

Keyword/tag suggestions and text search work offline without a model. The graph's **cog** contains **Local discovery · experimental**, persistent dismissal restoration, model installation, indexing progress, pause/resume, battery controls and removal of semantic data. Enable local discovery, then explicitly download the verified 22.6 MiB pack or install it offline. Search returns text matches first and optionally adds local semantic matches after a 350 ms pause. Initial indexing and cold search scopes can take substantial time. Notes and embeddings are never uploaded; the model download host receives ordinary connection metadata. Cloud AI is not included.

See [graph validation and measurements](docs/connections-graph.md) for verified behavior and performance limits. Tests use `scripts/connections-smoke.js` and `scripts/graph-discovery-smoke.js`; the latter requires the disposable fixture generated by `scripts/create-graph-fixture.mjs`.

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

The prototype has no cloud AI connection, telemetry, remote fonts, sync, app-wide plugin execution, or remote media fetching. Explicitly enabled note components run in the bundled bounded QuickJS Worker. Editor assets and the inference runtime are bundled; model weights are a separate explicit download/offline installation. Future AI formatting must go through validated scoped operations; the prototype's human editing command is not an AI-safe API.

## Backup and restore

Open **View → Workspace details → Backup and restore** in the desktop app. Create a new .noted-backup archive, inspect it, and restore to a **new folder**. Notes, assets, schema/component definitions and saved connections are preserved together. Existing destinations are never replaced. **Open restored copy** uses a separate window and fresh profile, so imported component code starts disabled. See [backup/restore](docs/backup-restore.md) for recovery warnings and limits.

## Reference hardware testing

The [portable benchmark kit](docs/reference-benchmark.md) records actual hardware, instrumented startup, sampled process memory, writing workloads and eight active components. Build it with **npm run bench:reference:kit** after the release build. Tests on this Ryzen 9 machine do not certify an inexpensive laptop. A separate physical reference device and agreed resource budgets remain required.

## Current boundaries

- The JSON format is experimental and subject to migration as the document model develops.
- Markdown shortcuts cover the editor's supported constructs; this is not a complete Markdown round-trip implementation.
- Presentation presets demonstrate deterministic formatting. The small body/heading schema editor includes opt-in automatic rules; broader schema behaviors and cloud AI integration remain future work.
- Zoomable drawing/canvas tools, folder overviews, animation FPS controls, flashbacks, and sync remain on the roadmap.
- See [architecture](docs/architecture.md) and [performance](docs/performance.md) for decisions, limitations, and verification scope.

No project license has been selected yet. Third-party dependencies retain their respective licenses.


## Daily-use alpha and agents

The library now has folder rename/move, note Trash/Restore and **Recover draft / keep both** after save conflicts. **Note presets** previews Lecture, Project and Journal layouts before applying one undoable change. **Review notes** resurfaces original notes offline with folder/tag filters, reviewed/snooze/exclude/reset controls. See [daily-use behavior and verification](docs/daily-use-alpha.md).

**Agent access** lets you explicitly select exact folders for a local MCP agent to search and read. Access is disabled by default and can be revoked while the server runs. **Ask agent for layout** creates an explicit revision-bound request; proposals require rendered preview, acceptance and support Undo. Build the companion with `npm run agent:build`; no agent configuration is changed automatically. This is a tested local transport/inbox, not a connected hosted Dot plugin or automatic model client. See [setup, privacy, actual capabilities and limits](docs/agent-integration.md).


## Proposed migration support

Migration from Obsidian and Logseq has been assessed, including Markdown, links/anchors, folder structure, attachments, block references, source recovery and explicit loss reports. It is **planned, not implemented**. See [the migration proposal and dependencies](docs/migration-plan.md). No personal vaults are read by this feature assessment.

## Exported-folder migration and live agent evidence

Workspace details supports dry-run Markdown, Obsidian and Logseq file-graph imports into a separate workspace, with explicit fallback acceptance and recoverable original bytes. See [migration scope](docs/migration-plan.md). Heading/block links navigate by stable ID; imported folders start unshared.

A synthetic GPT-6.1 Sol request using existing official Codex ChatGPT sign-in passed the MCP permission, queued proposal and native preview/Apply/Undo flow. Inference is hosted; no personal notes were transmitted. This hosted chat is still unconnected, and the explicit in-app send controls now use existing ChatGPT sign-in. See [agent integration](docs/agent-integration.md) and [current verification/release gates](docs/milestone-verification.md).


### Subscription controls resumed after scope clarification

The later deferral applied to Afterglow, not Noted. The authorized Noted controls are now implemented: explicit **Send this saved note using ChatGPT**, existing official Codex ChatGPT sign-in only, fixed GPT-6.1 Sol/medium, one temporary static-note snapshot (64 KiB maximum), one running job, cancellation and a three-minute timeout. The model has only the temporary formatting-request/proposal tools; no other notes or personal sharing policy are copied. No API-key fallback, credentials or hosted-chat access is added. Proposals still require rendered preview and explicit acceptance; nothing auto-applies.

Passive polling checks local job/proposal status while its dialog is open and does not initiate model calls. Transport heartbeat is separate from sharing policy and never claims this hosted chat is verified. Hosted-chat activation still requires its separate account/tunnel/plugin setup and approval. Earlier references to deferral describe the prior checkpoint, superseded by this clarification.

Current validation: 160 frontend tests and 83 desktop/native tests pass (four optional model/corpus tests skipped). The Windows release and matching agent companion build successfully. Live native subscription evidence is retained in ignored `output/subscription-live-start.log` and `output/subscription-live-finish.log`.

## Simplified AI formatting

Choose **Format with AI**, describe the change, then **Generate proposal**. A validated current/proposed comparison opens automatically; choose **Apply** or **Reject**, with visible Undo after Apply. External-agent requests and technical JSON remain under Advanced. Duplicate requests are reused and inactive history is labelled. No background model generation or new sharing is enabled. See [workflow and verification](docs/ai-formatting.md). Restart with the updated native build after saving any open work.

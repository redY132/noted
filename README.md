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

To build a private Windows ZIP from a recorded source commit, use `scripts/Build-Portable.ps1` from a clean tree. It rebuilds all three binaries and verifies the archive's checksums, payload list and source identity. See [portable release verification](docs/portable-release.md).

## Browser preview

```powershell
npm run dev
```

Open the localhost URL printed by Vite. The explicitly labeled browser preview uses its own browser storage, separate from native desktop notes. It is useful for UI development, but does not exercise Rust persistence or represent WebView2 performance. Preview data can disappear if browser storage is cleared; use disposable notes.

## Appearance and layout

**Browse** opens one left dock containing folders, a scrollable note directory and a large persistent saved-connections graph. It pushes the document right on one continuous background. Hover or focus a note to highlight its graph node. The 52px top bar keeps Browse, formatting, **View**, **Appearance**, the connection arrow and save status available. **View** offers layout tools, note details, the footer, Open note, New note and Workspace details.

**F8** toggles Focus mode, hiding optional panels and restoring their previous arrangement when you exit. **/** reveals workspace search. **Ctrl+F** opens Find even with formatting hidden. Hiding controls keeps the current editor, selection and undo history intact.

**View > Go to heading** searches the open note's H1-H6 titles in logical reading order. Choose a heading to move within the same editor, or Escape to return without changing the selection. Long outlines load in pages. Heading and block-link jumps preserve Undo and reliably reveal the destination. See [Go to heading](docs/go-to-heading.md).

**Browse > Review notes** revisits original notes offline. Filters update the queue directly; Reviewed today follows the device's local calendar and Snooze lasts 24 hours. Include hidden notes to reset reviewed, snoozed or excluded choices. Opening saves the current draft first and does not mark a note reviewed. See [review behavior and checks](docs/review-notes.md).

**View > Previous save** previews the immediately previous completed save and recovers it into a separate note. Your current draft is saved before switching; the captured old copy never replaces the original. Supported images and private-note AI exclusion carry into the copy. This keeps one previous save, rather than a full version history. See [previous-save recovery](docs/previous-save.md).

**Ctrl P / Cmd P** or **View > Open note** searches saved titles, text and tags locally without changing dock visibility. Arrow keys and Enter open a result; Escape returns to writing. Switching saves the current draft first. The picker identifies an updating search index, supports paging and retries, and preserves the editor/Undo when cancelled. See [Open note](docs/open-note.md).

**Back / Forward**, **View > Note history**, or **Alt Left / Alt Right** on Windows return to previous visits with their reading position and selection. History keeps up to 100 visits in memory, preserves unavailable Trash entries and follows Restore. Failed saves and loads leave the draft and destination available for retry. See [Note history](docs/note-history.md).

Explicitly started AI jobs have a status strip that remains available after closing their dialog. Open generation or Review proposal returns to the correct note through save-before-switch. Closed-dialog polling reads local job metadata only; it does not send more notes or wake agents. See [AI formatting](docs/ai-formatting.md).

**View > Note actions** always provides presets, schemas, AI formatting, Copy block link and Move note to Trash. In short writing areas, this replaces the wrapping action row to keep the document visible.

**View > Help & shortcuts** searches 23 local command and workflow references, including recovery, keyboard navigation and the optional AI proposal flow. It works before creating a note and needs no account or network. See [Help and shortcuts](docs/help-and-shortcuts.md).

**Appearance** offers System, Light and Dark, accent swatches and a custom color picker. Appearance and panel choices are saved on this device separately from notes, with independent **Reset appearance** and **Reset layout** actions. Explicit note colors and component styles remain authored content. Brief fluid transitions follow the system reduced-motion preference; typing does not wait for animations.

`sidebar-smoke.js` checks the accepted docked layout; `daily-workflow-smoke.js`, `daily-workflow-faults.js` and `daily-workflow-visual.js` cover quick switching and AI disclosure. Run through Playwright CLI with guarded synthetic fixtures on port 1436 or a disposable `noted-sidebar-ui-*` native workspace. Tests create notes and change only fixture preferences. Do not use private imports as test data.

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

Keyword/tag suggestions and text search work offline without a model. The graph's **cog** contains **Local discovery · experimental**, persistent dismissal restoration, model installation, indexing progress, pause/resume, battery controls and removal of semantic data. Enable local discovery, then explicitly download the verified 22.6 MiB pack or install it offline. Search returns text matches first and optionally adds local semantic matches after a 350 ms pause. Initial indexing and cold search scopes can take substantial time. Local discovery keeps notes and embeddings on this device; the model download host receives ordinary connection metadata. Optional [AI formatting](docs/ai-formatting.md) uses a separate explicit Generate proposal action and account limits.

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

Desktop notes live in the local workspace reported by the app. Note files use
structured JSON and stable UUIDs. `index.sqlite3` and semantic indexes are
rebuildable; `relations.sqlite3` stores authoritative connections and dismissals.
Use a consistent workspace backup to preserve them together.

For disposable development data, set an absolute path before launching:

```powershell
$env:NOTED_WORKSPACE = Join-Path $PWD 'output\scratch-workspace'
npm run desktop
```

The native store rejects stale saves using revisions and file fingerprints.
Save conflicts offer Retry, Keep both and draft download; Previous save recovers
one earlier completed save as a separate note. Local files are not application
level encryption or a substitute for backups.

Noted does not automatically sync notes. Explicit **Generate proposal** sends
the approved saved-note snapshot and instructions to OpenAI through the existing
ChatGPT-signed-in Codex client. A full schema guidance document requires fresh
per-request consent. Image bytes are not sent. Ordinary editing, review feeds,
backups and local proposal loading do not start model calls. Private imports
remain excluded from all AI routes, including explicit requests and embeddings;
see [AI privacy](docs/ai-privacy.md).

Appearance and panel preferences stay on this device. Optional local semantic
discovery requires a separately installed model pack; no download runs
automatically. Enabled note components execute in the bounded QuickJS Worker,
with each exact code version disabled until explicitly enabled.

## Backup and restore

Open **View > Workspace details > Backup and restore**. Create a checksummed
`.noted-backup` archive, inspect it, and restore into a **new folder**. Existing
destinations are not replaced. Notes, supported assets, definitions, connections
and private-note AI exclusion are preserved together. **Open restored copy**
uses a separate window and fresh profile, with sharing and component execution
disabled by default. See [backup and restore](docs/backup-restore.md).

## Optional AI and agents

Choose **Format with AI**, describe the change and select **Generate proposal**.
Review the validated current/proposed comparison, then Apply or Reject. Apply
retains saved Undo. Goals cover formatting, schema adherence and interactive
component suggestions; generated components require separate sandboxed preview
and insert disabled. See [the current workflow](docs/ai-formatting.md).

The local client and MCP companion run on this computer; model inference is
hosted. Generation uses existing official Codex ChatGPT sign-in and that
account's available model/usage limits, with no API-key fallback. The current
runner is configured for GPT-6.1 Sol/medium, one static saved-note snapshot up
to 64 KiB, one running job and a three-minute timeout. Nothing applies
automatically. Cancellation reports local status and cannot recall processed
provider usage.

**Load proposal** retries an existing local result without another generation.
Saved proposals can be checked when sign-in discovery is unavailable; new
generation remains disabled until sign-in is known. Privacy and freshness are
checked again before review. The status strip retains explicitly started work
after closing its dialog or visiting another note; its polling reads local
metadata and does not wake an agent or resend notes.

**Advanced** contains external-agent requests, saved-request selection and
sign-in refresh. Create request saves a revision-bound one-note request; it
does not start a model. Such an explicit request may permit an authorized agent
to read that note for up to 24 hours, including outside shared folders. Proposal
validation and explicit approval still apply.

**Agent access** selects saved folders for an optional local MCP agent. Its
model provider determines where retrieved content is processed; local transport
does not imply local inference. Access starts disabled and can be revoked while
the server runs. Build the companion
with `npm run agent:build`; no client configuration is changed automatically.
See [agent setup and capabilities](docs/agent-integration.md).

Hosted assistant access requires separate account/tunnel/plugin setup and
explicit approval. Local Codex configuration does not establish that connection; see
[hosted-chat setup](docs/hosted-chat-setup.md). No hosted credential or connection
is created by the build or test workflows.

## Importing exported notes

**Workspace details** supports dry-run imports of Markdown folders, Obsidian
vault copies and Logseq file graphs into a separate workspace. Review the loss
report and explicitly accept supported fallbacks before publication. Original
bytes remain recoverable, supported heading/block links use stable IDs, and
new workspaces start unshared. See [migration scope and limits](docs/migration-plan.md).

The developer SQLite adapter is a separate, gated path. Missing asset bytes or
unsupported live/dynamic features block publication. It is not full Logseq DB
parity or an ordinary in-app SQLite import. Keep the original export; use
generated fixtures for automated testing. See [SQLite conversion and privacy](docs/logseq-sqlite.md).

## Verification and release gates

The latest implementation checks passed **304 frontend tests** and **113 native
tests**, with four optional model/corpus tests ignored. Rendered AI workflows
use explicit account/model stubs. Native runner ownership tests use a bounded
inert test executable, never Codex. Earlier synthetic live-model evidence is
recorded separately in [milestone verification](docs/milestone-verification.md).
See [UI checks](docs/evening-ui-checks.md) for rendered scope and limitations.

The [reference kit](docs/reference-benchmark.md) includes pristine generated
notes, no-model isolation, timing proxies and a disconnected resource mode.
Build it after `scripts/Build-Portable.ps1` from the same clean source commit
using `npm run bench:reference:kit`. Development-PC runs do not certify an
inexpensive laptop, physical key-to-paint, normal cold startup or agreed resource
budgets. The [memory investigation](docs/memory-investigation-2026-11-07.md)
records the fixed image lifetime leak and the actual eight/fifteen-minute controls.

The JSON format is experimental. Markdown shortcuts and migration do not
provide complete Markdown, Obsidian or Logseq round-trip parity. Broader schema
rules, document drawing/zoom, full version history and sync remain future work.
Real reference hardware, release budgets, installer/signing and the project
license/distribution decision remain pending. Generated portable ZIPs are
private unsigned developer alphas. Third-party dependencies retain their
respective licenses. See [architecture](docs/architecture.md),
[performance](docs/performance.md) and [portable release verification](docs/portable-release.md).

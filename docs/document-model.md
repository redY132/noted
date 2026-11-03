# Version 2 document foundation

This milestone resumes the October 31 implementation interrupted by the Codex usage limit. The prior committed baseline was `48154be` (graph popups and multi-connect). The existing uncommitted document, schema and runtime work was retained and checked before continuing. A recovery snapshot of the interrupted files was also saved outside Git.

## Format and compatibility

`NotedDocumentV2` in `src/document-model.ts` separates `objects`, `readingOrder`, `layout`, `styles` and pinned schema versions. See [the JSON Schema](noted-document-v2.schema.json). Containers can nest free placement, vertical flow, horizontal flow and grids; each content ID is reachable exactly once. Grouping/movement retains logical order. Ordinary text remains directly editable in one Tiptap instance, with shared Undo for text, layout, schema formatting and persistent component state.

Both native formats remain readable. Loading/indexing a V1 note never rewrites it. The editor converts it in memory, preserving existing IDs and assigning deterministic IDs where absent. The next successful save writes V2 after retaining `<id>.pre-v2.json.bak` and the previous revision `<id>.json.bak`. V2 files omit the duplicate editing projection. Stale revision or fingerprint checks reject the entire save. Search/backlinks/semantics use logical authored content and inert declared search properties, without running components.

Assets remain immutable and note-owned. Pasting copied images across notes creates owned copies. Missing asset reads render recoverable placeholders; missing/disabled component definitions retain fallback and saved state. Importing the missing exact definition recovers its view, while execution still needs separate approval. Workspace backups must include notes, assets, `schemas/`, `components/` and a consistent authoritative relations database; indexes are derived. Exporting one note JSON alone is not a complete portable backup.

## Authoring and proposals

Show Layout tools in View. Use **Group in box**, then select its layout kind, padding, gap and columns. Panels/images/components have width, placement, coordinates and layer controls; place ordinary text inside a panel when arranging it spatially. No zoom, rotation or arbitrary HTML is provided.

**Schemas** exposes body/H1-H6 typeface, size, line height, color, spacing and indentation. Definitions are immutable, and notes pin a chosen version until explicitly updated. Suggestions preserve explicit formatting. Automatic mode enforces only enabled rules after edits. See [schema authoring](schema-authoring.md).

**Interactive** provides import, properties, source editing and exact-version Enable/Disable. Definitions are data; opening/importing never approves execution. Counter/flashcard examples use a small declarative toolkit. Read-only text bindings update after typing and Undo. Saved fallback text wins over definition defaults on failure. See [component authoring](component-authoring.md) for isolation and limits.

**Document API** accepts previewable operation batches. Trusted UI grants are separate from proposal JSON and tied to a note/revision/fingerprint. Formatting, spatial arrangement, logical reorganization, content and component state have independent permissions. Invalid/stale batches make no changes; accepted projection changes are one Undo step. Formatting preserves authored words, links, asset IDs, task state, structure and protected attributes. Content permission cannot introduce component code or change its state without the separate scope. An operation grant is not an execution approval.

Both proposal paths perform native/data checks followed by a trusted inert render. The renderer checks real geometry, clipping, decoded assets, projection fidelity and text contrast in both themes at multiple widths. Native commits require a digest-bound one-use render token. Automated proposals containing dynamic components are blocked, and AI is not connected. See [rendered validation](rendered-validation.md).

## Verification and remaining work

On November 3 the application TypeScript check, 149 frontend tests, 47 Rust core tests, the targeted semantic-feature migration test and Windows release build passed. Tests cover lazy migration, pre-migration recovery, IDs/references/state, stale saves and proposals, nested grouping, selection and Undo, immutable definitions, declared binding refresh, missing-definition recovery, formatting-scope bypasses, bounded WASM memory, malformed output, watchdog timeouts, stale runtime results and Worker cleanup.

The disposable browser document smoke checks nested layouts, schema preview/application, counter state, shared Undo, preserved reading order and reload, with light/dark screenshots at 800/1600 CSS-pixel widths. The separate real-Worker smoke passed with eight active contexts sharing 16 MiB of WASM memory, 45.1 ms cold enable/startup, 58.1 ms loop interruption, 7.6 ms p95 beforeinput-to-next-frame over 312 samples, no observed external requests and zero Workers after close. Typing, hidden/offscreen state, battery and reduced motion paused component work as expected. These timings are current-host development observations, not physical input-to-paint or reference-laptop acceptance.

The packaged Windows release also passed the document smoke with native IPC and a separate WebView data directory. On-disk inspection verified V2 without a duplicated editor projection, the compact schema reference, saved count 1 and five pre-V2 backups across the disposable fixtures. A complete native shutdown/restart restored the same words, two nested boxes, pinned schema and counter state. Native keyboard checks cycled 100 paragraphs, 1,000 paragraphs, 100 panels and mixed free media three times each at 1600x1000 CSS pixels/DPR 1. Each workload recorded 171 beforeinput-to-frame samples, with median per-run p95 of 8.0, 9.1, 8.2 and 8.0 ms respectively; no long tasks appeared during the measured typing intervals. The largest sample was 14.3 ms. These remain warm current-host scheduling measurements, not physical key-to-paint or low-end acceptance.

To reproduce the browser checks, generate `output/vite-document.config.ts` with `node scripts/create-document-harness.mjs`, start Vite with that config on port 1430, and run `scripts/document-v2-smoke.js` through Playwright CLI in a disposable session. The document smoke also supports packaged native IPC against a disposable `NOTED_WORKSPACE` and separate WebView profile. Generate the component harness with `node scripts/create-component-runtime-harness.mjs`, start its generated config on port 1431 and run `scripts/component-runtime-smoke.js`. Stop both test servers and browsers afterward. Logs, workspaces and screenshots belong under ignored `output/`.

Recommended next work, in order:

1. Finish physical reference-hardware acceptance; the only available machine is the Ryzen 9 development laptop. The portable kit and precise blocker are documented in [reference-benchmark.md](reference-benchmark.md).
2. Define a stable viewport/overflow contract for dynamic components before allowing automated proposals on widget-containing notes. Current proposals fail closed; direct human interaction remains available.
3. A consistent [backup/restore workflow](backup-restore.md) is now implemented. Future work includes richer conflict recovery UI and a stable component viewport contract before lifting automated-widget proposal restrictions.

Cloud AI, sync, full HTML/DOM widgets and app-wide plugin execution remain outside this stage.

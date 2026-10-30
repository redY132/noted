# Non-React editor comparison

This isolated experiment implements two usable component editors against the same synthetic note documents:

- `focused-tiptap`: the production Tiptap extensions, including editable note panels and locally resolved image nodes. One document/editor owns text, layout, selection and history.
- `grapesjs-tiptap`: GrapesJS core components plus its real `setCustomRte` integration with Tiptap. Inactive panels render rich HTML; an editor is instantiated when a panel is edited. The adapter retains canonical Tiptap JSON separately from display HTML. A small bounded history bridge covers the tested text/property/reorder operations without serializing the entire document on each keystroke. Generic builder operations and redo are not production-complete.

Both expose typing, resizing, moving, serialization, reopening, and text/layout undo through the same adapter interface. This is an integration comparison, not a universal benchmark of either library. GrapesJS telemetry, remote asset uploading and built-in storage are disabled. Fixtures use a generated local blob URL and never open a user's workspace.

## Run

From the repository root:

```powershell
npx tsc -p experiments/editor-comparison/tsconfig.json --noEmit
npx vite build --config experiments/editor-comparison/vite.config.ts
npx vite preview --config experiments/editor-comparison/vite.config.ts
```

Open `http://127.0.0.1:1421/`. The build writes only to ignored `output/editor-comparison-build`. The experiment is not imported into the application. GrapesJS is a development dependency.

The page offers interactive inspection and correctness checks. Automation may call:

```js
await window.editorComparison.check();
const results = await window.editorComparison.run({ repeats: 5 });
```

Use `run({ repeats: 1, inputSamples: 5, propertySamples: 3 })` only as a quick smoke test. Full results include raw samples, browser/viewport information, workload sizes and limitations. To keep browser automation commands short, start the promise, store its result on `window`, and retrieve after completion.

## Method

Four identical source workloads: one panel containing 100 paragraphs; one containing 1,000 paragraphs; 100 panels containing four paragraphs each plus ten tiny local images; and a mixed free-placement version with GIFs and animation presets. Each paragraph contains the same text template, a bold span and stable IDs. Images are deliberately tiny: this isolates editor/component overhead, not expensive raster decoding. Ordinary notes outside panels are not represented by this component-focused comparison.

Each workload warms both candidates once, then alternates candidate order between repeats. Each measured repetition creates a fresh editor and records:

1. Mount to two animation-frame callbacks, including adapter construction and initial document rendering but excluding module download/evaluation.
2. Activation of the first editable text region.
3. Forty programmatic text insertions: synchronous transaction time and dispatch-to-two-animation-frame time, separately.
4. Twenty property changes, yielding between updates.
5. Ten JSON serializations, serialized bytes, and a save/reopen content equality check.
6. DOM node count and editor teardown duration.

GrapesJS exports its full project state, including a rich-HTML representation and canonical text data; the focused editor exports its canonical JSON. Those sizes reflect the adapters' actual persistence strategies, not theoretical minimum format sizes. Both preserve the same words, rich marks and component properties. Dirty Tiptap regions in GrapesJS are captured during serialization/disable, not every keystroke.

The twelve shared correctness checks also cover free coordinates/layers, horizontal and vertical scroll reachability, position/motion undo, GIF references and links surviving serialization, and return to guided flow. These checks do not establish parity with all GrapesJS features. Actual GIF playback, pause/resume and application persistence are checked separately by `scripts/artistic-smoke.js` in Edge and native WebView2; generate its GIF using the exported `gifBytes` fixture. The smoke function samples rendered screenshots because canvas drawing of an animated image does not reliably expose its currently displayed frame.

## Interpretation limits

Programmatic insertion is **not** physical keyboard-to-paint. The double-animation-frame number is a frame-opportunity proxy and includes display scheduling; it does not prove when pixels painted. Both activation implementations wait for the same two animation-frame callbacks. This experiment does not measure cold app startup, backend saves/indexing, process-tree memory or low-end hardware. Both libraries share the same loaded test-page bundle; mount timing does not account for their different production download/parse costs. No forced GC is used, so repeated timings can include GC noise. The adapters share source content, component widths, font size and line height, but their DOM/editor controls and paragraph margins are not pixel-identical. Report medians and raw distributions, not an unsupported fastest-library claim.

Typing in GrapesJS edits an individual panel, so it may outperform a single full-document editor on some many-panel text transactions. That does not establish equivalent cross-panel selection, history, accessibility or document-level editing. The richer component machinery may increase mount/save cost. The decision should combine measured costs with the working application's behavior and complexity.

Official integration references: [GrapesJS custom RTE](https://grapesjs.com/docs/guides/Replace-Rich-Text-Editor.html), [component model](https://grapesjs.com/docs/modules/Components.html), [project storage](https://grapesjs.com/docs/modules/Storage.html), and [telemetry opt-out](https://grapesjs.com/docs/guides/Telemetry.html).

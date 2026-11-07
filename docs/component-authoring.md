# Interactive components

Components are versioned data plus JavaScript interpreted inside QuickJS, never JavaScript evaluated by the editor. Read and index a note without running its components. A fallback, properties and persistent state remain in the document when a definition is missing, disabled, malformed or fails.

The wire contract is in [component-manifest.schema.json](component-manifest.schema.json) and `src/component-runtime-types.ts`. Definitions contain `{manifest, source}`. Give source edits a new manifest version; an installed `(id, version)` is immutable. Importing stores data only. Running requires the user to enable the exact SHA-256 of normalized manifest and source. Changing source, properties declarations, bindings or version requires another approval. Approval preferences remain outside note documents, so importing a note cannot grant execution.

## Authoring contract

Note grids containing interactive components retain their declared column count
and use the existing 160px component-width minimum per cell. The writing area
scrolls wider grids instead of compressing their controls. Default widget text
uses the widget surface's theme foreground; explicit colors still belong to the
definition. Buttons, text inputs and toggle labels have a 44px minimum hit area.
Complex custom layouts still need inspection at the intended available widths;
this is not a complete automatic widget-viewport contract.

Source is a JavaScript expression producing `{render(input, ui), reduce(input, event)}`. `render` returns a declarative toolkit tree. `reduce` optionally returns `{state, transient}`. Inputs are JSON copies and deeply frozen. `properties` and persistent/transient state have declared scalar fields with validated types, optional bounds and defaults. A user event can persist state; an animation tick cannot. Persistent state passes through an editor transaction and shares ordinary Undo. Transient state resets when an instance is unloaded.

```javascript
({
  render({properties, state}, ui) {
    return ui.row([
      ui.text(properties.label + ': ' + state.count),
      ui.button('Add one', 'increment')
    ], {gap: 8});
  },
  reduce({state}, event) {
    return {state: {count: event.id === 'increment' ? state.count + 1 : state.count}};
  }
})
```

The counter and flashcard definitions in `src/component-runtime-examples.ts` are complete examples. Flashcard flips are transient; counter changes are persistent.

Toolkit primitives are `text`, `button`, `input`, `toggle`, `image`, `row`, `column`, `grid`, `drawing`, `rect`, `circle`, and `line`. Images take owned local asset IDs, never URLs. Geometry is finite and bounded to 2,048 units; grid columns are bounded to 12. Colors accept hexadecimal colors, `transparent` and `currentColor`. Text is always rendered using text content. No HTML, arbitrary CSS, SVG markup or event-handler strings enter the host page.

`manifest.searchText` names authored string properties that may be indexed. It must not name computed output or transient state. `manifest.bindings` declares read-only authored-text IDs; the host supplies only declared bindings, capped at 8,192 characters each. A component has no direct access to the document or another component. Bindings do not grant edit permissions.

## Execution limits

- Pinned packages: `quickjs-emscripten-core` and `@jitl/quickjs-wasmfile-release-sync` **0.32.0**. The bundled WASM SHA-256 is `105c3bed22d457e43e3d1c3c1c6959fda62a8fe06f0fc8a985303c3a2be72232`.
- One dedicated Worker, one imported `WebAssembly.Memory`, initially 16 MiB with an independent maximum of **64 MiB total**, shared by up to **eight live contexts**. The exact pinned module imports one memory; changed binary bytes fail verification before instantiation. The 48 MiB engine allocation limit is supplementary, not the security boundary.
- Engine interruption after 40 ms per call; an outer host watchdog terminates the Worker after 350 ms without a response. Initial bundled-runtime loading has a separate 3-second allowance. A timeout keeps fallback and saved state, stops that execution and does not automatically retry.
- Source 256 KiB; persistent JSON 64 KiB; output 256 KiB; messages 512 KiB; UI trees 256 nodes and 16 levels; individual strings 8,192 characters.
- No DOM, network, filesystem, browser globals, app IPC, module loader or host object references exist inside QuickJS. The Worker itself fetches only the bundled, verified WASM; component JavaScript cannot access that fetch function.
- Animations have no interpreter timers: the host supplies at most 30 ticks per second. Ticks stop while typing, offscreen, hidden, on battery or under reduced motion. Offscreen contexts unload, allowing visible components to use the eight-instance budget. Closing the last component terminates the Worker and invalidates queued requests.

Content Security Policy permits `wasm-unsafe-eval` for the interpreter, without enabling JavaScript `unsafe-eval`. Components are not full HTML/DOM widgets and are not app plugins.

## Validation

`src/component-runtime.test.ts` covers capped memory growth and allocation exhaustion, runtime checksum rejection, eight-context limit, unavailable privileged globals, module-loading rejection, malformed/oversized UI, field validation, transient state, exact-version approvals, obsolete render rejection, outer watchdog termination and no Worker recreation after close. Browser/native integration and writing latency must also be measured before claiming the complete feature is accepted on the reference laptop.

The isolated Edge browser smoke (`scripts/component-runtime-smoke.js`, 2026-10-31) exercised real Web Workers and eight contexts on port1431: **16 MiB** shared WASM memory, **45.5 ms** cold enabled-runtime startup, **57.9 ms** to stop an infinite loop, and **7.5 ms p95** from `beforeinput` to the next animation frame over 312 typing samples with eight 30-FPS components. It observed no external requests and zero live Workers after closing. Disabled versions created no Worker; typing, hidden documents, offscreen elements, battery power and reduced motion stopped animation; reduced-motion/battery recovery resumed it. These are current-host development measurements and a scheduling proxy, not reference-laptop key-to-paint or private-process-memory acceptance.

To reproduce, run `node scripts/create-component-runtime-harness.mjs`, launch Vite with `--config output/vite-runtime.config.ts`, open `http://127.0.0.1:1431/output/runtime-harness.html` in a disposable Playwright CLI browser, and run `scripts/component-runtime-smoke.js` using CLI `run-code --filename`. Close that browser and server afterward. The harness, cache and result artifacts stay under ignored `output/`.


## AI component suggestions (2026-11-04)

Use **Format with AI → Goal → Create interactive component**, describe it, then **Generate proposal**. This explicitly sends the saved static note and instructions through the existing ChatGPT-signed-in Codex client (GPT-6.1 Sol, medium). The component branch has no MCP tools, shell, browser, app integrations or access to another note. It returns an inert component definition and declared properties. Requests are revision-bound, reusable only within the same kind/context, cancellable and limited to three minutes. The original note remains unchanged.

The review shows a summary, readable fallback, properties and source. Nothing executes on arrival or opening. **Run sandbox preview** grants only the exact proposed code hash to that temporary runtime; this approval lives in memory and is never written to the saved execution-approval list. The existing verified QuickJS Worker enforces its memory, time, output and declarative-UI bounds, with no file, network, DOM, app IPC or module-loader globals. Interactive preview state is temporary; closing/rejecting terminates the runtime. Source validation alone does not execute code.

After a successful render, **Insert disabled component** saves the immutable definition and inserts its declared properties with default persistent state. Preview state is not copied into the note, and execution remains disabled. Enable the exact version later through the existing Interactive settings only if desired. The visible Undo restores the note; its inert library definition remains available. Reject leaves the original note untouched and removes the request/proposal. A stale note requires a new proposal/preview.

This first version creates a new component from a static note; it does not replace existing components, declare authored-text bindings, request animation ticks, or add arbitrary HTML/DOM widgets. AI source is capped at 64 KiB; normalized proposals at 256 KiB; the existing 64 KiB static-note limit applies. Component suggestions do not consume full-document schema guides. The external five-tool formatting bridge does not expose component requests or accept component source. Automated formatting/layout of notes that already contain widgets remains blocked by the existing rendered validator. The bounded, scrollable component preview tests a current state; it does not certify every future state/layout.

Verification: 175 frontend / 93 native tests passed (four optional model-pack tests ignored), and the Windows release built. The real native fixture verified no execution on proposal arrival, absent privileged globals, temporary preview state, disabled insertion, shared Undo, unchanged persistent approvals, zero active preview Workers after close, and unchanged disabled fixture sharing. A live synthetic Codex generation passed explicit interactive preview and rejection without note/approval changes. External MCP compatibility, private canary refusal and revocation also passed. Evidence is in ignored `output/component-*.log` and `output/playwright/component-*.png`. No personal notes or database records were used.

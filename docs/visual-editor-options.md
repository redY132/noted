# Existing visual-editor options

Initial research date: 2026-10-25. The original assessment was planning-only; implementation status is recorded below.

**Implementation update:** the user subsequently requested both non-React approaches be implemented and measured. [The comparison and decision](../experiments/editor-comparison/RESULTS.md) retain the focused Tiptap component layer in the application. GrapesJS/Tiptap is implemented only in the development experiment. The planning assessment below is preserved as the rationale for the candidates, not the current implementation status.

The user approved JavaScript-defined components with explicit programmatic editing interfaces. This does not require inventing all visual-editor machinery. The references below cover different parts of that machinery, not the whole Noted application or an untrusted-code sandbox.

## Shortlist

| Candidate | Relevant capabilities | Main integration question |
| --- | --- | --- |
| Puck core | React component registration, fields mapped to properties, nested page layouts, structured page data, and inline rich text backed by Tiptap | Can it provide a writing-first experience with existing note semantics, acceptable long-document performance, and the needed layout interactions? |
| Craft.js | React framework for custom page editors, component selection/movement, editable properties, nested drop areas, and JSON state serialization | Greater control over UI, but more editor controls, rich-text integration, and behavior must be assembled and maintained by Noted |
| GrapesJS core | Component models/views, styles, assets, editable traits, and structured project storage for visual web authoring | Can its web-builder model be adapted without compromising note editing, preservation of content, or local privacy? |

Puck and Craft.js repositories identify MIT licensing. GrapesJS core uses BSD-3-Clause terms. GrapesJS Studio SDK is a distinct offering under separate licensing; do not assume core licensing covers the SDK or its plugins. Recheck the exact package versions and transitive dependencies before adoption.

GrapesJS documents telemetry with an explicit opt-out (`telemetry: false`); any evaluation must disable it and verify actual network behavior. Puck's core editor is distinct from its cloud AI offering; evaluation should use local core functionality without enabling cloud integrations.

## Recommendation

The user subsequently expressed a preference to avoid React because it adds complexity to the existing frontend. This supersedes the earlier recommendation to evaluate Puck first. JavaScript-defined components do not require React. Puck and Craft.js are deprioritized under this preference, without claiming that React inherently makes an editor slow.

Evaluate GrapesJS core as the leading non-React candidate from this shortlist, alongside a baseline that retains Tiptap and adds a focused component/layout layer using reusable tools where appropriate. GrapesJS offers substantial visual web-authoring machinery, but its built-in rich-text editor is deliberately minimal. Its documented custom-RTE interface permits replacement; preserving Noted's Tiptap behavior would require an integration, not merely enabling a setting. Validate selection across regions, Markdown shortcuts, unified undo, content preservation, and save/reopen before adopting it. No implementation has been selected.

There is no measured performance ranking between these options for Noted. Removing a React dependency does not prove GrapesJS will use less CPU or memory: it has its own component models, views, and editor lifecycle. Retaining the existing text editor minimizes replacement work, but a custom layout layer also has implementation and maintenance costs. Rust/Tauri storage can remain behind an adapter; state synchronization, rendering cost, and validation still require real integration work. Avoid selecting the permanent note format solely by copying an editor's internal state shape.

None of these references establishes turnkey infinite-canvas support with Noted's exact behavior. Their use of a page-editor "canvas" must not be confused with unbounded free positioning, zoom/pan, layering, and mixed flow/canvas views. Validate those separately.

## Responsibilities Noted retains

- Stable note/content/asset identities, versioned serialization, migration, backups, and safe offline saves.
- Note-level connections, schemas, search, semantic retrieval, and flashback policies.
- Current-note-only editing, protected content/reference checks, and revision-aware AI operation validation.
- Isolation of generated JavaScript. A visual editor's permissions UI or preview iframe is not an untrusted-code security boundary. Only vetted component implementations belong in the trusted editor runtime; generation code must remain mediated.
- Imported local asset management, resource budgets, and a user experience optimized for writing.

## Suggested evaluation before adoption

Use disposable notes to test text editing and selection across components, Markdown shortcuts, rich-format preservation, image import and arrangement, properties, undo/redo, save/reopen, and programmatic changes through the same editing contract. Test actual serialized data against Rust validation and migration requirements.

Measure both a long note and a page with many components in a packaged Windows build: typing latency, frame pacing, initial load, memory, and serialization cost. A 50,000-note collection should never mean mounting 50,000 editors; collection indexing and active-document rendering are separate workloads. Check offline operation and network silence, and verify scoped formatting cannot alter content even when invoked outside the UI.

Use the same note content, media, and interactions for comparisons on a representative inexpensive Windows laptop. Include typing within a long text region, selecting across component boundaries, dragging an image, and undoing mixed text/layout edits. Keep typing updates local where possible, defer expensive indexing work, and pause offscreen animation. Do not assume one editor instance per paragraph or whole-document serialization on every keystroke will scale. Measure before choosing rendering and persistence optimizations.

## Primary sources

- [Puck introduction and core licensing](https://puckeditor.com/docs)
- [Puck rich-text integration](https://puckeditor.com/docs/integrating-puck/rich-text-editing)
- [Puck page data](https://puckeditor.com/docs/api-reference/data-model/data)
- [Craft.js overview and serialization](https://craft.js.org/docs/overview)
- [Craft.js repository and license](https://github.com/prevwong/craft.js)
- [GrapesJS components](https://grapesjs.com/docs/modules/Components.html)
- [GrapesJS custom rich-text editor integration](https://grapesjs.com/docs/guides/Replace-Rich-Text-Editor.html)
- [GrapesJS project storage](https://grapesjs.com/docs/modules/Storage.html)
- [GrapesJS core license](https://github.com/GrapesJS/grapesjs/blob/dev/packages/core/LICENSE)
- [GrapesJS telemetry controls](https://grapesjs.com/docs/guides/Telemetry.html)
- [GrapesJS Studio SDK license](https://github.com/GrapesJS/studio/blob/main/LICENSE.md)

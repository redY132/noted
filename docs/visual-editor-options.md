# Existing visual-editor options

Research date: 2026-10-25. Planning only; no packages installed or prototype code replaced.

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

Evaluate Puck first because its documented component-field contract is close to the approved approach, and its rich-text field uses Tiptap, which Noted already uses. This is a fit assessment based on documentation, not a benchmark. Shared use of Tiptap does not guarantee compatible serialization, extensions, undo, or migrations.

Craft.js is the alternative if Puck's interaction model requires too much adaptation. GrapesJS core merits consideration if detailed website-style editing proves more important than a component-first React approach. No implementation has been selected.

Puck and Craft.js would introduce React into the existing TypeScript frontend. Rust/Tauri storage can remain behind an adapter, but state synchronization, rendering cost, and validation require real integration work. Avoid selecting the permanent note format solely by copying an editor's internal state shape.

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

## Primary sources

- [Puck introduction and core licensing](https://puckeditor.com/docs)
- [Puck rich-text integration](https://puckeditor.com/docs/integrating-puck/rich-text-editing)
- [Puck page data](https://puckeditor.com/docs/api-reference/data-model/data)
- [Craft.js overview and serialization](https://craft.js.org/docs/overview)
- [Craft.js repository and license](https://github.com/prevwong/craft.js)
- [GrapesJS components](https://grapesjs.com/docs/modules/Components.html)
- [GrapesJS project storage](https://grapesjs.com/docs/modules/Storage.html)
- [GrapesJS core license](https://github.com/GrapesJS/grapesjs/blob/dev/packages/core/LICENSE)
- [GrapesJS telemetry controls](https://grapesjs.com/docs/guides/Telemetry.html)
- [GrapesJS Studio SDK license](https://github.com/GrapesJS/studio/blob/main/LICENSE.md)

# Noted — Working Specification

Status: Early planning. This document will evolve as the app is discussed; nothing is final unless explicitly agreed.

## Product direction

Noted is an open-source desktop note-taking app with extensive visual customization and optional AI assistance. Notes are expressive, webpage-like documents, with an experience comparable in freedom to Google Drawings.

The product premise is that actively taking notes supports memory retention. Noted should preserve the user's role in writing notes. AI primarily helps make those notes more attractive and better organized, giving users a reason to revisit them.

Additional features may support note-taking, memory retention, and reflection on an overview of the user's life so far. The exact form and scope of these features remain open.

## Core principles

- Preserve active, user-authored note-taking as the core experience.
- Support substantial artistic freedom in both individual notes and the app itself.
- Privacy and performance are the highest priorities when evaluating features and implementation choices.
- Basic editing without animations or artistic effects must feel consistently smooth on an inexpensive Windows laptop. Expensive visual features must have adjustable costs and remain usable on integrated graphics.
- Everything except cloud AI must work offline. Non-AI functionality must not require an AI account.
- Enable AI only through user preference; core note-taking must remain useful without AI.
- Use as little AI credit expenditure as practical while preserving functionality and freedom.
- Keep schema conformance under user control: offer suggestions and an optional automatic-enforcement mode.

## Core loop

1. The user takes notes.
2. The user can reorient or format a note toward a selected schema manually, enable automatic deterministic formatting, or ask AI to help within selected scopes.
3. Attractive presentation and flashbacks encourage the user to revisit notes.

## Expressive notes and app customization

- A note can be a scrolling document or an infinite canvas. The intended starting experience is a scrolling document, with a path to progressively arranging it as an infinite canvas for greater creative freedom.
- The exact transition mechanics and whether users can switch back without losing layout information remain open.
- Each note should offer webpage-like expressive possibilities, including animations, GIFs, and free positioning of content.
- Notes should support a semi-artistic experience with a high degree of control over their appearance and arrangement.
- Customization should eventually cover note appearance, the app interface, and editor behavior. These areas will be tackled individually.
- Whether custom HTML, CSS, or JavaScript are permitted remains undecided. The webpage analogy does not yet settle those implementation choices.

## Note schemas

A note schema is a structured set of rules describing how a document should be formatted. It is more specific than a natural-language style prompt. Some rules can be applied deterministically; others may require semantic judgment from AI.

Examples include font hierarchies for headings, subheadings, and body text; when to bold or italicize text; separation between blocks; and indentation beneath headings.

- During onboarding, users can describe a desired schema or select a preset.
- Multiple schemas are supported.
- Schemas can remind users of a general format while they write.
- The app can suggest changes when a note does not follow its schema.
- In suggestion mode, users can ignore suggestions or choose to apply them.
- Users can opt into automatic schema enforcement. Choosing to enforce a schema is optional; enforcement must respect the user's selected rules and AI permissions.
- Support a Logseq-like formatting option for users who prefer that style. The exact preset rules and outliner interactions still need definition; Noted must not impose that style on everyone.
- Users can revisit and reformat existing notes manually or use AI to format them toward the selected schema and style.
- Deterministic rules must be implemented in code and run consistently offline without an AI account or AI credits.
- Rules requiring AI are optional and available when the user enables AI and connects an eligible account. They must not prevent deterministic rules from working independently.
- Enabling automatic schema enforcement must not implicitly enable cloud AI or grant additional AI scopes. Deterministic formatting must remain offline and avoid unnecessary work while typing.
- The rule vocabulary, schema creation interface, assignment rules, and handling of schema revisions remain open design questions. In particular, the syntax must distinguish a deterministic condition from an AI interpretation.
- The scope of automatic enforcement (app, schema, or note), its timing, undo behavior, and precedence when explicit user formatting conflicts with schema rules remain unresolved.

## Writing experience and organization

- The preferred editor accepts Markdown and turns it into formatted content while the user writes, with presentation governed by the active schema.
- This editing experience does not yet settle the on-disk document format or Markdown dialect.
- Support a combination of folders, tags, links between notes, and daily notes in the basic note-taking experience.
- Make creating, navigating, and changing a hierarchical organization of notes straightforward, using the approved folder hierarchy below.
- Links must be reliable and must not silently disappear. Preserve their targets through supported rename, move, save, and reopen operations; make missing or deleted targets explicit.
- Proposed implementation direction: stable internal note identifiers independent of titles and folder paths, with readable link labels. The concrete link serialization and external-file-edit behavior remain undecided.
- Reliability checks should cover note renames and moves, save/reopen cycles, and missing link targets. Hierarchy operations should be understandable without special naming conventions.

### Approved hierarchy

Approved by the user on 2026-10-24.

- Use folders and subfolders as the primary organizational tree, with each note having one location. Tags and links provide additional relationships without duplicating the note.
- Allow a folder to have an optional overview note. For example, a University folder can have a writable overview alongside Biology and History subfolders or notes.
- Keep the overview as a normal note associated with the folder, using stable identity rather than relying on a special filename. Exact storage and navigation behavior remain to be designed.
- Start the first release with ordinary folders and notes; add folder overviews afterward. Arbitrary nesting of notes beneath other notes is outside the initial scope.
- Folder deletion, overview reassignment, and moves still need explicit behavior before implementation; these details do not reopen the approved hierarchy decision.

## Artistic preferences

Artistic preferences are separate from the structured rules in note schemas. They guide AI toward the user's preferred visual style and are not themselves intended to be strictly checkable rules.

The relationship between an artistic preference, a schema, and an individual note still needs definition.

## AI assistance

- AI assists with formatting and presentation of user-authored notes.
- AI is valuable but optional, and is enabled through user preference.
- Support for signing in with OpenAI/ChatGPT is an intended feature from earlier discussion; its implementation and supported account capabilities have not been finalized.
- Minimize AI usage and credit costs, with an integration tailored to Noted's formatting tasks.
- Formatting must preserve every word of the original note. Artistic formatting must also preserve original content, though adding artistic words may be allowed under a separately defined permission.
- Reorganizing and summarizing are permitted only when the user authorizes the corresponding scope. Rewriting original wording is not authorized by a formatting scope.
- Users select AI scopes. Application code must enforce them deterministically; prompt instructions alone are insufficient.
- The strict formatting path must prevent AI from modifying note content, rather than merely asking it not to.
- Exact scope definitions, whether text additions require a separate explicit toggle, preview/acceptance behavior, undo, consent to send note content, and local-model support remain open.

### Proposed enforcement design — not yet finalized

- Separate original content from presentation metadata and give content elements stable identifiers.
- For formatting, accept only typed, allowlisted presentation operations referencing existing content. Do not give this path arbitrary document replacement or direct file-write access.
- Validate the entire proposed change against the selected scope and current document revision before applying it atomically. Reject invalid or stale changes without modifying the note.
- Verify exact original content preservation, not just word counts. Formatting alone must not delete, duplicate, or reorder original content; reorganization requires its own scope.
- Represent any authorized artistic additions separately from original content. Summarization uses a distinct authorized operation.
- Check presentation operations as well: retaining text in storage is insufficient if generated styles conceal it or make it unreadable.
- These are design requirements to implement and test, not an assertion that a bug-free guarantee has already been achieved.

## Document format and editing interfaces

- Provide a text-based document representation that agents can edit, alongside a human-oriented graphical editor for the same document structure.
- The user clarified that human and agent representations need not look alike: humans directly edit notes through Noted's UI, while agents work with structured text/code. Plain-Markdown files optimized for manual editing in external text editors are not a stated requirement.
- Both interfaces must support meaningful editing of the same document model; the UI must not reduce a note to an uneditable rendered result. The structured JSON proposal remains compatible with this direction, subject to concrete format design.
- Support the long-term requirements of structured text, schema references, presentation, canvas positioning, and media references. The concrete serialization format remains undecided.
- Expose an API for note document structure to support future plugins and other integrations.
- Proposed boundary: general external text editing and in-app scoped AI editing are different access paths. Scope enforcement requires all in-app AI changes to pass through validated operations; an external agent granted unrestricted file access cannot be constrained by that application API alone.

## Connections and suggested links

Planning direction clarified by the user on 2026-10-25; this section records intended behavior, not completed implementation.

- Provide explicit note links, backlinks, and manual tagging. Shared tags are useful relationship signals, but organizing notes by hand must not be a prerequisite for discovering related notes.
- Suggested links are a central part of reducing the manual effort of connecting notes. Suggestions should help users discover older relevant notes even when they have not added tags or links.
- A connection from A to B and from B to C does not establish a meaningful connection from A to C. Do not create or present inferred connections as confirmed links solely because of graph proximity.
- Related notes serve the user's current writing or reading context. Flashbacks serve deliberate rediscovery and review over time; the two experiences may share retrieval infrastructure but need different selection policies.
- The user is interested in local semantic matching for discovering meaning beyond shared wording, with compute cost a major concern. No embedding model, runtime, hardware requirement, or accuracy claim is approved yet.

### Connection scope and editing boundaries

Agreed on 2026-10-25.

- A manually created connection is between whole notes and must not require inserting linked text into the document. Existing inline navigation links can remain available, but are not the required representation of a connection.
- Plan a dedicated section for viewing note connections; its UI implementation is deferred. Current work remains planning the document and note-connection foundations.
- Passage/block connections are outside the current product scope. Users should not need to define or maintain passage boundaries to connect notes.
- Internal text segmentation may still be evaluated for semantic indexing of long notes. Such segments are rebuildable implementation details, not user-facing connection targets; results and accepted connections resolve to whole-note IDs.
- Editing changes only the currently open note. Do not implement shared editable blocks or live content embeds through which editing one note changes the content of another. To edit another note, navigate to it. Ordinary copied content belongs independently to its destination note.
- Derived backlinks and recommendation indexes can reflect a connection without modifying the target note's authored content. Authoritative connection storage and removal semantics still need a concrete design consistent with this editing boundary.

### Manual connection strength

Direction agreed on 2026-10-25.

- User-authored tags are strong evidence of intended organization. A manual link explicitly confirms a connection between its endpoints. Both should strongly influence discovery, while allowing other evidence and the current context to matter.
- The user's "magnetic force" metaphor describes recommendation strength: manual connections attract relevant notes toward one another in suggestions, with bounded influence rather than an unconditional first-place result. This does not require a physics simulation or a visual graph.
- Explicit links retain their separate navigation role: stable, directly followable references that do not disappear when a recommendation score changes. Suggestions must not replace, hide, or rewrite saved links based on ranking.
- Manual connections should contribute candidates as well as ranking signals, so semantically distant but intentionally related notes can be found. Untagged and unlinked notes remain eligible through other retrieval methods.
- A tag shared by many notes should not make every pair equally relevant in every context. Exact weighting, the relative influence of a shared tag versus a direct link, and saturation rules remain proposals to evaluate; no numerical scoring formula is approved.
- Do not infer confirmed links transitively or treat a single accepted connection as a general rule connecting all notes on those topics. Explicit connections remain inspectable separately from the ranked suggestions.
- Personalization should normally update tag/link lookups, candidate selection, and lightweight ranking while keeping the embedding model and its distance measure stable. Ordinary tagging or feedback must not require a full semantic-index rebuild.

### Proposed retrieval design — pending validation

- Combine indexed text matching and shared-tag evidence with optional local semantic candidates. Untagged notes must remain eligible. Semantic retrieval should be able to contribute candidates independently of keyword matching so different wording does not exclude them before ranking.
- Keep suggested connections distinct from saved links. Proposed interaction: show a small set of note candidates, optionally with a read-only contextual excerpt, allow opening without connecting, and provide explicit acceptance and dismissal. Acceptance creates a note-level connection without requiring inserted text. Detailed connection-section interactions remain to be designed.
- Treat semantic similarity as a relevance estimate, not proof of a relationship or a calibrated confidence percentage. Do not generate unsupported explanations for why notes are connected.
- For local semantic matching, cache embeddings of text sections, tied to content fingerprints and model version. Recompute changed text in bounded background work; presentation-only edits should not require re-embedding. Initial indexing and model changes require separate resource budgeting.
- Reuse cached embeddings when opening unchanged notes. Coalesce pending updates while typing; tolerate delayed suggestions rather than blocking editing. CPU concurrency, memory use, battery behavior, cancellation, and indexing pause controls need measurement and explicit limits.
- Keep local-model processing opt-in, separate from cloud permissions. Notes and derived embeddings stay on device; after any explicitly authorized model acquisition, semantic matching must work offline. Basic editing, manual links, and non-model suggestions must remain usable without the model.
- Compare text/tag retrieval, semantic retrieval, and their combination on representative notes, including untagged notes and wording differences. Evaluate suggestion usefulness and reference-device latency, memory, and battery cost before selecting the implementation or defaults.
- Scale requirement clarified on 2026-10-25: users may have tens of thousands of notes containing substantial text. Budget and benchmark the number of indexed passages and total text volume, not just note count. Do not assume the current 10,000-note listing limit meets this requirement.
- Approximate nearest-neighbor retrieval is a candidate for large passage collections, not a selected implementation or a relevance-learning model. Compare memory, retrieval recall, startup, incremental updates, deletion handling, and latency against exact search and compressed or disk-backed alternatives before choosing an index.
- Proposed personalization: let tags contribute candidates and ranking signals, with explicit user relevance feedback informing a lightweight ranker. Shared tags are not proof of relevance, missing tags are not negative labels, and untagged notes remain discoverable. Changing ranking weights or tag metadata should not require re-embedding all note text; changing the embedding model requires versioned re-indexing.

## Flashbacks

Flashbacks are an important part of the product direction: previously written notes are resurfaced to encourage remembering and revisiting them.

- The initial intended presentation is a daily review feed, customizable to the user's preferences.
- Notes may resurface because they are relevant or on a periodic schedule. Relevance can involve topic, content, or sentiment.
- Users can apply tags, folders, links, and daily-note organization to express relevance manually.
- Showing related notes beside the editor is desirable if it fits privacy, performance, and cost goals. These contextual suggestions are distinct from the flashback review feed described above.
- A flashback may present a summary rather than the full note; summarization is tentative.
- Recommendation for related notes: begin with local tags, links where supported, and indexed text matching. Update incrementally, limit results, and avoid running a full-library search or any cloud AI request on every keystroke. Benchmark before enabling live suggestions by default.
- Evaluate optional local semantic matching under the connections proposal above; sentiment matching remains a separate future possibility. No model or cloud processing is committed. Summaries are optional AI operations subject to user authorization and cost controls.
- Exact ranking, scheduling, exclusions, presentation controls, and performance budgets remain undecided.

## Technical direction and future extensibility

- Target: Windows desktop first; macOS and Linux support are planned for later.
- All non-cloud-AI features must work offline, using locally available data and assets. How optional remote media is imported or cached remains to be designed.
- Device synchronization is a future direction and is not a current priority. The immediate focus is the desktop application.
- Distribution: open source. A license has not been selected.
- Rust + Tauri is conditionally approved by the user, subject to demonstrating acceptable performance in a representative prototype. No performance claim has been verified yet.
- Future plugins may be diverse; a document-structure API is an intended extension point. Plugin delivery is not a first-release requirement.
- A TypeScript webview interface is proposed; the frontend framework and editor library remain undecided. The concrete storage format, future synchronization model, plugin language/runtime, and plugin permissions are also undecided.

## Architecture proposal — pending agreement and prototype validation

The user supports the overall direction. Concrete serialization, editor selection, and storage/recovery details remain proposals pending design and measurement.

### Runtime responsibilities

- The webview owns immediate editing interactions, selection, Markdown input behavior, layout, and rendering. Typing must not wait for a Rust round trip, disk access, indexing, or network access.
- The Rust core owns validated document operations, persistence, note identity and organization, search indexing, and future AI scope enforcement and credential management.
- Use narrow application commands with validated inputs across the Tauri bridge. Keep core document logic independent of Tauri so it can be tested without opening a window.
- Apply small revisioned changes instead of repeatedly transferring an entire library or document. Background work must be bounded and must not block typing.

### Document model

- A note contains stable note identity, metadata, content elements with stable IDs, explicit reading order, and separate presentation/layout information.
- Content includes text and meaningful references such as link targets and media references; preserving text alone is not sufficient to preserve the note's meaning.
- Store document and canvas layouts as views referencing the same content, rather than maintaining two independently editable copies. Moving an object on a canvas need not change logical reading order.
- Schemas define reusable rules and style tokens; individual notes refer to them and may hold permitted overrides. Artistic preferences remain separate.
- Recommend a versioned structured JSON representation as the canonical note format, with local media stored separately and referenced by ID. Markdown input and Markdown import/export are interfaces to this model, not a second authoritative copy.
- This trades direct plain-Markdown compatibility for explicit identity, rich layouts, and enforceable editing scopes. Basic text should export cleanly; advanced layouts and animations cannot be assumed to survive Markdown export.
- The concrete format and handling of schema versions, inline formatting ranges, external edits, and migrations must be designed before commitment.
- Imported assets are copied into the local workspace, as agreed on 2026-10-25; notes must not depend on the original external file remaining at its original path. Store asset bytes separately and reference them by stable IDs. Asset edits must respect the current-note-only editing boundary; any deduplication, versioning, and cleanup design must preserve other notes and retained revisions.

### Agreed component-based JavaScript authoring direction

On 2026-10-25 the user approved predictable components implemented in JavaScript that expose programmatic editing interfaces. Human UI operations and AI-authored changes should use defined component properties and operations over persisted editable data. The concrete API, execution isolation, serialization, and dependency selection remain proposals; agreement does not authorize arbitrary note-script execution or immediate replacement of the current prototype.

- Evaluate JavaScript as a layout/template authoring language separately from the authoritative content model. Plain Markdown does not express the full asset, positioning, animation, and layout requirements; a richer data model is still required even if JavaScript authors its presentation.
- Proposed initial design: a restricted JavaScript authoring API produces typed layout/presentation data referencing existing content and asset IDs. A separately isolated, bounded executor proposes output; the trusted core validates scope, current revision, protected content/references, and resource limits before committing. Persist accepted layout data so normal opening, searching, and editing do not require executing the authoring script again.
- Library restrictions alone are insufficient. Execution must have no ambient access to app IPC, filesystem, shell, credentials, other notes, or networking. Allow only explicitly provided current-note inputs and narrowly mediated capabilities. Exact runtime isolation, resource enforcement, asset mediation, and dependency policy require design and testing; no claim of eliminated vulnerabilities is made.
- Never evaluate generated note code inside the privileged editor context. Code review, source scanning, dependency allowlists, or an iframe/worker alone are not a complete security and resource-control boundary.
- Validate rendered behavior as well as returned data: formatting must not change protected words/references or make them disappear through clipping, unsupported styling, arbitrary HTML, or executable callbacks. Rendering remains subject to the app's supported components and presentation rules.
- GUI edits must update authoritative data predictably. Making arbitrary JavaScript the sole source of truth would require solving how direct manipulation and text edits map back into code; this remains unresolved and is a reason to evaluate data plus authoring code.
- Distinguish one-time layout generation from continuously executing interactive note widgets. Long-lived scripts, arbitrary third-party libraries, and executable imported documents are separate future decisions; declarative animation/media support does not by itself authorize general script execution.

### Visual editing contract — agreed direction, details pending validation

- Provide direct rich-text editing with Markdown shortcuts as the ordinary interaction. Optional arrangement controls select, move, resize, and layer content without intercepting ordinary text selection; a contextual inspector exposes appearance and supported component properties. Exact interaction design is not finalized.
- JavaScript authoring should produce elements with stable internal identities and explicit bindings to note-owned text and assets. Those identities serve editing/layout operations, not user-facing passage connections. Formatting code references protected content instead of embedding replacement strings.
- Persist authoritative editable content and accepted component/layout state. Direct typing, dragging, resizing, and property changes update that state through revisioned, undoable operations; they must not require AI, a network request, or rewriting arbitrary JavaScript source on every gesture.
- Retained generation code is a recipe for another proposed layout, not a second independently authoritative copy of the current visual state. Re-running it requires a current-revision proposal and a defined preview/merge policy that preserves protected content and makes replacement of manual layout edits explicit. Do not promise automatic lossless round-tripping between arbitrary source code and GUI edits.
- Flow layouts should use order, spacing, and size constraints; free canvas layouts can use coordinates. Dragging a flow item changes its ordered placement rather than silently converting every element to absolute positioning. Preserve logical reading order separately from canvas placement.
- Extensible components must declare editable properties, accessible content representation, and serialization behavior. Unrestricted custom JavaScript/DOM output is not automatically fully editable or safely resource-bounded. Continuous interactive components remain a separate decision.
- Suggested first validation: type into an AI-arranged note, move/resize an imported image, change an exposed property, undo, save/reopen, and regenerate a layout without silently losing manual edits or changing another note. Existing editor behavior and note migrations must be preserved. Referenced page-editor systems are architectural examples, not selected dependencies.
- The user expressed a preference on 2026-10-25 to avoid introducing React because of added complexity. Prefer solutions compatible with the existing TypeScript/Tiptap frontend; JavaScript-defined components do not require React. This preference does not establish a measured performance advantage.
- Evaluate existing editor frameworks before implementing equivalent component selection, dragging, property editing, and serialization from scratch. The [visual-editor framework comparison](docs/visual-editor-options.md) now prioritizes GrapesJS core as the non-React candidate, compared against retaining Tiptap with a focused component/layout layer. Puck and Craft.js are deprioritized because they require React. These are research recommendations, not approved dependencies or proof of performance, privacy, or unrestricted canvas support.

### Storage and search

- Recommend individual text-based note files as the source of truth and a rebuildable local SQLite index for search, tags, links, and listings. Store media outside note JSON to avoid large embedded binary payloads.
- Stable IDs determine link identity; titles and folder placement may change without changing the target. The mapping between logical folders and physical filesystem directories remains open.
- Persist validated changes through a serialized writer with revision checks, crash-safe replacement, and a recovery strategy. Multi-file operations require a journal or equivalent recovery protocol; atomic replacement of one file alone is insufficient.
- Update indexes only from committed document revisions and reconcile stale indexes after interruption. Index loss must not cause note loss.
- Search uses indexes built from local note content and metadata, so ordinary queries can locate matches without parsing every note file. Maintain indexes incrementally and bound their background CPU, memory, and I/O costs. A database alone does not establish search latency; measure representative queries and collection sizes.
- Validate externally edited files before accepting them. Preserve malformed files and surface conflicts rather than silently overwriting either version.
- Database-authoritative storage with text import/export is an alternative offering simpler multi-record transactions, but less direct access for external text editing. This tradeoff remains open.

### Proposed development sequence — pending agreement

- First specify and validate the shared document contracts: note identity, internal content identity for editing/layout/AI operations, typed note/asset references, asset ownership and recovery, content versus presentation boundaries, revision checks, and format migrations. Cross-note block/passage addressing is outside current scope. Keep existing notes readable and avoid replacing the editor solely to introduce this contract.
- Define the authoritative serialization for approved note-level connections without inserted text, alongside existing inline navigation links. Recommended starting direction: one derived backlink/connection index with explicit source provenance and defined deduplication/removal behavior. The dedicated connection section remains deferred UI work.
- Define a minimal asset reference and import lifecycle before depending on it: files stored outside note JSON, stable IDs, locally owned copies by default, and recovery that does not remove assets still referenced by notes or retained revisions. Full artistic rendering and media analysis need not precede manual linking.
- Validate the model with a small end-to-end slice: save/reopen an asset reference, preserve a link through rename/move, migrate an existing note, and deterministically reject a presentation-only operation that changes protected words or references. This validates foundations without requiring a live AI integration.
- Then implement the manual connection experience and incremental derived indexing: explicit links, backlinks, tagging, and candidate retrieval interfaces. Recommendation scores must not change stored user intent. Do not require the full canvas, schema, plugin, or AI feature set before this milestone.
- Finally benchmark keyword/tag retrieval and optional local semantic retrieval against representative workloads, then introduce bounded personalized ranking and separately scheduled flashbacks. ANN implementation, model, numeric weights, and resource defaults remain empirical choices rather than finalized decisions.

### Privacy, extensibility, and cost

- Proposed defaults: local assets, no telemetry, and no note-related network requests until a user enables the relevant feature. Offline storage alone does not provide encryption at rest; that remains a separate decision.
- AI should submit scoped operations through the same validation layer, not receive direct write access to note files. Future plugin access should also be mediated according to declared permissions; an in-process unrestricted plugin cannot be assumed isolated.
- Start with local text search and deterministic schema evaluation. Do not require cloud inference for organization, formatting rules, or basic related-note suggestions.

### Performance and visual quality requirements

- Core typing, scrolling, selection, and navigation must remain smooth on an inexpensive Windows laptop with artistic effects and animations disabled. This is a fundamental requirement, not an optional optimization.
- The user confirmed that the earlier Chromebook comparison referred to inexpensive Windows hardware. ChromeOS is not a target platform.
- Aim for display-refresh-rate responsiveness during basic interaction. A provisional minimum benchmark is sustained 60 Hz interaction on an agreed low-end 60 Hz reference device; higher-refresh targets and exact frame-time acceptance thresholds remain to be agreed. No unlimited-FPS promise is implied.
- Expensive operations may have visible completion latency, but their scheduling must preserve responsive input. Richer visual features should remain reasonably usable on integrated GPUs at appropriate quality settings.
- Provide user-controlled visual quality settings and animation FPS caps, inspired by the control the user describes in Wallpaper Engine. Offer a way to disable visual effects and animations without disabling essential editing features.
- Separate decorative animation cadence from editor input and scrolling. A low animation FPS cap must not deliberately throttle ordinary editing responsiveness.
- Proposed controls include effect detail, render resolution for applicable effects, animation FPS, and static previews. The controls should apply only to supported rendering paths; arbitrary GIF/video playback cannot be assumed governed by a single global frame cap without suitable playback handling.
- Proposed runtime behavior: suspend offscreen or hidden decorative work, load media on demand, and avoid continuous rendering when the app is idle. Pause or reduce effects before allowing them to starve editing.

### Performance validation proposal

- Measure a packaged release build on a documented low-end Windows reference machine with integrated graphics. Exact CPU, RAM, storage, display refresh rate, and resource budgets remain to be agreed.
- Proposed initial latency targets: 95th-percentile key-to-paint latency below 50 ms, ordinary indexed note opening below 200 ms at the 95th percentile, and usable cold startup within 2 seconds. These are provisional goals, not observed results. Input latency alone is insufficient to establish smoothness; also measure frame pacing, dropped frames, and long stalls during interaction.
- Use a reproducible collection of 10,000 notes with a documented size distribution, plus a separate long-note workload, nested folders, tags, and links. Benchmark indexing and schema enforcement while typing; test media-heavy documents separately when implemented.
- Extend connection benchmarks to tens of thousands of long notes with documented passage counts. Measure peak memory and startup as well as search latency, background indexing contention, and usefulness of suggestions; a fast query with excessive resident memory does not meet the inexpensive-laptop goal.
- Storage planning must distinguish raw text, canonical structure/metadata, revision backups, keyword indexes, explicit-link indexes, embeddings, ANN structures, and installed models. The illustrative [50,000-note storage budget](docs/storage-budget.md) records assumptions and unmeasured allowances; it is not an approved footprint or a benchmark. Report disk and resident memory separately.
- Track total application memory including webview processes, idle CPU, and growth across repeated note switches. Set numerical resource budgets after baseline measurements; do not infer memory use from the Rust process alone.
- Verify interrupted-save recovery, explicit save failures, link identity after rename/move, and rejection of stale or out-of-scope edits alongside timing measurements.
- Prototype the smallest end-to-end path first: Markdown typing, a deterministic schema rule, local save/reopen, and a link that survives rename/move. Revisit the editor, data path, or stack if it fails the agreed targets.

## First release

The smallest useful release is a conventional note-taking experience comparable in basic purpose to Logseq or Obsidian:

- Typing Markdown that turns into formatted content, with schema-aware presentation.
- Note titles.
- Folders, tags, links between notes, and daily notes, with straightforward hierarchical organization and reliable links.
- Offline operation on Windows, with privacy and responsive performance as priorities.

Automatic deterministic schema enforcement is a requested capability; the subset to include in the first release is still to be scoped. A Logseq-like formatting preset is an intended option, not a requirement to replicate all Logseq behavior.

Reliable local saving and reopening are necessary supporting behaviors. Rich artistic formatting, canvas editing, AI, flashbacks, sync, and plugins belong to the broader roadmap and are not prerequisites for this smallest release.

## Reference projects

The user authorizes studying relevant public repositories for implementation inspiration during development. Evaluate specific features when needed, keeping Noted's privacy and performance priorities central.

The user previously used Logseq and reports performance problems, bugs, disappearing links, and difficulty organizing hierarchical notes. Treat these as user-reported pain points to address in Noted, not independently verified findings about Logseq. Existing implementations are references to critically evaluate and improve, not architectural requirements or quality benchmarks to copy unchanged.

- [Logseq](https://github.com/logseq/logseq): open-source application, currently labeled AGPL-3.0. Useful to study note organization, editing, links, and extension design. Check applicable licenses before adapting code; Noted's own license remains undecided.
- [Obsidian releases repository](https://github.com/obsidianmd/obsidian-releases): explicitly states that the core application is not open source and its source code is not included.
- [Obsidian's public developer projects](https://obsidian.md/help/developers): available references include plugin/theme documentation and open-source projects such as Importer and Web Clipper. Review each project's license before reuse.
- [JSON Canvas](https://jsoncanvas.org/): an MIT-licensed open format worth evaluating for canvas interoperability and document representation. It is a reference candidate, not a selected Noted storage format.

## Scope and unresolved questions

The sections above capture the intended product direction, with technical proposals explicitly labeled. The first release is deliberately limited to basic note-taking; performance budgets have not yet been agreed.

1. Within the approved folder hierarchy, how should deletion, moves, and overview reassignment work? What are the minimal workflows for tags, note-level connections, and daily notes? When should backlinks and the deferred connection section ship? Passage/block connections are outside current scope.
2. Which Markdown constructs and schema rules belong in the initial editor? What exact behavior defines the optional Logseq-like preset?
3. How should users move between document and canvas layouts, and how should content order and layout be preserved? Are drawing and handwriting in scope?
4. What schema syntax and editing interface should be used, and how are schemas assigned, revised, and shared? At what scope and time does automatic enforcement apply, and how does it interact with manual overrides and undo?
5. What exact AI scopes are offered, including artistic text additions, reorganization, and summarization? How do preview, acceptance, undo, and concurrent editing work?
6. What are the requirements for encryption, backups, telemetry, remote assets, AI data-sharing consent, and future sync?
7. How should flashback ranking, exclusions, scheduling, and customization work? When is local semantic or sentiment analysis worth its cost?
8. What permissions, compatibility guarantees, and isolation should the document API and future plugins provide?
9. Which inexpensive Windows reference device should be used for acceptance? What collection sizes, frame-time thresholds, memory/CPU budgets, and quality settings define acceptance?
10. Which text serialization and open-source license should Noted use?

## Development collaboration

The user permits sub-agents during development. This is a development workflow preference and does not imply that the app itself needs a multi-agent architecture.

The user authorized proceeding with implementation. The first prototype targets the core editing and persistence workflow, using Rust + Tauri and a TypeScript editor. Prototype format and editor choices remain revisable based on correctness and performance results; low-end hardware acceptance must not be claimed from development-machine tests alone.

### Initial implementation record

The first Windows prototype uses Tiptap for Markdown-assisted editing, per-note JSON files for canonical content, and a rebuildable SQLite FTS index. It supports titles, folders and nested folder creation, tags, daily notes, stable note links, and three deterministic presentation presets. Human edits use serialized, debounced document snapshots with revision and file-fingerprint checks. These are prototype implementation choices, not a finalized plugin format or AI editing API.

The prototype does not yet implement the general schema engine, folder overview notes, deletion workflows, backlinks, canvas, AI, flashbacks, or sync. Performance and correctness evidence, including remaining validation gaps, is maintained in [docs/performance.md](docs/performance.md). The architecture and current collection limits are described in [docs/architecture.md](docs/architecture.md).

### Core text editing upgrade

The user requested established note-editor text functionality before further artistic or AI work. The implemented baseline now includes paragraph/H1–H6 styles; bold, italic, underline, strikethrough, highlight, inline code, subscript/superscript and bounded text colors; alignment; quotes, code blocks and dividers; bullet, numbered and nested checkbox lists; table editing; URL and note links; clear inline formatting; undo/redo; and literal current-note find/replace. Toolbar controls track active, mixed and unavailable states rather than appearing identical regardless of selection.

Indentation is a schema policy, not one universal action. Paper and Compact allow independent paragraph/heading indentation from zero to eight steps. Lists use structural nesting in every schema. Outline disables free paragraph indentation: users create a bullet, numbered or task list and nest under a preceding sibling. Existing free offsets remain stored but are not displayed in Outline, so switching schemas does not erase information or silently reinterpret offsets as parent-child relationships. Full outliner behaviors such as folding and block movement remain separate work. Shared editable content across notes is excluded by the current-note-only editing requirement.

These features are offline and do not invoke AI. Text formatting and indentation preserve words; replacement, insertion and deletion are explicit human editing actions. This is the first implemented policy subset, not the general user-defined schema engine. The comparison with Obsidian, Logseq, Notion and Joplin and the precise remaining gaps are in [docs/editor-feature-audit.md](docs/editor-feature-audit.md).

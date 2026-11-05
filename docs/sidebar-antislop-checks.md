# Sidebar delivery checks

Result: **PASS**, November 5, 2026, for the corrected docked layout. This supersedes the earlier popup report. Anti-slop 3.2.25 applied during planning and implementation, as the user selected. This report covers the changed navigation and folder controls. The design direction and reasons are in `DESIGN.md`.

The final Windows release passed 119 recorded interaction checks and 14 theme/window profiles using a fresh synthetic workspace. Frontend: 183 passed, plus six navigation checks after the final label refinement. Native library: 101 passed, four optional model/corpus tests ignored. The private Logseq source, assets, import and imported notes were not used in this work. Existing access and credentials were not changed.

## Hard gate

| Rule | Status | Evidence |
| --- | --- | --- |
| R-02 Copy | PASS | New labels and help text use direct action names and contain no em dashes or marketing claims. |
| R-03 Reflow | PASS | Actual Windows webview profiles: 1600x960, 1200x800, 960x640, 800x560, 799x600, 699x960 and 390x840 in both themes. No horizontal overflow or document overlap. Resizing kept the selected folder visible. At 200% text the focused note remained reachable. New navigation targets measured at least 44 pixels. |
| R-17 Numbers | PASS | Note totals and connection counts come from actual fixture data and saved edges; tests and contrast values are measured results. |
| R-18 Testimonials | PASS | None added. |
| R-23 Assets and structure | PASS | The user specified the navigation structure and folder icons. Eight local glyphs identify collections; no logo, photo or generated illustration was added. |
| R-24 Navigation | PASS | All notes, folder rows and disclosure controls navigate actual collections; note rows and graph nodes open matching saved IDs. Existing library actions remain reachable. |
| R-25 Contrast | PASS | Native measured text minimum: 4.979:1 Light and 6.135:1 Dark. Input/focus checks passed 3:1. Black, white and mid-gray accent hover/focus states passed in both themes; minimum 4.689:1. |
| R-26 Controls | PASS | Native click-through below records actual actions; no placeholder controls were introduced. |
| R-27 States | PASS | Empty and filtered-empty folders tested. Delayed loading, graph failure/retry and stale folder settings were exercised in the isolated preview; unit tests reject stale graph responses. |
| R-28 FAQ | PASS | None added. |
| R-32 Keyboard | PASS | Folder Arrow/Home/End paths pass unit checks. Native focus highlights nodes; Enter opens a graph note; Escape restores Browse focus; `/` focuses search; F8 restores the prior visibility. |
| R-33 Source implementation | PASS | Features live in ordinary TypeScript/CSS modules, edited directly. Test and launch scripts do not rewrite production UI source. |
| R-34 Themes | PASS | All seven native window sizes passed in Light and Dark, with separate rendered contrast measurements. |
| R-35 Run and verify | PASS | Production frontend and Windows executable built. The final native run recorded 119 checks and no page or console errors. Opening-motion samples confirm the document is pushed, not covered. Source scripts and ignored evidence paths are listed below. |
| R-36 Claims | PASS | No security, compliance, customer or hardware-performance claims added. This report states its tested scope. |
| R-37 Direction | PASS | The user's correction specifies docking, one background, directory branches and a large persistent graph. DESIGN.md records this direction before implementation. |
| R-38 Content | PASS | Test notes are explicitly synthetic. Production text uses real saved metadata and useful empty-state instructions. |
| R-39 Semantics | PASS | Native buttons, labeled fields, named icon actions, visible focus and state feedback. Hidden navigation is inert. Graph open actions do not claim toggle semantics. Reduced motion bypasses entrance transitions. |
| R-40 Mechanisms | PASS | Graph queries/windows cap at 60 notes; layout uses a finite cached solve and no continuous animation. No remote media, third-party script or unsized media was added. No field-performance score is claimed. |

## Purpose gate

| Rule | Status | Reason and evidence |
| --- | --- | --- |
| R-01 Color | PASS | Existing neutral theme and the user's accent distinguish selection; no default gradient or rainbow treatment. |
| R-04 Icons | PASS | Folder/book/archive/work/nature/code/writing/bookmark glyphs are explicit collection choices, not AI decoration. |
| R-06 Type | PASS | System sans-serif distinguishes navigation from authored document typography. Note fonts remain untouched. |
| R-07 Background | PASS | Plain theme surfaces separate controls from writing; no decorative grid or texture. |
| R-08 Arrows | PASS | Disclosure chevrons indicate hierarchy; the retained connection handle represents an actual action. |
| R-09 Badges | PASS | No decorative badges added. Counts state real collection size. |
| R-10 Glass | PASS | No glass or backdrop filters added. |
| R-12 Shadow | PASS | No shadows, region borders or boxed navigation surfaces. Native computed-style checks verify the common background and transparent child regions. |
| R-13 Glow | PASS | No glow; an outline and caption identify the highlighted node. |
| R-14 Cards | PASS | Compact rows serve note selection. No feature-card template or filler sections. |
| R-19 Motion | PASS | A 180ms grid/entrance transition opens from the left while reserving document space. Five live motion samples passed; reduced motion removes it. |
| R-22 Illustration | PASS | No illustration added; the graph draws actual saved connections. |

## Liveliness and quality locks

| Check | Status | Evidence |
| --- | --- | --- |
| Design read and dials | PASS | ENERGY 1 / RHYTHM 2 / MOTION 2 recorded before building in `DESIGN.md`. |
| Focal point and whitespace | PASS | The selected folder branches into its compact directory; the large graph is the navigation focal point. Shared whitespace separates tasks without extra surfaces. |
| Accent and identity motif | PASS | Directory paths and note-to-graph highlighting express the requested interaction. Approximate proportions guide three areas without inventing a fourth. |
| C-1 Intentionality | PASS | Palette, typography, spacing, elevation, icons and motion have written reasons in `DESIGN.md`. |
| C-2 Completeness | PASS | Native actions below perform their stated behavior. |
| C-3 Composition | PASS | Hierarchy, note selection and saved relationships determine the layout. No template sections added. |
| C-4 Resilience | PASS | Empty/long/deep cases, stale responses, errors, both themes, narrow widths, keyboard operation, selected-folder visibility, independent scroll and 200% text reflow were checked. Writing Undo survived visibility changes. |
| C-5 Evidence | PASS | Claims refer to real tests and measured rendering, with explicitly synthetic data. |
| R-05 Layout | PASS | One docked directory and persistent graph push the document right. At 1600px navigation reserved 1248px and the document began at 1248px; closing restored full width. |
| R-11 Radius | PASS | Navigation regions have no boxes or rounded surfaces. Small control corners and circular graph nodes distinguish actions and notes. |
| R-15 Actions | PASS | Browse, New note, Customize folder, Save folder, Back to folders and Show more notes name their actions. |
| R-16 Copy | PASS | No AI marketing vocabulary added. |
| R-20 Identity | PASS | Spatial collection browsing is the brief's defining gesture; authored note presentation remains the focal writing surface. |
| R-21 Dark mode | PASS | Existing System/Light/Dark choice retained and both resolved themes tested. |
| R-29 Palette | PASS | Neutral surfaces and one user accent, with semantic errors inherited from existing controls. |
| R-30 Originality | PASS | The user-defined composition was implemented without copying another product's shell. |
| R-31 Reasons | PASS | Major visual decisions have one-line reasons in `DESIGN.md`. |
| Comment hygiene | PASS | New comments explain bounded work or restricted preference storage; no decorative banners or step narration. |

## Recorded native click-through

- Browse and Close navigation: open/close the docked navigator, push the document right and restore its width on close. Hidden controls are inert.
- All notes and disclosure buttons: show the actual workspace count and expand/collapse branches without changing the selected collection.
- Folder selection and disclosure: reveal children, preserve ancestors and reach a seven-level leaf; width follows visible depth.
- Empty folder and search: show empty or filtered-empty action guidance while keeping the graph visible.
- Show more notes: load 80 initial rows then the remaining page of a 95-note collection.
- Note hover and keyboard focus: include and highlight a note beyond the current graph window.
- Graph refresh: retain a bounded graph of actual saved connections. A keyboard-activated graph node opens its saved note.
- Customize folder: select the current folder, rename it, retain its ID/notes, move it and restore its parent, save an icon and retain it after app reload.
- Create folder and New note: create a real child and note, focus writing and keep the graph visible.
- Open note and graph Enter: open the matching note while retaining the directory/graph. Typing and Undo survive F8 visibility changes.
- Back to folders: restore hierarchy focus in the narrow stacked view.
- Escape, `/` and F8: restore Browse focus, focus search and hide/restore navigation without remounting the editor.
- Note connection handle: open the existing detailed connection controls.
- Manage folders, Trash, Review notes, Workspace details and Today's note: open or perform their existing workflows. Today's note keeps the graph visible.
- Agent access: open the existing settings while both local and hosted sharing stay disabled in the disposable fixture. No access is granted.
- Appearance: switch themes and test custom accent hover/focus states; measured targets, contrast and 200% text reflow pass.

## Reproduction and limits

Scripts: `sidebar-seed-preview.js`, `sidebar-seed-native.js`, `sidebar-smoke.js`, `sidebar-fault-smoke.js` and `sidebar-visual-qa.js`. Logs: ignored `output/sidebar-revision-tests.log`, `sidebar-revision-navigation-tests.log`, `sidebar-revision-native-tests.log`, `sidebar-revision-native-smoke.log`, `sidebar-revision-native-visual-qa.log`, `sidebar-revision-fault-smoke.log` and build logs. Screenshots: ignored `output/playwright/sidebar-*.png`.

The graph is a bounded overview of loaded notes. Icons are device preferences and are not part of a library backup. A real inexpensive reference computer was not used; these checks do not certify its performance. No private source or imported note data was inspected to produce this report.

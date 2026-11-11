# Dynamic navigation panel

## Progressive explorer, current behavior

The November 11 feedback replaces the historical tree behavior below. Browse
starts with one directory. Select a folder to reveal its immediate child folders
and notes alongside it and its saved-link graph on the right. Further choices
move the previous right directory left and remove the older level; Back moves
one level up and eventually returns to the single directory. Arrow keys,
Home/End, Enter and Escape retain keyboard access. Folder rows and note lists
scroll; Customize folder preserves stable identity while changing names/icons.
The previous directory retains its own files alongside child folders. Its file
list pages independently in groups of eighty; only one parent-directory window
is retained, and stale responses cannot replace a newly opened level.

Curved rays replace orthogonal branches. The bounded graph shows up to sixty
loaded notes, includes a hovered/focused note when available, and reports the
displayed count. It uses collision, repulsion and saved-link springs, settles
instead of running continuously, and supports node dragging without opening a
note. Clicking a node opens it. Links remain actual saved relationships, not
invented edges. The detailed existing connection editor remains available.

A temporary, inert copy of the current top graph control travels into the
explorer graph and spreads outward. The original control is restored afterward.
New navigation, closing, resizing, hidden pages, keyboard focus and reduced
motion cancel obsolete transitions. Graph timers stop on close/disposal. Reduced
motion solves the layout without animation. Successful note navigation through
the list, graph, quick-open or history closes the explorer; failed navigation
preserves it. Closing restores writing space without changing authored data.

The explorer reserves layout width and pushes the document. At small widths or
large text the two directories sit above the graph, and the document is pushed
below; no panel overlays the document. Both themes retain 44px controls.

Run the generated browser fixture and `progressive-explorer-smoke.js` through
Playwright CLI. For a matching clean Windows package, run
`scripts/Test-ProgressiveExplorer.ps1 -PlaywrightCLI C:\path\to\playwright-cli.js`.
The native runner verifies the archive, isolates fresh fixture/profile/client
directories, disables the runner, checks exact workspace identity and disabled
sharing, seeds only synthetic folders/notes/links, and closes its own app.
It never opens a native file dialog or invokes a model. Source-specific reports
are stored in ignored `output/progressive-browser.log` and
`output/progressive-native-state.json`. The older test totals below apply only
to their recorded historical layout. These checks do not certify low-end hardware.

## Previous tree layout and evidence

The November 5 correction replaces floating popups with one docked directory controlled by Browse. The project direction is in `DESIGN.md`; acceptance is in `sidebar-goal.md`.

## Behavior

- Browse opens or closes the hierarchy, note directory and collection graph together. The app grid reserves real width on the left and pushes the document right; closing restores the document's width. View offers the same single navigation preference. Existing version-1/2 layout records migrate to version 3; other panel preferences survive.
- Selecting a folder reveals its immediate children and a compact list of its direct notes. Ancestors stay visible. Disclosure buttons collapse branches; Arrow keys, Home and End navigate folder rows. At narrow desktop widths labels use two lines with full accessible text and a hover title. Wider and large-text layouts wrap names fully.
- A selected folder branches into the note directory through a connecting path and a scrollable tree of note rows. Names wrap; further pages load on request. Folder search stays within the selected collection; All notes searches the workspace. Empty, loading and failure states explain the next action.
- One background covers folders, notes and graph. Their placement, branch paths and row hover define their roles without boxes, region borders or shadows. Desktop navigation takes up to 78% of the window while leaving at least 280 CSS pixels for the document. Folder width follows depth within bounds; the notes remain compact and the graph gets the largest remaining area. The proposed 15/10/50 proportions are visual guidance, not fixed percentages.
- Saved connections remain visible on the right, including after opening or creating notes and returning to the editor. The graph uses actual saved edges, not AI suggestions. A bounded, collision-aware static layout avoids a continuous animation loop. It shows at most 60 loaded notes, reports displayed/total counts and always includes the hovered or keyboard-focused note. Graph nodes open saved notes by pointer or keyboard.
- Below 800 CSS pixels or with enlarged navigation text, folders sit above the notes/graph pair and the document is pushed below. Lists and long control columns scroll independently. Back to folders restores hierarchy focus. The native minimum remains 800 by 560; the smaller browser sizes also receive a non-overlapping layout.
- Escape closes navigation and returns focus to Browse; `/` reveals and focuses search. F8 hides/restores navigation without replacing the editor. Clicking the editor does not dismiss the graph.
- Customize folder opens the selected folder's existing rename/move dialog. It also offers eight allowlisted icons. Names and parent changes belong to the library; icons are a device preference and are labeled accordingly. A stale folder draft cannot overwrite a newer saved change. Unavailable device storage keeps an icon for the session and explains the limitation.

## Implementation boundaries

`navigation-panel.ts` contains the collection/hierarchy controller, graph window and finite layout. `navigation-panel.css` owns the new surfaces, responsive rules, target sizes and reduced-motion behavior. `folder-appearance.ts` isolates the icon preference so a future workspace-backed icon store can replace it without changing navigation. `shell-ui.ts` retains ownership of visibility, Focus mode and legacy preference migration. Existing note loading, autosave, note creation, Trash, Review, agent settings and detailed connection editing remain in their existing controllers.

This UI change does not alter backend commands, access policy, credentials, the Logseq adapter, import state or any source data. All inspection, screenshots and interaction checks use explicitly synthetic browser data or a fresh `noted-sidebar-ui-*` Windows workspace/profile. Do not substitute the private graph or imported notes for these fixtures.

## Verification

Final correction, November 5, 2026: **183 frontend tests passed**, plus six navigation checks after the final label refinement. **101 native library tests passed**, four optional model/corpus tests ignored. The release executable passed **119 recorded interaction checks across 14 window/theme profiles**, with no page/console errors. At 1600px the document began at the navigation's 1248px edge; at 800px it began at 520px, with no overlap. Closing restored full width; opening-motion samples also passed. Measured text contrast was at least **4.98:1 Light** and **6.14:1 Dark**. Six custom-accent hover/focus probes passed, minimum **4.69:1**. Targets met 44 pixels; the focused note remained reachable at 200% text without horizontal overflow. The [item-by-item report](sidebar-antislop-checks.md) records the delivery gate.

Run `npm run check`, the frontend suite with `--test-concurrency=1`, and the native library suite. The standalone sidebar tests cover hierarchy keyboard paths, bounded graph windows and hit-target spacing even with dense connections, stale edge responses, error/retry handling and device-icon fallback. Existing shell tests cover the unified state and migration while preserving editor identity.

The Playwright CLI fixtures are `sidebar-seed-preview.js` and `sidebar-seed-native.js`. `sidebar-smoke.js` exercises the actual controls across both themes and seven window sizes, including non-overlapping document movement, transparent unboxed areas, graph proportions, independent scrolling, long lists, deep hierarchy, real saved edges, rename/move/create, keyboard highlights, opening notes, Focus mode and reload persistence. `sidebar-fault-smoke.js` tests visible loading/error/retry and a conflicting folder edit in the isolated preview. `sidebar-visual-qa.js` measures rendered contrast, control sizes, focus boundaries and access to notes at 200% text. Logs and screenshots stay under ignored `output/`.

A busy companion can lock `noted-agent.exe` and prevent the ordinary desktop prebuild from replacing it. For this frontend-only change, build the frontend and then `cargo build --manifest-path src-tauri/Cargo.toml --release --features custom-protocol --bin noted`, retaining the unchanged companion. Do not stop another client or replace an executable in use. This is a Windows build constraint, not a change to client access.

The graph is an overview of a bounded loaded window, not an exhaustive graph of every note. Folder icons do not travel in library backups because they are device preferences. Physical low-end hardware acceptance remains separate and is not claimed by these developer-machine checks.

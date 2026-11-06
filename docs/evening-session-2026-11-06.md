# Evening improvement session

Cutoff: **03:00 UTC November 7, 2026 (10:00 p.m. Eastern November 6)**. Stop implementation and additional checks at the cutoff, even if a milestone is incomplete. Keep a reviewable checkpoint and report actual results.

Priorities are selected from the current app and Redley's goal of dependable writing, organization and optional AI assistance:

1. Add session Back/Forward navigation with selection and reading-position restoration, safe save-before-switch behavior, branch handling and a history list. Handle Trash/Restore without losing drafts or silently deleting history.
2. Make explicitly started AI jobs and ready proposals discoverable after closing their dialog. Preserve explicit generation, per-use guide consent, proposal review and Undo.
3. Review and implement the next useful daily-use/reliability improvements as time allows. Verify changes with synthetic fixtures and retain the accepted continuous left dock, document displacement, large persistent graph, hover highlighting and customization.

Strict privacy boundary: no AI inspection of the Logseq source database, source assets or imported private notes. Do not restart that import or change private-folder visibility. No credential creation, deployment or new external sharing. The repository's existing authorized ordinary commit/push workflow remains in effect.

Anti-slop's package files remain unavailable. Apply its previously loaded rules during design and implementation and record the manual delivery gate; do not claim a new plugin load. Model/effort switching is used only where exposed by the environment.

Status: active.

## Navigation milestone

Implemented bounded session Back/Forward with reading-position and selection restoration, a plain history list, narrow-layout View commands, Windows Alt-arrow shortcuts, save-before-switch, branches and explicit Trash/Restore availability. History contains metadata and coordinates only, stays in memory and reloads the authoritative note file.

Verification so far: 209 frontend tests passed, followed by the additional table-cell selection test (four focused view tests passed). Production frontend and Windows release built. Browser and actual Windows webview each passed 20 history interaction checks. Six preview-only fault checks covered save/load failures, retries and an externally replaced synthetic document. Both environments passed six Light/Dark dialog profiles at 1200, 800 and 390 pixels plus 200% text. Native history text contrast minimum was 4.979:1 Light and 6.135:1 Dark; target, focus and overflow checks passed. Six non-generating primary-button style probes passed, minimum 4.689:1. Screenshots are ignored local evidence under `output/playwright/workflow-history-*`.

Existing sidebar regression passed 119 checks and 14 theme/window profiles. Daily-workflow regression passed 26 native checks without generation. Its folder-context assertion now derives the saved fixture hierarchy so it can run after the sidebar's rename test. Native library regression passed 101 tests with four optional model/corpus cases ignored. No model was called, sharing was not changed, and no private source or note content was used.

## AI activity milestone

Implemented a plain status strip for explicitly started jobs and checked ready proposals. Closing the dialog retains progress; reopening returns through save-before-navigation to the original note, request and formatting/schema/component goal. A ready status opens comparison directly. Apply, Reject and cancellation clear only the matching activity; Dismiss retains a saved proposal and returns focus to writing. Missing/outdated/private requests do not fall back to another proposal. Closed-dialog polling reads only the owned local job metadata, backs off on errors and pauses after three failures. Running cancellation remains available if the request disappears. Inert closed dialogs, stable live-region text and resize-aware focus scrolling were checked.

The final frontend suite passed 229 tests; the focused activity/review/responsive-command subset passed 29. The browser-only harness passed 17 interactions, 16 Light/Dark running/ready profiles (including a 280px writing area) and 200% text with no target, focus, contrast or overflow failures. It also verified that saving manual formatting invalidates an older proposal before comparison. Measured minimum text contrast was 5.345:1 Light and 7.161:1 Dark.

The final native cached-proposal run passed 10 checks, six theme/window profiles and 200% text, including save-before-return, direct comparison, Apply/Undo and the responsive View commands. The final measurements also require a visible writing area; a wrapping note-action row found during visual review was moved into View in short layouts. Native contrast minimum matched 5.345:1 Light and 7.161:1 Dark. The final Windows release and browser harness type-check passed. Screenshots are ignored local evidence under `output/playwright/activity-*`.

### Test transport correction

Two synthetic Generate attempts in an early native test reached the actual signed-in runner because Tauri's `invoke` property is non-writable and non-configurable. The intended test override did not take effect. Cancellation was requested in that isolated app and that app was stopped. Account usage may have occurred; no successful live model completion is claimed for these attempts. Only generated synthetic fixture notes were involved. No personal or private note, source database, assets or access policy was used or changed.

The unsafe interception test was removed. Final simulated-job tests run in a separate browser-only harness with every AI/account method supplied as a local stub and no native IPC. Final native review tests use prewritten proposals and never click Generate or invoke the start command. Test reports distinguish simulated UI behavior from real native persistence and rendered validation.

## Heading navigation milestone

Add **View > Go to heading** for the open note: a searchable, paginated H1-H6 list in logical document order, keyboard access and navigation by stable block ID. Preserve the mounted editor, authored content, selection when cancelled and Undo. Handle empty outlines, long titles, missing/stale headings and large lists. This is local navigation of the open editor and does not query AI or change the accepted dock.

Implemented and verified. The final frontend suite passed 239 tests, including ten outline cases. Production frontend and Windows release built. Browser and actual native webview each passed 17 interactions, six theme/size profiles and 200% text. Minimum native text contrast was 4.979:1 Light and 6.135:1 Dark; focus, field boundaries, 44px targets and overflow passed. Screenshots were manually inspected. The native 20-check Back/Forward regression also passed.

Rendered verification found two existing scrolling issues: selection scrolling required editor focus before dispatch, and a deferred note-start reset could override an explicit cross-note block destination. Both are fixed, with tests waiting for deferred frames before checking the visible destination. Heading jumps do not write a revision and preserve Undo. See [Go to heading](go-to-heading.md).

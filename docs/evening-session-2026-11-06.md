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

## Local review days and queue reliability

Daily review currently compares UTC date strings while Today's note follows the device calendar. Align review suppression and the daily ranking tie with the device's current local date, interpreting stored timestamps as instants. Retain UTC storage, 24-hour snoozing, filters, exclusions and source note files. Cover negative/positive timezone offsets, timestamps containing another offset, midnight boundaries and invalid timestamps with synthetic clocks. Explain local-day and snooze behavior in the review UI and documentation. Do not change the system clock/timezone or any personal review state.

The existing dialog also waits for its feed before opening and retains old results while filter values change. Extract a dedicated review controller with immediate loading/error feedback, filter invalidation, latest-response guards, duplicate-action protection and predictable focus after a queue item disappears. Preserve Open, Reviewed today, 24-hour Snooze, Exclude and Reset. Refresh the visible queue when its local day changes or the app resumes into a different local day; no background AI or notification service is added. Verify with synthetic metadata and fault cases.

Implemented. Full frontend suite: 252 passed; the final queue-status selector refinement passed nine focused UI tests. Native library: 103 passed, four optional model/corpus cases ignored. Production frontend and Windows release built. Native calendar fixtures cover positive/negative offsets, equivalent instants, midnight boundaries, invalid timestamps and exact snooze expiry without editing note files. Browser clock fixtures also cover both daylight-saving transitions without changing Windows settings.

Browser and actual Windows each passed 25 interaction checks, six theme/window profiles and 200% text. Minimum review text contrast was 6.029:1 Light, 7.822:1 Dark. Visual review found a tiny nested queue at large text; short windows now use one full dialog scroll with the heading/Close retained. Final checks verify the last action is reachable in every profile. See [review notes](review-notes.md).

## Recover the previous save

The store already retains one previous complete save as a `.json.bak` file, but ordinary note recovery requires finding that file manually. Add View > Previous save for the open note, with a bounded plain-text preview and an explicit Recover as a new note action. Capture the previous snapshot before flushing the current draft; recovery saves the current draft before navigation and never replaces the original. Retain the captured snapshot if autosave later replaces the on-disk backup. A created copy must be reusable after an opening failure rather than creating duplicate copies on retry.

Use existing recovered-copy validation, immutable asset copying and fresh AI-exclusion inheritance. Add no MCP tool or AI retrieval route. Validate backup identity, size, ordinary paths and supported document shapes; malformed/missing copies remain untouched. Explain that only the immediately previous completed save is retained, not a full version history or workspace backup. Cover empty/error/loading, duplicate/retry and keyboard/accessibility states with synthetic fixtures. No real note or backup is inspected.

Implemented and verified. Frontend: 262 passed, then seven focused controller cases passed after fresh-session scroll handling. Native: 107 passed, four optional model/corpus cases ignored, including captured recovery with immutable original/backup bytes, images, invalid/oversized backup refusal, missing folders and exclusion inherited after a preview. Browser and actual Windows each passed 20 interactions, six theme/window profiles and 200% text. Minimum text contrast was 6.029:1 Light and 7.822:1 Dark. A narrow stacked-preview overlap found during manual inspection was corrected and added to rendered checks. Final screenshots were reviewed. Production and Windows builds passed. See [previous save](previous-save.md).

## Reading-order performance

A pure synthetic probe found quadratic reconciliation when a document introduces many content IDs: 10,000 shared-prefix IDs took a 1,306ms median for a new document and 333ms with mixed logical order on this PC. The unchanged-order case was much cheaper. These are algorithm-only measurements under normal development load, not whole-app timings or reference-hardware certification.

Replace repeated array searches/splices with linear reconstruction while preserving the exact existing insertion behavior, logical order, missing-ID handling and invalid-duplicate behavior for the validator. Keep fast paths for new/unchanged documents. Compare against the old function across seeded arbitrary inputs and large synthetic inputs, then run the document/editor tests and benchmark both implementations in one process, including UUID-shaped IDs. No note, import, policy, schema or storage format changes are intended.

Implemented. Twenty focused model/editor/outline/preview tests passed, including 3,000 seeded equivalence cases and exact 50,000-ID reconstruction. Type-check and production build passed. A paired Node run on this PC measured 10,000 UUID-shaped new IDs at 751.17ms before / 0.78ms after, mixed order at 192.28ms / 2.11ms, and unchanged order at 2.76ms / 2.33ms. Shared-prefix results also improved; full context and all cases are in [reading-order performance](reading-order-performance.md). These are algorithm-only measurements, not reference-device certification. The two companion executables were rebuilt successfully from current Rust source; no agent was stopped or import run.

The full frontend suite subsequently passed 265 tests. A separate native actual-clock review fixture also crossed midnight UTC without a system clock/timezone change: the reviewed synthetic note stayed hidden, an unreviewed control stayed visible, and the Eastern device day remained November 6. See `review-midnight-check.js`; no private data was involved.

## Discoverable help

Add View > Help & shortcuts as a local searchable reference for commands verified against the current app. Explain writing/navigation contexts, View recovery controls and the optional AI workflow: explicit generation through the signed-in Codex client, hosted inference, separately consented full-document guides, comparison/Apply/Reject/Undo, retained job activity and Advanced external-agent requests. Do not imply that a hosted chat is connected or that requests wake an agent automatically.

Keep it temporary and usable without an open note, account or network. Preserve the dock, mounted editor, selection, Undo and note files. Use native dialog/keyboard semantics, one Escape, named search, no-result recovery, theme contrast, 44px targets and reflow at large text. Add no new global shortcut, network call, note read or model request. Follow the same manual During UI rules while the plugin files remain unavailable.

Implemented. Full frontend suite: 271 passed. Browser and final Windows release each passed 14 Help interactions, six Light/Dark profiles and 200% text. Minimum text contrast was 6.029:1 Light and 7.822:1 Dark; focus, field boundaries, targets and overflow passed. Final native screenshots were inspected. A fresh disposable workspace passed six first-run checks, including Help before a first note and no creation through a modal shortcut. The final Windows sidebar regression passed 119 checks over 14 profiles; heading navigation passed 17 checks over six profiles. Browser and native library regressions each passed 13 checks for presets/Undo, folder rename/move, conflict copies, Trash/Restore and review exclusion/reset.

Native suite: 108 passed, four optional model/corpus cases ignored. A new fixture backs up and restores a workspace containing a previous save, verifies retained backup bytes, recovers a separate copy and verifies hard AI exclusion on both notes. The source workspace and its policy remain unchanged. Help and these regressions never request generation; the earlier synthetic runner correction remains recorded above. See [Help and shortcuts](help-and-shortcuts.md).

## Reproducible portable handoff

Make the portable builder rebuild the frontend and all three executables from a clean source commit, then check that the source stayed unchanged. Include the evening feature and verification documents. Verify the archive's own checksum and every listed payload without extraction or execution; reject missing, duplicate, unsafe or extra entries and inconsistent source metadata. Check malformed synthetic archives before generating and independently launching the final package in a disposable path containing spaces. No personal workspace or access configuration is included.

Release-verifier fixtures passed all 14 valid/corruption cases with inert text payloads. Final Windows integration also passed 20 history and 26 daily-workflow checks; no generation was requested. Package generation and independent extracted-copy verification are pending below.

## Reachable save-error recovery

A rendered browser-only write failure exposed an existing problem: a long unbroken diagnostic made a 1200px banner scroll-width 2550px, with every action off-screen. Recovery buttons measured about 26px high. Fix wrapping, bounded keyboard-accessible diagnostics, wrapping 44px actions and short-window scrolling while preserving the draft, actual retry/conflict paths and accepted dock. Check short/long failures in both themes, narrow writing areas and 200% text; never inject failures through native IPC or use personal notes.

Implemented. Browser passed 151 checks and Windows passed 149, with ten Light/Dark window/dock profiles plus 200% text each. A real synthetic revision conflict exercises Retry and Keep both; a separate display-only synthetic long diagnostic tests wrapping without native IPC overrides. Text contrast was 6.588:1 Light and 8.473:1 Dark. Recovery actions are at least 44px, have measured focus contrast and remain keyboard reachable; the narrowest tested writing area is 280px and retains 175.5px writing height. Long diagnostics scroll with the keyboard. Browser additionally verifies the actual JSON draft download and that unrelated errors do not suggest conflict recovery. Native download execution was not tested. Final screenshots were inspected; type-check, frontend production and Windows release builds passed.

The initial portable package at source `adbade1` passed integrity verification of 31 payloads and an independent byte comparison of all three executables against build outputs. Extracted into a new temporary path containing spaces, it passed six first-run Help checks and six first-note/quick-open checks. Ordinary Windows close was requested 20ms after a new unsaved edit; reopening confirmed the edit, saved status, one note and disabled local/hosted sharing. Create/Inspect/Restore/Open restored copy also completed with the active fixture unchanged. This package predates the banner correction; a final package must be rebuilt from the final source. No personal workspace, original import or access policy was used.

## Workspace recovery setup and controls

Refine the existing backup controller: protect chosen paths from delayed defaults, disable operations during initial setup, allow manual input after a defaults failure, clear inspection after a restore attempt and stop UI continuations after disposal. Make Workspace a named dialog with a sticky Close and accessible controls across its existing forms. Preserve native archive/restore semantics and do not read any personal backup or import. Verify controller races with synthetic fake APIs and the actual responsive Windows flow before packaging again.

Implemented. Eight focused backup-controller tests and the full 277-test frontend suite passed. Browser and actual Windows each passed 12 Workspace checks over six Light/Dark profiles plus 200% text. Native text contrast minimum was 6.029:1 Light and 7.822:1 Dark; active targets, focus and field borders passed. Visual review caught fixed-size explanatory text and content peeking above the sticky header; both were corrected and included in the final rendered checks. Screenshots were inspected. Production frontend and final Windows builds passed.

The actual native Create/Inspect/Restore/Open restored copy flow completed with 117 generated notes and 32 saved relationships; a before/after comparison verified the active fixture remained unchanged. Only the guarded synthetic workspace was read. No source imports, private notes, policy grants or model requests were involved.

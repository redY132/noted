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

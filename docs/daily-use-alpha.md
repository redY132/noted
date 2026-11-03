# Daily-use alpha

Implemented November 3, 2026. This extends the existing write → shape → revisit workflow without changing canonical note IDs or adding background cloud calls.

## Library and recovery

Show folder navigation with the upper-left toggle. **Manage folders** renames a folder or moves it under another folder/root; descendant cycles and stale settings are rejected. Note IDs and inline/saved links remain stable. Folder deletion and bulk operations remain separate work.

**Move note to Trash** flushes the open editor, preserves its exact saved JSON and removes it from active search. **Trash → Restore** restores the same identity without replacing an existing different file. Assets, prior save backups and all saved relationship rows remain. Trash has no automatic expiry or permanent deletion in this release. A crash-interrupted move can finish when its two copies are identical; different copies are always preserved. Index refresh failures after a committed file operation are warnings, not a false failed save.

After a save conflict, **Recover draft / keep both** shows readable previews of the current draft and the latest saved note. Keep both creates a separate recovered note and copies its note-owned assets; the original saved file keeps its identity and incoming links. Previews are shortened after 12,000 characters; recovery preserves the full supported document. Download draft remains available. There is no automatic merge or overwrite of the external version.

Portable backups include Trash, review state, assets and relationships. Agent grants and pending agent work are excluded. Restore remains into a new workspace only.

## Presets

**Note presets** provides Lecture (clear column), Project (compact two-column grid) and Journal (roomy serif column). A preset combines the existing versioned typography schema with a flow layout around the existing content. It preserves authored wording, task state, references and logical reading order.

Preview renders the actual candidate in both themes and three widths. Apply rejects a changed editor/theme/width and is one Undo step in the same editor. Existing interactive-component/motion proposal restrictions also apply to presets; a static preview cannot certify future dynamic states.

## Offline review

**Review notes** shows up to 30 saved original notes, prioritizing notes least recently reviewed with a stable daily tie-breaker. Reasons include editing age, saved connection count and tags. Filter by exact folder and tag. Opening a note does not automatically mark it reviewed.

**Reviewed today** removes it from today's queue, **Snooze one day** defers it for 24 hours, **Exclude** hides it indefinitely and **Reset review** clears those choices. Include reviewed/snoozed/excluded notes to restore a choice. Dates use UTC for the daily boundary. No summaries are generated and no notification automation is installed.

## Optional agent formatting

The UI has an explicit one-note request / reply / preview / accept / Undo flow backed by a real local MCP server. A connected agent supplies the proposal; Noted itself does not launch model inference. See [agent setup, privacy and limits](agent-integration.md). It remains disabled and uninstalled until the user chooses a client and folder access.

## Checks and remaining gates

154 frontend tests and 62 Rust core tests passed, including preset authorship/history and portable recovery with review/Trash/assets. Both browser and packaged WebView2 smoke tests exercised all three presets, folder rename/move, conflict preservation, Trash/Restore and review exclusion/reset. The native agent flow passed with a deterministic reply transported over the real MCP executable. This is not external model-generation evidence.

The real lower-end reference computer and agreed whole-app startup/memory/input budgets are still unavailable; see [reference benchmark](reference-benchmark.md). Installer packaging, license selection, provider integration and hosted-chat installation remain separate decisions. No release-performance certification is implied.

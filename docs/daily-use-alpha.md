# Daily-use alpha

Current UI: **Format with AI → Describe change → Generate proposal → visual comparison → Apply / Reject**, with visible Undo. External requests and technical JSON are under Advanced. See [current AI workflow](ai-formatting.md), which supersedes earlier control labels and the two-preview sequence below.

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

The UI has an explicit one-note request / reply / preview / accept / Undo flow backed by a real local MCP server. A connected agent supplies the proposal; Noted itself does not launch model inference. A real GPT-6.1 Sol call using existing ChatGPT sign-in passed on a synthetic note, including native preview, Apply and Undo; no personal note was used. See [agent setup, privacy and limits](agent-integration.md). The local Codex entry is registered; personal folder sharing remains disabled. Hosted-chat setup is still pending.

## Checks and remaining gates

154 frontend tests and 62 Rust core tests passed, including preset authorship/history and portable recovery with review/Trash/assets. Both browser and packaged WebView2 smoke tests exercised all three presets, folder rename/move, conflict preservation, Trash/Restore and review exclusion/reset. The native agent flow passed with a deterministic reply transported over the real MCP executable. This is not external model-generation evidence.

The real lower-end reference computer and agreed whole-app startup/memory/input budgets are still unavailable; see [reference benchmark](reference-benchmark.md). Installer packaging, license selection, provider integration and hosted-chat installation remain separate decisions. No release-performance certification is implied.

## Offline migration delivery

Workspace details now offers explicit exported-folder dry runs, warning acceptance and import into a separate workspace for Markdown, Obsidian and Logseq file graphs. Original bytes and source digests are archived with the loss report and included in portable backups. The original-source recovery controls verify checksums and export to a new folder. Cross-note heading/block links navigate by stable native block ID and survive note renames. See [import scope and limits](migration-plan.md).



### Subscription controls resumed after scope clarification

The later deferral applied to Afterglow, not Noted. The authorized Noted controls are now implemented: explicit **Send this saved note using ChatGPT**, existing official Codex ChatGPT sign-in only, fixed GPT-6.1 Sol/medium, one temporary static-note snapshot (64 KiB maximum), one running job, cancellation and a three-minute timeout. The model has only the temporary formatting-request/proposal tools; no other notes or personal sharing policy are copied. No API-key fallback, credentials or hosted-chat access is added. Proposals still require rendered preview and explicit acceptance; nothing auto-applies.

Passive polling checks local job/proposal status while its dialog is open and does not initiate model calls. Transport heartbeat is separate from sharing policy and never claims this hosted chat is verified. Hosted-chat activation still requires its separate account/tunnel/plugin setup and approval. Earlier references to deferral describe the prior checkpoint, superseded by this clarification.

Current validation: 160 frontend tests and 83 desktop/native tests pass (four optional model/corpus tests skipped). The Windows release and matching agent companion build successfully. Live native subscription evidence is retained in ignored `output/subscription-live-start.log` and `output/subscription-live-finish.log`.

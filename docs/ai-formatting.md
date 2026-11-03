# AI formatting

The default workflow is **Describe change → Generate proposal → Visual comparison → Apply or Reject**, followed by **Undo** when desired.

1. Open a note and choose **Format with AI**. Enter instructions above Generate proposal.
2. Review the on-screen consent and click **Generate proposal**. This explicitly sends one saved static note and your instructions through the official Codex client using existing ChatGPT sign-in, GPT-6.1 Sol/medium and the account's normal Codex limits. It does not send other notes or image bytes, enable sharing, or start this hosted chat. No API-key fallback or credential creation is added.
3. The app shows generation progress and opens the visual comparison automatically when the proposal passes native validation. **Current note** and **Proposed note** are read-only, keyboard-scrollable panes. There is no second Preview click in the default workflow. Wording, links, task state and logical reading order remain protected. Real rendered validation still checks both themes and multiple widths before Apply becomes available.
4. **Apply** saves the reviewed proposal and exposes an Undo button. Ctrl+Z also works in the same editor. The shortcut refuses to undo unrelated later edits; use normal editor Undo after making further edits. **Reject** removes the selected proposal request and leaves the note unchanged. Closing the comparison retains the proposal for later review.

The dialog polls only local request/job status while open; polling does not start a model call. Closing the generation dialog leaves an explicitly started job running. **Cancel generation** stops that owned job and removes its one-note request. Already processed model usage and copies read by an agent cannot be recalled. Generation has a three-minute timeout and supports one running job per app instance. Static-note and size restrictions remain in effect.

## Advanced workflows

**Advanced: external agents and saved requests** retains the manual Create request / Refresh / Remove flow. Creating an external request does not launch a model. A connected agent allowed by Agent access must pick it up; exact selected-folder permissions and the existing explicit 24-hour one-note request exception remain unchanged. A hosted connection still requires separate setup/approval. Neither access setting is enabled by this UI change.

Request history labels **waiting**, **ready**, **expired**, **outdated**, **duplicate**, and **invalid** states. Expired and outdated entries are not treated as usable proposals. Identical valid requests reuse the same note/revision fingerprint and trimmed instructions; cached valid proposals do not start a new model job. Native single-job reuse protects repeated clicks. MCP discovery suppresses legacy duplicate copies without deleting them, including pending copies already covered by a valid answered request. Expired or invalid replies do not block a fresh request.

**Advanced: permissions and JSON** in the comparison preserves manual document operations. Editing JSON or permissions invalidates the rendered preview and requires another check. Default AI proposals use formatting and arrangement permissions. Changes to the note, theme or editor width invalidate an existing preview; Retry preview checks the current conditions before Apply is enabled again.

## Verification

Frontend consent/state tests cover no model call on opening/typing, double clicks, automatic review, expired/outdated labels, Close/Apply/Reject lifecycle and scoped cancellation. Native tests cover request/job reuse, cache preference, history states and duplicate-free MCP discovery. Native Windows smoke tests use dedicated `noted-simple-ai-*` fixtures: comparison, Apply/visible Undo, Reject, reopen, stale preview and retry. A real synthetic signed-in Codex generation also passed automatic visual review and Reject without changing the note or sharing policy. No personal notes were used.

The fixture-only smoke scripts are `scripts/simple-ai-native-smoke.js`, `simple-ai-reject-smoke.js` and `simple-ai-live-smoke.js`. The live script explicitly clicks Generate and uses account allowance; it is not run by npm test. Evidence remains under ignored output/simple-ai-*.log and output/playwright/. Existing optional model/corpus tests still require their separately supplied data.

Native changes require the updated desktop executable and matching agent companion. Save and close an older development window, then open the updated build; the new frontend alone cannot update an already running native backend.

Current checks: **165 frontend tests pass; 85 native tests pass with four optional model/corpus tests ignored**. The Windows release and matching MCP companion build successfully. `node scripts/create-ai-formatting-fixture.mjs` creates a new temporary fixture and output/simple-ai-state.json without starting any model. Launch Noted with that workspace and a separate WebView profile before attaching Playwright. Use a fresh fixture for independent cached-proposal tests. Opening and typing are tested to make no model call; the live smoke uses only an explicit Generate click.

## Companion compatibility and missing-path recovery

The development instance previously ran an older `target/debug/noted-agent.exe` that rejected the current `allowHosted` policy field. The Codex client itself existed and was signed in. When no proposal file was created, the app then surfaced a misleading Windows “path specified (os error 3)” error. This was reproduced on an empty synthetic queue: the old debug companion rejected the policy while the release companion accepted it.

The debug companion has been rebuilt, and the same development executable passed a real explicitly clicked synthetic generation, automatic comparison and Reject. Development and release startup/build hooks now build the matching companion. Fresh jobs check `noted-agent --capabilities` before sending note data; stale or missing companions produce actionable messages. A client that exits successfully without a proposal now reports the missing proposal rather than a filesystem path error. Cached local proposals still need no client/companion launch.

`npm run agent:dev:build` repairs the development companion without modifying notes or sign-in. Save and reopen an older native app to load the new diagnostics. 87 native tests passed, including missing-proposal and incompatible-companion regression cases; no personal note was used in reproduction.

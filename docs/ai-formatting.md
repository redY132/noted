# AI formatting

November 6 UI update: **Before generating** names the current note and explains the next generation's contents. Schema rules and a full guidance document are shown separately; checking the per-use guide box updates the summary without creating a request. Detailed data/account explanations are under **Data and usage details**. The summary is hidden during preparation/generation so it does not describe a later unchecked checkbox as the active job's scope. Existing private-note denial, explicit generation, rendered comparison, Apply/Reject and Undo remain enforced. No connection, credential or model execution behavior changed.

The default workflow is **Describe change → Generate proposal → Visual comparison → Apply or Reject**, followed by **Undo** when desired.

1. Open a note and choose **Format with AI**. Enter instructions above Generate proposal.
2. Review the on-screen consent and click **Generate proposal**. This explicitly sends one saved static note and your instructions through the official Codex client using existing ChatGPT sign-in, GPT-6.1 Sol/medium and the account's normal Codex limits. It does not send other notes or image bytes, enable sharing, or start this hosted chat. No API-key fallback or credential creation is added.
3. The app shows generation progress and opens the visual comparison automatically when the proposal passes native validation. **Current note** and **Proposed note** are read-only, keyboard-scrollable panes. There is no second Preview click in the default workflow. Wording, links, task state and logical reading order remain protected. Real rendered validation still checks both themes and multiple widths before Apply becomes available.
4. **Apply** saves the reviewed proposal and exposes an Undo button. Ctrl+Z also works in the same editor. The shortcut refuses to undo unrelated later edits; use normal editor Undo after making further edits. **Reject** removes the selected proposal request and leaves the note unchanged. Closing the comparison retains the proposal for later review.

An explicitly started job has a status strip below the writing toolbar. It remains visible when the AI dialog is closed or another note is open. **Open generation** returns to its note and goal; **Review proposal** opens the rendered comparison directly after checking that exact saved request. Returning saves the current draft first. Missing, expired, outdated or newly private requests cannot be substituted with another proposal. **Dismiss status** hides a terminal status and returns focus to writing; it does not delete a saved proposal.

Review saves any current draft and then rechecks the exact request and AI eligibility. A proposal that became outdated during that save does not open comparison, even if only manual formatting changed. In short writing areas, the five note-action commands remain under **View > Note actions** instead of consuming the document viewport. Status condenses its description while retaining the full note title in accessible text and a tooltip.

While the dialog is closed, polling reads only the owned local job metadata. It does not fetch another note's requests, wake an agent, start a model call or apply a proposal. Local status is checked about every two seconds; failures back off and pause after three attempts. Explicitly reopening retries. A still-running job keeps cancellation available even if its saved request disappeared. Unchanged polls do not rewrite the live status text. Long titles wrap, the strip scrolls internally, and resizing keeps a focused control visible.

External-agent requests continue to be checked only while the AI dialog is open. Closing the generation dialog leaves an explicitly started job running. **Cancel generation** stops that owned job and removes its one-note request. Already processed model usage and copies read by an agent cannot be recalled. Generation has a three-minute timeout and supports one running job per app instance. Static-note and size restrictions remain in effect. The activity strip is session state; reopening a note's AI dialog can rediscover saved valid proposals after a restart.

## Advanced workflows

**Advanced: external agents and saved requests** retains the manual Create request / Refresh / Remove flow. Creating an external request does not launch a model. A connected agent allowed by Agent access must pick it up; exact selected-folder permissions and the existing explicit 24-hour one-note request exception remain unchanged. A hosted connection still requires separate setup/approval. Neither access setting is enabled by this UI change.

Request history labels **waiting**, **ready**, **expired**, **outdated**, **duplicate**, and **invalid** states. Expired and outdated entries are not treated as usable proposals. Identical valid requests reuse the same note/revision fingerprint and trimmed instructions; cached valid proposals do not start a new model job. Native single-job reuse protects repeated clicks. MCP discovery suppresses legacy duplicate copies without deleting them, including pending copies already covered by a valid answered request. Expired or invalid replies do not block a fresh request.

**Advanced: permissions and JSON** in the comparison preserves manual document operations. Editing JSON or permissions invalidates the rendered preview and requires another check. Default AI proposals use formatting and arrangement permissions. Changes to the note, theme or editor width invalidate an existing preview; Retry preview checks the current conditions before Apply is enabled again.

## Verification

The November 6 evening activity checks are recorded in [the session report](evening-session-2026-11-06.md). The browser-only fixture under `experiments/ai-activity/` supplies every AI/account method as a local simulation and refuses native execution or an existing unrelated browser store. `scripts/ai-activity-harness-smoke.js` checks job transitions and rendered review. `scripts/ai-activity-cache-smoke.js` exercises the real Windows review path with a prewritten synthetic proposal and never clicks Generate. Generate is not a safe transport-interception probe in native Tauri: its IPC invoke property is immutable. Use the dedicated browser harness for simulated jobs.

Frontend consent/state tests cover no model call on opening/typing, double clicks, automatic review, expired/outdated labels, Close/Apply/Reject lifecycle and scoped cancellation. Native tests cover request/job reuse, cache preference, history states and duplicate-free MCP discovery. Native Windows smoke tests use dedicated `noted-simple-ai-*` fixtures: comparison, Apply/visible Undo, Reject, reopen, stale preview and retry. A real synthetic signed-in Codex generation also passed automatic visual review and Reject without changing the note or sharing policy. No personal notes were used.

The fixture-only smoke scripts are `scripts/simple-ai-native-smoke.js`, `simple-ai-reject-smoke.js` and `simple-ai-live-smoke.js`. The live script explicitly clicks Generate and uses account allowance; it is not run by npm test. Evidence remains under ignored output/simple-ai-*.log and output/playwright/. Existing optional model/corpus tests still require their separately supplied data.

Native changes require the updated desktop executable and matching agent companion. Save and close an older development window, then open the updated build; the new frontend alone cannot update an already running native backend.

Current checks: **165 frontend tests pass; 85 native tests pass with four optional model/corpus tests ignored**. The Windows release and matching MCP companion build successfully. `node scripts/create-ai-formatting-fixture.mjs` creates a new temporary fixture and output/simple-ai-state.json without starting any model. Launch Noted with that workspace and a separate WebView profile before attaching Playwright. Use a fresh fixture for independent cached-proposal tests. Opening and typing are tested to make no model call; the live smoke uses only an explicit Generate click.

## Companion compatibility and missing-path recovery

The development instance previously ran an older `target/debug/noted-agent.exe` that rejected the current `allowHosted` policy field. The Codex client itself existed and was signed in. When no proposal file was created, the app then surfaced a misleading Windows “path specified (os error 3)” error. This was reproduced on an empty synthetic queue: the old debug companion rejected the policy while the release companion accepted it.

The debug companion has been rebuilt, and the same development executable passed a real explicitly clicked synthetic generation, automatic comparison and Reject. Development and release startup/build hooks now build the matching companion. Fresh jobs check `noted-agent --capabilities` before sending note data; stale or missing companions produce actionable messages. A client that exits successfully without a proposal now reports the missing proposal rather than a filesystem path error. Cached local proposals still need no client/companion launch.

`npm run agent:dev:build` repairs the development companion without modifying notes or sign-in. Save and reopen an older native app to load the new diagnostics. 87 native tests passed, including missing-proposal and incompatible-companion regression cases; no personal note was used in reproduction.


## Schema adherence and document examples

**Schemas & layout** includes Free Placement, local full-document guide capture, immutable saved versions, and **AI adherence suggestions**. The AI dialog also offers **Goal → Adhere to selected schema**, with local mismatches shown before generation. Formal rules accompany that request. A whole-document guide requires its separate per-request checkbox; it defaults off and resets after sending or closing. The native command strips any guide unless `includeGuidance` is true, then validates and bounds the whole static snapshot. This does not enable bridge sharing or transmit an example merely because it is selected.

Codex/MCP receives the approved schema in `request.schema`. Formal rules take priority over the optional untrusted example. Proposal submission, cached reply reads and review enforce the rules; the existing rendered contrast/geometry checks and Apply / Reject / Undo remain in place. See [schema authoring](schema-authoring.md) for limits and the exact workflow. Save work and restart an older desktop window to load the updated commands; the UI refuses guided generation against an older backend.


The MCP proposal tool advertises a recursive layout-node contract with explicit `style` presentation fields. Unsupported `attrs` layout fields fail validation. A model that exits successfully without submitting a proposal remains a failed job; Noted can show its bounded structured failure summary without saving raw model/tool logs. Generation can fail or require a deliberate retry. No proposal is applied automatically.


### Windows verification, 2026-11-04

- 173 frontend tests and 91 native tests passed; four optional model-pack tests remain ignored. The Windows release build succeeded.
- A disposable native workspace passed actual rendered Free Placement preview, Apply, saved one-step Undo, whole-document guide capture, immutable version persistence, and default-off guidance consent.
- The saved guide and target reopened successfully after a regression fix for JSON object-key ordering in immutable schema comparisons. Real value changes still require a new version.
- A real GPT-6.1 Sol / medium request through the existing ChatGPT-signed-in Codex client passed full-guide Generate → formal and rendered validation → Apply → Undo, then confirmed a fresh unchecked consent box and unchanged disabled fixture sharing. Only synthetic notes and a synthetic guide were transmitted.
- An earlier guided attempt returned no proposal and left its note unchanged. A diagnostic run exposed invalid invented layout fields; the proposal tool now publishes the explicit recursive `style` layout contract. The final native flow passed. Model requests remain fallible and may require a deliberate retry.

Local evidence (generated, excluded from source control): `output/schema-frontend-tests.log`, `output/schema-native-tests.log`, `output/schema-native-smoke.log`, `output/schema-live-smoke.log`, `output/schema-desktop-build.log`, and screenshots under `output/playwright/schema-*`. The synthetic diagnostic log is not included in a portable package. No personal workspace, access policy or credentials were changed.


## Interactive component goal

The explicit **Create interactive component** goal now produces an inert definition using the same ChatGPT-signed-in client. It uses a tool-free generation branch, then a separately approved isolated preview and optional disabled insertion with Undo. No generated code runs on arrival, no execution approval is saved, and the existing automated widget-layout restriction remains intact. See [component authoring](component-authoring.md) for the workflow and verified limits. External formatting requests remain presentation-only.


### Private-note exclusion

Private imports cannot be sent through either the one-note Generate flow or the external request queue, regardless of optional folder grants. The dialog explains that AI is excluded and disables generation. Captured schemas retain source-note provenance; private sources and legacy untraceable full guides are refused in private workspaces. See [AI exclusion](ai-privacy.md). Matching native protocol is now 5.

### Cancellation status

Cancel requests a stop and removes only the job's own saved request. Generation
remains disabled while local job status is still running. You can close the
dialog and keep writing; the status strip retains the pending cancellation.
Reopening still works after the saved request was removed.

A returned cancellation request is not terminal confirmation. The UI waits for
local job status before showing cancellation reported, failure, or a generation
that finished before cancellation was reported. A completion race never opens or
applies the proposal automatically. An unacknowledged stop can be retried, and a
failed saved-request removal is not described as successful.

These are local runner reports, not provider confirmation that remote processing
or account usage stopped. Already processed usage cannot be recalled. No historic
job outcome can be reconstructed from this UI change.

November 7 verification: 285 frontend tests and type-checking passed. The
browser-only harness passed 17 workflow checks over 16 theme/window profiles
plus large text; cancellation passed nine checks over 18 profiles, including
280px writing width, 390px windows and 200% text. Outcome details receive focus
and remain visible. A ready proposal on another note cannot steal an active
job's status or redirect cancellation. These are local stubbed account/model
tests; no live model or personal note was used.

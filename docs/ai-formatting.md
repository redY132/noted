# AI formatting

Noted's default flow is **Describe change > Generate proposal > Compare >
Apply or Reject**. AI is optional; ordinary editing does not start generation.

## Generate and review

1. Open a saved note and choose **Format with AI**. Describe the change and
   choose a goal: formatting, schema adherence or an interactive component.
2. Check **Before generating**, which names the note and the contents of this
   request. **Generate proposal** explicitly sends its saved static snapshot and
   your instructions through the official Codex client using existing ChatGPT
   sign-in. Full-document guidance needs its own fresh checkbox consent. Image
   bytes and unrelated notes are not included.
3. For formatting and schema proposals, the validated **Current note / Proposed
   note** comparison opens automatically. Both panes are read-only and keyboard
   scrollable. Formal checks protect wording, links, tasks and logical reading
   order; rendered checks cover contrast and geometry before Apply is enabled.
4. Choose **Apply** or **Reject**. Apply saves the reviewed change and exposes
   Undo. Ctrl+Z also works while that change is the current editor action; after
   further edits, use normal editor Undo. Reject removes this request without
   changing the note. Closing the comparison retains the proposal for later.

Generation uses GPT-6.1 Sol/medium, one bounded static-note snapshot up to 64 KiB,
one running job per app instance and a three-minute timeout. The local client
and MCP companion run on this computer; inference is hosted by OpenAI and uses
the signed-in account's available Codex model/usage limits. There is no API-key
fallback or credential creation, and this does not connect a hosted chat.

The approval belongs to the note, instructions, goal and guidance consent from
the click. Submission stops if navigation changes the note during eligibility
or saving. Closing during an unchanged note's save retains that already
approved scope; the next request still needs fresh guidance consent.

## Progress, cancellation and local recovery

Generation uses an internal local helper in the matching `noted-agent` companion.
On Windows, that helper joins an unnamed job object before starting Codex.
Closing its sole job handle terminates its normal child processes, including
descendants holding output pipes. Other app/client processes are outside that
job. This uses [Windows job-object ownership](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects);
it does not confirm that remote inference stopped. The helper also enforces the
existing three-minute local deadline. Older companions are rejected before
transmission; use the complete matching package. The synthetic-process fuse
also blocks this internal entry point before command discovery.

Verification uses only inert test executables, including cancellation, normal
and nonzero exit, streams, an unrelated surviving process and paths with spaces.
A previous full-suite run missed the five-second readiness marker; subsequent
parallel core and desktop runs passed without relaxing that assertion. Fixed
failure diagnostics remain for recurrence. Its original cause is unresolved.
No live Codex generation or remote cancellation verification was performed for
this change, and earlier historical cancellation outcomes remain unverified.

An explicitly started job keeps a status strip below the writing toolbar after
you close the dialog or visit another note. **Open generation** returns to its
note and goal; **Review proposal** checks the exact saved request before opening
comparison. Returning saves the current draft first. Missing, expired, outdated
or newly private requests cannot be replaced with an unrelated result.
**Dismiss status** hides a terminal status without deleting its saved proposal.

Closing the dialog leaves generation running. **Cancel generation** requests a
stop and attempts to remove only that job's one-note request. **Cancellation requested**
remains pending until local job metadata reports an outcome. You can keep
writing and return through **Check cancellation**. A completion race does not
automatically open or apply a result. Failed acknowledgement can be retried;
failed request deletion is not described as successful.

Local cancellation reports do not confirm that provider processing or usage
stopped. Already processed usage and copies read by an agent cannot be recalled.
Normal desktop exit requests cancellation of the owned runner; forced process
termination and OS crashes are not covered by that callback.

If a completed result could not open, **Load proposal** reads that existing
local result without another generation. Privacy, exact request identity and
saved-note freshness are checked again before comparison. Sign-in discovery
failure disables new generation while saved proposals remain available to
check. Changing the goal or saved-request selection supersedes older pending
reads, so a late response cannot replace the newer choice.

Status polling reads local metadata about explicitly started work, about every
two seconds. Failures back off and pause after three attempts; reopening retries.
Polling does not send another note, wake an agent or apply a proposal. The strip
is session state; after restart, open AI formatting to rediscover saved requests.
Cancellation status stays accessible even when account discovery, request
listing or the request itself is unavailable.

## Schemas and interactive components

**Schemas & layout** supports saved Free Placement schemas and full-document
guidance capture. The **Adhere to selected schema** goal shows local mismatches
and includes formal rules. A guide defaults off, needs per-request consent and
is stripped from the request unless approved. Formal rules take priority over
the optional untrusted example. Capturing or selecting a guide does not send it.
See [schema authoring](schema-authoring.md) for authoring and validation limits.

**Create interactive component** uses the explicit generation flow to return an
inert definition. Review its code and separately approve a bounded QuickJS
preview. Insertion starts disabled; running it requires approval for that exact
code version. No generated code runs merely because it arrived. External
formatting requests remain presentation-only. See [component authoring](component-authoring.md).

Private imported notes are excluded from all AI routes, regardless of optional
folder grants. Guidance also checks source-note provenance; private sources and
untraceable legacy full guides in private workspaces cannot be sent. See
[AI privacy](ai-privacy.md). Local editing and backup do not grant model access.

## Advanced workflows

**Advanced: external agents and saved requests** contains Create request,
Refresh, Remove, saved-request selection and sign-in refresh. Create request
saves a revision-bound request without launching a model or waking an agent.
An allowed connected agent may read that one note for up to 24 hours, including
outside selected folders. Exact folder grants, private-note denial and separate
hosted connection approval still apply. Closing the dialog stops external-inbox
polling. See [agent integration](agent-integration.md).

History labels waiting, ready, expired, outdated, duplicate and invalid entries.
Identical valid requests reuse their note/revision fingerprint and trimmed
instructions. A valid cached proposal does not start another job. Missing
selected IDs clear review and explain recovery; other saved requests remain
available for deliberate selection.

**Advanced: permissions and JSON** in comparison retains manual operations.
Changing JSON or permissions invalidates the rendered preview. Note, theme or
editor-width changes also require another check before Apply. MCP layout nodes
use explicit `style` fields; unsupported invented `attrs` fields fail validation.
A successful client exit without a valid submitted proposal is still a failure.

## Desktop setup and verification

Use the matching updated app and `noted-agent.exe` companion. Save and close an
older native window before opening the updated build; a new frontend cannot
replace its running backend. Generate checks companion capabilities before
sending note data. In development, `npm run agent:dev:build` rebuilds the matching
companion without modifying notes or sign-in. Packaged builds keep it beside
`noted.exe`. Model requests remain fallible and may need a deliberate retry.

The latest implementation checkpoint passed 310 frontend tests and 113 native
tests, with four optional model/corpus tests ignored. Browser workflow tests
under `experiments/ai-activity/` explicitly stub every account/model method and
refuse native execution or an unrelated existing browser store. Native process
ownership tests launch a bounded inert test executable, never Codex. Rendered
scope is recorded in [UI checks](evening-ui-checks.md).

Earlier explicitly authorized live tests used only synthetic notes and existing
official ChatGPT sign-in; their evidence is separate in
[milestone verification](milestone-verification.md). Current UI and native
checks do not run a model or prove provider-side cancellation.

For automated native tests, use a fresh generated workspace/profile and the
process-local no-model fuse. Do not probe native generation by trying to replace
Tauri's immutable IPC invoke property. Fixture scripts marked `live` explicitly
click Generate and may use account allowance; they are not part of `npm test`.
See [portable verification](portable-release.md) and
[the resource safety controls](reference-benchmark.md).

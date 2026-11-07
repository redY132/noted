# Evening UI delivery checks

Navigation checkpoint: **PASS**, November 6, 2026. The anti-slop package could not be inspected because its cached directory is missing. The user's selected During mode and previously loaded rules were applied manually; this is not a claim that the plugin loaded again. Direction was recorded before implementation in `DESIGN.md`.

## Hard gate

| Rule | Result | Evidence |
| --- | --- | --- |
| R-02 Copy | PASS | Back, Forward, Note history and Clear previous visits describe their actions. |
| R-03 Reflow | PASS | Native history navigation at 1600, 1200, 800 and 390 pixels; dialog profiles in both themes at 1200, 800 and 390; 200% text. No horizontal overflow. |
| R-17 Numbers | PASS | Bounded 100-visit model; test and contrast values come from actual checks. |
| R-18 Testimonials | PASS | None added. |
| R-23 Assets and structure | PASS | Two local SVG directional chevrons represent actual navigation actions. No decorative assets added. |
| R-24 Navigation | PASS | Toolbar, View, keyboard and history rows navigate saved note IDs. Branches and Trash/Restore were exercised. |
| R-25 Contrast | PASS | Native history text minimum 4.979:1 Light and 6.135:1 Dark; focus and targets pass the shared rendered checks. |
| R-26 Controls | PASS | All new commands have implemented behavior. Clear keeps the active note and changes only in-memory visits. |
| R-27 States | PASS | No history, current visit, unavailable visit, pending open, failed save/load, retry and externally changed revision covered by synthetic tests. |
| R-28 FAQ | PASS | None added. |
| R-32 Keyboard | PASS | Alt Left/Right, View access, history rows, modal guarding, Escape and focus restoration checked. macOS word-navigation gestures are left available. |
| R-33 Source implementation | PASS | Production TypeScript/CSS edited directly. Test scripts do not rewrite app source. |
| R-34 Themes | PASS | Light and Dark rendered checks passed with the app's existing accent behavior. |
| R-35 Run and verify | PASS | Frontend and Windows release built; native history, sidebar and dialog checks passed without uncaught errors. |
| R-36 Claims | PASS | No new hardware, hosting, certification or model-quality claims. The tests use disposable synthetic notes. |
| R-37 Direction | PASS | Session reading aid and narrow-toolbar behavior specified in DESIGN before implementation. |
| R-38 Content | PASS | History displays actual session metadata, with titles inserted as text. No filler content in production. |
| R-39 Semantics | PASS | Named buttons, current-visit marker, native dialog, status feedback and inert closed dialog. |
| R-40 Mechanisms | PASS | Up to 100 in-memory visits and a resize observer; no continuous animation, network service or media added. |

## Purpose gate and quality locks

| Rule/check | Result | Reason |
| --- | --- | --- |
| R-01 Color / R-29 Palette | PASS | Existing neutral surfaces and the user's accent distinguish the current visit. |
| R-04 Icons / R-08 Arrows | PASS | Familiar left/right chevrons are functional Back/Forward controls. |
| R-06 Type | PASS | System UI type distinguishes navigation from authored note typography. |
| R-07 Background / R-10 Glass / R-13 Glow | PASS | Plain theme surface; no texture, filter or glow. |
| R-09 Badges / R-18 Testimonials | PASS | No decorative badges, claims or social proof. |
| R-12 Shadow / R-11 Radius | PASS | Existing native-dialog treatment; no additional navigation boxes or shadows. |
| R-14 Cards | PASS | Compact visit rows serve navigation, with no feature-card layout. |
| R-19 Motion | PASS | No new motion; reduced-motion checks passed with the retained shell. |
| R-22 Illustration | PASS | No illustration. |
| R-05 Layout / C-3 Composition | PASS | Accepted dock and large graph preserved; history controls hide before crowding narrow writing areas. |
| R-15 Actions / R-16 Copy | PASS | Direct action labels with explanatory failure/recovery messages. |
| R-20 Identity / R-30 Originality | PASS | Spatial folder browsing remains the user's chosen composition; history supports writing. |
| R-21 Dark mode | PASS | Both resolved themes tested. |
| R-31 Reasons / C-1 Intentionality | PASS | Toolbar placement, bounded session state and plain list have recorded reasons. |
| C-2 Completeness | PASS | Rendered click-through and fault injection exercise real commands. |
| C-4 Resilience | PASS | Save/load failure, revision change, repeated clicks, unavailable destinations, resizing and large text covered. |
| C-5 Evidence | PASS | Tests distinguish real native rendering from preview-only fault injection. |
| Design dials | PASS | ENERGY 1 / RHYTHM 2 / MOTION 2 retained. |
| Focal point / whitespace | PASS | Document and persistent graph retain their roles; history is temporary and scrolls internally. |
| Comment hygiene | PASS | Comments explain session scope, stale revision safety and native shortcut behavior. |

Evidence scripts: `note-history-smoke.js`, `note-history-faults.js`, `daily-workflow-visual.js`, `sidebar-smoke.js`; unit coverage in the three navigation/view/history test modules. Generated screenshots remain ignored under `output/playwright/`.

## AI activity and responsive note commands

Result: **PASS** for the changed activity/review/command UI. The same manual During rules apply; the anti-slop package remains unavailable. No new assets, type families, decorative surfaces, effects or navigation-panel sections were added. All hard/purpose rules above remain applicable, with the changed checks below.

| Rules/checks | Result | Evidence |
| --- | --- | --- |
| R-02, R-15, R-16, R-38 Copy/actions | PASS | Explicit state, originating note, Open generation / Review proposal, Dismiss status and View > Note actions. Real saved metadata is inserted as text. |
| R-03, R-05, C-3 Reflow/composition | PASS | Actual native profiles at 1200x800, 800x560 and 390x840 in both themes plus 200% text; visible writing area checked. Short layouts move the wrapping action row into View without changing dock proportions. Browser harness additionally exercises a 280px writing area. |
| R-17, R-36, C-5 Claims/evidence | PASS | 229 frontend tests; 10 final native cached-proposal checks; 17 browser-harness interactions; six native and 16 harness profiles. Simulated jobs, prewritten native proposals and the earlier real-runner test correction are distinguished in the session report. |
| R-24, R-26, R-27, C-2, C-4 Behavior/states | PASS | Return to originating note/goal/request, save first, direct review, Close retention, Apply/Undo, Reject, cancellation, missing/outdated/private requests, failed status/backoff and fresh post-save eligibility. |
| R-25, R-34, R-21 Contrast/themes | PASS | Native and harness minimum 5.345:1 Light, 7.161:1 Dark. Focus checks pass 3:1; active targets pass 44px. |
| R-32, R-39 Keyboard/semantics | PASS | Named status region, native inert closed dialog, View command focus restoration, Dismiss returns to writing, resize reveals focused controls. Identical polls leave live status text unchanged. |
| R-33, R-35 Implementation/verification | PASS | Ordinary directly edited TypeScript/CSS, production and Windows builds, browser-harness type-check and actual native rendered comparison. |
| R-40, R-19 Mechanisms/motion | PASS | Only owned local job metadata polls while closed; errors back off and pause after three attempts. No agent wake-up, extra generation, automatic Apply or new motion. |
| R-37, R-31, C-1 Direction | PASS | Status density and responsive commands were specified before implementation in DESIGN. |

Test scripts: `ai-activity-harness-smoke.js` and `ai-activity-cache-smoke.js`. The browser fixture has no native IPC or real AI/account methods. Native cached checks never click Generate. No private notes or original Logseq data are test inputs.

## Heading navigation

Result: **PASS** under the same manual During rules; no new plugin load is claimed. The native dialog reuses existing theme, typography, focus and target sizing, without adding a sidebar, decorative assets, motion or nested surfaces. Plain rows identify actual headings and levels.

| Rules/checks | Result | Evidence |
| --- | --- | --- |
| R-03, R-05, C-3 Reflow | PASS | Native and browser Light/Dark at 1200x800, 800x560 and 390x840 plus 200% text; bounded dialog and internally scrolling results. Screenshots manually reviewed. |
| R-24, R-26, R-27, C-2, C-4 States | PASS | 130 headings, logical order, long-title search, paging/focus, filtered-empty and no-heading guidance, changed/removed/duplicate heading guards and modal exclusion. |
| R-25, R-34 Contrast | PASS | Native text minimum 4.979:1 Light, 6.135:1 Dark. Focus and field boundaries pass 3:1; active targets pass 44px. |
| R-32, R-39 Keyboard/semantics | PASS | Named native dialog and results region, labelled search, H1-H6 context, current-location marker, arrows/Home/End/Enter, one Escape and inert close. |
| R-33, R-35, R-36, C-5 Verification | PASS | Direct source edits, 239 frontend tests, production and Windows builds, 17 native and 17 browser checks. Saved revision unchanged by navigation; Undo and selection/scroll cancellation checked. Native history regression passes 20 checks. |
| R-37, C-1 Direction | PASS | Long-note navigation specified in DESIGN before implementation. Accepted continuous dock and persistent graph preserved. |
| R-40 Mechanisms | PASS | Current editor snapshot only while open; no polling, generation, account access or additional note retrieval. |

Evidence: `document-outline-smoke.js`, outline model/UI tests and ignored `output/playwright/outline-*` screenshots. Existing block-link behavior now correctly reveals the selected block after deferred navigation frames.

## Offline review queue

Result: **PASS** under the same manual During rules. Plain note rows replace the older boxed review cards. Existing actions, neutral theme and typography remain; no new assets, effects, animation or dock sections.

| Rules/checks | Result | Evidence |
| --- | --- | --- |
| R-03, R-05, C-3 Reflow | PASS | Native/browser at 1200x800, 800x560, 390x840 in both themes, plus 200% text. Short windows use one dialog scroll; every profile reaches the last action. Screenshots manually inspected. |
| R-24, R-26, R-27, C-2, C-4 States | PASS | Loading, filter changes, late responses, read failure/Refresh, duplicate actions, write failure, successful write with failed refresh, hidden/reset/empty states and safe Open refusal tested. |
| R-25, R-34 Contrast | PASS | Minimum 6.029:1 Light and 7.822:1 Dark. Active targets/checkbox label meet 44px; focus and field boundaries pass 3:1. |
| R-32, R-39 Keyboard/semantics | PASS | Named native dialog/results region, implicit field labels, live status, inert closed dialog, first Escape and next-item focus. Saving/opening blocks duplicate navigation and cancellation until the draft is safe. |
| R-33, R-35, R-36, C-5 Verification | PASS | Direct UI source edits, 252 frontend tests, 103 native tests with four optional cases ignored, production/Windows builds, 25 browser and 25 native rendered checks. |
| R-37, C-1 Direction | PASS | Local-day semantics and queue states specified in DESIGN before implementation. Short-window correction follows actual large-text inspection. |
| R-40 Mechanisms | PASS | Local metadata only, tag debounce and obsolete-response guard. Only an open dialog checks for changed local days; no AI, background notifications or new sharing. |

Evidence: `review-smoke.js`, review UI/calendar tests, native library fixtures and ignored `output/playwright/review-*` screenshots. Timestamp tests use isolated clocks and child-process timezones, never the system settings or personal data.

## Previous-save recovery

Result: **PASS** under the same manual During rules. Plain comparison columns identify the current draft and previous completed save. Text-relative columns collapse under narrow/large-text conditions; no new cards, assets, effects, animation or dock sections.

| Rules/checks | Result | Evidence |
| --- | --- | --- |
| R-03, R-05, C-3 Reflow | PASS | Native/browser at 1200x800, 800x560, 390x840 in both themes plus 200% text. Comparison reserves full height; text-relative columns stack and short windows use full dialog scrolling. Explicit overlap and action-reachability checks pass. |
| R-24, R-26, R-27, C-2, C-4 States | PASS | Loading, empty/read failure/Refresh, failed draft save, captured-copy retention after later saves, duplicate protection, saved-copy opening retry, removed source identity and late completion after disposal. |
| R-25, R-34 Contrast | PASS | Minimum 6.029:1 Light, 7.822:1 Dark. Active targets pass 44px; focused controls pass the shared 3:1 check. |
| R-32, R-39 Keyboard/semantics | PASS | Named native dialog, labelled comparison headings, live status, inert close, first Escape, selection preservation and focus returned to writing after recovery. |
| R-33, R-35, R-36, C-5 Verification | PASS | Direct source edits, 262 frontend tests, 107 native tests/four optional ignored, 20 browser and 20 native interactions, frontend/Windows builds and inspected screenshots. |
| R-37, C-1 Direction | PASS | Recovery, snapshot-before-save, copy reuse and short-window behavior recorded in DESIGN before implementation. |
| R-40 Mechanisms | PASS | Explicit local read/copy only. No model, image resolution, component execution, background scan, new MCP tool or sharing grant. Fresh exclusion inheritance is tested on synthetic private data. |

Evidence: `previous-save-smoke.js`, preview/controller/native tests and ignored `output/playwright/previous-*` screenshots. Only one previous completed save is claimed; no full-history or hardware-certification claim is made.

## Help and first-run reference

Result: **PASS** under the same manual During rules; the package remains unavailable. Plain grouped reference rows reuse existing typography and themes. No assets, effects, motion or dock sections were added.

| Rules/checks | Result | Evidence |
| --- | --- | --- |
| R-03, R-05, C-3 Reflow | PASS | Native/browser Light and Dark at 1200x800, 800x560 and 390x840, plus 200% text. Short windows scroll the whole dialog, retaining Close. Screenshots inspected. |
| R-24, R-26, R-27, C-2, C-4 States | PASS | Search, exact key chords, Clear, no results, repeated opening, no-note first run, inert close and another-modal exclusion. |
| R-25, R-34 Contrast | PASS | Text minimum 6.029:1 Light, 7.822:1 Dark. Focus/fields pass 3:1; active targets pass 44px. |
| R-32, R-39 Keyboard | PASS | Named native dialog/search/results, keyboard scrolling, first Escape, focus restoration and global shortcut exclusion. Selection, Undo and saved revision preserved. |
| R-33, R-35, R-36, C-5 Verification | PASS | Direct source edits, 271 frontend tests, final Windows release, 14 native and 14 browser Help interactions, six native first-run checks. |
| R-02, R-15, R-17 Claims | PASS | Verified command routes and context, local client versus hosted inference, subscription limits, per-request consent, explicit Apply and separately configured hosted access. |
| R-37, R-40, C-1 Scope | PASS | Specified before implementation in DESIGN. Static reference only; no note/account read, network, generation, polling or access grant. |

Final integration: native sidebar 119 checks/14 profiles, heading navigation 17 checks/six profiles, and browser/native library workflows 13 checks each. Native suite passed 108 tests with four optional cases ignored; backup/restore retained previous-save bytes and hard exclusion in a synthetic recovered copy.

## Save-error recovery controls

Result: **PASS** under the same manual During rules. The existing inline alert and action labels remain. No new assets, effects, motion, modal or dock sections. A real rendered failure, rather than a speculative redesign, justified this correction.

| Rules/checks | Result | Evidence |
| --- | --- | --- |
| R-03, R-05, C-3 Reflow | PASS | Native/browser ten Light/Dark window/dock profiles plus 200% text. Long diagnostics wrap and keyboard-scroll; wrapping actions stay within the available writing area, including 280px. Writing remains reachable. |
| R-24, R-26, R-27, C-2, C-4 States | PASS | Actual synthetic revision conflict retains the mounted draft. Retry preserves the newer saved note; Keep both creates a separate draft copy. Successful recovery clears the alert. Browser download preserves draft identity and title. Ordinary errors hide conflict recovery. |
| R-25, R-34 Contrast/targets | PASS | Text 6.588:1 Light, 8.473:1 Dark. Focus contrast at least 3:1, active controls at least 44px. |
| R-32, R-39 Keyboard | PASS | Named scrollable diagnostics, PageDown, sequential Tab access to every action, visible focus and automatic scroll to focused recovery controls. No automatic focus theft. |
| R-33, R-35, R-36, C-5 Verification | PASS | Direct CSS/markup edits, browser 151/native 149 checks, frontend and Windows builds, manually inspected screenshots. Native download execution is not claimed. |
| R-37, R-40, C-1 Scope | PASS | Measured defect and intended correction recorded in DESIGN before implementation. No new polling, note retrieval route, generation or permissions. |

## Workspace backup and recovery controls

Result: **PASS** under the same manual During rules. The existing form and separate-workspace restore remain. The named dialog has a plain sticky heading/Close; controls and explanatory text follow relative sizing, without new assets, effects, animation or dock changes.

| Rules/checks | Result | Evidence |
| --- | --- | --- |
| R-03, R-05, C-3 Reflow | PASS | Native/browser six Light/Dark profiles plus 200% text. Sticky Close covers scrolling content; bottom actions remain reachable and all explanations scale. Screenshots inspected. |
| R-24, R-26, R-27, C-2, C-4 States | PASS | Delayed defaults, manual-path fallback, duplicate actions, failed draft save, consumed restore inspection, native operation completion after disposal and prevention of new operations after disposal. |
| R-25, R-34 Contrast/targets | PASS | Native minimum text 6.029:1 Light, 7.822:1 Dark. Active controls at least 44px; focus/field borders at least 3:1. |
| R-32, R-39 Keyboard | PASS | Named native Workspace dialog, one Close, first Escape, keyboard-accessible bottom actions and preserved note/dock state. |
| R-33, R-35, R-36, C-5 Verification | PASS | Eight controller tests, full 277 frontend tests, production/Windows builds, 12 browser and 12 native layout checks; actual native backup/restore preserved all 117 fixture notes and 32 connections. |
| R-37, R-40, C-1 Scope | PASS | Recorded before implementation. No archive-format, import, permissions, model or original-workspace changes. A completed native copy is not claimed cancelled by UI disposal. |

Final narrow-layout follow-up: native save-error recovery passed 175 checks over 12 Light/Dark window/dock profiles plus 200% text, including the 390px stacked dock. Workspace passed 13 native and 13 browser checks, with an additional 390px/200% text case and keyboard access to bottom actions. Those final screenshots were inspected. No import, generation or personal note access occurred.

## November 7 continuation

The earlier During rules were applied manually; anti-slop tools were unavailable
in this session. Existing neutral surfaces, typography and dock composition
remain. No new assets or animation were added.

- AI cancellation acknowledgement remains pending until owned local job status
  resolves. The browser-only controller regression passed nine checks and 18
  activity-strip layout profiles. Separate dialog checks passed ten Light/Dark,
  narrow/short-window and 200% text profiles: outcome details receive focus,
  scroll independently when needed, and keep Close visible. Screenshot review
  included the 390px/200% text case. Tests stub all account and AI APIs; no
  model, native IPC or note transmission occurs.
- A generated CSS-only fixture reproduced Open note changing from a column to
  a row during its existing closing fade. Column direction and gap now persist
  for Open note, headings, history, help, review and previous-save dialogs.
  The rendered regression passed 96 profiles across those six dialogs, both
  themes, desktop/short/narrow windows, 200% text and reduced motion. It checks
  closing-frame geometry, eventual hiding and native focus return; it does not
  claim application-controller coverage. Short-window block layouts remain.
  Separate slowed diagnostic captures support visual inspection.
- The activity happy-path fixture passed its existing 17 checks/16 layout
  profiles. Controller changes passed all 285 frontend tests and type checking
  before the CSS follow-ups; the latter are covered by rendered checks.

No private Logseq source, imported notes or source assets were opened or changed.
No persistent connection, permission or actual model cancellation is inferred
from these UI simulations. The historical two live attempts still have an
unverified terminal outcome.

Cancellation recovery follow-up: three targeted tests reproduced auxiliary
request/account failures hiding local outcomes or preventing polling restart.
The corrected flow passed 37 focused controller/activity tests and ten rendered
cancellation checks over the same 18 strip and ten dialog profiles, with both
auxiliary APIs deliberately unavailable after generation starts. Confirmed
removal updates only its cached request; failed removal and unrelated requests
remain recoverable under Advanced. No additional generation was requested.

Approval-identity follow-up: delayed eligibility and save tests reproduced a
request following navigation to a different note, and guidance consent being
borrowed from later dialog state. The fix captures the approved identity,
instructions, goal and guidance context before asynchronous work and refuses
note changes before submission. All 39 focused controller/activity tests pass,
including both request routes and fresh per-use guide consent. A browser-only
held-eligibility check passed four checks: neither route creates a job or
external request after note drift, and reopening permits a new explicit
approval. Native privacy and revision checks remain in force.

Final integration for the approval-identity change: all 291 frontend tests and
type checking passed. The fresh-profile browser workflow passed 17 checks/16
layout profiles plus large text, including comparison, Reject, Apply, saved
Undo, background activity and stale-proposal rejection. Undo now compares the
original rendered formatting rather than assuming a reused fixture began with
no bold marks. All account/model methods remain explicit local stubs.

External-request follow-up: three targeted tests reproduced delayed creation
reading another note and automatic substitution of an older proposal for a
missing request. The corrected flow passed all 294 frontend tests, 42 focused
controller/activity tests, type checking and eight rendered request checks.
Creation, polling and explicit refresh retain the exact request ID; closed or
superseded dialogs ignore late UI continuations. Missing IDs clear preview and
explain recovery, preserving other saved requests. The browser queue is entirely
simulated: no native request, live agent access or model call was created.

Local proposal recovery: all 302 frontend tests and 50 focused controller/activity
tests passed, with type checking. Seven rendered recovery checks passed three
Light/Dark desktop/short/narrow layouts, including 390px with 200% text and
keyboard-visible focus. The explicit Load action reads the existing local result
and passed comparison, Apply and saved Undo while sign-in discovery failed,
without another simulated generation. Privacy denial and stale saves block
review; owned failed-job details reopen without a saved-request lookup. The
narrow screenshot was inspected. All account/model calls remain explicit stubs.

The final rendered regression also passed 17 normal workflow checks/16 profiles
plus large text, eight external-request checks, four approval-scope checks and
ten cancellation checks/18 strip plus ten dialog profiles. No new surface,
palette, animation, sidebar section or access grant was added.

Context-ordering follow-up: a standalone simulated API reproduced delayed
completed-result reads replacing a newer goal and saved-request selection.
Explicit changes now invalidate those responses and turn off automatic review
for the superseded context. All 303 frontend tests, 51 focused controller tests,
type checking and four rendered ordering checks passed. The selected request
continues receiving local replies without another generation. No markup,
palette, animation or permission change was needed.

Sidebar highlight follow-up: a generated DOM test reproduced graph hover
remaining highlighted after the pointer and keyboard focus left its nodes.
Exit handlers now restore the open-note highlight while preserving a note that
still has keyboard focus. All 304 frontend tests, type checking and 121 rendered
sidebar checks across 14 viewport/theme profiles passed. The existing visual
fixture also passed its Light/Dark contrast and hit-target checks, 200% text
access and six custom-accent hover/focus combinations. Layout, folder sharing
and stored documents are unchanged.

Help now explains Load proposal as a local retry and distinguishes pending
cancellation from a reported outcome. Its generated-note browser fixture passed
16 workflow checks and six layout/theme/text-size profiles. Help does not invoke
account discovery, generation or access settings.

An unchanged connection refresh also recreated graph controls and emitted four
focus events for one focused note. Cached node/edge markup now avoids those
DOM replacements while still updating real title, position and connection
changes. The regression retains one focus event; all 304 frontend tests and
122 rendered sidebar checks across the same 14 profiles passed. The browser
check observed no added node controls or repeated focus during an unchanged
refresh. This is a DOM/focus observation, not a measured latency improvement.

Layout-only graph updates also rewrote the unchanged live summary. The focused
test reproduced that mutation; the text helper now changes summary/caption
nodes only when their content differs. The generated browser check observed
zero repeated summary writes during an unchanged layout update. All 304
frontend tests, type checking and 123 rendered sidebar checks across 14 profiles
passed, including actual edge updates, failure recovery, hover/focus, nested
folders, scrolling, resizing and the accepted docked layout.

The verified `e301879` Windows package also passed the prewritten cached-proposal
flow against the real native backend: ten checks, six Light/Dark layouts and
200% text. It preserved status after Close, opened comparison directly, saved
another generated draft before returning, applied and undid formatting, and
kept sharing disabled. The native test now requires its exact generated workspace
and note plus disabled-runner/sharing guards before AI controls are used. Only
the verified GUI was copied; no companion or model client was launched. The
owned fixture app closed afterward. This is local cache evidence, not a live
generation test. `output/packaged-cached-proposal-state.json` records the source
and local log; generated native screenshots remain under `output/playwright/`.

Long-title follow-up: narrow native screenshots exposed the document heading's
single-line clipping. The title now wraps in an auto-sizing textarea while
retaining the same 300-character metadata value. Enter continues into the body;
an accessible hint and local help explain it. Pasted line breaks become spaces,
composition is preserved until commit, and loading metadata does not create an
edit or reset an unchanged selection. Older WebViews use one bounded sizing
observer instead of relying on CSS field sizing.

All 309 frontend tests and type checking passed. The title fixture passed 15
checks across eight Light/Dark/window/text-size profiles with native CSS sizing,
and again with forced fallback sizing. It checks save/reopen, wrapping, shrinking,
Control Enter, body visibility after Enter and pasted line breaks. Fallback
sizing also passed all 123 sidebar checks across 14 profiles; Help passed 16
checks/six profiles with selection and Undo intact. Both narrow title screenshots
were manually inspected. No document-format, access or model-call change is
needed for this field update.

The `8069991` package passed the native cached-proposal flow with ten checks,
six layouts and 200% text after the title change, with the runner disabled and
the owned app closed. That fixture still used a short title; it is not evidence
of a native long-title profile. Browser long-title evidence above is separate.

Composition follow-up: a rendered test reproduced Ctrl N navigating away while
the event was marked composing. A focused shell test reproduced Focus toggling,
and three UI tests reproduced composing Escape dismissing Help, heading search
and Browse. Shortcuts now respect composition and exact modifiers. Recognized
held-key repeats are consumed without repeating the action or falling through
to browser shortcuts. All 310 frontend tests and type checking passed, plus 17
shortcut checks, 17 Help checks/six profiles, 18 heading checks/six profiles and
124 sidebar checks/14 profiles. Normal Ctrl N saved the previous generated draft;
normal Enter/Escape, selection and Undo remain intact. These are synthetic event
tests, not certification of physical IMEs or layouts.

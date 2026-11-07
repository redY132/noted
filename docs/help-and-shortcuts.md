# Help and shortcuts

Choose **View > Help & shortcuts** to search the local command and workflow reference. Search titles, command routes, keys or words such as `schema`, `previous save` and `subscription`. Exact key chords take priority; `Ctrl+P` and `Ctrl P` find the same command. Clear search restores every entry.

The reference covers navigation, writing, recovery, appearance and optional AI proposals. Key labels follow the platform. Windows uses Alt Left/Right for note history; Mac users are directed to View so word-navigation keys are not overridden. Slash opens library search only outside editable text. Escape then Tab leaves editor indentation behavior for app controls.

Titles wrap within the writing area and retain the existing 300-character
metadata field. Enter moves into the body; composing input is not interrupted.
Pasted line breaks become spaces. The local help also explains Load proposal
and pending cancellation, without starting generation or account discovery.

Global New note, Open note, Save and Focus shortcuts use their documented
modifiers. Browser-reported composing events are left to the input method, and
held-key repeats do not repeat those commands. Composing Escape does not dismiss
Browse search, Help or heading search; ordinary Escape keeps its existing
close-and-return behavior.

Help is static and local. It works before the first note exists and needs no account, workspace scan or network. Opening, searching and closing it do not edit notes, change selection, clear Undo, generate proposals or grant access. Its search field, Clear search, Close and scrollable results are keyboard accessible. Escape closes it once and returns focus to View.

The AI entries explain the actual boundaries: Generate uses the locally installed Codex client and the existing ChatGPT sign-in; inference is hosted by OpenAI and subject to the account's Codex limits. Full guidance documents require fresh per-request consent. Proposals require comparison and Apply; Undo remains available. New component proposals start disabled and need Enable for their exact version. An Advanced external-agent request exposes its one saved note for a limited time to an allowed connected client; it does not wake an agent. A hosted chat needs separate approved setup. Private imported notes remain excluded.

## Verification

Initial verification passed six focused model/controller tests and the then-current 271-test frontend suite. Browser and actual Windows each passed 14 interactions, six Light/Dark window profiles and 200% text. Checks cover keyboard scrolling, modal shortcut exclusion, empty search/Clear, repeated opening, editor selection, saved revision and Undo. Native minimum text contrast was 6.029:1 Light and 7.822:1 Dark; focus/field boundaries passed 3:1 and active targets passed 44px. Screenshots were manually inspected.

The November 7 follow-up passed all 310 frontend tests, 17 rendered shortcut
checks and 17 Help checks across six profiles, including composing Escape and
selection/Undo preservation. These event-driven checks are not physical IME or
screen-reader certification.

Six additional native first-run checks verified availability before a note, disabled note-dependent commands, modal exclusion and unchanged disabled sharing. `help-smoke.js` and `empty-start-smoke.js` require guarded disposable fixtures. They never request generation or use private notes.

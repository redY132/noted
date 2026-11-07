# Navigation direction

Source: the approved neutral Noted shell and Redley's November 5 correction to the sidebar. Scope: navigation, not authored note presentation.

Reading this as a docked desktop directory for people organizing connected notes, with a quiet graphite interface and one continuous folder-to-note-to-graph surface. Dials: ENERGY 1 / RHYTHM 2 / MOTION 2.

- Keep neutral surfaces and the existing user accent so navigation belongs to the current writing app and respects its theme preference.
- Use system sans-serif for navigation to distinguish controls from the document's authored typography.
- Let the hierarchy unfold at the selected branch. Indentation and disclosure controls show parentage without displaying every descendant at once.
- Reserve real layout width on the left so opening navigation pushes the document right and closing it restores writing space. Do not overlay the document.
- Use one background without boxed areas, surface borders or shadows. Position and row hover explain the three roles.
- Connect the selected folder to the scrollable note directory with a branch line and note-row elbows. These paths express actual parentage, not decoration.
- Give the graph the majority of navigation width and keep it visible while browsing, opening notes and writing. Interpret the requested 15/10/50 proportions as approximate viewport shares, with remaining space for the document and minimum usable control widths.
- Use the accent and a visible outline for the selected folder and highlighted node. Keep node titles available to keyboard and pointer users.
- Bound graph rendering and edge queries to 60 notes, matching the existing API. Always include the hovered/focused note and report the actual displayed count.
- Keep notes in compact wrapping rows with scroll and incremental loading. Preserve autosave and editor identity when navigation opens or changes size.
- At desktop sizes keep folders, notes and graph side by side. On small screens or with large text put the folder tree above the notes/graph pair and push the document below; never cover it. Each long list scrolls independently, and resizing keeps the selected folder in view.
- Use brief transitions to show where a branch or surface came from, and disable them under reduced motion.
- Folder names and moves use existing library storage. Folder icons are a device preference, like appearance, and the customization field states that scope. Icons identify collections; they are not decoration.

Verify with synthetic fixtures only. Do not load the private Logseq source, its assets or imported notes for any screenshot, graph or test.

## November 6 daily-use additions

Keep the docked navigator unchanged. Open note is a focused native dialog for local saved-note search: a labeled field, plain rows with folder context, keyboard navigation and a clear way back to writing. Reuse the existing theme, accent, typography and 44px controls. Empty, loading and retry states explain the next action. No decorative cards or new visual assets are needed.

AI formatting should name the note and requested goal before generation and clearly state whether a full guidance document is included. A visible scope summary serves informed consent; it does not add permissions or start a request. Preserve the existing preview and approval flow. Dials remain ENERGY 1 / RHYTHM 2 / MOTION 2.

## Evening navigation and job awareness

Back/Forward is a writing aid: restore the user's reading position and selection, keep note content authoritative on disk, and retain only bounded session metadata/view state. Familiar directional controls have a navigation purpose. At narrow writing widths, expose the same commands in View and by keyboard rather than crowding the top bar. A plain history list explains unavailable visits and permits choosing another entry.

Explicitly started AI work needs a small, persistent status affordance while its dialog is closed. It should name its state and provide a route back to review without starting new work. Preserve the quiet neutral shell, existing accent, 44px controls, visible focus and reduced-motion behavior. Do not change the dock composition. Dials remain ENERGY 1 / RHYTHM 2 / MOTION 2.

AI activity uses a compact plain strip below the writing toolbar. It names the explicitly started job's note and offers Open generation or Review proposal after the dialog closes or the user visits another note. This avoids crowding the narrow document toolbar. Closed-dialog status checks read only the owned local job metadata; they do not create requests, wake agents, send another note or apply changes. Reopening returns to the originating note and goal through save-before-navigation, retaining private-note eligibility and per-use guidance consent. Terminal status can be dismissed without deleting a saved proposal. No new animation or decorative surface is needed.

In narrow or vertically constrained writing areas, status keeps a concise state, an ellipsized note title and its actions. Repeated explanatory detail stays in the AI dialog. Short stacked layouts use one summary line to preserve an editable document viewport. The full title remains in the accessible text and tooltip. This changes status density rather than the accepted dock proportions.

When the writing area is shorter than 360px, its five note-action buttons move into a Note actions group in View. The same commands remain available there at all sizes. This removes the wrapping action row from short layouts while preserving the current editor, selection and dock. Focus moves to View when a resized layout hides the focused row; unavailable-note and navigation states disable those commands.

## Long-note navigation

Go to heading is a temporary native dialog reached from View, not another sidebar. Plain heading rows follow the document's logical reading order and label their H1-H6 levels. Search and paging keep a long outline manageable. Choosing a row moves the caret and scrolls to its stable block without changing words or remounting the editor; cancelling restores the prior writing context. Empty and changed-document states provide a useful recovery action. Reuse the existing neutral theme, 44px controls, focus treatment and dialog dimensions. Dials remain ENERGY 1 / RHYTHM 2 / MOTION 2.

## Daily review calendar

Reviewed today means the current date on this device, matching Today's note. Stored review timestamps remain UTC instants; changing timezone recalculates the current local day without rewriting notes or review files. Snooze remains an elapsed 24 hours rather than an ambiguous calendar reset. Explain this in the existing review dialog, without a new setting or decorative status surface. Keep local-only review distinct from AI and do not change any sharing controls.

Review opens immediately into a named dialog with plain, internally scrolling note rows. Folder, tag and hidden-state filters update the queue with visible pending feedback; old rows become unavailable as soon as a filter changes. Each note offers the existing review actions. Show Reset review when hidden-state notes are included, where restoring those choices is relevant. Loading, failed reads, empty selections and failed saves explain recovery. Keep keyboard focus near the next item after marking or snoozing, and return to the opener on cancellation. Only an open review dialog checks for a changed local day; closing clears its retained metadata and timer. No new card surfaces, assets, animation or sidebar sections. Dials remain ENERGY 1 / RHYTHM 2 / MOTION 2.

Below 650px window height, use a single dialog scroll with its Close heading retained at the top. Filters and explanatory copy must not squeeze the queue into a 44px nested viewport at large text. Normal desktop windows keep an internally scrolling queue.

## Previous-save recovery

Previous save is a local recovery command in View. Show the open draft and the captured previous completed save as plain-text previews, with revision/date context and a clear statement that Recover creates a new note. Use a single-column comparison on narrow windows, existing neutral surfaces and 44px controls. Preview text is bounded and does not execute components or fetch images; copying preserves the complete validated document and supported assets. Save the current draft before leaving it, retain a created copy when opening fails, and make retries explicit. Escape/Close restore writing context. In short windows use a full dialog scroll instead of tiny nested previews. No automatic overwrite, automatic recovery, new AI access, animation or sidebar section. Dials remain ENERGY 1 / RHYTHM 2 / MOTION 2.

The comparison reserves its full content height so stacked previews cannot overlap status/actions. Column sizing uses a text-relative minimum and becomes one column at large text. Keep Close at the top of a scrolling dialog, and reset preview scrolling when opening a fresh recovery session.

## Help and shortcuts

The minimal shell needs an optional reference, reached from View and available before opening a note. Use a searchable plain list grouped by writing, navigation, recovery and AI workflow. Key labels are readable text, not tiny decorative badges. Explain context-sensitive commands and the difference between explicit generation and Advanced queued requests. No account check or note content is needed to show help. Keep one internally scrolling dialog with visible Close, native focus/Escape semantics, clear no-result recovery, existing neutral surfaces and 44px controls. Do not add persistent writing hints, branding, cards, animation or another sidebar. Dials remain ENERGY 1 / RHYTHM 2 / MOTION 2.
# Save-error recovery refinement

During rules: keep the existing plain inline alert, palette and action labels. A rendered synthetic long-path failure currently pushes every recovery control outside a 1200px window and leaves 26px targets. Make long diagnostics wrap and keyboard-scroll, let recovery actions wrap within the writing area, give active controls at least 44px targets and readable text-relative sizing, and bound the banner in short windows so writing remains reachable. Preserve the current draft, explicit Retry/Keep both/Download, save-before-switch and the dock layout. Do not open a modal or steal typing focus automatically. Verify short and long messages, both themes, narrow writing areas, 200% text, focus scrolling and actual retry/conflict recovery with synthetic fixtures. ENERGY 1, RHYTHM 2, MOTION 2; no new assets or effects.
# Workspace recovery refinement

Preserve the existing local Create → Inspect → Restore as a new workspace flow and separate-copy opening. Prevent late default paths from replacing a chosen path, disable operations during initial setup, release the form for manual paths if defaults fail, and invalidate inspection after every restore attempt. Ignore UI continuations after disposal without claiming to cancel a native copy already underway. Make the named Workspace dialog's Close stay reachable while scrolling; use existing plain controls, text-relative sizes, 44px targets, visible focus and 3:1 field boundaries. Check asynchronous failure/disposal with fake APIs, then actual Create/Inspect/Restore in guarded native fixtures and responsive themes/200% text. No changes to archive format, source workspaces, imported data, permissions or AI. ENERGY 1, RHYTHM 2, MOTION 2; no new assets or decorative sections.

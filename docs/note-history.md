# Note history

Use **Back** and **Forward** in the writing toolbar, **View > Back to note / Forward to note**, or **Alt Left / Alt Right** on Windows. Small writing areas keep these commands in View so they do not crowd the document. The accepted left navigation dock is unchanged.

**View > Note history** lists visits in the current app session, newest first. Choose a visit to return directly. The current visit is labeled. Trashed destinations remain listed as unavailable; Restore makes their visits available again. Clear previous visits keeps the open note and removes earlier session visits. None of these actions delete note files.

Switching saves the current draft first. A failed save or load keeps the draft and the history position, so the destination can be retried. Opening a different note after going Back starts a new branch. Up to 100 visits are retained. Titles and folder locations follow renames and moves.

Back and Forward restore scrolling and text, node, whole-document or table-cell selection. Position offsets are reused only for the exact saved revision. If a file changed elsewhere, Noted loads the current file, starts at a safe selection and clamps scrolling. It does not restore an obsolete body. Visiting the same currently open note preserves the mounted editor and its Undo stack; switching to another note uses the existing editor lifecycle and does not provide persistent cross-note Undo.

History stays in memory and disappears when the app closes. It contains note IDs, titles, folder IDs, availability, saved-version fingerprints, selection coordinates and scroll offsets. It contains no note bodies, does not change AI access and makes no model calls. Keyboard navigation is suspended behind a modal. macOS keeps its native Alt-word editing gestures; use the visible commands there.

Synthetic verification: `navigation-history.test.ts`, `note-view-state.test.ts`, `note-history-ui.test.ts`, `scripts/note-history-smoke.js`, `scripts/note-history-faults.js` and the history profiles in `scripts/daily-workflow-visual.js`.

# Open note

Press **Ctrl P** on Windows, **Cmd P** on macOS, or choose **View > Open note**. The dialog searches saved titles, text and tags locally using the existing search index. It leaves the docked navigator and writing layout as you chose them.

Type to search. Arrow Down moves into the results; Arrow Up returns to the field. Home and End move through results when a result has focus. Enter opens a result. Escape closes on the first press and restores focus. An existing modal is left in place when the shortcut is pressed.

Results show folder context and load 40 at a time. Show more notes adds the next page and moves keyboard focus to the first new result. An updating index is identified explicitly; empty results refresh while indexing finishes. Refresh results checks an incomplete list. Missing folder metadata is labeled unavailable.

Switching uses the ordinary save-before-navigation path. If saving or opening fails, the picker stays available and the current draft is preserved. Retry search recovers a failed lookup. Cancelling keeps the same editor, selection and Undo history. Opening another note uses the app's existing editor lifecycle; this does not add persistent Undo history across notes.

The picker does not change AI sharing, create an agent request or call a model. Test scripts must use fresh synthetic workspaces; do not use private imported notes to verify it.

AI formatting also now shows **Before generating**: the current note, the intended contents and the OpenAI/Codex account boundary. Schema rules and a full guidance document are distinguished. Full guidance still requires fresh per-use consent. Detailed explanations remain under **Data and usage details**; external-agent controls remain under Advanced. Preview, Apply/Reject, Undo and hard AI-private denial are unchanged.

Verification scripts: `daily-workflow-smoke.js`, `daily-workflow-faults.js` and `daily-workflow-visual.js`. The existing sidebar suite checks that the accepted docked layout remains intact. See the November 6 session report for recorded results and limitations.

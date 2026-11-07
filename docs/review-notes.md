# Review notes

Open **Browse > Review notes** to revisit up to 30 of your original saved notes. The feed prioritizes notes least recently reviewed; reasons include editing age, saved connections and tags. This feature works offline and does not generate summaries or call an AI model.

Folder filters match the exact folder, with its full hierarchy shown in the picker. Tags match without case sensitivity. Changing either filter updates the queue; typing a tag waits briefly before reading. Old rows become unavailable immediately, so actions cannot target a result from an earlier filter. Refresh retries a failed read.

- **Open note** saves the current draft first, then follows ordinary navigation. Opening never marks the note reviewed automatically.
- **Reviewed today** hides it for the current calendar date on this device, matching Today's note.
- **Snooze 24 hours** defers it for an elapsed 24 hours, including across daylight-saving changes.
- **Exclude** removes it from normal review until reset.
- Enable **Include reviewed, snoozed and excluded notes** to see their reasons and **Reset review**. Reset clears all three choices for that note.

Review timestamps remain UTC instants on disk. The daily boundary and ranking tie use the device's local date, not midnight UTC. A timezone change recalculates that date without rewriting note files. An open dialog refreshes when its local day changes, checked once per minute or when the app resumes. Closing clears its results and stops that timer. No scheduled notification or model job is installed.

The dialog opens immediately with loading feedback, ignores late responses after filters change or it closes, prevents duplicate actions, and keeps focus near the next item after one disappears. A failed draft save keeps the dialog and draft open. A confirmed review write followed by a failed queue refresh is reported separately. In short windows the whole dialog scrolls, with Close retained at the top, rather than squeezing results into a tiny nested viewport. Escape closes a nonempty search on the first press.

## Verification

The full frontend suite passed 252 tests. Thirteen focused calendar/UI tests cover negative and positive offsets, UTC/local midnight, both daylight-saving transitions, exact snooze expiry, invalid timestamps, loading/error/retry, late responses, duplicate writes, modal guards, focus and local-day resumption. Native tests passed 103 cases, with four optional model/corpus cases ignored; deterministic review clocks also verify that reading the feed does not rewrite fixture notes or review state.

Browser and actual Windows checks each passed 25 interactions, six theme/window profiles and 200% text. Minimum measured review text contrast was 6.029:1 Light and 7.822:1 Dark; targets, focus, field boundaries and overflow passed. Tests check the last queue action is reachable by scrolling at every profile, and large text uses one dialog scroll. Screenshots were manually reviewed. All test notes are disposable; no private Logseq data or access policy is inspected or changed.

An additional actual-clock Windows check crossed midnight UTC on November 6/7 without changing the device clock or timezone. A synthetic note marked reviewed before that boundary stayed hidden after it, while an unreviewed control stayed visible and the Eastern device date remained November 6. `scripts/review-midnight-check.js` records preparation and verification separately and reports pending rather than success before the boundary.

The queue remains bounded to 30 notes rather than a complete history or a spaced-repetition scheduler. A new local day may change its stable tie order. Include hidden notes still respects the selected folder/tag and the 30-note limit.

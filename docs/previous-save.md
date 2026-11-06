# Recover the previous save

Choose **View > Previous save** with a note open. The dialog compares a plain-text snapshot of your open draft with the immediately previous completed save. Revision and local saved date identify that copy. Preview text is limited to 12,000 characters on each side; recovery keeps the complete validated document. Images appear as descriptions and components as readable fallbacks in the preview, without fetching images or executing components.

**Recover as a new note** saves your current draft first, then creates and opens a separate note with the usual `(recovered draft)` title suffix. The old version never replaces the original note. Supported note-owned local images are copied; content objects, layout, inline links, tags and an existing old folder are retained. If that old folder is missing, the copy goes into Unfiled. Incoming links and saved connections continue to belong to the original ID and are not duplicated.

The previous snapshot is captured before the current draft is flushed. If autosave or an external save later rotates the on-disk backup, Recover still uses the copy you reviewed. A failed draft save stops recovery and keeps both the draft and captured copy available. If a recovered copy was saved but opening it fails, **Open recovered copy** retries that same ID rather than creating another copy. Closing discards the in-memory preview; the note files remain on disk.

This retains **one previous completed save**, not a timeline. Autosave replaces the `.json.bak` file on subsequent saves. A new note has no previous save until its first successful change. Use Workspace details for portable workspace backups and restore. Keep a workspace backup for longer-term recovery.

The reader validates an ordinary local path, size, identity, older revision and supported document shape. Malformed, oversized or ambiguous copies are refused without replacing them. Recovery inherits the original note's current hard AI exclusion before publishing the copy, even if that exclusion was added after preview. No MCP backup-retrieval tool or agent permission is added. Private imported notes remain excluded from AI; this is a local human recovery screen.

Browser preview simulates one previous save inside its existing disposable browser-store record. It remains separate from native files and has the same browser-storage durability limits as other preview data.

## Verification

262 frontend tests passed, including ten preview/recovery cases; seven recovery-controller cases passed again after fresh-session scroll handling changed. Native tests passed 107, with four optional model/corpus cases ignored. Native fixtures verify read-only preview, exact original/backup preservation, a captured copy surviving later autosave, image copying, invalid/oversized backup refusal, missing-folder recovery and fresh private exclusion before copy publication.

Browser and actual Windows each passed 20 interactions, six Light/Dark profiles and 200% text. Both v1 and v2 previous documents were exercised. Tests verify a saved draft before switching, a separate recovered ID, preserved external revision, cancellation/selection, empty recovery, modal guarding, action reachability and no uncaught errors. Minimum measured text contrast was 6.029:1 Light and 7.822:1 Dark. Targets, focus, bounds and explicit content-overlap checks passed. Narrow/large-text screenshots were manually reviewed after fixing stacked previews overlapping the action area. Production frontend and Windows release built.

All verification uses disposable synthetic workspaces. No real note, backup, private import, source database or source asset was inspected or modified.

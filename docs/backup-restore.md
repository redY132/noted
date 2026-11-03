# Workspace backup and restore

Open **View → Workspace details → Backup and restore** in the desktop app.

1. Choose a new `.noted-backup` file path and select **Create backup**. Pending edits are saved first. The default location is a sibling `Backups` folder outside the active workspace. The default filename advances for subsequent backups; custom filenames are never overwritten.
2. Copy the finished archive to your chosen backup location or another device. **Show backup in folder** reveals it. A backup on the same drive alone does not cover drive loss.
3. Enter an archive path and a **new workspace folder**, then select **Inspect backup**. Review the note, asset, definition and relationship counts and any recovery warnings.
4. Select **Restore as new workspace**. Existing destinations are refused. **Open restored copy** opens a separate, named window with a fresh WebView profile; component code starts disabled. The original workspace remains available.

Browser preview storage is separate; these controls are disabled there.

## Snapshot contents and consistency

The version 1 archive is one SQLite file, identified by a Noted application ID and an exact, inert three-table schema. It streams authoritative files into bounded BLOBs and stores relationship rows as typed data, rather than copying a live SQLite WAL file.

Included data:

- Original note/folder JSON, previous revisions and pre-V2 migration backups.
- Owned image/GIF bytes, immutable schema versions and component definitions/source.
- Every saved relationship, including strength, dismissal state and action revision, even when a referenced note is unavailable.

Search indexes, embeddings, model weights, workspace locks, WebView profiles and execution approvals are excluded. Restoring rebuilds derived indexes. No component source runs during backup, inspection, extraction or indexing. Archives are ordinary local data files, with the same confidentiality considerations as the workspace.

The native writer mutex covers the snapshot, so app writes cannot interleave note files, definitions, assets and relationships. File size/mtime checks also reject detected external edits during copying. Arbitrary external filesystem editing is outside the app's advisory lock; close external editors and do not modify workspace files during a snapshot.

Each payload has SHA-256 integrity checks, and saved relationships have a separate aggregate checksum. Inspection fully extracts and validates a disposable copy. Restore requires the inspected whole-archive digest and checks it again before publication. These checks detect corruption and changes after inspection; they are not a signature proving who created an archive.

## Restore guarantees and limits

Restore reserves a new destination and creates files exclusively. It never merges into, deletes or replaces an existing workspace. A `.noted-restore-incomplete` marker blocks partially copied destinations from opening until publication finishes. On an I/O failure, keep the original workspace and retry into a different new folder; the error identifies the incomplete copy.

Invalid original note JSON is retained byte-for-byte and reported as a recovery warning. Optional missing definitions/assets remain recoverable. Unknown archive schemas, path traversal, redirected directories, duplicate paths, unexpected payload sizes, checksum failures and invalid relationship rows are rejected before publication.

Current bounds are 32 MiB per file, 8 GiB of file payload, 200,000 files and 2,000,000 relationship rows. Copying uses 64 KiB buffers; archive size does not become one in-memory JavaScript message. Sufficient free disk space is needed for the archive, disposable validation copy and restored copy. Crash/power-loss durability still depends on the operating system and filesystem; incomplete-copy guards do not constitute a hardware durability certification.

## Verification

Native core tests cover a live snapshot with relationships, exact JSON/assets/definition restoration, migration backups, action revisions, rebuilt search, derived-data/approval exclusion, corrupt payloads and relationship rows, stale inspection, hostile schema, unsafe paths, existing destinations and incomplete-copy guards.

The packaged-app smoke exercises Create, Inspect, Restore and Open restored copy against disposable fixtures and compares the active workspace before/after. Run `scripts/backup-native-smoke.js` with Playwright CLI only against a disposable `NOTED_WORKSPACE` and a separate WebView profile. It intentionally creates a saved connection and a backup. Logs, screenshots and restored copies remain under ignored `output/`.


## Daily-use alpha data

Backups now also include `trash/*.json` and `review/*.json`. Note-owned assets and retained relationship rows remain available when a trashed note is restored. Regression coverage round-trips Trash identity, review exclusions and opaque asset bytes. `agent-access.json`, formatting requests and replies are excluded deliberately: a restored workspace starts with agent access disabled and has no inherited pending one-note grants.

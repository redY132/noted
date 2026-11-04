# Private imports and AI exclusion

Updated November 4, 2026. Private imports have a hard denial independent of optional Agent access selections. There is no UI action that removes this denial. The real Logseq trial remains blocked at preflight; this protection has been verified with synthetic imports, not applied to the personal library.

## What is excluded

`ai-private.json` records canonical note and folder UUIDs, with an `ai-private.required` sentinel so a missing or malformed policy fails closed. IDs are denied before any imported canonical note is written. The protected folder and descendants are unavailable to both local and hosted MCP search/read/list/request/proposal routes, explicit one-note subscription formatting, component generation and local semantic embeddings. Optional folder grants cannot override it. Formatting history may still be inspected locally by the human user; it grants no model access.

Note denial survives moving out of the private folder, Trash/Restore, recovery into a new note ID and copying an asset into another note. New notes in protected folders are stamped before saving. Moving a folder into a protected tree stamps its existing descendants and notes. The policy travels in backups and restored copies. Agent sharing and execution approvals remain separate.

Captured document schemas record `sourceNoteId`, including after guide content is stripped for rules-only use. Private sources cannot be used as AI guidance. In a workspace containing private data, legacy full guides without source provenance must be recaptured from an eligible note before use. Request creation, pending-request retrieval and the actual subscription launch recheck the policy; a stale request does not confer access.

The semantic service checks private source IDs before reading text, queueing typed queries or embedding. It filters cached results and prunes newly denied bindings before query work. The active private note never becomes an embedding source. Pure local lexical search, editing, backup and original-file recovery are ordinary app functions, not model inference.

## Older builds and interruption

Matching app/agent protocol is now 5 with `privateNoteExclusion: true`. Private workspaces also carry an exact private-policy compatibility fence in the existing `.noted-restore-incomplete` guard filename: installed older apps and MCP companions already refuse that filename. Updated builds recognize this particular marker only with a valid private policy. It is not an unfinished restore. Do not delete it or open a private workspace in an older build. Restore replaces its temporary recovery guard atomically with the compatibility fence when private data is present.

Private publication owns the Store writer lock or the desktop's existing writer mutex. It validates a staged graph, images, original archives, source hashes and native notes before publication; appends denial first; then guards multi-file publication with `.noted-private-import-incomplete`. Partial publication refuses normal app opening and all AI calls. `noted-private-import --workspace ABSOLUTE_WORKSPACE --resume` verifies the stored manifest and identical files before continuing; it never overwrites a different file. A changed source/stage blocks recovery. Successful publication verifies all copied bytes and the deny set before removing the guard. Only its fresh UUID staging directory is eligible for cleanup.

## Current limitations

The experimental SQLite adapter is a local developer workflow, separate from the delivered file-graph import screen. Unsupported source constructs and missing assets block it. A complete export is not permission to fetch external assets, enable AI sharing, remove privacy or silently downgrade dynamic source behavior. See [SQLite conversion and gates](logseq-sqlite.md). No credentials, persistent hosted connection or personal-note transmission were created by this work.

# Logseq SQLite: compatibility reader, not a delivered import

Updated November 4, 2026. Markdown/Obsidian/Logseq **file-graph** imports remain available in the app. SQLite publication, same-format conversion and import into an existing workspace are not implemented by this developer reader. No personal graph has been imported.

## Authorization and verified boundary

The user selected a SQLite export and permits importer software to read it solely for transfer. No AI may see its schema, records, titles, text or values. Accordingly, `scripts/logseq_sqlite_snapshot.py` opens the selected file with SQLite `mode=ro&immutable=1`, disables extension loading and trusted schema, sets query-only mode, and consumes integrity results internally. It refuses existing SQLite sidecars and redirected sources. SHA-256, size and modification time are compared before and after; WAL/SHM/journal presence must stay unchanged. No source copy, destination notes, workspace files or model calls are made.

An internal Node process decodes standard Cognitect Transit. Its payload stdout is captured by the importer pipe; stderr is discarded. Neither payload is a diagnostic or an AI tool result. The reader prints only fixed status/error codes, structural counts and booleans. It has no dump, raw-schema or verbose-record option. All exceptions are sanitized. No private value should be printed, attached to a test failure, copied into a fixture, sent to an agent or included in Git. The dependency is pinned `transit-js` 0.8.874 (Apache 2.0); this is independent adapter code, not vendored Logseq source.

## Implemented snapshot reconstruction

- Read address zero for root metadata and address one for pending transaction groups.
- Follow only live EAVT B-tree addresses; do not mistake unused/stale `kvs` rows for current notes. Deduplicate branch separator datoms and verify the public EAVT count before replay.
- Handle Transit typed maps, keywords, UUIDs, sets, strings and caching without interpreting code-like note text.
- Recognize the public DataScript fork's integer-to-keyword schema aliases alongside property maps.
- Replay positive assertions and negative retractions in order, including cardinality-one replacement, cardinality-many values and redundant assertions. Reject tuple/dynamic-schema transaction cases and uniqueness conflicts rather than silently returning stale state.
- Bound source size, record/datom counts, decoded nesting, time and subprocess memory. Unknown graph semantics block publication.

These facts were verified against pinned public [Logseq SQLite storage](https://github.com/logseq/logseq/blob/25b5ecf9cceb0f0939925f63d0a834b159bc8766/deps/db/src/logseq/db/common/sqlite_cli.cljs), [its DataScript storage fork](https://github.com/logseq/datascript/blob/3f141af97b70e1f14c65eaa119acd822ebece37e/src/datascript/storage.cljs), [schema update rules](https://github.com/logseq/datascript/blob/3f141af97b70e1f14c65eaa119acd822ebece37e/src/datascript/db.cljc) and [Logseq DB schema](https://github.com/logseq/logseq/blob/25b5ecf9cceb0f0939925f63d0a834b159bc8766/deps/db/src/logseq/db/frontend/schema.cljs). The official ordinary SQLite opener creates tables, so it must not be called on this protected original. Logseq's [export guidance](https://github.com/logseq/docs/blob/master/db-version.md#export-and-import) distinguishes SQLite, EDN and limited Markdown exports; they require different adapters.

## Counts-only compatibility outcome

The selected export reached snapshot reconstruction and transaction replay, then returned `RICH_GRAPH_SEMANTICS_ADAPTER_REQUIRED` and `imported: false`. Generated counts remain in an ignored local diagnostic, not in this repository. They count datoms, entities, authored nodes and unmapped attribute values; they do not certify a page count or same-format conversion. Source bytes/size/mtime and sidecar presence were unchanged. No AI inspected graph contents, and no source payload was used in a model test.

## Remaining gates before private publication

1. Build a versioned graph-to-source-tree adapter with synthetic/public fixtures for custom properties and class schemas, page identity, hierarchy/sibling order, references and embeds, tasks, recycled/hidden nodes, assets and rich titles. Preserve unknown data and report losses locally; do not ask an AI to inspect a private schema to infer its meaning. The current reader stops rather than dropping unmapped values.
2. Build an enforceable private-import policy before writing any destination note. Exclusion from selected MCP folders alone is insufficient: the explicit one-note subscription workflow can override folder selection, and local semantic embeddings are a separate model path. A deny policy must cover retrieval/search, queued requests, full-document schema guidance, formatting/component generation, semantic indexing and embeddings, moves, restored backups and stale request snapshots. Malformed policy must fail closed. Test this with synthetic sentinels and no model calls.
3. Add a lock-aware staged native publication operation into a new private folder. The existing folder importer publishes only a **separate workspace**. Do not bypass the active Store writer lock or copy JSON files into an open personal workspace. Validate destination IDs, source-to-note/block mappings, original archive hashes, loss report, backup/restore and rollback before removing an incomplete marker.
4. Publish only after those gates pass, then verify counts, structure, permissions and source integrity without returning note text to an AI. A policy/format blocker is not permission to substitute a lossy Markdown import or an opaque archive for the requested formatted notes.

No private folder was created and no AI access policy was changed. There is currently no completed private-import exclusion guarantee to claim. The safe outcome is a compatibility blocker with the original preserved.

## Reproduce using fixtures

Install the project's pinned development dependencies and run `npm run test:logseq-snapshot` with Python 3 and Node available. The tests create disposable synthetic SQLite files and canaries, exercise live-tree reconstruction, schema aliases, transaction replay, fail-closed cases and sanitized diagnostics, and verify exact source bytes and no new sidecars. Never substitute a personal graph for a fixture. The reader is an internal developer tool and is intentionally absent from the portable application's import UI.

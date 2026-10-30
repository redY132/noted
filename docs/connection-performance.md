# Connection storage and retrieval measurements — October 29, 2026

These release-mode measurements exercise the real Rust store, SQLite FTS picker, shared-tag/keyword related-note retrieval and incremental saves. They exclude the semantic worker, ANN, WebView2, GUI rendering, and model inference. They do not certify the 8 GB entry-level reference laptop.

Generate a disposable workspace and reproduce a row from the repository root:

```powershell
cargo run --manifest-path src-tauri/Cargo.toml --release --no-default-features --example connections_benchmark -- 5000 1000
```

The two arguments are note count and words per note. The executable writes generated notes and `results.json` under ignored `output/connection-bench-*`; no user workspace is opened. Each corpus uses repeated synthetic topic vocabulary, 50 equally sized tag groups, stable note identities, and one paragraph per note. Timing includes 30 warm retrieval samples; p95 is the 29th sorted sample. Initial indexing uses a single rebuild transaction, while normal desktop startup opens cached indexes and reconciles bounded background batches.

| Notes | Words/note | Total words | Initial index | Cached store open | Picker p95 | Keyword/tag related p95 | One save | Database bytes |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 500 | 1,000 | 500,000 | 315 ms | 3.33 ms | 1.24 ms | 22.66 ms | 9.08 ms | 5,399,136 |
| 5,000 | 1,000 | 5,000,000 | 2,936 ms | 4.93 ms | 4.07 ms | 32.90 ms | 8.09 ms | 51,389,096 |
| 50,000 | 1,000 | 50,000,000 | 34,264 ms | 3.97 ms | 51.80 ms | 109.25 ms | 8.51 ms | 512,160,496 |
| 5,000 | 5,000 | 25,000,000 | 16,418 ms | 6.31 ms | 10.87 ms | 185.37 ms | 10.86 ms | 235,881,392 |

Database bytes sum the root-level database and WAL files at observation time; they exclude canonical note files, assets, model files and semantic indexes. Cached store-open time excludes UI startup, reconciliation queue creation and scanning. One-save time includes file persistence and derived-index updates; the benchmark changes the title of an existing note. These are development-machine observations, with possible concurrent compilation/I/O noise, not isolated hardware guarantees. Native process peak memory and battery usage are not measured by this harness. Corpus text is synthetic and does not establish suggestion usefulness.

The connection implementation has six new integration tests covering mutual persistence without modifying note revisions, idempotent duplicate connection attempts, conflict-safe Undo, persistent dismissal and restoration, export contents, missing/restored targets, indexed metadata search and pagination, incoming/outgoing reference counts, mixed text/image reference provenance, and cached startup reconciliation. Together with the existing store suite, 24 core Rust tests pass.

Authoritative manual relationships and dismissals live in `relations.sqlite3`; rebuildable note/tag/reference/search data lives in `index.sqlite3`. Deleting or rebuilding the latter does not erase saved relationships. The export command reads all relationship states in one SQLite statement and returns a versioned JSON snapshot. Normal workspace filesystem backups must preserve a consistent SQLite snapshot including committed WAL state; copying only an active main database file is insufficient.

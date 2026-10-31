# Floating connections graph — October 30, 2026

The ⤳ handle now opens one source-bound graph in place of the separate picker/sidebar. Nodes span the app below its top bar on a fully transparent surface, with independent floating search and action controls. There is no background fade. Node releases retain bounded pointer velocity in the force simulation; camera panning uses exponential deceleration. Reduced motion bypasses momentum. New gestures, reset and closing cancel camera motion. Coordinates are temporary UI state.

The graph starts with twenty saved neighbors and five labeled suggestions, pages suggestions at twenty, expands ten neighbors at a time and caps the scene at sixty nodes/180 edges. Source pairs and the protected exploration path take priority over dense neighbor cliques. Selecting does not navigate; Open explicitly does. Search initially covers every direct saved connection of the named source; Add notes changes to workspace scope. Written references and semantic controls remain available in separate small popovers. Undo notifications sit above the lower controls.

## Verification

- 106 frontend tests and 32 core Rust tests pass, as do TypeScript, frontend production and Windows release builds. The preceding backend stage also passed the full native semantic suite, including pinned offline-model integration tests; this pass adds the dense source-edge regression.
- Browser and release WebView2 regressions cover source-bound opening, multi-connect, selection preservation, independent strength Undo, drag duplicate handling, persistence, suggestion paging/dismissal/restoration, incoming/outgoing references, unavailable targets, bounded expansion, pan/zoom and worker termination.
- Real pointer checks verify fully transparent full-screen geometry, node continuation after release, panning continuation followed by rest, reduced-motion bypass and cancellation on close. Shell tests retain editor identity, formatting, undo, free-placement coordinates, scrolling, preferences and F8 restoration.
- Light/dark layouts were inspected at 800, 1200 and 1600 CSS pixels with graph/settings visible. Scene and stage backgrounds are transparent; the underlying document remains at opacity one. Save recovery stays above the scene.
- Native databases created with the legacy fixture schema receive a consistent pre-migration backup. Unit tests cover strength defaults/validation, persistence, revision conflicts, full-state Undo, export version 2, independent index loss, scoped retrieval and bounded reranking that cannot qualify unrelated notes.

Reproduce UI checks with Playwright CLI `run-code --filename` and `scripts/connections-smoke.js`, `scripts/graph-discovery-smoke.js`, `scripts/graph-motion-smoke.js` and `scripts/minimal-shell-smoke.js`. Generate a disposable 500-note workspace with `node scripts/create-graph-fixture.mjs`; use `--dense` for the full-graph benchmark. Never run these against personal notes. Tests use port 1430 and a disposable WebView2 profile; the user's port 1420 is left available.

## Storage and retrieval measurements

These are warm release measurements on the development machine (Ryzen 9 8945HS, 32 GB RAM), **not reference-laptop acceptance**. `src-tauri/examples/connections_graph_benchmark.rs` uses a high-degree source connected to every other note, a dense neighbor clique, and one 32,768-word note per hundred notes. All other notes contain forty words. Twenty warm samples per operation:

| Notes | Total words | Long notes | Connected text search p95 | Visible edges p95 | Strength mutation p95 | Weighted suggestions p95 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 500 | 183,640 | 5 | 8.69 ms | 4.60 ms | 0.89 ms | 10.70 ms |
| 5,000 | 1,836,400 | 50 | 50.68 ms | 6.25 ms | 0.79 ms | 91.80 ms |
| 50,000 | 18,364,000 | 500 | 636.93 ms | 5.70 ms | 0.74 ms | 556.73 ms |

Warm cached store construction was 5.6–5.7 ms, excluding file reconciliation and the app UI. Hybrid merge with precomputed semantic candidates was 10.49/48.25/522.87 ms; these numbers exclude inference. The 50,000-note broad text and merge results **fail the 100 ms search target**. Body-specific connected searches were 1.99/9.63/106.00 ms. The final API additionally prioritizes source edges under its cap; the table predates that bounded ordering refinement. Initial indexing was not remeasured in this storage run.

Release typed semantic queries reused the existing pinned-model synthetic cache: 50,000 notes, 1,718,778 words, 50,000 unique chunks. Search constrains chunk membership during ANN retrieval, including candidates outside a global top-k list. Query embeddings were warm:

| Direct connected scope | Warm query retrieval p95 | Cold scope construction | Private memory snapshot |
| ---: | ---: | ---: | ---: |
| 499 | 162.78 ms | 276 ms | 70.9 MiB |
| 4,999 | 67.99 ms | 1,246 ms | 72.9 MiB |
| 49,999 | 166.68 ms | 15,835 ms | 88.9 MiB |

Model/index load took 257 ms. Scope construction happens on the inference worker, while text results remain usable. The cold 5,000- and 50,000-note scope delays remain a limitation. Snapshot memory is neither a measured peak nor total desktop process-tree memory. Sparse filtered ANN traversal can be slower than a larger scope; these are not linear scaling estimates. Strength changes reuse membership caches and vectors.

Earlier initial-inference measurements for the same model/extractor are recorded in [local semantics](local-semantics.md): 500/5,000/50,000 ordinary notes took 10.64/98.27/1,196.86 seconds for 500/5,000/50,000 unique chunks, about 47/51/42 chunks per second. Derived disk usage was 5.4/19.8/162.7 MiB. A separate 500-long-note workload contained 494,724 words/3,381 unique chunks, took 118.52 seconds (~28.5 chunks/sec) and used 14.1 MiB of derived storage. Those are historical indexing observations, not newly repeated throughput tests. The graph milestone reuses these rebuildable caches; it does not change the embedding model. Historical sampled ANN recall@20 was 100% against exact search. Human-reviewed relevance and 8 GB reference hardware remain unverified.

## Full graph while writing

`scripts/graph-input-benchmark.js` exercises sixty nodes and 180 edges, requests an actual background search rebuild, reheats the force worker, types 57 automation-generated events and saves. In the initial native full-screen runs, beforeinput-to-next-animation-frame p95 was **197.8–198.3 ms** (max 272 ms); frame interval p95 was 33.5–41.8 ms. This **failed the writing responsiveness gate**. No main-thread long tasks were recorded, so absence of long tasks did not imply smooth painting.

The final implementation isolates the graph render layer, removes per-node shadow filters and gives typing priority: editor input stops force updates, discards queued positions and resumes the retained graph after a 450 ms typing pause. The final native run recorded input-to-next-frame p95 **7.7 ms**, maximum **9.2 ms**, and frame-interval p95 **8.5 ms**, with no recorded long tasks. The worker emitted no new positions during the measured typing interval, then resumed and settled. This meets the scheduling proxy on the development machine, not physical paint or reference-laptop certification. The initial failed measurements remain above to explain the scheduling change.

The simulation produced no further position messages during the 600 ms settled sample. Closing terminated its worker and produced no further messages during another 600 ms sample. Camera momentum also reaches rest and schedules no further frames. The rebuild was confirmed active at request time; this does not prove continuous indexing or inference throughout typing. Scheduling proxies are not physical key-to-paint timings. Total graph memory/peak process-tree overhead and reference-device pacing remain unverified.

Local semantics remains explicitly experimental and opt-in. Manual connections, search fallback, strengths, references and exports work without installing or enabling a model. The failed 50,000-note broad search gate and cold-scope latency remain open optimization work rather than claimed as accepted.

# Editor integration comparison — 2026-10-25

## Decision

Keep the focused Tiptap component layer in the application. On the tested workloads it has lower mounting, serialization, reopening, and component-property costs. Both implementations have small synchronous text-transaction costs, but the GrapesJS adapter also shows substantial deferred frame delays on the long single-panel workload. The focused implementation keeps text/layout operations in one document history without an adapter-specific history bridge.

GrapesJS remains only in this reproducible development experiment, not the production application bundle. Its ability to edit a short active region separately remains potentially valuable for a future very large canvas; this experiment does not rule out that architecture for every workload.

## Environment and method

Windows development machine; Edge 156.0.0.0 headless, 1280×720 viewport, device pixel ratio 1, 16 reported logical processors. The repository's documented machine is a Ryzen 9 8945HS with approximately 31.3 GiB RAM. No CPU throttle or GPU constraint was applied. This is not an inexpensive-laptop acceptance test.

Production Vite build of the isolated harness. One warm-up per candidate/workload, then five measured repetitions with alternating candidate order, for 30 measured runs. Each run contains 40 text insertions, 20 width changes and 10 serializations. All runs use the same generated documents, rich-text marks and stable identifiers. Both active editors use the required `white-space: pre-wrap`; both activation paths wait for the same two animation-frame callbacks. Final collection started at 21:43:40 UTC after native compilation finished, with other agent benchmark/build work paused. See [methodology and limitations](README.md). Raw local observations: `output/playwright/editor-comparison.json` (ignored generated artifact).

The workloads are 100 paragraphs in one panel (3,600 words), 1,000 paragraphs in one panel (36,000 words), and 100 panels with four paragraphs each (14,400 words) plus ten tiny local images. The paragraph template contains 36 whitespace-separated words when counted within each paragraph. The images isolate component overhead and do not represent real photograph decoding cost.

## Results

Values below are milliseconds. Mount, activation and reopen include waits for two animation-frame callbacks. Serialization is the median of each run's ten samples, then the median of the five runs. These are editor operations, not complete native note-open/save timings.

| Workload | Candidate | Mount median | Activate median | Serialize median | Reopen median |
| --- | --- | ---: | ---: | ---: | ---: |
| 100 paragraphs | Focused Tiptap | 16.6 | 16.8 | 0.1 | 15.3 |
| 100 paragraphs | GrapesJS + Tiptap | 33.5 | 18.3 | 2.2 | 46.3 |
| 1,000 paragraphs | Focused Tiptap | 47.5 | 15.6 | 0.9 | 13.9 |
| 1,000 paragraphs | GrapesJS + Tiptap | 60.2 | 269.8 | 15.0 | 290.1 |
| 100 panels + 10 images | Focused Tiptap | 25.2 | 16.6 | 0.4 | 11.5 |
| 100 panels + 10 images | GrapesJS + Tiptap | 99.1 | 14.8 | 6.3 | 67.9 |

| Workload | Candidate | Text transaction p95¹ | Dispatch-to-frame p95¹ | Property update median | Serialized bytes |
| --- | --- | ---: | ---: | ---: | ---: |
| 100 paragraphs | Focused Tiptap | 0.8 | 16.9 | 0.4 | 49,289 |
| 100 paragraphs | GrapesJS + Tiptap | 0.7 | 16.9 | 1.5 | 84,318 |
| 1,000 paragraphs | Focused Tiptap | 1.3 | 16.9 | 0.6 | 491,190 |
| 1,000 paragraphs | GrapesJS + Tiptap | 1.5 | 217.5 | 7.8 | 836,720 |
| 100 panels + 10 images | Focused Tiptap | 0.7 | 16.9 | 0.3 | 210,698 |
| 100 panels + 10 images | GrapesJS + Tiptap | 0.7 | 17.2 | 1.0 | 374,267 |

¹ Median of the five per-run p95 values, not the p95 of pooled samples. The frame metric is a scheduling proxy after a **programmatic transaction**, not physical keyboard-to-paint latency or evidence of a display's achieved FPS. Sub-millisecond differences are near timer granularity and should not be overinterpreted.

Mount ranges across the five runs: focused/GrapesJS 16.5–16.8/30.5–42.1 ms for 100 paragraphs; 34.2–51.7/57.3–78.4 ms for 1,000 paragraphs; 23.6–38.2/93.3–102.4 ms for 100 panels. There was no forced garbage collection. Mount excludes bundle download/evaluation; GrapesJS's extra dependency weight is not reflected in those timings.

The long GrapesJS frame delay reproduced in all five runs: per-run p95 values were 226.0, 259.2, 209.8, 211.9 and 217.5 ms. The synchronous transaction remained small, so measuring only command execution would miss this deferred cost. Its precise browser/layout cause has not been isolated; treat it as a limitation of this tested integration, not a claim that every GrapesJS application has this behavior. The two adapters use different editor DOM/control structures and slightly different paragraph margins, so this is not a pixel-identical rendering-engine microbenchmark.

The GrapesJS adapter serializes project metadata and display HTML alongside canonical Tiptap content, whereas the focused editor serializes its canonical document. The measured byte difference describes these working adapters; it is not a fundamental storage requirement of GrapesJS.

## Correctness

Both candidates passed Unicode insertion, text undo, width changes without content mutation, rich-mark/property save/reopen equality, typing after reopening, component reorder without lost components/words, and undo of a property change followed by its preceding text edit. A separate actual Playwright keyboard-input and Ctrl+Z smoke test also passed in the GrapesJS custom RTE. The GrapesJS mixed-history bridge covers the experiment's exposed operations; it is not a production-ready bridge for all generic GrapesJS actions, redo, cross-panel selection or accessibility behavior.

An initial run exposed asynchronous custom-RTE teardown errors. The adapter was repaired to await disabling the active RTE before destruction/restoration; the reported run was restarted after the fix and produced no new browser exceptions. Application-level Rust asset persistence, native lifecycle and UI testing are reported separately by the main task.

This comparison does not measure process-tree memory, cold native startup, background indexing interference, real image decoding, or inexpensive-hardware acceptance. Those remain separate acceptance work.

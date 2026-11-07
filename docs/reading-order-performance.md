# Reading-order reconciliation

Reconciliation adds new content objects beside their visual predecessor while retaining the user's existing logical order. The previous implementation repeatedly searched and spliced a growing array. Introducing many objects could therefore take quadratic time during document projection, migration or outline preparation.

The replacement reconstructs a linked sequence in linear time, with direct paths for new and unchanged documents. It preserves the exact previous insertion behavior, including missing IDs and duplicate invalid IDs that the document validator must still reject. It changes no storage format, authored wording, schema, layout, import policy or AI scope.

## Measured scope

These are **one-function synthetic timings on this PC**, using Node v24.19.0. They do not measure whole-app startup, typing, rendering, memory, disk or inexpensive reference hardware. No note, workspace, asset or model is accessed. The initial probe under development load found a 1,306ms median for 10,000 new shared-prefix IDs. The paired run below measured both functions in the same process, alternating their order over three timed samples after warm-up.

| 10,000 generated IDs | Previous median | Current median |
| --- | ---: | ---: |
| Shared prefix, new document | 675.95ms | 0.66ms |
| Shared prefix, mixed logical order | 197.66ms | 3.99ms |
| Shared prefix, unchanged order | 2.75ms | 2.57ms |
| UUID-shaped, new document | 751.17ms | 0.78ms |
| UUID-shaped, mixed logical order | 192.28ms | 2.11ms |
| UUID-shaped, unchanged order | 2.76ms | 2.33ms |

The timings justify removing the repeated scans; they are not an overall application speedup claim. Results vary with runtime and machine load. Existing reference-device acceptance remains pending a real device and agreed budgets.

## Reproduce and verify

```powershell
node --experimental-strip-types --test src/reading-order.test.ts
node --experimental-strip-types scripts/benchmark-reading-order.mjs --compare
```

Add `--stress` to include 30,000 IDs. The old reference can take several seconds at that size. Default runs use 1,000 and 10,000 IDs, both shared-prefix and UUID-shaped, with new/mixed/unchanged order. Output labels itself algorithm-only and not reference hardware. The reference function is a test/benchmark oracle and is not imported into production.

Tests compare 3,000 seeded arbitrary input pairs against the exact old algorithm, including deletions, visual/logical rearrangement, duplicates and prototype-like strings. A 50,000-ID case verifies every identity and exact mixed pair order without a flaky wall-clock assertion. Existing document/editor tests additionally verify authored words, references, assets, schema permissions, visual/logical separation and Undo. The focused 20-test subset and type-check/production build passed.

The full frontend regression suite subsequently passed 265 tests.

Raw local measurements are ignored under `output/reading-order-baseline.json` and `output/reading-order-paired.json`.

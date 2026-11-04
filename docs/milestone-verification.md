# Milestone verification — November 3, 2026

Current UI: **Format with AI → Describe change → Generate proposal → visual comparison → Apply / Reject**, with visible Undo. External requests and technical JSON are under Advanced. See [current AI workflow](ai-formatting.md), which supersedes earlier control labels and the two-preview sequence below.

## Delivered and exercised

- A real GPT-6.1 Sol call using existing official Codex **ChatGPT sign-in**, medium effort and only a temporary synthetic note. The model was refused an unselected synthetic UUID, corrected a validator-rejected operation, and queued a valid proposal. No API key was used or created. No personal note was read. Native rendered preview, Apply, save and Undo preserved wording. Evidence: ignored `output/live-subscription-result.log`, `live-model-events.jsonl`, `live-model-native-accept.log`; opt-in reproduction scripts are committed.
- Offline exported-folder imports for Markdown, Obsidian and Logseq file graphs. Dry run, explicit fallback review, unchanged-source verification, separate-workspace publication, incomplete markers, archived originals, source recovery and backup/restore round trips are implemented. Heading/block links use stable IDs and native reference indexing.
- Native UI smoke imported two synthetic notes, one raster and an archived PDF, listed the excluded configuration directory, required warning acceptance, left the active fixture workspace unchanged, reopened/rendered the result, navigated to the exact block, retained links after renaming, confirmed sharing disabled and recovered original files. Evidence: `output/migration-native-smoke.log`, `migration-open-smoke.log`, screenshots under `output/playwright/`. No real vault was involved.

## Checks

- `npm test`: **160 passed**.
- `npm run desktop:build`: production TypeScript/Vite and Windows release build passed. Vite reports its existing main-chunk size warning; this is not a failed build or a performance certification.
- `cargo test --manifest-path src-tauri/Cargo.toml --no-default-features`: **69 passed** at the core milestone.
- `cargo test --manifest-path src-tauri/Cargo.toml`: **80 passed, four ignored**. The ignored tests require explicitly supplied offline model packs or a disposable query benchmark corpus; this run did not claim them.
- `git diff --check` passed before the verified commit. Final build/test logs remain in ignored output.

## Release preparation and remaining gates

`scripts/Build-Portable.ps1` creates a private unsigned portable alpha ZIP from a clean committed checkout after building both executables. It includes source-commit provenance, per-file hashes, a ZIP checksum and setup/limitations documents. It excludes workspaces, profiles, model packs, credentials and access policy. Run the extracted build against a disposable workspace for a packaging check. This is not a public release or an installer/signing/license decision.

A real inexpensive reference computer has not been available. The connected development PC and throttling are not substitutes. Whole-app startup/memory/input budgets and physical key-to-paint acceptance remain pending; the existing benchmark runner/fixture kit are available. No low-end performance pass is claimed.

The hosted chat has no live Noted connection. Private tunnel/account/workspace availability, an approved runtime credential and installation/approval of the hosted plugin remain prerequisites. None were created or enabled. Disposable test workspaces start unshared; existing personal sharing settings are not changed by these checks. A local Codex configuration alone does not connect this chat.


Next product milestones: try user-chosen exported copies after reviewing the supported dialect/size limits; add richer attachment access and source-version fixtures; decide whether to resume subscription send controls; finish the hosted account/plugin setup if available; then choose reference hardware, release budgets, license and signing/installer distribution.


### Subscription controls resumed after scope clarification

The later deferral applied to Afterglow, not Noted. The authorized Noted controls are now implemented: explicit **Send this saved note using ChatGPT**, existing official Codex ChatGPT sign-in only, fixed GPT-6.1 Sol/medium, one temporary static-note snapshot (64 KiB maximum), one running job, cancellation and a three-minute timeout. The model has only the temporary formatting-request/proposal tools; no other notes or personal sharing policy are copied. No API-key fallback, credentials or hosted-chat access is added. Proposals still require rendered preview and explicit acceptance; nothing auto-applies.

Passive polling checks local job/proposal status while its dialog is open and does not initiate model calls. Transport heartbeat is separate from sharing policy and never claims this hosted chat is verified. Hosted-chat activation still requires its separate account/tunnel/plugin setup and approval. Earlier references to deferral describe the prior checkpoint, superseded by this clarification.

Current validation: 160 frontend tests and 83 desktop/native tests pass (four optional model/corpus tests skipped). The Windows release and matching agent companion build successfully. Live native subscription evidence is retained in ignored `output/subscription-live-start.log` and `output/subscription-live-finish.log`.

Latest simplified-formatting validation: 165 frontend tests, 85 native tests passed (four optional tests ignored), production frontend/Windows builds passed, and cached plus real synthetic generation flows passed native visual comparison, Apply/Undo, Reject, Close/reopen, stale rejection and retry. The real test used an explicit Generate click with no personal note or sharing changes. Details: ai-formatting.md; ignored evidence: output/simple-ai-*.log.


### Private Logseq presentation checkpoint — November 4, 2026

The importer now resolves default-property background references to a strict local palette/hex attribute and maps recycled pages to native Trash. Original source bytes, UUID mappings and hard AI denial survive source recovery, backup/restore and restoring a page from Trash. Unknown CSS, recycled individual block subtrees, unsupported attachments and live macros still block publication. Literal macro/script examples in Markdown code remain inert content. The bounded diagnostic tool reports fixed categories only and fails closed on changed source assets; it never displays source names, text, private paths or records.

Verified with synthetic fixtures only:

- Final frontend suite: **177 passed**, using `node --experimental-strip-types --test --test-concurrency=1 src/*.test.ts`. A prior concurrent run reached the existing QuickJS wall-clock guard under load; its deadline was not relaxed. This is not inexpensive-hardware certification.
- Native desktop suite: **101 passed, four optional model/corpus tests ignored**.
- Graph/native-CLI import fixtures: **13 passed**; immutable snapshot fixtures: **10 passed**; counts-only diagnostic fixtures: **four passed**.
- Actual Windows release: palette background rendered; formatting/component requests refused before any client call; lock-owned publication added a second fixture batch; its recycled page restored from Trash and all eight notes stayed AI-denied. Optional sharing remained unchanged.
- Light and dark rendered palette foreground **and link** contrast: **12.97:1** on the blue reference fixture. The rendered review found and fixed a theme-link color clash. Palette colors are Noted's local equivalents, not a claim to reproduce arbitrary Logseq custom CSS.
- Production TypeScript/Vite and Windows release builds passed. Existing Vite chunk-size notice remains. Ignored evidence: `output/private-presentation-*.log`, `private-background-tests.log`, `private-diagnostic-tests.log`, `private-palette-qa.log` and fixture screenshots under `output/playwright/`.

The selected personal import is still blocked by unavailable asset bytes and unsupported attachment/live-content semantics. No personal notes or import folder were published, no source file was modified, no private content was inspected by AI, and no hosted credential/access was enabled. Obtain a complete asset copy from the same snapshot before retrying; additional format adapters or an explicit local fidelity-review choice are still necessary. Full private-source counters stay out of this repository. See `logseq-sqlite.md` for the exact conversion boundary.

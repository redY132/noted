# Milestone verification — November 3, 2026

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

The hosted chat has no live Noted connection. Private tunnel/account/workspace availability, an approved runtime credential and installation/approval of the hosted plugin remain prerequisites. None were created or enabled. Personal default sharing remains off. A local Codex configuration alone does not connect this chat.

Automatic approval review rejected adding new in-app ChatGPT send-note controls and passive polling because a later direction deferred those actions. That UI edit did not execute. The unshipped native subscription/heartbeat source was preserved in ignored `output/deferred-subscription-source.json` and removed from the active build. Resuming that scope needs clarification; no indirect retry or extra model run was used. Existing request/reply/preview controls remain available to an explicitly connected agent.

Next product milestones: try user-chosen exported copies after reviewing the supported dialect/size limits; add richer attachment access and source-version fixtures; decide whether to resume subscription send controls; finish the hosted account/plugin setup if available; then choose reference hardware, release budgets, license and signing/installer distribution.

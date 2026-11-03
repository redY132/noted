# Rendered proposal validation

Document proposals now pass both native data/scope validation and a trusted, inert browser render before they can be applied. The Document API dialog shows the rendered candidate. Ordinary human editing remains available independently.

## Checked behavior

`render-validation.ts` renders the actual Tiptap projection using the bundled styles in isolated Shadow DOM. It does not alter the live editor, selection or Undo history. It checks both light and dark themes at narrow, current and wide content widths, waits for system fonts and owned images to decode, and measures real text-line/component rectangles.

The gate rejects:

- Authored text that is hidden, clipped, outside the bounded scrolling canvas, translucent or smaller than 10 px.
- Overlapping text, images and unrelated container surfaces, including nested and long-content cases missed by estimated heights.
- Missing/undecodable media and unsupported adapter properties that would disappear when projected into the editor.
- Unreadable text colors after composing foreground/background colors through ancestor surfaces. The policy uses 4.5:1 for ordinary text and 3:1 for large text, following [W3C's contrast-minimum guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

This is a conservative product gate, not full WCAG conformance certification. Overlap checks may reject artistic arrangements that a person deliberately created. They check the measured profiles, not every possible future viewport or future manual edit. A changed proposal, note, permission, theme or current content width requires a fresh preview.

The native capability binds an approved rendered preview to the exact candidate digest, note revision and fingerprint. Apply requires its matching one-use token. A stale candidate or changed operation batch cannot reuse a previous render approval. The browser preview adapter follows the same sequence. The renderer-attestation command is a trusted application channel; future AI integrations must receive the narrow proposal API, never this channel or unrestricted save/IPC access.

## Explicit supported scope

Automated document proposals containing interactive components or motion presets are refused. Motion presets must be set to None in the candidate or handled manually. Static validation cannot certify arbitrary future widget states, and scripts are never run merely to approve a layout. Direct human widget interactions, typing and layout tools continue to work. A future extension needs a defined stable component viewport/overflow contract before this restriction can be lifted.

Schema suggestion previews and application also use the rendered gate in the app. Enabling automatic schema rules or pinning an automatic version validates the existing candidate first. Future human typing remains immediate; validation is not run on each keystroke. Schema helpers are trusted application code, not an unrestricted AI editing interface.

Validation is bounded to 5,000 content objects, 20,000 editor nodes, 2,000,000 text characters, 50,000 measured regions and bounded spatial-bucket/comparison work. Larger or excessively dense notes fail closed and remain manually editable. Renderer instances and asset URLs are released after validation or cancellation.

## Verification

`scripts/render-validation-smoke.js` uses the real browser and bundled CSS to check long flowing text, nested grids, decoded/missing local media, low contrast, actual long-box overlap, clipping, motion-preset refusal, unsupported projections, inactive custom code and preservation of the live editor/history. Generate its isolated page with `node scripts/create-validation-harness.mjs` and serve it using the document harness on port 1430.

`scripts/document-proposal-smoke.js` checks the complete dialog flow: reject unreadable formatting, show a valid rendered preview, apply an accepted candidate and undo it. It supports the disposable browser adapter and native packaged IPC. Core tests verify that unapproved/stale proposals cannot commit. Existing document/schema/component regression tests remain part of `npm test` and `npm run test:core`.

Cloud AI is still not connected.

Final follow-up checks: 151 frontend tests, 54 Rust core tests, app/comparison TypeScript checks, and the Windows release build pass. Ten real-browser render cases and browser/native proposal apply/Undo checks pass. The packaged backup UI restored six disposable notes plus a saved relationship into a new window while preserving the active workspace; original document/schema/component save/reload checks also pass.

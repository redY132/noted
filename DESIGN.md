# Navigation direction

Source: the approved neutral Noted shell in SPEC.md and the November 5 dynamic sidebar request. Scope: navigation, not authored note presentation.

Reading this as a desktop writing navigator for people organizing connected notes, with a quiet graphite interface and a spatial folder-to-note-to-graph composition. Dials: ENERGY 1 / RHYTHM 2 / MOTION 2.

- Keep neutral surfaces and the existing user accent so navigation belongs to the current writing app and respects its theme preference.
- Use system sans-serif for navigation to distinguish controls from the document's authored typography.
- Let the hierarchy unfold at the selected branch. Indentation and disclosure controls show parentage without displaying every descendant at once.
- Place the compact note surface beside the selected folder and the graph to its right. Their positions explain the relationship between collection, notes and saved connections.
- Give floating surfaces one restrained shadow to separate them from the writing canvas. Do not add decorative cards, patterns, badges or illustrations.
- Use the accent and a visible outline for the selected folder and highlighted node. Keep node titles available to keyboard and pointer users.
- Bound graph rendering and edge queries to 60 notes, matching the existing API. Always include the hovered/focused note and report the actual displayed count.
- Keep notes in compact wrapping rows with scroll and incremental loading. Preserve autosave and editor identity when navigation opens or changes size.
- Stack the surfaces on narrow windows instead of forcing three thin columns. Closing navigation and entering Focus mode return space to writing.
- Use brief transitions to show where a branch or surface came from, and disable them under reduced motion.
- Folder names and moves use existing library storage. Folder icons are a device preference, like appearance, and the customization field states that scope. Icons identify collections; they are not decoration.

Verify with synthetic fixtures only. Do not load the private Logseq source, its assets or imported notes for any screenshot, graph or test.

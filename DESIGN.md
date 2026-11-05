# Navigation direction

Source: the approved neutral Noted shell and Redley's November 5 correction to the sidebar. Scope: navigation, not authored note presentation.

Reading this as a docked desktop directory for people organizing connected notes, with a quiet graphite interface and one continuous folder-to-note-to-graph surface. Dials: ENERGY 1 / RHYTHM 2 / MOTION 2.

- Keep neutral surfaces and the existing user accent so navigation belongs to the current writing app and respects its theme preference.
- Use system sans-serif for navigation to distinguish controls from the document's authored typography.
- Let the hierarchy unfold at the selected branch. Indentation and disclosure controls show parentage without displaying every descendant at once.
- Reserve real layout width on the left so opening navigation pushes the document right and closing it restores writing space. Do not overlay the document.
- Use one background without boxed areas, surface borders or shadows. Position and row hover explain the three roles.
- Connect the selected folder to the scrollable note directory with a branch line and note-row elbows. These paths express actual parentage, not decoration.
- Give the graph the majority of navigation width and keep it visible while browsing, opening notes and writing. Interpret the requested 15/10/50 proportions as approximate viewport shares, with remaining space for the document and minimum usable control widths.
- Use the accent and a visible outline for the selected folder and highlighted node. Keep node titles available to keyboard and pointer users.
- Bound graph rendering and edge queries to 60 notes, matching the existing API. Always include the hovered/focused note and report the actual displayed count.
- Keep notes in compact wrapping rows with scroll and incremental loading. Preserve autosave and editor identity when navigation opens or changes size.
- At desktop sizes keep folders, notes and graph side by side. On small screens or with large text put the folder tree above the notes/graph pair and push the document below; never cover it. Each long list scrolls independently, and resizing keeps the selected folder in view.
- Use brief transitions to show where a branch or surface came from, and disable them under reduced motion.
- Folder names and moves use existing library storage. Folder icons are a device preference, like appearance, and the customization field states that scope. Icons identify collections; they are not decoration.

Verify with synthetic fixtures only. Do not load the private Logseq source, its assets or imported notes for any screenshot, graph or test.

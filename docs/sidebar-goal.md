# Dynamic navigation panel

Status: corrected layout completed and verified November 5, 2026. See [behavior and verification](sidebar-navigation.md) and the [anti-slop delivery checks](sidebar-antislop-checks.md).

Replace the two independently opened sidebars with one docked navigation panel controlled by a single button. It opens from the left and pushes the document right. Use one continuous background, with implicit areas defined by position and hover. Expand the folder hierarchy as the user navigates; selecting a folder draws a directory-like branch into its scrollable notes. Keep the graph visible on the right and give it most of the panel. Treat the proposed 15/10/50 split as approximate visual proportions, retaining space for the document without adding another navigation section. Hovering or focusing a note title highlights its graph node. Preserve folder customization, keyboard access and existing note behavior.

Complete this goal when desktop and narrow-window checks cover nested folders, empty folders, long lists, resizing, mouse and keyboard highlighting, and folder customization. Keep the layout and interaction code easy to adjust in later design passes.

Use disposable fixtures for every screenshot, graph and interaction check. Do not access the private Logseq database, its assets, imported notes or their contents, or restart its import for this UI work. Preserve the existing AI access boundaries.

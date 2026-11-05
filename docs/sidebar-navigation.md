# Dynamic navigation panel

The November 5 goal replaces independent folder and note-list sidebars with one Browse control. The project direction is in `DESIGN.md`; the original acceptance goal remains in `sidebar-goal.md`.

## Behavior

- Browse opens or closes the hierarchy, note popup and collection graph together. View offers the same single navigation preference. Existing version-1/2 layout records migrate to version 3; either previously visible left panel keeps navigation available. Other panel preferences survive.
- Selecting a folder reveals its immediate children and a compact list of its direct notes. Ancestors stay visible. Disclosure buttons collapse branches; Arrow keys, Home and End navigate folder rows.
- A collection popup sizes to its contents, scrolls long lists and loads further pages on request. Names wrap. Folder search stays within the selected collection; All notes searches the workspace. Empty, loading and failure states explain what to do next.
- Saved connections float beside the popup on desktop. The graph uses actual saved edges, not AI suggestions. A bounded, collision-aware static layout avoids a continuous animation loop. It shows at most 60 loaded notes, reports the actual displayed/total counts and always includes the hovered or keyboard-focused note. Opening a graph node works by pointer or keyboard.
- Narrow windows stack the surfaces. The selected note popup scrolls into view; Back to folders restores the hierarchy. Desktop positioning clamps floating surfaces to the window, including its minimum 800 by 560 size.
- Opening a note, creating a note or clicking the editor closes the transient popup and graph while retaining the hierarchy. Browse reopens the selected collection. Escape returns focus to Browse; `/` reveals and focuses search. F8 hides/restores navigation without replacing the editor.
- Customize folder opens the selected folder's existing rename/move dialog. It also offers eight allowlisted icons. Names and parent changes belong to the library; icons are a device preference and are labeled accordingly. A stale folder draft cannot overwrite a newer saved change. Unavailable device storage keeps an icon for the session and explains the limitation.

## Implementation boundaries

`navigation-panel.ts` contains the collection/hierarchy controller, graph window and finite layout. `navigation-panel.css` owns the new surfaces, responsive rules, target sizes and reduced-motion behavior. `folder-appearance.ts` isolates the icon preference so a future workspace-backed icon store can replace it without changing navigation. `shell-ui.ts` retains ownership of visibility, Focus mode and legacy preference migration. Existing note loading, autosave, note creation, Trash, Review, agent settings and detailed connection editing remain in their existing controllers.

This UI change does not alter backend commands, access policy, credentials, the Logseq adapter, import state or any source data. All inspection, screenshots and interaction checks use explicitly synthetic browser data or a fresh `noted-sidebar-ui-*` Windows workspace/profile. Do not substitute the private graph or imported notes for these fixtures.

## Verification

Final result, November 5, 2026: **182 frontend tests passed; 101 native library tests passed with four optional model/corpus tests ignored.** The production Windows executable passed **62 recorded interaction checks** and **12 window/theme profiles**. No console errors were recorded. Rendered navigation text contrast measured at least **4.98:1 in Light** and **6.14:1 in Dark**. Six custom black/white/mid-gray hover and keyboard-focus probes passed; the minimum was **4.69:1**. New navigation controls met the 44-pixel target check, and 200% text reflow had no horizontal overflow. The [item-by-item anti-slop report](sidebar-antislop-checks.md) records the delivery gate and click-through evidence.

Run `npm run check`, the frontend suite with `--test-concurrency=1`, and the native library suite. The standalone sidebar tests cover hierarchy keyboard paths, bounded graph windows and hit-target spacing even with dense connections, stale edge responses, error/retry handling and device-icon fallback. Existing shell tests cover the unified state and migration while preserving editor identity.

The Playwright CLI fixtures are `sidebar-seed-preview.js` and `sidebar-seed-native.js`. `sidebar-smoke.js` exercises the actual controls across both themes and six window sizes, including long lists, deep hierarchy, real saved edges, rename/move/create, keyboard highlights, opening notes, Focus mode and reload persistence. `sidebar-fault-smoke.js` tests visible loading/error/retry and a conflicting folder edit in the isolated preview. `sidebar-visual-qa.js` measures rendered contrast, control sizes, focus boundaries and 200% text reflow. Logs and screenshots stay under ignored `output/`.

A busy companion can lock `noted-agent.exe` and prevent the ordinary desktop prebuild from replacing it. For this frontend-only change, build the frontend and then `cargo build --manifest-path src-tauri/Cargo.toml --release --features custom-protocol --bin noted`, retaining the unchanged companion. Do not stop another client or replace an executable in use. This is a Windows build constraint, not a change to client access.

The graph is an overview of a bounded loaded window, not an exhaustive graph of every note. Folder icons do not travel in library backups because they are device preferences. Physical low-end hardware acceptance remains separate and is not claimed by these developer-machine checks.

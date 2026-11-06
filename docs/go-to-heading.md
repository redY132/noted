# Go to heading

Choose **View > Go to heading** while a note is open. Search H1-H6 titles, move with the arrow keys and Enter, or select a row. Home and End move to the first and last displayed row. Long outlines load 40 rows at a time; Show more focuses the first new heading. Escape closes the dialog without changing the document selection or reading position.

The list follows the document's logical reading order, including headings inside rich-text objects and layout panels. Code containing `#` text is not a heading. The current heading is labelled. Displayed titles are bounded while search checks the full heading name. Titles are inserted as text.

Choosing a heading moves the caret and scrolls the mounted editor; it does not save, alter content, create an Undo entry or change dock visibility. Stable block IDs resolve a heading after edits. A removed, ambiguous or anonymous changed heading requires Refresh headings. The dialog retains only the open document snapshot while visible; it does not search other notes or use AI.

Block links now focus the editor before scrolling to their destination. An explicit block/heading jump cancels an earlier deferred note-start or history scroll, so opening another note cannot immediately scroll back to the top. Back/Forward still restores saved reading positions normally.

## Verification

239 frontend tests passed, including ten outline/model/UI cases. Production frontend and Windows release built. The browser and actual Windows webview each passed 17 synthetic interaction checks, six Light/Dark profiles at 1200, 800 and 390 pixels, and 200% text. Native minimum measured text contrast was 4.979:1 Light and 6.135:1 Dark; active targets, field boundaries, focus and overflow checks passed. Screenshots were manually reviewed.

The native 20-check session-history regression passed after the scrolling fix. Tests cover a 130-heading note, logical order differing from visual order, long and empty titles, filtering, paging, keyboard/modal behavior, unchanged saved revision, Undo, cancellation and cross-note block-link scrolling after deferred frames settle. All notes are disposable fixtures; no generation is requested.

This is a heading navigator, not full-text search, a permanently visible outline, or a restructuring tool. Use Find for note text and Open note for library search.

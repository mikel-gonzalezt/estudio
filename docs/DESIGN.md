# Estudio: a PDF reader built for studying

## Goals

1. Studying first. Reading is the start; the app exists to turn a PDF into understanding: highlights with meaning, notes linked to the page, flashcards reviewed on a schedule.
2. Fast and lightweight. Cold start under 1 s, only visible pages rendered, heavy code (export, flashcards) lazy-loaded.
3. PC first, tablets and phones next. One web codebase. Ships as an installable PWA today (works offline, own window on Windows). A Tauri shell can wrap the same `dist/` later for a native installer and mobile stores.

## Stack

- Vite + TypeScript (strict) + Svelte 5 (runes). Svelte compiles away, so the runtime stays small.
- `pdfjs-dist` for parsing, rendering, text layer, outline, search.
- `idb` for IndexedDB.
- `pdf-lib` only inside the export path, loaded with dynamic `import()`.
- `vite-plugin-pwa` for the service worker and manifest.
- CodeMirror 6 (`@codemirror/*`) for the notebook editor, loaded with dynamic `import()` the first time an editor mounts. `markdownLanguage` is used instead of `markdown()` so `@codemirror/lang-html` stays out of the bundle.
- Vitest for pure logic (scheduler, geometry, exporters). Playwright for end-to-end.

Why not Electron: 150 MB+ per install and slow cold start, against goal 2. Why not Tauri yet: needs Rust + MSVC on the dev machine; the web core is written so wrapping it later is a config change, not a rewrite.

## Data model

All positions are stored in PDF page space normalised to `[0,1]` (x right, y down, relative to the unrotated page box). They survive zoom, DPI and window size.

```ts
type DocId = string & { __brand: 'DocId' };        // pdf.js fingerprint of the file
type AnnId = string & { __brand: 'AnnId' };
type CardId = string & { __brand: 'CardId' };

interface Rect { x: number; y: number; w: number; h: number }  // normalised
interface Point { x: number; y: number; p: number }             // p = pen pressure 0..1

interface DocRecord {
  id: DocId; title: string; fileName: string; pageCount: number;
  lastPage: number; lastZoom: number; pagesSeen: number[];      // reading progress
  addedAt: number; openedAt: number; readingMs: number;
  handle?: FileSystemFileHandle;                                // reopen without picker (Chromium)
}

type Annotation =
  | { kind: 'highlight' | 'underline' | 'strike'; page: number; rects: Rect[]; text: string; color: ColorId; note: string }
  | { kind: 'ink'; page: number; strokes: { color: string; width: number; points: Point[] }[] }
  | { kind: 'note'; page: number; at: { x: number; y: number }; note: string; color: ColorId }
  | { kind: 'area'; page: number; rect: Rect; note: string; color: ColorId };  // figure / equation clip
// persisted as Annotation & { id: AnnId; docId: DocId; tags: string[]; createdAt: number; updatedAt: number }

type ColorId = 'yellow' | 'green' | 'blue' | 'pink' | 'orange' | 'purple';
// Each colour carries a user-editable meaning. Defaults: yellow Important, green Definition,
// blue Example, pink Doubt / review, orange Formula, purple Personal idea.

interface Notebook { docId: DocId; markdown: string; updatedAt: number }
// Markdown with page links. Read: [[p12]], [[p12|label]], and Obsidian's [[file.pdf#page=12]] /
// [[file.pdf#page=12|label]] (only the page is a target). Written only by formatPageLink() in
// src/lib/pagelink.ts, currently as [[p12]] or [[p12|label]].

interface Card {
  id: CardId; docId: DocId; annId?: AnnId; page: number;
  front: string; back: string;                  // cloze cards use {{c1::answer}} in front, back empty
  srs: { due: number; stability: number; difficulty: number; reps: number; lapses: number; state: 'new'|'learning'|'review'|'relearning'; last?: number };
}
```

IndexedDB stores: `docs`, `annotations` (index `docId`), `notebooks`, `cards` (indexes `docId`, `due`), `settings`, `handles`.

Scheduling uses FSRS (v4/5 default parameters), the algorithm current Anki uses. Pure functions, unit-tested.

## Features (v1, PC)

Reading
- Open by drag-drop, file picker, or recent-files library (with progress bar per document).
- Virtualised continuous scroll. Render only visible pages plus one ahead; release canvases far away. HiDPI aware.
- Zoom (Ctrl+wheel, Ctrl +/-, fit width, fit page, fit text width), go to page, back/forward history for jumps (Alt+Left).
- Outline (TOC) sidebar, page thumbnails, in-document search with highlighted hits.
- Themes: light, dark UI, and page modes: normal, dark (inverted pages), sepia.
- Fit text width (`w`, the toolbar button, or a two-finger tap on touch screens) scales the current page's text column to the viewport and centres it, cropping the margins out of view. The column is the union of the page's horizontal text boxes (rotated margin stamps are ignored; a page without text uses the full page), cached per page. Pressing it again returns to the previous zoom.
- Resume at last page and zoom. Reading timer per document.
- Hover a link to a figure/section to preview its destination (Sioyek "smart jump" style) — internal links only in v1.
- When the hovered link lands on a bibliography entry, the preview shows the entry as text instead of a page crop. The entry is read from the destination page's text, from the destination down to the next entry. It offers "Open paper" for a DOI, arXiv id or URL found in the entry, otherwise "Search Scholar" with the likely title. The preview stays open while the pointer moves onto it.

Annotating
- Tools: select, highlight, underline, strikethrough, pen (pressure-aware, pointer events so a tablet stylus works), eraser, sticky note, area clip.
- Six semantic colours with editable meanings. Keys `1`–`6` pick colour.
- Every annotation can hold a note and tags. Undo / redo (Ctrl+Z / Ctrl+Y) for all annotation edits.
- Annotations sidebar: list with text, note, page; filter by colour, tag, kind; full-text search; click to jump.

Studying
- Notebook pane per document (markdown, live preview). "Quote to notebook" on any selection or annotation inserts a blockquote with a `[[pN]]` back-link.
- Page links show as compact chips in the editor ("p. 12" or their label). Clicking a chip, or Ctrl/Cmd+clicking link text, jumps the reader. Ctrl+L inserts a link to the page on screen.
- Typing `[[` opens a completion list: the current page first, then outline sections (link labelled with the section title), then annotations whose text matches what was typed (labelled with an excerpt).
- Dragging an annotation from the sidebar, or selected page text, into the editor drops a blockquote with a page link at that spot.
- Auto page links (toggle in the notebook header, on by default, stored in settings): Enter at the end of a non-empty line, or the first keystroke into an empty notebook, starts the new paragraph with a chip for the page being read when that page differs from the nearest link above. It never fires on undo, redo, paste or drop, nor inside a blockquote.
- Pop-out: the notebook opens in its own window (`#/notebook/<docId>`, which renders only the editor). The pane shows a placeholder until the window closes. Page links clicked there jump the reader. Both windows share text over a `BroadcastChannel` with last-edit-wins: each local edit bumps a revision `(n, windowId)`, a window adopts incoming text only when that revision is newer, and only the author of the newest revision writes it to IndexedDB, so neither window saves stale text over the other's edit (`src/lib/notebooksync.ts`).

Layout
- The sidebar and the study pane have drag handles. Widths are clamped (sidebar 180 to 520 px, study pane 260 px up to leaving the page view 320 px), saved in settings, and reset by double-clicking the handle. Handles are focusable: arrow keys move them 16 px (64 with Shift), Home/End jump to the limits.
- While a handle is dragged the page view keeps its zoom; fit-width, fit-page and fit-text re-fit once on release.
- Widen notebook (`W`, or the header button) gives the study pane 60% of the window.
- Flashcards from a selection or annotation: basic (front/back) or cloze. Review screen with Again/Hard/Good/Easy and FSRS scheduling; due count badge; review scoped to a document or all documents.
- Focus mode (hides chrome) and reading ruler (dims everything but a band that follows the cursor).
- Pomodoro timer in the status bar.

Keyboard and discovery
- Command palette (Ctrl+K) listing every action with its shortcut.
- `j/k` scroll, `J/K` or PgDn/PgUp page, `g` go to page, `h` highlight tool, `u` underline, `p` pen, `n` note, `e` eraser, `v`/Esc select, `1`–`6` colour, `/` or Ctrl+F search, `f` focus mode, `r` ruler, `b` toggle sidebar, `W` widen notebook. In the notebook editor: Ctrl+L link current page, `[[` link completion.

Export and safety
- Export highlights + notes + notebook to Markdown (Obsidian-friendly).
- Export annotated PDF: annotations written as real PDF annotation objects (highlight/underline/strikeout/ink/text), so they open in Acrobat, Zotero and others.
- Full JSON backup and restore of the database.

## Later (tablet / mobile / v2)

Tauri shell; touch gestures (pinch zoom, two-finger scroll while pen draws); split view of the same document; "portals" (pin a figure next to the text that references it); cross-document concept map; OCR for scanned PDFs; optional AI explain/summarise of a selection; sync.

# Estudio: a PDF reader built for studying

## Goals

1. Studying first. Reading is the start; the app exists to turn a PDF into understanding: highlights with meaning, notes linked to the page, flashcards reviewed on a schedule.
2. Fast and lightweight. Cold start under 1 s, only visible pages rendered, heavy code (export, flashcards) lazy-loaded.
3. PC first, tablets and phones next. One web codebase. Ships as an installable PWA today (works offline, own window on Windows, registered as a PDF handler). A Tauri shell can wrap the same `dist/` later for a native installer and mobile stores.
4. Your files stay yours. A PDF opened from disk carries its own annotations, readable by any other PDF reader, and a vault is a plain folder that Obsidian can open too.

## Stack

- Vite + TypeScript (strict) + Svelte 5 (runes). Svelte compiles away, so the runtime stays small.
- `pdfjs-dist` for parsing, rendering, text layer, outline, search.
- `idb` for IndexedDB.
- `pdf-lib` for reading and writing annotations inside PDF files. It runs in a Web Worker (`src/lib/pdfannots.worker.ts`) when saving to a file, and is loaded with dynamic `import()` for exports; it is never in the initial chunk.
- `docx`, `temml` and `mdast-util-from-markdown` (with the GFM and maths extensions) for "Notes as Word (.docx)" (`src/lib/export/docx.ts`). Formulas become native Word equations through LaTeX → MathML (temml) → OMML (`src/lib/export/omml.ts`); MathML outside that mapping is drawn to a PNG by the browser instead. All of it sits in one chunk loaded with dynamic `import()` when the export runs.
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
  handle?: FileSystemFileHandle;                                // reopen without picker, and save into (Chromium)
  syncBase?: Record<AnnId, number>;                             // each annotation's updatedAt when `handle`'s file and Estudio last agreed
}

interface Vault { id: VaultId; name: string; handle: FileSystemDirectoryHandle; addedAt: number; openedAt: number }

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
// [[file.pdf#page=12|label]]. Written only by formatPageLink() in src/lib/pagelink.ts: [[p12]] or
// [[p12|label]], and [[paper.pdf#page=12|label or p. 12]] in a vault notebook so Obsidian can follow it.

interface Card {
  id: CardId; docId: DocId; annId?: AnnId; page: number;
  front: string; back: string;                  // cloze cards use {{c1::answer}} in front, back empty
  srs: { due: number; stability: number; difficulty: number; reps: number; lapses: number; state: 'new'|'learning'|'review'|'relearning'; last?: number };
}
```

IndexedDB stores (version 2): `docs`, `annotations` (index `docId`), `notebooks`, `cards` (indexes `docId`, `due`), `settings`, `handles`, `vaults`.

## Files, saving and identity

A document opened with a writable `FileSystemFileHandle` (file-handler launch, the Open PDF picker, drag-drop from Explorer, or a vault) keeps its annotations inside the PDF.

- Format. `src/lib/pdfannots.ts` maps each annotation to a standard object: highlight, underline and strikethrough to `/Highlight`, `/Underline`, `/StrikeOut` with `/QuadPoints`; drawings to `/Ink`; sticky notes to `/Text`; area clips to `/Square`. `/NM` holds the `AnnId`, `/Contents` the note, `/Subj` the colour meaning and tags, and `/EstudioData` a JSON string with what only Estudio needs (colour id, tags, highlighted text, per-point pen pressure and stroke colours, kind, timestamps). Geometry is always read back from the standard fields, so an annotation moved in another app moves in Estudio too.
- Ownership. Estudio reads and rewrites every annotation of those six subtypes, except hidden ones and `/Text` replies (`/IRT`). Markup made by other apps is imported on open (its colour snapped to the nearest `ColorId`, `/Contents` as the note, `/NM` or `pdf-<obj>-<gen>` as the id) and is Estudio's from then on. Links, form fields, stamps and everything else are left untouched. The imported objects are marked `noView` in pdf.js's annotation storage and every render uses `AnnotationMode.ENABLE_STORAGE`, so they are not painted twice.
- Identity. `DocId` stays the pdf.js fingerprint. pdf.js derives it from the first trailer `/ID` when that is a valid 16-byte string, otherwise from the MD5 of the first 1024 bytes. pdf-lib rewrites the whole file, which would change those bytes, so every write pins `/ID[0]` to the bytes the source was fingerprinted by, and gives `/ID[1]` fresh random bytes as the spec asks of a modified file. Tests check the fingerprint is identical across saves for a file with and without an `/ID`.
- Saving. `FileSync` (`src/reader/filesync.svelte.ts`) writes a few seconds after the last edit, when the reader closes and when the window is hidden. Each save re-reads the file and runs a three-way merge (`src/lib/annmerge.ts`) against `syncBase`: the newer `updatedAt` wins, an edit beats a deletion on the other side, and additions from both sides are kept. A file changed by another app since it was loaded is merged, not clobbered; this subsumes a `lastModified` check. The write goes through `createWritable()`, which Chromium stages in a temporary file and swaps in on `close()`, so a crash leaves the old PDF intact. IndexedDB is written first on every edit and stays the durable copy until a file write succeeds.
- Permission. Writing needs `readwrite` permission, and asking needs a user gesture. Without it the status bar shows "Unsaved (click to allow)"; clicking grants access and saves. Reopening from the library asks for `readwrite` in the same click.
- `syncBase` belongs to the file at `DocRecord.handle`. Opening the same paper from a different file (`isSameEntry` false) starts from an empty base, which merges by union and never deletes.
- Files without a handle (plain `<input>`, non-Chromium browsers) keep the IndexedDB-only behaviour; "Export annotated PDF" writes a copy through the same writer, keeping annotations other apps left in the file.

## Vaults

A vault is a folder picked with `showDirectoryPicker({ mode: 'readwrite' })`, like an Obsidian vault. Handles live in the `vaults` store; after a restart a vault whose grant lapsed shows "Allow access", one click. The last opened vault reopens on start when its grant is still valid.

- The tree is a pure map from vault path to node (`src/lib/vaulttree.ts`, tested): folders first, natural name order, only `.pdf` and `.md` files, dotfiles and dot-folders (`.obsidian/`, `.estudio/`) ignored. `src/lib/vault.ts` is the file-system boundary: walking, create, move (native `move()` with a copy-and-delete fallback), delete.
- The Files tree shows on the library and as the reader's Files tab: open, new folder, new note, rename (F2), move by drag and drop, delete (Del, confirmed), import PDFs by picker or by dropping files on a folder. Renaming or moving a PDF takes a same-named notebook beside it along.
- Page links in a notebook file are written as `[[<name>.pdf#page=N|label or p. N]]`, which Obsidian follows. Every writer (Ctrl+L, `[[` completion, auto links, drag-in and "Quote to notebook") goes through `formatPageLink(page, label?, pdfName?)` in `src/lib/pagelink.ts`, given the PDF name by the notebook's `NotebookDoc`.
- Where a notebook lives is a `NotebookHome` (`src/lib/notebookstore.ts`): the database, or a vault id, the notebook's vault path and the PDF's file name. The pop-out route carries the home (`#/notebook/<docId>?vault=<id>&note=<path>&pdf=<name>`), and the pop-out window looks the vault up in IndexedDB and writes the same `.md`. If the vault's grant has lapsed it shows "Allow access to <vault>" (asking needs a click). If the vault was removed from Estudio it says so and shows no editor rather than saving somewhere the reader would not read.
- A standalone `.md` note opens full width in the same CodeMirror editor beside the tree. A note has no page on screen, so Ctrl+L, auto links and "Current page" are off. Clicking a link that names a PDF opens it from the vault at that page. The target resolves as in Obsidian: a path relative to the note's folder, then to the vault root, then any PDF whose path ends with the target, preferring the note's folder and then the shortest path (`resolvePdfLink` in `src/lib/vaulttree.ts`). In a PDF's notebook, a link naming a different vault PDF opens that PDF the same way; other links jump within the document.
- A PDF opened from anywhere (launch, picker) that lies inside the open vault is treated as a vault file.

## Notebook pairing

PDFs and notes can live apart, for example PDFs in one vault and notes in an Obsidian vault opened in Estudio as a second vault. A notebook is paired with its PDF by the document's identity, not by file name, so the pairing survives moving or renaming the note anywhere Estudio can read.

- A notebook file carries YAML frontmatter that names its document. `estudio-doc` is the `DocId` (the pdf.js fingerprint, see Files, saving and identity), and `pdf` is the PDF's name as a wiki link, which Obsidian shows as a property.

  ```yaml
  ---
  estudio-doc: ff3e15dfc6c8c63548b1c64bc2982fdb
  pdf: "[[attention.pdf]]"
  tags: [ml]          # anything else the user adds is kept
  ---
  ```

  The editor shows only the body. Each save re-reads the file, keeps every other key (multi-line ones included), and writes Estudio's two keys first, so writing twice gives the same text (`src/lib/frontmatter.ts`, tested). A file at the planned path whose frontmatter names another document is never overwritten; the notebook takes `name (2).md` instead.
- The notebook index (`src/lib/notebookindex.ts`) maps `DocId` to a vault and path across every vault Estudio can read, not only the open one. It is built when a vault is opened or its access is granted, by reading just the first 2 KB of each `.md` (`markdownHeads` in `src/lib/vault.ts`); dot-folders are skipped. Estudio's own saves, renames, moves and deletes update it. It is persisted in the `settings` store under `notebookIndex`, so a notebook in a vault whose grant lapsed is still known after a restart.
- Opening a document looks up its notebook (`NotebookIndex.locate`, tested against an in-memory file system):
  1. The indexed file, after checking that its frontmatter still names the document. If it does not (the file was moved or deleted outside Estudio), every readable vault is scanned again.
  2. For a vault PDF, a `<name>.md` beside it whose frontmatter names no document, or this one. A notebook from before frontmatter is adopted this way and gains frontmatter on its next save.
  3. A new `<pdf name>.md`, made unique, where new notebooks go. That setting lives in the notebook pane's ⋯ menu (also "Notebook location" in the command palette): "Next to the PDF", the default, or a folder in a chosen vault, created when first needed. With "Next to the PDF", a PDF outside any vault keeps its notebook in IndexedDB.
  4. Otherwise IndexedDB.

  A notebook indexed in a vault Estudio cannot read right now is still returned, and the pane shows "Allow access to <vault>" instead of starting a second notebook.
- A new notebook file is created on the first edit. Until then an older IndexedDB notebook for the document is shown, and the first edit writes it into the file.
- "Move notebook to a vault…" in the ⋯ menu writes an IndexedDB notebook into a chosen vault folder with its frontmatter, rewrites its `[[pN]]` links to name the PDF, and keeps editing the file. The IndexedDB copy is left as it was.
- While a document is open, its store asks the index where the file is before each save. A note moved or renamed in Estudio's Files tree keeps being written in its new place, and a note that vanished is looked for again before it would be recreated.
- Renaming or moving a PDF in the Files tree still takes a same-named `.md` beside it along. A notebook kept elsewhere stays where it is; its `pdf:` property is refreshed on its next save.

## Installing and updating

The manifest registers Estudio for `application/pdf` / `.pdf` (`file_handlers`) with `launch_handler: focus-existing`, so a PDF opened from Explorer arrives through `launchQueue` in the window that is already open. The library shows "Install Estudio" while the browser offers installation. The service worker precaches the app shell, the reader and note chunks, the pdf.js worker, the pdf-lib worker, and pdf.js cmaps, standard fonts and wasm decoders, so the installed app opens and saves PDFs with the local server stopped. Updates use prompt mode: a new version waits while a document is open and is applied (one reload) once the library is showing and pending saves have finished.

Scheduling uses FSRS (v4/5 default parameters), the algorithm current Anki uses. Pure functions, unit-tested.

## Features (v1, PC)

Reading
- Open by drag-drop, file picker, "Open with" from Explorer once installed, a vault's Files tree, or the recent-files library (with progress bar per document).
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
- Editing works like Obsidian's. Brackets and double quotes close themselves, and typing `*`, `_` or `` ` `` over a selection wraps it. Enter continues bullet, numbered and checkbox lists (renumbering numbered ones), Enter on an empty item ends the list, Backspace after an empty item's marker removes it, and Tab / Shift+Tab indent and outdent. Ctrl+B, Ctrl+I, Ctrl+Shift+X, Ctrl+E and Ctrl+Shift+H toggle bold, italic, strikethrough, inline code and `==highlight==`; Ctrl+Enter toggles a checkbox, and clicking `[ ]` does too. The text transforms are pure functions in `src/lib/mdedit.ts`; the CodeMirror wiring is `src/reader/notebook/mdediting.ts`.
- A light live preview styles the Markdown without hiding any character: headings are larger, emphasis, strikethrough, highlights and code are styled, and their markers are dimmed. The preview pane renders `==text==` as a highlight.
- Page links show as compact chips in the editor ("p. 12" or their label). Clicking a chip, or Ctrl/Cmd+clicking link text, jumps the reader. Ctrl+L inserts a link to the page on screen.
- Typing `[[` opens a completion list: the current page first, then outline sections (link labelled with the section title), then annotations whose text matches what was typed (labelled with an excerpt).
- Dragging an annotation from the sidebar, or selected page text, into the editor drops a blockquote with a page link at that spot.
- Auto page links (toggle in the notebook header, on by default, stored in settings): Enter at the end of a non-empty line, or the first keystroke into an empty notebook, starts the new paragraph with a chip for the page being read when that page differs from the nearest link above. It never fires on undo, redo, paste or drop, nor inside a blockquote.
- Pop-out: the notebook opens in its own window (`#/notebook/<docId>`, which renders only the editor; vault notebooks add the vault, the notebook path and the PDF name, see Vaults). The pane shows a placeholder until the window closes. Page links clicked there jump the reader. Both windows share text over a `BroadcastChannel` with last-edit-wins: each local edit bumps a revision `(n, windowId)`, a window adopts incoming text only when that revision is newer, and only the author of the newest revision writes it to the notebook's store (IndexedDB or the vault `.md`), so neither window saves stale text over the other's edit (`src/lib/notebooksync.ts`).

Layout
- The sidebar and the study pane have drag handles. Widths are clamped (sidebar 180 to 520 px, study pane 260 px up to leaving the page view 320 px), saved in settings, and reset by double-clicking the handle. Handles are focusable: arrow keys move them 16 px (64 with Shift), Home/End jump to the limits.
- While a handle is dragged the page view keeps its zoom; fit-width, fit-page and fit-text re-fit once on release.
- Widen notebook (`W`, or the header button) gives the study pane 60% of the window.
- Flashcards from a selection or annotation: basic (front/back) or cloze. Review screen with Again/Hard/Good/Easy and FSRS scheduling; due count badge; review scoped to a document or all documents.
- Focus mode (hides chrome) and reading ruler (dims everything but a band that follows the cursor).
- Pomodoro timer in the status bar.

Keyboard and discovery
- Command palette (Ctrl+K) listing every action with its shortcut.
- `j/k` scroll, `J/K` or PgDn/PgUp page, `g` go to page, `h` highlight tool, `u` underline, `p` pen, `n` note, `e` eraser, `v`/Esc select, `1`–`6` colour, `/` or Ctrl+F search, `f` focus mode, `r` ruler, `b` toggle sidebar, `W` widen notebook. In the notebook editor: Ctrl+L link current page, `[[` link completion, and the formatting keys above. The editor keeps its own keys: reader shortcuts never fire while typing in it.

Export and safety
- Export highlights + notes + notebook to Markdown (Obsidian-friendly).
- Export the notebook alone ("Notes only (.md)"): its text without frontmatter, annotations or cards, with page links turned into plain references, `(p. 12)` or `Intro (p. 12)` for a labelled link (`exportNotes` in `src/lib/export/markdown.ts`).
- Annotations are saved into the PDF itself when it was opened from disk (see Files, saving and identity), as real annotation objects that Acrobat, Zotero and others show. Export annotated PDF writes the same objects into a copy for files opened without a handle.
- Full JSON backup and restore of the database.

## Known limitations

- Cards, reading progress, reading time and settings stay in IndexedDB, keyed by `DocId`. They are not in the vault, so they do not travel with the folder to another machine or browser profile; the JSON backup covers them.
- Every copy of the same paper has the same `DocId`, so copies share one set of annotations, and opening another copy writes them into it too.
- pdf-lib rewrites the whole file. Encrypted PDFs (including owner-password-only ones) are not written: annotations stay in Estudio and the status bar says so. Digital signatures are invalidated by a rewrite; incremental updates would avoid that, but pdf-lib does not produce them.
- Each save parses and serialises the PDF in the worker. The page stays responsive, but for books of tens of MB a save takes seconds.
- Imported markup has no highlighted text (other apps do not store it), so the annotations list shows it without a quote.
- A vault notebook's body is overwritten on save without checking whether Obsidian changed it meanwhile (its frontmatter is re-read and kept), and renaming a PDF does not rewrite links to it in other notes.
- Two notes whose frontmatter names the same document: the index keeps the one with the shortest path, in the first vault scanned. Notes moved into a vault by another app while Estudio runs are found when a document's indexed note goes missing, not before.
- A PDF opened without a handle is rendered with its own annotation objects; if it was exported by Estudio, its annotations are drawn twice.

## Later (tablet / mobile / v2)

Tauri shell; touch gestures (pinch zoom, two-finger scroll while pen draws); split view of the same document; "portals" (pin a figure next to the text that references it); cross-document concept map; OCR for scanned PDFs; optional AI explain/summarise of a selection; sync.

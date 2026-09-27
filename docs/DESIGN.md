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
- CodeMirror 6 (`@codemirror/*`) for the notebook's Markdown mode, loaded with dynamic `import()` the first time an editor mounts. `markdownLanguage` is used instead of `markdown()` so `@codemirror/lang-html` stays out of the bundle.
- TipTap 3 (`@tiptap/*`, ProseMirror underneath) with `@tiptap/markdown` for the notebook's Document mode, KaTeX for typeset maths, MathLive for the visual formula editor. Each is loaded with dynamic `import()` on first use; none is in the initial chunk (see Notebook editing).
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
  pins?: AnnId[];                                               // area clips pinned to the figure panel (see Pinned figures)
}

interface Vault { id: VaultId; name: string; handle: FileSystemDirectoryHandle; addedAt: number; openedAt: number; pdfFolder?: true }

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

IndexedDB stores (version 3): `docs`, `annotations` (index `docId`), `notebooks`, `cards` (indexes `docId`, `due`), `settings`, `handles`, `vaults`, `attachments` (images of notebooks kept in IndexedDB: `{ id, blob, name, createdAt }`).

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
- A PDF folder is a `Vault` record with `pdfFolder: true`. It is a folder of PDFs opened from outside any vault, granted once so their notebooks sit beside them (see Notebook pairing). It reuses the vault machinery (the stored handle, "Allow access" after a restart, `NotebookHome`, the pop-out's lookup), but it is kept in `vaults.grants`, not `vaults.list`, so it never shows in the vault list or as a Files tree. The index attaches it without walking it (`NotebookIndex.attach`), because it may be Downloads.

## Notebook pairing

PDFs and notes can live apart, for example PDFs in one vault and notes in an Obsidian vault opened in Estudio as a second vault. A notebook is paired with its PDF by the document's identity, not by file name, so the pairing survives moving or renaming the note anywhere Estudio can read.

- A notebook file carries YAML frontmatter that names its document. `estudio-doc` is the `DocId` (the pdf.js fingerprint, see Files, saving and identity), and `pdf` is the PDF's name as a wiki link, which Obsidian shows as a property.

  ```yaml
  ---
  estudio-doc: ff3e15dfc6c8c63548b1c64bc2982fdb
  pdf: "[[sample-study.pdf]]"
  tags: [biology]     # anything else the user adds is kept
  ---
  ```

  The editor shows only the body. Each save re-reads the file, keeps every other key (multi-line ones included), and writes Estudio's two keys first, so writing twice gives the same text (`src/lib/frontmatter.ts`, tested). A file at the planned path whose frontmatter names another document is never overwritten; the notebook takes `name (2).md` instead.
- The notebook index (`src/lib/notebookindex.ts`) maps `DocId` to a vault and path across every vault Estudio can read, not only the open one. It is built when a vault is opened or its access is granted, by reading just the first 2 KB of each `.md` (`markdownHeads` in `src/lib/vault.ts`); dot-folders are skipped. Estudio's own saves, renames, moves and deletes update it. It is persisted in the `settings` store under `notebookIndex`, so a notebook in a vault whose grant lapsed is still known after a restart.
- Opening a document looks up its notebook (`NotebookIndex.locate`, tested against an in-memory file system):
  1. The indexed file, after checking that its frontmatter still names the document. If it does not (the file was moved or deleted outside Estudio), every readable vault is scanned again. For a PDF in a granted PDF folder, only the `.md` files directly in the PDF's own folder are read first. A PDF folder is never scanned whole.
  2. For a PDF in a vault or a granted PDF folder, a `<name>.md` beside it whose frontmatter names no document, or this one. A notebook from before frontmatter is adopted this way and gains frontmatter on its next save.
  3. A new `<pdf name>.md`, made unique, where new notebooks go. That setting lives in the notebook pane's ⋯ menu (also "Notebook location" in the command palette): "Next to the PDF", the default, or a folder in a chosen vault, created when first needed. With "Next to the PDF", a PDF outside any vault gets its notebook beside it when its folder was granted. Otherwise the notebook stays in IndexedDB until the user saves it as a file (below).
  4. Otherwise IndexedDB.

  A notebook indexed in a vault Estudio cannot read right now is still returned, and the pane shows "Allow access to <vault>" instead of starting a second notebook.
- A new notebook file is created on the first edit. Until then an older IndexedDB notebook for the document is shown, and the first edit writes it into the file.
- "Move notebook to a vault…" in the ⋯ menu writes an IndexedDB notebook into a chosen vault folder with its frontmatter, rewrites its `[[pN]]` links to name the PDF, and keeps editing the file. The IndexedDB copy is left as it was. If a write fails, the files written so far are removed and the IndexedDB notebook stays in use.
- Save as file. What the ⋯ menu offers for a notebook kept inside Estudio is a pure table (`fileOffer` in `src/lib/notebookoffer.ts`, tested). For a PDF outside any vault, while new notebooks go "Next to the PDF", the header shows "Saved inside Estudio · Save as file", which opens the menu.
  - With a file handle (Open with, Open PDF, drag and drop), the menu offers "Next to the PDF" and "In a vault folder…". "Next to the PDF" uses a granted PDF folder that holds the PDF, asking for access again if it lapsed. Otherwise it calls `showDirectoryPicker({ mode: 'readwrite', startIn: <the PDF's handle>, id: 'pdf-folder' })` from the click. The picked folder must hold the PDF, either among its entries (`isSameEntry`) or below it (`resolve`); see `placeIn` in `src/lib/vault.ts`. If it does not, the menu says so and nothing is written or kept. The notebook then moves to `<pdf name>.md` beside the PDF by the same code as "Move notebook to a vault…". The folder is kept as a PDF folder, so later PDFs in it or its subfolders get their notebook beside them without asking.
  - Without a handle (the plain file input), the menu offers "In a vault folder…" and "Notes only (.md)", with a line saying why the notebook cannot go next to the PDF.
- While a document is open, its store asks the index where the file is before each save. A note moved or renamed in Estudio's Files tree keeps being written in its new place, and a note that vanished is looked for again before it would be recreated.
- Renaming or moving a PDF in the Files tree still takes a same-named `.md` beside it along. A notebook kept elsewhere stays where it is; its `pdf:` property is refreshed on its next save.

## Notebook editing

Notes stay Markdown (the contract is `docs/NOTES-FORMAT.md`). There are two ways to edit the same text, chosen by the Document / Markdown switch in the notebook header and stored in settings (`editorMode`, default `document`):

- Markdown mode is the CodeMirror editor (`src/reader/notebook/cm.ts`).
- Document mode (`src/reader/notebook/docmode/`) is a WYSIWYG editor with a formatting toolbar. It and everything it needs are loaded with dynamic `import()` the first time it is shown.

Both editors take the same `EditorHooks` and return the same `NotebookEditor` (`src/reader/notebook/links.ts`), so the notebook's `NotebookDoc`, pop-out sync, saving and vault handling do not know which one is showing. Link suggestions after `[[` (`linkOptions`), every new link (`formatPageLink`), auto page links (`isFirstKeystroke` and the `pageAbove` rule), dropped quotes (`quoteBlock`) and image paste (`imageFiles`, `NoteFiles.save`) are shared code; each editor only adapts them to its own document model.

### Choosing the Document-mode editor

A time-boxed spike compared Milkdown 7.22 and TipTap 3.31 with `@tiptap/markdown`, on a corpus with one entry per row of NOTES-FORMAT.md, before any custom nodes were written.

| Criterion (in order) | Milkdown (kit: commonmark + gfm, or the Crepe preset) | TipTap + `@tiptap/markdown` |
|---|---|---|
| Round trip, parse then serialise, out of the box | 5 of 16 unchanged. Bullets and tasks written with `*`, rules as `***` (both configurable), page links escaped (`\[\[p3]]`), tables re-padded, and parsing an image without a title threw. | 9 of 16 unchanged. Nested lists indented by 2 (configurable to 4), page links escaped, tables re-padded. |
| Custom inline node (page-link chip) | A micromark syntax extension plus mdast handlers for remark: a second grammar to keep in step with the preview's marked tokenizer. | `markdownTokenizer` takes a marked tokenizer, the same library and patterns the preview uses (`pageLinkAtStart`, `inlineMathAt`); `parseMarkdown` and `renderMarkdown` are a few lines each. |
| Table editing | prosemirror-tables; a table UI only in Crepe. | prosemirror-tables through TableKit: Tab and Shift+Tab, add and delete rows and columns as commands. |
| Lazy bundle (gzip) | Kit about 150 kB; Crepe about 400 kB plus CodeMirror language chunks. | About 171 kB in the spike; the shipped Document-mode chunk is 149 kB. |

TipTap was chosen. It round-trips more of the format as shipped, its custom nodes reuse the preview's tokenizers, and it costs about the same as Milkdown's kit. Crepe, the Milkdown preset with tables and maths built in, is more than twice the size.

### Keeping notes as they were written

No Markdown serialiser reproduces every source byte, so Document mode does not rely on one for text the user did not touch.

- Parsing (`DocMarkdown.parse` in `docmode/markdown.ts`) splits the body into top-level blocks with the marked lexer. Each block keeps its source, with the blank lines after it, and the nodes it parsed into. The frontmatter is kept verbatim and never shown.
- Serialising walks the document's top-level nodes. A node that is structurally equal (`Node.eq`) to a parsed block's nodes writes that block's source; anything else is written fresh by the serialiser. An untouched note therefore comes back byte for byte, and an edit rewrites only its own block.
- The editor serialises only after a transaction the user made. Loading a note, switching modes and text arriving from the pop-out never write.
- The corpus test (`docmode/markdown.test.ts`) checks both halves: every entry round-trips unchanged, and the fresh serialiser writes each syntax in the contract's form, apart from the normalisations NOTES-FORMAT.md lists.
- Fresh text is escaped only where Markdown would read it as markup (`src/lib/mdescape.ts`), so "a_b", "2 * 3" and "[x]" stay as typed. A test types each awkward literal and reads it back as the same plain text.

Custom nodes live in `docmode/schema.ts`. `pageLink` is an atom chip, clicked to follow. `inlineMath` and `blockMath` are typeset with KaTeX and open the formula editor when clicked. `image` is inline, so `![Figure](…) [[p4]]` stays on one line. `embed` shows `![[name.png]]` and writes it back as it was. The table's cells hold one paragraph, and its Markdown has aligned pipes (`formatTable` in `src/lib/mdtable.ts`, the same function as Markdown mode's Format table). A line break inside a paragraph is written as a newline, as the preview (`breaks: true`) reads it.

### Images

`src/lib/attachments.ts` owns images. `NoteFiles` is where a note's images go and how its references resolve. Every consumer gets the `ImageResolver` described in NOTES-FORMAT.md from `NoteFiles.resolve` (bytes, MIME type, pixel size).

- `vaultFiles` writes `attachments/Pasted image YYYYMMDDHHmmss.png` beside the note (a free `name (2).png` when taken) and returns a relative, `%20`-encoded reference. It resolves a reference against the note's folder, then the vault root, then any file in the vault with that name. It reads the note's current path on each use, so a notebook moved in the Files tree keeps working.
- `dbFiles` keeps images of an IndexedDB notebook in the `attachments` store and writes `estudio-attachment:<id>`. "Move notebook to a vault…" writes each referenced attachment into the destination's `attachments/` and rewrites the references (`rewriteAttachmentRefs`, tested).
- The preview renders local images with `data-src`; `hydrateNotes` (`src/lib/hydrate.ts`) swaps in object URLs and typesets maths. Markdown mode shows each image as a block widget below its line; Document mode shows it in place.
- An area clip's "Send to notes" renders the region from pdf.js at 2 device pixels per point (`renderRegion` in `src/reader/pdf.ts`) and appends `![Figure](…) [[pN]]`, with the vault link form in a vault notebook.

### Maths, tables and printing

- `src/lib/mathsyntax.ts` is the one reader of `$…$` and `$$…$$`, used by the preview's tokenizer, Document mode's tokenizer and Markdown mode's widgets. KaTeX (`src/lib/katex.ts`) is imported the first time a formula is shown. Markdown mode typesets a formula while no cursor touches it and shows the source when one does.
- The formula editor (`FormulaDialog.svelte`, `formula.svelte.ts`) is shared by both modes and loads MathLive when it first opens, with MathLive's virtual keyboard shown straight away. Its fonts are copied to `dist/mathlive/fonts/` by the same Vite plugin that copies pdf.js's assets.
- "Notes as PDF" (`src/reader/printnotes.ts`) renders the notebook with `renderMarkdown(…, { plainLinks: true })`, so page links read "p. 12" or "Intro (p. 12)", waits for images and maths, and calls `window.print()`. A print stylesheet hides the rest of the app.

## Pinned figures

Textbooks say "see Figure 3" pages away from Figure 3. Any area clip can be pinned (Pin in its popover, or `Alt+P` while it is selected, including straight after drawing it) and is then kept in a floating panel over the page view, as Sioyek's portals are. The feature is one folder, `src/reader/pins/`, mounted once in `Reader.svelte` (`PinsMount`), with one button in the area popover (`PinButton`) and one spread of commands (`pinCommands`). Reverting its `pins`-scoped commits removes it; the `pins` ids left on stored documents and the two settings keys are then ignored.

- Data. `DocRecord.pins` lists the pinned annotation ids. The panel shows the ids that still name an area clip, so deleting a clip unpins it and undo brings the pin back; the stored list drops dead ids on its next write. The panel's place (`right` and `bottom` from the page view's bottom-right corner, width, height), collapsed, hidden and follow are `Settings.pinPanel`; `Settings.pinnedFigures` (on by default, "Pinned figures: turn off / on" in the palette) hides the panel, the popover button and the other commands.
- Following. With Follow on (default), the panel shows the figure `pinToShow` (`pins/pick.ts`, tested) picks for the page being read: a figure on that page, else the nearest one ahead within three pages, else the nearest in either direction. Previous / next override it until following would pick a different figure. Clicking the figure is a jump, so `Alt+Left` returns.
- Drawing. Only the figure on show is drawn, by `drawRegion` in `src/reader/pdf.ts` (shared with "Send to notes") into a fresh canvas at the panel's device-pixel size (capped at 8 MP), swapped in when done and cancelled when the figure, size or pixel ratio changes. The page mode is applied as the page view's CSS filter. With nothing pinned nothing is mounted beyond `PinsMount`.
- Own window. "Open in its own window" opens a blank same-origin window and mounts the same panel into it from the reader window, with a copy of its stylesheets, so it shares the open document, the renderer and the reading position without a sync protocol or a second pdf.js instance. Two consequences: pdf.js registers the PDF's fonts in the reader's document, so the figure is drawn there and its pixels copied into the window; and pdf.js paces rendering with the reader window's animation frames, which stop while the pop-out covers it, so those renders run unpaced (a small figure renders in one go). The window closes when the reader closes or reloads.
- Size. The panel is in the reader chunk rather than a chunk of its own: loading it lazily from the reader chunk made Rolldown split five shared modules out of the entry chunk (more requests and 1.4 kB gzip on every start), while in the reader chunk it costs 3.7 kB gzip there and nothing at start.
## Read aloud

Read aloud uses the browser's `speechSynthesis` with on-device voices only (`localService`, and never a voice named "Online"), so it is free, offline, and sends no text anywhere. Everything lives in `src/reader/speech/`:

- `entry.svelte.ts` is the only part in the reader chunk: the `readAloud` singleton the entry points call, and `speechCommands`. On first use it imports `index.ts`, the lazy `speech` chunk (the player and its bar, about 16 kB). The player receives the settings it needs from the entry rather than importing `app`, so the lazy chunk shares no module with the app shell and the initial chunk is unchanged.
- The mount points are single lines: `...speechCommands(r)` in `commands.ts`, the bar in `Reader.svelte` (inside the page view, bottom centre) with `readAloud.close()` in its `onDestroy`, the toolbar button, the selection menu's "Read aloud from here", the `speak` icon, and three settings (`readAloud`, `speechRate`, `speechVoices`). Reverting the feature's commits removes it.
- `text.ts` (pure, tested) turns a page's pdf.js text items into sentences. Lines come from `hasEOL`; rotated items (the arXiv stamp) are dropped; a first or last line that is a bare page number, or that matches a first or last line of a page up to two away once digits are masked, is furniture. Line-end hyphens are dropped before a short lowercase fragment ("transduc-tion") and kept for compounds ("sequence-aligned"). A short line without closing punctuation before a capitalised line (a heading) ends a sentence. Bracketed numeric citations are removed. Sentences end at `.!?…` before a capital, digit or quote, except after abbreviations (English and Spanish), single initials, or before lowercase; a sentence over 280 characters is cut at a clause break. Every character keeps its offset in the page string the text layer uses (`pageText`), so a sentence maps back to the screen through `textLayerRanges`, as search hits do.
- `speaker.svelte.ts` is a state machine: `idle`, `loading`, `picking`, `playing`, `paused`, `unavailable`. It speaks one sentence per utterance and queues the next on `end`, so Chromium's cut-off of long utterances never applies. Pause cancels and resume restarts the sentence, which also survives Chromium's pause bugs. A token discards events from cancelled utterances; a watchdog re-speaks a sentence if the engine goes quiet without `end`, and when a hidden tab becomes visible again a silenced engine is resumed or the sentence spoken again. The document language comes from the PDF's `Language` or `dc:language`, else from English and Spanish stopword counts; the voice is the one remembered for that language, else the default voice speaking it, else any offline voice.
- `follow.ts` draws the spoken sentence in a `.speech-hl` layer appended to the page element and scrolls it into the middle band of the view, unless the reader scrolled by hand in the last 4 s. A page whose text layer is not built yet is scrolled to, and the highlight waits for its spans.
- Voices: Edge lists its online voices a moment before the offline ones, so `loadVoices` waits (up to 2 s) for `voiceschanged` to bring an offline voice. Chrome and Edge on Windows list only the OneCore voices (Settings › Time & language › Speech), not SAPI 5 voices such as Zira.

## Installing and updating

The manifest registers Estudio for `application/pdf` / `.pdf` (`file_handlers`) with `launch_handler: focus-existing`, so a PDF opened from Explorer arrives through `launchQueue` in the window that is already open, which decides where it goes (see Several windows). The library shows "Install Estudio" while the browser offers installation. The service worker precaches the app shell, the reader and note chunks, the pdf.js worker, the pdf-lib worker, and pdf.js cmaps, standard fonts and wasm decoders, so the installed app opens and saves PDFs with the local server stopped. Updates use prompt mode: a new version waits while any window shows a document, and is applied (one reload of every window) once the last window showing a document returns to the library and pending saves have finished.

## Several windows

Each document opens in its own Estudio window, so two can be snapped side by side. The windows share one IndexedDB, so the design separates what each window owns before serialising what they share. Everything that crosses windows lives in `src/lib/windows.ts`: a Web Lock per open document, the `estudio-windows` `BroadcastChannel`, and one-time handoff tokens.

- **Opening in a new window.** A `FileSystemFileHandle` cannot travel in a URL. The opener stores it in the `handoffs` store under a random token and opens `<base>?open=<token>` with `noopener`. Same-origin, so an installed app opens an app window, and `noopener` gives it its own renderer process, so one window rendering pages never stalls the other. The new window takes the handoff in one transaction (read and delete), removes the token from its address, and sweeps handoffs older than two minutes. Entry points are Ctrl+click or middle click on a recent document or a vault PDF (library and the reader's Files tab), the new-window button on a recent document's card, and "Open in new window" in the Files tree menu. A recent document without a stored handle (opened through a plain file input) cannot move to another window, so its button is disabled and Ctrl+click says why.
- **Launches from Explorer.** `routeLaunch` decides: when the window shows the library, the first file opens there; every other file, and every file when a document is open, gets a new window. An open document is never replaced. A launch carries no user activation, so the pop-up blocker usually stops those `window.open` calls. The opener polls the handoff, and when it is still unclaimed after 1.5 s (4 s after a click) it shows "Open x.pdf in a new window?" with an **Open** button whose click is the activation. The offer disappears when the window claims the file. `focus-existing` stays: `navigate-new` would leave an idle library window behind on every launch, and `navigate-existing` would replace an open document; only `focus-existing` lets the receiving window choose.
- **One document, one window.** A window showing a document holds the lock `estudio-doc:<DocId>` (`navigator.locks.request` with `ifAvailable`, held by a promise the reader resolves after its final saves, and dropped by the browser if the window dies). The lock is the authority: `openDocument` takes it right after pdf.js computes the fingerprint and before it writes anything, and throws `OpenElsewhere` if another window holds it. Before loading anything, `openFile` and `openInNewWindow` ask `navigator.locks.query()` which documents are held and compare their stored handles with `isSameEntry`, so the usual case never replaces the current view. Either way the holder is asked over the channel to call `window.focus()` (the OS may not raise it), and this window shows "Already open in another window". A window opened only for that document tells its opener and closes. Reopening the document a window already shows queues behind its own release instead of failing. The notebook pop-out takes no lock, so it is never blocked. Removing a document from the library is refused while another window shows it.
- **Settings.** Each window keeps a snapshot of the settings as it last read or wrote them. `saveSettings` diffs the live settings against it (`diff` in `src/lib/patch.ts`) and `patchSettings` applies only the changed keys inside one IndexedDB transaction, so a window's stale copy never undoes another window's change to a different key. The changed keys are broadcast and the other windows adopt them. The notebook pop-out writes its two settings the same way.
- **Vaults and the notebook index.** Adding, forgetting or unlocking a vault, granting a PDF folder, and every file operation in a vault broadcast `vaults` (with the vault id for file changes). Other windows reload the list and grants from IndexedDB, rescan the notebook index of a new or changed vault, and refresh the tree if it is the open vault. The index persists as a patch against what the window last persisted, so one window never deletes entries another wrote.
- **Read aloud.** Starting or resuming speech broadcasts `speaking`, and every other window stops. Chromium's speech engine is shared, so two readers would otherwise fight over it.
- **Recent documents and progress.** Opening and closing a document broadcast `docs`, and library windows reload the list. Last writer wins there, but a document's progress, annotations, pins and sync base are written only by the window holding its lock.
- **Updates.** Applying a waiting service worker reloads every window it controls. The library applies it only when `navigator.locks.query()` shows no document lock; otherwise the last window to return to the library applies it. If a newer version is activated from elsewhere anyway, a window showing a document defers the reload (`onNeedReload`) until it shows the library; a notebook pop-out reloads at once.
- **A fresh window.** Ctrl+N in the installed app, or any window opened without `?open=`, starts on the library with no handoff and no launch to consume.

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
- Pinned figures: area clips kept in a floating panel that follows the reading position, or in their own window (see Pinned figures).
- Read aloud with offline voices from the selection, the current page or a clicked sentence, highlighting and following the spoken sentence across pages (see Read aloud). "Turn off read aloud" in the palette hides every entry point.
- Hover a link to a figure/section to preview its destination (Sioyek "smart jump" style) — internal links only in v1.
- When the hovered link lands on a bibliography entry, the preview shows the entry as text instead of a page crop. The entry is read from the destination page's text, from the destination down to the next entry. It offers "Open paper" for a DOI, arXiv id or URL found in the entry, otherwise "Search Scholar" with the likely title. The preview stays open while the pointer moves onto it.

Annotating
- Tools: select, highlight, underline, strikethrough, pen (pressure-aware, pointer events so a tablet stylus works), eraser, sticky note, area clip.
- Six semantic colours with editable meanings. Keys `1`–`6` pick colour.
- Every annotation can hold a note and tags. Undo / redo (Ctrl+Z / Ctrl+Y) for all annotation edits.
- Annotations sidebar: list with text, note, page; filter by colour, tag, kind; full-text search; click to jump.

Studying
- Notebook pane per document, edited in Document mode (formatted, with a toolbar) or Markdown mode, with a live preview (see Notebook editing). Images, GFM tables and `$…$` / `$$…$$` maths work in both modes and in the preview. "Quote to notebook" on any selection or annotation inserts a blockquote with a `[[pN]]` back-link.
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
- `j/k` scroll, `J/K` or PgDn/PgUp page, `g` go to page, `h` highlight tool, `u` underline, `p` pen, `n` note, `e` eraser, `v`/Esc select, `1`–`6` colour, `/` or Ctrl+F search, `f` focus mode, `r` ruler, `b` toggle sidebar, `W` widen notebook, `P` show / hide pinned figures, `Alt+P` pin / unpin the selected area clip. In the notebook editor: Ctrl+L link current page, `[[` link completion, and the formatting keys above. The editor keeps its own keys: reader shortcuts never fire while typing in it.
- `j/k` scroll, `J/K` or PgDn/PgUp page, `g` go to page, `h` highlight tool, `u` underline, `p` pen, `n` note, `e` eraser, `v`/Esc select, `1`–`6` colour, `/` or Ctrl+F search, `f` focus mode, `r` ruler, `l` read aloud / pause, `b` toggle sidebar, `W` widen notebook. In the notebook editor: Ctrl+L link current page, `[[` link completion, and the formatting keys above. The editor keeps its own keys: reader shortcuts never fire while typing in it.

Export and safety
- Export highlights + notes + notebook to Markdown (Obsidian-friendly).
- Print the notebook ("Notes as PDF"): images, tables and typeset maths, page links as "p. N"; the print dialog saves the PDF.
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
- Document mode writes an edited block in the contract's writer forms, so an edit inside a hand-formatted table re-pads its pipes, and `__b__` becomes `**b**` in that block. Untouched blocks are never rewritten.
- Read aloud follows the PDF's content order, which for most papers is reading order but can put figure labels or a second column's text in odd places. A sentence that runs across a page break is read as two. Headings are found by a line-shape heuristic, and the hyphen rule can glue or keep a hyphen wrongly. Language detection knows English and Spanish only.
- Several windows: a vault `.md` note opened on its own (not as a PDF's notebook) takes no lock, so the same note can be edited in two windows. A notebook link to a PDF that another window shows brings that window forward but does not move it to the linked page. A restored JSON backup is not announced to other open windows.
- Images cannot be resized in the editor, and an image deleted from a note leaves its file in `attachments/` (and its record in IndexedDB).

## Later (tablet / mobile / v2)

Tauri shell; touch gestures (pinch zoom, two-finger scroll while pen draws); split view of the same document; cross-document concept map; OCR for scanned PDFs; optional AI explain/summarise of a selection; sync.

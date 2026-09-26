# Developing Estudio

This is the developer reference: how to run and build Estudio, how the Windows install script works, the keyboard shortcuts, the source layout, and the dependencies. The design and data model are in [DESIGN.md](DESIGN.md). The notes file format is in [NOTES-FORMAT.md](NOTES-FORMAT.md).

## Run, test and build

Estudio needs Node 20 or later.

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest unit tests for the pure modules
npm run check      # svelte-check type check
npm run build      # type check, then the production build into dist/
npm run preview    # serve dist/ locally, including the service worker
```

Open a PDF with **Open PDF**, by dragging it onto the window, or from the recent-files library. `samples/sample-study.pdf` is a six-page study document with an outline and three figures. `node scripts/make-sample-pdf.mjs` writes it again.

To install a build as an app, open `npm run preview` or a deployed build in Chrome or Edge and click **Install Estudio**.

The build serves the app from `/` unless the `BASE` environment variable names another path. GitHub Pages serves it from `/estudio/`:

```powershell
$env:BASE = '/estudio/'; npm run build; Remove-Item Env:BASE
```

`BASE` sets the asset URLs, the manifest's `start_url`, `scope` and file handler, and the service worker's scope. Leave it unset for the install script, whose copy lives at `/`.

## Publishing to GitHub Pages

`.github/workflows/pages.yml` runs on every push to `main` and on demand. It installs with `npm ci`, runs the tests, builds with `BASE=/estudio/` and deploys `dist/` to <https://mikel-gonzalezt.github.io/estudio/>. In the repository settings, **Pages › Source** must be **GitHub Actions**.

## Content Security Policy

`scripts/csp.mjs` holds the policy. The build writes it into `index.html` as a `<meta http-equiv>` tag, and `scripts/serve.mjs` also sends it as a header with `frame-ancestors 'none'`, which a `<meta>` tag can't carry. GitHub Pages can't set headers, so the hosted copy has the `<meta>` policy only. README.md lists what the policy allows and why.

## The Windows install script

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install.ps1
```

`scripts\install.ps1` does four things:

1. It runs `npm install` and `npm run build`.
2. It deletes launcher shortcuts that earlier versions of the script made. A shortcut counts as one of these only if its command runs `scripts\launch.ps1`. Edge creates the app's own **Estudio** shortcuts when you install it.
3. It starts `scripts/serve.mjs` hidden on `127.0.0.1:4173`, unless something already listens on that port.
4. It opens `http://127.0.0.1:4173/` in Edge.

The first time, click **Install Estudio** at the top of the library, or the install icon in the address bar. After that, open Estudio from the Start menu. The installed app:

- appears in the Start menu and can be pinned to the taskbar,
- is offered in Explorer under **Open with** for PDF files, and can be made the default PDF app in Windows settings,
- works without the local server, because the service worker caches everything it needs.

The library, cards and settings live in the Edge profile under `http://127.0.0.1:4173`, so keep the port fixed. `scripts/serve.mjs` uses 4173 unless `PORT` is set, and serves `dist/` unless `DIST` names another folder. Use both to test a second build without touching the installed one. Run the install script again after pulling changes. The installed app switches to the new version the next time it shows the library.

`scripts\launch.ps1` starts the server if needed and opens Estudio in an app window. It is kept for starting Estudio by hand.

## Keys

`Ctrl+K` opens the command palette, which lists every action with its shortcut. Reader keys are defined in `src/reader/commands.ts`, `src/reader/tools.ts`, `src/reader/pins/commands.ts` and `src/reader/speech/entry.svelte.ts`. Notebook keys are in `src/reader/notebook/mdediting.ts`, `src/reader/notebook/cm.ts` and `src/reader/notebook/docmode/editor.ts`.

| Keys | Action |
| --- | --- |
| `j` / `k`, `J` / `K`, PgDn / PgUp | Scroll, next / previous page |
| `Home` / `End` | First / last page |
| `g` | Go to page |
| `Alt+Left` / `Alt+Right` | Back / forward after a jump |
| `Ctrl +` / `Ctrl -`, `Ctrl+0`, `Ctrl+9`, `w`, Ctrl+wheel | Zoom, fit width, fit page, fit text width |
| `v` / `Esc`, `h`, `u`, `x`, `p`, `e`, `n`, `a` | Select, highlight, underline, strikethrough, pen, eraser, sticky note, area clip |
| `1` to `6` | Colour |
| `Ctrl+Z` / `Ctrl+Y` | Undo / redo annotation edits |
| `Delete` | Delete the selected annotation |
| `/` or `Ctrl+F`, `F3` / `Shift+F3` | Find in document, next / previous result |
| `b`, `N`, `C`, `B` | Sidebar, notebook, flashcards, study pane |
| `W` | Widen notebook / restore its width |
| `R` | Review due cards |
| `f`, `r` | Focus mode, reading ruler |
| `l` | Read aloud; pause and resume while reading |
| `P` | Show / hide the pinned figures panel |
| `Alt+P` | Pin / unpin the selected area clip |
| `Ctrl+L` (in the notebook) | Link the page on screen |
| `[[` (in the notebook) | Link the current page, a section or an annotation |
| `Ctrl+B`, `Ctrl+I`, `Ctrl+Shift+X`, `Ctrl+E`, `Ctrl+Shift+H` (in the notebook) | Bold, italic, strikethrough, inline code, highlight; pressing again removes it |
| `Ctrl+Enter` (in the notebook) | Toggle a checkbox on the current line |
| `Ctrl+M` (in the notebook) | Insert or edit a formula |
| `Alt+Shift+F` (Markdown mode) | Line up the pipes of the table at the cursor |
| `Tab` / `Shift+Tab` (in the notebook) | Indent / outdent list items; move between table cells in Document mode |
| Arrow keys on a pane handle | Resize the pane (Shift for bigger steps, double-click to reset) |
| `Space`, then `1` to `4` (card review) | Show the answer, then grade it Again, Hard, Good or Easy |

## Source layout

- `src/lib/` holds framework-free modules: data types, geometry, the FSRS scheduler, the keyboard and command registry, IndexedDB access (`db.ts`), the file-system boundary (`vault.ts`, `fsaccess.ts`), and the exporters (`export/`).
- `src/reader/` is the lazily loaded reader: the pdf.js engine, the virtualised viewer, the tools, and the panes. `notebook/` holds both notebook editors, `pins/` the pinned figures, `speech/` read aloud, and `review/` the card review screen.
- `src/components/` holds the library screen and shared UI.
- `scripts/` holds the Windows install script (`install.ps1`), the local server (`serve.mjs`), the Content Security Policy (`csp.mjs`), the launcher (`launch.ps1`) and the sample PDF generator (`make-sample-pdf.mjs`).

## Dependencies

Runtime dependencies, and when each one loads:

- `pdfjs-dist` parses and renders PDFs, in a Web Worker.
- `idb` wraps IndexedDB.
- `pdf-lib` reads and writes annotations inside PDF files. It runs in a worker when saving into a file, and loads on demand for exports.
- `marked` renders the notebook preview.
- CodeMirror 6 is the Markdown-mode editor. It loads when the notebook first opens.
- TipTap with `@tiptap/markdown` is the Document-mode editor. It loads on first use.
- KaTeX typesets formulas. It loads when the first formula is shown.
- MathLive is the visual formula editor. It loads when the editor first opens.
- `docx`, `temml` and `mdast-util-from-markdown` (with the GFM and maths extensions) write "Notes as Word (.docx)". They load when that export runs.

The FSRS-5 scheduler is implemented in `src/lib/fsrs.ts` rather than pulled from `ts-fsrs`.

## Feature notes

These notes describe behaviour in more detail than the guide. [DESIGN.md](DESIGN.md) explains how each part works.

### Saving into the PDF

When a PDF is opened from disk (Open with, Open PDF, drag and drop, or a vault), highlights, drawings, notes and area clips are written into that file a few seconds after each change and when you close it. The status bar shows **Saved to file**, **Saving…**, or **Unsaved (click to allow)** when the browser needs permission to write. Click it once. Nothing is lost meanwhile, because Estudio keeps its own copy until the file is written. If another app changed the annotations in the file, both sets are merged.

### Pinned figures

Draw an area clip around a figure and press **Pin** (or `Alt+P`). The figure stays in a small panel at the bottom right of the page while you read on. With several pinned, **Follow** shows the one nearest the page you are reading, and the arrows step through them. Click the figure to go to its page (`Alt+Left` returns). Drag the panel by its header, resize it from its top-left corner, collapse it to a tab, or open it in its own window for a second monitor. `P` hides and shows it. To switch the feature off, run **Pinned figures: turn off** from the command palette.

### Vaults

**Open vault** turns a folder into a vault, like Obsidian. The Files tree, on the library and in the reader's left sidebar, shows its folders, PDFs and Markdown notes. Right-click (or `F2` and `Del`) to rename and delete, drag to move, and use the tree's toolbar to add notes and folders or import PDFs.

A PDF's notebook is a Markdown file whose frontmatter names the PDF (`estudio-doc:` and `pdf: "[[paper.pdf]]"`). Every page link written there names the PDF so Obsidian can follow it (`[[paper.pdf#page=3|p. 3]]`). Because the pairing is in the file, you can move or rename the note anywhere, even into another vault opened in Estudio, and the PDF still finds it.

New notebooks go next to their PDF by default. The notebook's ⋯ menu can send them to a folder of your choice instead, and can move a notebook kept inside Estudio into a vault. For a PDF outside any vault, the notebook header says **Saved inside Estudio · Save as file**. **Next to the PDF** asks once for access to the PDF's folder and moves the notebook and its images there. Later PDFs in that folder get their notebook beside them without asking. That folder is not a vault and does not appear in the vault list. A PDF opened through the plain file input can't have notes saved beside it, so the menu offers a vault folder or a notes download instead. Edge refuses access to the Downloads, Desktop and Documents folders themselves, so use a subfolder such as `Downloads\Estudio`.

Clicking a link such as `[[paper.pdf#page=3]]` in a note opens that PDF from the vault at page 3. A link names a file by name or by path. A bare name is looked up next to the note first, then anywhere in the vault.

### Notes

The switch in the notebook header chooses how you edit:

- **Document** (the default) looks like a word processor, with a toolbar for text style, bold, italic, strikethrough, highlight, code, lists, checklists, quotes, page links, tables, images and formulas. Markdown shortcuts still work if you type them (`# `, `- `, `1. `, `[ ] `, `**bold**`, `==highlight==`, `$x^2$`). It has **Edit** and **Read** views.
- **Markdown** shows the source, with page links as chips, images below their line, and formulas typeset while the cursor is elsewhere. It has **Write**, **Split** and **Preview** views. **Format table** (`Alt+Shift+F`) lines up a table's pipes.

Switching modes never changes the text, and a note you only read is never rewritten. When you edit in Document mode, only the blocks you touched are written again.

- **Images.** Paste a screenshot or drop an image file into either mode. In a vault it is saved as `attachments/Pasted image <date>.png` beside the note, as Obsidian does. A notebook kept inside Estudio stores it in IndexedDB, and **Move notebook to a vault…** writes those images out as files. An area clip's **Send to notes** adds the clipped figure, drawn from the PDF, with a link to its page. Obsidian's `![[image.png]]` embeds are shown too.
- **Tables.** In Document mode, `Tab` and `Shift+Tab` move between cells, `Enter` in the last row adds a row, and the table toolbar adds or deletes rows and columns.
- **Formulas.** `Ctrl+M` or the formula button opens a visual formula editor with an on-screen maths keyboard. Click a formula to edit it.
- **Printing.** The download menu's **Notes as PDF** opens the print dialog on a clean copy of the notes, with images, tables and formulas, and page links written as "p. 12". Choose **Save as PDF** there.

### Read aloud

The speaker button in the toolbar, or `l`, reads the document aloud from the selection, or from the top of the page on screen. Select text and choose **Read aloud from here**, or pick **Read aloud from a sentence I click** in the command palette and click a sentence. The sentence being read is marked on the page, and the page follows it unless you scrolled in the last few seconds. The bar at the bottom pauses, skips a sentence back or forward, stops, and sets the speed (0.75× to 2×) and the voice. Your voice is remembered for each language.

Only voices installed in Windows are used, so it works offline and no text leaves the computer. Edge's "Online (Natural)" voices are never offered. Estudio picks a voice for the document's language (English or Spanish, from the PDF's metadata or its text). Add voices in Windows Settings › Time & language › Speech. Chrome and Edge list only the voices installed there, not older SAPI voices such as Zira. Page headers, page numbers, the arXiv margin stamp and bracketed citations like [13] are skipped. **Turn off read aloud** in the command palette hides all of it.

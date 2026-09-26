# Estudio

A PDF reader built for studying: highlights with meaning, notes linked to pages, and flashcards on a spaced-repetition schedule. It runs in the browser and installs as a PWA that opens PDFs straight from Explorer. Annotations are saved into the PDF itself, as standard annotations other readers show, and notes can live in an Obsidian-style vault folder. Cards, progress and settings are stored locally in IndexedDB.

The design and data model live in [docs/DESIGN.md](docs/DESIGN.md).

## Install on Windows

Requires Node 20+. Run once, and again after pulling changes:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install.ps1
```

This installs dependencies, builds the app, starts a small local server (`scripts/serve.mjs`, port 4173, hidden) unless one is already running, and opens `http://127.0.0.1:4173/` in Edge. The first time, click **Install Estudio** at the top of the library, or the install icon in the address bar. After that, open Estudio from the Start menu. The installed app:

- appears in the Start menu and can be pinned to the taskbar,
- is offered in Explorer under **Open with** for PDF files (you can make it the default PDF app in Windows settings),
- works without the local server, because everything it needs is cached.

Edge creates the app's own **Estudio** shortcuts when you install it. Earlier versions of the script made launcher shortcuts with the same name; it now deletes those, and only those (shortcuts whose command runs `scripts\launch.ps1`). `scripts\launch.ps1` still works for starting the server and opening Estudio in an app window by hand. Your library lives in the browser profile under `http://127.0.0.1:4173`, so keep the port fixed. Run the install script again after pulling changes; the installed app switches to the new version the next time it shows the library.

## Saving into the PDF

When a PDF is opened from disk (Open with, Open PDF, drag and drop, or a vault), highlights, drawings, notes and area clips are written into that file a few seconds after each change and when you close it. The status bar shows **Saved to file**, **Saving…**, or **Unsaved (click to allow)** when the browser needs your permission to write; click it once. Nothing is lost meanwhile, because Estudio keeps its own copy until the file is written. If another app changed the annotations in the file, both sets are merged.

## Vaults

**Open vault** turns a folder into a vault, like Obsidian. The Files tree, on the library and in the reader's left sidebar, shows its folders, PDFs and Markdown notes. Right-click (or F2 and Del) to rename and delete, drag to move, and use the tree's toolbar to add notes and folders or import PDFs. A PDF's notebook is a Markdown file whose frontmatter names the PDF (`estudio-doc:` and `pdf: "[[paper.pdf]]"`), and every page link written there names the PDF so Obsidian can follow it (`[[paper.pdf#page=3|p. 3]]`). Because the pairing is in the file, you can move or rename the note anywhere, even into another vault you have opened in Estudio (your Obsidian vault, say), and the PDF still finds it. New notebooks go next to their PDF by default; the notebook's ⋯ menu can send them to a folder of your choice instead, and can move a notebook kept inside Estudio into a vault. Older `<name>.md` notebooks next to their PDF are picked up as before and get the frontmatter on their next save. Other properties you add to a notebook are kept. Notes open in the same editor; clicking a link such as `[[paper.pdf#page=3]]` in a note opens that PDF from the vault at page 3. A link names a file by name or by path; a bare name is looked up next to the note first, then anywhere in the vault.

## Develop

Requires Node 20+.

```sh
npm install
npm run dev        # http://localhost:5173
```

Open a PDF with **Open PDF**, by dragging it onto the window, or from the recent-files library. `samples/attention.pdf` is a small test document.

## Build and test

```sh
npm test           # Vitest unit tests for the pure modules
npm run build      # type-check (svelte-check) and production build into dist/
npm run preview    # serve dist/ locally, including the service worker
```

To install as an app, open the preview or a deployed build in Chrome or Edge and click **Install Estudio**.

## Keys

`Ctrl+K` opens the command palette, which lists every action with its shortcut.

| Keys | Action |
| --- | --- |
| `j` / `k`, `J` / `K`, PgDn / PgUp | Scroll, next / previous page |
| `g` | Go to page |
| `Alt+Left` / `Alt+Right` | Back / forward after a jump |
| `Ctrl +` / `Ctrl -`, `Ctrl+0`, `Ctrl+9`, Ctrl+wheel | Zoom, fit width, fit page |
| `v` / `Esc`, `h`, `u`, `x`, `p`, `e`, `n`, `a` | Select, highlight, underline, strikethrough, pen, eraser, note, area clip |
| `1` to `6` | Colour |
| `Ctrl+Z` / `Ctrl+Y` | Undo / redo annotation edits |
| `/` or `Ctrl+F` | Find in document |
| `b`, `N`, `C`, `B` | Sidebar, notebook, flashcards, study pane |
| `W` | Widen notebook / restore its width |
| `Ctrl+L` (in the notebook) | Link the page on screen |
| `[[` (in the notebook) | Link the current page, a section or an annotation |
| `Ctrl+B`, `Ctrl+I`, `Ctrl+Shift+X`, `Ctrl+E`, `Ctrl+Shift+H` (in the notebook) | Bold, italic, strikethrough, inline code, `==highlight==`; pressing again removes it |
| `Ctrl+Enter` (in the notebook) | Toggle a checkbox on the current line |
| `Tab` / `Shift+Tab` (in the notebook) | Indent / outdent list items |
| Arrow keys on a pane handle | Resize the pane (Shift for bigger steps, double-click to reset) |
| `R` | Review due cards |
| `f`, `r` | Focus mode, reading ruler |

## Dependencies

Runtime: `pdfjs-dist`, `idb`, `pdf-lib` (in a worker when saving annotations into a file, and on demand for exports), `marked` (notebook preview) and CodeMirror 6 (notebook editor, loaded when the notebook first opens). The FSRS-5 scheduler is implemented in `src/lib/fsrs.ts` rather than pulled from `ts-fsrs`.

## Layout

- `src/lib/` holds framework-free modules: data types, geometry, FSRS scheduler, keyboard and command registry, IndexedDB access (`db.ts`), exporters.
- `src/reader/` is the lazily loaded reader: pdf.js engine, virtualised viewer, tools, panes.
- `src/components/` holds the library screen and shared UI.

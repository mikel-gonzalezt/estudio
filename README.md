# Estudio

A PDF reader built for studying: highlights with meaning, notes linked to pages, and flashcards on a spaced-repetition schedule. It runs in the browser and installs as a PWA. Everything is stored locally in IndexedDB.

The design and data model live in [docs/DESIGN.md](docs/DESIGN.md).

## Run

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

To install as an app, open the preview or a deployed build in Chrome or Edge and use "Install app" in the address bar.

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
| `R` | Review due cards |
| `f`, `r` | Focus mode, reading ruler |

## Dependencies

Runtime: `pdfjs-dist`, `idb`, `pdf-lib` (loaded only when exporting a PDF) and `marked` (notebook preview). The FSRS-5 scheduler is implemented in `src/lib/fsrs.ts` rather than pulled from `ts-fsrs`.

## Layout

- `src/lib/` holds framework-free modules: data types, geometry, FSRS scheduler, keyboard and command registry, IndexedDB access (`db.ts`), exporters.
- `src/reader/` is the lazily loaded reader: pdf.js engine, virtualised viewer, tools, panes.
- `src/components/` holds the library screen and shared UI.

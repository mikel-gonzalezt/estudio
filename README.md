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

## Layout

- `src/lib/` holds framework-free modules: data types, geometry, FSRS scheduler, keyboard and command registry, IndexedDB access (`db.ts`), exporters.
- `src/reader/` is the lazily loaded reader: pdf.js engine, virtualised viewer, tools, panes.
- `src/components/` holds the library screen and shared UI.

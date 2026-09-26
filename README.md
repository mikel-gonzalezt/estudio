# Estudio

Estudio is a PDF reader for studying. You highlight in colours that mean something, keep a notebook whose notes link back to the page, and review flashcards on a spaced-repetition schedule. It is for students who learn from PDFs: class notes, papers and textbooks. It runs in the browser, installs as an app on Windows, and keeps everything on your own computer.

**[Guía de uso completa (español)](docs/GUIA.md)**

![The reader with highlights, a sticky note and an area clip on the page, and the notebook open in Document mode beside it](docs/images/reader.png)

| Flashcard review | Library and vault |
| --- | --- |
| ![A flashcard with its answer shown and the Again, Hard, Good and Easy buttons](docs/images/review.png) | ![The library with a vault's Files tree of folders, PDFs and notes](docs/images/library.png) |

## Features

**Read.** A fast viewer with outline, thumbnails and search. Fit text width (`w`) crops the margins. Dark and sepia pages, a focus mode and a reading ruler. Hovering a citation previews the reference, with **Open paper** or **Search Scholar**. Read aloud uses the voices installed in Windows.

**Annotate.** Highlight, underline and strike out in six colours whose meanings you choose. A pressure-aware pen, sticky notes and area clips. Undo and redo for everything. Annotations are saved into the PDF itself, as standard annotations that other PDF readers show.

**Take notes.** Each PDF has a notebook, edited like a document or as Markdown. Page links come from `Ctrl+L` or from typing `[[`. Notes hold images, figures clipped from the PDF, tables and formulas, which you write with a visual editor. The notebook can open in its own window. Notes are Markdown files, so they can live in a folder that Obsidian also opens.

**Study.** Basic and cloze flashcards, scheduled with FSRS, the algorithm current Anki uses. Pinned figures stay on screen while you read on. A pomodoro timer and a reading timer per document.

**Export.** Markdown with highlights and notes, the notebook alone as `.md`, the notebook as Word (`.docx`, with native equations) or as PDF, the annotated PDF, and a full JSON backup.

## Install

### From the web

Estudio is at **<https://mikel-gonzalezt.github.io/estudio/>**.

1. Open the address in Edge or Chrome. On Windows, use **Edge**: it gives PDF files the Estudio icon when Estudio is the default PDF app, while Chrome leaves them blank.
2. Click **Install Estudio** at the top of the library. If the button is missing, use the install icon in the address bar.

On Windows, Estudio then appears in the Start menu and under **Open with** for PDF files. A copy installed from the web keeps its own library, apart from a copy installed from source, because the browser keeps each address's storage separate.

On Android and iPad, Estudio reads, annotates and keeps notes, but it keeps everything inside the app. Those browsers can't grant access to folders or save into files, so vaults and saving into the PDF work on a computer only.

### On a Windows PC, from source

You need [Node.js](https://nodejs.org/) 20 or later. Clone or download this repository, open PowerShell in its folder, and run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install.ps1
```

The script builds Estudio, starts a small local server on `127.0.0.1:4173` and opens it in Edge. Click **Install Estudio**. The installed app works offline, without the server. To update, pull and run the script again. [DEVELOPMENT.md](docs/DEVELOPMENT.md) explains each step.

## Privacy and security

Estudio has no accounts, no telemetry and no server of its own. Once installed it works offline. The service worker caches the app, pdf.js and the fonts, so nothing is fetched from a CDN.

Estudio sends network requests only in these cases:

- The browser fetches the app's own files from the address it was installed from, and checks that address for updates.
- You click **Open paper** or **Search Scholar** in a citation preview, which opens `doi.org`, `arxiv.org`, the paper's URL or `scholar.google.com` in a new tab.
- You click a web link in a PDF or in a note, which opens in a new tab.
- You click **Load** on a remote image in a note. A note image given by web address (`![](https://…)`) shows as "Remote image: *host* · Load" until you click. Estudio then fetches that one image, with no referrer and no cookies, and remembers the choice until the app closes. A Word export or a print writes the placeholder for any remote image you did not load.

Read aloud uses only voices that run on the device. Edge's online voices are filtered out, so no text leaves the computer.

**PDFs.** pdf.js parses every PDF in a Web Worker. Estudio uses pdf.js 6.3, whose build contains no `eval` or `new Function`, so the `isEvalSupported` option no longer exists. Estudio never loads pdf.js's scripting sandbox, so JavaScript inside a PDF never runs.

**Files.** Estudio sees only the files you open and the folders you pick. It writes through the File System Access API, where the browser asks you to grant each file or folder. After a restart, a folder needs one **Allow access** click again. A PDF opened through the browser's plain file input can't be written to, so its annotations stay inside Estudio.

**Saving.** Every change goes to IndexedDB first. The PDF is then written through `createWritable()`, which Chromium stages in a temporary file and swaps in on `close()`, so a crash during a save leaves the old PDF intact. Before writing, Estudio reads the file again and merges annotations three ways against the last version both sides agreed on. The newer edit wins, an edit beats a deletion, and additions from both sides are kept, so annotations another app added are not overwritten.

**Threat model.** The two untrusted inputs are PDFs and note files, for example a `.md` or a backup someone sent you. A malicious PDF meets pdf.js in a worker with no script execution, so the remaining risk is a bug in pdf.js or the browser. Keep Edge updated.

In notes, the preview shows raw HTML as text instead of rendering it. A link keeps its address only when it is an `http`, `https` or `mailto` address or an in-page `#` anchor. Estudio checks the address after decoding character references, as the browser reads it, so `javascript&#58;…` counts as `javascript:`. Any other link shows as plain text, in the preview, in Document mode (pasted HTML included) and in the Word export. A click, a middle click or Enter on a link never moves the Estudio window. A web link opens in a new tab that can't reach Estudio (`noopener`, `noreferrer`). KaTeX runs with `trust` off, so a formula can't add links or HTML. Document mode turns HTML tags it recognises into its own nodes and keeps only the attributes those nodes define, so scripts and event handlers are dropped. A test note with `<script>`, `onerror`, `javascript:` and `data:` links (plain, mixed case and entity-encoded), raw `<a>` tags and a KaTeX `\href` ran no script in any editor mode.

**Content Security Policy.** The built app runs under this policy, kept in `scripts/csp.mjs`:

```text
default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline';
img-src 'self' blob: data: https:; font-src 'self' data:; connect-src 'self' blob: data: https:;
worker-src 'self' blob:; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'
```

Scripts run only from Estudio's own address. `'wasm-unsafe-eval'` lets pdf.js compile its WebAssembly image decoders and still forbids `eval`. Inline styles are allowed because Svelte, KaTeX, both editors and MathLive set them. `https:` in `img-src` and `connect-src` is there for remote images you choose to load; the Word export reads a loaded image with `fetch`. A remote image on plain `http:` doesn't load, and one whose server sends no CORS headers shows in the app but not in the Word export. Nothing can load a plugin, open a frame or submit a form.

The local server (`scripts/serve.mjs`) sends the policy as a header and adds `frame-ancestors 'none'`, so no other site can frame Estudio. GitHub Pages can't set headers, so the hosted copy carries the policy in a `<meta>` tag only. There it can't forbid framing, as browsers ignore `frame-ancestors` in a `<meta>` tag, and it doesn't reach the pdf.js worker, which takes its policy from the worker script's own headers.

## How it was built

Mikel González Tejero designed, directed, reviewed and tested Estudio. Claude agents (Anthropic), working through Claude Code, wrote most of the code. The session log, [docs/BITACORA.md](docs/BITACORA.md), records what was built, what was decided and why, and how each change was checked. The design and data model are in [docs/DESIGN.md](docs/DESIGN.md). 447 automated tests cover the pure modules, from the scheduler and the annotation merge to the notes format.

## Develop

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests
npm run build      # type check and production build into dist/
npm run preview    # serve dist/ with the service worker
```

## Docs

- [Guía de uso completa (español)](docs/GUIA.md) is the user guide.
- [DEVELOPMENT.md](docs/DEVELOPMENT.md) covers building, the install script, the keyboard shortcuts, the source layout and the dependencies.
- [DESIGN.md](docs/DESIGN.md) covers the design, the data model and how each feature works.
- [NOTES-FORMAT.md](docs/NOTES-FORMAT.md) is the Markdown contract between the editors and the exporters.
- [BITACORA.md](docs/BITACORA.md) is the session log of what was built and decided.

## License

MIT. See [LICENSE](LICENSE).

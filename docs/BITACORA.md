# Bitácora

A running log of what was built, what was decided, and what is pending. Newest session first.

## v1.0: status on 2026-09-26

The user and the lead agreed that v1 is feature-complete for studying on PC. It is tagged `v1.0.0` in git.

### What v1 is

Estudio is a study-focused PDF reader that runs as an installed Edge app (PWA) on Windows and works offline.

- **Reading:** a fast virtualised viewer with outline, thumbnails and search. Citations show a preview with an "Open paper" button. Fit text width (`w`) crops the margins. There are dark and sepia page modes, a focus mode, a reading ruler, a pomodoro timer and a reading timer.
- **Annotating:** highlight, underline and strike in six colours whose meanings you can edit; a pressure-aware pen; sticky notes; area clips. Everything has undo, and annotations are saved into the PDF itself as standard annotations.
- **Notes:** each PDF has a notebook with a Document mode (like Google Docs) and a Markdown mode. Notes have page-link chips, Ctrl+L, `[[` suggestions and auto links; images and PDF figure clips; tables; formulas (KaTeX, with the MathLive editor); and a pop-out window. Notes are `.md` files with frontmatter, paired to the PDF by id, so they can live in any vault, including an Obsidian one.
- **Studying:** flashcards (basic and cloze) scheduled with FSRS; pinned figures that follow the reading position; read aloud with offline Windows voices.
- **Organising:** Obsidian-style vaults (a folder tree of PDFs and notes) and a recent-files library.
- **Exporting:** Markdown, notes only (`.md`), notes as Word (`.docx`, with native equations), notes as PDF, the annotated PDF, and a JSON backup.

### How it runs

- **Build and update:** `scripts\install.ps1` builds the app, starts `scripts/serve.mjs` on `127.0.0.1:4173`, and opens Edge. The installed app works without the server. The server is only needed to pick up updates, and the app switches to a new version the next time it shows the library.
- **Opening PDFs:** Estudio is registered as a PDF handler, so it appears under "Open with". To make it the default: Settings › Apps › Default apps › `.pdf` › Estudio.
- **Where data lives:** annotations are in the PDF files. Notes are `.md` files, in a vault or next to a PDF outside a vault once its folder was granted with "Save as file › Next to the PDF". Until then, and for PDFs opened without a file handle, they are in IndexedDB. Cards, progress and settings are in IndexedDB, in the Edge profile, under `http://127.0.0.1:4173`. Keep that port fixed, because the data belongs to that address.
- **Voices:** read aloud needs Windows OneCore voices. As of this date the PC has Helena, Laura and Pablo (es-ES) and David, Mark and Zira (en-US).

### Parked, by the user's decision

- OCR for scanned PDFs.
- Optional AI (flashcards from highlights, explain a paragraph).
- Automatic PPTX to PDF conversion.
- A native Tauri installer and tablet/mobile builds.

### Known gaps worth knowing

- **Real-disk testing:** saving into PDFs and the vault file operations were verified in the browser's sandbox storage, not on real disk folders. Keep backups of important PDFs until they have been used for a while.
- **Encrypted PDFs** can't be written to, so their annotations stay inside Estudio.
- **Duplicate copies:** copies of the same PDF share annotations and a notebook.
- **Obsidian edits:** text edited in Obsidian while the same note is open in Estudio gets overwritten.
- **No settings screen:** feature switches (pinned figures, read aloud, notebook location) live in the Ctrl+K palette and in menus.
- **Smaller gaps:** listed under each session below.

### If work resumes

Read this file first. Suggested order: a small settings screen; then whatever real use shows is missing; then OCR, if scanned material becomes common.

## 2026-09-26, session 6

### Fixed

1. **Notebooks next to PDFs outside a vault.** "New notebooks go in: Next to the PDF" was selected, yet a PDF opened by Open with, Open PDF or drag and drop kept its notebook in IndexedDB without saying so. The user could not find the `.md`.
   - **The label:** such a notebook now shows "Saved inside Estudio · Save as file" in its header. The menu offers "Next to the PDF" and "In a vault folder…".
   - **Next to the PDF:** asks once for the PDF's folder, then writes `<pdf name>.md` beside the PDF, with its frontmatter and its pasted images in `attachments/`. A same-named `.md` is never overwritten. A folder that doesn't hold the PDF is refused, and nothing is written.
   - **Later PDFs:** other PDFs in that folder, or below it, get their notebook beside them without asking. After a restart, the folder may need one "Allow access" click.
   - **Not a vault:** the granted folder is not shown in the vault list or the Files tree. Estudio reads only the PDF's own folder in it, never the whole folder, because it may be Downloads.
   - **No handle:** a PDF opened through the plain file input offers only a vault folder or the notes download, and says why.
   - **Failures:** if a write fails, the files written so far are removed and the IndexedDB notebook stays in use.
2. **Lead follow-ups after review.**
   - **Missing images in a PDF folder:** an image that can't be found in a granted folder no longer triggers a search of the whole folder. This is tested.
   - **Long titles:** a long document title no longer pushes the toolbar tools into each other. Only the title shrinks, with "…". Checked in headless Edge at 1000–1450 px.

### How it was checked

- 376 tests pass, including new ones for the offer table, the shallow PDF-folder lookup, `placeIn` and name uniqueness. The build passes.
- In headless Edge with OPFS folders, 37 checks passed. They covered the label and menu, a wrong folder writing nothing, and a failed `.md` write leaving no file while IndexedDB stays in use. The move wrote `paper (2).md` beside an unrelated `paper.md`, with frontmatter and a rewritten image reference. Edits and the pop-out wrote the file, and reopening found it. A second PDF got `second.md` with no picker. The folder was absent from the vault list and Files tree, a vault PDF behaved as before, and a PDF opened without a handle got the reduced menu.

### Known gaps

- **Lapsed grants:** the one-click "Allow access" after a restart was not exercised, because OPFS never loses its grant.
- **Real disk:** "Open with" and the real folder picker were not driven. The test opened PDFs through the Open PDF picker with OPFS handles.
- **Existing notebook in the picked folder:** if the picked folder already holds a notebook file for this PDF, "Next to the PDF" still writes a new `name (2).md`, and the index then prefers one of the two.

## 2026-09-26, session 5

### Research and decisions

We researched study PDF apps (Sioyek, Zotero forum requests, LiquidText, MarginNote, Notability, 2026 reviews, read-aloud tools) and proposed four additions. The user decided:

| Idea | Decision |
|---|---|
| Pinned figures (Sioyek "portals") | Build, as an easily reversible trial |
| OCR for scanned PDFs | Parked for now |
| Read aloud | Build, only if free, offline and light |
| Optional AI (flashcards from highlights, explain) | Parked for now |

Rejected as not worth it: mind maps, infinite excerpt canvas, audio recording, two PDFs side by side, cloud sync.

### Built

1. **Pinned figures.** Code is in `src/reader/pins/`; commits are scoped `pins`.
   - **Pinning:** Pin an area clip from its popover, or with Alt+P. P shows or hides the panel.
   - **The panel:** a floating panel that can be dragged, resized and collapsed. It follows the reading position and shows the pinned figure nearest to the current page. Clicking the figure jumps to its page, and Alt+Left goes back. The panel can move into its own window.
   - **Switching off:** the palette command "Pinned figures: turn off / on".
   - **To remove it:** `git revert 60b6a4f 169a76c 9f19f2d 1fb1a3d 98e3943`, or revert those five commits on top of the current branch.
2. **Read aloud.** Code is in `src/reader/speech/`; commits are scoped `speech`.
   - **Voices:** only offline Windows voices are used. Online "Natural" voices are never listed, so it is free and works offline.
   - **Starting:** press `l`, use the toolbar speaker button, "Read aloud from here" in the selection menu, or "Read aloud from a sentence I click".
   - **While reading:** the spoken sentence is highlighted and followed across pages. Numeric citations and page footers are skipped. The bar has speed, voice and sentence controls.
   - **Switching off:** the palette command "Turn off read aloud".
   - **To remove it:** revert `e9e105d e4b48da 898db60 ffa4b32` and the merge `3e46218`.
   - **Finding:** Edge only sees the modern Windows voices, which on this PC are Helena, Laura and Pablo (es-ES). Zira is an older SAPI voice that Edge cannot use, so English PDFs are read by a Spanish voice until an English voice is added in Windows Settings › Time & language › Speech.

### How it was checked

- 366 tests pass.
- Each agent drove its feature end to end in headless Edge. Read aloud was also checked with the real Windows engine: five sentences played with the highlight following.
- After merging, the lead ran a smoke test that opened a document (so no shortcut clash), pinned a clip, and started reading with Helena. Both features ran together with no console errors.

### Incident

During testing, the pinned-figures agent ran `taskkill /F /IM msedge.exe`, which closed every Edge window on the PC, including the installed Estudio. Nothing was lost, because Estudio saves on every edit. Future test scripts must only kill the Edge instances they started.

### Known gaps

- **Pinned figures:** the pop-out window closes if the reader window reloads, and the panel has not been tested on a real second monitor.
- **Read aloud:** it knows only English and Spanish. A sentence split by a page break is read as two. "Current page" means the page's first sentence, not the first sentence visible on screen.
- **Both:** the on/off switches exist only as palette commands, because there is no settings screen yet.

## 2026-09-26, session 4

### Questions answered

- **Does the local server need starting?** No. The server on 127.0.0.1:4173 only serves the app's files so it can be installed and updated. The installed app works offline without it, and `scripts/install.ps1` starts it, so nobody needs to start it by hand.

### Fixed

1. **Invalid formulas.** A formula KaTeX can't read used to show as red letters with no explanation. Now the LaTeX shows in the normal colour with a red wavy underline, like a spelling mistake, and hovering it says why (for example "Formula error: Undefined control sequence: \foo"). This works the same in Document mode, Markdown mode, the preview and printing. The formula editor shows the same message under the LaTeX field.
2. **Edit / Read in Document mode.** Document mode now offers only Edit and Read. Split showed the same formatted view twice, and Preview was just the editor without its toolbar. Markdown mode keeps Write, Split and Preview. If Split was chosen in Markdown mode, Document mode opens in Edit.
3. **Format table** appears only while the cursor is inside a table in Markdown mode. Alt+Shift+F still works.

### How it was checked

- 332 tests pass, including new ones for the formula error message and for "cursor in a table". The build passes.
- In headless Edge we checked `$\foo x$` in Document mode, Read, Markdown mode and Split: each showed the underline and the tooltip. We also checked the Edit/Read tabs, going from Split to Document and back, Format table appearing and disappearing with the cursor, and the error in the formula editor.

### Known gaps

- Format table is not in the command palette. The palette only has reader commands and doesn't know about the notebook's editor.

## 2026-09-26, session 3

### Questions answered

- **PPTX.** Recommended converting to PDF on open rather than rendering PPTX in the app (browser renderers are inaccurate). By hand today: PowerPoint > Save As > PDF. Automatic conversion through the local server, using PowerPoint or LibreOffice, is proposed and **not built yet**.
- **Google Docs.** Not recommended: it can't be embedded, needs sign-in and internet, and would lose page links. We chose a document-style editor that still saves Markdown instead.

### Built

1. **Document mode.** A WYSIWYG editor (TipTap) with a formatting toolbar and no visible Markdown, over the same `.md` file. The Document / Markdown toggle is remembered, and **Document is the default**, so family members get the easy mode.
   - **Chosen after a spike:** TipTap against Milkdown, recorded in DESIGN.md.
   - **The file never changes behind your back:** blocks you didn't edit are kept byte for byte, and opening a note or switching modes never rewrites it.
2. **Images.** Paste or drag images in. In a vault they go to `attachments/` next to the note; for notebooks stored inside Estudio they go to IndexedDB. "Send to notes" on the area clip inserts a PDF figure with its page link.
3. **Tables** edited as a grid.
4. **Formulas.** `$…$` and `$$…$$` are rendered with KaTeX. A visual formula editor (MathLive) has an on-screen keyboard.
5. **Exports.** "Notes as PDF" goes through the print dialog. "Notes as Word (.docx)" produces real Word headings, lists, tables, images and highlight. Formulas become native Word equations, with a picture as fallback for unsupported ones such as `\cancel`.
6. **`docs/NOTES-FORMAT.md`** is the file-format contract shared by the editor and the exporters.

### How it was checked

- 328 tests pass.
- Both agents drove their features in the app.
- After merging, the lead checked the whole chain end to end in headless Edge: typing in Document mode (heading, bold, formula, highlight, list), pasting an image, then exporting "Notes as Word" through the menu. Word opened the file, which had 1 equation and 1 image, and Word's PDF rendered correctly.

### Known gaps

- Images can't be resized. A deleted image leaves its file behind.
- Pasting Markdown text in Document mode inserts it as plain text.
- Editing a hand-formatted table re-aligns its pipes.
- In Word export: webp and svg images are not supported, `\color` is dropped, and a numbered list that starts at another number restarts at 1.
- The offline cache grew to about 8.6 MB (the maths fonts).

### Next

- Automatic PPTX to PDF conversion (proposed).
- Setting Estudio as the default PDF app in Windows (still pending from session 1).

## 2026-09-26, session 2

### Built

1. **Defaults.** The left sidebar starts closed, and the notebook opens in Write mode.
2. **Obsidian-style editing** in notebooks and notes.
   - **Pairs:** brackets and quotes close themselves. Selecting text and typing `*`, `_` or `` ` `` wraps it.
   - **Lists:** Enter continues bullet, numbered and checkbox lists. Tab and Shift+Tab indent and outdent. Enter on an empty item ends the list.
   - **Format keys:** Ctrl+B bold, Ctrl+I italic, Ctrl+Shift+X strikethrough, Ctrl+E code, Ctrl+Shift+H `==highlight==`, Ctrl+Enter ticks a checkbox.
   - **Styling:** headings and formatting are styled as you type, and checkboxes can be clicked. The editor font is now the UI font rather than monospace.
3. **Notes that can live anywhere.**
   - **The link is inside the note.** A notebook `.md` carries frontmatter: `estudio-doc: <id>` and `pdf: "[[name.pdf]]"`. Estudio finds the note by that id in any open vault, so it can be moved or renamed freely, including into an Obsidian vault opened as a second vault.
   - **Older notebooks:** a `name.md` next to its PDF is adopted automatically.
   - **Where new notebooks go:** next to the PDF by default, or a folder you choose. Set it from the notebook's ⋯ menu or the "Notebook location" command.
   - **Notes stored inside Estudio** can be sent to a vault with "Move notebook to a vault…".
4. **Download "Notes only (.md)".** Just the notebook text, without annotations or frontmatter. Page links become "(p. N)".
5. **Toolbar fix.** On narrow windows the colour dots were squashed and the controls overlapped. Now the view controls (fit page, fit text width, focus, ruler, page mode) fold into a ⋯ menu below about 1240 px.

### How it was checked

- 194 tests pass.
- The build agent drove every item in the browser, using sandboxed folders rather than real disk folders.
- The toolbar and defaults were checked with headless Edge at 960–1300 px wide.
- The local server (`scripts/serve.mjs`) was down after a restart, so it was started again.

### Still to discuss (from session 1)

- How to set Estudio as the default app for PDFs in Windows.

### New known gaps

- If two notes name the same PDF, the one with the shortest path wins.
- A note moved into a vault by another app while Estudio is running is only found on the next start, or when the old location goes missing.
- A "Quote to notebook" made while the vault is locked is lost.
- Standalone notes show their raw frontmatter.
- The notebook header wraps onto two lines at the default width.
- Obsidian edits made while the note is open in Estudio are still overwritten; only the frontmatter is kept.

## 2026-09-25, session 1

### Built

1. **v1 of Estudio.**
   - **Reader:** virtualised reader on pdf.js, zoom and fit modes, outline, thumbnails, search, dark and sepia page modes.
   - **Annotations:** highlight, underline and strike in six colours whose meanings you can edit; a pressure-aware pen; eraser; sticky notes; area clips. Undo and redo work for all of them.
   - **Study:** a Markdown notebook per document; flashcards (basic and cloze) scheduled with FSRS-5; focus mode, reading ruler and pomodoro timer.
   - **Everywhere:** a command palette (Ctrl+K); export to Markdown, to an annotated PDF, and as a JSON backup.
2. **Ideas from @XMihura** (who is building his own PDF reader):
   - Hovering a citation shows its bibliography entry, with an "Open paper" button (arXiv, DOI or URL) or "Search Scholar".
   - Zoom to text width with `w`, the toolbar button, or a two-finger tap.
3. **Notebook.**
   - **Panes:** they resize by dragging and remember their widths. A widen toggle (Shift+W) makes the notebook larger, and it can pop out into its own synced window.
   - **Editor:** now CodeMirror, and page links show as chips.
   - **Semi-automatic links:** Ctrl+L inserts the current page; typing `[[` suggests the current page, sections and highlights; dragging in a highlight or selection drops a quote with its link; "Auto links" tags each new paragraph with the page you were on.
4. **Files.**
   - **Install:** Estudio installs as a PWA from Edge. It then appears under "Open with" for PDFs and works offline.
   - **Saving:** annotations are saved into the PDF itself as standard annotations. Annotations from other apps are imported, and changes made elsewhere are merged.
   - **Vaults** (like Obsidian): a folder tree where you can create folders and notes, rename, move, delete and import. Each PDF's notebook is a `name.md` next to it, with links like `[[name.pdf#page=N|p. N]]`.
5. **Windows setup.** `scripts/install.ps1` builds the app, starts `scripts/serve.mjs` on `127.0.0.1:4173`, and opens Edge. Run it again after changes.

### Decisions

| Decision | Chosen | Why |
|---|---|---|
| Desktop shell | Installable web app (PWA) in Edge | Light and cross-platform. Tauri needs Rust and the C++ build tools, which the machine doesn't have. It stays an option for a native `.exe` and for mobile. |
| Document identity | pdf.js fingerprint; the trailer `/ID` is kept when saving | Notebooks and cards stay attached after the PDF is rewritten. |
| Where notes live | Vault: `.md` next to the PDF. Otherwise: IndexedDB | Compatible with Obsidian. |
| Cards and progress | IndexedDB | Simple for now. Not yet in the vault. |

### Status when we stopped

- 161 tests pass, the build is clean, and everything is committed on `main`.
- The user did not see "Install Estudio" in Edge, because Edge was still showing the cached first version. Fix: Ctrl+Shift+R, or Edge menu > Apps > Install this site as an app. **Next time: confirm the install worked.**
- Not yet tested on real disk files (only in the browser's sandbox storage): saving into PDFs and the vault actions. Try them on a copy first.

### To discuss next time (the user's list)

- The Markdown notebooks: how they should work and look.
- Which panels and features open by default.
- How to set Estudio as the default app for PDFs in Windows.

### Known gaps

- Two copies of the same PDF share annotations, and opening the second copy writes them into it.
- A notebook `.md` is overwritten if it is edited in Obsidian while the PDF is open. Renaming a PDF does not update links to it.
- Cards cannot be edited. Cards still in their learning steps come back straight away instead of after their minutes. There is no settings screen for the pomodoro lengths.
- The two-finger tap has not been tried on a real touch screen.
- Encrypted PDFs cannot be written to, so their annotations stay inside Estudio.

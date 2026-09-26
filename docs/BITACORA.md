# Bitácora

A running log of what was built, what was decided, and what is pending. Newest session first.

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

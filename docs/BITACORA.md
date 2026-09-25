# Bitácora

A running log of what was built, what was decided, and what is pending. Newest session first.

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

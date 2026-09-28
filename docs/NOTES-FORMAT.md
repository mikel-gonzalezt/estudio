# Notes file format

Notebooks and notes are Markdown files. This is the contract between the editor (Markdown mode and Document mode), the preview, and every exporter. Anything written here must round-trip through the Document-mode editor unchanged, apart from whitespace normalisation noted below.

## Frontmatter

Optional YAML block at the top. Estudio owns `estudio-doc` and `pdf`; every other key is preserved. Editors never show it as body text.

## Inline and block syntax

| Feature | Syntax | Notes |
|---|---|---|
| Headings | `#` to `######` | ATX only. |
| Bold, italic, strike | `**b**`, `*i*`, `~~s~~` | Writers emit these forms. Readers also accept `__b__` and `_i_`. |
| Highlight | `==text==` | Obsidian form. |
| Inline code, code block | `` `c` ``, fenced ```` ``` ```` | |
| Lists | `- item`, `1. item` | Nested by 4 spaces under both `- ` and `1. `. Readers follow CommonMark, so 2 or 3 spaces under `1. ` read the same. |
| Tasks | `- [ ] todo`, `- [x] done` | GFM. |
| Quote | `> text` | |
| Table | GFM pipe table with header and `---` row | Cells hold inline content only. Alignment colons are kept. |
| Page link | see `src/lib/pagelink.ts` | `[[pN]]`, `[[pN\|label]]`, `[[file.pdf#page=N]]`, `[[file.pdf#page=N\|label]]`. |
| Inline maths | `$x^2$` | No space right after the opening `$` or before the closing one; `\$` is a literal dollar. |
| Block maths | `$$` on its own line, LaTeX, `$$` on its own line | |
| Image | `![alt](path)` | See below. `![alt](path "title")` allowed. |
| Obsidian embed | `![[name.png]]` | Read and rendered; not written by Estudio. |
| Horizontal rule | `---` | |
| Empty line | `&nbsp;` alone as a paragraph | See below. |

## Empty lines

Markdown collapses blank lines, so a blank line between blocks is only a separator. An empty line the user wants to keep is a paragraph holding just `&nbsp;`:

```md
First line

&nbsp;

Second line
```

- Document mode writes each empty paragraph between blocks this way and reads each such paragraph back as an empty one. Empty paragraphs at the end of the note are not written.
- The preview, print and Word show it as an empty paragraph, and so does Obsidian. Markdown mode shows the source.
- Extra blank lines typed in Markdown mode stay in the file, byte for byte, but read as one separator everywhere, as in Obsidian and any other Markdown reader. Keeping them visible only in Estudio would make the preview disagree with the file's meaning, so the entity is the one way to ask for an empty line.
- Raw HTML such as `<br>` is shown as text in notes, so it cannot stand for an empty line.

## Images

- In a vault, a pasted or dropped image is saved as a file in an `attachments` folder next to the note, named `Pasted image YYYYMMDDHHmmss.png` (Obsidian's pattern, unique-ified). The note references it with a relative path, spaces encoded as `%20`: `![](attachments/Pasted%20image%2020260926143012.png)`.
- A notebook stored inside Estudio (IndexedDB) keeps image bytes in the `attachments` store and references them as `![](estudio-attachment:<id>)`.
- Moving a notebook (from IndexedDB or from another folder or vault) copies every image it references into `attachments/` beside the new file and rewrites the references in the forms above. An `![[name.png]]` embed keeps its name, unless the copy had to be renamed; then it names the copy's vault path.
- A figure clipped from the PDF is inserted as an image followed by its page link on the same line: `![Figure](attachments/…png) [[p4]]`.

All consumers resolve images through one function, exported from `src/lib/attachments.ts` (a note's `NoteFiles.resolve`):

```ts
type ResolvedImage = { bytes: Uint8Array; mime: string; width: number; height: number };
type ImageResolver = (src: string) => Promise<ResolvedImage | null>;
```

`src` is exactly what is inside the parentheses (or the `![[…]]` target). Resolution is relative to the note's folder, then the vault root, then any file in the vault with that name.

## Whitespace and normalisation

Document mode keeps the source of every top-level block the user did not edit, byte for byte, and the frontmatter verbatim. Only a block the user edited is written again, in the writer forms above:

- Once any block is edited, the body's line endings are written as `\n`.
- A table's cells are padded so the pipes line up; alignment is written as colons in the `---` row.
- `__b__` and `_i_` become `**b**` and `*i*`; lists use `-` and `1.`, nested by 4 spaces; a line break inside a paragraph is a plain newline.
- A backslash escape is written only where the text would otherwise read as markup. A lone `$` is written without one (`\$5` becomes `$5`); two `$` in one run of text are escaped.

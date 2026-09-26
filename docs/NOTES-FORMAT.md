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
| Lists | `- item`, `1. item` | Nested by 4 spaces. |
| Tasks | `- [ ] todo`, `- [x] done` | GFM. |
| Quote | `> text` | |
| Table | GFM pipe table with header and `---` row | Cells hold inline content only. Alignment colons are kept. |
| Page link | see `src/lib/pagelink.ts` | `[[pN]]`, `[[pN\|label]]`, `[[file.pdf#page=N]]`, `[[file.pdf#page=N\|label]]`. |
| Inline maths | `$x^2$` | No space right after the opening `$` or before the closing one; `\$` is a literal dollar. |
| Block maths | `$$` on its own line, LaTeX, `$$` on its own line | |
| Image | `![alt](path)` | See below. `![alt](path "title")` allowed. |
| Obsidian embed | `![[name.png]]` | Read and rendered; not written by Estudio. |
| Horizontal rule | `---` | |

## Images

- In a vault, a pasted or dropped image is saved as a file in an `attachments` folder next to the note, named `Pasted image YYYYMMDDHHmmss.png` (Obsidian's pattern, unique-ified). The note references it with a relative path, spaces encoded as `%20`: `![](attachments/Pasted%20image%2020260926143012.png)`.
- A notebook stored inside Estudio (IndexedDB) keeps image bytes in the `attachments` store and references them as `![](estudio-attachment:<id>)`. "Move notebook to a vault" writes those out as files and rewrites the references.
- A figure clipped from the PDF is inserted as an image followed by its page link on the same line: `![Figure](attachments/…png) [[p4]]`.

All consumers resolve images through one function:

```ts
type ResolvedImage = { bytes: Uint8Array; mime: string; width: number; height: number };
type ImageResolver = (src: string) => Promise<ResolvedImage | null>;
```

`src` is exactly what is inside the parentheses (or the `![[…]]` target). Resolution is relative to the note's folder, then the vault root, then any file in the vault with that name.

/** A '/'-separated path relative to the vault root; the root itself is ''. */
export type VaultPath = string;
export type NodeKind = 'dir' | 'pdf' | 'note';

export interface TreeNode { path: VaultPath; name: string; kind: NodeKind; children: VaultPath[] }
export type Tree = ReadonlyMap<VaultPath, TreeNode>;

/** What the file-system walk reports. */
export interface Entry { path: VaultPath; kind: 'file' | 'directory' }

export const ROOT: VaultPath = '';

/** Dotfiles and dot-folders (`.obsidian/`, `.estudio/`, `.git/`) never show up in the tree. */
export const isIgnored = (name: string) => name.startsWith('.');

export const nameOf = (p: VaultPath) => p.slice(p.lastIndexOf('/') + 1);
export const parentOf = (p: VaultPath): VaultPath => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : ROOT);
export const joinPath = (dir: VaultPath, name: string): VaultPath => (dir ? `${dir}/${name}` : name);
export const stemOf = (name: string) => name.replace(/\.[^.]+$/, '');

export function kindOf(name: string, isDir: boolean): NodeKind | null {
  if (isIgnored(name)) return null;
  if (isDir) return 'dir';
  if (/\.pdf$/i.test(name)) return 'pdf';
  if (/\.md$/i.test(name)) return 'note';
  return null;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function compare(a: TreeNode, b: TreeNode): number {
  if ((a.kind === 'dir') !== (b.kind === 'dir')) return a.kind === 'dir' ? -1 : 1;
  return collator.compare(a.name, b.name);
}

export const EMPTY_TREE: Tree = new Map([[ROOT, { path: ROOT, name: '', kind: 'dir', children: [] }]]);

/** Folders first, then files, each by natural name order. Unsupported files and ignored paths are dropped. */
export function buildTree(entries: readonly Entry[]): Tree {
  const tree = new Map<VaultPath, TreeNode>([[ROOT, { path: ROOT, name: '', kind: 'dir', children: [] }]]);
  const depth = (p: VaultPath) => p.split('/').length;
  for (const e of [...entries].sort((a, b) => depth(a.path) - depth(b.path))) {
    if (e.path.split('/').some(isIgnored)) continue;
    const kind = kindOf(nameOf(e.path), e.kind === 'directory');
    const parent = tree.get(parentOf(e.path));
    if (!kind || !parent || parent.kind !== 'dir') continue;
    tree.set(e.path, { path: e.path, name: nameOf(e.path), kind, children: [] });
    parent.children.push(e.path);
  }
  for (const node of tree.values()) node.children.sort((a, b) => compare(tree.get(a)!, tree.get(b)!));
  return tree;
}

export function childrenOf(tree: Tree, dir: VaultPath): TreeNode[] {
  return (tree.get(dir)?.children ?? []).map((p) => tree.get(p)!);
}

/** The Markdown notebook that belongs to a PDF: `<name>.md` beside `<name>.pdf`. */
export const notebookPathOf = (pdf: VaultPath): VaultPath => joinPath(parentOf(pdf), `${stemOf(nameOf(pdf))}.md`);

/** Files that travel with `path` on rename or move: a PDF's notebook. */
export function companionsOf(tree: Tree, path: VaultPath): VaultPath[] {
  if (tree.get(path)?.kind !== 'pdf') return [];
  const nb = notebookPathOf(path);
  return tree.has(nb) ? [nb] : [];
}

/** `name`, or `name (2)`, `name (3)`… so a new entry never overwrites an existing one in `dir`. */
export function uniqueName(tree: Tree, dir: VaultPath, name: string, alsoTaken: readonly string[] = []): string {
  const taken = new Set([...childrenOf(tree, dir).map((n) => n.name), ...alsoTaken].map((x) => x.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  const dot = name.lastIndexOf('.');
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
  for (let i = 2; ; i++) {
    const candidate = `${stem} (${i})${ext}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

export type NameProblem = 'empty' | 'invalid' | 'taken';

/** Checks a new name for an entry in `dir`; `self` is the entry being renamed, if any. */
export function checkName(tree: Tree, dir: VaultPath, name: string, self?: VaultPath): NameProblem | null {
  const n = name.trim();
  if (!n) return 'empty';
  if (/[\\/:*?"<>|]/.test(n) || n === '.' || n === '..' || isIgnored(n)) return 'invalid';
  const clash = childrenOf(tree, dir).find((c) => c.name.toLowerCase() === n.toLowerCase());
  return clash && clash.path !== self ? 'taken' : null;
}

/** A move is allowed into another folder that is neither the entry itself nor inside it, with no name clash. */
export function canMove(tree: Tree, from: VaultPath, toDir: VaultPath): boolean {
  const node = tree.get(from);
  const target = tree.get(toDir);
  if (!node || from === ROOT || !target || target.kind !== 'dir') return false;
  if (parentOf(from) === toDir) return false;
  if (toDir === from || toDir.startsWith(`${from}/`)) return false;
  return checkName(tree, toDir, node.name) === null;
}

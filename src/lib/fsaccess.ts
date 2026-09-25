type Mode = 'read' | 'readwrite';
type Permissioned = FileSystemHandle & {
  queryPermission?: (o: { mode: Mode }) => Promise<PermissionState>;
  requestPermission?: (o: { mode: Mode }) => Promise<PermissionState>;
};

export async function hasPermission(h: FileSystemHandle, mode: Mode): Promise<boolean> {
  const q = (h as Permissioned).queryPermission;
  return q ? (await q.call(h, { mode })) === 'granted' : true;
}

/** Prompts only when needed; must run inside a user gesture for the prompt to appear. */
export async function askPermission(h: FileSystemHandle, mode: Mode): Promise<boolean> {
  if (await hasPermission(h, mode)) return true;
  const r = (h as Permissioned).requestPermission;
  try {
    return r ? (await r.call(h, { mode })) === 'granted' : false;
  } catch {
    return false;
  }
}

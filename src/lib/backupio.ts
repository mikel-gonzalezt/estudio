import { makeBackup, parseBackup } from './backup';
import { exportAll, importAll } from './db';
import { download } from './download';

export async function downloadBackup() {
  const backup = makeBackup(await exportAll(), Date.now());
  const day = new Date().toISOString().slice(0, 10);
  download(JSON.stringify(backup, null, 1), `estudio-backup-${day}.json`, 'application/json');
}

/** Merges a backup into the database; records with the same id are replaced. */
export async function restoreBackup(file: File): Promise<{ docs: number; annotations: number; cards: number }> {
  const b = parseBackup(await file.text());
  await importAll(b);
  return { docs: b.docs.length, annotations: b.annotations.length, cards: b.cards.length };
}

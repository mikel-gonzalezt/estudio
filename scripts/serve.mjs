import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CSP_HEADER } from './csp.mjs';

// Keep the default port: IndexedDB is scoped to the origin, so another port shows an empty library.
const PORT = Number(process.env.PORT) || 4173;
const ROOT = resolve(process.env.DIST ?? fileURLToPath(new URL('../dist', import.meta.url)));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.bcmap': 'application/octet-stream',
  '.pfb': 'application/octet-stream',
  '.ttf': 'font/ttf',
};

async function resolveFile(urlPath) {
  const path = normalize(join(ROOT, decodeURIComponent(urlPath)));
  if (!path.startsWith(ROOT)) return null;
  const info = await stat(path).catch(() => null);
  if (info?.isFile()) return path;
  if (info?.isDirectory()) return resolveFile(join(urlPath, 'index.html'));
  return extname(path) ? null : join(ROOT, 'index.html');
}

createServer(async (req, res) => {
  const file = await resolveFile(new URL(req.url, 'http://x').pathname);
  if (!file) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, {
    'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': 'no-cache',
    'Content-Security-Policy': CSP_HEADER,
  });
  res.end(await readFile(file));
}).listen(PORT, '127.0.0.1', () => console.log(`Estudio on http://127.0.0.1:${PORT}`));

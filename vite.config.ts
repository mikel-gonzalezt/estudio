import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';
import { cpSync, createReadStream, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CSP } from './scripts/csp.mjs';

/** Where the app is served from: `/` locally, `/estudio/` on GitHub Pages. */
const base = process.env.BASE ?? '/';

/** Files fetched at runtime by URL, so they are served and copied as plain files: served path → source folder. */
const STATIC_DIRS: Record<string, string> = {
  // pdf.js fetches CMaps, standard fonts and wasm decoders.
  'pdfjs/cmaps': resolve('node_modules/pdfjs-dist/cmaps'),
  'pdfjs/standard_fonts': resolve('node_modules/pdfjs-dist/standard_fonts'),
  'pdfjs/wasm': resolve('node_modules/pdfjs-dist/wasm'),
  // MathLive's formula editor loads its fonts from `fontsDirectory`.
  'mathlive/fonts': resolve('node_modules/mathlive/fonts'),
};

function staticDirs(): Plugin {
  let outDir = 'dist';
  return {
    name: 'static-dirs',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = decodeURIComponent((req.url ?? '').split('?')[0] ?? '');
        const hit = Object.entries(STATIC_DIRS).find(([at]) => url.startsWith(`${base}${at}/`));
        if (!hit) return next();
        const file = join(hit[1], url.slice(base.length + hit[0].length + 1));
        if (!file.startsWith(hit[1]) || !existsSync(file) || !statSync(file).isFile()) return next();
        createReadStream(file).pipe(res);
      });
    },
    writeBundle() {
      for (const [at, from] of Object.entries(STATIC_DIRS)) cpSync(from, join(outDir, at), { recursive: true });
    },
  };
}

/** The built page carries its CSP as a <meta> tag, first in <head>, so hosts that cannot set headers still apply it. */
function cspMeta(): Plugin {
  return {
    name: 'csp-meta',
    apply: 'build',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' }],
  };
}

export default defineConfig({
  base,
  plugins: [
    svelte(),
    staticDirs(),
    cspMeta(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg', 'icon.ico', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'],
      manifest: {
        name: 'Estudio',
        short_name: 'Estudio',
        description: 'A PDF reader built for studying',
        theme_color: '#2f5d50',
        background_color: '#f6f5f1',
        display: 'standalone',
        // Windows draws app and file-type icons from raster images; an SVG alone leaves PDFs blank in Explorer.
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
        file_handlers: [
          {
            action: base,
            accept: { 'application/pdf': ['.pdf'] },
            icons: [
              { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
              { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
            ],
          },
        ],
        // A PDF opened from Explorer goes to the window that is already open, through launchQueue.
        launch_handler: { client_mode: ['focus-existing', 'auto'] },
      },
      workbox: {
        // Everything a PDF needs is precached so the installed app opens files with the local server stopped.
        globPatterns: ['**/*.{js,mjs,css,html,svg,ico,wasm,bcmap,pfb,ttf,woff2}', 'pdfjs/**/*', 'mathlive/fonts/*.woff2'],
        globIgnores: ['**/LICENSE*', 'pdfjs/wasm/quickjs*'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
    }),
  ],
  build: { target: 'es2022' },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});

import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';
import { cpSync, createReadStream, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const PDFJS_ASSETS = ['cmaps', 'standard_fonts', 'wasm'];
const pdfjsRoot = resolve('node_modules/pdfjs-dist');

// pdf.js fetches CMaps, standard fonts and wasm decoders at runtime by URL, so they must be served as plain files.
function pdfjsAssets(): Plugin {
  let outDir = 'dist';
  return {
    name: 'pdfjs-assets',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    configureServer(server) {
      server.middlewares.use('/pdfjs', (req, res, next) => {
        const file = join(pdfjsRoot, decodeURIComponent((req.url ?? '').split('?')[0] ?? ''));
        if (!file.startsWith(pdfjsRoot) || !existsSync(file) || !statSync(file).isFile()) return next();
        createReadStream(file).pipe(res);
      });
    },
    writeBundle() {
      for (const dir of PDFJS_ASSETS) cpSync(join(pdfjsRoot, dir), join(outDir, 'pdfjs', dir), { recursive: true });
    },
  };
}

export default defineConfig({
  plugins: [
    svelte(),
    pdfjsAssets(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Estudio',
        short_name: 'Estudio',
        description: 'A PDF reader built for studying',
        theme_color: '#2f5d50',
        background_color: '#f6f5f1',
        display: 'standalone',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
        file_handlers: [{ action: '/', accept: { 'application/pdf': ['.pdf'] } }],
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,svg}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/pdfjs/'),
            handler: 'CacheFirst',
            options: { cacheName: 'pdfjs-assets' },
          },
        ],
      },
    }),
  ],
  build: { target: 'es2022' },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});

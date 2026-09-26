// The Content Security Policy of the built app. vite.config.ts writes it into index.html as a
// <meta> tag, which is all GitHub Pages can carry; scripts/serve.mjs also sends it as a header.
export const CSP = [
  "default-src 'self'",
  // pdf.js and its image decoders compile WebAssembly.
  "script-src 'self' 'wasm-unsafe-eval'",
  // Svelte, KaTeX, TipTap, CodeMirror and MathLive set inline styles.
  "style-src 'self' 'unsafe-inline'",
  // https: serves remote images in notes, which load only after a click.
  "img-src 'self' blob: data: https:",
  "font-src 'self' data:",
  // Images in notes are read with fetch() for the Word export: data: and blob: ones, and remote ones once loaded.
  "connect-src 'self' blob: data: https:",
  "worker-src 'self' blob:",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

/** frame-ancestors is ignored in a <meta> tag, so only the header carries it. */
export const CSP_HEADER = `${CSP}; frame-ancestors 'none'`;

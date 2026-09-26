import type { ResolvedImage } from './docx';
import temmlCss from 'temml/dist/Temml-Local.css?raw';
import { latexToMathml } from './omml';

const FONT_PX = 15;
const DENSITY = 3;
/** Temml's stylesheet draws what Chromium's MathML leaves out, such as `\cancel` strokes. */
const CSS = `${temmlCss}\nmath.tml-display{display:inline-block;width:auto}`;
const BOX = `display:inline-block;padding:2px;font-size:${FONT_PX}px;color:#000;background:#fff`;

/**
 * A formula drawn by the browser's own MathML layout into a PNG, for formulas Word cannot take as
 * an equation. `width` and `height` are the size to show it at, in px; the pixels are denser.
 */
export async function renderFormulaPng(latex: string, display: boolean): Promise<ResolvedImage | null> {
  const formula = `<div style="${BOX}">${latexToMathml(latex, display)}</div>`;
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;left:-10000px;top:0';
  probe.attachShadow({ mode: 'open' }).innerHTML = `<style>${CSS}</style>${formula}`;
  document.body.append(probe);
  const box = probe.shadowRoot!.lastElementChild!.getBoundingClientRect();
  probe.remove();
  const width = Math.ceil(box.width);
  const height = Math.ceil(box.height);
  if (!width || !height) return null;

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml"><style><![CDATA[${CSS}]]></style>${formula}</div></foreignObject></svg>`;
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();

  const canvas = document.createElement('canvas');
  canvas.width = width * DENSITY;
  canvas.height = height * DENSITY;
  const g = canvas.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.scale(DENSITY, DENSITY);
  g.drawImage(img, 0, 0);
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/png'));
  if (!blob) return null;
  return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: 'image/png', width, height };
}

// Writes samples/sample-study.pdf, the study document used for the screenshots in README.md and docs/GUIA.md.
// Run: node scripts/make-sample-pdf.mjs
import { writeFileSync } from 'node:fs';
import { PDFDocument, PDFHexString, PDFName, PDFNull, PDFNumber, StandardFonts, rgb } from 'pdf-lib';

const W = 595;
const H = 842;
const M = 72;
const INK = rgb(0.13, 0.13, 0.13);
const GREEN = rgb(0.18, 0.36, 0.31);
const LEAF = rgb(0.55, 0.75, 0.45);
const PALE = rgb(0.88, 0.94, 0.85);

const doc = await PDFDocument.create();
doc.setTitle('Apuntes de Biología: la fotosíntesis');
doc.setAuthor('Estudio sample');
doc.setLanguage('es-ES');
const regular = await doc.embedFont(StandardFonts.TimesRoman);
const italic = await doc.embedFont(StandardFonts.TimesRomanItalic);
const bold = await doc.embedFont(StandardFonts.HelveticaBold);
const sans = await doc.embedFont(StandardFonts.Helvetica);

function wrap(text, font, size, width) {
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > width && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

class Page {
  constructor(n) {
    this.page = doc.addPage([W, H]);
    this.y = H - M;
    this.n = n;
    this.page.drawText('Biología 2.º Bachillerato · Tema 4', { x: M, y: H - 40, size: 9, font: sans, color: rgb(0.45, 0.45, 0.45) });
    this.page.drawText(String(n), { x: W - M, y: 40, size: 10, font: sans, color: rgb(0.45, 0.45, 0.45) });
  }
  heading(text, size = 18) {
    this.y -= size * 0.6;
    this.page.drawText(text, { x: M, y: this.y - size, size, font: bold, color: GREEN });
    this.top = this.y;
    this.y -= size + 14;
  }
  para(text, { font = regular, size = 12, indent = 0 } = {}) {
    for (const l of wrap(text, font, size, W - 2 * M - indent)) {
      this.page.drawText(l, { x: M + indent, y: this.y - size, size, font, color: INK });
      this.y -= size * 1.45;
    }
    this.y -= 8;
  }
  bullets(items) {
    for (const it of items) {
      this.page.drawText('•', { x: M + 6, y: this.y - 12, size: 12, font: regular, color: INK });
      this.para(it, { indent: 22 });
      this.y += 4;
    }
    this.y -= 6;
  }
  caption(text) {
    this.para(text, { font: italic, size: 10.5 });
  }
}

const outline = [];
const pages = [];
const section = (title, page) => outline.push({ title, page: page.page, top: page.top });

let p = new Page(1);
pages.push(p);
p.y -= 40;
p.page.drawText('Tema 4', { x: M, y: p.y, size: 14, font: sans, color: GREEN });
p.y -= 16;
p.heading('La fotosíntesis', 30);
section('Tema 4. La fotosíntesis', p);
p.para('Apuntes de clase para repasar antes del examen. Cada apartado termina con las ideas clave; al final hay preguntas de repaso.', { font: italic });
p.y -= 10;
p.heading('Introducción', 16);
section('Introducción', p);
p.para('La fotosíntesis es el proceso por el que las plantas, las algas y algunas bacterias transforman la energía de la luz en energía química. Con ella fabrican materia orgánica a partir de dióxido de carbono y agua, y liberan oxígeno a la atmósfera.');
p.para('Casi toda la vida de la Tierra depende de este proceso. Los organismos fotosintéticos son los productores de los ecosistemas: los herbívoros se alimentan de ellos, y los carnívoros de los herbívoros. Además, el oxígeno que respiramos procede de la fotosíntesis.');
p.para('La ecuación global resume el proceso, aunque en realidad ocurre en muchas reacciones encadenadas:');
p.page.drawRectangle({ x: M, y: p.y - 44, width: W - 2 * M, height: 40, color: PALE });
p.page.drawText('6 CO2 + 6 H2O + luz  =>  C6H12O6 + 6 O2', { x: M + 90, y: p.y - 30, size: 14, font: sans, color: INK });
p.y -= 62;
p.para('Los reactivos son el dióxido de carbono y el agua. Los productos son la glucosa, que la planta usa como fuente de energía y de carbono, y el oxígeno, que se libera como producto secundario.');

p = new Page(2);
pages.push(p);
p.heading('1. Dónde ocurre: el cloroplasto');
section('1. El cloroplasto', p);
p.para('En las plantas, la fotosíntesis tiene lugar en los cloroplastos, orgánulos que abundan en las células del parénquima de las hojas. Un cloroplasto tiene una doble membrana que encierra un medio líquido, el estroma.');
p.para('Dentro del estroma hay unos sacos aplanados, los tilacoides, que se apilan formando grana. En la membrana de los tilacoides está la clorofila, el pigmento verde que capta la luz.');
const cx = W / 2;
const cy = p.y - 130;
p.page.drawEllipse({ x: cx, y: cy, xScale: 200, yScale: 105, color: PALE, borderColor: GREEN, borderWidth: 2.5 });
p.page.drawEllipse({ x: cx, y: cy, xScale: 190, yScale: 96, borderColor: GREEN, borderWidth: 1 });
for (const [gx, gy] of [[-110, 10], [-30, -30], [50, 20], [120, -20]]) {
  for (let i = 0; i < 5; i++) p.page.drawEllipse({ x: cx + gx, y: cy + gy - 22 + i * 11, xScale: 26, yScale: 5, color: LEAF, borderColor: GREEN, borderWidth: 0.8 });
}
const label = (t, x, y, tx, ty) => {
  p.page.drawLine({ start: { x, y }, end: { x: tx, y: ty }, thickness: 0.8, color: INK });
  p.page.drawText(t, { x: tx + 4, y: ty - 4, size: 10, font: sans, color: INK });
};
label('Tilacoides (grana)', cx + 146, cy - 20, cx + 150, cy - 125);
label('Estroma', cx - 70, cy + 50, cx - 180, cy + 120);
label('Doble membrana', cx + 150, cy + 64, cx + 170, cy + 120);
p.y = cy - 150;
p.caption('Figura 1. Esquema de un cloroplasto. Los tilacoides apilados forman los grana.');
p.para('Ideas clave: la fase luminosa ocurre en la membrana de los tilacoides; el ciclo de Calvin, en el estroma.', { font: italic });

p = new Page(3);
pages.push(p);
p.heading('2. La fase luminosa');
section('2. La fase luminosa', p);
p.para('En la fase luminosa, la energía de la luz se convierte en energía química. La clorofila de los fotosistemas absorbe fotones y cede electrones excitados a una cadena de transporte situada en la membrana del tilacoide.');
p.para('Para reponer esos electrones, el agua se rompe (fotólisis del agua) y se libera oxígeno. Por eso el oxígeno de la fotosíntesis procede del agua y no del dióxido de carbono.');
p.para('El paso de los electrones por la cadena bombea protones hacia el interior del tilacoide. Al volver al estroma a través de la ATP sintasa, esos protones impulsan la síntesis de ATP. Al final de la cadena, los electrones reducen el NADP+ a NADPH.');
p.para('Productos de la fase luminosa:');
p.bullets([
  'ATP, la moneda energética de la célula.',
  'NADPH, que aporta el poder reductor.',
  'O2, que se libera a la atmósfera.',
]);
p.para('El ATP y el NADPH no salen del cloroplasto: se usan enseguida en el estroma, en la fase oscura o ciclo de Calvin.');

p = new Page(4);
pages.push(p);
p.heading('3. El ciclo de Calvin');
section('3. El ciclo de Calvin', p);
p.para('El ciclo de Calvin fija el carbono. Tiene lugar en el estroma y no necesita luz directamente, aunque depende del ATP y el NADPH de la fase luminosa. Se divide en tres etapas:');
p.bullets([
  'Fijación: la enzima RuBisCO une el CO2 a la ribulosa-1,5-bisfosfato (RuBP).',
  'Reducción: con ATP y NADPH se obtiene gliceraldehído-3-fosfato (G3P).',
  'Regeneración: parte del G3P vuelve a formar RuBP para que el ciclo continúe.',
]);
const rx = W / 2;
const ry = p.y - 120;
p.page.drawCircle({ x: rx, y: ry, size: 85, borderColor: GREEN, borderWidth: 3 });
const stage = (t, x, y) => {
  const w = sans.widthOfTextAtSize(t, 11) + 16;
  p.page.drawRectangle({ x: x - w / 2, y: y - 10, width: w, height: 22, color: rgb(1, 1, 1), borderColor: GREEN, borderWidth: 1.2 });
  p.page.drawText(t, { x: x - w / 2 + 8, y: y - 3, size: 11, font: sans, color: INK });
};
stage('Fijación', rx, ry + 85);
stage('Reducción', rx + 85, ry - 40);
stage('Regeneración', rx - 85, ry - 40);
p.page.drawText('CO2', { x: rx - 12, y: ry + 125, size: 12, font: bold, color: GREEN });
p.page.drawLine({ start: { x: rx, y: ry + 120 }, end: { x: rx, y: ry + 98 }, thickness: 1.5, color: GREEN });
p.page.drawText('ATP, NADPH', { x: rx + 110, y: ry + 10, size: 11, font: sans, color: INK });
p.page.drawText('G3P  =>  glucosa', { x: rx + 30, y: ry - 110, size: 11, font: sans, color: INK });
p.y = ry - 135;
p.caption('Figura 2. Las tres etapas del ciclo de Calvin. Por cada 3 CO2 fijados sale 1 G3P.');
p.para('Para formar una molécula de glucosa hacen falta seis vueltas del ciclo, es decir, seis moléculas de CO2.');

p = new Page(5);
pages.push(p);
p.heading('4. Factores que afectan a la fotosíntesis');
section('4. Factores limitantes', p);
p.para('La velocidad de la fotosíntesis depende de varios factores. El que está en menor cantidad respecto a lo que la planta necesita limita el proceso: es el factor limitante.');
p.bullets([
  'Intensidad de la luz: al aumentar, la velocidad crece hasta que se satura.',
  'Concentración de CO2: más CO2 aumenta la fijación, hasta un máximo.',
  'Temperatura: las enzimas tienen un óptimo; por encima se desnaturalizan.',
]);
const gx0 = M + 40;
const gy0 = p.y - 190;
p.page.drawLine({ start: { x: gx0, y: gy0 }, end: { x: gx0 + 360, y: gy0 }, thickness: 1.2, color: INK });
p.page.drawLine({ start: { x: gx0, y: gy0 }, end: { x: gx0, y: gy0 + 170 }, thickness: 1.2, color: INK });
let prev = { x: gx0, y: gy0 + 8 };
for (let i = 1; i <= 36; i++) {
  const x = gx0 + i * 10;
  const y = gy0 + 8 + 140 * (1 - Math.exp(-i / 8));
  p.page.drawLine({ start: prev, end: { x, y }, thickness: 2.2, color: GREEN });
  prev = { x, y };
}
p.page.drawText('Intensidad de la luz', { x: gx0 + 240, y: gy0 - 18, size: 10, font: sans, color: INK });
p.page.drawText('Velocidad', { x: gx0 - 12, y: gy0 + 178, size: 10, font: sans, color: INK });
p.page.drawText('saturación', { x: gx0 + 280, y: gy0 + 158, size: 10, font: italic, color: INK });
p.y = gy0 - 36;
p.caption('Figura 3. Velocidad de la fotosíntesis frente a la intensidad de la luz.');
p.para('En los invernaderos se aprovecha esta idea: se añade CO2 y se controla la temperatura para que la luz sea el único factor limitante.');

p = new Page(6);
pages.push(p);
p.heading('5. Resumen');
section('5. Resumen', p);
p.bullets([
  'La fotosíntesis transforma la energía de la luz en energía química.',
  'Ocurre en los cloroplastos: fase luminosa en los tilacoides y ciclo de Calvin en el estroma.',
  'La fase luminosa produce ATP, NADPH y O2 a partir de agua y luz.',
  'El ciclo de Calvin usa ATP y NADPH para fijar CO2 y formar G3P.',
  'La luz, el CO2 y la temperatura limitan la velocidad del proceso.',
]);
p.heading('Preguntas de repaso', 16);
section('Preguntas de repaso', p);
p.bullets([
  '¿De qué molécula procede el oxígeno que se libera en la fotosíntesis?',
  '¿Qué enzima fija el CO2 en el ciclo de Calvin?',
  '¿Qué dos productos de la fase luminosa necesita el ciclo de Calvin?',
  '¿Qué es un factor limitante? Pon un ejemplo.',
  '¿Cuántas vueltas del ciclo de Calvin hacen falta para una glucosa?',
]);

const ctx = doc.context;
const outlinesRef = ctx.nextRef();
const refs = outline.map(() => ctx.nextRef());
outline.forEach((o, i) => {
  const dict = ctx.obj({
    Title: PDFHexString.fromText(o.title),
    Parent: outlinesRef,
    Dest: ctx.obj([o.page.ref, PDFName.of('XYZ'), PDFNull, PDFNumber.of(o.top + 20), PDFNull]),
  });
  if (i > 0) dict.set(PDFName.of('Prev'), refs[i - 1]);
  if (i < refs.length - 1) dict.set(PDFName.of('Next'), refs[i + 1]);
  ctx.assign(refs[i], dict);
});
ctx.assign(outlinesRef, ctx.obj({ Type: 'Outlines', First: refs[0], Last: refs.at(-1), Count: refs.length }));
doc.catalog.set(PDFName.of('Outlines'), outlinesRef);

writeFileSync(new URL('../samples/sample-study.pdf', import.meta.url), await doc.save());
console.log(`samples/sample-study.pdf: ${pages.length} pages, ${outline.length} outline entries`);

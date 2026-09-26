import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
// Renders the PNG app icons from public/icon.svg with headless Edge. Usage: node scripts/make-icons.mjs
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
const out = fileURLToPath(new URL("..", import.meta.url));
const dir = tmpdir();
rmSync(`${dir}/edge-icons`, { recursive: true, force: true });
const proc = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--disable-gpu', '--disable-extensions', '--remote-debugging-port=9350', `--user-data-dir=${dir}/edge-icons`, 'about:blank']);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let t; for (let i = 0; i < 50; i++) { try { t = await (await fetch('http://127.0.0.1:9350/json')).json(); break; } catch { await sleep(200); } }
const ws = new WebSocket(t.find(x => x.type === 'page').webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let id = 0; const p = new Map(); ws.onmessage = (m) => { const d = JSON.parse(m.data); if (p.has(d.id)) { p.get(d.id)(d.result); p.delete(d.id); } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; p.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Page.enable'); await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
const svg = readFileSync(`${out}/public/icon.svg`, 'utf8');
const inner = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const glyph = inner.replace(/<rect width="64" height="64"[^>]*\/>/, '');
const variants = {
  'icon-192.png': [192, svg],
  'icon-512.png': [512, svg],
  'icon-maskable-512.png': [512, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#2f5d50"/><g transform="translate(6.4 6.4) scale(0.8)">${glyph}</g></svg>`],
};
for (const [name, [size, s]] of Object.entries(variants)) {
  await send('Emulation.setDeviceMetricsOverride', { width: size, height: size, deviceScaleFactor: 1, mobile: false });
  const html = `<html><body style="margin:0;background:transparent">${s.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`;
  await send('Page.navigate', { url: 'data:text/html;base64,' + Buffer.from(html).toString('base64') }); await sleep(400);
  const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: size, height: size, scale: 1 } });
  writeFileSync(`${out}/public/${name}`, Buffer.from(shot.data, 'base64'));
}
ws.close(); proc.kill();

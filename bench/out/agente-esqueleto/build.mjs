// Monta um sprite a partir de um arquivo de desenho (design*.mjs), aplica contorno por material,
// espelha (desenho feito virado para a direita com luz da direita -> final virado para a esquerda, luz da esquerda),
// grava o projeto .anima.json e exporta PNGs (transparente e com fundo para conferência).
// Uso: node build.mjs <design.mjs> <tamanho> <nome-saida>
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const [designFile, sizeArg, outName] = process.argv.slice(2);
const N = Number(sizeArg);
const { draw, mirror = true } = await import(pathToFileURL(resolve(designFile)).href);

// paleta: chave -> [hex, nome, material]
export const PAL = {
  a: ['#f4efe2', 'osso-luz', 'osso'],
  b: ['#d8d2c3', 'osso', 'osso'],
  c: ['#a6a6b4', 'osso-sombra', 'osso'],
  d: ['#73738c', 'osso-sombra-funda', 'osso'],
  e: ['#8d8ea3', 'osso-tras', 'osso'],
  f: ['#5d5d78', 'osso-tras-sombra', 'osso'],
  k: ['#221a2c', 'orbita', 'osso'],
  o: ['#2c2436', 'contorno-osso', 'contorno'],
  r: ['#d9503f', 'bandana-luz', 'pano'],
  s: ['#ad3036', 'bandana', 'pano'],
  t: ['#741e34', 'bandana-sombra', 'pano'],
  u: ['#3a1022', 'contorno-pano', 'contorno'],
  l: ['#a77650', 'couro-luz', 'couro'],
  m: ['#7c5240', 'couro', 'couro'],
  n: ['#523433', 'couro-sombra', 'couro'],
  p: ['#2a1a1e', 'contorno-couro', 'contorno'],
  g: ['#f0c05a', 'ouro', 'metal'],
  h: ['#b07a34', 'ouro-sombra', 'metal'],
  v: ['#eef2f6', 'aco-luz', 'metal'],
  w: ['#b8bccb', 'aco', 'metal'],
  x: ['#7a7f97', 'aco-sombra', 'metal'],
  y: ['#22222f', 'contorno-aco', 'contorno'],
  z: ['#3f8fd6', 'fundo', 'fundo'],
  q: ['#2a6fb0', 'chao', 'fundo'],
};
const OUTLINE = { osso: 'o', pano: 'u', couro: 'p', metal: 'y' };
const PRIO = ['pano', 'couro', 'metal', 'osso'];

const grid = Array.from({ length: N }, () => Array(N).fill('.'));
const inb = (x, y) => x >= 0 && y >= 0 && x < N && y < N;
const api = {
  N,
  px(x, y, k) { if (inb(x, y)) grid[y][x] = k; },
  get(x, y) { return inb(x, y) ? grid[y][x] : '.'; },
  // rows: '.' e ' ' não mexem; '_' apaga
  rows(x0, y0, rows) {
    const w = rows[0].length;
    rows.forEach((r, i) => { if (r.length !== w) throw new Error(`largura ${r.length}!=${w} na linha ${i}: "${r}" (y0=${y0})`); });
    rows.forEach((r, j) => [...r].forEach((ch, i) => {
      if (ch === '.' || ch === ' ') return;
      api.px(x0 + i, y0 + j, ch === '_' ? '.' : ch);
    }));
  },
  line(x0, y0, x1, y1, k) {
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) { api.px(x0, y0, k); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
  },
};
draw(api);

// contorno por material: pixel vazio com vizinho (4-viz) pintado recebe o contorno do material vizinho
const mat = (k) => (PAL[k] ? PAL[k][2] : null);
const out = grid.map((r) => r.slice());
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
  if (grid[y][x] !== '.') continue;
  const ms = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => mat(api.get(x + dx, y + dy))).filter((m) => m && OUTLINE[m]);
  if (!ms.length) continue;
  const m = PRIO.find((p) => ms.includes(p));
  out[y][x] = OUTLINE[m];
}
let final = out.map((r) => r.join(''));
if (mirror) final = final.map((r) => [...r].reverse().join(''));
final.forEach((r) => { if (r.length !== N) throw new Error('largura'); });

const used = [...new Set(final.join('').replace(/\./g, ''))];
const colors = used.map((k) => ({ key: k, hex: PAL[k][0], name: PAL[k][1] }));
const proj = resolve(here, `${outName}.anima.json`);
const cli = resolve(repo, 'bin/anima.mjs');
const run = (...a) => execFileSync('node', [cli, ...a], { cwd: repo, encoding: 'utf8' });
run('new', proj, `${N}x${N}`, '8', '--camada', 'esqueleto');
const cmds = [
  { name: 'set_palette', input: { colors } },
  { name: 'draw_rows', input: { layer: 'esqueleto', rows: final, preview: false } },
];
const cmdFile = resolve(here, `${outName}.cmds.json`);
writeFileSync(cmdFile, JSON.stringify(cmds));
run('run', proj, cmdFile, '-q');
const scale = N <= 32 ? 14 : 8;
run('export', proj, resolve(here, `${outName}.png`), '--scale', String(scale), '--frame', '0');

// versão de conferência com fundo
const projBg = resolve(here, `${outName}.fundo.anima.json`);
run('new', projBg, `${N}x${N}`, '8', '--camada', 'fundo');
const bgRows = Array.from({ length: N }, (_, y) => (y >= N - 2 ? 'q' : 'z').repeat(N));
const cmdsBg = [
  { name: 'set_palette', input: { colors: [...colors, { key: 'z', hex: PAL.z[0], name: 'fundo' }, { key: 'q', hex: PAL.q[0], name: 'chao' }] } },
  { name: 'draw_rows', input: { layer: 'fundo', rows: bgRows, preview: false } },
  { name: 'add_layer', input: { name: 'esqueleto' } },
  { name: 'draw_rows', input: { layer: 'esqueleto', rows: final, preview: false } },
];
writeFileSync(cmdFile, JSON.stringify(cmdsBg));
run('run', projBg, cmdFile, '-q');
run('export', projBg, resolve(here, `${outName}.fundo.png`), '--scale', String(scale), '--frame', '0');
console.log(final.join('\n'));
console.log('cores:', used.length);

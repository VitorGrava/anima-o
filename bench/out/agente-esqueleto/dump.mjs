// imprime o desenho (sem contorno, orientação de desenho) com régua
import { pathToFileURL } from 'node:url'; import { resolve } from 'node:path';
const [f, n] = process.argv.slice(2); const N = +n;
const { draw } = await import(pathToFileURL(resolve(f)).href);
const grid = Array.from({ length: N }, () => Array(N).fill('.'));
const g = { N, px(x, y, k) { if (x >= 0 && y >= 0 && x < N && y < N) grid[y][x] = k; }, get(x, y) { return grid[y]?.[x] ?? '.'; },
  rows(x0, y0, rows) { rows.forEach((r, j) => [...r].forEach((ch, i) => { if (ch !== '.' && ch !== ' ') g.px(x0 + i, y0 + j, ch === '_' ? '.' : ch); })); },
  line(x0, y0, x1, y1, k) { const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let err = dx + dy; for (;;) { g.px(x0, y0, k); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } } } };
draw(g);
console.log('    ' + Array.from({ length: N }, (_, i) => i % 10).join(''));
grid.forEach((r, y) => console.log(String(y).padStart(3) + ' ' + r.join('')));

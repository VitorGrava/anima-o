// Renderiza um desenho 32 (sem contorno) numa grade e amplia 2x para o 64.
export function render32(draw) {
  const n = 32, grid = Array.from({ length: n }, () => Array(n).fill('.'));
  const inb = (x, y) => x >= 0 && y >= 0 && x < n && y < n;
  const api = {
    px(x, y, k) { if (inb(x, y)) grid[y][x] = k; },
    rows(x0, y0, rows) { rows.forEach((r, j) => [...r].forEach((ch, i) => { if (ch !== '.' && ch !== ' ') api.px(x0 + i, y0 + j, ch); })); },
    line(x0, y0, x1, y1, k) { const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let err = dx + dy; for (;;) { api.px(x0, y0, k); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } } },
  };
  draw(api);
  return grid;
}
export function upscale(g, draw) {
  const grid = render32(draw);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (grid[y][x] !== '.') for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) g.px(2 * x + a, 2 * y + b, grid[y][x]);
}

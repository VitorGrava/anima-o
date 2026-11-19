/**
 * Primitivas de desenho sobre uma cel (buffer de índices). Todas recortam
 * nas bordas, então coordenadas fora da tela são ignoradas silenciosamente.
 */

export interface Surface {
  width: number;
  height: number;
  data: Uint8Array;
}

export function setPixel(s: Surface, x: number, y: number, c: number): void {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= s.width || y >= s.height) return;
  s.data[y * s.width + x] = c;
}

export function getPixel(s: Surface, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= s.width || y >= s.height) return -1;
  return s.data[y * s.width + x];
}

/** Linha de Bresenham — sem anti-aliasing, como pixel art pede. */
export function line(s: Surface, x0: number, y0: number, x1: number, y1: number, c: number): void {
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    setPixel(s, x0, y0, c);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

export function rect(s: Surface, x: number, y: number, w: number, h: number, c: number, filled: boolean): void {
  if (w <= 0 || h <= 0) return;
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      if (filled || yy === y || yy === y + h - 1 || xx === x || xx === x + w - 1) setPixel(s, xx, yy, c);
    }
  }
}

/** Elipse dentro da caixa (x, y, w, h). Teste de pixel-centro: bordas limpas em tamanhos pequenos. */
export function ellipse(s: Surface, x: number, y: number, w: number, h: number, c: number, filled: boolean): void {
  if (w <= 0 || h <= 0) return;
  const rx = w / 2;
  const ry = h / 2;
  const cx = x + rx;
  const cy = y + ry;
  const inside = (px: number, py: number) => {
    const nx = (px + 0.5 - cx) / rx;
    const ny = (py + 0.5 - cy) / ry;
    return nx * nx + ny * ny <= 1.0001;
  };
  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) {
      if (!inside(px, py)) continue;
      if (filled) {
        setPixel(s, px, py, c);
      } else if (!inside(px - 1, py) || !inside(px + 1, py) || !inside(px, py - 1) || !inside(px, py + 1)) {
        setPixel(s, px, py, c);
      }
    }
  }
}

/** Balde de tinta (4-vizinhos). Retorna quantos pixels foram pintados. */
export function floodFill(s: Surface, x: number, y: number, c: number): number {
  const target = getPixel(s, x, y);
  if (target < 0 || target === c) return 0;
  const stack: number[] = [y * s.width + x];
  let count = 0;
  while (stack.length) {
    const i = stack.pop()!;
    if (s.data[i] !== target) continue;
    s.data[i] = c;
    count++;
    const px = i % s.width;
    const py = (i - px) / s.width;
    if (px > 0) stack.push(i - 1);
    if (px < s.width - 1) stack.push(i + 1);
    if (py > 0) stack.push(i - s.width);
    if (py < s.height - 1) stack.push(i + s.width);
  }
  return count;
}

/** Desloca o conteúdo; com wrap=true os pixels que saem reaparecem do outro lado. */
export function shift(s: Surface, dx: number, dy: number, wrap: boolean): void {
  const src = new Uint8Array(s.data);
  s.data.fill(0);
  for (let y = 0; y < s.height; y++) {
    for (let x = 0; x < s.width; x++) {
      let nx = x + dx;
      let ny = y + dy;
      if (wrap) {
        nx = ((nx % s.width) + s.width) % s.width;
        ny = ((ny % s.height) + s.height) % s.height;
      } else if (nx < 0 || ny < 0 || nx >= s.width || ny >= s.height) {
        continue;
      }
      s.data[ny * s.width + nx] = src[y * s.width + x];
    }
  }
}

export function flip(s: Surface, axis: "horizontal" | "vertical"): void {
  const src = new Uint8Array(s.data);
  for (let y = 0; y < s.height; y++) {
    for (let x = 0; x < s.width; x++) {
      const sx = axis === "horizontal" ? s.width - 1 - x : x;
      const sy = axis === "vertical" ? s.height - 1 - y : y;
      s.data[y * s.width + x] = src[sy * s.width + sx];
    }
  }
}

export function replaceColor(s: Surface, from: number, to: number): number {
  let n = 0;
  for (let i = 0; i < s.data.length; i++) {
    if (s.data[i] === from) {
      s.data[i] = to;
      n++;
    }
  }
  return n;
}

/** Contorno automático: pinta com `c` todo pixel transparente vizinho de um pixel opaco. */
export function outline(s: Surface, c: number, diagonal: boolean): number {
  const src = new Uint8Array(s.data);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= s.width || y >= s.height ? 0 : src[y * s.width + x]);
  let n = 0;
  for (let y = 0; y < s.height; y++) {
    for (let x = 0; x < s.width; x++) {
      if (src[y * s.width + x] !== 0) continue;
      let near = at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1);
      if (!near && diagonal) near = at(x - 1, y - 1) || at(x + 1, y - 1) || at(x - 1, y + 1) || at(x + 1, y + 1);
      if (near) {
        s.data[y * s.width + x] = c;
        n++;
      }
    }
  }
  return n;
}

/**
 * Gira o conteúdo em torno de (cx, cy). Ângulo em graus, positivo = horário.
 * Cada pixel de destino amostra 4x4 pontos na origem e fica com a cor opaca
 * mais votada (estilo RotSprite): linhas finas não somem e não há anti-aliasing.
 */
export function rotate(s: Surface, degrees: number, cx: number, cy: number): void {
  const src = new Uint8Array(s.data);
  const rad = (-degrees * Math.PI) / 180; // rotação inversa: destino -> origem
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const N = 4;
  const votes = new Map<number, number>();
  for (let y = 0; y < s.height; y++) {
    for (let x = 0; x < s.width; x++) {
      votes.clear();
      let opaque = 0;
      for (let sy = 0; sy < N; sy++) {
        for (let sx = 0; sx < N; sx++) {
          const dx = x + (sx + 0.5) / N - cx;
          const dy = y + (sy + 0.5) / N - cy;
          const ox = Math.floor(cx + dx * cos - dy * sin);
          const oy = Math.floor(cy + dx * sin + dy * cos);
          if (ox < 0 || oy < 0 || ox >= s.width || oy >= s.height) continue;
          const v = src[oy * s.width + ox];
          if (!v) continue;
          opaque++;
          votes.set(v, (votes.get(v) ?? 0) + 1);
        }
      }
      let best = 0;
      let bestN = 0;
      for (const [v, n] of votes) if (n > bestN || (n === bestN && v < best)) [best, bestN] = [v, n];
      // limiar < 50% preserva contornos de 1px em diagonais
      s.data[y * s.width + x] = opaque >= (N * N) * 0.375 ? best : 0;
    }
  }
}

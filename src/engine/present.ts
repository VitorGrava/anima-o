/**
 * Apresentação para exportar: escala automática, margem, fundo sólido, sombra no chão e ida-e-volta.
 * Tudo trabalha sobre índices de paleta (GIF e PNG saem com as cores exatas, sem quantizar).
 */
import { hexToRgb, type Project } from "./project.ts";
import { flattenFrame } from "./render.ts";

export interface PresentOptions {
  /** inteiro 1–16, ou omitido/0 para escolher sozinho (sprite ~512 px, cena ~960 px) */
  scale?: number;
  /** "#rrggbb" para fundo sólido; omitido = transparente */
  fundo?: string;
  /** margem em pixels do canvas, em volta */
  margem?: number;
  /** sombra elíptica no chão sob a figura (precisa de fundo no GIF; no PNG usa transparência) */
  sombra?: boolean;
}

export function autoExportScale(p: Project, margem = 0): number {
  const size = Math.max(p.width, p.height) + margem * 2;
  const target = Math.max(p.width, p.height) <= 64 ? 512 : 960;
  return Math.max(1, Math.min(16, Math.floor(target / size)));
}

export interface Presented { width: number; height: number; index: Uint8Array; palette: [number, number, number, number][] }

function figureBox(p: Project): { x0: number; x1: number; y1: number } | null {
  let x0 = p.width, x1 = -1, y1 = -1;
  for (let f = 0; f < p.frames.length; f++) {
    const flat = flattenFrame(p, f);
    for (let k = 0; k < flat.length; k++) if (flat[k]) { const x = k % p.width, y = (k - x) / p.width; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  }
  return x1 < 0 ? null : { x0, x1, y1 };
}

/** Um frame pronto para exportar: índice (0 = transparente) + paleta RGBA (inclui fundo e sombra se houver). */
export function presentFrame(p: Project, frame: number, o: PresentOptions = {}): Presented {
  const m = Math.max(0, Math.floor(o.margem ?? 0));
  const s = o.scale && o.scale > 0 ? Math.min(16, Math.round(o.scale)) : autoExportScale(p, m);
  const W = (p.width + m * 2) * s, H = (p.height + m * 2) * s;
  const pal: [number, number, number, number][] = [[0, 0, 0, 0], ...p.palette.map((c): [number, number, number, number] => [...hexToRgb(c.hex), 255])];
  const bgIdx = o.fundo ? pal.push([...hexToRgb(o.fundo), 255]) - 1 : 0;
  const index = new Uint8Array(W * H);
  if (bgIdx) index.fill(bgIdx);
  if (o.sombra) {
    const box = figureBox(p);
    if (box) {
      const shIdx = bgIdx ? pal.push(((): [number, number, number, number] => { const [r, g, b] = pal[bgIdx]; return [Math.round(r * 0.78), Math.round(g * 0.78), Math.round(b * 0.78), 255]; })()) - 1 : pal.push([0, 0, 0, 70]) - 1;
      const cx = (m + (box.x0 + box.x1 + 1) / 2) * s, cy = (m + box.y1 + 1) * s, rx = ((box.x1 - box.x0 + 1) * s) * 0.36, ry = Math.max(2, s * 1.3);
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) index[y * W + x] = shIdx;
      }
    }
  }
  const flat = flattenFrame(p, frame);
  for (let y = 0; y < p.height * s; y++) { const sy = Math.floor(y / s); for (let x = 0; x < p.width * s; x++) { const v = flat[sy * p.width + Math.floor(x / s)]; if (v) index[(y + m * s) * W + x + m * s] = v; } }
  return { width: W, height: H, index, palette: pal };
}

export function presentedToRGBA(pr: Presented): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(pr.width * pr.height * 4);
  for (let i = 0; i < pr.index.length; i++) { const c = pr.palette[pr.index[i]]; out.set(c, i * 4); }
  return out;
}

/** ordem dos frames: normal ou ida-e-volta (0..n-1..1, sem repetir as pontas) */
export function frameOrder(n: number, vaiEVolta?: boolean): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  return vaiEVolta && n > 2 ? [...a, ...a.slice(1, -1).reverse()] : a;
}

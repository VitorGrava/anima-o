/**
 * Representação em texto da arte: cada pixel vira o caractere-chave da sua cor.
 * É assim que a IA "lê" e "escreve" sprites com precisão de pixel.
 */
import { TRANSPARENT_KEY, colorIndex, type Project } from "./project.ts";
import { flattenFrame } from "./render.ts";

export function celToRows(p: Project, cel: Uint8Array): string[] {
  const rows: string[] = [];
  for (let y = 0; y < p.height; y++) {
    let r = "";
    for (let x = 0; x < p.width; x++) {
      const v = cel[y * p.width + x];
      r += v ? p.palette[v - 1]?.key ?? "?" : TRANSPARENT_KEY;
    }
    rows.push(r);
  }
  return rows;
}

export function frameToRows(p: Project, frameIndex: number): string[] {
  return celToRows(p, flattenFrame(p, frameIndex));
}

/** Região retangular do canvas, em pixels. */
export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Recorta uma região (já validada) de uma grade de linhas. */
export function cropRows(rows: string[], r: Region): string[] {
  return rows.slice(r.y, r.y + r.h).map((row) => row.slice(r.x, r.x + r.w));
}

/**
 * Grade com régua de coordenadas, para a IA localizar pixels.
 * Em recortes, (x0, y0) é o canto da região: a régua mostra as coordenadas reais do canvas.
 */
export function withRuler(rows: string[], x0 = 0, y0 = 0): string {
  if (!rows.length) return "";
  const w = rows[0].length;
  const pad = String(y0 + rows.length - 1).length;
  let tens = " ".repeat(pad + 1);
  let ones = " ".repeat(pad + 1);
  for (let x = 0; x < w; x++) {
    const ax = x0 + x;
    tens += ax % 10 === 0 ? String(Math.floor(ax / 10) % 10) : " ";
    ones += String(ax % 10);
  }
  const body = rows.map((r, y) => `${String(y0 + y).padStart(pad)} ${r}`);
  return [x0 + w >= 10 ? tens : null, ones, ...body].filter((l) => l !== null).join("\n");
}

/**
 * Desenha linhas de texto numa cel a partir de (x, y).
 * "." = transparente (apaga se `eraseWithDot`, senão mantém), " " = mantém o pixel atual.
 */
export function drawRows(
  p: Project,
  cel: Uint8Array,
  rows: string[],
  x0: number,
  y0: number,
  eraseWithDot: boolean,
): number {
  const lut = new Map<string, number>();
  let n = 0;
  rows.forEach((row, dy) => {
    [...row].forEach((ch, dx) => {
      if (ch === " ") return;
      if (ch === TRANSPARENT_KEY && !eraseWithDot) return;
      let idx = lut.get(ch);
      if (idx === undefined) {
        idx = colorIndex(p, ch);
        lut.set(ch, idx);
      }
      const x = x0 + dx;
      const y = y0 + dy;
      if (x < 0 || y < 0 || x >= p.width || y >= p.height) return;
      cel[y * p.width + x] = idx;
      if (idx) n++;
    });
  });
  return n;
}

/** Junta blocos de texto lado a lado (ex.: vários frames numa só vista). Cada bloco tem um rótulo na primeira linha. */
export function joinBlocks(blocks: { label: string; text: string }[], gap = 3): string {
  const cols = blocks.map((b) => b.text.split("\n"));
  const height = Math.max(...cols.map((c) => c.length));
  const widths = cols.map((c, i) => Math.max(blocks[i].label.length, ...c.map((l) => l.length)));
  const header = blocks.map((b, i) => b.label.padEnd(widths[i])).join(" ".repeat(gap));
  const lines = Array.from({ length: height }, (_, y) => cols.map((c, i) => (c[y] ?? "").padEnd(widths[i])).join(" ".repeat(gap)));
  return [header, ...lines].join("\n").replace(/[ ]+$/gm, "");
}

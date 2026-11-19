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

/** Grade com régua de coordenadas, para a IA localizar pixels. */
export function withRuler(rows: string[]): string {
  if (!rows.length) return "";
  const w = rows[0].length;
  const pad = String(rows.length - 1).length;
  let tens = " ".repeat(pad + 1);
  let ones = " ".repeat(pad + 1);
  for (let x = 0; x < w; x++) {
    tens += x % 10 === 0 ? String(Math.floor(x / 10) % 10) : " ";
    ones += String(x % 10);
  }
  const body = rows.map((r, y) => `${String(y).padStart(pad)} ${r}`);
  return [w >= 10 ? tens : null, ones, ...body].filter((l) => l !== null).join("\n");
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
      n++;
    });
  });
  return n;
}

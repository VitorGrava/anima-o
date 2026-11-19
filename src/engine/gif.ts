import * as gifenc from "gifenc";
import { frameDuration, hexToRgb, type Project } from "./project.ts";
import { flattenFrame } from "./render.ts";

// gifenc é ESM no navegador e CJS no Node; resolve o construtor nos dois casos.
const mod = gifenc as unknown as { GIFEncoder?: typeof gifenc.GIFEncoder; default?: { GIFEncoder?: typeof gifenc.GIFEncoder } };
const GIFEncoder = (mod.GIFEncoder ?? mod.default?.GIFEncoder)!;

/**
 * Exporta o projeto como GIF animado em loop. Como a engine já é indexada
 * (índice 0 = transparente), não há quantização: as cores saem exatas.
 */
export function exportGIF(p: Project, scale = 1): Uint8Array {
  const s = Math.max(1, Math.min(16, Math.round(scale)));
  // GIF exige paleta com tamanho potência de 2 (2..256)
  const palette: number[][] = [[0, 0, 0], ...p.palette.map((c) => hexToRgb(c.hex))];
  let size = 2;
  while (size < palette.length) size *= 2;
  while (palette.length < size) palette.push([0, 0, 0]);

  const W = p.width * s;
  const H = p.height * s;
  const gif = GIFEncoder();
  p.frames.forEach((_, i) => {
    const flat = flattenFrame(p, i);
    const index = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      const sy = Math.floor(y / s);
      for (let x = 0; x < W; x++) index[y * W + x] = flat[sy * p.width + Math.floor(x / s)];
    }
    gif.writeFrame(index, W, H, {
      palette,
      delay: frameDuration(p, i),
      transparent: true,
      transparentIndex: 0,
      dispose: 2,
      repeat: 0,
    });
  });
  gif.finish();
  return gif.bytes();
}

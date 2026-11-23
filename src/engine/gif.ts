import * as gifenc from "gifenc";
import { frameDuration, type Project } from "./project.ts";
import { frameOrder, presentFrame, type PresentOptions } from "./present.ts";

// gifenc é ESM no navegador e CJS no Node; resolve o construtor nos dois casos.
const mod = gifenc as unknown as { GIFEncoder?: typeof gifenc.GIFEncoder; default?: { GIFEncoder?: typeof gifenc.GIFEncoder } };
const GIFEncoder = (mod.GIFEncoder ?? mod.default?.GIFEncoder)!;

export interface GifOptions extends PresentOptions {
  /** ida e volta: 0,1,2,...,n-1,...,1 */
  vaiEVolta?: boolean;
}

/**
 * Exporta o projeto como GIF animado em loop. Como a engine já é indexada
 * (índice 0 = transparente), não há quantização: as cores saem exatas.
 * Opções: escala (omitida = automática), fundo sólido, margem, sombra no chão e ida-e-volta.
 */
export function exportGIF(p: Project, scale?: number | GifOptions, opts: GifOptions = {}): Uint8Array {
  const o: GifOptions = typeof scale === "object" ? scale : { ...opts, scale };
  const gif = GIFEncoder();
  for (const i of frameOrder(p.frames.length, o.vaiEVolta)) {
    const pr = presentFrame(p, i, o);
    let size = 2;
    while (size < pr.palette.length) size *= 2;
    const palette: number[][] = pr.palette.map((c) => [c[0], c[1], c[2]]);
    while (palette.length < size) palette.push([0, 0, 0]);
    const hasAlpha = pr.palette.some((c) => c[3] < 255);
    gif.writeFrame(pr.index, pr.width, pr.height, { palette, delay: frameDuration(p, i), transparent: hasAlpha, transparentIndex: 0, dispose: 2, repeat: 0 });
  }
  gif.finish();
  return gif.bytes();
}

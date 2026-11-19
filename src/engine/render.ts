import { hexToRgb, type Project } from "./project.ts";

/** Achata as camadas visíveis de um frame em índices de paleta (camada de cima vence). */
export function flattenFrame(p: Project, frameIndex: number): Uint8Array {
  const out = new Uint8Array(p.width * p.height);
  const frame = p.frames[frameIndex];
  if (!frame) return out;
  for (const layer of p.layers) {
    if (!layer.visible) continue;
    const cel = frame.cels[layer.id];
    if (!cel) continue;
    for (let i = 0; i < out.length; i++) if (cel[i] !== 0) out[i] = cel[i];
  }
  return out;
}

/** RGBA de um frame, opcionalmente ampliado por `scale` (vizinho mais próximo). */
export function renderFrameRGBA(
  p: Project,
  frameIndex: number,
  scale = 1,
  background?: string,
): { width: number; height: number; data: Uint8ClampedArray<ArrayBuffer> } {
  const flat = flattenFrame(p, frameIndex);
  const lut = p.palette.map((c) => hexToRgb(c.hex));
  const bg = background ? hexToRgb(background) : null;
  const W = p.width * scale;
  const H = p.height * scale;
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    const sy = Math.floor(y / scale);
    for (let x = 0; x < W; x++) {
      const idx = flat[sy * p.width + Math.floor(x / scale)];
      const o = (y * W + x) * 4;
      const rgb = idx ? lut[idx - 1] : bg;
      if (rgb) {
        data[o] = rgb[0];
        data[o + 1] = rgb[1];
        data[o + 2] = rgb[2];
        data[o + 3] = 255;
      }
    }
  }
  return { width: W, height: H, data };
}

/** Spritesheet RGBA: frames lado a lado, em `columns` colunas. */
export function renderSpritesheetRGBA(
  p: Project,
  columns = p.frames.length,
  scale = 1,
): { width: number; height: number; data: Uint8ClampedArray<ArrayBuffer> } {
  const cols = Math.max(1, Math.min(columns, p.frames.length));
  const rows = Math.ceil(p.frames.length / cols);
  const fw = p.width * scale;
  const fh = p.height * scale;
  const W = fw * cols;
  const H = fh * rows;
  const data = new Uint8ClampedArray(W * H * 4);
  p.frames.forEach((_, i) => {
    const img = renderFrameRGBA(p, i, scale);
    const ox = (i % cols) * fw;
    const oy = Math.floor(i / cols) * fh;
    for (let y = 0; y < fh; y++) {
      data.set(img.data.subarray(y * fw * 4, (y + 1) * fw * 4), ((oy + y) * W + ox) * 4);
    }
  });
  return { width: W, height: H, data };
}

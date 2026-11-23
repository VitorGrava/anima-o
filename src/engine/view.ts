/**
 * Imagens de conferência para a IA: recorte com zoom, grade com coordenadas,
 * diff entre frames, onion skin e marcação de pixels com problema.
 */
import { hexToRgb, type Project } from "./project.ts";
import type { Region } from "./ascii.ts";
import { flattenFrame, renderCheckRGBA, type CheckMode } from "./render.ts";

export type { Region };

export interface ImageRequest {
  frames: number[];
  scale: number;
  mode?: CheckMode;
  /** Recorta e amplia só esta área (coordenadas do canvas). */
  region?: Region;
  /** Desenha grade e números de coordenada nas margens. */
  grid?: boolean;
  /** Mostra o que mudou do frame `a` para o `b` (vermelho = sumiu, verde = apareceu, amarelo = trocou de cor). */
  compare?: { a: number; b: number };
  /** Mostra o frame anterior em azul translúcido atrás do frame atual. */
  onion?: boolean;
  /** Pixels a marcar em magenta (problemas encontrados pelo check). */
  highlight?: [number, number][];
  /** Região da MUDANÇA recente: devolve também uma imagem ampliada só dela, com grade (o zoom que a IA precisaria pedir). */
  foco?: Region;
  /** Divide o quadro em colunas x linhas de recortes, cada um ampliado com grade e coordenadas (inspeção de cenas grandes). */
  tiles?: { cols: number; rows: number };
  /** Esqueleto por frame: segmentos de osso (em coordenadas do canvas) a desenhar por cima. */
  bones?: Record<number, { name: string; x0: number; y0: number; x1: number; y1: number }[]>;
}

export interface RenderedImage {
  label: string;
  width: number;
  height: number;
  data: Uint8ClampedArray<ArrayBuffer>;
}

export function clampRegion(p: Project, r?: Region): Region {
  if (!r) return { x: 0, y: 0, w: p.width, h: p.height };
  const x = Math.max(0, Math.min(p.width - 1, Math.floor(r.x)));
  const y = Math.max(0, Math.min(p.height - 1, Math.floor(r.y)));
  return {
    x,
    y,
    w: Math.max(1, Math.min(Math.floor(r.w), p.width - x)),
    h: Math.max(1, Math.min(Math.floor(r.h), p.height - y)),
  };
}

/**
 * Escala automática para a IA ENXERGAR: o quadro inteiro ocupa ~1000 px na maior dimensão (uma cena 320x180
 * sai em 960x540, não em 320x180 minúsculo) e um recorte ~640 px. Limite de 32x.
 */
export function autoScale(p: Project, region?: Region): number {
  const target = region ? 640 : 1000;
  const size = region ? Math.max(region.w, region.h) : Math.max(p.width, p.height);
  return Math.max(1, Math.min(32, Math.floor(target / size)));
}

// ---------- imagem base (1 pixel por pixel) ----------

function diffImage(p: Project, a: number, b: number): Uint8ClampedArray<ArrayBuffer> {
  const fa = flattenFrame(p, a);
  const fb = flattenFrame(p, b);
  const out = new Uint8ClampedArray(p.width * p.height * 4);
  const paint = (o: number, rgb: number[]) => {
    out[o] = rgb[0];
    out[o + 1] = rgb[1];
    out[o + 2] = rgb[2];
    out[o + 3] = 255;
  };
  for (let i = 0; i < fa.length; i++) {
    if (fa[i] === fb[i]) paint(i * 4, fa[i] ? [138, 138, 152] : [32, 32, 40]);
    else if (fa[i] && !fb[i]) paint(i * 4, [255, 59, 59]);
    else if (!fa[i] && fb[i]) paint(i * 4, [59, 255, 106]);
    else paint(i * 4, [255, 210, 59]);
  }
  return out;
}

function baseImage(p: Project, frame: number, req: ImageRequest): Uint8ClampedArray<ArrayBuffer> {
  const mode = req.mode ?? "normal";
  if (req.compare) return diffImage(p, req.compare.a, req.compare.b);
  const img = renderCheckRGBA(p, frame, 1, mode);
  if (req.onion && (mode === "normal" || mode === "cinza") && p.frames.length > 1) {
    const prevIdx = frame > 0 ? frame - 1 : p.frames.length - 1;
    const cur = flattenFrame(p, frame);
    const prev = flattenFrame(p, prevIdx);
    const lut = p.palette.map((c) => hexToRgb(c.hex));
    for (let i = 0; i < cur.length; i++) {
      if (cur[i] || !prev[i]) continue;
      const c = lut[prev[i] - 1];
      const o = i * 4;
      for (let k = 0; k < 3; k++) {
        const tinted = (c[k] + [80, 120, 255][k]) / 2;
        img.data[o + k] = Math.round(img.data[o + k] * 0.5 + tinted * 0.5);
      }
    }
  }
  return img.data;
}

// ---------- fonte mínima 3x5 para os números da grade ----------

const FONT: Record<string, string[]> = {
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "010", "010", "010"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],
};
const GLYPH_W = 8; // 3 colunas x2 + 2 de espaço
const GLYPH_H = 10;

function drawText(buf: Uint8ClampedArray, W: number, text: string, px: number, py: number) {
  for (let c = 0; c < text.length; c++) {
    const g = FONT[text[c]];
    if (!g) continue;
    for (let gy = 0; gy < 5; gy++) {
      for (let gx = 0; gx < 3; gx++) {
        if (g[gy][gx] !== "1") continue;
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const x = px + c * GLYPH_W + gx * 2 + dx;
            const y = py + gy * 2 + dy;
            const o = (y * W + x) * 4;
            if (o < 0 || o + 3 >= buf.length) continue;
            buf[o] = buf[o + 1] = buf[o + 2] = 235;
            buf[o + 3] = 255;
          }
        }
      }
    }
  }
}

function labelStep(scale: number, minPx: number): number {
  for (const s of [1, 2, 5, 10, 20, 50, 100]) if (s * scale >= minPx) return s;
  return 100;
}

// ---------- ampliação com grade ----------

function enlarge(
  src: Uint8ClampedArray,
  srcW: number,
  region: Region,
  scale: number,
  grid: boolean,
  highlight: [number, number][] | undefined,
  bones?: { x0: number; y0: number; x1: number; y1: number }[],
): { width: number; height: number; data: Uint8ClampedArray<ArrayBuffer> } {
  const digitsX = String(region.x + region.w - 1).length;
  const digitsY = String(region.y + region.h - 1).length;
  const ml = grid ? digitsY * GLYPH_W + 6 : 0;
  const mt = grid ? GLYPH_H + 6 : 0;
  const W = ml + region.w * scale;
  const H = mt + region.h * scale;
  const data = new Uint8ClampedArray(W * H * 4);

  if (grid) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = data[i + 1] = data[i + 2] = 30;
      data[i + 3] = 255;
    }
  }

  for (let y = 0; y < region.h * scale; y++) {
    const sy = region.y + Math.floor(y / scale);
    for (let x = 0; x < region.w * scale; x++) {
      const sx = region.x + Math.floor(x / scale);
      const s = (sy * srcW + sx) * 4;
      const o = ((mt + y) * W + ml + x) * 4;
      data[o] = src[s];
      data[o + 1] = src[s + 1];
      data[o + 2] = src[s + 2];
      data[o + 3] = 255;
    }
  }

  if (grid && scale >= 4) {
    const blend = (o: number, a: number) => {
      const lum = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
      const t = lum >= 128 ? 0 : 255;
      for (let k = 0; k < 3; k++) data[o + k] = Math.round(data[o + k] * (1 - a) + t * a);
    };
    for (let i = 0; i <= region.w; i++) {
      const ax = region.x + i;
      const a = ax % 10 === 0 ? 0.75 : ax % 5 === 0 ? 0.55 : 0.32;
      const x = ml + i * scale;
      if (x >= W) continue;
      for (let y = 0; y < region.h * scale; y++) blend(((mt + y) * W + x) * 4, a);
    }
    for (let j = 0; j <= region.h; j++) {
      const ay = region.y + j;
      const a = ay % 10 === 0 ? 0.75 : ay % 5 === 0 ? 0.55 : 0.32;
      const y = mt + j * scale;
      if (y >= H) continue;
      for (let x = 0; x < region.w * scale; x++) blend((y * W + ml + x) * 4, a);
    }
  }

  if (highlight) {
    for (const [hx, hy] of highlight) {
      if (hx < region.x || hy < region.y || hx >= region.x + region.w || hy >= region.y + region.h) continue;
      const x0 = ml + (hx - region.x) * scale;
      const y0 = mt + (hy - region.y) * scale;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const border = dx === 0 || dy === 0 || dx === scale - 1 || dy === scale - 1;
          if (scale >= 4 && !border) continue;
          const o = ((y0 + dy) * W + x0 + dx) * 4;
          data[o] = 255;
          data[o + 1] = 0;
          data[o + 2] = 220;
          data[o + 3] = 255;
        }
      }
    }
  }

  if (bones?.length) {
    const toPx = (x: number, y: number) => ({ x: ml + (x - region.x) * scale, y: mt + (y - region.y) * scale });
    const dot = (cx: number, cy: number, r: number, rgb: [number, number, number]) => {
      for (let y = Math.round(cy - r); y <= Math.round(cy + r); y++) for (let x = Math.round(cx - r); x <= Math.round(cx + r); x++) {
        if (x < 0 || y < 0 || x >= W || y >= H || Math.hypot(x - cx, y - cy) > r) continue;
        const o = (y * W + x) * 4; data[o] = rgb[0]; data[o + 1] = rgb[1]; data[o + 2] = rgb[2]; data[o + 3] = 255;
      }
    };
    const thick = Math.max(1, Math.round(scale / 6));
    for (const b of bones) {
      const a = toPx(b.x0, b.y0), c = toPx(b.x1, b.y1);
      const steps = Math.max(2, Math.ceil(Math.hypot(c.x - a.x, c.y - a.y)));
      for (let k = 0; k <= steps; k++) dot(a.x + ((c.x - a.x) * k) / steps, a.y + ((c.y - a.y) * k) / steps, thick, [0, 230, 255]);
    }
    for (const b of bones) { const a = toPx(b.x0, b.y0); dot(a.x, a.y, thick + 1.5, [255, 0, 220]); }
  }

  if (grid) {
    const sx = labelStep(scale, digitsX * GLYPH_W + 3);
    for (let i = 0; i < region.w; i++) {
      const ax = region.x + i;
      if (ax % sx === 0) drawText(data, W, String(ax), ml + i * scale + 1, 3);
    }
    const sy = labelStep(scale, GLYPH_H + 2);
    for (let j = 0; j < region.h; j++) {
      const ay = region.y + j;
      if (ay % sy === 0) drawText(data, W, String(ay), 3, mt + j * scale + Math.max(0, Math.floor((scale - GLYPH_H) / 2)));
    }
  }

  return { width: W, height: H, data };
}

/** Renderiza as imagens pedidas por um comando (uma por frame, ou uma só no modo compare). */
export function renderImages(p: Project, req: ImageRequest): RenderedImage[] {
  const region = clampRegion(p, req.region);
  const notes = [
    req.region ? `região x${region.x}..${region.x + region.w - 1} y${region.y}..${region.y + region.h - 1}` : "",
    req.grid ? "grade" : "",
    req.mode && req.mode !== "normal" ? `conferência: ${req.mode}` : "",
  ].filter(Boolean);

  const make = (frame: number, label: string, reg: Region = region, scale: number = req.scale, grid: boolean = !!req.grid): RenderedImage => {
    const base = baseImage(p, frame, req);
    const img = enlarge(base, p.width, reg, scale, grid, req.highlight, req.bones?.[frame]);
    return { label: [label, ...notes].join(", "), ...img };
  };

  if (req.tiles && !req.compare) {
    const out: RenderedImage[] = [];
    const f = req.frames[0] ?? 0;
    const tw = Math.ceil(p.width / req.tiles.cols), th = Math.ceil(p.height / req.tiles.rows);
    for (let r = 0; r < req.tiles.rows; r++) for (let c = 0; c < req.tiles.cols; c++) {
      const reg = clampRegion(p, { x: c * tw, y: r * th, w: tw, h: th });
      out.push(make(f, `quadrante ${c + 1},${r + 1} (coluna,linha) x${reg.x}..${reg.x + reg.w - 1} y${reg.y}..${reg.y + reg.h - 1} do frame ${f}`, reg, autoScale(p, reg), true));
    }
    return out;
  }

  if (req.compare) {
    const { a, b } = req.compare;
    return [make(b, `diff do frame ${a} para o ${b} (vermelho = sumiu, verde = apareceu, amarelo = trocou de cor, cinza = igual)`)];
  }
  const imgs = req.frames.map((f) =>
    make(f, `frame ${f}${req.onion ? " com onion skin (frame anterior em azul)" : ""}${!req.mode || req.mode === "normal" ? " (fundo cinza = transparente)" : ""}`),
  );
  if (req.foco && req.frames.length) {
    const reg = clampRegion(p, req.foco);
    imgs.push(make(req.frames[0], `ZOOM NA MUDANÇA x${reg.x}..${reg.x + reg.w - 1} y${reg.y}..${reg.y + reg.h - 1}`, reg, autoScale(p, reg), true));
  }
  return imgs;
}

/** Texto do diff: # igual, . vazio, + apareceu, - sumiu, ~ trocou de cor. */
export function diffRows(p: Project, a: number, b: number): { rows: string[]; added: number; removed: number; changed: number } {
  const fa = flattenFrame(p, a);
  const fb = flattenFrame(p, b);
  let added = 0;
  let removed = 0;
  let changed = 0;
  const rows: string[] = [];
  for (let y = 0; y < p.height; y++) {
    let r = "";
    for (let x = 0; x < p.width; x++) {
      const i = y * p.width + x;
      if (fa[i] === fb[i]) r += fa[i] ? "#" : ".";
      else if (fa[i] && !fb[i]) (r += "-", removed++);
      else if (!fa[i] && fb[i]) (r += "+", added++);
      else (r += "~", changed++);
    }
    rows.push(r);
  }
  return { rows, added, removed, changed };
}

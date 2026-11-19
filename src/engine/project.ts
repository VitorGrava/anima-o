/**
 * Modelo de dados da engine.
 *
 * Um projeto é uma grade de células (cels): cada frame tem uma cel por camada.
 * Cada cel é um buffer de índices de paleta (0 = transparente), então o
 * projeto inteiro é "indexado" como um GIF — perfeito para pixel art.
 */

export const TRANSPARENT = 0;
export const TRANSPARENT_KEY = ".";
export const MAX_SIZE = 256;
export const MAX_COLORS = 255;
export const MAX_FRAMES = 128;
export const MAX_LAYERS = 16;

/** Caracteres válidos para chaves de cor (usados no desenho por texto/ASCII). */
export const KEY_CHARS =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ#@$%&*+=-~^!?:;<>/|";

export interface PaletteColor {
  /** Um caractere que representa a cor no desenho por texto. Nunca ".". */
  key: string;
  /** Cor em hex, "#rrggbb". */
  hex: string;
  /** Nome legível, ex. "pele", "contorno". */
  name: string;
}

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
}

export interface Frame {
  id: string;
  /** Duração deste frame em ms. Se ausente, usa 1000 / fps. */
  duration?: number;
  /** layerId -> pixels (índices da paleta + 1; 0 = transparente). */
  cels: Record<string, Uint8Array>;
}

export interface Project {
  name: string;
  width: number;
  height: number;
  fps: number;
  /** palette[i] corresponde ao índice de pixel i + 1. */
  palette: PaletteColor[];
  layers: Layer[];
  frames: Frame[];
}

let idCounter = 0;
export function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}${Date.now().toString(36)}${idCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function createProject(opts: Partial<Pick<Project, "name" | "width" | "height" | "fps">> = {}): Project {
  const width = clampSize(opts.width ?? 32);
  const height = clampSize(opts.height ?? 32);
  const layer: Layer = { id: newId("L"), name: "Base", visible: true };
  return {
    name: opts.name ?? "Sem título",
    width,
    height,
    fps: opts.fps ?? 8,
    palette: [
      { key: "0", hex: "#1a1c2c", name: "contorno" },
      { key: "1", hex: "#f4f4f4", name: "branco" },
    ],
    layers: [layer],
    frames: [{ id: newId("F"), cels: { [layer.id]: new Uint8Array(width * height) } }],
  };
}

export function clampSize(n: number): number {
  return Math.max(1, Math.min(MAX_SIZE, Math.round(n)));
}

export function cloneProject(p: Project): Project {
  return {
    ...p,
    palette: p.palette.map((c) => ({ ...c })),
    layers: p.layers.map((l) => ({ ...l })),
    frames: p.frames.map((f) => ({
      ...f,
      cels: Object.fromEntries(Object.entries(f.cels).map(([k, v]) => [k, new Uint8Array(v)])),
    })),
  };
}

export function getCel(p: Project, frameIndex: number, layerId: string): Uint8Array {
  const frame = p.frames[frameIndex];
  if (!frame) throw new Error(`Frame ${frameIndex} não existe (há ${p.frames.length} frames, índices 0..${p.frames.length - 1}).`);
  let cel = frame.cels[layerId];
  if (!cel) {
    cel = new Uint8Array(p.width * p.height);
    frame.cels[layerId] = cel;
  }
  return cel;
}

export function findLayer(p: Project, ref: string | undefined): Layer {
  if (ref === undefined) {
    const top = p.layers[p.layers.length - 1];
    if (!top) throw new Error("O projeto não tem camadas.");
    return top;
  }
  const layer = p.layers.find((l) => l.id === ref || l.name.toLowerCase() === ref.toLowerCase());
  if (!layer) {
    throw new Error(`Camada "${ref}" não existe. Camadas: ${p.layers.map((l) => l.name).join(", ")}.`);
  }
  return layer;
}

/** Converte uma referência de cor (chave, nome ou hex existente) para índice de pixel. */
export function colorIndex(p: Project, ref: string): number {
  if (ref === TRANSPARENT_KEY || ref.toLowerCase() === "transparent" || ref.toLowerCase() === "transparente") {
    return TRANSPARENT;
  }
  let i = p.palette.findIndex((c) => c.key === ref);
  if (i < 0) i = p.palette.findIndex((c) => c.name.toLowerCase() === ref.toLowerCase());
  if (i < 0 && /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(ref.trim())) {
    const hex = normalizeHex(ref);
    i = p.palette.findIndex((c) => c.hex === hex);
  }
  if (i < 0) {
    throw new Error(
      `Cor "${ref}" não está na paleta. Use set_palette/add_colors antes. Paleta: ${p.palette
        .map((c) => `${c.key}=${c.name}`)
        .join(", ")}.`,
    );
  }
  return i + 1;
}

export function normalizeHex(hex: string): string {
  let h = hex.trim().toLowerCase();
  if (!h.startsWith("#")) h = `#${h}`;
  if (/^#[0-9a-f]{3}$/.test(h)) h = `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`;
  if (!/^#[0-9a-f]{6}$/.test(h)) throw new Error(`Cor hex inválida: "${hex}". Use o formato #rrggbb.`);
  return h;
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = normalizeHex(hex);
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

export function frameDuration(p: Project, frameIndex: number): number {
  return p.frames[frameIndex]?.duration ?? Math.round(1000 / p.fps);
}

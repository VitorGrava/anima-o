// utilidades do "artista" (script da cena): gerador pseudoaleatório, terreno fractal, paleta e comandos
import { writeFileSync } from "node:fs";
export const W = 320, H = 180;
export function prng(s) { let a = s | 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const KEYS = [..."0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ#@$%&*+=-~^!?:;<>/|", ...Array.from({ length: 0xff - 0xc0 + 1 }, (_, i) => String.fromCharCode(0xc0 + i)).filter((c) => c !== "×" && c !== "÷")];
export function makeScene(palette, layers) {
  const names = Object.keys(palette);
  const K = (n) => { const i = names.indexOf(n); if (i < 0) throw new Error("cor desconhecida: " + n); return KEYS[i]; };
  const cmds = [{ name: "set_canvas", input: { width: W, height: H } }, ];
  for (let i = 0; i < names.length; i += 60) cmds.push({ name: "set_palette", input: { colors: names.slice(i, i + 60).map((n, j) => ({ key: KEYS[i + j], hex: palette[n], name: n })) } });
  for (const l of layers) cmds.push({ name: "add_layer", input: { name: l } });
  const draw = (layer, shapes) => { for (let i = 0; i < shapes.length; i += 150) cmds.push({ name: "draw_shapes", input: { layer, shapes: shapes.slice(i, i + 150), preview: false } }); };
  const save = (file) => { cmds.push({ name: "update_layer", input: { layer: "Base", delete: true } }); writeFileSync(file, JSON.stringify(cmds)); };
  return { K, cmds, draw, save };
}
/** terreno fractal (deslocamento do ponto médio): devolve vértices [x,y] da crista */
export function ridge(rnd, base, amp, rough, N = 80) {
  const off = Array(N + 1).fill(0);
  const mid = (a, b, d) => { if (b - a < 2) return; const m = (a + b) >> 1; off[m] = (off[a] + off[b]) / 2 + (rnd() - 0.5) * d; mid(a, m, d * rough); mid(m, b, d * rough); };
  mid(0, N, amp);
  return off.map((o, i) => [Math.round((i * W) / N), Math.round(base + o)]);
}
export const poly = (pts, bottom, color) => ({ type: "polygon", points: [...pts, [W, bottom], [0, bottom]], color });

/** carrega um frame de um projeto .anima.json como sprite: {w,h,flat,palette} (usa a própria engine via tsx) */
export async function loadSprite(file, frame = 0) {
  const { register } = await import("tsx/esm/api");
  register();
  const { readFileSync } = await import("node:fs");
  const eng = await import("../../src/engine/index.ts");
  const p = eng.fromJSON(JSON.parse(readFileSync(new URL(file, import.meta.url), "utf8")));
  return { w: p.width, h: p.height, flat: eng.flattenFrame(p, frame), palette: p.palette };
}

/** projeção da lateral de uma box3d (mesma matemática da engine) para colocar janelas/portas em perspectiva */
export async function loadPaint() {
  const { register } = await import("tsx/esm/api");
  register();
  return await import("../../src/engine/paint.ts");
}

/**
 * Importa uma imagem (RGBA) para a grade de pixel art: detecta o tamanho do "pixel" de uma arte ampliada,
 * corta à grade (cor mais frequente de cada célula), trata fundo/transparência e quantiza a paleta (median cut).
 * Funções puras; quem lê o arquivo (CLI/MCP) decodifica o PNG e chama `importImage`.
 */
export interface RGBAImage { width: number; height: number; data: Uint8ClampedArray | Uint8Array }

/** tamanho do pixel de uma arte pixelada ampliada por vizinho mais próximo (1 = não está ampliada) */
export function detectCell(img: RGBAImage): number {
  const { width: W, height: H, data: d } = img;
  const same = (a: number, b: number) => d[a] === d[b] && d[a + 1] === d[b + 1] && d[a + 2] === d[b + 2] && d[a + 3] === d[b + 3];
  const runs: number[] = [];
  const step = Math.max(1, Math.floor(H / 64));
  for (let y = 0; y < H; y += step) {
    let start = 0;
    for (let x = 1; x <= W; x++) if (x === W || !same((y * W + x) * 4, (y * W + x - 1) * 4)) { runs.push(x - start); start = x; }
  }
  const vruns: number[] = [];
  const stepx = Math.max(1, Math.floor(W / 64));
  for (let x = 0; x < W; x += stepx) {
    let start = 0;
    for (let y = 1; y <= H; y++) if (y === H || !same((y * W + x) * 4, ((y - 1) * W + x) * 4)) { vruns.push(y - start); start = y; }
  }
  const all = [...runs, ...vruns];
  let best = 1;
  for (let s = 2; s <= 32; s++) {
    let tot = 0, ok = 0;
    for (const r of all) { tot += r; if (r % s === 0) ok += r; }
    if (tot && ok / tot >= 0.97 && W % s === 0 && H % s === 0) best = s;   // o MAIOR s compatível com (quase) todas as corridas
  }
  return best;
}

export interface ImportOptions {
  /** tamanho do pixel na imagem de origem: "auto" (detecta) ou inteiro; ignorado se `largura`/`altura` forem dadas */
  grade?: "auto" | number;
  largura?: number;
  altura?: number;
  /** máximo de cores (median cut); padrão 32 */
  cores?: number;
  /** "auto": a cor dos cantos se for igual nos 4 vira transparente; "nenhum"; ou "#rrggbb" */
  fundo?: "auto" | "nenhum" | string;
  /** alfa abaixo disso vira transparente (padrão 128) */
  limiarAlfa?: number;
}
export interface ImportResult { width: number; height: number; indices: Uint8Array; palette: string[]; cell: number; fundo: string | null }

const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;

export function importImage(img: RGBAImage, o: ImportOptions = {}): ImportResult {
  const { width: W, height: H, data: d } = img;
  const cell = o.largura || o.altura ? 0 : o.grade === undefined || o.grade === "auto" ? detectCell(img) : Math.max(1, Math.round(o.grade));
  let tw: number, th: number;
  if (cell) { tw = Math.floor(W / cell); th = Math.floor(H / cell); }
  else { tw = o.largura ?? Math.round(((o.altura as number) * W) / H); th = o.altura ?? Math.round((tw * H) / W); }
  tw = Math.max(1, tw); th = Math.max(1, th);
  const limiar = o.limiarAlfa ?? 128;
  // cor de fundo
  let bg: [number, number, number] | null = null;
  const px = (x: number, y: number): [number, number, number, number] => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2], d[i + 3]]; };
  if (o.fundo && o.fundo !== "auto" && o.fundo !== "nenhum") { const h = o.fundo.replace("#", ""); bg = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
  else if (o.fundo !== "nenhum") {
    const c = [px(0, 0), px(W - 1, 0), px(0, H - 1), px(W - 1, H - 1)];
    if (c.every((p) => p[3] >= limiar && Math.abs(p[0] - c[0][0]) + Math.abs(p[1] - c[0][1]) + Math.abs(p[2] - c[0][2]) < 12)) bg = [c[0][0], c[0][1], c[0][2]];
  }
  const isBg = (p: number[]) => p[3] < limiar || (bg !== null && Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]) < 18);
  // amostra: cor mais frequente de cada célula (quantizada em 5 bits só para agrupar)
  const cells: ([number, number, number] | null)[] = new Array(tw * th).fill(null);
  for (let cy = 0; cy < th; cy++) for (let cx = 0; cx < tw; cx++) {
    const x0 = Math.floor((cx * W) / tw), x1 = Math.max(x0 + 1, Math.floor(((cx + 1) * W) / tw)), y0 = Math.floor((cy * H) / th), y1 = Math.max(y0 + 1, Math.floor(((cy + 1) * H) / th));
    const cnt = new Map<number, { n: number; r: number; g: number; b: number }>(); let transp = 0, tot = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const p = px(x, y); tot++;
      if (isBg(p)) { transp++; continue; }
      const k = ((p[0] >> 3) << 10) | ((p[1] >> 3) << 5) | (p[2] >> 3);
      const e = cnt.get(k) ?? { n: 0, r: 0, g: 0, b: 0 }; e.n++; e.r += p[0]; e.g += p[1]; e.b += p[2]; cnt.set(k, e);
    }
    if (!cnt.size || transp * 2 > tot) continue;
    const top = [...cnt.values()].sort((a, b) => b.n - a.n)[0];
    cells[cy * tw + cx] = [Math.round(top.r / top.n), Math.round(top.g / top.n), Math.round(top.b / top.n)];
  }
  // quantização: median cut sobre as cores distintas ponderadas pelo uso
  const hist = new Map<number, { rgb: [number, number, number]; n: number }>();
  for (const c of cells) if (c) { const k = (c[0] << 16) | (c[1] << 8) | c[2]; const e = hist.get(k); if (e) e.n++; else hist.set(k, { rgb: c, n: 1 }); }
  const maxC = Math.max(2, Math.min(255, o.cores ?? 32));
  let boxes = [[...hist.values()]];
  while (boxes.length < maxC) {
    let bi = -1, bs = 0, bch = 0;
    boxes.forEach((bx, i) => { if (bx.length < 2) return; for (let ch = 0; ch < 3; ch++) { const v = bx.map((e) => e.rgb[ch]); const sp = (Math.max(...v) - Math.min(...v)) * bx.reduce((s, e) => s + e.n, 0); if (sp > bs) { bs = sp; bi = i; bch = ch; } } });
    if (bi < 0 || bs === 0) break;
    const bx = boxes[bi].sort((a, b) => a.rgb[bch] - b.rgb[bch]);
    const total = bx.reduce((s, e) => s + e.n, 0); let acc = 0, cut = 1;
    for (let i = 0; i < bx.length - 1; i++) { acc += bx[i].n; cut = i + 1; if (acc * 2 >= total) break; }
    boxes.splice(bi, 1, bx.slice(0, cut), bx.slice(cut));
  }
  const palette: [number, number, number][] = boxes.map((bx) => { const t = bx.reduce((s, e) => s + e.n, 0) || 1; return [0, 1, 2].map((ch) => Math.round(bx.reduce((s, e) => s + e.rgb[ch] * e.n, 0) / t)) as [number, number, number]; });
  const nearest = (c: [number, number, number]) => { let bi = 0, bd = Infinity; palette.forEach((p, i) => { const dd = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2; if (dd < bd) { bd = dd; bi = i; } }); return bi; };
  const indices = new Uint8Array(tw * th);
  cells.forEach((c, i) => { indices[i] = c ? nearest(c) + 1 : 0; });
  return { width: tw, height: th, indices, palette: palette.map((p) => hex(p[0], p[1], p[2])), cell: cell || 0, fundo: bg ? hex(bg[0], bg[1], bg[2]) : null };
}

import { KEY_CHARS, TRANSPARENT_KEY, getCel, normalizeHex, type Project } from "./project.ts";

/** Grava o resultado em uma camada/frame do projeto, criando as cores da paleta que faltam (reaproveita as já existentes). */
export function importIntoProject(p: Project, r: ImportResult, o: { camada?: string; frame?: number } = {}): { adicionadas: number; camada: string } {
  const layer = o.camada ? p.layers.find((l) => l.name.toLowerCase() === o.camada!.toLowerCase()) : p.layers[p.layers.length - 1];
  if (!layer) throw new Error(`Camada "${o.camada}" não existe.`);
  const f = o.frame ?? 0;
  if (!p.frames[f]) throw new Error(`Frame ${f} não existe.`);
  if (r.width !== p.width || r.height !== p.height) throw new Error(`A imagem importada tem ${r.width}x${r.height} e o canvas ${p.width}x${p.height}: ajuste o canvas (set_canvas) ou importe com canvas "ajustar".`);
  let adicionadas = 0;
  const map = r.palette.map((h, i) => {
    const hx = normalizeHex(h), found = p.palette.findIndex((c) => c.hex === hx);
    if (found >= 0) return found + 1;
    const key = [...KEY_CHARS].find((k) => k !== TRANSPARENT_KEY && !p.palette.some((c) => c.key === k));
    if (!key) throw new Error("Paleta cheia: reduza `cores` na importação.");
    p.palette.push({ key, hex: hx, name: `ref-${i + 1}` });
    adicionadas++;
    return p.palette.length;
  });
  const cel = getCel(p, f, layer.id);
  for (let i = 0; i < r.indices.length; i++) cel[i] = r.indices[i] ? map[r.indices[i] - 1] : 0;
  return { adicionadas, camada: layer.name };
}

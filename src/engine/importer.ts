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
  /** como resumir cada célula: "dominante" (arte pixelada: cor mais frequente), "media" (foto: média das cores) ou "auto" (dominante se a origem já era pixel art ampliada) */
  modo?: "auto" | "dominante" | "media";
  /** tolerância (distância RGB) do fundo ligado à borda da imagem; padrão 28 (aumente para fundos com degradê/ruído) */
  tolFundo?: number;
  /** 1 = igual; > 1 realça o contraste (foto sem graça fica com mais volume) */
  contraste?: number;
  /** 1 = igual; > 1 satura (cores vivas em poucos pixels) */
  saturacao?: number;
  /** dithering ordenado (Bayer 4x4) na quantização: simula degradês com poucas cores */
  dither?: boolean;
}
export interface ImportResult { width: number; height: number; indices: Uint8Array; palette: string[]; cell: number; fundo: string | null; modo: "dominante" | "media" }

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
    if (c.every((p) => p[3] >= limiar && Math.abs(p[0] - c[0][0]) + Math.abs(p[1] - c[0][1]) + Math.abs(p[2] - c[0][2]) < Math.max(12, o.tolFundo ?? 28))) bg = [c[0][0], c[0][1], c[0][2]];
  }
  // fundo = pixels ligados à BORDA da imagem com cor parecida com a do fundo (não pega o branco dos olhos no meio da figura)
  const tol = o.tolFundo ?? 28;
  const bgMask = new Uint8Array(W * H);
  if (bg) {
    const near = (i: number) => d[i + 3] < limiar || Math.abs(d[i] - bg![0]) + Math.abs(d[i + 1] - bg![1]) + Math.abs(d[i + 2] - bg![2]) <= tol;
    const stack: number[] = [];
    const push = (x: number, y: number) => { const k = y * W + x; if (!bgMask[k] && near(k * 4)) { bgMask[k] = 1; stack.push(k); } };
    for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
    for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }
    while (stack.length) { const k = stack.pop()!; const x = k % W, y = (k - x) / W; if (x > 0) push(x - 1, y); if (x < W - 1) push(x + 1, y); if (y > 0) push(x, y - 1); if (y < H - 1) push(x, y + 1); }
  }
  const isBgAt = (x: number, y: number) => { const i = (y * W + x) * 4; return d[i + 3] < limiar || bgMask[y * W + x] === 1; };
  const modo: "dominante" | "media" = o.modo === "dominante" || o.modo === "media" ? o.modo : cell > 1 ? "dominante" : "media";
  const kc = o.contraste ?? 1, ks = o.saturacao ?? 1;
  const tone = (c: [number, number, number]): [number, number, number] => {
    if (kc === 1 && ks === 1) return c;
    const lum = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
    return c.map((v) => Math.max(0, Math.min(255, Math.round(((lum + (v - lum) * ks) - 128) * kc + 128)))) as [number, number, number];
  };
  // amostra: cor mais frequente de cada célula (quantizada em 5 bits só para agrupar)
  const cells: ([number, number, number] | null)[] = new Array(tw * th).fill(null);
  for (let cy = 0; cy < th; cy++) for (let cx = 0; cx < tw; cx++) {
    const x0 = Math.floor((cx * W) / tw), x1 = Math.max(x0 + 1, Math.floor(((cx + 1) * W) / tw)), y0 = Math.floor((cy * H) / th), y1 = Math.max(y0 + 1, Math.floor(((cy + 1) * H) / th));
    const cnt = new Map<number, { n: number; r: number; g: number; b: number }>(); let transp = 0, tot = 0, sr = 0, sg = 0, sb = 0, sn = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const p = px(x, y); tot++;
      if (isBgAt(x, y)) { transp++; continue; }
      sr += p[0]; sg += p[1]; sb += p[2]; sn++;
      const k = ((p[0] >> 3) << 10) | ((p[1] >> 3) << 5) | (p[2] >> 3);
      const e = cnt.get(k) ?? { n: 0, r: 0, g: 0, b: 0 }; e.n++; e.r += p[0]; e.g += p[1]; e.b += p[2]; cnt.set(k, e);
    }
    if (!cnt.size || transp * 2 > tot) continue;
    if (modo === "media") { cells[cy * tw + cx] = tone([Math.round(sr / sn), Math.round(sg / sn), Math.round(sb / sn)]); continue; }
    const top = [...cnt.values()].sort((a, b) => b.n - a.n)[0];
    cells[cy * tw + cx] = tone([Math.round(top.r / top.n), Math.round(top.g / top.n), Math.round(top.b / top.n)]);
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
  const B4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
  cells.forEach((c, i) => {
    if (!c) { indices[i] = 0; return; }
    if (o.dither) { const t = ((B4[Math.floor(i / tw) % 4][(i % tw) % 4] + 0.5) / 16 - 0.5) * 36; indices[i] = nearest([c[0] + t, c[1] + t, c[2] + t] as [number, number, number]) + 1; } else indices[i] = nearest(c) + 1;
  });
  return { width: tw, height: th, indices, palette: palette.map((p) => hex(p[0], p[1], p[2])), cell: cell || 0, fundo: bg ? hex(bg[0], bg[1], bg[2]) : null, modo };
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

import { flattenFrame } from "./render.ts";
import { hexToRgb } from "./project.ts";

export interface CompareResult {
  text: string;
  iou: number;
  erroCor: number;
  image: { width: number; height: number; data: Uint8ClampedArray<ArrayBuffer> };
}

/**
 * Compara um frame do projeto com uma imagem de referência reduzida à MESMA grade: sobreposição da silhueta (IoU),
 * erro médio de cor onde os dois têm pixel, as células piores e um painel [referência | desenho | diferença].
 * Diferença: azul = só a referência tem pixel, vermelho = só o desenho, do preto ao amarelo = erro de cor.
 */
export function compareToReference(p: Project, frame: number, ref: ImportResult, escala = 0): CompareResult {
  if (ref.width !== p.width || ref.height !== p.height) throw new Error(`A referência tem ${ref.width}x${ref.height} e o projeto ${p.width}x${p.height}: importe a referência com largura/altura do projeto.`);
  const W = p.width, H = p.height, flat = flattenFrame(p, frame);
  const mine = (i: number): [number, number, number] | null => (flat[i] ? hexToRgb(p.palette[flat[i] - 1].hex) : null);
  const theirs = (i: number): [number, number, number] | null => (ref.indices[i] ? hexToRgb(ref.palette[ref.indices[i] - 1]) : null);
  let inter = 0, uni = 0, errSum = 0, errN = 0;
  const cellW = Math.max(1, Math.ceil(W / 4)), cellH = Math.max(1, Math.ceil(H / 4));
  const cells = Array.from({ length: 16 }, () => ({ miss: 0, err: 0, n: 0 }));
  const dist: number[] = new Array(W * H).fill(-1);
  for (let i = 0; i < W * H; i++) {
    const a = mine(i), b = theirs(i), c = cells[Math.min(3, Math.floor(i / W / cellH)) * 4 + Math.min(3, Math.floor((i % W) / cellW))];
    if (a || b) uni++;
    if (a && b) { inter++; const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) / 441.67; dist[i] = d; errSum += d; errN++; c.err += d; c.n++; }
    else if (a || b) c.miss++;
  }
  const iou = uni ? inter / uni : 1, erro = errN ? errSum / errN : 0;
  const worst = cells.map((c, k) => ({ k, score: c.miss + c.err * 2 })).sort((x, y) => y.score - x.score).slice(0, 3).filter((c) => c.score > 0)
    .map((c) => `x${(c.k % 4) * cellW}..${Math.min(W - 1, (c.k % 4) * cellW + cellW - 1)} y${Math.floor(c.k / 4) * cellH}..${Math.min(H - 1, Math.floor(c.k / 4) * cellH + cellH - 1)}`);
  const s = escala > 0 ? escala : Math.max(1, Math.min(12, Math.floor(320 / Math.max(W, H)))), gap = 3 * s;
  const PW = W * s * 3 + gap * 2, PH = H * s, data = new Uint8ClampedArray(PW * PH * 4);
  for (let i = 0; i < data.length; i += 4) { data[i] = data[i + 1] = data[i + 2] = 40; data[i + 3] = 255; }
  const paint = (px0: number, i: number, rgb: [number, number, number]) => { const x = i % W, y = (i - x) / W; for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) { const o = ((y * s + dy) * PW + px0 + x * s + dx) * 4; data[o] = rgb[0]; data[o + 1] = rgb[1]; data[o + 2] = rgb[2]; } };
  for (let i = 0; i < W * H; i++) {
    const a = mine(i), b = theirs(i);
    paint(0, i, b ?? [90, 90, 90]); paint(W * s + gap, i, a ?? [90, 90, 90]);
    let diff: [number, number, number] = [60, 60, 60];
    if (a && b) { const d = Math.min(1, dist[i] * 3); diff = [Math.round(255 * d), Math.round(220 * d), 0]; }
    else if (b) diff = [60, 120, 255]; else if (a) diff = [255, 60, 60];
    paint((W * s + gap) * 2, i, diff);
  }
  const text = `Comparação do frame ${frame} com a referência (${W}x${H}): sobreposição da silhueta ${(iou * 100).toFixed(0)}%, erro médio de cor ${(erro * 100).toFixed(0)}% onde os dois têm pixel.${worst.length ? ` Piores regiões: ${worst.join("; ")}.` : ""}\nPainel: referência | desenho | diferença (azul = só a referência tem pixel, vermelho = só o desenho, preto→amarelo = erro de cor).`;
  return { text, iou, erroCor: erro, image: { width: PW, height: PH, data } };
}

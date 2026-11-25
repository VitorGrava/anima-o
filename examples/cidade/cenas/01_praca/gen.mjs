// Cena 01 — Praça ao entardecer, título "A CIDADE QUE / DIVIDE OU UNIFICA?", pan lento para a direita
// revelando o shopping de vidro e o carrinho de pipoca. 0–6 s = 72 quadros.
// Exporta o cenário (paleta, mundo, pessoas) para a cena 08_praca_grade reaproveitar.
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { W, H, FPS, PESSOA_PALETA, BLUSAS, pessoa, gerar } from "../../lib/comum.mjs";

export const MUNDO_W = 440;      // largura do mundo (a câmera mostra 180 px)
export const CHAO = 193;         // linha onde os prédios encostam na praça
const BL = "abcdefgh";           // chaves das blusas

export const PALETA = [
  ...PESSOA_PALETA,
  ...BLUSAS.map((hex, i) => ({ key: BL[i], hex, name: `blusa${i + 1}` })),
  { key: "0", hex: "#2c2430", name: "escuro" },
  { key: "i", hex: "#e9b088", name: "ceu-alto" },
  { key: "j", hex: "#efc096", name: "ceu-meio" },
  { key: "k", hex: "#f4cea4", name: "ceu-baixo" },
  { key: "l", hex: "#f8dcb4", name: "ceu-sol" },
  { key: "m", hex: "#e2b28e", name: "predio-longe" },
  { key: "n", hex: "#d6a080", name: "predio-longe2" },
  { key: "o", hex: "#f6efe4", name: "branco" },
  { key: "p", hex: "#d8c6b2", name: "branco-sombra" },
  { key: "q", hex: "#cf5f4a", name: "telhado" },
  { key: "r", hex: "#9c4038", name: "telhado-sombra" },
  { key: "s", hex: "#86a84c", name: "folha" },
  { key: "t", hex: "#628a3a", name: "folha-sombra" },
  { key: "u", hex: "#44683a", name: "folha-escura" },
  { key: "v", hex: "#b2c860", name: "folha-luz" },
  { key: "w", hex: "#6c4a36", name: "tronco" },
  { key: "x", hex: "#d79e6e", name: "praca" },
  { key: "y", hex: "#bf8456", name: "praca-onda" },
  { key: "z", hex: "#e6b688", name: "praca-luz" },
  { key: "A", hex: "#3c3034", name: "ferro" },
  { key: "B", hex: "#55803e", name: "canteiro" },
  { key: "C", hex: "#3e6234", name: "canteiro-sombra" },
  { key: "D", hex: "#b27c52", name: "terra" },
  { key: "E", hex: "#93623f", name: "terra-escura" },
  { key: "F", hex: "#7aa2d4", name: "vidro" },
  { key: "G", hex: "#5a80b8", name: "vidro-sombra" },
  { key: "H", hex: "#b4d0ee", name: "vidro-luz" },
  { key: "I", hex: "#eef2f6", name: "letreiro" },
  { key: "J", hex: "#2e4064", name: "azul-texto" },
  { key: "K", hex: "#f4c22c", name: "amarelo" },
  { key: "L", hex: "#fff4de", name: "titulo" },
  { key: "M", hex: "#8a4c3c", name: "titulo-sombra" },
  { key: "N", hex: "#f6dcbc", name: "titulo-fade1" },
  { key: "O", hex: "#f2cc84", name: "amarelo-fade1" },
  { key: "P", hex: "#e8c8a4", name: "parede-igreja" },
];

// ---------- utilidades ----------
const ondaPts = (x0, x1, y0, amp, per, fase) => {
  const pts = [];
  for (let x = x0; x <= x1; x++) pts.push([x, Math.round(y0 + amp * Math.sin(x / per + fase))]);
  return pts;
};

function arvore(cx, base, r, seed = 1) {
  // copa redonda em cachos (blocos de luz em cima/esquerda, sombra embaixo/direita), tronco
  const s = [];
  s.push({ type: "rect", x: cx - 2, y: base - r - 6, w: 4, h: r + 6, color: "w" });
  s.push({ type: "line", x1: cx + 1, y1: base - r, x2: cx + 1, y2: base - 1, color: "E" });
  const cy = base - r - 12 - r;
  const cachos = [[0, 0, 1], [-0.55, 0.25, 0.7], [0.55, 0.25, 0.7], [-0.3, -0.45, 0.62], [0.35, -0.4, 0.6], [0, 0.45, 0.7]];
  for (const [dx, dy, k] of cachos) {
    const rr = Math.round(r * k);
    s.push({ type: "ellipse", x: Math.round(cx + dx * r - rr), y: Math.round(cy + dy * r - rr), w: rr * 2, h: rr * 2, color: "t" });
  }
  for (const [dx, dy, k] of cachos) {
    const rr = Math.round(r * k * 0.8);
    s.push({ type: "ellipse", x: Math.round(cx + dx * r - rr - 1), y: Math.round(cy + dy * r - rr - 2), w: rr * 2, h: rr * 2, color: "s" });
  }
  // bolinhas claras (como as manchas do original)
  for (const [dx, dy] of [[-0.45, -0.35], [0.2, -0.6], [0.45, -0.05], [-0.15, 0.2], [-0.6, 0.3]]) {
    const rr = Math.max(2, Math.round(r * 0.2));
    s.push({ type: "ellipse", x: Math.round(cx + dx * r - rr), y: Math.round(cy + dy * r - rr), w: rr * 2, h: rr * 2, color: "v" });
  }
  // sombra na base da copa
  s.push({ type: "polygon", points: [[cx - r + 2, cy + r * 0.55], [cx + r - 1, cy + r * 0.55], [cx + r * 0.6, cy + r + 2], [cx - r * 0.6, cy + r + 2]].map(([a, b]) => [Math.round(a), Math.round(b)]), color: "u" });
  s.push({ type: "gradient", x: cx - r - 4, y: Math.round(cy + r * 0.3), w: 2 * r + 8, h: Math.round(r * 0.5), colors: ["t", "u"], only: ["s", "v"], only_camada: true, dither: "bayer4" });
  return s;
}

function poste(x, base) {
  return [
    { type: "rect", x: x - 2, y: base - 3, w: 5, h: 3, color: "A" },
    { type: "line", x1: x, y1: base - 30, x2: x, y2: base - 3, color: "A" },
    { type: "rect", x: x - 2, y: base - 36, w: 5, h: 6, color: "A" },
    { type: "rect", x: x - 1, y: base - 35, w: 3, h: 4, color: "K" },
    { type: "pixels", points: [[x, base - 37]], color: "A" },
  ];
}

function banco(x, base) {
  return [
    { type: "rect", x, y: base - 6, w: 14, h: 2, color: "w" },
    { type: "rect", x, y: base - 11, w: 14, h: 2, color: "w" },
    { type: "line", x1: x + 1, y1: base - 4, x2: x + 1, y2: base - 1, color: "A" },
    { type: "line", x1: x + 12, y1: base - 4, x2: x + 12, y2: base - 1, color: "A" },
  ];
}

/** céu (fixo; não acompanha a câmera) — camada "ceu" */
export function ceu() {
  return [
    { type: "gradient", x: 0, y: 0, w: MUNDO_W, h: CHAO + 2, colors: ["i", "j", "k", "l"], direction: "vertical", dither: "bayer4", suavidade: 0.6, ondas: 2 },
    { type: "gradient", x: 30, y: 80, w: 130, h: 120, colors: ["l", "k"], direction: "radial", cx: 95, cy: 150, r: 70, dither: "bayer4", suavidade: 0.8, only: ["k", "l", "j"] },
  ];
}

/** prédios distantes (parallax 0.5) — camada "longe" */
export function longe() {
  const s = [];
  const blocos = [[0, 150, 34], [30, 162, 26], [58, 140, 22], [140, 156, 30], [168, 146, 24], [196, 160, 30], [226, 150, 30], [258, 164, 40]];
  blocos.forEach(([x, y, w], i) => {
    s.push({ type: "rect", x, y, w, h: CHAO - y + 2, color: i % 2 ? "m" : "n" });
    for (let yy = y + 5; yy < CHAO - 6; yy += 7) for (let xx = x + 3; xx < x + w - 3; xx += 6) s.push({ type: "rect", x: xx, y: yy, w: 2, h: 3, color: i % 2 ? "n" : "m" });
  });
  return s;
}

/** o mundo da praça (pan 1.0) — camada "mundo" */
export function mundo() {
  const s = [];
  // --- igreja (atrás do coreto) ---
  s.push({ type: "rect", x: 76, y: 150, w: 62, h: CHAO - 150, color: "P" });
  s.push({ type: "polygon", points: [[72, 151], [107, 136], [142, 151]], color: "q" });
  s.push({ type: "line", x1: 72, y1: 151, x2: 142, y2: 151, color: "r" });
  s.push({ type: "rect", x: 100, y: 98, w: 16, h: CHAO - 98, color: "o" });
  s.push({ type: "rect", x: 113, y: 98, w: 3, h: CHAO - 98, color: "p" });
  s.push({ type: "polygon", points: [[98, 99], [108, 84], [118, 99]], color: "q" });
  s.push({ type: "polygon", points: [[108, 84], [118, 99], [112, 99]], color: "r" });
  s.push({ type: "line", x1: 108, y1: 74, x2: 108, y2: 83, color: "A" });
  s.push({ type: "line", x1: 106, y1: 77, x2: 110, y2: 77, color: "A" });
  s.push({ type: "ellipse", x: 104, y: 106, w: 8, h: 8, color: "p" });
  s.push({ type: "ellipse", x: 105, y: 107, w: 6, h: 6, color: "o" });
  s.push({ type: "pixels", points: [[108, 108], [108, 109], [108, 110], [109, 110]], color: "J" });
  s.push({ type: "rect", x: 105, y: 120, w: 6, h: 8, color: "r" }); // janela do sino
  s.push({ type: "rect", x: 106, y: 121, w: 4, h: 7, color: "M" });
  s.push({ type: "rect", x: 127, y: 160, w: 6, h: 9, color: "p" });
  // --- coreto ---
  const cx = 70;
  s.push({ type: "rect", x: cx - 36, y: CHAO - 5, w: 72, h: 5, color: "p" });
  s.push({ type: "rect", x: cx - 36, y: CHAO - 5, w: 72, h: 1, color: "o" });
  s.push({ type: "rect", x: cx - 33, y: 165, w: 66, h: 23, color: "P" });
  s.push({ type: "rect", x: cx - 33, y: 165, w: 66, h: 4, color: "p" });
  for (let x = cx - 33; x <= cx + 33; x += 8) s.push({ type: "rect", x, y: 160, w: 2, h: CHAO - 165, color: "o" });
  s.push({ type: "rect", x: cx - 34, y: 178, w: 68, h: 1, color: "o" });
  for (let x = cx - 32; x < cx + 33; x += 2) s.push({ type: "line", x1: x, y1: 179, x2: x, y2: CHAO - 6, color: "o" });
  s.push({ type: "rect", x: cx - 34, y: 158, w: 68, h: 3, color: "o" });
  s.push({ type: "rect", x: cx - 34, y: 160, w: 68, h: 1, color: "p" });
  s.push({ type: "polygon", points: [[cx - 40, 158], [cx - 30, 150], [cx - 12, 144], [cx + 12, 144], [cx + 30, 150], [cx + 40, 158]], color: "q" });
  s.push({ type: "polygon", points: [[cx + 4, 144], [cx + 12, 144], [cx + 30, 150], [cx + 40, 158], [cx + 18, 158]], color: "r" });
  s.push({ type: "line", x1: cx - 40, y1: 158, x2: cx + 40, y2: 158, color: "r" });
  s.push({ type: "rect", x: cx - 1, y: 139, w: 3, h: 5, color: "o" });
  s.push({ type: "pixels", points: [[cx, 138]], color: "K" });
  // --- árvores e postes ---
  s.push(...arvore(14, CHAO, 16));
  s.push(...arvore(170, CHAO, 20));
  s.push(...arvore(232, CHAO + 1, 15));
  s.push(...arvore(272, CHAO, 18));
  s.push(...poste(138, CHAO + 1), ...poste(204, CHAO + 1), ...poste(300, CHAO + 1), ...poste(430, CHAO + 1));
  // --- shopping de vidro ---
  const sx = 312, sw = 128, top = 88;
  s.push({ type: "rect", x: sx, y: top + 16, w: sw, h: CHAO - top - 16, color: "F" });
  s.push({ type: "rect", x: sx, y: top + 16, w: 6, h: CHAO - top - 16, color: "G" });
  // reflexos diagonais no vidro
  for (const [x0, lw] of [[sx + 22, 10], [sx + 40, 4], [sx + 84, 14], [sx + 104, 5]]) s.push({ type: "polygon", points: [[x0, top + 16], [x0 + lw, top + 16], [x0 + lw - 30, CHAO - 10], [x0 - 30, CHAO - 10]].map(([a, b]) => [Math.max(sx + 6, a), b]), color: "H" });
  for (let y = top + 18; y < CHAO - 10; y += 8) s.push({ type: "line", x1: sx, y1: y, x2: sx + sw, y2: y, color: "G" });
  for (let x = sx + 8; x < sx + sw; x += 10) s.push({ type: "line", x1: x, y1: top + 16, x2: x, y2: CHAO - 10, color: "G" });
  s.push({ type: "rect", x: sx - 2, y: top, w: sw + 4, h: 16, color: "I" });
  s.push({ type: "rect", x: sx - 2, y: top + 15, w: sw + 4, h: 1, color: "p" });
  s.push({ type: "texto", texto: "SHOPPING", x: sx + sw / 2, y: top + 3, color: "J", alinhar: "centro", escala: 2, espaco: 1 });
  // entrada com marquise
  s.push({ type: "rect", x: sx + 34, y: CHAO - 26, w: 46, h: 4, color: "I" });
  s.push({ type: "rect", x: sx + 34, y: CHAO - 22, w: 46, h: 1, color: "A" });
  s.push({ type: "rect", x: sx + 38, y: CHAO - 21, w: 38, h: 21, color: "I" });
  s.push({ type: "rect", x: sx + 39, y: CHAO - 20, w: 36, h: 20, color: "H" });
  s.push({ type: "line", x1: sx + 57, y1: CHAO - 20, x2: sx + 57, y2: CHAO - 1, color: "G" });
  s.push({ type: "rect", x: sx, y: CHAO - 10, w: 34, h: 10, color: "G" });
  s.push({ type: "rect", x: sx + 80, y: CHAO - 10, w: sw - 80, h: 10, color: "G" });
  // --- praça: chão de pedra ondulado ---
  s.push({ type: "rect", x: 0, y: CHAO, w: MUNDO_W, h: 48, color: "x" });
  s.push({ type: "rect", x: 0, y: CHAO, w: MUNDO_W, h: 1, color: "y" });
  for (let k = 0; k < 6; k++) {
    const y0 = CHAO + 6 + k * 7;
    s.push({ type: "pixels", points: ondaPts(0, MUNDO_W - 1, y0, 1.4 + k * 0.2, 7 + k, k * 1.7), color: "y" });
    s.push({ type: "pixels", points: ondaPts(0, MUNDO_W - 1, y0 - 1, 1.4 + k * 0.2, 7 + k, k * 1.7).filter((_, i) => i % 3 !== 0), color: "z" });
  }
  // terra embaixo + canteiros de flores
  s.push({ type: "gradient", x: 0, y: CHAO + 48, w: MUNDO_W, h: H - CHAO - 48, colors: ["D", "D", "E"], direction: "vertical", dither: "bayer4" });
  s.push({ type: "rect", x: 0, y: CHAO + 48, w: MUNDO_W, h: 1, color: "y" });
  for (let x = 6; x < MUNDO_W; x += 66) {
    s.push({ type: "ellipse", x, y: CHAO + 50, w: 46, h: 14, color: "C" });
    s.push({ type: "ellipse", x: x + 1, y: CHAO + 50, w: 44, h: 11, color: "B" });
  }
  s.push({ type: "scatter", x: 0, y: CHAO + 51, w: MUNDO_W, h: 10, colors: ["e", "o", "K", "a", "o", "e"], densidade: 0.12, forma: "pixel", distancia: 2, seed: 7, only: ["B"], only_camada: true });
  s.push({ type: "scatter", x: 0, y: CHAO + 66, w: MUNDO_W, h: H - CHAO - 66, colors: ["E", "E", "y"], densidade: 0.03, forma: "onda", distancia: 5, seed: 11, only: ["D", "E"], only_camada: true });
  // bancos
  s.push(...banco(150, CHAO + 12), ...banco(250, CHAO + 10));
  return s;
}

/** carrinho de pipoca (desenhado no mundo) — linhas para draw_rows */
export const PIPOCA = [
  "..qqooqqooqqooqqooqqooqqooqqooqq..",
  ".qqooqqooqqooqqooqqooqqooqqooqqoo.",
  "qqooqqooqqooqqooqqooqqooqqooqqooqq",
  "rrpprrpprrpprrpprrpprrpprrpprrpprr",
  "..A............................A..",
  "..A............................A..",
  "..A............................A..",
  "qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq",
  "qHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHq",
  "qHKoKKoKoKKoKKoKoKKoKoKKoKoKKoKKHq",
  "qHKKoKKoKKKoKKoKKoKKoKKoKKKoKKoKKq",
  "qKKoKKKoKKoKKKoKKoKKoKKKoKKoKKoKKq",
  "qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq",
  "qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq",
  "qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq",
  "qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq",
  "qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq",
  "qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq",
  "rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr",
  "...AAAA....................AAAA...",
  "..AApoAA..................AApoAA..",
  "..AAopAA..................AAopAA..",
  "...AAAA....................AAAA...",
];

// ---------- pessoas ----------
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

/** lista de pedestres no mundo (x inicial, linha do pé, direção, velocidade, tamanho, cores) */
export function criarPedestres(seed = 3, n = 30) {
  const r = rng(seed), lista = [];
  const peles = ["1", "2", "3", "4", "2", "3"], cabelos = ["5", "6", "7", "5"], calcas = ["8", "9"];
  for (let i = 0; i < n; i++) {
    const prof = r();
    const tam = prof < 0.28 ? "longe" : prof < 0.75 ? "meio" : "perto";
    const pe = tam === "longe" ? CHAO + 6 + Math.floor(r() * 8) : tam === "meio" ? CHAO + 16 + Math.floor(r() * 14) : CHAO + 38 + Math.floor(r() * 6);
    const parado = r() < 0.12;
    lista.push({
      x: Math.floor(r() * (MUNDO_W + 40)) - 20, pe, tam, dir: r() < 0.5 ? 1 : -1,
      v: parado ? 0 : (tam === "longe" ? 0.45 : tam === "meio" ? 0.7 : 1.0) * (0.85 + r() * 0.3),
      pele: peles[Math.floor(r() * peles.length)], cabelo: cabelos[Math.floor(r() * cabelos.length)],
      blusa: BL[Math.floor(r() * 8)], calca: calcas[Math.floor(r() * 2)], fase: Math.floor(r() * 4),
    });
  }
  return lista.sort((a, b) => a.pe - b.pe);
}

/** grade de caracteres para compor pessoas de um quadro e mandar num draw_rows só */
export class Grade {
  constructor(w, y0, y1) { this.w = w; this.y0 = y0; this.rows = Array.from({ length: y1 - y0 }, () => Array(w).fill(" ")); }
  stamp(rows, x, y) {
    rows.forEach((row, j) => {
      const yy = y + j - this.y0;
      if (yy < 0 || yy >= this.rows.length) return;
      [...row].forEach((ch, i) => { const xx = x + i; if (ch !== " " && ch !== "." && xx >= 0 && xx < this.w) this.rows[yy][xx] = ch; });
    });
  }
  out() { return this.rows.map((r) => r.join("")); }
}

const ALT = { longe: 7, meio: 12, perto: 18 };
/** desenha os pedestres do quadro f com a câmera em cam (posição x do mundo na borda esquerda) */
export function pessoasNoQuadro(grade, lista, f, cam, filtro = () => true) {
  for (const p of lista) {
    if (!filtro(p)) continue;
    let x = p.x + p.dir * p.v * f;
    const span = MUNDO_W + 60;
    x = ((((x + 30) % span) + span) % span) - 30;
    const sx = Math.round(x - cam);
    if (sx < -10 || sx > W + 2) continue;
    const quadro = p.v === 0 ? 1 : Math.floor(f / (p.tam === "longe" ? 3 : 2)) + p.fase;
    const rows = pessoa({ tam: p.tam, frame: p.v === 0 ? 1 : quadro, dir: p.dir, pele: p.pele, cabelo: p.cabelo, blusa: p.blusa, calca: p.calca });
    grade.stamp(rows, sx, p.pe - ALT[p.tam]);
  }
}

/** add_frames aceita no máximo 64 por chamada (ATRITO) */
export function addFrames(c, n) {
  for (let k = n; k > 0; k -= 64) c.push({ name: "add_frames", input: { count: Math.min(64, k), copy_from: 0 } });
}

// ---------- cena 01 ----------
const QUADROS = 72;
const camDe = (f) => {
  const u = f / (QUADROS - 1);
  const e = (1 - Math.cos(Math.PI * Math.pow(u, 1.6))) / 2;
  return Math.round(e * (MUNDO_W - W));
};

function cena01() {
  const c = [];
  const ds = (layer, shapes, frames = 0) => {
    for (let i = 0; i < shapes.length; i += 150) c.push({ name: "draw_shapes", input: { layer, frames, shapes: shapes.slice(i, i + 150), preview: false } });
  };
  c.push({ name: "set_palette", input: { colors: PALETA } });
  c.push({ name: "set_canvas", input: { width: MUNDO_W, height: H } });
  c.push({ name: "update_layer", input: { layer: "Base", name: "ceu" } });
  for (const n of ["longe", "mundo", "pipoca", "pessoas", "titulo"]) c.push({ name: "add_layer", input: { name: n } });
  ds("ceu", ceu());
  ds("longe", longe());
  ds("mundo", mundo());
  c.push({ name: "draw_rows", input: { layer: "pipoca", x: 284, y: CHAO + 19, rows: PIPOCA, preview: false } });
  c.push({ name: "draw_shapes", input: { layer: "pipoca", shapes: [{ type: "texto", texto: "PIPOCA", x: 301, y: CHAO + 33, color: "o", alinhar: "centro" }], preview: false } });
  addFrames(c, QUADROS - 1);
  // câmera: agrupa quadros com o mesmo deslocamento
  const grupos = new Map(), gruposL = new Map();
  for (let f = 0; f < QUADROS; f++) {
    const cam = camDe(f);
    if (!grupos.has(cam)) grupos.set(cam, []);
    grupos.get(cam).push(f);
    const cl = Math.round(cam * 0.45);
    if (!gruposL.has(cl)) gruposL.set(cl, []);
    gruposL.get(cl).push(f);
  }
  // copia do quadro 0 (câmera 0) para os outros; o quadro 0 fica por último
  for (const lay of ["mundo", "pipoca"]) {
    for (const [cam, fr] of grupos) {
      if (cam === 0) continue;
      c.push({ name: "copy_layer_content", input: { from_frame: 0, from_layer: lay, to_layer: lay, to_frames: fr, dx: -cam, preview: false } });
    }
  }
  for (const [cl, fr] of gruposL) {
    if (cl === 0) continue;
    c.push({ name: "copy_layer_content", input: { from_frame: 0, from_layer: "longe", to_layer: "longe", to_frames: fr, dx: -cl, preview: false } });
  }
  // pessoas por quadro
  const ped = criarPedestres(3, 52);
  for (let f = 0; f < QUADROS; f++) {
    const cam = camDe(f);
    const g = new Grade(W, CHAO - 20, CHAO + 46);
    // sentados nos bancos e vendedor da pipoca (fixos no mundo)
    g.stamp(pessoa({ frame: 1, dir: 1, pele: "3", blusa: "c", calca: "9" }).slice(0, 9), 152 - cam, CHAO + 12 - 13);
    g.stamp(pessoa({ frame: 1, dir: -1, pele: "1", cabelo: "7", blusa: "e", calca: "8" }).slice(0, 9), 158 - cam, CHAO + 12 - 13);
    g.stamp(pessoa({ frame: 1, dir: 1, pele: "4", blusa: "a", calca: "8" }).slice(0, 9), 253 - cam, CHAO + 10 - 13);
    g.stamp(pessoa({ tam: "perto", frame: 1, dir: -1, pele: "2", cabelo: "b", blusa: "g", calca: "9" }), 320 - cam, CHAO + 42 - 18);
    pessoasNoQuadro(g, ped, f, cam);
    c.push({ name: "draw_rows", input: { layer: "pessoas", frames: f, x: 0, y: CHAO - 20, rows: g.out(), preview: false } });
  }
  // título: some por "fade" em degraus de cor (~3 s)
  const tit = (cA, cB, cS) => [
    { type: "texto", texto: "A CIDADE QUE", x: 90, y: 40, color: cA, escala: 2, alinhar: "centro", sombra: cS },
    { type: "texto", texto: "DIVIDE OU", x: 59, y: 58, color: cA, escala: 2, alinhar: "centro", sombra: cS },
    { type: "texto", texto: "UNIFICA?", x: 134, y: 58, color: cB, escala: 2, alinhar: "centro", sombra: cS },
  ];
  ds("titulo", tit("L", "K", "M"), { from: 0, to: 31 });
  ds("titulo", tit("L", "O", "y"), { from: 32, to: 35 });
  ds("titulo", tit("N", "N", "j"), { from: 36, to: 39 });
  c.push({ name: "set_canvas", input: { width: W, height: H, fps: FPS } });
  return c;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const comandos = cena01();
  const t0 = Date.now();
  gerar({ nome: "01_praca", comandos, quadros: QUADROS, saida: dir });
  console.log(`ok: ${comandos.length} comandos, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

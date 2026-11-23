// Vila de pescadores à beira do lago, ao entardecer (256x144, estática).
// Uso: node --import tsx examples/vila/gen.mjs   (gera cmds.json, recria vila.anima.json e exporta vila.png em escala 4)
// Perspectiva de UM ponto: horizonte HZ (linha d'água ao fundo) e ponto de fuga XV; casas (box3d) e cais convergem para ele.
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, "../..");
const paint = await import("../../src/engine/paint.ts");
const W = 256, H = 144, HZ = 84, XV = 150;

function prng(s) { let a = s | 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const KEYS = [..."0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ#@$%&*+=-~^!?:;<>/|"];

const P = {
  // céu do entardecer: violeta frio em cima, laranja e creme no horizonte
  s0: "#262a52", s1: "#3a3468", s2: "#5c3c78", s3: "#8c4a80", s4: "#c45c78", s5: "#e8785e", s6: "#f8a45c", s7: "#ffd488", sun: "#fff4cc",
  c0: "#4a3670", c1: "#9a5280", c2: "#e07c68", c3: "#ffc488",
  // montanhas e mata ao fundo
  m3: "#7a5a92", m3L: "#b06a8a", m2L: "#8a5a88", m1L: "#5c4274", m2: "#5a4680", m1: "#3c3466", mL: "#c07a86", tree: "#2a2850", treeD: "#1e1c3c",
  // água
  w0: "#fcc47c", w1: "#f09a62", w2: "#c4637a", w3: "#7c4878", w4: "#4a3a6c", w5: "#30305a", wl: "#ffe6a8", wd: "#28284c",
  // margem e grama
  g0: "#2e2c44", g1: "#46444c", g2: "#666048", g3: "#8e7c56", gL: "#c49a5c", sand: "#9a6a5a", sandL: "#c88a64", sandD: "#6a4a54",
  // casas: frente na sombra (violeta), lateral acesa pelo sol (madeira quente), telhado de telha
  fr: "#4c3a5a", frL: "#3c2c4a", sd: "#c47a52", sdL: "#9a5a44", rf: "#b04a4a", rfL: "#843848", rfS: "#e0705a", gab: "#5c3a52",
  door: "#24182a", win: "#ffd25a", win2: "#f48a3a", chim: "#6a4a5a", stone: "#8a6a72",
  // cais e barco
  dk: "#a8704e", dkL: "#d49a64", dkD: "#6a4048", post: "#3c2836", hull: "#3a4a6a", hullL: "#5a7090", hullS: "#d8c8b0", hullD: "#24283e", mast: "#4a3038", sail: "#e8d0b0", sailD: "#b89490", rope: "#8a6a5a",
  // primeiro plano
  fg: "#16142a", fg2: "#22203a", fgL: "#4a3a50", lamp: "#ffe28a",
};
const names = Object.keys(P);
const K = (n) => { const i = names.indexOf(n); if (i < 0) throw new Error("cor desconhecida: " + n); return KEYS[i]; };
const cmds = [{ name: "set_canvas", input: { width: W, height: H } }];
for (let i = 0; i < names.length; i += 60) cmds.push({ name: "set_palette", input: { colors: names.slice(i, i + 60).map((n, j) => ({ key: KEYS[i + j], hex: P[n], name: n })) } });
const LAYERS = ["ceu", "nuvens", "montanhas3", "montanhas2", "montanhas1", "floresta", "lago", "reflexo", "brilho", "reflexo_perto", "margem", "casas", "janelas", "cais", "barco", "primeiro_plano", "vinheta"];
for (const l of LAYERS) cmds.push({ name: "add_layer", input: { name: l } });
const draw = (layer, shapes) => { for (let i = 0; i < shapes.length; i += 150) cmds.push({ name: "draw_shapes", input: { layer, shapes: shapes.slice(i, i + 150), preview: false } }); };
const tf = (layer, input) => cmds.push({ name: "transform", input: { frames: 0, layer, preview: false, ...input } });

// ---------- céu ----------
const SX = 170, SY = 72; // sol, meio escondido atrás das montanhas
draw("ceu", [
  { type: "gradient", x: 0, y: 0, w: W, h: HZ, colors: ["s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7"].map(K), direction: "vertical", dither: "bayer4", suavidade: 0.75, ondas: 2 },
  { type: "gradient", x: SX - 50, y: SY - 50, w: 100, h: 60, direction: "radial", cx: SX, cy: SY, r: 44, colors: [K("sun"), K("sun"), K("s7"), K("s6"), "."], dither: "bayer4", suavidade: 0.8 },
]);
// nuvens em faixas (estratos), barriga acesa pelo sol, topo frio
const rc = prng(4);
const clouds = [[40, 22, 80, 6], [150, 14, 110, 5], [222, 30, 70, 5], [96, 40, 60, 4], [200, 50, 50, 3]];
for (const [cx, cy, w, h] of clouds) {
  const sh = [];
  for (let k = 0; k < 7; k++) sh.push({ type: "ellipse", x: Math.round(cx + (rc() - 0.5) * w * 0.8 - w * 0.2), y: Math.round(cy + (rc() - 0.5) * h * 0.6), w: Math.round(w * (0.25 + rc() * 0.3)), h: Math.round(h * (0.6 + rc() * 0.5)), color: K("c1"), filled: true });
  sh.push({ type: "ellipse", x: cx - Math.round(w / 2), y: cy + Math.round(h * 0.3), w, h: Math.max(2, Math.round(h * 0.5)), color: K("c1"), filled: true });
  draw("nuvens", sh);
  draw("nuvens", [{ type: "gradient", x: cx - w, y: cy - h, w: w * 2, h: h * 2 + 2, colors: [K("c0"), K("c1"), K("c2"), K("c3")], dither: "bayer4", suavidade: 0.6, only: K("c1") }]);
}

// ---------- montanhas (3 planos) + mata da outra margem ----------
// cristas fractais próprias com um VALE onde o sol se põe (o sol aparece entre as montanhas, como na referência)
function ridge(rnd, base, amp, rough, valley, vw, N = 64) {
  const off = Array(N + 1).fill(0);
  const mid = (a, b, d) => { if (b - a < 2) return; const m = (a + b) >> 1; off[m] = (off[a] + off[b]) / 2 + (rnd() - 0.5) * d; mid(a, m, d * rough); mid(m, b, d * rough); };
  mid(0, N, amp);
  return off.map((o, i) => { const x = Math.round((i * W) / N); return [x, Math.round(base + o + valley * Math.exp(-(((x - SX) / vw) ** 2)))]; });
}
const mpoly = (pts, color) => ({ type: "polygon", points: [...pts, [W, HZ], [0, HZ]], color });
// faces acesas: em cada pico, a encosta virada para o sol ganha um triângulo de luz (como as montanhas da referência)
function facets(pts, color, depth) {
  const out = [];
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i];
    if (!(py <= pts[i - 1][1] && py <= pts[i + 1][1])) continue; // pico local
    const dir = px < SX ? 1 : -1; // encosta virada para o sol
    let j = i; while (pts[j + dir] && pts[j + dir][1] >= pts[j][1]) j += dir;
    const [vx, vy] = pts[j];
    if (Math.abs(vx - px) < 3) continue;
    out.push({ type: "polygon", points: [[px, py], ...pts.slice(Math.min(i, j), Math.max(i, j) + 1).filter((q) => q !== pts[i]).sort((a, b) => dir * (a[0] - b[0])), [vx, Math.min(HZ, vy + Math.round(depth * 0.4))], [Math.round(px + (vx - px) * 0.15), Math.min(HZ, py + depth)]], color });
  }
  return out;
}
const R3 = ridge(prng(7), 46, 44, 0.62, 22, 26), R2 = ridge(prng(12), 62, 26, 0.6, 12, 22), R1 = ridge(prng(3), 76, 10, 0.55, 4, 20);
draw("montanhas3", [mpoly(R3, K("m3")), ...facets(R3, K("m3L"), 26)]);
draw("montanhas2", [mpoly(R2, K("m2")), ...facets(R2, K("m2L"), 16)]);
draw("montanhas1", [mpoly(R1, K("m1")), ...facets(R1, K("m1L"), 8)]);
// disco do sol já baixo, meio escondido pela crista de perto
draw("ceu", [{ type: "gradient", x: SX - 12, y: SY - 12, w: 24, h: 24, direction: "radial", cx: SX, cy: SY, r: 9, colors: [K("sun"), K("sun"), K("sun"), K("s7"), "."], dither: "bayer4", suavidade: 0.4 }]);
draw("floresta", [{ type: "forest", x: 0, w: W, base: HZ, altura_min: 3, altura_max: 8, largura_min: 3, largura_max: 5, folga: 0.2, seed: 5, cores: [K("tree"), K("treeD")], tipo: "pinheiro" }]);
// textura de rocha/neve rala nas encostas (quebra o "papel recortado"), antes da névoa
draw("montanhas3", [{ type: "scatter", x: 0, y: 20, w: W, h: HZ - 20, colors: [K("m2"), K("m3L")], densidade: 0.035, forma: "traco", distancia: 3, seed: 31, only: K("m3") },
  { type: "scatter", x: 0, y: 20, w: W, h: HZ - 20, colors: [K("mL")], densidade: 0.03, forma: "traco", distancia: 3, seed: 32, only: K("m3L") }]);
draw("montanhas2", [{ type: "scatter", x: 0, y: 40, w: W, h: HZ - 40, colors: [K("m1"), K("m2L")], densidade: 0.018, forma: "traco", distancia: 4, seed: 33, only: K("m2") }]);
draw("montanhas1", [{ type: "scatter", x: 0, y: 60, w: W, h: HZ - 60, colors: [K("tree"), K("m1L")], densidade: 0.04, forma: "tufo", distancia: 3, seed: 34, only: K("m1") }]);
tf("montanhas3", { op: "haze", color: K("s6"), quantidade: 0.45 });
tf("montanhas2", { op: "haze", color: K("s5"), quantidade: 0.25 });
tf("montanhas1", { op: "haze", color: K("s5"), quantidade: 0.1 });
// névoa quente rente ao horizonte (suaviza a linha mata/água)
tf("montanhas1", { op: "haze", color: K("s6"), quantidade: 0.35, y_de: 70, y_ate: HZ, perfil: "subindo" });
tf("floresta", { op: "haze", color: K("s5"), quantidade: 0.3, y_de: 76, y_ate: HZ, perfil: "subindo" });

// ---------- lago ----------
draw("lago", [
  { type: "gradient", x: 0, y: HZ, w: W, h: H - HZ, colors: ["w1", "w2", "w3", "w4", "w5", "wd"].map(K), direction: "vertical", dither: "bayer4", suavidade: 0.7 },
  { type: "scatter", x: 0, y: HZ + 3, w: W, h: H - HZ - 3, colors: [K("w2"), K("w3")], densidade: 0.04, forma: "onda", distancia: 3, seed: 3 },
  { type: "scatter", x: 0, y: HZ + 4, w: W, h: 24, colors: [K("s4"), K("s3")], densidade: 0.03, forma: "traco", distancia: 4, seed: 21 },
  { type: "scatter", x: 0, y: HZ + 20, w: W, h: H - HZ - 20, colors: [K("w4"), K("wd")], densidade: 0.05, forma: "onda", distancia: 3, seed: 9 },
]);
tf("reflexo", { op: "reflect", fonte: ["montanhas3", "montanhas2", "montanhas1", "floresta"], y: HZ, alto: 30, onda: 1.3, mistura: 0.38, agua: K("w3"), dissolver: 0.15 });
// coluna de luz do sol na água
draw("brilho", [
  { type: "gradient", x: SX - 40, y: HZ, w: 80, h: 60, direction: "radial", cx: SX, cy: HZ, r: 26, colors: [K("sun"), K("w0"), K("w1"), "."], dither: "bayer4", suavidade: 0.8 },
  { type: "scatter", x: SX - 6, y: HZ + 2, w: 12, h: 8, colors: [K("wl"), K("w0")], densidade: 0.160, forma: "onda", distancia: 2, seed: 12 },
  { type: "scatter", x: SX - 10, y: HZ + 10, w: 20, h: 8, colors: [K("wl"), K("w0")], densidade: 0.145, forma: "onda", distancia: 2, seed: 13 },
  { type: "scatter", x: SX - 14, y: HZ + 18, w: 28, h: 8, colors: [K("wl"), K("w0")], densidade: 0.130, forma: "onda", distancia: 2, seed: 14 },
  { type: "scatter", x: SX - 18, y: HZ + 26, w: 36, h: 8, colors: [K("wl"), K("w0")], densidade: 0.115, forma: "onda", distancia: 2, seed: 15 },
  { type: "scatter", x: SX - 22, y: HZ + 34, w: 44, h: 8, colors: [K("wl"), K("w0")], densidade: 0.100, forma: "onda", distancia: 2, seed: 16 },
  { type: "scatter", x: SX - 26, y: HZ + 42, w: 52, h: 8, colors: [K("wl"), K("w0")], densidade: 0.085, forma: "onda", distancia: 2, seed: 17 },
  { type: "scatter", x: SX - 30, y: HZ + 50, w: 60, h: 8, colors: [K("wl"), K("w0")], densidade: 0.070, forma: "onda", distancia: 2, seed: 18 },
]);

// ---------- margem esquerda + praia do primeiro plano ----------
const bank = [[0, 83], [18, 82], [36, 83], [56, 85], [74, 88], [88, 93], [96, 100], [100, 110], [104, 122], [114, 132], [140, 136], [180, 139], [214, 142], [W, 141], [W, H], [0, H]];
draw("margem", [{ type: "polygon", points: bank, color: K("g1") }]);
draw("margem", [
  { type: "gradient", x: 0, y: 82, w: 120, h: H - 82, colors: ["g2", "g1", "g0"].map(K), direction: "vertical", dither: "bayer4", suavidade: 0.6, only: K("g1") },
  { type: "gradient", x: 100, y: 130, w: W - 100, h: 14, colors: ["sandL", "sand", "sandD"].map(K), direction: "vertical", dither: "bayer4", suavidade: 0.6, only: K("g1") },
]);
// borda iluminada da margem (contra a água, lado do sol)
const edge = [];
for (let i = 4; i < 13; i++) { const [x0, y0] = bank[i], [x1, y1] = bank[i + 1]; edge.push({ type: "line", x1: x0, y1: y0, x2: x1, y2: y1, color: K(i < 9 ? "gL" : "sandL") }); }
draw("margem", edge);
draw("margem", [
  { type: "scatter", x: 0, y: 84, w: 104, h: 56, colors: [K("g3"), K("g2")], densidade: 0.09, forma: "tufo", distancia: 3, seed: 6, ponta: K("gL"), only: K("g1") },
  { type: "scatter", x: 104, y: 134, w: 150, h: 10, colors: [K("sandD"), K("sandL")], densidade: 0.06, forma: "traco", distancia: 3, seed: 8, only: K("sand") },
]);
// trilha de terra ligando as portas ao cais (afina com a distância)
draw("margem", [
  { type: "curve", points: [[52, 110], [58, 118], [70, 128], [90, 136], [112, 140]], r1: 1, r2: 2.2, color: K("sandD") },
  { type: "curve", points: [[14, 131], [40, 136], [76, 139], [112, 141]], r1: 2.2, r2: 2.6, color: K("sandD") },
  { type: "curve", points: [[53, 111], [59, 119], [71, 128], [90, 135], [112, 139]], r1: 0.5, r2: 1, color: K("sand") },
  { type: "curve", points: [[15, 130], [40, 135], [76, 138], [112, 140]], r1: 1, r2: 1.2, color: K("sand") },
]);
draw("margem", [
  { type: "forest", x: 0, w: 66, base: 88, altura_min: 6, altura_max: 13, largura_min: 5, largura_max: 9, folga: 0.1, seed: 11, cores: [K("tree"), K("treeD"), K("g0")], tipo: "mista" },
  { type: "forest", x: 0, w: 30, base: 104, altura_min: 10, altura_max: 16, largura_min: 6, largura_max: 10, folga: 0.2, seed: 4, cores: [K("treeD"), K("g0")], tipo: "redonda" },
]);
// ---------- casas (box3d, todas com o mesmo ponto de fuga) ----------
const houses = [
  { x: 30, y: 92, w: 14, h: 8, prof: 7, rise: 6, espaco: 2 },
  { x: 70, y: 97, w: 14, h: 9, prof: 6, rise: 7, espaco: 2 },
  { x: 44, y: 109, w: 22, h: 13, prof: 10, rise: 10, espaco: 3 },
  { x: 4, y: 130, w: 34, h: 20, prof: 15, rise: 15, espaco: 3 },
];
for (const h of houses) {
  const B = { ...h, xv: XV, yh: HZ };
  // sombra de contato no chão
  draw("casas", [{ type: "polygon", points: [[B.x - 1, B.y + 1], [B.x + B.w + B.prof, B.y + 1], [B.x + B.w + B.prof - 2, B.y + 3], [B.x, B.y + 3]], color: K("g0") }]);
  draw("casas", [{ type: "box3d", ...B, frente: K("fr"), lado: K("sd"), telhado: K("rf"), empena: K("gab"), linhas: K("frL"), linhas_telhado: K("rfL") }]);
  const L = (u, v) => paint.pontoLateral({ ...B, frente: 0, lado: 0, telhado: 0, empena: 0 }, u, v).map(Math.round);
  const quad = (u0, u1, v0, v1, c) => ({ type: "polygon", points: [L(u0, v0), L(u1, v0), L(u1, v1), L(u0, v1)], color: K(c) });
  const s = h.w / 34; // escala da casa
  const jan = [];
  // janelas na lateral acesa (perspectiva) e porta + janela na frente (sombra) com luz quente de dentro
  if (h.w >= 20) { jan.push(quad(0.28, 0.72, 0.26, 0.64, "sdL")); jan.push(quad(0.36, 0.64, 0.34, 0.56, "win")); }
  else jan.push(quad(0.35, 0.65, 0.3, 0.6, "win2"));
  const dw = Math.max(2, Math.round(6 * s)), dh = Math.max(3, Math.round(11 * s));
  const dx = h.x + Math.round(h.w * 0.22);
  jan.push({ type: "rect", x: dx, y: h.y - dh, w: dw, h: dh, color: K("door"), filled: true });
  const ww = Math.max(2, Math.round(8 * s)), wh = Math.max(2, Math.round(6 * s));
  const wx = h.x + Math.round(h.w * 0.58), wy = h.y - Math.round(h.h * 0.7);
  jan.push({ type: "rect", x: wx, y: wy, w: ww, h: wh, color: K("win2"), filled: true });
  if (ww >= 4) jan.push({ type: "rect", x: wx + 1, y: wy + 1, w: ww - 2, h: wh - 2, color: K("win"), filled: true });
  draw("janelas", jan);
}
// chaminé da casa grande
draw("casas", [{ type: "rect", x: 12, y: 96, w: 4, h: 8, color: K("chim"), filled: true }, { type: "rect", x: 12, y: 96, w: 4, h: 1, color: K("stone"), filled: true }]);

// ---------- cais em perspectiva (converge para XV,HZ) ----------
const Y0 = 141, Y1 = 103; // ponta perto e ponta longe
const edgeX = (x0, y) => x0 + ((XV - x0) * (Y0 - y)) / (Y0 - HZ);
const XL = 112, XR = 130;
const dkPoly = [[edgeX(XL, Y1), Y1], [edgeX(XR, Y1), Y1], [XR, Y0], [XL, Y0]].map(([x, y]) => [Math.round(x), y]);
const scale = (y) => (y - HZ) / (Y0 - HZ);
const ck = [];
// o cais está à esquerda do ponto de fuga: vemos a face LATERAL DIREITA (espessura do deck) e as estacas por baixo dela
const thick = (y) => Math.max(1, Math.round(1 + 2 * scale(y)));
for (const y of [106, 112, 120, 130, 141]) {
  const len = Math.round(3 + 8 * scale(y)), x = Math.round(edgeX(XR, y)), xl = Math.round(edgeX(XL, y));
  ck.push({ type: "rect", x: x + 1 - (scale(y) > 0.6 ? 1 : 0), y: y + thick(y), w: scale(y) > 0.6 ? 2 : 1, h: len, color: K("post"), filled: true });
  ck.push({ type: "rect", x: xl + 1, y: y + thick(y), w: 1, h: Math.max(1, len - 2), color: K("post"), filled: true });
}
ck.push({ type: "polygon", points: dkPoly, color: K("dk") });
// espessura da ponta longe (borda frontal do deck)
ck.push({ type: "rect", x: dkPoly[0][0], y: Y1, w: dkPoly[1][0] - dkPoly[0][0] + 1, h: 1, color: K("dkD"), filled: true });
// tábuas: espaçamento em profundidade uniforme (1/z)
for (let k = 1; k < 30; k++) {
  const z = 1 + k * 0.18; const y = Math.round(HZ + (Y0 - HZ) / z);
  if (y <= Y1 + 1 || y >= Y0) continue;
  ck.push({ type: "line", x1: Math.round(edgeX(XL, y)), y1: y, x2: Math.round(edgeX(XR, y)), y2: y, color: K("dkD") });
}
// face lateral direita (espessura do deck), por cima das estacas e encostada na borda
ck.push({ type: "polygon", points: [[dkPoly[1][0] + 1, Y1], [XR + 1, Y0], [XR + 1, Y0 + thick(Y0)], [dkPoly[1][0] + 1, Y1 + thick(Y1)]], color: K("post") });
// borda direita acesa (de frente para o sol) e esquerda escura
ck.push({ type: "line", x1: XR, y1: Y0, x2: dkPoly[1][0], y2: Y1, color: K("dkL") });
ck.push({ type: "line", x1: XL, y1: Y0, x2: dkPoly[0][0], y2: Y1, color: K("dkD") });
draw("cais", ck);
// lampião na ponta do cais (acento quente)
const lx = dkPoly[1][0];
draw("cais", [{ type: "rect", x: lx, y: Y1 - 8, w: 1, h: 8, color: K("post"), filled: true }, { type: "rect", x: lx - 1, y: Y1 - 10, w: 3, h: 3, color: K("lamp"), filled: true }, { type: "pixels", points: [[lx, Y1 - 11]], color: K("post") }]);

// ---------- barco atracado à direita do cais (casco de lado, paralelo ao quadro) ----------
const BY = 125, BX = 145, S = 1.35; // linha d'água, popa e escala do barco
const bp = (u, v) => [Math.round(BX + u * S), Math.round(BY - v * S)];
const bpoly = (pts, c) => ({ type: "polygon", points: pts.map(([u, v]) => bp(u, v)), color: K(c) });
const bline = (u1, v1, u2, v2, c) => { const [x1, y1] = bp(u1, v1), [x2, y2] = bp(u2, v2); return { type: "line", x1, y1, x2, y2, color: K(c) }; };
draw("barco", [
  // casco (contraluz: escuro, com a borda de cima acesa pelo sol)
  bpoly([[0, 6], [30, 7], [33, 9], [31, 4], [27, 0], [4, 0], [1, 3]], "hull"),
  bpoly([[3, 1.5], [28, 1.5], [27, 0], [4, 0]], "hullD"),
  bline(1, 3.5, 30.5, 4, "hullS"),
  bline(0, 6, 30, 7, "dkL"), bline(30, 7, 33, 9, "dkL"),
  // mastro, retranca e vela recolhida
  bline(14, 6, 14, 30, "mast"), bline(14, 12, 27, 11, "mast"),
  bpoly([[14.5, 28], [16.5, 26], [17.5, 13], [14.5, 12.5]], "sail"), bline(16, 25, 17, 14, "sailD"),
  bline(14.5, 29.5, 32, 9, "rope"),
  // cabine com janela acesa
  bpoly([[4, 6], [11, 6], [11, 11], [4, 11]], "hullL"), bpoly([[3.5, 11], [11.5, 11], [11.5, 12], [3.5, 12]], "hullD"),
  bpoly([[6.5, 8], [8.5, 8], [8.5, 10], [6.5, 10]], "win"),
]);
// amarra ao cais
draw("barco", [{ type: "line", x1: BX, y1: BY - 8, x2: Math.round(edgeX(XR, 120)), y2: 120, color: K("rope") }]);
tf("reflexo_perto", { op: "reflect", fonte: ["barco"], y: BY, alto: 16, onda: 1, mistura: 0.55, agua: K("w4"), dissolver: 0.3 });
// reflexo das estacas do cais: riscas escuras onduladas
const rp = [];
for (const y of [106, 112, 120, 130]) {
  const len = Math.round(2 + 5 * scale(y));
  { const x = Math.round(edgeX(XR, y)); for (let k = 0; k < len + 2; k += 2) rp.push({ type: "pixels", points: [[x + (k % 4 ? 1 : 0), y + thick(y) + len + k]], color: K("wd") }); }
}
draw("reflexo_perto", rp);

// ---------- primeiro plano: juncos escuros à direita e capim à esquerda (enquadram) ----------
const rr = prng(77); const fgS = [];
for (let i = 0; i < 18; i++) {
  const x = 216 + Math.round(rr() * 40), hgt = 10 + Math.round(rr() * 22), lean = Math.round((rr() - 0.6) * 6);
  fgS.push({ type: "curve", points: [[x, H], [x + lean / 2, H - hgt / 2], [x + lean, H - hgt]], r1: 1, r2: 0.5, color: K(i % 3 ? "fg" : "fg2") });
  if (i % 4 === 0) fgS.push({ type: "ellipse", x: x + lean - 1, y: H - hgt - 2, w: 3, h: 5, color: K("fg2"), filled: true });
}
for (let i = 0; i < 14; i++) {
  const x = Math.round(rr() * 70), hgt = 4 + Math.round(rr() * 8), lean = Math.round((rr() - 0.4) * 4);
  fgS.push({ type: "curve", points: [[x, H], [x + lean, H - hgt]], r1: 1, r2: 0.5, color: K("fg") });
}
draw("primeiro_plano", fgS);
// vinheta leve
draw("vinheta", [{ type: "gradient", x: 0, y: 0, w: W, h: H, direction: "radial", cx: W / 2, cy: H * 0.55, r: 170, colors: [".", ".", ".", ".", K("fg")], dither: "bayer4", suavidade: 0.5 }]);

cmds.push({ name: "update_layer", input: { layer: "Base", delete: true } });
const cmdFile = path.join(DIR, "cmds.json");
writeFileSync(cmdFile, JSON.stringify(cmds));
const proj = path.join(DIR, "vila.anima.json");
const anima = (...a) => execFileSync("node", [path.join(ROOT, "bin/anima.mjs"), ...a], { cwd: ROOT, encoding: "utf8" });
anima("new", proj, `${W}x${H}`, "1");
const out = anima("run", proj, cmdFile, "-q");
if (/erro/i.test(out)) console.log(out.split("\n").filter((l) => /erro/i.test(l)).slice(0, 5).join("\n"));
anima("export", proj, path.join(DIR, "vila.png"), "--scale", "4", "--frame", "0");
console.log("ok:", proj);

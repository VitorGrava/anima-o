// RODADA 3: textura (scatter), nuvens iluminadas por baixo, estrelas, ondas e reflexo do sol no lago, casa com detalhes
import { prng, ridge, poly, makeScene } from "./lib.mjs";
const P = { s0: "#2b1b4a", s1: "#4a2a6a", s2: "#7a3a82", s3: "#b04a86", s4: "#e0627a", s5: "#f58a5a", s6: "#fdb561", s7: "#ffe08a", sun: "#fff6c0",
  m1: "#5a4a8c", m2: "#463a78", m3: "#322e60", tree: "#1d3a46", tree2: "#14303a", tree3: "#0f2530", treeL: "#2c4a5c",
  g1: "#3f7a46", g2: "#2f6440", g3: "#58944c", g4: "#234a32", gl: "#8fbf5a", wood: "#7a4a2a", wood2: "#5a3420", woodL: "#9a6238", roof: "#8a2e3a", roofL: "#b04a4a", roofD: "#5e1f2e",
  win: "#ffd25a", winD: "#c47a2a", flower: "#ff7aa8", flower2: "#fff0a0", flower3: "#c0a0ff", dark: "#1a1030", star: "#fff0c8",
  lk1: "#5a3a7a", lk2: "#7a4a86", lk3: "#c4607e", lk4: "#f0906a", c0: "#6a3a8a", c1: "#c4607e", c2: "#f58a5a", c3: "#ffd08a", stone: "#8a7a9a", stoneD: "#6a5a7a", smoke: "#b8a0c0", smoke2: "#d8c0d0" };
const { K, draw, save } = makeScene(P, ["ceu", "estrelas", "nuvens", "montanhas", "lago", "floresta", "campo", "casa", "detalhes"]);
const HZ = 100;
draw("ceu", [
  { type: "gradient", x: 0, y: 0, w: 320, h: HZ, colors: ["s0","s1","s2","s3","s4","s5","s6","s7"].map(K), direction: "vertical", dither: "bayer4", suavidade: 0.75, ondas: 2 },
  { type: "gradient", x: 150, y: 40, w: 120, h: 120, direction: "radial", cx: 210, cy: 96, r: 46, colors: [K("sun"), K("sun"), K("s7"), K("s6"), "."], dither: "bayer4", suavidade: 0.8 }]);
draw("estrelas", [{ type: "scatter", x: 0, y: 0, w: 320, h: 42, colors: [K("star"), K("star"), K("s7")], densidade: 0.012, forma: "pixel", distancia: 6, seed: 5 },
  { type: "scatter", x: 0, y: 0, w: 320, h: 30, colors: [K("star")], densidade: 0.004, forma: "cruz", distancia: 18, seed: 8 }]);
// nuvens: massa em elipses, com gradiente vertical (topo escuro, barriga acesa pelo sol) limitado à massa
const rc = prng(4);
const clouds = [[30, 38, 70, 12], [120, 24, 90, 10], [230, 46, 80, 11], [270, 20, 50, 8]];
for (const [cx, cy, w, h] of clouds) {
  const sh = [];
  for (let k = 0; k < 6; k++) sh.push({ type: "ellipse", x: Math.round(cx + (rc() - 0.5) * w * 0.7 - w * 0.25), y: Math.round(cy + (rc() - 0.5) * h * 0.4), w: Math.round(w * (0.3 + rc() * 0.3)), h: Math.round(h * (0.55 + rc() * 0.4)), color: K("c1"), filled: true });
  sh.push({ type: "ellipse", x: cx - Math.round(w / 2), y: cy + Math.round(h * 0.35), w: w, h: Math.round(h * 0.5), color: K("c1"), filled: true });
  draw("nuvens", sh);
  draw("nuvens", [{ type: "gradient", x: cx - w, y: cy - 4, w: w * 2, h: h + 8, colors: [K("c0"), K("c1"), K("c2"), K("c3")], dither: "bayer4", suavidade: 0.6, only: K("c1") }]);
}
// montanhas
const r1 = prng(3), r2 = prng(9), r3 = prng(21);
draw("montanhas", [poly(ridge(r1, 66, 46, 0.58), HZ, K("m1")), poly(ridge(r2, 78, 30, 0.55), HZ, K("m2")), poly(ridge(r3, 90, 18, 0.55), HZ, K("m3"))]);
// lago: reflexo do céu + reflexo do sol + ondas
draw("lago", [
  { type: "gradient", x: 0, y: HZ, w: 320, h: 36, colors: ["s7","s6","s5","s4","s3","s2","s1"].map(K), direction: "vertical", dither: "bayer4", suavidade: 0.6 },
  { type: "gradient", x: 176, y: HZ, w: 68, h: 36, direction: "radial", cx: 210, cy: HZ, r: 36, colors: [K("sun"), K("s7"), "."], dither: "bayer4", suavidade: 0.8 },
  { type: "scatter", x: 0, y: HZ + 2, w: 320, h: 32, colors: [K("lk3"), K("lk4")], densidade: 0.05, forma: "onda", distancia: 3, seed: 3 },
  { type: "scatter", x: 170, y: HZ + 2, w: 80, h: 30, colors: [K("sun"), K("s7")], densidade: 0.09, forma: "onda", distancia: 2, seed: 12 },
  { type: "scatter", x: 0, y: HZ + 14, w: 320, h: 22, colors: [K("lk1"), K("lk2")], densidade: 0.05, forma: "onda", distancia: 3, seed: 4 }]);
// floresta: pinheiros de alturas e larguras variadas, dois planos
const rt = prng(30);
const pines = []; const pine = (x, base, h, w, c) => pines.push({ type: "polygon", points: [[x, base], [x + Math.round(w * 0.3), base - Math.round(h * 0.55)], [x + Math.round(w * 0.12), base - Math.round(h * 0.55)], [x + Math.round(w * 0.5), base - h], [x + Math.round(w * 0.88), base - Math.round(h * 0.55)], [x + Math.round(w * 0.7), base - Math.round(h * 0.55)], [x + w, base]], color: K(c) });
for (let x = 160; x < 330; x += 5 + Math.floor(rt() * 4)) pine(x, HZ + 1, 12 + Math.round(rt() * 10), 7 + Math.round(rt() * 4), "treeL");
for (let x = 150; x < 335; x += 7 + Math.floor(rt() * 5)) pine(x, HZ + 4, 20 + Math.round(rt() * 16), 9 + Math.round(rt() * 5), ["tree", "tree2", "tree3"][Math.floor(rt() * 3)]);
draw("floresta", pines);
// margem do lago
draw("campo", [poly(ridge(prng(40), 134, 3, 0.6), 140, K("g4"))]);
draw("campo", [{ type: "gradient", x: 0, y: 136, w: 320, h: 44, colors: ["g4", "g2", "g1", "g3"].map(K), direction: "vertical", dither: "bayer4", suavidade: 0.6, ondas: 2 }]);
draw("campo", [
  { type: "scatter", x: 0, y: 138, w: 320, h: 42, colors: [K("gl"), K("g3")], densidade: 0.07, forma: "tufo", distancia: 3, seed: 6, ponta: K("gl") },
  { type: "scatter", x: 0, y: 140, w: 320, h: 40, colors: [K("g4")], densidade: 0.05, forma: "tufo", distancia: 3, seed: 7 }]);
// caminho de pedras
draw("casa", [{ type: "polygon", points: [[44, 156], [54, 156], [78, 180], [24, 180]], color: K("stoneD") }, { type: "scatter", x: 24, y: 156, w: 54, h: 24, colors: [K("stone"), K("smoke")], densidade: 0.07, forma: "traco", distancia: 4, seed: 2 }]);
// casa: paredes de madeira com tábuas, telhado com luz/sombra, chaminé e fumaça
draw("casa", [
  { type: "rect", x: 30, y: 128, w: 44, h: 28, color: K("wood"), filled: true },
  { type: "gradient", x: 30, y: 128, w: 44, h: 28, colors: [K("woodL"), K("wood"), K("wood2")], dither: "bayer4", suavidade: 0.5, only: K("wood") },
  { type: "rect", x: 56, y: 100, w: 6, h: 14, color: K("stoneD"), filled: true }, { type: "rect", x: 55, y: 99, w: 8, h: 2, color: K("stone"), filled: true },
  { type: "polygon", points: [[24, 129], [52, 110], [80, 129]], color: K("roof") },
  { type: "polygon", points: [[24, 129], [52, 110], [52, 129]], color: K("roofL") },
  { type: "polygon", points: [[52, 110], [80, 129], [66, 129]], color: K("roofD") },
  { type: "rect", x: 40, y: 138, w: 10, h: 18, color: K("wood2"), filled: true }, { type: "rect", x: 58, y: 136, w: 10, h: 10, color: K("winD"), filled: true }, { type: "rect", x: 59, y: 137, w: 8, h: 8, color: K("win"), filled: true },
  { type: "rect", x: 62, y: 137, w: 1, h: 8, color: K("winD"), filled: true }, { type: "rect", x: 59, y: 140, w: 8, h: 1, color: K("winD"), filled: true }]);
draw("detalhes", [
  { type: "ellipse", x: 54, y: 90, w: 8, h: 6, color: K("smoke"), filled: true }, { type: "ellipse", x: 58, y: 80, w: 10, h: 7, color: K("smoke"), filled: true }, { type: "ellipse", x: 64, y: 70, w: 12, h: 8, color: K("smoke2"), filled: true },
  { type: "scatter", x: 0, y: 144, w: 320, h: 36, colors: [K("flower"), K("flower2"), K("flower3")], densidade: 0.006, forma: "cruz", distancia: 7, seed: 14 }]);
save(new URL("./cmds.json", import.meta.url).pathname);

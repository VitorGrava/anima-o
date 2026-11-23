// RODADA 11: SEM a abelha (não foi pedida) e casa em PERSPECTIVA (box3d, ponto de fuga no horizonte, lateral recuando; caminho converge ao mesmo ponto). (base: rodada 10)
// RODADA 10 (FINAL): vinheta mais leve e cor duplicada removida. (base: rodada 9)
// RODADA 9: CENA ANIMADA (8 frames): estrelas cintilando, fumaça subindo, brilho da água (scatter variar_por_frame), abelha batendo asa com flutuação, vaga-lumes em órbita. (base: rodada 8)
// RODADA 8: vaga-lumes menores, abelha no campo, folhagem do 1º plano fora do caminho, textura/luz de borda no pinheiro, vinheta, reduce_colors. (base: rodada 7)
// RODADA 7: protagonista (abelha do projeto abelha32), pinheiro em primeiro plano, vaga-lumes, sombra no chão. (base: rodada 6)
// RODADA 6: transform haze (perspectiva atmosférica por plano). (base: rodada 5)
// RODADA 5: transform reflect (reflexo de montanhas e floresta no lago). (base: rodada 4)
// RODADA 4: scatter evitar (flores fora da casa), shade/outline seletivo na casa, caminho em degradê. (base: rodada 3)
// RODADA 3: textura (scatter), nuvens iluminadas por baixo, estrelas, ondas e reflexo do sol no lago, casa com detalhes
import { prng, ridge, poly, makeScene, loadPaint } from "./lib.mjs";
const paint = await loadPaint();
const P = { s0: "#2b1b4a", s1: "#4a2a6a", s2: "#7a3a82", s3: "#b04a86", s4: "#e0627a", s5: "#f58a5a", s6: "#fdb561", s7: "#ffe08a", sun: "#fff6c0",
  m1: "#5a4a8c", m2: "#463a78", m3: "#322e60", tree: "#1d3a46", tree2: "#14303a", tree3: "#0f2530", treeL: "#2c4a5c",
  g1: "#3f7a46", g2: "#2f6440", g3: "#58944c", g4: "#234a32", gl: "#8fbf5a", wood: "#7a4a2a", wood2: "#5a3420", woodL: "#9a6238", roof: "#8a2e3a", roofL: "#b04a4a", roofD: "#5e1f2e",
  win: "#ffd25a", winD: "#c47a2a", flower: "#ff7aa8", flower2: "#fff0a0", flower3: "#c0a0ff", dark: "#1a1030", star: "#fff0c8",
  lk1: "#5a3a7a", lk2: "#7a4a86", lk3: "#d0587a", lk4: "#f0906a", c0: "#6a3a8a", c1: "#c4607e", c2: "#f4905e", c3: "#ffd08a", stone: "#8a7a9a", stoneD: "#6a5a7a", smoke: "#b8a0c0", smoke2: "#d8c0d0", fg: "#121a26", fg2: "#1c2a3a", fgL: "#3a4a5a", glow: "#fff2a0", glow2: "#ffd060" };
Object.assign(P, { wf: "#4a3050", wfL: "#3a2440", ws: "#c47a4a", wsL: "#9a5a3c", rl: "#d0605a", rlL: "#a84450", gab: "#583448", door: "#2c1a24", doorF: "#7a4a3a", winG: "#ffd25a", winG2: "#ff9a3a", chim: "#6a4a5a", chimL: "#a07a7a", shadow: "#1d3a2c" });
const { K, draw, save, cmds } = makeScene(P, ["ceu", "estrelas", "nuvens", "montanhas3", "montanhas2", "montanhas1", "lago", "reflexo", "floresta", "campo", "casa", "detalhes", "fumaca", "vagalumes", "brilho_agua", "cintilar", "primeiro_plano", "vinheta"]);
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
draw("montanhas3", [poly(ridge(r1, 66, 46, 0.58), HZ, K("m1"))]);
draw("montanhas2", [poly(ridge(r2, 78, 30, 0.55), HZ, K("m2"))]);
draw("montanhas1", [poly(ridge(r3, 90, 18, 0.55), HZ, K("m3"))]);
for (const [l, q] of [["montanhas3", 0.42], ["montanhas2", 0.24], ["montanhas1", 0.08]]) cmds.push({ name: "transform", input: { frames: 0, layer: l, op: "haze", color: K("s5"), quantidade: q, preview: false } });
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
cmds.push({ name: "transform", input: { frames: 0, layer: "reflexo", op: "reflect", fonte: ["montanhas3", "montanhas2", "montanhas1"], y: HZ + 1, alto: 9, onda: 1.2, mistura: 0.62, agua: K("lk2"), preview: false } });
cmds.push({ name: "transform", input: { frames: 0, layer: "reflexo", op: "reflect", fonte: ["floresta"], y: HZ + 1, alto: 22, onda: 1.4, mistura: 0.5, agua: K("lk2"), preview: false } });
// margem do lago
draw("campo", [poly(ridge(prng(40), 134, 3, 0.6), 140, K("g4"))]);
draw("campo", [{ type: "gradient", x: 0, y: 136, w: 320, h: 44, colors: ["g4", "g2", "g1", "g3"].map(K), direction: "vertical", dither: "bayer4", suavidade: 0.6, ondas: 2 }]);
draw("campo", [
  { type: "scatter", x: 0, y: 138, w: 320, h: 42, colors: [K("gl"), K("g3")], densidade: 0.07, forma: "tufo", distancia: 3, seed: 6, ponta: K("gl") },
  { type: "scatter", x: 0, y: 140, w: 320, h: 40, colors: [K("g4")], densidade: 0.05, forma: "tufo", distancia: 3, seed: 7 }]);
// ---- casa em PERSPECTIVA: ponto de fuga no horizonte (x=160, y=HZ); caminho e casa convergem para o mesmo ponto ----
const XV = 160;
const HB = { x: 62, y: 156, w: 34, h: 22, prof: 18, xv: XV, yh: HZ, rise: 14, espaco: 3 };
const door0 = 74, door1 = 82;
const pathX = (x, y) => Math.round(x - ((XV - x) / (156 - HZ)) * (y - 156));
draw("casa", [
  { type: "polygon", points: [[HB.x, 156], [HB.x + HB.w + HB.prof, 156], [HB.x + HB.w - 36, 168], [HB.x - 34, 168]], color: K("g4") },
  { type: "polygon", points: [[door0, 156], [door1, 156], [pathX(door1, 180), 180], [pathX(door0, 180), 180]], color: K("stoneD") },
  { type: "gradient", x: 20, y: 156, w: 70, h: 24, colors: [K("stoneD"), K("stone"), K("smoke")], dither: "bayer4", suavidade: 0.6, only: K("stoneD") },
  { type: "scatter", x: 20, y: 156, w: 70, h: 24, colors: [K("stoneD"), K("stone")], densidade: 0.09, forma: "traco", distancia: 3, seed: 2, only: K("stone") },
  { type: "box3d", ...HB, frente: K("wf"), lado: K("ws"), telhado: K("rl"), empena: K("gab"), linhas: K("wfL"), linhas_telhado: K("rlL") }]);
// linhas das tábuas da lateral em tom próprio (a engine usa uma cor só por box): redesenha a lateral com tábuas mais claras
const L = (u, v) => paint.pontoLateral({ ...HB, rise: 14, frente: 0, lado: 0, telhado: 0, empena: 0 }, u, v).map(Math.round);
const quad = (u0, u1, v0, v1, color) => ({ type: "polygon", points: [L(u0, v0), L(u1, v0), L(u1, v1), L(u0, v1)], color: K(color) });
draw("casa", [
  quad(0.22, 0.72, 0.18, 0.62, "winG2"), quad(0.26, 0.68, 0.24, 0.56, "winG"),
  { type: "line", x1: L(0.47, 0.24)[0], y1: L(0.47, 0.24)[1], x2: L(0.47, 0.56)[0], y2: L(0.47, 0.56)[1], color: K("winG2") },
  { type: "line", x1: L(0.26, 0.4)[0], y1: L(0.26, 0.4)[1], x2: L(0.68, 0.4)[0], y2: L(0.68, 0.4)[1], color: K("winG2") },
  { type: "rect", x: door0 - 1, y: 134, w: door1 - door0 + 2, h: 22, color: K("doorF"), filled: true }, { type: "rect", x: door0, y: 135, w: door1 - door0, h: 21, color: K("door"), filled: true },
  { type: "pixels", points: [[door1 - 2, 146]], color: K("winG") },
  { type: "rect", x: 65, y: 140, w: 6, h: 6, color: K("doorF"), filled: true }, { type: "rect", x: 66, y: 141, w: 4, h: 4, color: K("winG2"), filled: true },
  { type: "box3d", x: 86, y: 119, w: 5, h: 14, prof: 3, xv: XV, yh: HZ, rise: 0, frente: K("chim"), lado: K("chimL"), espaco: 3 }]);
draw("detalhes", [
  { type: "scatter", x: 0, y: 144, w: 320, h: 36, colors: [K("flower"), K("flower2"), K("flower3")], densidade: 0.006, forma: "cruz", distancia: 7, seed: 14, evitar: ["casa"] }]);

// ---- pinheiro grande em primeiro plano (silhueta que enquadra a cena à direita) ----
const fg = [{ type: "rect", x: 298, y: 40, w: 9, h: 140, color: K("fg"), filled: true }];
for (let k = 0; k < 9; k++) { const cy = 22 + k * 15, hw = 10 + k * 3.4; fg.push({ type: "polygon", points: [[Math.round(302 - hw), cy + 22], [302, cy - 6], [Math.round(302 + hw), cy + 22]], color: K(k % 2 ? "fg" : "fg2") }); }
draw("primeiro_plano", fg);
draw("primeiro_plano", [{ type: "gradient", x: 262, y: 0, w: 28, h: 180, direction: "horizontal", colors: [K("fgL"), K("fg2"), K("fg")], dither: "bayer4", suavidade: 0.5, only: K("fg2") },
  { type: "scatter", x: 262, y: 20, w: 80, h: 160, colors: [K("fgL")], densidade: 0.03, forma: "traco", distancia: 3, seed: 5, only: K("fg2") }]);
draw("primeiro_plano", [{ type: "scatter", x: 0, y: 160, w: 320, h: 20, colors: [K("fg"), K("fg2")], densidade: 0.09, forma: "tufo", distancia: 3, seed: 77, evitar: ["casa"] }]);

cmds.push({ name: "transform", input: { frames: 0, layer: "casa", op: "outline", mode: "seletivo", preview: false } });
draw("vinheta", [{ type: "gradient", x: 0, y: 0, w: 320, h: 180, direction: "radial", cx: 160, cy: 92, r: 232, colors: [".", ".", ".", K("dark")], dither: "bayer4", suavidade: 0.4 }]);

// ================= ANIMAÇÃO (8 frames) =================
const NF = 8;
cmds.push({ name: "add_frames", input: { count: NF - 1, copy_from: 0 } });
const TAU = Math.PI * 2;
// estrelas: 3 grupos de cruzes que acendem em fases diferentes (cintilar)
const groups = [[31, [0, 1, 2, 3]], [32, [2, 3, 4, 5]], [33, [4, 5, 6, 7]], [34, [6, 7, 0, 1]]];
for (const [sd, fr] of groups) cmds.push({ name: "draw_shapes", input: { frames: fr, layer: "cintilar", shapes: [{ type: "scatter", x: 0, y: 0, w: 320, h: 70, colors: [K("star")], densidade: 0.0016, forma: "cruz", distancia: 26, seed: sd }], preview: false } });
// brilho da água muda a cada frame
cmds.push({ name: "draw_shapes", input: { frames: "all", layer: "brilho_agua", shapes: [
  { type: "scatter", x: 176, y: HZ + 3, w: 72, h: 30, colors: [K("sun"), K("s7")], densidade: 0.08, forma: "onda", distancia: 2, seed: 100, variar_por_frame: true },
  { type: "scatter", x: 0, y: HZ + 3, w: 176, h: 32, colors: [K("lk4"), K("lk3")], densidade: 0.03, forma: "onda", distancia: 3, seed: 200, variar_por_frame: true }], preview: false } });
// fumaça: 3 baforadas sobem em ciclo (3 px por frame, 24 px de curso = 8 frames)
for (let f = 0; f < NF; f++) {
  const smoke = [];
  for (let i = 0; i < 3; i++) { const pos = (f * 3 + i * 8) % 24; const w = Math.round(5 + pos * 0.34), h = Math.round(4 + pos * 0.2); smoke.push({ type: "ellipse", x: Math.round(89 + Math.sin((pos / 24) * TAU) * 2 + pos * 0.25 - w / 2), y: 107 - pos - h, w, h, color: K(pos > 14 ? "smoke2" : "smoke"), filled: true }); }
  cmds.push({ name: "draw_shapes", input: { frames: f, layer: "fumaca", shapes: smoke, preview: false } });
}
// vaga-lumes em órbita lenta, brilho que pulsa
const rf = prng(61); const fl0 = []; while (fl0.length < 11) { const x = 14 + rf() * 250, y = 122 + rf() * 40, ph = rf() * TAU, rx = 3 + rf() * 5, ry = 2 + rf() * 3; if (x > 40 && x < 135 && y > 108) continue; fl0.push({ x, y, ph, rx, ry }); }
for (let f = 0; f < NF; f++) {
  const sh = fl0.map((b) => { const t = (f / NF) * TAU + b.ph; const x = Math.round(b.x + Math.sin(t) * b.rx), y = Math.round(b.y + Math.cos(t) * b.ry); const big = Math.sin(t * 2) > 0; return { type: "gradient", x: x - 3, y: y - 3, w: 7, h: 7, direction: "radial", cx: x, cy: y, r: big ? 3.6 : 2.6, colors: [K("glow"), K("glow2"), "."], dither: "bayer4", suavidade: 0.7 }; });
  cmds.push({ name: "draw_shapes", input: { frames: f, layer: "vagalumes", shapes: sh, preview: false } });
}
cmds.push({ name: "set_frame_timing", input: { frames: "all", duration_ms: [130, 120, 120, 130, 130, 120, 120, 130] } });
cmds.push({ name: "reduce_colors", input: { cores: 110, proteger: [K("win"), K("sun"), K("glow")] } });
save(new URL("./cmds.json", import.meta.url).pathname);

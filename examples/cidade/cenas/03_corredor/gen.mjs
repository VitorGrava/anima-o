// Cena 03 — corredor do shopping (14,6–21,5 s, 83 quadros).
// Faixa larga de lojas desenhada UMA vez (quadro-fonte), copiada com deslocamento a cada quadro (pan sem tremedeira).
// Aos ~18 s escurece e surge "ESPAÇO-LIXO"; aos ~19 s corte para outro trecho do corredor (MODA, CALÇADOS, PERFUMES).
import { gerar, W, H } from "../../lib/comum.mjs";
import { PALETA, addFrames, cmd, shapes, rows, rect, line, texto, px, pessoaGrande, sentada, cores, passo } from "../_shopping.mjs";

const ID = "03_corredor", N = 83, LARG = 512, MUNDO = 700;
const F = (q) => q + 2; // quadros 0 e 1 do projeto são fontes (mundo x<472 e x>=300), apagados no fim
const c = [];
c.push(cmd("set_palette", { colors: PALETA }));
c.push(cmd("set_canvas", { width: LARG, height: H }));
c.push(cmd("update_layer", { layer: "Base", rename: "fundo" }));
for (const n of ["cenario", "tras", "quiosque", "frente", "titulo"]) c.push(cmd("add_layer", { name: n }));

// ---------- faixa de lojas (coordenadas do mundo; x de 0 a ~700) ----------
const TOPO = 86, CHAO = 199;
const lojas = [
  { nome: "TECH", placa: "t", txt: "w" }, { nome: "CAFÉ", placa: "m", txt: "w" }, { nome: "JOIAS", placa: "i", txt: "w", reflexo: "e" },
  { nome: "MODA", placa: "R", txt: "w" }, { nome: "CALÇADOS", placa: "J", txt: "w" }, { nome: "ÓCULOS", placa: "g", txt: "w" },
  { nome: "LIVROS", placa: "z", txt: "w" },
];
const S = [];
// piso
S.push({ type: "gradient", x: 0, y: CHAO, w: MUNDO, h: H - CHAO, colors: ["k", "j", "d", "e"], dither: "bayer4", suavidade: 0.5 });
// teto: luminárias embutidas e friso
S.push(rect(0, 82, MUNDO, 4, "e"), line(0, 85, MUNDO, 85, "f"));
for (let x = 4; x < MUNDO; x += 22) S.push(line(x, 80, x + 9, 80, "w"), line(x, 81, x + 9, 81, "c"));
// viga das placas
S.push(rect(0, TOPO, MUNDO, 16, "h"));
lojas.forEach((L, k) => {
  const x0 = k * 100, x1 = x0 + 92;
  // placa
  S.push(rect(x0 + 3, TOPO + 2, 86, 12, L.placa), line(x0 + 3, TOPO + 13, x0 + 88, TOPO + 13, "i"));
  S.push(texto(L.nome, x0 + 46, TOPO + 5, L.txt, { alinhar: "centro", espaco: 2 }));
  // pilar
  S.push(rect(x1, TOPO, 8, CHAO - TOPO, "h"), line(x1 + 1, TOPO + 16, x1 + 1, CHAO - 1, "g"));
  // rodapé da vitrine
  S.push(rect(x0, CHAO - 3, 92, 3, "g"));
  // reflexo da vitrine no piso brilhante
  S.push({ type: "gradient", x: x0 + 2, y: CHAO, w: 88, h: 22, colors: [L.reflexo ?? "k", "j"], dither: "bayer4", suavidade: 0.9 });
  // reflexo do pilar no piso (some com a distância)
  S.push({ type: "gradient", x: x1, y: CHAO, w: 8, h: 34, colors: ["f", "e", "j"], dither: "bayer4", suavidade: 0.8 });
});
const Y0 = TOPO + 16, Y1 = CHAO - 3; // vão da vitrine
// TECH
S.push(rect(0, Y0, 92, Y1 - Y0, "w"), rect(0, Y0 + 62, 92, Y1 - Y0 - 62, "c"));
for (const yy of [Y0 + 8, Y0 + 27]) for (const xx of [6, 34, 62]) {
  S.push(rect(xx, yy, 24, 15, "h"), rect(xx + 1, yy + 1, 22, 13, "u"));
  S.push(line(xx + 3, yy + 12, xx + 13, yy + 2, "v"), line(xx + 4, yy + 12, xx + 14, yy + 2, "v"));
}
S.push(rect(0, Y0 + 56, 92, 2, "f"));
for (let xx = 5; xx < 90; xx += 10) S.push(rect(xx, Y0 + 49, 4, 7, "i"), px([[xx + 1, Y0 + 50]], "v"));
S.push(rect(0, Y0 + 64, 92, 1, "e"));
// CAFÉ
const C0 = 100;
S.push(rect(C0, Y0, 92, Y1 - Y0, "o"), rect(C0, Y0 + 60, 92, Y1 - Y0 - 60, "p"));
S.push(rect(C0 + 12, Y0 + 8, 28, 16, "i"), rect(C0 + 13, Y0 + 9, 26, 14, "h"));
for (let j = 0; j < 3; j++) S.push(line(C0 + 16, Y0 + 12 + j * 3, C0 + 28 + (j % 2) * 6, Y0 + 12 + j * 3, j === 1 ? "q" : "c"));
S.push(rect(C0 + 31, Y0 + 13, 5, 4, "q"), px([[C0 + 36, Y0 + 14]], "q"));
for (const lx of [C0 + 52, C0 + 74]) {
  S.push(line(lx, Y0, lx, Y0 + 16, "h"), rect(lx - 2, Y0 + 17, 5, 1, "q"), rect(lx - 3, Y0 + 18, 7, 2, "q"), px([[lx - 1, Y0 + 20], [lx, Y0 + 20], [lx + 1, Y0 + 20]], "y"));
}
S.push(rect(C0 + 58, Y0 + 34, 14, 12, "e"), rect(C0 + 59, Y0 + 35, 12, 10, "d"));
// balcão do café
S.push(rect(C0 + 46, Y0 + 58, 46, Y1 - Y0 - 58, "m"), rect(C0 + 46, Y0 + 56, 46, 3, "n"), line(C0 + 46, Y0 + 66, C0 + 91, Y0 + 66, "X"));
S.push(rect(C0 + 72, Y0 + 46, 12, 10, "f"), rect(C0 + 73, Y0 + 47, 10, 4, "g"), px([[C0 + 76, Y0 + 52], [C0 + 79, Y0 + 52]], "i"));
// mesinha
S.push(rect(C0 + 14, Y1 - 14, 22, 2, "n"), line(C0 + 25, Y1 - 12, C0 + 25, Y1 - 1, "m"), rect(C0 + 21, Y1 - 1, 9, 1, "m"));
// JOIAS
const J0 = 200;
S.push(rect(J0, Y0, 92, Y1 - Y0, "r"));
for (const cx of [J0 + 20, J0 + 46, J0 + 72]) {
  S.push({ type: "polygon", points: [[cx - 3, Y0], [cx + 3, Y0], [cx + 12, Y0 + 62], [cx - 12, Y0 + 62]], color: "s" });
  S.push({ type: "polygon", points: [[cx - 1, Y0], [cx + 1, Y0], [cx + 5, Y0 + 62], [cx - 5, Y0 + 62]], color: "x" });
  S.push(rect(cx - 9, Y0 + 62, 18, Y1 - Y0 - 62, "h"), rect(cx - 10, Y0 + 60, 20, 3, "f"), line(cx - 9, Y0 + 61, cx + 8, Y0 + 61, "c"));
  S.push(px([[cx - 4, Y0 + 58], [cx, Y0 + 57], [cx + 4, Y0 + 58]], "y"), px([[cx - 3, Y0 + 66], [cx - 1, Y0 + 66], [cx + 1, Y0 + 66]], "x"));
}
S.push(line(J0 + 6, Y0 + 40, J0 + 22, Y0 + 6, "s"), line(J0 + 7, Y0 + 40, J0 + 23, Y0 + 6, "s"));
S.push(rect(J0, Y0, 92, 1, "s"));
// MODA
const M0 = 300;
S.push(rect(M0, Y0, 92, Y1 - Y0, "K"), rect(M0, Y0 + 70, 92, Y1 - Y0 - 70, "c"));
for (const mx of [M0 + 18, M0 + 40]) {
  S.push({ type: "ellipse", x: mx - 2, y: Y0 + 14, w: 5, h: 5, color: "d", filled: true }, line(mx, Y0 + 19, mx, Y0 + 21, "d"));
  S.push({ type: "polygon", points: [[mx - 3, Y0 + 21], [mx + 3, Y0 + 21], [mx + 8, Y0 + 58], [mx - 8, Y0 + 58]], color: "R" });
  S.push(line(mx + 2, Y0 + 22, mx + 6, Y0 + 56, "S"), line(mx, Y0 + 58, mx, Y0 + 74, "g"), rect(mx - 4, Y0 + 74, 9, 2, "g"));
}
S.push(line(M0 + 56, Y0 + 20, M0 + 88, Y0 + 20, "g"));
["F", "C", "w", "E", "A", "R"].forEach((cc, j) => S.push(rect(M0 + 57 + j * 5, Y0 + 22, 4, 16, cc), line(M0 + 59 + j * 5, Y0 + 20, M0 + 59 + j * 5, Y0 + 21, "f")));
S.push(rect(M0 + 56, Y0 + 48, 32, 2, "f"));
["B", "D", "F"].forEach((cc, j) => S.push(rect(M0 + 58 + j * 10, Y0 + 42, 8, 6, cc)));
// CALÇADOS
const K0 = 400;
S.push(rect(K0, Y0, 92, Y1 - Y0, "w"));
for (let j = 0; j < 5; j++) {
  const yy = Y0 + 14 + j * 15;
  S.push(rect(K0 + 40, yy, 48, 2, "d"));
  ["R", "y", "C", "t", "E"].forEach((cc, s) => { if ((s + j) % 4 !== 3) S.push(rect(K0 + 42 + s * 9, yy - 3, 6, 3, cc), px([[K0 + 42 + s * 9, yy - 4]], cc)); });
}
S.push(rect(K0 + 6, Y0 + 10, 26, 36, "c"), rect(K0 + 8, Y0 + 12, 22, 32, "y"), texto("-50%", K0 + 19, Y0 + 24, "R", { alinhar: "centro" }));
S.push(rect(K0 + 8, Y1 - 12, 24, 12, "e"), rect(K0 + 8, Y1 - 13, 24, 2, "c"));
// ÓCULOS
const O0 = 500;
S.push(rect(O0, Y0, 92, Y1 - Y0, "c"));
for (let j = 0; j < 4; j++) for (let s = 0; s < 4; s++) {
  const xx = O0 + 46 + s * 11, yy = Y0 + 12 + j * 12;
  S.push(rect(xx, yy, 3, 2, "i"), rect(xx + 5, yy, 3, 2, "i"), px([[xx + 3, yy]], "i"));
}
S.push(rect(O0 + 6, Y0 + 8, 30, 44, "g"), { type: "ellipse", x: O0 + 12, y: Y0 + 16, w: 18, h: 20, color: "2", filled: true }, rect(O0 + 12, Y0 + 23, 18, 3, "i"));
S.push(rect(O0 + 40, Y1 - 20, 50, 20, "e"), rect(O0 + 40, Y1 - 21, 50, 2, "w"));
// LIVROS
const B0 = 600;
S.push(rect(B0, Y0, 92, Y1 - Y0, "o"));
for (let j = 0; j < 5; j++) {
  const yy = Y0 + 16 + j * 15;
  S.push(rect(B0 + 4, yy, 84, 2, "m"));
  for (let s = 0; s < 20; s++) S.push(rect(B0 + 6 + s * 4, yy - 9 + ((s * 7 + j) % 3), 3, 9 - ((s * 7 + j) % 3), "ABCDFRmtz"[(s * 5 + j * 3) % 9]));
}
// gente parada desenhada no cenário (vendedor do quiosque, casal no café)
const OFFS = [40, -300]; // fonte 0: mundo -40..472 ; fonte 1: mundo 300..812
function desloca(s, d) {
  const o = { ...s };
  for (const k of ["x", "x1", "x2"]) if (typeof o[k] === "number") o[k] += d;
  if (o.points) o.points = o.points.map(([a, b]) => [a + d, b]);
  return o;
}
function quiosque(x, w, nome, cores6, yb = 214) {
  const Q = [];
  Q.push(rect(x + 8, yb - 52, 2, 30, "g"), rect(x + w - 10, yb - 52, 2, 30, "g"));
  Q.push(rect(x + 2, yb - 60, w - 4, 10, "i"), texto(nome, x + w / 2, yb - 58, "w", { alinhar: "centro" }));
  Q.push(rect(x, yb - 24, w, 24, "w"), rect(x, yb - 26, w, 3, "c"), rect(x, yb - 4, w, 4, "d"), line(x, yb - 24, x + w - 1, yb - 24, "e"));
  for (let j = 0; j * 6 + 4 < w - 4; j++) Q.push(rect(x + 4 + j * 6, yb - 20, 4, 6, cores6[j % cores6.length]));
  Q.push({ type: "gradient", x: x + 2, y: yb, w: w - 4, h: 3, colors: ["e", "j"], dither: "bayer2" });
  return Q;
}
const QS = [...quiosque(86, 72, "CAPINHAS", ["R", "y", "C", "D", "t", "E", "B"]), ...quiosque(352, 64, "PERFUMES", ["K", "y", "F", "E", "w", "C"])];
c.push(cmd("add_frames", { count: 1, copy_from: 0 }));
OFFS.forEach((off, fr) => {
  c.push(shapes("cenario", fr, S.map((s) => desloca(s, off))));
  c.push(rows("cenario", fr, off + C0 + 6, Y1 - 22, sentada({ ...cores(2), dir: 1 })));
  c.push(rows("cenario", fr, off + C0 + 31, Y1 - 22, sentada({ ...cores(9), dir: -1, cabecaBaixa: 1 })));
  c.push(rows("cenario", fr, off + 122, CHAO - 28, pessoaGrande({ parado: true, dir: -1, ...cores(4), blusa: "w" })));
  c.push(rows("cenario", fr, off + 375, CHAO - 26, pessoaGrande({ parado: true, dir: 1, ...cores(7), blusa: "i" })));
  c.push(shapes("quiosque", fr, QS.map((s) => desloca(s, off))));
});

// ---------- quadros ----------
c.push(addFrames(N, 1));
// teto: luz fria vinda do alto (fixo, não acompanha o pan)
c.push(shapes("fundo", "all", [{ type: "gradient", x: 0, y: 0, w: W, h: 86, colors: ["e", "d", "c", "c"], dither: "bayer4", suavidade: 0.5 }]));

const ease = (t) => t * t * (3 - 2 * t);
const CORTE = 53;
const pan = (q) => (q < CORTE ? 25 + Math.round(175 * (0.15 * (q / (CORTE - 1)) + 0.85 * ease(q / (CORTE - 1)))) : 340 + Math.round(((q - CORTE) * 34) / (N - CORTE)));
for (let q = 0; q < N; q++) {
  const fr = pan(q) + W <= 472 ? 0 : 1;
  const dx = -(pan(q) + OFFS[fr]);
  c.push(cmd("copy_layer_content", { from_frame: fr, from_layer: "cenario", to_frames: [F(q)], to_layer: "cenario", dx }));
  c.push(cmd("copy_layer_content", { from_frame: fr, from_layer: "quiosque", to_frames: [F(q)], to_layer: "quiosque", dx }));
}

// pedestres: x no mundo, v px/quadro, faixa: tras (pés y=203) ou frente (pés y=229)
const A = [
  { x: 35, v: 0.9, dir: 1, l: "tras", i: 0 }, { x: 175, v: 0.8, dir: -1, l: "tras", i: 1, sacola: "R" },
  { x: 235, v: 1.0, dir: 1, l: "tras", i: 2 }, { x: 330, v: 0.9, dir: -1, l: "tras", i: 3 }, { x: 290, v: 0.7, dir: 1, l: "tras", i: 5, sacola: "y" },
  { x: 12, v: 1.1, dir: 1, l: "frente", i: 6 }, { x: 205, v: 1.0, dir: -1, l: "frente", i: 7, sacola: "y" },
  { x: 268, v: 0.9, dir: 1, l: "frente", i: 8, sacola: "C" }, { x: 385, v: 1.2, dir: -1, l: "frente", i: 10 },
  { x: 150, v: 0.6, dir: 1, l: "tras", i: 11, longo: true }, { x: 110, v: 0.9, dir: -1, l: "frente", i: 18, sacola: "R" },
  { x: 330, v: 0.8, dir: 1, l: "frente", i: 19, longo: true, sacola: "K" },
];
const B = [
  { x: 345, v: 0.8, dir: 1, l: "tras", i: 12, sacola: "R" }, { x: 470, v: 0.9, dir: -1, l: "tras", i: 13 },
  { x: 520, v: 0.7, dir: -1, l: "tras", i: 14, longo: true }, { x: 395, v: 1.0, dir: 1, l: "frente", i: 15, sacola: "y" },
  { x: 505, v: 1.1, dir: -1, l: "frente", i: 16 }, { x: 330, v: 1.0, dir: 1, l: "frente", i: 17 },
  { x: 440, v: 0.7, dir: 1, l: "frente", i: 20, longo: true, sacola: "R" }, { x: 560, v: 0.9, dir: -1, l: "tras", i: 21, sacola: "C" },
];
for (let q = 0; q < N; q++) {
  const lista = q < CORTE ? A : B, t = q < CORTE ? q : q - CORTE;
  for (const p of lista) {
    const wx = p.x + p.dir * p.v * t, sx = Math.round(wx - pan(q)) - 6;
    if (sx < -14 || sx > W + 1) continue;
    const pes = p.l === "tras" ? 203 : 229;
    const r = pessoaGrande({ frame: passo(q, p.i % 4, 3), dir: p.dir, ...cores(p.i), sacola: p.sacola ?? null, longo: !!p.longo });
    c.push(rows(p.l, F(q), sx, pes - 30, r));
  }
  // brilho da vitrine de joias (estrela que pisca)
  const sx = 246 - pan(q);
  if (sx > -4 && sx < W + 4) {
    const on = Math.floor(q / 4) % 3 !== 2;
    c.push(shapes("tras", F(q), on ? [px([[sx, Y0 + 18], [sx, Y0 + 20], [sx - 1, Y0 + 19], [sx + 1, Y0 + 19]], "y"), px([[sx, Y0 + 19]], "w")] : [px([[sx, Y0 + 19]], "y")]));
  }
}

// escurece levemente aos ~18 s (q≥41) e mais um pouco depois
const ESC = 41;
for (const L of ["cenario", "quiosque", "tras", "frente", "fundo"]) {
  c.push(cmd("transform", { layer: L, frames: { from: F(ESC), to: F(ESC + 3) }, op: "haze", color: "h", quantidade: 0.12 }));
  c.push(cmd("transform", { layer: L, frames: { from: F(ESC + 4), to: F(N - 1) }, op: "haze", color: "h", quantidade: 0.28 }));
  // faixa mais escura atrás do título (legibilidade)
  c.push(cmd("transform", { layer: L, frames: { from: F(ESC + 2), to: F(N - 1) }, op: "haze", color: "i", quantidade: 0.45, y_de: 104, y_ate: 146, perfil: "pico" }));
}
// título letra a letra
const TIT = "ESPAÇO-LIXO";
for (let q = ESC + 2; q < N; q++) {
  const n = Math.min(TIT.length, q - (ESC + 2) + 1);
  const parcial = TIT.slice(0, n);
  const larg = (TIT.length * 4 - 1) * 3;
  c.push(shapes("titulo", F(q), [texto(parcial, Math.round(W / 2 - larg / 2), 113, "w", { escala: 3, sombra: "i" })]));
  if (q >= ESC + 2 + TIT.length + 2) c.push(shapes("titulo", F(q), [texto("\"JUNKSPACE\" - REM KOOLHAAS", W / 2, 136, "c", { alinhar: "centro", sombra: "i" })]));
}

c.push(cmd("delete_frames", { frames: [0, 1] }));
c.push(cmd("set_canvas", { width: W, height: H }));
gerar({ nome: ID, comandos: c.flat(), quadros: N, saida: `examples/cidade/cenas/${ID}` });
console.log("ok", ID, N);

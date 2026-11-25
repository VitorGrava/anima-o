// Cena 04 — área de descanso (21,5–27 s, 66 quadros).
// Pan para a direita (parede de ripas, sofá, gente no celular → painel LIQUIDAÇÃO, visor 21°C, câmera no teto);
// depois zoom rápido na câmera: redesenhada por quadro em escala crescente (sem ampliar pixels), LED vermelho piscando.
import { gerar, W, H } from "../../lib/comum.mjs";
import { PALETA, addFrames, cmd, shapes, rows, rect, line, texto, px, sentada, cores } from "../_shopping.mjs";

const ID = "04_lounge", N = 66, LARG = 360;
const F = (q) => q + 1;
const c = [];
c.push(cmd("set_palette", { colors: PALETA }));
c.push(cmd("set_canvas", { width: LARG, height: H }));
c.push(cmd("update_layer", { layer: "Base", rename: "cenario" }));
for (const n of ["gente", "frente", "zoom"]) c.push(cmd("add_layer", { name: n }));

const TETO = 88, PAREDE = 150, CHAO = 237;
// ---------- mundo (x 0..360) ----------
const S = [];
S.push({ type: "gradient", x: 0, y: 0, w: LARG, h: TETO, colors: ["e", "d", "c"], dither: "bayer4", suavidade: 0.3 });
S.push(rect(0, TETO, LARG, CHAO - TETO, "c"));
S.push({ type: "gradient", x: 0, y: TETO + 4, w: LARG, h: 40, colors: ["w", "c"], dither: "bayer4", suavidade: 0.6 });
// trilho de spots no teto
S.push(rect(0, TETO, LARG, 3, "h"), line(0, TETO + 3, LARG, TETO + 3, "f"));
for (let x = 6; x < LARG; x += 4) S.push(px([[x, TETO + 1]], "g"));
for (let x = 20; x < LARG; x += 34) S.push(rect(x, TETO + 1, 3, 2, "w"), px([[x + 1, TETO + 3]], "w"));
// parede de ripas de madeira
const RX = 174;
S.push(rect(0, PAREDE, RX, CHAO - PAREDE, "W"), rect(0, PAREDE, RX, 2, "Z"));
for (let x = 2; x < RX; x += 4) S.push(line(x, PAREDE + 2, x, CHAO - 1, "X"), line(x + 1, PAREDE + 2, x + 1, CHAO - 1, "Z"));
S.push(line(RX, PAREDE, RX, CHAO - 1, "X"));
// detalhes de luz (riscos curvos na madeira, como no original)
for (const [x, y] of [[40, 158], [52, 164], [118, 172], [130, 168], [142, 180]]) S.push({ type: "curve", points: [[x, y], [x + 2, y + 6], [x + 1, y + 12]], r1: 0.5, color: "o" });
// piso
S.push({ type: "gradient", x: 0, y: CHAO, w: LARG, h: H - CHAO, colors: ["k", "j", "d", "e"], dither: "bayer4", suavidade: 0.5 });
S.push(line(0, CHAO, LARG, CHAO, "e"));
// tapete redondo
S.push({ type: "ellipse", x: 8, y: CHAO + 2, w: 170, h: 14, color: "d", filled: true }, { type: "ellipse", x: 14, y: CHAO + 4, w: 158, h: 10, color: "e", filled: true });
// sofá grande
function sofa(x, w, y0 = 214) {
  // encosto (y0..y0+10), assento (y0+10..+16), frente (..CHAO)
  const o = [];
  o.push(rect(x + 2, y0, w - 4, 11, "l"), rect(x + 1, y0 + 1, 1, 10, "l"), rect(x + w - 2, y0 + 1, 1, 10, "l"), line(x + 2, y0, x + w - 3, y0, "c"));
  o.push(rect(x, y0 + 11, w, 6, "l"), line(x, y0 + 11, x + w - 1, y0 + 11, "c"), rect(x, y0 + 17, w, CHAO - 1 - (y0 + 17), "L"));
  for (let k = 1; k < 3; k++) o.push(line(x + Math.round((w * k) / 3), y0 + 2, x + Math.round((w * k) / 3), y0 + 10, "L"));
  o.push(rect(x - 6, y0 + 6, 9, CHAO - 1 - (y0 + 6), "L"), rect(x - 6, y0 + 6, 9, 2, "l"), rect(x + w - 3, y0 + 6, 9, CHAO - 1 - (y0 + 6), "L"), rect(x + w - 3, y0 + 6, 9, 2, "l"));
  o.push(rect(x - 4, CHAO - 1, 2, 1, "h"), rect(x + w + 1, CHAO - 1, 2, 1, "h"));
  return o;
}
S.push(...sofa(22, 132));
// sacolas no chão
S.push(rect(156, 226, 7, 11, "R"), line(157, 224, 161, 224, "S"), rect(163, 229, 6, 8, "y"), rect(150, 230, 6, 7, "C"));
// painel LIQUIDAÇÃO
const PX0 = 214, PY0 = 124, PW = 74, PH = 44;
S.push(rect(PX0 - 2, PY0 - 2, PW + 4, PH + 4, "i"), rect(PX0, PY0, PW, PH, "R"), rect(PX0, PY0 + PH - 3, PW, 3, "S"));
S.push(texto("LIQUIDAÇÃO", PX0 + PW / 2, PY0 + 11, "w", { alinhar: "centro" }), texto("ATÉ 70% OFF", PX0 + PW / 2, PY0 + 26, "y", { alinhar: "centro" }));
// visor 21°C
S.push(rect(298, 142, 22, 18, "i"), texto("21°C", 309, 145, "w", { alinhar: "centro" }), line(302, 154, 315, 154, "t"), line(302, 156, 310, 156, "g"));
// sofá pequeno + planta à direita
S.push(...sofa(236, 70, 214));
function planta(x, y) {
  const o = [rect(x + 5, y + 30, 10, 12, "h"), rect(x + 4, y + 30, 12, 2, "g")];
  const folhas = [[0, 10, 8, 14], [10, 4, 9, 16], [4, 0, 8, 14], [14, 14, 8, 12], [-4, 18, 9, 10], [6, 16, 8, 12]];
  folhas.forEach(([dx, dy, w, h], k) => o.push({ type: "ellipse", x: x + dx, y: y + dy, w, h, color: k % 2 ? "Q" : "P", filled: true }));
  folhas.forEach(([dx, dy, w, h]) => o.push(line(x + dx + Math.floor(w / 2), y + dy + 2, x + 10, y + 30, "Q")));
  return o;
}
S.push(...planta(318, 196));
c.push(shapes("cenario", 0, S));
// gente sentada (estática no mundo; o brilho do celular é animado por quadro)
const sentados = [
  { x: 46, y: 207, o: { ...cores(1), pele: "4", cabelo: "5", blusa: "A", calca: "8", dir: 1, canela: 11, tronco: 3 } },
  { x: 106, y: 207, o: { ...cores(0), pele: "1", cabelo: "6", blusa: "e", calca: "9", dir: -1, canela: 11, tronco: 3, cabecaBaixa: 1 } },
  { x: 262, y: 207, o: { pele: "1", cabelo: "7", blusa: "D", calca: "8", dir: 1, canela: 11, tronco: 3, cabecaBaixa: 1 } },
];
for (const s of sentados) c.push(rows("cenario", 0, s.x, s.y, sentada(s.o)));
// planta da esquerda (camada da frente, mesmo pan)
const PL = planta(2, 198);
c.push(shapes("frente", 0, PL));
c.push(rows("frente", 0, 0, 0, ["."])); // (garante a camada no quadro-fonte)

c.push(addFrames(N, 0));
// ---------- pan (q 0..37) ----------
const ease = (t) => t * t * (3 - 2 * t);
const ZQ = 38;
const PAN = 152;
const pan = (q) => Math.round(PAN * ease(Math.min(1, q / 34)));
for (let q = 0; q < ZQ; q++) {
  c.push(cmd("copy_layer_content", { from_frame: 0, from_layer: "cenario", to_frames: [F(q)], to_layer: "cenario", dx: -pan(q) }));
  c.push(cmd("copy_layer_content", { from_frame: 0, from_layer: "frente", to_frames: [F(q)], to_layer: "frente", dx: -pan(q) }));
  // celulares: brilho que pulsa e um dedo que rola a tela
  for (const [k, s] of sentados.entries()) {
    const sx = s.x - pan(q) + (s.o.dir > 0 ? 9 : 3), sy = s.y + 9 - (s.o.cabecaBaixa ? 0 : 0);
    const on = (q + k * 5) % 14 < 10;
    c.push(shapes("gente", F(q), [px([[sx, sy]], on ? "w" : "v")]));
  }
  // LED da câmera
  if ((q >> 2) % 2 === 0) c.push(shapes("gente", F(q), [px([[256 - pan(q), 98]], "R")]));
}
// câmera de segurança no mundo (camada gente, para piscar junto)
function camera(T, k) {
  // T: (x,y) do mundo → tela ; k: escala
  const P = (x, y) => T(x, y).map(Math.round);
  const o = [];
  const poly = (pts, color) => ({ type: "polygon", points: pts.map(([x, y]) => P(x, y)), color });
  // suporte
  o.push(poly([[260, TETO + 3], [264, TETO + 3], [264, 97], [260, 97]], "e"));
  o.push(poly([[258, TETO + 3], [266, TETO + 3], [266, TETO + 5], [258, TETO + 5]], "f"));
  // corpo (cilindro inclinado apontando para baixo-esquerda)
  o.push(poly([[244, 101], [270, 93], [273, 101], [247, 109]], "w"));
  o.push(poly([[246, 106], [272, 98], [273, 101], [247, 109]], "d"));
  o.push(poly([[270, 93], [276, 92], [278, 99], [273, 101]], "e"));
  // lente
  const [lx, ly] = P(245.5, 105);
  const r = Math.max(2, Math.round(3.6 * k));
  o.push({ type: "ellipse", x: lx - r, y: ly - r, w: 2 * r + 1, h: 2 * r + 1, color: "h", filled: true });
  const r2 = Math.max(1, Math.round(2.6 * k));
  o.push({ type: "ellipse", x: lx - r2, y: ly - r2, w: 2 * r2 + 1, h: 2 * r2 + 1, color: "i", filled: true });
  const r3 = Math.max(1, Math.round(1.3 * k));
  if (k >= 2) o.push({ type: "ellipse", x: lx - r3 - Math.round(k * 0.6), y: ly - r3 - Math.round(k * 0.6), w: 2 * r3, h: 2 * r3, color: "s", filled: true });
  if (k >= 3) {
    const r4 = Math.round(1.9 * k);
    o.push({ type: "ellipse", x: lx - r4, y: ly - r4, w: 2 * r4 + 1, h: 2 * r4 + 1, color: "r", filled: true });
    const r5 = Math.round(1.1 * k);
    o.push({ type: "ellipse", x: lx - r5, y: ly - r5, w: 2 * r5 + 1, h: 2 * r5 + 1, color: "i", filled: true });
    o.push({ type: "ellipse", x: lx - Math.round(k * 1.6), y: ly - Math.round(k * 1.6), w: Math.round(k * 0.9), h: Math.round(k * 0.9), color: "f", filled: true });
    o.push(px([[lx + Math.round(k * 0.9), ly + Math.round(k * 0.7)]], "x"));
  }
  o.push(px([P(244, 102)], "f"));
  return o;
}
const T0 = (q) => (x, y) => [x - pan(q), y];
for (let q = 0; q < ZQ; q++) c.push(shapes("gente", F(q), camera(T0(q), 1)));

// ---------- zoom (q 38..65): tudo redesenhado em escala k, foco na lente ----------
const LX = 245.5, LY = 105;
for (let q = ZQ; q < N; q++) {
  const t = (q - ZQ) / (N - 1 - ZQ);
  const k = q < 50 ? 1 + 1.3 * ease((q - ZQ) / 12) : 2.3 + 4.2 * ease(Math.min(1, (q - 50) / 7));
  const u = Math.min(1, (q - ZQ) / 20);
  const fx = 245.5 - PAN + (100 - (245.5 - PAN)) * ease(u), fy = 105 + (118 - 105) * ease(u);
  const T = (x, y) => [fx + (x - LX) * k, fy + (y - LY) * k];
  const R = (x0, y0, w, h, color) => { const [a, b] = T(x0, y0), [cc, d] = T(x0 + w, y0 + h); return rect(Math.round(a), Math.round(b), Math.round(cc) - Math.round(a), Math.round(d) - Math.round(b), color); };
  const Z = [];
  Z.push(rect(0, 0, W, H, "c"));
  const [, ty] = T(0, TETO);
  Z.push({ type: "gradient", x: 0, y: 0, w: W, h: Math.max(1, Math.round(ty)), colors: ["e", "d", "c"], dither: "bayer4", suavidade: 0.5 });
  Z.push(R(-400, TETO, 1200, 3, "h"));
  for (let x = 20; x < LARG; x += 34) Z.push(R(x, TETO + 1, 3, 2, "w"));
  Z.push(R(-400, PAREDE, RX + 400, CHAO - PAREDE, "W"));
  for (let x = 2; x < RX; x += 4) { const [a] = T(x, 0); const [b] = T(x + 1, 0); Z.push(R(x, PAREDE + 2, Math.max(1 / k, (Math.round(b) - Math.round(a)) / k), CHAO - PAREDE, "X")); }
  Z.push(R(PX0 - 2, PY0 - 2, PW + 4, PH + 4, "i"), R(PX0, PY0, PW, PH, "R"), R(PX0, PY0 + PH - 3, PW, 3, "S"));
  const esc = Math.max(1, Math.floor(k));
  const [tx1, ty1] = T(PX0 + PW / 2, PY0 + 11), [, ty2] = T(0, PY0 + 26);
  if (k < 4.5) Z.push(texto("LIQUIDAÇÃO", Math.round(tx1), Math.round(ty1), "w", { alinhar: "centro", escala: esc }), texto("ATÉ 70% OFF", Math.round(tx1), Math.round(ty2), "y", { alinhar: "centro", escala: esc }));
  else { const [lx0, py] = T(PX0 + 4, PY0); Z.push(texto("LIQUI", Math.max(4, Math.round(lx0)), Math.min(250, Math.round(py) + 46), "w", { escala: 6, espaco: 1 })); }
  Z.push(R(298, 142, 22, 18, "i"));
  const [vx, vy] = T(309, 145);
  Z.push(texto("21°C", Math.round(vx), Math.round(vy), "w", { alinhar: "centro", escala: esc }));
  Z.push(...camera(T, k));
  // LED vermelho piscando (cresce com o zoom)
  const [ledx, ledy] = T(256, 98.5);
  const on = (q >> 2) % 2 === 0 || q >= 58;
  const lr = Math.max(0, Math.round(0.8 * k));
  if (on) Z.push(lr ? { type: "ellipse", x: Math.round(ledx) - lr, y: Math.round(ledy) - lr, w: 2 * lr + 1, h: 2 * lr + 1, color: "R", filled: true } : px([[Math.round(ledx), Math.round(ledy)]], "R"));
  if (on && k > 3) Z.push(px([[Math.round(ledx) - 1, Math.round(ledy) - 1]], "K"));
  c.push(shapes("zoom", F(q), Z.filter((s) => !(s.type === "rect" && (s.w <= 0 || s.h <= 0)))));
}

c.push(cmd("delete_frames", { frames: [0] }));
c.push(cmd("set_canvas", { width: W, height: H }));
gerar({ nome: ID, comandos: c.flat(), quadros: N, saida: `examples/cidade/cenas/${ID}` });
console.log("ok", ID, N);

// Cena 09 — torre de vidro atrás do muro; câmera sobe (tilt) até o topo. 42,5–46,8 s = 52 quadros.
import { W, H, pessoa, BLUSAS } from "../../lib/comum.mjs";
import { Paleta, Tela, rodar, ease, bayer, passo, pessoaG } from "../_px912.mjs";
import { coresTorre, torre, muro } from "../_torre_vidro.mjs";

const N = 52;
const pal = new Paleta();
const C = coresTorre(pal);
const ceu = ["#7c8898", "#8f9aa8", "#a3acb7", "#b6bdc6"].map((h, i) => pal.c(h, "ceu" + i));
const nuvem = pal.c("#c9cfd6", "nuvem"), nuvemSomb = pal.c("#6f7b8b", "nuvem-sombra");
const calc = pal.c("#b0b5bb", "calcada"), calcLuz = pal.c("#bfc3c8", "calcada-luz"), chao = pal.c("#979da4", "chao"), meio = pal.c("#8a9098", "meio-fio");
const poste = pal.c("#2e323a", "frade");
const blusa = BLUSAS.map((h, i) => pal.c(h, "blusa" + i));
const bone = pal.c("#b83a30", "bone"), mochila = pal.c("#d86a50", "mochila");

// mundo: x de -30 a 179, y de 0 a 463. Topo da torre y=36, topo do muro 298, chão 378.
const TOPO = 36, MURO = 298, CHAO = 378;
const reflexos = [
  [58, 7, 0.25, 0.9, 1.1], [100, 4, -0.2, 0.8, 0.8], [138, 7, 0.4, 0.8, 1.2], [176, 4, 0.0, 1.0, 0.8],
  [212, 8, 0.3, 0.8, 1.2], [246, 4, -0.3, 0.7, 0.7], [272, 6, 0.2, 0.9, 0.9],
];
const vista = (f) => {
  const t = ease((f - 10) / 32);
  return { vx: Math.round(-30 + 30 * t), vy: Math.round(143 - 137 * t) };
};

// pessoas: x inicial (mundo), direção, cores, fase
const gente = [
  { x: 2, dir: 1, pele: "4", cabelo: "5", blusa: blusa[1], calca: "9", v: 0.55, tipo: "curto" },
  { x: 30, dir: 1, pele: "2", cabelo: "6", blusa: blusa[6], calca: "8", v: 0.6, mochila: mochila, tipo: "curto" },
  { x: 72, dir: -1, pele: "3", cabelo: "5", blusa: "8", calca: "9", v: 0.5, tipo: "coque" },
  { x: 118, dir: -1, pele: "4", cabelo: bone, blusa: blusa[2], calca: "8", v: 0.45, tipo: "bone" },
  { x: 150, dir: -1, pele: "1", cabelo: "7", blusa: blusa[3], calca: "9", v: 0.55, tipo: "longo" },
];

// nuvem: base achatada escura, corpo claro em lombadas (cores chapadas, borda com dither curto)
function nuvemForma(T, x, y, w, h) {
  const bumps = [[0.25, 0.55], [0.5, 0.85], [0.75, 0.6]];
  T.ellipse(x + w / 2, y + h * 0.75, w / 2, h * 0.3, nuvemSomb);
  for (const [bx, bh] of bumps) T.ellipse(x + w * bx, y + h * (1 - bh) + h * 0.35, w * 0.22, h * bh * 0.55, nuvem);
  T.ellipse(x + w / 2, y + h * 0.62, w * 0.42, h * 0.22, nuvem);
}

function cena(f) {
  const { vx, vy } = vista(f);
  const T = new Tela(W, H, vx, vy);
  // céu (paralaxe: anda metade da câmera)
  const py = Math.round(vy * 0.45);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ty = Math.min(1, Math.max(0, (y + py - 30) / 260)) * (ceu.length - 1);
    const a = Math.floor(ty), k = ceu[Math.min(ceu.length - 1, a + (passo(ty - a, x, y, 0.35) ? 1 : 0))];
    T.set(x + vx, y + vy, k);
  }
  // nuvens: faixas claras e escuras em espaço de tela com paralaxe e deriva lenta
  const deriva = Math.floor(f / 6);
  const nuvens = [[10, 30, 70, 12], [118, 70, 60, 10], [-20, 150, 80, 14], [110, 205, 70, 11], [20, 265, 90, 14], [130, 320, 60, 10], [-10, 360, 70, 12]];
  for (const [nx, ny, nw, nh] of nuvens) nuvemForma(T, nx + deriva + vx, ny - py + vy, nw, nh);
  torre(T, C, { cx: 90, yTopo: TOPO, yBase: MURO, wTopo: 72, wBase: 122, reflexos });
  muro(T, C, { xa: -30, xb: 180, y0: MURO, y1: CHAO, portao: [96, 36], guarita: [140, 26, 42], placa: [118 - 76, MURO + 4, 51, 17] });
  // calçada e rua
  T.rect(-30, CHAO, 210, 90, calc);
  T.hline(-30, 180, CHAO, calcLuz);
  for (let x = -30; x < 180; x += 14) T.vline(x, CHAO + 1, CHAO + 3, chao);
  T.rect(-30, 440, 210, 2, meio); T.rect(-30, 442, 210, 30, chao);
  // frades (postes baixos) e pessoa sentada
  for (const x of [-26, -8]) { T.rect(x, CHAO - 8, 2, 9, poste); }
  T.rect(-28, CHAO - 9, 22, 2, poste); T.vline(-27, CHAO - 7, CHAO, poste); T.vline(-8, CHAO - 7, CHAO, poste); // banco
  T.stamp([
    "...555....", "..55555...", ".555444...", ".554444...", "..54444...", "...444....", "....44....",
    "...bbbbb..", "..bbbbbbb.", "..bbbbbbb.", "..bbbbbbb.", "..bbbbb4..", "..bbbbbb4.", "..bbbbbb..",
    "..99999999", "..99999999", "........99", "........99", "........99", "........99", "........99", "........555",
  ].map((r) => r.replace(/b/g, blusa[0])), -24, CHAO - 21);
  // pessoas andando
  gente.forEach((p, i) => {
    const x = Math.round(p.x + p.dir * p.v * f);
    const fr = Math.floor(f * p.v * 0.9 + i * 3);
    pessoaG(T, x, CHAO + 1, fr, p.dir, p);
  });
  return T.rows(vx, vy, W, H);
}

function textos(f) {
  const { vx, vy } = vista(f);
  return [
    { type: "texto", texto: "PROPRIEDADE", x: 67 - vx, y: MURO + 7 - vy, color: C.branco, alinhar: "centro" },
    { type: "texto", texto: "PRIVADA", x: 67 - vx, y: MURO + 14 - vy, color: C.branco, alinhar: "centro" },
  ];
}

rodar({ nome: "09_torre", pal, quadros: N, cena, textos, saida: "examples/cidade/cenas/09_torre" });

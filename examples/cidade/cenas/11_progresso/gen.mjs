// Cena 11 — a mesma rua da cena 10 vista de longe; por trás, dominando, a torre de vidro com muro,
// outdoor "VIVA O PROGRESSO / Residencial Horizonte" e placa "PROPRIEDADE PRIVADA". 49,6–52,5 s = 35 quadros.
import { W, H, pessoa, BLUSAS } from "../../lib/comum.mjs";
import { Paleta, Tela, rodar, passo, bayer, pessoaG } from "../_px912.mjs";
import { coresTorre, torre, muro } from "../_torre_vidro.mjs";
import { coresRua, rua, chao, barraca, carrinho } from "../_rua_feira.mjs";

const N = 35;
const pal = new Paleta();
const CT = coresTorre(pal);
const C = coresRua(pal);
const ceu = ["#7c8898", "#8f9aa8", "#a3acb7"].map((h, i) => pal.c(h, "ceu" + i));
const nuvem = pal.c("#c9cfd6", "nuvem"), nuvemSomb = pal.c("#6f7b8b", "nuvem-sombra");
const faixaQuente = [pal.c("#e9cfa8", "poente1"), pal.c("#f0dab8", "poente2")];
const outdoor = pal.c("#f6f4f0", "outdoor"), outdoorSomb = pal.c("#cfd0d2", "outdoor-sombra"), ferro = pal.c("#3a3e46", "ferro");
const vermelho = pal.c("#c8302c", "titulo-vermelho"), cinzaTxt = pal.c("#5a5e66", "texto-cinza");
const blusa = BLUSAS.map((h, i) => pal.c(h, "blusa" + i));

const MURO = 108, CHAO_MURO = 152, YB = 266, S = 0.8;
const CASAS11 = [
  { w: 44, andares: 3, cor: "bege", loja: "BAR", extra: 0 },
  { w: 44, andares: 3, cor: "azul", loja: "LIVROS", extra: 5 },
  { w: 44, andares: 3, cor: "laranja", loja: "PASTEL", extra: 10 },
  { w: 44, andares: 3, cor: "caramelo", loja: "PADARIA", extra: 3 },
  { w: 44, andares: 3, cor: "salmao", loja: "FRUTAS", extra: 8 },
  { w: 44, andares: 3, cor: "amarelo", loja: "MERCADO", extra: 1 },
];
const reflexos = [[-20, 6, 0.3, 0.9, 1.1], [22, 4, -0.2, 0.8, 0.8], [60, 6, 0.35, 0.8, 1.1], [92, 4, 0.0, 0.9, 0.7]];
const OUT = 10; // quadro em que o outdoor aparece
const longe = [
  { x: 10, dir: 1, v: 0.35, pele: "3", cabelo: "5", blusa: blusa[1], calca: "8" },
  { x: 120, dir: -1, v: 0.3, pele: "2", cabelo: "6", blusa: blusa[6], calca: "9" },
  { x: 150, dir: -1, v: 0.4, pele: "4", cabelo: "5", blusa: blusa[2], calca: "8" },
];
const gente = [
  { x: 64, dir: -1, v: 0.5, pele: "4", cabelo: "5", blusa: blusa[3] }, { x: 98, dir: 1, v: 0.55, pele: "1", cabelo: "6", blusa: blusa[4] },
  { x: 140, dir: -1, v: 0.45, pele: "3", cabelo: "5", blusa: blusa[7] }, { x: 176, dir: -1, v: 0.5, pele: "2", cabelo: "6", blusa: blusa[5] },
];

function cena(f) {
  const T = new Tela(W, H, 0, 0);
  for (let y = 0; y < 170; y++) for (let x = 0; x < W; x++) {
    const ty = Math.min(1, y / 150) * (ceu.length - 1), a = Math.floor(ty);
    T.set(x, y, ceu[Math.min(ceu.length - 1, a + (passo(ty - a, x, y, 0.35) ? 1 : 0))]);
  }
  const deriva = Math.floor(f / 6);
  for (const [nx, ny, nw, nh] of [[-10, 18, 60, 10], [140, 50, 60, 9], [100, 6, 50, 8]]) {
    const x = nx + deriva;
    T.ellipse(x + nw / 2, ny + nh * 0.75, nw / 2, nh * 0.3, nuvemSomb);
    for (const [bx, bh] of [[0.25, 0.55], [0.5, 0.85], [0.75, 0.6]]) T.ellipse(x + nw * bx, ny + nh * (1 - bh) + nh * 0.35, nw * 0.22, nh * bh * 0.55, nuvem);
    T.ellipse(x + nw / 2, ny + nh * 0.62, nw * 0.42, nh * 0.22, nuvem);
  }
  torre(T, CT, { cx: 98, yTopo: -220, yBase: MURO, wTopo: 34, wBase: 84, andar: 5, colunas: 14, reflexos, cobertura: false });
  muro(T, CT, { xa: -2, xb: 182, y0: MURO, y1: CHAO_MURO, portao: [48, 26], guarita: [78, 20, 30], placa: [101, MURO + 9, 77, 9], painel: 24 });
  T.set(85, CHAO_MURO - 22, "4"); T.set(86, CHAO_MURO - 22, "4"); T.set(85, CHAO_MURO - 23, "5"); T.set(86, CHAO_MURO - 23, "5"); // vigia na guarita
  // outdoor
  if (f >= OUT) {
    T.rect(24, 96, 2, MURO - 96, ferro); T.rect(70, 96, 2, MURO - 96, ferro);
    T.rect(1, 52, 94, 45, ferro);
    T.rect(2, 53, 92, 43, outdoor);
    T.rect(2, 53, 15, 43, CT.vidro[3]); // miniatura do prédio no canto esquerdo
    T.rect(5, 58, 9, 38, CT.vidro[2]);
    for (let y = 60; y < 96; y += 3) T.hline(6, 12, y, CT.vidro[5]);
    T.rect(91, 53, 3, 43, outdoorSomb); T.hline(2, 93, 95, outdoorSomb);
  }
  // pessoas pequenas ao pé do muro
  longe.forEach((p, i) => T.stamp(pessoa({ tam: "longe", frame: Math.floor(f * p.v + i), dir: p.dir, ...p }), Math.round(p.x + p.dir * p.v * f), CHAO_MURO - 7));
  // faixa quente atrás das casas
  for (let y = CHAO_MURO; y < 180; y++) for (let x = 0; x < W; x++) T.set(x, y, faixaQuente[passo((y - CHAO_MURO) / 10, x, y) ? 1 : 0]);
  const txt = rua(T, C, { x0: -10, yb: YB, s: S, casas: CASAS11, seed: 3 });
  chao(T, C, { xa: -2, xb: 182, yb: YB, s: S, yFim: H + 2 });
  barraca(T, C, 6, YB + 11, S);
  const cx = Math.round(34 + 0.4 * f);
  carrinho(T, C, cx, YB + 16, S);
  gente.forEach((p, i) => pessoaG(T, Math.round(p.x + p.dir * p.v * f), YB + 15 + (i % 2), Math.floor(f * p.v * 0.9 + i * 3), p.dir, { calca: i % 2 ? "8" : "9", tipo: ["curto", "coque", "longo", "bone", "curto", "longo", "coque"][i], ...p }));
  pessoaG(T, cx - 14, YB + 16, Math.floor(f * 0.36), 1, { pele: "2", cabelo: blusa[1], blusa: blusa[3], calca: "9", tipo: "bone" });
  return { rows: T.rows(), txt };
}

function textos(f) {
  const sh = [...cena(f).txt,
    { type: "texto", texto: "PROPRIEDADE PRIVADA", x: 140, y: MURO + 11, color: CT.branco, alinhar: "centro" }];
  if (f >= OUT + 1) sh.push(
    { type: "texto", texto: "VIVA O", x: 55, y: 58, color: cinzaTxt, alinhar: "centro" },
    { type: "texto", texto: "PROGRESSO", x: 55, y: 66, color: vermelho, alinhar: "centro", escala: 2 },
    { type: "texto", texto: "RESIDENCIAL", x: 55, y: 80, color: cinzaTxt, alinhar: "centro" },
    { type: "texto", texto: "HORIZONTE", x: 55, y: 87, color: cinzaTxt, alinhar: "centro" });
  return sh;
}

rodar({ nome: "11_progresso", pal, quadros: N, cena: (f) => cena(f).rows, textos, saida: "examples/cidade/cenas/11_progresso" });

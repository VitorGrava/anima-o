// Cena 10 — rua viva: sobrados coloridos, lojas, feira, gente. 46,8–49,6 s = 34 quadros. Pan lento para a direita.
import { W, H, BLUSAS } from "../../lib/comum.mjs";
import { Paleta, Tela, rodar, passo, pessoaG } from "../_px912.mjs";
import { coresRua, rua, chao, barraca, carrinho } from "../_rua_feira.mjs";

const N = 34;
const pal = new Paleta();
const C = coresRua(pal);
const ceu = ["#e2b48e", "#ebc29a", "#f2d0a8", "#f6dcb6"].map((h, i) => pal.c(h, "ceu" + i));
const sol = [pal.c("#f5dcb8", "brilho1"), pal.c("#f8e4c4", "brilho2")];
const blusa = BLUSAS.map((h, i) => pal.c(h, "blusa" + i));
const YB = 214;
export const CASAS10 = [
  { w: 44, andares: 3, cor: "bege", loja: "MERCADINHO", extra: 0 },
  { w: 42, andares: 3, cor: "azul", loja: "SAPATARIA", extra: 4 },
  { w: 46, andares: 3, cor: "laranja", loja: "LIVROS", extra: 10 },
  { w: 44, andares: 3, cor: "caramelo", loja: "PASTEL", extra: 2 },
  { w: 42, andares: 3, cor: "salmao", loja: "PADARIA", extra: 8 },
  { w: 42, andares: 3, cor: "amarelo", loja: "FRUTAS", extra: 0 },
];
const vista = (f) => ({ vx: Math.floor(f / 2), vy: 0 });

const gente = [
  { x: -4, dir: 1, v: 0.7, pele: "3", cabelo: "5", blusa: blusa[2], calca: "8", tipo: "curto" },
  { x: 12, dir: 1, v: 0.6, pele: "1", cabelo: "6", blusa: blusa[4], calca: "9", tipo: "longo" },
  { x: 58, dir: 1, v: 0.55, pele: "2", cabelo: "5", blusa: blusa[1], calca: "8", tipo: "coque" },
  { x: 92, dir: -1, v: 0.6, pele: "4", cabelo: "5", blusa: blusa[3], calca: "9", tipo: "curto" },
  { x: 130, dir: 1, v: 0.65, pele: "3", cabelo: blusa[0], blusa: blusa[6], calca: "8", tipo: "bone" },
  { x: 176, dir: -1, v: 0.7, pele: "2", cabelo: "7", blusa: blusa[7], calca: "8", tipo: "longo" },
  { x: 200, dir: -1, v: 0.55, pele: "4", cabelo: "5", blusa: blusa[5], calca: "9", tipo: "coque" },
  { x: 40, dir: -1, v: 0.5, pele: "1", cabelo: "7", blusa: blusa[0], calca: "8", tipo: "curto" },
  { x: 110, dir: 1, v: 0.45, pele: "4", cabelo: "5", blusa: blusa[4], calca: "9", tipo: "longo" },
  { x: 160, dir: 1, v: 0.6, pele: "2", cabelo: "6", blusa: blusa[2], calca: "8", tipo: "coque" },
];

function sentado(T, x, y, dir, cores) {
  // pessoa sentada de perfil (~20 px), x = esquerda, y = chão
  const rows = ["..hhh..", ".hhhhh.", ".hhsss.", ".hssss.", "..sss..", "...s...", "..bbbb.", ".bbbbbb", ".bbbbbs", ".bbbbb.", ".bbbbb.", ".cccccc", ".ccccccc", "......c", "......c", "......c", "......c", "......zz"];
  const m = { h: cores.cabelo, s: cores.pele, b: cores.blusa, c: cores.calca, z: "5" };
  rows.forEach((r, j) => [...r].forEach((ch, i) => { if (ch !== ".") T.set(dir > 0 ? x + i : x + 7 - i, y - rows.length + j, m[ch]); }));
}

function cena(f) {
  const { vx, vy } = vista(f);
  const T = new Tela(W, H, vx, vy);
  // céu quente com brilho de sol (espaço de tela, fixo)
  for (let y = 0; y < 150; y++) for (let x = 0; x < W; x++) {
    const ty = Math.min(1, y / 120) * (ceu.length - 1), a = Math.floor(ty);
    let k = ceu[Math.min(ceu.length - 1, a + (passo(ty - a, x, y) ? 1 : 0))];
    const d = Math.hypot((x - 96) / 1.1, y - 112);
    if (d < 70) k = sol[0];
    if (d < 70 && d > 64 && !passo((70 - d) / 6, x, y)) k = ceu[Math.min(3, a + 1)];
    if (d < 46) k = sol[1];
    if (d < 46 && d > 40 && !passo((46 - d) / 6, x, y)) k = sol[0];
    T.set(x + vx, y + vy, k);
  }
  const txt = rua(T, C, { x0: -14, yb: YB, casas: CASAS10, seed: 3 });
  chao(T, C, { xa: -20, xb: 260, yb: YB, yFim: H + 2 });
  T.rect(-20, 296, 280, 2, C.faixaLaranja);
  barraca(T, C, 18, YB + 16);
  // vendedor atrás da barraca
  pessoaG(T, 26, YB + 14, 0, 1, { pele: "3", cabelo: "5", blusa: blusa[0], calca: "8", tipo: "bone" });
  barraca(T, C, 18, YB + 16);
  // mesa do pastel com duas pessoas sentadas
  T.rect(138, YB + 6, 12, 2, C.mesa); T.vline(143, YB + 8, YB + 15, C.mesa);
  sentado(T, 130, YB + 16, 1, { pele: "1", cabelo: "6", blusa: blusa[1], calca: "8" });
  sentado(T, 151, YB + 16, -1, { pele: "4", cabelo: "5", blusa: blusa[0], calca: "9" });
  // pessoas andando
  gente.forEach((p, i) => {
    const x = Math.round(p.x + p.dir * p.v * f);
    pessoaG(T, x, YB + 18 + (i % 2), Math.floor(f * p.v * 0.9 + i * 3), p.dir, p);
  });
  // carrinho empurrado
  const cx = Math.round(70 + 0.5 * f);
  carrinho(T, C, cx, YB + 21);
  pessoaG(T, cx - 14, YB + 20, Math.floor(f * 0.45), 1, { pele: "2", cabelo: "5", blusa: blusa[3], calca: "9", tipo: "bone" });
  return { rows: T.rows(vx, vy, W, H), txt };
}

rodar({
  nome: "10_feira", pal, quadros: N,
  cena: (f) => cena(f).rows,
  textos: (f) => { const { vx } = vista(f); return cena(f).txt.map((t) => ({ ...t, x: t.x - vx })); },
  saida: "examples/cidade/cenas/10_feira",
});

// Módulo compartilhado das cenas 03–07 (interior do shopping e vigilância).
// Paleta única (shopping frio cinza-azulado; sala de monitores e catraca azul-petróleo; acentos vermelho/amarelo),
// pessoinha GRANDE (13x30, perfil, ciclo de 4 passos) e ajudantes para montar comandos.
import { PESSOA_PALETA, BLUSAS, pessoa } from "../lib/comum.mjs";

export const PALETA = [
  ...PESSOA_PALETA,
  ...BLUSAS.map((hex, i) => ({ key: "ABCDEFGH"[i], hex, name: `blusa${i}` })),
  // neutros frios do shopping
  { key: "w", hex: "#f3f5f7", name: "branco" },
  { key: "c", hex: "#dde2e7", name: "cinza-claro" },
  { key: "d", hex: "#c7ced6", name: "cinza" },
  { key: "e", hex: "#b2bbc5", name: "cinza-medio" },
  { key: "f", hex: "#8e99a6", name: "cinza-escuro" },
  { key: "g", hex: "#626e7c", name: "ardosia" },
  { key: "h", hex: "#3b4652", name: "moldura" },
  { key: "i", hex: "#252d36", name: "quase-preto" },
  { key: "j", hex: "#bfc7cf", name: "piso" },
  { key: "k", hex: "#d3d9df", name: "piso-reflexo" },
  // lojas
  { key: "t", hex: "#2f9a8f", name: "teal" },
  { key: "u", hex: "#3a4cb0", name: "tela-azul" },
  { key: "v", hex: "#7a8ff0", name: "tela-luz" },
  { key: "m", hex: "#8a5a32", name: "marrom" },
  { key: "n", hex: "#b98a5a", name: "marrom-claro" },
  { key: "o", hex: "#f1dfc4", name: "creme" },
  { key: "p", hex: "#e2c8a2", name: "creme-sombra" },
  { key: "q", hex: "#e58a3a", name: "laranja" },
  { key: "r", hex: "#2a2f3b", name: "joia-fundo" },
  { key: "s", hex: "#40475a", name: "joia-meio" },
  { key: "x", hex: "#7e8597", name: "joia-luz" },
  { key: "y", hex: "#f2c84b", name: "amarelo" },
  { key: "R", hex: "#d8424a", name: "vermelho" },
  { key: "S", hex: "#9c2833", name: "vermelho-escuro" },
  { key: "z", hex: "#2f9a5a", name: "verde" },
  { key: "V", hex: "#5fe08a", name: "verde-luz" },
  { key: "W", hex: "#b47c4c", name: "madeira" },
  { key: "X", hex: "#8c5a36", name: "madeira-escura" },
  { key: "Z", hex: "#cd9866", name: "madeira-luz" },
  { key: "l", hex: "#8193ab", name: "sofa" },
  { key: "L", hex: "#62738c", name: "sofa-sombra" },
  { key: "P", hex: "#4a8a57", name: "folha" },
  { key: "Q", hex: "#2c5e3a", name: "folha-escura" },
  { key: "K", hex: "#f0d0d4", name: "rosa-claro" },
  // sala escura / catraca (azul-petróleo)
  { key: "0", hex: "#0c171c", name: "noite" },
  { key: "T", hex: "#142830", name: "petroleo" },
  { key: "U", hex: "#1f3a44", name: "petroleo-claro" },
  { key: "M", hex: "#a6c6cc", name: "monitor" },
  { key: "N", hex: "#7fa4ad", name: "monitor-sombra" },
  { key: "O", hex: "#1c2740", name: "uniforme" },
  { key: "I", hex: "#2e3d5e", name: "uniforme-luz" },
  { key: "J", hex: "#344a66", name: "azul-noite" },
  { key: "Y", hex: "#4a6280", name: "azul-noite-claro" },
];

const COM_PREVIEW = new Set(["draw_shapes", "draw_rows", "transform", "copy_layer_content", "draw_frames"]);
export const cmd = (name, input) => ({ name, input: COM_PREVIEW.has(name) ? { preview: false, ...input } : input });
/** draw_shapes; listas com mais de 200 formas viram vários comandos (use c.flat() antes de gerar) */
export const shapes = (layer, frames, list) => {
  if (list.length <= 200) return cmd("draw_shapes", { layer, frames, shapes: list });
  const out = [];
  for (let i = 0; i < list.length; i += 200) out.push(cmd("draw_shapes", { layer, frames, shapes: list.slice(i, i + 200) }));
  return out;
};
/** add_frames aceita no máximo 64 por vez */
export const addFrames = (n, copy_from) => { const o = []; for (let k = n; k > 0; k -= 64) o.push(cmd("add_frames", { count: Math.min(64, k), copy_from })); return o; };
export const rows = (layer, frames, x, y, r) => cmd("draw_rows", { layer, frames, x, y, rows: r });
export const rect = (x, y, w, h, color) => ({ type: "rect", x, y, w, h, color, filled: true });
export const line = (x1, y1, x2, y2, color) => ({ type: "line", x1, y1, x2, y2, color });
export const texto = (t, x, y, color, o = {}) => ({ type: "texto", texto: t, x, y, color, ...o });
export const px = (points, color) => ({ type: "pixels", points, color });

/** cores variadas de pessoa (determinístico por índice) */
export function cores(i) {
  const peles = ["1", "2", "3", "4", "2", "3"], cabelos = ["5", "6", "5", "7", "5", "6"], calcas = ["8", "9", "8", "i", "9"];
  return { pele: peles[i % 6], cabelo: cabelos[(i * 5 + 1) % 6], blusa: "ABCDEFGH"[(i * 3 + 2) % 8], calca: calcas[(i * 7) % 5] };
}

function grid(w, h) { return Array.from({ length: h }, () => Array(w).fill(" ")); }
function seg(g, x1, y1, x2, y2, c, larg = 1) {
  const n = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), 1);
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x1 + ((x2 - x1) * i) / n), y = Math.round(y1 + ((y2 - y1) * i) / n);
    for (let k = 0; k < larg; k++) if (g[y] && x + k >= 0 && x + k < g[0].length) g[y][x + k] = c;
  }
}

/**
 * Pessoa GRANDE de perfil (13 x 31): cabeça 6, tronco 10, pernas 14. frame 0..3, dir 1 = direita.
 * sacola: cor da sacola na mão (opcional). Devolve linhas para draw_rows (" " preserva).
 * Pés (sola) na última linha (y + 30).
 */
export function pessoaGrande({ frame = 0, dir = 1, pele = "2", cabelo = "5", blusa = "A", calca = "8", sapato = "i", sacola = null, longo = false, parado = false } = {}) {
  const f = parado ? 1 : ((frame % 4) + 4) % 4;
  const W = 13, Hh = 31, g = grid(W, Hh);
  const bob = !parado && f % 2 ? 1 : 0; // 1 = corpo 1 px mais alto no passo (pernas esticadas)
  const T = 0; // topo
  // pernas (desenhadas primeiro: a de trás mais escura não; usamos a mesma cor e um vão)
  const hipY = 16, chao = 30;
  if (parado) {
    seg(g, 5, hipY, 5, chao - 1, calca, 2); seg(g, 7, hipY, 7, chao - 1, calca, 1);
    g[chao][5] = sapato; g[chao][6] = sapato; g[chao][7] = sapato;
  } else if (f === 0 || f === 2) {
    // contato: pernas abertas
    seg(g, 6, hipY, 9, 23, calca, 2); seg(g, 9, 23, 10, chao - 1, calca, 2); // frente
    seg(g, 5, hipY, 4, 23, calca, 2); seg(g, 4, 23, 2, chao - 1, calca, 2); // trás
    g[chao][10] = sapato; g[chao][11] = sapato; g[chao][12] = sapato; g[chao - 1][12] = " ";
    g[chao][2] = sapato; g[chao][3] = sapato; g[chao][1] = sapato;
  } else {
    // passagem: uma perna reta, a outra dobrada (pé levantado)
    seg(g, 6, hipY - 1, 6, chao - 1, calca, 2);
    seg(g, 5, hipY - 1, 7, 22, calca, 2); seg(g, 7, 22, 4, 27, calca, 2);
    g[chao][6] = sapato; g[chao][7] = sapato; g[chao][8] = sapato;
    g[27][4] = sapato; g[28][4] = sapato; g[28][5] = sapato;
  }
  // tronco
  const ty = 6 - bob;
  for (let y = ty; y < ty + 10; y++) for (let x = 4; x <= 8; x++) g[y][x] = blusa;
  g[ty][4] = " "; g[ty][8] = " ";
  if (longo) for (let y = ty + 10; y < ty + 13; y++) for (let x = 4; x <= 8; x++) g[y][x] = blusa; // saia/vestido
  else for (let x = 4; x <= 8; x++) g[ty + 9][x] = calca;
  // cabeça
  const hy = T - bob;
  const cab = ["....hhhh.....", "...hhhhhh....", "...hhhssss...", "...hhsssss...", "....hssss....", ".....sss....."];
  cab.forEach((r, j) => { if (hy + j >= 0) [...r].forEach((ch, x) => { if (ch !== ".") g[hy + j][x] = ch === "h" ? cabelo : pele; }); });
  g[hy + 3][9] = pele; // nariz
  // braço (o da frente)
  const ombro = [6, ty + 1];
  const mao = parado ? [6, ty + 9] : f === 0 ? [9, ty + 8] : f === 2 ? [3, ty + 8] : [6, ty + 9];
  const meio = [Math.round((ombro[0] + mao[0]) / 2), Math.round((ombro[1] + mao[1]) / 2)];
  seg(g, ombro[0], ombro[1], meio[0], meio[1], blusa, 2);
  seg(g, meio[0], meio[1], mao[0], mao[1], pele, 1);
  g[mao[1]][mao[0]] = pele;
  // sombra do braço sobre o tronco: 1 px escuro na borda (lê como braço separado)
  if (sacola) {
    const [mx, my] = mao;
    for (let y = my + 1; y <= my + 5; y++) for (let x = mx - 1; x <= mx + 2; x++) if (g[y] && x >= 0 && x < W) g[y][x] = sacola;
    if (g[my + 1]) { g[my + 1][mx - 1] = " "; g[my + 1][mx + 2] = " "; g[my + 1][mx] = "i"; }
  }
  let out = g.map((r) => r.join(""));
  if (dir < 0) out = out.map((r) => [...r].reverse().join(""));
  return out;
}

/** pessoa sentada de perfil (13x22), olhando o celular. dir 1 = virada para a direita */
export function sentada({ dir = 1, pele = "2", cabelo = "5", blusa = "A", calca = "8", sapato = "i", cabecaBaixa = 0, canela = 6, tela = "v", tronco = 0 } = {}) {
  const r = [
    "....hhhh.....",
    "...hhhhhh....",
    "...hhhssss...",
    "...hhsssss...",
    "....hssss....",
    ".....sss.....",
    "....bbbbb....",
    "...bbbbbb....",
    "...bbbbbbss..",
    "...bbbbbsvs..",
    "...bbbbbss...",
    "...bbbbb.....",
    ...Array(tronco).fill("...bbbbb....."),
    "...bbbbb.....",
    "...cccccccc..",
    "...cccccccc..",
    ...Array(canela).fill(".........cc.."),
    ".........zzz.",
  ];
  let out = r.map((l) => [...l].map((ch) => ({ h: cabelo, s: pele, b: blusa, c: calca, z: sapato, v: tela })[ch] ?? (ch === "." ? " " : ch)).join(""));
  if (cabecaBaixa) out = ["             ", ...out.slice(0, 6), ...out.slice(7)];
  if (dir < 0) out = out.map((l) => [...l].reverse().join(""));
  return out;
}

/** passo do ciclo de caminhada (troca a cada `cad` quadros) */
export const passo = (q, fase = 0, cad = 3) => Math.floor(q / cad + fase) % 4;

export { pessoa };

/**
 * Figura humana procedural de perfil em QUALQUER altura A (px), desenhada em resolução nativa
 * (discos e segmentos grossos), para planos mais fechados (ex.: catraca). Olha para a direita (dir -1 espelha).
 * pose: "andar" (frame 0..3), "parado", "barrar" (braço da frente estendido). Pés na última linha.
 * cores: pele, cabelo, blusa, calca, sapato, tras (tom dos membros de trás), sacola, bone (cor do boné).
 */
export function figura({ A = 64, pose = "andar", frame = 0, dir = 1, pele = "2", cabelo = "5", blusa = "R", calca = "8", sapato = "i", tras = null, trasPerna = null, sacola = null, bone = null, cabeloLongo = false, coque = false } = {}) {
  const Wd = Math.ceil(A * 0.75), Hd = A + 1, g = grid(Wd, Hd);
  const cx = Math.round(Wd / 2);
  const rad = (d) => (d * Math.PI) / 180;
  const put = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (y >= 0 && y < Hd && x >= 0 && x < Wd) g[y][x] = c; };
  const disco = (x, y, r, c) => { for (let yy = Math.floor(y - r); yy <= Math.ceil(y + r); yy++) for (let xx = Math.floor(x - r); xx <= Math.ceil(x + r); xx++) if ((xx - x) ** 2 + (yy - y) ** 2 <= r * r + 0.25) put(xx, yy, c); };
  const osso = (x1, y1, x2, y2, r, c) => { const n = Math.ceil(Math.hypot(x2 - x1, y2 - y1)) + 1; for (let i = 0; i <= n; i++) disco(x1 + ((x2 - x1) * i) / n, y1 + ((y2 - y1) * i) / n, r, c); };
  // poses: [quadrilF, joelhoF, quadrilT, joelhoT, ombroF, cotoveloF, ombroT, cotoveloT, sobe]
  const P = {
    contato: [26, 4, -22, 14, -24, 10, 24, 18, 0],
    passagem: [2, 6, -6, 62, 4, 12, -6, 14, -1],
    parado: [3, 0, -3, 0, 4, 8, -4, 8, 0],
    barrar: [4, 0, -4, 0, 86, 4, -4, 8, 0],
    barrar_meio: [4, 0, -4, 0, 44, 30, -4, 8, 0],
  };
  let p, troca = false;
  if (pose === "andar") { const f = ((frame % 4) + 4) % 4; p = f % 2 === 0 ? P.contato : P.passagem; troca = f >= 2; }
  else p = P[pose] ?? P.parado;
  let [hF, kF, hT, kT, sF, eF, sT, eT, sobe] = p;
  if (troca) [hF, kF, hT, kT, sF, eF, sT, eT] = [hT, kT, hF, kF, sT, eT, sF, eF];
  const chao = A, coxa = A * 0.25, canela = A * 0.24, rPerna = Math.max(1.2, A * 0.042);
  // altura do quadril: perna mais "esticada" toca o chão
  const alturaPerna = (h, k) => coxa * Math.cos(rad(h)) + canela * Math.cos(rad(h - k));
  const hipY = chao - 1 - Math.max(alturaPerna(hF, kF), alturaPerna(hT, kT)) - rPerna * 0.3 + sobe;
  const hipX = cx - A * 0.02;
  const perna = (h, k, cor, cSap) => {
    const kx = hipX + coxa * Math.sin(rad(h)), ky = hipY + coxa * Math.cos(rad(h));
    const ax = kx + canela * Math.sin(rad(h - k)), ay = ky + canela * Math.cos(rad(h - k));
    osso(hipX, hipY, kx, ky, rPerna, cor); osso(kx, ky, ax, ay, rPerna * 0.9, cor);
    osso(ax - rPerna * 0.3, ay, ax + A * 0.07, ay + 0.4, Math.max(0.8, rPerna * 0.75), cSap);
  };
  const ombroY = hipY - A * 0.31, ombroX = hipX + A * 0.01;
  const braco = A * 0.17, ante = A * 0.16, rBr = Math.max(1, A * 0.034);
  const membroBraco = (s, e, cor, mao) => {
    const ex = ombroX + braco * Math.sin(rad(s)), ey = ombroY + braco * Math.cos(rad(s));
    const hx = ex + ante * Math.sin(rad(s + e)), hy = ey + ante * Math.cos(rad(s + e));
    osso(ombroX, ombroY + 1, ex, ey, rBr * 1.15, cor); osso(ex, ey, hx, hy, rBr, mao === "manga" ? cor : pele);
    disco(hx, hy, rBr * 1.15, pele);
    return [hx, hy];
  };
  const corT = trasPerna ?? calca;
  // membros de trás
  membroBraco(sT, eT, tras ?? blusa, "pele");
  perna(hT, kT, corT, sapato);
  // tronco
  const tw = A * 0.1;
  osso(ombroX, ombroY + tw * 0.4, hipX, hipY - tw * 0.3, tw, blusa);
  osso(hipX, hipY - tw * 0.9, hipX, hipY - 1, tw * 0.8, calca);
  perna(hF, kF, calca, sapato);
  // pescoço e cabeça
  const rC = A * 0.072, hcx = ombroX + A * 0.02, hcy = ombroY - A * 0.035 - rC;
  osso(ombroX, ombroY, hcx, hcy + rC * 0.6, A * 0.028, pele);
  disco(hcx, hcy, rC, pele);
  disco(hcx + rC * 0.95, hcy + rC * 0.15, Math.max(0.6, A * 0.012), pele); // nariz
  if (bone) {
    for (let yy = Math.floor(hcy - rC - 1); yy <= hcy - rC * 0.15; yy++) for (let xx = Math.floor(hcx - rC - 1); xx <= hcx + rC + 1; xx++) if ((xx - hcx) ** 2 + (yy - hcy) ** 2 <= (rC + 0.8) ** 2) put(xx, yy, bone);
    osso(hcx + rC * 0.4, hcy - rC * 0.2, hcx + rC * 1.6, hcy - rC * 0.15, Math.max(0.5, A * 0.012), bone);
  } else {
    // cabelo: metade de cima e nuca
    for (let yy = Math.floor(hcy - rC - 1); yy <= hcy + rC; yy++) for (let xx = Math.floor(hcx - rC - 1); xx <= hcx + rC + 1; xx++) {
      const d2 = (xx - hcx) ** 2 + (yy - hcy) ** 2;
      if (d2 > (rC + 0.9) ** 2) continue;
      if (yy < hcy - rC * 0.35 || xx < hcx - rC * 0.25 + (yy - hcy) * 0.1) put(xx, yy, cabelo);
    }
    if (cabeloLongo) osso(hcx - rC * 0.7, hcy, hcx - rC * 0.8, hcy + rC * 2.2, rC * 0.5, cabelo);
    if (coque) disco(hcx - rC * 0.9, hcy - rC * 0.6, rC * 0.5, cabelo);
  }
  put(hcx + rC * 0.45, hcy - rC * 0.05, "i"); // olho
  // braço da frente
  const [mx, my] = membroBraco(sF, eF, blusa, "pele");
  if (sacola) {
    const bw = Math.round(A * 0.13), bh = Math.round(A * 0.16);
    osso(mx, my, mx, my + A * 0.04, 0.5, "i");
    for (let yy = Math.round(my + A * 0.04); yy < my + A * 0.04 + bh; yy++) for (let xx = Math.round(mx - bw / 2); xx < mx + bw / 2; xx++) put(xx, yy, sacola);
  }
  let out = g.map((r) => r.join(""));
  if (dir < 0) out = out.map((r) => [...r].reverse().join(""));
  return out;
}

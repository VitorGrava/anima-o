// Mago de RPG 48x48, idle de 8 frames em loop.
// Referências estudadas: "Old Wizard With A Staff" (mirquiso, itch.io), "Wizard sprite sheet" (Movicx, OpenGameArt),
// "Animated Wizard" (Calciumtrice, OpenGameArt).
// Camadas (baixo→cima): sombra, capa, corpo, cajado, mao, cristal. Capa atrasa 1 frame, cristal 2 (follow through).
import { writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
const W = 48, H = 48, N = 8;
const pal = [
  ["m", "#353570", "manto"], ["d", "#1c1a40", "manto-sombra"], ["l", "#6064be", "manto-luz"], ["t", "#8a8cd0", "manto-barra"],
  ["c", "#5c2a40", "capa"], ["C", "#3a1a2c", "capa-sombra"], ["p", "#7c3c52", "capa-luz"],
  ["w", "#ece8e0", "barba-luz"], ["g", "#b4b0b4", "barba"], ["G", "#7c7888", "barba-sombra"],
  ["s", "#e8b090", "pele"], ["k", "#b87464", "pele-sombra"], ["e", "#1c1630", "olho"],
  ["S", "#b07a4a", "cajado-luz"], ["T", "#7a4a2e", "cajado"], ["U", "#4a2a1e", "cajado-sombra"],
  ["b", "#4a3430", "bota"], ["B", "#76503e", "bota-luz"], ["r", "#4a3040", "cinto"],
  ["z", "#ffffff", "cristal-brilho"], ["x", "#8af0f8", "cristal-luz"], ["X", "#30b4d0", "cristal"], ["Y", "#186080", "cristal-sombra"],
  ["h", "#c8fcff", "aura"], ["o", "#6a5c72", "sombra-chao"], ["O", "#54465e", "sombra-chao-centro"],
];
const grid = () => Array.from({ length: H }, () => Array(W).fill("."));
const span = (g, y, x0, x1, c) => { for (let x = x0; x <= x1; x++) if (g[y] && x >= 0 && x < W) g[y][x] = c; };
const px = (g, x, y, c) => { if (g[y] && x >= 0 && x < W) g[y][x] = c; };
const get = (g, x, y) => (g[y] && g[y][x]) || ".";
const chk = (rows, n) => rows.forEach((r, i) => { if ([...r].length !== W) throw new Error(`${n} linha ${i}: ${[...r].length} colunas`); });
const OX = 2; // desloca o personagem para centralizar a massa

// ---------- CORPO (manto, chapéu, rosto, barba, botas) ----------
function corpoBase() {
  const g = grid();
  // chapéu: ponta dobrada para trás (esquerda), aba larga inclinada
  const hat = [[2, 14, 16], [3, 15, 19], [4, 17, 21], [5, 18, 22], [6, 18, 23], [7, 18, 24], [8, 17, 25], [9, 17, 26], [10, 16, 27], [11, 12, 31], [12, 13, 32]];
  for (const [y, a, b] of hat) span(g, y, a, b, "m");
  for (const [y, a, b] of hat) { if (y < 11) { px(g, a, y, "l"); if (b - a > 3) px(g, b, y, "d"); if (b - a > 5) px(g, b - 1, y, "d"); } }
  span(g, 10, 16, 27, "d"); span(g, 10, 17, 19, "p"); span(g, 10, 20, 27, "c"); px(g, 27, 10, "C"); // faixa do chapéu (vinho da capa)
  span(g, 11, 12, 20, "l"); span(g, 12, 13, 32, "d"); span(g, 12, 14, 18, "m"); // aba: luz em cima-esquerda, sombra embaixo
  px(g, 15, 3, "l"); px(g, 16, 4, "l");
  // cabeça (3/4 virada para a direita): cabelo atrás, rosto, nariz
  for (let y = 13; y <= 16; y++) span(g, y, 17, 20, "g");
  px(g, 17, 13, "G"); px(g, 17, 16, "G");
  span(g, 13, 21, 27, "k"); // sombra da aba na testa
  span(g, 14, 21, 27, "s"); span(g, 15, 21, 28, "s");
  px(g, 21, 14, "k"); px(g, 21, 15, "k");
  span(g, 13, 23, 26, "G"); span(g, 13, 24, 26, "w"); // sobrancelha espessa
  px(g, 25, 14, "e"); px(g, 26, 14, "s");
  px(g, 28, 15, "s"); px(g, 28, 16, "k"); // nariz
  // manto (silhueta) — ombros, tronco, saia que abre até a barra
  const robe = { 17: [16, 29], 18: [14, 31], 19: [13, 31], 20: [13, 31], 21: [13, 32], 22: [13, 33], 23: [14, 34], 24: [14, 35], 25: [15, 36], 26: [15, 36], 27: [15, 36], 28: [15, 35],
    29: [15, 31], 30: [15, 31], 31: [15, 31], 32: [14, 31], 33: [14, 32], 34: [14, 32], 35: [14, 32], 36: [14, 32], 37: [14, 32], 38: [14, 33], 39: [13, 33], 40: [13, 33], 41: [13, 34], 42: [13, 34] };
  for (const [y, [a, b]] of Object.entries(robe)) span(g, +y, a, b, "m");
  // sombreamento do manto: luz cima-esquerda
  for (const [y, [a, b]] of Object.entries(robe)) {
    const Y = +y;
    if (Y <= 31) px(g, a, Y, "l");
    if (Y >= 29) { span(g, Y, Math.max(a, b - 2 - (Y > 36 ? 1 : 0)), b, "d"); }
    if (Y === 17 || Y === 18) span(g, Y, a, Math.min(b, 20), "l");
  }
  // braço da frente: manga larga, linha interna escura separando do tronco
  for (let y = 21; y <= 28; y++) px(g, 27 + (y > 24 ? 1 : 0), y, "d");
  for (let y = 24; y <= 27; y++) px(g, 36, y, "d");
  span(g, 28, 29, 35, "d"); span(g, 19, 29, 31, "l");
  for (let y = 20; y <= 23; y++) px(g, 31 + (y - 20), y, "l");
  // braço de trás (segura o cajado): manga que desce em sino
  span(g, 19, 12, 13, "m"); span(g, 20, 11, 13, "m"); span(g, 21, 11, 14, "m"); span(g, 22, 11, 14, "m"); span(g, 23, 12, 14, "d"); span(g, 24, 12, 14, "d"); span(g, 25, 13, 14, "d");
  px(g, 11, 20, "l"); px(g, 11, 21, "l"); px(g, 12, 19, "l");
  for (let y = 21; y <= 26; y++) px(g, 15, y, "d");
  // cinto de corda
  span(g, 30, 15, 31, "r"); px(g, 15, 30, "C"); px(g, 23, 31, "r"); px(g, 23, 32, "r"); px(g, 22, 33, "r");
  // abertura da frente (barra clara) e vão das pernas
  for (let y = 27; y <= 42; y++) if (y !== 30) px(g, y < 36 ? 25 : 26, y, "t");
  for (let y = 33; y <= 42; y++) px(g, y < 36 ? 24 : 25, y, "d");
  // dobras da saia
  for (let y = 34; y <= 42; y++) { px(g, 18 - (y > 39 ? 1 : 0), y, "d"); px(g, 19 - (y > 39 ? 1 : 0), y, "l"); }
  for (let y = 37; y <= 42; y++) px(g, 30, y, "d");
  span(g, 42, 13, 34, "d"); span(g, 42, 14, 17, "m");
  for (const y of [41, 42]) span(g, y, 24, 25, "."); px(g, 23, 41, "d"); px(g, 26, 41, "d"); // vão entre as pernas
  // barba longa em cunha sobre o peito
  const beard = { 16: [20, 27], 17: [19, 28], 18: [19, 28], 19: [19, 28], 20: [20, 27], 21: [20, 27], 22: [21, 26], 23: [21, 26], 24: [22, 25], 25: [22, 25], 26: [22, 24], 27: [23, 24], 28: [23, 23] };
  for (const [y, [a, b]] of Object.entries(beard)) for (let x = a; x <= b; x++) {
    const v = (+y - 16) + (x - 20) * 0.6;
    px(g, x, +y, v < 2.5 ? "w" : v < 7.5 ? "g" : "G");
  }
  span(g, 16, 22, 28, "w"); px(g, 28, 17, "g"); // bigode
  px(g, 22, 20, "G"); px(g, 22, 21, "G"); px(g, 24, 22, "G"); px(g, 21, 18, "G"); // mechas
  // botas
  span(g, 43, 16, 21, "b"); span(g, 44, 15, 21, "b"); span(g, 43, 16, 18, "B");
  span(g, 43, 27, 33, "b"); span(g, 44, 27, 35, "b"); span(g, 43, 28, 31, "B"); px(g, 34, 43, "B");
  return g;
}

// ---------- CAPA (atrás do corpo, abre para a esquerda/trás) ----------
function capaBase(sway) {
  const g = grid();
  // gola alta atrás da cabeça
  span(g, 12, 13, 16, "c"); span(g, 13, 12, 16, "c"); span(g, 14, 12, 16, "c"); span(g, 15, 12, 16, "c"); span(g, 16, 12, 17, "c"); px(g, 12, 15, "p"); px(g, 12, 16, "p");
  const L = (y) => (y < 19 ? 13 : y < 22 ? 11 : y < 27 ? 10 : y < 33 ? 9 : y < 38 ? 8 : 8);
  for (let y = 17; y <= 43; y++) {
    const s = y >= 34 ? sway * Math.min(2, Math.ceil((y - 33) / 5)) : 0;
    const a = L(y) + s, b = y < 29 ? 30 : 33;
    span(g, y, a, b, "c");
    px(g, a, y, y < 31 ? "p" : "C");
    if (y > 24) px(g, a + 3, y, "C");
    if (y > 33) px(g, a + 1, y, "C");
    if (y > 38) span(g, y, a + 4, a + 6, "C");
  }
  // barra irregular
  const hs = sway;
  span(g, 43, 8 + hs, 14, "C"); px(g, 8 + hs, 43, "."); span(g, 44, 9 + hs, 13, "C");
  return g;
}

// ---------- CAJADO (apoiado no chão) e MÃO ----------
function cajado() {
  const g = grid();
  for (let y = 10; y <= 44; y++) { px(g, 10, y, "S"); px(g, 11, y, "T"); }
  for (const y of [18, 29, 37]) px(g, 11, y, "U"); // nós da madeira
  for (const y of [19, 30, 38]) px(g, 10, y, "T");
  // cabeça em forquilha que abraça o cristal
  span(g, 9, 8, 14, "T"); px(g, 8, 9, "S"); px(g, 13, 9, "U");
  span(g, 8, 7, 14, "T"); px(g, 7, 8, "S"); px(g, 7, 7, "S"); span(g, 8, 12, 14, "U"); px(g, 14, 7, "U");
  span(g, 44, 10, 11, "U");
  return g;
}
function mao() {
  const g = grid();
  // mão da frente saindo do punho, gesticulando
  span(g, 25, 37, 38, "s"); span(g, 26, 37, 39, "s"); span(g, 27, 37, 38, "k"); px(g, 39, 25, "s"); px(g, 39, 26, "k");
  // mão de trás fechada no cajado
  span(g, 20, 8, 11, "s"); span(g, 21, 7, 12, "s"); span(g, 22, 7, 11, "k"); span(g, 23, 8, 10, "k");
  px(g, 7, 21, "k"); px(g, 11, 22, "s");
  return g;
}
// ---------- CRISTAL com brilho pulsante ----------
function cristal(dy, lv) {
  const g = grid();
  const cx = 10, cy = 5 + dy; // linha cy = a mais larga
  const rows = ["..xz..", ".xxxX.", "xxXXXY", "xXXXYY", ".XXYY.", "..YY.."];
  rows.forEach((r, j) => [...r].forEach((c, i) => { if (c !== ".") px(g, cx - 2 + i, cy - 2 + j, c); }));
  if (lv >= 1) { px(g, cx, cy, "z"); px(g, cx - 1, cy + 1, "x"); px(g, cx + 1, cy, "x"); }
  if (lv >= 2) { px(g, cx + 1, cy - 3, "h"); px(g, cx - 3, cy, "h"); px(g, cx + 4, cy + 1, "h"); px(g, cx + 1, cy - 1, "z"); }
  if (lv >= 3) { px(g, cx + 1, cy - 4, "h"); px(g, cx - 4, cy, "h"); px(g, cx + 5, cy + 1, "h"); px(g, cx - 1, cy - 3, "h"); px(g, cx + 4, cy - 2, "h"); px(g, cx + 1, cy + 1, "x"); }
  return g;
}
// ---------- animação ----------
const breath = [0, 0, 1, 1, 1, 1, 0, 0];              // respiração de 1 px (tronco, cabeça, chapéu)
const lag = (k, t) => breath[(t - k + N) % N];        // atraso de k frames
const glow = [0, 1, 2, 3, 3, 2, 1, 0];                 // pulso do cristal
const capeSway = [0, 0, 0, -1, -1, -1, 0, 0];          // barra da capa balança, atrasada
const shiftRows = (g, fn) => { const o = grid(); for (let y = 0; y < H; y++) { const sy = y - fn(y); if (sy >= 0 && sy < H) o[y] = [...g[sy]]; } return o; };
const offX = (g, d) => g.map((r) => { const o = Array(W).fill("."); r.forEach((c, x) => { if (c !== "." && x + d >= 0 && x + d < W) o[x + d] = c; }); return o; });
const sombra = () => { const g = grid(); span(g, 46, 8, 38, "o"); span(g, 45, 10, 36, "o"); span(g, 46, 13, 33, "O"); return g; };

const CB = corpoBase(), CJ = offX(cajado(), -1); // cajado 1 px afastado do chapéu
const layers = ["sombra", "capa", "corpo", "cajado", "mao", "cristal"];
function frame(t) {
  const b = breath[t], tip = lag(1, t);
  const corpo = shiftRows(CB, (y) => (y <= 6 ? tip : y <= 30 ? b : 0));
  const capa = shiftRows(capaBase(capeSway[t]), (y) => (y <= 30 ? lag(1, t) : 0));
  const m = shiftRows(mao(), () => b);
  const cr = offX(cristal(lag(2, t), glow[t]), -1);
  return { sombra: sombra(), capa, corpo, cajado: CJ, mao: m, cristal: cr };
}
const contorno = { capa: "seletivo", corpo: "seletivo", cajado: "seletivo", mao: "seletivo", cristal: "nenhum", sombra: "nenhum" };
const cmds = [{ name: "set_palette", input: { colors: pal.map(([key, hex, name]) => ({ key, hex, name })) } },
  ...layers.map((name) => ({ name: "add_layer", input: { name } })), { name: "update_layer", input: { layer: "Base", delete: true } },
  { name: "add_frames", input: { count: N - 1 } }];
for (let t = 0; t < N; t++) {
  const L = frame(t);
  for (const l of layers) {
    const rows = offX(L[l], OX).map((r) => r.join("")); chk(rows, `${l} f${t}`);
    cmds.push({ name: "draw_rows", input: { frames: t, layer: l, rows, contorno: contorno[l], preview: false } });
  }
}
cmds.push({ name: "set_frame_timing", input: { frames: "all", duration_ms: [180, 120, 140, 200, 160, 120, 140, 200] } });
const dir = new URL(".", import.meta.url).pathname;
writeFileSync(dir + "cmds.json", JSON.stringify(cmds));
if (!process.argv.includes("--so-cmds")) {
  const run = (c) => execSync(c, { cwd: dir + "../..", stdio: "inherit" });
  run(`node bin/anima.mjs new examples/mago/mago.anima.json 48x48 8 > /dev/null`);
  run(`node bin/anima.mjs run examples/mago/mago.anima.json examples/mago/cmds.json -q --png /tmp/mago_rodadas/preview.png > /dev/null`);
}

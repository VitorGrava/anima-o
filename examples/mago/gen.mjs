// Mago de RPG 48x48, idle de 8 frames em loop.
// Referências estudadas: "Old Wizard With A Staff" (mirquiso, itch.io), "Wizard sprite sheet" (Movicx, OpenGameArt),
// "Animated Wizard" (Calciumtrice, OpenGameArt).
// Camadas (baixo→cima): sombra, capa, corpo, barba, cajado, mao, cristal, contorno (polish), aura.
// Respiração: peito/ombros sobem 1 px nos frames 2–4; barba atrasa 1 frame, capa 1–2, ponta do chapéu 2 (em arco), cristal 2.
import { writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
const W = 48, H = 48, N = 8;
const pal = [
  ["m", "#353570", "manto"], ["d", "#1c1a40", "manto-sombra"], ["l", "#6064be", "manto-luz"], ["t", "#8a8cd0", "manto-barra"],
  ["c", "#4a3058", "capa"], ["C", "#36224a", "capa-sombra"], ["p", "#6a4a7e", "capa-luz"],
  ["w", "#ece8e0", "barba-luz"], ["g", "#b4b0b4", "barba"], ["G", "#7c7888", "barba-sombra"],
  ["s", "#e8b090", "pele"], ["k", "#b87464", "pele-sombra"], ["e", "#1c1630", "olho"],
  ["S", "#b07a4a", "cajado-luz"], ["T", "#7a4a2e", "cajado"], ["U", "#4a2a1e", "cajado-sombra"],
  ["b", "#33262c", "bota"], ["B", "#584440", "bota-luz"], ["r", "#7a4a36", "cinto"],
  ["z", "#ffffff", "cristal-brilho"], ["x", "#8af0f8", "cristal-luz"], ["X", "#30b4d0", "cristal"], ["Y", "#186080", "cristal-sombra"],
  ["h", "#c8fcff", "aura"], ["o", "#6a5c72", "sombra-chao"], ["O", "#54465e", "sombra-chao-centro"],
];
const grid = () => Array.from({ length: H }, () => Array(W).fill("."));
const span = (g, y, x0, x1, c) => { for (let x = x0; x <= x1; x++) if (g[y] && x >= 0 && x < W) g[y][x] = c; };
const px = (g, x, y, c) => { if (g[y] && x >= 0 && x < W) g[y][x] = c; };
const chk = (rows, n) => rows.forEach((r, i) => { if ([...r].length !== W) throw new Error(`${n} linha ${i}: ${[...r].length} colunas`); });
const fillRows = (g, rows, c) => { for (const [y, [a, b]] of Object.entries(rows)) span(g, +y, a, b, c); };
const OX = 2; // centraliza a massa

// ---------- ponta do chapéu (desenhada à parte para balançar em arco) ----------
function pontaChapeu() {
  const g = grid();
  fillRows(g, { 3: [14, 15], 4: [15, 17], 5: [16, 20], 6: [18, 21] }, "m");
  px(g, 14, 3, "l"); px(g, 15, 4, "l"); px(g, 16, 5, "l");
  px(g, 17, 4, "d"); span(g, 5, 19, 20, "d"); span(g, 6, 20, 21, "d"); px(g, 15, 3, "d");
  return g;
}
// ---------- CORPO (copa do chapéu, rosto, manto, braços, pés) ----------
function corpoBase() {
  const g = grid();
  // copa: lados curvos (degraus 1-1-2), aba elíptica
  const copa = { 7: [18, 22], 8: [17, 23], 9: [17, 24], 10: [16, 25] };
  fillRows(g, copa, "m");
  for (const [y, [a, b]] of Object.entries(copa)) { px(g, a, +y, "l"); span(g, +y, b - 1, b, "d"); }
  px(g, 18, 7, "l"); span(g, 10, 16, 25, "c"); span(g, 10, 16, 17, "p"); px(g, 25, 10, "C"); // faixa
  fillRows(g, { 11: [13, 29], 12: [11, 32], 13: [13, 31] }, "m");
  span(g, 11, 14, 21, "l"); span(g, 12, 11, 15, "l"); span(g, 13, 13, 31, "d"); span(g, 12, 29, 32, "d");
  // cabeça 3/4: cabelo atrás, testa na sombra da aba, sobrancelha branca saliente, nariz grande
  fillRows(g, { 14: [17, 20], 15: [17, 20], 16: [18, 20] }, "g"); px(g, 17, 15, "G");
  span(g, 14, 21, 27, "k");
  span(g, 15, 21, 27, "s"); span(g, 16, 21, 28, "s");
  px(g, 21, 15, "k"); px(g, 21, 16, "k");
  span(g, 14, 23, 27, "w"); px(g, 28, 14, "w"); px(g, 22, 14, "g"); // sobrancelha
  px(g, 25, 15, "e"); px(g, 24, 15, "k");
  span(g, 15, 28, 28, "s"); span(g, 16, 28, 29, "s"); px(g, 29, 17, "k"); px(g, 28, 17, "k"); // nariz
  // manto: ombros, peito, cintura estreita, saia em sino
  const manto = {
    17: [16, 29], 18: [15, 30], 19: [14, 30], 20: [14, 30], 21: [14, 30], 22: [15, 30], 23: [15, 30], 24: [16, 30], 25: [16, 30], 26: [17, 29], 27: [17, 29], 28: [18, 29], 29: [18, 29], 30: [18, 29],
    31: [17, 30], 32: [17, 30], 33: [16, 31], 34: [16, 31], 35: [15, 32], 36: [15, 32], 37: [14, 33], 38: [14, 33], 39: [13, 34], 40: [13, 34], 41: [12, 35], 42: [12, 35],
  };
  fillRows(g, manto, "m");
  for (const [y, [a, b]] of Object.entries(manto)) {
    const Y = +y;
    if (Y <= 25) { px(g, a, Y, "l"); px(g, a + 1, Y, "l"); } else px(g, a, Y, "l");
    span(g, Y, b - (Y > 33 ? 2 : 1), b, "d");
  }
  span(g, 17, 16, 21, "l"); span(g, 18, 15, 19, "l");
  // cinto e dobras em V saindo da cintura
  span(g, 30, 18, 29, "r"); px(g, 18, 30, "C"); px(g, 23, 31, "r"); px(g, 22, 32, "r");
  const vL = [[20, 32], [19, 34], [18, 36], [17, 38], [16, 40], [16, 41]], vR = [[27, 32], [28, 34], [29, 36], [30, 38], [31, 40], [31, 41]];
  for (const [x, y] of vL) { px(g, x, y, "d"); px(g, x, y + 1, "d"); px(g, x + 1, y + 1, "l"); }
  for (const [x, y] of vR) { px(g, x, y, "d"); px(g, x, y + 1, "d"); }
  // abertura da frente e vão entre os pés
  for (let y = 27; y <= 40; y++) if (y !== 30) px(g, 24 + (y > 35 ? 1 : 0), y, "t");
  for (let y = 31; y <= 40; y++) px(g, 23 + (y > 35 ? 1 : 0), y, "d");
  // barra em sino ondulada
  span(g, 42, 12, 35, "d"); span(g, 42, 14, 18, "m");
  for (const x of [19, 20, 33, 34, 35]) px(g, x, 42, ".");
  px(g, 12, 41, "d"); px(g, 35, 41, "d");
  span(g, 41, 24, 26, "C"); span(g, 42, 23, 27, ".");
  // pés escuros
  span(g, 42, 20, 22, "b"); span(g, 43, 17, 22, "b"); span(g, 43, 18, 19, "B");
  span(g, 42, 27, 29, "b"); span(g, 43, 27, 32, "b"); span(g, 43, 29, 30, "B");
  // braço de trás (segura o cajado): cotovelo para trás, manga em sino sob a mão
  fillRows(g, { 19: [12, 14], 20: [11, 14], 21: [11, 14], 22: [11, 15], 23: [12, 15], 24: [12, 15], 25: [13, 15] }, "m");
  px(g, 12, 19, "l"); px(g, 11, 20, "l"); px(g, 11, 21, "l");
  span(g, 24, 12, 14, "d"); span(g, 25, 13, 15, "d"); for (let y = 21; y <= 25; y++) px(g, 16, y, "d");
  // braço da frente: ombro → cotovelo dobrado embaixo → antebraço subindo em diagonal, punho em sino
  const braco = { 19: [28, 31], 20: [28, 32], 21: [28, 33], 22: [29, 35], 23: [29, 36], 24: [29, 36], 25: [30, 36], 26: [30, 35], 27: [31, 34] };
  fillRows(g, braco, "m");
  for (const [y, [a]] of Object.entries(braco)) px(g, a, +y, "d"); // separa do tronco
  px(g, 31, 19, "l"); px(g, 32, 20, "l"); px(g, 33, 21, "l"); px(g, 34, 22, "l"); px(g, 35, 22, "l");
  span(g, 26, 31, 35, "d"); span(g, 27, 31, 34, "d"); px(g, 36, 24, "d"); px(g, 36, 25, "d"); px(g, 32, 24, "d"); px(g, 31, 25, "d"); // dobra do cotovelo, interior do punho
  return g;
}
// ---------- BARBA (camada própria, atrasa 1 frame) ----------
function barba() {
  const g = grid();
  const beard = { 17: [20, 28], 18: [19, 28], 19: [19, 28], 20: [19, 27], 21: [20, 27], 22: [20, 26], 23: [21, 26], 24: [21, 25], 25: [22, 25], 26: [22, 24], 27: [23, 24], 28: [23, 23] };
  for (const [y, [a, b]] of Object.entries(beard)) for (let x = a; x <= b; x++) {
    const v = (+y - 17) + (x - 20) * 0.6;
    px(g, x, +y, v < 2.5 ? "w" : v < 7.5 ? "g" : "G");
  }
  span(g, 17, 22, 28, "w"); px(g, 29, 18, "g"); px(g, 28, 18, "g"); // bigode
  px(g, 22, 21, "G"); px(g, 22, 22, "G"); px(g, 24, 23, "G"); px(g, 21, 19, "G"); px(g, 26, 20, "w");
  return g;
}
// ---------- CAPA: menor, dobrada, borda irregular, tom frio ----------
function capaBase(sway) {
  const g = grid();
  fillRows(g, { 10: [13, 15], 11: [12, 15], 12: [12, 15], 13: [14, 17], 14: [13, 17], 15: [13, 17], 16: [13, 18] }, "c"); px(g, 13, 14, "p"); px(g, 13, 15, "p");
  const ML = { 17: 16, 18: 15, 19: 14, 20: 14, 21: 14, 22: 15, 23: 15, 24: 16, 25: 16, 26: 17, 27: 17, 28: 18, 29: 18, 30: 18, 31: 17, 32: 17, 33: 16, 34: 16, 35: 15, 36: 15, 37: 14, 38: 14 };
  const L = (y) => ML[y] - (y < 22 ? 2 : y < 30 ? 3 : 2) + (y >= 26 && y <= 31 ? 0 : 0);
  for (let y = 17; y <= 38; y++) {
    const s = y >= 30 ? sway * (y >= 35 ? 2 : 1) : 0;
    const a = L(y) + s;
    span(g, y, a, 24, "c");
    px(g, a, y, y < 28 ? "p" : "c");
    px(g, a + 2, y, y > 22 ? "C" : "c"); // dobra
    if (y > 30) px(g, a + 1, y, "p");
  }
  // borda de baixo em pontas (zigue-zague), recolhida atrás do manto
  const s2 = sway * 2;
  const pontas = [[11, 39], [12, 40], [13, 39], [14, 40], [15, 39]];
  for (const [x, y] of pontas) for (let yy = 38; yy <= y; yy++) px(g, x + s2, yy, "C");
  return g;
}
// ---------- CAJADO (apoiado no chão) ----------
function cajado() {
  const g = grid();
  for (let y = 10; y <= 44; y++) { px(g, 9, y, "S"); px(g, 10, y, "T"); }
  for (const y of [18, 29, 37]) px(g, 10, y, "U");
  for (const y of [19, 30, 38]) px(g, 9, y, "T");
  span(g, 9, 7, 13, "T"); px(g, 7, 9, "S"); px(g, 12, 9, "U"); px(g, 13, 9, "U");
  span(g, 8, 6, 13, "T"); px(g, 6, 8, "S"); px(g, 6, 7, "S"); span(g, 8, 11, 13, "U"); px(g, 13, 7, "U");
  span(g, 44, 9, 10, "U");
  return g;
}
// ---------- MÃOS ----------
function maos(dyF) {
  const g = grid();
  // mão da frente 3x3 com polegar para cima, saindo do punho
  span(g, 21 + dyF, 37, 38, "s"); span(g, 22 + dyF, 37, 39, "s"); span(g, 23 + dyF, 37, 39, "s"); span(g, 24 + dyF, 37, 38, "k");
  px(g, 39, 23 + dyF, "k"); px(g, 38, 20 + dyF, "s"); px(g, 39, 21 + dyF, "s");
  // mão de trás fechada no cajado
  span(g, 20, 6, 9, "s"); span(g, 21, 5, 10, "s"); span(g, 22, 5, 10, "k"); span(g, 23, 6, 8, "k");
  px(g, 5, 21, "k"); px(g, 9, 22, "s"); px(g, 7, 21, "k"); px(g, 10, 21, "k");
  return g;
}
// ---------- CRISTAL e AURA ----------
function cristal(dy, lv) {
  const g = grid();
  const cx = 9, cy = 5 + dy;
  const rows = ["..xz..", ".xxxX.", "xxXXXY", "xXXXYY", ".XXYY.", "..YY.."];
  rows.forEach((r, j) => [...r].forEach((c, i) => { if (c !== ".") px(g, cx - 2 + i, cy - 2 + j, c); }));
  if (lv >= 1) { px(g, cx, cy, "z"); px(g, cx - 1, cy + 1, "x"); px(g, cx + 1, cy, "x"); }
  if (lv >= 2) px(g, cx + 1, cy - 1, "z");
  if (lv >= 3) px(g, cx + 1, cy + 1, "x");
  return g;
}
function aura(dy, lv) {
  const g = grid();
  const cx = 9, cy = 5 + dy;
  if (lv >= 2) { px(g, cx + 1, cy - 3, "h"); px(g, cx - 3, cy, "h"); px(g, cx + 4, cy + 1, "h"); }
  if (lv >= 3) { px(g, cx + 1, cy - 4, "h"); px(g, cx - 4, cy, "h"); px(g, cx + 5, cy + 1, "h"); px(g, cx - 1, cy - 3, "h"); px(g, cx + 3, cy - 2, "h"); }
  return g;
}

// ---------- animação ----------
const breath = [0, 0, -1, -1, -1, 0, 0, 0];             // peito/ombros sobem 1 px nos frames 2–4
const lag = (k, t) => breath[(t - k + N) % N];
const tipDX = [0, 0, 0, 1, 1, 0, -1, -1];               // ponta do chapéu em arco (atraso 2)
const tipDY = [0, 0, 0, 0, -1, -1, -1, 0];
const glow = [0, 1, 2, 3, 3, 2, 1, 0];
const capeSway = [0, 0, 0, 0, -1, -1, -1, 0];           // barra da capa (atraso 2)
const handDY = [0, 0, 0, -1, -1, -1, 0, 0];            // mão da frente acompanha 1 frame depois
const shiftRows = (g, fn) => { const o = grid(); for (let y = 0; y < H; y++) { const sy = y - fn(y); if (sy >= 0 && sy < H) o[y] = [...g[sy]]; } return o; };
const offX = (g, d) => g.map((r) => { const o = Array(W).fill("."); r.forEach((c, x) => { if (c !== "." && x + d >= 0 && x + d < W) o[x + d] = c; }); return o; });
const over = (a, b) => a.map((r, y) => r.map((c, x) => (b[y][x] !== "." ? b[y][x] : c)));
const sombra = () => { const g = grid(); span(g, 43, 11, 35, "O"); span(g, 45, 8, 38, "o"); span(g, 44, 10, 36, "o"); span(g, 45, 13, 33, "O"); return g; };

const CB = corpoBase(), CJ = offX(cajado(), -1), PT = pontaChapeu(), BB = barba();
const upper = (y) => (y <= 31 ? 1 : 0);
const layers = ["capa", "corpo", "barba", "cajado", "mao", "cristal"];
function frame(t) {
  const b = breath[t];
  const ponta = shiftRows(offX(PT, tipDX[t]), () => b + tipDY[t]);
  const corpo = over(shiftRows(CB, (y) => upper(y) * b), ponta);
  const capa = shiftRows(capaBase(capeSway[t]), (y) => (y <= 30 ? lag(1, t) : 0));
  const barbaL = shiftRows(BB, () => lag(1, t));
  const mao = maos(handDY[t]);
  const m = over(grid(), shiftRows(mao, (y) => (y < 25 && y > 19 ? 0 : 0)));
  return { capa, corpo, barba: barbaL, cajado: CJ, mao: m, cristal: offX(cristal(lag(2, t), glow[t]), -1), aura: offX(aura(lag(2, t), glow[t]), -1), sombra: sombra() };
}
const cmds = [{ name: "set_palette", input: { colors: pal.map(([key, hex, name]) => ({ key, hex, name })) } },
  ...layers.map((name) => ({ name: "add_layer", input: { name } })), { name: "update_layer", input: { layer: "Base", delete: true } },
  { name: "add_frames", input: { count: N - 1 } }];
const draw = (t, l, g) => { const rows = offX(g, OX).map((r) => r.join("")); chk(rows, `${l} f${t}`); cmds.push({ name: "draw_rows", input: { frames: t, layer: l, rows, preview: false } }); };
const F = Array.from({ length: N }, (_, t) => frame(t));
F.forEach((L, t) => layers.forEach((l) => draw(t, l, L[l])));
// contorno seletivo na figura inteira (sem sombrear: o sombreamento é à mão)
cmds.push({ name: "polish", input: { frames: "all", sombrear: false, contorno: "seletivo", preview: false } });
// aura (sem contorno) por cima e sombra do chão por baixo, depois do polish
cmds.push({ name: "add_layer", input: { name: "aura" } }, { name: "add_layer", input: { name: "sombra", position: "bottom" } });
F.forEach((L, t) => { draw(t, "aura", L.aura); draw(t, "sombra", L.sombra); });
cmds.push({ name: "set_frame_timing", input: { frames: "all", duration_ms: [200, 120, 140, 220, 160, 120, 140, 200] } });
const dir = new URL(".", import.meta.url).pathname;
writeFileSync(dir + "cmds.json", JSON.stringify(cmds));
if (!process.argv.includes("--so-cmds")) {
  const run = (c) => execSync(c, { cwd: dir + "../..", stdio: "inherit" });
  run(`node bin/anima.mjs new examples/mago/mago.anima.json 48x48 8 > /dev/null`);
  run(`node bin/anima.mjs run examples/mago/mago.anima.json examples/mago/cmds.json -q --png /tmp/mago_rodadas/preview.png > /dev/null`);
}

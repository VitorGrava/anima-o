// Esqueleto aventureiro 32x32 — RODADA 2 (feito à mão; sem contorno escrito: contorno seletivo por material no fim)
import { writeFileSync } from "node:fs";
const L = (n, seg) => { const s = ".".repeat(n) + seg; if (s.length !== 16) throw new Error(`metade com ${s.length}: ${s}`); return s; };
const left = [
  L(11, "hhhhh"),            // y0 copa
  L(10, "HHhhhh"),           // y1
  L(9, "HHHhhhh"),           // y2
  L(9, "Hhhhhhh"),           // y3
  L(9, "hhhhhhh"),           // y4
  L(9, "LLlllll"),           // y5 fita
  L(4, "HHHHHhhhhhhh"),      // y6 aba
  L(4, "jjjjjjjjjjjj"),      // y7 aba, sombra
  L(11, "DDDDD"),            // y8 sombra da aba na testa
  L(10, "BBbbbb"),           // y9
  L(9, "bbbkkkb"),           // y10 órbita (topo)
  L(9, "bbkeekb"),           // y11 órbita + brilho
  L(9, "bbbkkkb"),           // y12 órbita (base)
  L(9, "bbbbbbk"),           // y13 nariz
  L(10, "bbbbbk"),           // y14 maçã do rosto
  L(11, "bkbkb"),            // y15 dentes
  L(12, "bkbb"),             // y16 mandíbula
  L(10, "RRrrrr"),           // y17 cachecol
  L(10, "qqrrrr"),           // y18
  L(10, "bbbbbb"),           // y19 clavícula
  L(11, "kkkkb"),            // y20 vão (cavidade escura) + coluna
  L(11, "BBbbb"),            // y21 costela
  L(12, "kkkb"),             // y22
  L(12, "Bbbb"),             // y23 costela (última)
  L(11, "LLlll"),            // y25 cinto
  L(11, "mmmmm"),            // y26 cinto (sombra)
  L(11, "bkbbb"),            // y27 pélvis
  L(13, "b.."),              // y27 fêmur
  L(11, "LLll."),             // y29 bota
  L(11, "lllm."),            // y30 bota
  L(16, ""),                 // y31 (contorno entra aqui)
];
// reorçamento vertical: linha vazia no topo (contorno do chapéu), copa de 3 linhas e uma linha a mais de perna
const E = L(16, "");
const left2 = [E, left[0], left[1], left[2], ...left.slice(5, 28), left[27], left[27], left[28], left[29], E];
if (left2.length !== 32) throw new Error("linhas: " + left2.length);
left.length = 0; left.push(...left2);
const SH = { B: "b", H: "h", L: "l", R: "r" };
const grid = left.map((half) => { const l = [...half], r = [...half].reverse().map((c) => SH[c] ?? c);
  for (let i = 15; i >= 0; i--) { if (r[i] === ".") continue; const j = i; if ("bhrl".includes(r[j])) r[j] = { b: "d", h: "j", r: "q", l: "m" }[r[j]]; break; }
  return [...l, ...r]; });
const put = (x, y, c, only = false, raw = false) => { if (!raw) y -= 1; if (y < 0 || y > 31 || x < 0 || x > 31) return; if (only && grid[y][x] !== ".") return; grid[y][x] = c; };
// braços de osso finos: ombro, cotovelo, antebraço e mão 2x2 (na altura do cinto); simétricos
const P = (x, y, c) => put(x, y, c, false, true);
for (const [x, y, c] of [[9, 18, "b"], [9, 19, "b"], [9, 20, "b"], [8, 21, "B"], [8, 22, "b"], [8, 23, "b"], [7, 24, "b"], [8, 24, "b"], [7, 25, "d"], [8, 25, "d"], [6, 25, "d"]]) { P(x, y, c); P(31 - x, y, c === "B" ? "b" : c === "b" ? "d" : c); }
// espada: lâmina 2 px (luz/sombra) com ponta fina, guarda dourada, empunhadura curta e pomo
P(27, 10, "t");
for (let y = 11; y <= 21; y++) { put(26, y, "t", true, true); put(27, y, "u", true, true); }
for (let x = 24; x <= 29; x++) P(x, 22, x === 24 || x === 29 ? "n" : "g");
for (let y = 23; y <= 25; y++) { put(26, y, "l", true, true); put(27, y, "m", true, true); }
P(26, 26, "g"); P(27, 26, "n");
// ponta do cachecol, fivelas, pena
for (const [x, y, c] of [[19, 18, "r"], [20, 18, "q"], [19, 19, "r"], [20, 19, "q"], [20, 20, "q"]]) P(x, y, c);
P(15, 4, "g"); P(16, 4, "g");
for (const [x, y, c] of [[22, 1, "r"], [23, 1, "R"], [22, 2, "r"], [23, 2, "r"], [21, 3, "q"]]) P(x, y, c);
for (const [x, y] of [[15, 23], [16, 23], [15, 24], [16, 24]]) P(x, y, "g");
P(15, 23, "G");
// joelho (osso 1 px mais largo)
P(12, 27, "b"); P(19, 27, "d");

// ================= 64x64: amplia o corpo ANTES do contorno (contorno continua de 1 px) e acrescenta detalhes =================
const big = Array.from({ length: 64 }, (_, y) => Array.from({ length: 64 }, (_, x) => grid[y >> 1][x >> 1]));
const G2 = (x, y, c, only = false) => { if (x < 0 || y < 0 || x > 63 || y > 63) return; if (only && big[y][x] === ".") return; big[y][x] = c; };
// luz/sombra nas bordas de cada material (cima/esquerda claro, baixo/direita sombra), só dentro da própria peça
const LIGHT = { b: "B", h: "H", l: "L", r: "R" }, DARK = { b: "d", h: "j", l: "m", r: "q" };
const snap = big.map((r) => [...r]);
for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
  const c = snap[y][x]; if (!LIGHT[c]) continue;
  const up = snap[y - 1]?.[x], dn = snap[y + 1]?.[x], lf = snap[y]?.[x - 1];
  if (up !== c && up !== LIGHT[c] && (up === "." || up === "D" || up === "j")) big[y][x] = LIGHT[c];
  else if (dn !== c && dn !== DARK[c] && (dn === "." || "kdmhjq".includes(dn ?? "."))) big[y][x] = DARK[c];
  else if (lf === "." && c === "b") big[y][x] = "B";
}
// rachadura na caveira, pupilas, costuras, fivelas, dobras, dedos, joelhos
for (const [x, y] of [[22, 17], [23, 18], [23, 19], [24, 20]]) G2(x, y, "k");
for (let x = 20; x <= 42; x += 3) G2(x, 8, "j", true);                         // pontos de costura da fita
for (const [x, y] of [[22, 46], [24, 46], [26, 46], [38, 46], [40, 46], [42, 46]]) G2(x, y, "m", true); // costura do cinto
for (const [x, y] of [[24, 60], [25, 60], [38, 60], [39, 60]]) G2(x, y, "g");  // fivelas das botas
for (const [x, y] of [[34, 33], [35, 35], [36, 34]]) G2(x, y, "q", true);      // dobras do cachecol
for (const [x, y] of [[13, 50], [12, 51], [11, 51]]) G2(x, y, "B");            // dedos da mão esquerda
for (const [x, y] of [[50, 50], [51, 51]]) G2(x, y, "b");                     // dedos da mão direita
for (const [x, y] of [[25, 54], [26, 54], [37, 54], [38, 54]]) G2(x, y, "B"); // joelhos
for (let y = 21; y <= 41; y += 5) G2(52, y, "s", true);                       // risco claro no gume
// lâmina com ponta fina
G2(53, 19, "t"); G2(52, 20, "t"); G2(53, 20, "t");
const grid2 = big;
// ---- contorno SELETIVO por material (não é preto em tudo) ----
const OUT = { b: "x", B: "x", d: "x", D: "x", e: "x", h: "w", H: "w", j: "w", L: "z", l: "z", m: "z", r: "y", R: "y", q: "y", g: "p", G: "p", n: "p", s: "v", t: "v", u: "v", k: "x" };
const base = grid2.map((r) => [...r]);
for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
  if (base[y][x] !== ".") continue;
  let best = null;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { const c = base[y + dy]?.[x + dx]; if (c && c !== ".") { const o = OUT[c]; if (!best || "wzyvpx".indexOf(o) < "wzyvpx".indexOf(best)) best = o; } }
  if (best) grid2[y][x] = best;
}
const hex = { x: "#4a3a5c", w: "#3a2218", z: "#2a1a10", y: "#5a1a28", v: "#3a4a68", p: "#6a4010", b: "#ece4cc", B: "#fffaf0", d: "#c6bacb", D: "#a99cb4", h: "#9a6234", H: "#c68a50", j: "#6a4024", r: "#d03a3a", R: "#f0705e", q: "#8a2438", l: "#7a5030", L: "#a87644", m: "#4a3020", g: "#f0c048", G: "#fff0a0", n: "#b08020", s: "#b8cce0", t: "#eef6ff", u: "#7890b0", e: "#5ae0ff", k: "#2a1a30" };
const nome = { x: "contorno-osso", w: "contorno-chapeu", z: "contorno-couro", y: "contorno-cachecol", v: "contorno-aco", p: "contorno-ouro", b: "osso", B: "osso-luz", d: "osso-sombra", D: "osso-sombra-funda", h: "chapeu", H: "chapeu-luz", j: "chapeu-sombra", r: "cachecol", R: "cachecol-luz", q: "cachecol-sombra", l: "couro", L: "couro-luz", m: "couro-sombra", g: "ouro", G: "ouro-luz", n: "ouro-sombra", s: "aco", t: "aco-luz", u: "aco-sombra", e: "brilho", k: "cavidade" };
const rows = grid2.map((r) => r.join(""));
const used = [...new Set(rows.join("").replace(/\./g, ""))];
writeFileSync(new URL("./cmds64.json", import.meta.url), JSON.stringify([{ name: "set_palette", input: { colors: used.map((k) => ({ key: k, hex: hex[k], name: nome[k] })) } }, { name: "draw_rows", input: { rows, preview: false } }]));
console.log(rows.join("\n"));

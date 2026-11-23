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
  L(9, "bbbbkkb"),           // y10 órbita (topo, 2 px)
  L(9, "bbbkekb"),           // y11 órbita 3 px + 1 px de brilho
  L(9, "bbbbkkb"),           // y12 órbita (base, 2 px)
  L(9, "bbbbbbk"),           // y13 nariz
  L(10, "bbbbbk"),           // y14 maçã do rosto
  L(11, "bkbkb"),            // y15 dentes
  L(12, "bkbb"),             // y16 mandíbula
  L(10, "RRrrrr"),           // y17 cachecol
  L(10, "qqrrrr"),           // y18
  L(10, "bbbbbb"),           // y19 clavícula
  L(11, "ddddb"),            // y20 vão de sombra cinza + coluna
  L(11, "BBbbb"),            // y21 costela
  L(12, "dddb"),             // y22
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
// espada em DIAGONAL (cruza a silhueta): lâmina 2 px da mão para cima e para fora; guarda e pomo
for (let t = 0; t <= 11; t++) { const x = 25 + Math.round(t * 0.45), y = 23 - t; put(x, y, "t", true, true); put(x + 1, y, "u", true, true); if (t % 3 === 1) put(x + 1, y + 1, "u", true, true); }
P(30, 11, "t");
for (const [x, y] of [[23, 23], [24, 23], [25, 23], [26, 23], [24, 24], [25, 22]]) P(x, y, "g");
P(23, 23, "n"); P(26, 23, "n");
for (const [x, y, c] of [[24, 25, "l"], [24, 26, "m"], [23, 26, "g"]]) P(x, y, c);
// ponta do cachecol, fivelas, pena
for (const [x, y, c] of [[19, 18, "r"], [20, 18, "q"], [19, 19, "r"], [20, 19, "q"], [20, 20, "q"]]) P(x, y, c);
P(15, 4, "g"); P(16, 4, "g");
for (const [x, y, c] of [[22, 1, "r"], [23, 1, "R"], [22, 2, "r"], [23, 2, "r"], [21, 3, "q"]]) P(x, y, c);
for (const [x, y] of [[15, 23], [16, 23], [15, 24], [16, 24]]) P(x, y, "g");
P(15, 23, "G");
// joelho (osso 1 px mais largo)
P(12, 27, "b"); P(19, 27, "d");
// ---- contorno SELETIVO por material (não é preto em tudo) ----
const OUT = { b: "x", B: "x", d: "x", D: "x", e: "x", h: "w", H: "w", j: "w", L: "z", l: "z", m: "z", r: "y", R: "y", q: "y", g: "p", G: "p", n: "p", s: "v", t: "v", u: "v", k: "x" };
const base = grid.map((r) => [...r]);
for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
  if (base[y][x] !== ".") continue;
  let best = null;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { const c = base[y + dy]?.[x + dx]; if (c && c !== ".") { const o = OUT[c]; if (!best || "wzyvpx".indexOf(o) < "wzyvpx".indexOf(best)) best = o; } }
  if (best) grid[y][x] = best;
}
const hex = { x: "#2c2838", w: "#3a2218", z: "#2a1a10", y: "#5a1a28", v: "#3a4a68", p: "#6a4010", b: "#e6e1d6", B: "#f8f5ee", d: "#aeaabb", D: "#8d8aa0", h: "#86603c", H: "#a67c50", j: "#5a4028", r: "#d03a3a", R: "#f0705e", q: "#8a2438", l: "#7a5030", L: "#a87644", m: "#4a3020", g: "#f0c048", G: "#fff0a0", n: "#b08020", s: "#b8cce0", t: "#eef6ff", u: "#7890b0", e: "#d8ecff", k: "#2a1a30" };
const nome = { x: "contorno-osso", w: "contorno-chapeu", z: "contorno-couro", y: "contorno-cachecol", v: "contorno-aco", p: "contorno-ouro", b: "osso", B: "osso-luz", d: "osso-sombra", D: "osso-sombra-funda", h: "chapeu", H: "chapeu-luz", j: "chapeu-sombra", r: "cachecol", R: "cachecol-luz", q: "cachecol-sombra", l: "couro", L: "couro-luz", m: "couro-sombra", g: "ouro", G: "ouro-luz", n: "ouro-sombra", s: "aco", t: "aco-luz", u: "aco-sombra", e: "brilho", k: "cavidade" };
const rows = grid.map((r) => r.join(""));
const used = [...new Set(rows.join("").replace(/\./g, ""))];
writeFileSync(new URL("./cmds32d.json", import.meta.url), JSON.stringify([{ name: "set_palette", input: { colors: used.map((k) => ({ key: k, hex: hex[k], name: nome[k] })) } }, { name: "draw_rows", input: { rows, preview: false } }]));
console.log(rows.join("\n"));

// Esqueleto aventureiro 32x32, DESENHADO À MÃO: metade esquerda em texto, espelhada com luz só à esquerda; assimétricos por cima.
import { writeFileSync } from "node:fs";
const L = (n, seg) => { const s = ".".repeat(n) + seg; if (s.length !== 16) throw new Error(`metade com ${s.length}: ${s}`); return s; };
const left = [
  L(16, ""),
  L(11, "ooooo"),
  L(10, "oHHhhh"),
  L(9, "oHHhhhh"),
  L(9, "oHhhhhh"),
  L(9, "ohhhhhh"),
  L(9, "oLLllll"),
  L(4, "oHHHHhhhhhhh"),
  L(4, "ojjjjjjjjjjj"),
  L(9, "oDDDDDD"),
  L(8, "oBBbbbbb"),
  L(8, "oBbbbbbb"),
  L(8, "obkkkkkb"),
  L(8, "obkeekkb"),
  L(8, "obkkkkkb"),
  L(8, "obbkkkbk"),
  L(8, "obbbbbbk"),
  L(9, "obbbbbb"),
  L(9, "obkbkbb"),
  L(9, "oRRrrrr"),
  L(9, "oqqrrrr"),
  L(8, "obobbbbb"),
  L(8, "obobBBbb"),
  L(8, "obokkkkb"),
  L(8, "obobBBbb"),
  L(8, "oboLLLll"),
  L(8, "obollllg"),
  L(8, "oboobbbo"),
  L(11, "obBbo"),
  L(10, "oLLllo"),
  L(10, "ollllo"),
  L(10, "oooooo"),
];
const SH = { b: "d", h: "j", r: "q", l: "m", B: "b", H: "h", L: "l", R: "r", D: "D" };
const grid = left.map((half) => {
  const l = [...half];
  const r = [...half].reverse().map((c) => (SH[c] && "BHLR".includes(c) ? SH[c] : c));
  // sombra no lado oposto à luz: primeira cor de miolo a partir da borda direita
  for (let i = 0; i < 16; i++) { if (r[15 - i] === "." ) continue; break; }
  for (let i = 15; i >= 0; i--) { if (r[i] === "." ) continue; if (r[i] === "o") { const j = i - 1; if (j >= 0 && "bhrl".includes(r[j])) r[j] = SH[r[j]]; } break; }
  return [...l, ...r];
});
const put = (x, y, c, only = false) => { if (y < 0 || y > 31 || x < 0 || x > 31) return; if (only && grid[y][x] !== ".") return; grid[y][x] = c; };
// ---- espada (atrás do chapéu: só onde o fundo está livre) ----
for (let y = 3; y <= 24; y++) { put(24, y, "k", true); put(26, y, "k", true); put(25, y, y < 6 ? "s" : "t", true); }
put(25, 2, "k", true); put(24, 3, "k", true);
for (let x = 22; x <= 28; x++) { put(x, 25, x === 22 || x === 28 ? "n" : "g"); put(x, 24, x > 22 && x < 28 ? "G" : "k", true); }
for (let y = 26; y <= 29; y++) { put(24, y, "k", true); put(25, y, y % 2 ? "l" : "m", true); put(26, y, "k", true); }
put(25, 30, "g"); put(24, 30, "n", true); put(26, 30, "n", true);
// mão direita segurando a empunhadura
put(23, 26, "b"); put(24, 26, "b"); put(23, 27, "o"); put(22, 26, "o");
// ---- ponta do cachecol, fivela do chapéu, pena e alça ----
for (const [x, y, c] of [[19, 21, "r"], [20, 21, "q"], [19, 22, "r"], [20, 22, "q"], [19, 23, "r"], [20, 23, "q"], [20, 24, "q"], [19, 24, "r"], [19, 25, "q"]]) put(x, y, c);
put(15, 6, "g"); put(16, 6, "g");
for (const [x, y, c] of [[22, 3, "i"], [23, 2, "j"], [22, 4, "i"], [21, 5, "k"], [23, 3, "i"], [24, 4, "q"]]) put(x, y, { i: "r", j: "R", k: "q", q: "q", r: "r" }[c] ?? c);
for (const [x, y] of [[11, 21], [12, 22], [13, 22], [14, 23], [15, 23], [16, 23], [17, 24], [18, 24]]) put(x, y, "l");
put(15, 23, "g");
// ---- bolso/bolsa no quadril esquerdo ----
for (const [x, y, c] of [[6, 26, "o"], [7, 26, "o"], [5, 27, "o"], [6, 27, "L"], [7, 27, "l"], [8, 27, "o"], [5, 28, "o"], [6, 28, "l"], [7, 28, "m"], [8, 28, "o"], [6, 29, "o"], [7, 29, "o"]]) put(x, y, c, true);
const names = { k: "contorno", b: "osso", B: "osso-luz", d: "osso-sombra", D: "osso-sombra-funda", h: "chapeu", H: "chapeu-luz", j: "chapeu-sombra", r: "cachecol", R: "cachecol-luz", q: "cachecol-sombra", l: "couro", L: "couro-luz", m: "couro-sombra", g: "ouro", G: "ouro-luz", n: "ouro-sombra", s: "aco", t: "aco-luz", u: "aco-sombra", e: "brilho", o: "contorno" };
const hex = { k: "#2a1a30", b: "#ece4cc", B: "#fffaf0", d: "#c6bacb", D: "#a99cb4", h: "#9a6234", H: "#c68a50", j: "#6a4024", r: "#d03a3a", R: "#f0705e", q: "#8a2438", l: "#7a5030", L: "#a87644", m: "#4a3020", g: "#f0c048", G: "#fff0a0", n: "#b08020", s: "#b8cce0", t: "#eef6ff", u: "#7890b0", e: "#5ae0ff" };
const rows = grid.map((r) => r.join("").replaceAll("o", "k"));
const used = [...new Set(rows.join("").replace(/\./g, ""))];
const cmds = [{ name: "set_palette", input: { colors: used.map((k) => ({ key: k, hex: hex[k], name: names[k] })) } }, { name: "draw_rows", input: { rows, preview: false } }];
writeFileSync(new URL("./cmds32.json", import.meta.url), JSON.stringify(cmds));
console.log(rows.join("\n"));

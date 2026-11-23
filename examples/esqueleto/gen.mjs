// Esqueleto aventureiro 16x16: chapéu de aventureiro, cachecol vermelho, cinto com fivela, espada e botas.
import { writeFileSync } from "node:fs";
const R = (...segs) => { const s = segs.join(""); if (s.length !== 16) throw new Error(`linha com ${s.length} colunas: ${s}`); return s; };
const rows = [
  R(".....", "oooooo", "....."),
  R("....", "o", "hhhhhh", "o", "...."),
  R(".", "o", "hhhhhhhhhhhh", "o", "."),
  R("..", "oo", "bbbbbbbb", "oo", ".."),
  R("...", "o", "boobboob", "o", "..."),
  R("...", "o", "boobboob", "o", "..."),
  R("...", "o", "bbboobbb", "o", "..."),
  R("....", "o", "bbbbbb", "o", "...."),
  R("....", "o", "bobobo", "o", "...."),
  R("...", "o", "rrrrrrrr", "o", "..."),
  R("..", "obo", "bbbbbb", "obo", ".."),
  R("..", "obo", "obbbbo", "obo", ".."),
  R("..", "obo", "bobbob", "obo", ".."),
  R("..", "obo", "llggll", "obo", ".."),
  R("....", "o", "bb", "oo", "bb", "o", "...."),
  R("...", "ohhho", "ohhho", "..."),
].map((r) => [...r]);
// espada na mão direita (lâmina s, guarda g, empunhadura l)
for (let y = 4; y <= 11; y++) rows[y][14] = "s";
rows[12][13] = "g"; rows[12][14] = "g"; rows[12][15] = "g"; rows[13][14] = "l";
// sombreamento à mão (luz de cima-esquerda; a aba do chapéu sombreia a testa)
for (let x = 4; x <= 11; x++) rows[3][x] = "B";
for (const y of [4, 5, 6]) rows[y][11] = "B";
rows[7][10] = "B"; rows[7][5] = "b";
for (const y of [10, 11, 12]) { rows[y][10] = rows[y][10] === "b" ? "B" : rows[y][10]; if (rows[y][12] === "b") rows[y][12] = "B"; }
rows[14][10] = "B"; rows[14][6] = "b";
const strs = rows.map((r) => r.join(""));
const cmds = [
  { name: "set_palette", input: { colors: [
    { key: "o", hex: "#2a1a30", name: "contorno" }, { key: "b", hex: "#ece4cc", name: "osso" }, { key: "B", hex: "#b9aa9c", name: "osso-sombra" },
    { key: "h", hex: "#9a6234", name: "chapeu" }, { key: "r", hex: "#d03a3a", name: "cachecol" }, { key: "l", hex: "#6a4428", name: "couro" },
    { key: "g", hex: "#f0c048", name: "ouro" }, { key: "s", hex: "#b8cce0", name: "aco" } ] } },
  { name: "draw_rows", input: { rows: strs, preview: false } },
];
writeFileSync(new URL("./cmds.json", import.meta.url), JSON.stringify(cmds));
console.log(strs.join("\n"));

// Esqueleto aventureiro com mais detalhes: 32x32 (S=1) e 64x64 (S=2). Medidas em unidades de 32 px; S=2 acrescenta detalhes.
import { writeFileSync } from "node:fs";
const S = Number(process.argv[2] ?? 1), N = 32 * S;
const sc = (v) => Math.round(v * S);
const pal = {
  k: "#2a1a30", // contorno
  b: "#ece4cc", B: "#fffaf0", d: "#c6bacb", // osso: base, luz, sombra fria
  h: "#9a6234", H: "#c68a50", j: "#6a4024", hk: "#3a2218", // chapéu
  r: "#d03a3a", R: "#f0705e", q: "#8a2438", // cachecol
  l: "#7a5030", L: "#a87644", m: "#4a3020", // couro
  g: "#f0c048", G: "#fff0a0", n: "#b08020", // ouro
  s: "#b8cce0", t: "#eef6ff", u: "#6f88aa", // aço
  e: "#5ae0ff", // brilho dos olhos
};
const K = Object.keys(pal);
const keyOf = {}; const KEYS = [..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"];
K.forEach((n, i) => { keyOf[n] = KEYS[i]; });
const c = (n) => keyOf[n];
const cmds = [{ name: "set_palette", input: { colors: K.map((n) => ({ key: keyOf[n], hex: pal[n], name: n === "k" ? "contorno" : `c-${n}` })) } }];
const shapes = [];
const rect = (x, y, w, h, col) => shapes.push({ type: "rect", x: sc(x), y: sc(y), w: Math.max(1, sc(w)), h: Math.max(1, sc(h)), color: c(col), filled: true });
const ell = (x, y, w, h, col) => shapes.push({ type: "ellipse", x: sc(x), y: sc(y), w: Math.max(1, sc(w)), h: Math.max(1, sc(h)), color: c(col), filled: true });
const px = (x, y, col) => shapes.push({ type: "pixels", points: [[sc(x), sc(y)]], color: c(col) });
const line = (x1, y1, x2, y2, col) => shapes.push({ type: "line", x1: sc(x1), y1: sc(y1), x2: sc(x2), y2: sc(y2), color: c(col) });
const poly = (pts, col) => shapes.push({ type: "polygon", points: pts.map(([x, y]) => [sc(x), sc(y)]), color: c(col) });
const blob = (x, y, w, h, m, sq = 2.4) => shapes.push({ type: "blob", x: sc(x), y: sc(y), w: Math.max(3, sc(w)), h: Math.max(3, sc(h)), outline: c(m[0]), base: c(m[1]), light: c(m[2]), shadow: c(m[3]), squareness: sq });
const cap = (x1, y1, x2, y2, r1, r2, m) => shapes.push({ type: "capsule", x1: sc(x1), y1: sc(y1), x2: sc(x2), y2: sc(y2), r1: Math.max(0.6, r1 * S), r2: Math.max(0.6, r2 * S), outline: c(m[0]), base: c(m[1]), light: c(m[2]), shadow: c(m[3]) });
const BONE = ["k", "b", "B", "d"], HAT = ["k", "h", "H", "j"], SCARF = ["k", "r", "R", "q"], LEATHER = ["k", "l", "L", "m"], STEEL = ["k", "s", "t", "u"], GOLD = ["k", "g", "G", "n"];

// ---- espada (atrás do braço) ----
cap(27, 5.5, 27, 23.5, 1, 1, STEEL);
poly([[26, 5.5], [27, 3], [28, 5.5]], "s");
line(27, 7, 27, 22, "t");
rect(24, 23.5, 7, 1.6, "g"); rect(24, 23.5, 7, 0.6, "G");
cap(27, 25, 27, 28, 0.8, 0.8, LEATHER); px(27, 29, "g");
// ---- pernas e botas ----
cap(13.5, 26.5, 13.5, 30, 1.3, 1.3, BONE); cap(18.5, 26.5, 18.5, 30, 1.3, 1.3, BONE);
blob(10, 29, 7, 3, LEATHER, 3); blob(15, 29, 7, 3, LEATHER, 3);
// ---- pélvis, bolsa e caixa torácica ----
blob(11, 24, 10, 4.2, BONE, 2.4);
rect(13, 25.4, 2, 1.6, "k"); rect(17, 25.4, 2, 1.6, "k");
blob(6.5, 25, 5.5, 4.5, LEATHER, 3);
rect(11, 19, 10, 5.4, "k");                      // cavidade escura entre as costelas
rect(15.2, 19, 1.6, 6, "b"); rect(15.2, 19, 0.6, 6, "B");   // coluna
const ribs = S === 1 ? 3 : 5, rstep = S === 1 ? 1.5 : 1.05;
for (let i = 0; i < ribs; i++) {
  const y = 19.7 + i * rstep;
  for (const sg of [-1, 1]) { line(16 + sg * 0.6, y, 16 + sg * 4.2, y + 0.9, "b"); line(16 + sg * 0.6, y - 0.35, 16 + sg * 4.2, y + 0.55, "B"); if (S === 2) line(16 + sg * 0.6, y + 0.4, 16 + sg * 4.2, y + 1.3, "d"); }
}
line(15.5, 19.1, 11, 19.7, "b"); line(16.5, 19.1, 21, 19.7, "b");
// ---- cinto, fivela, alça da bolsa ----
rect(10.5, 24, 11, 1.6, "l"); rect(10.5, 24, 11, 0.6, "L");
rect(15, 23.8, 2, 2, "g"); px(15.5, 24.4, "n");
line(11, 19.5, 21, 25, "l"); line(11, 20.5, 21, 26, "m"); px(15.5, 22.6, "g");
// ---- braços ----
cap(10.5, 19.5, 8.5, 23.5, 1.25, 1.1, BONE); cap(8.5, 23.5, 8, 26.5, 1.1, 1, BONE); blob(6.8, 26, 2.8, 2.5, BONE, 2.2);
cap(21.5, 19.5, 23.5, 23.5, 1.25, 1.1, BONE); cap(23.5, 23.5, 25, 25, 1.1, 1, BONE); blob(24, 24.2, 3, 3, BONE, 2.2);
// ---- cachecol com nó e ponta ----
blob(10, 17.2, 12, 3.2, SCARF, 2.6);
blob(19, 19, 4, 3, SCARF, 2.4);
poly([[20, 21.5], [23, 21.5], [24, 27], [21.5, 26]], "r"); poly([[22, 22], [23, 22], [24, 27], [22.5, 26.5]], "q");
// ---- crânio e mandíbula ----
blob(10, 7, 12, 10.5, BONE, 2.5);
blob(12, 14.5, 8, 4.6, BONE, 2.6);
ell(11.8, 10, 3.2, 3.4, "k"); ell(17, 10, 3.2, 3.4, "k");           // órbitas
px(13, 11, "e"); px(18.2, 11, "e");                                   // brilho
poly([[15.4, 13.6], [16.6, 13.6], [16, 15]], "k");                    // nariz
rect(13, 17.4, 7, 0.9, "k");                                          // linha dos dentes
for (const x of [14.4, 15.6, 16.8, 18]) px(x, 18.1, "k");
// ---- chapéu ----
blob(5, 5, 22, 4.2, HAT, 2);                                          // aba
blob(9.5, 0.5, 13.5, 7, HAT, 3);                                      // copa
rect(9.8, 5, 12.9, 1.4, "l"); rect(9.8, 5, 12.9, 0.5, "L");           // fita de couro
rect(15, 4.8, 2, 2, "g");                                             // fivela do chapéu
// ---- detalhes extras (só no 64x64) ----
if (S === 2) {
  line(11.2, 8.8, 12.4, 10.2, "k"); px(12.9, 10.6, "k");               // rachadura no crânio
  for (const x of [13.5, 14.7, 15.9, 17.1, 18.3]) px(x, 17.1, "B");   // luz nos dentes
  px(12.4, 10.4, "e"); px(17.6, 10.4, "e"); px(13.6, 11.4, "e"); px(18.8, 11.4, "e");
  poly([[19.5, 5.2], [22.5, 1.8], [24, 3.6], [21.2, 5.6]], "r"); line(20, 5, 23.2, 2.4, "R"); // pena vermelha
  px(11, 1.8, "H"); px(12, 2.4, "H"); px(13, 2.2, "H");               // brilho do feltro
  px(14, 28.2, "k"); px(17.2, 28.2, "k");                              // juntas dos joelhos
  px(11.6, 30.6, "g"); px(19.6, 30.6, "g");                            // fivelas das botas
  line(7.4, 27.9, 10.8, 28, "k"); px(8.6, 26.4, "g");                  // costura e fecho da bolsa
  for (const [x, y] of [[6.9, 28.6], [7.7, 28.8], [8.5, 28.7]]) px(x, y, "b");   // dedos da mão esquerda
  px(26.4, 26.8, "b"); px(25, 27.1, "b");
  line(26.6, 8, 26.6, 20, "S" in keyOf ? "t" : "t");
}
for (let i = 0; i < shapes.length; i += 150) cmds.push({ name: "draw_shapes", input: { shapes: shapes.slice(i, i + 150), preview: false } });
writeFileSync(new URL(`./cmds-${N}.json`, import.meta.url), JSON.stringify(cmds));

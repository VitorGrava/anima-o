// RODADA 2: gradient (dither Bayer) para céu/sol/lago e polygon para montanhas
import { writeFileSync } from "node:fs";
const W = 320, H = 180;
let seed = 11; const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const names = ["s0","s1","s2","s3","s4","s5","s6","s7","sun","m1","m2","m3","mhi","hill","tree","tree2","tree3","g1","g2","g3","g4","gl","wood","wood2","roof","win","flower","flower2","dark","lk0","lk1","lk2","lk3"];
const hex = ["#2b1b4a","#4a2a6a","#7a3a82","#b04a86","#e0627a","#f58a5a","#fdb561","#ffe08a","#fff6c0","#5a4a8c","#463a78","#322e60","#8a6aa8","#26405a","#1d3a46","#14303a","#0f2530","#3f7a46","#2f6440","#58944c","#234a32","#8fbf5a","#7a4a2a","#5a3420","#8a2e3a","#ffd25a","#ff7aa8","#fff0a0","#1a1030","#5a3a7a","#7a4a86","#c4607e","#f0906a"];
const K = (n) => "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP"[names.indexOf(n)];
const cmds = [{ name: "set_canvas", input: { width: W, height: H } }, { name: "set_palette", input: { colors: names.map((n, i) => ({ key: K(n), hex: hex[i], name: n })) } }];
for (const l of ["ceu", "montanhas", "lago", "floresta", "campo", "casa", "detalhes"]) cmds.push({ name: "add_layer", input: { name: l } });
const draw = (layer, shapes) => { for (let i = 0; i < shapes.length; i += 150) cmds.push({ name: "draw_shapes", input: { layer, shapes: shapes.slice(i, i + 150), preview: false } }); };
const HZ = 100;
// céu: degradê com dither de cima (escuro) até o horizonte
draw("ceu", [{ type: "gradient", x: 0, y: 0, w: W, h: HZ, colors: ["s0","s1","s2","s3","s4","s5","s6","s7"].map(K), direction: "vertical", dither: "bayer4", suavidade: 0.7, ondas: 2 }]);
// sol: brilho radial que se dissolve no céu
draw("ceu", [{ type: "gradient", x: 150, y: 40, w: 120, h: 120, direction: "radial", cx: 210, cy: 96, r: 44, colors: [K("sun"), K("sun"), K("s7"), K("s6"), "."], dither: "bayer4", suavidade: 0.8 }]);
// cordilheira: terreno fractal em polígonos
const ridge = (base, amp, rough, seedv) => { seed = seedv; const pts = []; const N = 80; const off = []; for (let i = 0; i <= N; i++) off.push(0);
  const mid = (a, b, d) => { if (b - a < 2) return; const m = (a + b) >> 1; off[m] = (off[a] + off[b]) / 2 + (rnd() - 0.5) * d; mid(a, m, d * rough); mid(m, b, d * rough); };
  mid(0, N, amp); for (let i = 0; i <= N; i++) pts.push([Math.round((i * W) / N), Math.round(base + off[i])]); return pts; };
const mount = (base, amp, rough, seedv, color, bottom) => { const pts = ridge(base, amp, rough, seedv); return { type: "polygon", points: [...pts, [W, bottom], [0, bottom]], color: K(color) }; };
draw("montanhas", [mount(66, 46, 0.58, 3, "m1", HZ), mount(78, 30, 0.55, 9, "m2", HZ), mount(90, 18, 0.55, 21, "m3", HZ)]);
// lago: reflexo = céu invertido, com ondas
draw("lago", [{ type: "gradient", x: 0, y: HZ, w: W, h: 36, colors: ["s7","s6","s5","s4","s3","s2","s1"].map(K), direction: "vertical", dither: "bayer4", suavidade: 0.7, ondas: 3 }]);
// margem de floresta
const trees = []; for (let x = 170; x < 330; x += 7) { const h = Math.round(16 + rnd() * 18); const c = ["tree","tree2","tree3"][Math.floor(rnd()*3)]; trees.push({ type: "polygon", points: [[x, HZ + 2], [x + 4, HZ + 2 - h], [x + 8, HZ + 2]], color: K(c) }); } draw("floresta", trees);
// campo com degradê de grama
draw("campo", [{ type: "gradient", x: 0, y: 136, w: W, h: 44, colors: ["gl","g3","g1","g2","g4"].map(K), direction: "vertical", dither: "bayer4", suavidade: 0.7, ondas: 2 }]);
const mnt = [];
// casa
draw("casa", [{ type: "rect", x: 30, y: 128, w: 44, h: 28, color: K("wood"), filled: true }, { type: "polygon", points: [[24, 128], [52, 110], [80, 128]], color: K("roof") }, { type: "rect", x: 40, y: 138, w: 10, h: 18, color: K("wood2"), filled: true }, { type: "rect", x: 58, y: 136, w: 10, h: 10, color: K("win"), filled: true }]);
cmds.push({ name: "update_layer", input: { layer: "Base", delete: true } });
writeFileSync(new URL("./cmds.json", import.meta.url), JSON.stringify(cmds));

// RODADA 1 (linha de base): só draw_shapes existente (rect/ellipse/line/fill/pixels)
import { writeFileSync } from "node:fs";
const W = 320, H = 180;
let seed = 7; const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pal = {
  s0: "#2b1b4a", s1: "#4a2a6a", s2: "#7a3a82", s3: "#b04a86", s4: "#e0627a", s5: "#f58a5a", s6: "#fdb561", s7: "#ffe08a",
  sun: "#fff3b0", m1: "#4a3a7a", m2: "#3a3070", m3: "#2c2a5a", hill: "#26405a", tree: "#1d3a46", tree2: "#14303a",
  lake: "#6a4a8a", lake2: "#e0627a", lake3: "#f58a5a", g1: "#3f7a46", g2: "#2f6440", g3: "#58944c", g4: "#2a5236",
  wood: "#7a4a2a", wood2: "#5a3420", roof: "#8a2e3a", win: "#ffd25a", flower: "#ff7aa8", flower2: "#fff0a0", dark: "#1a1030",
};
const cmds = [{ name: "set_canvas", input: { width: W, height: H } },
  { name: "set_palette", input: { colors: Object.entries(pal).map(([name, hex], i) => ({ key: "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP"[i], hex, name })) } }];
const K = Object.fromEntries(Object.keys(pal).map((n, i) => [n, "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP"[i]]));
const layers = ["ceu", "montanhas", "lago", "floresta", "campo", "casa", "detalhes"];
for (const l of layers) cmds.push({ name: "add_layer", input: { name: l } });
const draw = (layer, shapes) => { for (let i = 0; i < shapes.length; i += 190) cmds.push({ name: "draw_shapes", input: { layer, shapes: shapes.slice(i, i + 190), preview: false } }); };
const rect = (x, y, w, h, c) => ({ type: "rect", x, y, w, h, color: K[c], filled: true });
const ell = (x, y, w, h, c) => ({ type: "ellipse", x, y, w, h, color: K[c], filled: true });
// céu em faixas
const sky = ["s0", "s0", "s1", "s1", "s2", "s2", "s3", "s3", "s4", "s5", "s6", "s7"];
draw("ceu", sky.map((c, i) => rect(0, i * 8, W, 8, c)));
draw("ceu", [ell(188, 70, 44, 44, "sun")]);
// montanhas por colunas
const ridge = (base, amp, step, c, layer) => { const sh = []; let y = base; for (let x = 0; x < W; x += step) { y += (rnd() - 0.5) * amp; y = Math.max(base - amp * 3, Math.min(base + amp * 2, y)); sh.push(rect(x, Math.round(y), step, Math.max(1, 100 - Math.round(y)), c)); } draw(layer, sh); };
ridge(70, 10, 4, "m1", "montanhas"); ridge(82, 8, 4, "m2", "montanhas"); ridge(92, 6, 4, "m3", "montanhas");
// lago
draw("lago", [rect(0, 100, W, 34, "lake"), rect(0, 112, W, 6, "lake2"), rect(0, 122, W, 6, "lake3")]);
// floresta (elipses)
const trees = []; for (let x = 150; x < 320; x += 9) { const h = Math.round(18 + rnd() * 12); trees.push(ell(x, 108 - h + 12, 12, h, rnd() < 0.5 ? "tree" : "tree2")); } draw("floresta", trees);
// campo
draw("campo", [rect(0, 132, W, 48, "g1"), rect(0, 150, W, 30, "g2"), rect(0, 165, W, 15, "g4")]);
const grass = []; for (let i = 0; i < 160; i++) grass.push({ type: "pixels", points: [[Math.floor(rnd() * W), 134 + Math.floor(rnd() * 46)]], color: K[rnd() < 0.5 ? "g3" : "g4"] }); draw("campo", grass);
// casa
draw("casa", [rect(30, 128, 44, 28, "wood"), rect(26, 118, 52, 12, "roof"), rect(40, 138, 10, 18, "wood2"), rect(58, 136, 10, 10, "win")]);
// flores
const fl = []; for (let i = 0; i < 40; i++) fl.push({ type: "pixels", points: [[Math.floor(rnd() * W), 150 + Math.floor(rnd() * 28)]], color: K[rnd() < 0.5 ? "flower" : "flower2"] }); draw("detalhes", fl);
cmds.push({ name: "update_layer", input: { layer: "Base", delete: true } });
writeFileSync(new URL("./cmds.json", import.meta.url), JSON.stringify(cmds));

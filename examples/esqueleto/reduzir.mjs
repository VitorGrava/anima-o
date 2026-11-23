// reduz um projeto 2x por MAIORIA de cor em cada bloco 2x2, com desempate pela cor mais escura (preserva o contorno)
import { register } from "tsx/esm/api"; register();
import { readFileSync, writeFileSync } from "node:fs";
const eng = await import("../../src/engine/index.ts");
const [, , inFile, outCmds] = process.argv;
const p = eng.fromJSON(JSON.parse(readFileSync(inFile, "utf8")));
const flat = eng.flattenFrame(p, 0), W = p.width, H = p.height;
const lum = (i) => { const h = p.palette[i - 1].hex; return parseInt(h.slice(1, 3), 16) * 0.3 + parseInt(h.slice(3, 5), 16) * 0.59 + parseInt(h.slice(5, 7), 16) * 0.11; };
const rows = [];
for (let y = 0; y < H; y += 2) { let row = ""; for (let x = 0; x < W; x += 2) {
  const cnt = new Map(); for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const v = flat[(y + dy) * W + x + dx]; cnt.set(v, (cnt.get(v) ?? 0) + 1); }
  let best = 0, bn = -1; for (const [v, n] of cnt) { if (n > bn || (n === bn && v && (!best || lum(v) < lum(best)))) { best = v; bn = n; } }
  if (best === 0 && cnt.size > 1 && bn <= 2) { const solid = [...cnt].filter(([v]) => v).sort((a, b) => b[1] - a[1] || lum(a[0]) - lum(b[0]))[0]; if (solid && solid[1] >= 2) best = solid[0]; }
  row += best ? p.palette[best - 1].key : "."; } rows.push(row); }
writeFileSync(outCmds, JSON.stringify([{ name: "set_palette", input: { colors: p.palette } }, { name: "draw_rows", input: { rows, preview: false } }]));

// Gera comandos para o slime 32x32, 8 frames. Uso: node gen.mjs saida.json
import { writeFileSync } from "node:fs";
const W = 32, H = 32, GROUND = 28; // última linha do corpo quando no chão

// pose: w,h (corpo com contorno), lift (px acima do chão), dx (deslocamento), eye: altura do olho, lean
const POSES = [
  { w: 20, h: 12, lift: 0, eye: 3 },               // 0 repouso
  { w: 25, h: 9, lift: 0, eye: 1 },                // 1 antecipação (amassa)
  { w: 14, h: 18, lift: 2, eye: 5 },               // 2 decolagem (estica)
  { w: 16, h: 16, lift: 8, eye: 4 },               // 3 subindo
  { w: 18, h: 14, lift: 11, eye: 3 },              // 4 apogeu (redondo)
  { w: 15, h: 17, lift: 6, eye: 4 },               // 5 caindo (estica)
  { w: 27, h: 8, lift: 0, eye: 1 },                // 6 pouso (amassa forte)
  { w: 18, h: 13, lift: 0, eye: 3 },               // 7 recupera (leve estica)
];
const DUR = [160, 170, 70, 80, 150, 70, 120, 100];

function grid() { return Array.from({ length: H }, () => Array(W).fill(".")); }

function bodyMask(p) {
  const m = grid().map((r) => r.map(() => false));
  const bottom = GROUND - p.lift;
  const top = bottom - p.h + 1;
  const cx = (W - 1) / 2; // centro
  const a = p.w / 2;
  // centro da elipse a 60% da altura (cúpula em cima, base achatada)
  const air = p.lift > 0;
  const bt = p.h * (air ? 0.5 : 0.62), bb = p.h - bt;
  const cy = top + bt - 0.5;
  for (let y = top; y <= bottom; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (x - cx) / a;
      const yy = y + 0.5 - (top + bt);
      let v;
      if (yy <= 0) v = dx * dx + (yy / bt) ** 2;           // cúpula
      else v = air ? dx * dx + (yy / bb) ** 2 : dx ** 4 + (yy / bb) ** 4;                    // base quadradinha arredondada
      if (v <= 1.0) m[y][x] = true;
    }
  }
  // tira pontas de 1 px (pixel sem vizinho em cima nem embaixo na borda)
  for (let y = top; y <= bottom; y++) for (let x = 0; x < W; x++) {
    if (!m[y][x]) continue;
    const l = m[y][x - 1], r = m[y][x + 1];
    if ((!l || !r) && !m[y - 1]?.[x] && !m[y + 1]?.[x]) m[y][x] = false;
  }
  return { m, top, bottom, cy };
}

function render(p) {
  const { m, top, bottom } = bodyMask(p);
  const g = grid();
  const inside = (x, y) => y >= 0 && y < H && x >= 0 && x < W && m[y][x];
  let minX = W, maxX = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (m[y][x]) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!m[y][x]) continue;
    const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
    if (edge) { g[y][x] = "0"; continue; }
    g[y][x] = "g";
  }
  // sombra: faixa de baixo (1–2 px) e lado direito embaixo
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (g[y][x] !== "g") continue;
    const below1 = g[y + 1]?.[x] === "0";
    const below2 = g[y + 2]?.[x] === "0" && p.h >= 12;
    const right1 = g[y][x + 1] === "0";
    const relY = (y - top) / (bottom - top);
    if (below1) g[y][x] = "d";
    else if (below2) g[y][x] = "d";
    else if (right1 && relY > 0.45) g[y][x] = "d";
  }
  // tom mais fundo no canto de baixo à direita
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (g[y][x] !== "d") continue;
    if (g[y + 1]?.[x] === "0" && g[y][x + 1] === "0") g[y][x] = "t";
    else if (g[y + 1]?.[x] === "0" && x > (minX + maxX) / 2 + p.w * 0.25) g[y][x] = "t";
  }
  // luz: crescente fino (1 px) colado ao contorno, só no quarto de cima-esquerda; + um ponto de brilho
  const cxm = (minX + maxX) / 2;
  const snap = g.map((r) => r.slice());
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (snap[y][x] !== "g") continue;
    const up = snap[y - 1]?.[x] === "0", left = snap[y][x - 1] === "0";
    const relY = (y - top) / (bottom - top);
    const relX = (x - minX) / (maxX - minX);
    if ((up && relX < 0.55) || (left && relY < 0.45)) g[y][x] = "y";
  }
  // brilho: engrossa o crescente para dentro (1 px) nas linhas de cima, no terço esquerdo
  { const snap2 = g.map((r) => r.slice());
    for (let y = top + 1; y <= top + 2; y++) for (let x = minX; x < maxX; x++) {
      const relX = (x - minX) / (maxX - minX);
      if (snap2[y][x] === "y" && snap2[y][x + 1] === "g" && relX < 0.35) g[y][x + 1] = "y";
    } }
  // olhos: dois traços verticais à esquerda do centro (rosto em 3/4)
  const eyeTop = Math.round(top + (bottom - top) * 0.38);
  const ex1 = Math.round(cxm - p.w * 0.16), ex2 = ex1 + 3;
  if (p.eye === 1) { for (const ex of [ex1 - 1, ex2]) for (let k = 0; k < 2; k++) if (g[eyeTop]?.[ex + k] === "g") g[eyeTop][ex + k] = "e"; }
  else for (const ex of [ex1, ex2]) for (let k = 0; k < p.eye; k++) if (g[eyeTop + k]?.[ex] && g[eyeTop + k][ex] !== "0") g[eyeTop + k][ex] = "e";
  return g;
}

function shadow(p) {
  const g = grid();
  const sw = Math.max(6, Math.round(p.w - p.lift * 0.9));
  const cx = (W - 1) / 2;
  const y = GROUND + 1;
  for (let x = 0; x < W; x++) {
    const d = Math.abs(x - cx);
    if (d <= sw / 2) g[y][x] = "s";
    if (d <= sw / 2 - 2) g[y + 1][x] = "s";
  }
  return g;
}
const rowsOf = (g) => { const r = g.map((l) => l.join("")); for (const l of r) if (l.length !== W) throw new Error("largura " + l.length); if (r.length !== H) throw new Error("altura"); return r; };

const cmds = [
  { name: "set_palette", input: { colors: [
    { key: "0", hex: "#3e3546", name: "contorno" },
    { key: "y", hex: "#fbff86", name: "luz" },
    { key: "g", hex: "#91db69", name: "verde" },
    { key: "d", hex: "#1ebc73", name: "verde-sombra" },
    { key: "t", hex: "#0b8a8f", name: "sombra-funda" },
    { key: "e", hex: "#0b5e65", name: "olho" },
    { key: "s", hex: "#625468", name: "sombra-chao" },
  ] } },
  { name: "add_frames", input: { count: 7 } },
  { name: "add_layer", input: { name: "Slime" } },
];
POSES.forEach((p, i) => {
  cmds.push({ name: "draw_rows", input: { frames: i, layer: "Sombra", rows: rowsOf(shadow(p)), preview: false } });
  cmds.push({ name: "draw_rows", input: { frames: i, layer: "Slime", rows: rowsOf(render(p)), preview: false } });
});
// ação secundária: respingos no pouso (camada por cima)
cmds.push({ name: "add_layer", input: { name: "Gotas" } });
const drop = (g, x, y, big) => { const pat = big ? [".0.", "0g0", "0d0", ".0."] : ["0", "0"]; pat.forEach((r, j) => [...r].forEach((c, i) => { if (c !== ".") g[y + j][x + i] = c; })); };
{ const g6 = grid(); drop(g6, 1, 17, true); drop(g6, 28, 16, true);
  cmds.push({ name: "draw_rows", input: { frames: 6, layer: "Gotas", rows: rowsOf(g6), preview: false } });
  const g7 = grid(); drop(g7, 0, 24, true); drop(g7, 29, 23, true);
  cmds.push({ name: "draw_rows", input: { frames: 7, layer: "Gotas", rows: rowsOf(g7), preview: false } }); }
cmds.push({ name: "set_frame_timing", input: { frames: "all", duration_ms: DUR } });
writeFileSync(process.argv[2], JSON.stringify(cmds));
POSES.forEach((p, i) => { console.log("frame", i, "area", p.w * p.h); console.log(rowsOf(render(p)).filter((r) => /[^.]/.test(r)).join("\n")); });

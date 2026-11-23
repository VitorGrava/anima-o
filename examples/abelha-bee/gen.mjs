// gera comandos para a abelha 64x64
import { writeFileSync } from "node:fs";
const W = 64, H = 64, N = 12;
const pal = [
  ["o", "#3b2014", "contorno-escuro"],
  ["h", "#8a4a22", "cabelo"], ["H", "#5a2e18", "cabelo-sombra"], ["L", "#b86a34", "cabelo-luz"],
  ["s", "#f2b36a", "pele"], ["S", "#d98a4c", "pele-sombra"], ["K", "#fbd39a", "pele-luz"], ["Q", "#a85a30", "pele-contorno"],
  ["v", "#f4b81c", "colete"], ["V", "#c88410", "colete-sombra"], ["Y", "#ffdc66", "colete-luz"], ["U", "#8a560c", "colete-contorno"],
  ["a", "#f6a23a", "abdomen"], ["A", "#d27820", "abdomen-sombra"], ["l", "#ffc872", "abdomen-luz"], ["b", "#8a4a1c", "listra"], ["B", "#6a3414", "listra-sombra"], ["X", "#4a2410", "abdomen-contorno"],
  ["w", "#eef8fa", "asa"], ["W", "#bcd8e0", "asa-sombra"], ["z", "#7a98a8", "asa-contorno"],
  ["e", "#ffffff", "olho-branco"], ["i", "#7a4220", "iris"], ["p", "#24120a", "pupila"],
  ["m", "#9a2e2e", "boca"], ["t", "#fff4e8", "dente"], ["c", "#f08a64", "bochecha"],
  ["n", "#d27428", "antena"],
];
const lay = ["contorno", "asa", "corpo", "cabeca", "bracos"];
const outlineOf = { h: "H", H: "o", L: "H", s: "Q", S: "Q", K: "Q", Q: "o", v: "U", V: "U", Y: "U", U: "o", a: "X", A: "X", l: "X", b: "X", B: "o", X: "o", w: "z", W: "z", z: "z", e: "Q", i: "o", p: "o", m: "o", t: "Q", c: "Q", n: "H" };
const mk = () => Object.fromEntries(lay.map((l) => [l, Array.from({ length: H }, () => Array(W).fill("."))]));
const put = (g, x, y, ch) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < W && y < H) g[y][x] = ch; };
// luz de cima-esquerda
const tone = (nx, ny, set) => { const f = -nx * 0.6 - ny * 0.7; return f > 0.55 ? set[2] : f < -0.35 ? set[0] : set[1]; };
function ell(g, cx, cy, rx, ry, set) {
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
    const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
    if (nx * nx + ny * ny <= 1) put(g, x, y, typeof set === "string" ? set : tone(nx, ny, set));
  }
}
function cap(g, x1, y1, x2, y2, r1, r2, set) {
  const dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy || 1;
  const R = Math.max(r1, r2) + 1;
  for (let y = Math.floor(Math.min(y1, y2) - R); y <= Math.ceil(Math.max(y1, y2) + R); y++) for (let x = Math.floor(Math.min(x1, x2) - R); x <= Math.ceil(Math.max(x1, x2) + R); x++) {
    const px = x + 0.5, py = y + 0.5;
    let t = ((px - x1) * dx + (py - y1) * dy) / L2; t = Math.max(0, Math.min(1, t));
    const cx = x1 + dx * t, cy = y1 + dy * t, r = r1 + (r2 - r1) * t;
    const d = Math.hypot(px - cx, py - cy);
    if (d <= r) put(g, x, y, typeof set === "string" ? set : tone((px - cx) / r, (py - cy) / r, set));
  }
}
const SK = ["S", "s", "K"], HR = ["H", "h", "L"], VE = ["V", "v", "Y"], AB = ["A", "a", "l"], WG = ["W", "w", "w"];
function frame(t) {
  const L = mk();
  const ph = (2 * Math.PI * t) / N;
  const bob = Math.round(Math.sin(ph) * 0.9 + 0.2);        // respira: sobe/desce 1 px
  const sway = Math.sin(ph * 2);                            // aceno: duas idas e vindas por ciclo
  const flap = Math.sin(ph * 4) ;                           // asas batem rápido
  const lag = Math.sin(ph - 0.9);                           // antenas atrasadas (follow-through)
  const blink = t === 8;
  // asas (atrás)
  const wf = flap * 1.6;
  cap(L.asa, 24, 33 + bob, 11 - wf, 46 + wf * 0.5, 2, 5.2, WG);
  cap(L.asa, 36, 33 + bob, 50 + wf, 44 + wf * 0.5, 2, 5, WG);
  // abdômen listrado
  const ab = L.corpo;
  ell(ab, 30, 47 + bob * 0.5, 8.6, 9, AB);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (ab[y][x] === "." ) continue;
    const bandY = y - (47 + Math.round(bob * 0.5));
    if (bandY >= -1 && bandY <= 0) ab[y][x] = ab[y][x] === "l" ? "b" : (ab[y][x] === "A" ? "B" : "b");
    if (bandY >= 4 && bandY <= 5) ab[y][x] = ab[y][x] === "A" ? "B" : "b";
  }
  // pernas
  cap(ab, 27, 54.5, 27, 61, 1.7, 1.5, SK); cap(ab, 33, 54.5, 33, 61, 1.7, 1.5, SK);
  ell(ab, 26.3, 62, 2.6, 1.3, SK); ell(ab, 34, 62, 2.6, 1.3, SK);
  // tronco / colete
  ell(ab, 30, 34.5 + bob, 7.4, 7, VE);
  ell(ab, 30, 29.5 + bob, 2.6, 2, SK);                      // pescoço
  // cabeça
  const hd = L.cabeca, hy = 17 + bob;
  ell(hd, 30, hy, 13, 12.2, HR);                            // cabelo (volume de trás)
  cap(hd, 18.8, hy + 2, 19.5, hy + 14.5, 3.2, 2.4, HR);
  cap(hd, 41.2, hy + 2, 40.5, hy + 14.5, 3.2, 2.4, HR);
  ell(hd, 30, hy + 2.6, 9.7, 9, SK);                        // rosto
  // franja: cobre a testa com recorte irregular
  for (let y = hy - 12; y <= hy + 3; y++) for (let x = 15; x <= 45; x++) {
    const nx = (x + 0.5 - 30) / 12.3, ny = (y + 0.5 - (hy - 1)) / 10;
    if (nx * nx + ny * ny > 1) continue;
    const edge = hy - 0.5 + 3.4 * Math.abs((x - 30) / 11) ** 1.5 + (x % 3 === 0 ? 0.8 : 0) + (x < 30 ? 0 : 0.4);
    if (y < edge) put(hd, x, y, ((x - 30) * 0.6 + (y - hy) * 0.8) < -6 ? "L" : y > edge - 1.6 ? "H" : "h");
  }
  // olhos
  for (const ex of [25.3, 34.7]) {
    if (blink) { cap(hd, ex - 2, hy + 3.6, ex + 2, hy + 3.6, 0.5, 0.5, "p"); continue; }
    ell(hd, ex, hy + 3.4, 2.6, 3.4, "e");
    ell(hd, ex + 0.3, hy + 3.9, 1.9, 2.6, "i");
    ell(hd, ex + 0.3, hy + 4.0, 1.0, 1.5, "p");
    put(hd, ex - 0.8, hy + 2.4, "e");
    cap(hd, ex - 2.8, hy + 0.1, ex + 2.4, hy - 0.3, 0.55, 0.55, "p");   // cílio/sobrancelha escura
  }
  put(hd, 21.5, hy + 8, "c"); put(hd, 22.5, hy + 8, "c"); put(hd, 38.5, hy + 8, "c"); put(hd, 37.5, hy + 8, "c");
  // sorriso aberto
  for (const [x, y] of [[27, 7.2], [28, 8.2], [29, 8.6], [30, 8.6], [31, 8.6], [32, 8.2], [33, 7.2]]) put(hd, x, hy + y, "m");
  for (const x of [28, 29, 30, 31, 32]) put(hd, x, hy + 9.2, "m");
  put(hd, 29, hy + 8.2, "t"); put(hd, 30, hy + 8.2, "t"); put(hd, 31, hy + 8.2, "t");
  // antenas
  const a1 = lag * 1.8;
  cap(hd, 25, hy - 9.6, 22 + a1 * 0.5, hy - 12.2, 0.8, 0.8, "n"); cap(hd, 22 + a1 * 0.5, hy - 12.2, 19.5 + a1, hy - 13.8, 0.8, 0.8, "n");
  ell(hd, 19.4 + a1, hy - 14.2, 1.7, 1.7, "n");
  cap(hd, 35, hy - 9.6, 38 - a1 * 0.5, hy - 12.2, 0.8, 0.8, "n"); cap(hd, 38 - a1 * 0.5, hy - 12.2, 40.5 - a1, hy - 13.8, 0.8, 0.8, "n");
  ell(hd, 40.6 - a1, hy - 14.2, 1.7, 1.7, "n");
  // braço na cintura (direita do desenho)
  const br = L.bracos;
  cap(br, 36.5, 31 + bob, 42, 36.5 + bob, 1.9, 1.7, SK);
  cap(br, 42, 36.5 + bob, 36.6, 41.4 + bob, 1.7, 1.5, SK);
  ell(br, 35.6, 41.8 + bob, 2.2, 2, SK);
  // braço acenando (esquerda do desenho): ombro -> cotovelo fixo-ish -> mão que balança
  const sx = 23.8, sy = 31 + bob, ex = 17.8 + sway * 0.8, ey = 32.6 + bob;
  const hx = 15.6 + sway * 3.2, hy2 = 21.5 + bob - Math.abs(sway) * 0.9;
  cap(br, sx, sy, ex, ey, 1.9, 1.8, SK);
  cap(br, ex, ey, hx, hy2 + 2.2, 1.8, 1.5, SK);
  ell(br, hx, hy2, 2.6, 3.1, SK);
  cap(br, hx - 2.4, hy2 + 0.2, hx - 3.4 - sway * 0.4, hy2 - 2.4, 0.9, 0.7, SK);   // dedos
  cap(br, hx + 0.2, hy2 - 2.6, hx + 0.6 + sway * 0.4, hy2 - 5, 0.9, 0.7, SK);
  cap(br, hx + 2, hy2 - 1.8, hx + 3.6 + sway * 0.4, hy2 - 3.8, 0.9, 0.7, SK);
  return L;
}
function withOutline(L) {
  // contorno seletivo: 1 px externo no tom escuro do material vizinho (a camada de cima manda)
  const flat = Array.from({ length: H }, () => Array(W).fill("."));
  for (const l of lay) if (l !== "contorno") for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (L[l][y][x] !== ".") flat[y][x] = L[l][y][x];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (flat[y][x] !== ".") continue;
    let best = null;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { const c = flat[y + dy]?.[x + dx]; if (c && c !== ".") { if (best === null || "oHXUQ".includes(c) === false) best = c; } }
    if (best) L.contorno[y][x] = outlineOf[best] ?? "o";
  }
  return L;
}
const cmds = [
  { name: "set_palette", input: { colors: pal.map(([key, hex, name]) => ({ key, hex, name })) } },
  ...lay.filter((l) => l !== "contorno").map((name) => ({ name: "add_layer", input: { name } })),
  { name: "add_frames", input: { count: N - 1 } },
];
// camadas: Base renomeada em contorno via update_layer? usamos a camada existente "Base" como contorno
for (let t = 0; t < N; t++) {
  const L = withOutline(frame(t));
  for (const l of lay) cmds.push({ name: "draw_rows", input: { frames: t, layer: l === "contorno" ? "Base" : l, rows: L[l].map((r) => r.join("")) } });
}
cmds.push({ name: "update_layer", input: { layer: "Base", name: "contorno" } });
cmds.push({ name: "set_frame_timing", input: { frames: "all", duration_ms: [110, 100, 100, 110, 110, 100, 100, 110, 150, 100, 100, 110] } });
writeFileSync(new URL("./cmds.json", import.meta.url), JSON.stringify(cmds));

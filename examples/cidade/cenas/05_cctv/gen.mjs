// Cena 05 — vista da câmera de segurança (27–32,2 s, 62 quadros).
// Piso em perspectiva visto do alto, pessoinhas livres; depois surgem linhas amarelas tracejadas e grades
// que transformam o piso num trajeto em serpentina. HUD "CAM 07 - PISO 1" e relógio contando.
import { gerar, W, H } from "../../lib/comum.mjs";
import { PALETA, addFrames, cmd, shapes, rows, rect, line, texto, px, pessoa, cores, passo } from "../_shopping.mjs";

const ID = "05_cctv", N = 62;
const c = [];
c.push(cmd("set_palette", { colors: PALETA }));
c.push(cmd("update_layer", { layer: "Base", rename: "piso" }));
for (const n of ["linhas", "gente", "grades", "vinheta", "hud"]) c.push(cmd("add_layer", { name: n }));

// ---------- piso em perspectiva ----------
const HZ = 106, VX = 90, VY = 30; // borda de trás do piso e ponto de fuga
const S = [];
S.push(rect(0, 0, W, H, "d"));
S.push({ type: "gradient", x: 0, y: 0, w: W, h: HZ, colors: ["e", "d", "c"], dither: "bayer4", suavidade: 0.4 });
// faixa de lojas lá no fundo
const fx0 = 26, cores8 = ["R", "t", "J", "y", "m", "R", "z", "J", "y"];
cores8.forEach((cc, k) => S.push(rect(fx0 + k * 14, 88, 13, 4, cc)));
S.push(rect(fx0, 92, 126, 1, "f"));
S.push(rect(110, 93, 24, 8, "z"), texto("SAÍDA", 122, 95, "w", { alinhar: "centro" }));
// piso: trapézio
const piso = [[22, HZ], [158, HZ], [W, HZ + 14], [W, H], [0, H], [0, HZ + 14]];
S.push({ type: "polygon", points: piso, color: "e" });
S.push(line(22, HZ, 157, HZ, "f"), line(22, HZ, 0, HZ + 14, "e"), line(158, HZ, W - 1, HZ + 14, "e"));
// rejunte em perspectiva: linhas que fogem para (VX, VY) e horizontais cada vez mais espaçadas
for (let k = -9; k <= 9; k++) {
  const xb = 22 + ((k + 9) * 136) / 18; // na borda de trás
  const t = (H - HZ) / (HZ - VY);
  const xf = xb + (xb - VX) * t;
  S.push(line(Math.round(xb), HZ + 1, Math.round(xf), H, "j"));
}
for (let y = HZ + 6, d = 6; y < H; d *= 1.32, y += Math.round(d)) S.push(line(0, y, W, y, "j"));
c.push(shapes("piso", 0, S));
c.push(addFrames(N - 1, 0));

// vinheta de lente (bordas escuras) e moldura da câmera — fixas
c.push(shapes("vinheta", "all", [{ type: "gradient", x: 0, y: 0, w: W, h: H, colors: [".", ".", ".", ".", "f", "g"], direction: "radial", cx: 90, cy: 160, r: 220, dither: "bayer4", suavidade: 0.3 }]));
const canto = (x, y, sx, sy) => [line(x, y, x + 8 * sx, y, "M"), line(x, y, x, y + 8 * sy, "M")];
c.push(shapes("hud", "all", [...canto(3, 3, 1, 1), ...canto(176, 3, -1, 1), ...canto(3, 316, 1, -1), ...canto(176, 316, -1, -1)]));
c.push(shapes("hud", "all", [texto("CAM 07 - PISO 1", 14, 8, "M", { sombra: "h" })]));
for (let q = 0; q < N; q++) {
  const s = 7 + Math.floor(q / 12);
  const L = [texto(`14:32:${String(s).padStart(2, "0")}`, 172, 8, "M", { alinhar: "direita", sombra: "h" })];
  if (q % 12 < 7) L.push(rect(8, 9, 3, 3, "R"));
  c.push(shapes("hud", q, L));
}

// ---------- pessoas ----------
// tamanho pela profundidade: longe (pés < 150), meio (< 200), perto
const tamDe = (y) => (y < 150 ? "longe" : y < 196 ? "meio" : "perto");
const altDe = { longe: 7, meio: 12, perto: 18 }, largDe = { longe: 3, meio: 5, perto: 7 };
const velDe = { longe: 0.3, meio: 0.5, perto: 0.8 };
function desenhaPessoas(lista, q, t) {
  for (const p of lista) {
    const tam = tamDe(p.y), v = velDe[tam] * (p.v ?? 1);
    let x = p.x + p.dir * v * t;
    if (p.ate !== undefined && (p.dir > 0 ? x > p.ate : x < p.ate)) continue;
    const r = pessoa({ tam, frame: passo(q, p.i, tam === "longe" ? 4 : 3), dir: p.dir, ...cores(p.i) });
    c.push(rows("gente", q, Math.round(x) - (largDe[tam] >> 1), p.y - altDe[tam] + 1, r));
  }
}
const livres = [
  { x: 40, y: 118, dir: 1, i: 0 }, { x: 128, y: 114, dir: -1, i: 1 }, { x: 70, y: 126, dir: 1, i: 2 }, { x: 140, y: 130, dir: -1, i: 3 },
  { x: 60, y: 146, dir: 1, i: 4 }, { x: 96, y: 152, dir: -1, i: 5 }, { x: 110, y: 160, dir: 1, i: 6 }, { x: 74, y: 166, dir: -1, i: 7 },
  { x: 120, y: 182, dir: -1, i: 8 }, { x: 30, y: 176, dir: 1, i: 9 }, { x: 100, y: 214, dir: 1, i: 10, v: 0.8 }, { x: 150, y: 228, dir: -1, i: 11, v: 0.6 },
  { x: 100, y: 138, dir: 1, i: 12 }, { x: 20, y: 198, dir: 1, i: 13 }, { x: 150, y: 120, dir: -1, i: 14 }, { x: 50, y: 134, dir: -1, i: 15 },
  { x: 140, y: 172, dir: -1, i: 16 }, { x: 46, y: 222, dir: 1, i: 17, v: 0.7 },
];
// trajetos em serpentina (depois das grades): faixa por faixa, sentidos alternados
const RAILS = [ // y do piso, x inicial, x final
  { y: 128, a: 8, b: 150 }, { y: 150, a: 30, b: 176 }, { y: 180, a: 4, b: 150 }, { y: 214, a: 30, b: 180 },
];
const faixas = [
  { y: 139, dir: 1 }, { y: 165, dir: -1 }, { y: 197, dir: 1 }, { y: 230, dir: -1 },
];
const fila = [];
faixas.forEach((f, k) => {
  for (let j = 0; j < (k < 2 ? 4 : 3); j++) fila.push({ x: f.dir > 0 ? 10 + j * 38 + k * 7 : 170 - j * 40 - k * 5, y: f.y, dir: f.dir, i: 20 + k * 4 + j, v: 0.9 });
});
const TROCA = 38;
for (let q = 0; q < N; q++) {
  if (q < TROCA) desenhaPessoas(livres, q, q);
  else desenhaPessoas(fila, q, q - TROCA);
}

// ---------- linhas amarelas tracejadas (crescem da esquerda) e grades ----------
function tracejado(x1, y1, x2, y2, frac) {
  const n = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
  const pts = [];
  for (let i = 0; i <= n * frac; i++) if (i % 5 < 3) pts.push([Math.round(x1 + ((x2 - x1) * i) / n), Math.round(y1 + ((y2 - y1) * i) / n)]);
  return pts;
}
const caminho = [];
RAILS.forEach((r, k) => {
  caminho.push([r.a, r.y + 2, r.b, r.y + 2]);
  const prox = RAILS[k + 1];
  if (prox) {
    // ligação na ponta aberta (zigue-zague)
    const xEnd = k % 2 === 0 ? r.b + 10 : r.a - 10;
    caminho.push([xEnd, r.y + 2, xEnd + (k % 2 === 0 ? 6 : -6), prox.y + 2]);
  }
});
const L0 = 26, LDUR = 10;
for (let q = L0; q < N; q++) {
  const frac = Math.min(1, (q - L0 + 1) / LDUR);
  const pts = caminho.flatMap(([a, b, cc, d]) => tracejado(a, b, cc, d, frac));
  c.push(shapes("linhas", q, [px(pts, "y")]));
}
const G0 = 34;
for (let q = G0; q < N; q++) {
  const cresc = Math.min(1, (q - G0 + 1) / 6);
  const G = [];
  RAILS.forEach((r) => {
    const alt = Math.max(2, Math.round((3 + (r.y - HZ) / 14) * cresc));
    const passoX = r.y < 140 ? 10 : r.y < 170 ? 13 : 16;
    for (let x = r.a; x <= r.b; x += passoX) G.push(line(x, r.y - alt, x, r.y, "i"));
    G.push(line(r.a, r.y - alt, r.b, r.y - alt, "i"));
    if (r.y > 170 && cresc === 1) G.push(line(r.a, r.y - alt + 1, r.b, r.y - alt + 1, "h"));
    // ponto vermelho no topo do poste da ponta (fita retrátil)
    if (cresc === 1) G.push(px([[r.b, r.y - alt - 1], [r.a, r.y - alt - 1]], "R"));
  });
  c.push(shapes("grades", q, G));
}

// tom frio de imagem de câmera
c.push(cmd("transform", { layer: "piso", frames: "all", op: "haze", color: "N", quantidade: 0.3 }));
c.push(cmd("transform", { layer: "gente", frames: "all", op: "haze", color: "N", quantidade: 0.25 }));
gerar({ nome: ID, comandos: c.flat(), quadros: N, saida: `examples/cidade/cenas/${ID}` });
console.log("ok", ID, N);

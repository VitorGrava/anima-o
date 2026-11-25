// Cena 06 — sala de monitores (32,2–35,3 s, 37 quadros).
// Sala escura azul-petróleo, parede de monitores com imagens das câmeras (pessoinhas andando entre grades),
// retângulo vermelho de rastreio seguindo uma pessoa, vigia de costas em primeiro plano; leve zoom (redesenho por quadro).
import { gerar, W, H } from "../../lib/comum.mjs";
import { PALETA, addFrames, cmd, shapes, rows, rect, line, texto, px, pessoa, cores, passo } from "../_shopping.mjs";

const ID = "06_monitores", N = 37;
const c = [];
c.push(cmd("set_palette", { colors: PALETA }));
c.push(cmd("update_layer", { layer: "Base", rename: "sala" }));
for (const n of ["telas", "gente", "hud", "vigia"]) c.push(cmd("add_layer", { name: n }));
c.push(addFrames(N - 1, 0));

const CX = 90, CY = 120;
const ease = (t) => t * t * (3 - 2 * t);
const MON = [
  { x: 44, y: 74, w: 84, h: 52, cam: "07", seed: 1, rastreio: true }, { x: 44, y: 134, w: 84, h: 52, cam: "05", seed: 2 },
  { x: -44, y: 74, w: 80, h: 52, cam: "03", seed: 3 }, { x: -44, y: 134, w: 80, h: 52, cam: "02", seed: 4 },
  { x: 136, y: 74, w: 80, h: 52, cam: "09", seed: 5 }, { x: 136, y: 134, w: 80, h: 52, cam: "11", seed: 6 },
];

for (let q = 0; q < N; q++) {
  const k = 1 + 0.22 * ease(q / (N - 1));
  const T = (x, y) => [Math.round(CX + (x - CX) * k), Math.round(CY + (y - CY) * k)];
  const R = (x, y, w, h, color) => { const [a, b] = T(x, y), [cc, d] = T(x + w, y + h); return rect(a, b, cc - a, d - b, color); };
  // sala
  const SL = [rect(0, 0, W, H, "0"), { type: "gradient", x: 0, y: 0, w: W, h: 200, colors: ["0", "T", "T", "U"], dither: "bayer4", suavidade: 0.4 }];
  SL.push(R(-60, 64, 300, 132, "T"));
  for (const xx of [40, 132]) SL.push(R(xx - 1, 64, 2, 132, "0"));
  // mesa
  SL.push(R(-60, 196, 300, 3, "Y"), R(-60, 199, 300, 12, "U"), R(-60, 211, 300, 120, "0"));
  SL.push(R(116, 191, 6, 5, "c"), R(116, 195, 6, 1, "e"), R(60, 193, 40, 3, "h"));
  // brilho das telas na mesa
  SL.push(R(44, 196, 84, 1, "N"));
  c.push(shapes("sala", q, SL));

  // monitores
  const TL = [], GT = [];
  for (const m of MON) {
    const [x0, y0] = T(m.x, m.y), [x1, y1] = T(m.x + m.w, m.y + m.h);
    const w = x1 - x0, h = y1 - y0;
    TL.push(rect(x0 - 3, y0 - 3, w + 6, h + 6, "i"), rect(x0 - 2, y0 - 2, w + 4, h + 4, "h"), rect(x0, y0, w, h, "M"));
    // faixa de lojas no fundo da imagem
    for (let j = 0; j < 8; j++) TL.push(rect(x0 + 4 + Math.round((j * (w - 8)) / 8), y0 + 9, Math.max(1, Math.round((w - 8) / 8) - 1), 2, ["R", "t", "J", "y", "m", "R", "z", "y"][(j + m.seed) % 8]));
    TL.push(line(x0, y0 + 12, x1 - 1, y0 + 12, "N"));
    // grades e linhas amarelas em 3 faixas
    const faixas = [0.42, 0.66, 0.92].map((f) => y0 + Math.round(h * f));
    faixas.forEach((fy, j) => {
      const a = x0 + (j % 2 ? 10 : 2), b = x1 - (j % 2 ? 2 : 10);
      for (let xx = a; xx <= b; xx += 6) TL.push(line(xx, fy - 4, xx, fy, "h"));
      TL.push(line(a, fy - 4, b, fy - 4, "h"));
      const pts = [];
      for (let xx = a; xx <= b; xx++) if ((xx - a) % 5 < 3) pts.push([xx, fy + 1]);
      TL.push(px(pts, "y"));
    });
    // pessoinhas (3x7) entre as grades, sentidos alternados (serpentina)
    const lanes = [y0 + Math.round(h * 0.42) - 6, y0 + Math.round(h * 0.66) - 6, y0 + Math.round(h * 0.92) - 6];
    for (let j = 0; j < 7; j++) {
      const lane = j % 3, dir = lane % 2 ? -1 : 1;
      const span = w - 6;
      const base = ((m.seed * 37 + j * 23) % span) + (dir * q * 0.45);
      const xx = x0 + 2 + (((Math.round(base) % span) + span) % span);
      const ytop = lanes[lane] - 6 + (j % 2);
      const r = pessoa({ tam: "longe", frame: passo(q, j, 3), dir, ...cores(j + m.seed * 3) });
      GT.push(rows("gente", q, xx, ytop, r));
      if (m.rastreio && j === 4 && q >= 6) {
        // rastreio: caixa vermelha que pisca ao travar
        if (q > 10 || q % 2 === 0) TL.push(...[line(xx - 2, ytop - 2, xx + 4, ytop - 2, "R"), line(xx - 2, ytop + 8, xx + 4, ytop + 8, "R"), line(xx - 2, ytop - 2, xx - 2, ytop + 8, "R"), line(xx + 4, ytop - 2, xx + 4, ytop + 8, "R")]);
        if (q > 12) TL.push(line(xx + 5, ytop - 2, xx + 9, ytop - 6, "R"), texto("ID 0412", xx + 9, ytop - 11, "R"));
      }
    }
    // HUD de cada monitor
    TL.push(texto(`CAM ${m.cam}`, x0 + 3, y0 + 2, "g"));
    if ((q + m.seed * 3) % 12 < 7) TL.push(rect(x1 - 5, y0 + 2, 2, 2, "R"));
    // reflexo diagonal no vidro
    TL.push(line(x0 + w - 18, y0 + 1, x0 + w - 30, y0 + 13, "c"));
  }
  c.push(shapes("telas", q, TL));
  c.push(GT);

  // vigia de costas (silhueta) em primeiro plano, à esquerda — um pouco mais de zoom (paralaxe)
  const kv = 1 + 0.3 * ease(q / (N - 1));
  const V = (x, y) => [Math.round(30 + (x - 30) * kv), Math.round(236 + (y - 236) * kv)];
  const [hx, hy] = V(26, 186), rh = Math.round(13 * kv);
  const VG = [];
  const [sx0, sy0] = V(-30, 206), [sx1] = V(78, 206);
  VG.push({ type: "ellipse", x: sx0, y: sy0, w: sx1 - sx0, h: Math.round(80 * kv), color: "O", filled: true });
  VG.push({ type: "ellipse", x: sx0 + 6, y: sy0 + 2, w: sx1 - sx0 - 12, h: Math.round(20 * kv), color: "I", filled: true });
  VG.push({ type: "ellipse", x: sx0, y: sy0 + 6, w: sx1 - sx0, h: Math.round(80 * kv), color: "O", filled: true });
  VG.push(rect(hx - Math.round(6 * kv), hy + rh - 4, Math.round(12 * kv), Math.round(12 * kv), "4"));
  VG.push({ type: "ellipse", x: hx - rh, y: hy - rh, w: 2 * rh + 1, h: Math.round(2.1 * rh) + 1, color: "4", filled: true });
  VG.push({ type: "ellipse", x: hx - rh, y: hy - rh - 1, w: 2 * rh + 1, h: Math.round(1.3 * rh), color: "5", filled: true });
  // luz das telas no contorno da cabeça e do ombro (lado direito)
  VG.push({ type: "ellipse", x: hx - rh + 2, y: hy - rh + 1, w: 2 * rh + 1, h: Math.round(2.1 * rh) - 1, color: ".", filled: false });
  const rim = [];
  for (let a = -1.2; a <= 0.6; a += 0.08) rim.push([Math.round(hx + Math.cos(a) * rh), Math.round(hy + 2 + Math.sin(a) * rh)]);
  VG.push(px(rim, "Y"));
  VG.push(line(sx1 - 14, sy0 + 3, sx1 - 4, sy0 + 10, "J"));
  c.push(shapes("vigia", q, VG.filter((s) => s.type !== "ellipse" || s.filled)));
}

gerar({ nome: ID, comandos: c.flat(), quadros: N, saida: `examples/cidade/cenas/${ID}` });
console.log("ok", ID, N);

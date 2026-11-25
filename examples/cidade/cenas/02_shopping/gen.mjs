// Cena 02 — Fachada do shopping (azul/noite, letreiro SHOPPING, portas de vidro, segurança, placa ABERTO);
// homem de camiseta amarela entra pela esquerda e atravessa a porta; corte para mais perto; corte para o átrio:
// andares com lojas coloridas e escadas rolantes, a câmera sobe (tilt) pelos andares. 6–14,6 s = 103 quadros.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { W, H, FPS, PESSOA_PALETA, BLUSAS, pessoa, gerar } from "../../lib/comum.mjs";
import { Grade, addFrames } from "../01_praca/gen.mjs";

const QUADROS = 103;
const F_PERTO = 24;      // corte: fachada mais perto (homem entrando)
const F_DENTRO = 30;     // corte: átrio
const HI = 512;   // set_canvas aceita no máximo 512 (ATRITO)          // altura do mundo do átrio (a câmera mostra 320)
const BL = "abcdefgh";

const PALETA = [
  ...PESSOA_PALETA,
  ...BLUSAS.map((hex, i) => ({ key: BL[i], hex, name: `blusa${i + 1}` })),
  { key: "0", hex: "#161c28", name: "escuro" },
  { key: "i", hex: "#2a3448", name: "parede" },
  { key: "j", hex: "#36425a", name: "parede-luz" },
  { key: "k", hex: "#1f2738", name: "parede-sombra" },
  { key: "l", hex: "#eef2f6", name: "letreiro" },
  { key: "m", hex: "#c4ccd8", name: "letreiro-sombra" },
  { key: "n", hex: "#223456", name: "texto-azul" },
  { key: "o", hex: "#e6edf3", name: "luz-dentro" },
  { key: "p", hex: "#cfd9e3", name: "vidro-tinta" },
  { key: "q", hex: "#98a6b8", name: "caixilho" },
  { key: "r", hex: "#66748a", name: "caixilho-sombra" },
  { key: "s", hex: "#f0c4cc", name: "rosa-claro" },
  { key: "t", hex: "#c4dcee", name: "azul-claro" },
  { key: "u", hex: "#f2dea4", name: "amarelo-claro" },
  { key: "v", hex: "#cae4cf", name: "verde-claro" },
  { key: "w", hex: "#4c566c", name: "escada" },
  { key: "x", hex: "#2c3242", name: "escada-escura" },
  { key: "y", hex: "#fafcfd", name: "brilho" },
  { key: "z", hex: "#3a4356", name: "laje" },
  { key: "A", hex: "#5cd07a", name: "luz-verde" },
  { key: "B", hex: "#de5a8c", name: "beleza" },
  { key: "C", hex: "#e2c040", name: "joias" },
  { key: "D", hex: "#e8823e", name: "esporte" },
  { key: "E", hex: "#4ea062", name: "livros" },
  { key: "F", hex: "#d84a4a", name: "moda" },
  { key: "G", hex: "#3a9aa0", name: "calcados" },
  { key: "H", hex: "#8a6244", name: "cafe" },
  { key: "I", hex: "#fbeed6", name: "spot" },
  { key: "J", hex: "#bcc6d2", name: "piso" },
  { key: "K", hex: "#8894a6", name: "piso-sombra" },
  { key: "L", hex: "#5e9a44", name: "planta" },
  { key: "M", hex: "#3c6a34", name: "planta-escura" },
  { key: "N", hex: "#8cc060", name: "planta-luz" },
  { key: "O", hex: "#5a6478", name: "produto" },
  { key: "P", hex: "#7f8ba0", name: "produto-luz" },
];

const c = [];
const ds = (layer, shapes, frames = 0) => {
  for (let i = 0; i < shapes.length; i += 150) c.push({ name: "draw_shapes", input: { layer, frames, shapes: shapes.slice(i, i + 150), preview: false } });
};
const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

// ===================== FACHADA =====================
// desenhada numa escala k (1 = plano aberto; 1.35 = mais perto), centrada em (90, 150)
function fachada(k) {
  const X = (x) => Math.round(90 + (x - 90) * k), Y = (y) => Math.round(150 + (y - 150) * k);
  const R = (x, y, w, h, color, extra = {}) => ({ type: "rect", x: X(x), y: Y(y), w: Math.max(1, X(x + w) - X(x)), h: Math.max(1, Y(y + h) - Y(y)), color, ...extra });
  const s = [];
  s.push({ type: "rect", x: 0, y: 0, w: W, h: H, color: "i" });
  s.push({ type: "gradient", x: 0, y: 0, w: W, h: Y(60), colors: ["k", "i"], direction: "vertical", dither: "bayer4" });
  for (let x = -60; x < 240; x += 30) s.push({ type: "line", x1: X(x), y1: 0, x2: X(x), y2: Y(58), color: "k" });
  for (let y = 18; y < 58; y += 20) s.push({ type: "line", x1: 0, y1: Y(y), x2: W, y2: Y(y), color: "k" });
  // faixa branca do letreiro
  s.push(R(-20, 60, 220, 22, "l"));
  s.push(R(-20, 80, 220, 2, "m"));
  s.push({ type: "texto", texto: "SHOPPING", x: 91, y: Y(66), color: "n", escala: k > 1.2 ? 4 : 3, espaco: k > 1.2 ? 1 : 2, alinhar: "centro" });
  // marquise escura sobre as portas
  s.push(R(-20, 82, 220, 8, "0"));
  s.push({ type: "pixels", points: [[X(90), Y(85)], [X(90) + 1, Y(85)]], color: "A" });
  // vão envidraçado: interior claro
  s.push(R(6, 90, 168, 142, "o"));
  s.push(R(6, 90, 168, 8, "p"));
  s.push(R(14, 104, 22, 46, "s"), R(40, 106, 20, 44, "t"), R(66, 104, 22, 46, "u"), R(92, 106, 18, 44, "t"));
  for (const [x, w] of [[14, 22], [40, 20], [66, 22], [92, 18]]) s.push(R(x, 150, w, 2, "p"));
  // escada rolante ao fundo
  s.push({ type: "polygon", points: [[X(108), Y(176)], [X(118), Y(176)], [X(160), Y(118)], [X(160), Y(110)], [X(152), Y(110)]], color: "w" });
  s.push({ type: "line", x1: X(108), y1: Y(175), x2: X(152), y2: Y(110), color: "q" });
  // piso interno com o reflexo das luzes
  s.push(R(6, 176, 168, 56, "J"));
  s.push(R(6, 176, 168, 1, "p"));
  for (const cx of [40, 92, 140]) s.push({ type: "ellipse", x: X(cx - 22), y: Y(190), w: Math.round(44 * k), h: Math.round(22 * k), color: "p" });
  // caixilhos (os das portas são desenhados na camada "portas")
  for (const x of [6, 172]) s.push(R(x, 90, 3, 142, "q"));
  s.push(R(48, 90, 2, 142, "q"), R(130, 90, 2, 142, "q"));
  s.push(R(6, 229, 168, 3, "r"));
  // placa ABERTO
  s.push(R(12, 156, 24, 13, "y"));
  s.push({ type: "texto", texto: "ABERTO", x: X(24), y: Y(158), color: "n", alinhar: "centro" });
  s.push({ type: "texto", texto: "10H-22H", x: X(24), y: Y(164) + 1, color: "r", alinhar: "centro" });
  // calçada / piso de fora
  s.push(R(-40, 232, 260, 100, "x"));
  s.push(R(-40, 232, 260, 1, "w"));
  s.push(R(42, 235, 96, 4, "0"));
  s.push({ type: "gradient", x: 0, y: Y(250), w: W, h: H - Y(250), colors: ["x", "0"], direction: "vertical", dither: "bayer4" });
  return s;
}

/** folhas de vidro das portas; abre de 0 (fechada) a 1 (aberta) */
function portas(k, a) {
  const X = (x) => Math.round(90 + (x - 90) * k), Y = (y) => Math.round(150 + (y - 150) * k);
  const s = [], d = Math.round(38 * a);
  for (const [x0, sgn] of [[50, -1], [90, 1]]) {
    const x = x0 + sgn * d;
    s.push({ type: "rect", x: X(x), y: Y(92), w: X(x + 40) - X(x), h: Y(229) - Y(92), color: "p", filled: false });
    s.push({ type: "rect", x: X(x), y: Y(92), w: 2, h: Y(229) - Y(92), color: "q" });
    s.push({ type: "rect", x: X(x + 38), y: Y(92), w: 2, h: Y(229) - Y(92), color: "q" });
    s.push({ type: "line", x1: X(x + 8), y1: Y(130), x2: X(x + 26), y2: Y(100), color: "y" });
    s.push({ type: "line", x1: X(x + 10), y1: Y(134), x2: X(x + 30), y2: Y(100), color: "y" });
  }
  return s;
}

// ===================== ÁTRIO =====================
const LAJES = [126, 252, 378, 504];     // topo de cada laje (piso de cada andar), em y do mundo
const LOJAS = [
  ["BELEZA", "B", "s"], ["JOIAS", "C", "u"], ["ESPORTE", "D", "u"],
  ["LIVROS", "E", "v"], ["MODA", "F", "s"], ["CALÇADOS", "G", "t"],
  ["TECH", "G", "t"], ["CAFÉ", "H", "u"], ["JOIAS", "C", "s"],
  ["MODA", "F", "v"], ["BELEZA", "B", "t"], ["LIVROS", "E", "u"],
];
function atrio() {
  const s = [];
  s.push({ type: "rect", x: 0, y: 0, w: W, h: HI, color: "i" });
  LAJES.forEach((laje, andar) => {
    const top = laje - 120;
    // três lojas por andar (desencontradas de andar para andar)
    const off = [0, -14, 8, -6][andar];
    for (let j = 0; j < 3; j++) {
      const [nome, cor, fundo] = LOJAS[(andar * 3 + j) % LOJAS.length];
      const x = off + 4 + j * 62, w = 56;
      s.push({ type: "rect", x, y: top + 12, w, h: 120 - 16, color: fundo });
      s.push({ type: "rect", x, y: top + 12, w, h: 12, color: cor });
      s.push({ type: "texto", texto: nome, x: x + w / 2 + 1, y: top + 16, color: cor === "C" || cor === "D" ? "n" : "y", alinhar: "centro" });
      // spots e vitrine: produtos altos (cones) com luz de cima
      for (let p = 0; p < 2; p++) {
        const px = x + 12 + p * 22;
        s.push({ type: "polygon", points: [[px + 4, top + 34], [px + 8, top + 34], [px + 11, top + 92], [px + 1, top + 92]], color: "I" });
        s.push({ type: "rect", x: px, y: top + 62, w: 12, h: 30, color: p ? "O" : cor });
        s.push({ type: "rect", x: px, y: top + 62, w: 3, h: 30, color: p ? "P" : "y" });
        s.push({ type: "rect", x: px + 4, y: top + 26, w: 4, h: 2, color: "y" });
      }
      s.push({ type: "rect", x, y: top + 92, w, h: 12, color: "J" });
      s.push({ type: "rect", x, y: top + 92, w, h: 1, color: "K" });
      s.push({ type: "rect", x: x + w - 2, y: top + 24, w: 2, h: 80, color: "q" });
    }
    // laje + guarda-corpo de vidro
    s.push({ type: "rect", x: 0, y: laje - 12, w: W, h: 12, color: "t" });
    s.push({ type: "rect", x: 0, y: laje - 12, w: W, h: 1, color: "y" });
    for (let x = 6; x < W; x += 20) s.push({ type: "line", x1: x, y1: laje - 12, x2: x, y2: laje - 1, color: "q" });
    s.push({ type: "rect", x: 0, y: laje, w: W, h: 10, color: "z" });
    s.push({ type: "rect", x: 0, y: laje + 10, w: W, h: 2, color: "k" });
  });
  // vaso com planta no térreo, à esquerda
  s.push(...folhas(165, 488));
  s.push({ type: "rect", x: 154, y: 486, w: 22, h: 18, color: "x" });
  s.push({ type: "rect", x: 154, y: 486, w: 22, h: 2, color: "w" });
  // escadas rolantes diagonais (cada uma vence um andar)
  for (const e of ESCADAS) {
    const { x1, y1, x2, y2 } = e;
    s.push({ type: "polygon", points: [[x1, y1], [x2, y2], [x2, y2 + 12], [x1, y1 + 12]], color: "x" });
    s.push({ type: "polygon", points: [[x1, y1], [x2, y2], [x2, y2 + 4], [x1, y1 + 4]], color: "w" });
    s.push({ type: "line", x1, y1: y1 - 8, x2, y2: y2 - 8, color: "q" });
    s.push({ type: "line", x1, y1: y1 - 7, x2, y2: y2 - 7, color: "r" });
    for (let t = 0; t <= 1; t += 0.12) { const x = Math.round(x1 + (x2 - x1) * t), y = Math.round(y1 + (y2 - y1) * t); s.push({ type: "line", x1: x, y1: y - 7, x2: x, y2: y, color: "r" }); }
  }
  return s;
}
const ESCADAS = [
  { x1: 10, y1: 502, x2: 150, y2: 378 },
  { x1: 170, y1: 376, x2: 40, y2: 252 },
  { x1: 20, y1: 250, x2: 160, y2: 126 },
];

/** câmera do átrio (y do mundo na borda de cima): começa no térreo e sobe */
const camY = (f) => Math.round((HI - H) - ease((f - F_DENTRO) / (QUADROS - 1 - F_DENTRO)) * (HI - H - 10));

// ===================== MONTAGEM =====================
c.push({ name: "set_palette", input: { colors: PALETA } });
c.push({ name: "set_canvas", input: { width: W, height: HI } });
c.push({ name: "update_layer", input: { layer: "Base", name: "fundo" } });
for (const n of ["portas", "gente"]) c.push({ name: "add_layer", input: { name: n } });
addFrames(c, QUADROS - 1);
// fachada: plano aberto e plano perto
ds("fundo", fachada(1), { from: 0, to: F_PERTO - 1 });
ds("fundo", fachada(1.35), { from: F_PERTO, to: F_DENTRO - 1 });
for (let f = 0; f < F_DENTRO; f++) {
  const k = f < F_PERTO ? 1 : 1.35;
  const a = ease((f - 3) / 9);
  ds("portas", portas(k, a), f);
}
// átrio: desenhado uma vez no quadro F_DENTRO e copiado com a câmera
ds("fundo", atrio(), F_DENTRO);
const grupos = new Map();
for (let f = F_DENTRO + 1; f < QUADROS; f++) { const y = camY(f); if (!grupos.has(y)) grupos.set(y, []); grupos.get(y).push(f); }
for (const [y, fr] of grupos) for (let i = 0; i < fr.length; i += 100) c.push({ name: "copy_layer_content", input: { from_frame: F_DENTRO, from_layer: "fundo", to_layer: "fundo", to_frames: fr.slice(i, i + 100), dy: -y, preview: false } });
c.push({ name: "transform", input: { op: "shift", layer: "fundo", frames: F_DENTRO, dy: -camY(F_DENTRO), preview: false } });

// ---- gente ----
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const r = rng(5);
const sorteia = () => ({ pele: "1234"[Math.floor(r() * 4)], cabelo: "567"[Math.floor(r() * 3)], blusa: BL[Math.floor(r() * 8)], calca: "89"[Math.floor(r() * 2)] });
// dentro da loja, vistos pela porta (fachada)
const dentro = Array.from({ length: 5 }, (_, i) => ({ x: 20 + i * 33, dir: i % 2 ? -1 : 1, v: 0.5 + r() * 0.3, pe: 196 + (i % 3) * 6, ...sorteia() }));
// átrio: gente nos pisos e nas escadas
const nosPisos = [];
LAJES.forEach((laje, andar) => { for (let i = 0; i < 4; i++) nosPisos.push({ x: r() * 200 - 10, pe: laje - 1, dir: r() < 0.5 ? 1 : -1, v: 0.5 + r() * 0.4, fase: i, ...sorteia() }); });
const nasEscadas = [];
ESCADAS.forEach((e, k) => { for (let i = 0; i < 5; i++) nasEscadas.push({ e, t0: i / 5 + r() * 0.05, ...sorteia() }); });

for (let f = 0; f < QUADROS; f++) {
  if (f < F_DENTRO) {
    const g = new Grade(W, 0, H);
    const k = f < F_PERTO ? 1 : 1.35;
    const X = (x) => Math.round(90 + (x - 90) * k), Y = (y) => Math.round(150 + (y - 150) * k);
    const tam = "perto", alt = 18;
    for (const p of dentro) {
      let x = p.x + p.dir * p.v * f; x = ((x - 10) % 170 + 170) % 170 + 10;
      if (x > 108 && x < 150) continue; // não passa na frente da escada do fundo
      g.stamp(pessoa({ tam, frame: Math.floor(f / 2) + p.x, dir: p.dir, pele: p.pele, cabelo: p.cabelo, blusa: p.blusa, calca: p.calca }), X(x), Y(p.pe) - alt);
    }
    // segurança parado à direita, uniforme escuro
    g.stamp(pessoa({ tam, frame: 1, dir: -1, pele: "3", cabelo: "5", blusa: "0", calca: "0" }), X(158), Y(206) - alt);
    c.push({ name: "draw_rows", input: { layer: "gente", frames: f, x: 0, y: 0, rows: g.out(), preview: false } });
  } else {
    const cy = camY(f), g = new Grade(W, 0, H), t = f - F_DENTRO;
    for (const p of nosPisos) {
      let x = p.x + p.dir * p.v * t; x = ((x + 10) % 200 + 200) % 200 - 10;
      g.stamp(pessoa({ frame: Math.floor(t / 2) + p.fase, dir: p.dir, pele: p.pele, cabelo: p.cabelo, blusa: p.blusa, calca: p.calca }), Math.round(x), p.pe - 12 - cy);
    }
    for (const p of nasEscadas) {
      const u = (p.t0 + t * 0.006) % 1, e = p.e;
      const x = e.x1 + (e.x2 - e.x1) * u, y = e.y1 + (e.y2 - e.y1) * u;
      g.stamp(pessoa({ frame: 1, dir: e.x2 > e.x1 ? 1 : -1, pele: p.pele, cabelo: p.cabelo, blusa: p.blusa, calca: p.calca }), Math.round(x) - 2, Math.round(y) - 12 - cy);
    }
    c.push({ name: "draw_rows", input: { layer: "gente", frames: f, x: 0, y: 0, rows: g.out(), preview: false } });
  }
}

// ---- homem de camiseta amarela (draw_figure, ciclo de caminhada) ----
const FASES = ["caminhada_contato", "caminhada_abaixo", "caminhada_passagem", "caminhada_acima"];
const homem = { skin: "#6a3e28", hair: "#1c1a24", top: "#e8b020", bottom: "#34486a", boots: "#e8e8e8", metal: "#b9c4d6", gold: "#e0b040" };
for (let f = 12; f < F_DENTRO; f++) {
  const perto = f >= F_PERTO;
  const fase = f - 12;
  const x = perto ? Math.round(62 + (f - F_PERTO) * 7) : Math.round(-24 + fase * 9.5);
  c.push({ name: "draw_figure", input: {
    items: [{ frame: f, preset: FASES[fase % 4], swap: Math.floor(fase / 4) % 2 === 1 }],
    figure_height: perto ? 70 : 128, x, ground: perto ? Math.round(150 + (222 - 150) * 1.35) - 22 : 246, style: "realista",
    materials: homem, hair: "curto", tons: 4, outline: "compartilhado", light: "frente", preview: false,
  } });
}

// ---- planta em primeiro plano no átrio (paralaxe mais rápida) ----
function folhas(bx, by) {
  // planta de vaso: folhas pontudas em leque saindo da base (bx, by); metade de cada folha na sombra
  const s = [];
  for (const [ang, L, w] of [[-160, 24, 8], [-138, 32, 10], [-112, 36, 10], [-88, 30, 9], [-64, 34, 10], [-40, 28, 9], [-18, 22, 8]]) {
    const a = (ang * Math.PI) / 180, dx = Math.cos(a), dy = Math.sin(a), px = -dy, py = dx;
    const P = (t, k) => [Math.round(bx + dx * L * t + px * k), Math.round(by + dy * L * t + py * k)];
    s.push({ type: "polygon", points: [P(0.1, 0), P(0.5, w / 2), P(1, 0), P(0.5, -w / 2)], color: "L" });
    s.push({ type: "polygon", points: [P(0.1, 0), P(1, 0), P(0.5, -w / 2)], color: "M" });
    s.push({ type: "line", x1: P(0.15, 0)[0], y1: P(0.15, 0)[1], x2: P(0.8, 0)[0], y2: P(0.8, 0)[1], color: "N" });
  }
  return s;
}


c.push({ name: "set_canvas", input: { width: W, height: H, fps: FPS } });

const dir = path.dirname(fileURLToPath(import.meta.url));
const t0 = Date.now();
gerar({ nome: "02_shopping", comandos: c, quadros: QUADROS, saida: dir });
console.log(`ok: ${c.length} comandos, ${((Date.now() - t0) / 1000).toFixed(1)} s`);

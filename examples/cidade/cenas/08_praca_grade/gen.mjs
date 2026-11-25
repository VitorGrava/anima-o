// Cena 08 — A mesma praça da cena 01, agora apagada: uma grade preta de ferro sobe na frente,
// aparece a placa "PROPRIEDADE PRIVADA / ACESSO SOMENTE A CLIENTES"; quem está fora fica fora.
// 38,6–42,5 s = 47 quadros. Reaproveita o cenário do gen da cena 01.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { W, H, FPS, pessoa, gerar } from "../../lib/comum.mjs";
import { PALETA, MUNDO_W, CHAO, ceu, longe, mundo, criarPedestres, Grade, pessoasNoQuadro, addFrames } from "../01_praca/gen.mjs";

const QUADROS = 47;
const CAM = 52;                 // enquadramento fixo: coreto cortado à esquerda, igreja, árvores
const BASE = CHAO + 22;         // pé da grade (quem pisa abaixo disto está do lado de fora)
const ALTO = 60;                // altura da grade
const SOBE = [3, 13];           // quadros em que a grade sobe
const PLACA = 14;               // quadro em que a placa aparece

const comandos = [];
const c = comandos;
const ds = (layer, shapes, frames = 0) => {
  for (let i = 0; i < shapes.length; i += 150) c.push({ name: "draw_shapes", input: { layer, frames, shapes: shapes.slice(i, i + 150), preview: false } });
};

c.push({ name: "set_palette", input: { colors: [
  ...PALETA,
  { key: "Q", hex: "#1e1a1e", name: "grade" },
  { key: "R", hex: "#4a4048", name: "grade-luz" },
  { key: "S", hex: "#b0a296", name: "nevoa" },
  { key: "T", hex: "#c8322c", name: "placa-vermelho" },
  { key: "U", hex: "#fbf6ee", name: "placa-branco" },
] } });
c.push({ name: "set_canvas", input: { width: MUNDO_W, height: H } });
c.push({ name: "update_layer", input: { layer: "Base", name: "ceu" } });
for (const n of ["longe", "mundo", "dentro", "grade", "fora", "placa"]) c.push({ name: "add_layer", input: { name: n } });
ds("ceu", ceu());
ds("longe", longe());
ds("mundo", mundo());
addFrames(c, QUADROS - 1);
// câmera fixa: desloca o mundo e o fundo uma vez em todos os quadros
c.push({ name: "transform", input: { op: "shift", layer: "mundo", frames: "all", dx: -CAM, preview: false } });
c.push({ name: "transform", input: { op: "shift", layer: "longe", frames: "all", dx: -Math.round(CAM * 0.45), preview: false } });
c.push({ name: "set_canvas", input: { width: W, height: H, fps: FPS } });

// pessoas: dentro (atrás da grade) e fora (na frente)
const ped = criarPedestres(8, 44).map((p) => ({ ...p, x: p.x % 260 }));
for (let f = 0; f < QUADROS; f++) {
  const gd = new Grade(W, CHAO - 20, CHAO + 46), gf = new Grade(W, CHAO - 20, CHAO + 46);
  pessoasNoQuadro(gd, ped, f, CAM, (p) => p.pe < BASE);
  pessoasNoQuadro(gf, ped, f, CAM, (p) => p.pe >= BASE && p.v > 0);
  // quem ficou do lado de fora, parado olhando a grade (de costas para nós = de perfil, voltado para ela)
  for (const [x, pe, pele, blusa, dir] of [[22, BASE + 9, "3", "b", 1], [131, BASE + 13, "4", "c", -1], [70, BASE + 18, "2", "d", 1]])
    gf.stamp(pessoa({ tam: "perto", frame: 1, dir, pele, blusa, calca: "9" }), x, pe - 18);
  c.push({ name: "draw_rows", input: { layer: "dentro", frames: f, x: 0, y: CHAO - 20, rows: gd.out(), preview: false } });
  c.push({ name: "draw_rows", input: { layer: "fora", frames: f, x: 0, y: CHAO - 20, rows: gf.out(), preview: false } });
}

// a praça vai ficando apagada (perspectiva de "névoa" acinzentada, em degraus)
const degraus = [];
for (let k = 0; k < 7; k++) degraus.push([{ from: 8 + k * 5, to: k === 6 ? QUADROS - 1 : 12 + k * 5 }, 0.06 * (k + 1)]);
for (const [frames, q] of degraus)
  for (const layer of ["ceu", "longe", "mundo", "dentro", "fora"])
    c.push({ name: "transform", input: { op: "haze", layer, frames, color: "S", quantidade: layer === "fora" ? q * 0.5 : q, preview: false } });

// grade de ferro: sobe do chão com ease-out e "assenta" com 1 px de rebote
function grade(alt) {
  const s = [], top = BASE - alt;
  if (alt <= 0) return s;
  for (let x = 1; x < W; x += 4) {
    s.push({ type: "line", x1: x, y1: top, x2: x, y2: BASE, color: "Q" });
    if (alt > 4) s.push({ type: "pixels", points: [[x, top - 1], [x - 1, top + 1], [x + 1, top + 1]], color: "Q" });
  }
  const trilhos = [BASE - 4, BASE - Math.round(alt * 0.82)];
  for (const y of trilhos) if (y >= top + 2) { s.push({ type: "rect", x: 0, y, w: W, h: 2, color: "Q" }); s.push({ type: "line", x1: 0, y1: y, x2: W - 1, y2: y, color: "R" }); }
  for (let x = 18; x < W; x += 44) {        // pilares
    s.push({ type: "rect", x: x - 1, y: top - 3, w: 4, h: alt + 3, color: "Q" });
    s.push({ type: "line", x1: x - 1, y1: top - 3, x2: x - 1, y2: BASE, color: "R" });
    s.push({ type: "rect", x: x - 2, y: top - 5, w: 6, h: 2, color: "Q" });
  }
  return s;
}
const [f0, f1] = SOBE;
for (let f = f0; f < QUADROS; f++) {
  let alt = ALTO;
  if (f <= f1) { const u = (f - f0) / (f1 - f0); alt = Math.round(ALTO * (1 - Math.pow(1 - u, 3))); }
  if (f === f1 + 1) alt = ALTO + 2;   // pequeno rebote
  ds("grade", grade(alt), f);
}

// placa vermelha: cai 4 px e assenta
function placa(dy) {
  const x = 12, y = 156 + dy, w = 156, h = 26;
  return [
    { type: "rect", x: x + 1, y: y + 1, w, h, color: "Q" },
    { type: "rect", x, y, w, h, color: "U" },
    { type: "rect", x, y, w, h, color: "T", filled: false },
    { type: "rect", x: x + 1, y: y + 1, w: w - 2, h: h - 2, color: "T", filled: false },
    { type: "texto", texto: "PROPRIEDADE PRIVADA", x: x + w / 2 + 1, y: y + 4, color: "T", alinhar: "centro", escala: 2, espaco: 1 },
    { type: "texto", texto: "ACESSO SOMENTE A CLIENTES", x: x + w / 2 + 1, y: y + 17, color: "Q", alinhar: "centro" },
  ];
}
ds("placa", placa(-4), PLACA);
ds("placa", placa(1), PLACA + 1);
ds("placa", placa(0), { from: PLACA + 2, to: QUADROS - 1 });

const dir = path.dirname(fileURLToPath(import.meta.url));
const t0 = Date.now();
gerar({ nome: "08_praca_grade", comandos, quadros: QUADROS, saida: dir });
console.log(`ok: ${comandos.length} comandos, ${((Date.now() - t0) / 1000).toFixed(1)} s`);

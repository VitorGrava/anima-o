// Cavaleiro de armadura andando para a direita: ciclo de caminhada de 8 frames em loop, 48x48.
// Referências estudadas (OpenGameArt): "Knight walking" (9jack9), "Knight spritesheet" / "Dark Knight" (marqueeplier, CC0),
// "Simple Knight" (Calciumtrice). Características copiadas: elmo-balde com fenda de visor escura; aço cinza-azulado em
// 3-4 tons com luz de cima-esquerda; UM acento vermelho (pluma + capa); escudo do lado de perto cobrindo o tronco e a
// espada baixa na mão de longe, saindo da silhueta; joelheiras claras e sapatos de ferro escuros, corpo sobe/desce no passo.
// Uso: node examples/cavaleiro_andando/gen.mjs  (gera cmds.json, roda a engine e exporta gif e sheet)
import { writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(DIR, "..", "..");
const W = 48, H = 48, N = 8;

const pal = [
  ["0", "#221d36", "aco-contorno"], ["1", "#4e5570", "aco-sombra"], ["2", "#8590a8", "aco"], ["3", "#c3ccd9", "aco-luz"], ["4", "#f2f4f0", "aco-brilho"],
  ["5", "#363a54", "aco-longe-sombra"],
  ["6", "#3a1028", "vermelho-contorno"], ["7", "#7c1c38", "vermelho-sombra"], ["8", "#b8303a", "vermelho"], ["9", "#e2643e", "vermelho-luz"],
  ["a", "#5a3028", "madeira-sombra"], ["b", "#8c5634", "madeira"], ["c", "#b67c48", "madeira-luz"], ["d", "#2c1620", "madeira-contorno"],
  ["e", "#8a5626", "ouro-sombra"], ["f", "#d4a03e", "ouro"], ["g", "#f6dc7a", "ouro-luz"],
  ["h", "#3e2828", "couro-sombra"], ["i", "#6c4430", "couro"],
  ["s", "#6a5a70", "sombra-chao"], ["S", "#5c4c64", "sombra-chao-centro"],
];
const RAMP = {
  aco: { K: "0", D: "1", M: "2", L: "3" },
  acoLonge: { K: "0", D: "0", M: "5", L: "1" },
  verm: { K: "6", D: "7", M: "8", L: "9" },
  vermLonge: { K: "6", D: "6", M: "7", L: "8" },
  madeira: { K: "d", D: "a", M: "b", L: "c" },
  ouro: { K: "d", D: "e", M: "f", L: "g" },
  couro: { K: "d", D: "h", M: "i", L: "i" },
};

// ---------- geometria ----------
const rad = (d) => (d * Math.PI) / 180;
function segDist(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay, wx = px - ax, wy = py - ay;
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / (vx * vx + vy * vy || 1)));
  const dx = px - (ax + t * vx), dy = py - (ay + t * vy);
  return Math.hypot(dx, dy);
}
// osso grosso: pixels cujo centro está a <= r do segmento
function bone(ax, ay, bx, by, r) {
  const out = [];
  for (let y = Math.floor(Math.min(ay, by) - r - 1); y <= Math.ceil(Math.max(ay, by) + r + 1); y++)
    for (let x = Math.floor(Math.min(ax, bx) - r - 1); x <= Math.ceil(Math.max(ax, bx) + r + 1); x++)
      if (segDist(x, y, ax, ay, bx, by) <= r) out.push([x, y]);
  return out;
}
const spans = (ox, oy, rows) => {
  const out = [];
  for (const [ry, a, b] of rows) for (let x = a; x <= b; x++) out.push([ox + x, oy + ry]);
  return out;
};
// IK de 2 ossos, joelho para a frente (+x)
function ik(hx, hy, tx, ty, l1, l2, bendSign = 1) {
  let dx = tx - hx, dy = ty - hy, d = Math.hypot(dx, dy);
  const max = l1 + l2 - 0.01;
  if (d > max) { tx = hx + (dx / d) * max; ty = hy + (dy / d) * max; dx = tx - hx; dy = ty - hy; d = max; }
  const a = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
  const base = Math.atan2(dy, dx);
  const ang = base - bendSign * a; // joelho do lado +x (para a frente) quando olhando para a direita
  return { kx: hx + Math.cos(ang) * l1, ky: hy + Math.sin(ang) * l1, ax: tx, ay: ty };
}

// ---------- tabelas do ciclo ----------
// pé: deslocamento x em relação ao quadril, altura do tornozelo acima do apoio, ângulo da ponta (+ = ponta para baixo)
const FOOT = [
  [6, 0, -12], // 0 contato (calcanhar)
  [3, 0, 0], // 1 abaixo (peso)
  [0, 0, 0], // 2 passagem (apoio)
  [-3, 0, 0], // 3 acima
  [-6, 1, 30], // 4 impulso (ponta)
  [-4, 3, 40], // 5
  [1, 4, 12], // 6 passagem (perna livre)
  [5, 2, -6], // 7
];
const BOB = [0, 1, 0, -1, 0, 1, 0, -1];
const GROUND = 45; // última linha da sola
const ANK = GROUND - 2;

function frame(t) {
  const parts = []; // {pix:[[x,y]], ramp, force?:Map, shade:true}
  const add = (pix, ramp, opt = {}) => parts.push({ pix, ramp, ...opt, id: parts.length });
  const dy = BOB[t];
  const lag = (k) => BOB[(t - k + N) % N];
  const cx = 22, hipY = 27 + dy;
  const swing = Math.cos((2 * Math.PI * t) / N); // +1 = perna de perto à frente (frame 0)

  // capa (atrás de tudo), ondula com 2 frames de atraso
  {
    const s = lag(2), w = Math.round(Math.cos((2 * Math.PI * (t - 2)) / N) * 1);
    const top = hipY - 12;
    const rows = [];
    for (let ry = 0; ry <= 16; ry++) {
      const k = ry / 16;
      const left = -4 - Math.round(k * (3.2 + w)) ;
      const right = -2 + Math.round(k * 0.5);
      rows.push([ry, left, right]);
    }
    // barra recortada
    const pix = spans(cx, top + (s > 0 ? 1 : 0) * 0, rows).filter(([x, y]) => !(y === top + 16 && (x + t) % 3 === 0));
    add(pix, "verm", { far: true });
  }

  // braço de longe com espada (em fase com a perna de perto)
  {
    const shX = cx - 1, shY = hipY - 10;
    const a = 30 + 16 * swing; // ombro (0 = pendurado, + = para a frente)
    const ex = shX + Math.sin(rad(a)) * 5, ey = shY + Math.cos(rad(a)) * 5;
    const fa = a + 25;
    const hx = ex + Math.sin(rad(fa)) * 5, hy = ey + Math.cos(rad(fa)) * 5;
    add([...bone(shX, shY, ex, ey, 1.2), ...bone(ex, ey, hx, hy, 1.1)], "acoLonge");
    // espada: lâmina para baixo e para a frente
    const ba = 128 + (a - 30) * 0.4; // 0 = para cima, 90 = frente, 180 = para baixo
    const vx = Math.sin(rad(ba)), vy = -Math.cos(rad(ba));
    const gx = Math.round(hx), gy = Math.round(hy);
    const blade = [], edge = [];
    for (let k = 2; k <= 15; k++) blade.push([Math.round(gx + vx * k), Math.round(gy + vy * k)]);
    for (let k = 2; k <= 14; k++) edge.push([Math.round(gx + vx * k + 0.9 * Math.cos(rad(ba))), Math.round(gy + vy * k + 0.9 * Math.sin(rad(ba)))]);
    const force = new Map();
    edge.forEach(([x, y]) => force.set(`${x},${y}`, "1"));
    blade.forEach(([x, y], i) => force.set(`${x},${y}`, i === blade.length - 1 ? "2" : "3"));
    add([...edge, ...blade], "aco", { force });
    // guarda (perpendicular) e pomo
    const px_ = -vy, py_ = vx;
    const guard = [-2, -1, 0, 1, 2].map((k) => [Math.round(gx + vx * 1.6 + px_ * k), Math.round(gy + vy * 1.6 + py_ * k)]);
    const gf = new Map(); guard.forEach(([x, y], i) => gf.set(`${x},${y}`, i < 2 ? "g" : i === 4 ? "e" : "f"));
    add(guard, "ouro", { force: gf });
    const pom = [[Math.round(gx - vx * 1.8), Math.round(gy - vy * 1.8)]];
    add(pom, "ouro", { force: new Map([[`${pom[0][0]},${pom[0][1]}`, "f"]]) });
    // manopla
    add(bone(hx - 0.3, hy - 0.3, hx + 0.3, hy + 0.3, 1.0), "acoLonge");
  }

  // pernas
  const leg = (phase, far) => {
    const [off, lift, fang] = FOOT[phase];
    const hx = cx + (far ? -1 : 1), hy = hipY;
    const j = ik(hx, hy, hx + off, ANK - lift, 9, 9);
    const ramp = far ? "acoLonge" : "aco";
    add([...bone(hx, hy, j.kx, j.ky, 1.9), ...bone(j.kx, j.ky, j.ax, j.ay, 1.45)], ramp);
    // sapato de ferro: do calcanhar para a ponta
    const c = Math.cos(rad(fang)), s = Math.sin(rad(fang));
    const heel = [j.ax - 1, j.ay + 1.2], toe = [j.ax - 1 + c * 5, j.ay + 1.2 + s * 5];
    add(bone(heel[0], heel[1], toe[0], toe[1], 1.0), far ? "acoLonge" : "aco", { dark: true });
    // joelheira (brilho)
    const kf = new Map([[`${Math.round(j.kx + 1)},${Math.round(j.ky - 1)}`, far ? "2" : "4"]]);
    add(bone(j.kx + 0.3, j.ky - 0.3, j.kx + 1, j.ky, 1.2), ramp, { force: kf });
  };
  leg((t + 4) % N, true); // perna de longe (meio ciclo defasada)
  leg(t, false); // perna de perto

  // tronco: peitoral, cinto, saia de lâminas (faldas)
  {
    const rows = [
      [-13, -3, 2], [-12, -4, 4], [-11, -5, 5], [-10, -5, 6], [-9, -5, 6], [-8, -5, 6], [-7, -4, 5], [-6, -4, 5], [-5, -3, 4], [-4, -3, 4],
    ];
    add(spans(cx, hipY, rows), "aco");
    add(spans(cx, hipY, [[-3, -4, 4]]), "couro", { flat: "i" });
    const fv = new Map([[`${cx + 1},${hipY - 3}`, "f"]]);
    add([[cx + 1, hipY - 3]], "ouro", { force: fv });
    const fauld = spans(cx, hipY, [[-2, -5, 5], [-1, -5, 5], [0, -5, 6], [1, -5, 6]]);
    const ff = new Map(); fauld.forEach(([x, y]) => { if (y === hipY) ff.set(`${x},${y}`, "1"); });
    add(fauld, "aco", { force: ff });
  }

  // elmo-balde com fenda de visor
  {
    const hy = hipY - 14, hx = cx + 1;
    const rows = [
      [-9, -2, 1], [-8, -3, 3], [-7, -4, 4], [-6, -4, 4], [-5, -4, 4], [-4, -4, 4], [-3, -4, 4], [-2, -4, 4], [-1, -4, 4], [0, -3, 3],
    ];
    const pix = spans(hx, hy, rows);
    const f = new Map();
    for (let x = 0; x <= 4; x++) f.set(`${hx + x},${hy - 5}`, "0"); // fenda
    f.set(`${hx + 4},${hy - 5}`, "0");
    f.set(`${hx + 2},${hy - 2}`, "1"); f.set(`${hx + 4},${hy - 2}`, "1"); // respiros
    for (let y = -8; y <= 0; y++) if (y !== -5) f.set(`${hx + 1},${hy + y}`, y < -5 ? "3" : "2"); // aresta do elmo
    f.set(`${hx - 2},${hy - 8}`, "4"); f.set(`${hx - 3},${hy - 7}`, "3");
    add(pix, "aco", { force: f });
    // pluma: sai do topo e cai para trás com atraso
    const s1 = lag(1), s2 = lag(2);
    const pts = [[hx - 1, hy - 10], [hx - 3, hy - 12], [hx - 6, hy - 11.5 + 0.5 * s1], [hx - 8, hy - 9 + s1], [hx - 9, hy - 6 + s2]];
    const pix2 = [];
    pts.slice(0, -1).forEach(([ax, ay], i) => { const [bx, by] = pts[i + 1]; pix2.push(...bone(ax, ay, bx, by, i < 2 ? 1.3 : i < 3 ? 1.0 : 0.7)); });
    add(pix2, "verm");
  }

  // braço de perto com escudo (balança pouco, atrasado 1 frame)
  {
    const sw = Math.cos((2 * Math.PI * (t - 1)) / N); // em fase com a perna de longe -> sinal oposto
    const sx = cx + 2 + Math.round(-1.2 * sw), sy = hipY - 11 + (lag(1) > 0 ? 1 : 0);
    const rows = [[0, 0, 9], [1, 0, 9], [2, 0, 9], [3, 0, 9], [4, 0, 9], [5, 0, 9], [6, 0, 9], [7, 1, 8], [8, 1, 8], [9, 2, 7], [10, 3, 6], [11, 4, 5]];
    const pix = spans(sx, sy, rows);
    const inner = new Set(spans(sx, sy, [[1, 1, 8], [2, 1, 8], [3, 1, 8], [4, 1, 8], [5, 1, 8], [6, 1, 8], [7, 2, 7], [8, 2, 7], [9, 3, 6], [10, 4, 5]]).map(([x, y]) => `${x},${y}`));
    const f = new Map();
    for (const [x, y] of pix) {
      const k = `${x},${y}`;
      if (!inner.has(k)) f.set(k, y === sy || x === sx ? "3" : "1"); // aro de aço
    }
    add(pix, "madeira", { force: f });
    // faixa vermelha diagonal (brasão) e cravo de ouro
    const band = [];
    for (let i = 0; i < 9; i++) band.push([sx + 1 + i, sy + 1 + i], [sx + 1 + i, sy + 2 + i]);
    const bf = new Map(); band.forEach(([x, y]) => bf.set(`${x},${y}`, (x + y) % 2 ? "8" : "8"));
    const bb = band.filter(([x, y]) => inner.has(`${x},${y}`));
    const bset = new Set(bb.map(([x, y]) => `${x},${y}`));
    const bfm = new Map(); bb.forEach(([x, y]) => bfm.set(`${x},${y}`, bset.has(`${x},${y + 1}`) ? "9" : "7"));
    add(bb, "verm", { force: bfm });
    add([[sx + 5, sy + 5]], "ouro", { force: new Map([[`${sx + 5},${sy + 5}`, "g"]]) });
    // ombreira por cima
    const px0 = cx - 2, py0 = hipY - 13;
    add(spans(px0, py0, [[0, 1, 4], [1, 0, 5], [2, 0, 5], [3, 1, 4]]), "aco", {
      force: new Map([[`${px0 + 2},${py0 + 1}`, "4"]]),
    });
  }
  return { parts, dy };
}

// ---------- composição, sombreamento e contorno ----------
function render(t) {
  const { parts, dy } = frame(t);
  const owner = Array.from({ length: H }, () => Array(W).fill(-1));
  for (const p of parts) for (const [x, y] of p.pix) if (x >= 0 && x < W && y >= 0 && y < H) owner[y][x] = p.id;
  const g = Array.from({ length: H }, () => Array(W).fill("."));
  const same = (x, y, id) => x >= 0 && x < W && y >= 0 && y < H && owner[y][x] === id;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const id = owner[y][x];
      if (id < 0) continue;
      const p = parts[id], r = RAMP[p.ramp];
      const k = `${x},${y}`;
      if (p.force && p.force.has(k)) { g[y][x] = p.force.get(k); continue; }
      if (p.flat) { g[y][x] = p.flat; continue; }
      const up = same(x, y - 1, id), dn = same(x, y + 1, id), lf = same(x - 1, y, id), rt = same(x + 1, y, id);
      let c = r.M;
      if (!dn || !rt) c = r.D;
      if (!up || (!lf && dn)) c = r.L;
      if (p.dark) c = !up ? r.M : r.D;
      g[y][x] = c;
    }
  // separação: parte de trás encostada numa da frente ganha o tom de contorno
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const id = owner[y][x];
      if (id < 0) continue;
      const p = parts[id];
      if (p.force && p.force.has(`${x},${y}`)) continue;
      for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const o = owner[y + ddy]?.[x + ddx];
        if (o === undefined || o < 0 || o <= id) continue;
        const q = parts[o];
        if (q.ramp === p.ramp && !(q.force && q.force.has(`${x + ddx},${y + ddy}`)) && q.pix.length > 6 && p.pix.length > 6) { g[y][x] = RAMP[p.ramp].K; break; }
      }
    }
  // contorno seletivo: escuro do material; no lado da luz (cima/esquerda da figura) um tom mais claro
  const out = g.map((r) => r.slice());
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (owner[y][x] >= 0) continue;
      let best = null, lit = false;
      for (const [ddx, ddy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
        const o = owner[y + ddy]?.[x + ddx];
        if (o === undefined || o < 0) continue;
        if (best === null) { best = o; lit = ddy === 1 || ddx === 1; }
      }
      if (best === null) continue;
      const r = RAMP[parts[best].ramp];
      out[y][x] = r.K;
      void lit;
    }
  // sombra no chão (achata quando o corpo sobe)
  const sh = Array.from({ length: H }, () => Array(W).fill("."));
  const half = 9 - (dy < 0 ? 1 : 0);
  for (let x = 22 - half; x <= 22 + half + 1; x++) {
    sh[GROUND + 1][x] = Math.abs(x - 22.5) < half - 3 ? "S" : "s";
    if (Math.abs(x - 22.5) < half - 2) sh[GROUND][x] = "s";
  }
  return { fig: out.map((r) => r.join("")), sh: sh.map((r) => r.join("")) };
}

const frames = Array.from({ length: N }, (_, t) => render(t));
const proj = join(DIR, "cavaleiro.anima.json");
const cmds = [
  { name: "set_canvas", input: { name: "cavaleiro", width: W, height: H, fps: 10 } },
  { name: "set_palette", input: { colors: pal.map(([key, hex, name]) => ({ key, hex, name })) } },
  { name: "update_layer", input: { layer: "Base", name: "sombra" } },
  { name: "add_layer", input: { name: "cavaleiro" } },
  { name: "add_frames", input: { count: N - 1, copy_from: 0 } },
  { name: "draw_frames", input: { layer: "sombra", preview: false, items: frames.map((f, i) => ({ frame: i, rows: f.sh })) } },
  { name: "draw_frames", input: { layer: "cavaleiro", preview: false, items: frames.map((f, i) => ({ frame: i, rows: f.fig })) } },
  // contato e passagem um pouco mais longos (peso), resto rápido
  { name: "set_frame_timing", input: { frames: "all", duration_ms: [120, 100, 110, 100, 120, 100, 110, 100] } },
];
writeFileSync(join(DIR, "cmds.json"), JSON.stringify(cmds));
if (!process.argv.includes("--so-cmds")) {
  const run = (c) => execSync(c, { cwd: ROOT, stdio: "inherit" });
  run(`node bin/anima.mjs new ${proj} ${W}x${H} 10`);
  run(`node bin/anima.mjs run ${proj} ${join(DIR, "cmds.json")} > /dev/null`);
  run(`node bin/anima.mjs export ${proj} ${join(DIR, "cavaleiro.gif")} --scale 8 --fundo '#8a7a8e'`);
  run(`node bin/anima.mjs export ${proj} ${join(DIR, "sheet.png")} --scale 6 --columns 8`);
}

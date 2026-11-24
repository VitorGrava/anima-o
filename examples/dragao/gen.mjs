// Dragão sobre o tesouro (512x512, estático) — duas versões do MESMO dragão:
//   normal : vermelho-dourado deitado sobre a montanha de ouro num salão de anão
//   dourado: o mesmo dragão coberto de ouro derretido, emergindo de um rio de ouro incandescente
// Uso: node examples/dragao/gen.mjs [normal|dourado|ambos]
// Gera cmds_<v>.json, recria <v>.anima.json e exporta o PNG em escala 2.
//
// Fundo, ouro, moedas, colunas e objetos: draw_shapes (gradient, polygon, ellipse, scatter) + transform haze/outline.
// Dragão: geometria própria (tubos de esferas ao longo de splines + elipsoides + polígonos de membrana) com
// profundidade z e normais; cada pixel recebe material + normal e é pintado numa RAMPA do material
// (sombra fria/roxa, luz quente) com escamas que seguem o volume (coordenadas u/v do tubo). Sai em draw_rows e
// recebe transform outline seletivo + clean da engine.
import { writeFileSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, "../..");
const W = 512, H = 512;
const MODE = process.argv[2] || "ambos";

function prng(s) { let a = s | 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const KEYS = [..."0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ#@$%&*+=-~^!?:;<>/|ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ"];
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function vnoise(x, y) { const h = (i, j) => { let n = Math.imul(i, 374761393) + Math.imul(j, 668265263); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; }; const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy); return (h(i, j) * (1 - sx) + h(i + 1, j) * sx) * (1 - sy) + (h(i, j + 1) * (1 - sx) + h(i + 1, j + 1) * sx) * sy; }
const norm3 = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };

// ======================================================================================
// PALETAS
// ======================================================================================
function palette(v) {
  const common = {
    // gemas e prata (iguais nas duas)
    ruby0: "#5a0f2a", ruby1: "#b01e3a", ruby2: "#ff5a6a", ruby3: "#ffd0d0",
    emer0: "#0c3a34", emer1: "#1c8a5a", emer2: "#6ae08a",
    saph0: "#141e5a", saph1: "#2a5ad0", saph2: "#8ac4ff",
    spark: "#fff6d4",
  };
  if (v === "normal") return {
    ...common,
    // salão: escuro violeta-marrom em cima, ar quente embaixo (o ouro ilumina)
    bg0: "#140c16", bg1: "#170d16", bg2: "#22121c", bg3: "#311a22", bg4: "#482526", bg5: "#6a3628", bg6: "#94502e", air: "#c77a3c",
    // pedra das colunas
    st0: "#1a1018", st1: "#2c1a22", st2: "#43282a", st3: "#5f3a30", st4: "#87583c", st5: "#b57e4c",
    beam: "#9a6442", beamM: "#7a4c38", beamO: "#5e3a32", beam2: "#f8cc88", dust: "#fff0c0",
    // ouro: sombra vermelho-marrom, luz amarela, brilho creme
    g0: "#2e1210", g1: "#58241a", g2: "#8a401c", g3: "#bf6a1e", g4: "#e39a2a", g5: "#f8c94a", g6: "#fff09a",
    // dragão: rampa vermelha (sombra roxa -> luz laranja)
    R0: "#1e0818", R1: "#3c0d24", R2: "#64142c", R3: "#901f2e", R4: "#b8362e", R5: "#dc5f34", R6: "#f79a52",
    Ra: "#501029", Rb: "#7a1a2d", Rc: "#a42b2e", Rd: "#ca4a31",
    rim1: "#d2622a", rim2: "#f4a040",
    B0: "#3a1418", B1: "#6e3424", B2: "#a8602e", B3: "#d6964a", B4: "#f4cc78",
    H0: "#24161a", H1: "#4a3634", H2: "#7a6252", H3: "#b29a7a", H4: "#e8dcbc",
    M0: "#1a0614", M1: "#300a1e", M2: "#4e1226", M3: "#74202c", M4: "#a23a32", M5: "#d06638",
    E1: "#ff8a10", E2: "#ffd23a", E3: "#fffbd8", F1: "#ff5a10", F2: "#ffb030",
  };
  return {
    ...common,
    // forja/salão: escuro com fumaça, luz amarelo-laranja vinda de baixo
    // fundo mais escuro e FRIO (marrom-violeta, valor <= 30%) para o ouro saltar; só a base pega o laranja do rio
    bg0: "#120a14", bg1: "#170e1a", bg2: "#1e1220", bg3: "#271824", bg4: "#321e26", bg5: "#432626", bg6: "#5e3024", air: "#8a4420",
    st0: "#100912", st1: "#1a1019", st2: "#251620", st3: "#331d24", st4: "#4e2a24", st5: "#7a3e22",
    beam: "#ffb030", beam2: "#ffe070", dust: "#fff4b0",
    g0: "#2a0c06", g1: "#5a1c08", g2: "#9a3a0a", g3: "#d8680c", g4: "#ffa01a", g5: "#ffd84c", g6: "#fff4a0",
    // dragão de ouro: sombra bronze-avermelhada, luz amarelo-branca
    // metal: rampa de 5 tons de alto contraste, do marrom quase preto ao branco-amarelado
    R0: "#160704", R1: "#2c1206", R2: "#66320c", R3: "#b46c12", R4: "#eeb02a", R5: "#ffe98e", R6: "#fffad6",
    rim1: "#ff8c16", rim2: "#fff1a0",
    B0: "#2e1206", B1: "#6a3a0e", B2: "#a8701a", B3: "#e4b032", B4: "#fff0a0",
    H0: "#221006", H1: "#583010", H2: "#946018", H3: "#d8a030", H4: "#fff0b0",
    M0: "#120604", M1: "#241006", M2: "#40200a", M3: "#64360e", M4: "#8e5214", M5: "#c27a1c",
    E1: "#ff3a10", E2: "#ff9a20", E3: "#fff2c4", F1: "#ff7a10", F2: "#ffe464",
    // ouro derretido e fumaça
    L0: "#4a1404", L1: "#8a2a04", L2: "#d45206", L3: "#ff8a10", L4: "#ffc030", L5: "#fff070", L6: "#fff8cc",
    Rg1: "#48220a", Rg2: "#8c4e0f",
    sm0: "#1a1218", sm1: "#2a1c20", sm2: "#3e2824",
  };
}

// ======================================================================================
// DRAGÃO: geometria (a mesma nas duas versões)
// ======================================================================================
// pontos [x, y, z, r]; z cresce em direção ao espectador
const SPINE = [
  [210, 126, 10, 19], [222, 160, 8, 22], [211, 200, 6, 25], [205, 238, 4, 31], [222, 274, 2, 43],
  [262, 298, 0, 57], [320, 304, 0, 61], [380, 300, -2, 55], [430, 306, -6, 43], [466, 332, 0, 33],
  [482, 376, 15, 29], [470, 420, 35, 25], [430, 450, 50, 21], [370, 470, 60, 17], [302, 478, 62, 13],
  [238, 471, 60, 9.5], [188, 457, 58, 6], [150, 445, 56, 2.5],
];
const LEGS = {
  pernaFrente: [[250, 308, 40, 28], [262, 350, 44, 21], [232, 378, 50, 16], [206, 396, 52, 13]],
  pernaLonge: [[282, 330, -40, 24], [290, 368, -40, 18], [292, 394, -40, 14]],
  canela: [[402, 344, 32, 24], [428, 378, 36, 17], [414, 402, 40, 14]],
};
const HEAD = {
  cranio: { cx: 205, cy: 107, rx: 37, ry: 24, rot: 0.42, z: 38, rz: 13 },
  focinho: [[230, 97, 30, 22], [206, 104, 32, 23], [180, 115, 32, 18], [152, 127, 32, 14.5], [128, 135, 32, 11.5], [114, 140, 30, 8.5]],
  // mandíbula ~60% da maxila, articulada atrás (~205,152), ponta 16 px atrás do focinho (que fecha em gancho por cima)
  mandibula: [[205, 152, 18, 13.5], [180, 158, 20, 10.5], [152, 162, 20, 7.5], [132, 164, 18, 5], [124, 162, 18, 3]],
  sobrancelha: { cx: 171, cy: 108, rx: 15, ry: 5, rot: 0.33, z: 43, rz: 6 },
  bochecha: { cx: 211, cy: 142, rx: 19, ry: 16, rot: 0.5, z: 24, rz: 12 },
  chifre: [[206, 94, 30, 10], [222, 74, 30, 8], [244, 60, 30, 6], [266, 56, 28, 3.6], [284, 63, 26, 1.2]],
  chifreLonge: [[190, 90, 2, 7], [198, 66, 2, 5], [212, 48, 2, 3], [228, 40, 2, 1]],
  chifreNariz: [[126, 138, 40, 4], [119, 127, 40, 2.4], [116, 119, 40, 0.9]],
  boca: [[198, 130], [112, 146], [120, 166], [198, 148]],
  olho: [161, 117],
};
const WING = {
  ombro: [302, 244], cotovelo: [396, 186], pulso: [352, 94],
  dedos: [[420, 16], [500, 58], [508, 160], [478, 252]],
  raiz: [[432, 300], [330, 282]],
};
const WING_FAR = { ombro: [290, 252], cotovelo: [318, 160], pulso: [348, 58], dedos: [[300, 8], [256, 92], [262, 178]] };

function catmull(pts, step = 0.8) {
  const out = [];
  const P = (i) => pts[clamp(i, 0, pts.length - 1)];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const n = Math.max(2, Math.ceil(len / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      out.push(p1.map((_, j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
    }
  }
  out.push(pts[pts.length - 1].slice());
  return out;
}

// buffer do dragão
function makeBuf() {
  const N = W * H;
  return { hornLen: new Map(), blocos: new Set(), z: new Float32Array(N).fill(-1e9), nx: new Float32Array(N), ny: new Float32Array(N), nz: new Float32Array(N), mat: new Uint8Array(N), part: new Uint8Array(N), u: new Float32Array(N), s: new Float32Array(N), r: new Float32Array(N), flag: new Uint8Array(N) };
}
const MAT = { pele: 1, barriga: 2, chifre: 3, membrana: 4, boca: 5, garra: 6 };
let PART = 0;

// tubo: união de esferas ao longo da spline; u = comprimento, s = deslocamento lateral assinado (-1..1)
function tube(buf, pts, mat, opt = {}) {
  const part = opt.part || ++PART;
  const S = catmull(pts, 0.7);
  let u = opt.u0 || 0;
  const samples = [];
  for (let i = 0; i < S.length; i++) {
    const a = S[Math.max(0, i - 1)], b = S[Math.min(S.length - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    if (i > 0) u += Math.hypot(S[i][0] - S[i - 1][0], S[i][1] - S[i - 1][1]);
    samples.push({ x: S[i][0], y: S[i][1], z: S[i][2], r: S[i][3] * (opt.scale || 1), tx, ty, u });
  }
  for (const sm of samples) {
    const R = sm.r; if (R < 0.5) continue;
    const px = -sm.ty, py = sm.tx; // lado "barriga"
    for (let y = Math.floor(sm.y - R); y <= Math.ceil(sm.y + R); y++) for (let x = Math.floor(sm.x - R); x <= Math.ceil(sm.x + R); x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const dx = x + 0.5 - sm.x, dy = y + 0.5 - sm.y, d2 = dx * dx + dy * dy;
      if (d2 > R * R) continue;
      const dz = Math.sqrt(R * R - d2) * (opt.flat || 1);
      const z = sm.z + dz, k = y * W + x;
      if (z <= buf.z[k]) continue;
      const [nx, ny, nz] = norm3(dx / R, dy / R, dz / R / (opt.flat || 1));
      buf.z[k] = z; buf.nx[k] = nx; buf.ny[k] = ny; buf.nz[k] = nz; buf.mat[k] = mat; buf.part[k] = part;
      buf.u[k] = sm.u; buf.s[k] = (dx * px + dy * py) / R; buf.r[k] = R; buf.flag[k] = opt.flag || 0;
    }
  }
  samples.part = part;
  if (mat === MAT.chifre) buf.hornLen.set(part, u);
  return samples;
}
function ellipsoid(buf, e, mat, opt = {}) {
  const part = opt.part || ++PART;
  const c = Math.cos(e.rot || 0), s = Math.sin(e.rot || 0), M = Math.max(e.rx, e.ry);
  for (let y = Math.floor(e.cy - M); y <= Math.ceil(e.cy + M); y++) for (let x = Math.floor(e.cx - M); x <= Math.ceil(e.cx + M); x++) {
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const dx = x + 0.5 - e.cx, dy = y + 0.5 - e.cy;
    const qx = dx * c + dy * s, qy = -dx * s + dy * c;
    const q = (qx / e.rx) ** 2 + (qy / e.ry) ** 2; if (q > 1) continue;
    const h = Math.sqrt(1 - q), z = e.z + e.rz * h, k = y * W + x;
    if (z <= buf.z[k]) continue;
    const gx = qx / e.rx ** 2, gy = qy / e.ry ** 2, gz = (e.rz * h) / e.rz ** 2;
    const [nx, ny, nz] = norm3(gx * c - gy * s, gx * s + gy * c, gz);
    buf.z[k] = z; buf.nx[k] = nx; buf.ny[k] = ny; buf.nz[k] = nz; buf.mat[k] = mat; buf.part[k] = part;
    buf.u[k] = qx + (opt.u0 || 0); buf.s[k] = qy / e.ry; buf.r[k] = e.ry; buf.flag[k] = opt.flag || 0;
  }
  return part;
}
function inPoly(x, y, pts) { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; }
function polygon(buf, pts, mat, z, n, opt = {}) {
  const part = ++PART;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const [nx, ny, nz] = norm3(...n);
  for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
    if (x < 0 || y < 0 || x >= W || y >= H || !inPoly(x + 0.5, y + 0.5, pts)) continue;
    const k = y * W + x, zz = typeof z === "function" ? z(x, y) : z;
    if (zz <= buf.z[k]) continue;
    buf.z[k] = zz; buf.nx[k] = nx; buf.ny[k] = ny; buf.nz[k] = nz; buf.mat[k] = mat; buf.part[k] = part; buf.u[k] = 0; buf.s[k] = 0; buf.r[k] = 0; buf.flag[k] = opt.flag || 0;
  }
  return part;
}
// espinho/garra: triângulo com metade clara e metade escura (luz de um lado)
function spike(buf, base, tip, half, z, mat) {
  const [bx, by] = base, [tx, ty] = tip;
  const dx = tx - bx, dy = ty - by, L = Math.hypot(dx, dy) || 1, px = -dy / L, py = dx / L;
  const a = [bx + px * half, by + py * half], b = [bx - px * half, by - py * half];
  // lado com normal para cima-esquerda = claro
  const lightA = px * -0.6 + py * -0.8 > 0;
  polygon(buf, [a, tip, base], mat, z, lightA ? [-0.6, -0.7, 0.4] : [0.5, 0.6, 0.4]);
  polygon(buf, [b, tip, base], mat, z, lightA ? [0.5, 0.6, 0.4] : [-0.6, -0.7, 0.4]);
}

function scallop(a, b, w, depth, n = 6) {
  // borda recortada entre duas pontas de dedo: arco côncavo em direção ao pulso w
  const out = [];
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  const dx = w[0] - mx, dy = w[1] - my, L = Math.hypot(dx, dy);
  for (let i = 1; i < n; i++) {
    const t = i / n, s = Math.sin(t * Math.PI) * depth;
    out.push([a[0] + (b[0] - a[0]) * t + (dx / L) * s, a[1] + (b[1] - a[1]) * t + (dy / L) * s]);
  }
  return out;
}

// suaviza as normais dentro de cada parte (caixa 7x7): nas junções das esferas/elipsoides a luz passa a CURVAR
// em vez de formar facetas retas ("low-poly")
function smoothNormals(buf, r) {
  const nx = buf.nx.slice(), ny = buf.ny.slice(), nz = buf.nz.slice();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x; if (buf.mat[k] !== MAT.pele) continue;
    let sx = 0, sy = 0, sz = 0, c = 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const q = yy * W + xx; if (buf.part[q] !== buf.part[k] || buf.mat[q] !== MAT.pele) continue;
      sx += nx[q]; sy += ny[q]; sz += nz[q]; c++;
    }
    const [a, b, cc] = norm3(sx, sy, sz);
    // a borda da silhueta mantém a normal original (contraluz/contorno continuam nítidos)
    if (nz[k] < 0.25) continue;
    buf.nx[k] = a; buf.ny[k] = b; buf.nz[k] = cc;
  }
}

// mão/pé: palma + dedos com nós (3–4 px) + garras cravadas para baixo
function foot(buf, cx, cy, z, dir, n, wide = 1) {
  ellipsoid(buf, { cx, cy, rx: 13 * wide, ry: 7 * Math.sqrt(wide), rot: 0, z, rz: 8 }, MAT.pele, { u0: 1300 });
  for (let i = 0; i < n; i++) {
    const bx = cx - 9 * wide + i * (18 * wide / (n - 1)), by = cy + 2;
    const tx = bx + dir * (9 - i * 1.5), ty = cy + 9 + (i % 2);
    tube(buf, [[bx, by, z + 6, 4], [(bx + tx) / 2, (by + ty) / 2 - 1, z + 8, 4.3], [tx, ty, z + 8, 3]], MAT.pele, { u0: 1310 + i * 10 });
    spike(buf, [tx + dir * 1, ty + 1], [tx + dir * 5, ty + 9], 2.6, z + 12, MAT.garra);
  }
}

function buildDragon(v) {
  PART = 0;
  const buf = makeBuf();
  const wingInfo = { panels: [], bones: [] };
  // ---- asa de LONGE (atrás de tudo) ----
  {
    const { ombro, cotovelo, pulso, dedos } = WING_FAR;
    const zf = -90;
    const pts = [pulso, dedos[0], ...scallop(dedos[0], dedos[1], pulso, 14), dedos[1], ...scallop(dedos[1], dedos[2], pulso, 12), dedos[2], ...scallop(dedos[2], [282, 246], pulso, 8), [282, 246], ombro, cotovelo];
    const p = polygon(buf, pts, MAT.membrana, zf, [0.3, 0.3, 1], { flag: 2 });
    wingInfo.panels.push({ part: p, far: true });
    tube(buf, [[...ombro, zf + 10, 9], [...cotovelo, zf + 10, 7], [...pulso, zf + 10, 5]], MAT.pele, { flag: 2 });
    for (const d of dedos) { tube(buf, [[...pulso, zf + 12, 4], [(pulso[0] + d[0]) / 2, (pulso[1] + d[1]) / 2, zf + 12, 3], [...d, zf + 12, 1.2]], MAT.pele, { flag: 2 }); wingInfo.bones.push([pulso, d, true]); }
    spike(buf, [pulso[0] - 2, pulso[1] - 3], [pulso[0] - 12, pulso[1] - 18], 3, zf + 14, MAT.garra);
  }
  const buried = new Set();
  // ---- pernas de longe ----
  const p0 = PART;
  tube(buf, LEGS.pernaLonge.map(([x, y, z, r]) => [x, y, z, r]), MAT.pele, { flag: 3 });
  ellipsoid(buf, { cx: 296, cy: 400, rx: 18, ry: 9, rot: 0, z: -40, rz: 10 }, MAT.pele, { flag: 3 });
  for (let i = 0; i < 3; i++) spike(buf, [282 + i * 8, 404], [276 + i * 8, 414], 3, -30, MAT.garra);
  for (let p = p0 + 1; p <= PART; p++) buried.add(p);
  // pata dianteira de LONGE: sai atrás da primeira, mais escura, pulso e 3 garras (não fica enterrada)
  tube(buf, [[270, 362, -20, 11], [260, 388, -18, 8.5], [252, 397, -16, 7]], MAT.pele, { flag: 3 });
  ellipsoid(buf, { cx: 250, cy: 401, rx: 11, ry: 6, rot: 0, z: -16, rz: 6 }, MAT.pele, { flag: 3 });
  for (let i = 0; i < 3; i++) spike(buf, [243 + i * 7, 404], [239 + i * 7, 413], 2.4, -10, MAT.garra);
  // ---- espinha: pescoço + tronco + cauda (um tubo só) ----
  const spine = tube(buf, SPINE, MAT.pele, { scale: 1 });
  buried.add(spine.part);
  // espinhos dorsais: do lado oposto à barriga, diminuindo para a cauda e para a cabeça
  {
    let next = 6;
    const tips = [];
    for (const sm of spine) {
      if (sm.u < next) continue;
      const t = sm.u;
      const h = clamp(sm.r * 0.5, 3, 20) * (t < 60 ? 0.6 + t / 150 : 1);
      next = t + Math.max(6, h * 1.05);
      if (sm.x > 300 && sm.x < 440 && sm.y < 320) continue;          // coberto pela asa / raiz da asa
      const px = sm.ty, py = -sm.tx; // dorso
      const bx = sm.x + px * sm.r * 0.86, by = sm.y + py * sm.r * 0.86;
      const tip = [sm.x + px * (sm.r + h) - sm.tx * h * 0.55, sm.y + py * (sm.r + h) - sm.ty * h * 0.55];
      if (tips.some(([tx, ty]) => Math.hypot(tx - tip[0], ty - tip[1]) < h * 0.75)) continue;   // curva côncava: não amontoar em leque
      tips.push(tip);
      spike(buf, [bx, by], tip, Math.max(1.5, h * 0.42), sm.z - 4, MAT.chifre);
    }
  }
  // ---- ombro/peito (massa) ----
  ellipsoid(buf, { cx: 258, cy: 290, rx: 44, ry: 34, rot: -0.6, z: 24, rz: 34 }, MAT.pele, { u0: 1100, part: spine.part });   // fundido ao peito: sem contorno próprio
  // ---- coxa e canela traseiras: coxa (massa), canela para trás até o jarrete, metatarso, pé com dedos ----
  const coxa = ellipsoid(buf, { cx: 386, cy: 318, rx: 58, ry: 40, rot: -0.8, z: 20, rz: 42 }, MAT.pele, { u0: 600 });
  buried.add(coxa); buf.blocos.add(coxa);
  ellipsoid(buf, { cx: 382, cy: 298, rx: 42, ry: 26, rot: -0.3, z: 22, rz: 38 }, MAT.pele, { u0: 640, part: coxa });   // massa do quadril
  // joelho = QUEBRA angulosa: dois segmentos retos (a canela muda de direção), sem esfera colada; afunila até o tornozelo
  // joelho ~34° e jarrete ~44° de mudança de direção (segmentos retos), canela e pé mais grossos
  const can = tube(buf, [[384, 330, 34, 21], [410, 344, 36, 18]], MAT.pele, { u0: 900 }).part;
  tube(buf, [[410, 344, 36, 18], [424, 370, 38, 13]], MAT.pele, { u0: 930, part: can });
  tube(buf, [[424, 370, 38, 10], [416, 398, 42, 8]], MAT.pele, { u0: 960, part: can });   // metatarso
  foot(buf, 412, 404, 46, -1, 3, 1.35);
  // ---- perna da frente (perto): úmero grosso, cotovelo PARA TRÁS, antebraço afinando, pulso, mão com dedos ----
  const hum = tube(buf, [[252, 300, 40, 28], [262, 328, 42, 24], [272, 350, 44, 20]], MAT.pele, { u0: 1200, part: spine.part }).part;   // fundido ao peito (só valor, sem contorno)            // úmero
  // bíceps: sem forma própria; a luz em cima e a sombra que entra no membro vêm do próprio tubo do úmero
  ellipsoid(buf, { cx: 274, cy: 350, rx: 13, ry: 12, rot: 0, z: 52, rz: 10 }, MAT.pele, { u0: 1260 });       // cotovelo
  const ante = tube(buf, [[272, 350, 50, 17], [254, 366, 51, 14], [234, 384, 53, 10]], MAT.pele, { u0: 1270 }).part;  // antebraço: grosso em cima, afinando
  tube(buf, [[234, 384, 53, 8], [216, 389, 55, 7]], MAT.pele, { u0: 1295, part: ante });                        // pulso: o membro muda de direção
  ellipsoid(buf, { cx: 226, cy: 390, rx: 9, ry: 8, rot: 0, z: 58, rz: 7 }, MAT.pele, { u0: 1290, part: ante });   // pulso (mesmo volume do antebraço, sem contorno próprio)
  foot(buf, 212, 398, 60, -1, 4);
  // ---- asa de PERTO ----
  {
    const { ombro, cotovelo, pulso, dedos, raiz } = WING;
    const zw = 30;
    const panelDefs = [
      [pulso, dedos[0], ...scallop(dedos[0], dedos[1], pulso, 16), dedos[1]],
      [pulso, dedos[1], ...scallop(dedos[1], dedos[2], pulso, 18), dedos[2]],
      [pulso, dedos[2], ...scallop(dedos[2], dedos[3], pulso, 16), dedos[3]],
      [pulso, dedos[3], ...scallop(dedos[3], raiz[0], pulso, 12), raiz[0], raiz[1], ombro, cotovelo],
      [ombro, [316, 170], [336, 120], pulso, cotovelo], // propatágio (bordo de ataque, entre ombro e pulso)
    ];
    const normals = [[-0.35, -0.5, 0.8], [0.1, -0.1, 1], [0.45, 0.15, 0.88], [0.2, 0.35, 0.92], [-0.6, -0.4, 0.7]];
    panelDefs.forEach((pts, i) => { const p = polygon(buf, pts, MAT.membrana, zw - i * 0.1, normals[i], { flag: 1 }); wingInfo.panels.push({ part: p, far: false, i }); });
    // úmero nasce do ombro (grosso), cotovelo para trás, antebraço sobe até o pulso; dedos em ARCO
    tube(buf, [[...ombro, zw + 14, 23], [322, 232, zw + 14, 17], [350, 212, zw + 14, 12.5], [...cotovelo, zw + 14, 10]], MAT.pele, { u0: 1500 });
    tube(buf, [[...cotovelo, zw + 14, 10], [378, 140, zw + 14, 7.5], [...pulso, zw + 14, 5.5]], MAT.pele, { u0: 1600 });
    ellipsoid(buf, { cx: pulso[0], cy: pulso[1], rx: 9, ry: 8, rot: 0, z: zw + 18, rz: 6 }, MAT.pele, { u0: 1650 });   // nó do pulso
    for (const d of dedos) {
      const mx = (pulso[0] + d[0]) / 2, my = (pulso[1] + d[1]) / 2, L = Math.hypot(d[0] - pulso[0], d[1] - pulso[1]);
      const bx = -(d[1] - pulso[1]) / L, by = (d[0] - pulso[0]) / L;      // perpendicular: o dedo curva para o bordo de ataque
      tube(buf, [[...pulso, zw + 12, 5.5], [mx - bx * L * 0.07, my - by * L * 0.07, zw + 12, 3.8], [...d, zw + 12, 1.3]], MAT.pele, { u0: 1700 });
      wingInfo.bones.push([pulso, [mx - bx * L * 0.07, my - by * L * 0.07], false], [[mx - bx * L * 0.07, my - by * L * 0.07], d, false]);
    }
    spike(buf, [pulso[0] - 3, pulso[1] - 4], [pulso[0] - 14, pulso[1] - 24], 4, zw + 20, MAT.garra);
    spike(buf, [cotovelo[0] + 6, cotovelo[1] - 2], [cotovelo[0] + 18, cotovelo[1] - 12], 3, zw + 20, MAT.garra);
  }
  // ---- cabeça ----
  {
    const jawDrop = v === "dourado" ? 6 : 0;
    const jaw = HEAD.mandibula.map(([x, y, z, r], i) => [x, y + jawDrop * (i / 3), z, r]);
    polygon(buf, HEAD.boca.map(([x, y], i) => [x, y + (i >= 2 ? jawDrop : 0)]), MAT.boca, 12, [0, 0, 1]);
    tube(buf, HEAD.chifreLonge, MAT.chifre);
    const jp = tube(buf, jaw, MAT.pele, { u0: 2000, flat: 0.65 }).part;
    ellipsoid(buf, { cx: 206, cy: 154, rx: 11, ry: 9, rot: 0.3, z: 28, rz: 9 }, MAT.pele, { u0: 2050, part: jp });   // articulação da mandíbula
    const hp = tube(buf, HEAD.focinho, MAT.pele, { u0: 2100, flat: 0.7 }).part;
    ellipsoid(buf, HEAD.bochecha, MAT.pele, { u0: 2400, part: hp });
    ellipsoid(buf, HEAD.sobrancelha, MAT.pele, { u0: 2300, part: hp });     // crista da sobrancelha FUNDIDA ao crânio (sem linha)
    ellipsoid(buf, { cx: 121, cy: 131, rx: 10, ry: 7, rot: 0.3, z: 36, rz: 5 }, MAT.pele, { u0: 2350, part: hp }); // narina saliente
    ellipsoid(buf, { cx: 116, cy: 146, rx: 9, ry: 8, rot: 0.2, z: 34, rz: 6 }, MAT.pele, { u0: 2360, part: hp });   // pré-maxila: o focinho fecha em gancho sobre a mandíbula
    ellipsoid(buf, { cx: 142, cy: 168, rx: 11, ry: 5, rot: 0.15, z: 26, rz: 5 }, MAT.pele, { u0: 2010, part: jp }); // queixo
    tube(buf, HEAD.chifre, MAT.chifre);
    tube(buf, HEAD.chifreNariz, MAT.chifre);
    // espinhos da bochecha e do queixo, varrendo para trás
    spike(buf, [220, 140], [252, 148], 5, 30, MAT.chifre);
    spike(buf, [214, 158 + jawDrop], [240, 174 + jawDrop], 4.5, 30, MAT.chifre);
    // placas/chifrinhos sob o queixo, diminuindo para a frente
    for (const [x, y, l] of [[194, 164, 9], [178, 169, 7], [162, 173, 6], [146, 177, 5]]) spike(buf, [x, y + jawDrop], [x + l * 0.7, y + l + jawDrop], l * 0.35, 28, MAT.chifre);
    spike(buf, [236, 100], [264, 98], 4.5, 40, MAT.chifre);
    spike(buf, [234, 108], [258, 114], 3.5, 40, MAT.chifre);
    // dentes

  }
  smoothNormals(buf, 3);
  return { buf, wingInfo, spine, buried };
}

// ---------- pintura do dragão ----------
function shadeDragon(D, v) {
  const { buf, wingInfo } = D;
  const out = new Array(W * H).fill(null);
  const L = v === "normal" ? norm3(-0.55, -0.7, 0.5) : norm3(-0.25, 0.75, 0.6);   // dourado: luz de BAIXO (o rio de ouro)
  const B = v === "normal" ? norm3(0.1, 1, 0.2) : norm3(0.4, -0.6, 0.4);             // luz secundária: reflexo do ouro (normal) / brasa de cima (dourado)
  const Hh = norm3(L[0], L[1], L[2] + 1);
  const ramp = { pele: ["R1", "R2", "R3", "R4", "R5"], barriga: ["B1", "B2", "B3", "B3", "B4"], chifre: ["H0", "H1", "H2", "H3", "H4"], garra: ["H0", "H1", "H2", "H3", "H4"], membrana: ["M1", "M2", "M3", "M4", "M5"] };
  const panelOf = new Map(wingInfo.panels.map((p) => [p.part, p]));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x; const m = buf.mat[k]; if (!m) continue;
    const nx = buf.nx[k], ny = buf.ny[k], nz = buf.nz[k];
    const lam = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
    const bounce = Math.max(0, nx * B[0] + ny * B[1] + nz * B[2]);
    const spec = Math.pow(Math.max(0, nx * Hh[0] + ny * Hh[1] + nz * Hh[2]), 40);
    let val = Math.pow(lam, 1.25);                  // mais contraste: o lado de costas para a luz cai rápido para a sombra
    if (v === "dourado") {
      // METAL: reflete o ambiente. Normal para baixo = reflete o rio de ouro (claro); para cima = teto escuro;
      // de frente = salão (meio-tom). Um brilho especular quente de baixo-esquerda.
      val = clamp(0.47 + 0.6 * ny - 0.18 * nx + 0.1 * (1 - nz), 0, 1);
    }
    if (buf.flag[k] === 2) val *= m === MAT.pele ? 0.75 : 0.45;   // asa de longe: membrana na sombra, ossos pegam luz
    if (buf.flag[k] === 3) val *= 0.55;          // pernas de longe
    if (m === MAT.boca) {
      // boca: garganta em brasa (mais quente no fundo, à direita), céu da boca escuro, língua avermelhada embaixo
      const t = (x - 118) / 90 + Math.sin(y * 0.7 + x * 0.15) * 0.03;   // sem dither (virava grelha)
      let up = 0; for (let d = 1; d <= 3; d++) if (buf.mat[(y - d) * W + x] !== MAT.boca) { up = d; break; }
      let dn = 0; for (let d = 1; d <= 6; d++) if (buf.mat[(y + d) * W + x] !== MAT.boca) { dn = d; break; }
      const gum = up && up <= 2 + Math.round(Math.sin(x / 6) + 1);          // gengiva ondulada sob o focinho
      out[k] = up === 1 ? "R0" : gum ? "R3" : dn && dn <= 3 && t > 0.15 ? (t > 0.55 ? "F1" : "R4") : t > 0.72 ? "F2" : t > 0.55 ? "F1" : t > 0.35 ? "M3" : "M2";
      continue;
    }
    if (m === MAT.membrana) {
      const p = panelOf.get(buf.part[k]);
      // membrana translúcida: tom do painel + mais clara perto do bordo de fuga (a luz do ouro atravessa)
      // translúcida: clareia para o bordo de fuga, longe do pulso (a luz do salão atravessa a pele fina)
      const dw = Math.hypot(x - WING.pulso[0], y - WING.pulso[1]) / 220;
      let t = 0.1 + 0.6 * lam + 0.22 * clamp(dw, 0, 1);
      if (v === "dourado") t = 0.02 + 0.22 * lam + 0.42 * clamp(dw, 0, 1) + clamp((y - 120) / 380, 0, 0.15);
      // distância ao osso de dedo mais próximo: perto do osso a membrana é mais grossa (normal: escurece) ou reflete (dourado: clareia)
      let db = 99;
      for (const [w0, d0, far] of wingInfo.bones) {
        if (!!far !== !!(p && p.far)) continue;
        const vx = d0[0] - w0[0], vy = d0[1] - w0[1], L2 = vx * vx + vy * vy;
        const tt = clamp(((x - w0[0]) * vx + (y - w0[1]) * vy) / L2, 0, 1);
        db = Math.min(db, Math.hypot(x - w0[0] - vx * tt, y - w0[1] - vy * tt));
      }
      if (db < 9) t += (v === "dourado" ? -0.2 : -0.12) * (1 - db / 9);
      if (v === "dourado" && !(p && p.far)) {
        // película de ouro escorrendo dos ossos para dentro do painel: manchas verticais, mais claras junto ao osso
        const f = vnoise(x / 2.6 + 11, y / 40);
        if (db < 6 + 18 * f && f > 0.5) t += 0.32 * (1 - db / 26);
        // especular fino na borda livre (painéis 0–2)
        if (p && p.i <= 2 && buf.mat[k + W] !== MAT.membrana && buf.mat[k + W] !== MAT.pele) { out[k] = "R5"; continue; }
      }
      if (v === "normal" && !(p && p.far)) {
        t += 0.22 * clamp((db - 10) / 30, 0, 1);                                     // borda livre mais clara/quente
        const bd = Math.abs((x - 0.55 * y) - 372);                                  // um feixe de luz cruza 1–2 painéis
        if (bd < 13) t += bd < 9 ? 0.3 : 0.15;
      }
      if (p && p.far) t = 0.12 + 0.2 * lam + (v === "dourado" ? clamp((y - 100) / 500, 0, 0.2) : 0);
      const tone = clamp(Math.floor(t * 5 + (bayer(x, y) - 0.5) * 0.5), 0, 4);
      out[k] = ramp.membrana[tone];
      continue;
    }
    let matName = m === MAT.chifre ? "chifre" : m === MAT.garra ? "garra" : "pele";
    const s = buf.s[k], R = buf.r[k];
    if (v === "dourado") {
      // METAL POR REFLEXÃO: o vetor refletido (olho -> superfície) aponta para o rio (claro/laranja), para as paredes
      // (escuras) ou para o teto (escuro, com uma faixa fina e dura de brilho = o clarão da forja refletido).
      const ry = 2 * nz * ny, rx = 2 * nz * nx;
      const d = (bayer(x, y) - 0.5) * 0.06;
      let tg, nm = null;
      // a faixa especular varia de espessura ao longo do corpo e é interrompida (não é um friso de cromo idêntico)
      const nb = vnoise(buf.u[k] / 22 + buf.part[k] * 3.7, buf.part[k] * 1.3);
      const seg = vnoise(buf.u[k] / 9 + buf.part[k] * 5.1, 0.5);
      const arcUp = buf.part[k] === D.spine.part ? 0.14 * Math.exp(-(((x - 330) / 60) ** 2)) : 0;   // no dorso a faixa sobe ~4 px no meio (arco)
      const sC = -0.47 - arcUp + 0.09 * Math.sin(buf.u[k] / 38 + buf.part[k]), sW = 0.03 + 0.07 * nb;   // faixa que ondula com o arco e varia de 1 a 3 px
      const sLo = sC - sW, sHi = sC + sW;
      const isTorso = buf.part[k] === D.spine.part && buf.u[k] > 150 && buf.u[k] < 440;
      const sOn = isTorso ? seg > 0.3 : buf.part[k] % 2 ? seg > 0.38 && nb > 0.2 : seg > 0.8;     // metade dos tubos: faixa em 2–3 segmentos; outra metade: só um ponto de brilho
      // 3 zonas largas: topo (dourado médio) -> UMA sombra que cresce para baixo -> reflexo do rio na borda de baixo
      if (ry > 0.5) {   // o rio só aparece junto à borda de baixo de cada volume (sem "adesivo" oval no meio)
        let gp = 0; for (let dd = 1; dd <= 5; dd++) { const q = (y + dd) * W + x; if (y + dd >= H || !buf.mat[q] || buf.part[q] !== buf.part[k]) { gp = dd; break; } }
        if (gp === 1) nm = "rim2"; else if (gp === 2 || gp === 3) nm = "rim1"; else if (gp) tg = 3; else tg = 0;
      }
      else if (ry > 0.22) tg = 0;
      else if (ry > 0.14) nm = "Rg1";                           // 1 tom de transição (sem dither)
      else if (ry > -0.08) tg = 1;
      else if (ry > -0.16) nm = "Rg2";
      else if (ry > sHi || ry < sLo || !sOn) tg = 2;
      else nm = R > 6 ? "R6" : "R5";                          // especular: segmento curvo de 1–3 px
      if (!nm && tg <= 2 && rx > 0.35 && ry < 0.5) tg = Math.max(0, tg - 1);      // lado direito (oposto à forja): sombra contínua
      // oclusão: perto de uma parte que está NA FRENTE (pata junto à barriga), escurece
      if (!buf.flag[k] && buf.part[k] !== D.spine.part) {
        let occ = 0;
        for (const [dx, dy] of [[4, 0], [-4, 0], [0, 4], [0, -4], [3, 3], [-3, 3], [7, 0], [-7, 0], [0, 7]]) {
          const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const q = yy * W + xx; if (buf.mat[q] && buf.part[q] !== buf.part[k] && buf.z[q] > buf.z[k] + 8) occ++;
        }
        if (occ >= 2) { nm = null; tg = Math.min(tg ?? 3, occ >= 4 ? 1 : 2); }
      }
      if (buf.flag[k] === 3) tg = Math.min(tg ?? 1, 1), nm = null;
      if (buf.flag[k] === 2) { tg = Math.max(0, (tg ?? 3) - 1); nm = null; }
      if (nz < 0.3 && ny > -0.15 && !buf.flag[k]) nm = "rim2";    // contraluz do rio na silhueta
      // lado de baixo do TRONCO: curva escura (de costas para o teto, ofuscada); contraluz laranja só nos 2–3 px de baixo
      if (buf.part[k] === D.spine.part && buf.u[k] > 150 && buf.u[k] < 440 && ny > 0.12) {
        let gap = 0; for (let dd = 1; dd <= 4; dd++) { const q = (y + dd) * W + x; if (y + dd >= H || !buf.mat[q] || buf.part[q] !== buf.part[k]) { gap = dd; break; } }
        // só a borda de baixo (3–4 px) pega o reflexo do rio, em 2 tons laranja -> metal; o resto do ventre é marrom escuro
        if (gap === 1 || gap === 2) nm = "rim1";
        else if (gap >= 3) { nm = null; tg = 2; }
        else { nm = null; tg = ny < 0.4 ? 0 : 1; }                                    // reflexo laranja da piscina subindo pela metade de baixo
      }
      // escamas em 1 tom só na meia-luz (e sugeridas nas bordas)
      const torso = buf.part[k] === D.spine.part && buf.u[k] > 150 && buf.u[k] < 440;
      if (false) {   // dourado: sem grade de escamas (o ouro cobre tudo; só tons lisos)
        const ss = clamp(R * 0.17, 3, 8), arc = Math.asin(clamp(s, -1, 1)) * R;
        const a = buf.u[k] / ss, j = Math.floor(a), fy = a - j, b = arc / ss + (j & 1) * 0.5, fx = b - Math.floor(b) - 0.5;
        if (Math.abs(fy - (0.5 + 0.5 * Math.sqrt(Math.max(0, 1 - 4 * fx * fx)))) * ss < 0.55) tg -= 1;
      }
      if (buf.part[k] === D.spine.part && buf.u[k] < 160 && (!buf.mat[k - 1] || !buf.mat[k - 2] || buf.part[k - 2] !== buf.part[k])) nm = "rim1";   // borda esquerda do pescoço: reflexo laranja de 2 px
      const gr = m === MAT.pele ? ["R1", "R2", "R3", "R4", "R5"] : ["R0", "R1", "R3", "R4", "R6"];
      out[k] = nm || gr[clamp(tg, 0, 4)];
      continue;
    }
    const isBelly = m === MAT.pele && R > 8 && buf.u[k] < 1100 && s > 0.62 && !buf.flag[k];
    if (isBelly) matName = "barriga";
    let tone = clamp(Math.floor(val * 5), 0, 4);
    const tone0 = tone, frac = val * 5 - Math.floor(val * 5);
    if (v === "normal" && buf.part[k] === D.spine.part && ((buf.u[k] > 150 && buf.u[k] < 440) || (buf.u[k] >= 1200 && buf.u[k] < 1300))) {   // oclusão sob o ventre e atrás do cotovelo
      let occ = 0;
      for (const [dx, dy] of [[6, 0], [-6, 0], [0, 6], [0, -6], [5, 5], [-5, 5], [11, 0], [-11, 0], [0, 11], [8, 8], [-8, 8]]) {
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const q = yy * W + xx; if (buf.mat[q] && buf.part[q] !== buf.part[k] && buf.z[q] > buf.z[k] + 6 && !buf.flag[q]) occ++;
      }
      if (occ >= 2) tone = Math.max(0, tone - (occ >= 5 ? 2 : 1));
    }
    // escamas que seguem o volume (tubo: linhas = ao longo do comprimento; colunas = em volta)

    // oclusão sob a barriga/peito e dentro das dobras: o tronco ganha volume em vez de faixas
    if (v === "normal" && m === MAT.pele && !buf.flag[k] && ny > 0.4 && y > 300 && y < 380) tone = Math.max(0, tone - 1);
    const scaleOn = v === "normal" ? tone >= 2 && tone <= 3 && frac >= 0.2 && ny < 0.05 && !(buf.part[k] === D.spine.part && y > 306 && buf.u[k] < 440) : nz < 0.45 && tone >= 1;   // escamas só na meia-luz   // dourado: a grade some sob o ouro (só sugere nas bordas)
    if (matName === "pele" && R > 5 && scaleOn) {
      let ss = buf.u[k] >= 2000 ? 3.5 : clamp(R * 0.17, 3, 8);
      if (buf.part[k] === D.spine.part && buf.u[k] > 150 && buf.u[k] < 1000) ss *= 1 - 0.32 * clamp((buf.u[k] - 220) / 200, 0, 1) - 0.15 * clamp((buf.u[k] - 420) / 300, 0, 1);   // ~30% menores perto do quadril/cauda
      if (buf.blocos.has(buf.part[k])) ss *= 0.7;                                                                          // coxa: escamas menores
      const arc = Math.asin(clamp(s, -1, 1)) * R;
      // fileiras ARQUEADAS: o anel em volta do cilindro, visto um pouco de cima, curva nas bordas
      const uu = buf.u[k] + 0.85 * R * (1 - Math.sqrt(Math.max(0, 1 - s * s)));
      const a = uu / ss, j = Math.floor(a), fy = a - j;
      const b = arc / ss + (j & 1) * 0.5, fx = b - Math.floor(b) - 0.5;
      const edgeY = 0.5 + 0.5 * Math.sqrt(Math.max(0, 1 - 4 * fx * fx));
      const dist = Math.abs(fy - edgeY) * ss;
      if (dist < 0.55) tone -= 1;
      else if (fy < 0.3 && Math.abs(fx) < 0.22 && tone >= 3 && spec > 0.25) tone = Math.min(4, tone + 1);
    }
    if ((m === MAT.chifre) && buf.hornLen.has(buf.part[k])) {
      const Lh = buf.hornLen.get(buf.part[k]), uh = buf.u[k];
      tone = ny < -0.45 && nx < 0.2 ? 4 : ny < 0.25 ? 3 : 2;             // creme claro em cima-esquerda, bege, marrom-acinzentado embaixo
      if (uh > Lh * 0.72) tone = Math.max(1, tone - 1);                    // ponta mais escura
      if (uh < Lh * 0.3 && uh > 3 && Math.round(uh) % 4 === 0) tone = Math.max(1, tone - 2);   // anéis de 1 px na base
    }
    if (matName === "barriga") {
      const bs = clamp(R * 0.18, 4, 9);
      const f = buf.u[k] / bs - Math.floor(buf.u[k] / bs);
      if (f * bs < 1 && tone >= 1) tone -= 1;
    }
    let beamMid = false;
    if (v === "normal" && tone < 4 && lam > 0.25) {              // o raio da janela acende o que ele cruza (cabeça e peito)
      const t = y / 430, xl = 70 + 120 * t, xr = 150 + 230 * t;
      const bnd = 112 + 14 * buf.s[k];                                   // limite curvo, seguindo o ombro
      const head = buf.u[k] >= 2000, neck = buf.part[k] === D.spine.part && buf.u[k] < bnd;
      const edgeBand = buf.part[k] === D.spine.part && buf.u[k] >= bnd && buf.u[k] < bnd + 3;
      if (x > xl + 6 && x < xr - 6) { if (head || neck) tone += 1; else if (edgeBand && tone < 4) beamMid = true; }   // só cabeça e pescoço, pela parte (sem emenda reta)
    }
    let name = ramp[matName][tone];
    if (beamMid && matName === "pele") name = ["Ra", "Rb", "Rc", "Rd"][tone];
    // 1 tom intermediário SÓLIDO na borda de cada placa de luz (sem dither)
    if (v === "normal" && matName === "pele" && tone === tone0 && tone >= 1 && frac < 0.12) name = ["Ra", "Rb", "Rc", "Rd"][tone - 1];
    if (matName === "pele") {
      if (bounce > 0.55 && tone <= 2 && nz < 0.5 && R >= 8 && buf.u[k] < 2000) name = bounce > 0.8 || nz < 0.2 ? "rim2" : "rim1";
    } else if (bounce > 0.75 && tone <= 0 && matName === "barriga") name = "B2";
    out[k] = name;
  }
  if (v === "dourado") {
    const hr = (x, y) => { let n = Math.imul(x, 374761393) + Math.imul(y, 668265263); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
    const base = out.slice();
    for (let y = 1; y < H - 8; y++) for (let x = 1; x < W - 1; x++) {
      const k = y * W + x;
      if (base[k] !== "R6" || base[k + W] === "R6" || hr(x, y) > 0.035 || hr(x >> 3, y) > 0.6) continue;
      const len = 3 + Math.floor(hr(y, x) * 5);
      for (let j = 1; j <= len; j++) { const q = (y + j) * W + x; if (buf.mat[q] !== MAT.pele) break; out[q] = j < len ? "R5" : "R4"; if (j > 1 && out[q + 1]) out[q + 1] = "R3"; }
    }
    // 3 escorridos de ouro descendo dos ossos dos dedos pela membrana
    const segs = wingInfo.bones.filter((b) => !b[2]);
    for (const i of [1, 3, 5]) {
      const sg = segs[i]; if (!sg) continue;
      const x0 = Math.round((sg[0][0] + sg[1][0]) / 2), y0 = Math.round((sg[0][1] + sg[1][1]) / 2) + 3;
      const len = 10 + (i * 3);
      for (let j = 0; j < len; j++) { const q = (y0 + j) * W + x0; if (buf.mat[q] !== MAT.membrana && buf.mat[q] !== MAT.pele) break; out[q] = "R5"; out[q + 1] = j > len * 0.3 ? "R4" : "R3"; }
      for (const [dx, dy, c] of [[0, len, "R5"], [1, len, "R4"], [-1, len + 1, "R4"], [0, len + 1, "R6"], [1, len + 1, "R3"], [0, len + 2, "R3"]]) out[(y0 + dy) * W + x0 + dx] = c;
    }
  }
  // nervuras da asa (linhas finas da membrana, do pulso para o bordo)
  for (const [w, d] of wingInfo.bones) {
    // nervuras secundárias entre os dedos: amostras ao longo do osso desviando para os lados
    for (const off of [-0.18, 0.18]) {
      const steps = 120;
      for (let i = 10; i < steps; i++) {
        const t = i / steps;
        const x = Math.round(w[0] + (d[0] - w[0]) * t + -(d[1] - w[1]) * off * t * 0.5);
        const y = Math.round(w[1] + (d[1] - w[1]) * t + (d[0] - w[0]) * off * t * 0.5);
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const k = y * W + x;
        if (buf.mat[k] === MAT.membrana) out[k] = buf.flag[k] === 2 ? "M0" : "M1";
      }
    }
  }
  // linhas internas: onde uma parte da FRENTE encosta numa de trás, a de trás ganha uma linha escura
  const res = out.slice();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x; if (!out[k]) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const q = yy * W + xx;
      if (buf.mat[q] && buf.part[q] !== buf.part[k] && buf.z[q] > buf.z[k] + 6) {
        res[k] = buf.mat[k] === MAT.membrana ? "M0" : buf.mat[k] === MAT.chifre || buf.mat[k] === MAT.garra ? "H0" : "R0";
        break;
      }
    }
  }
  // quebra de ângulo no joelho e no pulso: sombra em CUNHA no lado de dentro da dobra
  const wedge = (pts) => { const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]); for (let y = Math.min(...ys); y <= Math.max(...ys); y++) for (let x = Math.min(...xs); x <= Math.max(...xs); x++) if (inPoly(x + 0.5, y + 0.5, pts) && res[y * W + x] && buf.mat[y * W + x] === MAT.pele) res[y * W + x] = v === "dourado" ? "R0" : "R1";
    if (v === "dourado") {   // no metal escuro a cunha só aparece com a aresta da dobra acesa
      const [[x0, y0], [x1, y1]] = pts, n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let i = 0; i <= n; i++) { const xx = Math.round(x0 + ((x1 - x0) * i) / n), yy = Math.round(y0 + ((y1 - y0) * i) / n) - 1; if (res[yy * W + xx] && buf.mat[yy * W + xx] === MAT.pele) res[yy * W + xx] = "R5"; }
    }
  };
  wedge([[402, 346], [416, 348], [408, 360]]);       // joelho (dentro da dobra)
  wedge([[418, 366], [432, 368], [424, 380]]);       // jarrete
  wedge([[224, 389], [240, 386], [232, 398]]);       // pulso (embaixo da dobra)
  // olho: amêndoa grande sob a sobrancelha, íris amarelo->laranja, pupila em fenda, brilho, contorno escuro
  const [ex, ey] = HEAD.olho;
  // olho ~12x7: pálpebra/sombra da sobrancelha cobrindo o terço de cima (olhar ameaçador), íris amarela->laranja,
  // pupila em FENDA vertical, 1 px de brilho
  const EYE = [
    "...RRRRRR...",
    ".RRLLLLLLRR.",
    "RLLLLLPLLLLR",
    "RaEEEEPEEEER",
    ".REEEEPEEER.",
    "..RFFFPFFR..",
    "....RRRR....",
  ];
  const EK = { R: "R0", L: "R1", P: "R0", a: "E3", E: "E2", F: "E1" };
  EYE.forEach((row, jj) => [...row].forEach((c, ii) => { if (c !== ".") res[(ey - 3 + jj) * W + ex - 6 + ii] = EK[c]; }));
  for (let ii = 1; ii < 11; ii++) { const q = (ey - 4) * W + ex - 6 + ii; if (res[q] && buf.mat[q] === MAT.pele) res[q] = "R1"; }   // sombra da crista
  // dentes: de cima descem da borda do focinho, de baixo sobem da mandíbula (marfim, luz à esquerda)
  const tooth = (x, y0, len, dir) => { const w0 = len >= 8 ? 4 : 3; for (let j = 0; j < len; j++) { const wdt = j < len * 0.5 ? w0 : j < len * 0.8 ? w0 - 1 : 1; for (let i = 0; i < wdt; i++) { const k = (y0 + dir * j) * W + x + i; res[k] = i === 0 ? "H4" : i < wdt - 1 ? "H3" : "H2"; } } };
  for (const [x, len] of [[123, 6], [131, 5], [140, 11], [151, 5], [161, 6], [171, 4], [185, 9], [194, 4]]) {
    let yt = -1; for (let y = 120; y < 185; y++) if (D.buf.mat[y * W + x] === MAT.boca) { yt = y; break; }
    if (yt >= 0) tooth(x, yt, len, 1);
  }
  for (const [x, len] of [[128, 5], [146, 8], [158, 4], [176, 7], [190, 4]]) {
    let yb = -1; for (let y = 185; y > 120; y--) if (D.buf.mat[y * W + x] === MAT.boca) { yb = y; break; }
    if (yb >= 0) tooth(x, yb, len, -1);
  }
  // narina
  for (const [x, y] of [[116, 131], [117, 131], [118, 131], [117, 132], [118, 132], [119, 132]]) res[y * W + x] = "R0";
  return res;
}

// ======================================================================================
// CENA
// ======================================================================================
function build(v) {
  const P = palette(v);
  const names = Object.keys(P);
  const K = (n) => { if (n === ".") return "."; const i = names.indexOf(n); if (i < 0) throw new Error("cor desconhecida: " + n); return KEYS[i]; };
  const cmds = [];
  for (let i = 0; i < names.length; i += 60) cmds.push({ name: "set_palette", input: { colors: names.slice(i, i + 60).map((n, j) => ({ key: KEYS[i + j], hex: P[n], name: n })) } });
  const LAYERS = ["fundo", "parede", "colunas_longe", "colunas_meio", "ouro_longe", "raio", "colunas_perto", "ouro", "reflexo", "objetos", "fumaca_tras", "dragao", "ouro_frente", "brilhos", "fumaca", "vinheta"];
  for (const l of LAYERS) cmds.push({ name: "add_layer", input: { name: l } });
  const INT = ["x", "y", "w", "h", "x1", "y1", "x2", "y2"];
  const fix = (sh) => { const o = { ...sh }; for (const k of INT) if (typeof o[k] === "number") o[k] = Math.round(o[k]); if (o.w !== undefined) o.w = Math.max(1, o.w); if (o.h !== undefined) o.h = Math.max(1, o.h); if (o.points && o.type !== "curve") o.points = o.points.map(([a, b]) => [Math.round(a), Math.round(b)]); return o; };
  const draw = (layer, shapes) => { shapes = shapes.map(fix); for (let i = 0; i < shapes.length; i += 200) cmds.push({ name: "draw_shapes", input: { layer, shapes: shapes.slice(i, i + 200), preview: false } }); };
  const tf = (layer, input) => cmds.push({ name: "transform", input: { frames: 0, layer, preview: false, ...input } });
  const rows = (layer, grid) => {
    // grid: array W*H de nomes (ou null) -> draw_rows em blocos de linhas
    let y0 = -1; const lines = [];
    const flush = () => { if (lines.length) cmds.push({ name: "draw_rows", input: { layer, x: 0, y: y0, rows: lines.splice(0), dot_is_transparent: false, preview: false } }); };
    for (let y = 0; y < H; y++) {
      let any = false, line = "";
      for (let x = 0; x < W; x++) { const c = grid[y * W + x]; if (c) { any = true; line += K(c); } else line += " "; }
      if (!any) { flush(); y0 = -1; continue; }
      if (y0 < 0) y0 = y;
      lines.push(line);
      if (lines.length >= 64) { flush(); y0 = y + 1; }
    }
    flush();
  };
  const gold = v === "dourado";
  const rnd = prng(gold ? 77 : 11);

  // ---------- fundo: ar do salão ----------
  draw("fundo", [
    { type: "gradient", x: 0, y: 0, w: W, h: H, colors: ["bg0", "bg1", "bg2", "bg3", "bg4", "bg5", "bg6"].map(K), direction: "vertical", dither: "bayer4", suavidade: 0.7, ondas: 3 },
    { type: "gradient", x: 0, y: 140, w: W, h: 372, direction: "radial", cx: 300, cy: 420, r: 260, colors: [K("air"), K("bg6"), K("bg5"), K("bg4"), "."], dither: "bayer4", suavidade: 0.8 },
  ]);
  // parede do fundo: grande portal de anão (arco de pedra com degraus) no ponto de fuga
  const VX = 300, VY = 330;
  {
    const sh = [];
    // paredão
    sh.push({ type: "rect", x: 150, y: 60, w: 300, h: 320, color: K("st1"), filled: true });
    // portal: moldura em degraus (geometria anã) e vão escuro
    for (let i = 0; i < 4; i++) {
      const w = 150 - i * 22, h = 230 - i * 22, x = VX - w / 2, y = 120 + i * 14;
      const top = [[x, y + 50], [x + w * 0.2, y + 18], [x + w / 2, y], [x + w * 0.8, y + 18], [x + w, y + 50], [x + w, 380], [x, 380]].map(([a, b]) => [Math.round(a), Math.round(b)]);
      sh.push({ type: "polygon", points: top, color: K(["st2", "st1", "st3", "bg2"][i]) });
    }
    // runas: faixas horizontais finas na parede
    for (let y = 80; y < 380; y += 26) sh.push({ type: "line", x1: 150, y1: y, x2: 450, y2: y, color: K("st0") });
    for (let y = 80; y < 380; y += 26) for (let x = 150 + ((y / 26) % 2) * 20; x < 450; x += 40) sh.push({ type: "line", x1: x, y1: y, x2: x, y2: y + 26, color: K("st0") });
    draw("parede", sh);
    draw("parede", [{ type: "gradient", x: 150, y: 60, w: 300, h: 320, colors: [K("st1"), K("st2"), K("st3")], direction: "vertical", dither: "bayer4", suavidade: 0.6, only: K("st1") }]);
    tf("parede", { op: "haze", color: K(gold ? "bg5" : "bg4"), quantidade: 0.55 });
  }
  // colunas em perspectiva: fileiras dos dois lados convergindo para (VX, VY)
  const column = (cx, w, top, bot, lit) => {
    const sh = [];
    const x = Math.round(cx - w / 2);
    sh.push({ type: "rect", x, y: top, w, h: bot - top, color: K("st2"), filled: true });
    // face iluminada (lado da luz/da luz do ouro) e face na sombra
    const lw = Math.max(2, Math.round(w * 0.32));
    if (lit === "esq") { sh.push({ type: "rect", x, y: top, w: lw, h: bot - top, color: K("st3"), filled: true }); sh.push({ type: "rect", x: x + w - Math.max(1, Math.round(w * 0.2)), y: top, w: Math.max(1, Math.round(w * 0.2)), h: bot - top, color: K("st1"), filled: true }); }
    else { sh.push({ type: "rect", x: x + w - lw, y: top, w: lw, h: bot - top, color: K("st3"), filled: true }); sh.push({ type: "rect", x, y: top, w: Math.max(1, Math.round(w * 0.2)), h: bot - top, color: K("st1"), filled: true }); }
    // capitel em degraus e base
    const cw = Math.round(w * 1.35), ch = Math.max(3, Math.round(w * 0.35));
    const capY = top + Math.round(w * 1.2);
    sh.push({ type: "rect", x: Math.round(cx - cw / 2), y: capY, w: cw, h: ch, color: K("st3"), filled: true });
    sh.push({ type: "rect", x: Math.round(cx - cw / 2), y: capY + ch, w: cw, h: Math.max(1, Math.round(ch / 3)), color: K("st0"), filled: true });
    sh.push({ type: "rect", x: Math.round(cx - (w * 1.15) / 2), y: capY - ch, w: Math.round(w * 1.15), h: ch, color: K("st2"), filled: true });
    // sulcos verticais (caneluras) e faixas rúnicas
    const n = Math.max(1, Math.floor(w / 9));
    for (let i = 1; i <= n; i++) { const xx = x + Math.round((w * i) / (n + 1)); sh.push({ type: "line", x1: xx, y1: capY + ch + 2, x2: xx, y2: bot, color: K("st1") }); }
    for (let yy = capY + ch + Math.round(w * 1.5); yy < bot; yy += Math.round(w * 1.6)) sh.push({ type: "rect", x, y: yy, w, h: Math.max(1, Math.round(w / 12)), color: K("st0"), filled: true });
    return sh;
  };
  const colRow = (layer, list) => { const sh = []; for (const c of list) sh.push(...column(...c)); draw(layer, sh); };
  // longe: estreitas, perto do portal
  colRow("colunas_longe", [[178, 16, 40, 372, "dir"], [214, 14, 70, 366, "dir"], [392, 14, 70, 366, "esq"], [428, 16, 40, 372, "esq"]]);
  // arcos entre as colunas de longe
  draw("colunas_longe", [
    { type: "polygon", points: [[170, 40], [222, 40], [222, 70], [196, 52], [170, 70]], color: K("st2") },
    { type: "polygon", points: [[384, 40], [436, 40], [436, 70], [410, 52], [384, 70]], color: K("st2") },
    { type: "rect", x: 150, y: 20, w: 300, h: 22, color: K("st1"), filled: true },
  ]);
  tf("colunas_longe", { op: "haze", color: K(gold ? "bg5" : "bg4"), quantidade: 0.45 });
  colRow("colunas_meio", [[116, 30, 0, 384, "dir"], [478, 30, 0, 384, "esq"]]);
  tf("colunas_meio", { op: "haze", color: K(gold ? "bg5" : "bg4"), quantidade: 0.22 });
  colRow("colunas_perto", [[24, 66, 0, 512, "dir"]]);
  // o ouro ilumina a base das colunas (luz quente de baixo)
  for (const l of ["colunas_meio", "colunas_perto"]) draw(l, [{ type: "gradient", x: 0, y: 250, w: W, h: 262, colors: [K("st2"), K("st3"), K("st4"), K("st5")], direction: "vertical", dither: "bayer4", suavidade: 0.7, only: K("st3") }]);
  tf("colunas_perto", { op: "haze", color: K("bg0"), quantidade: 0.35 });

  // ---------- pilhas de ouro ao longe ----------
  if (!gold) {
    const sh = [];
    const mound = (cx, top, w, base) => { const pts = []; for (let i = 0; i <= 48; i++) { const t = i / 48, x = cx - w / 2 + t * w; pts.push([Math.round(x), Math.round(base - (base - top) * Math.pow(Math.sin(t * Math.PI), 0.7) + Math.sin(t * 19) * 4 + Math.sin(t * 7 + cx) * 6 + (rnd() - 0.5) * 4)]); } return { type: "polygon", points: [...pts, [cx + w / 2, base + 30], [cx - w / 2, base + 30]], color: K("g3") }; };
    sh.push(mound(92, 352, 110, 400), mound(150, 326, 90, 400), mound(206, 346, 100, 400), mound(120, 368, 70, 400), mound(420, 340, 240, 392), mound(300, 358, 200, 400));
    draw("ouro_longe", sh);
    // 2 tons sólidos (sem dither): faixa de cima g3, corpo g2; 2–3 fileiras de moedas na crista com brilho só no topo
    const crest = [];
    for (const m of sh) {
      const top = m.points.slice(0, 49);
      crest.push({ type: "polygon", points: [...top.map(([x, y]) => [x, y + 12]), ...top.slice().reverse()], color: K("g3") });
      const body = { type: "polygon", points: [...top.map(([x, y]) => [x, y + 12]), [top[48][0], 430], [top[0][0], 430]], color: K("g2") };
      crest.push(body);
      for (let r = 0; r < 3; r++) for (let q = 1; q < 48; q += 2) {
        const [cx, cy] = top[q]; const yy = cy + 1 + r * 4 + ((q + r) % 2);
        crest.push({ type: "ellipse", x: cx - 3 + (r % 2) * 2, y: yy, w: 7, h: 3, color: K(r === 0 ? "g4" : "g3"), filled: true });
        crest.push({ type: "line", x1: cx - 2 + (r % 2) * 2, y1: yy + 2, x2: cx + 2 + (r % 2) * 2, y2: yy + 2, color: K("g2") });
        if (r === 0 && q % 4 === 1) crest.push({ type: "pixels", points: [[cx - 1, yy]], color: K("g6") });
      }
    }
    draw("ouro_longe", crest);
    tf("ouro_longe", { op: "haze", color: K("bg5"), quantidade: 0.3 });
  }

  // ---------- raio de luz (janela alta à esquerda) ----------
  if (!gold) {
    // raio volumétrico: densidade de dither que cai com a distância da janela e nas bordas do feixe
    // (ATRITO: gradient com "." preserva o pixel em vez de apagar, então o degradê até transparente é feito aqui)
    const bg = new Array(W * H).fill(null);


    for (let y = 0; y < 430; y++) {
      const t = y / 430, xl = 70 + (190 - 70) * t, xr = 150 + (380 - 150) * t;
      for (let x = Math.floor(xl); x <= Math.ceil(xr); x++) {
        if (x < 0 || x >= W) continue;
        // tons SÓLIDOS em 3 faixas (o ar iluminado), dither só na borda de 3–4 px e no fim, onde o feixe some no ouro
        const u = (x - xl) / (xr - xl), c = Math.abs(u - 0.5) * (xr - xl), half = (xr - xl) / 2;
        const toEdge = half - c, b = bayer(x, y);
        if (toEdge < 4 && b > toEdge / 4) continue;
        if (y > 334) continue;                                   // o feixe termina antes do monte (sem xadrez sobre o ouro)
        if (y > 306) { bg[y * W + x] = "beamO"; continue; }
        bg[y * W + x] = c + (bayer(x + 1, y + 2) - 0.5) * 3 < half * 0.35 ? "beam" : c + (bayer(x + 3, y) - 0.5) * 3 < half * 0.7 ? "beamM" : "beamO";
      }
    }
    rows("raio", bg);
  }

  // ---------- dragão ----------
  const D = buildDragon(v);
  const grid = shadeDragon(D, v);

  // ---------- montanha de ouro (normal) / rio de ouro derretido (dourado) ----------
  const HX = (x) => 344 + ((x - 310) / 250) ** 2 * 95 + Math.sin(x * 0.05) * 4;
  const SURF = 398; // superfície do ouro derretido
  if (!gold) {
    const pts = []; for (let x = 0; x <= W; x += 4) pts.push([x, Math.round(HX(x))]);
    draw("ouro", [{ type: "polygon", points: [...pts, [W, H], [0, H]], color: K("g2") }]);
    draw("ouro", [{ type: "gradient", x: 0, y: 330, w: W, h: 182, colors: [K("g3"), K("g2"), K("g1")], direction: "vertical", dither: "bayer4", suavidade: 0.8, only: K("g2") }]);
    // moedas: de trás para frente; o tom depende da luz (raio de luz + sombra do dragão + borda escura)
    const G = ["g0", "g1", "g2", "g3", "g4", "g5", "g6"];
    const light = (x, y) => {
      let l = 0.42 + 0.42 * Math.exp(-(((x - 250) / 130) ** 2) - (((y - 380) / 70) ** 2));
      l += 0.12 * (1 - Math.abs(x - 300) / 300) + 0.22 * (vnoise(x / 26, y / 11) - 0.5);
      const dk = y * W + x;
      const shadowed = D.buf.mat[Math.max(0, dk - 30 * W)] && y > 340;   // sob o corpo do dragão
      if (shadowed) l -= 0.25;
      l -= Math.max(0, (y - 470) / 120);
      return l;
    };
    const coins = [];
    for (let i = 0; i < 5200; i++) {
      const x = Math.floor(rnd() * W), top = HX(x);
      const y = Math.floor(top - 2 + Math.pow(rnd(), 1.3) * (H - top + 6));
      coins.push([x, y]);
    }
    coins.sort((a, b) => a[1] - b[1]);
    const sh = [];
    for (const [x, y] of coins) {
      const scale = 0.7 + (y - 330) / 300;
      const w = Math.max(5, Math.round((7 + rnd() * 4) * scale)), h = Math.max(3, Math.round(w * (0.42 + rnd() * 0.1)));
      const t = clamp(Math.round(light(x, y) * 6 + (rnd() - 0.5) * 1.4), 1, 5);
      if (rnd() < 0) { // moeda em pé (de lado) — desligado: virava "grama"
        sh.push({ type: "ellipse", x, y: y - h * 2, w: Math.max(3, Math.round(h * 0.9)), h: w, color: K(G[t - 1]), filled: true });
        sh.push({ type: "line", x1: x + 1, y1: y - h * 2 + 1, x2: x + 1, y2: y - h * 2 + w - 2, color: K(G[Math.min(6, t + 1)]) });
        continue;
      }
      sh.push({ type: "ellipse", x, y: y + 1, w, h, color: K(G[Math.max(0, t - 2)]), filled: true });
      sh.push({ type: "ellipse", x, y, w, h, color: K(G[t]), filled: true });
      sh.push({ type: "line", x1: x + 1 + Math.floor(w * 0.15), y1: y, x2: x + Math.floor(w * 0.5), y2: y, color: K(G[Math.min(6, t + 1)]) });
      if (t >= 4) sh.push({ type: "pixels", points: [[x + 1 + Math.floor(w * 0.2), y]], color: K(G[Math.min(6, t + 2)]) });
    }
    draw("ouro", sh);
    // objetos: taças, coroa, espada, escudo, joias
    const obj = [];
    const goblet = (x, y, s, t) => {
      const c = G[t], d = G[t - 2], l = G[Math.min(6, t + 2)];
      obj.push({ type: "polygon", points: [[x - 7 * s, y - 16 * s], [x + 7 * s, y - 16 * s], [x + 5 * s, y - 8 * s], [x + 1 * s, y - 5 * s], [x + 1 * s, y + 1 * s], [x + 5 * s, y + 3 * s], [x - 5 * s, y + 3 * s], [x - 1 * s, y + 1 * s], [x - 1 * s, y - 5 * s], [x - 5 * s, y - 8 * s]].map(([a, b]) => [Math.round(a), Math.round(b)]), color: K(c) });
      obj.push({ type: "ellipse", x: Math.round(x - 7 * s), y: Math.round(y - 17 * s), w: Math.round(14 * s), h: Math.round(4 * s), color: K(d), filled: true });
      obj.push({ type: "line", x1: Math.round(x - 5 * s), y1: Math.round(y - 13 * s), x2: Math.round(x - 3 * s), y2: Math.round(y - 9 * s), color: K(l) });
      obj.push({ type: "polygon", points: [[x + 3 * s, y - 15 * s], [x + 7 * s, y - 16 * s], [x + 5 * s, y - 8 * s], [x + 2 * s, y - 6 * s]].map(([a, b]) => [Math.round(a), Math.round(b)]), color: K(d) });
      obj.push({ type: "rect", x: Math.round(x - 2 * s), y: Math.round(y - 12 * s), w: Math.max(2, Math.round(3 * s)), h: Math.max(2, Math.round(3 * s)), color: K("ruby1"), filled: true });
    };
    const gem = (x, y, s, kind) => {
      const [c0, c1, c2] = { r: ["ruby0", "ruby1", "ruby2"], g: ["emer0", "emer1", "emer2"], b: ["saph0", "saph1", "saph2"] }[kind];
      obj.push({ type: "polygon", points: [[x, y - s], [x + s, y], [x, y + s], [x - s, y]], color: K(c1) });
      obj.push({ type: "polygon", points: [[x, y], [x + s, y], [x, y + s]], color: K(c0) });
      obj.push({ type: "polygon", points: [[x - s, y], [x, y - s], [x, y]], color: K(c2) });
      obj.push({ type: "pixels", points: [[x - Math.round(s / 2), y - Math.round(s / 2)]], color: K("spark") });
    };
    goblet(96, 438, 1.4, 4); goblet(352, 470, 1.6, 5); goblet(460, 404, 1.1, 3);
    // espada fincada no ouro
    // lâmina RETA de 4 px: fio claro à esquerda, lado escuro à direita, 1 px de brilho na aresta, ponta afunilada nas moedas
    obj.push({ type: "rect", x: 58, y: 327, w: 2, h: 78, color: K("H3"), filled: true });
    obj.push({ type: "rect", x: 60, y: 327, w: 2, h: 78, color: K("H1"), filled: true });
    obj.push({ type: "line", x1: 58, y1: 330, x2: 58, y2: 352, color: K("H4") });
    obj.push({ type: "line", x1: 60, y1: 329, x2: 60, y2: 404, color: K("H2") });
    obj.push({ type: "polygon", points: [[58, 405], [62, 405], [60, 412]], color: K("H2") });
    obj.push({ type: "rect", x: 48, y: 322, w: 24, h: 5, color: K("g4"), filled: true });
    obj.push({ type: "line", x1: 48, y1: 322, x2: 71, y2: 322, color: K("g6") });
    obj.push({ type: "rect", x: 57, y: 302, w: 6, h: 20, color: K("g1"), filled: true });
    obj.push({ type: "ellipse", x: 55, y: 296, w: 10, h: 8, color: K("g5"), filled: true });
    // escudo redondo inclinado (perspectiva: elipse) à direita
    obj.push({ type: "ellipse", x: 440, y: 430, w: 64, h: 34, color: K("g1"), filled: true });
    obj.push({ type: "ellipse", x: 443, y: 431, w: 58, h: 29, color: K("g3"), filled: true });
    obj.push({ type: "ellipse", x: 454, y: 437, w: 36, h: 17, color: K("g2"), filled: false });
    obj.push({ type: "ellipse", x: 466, y: 442, w: 12, h: 7, color: K("g5"), filled: true });
    // coroa
    obj.push({ type: "polygon", points: [[250, 440], [254, 426], [259, 434], [264, 422], [269, 434], [274, 426], [278, 440]], color: K("g4") });
    obj.push({ type: "rect", x: 250, y: 438, w: 29, h: 5, color: K("g3"), filled: true });
    obj.push({ type: "pixels", points: [[264, 432], [256, 440], [272, 440]], color: K("ruby2") });
    for (let i = 0; i < 26; i++) { const x = 20 + Math.floor(rnd() * 470); const y = Math.round(HX(x) + 6 + rnd() * (H - HX(x) - 12)); if (D.buf.mat[y * W + x]) continue; gem(x, y, 2 + Math.floor(rnd() * 3), "rgb"[i % 3]); }
    // sombra de contato sob cada pata/garra: 2–3 px escuros nas moedas logo abaixo
    const shadowPx = { g0: [], g1: [] };
    for (let x = 150; x < 470; x++) {
      let yb = -1; for (let y = 432; y > 380; y--) if (D.buf.mat[y * W + x] && !D.buf.mat[(y + 1) * W + x]) { yb = y; break; }
      if (yb < 0 || D.buried.has(D.buf.part[yb * W + x])) continue;
      for (let j = 1; j <= 3; j++) (j === 1 ? shadowPx.g0 : shadowPx.g1).push([x, yb + j]);
    }
    if (shadowPx.g0.length) obj.push({ type: "pixels", points: shadowPx.g1, color: K("g1") }, { type: "pixels", points: shadowPx.g0, color: K("g0") });
    draw("objetos", obj);
    tf("objetos", { op: "outline", mode: "seletivo" });
  } else {
    // rio de ouro derretido: superfície com rampa (mais quente perto), veias escuras de crosta, ondas
    draw("ouro", [
      { type: "rect", x: 0, y: SURF, w: W, h: H - SURF, color: K("L3"), filled: true },
      { type: "gradient", x: 0, y: SURF, w: W, h: H - SURF, colors: [K("L4"), K("L3"), K("L2"), K("L3"), K("L4"), K("L5")], direction: "vertical", dither: "nenhum", suavidade: 0.6, ondas: 2 },
    ]);
    const sh = [];
    const r2 = prng(5);
    for (let i = 0; i < 140; i++) {  // veias de crosta escura que boiam, alongadas na horizontal (perspectiva)
      const y = SURF + 4 + Math.floor(Math.pow(r2(), 0.8) * (H - SURF - 6));
      const x = Math.floor(r2() * W), len = 6 + Math.floor(r2() * 30 * (0.5 + (y - SURF) / 100));
      sh.push({ type: "line", x1: x, y1: y, x2: x + len, y2: y + Math.round((r2() - 0.5) * 3), color: K(r2() < 0.5 ? "L1" : "L2") });
    }
    for (let i = 0; i < 90; i++) { const y = SURF + 3 + Math.floor(r2() * (H - SURF - 4)), x = Math.floor(r2() * W), len = 3 + Math.floor(r2() * 14); sh.push({ type: "line", x1: x, y1: y, x2: x + len, y2: y, color: K("L6") }); }
    // ondas concêntricas em volta do dragão (elipses achatadas) onde ele sai do ouro
    for (const [cx, rw] of [[320, 420], [320, 340], [320, 270]]) sh.push({ type: "ellipse", x: cx - rw / 2, y: SURF - 6 + Math.round(rw / 30), w: rw, h: Math.round(rw / 6), color: K("L2"), filled: false });
    draw("ouro", sh);
    // margem escura de pedra ao fundo (antes da superfície) e brilho da borda
    draw("ouro", [{ type: "rect", x: 0, y: SURF - 1, w: W, h: 2, color: K("L5"), filled: true }]);
    // margem de pedra ao fundo, contra o brilho do rio, com borda acesa
    draw("ouro_longe", [
      { type: "terrain", topo: SURF - 22, amp: 14, rugosidade: 0.55, seed: 8, ate: SURF, color: K("st1") },
      { type: "gradient", x: 0, y: SURF - 40, w: W, h: 42, colors: [K("st1"), K("st2"), K("st3"), K("st4")], direction: "vertical", dither: "bayer4", suavidade: 0.7, only: K("st1") },
      { type: "rect", x: 0, y: SURF - 3, w: W, h: 3, color: K("L4"), filled: true },
    ]);
    // cascatas de ouro derretido saindo de canais na parede (a forja)
    const falls = [];
    for (const [fx, fw, top] of [[84, 11, 104]]) {
      // CADINHO inclinado preso por correntes, despejando o ouro (a origem do filete)
      falls.push({ type: "line", x1: fx - 14, y1: 0, x2: fx - 16, y2: top - 34, color: K("st4") }, { type: "line", x1: fx + 30, y1: 0, x2: fx + 30, y2: top - 28, color: K("st4") });
      falls.push({ type: "polygon", points: [[fx - 26, top - 36], [fx + 34, top - 26], [fx + 28, top - 4], [fx + 14, top + 4], [fx - 12, top - 2]], color: K("st3") });
      falls.push({ type: "polygon", points: [[fx - 26, top - 36], [fx + 34, top - 26], [fx + 33, top - 21], [fx - 25, top - 31]], color: K("st5") });
      falls.push({ type: "ellipse", x: fx - 22, y: top - 38, w: 56, h: 10, color: K("L4"), filled: true });
      falls.push({ type: "ellipse", x: fx - 12, y: top - 36, w: 34, h: 5, color: K("L6"), filled: true });
      falls.push({ type: "polygon", points: [[fx - 2, top - 4], [fx + 14, top + 2], [fx + 12, top + 8], [fx, top + 6]], color: K("L4") });
      // jorro que alarga ao cair, com núcleo claro ondulado
      const pts = [], core = [];
      // filete: 12 px na boca do cadinho afinando a 5 px embaixo; borda vermelha, corpo laranja, núcleo branco
      const L = [], Rr = [], CL = [], CR = [], IL = [], IR = [];
      for (let yy = top; yy <= SURF; yy += 4) {
        const t = (yy - top) / (SURF - top), wob = Math.sin(yy / 11 + fx) * 1.2, ww = 16 - 11 * t, cx = fx + 6 + wob;
        L.push([cx - ww / 2, yy]); Rr.push([cx + ww / 2, yy]); IL.push([cx - ww / 2 + 1.2, yy]); IR.push([cx + ww / 2 - 1.2, yy]);
        CL.push([cx - ww * 0.18 - 0.5, yy]); CR.push([cx + ww * 0.18 + 0.5, yy]);
      }
      falls.push({ type: "polygon", points: [...L, ...Rr.reverse()], color: K("L1") });
      falls.push({ type: "polygon", points: [...IL, ...IR.reverse()], color: K("L3") });
      falls.push({ type: "polygon", points: [...CL, ...CR.reverse()], color: K("L6") });
      // coroa de respingo na entrada
      // coroa de respingo + anel de luz, na camada da frente (o vapor não cobre)
      const crown = [{ type: "ellipse", x: fx - 16, y: SURF - 3, w: 44, h: 7, color: K("L6"), filled: false }];
      for (const [dx, h] of [[-9, 8], [-5, 13], [-1, 7], [14, 11], [18, 7], [10, 15], [4, 9]]) crown.push({ type: "polygon", points: [[fx + dx - 1, SURF], [fx + dx, SURF - h], [fx + dx + 2, SURF]], color: K("L6") }, { type: "ellipse", x: fx + dx - 1, y: SURF - h - 5, w: 3, h: 3, color: K("L5"), filled: true });
      draw("ouro_frente", crown);
      // anel de luz e respingo onde o filete bate no rio
      falls.push({ type: "gradient", x: fx - 40, y: SURF - 28, w: fw + 80, h: 40, direction: "radial", cx: fx + fw / 2, cy: SURF, r: 34, colors: [K("L6"), K("L5"), K("L4"), "."], dither: "bayer4", suavidade: 0.6 });
      falls.push({ type: "ellipse", x: fx - 22, y: SURF - 3, w: fw + 44, h: 8, color: K("L6"), filled: false });
      for (const [dx, dy] of [[-10, -10], [-5, -16], [fw + 6, -12], [fw + 12, -7], [2, -20]]) falls.push({ type: "ellipse", x: fx + dx, y: SURF + dy, w: 3, h: 3, color: K("L5"), filled: true });
    }
    draw("raio", falls);
  }

  // normal: o tronco, a coxa e a perna de longe AFUNDAM no ouro (deitado sobre a pilha): corta abaixo de uma
  // linha de moedas (arcos do tamanho de uma moeda), só nas partes de trás (a pata e a cauda da frente ficam por cima)
  const FRONT = (x) => 350 + ((x - 330) / 190) ** 2 * 26;
  const coinBump = (x) => { const c = 9, f = ((x % c) + c) % c / c - 0.5; return 3.2 * Math.sqrt(Math.max(0, 0.25 - f * f)) * 2 + ((Math.floor(x / c) * 7) % 3); };
  if (!gold) {
    for (let y = 300; y < H; y++) for (let x = 0; x < W; x++) {
      const k = y * W + x; if (!grid[k] || !D.buried.has(D.buf.part[k])) continue;
      if (D.buf.part[k] === D.spine.part && D.buf.u[k] > 380) continue;      // a raiz da cauda sai do quadril, por trás da pata, e segue por cima
      if (y > FRONT(x) - coinBump(x)) grid[k] = null;
    }
    // a cauda afunda entre as moedas uma vez (~x300) e volta a sair
    for (let y = 430; y < H; y++) for (let x = 284; x < 326; x++) {
      const k = y * W + x; if (!grid[k] || D.buf.part[k] !== D.spine.part || D.buf.u[k] < 600) continue;
      const edge = Math.abs(x - 305) + 3 * Math.sin(y / 2.5);
      if (edge < 17) grid[k] = null;
    }
  }
  // corta o dragão sob a superfície do ouro derretido (dourado) e desenha
  if (gold) {
    for (let y = SURF + 1; y < H; y++) for (let x = 0; x < W; x++) {
      const k = y * W + x; if (!grid[k]) continue;
      // a perna da frente e a cauda emergem: só o que está acima de uma linha ondulada
      const wave = SURF + 2 + Math.sin(x * 0.12) * 1.5;
      if (y > wave) grid[k] = null;
    }
    // "MEIA" de ouro acumulado nas patas logo acima do líquido: mais escura, borda de cima ondulada, 1 brilho por pata
    const sock = []; let s0 = -1;
    for (let x = 0; x <= W; x++) { const on = x < W && !!grid[(SURF - 1) * W + x]; if (on && s0 < 0) s0 = x; if (!on && s0 >= 0) { sock.push([s0, x - 1]); s0 = -1; } }
    for (const [a, b] of sock) {
      for (let x = a - 2; x <= b + 2; x++) for (let y = SURF - 18; y < SURF; y++) {
        const k = y * W + x; if (!grid[k]) continue;
        if (D.buf.part[k] === D.spine.part && D.buf.u[k] < 440) continue;
        const top = SURF - 13 + Math.round(Math.sin(x / 4) * 1.5 + Math.sin(x / 9 + a) * 1.5);
        if (y === top) grid[k] = "R5"; else if (y === top + 1) grid[k] = "R2"; else if (y > top) grid[k] = y > SURF - 5 ? "R1" : "R0";
      }
      const hx = Math.round(a + (b - a) * 0.35);
      for (const [dx, dy, c] of [[0, -9, "R6"], [1, -9, "R6"], [0, -8, "R6"], [1, -8, "R5"], [2, -8, "R4"], [0, -7, "R4"]]) if (grid[(SURF + dy) * W + hx + dx]) grid[(SURF + dy) * W + hx + dx] = c;
    }
    // onde o corpo encosta no ouro: faixa limpa de 2 px de ouro incandescente subindo pela pele
    for (let x = 0; x < W; x++) for (let y = SURF - 4; y <= SURF + 3; y++) {
      const k = y * W + x; if (!grid[k]) continue;
      const dd = SURF + 3 - y;
      if (dd < 2) grid[k] = "L6"; else if (dd < 4) grid[k] = "L5";
    }
    // LENÇÓIS: o ouro cobre a borda de baixo de cada volume e pende 1–5 px (borda ondulada)
    const g0 = grid.slice();
    for (let y = 30; y < SURF - 6; y++) for (let x = 1; x < W - 1; x++) {
      const k = y * W + x;
      if (!g0[k] || g0[k + W] || !(D.buf.mat[k] === MAT.pele || D.buf.mat[k] === MAT.membrana)) continue;
      const L = Math.round(Math.pow(vnoise(x / 6, y / 9), 2) * 6);
      for (let j = 1; j <= L; j++) { const q = (y + j) * W + x; if (g0[q]) break; grid[q] = j === L ? "R2" : j === 1 ? "R4" : "R3"; }
    }
    // GOTAS: 14 só onde a gravidade acumula (pontos mais baixos de cada contorno), grossas no início, bulbo de 3 px com brilho
    const cand = [];
    for (let y = 30; y < SURF - 12; y++) for (let x = 3; x < W - 3; x++) {
      const k = y * W + x;
      if (!grid[k] || grid[k + W]) continue;
      let low = 0; for (let d = 1; d <= 6; d++) { if (!grid[(y + 1) * W + x - d] && !grid[y * W + x - d]) low++; if (!grid[(y + 1) * W + x + d] && !grid[y * W + x + d]) low++; }
      if (low >= 9) cand.push([x, y, low + (x < 200 && y > 140 && y < 190 ? 6 : 0) + Math.random() * 0]);
    }
    cand.sort((a, b) => b[2] - a[2] || a[0] - b[0]);
    const picked = [];
    for (let x = 282; x <= 350; x += 17) { let yb = -1; for (let y = 300; y < SURF - 12; y++) if (grid[y * W + x] && !grid[(y + 1) * W + x]) { yb = y; break; } if (yb > 0) picked.push([x, yb, 99]); }   // ouro acumulado na borda da barriga
    for (const c of cand) { if (picked.length >= 18) break; if (picked.every(([px, py]) => Math.hypot(px - c[0], py - c[1]) > 22)) picked.push(c); }
    for (const [x, y, sc] of picked) {
      let len = sc === 99 ? 7 + ((x * 3) % 7) : 12 + ((x * 7 + y * 3) % 26);
      for (let j = 1; j < len; j++) if (grid[(y + j) * W + x] || y + j >= SURF - 4) { len = j - 1; break; }
      if (len < 6) continue;
      for (let j = 1; j <= len; j++) {
        const w = j < len * 0.4 ? 3 : j < len * 0.7 ? 2 : 1, k = (y + j) * W + x - 1;
        if (w === 3) { grid[k] = "R5"; grid[k + 1] = "R4"; grid[k + 2] = "R2"; }
        else if (w === 2) { grid[k + 1] = "R5"; grid[k + 2] = "R3"; }
        else grid[k + 1] = "R4";
      }
      const yb = y + len;
      for (const [dx, dy, c] of [[0, 1, "R4"], [-1, 2, "R4"], [0, 2, "R6"], [1, 2, "R3"], [-1, 3, "R3"], [0, 3, "R4"], [1, 3, "R2"], [0, 4, "R2"]]) grid[(yb + dy) * W + x + dx] = c;
    }
  }
  if (gold) {
    // filetes de ouro escorrendo POR CIMA do corpo: começam nas bordas de cima das formas e descem pela pele
    const r4 = prng(13);
    for (let n = 0; n < 4000; n++) {
      const x = 100 + Math.floor(r4() * 400), y0 = 40 + Math.floor(r4() * (SURF - 60)), k0 = y0 * W + x;
      const memb = D.buf.mat[k0] === MAT.membrana;
      if (!grid[k0] || (D.buf.mat[k0] !== MAT.pele && !memb) || D.buf.flag[k0] === 3) continue;
      if (memb && r4() > 0.5) continue;
      const head = D.buf.u[k0] >= 2000, wingArm = D.buf.u[k0] >= 1500 && D.buf.u[k0] < 2000;
      if ((head || wingArm) && r4() > 0.12) continue;
      if (D.buf.ny[k0] < -0.2 && r4() > 0.3) continue;        // nasce mais nas faces laterais, onde escorre
      if (r4() > 0.006) continue;
      // filete: fino no começo, engrossa e termina numa gota; acompanha a pele com um leve serpentear
      const len = 10 + Math.floor(r4() * 26), ph = r4() * 6;
      let yb = y0, xb = x;
      for (let j = 0; j < len; j++) {
        const y = y0 + j, xx = x + Math.round(Math.sin(j / 6 + ph) * 0.8), k = y * W + xx;
        if (y >= SURF - 1 || !grid[k] || !grid[k + 2] || D.buf.mat[k] !== D.buf.mat[k0]) break;
        const wide = j > len * 0.15;
        grid[k] = memb ? "M5" : "R6"; if (wide) { grid[k + 1] = memb ? "M4" : "R5"; grid[k + 2] = memb ? "M2" : "R3"; } else grid[k + 1] = memb ? "M2" : "R3";
        yb = y; xb = xx;
      }
      if (yb - y0 > 6) for (const [dx, dy, c] of [[-1, 1, "R5"], [0, 1, "R6"], [1, 1, "R6"], [2, 1, "R4"], [3, 1, "R3"], [-1, 2, "R4"], [0, 2, "R5"], [1, 2, "R5"], [2, 2, "R4"], [3, 2, "R2"], [0, 3, "R3"], [1, 3, "R4"], [2, 3, "R2"]]) { const k = (yb + dy) * W + xb + dx; if (grid[k]) grid[k] = c; }
    }
  }
  rows("dragao", grid);
  if (gold) {
    const rg = new Array(W * H).fill(null);
    const dark = { R6: "R4", R5: "R4", rim2: "R4", L6: "R4", L5: "R4", R4: "R3", rim1: "R3", L4: "R3", R3: "R2", F2: "R3", F1: "R2" };
    for (let dy = 1; dy < 104; dy++) {
      const y = SURF + dy; if (y >= H) break;
      // linhas com espaçamento variado (1–3 px), cada linha em segmentos deslocados 2–6 px; rareia longe da base
      const hrow = vnoise(dy * 0.61, 3.3), keep = dy < 30 ? 0.3 : dy < 55 ? 0.48 : 0.7;
      if (hrow < keep) continue;
      const top = vnoise((dy - 1) * 0.61, 3.3) < keep;          // primeira linha de um grupo = crista
      for (let x = 0; x < W; x++) {
        if (vnoise(x / (10 + dy * 0.15) + dy * 0.37, dy * 1.7) < 0.3 + dy / 260) continue;   // segmentos curtos
        const wob = Math.round(Math.sin(dy * 0.7 + Math.floor(x / 23)) * 2 + Math.sin(dy * 0.23) * 3);
        const sy = SURF - Math.round(dy * 1.05), sx = x + wob;
        if (sy < 0 || sx < 0 || sx >= W) continue;
        const c = grid[sy * W + sx]; if (!c) continue;
        rg[y * W + x] = top && (c === "R6" || c === "R5" || c === "rim2") ? "L5" : dark[c] || "R1";
      }
    }
    // reflexo vertical do filete de lava e ondulações em segmentos do lado esquerdo
    for (let dy = 2; dy < 74; dy++) {
      if (vnoise(dy * 0.7, 9.1) < 0.35 + dy / 200) continue;
      const wob = Math.round(Math.sin(dy * 0.8) * 2), y = SURF + dy;
      for (let x = 86 + wob; x < 98 + wob - dy / 12; x++) rg[y * W + x] = x - wob < 90 || x - wob > 94 - dy / 14 ? "L4" : "L6";
    }
    for (let i = 0; i < 160; i++) {
      const dy = 3 + Math.floor(Math.pow(vnoise(i * 1.3, 2), 1.2) * 108), y = SURF + dy; if (y >= H) continue;
      const x0 = Math.floor(vnoise(i * 2.7, 5) * 240), len = 4 + Math.floor(vnoise(i * 0.9, 7) * (6 + dy / 5));
      const c = i % 3 === 0 ? "L6" : i % 3 === 1 ? "L2" : "L5";
      for (let x = x0; x < Math.min(W, x0 + len); x++) if (!rg[y * W + x]) rg[y * W + x] = c;
    }
    rows("reflexo", rg);
  }
  tf("dragao", { op: "outline", mode: "seletivo" });
  tf("dragao", { op: "clean", color: K("R0") });

  // ---------- ouro na frente: moedas que cobrem o pé e a cauda (normal) / gotas e escorridos (dourado) ----------
  if (!gold) {
    const sh = [];
    const G = ["g0", "g1", "g2", "g3", "g4", "g5", "g6"];
    // moedas na BORDA onde o dragão entra no ouro (corte) e sob as patas: quebram a linha reta
    const edge = [];
    for (let y = 300; y < H; y++) for (let x = 1; x < W - 1; x++) {
      const k = y * W + x;
      if (grid[k] || !D.buf.mat[k]) continue;                       // pixel cortado (enterrado)
      if (grid[k - W] || grid[k - 1] || grid[k + 1]) edge.push([x, y]);
    }
    for (let x = 0; x < W; x += 3) {                                 // e sob as patas/cauda que ficam por cima
      let yb = -1; for (let y = H - 1; y > 330; y--) if (grid[y * W + x]) { yb = y; break; }
      if (yb > 0 && !D.buried.has(D.buf.part[yb * W + x])) edge.push([x, yb - 1]);
    }
    const used = new Set();
    for (const [ex, ey] of edge) {
      const key = Math.floor(ex / 5) + "," + Math.floor(ey / 4); if (used.has(key)) continue; used.add(key);
      for (let j = 0; j < 1; j++) {
        const cx = ex - 3 + Math.floor(rnd() * 3), cy = ey - 1 + Math.floor(rnd() * 3);
        const w = 6 + Math.floor(rnd() * 4), h = Math.round(w * 0.45);
        const t = clamp(Math.round(1 + rnd() * 1.2), 1, 2);   // sombra de contato: moedas encostadas no ventre e nas patas ficam no escuro
        sh.push({ type: "ellipse", x: cx, y: cy + 1, w, h, color: K(G[t - 2 < 0 ? 0 : t - 2]), filled: true });
        sh.push({ type: "ellipse", x: cx, y: cy, w, h, color: K(G[t]), filled: true });
        sh.push({ type: "pixels", points: [[cx + 2, cy]], color: K(G[Math.min(6, t + 2)]) });
      }
    }
    // montinho de moedas onde a cauda volta a sair do ouro (esconde o corte da cauda)
    const heap = [];
    for (let i = 0; i < 120; i++) { const a = rnd() * Math.PI, r = Math.sqrt(rnd()) * (0.75 + 0.45 * vnoise(a * 3, 7)); heap.push([304 + Math.cos(a) * 28 * r, 478 - Math.sin(a) * 15 * r + 4]); }
    for (const [lx, ly] of [[262, 462], [338, 470], [356, 466]]) heap.push([lx, ly]);   // moedas soltas sobre a cauda
    heap.sort((a, b) => a[1] - b[1]);
    for (const [cx, cy] of heap) {
      const w = 7 + Math.floor(rnd() * 4), h = Math.round(w * 0.45), edgeD = Math.hypot((cx - 304) / 28, (cy - 478) / 15);
      const t = clamp(Math.round(2 + rnd() * 2.4 - (edgeD > 0.85 ? 1 : 0)), 1, 5);   // mesma escala/tons do monte; borda na sombra
      sh.push({ type: "ellipse", x: cx, y: cy + 1, w, h, color: K(G[Math.max(0, t - 2)]), filled: true });
      sh.push({ type: "ellipse", x: cx, y: cy, w, h, color: K(G[t]), filled: true });
      sh.push({ type: "pixels", points: [[cx + 2, cy]], color: K(G[Math.min(6, t + 2)]) });
    }
    draw("ouro_frente", sh);
  } else {
    // (os pingos e lençóis agora vão no próprio dragão; aqui só respingos e meniscos)
    const sh = [];
    const r3 = prng(9);
    for (let x = 2; x < 0; x += 1) {
      for (let y = 30; y < SURF - 2; y++) {
        const k = y * W + x;
        if (!grid[k] || grid[k + W]) continue;          // borda de baixo de alguma parte
        // o ouro se junta nos pontos mais BAIXOS do contorno (queixo, pontas, barriga): lá pinga muito, no resto pouco
        const low = !grid[k + W - 3] && !grid[k + W + 3] && !grid[k + 2 * W - 2] && !grid[k + 2 * W + 2];
        if (r3() > (low ? 0.45 : 0.03)) continue;
        const long = r3() < 0.08;
        const len = long ? 40 + Math.floor(r3() * (SURF - y - 40)) : 4 + Math.floor(Math.pow(r3(), 2) * 30);
        let yEnd = Math.min(SURF - 1, y + len);
        for (let yy = y + 2; yy < yEnd; yy++) if (grid[yy * W + x]) { yEnd = yy - 1; break; }   // para ao bater em outra parte
        if (yEnd - y < 3) continue;
        const thick = !long && r3() < 0.5;
        if (thick) { sh.push({ type: "rect", x: x - 1, y, w: 3, h: Math.max(2, Math.round(len * 0.4)), color: K("R4"), filled: true }); sh.push({ type: "line", x1: x - 1, y1: y, x2: x - 1, y2: y + Math.round(len * 0.4) - 1, color: K("R6") }); }
        sh.push({ type: "line", x1: x, y1: y, x2: x, y2: yEnd, color: K(long ? "L4" : "R5") });
        if (!long) { sh.push({ type: "ellipse", x: x - 1, y: yEnd - 1, w: 3, h: 4, color: K("R4"), filled: true }); sh.push({ type: "pixels", points: [[x - 1, yEnd]], color: K("R6") }); }
      }
    }
    // respingos e gotas no ar, acima do rio
    for (let i = 0; i < 26; i++) {
      const x = 60 + Math.floor(r3() * 400), y = SURF - 6 - Math.floor(Math.pow(r3(), 1.6) * 60);
      if (grid[y * W + x]) continue;
      const s = 1 + Math.floor(r3() * 3);
      sh.push({ type: "ellipse", x, y, w: s + 1, h: s + 2, color: K("L4"), filled: true });
      sh.push({ type: "pixels", points: [[x, y]], color: K("L6") });
    }
    // MENISCO em volta de cada perna/cauda que entra no ouro: anel claro + anel de onda
    const spans = []; let st = -1;
    for (let x = 0; x <= W; x++) { const on = x < W && !!grid[(SURF - 1) * W + x]; if (on && st < 0) st = x; if (!on && st >= 0) { spans.push([st, x - 1]); st = -1; } }
    for (const [a, b] of spans) {
      const w = b - a + 1; if (w < 4) continue;
      sh.push({ type: "ellipse", x: a - 14, y: SURF - 3, w: w + 28, h: 10, color: K("L2"), filled: false });
      sh.push({ type: "ellipse", x: a - 6, y: SURF - 2, w: w + 12, h: 6, color: K("L6"), filled: false });
      sh.push({ type: "line", x1: a - 3, y1: SURF + 1, x2: b + 3, y2: SURF + 1, color: K("L5") });
      // coroa de respingo: pontas finas subindo em volta da perna
      for (let i = 0; i < 4; i++) { const xx = i < 2 ? a - 3 - i * 4 : b + 3 + (i - 2) * 4, h = 4 + ((xx * 7) % 5); sh.push({ type: "polygon", points: [[xx - 1, SURF], [xx, SURF - h], [xx + 1, SURF]], color: K("L6") }); sh.push({ type: "pixels", points: [[xx, SURF - h - 2]], color: K("L5") }); }
    }
    draw("ouro_frente", sh);
  }

  // ---------- brilhos ----------
  if (!gold) {
    draw("brilhos", [
      { type: "scatter", x: 0, y: 340, w: W, h: 172, colors: [K("spark"), K("g6")], densidade: 0.006, forma: "cruz", distancia: 9, seed: 21, only: [K("g5"), K("g4"), K("g6")] },
      { type: "scatter", x: 80, y: 20, w: 300, h: 380, colors: [K("dust"), K("beam2")], densidade: 0.003, forma: "pixel", distancia: 6, seed: 8, only: [K("beam"), K("beamM")] },
    ]);
  } else {
    draw("brilhos", [
      // cintilações só nas cristas claras e perto da luz (poucas)
      { type: "scatter", x: 0, y: SURF, w: W, h: H - SURF, colors: [K("spark")], densidade: 0.0018, forma: "cruz", distancia: 14, seed: 21, only: [K("L6")] },
      { type: "scatter", x: 100, y: 40, w: 380, h: 340, colors: [K("spark")], densidade: 0.0012, forma: "cruz", distancia: 18, seed: 4, only: [K("R6")] },
      { type: "scatter", x: 0, y: 200, w: W, h: 190, colors: [K("L4"), K("L5")], densidade: 0.001, forma: "pixel", distancia: 10, seed: 31 },
    ]);
    // fumaça/vapor por RUÍDO (fbm) com dither: colunas que sobem do rio, base iluminada (quente), topo escuro
    const fbm = (x, y) => vnoise(x, y) * 0.55 + vnoise(x * 2.1, y * 2.1) * 0.3 + vnoise(x * 4.3, y * 4.3) * 0.15;
    const smokeGrid = (y0, y1, th, seed, front) => {
      const g = new Array(W * H).fill(null);
      for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) {
        const rise = (y1 - y) / (y1 - y0);                       // 0 embaixo, 1 em cima
        const col = 0.5 + 0.5 * Math.sin(x / 70 + seed + Math.sin(y / 80) * 1.5);   // colunas largas que ondulam
        let d = fbm(x / 85 + seed, y / 55 - seed) * (0.55 + 0.6 * col) * (front ? Math.max(0, 1 - rise * 1.6) : 1 - rise * 0.5);
        d += (bayer(x, y) - 0.5) * 0.05;
        if (d < th) continue;
        const k = y * W + x;
        if (front) { let under = D.buf.mat[k] ? 1 : 0; for (let q = 4; q < 70 && !under; q += 4) if (y - q > 0 && D.buf.mat[(y - q) * W + x]) under = 1; if (under) continue; }   // sob a barriga: sombra, sem vapor aceso
        const lit = rise < 0.35 ? 2 : rise < 0.6 ? 1 : 0;
        const lvl = d > th + 0.2 ? 2 : d > th + 0.09 ? 1 : 0;
        g[k] = front ? (lvl ? "L4" : "L3") : rise < 0.22 && lvl ? "bg6" : ["sm0", "sm1", "sm2"][lvl];
      }
      return g;
    };
    rows("fumaca_tras", smokeGrid(10, SURF - 4, 0.4, 3, false));
    rows("fumaca", smokeGrid(SURF - 80, SURF + 4, 0.46, 7, true));
  }
  // vinheta
  draw("vinheta", [{ type: "gradient", x: 0, y: 0, w: W, h: gold ? SURF : H, direction: "radial", cx: 290, cy: 290, r: 380, colors: [".", ".", ".", ".", K("bg0")], dither: "bayer4", suavidade: 0.6 }]);
  cmds.push({ name: "update_layer", input: { layer: "Base", delete: true } });
  return cmds;
}

const anima = (...a) => execFileSync("node", [path.join(ROOT, "bin/anima.mjs"), ...a], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 });
for (const v of MODE === "ambos" ? ["normal", "dourado"] : [MODE]) {
  const name = v === "normal" ? "dragao" : "dragao_dourado";
  const cmds = build(v);
  const cmdFile = path.join(DIR, `cmds_${v}.json`);
  writeFileSync(cmdFile, JSON.stringify(cmds));
  const proj = path.join(DIR, `${name}.anima.json`);
  anima("new", proj, `${W}x${H}`, "1");
  const out = anima("run", proj, cmdFile, "-q");
  const errs = out.split("\n").filter((l) => /erro|ATENÇÃO/i.test(l));
  if (errs.length) console.log(errs.slice(0, 8).join("\n"));
  anima("export", proj, path.join(DIR, `${name}.png`), "--scale", "2", "--frame", "0");
  unlinkSync(cmdFile);   // os comandos são gerados de novo a cada execução
  console.log("ok:", proj);
}

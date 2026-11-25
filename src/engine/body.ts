/**
 * CORPO 3D ÚNICO (lição do dragão: tubos colados lêem como "colagem").
 * Partes = tubos (spline de pontos x,y,z,r) ou elipsoides; todas viram UM campo de distância 3D,
 * unido por smooth-min (as juntas ganham o preenchimento curvo de músculo), renderizado por marcha de raio.
 * A luz vem da normal do campo (contínua entre as partes), quantizada numa rampa de cores;
 * contorno só na silhueta e onde uma parte passa NA FRENTE de outra (degrau de profundidade).
 * z cresce em direção ao observador.
 */
import type { Surface } from "./draw.ts";

export interface BodyPart {
  nome: string;
  pontos?: [number, number, number, number][];
  elipse?: { cx: number; cy: number; z: number; rx: number; ry: number; rz: number; rot?: number };
}
export interface BodySpec {
  partes: BodyPart[];
  unir?: [string, string, number][];
  fusao: number;
  luz: [number, number, number];
  rampa: number[];
  contorno?: number;
  /** contorno seletivo: tom da rampa 2 passos abaixo do pixel (escuro na sombra, médio na luz) */
  seletivo?: boolean;
  bordaLuz?: { cor: number; dir: [number, number] };
  especular?: number;
  escamas?: { cor: number; tamanho: number };
  dither: boolean;
  ambiente: number;
}

interface Prim { t: 0 | 1; part: number; x: number; y: number; z: number; r: number; rx: number; ry: number; rz: number; c: number; s: number; u: number; tx: number; ty: number; R: number }

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const norm3 = (x: number, y: number, z: number): [number, number, number] => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
export function smin(a: number, b: number, k: number): number { if (k <= 0) return Math.min(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - (h * h * k) / 4; }

/** Catmull-Rom nos 4 canais (x, y, z, r) */
function spline(pts: [number, number, number, number][], step: number): [number, number, number, number][] {
  if (pts.length < 2) return pts.slice();
  const out: [number, number, number, number][] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let j = 0; j < n; j++) {
      const t = j / n, t2 = t * t, t3 = t2 * t;
      const q = [0, 1, 2, 3].map((c) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3));
      out.push([q[0], q[1], q[2], Math.max(0, q[3])]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** Desenha o corpo. Devolve quantos pixels pintou. */
export function drawBody(s: Surface, b: BodySpec): number {
  const W = s.width, H = s.height, N = W * H;
  const names = b.partes.map((p) => p.nome);
  const prims: Prim[] = [];
  b.partes.forEach((pt, part) => {
    if (pt.elipse) {
      const e = pt.elipse, rot = e.rot ?? 0;
      prims.push({ t: 1, part, x: e.cx, y: e.cy, z: e.z, r: Math.max(e.rx, e.ry), rx: e.rx, ry: e.ry, rz: e.rz, c: Math.cos(rot), s: Math.sin(rot), u: 0, tx: 1, ty: 0, R: Math.max(e.rx, e.ry) });
    }
    if (pt.pontos && pt.pontos.length) {
      const S = spline(pt.pontos, 0.7);
      let u = 0, acc = 1e9;
      for (let i = 0; i < S.length; i++) {
        const a = S[Math.max(0, i - 1)], c = S[Math.min(S.length - 1, i + 1)];
        let tx = c[0] - a[0], ty = c[1] - a[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
        if (i > 0) { const d = Math.hypot(S[i][0] - S[i - 1][0], S[i][1] - S[i - 1][1]); u += d; acc += d; }
        const r = S[i][3];
        if (r < 0.5) continue;
        // espaçamento curto entre esferas: sem "serra" na divisa de luz
        if (acc < Math.min(2.5, Math.max(0.6, r * 0.08)) && i < S.length - 1) continue;
        acc = 0;
        prims.push({ t: 0, part, x: S[i][0], y: S[i][1], z: S[i][2], r, rx: r, ry: r, rz: r, c: 1, s: 0, u, tx, ty, R: r });
      }
    }
  });
  if (!prims.length) return 0;
  const P = b.partes.length;
  const pairs: [number, number, number][] = [];
  if (b.unir) for (const [a, c, k] of b.unir) { const ia = names.indexOf(a), ib = names.indexOf(c); if (ia >= 0 && ib >= 0) pairs.push([ia, ib, k]); }
  const joined = new Set(pairs.map(([a, c]) => (a < c ? `${a},${c}` : `${c},${a}`)));
  const allJoin = !b.unir; // sem lista: todas as partes se fundem com `fusao`

  const CELL = 16, GW = Math.ceil(W / CELL), GH = Math.ceil(H / CELL);
  const cells: Prim[][] = Array.from({ length: GW * GH }, () => []);
  const pad = b.fusao + 4;
  for (const p of prims) {
    const x0 = Math.max(0, Math.floor((p.x - p.R - pad) / CELL)), x1 = Math.min(GW - 1, Math.floor((p.x + p.R + pad) / CELL));
    const y0 = Math.max(0, Math.floor((p.y - p.R - pad) / CELL)), y1 = Math.min(GH - 1, Math.floor((p.y + p.R + pad) / CELL));
    for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) cells[gy * GW + gx].push(p);
  }

  const dPart = new Float64Array(P);
  const near: (Prim | null)[] = new Array(P).fill(null);
  let cand: Prim[] = [];
  const F = (px: number, py: number, pz: number, track = false): number => {
    dPart.fill(1e9);
    for (const p of cand) {
      let d: number;
      if (p.t === 0) { const dx = px - p.x, dy = py - p.y, dz = pz - p.z; d = Math.sqrt(dx * dx + dy * dy + dz * dz) - p.r; }
      else {
        const dx = px - p.x, dy = py - p.y, qx = dx * p.c + dy * p.s, qy = -dx * p.s + dy * p.c, qz = pz - p.z;
        const k0 = Math.hypot(qx / p.rx, qy / p.ry, qz / p.rz), k1 = Math.hypot(qx / (p.rx * p.rx), qy / (p.ry * p.ry), qz / (p.rz * p.rz)) || 1e-6;
        d = (k0 * (k0 - 1)) / k1;
      }
      if (d < dPart[p.part]) { dPart[p.part] = d; if (track) near[p.part] = p; }
    }
    let f = 1e9;
    if (allJoin) { for (let q = 0; q < P; q++) if (dPart[q] < 1e8) f = f === 1e9 ? dPart[q] : smin(f, dPart[q], b.fusao); }
    else {
      for (let q = 0; q < P; q++) if (dPart[q] < f) f = dPart[q];
      for (const [a, c, k] of pairs) if (dPart[a] < 1e8 && dPart[c] < 1e8) { const v = smin(dPart[a], dPart[c], k); if (v < f) f = v; }
    }
    return f;
  };

  const Z = new Float32Array(N).fill(-1e9), NX = new Float32Array(N), NY = new Float32Array(N), NZ = new Float32Array(N);
  const PART = new Int16Array(N).fill(-1), U = new Float32Array(N), SS = new Float32Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const list = cells[Math.floor(y / CELL) * GW + Math.floor(x / CELL)];
    if (!list.length) continue;
    const px = x + 0.5, py = y + 0.5;
    cand = [];
    let zTop = -1e9, zBot = 1e9;
    for (const p of list) {
      if (Math.hypot(px - p.x, py - p.y) > p.R + pad) continue;
      cand.push(p);
      zTop = Math.max(zTop, p.z + p.rz + b.fusao + 2); zBot = Math.min(zBot, p.z - p.rz - 2);
    }
    if (!cand.length) continue;
    let z = zTop, prev = z, hit = false;
    for (let it = 0; it < 200 && z > zBot; it++) {
      const f = F(px, py, z);
      if (f < 0.05) { hit = true; break; }
      prev = z; z -= Math.max(0.4, f * 0.9);
    }
    if (!hit) continue;
    let lo = z, hi = prev;
    for (let i = 0; i < 8; i++) { const m = (lo + hi) / 2; if (F(px, py, m) < 0) lo = m; else hi = m; }
    const zs = (lo + hi) / 2, k = y * W + x, e = 0.6;
    const [nx, ny, nz] = norm3(F(px + e, py, zs) - F(px - e, py, zs), F(px, py + e, zs) - F(px, py - e, zs), F(px, py, zs + e) - F(px, py, zs - e));
    near.fill(null);
    F(px, py, zs, true);
    let bp = -1, bd = 1e9;
    for (let q = 0; q < P; q++) if (dPart[q] < bd) { bd = dPart[q]; bp = q; }
    Z[k] = zs; NX[k] = nx; NY[k] = ny; NZ[k] = Math.max(0, nz); PART[k] = bp;
    const sp = bp >= 0 ? near[bp] : null;
    if (sp && sp.t === 0) { U[k] = sp.u; SS[k] = Math.max(-1, Math.min(1, ((px - sp.x) * -sp.ty + (py - sp.y) * sp.tx) / sp.r)) * sp.r; }
    else if (sp) { const dx = px - sp.x, dy = py - sp.y; U[k] = dx * sp.c + dy * sp.s; SS[k] = -dx * sp.s + dy * sp.c; }
  }

  // ---- sombreamento ----
  const [Lx, Ly, Lz] = norm3(...b.luz);
  const R = b.rampa, n = R.length;
  const out = new Int32Array(N).fill(-1);
  for (let k = 0; k < N; k++) {
    if (PART[k] < 0) continue;
    const x = k % W, y = (k - x) / W;
    const dif = Math.max(0, NX[k] * Lx + NY[k] * Ly + NZ[k] * Lz);
    const v = Math.min(0.999, b.ambiente + (1 - b.ambiente) * dif);
    let fi = v * n;
    if (b.dither) fi += (BAYER4[(y & 3) * 4 + (x & 3)] / 16 - 0.5) * 0.5;
    let idx = Math.max(0, Math.min(n - 1, Math.floor(fi)));
    // escamas: arcos em "U" separados que seguem a coordenada do tubo, só na meia-luz e longe da silhueta
    if (b.escamas && idx > 0 && idx < n - 1 && NZ[k] > 0.35) {
      const t = b.escamas.tamanho, row = Math.floor(U[k] / t);
      const a = ((SS[k] / t + (row & 1) * 0.5) % 1 + 1) % 1 - 0.5, bb = ((U[k] / t) % 1 + 1) % 1;
      // crescente curto embaixo de cada escama (não uma linha corrida): só o miolo do arco, colunas alternadas
      const col = Math.floor(SS[k] / t + (row & 1) * 0.5);
      if (Math.abs(a) < 0.3 && Math.abs(bb - (0.62 + 2.2 * a * a)) < 0.6 / t && ((col + row * 2) % 3 !== 0)) { out[k] = b.escamas.cor; continue; }
    }
    // especular (metal/umidade): reflexo da luz em direção ao observador
    if (b.especular !== undefined) { const d = NX[k] * Lx + NY[k] * Ly + NZ[k] * Lz, rz = 2 * d * NZ[k] - Lz; if (rz > 0.975 && NZ[k] > 0.4) { out[k] = b.especular; continue; } }
    out[k] = R[idx];
  }
  // luz de borda: borda da silhueta voltada para `dir`
  if (b.bordaLuz) {
    const [dx, dy] = b.bordaLuz.dir, l = Math.hypot(dx, dy) || 1;
    for (let k = 0; k < N; k++) if (PART[k] >= 0 && NZ[k] < 0.5 && (NX[k] * dx + NY[k] * dy) / l > 0.55) out[k] = b.bordaLuz.cor;
  }
  // contorno: silhueta + oclusão real (degrau grande de profundidade entre partes não unidas)
  let painted = 0;
  const edge = new Uint8Array(N);
  if (b.contorno !== undefined) {
    for (let k = 0; k < N; k++) {
      if (PART[k] < 0) continue;
      const x = k % W, y = (k - x) / W;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const xx = x + ox, yy = y + oy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const q = yy * W + xx;
        if (PART[q] < 0) { edge[k] = 1; break; }
        if (Z[q] - Z[k] > 6) { const a = PART[q], c = PART[k], key = a < c ? `${a},${c}` : `${c},${a}`; if (!(allJoin || joined.has(key)) || Z[q] - Z[k] > 14) { edge[k] = 1; break; } }
      }
    }
  }
  const tone = new Map(R.map((c, i) => [c, i]));
  for (let k = 0; k < N; k++) {
    if (out[k] < 0) continue;
    let c = out[k];
    if (edge[k] && b.contorno !== undefined) c = b.seletivo ? R[Math.max(0, (tone.get(out[k]) ?? 2) - 2)] : b.contorno;
    s.data[k] = c;
    painted++;
  }
  return painted;
}

/**
 * Pintura de cenário: degradê com dithering ordenado (Bayer), polígono preenchido e textura espalhada.
 * Funções puras sobre uma superfície de índices de paleta.
 */
import type { Surface } from "./draw.ts";

/** Matriz de Bayer n×n (n = 2, 4 ou 8), valores 0..n²-1 */
export function bayer(n: 2 | 4 | 8): number[][] {
  if (n === 2) return [[0, 2], [3, 1]];
  const h = bayer((n / 2) as 2 | 4);
  const m = n / 2;
  const out = Array.from({ length: n }, () => Array(n).fill(0));
  for (let y = 0; y < m; y++) for (let x = 0; x < m; x++) {
    const v = 4 * h[y][x];
    out[y][x] = v; out[y][x + m] = v + 2; out[y + m][x] = v + 3; out[y + m][x + m] = v + 1;
  }
  return out;
}

export interface GradientSpec {
  x: number; y: number; w: number; h: number;
  direction: "vertical" | "horizontal" | "radial";
  colors: number[];                        // índices de paleta, do início ao fim
  dither: "bayer2" | "bayer4" | "bayer8" | "nenhum";
  suavidade: number;                       // 0.1..1: largura da zona com dither dentro de cada passo
  cx?: number; cy?: number; r?: number;    // radial
  /** só pinta onde já há esta cor (0 = em qualquer lugar); ótimo para texturar um plano sem vazar */
  only?: number;
  /** como `only`, mas decidido pela imagem COMPOSTA de todas as camadas (a cor pode estar em outra camada) */
  onlyAt?: (x: number, y: number) => boolean;
  /** ondulação da borda dos passos (px): quebra as faixas retas */
  ondas?: number;
}

/**
 * Degradê com transição por dithering. Cada passo da rampa tem uma zona sólida e uma zona de transição
 * dithered; o dither fraco (< 10%) ou quase total (> 90%) é arredondado para não gerar "poeira" de pixels soltos.
 */
export function drawGradient(s: Surface, g: GradientSpec): number {
  const n = g.colors.length;
  if (n < 2) return 0;
  let painted = 0;
  const M = g.dither === "nenhum" ? null : bayer(g.dither === "bayer2" ? 2 : g.dither === "bayer8" ? 8 : 4);
  const size = M ? M.length : 1;
  const cx = g.cx ?? g.x + g.w / 2, cy = g.cy ?? g.y + g.h / 2, r = g.r ?? Math.max(g.w, g.h) / 2;
  const suav = Math.max(0.1, Math.min(1, g.suavidade));
  for (let y = g.y; y < g.y + g.h; y++) for (let x = g.x; x < g.x + g.w; x++) {
    if (x < 0 || y < 0 || x >= s.width || y >= s.height) continue;
    if (g.onlyAt ? !g.onlyAt(x, y) : g.only && s.data[y * s.width + x] !== g.only) continue;
    let t = g.direction === "vertical" ? (y - g.y + 0.5) / g.h : g.direction === "horizontal" ? (x - g.x + 0.5) / g.w : Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
    if (g.ondas) t += Math.sin(x * 0.45 + y * 0.2) * (g.ondas / (g.direction === "horizontal" ? g.w : g.direction === "radial" ? r : g.h)) * 0.5;
    if (g.direction === "radial" && t > 1) continue;                    // radial pinta só dentro do raio
    t = Math.max(0, Math.min(0.999999, t));
    const pos = t * (n - 1), i = Math.floor(pos), f = pos - i;
    let q = Math.max(0, Math.min(1, (f - (1 - suav) / 2) / suav));
    if (q < 0.1) q = 0; else if (q > 0.9) q = 1;
    const th = M ? (M[y % size][x % size] + 0.5) / (size * size) : 0.5;
    const c = q > th ? g.colors[i + 1] : g.colors[i];
    if (c) { s.data[y * s.width + x] = c; painted++; }                                  // cor "." (transparente) deixa o que já estava: o degradê se dissolve no fundo
  }
  return painted;
}

/** Polígono preenchido (regra par-ímpar por linha de varredura). `points` em pixels inteiros. */
export function fillPolygon(s: Surface, points: [number, number][], c: number): void {
  if (points.length < 3) return;
  const ys = points.map((p) => p[1]);
  const y0 = Math.max(0, Math.min(...ys)), y1 = Math.min(s.height - 1, Math.max(...ys));
  for (let y = y0; y <= y1; y++) {
    const xs: number[] = [];
    for (let k = 0; k < points.length; k++) {
      const [ax, ay] = points[k], [bx, by] = points[(k + 1) % points.length];
      if (ay === by) continue;
      const yy = y + 0.5;
      if ((yy >= Math.min(ay, by)) && (yy < Math.max(ay, by))) xs.push(ax + ((yy - ay) / (by - ay)) * (bx - ax));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.max(0, Math.round(xs[k])); x < Math.min(s.width, Math.round(xs[k + 1])); x++) s.data[y * s.width + x] = c;
    }
  }
}

export interface ScatterSpec {
  x: number; y: number; w: number; h: number;
  colors: number[];                         // sorteio com pesos iguais; repita uma cor para pesar
  densidade: number;                        // 0..1 (fração da área coberta)
  forma: "pixel" | "traco" | "cruz" | "tufo" | "onda";
  distancia: number;                        // distância mínima (Chebyshev) entre elementos: evita aglomerar
  seed: number;
  only?: number;                            // só onde já há esta cor (0 = qualquer lugar)
  onlyAt?: (x: number, y: number) => boolean;   // como only, pela imagem composta de todas as camadas
  /** cor da ponta do tufo/traço (opcional) */
  ponta?: number;
  /** (x,y) bloqueado: não pinta (ex.: onde outra camada já tem arte) */
  blocked?: (x: number, y: number) => boolean;
}

function rng(seed: number) {
  let a = seed | 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Espalha textura (grama, estrelas, flores, pedras) de forma reprodutível, com distância mínima entre elementos. */
export function scatter(s: Surface, sp: ScatterSpec): number {
  const rnd = rng(sp.seed);
  const placed: [number, number][] = [];
  const area = sp.w * sp.h;
  const tries = Math.round(area * Math.min(1, sp.densidade) * 1.6);
  const put = (x: number, y: number, c: number) => {
    if (x < 0 || y < 0 || x >= s.width || y >= s.height) return;
    if (sp.onlyAt ? !sp.onlyAt(x, y) : sp.only && s.data[y * s.width + x] !== sp.only && c !== 0) return;
    if (sp.blocked?.(x, y)) return;
    s.data[y * s.width + x] = c;
  };
  let n = 0;
  const cell = Math.max(1, sp.distancia);
  const grid = new Map<string, true>();
  for (let t = 0; t < tries && n < area * Math.min(1, sp.densidade); t++) {
    const x = sp.x + Math.floor(rnd() * sp.w), y = sp.y + Math.floor(rnd() * sp.h);
    if (x < 0 || y < 0 || x >= s.width || y >= s.height) continue;
    if (sp.onlyAt ? !sp.onlyAt(x, y) : sp.only && s.data[y * s.width + x] !== sp.only) continue;
    if (sp.blocked?.(x, y)) continue;
    if (sp.distancia > 1) {
      let ok = true;
      for (let dy = -cell; dy <= cell && ok; dy++) for (let dx = -cell; dx <= cell; dx++) if (grid.has(`${x + dx},${y + dy}`)) { ok = false; break; }
      if (!ok) continue;
      grid.set(`${x},${y}`, true);
    }
    placed.push([x, y]);
    const c = sp.colors[Math.floor(rnd() * sp.colors.length)];
    const tip = sp.ponta ?? c;
    if (sp.forma === "pixel") put(x, y, c);
    else if (sp.forma === "traco") { put(x, y, c); put(x, y - 1, tip); }
    else if (sp.forma === "onda") { const len = 2 + Math.floor(rnd() * 5); for (let k = 0; k < len; k++) put(x + k, y, k === 0 || k === len - 1 ? tip : c); }
    else if (sp.forma === "cruz") { put(x, y, c); put(x - 1, y, c); put(x + 1, y, c); put(x, y - 1, tip); put(x, y + 1, c); }
    else { const hgt = 2 + Math.floor(rnd() * 2); for (let k = 0; k < hgt; k++) put(x + (k === hgt - 1 ? (rnd() < 0.5 ? -1 : 1) : 0), y - k, k === hgt - 1 ? tip : c); }
    n++;
  }
  return n;
}

export interface Box3dSpec {
  x: number; y: number;            // canto inferior ESQUERDO da face da frente (y = chão)
  w: number; h: number;            // largura e altura da parede da frente
  prof: number;                    // profundidade em px na horizontal (a lateral aparece à direita se prof > 0, à esquerda se < 0)
  xv: number; yh: number;          // ponto de fuga: x e a altura do horizonte (linha dos olhos); as arestas em profundidade convergem para ele
  rise: number;                    // altura do telhado de duas águas (0 = teto plano)
  frente: number; lado: number; telhado: number; empena: number;
  linhas?: number; linhasTelhado?: number; espaco: number;   // tábuas/telhas (cores de risco) e distância entre elas
}

/** ponto recuado em profundidade: desloca `prof` em x e converge a altura para o horizonte (um ponto de fuga) */
function recuar(px: number, py: number, s: Box3dSpec): [number, number] {
  const f = s.prof / (s.xv - px);
  return [px + s.prof, py + (s.yh - py) * f];
}

/**
 * Caixa/casa em PERSPECTIVA de um ponto de fuga: face da frente, lateral que recua para o horizonte
 * e telhado de duas águas (só a água voltada para a lateral visível). Cores: `frente` (ex.: à sombra),
 * `lado` (voltada para a luz), `telhado`, `empena` (triângulo da frente). Risca tábuas e telhas em perspectiva.
 */
export function drawBox3d(s: Surface, b: Box3dSpec): void {
  const top = b.y - b.h, R = b.x + b.w;
  const tl: [number, number] = [b.x, top], tr: [number, number] = [R, top], bl: [number, number] = [b.x, b.y], br: [number, number] = [R, b.y];
  const rt = recuar(tr[0], tr[1], b), rb = recuar(br[0], br[1], b);
  const poly = (pts: [number, number][], c: number) => fillPolygon(s, pts.map(([x, y]) => [Math.round(x), Math.round(y)] as [number, number]), c);
  const ln = (a: [number, number], c: [number, number], col: number) => { const n = Math.max(Math.abs(c[0] - a[0]), Math.abs(c[1] - a[1])) | 0; for (let i = 0; i <= n; i++) { const t = n ? i / n : 0; const x = Math.round(a[0] + (c[0] - a[0]) * t), y = Math.round(a[1] + (c[1] - a[1]) * t); if (x >= 0 && y >= 0 && x < s.width && y < s.height) s.data[y * s.width + x] = col; } };
  // lateral (recua para o horizonte)
  poly([tr, rt, rb, br], b.lado);
  // frente
  poly([tl, tr, br, bl], b.frente);
  if (b.rise > 0) {
    const A: [number, number] = [b.x + b.w / 2, top - b.rise];
    const A2 = recuar(A[0], A[1], b);
    poly([tl, A, tr], b.empena);                         // empena (triângulo da frente)
    poly([A, A2, rt, tr], b.telhado);                    // água do telhado voltada para o observador/lateral
    if (b.linhasTelhado) for (let k = 1; k * b.espaco < Math.hypot(tr[0] - A[0], tr[1] - A[1]); k++) { const t = (k * b.espaco) / Math.hypot(tr[0] - A[0], tr[1] - A[1]); ln([A[0] + (tr[0] - A[0]) * t, A[1] + (tr[1] - A[1]) * t], [A2[0] + (rt[0] - A2[0]) * t, A2[1] + (rt[1] - A2[1]) * t], b.linhasTelhado); }
  }
  if (b.linhas) {
    for (let y = top + b.espaco; y < b.y; y += b.espaco) { const t = (y - top) / b.h; ln([b.x, y], [R, y], b.linhas); ln([R, y], [rt[0] + (rb[0] - rt[0]) * t, rt[1] + (rb[1] - rt[1]) * t], b.linhas); }
  }
}

/** ponto na lateral recuada (u: 0 = junto à frente, 1 = fundo; v: 0 = topo, 1 = chão): para colocar janelas/portas em perspectiva */
export function pontoLateral(b: Box3dSpec, u: number, v: number): [number, number] {
  const top = b.y - b.h, R = b.x + b.w;
  const rt = recuar(R, top, b), rb = recuar(R, b.y, b);
  const x = R + (rt[0] - R) * u;
  const yTop = top + (rt[1] - top) * u, yBot = b.y + (rb[1] - b.y) * u;
  return [x, yTop + (yBot - yTop) * v];
}

/**
 * Curva com ESPESSURA VARIÁVEL (rabo, tentáculo, corda, cabelo): passa pelos pontos (spline Catmull-Rom suave),
 * pintando discos de raio interpolado de r1 (início) a r2 (fim). Cor chapada; contorne depois (contorno seletivo).
 */
export function drawCurve(s: Surface, pts: [number, number][], r1: number, r2: number, c: number): void {
  if (pts.length < 2) return;
  const P = [pts[0], ...pts, pts[pts.length - 1]];
  const samples: [number, number][] = [];
  for (let k = 1; k < P.length - 2; k++) {
    for (let t = 0; t < 1; t += 0.05) {
      const t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, cc: number, d: number) => 0.5 * (2 * b + (-a + cc) * t + (2 * a - 5 * b + 4 * cc - d) * t2 + (-a + 3 * b - 3 * cc + d) * t3);
      samples.push([f(P[k - 1][0], P[k][0], P[k + 1][0], P[k + 2][0]), f(P[k - 1][1], P[k][1], P[k + 1][1], P[k + 2][1])]);
    }
  }
  samples.push(pts[pts.length - 1]);
  samples.forEach(([x, y], i) => {
    const r = r1 + ((r2 - r1) * i) / Math.max(1, samples.length - 1);
    for (let yy = Math.floor(y - r); yy <= Math.ceil(y + r); yy++) for (let xx = Math.floor(x - r); xx <= Math.ceil(x + r); xx++) {
      if (xx < 0 || yy < 0 || xx >= s.width || yy >= s.height) continue;
      if ((xx + 0.5 - x) ** 2 + (yy + 0.5 - y) ** 2 <= r * r) s.data[yy * s.width + xx] = c;
    }
  });
}

function mulberry(seed: number) { let a = seed | 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export interface TerrainSpec { x: number; w: number; topo: number; amp: number; rugosidade: number; seed: number; ate: number; color: number; vale?: { x: number; largura: number; profundidade: number } }

/** Crista de terreno fractal (deslocamento do ponto médio) preenchida até a linha `ate`: montanhas, colinas, dunas. */
export function drawTerrain(s: Surface, t: TerrainSpec): void {
  const N = 64, off = new Array(N + 1).fill(0), rnd = mulberry(t.seed);
  const mid = (a: number, b: number, d: number) => { if (b - a < 2) return; const m = (a + b) >> 1; off[m] = (off[a] + off[b]) / 2 + (rnd() - 0.5) * d; mid(a, m, d * t.rugosidade); mid(m, b, d * t.rugosidade); };
  mid(0, N, t.amp);
  const pts: [number, number][] = off.map((o: number, i: number) => {
    const px = t.x + (i * t.w) / N;
    let dip = 0;
    if (t.vale) { const d = Math.abs(px - t.vale.x) / Math.max(1, t.vale.largura / 2); if (d < 1) dip = t.vale.profundidade * (0.5 + 0.5 * Math.cos(Math.PI * d)); }   // sino suave: abre um vale (sol entre montanhas)
    return [Math.round(px), Math.round(t.topo + o + dip)];
  });
  fillPolygon(s, [...pts, [t.x + t.w, t.ate], [t.x, t.ate]], t.color);
}

export interface ForestSpec { x: number; w: number; base: number; alturaMin: number; alturaMax: number; larguraMin: number; larguraMax: number; folga: number; seed: number; colors: number[]; tipo: "pinheiro" | "redonda" | "mista" }

/** Bosque: árvores de alturas, larguras e tons variados, assentadas numa linha de base (varia o suficiente para não parecer carimbo). */
export function drawForest(s: Surface, f: ForestSpec): number {
  const rnd = mulberry(f.seed);
  let x = f.x, n = 0;
  while (x < f.x + f.w) {
    const h = Math.round(f.alturaMin + rnd() * (f.alturaMax - f.alturaMin)), w = Math.round(f.larguraMin + rnd() * (f.larguraMax - f.larguraMin));
    const c = f.colors[Math.floor(rnd() * f.colors.length)], redonda = f.tipo === "redonda" || (f.tipo === "mista" && rnd() < 0.35);
    if (redonda) {
      const ch = Math.round(h * 0.7), tw = Math.max(1, Math.round(w * 0.2));
      for (let yy = f.base - h; yy < f.base; yy++) for (let xx = x + Math.floor(w / 2) - Math.floor(tw / 2); xx < x + Math.floor(w / 2) - Math.floor(tw / 2) + tw; xx++) if (xx >= 0 && yy >= 0 && xx < s.width && yy < s.height && yy > f.base - h + ch - 1) s.data[yy * s.width + xx] = c;
      for (let yy = f.base - h; yy < f.base - h + ch; yy++) for (let xx = x; xx < x + w; xx++) {
        const nx = (xx + 0.5 - (x + w / 2)) / (w / 2), ny = (yy + 0.5 - (f.base - h + ch / 2)) / (ch / 2);
        if (nx * nx + ny * ny <= 1 && xx >= 0 && yy >= 0 && xx < s.width && yy < s.height) s.data[yy * s.width + xx] = c;
      }
    } else {
      const tiers = Math.max(2, Math.round(h / 7));
      for (let k = 0; k < tiers; k++) {
        const y1 = f.base - Math.round((h * k) / tiers) * 0, top = f.base - h + Math.round((h * k) / (tiers + 0.6)), bot = f.base - h + Math.round((h * (k + 1.6)) / (tiers + 0.6)), half = Math.max(1, Math.round((w / 2) * (0.45 + (0.55 * (k + 1)) / tiers)));
        void y1;
        fillPolygon(s, [[x + Math.floor(w / 2), top], [x + Math.floor(w / 2) + half, Math.min(f.base, bot)], [x + Math.floor(w / 2) - half, Math.min(f.base, bot)]], c);
      }
    }
    n++;
    x += Math.max(2, Math.round(w * (1 - f.folga) + rnd() * 2));
  }
  return n;
}

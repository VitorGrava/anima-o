/**
 * Checagens automáticas da arte: apontam o erro (com coordenadas) em vez de
 * depender de a IA enxergá-lo. Cobrem defeitos de execução (pixels soltos,
 * furos, serrilhado irregular, assimetria, cores quase iguais) e de animação
 * (volume que pula entre frames, base que muda, salto no fim do loop).
 */
import { hexToRgb, type Project } from "./project.ts";
import { flattenFrame } from "./render.ts";
import { legTips } from "./skeleton.ts";

export type Severity = "erro" | "aviso" | "info";

export interface Issue {
  severity: Severity;
  code: string;
  frame?: number;
  message: string;
  points?: [number, number][];
}

export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FrameMetrics {
  frame: number;
  bbox: BBox | null;
  area: number;
  /** Centro de massa da silhueta. */
  cx: number;
  cy: number;
  /** Medidas por camada (para conferir proporções: altura da cabeça, do tronco, das pernas...). */
  layers: { name: string; bbox: BBox | null; area: number }[];
}

/** Um dos 12 princípios da animação, avaliado no movimento real da animação. */
export interface PrincipleStatus {
  n: number;
  nome: string;
  /** ok = aplicado; atencao = vale melhorar; na = não se aplica / avaliação humana */
  estado: "ok" | "atencao" | "na";
  nota: string;
}

export interface AnalysisResult {
  issues: Issue[];
  /** Painel dos 12 princípios (só com 3+ frames). */
  principles?: PrincipleStatus[];
  metrics: FrameMetrics[];
  /** Camadas estáticas (chão, fundo) deixadas de fora das medidas de movimento. */
  ignoredLayers?: string[];
}

export interface AnalyzeOptions {
  /** Compara a silhueta com o espelho dela (só faça sentido para sprites vistos de frente/trás). */
  symmetric?: boolean;
  /** Inclui a transição último → primeiro frame. */
  loop?: boolean;
  /** "efeito" (brilho, chama, fumaça...) muda de tamanho de propósito: não cobra volume, base nem largura. */
  tipo?: "personagem" | "efeito" | "rotacao";
  /** ids de camadas a deixar fora das medidas (efeitos, fundo). */
  ignoreLayers?: string[];
  /** Limite de cores do ESTILO pedido (ex.: 16 para um visual retrô). Sem isso, o número de cores não é cobrado. */
  maxColors?: number;
  /** pixels da figura (sem o fundo estático), para as regras de estilo; padrão: o frame inteiro. */
  figure?: Uint8Array;
}

const MAX_POINTS = 12;

// ---------- utilidades de grade ----------

function opaqueMask(flat: Uint8Array): Uint8Array {
  const m = new Uint8Array(flat.length);
  for (let i = 0; i < flat.length; i++) m[i] = flat[i] ? 1 : 0;
  return m;
}

function bboxOf(mask: Uint8Array, w: number, h: number): BBox | null {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Componentes conexos (8 vizinhos) da máscara. */
function components(mask: Uint8Array, w: number, h: number): number[][] {
  const seen = new Uint8Array(mask.length);
  const out: number[][] = [];
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || seen[s]) continue;
    const comp: number[] = [];
    const stack = [s];
    seen[s] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      comp.push(i);
      const x = i % w;
      const y = (i - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (mask[j] && !seen[j]) {
            seen[j] = 1;
            stack.push(j);
          }
        }
      }
    }
    out.push(comp);
  }
  return out;
}

const toPoints = (idx: number[], w: number): [number, number][] =>
  idx.slice(0, MAX_POINTS).map((i) => [i % w, Math.floor(i / w)]);

// ---------- checagens por frame ----------

/** Pixels soltos e fragmentos destacados do corpo principal. */
function checkStray(mask: Uint8Array, w: number, h: number, frame: number, issues: Issue[]) {
  const comps = components(mask, w, h);
  if (comps.length < 2) return;
  const biggest = Math.max(...comps.map((c) => c.length));
  if (biggest < 12) return;
  const singles = comps.filter((c) => c.length === 1).map((c) => c[0]);
  const small = comps.filter((c) => c.length >= 2 && c.length <= 3);
  if (singles.length) {
    issues.push({
      severity: "aviso",
      code: "pixel_solto",
      frame,
      message: `${singles.length} pixel(s) solto(s), sem contato com o resto da arte (ok só se for faísca/efeito de propósito).`,
      points: toPoints(singles, w),
    });
  }
  if (small.length) {
    issues.push({
      severity: "info",
      code: "fragmento",
      frame,
      message: `${small.length} fragmento(s) de 2–3 px destacado(s) do corpo principal. Confira se é intencional.`,
      points: toPoints(small.flat(), w),
    });
  }
}

/** Furos pequenos (≤2 px) totalmente cercados pela silhueta. */
function checkHoles(mask: Uint8Array, w: number, h: number, frame: number, issues: Issue[]) {
  const outside = new Uint8Array(mask.length);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    const i = y * w + x;
    if (!mask[i] && !outside[i]) {
      outside[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    const y = (i - x) / w;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  const hole = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) hole[i] = !mask[i] && !outside[i] ? 1 : 0;
  // buracos conexos em 4 vizinhos: reaproveita `components` (8) separando por tamanho
  const tiny = components(hole, w, h).filter((c) => c.length <= 2);
  if (tiny.length) {
    issues.push({
      severity: "aviso",
      code: "furo",
      frame,
      message: `${tiny.length} furo(s) transparente(s) de 1–2 px dentro da silhueta (contorno quebrado ou falha de preenchimento?).`,
      points: toPoints(tiny.flat(), w),
    });
  }
}

/**
 * Perfil de borda de um componente: para cada linha (ou coluna), o extremo do
 * componente. Devolve as coordenadas dos extremos, por linha, só onde há pixels.
 */
function edgeProfile(comp: number[], w: number, vertical: boolean, pickMax: boolean): { pos: number; edge: number }[] {
  const best = new Map<number, number>();
  for (const i of comp) {
    const x = i % w;
    const y = (i - x) / w;
    const along = vertical ? x : y; // eixo percorrido
    const across = vertical ? y : x; // eixo da borda
    const cur = best.get(across);
    if (cur === undefined || (pickMax ? along > cur : along < cur)) best.set(across, along);
  }
  return [...best.entries()].sort((a, b) => a[0] - b[0]).map(([pos, edge]) => ({ pos, edge }));
}

/**
 * "Jaggies": numa borda em escada, os degraus devem crescer/diminuir de forma
 * regular. Procura um degrau isolado e diferente dos vizinhos (2-2-1-2-2),
 * ignorando alternâncias regulares (2-1-2-1 é uma inclinação válida).
 */
function checkJaggies(mask: Uint8Array, w: number, h: number, frame: number, issues: Issue[]) {
  const comps = components(mask, w, h).filter((c) => c.length >= 16);
  const bad: [number, number][] = [];
  for (const comp of comps) {
    for (const vertical of [true, false]) {
      for (const pickMax of [false, true]) {
        const prof = edgeProfile(comp, w, vertical, pickMax);
        if (prof.length < 6) continue;
        // runs de bordas iguais; só considera passos de 1 px (escadas)
        const runs: { len: number; step: number; start: number }[] = [];
        let start = 0;
        for (let k = 1; k <= prof.length; k++) {
          if (k === prof.length || prof[k].edge !== prof[start].edge || prof[k].pos !== prof[k - 1].pos + 1) {
            const step = k < prof.length && prof[k].pos === prof[k - 1].pos + 1 ? prof[k].edge - prof[start].edge : 0;
            runs.push({ len: k - start, step, start: prof[start].pos });
            start = k;
          }
        }
        for (let r = 2; r < runs.length - 2; r++) {
          const [x, a, b, c, y] = [runs[r - 2], runs[r - 1], runs[r], runs[r + 1], runs[r + 2]];
          const same = [x, a, b, c].every((q) => Math.abs(q.step) === 1 && q.step === a.step);
          if (!same) continue;
          if (a.len === c.len && b.len !== a.len && x.len !== b.len && y.len !== b.len) {
            const pos = b.start;
            const edge = prof.find((q) => q.pos === pos)?.edge ?? 0;
            bad.push(vertical ? [edge, pos] : [pos, edge]);
          }
        }
      }
    }
  }
  if (bad.length) {
    issues.push({
      severity: "info",
      code: "serrilhado",
      frame,
      message: `${bad.length} ponto(s) de serrilhado irregular na borda (degrau fora do ritmo, tipo 2-2-1-2-2). Regularize os segmentos (3-2-1, não 2-1-2).`,
      points: bad.slice(0, MAX_POINTS),
    });
  }
}

/**
 * Cantos quadrados: quina convexa de 90° da silhueta com dois lados retos de 4+ px
 * (o sprite "em caixa"). Formas orgânicas arredondam a quina em degraus (1-2-3).
 */
function checkSquareCorners(mask: Uint8Array, w: number, h: number, frame: number, issues: Issue[]) {
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < h ? mask[y * w + x] : 0);
  const run = (x: number, y: number, dx: number, dy: number, ox: number, oy: number) => {
    for (let k = 1; k <= 4; k++) if (!at(x + dx * k, y + dy * k) || at(x + dx * k + ox, y + dy * k + oy)) return false;
    return true;
  };
  const pts: [number, number][] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!at(x, y)) continue;
    for (const [ux, uy, vx, vy] of [[0, -1, -1, 0], [0, -1, 1, 0], [0, 1, -1, 0], [0, 1, 1, 0]]) {
      // (ux,uy) e (vx,vy): as duas direções livres da quina; os lados seguem na direção oposta de cada uma
      if (at(x + ux, y + uy) || at(x + vx, y + vy) || at(x + ux + vx, y + uy + vy)) continue;
      if (run(x, y, -vx, 0, ux, uy) && run(x, y, 0, -uy, vx, vy)) pts.push([x, y]);
    }
  }
  if (pts.length >= 3) {
    issues.push({
      severity: "info", code: "cantos_quadrados", frame,
      message: `${pts.length} quina(s) de 90° com lados retos de 4+ px na silhueta (forma "em caixa"). Arredonde as quinas em degraus (1-2-3 px) e quebre as retas longas com uma leve curva.`,
      points: pts.slice(0, MAX_POINTS),
    });
  }
}

/** Compara a silhueta com a espelhada em torno do centro da caixa envolvente. */
function checkSymmetry(flat: Uint8Array, w: number, h: number, frame: number, issues: Issue[]) {
  const mask = opaqueMask(flat);
  const bb = bboxOf(mask, w, h);
  if (!bb) return;
  const diff: number[] = [];
  let total = 0;
  for (let y = bb.y; y < bb.y + bb.h; y++) {
    for (let x = bb.x; x < bb.x + bb.w; x++) {
      const mx = bb.x + (bb.x + bb.w - 1 - x);
      const a = mask[y * w + x];
      const b = mask[y * w + mx];
      if (a || b) total++;
      if (a !== b) diff.push(y * w + x);
    }
  }
  if (diff.length) {
    issues.push({
      severity: "aviso",
      code: "assimetria",
      frame,
      message: `Silhueta assimétrica: ${diff.length} pixel(s) sem par no lado oposto (${Math.round((100 * diff.length) / Math.max(1, total))}% da área). Corrija se o sprite deveria ser simétrico.`,
      points: toPoints(diff, w),
    });
  }
}

// ---------- estilo de pixel art ----------

const lumOf = (p: Project, idx: number): number => {
  const [r, g, b] = hexToRgb(p.palette[idx - 1]?.hex ?? "#000000");
  return 0.299 * r + 0.587 * g + 0.114 * b;
};

/** Distância (4 vizinhos) de cada pixel opaco até a borda da silhueta. */
function edgeDistance(mask: Uint8Array, w: number, h: number): Float32Array {
  const d = new Float32Array(mask.length).fill(-1);
  const q: number[] = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const x = i % w;
    const y = (i - x) / w;
    const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1 || !mask[i - 1] || !mask[i + 1] || !mask[i - w] || !mask[i + w];
    if (edge) { d[i] = 0; q.push(i); }
  }
  for (let k = 0; k < q.length; k++) {
    const i = q[k];
    const x = i % w;
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
      if (j >= 0 && j < mask.length && mask[j] && d[j] < 0) { d[j] = d[i] + 1; q.push(j); }
    }
  }
  return d;
}

function pearson(a: number[], b: number[]): number {
  const n = a.length;
  const ma = a.reduce((x, y) => x + y, 0) / n;
  const mb = b.reduce((x, y) => x + y, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

/** Contorno escuro: a borda da silhueta não pode ser mais clara que o miolo (salvo brilho/halo de propósito). */
function checkOutline(p: Project, flat: Uint8Array, frame: number, issues: Issue[]) {
  const w = p.width, h = p.height;
  const mask = opaqueMask(flat);
  const d = edgeDistance(mask, w, h);
  let eSum = 0, eN = 0, iSum = 0, iN = 0;
  for (let i = 0; i < flat.length; i++) {
    if (d[i] < 0) continue;
    if (d[i] === 0) { eSum += lumOf(p, flat[i]); eN++; } else { iSum += lumOf(p, flat[i]); iN++; }
  }
  if (eN < 12 || iN < 12) return;
  const edge = eSum / eN, inner = iSum / iN;
  if (edge > inner + 12) {
    issues.push({
      severity: "aviso",
      code: "contorno_claro",
      frame,
      message: `O contorno (luminância média ${edge.toFixed(0)}) é mais claro que o preenchimento (${inner.toFixed(0)}). Em pixel art o contorno é um tom escuro do próprio material (selout), não claro, para a forma se destacar do fundo.`,
    });
  }
}

/** Banding: faixas de 1 px com tons em sequência monótona (4+ seguidas) acompanhando a borda. */
function checkBanding(p: Project, flat: Uint8Array, frame: number, issues: Issue[]) {
  const w = p.width, h = p.height;
  let hits = 0;
  const scan = (get: (a: number, b: number) => number, A: number, B: number) => {
    for (let a = 0; a < A; a++) {
      const runs: { len: number; lum: number }[] = [];
      for (let b = 0; b < B; b++) {
        const v = get(a, b);
        if (!v) { runs.push({ len: 0, lum: -1 }); continue; }
        const last = runs[runs.length - 1];
        if (last && last.len > 0 && last.lum === lumOf(p, v)) last.len++;
        else runs.push({ len: 1, lum: lumOf(p, v) });
      }
      const solid = runs.filter((r) => r.len > 0);
      for (let k = 0; k + 3 < solid.length; k++) {
        const win = solid.slice(k, k + 4);
        if (win.every((r) => r.len === 1) && (win[0].lum < win[1].lum && win[1].lum < win[2].lum && win[2].lum < win[3].lum || win[0].lum > win[1].lum && win[1].lum > win[2].lum && win[2].lum > win[3].lum)) hits++;
      }
    }
  };
  scan((y, x) => flat[y * w + x], h, w);
  scan((x, y) => flat[y * w + x], w, h);
  if (hits >= 4) {
    issues.push({
      severity: "info",
      code: "banding",
      frame,
      message: `${hits} trechos de faixas de 1 px com tons em degradê seguido (banding). Agrupe a luz e a sombra em poucos blocos grandes e decididos, em vez de várias linhas paralelas.`,
    });
  }
}

/** Pillow shading: o claro/escuro depende só da distância à borda (centro claro, borda escura em toda a volta), sem direção de luz. */
function checkPillow(p: Project, flat: Uint8Array, frame: number, issues: Issue[]) {
  const w = p.width, h = p.height;
  const mask = opaqueMask(flat);
  const d = edgeDistance(mask, w, h);
  const xs: number[] = [], ys: number[] = [], ds: number[] = [], ls: number[] = [];
  for (let i = 0; i < flat.length; i++) {
    if (d[i] < 1) continue;          // o anel do contorno (d = 0) é escuro de propósito: só o interior conta
    xs.push(i % w); ys.push(Math.floor(i / w)); ds.push(d[i]); ls.push(lumOf(p, flat[i]));
  }
  if (xs.length < 50 || new Set(ls).size < 3) return;
  const radial = pearson(ds, ls);
  let directional = 0;
  for (let k = 0; k < 8; k++) {
    const ang = (k * Math.PI) / 4;
    directional = Math.max(directional, Math.abs(pearson(xs.map((x, i) => x * Math.cos(ang) + ys[i] * Math.sin(ang)), ls)));
  }
  if (radial > 0.55 && directional < 0.35) {
    issues.push({
      severity: "aviso",
      code: "pillow_shading",
      frame,
      message: `Sombreamento "almofada": a luz cresce do contorno para o centro (correlação ${radial.toFixed(2)}) e não vem de uma direção (${directional.toFixed(2)}). Escolha uma fonte de luz (cima-esquerda): luz no lado voltado a ela, sombra no oposto e embaixo.`,
    });
  }
}

/** Ruído: muitos pixels isolados de cor diferente dentro de uma área (dither aleatório, manchas), em vez de clusters. */
function checkNoise(p: Project, flat: Uint8Array, frame: number, issues: Issue[]) {
  const w = p.width, h = p.height;
  let area = 0, speckle = 0;
  const pts: number[] = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (!flat[i]) continue;
      area++;
      const n = [flat[i - 1], flat[i + 1], flat[i - w], flat[i + w], flat[i - w - 1], flat[i - w + 1], flat[i + w - 1], flat[i + w + 1]];
      // ilha de verdade: nenhum dos 8 vizinhos tem a mesma cor (uma diagonal de 1 px não é ruído)
      if (n.every((v) => v && v !== flat[i]) && new Set(n).size <= 2) { speckle++; pts.push(i); }
    }
  }
  if (area >= 80 && speckle / area > 0.06) {
    issues.push({
      severity: "aviso",
      code: "ruido",
      frame,
      message: `${speckle} pixels (${Math.round((100 * speckle) / area)}% da área) são "ilhas" de 1 px cercadas por outra cor: parece ruído/dither aleatório. Use clusters de 3+ px; dither só em xadrez 50% em áreas grandes de transição.`,
      points: toPoints(pts, w),
    });
  }
}

// ---------- paleta ----------

function checkPalette(p: Project, frames: number[], issues: Issue[], maxColors?: number) {
  const used = new Array(p.palette.length + 1).fill(0);
  let invalid = 0;
  for (const f of frames) {
    for (const cel of Object.values(p.frames[f].cels)) {
      for (const v of cel) {
        if (v > p.palette.length) invalid++;
        else used[v]++;
      }
    }
  }
  if (invalid) issues.push({ severity: "erro", code: "indice_invalido", message: `${invalid} pixel(s) com índice de cor que não existe na paleta.` });
  // as cores padrão de `new` (0 = contorno, 1 = branco) não contam como "esquecidas"
  const isDefault = (c: { key: string; hex: string }) => (c.key === "0" && c.hex === "#1a1c2c") || (c.key === "1" && c.hex === "#f4f4f4");
  const unused = p.palette.filter((c, i) => !used[i + 1] && !isDefault(c));
  if (unused.length && frames.length === p.frames.length) {
    issues.push({ severity: "info", code: "cor_sem_uso", message: `Cores da paleta sem uso: ${unused.map((c) => `${c.key}=${c.name}`).join(", ")}.` });
  }
  const dist = (a: string, b: string) => {
    const [x, y] = [hexToRgb(a), hexToRgb(b)];
    return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
  };
  const near: string[] = [];
  for (let i = 0; i < p.palette.length; i++) {
    for (let j = i + 1; j < p.palette.length; j++) {
      if (!used[i + 1] || !used[j + 1]) continue;
      if (dist(p.palette[i].hex, p.palette[j].hex) < 14) near.push(`${p.palette[i].key}≈${p.palette[j].key}`);
    }
  }
  // tons quase iguais só embolam em sprite pequeno (ou quando o estilo limita a paleta); em arte grande e detalhada são rampas legítimas
  if (near.length && (maxColors !== undefined || Math.max(p.width, p.height) <= 48)) {
    issues.push({ severity: "aviso", code: "cores_parecidas", message: `Cores em uso quase iguais (embolam em sprite pequeno): ${near.join(", ")}. Una ou separe mais.` });
  }
  // o número de cores é decisão de ESTILO (retrô 4–16; detalhado, dezenas): só é cobrado se o estilo pedido tiver um limite
  const inUse = used.slice(1).filter((n) => n > 0).length;
  if (maxColors !== undefined && inUse > maxColors) {
    issues.push({ severity: "aviso", code: "paleta_acima_do_limite", message: `${inUse} cores em uso, acima do limite de ${maxColors} do estilo pedido. Compartilhe tons entre materiais e elimine os que ocupam poucos pixels.` });
  }
}

// ---------- métricas e consistência entre frames ----------

/** Camadas visíveis cujo conteúdo muda entre frames. Chão e fundo estáticos ficam de fora das medidas de movimento. */
export function movingLayerIds(p: Project): Set<string> {
  const ids = new Set<string>();
  for (const l of p.layers) {
    if (!l.visible) continue;
    const first = p.frames[0].cels[l.id];
    const changes = p.frames.some((f) => {
      const c = f.cels[l.id];
      if (!c || !first) return c !== first;
      for (let i = 0; i < c.length; i++) if (c[i] !== first[i]) return true;
      return false;
    });
    if (changes) ids.add(l.id);
  }
  // animação toda estática: mede tudo
  return ids.size ? ids : new Set(p.layers.filter((l) => l.visible).map((l) => l.id));
}

function flattenLayers(p: Project, frame: number, ids: Set<string>): Uint8Array {
  const out = new Uint8Array(p.width * p.height);
  for (const l of p.layers) {
    if (!ids.has(l.id)) continue;
    const cel = p.frames[frame]?.cels[l.id];
    if (!cel) continue;
    for (let i = 0; i < out.length; i++) if (cel[i]) out[i] = cel[i];
  }
  return out;
}

export function frameMetrics(p: Project, frame: number, only?: Set<string>): FrameMetrics {
  const flat = only ? flattenLayers(p, frame, only) : flattenFrame(p, frame);
  const mask = opaqueMask(flat);
  let area = 0;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    area++;
    sx += i % p.width;
    sy += Math.floor(i / p.width);
  }
  const layers = p.layers
    .filter((l) => l.visible)
    .map((l) => {
      const cel = p.frames[frame].cels[l.id];
      const m = cel ? opaqueMask(cel) : new Uint8Array(p.width * p.height);
      return { name: l.name, bbox: bboxOf(m, p.width, p.height), area: m.reduce((a, b) => a + b, 0) };
    });
  return { frame, bbox: bboxOf(mask, p.width, p.height), area, cx: area ? sx / area : 0, cy: area ? sy / area : 0, layers };
}

function checkSequence(p: Project, metrics: FrameMetrics[], loop: boolean, issues: Issue[], tipo: "personagem" | "efeito" | "rotacao" = "personagem", articulated = false) {
  // figura articulada (3+ camadas se movendo: pernas, braços, tronco): a área varia naturalmente com a abertura dos membros
  const tolerance = articulated ? 0.38 : 0.2;
  const pairs: [number, number][] = [];
  for (let k = 0; k + 1 < metrics.length; k++) pairs.push([k, k + 1]);
  if (loop && metrics.length > 1 && metrics[0].frame === 0 && metrics[metrics.length - 1].frame === p.frames.length - 1) {
    pairs.push([metrics.length - 1, 0]);
  }
  for (const [ia, ib] of pairs) {
    const a = metrics[ia];
    const b = metrics[ib];
    const seam = ia > ib;
    const tag = seam ? `último→primeiro (frames ${a.frame}→${b.frame})` : `frames ${a.frame}→${b.frame}`;
    if (!a.area || !b.area) continue;
    const change = (b.area - a.area) / a.area;
    if (tipo === "personagem" && Math.abs(change) > tolerance) {
      issues.push({
        severity: "aviso",
        code: "volume_pulou",
        frame: b.frame,
        message: `${tag}: a área da silhueta mudou ${Math.round(change * 100)}% (${a.area}→${b.area} px). Em squash & stretch o volume deve se manter; confira se não é erro de desenho. Se o objeto cresce/pulsa de propósito (batimento, brilho), rode check com tipo=\"efeito\".`,
      });
    }
    if (tipo === "personagem" && a.bbox && b.bbox) {
      const baseJump = b.bbox.y + b.bbox.h - (a.bbox.y + a.bbox.h);
      if (Math.abs(baseJump) >= 3) {
        issues.push({
          severity: "info",
          code: "base_mudou",
          frame: b.frame,
          message: `${tag}: a base (pés) subiu/desceu ${baseJump} px. Normal em pulo; em caminhada/idle indica o personagem "flutuando".`,
        });
      }
      const wChange = Math.abs(b.bbox.w - a.bbox.w) / Math.max(1, a.bbox.w);
      if (wChange > 0.3 && Math.abs(b.bbox.w - a.bbox.w) >= 3) {
        issues.push({
          severity: "info",
          code: "largura_mudou",
          frame: b.frame,
          message: `${tag}: a largura da silhueta mudou de ${a.bbox.w} para ${b.bbox.w} px.`,
        });
      }
    }
    if (seam) {
      const diff = (f1: number, f2: number) => {
        const fa = flattenFrame(p, f1), fb = flattenFrame(p, f2);
        let d = 0;
        for (let i = 0; i < fa.length; i++) if (fa[i] !== fb[i]) d++;
        return d;
      };
      const d = diff(a.frame, b.frame);
      const consecutive = metrics.slice(1).map((m, k) => diff(metrics[k].frame, m.frame));
      const avg = consecutive.reduce((x, y) => x + y, 0) / Math.max(1, consecutive.length);
      // só incomoda se a emenda muda bem mais que um passo normal entre frames
      if (d > 0 && a.frame !== b.frame && avg > 0 && d > avg * 1.6) {
        issues.push({
          severity: "aviso",
          code: "emenda_loop",
          frame: b.frame,
          message: `Emenda do loop: o último e o primeiro frame diferem em ${d} px, e a diferença média entre frames seguidos é ${Math.round(avg)} px. O último frame devia chegar perto do primeiro; use view com compare para ver o salto.`,
        });
      }
    }
  }
}

// ---------- anatomia: comprimento dos segmentos ----------

/** Diâmetro de Feret aproximado (maior extensão em 4 direções) do conteúdo de uma camada. */
function feret(cel: Uint8Array, w: number): number {
  let n = 0;
  const mm = [[1e9, -1e9], [1e9, -1e9], [1e9, -1e9], [1e9, -1e9]];
  for (let i = 0; i < cel.length; i++) {
    if (!cel[i]) continue;
    n++;
    const x = i % w, y = Math.floor(i / w);
    [x, y, (x + y) / Math.SQRT2, (x - y) / Math.SQRT2].forEach((v, k) => { mm[k][0] = Math.min(mm[k][0], v); mm[k][1] = Math.max(mm[k][1], v); });
  }
  return n < 6 ? 0 : Math.max(...mm.map(([a, b]) => b - a + 1));
}

/** Uma camada rígida (coxa, canela, braço) não pode mudar de comprimento ao girar: avisa quando muda demais. */
function checkSegmentLengths(p: Project, frames: number[], moving: Set<string>, issues: Issue[]) {
  for (const l of p.layers) {
    if (!moving.has(l.id)) continue;
    const lens = frames.map((f) => (p.frames[f].cels[l.id] ? feret(p.frames[f].cels[l.id], p.width) : 0)).filter((v) => v > 0);
    if (lens.length < 3 || Math.max(...lens) < 7) continue;
    const ratio = Math.max(...lens) / Math.min(...lens);
    // só camadas que parecem um segmento (movem-se mas mantêm a massa); ratio alto = o membro "encolhe/estica" sem querer
    const areas = frames.map((f) => { const c = p.frames[f].cels[l.id]; return c ? c.reduce((a, v) => a + (v ? 1 : 0), 0) : 0; }).filter((v) => v > 0);
    const areaRatio = Math.max(...areas) / Math.min(...areas);
    if (ratio > 1.45 && areaRatio < 1.25) {
      issues.push({
        severity: "info",
        code: "segmento_muda",
        message: `A camada "${l.name}" tem a mesma massa em todos os frames mas o comprimento vai de ${Math.min(...lens).toFixed(0)} a ${Math.max(...lens).toFixed(0)} px. Vale para UM segmento rígido por camada (coxa, canela, braço): o comprimento não pode mudar, então gire a partir de uma cópia limpa e confira o pivô. Ignore se a camada tem um membro articulado que dobra (a caixa muda ao dobrar).`,
      });
    }
  }
}

/** Camadas que se movem uma contra a outra podem abrir uma fresta de 1 px (cabeça × tronco): a figura "parte" em dois pedaços. */
function checkSplitFigure(p: Project, frames: number[], moving: Set<string>, issues: Issue[]) {
  // a figura = camadas que se movem + camadas estáticas pequenas (um tronco parado); o fundo grande fica de fora
  const figure = new Set(moving);
  for (const l of p.layers) {
    if (!l.visible || figure.has(l.id)) continue;
    const area = p.frames[0].cels[l.id]?.reduce((a, v) => a + (v ? 1 : 0), 0) ?? 0;
    if (area > 0 && area < 0.4 * p.width * p.height) figure.add(l.id);
  }
  const counts = frames.map((f) => {
    const flat = flattenLayers(p, f, figure);
    const big = components(opaqueMask(flat), p.width, p.height).filter((c) => c.length >= 10);
    return { f, n: big.length };
  });
  const freq = new Map<number, number>();
  for (const c of counts) if (c.n > 0) freq.set(c.n, (freq.get(c.n) ?? 0) + 1);
  const modal = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 1;
  const split = counts.filter((c) => c.n > modal && c.n > 0);
  if (split.length && split.length <= Math.ceil(frames.length / 2)) {
    issues.push({
      severity: "aviso",
      code: "figura_partida",
      frame: split[0].f,
      message: `Nos frames ${split.map((c) => c.f).join(", ")}, a figura se parte em ${split[0].n} pedaços (nos outros são ${modal}): provavelmente uma fresta de 1 px entre camadas que se moveram (ex.: cabeça sobe e abre um vão no pescoço). Faça as camadas se sobreporem 1–2 px no pivô.`,
    });
  }
}

// ---------- movimento e tempo ----------

/**
 * Trajetória do centro de massa e tempos: aponta o que faz uma animação parecer "dura":
 * emenda do loop com salto, durações todas iguais, frames repetidos sem segurar a pose,
 * movimento quase nulo e passos de tamanho constante (sem ease).
 */
function checkMotion(p: Project, metrics: FrameMetrics[], loop: boolean, issues: Issue[], tipo: "personagem" | "efeito" | "rotacao" = "personagem", articulated = false) {
  const ms = metrics.filter((m) => m.area > 0);
  if (ms.length < 3) return;
  const dur = (m: FrameMetrics) => p.frames[m.frame].duration ?? Math.round(1000 / p.fps);
  const step = (a: FrameMetrics, b: FrameMetrics) => Math.hypot(b.cx - a.cx, b.cy - a.cy);
  const steps = ms.slice(1).map((m, i) => step(ms[i], m));
  const sorted = [...steps].sort((x, y) => x - y);
  const median = sorted[Math.floor(sorted.length / 2)];

  // emenda do loop: o salto último → primeiro deve ser parecido com um passo normal
  if (loop && ms.length > 2) {
    const seam = step(ms[ms.length - 1], ms[0]);
    const ref = Math.max(median, 0.5);
    if (seam > ref * 2.5 && seam > (articulated ? 3 : 1.5)) {
      issues.push({
        severity: "aviso",
        code: "emenda_salta",
        frame: ms[0].frame,
        message: `Emenda do loop: o centro da arte salta ${seam.toFixed(1)} px do último para o primeiro frame, mas um passo normal é ~${ref.toFixed(1)} px. O loop vai "engasgar": faça o último frame chegar perto do primeiro.`,
      });
    }
  }
  // tempos: tudo igual deixa o movimento mecânico
  const durs = ms.map(dur);
  // marcha com chão rolando (rig_walk no_lugar): a duração TEM de ser igual, senão o chão acelera e freia contra o pé
  const lockedTiming = p.rig?.travel !== undefined;
  if (ms.length >= 4 && new Set(durs).size === 1 && !lockedTiming) {
    issues.push({
      severity: "info",
      code: "tempo_uniforme",
      message: `Todos os ${ms.length} frames duram ${durs[0]} ms. Segure as poses importantes (apogeu, impacto, pose final: 2–3× mais) e acelere o resto com set_frame_timing.`,
    });
  }
  // frames repetidos em sequência: some a diferença sem ganhar tempo
  const repeats: number[] = [];
  for (let k = 1; k < ms.length; k++) {
    const fa = flattenFrame(p, ms[k - 1].frame);
    const fb = flattenFrame(p, ms[k].frame);
    let same = true;
    for (let i = 0; i < fa.length; i++) if (fa[i] !== fb[i]) { same = false; break; }
    if (same) repeats.push(ms[k].frame);
  }
  if (repeats.length) {
    issues.push({
      severity: "info",
      code: "frame_repetido",
      message: `Frame(s) ${repeats.join(", ")} idêntico(s) ao anterior. Para segurar uma pose, aumente a duração do frame em vez de duplicá-lo.`,
    });
  }
  // quase parado
  if (tipo === "personagem" && Math.max(...steps) < 0.35) {
    issues.push({
      severity: "aviso",
      code: "quase_estatica",
      message: "O centro da arte quase não se move entre os frames. Se a animação deveria ter movimento visível, exagere mais as poses (ou anime as cores, se for um movimento de sub-pixel).",
    });
  }
  // passos constantes: sem aceleração/desaceleração (ease)
  if (tipo === "personagem" && steps.length >= 4 && median >= 1) {
    const spread = (sorted[sorted.length - 1] - sorted[0]) / median;
    if (spread < 0.2) {
      issues.push({
        severity: "info",
        code: "sem_ease",
        message: `Os passos do movimento têm tamanho quase igual (~${median.toFixed(1)} px). Movimentos naturais aceleram e desaceleram: aproxime os frames perto das poses-chave e espace mais no meio.`,
      });
    }
  }
}

// ---------- os 12 princípios da animação ----------

/**
 * Avalia, com o movimento real (centro de massa, caixa e tempos por frame e por camada), cada um dos
 * 12 princípios. Não substitui o olho do animador: o que não dá para medir (encenação, desenho sólido,
 * apelo) vem marcado como avaliação humana, com a pergunta certa para fazer.
 */
function evaluatePrinciples(p: Project, frames: number[], metrics: FrameMetrics[], issues: Issue[], opts: AnalyzeOptions, moving: Set<string>, articulated = false): PrincipleStatus[] {
  const tipo = opts.tipo ?? "personagem";
  const codes = new Set(issues.map((i) => i.code));
  const ms = metrics.filter((m) => m.area > 0);
  const out: PrincipleStatus[] = [];
  const add = (n: number, nome: string, estado: PrincipleStatus["estado"], nota: string) => out.push({ n, nome, estado, nota });
  const steps = ms.slice(1).map((m, i) => ({ dx: m.cx - ms[i].cx, dy: m.cy - ms[i].cy, len: Math.hypot(m.cx - ms[i].cx, m.cy - ms[i].cy) }));
  const maxStep = Math.max(0, ...steps.map((q) => q.len));
  const canvas = Math.max(p.width, p.height);
  const dur = (f: number) => p.frames[f].duration ?? Math.round(1000 / p.fps);

  // 1. Squash and Stretch: a caixa muda de proporção e a área se mantém
  const ws = ms.map((m) => m.bbox?.w ?? 0), hs = ms.map((m) => m.bbox?.h ?? 0);
  const range = (a: number[]) => (Math.max(...a) - Math.min(...a)) / Math.max(1, Math.max(...a));
  if (tipo !== "personagem") add(1, "Squash and Stretch (comprimir e esticar)", "na", "Em efeitos e rotações o tamanho muda por outro motivo.");
  else if (articulated && !codes.has("volume_pulou") && Math.max(range(ws), range(hs)) < 0.15) add(1, "Squash and Stretch (comprimir e esticar)", "na", "Figura articulada com pouca deformação (idle, andar, correr): o amassar é sutil; o peso aparece no corpo que afunda 1–2 px.");
  else if (codes.has("volume_pulou")) add(1, "Squash and Stretch (comprimir e esticar)", "atencao", "A forma deforma, mas o volume (área) não se mantém: se esticar na vertical, afine na horizontal.");
  else if (Math.max(range(ws), range(hs)) >= 0.15) add(1, "Squash and Stretch (comprimir e esticar)", "ok", "A forma achata e estica e o volume se mantém.");
  else add(1, "Squash and Stretch (comprimir e esticar)", "atencao", "A silhueta não deforma: se há impacto ou salto, amasse no contato e estique na velocidade.");

  // 2. Antecipação: um passo no sentido contrário antes do passo maior
  if (maxStep < (articulated ? 4 : 1.5) || steps.length < 3) add(2, "Anticipation (antecipação)", "na", articulated ? "Ciclo no lugar (andar, correr, idle): sem uma ação forte única, a antecipação não se aplica." : "Sem ação forte o bastante para pedir antecipação.");
  else {
    const k = steps.findIndex((q) => q.len === maxStep);
    const before = steps.slice(0, k).some((q) => q.len >= 0.4 && q.dx * steps[k].dx + q.dy * steps[k].dy < 0);
    const squashBefore = k > 0 && (ws[k] > ws[0] * 1.1 || hs[k] < hs[0] * 0.9);
    if (before || squashBefore) add(2, "Anticipation (antecipação)", "ok", "Há um movimento ou agachamento no sentido oposto antes da ação principal.");
    else add(2, "Anticipation (antecipação)", "atencao", `A ação mais forte (${maxStep.toFixed(1)} px, frames ${ms[k].frame}→${ms[k + 1].frame}) começa sem preparação: recue/agache 1–2 frames antes.`);
  }

  // 3. Staging: a figura é legível (tamanho razoável no quadro e contraste com o fundo)
  const fracs = ms.map((m) => (m.bbox ? (m.bbox.w * m.bbox.h) / (p.width * p.height) : 0));
  const frac = fracs.length ? Math.max(...fracs) : 0;
  if (codes.has("contraste_fraco")) add(3, "Staging (encenação)", "atencao", "A figura quase não se separa do fundo: aumente o contraste (fundo mais apagado).");
  else if (frac < 0.06) add(3, "Staging (encenação)", "atencao", "A figura ocupa muito pouco do quadro: aproxime ou aumente, para a ação ser o ponto focal.");
  else add(3, "Staging (encenação)", "ok", "A figura tem tamanho e contraste para ser o foco (confira você: a pose se lê só pela silhueta? use view check=silhueta).");

  // 4. Pose a pose × ação direta: decisão do animador; o que dá para medir é se há poses seguradas
  const durs = ms.map((m) => dur(m.frame));
  const sortedD = [...durs].sort((a, b) => a - b);
  const medD = sortedD[Math.floor(sortedD.length / 2)] || 1;
  if (p.rig?.travel) add(4, "Straight Ahead and Pose to Pose (ação direta e pose a pose)", "na", "Marcha gerada por IK com o chão em velocidade fixa: as poses vêm da fase do passo, não de poses-chave seguradas.");
  else if (Math.max(...durs) >= Math.min(...durs) * 1.3 || durs.some((d) => d >= medD * 1.5)) add(4, "Straight Ahead and Pose to Pose (ação direta e pose a pose)", "ok", "Há poses-chave seguradas (duração maior) entre intermediários mais rápidos: bom sinal de pose a pose.");
  else add(4, "Straight Ahead and Pose to Pose (ação direta e pose a pose)", "atencao", "Nenhuma pose é segurada: defina as poses-chave (extremos), segure-as e preencha os intermediários.");

  // 5. Follow through e overlapping: partes diferentes se movem com atraso
  const layerIds = [...moving];
  const series = layerIds.map((id) => frames.map((f) => {
    const cel = p.frames[f].cels[id];
    let n = 0, cx = 0, cy = 0;
    if (cel) for (let i = 0; i < cel.length; i++) if (cel[i]) { n++; cx += i % p.width; cy += Math.floor(i / p.width); }
    return n ? { x: cx / n, y: cy / n } : null;
  }));
  const argmaxStep = (sr: ({ x: number; y: number } | null)[]) => {
    let best = -1, k = -1;
    for (let i = 1; i < sr.length; i++) { const a = sr[i - 1], b = sr[i]; if (a && b) { const d = Math.hypot(b.x - a.x, b.y - a.y); if (d > best) { best = d; k = i; } } }
    return best > 0.3 ? k : -1;
  };
  const peaks = series.map(argmaxStep).filter((k) => k >= 0);
  if (tipo !== "personagem" || ms.length < 3) add(5, "Follow Through and Overlapping Action (continuidade e sobreposição)", "na", "Vale para personagens com partes soltas (cabelo, capa, cauda, braços).");
  else if (peaks.length >= 2 && new Set(peaks).size > 1) add(5, "Follow Through and Overlapping Action (continuidade e sobreposição)", "ok", "As camadas atingem o pico de movimento em frames diferentes (há defasagem). Isto só mede a defasagem: confira você se as partes soltas (rabo, cabelo, capa) chegam DEPOIS do corpo.");
  else add(5, "Follow Through and Overlapping Action (continuidade e sobreposição)", "atencao", "Tudo se move junto, como um bloco: separe cabelo, capa, cauda e braços em camadas e atrase-os 1–2 frames em relação ao corpo.");

  // quando o corpo anda no lugar (ciclo parado no centro), o movimento está nos membros: usa a camada que mais se move
  const layerPaths = series.map((sr) => {
    const pts = sr.filter((q): q is { x: number; y: number } => q !== null);
    const st = pts.slice(1).map((q, k) => ({ dx: q.x - pts[k].x, dy: q.y - pts[k].y, len: Math.hypot(q.x - pts[k].x, q.y - pts[k].y) }));
    return { pts, st, max: Math.max(0, ...st.map((q) => q.len)) };
  });
  const alt = maxStep < 1.5 ? layerPaths.sort((a, b) => b.max - a.max)[0] : undefined;
  const useAlt = !!alt && alt.max >= 1.5 && alt.st.length >= 3;
  const stepsE = useAlt ? alt!.st : steps;
  const maxE = useAlt ? alt!.max : maxStep;
  const medE = [...stepsE.map((q) => q.len)].sort((a, b) => a - b)[Math.floor(stepsE.length / 2)] || 0;
  const spreadE = medE > 0 ? (Math.max(...stepsE.map((q) => q.len)) - Math.min(...stepsE.map((q) => q.len))) / medE : 0;

  // 6. Slow in / slow out
  if (useAlt && stepsE.length >= 4) {
    if (spreadE < 0.2) add(6, "Slow In and Slow Out (aceleração e desaceleração)", "atencao", `O membro que mais se move anda em passos iguais (~${medE.toFixed(1)} px): acelere/desacelere perto das poses-chave.`);
    else add(6, "Slow In and Slow Out (aceleração e desaceleração)", "ok", "O membro que mais se move acelera e desacelera (o corpo anda no lugar).");
  } else if (maxStep < 1) add(6, "Slow In and Slow Out (aceleração e desaceleração)", "na", "Movimento pequeno demais para medir o ease.");
  else if (codes.has("sem_ease")) add(6, "Slow In and Slow Out (aceleração e desaceleração)", "atencao", "Os passos têm tamanho igual: aproxime os frames perto das poses-chave e afaste no meio.");
  else add(6, "Slow In and Slow Out (aceleração e desaceleração)", "ok", "O espaçamento entre frames varia (aceleração e desaceleração).");

  // 7. Arcos: o caminho do centro não é uma reta quando há deslocamento nos dois eixos
  const totalX = steps.reduce((a, q) => a + Math.abs(q.dx), 0), totalY = steps.reduce((a, q) => a + Math.abs(q.dy), 0);
  if (useAlt && alt!.pts.length >= 4) {
    const pts = alt!.pts;
    const a0 = pts[0], b0 = pts[pts.length - 1];
    const len0 = Math.hypot(b0.x - a0.x, b0.y - a0.y);
    const ax = pts.reduce((q, w, k) => (k ? q + Math.abs(w.x - pts[k - 1].x) : q), 0), ay = pts.reduce((q, w, k) => (k ? q + Math.abs(w.y - pts[k - 1].y) : q), 0);
    // trajetória em laço fechado (o membro volta ao ponto de partida): se anda nos dois eixos, é arco/elipse
    const loopy = len0 < 0.4 * Math.max(ax + ay, 1);
    if (Math.min(ax, ay) < 0.2 * Math.max(ax, ay, 0.001)) add(7, "Arcs (movimento em arco)", "atencao", "O membro que mais se move anda quase em linha reta: levante o pé em arco (sobe e desce enquanto avança).");
    else add(7, "Arcs (movimento em arco)", "ok", loopy ? "O membro que mais se move faz um laço/arco nos dois eixos (o pé sobe e avança)." : "O membro que mais se move segue uma trajetória curva.");
  } else if (Math.min(totalX, totalY) < 0.15 * Math.max(totalX, totalY, 0.001) || maxStep < 1.5) add(7, "Arcs (movimento em arco)", "na", "O movimento é quase todo em um eixo (ex.: quique vertical); arcos valem para trajetórias e membros.");
  else {
    const a = ms[0], b = ms[ms.length - 1];
    const len = Math.hypot(b.cx - a.cx, b.cy - a.cy);
    let dev = 0;
    for (const m of ms) dev = Math.max(dev, len > 0.5 ? Math.abs((b.cx - a.cx) * (a.cy - m.cy) - (a.cx - m.cx) * (b.cy - a.cy)) / len : Math.hypot(m.cx - a.cx, m.cy - a.cy));
    const path = steps.reduce((q, w) => q + w.len, 0);
    if (dev / Math.max(path, 1) >= 0.1) add(7, "Arcs (movimento em arco)", "ok", "O caminho do centro é curvo (não uma reta).");
    else add(7, "Arcs (movimento em arco)", "atencao", "O caminho do centro é quase reto: calcule as posições ao longo de uma curva.");
  }

  // 8. Ação secundária: mais de uma camada se movendo
  if (tipo === "rotacao") add(8, "Secondary Action (ação secundária)", "na", "Uma rotação simples não pede ação secundária.");
  else if (layerIds.length >= 2) add(8, "Secondary Action (ação secundária)", "ok", `${layerIds.length} camadas se movem (além da ação principal há movimento secundário).`);
  else add(8, "Secondary Action (ação secundária)", "atencao", "Só uma camada se move: acrescente piscar, respirar, balançar, faíscas ou uma sombra que reage.");

  // 9. Timing
  const tinyLoop = Math.max(p.width, p.height) <= 32 && p.frames.length <= 8;
  if (tinyLoop) add(9, "Timing (temporização)", "na", "Ícone/efeito pequeno em poucos frames: o tempo é uniforme de propósito (a leitura vem do desenho, não do ritmo).");
  else if (p.rig?.travel) add(9, "Timing (temporização)", "na", "Marcha com chão que rola numa velocidade fixa: a duração igual é de propósito (variar o tempo faria o chão acelerar e frear contra o pé).");
  else if (codes.has("tempo_uniforme")) add(9, "Timing (temporização)", "atencao", "Todos os frames duram o mesmo: segure o apogeu/impacto (2–3×) e acelere o resto.");
  else add(9, "Timing (temporização)", ms.length < 3 ? "na" : "ok", ms.length < 3 ? "" : `Durações variam entre ${Math.min(...durs)} e ${Math.max(...durs)} ms.`);

  // 10. Exagero
  const ampl = Math.max(maxStep, range(ws) * p.width * 0.5, range(hs) * p.height * 0.5) / canvas;
  if (ampl < 0.05 && maxStep < 2) add(10, "Exaggeration (exagero)", "na", "Movimento sutil (idle, respiração): é de propósito. Só amplie se o pedido for expressivo.");
  else if (ampl < 0.05) add(10, "Exaggeration (exagero)", "atencao", "As poses são quase iguais: amplie o movimento e a deformação (poses um pouco mais extremas leem melhor em poucos pixels).");
  else add(10, "Exaggeration (exagero)", "ok", "A amplitude é visível no quadro (cuide para não virar irreal).");

  // 11. Desenho sólido: volume, luz e contorno consistentes
  const solidBad = ["pillow_shading", "contorno_claro", "luz_inconsistente", "ruido", "banding"].filter((c) => codes.has(c));
  if (solidBad.length) add(11, "Solid Drawing (desenho volumétrico)", "atencao", `Volume mal construído (${solidBad.join(", ")}): uma luz só, contorno escuro, blocos grandes de luz e sombra.`);
  else add(11, "Solid Drawing (desenho volumétrico)", "ok", "Sem pillow shading, banding, ruído, contorno claro nem luz trocando de lado.");

  // 12. Apelo: não é medível
  add(12, "Appeal (apelo)", "na", "Avaliação humana: a silhueta é simpática? os olhos/rosto têm personalidade? as proporções são atraentes (cabeça e olhos grandes = fofura)?");
  return out;
}

// ---------- rig (só se o projeto tiver esqueleto) ----------

function checkRig(p: Project, frames: number[], issues: Issue[]) {
  const rig = p.rig;
  if (!rig) return;
  const names = new Set(rig.bones.map((b) => b.name));
  for (const part of rig.parts) {
    if (!names.has(part.bone)) issues.push({ severity: "erro", code: "rig_parte_sem_osso", message: `A parte "${part.name}" está presa ao osso "${part.bone}", que não existe.` });
  }
  const used = new Set(rig.parts.map((x) => x.bone));
  const loose = rig.bones.filter((b) => !used.has(b.name) && !rig.bones.some((c) => c.parent === b.name && false)).map((b) => b.name);
  if (loose.length) issues.push({ severity: "info", code: "rig_osso_sem_arte", message: `Ossos sem arte presa: ${loose.join(", ")}. Tudo bem se são só articulações; senão, use rig_part.` });
  const posed = frames.filter((f) => p.frames[f].pose);
  if (posed.length && posed.length < frames.length) issues.push({ severity: "aviso", code: "rig_frames_sem_pose", message: `Frames sem pose: ${frames.filter((f) => !p.frames[f].pose).join(", ")}. O bake não renderiza esses frames.` });
  for (const f of posed) {
    for (const [n, v] of Object.entries(p.frames[f].pose!.angles)) {
      const b = rig.bones.find((x) => x.name === n);
      if (!b) issues.push({ severity: "erro", code: "rig_pose_osso_desconhecido", frame: f, message: `A pose do frame ${f} usa o osso "${n}", que não existe.` });
      else if (v < b.min - 1e-6 || v > b.max + 1e-6) issues.push({ severity: "aviso", code: "rig_fora_do_limite", frame: f, message: `${n} = ${v.toFixed(0)}° no frame ${f} está fora do limite anatômico [${b.min}, ${b.max}].` });
    }
  }
}

/** Pé apoiado que escorrega: na marcha, a sola apoiada tem de ficar parada em relação ao chão (que pode estar rolando). */
function checkFootSlide(p: Project, frames: number[], issues: Issue[]) {
  const rig = p.rig;
  if (!rig?.legs?.length || !rig.travel) return;
  const expected = rig.travel.mode === "no_lugar" ? -rig.travel.speed : 0;
  const posed = frames.filter((f) => p.frames[f].pose);
  const bad: string[] = [];
  for (let k = 0; k + 1 < posed.length; k++) {
    if (posed[k + 1] !== posed[k] + 1) continue;
    const a = legTips(rig, p.frames[posed[k]].pose), b = legTips(rig, p.frames[posed[k + 1]].pose);
    rig.legs.forEach((leg, i) => {
      const planted = (t: { y: number }) => Math.abs(t.y - (rig.ground - leg.drop)) <= 0.4;      // um pé que já subiu 0,4 px está no balanço
      if (!planted(a[i]) || !planted(b[i])) return;
      const slip = Math.abs(b[i].x - a[i].x - expected);
      if (slip > 1.6) bad.push(`frames ${posed[k]}→${posed[k + 1]} (${leg.lower}: ${slip.toFixed(1)} px)`);
    });
  }
  if (bad.length) issues.push({ severity: "aviso", code: "pe_escorrega", message: `O pé apoiado escorrega no chão em ${bad.slice(0, 4).join("; ")}${bad.length > 4 ? "..." : ""}. Com a raiz ${rig.travel.mode === "andar" ? "avançando" : "parada"}, a sola apoiada devia ${rig.travel.mode === "andar" ? "ficar parada" : `acompanhar o chão (${-rig.travel.speed} px por frame)`}: use rig_walk, que trava os pés por IK.` });
}

// ---------- API ----------

/** Checagens de um único frame (rápidas: usadas no preview automático dos comandos de desenho). */
export function analyzeFrame(p: Project, frame: number, opts: AnalyzeOptions = {}): Issue[] {
  const flat = flattenFrame(p, frame);
  const mask = opaqueMask(flat);
  const issues: Issue[] = [];
  if (!mask.some(Boolean)) {
    issues.push({ severity: "aviso", code: "frame_vazio", frame, message: "Frame vazio (sem nenhum pixel visível)." });
    return issues;
  }
  checkStray(mask, p.width, p.height, frame, issues);
  checkHoles(mask, p.width, p.height, frame, issues);
  checkJaggies(mask, p.width, p.height, frame, issues);
  checkSquareCorners(mask, p.width, p.height, frame, issues);
  const figure = opts.figure ?? flat;
  // efeitos (chama, brilho) emitem luz: centro claro e bordas escuras estão certos, e não têm contorno sólido
  if (opts.tipo !== "efeito") {
    checkOutline(p, figure, frame, issues);
    checkPillow(p, figure, frame, issues);
  }
  checkBanding(p, figure, frame, issues);
  checkNoise(p, figure, frame, issues);
  if (opts.symmetric) checkSymmetry(flat, p.width, p.height, frame, issues);
  return issues;
}

/** Contraste figura × fundo (camadas estáticas) e consistência da direção da luz entre frames. */
function checkContrastAndLight(p: Project, frames: number[], moving: Set<string>, issues: Issue[]) {
  const staticIds = new Set(p.layers.filter((l) => l.visible && !moving.has(l.id)).map((l) => l.id));
  if (staticIds.size && moving.size) {
    const bg = flattenLayers(p, frames[0], staticIds);
    const fg = flattenLayers(p, frames[0], moving);
    let fs = 0, fn = 0, bs = 0, bn = 0;
    for (let i = 0; i < fg.length; i++) {
      if (fg[i]) { fs += lumOf(p, fg[i]); fn++; }
      if (bg[i] && !fg[i]) { bs += lumOf(p, bg[i]); bn++; }
    }
    // só compara com um FUNDO de verdade (camadas estáticas que cobrem boa parte do quadro); um chão fino não é o fundo da figura
    if (fn >= 10 && bn >= 0.35 * p.width * p.height && Math.abs(fs / fn - bs / bn) < 22) {
      issues.push({
        severity: "aviso",
        code: "contraste_fraco",
        message: `A figura (luminância média ${(fs / fn).toFixed(0)}) quase não se distingue do fundo (${(bs / bn).toFixed(0)}). Escureça/clareie um dos dois: o personagem precisa se destacar e o fundo deve ter menos contraste e saturação.`,
      });
    }
  }
  // direção da luz: do centro da silhueta para o centro de luminância; não pode virar de lado entre frames
  const dirs: { frame: number; vx: number; vy: number }[] = [];
  for (const f of frames) {
    const flat = flattenLayers(p, f, moving);
    let n = 0, cx = 0, cy = 0, lw = 0, lx = 0, ly = 0;
    for (let i = 0; i < flat.length; i++) {
      if (!flat[i]) continue;
      const x = i % p.width, y = Math.floor(i / p.width), l = lumOf(p, flat[i]) + 1;
      n++; cx += x; cy += y; lw += l; lx += x * l; ly += y * l;
    }
    if (n >= 30) dirs.push({ frame: f, vx: lx / lw - cx / n, vy: ly / lw - cy / n });
  }
  const strong = dirs.filter((d) => Math.hypot(d.vx, d.vy) > 0.6);
  for (let a = 0; a < strong.length; a++) {
    for (let b = a + 1; b < strong.length; b++) {
      const dot = strong[a].vx * strong[b].vx + strong[a].vy * strong[b].vy;
      const cos = dot / (Math.hypot(strong[a].vx, strong[a].vy) * Math.hypot(strong[b].vx, strong[b].vy));
      if (cos < -0.5) {
        issues.push({
          severity: "aviso",
          code: "luz_inconsistente",
          frame: strong[b].frame,
          message: `A luz parece vir de lados opostos nos frames ${strong[a].frame} e ${strong[b].frame}. Mantenha a mesma direção de luz (cima-esquerda) em todos os frames.`,
        });
        return;
      }
    }
  }
}

export function analyze(p: Project, frames: number[], opts: AnalyzeOptions = {}): AnalysisResult {
  const issues: Issue[] = [];
  const moving = movingLayerIds(p);
  for (const id of opts.ignoreLayers ?? []) moving.delete(id);
  if (!moving.size) for (const l of p.layers) if (l.visible && !(opts.ignoreLayers ?? []).includes(l.id)) moving.add(l.id);
  const empty = (id: string) => p.frames.every((f) => !f.cels[id] || f.cels[id].every((v) => !v));
  const ignored = p.layers.filter((l) => l.visible && !moving.has(l.id) && !empty(l.id)).map((l) => l.name);
  const metrics = frames.map((f) => frameMetrics(p, f, frames.length > 1 ? moving : undefined));
  for (const f of frames) issues.push(...analyzeFrame(p, f, { ...opts, figure: frames.length > 1 ? flattenLayers(p, f, moving) : undefined }));
  if (frames.length > 1) checkContrastAndLight(p, frames, moving, issues);
  checkPalette(p, frames, issues, opts.maxColors);
  checkRig(p, frames, issues);
  checkFootSlide(p, frames, issues);
  let principles: PrincipleStatus[] | undefined;
  const travelling = p.rig?.travel?.mode === "andar";           // a raiz atravessa o quadro: não é um loop contínuo por definição
  if (travelling) opts = { ...opts, loop: false };
  if (frames.length > 1) {
    const articulated = [...moving].filter((id) => !empty(id)).length >= 3;
    checkSequence(p, metrics, opts.loop ?? true, issues, opts.tipo ?? "personagem", articulated);
    if ((opts.tipo ?? "personagem") === "personagem") { checkSegmentLengths(p, frames, moving, issues); checkSplitFigure(p, frames, moving, issues); }
    if (frames.length === p.frames.length || frames.length > 2) checkMotion(p, metrics, opts.loop ?? true, issues, opts.tipo ?? "personagem", [...moving].filter((id) => !empty(id)).length >= 3);
  }
  if (frames.length >= 3) principles = evaluatePrinciples(p, frames, metrics, issues, opts, moving, [...moving].filter((id) => !empty(id)).length >= 3);
  return { issues, metrics, principles, ignoredLayers: frames.length > 1 ? ignored : [] };
}

const ICON: Record<Severity, string> = { erro: "ERRO", aviso: "AVISO", info: "info" };

/** Infos que se repetem em vários frames (serrilhado, banding...) viram uma linha só, com a lista de frames. */
function groupRepeats(issues: Issue[]): Issue[] {
  const byCode = new Map<string, Issue[]>();
  for (const i of issues) if (i.severity === "info" && i.frame !== undefined && ["serrilhado", "banding", "cantos_quadrados"].includes(i.code)) byCode.set(i.code, [...(byCode.get(i.code) ?? []), i]);
  const grouped = new Set<Issue>();
  const extra: Issue[] = [];
  for (const [code, list] of byCode) {
    if (list.length < 3) continue;
    list.forEach((i) => grouped.add(i));
    extra.push({ severity: "info", code, message: `[em ${list.length} frames: ${list.map((i) => i.frame).join(", ")}] ${list[0].message}`, points: list[0].points });
  }
  return [...issues.filter((i) => !grouped.has(i)), ...extra];
}

export function formatIssues(issues: Issue[], limit = Infinity): string[] {
  const order: Severity[] = ["erro", "aviso", "info"];
  const sorted = groupRepeats(issues).sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));
  return sorted.slice(0, limit).map((i) => {
    const where = i.frame !== undefined ? `[frame ${i.frame}] ` : "";
    const pts = i.points?.length ? ` Em: ${i.points.map(([x, y]) => `(${x},${y})`).join(" ")}${i.points.length >= MAX_POINTS ? " ..." : ""}` : "";
    return `${ICON[i.severity]} ${where}${i.message}${pts}`;
  });
}

const bb = (b: BBox | null) => (b ? `x${b.x}..${b.x + b.w - 1} y${b.y}..${b.y + b.h - 1} (${b.w}x${b.h})` : "vazia");

/** Relatório completo em texto, para a IA ler. */
export function formatAnalysis(p: Project, r: AnalysisResult, painelCompleto = false): string {
  const lines: string[] = [];
  const first = r.metrics[0];
  if (r.ignoredLayers?.length) lines.push(`Medidas de movimento só das camadas que mudam; ignoradas (estáticas): ${r.ignoredLayers.join(", ")}.`);
  if (first) {
    lines.push(`Medidas do frame ${first.frame}: silhueta ${bb(first.bbox)}, ${first.area} px.`);
    if (r.ignoredLayers?.length) {
      const all = flattenFrame(p, first.frame);
      lines.push(`  caixa de TUDO (com ${r.ignoredLayers.join(", ")}): ${bb(bboxOf(opaqueMask(all), p.width, p.height))} — a "base y" abaixo é só das camadas que se movem.`);
    }
    for (const l of first.layers) lines.push(`  camada "${l.name}": ${bb(l.bbox)}, ${l.area} px`);
    if (r.metrics.length > 1) {
      lines.push("Por frame (área px | caixa LxA | base y):");
      lines.push(
        r.metrics.map((m) => `  ${m.frame}: ${m.area} | ${m.bbox ? `${m.bbox.w}x${m.bbox.h}` : "-"} | ${m.bbox ? m.bbox.y + m.bbox.h - 1 : "-"}`).join("\n"),
      );
    }
  }
  const counts = { erro: 0, aviso: 0, info: 0 };
  for (const i of r.issues) counts[i.severity]++;
  lines.push("", r.issues.length ? `Problemas: ${counts.erro} erro(s), ${counts.aviso} aviso(s), ${counts.info} info.` : "Nenhum problema encontrado nas checagens automáticas.");
  lines.push(...formatIssues(r.issues));
  if (r.principles?.length) {
    const mark = { ok: "✓", atencao: "!", na: "–" } as const;
    const show = painelCompleto ? r.principles : r.principles.filter((q) => q.estado === "atencao");
    const ok = r.principles.filter((q) => q.estado === "ok").length, na = r.principles.filter((q) => q.estado === "na").length;
    lines.push("", painelCompleto ? "Os 12 princípios da animação (✓ aplicado, ! vale melhorar, – não se aplica ou avaliação humana):" : `Princípios da animação: ${ok} ✓ aplicados, ${na} – não se aplicam ou são de avaliação humana${show.length ? `; vale melhorar (${show.length}):` : "; nada a melhorar."} (painel_completo mostra todos)`);
    for (const q of show) lines.push(`  ${mark[q.estado]} ${String(q.n).padStart(2)}. ${q.nome}${q.nota ? ` — ${q.nota}` : ""}`);
  }
  if (r.issues.length) lines.push("", "Os avisos são heurísticas: corrija o que for defeito e ignore o que for intencional.");
  return lines.join("\n");
}

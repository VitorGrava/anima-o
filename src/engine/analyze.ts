/**
 * Checagens automáticas da arte: apontam o erro (com coordenadas) em vez de
 * depender de a IA enxergá-lo. Cobrem defeitos de execução (pixels soltos,
 * furos, serrilhado irregular, assimetria, cores quase iguais) e de animação
 * (volume que pula entre frames, base que muda, salto no fim do loop).
 */
import { hexToRgb, type Project } from "./project.ts";
import { flattenFrame } from "./render.ts";

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

export interface AnalysisResult {
  issues: Issue[];
  metrics: FrameMetrics[];
}

export interface AnalyzeOptions {
  /** Compara a silhueta com o espelho dela (só faça sentido para sprites vistos de frente/trás). */
  symmetric?: boolean;
  /** Inclui a transição último → primeiro frame. */
  loop?: boolean;
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

// ---------- paleta ----------

function checkPalette(p: Project, frames: number[], issues: Issue[]) {
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
  const unused = p.palette.filter((_, i) => !used[i + 1]);
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
  if (near.length) {
    issues.push({ severity: "aviso", code: "cores_parecidas", message: `Cores em uso quase iguais (embolam em sprite pequeno): ${near.join(", ")}. Una ou separe mais.` });
  }
  const inUse = used.slice(1).filter((n) => n > 0).length;
  if (inUse > 16) {
    issues.push({ severity: "info", code: "muitas_cores", message: `${inUse} cores em uso. Em sprite pequeno, 4–16 deixam a arte mais coesa (estilo 16-bit: até 15 + transparente).` });
  }
}

// ---------- métricas e consistência entre frames ----------

export function frameMetrics(p: Project, frame: number): FrameMetrics {
  const flat = flattenFrame(p, frame);
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

function checkSequence(p: Project, metrics: FrameMetrics[], loop: boolean, issues: Issue[]) {
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
    if (Math.abs(change) > 0.2) {
      issues.push({
        severity: "aviso",
        code: "volume_pulou",
        frame: b.frame,
        message: `${tag}: a área da silhueta mudou ${Math.round(change * 100)}% (${a.area}→${b.area} px). Em squash & stretch o volume deve se manter; confira se não é erro de desenho.`,
      });
    }
    if (a.bbox && b.bbox) {
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
      const fa = flattenFrame(p, a.frame);
      const fb = flattenFrame(p, b.frame);
      let d = 0;
      for (let i = 0; i < fa.length; i++) if (fa[i] !== fb[i]) d++;
      if (d > 0 && a.frame !== b.frame) {
        issues.push({
          severity: "info",
          code: "emenda_loop",
          frame: b.frame,
          message: `Emenda do loop: ${d} px diferem entre o último e o primeiro frame. Use view com compare para ver se o salto é suave.`,
        });
      }
    }
  }
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
  if (opts.symmetric) checkSymmetry(flat, p.width, p.height, frame, issues);
  return issues;
}

export function analyze(p: Project, frames: number[], opts: AnalyzeOptions = {}): AnalysisResult {
  const issues: Issue[] = [];
  const metrics = frames.map((f) => frameMetrics(p, f));
  for (const f of frames) issues.push(...analyzeFrame(p, f, opts));
  checkPalette(p, frames, issues);
  if (frames.length > 1) checkSequence(p, metrics, opts.loop ?? true, issues);
  return { issues, metrics };
}

const ICON: Record<Severity, string> = { erro: "ERRO", aviso: "AVISO", info: "info" };

export function formatIssues(issues: Issue[], limit = Infinity): string[] {
  const order: Severity[] = ["erro", "aviso", "info"];
  const sorted = [...issues].sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));
  return sorted.slice(0, limit).map((i) => {
    const where = i.frame !== undefined ? `[frame ${i.frame}] ` : "";
    const pts = i.points?.length ? ` Em: ${i.points.map(([x, y]) => `(${x},${y})`).join(" ")}${i.points.length >= MAX_POINTS ? " ..." : ""}` : "";
    return `${ICON[i.severity]} ${where}${i.message}${pts}`;
  });
}

const bb = (b: BBox | null) => (b ? `x${b.x}..${b.x + b.w - 1} y${b.y}..${b.y + b.h - 1} (${b.w}x${b.h})` : "vazia");

/** Relatório completo em texto, para a IA ler. */
export function formatAnalysis(p: Project, r: AnalysisResult): string {
  const lines: string[] = [];
  const first = r.metrics[0];
  if (first) {
    lines.push(`Medidas do frame ${first.frame}: silhueta ${bb(first.bbox)}, ${first.area} px.`);
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
  if (r.issues.length) lines.push("", "Os avisos são heurísticas: corrija o que for defeito e ignore o que for intencional.");
  return lines.join("\n");
}

/**
 * Avaliação de beleza ("avaliar"): olha a arte como um diretor de arte, não só como linter.
 * Quatro categorias com nota 0–100 e achados acionáveis (cada um diz qual comando conserta):
 *  - paradigmas: regras da pixel art (pixel solto, serrilhado, banding, contorno, luz, quinas...)
 *  - cor: harmonia (matiz variado, sombra com mudança de matiz, contraste, preto puro, arte chapada)
 *  - forma: silhueta orgânica (quinas quadradas, contorno completo)
 *  - composição: enquadramento (cortado nas bordas, fora do centro, pequeno demais)
 */
import { analyzeFrame, type Issue } from "./analyze.ts";
import { hexToRgb, type Project } from "./project.ts";
import { rgbToHsl } from "./reference.ts";
import { flattenFrame } from "./render.ts";

export type Category = "paradigmas" | "cor" | "forma" | "composicao";
export interface Finding { category: Category; severity: "erro" | "aviso" | "info"; code: string; message: string; fix: string; frames: number[] }
export interface Critique { score: number; scores: Record<Category, number>; findings: Finding[]; frames: number }

const WEIGHT = { erro: 30, aviso: 18, info: 6 } as const;
const CAT_WEIGHT: Record<Category, number> = { paradigmas: 0.3, cor: 0.3, forma: 0.2, composicao: 0.2 };
export const BG_LAYER = /fundo|background|cen[aá]rio|ch[aã]o|sombra-?no-?ch/i;

/** Mapeia os códigos do `check` de arte para categoria + conserto. */
const FROM_CHECK: Record<string, { category: Category; fix: string }> = {
  pixel_solto: { category: "paradigmas", fix: "apague ou ligue o pixel a um agrupamento (draw_rows com \".\" ou draw_shapes pixels)" },
  fragmento: { category: "paradigmas", fix: "ligue o pedaço solto ao corpo ou apague" },
  furo: { category: "paradigmas", fix: "preencha o furo com a cor vizinha ou feche o contorno" },
  serrilhado: { category: "paradigmas", fix: "regularize os degraus das bordas (3-2-1, não 2-1-2)" },
  banding: { category: "paradigmas", fix: "junte as faixas de 1 px em 1–2 blocos grandes de luz/sombra (retoque à mão; em sprite pequeno, `transform op shade` já usa só 1 px de rebordo)" },
  pillow_shading: { category: "paradigmas", fix: "faça a luz vir de UM lado (cima-esquerda): transform op shade" },
  ruido: { category: "paradigmas", fix: "limpe os pixels soltos dentro das áreas: use blocos de cor, não granulado" },
  contorno_claro: { category: "paradigmas", fix: "contorno mais escuro que o preenchimento: transform op outline mode seletivo" },
  luz_inconsistente: { category: "paradigmas", fix: "uma só fonte de luz em todas as partes: transform op shade" },
  cores_parecidas: { category: "cor", fix: "una ou separe tons quase iguais (set_palette / transform replace_color)" },
  contraste_fraco: { category: "cor", fix: "aumente a diferença de valor entre figura e fundo / luz e sombra" },
  cantos_quadrados: { category: "forma", fix: "arredonde as quinas em degraus 1-2-3 (reference circulos)" },
};

const lumOf = (hex: string) => { const [r, g, b] = hexToRgb(hex); return 0.3 * r + 0.59 * g + 0.11 * b; };

function frameFindings(p: Project, f: number): Omit<Finding, "frames">[] {
  const out: Omit<Finding, "frames">[] = [];
  const add = (category: Category, severity: Finding["severity"], code: string, message: string, fix: string) => out.push({ category, severity, code, message, fix });
  const W = p.width, H = p.height;
  // figura = camadas que não são fundo/chão
  const figure = new Uint8Array(W * H);
  for (const l of p.layers) {
    if (!l.visible || BG_LAYER.test(l.name)) continue;
    const cel = p.frames[f].cels[l.id];
    if (cel) for (let i = 0; i < cel.length; i++) if (cel[i]) figure[i] = cel[i];
  }
  const flatAll = flattenFrame(p, f);
  const area = figure.reduce((n, v) => n + (v ? 1 : 0), 0);
  if (!area) return out;

  // ---- paradigmas / forma / parte da cor: reaproveita o check ----
  for (const i of analyzeFrame(p, f, { figure }) as Issue[]) {
    const m = FROM_CHECK[i.code];
    if (m) add(m.category, i.severity, i.code, i.message.replace(/\s+/g, " "), m.fix);
  }

  // ---- cor ----
  const count = new Map<number, number>();
  for (const v of figure) if (v) count.set(v, (count.get(v) ?? 0) + 1);
  const info = [...count].map(([idx, n]) => {
    const hex = p.palette[idx - 1].hex;
    const [r, g, b] = hexToRgb(hex);
    const [h, s, l] = rgbToHsl(r, g, b);
    return { idx, n, share: n / area, hex, h, s, l, lum: lumOf(hex) };
  });
  const big = info.filter((c) => c.share >= 0.04);
  if (info.some((c) => c.share >= 0.02 && (c.lum < 12 || c.lum > 253))) {
    add("cor", "aviso", "preto_puro", "Há preto/branco puro em área grande. O preto puro endurece a arte e o branco puro estoura; contornos e sombras ficam melhores em um tom escuro colorido.", "troque o preto por um tom escuro do material (reference rampa) ou rode `polish`");
  }
  const colored = big.filter((c) => c.s >= 0.18 && c.l > 0.12 && c.l < 0.95);
  const families = new Set(colored.map((c) => Math.round(c.h / 40) % 9));
  if (colored.length >= 4 && families.size === 1) {
    add("cor", "info", "matiz_monotono", `Todas as ${colored.length} cores grandes têm quase o mesmo matiz: a figura fica "toda da mesma cor". Dê a cada material um matiz próprio (pele, roupa, cabelo, objeto) e mantenha a harmonia pela saturação e pelo valor.`, "set_palette com um matiz diferente por material (reference paletas)");
  }
  // tons do mesmo material: a sombra deve mudar de matiz, não só escurecer
  const pairs: number[] = [];
  for (const a of big) for (const b of big) {
    if (a.lum + 25 > b.lum) continue;                                   // a = escuro, b = claro
    const dh = Math.abs(((a.h - b.h + 540) % 360) - 180);
    const same = Math.abs(a.h - b.h) < 35 || Math.abs(a.h - b.h) > 325;
    if (same && a.s >= 0.12 && b.s >= 0.12 && Math.abs(a.s - b.s) < 0.5) pairs.push(Math.min(Math.abs(a.h - b.h), 360 - Math.abs(a.h - b.h)) + 0 * dh);
  }
  if (pairs.length >= 2 && pairs.every((d) => d < 3)) {
    add("cor", "info", "sombra_sem_matiz", "As sombras só escurecem a cor base (mesmo matiz). Sombras que esfriam (rumo ao azul/roxo) e luzes que esquentam dão vida e harmonia.", "transform op shade cria a rampa com mudança de matiz");
  }
  const lums = big.map((c) => c.lum);
  if (lums.length >= 3 && Math.max(...lums) - Math.min(...lums) < 80) {
    add("cor", "aviso", "contraste_baixo", "Os valores (claro/escuro) das cores grandes estão muito próximos: a arte fica lavada e a silhueta se perde em tamanho pequeno.", "escureça as sombras/contorno e clareie as luzes; confira com view check=\"cinza\"");
  }
  // arte chapada: região grande sem um tom companheiro (rebordo menor, do mesmo matiz, encostado nela)
  const adj = new Map<string, number>();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = figure[y * W + x];
    if (!v) continue;
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const xx = x + dx, yy = y + dy;
      const o = xx < W && yy < H ? figure[yy * W + xx] : 0;
      if (o && o !== v) { const k = v < o ? `${v}:${o}` : `${o}:${v}`; adj.set(k, (adj.get(k) ?? 0) + 1); }
    }
  }
  const hueD = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
  const lit = big.filter((c) => c.lum >= 70);
  const flat = lit.filter((c) => !info.some((o) => o !== c && o.share >= 0.006 && o.share <= 0.5 * c.share && hueD(o.h, c.h) < 18 && Math.abs(o.lum - c.lum) >= 8 && Math.abs(o.lum - c.lum) <= 45 && (adj.get(c.idx < o.idx ? `${c.idx}:${o.idx}` : `${o.idx}:${c.idx}`) ?? 0) >= 3));
  if (area >= 150 && lit.length >= 2 && flat.length >= Math.ceil(lit.length / 2)) {
    add("cor", "aviso", "arte_chapada", `${flat.length} de ${lit.length} região(ões) grande(s) está(ão) chapada(s): uma cor só, sem luz nem sombra, o que lê como "adesivo" e não como volume.`, "transform op shade (ou `polish`): 3 tons com mudança de matiz");
  }

  // ---- forma: contorno completo ----
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < W && y < H ? figure[y * W + x] : 0);
  let edge = 0, dark = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = figure[y * W + x];
    if (!v) continue;
    if (at(x - 1, y) && at(x + 1, y) && at(x, y - 1) && at(x, y + 1)) continue;
    edge++;
    const me = lumOf(p.palette[v - 1].hex);
    const inner = Math.max(0, ...[[-1, 0], [1, 0], [0, -1], [0, 1]].map(([dx, dy]) => { const o = at(x + dx, y + dy); return o ? lumOf(p.palette[o - 1].hex) : 0; }));
    if (me < 95 || (inner > 0 && me < 0.8 * inner)) dark++;
  }
  if (edge >= 20 && dark / edge < 0.1) {
    add("forma", "info", "sem_contorno", "A figura não tem contorno escuro. É um estilo válido, mas em sprite pequeno o contorno separa a figura do fundo e das partes; sem ele a silhueta se perde em fundos variados.", "transform op outline mode seletivo (ou `polish`)");
  }
  if (edge >= 20 && dark / edge >= 0.1 && dark / edge < 0.85 && dark / edge > 0.35) {
    add("forma", "aviso", "contorno_incompleto", `Só ${Math.round((dark / edge) * 100)}% da borda tem contorno escuro: o contorno aparece em alguns trechos e some em outros, o que parece falha, não estilo.`, "feche o contorno: transform op outline mode seletivo (ou `polish`)");
  }

  // ---- composição ----
  let x0 = W, x1 = -1, y0 = H, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (figure[y * W + x]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const touching = [x0 === 0 ? "esquerda" : "", x1 === W - 1 ? "direita" : "", y0 === 0 ? "topo" : "", y1 === H - 1 ? "base" : ""].filter(Boolean);
  if (touching.length && flatAll.some((v) => !v)) {
    add("composicao", "aviso", "cortado_nas_bordas", `A figura encosta/sai do quadro (${touching.join(", ")}): pode estar cortada. Deixe 1–2 px de respiro.`, "transform op center, ou aumente o canvas (set_canvas)");
  }
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  if (!touching.length && Math.max(bw / W, bh / H) < 0.5) {
    add("composicao", "info", "figura_pequena", `A figura ocupa só ${Math.round(Math.max(bw / W, bh / H) * 100)}% do quadro: sobra resolução sem uso. Reduza o canvas ou desenhe maior.`, "set_canvas menor ou redesenhe maior");
  }
  return out;
}

/** Caixa que contém a figura (camadas que não são fundo) em todos os frames dados. */
export function unionBox(p: Project, frames: number[]): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = p.width, x1 = -1, y0 = p.height, y1 = -1;
  for (const f of frames) for (const l of p.layers) {
    if (!l.visible || BG_LAYER.test(l.name)) continue;
    const cel = p.frames[f]?.cels[l.id];
    if (!cel) continue;
    for (let i = 0; i < cel.length; i++) if (cel[i]) { const x = i % p.width, y = (i - x) / p.width; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/** Avalia a arte em todos os frames dados; achados iguais entre frames viram um só, com a lista de frames. */
export function evaluateBeauty(p: Project, frames: number[] = p.frames.map((_, i) => i)): Critique {
  const merged = new Map<string, Finding>();
  for (const f of frames) {
    for (const x of frameFindings(p, f)) {
      const hit = merged.get(x.code);
      if (hit) hit.frames.push(f);
      else merged.set(x.code, { ...x, frames: [f] });
    }
  }
  // enquadramento do conjunto: a união das caixas de todos os frames deve estar perto do centro do quadro
  const box = unionBox(p, frames);
  if (box && frames.length) {
    const dx = (box.x0 + box.x1 + 1) / 2 - p.width / 2, dy = (box.y0 + box.y1 + 1) / 2 - p.height / 2;
    if (Math.abs(dx) > 0.16 * p.width || Math.abs(dy) > 0.16 * p.height) {
      merged.set("fora_do_centro", { category: "composicao", severity: "info", code: "fora_do_centro", frames: [...frames], message: `A figura está deslocada do centro do quadro (${Math.round(dx)} px em x, ${Math.round(dy)} px em y). Uma composição centrada (ou propositalmente descentrada, com respiro) lê melhor.`, fix: "polish centralizar=true (ou transform op center)" });
    }
  }
  const findings = [...merged.values()];
  const order = { erro: 0, aviso: 1, info: 2 } as const;
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  const scores = { paradigmas: 100, cor: 100, forma: 100, composicao: 100 } as Record<Category, number>;
  for (const f of findings) scores[f.category] = Math.max(0, scores[f.category] - WEIGHT[f.severity]);
  const score = Math.round((Object.keys(scores) as Category[]).reduce((s, c) => s + scores[c] * CAT_WEIGHT[c], 0));
  return { score, scores, findings, frames: frames.length };
}

const NAMES: Record<Category, string> = { paradigmas: "Paradigmas da pixel art", cor: "Cor e harmonia", forma: "Forma e contorno", composicao: "Composição" };
const grade = (s: number) => (s >= 90 ? "excelente" : s >= 75 ? "boa" : s >= 55 ? "mediana" : "fraca");

export function formatCritique(c: Critique): string {
  const lines = [`Avaliação de beleza: ${c.score}/100 (${grade(c.score)}) em ${c.frames} frame(s).`];
  for (const cat of Object.keys(NAMES) as Category[]) {
    lines.push(`\n${NAMES[cat]}: ${c.scores[cat]}/100`);
    const fs = c.findings.filter((f) => f.category === cat);
    if (!fs.length) lines.push("  ✓ sem achados");
    for (const f of fs) {
      const where = c.frames > 1 && f.frames.length < c.frames ? ` [frames ${f.frames.length > 6 ? `${f.frames.slice(0, 6).join(",")}…` : f.frames.join(",")}]` : "";
      lines.push(`  ${f.severity === "erro" ? "ERRO" : f.severity === "aviso" ? "!" : "·"} ${f.code}${where}: ${f.message}`);
      lines.push(`      → ${f.fix}`);
    }
  }
  lines.push("\nÉ uma avaliação heurística: use como um segundo par de olhos, não como lei. Para consertar o mecânico de uma vez: `polish`.");
  return lines.join("\n");
}

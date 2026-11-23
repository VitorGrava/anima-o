/**
 * A API de comandos da engine.
 *
 * Tudo que a IA (ou um script, ou a UI) faz passa por aqui: cada comando tem
 * nome, descrição, um schema Zod (convertido para JSON Schema e entregue ao
 * Claude como "tool") e uma função que aplica o comando ao projeto.
 */
import { z } from "zod";
import { analyze, analyzeFrame, formatAnalysis, formatIssues } from "./analyze.ts";
import { celToRows, cropRows, drawRows, frameToRows, joinBlocks, withRuler } from "./ascii.ts";
import * as draw from "./draw.ts";
import { autoShade, autoShadeVolume, cleanCorners, detailColors, selectiveOutline } from "./polish.ts";
import { drawBox3d, drawCurve, drawForest, drawGradient, drawTerrain, fillPolygon, scatter } from "./paint.ts";
import { BG_LAYER, evaluateBeauty, formatCritique, unionBox } from "./critique.ts";
import { REFERENCE_TOPICS, bodyProportions, darkOutline, makeRamp, reference } from "./reference.ts";
import { HUMANOID_BONES, quadrupedBones, walkPoses, boneSegments, capsuleArt, clampAngles, humanoidAngles, humanoidBones, groundedRoot, ellipseArt, renderRigFrame } from "./skeleton.ts";
import { DEFAULT_POSE, FIGURE_LAYERS, PRESETS as POSE_PRESETS, WALK_CYCLE, clampPose, lerpPose, renderFigure, swapSides, type Pose, type Ramp } from "./rig.ts";
import { flattenFrame, type CheckMode } from "./render.ts";
import { autoScale, clampRegion, diffRows, type ImageRequest } from "./view.ts";
import {
  KEY_CHARS,
  KEY_CHARS_BASIC,
  MAX_COLORS,
  MAX_FRAMES,
  MAX_LAYERS,
  TRANSPARENT_KEY,
  clampSize,
  cloneProject,
  colorIndex,
  findLayer,
  getCel,
  hexToRgb,
  newId,
  normalizeHex,
  type Bone,
  type Project,
  type RigPart,
} from "./project.ts";

export type ExportFormat = "gif" | "spritesheet_png" | "json";

export interface CommandResult {
  /** Texto devolvido à IA. */
  text: string;
  /** O projeto mudou? (a UI só redesenha nesse caso) */
  changed: boolean;
  /** Pedido de imagens de pré-visualização para a IA ver o resultado. */
  images?: ImageRequest;
  /** Efeito colateral para o cliente (ex. baixar um arquivo). */
  effect?: { type: "export"; format: ExportFormat; scale: number; columns?: number; filename: string };
}

export interface CommandDef<S extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  schema: S;
  run(p: Project, input: z.infer<S>): CommandResult;
}

function def<S extends z.ZodType>(d: CommandDef<S>): CommandDef<S> {
  return d;
}

// ---------- seletores compartilhados ----------

const framesSel = z
  .union([
    z.number().int().min(0),
    z.array(z.number().int().min(0)).max(MAX_FRAMES),
    z.literal("all"),
    z.object({ from: z.number().int().min(0), to: z.number().int().min(0) }),
  ])
  .describe('Frames alvo: um índice (0 = primeiro), lista de índices, "all", ou intervalo {from, to} inclusivo.');

type FramesSel = z.infer<typeof framesSel>;

function resolveFrames(p: Project, sel: FramesSel | undefined): number[] {
  if (sel === undefined) return [0];
  let list: number[];
  if (sel === "all") list = p.frames.map((_, i) => i);
  else if (typeof sel === "number") list = [sel];
  else if (Array.isArray(sel)) list = sel;
  else {
    list = [];
    for (let i = sel.from; i <= sel.to; i++) list.push(i);
  }
  for (const i of list) {
    if (i >= p.frames.length) {
      throw new Error(`Frame ${i} não existe (há ${p.frames.length} frames, índices 0..${p.frames.length - 1}).`);
    }
  }
  return [...new Set(list)];
}

const layerSel = z
  .string()
  .optional()
  .describe("Nome ou id da camada. Se omitido, usa a camada de cima.");

const colorRef = z
  .string()
  .min(1)
  .describe('Cor: a chave (1 caractere), o nome da cor na paleta, ou "." para transparente (borracha).');

const fmtList = (xs: number[]) => (xs.length > 6 ? `${xs.length} frames` : `frame${xs.length > 1 ? "s" : ""} ${xs.join(", ")}`);

const previewFlag = z
  .boolean()
  .default(true)
  .describe("Devolve o frame editado (grade de texto + imagem) e avisos de problemas junto com a resposta. Deixe ligado: é assim que você enxerga o que desenhou.");

/** Linhas de largura diferente das demais (erro de contagem de colunas é a falha mais comum ao desenhar por texto). */
function widthWarning(rows: string[], label = ""): string {
  if (rows.length < 2) return "";
  const lens = rows.map((r) => [...r].length);
  const freq = new Map<number, number>();
  for (const l of lens) freq.set(l, (freq.get(l) ?? 0) + 1);
  const modal = [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const off = lens.map((l, k) => ({ l, k })).filter((q) => q.l !== modal);
  if (!off.length) return "";
  return `\nATENÇÃO${label}: ${off.length} linha(s) com largura diferente das outras (a maioria tem ${modal}): ${off.slice(0, 6).map((q) => `linha ${q.k} tem ${q.l}`).join(", ")}. Confira a contagem de colunas.`;
}

/** Canvas grande demais para despejar a grade inteira em texto. */
const MAX_PREVIEW_TEXT = 64;

/**
 * Feedback automático dos comandos de desenho: devolve o frame editado como grade
 * de texto com régua, a imagem e os avisos das checagens rápidas, sem a IA precisar
 * lembrar de chamar `view`.
 */
/** projeto ANTES do comando em execução (para mostrar só o trecho que mudou); definido por runCommand */
let BEFORE: Project | null = null;

function changedBox(a: Project, b: Project, f: number): { x0: number; y0: number; x1: number; y1: number } | null {
  if (!a.frames[f] || a.width !== b.width || a.height !== b.height) return null;
  const fa = flattenFrame(a, f), fb = flattenFrame(b, f);
  let x0 = b.width, y0 = b.height, x1 = -1, y1 = -1;
  for (let k = 0; k < fa.length; k++) if (fa[k] !== fb[k]) { const x = k % b.width, y = (k - x) / b.width; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

function withPreview(p: Project, summary: string, frames: number[], layer?: string): CommandResult {
  const shown = frames.slice(0, 1);
  const f = shown[0];
  const parts = [summary];
  if (frames.length > 1) parts.push(`Prévia só do frame ${f} (editou ${frames.length}); use view para os outros.`);
  const rows = layer ? celToRows(p, getCel(p, f, findLayer(p, layer).id)) : frameToRows(p, f);
  if (p.width <= MAX_PREVIEW_TEXT && p.height <= MAX_PREVIEW_TEXT) {
    // texto SÓ do trecho alterado (a imagem já mostra o conjunto): a grade inteira só no primeiro desenho do frame ou em mudança grande
    const box = BEFORE ? changedBox(BEFORE, p, f) : null;
    if (box && (box.x1 - box.x0 + 1) * (box.y1 - box.y0 + 1) < 0.4 * p.width * p.height && p.width * p.height > 256) {
      const r = clampRegion(p, { x: Math.max(0, box.x0 - 1), y: Math.max(0, box.y0 - 1), w: box.x1 - box.x0 + 3, h: box.y1 - box.y0 + 3 });
      parts.push(`Trecho alterado do frame ${f} (x${r.x}..${r.x + r.w - 1}, y${r.y}..${r.y + r.h - 1}):\n${withRuler(cropRows(rows, r), r.x, r.y)}`);
    } else parts.push(`Frame ${f} agora:\n${withRuler(rows)}`);
  }
  const issues = analyzeFrame(p, f).filter((i) => i.severity !== "info");
  if (issues.length) parts.push(`Checagem automática do frame ${f}:\n${formatIssues(issues, 4).join("\n")}`);
  return {
    changed: true,
    text: parts.join("\n\n"),
    images: { frames: shown, scale: autoScale(p, undefined, "previa"), highlight: issues.flatMap((i) => i.points ?? []) },
  };
}

function result(p: Project, summary: string, frames: number[], preview: boolean, layer?: string): CommandResult {
  return preview ? withPreview(p, summary, frames, layer) : { changed: true, text: summary };
}

// ---------- comandos ----------

const setCanvas = def({
  name: "set_canvas",
  description:
    "Define nome, tamanho (em pixels) e velocidade (fps) da animação. Redimensionar recorta/expande a partir do canto superior esquerdo. Tamanhos típicos de pixel art: 16x16, 32x32, 48x48, 64x64.",
  schema: z.object({
    name: z.string().max(80).optional(),
    width: z.number().int().min(1).max(512).optional(),
    height: z.number().int().min(1).max(512).optional(),
    fps: z.number().min(1).max(60).optional(),
  }),
  run(p, i) {
    if (i.name !== undefined) p.name = i.name;
    if (i.fps !== undefined) p.fps = i.fps;
    const w = clampSize(i.width ?? p.width);
    const h = clampSize(i.height ?? p.height);
    if (w !== p.width || h !== p.height) {
      for (const f of p.frames) {
        for (const [id, cel] of Object.entries(f.cels)) {
          const out = new Uint8Array(w * h);
          for (let y = 0; y < Math.min(h, p.height); y++) {
            for (let x = 0; x < Math.min(w, p.width); x++) out[y * w + x] = cel[y * p.width + x];
          }
          f.cels[id] = out;
        }
      }
      p.width = w;
      p.height = h;
    }
    return { changed: true, text: `Canvas: "${p.name}" ${p.width}x${p.height} @ ${p.fps} fps.` };
  },
});

const PRESETS_PALETA: Record<"pico8" | "sweetie16" | "gameboy", [string, string][]> = {
  pico8: [["#000000", "preto"], ["#1d2b53", "azul-escuro"], ["#7e2553", "roxo-escuro"], ["#008751", "verde-escuro"], ["#ab5236", "marrom"], ["#5f574f", "cinza-escuro"], ["#c2c3c7", "cinza-claro"], ["#fff1e8", "branco"], ["#ff004d", "vermelho"], ["#ffa300", "laranja"], ["#ffec27", "amarelo"], ["#00e436", "verde"], ["#29adff", "azul"], ["#83769c", "lavanda"], ["#ff77a8", "rosa"], ["#ffccaa", "pele"]],
  sweetie16: [["#1a1c2c", "noite"], ["#5d275d", "uva"], ["#b13e53", "carmim"], ["#ef7d57", "laranja"], ["#ffcd75", "ouro"], ["#a7f070", "limao"], ["#38b764", "verde"], ["#257179", "petroleo"], ["#29366f", "marinho"], ["#3b5dc9", "azul"], ["#41a6f6", "ceu"], ["#73eff7", "ciano"], ["#f4f4f4", "branco"], ["#94b0c2", "cinza-azul"], ["#566c86", "ardosia"], ["#333c57", "grafite"]],
  gameboy: [["#0f380f", "gb-escuro"], ["#306230", "gb-medio-escuro"], ["#8bac0f", "gb-medio-claro"], ["#9bbc0f", "gb-claro"]],
};

const setPalette = def({
  name: "set_palette",
  description:
    'Adiciona ou altera cores da paleta. Se a chave já existe, a cor é substituída — isso recolore instantaneamente todos os pixels daquela cor em todos os frames (ótimo para "deixa o chapéu vermelho"). O TAMANHO da paleta segue o estilo pedido: retrô (NES, Game Boy, 16-bit) usa 4–16 cores; pixel art detalhado usa dezenas. Coesa em qualquer caso: um tom escuro de contorno, sombras e luzes por material.',
  schema: z.object({
    preset: z.enum(["pico8", "sweetie16", "gameboy"]).optional().describe("Paleta pronta (cria as cores com chaves e nomes; pode combinar com `colors`): pico8 (16), sweetie16 (16), gameboy (4). Poupa mandar hex um a um."),
    colors: z
      .array(
        z.object({
          key: z
            .string()
            .length(1)
            .describe(`1 caractere único usado no desenho por texto. Permitidos: ${KEY_CHARS_BASIC} (e letras acentuadas/gregas para paletas grandes)`),
          hex: z.string().describe("Cor #rrggbb"),
          name: z.string().max(40).describe('Nome curto e descritivo, ex. "pele-sombra"'),
        }),
      )
      .max(64)
      .default([]),
  }),
  run(p, i) {
    const added: string[] = [];
    const updated: string[] = [];
    const free = [...KEY_CHARS].filter((k) => k !== TRANSPARENT_KEY && !p.palette.some((x) => x.key === k) && !i.colors.some((c) => c.key === k));
    const presetColors = i.preset ? PRESETS_PALETA[i.preset].map(([hex, name], k) => ({ key: free[k], hex, name })) : [];
    if (!i.preset && !i.colors.length) throw new Error("Mande `colors` (lista) ou `preset` (pico8, sweetie16, gameboy).");
    for (const c of [...presetColors, ...i.colors]) {
      if (c.key === TRANSPARENT_KEY || c.key === " " || !KEY_CHARS.includes(c.key)) {
        throw new Error(`Chave "${c.key}" inválida. Use um destes caracteres: ${KEY_CHARS_BASIC} (ou letras acentuadas/gregas)`);
      }
      const hex = normalizeHex(c.hex);
      const existing = p.palette.find((x) => x.key === c.key);
      if (existing) {
        existing.hex = hex;
        existing.name = c.name;
        updated.push(c.key);
      } else {
        if (p.palette.length >= MAX_COLORS) throw new Error(`Paleta cheia (máx. ${MAX_COLORS}).`);
        p.palette.push({ key: c.key, hex, name: c.name });
        added.push(c.key);
      }
    }
    return {
      changed: true,
      text: `Paleta: ${added.length} adicionada(s) [${added.join("")}], ${updated.length} alterada(s) [${updated.join("")}]. Total ${p.palette.length} cores.`,
    };
  },
});

const removeColors = def({
  name: "remove_colors",
  description: "Remove cores da paleta. Pixels dessas cores ficam transparentes (ou recebem `replace_with`).",
  schema: z.object({
    keys: z.array(z.string().length(1)).min(1),
    replace_with: colorRef.optional(),
  }),
  run(p, i) {
    const removeIdx = new Set(i.keys.map((k) => colorIndex(p, k)));
    const replacement = i.replace_with !== undefined ? colorIndex(p, i.replace_with) : 0;
    if (removeIdx.has(replacement)) throw new Error("replace_with não pode ser uma das cores removidas.");
    const remap = new Uint8Array(p.palette.length + 1);
    const kept: Project["palette"] = [];
    p.palette.forEach((c, j) => {
      if (!removeIdx.has(j + 1)) {
        kept.push(c);
        remap[j + 1] = kept.length;
      }
    });
    const repl = replacement ? remap[replacement] : 0;
    for (const f of p.frames) {
      for (const cel of Object.values(f.cels)) {
        for (let k = 0; k < cel.length; k++) {
          const v = cel[k];
          if (v) cel[k] = removeIdx.has(v) ? repl : remap[v];
        }
      }
    }
    p.palette = kept;
    return { changed: true, text: `Removidas ${removeIdx.size} cor(es). Paleta agora tem ${kept.length}.` };
  },
});

const addLayer = def({
  name: "add_layer",
  description:
    "Cria uma camada (ex. corpo, olhos, arma, efeitos). Camadas separam partes que se movem independentemente — facilita animar.",
  schema: z.object({
    name: z.string().min(1).max(40),
    position: z.enum(["top", "bottom"]).optional().describe("Padrão: top (desenhada por cima)"),
  }),
  run(p, i) {
    if (p.layers.length >= MAX_LAYERS) throw new Error(`Máximo de ${MAX_LAYERS} camadas.`);
    if (p.layers.some((l) => l.name.toLowerCase() === i.name.toLowerCase())) {
      throw new Error(`Já existe uma camada "${i.name}".`);
    }
    const layer = { id: newId("L"), name: i.name, visible: true };
    if (i.position === "bottom") p.layers.unshift(layer);
    else p.layers.push(layer);
    for (const f of p.frames) f.cels[layer.id] = new Uint8Array(p.width * p.height);
    return { changed: true, text: `Camada "${i.name}" criada. Ordem (baixo→cima): ${p.layers.map((l) => l.name).join(", ")}.` };
  },
});

const updateLayer = def({
  name: "update_layer",
  description: "Renomeia, mostra/esconde, reordena ou apaga uma camada.",
  schema: z.object({
    layer: z.string().describe("Nome ou id da camada"),
    rename: z.string().min(1).max(40).optional(),
    name: z.string().min(1).max(40).optional().describe("apelido de rename (igual ao add_layer)"),
    visible: z.boolean().optional(),
    move: z.enum(["up", "down", "top", "bottom"]).optional(),
    delete: z.boolean().optional(),
  }),
  run(p, i) {
    const layer = findLayer(p, i.layer);
    if (i.delete) {
      if (p.layers.length === 1) throw new Error("Não é possível apagar a única camada.");
      p.layers = p.layers.filter((l) => l !== layer);
      for (const f of p.frames) delete f.cels[layer.id];
      return { changed: true, text: `Camada "${layer.name}" apagada.` };
    }
    if (i.rename ?? i.name) layer.name = (i.rename ?? i.name)!;
    if (i.visible !== undefined) layer.visible = i.visible;
    if (i.move) {
      const idx = p.layers.indexOf(layer);
      p.layers.splice(idx, 1);
      const to =
        i.move === "top" ? p.layers.length : i.move === "bottom" ? 0 : i.move === "up" ? Math.min(idx + 1, p.layers.length) : Math.max(idx - 1, 0);
      p.layers.splice(to, 0, layer);
    }
    return { changed: true, text: `Camadas (baixo→cima): ${p.layers.map((l) => `${l.name}${l.visible ? "" : " (oculta)"}`).join(", ")}.` };
  },
});

const addFrames = def({
  name: "add_frames",
  description:
    "Insere frames na timeline. Com `copy_from`, os novos frames começam como cópia daquele frame (o jeito normal de animar: copie e depois altere só o que muda). ORDEM: desenhe o que é igual em todos os frames (fundo, chão, corpo base) no frame 0 ANTES de add_frames com copy_from, ou depois use frames:\"all\" para desenhar em todos.",
  schema: z.object({
    count: z.number().int().min(1).max(64).default(1),
    copy_from: z.number().int().min(0).optional().describe("Índice do frame a copiar. Omitido = frames vazios."),
    at: z.number().int().min(0).optional().describe("Posição de inserção. Padrão: no fim."),
  }),
  run(p, i) {
    if (p.frames.length + i.count > MAX_FRAMES) throw new Error(`Máximo de ${MAX_FRAMES} frames.`);
    const src = i.copy_from !== undefined ? p.frames[i.copy_from] : undefined;
    if (i.copy_from !== undefined && !src) throw new Error(`Frame ${i.copy_from} não existe.`);
    const at = Math.min(i.at ?? p.frames.length, p.frames.length);
    const fresh = Array.from({ length: i.count }, () => ({
      id: newId("F"),
      duration: src?.duration,
      pose: src?.pose ? structuredClone(src.pose) : undefined,
      cels: Object.fromEntries(
        p.layers.map((l) => [l.id, src?.cels[l.id] ? new Uint8Array(src.cels[l.id]) : new Uint8Array(p.width * p.height)]),
      ),
    }));
    p.frames.splice(at, 0, ...fresh);
    return { changed: true, text: `${i.count} frame(s) inserido(s) em ${at}. Total: ${p.frames.length} frames (0..${p.frames.length - 1}).` };
  },
});

const deleteFrames = def({
  name: "delete_frames",
  description: "Apaga frames da timeline. A duração de cada frame (set_frame_timing) acompanha o frame: os que ficam mantêm a sua.",
  schema: z.object({ frames: framesSel }),
  run(p, i) {
    const del = new Set(resolveFrames(p, i.frames));
    if (del.size >= p.frames.length) throw new Error("A animação precisa de ao menos 1 frame.");
    p.frames = p.frames.filter((_, j) => !del.has(j));
    return { changed: true, text: `${del.size} frame(s) apagado(s). Restam ${p.frames.length}.` };
  },
});

const moveFrame = def({
  name: "move_frame",
  description: "Move um frame para outra posição da timeline.",
  schema: z.object({ from: z.number().int().min(0), to: z.number().int().min(0) }),
  run(p, i) {
    const [f] = p.frames.splice(resolveFrames(p, i.from)[0], 1);
    p.frames.splice(Math.min(i.to, p.frames.length), 0, f);
    return { changed: true, text: `Frame ${i.from} movido para ${Math.min(i.to, p.frames.length - 1)}.` };
  },
});

const setTiming = def({
  name: "set_frame_timing",
  description: 'Define quanto tempo (ms) cada frame fica na tela. Use para segurar poses (antecipação, impacto) ou acelerar trechos. Um número vale para todos os frames escolhidos; uma LISTA dá uma duração por frame. Ex.: {"frames": "all", "duration_ms": [120, 90, 100, 60]}.',
  schema: z.object({
    frames: framesSel.optional().describe('Padrão: "all"'),
    duration_ms: z
      .union([z.number().int().min(10).max(10000), z.null(), z.array(z.number().int().min(10).max(10000)).min(1)])
      .describe("Um número (todos os frames escolhidos), null (volta ao fps global) ou uma LISTA com uma duração por frame, na mesma ordem de `frames`. Ex.: frames \"all\" e [120, 90, 100, 90]."),
  }),
  run(p, i) {
    const list = resolveFrames(p, i.frames ?? "all");
    if (Array.isArray(i.duration_ms)) {
      if (i.duration_ms.length !== list.length) throw new Error(`A lista tem ${i.duration_ms.length} duração(ões), mas ${list.length} frame(s) foram escolhidos (${fmtList(list)}). Mande uma duração por frame.`);
      list.forEach((j, k) => { p.frames[j].duration = (i.duration_ms as number[])[k]; });
      return { changed: true, text: `Durações: ${list.map((j, k) => `${j}:${(i.duration_ms as number[])[k]}ms`).join(" ")}.` };
    }
    for (const j of list) p.frames[j].duration = i.duration_ms ?? undefined;
    return { changed: true, text: `Duração de ${fmtList(list)}: ${i.duration_ms ?? `padrão (${Math.round(1000 / p.fps)}ms)`}.` };
  },
});

const drawRowsCmd = def({
  name: "draw_rows",
  description: [
    "Desenha arte pixel a pixel usando texto: cada string é uma linha, cada caractere é um pixel com a chave da cor na paleta.",
    '"." = transparente (apaga), " " (espaço) = não mexe no pixel existente. Para mudar poucos pixels de um frame (ex.: fechar o olho), mande só as linhas necessárias com x, y e espaços onde não quer mexer, ou use draw_shapes type=pixels.',
    "Ideal para sprites detalhados (rostos, personagens, objetos). Todas as linhas devem ter a mesma largura.",
    "Exemplo (coração 7x6 com cor 'r' e contorno '0'):",
    '[".00.00.", "0rr0rr0", "0rrrrr0", ".0rrr0.", "..0r0..", "...0..."]',
  ].join("\n"),
  schema: z.object({
    frames: framesSel.optional().describe("Padrão: frame 0"),
    layer: layerSel,
    x: z.number().int().default(0).describe("Coluna do canto superior esquerdo"),
    y: z.number().int().default(0).describe("Linha do canto superior esquerdo"),
    rows: z.array(z.string().max(512)).min(1).max(512),
    mirror: z
      .enum(["none", "horizontal"])
      .default("none")
      .describe('"horizontal": escreva só a METADE ESQUERDA, incluindo a coluna do meio como última coluna; a engine espelha para a direita (corações, estrelas, rostos, personagens de frente). Largura final = 2×largura − 1.'),
    dot_is_transparent: z
      .boolean()
      .default(true)
      .describe('true: "." apaga o pixel. false: "." também preserva o pixel (útil para sobrepor).'),
    contorno: z
      .enum(["nenhum", "seletivo"])
      .default("nenhum")
      .describe('"seletivo": depois de escrever, cria o contorno de 1 px em volta da arte DESTA camada, na cor escura de cada material vizinho (mais clara no lado da luz). Escreva o corpo SEM contorno e deixe a engine contornar: sai mais limpo que contornar à mão e a silhueta fica uniforme.'),
    preview: previewFlag,
  }),
  run(p, i) {
    const layer = findLayer(p, i.layer);
    const list = resolveFrames(p, i.frames);
    let n = 0;
    const rows = i.mirror === "horizontal" ? i.rows.map((r) => r + [...r].slice(0, -1).reverse().join("")) : i.rows;
    const palAntes = p.palette.length;
    for (const f of list) {
      const cel = getCel(p, f, layer.id);
      n = drawRows(p, cel, rows, i.x, i.y, i.dot_is_transparent);
      if (i.contorno === "seletivo") {
        const occ = new Uint8Array(p.width * p.height);
        for (const l of p.layers) if (l.id !== layer.id && l.visible) { const c = getCel(p, f, l.id); for (let k = 0; k < c.length; k++) if (c[k]) occ[k] = 1; }
        selectiveOutline(cel.slice(), cel, p.width, p.height, (c, lit) => selOutIndex(p, c, lit), paletteLum(p), occ);
      }
    }
    const novas = p.palette.slice(palAntes).map((c) => `${c.key}=${c.name}`);
    return result(p, `${n} pixels escritos em "${layer.name}", ${fmtList(list)}.${widthWarning(rows)}${novas.length ? ` Cores de contorno criadas: ${novas.join(", ")} (use a chave ou o nome para retocar).` : ""}`, list, i.preview);
  },
});

const drawFramesCmd = def({
  name: "draw_frames",
  description:
    "Desenha arte DIFERENTE em vários frames de uma vez (o jeito normal de fazer um ciclo): cada item diz o frame, as linhas de texto e a posição. Equivale a vários draw_rows, mas numa chamada só e com uma prévia no fim. As chaves e o '.' valem como em draw_rows.",
  schema: z.object({
    layer: layerSel,
    items: z
      .array(
        z.object({
          frame: z.number().int().min(0),
          x: z.number().int().default(0),
          y: z.number().int().default(0),
          rows: z.array(z.string().max(512)).min(1).max(512),
          mirror: z.enum(["none", "horizontal"]).default("none").describe("horizontal: escreva só a metade esquerda (com a coluna do meio por último); a engine espelha."),
        }),
      )
      .min(1)
      .max(128),
    dot_is_transparent: z.boolean().default(true),
    preview: previewFlag,
  }),
  run(p, i) {
    const layer = findLayer(p, i.layer);
    const frames = i.items.map((it) => it.frame);
    resolveFrames(p, frames);
    let n = 0;
    for (const it of i.items) {
      const rows = it.mirror === "horizontal" ? it.rows.map((r) => r + [...r].slice(0, -1).reverse().join("")) : it.rows;
      n += drawRows(p, getCel(p, it.frame, layer.id), rows, it.x, it.y, i.dot_is_transparent);
    }
    const warns = i.items.map((it, k) => widthWarning(it.rows, ` (item ${k}, frame ${it.frame})`)).join("");
    return result(p, `${n} pixels escritos em "${layer.name}", ${i.items.length} frame(s): ${[...new Set(frames)].join(", ")}.${warns}`, [...new Set(frames)], i.preview, i.layer);
  },
});

// ---------- figura humana por esqueleto ----------

const angle = (what: string) => z.number().min(-180).max(360).optional().describe(what);
const poseSchema = z
  .object({
    torso: angle("inclinação do tronco para a frente (graus)"),
    head: angle("inclinação da cabeça em relação ao tronco"),
    shoulder_front: angle("ombro do braço da FRENTE: 0 = pendurado, 90 = horizontal à frente, 180 = para cima, negativo = para trás"),
    elbow_front: angle("cotovelo da frente: flexão 0–145 (o antebraço sobe para a frente)"),
    shoulder_back: angle("ombro do braço de TRÁS (o do lado de longe)"),
    elbow_back: angle("cotovelo de trás: flexão 0–145"),
    hip_front: angle("quadril da perna da FRENTE: 0 = coxa para baixo, 90 = horizontal à frente, negativo = para trás"),
    knee_front: angle("joelho da frente: flexão 0–135 (a canela vai para trás)"),
    ankle_front: angle("tornozelo da frente: + dedos para cima, − ponta do pé"),
    hip_back: angle("quadril da perna de TRÁS"),
    knee_back: angle("joelho de trás: flexão 0–135"),
    ankle_back: angle("tornozelo de trás"),
    weapon: z
      .object({
        hand: z.enum(["front", "back"]).default("front").describe("em qual mão: a do braço da frente ou a do de trás"),
        angle: z.number().describe("direção da lâmina no mundo: 0 = para cima, 90 = para a frente (horizontal), 180 = para baixo, negativo = para trás"),
        length: z.number().min(3).max(60).default(12).describe("comprimento da lâmina em px"),
        trail: z.number().min(0).max(180).optional().describe("rastro (smear): arco claro dos N graus anteriores da lâmina, para golpes rápidos"),
      })
      .optional()
      .describe("arma PRESA à mão (nunca flutua): cabo, guarda e lâmina saem da mão"),
  })
  .describe("Ângulos das articulações em graus; o que não for dado fica na pose-base (parado) ou no preset.");

const PRESET_NAMES = Object.keys(POSE_PRESETS) as [string, ...string[]];

/** Exagera (amp > 1) ou suaviza (amp < 1) os ângulos de uma pose em relação à pose parada. */
function scalePose(pose: Pose, amp: number): Pose {
  if (amp === 1) return pose;
  const out = { ...pose } as unknown as Record<string, unknown>;
  for (const k of Object.keys(DEFAULT_POSE)) {
    if (k === "weapon") continue;
    const d = (DEFAULT_POSE as unknown as Record<string, number>)[k], v = (pose as unknown as Record<string, number>)[k];
    out[k] = d + (v - d) * amp;
  }
  return out as unknown as Pose;
}

/** Cor (hex) → índice da paleta; cria a cor se não existir. */
function mix(a: string, b: string, t: number): string {
  const [x, y] = [a, b].map((h) => [1, 3, 5].map((i) => parseInt(normalizeHex(h).slice(i, i + 2), 16)));
  return `#${x.map((v, k) => Math.round(v * (1 - t) + y[k] * t).toString(16).padStart(2, "0")).join("")}`;
}

const DERIVED = /-(luz|sombra|brilho)$/i;
/** cor base de um tom derivado (cabelo-luz → cabelo); a própria cor se não for derivado */
function baseOf(p: Project, idx: number): number {
  const name = p.palette[idx - 1].name;
  if (!DERIVED.test(name)) return idx;
  const base = name.replace(DERIVED, "").toLowerCase();
  const hit = p.palette.findIndex((c) => c.name.toLowerCase() === base);
  return hit >= 0 ? hit + 1 : idx;
}

/** índice da paleta do contorno seletivo para um material vizinho (mais claro no lado da luz) */
function selOutIndex(p: Project, neighborRaw: number, lit: boolean): number {
  const neighbor = baseOf(p, neighborRaw);
  const hex = p.palette[neighbor - 1].hex;
  const base = p.palette[neighbor - 1].name.replace(/-(luz|sombra|brilho)$/i, "");
  return ensureColor(p, mix(hex, darkOutline(hex), lit ? 0.68 : 0.88), `contorno-${base}${lit ? "-luz" : ""}`);
}
const paletteLum = (p: Project) => (idx: number) => { idx = baseOf(p, idx); const [r, g, b] = hexToRgb(p.palette[idx - 1].hex); return 0.3 * r + 0.59 * g + 0.11 * b; };

/** Tons de luz e sombra de uma cor (mudança de matiz suavizada); null para contornos, tons já derivados e cores muito escuras. */
function shadeTones(p: Project, c: number): { light: number; shadow: number } | null {
  const name = p.palette[c - 1].name;
  if (paletteLum(p)(c) < 70 || /(-luz|-sombra|-brilho)$|^contorno/i.test(name)) return null;
  const hex = p.palette[c - 1].hex, r = makeRamp(hex, 5);
  return { light: ensureColor(p, mix(hex, r[3], 0.75), `${name}-luz`), shadow: ensureColor(p, mix(hex, r[1], 0.65), `${name}-sombra`) };
}

function ensureColor(p: Project, hex: string, name: string): number {
  const h = normalizeHex(hex);
  const found = p.palette.findIndex((c) => c.hex === h);
  if (found >= 0) return found + 1;
  // cor quase igual a uma que já existe (distância RGB < 14): reutiliza, para a paleta não inchar com tons que embolam
  const rgb = (x: string) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16));
  const near = p.palette.findIndex((c) => { const a = rgb(c.hex), b = rgb(h); return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 14; });
  if (near >= 0) return near + 1;
  const key = [...KEY_CHARS].find((k) => !p.palette.some((c) => c.key === k) && k !== TRANSPARENT_KEY);
  if (!key || p.palette.length >= MAX_COLORS) throw new Error("Paleta cheia: não dá para criar as cores da figura.");
  p.palette.push({ key, hex: h, name });
  return p.palette.length;
}
/** Rampa de 4 tons com mudança de matiz (contorno, sombra, base, luz) a partir de uma cor base. */
function ensureRamp(p: Project, hex: string, name: string, sharedOutline?: string, withHighlight = false): Ramp {
  const r = makeRamp(hex, 5);
  const outline = sharedOutline ?? darkOutline(hex);
  // pele: a rampa de matiz deslocado satura demais e fica avermelhada; aqui a sombra é a própria pele escurecida e a luz, a pele clareada
  const skin = name === "pele";
  return {
    outline: ensureColor(p, outline, `${name}-contorno`),
    dark: ensureColor(p, skin ? mix(hex, outline, 0.32) : r[1], `${name}-sombra`),
    base: ensureColor(p, hex, `${name}`),
    light: ensureColor(p, skin ? mix(hex, "#fff0dc", 0.4) : r[3], `${name}-luz`),
    ...(withHighlight ? { highlight: ensureColor(p, skin ? mix(hex, "#ffffff", 0.62) : r[4], `${name}-brilho`) } : {}),
  };
}

const drawFigure = def({
  name: "draw_figure",
  description: [
    "Desenha uma figura HUMANA por esqueleto: você dá os ÂNGULOS das articulações e a engine desenha. A anatomia sai certa por construção: ossos de comprimento constante (proporções do estilo), ombro→cotovelo→mão sempre ligados, pescoço, mão presa à arma, o pé mais baixo encosta no chão, e os limites anatômicos são respeitados (o cotovelo só dobra para a frente, o joelho só para trás; fora do limite a engine ajusta e avisa).",
    "Vista lateral, olhando para a direita (facing=left espelha). Cria/usa as camadas contorno, braco-tras, perna-tras, tronco, cabeca, perna-frente, braco-frente e arma, e as cores (contorno, sombra, base e luz de cada material) na paleta.",
    "Cada item diz o frame e a pose: `preset` (parado, caminhada_contato, caminhada_abaixo, caminhada_passagem, caminhada_acima) e/ou `pose` com ângulos (que sobrescrevem o preset); `swap` troca o lado da frente com o de trás.",
    '`cycle: "caminhada"` faz um ciclo completo de 8 frames (contato, abaixo, passagem, acima e o espelho): precisa de 8 frames. `tween: true` preenche os frames que estão ENTRE dois itens interpolando os ângulos com ease in/out (pose a pose + slow in/slow out + arcos, de graça): defina só as poses-chave.',
    "Convenção dos ÂNGULOS DE MEMBRO: 0° = pendurado para baixo; + = para a frente (ombro 90° = braço horizontal à frente, 180° = para cima).",
    "Convenção do ÂNGULO DA ARMA (weapon.angle): 0° = lâmina para CIMA, 90° = horizontal para a frente, 180° = para BAIXO, negativo = para trás (−60° = erguida para cima e para trás, a espada armada atrás da cabeça; −90° = horizontal para trás). `trail: 60` desenha o rastro (smear) dos 60° anteriores, para frames de golpe rápido.",
    "Golpe de espada pronto: presets golpe_armar (armada atrás da cabeça), golpe_impacto (horizontal à frente) e golpe_seguir (para baixo, follow-through); defina esses 3 frames e use tween=true.",
    "Acessórios (`accessories`: chapeu, mochila, capa) ficam ANCORADOS no corpo e seguem a inclinação do tronco e da cabeça em cada frame: não desenhe chapéu ou mochila à mão. `hair`: curto, longo ou careca. `amplitude` > 1 exagera os movimentos do preset (braços e pernas balançam mais).",
  ].join("\n"),
  schema: z.object({
    items: z
      .array(
        z.object({
          frame: z.number().int().min(0),
          preset: z.enum(PRESET_NAMES).optional(),
          swap: z.boolean().optional().describe("troca frente e trás (segunda metade de um ciclo)"),
          pose: poseSchema.optional(),
          airborne: z.number().min(0).max(100).optional().describe("pés no ar, em px (pulos)"),
        }),
      )
      .max(128)
      .optional(),
    cycle: z.enum(["caminhada"]).optional().describe("ciclo pronto de 8 frames (frames 0..7)"),
    tween: z.boolean().default(false).describe("interpola os frames entre os itens"),
    figure_height: z.number().int().min(8).max(240).optional().describe("altura total (chão → topo da cabeça) em px. Padrão: 70% do canvas"),
    style: z.enum(["realista", "estilizado", "chibi"]).default("estilizado").describe("proporções: realista 7,5 cabeças, estilizado 4, chibi 2,5"),
    x: z.number().int().optional().describe("x do quadril (padrão: centro do canvas)"),
    ground: z.number().int().optional().describe("y do chão, onde a sola encosta (padrão: altura − 2)"),
    facing: z.enum(["right", "left"]).default("right"),
    materials: z
      .object({
        skin: z.string().default("#f0c09a"), hair: z.string().default("#6b3b1e"), top: z.string().default("#3d7fd0"),
        bottom: z.string().default("#6a4a8a"), boots: z.string().default("#5a3420"), metal: z.string().default("#b9c4d6"), gold: z.string().default("#e0b040"),
      })
      .default({ skin: "#f0c09a", hair: "#6b3b1e", top: "#3d7fd0", bottom: "#6a4a8a", boots: "#5a3420", metal: "#b9c4d6", gold: "#e0b040" })
      .describe("cores base (hex) de cada material; a engine cria sombra, luz e contorno com mudança de matiz"),
    face: z.boolean().default(true).describe("olho, nariz e boca"),
    hair: z.enum(["curto", "longo", "careca"]).default("curto"),
    accessories: z
      .array(z.object({ kind: z.enum(["chapeu", "mochila", "capa"]), color: z.string().describe("cor base (hex)") }))
      .max(6)
      .optional()
      .describe("chapéu, mochila ou capa ancorados no corpo"),
    amplitude: z.number().min(0.2).max(2.5).default(1).describe("1 = normal; 1.5 = balanço 50% maior (exagero em poucos pixels)"),
    tons: z.union([z.literal(4), z.literal(5)]).default(4).describe("tons por material: 4 = contorno, sombra, base, luz (paleta enxuta); 5 acrescenta um BRILHO (mais cores, mais volume): use em estilos detalhados"),
    outline: z.enum(["compartilhado", "por-material"]).default("compartilhado").describe("compartilhado: um contorno escuro só (paleta enxuta); por-material: contorno do tom do material (mais cores)"),
    light: z.enum(["frente", "esquerda"]).default("frente").describe('"frente": luz de cima e do lado para onde ele olha (o rosto fica iluminado e legível). "esquerda": de cima-esquerda, igual ao resto da cena.'),
    preview: previewFlag,
  }),
  run(p, i) {
    type Item = { frame: number; pose: Pose; airborne?: number };
    let items: Item[] = [];
    const merge = (base: Pose, over?: Record<string, unknown>): Pose => {
      const out = { ...base } as unknown as Record<string, unknown>;
      for (const [k, v] of Object.entries(over ?? {})) if (v !== undefined) out[k] = v;
      return out as unknown as Pose;
    };
    if (i.cycle === "caminhada") {
      if (p.frames.length < 8) throw new Error(`O ciclo de caminhada tem 8 frames, e o projeto tem ${p.frames.length}. Rode add_frames com count ${8 - p.frames.length} antes.`);
      items = Array.from({ length: 8 }, (_, f) => {
        const base = scalePose(POSE_PRESETS[WALK_CYCLE[f % 4]], i.amplitude);
        return { frame: f, pose: f >= 4 ? swapSides(base) : base };
      });
    }
    for (const it of i.items ?? []) {
      resolveFrames(p, it.frame);
      let base = it.preset ? POSE_PRESETS[it.preset] : DEFAULT_POSE;
      if (it.swap) base = swapSides(base);
      base = scalePose(base, i.amplitude);
      items = items.filter((x) => x.frame !== it.frame);
      items.push({ frame: it.frame, pose: merge(base, it.pose as Record<string, unknown> | undefined), airborne: it.airborne });
    }
    if (!items.length) throw new Error('Diga o que desenhar: `items` (frame + preset/pose) ou `cycle: "caminhada"`.');
    items.sort((a, b) => a.frame - b.frame);
    if (i.tween) {
      const extra: Item[] = [];
      for (let k = 0; k + 1 < items.length; k++) {
        const a = items[k], b = items[k + 1];
        for (let f = a.frame + 1; f < b.frame && f < p.frames.length; f++) {
          const t = (f - a.frame) / (b.frame - a.frame);
          extra.push({ frame: f, pose: lerpPose(a.pose, b.pose, t), airborne: a.airborne !== undefined || b.airborne !== undefined ? (a.airborne ?? 0) * (1 - t) + (b.airborne ?? 0) * t : undefined });
        }
      }
      items = [...items, ...extra].sort((a, b) => a.frame - b.frame);
    }
    // camadas na ordem certa (de baixo para cima), juntas
    const have = FIGURE_LAYERS.map((n) => p.layers.find((l) => l.name === n));
    const firstIdx = Math.min(...have.filter(Boolean).map((l) => p.layers.indexOf(l!)), p.layers.length);
    const figureLayers = FIGURE_LAYERS.map((n, k) => have[k] ?? { id: newId("L"), name: n, visible: true });
    p.layers = p.layers.filter((l) => !figureLayers.includes(l));
    p.layers.splice(Math.min(firstIdx, p.layers.length), 0, ...figureLayers);
    if (p.layers.length > MAX_LAYERS) throw new Error(`Máximo de ${MAX_LAYERS} camadas.`);
    for (const l of figureLayers) for (const f of p.frames) if (!f.cels[l.id]) f.cels[l.id] = new Uint8Array(p.width * p.height);

    const m = i.materials;
    const shared = i.outline === "compartilhado" ? darkOutline(m.boots) : undefined;
    const usesWeapon = items.some((x) => x.pose.weapon);
    const R = (hex: string, name: string) => ensureRamp(p, hex, name, shared, i.tons === 5);
    const ramps = {
      skin: R(m.skin, "pele"), hair: i.hair === "careca" ? R(m.skin, "pele") : R(m.hair, "cabelo"), top: R(m.top, "roupa"),
      bottom: R(m.bottom, "calca"), boots: R(m.boots, "bota"),
      // só cria as cores da arma se alguma pose tiver arma
      metal: usesWeapon ? R(m.metal, "metal") : R(m.boots, "bota"), gold: usesWeapon ? R(m.gold, "ouro") : R(m.boots, "bota"),
    };
    const accessories = (i.accessories ?? []).map((a) => ({ kind: a.kind, ramp: R(a.color, a.kind) }));
    const figureHeight = i.figure_height ?? Math.round(p.height * 0.7);
    const warns = new Set<string>();
    for (const it of items) {
      const { warnings } = clampPose(it.pose);
      warnings.forEach((w) => warns.add(`frame ${it.frame}: ${w}`));
      const out = renderFigure({
        width: p.width, height: p.height, figureHeight, style: i.style, x: i.x ?? Math.round(p.width / 2), ground: i.ground ?? p.height - 2,
        facing: i.facing, pose: it.pose, ramps, face: i.face, airborne: it.airborne, light: i.light, hair: i.hair, accessories,
      });
      for (const l of figureLayers) {
        const cel = getCel(p, it.frame, l.id);
        cel.fill(0);
        const src = out.layers[l.name as (typeof FIGURE_LAYERS)[number]];
        for (let k = 0; k < src.length; k++) if (src[k]) cel[k] = src[k];
      }
    }
    const frames = items.map((x) => x.frame);
    const note = warns.size ? `\nATENÇÃO (limites anatômicos):\n- ${[...warns].slice(0, 6).join("\n- ")}` : "";
    return result(p, `Figura (${i.style}, ${figureHeight} px) desenhada em ${fmtList([...new Set(frames)])}.${note}`, [...new Set(frames)], i.preview);
  },
});

// ---------- rig: esqueleto opcional, invisível, que dita o movimento ----------

const NO_RIG = "Este projeto não tem rig (o esqueleto é opcional). Crie um com rig_create, ou use draw_figure para um humano rápido sem rig.";
const needRig = (p: Project) => { if (!p.rig) throw new Error(NO_RIG); return p.rig; };
const GEN_ORDER = ["contorno", "braco-tras", "perna-tras", "pata-longe", "cauda", "mochila", "tronco", "corpo", "cabeca", "chapeu", "orelha", "perna-frente", "braco-frente", "pata-perto", "arma"];

/** Garante as camadas geradas do rig, juntas e na ordem certa (de baixo para cima). */
function ensureGeneratedLayers(p: Project, names: string[]): Map<string, string> {
  const ordered = [...new Set(names)].sort((a, b) => (GEN_ORDER.indexOf(a) < 0 ? 99 : GEN_ORDER.indexOf(a)) - (GEN_ORDER.indexOf(b) < 0 ? 99 : GEN_ORDER.indexOf(b)));
  const ids = new Map<string, string>();
  const layers = ordered.map((n) => {
    let l = p.layers.find((x) => x.name === n);
    if (!l) { l = { id: newId("L"), name: n, visible: true, generated: true }; }
    l.generated = true;
    ids.set(n, l.id);
    return l;
  });
  const firstOld = Math.min(...layers.map((l) => p.layers.indexOf(l)).filter((i) => i >= 0), Infinity);
  const rest = p.layers.filter((l) => !layers.includes(l));
  let at = Number.isFinite(firstOld) ? Math.min(firstOld, rest.length) : rest.length;
  if (!Number.isFinite(firstOld)) {
    const bg = rest.map((l, i) => (/fundo|background|cenario|cenário/i.test(l.name) ? i : -1)).filter((i) => i >= 0);
    at = bg.length ? Math.max(...bg) + 1 : rest.length;
  }
  p.layers = [...rest.slice(0, at), ...layers, ...rest.slice(at)];
  if (p.layers.length > MAX_LAYERS) throw new Error(`Máximo de ${MAX_LAYERS} camadas.`);
  for (const l of layers) for (const f of p.frames) if (!f.cels[l.id]) f.cels[l.id] = new Uint8Array(p.width * p.height);
  return ids;
}

const boneSchema = z.object({
  name: z.string().min(1).max(30),
  parent: z.string().nullable().default(null),
  at: z.union([z.enum(["start", "end"]), z.number().min(0).max(1)]).default("end").describe('onde, no osso-pai, este começa: "start", "end" ou uma fração 0..1 ao longo do pai (0.3 = 30% do caminho do início ao fim)'),
  length: z.number().min(0.5).max(200),
  mode: z.enum(["absolute", "relative"]).default("relative").describe("absolute: o valor é o ângulo no mundo (ombro, quadril); relative: soma ao ângulo do pai (cotovelo, joelho)"),
  rest: z.number().default(0).describe("ângulo em repouso, em graus a partir de 'para baixo' (osso para cima = 180)"),
  sign: z.union([z.literal(1), z.literal(-1)]).default(1).describe("+1: valor positivo gira para a frente; −1: para trás (joelho)"),
  min: z.number().default(-180),
  max: z.number().default(180),
  sole: z.number().min(0).max(20).optional().describe("distância da ponta do osso até a sola; só ossos com sola (pés) encostam no chão no ground_lock"),
});

const rigCreate = def({
  name: "rig_create",
  description: [
    "Cria um ESQUELETO invisível (opcional: sem isto o projeto não tem rig e nada muda). Os ossos ditam o movimento; a arte de cada parte é presa a um osso e o rig_bake a desenha em cada frame. A anatomia sai certa porque os ossos têm comprimento fixo e limites de articulação; o movimento sai bom porque você pensa em ÂNGULOS (poses-chave + tween com ease).",
    'template "humanoide": 13 ossos (tronco, pescoco, cabeca, braco/antebraco e coxa/canela/pe, frente e tras), com proporções de reference proporcoes. Com auto_art=true (padrão) já cria partes de arte provisórias (cápsulas com luz) EDITÁVEIS: troque qualquer uma pela sua arte com rig_part. `weapon_length` acrescenta o osso "espada" preso ao antebraço da frente.',
    'template "quadrupede": cão com coluna (a raiz é o quadril), pescoço, cabeça, orelha, rabo de 2 ossos e 4 patas (as de trás com o jarrete), já com `legs` para rig_walk (marcha de 4 tempos: trás-perto, frente-perto, trás-longe, frente-longe). `height` é a altura da cernelha. Cores: materials.coat (pelagem), accent (peito, focinho, meias) e hair (orelha).',
    'template "vazio" + `bones`: esqueleto livre (pinguim, monstro, robô, qualquer coisa). Cada osso: parent, at ("start", "end" ou uma fração 0..1 ao longo do pai), length, mode (absolute|relative), rest, sign, min, max, sole (só nos pés). Ângulo: graus a partir de "para baixo", + = para a frente; osso para cima = rest 180.',
    'COMO LER OS ÂNGULOS: o valor de cada osso em rig_pose é o DESVIO do repouso (0 = repouso). mode "absolute": o ângulo no mundo é rest + sign×valor (ombro, quadril, tronco). mode "relative": soma ao ângulo do pai (cotovelo, joelho, cabeça). sign +1 gira para a frente; −1 para trás (joelho dobra para trás: sign −1 e o valor é a flexão).',
    'RECEITA para um personagem com poucas partes (ex.: pinguim): ossos corpo (absolute, rest 180, sign −1, length do tronco), cabeca (relative, at "end", rest 0), nadadeira_frente e nadadeira_tras (absolute, rest 0, at 0.6 do corpo, mínimos e máximos ±70), perna_frente/perna_tras (absolute, rest 0) e pe_* (absolute, rest 90, sign −1, sole 1). Depois rig_part com a arte de cada parte (ou from_layer) e rig_pose com ângulos pequenos.',
    "Depois: rig_pose (poses e tween) → rig_bake (renderiza) → view bones=true (vê o esqueleto por cima; na CLI: `anima show <projeto> <frame> --bones --png f.png`). Para mudar um osso sem perder a arte: rig_bone.",
  ].join("\n"),
  schema: z.object({
    template: z.enum(["humanoide", "quadrupede", "vazio"]).default("humanoide"),
    bones: z.array(boneSchema).max(60).optional().describe('template "vazio": os ossos (o primeiro, sem parent, é a raiz)'),
    height: z.number().int().min(8).max(240).optional().describe("humanoide: altura total em px (padrão 70% do canvas). quadrupede: altura da CERNELHA (ombro) em px (padrão 55% do canvas)"),
    style: z.enum(["realista", "estilizado", "chibi"]).default("estilizado"),
    facing: z.enum(["right", "left"]).default("right"),
    x: z.number().int().optional().describe("x da raiz (quadril); padrão: centro do canvas"),
    ground: z.number().int().optional().describe("y do chão (padrão: altura − 2)"),
    weapon_length: z.number().min(3).max(60).optional().describe("humanoide: acrescenta o osso espada com esta lâmina em px"),
    auto_art: z.boolean().default(true).describe("humanoide: cria as partes de arte provisórias (cápsulas) já com cores"),
    materials: z
      .object({ skin: z.string().default("#f0c09a"), hair: z.string().default("#6b3b1e"), top: z.string().default("#3d7fd0"), bottom: z.string().default("#6a4a8a"), boots: z.string().default("#5a3420"), metal: z.string().default("#b9c4d6"), gold: z.string().default("#e0b040"), coat: z.string().default("#c8864a"), accent: z.string().default("#f0dcb0") })
      .default({ skin: "#f0c09a", hair: "#6b3b1e", top: "#3d7fd0", bottom: "#6a4a8a", boots: "#5a3420", metal: "#b9c4d6", gold: "#e0b040", coat: "#c8864a", accent: "#f0dcb0" })
      .describe("cores base (hex). humanoide: skin, hair, top, bottom, boots, metal, gold. quadrupede: coat (pelagem), accent (peito, focinho, meias), hair (orelha e rabo, mais escuro)"),
    accessories: z.array(z.object({ kind: z.enum(["chapeu", "mochila", "capa"]), color: z.string() })).max(4).optional().describe("humanoide: chapéu, mochila ou capa presos ao osso certo (e editáveis depois com rig_part)"),
    replace: z.boolean().default(false).describe("true: troca um rig que já existe"),
  }),
  run(p, i) {
    if (p.rig && !i.replace) throw new Error("Este projeto já tem um rig. Use replace=true para recriá-lo (as partes e as poses atuais são perdidas).");
    const x = i.x ?? Math.round(p.width / 2), ground = i.ground ?? p.height - 2;
    let bones: Bone[];
    const quad = i.template === "quadrupede" ? quadrupedBones(i.height ?? Math.round(p.height * 0.55)) : undefined;
    if (i.template === "humanoide") bones = humanoidBones(i.height ?? Math.round(p.height * 0.7), i.style, i.weapon_length);
    else if (quad) bones = quad.bones;
    else {
      if (!i.bones?.length) throw new Error('template "vazio" precisa de `bones` (a lista de ossos).');
      bones = i.bones.map((b) => ({ ...b, at: b.at }));
      for (const b of bones) if (b.parent && !bones.some((o) => o.name === b.parent)) throw new Error(`O osso "${b.name}" tem pai "${b.parent}", que não existe.`);
      if (new Set(bones.map((b) => b.name)).size !== bones.length) throw new Error("Há ossos com o mesmo nome.");
    }
    const legs = i.template === "humanoide"
      ? (["frente", "tras"] as const).map((side, k) => ({ upper: `coxa_${side}`, lower: `canela_${side}`, foot: `pe_${side}`, phase: k * 0.5, bend: 1 as const, drop: bones.find((b) => b.name === `pe_${side}`)?.sole ?? 1 }))
      : undefined;
    const stand = quad ? Math.round((i.height ?? Math.round(p.height * 0.55)) * 0.9) : Math.round((i.height ?? p.height * 0.7) * 0.5);
    p.rig = { bones, legs: quad ? quad.legs : legs, parts: [], facing: i.facing, root: { x, y: ground - stand }, ground };
    for (const f of p.frames) f.pose = undefined;
    let parts = 0;
    if (i.template === "humanoide" && i.auto_art) {
      const R = (hex: string, name: string) => ensureRamp(p, hex, name, darkOutline(i.materials.boots));
      const ramp = { skin: R(i.materials.skin, "pele"), hair: R(i.materials.hair, "cabelo"), top: R(i.materials.top, "roupa"), bottom: R(i.materials.bottom, "calca"), boots: R(i.materials.boots, "bota"), metal: R(i.materials.metal, "metal"), gold: R(i.materials.gold, "ouro") };
      const key = (n: number) => p.palette[n - 1].key;
      const K = (r: Ramp, far = false) => (far ? { dark: key(r.outline), base: key(r.dark), light: key(r.base) } : { dark: key(r.dark), base: key(r.base), light: key(r.light) });
      const pr = bodyProportionsOf(bones, i.height ?? Math.round(p.height * 0.7), i.style);
      const u = pr.head;
      const rArm = Math.max(1, u * 0.16), rFore = Math.max(0.9, u * 0.14), rThigh = Math.max(1.3, u * 0.23), rShin = Math.max(1.1, u * 0.18);
      const rTl = Math.max(2, u * 0.34), rTu = Math.max(2.2, u * 0.4), rNeck = Math.max(0.9, u * 0.14), rFoot = Math.max(0.9, pr.footH * 0.5);
      const B = (n: string) => bones.find((b) => b.name === n)!;
      const add = (name: string, bone: string, art: { rows: string[]; pivot: { x: number; y: number } }, layer: string, z: number) => { p.rig!.parts.push({ name, bone, layer, z, pivot: art.pivot, rows: art.rows }); parts++; };
      const rig = p.rig;
      for (const side of ["tras", "frente"] as const) {
        const far = side === "tras";
        add(`braco_${side}`, `braco_${side}`, capsuleArt(rig, B(`braco_${side}`), rArm, rArm * 0.9, K(ramp.top, far)), `braco-${side}`, 0);
        add(`antebraco_${side}`, `antebraco_${side}`, capsuleArt(rig, B(`antebraco_${side}`), rFore, rFore * 0.85, K(ramp.skin, far)), `braco-${side}`, 1);
        add(`mao_${side}`, `antebraco_${side}`, ellipseArt(rig, B(`antebraco_${side}`), B(`antebraco_${side}`).length, pr.handR, pr.handR, K(ramp.skin)), `braco-${side}`, 2);
        add(`coxa_${side}`, `coxa_${side}`, capsuleArt(rig, B(`coxa_${side}`), rThigh, rThigh * 0.85, K(ramp.bottom, far)), `perna-${side}`, 0);
        add(`canela_${side}`, `canela_${side}`, capsuleArt(rig, B(`canela_${side}`), rShin, rShin * 0.8, K(ramp.bottom, far)), `perna-${side}`, 1);
        add(`pe_${side}`, `pe_${side}`, capsuleArt(rig, B(`pe_${side}`), rFoot, rFoot * 0.85, K(ramp.boots, far), pr.footL * 0.25), `perna-${side}`, 2);
      }
      add("tronco", "tronco", capsuleArt(rig, B("tronco"), rTl, rTu, K(ramp.top)), "tronco", 0);
      add("quadril", "tronco", ellipseArt(rig, B("tronco"), 0, rTl * 0.95, rTl * 0.9, K(ramp.bottom)), "tronco", 1);
      add("pescoco", "pescoco", capsuleArt(rig, B("pescoco"), rNeck, rNeck * 0.9, K(ramp.skin)), "tronco", 2);
      const hairKeys = K(ramp.hair), skinKeys = K(ramp.skin);
      add("cabeca", "cabeca", ellipseArt(rig, B("cabeca"), pr.head * 0.46, pr.head * 0.42, pr.head * 0.5, skinKeys, (cells, c) => {
        for (let y = 0; y < cells.length; y++) for (let xx = 0; xx < cells.length; xx++) {
          if (cells[y][xx] === TRANSPARENT_KEY) continue;
          const lx = (xx + 0.5 - c.x) / pr.head, ly = (y + 0.5 - c.y) / pr.head;
          if (ly < -0.2 || (lx < -0.3 && ly < 0.02)) cells[y][xx] = ly < -0.3 ? (lx < 0 ? hairKeys.light : hairKeys.base) : hairKeys.dark;
        }
        const put = (lx: number, ly: number, k: string) => { const xx = Math.floor(c.x + lx * pr.head), y = Math.floor(c.y + ly * pr.head); if (cells[y]?.[xx] && cells[y][xx] !== TRANSPARENT_KEY) cells[y][xx] = k; };
        put(0.14, -0.04, key(ramp.skin.outline)); put(0.42, 0.06, skinKeys.light); if (pr.head >= 7) put(0.32, 0.22, skinKeys.dark);
      }), "cabeca", 0);
      for (const acc of i.accessories ?? []) {
        const ar = R(acc.color, acc.kind);
        const ak = K(ar);
        if (acc.kind === "chapeu") {
          const crown = ellipseArt(rig, B("cabeca"), pr.head * 0.8, pr.head * 0.34, pr.head * 0.2, ak);
          add("chapeu_copa", "cabeca", crown, "chapeu", 0);
          add("chapeu_aba", "cabeca", ellipseArt(rig, B("cabeca"), pr.head * 0.68, pr.head * 0.62, pr.head * 0.09, ak), "chapeu", 1);
        } else if (acc.kind === "mochila") {
          const rows = ellipseArt(rig, B("tronco"), pr.torso * 0.5, pr.head * 0.22, pr.head * 0.38, ak);
          // desloca a mochila para as costas: o pivô fica à frente da arte
          add("mochila", "tronco", { rows: rows.rows, pivot: { x: rows.pivot.x + Math.round(pr.head * 0.5), y: rows.pivot.y } }, "mochila", 0);
        } else {
          add("capa", "tronco", { ...capsuleArt(rig, B("tronco"), pr.head * 0.34, pr.head * 0.5, ak), pivot: capsuleArt(rig, B("tronco"), pr.head * 0.34, pr.head * 0.5, ak).pivot }, "mochila", 0);
        }
      }
      if (i.weapon_length) {
        const sw = capsuleArt(rig, B("espada"), 0.9, 0.55, K(ramp.metal));
        // guarda (perpendicular) e cabo, desenhados na arte da lâmina
        const rows = sw.rows.map((r) => [...r]);
        const { x: px, y: py } = sw.pivot;
        const gk = key(ramp.gold.base), hk = key(ramp.boots.base);
        for (let d = -2; d <= 2; d++) if (rows[py]?.[px + d]) rows[py][px + d] = gk;
        for (let d = 1; d <= 2; d++) if (rows[py - d]?.[px]) rows[py - d][px] = hk;
        add("espada", "espada", { rows: rows.map((r) => r.join("")), pivot: sw.pivot }, "arma", 0);
      }
    }
    if (quad && i.auto_art) {
      const h = i.height ?? Math.round(p.height * 0.55);
      const outline = darkOutline(i.materials.coat);
      const R = (hex: string, name: string) => ensureRamp(p, hex, name, outline);
      const coat = R(i.materials.coat, "pelo"), accent = R(i.materials.accent, "creme"), ear = R(i.materials.hair, "orelha");
      const key = (n: number) => p.palette[n - 1].key;
      const K = (r: Ramp, far = false) => (far ? { dark: key(r.outline), base: key(r.dark), light: key(r.base) } : { dark: key(r.dark), base: key(r.base), light: key(r.light) });
      const rig = p.rig;
      const B = (n: string) => bones.find((b) => b.name === n)!;
      const add = (name: string, bone: string, art: { rows: string[]; pivot: { x: number; y: number } }, layer: string, z: number) => { rig.parts.push({ name, bone, layer, z, pivot: art.pivot, rows: art.rows }); parts++; };
      const L = B("espinha").length;
      add("espinha", "espinha", capsuleArt(rig, B("espinha"), h * 0.17, h * 0.21, K(coat)), "corpo", 0);
      add("peito", "espinha", ellipseArt(rig, B("espinha"), L * 0.93, h * 0.1, h * 0.15, K(accent)), "corpo", 1);
      add("pescoco", "pescoco", capsuleArt(rig, B("pescoco"), h * 0.11, h * 0.1, K(coat)), "corpo", 2);
      const dark = key(coat.outline);
      add("cabeca", "cabeca", ellipseArt(rig, B("cabeca"), h * 0.2, h * 0.17, h * 0.15, K(coat), (cells, c) => {
        const px = Math.floor(c.x + h * 0.06), py = Math.floor(c.y - h * 0.04);
        if (cells[py]?.[px] && cells[py][px] !== TRANSPARENT_KEY) cells[py][px] = dark;
      }), "cabeca", 0);
      add("focinho", "cabeca", ellipseArt(rig, B("cabeca"), h * 0.33, h * 0.12, h * 0.075, K(accent), (cells, c) => {
        const px = Math.floor(c.x + h * 0.1), py = Math.floor(c.y - h * 0.01);
        if (cells[py]?.[px] && cells[py][px] !== TRANSPARENT_KEY) cells[py][px] = dark;
      }), "cabeca", 1);
      add("orelha", "orelha", capsuleArt(rig, B("orelha"), h * 0.06, h * 0.045, K(ear)), "orelha", 0);
      add("cauda1", "cauda1", capsuleArt(rig, B("cauda1"), h * 0.05, h * 0.045, K(coat)), "cauda", 0);
      add("cauda2", "cauda2", capsuleArt(rig, B("cauda2"), h * 0.045, h * 0.03, K(accent)), "cauda", 1);
      for (const side of ["longe", "perto"] as const) {
        const far = side === "longe", layer = `pata-${side}`;
        add(`braco_${side}`, `braco_${side}`, capsuleArt(rig, B(`braco_${side}`), h * 0.09, h * 0.07, K(coat, far)), layer, 0);
        add(`antebraco_${side}`, `antebraco_${side}`, capsuleArt(rig, B(`antebraco_${side}`), h * 0.065, h * 0.05, K(coat, far)), layer, 1);
        add(`pe_f_${side}`, `pe_f_${side}`, capsuleArt(rig, B(`pe_f_${side}`), Math.max(0.9, h * 0.045), Math.max(0.8, h * 0.04), K(accent, far), h * 0.03), layer, 2);
        add(`coxa_${side}`, `coxa_${side}`, capsuleArt(rig, B(`coxa_${side}`), h * 0.12, h * 0.08, K(coat, far)), layer, 0);
        add(`canela_${side}`, `canela_${side}`, capsuleArt(rig, B(`canela_${side}`), h * 0.07, h * 0.05, K(coat, far)), layer, 1);
        add(`metatarso_${side}`, `metatarso_${side}`, capsuleArt(rig, B(`metatarso_${side}`), h * 0.045, h * 0.04, K(coat, far)), layer, 2);
        add(`pe_t_${side}`, `pe_t_${side}`, capsuleArt(rig, B(`pe_t_${side}`), Math.max(0.9, h * 0.045), Math.max(0.8, h * 0.04), K(accent, far), h * 0.03), layer, 3);
      }
    }
    return { changed: true, text: `Rig criado (${i.template}): ${bones.length} ossos${parts ? `, ${parts} partes de arte provisórias` : ""}. Ossos: ${bones.map((b) => b.name).join(", ")}. Próximo: rig_pose, depois rig_bake.` };
  },
});

function bodyProportionsOf(bones: Bone[], height: number, style: "realista" | "estilizado" | "chibi") {
  const pr = bodyProportions(height, style);
  void bones;
  return pr;
}

const rigPart = def({
  name: "rig_part",
  description: [
    "Liga a ARTE de uma parte a um osso (ou troca a arte provisória por uma sua). A arte é desenhada UMA vez, com o osso na pose de REPOUSO (membros pendurados para baixo; tronco, pescoço e cabeça para cima; pé para a frente), e guardada no rig: o bake sempre gira a partir dela, nunca de uma cópia já girada.",
    "`rows`: linhas de texto com chaves da paleta ('.' = transparente), como em draw_rows. `pivot`: a célula da arte onde fica o INÍCIO do osso (a articulação). `layer` e `z`: camada onde a parte é renderizada (várias partes podem dividir uma) e a ordem dentro dela.",
    "Alternativas rápidas: `from_layer` FATIA arte que você já desenhou numa camada (na pose de repouso): dê `layer`, `region` (retângulo) e `joint` (o pixel do canvas onde fica a articulação) e a engine vira a parte; `capsule` (cápsula com luz ao longo do osso); `remove: true`.",
  ].join("\n"),
  schema: z.object({
    name: z.string().min(1).max(30),
    bone: z.string().optional().describe("osso ao qual a parte é presa (obrigatório ao criar)"),
    rows: z.array(z.string().max(128)).min(1).max(128).optional(),
    pivot: z.object({ x: z.number().int(), y: z.number().int() }).optional().describe("célula da arte onde começa o osso"),
    layer: z.string().max(30).optional().describe("padrão: o nome da parte"),
    z: z.number().optional().describe("ordem dentro da camada (maior = por cima)"),
    capsule: z
      .object({ r0: z.number().min(0.5).max(30), r1: z.number().min(0.5).max(30).optional(), base: z.string(), light: z.string().optional(), dark: z.string().optional(), back: z.number().min(0).max(30).optional() })
      .optional()
      .describe("gera uma cápsula ao longo do osso com estas cores (chaves da paleta)"),
    variantes: z.array(z.object({
      de: z.number().describe("início da faixa de ângulo (graus de giro do osso em relação ao repouso; + = para a frente)"),
      ate: z.number().describe("fim da faixa"),
      rows: z.array(z.string().max(128)).min(1).max(128),
      pivot: z.object({ x: z.number().int(), y: z.number().int() }),
    })).max(8).optional().describe("ARTE POR FAIXA DE ÂNGULO: uma arte pré-desenhada para cada faixa (ex.: escudo de lado em 0..30°, escudo inclinado em 30..70°). Dentro da faixa a engine usa essa arte e gira só o resíduo em torno do centro da faixa, em vez de girar a arte de repouso (que borra escudo e cabeça). Fora de qualquer faixa usa a arte de repouso."),
    from_layer: z
      .object({
        layer: z.string().describe("camada que já tem a arte do personagem NA POSE DE REPOUSO"),
        frame: z.number().int().min(0).default(0).describe("frame onde está essa arte"),
        region: z.object({ x: z.number().int().min(0), y: z.number().int().min(0), w: z.number().int().min(1), h: z.number().int().min(1) }).optional().describe("retângulo a recortar (padrão: tudo o que está desenhado na camada)"),
        joint: z.object({ x: z.number().int().min(0), y: z.number().int().min(0) }).describe("o pixel do CANVAS onde fica a articulação (o início do osso) nessa arte"),
        clear_source: z.boolean().default(false).describe("apaga os pixels recortados da camada de origem (para a parte não aparecer duas vezes)"),
      })
      .optional()
      .describe("FATIA a arte que você já desenhou numa camada em uma parte presa ao osso: dá a região e a articulação, em coordenadas do canvas"),
    remove: z.boolean().default(false),
  }),
  run(p, i) {
    const rig = needRig(p);
    if (i.remove) {
      const before = rig.parts.length;
      rig.parts = rig.parts.filter((x) => x.name !== i.name);
      if (rig.parts.length === before) throw new Error(`A parte "${i.name}" não existe. Partes: ${rig.parts.map((x) => x.name).join(", ") || "(nenhuma)"}.`);
      return { changed: true, text: `Parte "${i.name}" removida.` };
    }
    const old = rig.parts.find((x) => x.name === i.name);
    const bone = i.bone ?? old?.bone;
    if (!bone) throw new Error("Diga o osso (`bone`) ao qual a parte é presa.");
    const b = rig.bones.find((x) => x.name === bone);
    if (!b) throw new Error(`O osso "${bone}" não existe. Ossos: ${rig.bones.map((x) => x.name).join(", ")}.`);
    let rows = i.rows, pivot = i.pivot;
    if (i.from_layer) {
      const src = i.from_layer;
      const layer = findLayer(p, src.layer);
      resolveFrames(p, src.frame);
      const cel = getCel(p, src.frame, layer.id);
      let region = src.region;
      if (!region) {
        let x0 = p.width, y0 = p.height, x1 = -1, y1 = -1;
        for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) if (cel[y * p.width + x]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
        if (x1 < 0) throw new Error(`A camada "${layer.name}" está vazia no frame ${src.frame}: não há arte para recortar.`);
        region = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
      }
      const r = { x: region.x, y: region.y, w: Math.min(region.w, p.width - region.x), h: Math.min(region.h, p.height - region.y) };
      if (src.joint.x < r.x || src.joint.y < r.y || src.joint.x >= r.x + r.w || src.joint.y >= r.y + r.h) {
        throw new Error(`A articulação (${src.joint.x}, ${src.joint.y}) está fora da região recortada (x ${r.x}..${r.x + r.w - 1}, y ${r.y}..${r.y + r.h - 1}). Ela precisa estar dentro da arte da parte.`);
      }
      rows = [];
      let n = 0;
      for (let y = r.y; y < r.y + r.h; y++) {
        let row = "";
        for (let x = r.x; x < r.x + r.w; x++) {
          const v = cel[y * p.width + x];
          row += v ? p.palette[v - 1].key : TRANSPARENT_KEY;
          if (v) n++;
        }
        rows.push(row);
      }
      if (!n) throw new Error(`A região recortada (x ${r.x}..${r.x + r.w - 1}, y ${r.y}..${r.y + r.h - 1}) está vazia na camada "${layer.name}".`);
      pivot = { x: src.joint.x - r.x, y: src.joint.y - r.y };
      if (src.clear_source) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) cel[y * p.width + x] = 0;
    }
    if (i.capsule) {
      const c = i.capsule;
      const art = capsuleArt(rig, b, c.r0, c.r1 ?? c.r0, { base: c.base, light: c.light ?? c.base, dark: c.dark ?? c.base }, c.back ?? 0);
      rows = art.rows; pivot = art.pivot;
    }
    if (!rows) { if (old) rows = old.rows; else throw new Error("Diga a arte: `rows` (e `pivot`) ou `capsule`."); }
    if (!pivot) { if (old && !i.rows) pivot = old.pivot; else throw new Error("Diga o `pivot`: a célula da arte onde começa o osso (a articulação)."); }
    const w = Math.max(...rows.map((r) => [...r].length));
    if (pivot.x < 0 || pivot.y < 0 || pivot.x >= w || pivot.y >= rows.length) throw new Error(`O pivot (${pivot.x}, ${pivot.y}) está fora da arte (${w}×${rows.length}).`);
    for (const k of new Set(rows.join("").split(""))) if (k !== TRANSPARENT_KEY && k !== " ") colorIndex(p, k);
    for (const v of i.variantes ?? []) {
      if (v.de > v.ate) throw new Error(`Variante com faixa invertida (${v.de}..${v.ate}).`);
      const vw = Math.max(...v.rows.map((r) => [...r].length));
      if (v.pivot.x < 0 || v.pivot.y < 0 || v.pivot.x >= vw || v.pivot.y >= v.rows.length) throw new Error(`O pivot (${v.pivot.x}, ${v.pivot.y}) da variante ${v.de}..${v.ate} está fora da arte (${vw}×${v.rows.length}).`);
      for (const k of new Set(v.rows.join("").split(""))) if (k !== TRANSPARENT_KEY && k !== " ") colorIndex(p, k);
    }
    const part: RigPart = { name: i.name, bone, layer: i.layer ?? old?.layer ?? i.name, z: i.z ?? old?.z ?? 0, pivot, rows, ...((i.variantes ?? old?.variantes) ? { variantes: i.variantes ?? old?.variantes } : {}) };
    rig.parts = rig.parts.filter((x) => x.name !== i.name).concat(part);
    return { changed: true, text: `Parte "${i.name}" ${old ? "atualizada" : "criada"}: arte ${w}×${rows.length} presa ao osso "${bone}" (pivô ${pivot.x},${pivot.y}), camada "${part.layer}"${part.variantes?.length ? `, ${part.variantes.length} variante(s) de ângulo (${part.variantes.map((v) => `${v.de}..${v.ate}°`).join(", ")})` : ""}.` };
  },
});

const rigPose = def({
  name: "rig_pose",
  description: [
    "Define a POSE do esqueleto em frames: ângulos por osso (graus; limites anatômicos aplicados e avisados) e a posição da raiz. Só guarda a pose; rig_bake renderiza.",
    "`items`: [{frame, angles: {osso: graus}, root?: {x, y}, preset?, swap?}]. Para o humanoide há presets (parado, caminhada_contato/abaixo/passagem/acima, golpe_armar/impacto/seguir) e `cycle: \"caminhada\"` (8 frames). `ground_lock` (padrão) apoia a sola mais baixa no chão em cada frame.",
    "`tween: true` preenche os frames ENTRE dois itens interpolando os ângulos com ease in/out: defina só as poses-chave (pose a pose, slow in/out e arcos de graça). Ângulos de ossos que você não citar ficam em 0 (repouso).",
  ].join("\n"),
  schema: z.object({
    items: z
      .array(
        z.object({
          frame: z.number().int().min(0),
          preset: z.enum(PRESET_NAMES).optional().describe("só no humanoide"),
          swap: z.boolean().optional(),
          angles: z.record(z.string(), z.number()).optional().describe("ângulo por osso, ex.: {\"braco_frente\": 90, \"antebraco_frente\": 20}"),
          root: z.object({ x: z.number(), y: z.number() }).optional().describe("posição da raiz (quadril) neste frame; anula o ground_lock no y"),
        }),
      )
      .max(128)
      .optional(),
    cycle: z.enum(["caminhada"]).optional(),
    tween: z.boolean().default(false),
    ground_lock: z.boolean().default(true).describe("apoia a sola mais baixa no chão (ossos com sola) em cada frame"),
    amplitude: z.number().min(0.2).max(2.5).default(1).describe("exagera (>1) ou suaviza (<1) os presets"),
    preview: previewFlag,
  }),
  run(p, i) {
    const rig = needRig(p);
    const humanoid = HUMANOID_BONES.every((n) => rig.bones.some((b) => b.name === n));
    type It = { frame: number; angles: Record<string, number>; root?: { x: number; y: number } };
    let items: It[] = [];
    const fromPose = (pose: Pose) => { if (!humanoid) throw new Error("Os presets só existem no modelo humanoide; para um esqueleto livre use `angles`."); return humanoidAngles(pose); };
    if (i.cycle === "caminhada") {
      if (!humanoid) throw new Error("O ciclo de caminhada pronto é do modelo humanoide.");
      if (p.frames.length < 8) throw new Error(`O ciclo de caminhada tem 8 frames, e o projeto tem ${p.frames.length}. Rode add_frames com count ${8 - p.frames.length} antes.`);
      items = Array.from({ length: 8 }, (_, f) => { const base = scalePose(POSE_PRESETS[WALK_CYCLE[f % 4]], i.amplitude); return { frame: f, angles: fromPose(f >= 4 ? swapSides(base) : base) }; });
    }
    for (const it of i.items ?? []) {
      resolveFrames(p, it.frame);
      let angles: Record<string, number> = {};
      if (it.preset) { let base = POSE_PRESETS[it.preset]; if (it.swap) base = swapSides(base); angles = fromPose(scalePose(base, i.amplitude)); }
      Object.assign(angles, it.angles ?? {});
      items = items.filter((x) => x.frame !== it.frame);
      items.push({ frame: it.frame, angles, root: it.root });
    }
    if (!items.length) throw new Error('Diga as poses: `items` (frame + angles/preset) ou `cycle: "caminhada"`.');
    items.sort((a, b) => a.frame - b.frame);
    const names = rig.bones.map((b) => b.name);
    for (const it of items) for (const k of Object.keys(it.angles)) if (!names.includes(k)) throw new Error(`O osso "${k}" não existe (frame ${it.frame}). Ossos: ${names.join(", ")}.`);
    const full = (a: Record<string, number>) => Object.fromEntries(names.map((n) => [n, a[n] ?? 0]));
    if (i.tween) {
      const extra: It[] = [];
      const ease = (t: number) => t * t * (3 - 2 * t);
      for (let k = 0; k + 1 < items.length; k++) {
        const a = items[k], b = items[k + 1];
        for (let f = a.frame + 1; f < b.frame && f < p.frames.length; f++) {
          const t = ease((f - a.frame) / (b.frame - a.frame));
          const fa = full(a.angles), fb = full(b.angles);
          const angles = Object.fromEntries(names.map((n) => [n, fa[n] * (1 - t) + fb[n] * t]));
          const root = a.root && b.root ? { x: a.root.x * (1 - t) + b.root.x * t, y: a.root.y * (1 - t) + b.root.y * t } : undefined;
          extra.push({ frame: f, angles, root });
        }
      }
      items = [...items, ...extra].sort((a, b) => a.frame - b.frame);
    }
    const warns = new Set<string>();
    for (const it of items) {
      const { angles, warnings } = clampAngles(rig, full(it.angles));
      warnings.forEach((w) => warns.add(`frame ${it.frame}: ${w}`));
      const x = it.root?.x ?? rig.root.x;
      const root = it.root ?? (i.ground_lock ? groundedRoot(rig, angles, x) : { x, y: rig.root.y });
      p.frames[it.frame].pose = { angles, root };
    }
    const frames = [...new Set(items.map((x) => x.frame))];
    const note = warns.size ? `\nATENÇÃO (limites anatômicos):\n- ${[...warns].slice(0, 6).join("\n- ")}` : "";
    return { changed: true, text: `Pose definida em ${fmtList(frames)}. Rode rig_bake para renderizar.${note}` };
  },
});

const rigBake = def({
  name: "rig_bake",
  description: [
    "Renderiza o rig: desenha as partes de arte nas camadas (marcadas como GERADAS) de cada frame com pose, girando SEMPRE a partir da arte limpa guardada no rig. É repetível e não destrutivo: depois de mudar poses ou arte, rode de novo. Para retocar à mão, desenhe em OUTRA camada (por cima): o bake só reescreve as camadas geradas.",
    "`snap_angle`: arredonda o ângulo de cada parte (ex.: 15) para um serrilhado mais estável em sprites pequenos; 0 = sem arredondar. `outline`: chave da paleta para um contorno de 1 px em volta de tudo (camada contorno), ou \"auto\" para contorno seletivo (sel-out: cada trecho no tom escuro do material vizinho, mais claro no lado da luz; evita o halo preto uniforme). As juntas são arredondadas ao pixel.",
  ].join("\n"),
  schema: z.object({
    frames: framesSel.optional().describe('Padrão: todos os frames que têm pose'),
    snap_angle: z.number().min(0).max(90).default(0),
    round_joints: z.boolean().default(true),
    outline: z.string().optional().describe('chave da paleta do contorno externo (opcional), ou "auto": contorno seletivo, tom escuro do material vizinho e mais claro no lado da luz (cria cores)'),
    preview: previewFlag,
  }),
  run(p, i) {
    const rig = needRig(p);
    if (!rig.parts.length) throw new Error("O rig não tem partes de arte. Use rig_part (ou rig_create template humanoide com auto_art).");
    const list = i.frames !== undefined ? resolveFrames(p, i.frames) : p.frames.map((_, k) => k).filter((k) => p.frames[k].pose);
    if (!list.length) throw new Error("Nenhum frame tem pose. Rode rig_pose primeiro.");
    const names = [...new Set(rig.parts.map((x) => x.layer)), ...(i.outline ? ["contorno"] : [])];
    const ids = ensureGeneratedLayers(p, names);
    const auto = i.outline === "auto";
    const outlineIdx = i.outline && !auto ? colorIndex(p, i.outline) : 0;
    for (const f of list) {
      const out = renderRigFrame(p, p.frames[f].pose, { snapAngle: i.snap_angle, roundJoints: i.round_joints });
      for (const n of names) getCel(p, f, ids.get(n)!).fill(0);
      const union = new Uint8Array(p.width * p.height);
      const top = new Uint8Array(p.width * p.height);
      for (const [layer, buf] of out) {
        const cel = getCel(p, f, ids.get(layer)!);
        for (let k = 0; k < buf.length; k++) if (buf[k]) { cel[k] = buf[k]; union[k] = 1; top[k] = buf[k]; }
      }
      if (auto) selectiveOutline(top, getCel(p, f, ids.get("contorno")!), p.width, p.height, (c, lit) => selOutIndex(p, c, lit), paletteLum(p));
      if (outlineIdx) {
        const cel = getCel(p, f, ids.get("contorno")!);
        for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) {
          const k = y * p.width + x;
          if (union[k]) continue;
          if ((x > 0 && union[k - 1]) || (x < p.width - 1 && union[k + 1]) || (y > 0 && union[k - p.width]) || (y < p.height - 1 && union[k + p.width])) cel[k] = outlineIdx;
        }
      }
    }
    const small = rig.parts.every((x) => Math.max(x.rows.length, ...x.rows.map((r) => [...r].length)) <= 24);
    const rotated = list.some((f) => Object.values(p.frames[f].pose?.angles ?? {}).some((v) => Math.abs(v) > 2));
    const tip = small && rotated && !i.snap_angle ? "\nDica: as partes são pequenas (≤ 24 px) e giram: girar arte minúscula serrilha e pode soltar pixels. Tente snap_angle 3–5 (arredonda os ângulos) ou revise as partes mais finas." : "";
    return result(p, `Rig renderizado em ${fmtList(list)}: ${rig.parts.length} partes em ${names.length} camada(s) geradas (${names.join(", ")}).${tip}`, list, i.preview);
  },
});

const rigInfo = def({
  name: "rig_info",
  description: "Lista o esqueleto SEM abrir o JSON: cada osso (pai, ponto de fixação, comprimento, modo, repouso, sinal, limites) e cada parte de arte (osso, camada, tamanho, pivô). Convenções: ângulo em graus a partir de \"para baixo\", + = para a frente; o PIVÔ do pé é o tornozelo e a arte do pé aponta para a frente (facing) na pose de repouso; membros pendurados para baixo; osso com min == max fica TRAVADO nesse ângulo (arma/escudo fixos).",
  schema: z.object({}),
  run(p) {
    const rig = needRig(p);
    const bones = rig.bones.map((b) => `- ${b.name}: pai ${b.parent ?? "—"} (${typeof b.at === "number" ? `em ${b.at}` : b.at}), ${b.length} px, ${b.mode}, repouso ${b.rest}°, sinal ${b.sign}, limites [${b.min}, ${b.max}]${b.min === b.max ? " (TRAVADO)" : ""}${b.sole !== undefined ? `, sola ${b.sole}` : ""}`);
    const parts = rig.parts.map((x) => `- ${x.name}: osso ${x.bone}, camada ${x.layer}, ${Math.max(0, ...x.rows.map((r) => [...r].length))}x${x.rows.length} px, pivô (${x.pivot.x}, ${x.pivot.y}), z ${x.z}`);
    return { changed: false, text: `Rig: facing ${rig.facing}, chão y ${rig.ground}, raiz (${rig.root.x}, ${rig.root.y}).\nOssos (${bones.length}):\n${bones.join("\n")}\nPartes (${parts.length}):\n${parts.join("\n") || "(nenhuma)"}` };
  },
});

const rigBone = def({
  name: "rig_bone",
  description: "Cria, EDITA ou remove um osso SEM perder a arte das partes: muda comprimento, repouso, limites, pai ou ponto de fixação (`at`) e as partes presas continuam (o pivô fica o mesmo; só a distância entre juntas muda). Se o osso não existe, cria (precisa de `parent` e `length`). `remove: true` só funciona se nenhum osso filho e nenhuma parte dependerem dele.",
  schema: z.object({
    name: z.string().min(1).max(30),
    parent: z.string().nullable().optional(),
    at: z.union([z.enum(["start", "end"]), z.number().min(0).max(1)]).optional(),
    length: z.number().min(0.5).max(200).optional(),
    mode: z.enum(["absolute", "relative"]).optional(),
    rest: z.number().optional(),
    sign: z.union([z.literal(1), z.literal(-1)]).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    sole: z.number().min(0).max(20).nullable().optional(),
    remove: z.boolean().default(false),
  }),
  run(p, i) {
    const rig = needRig(p);
    const idx = rig.bones.findIndex((b) => b.name === i.name);
    if (i.remove) {
      if (idx < 0) throw new Error(`O osso "${i.name}" não existe. Ossos: ${rig.bones.map((b) => b.name).join(", ")}.`);
      const kids = rig.bones.filter((b) => b.parent === i.name).map((b) => b.name);
      const parts = rig.parts.filter((x) => x.bone === i.name).map((x) => x.name);
      if (kids.length || parts.length) throw new Error(`Não dá para remover "${i.name}": ${kids.length ? `ossos filhos (${kids.join(", ")})` : ""}${kids.length && parts.length ? " e " : ""}${parts.length ? `partes presas (${parts.join(", ")})` : ""}. Remova ou mova antes.`);
      rig.bones.splice(idx, 1);
      for (const f of p.frames) if (f.pose) delete f.pose.angles[i.name];
      return { changed: true, text: `Osso "${i.name}" removido.` };
    }
    if (i.parent && !rig.bones.some((b) => b.name === i.parent)) throw new Error(`O pai "${i.parent}" não existe. Ossos: ${rig.bones.map((b) => b.name).join(", ")}.`);
    if (i.parent === i.name) throw new Error("Um osso não pode ser pai de si mesmo.");
    if (idx >= 0) {
      const b = rig.bones[idx];
      if (i.parent !== undefined) b.parent = i.parent;
      for (const k of ["at", "length", "mode", "rest", "sign", "min", "max"] as const) if (i[k] !== undefined) (b as unknown as Record<string, unknown>)[k] = i[k];
      if (i.sole !== undefined) b.sole = i.sole ?? undefined;
      // sem ciclo de pais
      for (let cur: Bone | undefined = b, n = 0; cur?.parent; cur = rig.bones.find((x) => x.name === cur!.parent), n++) if (n > rig.bones.length) throw new Error("Esta mudança cria um ciclo de ossos pai/filho.");
      return { changed: true, text: `Osso "${i.name}" atualizado (${[...Object.keys(i)].filter((k) => !["name", "remove"].includes(k) && (i as Record<string, unknown>)[k] !== undefined).join(", ") || "nada"}); as ${rig.parts.filter((x) => x.bone === i.name).length} parte(s) presas continuam. Rode rig_bake para ver.` };
    }
    if (i.length === undefined) throw new Error(`O osso "${i.name}" é novo: diga o \`length\` (e o \`parent\`, se não for a raiz).`);
    if (i.parent === undefined && rig.bones.length) throw new Error(`O osso "${i.name}" é novo: diga o \`parent\` (ou null para uma segunda raiz).`);
    rig.bones.push({ name: i.name, parent: i.parent ?? null, at: i.at ?? "end", length: i.length, mode: i.mode ?? "relative", rest: i.rest ?? 0, sign: i.sign ?? 1, min: i.min ?? -180, max: i.max ?? 180, ...(i.sole != null ? { sole: i.sole } : {}) });
    const semDir = i.mode === undefined && i.rest === undefined ? `\nAVISO: sem mode/rest o osso nasce RELATIVO ao pai, com repouso 0° (aponta para baixo, na direção do pai) e pode ficar invisível atrás do corpo. Defina mode (absolute|relative), rest e sign para apontar onde você quer; use view bones=true para conferir.` : "";
    return { changed: true, text: `Osso "${i.name}" criado (filho de ${i.parent ?? "nada"}, ${i.length} px). Prenda arte a ele com rig_part.${semDir}` };
  },
});

const rigWalk = def({
  name: "rig_walk",
  description: [
    "Gera uma MARCHA com PÉS TRAVADOS NO CHÃO por IK de dois ossos: cada perna tem uma fase; quando apoiada, a sola fica PARADA no mundo (nada de pé que escorrega); no balanço o pé sobe em arco e avança. O corpo sobe e desce (bob), os braços balançam contra as pernas e, no quadrúpede, a cauda e a cabeça acompanham.",
    '`mode: "andar"`: a raiz avança (o personagem cruza o quadro). `mode: "no_lugar"`: a raiz fica parada e o CHÃO rola para trás; passe `scroll_layer` (uma camada com o chão/fundo desenhada no frame inicial) e a engine rola essa camada na mesma velocidade, sem deslize.',
    "A velocidade é ajustada para um número INTEIRO de px por frame (o chão rola em pixels inteiros, sem deslizar o pé); o `stride` pode ser corrigido um pouco e a resposta diz qual. Precisa dos frames criados (add_frames) e de um rig com pernas (humanoide ou quadrúpede). Velocidade = round(stride ÷ (apoio × frames por ciclo)) px por frame; ou escolha direto com `speed`. Mantenha as durações IGUAIS (o chão rola uma distância fixa por frame). Re-rodar é seguro: o chão é sempre rolado a partir do desenho do frame inicial.",
  ].join("\n"),
  schema: z.object({
    start: z.number().int().min(0).default(0).describe("primeiro frame"),
    frames: z.number().int().min(4).max(128).optional().describe("quantos frames (padrão: do start até o fim)"),
    cycles: z.number().int().min(1).max(8).default(1).describe("ciclos completos de marcha nesses frames"),
    stride: z.number().min(2).max(120).optional().describe("quanto o pé percorre no apoio, em px (padrão: ~55% do comprimento da perna)"),
    speed: z.number().int().min(1).max(12).optional().describe("velocidade em px INTEIROS por frame (anula o stride: o passo sai de velocidade × apoio × frames do ciclo). Use para escolher exatamente quanto o chão rola; o chão deve se repetir num divisor de velocidade × frames."),
    lift: z.number().min(0).max(60).optional().describe("altura do pé no balanço, em px"),
    bob: z.number().min(0).max(30).optional().describe("quanto o corpo sobe e desce, em px"),
    duty: z.number().min(0.3).max(0.9).optional().describe("fração do ciclo com o pé no chão (bípede ~0,55; quadrúpede ~0,72)"),
    mode: z.enum(["andar", "no_lugar"]).default("andar"),
    arm_swing: z.number().min(0).max(80).default(28).describe("balanço dos braços (humanoide), em graus"),
    lean: z.number().min(-20).max(30).default(3).describe("inclinação do tronco para a frente (humanoide)"),
    cabeca_reta: z.number().min(0).max(1).default(0).describe("0..1: quanto da inclinação do tronco a cabeça desfaz (0 = a cabeça inclina junto e fica curvada; 0.7–1 = cabeça de pé)"),
    x0: z.number().optional().describe("x inicial da raiz"),
    scroll_layer: z.string().optional().describe('com mode "no_lugar": camada do chão/fundo que a engine rola para trás, sem deslize, usando o conteúdo do frame `start`'),
    preview: previewFlag,
  }),
  run(p, i) {
    const rig = needRig(p);
    if (!rig.legs?.length) throw new Error("Este rig não tem pernas definidas para a marcha (o humanoide e o quadrúpede têm). Num esqueleto livre, informe `legs` em rig_create.");
    const N = i.frames ?? p.frames.length - i.start;
    if (N < 4 || i.start + N > p.frames.length) throw new Error(`A marcha precisa de ${Math.max(N, 4)} frame(s) a partir do ${i.start}, e o projeto tem ${p.frames.length}. Rode add_frames antes.`);
    const reach = Math.max(...rig.legs.map((l) => rig.bones.find((b) => b.name === l.upper)!.length + rig.bones.find((b) => b.name === l.lower)!.length));
    const duty = i.duty ?? (rig.legs.length >= 4 ? 0.72 : 0.55);
    const Nc = N / i.cycles;
    const stride0 = i.speed !== undefined ? i.speed * duty * Nc : i.stride ?? Math.max(3, Math.round(reach * 0.55));
    const speed = i.speed ?? Math.max(1, Math.round(stride0 / (duty * Nc)));
    const stride = speed * duty * Nc;
    const total = speed * (N - 1);
    const x0 = i.x0 ?? (i.mode === "andar" ? Math.round(rig.root.x - total / 2) : rig.root.x);
    const poses = walkPoses(rig, { frames: N, cycles: i.cycles, stride, lift: i.lift ?? Math.max(1, +(reach * 0.14).toFixed(1)), bob: i.bob ?? +(reach * 0.04).toFixed(1), duty, mode: i.mode, armSwing: i.arm_swing, lean: i.lean, headLevel: i.cabeca_reta, x0, speed });
    const warns = new Set<string>();
    poses.forEach((ps, k) => {
      const { angles, warnings } = clampAngles(rig, ps.angles);
      warnings.forEach((w) => warns.add(w));
      const full = Object.fromEntries(rig.bones.map((b) => [b.name, angles[b.name] ?? (b.min === b.max ? b.min : 0)]));
      p.frames[i.start + k].pose = { angles: full, root: ps.root };
    });
    rig.travel = { mode: i.mode, speed };
    let scrolled = "";
    if (i.mode === "no_lugar" && i.scroll_layer) {
      const layer = findLayer(p, i.scroll_layer);
      const base = new Uint8Array(getCel(p, i.start, layer.id));
      for (let k = 0; k < N; k++) {
        const cel = getCel(p, i.start + k, layer.id);
        cel.set(base);
        draw.shift({ width: p.width, height: p.height, data: cel }, -speed * k, 0, true);
      }
      const cyc = speed * N, validos = Array.from({ length: cyc }, (_, k) => k + 1).filter((d) => cyc % d === 0 && p.width % d === 0);
      scrolled = ` A camada "${layer.name}" foi rolada ${speed} px por frame para trás (com wrap na largura do canvas, ${p.width} px). Para o loop fechar sem emenda o desenho do chão deve se repetir a cada P px, com P divisor de ${cyc} (o ciclo) E de ${p.width} (o wrap): ${validos.length ? validos.join(", ") : "nenhum: mude a velocidade ou o número de frames, ou a largura do canvas"}.`;
    }
    const adj = Math.abs(stride - stride0) > 0.6 ? ` O stride foi ajustado de ${stride0} para ${stride.toFixed(1)} px para a velocidade ser inteira.` : "";
    const how = i.mode === "andar" ? `A raiz avança ${speed} px por frame (${total} px no total).` : `A raiz fica parada e o chão deve rolar ${speed} px por frame para trás.${scrolled || " Passe scroll_layer para a engine rolar uma camada de chão, ou desenhe o chão rolando você mesmo com transform shift wrap."}`;
    return { changed: true, text: `Marcha em ${N} frames (${i.cycles} ciclo(s), ${rig.legs.length} pernas, pés travados no chão por IK). ${how}${adj} Rode rig_bake.${warns.size ? `\nATENÇÃO (limites anatômicos): ${[...warns].slice(0, 4).join(" ")}` : ""}` };
  },
});

const shape = z.discriminatedUnion("type", [
  z.object({ type: z.literal("pixels"), points: z.array(z.union([z.array(z.number().int()).length(2), z.object({ x: z.number().int(), y: z.number().int() })])).min(1).max(4096).describe("Lista de [x, y] ou {x, y}"), color: colorRef }),
  z.object({ type: z.literal("line"), x1: z.number().int(), y1: z.number().int(), x2: z.number().int(), y2: z.number().int(), color: colorRef }),
  z.object({
    type: z.literal("rect"),
    x: z.number().int(),
    y: z.number().int(),
    w: z.number().int().min(1),
    h: z.number().int().min(1),
    color: colorRef,
    filled: z.boolean().default(true),
  }),
  z.object({
    type: z.literal("ellipse"),
    x: z.number().int(),
    y: z.number().int(),
    w: z.number().int().min(1),
    h: z.number().int().min(1),
    color: colorRef,
    filled: z.boolean().default(true),
  }).describe("Elipse inscrita na caixa (x, y, w, h)"),
  z.object({
    type: z.literal("blob"),
    x: z.number().int(),
    y: z.number().int(),
    w: z.number().int().min(3),
    h: z.number().int().min(3),
    outline: colorRef.describe("contorno de 1 px (um tom escuro do material, não preto puro)"),
    base: colorRef,
    light: colorRef.describe("lado voltado para a luz (cima-esquerda)"),
    shadow: colorRef.describe("lado oposto e embaixo"),
    highlight: colorRef.optional().describe("brilho de 1–2 px perto do canto da luz (opcional)"),
    squareness: z.number().min(2).max(6).default(2.4).describe("2 = elipse; 3–4 = bloco arredondado (slime, gota); 6 = quase retângulo"),
    anchor: z.enum(["corner", "center"]).default("corner").describe('"corner": x,y = canto superior esquerdo. "center": x,y = o CENTRO da forma (útil para centralizar e para animar o squash e o stretch mantendo o centro/base). w e h SEMPRE incluem o contorno.'),
  }).describe("Forma orgânica pronta: superelipse com contorno, luz de cima-esquerda e sombra embaixo/direita, sem pillow shading. Use para bolas, slimes, frutas, cabeças, pedras."),
  z.object({
    type: z.literal("capsule"),
    x1: z.number().int(), y1: z.number().int(), x2: z.number().int(), y2: z.number().int(),
    r1: z.number().min(0.5).max(40).describe("raio no ponto 1 (px)"),
    r2: z.number().min(0.5).max(40).optional().describe("raio no ponto 2 (padrão: igual ao r1)"),
    outline: colorRef, base: colorRef, light: colorRef, shadow: colorRef,
  }).describe("Segmento grosso (membro, tronco, cauda, antena) entre dois pontos, com raios, contorno escuro de 1 px e luz de cima-esquerda. Para braço, perna, rabo: não precisa escrever um gerador."),
  z.object({
    type: z.literal("gradient"),
    x: z.number().int(), y: z.number().int(), w: z.number().int().min(1), h: z.number().int().min(1),
    colors: z.array(colorRef).min(2).max(16).describe("rampa do início ao fim (vertical: de cima para baixo; horizontal: esquerda→direita; radial: do centro para fora)"),
    direction: z.enum(["vertical", "horizontal", "radial"]).default("vertical"),
    dither: z.enum(["bayer2", "bayer4", "bayer8", "nenhum"]).default("bayer4").describe("dithering ordenado de Bayer na transição entre tons (bayer4 é o padrão; bayer8 = transição mais longa e suave)"),
    suavidade: z.number().min(0.1).max(1).default(0.5).describe("largura da zona de dither dentro de cada passo da rampa: 0.3 = faixas sólidas com transição curta; 1 = degradê todo em dither"),
    ondas: z.number().min(0).max(12).default(0).describe("ondula a borda dos passos (px) para quebrar faixas retas (céu, água)"),
    only: colorRef.optional().describe("só pinta onde já há esta cor (textura num plano sem vazar)"),
    cx: z.number().optional(), cy: z.number().optional(), r: z.number().min(1).optional().describe("radial: centro e raio (padrão: centro da caixa, metade da maior dimensão)"),
  }).describe("DEGRADÊ com dithering de Bayer entre os tons de uma rampa (céu, água, brilho do sol, sombra de chão). Em pixel art, degradê é dither, não faixas retas."),
  z.object({
    type: z.literal("polygon"),
    points: z.array(z.array(z.number().int()).length(2)).min(3).max(1024).describe("vértices [x, y] em ordem"),
    color: colorRef,
  }).describe("Polígono preenchido (montanhas, colinas, telhados, folhas). Gere o contorno do terreno como lista de pontos, incluindo os cantos de baixo."),
  z.object({
    type: z.literal("scatter"),
    x: z.number().int(), y: z.number().int(), w: z.number().int().min(1), h: z.number().int().min(1),
    colors: z.array(colorRef).min(1).max(8).describe("cores sorteadas (repita uma para pesar)"),
    densidade: z.number().min(0.001).max(1).default(0.08).describe("fração da área coberta"),
    forma: z.enum(["pixel", "traco", "cruz", "tufo", "onda"]).default("pixel").describe("pixel: ponto; traco: 2 px na vertical; cruz: flor/estrela de 5 px; tufo: capim de 2–3 px; onda: risco horizontal de 2–6 px (água, brilho no lago)"),
    distancia: z.number().int().min(1).max(48).default(2).describe("distância mínima entre elementos (evita aglomerar e dá ritmo de textura)"),
    seed: z.number().int().default(1).describe("semente: mesmo valor = mesma textura (reprodutível); use sementes diferentes por plano"),
    variar_por_frame: z.boolean().default(false).describe("soma o índice do frame à semente: a textura muda a cada frame (brilho de água, cintilar de estrelas, chuva) com frames:\"all\" numa só chamada"),
    only: colorRef.optional().describe("só espalha sobre esta cor (grama só sobre o campo)"),
    ponta: colorRef.optional().describe("cor da ponta do tufo/traço/cruz (ex.: luz)"),
    evitar: z.array(z.string()).max(8).optional().describe("camadas onde NÃO espalhar: o elemento não cai onde estas camadas já têm arte (flores fora da casa)"),
  }).describe("TEXTURA espalhada com distância mínima (grama, estrelas, flores, pedras, folhas)."),
  z.object({
    type: z.literal("box3d"),
    x: z.number().int(), y: z.number().int().describe("canto inferior ESQUERDO da face da frente (y = chão)"),
    w: z.number().int().min(2), h: z.number().int().min(2),
    prof: z.number().int().describe("profundidade em px: > 0 mostra a lateral à direita, < 0 à esquerda"),
    xv: z.number().int().describe("x do ponto de fuga (no horizonte); as arestas em profundidade convergem para ele (use o mesmo do caminho/cerca da cena)"),
    yh: z.number().int().describe("y do horizonte (linha dos olhos)"),
    rise: z.number().int().min(0).default(0).describe("altura do telhado de duas águas (0 = teto plano)"),
    frente: colorRef.describe("parede da frente (ex.: na sombra se a luz vem da lateral)"),
    lado: colorRef.describe("parede lateral (a que recua)"),
    telhado: colorRef.optional().describe("água do telhado visível (padrão: cor da frente)"),
    empena: colorRef.optional().describe("triângulo da frente sob o telhado (padrão: cor da frente)"),
    linhas: colorRef.optional().describe("cor das tábuas/linhas das paredes, desenhadas em perspectiva"),
    linhas_telhado: colorRef.optional().describe("cor das fileiras de telhas"),
    espaco: z.number().int().min(2).max(12).default(3).describe("distância entre tábuas/telhas"),
  }).describe("CAIXA / CASA EM PERSPECTIVA de um ponto de fuga: frente + lateral que recua para o horizonte + telhado de duas águas, com tábuas e telhas em perspectiva. Coloque o ponto de fuga no mesmo horizonte do resto da cena (caminho, cerca) para a casa não ficar 'de frente' num mundo em perspectiva. Janelas/portas na lateral: use polygon com os pontos calculados na mesma projeção."),
  z.object({
    type: z.literal("curve"),
    points: z.array(z.array(z.number()).length(2)).min(2).max(64).describe("pontos [x, y] por onde a curva passa (spline suave)"),
    r1: z.number().min(0.5).max(40).describe("raio no início (px)"),
    r2: z.number().min(0.5).max(40).optional().describe("raio no fim (padrão: igual ao r1)"),
    color: colorRef,
  }).describe("CURVA de espessura variável (rabo, tentáculo, corda, cabelo, cobra): passa pelos pontos com raio de r1 a r2. Cor chapada; contorne depois com draw_rows contorno=seletivo ou transform outline mode=seletivo."),
  z.object({
    type: z.literal("terrain"),
    x: z.number().int().default(0), w: z.number().int().min(2).optional().describe("largura (padrão: o canvas inteiro)"),
    topo: z.number().int().describe("altura média da crista (y)"),
    amp: z.number().min(0).max(120).default(20).describe("variação da crista em px (montanha alta = 40+, colina suave = 8)"),
    rugosidade: z.number().min(0.2).max(0.9).default(0.55).describe("0.4 = suave, 0.7 = áspero"),
    seed: z.number().int().default(1),
    ate: z.number().int().describe("preenche da crista até esta linha y (o chão do plano)"),
    color: colorRef,
  }).describe("CRISTA DE TERRENO fractal (montanhas, colinas, dunas) já preenchida. Um por plano, com seeds e cores diferentes; depois use transform haze por plano."),
  z.object({
    type: z.literal("forest"),
    x: z.number().int().default(0), w: z.number().int().min(2).optional().describe("largura (padrão: o canvas inteiro)"),
    base: z.number().int().describe("linha y onde as árvores se assentam"),
    altura_min: z.number().int().min(3), altura_max: z.number().int().min(3),
    largura_min: z.number().int().min(2).default(5), largura_max: z.number().int().min(2).default(9),
    folga: z.number().min(0).max(0.8).default(0.25).describe("sobreposição entre árvores vizinhas (0 = lado a lado, 0.5 = bem juntas)"),
    seed: z.number().int().default(1),
    cores: z.array(colorRef).min(1).max(6).describe("tons sorteados por árvore (variação evita o efeito de carimbo)"),
    tipo: z.enum(["pinheiro", "redonda", "mista"]).default("pinheiro"),
  }).describe("BOSQUE: muitas árvores de alturas, larguras e tons variados numa linha de base (pinheiros em camadas ou copas redondas). Duas chamadas com bases e cores diferentes dão profundidade."),
  z.object({ type: z.literal("fill"), x: z.number().int(), y: z.number().int(), color: colorRef }).describe("Balde de tinta a partir de (x, y)"),
]);

interface BlobSpec { anchor?: "corner" | "center"; x: number; y: number; w: number; h: number; outline: string; base: string; light: string; shadow: string; highlight?: string; squareness: number }

/** Superelipse com contorno de 1 px e sombreamento direcional (luz de cima-esquerda): luz no quadrante da luz, sombra no oposto. */
function drawBlob(s: { width: number; height: number; data: Uint8Array }, b: BlobSpec, idx: (ref: string) => number): void {
  if (b.anchor === "center") { b = { ...b, x: Math.round(b.x - b.w / 2), y: Math.round(b.y - b.h / 2) }; }
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2, rx = b.w / 2, ry = b.h / 2;
  const inside = (x: number, y: number) => (Math.abs((x + 0.5 - cx) / rx)) ** b.squareness + (Math.abs((y + 0.5 - cy) / ry)) ** b.squareness <= 1;
  const set = (x: number, y: number, ref: string) => { if (x >= 0 && y >= 0 && x < s.width && y < s.height) s.data[y * s.width + x] = idx(ref); };
  const mask = new Set<number>();
  for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) if (inside(x, y)) mask.add(y * 10000 + x);
  const has = (x: number, y: number) => mask.has(y * 10000 + x);
  for (const k of mask) {
    const y = Math.floor(k / 10000), x = k % 10000;
    const edge = !has(x - 1, y) || !has(x + 1, y) || !has(x, y - 1) || !has(x, y + 1);
    if (edge) { set(x, y, b.outline); continue; }
    const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
    const len = Math.hypot(nx, ny) || 1;
    const facing = (-nx * 0.55 - ny * 0.65) / len;            // 1 = de frente para a luz, -1 = de costas
    const dist = Math.min(...[[-1, 0], [1, 0], [0, -1], [0, 1]].map(([dx, dy]) => { let d = 1; while (has(x + dx * d, y + dy * d) && d < 30) d++; return d; }));
    const dir = facing > 0.5 && dist <= 3 ? b.light : facing < -0.2 && dist <= 4 ? b.shadow : facing < -0.55 ? b.shadow : facing > 0.7 ? b.light : b.base;
    set(x, y, dir);
  }
  if (b.highlight) {
    const hx = Math.round(cx - rx * 0.42), hy = Math.round(cy - ry * 0.46);
    if (has(hx, hy)) set(hx, hy, b.highlight);
    if (has(hx + 1, hy) && b.w >= 8) set(hx + 1, hy, b.highlight);
  }
}

interface CapsuleSpec { x1: number; y1: number; x2: number; y2: number; r1: number; r2?: number; outline: string; base: string; light: string; shadow: string }

/** Segmento grosso entre dois pontos, com contorno de 1 px e sombreamento direcional (luz de cima-esquerda). */
function drawCapsule(s: { width: number; height: number; data: Uint8Array }, c: CapsuleSpec, idx: (ref: string) => number): void {
  const r2 = c.r2 ?? c.r1;
  const dx = c.x2 - c.x1, dy = c.y2 - c.y1, len2 = Math.max(1e-6, dx * dx + dy * dy), len = Math.sqrt(len2);
  let nx = -dy / (len || 1), ny = dx / (len || 1);
  const L = { x: -0.55, y: -0.65 };
  if (nx * L.x + ny * L.y < 0) { nx = -nx; ny = -ny; }
  const rmax = Math.max(c.r1, r2) + 2;
  const inside = (x: number, y: number) => {
    const px = x + 0.5 - (c.x1 + 0.5), py = y + 0.5 - (c.y1 + 0.5);
    const t = Math.max(0, Math.min(1, (px * dx + py * dy) / len2));
    return Math.hypot(px - dx * t, py - dy * t) <= c.r1 + (r2 - c.r1) * t;
  };
  const set = (x: number, y: number, ref: string) => { if (x >= 0 && y >= 0 && x < s.width && y < s.height) s.data[y * s.width + x] = idx(ref); };
  for (let y = Math.floor(Math.min(c.y1, c.y2) - rmax); y <= Math.ceil(Math.max(c.y1, c.y2) + rmax); y++) {
    for (let x = Math.floor(Math.min(c.x1, c.x2) - rmax); x <= Math.ceil(Math.max(c.x1, c.x2) + rmax); x++) {
      if (!inside(x, y)) continue;
      const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
      if (edge) { set(x, y, c.outline); continue; }
      const px = x + 0.5 - (c.x1 + 0.5), py = y + 0.5 - (c.y1 + 0.5);
      const t = Math.max(0, Math.min(1, (px * dx + py * dy) / len2));
      const r = c.r1 + (r2 - c.r1) * t;
      const sd = ((px - dx * t) * nx + (py - dy * t) * ny) / Math.max(r, 1e-6);
      set(x, y, sd > 0.3 ? c.light : sd < -0.3 ? c.shadow : c.base);
    }
  }
}

const drawShapes = def({
  name: "draw_shapes",
  description:
    "Desenha formas geométricas em sequência: pixels soltos, linhas, retângulos, elipses e balde de tinta. Bom para blocos grandes, fundos e efeitos; para detalhes finos prefira draw_rows.",
  schema: z.object({
    frames: framesSel.optional().describe("Padrão: frame 0"),
    layer: layerSel,
    shapes: z.array(shape).min(1).max(200),
    preview: previewFlag,
  }),
  run(p, i) {
    const layer = findLayer(p, i.layer);
    const list = resolveFrames(p, i.frames);
    const avisos: string[] = [];
    for (const f of list) {
      const s = { width: p.width, height: p.height, data: getCel(p, f, layer.id) };
      const onlyComposto = (cor: string) => { const flat = flattenFrame(p, f), idx = colorIndex(p, cor); return (x: number, y: number) => flat[y * p.width + x] === idx; };
      for (const sh of i.shapes) {
        const c = sh.type === "blob" || sh.type === "capsule" || sh.type === "gradient" || sh.type === "scatter" || sh.type === "box3d" || sh.type === "terrain" || sh.type === "forest" ? 0 : colorIndex(p, sh.color);
        switch (sh.type) {
          case "pixels":
            for (const pt of sh.points) { const [x, y] = Array.isArray(pt) ? pt : [pt.x, pt.y]; draw.setPixel(s, x!, y!, c); }
            break;
          case "line":
            draw.line(s, sh.x1, sh.y1, sh.x2, sh.y2, c);
            break;
          case "rect":
            draw.rect(s, sh.x, sh.y, sh.w, sh.h, c, sh.filled);
            break;
          case "ellipse":
            draw.ellipse(s, sh.x, sh.y, sh.w, sh.h, c, sh.filled);
            break;
          case "blob":
            drawBlob(s, sh, (ref) => colorIndex(p, ref));
            break;
          case "capsule":
            drawCapsule(s, sh, (ref) => colorIndex(p, ref));
            break;
          case "fill":
            draw.floodFill(s, sh.x, sh.y, c);
            break;
          case "box3d": {
            const ci = (k?: string) => (k === undefined ? 0 : colorIndex(p, k));
            if (sh.y - sh.h - sh.rise < 0) avisos.push(`box3d: o topo do telhado fica em y=${sh.y - sh.h - sh.rise}, fora do quadro. Lembre: y é a BASE (chão) da parede da frente, não o topo; o telhado sobe ${sh.h + sh.rise} px a partir dela.`);
            drawBox3d(s, { x: sh.x, y: sh.y, w: sh.w, h: sh.h, prof: sh.prof, xv: sh.xv, yh: sh.yh, rise: sh.rise, frente: ci(sh.frente), lado: ci(sh.lado), telhado: ci(sh.telhado ?? sh.frente), empena: ci(sh.empena ?? sh.frente), linhas: sh.linhas ? ci(sh.linhas) : undefined, linhasTelhado: sh.linhas_telhado ? ci(sh.linhas_telhado) : undefined, espaco: sh.espaco });
            break;
          }
          case "terrain":
            drawTerrain(s, { x: sh.x, w: sh.w ?? p.width - sh.x, topo: sh.topo, amp: sh.amp, rugosidade: sh.rugosidade, seed: sh.seed, ate: sh.ate, color: colorIndex(p, sh.color) });
            break;
          case "forest":
            if (!drawForest(s, { x: sh.x, w: sh.w ?? p.width - sh.x, base: sh.base, alturaMin: sh.altura_min, alturaMax: Math.max(sh.altura_min, sh.altura_max), larguraMin: sh.largura_min, larguraMax: Math.max(sh.largura_min, sh.largura_max), folga: sh.folga, seed: sh.seed, colors: sh.cores.map((k) => colorIndex(p, k)), tipo: sh.tipo })) avisos.push("forest não desenhou nenhuma árvore (largura 0?)");
            break;
          case "curve":
            drawCurve(s, sh.points as [number, number][], sh.r1, sh.r2 ?? sh.r1, c);
            break;
          case "polygon":
            fillPolygon(s, sh.points as [number, number][], c);
            break;
          case "gradient":
            if (drawGradient(s, { x: sh.x, y: sh.y, w: sh.w, h: sh.h, direction: sh.direction, colors: sh.colors.map((k) => colorIndex(p, k)), dither: sh.dither, suavidade: sh.suavidade, ondas: sh.ondas, only: sh.only ? colorIndex(p, sh.only) : 0, onlyAt: sh.only ? onlyComposto(sh.only) : undefined, cx: sh.cx, cy: sh.cy, r: sh.r }) === 0) avisos.push(`gradient em (${sh.x},${sh.y}) ${sh.w}x${sh.h} não pintou nada${sh.only ? `: a cor only=${sh.only} não está em nenhuma camada visível nessa área` : ""}.`);
            break;
          case "scatter":
            if (scatter(s, { x: sh.x, y: sh.y, w: sh.w, h: sh.h, colors: sh.colors.map((k) => colorIndex(p, k)), densidade: sh.densidade, forma: sh.forma, distancia: sh.distancia, seed: sh.seed + (sh.variar_por_frame ? f * 7919 : 0), only: sh.only ? colorIndex(p, sh.only) : 0, onlyAt: sh.only ? onlyComposto(sh.only) : undefined, ponta: sh.ponta ? colorIndex(p, sh.ponta) : undefined, blocked: sh.evitar?.length ? ((cels) => (x: number, y: number) => cels.some((c) => c[y * p.width + x] !== 0))(sh.evitar.map((n) => getCel(p, f, findLayer(p, n).id))) : undefined }) === 0) avisos.push(`scatter em (${sh.x},${sh.y}) ${sh.w}x${sh.h} não desenhou nenhum elemento${sh.only ? `: a cor only=${sh.only} não foi achada em nenhuma camada visível nessa área (confira a cor e se o plano já foi desenhado antes)` : sh.evitar ? ": evitar bloqueou a área toda" : " (densidade baixa demais?)"}.`);
            break;
        }
      }
    }
    const thick = Math.max(p.width, p.height) <= 48 && i.shapes.some((sh) => sh.type === "blob" || sh.type === "capsule") ? "\nAviso: blob/capsule geram contorno grosso e volumes inchados em canvas pequeno (≤ 48 px). Para sprites assim desenhe com draw_rows (pixel a pixel, contorno=seletivo) e use blob/capsule só em rascunho." : "";
    return result(p, `${i.shapes.length} forma(s) desenhada(s) em "${layer.name}", ${fmtList(list)}.${thick}${avisos.length ? `\nATENÇÃO: ${[...new Set(avisos)].slice(0, 4).join(" ")}` : ""}`, list, i.preview);
  },
});

const transform = def({
  name: "transform",
  description: [
    "Transforma o conteúdo de uma camada em um ou mais frames:",
    "- shift: move dx/dy pixels (wrap=true faz dar a volta; ótimo para nuvens, água, fundos em loop)",
    "- flip_horizontal / flip_vertical: espelha",
    "- replace_color: troca a cor `from` por `to`",
    "- outline: contorna automaticamente a silhueta com `color`; com mode=\"seletivo\" (sel-out) cada trecho usa um tom escuro do material vizinho, mais claro no lado da luz, em vez de um halo uniforme",
    "- shade: SOMBREAMENTO AUTOMÁTICO de arte chapada: cada região de cor única ganha o tom claro na borda de cima/esquerda e o tom de sombra na de baixo/direita (rampa com mudança de matiz, cores novas criadas na paleta). Desenhe chapado, aplique shade e depois retoque só os detalhes",
    "- reflect: REFLEXO NA ÁGUA: espelha as camadas `fonte` em torno da linha `y` para dentro de `alto` px abaixo, com ondulação horizontal, cor misturada à `agua` e esmaecendo por dithering com a distância; desenha na camada indicada (ponha-a ACIMA da água e ABAIXO dos brilhos do sol; ela é opaca onde reflete: use `dissolver` 0.2–0.4 para deixar a água aparecer)",
    "- haze: PERSPECTIVA ATMOSFÉRICA: mistura todas as cores da camada com a cor `color` (a cor do ar/horizonte) na `quantidade` dada: o que está longe fica mais claro, menos contrastado e mais perto da cor do céu. Aplique em cada plano com força crescente com a distância (montanhas do fundo 0.4, do meio 0.2, perto 0.05)",
    "- clean: limpa quinas em L do contorno `color` (pixel perfect): tira o pixel de ponta que engrossa a linha",
    "- rotate: gira `angle` graus (positivo = horário) em torno do pivô (cx, cy). Ótimo para braços, armas e objetos girando. Gire sempre a partir de uma cópia limpa (copy_layer_content) em vez de girar várias vezes o mesmo frame, para não acumular distorção.",
    "- center: centraliza o conteúdo da camada no canvas (axis: x, y ou both)",
    "- clear: apaga tudo",
  ].join("\n"),
  schema: z.object({
    frames: framesSel.optional().describe("Padrão: frame 0"),
    layer: layerSel,
    op: z.enum(["shift", "flip_horizontal", "flip_vertical", "replace_color", "outline", "shade", "clean", "reflect", "haze", "rotate", "center", "clear"]),
    axis: z.enum(["x", "y", "both"]).optional().describe("center: eixo a centralizar (padrão: both)"),
    angle: z.number().min(-360).max(360).optional().describe("rotate: graus, positivo = horário"),
    cx: z.number().optional().describe("rotate: pivô x (padrão: centro do canvas)"),
    cy: z.number().optional().describe("rotate: pivô y (padrão: centro do canvas)"),
    dx: z.number().int().optional(),
    dy: z.number().int().optional(),
    dx_lista: z.array(z.number().int()).optional().describe("shift: um deslocamento x POR frame, na ordem de `frames` (rabo/cabeça balançando sem reescrever o frame)"),
    dy_lista: z.array(z.number().int()).optional().describe("shift: um deslocamento y por frame, na ordem de `frames`"),
    wrap: z.boolean().optional(),
    from: colorRef.optional(),
    to: colorRef.optional(),
    color: colorRef.optional(),
    diagonal: z.boolean().optional().describe("outline: incluir diagonais"),
    mode: z.enum(["uniforme", "seletivo"]).optional().describe('outline: "seletivo" (sel-out) usa um tom escuro do material vizinho, mais claro no lado da luz, e não precisa de `color`'),
    luz: z.enum(["cima-esquerda", "cima", "cima-direita", "esquerda", "direita"]).optional().describe("shade: de onde vem a luz (padrão cima-esquerda; mantenha a MESMA em toda a arte)"),
    y_de: z.number().int().optional().describe("haze: primeira linha (y) afetada; omitido = o quadro todo"),
    y_ate: z.number().int().optional().describe("haze: última linha (y) afetada"),
    perfil: z.enum(["uniforme", "pico", "subindo", "descendo"]).optional().describe("haze com faixa: como a força varia de y_de a y_ate. pico = névoa suave que some nas bordas (faixa de neblina sobre o lago); subindo/descendo = rampa. A transição usa dithering, então não vira faixa dura"),
    dissolver: z.number().min(0).max(0.9).optional().describe("reflect: fração do reflexo que se dissolve por dithering para deixar a água aparecer (0 = opaco; 0.3 = reflexo translúcido)"),
    quantidade: z.number().min(0).max(1).optional().describe("haze: força da névoa (0.1 = sutil, 0.4 = longe, 0.6 = quase some no céu)"),
    fonte: z.array(z.string()).max(12).optional().describe("reflect: camadas a refletir (ex.: montanhas, floresta)"),
    y: z.number().int().optional().describe("reflect: linha do espelho (a margem da água): o que está acima dela aparece invertido abaixo"),
    alto: z.number().int().min(1).max(200).optional().describe("reflect: profundidade do reflexo em px"),
    onda: z.number().min(0).max(8).optional().describe("reflect: amplitude das ondulações horizontais em px (padrão 1.5; cresce com a distância)"),
    mistura: z.number().min(0).max(1).optional().describe("reflect: quanto o reflexo se mistura com a cor da água (padrão 0.45)"),
    agua: colorRef.optional().describe("reflect: cor da água para a mistura"),
    forma: z.enum(["borda", "volume"]).optional().describe("shade: \"borda\" (padrão) pinta só o rebordo de 1–3 px; \"volume\" dá um BLOCO claro do lado da luz e um de sombra do lado oposto em cada região (barriga, coxa, cabeça, folha), como uma esfera. Use volume em formas orgânicas médias/grandes; combine com borda depois se quiser o rebordo"),
    depth: z.number().int().min(1).max(3).optional().describe("shade: espessura da sombra em pixels (padrão 1; 2 para sprites maiores que 48 px)"),
    skip: z.array(colorRef).optional().describe("shade: cores de DETALHE (olhos, boca, listras): não são sombreadas e contam como parte da região vizinha, sem criar rebordos em volta delas. Contornos escuros já são pulados"),
    preview: previewFlag,
  }),
  run(p, i) {
    const layer = findLayer(p, i.layer);
    const list = resolveFrames(p, i.frames);
    for (const f of list) {
      const s = { width: p.width, height: p.height, data: getCel(p, f, layer.id) };
      switch (i.op) {
        case "shift":
          draw.shift(s, i.dx_lista ? (i.dx_lista[list.indexOf(f)] ?? 0) : (i.dx ?? 0), i.dy_lista ? (i.dy_lista[list.indexOf(f)] ?? 0) : (i.dy ?? 0), i.wrap ?? false);
          break;
        case "flip_horizontal":
          draw.flip(s, "horizontal");
          break;
        case "flip_vertical":
          draw.flip(s, "vertical");
          break;
        case "replace_color":
          if (i.from === undefined || i.to === undefined) throw new Error("replace_color precisa de `from` e `to`.");
          draw.replaceColor(s, colorIndex(p, i.from), colorIndex(p, i.to));
          break;
        case "outline":
          if (i.mode === "seletivo") {
            const occ = new Uint8Array(p.width * p.height);
            for (const l of p.layers) if (l.id !== layer.id && l.visible) { const c = getCel(p, f, l.id); for (let k = 0; k < c.length; k++) if (c[k]) occ[k] = 1; }
            selectiveOutline(s.data.slice(), s.data, p.width, p.height, (c, lit) => selOutIndex(p, c, lit), paletteLum(p), occ);
            break;
          }
          if (i.color === undefined) throw new Error("outline precisa de `color` (ou mode: \"seletivo\").");
          draw.outline(s, colorIndex(p, i.color), i.diagonal ?? false);
          break;
        case "shade": {
          const skipSet = new Set((i.skip ?? []).map((c) => colorIndex(p, c)));
          const count = i.forma === "volume"
            ? autoShadeVolume(s.data, p.width, p.height, (c) => (skipSet.has(c) ? null : shadeTones(p, c)), (c) => skipSet.has(c), i.luz)
            : autoShade(s.data, p.width, p.height, i.depth ?? 1, (c) => (skipSet.has(c) ? null : shadeTones(p, c)), (c) => skipSet.has(c), i.luz);
          if (!count) throw new Error("shade não mudou nada: a camada está vazia ou só tem contornos escuros/cores em `skip`.");
          break;
        }
        case "haze": {
          if (i.color === undefined || i.quantidade === undefined) throw new Error("haze precisa de `color` (cor da névoa) e `quantidade` (0..1).");
          const fog = p.palette[colorIndex(p, i.color) - 1].hex;
          const cache = new Map<string, number>();
          const y0 = i.y_de ?? 0, y1 = i.y_ate ?? p.height - 1, LV = 4;
          const M4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
          const perfil = i.perfil ?? "uniforme";
          for (let k = 0; k < s.data.length; k++) {
            const c = s.data[k];
            if (!c) continue;
            const x = k % p.width, y = (k - x) / p.width;
            if (y < y0 || y > y1) continue;
            const t = y1 > y0 ? (y - y0) / (y1 - y0) : 0.5;
            const fator = perfil === "pico" ? 1 - Math.abs(2 * t - 1) : perfil === "subindo" ? t : perfil === "descendo" ? 1 - t : 1;
            const exato = fator * LV, base = Math.floor(exato), frac = exato - base;
            const lvl = perfil === "uniforme" ? LV : Math.min(LV, base + (frac > (M4[y % 4][x % 4] + 0.5) / 16 ? 1 : 0));
            if (lvl <= 0) continue;
            const key = `${c}:${lvl}`;
            let m = cache.get(key);
            if (!m) { const q = Math.round(i.quantidade * (lvl / LV) * 100); m = ensureColor(p, mix(p.palette[c - 1].hex, fog, i.quantidade * (lvl / LV)), `${p.palette[c - 1].name.replace(/-nevoa\d+$/, "")}-nevoa${q}`); cache.set(key, m); }
            s.data[k] = m;
          }
          break;
        }
        case "reflect": {
          if (!i.fonte?.length || i.y === undefined || !i.alto) throw new Error("reflect precisa de `fonte` (camadas), `y` (linha do espelho) e `alto` (profundidade).");
          const src = new Uint8Array(p.width * p.height);
          for (const n of i.fonte) { const c = getCel(p, f, findLayer(p, n).id); for (let k = 0; k < c.length; k++) if (c[k]) src[k] = c[k]; }
          const water = i.agua !== undefined ? colorIndex(p, i.agua) : 0;
          const wHex = water ? p.palette[water - 1].hex : "#3a2a5a";
          const amp = i.onda ?? 1.5, mixAmt = i.mistura ?? 0.45;
          const tone = new Map<string, number>();
          const M4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
          for (let dy = 0; dy < i.alto; dy++) {
            const y = i.y + dy, sy = i.y - 1 - dy;
            if (y >= p.height || sy < 0) break;
            const fade = dy / i.alto;
            const shift = dy % 4 === 3 ? 0 : Math.round(Math.sin(dy * 1.3) * amp * (0.5 + fade));   // linhas de ondulação em faixas, com trechos retos
            for (let x = 0; x < p.width; x++) {
              const c = src[sy * p.width + (x - shift + p.width) % p.width];
              if (!c) continue;
              if (i.dissolver && (M4[y % 4][x % 4] + 0.5) / 16 < i.dissolver) continue;                // reflexo translúcido: deixa a água aparecer
              if (fade > 0.7 && (M4[y % 4][x % 4] + 0.5) / 16 < (fade - 0.7) / 0.3) continue;   // só o final do reflexo se dissolve (dithering); antes é sólido
              const lvl = Math.min(2, Math.floor(fade * 3));
              const key = `${c}:${lvl}`;
              let idx = tone.get(key);
              if (!idx) { idx = ensureColor(p, mix(p.palette[c - 1].hex, wHex, Math.min(0.92, mixAmt + lvl * 0.14)), `reflexo-${p.palette[c - 1].name}${lvl}`); tone.set(key, idx); }
              s.data[y * p.width + x] = idx;
            }
          }
          break;
        }
        case "clean":
          if (i.color === undefined) throw new Error("clean precisa de `color` (a cor do contorno).");
          cleanCorners(s.data, p.width, p.height, colorIndex(p, i.color));
          break;
        case "rotate":
          if (i.angle === undefined) throw new Error("rotate precisa de `angle`.");
          draw.rotate(s, i.angle, i.cx ?? p.width / 2, i.cy ?? p.height / 2);
          break;
        case "center": {
          let x0 = p.width, x1 = -1, y0 = p.height, y1 = -1;
          for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) if (s.data[y * p.width + x]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
          if (x1 < 0) break;
          const axis = i.axis ?? "both";
          const dx = axis === "y" ? 0 : Math.floor((p.width - (x1 - x0 + 1)) / 2) - x0;
          const dy = axis === "x" ? 0 : Math.floor((p.height - (y1 - y0 + 1)) / 2) - y0;
          draw.shift(s, dx, dy, false);
          break;
        }
        case "clear":
          s.data.fill(0);
          break;
      }
    }
    return result(p, `${i.op} aplicado em "${layer.name}", ${fmtList(list)}.`, list, i.preview);
  },
});

const reduceColors = def({
  name: "reduce_colors",
  description: "QUANTIZA a paleta para no máximo `cores`: funde repetidamente as duas cores mais parecidas (ponderado pelo uso: cores raras somem primeiro no tom mais próximo), remapeia todos os pixels de todos os frames e camadas e remove as entradas sem uso. Use quando o sombreamento/névoa/reflexo automáticos inflaram a paleta, ou para atender um limite de estilo (ex.: 16 cores retrô, 48–64 numa cena). Não troca matizes: só junta tons vizinhos.",
  schema: z.object({
    cores: z.number().int().min(2).max(255),
    proteger: z.array(colorRef).optional().describe("cores que NUNCA são fundidas (ex.: contorno, olhos, o brilho do sol)"),
  }),
  run(p, i) {
    const n = p.palette.length;
    const usage = new Array(n + 1).fill(0);
    for (const f of p.frames) for (const cel of Object.values(f.cels)) for (const v of cel) if (v) usage[v]++;
    const keep = new Set((i.proteger ?? []).map((c) => colorIndex(p, c)));
    const rgb = p.palette.map((c) => hexToRgb(c.hex));
    const alive = new Set<number>();
    for (let k = 1; k <= n; k++) if (usage[k] > 0) alive.add(k);
    const target = new Map<number, number>();
    const root = (k: number): number => { let r = k; while (target.has(r)) r = target.get(r)!; return r; };
    const before = alive.size;
    while (alive.size > i.cores) {
      let best: [number, number, number] | null = null;
      const list = [...alive];
      for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
        const x = list[a], y = list[b];
        if (keep.has(x) && keep.has(y)) continue;
        const d = (rgb[x - 1][0] - rgb[y - 1][0]) ** 2 + (rgb[x - 1][1] - rgb[y - 1][1]) ** 2 + (rgb[x - 1][2] - rgb[y - 1][2]) ** 2;
        const cost = d * (usage[x] * usage[y]) / (usage[x] + usage[y]);
        if (!best || cost < best[0]) best = [cost, x, y];
      }
      if (!best) break;
      let [, x, y] = best;
      // a cor protegida ou mais usada fica; a outra é fundida nela
      if (keep.has(x) || (!keep.has(y) && usage[x] >= usage[y])) { /* x fica */ } else [x, y] = [y, x];
      target.set(y, x); usage[x] += usage[y]; alive.delete(y);
    }
    const remap = new Uint8Array(n + 1);
    const kept: Project["palette"] = [];
    for (let k = 1; k <= n; k++) if (alive.has(k)) { kept.push(p.palette[k - 1]); remap[k] = kept.length; }
    for (let k = 1; k <= n; k++) if (!alive.has(k)) remap[k] = usage[k] > 0 || target.has(k) ? remap[root(k)] || 0 : 0;
    for (const f of p.frames) for (const cel of Object.values(f.cels)) for (let k = 0; k < cel.length; k++) if (cel[k]) cel[k] = remap[cel[k]];
    p.palette = kept;
    const semUso = n - before;
    return { changed: true, text: before <= i.cores ? `A paleta já está dentro do limite: ${before} cor(es) em uso (limite ${i.cores}); removi ${semUso} entrada(s) sem uso. Total agora ${kept.length}.` : `Paleta reduzida de ${before} (em uso) para ${kept.length} cores (removi também ${semUso} entrada(s) sem uso).` };
  },
});

const inspecionar = def({
  name: "inspecionar",
  description: [
    "DESCRIÇÃO ESTRUTURADA do quadro em palavras e números (um segundo canal além da imagem): quais regiões de cor existem e onde (nome da cor, % da área, caixa x/y, centro), a caixa de cada camada e as cores mais usadas.",
    "Use para conferir o que a imagem mostra sem depender de contar pixels: 'o céu ocupa y0..100?', 'a casa está em x62..122?', 'o que está no terço de cima?'. Funciona em qualquer tamanho de canvas.",
  ].join("\n"),
  schema: z.object({
    frames: framesSel.optional().describe("Padrão: frame 0"),
    minimo: z.number().min(0.05).max(20).default(0.6).describe("Tamanho mínimo de uma região listada, em % do quadro"),
  }),
  run(p, i) {
    const f = resolveFrames(p, i.frames)[0];
    const flat = flattenFrame(p, f), W = p.width, H = p.height, N = W * H;
    const lum = (idx: number) => { const [r, g, b] = hexToRgb(p.palette[idx - 1].hex); return 0.3 * r + 0.59 * g + 0.11 * b; };
    const out: string[] = [`Frame ${f}: ${W}x${H} px.`];
    // regiões conexas por cor
    const seen = new Uint8Array(N), regions: { c: number; n: number; x0: number; x1: number; y0: number; y1: number; sx: number; sy: number }[] = [];
    for (let st = 0; st < N; st++) {
      if (seen[st] || !flat[st]) continue;
      const c = flat[st], stack = [st]; seen[st] = 1;
      const r = { c, n: 0, x0: W, x1: -1, y0: H, y1: -1, sx: 0, sy: 0 };
      while (stack.length) {
        const k = stack.pop()!; const x = k % W, y = (k - x) / W;
        r.n++; r.sx += x; r.sy += y; r.x0 = Math.min(r.x0, x); r.x1 = Math.max(r.x1, x); r.y0 = Math.min(r.y0, y); r.y1 = Math.max(r.y1, y);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const q = yy * W + xx; if (!seen[q] && flat[q] === c) { seen[q] = 1; stack.push(q); } }
      }
      regions.push(r);
    }
    const big = regions.filter((r) => (r.n / N) * 100 >= i.minimo).sort((a, b) => b.n - a.n).slice(0, 24);
    out.push(`\nRegiões de cor única (≥ ${i.minimo}% do quadro), da maior para a menor:`);
    for (const r of big) out.push(`- ${p.palette[r.c - 1].name} (${p.palette[r.c - 1].key}, ${p.palette[r.c - 1].hex}): ${((r.n / N) * 100).toFixed(1)}%  caixa x${r.x0}..${r.x1} y${r.y0}..${r.y1}  centro (${Math.round(r.sx / r.n)}, ${Math.round(r.sy / r.n)})`);
    if (!big.length) out.push("- (nenhuma: a imagem é toda textura/dither; use um mínimo menor)");
    const covered = flat.reduce((n, v) => n + (v ? 1 : 0), 0);
    out.push(`\nCobertura: ${((covered / N) * 100).toFixed(1)}% do quadro tem pixel (o resto é transparente).`);
    // camadas
    out.push("\nCamadas (baixo→cima), caixa do conteúdo neste frame:");
    for (const l of p.layers) {
      const cel = p.frames[f].cels[l.id]; let x0 = W, x1 = -1, y0 = H, y1 = -1, n = 0;
      if (cel) for (let k = 0; k < N; k++) if (cel[k]) { n++; const x = k % W, y = (k - x) / W; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      out.push(`- ${l.name}${l.visible ? "" : " (oculta)"}: ${n ? `${n} px, caixa x${x0}..${x1} y${y0}..${y1}` : "vazia"}`);
    }
    // cores mais usadas
    const cnt = new Map<number, number>(); for (const v of flat) if (v) cnt.set(v, (cnt.get(v) ?? 0) + 1);
    out.push("\nCores mais usadas: " + [...cnt].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([c, n]) => `${p.palette[c - 1].name} ${((n / N) * 100).toFixed(1)}%`).join(", ") + ".");
    return { changed: false, text: out.join("\n") };
  },
});

const batch = def({
  name: "batch",
  description: [
    "Executa VÁRIOS comandos de uma vez (como o script da cena 320x180) e devolve UMA imagem final + a nota do avaliar em uma linha. É o jeito mais barato de fazer uma etapa inteira: em vez de uma imagem por traço, uma por etapa.",
    "É atômico: se um comando falhar, nada é aplicado e a resposta diz qual (índice) e por quê. Os comandos do lote rodam sem prévia (preview:false automático). Não aninhe batch nem use export.",
  ].join("\n"),
  schema: z.object({
    comandos: z.array(z.object({ name: z.string(), input: z.record(z.string(), z.unknown()).optional() })).min(1).max(300).describe('Lista de {"name": "draw_shapes", "input": {...}} na ordem de execução'),
    frame: z.number().int().min(0).default(0).describe("Frame mostrado na imagem final"),
    nota: z.boolean().default(true).describe("Acrescenta a nota do avaliar (uma linha) ao final"),
    preview: previewFlag,
  }),
  run(p, i) {
    const lines: string[] = [];
    for (const [n, c] of i.comandos.entries()) {
      if (["batch", "export"].includes(c.name)) throw new Error(`comando #${n}: "${c.name}" não pode ir dentro de um batch.`);
      const cmd = byName.get(c.name);
      const hasPreview = !!cmd && "shape" in cmd.schema && !!(cmd.schema as unknown as { shape: Record<string, unknown> }).shape.preview;
      const r = runCommand(p, c.name, hasPreview ? { ...(c.input ?? {}), preview: false } : (c.input ?? {}));
      if (!r.ok) throw new Error(`comando #${n} (${c.name}) falhou, nada foi aplicado: ${r.text.split("\n")[0]}`);
      lines.push(`#${n} ${c.name}: ${r.text.split("\n")[0].slice(0, 90)}`);
    }
    const shown = lines.length > 8 ? [...lines.slice(0, 4), `... (${lines.length - 8} comandos omitidos)`, ...lines.slice(-4)] : lines;
    const summary = `${i.comandos.length} comando(s) aplicados:\n${shown.join("\n")}${i.nota ? `\nNota: ${evaluateBeauty(p, [Math.min(i.frame, p.frames.length - 1)]).score}/100 (rode avaliar para os achados)` : ""}`;
    return result(p, summary, [Math.min(i.frame, p.frames.length - 1)], i.preview);
  },
});

const PAISAGENS: Record<"por-do-sol" | "amanhecer" | "dia" | "noite", { ceu: string[]; sol: string[]; planos: string[]; floresta: string[]; agua: string[]; capim: string[]; flores: string[]; nuvem: string[]; estrelas: boolean }> = {
  "por-do-sol": { ceu: ["#2b1b4a", "#4a2a6a", "#7a3a82", "#b04a86", "#e0627a", "#f58a5a", "#fdb561", "#ffe08a"], sol: ["#fff6c0", "#ffe08a", "#fdb561"], planos: ["#9b6577", "#704d71", "#423560", "#2f2a50"], floresta: ["#2c4a5c", "#1d3a46", "#14303a"], agua: ["#ffe08a", "#fdb561", "#f58a5a", "#e0627a", "#b04a86", "#7a3a82", "#4a2a6a"], capim: ["#234a32", "#2f6440", "#3f7a46", "#58944c"], flores: ["#ff7aa8", "#fff0a0", "#c0a0ff"], nuvem: ["#6a3a8a", "#c4607e", "#f4905e", "#ffd08a"], estrelas: true },
  amanhecer: { ceu: ["#1f2a4a", "#3a4a7a", "#6a7aa8", "#a8a0b8", "#f0b8a0", "#ffd0a0", "#ffe8b8", "#fff4d0"], sol: ["#fffbe0", "#fff0b0", "#ffd890"], planos: ["#b8a0b0", "#8a8aa8", "#566888", "#3a4c68"], floresta: ["#3a5a58", "#2a4a4a", "#1f3a3a"], agua: ["#fff4d0", "#ffe8b8", "#f0c8a8", "#c8a8b0", "#8a8aa8", "#566888", "#3a4c68"], capim: ["#2a5a3a", "#3a7a48", "#58985a", "#7ab868"], flores: ["#ffffff", "#ffd0e0", "#fff0a0"], nuvem: ["#7a8ab0", "#c8a8b8", "#ffc8a8", "#fff0d0"], estrelas: true },
  dia: { ceu: ["#3a78c8", "#4a90d8", "#68a8e0", "#88c0e8", "#a8d4f0", "#c0e0f4", "#d8eefc", "#eaf6ff"], sol: ["#fffde8", "#fff6b0", "#ffe880"], planos: ["#a8c0d8", "#7898b8", "#4a6a90", "#35506e"], floresta: ["#2f6a48", "#25583c", "#1a4430"], agua: ["#eaf6ff", "#c0e0f4", "#88c0e8", "#4a90d8", "#3a78c8", "#2f62a8", "#264e88"], capim: ["#2a6a38", "#3a8a48", "#58a858", "#80c870"], flores: ["#ff7aa8", "#fff0a0", "#ffffff"], nuvem: ["#b8d0e8", "#e0eef8", "#ffffff", "#ffffff"], estrelas: false },
  noite: { ceu: ["#0a0e24", "#101838", "#1a2450", "#243060", "#2e3a70", "#3a4a80", "#4a5a90", "#5a6aa0"], sol: ["#fffbe0", "#e8ecff", "#b0b8e0"], planos: ["#3a4a78", "#2a3868", "#1e2a54", "#141e40"], floresta: ["#16264a", "#101c3a", "#0a1430"], agua: ["#5a6aa0", "#4a5a90", "#3a4a80", "#2e3a70", "#243060", "#1a2450", "#101838"], capim: ["#102a24", "#18382c", "#20483a", "#2c5a48"], flores: ["#a8b8ff", "#fff0c0", "#d0a0ff"], nuvem: ["#1a2450", "#2e3a70", "#4a5a90", "#7a88b8"], estrelas: true },
};

const paisagem = def({
  name: "paisagem",
  description: [
    "PAISAGEM COMPLETA numa chamada (o atalho da receita de cenário): céu com degradê em dither, sol/lua com brilho que se dissolve, estrelas e nuvens, 2–4 planos de terreno fractal com perspectiva atmosférica, bosque, lago com reflexo e ondas e campo com capim e flores. Quatro horários: por-do-sol, amanhecer, dia, noite.",
    "Cria (ou refaz) as camadas ceu, estrelas, nuvens, plano1..N, floresta, lago, reflexo e campo no frame 0 (ordem do fundo para a frente). Depois retoque à mão (casa, personagem, primeiro plano), rode `avaliar tipo=cena` e `reduce_colors`. Não acrescente personagens.",
  ].join("\n"),
  schema: z.object({
    horario: z.enum(["por-do-sol", "amanhecer", "dia", "noite"]).default("por-do-sol"),
    planos: z.number().int().min(2).max(4).default(3).describe("quantos planos de montanha/colina (do mais longe, claro e rosado, ao mais perto, escuro)"),
    horizonte: z.number().min(0.3).max(0.75).default(0.55).describe("altura do horizonte como fração do quadro (0.55 = pouco abaixo do meio)"),
    lago: z.boolean().default(true),
    floresta: z.boolean().default(true),
    campo: z.boolean().default(true).describe("capim e flores no primeiro plano"),
    sol: z.boolean().default(true).describe("sol (ou lua, à noite) com brilho que se dissolve no céu"),
    seed: z.number().int().default(1).describe("muda terrenos, árvores, flores e nuvens"),
    preview: previewFlag,
  }),
  run(p, i) {
    const W = p.width, H = p.height;
    if (W < 48 || H < 32) throw new Error("A paisagem pede um canvas de pelo menos 48x32 (ideal 160x90 ou 320x180).");
    const P = PAISAGENS[i.horario];
    const HZ = Math.round(H * i.horizonte), LAGO = i.lago ? Math.max(8, Math.round(H * 0.2)) : 0;
    const col = (hex: string, nome: string) => ensureColor(p, hex, nome);
    const names = ["ceu", "estrelas", "nuvens", ...Array.from({ length: i.planos }, (_, k) => `plano${k + 1}`), ...(i.floresta ? ["floresta"] : []), ...(i.lago ? ["lago", "reflexo"] : []), ...(i.campo ? ["campo"] : [])];
    // ordem de baixo para cima: ceu, estrelas, nuvens, planos (longe→perto), lago, reflexo, floresta, campo
    const order = ["ceu", "estrelas", "nuvens", ...Array.from({ length: i.planos }, (_, k) => `plano${k + 1}`), ...(i.lago ? ["lago", "reflexo"] : []), ...(i.floresta ? ["floresta"] : []), ...(i.campo ? ["campo"] : [])];
    void names;
    const layerOf = (nome: string) => {
      let l = p.layers.find((x) => x.name === nome);
      if (!l) { if (p.layers.length >= MAX_LAYERS) throw new Error(`Máximo de ${MAX_LAYERS} camadas.`); l = { id: newId("L"), name: nome, visible: true }; p.layers.push(l); for (const fr of p.frames) fr.cels[l.id] = new Uint8Array(W * H); }
      getCel(p, 0, l.id).fill(0);
      return l;
    };
    const lay = new Map(order.map((n) => [n, layerOf(n)]));
    const surf = (n: string) => ({ width: W, height: H, data: getCel(p, 0, lay.get(n)!.id) });
    // reordena: camadas da paisagem na ordem certa, atrás de qualquer camada que já existisse antes (ex.: personagem)
    const outras = p.layers.filter((l) => !order.includes(l.name));
    p.layers = [...order.map((n) => lay.get(n)!), ...outras];
    const ceu = P.ceu.map((h, k) => col(h, `ceu${k}`));
    // céu
    drawGradient(surf("ceu"), { x: 0, y: 0, w: W, h: HZ + 1, direction: "vertical", colors: ceu, dither: "bayer4", suavidade: 0.75, ondas: 2 });
    const sunX = Math.round(W * (0.45 + 0.2 * ((i.seed * 37) % 10) / 10)), sunR = Math.round(Math.max(14, H * 0.28));
    if (i.sol) drawGradient(surf("ceu"), { x: sunX - sunR - 4, y: HZ - Math.round(H * 0.1) - sunR - 2, w: sunR * 2 + 8, h: sunR * 2 + 4, direction: "radial", cx: sunX, cy: HZ - Math.round(H * 0.1), r: sunR, colors: [col(P.sol[0], "sol0"), col(P.sol[0], "sol0"), col(P.sol[1], "sol1"), col(P.sol[2], "sol2"), 0], dither: "bayer4", suavidade: 0.8, onlyAt: undefined });
    if (P.estrelas) {
      const star = col(i.horario === "noite" ? "#e8ecff" : "#fff0c8", "estrela");
      scatter(surf("estrelas"), { x: 0, y: 0, w: W, h: Math.round(HZ * (i.horario === "noite" ? 0.85 : 0.5)), colors: [star], densidade: i.horario === "noite" ? 0.014 : 0.008, forma: "pixel", distancia: 5, seed: i.seed * 3 + 1 });
      scatter(surf("estrelas"), { x: 0, y: 0, w: W, h: Math.round(HZ * 0.45), colors: [star], densidade: 0.0035, forma: "cruz", distancia: 16, seed: i.seed * 3 + 2 });
    }
    // nuvens iluminadas por baixo (massa + gradiente vertical limitado à massa)
    const nuv = P.nuvem.map((h, k) => col(h, `nuvem${k}`));
    const rnd = (k: number) => { const t = Math.sin((i.seed + 1) * 9301 + k * 49297) * 233280; return t - Math.floor(t); };
    for (let k = 0; k < Math.max(2, Math.round(W / 90)); k++) {
      const cw = Math.round(W * (0.14 + rnd(k) * 0.16)), ch = Math.max(5, Math.round(H * (0.05 + rnd(k + 9) * 0.04))), cx0 = Math.round(rnd(k + 3) * (W - cw)), cy0 = Math.round(HZ * (0.12 + rnd(k + 5) * 0.4));
      const sN = surf("nuvens");
      for (let b = 0; b < 5; b++) draw.ellipse(sN, cx0 + Math.round(rnd(k * 7 + b) * cw * 0.5), cy0 + Math.round(rnd(k * 5 + b) * ch * 0.4), Math.round(cw * (0.35 + rnd(k + b) * 0.3)), Math.round(ch * (0.55 + rnd(b + 2) * 0.4)), nuv[1], true);
      draw.ellipse(sN, cx0, cy0 + Math.round(ch * 0.35), cw, Math.round(ch * 0.5), nuv[1], true);
      drawGradient(sN, { x: cx0 - 2, y: cy0 - 2, w: cw + cw, h: ch + 6, direction: "vertical", colors: nuv, dither: "bayer4", suavidade: 0.6, only: nuv[1] });
    }
    // planos de terreno: longe (claro, névoa) → perto (escuro)
    for (let k = 0; k < i.planos; k++) {
      const f = k / Math.max(1, i.planos - 1);
      drawTerrain(surf(`plano${k + 1}`), { x: 0, w: W, topo: Math.round(HZ - H * (0.2 - 0.14 * f)), amp: Math.round(H * (0.19 - 0.11 * f)), rugosidade: 0.55, seed: i.seed * 11 + k * 5 + 3, ate: HZ, color: col(P.planos[Math.min(P.planos.length - 1, Math.round(f * (P.planos.length - 1)))], `plano${k + 1}`) });
    }
    // lago: reflexo do céu, brilho do sol, ondas
    if (i.lago) {
      const agua = P.agua.map((h, k) => col(h, `agua${k}`));
      const sL = surf("lago");
      drawGradient(sL, { x: 0, y: HZ, w: W, h: LAGO, direction: "vertical", colors: agua, dither: "bayer4", suavidade: 0.6 });
      if (i.sol) drawGradient(sL, { x: sunX - sunR, y: HZ, w: sunR * 2, h: LAGO, direction: "radial", cx: sunX, cy: HZ, r: Math.round(LAGO * 1.1), colors: [col(P.sol[0], "sol0"), col(P.sol[1], "sol1"), 0], dither: "bayer4", suavidade: 0.8 });
      scatter(sL, { x: 0, y: HZ + 2, w: W, h: LAGO - 3, colors: [agua[1], agua[2]], densidade: 0.045, forma: "onda", distancia: 3, seed: i.seed + 20 });
      if (i.sol) scatter(sL, { x: sunX - sunR, y: HZ + 2, w: sunR * 2, h: LAGO - 3, colors: [col(P.sol[0], "sol0"), col(P.sol[1], "sol1")], densidade: 0.09, forma: "onda", distancia: 2, seed: i.seed + 31 });
    }
    // bosque (duas linhas: perto e longe), sobre a margem
    if (i.floresta) {
      const fc = P.floresta.map((h, k) => col(h, `floresta${k}`));
      drawForest(surf("floresta"), { x: Math.round(W * 0.5), w: Math.round(W * 0.5), base: HZ + 2, alturaMin: Math.round(H * 0.1), alturaMax: Math.round(H * 0.22), larguraMin: 5, larguraMax: 9, folga: 0.3, seed: i.seed * 7 + 1, colors: [fc[0], fc[1]], tipo: "pinheiro" });
      drawForest(surf("floresta"), { x: Math.round(W * 0.46), w: Math.round(W * 0.54), base: HZ + 4, alturaMin: Math.round(H * 0.18), alturaMax: Math.round(H * 0.34), larguraMin: 7, larguraMax: 12, folga: 0.25, seed: i.seed * 7 + 2, colors: [fc[1], fc[2]], tipo: "mista" });
    }
    // reflexo do bosque e dos planos mais próximos
    if (i.lago) {
      const fonte = [`plano${i.planos}`, ...(i.floresta ? ["floresta"] : [])];
      const r = runCommand(p, "transform", { frames: 0, layer: "reflexo", op: "reflect", fonte, y: HZ + 1, alto: Math.min(LAGO - 2, Math.round(H * 0.16)), onda: 1.4, mistura: 0.55, dissolver: 0.15, agua: p.palette[col(P.agua[3], "agua3") - 1].key, preview: false });
      if (!r.ok) throw new Error(r.text);
    }
    // campo: capim em degradê, tufos e flores
    if (i.campo) {
      const cap = P.capim.map((h, k) => col(h, `capim${k}`)), fl = P.flores.map((h, k) => col(h, `flor${k}`));
      const y0 = HZ + LAGO, sC = surf("campo");
      drawGradient(sC, { x: 0, y: y0, w: W, h: H - y0, direction: "vertical", colors: [cap[0], cap[1], cap[2], cap[3]], dither: "bayer4", suavidade: 0.6, ondas: 2 });
      scatter(sC, { x: 0, y: y0 + 2, w: W, h: H - y0 - 2, colors: [cap[3], cap[2]], densidade: 0.07, forma: "tufo", distancia: 3, seed: i.seed + 40, ponta: cap[3] });
      scatter(sC, { x: 0, y: y0 + 3, w: W, h: H - y0 - 3, colors: fl, densidade: 0.008, forma: "cruz", distancia: 7, seed: i.seed + 50 });
    }
    return result(p, `Paisagem "${i.horario}" criada em ${order.length} camadas (${W}x${H}, horizonte y=${HZ}${i.lago ? `, lago até y=${HZ + LAGO}` : ""}). Retoque à mão por cima, rode avaliar tipo=cena e reduce_colors.`, [0], i.preview);
  },
});

const avaliar = def({
  name: "avaliar",
  description: [
    "AVALIAÇÃO DE BELEZA: olha a arte como um diretor de arte e dá nota 0–100 em quatro categorias, com achados acionáveis (cada um diz o comando que conserta):",
    "- Paradigmas da pixel art: pixel solto, furo, serrilhado, banding, pillow shading, ruído, contorno claro, luz inconsistente.",
    "- Cor e harmonia: preto puro, matiz monótono, sombra sem mudança de matiz, contraste baixo, arte chapada (sem luz/sombra), cores quase iguais.",
    "- Forma e contorno: quinas quadradas, contorno que some em trechos.",
    "- Composição: figura cortada nas bordas, fora do centro, pequena demais no quadro.",
    "Use depois de desenhar e antes de entregar; `polish` corrige sozinho o que é mecânico. É heurístico: ignore o que for intencional.",
  ].join("\n"),
  schema: z.object({
    frames: framesSel.optional().describe('Padrão: "all"'),
    ignorar: z.array(z.string()).optional().describe("Códigos de achado a silenciar porque são INTENCIONAIS (ex.: arte_chapada, banding, contorno_incompleto, sem_contorno). Os códigos aparecem no relatório."),
    tipo: z.enum(["auto", "personagem", "cena"]).default("auto").describe('"cena" (fundo completo, paisagem, tela cheia): avalia faixas duras no degradê, áreas chapadas enormes, formas repetidas, regiões vazias e profundidade em vez de enquadramento de figura. "auto" escolhe cena em canvas grande (≥ 24000 px).'),
  }),
  run(p, i) {
    const list = resolveFrames(p, i.frames ?? "all");
    return { changed: false, text: formatCritique(evaluateBeauty(p, list, i.tipo, i.ignorar)) };
  },
});

const polish = def({
  name: "polish",
  description: [
    "ACABAMENTO AUTOMÁTICO numa chamada: avalia a arte, corrige o que é mecânico e mostra a nota antes e depois.",
    "1) preto puro vira um tom escuro do material; 2) sombreamento (shade): cada material chapado ganha luz e sombra com mudança de matiz (olhos, boca e listras são detectados como detalhe e preservados); 3) contorno seletivo (sel-out) numa camada `contorno` em volta de toda a figura, mais claro no lado da luz, com limpeza de quinas em L; 4) opcional: centraliza a figura no quadro.",
    "É idempotente (rodar de novo não empilha rebordos). Retoque os detalhes à mão depois, e use `avaliar` para ver o que sobrou (forma quadrada, composição...).",
  ].join("\n"),
  schema: z.object({
    frames: framesSel.optional().describe('Padrão: "all"'),
    sombrear: z.boolean().default(true).describe("aplica o sombreamento automático (shade)"),
    contorno: z.enum(["seletivo", "nenhum"]).default("seletivo").describe("contorno seletivo numa camada `contorno` (não mexe numa camada contorno gerada pelo rig_bake)"),
    profundidade: z.number().int().min(1).max(3).default(1).describe("espessura da sombra em px (2 para sprites > 48 px)"),
    forma: z.enum(["borda", "volume"]).default("borda").describe("sombreamento: borda (rebordo) ou volume (bloco de luz e de sombra por região; para formas orgânicas médias/grandes)"),
    detalhes: z.array(colorRef).optional().describe("cores de detalhe extras a preservar (além das detectadas)"),
    centralizar: z.boolean().default(false).describe("centraliza a figura no quadro (mesmo deslocamento em todos os frames)"),
    preview: previewFlag,
  }),
  run(p, i) {
    const list = resolveFrames(p, i.frames ?? "all");
    const before = evaluateBeauty(p, list);
    const log: string[] = [];
    const figureLayers = p.layers.filter((l) => l.visible && !BG_LAYER.test(l.name) && l.name.toLowerCase() !== "contorno");
    const lum = paletteLum(p);
    // 1) preto puro -> tom escuro do material dominante
    const usage = new Map<number, number>();
    for (const l of figureLayers) for (const f of list) { const c = p.frames[f].cels[l.id]; if (c) for (const v of c) if (v) usage.set(v, (usage.get(v) ?? 0) + 1); }
    const dominant = [...usage].filter(([k]) => lum(k) > 90).sort((a, b) => b[1] - a[1])[0];
    if (dominant) for (const [k, n] of usage) {
      if (lum(k) < 14 && n >= 6) { p.palette[k - 1].hex = darkOutline(p.palette[dominant[0] - 1].hex); log.push(`preto puro "${p.palette[k - 1].name}" → tom escuro colorido`); }
    }
    // 2) sombreamento por camada (detalhes detectados por camada em todos os frames)
    if (i.sombrear) {
      const extra = new Set((i.detalhes ?? []).map((c) => colorIndex(p, c)));
      let shaded = 0;
      for (const l of figureLayers) {
        const detail = new Set<number>(extra), bigAny = new Set<number>();
        for (const f of list) {
          const cel = p.frames[f].cels[l.id];
          const d = detailColors(cel, p.width, p.height);
          for (const v of new Set(cel)) if (v && !DERIVED.test(p.palette[v - 1].name)) (d.has(v) ? detail : bigAny).add(v);
        }
        for (const v of bigAny) detail.delete(v);
        for (const f of list) {
          shaded += i.forma === "volume"
            ? autoShadeVolume(p.frames[f].cels[l.id], p.width, p.height, (c) => (detail.has(c) ? null : shadeTones(p, c)), (c) => detail.has(c))
            : autoShade(p.frames[f].cels[l.id], p.width, p.height, i.profundidade, (c) => (detail.has(c) ? null : shadeTones(p, c)), (c) => detail.has(c));
        }
      }
      log.push(shaded ? `sombreamento: ${shaded} pixel(s) em ${figureLayers.length} camada(s)` : "sombreamento: nada a mudar (já sombreado ou só detalhes)");
    }
    // 3) contorno seletivo numa camada própria
    if (i.contorno === "seletivo") {
      let layer = p.layers.find((l) => l.name.toLowerCase() === "contorno");
      if (layer?.generated) log.push("contorno: ignorado (a camada `contorno` é gerada pelo rig_bake; use rig_bake outline auto)");
      else {
        if (!layer) {
          layer = { id: newId("L"), name: "contorno", visible: true };
          p.layers.unshift(layer);
          for (const fr of p.frames) fr.cels[layer.id] = new Uint8Array(p.width * p.height);
        }
        let corners = 0;
        for (const f of list) {
          const top = new Uint8Array(p.width * p.height);
          for (const l of figureLayers) { const c = p.frames[f].cels[l.id]; for (let k = 0; k < c.length; k++) if (c[k]) top[k] = c[k]; }
          const cel = p.frames[f].cels[layer.id];
          cel.fill(0);
          selectiveOutline(top, cel, p.width, p.height, (c, lit) => selOutIndex(p, c, lit), lum);
          for (const color of new Set(cel)) if (color) corners += cleanCorners(cel, p.width, p.height, color, top);
        }
        log.push(`contorno seletivo na camada "contorno"${corners ? `; ${corners} quina(s) em L limpas` : ""}`);
      }
    }
    // 4) centralizar
    if (i.centralizar) {
      const box = unionBox(p, p.frames.map((_, k) => k));
      if (box) {
        const dx = Math.floor((p.width - (box.x1 - box.x0 + 1)) / 2) - box.x0, dy = Math.floor((p.height - (box.y1 - box.y0 + 1)) / 2) - box.y0;
        if (dx || dy) {
          for (const fr of p.frames) for (const l of p.layers) if (!BG_LAYER.test(l.name)) draw.shift({ width: p.width, height: p.height, data: fr.cels[l.id] }, dx, dy, false);
          log.push(`figura centralizada (${dx}, ${dy})`);
        }
      }
    }
    const after = evaluateBeauty(p, list);
    const head = `polish: ${log.length ? log.join("; ") : "nada a corrigir"}.\nNota: ${before.score} → ${after.score}/100 (paradigmas ${before.scores.paradigmas}→${after.scores.paradigmas}, cor ${before.scores.cor}→${after.scores.cor}, forma ${before.scores.forma}→${after.scores.forma}, composição ${before.scores.composicao}→${after.scores.composicao}).`;
    const rest = after.findings.length ? `\nO que sobrou (precisa de mão de artista):\n${after.findings.map((f) => `- ${f.code}: ${f.message} → ${f.fix}`).join("\n")}` : "\nSem achados restantes.";
    return result(p, head + rest, list, i.preview);
  },
});

const copyCel = def({
  name: "copy_layer_content",
  description:
    "Copia o conteúdo de uma camada de um frame para outros frames/camadas, com deslocamento opcional (dx, dy). Ex.: replicar o corpo em todos os frames, movendo 1px para cima nos frames do pulo.",
  schema: z.object({
    from_frame: z.number().int().min(0),
    from_layer: layerSel,
    to_frames: framesSel,
    to_layer: layerSel,
    dx: z.number().int().default(0),
    dy: z.number().int().default(0),
    mode: z.enum(["replace", "over"]).default("replace").describe("replace: substitui o destino. over: cola por cima (transparente não apaga)."),
    preview: previewFlag,
  }),
  run(p, i) {
    const fromLayer = findLayer(p, i.from_layer);
    const toLayer = i.to_layer !== undefined ? findLayer(p, i.to_layer) : fromLayer;
    const src = new Uint8Array(getCel(p, resolveFrames(p, i.from_frame)[0], fromLayer.id));
    const moved = { width: p.width, height: p.height, data: src };
    draw.shift(moved, i.dx, i.dy, false);
    const list = resolveFrames(p, i.to_frames);
    for (const f of list) {
      const dst = getCel(p, f, toLayer.id);
      if (i.mode === "replace") dst.set(moved.data);
      else for (let k = 0; k < dst.length; k++) if (moved.data[k]) dst[k] = moved.data[k];
    }
    return result(p, `Conteúdo de "${fromLayer.name}"@${i.from_frame} copiado para "${toLayer.name}", ${fmtList(list)}.`, list, i.preview);
  },
});

const regionSchema = z
  .object({
    x: z.number().int().min(0),
    y: z.number().int().min(0),
    w: z.number().int().min(1),
    h: z.number().int().min(1),
  })
  .describe("Área do canvas (x, y = canto superior esquerdo; w, h = largura e altura em pixels).");

const view = def({
  name: "view",
  description: [
    "Mostra o estado atual como texto (grade de chaves de cor com régua de coordenadas) e como imagem. Use depois de desenhar para conferir e antes de editar arte existente.",
    "Para olhar de perto: `region` recorta e amplia uma área (olhos, mãos, articulações) e `grid` desenha a grade com números de coordenada nas margens, para você apontar o pixel exato a corrigir.",
    "Para animação: `compare` {a, b} mostra o que mudou entre dois frames (vermelho = sumiu, verde = apareceu, amarelo = trocou de cor); `onion` mostra o frame anterior em azul translúcido atrás do atual.",
  ].join("\n"),
  schema: z.object({
    frames: framesSel.optional().describe("Padrão: frame 0"),
    layer: z.string().optional().describe("Mostra só esta camada (na grade de texto). Omitido = todas as camadas visíveis combinadas."),
    region: regionSchema.optional(),
    grid: z.boolean().default(false).describe("Grade e coordenadas nas margens da imagem (use com region para zoom)."),
    compare: z.object({ a: z.number().int().min(0), b: z.number().int().min(0) }).optional().describe("Diff do frame a para o frame b."),
    onion: z.boolean().default(false).describe("Onion skin: frame anterior em azul atrás do atual (o do loop, no frame 0)."),
    bones: z.boolean().default(false).describe("Desenha o ESQUELETO (ossos em ciano, juntas em magenta) por cima da imagem; só em projetos com rig."),
    as_text: z.boolean().optional().describe("Grade de texto com régua. Padrão: ligada para 1 frame; desligada quando há vários frames e imagem (a folha de contato já mostra tudo por ~1/10 do custo)."),
    as_image: z.boolean().default(true),
    image_scale: z.number().int().min(1).max(32).optional().describe("Ampliação da imagem (padrão: automático: o quadro inteiro ocupa ~1000 px)"),
    tiles: z.enum(["2x2", "3x2", "3x3"]).optional().describe("Divide o quadro em colunas x linhas de recortes, cada um AMPLIADO com régua e coordenadas. Para inspecionar cenas grandes (320x180...) sem perder detalhe: devolve uma imagem por quadrante."),
    check: z
      .enum(["normal", "cinza", "luz_sombra", "silhueta"])
      .default("normal")
      .describe(
        "Imagem de conferência: cinza = contraste e leitura sem cor; luz_sombra = sombras/contornos pretos e luzes brancas (a sombra está consistente?); silhueta = forma preta (a pose se lê só pelo contorno?)",
      ),
  }),
  run(p, i) {
    const region = i.region ? clampRegion(p, i.region) : undefined;
    const scale = i.image_scale ?? autoScale(p, region);
    const parts: string[] = [];
    const legend = `Legenda: . = transparente, ${p.palette.map((c) => `${c.key}=${c.name}`).join(", ")}`;

    if (i.compare) {
      const { a, b } = i.compare;
      resolveFrames(p, [a, b]);
      const d = diffRows(p, a, b);
      const r = region ?? clampRegion(p);
      if (i.as_text ?? true) {
        parts.push(
          `Diff do frame ${a} para o ${b}: ${d.added} apareceram (+), ${d.removed} sumiram (-), ${d.changed} trocaram de cor (~).\n${withRuler(cropRows(d.rows, r), r.x, r.y)}`,
          "Legenda: # = igual, . = vazio nos dois, + = apareceu, - = sumiu, ~ = outra cor.",
        );
      }
      return {
        changed: false,
        text: parts.join("\n\n"),
        images: i.as_image ? { frames: [b], scale, region, grid: i.grid, compare: { a, b } } : undefined,
      };
    }

    const list = resolveFrames(p, i.frames).slice(0, 12);
    const wantText = i.as_text ?? !(list.length > 1 && i.as_image);
    if (i.tiles) {
      const [cols, rows] = i.tiles.split("x").map(Number);
      return { changed: false, text: `Quadrantes ${i.tiles} do frame ${list[0]}: uma imagem por quadrante, ampliada, com régua de coordenadas.\n${legend}`, images: { frames: [list[0]], scale, mode: i.check, tiles: { cols, rows } } };
    }
    const bigCanvas = (p.width > MAX_PREVIEW_TEXT || p.height > MAX_PREVIEW_TEXT) && !region;
    if (bigCanvas && wantText) parts.push(`(grade de texto omitida: o canvas tem ${p.width}x${p.height}; leia a IMAGEM, ou peça region/tiles para ver um trecho em texto e ampliado)`);
    if (wantText && !bigCanvas) {
      const r = region ?? clampRegion(p);
      const where = region ? ` (região x${r.x}..${r.x + r.w - 1}, y${r.y}..${r.y + r.h - 1})` : "";
      const blocks = list.map((f) => {
        const rows = i.layer ? celToRows(p, getCel(p, f, findLayer(p, i.layer).id)) : frameToRows(p, f);
        return { label: `Frame ${f}`, text: withRuler(cropRows(rows, r), r.x, r.y) };
      });
      // vários frames: lado a lado quando cabem (dá para ver o movimento de uma vez); senão, um embaixo do outro
      const sideWidth = blocks.reduce((n, b) => n + Math.max(...b.text.split("\n").map((l) => l.length)) + 3, 0);
      if (blocks.length > 1 && sideWidth <= 170) {
        parts.push(`Frames ${list.join(", ")}${i.layer ? ` (camada ${i.layer})` : ""}${where}, lado a lado:\n${joinBlocks(blocks)}`);
      } else {
        for (const b of blocks) parts.push(`${b.label}${i.layer ? ` (camada ${i.layer})` : ""}${where}:\n${b.text}`);
      }
    }
    parts.push(legend);
    return {
      changed: false,
      text: parts.join("\n\n"),
      images: i.as_image ? { frames: list, scale, mode: i.check, region, grid: i.grid, onion: i.onion, bones: i.bones && p.rig ? Object.fromEntries(list.map((f) => [f, boneSegments(p, f)])) : undefined } : undefined,
    };
  },
});

const check = def({
  name: "check",
  description: [
    "Checagem automática da arte: aponta defeitos com coordenadas em vez de você ter que achá-los no olho. Rode ao terminar uma etapa, e sempre antes de exportar.",
    "Arte: pixels soltos, furos na silhueta, serrilhado irregular, assimetria (com symmetric), cores quase iguais, cores sem uso.",
    "Animação: volume que pula entre frames (anatomia 'pulando'), base/pés que mudam, largura; movimento: emenda do loop que salta, tempos todos iguais, frames repetidos, movimento quase nulo e passos sem ease. Use tipo=\"efeito\" em brilhos, chamas e fumaça.",
    "Também devolve as medidas da silhueta e de cada camada (altura da cabeça, do tronco...) para comparar com as proporções do comando reference.",
    "É heurístico: corrija o que for defeito e ignore o que for intencional (faíscas, squash & stretch).",
  ].join("\n"),
  schema: z.object({
    frames: framesSel.optional().describe('Padrão: "all"'),
    symmetric: z.boolean().default(false).describe("true: o sprite deveria ser simétrico (de frente/costas); aponta pixels sem par no lado oposto."),
    loop: z.boolean().default(true).describe("Confere também a transição do último para o primeiro frame."),
    tipo: z
      .enum(["personagem", "efeito", "rotacao", "cenario"])
      .default("personagem")
      .describe('"cenario" (paisagem/fundo animado com fumaça, água, estrelas): não cobra volume, base, largura, movimento, contorno nem a emenda do loop (elementos que recomeçam, como a fumaça, não são defeito); cobra só os defeitos de arte. "efeito" (brilho, chama, fumaça, estrela...) muda de tamanho de propósito e emite luz: não cobra volume, base, largura, contorno nem pillow. "rotacao" (moeda girando, objeto virando): a largura muda sozinha e o centro fica parado: não cobra volume, base, largura nem movimento. "personagem": cobra tudo.'),
    ignore_layers: z.array(z.string()).optional().describe("Camadas a deixar fora das medidas (ex.: faíscas e efeitos que se mexem de propósito, ou o fundo)."),
    ignore_codes: z.array(z.string()).optional().describe('Códigos de aviso a silenciar porque são INTENCIONAIS (ex.: "furo" para um vão de propósito, "serrilhado", "banding", "pixel_solto"). Os códigos aparecem no relatório de `check --json`; use com parcimônia.'),
    max_cores: z.number().int().min(2).max(255).optional().describe("Limite de cores do ESTILO pedido (ex.: 16 para visual retrô/16-bit). Sem isso o número de cores não é cobrado: estilos detalhados usam muitas."),
    as_image: z.boolean().default(true).describe("Devolve a imagem com os pixels problemáticos marcados em magenta."),
    painel_completo: z.boolean().default(false).describe("Lista os 12 princípios inteiros; por padrão só os que valem melhorar (o resto vira uma linha de contagem: poupa tokens a cada check)."),
  }),
  run(p, i) {
    const list = resolveFrames(p, i.frames ?? "all");
    const ignore = (i.ignore_layers ?? []).map((n) => findLayer(p, n).id);
    const r = analyze(p, list, { symmetric: i.symmetric, loop: i.tipo === "cenario" ? false : i.loop, tipo: i.tipo === "cenario" ? "efeito" : i.tipo, ignoreLayers: ignore, maxColors: i.max_cores });
    if (i.ignore_codes?.length) r.issues = r.issues.filter((x) => !i.ignore_codes!.includes(x.code));
    const marked = r.issues.find((x) => x.points?.length && x.frame !== undefined);
    const f = marked?.frame ?? list[0];
    const highlight = r.issues.filter((x) => x.frame === f).flatMap((x) => x.points ?? []);
    return {
      changed: false,
      text: formatAnalysis(p, r, i.painel_completo),
      images: i.as_image && highlight.length ? { frames: [f], scale: autoScale(p), highlight } : undefined,
    };
  },
});

const referenceCmd = def({
  name: "reference",
  description: [
    "Consulta referências de anatomia e pixel art. Use ANTES de desenhar um personagem e quando a anatomia ou o estilo estiver em dúvida.",
    `Tópicos: ${REFERENCE_TOPICS.join(", ")}.`,
    "- proporcoes: tabela em pixels (cabeça, ombros, cintura, joelhos, braços, mãos, pés) para a altura do seu sprite e o estilo (realista, estilizado, chibi).",
    "- articulacoes: amplitude e sentido de dobra de cada junta. rosto_mao: rosto e mãos em poucos pixels. quadrupede, caminhada, corrida, pose: anatomia em movimento.",
    "- linhas_curvas, sombreamento, tamanhos: técnica de pixel art. paletas: paletas prontas (Sweetie 16, DB16, PICO-8). rampa: rampa de cor com mudança de matiz a partir de base_color. estudo: onde estudar.",
  ].join("\n"),
  schema: z.object({
    topic: z.enum(REFERENCE_TOPICS),
    height: z.number().int().min(8).max(256).optional().describe("proporcoes: altura total do sprite em px (padrão: altura do canvas)"),
    style: z.enum(["realista", "estilizado", "chibi"]).optional().describe("proporcoes: padrão estilizado (4 cabeças)"),
    base_color: z.string().optional().describe("rampa: cor base em hex"),
    steps: z.number().int().min(3).max(7).optional().describe("rampa: número de tons (padrão 5)"),
  }),
  run(p, i) {
    return { changed: false, text: reference(i.topic, { ...i, height: i.height ?? p.height }) };
  },
});

const info = def({
  name: "get_project_info",
  description: "Resumo do projeto: tamanho, fps, paleta, camadas e frames.",
  schema: z.object({}),
  run(p) {
    return { changed: false, text: describeProject(p) };
  },
});

const exportCmd = def({
  name: "export",
  description: "Exporta e baixa a animação para o usuário: GIF animado, spritesheet PNG (frames lado a lado, para engines de jogo) ou projeto JSON.",
  schema: z.object({
    format: z.enum(["gif", "spritesheet_png", "json"]),
    scale: z.number().int().min(1).max(16).default(4).describe("Ampliação dos pixels (gif/png)"),
    columns: z.number().int().min(1).max(MAX_FRAMES).optional().describe("Colunas do spritesheet (padrão: todos em uma linha)"),
  }),
  run(p, i) {
    const base = (p.name || "animacao").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "animacao";
    const ext = i.format === "gif" ? "gif" : i.format === "json" ? "anima.json" : "png";
    const filename = `${base}${i.format === "spritesheet_png" ? "-sheet" : ""}.${ext}`;
    return {
      changed: false,
      text: `Exportação de ${filename} enviada ao navegador do usuário.`,
      effect: { type: "export", format: i.format, scale: i.scale, columns: i.columns, filename },
    };
  },
});

export const COMMANDS = [
  setCanvas,
  setPalette,
  removeColors,
  addLayer,
  updateLayer,
  addFrames,
  deleteFrames,
  moveFrame,
  setTiming,
  drawRowsCmd,
  drawFramesCmd,
  drawFigure,
  rigCreate,
  rigPart,
  rigPose,
  rigBake,
  rigBone,
  rigWalk,
  rigInfo,
  drawShapes,
  transform,
  polish,
  batch,
  paisagem,
  avaliar,
  inspecionar,
  reduceColors,
  copyCel,
  view,
  check,
  referenceCmd,
  info,
  exportCmd,
] as CommandDef[];

const byName = new Map(COMMANDS.map((c) => [c.name, c]));

export function describeProject(p: Project): string {
  return [
    `Projeto "${p.name}": ${p.width}x${p.height} px, ${p.fps} fps, ${p.frames.length} frame(s).`,
    p.palette.length ? `Paleta (${p.palette.length}): ${p.palette.map((c) => `${c.key}=${c.hex} ${c.name}`).join(" | ")}` : "Paleta vazia: defina com set_palette (cores ou preset: pico8, sweetie16, gameboy) antes de desenhar.",
    `Camadas (baixo→cima): ${p.layers.map((l) => `${l.name}${l.visible ? "" : " (oculta)"}`).join(", ")}`,
    `Durações: ${p.frames.map((f, i) => `${i}:${f.duration ?? Math.round(1000 / p.fps)}ms`).join(" ")}`,
    ...(p.rig ? [`Rig: ${p.rig.bones.length} ossos (${p.rig.bones.map((b) => b.name).join(", ")}), ${p.rig.parts.length} partes de arte, ${p.frames.filter((f) => f.pose).length} frame(s) com pose.`] : []),
  ].join("\n");
}

function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/**
 * O Zod descarta em silêncio chaves que o schema não conhece (ex.: `frame` em vez de `frames`),
 * e o comando roda "com sucesso" no lugar errado. Aqui isso vira erro, com a sugestão da chave certa.
 */
function unknownKeys(schema: z.ZodType, input: unknown): string | null {
  const found: string[] = [];
  const unwrap = (sc: z.ZodType): z.ZodType => {
    let cur: z.ZodType = sc;
    for (let k = 0; k < 6; k++) {
      const def = (cur as unknown as { def?: { innerType?: z.ZodType } }).def;
      if (cur instanceof z.ZodOptional || cur instanceof z.ZodDefault || cur instanceof z.ZodNullable) cur = def!.innerType!;
      else break;
    }
    return cur;
  };
  const walk = (sc: z.ZodType, value: unknown, where: string) => {
    const t = unwrap(sc);
    if (t instanceof z.ZodObject && value && typeof value === "object" && !Array.isArray(value)) {
      const valid = Object.keys(t.shape);
      const given = Object.keys(value as object);
      const optional = (sc: z.ZodType) => sc instanceof z.ZodOptional || sc instanceof z.ZodDefault;
      const missing = valid.filter((v) => !given.includes(v) && !optional(t.shape[v] as z.ZodType));
      const strange = given.filter((k) => !valid.includes(k));
      for (const k of given) {
        if (!valid.includes(k)) {
          const best = valid.map((v) => ({ v, d: editDistance(k.toLowerCase(), v.toLowerCase()) })).sort((x, y) => x.d - y.d)[0];
          // uma chave estranha + uma obrigatória faltando = quase certamente a mesma coisa (ex.: "color" no lugar de "hex")
          const guess = best && best.d <= Math.max(2, Math.floor(k.length / 3)) ? best.v : strange.length === 1 && missing.length === 1 ? missing[0] : null;
          const hint = guess ? ` (quis dizer "${guess}"?)` : "";
          found.push(`${where ? `${where}.` : ""}"${k}" não existe${hint}. Chaves válidas${where ? ` de ${where}` : ""}: ${valid.join(", ")}.`);
        } else walk(t.shape[k] as z.ZodType, (value as Record<string, unknown>)[k], where ? `${where}.${k}` : k);
      }
    } else if (t instanceof z.ZodArray && Array.isArray(value)) {
      const el = (t as unknown as { element: z.ZodType }).element;
      value.slice(0, 50).forEach((v, idx) => walk(el, v, `${where}[${idx}]`));
    }
  };
  walk(schema, input, "");
  return found.length ? `chave(s) desconhecida(s): ${found.slice(0, 4).join(" ")}` : null;
}

/** Erros de validação do Zod em português, com o caminho do campo e o que fazer. */
function describeIssues(name: string, error: z.ZodError, input?: unknown): string {
  const lines = error.issues.slice(0, 5).map((i) => {
    const where = i.path.length ? i.path.map((q, k) => (typeof q === "number" ? `[${q}]` : k ? `.${String(q)}` : String(q))).join("") : "(entrada)";
    const valueAt = i.path.reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string | number, unknown>)[k as string | number] : undefined), input);
    const missing = (i.code === "invalid_type" && /received undefined/.test(i.message)) || (i.code === "invalid_union" && i.path.length > 0 && valueAt === undefined);
    const isFrames = /(^|\.)frames$/.test(where) && i.code === "invalid_union";
    return `- ${where}: ${missing ? "falta este campo obrigatório" : isFrames ? 'formato inválido; "frames" aceita: um número (0), uma lista ([0, 2, 4]), "all" ou um intervalo {"from": 0, "to": 3}' : i.code === "invalid_union" ? "não bate com nenhuma das formas aceitas (veja `anima tools` para as formas possíveis)" : i.message}`;
  });
  const first = lines[0]?.replace(/^- /, "") ?? "";
  return `Entrada inválida para ${name} — ${first}${lines.length > 1 ? ` (+${lines.length - 1} problema(s))` : ""}\n${lines.join("\n")}\nVeja os parâmetros com: anima tools ${name}`;
}

/** Valida e executa um comando. Erros viram texto amigável — nunca exceções. */
export function runCommand(p: Project, name: string, input: unknown): CommandResult & { ok: boolean } {
  const cmd = byName.get(name);
  if (!cmd) return { ok: false, changed: false, text: `Comando desconhecido: ${name}` };
  const unknown = unknownKeys(cmd.schema, input);
  if (unknown) return { ok: false, changed: false, text: `Entrada inválida para ${name}: ${unknown}` };
  const parsed = cmd.schema.safeParse(input ?? {});
  if (!parsed.success) {
    return { ok: false, changed: false, text: describeIssues(name, parsed.error, input) };
  }
  // Executa numa cópia: se o comando falhar no meio, o projeto fica intacto.
  const work = cloneProject(p);
  BEFORE = p;
  try {
    const result = cmd.run(work, parsed.data);
    // zoom automático na região que MUDOU (só em canvas grandes, onde o quadro inteiro não mostra o detalhe)
    if (result.changed && result.images && !result.images.compare && !result.images.tiles && (work.width > 96 || work.height > 96)) {
      const f = result.images.frames[0];
      if (f !== undefined && p.frames[f] && work.frames[f]) {
        const a = flattenFrame(p, f), b = flattenFrame(work, f);
        let x0 = work.width, y0 = work.height, x1 = -1, y1 = -1;
        if (a.length === b.length) for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) { const x = k % work.width, y = (k - x) / work.width; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
        if (x1 >= 0) {
          const pad = 6, w = Math.max(48, x1 - x0 + 1 + pad * 2), h = Math.max(36, y1 - y0 + 1 + pad * 2);
          if (w * h < 0.6 * work.width * work.height) result.images = { ...result.images, foco: { x: Math.max(0, Math.min(work.width - w, x0 - pad - Math.floor((w - (x1 - x0 + 1 + pad * 2)) / 2))), y: Math.max(0, Math.min(work.height - h, y0 - pad - Math.floor((h - (y1 - y0 + 1 + pad * 2)) / 2))), w, h } };
        }
      }
    }
    if (result.changed) Object.assign(p, work);
    return { ok: true, ...result };
  } catch (e) {
    return { ok: false, changed: false, text: `Erro em ${name}: ${(e as Error).message}` };
  } finally {
    BEFORE = null;
  }
}

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
import { REFERENCE_TOPICS, darkOutline, makeRamp, reference } from "./reference.ts";
import { DEFAULT_POSE, FIGURE_LAYERS, PRESETS as POSE_PRESETS, WALK_CYCLE, clampPose, lerpPose, renderFigure, swapSides, type Pose, type Ramp } from "./rig.ts";
import type { CheckMode } from "./render.ts";
import { autoScale, clampRegion, diffRows, type ImageRequest } from "./view.ts";
import {
  KEY_CHARS,
  MAX_COLORS,
  MAX_FRAMES,
  MAX_LAYERS,
  TRANSPARENT_KEY,
  clampSize,
  cloneProject,
  colorIndex,
  findLayer,
  getCel,
  newId,
  normalizeHex,
  type Project,
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
function withPreview(p: Project, summary: string, frames: number[], layer?: string): CommandResult {
  const shown = frames.slice(0, 1);
  const f = shown[0];
  const parts = [summary];
  if (frames.length > 1) parts.push(`Prévia só do frame ${f} (editou ${frames.length}); use view para os outros.`);
  const rows = layer ? celToRows(p, getCel(p, f, findLayer(p, layer).id)) : frameToRows(p, f);
  if (p.width <= MAX_PREVIEW_TEXT && p.height <= MAX_PREVIEW_TEXT) {
    parts.push(`Frame ${f} agora:\n${withRuler(rows)}`);
  }
  const issues = analyzeFrame(p, f).filter((i) => i.severity !== "info");
  if (issues.length) parts.push(`Checagem automática do frame ${f}:\n${formatIssues(issues, 4).join("\n")}`);
  return {
    changed: true,
    text: parts.join("\n\n"),
    images: { frames: shown, scale: autoScale(p), highlight: issues.flatMap((i) => i.points ?? []) },
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
    width: z.number().int().min(1).max(256).optional(),
    height: z.number().int().min(1).max(256).optional(),
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

const setPalette = def({
  name: "set_palette",
  description:
    'Adiciona ou altera cores da paleta. Se a chave já existe, a cor é substituída — isso recolore instantaneamente todos os pixels daquela cor em todos os frames (ótimo para "deixa o chapéu vermelho"). Use paletas pequenas e coesas (4–16 cores), com um tom escuro de contorno, sombras e luzes.',
  schema: z.object({
    colors: z
      .array(
        z.object({
          key: z
            .string()
            .length(1)
            .describe(`1 caractere único usado no desenho por texto. Permitidos: ${KEY_CHARS}`),
          hex: z.string().describe("Cor #rrggbb"),
          name: z.string().max(40).describe('Nome curto e descritivo, ex. "pele-sombra"'),
        }),
      )
      .min(1)
      .max(64),
  }),
  run(p, i) {
    const added: string[] = [];
    const updated: string[] = [];
    for (const c of i.colors) {
      if (c.key === TRANSPARENT_KEY || c.key === " " || !KEY_CHARS.includes(c.key)) {
        throw new Error(`Chave "${c.key}" inválida. Use um destes caracteres: ${KEY_CHARS}`);
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
    frames: framesSel,
    duration_ms: z
      .union([z.number().int().min(10).max(10000), z.null(), z.array(z.number().int().min(10).max(10000)).min(1)])
      .describe("Um número (todos os frames escolhidos), null (volta ao fps global) ou uma LISTA com uma duração por frame, na mesma ordem de `frames`. Ex.: frames \"all\" e [120, 90, 100, 90]."),
  }),
  run(p, i) {
    const list = resolveFrames(p, i.frames);
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
    rows: z.array(z.string().max(256)).min(1).max(256),
    mirror: z
      .enum(["none", "horizontal"])
      .default("none")
      .describe('"horizontal": escreva só a METADE ESQUERDA, incluindo a coluna do meio como última coluna; a engine espelha para a direita (corações, estrelas, rostos, personagens de frente). Largura final = 2×largura − 1.'),
    dot_is_transparent: z
      .boolean()
      .default(true)
      .describe('true: "." apaga o pixel. false: "." também preserva o pixel (útil para sobrepor).'),
    preview: previewFlag,
  }),
  run(p, i) {
    const layer = findLayer(p, i.layer);
    const list = resolveFrames(p, i.frames);
    let n = 0;
    const rows = i.mirror === "horizontal" ? i.rows.map((r) => r + [...r].slice(0, -1).reverse().join("")) : i.rows;
    for (const f of list) n = drawRows(p, getCel(p, f, layer.id), rows, i.x, i.y, i.dot_is_transparent);
    return result(p, `${n} pixels escritos em "${layer.name}", ${fmtList(list)}.${widthWarning(rows)}`, list, i.preview);
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
          rows: z.array(z.string().max(256)).min(1).max(256),
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
      })
      .optional()
      .describe("arma PRESA à mão (nunca flutua): cabo, guarda e lâmina saem da mão"),
  })
  .describe("Ângulos das articulações em graus; o que não for dado fica na pose-base (parado) ou no preset.");

const PRESET_NAMES = Object.keys(POSE_PRESETS) as [string, ...string[]];

/** Cor (hex) → índice da paleta; cria a cor se não existir. */
function ensureColor(p: Project, hex: string, name: string): number {
  const h = normalizeHex(hex);
  const found = p.palette.findIndex((c) => c.hex === h);
  if (found >= 0) return found + 1;
  const key = [...KEY_CHARS].find((k) => !p.palette.some((c) => c.key === k) && k !== TRANSPARENT_KEY);
  if (!key || p.palette.length >= MAX_COLORS) throw new Error("Paleta cheia: não dá para criar as cores da figura.");
  p.palette.push({ key, hex: h, name });
  return p.palette.length;
}
/** Rampa de 4 tons com mudança de matiz (contorno, sombra, base, luz) a partir de uma cor base. */
function ensureRamp(p: Project, hex: string, name: string): Ramp {
  const r = makeRamp(hex, 5);
  const outline = darkOutline(hex);
  const mix = (a: string, b: string, t: number) => {
    const [x, y] = [a, b].map((h) => [1, 3, 5].map((i) => parseInt(normalizeHex(h).slice(i, i + 2), 16)));
    return `#${x.map((v, k) => Math.round(v * (1 - t) + y[k] * t).toString(16).padStart(2, "0")).join("")}`;
  };
  // pele: a rampa de matiz deslocado satura demais e fica avermelhada; aqui a sombra é a própria pele escurecida e a luz, a pele clareada
  const skin = name === "pele";
  return {
    outline: ensureColor(p, outline, `${name}-contorno`),
    dark: ensureColor(p, skin ? mix(hex, outline, 0.32) : r[1], `${name}-sombra`),
    base: ensureColor(p, hex, `${name}`),
    light: ensureColor(p, skin ? mix(hex, "#fff0dc", 0.4) : r[3], `${name}-luz`),
  };
}

const drawFigure = def({
  name: "draw_figure",
  description: [
    "Desenha uma figura HUMANA por esqueleto: você dá os ÂNGULOS das articulações e a engine desenha. A anatomia sai certa por construção: ossos de comprimento constante (proporções do estilo), ombro→cotovelo→mão sempre ligados, pescoço, mão presa à arma, o pé mais baixo encosta no chão, e os limites anatômicos são respeitados (o cotovelo só dobra para a frente, o joelho só para trás; fora do limite a engine ajusta e avisa).",
    "Vista lateral, olhando para a direita (facing=left espelha). Cria/usa as camadas contorno, braco-tras, perna-tras, tronco, cabeca, perna-frente, braco-frente e arma, e as cores (contorno, sombra, base e luz de cada material) na paleta.",
    "Cada item diz o frame e a pose: `preset` (parado, caminhada_contato, caminhada_abaixo, caminhada_passagem, caminhada_acima) e/ou `pose` com ângulos (que sobrescrevem o preset); `swap` troca o lado da frente com o de trás.",
    '`cycle: "caminhada"` faz um ciclo completo de 8 frames (contato, abaixo, passagem, acima e o espelho): precisa de 8 frames. `tween: true` preenche os frames que estão ENTRE dois itens interpolando os ângulos com ease in/out (pose a pose + slow in/slow out + arcos, de graça): defina só as poses-chave.',
    "Convenção: 0° = membro pendurado para baixo; + = para a frente. Ex. de golpe de espada: shoulder_front 160 + elbow_front 60 + weapon {angle: 170} (espada erguida atrás), depois shoulder_front 85 + elbow_front 10 + weapon {angle: 90} (golpe horizontal).",
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
        const base = POSE_PRESETS[WALK_CYCLE[f % 4]];
        return { frame: f, pose: f >= 4 ? swapSides(base) : base };
      });
    }
    for (const it of i.items ?? []) {
      resolveFrames(p, it.frame);
      let base = it.preset ? POSE_PRESETS[it.preset] : DEFAULT_POSE;
      if (it.swap) base = swapSides(base);
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
    const ramps = {
      skin: ensureRamp(p, m.skin, "pele"), hair: ensureRamp(p, m.hair, "cabelo"), top: ensureRamp(p, m.top, "roupa"),
      bottom: ensureRamp(p, m.bottom, "calca"), boots: ensureRamp(p, m.boots, "bota"), metal: ensureRamp(p, m.metal, "metal"), gold: ensureRamp(p, m.gold, "ouro"),
    };
    const figureHeight = i.figure_height ?? Math.round(p.height * 0.7);
    const warns = new Set<string>();
    for (const it of items) {
      const { warnings } = clampPose(it.pose);
      warnings.forEach((w) => warns.add(`frame ${it.frame}: ${w}`));
      const out = renderFigure({
        width: p.width, height: p.height, figureHeight, style: i.style, x: i.x ?? Math.round(p.width / 2), ground: i.ground ?? p.height - 2,
        facing: i.facing, pose: it.pose, ramps, face: i.face, airborne: it.airborne, light: i.light,
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

const shape = z.discriminatedUnion("type", [
  z.object({ type: z.literal("pixels"), points: z.array(z.array(z.number().int()).length(2)).min(1).max(4096).describe("Lista de [x, y]"), color: colorRef }),
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
    for (const f of list) {
      const s = { width: p.width, height: p.height, data: getCel(p, f, layer.id) };
      for (const sh of i.shapes) {
        const c = sh.type === "blob" ? 0 : colorIndex(p, sh.color);
        switch (sh.type) {
          case "pixels":
            for (const [x, y] of sh.points) draw.setPixel(s, x!, y!, c);
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
          case "fill":
            draw.floodFill(s, sh.x, sh.y, c);
            break;
        }
      }
    }
    return result(p, `${i.shapes.length} forma(s) desenhada(s) em "${layer.name}", ${fmtList(list)}.`, list, i.preview);
  },
});

const transform = def({
  name: "transform",
  description: [
    "Transforma o conteúdo de uma camada em um ou mais frames:",
    "- shift: move dx/dy pixels (wrap=true faz dar a volta; ótimo para nuvens, água, fundos em loop)",
    "- flip_horizontal / flip_vertical: espelha",
    "- replace_color: troca a cor `from` por `to`",
    "- outline: contorna automaticamente a silhueta com `color`",
    "- rotate: gira `angle` graus (positivo = horário) em torno do pivô (cx, cy). Ótimo para braços, armas e objetos girando. Gire sempre a partir de uma cópia limpa (copy_layer_content) em vez de girar várias vezes o mesmo frame, para não acumular distorção.",
    "- center: centraliza o conteúdo da camada no canvas (axis: x, y ou both)",
    "- clear: apaga tudo",
  ].join("\n"),
  schema: z.object({
    frames: framesSel,
    layer: layerSel,
    op: z.enum(["shift", "flip_horizontal", "flip_vertical", "replace_color", "outline", "rotate", "center", "clear"]),
    axis: z.enum(["x", "y", "both"]).optional().describe("center: eixo a centralizar (padrão: both)"),
    angle: z.number().min(-360).max(360).optional().describe("rotate: graus, positivo = horário"),
    cx: z.number().optional().describe("rotate: pivô x (padrão: centro do canvas)"),
    cy: z.number().optional().describe("rotate: pivô y (padrão: centro do canvas)"),
    dx: z.number().int().optional(),
    dy: z.number().int().optional(),
    wrap: z.boolean().optional(),
    from: colorRef.optional(),
    to: colorRef.optional(),
    color: colorRef.optional(),
    diagonal: z.boolean().optional().describe("outline: incluir diagonais"),
    preview: previewFlag,
  }),
  run(p, i) {
    const layer = findLayer(p, i.layer);
    const list = resolveFrames(p, i.frames);
    for (const f of list) {
      const s = { width: p.width, height: p.height, data: getCel(p, f, layer.id) };
      switch (i.op) {
        case "shift":
          draw.shift(s, i.dx ?? 0, i.dy ?? 0, i.wrap ?? false);
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
          if (i.color === undefined) throw new Error("outline precisa de `color`.");
          draw.outline(s, colorIndex(p, i.color), i.diagonal ?? false);
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
    as_text: z.boolean().default(true),
    as_image: z.boolean().default(true),
    image_scale: z.number().int().min(1).max(32).optional().describe("Ampliação da imagem (padrão: automático)"),
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
      if (i.as_text) {
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
    if (i.as_text) {
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
      images: i.as_image ? { frames: list, scale, mode: i.check, region, grid: i.grid, onion: i.onion } : undefined,
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
      .enum(["personagem", "efeito", "rotacao"])
      .default("personagem")
      .describe('"efeito" (brilho, chama, fumaça, estrela...) muda de tamanho de propósito e emite luz: não cobra volume, base, largura, contorno nem pillow. "rotacao" (moeda girando, objeto virando): a largura muda sozinha e o centro fica parado: não cobra volume, base, largura nem movimento. "personagem": cobra tudo.'),
    ignore_layers: z.array(z.string()).optional().describe("Camadas a deixar fora das medidas (ex.: faíscas e efeitos que se mexem de propósito, ou o fundo)."),
    as_image: z.boolean().default(true).describe("Devolve a imagem com os pixels problemáticos marcados em magenta."),
  }),
  run(p, i) {
    const list = resolveFrames(p, i.frames ?? "all");
    const ignore = (i.ignore_layers ?? []).map((n) => findLayer(p, n).id);
    const r = analyze(p, list, { symmetric: i.symmetric, loop: i.loop, tipo: i.tipo, ignoreLayers: ignore });
    const marked = r.issues.find((x) => x.points?.length && x.frame !== undefined);
    const f = marked?.frame ?? list[0];
    const highlight = r.issues.filter((x) => x.frame === f).flatMap((x) => x.points ?? []);
    return {
      changed: false,
      text: formatAnalysis(p, r),
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
  drawShapes,
  transform,
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
    `Paleta (${p.palette.length}): ${p.palette.map((c) => `${c.key}=${c.hex} ${c.name}`).join(" | ")}`,
    `Camadas (baixo→cima): ${p.layers.map((l) => `${l.name}${l.visible ? "" : " (oculta)"}`).join(", ")}`,
    `Durações: ${p.frames.map((f, i) => `${i}:${f.duration ?? Math.round(1000 / p.fps)}ms`).join(" ")}`,
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
function describeIssues(name: string, error: z.ZodError): string {
  const lines = error.issues.slice(0, 5).map((i) => {
    const where = i.path.length ? i.path.map((q, k) => (typeof q === "number" ? `[${q}]` : k ? `.${String(q)}` : String(q))).join("") : "(entrada)";
    const missing = i.code === "invalid_type" && /received undefined/.test(i.message);
    return `- ${where}: ${missing ? "falta este campo obrigatório" : i.message}`;
  });
  return `Entrada inválida para ${name}:\n${lines.join("\n")}\nVeja os parâmetros com: anima tools ${name}`;
}

/** Valida e executa um comando. Erros viram texto amigável — nunca exceções. */
export function runCommand(p: Project, name: string, input: unknown): CommandResult & { ok: boolean } {
  const cmd = byName.get(name);
  if (!cmd) return { ok: false, changed: false, text: `Comando desconhecido: ${name}` };
  const unknown = unknownKeys(cmd.schema, input);
  if (unknown) return { ok: false, changed: false, text: `Entrada inválida para ${name}: ${unknown}` };
  const parsed = cmd.schema.safeParse(input ?? {});
  if (!parsed.success) {
    return { ok: false, changed: false, text: describeIssues(name, parsed.error) };
  }
  // Executa numa cópia: se o comando falhar no meio, o projeto fica intacto.
  const work = cloneProject(p);
  try {
    const result = cmd.run(work, parsed.data);
    if (result.changed) Object.assign(p, work);
    return { ok: true, ...result };
  } catch (e) {
    return { ok: false, changed: false, text: `Erro em ${name}: ${(e as Error).message}` };
  }
}

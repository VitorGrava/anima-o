/**
 * A API de comandos da engine.
 *
 * Tudo que a IA (ou um script, ou a UI) faz passa por aqui: cada comando tem
 * nome, descrição, um schema Zod (convertido para JSON Schema e entregue ao
 * Claude como "tool") e uma função que aplica o comando ao projeto.
 */
import { z } from "zod";
import { celToRows, drawRows, frameToRows, withRuler } from "./ascii.ts";
import * as draw from "./draw.ts";
import type { CheckMode } from "./render.ts";
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
  images?: { frames: number[]; scale: number; mode?: CheckMode };
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
    if (i.rename) layer.name = i.rename;
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
    "Insere frames na timeline. Com `copy_from`, os novos frames começam como cópia daquele frame (o jeito normal de animar: copie e depois altere só o que muda).",
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
  description: "Apaga frames da timeline.",
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
  description: "Define quanto tempo (ms) cada frame fica na tela. Use para segurar poses (antecipação, impacto) ou acelerar trechos.",
  schema: z.object({
    frames: framesSel,
    duration_ms: z.number().int().min(10).max(10000).nullable().describe("null = volta a usar o fps global"),
  }),
  run(p, i) {
    const list = resolveFrames(p, i.frames);
    for (const j of list) p.frames[j].duration = i.duration_ms ?? undefined;
    return { changed: true, text: `Duração de ${fmtList(list)}: ${i.duration_ms ?? `padrão (${Math.round(1000 / p.fps)}ms)`}.` };
  },
});

const drawRowsCmd = def({
  name: "draw_rows",
  description: [
    "Desenha arte pixel a pixel usando texto: cada string é uma linha, cada caractere é um pixel com a chave da cor na paleta.",
    '"." = transparente (apaga), " " (espaço) = não mexe no pixel existente.',
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
    dot_is_transparent: z
      .boolean()
      .default(true)
      .describe('true: "." apaga o pixel. false: "." também preserva o pixel (útil para sobrepor).'),
  }),
  run(p, i) {
    const layer = findLayer(p, i.layer);
    const list = resolveFrames(p, i.frames);
    let n = 0;
    for (const f of list) n = drawRows(p, getCel(p, f, layer.id), i.rows, i.x, i.y, i.dot_is_transparent);
    return { changed: true, text: `${n} pixels escritos em "${layer.name}", ${fmtList(list)}.` };
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
  z.object({ type: z.literal("fill"), x: z.number().int(), y: z.number().int(), color: colorRef }).describe("Balde de tinta a partir de (x, y)"),
]);

const drawShapes = def({
  name: "draw_shapes",
  description:
    "Desenha formas geométricas em sequência: pixels soltos, linhas, retângulos, elipses e balde de tinta. Bom para blocos grandes, fundos e efeitos; para detalhes finos prefira draw_rows.",
  schema: z.object({
    frames: framesSel.optional().describe("Padrão: frame 0"),
    layer: layerSel,
    shapes: z.array(shape).min(1).max(200),
  }),
  run(p, i) {
    const layer = findLayer(p, i.layer);
    const list = resolveFrames(p, i.frames);
    for (const f of list) {
      const s = { width: p.width, height: p.height, data: getCel(p, f, layer.id) };
      for (const sh of i.shapes) {
        const c = colorIndex(p, sh.color);
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
          case "fill":
            draw.floodFill(s, sh.x, sh.y, c);
            break;
        }
      }
    }
    return { changed: true, text: `${i.shapes.length} forma(s) desenhada(s) em "${layer.name}", ${fmtList(list)}.` };
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
    "- clear: apaga tudo",
  ].join("\n"),
  schema: z.object({
    frames: framesSel,
    layer: layerSel,
    op: z.enum(["shift", "flip_horizontal", "flip_vertical", "replace_color", "outline", "rotate", "clear"]),
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
        case "clear":
          s.data.fill(0);
          break;
      }
    }
    return { changed: true, text: `${i.op} aplicado em "${layer.name}", ${fmtList(list)}.` };
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
    return { changed: true, text: `Conteúdo de "${fromLayer.name}"@${i.from_frame} copiado para "${toLayer.name}", ${fmtList(list)}.` };
  },
});

const view = def({
  name: "view",
  description:
    "Mostra o estado atual como texto (grade de chaves de cor com régua de coordenadas) e, opcionalmente, como imagem. SEMPRE use depois de desenhar para conferir o resultado e corrigir erros, e antes de editar arte existente.",
  schema: z.object({
    frames: framesSel.optional().describe("Padrão: frame 0"),
    layer: z.string().optional().describe("Mostra só esta camada. Omitido = todas as camadas visíveis combinadas."),
    as_text: z.boolean().default(true),
    as_image: z.boolean().default(true),
    image_scale: z.number().int().min(1).max(16).optional().describe("Ampliação da imagem (padrão: automático)"),
    check: z
      .enum(["normal", "cinza", "luz_sombra", "silhueta"])
      .default("normal")
      .describe(
        "Imagem de conferência: cinza = contraste e leitura sem cor; luz_sombra = sombras/contornos pretos e luzes brancas (a sombra está consistente?); silhueta = forma preta (a pose se lê só pelo contorno?)",
      ),
  }),
  run(p, i) {
    const list = resolveFrames(p, i.frames).slice(0, 8);
    const parts: string[] = [];
    if (i.as_text) {
      for (const f of list) {
        const rows = i.layer ? celToRows(p, getCel(p, f, findLayer(p, i.layer).id)) : frameToRows(p, f);
        parts.push(`Frame ${f}${i.layer ? ` (camada ${i.layer})` : ""}:\n${withRuler(rows)}`);
      }
    }
    parts.push(`Legenda: . = transparente, ${p.palette.map((c) => `${c.key}=${c.name}`).join(", ")}`);
    const scale = i.image_scale ?? Math.max(1, Math.min(16, Math.floor(256 / Math.max(p.width, p.height))));
    return {
      changed: false,
      text: parts.join("\n\n"),
      images: i.as_image ? { frames: list, scale, mode: i.check } : undefined,
    };
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
  drawShapes,
  transform,
  copyCel,
  view,
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

/** Valida e executa um comando. Erros viram texto amigável — nunca exceções. */
export function runCommand(p: Project, name: string, input: unknown): CommandResult & { ok: boolean } {
  const cmd = byName.get(name);
  if (!cmd) return { ok: false, changed: false, text: `Comando desconhecido: ${name}` };
  const parsed = cmd.schema.safeParse(input ?? {});
  if (!parsed.success) {
    return { ok: false, changed: false, text: `Entrada inválida para ${name}: ${z.prettifyError(parsed.error)}` };
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

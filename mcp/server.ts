/**
 * Servidor MCP do anima-o: expõe a engine como ferramentas para agentes como
 * Claude Code e Codex (usando a assinatura do próprio agente, sem chave de API).
 *
 * O projeto fica em um arquivo .anima.json no disco, salvo a cada mudança —
 * assim `anima view` mostra o canvas atualizando ao vivo enquanto o agente desenha.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { describeProject, jsonSchemaOf, commandTools, renderImages, runCommand, importImage, importIntoProject, compareToReference, avisoFundo, avisoVazio, type Project } from "../src/engine/index.ts";
import { SYSTEM_PROMPT } from "../server/prompt.ts";
import { decodePNG, encodePNG } from "../server/png.ts";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ProjectStore, exportToFile } from "./store.ts";

const VERSION = "0.2.0";

const MCP_NOTES = `

Como usar estas ferramentas (MCP)
- O trabalho acontece em um arquivo de projeto .anima.json. Comece com open_project (abre ou cria). Se você não abrir nenhum, o padrão é ./animacao.anima.json no diretório atual.
- Cada comando que muda o projeto salva o arquivo na hora. O usuário pode acompanhar ao vivo no navegador com: anima view <arquivo>.
- Os comandos de desenho (draw_rows, draw_shapes, transform, copy_layer_content) já devolvem o frame editado como grade de texto + imagem + avisos automáticos: leia o retorno e corrija antes de seguir. view faz zoom (region, grid), diff entre frames (compare) e onion skin; check mede e aponta defeitos em todos os frames; reference traz proporções de anatomia e técnicas de pixel art.
- Para gerar arquivos (GIF, spritesheet PNG, PNG de um frame ou JSON), use export_file. Exporte quando o usuário pedir ou quando o pedido for um arquivo/entrega (GIF, spritesheet); fora disso, não.
- rig_* e draw_figure ficam ESCONDIDOS por padrão (poupam tokens): chame habilitar_ferramentas só quando o pedido for um humano ou um personagem com esqueleto por ângulos.
- Ao terminar, diga ao usuário onde estão o projeto e os arquivos exportados.`;

const OpenProject = z.object({
  path: z.string().min(1).describe("Caminho do arquivo .anima.json (relativo ao diretório atual)"),
  create: z
    .object({
      name: z.string().max(80).optional(),
      width: z.number().int().min(1).max(512).optional(),
      height: z.number().int().min(1).max(512).optional(),
      fps: z.number().min(1).max(60).optional(),
    })
    .optional()
    .describe("Se o arquivo não existir, cria um projeto novo com estas opções"),
  overwrite: z.boolean().default(false).describe("true: cria um projeto novo mesmo se o arquivo existir (apaga o anterior)"),
});

/** ferramentas pesadas e raras: ficam fora da lista até alguém pedir (economiza ~7 mil tokens por sessão) */
export const RIG_TOOLS = ["draw_figure", "rig_info", "rig_create", "rig_part", "rig_pose", "rig_bake", "rig_bone", "rig_walk"];
const EnableTools = z.object({ grupo: z.enum(["rig", "tudo"]).default("rig").describe('"rig": esqueleto por ossos (rig_*) e draw_figure (humano por ângulos). Chame só quando o pedido for uma figura humana ou um personagem com esqueleto/pose por ângulos.') });

const ImportImage = z.object({
  path: z.string().min(1).describe("PNG a importar (relativo ao diretório atual). WebP/JPG: converta para PNG antes."),
  largura: z.number().int().min(1).max(512).optional().describe("Largura final em px do canvas (reamostra); omita para detectar o tamanho do pixel e voltar à grade original"),
  altura: z.number().int().min(1).max(512).optional(),
  grade: z.number().int().min(1).max(64).optional().describe("Tamanho do pixel na imagem de origem, se já souber (ex.: 8 para uma arte ampliada 8x). Padrão: detecta sozinho"),
  cores: z.number().int().min(2).max(255).default(32).describe("Máximo de cores (median cut)"),
  fundo: z.string().default("auto").describe('"auto" (cor dos 4 cantos vira transparente), "nenhum" ou "#rrggbb"'),
  camada: z.string().optional().describe("Camada onde gravar (padrão: a de cima)"),
  ajustar_canvas: z.boolean().default(true).describe("Redimensiona o canvas para o tamanho importado"),
});

const CompareImage = z.object({
  path: z.string().min(1).describe("PNG de referência"),
  frame: z.number().int().min(0).default(0),
  fundo: z.string().default("auto").describe('"auto", "nenhum" ou "#rrggbb"'),
});

const ExportFile = z.object({
  format: z.enum(["gif", "spritesheet_png", "frame_png", "json"]),
  path: z.string().min(1).describe("Arquivo de saída (relativo ao diretório atual), ex. saida/slime.gif"),
  scale: z.number().int().min(1).max(16).optional().describe("Ampliação dos pixels (omita para escolher sozinho: sprite ~512 px, cena ~960 px)"),
  fundo: z.string().optional().describe("Fundo sólido #rrggbb (omita para transparente)"),
  margem: z.number().int().min(0).max(64).optional().describe("Margem em volta, em pixels do canvas"),
  sombra: z.boolean().optional().describe("Sombra elíptica no chão sob a figura"),
  vai_e_volta: z.boolean().optional().describe("GIF/folha em ida e volta (0..n-1..1)"),
  meta: z.boolean().optional().describe("spritesheet_png: grava também <arquivo>.json com a posição, o tamanho e a duração de cada frame (para engines de jogo)"),
  columns: z.number().int().min(1).max(128).optional().describe("spritesheet_png: colunas (padrão: todos em uma linha)"),
  frame: z.number().int().min(0).default(0).describe("frame_png: qual frame"),
});

type Content = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };

export function createAnimaServer(store = new ProjectStore()) {
  const server = new Server(
    { name: "anima-o", version: VERSION },
    { capabilities: { tools: { listChanged: true } }, instructions: SYSTEM_PROMPT + MCP_NOTES },
  );

  let rigOn = process.env.ANIMA_TOOLS === "all" || process.env.ANIMA_RIG === "1";
  const tools = [
    {
      name: "habilitar_ferramentas",
      description: "Liga o grupo de ferramentas de ESQUELETO (rig_create, rig_part, rig_pose, rig_bake, rig_bone, rig_walk) e de FIGURA HUMANA (draw_figure). Ficam escondidas por padrão para poupar tokens; chame antes de usá-las.",
      inputSchema: jsonSchemaOf(EnableTools),
    },
    {
      name: "open_project",
      description: "Abre um projeto .anima.json (ou cria um novo, se não existir). Todos os outros comandos atuam no projeto aberto e salvam nele.",
      inputSchema: jsonSchemaOf(OpenProject),
    },
    {
      name: "export_file",
      description: "Exporta o projeto aberto para um arquivo no disco: gif (animação), spritesheet_png (frames lado a lado, para jogos), frame_png (um frame) ou json.",
      inputSchema: jsonSchemaOf(ExportFile),
    },
    // o "export" da engine baixa no navegador; aqui ele é substituído por export_file
    {
      name: "import_image",
      description: "IMPORTA um PNG para a grade de pixel art: detecta o tamanho do pixel de uma arte ampliada (ou reamostra para `largura`), corta à grade pela cor mais frequente de cada célula, torna o fundo transparente e quantiza a paleta (median cut). Use para trazer uma referência, ou a saída de um gerador de imagem, e então contornar, sombrear, animar e conferir com a engine.",
      inputSchema: jsonSchemaOf(ImportImage),
    },
    {
      name: "compare_image",
      description: "COMPARA o desenho com uma imagem de referência reduzida à mesma grade: sobreposição da silhueta, erro médio de cor, as piores regiões e um painel [referência | desenho | diferença]. Use para ficar FIEL a uma foto ou arte (confira de tempos em tempos, corrija as regiões piores).",
      inputSchema: jsonSchemaOf(CompareImage),
    },
    ...commandTools(["export"]),
  ];

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: tools.filter((t) => rigOn || !RIG_TOOLS.includes(t.name)) }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    const reply = (content: Content[], isError = false) => ({ content, isError });
    try {
      if (name === "open_project") {
        const i = OpenProject.parse(args ?? {});
        const { created } = await store.open(i.path, i.create, i.overwrite);
        return reply([{ type: "text", text: `${created ? "Projeto criado" : "Projeto aberto"}: ${store.path}\n${describeProject(store.project)}` }]);
      }
      if (name === "habilitar_ferramentas") {
        EnableTools.parse(args ?? {});
        rigOn = true;
        await server.sendToolListChanged();
        return reply([{ type: "text", text: `Ferramentas ligadas: ${RIG_TOOLS.join(", ")}. Use "anima tools <nome>" na CLI ou o schema atualizado da lista para ver os parâmetros.` }]);
      }
      if (!rigOn && RIG_TOOLS.includes(name)) return reply([{ type: "text", text: `A ferramenta ${name} está desligada por padrão (economiza tokens). Chame habilitar_ferramentas {"grupo":"rig"} primeiro e repita.` }], true);
      const project: Project = await store.current();
      if (name === "import_image") {
        const i = ImportImage.parse(args ?? {});
        const dec = decodePNG(await readFile(path.resolve(process.cwd(), i.path)));
        const r = importImage(dec, { largura: i.largura, altura: i.altura, grade: i.grade ?? "auto", cores: i.cores, fundo: i.fundo });
        if (i.ajustar_canvas && (r.width !== project.width || r.height !== project.height)) { const rr = runCommand(project, "set_canvas", { width: r.width, height: r.height }); if (!rr.ok) throw new Error(rr.text); }
        const out = importIntoProject(project, r, { camada: i.camada });
        await store.save();
        const shown = runCommand(project, "view", { as_text: false });
        const content: Content[] = [{ type: "text", text: `Importado: ${r.width}x${r.height} px (pixel da origem ${r.cell || "reamostrado"}x), ${r.palette.length} cor(es) (${out.adicionadas} nova(s)), fundo ${r.fundo ?? "nenhum"} → camada "${out.camada}".` }];
        if (shown.ok && shown.images) for (const img of renderImages(project, shown.images)) content.push({ type: "image", data: encodePNG(img.width, img.height, img.data).toString("base64"), mimeType: "image/png" });
        return reply(content);
      }
      if (name === "compare_image") {
        const i = CompareImage.parse(args ?? {});
        const ref = importImage(decodePNG(await readFile(path.resolve(process.cwd(), i.path))), { largura: project.width, altura: project.height, cores: 255, fundo: i.fundo });
        const r = compareToReference(project, i.frame, ref);
        return reply([{ type: "text", text: r.text }, { type: "image", data: encodePNG(r.image.width, r.image.height, r.image.data).toString("base64"), mimeType: "image/png" }]);
      }
      if (name === "export_file") {
        const i = ExportFile.parse(args ?? {});
        const out = await exportToFile(project, { ...i, vaiEVolta: i.vai_e_volta, meta: i.meta });
        return reply([{ type: "text", text: `Exportado: ${out}${(avisoVazio(project) ?? avisoFundo(project, i.fundo)) ? `\n${avisoVazio(project) ?? avisoFundo(project, i.fundo)}` : ""}` }]);
      }
      const r = runCommand(project, name, args ?? {});
      if (r.ok && r.changed) await store.save();
      const content: Content[] = [{ type: "text", text: r.text }];
      if (r.ok && r.images) {
        for (const img of renderImages(project, r.images)) {
          content.push({ type: "text", text: `Imagem (${img.label}):` });
          content.push({ type: "image", data: encodePNG(img.width, img.height, img.data).toString("base64"), mimeType: "image/png" });
        }
      }
      return reply(content, !r.ok);
    } catch (e) {
      const msg = e instanceof z.ZodError ? z.prettifyError(e) : (e as Error).message;
      return reply([{ type: "text", text: `Erro em ${name}: ${msg}` }], true);
    }
  });

  return server;
}

export async function startStdio() {
  const server = createAnimaServer();
  await server.connect(new StdioServerTransport());
}

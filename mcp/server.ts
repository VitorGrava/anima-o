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
import { describeProject, jsonSchemaOf, commandTools, renderImages, runCommand, type Project } from "../src/engine/index.ts";
import { SYSTEM_PROMPT } from "../server/prompt.ts";
import { encodePNG } from "../server/png.ts";
import { ProjectStore, exportToFile } from "./store.ts";

const VERSION = "0.2.0";

const MCP_NOTES = `

Como usar estas ferramentas (MCP)
- O trabalho acontece em um arquivo de projeto .anima.json. Comece com open_project (abre ou cria). Se você não abrir nenhum, o padrão é ./animacao.anima.json no diretório atual.
- Cada comando que muda o projeto salva o arquivo na hora. O usuário pode acompanhar ao vivo no navegador com: anima view <arquivo>.
- Os comandos de desenho (draw_rows, draw_shapes, transform, copy_layer_content) já devolvem o frame editado como grade de texto + imagem + avisos automáticos: leia o retorno e corrija antes de seguir. view faz zoom (region, grid), diff entre frames (compare) e onion skin; check mede e aponta defeitos em todos os frames; reference traz proporções de anatomia e técnicas de pixel art.
- Para gerar arquivos (GIF, spritesheet PNG, PNG de um frame ou JSON), use export_file. Só exporte quando o usuário pedir ou ao terminar uma animação.
- Ao terminar, diga ao usuário onde estão o projeto e os arquivos exportados.`;

const OpenProject = z.object({
  path: z.string().min(1).describe("Caminho do arquivo .anima.json (relativo ao diretório atual)"),
  create: z
    .object({
      name: z.string().max(80).optional(),
      width: z.number().int().min(1).max(256).optional(),
      height: z.number().int().min(1).max(256).optional(),
      fps: z.number().min(1).max(60).optional(),
    })
    .optional()
    .describe("Se o arquivo não existir, cria um projeto novo com estas opções"),
  overwrite: z.boolean().default(false).describe("true: cria um projeto novo mesmo se o arquivo existir (apaga o anterior)"),
});

const ExportFile = z.object({
  format: z.enum(["gif", "spritesheet_png", "frame_png", "json"]),
  path: z.string().min(1).describe("Arquivo de saída (relativo ao diretório atual), ex. saida/slime.gif"),
  scale: z.number().int().min(1).max(16).default(4).describe("Ampliação dos pixels"),
  columns: z.number().int().min(1).max(128).optional().describe("spritesheet_png: colunas (padrão: todos em uma linha)"),
  frame: z.number().int().min(0).default(0).describe("frame_png: qual frame"),
});

type Content = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };

export function createAnimaServer(store = new ProjectStore()) {
  const server = new Server(
    { name: "anima-o", version: VERSION },
    { capabilities: { tools: {} }, instructions: SYSTEM_PROMPT + MCP_NOTES },
  );

  const tools = [
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
    ...commandTools(["export"]),
  ];

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    const reply = (content: Content[], isError = false) => ({ content, isError });
    try {
      if (name === "open_project") {
        const i = OpenProject.parse(args ?? {});
        const { created } = await store.open(i.path, i.create, i.overwrite);
        return reply([{ type: "text", text: `${created ? "Projeto criado" : "Projeto aberto"}: ${store.path}\n${describeProject(store.project)}` }]);
      }
      const project: Project = await store.current();
      if (name === "export_file") {
        const i = ExportFile.parse(args ?? {});
        const out = await exportToFile(project, i);
        return reply([{ type: "text", text: `Exportado: ${out}` }]);
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

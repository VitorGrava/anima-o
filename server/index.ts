/**
 * Servidor único: API do agente (/api/chat, SSE) + interface web.
 * Em desenvolvimento usa o Vite em modo middleware; em produção serve dist/.
 */
import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createProject, fromJSON, type ProjectJSON } from "../src/engine/index.ts";
import { MODEL, runAgent, type AgentEvent, type Session } from "./agent.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
try {
  process.loadEnvFile(path.join(root, ".env"));
} catch {
  /* .env é opcional */
}

const PORT = Number(process.env.PORT || 5173);
const isProd = process.env.NODE_ENV === "production";
const sessions = new Map<string, Session>();
let client: Anthropic | null = null;

function getClient(): Anthropic {
  client ??= new Anthropic();
  return client;
}

async function readBody(req: IncomingMessage, limit = 20 * 1024 * 1024): Promise<string> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > limit) throw new Error("Requisição grande demais.");
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function errorMessage(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "Chave da API inválida ou ausente. Configure ANTHROPIC_API_KEY no arquivo .env.";
  if (err instanceof Anthropic.RateLimitError) return "Limite de requisições atingido. Aguarde um pouco e tente de novo.";
  if (err instanceof Anthropic.APIError) return `Erro da API (${err.status}): ${err.message}`;
  if (err instanceof Error && /credentials|apiKey|API key/i.test(err.message)) {
    return "Chave da API ausente. Copie .env.example para .env e preencha ANTHROPIC_API_KEY.";
  }
  return err instanceof Error ? err.message : String(err);
}

async function handleChat(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = JSON.parse(await readBody(req)) as { sessionId?: string; text?: string; project?: ProjectJSON };
  const text = body.text?.trim();
  if (!text) {
    res.writeHead(400).end("Mensagem vazia.");
    return;
  }
  const sessionId = body.sessionId && sessions.has(body.sessionId) ? body.sessionId : randomUUID();
  const session = sessions.get(sessionId) ?? { messages: [] };
  sessions.set(sessionId, session);
  // O navegador é a fonte da verdade do projeto (o usuário pode editar à mão entre mensagens).
  const project = body.project ? fromJSON(body.project) : createProject();

  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  const send = (e: AgentEvent | { type: "session"; sessionId: string }) => res.write(`data: ${JSON.stringify(e)}\n\n`);
  send({ type: "session", sessionId });

  const abort = new AbortController();
  res.on("close", () => abort.abort());
  try {
    await runAgent({ client: getClient(), session, project, userText: text, emit: send, signal: abort.signal });
  } catch (err) {
    if (!abort.signal.aborted) {
      console.error(err);
      send({ type: "error", message: errorMessage(err) });
      send({ type: "done", stopReason: "error" });
    }
  }
  res.end();
}

async function main() {
  let vite: import("vite").ViteDevServer | null = null;
  if (!isProd) {
    const { createServer: createVite } = await import("vite");
    vite = await createVite({ root, server: { middlewareMode: true }, appType: "spa" });
  }

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (url.pathname === "/api/chat" && req.method === "POST") return await handleChat(req, res);
      if (url.pathname === "/api/reset" && req.method === "POST") {
        const { sessionId } = JSON.parse((await readBody(req)) || "{}");
        sessions.delete(sessionId);
        return void res.writeHead(204).end();
      }
      if (url.pathname === "/api/health") {
        res.writeHead(200, { "content-type": "application/json" });
        return void res.end(JSON.stringify({ ok: true, model: MODEL, hasKey: Boolean(process.env.ANTHROPIC_API_KEY) }));
      }
      if (vite) return vite.middlewares(req, res);
      // produção: arquivos estáticos de dist/
      const dist = path.join(root, "dist");
      const file = path.join(dist, path.normalize(url.pathname === "/" ? "/index.html" : url.pathname));
      if (!file.startsWith(dist)) return void res.writeHead(403).end();
      const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
      try {
        const data = await readFile(file);
        res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" }).end(data);
      } catch {
        res.writeHead(200, { "content-type": "text/html" }).end(await readFile(path.join(dist, "index.html")));
      }
    } catch (err) {
      console.error(err);
      if (!res.headersSent) res.writeHead(500).end(errorMessage(err));
      else res.end();
    }
  });

  server.listen(PORT, () => {
    console.log(`\n  anima-o rodando em http://localhost:${PORT}  (modelo: ${MODEL})`);
    if (!process.env.ANTHROPIC_API_KEY) console.log("  ⚠ ANTHROPIC_API_KEY não definida — crie um .env (veja .env.example).\n");
  });
}

main();

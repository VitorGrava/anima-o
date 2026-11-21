/**
 * Loop do agente: conversa com o Claude, executa as ferramentas da engine e
 * transmite cada passo (texto, ferramenta, novo estado do projeto) para a UI.
 */
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  COMMANDS,
  describeProject,
  renderCheckRGBA,
  runCommand,
  toJSON,
  type CommandResult,
  type Project,
  type ProjectJSON,
} from "../src/engine/index.ts";
import { encodePNG } from "./png.ts";
import { SYSTEM_PROMPT } from "./prompt.ts";

export const MODEL = process.env.ANIMA_MODEL || "claude-opus-5-5";
const EFFORT = (process.env.ANIMA_EFFORT || "high") as "low" | "medium" | "high" | "xhigh" | "max";
const MAX_TOOL_TURNS = 60;

export type AgentEvent =
  | { type: "text"; delta: string }
  | { type: "thinking"; delta: string }
  | { type: "tool"; id: string; name: string; input: unknown; ok: boolean; result: string }
  | { type: "project"; project: ProjectJSON }
  | { type: "effect"; effect: NonNullable<CommandResult["effect"]> }
  | { type: "done"; stopReason: string | null }
  | { type: "error"; message: string };

export interface Session {
  messages: Anthropic.Beta.BetaMessageParam[];
}

/** As ferramentas vêm direto dos schemas Zod da engine — uma única fonte de verdade. */
export const TOOLS: Anthropic.Beta.BetaTool[] = COMMANDS.map((c) => {
  const { $schema: _ignored, ...schema } = stripSafeIntBounds(z.toJSONSchema(c.schema, { io: "input" })) as Record<string, unknown>;
  return {
    name: c.name,
    description: c.description,
    input_schema: schema as Anthropic.Beta.BetaTool.InputSchema,
    // entradas grandes (draw_rows) chegam em streaming; a validação é feita por runCommand (Zod)
    eager_input_streaming: true,
  };
});

/** Remove os limites ±MAX_SAFE_INTEGER que o Zod adiciona a todo inteiro (só ruído no prompt). */
function stripSafeIntBounds(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripSafeIntBounds);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    if ((k === "minimum" || k === "maximum") && Math.abs(v as number) === Number.MAX_SAFE_INTEGER) continue;
    out[k] = stripSafeIntBounds(v);
  }
  return out;
}

function toolResultContent(p: Project, r: CommandResult): Anthropic.Beta.BetaToolResultBlockParam["content"] {
  const content: Exclude<Anthropic.Beta.BetaToolResultBlockParam["content"], string | undefined> = [
    { type: "text", text: r.text },
  ];
  for (const f of r.images?.frames ?? []) {
    const mode = r.images!.mode ?? "normal";
    const img = renderCheckRGBA(p, f, r.images!.scale, mode);
    const legend = mode === "normal" ? "fundo cinza = transparente" : `modo de conferência: ${mode}`;
    content.push({ type: "text", text: `Imagem do frame ${f} (${legend}):` });
    content.push({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: encodePNG(img.width, img.height, img.data).toString("base64") },
    });
  }
  return content;
}

export async function runAgent(opts: {
  client: Anthropic;
  session: Session;
  project: Project;
  userText: string;
  emit: (e: AgentEvent) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const { client, session, project, emit, signal } = opts;

  session.messages.push({
    role: "user",
    content: [
      { type: "text", text: `[Estado atual do projeto]\n${describeProject(project)}` },
      { type: "text", text: opts.userText },
    ],
  });

  let jsonRetries = 0;
  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    if (signal?.aborted) return;

    const stream = client.beta.messages.stream(
      {
        model: MODEL,
        max_tokens: 64000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        thinking: { type: "adaptive", display: "summarized" },
        output_config: { effort: EFFORT },
        cache_control: { type: "ephemeral" },
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages: session.messages,
      },
      { signal },
    );
    stream.on("text", (delta) => emit({ type: "text", delta }));
    stream.on("thinking", (delta) => emit({ type: "thinking", delta }));

    let message: Anthropic.Beta.BetaMessage;
    try {
      message = await stream.finalMessage();
      jsonRetries = 0;
    } catch (err) {
      if (signal?.aborted) return;
      // Erros de API sobem; JSON de ferramenta ilegível / conexão caída: tenta o turno de novo.
      if (err instanceof Anthropic.APIError || jsonRetries++ >= 2) throw err;
      continue;
    }

    if (message.stop_reason === "refusal") {
      session.messages.push({ role: "assistant", content: message.content });
      emit({ type: "error", message: "O modelo recusou este pedido. Tente reformular." });
      emit({ type: "done", stopReason: "refusal" });
      return;
    }

    session.messages.push({ role: "assistant", content: message.content });

    if (message.stop_reason === "pause_turn") continue;

    const toolUses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (toolUses.length === 0) {
      emit({ type: "done", stopReason: message.stop_reason });
      return;
    }
    if (message.stop_reason === "max_tokens") {
      // Entrada de ferramenta truncada: não executa, avisa o modelo.
      session.messages.push({
        role: "user",
        content: toolUses.map((t) => ({
          type: "tool_result" as const,
          tool_use_id: t.id,
          is_error: true,
          content: "Entrada truncada (limite de tokens). Divida em chamadas menores.",
        })),
      });
      continue;
    }

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const t of toolUses) {
      const r = runCommand(project, t.name, t.input);
      emit({ type: "tool", id: t.id, name: t.name, input: t.input, ok: r.ok, result: r.text });
      if (r.changed) emit({ type: "project", project: toJSON(project) });
      if (r.effect) emit({ type: "effect", effect: r.effect });
      results.push({
        type: "tool_result",
        tool_use_id: t.id,
        is_error: !r.ok || undefined,
        content: r.ok ? toolResultContent(project, r) : r.text,
      });
    }
    session.messages.push({ role: "user", content: results });
  }

  emit({ type: "error", message: `Limite de ${MAX_TOOL_TURNS} passos atingido. Peça para continuar.` });
  emit({ type: "done", stopReason: "max_turns" });
}

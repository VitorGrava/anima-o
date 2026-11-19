import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { runAgent, TOOLS, type AgentEvent, type Session } from "../server/agent.ts";
import { createProject, frameToRows } from "../src/engine/index.ts";

/** Cliente falso: devolve respostas roteirizadas e grava as requisições. */
function fakeClient(script: Partial<Anthropic.Beta.BetaMessage>[]) {
  const requests: any[] = [];
  let i = 0;
  const client = {
    beta: {
      messages: {
        stream(params: any) {
          requests.push(structuredClone(params));
          const msg = { role: "assistant", type: "message", stop_reason: "end_turn", ...script[i++] };
          const handlers: Record<string, (d: string) => void> = {};
          return {
            on(ev: string, fn: (d: string) => void) {
              handlers[ev] = fn;
              return this;
            },
            async finalMessage() {
              for (const b of msg.content ?? []) if (b.type === "text") handlers.text?.(b.text);
              return msg;
            },
          };
        },
      },
    },
  };
  return { client: client as unknown as Anthropic, requests };
}

describe("loop do agente", () => {
  it("executa ferramentas, devolve resultados com imagem e transmite o projeto", async () => {
    const { client, requests } = fakeClient([
      {
        stop_reason: "tool_use",
        content: [
          { type: "tool_use", id: "t1", name: "set_palette", input: { colors: [{ key: "r", hex: "#ff0000", name: "vermelho" }] } },
          { type: "tool_use", id: "t2", name: "draw_rows", input: { rows: ["rr"] } },
        ] as any,
      },
      { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t3", name: "view", input: {} }] as any },
      { stop_reason: "end_turn", content: [{ type: "text", text: "Pronto!" }] as any },
    ]);
    const project = createProject({ width: 4, height: 2 });
    const session: Session = { messages: [] };
    const events: AgentEvent[] = [];
    await runAgent({ client, session, project, userText: "desenha", emit: (e) => events.push(e) });

    expect(frameToRows(project, 0)[0]).toBe("rr..");
    expect(events.filter((e) => e.type === "tool").map((e) => (e as any).name)).toEqual(["set_palette", "draw_rows", "view"]);
    expect(events.some((e) => e.type === "project")).toBe(true);
    expect(events.at(-1)).toEqual({ type: "done", stopReason: "end_turn" });

    // os dois tool_results da 1ª rodada vão juntos numa única mensagem
    const second = requests[1].messages.at(-1);
    expect(second.content.map((b: any) => b.tool_use_id)).toEqual(["t1", "t2"]);
    // o view devolve imagem PNG para o modelo
    const viewResult = requests[2].messages.at(-1).content[0].content;
    expect(viewResult.some((b: any) => b.type === "image" && b.source.media_type === "image/png")).toBe(true);
    // histórico termina com a resposta final do assistente
    expect(session.messages.at(-1)?.role).toBe("assistant");
    expect(requests[0].model).toBe("claude-opus-5-5");
  });

  it("erros de ferramenta voltam como is_error sem quebrar o loop", async () => {
    const { client, requests } = fakeClient([
      { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "draw_rows", input: { rows: ["zz"] } }] as any },
      { stop_reason: "end_turn", content: [{ type: "text", text: "ok" }] as any },
    ]);
    await runAgent({ client, session: { messages: [] }, project: createProject(), userText: "x", emit: () => {} });
    const res = requests[1].messages.at(-1).content[0];
    expect(res.is_error).toBe(true);
    expect(res.content).toMatch(/não está na paleta/);
  });

  it("schemas das ferramentas são objetos JSON Schema válidos", () => {
    expect(TOOLS.length).toBeGreaterThan(10);
    for (const t of TOOLS) {
      expect(t.input_schema.type).toBe("object");
      expect(JSON.stringify(t.input_schema)).not.toContain("9007199254740991");
    }
  });
});

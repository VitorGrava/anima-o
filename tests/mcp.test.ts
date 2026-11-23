import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

type ToolResult = { content: { type: string; text?: string; data?: string; mimeType?: string }[]; isError?: boolean };

describe("servidor MCP (stdio, como Claude Code/Codex usam)", () => {
  let client: Client;
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "anima-mcp-"));
    client = new Client({ name: "teste", version: "1.0.0" });
    await client.connect(new StdioClientTransport({ command: "node", args: [path.join(ROOT, "bin/anima.mjs"), "mcp"], cwd: dir }));
  }, 30000);

  afterAll(async () => {
    await client?.close();
  });

  const call = (name: string, args: Record<string, unknown> = {}) =>
    client.callTool({ name, arguments: args }) as Promise<ToolResult>;

  it("anuncia as ferramentas e as instruções com os princípios de animação", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["open_project", "export_file", "draw_rows", "view", "transform", "check", "reference"]));
    expect(names).not.toContain("export");
    expect(names).toEqual(expect.arrayContaining(["import_image", "compare_image", "avaliar", "polish", "batch", "habilitar_ferramentas"]));
    // rig e figura humana ficam escondidos até alguém pedir (poupa tokens)
    for (const n of ["draw_figure", "rig_create", "rig_pose", "rig_bake"]) expect(names).not.toContain(n);
    expect(client.getInstructions()).toMatch(/Princípios de animação/);
    expect(client.getInstructions()).toMatch(/Anatomia/);
  });

  it("rig_* e draw_figure: erro útil enquanto desligados; habilitar_ferramentas liga e avisa a lista", async () => {
    let r = await call("rig_create", { template: "humanoide" });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/habilitar_ferramentas/);
    r = await call("habilitar_ferramentas", { grupo: "rig" });
    expect(r.isError).toBeFalsy();
    const names = (await client.listTools()).tools.map((t) => t.name);
    for (const n of ["draw_figure", "rig_create", "rig_pose", "rig_bake", "rig_walk"]) expect(names).toContain(n);
  });

  it("desenha, salva em disco a cada mudança, mostra imagem e exporta GIF", async () => {
    let r = await call("open_project", { path: "coracao.anima.json", create: { width: 9, height: 8 } });
    expect(r.content[0].text).toMatch(/Projeto criado/);

    r = await call("set_palette", { colors: [{ key: "r", hex: "#e43b44", name: "vermelho" }] });
    expect(r.isError).toBeFalsy();
    r = await call("draw_rows", { x: 1, y: 1, rows: [".00.00.", "0rr0rr0", "0rrrrr0", ".0rrr0.", "..0r0..", "...0..."] });
    expect(r.isError).toBeFalsy();
    // o comando de desenho já devolve o resultado: grade de texto + imagem, sem precisar chamar view
    expect(r.content[0].text).toMatch(/Frame 0 agora:/);
    expect(r.content.some((c) => c.type === "image" && c.mimeType === "image/png")).toBe(true);

    const saved = JSON.parse(await readFile(path.join(dir, "coracao.anima.json"), "utf8"));
    expect(saved.palette.some((c: { key: string }) => c.key === "r")).toBe(true);

    r = await call("view", { check: "silhueta" });
    const img = r.content.find((c) => c.type === "image");
    expect(img?.mimeType).toBe("image/png");
    expect(Buffer.from(img!.data!, "base64").subarray(1, 4).toString()).toBe("PNG");

    r = await call("add_frames", { count: 1, copy_from: 0 });
    r = await call("export_file", { format: "gif", path: "saida/coracao.gif", scale: 4 });
    expect(r.content[0].text).toMatch(/Exportado/);
    expect((await stat(path.join(dir, "saida/coracao.gif"))).size).toBeGreaterThan(50);
  });

  it("check e reference funcionam pelo MCP", async () => {
    let r = await call("check", {});
    expect(r.isError).toBeFalsy();
    expect(r.content[0].text).toMatch(/Medidas do frame 0/);
    r = await call("reference", { topic: "proporcoes", height: 32 });
    expect(r.content[0].text).toMatch(/Cabeça ≈ 8\.0 px/);
    r = await call("view", { region: { x: 0, y: 0, w: 5, h: 4 }, grid: true });
    expect(r.content[0].text).toMatch(/região x0\.\.4, y0\.\.3/);
    expect(r.content.some((c) => c.type === "image")).toBe(true);
  });

  it("erros voltam como isError com mensagem útil", async () => {
    const r = await call("draw_rows", { rows: ["zz"] });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/não está na paleta/);
  });
});

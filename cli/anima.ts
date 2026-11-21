/**
 * CLI do anima-o.
 *
 *   anima mcp                              servidor MCP (Claude Code, Codex, ...)
 *   anima view [projeto.anima.json]        abre o app no navegador acompanhando o arquivo ao vivo
 *   anima new <projeto> [LxA] [fps]        cria um projeto vazio
 *   anima run <projeto> <comandos.json|->  aplica uma lista de comandos [{ "name", "input" }]
 *   anima show <projeto> [frame] [--png saida.png] [--check cinza|luz_sombra|silhueta]
 *   anima export <projeto> <saida.gif|.png|.json> [--scale N] [--columns N] [--frame N]
 *   anima tools                            lista os comandos com seus parâmetros (JSON Schema)
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  commandTools,
  describeProject,
  frameToRows,
  renderCheckRGBA,
  runCommand,
  withRuler,
  type CheckMode,
} from "../src/engine/index.ts";
import { encodePNG } from "../server/png.ts";
import { ProjectStore, exportToFile } from "../mcp/store.ts";
import { writeFile } from "node:fs/promises";

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

const USAGE = `anima — engine de animação pixel art

  anima mcp                              servidor MCP para Claude Code, Codex e outros agentes
  anima view [projeto.anima.json]        abre o app no navegador acompanhando o arquivo ao vivo
  anima new <projeto> [LxA] [fps]        cria um projeto vazio
  anima run <projeto> <comandos.json|->  aplica comandos [{"name": "...", "input": {...}}]
  anima show <projeto> [frame] [--png saida.png] [--check cinza|luz_sombra|silhueta]
  anima export <projeto> <saida.gif|.png|.json> [--scale N] [--columns N] [--frame N]
  anima tools                            lista os comandos e parâmetros (JSON Schema)`;

export async function main(argv: string[]): Promise<number> {
  const args = [...argv];
  const cmd = args.shift();
  const store = new ProjectStore();

  switch (cmd) {
    case "mcp": {
      const { startStdio } = await import("../mcp/server.ts");
      await startStdio();
      return -1; // continua rodando
    }
    case "view": {
      const file = args[0] ? path.resolve(args[0]) : undefined;
      process.env.ANIMA_WATCH_ROOT = process.cwd();
      const port = Number(process.env.PORT || 5173);
      await import("../server/index.ts");
      const url = `http://localhost:${port}/${file ? `?watch=${encodeURIComponent(path.relative(process.cwd(), file))}` : ""}`;
      console.log(`\n  Abra: ${url}\n`);
      return -1;
    }
    case "new": {
      const [file, size = "32x32", fps = "8"] = args;
      if (!file) break;
      const [w, h] = size.toLowerCase().split("x").map(Number);
      await store.open(file, { width: w, height: h || w, fps: Number(fps) }, true);
      console.log(`Criado: ${store.path}\n${describeProject(store.project)}`);
      return 0;
    }
    case "run": {
      const [file, src] = args;
      if (!file || !src) break;
      await store.open(file);
      const list = JSON.parse(src === "-" ? await readStdin() : await readFile(src, "utf8")) as { name: string; input?: unknown }[];
      let fails = 0;
      for (const [n, c] of (Array.isArray(list) ? list : [list]).entries()) {
        const r = runCommand(store.project, c.name, c.input ?? {});
        console.log(`${r.ok ? "ok " : "ERRO"} #${n} ${c.name}: ${r.text.split("\n")[0]}`);
        if (!r.ok) fails++;
      }
      await store.save();
      console.log(`\n${describeProject(store.project)}`);
      return fails ? 1 : 0;
    }
    case "show": {
      const png = flag(args, "png");
      const check = (flag(args, "check") ?? "normal") as CheckMode;
      const [file, frame = "0"] = args;
      if (!file) break;
      await store.open(file);
      const f = Number(frame);
      const p = store.project;
      if (f >= p.frames.length) throw new Error(`Frame ${f} não existe (há ${p.frames.length}).`);
      console.log(`${describeProject(p)}\n\nFrame ${f}:\n${withRuler(frameToRows(p, f))}`);
      if (png) {
        const img = renderCheckRGBA(p, f, Math.max(1, Math.floor(256 / Math.max(p.width, p.height))), check);
        await writeFile(png, encodePNG(img.width, img.height, img.data));
        console.log(`\nImagem: ${path.resolve(png)}`);
      }
      return 0;
    }
    case "export": {
      const scale = Number(flag(args, "scale") ?? 4);
      const columns = flag(args, "columns");
      const frame = flag(args, "frame");
      const [file, out] = args;
      if (!file || !out) break;
      await store.open(file);
      const format = out.endsWith(".gif") ? "gif" : out.endsWith(".json") ? "json" : frame !== undefined ? "frame_png" : "spritesheet_png";
      const done = await exportToFile(store.project, {
        format, path: out, scale, columns: columns ? Number(columns) : undefined, frame: Number(frame ?? 0),
      });
      console.log(`Exportado: ${done}`);
      return 0;
    }
    case "tools": {
      console.log(JSON.stringify(commandTools(["export"]), null, 1));
      return 0;
    }
  }
  console.log(USAGE);
  return cmd && cmd !== "help" && cmd !== "--help" ? 1 : 0;
}

/**
 * CLI do anima-o.
 *
 *   anima mcp                              servidor MCP (Claude Code, Codex, ...)
 *   anima view [projeto.anima.json]        abre o app no navegador acompanhando o arquivo ao vivo
 *   anima new <projeto> [LxA] [fps]        cria um projeto vazio
 *   anima run <projeto> <comandos.json|->  aplica uma lista de comandos [{ "name", "input" }]
 *   anima show <projeto> [frame] [--png saida.png] [--check cinza|luz_sombra|silhueta]
             [--region x,y,w,h] [--grid] [--diff a,b] [--onion] [--scale N]
  anima check <projeto> [--symmetric] [--png saida.png]   aponta defeitos da arte e da animação
  anima reference <tópico> [--height N] [--style realista|estilizado|chibi] [--color #hex]
 *              [--region x,y,w,h] [--grid] [--diff a,b] [--onion] [--scale N]
 *   anima check <projeto> [--symmetric] [--png saida.png]   aponta defeitos da arte e da animação
 *   anima reference <tópico> [--height N] [--style realista|estilizado|chibi] [--color #hex]
 *   anima export <projeto> <saida.gif|.png|.json> [--scale N] [--columns N] [--frame N]
 *   anima tools                            lista os comandos com seus parâmetros (JSON Schema)
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  REFERENCE_TOPICS,
  commandTools,
  createProject,
  describeProject,
  renderImages,
  runCommand,
  type CommandResult,
  type Project,
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

function boolFlag(args: string[], name: string): boolean {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return false;
  args.splice(i, 1);
  return true;
}

/** Salva as imagens pedidas por um comando; vários frames viram arquivo-1.png, arquivo-2.png... */
async function saveImages(p: Project, r: CommandResult, png: string): Promise<void> {
  const imgs = r.images ? renderImages(p, r.images) : [];
  for (const [n, img] of imgs.entries()) {
    const file = imgs.length > 1 ? png.replace(/(\.png)?$/, `-${n}.png`) : png;
    await writeFile(file, encodePNG(img.width, img.height, img.data));
    console.log(`Imagem (${img.label}): ${path.resolve(file)}`);
  }
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
  anima run <projeto> <comandos.json|-> [--png prévia.png]
                                         aplica comandos [{"name": "...", "input": {...}}]; o último mostra a prévia
  anima show <projeto> [frame] [--png saida.png] [--check cinza|luz_sombra|silhueta]
             [--region x,y,w,h] [--grid] [--diff a,b] [--onion] [--scale N]
  anima check <projeto> [--symmetric] [--png saida.png]   aponta defeitos da arte e da animação
  anima reference <tópico> [--height N] [--style realista|estilizado|chibi] [--color #hex]
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
      const png = flag(args, "png");
      const [file, src] = args;
      if (!file || !src) break;
      await store.open(file);
      const list = JSON.parse(src === "-" ? await readStdin() : await readFile(src, "utf8")) as { name: string; input?: unknown }[];
      let fails = 0;
      const cmds = Array.isArray(list) ? list : [list];
      for (const [n, c] of cmds.entries()) {
        const r = runCommand(store.project, c.name, c.input ?? {});
        const last = n === cmds.length - 1;
        // o último comando mostra tudo (prévia, avisos); os outros, só a primeira linha
        console.log(`${r.ok ? "ok " : "ERRO"} #${n} ${c.name}: ${last ? r.text : r.text.split("\n")[0]}`);
        if (!r.ok) fails++;
        if (last && png) await saveImages(store.project, r, png);
      }
      await store.save();
      console.log(`\n${describeProject(store.project)}`);
      return fails ? 1 : 0;
    }
    case "show": {
      const png = flag(args, "png");
      const check = flag(args, "check") ?? "normal";
      const region = flag(args, "region");
      const diff = flag(args, "diff");
      const scale = flag(args, "scale");
      const grid = boolFlag(args, "grid");
      const onion = boolFlag(args, "onion");
      const [file, frame = "0"] = args;
      if (!file) break;
      await store.open(file);
      const p = store.project;
      const input: Record<string, unknown> = { frames: Number(frame), check, grid, onion };
      if (region) {
        const [x, y, w, h] = region.split(",").map(Number);
        input.region = { x, y, w, h };
      }
      if (diff) {
        const [a, b] = diff.split(",").map(Number);
        input.compare = { a, b };
      }
      if (scale) input.image_scale = Number(scale);
      const r = runCommand(p, "view", input);
      console.log(`${describeProject(p)}\n\n${r.text}`);
      if (!r.ok) return 1;
      if (png) await saveImages(p, r, png);
      return 0;
    }
    case "check": {
      const png = flag(args, "png");
      const symmetric = boolFlag(args, "symmetric");
      const [file] = args;
      if (!file) break;
      await store.open(file);
      const r = runCommand(store.project, "check", { symmetric });
      console.log(r.text);
      if (png) await saveImages(store.project, r, png);
      return r.ok ? 0 : 1;
    }
    case "reference": {
      const height = flag(args, "height");
      const style = flag(args, "style");
      const color = flag(args, "color");
      const [topic] = args;
      if (!topic || !(REFERENCE_TOPICS as readonly string[]).includes(topic)) {
        console.log(`Tópicos: ${REFERENCE_TOPICS.join(", ")}`);
        return topic ? 1 : 0;
      }
      const r = runCommand(createProject(), "reference", {
        topic,
        height: height ? Number(height) : undefined,
        style,
        base_color: color,
      });
      console.log(r.text);
      return r.ok ? 0 : 1;
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

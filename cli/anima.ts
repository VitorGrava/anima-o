/**
 * CLI do anima-o.
 *
 *   anima mcp                              servidor MCP (Claude Code, Codex, ...)
 *   anima view [projeto.anima.json]        abre o app no navegador acompanhando o arquivo ao vivo
 *   anima new <projeto> [LxA] [fps] [--camada nome] [--cores-padrao]
                                         cria um projeto sem cores (você define a paleta); --camada: nome da primeira camada (padrão "Base"); --cores-padrao: traz as cores 0 (contorno) e 1 (branco)
 *   anima run <projeto> <comandos.json|->  aplica uma lista de comandos [{ "name", "input" }]
 *   anima show <projeto> [frame|all] [--png saida.png] [--check cinza|luz_sombra|silhueta]
             [--region x,y,w,h] [--grid] [--diff a,b] [--onion] [--bones] [--scale N]
  anima reference <tópico> [--height N] [--style realista|estilizado|chibi] [--color #hex]
 *              [--region x,y,w,h] [--grid] [--diff a,b] [--onion] [--bones] [--scale N]
 *   anima check <projeto> [--symmetric] [--efeito] [--ignorar camada,camada] [--png saida.png]
 *   anima reference <tópico> [--height N] [--style realista|estilizado|chibi] [--color #hex]
 *   anima export <projeto> <saida.gif|.png|.json> [--scale N] [--columns N] [--frame N] [--fundo #hex] [--margem N] [--sombra] [--vai-e-volta] [--meta]   (sem --scale a escala é automática; --meta grava <saida>.json com posição e duração de cada frame da folha)
  anima compare <projeto> <ref.png> [--frame N] [--png saida.png] [--fundo auto|nenhum|#hex]   (compara o desenho com uma referência na mesma grade: silhueta, erro de cor, painel lado a lado)
  anima import <projeto> <imagem.png> [--largura N|--altura N|--grade auto|N] [--cores N] [--fundo auto|nenhum|#hex] [--camada nome] [--manter-canvas]   (reduz uma imagem à grade de pixel e à paleta)
 *   anima guide                            imprime o guia do animador (fluxo e princípios): leia antes de começar
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
  importImage,
  compareToReference,
  importIntoProject,
  runCommand,
  type CommandResult,
  type Project,
} from "../src/engine/index.ts";
import { decodePNG, encodePNG } from "../server/png.ts";
import { ProjectStore, exportToFile } from "../mcp/store.ts";
import { SHORT_GUIDE, SYSTEM_PROMPT } from "../server/prompt.ts";
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

/** Flags que sobraram depois do parse são erro (antes eram ignoradas em silêncio, ex.: `--tipo efeito`). */
function rejectUnknownFlags(args: string[], cmd: string): void {
  const bad = args.filter((a) => a.startsWith("--"));
  if (bad.length) throw new Error(`flag(s) desconhecida(s) em "${cmd}": ${bad.join(", ")}. Veja \`anima help\`.`);
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
  anima run <projeto> <comandos.json|-> [--png prévia.png] [--continuar]
                                         aplica comandos [{"name": "...", "input": {...}}] EM CIMA do projeto existente (para recomeçar, rode "new", que sobrescreve); o último mostra a prévia; -q/--quiet não mostra a folha de frames
  anima show <projeto> [frame|all] [--png saida.png] [--check cinza|luz_sombra|silhueta]
             [--region x,y,w,h] [--grid] [--diff a,b] [--onion] [--bones] [--scale N]
  anima check <projeto> [--symmetric] [--efeito] [--ignorar camada,camada] [--max-cores N] [--sem codigo,codigo] [--png saida.png]
                                         defeitos da arte e da animação (--max-cores: limite de cores do estilo, ex. 16 para retrô) (--efeito: brilho, chama, fumaça; --tipo rotacao: moeda girando)
  anima reference <tópico> [--height N] [--style realista|estilizado|chibi] [--color #hex]
  anima export <projeto> <saida.gif|.png|.json> [--scale N] [--columns N] [--frame N]
  anima guide [--completo]               guia do animador (curto; --completo = o guia inteiro)
  anima tools                            lista os comandos e parâmetros (JSON Schema)`;

// `anima run ... | head` fecha o pipe no meio da saída: isso não pode derrubar o processo antes de salvar o projeto
process.stdout.on("error", (e: NodeJS.ErrnoException) => { if (e.code !== "EPIPE") throw e; });

export async function main(argv: string[]): Promise<number> {
  // flags aceitam hífen ou sublinhado (--max-cores ou --max_cores): o nome do parâmetro nas ferramentas usa sublinhado
  const args = argv.map((a) => (a.startsWith("--") ? a.replace(/_/g, "-") : a));
  const cmd = args.shift();
  if (cmd && cmd !== "help" && (args.includes("--help") || args.includes("-h"))) {
    console.log(USAGE);
    if (cmd === "reference") console.log(`\nTópicos de reference: ${REFERENCE_TOPICS.join(", ")}`);
    return 0;
  }
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
      const padrao = boolFlag(args, "cores-padrao");
      const vazio = !padrao;
      const camada = flag(args, "camada");
      boolFlag(args, "vazio");
      rejectUnknownFlags(args, "new");
      const [file, size = "32x32", fps = "8"] = args;
      if (!file) break;
      const [w, h] = size.toLowerCase().split("x").map(Number);
      await store.open(file, { width: w, height: h || w, fps: Number(fps) }, true);
      if (vazio) runCommand(store.project, "remove_colors", { keys: ["0", "1"] });
      if (camada) runCommand(store.project, "update_layer", { layer: store.project.layers[0].name, rename: camada });
      if (vazio || camada) await store.save();
      console.log(`Criado: ${store.path}\n${describeProject(store.project)}`);
      if (!camada) console.log(`\nDica: o projeto vem com uma camada "Base" vazia. Use --camada <nome> para nomeá-la (ex.: fundo) ou update_layer rename para renomear depois.`);
      return 0;
    }
    case "run": {
      const png = flag(args, "png");
      const keepGoing = boolFlag(args, "continuar");
      const quiet = boolFlag(args, "quiet") || boolFlag(args, "q");
      rejectUnknownFlags(args, "run");
      const [file, src] = args;
      if (!file || !src) break;
      await store.open(file);
      const list = JSON.parse(src === "-" ? await readStdin() : await readFile(src, "utf8")) as { name: string; input?: unknown }[];
      const out: string[] = [];
      let fails = 0;
      const cmds = Array.isArray(list) ? list : [list];
      for (const [n, c] of cmds.entries()) {
        const r = runCommand(store.project, c.name, c.input ?? {});
        const last = n === cmds.length - 1;
        // o último comando e os de leitura (check, view, reference...) mostram tudo; os outros, só a primeira linha
        const reads = ["check", "view", "reference", "get_project_info", "inspecionar", "avaliar", "polish"].includes(c.name);
        out.push(`${r.ok ? "ok " : "ERRO"} #${n} ${c.name}: ${last || reads || !r.ok ? r.text : r.text.split("\n")[0]}`);
        if (!r.ok) {
          fails++;
          if (!keepGoing) {
            out.push(`\nParei no primeiro erro (comando #${n}); os ${cmds.length - n - 1} seguintes não rodaram, porque costumam depender dele. Corrija e rode de novo, ou use --continuar.`);
            break;
          }
        }
        // a imagem do último comando é SEMPRE salva (padrão: <projeto>.preview.png): a IA enxerga pelo PNG, não pelo ASCII
        if (last && r.images) await saveImages(store.project, r, png ?? file.replace(/(\.anima)?\.json$/, "") + ".preview.png");
      }
      await store.save();
      if (!quiet) out.push(`\n${describeProject(store.project)}`);
      const sheet = runCommand(store.project, "view", { frames: "all", as_image: false });
      if (!quiet && sheet.ok && store.project.frames.length > 1) {
        if (sheet.text.length <= 3500) out.push(`\n${sheet.text}`);
        else out.push(`\n(folha de frames omitida por ser grande: use \`anima show <projeto> all\` ou \`export <projeto> sheet.png\`)`);
      }
      console.log(out.join("\n"));
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
      const bones = boolFlag(args, "bones");
      const boolQuiet = boolFlag(args, "quiet") || boolFlag(args, "q");
      rejectUnknownFlags(args, "show");
      const [file, frame = "0"] = args;
      if (!file) break;
      await store.open(file);
      const p = store.project;
      const input: Record<string, unknown> = { frames: frame === "all" ? "all" : Number(frame), check, grid, onion, bones };
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
      const focused = !!(region || diff || onion || boolQuiet);
      if (!(png && frame === "all")) console.log(focused ? r.text : `${describeProject(p)}\n\n${r.text}`);
      if (!r.ok) return 1;
      if (png && frame === "all") {
        const done = await exportToFile(p, { format: "spritesheet_png", path: png, scale: Number(scale ?? 6), columns: undefined, frame: 0 });
        console.log(`Folha com todos os frames: ${done}`);
      } else if (png) await saveImages(p, r, png);
      return 0;
    }
    case "check": {
      const png = flag(args, "png");
      const symmetric = boolFlag(args, "symmetric");
      const efeito = boolFlag(args, "efeito");
      const ignorar = flag(args, "ignorar");
      const tipoFlag = flag(args, "tipo");
      const maxCores = flag(args, "max-cores");
      const semCodigos = flag(args, "sem");
      rejectUnknownFlags(args, "check");
      const [file] = args;
      if (!file) break;
      await store.open(file);
      const r = runCommand(store.project, "check", { symmetric, tipo: efeito ? "efeito" : tipoFlag === "efeito" || tipoFlag === "rotacao" ? tipoFlag : "personagem", ignore_layers: ignorar ? ignorar.split(",") : undefined, max_cores: maxCores ? Number(maxCores) : undefined, ignore_codes: semCodigos ? semCodigos.split(",") : undefined });
      console.log(r.text);
      if (png) await saveImages(store.project, r, png);
      return r.ok ? 0 : 1;
    }
    case "reference": {
      const height = flag(args, "height");
      const style = flag(args, "style");
      const color = flag(args, "color");
      rejectUnknownFlags(args, "reference");
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
    case "compare": {
      const [file, img] = args.filter((a) => !a.startsWith("--"));
      const frame = Number(flag(args, "frame") ?? 0), png = flag(args, "png"), fundo = flag(args, "fundo"), cores = flag(args, "cores");
      if (!file || !img) break;
      await store.open(file);
      const p = store.project;
      const ref = importImage(decodePNG(await readFile(img)), { largura: p.width, altura: p.height, cores: cores ? Number(cores) : 255, fundo });
      const r = compareToReference(p, frame, ref);
      const out = png ?? file.replace(/(\.anima)?\.json$/, "") + ".comparacao.png";
      await writeFile(out, encodePNG(r.image.width, r.image.height, r.image.data));
      console.log(`${r.text}\nImagem: ${path.resolve(out)}`);
      return 0;
    }
    case "import": {
      const [file, img] = args.filter((a) => !a.startsWith("--"));
      const largura = flag(args, "largura"), altura = flag(args, "altura"), cores = flag(args, "cores"), grade = flag(args, "grade"), fundo = flag(args, "fundo"), camada = flag(args, "camada");
      const manter = boolFlag(args, "manter-canvas") || boolFlag(args, "manter_canvas");
      if (!file || !img) break;
      await store.open(file, { width: 32, height: 32 });
      const dec = decodePNG(await readFile(img));
      const r = importImage(dec, { largura: largura ? Number(largura) : undefined, altura: altura ? Number(altura) : undefined, cores: cores ? Number(cores) : undefined, grade: grade && grade !== "auto" ? Number(grade) : "auto", fundo });
      if (!manter && (r.width !== store.project.width || r.height !== store.project.height)) {
        const rr = runCommand(store.project, "set_canvas", { width: r.width, height: r.height });
        if (!rr.ok) throw new Error(rr.text);
      }
      const out = importIntoProject(store.project, r, { camada });
      await store.save();
      console.log(`Importado: ${r.width}x${r.height} px (pixel da origem ${r.cell || "reamostrado"}x), ${r.palette.length} cor(es) (${out.adicionadas} nova(s)), fundo ${r.fundo ?? "nenhum"} → camada "${out.camada}" de ${store.path}`);
      return 0;
    }
    case "export": {
      const scaleF = flag(args, "scale");
      const scale = scaleF !== undefined ? Number(scaleF) : undefined;
      const columns = flag(args, "columns");
      const frame = flag(args, "frame");
      const fundo = flag(args, "fundo");
      const margem = flag(args, "margem");
      const sombra = boolFlag(args, "sombra");
      const vaiEVolta = boolFlag(args, "vai-e-volta") || boolFlag(args, "vai_e_volta");
      const meta = boolFlag(args, "meta");
      rejectUnknownFlags(args, "export");
      const [file, out] = args;
      if (!file || !out) break;
      await store.open(file);
      const format = out.endsWith(".gif") ? "gif" : out.endsWith(".json") ? "json" : frame !== undefined ? "frame_png" : "spritesheet_png";
      const done = await exportToFile(store.project, {
        format, path: out, scale, columns: columns ? Number(columns) : undefined, frame: Number(frame ?? 0), fundo, margem: margem ? Number(margem) : undefined, sombra, vaiEVolta, meta,
      });
      console.log(`Exportado: ${done}`);
      return 0;
    }
    case "guide": {
      const full = boolFlag(args, "completo");
      if (!full) { console.log(SHORT_GUIDE); return 0; }
      console.log(`${SYSTEM_PROMPT}

Como isto vira comandos na CLI (sem MCP)
- Cada ferramenta acima é um comando do arquivo JSON de "anima run": [{"name": "draw_rows", "input": {...}}]. "anima tools <nome>" mostra os parâmetros (inclusive os de listas aninhadas); chaves que não existem dão erro com sugestão.
- "anima new <projeto> LxA fps [--vazio]" cria (e sobrescreve) o projeto; "run" aplica comandos em cima dele e para no primeiro erro.
- Conferência: "anima show <projeto> all [--png folha.png]" (todos os frames), "anima check <projeto> [--efeito|--tipo rotacao] [--ignorar camada]".
- Entrega: "anima export <projeto> saida.gif --scale 8" e "anima export <projeto> folha.png --scale 6 --columns N" (é o "export_file" do MCP).`);
      return 0;
    }
    case "tools": {
      const json = boolFlag(args, "json");
      const [name] = args;
      const all = [...commandTools(["export"]), {
        name: "export",
        description: "(CLI: anima export <projeto> <saida>) .gif = animação; .png = spritesheet com todos os frames (--columns N muda o layout; --frame N exporta só um); .json. --scale N amplia (padrão 4).",
        inputSchema: { type: "object", properties: {
          scale: { type: "integer", description: "--scale N: ampliação dos pixels (padrão 4)", default: 4 },
          columns: { type: "integer", description: "--columns N: colunas da folha .png (padrão: todos os frames em uma linha)" },
          frame: { type: "integer", description: "--frame N: exporta só este frame como .png (sem isso, .png é a folha de todos)" } } },
      }];
      if (json) { console.log(JSON.stringify(name ? all.filter((t) => t.name === name) : all, null, 1)); return 0; }
      type Prop = { type?: string; description?: string; default?: unknown; enum?: unknown[]; properties?: Record<string, Prop>; items?: Prop; required?: string[]; anyOf?: Prop[] };
      const line = (k: string, v: Prop, req: boolean, indent: string): string[] => {
        const kind = v.enum ? v.enum.join("|") : v.type === "array" ? `lista de ${v.items?.type === "object" ? "objetos" : v.items?.anyOf ? "formas (uma de várias, veja abaixo)" : v.items?.type ?? "?"}` : v.type ?? (v.anyOf ? "uma de várias formas (veja --json)" : "?");
        const out = [`${indent}${k}${req ? "*" : ""}: ${kind}${v.default !== undefined ? ` (padrão ${JSON.stringify(v.default)})` : ""}${v.description ? ` — ${String(v.description).split("\n")[0].slice(0, 110)}` : ""}`];
        const inner = v.type === "array" ? v.items : v;
        // lista de formas (draw_shapes): uma linha por variante, com os campos de cada uma
        if (inner?.anyOf?.length) {
          for (const variant of inner.anyOf) {
            const props = variant.properties ?? {};
            const kindName = (props.type as unknown as { const?: string } | undefined)?.const ?? ((variant as unknown as { const?: unknown }).const !== undefined ? JSON.stringify((variant as unknown as { const?: unknown }).const) : variant.type === "integer" || variant.type === "number" ? "um número" : variant.type === "array" ? "uma lista" : undefined);
            const rq = new Set(variant.required ?? []);
            out.push(`${indent}    · ${kindName ?? "variante"}: ${Object.entries(props).filter(([kk]) => kk !== "type").map(([kk, vv]) => `${kk}${rq.has(kk) ? "*" : ""}${vv.enum ? `(${vv.enum.join("|")})` : ""}`).join(", ")}${variant.description ? ` — ${String(variant.description).split("\n")[0].slice(0, 100)}` : ""}`);
          }
        }
        if (inner?.properties) {
          const r = new Set(inner.required ?? []);
          for (const [kk, vv] of Object.entries(inner.properties)) out.push(...line(kk, vv, r.has(kk), indent + "    "));
        }
        return out;
      };
      const describe = (t: (typeof all)[number]) => {
        const props = ((t.inputSchema as { properties?: Record<string, Prop> }).properties) ?? {};
        const req = new Set(((t.inputSchema as { required?: string[] }).required) ?? []);
        return Object.entries(props).flatMap(([k, v]) => line(k, v, req.has(k), "    ")).join("\n");
      };
      if (name) {
        const t = all.find((x) => x.name === name);
        if (!t) { console.log(`Comando "${name}" não existe. Rode \`anima tools\` para a lista.`); return 1; }
        console.log(`${t.name}\n${t.description}\n\n  parâmetros (* = obrigatório):\n${describe(t)}\n\nUso em run: [{"name": "${t.name}", "input": { ... }}]`);
        return 0;
      }
      console.log("Comandos (use `anima tools <nome>` para os parâmetros; `anima tools --json` para o JSON Schema completo). Use em `anima run`: [{\"name\": \"<comando>\", \"input\": {...}}]\n");
      for (const t of all) console.log(`  ${t.name.padEnd(20)} ${t.description.split("\n")[0].slice(0, 100)}`);
      return 0;
    }
  }
  console.log(USAGE);
  return cmd && cmd !== "help" && cmd !== "--help" ? 1 : 0;
}

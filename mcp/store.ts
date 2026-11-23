/** Projeto em disco: abrir/criar, salvar de forma atômica e exportar arquivos. */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createProject,
  exportGIF,
  fromJSON,
  frameOrder,
  presentFrame,
  presentedToRGBA,
  toJSON,
  type Project,
} from "../src/engine/index.ts";
import { encodePNG } from "../server/png.ts";

export const DEFAULT_PROJECT = "animacao.anima.json";

export class ProjectStore {
  project!: Project;
  path = "";

  constructor(private cwd = process.cwd()) {}

  resolve(p: string): string {
    return path.resolve(this.cwd, p);
  }

  async open(
    file: string,
    create?: { name?: string; width?: number; height?: number; fps?: number },
    overwrite = false,
  ): Promise<{ created: boolean }> {
    const full = this.resolve(file);
    if (!overwrite) {
      try {
        this.project = fromJSON(JSON.parse(await readFile(full, "utf8")));
        this.path = full;
        return { created: false };
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw new Error(`Não foi possível ler ${full}: ${(e as Error).message}`);
      }
    }
    this.project = createProject({ name: create?.name ?? path.basename(full).replace(/\.anima\.json$|\.json$/, ""), ...create });
    this.path = full;
    await this.save();
    return { created: true };
  }

  /** Projeto aberto; se nenhum foi aberto, usa (ou cria) o padrão no diretório atual. */
  async current(): Promise<Project> {
    if (!this.path) await this.open(process.env.ANIMA_PROJECT || DEFAULT_PROJECT);
    return this.project;
  }

  async save(): Promise<void> {
    await mkdir(path.dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp-${process.pid}`;
    await writeFile(tmp, JSON.stringify(toJSON(this.project)));
    await rename(tmp, this.path); // troca atômica: o visualizador nunca lê arquivo pela metade
  }
}

export async function exportToFile(
  p: Project,
  o: { format: "gif" | "spritesheet_png" | "frame_png" | "json"; path: string; scale?: number; columns?: number; frame: number; fundo?: string; margem?: number; sombra?: boolean; vaiEVolta?: boolean },
  cwd = process.cwd(),
): Promise<string> {
  const out = path.resolve(cwd, o.path);
  await mkdir(path.dirname(out), { recursive: true });
  let data: Uint8Array | string;
  const pres = { scale: o.scale, fundo: o.fundo, margem: o.margem, sombra: o.sombra };
  if (o.format === "gif") data = exportGIF(p, { ...pres, vaiEVolta: o.vaiEVolta });
  else if (o.format === "json") data = JSON.stringify(toJSON(p), null, 1);
  else if (o.format === "frame_png") {
    if (o.frame >= p.frames.length) throw new Error(`Frame ${o.frame} não existe (há ${p.frames.length}).`);
    const pr = presentFrame(p, o.frame, pres);
    data = encodePNG(pr.width, pr.height, presentedToRGBA(pr));
  } else {
    const order = frameOrder(p.frames.length, o.vaiEVolta);
    const frames = order.map((i) => presentFrame(p, i, pres));
    const cols = Math.max(1, Math.min(o.columns ?? frames.length, frames.length)), rows = Math.ceil(frames.length / cols);
    const fw = frames[0].width, fh = frames[0].height, W = fw * cols, H = fh * rows, buf = new Uint8ClampedArray(W * H * 4);
    frames.forEach((fr, k) => { const rgba = presentedToRGBA(fr), ox = (k % cols) * fw, oy = Math.floor(k / cols) * fh; for (let y = 0; y < fh; y++) buf.set(rgba.subarray(y * fw * 4, (y + 1) * fw * 4), ((oy + y) * W + ox) * 4); });
    data = encodePNG(W, H, buf);
  }
  await writeFile(out, data);
  return out;
}

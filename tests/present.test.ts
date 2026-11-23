import { describe, expect, it } from "vitest";
import { autoExportScale, createProject, exportGIF, frameOrder, presentFrame, presentedToRGBA, runCommand } from "../src/engine/index.ts";

const proj = (w = 16, h = 16) => {
  const p = createProject({ width: w, height: h });
  runCommand(p, "set_palette", { colors: [{ key: "a", hex: "#d84a3a", name: "vermelho" }] });
  runCommand(p, "draw_shapes", { shapes: [{ type: "rect", x: 4, y: 4, w: 8, h: 8, color: "a", filled: true }] });
  return p;
};

describe("apresentação para exportar", () => {
  it("escala automática: sprite ~512 px, cena ~960 px", () => {
    expect(autoExportScale(createProject({ width: 16, height: 16 }))).toBe(16);   // limite de 16x
    expect(autoExportScale(createProject({ width: 64, height: 64 }))).toBe(8);
    expect(autoExportScale(createProject({ width: 320, height: 180 }))).toBe(3);
  });
  it("fundo, margem e sombra entram na imagem e a figura continua exata", () => {
    const p = proj();
    const pr = presentFrame(p, 0, { scale: 4, fundo: "#102030", margem: 2, sombra: true });
    expect([pr.width, pr.height]).toEqual([80, 80]);                 // (16 + 2*2) * 4
    const rgba = presentedToRGBA(pr);
    const at = (x: number, y: number) => Array.from(rgba.slice((y * 80 + x) * 4, (y * 80 + x) * 4 + 4));
    expect(at(0, 0)).toEqual([16, 32, 48, 255]);                      // fundo
    expect(at((2 + 6) * 4, (2 + 6) * 4)).toEqual([216, 74, 58, 255]); // meio do quadrado vermelho
    const sombra = at((2 + 8) * 4, (2 + 12) * 4 + 2);                 // logo abaixo do pé
    expect(sombra[0]).toBeLessThan(16 + 1);                            // mais escuro que o fundo
  });
  it("ida e volta e GIF com fundo (sem transparência)", () => {
    expect(frameOrder(4, true)).toEqual([0, 1, 2, 3, 2, 1]);
    expect(frameOrder(4, false)).toEqual([0, 1, 2, 3]);
    expect(frameOrder(2, true)).toEqual([0, 1]);
    const p = proj();
    runCommand(p, "add_frames", { count: 2, copy_from: 0 });
    const normal = exportGIF(p, { scale: 2 });
    const ida = exportGIF(p, { scale: 2, vaiEVolta: true });
    expect(ida.length).toBeGreaterThan(normal.length);               // 4 frames em vez de 3
    expect(String.fromCharCode(...ida.slice(0, 6))).toBe("GIF89a");
    const comFundo = exportGIF(p, { scale: 2, fundo: "#000000" });
    expect(comFundo.length).toBeGreaterThan(0);
  });
});

describe("folha com metadados e check cenário", () => {
  it("--meta grava o JSON da folha com posição e duração de cada frame", async () => {
    const { exportToFile } = await import("../mcp/store.ts");
    const { mkdtempSync, readFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const path = await import("node:path");
    const dir = mkdtempSync(path.join(tmpdir(), "anima-meta-"));
    const p = proj();
    runCommand(p, "add_frames", { count: 2, copy_from: 0 });
    runCommand(p, "set_frame_timing", { duration_ms: [100, 150, 200] });
    await exportToFile(p, { format: "spritesheet_png", path: "folha.png", scale: 2, columns: 2, frame: 0, meta: true }, dir);
    const meta = JSON.parse(readFileSync(path.join(dir, "folha.json"), "utf8"));
    expect(meta).toMatchObject({ frameWidth: 32, frameHeight: 32, columns: 2, rows: 2 });
    expect(meta.frames[1]).toMatchObject({ x: 32, y: 0, duration: 150 });
    expect(meta.frames[2]).toMatchObject({ x: 0, y: 32, duration: 200 });
  });
  it("check tipo cenario não acusa emenda do loop nem volume; e blob em canvas pequeno gera aviso", () => {
    const p = proj();
    runCommand(p, "add_frames", { count: 2, copy_from: 0 });
    const r = runCommand(p, "check", { tipo: "cenario", as_image: false });
    expect(r.ok).toBe(true);
    expect(r.text).not.toMatch(/Emenda do loop/);
    const q = createProject({ width: 16, height: 16 });
    runCommand(q, "set_palette", { colors: [{ key: "a", hex: "#d84a3a", name: "a" }, { key: "b", hex: "#3a6ad8", name: "b" }, { key: "c", hex: "#fff0c0", name: "c" }, { key: "d", hex: "#7a2a22", name: "d" }] });
    const w = runCommand(q, "draw_shapes", { shapes: [{ type: "blob", x: 2, y: 2, w: 10, h: 10, outline: "d", base: "a", light: "c", shadow: "b" }] });
    expect(w.text).toMatch(/blob\/capsule geram contorno grosso/);
  });
});

describe("anima rodada e restaurar (o ciclo de revisão em ferramenta)", () => {
  it("cada rodada exporta imagem, guarda snapshot, compara com a anterior e avisa se piorou; restaurar volta o projeto", async () => {
    const { execSync } = await import("node:child_process");
    const { mkdtempSync, readFileSync, writeFileSync, existsSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const path = await import("node:path");
    const { toJSON } = await import("../src/engine/index.ts");
    const dir = mkdtempSync(path.join(tmpdir(), "anima-rod-"));
    const proj = path.join(dir, "p.anima.json");
    const root = path.resolve(__dirname, "..");
    const run = (cmd: string) => execSync(`node bin/anima.mjs ${cmd}`, { cwd: root, encoding: "utf8" });
    const p = proj1();
    writeFileSync(proj, JSON.stringify(toJSON(p)));
    const r1 = run(`rodada ${proj} --nota 6`);
    expect(r1).toMatch(/Rodada 1: avaliar \d+\/100 \(primeira rodada/);
    expect(existsSync(path.join(dir, "p.r1.png"))).toBe(true);
    expect(existsSync(path.join(dir, "p.r1.anima.json"))).toBe(true);
    // estraga o desenho e declara nota menor: deve avisar que piorou
    runCommand(p, "draw_shapes", { shapes: [{ type: "rect", x: 0, y: 0, w: 16, h: 16, color: "a", filled: true }] });
    writeFileSync(proj, JSON.stringify(toJSON(p)));
    const r2 = run(`rodada ${proj} --nota 4`);
    expect(r2).toMatch(/Rodada 2/);
    expect(r2).toMatch(/PIOROU em relação à rodada 1.*anima restaurar/);
    const antes = JSON.parse(readFileSync(path.join(dir, "p.r1.anima.json"), "utf8"));
    run(`restaurar ${proj} 1`);
    expect(JSON.parse(readFileSync(proj, "utf8"))).toEqual(antes);
    expect(JSON.parse(readFileSync(path.join(dir, "p.rodadas.json"), "utf8")).length).toBe(2);
  });
});
function proj1() {
  const p = createProject({ width: 16, height: 16 });
  runCommand(p, "set_palette", { colors: [{ key: "a", hex: "#d84a3a", name: "vermelho" }] });
  runCommand(p, "draw_shapes", { shapes: [{ type: "ellipse", x: 4, y: 4, w: 8, h: 8, color: "a", filled: true }] });
  return p;
}

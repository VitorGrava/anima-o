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

import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createProject, detectCell, importImage, importIntoProject, runCommand } from "../src/engine/index.ts";
import { decodePNG, encodePNG } from "../server/png.ts";

/** imagem 8x8 de teste: fundo azul, quadrado vermelho 4x4 com um pixel amarelo */
function tiny(): { w: number; h: number; px: [number, number, number, number][] } {
  const w = 8, h = 8, px: [number, number, number, number][] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let c: [number, number, number, number] = [30, 60, 200, 255];
    if (x >= 2 && x < 6 && y >= 2 && y < 6) c = [220, 40, 40, 255];
    if (x === 3 && y === 3) c = [250, 220, 40, 255];
    px.push(c);
  }
  return { w, h, px };
}
const upscale = (img: ReturnType<typeof tiny>, s: number) => {
  const W = img.w * s, H = img.h * s, data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) data.set(img.px[Math.floor(y / s) * img.w + Math.floor(x / s)], (y * W + x) * 4);
  return { width: W, height: H, data };
};

describe("decodePNG", () => {
  it("faz a ida e volta com encodePNG", () => {
    const img = upscale(tiny(), 3);
    const back = decodePNG(encodePNG(img.width, img.height, img.data));
    expect(back.width).toBe(24);
    expect(Array.from(back.data)).toEqual(Array.from(img.data));
  });
  it("recusa arquivo que não é PNG com mensagem útil", () => {
    expect(() => decodePNG(Buffer.from("RIFFxxxxWEBP".padEnd(40, "x")))).toThrow(/Não é um PNG/);
  });
});

describe("importImage", () => {
  it("detecta o tamanho do pixel de uma arte ampliada", () => {
    expect(detectCell(upscale(tiny(), 5))).toBe(5);
    expect(detectCell(upscale(tiny(), 1))).toBe(1);
  });
  it("reduz à grade original e identifica o fundo pelos 4 cantos", () => {
    const r = importImage(upscale(tiny(), 6));
    expect([r.width, r.height, r.cell]).toEqual([8, 8, 6]);
    expect(r.fundo).toBe("#1e3cc8");
    expect(r.indices[0]).toBe(0);                    // fundo vira transparente
    expect(r.indices[3 * 8 + 3]).not.toBe(r.indices[2 * 8 + 2]);   // o pixel amarelo é outra cor
    expect(r.palette.length).toBe(2);                // vermelho e amarelo
  });
  it("quantiza para no máximo `cores` e reamostra para uma largura dada", () => {
    const W = 64, H = 64, data = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) { data[i * 4] = (i * 7) % 256; data[i * 4 + 1] = (i * 13) % 256; data[i * 4 + 2] = (i * 29) % 256; data[i * 4 + 3] = 255; }
    const r = importImage({ width: W, height: H, data }, { largura: 16, cores: 6, fundo: "nenhum" });
    expect([r.width, r.height]).toEqual([16, 16]);
    expect(r.palette.length).toBeLessThanOrEqual(6);
    expect(new Set(r.indices).size).toBeLessThanOrEqual(6);
  });
  it("grava no projeto reaproveitando cores da paleta e exige o canvas do tamanho certo", () => {
    const r = importImage(upscale(tiny(), 4));
    const p = createProject({ width: 8, height: 8 });
    runCommand(p, "set_palette", { colors: [{ key: "r", hex: "#dc2828", name: "vermelho" }] });
    const out = importIntoProject(p, r);
    expect(out.adicionadas).toBe(1);                  // o vermelho já existia: só o amarelo é novo
    expect(p.frames[0].cels[p.layers[0].id].some((v) => v === 0)).toBe(true);
    const q = createProject({ width: 16, height: 16 });
    expect(() => importIntoProject(q, r)).toThrow(/ajuste o canvas/);
  });
});

describe("anima import (CLI)", () => {
  it("importa um PNG ampliado, ajusta o canvas e a paleta", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "anima-imp-"));
    const img = upscale(tiny(), 10);
    writeFileSync(path.join(dir, "ref.png"), encodePNG(img.width, img.height, img.data));
    const out = execSync(`node bin/anima.mjs import ${path.join(dir, "p.anima.json")} ${path.join(dir, "ref.png")} --cores 8`, { cwd: path.resolve(__dirname, ".."), encoding: "utf8" });
    expect(out).toMatch(/Importado: 8x8 px \(pixel da origem 10x\)/);
    const saved = JSON.parse(readFileSync(path.join(dir, "p.anima.json"), "utf8"));
    expect(saved.width).toBe(8);
  });
});

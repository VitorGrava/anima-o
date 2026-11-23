import { describe, expect, it } from "vitest";
import { autoScale, createProject, renderImages, runCommand, type Project } from "../src/engine/index.ts";

const ok = (p: Project, name: string, input: object) => { const r = runCommand(p, name, input); expect(r.ok, r.text).toBe(true); return r; };
const big = () => {
  const p = createProject({ width: 320, height: 180 });
  ok(p, "set_canvas", { width: 320, height: 180 });
  ok(p, "set_palette", { colors: [{ key: "a", hex: "#d84a3a", name: "vermelho" }, { key: "b", hex: "#3a6ad8", name: "azul" }] });
  return p;
};

describe("visão da IA em canvas grande", () => {
  it("escala automática faz o quadro inteiro ocupar ~1000 px", () => {
    expect(autoScale(big())).toBe(3);                                   // 320x180 -> 960x540 (antes: 1x, ilegível)
    expect(autoScale(createProject({ width: 32, height: 32 }))).toBe(31);
    expect(autoScale(big(), { x: 0, y: 0, w: 100, h: 60 })).toBe(6);
  });
  it("quadrantes devolvem uma imagem ampliada e com régua por recorte", () => {
    const p = big();
    const r = ok(p, "view", { tiles: "3x2" });
    expect(r.images?.tiles).toEqual({ cols: 3, rows: 2 });
    const imgs = renderImages(p, r.images!);
    expect(imgs.length).toBe(6);
    expect(imgs[0].label).toMatch(/quadrante 1,1/);
    expect(imgs[0].width).toBeGreaterThan(500);
  });
  it("em canvas grande a grade de texto é omitida e a imagem é a leitura principal", () => {
    const r = ok(big(), "view", {});
    expect(r.text).toMatch(/grade de texto omitida/);
    expect(r.images).toBeDefined();
  });
  it("um desenho pequeno num canvas grande devolve ZOOM automático na região que mudou", () => {
    const p = big();
    const r = ok(p, "draw_shapes", { shapes: [{ type: "rect", x: 200, y: 120, w: 12, h: 8, color: "a", filled: true }] });
    expect(r.images?.foco).toBeDefined();
    const f = r.images!.foco!;
    expect(f.x).toBeLessThanOrEqual(200); expect(f.x + f.w).toBeGreaterThanOrEqual(212);
    expect(f.y).toBeLessThanOrEqual(120); expect(f.y + f.h).toBeGreaterThanOrEqual(128);
    const imgs = renderImages(p, r.images!);
    expect(imgs.length).toBe(2);
    expect(imgs[1].label).toMatch(/ZOOM NA MUDANÇA/);
  });
  it("em canvas pequeno não há zoom extra (o quadro já mostra tudo)", () => {
    const p = createProject({ width: 32, height: 32 });
    ok(p, "set_palette", { colors: [{ key: "a", hex: "#d84a3a", name: "vermelho" }] });
    const r = ok(p, "draw_shapes", { shapes: [{ type: "rect", x: 4, y: 4, w: 4, h: 4, color: "a", filled: true }] });
    expect(r.images?.foco).toBeUndefined();
  });
});

describe("inspecionar (descrição estruturada)", () => {
  it("lista regiões por cor com caixa e centro, a caixa de cada camada e o mapa de brilho", () => {
    const p = big();
    ok(p, "add_layer", { name: "casa" });
    ok(p, "draw_shapes", { layer: "casa", shapes: [{ type: "rect", x: 60, y: 100, w: 40, h: 30, color: "a", filled: true }] });
    ok(p, "draw_shapes", { layer: "Base", shapes: [{ type: "rect", x: 0, y: 0, w: 320, h: 60, color: "b", filled: true }] });
    const r = ok(p, "inspecionar", { minimo: 1 });
    expect(r.text).toMatch(/azul .*caixa x0\.\.319 y0\.\.59/);
    expect(r.text).toMatch(/vermelho .*caixa x60\.\.99 y100\.\.129/);
    expect(r.text).toMatch(/casa: 1200 px, caixa x60\.\.99 y100\.\.129/);
    expect(r.text).toMatch(/Mapa de brilho/);
  });
});

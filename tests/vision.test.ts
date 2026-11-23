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
    expect(autoScale(createProject({ width: 32, height: 32 }))).toBe(12);   // sprite pequeno: 384 px (antes 992 px)
    expect(autoScale(big(), { x: 0, y: 0, w: 100, h: 60 })).toBe(5);
  });
  it("quadrantes devolvem uma imagem ampliada e com régua por recorte", () => {
    const p = big();
    const r = ok(p, "view", { tiles: "3x2" });
    expect(r.images?.tiles).toEqual({ cols: 3, rows: 2 });
    const imgs = renderImages(p, r.images!);
    expect(imgs.length).toBe(6);
    expect(imgs[0].label).toMatch(/quadrante 1,1/);
    expect(imgs[0].width).toBeGreaterThan(300);
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
    expect(r.text).toMatch(/Cores mais usadas/);
  });
});

describe("custo da visão e atalhos", () => {
  it("escala adaptativa: sprite pequeno usa imagem pequena; cena grande ~960 px na leitura e ~640 px na prévia", async () => {
    const { autoScale } = await import("../src/engine/index.ts");
    const small = createProject({ width: 32, height: 32 });
    expect(32 * autoScale(small)).toBeLessThanOrEqual(400);                 // antes: 992 px (~1300 tokens)
    expect(autoScale(big())).toBe(3);                                        // 960 px
    expect(autoScale(big(), undefined, "previa")).toBe(2);                  // prévia de desenho: 640 px (o zoom da mudança cobre o detalhe)
  });
  it("vários frames viram UMA folha de contato com o número de cada frame", () => {
    const p = createProject({ width: 16, height: 16 });
    ok(p, "set_palette", { colors: [{ key: "a", hex: "#d84a3a", name: "vermelho" }] });
    ok(p, "add_frames", { count: 5, copy_from: 0 });
    const r = ok(p, "view", { frames: "all" });
    const imgs = renderImages(p, r.images!);
    expect(imgs.length).toBe(1);
    expect(imgs[0].label).toMatch(/folha de contato dos frames 0, 1, 2, 3, 4, 5/);
  });
  it("prévia de desenho num sprite mostra só o trecho alterado em texto, não a grade inteira", () => {
    const p = createProject({ width: 48, height: 48 });
    ok(p, "set_palette", { colors: [{ key: "a", hex: "#d84a3a", name: "vermelho" }] });
    ok(p, "draw_shapes", { shapes: [{ type: "rect", x: 2, y: 2, w: 30, h: 30, color: "a", filled: true }] });
    const r = ok(p, "draw_shapes", { shapes: [{ type: "pixels", points: [[40, 40], [41, 40]], color: "a" }] });
    expect(r.text).toMatch(/Trecho alterado do frame 0/);
    expect(r.text).not.toMatch(/Frame 0 agora/);
  });
  it("batch aplica vários comandos com uma imagem e é atômico", () => {
    const p = big();
    const before = JSON.stringify(Array.from(p.frames[0].cels[p.layers[0].id]).slice(0, 2000));
    const r = ok(p, "batch", { comandos: [
      { name: "draw_shapes", input: { shapes: [{ type: "rect", x: 10, y: 10, w: 20, h: 20, color: "a", filled: true }] } },
      { name: "draw_shapes", input: { shapes: [{ type: "rect", x: 40, y: 10, w: 20, h: 20, color: "b", filled: true }] } },
    ] });
    expect(r.text).toMatch(/2 comando\(s\) aplicados/);
    expect(r.text).toMatch(/Nota: \d+\/100/);
    const bad = runCommand(p, "batch", { comandos: [
      { name: "draw_shapes", input: { shapes: [{ type: "rect", x: 100, y: 100, w: 10, h: 10, color: "a", filled: true }] } },
      { name: "draw_shapes", input: { shapes: [{ type: "rect", x: 0, y: 0, w: 5, h: 5, color: "naoexiste", filled: true }] } },
    ] });
    expect(bad.ok).toBe(false);
    expect(bad.text).toMatch(/comando #1/);
    expect(p.frames[0].cels[p.layers[0].id][105 * 320 + 105]).toBe(0);      // o primeiro comando do lote falho NÃO ficou aplicado
    void before;
  });
  it("transform e set_frame_timing aceitam frames omitido; set_palette aceita preset", () => {
    const p = createProject({ width: 16, height: 16 });
    ok(p, "set_palette", { preset: "pico8" });
    expect(p.palette.length).toBeGreaterThanOrEqual(16);
    expect(p.palette.some((c) => c.hex === "#ff004d")).toBe(true);
    ok(p, "draw_shapes", { shapes: [{ type: "rect", x: 2, y: 2, w: 4, h: 4, color: "#ff004d", filled: true }] });
    ok(p, "transform", { op: "shift", dx: 1 });                              // sem frames
    ok(p, "set_frame_timing", { duration_ms: 200 });                          // sem frames
  });
});

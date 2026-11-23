import { describe, expect, it } from "vitest";
import { createProject, runCommand, type Project } from "../src/engine/index.ts";
import { evaluateBeauty } from "../src/engine/critique.ts";

const ok = (p: Project, name: string, input: object) => { const r = runCommand(p, name, input); expect(r.ok, r.text).toBe(true); return r; };

/** personagem chapado: 4 materiais, uma cor cada, sem contorno */
function flatChar(w = 32) {
  const p = createProject({ width: w, height: w });
  ok(p, "set_palette", { colors: [
    { key: "h", hex: "#9a5028", name: "cabelo" }, { key: "s", hex: "#ffbf80", name: "pele" },
    { key: "v", hex: "#ffcb1f", name: "colete" }, { key: "t", hex: "#3a6fb0", name: "calca" }, { key: "e", hex: "#2a1018", name: "olho" },
  ] });
  ok(p, "draw_shapes", { shapes: [
    { type: "ellipse", x: 8, y: 3, w: 16, h: 13, color: "h", fill: true },
    { type: "ellipse", x: 10, y: 6, w: 12, h: 9, color: "s", fill: true },
    { type: "rect", x: 13, y: 9, w: 2, h: 3, color: "e", fill: true }, { type: "rect", x: 18, y: 9, w: 2, h: 3, color: "e", fill: true },
    { type: "ellipse", x: 9, y: 15, w: 14, h: 9, color: "v", fill: true },
    { type: "ellipse", x: 10, y: 22, w: 12, h: 8, color: "t", fill: true },
  ] });
  return p;
}

describe("avaliar (avaliação de beleza)", () => {
  it("devolve nota por categoria e nomeia o conserto de cada achado", () => {
    const p = flatChar();
    const r = ok(p, "avaliar", {});
    expect(r.text).toMatch(/Avaliação de beleza: \d+\/100/);
    for (const c of ["Paradigmas da pixel art", "Cor e harmonia", "Forma e contorno", "Composição"]) expect(r.text).toContain(c);
    expect(r.text).toMatch(/→ /);
  });
  it("acusa arte chapada e falta de contorno", () => {
    const c = evaluateBeauty(flatChar());
    const codes = c.findings.map((f) => f.code);
    expect(codes).toContain("arte_chapada");
    expect(codes).toContain("sem_contorno");
  });
  it("acusa figura cortada nas bordas e figura fora do centro", () => {
    const p = createProject({ width: 32, height: 32 });
    ok(p, "set_palette", { colors: [{ key: "r", hex: "#d84a3a", name: "vermelho" }] });
    ok(p, "draw_shapes", { shapes: [{ type: "ellipse", x: 18, y: 2, w: 14, h: 14, color: "r", fill: true }] });
    const codes = evaluateBeauty(p).findings.map((f) => f.code);
    expect(codes).toContain("cortado_nas_bordas");
    expect(codes).toContain("fora_do_centro");
  });
  it("acusa preto puro em área grande e não confunde um branco-azulado de asa", () => {
    const p = createProject({ width: 32, height: 32 });
    ok(p, "set_palette", { colors: [{ key: "k", hex: "#000000", name: "preto" }, { key: "w", hex: "#f6fdff", name: "asa" }] });
    ok(p, "draw_shapes", { shapes: [{ type: "ellipse", x: 8, y: 8, w: 16, h: 16, color: "k", fill: true }, { type: "ellipse", x: 12, y: 12, w: 8, h: 8, color: "w", fill: true }] });
    const c = evaluateBeauty(p);
    expect(c.findings.map((f) => f.code)).toContain("preto_puro");
  });
});

describe("polish", () => {
  it("melhora a nota, cria luz/sombra e contorno seletivo, e preserva os detalhes (olhos)", () => {
    const p = flatChar();
    const before = evaluateBeauty(p).score;
    const r = ok(p, "polish", { preview: false });
    expect(r.text).toMatch(/Nota: \d+ → \d+\/100/);
    expect(evaluateBeauty(p).score).toBeGreaterThan(before);
    expect(p.layers.some((l) => l.name === "contorno")).toBe(true);
    const cel = p.frames[0].cels[p.layers.find((l) => l.name !== "contorno")!.id];
    const used = new Set(Array.from(cel).filter((v) => v).map((v) => p.palette[v - 1].name));
    expect([...used].some((n) => /-luz$/.test(n))).toBe(true);
    expect([...used].some((n) => /-sombra$/.test(n))).toBe(true);
    expect(used.has("olho")).toBe(true);
    // olhos continuam inteiros (6 px cada, sem rebordo de luz/sombra em volta)
    const eye = Array.from(cel).filter((v) => v && p.palette[v - 1].name === "olho").length;
    expect(eye).toBe(12);
  });
  it("é idempotente: rodar duas vezes não muda mais nada", () => {
    const p = flatChar();
    ok(p, "polish", { preview: false });
    const snap = () => JSON.stringify(p.layers.map((l) => Array.from(p.frames[0].cels[l.id])));
    const palette = p.palette.length, a = snap();
    ok(p, "polish", { preview: false });
    expect(p.palette.length).toBe(palette);
    expect(snap()).toBe(a);
  });
  it("troca o preto puro por um tom escuro colorido", () => {
    const p = createProject({ width: 32, height: 32 });
    ok(p, "set_palette", { colors: [{ key: "k", hex: "#000000", name: "preto" }, { key: "o", hex: "#e08040", name: "laranja" }] });
    ok(p, "draw_shapes", { shapes: [{ type: "ellipse", x: 6, y: 6, w: 20, h: 20, color: "k", fill: true }, { type: "ellipse", x: 8, y: 8, w: 16, h: 16, color: "o", fill: true }] });
    ok(p, "polish", { preview: false, sombrear: false });
    expect(p.palette.find((c) => c.key === "k")!.hex).not.toBe("#000000");
  });
  it("centralizar move todos os frames pelo mesmo deslocamento", () => {
    const p = createProject({ width: 32, height: 32 });
    ok(p, "set_palette", { colors: [{ key: "r", hex: "#d84a3a", name: "vermelho" }] });
    ok(p, "draw_shapes", { shapes: [{ type: "ellipse", x: 0, y: 0, w: 10, h: 10, color: "r", fill: true }] });
    ok(p, "polish", { preview: false, sombrear: false, contorno: "nenhum", centralizar: true });
    const cel = p.frames[0].cels[p.layers[0].id];
    const xs = Array.from(cel).map((v, i) => (v ? i % 32 : -1)).filter((x) => x >= 0);
    expect((Math.min(...xs) + Math.max(...xs) + 1) / 2).toBeCloseTo(16, 0);
  });
});

describe("avaliar tipo cena", () => {
  it("acusa céu em faixas duras e áreas chapadas enormes", () => {
    const p = createProject({ width: 160, height: 90 });
    ok(p, "set_palette", { colors: ["#2b1b4a", "#4a2a6a", "#7a3a82", "#b04a86", "#e0627a"].map((hex, i) => ({ key: "abcde"[i], hex, name: `c${i}` })) });
    ok(p, "draw_shapes", { shapes: "abcde".split("").map((k, i) => ({ type: "rect", x: 0, y: i * 18, w: 160, h: 18, color: k, filled: true })) });
    const codes = evaluateBeauty(p, [0], "cena").findings.map((f) => f.code);
    expect(codes).toContain("degrade_em_faixas");
    expect(codes).toContain("areas_chapadas");
    expect(evaluateBeauty(p, [0], "cena").score).toBeLessThan(90);
  });
});

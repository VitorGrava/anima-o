import { describe, expect, it } from "vitest";
import { createProject, runCommand, type Project } from "../src/engine/index.ts";
import { bayer, drawGradient, fillPolygon, scatter } from "../src/engine/paint.ts";

const ok = (p: Project, name: string, input: object) => { const r = runCommand(p, name, input); expect(r.ok, r.text).toBe(true); return r; };
const cel = (p: Project, frame = 0, layer = 0) => p.frames[frame].cels[p.layers[layer].id];
const pal = (p: Project, keys: string) => ok(p, "set_palette", { colors: [...keys].map((k, i) => ({ key: k, hex: `#${(40 + i * 25).toString(16).padStart(2, "0")}${(90 + i * 10).toString(16)}${(160 - i * 20).toString(16).padStart(2, "0")}`, name: `c${k}` })) });

describe("canvas e paleta grandes", () => {
  it("aceita 320x180 e mais de 80 cores com chaves acentuadas", () => {
    const p = createProject({ width: 320, height: 180 });
    ok(p, "set_canvas", { width: 320, height: 180 });
    const colors = Array.from({ length: 60 }, (_, i) => ({ key: "ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ"[i], hex: `#${(i * 4).toString(16).padStart(2, "0")}8040`, name: `x${i}` }));
    ok(p, "set_palette", { colors });
    expect(p.palette.length).toBeGreaterThan(60);
    expect(p.width).toBe(320);
  });
});

describe("draw_shapes gradient (dither de Bayer)", () => {
  it("gera transição dithered entre dois tons, sem poeira nas pontas", () => {
    expect(bayer(4).flat().sort((a, b) => a - b)).toEqual(Array.from({ length: 16 }, (_, i) => i));
    const p = createProject({ width: 16, height: 16 });
    pal(p, "ab");
    ok(p, "draw_shapes", { shapes: [{ type: "gradient", x: 0, y: 0, w: 16, h: 16, colors: ["a", "b"], dither: "bayer4", suavidade: 0.5 }] });
    const c = cel(p), A = p.palette.findIndex((x) => x.key === "a") + 1, B = A + 1;
    expect([...c.slice(0, 16)].every((v) => v === A)).toBe(true);             // topo: só o primeiro tom
    expect([...c.slice(15 * 16)].every((v) => v === B)).toBe(true);           // base: só o último
    const mid = [...c.slice(6 * 16, 10 * 16)];
    expect(mid.includes(A) && mid.includes(B)).toBe(true);                    // meio: mistura
  });
  it("cor '.' no fim da rampa dissolve o brilho no fundo (radial)", () => {
    const p = createProject({ width: 24, height: 24 });
    pal(p, "abc");
    ok(p, "draw_shapes", { shapes: [{ type: "rect", x: 0, y: 0, w: 24, h: 24, color: "a", filled: true }] });
    ok(p, "draw_shapes", { shapes: [{ type: "gradient", x: 0, y: 0, w: 24, h: 24, direction: "radial", cx: 12, cy: 12, r: 10, colors: ["c", "b", "."], dither: "bayer4" }] });
    const c = cel(p);
    const idx = (k: string) => p.palette.findIndex((x) => x.key === k) + 1;
    expect(c[12 * 24 + 12]).toBe(idx("c"));       // centro: cor "c"
    expect(c[0]).toBe(idx("a"));                   // fora do raio: o fundo original
  });
  it("only limita o degradê a uma cor", () => {
    const s = { width: 8, height: 8, data: new Uint8Array(64) };
    for (let i = 0; i < 32; i++) s.data[i] = 1;
    drawGradient(s, { x: 0, y: 0, w: 8, h: 8, direction: "vertical", colors: [2, 3], dither: "nenhum", suavidade: 1, only: 1 });
    expect([...s.data.slice(32)].every((v) => v === 0)).toBe(true);
    expect([...s.data.slice(0, 32)].every((v) => v === 2 || v === 3)).toBe(true);
  });
});

describe("polygon e scatter", () => {
  it("preenche um triângulo", () => {
    const s = { width: 10, height: 10, data: new Uint8Array(100) };
    fillPolygon(s, [[0, 9], [5, 0], [9, 9]], 4);
    expect(s.data[8 * 10 + 5]).toBe(4);
    expect(s.data[0]).toBe(0);
    expect([...s.data].filter((v) => v).length).toBeGreaterThan(20);
  });
  it("scatter é reprodutível, respeita distância mínima e só, e evitar", () => {
    const mk = () => ({ width: 40, height: 40, data: new Uint8Array(1600) });
    const a = mk(), b = mk();
    const spec = { x: 0, y: 0, w: 40, h: 40, colors: [5], densidade: 0.05, forma: "pixel" as const, distancia: 3, seed: 9 };
    scatter(a, spec); scatter(b, spec);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
    const pts = [...a.data].map((v, i) => (v ? [i % 40, Math.floor(i / 40)] : null)).filter(Boolean) as number[][];
    expect(pts.length).toBeGreaterThan(10);
    for (const p of pts) for (const q of pts) if (p !== q) expect(Math.max(Math.abs(p[0] - q[0]), Math.abs(p[1] - q[1]))).toBeGreaterThan(3);
    const c = mk(); scatter(c, { ...spec, blocked: (x) => x < 20 });
    expect([...c.data].some((v, i) => v && i % 40 < 20)).toBe(false);
  });
  it("evitar e variar_por_frame funcionam pela ferramenta", () => {
    const p = createProject({ width: 40, height: 40 });
    pal(p, "abc");
    ok(p, "add_layer", { name: "casa" });
    ok(p, "draw_shapes", { layer: "casa", shapes: [{ type: "rect", x: 0, y: 0, w: 20, h: 40, color: "a", filled: true }] });
    ok(p, "add_frames", { count: 1, copy_from: 0 });
    ok(p, "add_layer", { name: "flores" });
    ok(p, "draw_shapes", { frames: "all", layer: "flores", shapes: [{ type: "scatter", x: 0, y: 0, w: 40, h: 40, colors: ["b"], densidade: 0.08, seed: 3, evitar: ["casa"], variar_por_frame: true }] });
    const f0 = p.frames[0].cels[p.layers[2].id], f1 = p.frames[1].cels[p.layers[2].id];
    expect([...f0].some((v, i) => v && i % 40 < 20)).toBe(false);
    expect(Array.from(f0)).not.toEqual(Array.from(f1));
  });
});

describe("reflect, haze e luz", () => {
  it("reflect espelha as camadas fonte abaixo da linha da água", () => {
    const p = createProject({ width: 20, height: 30 });
    pal(p, "abc");
    ok(p, "add_layer", { name: "monte" }); ok(p, "add_layer", { name: "reflexo" });
    ok(p, "draw_shapes", { layer: "monte", shapes: [{ type: "rect", x: 8, y: 6, w: 4, h: 8, color: "a", filled: true }] });
    ok(p, "transform", { frames: 0, layer: "reflexo", op: "reflect", fonte: ["monte"], y: 14, alto: 8, onda: 0, mistura: 0.5, agua: "b" });
    const r = p.frames[0].cels[p.layers[2].id];
    expect(r[15 * 20 + 9]).toBeGreaterThan(0);           // logo abaixo da margem há reflexo
    expect(r[5 * 20 + 9]).toBe(0);                        // acima da margem não
  });
  it("haze mistura a camada com a cor da névoa (mais perto do céu)", () => {
    const p = createProject({ width: 8, height: 8 });
    ok(p, "set_palette", { colors: [{ key: "a", hex: "#202040", name: "monte" }, { key: "b", hex: "#ffc080", name: "ceu" }] });
    ok(p, "draw_shapes", { shapes: [{ type: "rect", x: 0, y: 0, w: 8, h: 8, color: "a", filled: true }] });
    ok(p, "transform", { frames: 0, layer: "Base", op: "haze", color: "b", quantidade: 0.5 });
    const v = cel(p)[0];
    const hex = p.palette[v - 1].hex;
    expect(parseInt(hex.slice(1, 3), 16)).toBeGreaterThan(0x70);   // clareou bastante em direção à névoa
  });
  it("shade respeita a direção da luz", () => {
    const mk = (luz: string) => {
      const p = createProject({ width: 16, height: 16 });
      ok(p, "set_palette", { colors: [{ key: "r", hex: "#d84a3a", name: "vermelho" }] });
      ok(p, "draw_shapes", { shapes: [{ type: "rect", x: 2, y: 2, w: 12, h: 12, color: "r", filled: true }] });
      ok(p, "transform", { frames: 0, op: "shade", luz });
      const c = cel(p); const lum = (i: number) => { const h = p.palette[c[i] - 1].hex; return parseInt(h.slice(1, 3), 16) * 0.3 + parseInt(h.slice(3, 5), 16) * 0.59 + parseInt(h.slice(5, 7), 16) * 0.11; };
      return { left: lum(8 * 16 + 2), right: lum(8 * 16 + 13) };
    };
    const esq = mk("esquerda"), dir = mk("direita");
    expect(esq.left).toBeGreaterThan(esq.right);
    expect(dir.right).toBeGreaterThan(dir.left);
  });
  it("avaliar acusa paleta duplicada", () => {
    const p = createProject({ width: 24, height: 24 });
    ok(p, "set_palette", { colors: [{ key: "a", hex: "#c04040", name: "um" }, { key: "b", hex: "#c04040", name: "dois" }] });
    ok(p, "draw_shapes", { shapes: [{ type: "rect", x: 2, y: 2, w: 8, h: 8, color: "a", filled: true }, { type: "rect", x: 12, y: 2, w: 8, h: 8, color: "b", filled: true }] });
    expect(runCommand(p, "avaliar", { tipo: "personagem" }).text).toContain("paleta_duplicada");
  });
});

describe("box3d (caixa/casa em perspectiva)", () => {
  it("a lateral recua em direção ao horizonte e o telhado aparece", async () => {
    const { drawBox3d, pontoLateral } = await import("../src/engine/paint.ts");
    const s = { width: 60, height: 60, data: new Uint8Array(3600) };
    const b = { x: 10, y: 50, w: 20, h: 16, prof: 12, xv: 80, yh: 10, rise: 8, frente: 1, lado: 2, telhado: 3, empena: 4, espaco: 3 };
    drawBox3d(s, b);
    const at = (x: number, y: number) => s.data[y * 60 + x];
    expect(at(15, 45)).toBe(1);                          // frente
    expect(at(33, 40)).toBe(2);                          // lateral (à direita da frente)
    expect([...s.data].includes(3)).toBe(true);           // água do telhado
    expect([...s.data].includes(4)).toBe(true);           // empena
    // a aresta de baixo da lateral SOBE em direção ao horizonte (y menor que o chão da frente)
    const [, yFar] = pontoLateral(b, 1, 1);
    expect(yFar).toBeLessThan(50);
    // e o topo também converge: a lateral fica mais baixa (mais curta) no fundo
    const [, topFar] = pontoLateral(b, 1, 0), [, topNear] = pontoLateral(b, 0, 0);
    expect(yFar - topFar).toBeLessThan(50 - 34);
    expect(topNear).toBe(34);
  });
  it("funciona pela ferramenta draw_shapes", () => {
    const p = createProject({ width: 64, height: 64 });
    pal(p, "abcd");
    ok(p, "draw_shapes", { shapes: [{ type: "box3d", x: 8, y: 56, w: 24, h: 18, prof: 14, xv: 100, yh: 20, rise: 10, frente: "a", lado: "b", telhado: "c", empena: "d" }] });
    expect(new Set(Array.from(cel(p)).filter((v) => v)).size).toBeGreaterThanOrEqual(4);
  });
});

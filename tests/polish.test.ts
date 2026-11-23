import { describe, expect, it } from "vitest";
import { createProject, runCommand, type Project } from "../src/engine/index.ts";
import { autoShade, cleanCorners, selectiveOutline } from "../src/engine/polish.ts";

const ok = (p: Project, name: string, input: object) => { const r = runCommand(p, name, input); expect(r.ok, r.text).toBe(true); return r; };

function disc() {
  const p = createProject({ width: 20, height: 20 });
  ok(p, "set_palette", { colors: [{ key: "r", hex: "#d84a3a", name: "vermelho" }] });
  ok(p, "draw_shapes", { shapes: [{ type: "ellipse", x: 3, y: 3, w: 14, h: 14, color: "r", fill: true }] });
  return p;
}
const used = (p: Project) => new Set(Array.from(p.frames[0].cels[p.layers[0].id]).filter((v) => v));

describe("transform shade (sombreamento automático)", () => {
  it("transforma arte chapada em 3 tons: claro em cima/esquerda, sombra embaixo/direita", () => {
    const p = disc();
    expect(used(p).size).toBe(1);
    ok(p, "transform", { frames: 0, op: "shade" });
    const cel = p.frames[0].cels[p.layers[0].id];
    expect(used(p).size).toBe(3);
    const hexAt = (x: number, y: number) => p.palette[cel[y * 20 + x] - 1].hex;
    const lum = (h: string) => parseInt(h.slice(1, 3), 16) * 0.3 + parseInt(h.slice(3, 5), 16) * 0.59 + parseInt(h.slice(5, 7), 16) * 0.11;
    expect(lum(hexAt(6, 4))).toBeGreaterThan(lum(hexAt(10, 10)));    // topo: mais claro que o miolo
    expect(lum(hexAt(12, 16))).toBeLessThan(lum(hexAt(10, 10)));     // base: mais escuro
  });
  it("não sombreia contornos escuros nem cores em skip", () => {
    const p = disc();
    ok(p, "set_palette", { colors: [{ key: "k", hex: "#2a1018", name: "contorno" }] });
    ok(p, "transform", { frames: 0, op: "outline", color: "k" });
    ok(p, "transform", { frames: 0, op: "shade" });
    expect(Array.from(p.frames[0].cels[p.layers[0].id]).filter((v) => v && p.palette[v - 1].key === "k").length).toBeGreaterThan(20);
    const q = disc();
    const r = runCommand(q, "transform", { frames: 0, op: "shade", skip: ["r"] });
    expect(r.ok).toBe(false);
  });
  it("região fina (1 px) não é sombreada nos dois lados ao mesmo tempo", () => {
    const w = 5, h = 5, d = new Uint8Array(w * h); d[2 * w + 2] = 1;
    const n = autoShade(d, w, h, 1, () => ({ light: 2, shadow: 3 }));
    expect(n).toBe(0);
    expect(d[2 * w + 2]).toBe(1);
  });
});

describe("outline seletivo e limpeza", () => {
  it("transform outline seletivo cria contorno por material, mais claro no lado da luz", () => {
    const p = disc();
    ok(p, "transform", { frames: 0, op: "outline", mode: "seletivo" });
    const cel = p.frames[0].cels[p.layers[0].id];
    const hexAt = (x: number, y: number) => p.palette[cel[y * 20 + x] - 1].hex;
    const lum = (h: string) => parseInt(h.slice(1, 3), 16) * 0.3 + parseInt(h.slice(3, 5), 16) * 0.59 + parseInt(h.slice(5, 7), 16) * 0.11;
    expect(used(p).size).toBeGreaterThanOrEqual(3);
    expect(lum(hexAt(2, 10))).toBeGreaterThan(lum(hexAt(17, 10)));  // lado da luz (esquerda) mais claro que o lado oposto
  });
  it("selectiveOutline lê da fonte e escreve no alvo", () => {
    const w = 5, h = 5, src = new Uint8Array(w * h); src[2 * w + 2] = 1;
    const out = src.slice();
    expect(selectiveOutline(src, out, w, h, (c, lit) => (lit ? 5 : 6), () => 1)).toBe(4);
    expect(out[2 * w + 1]).toBe(5);   // contorno à esquerda da arte = lado da luz
    expect(out[2 * w + 3]).toBe(6);   // contorno à direita = lado da sombra
  });
  it("clean remove o pixel de ponta de um L só quando os lados opostos estão vazios", () => {
    const w = 6, h = 6, d = new Uint8Array(w * h);
    for (const [x, y] of [[2, 2], [3, 2], [2, 3]]) d[y * w + x] = 7;     // L: (2,2) é a quina
    expect(cleanCorners(d, w, h, 7)).toBe(1);
    expect(d[2 * w + 2]).toBe(0);
    const e = new Uint8Array(w * h);
    for (const [x, y] of [[2, 2], [3, 2], [2, 3], [1, 2]]) e[y * w + x] = 7;   // quina com 3 vizinhos: não mexe
    expect(cleanCorners(e, w, h, 7)).toBe(0);
  });
});

describe("check cantos_quadrados", () => {
  it("avisa sobre caixa de quinas retas e não sobre disco arredondado", () => {
    const box = createProject({ width: 24, height: 24 });
    ok(box, "set_palette", { colors: [{ key: "r", hex: "#d84a3a", name: "vermelho" }] });
    ok(box, "draw_shapes", { shapes: [{ type: "rect", x: 4, y: 4, w: 16, h: 16, color: "r", fill: true }] });
    expect(runCommand(box, "check", {}).text).toMatch(/quina\(s\) de 90/);
    const round = createProject({ width: 24, height: 24 });
    ok(round, "set_palette", { colors: [{ key: "r", hex: "#d84a3a", name: "vermelho" }] });
    ok(round, "draw_shapes", { shapes: [{ type: "ellipse", x: 4, y: 4, w: 16, h: 16, color: "r", fill: true }] });
    expect(runCommand(round, "check", {}).text).not.toMatch(/quina\(s\) de 90/);
  });
});

describe("shade com cores de detalhe", () => {
  it("cores em skip contam como parte da região e não geram rebordo em volta delas", () => {
    const w = 9, h = 9, d = new Uint8Array(w * h);
    for (let y = 1; y < 8; y++) for (let x = 1; x < 8; x++) d[y * w + x] = 1;
    d[4 * w + 4] = 9;                                   // "olho" no meio da região
    autoShade(d, w, h, 1, (c) => (c === 1 ? { light: 2, shadow: 3 } : null), (c) => c === 9);
    for (const [x, y] of [[3, 4], [5, 4], [4, 3], [4, 5]]) expect(d[y * w + x]).toBe(1);   // em volta do olho: base
    expect(d[4 * w + 4]).toBe(9);
  });
});

describe("reduce_colors", () => {
  it("funde as cores mais parecidas e remapeia todos os pixels", () => {
    const p = createProject({ width: 12, height: 4 });
    ok(p, "set_palette", { colors: [
      { key: "a", hex: "#ff0000", name: "a" }, { key: "b", hex: "#fe0505", name: "b" }, { key: "c", hex: "#0000ff", name: "c" }, { key: "d", hex: "#0505fe", name: "d" },
    ] });
    ok(p, "draw_shapes", { shapes: [{ type: "rect", x: 0, y: 0, w: 4, h: 4, color: "a", filled: true }, { type: "rect", x: 4, y: 0, w: 1, h: 4, color: "b", filled: true }, { type: "rect", x: 5, y: 0, w: 4, h: 4, color: "c", filled: true }, { type: "rect", x: 9, y: 0, w: 1, h: 4, color: "d", filled: true }] });
    const r = ok(p, "reduce_colors", { cores: 2 });
    expect(r.text).toMatch(/para 2 cores/);
    expect(p.palette.length).toBe(2);
    const cel = p.frames[0].cels[p.layers[0].id];
    expect(new Set(Array.from(cel).filter((v) => v)).size).toBe(2);
    expect(cel[4]).toBe(cel[0]);          // o vermelho quase igual virou o vermelho principal
    expect(cel[9]).toBe(cel[5]);
  });
  it("não mexe nas cores protegidas", () => {
    const p = createProject({ width: 8, height: 2 });
    ok(p, "set_palette", { colors: [{ key: "a", hex: "#101010", name: "contorno" }, { key: "b", hex: "#141414", name: "quase" }, { key: "c", hex: "#ff8800", name: "laranja" }] });
    ok(p, "draw_shapes", { shapes: [{ type: "rect", x: 0, y: 0, w: 3, h: 2, color: "a", filled: true }, { type: "rect", x: 3, y: 0, w: 1, h: 2, color: "b", filled: true }, { type: "rect", x: 4, y: 0, w: 4, h: 2, color: "c", filled: true }] });
    ok(p, "reduce_colors", { cores: 2, proteger: ["a"] });
    expect(p.palette.some((c) => c.name === "contorno")).toBe(true);
  });
});

describe("draw_rows contorno seletivo e tópico processo", () => {
  it("contorna a arte da camada na cor escura do material vizinho, sem escrever o contorno", () => {
    const p = createProject({ width: 12, height: 12 });
    ok(p, "set_palette", { colors: [{ key: "r", hex: "#d84a3a", name: "vermelho" }, { key: "b", hex: "#3a6ad8", name: "azul" }] });
    ok(p, "draw_rows", { x: 3, y: 3, rows: ["rrr", "rrr", "bbb"], contorno: "seletivo" });
    const c = p.frames[0].cels[p.layers[0].id];
    expect(c[2 * 12 + 4]).not.toBe(0);                    // contorno acima da arte
    expect(c[3 * 12 + 2]).not.toBe(0);                    // contorno à esquerda
    expect(c[6 * 12 + 4]).not.toBe(0);                    // e abaixo
    const hex = (i: number) => p.palette[c[i] - 1].hex;
    expect(hex(2 * 12 + 4)).not.toBe(hex(6 * 12 + 4));    // acima do vermelho ≠ abaixo do azul: cor por material
    expect(c[0]).toBe(0);                                  // longe da arte: vazio
  });
  it("reference processo existe e traz as regras que funcionaram", () => {
    const r = runCommand(createProject(), "reference", { topic: "processo" });
    expect(r.ok).toBe(true);
    expect(r.text).toMatch(/OLHOS NOVOS/);
    expect(r.text).toMatch(/contorno=.seletivo./);
  });
});

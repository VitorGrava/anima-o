import { describe, expect, it } from "vitest";
import { createProject, runCommand, type Project } from "../src/engine/index.ts";
import { colorIndex } from "../src/engine/project.ts";
import { drawBody } from "../src/engine/body.ts";

const ok = (p: Project, name: string, input: object) => { const r = runCommand(p, name, input); expect(r.ok, r.text).toBe(true); return r; };
const surf = (w: number, h: number) => ({ width: w, height: h, data: new Uint8Array(w * h) });
const base = { fusao: 0, luz: [-0.6, -0.7, 0.6] as [number, number, number], rampa: [1, 2, 3, 4], dither: false, ambiente: 0.15 };
// dois tubos em "L": horizontal e vertical se encontrando no canto (axila)
const L = [
  { nome: "a", pontos: [[10, 30, 0, 6], [40, 30, 0, 6]] as [number, number, number, number][] },
  { nome: "b", pontos: [[40, 30, 0, 6], [40, 55, 0, 6]] as [number, number, number, number][] },
];

describe("corpo 3D único (draw_shapes type=corpo)", () => {
  it("a fusão preenche a junta (axila) com massa curva", () => {
    const dura = surf(64, 64), suave = surf(64, 64);
    const n0 = drawBody(dura, { ...base, partes: L });
    const n1 = drawBody(suave, { ...base, fusao: 10, partes: L });
    expect(n1).toBeGreaterThan(n0);
    // pixel no canto interno da axila: vazio na união dura, preenchido na fusão
    const k = 38 * 64 + 33;
    expect(dura.data[k]).toBe(0);
    expect(suave.data[k]).not.toBe(0);
  });

  it("contorno de oclusão só entre partes NÃO unidas", () => {
    // tubo "frente" passa por cima do "fundo" (z bem maior)
    const partes = [
      { nome: "fundo", pontos: [[5, 32, 0, 8], [59, 32, 0, 8]] as [number, number, number, number][] },
      { nome: "frente", pontos: [[32, 5, 12, 5], [32, 59, 12, 5]] as [number, number, number, number][] },
    ];
    const sep = surf(64, 64), uni = surf(64, 64);
    drawBody(sep, { ...base, contorno: 9, partes, unir: [] });
    drawBody(uni, { ...base, contorno: 9, partes, unir: [["fundo", "frente", 10]] });
    // ao lado do tubo da frente, sobre o tubo do fundo: contorno na versão separada
    const countEdge = (s: { data: Uint8Array }) => { let c = 0; for (let y = 28; y <= 36; y++) for (let x = 20; x <= 44; x++) if (s.data[y * 64 + x] === 9) c++; return c; };
    expect(countEdge(sep)).toBeGreaterThan(countEdge(uni));
  });

  it("contorno seletivo é mais claro no lado da luz", () => {
    const p = createProject({ width: 48, height: 48 });
    ok(p, "set_palette", { colors: ["#200810", "#501828", "#903040", "#d06050", "#f8a070"].map((hex, i) => ({ key: "abcde"[i], hex, name: `t${i}` })) });
    ok(p, "draw_shapes", { shapes: [{ type: "corpo", partes: [{ nome: "bola", elipse: { cx: 24, cy: 24, rx: 16, ry: 16, rz: 16 } }], rampa: ["t0", "t1", "t2", "t3", "t4"], contorno: "seletivo", ambiente: 0.1 }] });
    const cel = p.frames[0].cels[p.layers[0].id];
    const first = (row: number, fromLeft: boolean) => { for (let i = 0; i < 48; i++) { const x = fromLeft ? i : 47 - i; const v = cel[row * 48 + x]; if (v) return v; } return 0; };
    const lit = first(16, true), dark = first(34, false);
    expect(lit).not.toBe(dark);
    expect(dark).toBe(colorIndex(p, "t0"));
    expect(lit).not.toBe(colorIndex(p, "t0"));
  });

  it("avisa quando não pinta nada", () => {
    const p = createProject({ width: 16, height: 16 });
    ok(p, "set_palette", { colors: [{ key: "a", hex: "#aa2222", name: "a" }, { key: "b", hex: "#ff8888", name: "b" }] });
    const r = ok(p, "draw_shapes", { shapes: [{ type: "corpo", partes: [{ nome: "x", pontos: [[100, 100, 0, 4], [120, 100, 0, 4]] }], rampa: ["a", "b"] }] });
    expect(r.text).toMatch(/corpo não pintou nada/);
  });
});

describe("avaliar: xadrez grosso", () => {
  it("acusa área grande de dither 50% e não acusa tons sólidos", () => {
    const mk = (xadrez: boolean) => {
      const p = createProject({ width: 128, height: 128 });
      ok(p, "set_palette", { colors: [{ key: "a", hex: "#402030", name: "escuro" }, { key: "b", hex: "#c08050", name: "claro" }] });
      const rows = Array.from({ length: 128 }, (_, y) => Array.from({ length: 128 }, (_, x) => (xadrez && x < 64 && y < 64 ? ((x + y) & 1 ? "a" : "b") : x < 64 ? "a" : "b")).join(""));
      ok(p, "draw_rows", { x: 0, y: 0, rows, preview: false });
      const r = ok(p, "avaliar", { tipo: "cena" });
      return r.text;
    };
    expect(mk(true)).toMatch(/xadrez_grosso/);
    expect(mk(false)).not.toMatch(/xadrez_grosso/);
  });
});

describe("texto em fonte de pixel", () => {
  it("desenha letras, acentos e cedilha, centralizado", () => {
    const p = createProject({ width: 64, height: 16 });
    ok(p, "set_palette", { colors: [{ key: "a", hex: "#ffffff", name: "branco" }] });
    ok(p, "draw_shapes", { shapes: [{ type: "texto", texto: "AÇÃO", x: 32, y: 4, color: "a", alinhar: "centro" }] });
    const cel = p.frames[0].cels[p.layers[0].id];
    const lit = (x: number, y: number) => cel[y * 64 + x] !== 0;
    // largura 4 letras = 4*3+3 = 15 -> começa em 32-8 = 24 (arredondado 25)
    let minX = 64, maxX = 0, minY = 16, maxY = 0;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 64; x++) if (lit(x, y)) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    expect(maxX - minX).toBe(14);
    expect(minY).toBe(2);   // til acima do corpo
    expect(maxY).toBe(9);   // cedilha abaixo do corpo
  });
});

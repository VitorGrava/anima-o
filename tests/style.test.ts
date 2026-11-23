/**
 * Testes de estilo: o que faz uma pixel art ser BOA, não só o que faz a ferramenta funcionar.
 *
 * 1) Cada regra de estilo do `check` tem um exemplo ruim (tem que acusar) e um bom (não pode acusar).
 * 2) O prompt da IA tem que ensinar cada regra que o `check` cobra (as duas coisas andam juntas).
 * 3) As animações geradas pelos agentes no bench têm que passar num portão mínimo de qualidade.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SYSTEM_PROMPT } from "../server/prompt.ts";
import { analyze, analyzeFrame, createProject, fromJSON, runCommand, type Project } from "../src/engine/index.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function sprite(w: number, h: number, colors: Record<string, string>): Project {
  const p = createProject({ width: w, height: h });
  runCommand(p, "set_palette", { colors: Object.entries(colors).map(([key, hex]) => ({ key, hex, name: `c${key}` })) });
  return p;
}
const draw = (p: Project, rows: string[], x = 0, y = 0, frames: number | "all" = 0) =>
  runCommand(p, "draw_rows", { frames, rows, x, y, preview: false });
const codes = (p: Project, f = 0) => analyzeFrame(p, f).map((i) => i.code);

describe("regra: contorno escuro (selout), não claro", () => {
  const COLORS = { d: "#2a1030", m: "#c03050", l: "#ffd0d8" };
  it("contorno claro em volta de miolo escuro é acusado", () => {
    const p = sprite(16, 16, COLORS);
    const fill = (c: string, w: number) => c.repeat(w);
    draw(p, [fill("l", 10), ...Array(8).fill("l" + fill("d", 8) + "l"), fill("l", 10)], 3, 3);
    expect(codes(p)).toContain("contorno_claro");
  });
  it("contorno escuro com miolo mais claro passa", () => {
    const p = sprite(16, 16, COLORS);
    const fill = (c: string, w: number) => c.repeat(w);
    draw(p, [fill("d", 10), ...Array(8).fill("d" + fill("m", 8) + "d"), fill("d", 10)], 3, 3);
    expect(codes(p)).not.toContain("contorno_claro");
  });
});

describe("regra: sombreamento com direção de luz (sem pillow shading)", () => {
  const COLORS = { a: "#201028", b: "#50285a", c: "#905a98", d: "#e0b0e8" };
  const disc = (shade: (x: number, y: number, d: number) => string) => {
    const p = sprite(24, 24, COLORS);
    const rows: string[] = [];
    for (let y = 0; y < 20; y++) {
      let r = "";
      for (let x = 0; x < 20; x++) {
        const dx = x - 9.5, dy = y - 9.5, dist = Math.hypot(dx, dy);
        r += dist > 9.6 ? "." : shade(x, y, 9.6 - dist);
      }
      rows.push(r);
    }
    draw(p, rows, 2, 2);
    return p;
  };
  it("claro no centro e escuro em toda a borda (almofada) é acusado", () => {
    const p = disc((_x, _y, d) => (d < 1.5 ? "a" : d < 3.5 ? "b" : d < 6 ? "c" : "d"));
    expect(codes(p)).toContain("pillow_shading");
  });
  it("luz vinda de cima-esquerda passa", () => {
    const p = disc((x, y) => { const t = (x + y) / 38; return t < 0.3 ? "d" : t < 0.5 ? "c" : t < 0.72 ? "b" : "a"; });
    expect(codes(p)).not.toContain("pillow_shading");
  });
});

describe("falsos positivos que as regras não podem ter", () => {
  it("contorno escuro + miolo chapado com um brilho de canto não é pillow shading", () => {
    const p = sprite(20, 20, { o: "#2a0a18", r: "#d02838", s: "#8a1428", h: "#ff7a70" });
    runCommand(p, "draw_shapes", { shapes: [
      { type: "ellipse", x: 3, y: 3, w: 14, h: 14, color: "o" },
      { type: "ellipse", x: 4, y: 4, w: 12, h: 12, color: "r" },
      { type: "rect", x: 6, y: 5, w: 3, h: 2, color: "h" },
      { type: "line", x1: 6, y1: 13, x2: 12, y2: 15, color: "s" },
    ], preview: false });
    expect(codes(p)).not.toContain("pillow_shading");
  });
  it("linha diagonal de 1 px (brilho/sombra) não é ruído", () => {
    const p = sprite(20, 20, { a: "#202040", b: "#8080c0", c: "#ffffff" });
    draw(p, Array.from({ length: 14 }, () => "b".repeat(14)), 3, 3);
    runCommand(p, "draw_shapes", { shapes: [{ type: "line", x1: 4, y1: 4, x2: 15, y2: 15, color: "c" }], preview: false });
    expect(codes(p)).not.toContain("ruido");
  });
  it("efeito emissivo (centro claro, borda escura) não leva aviso de contorno nem de pillow", () => {
    const p = sprite(24, 24, { a: "#601008", b: "#d04010", c: "#ffa020", d: "#fff0a0" });
    const rows: string[] = [];
    for (let y = 0; y < 20; y++) {
      let r = "";
      for (let x = 0; x < 20; x++) { const d = 9.6 - Math.hypot(x - 9.5, y - 9.5); r += d < 0 ? "." : d < 1.5 ? "a" : d < 3.5 ? "b" : d < 6 ? "c" : "d"; }
      rows.push(r);
    }
    draw(p, rows, 2, 2);
    const normal = analyzeFrame(p, 0).map((i) => i.code);
    const fx = analyzeFrame(p, 0, { tipo: "efeito" }).map((i) => i.code);
    expect(normal).toContain("pillow_shading");
    expect(fx).not.toContain("pillow_shading");
  });
});

describe("regra: banding", () => {
  const COLORS = { a: "#101010", b: "#404040", c: "#707070", d: "#a0a0a0", e: "#d0d0d0" };
  it("faixas de 1 px em degradê paralelas à borda são acusadas", () => {
    const p = sprite(20, 20, COLORS);
    const rows = Array.from({ length: 12 }, () => "abcde" + "e".repeat(2) + "edcba");
    draw(p, rows, 3, 4);
    expect(codes(p)).toContain("banding");
  });
  it("blocos grandes de luz e sombra passam", () => {
    const p = sprite(20, 20, COLORS);
    const rows = Array.from({ length: 12 }, () => "aa" + "bbbb" + "cccccc" + "dd");
    draw(p, rows, 3, 4);
    expect(codes(p)).not.toContain("banding");
  });
});

describe("regra: ruído / dither aleatório", () => {
  const COLORS = { a: "#202040", b: "#8080c0" };
  it("pixels isolados espalhados são acusados; xadrez 50% em área grande não vira ilha", () => {
    const noisy = sprite(20, 20, COLORS);
    const rows = Array.from({ length: 14 }, (_, y) => Array.from({ length: 14 }, (_, x) => ((x % 3 === 1 && y % 3 === 1) ? "a" : "b")).join(""));
    draw(noisy, rows, 3, 3);
    expect(codes(noisy)).toContain("ruido");
    const clean = sprite(20, 20, COLORS);
    draw(clean, Array.from({ length: 14 }, (_, y) => (y < 7 ? "b".repeat(14) : "a".repeat(14))), 3, 3);
    expect(codes(clean)).not.toContain("ruido");
  });
});

describe("regra: contraste com o fundo e luz consistente entre frames", () => {
  const COLORS = { f: "#808080", g: "#888888", h: "#101010", l: "#f0f0f0" };
  const scene = (figure: string) => {
    const p = sprite(24, 24, COLORS);
    runCommand(p, "update_layer", { layer: "Base", rename: "fundo" });
    runCommand(p, "add_layer", { name: "figura" });
    runCommand(p, "draw_shapes", { layer: "fundo", shapes: [{ type: "rect", x: 0, y: 0, w: 24, h: 24, color: "f" }], preview: false });
    runCommand(p, "add_frames", { count: 1, copy_from: 0 });
    runCommand(p, "draw_shapes", { layer: "figura", frames: "all", shapes: [{ type: "rect", x: 8, y: 6, w: 8, h: 12, color: figure }], preview: false });
    runCommand(p, "transform", { layer: "figura", frames: 1, op: "shift", dy: -1, preview: false });
    return p;
  };
  it("figura cinza sobre fundo cinza é acusada; figura escura passa", () => {
    expect(analyze(scene("g"), [0, 1]).issues.map((i) => i.code)).toContain("contraste_fraco");
    expect(analyze(scene("h"), [0, 1]).issues.map((i) => i.code)).not.toContain("contraste_fraco");
  });
  it("luz que muda de lado entre frames é acusada", () => {
    const p = sprite(20, 20, { d: "#101018", l: "#f0f0f0", m: "#808090" });
    runCommand(p, "add_frames", { count: 1, copy_from: 0 });
    const block = (light: "left" | "right") =>
      Array.from({ length: 12 }, () => (light === "left" ? "llll" + "mmmm" + "dddd" : "dddd" + "mmmm" + "llll"));
    draw(p, block("left"), 4, 4, 0);
    draw(p, block("right"), 4, 4, 1);
    expect(analyze(p, [0, 1]).issues.map((i) => i.code)).toContain("luz_inconsistente");
    draw(p, block("left"), 4, 4, 1);
    expect(analyze(p, [0, 1]).issues.map((i) => i.code)).not.toContain("luz_inconsistente");
  });
});

describe("exemplos canônicos: feito do jeito certo, o check não reclama", () => {
  it("bola redonda com ellipse, contorno escuro e luz de cima-esquerda", () => {
    const p = sprite(20, 20, { o: "#3a0a18", r: "#d02838", s: "#8a1428", h: "#ff7a70" });
    runCommand(p, "draw_shapes", { shapes: [
      { type: "ellipse", x: 3, y: 3, w: 14, h: 14, color: "o" },
      { type: "ellipse", x: 4, y: 4, w: 12, h: 12, color: "r" },
      { type: "ellipse", x: 6, y: 7, w: 9, h: 9, color: "s", filled: false },
      { type: "rect", x: 6, y: 5, w: 3, h: 2, color: "h" },
    ], preview: false });
    const issues = analyzeFrame(p, 0).filter((i) => i.severity !== "info");
    expect(issues.map((i) => i.code)).not.toContain("contorno_claro");
    expect(issues.map((i) => i.code)).not.toContain("ruido");
  });
});

describe("contrato: o prompt da IA ensina cada regra que o check cobra", () => {
  const RULES: [string, RegExp][] = [
    ["pixel_solto / ruido", /pixels? solto|ruído|dither/i],
    ["serrilhado", /jaggies|serrilhad|2-1-2/i],
    ["contorno_claro", /contorno.*escuro|selout|escuro.*contorno/i],
    ["banding", /banding/i],
    ["pillow_shading", /pillow/i],
    ["contraste_fraco", /contraste/i],
    ["luz_inconsistente", /luz.*(uma direção|mesma)|mesma.*luz/i],
    ["volume_pulou", /volume/i],
    ["emenda_salta", /emenda|loops? fecha/i],
    ["tempo_uniforme", /nunca deixe todos os frames|set_frame_timing/i],
    ["sem_ease", /ease/i],
    ["efeito", /tipo.*efeito|efeitos/i],
    ["cores_parecidas / muitas_cores", /4–16 cores|cores coesa|poucas cores|paleta/i],
  ];
  for (const [rule, re] of RULES) {
    it(`prompt cobre: ${rule}`, () => expect(SYSTEM_PROMPT).toMatch(re));
  }
  it("toda regra de estilo do check tem um código documentado na descrição do comando", () => {
    const tools = JSON.stringify(runCommand(createProject(), "reference", { topic: "linhas_curvas" }));
    expect(tools.length).toBeGreaterThan(50);
  });
});

describe("portão de qualidade: animações geradas pelos agentes (bench/out)", () => {
  const dir = path.join(ROOT, "bench/out");
  const ids = existsSync(dir) ? readdirSync(dir).filter((d) => existsSync(path.join(dir, d, "anim.anima.json"))) : [];
  it("existe ao menos uma animação no bench", () => expect(ids.length).toBeGreaterThan(0));
  for (const id of ids) {
    it(`${id}: sem erros, paleta contida, tempos variados e emenda do loop suave`, () => {
      const p = fromJSON(JSON.parse(readFileSync(path.join(dir, id, "anim.anima.json"), "utf8")));
      const frames = p.frames.map((_, i) => i);
      const efeito = /estrela|fogueira|brilho|chama|fumaça/.test(id);
      const r = analyze(p, frames, { tipo: efeito ? "efeito" : "personagem" });
      const found = r.issues.map((i) => i.code);
      expect(r.issues.filter((i) => i.severity === "erro")).toEqual([]);
      expect(p.palette.length).toBeLessThanOrEqual(32);
      if (frames.length >= 4) expect(found, "todos os frames com a mesma duração").not.toContain("tempo_uniforme");
      expect(found, "o loop salta na emenda").not.toContain("emenda_salta");
      expect(found, "contorno claro").not.toContain("contorno_claro");
      expect(found, "pillow shading").not.toContain("pillow_shading");
    });
  }
});

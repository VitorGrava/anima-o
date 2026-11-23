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
import { analyze, analyzeFrame, createProject, frameToRows, fromJSON, runCommand, type Project } from "../src/engine/index.ts";

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

describe("os 12 princípios da animação (Alura/Disney)", () => {
  const NOMES = [
    /squash and stretch/i, /anticipation/i, /staging/i, /pose to pose/i, /follow through/i, /slow in and slow out/i,
    /arcs/i, /secondary action/i, /timing/i, /exaggeration/i, /solid drawing/i, /appeal/i,
  ];
  it("o prompt cita os 12 princípios pelo nome", () => {
    for (const re of NOMES) expect(SYSTEM_PROMPT, String(re)).toMatch(re);
  });
  it("reference principios traz os 12, a fonte e como aplicar na engine", () => {
    const r = runCommand(createProject(), "reference", { topic: "principios" });
    expect(r.ok).toBe(true);
    for (const re of NOMES) expect(r.text, String(re)).toMatch(re);
    expect(r.text).toMatch(/alura\.com\.br\/artigos\/12-principios-animacao/);
    expect((r.text.match(/Na engine:/g) ?? []).length).toBeGreaterThanOrEqual(10);
  });

  // pequenas animações construídas para provar cada medição
  const ballAnim = (positions: [number, number][], widths?: number[], durations?: number[]) => {
    const p = sprite(40, 40, { o: "#3a0a18", r: "#d02838" });
    runCommand(p, "add_frames", { count: positions.length - 1 });
    positions.forEach(([x, y], f) => {
      const w = widths?.[f] ?? 6;
      runCommand(p, "draw_shapes", { frames: f, shapes: [{ type: "ellipse", x, y, w, h: 6, color: "r" }], preview: false });
      if (durations) runCommand(p, "set_frame_timing", { frames: f, duration_ms: durations[f] });
    });
    return p;
  };
  const panel = (p: Project, opts = {}) => analyze(p, p.frames.map((_, i) => i), opts).principles!;
  const state = (pr: ReturnType<typeof panel>, n: number) => pr.find((q) => q.n === n)!.estado;

  it("o painel tem sempre os 12 princípios numerados e só aparece com 3+ frames", () => {
    const p = ballAnim([[5, 5], [10, 8], [16, 10], [22, 8]]);
    const pr = panel(p);
    expect(pr.map((q) => q.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(analyze(ballAnim([[5, 5], [10, 8]]), [0, 1]).principles).toBeUndefined();
    expect(runCommand(p, "check", { as_image: false }).text).toMatch(/Os 12 princípios da animação/);
  });
  it("3. staging: figura minúscula é apontada", () => {
    const p = sprite(64, 64, { r: "#d02838" });
    runCommand(p, "add_frames", { count: 2 });
    for (let f = 0; f < 3; f++) runCommand(p, "draw_rows", { frames: f, x: 30 + f, y: 30, rows: ["rr", "rr"], preview: false });
    expect(state(panel(p), 3)).toBe("atencao");
  });
  it("6/7. ease e arco: trajetória reta e linear pede melhoria; curva e com aceleração passa", () => {
    const linear = ballAnim([[2, 2], [8, 8], [14, 14], [20, 20], [26, 26]]);
    expect(state(panel(linear), 6)).toBe("atencao");
    expect(state(panel(linear), 7)).toBe("atencao");
    const arc = ballAnim([[2, 24], [6, 14], [12, 8], [20, 6], [28, 8], [34, 14]], undefined, [60, 60, 90, 120, 90, 60]);
    expect(state(panel(arc), 7)).toBe("ok");
    expect(state(panel(arc), 6)).toBe("ok");
  });
  it("2. antecipação: recuar antes da ação passa; sair direto é apontado", () => {
    const direct = ballAnim([[10, 10], [10, 10], [20, 10], [30, 10], [34, 10]]);
    expect(state(panel(direct), 2)).toBe("atencao");
    const wind = ballAnim([[14, 10], [12, 10], [22, 10], [32, 10], [36, 10]]);
    expect(state(panel(wind), 2)).toBe("ok");
  });
  it("9/4. timing: tempos iguais são apontados; segurar poses passa", () => {
    const flat = ballAnim([[2, 24], [6, 14], [12, 8], [20, 6], [28, 8]]);
    expect(state(panel(flat), 9)).toBe("atencao");
    const timed = ballAnim([[2, 24], [6, 14], [12, 8], [20, 6], [28, 8]], undefined, [60, 60, 70, 140, 60]);
    expect(state(panel(timed), 9)).toBe("ok");
    expect(state(panel(timed), 4)).toBe("ok");
  });
  it("8/5. ação secundária e sobreposição: partes que se movem em tempos diferentes passam", () => {
    const p = sprite(40, 20, { r: "#d02838", b: "#2030c0" });
    runCommand(p, "add_layer", { name: "cabelo" });
    runCommand(p, "add_frames", { count: 4 });
    for (let f = 0; f < 5; f++) {
      runCommand(p, "draw_rows", { frames: f, layer: "Base", x: 4 + f * 6, y: 8, rows: ["rr", "rr"], preview: false });
      runCommand(p, "draw_rows", { frames: f, layer: "cabelo", x: 4 + Math.max(0, f - 1) * 6 + 1, y: 6, rows: ["bb"], preview: false });
    }
    const pr = panel(p);
    expect(state(pr, 8)).toBe("ok");
    expect(state(pr, 5)).toBe("ok");
    const solo = ballAnim([[2, 2], [8, 8], [14, 14], [20, 20]]);
    expect(state(panel(solo), 8)).toBe("atencao");
  });
  it("10. exagero: movimento sutil (idle) não se aplica; poses quase iguais num movimento maior são apontadas", () => {
    const idle = ballAnim([[20, 20], [21, 20], [20, 20], [21, 20]]);
    expect(state(panel(idle), 10)).toBe("na");
    const timid = sprite(120, 120, { r: "#d02838" });
    runCommand(timid, "add_frames", { count: 3 });
    [[40, 60], [43, 60], [40, 60], [43, 60]].forEach(([x, y], f) => draw(timid, ["rr", "rr"], x, y, f));
    expect(state(panel(timid), 10)).toBe("atencao");
  });
  it("11. desenho sólido herda as regras de estilo (pillow shading derruba o item)", () => {
    const p = sprite(24, 24, { a: "#201028", b: "#50285a", c: "#905a98", d: "#e0b0e8" });
    runCommand(p, "add_frames", { count: 2 });
    const rows: string[] = [];
    for (let y = 0; y < 20; y++) { let r = ""; for (let x = 0; x < 20; x++) { const d = 9.6 - Math.hypot(x - 9.5, y - 9.5); r += d < 0 ? "." : d < 1.5 ? "a" : d < 3.5 ? "b" : d < 6 ? "c" : "d"; } rows.push(r); }
    for (let f = 0; f < 3; f++) draw(p, rows, 2, 2 + f, f);
    expect(state(panel(p), 11)).toBe("atencao");
  });
  it("efeito e rotação marcam squash/antecipação/sobreposição como não aplicáveis", () => {
    const p = ballAnim([[2, 2], [8, 8], [14, 14], [20, 20]]);
    expect(state(panel(p, { tipo: "efeito" }), 1)).toBe("na");
    expect(state(panel(p, { tipo: "rotacao" }), 8)).toBe("na");
  });
});

describe("novas ferramentas: erros úteis, blob, rotação e CLI", () => {
  it("chave desconhecida DENTRO de um item aninhado é apontada com o caminho e a sugestão", () => {
    const p = createProject();
    const r = runCommand(p, "set_palette", { colors: [{ key: "a", color: "#fff", name: "x" }] });
    expect(r.ok).toBe(false);
    expect(r.text).toMatch(/colors\[0\]\."color" não existe \(quis dizer "hex"\?\)/);
  });
  it("campo obrigatório ausente diz qual, em português", () => {
    const r = runCommand(createProject(), "set_palette", { colors: [{ key: "a", name: "x" }] });
    expect(r.ok).toBe(false);
    expect(r.text).toMatch(/colors\[0\]\.hex: falta este campo obrigatório/);
    expect(r.text).toMatch(/anima tools set_palette/);
  });
  it("blob: contorno escuro, luz de cima-esquerda e nada de pillow shading", () => {
    const p = sprite(32, 32, { o: "#10301c", b: "#4cc060", l: "#a6ec90", s: "#2c8a48", h: "#f0fff0" });
    const r = runCommand(p, "draw_shapes", { shapes: [{ type: "blob", x: 4, y: 6, w: 24, h: 20, outline: "o", base: "b", light: "l", shadow: "s", highlight: "h", squareness: 3 }], preview: false });
    expect(r.ok).toBe(true);
    const rows = frameToRows(p, 0);
    expect(rows[16][4]).toBe("o");                                 // contorno na borda
    const lit = rows.slice(8, 14).join("").split("l").length - 1, dark = rows.slice(20, 25).join("").split("s").length - 1;
    expect(lit).toBeGreaterThan(0);
    expect(dark).toBeGreaterThan(0);
    // luz em cima-esquerda, sombra embaixo-direita
    const count = (k: string, y0: number, y1: number, x0: number, x1: number) =>
      rows.slice(y0, y1).reduce((n: number, row: string) => n + row.slice(x0, x1).split(k).length - 1, 0);
    expect(count("l", 6, 16, 0, 16)).toBeGreaterThan(count("l", 16, 26, 16, 32));
    expect(count("s", 16, 26, 16, 32)).toBeGreaterThan(count("s", 6, 16, 0, 16));
    const codes = analyzeFrame(p, 0).map((i) => i.code);
    expect(codes).not.toContain("pillow_shading");
    expect(codes).not.toContain("contorno_claro");
  });
  it("check tipo rotacao não cobra volume nem movimento", () => {
    const p = sprite(24, 24, { r: "#d02838" });
    runCommand(p, "add_frames", { count: 3 });
    [10, 4, 2, 4].forEach((w, f) => runCommand(p, "draw_shapes", { frames: f, shapes: [{ type: "ellipse", x: 12 - w / 2, y: 4, w, h: 16, color: "r" }], preview: false }));
    const codes = analyze(p, [0, 1, 2, 3], { tipo: "rotacao" }).issues.map((i) => i.code);
    expect(codes).not.toContain("volume_pulou");
    expect(codes).not.toContain("quase_estatica");
    expect(analyze(p, [0, 1, 2, 3]).issues.map((i) => i.code)).toContain("volume_pulou");
  });
});

describe("lições da caminhada e do cavaleiro (rodada 4)", () => {
  /** figura de 3 camadas que se movem um pouco por frame (como um personagem articulado). */
  const rig = (wideFrames: boolean[]) => {
    const p = sprite(40, 40, { r: "#d02838", b: "#2030c0", g: "#30a050" });
    for (const name of ["perna", "braco", "tronco"]) runCommand(p, "add_layer", { name });
    runCommand(p, "add_frames", { count: wideFrames.length - 1 });
    wideFrames.forEach((wide, f) => {
      runCommand(p, "draw_rows", { frames: f, layer: "perna", x: 17, y: 13 + (f % 2), rows: wide ? ["r....r", ".r..r.", "..rr.."] : ["..rr..", "..rr..", "..rr.."], preview: false });
      runCommand(p, "draw_rows", { frames: f, layer: "tronco", x: 18, y: 9 + (f % 2), rows: ["bbbb", "bbbb", "bbbb", "bbbb"], preview: false });
      runCommand(p, "draw_rows", { frames: f, layer: "braco", x: 16 + (f % 2) * 6, y: 10, rows: ["gg", "gg"], preview: false });
    });
    return p;
  };
  it("figura articulada (3+ camadas se movendo) tolera a variação de área de um passo", () => {
    const p = rig([true, false, true, false]);
    expect(analyze(p, [0, 1, 2, 3], { loop: false }).issues.map((i) => i.code)).not.toContain("volume_pulou");
  });
  it("squash e stretch não se aplica a ciclo articulado sem deformação", () => {
    const p = rig([false, false, false, false]);
    expect(analyze(p, [0, 1, 2, 3]).principles!.find((q) => q.n === 1)!.estado).toBe("na");
  });
  it("a fresta entre cabeça e tronco (figura partida em 2 pedaços) é apontada, mesmo com o tronco parado", () => {
    const p = sprite(20, 20, { r: "#d02838", b: "#2030c0" });
    runCommand(p, "update_layer", { layer: "Base", name: "tronco" });
    runCommand(p, "add_layer", { name: "cabeca" });
    runCommand(p, "add_frames", { count: 3 });
    for (let f = 0; f < 4; f++) {
      runCommand(p, "draw_rows", { frames: f, layer: "tronco", x: 8, y: 10, rows: ["bbbb", "bbbb", "bbbb", "bbbb"], preview: false });
      runCommand(p, "draw_rows", { frames: f, layer: "cabeca", x: 8, y: f === 2 ? 5 : 7, rows: ["rrrr", "rrrr", "rrr."], preview: false }); // no frame 2 a cabeça sobe e abre um vão de 2 linhas
    }
    const split = analyze(p, [0, 1, 2, 3], { loop: false }).issues.find((i) => i.code === "figura_partida");
    expect(split?.message).toMatch(/frames 2/);
    // se a cabeça só sobe 0 px, nada a avisar
    runCommand(p, "draw_rows", { frames: 2, layer: "cabeca", x: 8, y: 7, rows: ["rrrr", "rrrr", "rrr."], preview: false });
    runCommand(p, "transform", { frames: 2, layer: "cabeca", op: "clear", preview: false });
    runCommand(p, "draw_rows", { frames: 2, layer: "cabeca", x: 8, y: 7, rows: ["rrrr", "rrrr", "rrr."], preview: false });
    expect(analyze(p, [0, 1, 2, 3], { loop: false }).issues.map((i) => i.code)).not.toContain("figura_partida");
  });
  it("segmento rígido: mesma massa e comprimento muito diferente é apontado", () => {
    const p = sprite(40, 40, { r: "#d02838" });
    runCommand(p, "add_frames", { count: 3 });
    const vertical = Array(8).fill("r"), block = ["rr", "rr", "rr", "rr"];     // 8 px nos dois casos
    [vertical, vertical, block, vertical].forEach((rows, f) => draw(p, rows, 10, 5, f));
    expect(analyze(p, [0, 1, 2, 3], { loop: false }).issues.map((i) => i.code)).toContain("segmento_muda");
    const same = sprite(40, 40, { r: "#d02838" });
    runCommand(same, "add_frames", { count: 3 });
    [0, 1, 2, 3].forEach((f) => draw(same, vertical, 10 + f, 5, f));
    expect(analyze(same, [0, 1, 2, 3], { loop: false }).issues.map((i) => i.code)).not.toContain("segmento_muda");
  });
  it("emenda do loop: salto grande é acusado; ir e voltar pelo mesmo caminho não", () => {
    const run = (xs: number[]) => {
      const p = sprite(30, 12, { r: "#d02838" });
      runCommand(p, "add_frames", { count: xs.length - 1 });
      xs.forEach((x, f) => draw(p, ["rrrr", "rrrr", "rrrr", "rrrr"], x, 4, f));
      return analyze(p, xs.map((_, i) => i)).issues.map((i) => i.code);
    };
    expect(run([2, 5, 8, 11])).toContain("emenda_salta");         // anda para longe e volta de uma vez
    const smooth = run([2, 5, 8, 5]);                              // vai e volta pelo mesmo caminho
    expect(smooth).not.toContain("emenda_salta");
    expect(smooth).not.toContain("emenda_loop");
  });
  it("emenda_loop compara a diferença de pixels com a média entre frames seguidos", () => {
    // o centro não se mexe (só a forma muda), então só a comparação de pixels pode pegar o salto
    const p = sprite(20, 20, { r: "#d02838", b: "#2030c0" });
    runCommand(p, "add_frames", { count: 3 });
    const shapes: string[][] = [["rrrr", "rrrr", "rrrr", "rrrr"], ["rrrr", "rrrr", "rrrr", "rrrb"], ["rrrr", "rrrr", "rrrr", "rrbb"], ["bbbb", "bbbb", "bbbb", "bbbb"]];
    shapes.forEach((rows, f) => draw(p, rows, 8, 8, f));
    const msg = analyze(p, [0, 1, 2, 3]).issues.find((i) => i.code === "emenda_loop")?.message ?? "";
    expect(msg).toMatch(/diferença média/);
  });
  it("draw_rows avisa quando as linhas têm larguras diferentes (erro de contar colunas)", () => {
    const p = sprite(20, 20, { r: "#d02838" });
    const r = runCommand(p, "draw_rows", { rows: ["rrrr", "rrr", "rrrr", "rrrr"], preview: false });
    expect(r.text).toMatch(/ATENÇÃO.*linha 1 tem 3/);
    expect(runCommand(p, "draw_rows", { rows: ["rr", "rr"], preview: false }).text).not.toMatch(/ATENÇÃO/);
  });
  it("reference proporcoes dá os comprimentos dos segmentos para articular", () => {
    const t = runCommand(createProject(), "reference", { topic: "proporcoes", height: 32, style: "estilizado" }).text;
    expect(t).toMatch(/Segmentos para articular/);
    expect(t).toMatch(/coxa ≈ \d+ px/);
    expect(t).toMatch(/canela \+ pé ≈ \d+ px/);
  });
});

import { describe, expect, it } from "vitest";
import {
  REFERENCE_TOPICS,
  analyze,
  analyzeFrame,
  createProject,
  makeRamp,
  reference,
  renderImages,
  runCommand,
  withRuler,
  type Project,
} from "../src/engine/index.ts";

function setup(w = 16, h = 16): Project {
  const p = createProject({ width: w, height: h });
  runCommand(p, "set_palette", {
    colors: [
      { key: "r", hex: "#ff0000", name: "vermelho" },
      { key: "q", hex: "#fa0505", name: "vermelho-quase" },
      { key: "b", hex: "#0000ff", name: "azul" },
    ],
  });
  return p;
}

const BODY = [".0000.", "0rrrr0", "0rrrr0", "0rrrr0", "0rrrr0", ".0000."];

describe("preview automático nos comandos de desenho", () => {
  it("draw_rows devolve o frame como grade com régua, a imagem e o resumo na primeira linha", () => {
    const p = setup();
    const r = runCommand(p, "draw_rows", { x: 2, y: 2, rows: BODY });
    expect(r.ok).toBe(true);
    expect(r.text.split("\n")[0]).toMatch(/pixels escritos/);
    expect(r.text).toMatch(/Frame 0 agora:/);
    expect(r.text).toContain(withRuler([".".repeat(16)]).split("\n")[0]);
    expect(r.images?.frames).toEqual([0]);
  });

  it("preview: false mantém a resposta curta e sem imagem", () => {
    const p = setup();
    const r = runCommand(p, "draw_rows", { x: 2, y: 2, rows: BODY, preview: false });
    expect(r.text).not.toMatch(/agora/);
    expect(r.images).toBeUndefined();
  });

  it("transform, draw_shapes e copy_layer_content também mostram o resultado", () => {
    const p = setup();
    runCommand(p, "draw_rows", { x: 2, y: 2, rows: BODY, preview: false });
    runCommand(p, "add_frames", { count: 1, copy_from: 0 });
    for (const [name, input] of [
      ["transform", { frames: 1, op: "shift", dx: 1 }],
      ["draw_shapes", { shapes: [{ type: "pixels", points: [[3, 3]], color: "b" }] }],
      ["copy_layer_content", { from_frame: 0, to_frames: 1, dy: 1 }],
    ] as const) {
      const r = runCommand(p, name, input);
      expect(r.ok, name).toBe(true);
      expect(r.images, name).toBeDefined();
      expect(r.text, name).toMatch(/agora/);
    }
  });

  it("editar vários frames mostra só o primeiro e avisa", () => {
    const p = setup();
    runCommand(p, "add_frames", { count: 2 });
    const r = runCommand(p, "draw_rows", { frames: "all", rows: ["rr"] });
    expect(r.images?.frames).toEqual([0]);
    expect(r.text).toMatch(/Prévia só do frame 0 \(editou 3\)/);
  });

  it("pixel solto aparece como aviso e vira marcação na imagem", () => {
    const p = setup();
    runCommand(p, "draw_rows", { x: 2, y: 2, rows: BODY, preview: false });
    const r = runCommand(p, "draw_rows", { x: 14, y: 0, rows: ["r"] });
    expect(r.text).toMatch(/AVISO .*pixel\(s\) solto/);
    expect(r.text).toContain("(14,0)");
    expect(r.images?.highlight).toContainEqual([14, 0]);
  });
});

describe("view: zoom, grade, diff e onion", () => {
  it("região recorta a grade de texto e a régua mostra coordenadas reais", () => {
    const p = setup(20, 12);
    runCommand(p, "draw_rows", { x: 12, y: 3, rows: ["rb", "br"], preview: false });
    const r = runCommand(p, "view", { region: { x: 10, y: 2, w: 6, h: 4 } });
    expect(r.text).toMatch(/região x10\.\.15, y2\.\.5/);
    expect(r.text).toContain("3 ..rb..");
    expect(r.text).toContain("4 ..br..");
    expect(r.images?.region).toEqual({ x: 10, y: 2, w: 6, h: 4 });
  });

  it("grade acrescenta margem com números; zoom usa escala maior", () => {
    const p = setup(16, 16);
    const plain = renderImages(p, { frames: [0], scale: 8 })[0];
    const gridded = renderImages(p, { frames: [0], scale: 8, grid: true })[0];
    expect(plain.width).toBe(128);
    expect(gridded.width).toBeGreaterThan(128);
    expect(gridded.height).toBeGreaterThan(128);
    const zoom = runCommand(p, "view", { region: { x: 0, y: 0, w: 4, h: 4 } });
    expect(zoom.images!.scale).toBe(32); // recorte pequeno => zoom máximo
    expect(zoom.images!.scale).toBeGreaterThan(runCommand(p, "view", {}).images!.scale);
  });

  it("compare conta o que apareceu, sumiu e trocou de cor", () => {
    const p = setup(6, 3);
    runCommand(p, "draw_rows", { rows: ["rr.", "..."], preview: false });
    runCommand(p, "add_frames", { count: 1, copy_from: 0 });
    runCommand(p, "draw_rows", { frames: 1, rows: ["b.r"], preview: false }); // r→b (troca), r→. (some), . →r (aparece)
    const r = runCommand(p, "view", { compare: { a: 0, b: 1 } });
    expect(r.text).toMatch(/1 apareceram \(\+\), 1 sumiram \(-\), 1 trocaram de cor \(~\)/);
    expect(r.text).toContain("~-+");
    expect(r.images?.compare).toEqual({ a: 0, b: 1 });
  });

  it("compare com frame inexistente dá erro útil", () => {
    const p = setup();
    const r = runCommand(p, "view", { compare: { a: 0, b: 5 } });
    expect(r.ok).toBe(false);
    expect(r.text).toMatch(/Frame 5 não existe/);
  });

  it("onion pinta o frame anterior atrás do atual", () => {
    const p = setup(4, 1);
    runCommand(p, "draw_rows", { rows: ["b..."], preview: false });
    runCommand(p, "add_frames", { count: 1 });
    const flat = renderImages(p, { frames: [1], scale: 1 })[0];
    const onion = renderImages(p, { frames: [1], scale: 1, onion: true })[0];
    expect([...onion.data.slice(0, 3)]).not.toEqual([...flat.data.slice(0, 3)]); // fantasma do frame 0
    expect(onion.data[2]).toBeGreaterThan(onion.data[0]); // tom azulado
    expect([...onion.data.slice(4, 7)]).toEqual([...flat.data.slice(4, 7)]); // onde não havia nada, igual
  });

  it("highlight marca pixels em magenta", () => {
    const p = setup(4, 4);
    const img = renderImages(p, { frames: [0], scale: 1, highlight: [[1, 1]] })[0];
    const o = (1 * 4 + 1) * 4;
    expect([img.data[o], img.data[o + 1], img.data[o + 2]]).toEqual([255, 0, 220]);
  });
});

describe("check: análises automáticas", () => {
  it("encontra pixel solto, furo e cores quase iguais", () => {
    const p = setup();
    runCommand(p, "draw_rows", {
      x: 2,
      y: 2,
      rows: [".0000000.", "0rrrrrrr0", "0rrr.rrr0", "0rrrrrrr0", "0rrrqrrr0", ".0000000."],
      preview: false,
    });
    runCommand(p, "draw_rows", { x: 14, y: 14, rows: ["b"], preview: false });
    const issues = analyzeFrame(p, 0);
    expect(issues.map((i) => i.code)).toEqual(expect.arrayContaining(["pixel_solto", "furo"]));
    const all = analyze(p, [0]).issues;
    expect(all.find((i) => i.code === "cores_parecidas")?.message).toMatch(/r≈q/);
  });

  it("assimetria só é reportada com symmetric", () => {
    const p = setup();
    runCommand(p, "draw_rows", { x: 2, y: 2, rows: ["0rrrr", "0rrrr", "0rrrr"], preview: false });
    expect(analyzeFrame(p, 0).some((i) => i.code === "assimetria")).toBe(false);
    runCommand(p, "draw_rows", { x: 2, y: 2, rows: ["0rrr0", "0rrr0", "0rr00"], preview: false });
    const asym = analyzeFrame(p, 0, { symmetric: true }).find((i) => i.code === "assimetria");
    expect(asym).toBeUndefined(); // desenho simétrico agora
    runCommand(p, "draw_rows", { x: 2, y: 2, rows: [".rrr0"], preview: false });
    expect(analyzeFrame(p, 0, { symmetric: true }).some((i) => i.code === "assimetria")).toBe(true);
  });

  it("detecta serrilhado irregular (2-2-1-2-2) mas aceita escada regular", () => {
    const p = setup(24, 24);
    const stair = (widths: number[]) => widths.map((w) => "r".repeat(w));
    // borda direita crescendo 1 px por run: runs de altura 2,2,1,2,2 (irregular)
    const irregular = [1, 1, 2, 2, 3, 3, 4, 5, 5, 6, 6, 7, 7].map((w) => "r".repeat(w));
    runCommand(p, "draw_rows", { x: 2, y: 2, rows: irregular, preview: false });
    expect(analyzeFrame(p, 0).some((i) => i.code === "serrilhado")).toBe(true);

    const q = setup(24, 24);
    const regular = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7].map((w) => "r".repeat(w));
    runCommand(q, "draw_rows", { x: 2, y: 2, rows: regular, preview: false });
    expect(analyzeFrame(q, 0).some((i) => i.code === "serrilhado")).toBe(false);
    void stair;
  });

  it("anatomia pulando: volume que muda entre frames e emenda do loop", () => {
    const p = setup(20, 20);
    runCommand(p, "draw_rows", { x: 2, y: 2, rows: BODY, preview: false });
    runCommand(p, "add_frames", { count: 1, copy_from: 0 });
    runCommand(p, "draw_shapes", { frames: 1, shapes: [{ type: "rect", x: 8, y: 8, w: 8, h: 8, color: "b" }], preview: false });
    const r = runCommand(p, "check", {});
    expect(r.ok).toBe(true);
    expect(r.text).toMatch(/volume|área da silhueta mudou/);
    expect(r.text).toMatch(/último→primeiro/);
    expect(r.text).toMatch(/Medidas do frame 0/);
    expect(r.text).toMatch(/camada "Base"/);
  });

  it("base que sobe 3+ px é sinalizada (pés flutuando)", () => {
    const p = setup(20, 20);
    runCommand(p, "draw_rows", { x: 2, y: 8, rows: BODY, preview: false });
    runCommand(p, "add_frames", { count: 1, copy_from: 0 });
    runCommand(p, "transform", { frames: 1, op: "shift", dy: -4, preview: false });
    expect(analyze(p, [0, 1], { loop: false }).issues.some((i) => i.code === "base_mudou")).toBe(true);
  });

  it("arte limpa e animação estável: nenhum aviso", () => {
    const p = setup(16, 16);
    runCommand(p, "draw_rows", { x: 4, y: 4, rows: BODY, preview: false });
    runCommand(p, "add_frames", { count: 1, copy_from: 0 });
    runCommand(p, "transform", { frames: 1, op: "shift", dy: -1, preview: false });
    const r = analyze(p, [0, 1]);
    expect(r.issues.filter((i) => i.severity !== "info")).toEqual([]);
  });

  it("frame vazio é avisado", () => {
    const p = setup();
    expect(analyzeFrame(p, 0)[0].code).toBe("frame_vazio");
  });
});

describe("reference: anatomia e pixel art", () => {
  it("todos os tópicos respondem com conteúdo", () => {
    for (const t of REFERENCE_TOPICS) expect(reference(t, { height: 32 }).length, t).toBeGreaterThan(80);
  });

  it("proporções são calculadas em pixels para a altura pedida", () => {
    const t32 = reference("proporcoes", { height: 32, style: "estilizado" });
    expect(t32).toMatch(/Cabeça ≈ 8\.0 px/);
    expect(t32).toMatch(/y ≈\s+16\s+cotovelo e cintura/);
    const t64 = reference("proporcoes", { height: 64, style: "realista" });
    expect(t64).toMatch(/Cabeça ≈ 8\.5 px/);
    expect(t64).toMatch(/y ≈\s+32\s+virilha/);
    expect(reference("proporcoes", { height: 16, style: "chibi" })).toMatch(/Cabeça ≈ 6\.4 px/);
  });

  it("rampa: o tom do meio é a cor base, sombras ficam mais frias e luzes mais quentes", () => {
    const ramp = makeRamp("#c8794a", 5);
    expect(ramp).toHaveLength(5);
    expect(ramp[2]).toBe("#c8794a");
    const lum = (h: string) => parseInt(h.slice(1, 3), 16) * 0.3 + parseInt(h.slice(3, 5), 16) * 0.59 + parseInt(h.slice(5, 7), 16) * 0.11;
    for (let i = 1; i < ramp.length; i++) expect(lum(ramp[i])).toBeGreaterThan(lum(ramp[i - 1]));
    const hue = (h: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
      const max = Math.max(r, g, b);
      const d = max - Math.min(r, g, b);
      const hh = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return hh * 60;
    };
    // base laranja-terroso (~22°): a luz anda para o amarelo (matiz sobe), a sombra anda para o roxo (260°), dando a volta no círculo
    expect(hue(ramp[4])).toBeGreaterThan(hue(ramp[2]));
    const dist = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
    expect(dist(hue(ramp[0]), 260)).toBeLessThan(dist(hue(ramp[2]), 260)); // sombra mais perto do roxo
  });

  it("paletas trazem JSON pronto para set_palette", () => {
    const p = createProject();
    const text = reference("paletas");
    const json = JSON.parse(text.split("\n").find((l) => l.startsWith("[{"))!);
    expect(json).toHaveLength(16);
    expect(runCommand(p, "set_palette", { colors: json }).ok).toBe(true);
  });

  it("o comando reference usa a altura do canvas por padrão", () => {
    const p = createProject({ width: 48, height: 48 });
    const r = runCommand(p, "reference", { topic: "proporcoes" });
    expect(r.ok).toBe(true);
    expect(r.text).toMatch(/sprite de 48 px/);
  });
});

import { describe, expect, it } from "vitest";
import {
  createProject,
  exportGIF,
  frameToRows,
  fromJSON,
  renderSpritesheetRGBA,
  runCommand,
  toJSON,
} from "../src/engine/index.ts";

function setup() {
  const p = createProject({ width: 8, height: 6 });
  runCommand(p, "set_palette", {
    colors: [
      { key: "r", hex: "#ff0000", name: "vermelho" },
      { key: "b", hex: "#0000ff", name: "azul" },
    ],
  });
  return p;
}

describe("comandos de desenho", () => {
  it("draw_rows escreve e view lê de volta exatamente", () => {
    const p = setup();
    const rows = [".00.00..", "0rr0rr0.", "0rrrrr0.", ".0rrr0..", "..0r0...", "...0...."];
    const r = runCommand(p, "draw_rows", { rows });
    expect(r.ok).toBe(true);
    expect(frameToRows(p, 0)).toEqual(rows);
  });

  it("espaço preserva pixels existentes", () => {
    const p = setup();
    runCommand(p, "draw_shapes", { shapes: [{ type: "rect", x: 0, y: 0, w: 8, h: 6, color: "b" }] });
    runCommand(p, "draw_rows", { x: 1, y: 1, rows: ["r r"] });
    expect(frameToRows(p, 0)[1]).toBe("brbrbbbb");
  });

  it("formas: linha, elipse e balde", () => {
    const p = setup();
    const r = runCommand(p, "draw_shapes", {
      shapes: [
        { type: "rect", x: 0, y: 0, w: 8, h: 6, color: "0", filled: false },
        { type: "fill", x: 3, y: 3, color: "r" },
        { type: "line", x1: 0, y1: 0, x2: 7, y2: 5, color: "b" },
      ],
    });
    expect(r.ok).toBe(true);
    const rows = frameToRows(p, 0);
    expect(rows[0][0]).toBe("b");
    expect(rows[5][7]).toBe("b");
    expect(rows[2][5]).toBe("r");
  });

  it("recolorir pela paleta muda todos os frames", () => {
    const p = setup();
    runCommand(p, "draw_rows", { rows: ["rr"] });
    runCommand(p, "add_frames", { count: 2, copy_from: 0 });
    runCommand(p, "set_palette", { colors: [{ key: "r", hex: "#00ff00", name: "verde" }] });
    expect(p.palette.find((c) => c.key === "r")?.hex).toBe("#00ff00");
    expect(frameToRows(p, 2)[0].slice(0, 2)).toBe("rr");
  });

  it("remove_colors remapeia índices", () => {
    const p = setup();
    runCommand(p, "draw_rows", { rows: ["0rb"] });
    runCommand(p, "remove_colors", { keys: ["r"] });
    expect(frameToRows(p, 0)[0].slice(0, 3)).toBe("0.b");
  });
});

describe("animação", () => {
  it("copy_layer_content com deslocamento cria movimento", () => {
    const p = setup();
    runCommand(p, "draw_rows", { rows: ["r"] });
    runCommand(p, "add_frames", { count: 3 });
    const r = runCommand(p, "copy_layer_content", { from_frame: 0, to_frames: { from: 1, to: 3 }, dx: 2, dy: 1 });
    expect(r.ok).toBe(true);
    expect(frameToRows(p, 3)[1][2]).toBe("r");
  });

  it("shift com wrap dá a volta", () => {
    const p = setup();
    runCommand(p, "draw_rows", { x: 7, rows: ["r"] });
    runCommand(p, "transform", { frames: 0, op: "shift", dx: 1, wrap: true });
    expect(frameToRows(p, 0)[0][0]).toBe("r");
  });

  it("camadas: a de cima cobre a de baixo", () => {
    const p = setup();
    runCommand(p, "draw_rows", { rows: ["bb"] });
    runCommand(p, "add_layer", { name: "olhos" });
    runCommand(p, "draw_rows", { layer: "olhos", rows: [".r"] });
    expect(frameToRows(p, 0)[0].slice(0, 2)).toBe("br");
    runCommand(p, "update_layer", { layer: "olhos", visible: false });
    expect(frameToRows(p, 0)[0].slice(0, 2)).toBe("bb");
  });
});

describe("robustez", () => {
  it("erros não corrompem o projeto (comando atômico)", () => {
    const p = setup();
    const before = JSON.stringify(toJSON(p));
    const r = runCommand(p, "set_palette", {
      colors: [
        { key: "g", hex: "#00ff00", name: "verde" },
        { key: "h", hex: "não-é-cor", name: "x" },
      ],
    });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(toJSON(p))).toBe(before);
  });

  it("entrada inválida e cor desconhecida dão mensagens úteis", () => {
    const p = setup();
    expect(runCommand(p, "draw_rows", { rows: "abc" }).text).toMatch(/Entrada inválida/);
    expect(runCommand(p, "draw_rows", { rows: ["z"] }).text).toMatch(/não está na paleta/);
    expect(runCommand(p, "view", { frames: 9 }).text).toMatch(/Frame 9 não existe/);
  });
});

describe("serialização e exportação", () => {
  it("JSON ida e volta", () => {
    const p = setup();
    runCommand(p, "draw_rows", { rows: ["0rb"] });
    runCommand(p, "add_frames", { count: 1, copy_from: 0 });
    const q = fromJSON(JSON.parse(JSON.stringify(toJSON(p))));
    expect(frameToRows(q, 1)).toEqual(frameToRows(p, 1));
  });

  it("GIF válido", () => {
    const p = setup();
    runCommand(p, "draw_rows", { rows: ["0rb"] });
    runCommand(p, "add_frames", { count: 1, copy_from: 0 });
    const gif = exportGIF(p, 2);
    expect(new TextDecoder().decode(gif.slice(0, 6))).toBe("GIF89a");
    expect(gif[gif.length - 1]).toBe(0x3b);
  });

  it("spritesheet tem frames lado a lado", () => {
    const p = setup();
    runCommand(p, "add_frames", { count: 2 });
    const sheet = renderSpritesheetRGBA(p, 3, 2);
    expect(sheet.width).toBe(8 * 2 * 3);
    expect(sheet.height).toBe(6 * 2);
  });
});

describe("rotate", () => {
  it("90° horário leva uma linha horizontal para a vertical, sem perder pixels", () => {
    const p = createProject({ width: 9, height: 9 });
    runCommand(p, "set_palette", { colors: [{ key: "r", hex: "#ff0000", name: "vermelho" }] });
    runCommand(p, "draw_shapes", { shapes: [{ type: "line", x1: 4, y1: 4, x2: 8, y2: 4, color: "r" }] });
    const r = runCommand(p, "transform", { frames: 0, op: "rotate", angle: 90, cx: 4.5, cy: 4.5 });
    expect(r.ok).toBe(true);
    const rows = frameToRows(p, 0);
    for (let y = 4; y <= 8; y++) expect(rows[y][4]).toBe("r");
    expect(rows.join("").split("r").length - 1).toBe(5);
  });

  it("45° mantém uma linha diagonal contínua", () => {
    const p = createProject({ width: 21, height: 21 });
    runCommand(p, "set_palette", { colors: [{ key: "r", hex: "#ff0000", name: "vermelho" }] });
    runCommand(p, "draw_shapes", { shapes: [{ type: "line", x1: 10, y1: 10, x2: 19, y2: 10, color: "r" }] });
    runCommand(p, "transform", { frames: 0, op: "rotate", angle: -45, cx: 10.5, cy: 10.5 });
    const rows = frameToRows(p, 0);
    // cada linha entre o pivô e a ponta tem ao menos um pixel (sem buracos)
    for (let y = 4; y <= 10; y++) expect(rows[y]).toContain("r");
  });
});

describe("view com modos de conferência", () => {
  it("silhueta pinta tudo de preto sobre branco; cinza tira a cor", async () => {
    const { renderCheckRGBA } = await import("../src/engine/render.ts");
    const p = setup();
    runCommand(p, "draw_rows", { rows: ["rb"] });
    const sil = renderCheckRGBA(p, 0, 1, "silhueta");
    expect([...sil.data.slice(0, 4)]).toEqual([0, 0, 0, 255]);
    expect([...sil.data.slice(8, 12)]).toEqual([255, 255, 255, 255]); // transparente
    const g = renderCheckRGBA(p, 0, 1, "cinza");
    expect(g.data[0]).toBe(g.data[1]);
    expect(g.data[1]).toBe(g.data[2]);
    const r = runCommand(p, "view", { check: "luz_sombra" });
    expect(r.images?.mode).toBe("luz_sombra");
  });
});

describe("set_frame_timing auto", () => {
  it("segura frames de pouco movimento e acelera os de muito movimento", () => {
    const p = createProject({ width: 16, height: 8, fps: 10 });
    runCommand(p, "set_palette", { colors: [{ key: "r", hex: "#d84a3a", name: "r" }] });
    runCommand(p, "add_frames", { count: 3 });
    runCommand(p, "draw_shapes", { frames: 0, shapes: [{ type: "rect", x: 0, y: 0, w: 2, h: 2, color: "r", fill: true }] });
    runCommand(p, "draw_shapes", { frames: 1, shapes: [{ type: "rect", x: 1, y: 0, w: 2, h: 2, color: "r", fill: true }] });
    runCommand(p, "draw_shapes", { frames: 2, shapes: [{ type: "rect", x: 8, y: 4, w: 4, h: 4, color: "r", fill: true }] });
    runCommand(p, "draw_shapes", { frames: 3, shapes: [{ type: "rect", x: 1, y: 0, w: 2, h: 2, color: "r", fill: true }] });
    const r = runCommand(p, "set_frame_timing", { duration_ms: "auto" });
    expect(r.ok, r.text).toBe(true);
    const d = p.frames.map((f) => f.duration ?? 0);
    expect(Math.min(...d)).toBeGreaterThanOrEqual(60);
    expect(d[2]).toBeLessThan(d[0]);          // o frame do salto grande é o mais rápido
  });
});

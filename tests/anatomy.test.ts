/**
 * Anatomia humana por construção: as garantias do esqueleto (draw_figure / rig.ts).
 * Os erros que o bench mostrou (braço desconectado, mão sem arma, membro que muda de tamanho,
 * cotovelo dobrando para trás, pé flutuando) NÃO podem acontecer quando a figura vem do esqueleto.
 */
import { describe, expect, it } from "vitest";
import { SYSTEM_PROMPT } from "../server/prompt.ts";
import { analyze, createProject, renderFigure, runCommand, type Project } from "../src/engine/index.ts";
import { PRESETS, WALK_CYCLE, swapSides, type FigureLayer, type Pose } from "../src/engine/rig.ts";

const RAMP = { outline: 1, dark: 2, base: 3, light: 4 };
const RAMPS = { skin: RAMP, hair: RAMP, top: RAMP, bottom: RAMP, boots: RAMP, metal: RAMP, gold: RAMP };
const spec = (pose: Pose, extra = {}) => ({ width: 64, height: 64, figureHeight: 48, style: "estilizado" as const, x: 30, ground: 60, facing: "right" as const, pose, ramps: RAMPS, face: true, ...extra });
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

const cycle = (): Pose[] => Array.from({ length: 8 }, (_, f) => (f >= 4 ? swapSides(PRESETS[WALK_CYCLE[f % 4]]) : PRESETS[WALK_CYCLE[f % 4]]));

describe("os ossos mantêm o comprimento em qualquer pose", () => {
  it("coxa, canela, braço e antebraço têm o mesmo comprimento nos 8 frames da caminhada e em poses extremas", () => {
    const poses = [...cycle(), { ...PRESETS.parado, shoulder_front: 170, elbow_front: 120, hip_front: 90, knee_front: 100 }];
    const lens = poses.map((p) => { const j = renderFigure(spec(p)).joints; return { thigh: dist(j.pelvis, j.kneeFront), arm: dist(j.shoulder, j.elbowFront), thighB: dist(j.pelvis, j.kneeBack), armB: dist(j.shoulder, j.elbowBack) }; });
    for (const k of ["thigh", "arm", "thighB", "armB"] as const) {
      const vals = lens.map((l) => l[k]);
      expect(Math.max(...vals) - Math.min(...vals), k).toBeLessThan(0.01);
    }
  });
  it("as proporções seguem o estilo: o chibi tem cabeça proporcionalmente maior que o realista", () => {
    const head = (style: "realista" | "estilizado" | "chibi") => { const j = renderFigure(spec(PRESETS.parado, { style })).joints; return dist(j.shoulder, j.headCenter); };
    const torsoOf = (style: "realista" | "estilizado" | "chibi") => { const j = renderFigure(spec(PRESETS.parado, { style })).joints; return dist(j.pelvis, j.shoulder); };
    expect(head("chibi") / torsoOf("chibi")).toBeGreaterThan(head("realista") / torsoOf("realista"));
  });
});

describe("limites anatômicos", () => {
  it("o cotovelo não dobra para trás nem o joelho para a frente: a engine ajusta e avisa", () => {
    const p = createProject({ width: 48, height: 48 });
    const r = runCommand(p, "draw_figure", { items: [{ frame: 0, pose: { elbow_front: -40, knee_front: 200 } }], preview: false });
    expect(r.ok).toBe(true);
    expect(r.text).toMatch(/elbow_front = -40° ficou fora do possível: o cotovelo só dobra para a frente/);
    expect(r.text).toMatch(/knee_front = 200°/);
    // na pose ajustada o antebraço NÃO fica à frente do braço pendurado
    const j = renderFigure(spec({ ...PRESETS.parado, elbow_front: -40 })).joints;
    expect(j.handFront.y).toBeGreaterThan(j.elbowFront.y - 0.01);
  });
  it("o joelho dobra para trás: com a coxa horizontal à frente, a perna flexionada fica atrás do joelho; esticada, vai à frente", () => {
    const bent = renderFigure(spec({ ...PRESETS.parado, hip_front: 90, knee_front: 135 })).joints;
    const straight = renderFigure(spec({ ...PRESETS.parado, hip_front: 90, knee_front: 0 })).joints;
    expect(bent.kneeFront.x).toBeGreaterThan(bent.pelvis.x + 5);           // a coxa foi para a frente nos dois casos
    expect(bent.footFront.x).toBeLessThan(bent.kneeFront.x + 3);           // flexionado: o pé desce/volta, não segue para a frente
    expect(straight.footFront.x).toBeGreaterThan(straight.kneeFront.x + 8); // esticado: o pé continua à frente do joelho
  });
});

describe("tudo está ligado e no chão", () => {
  it("a sola mais baixa encosta no chão em todos os frames da caminhada (sem flutuar nem afundar)", () => {
    for (const pose of cycle()) {
      const out = renderFigure(spec(pose));
      let lowest = -1;
      for (const l of ["perna-tras", "perna-frente"] as FigureLayer[]) for (let i = 0; i < out.layers[l].length; i++) if (out.layers[l][i]) lowest = Math.max(lowest, Math.floor(i / 64));
      expect(lowest).toBeGreaterThanOrEqual(58);
      expect(lowest).toBeLessThanOrEqual(60);
    }
  });
  it("pés no ar (pulo): o corpo sobe o tanto pedido", () => {
    const a = renderFigure(spec(PRESETS.parado)).joints.footFront.y, b = renderFigure(spec(PRESETS.parado, { airborne: 10 })).joints.footFront.y;
    expect(a - b).toBeCloseTo(10, 5);
  });
  it("a silhueta do ciclo de caminhada completo nunca se parte em pedaços (sem frestas) e não tem pixel solto", () => {
    const p = createProject({ width: 40, height: 40 });
    runCommand(p, "add_frames", { count: 7 });
    expect(runCommand(p, "draw_figure", { cycle: "caminhada", figure_height: 30, preview: false }).ok).toBe(true);
    const codes = analyze(p, p.frames.map((_, i) => i)).issues.map((i) => i.code);
    expect(codes).not.toContain("figura_partida");
    expect(codes).not.toContain("pixel_solto");
    expect(codes).not.toContain("segmento_muda");
  });
  it("a arma está presa à mão: a ponta fica a `length` da mão e o cabo encosta nela", () => {
    for (const angle of [-150, 15, 90, 170]) {
      const pose = { ...PRESETS.parado, shoulder_front: 85, elbow_front: 20, weapon: { hand: "front" as const, angle, length: 16 } };
      const out = renderFigure(spec(pose));
      const { handFront, weaponTip } = out.joints;
      expect(dist(handFront, weaponTip)).toBeGreaterThan(14);
      expect(dist(handFront, weaponTip)).toBeLessThan(17.5);
      let near = false;
      for (let i = 0; i < out.layers.arma.length; i++) if (out.layers.arma[i] && Math.hypot((i % 64) + 0.5 - handFront.x, Math.floor(i / 64) + 0.5 - handFront.y) < 2.5) near = true;
      expect(near, `arma a ${angle}° perto da mão`).toBe(true);
    }
  });
  it("a figura tem pescoço: a cabeça não toca o ombro direto", () => {
    const j = renderFigure(spec(PRESETS.parado)).joints;
    expect(dist(j.shoulder, j.headCenter)).toBeGreaterThan(3);
  });
});

describe("pose a pose com tween (princípios 4, 6 e 7)", () => {
  const make = () => {
    const p = createProject({ width: 56, height: 56 });
    runCommand(p, "add_frames", { count: 4 });
    runCommand(p, "draw_figure", { tween: true, preview: false, figure_height: 40, items: [
      { frame: 0, preset: "parado" }, { frame: 4, pose: { shoulder_front: 160, elbow_front: 40 } },
    ] });
    return p;
  };
  it("os frames entre duas poses-chave são interpolados (todos diferentes, em ordem)", () => {
    const p = make();
    const layer = p.layers.find((l) => l.name === "braco-frente")!;
    const sig = (f: number) => p.frames[f].cels[layer.id].reduce((a, v, i) => a + (v ? i : 0), 0);
    const sigs = [0, 1, 2, 3, 4].map(sig);
    expect(new Set(sigs).size).toBe(5);
  });
  it("o ease in/out faz o passo do meio maior que os das pontas (slow in / slow out)", () => {
    const p = make();
    const hand = (f: number) => {
      const layer = p.layers.find((l) => l.name === "braco-frente")!, cel = p.frames[f].cels[layer.id];
      let n = 0, y = 0;
      for (let i = 0; i < cel.length; i++) if (cel[i]) { n++; y += Math.floor(i / 56); }
      return y / n;
    };
    const steps = [0, 1, 2, 3].map((f) => Math.abs(hand(f + 1) - hand(f)));
    expect(Math.max(steps[1], steps[2])).toBeGreaterThan(Math.max(steps[0], steps[3]));
  });
  it("o ciclo de caminhada pede 8 frames e explica como criar", () => {
    const p = createProject({ width: 40, height: 40 });
    const r = runCommand(p, "draw_figure", { cycle: "caminhada", preview: false });
    expect(r.ok).toBe(false);
    expect(r.text).toMatch(/8 frames.*add_frames/s);
  });
  it("facing=left espelha: a mão da frente fica à esquerda do quadril", () => {
    const j = renderFigure(spec({ ...PRESETS.parado, shoulder_front: 90, elbow_front: 0 }, { facing: "left" })).joints;
    expect(j.handFront.x).toBeLessThan(j.pelvis.x - 5);
  });
});

describe("a IA é orientada a usar o esqueleto para humanos", () => {
  it("o prompt manda usar draw_figure para figuras humanas e explica a convenção dos ângulos", () => {
    expect(SYSTEM_PROMPT).toMatch(/draw_figure/);
    expect(SYSTEM_PROMPT).toMatch(/esqueleto/i);
    expect(SYSTEM_PROMPT).toMatch(/tween/);
    expect(SYSTEM_PROMPT).toMatch(/cycle/);
  });
  it("a descrição do comando documenta os ângulos, os limites e a arma presa à mão", () => {
    const d = JSON.stringify(runCommand(createProject(), "reference", { topic: "articulacoes" }));
    expect(d).toMatch(/draw_figure/);
  });
});

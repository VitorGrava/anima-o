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

describe("acessórios, cabelo, amplitude, rastro e paleta enxuta (lições do bench v2)", () => {
  const baseSpec = (pose: Pose, extra = {}) => spec(pose, extra);
  const layerBox = (layer: Uint8Array, w = 64) => {
    let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
    for (let i = 0; i < layer.length; i++) if (layer[i]) { const x = i % w, y = Math.floor(i / w); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    return x1 < 0 ? null : { x0, x1, y0, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  };
  const acc = (kind: "chapeu" | "mochila" | "capa") => ({ accessories: [{ kind, ramp: { outline: 5, dark: 6, base: 7, light: 8 } }] });

  it("o chapéu fica em cima da cabeça e a mochila nas costas, e os dois acompanham a inclinação do corpo", () => {
    const upright = renderFigure(baseSpec(PRESETS.parado, acc("chapeu")));
    const head = layerBox(upright.layers.cabeca)!, hat = layerBox(upright.layers.chapeu)!;
    expect(hat.cy).toBeLessThan(head.cy);                              // acima do centro da cabeça
    expect(Math.abs(hat.cx - head.cx)).toBeLessThan(5);
    const bag = renderFigure(baseSpec(PRESETS.parado, acc("mochila")));
    const torso = layerBox(bag.layers.tronco)!, pack = layerBox(bag.layers.mochila)!;
    expect(pack.cx).toBeLessThan(torso.cx);                            // nas costas (o personagem olha para a direita)
    const lean = renderFigure(baseSpec({ ...PRESETS.parado, torso: 40 }, acc("mochila")));
    const leanTorso = layerBox(lean.layers.tronco)!, leanPack = layerBox(lean.layers.mochila)!;
    expect(Math.abs(leanPack.cx - leanTorso.cx)).toBeLessThan(Math.abs(pack.cx - torso.cx) + 6);   // continua colada ao tronco
    expect(leanPack.cx).toBeGreaterThan(pack.cx);                      // e foi junto com o tronco que se inclinou para a frente
    const left = renderFigure(baseSpec(PRESETS.parado, { ...acc("mochila"), facing: "left" }));
    expect(layerBox(left.layers.mochila)!.cx).toBeGreaterThan(layerBox(left.layers.tronco)!.cx);   // espelhado
  });
  it("a capa pende das costas", () => {
    const out = renderFigure(baseSpec(PRESETS.parado, acc("capa")));
    const cape = layerBox(out.layers.mochila)!, torso = layerBox(out.layers.tronco)!;
    expect(cape.cx).toBeLessThan(torso.cx + 1);
    expect(cape.y1).toBeGreaterThan(torso.cy);
  });
  it("estilos de cabelo diferem: careca não tem cabelo, longo cobre mais que curto", () => {
    const count = (hair: "curto" | "longo" | "careca") => {
      const out = renderFigure(baseSpec(PRESETS.parado, { hair, ramps: { ...RAMPS, hair: { outline: 11, dark: 12, base: 13, light: 14 } } }));
      return out.layers.cabeca.filter((v) => v >= 11 && v <= 14).length;
    };
    expect(count("careca")).toBe(0);
    expect(count("longo")).toBeGreaterThan(count("curto"));
    expect(count("curto")).toBeGreaterThan(0);
  });
  it("amplitude exagera o balanço dos braços e das pernas (princípio 10)", () => {
    const make = (amplitude: number) => {
      const p = createProject({ width: 40, height: 40 });
      runCommand(p, "add_frames", { count: 7 });
      runCommand(p, "draw_figure", { cycle: "caminhada", figure_height: 30, amplitude, preview: false });
      const wide = (f: number) => { const l = p.layers.find((x) => x.name === "perna-frente")!, c = p.frames[f].cels[l.id]; let a = 99, b = -1; for (let i = 0; i < c.length; i++) if (c[i]) { a = Math.min(a, i % 40); b = Math.max(b, i % 40); } return b - a; };
      return wide(0);
    };
    expect(make(1.6)).toBeGreaterThan(make(0.6));
  });
  it("rastro (smear): a lâmina com trail desenha pixels a mais na camada da arma, atrás da ponta", () => {
    const pose = (trail?: number) => ({ ...PRESETS.parado, shoulder_front: 85, elbow_front: 10, weapon: { hand: "front" as const, angle: 90, length: 16, trail } });
    const count = (t?: number) => renderFigure(spec(pose(t))).layers.arma.filter(Boolean).length;
    expect(count(70)).toBeGreaterThan(count(undefined) + 8);
  });
  it("os presets de golpe cobrem armar, impacto e seguir, com a espada nas direções certas", () => {
    const tip = (name: string) => { const j = renderFigure(spec(PRESETS[name])).joints; return { tip: j.weaponTip, hand: j.handFront }; };
    const armar = tip("golpe_armar"), impacto = tip("golpe_impacto"), seguir = tip("golpe_seguir");
    expect(armar.tip.y).toBeLessThan(armar.hand.y - 6);              // erguida
    expect(armar.tip.x).toBeLessThan(armar.hand.x);                  // e para trás
    expect(Math.abs(impacto.tip.y - impacto.hand.y)).toBeLessThan(3); // horizontal
    expect(impacto.tip.x).toBeGreaterThan(impacto.hand.x + 10);      // para a frente
    expect(seguir.tip.y).toBeGreaterThan(seguir.hand.y);             // para baixo
  });
  it("por PADRÃO a paleta do ciclo de caminhada com chapéu e mochila é enxuta (≤ 20 cores; o estilo pode pedir mais com tons=5) e sem cores parecidas", () => {
    const p = createProject({ width: 40, height: 40 });
    runCommand(p, "remove_colors", { keys: ["0", "1"] });
    runCommand(p, "add_frames", { count: 7 });
    const r = runCommand(p, "draw_figure", { cycle: "caminhada", figure_height: 30, preview: false, accessories: [{ kind: "chapeu", color: "#a07840" }, { kind: "mochila", color: "#7a5a2a" }] });
    expect(r.ok).toBe(true);
    expect(p.palette.length).toBeLessThanOrEqual(20);
    expect(analyze(p, p.frames.map((_, i) => i)).issues.map((i) => i.code)).not.toContain("cores_parecidas");
  });
  it("sem arma, o draw_figure não cria cores de metal nem ouro", () => {
    const p = createProject({ width: 40, height: 40 });
    runCommand(p, "remove_colors", { keys: ["0", "1"] });
    runCommand(p, "draw_figure", { items: [{ frame: 0, preset: "parado" }], preview: false });
    expect(p.palette.some((c) => /metal|ouro/.test(c.name))).toBe(false);
  });
});

describe("erros legíveis e comandos mais amigáveis", () => {
  it("o primeiro problema de validação já vem na primeira linha (muitos fluxos só mostram a primeira)", () => {
    const p = createProject();
    const r = runCommand(p, "draw_shapes", { shapes: [{ type: "pixels", points: [[1]], color: "0" }] });
    expect(r.ok).toBe(false);
    expect(r.text.split("\n")[0]).toMatch(/Entrada inválida para draw_shapes — shapes\[0\]/);
  });
  it("frames em formato errado diz os formatos aceitos", () => {
    const p = createProject();
    const r = runCommand(p, "set_frame_timing", { frames: { de: 0, ate: 2 }, duration_ms: 100 });
    expect(r.ok).toBe(false);
    expect(r.text).toMatch(/"frames" aceita: um número.*lista.*"all".*intervalo/s);
  });
  it("draw_shapes pixels aceita {x, y} além de [x, y]", () => {
    const p = createProject({ width: 4, height: 2 });
    runCommand(p, "set_palette", { colors: [{ key: "r", hex: "#ff0000", name: "r" }] });
    const r = runCommand(p, "draw_shapes", { shapes: [{ type: "pixels", points: [{ x: 1, y: 1 }, [2, 0]], color: "r" }], preview: false });
    expect(r.ok).toBe(true);
    expect(frameToRowsOf(p)).toEqual([".. r.".replace(" ", "").slice(0, 4).replace("..r.", "..r."), ".r.."]);
  });
  it("a antecipação e a emenda não são cobradas em ciclo de caminhada no lugar", () => {
    const p = createProject({ width: 40, height: 40 });
    runCommand(p, "add_frames", { count: 7 });
    runCommand(p, "draw_figure", { cycle: "caminhada", figure_height: 30, preview: false });
    const r = analyze(p, p.frames.map((_, i) => i));
    expect(r.issues.map((i) => i.code)).not.toContain("emenda_salta");
    expect(r.principles!.find((q) => q.n === 2)!.estado).toBe("na");
  });
});

import { frameToRows } from "../src/engine/index.ts";
const frameToRowsOf = (p: Project) => frameToRows(p, 0);

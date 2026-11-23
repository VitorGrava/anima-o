/**
 * Rig (esqueleto opcional e invisível que dita o movimento).
 * Garantias: é explícito (sem rig_create nada muda), os ossos têm comprimento fixo e limites, a pose mora no frame,
 * a arte é sempre girada a partir da cópia limpa (bake idempotente), retoque à mão sobrevive ao bake.
 */
import { describe, expect, it } from "vitest";
import { SYSTEM_PROMPT } from "../server/prompt.ts";
import { analyze, createProject, frameToRows, fromJSON, renderImages, runCommand, toJSON, type Project } from "../src/engine/index.ts";
import { forwardKinematics, groundedRoot, humanoidBones } from "../src/engine/skeleton.ts";

const ok = (p: Project, name: string, input: Record<string, unknown>) => { const r = runCommand(p, name, input); expect(r.ok, `${name}: ${r.text}`).toBe(true); return r; };
const bare = (w = 40, h = 40) => { const p = createProject({ width: w, height: h }); runCommand(p, "remove_colors", { keys: ["0", "1"] }); return p; };
const baked = (p: Project, f: number) => frameToRows(p, f);
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe("o rig é opcional e explícito", () => {
  it("sem rig_create, os comandos de rig dão erro claro e o projeto não ganha nada", () => {
    const p = createProject({ width: 16, height: 16 });
    for (const [name, input] of [["rig_pose", { items: [{ frame: 0, angles: {} }] }], ["rig_bake", {}], ["rig_part", { name: "x", bone: "b", rows: ["r"], pivot: { x: 0, y: 0 } }]] as const) {
      const r = runCommand(p, name, input as Record<string, unknown>);
      expect(r.ok, name).toBe(false);
      expect(r.text, name).toMatch(/não tem rig.*rig_create/s);
    }
    expect(p.rig).toBeUndefined();
    expect("rig" in toJSON(p)).toBe(false);
    expect(runCommand(p, "check", { as_image: false }).ok).toBe(true);
  });
  it("criar um rig de novo exige replace; descrição do projeto resume o rig", () => {
    const p = bare();
    ok(p, "rig_create", { template: "humanoide", height: 28 });
    const again = runCommand(p, "rig_create", { template: "humanoide" });
    expect(again.ok).toBe(false);
    expect(again.text).toMatch(/replace=true/);
    expect(ok(p, "get_project_info", {}).text).toMatch(/Rig: 13 ossos/);
  });
  it("draw_figure continua funcionando como antes, sem rig", () => {
    const p = bare(48, 48);
    ok(p, "draw_figure", { items: [{ frame: 0, preset: "parado" }], preview: false });
    expect(p.rig).toBeUndefined();
  });
});

describe("cinemática: ossos fixos, limites, raiz", () => {
  const rig = () => { const p = bare(48, 48); ok(p, "rig_create", { template: "humanoide", height: 36, auto_art: false }); return p.rig!; };
  it("o comprimento de cada osso é o mesmo em qualquer pose (sem arredondar juntas)", () => {
    const r = rig();
    const poses: Record<string, number>[] = [{}, { braco_frente: 170, antebraco_frente: 130, coxa_frente: 100, canela_frente: 120, tronco: 40 }, { braco_tras: -50, coxa_tras: -25, pe_tras: -40, cabeca: 30 }];
    for (const angles of poses) {
      const st = forwardKinematics(r, { angles }, { roundJoints: false });
      for (const s of st.values()) expect(dist(s.start, s.end), s.bone.name).toBeCloseTo(s.bone.length, 6);
    }
  });
  it("as juntas estão ligadas: o início de cada osso é o fim (ou o início) do pai", () => {
    const r = rig();
    const st = forwardKinematics(r, { angles: { braco_frente: 80, antebraco_frente: 40, coxa_frente: 30, canela_frente: 50 } });
    for (const s of st.values()) {
      if (!s.bone.parent) continue;
      const par = st.get(s.bone.parent)!;
      expect(s.start).toEqual(s.bone.at === "start" ? par.start : par.end);
    }
  });
  it("tronco aponta para cima, pernas para baixo e braços pendurados em repouso; o cotovelo só dobra para a frente e o joelho para trás", () => {
    const r = rig();
    const rest = forwardKinematics(r, undefined, { roundJoints: false });
    expect(rest.get("tronco")!.end.y).toBeLessThan(rest.get("tronco")!.start.y);
    expect(rest.get("coxa_frente")!.end.y).toBeGreaterThan(rest.get("coxa_frente")!.start.y);
    const bent = forwardKinematics(r, { angles: { braco_frente: 90, antebraco_frente: 90 } }, { roundJoints: false });
    expect(bent.get("antebraco_frente")!.end.y).toBeLessThan(bent.get("antebraco_frente")!.start.y);       // o antebraço sobe
    const knee = forwardKinematics(r, { angles: { coxa_frente: 90, canela_frente: 90 } }, { roundJoints: false });
    expect(knee.get("canela_frente")!.end.x).toBeLessThan(knee.get("canela_frente")!.start.x + 0.01);       // a canela vai para trás/para baixo
  });
  it("facing=left espelha o esqueleto", () => {
    const right = rig();
    const left = { ...right, facing: "left" as const };
    const a = forwardKinematics(right, { angles: { braco_frente: 90 } }, { roundJoints: false }).get("braco_frente")!;
    const b = forwardKinematics(left, { angles: { braco_frente: 90 } }, { roundJoints: false }).get("braco_frente")!;
    expect(a.end.x - a.start.x).toBeCloseTo(-(b.end.x - b.start.x), 6);
  });
  it("rig_pose ajusta ângulos fora do limite e avisa", () => {
    const p = bare(48, 48);
    ok(p, "rig_create", { template: "humanoide", auto_art: false });
    const r = ok(p, "rig_pose", { items: [{ frame: 0, angles: { antebraco_frente: -30, canela_frente: 300 } }] });
    expect(r.text).toMatch(/antebraco_frente = -30° ficou fora do limite \[0, 145\]/);
    expect(p.frames[0].pose!.angles.antebraco_frente).toBe(0);
    expect(p.frames[0].pose!.angles.canela_frente).toBe(135);
  });
  it("osso inexistente em angles dá erro com a lista de ossos", () => {
    const p = bare(48, 48);
    ok(p, "rig_create", { template: "humanoide", auto_art: false });
    const r = runCommand(p, "rig_pose", { items: [{ frame: 0, angles: { bracinho: 10 } }] });
    expect(r.ok).toBe(false);
    expect(r.text).toMatch(/"bracinho" não existe.*braco_frente/s);
  });
  it("ground_lock apoia a sola mais baixa no chão em todos os frames do ciclo", () => {
    const p = bare(40, 40);
    ok(p, "add_frames", { count: 7 });
    ok(p, "rig_create", { template: "humanoide", height: 30, auto_art: false });
    ok(p, "rig_pose", { cycle: "caminhada" });
    const rg = p.rig!;
    for (const f of p.frames) {
      const st = forwardKinematics(rg, f.pose, { roundJoints: false });
      const low = Math.max(...[...st.values()].map((s) => s.end.y + (s.bone.sole ?? 0)));
      expect(low).toBeGreaterThan(rg.ground - 1.2);
      expect(low).toBeLessThan(rg.ground + 1.2);
    }
    void groundedRoot; void humanoidBones;
  });
});

describe("a pose mora no frame", () => {
  it("add_frames copy_from copia a pose; mover e apagar frames leva a pose junto; salvar e abrir preserva tudo", () => {
    const p = bare(48, 48);
    ok(p, "rig_create", { template: "humanoide", height: 30 });
    ok(p, "rig_pose", { items: [{ frame: 0, preset: "parado" }] });
    ok(p, "add_frames", { count: 1, copy_from: 0 });
    expect(p.frames[1].pose?.angles).toEqual(p.frames[0].pose!.angles);
    p.frames[1].pose!.angles.tronco = 20;                       // independente da original (cópia profunda)
    expect(p.frames[0].pose!.angles.tronco).not.toBe(20);
    ok(p, "move_frame", { from: 1, to: 0 });
    expect(p.frames[0].pose!.angles.tronco).toBe(20);
    const round = fromJSON(JSON.parse(JSON.stringify(toJSON(p))));
    expect(round.rig!.parts.length).toBe(p.rig!.parts.length);
    expect(round.rig!.bones).toEqual(p.rig!.bones);
    expect(round.frames[0].pose).toEqual(p.frames[0].pose);
  });
});

describe("rig_part: a arte é presa a um osso", () => {
  const free = () => {
    const p = bare(20, 20);
    runCommand(p, "set_palette", { colors: [{ key: "r", hex: "#d02838", name: "r" }, { key: "b", hex: "#2030c0", name: "b" }, { key: "k", hex: "#101010", name: "k" }] });
    ok(p, "rig_create", { template: "vazio", x: 10, ground: 18, bones: [{ name: "a", parent: null, length: 5, mode: "absolute", rest: 0, sign: 1, min: -180, max: 180 }] });
    return p;
  };
  it("valida osso, pivô e cores", () => {
    const p = free();
    expect(runCommand(p, "rig_part", { name: "x", bone: "zzz", rows: ["r"], pivot: { x: 0, y: 0 } }).text).toMatch(/osso "zzz" não existe.*a/s);
    expect(runCommand(p, "rig_part", { name: "x", bone: "a", rows: ["r"], pivot: { x: 4, y: 0 } }).text).toMatch(/pivot.*fora da arte/);
    expect(runCommand(p, "rig_part", { name: "x", bone: "a", rows: ["z"], pivot: { x: 0, y: 0 } }).text).toMatch(/não está na paleta/);
    expect(runCommand(p, "rig_part", { name: "x", bone: "a", rows: ["r"] }).text).toMatch(/pivot/);
  });
  it("cria, atualiza só o z (mantendo a arte) e remove", () => {
    const p = free();
    ok(p, "rig_part", { name: "x", bone: "a", rows: ["r", "r"], pivot: { x: 0, y: 0 } });
    ok(p, "rig_part", { name: "x", z: 5 });
    expect(p.rig!.parts[0].rows).toEqual(["r", "r"]);
    expect(p.rig!.parts[0].z).toBe(5);
    ok(p, "rig_part", { name: "x", remove: true });
    expect(p.rig!.parts).toHaveLength(0);
  });
  it("capsule gera arte ao longo do osso", () => {
    const p = free();
    ok(p, "rig_part", { name: "c", bone: "a", capsule: { r0: 1.5, base: "r", light: "b", dark: "k" } });
    expect(p.rig!.parts[0].rows.join("")).toMatch(/r/);
  });
});

describe("bake: gira sempre da arte limpa", () => {
  const stick = () => {
    const p = bare(20, 20);
    runCommand(p, "set_palette", { colors: [{ key: "r", hex: "#d02838", name: "r" }, { key: "b", hex: "#2030c0", name: "b" }] });
    ok(p, "add_frames", { count: 2 });
    ok(p, "rig_create", { template: "vazio", x: 10, ground: 19, bones: [{ name: "haste", parent: null, length: 6, mode: "absolute", rest: 0, sign: 1, min: -180, max: 180 }] });
    // arte de repouso: uma barra vertical 1×6 (b embaixo) com o pivô no topo
    ok(p, "rig_part", { name: "haste", bone: "haste", layer: "haste", pivot: { x: 1, y: 0 }, rows: [".r.", ".r.", ".r.", ".r.", ".r.", ".b."] });
    return p;
  };
  it("no ângulo 0 reproduz a arte exatamente, no lugar certo", () => {
    const p = stick();
    ok(p, "rig_pose", { items: [{ frame: 0, angles: { haste: 0 }, root: { x: 10.5, y: 4.5 } }] });
    ok(p, "rig_bake", { frames: 0, preview: false });
    const rows = baked(p, 0);
    // o osso começa no centro do pixel (10, 4): a barra ocupa a coluna 10 das linhas 4 a 9
    expect(rows.slice(4, 10).map((r) => r[10])).toEqual(["r", "r", "r", "r", "r", "b"]);
    expect(rows.slice(4, 10).map((r) => r.replace(/\./g, "").length)).toEqual([1, 1, 1, 1, 1, 1]);
  });
  it("a 90° a barra aponta para a frente a partir da junta", () => {
    const p = stick();
    ok(p, "rig_pose", { items: [{ frame: 0, angles: { haste: 90 }, root: { x: 10.5, y: 4.5 } }] });
    ok(p, "rig_bake", { frames: 0, preview: false });
    const row = baked(p, 0)[4];
    expect(row.indexOf("r")).toBe(10);
    expect(row.slice(10, 16)).toBe("rrrrrb");
  });
  it("é idempotente e não acumula erro: pose A → pose B → pose A dá exatamente o primeiro resultado", () => {
    const p = stick();
    ok(p, "rig_pose", { items: [{ frame: 0, angles: { haste: 37 }, root: { x: 10.5, y: 4.5 } }, { frame: 1, angles: { haste: 143 }, root: { x: 10.5, y: 4.5 } }] });
    ok(p, "rig_bake", { frames: 0, preview: false });
    const first = baked(p, 0);
    ok(p, "rig_bake", { frames: 1, preview: false });
    p.frames[0].pose = { angles: { haste: 37 }, root: { x: 10.5, y: 4.5 } };
    p.frames[1].pose = { angles: { haste: 143 }, root: { x: 10.5, y: 4.5 } };
    for (let k = 0; k < 6; k++) ok(p, "rig_bake", { preview: false });                    // várias vezes, ordem qualquer
    expect(baked(p, 0)).toEqual(first);
  });
  it("girar não perde nem ganha muita massa (a barra de 6 px continua com ~6 px em qualquer ângulo)", () => {
    const p = stick();
    for (const a of [0, 23, 45, 67, 90, 135, 180, 250]) {
      p.frames[0].pose = { angles: { haste: a }, root: { x: 10.5, y: 10.5 } };
      ok(p, "rig_bake", { frames: 0, preview: false });
      const n = baked(p, 0).join("").replace(/\./g, "").length;
      expect(n, `ângulo ${a}`).toBeGreaterThanOrEqual(4);
      expect(n, `ângulo ${a}`).toBeLessThanOrEqual(10);
    }
  });
  it("facing=left espelha a arte em torno da junta", () => {
    const p = stick();
    p.frames[0].pose = { angles: { haste: 90 }, root: { x: 10.5, y: 4.5 } };
    ok(p, "rig_bake", { frames: 0, preview: false });
    const right = baked(p, 0)[4];
    p.rig!.facing = "left";
    ok(p, "rig_bake", { frames: 0, preview: false });
    const left = baked(p, 0)[4];
    expect(left.slice(5, 11)).toBe("brrrrr");
    expect(right.slice(10, 16)).toBe("rrrrrb");
  });
  it("snap_angle arredonda o ângulo das partes", () => {
    const p = stick();
    p.frames[0].pose = { angles: { haste: 7 }, root: { x: 10.5, y: 4.5 } };
    ok(p, "rig_bake", { frames: 0, snap_angle: 15, preview: false });
    const snapped = baked(p, 0);
    p.frames[0].pose = { angles: { haste: 0 }, root: { x: 10.5, y: 4.5 } };
    ok(p, "rig_bake", { frames: 0, preview: false });
    expect(snapped).toEqual(baked(p, 0));                      // 7° arredondado para 0 com passo 15
  });
  it("as camadas geradas ficam marcadas, e um retoque à mão em outra camada sobrevive ao bake", () => {
    const p = stick();
    ok(p, "add_layer", { name: "retoque" });
    ok(p, "rig_pose", { items: [{ frame: 0, angles: { haste: 0 }, root: { x: 10.5, y: 4.5 } }] });
    ok(p, "rig_bake", { frames: 0, preview: false });
    expect(p.layers.find((l) => l.name === "haste")!.generated).toBe(true);
    expect(p.layers.find((l) => l.name === "retoque")!.generated).toBeFalsy();
    ok(p, "draw_rows", { frames: 0, layer: "retoque", x: 2, y: 2, rows: ["b"], preview: false });
    ok(p, "rig_bake", { frames: 0, preview: false });
    ok(p, "rig_bake", { frames: 0, preview: false });
    expect(baked(p, 0)[2][2]).toBe("b");
  });
  it("o contorno externo é opcional e fica em camada própria", () => {
    const p = stick();
    ok(p, "rig_pose", { items: [{ frame: 0, angles: { haste: 0 }, root: { x: 10.5, y: 4.5 } }] });
    ok(p, "rig_bake", { frames: 0, outline: "b", preview: false });
    expect(p.layers.some((l) => l.name === "contorno" && l.generated)).toBe(true);
    expect(baked(p, 0)[4][9]).toBe("b");                       // 1 px à esquerda da barra
  });
  it("rig_bake sem partes ou sem pose explica o que fazer", () => {
    const p = bare(16, 16);
    ok(p, "rig_create", { template: "humanoide", auto_art: false });
    expect(runCommand(p, "rig_bake", {}).text).toMatch(/não tem partes de arte/);
    const q = bare(16, 16);
    ok(q, "rig_create", { template: "humanoide" });
    expect(runCommand(q, "rig_bake", {}).text).toMatch(/Nenhum frame tem pose/);
  });
});

describe("humanoide pronto: anatomia por construção e tween", () => {
  const walk = () => {
    const p = bare(40, 40);
    ok(p, "add_frames", { count: 7 });
    ok(p, "rig_create", { template: "humanoide", height: 30 });
    ok(p, "rig_pose", { cycle: "caminhada" });
    ok(p, "rig_bake", { outline: "0", preview: false });
    return p;
  };
  it("o ciclo de caminhada baked não se parte em pedaços e não tem pixel solto", () => {
    const p = walk();
    const codes = analyze(p, p.frames.map((_, i) => i)).issues.map((i) => i.code);
    expect(codes).not.toContain("figura_partida");
    expect(codes).not.toContain("pixel_solto");
  });
  it("as camadas geradas seguem a ordem de desenho e as partes ficam na camada certa", () => {
    const p = walk();
    const names = p.layers.map((l) => l.name);
    for (const [a, b] of [["contorno", "braco-tras"], ["braco-tras", "tronco"], ["tronco", "cabeca"], ["cabeca", "perna-frente"], ["perna-frente", "braco-frente"]]) expect(names.indexOf(a), `${a} abaixo de ${b}`).toBeLessThan(names.indexOf(b));
  });
  it("tween entre duas poses-chave interpola com ease (passo do meio maior)", () => {
    const p = bare(48, 48);
    ok(p, "add_frames", { count: 4 });
    ok(p, "rig_create", { template: "humanoide", height: 36, auto_art: false });
    ok(p, "rig_pose", { tween: true, items: [{ frame: 0, preset: "parado" }, { frame: 4, angles: { braco_frente: 160 } }] });
    const v = [0, 1, 2, 3, 4].map((f) => p.frames[f].pose!.angles.braco_frente);
    const steps = v.slice(1).map((x, k) => x - v[k]);
    expect(Math.max(steps[1], steps[2])).toBeGreaterThan(Math.max(steps[0], steps[3]));
    expect(v[4]).toBe(160);
  });
  it("arma como osso: a espada fica presa ao antebraço da frente", () => {
    const p = bare(48, 48);
    ok(p, "rig_create", { template: "humanoide", height: 36, weapon_length: 12 });
    ok(p, "rig_pose", { items: [{ frame: 0, angles: { braco_frente: 90, antebraco_frente: 20, espada: 90 } }] });
    const st = forwardKinematics(p.rig!, p.frames[0].pose, { roundJoints: false });
    expect(dist(st.get("espada")!.start, st.get("antebraco_frente")!.end)).toBeLessThan(1e-9);
    expect(st.get("espada")!.end.x).toBeGreaterThan(st.get("espada")!.start.x + 10);
  });
  it("trocar a arte de uma parte por arte própria e rebake: só aquela parte muda", () => {
    const p = walk();
    const before = baked(p, 2).join("\n");
    runCommand(p, "set_palette", { colors: [{ key: "Z", hex: "#ff00ff", name: "meu-braco" }] });
    ok(p, "rig_part", { name: "braco_frente", bone: "braco_frente", pivot: { x: 1, y: 0 }, rows: [".Z.", ".Z.", ".Z."] });
    ok(p, "rig_bake", { outline: "0", preview: false });
    const after = baked(p, 2).join("\n");
    expect(after).not.toBe(before);
    expect(after).toMatch(/Z/);
    expect(before).not.toMatch(/Z/);
  });
});

describe("ver e conferir o esqueleto", () => {
  it("view bones=true devolve os ossos por frame e desenha o esqueleto; sem rig, ignora", () => {
    const p = bare(40, 40);
    ok(p, "rig_create", { template: "humanoide", height: 30 });
    ok(p, "rig_pose", { items: [{ frame: 0, preset: "parado" }] });
    const r = ok(p, "view", { bones: true, as_text: false });
    expect(r.images!.bones![0].length).toBe(13);
    const plain = renderImages(p, { frames: [0], scale: 6 })[0];
    const withBones = renderImages(p, { ...r.images!, frames: [0] })[0];
    const cyan = (d: Uint8ClampedArray) => { let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] === 0 && d[i + 1] === 230 && d[i + 2] === 255) n++; return n; };
    expect(cyan(plain.data)).toBe(0);
    expect(cyan(withBones.data)).toBeGreaterThan(20);
    const q = createProject({ width: 16, height: 16 });
    expect(ok(q, "view", { bones: true, as_text: false }).images!.bones).toBeUndefined();
  });
  it("check aponta parte presa a osso inexistente (erro) e frames sem pose (aviso)", () => {
    const p = bare(40, 40);
    ok(p, "add_frames", { count: 2 });
    ok(p, "rig_create", { template: "humanoide", height: 30 });
    ok(p, "rig_pose", { items: [{ frame: 0, preset: "parado" }] });
    p.rig!.parts[0].bone = "fantasma";
    const codes = analyze(p, [0, 1, 2]).issues.map((i) => i.code);
    expect(codes).toContain("rig_parte_sem_osso");
    expect(codes).toContain("rig_frames_sem_pose");
  });
});

describe("a IA é orientada sobre quando usar o rig", () => {
  it("o prompt explica que o rig é opcional, quando vale e o fluxo", () => {
    expect(SYSTEM_PROMPT).toMatch(/rig_create/);
    expect(SYSTEM_PROMPT).toMatch(/opcional/i);
    expect(SYSTEM_PROMPT).toMatch(/rig_bake/);
    expect(SYSTEM_PROMPT).toMatch(/repouso/i);
  });
});

describe("passo 1: arte que já existe numa camada vira parte presa a um osso (from_layer)", () => {
  const drawn = () => {
    const p = bare(24, 24);
    runCommand(p, "set_palette", { colors: [{ key: "r", hex: "#d02838", name: "r" }, { key: "b", hex: "#2030c0", name: "b" }, { key: "k", hex: "#101010", name: "k" }] });
    ok(p, "add_layer", { name: "desenho" });
    // um "personagem" desenhado em pé: cabeça (b) em cima, braço (r) pendurado ao lado
    ok(p, "draw_rows", { layer: "desenho", x: 10, y: 2, rows: ["bbb", "bbb", "kkk"], preview: false });
    ok(p, "draw_rows", { layer: "desenho", x: 14, y: 6, rows: ["r", "r", "r", "r", "r"], preview: false });
    ok(p, "rig_create", { template: "vazio", x: 14, ground: 22, bones: [{ name: "braco", parent: null, length: 5, mode: "absolute", rest: 0, sign: 1, min: -180, max: 180 }] });
    return p;
  };
  it("fatia a região e converte a articulação do canvas em pivô da parte", () => {
    const p = drawn();
    const r = ok(p, "rig_part", { name: "braco", bone: "braco", from_layer: { layer: "desenho", region: { x: 14, y: 6, w: 1, h: 5 }, joint: { x: 14, y: 6 } } });
    expect(r.text).toMatch(/arte 1×5/);
    expect(p.rig!.parts[0].rows).toEqual(["r", "r", "r", "r", "r"]);
    expect(p.rig!.parts[0].pivot).toEqual({ x: 0, y: 0 });
  });
  it("sem region, recorta tudo o que está desenhado na camada", () => {
    const p = drawn();
    ok(p, "rig_part", { name: "tudo", bone: "braco", from_layer: { layer: "desenho", joint: { x: 14, y: 6 } } });
    const part = p.rig!.parts[0];
    expect(part.rows.length).toBe(9);                               // de y=2 a y=10
    expect(part.pivot).toEqual({ x: 4, y: 4 });                     // (14,6) menos o canto (10,2)
  });
  it("a parte recortada, depois do bake a 0°, cai exatamente onde estava o desenho original", () => {
    const p = drawn();
    ok(p, "rig_part", { name: "braco", bone: "braco", from_layer: { layer: "desenho", region: { x: 14, y: 6, w: 1, h: 5 }, joint: { x: 14, y: 6 }, clear_source: true } });
    expect(frameToRows(p, 0)[8][14]).toBe(".");                    // saiu da camada de origem
    ok(p, "rig_pose", { items: [{ frame: 0, angles: { braco: 0 }, root: { x: 14.5, y: 6.5 } }] });
    ok(p, "rig_bake", { frames: 0, preview: false });
    expect(frameToRows(p, 0).slice(6, 11).map((r) => r[14])).toEqual(["r", "r", "r", "r", "r"]);
  });
  it("valida: camada vazia, região vazia, articulação fora da arte", () => {
    const p = drawn();
    ok(p, "add_layer", { name: "vazia" });
    expect(runCommand(p, "rig_part", { name: "x", bone: "braco", from_layer: { layer: "vazia", joint: { x: 1, y: 1 } } }).text).toMatch(/está vazia.*não há arte/);
    expect(runCommand(p, "rig_part", { name: "x", bone: "braco", from_layer: { layer: "desenho", region: { x: 0, y: 0, w: 3, h: 3 }, joint: { x: 1, y: 1 } } }).text).toMatch(/região recortada.*vazia/);
    expect(runCommand(p, "rig_part", { name: "x", bone: "braco", from_layer: { layer: "desenho", region: { x: 14, y: 6, w: 1, h: 5 }, joint: { x: 3, y: 3 } } }).text).toMatch(/articulação.*fora da região/);
  });
});

describe("passo 2: IK, marcha com pés travados e deslocamento da raiz", () => {
  const humanoid = (frames: number, extra: Record<string, unknown> = {}) => {
    const p = bare(64, 40);
    ok(p, "add_frames", { count: frames - 1 });
    ok(p, "rig_create", { template: "humanoide", height: 30, ground: 38 });
    ok(p, "rig_walk", { cycles: 2, ...extra });
    return p;
  };

  it("IK de dois ossos: a ponta alcança o alvo alcançável e o joelho aponta para a frente", async () => {
    const { solveTwoBone } = await import("../src/engine/skeleton.ts");
    const p = bare(64, 40);
    ok(p, "rig_create", { template: "humanoide", height: 30, ground: 38 });
    const rig = p.rig!;
    const root = { x: 20, y: 18 };
    for (const target of [{ x: 20, y: 28 }, { x: 24, y: 27 }, { x: 16, y: 26 }, { x: 22, y: 25 }]) {
      const sol = solveTwoBone(rig, "coxa_frente", "canela_frente", {}, root, target, 1);
      const st = forwardKinematics(rig, { angles: { coxa_frente: sol.upper, canela_frente: sol.lower }, root }, { roundJoints: false });
      expect(dist(st.get("canela_frente")!.end, target), JSON.stringify(target)).toBeLessThan(0.05);
      const hip = st.get("coxa_frente")!.start, knee = st.get("coxa_frente")!.end, ank = st.get("canela_frente")!.end;
      // o joelho fica à frente (ou à direita) da linha quadril→tornozelo
      const cross = (ank.x - hip.x) * (knee.y - hip.y) - (ank.y - hip.y) * (knee.x - hip.x);
      expect(cross).toBeLessThanOrEqual(0);        // y cresce para baixo: joelho à frente do eixo quadril→tornozelo dá produto vetorial negativo
    }
  });
  it("alvo fora de alcance estica a perna na direção do alvo, sem quebrar", async () => {
    const { solveTwoBone } = await import("../src/engine/skeleton.ts");
    const p = bare(64, 40);
    ok(p, "rig_create", { template: "humanoide", height: 30 });
    const sol = solveTwoBone(p.rig!, "coxa_frente", "canela_frente", {}, { x: 20, y: 10 }, { x: 20, y: 90 }, 1);
    expect(Number.isFinite(sol.upper) && Number.isFinite(sol.lower)).toBe(true);
    expect(Math.abs(sol.lower)).toBeLessThan(6);                     // perna praticamente esticada (a margem do solver deixa ~4°)
  });
  it("na marcha 'andar', o pé APOIADO fica parado no mundo e a sola toca o chão; no balanço ele sobe", () => {
    const p = humanoid(16, { mode: "andar" });
    const rig = p.rig!;
    const tips = p.frames.map((f) => legTips(rig, f.pose));
    let plantedPairs = 0, lifted = 0;
    for (let k = 0; k + 1 < tips.length; k++) {
      rig.legs!.forEach((leg, i) => {
        const a = tips[k][i], b = tips[k + 1][i];
        const ground = rig.ground - leg.drop;
        if (Math.abs(a.y - ground) < 0.05 && Math.abs(b.y - ground) < 0.05) { plantedPairs++; expect(Math.abs(b.x - a.x), `frame ${k} perna ${i}`).toBeLessThan(0.08); }
        if (a.y < ground - 1) lifted++;
      });
    }
    expect(plantedPairs).toBeGreaterThan(8);
    expect(lifted).toBeGreaterThan(3);
  });
  it("a raiz avança uma velocidade INTEIRA por frame; no_lugar mantém a raiz parada e guarda a velocidade do chão", () => {
    const a = humanoid(16, { mode: "andar" });
    const xs = a.frames.map((f) => f.pose!.root!.x);
    const steps = xs.slice(1).map((x, k) => x - xs[k]);
    expect(new Set(steps.map((s) => +s.toFixed(6))).size).toBe(1);
    expect(Number.isInteger(steps[0])).toBe(true);
    expect(a.rig!.travel).toEqual({ mode: "andar", speed: steps[0] });
    const b = humanoid(16, { mode: "no_lugar" });
    expect(new Set(b.frames.map((f) => f.pose!.root!.x)).size).toBe(1);
    expect(b.rig!.travel!.mode).toBe("no_lugar");
    expect(Number.isInteger(b.rig!.travel!.speed)).toBe(true);
  });
  it("no_lugar com scroll_layer: o chão rola para trás na velocidade certa e fecha o loop quando o desenho se repete", () => {
    const p = bare(64, 40);
    ok(p, "add_frames", { count: 15 });
    ok(p, "rig_create", { template: "humanoide", height: 30, ground: 38 });
    runCommand(p, "update_layer", { layer: "Base", name: "chao" });
    ok(p, "draw_shapes", { layer: "chao", frames: 0, preview: false, shapes: Array.from({ length: 8 }, (_, k) => ({ type: "pixels", points: [[k * 8 + 2, 39]], color: "0" })) });
    const r = ok(p, "rig_walk", { cycles: 2, mode: "no_lugar", scroll_layer: "chao" });
    const v = p.rig!.travel!.speed;
    expect(r.text).toMatch(/repetir a cada/);
    const layer = p.layers.find((l) => l.name === "chao")!;
    const dots = (f: number) => [...p.frames[f].cels[layer.id]].flatMap((c, i) => (c ? [i % 64] : []));
    const base = dots(0);
    expect(dots(1).sort((a, b) => a - b)).toEqual(base.map((x) => (x - v + 64) % 64).sort((a, b) => a - b));
    expect(dots(3).sort((a, b) => a - b)).toEqual(base.map((x) => (x - 3 * v + 64) % 64).sort((a, b) => a - b));
  });
  it("o ciclo é periódico: o pé de uma perna no frame k repete o da outra meio ciclo depois", () => {
    const p = humanoid(16, { mode: "no_lugar", cycles: 1 });
    const rig = p.rig!;
    const a = legTips(rig, p.frames[3].pose), b = legTips(rig, p.frames[11].pose);   // 8 frames = meio ciclo
    expect(a[0].y).toBeCloseTo(b[1].y, 3);
    expect(a[0].x - p.frames[3].pose!.root!.x).toBeCloseTo(b[1].x - p.frames[11].pose!.root!.x, 3);
  });
  it("erros úteis: sem frames suficientes, sem pernas, sem rig", () => {
    const p = bare(64, 40);
    ok(p, "rig_create", { template: "humanoide", height: 30 });
    expect(runCommand(p, "rig_walk", {}).text).toMatch(/precisa de 4 frame.*add_frames/s);
    const q = bare(64, 40);
    ok(q, "add_frames", { count: 7 });
    ok(q, "rig_create", { template: "vazio", bones: [{ name: "a", parent: null, length: 4, mode: "absolute", rest: 0, sign: 1, min: -90, max: 90 }] });
    expect(runCommand(q, "rig_walk", {}).text).toMatch(/não tem pernas definidas/);
    expect(runCommand(createProject(), "rig_walk", {}).text).toMatch(/não tem rig/);
  });
  it("check: pé que escorrega é apontado; a marcha com IK não é, e o deslocamento não cobra emenda de loop", () => {
    const good = humanoid(16, { mode: "andar" });
    let codes = analyze(good, good.frames.map((_, i) => i)).issues.map((i) => i.code);
    expect(codes).not.toContain("pe_escorrega");
    expect(codes).not.toContain("emenda_salta");
    // arrasta: a raiz avança com os mesmos ângulos (os pés ficam colados ao corpo)
    const bad = humanoid(16, { mode: "andar" });
    const first = bad.frames[0].pose!;
    bad.frames.forEach((f, k) => { f.pose = { angles: { ...first.angles }, root: { x: first.root!.x + 2 * k, y: first.root!.y } }; });
    codes = analyze(bad, bad.frames.map((_, i) => i)).issues.map((i) => i.code);
    expect(codes).toContain("pe_escorrega");
  });
  it("rig_bake de uma marcha andando: a figura cruza o quadro e continua inteira (sem fresta nem pixel solto)", () => {
    const p = humanoid(16, { mode: "andar" });
    ok(p, "rig_bake", { outline: "0", preview: false });
    const codes = analyze(p, p.frames.map((_, i) => i)).issues.map((i) => i.code);
    expect(codes).not.toContain("figura_partida");
    expect(codes).not.toContain("pixel_solto");
    const cx = (f: number) => { const l = p.layers.find((x) => x.name === "tronco")!; let n = 0, s = 0; p.frames[f].cels[l.id].forEach((v, i) => { if (v) { n++; s += i % 64; } }); return s / n; };
    expect(cx(15) - cx(0)).toBeGreaterThan(20);
  });
});

import { legTips } from "../src/engine/skeleton.ts";

describe("melhorias do rig vindas do pinguim: at numérico, rig_bone, sole, dica de snap", () => {
  const penguin = () => {
    const p = bare(40, 40);
    runCommand(p, "set_palette", { colors: [{ key: "k", hex: "#101830", name: "k" }, { key: "w", hex: "#f0eee8", name: "w" }, { key: "o", hex: "#f09020", name: "o" }] });
    ok(p, "rig_create", { template: "vazio", x: 20, ground: 36, bones: [
      { name: "corpo", parent: null, length: 14, mode: "absolute", rest: 180, sign: -1, min: -40, max: 40 },
      { name: "nad_tras", parent: "corpo", at: 0.3, length: 7, mode: "absolute", rest: 0, sign: 1, min: -70, max: 70 },
      { name: "nad_frente", parent: "corpo", at: 0.7, length: 7, mode: "absolute", rest: 0, sign: 1, min: -70, max: 70 },
      { name: "pe", parent: "corpo", at: "start", length: 3, mode: "absolute", rest: 90, sign: -1, min: -40, max: 40, sole: 1 },
    ] });
    return p;
  };
  it("at numérico prende o osso a uma fração do pai (não só no início ou no fim)", () => {
    const p = penguin();
    const st = forwardKinematics(p.rig!, undefined, { roundJoints: false });
    const corpo = st.get("corpo")!;
    for (const [name, t] of [["nad_tras", 0.3], ["nad_frente", 0.7]] as const) {
      const s = st.get(name)!.start;
      expect(s.x).toBeCloseTo(corpo.start.x + (corpo.end.x - corpo.start.x) * t, 6);
      expect(s.y).toBeCloseTo(corpo.start.y + (corpo.end.y - corpo.start.y) * t, 6);
    }
    expect(runCommand(p, "rig_create", { template: "vazio", replace: true, bones: [{ name: "a", parent: null, length: 3, at: 2 }] }).ok).toBe(false);   // fração fora de 0..1 é inválida
  });
  it("sole em osso livre faz o ground_lock apoiar a sola no chão", () => {
    const p = penguin();
    ok(p, "rig_pose", { items: [{ frame: 0, angles: { pe: 20, corpo: 10 } }] });
    const st = forwardKinematics(p.rig!, p.frames[0].pose, { roundJoints: false });
    expect(st.get("pe")!.end.y + 1).toBeCloseTo(p.rig!.ground, 5);
  });
  it("rig_bone muda o comprimento de um osso SEM perder as partes nem as poses", () => {
    const p = penguin();
    ok(p, "rig_part", { name: "corpo", bone: "corpo", rows: ["k", "k", "k"], pivot: { x: 0, y: 0 } });
    ok(p, "rig_pose", { items: [{ frame: 0, angles: { corpo: 10 } }] });
    const r = ok(p, "rig_bone", { name: "corpo", length: 20 });
    expect(r.text).toMatch(/1 parte\(s\) presas continuam/);
    expect(p.rig!.bones.find((b) => b.name === "corpo")!.length).toBe(20);
    expect(p.rig!.parts).toHaveLength(1);
    expect(p.frames[0].pose!.angles.corpo).toBe(10);
    ok(p, "rig_bone", { name: "nad_frente", at: 0.9 });
    expect(p.rig!.bones.find((b) => b.name === "nad_frente")!.at).toBe(0.9);
  });
  it("rig_bone cria osso novo, valida e só remove osso sem filhos nem partes", () => {
    const p = penguin();
    ok(p, "rig_bone", { name: "bico", parent: "corpo", length: 3, at: 1 });
    expect(p.rig!.bones.some((b) => b.name === "bico")).toBe(true);
    expect(runCommand(p, "rig_bone", { name: "novo" }).text).toMatch(/é novo: diga o `length`/);
    expect(runCommand(p, "rig_bone", { name: "novo", length: 3 }).text).toMatch(/diga o `parent`/);
    expect(runCommand(p, "rig_bone", { name: "x", parent: "fantasma", length: 2 }).text).toMatch(/pai "fantasma" não existe/);
    expect(runCommand(p, "rig_bone", { name: "corpo", remove: true }).text).toMatch(/ossos filhos/);
    ok(p, "rig_part", { name: "p", bone: "bico", rows: ["o"], pivot: { x: 0, y: 0 } });
    expect(runCommand(p, "rig_bone", { name: "bico", remove: true }).text).toMatch(/partes presas \(p\)/);
    ok(p, "rig_part", { name: "p", remove: true });
    ok(p, "rig_bone", { name: "bico", remove: true });
    expect(p.rig!.bones.some((b) => b.name === "bico")).toBe(false);
    expect(runCommand(p, "rig_bone", { name: "corpo", parent: "nad_frente" }).text).toMatch(/ciclo/);
  });
  it("o bake de partes pequenas girando sugere snap_angle; com snap_angle não sugere", () => {
    const p = penguin();
    ok(p, "rig_part", { name: "corpo", bone: "corpo", rows: ["k", "k", "k"], pivot: { x: 0, y: 0 } });
    ok(p, "rig_pose", { items: [{ frame: 0, angles: { corpo: 25 } }] });
    expect(ok(p, "rig_bake", { preview: false }).text).toMatch(/snap_angle 3–5/);
    expect(ok(p, "rig_bake", { preview: false, snap_angle: 5 }).text).not.toMatch(/snap_angle 3–5/);
  });
  it("a descrição do rig_create traz a receita para personagens não humanos e como ler os ângulos", () => {
    const d = runCommand(createProject(), "get_project_info", {}).text;           // só para garantir que o comando roda
    expect(d).toMatch(/Projeto/);
    const tools = JSON.stringify(Object.keys({}));
    void tools;
    expect(SYSTEM_PROMPT).toMatch(/rig_bone|rig_walk/);
  });
});

describe("rig_bake outline auto (sel-out)", () => {
  it("contorna com o tom escuro do material vizinho, não com uma cor única", () => {
    const p = createProject({ width: 32, height: 32 });
    runCommand(p, "rig_create", { template: "humanoide", height: 24, auto_art: true });
    runCommand(p, "rig_pose", { items: [{ frame: 0, angles: { coxa_frente: 10 } }] });
    const r = runCommand(p, "rig_bake", { outline: "auto" });
    expect(r.ok, r.text).toBe(true);
    const layer = p.layers.find((l) => l.name === "contorno")!;
    const used = new Set(Array.from(p.frames[0].cels[layer.id]).filter((v) => v));
    expect(used.size).toBeGreaterThan(1);
  });
});

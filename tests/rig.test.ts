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

/**
 * Esqueleto (rig) opcional: ossos invisíveis que ditam o movimento, e partes de arte presas a eles.
 *
 * - O esqueleto só existe se o projeto pedir (`rig_create`); sem ele nada muda.
 * - A pose mora no frame (`frame.pose`): ângulos por osso + posição da raiz.
 * - A arte de cada parte é desenhada UMA vez, na pose de repouso, e guardada no rig. O `bake` gira sempre
 *   a partir dessa cópia limpa (nunca gira uma arte já girada) e escreve em camadas "geradas".
 * - Convenção de ângulo: graus a partir de "para baixo", + = para a frente (a direção para a qual ele olha).
 */
import { bodyProportions, type BodyStyle } from "./reference.ts";
import { PRESETS as POSE_PRESETS, swapSides, type Pose } from "./rig.ts";
import { TRANSPARENT_KEY, type Bone, type FramePose, type Project, type Rig, type RigPart, colorIndex } from "./project.ts";

export interface V { x: number; y: number }
const rad = (d: number) => (d * Math.PI) / 180;

export interface BoneState { bone: Bone; start: V; end: V; world: number }

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Cinemática direta: posição e ângulo de cada osso para uma pose. Juntas arredondadas para o centro do pixel. */
export function forwardKinematics(rig: Rig, pose: FramePose | undefined, opts: { roundJoints?: boolean; zero?: boolean } = {}): Map<string, BoneState> {
  const f = rig.facing === "right" ? 1 : -1;
  const out = new Map<string, BoneState>();
  const root = pose?.root ?? rig.root;
  const snap = (v: V): V => (opts.roundJoints === false ? v : { x: Math.floor(v.x) + 0.5, y: Math.floor(v.y) + 0.5 });
  const visit = (b: Bone) => {
    if (out.has(b.name)) return;
    const parent = b.parent ? rig.bones.find((x) => x.name === b.parent) : undefined;
    if (parent) visit(parent);
    const ps = parent ? out.get(parent.name)! : undefined;
    const startRaw: V = ps
      ? typeof b.at === "number"
        ? { x: ps.start.x + (ps.end.x - ps.start.x) * b.at, y: ps.start.y + (ps.end.y - ps.start.y) * b.at }
        : b.at === "start" ? ps.start : ps.end
      : root;
    const start = parent ? startRaw : snap(startRaw);
    const value = opts.zero ? 0 : clamp(pose?.angles[b.name] ?? 0, b.min, b.max);
    const world = (b.mode === "absolute" || !ps ? 0 : ps.world) + b.rest + b.sign * value;
    const end = snap({ x: start.x + f * Math.sin(rad(world)) * b.length, y: start.y + Math.cos(rad(world)) * b.length });
    out.set(b.name, { bone: b, start, end, world });
  };
  for (const b of rig.bones) visit(b);
  return out;
}

/** Valores de ângulo dentro dos limites; devolve avisos do que foi ajustado. */
export function clampAngles(rig: Rig, angles: Record<string, number>): { angles: Record<string, number>; warnings: string[] } {
  const out: Record<string, number> = {};
  const warnings: string[] = [];
  for (const [name, v] of Object.entries(angles)) {
    const b = rig.bones.find((x) => x.name === name);
    if (!b) throw new Error(`O osso "${name}" não existe. Ossos: ${rig.bones.map((x) => x.name).join(", ")}.`);
    out[name] = clamp(v, b.min, b.max);
    if (out[name] !== v) warnings.push(`${name} = ${v}° ficou fora do limite [${b.min}, ${b.max}]; ajustado para ${out[name]}°.`);
  }
  return { angles: out, warnings };
}

// ---------------- modelo humanoide ----------------

export const HUMANOID_BONES = ["tronco", "pescoco", "cabeca", "braco_frente", "antebraco_frente", "braco_tras", "antebraco_tras", "coxa_frente", "canela_frente", "pe_frente", "coxa_tras", "canela_tras", "pe_tras"];

export function humanoidBones(height: number, style: BodyStyle, weaponLength?: number): Bone[] {
  const pr = bodyProportions(height, style);
  const arm = (side: "frente" | "tras"): Bone[] => [
    { name: `braco_${side}`, parent: "tronco", at: "end", length: pr.upperArm, mode: "absolute", rest: 0, sign: 1, min: -60, max: 180 },
    { name: `antebraco_${side}`, parent: `braco_${side}`, at: "end", length: pr.foreArm, mode: "relative", rest: 0, sign: 1, min: 0, max: 145 },
  ];
  const leg = (side: "frente" | "tras"): Bone[] => [
    { name: `coxa_${side}`, parent: "tronco", at: "start", length: pr.thigh, mode: "absolute", rest: 0, sign: 1, min: -30, max: 120 },
    { name: `canela_${side}`, parent: `coxa_${side}`, at: "end", length: pr.shin, mode: "relative", rest: 0, sign: -1, min: 0, max: 135 },
    { name: `pe_${side}`, parent: `canela_${side}`, at: "end", length: pr.footL * 0.75, mode: "absolute", rest: 90, sign: -1, min: -50, max: 30, sole: pr.footH * 0.5 },
  ];
  const bones: Bone[] = [
    { name: "tronco", parent: null, length: pr.torso, mode: "absolute", rest: 180, sign: -1, min: -45, max: 60 },
    { name: "pescoco", parent: "tronco", at: "end", length: pr.neck, mode: "relative", rest: 0, sign: -1, min: -20, max: 25 },
    { name: "cabeca", parent: "pescoco", at: "end", length: pr.head * 0.92, mode: "relative", rest: 0, sign: -1, min: -30, max: 35 },
    ...arm("tras"), ...leg("tras"), ...leg("frente"), ...arm("frente"),
  ];
  if (weaponLength) bones.push({ name: "espada", parent: "antebraco_frente", at: "end", length: weaponLength, mode: "absolute", rest: 180, sign: -1, min: -180, max: 180 });
  return bones;
}

/** A pose de draw_figure (ângulos por articulação) traduzida para os ossos do modelo humanoide. */
export function humanoidAngles(pose: Pose): Record<string, number> {
  const a: Record<string, number> = {
    tronco: pose.torso, pescoco: pose.head * 0.4, cabeca: pose.head * 0.6,
    braco_frente: pose.shoulder_front, antebraco_frente: pose.elbow_front, braco_tras: pose.shoulder_back, antebraco_tras: pose.elbow_back,
    coxa_frente: pose.hip_front, canela_frente: pose.knee_front, pe_frente: pose.ankle_front,
    coxa_tras: pose.hip_back, canela_tras: pose.knee_back, pe_tras: pose.ankle_back,
  };
  if (pose.weapon) a.espada = pose.weapon.angle;
  return a;
}

export { POSE_PRESETS, swapSides };

// ---------------- arte das partes ----------------

export interface PartKeys { outline?: string; dark: string; base: string; light: string }

/** Arte de uma cápsula ao longo de um osso (desenhada com o osso em repouso), com luz de cima-esquerda. `back` estende a cápsula para trás do início do osso (calcanhar). */
export function capsuleArt(rig: Rig, bone: Bone, r0: number, r1: number, keys: PartKeys, back = 0): { rows: string[]; pivot: { x: number; y: number } } {
  const states = forwardKinematics(rig, undefined, { zero: true, roundJoints: false });
  const w = states.get(bone.name)!.world;
  const dx = Math.sin(rad(w)), dy = Math.cos(rad(w));      // facing right no repouso
  const reach = bone.length + back + Math.max(r0, r1) + 3;
  const size = Math.ceil(reach) * 2 + 3;
  const px = Math.floor(size / 2), py = Math.floor(size / 2);
  const cells: string[][] = Array.from({ length: size }, () => Array(size).fill(TRANSPARENT_KEY));
  const A = { x: -dx * back, y: -dy * back }, B = { x: dx * bone.length, y: dy * bone.length };
  const abx = B.x - A.x, aby = B.y - A.y, len2 = Math.max(1e-6, abx * abx + aby * aby);
  const L = { x: -0.55, y: -0.65 };
  let nx = -dy, ny = dx;
  if (nx * L.x + ny * L.y < 0) { nx = -nx; ny = -ny; }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const vx = x + 0.5 - (px + 0.5), vy = y + 0.5 - (py + 0.5);
      const t = clamp(((vx - A.x) * abx + (vy - A.y) * aby) / len2, 0, 1);
      const cx = A.x + abx * t, cy = A.y + aby * t;
      const r = r0 + (r1 - r0) * t;
      if (Math.hypot(vx - cx, vy - cy) > r) continue;
      const sd = ((vx - cx) * nx + (vy - cy) * ny) / Math.max(r, 1e-6);
      cells[y][x] = sd > 0.3 ? keys.light : sd < -0.35 ? keys.dark : keys.base;
    }
  }
  return { rows: cells.map((r) => r.join("")), pivot: { x: px, y: py } };
}

/** Arte de uma elipse (cabeça, mão) ancorada no início do osso, deslocada ao longo do osso. */
export function ellipseArt(rig: Rig, bone: Bone, along: number, rx: number, ry: number, keys: PartKeys, decorate?: (cells: string[][], c: V, size: number) => void): { rows: string[]; pivot: { x: number; y: number } } {
  const states = forwardKinematics(rig, undefined, { zero: true, roundJoints: false });
  const w = states.get(bone.name)!.world;
  const dx = Math.sin(rad(w)), dy = Math.cos(rad(w));
  const reach = Math.abs(along) + Math.max(rx, ry);
  const size = Math.ceil(reach * 2) + 6;
  const px = Math.floor(size / 2), py = Math.floor(size / 2);
  const c = { x: px + 0.5 + dx * along, y: py + 0.5 + dy * along };
  const cells: string[][] = Array.from({ length: size }, () => Array(size).fill(TRANSPARENT_KEY));
  const L = { x: -0.55, y: -0.65 };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x + 0.5 - c.x) / rx, ny = (y + 0.5 - c.y) / ry;
      if (nx * nx + ny * ny > 1) continue;
      const sd = (nx * L.x + ny * L.y) / Math.max(Math.hypot(nx, ny), 0.5) * 0.9;
      cells[y][x] = sd > 0.3 ? keys.light : sd < -0.35 ? keys.dark : keys.base;
    }
  }
  decorate?.(cells, c, size);
  return { rows: cells.map((r) => r.join("")), pivot: { x: px, y: py } };
}

// ---------------- bake ----------------

export interface BakeOptions {
  snapAngle?: number;
  roundJoints?: boolean;
}

/** Renderiza as partes de um frame em buffers de índices de paleta, um por camada. Gira sempre da arte limpa (4×4 subpixels, limiar de cobertura). */
export function renderRigFrame(p: Project, pose: FramePose | undefined, opts: BakeOptions = {}): Map<string, Uint8Array> {
  const rig = p.rig!;
  const W = p.width, H = p.height;
  const f = rig.facing === "right" ? 1 : -1;
  const now = forwardKinematics(rig, pose, { roundJoints: opts.roundJoints });
  const rest = forwardKinematics(rig, undefined, { zero: true, roundJoints: false });
  const layers = new Map<string, Uint8Array>();
  const keyIdx = new Map<string, number>();
  const idx = (k: string) => { let v = keyIdx.get(k); if (v === undefined) { v = colorIndex(p, k); keyIdx.set(k, v); } return v; };
  const N = 4;
  for (const part of [...rig.parts].sort((a, b) => a.z - b.z)) {
    const st = now.get(part.bone), rs = rest.get(part.bone);
    if (!st || !rs) continue;
    const buf = layers.get(part.layer) ?? new Uint8Array(W * H);
    layers.set(part.layer, buf);
    let delta = st.world - rs.world;
    if (opts.snapAngle && opts.snapAngle > 0) delta = Math.round(delta / opts.snapAngle) * opts.snapAngle;
    const c = Math.cos(rad(delta)), s = Math.sin(rad(delta));
    const ah = part.rows.length, aw = Math.max(...part.rows.map((r) => [...r].length));
    const pivot = { x: part.pivot.x + 0.5, y: part.pivot.y + 0.5 };
    // caixa de saída: os 4 cantos da arte transformados
    const J = st.start;
    const corners = [[0, 0], [aw, 0], [0, ah], [aw, ah]].map(([ax, ay]) => {
      const vx = ax - pivot.x, vy = ay - pivot.y;
      return { x: J.x + f * (vx * c + vy * s), y: J.y + (-vx * s + vy * c) };
    });
    const x0 = Math.max(0, Math.floor(Math.min(...corners.map((q) => q.x)))), x1 = Math.min(W - 1, Math.ceil(Math.max(...corners.map((q) => q.x))));
    const y0 = Math.max(0, Math.floor(Math.min(...corners.map((q) => q.y)))), y1 = Math.min(H - 1, Math.ceil(Math.max(...corners.map((q) => q.y))));
    const rows = part.rows.map((r) => [...r]);
    const votes = new Map<string, number>();
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        votes.clear();
        let opaque = 0;
        for (let sy = 0; sy < N; sy++) {
          for (let sx = 0; sx < N; sx++) {
            // posição do subpixel em relação à junta, no espaço de saída; desfaz o espelho e a rotação
            const ox = x + (sx + 0.5) / N - J.x, oy = y + (sy + 0.5) / N - J.y;
            const fx = f * ox, fy = oy;
            const ax = fx * c - fy * s + pivot.x, ay = fx * s + fy * c + pivot.y;
            const col = Math.floor(ax), row = Math.floor(ay);
            if (row < 0 || row >= ah || col < 0) continue;
            const key = rows[row][col];
            if (!key || key === TRANSPARENT_KEY || key === " ") continue;
            opaque++;
            votes.set(key, (votes.get(key) ?? 0) + 1);
          }
        }
        if (opaque < N * N * 0.375) continue;
        let best = "", bestN = 0;
        for (const [k, n] of votes) if (n > bestN || (n === bestN && k < best)) [best, bestN] = [k, n];
        buf[y * W + x] = idx(best);
      }
    }
  }
  return layers;
}

/** Segmentos dos ossos de um frame (para desenhar o esqueleto por cima da imagem). */
export function boneSegments(p: Project, frame: number): { name: string; x0: number; y0: number; x1: number; y1: number }[] {
  if (!p.rig) return [];
  const st = forwardKinematics(p.rig, p.frames[frame]?.pose);
  return [...st.values()].map((b) => ({ name: b.bone.name, x0: b.start.x, y0: b.start.y, x1: b.end.x, y1: b.end.y }));
}

/** Põe a sola mais baixa no chão: devolve a raiz com o y ajustado. */
export function groundedRoot(rig: Rig, angles: Record<string, number>, x: number): V {
  const probe = forwardKinematics({ ...rig, root: { x, y: 0 } }, { angles, root: { x, y: 0 } }, { roundJoints: false });
  let lowest = -1e9;
  // só os ossos com SOLA (pés) encostam no chão; sem nenhum, vale o ponto mais baixo de qualquer osso
  const soled = [...probe.values()].filter((b) => b.bone.sole !== undefined);
  for (const b of soled.length ? soled : [...probe.values()]) lowest = Math.max(lowest, b.end.y + (b.bone.sole ?? 0), soled.length ? -1e9 : b.start.y);
  return { x, y: rig.ground - lowest };
}

export function partDefaults(part: Partial<RigPart> & { name: string; bone: string }): RigPart {
  return { layer: part.name, z: 0, pivot: { x: 0, y: 0 }, rows: [], ...part } as RigPart;
}

// ---------------- IK de dois ossos e marcha ----------------

/** Valores (ângulo do osso) que fazem um osso ter o ângulo de mundo `world`, dado o ângulo de mundo do pai. */
export function valueForWorld(b: Bone, world: number, parentWorld: number): number {
  return (world - (b.mode === "absolute" ? 0 : parentWorld) - b.rest) / b.sign;
}

/**
 * IK de dois ossos: acha os valores de `upper` e `lower` para a ponta do `lower` alcançar `target` (mundo).
 * `bend` +1: a junta do meio fica à frente da linha (joelho); −1: atrás (cotovelo da pata da frente).
 */
export function solveTwoBone(rig: Rig, upperName: string, lowerName: string, angles: Record<string, number>, root: V, target: V, bend: 1 | -1): { upper: number; lower: number; reach: number } {
  const upper = rig.bones.find((b) => b.name === upperName)!, lower = rig.bones.find((b) => b.name === lowerName)!;
  const st = forwardKinematics(rig, { angles: { ...angles, [upperName]: 0, [lowerName]: 0 }, root }, { roundJoints: false });
  const S = st.get(upperName)!.start;
  const parentWorld = upper.parent ? st.get(upper.parent)!.world : 0;
  const f = rig.facing === "right" ? 1 : -1;
  const a = upper.length, b = lower.length;
  const tx = f * (target.x - S.x), ty = target.y - S.y;
  const d = clamp(Math.hypot(tx, ty), Math.abs(a - b) + 0.01, a + b - 0.01);
  const phi = Math.atan2(tx, ty);
  const alpha = Math.acos(clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1));
  const beta = Math.acos(clamp((b * b + d * d - a * a) / (2 * b * d), -1, 1));
  const wu = (phi + bend * alpha) * (180 / Math.PI), wl = (phi - bend * beta) * (180 / Math.PI);
  return { upper: valueForWorld(upper, wu, parentWorld), lower: valueForWorld(lower, wl, wu), reach: a + b };
}

export interface WalkOptions {
  frames: number;
  cycles: number;
  stride: number;
  lift: number;
  bob: number;
  duty: number;
  mode: "andar" | "no_lugar";
  armSwing: number;
  lean: number;
  x0: number;
  speed: number;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Poses de uma marcha com pés travados no chão (IK): cada perna tem fase; apoiada, a sola fica parada no mundo. */
export function walkPoses(rig: Rig, o: WalkOptions): { angles: Record<string, number>; root: V }[] {
  const legs = rig.legs!;
  const out: { angles: Record<string, number>; root: V }[] = [];
  const reach = legs.reduce((m, l) => Math.max(m, rig.bones.find((b) => b.name === l.upper)!.length + rig.bones.find((b) => b.name === l.lower)!.length), 0);
  const dropMax = Math.max(...legs.map((l) => l.drop));
  const has = (n: string) => rig.bones.some((b) => b.name === n);
  const hc = Math.sqrt(Math.max(1, (0.985 * reach) ** 2 - (o.stride / 2) ** 2));        // altura do quadril no contato
  for (let k = 0; k < o.frames; k++) {
    const t = (k / o.frames) * o.cycles;
    const angles: Record<string, number> = {};
    const ph = (x: number) => ((x % 1) + 1) % 1;
    const bobV = o.bob * (0.5 - 0.5 * Math.cos(4 * Math.PI * ph(t)));                  // sobe na passagem, desce no contato
    const root: V = { x: o.x0 + (o.mode === "andar" ? o.speed * k : 0), y: rig.ground - dropMax - (hc + bobV) };
    if (has("tronco")) angles.tronco = o.lean;
    for (const leg of legs) {
      const p0 = ph(t + leg.phase);
      let relX: number, lift = 0, foot: number;
      if (p0 < o.duty) { const u = p0 / o.duty; relX = o.stride / 2 - o.stride * u; foot = 12 - 32 * u; }
      else { const u = (p0 - o.duty) / (1 - o.duty); relX = -o.stride / 2 + o.stride * smooth(u); lift = o.lift * Math.sin(Math.PI * u); foot = -20 + 25 * u; }
      const target = { x: root.x + relX * (rig.facing === "right" ? 1 : -1), y: rig.ground - leg.drop - lift };
      const sol = solveTwoBone(rig, leg.upper, leg.lower, angles, root, target, leg.bend);
      angles[leg.upper] = sol.upper; angles[leg.lower] = sol.lower;
      if (leg.foot) angles[leg.foot] = foot;
      for (const fb of leg.follow ?? []) angles[fb] = -(lift / Math.max(o.lift, 1e-6)) * 20;
    }
    // braços opostos às pernas (humanoide)
    if (has("braco_frente") && has("braco_tras") && legs.length >= 2) {
      const pf = ph(t + legs[0].phase);
      angles.braco_frente = -o.armSwing * Math.cos(2 * Math.PI * pf);
      angles.braco_tras = o.armSwing * Math.cos(2 * Math.PI * pf);
      angles.antebraco_frente = 14 + 10 * (0.5 - 0.5 * Math.cos(2 * Math.PI * pf));
      angles.antebraco_tras = 14 + 10 * (0.5 + 0.5 * Math.cos(2 * Math.PI * pf));
    }
    if (has("cauda1")) { angles.cauda1 = 14 * Math.sin(2 * Math.PI * t); if (has("cauda2")) angles.cauda2 = 22 * Math.sin(2 * Math.PI * t - 0.9); }
    if (has("cabeca") && !has("braco_frente")) angles.cabeca = 5 * Math.sin(4 * Math.PI * t);
    out.push({ angles, root });
  }
  return out;
}

/** Posição (mundo) da ponta do IK de cada perna num frame, para conferir o pé que escorrega. */
export function legTips(rig: Rig, pose: FramePose | undefined): { leg: number; x: number; y: number }[] {
  const st = forwardKinematics(rig, pose, { roundJoints: false });
  return (rig.legs ?? []).map((l, i) => { const e = st.get(l.lower)!.end; return { leg: i, x: e.x, y: e.y }; });
}

/**
 * Esqueleto humanoide: a anatomia por construção.
 *
 * A IA escolhe ÂNGULOS de articulação; a engine calcula as posições com ossos de comprimento constante
 * (vindos das proporções do estilo), respeita os limites anatômicos (o cotovelo só dobra para a frente, o
 * joelho só para trás), prende a mão à arma e desenha cada parte com luz de cima-esquerda. Assim um
 * braço nunca fica desconectado, o comprimento não muda de um frame para outro e o pé encosta no chão.
 *
 * Convenção (vista lateral, olhando para a direita): 0° = membro pendurado para baixo; ângulos positivos
 * levam o membro PARA A FRENTE (a direção para a qual o personagem olha).
 */
import { bodyProportions, type BodyStyle } from "./reference.ts";

export interface Pose {
  /** Inclinação do tronco para a frente (graus). */
  torso: number;
  /** Inclinação da cabeça em relação ao tronco (+ = olha para baixo/frente). */
  head: number;
  /** Ombro: 0 = braço pendurado; 90 = horizontal à frente; 180 = para cima. */
  shoulder_front: number;
  /** Cotovelo: flexão 0–145 (o antebraço sobe em direção à frente do braço). */
  elbow_front: number;
  shoulder_back: number;
  elbow_back: number;
  /** Quadril: 0 = coxa para baixo; 90 = horizontal à frente; negativo = para trás. */
  hip_front: number;
  /** Joelho: flexão 0–135 (a canela vai para trás da coxa). */
  knee_front: number;
  /** Tornozelo: + dedos para cima, − dedos para baixo (ficar na ponta do pé). */
  ankle_front: number;
  hip_back: number;
  knee_back: number;
  ankle_back: number;
  /** Arma presa a uma mão. */
  weapon?: { hand: "front" | "back"; angle: number; length: number };
}

export const DEFAULT_POSE: Pose = {
  torso: 2, head: 0,
  shoulder_front: 6, elbow_front: 8, shoulder_back: -4, elbow_back: 6,
  hip_front: 3, knee_front: 3, ankle_front: 0, hip_back: -3, knee_back: 3, ankle_back: 0,
};

const P = (o: Partial<Pose>): Pose => ({ ...DEFAULT_POSE, ...o });

/** Poses prontas (vista lateral). As de caminhada formam o ciclo de 8 frames com `swap` na segunda metade. */
export const PRESETS: Record<string, Pose> = {
  parado: P({}),
  caminhada_contato: P({ torso: 4, shoulder_front: -24, elbow_front: 14, shoulder_back: 26, elbow_back: 20, hip_front: 28, knee_front: 3, ankle_front: 18, hip_back: -22, knee_back: 18, ankle_back: -24 }),
  caminhada_abaixo: P({ torso: 5, shoulder_front: -14, elbow_front: 12, shoulder_back: 16, elbow_back: 18, hip_front: 20, knee_front: 22, ankle_front: 4, hip_back: -12, knee_back: 36, ankle_back: -28 }),
  caminhada_passagem: P({ torso: 3, shoulder_front: -2, elbow_front: 10, shoulder_back: 4, elbow_back: 12, hip_front: 0, knee_front: 4, ankle_front: 0, hip_back: 22, knee_back: 62, ankle_back: -10 }),
  caminhada_acima: P({ torso: 4, shoulder_front: 10, elbow_front: 10, shoulder_back: -10, elbow_back: 14, hip_front: -14, knee_front: 2, ankle_front: -30, hip_back: 30, knee_back: 28, ankle_back: 12 }),
};

/** Troca os lados (a perna/braço da frente vira o de trás): segunda metade de um ciclo de caminhada. */
export function swapSides(p: Pose): Pose {
  const w = p.weapon && { ...p.weapon, hand: p.weapon.hand === "front" ? ("back" as const) : ("front" as const) };
  return {
    ...p,
    shoulder_front: p.shoulder_back, elbow_front: p.elbow_back, shoulder_back: p.shoulder_front, elbow_back: p.elbow_front,
    hip_front: p.hip_back, knee_front: p.knee_back, ankle_front: p.ankle_back, hip_back: p.hip_front, knee_back: p.knee_front, ankle_back: p.ankle_front,
    weapon: w,
  };
}

export const WALK_CYCLE = ["caminhada_contato", "caminhada_abaixo", "caminhada_passagem", "caminhada_acima"];

/** Limites anatômicos (graus). Fora deles a articulação é presa ao limite e vira um aviso. */
const LIMITS: Record<string, [number, number, string]> = {
  elbow_front: [0, 145, "o cotovelo só dobra para a frente (0–145°)"], elbow_back: [0, 145, "o cotovelo só dobra para a frente (0–145°)"],
  knee_front: [0, 135, "o joelho só dobra para trás (0–135°)"], knee_back: [0, 135, "o joelho só dobra para trás (0–135°)"],
  shoulder_front: [-60, 180, "o ombro vai de −60° (para trás) a 180° (para cima)"], shoulder_back: [-60, 180, "o ombro vai de −60° (para trás) a 180° (para cima)"],
  hip_front: [-30, 120, "o quadril vai de −30° (para trás) a 120° (para a frente)"], hip_back: [-30, 120, "o quadril vai de −30° (para trás) a 120° (para a frente)"],
  ankle_front: [-50, 30, "o tornozelo vai de −50° (ponta do pé) a 30° (dedos para cima)"], ankle_back: [-50, 30, "o tornozelo vai de −50° (ponta do pé) a 30° (dedos para cima)"],
  torso: [-45, 60, "o tronco inclina de −45° a 60°"], head: [-40, 50, "a cabeça inclina de −40° a 50° em relação ao tronco"],
};

export function clampPose(p: Pose): { pose: Pose; warnings: string[] } {
  const out: Pose = { ...p };
  const warnings: string[] = [];
  for (const [k, [lo, hi, why]] of Object.entries(LIMITS)) {
    const v = (out as unknown as Record<string, number>)[k];
    if (v < lo || v > hi) {
      (out as unknown as Record<string, number>)[k] = Math.max(lo, Math.min(hi, v));
      warnings.push(`${k} = ${v}° ficou fora do possível: ${why}; ajustado para ${(out as unknown as Record<string, number>)[k]}°.`);
    }
  }
  return { pose: out, warnings };
}

const ease = (t: number) => t * t * (3 - 2 * t);

/** Interpola dois poses (ease in/out): os ângulos mudam suavemente, e os arcos saem de graça. */
export function lerpPose(a: Pose, b: Pose, t: number, easing = true): Pose {
  const k = easing ? ease(t) : t;
  const out = { ...a } as unknown as Record<string, number>;
  for (const key of Object.keys(LIMITS)) out[key] = (a as unknown as Record<string, number>)[key] * (1 - k) + (b as unknown as Record<string, number>)[key] * k;
  const res = out as unknown as Pose;
  if (a.weapon && b.weapon) res.weapon = { hand: t < 0.5 ? a.weapon.hand : b.weapon.hand, angle: a.weapon.angle * (1 - k) + b.weapon.angle * k, length: a.weapon.length * (1 - k) + b.weapon.length * k };
  else res.weapon = t < 0.5 ? a.weapon : b.weapon;
  return res;
}

// ---------------- geometria ----------------

interface V { x: number; y: number }
const rad = (d: number) => (d * Math.PI) / 180;
const add = (a: V, b: V): V => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: V, k: number): V => ({ x: a.x * k, y: a.y * k });
/** Direção de um membro: 0° = para baixo, + = para a frente (+x). */
const limbDir = (deg: number): V => ({ x: Math.sin(rad(deg)), y: Math.cos(rad(deg)) });

export interface Ramp { outline: number; dark: number; base: number; light: number }

export interface FigureSpec {
  width: number;
  height: number;
  /** Altura total do personagem em pixels (do chão ao topo da cabeça). */
  figureHeight: number;
  style: BodyStyle;
  /** x do quadril. */
  x: number;
  /** y do chão (a sola do pé mais baixo encosta aqui). */
  ground: number;
  facing: "right" | "left";
  pose: Pose;
  ramps: { skin: Ramp; hair: Ramp; top: Ramp; bottom: Ramp; boots: Ramp; metal: Ramp; gold: Ramp };
  face: boolean;
  /** Pés no ar (px), para pulos. */
  airborne?: number;
  /** "frente": a luz vem de cima e do lado para onde ele olha (o rosto fica iluminado); "esquerda": de cima-esquerda (igual ao resto da cena). */
  light?: "frente" | "esquerda";
}

export const FIGURE_LAYERS = ["contorno", "braco-tras", "perna-tras", "tronco", "cabeca", "perna-frente", "braco-frente", "arma"] as const;
export type FigureLayer = (typeof FIGURE_LAYERS)[number];

interface Part {
  layer: FigureLayer;
  kind: "capsule" | "ellipse";
  a: V; b: V; ra: number; rb: number;
  ramp: Ramp;
  far?: boolean;
}

const lightVec = (kind: "frente" | "esquerda", sgn: number): V => {
  const l = kind === "frente" ? { x: 0.5 * sgn, y: -0.7 } : { x: -0.55, y: -0.65 };      // frente = de cima e do lado para onde o personagem olha
  const n = Math.hypot(l.x, l.y);
  return { x: l.x / n, y: l.y / n };
};

export interface FigureResult {
  layers: Record<FigureLayer, Uint8Array>;
  /** Pontos úteis para conferir (mão, pé, cabeça). */
  joints: Record<string, V>;
  lowest: number;
}

export function renderFigure(spec: FigureSpec): FigureResult {
  const { width: W, height: H } = spec;
  const pr = bodyProportions(spec.figureHeight, spec.style);
  const { pose } = clampPose(spec.pose);
  const ramps = spec.ramps;
  const sgn = spec.facing === "right" ? 1 : -1;
  const LIGHT = lightVec(spec.light ?? "frente", sgn);

  // ----- cinemática (pélvis na origem) -----
  const pelvis: V = { x: 0, y: 0 };
  const up = { x: Math.sin(rad(pose.torso)), y: -Math.cos(rad(pose.torso)) };
  const shoulder = add(pelvis, mul(up, pr.torso));
  const headDirAng = pose.torso + pose.head;
  const headUp = { x: Math.sin(rad(headDirAng)), y: -Math.cos(rad(headDirAng)) };
  const neckTop = add(shoulder, mul({ x: Math.sin(rad(pose.torso + pose.head * 0.4)), y: -Math.cos(rad(pose.torso + pose.head * 0.4)) }, pr.neck));
  const headCenter = add(neckTop, mul(headUp, pr.head * 0.46));

  const arm = (s: number, e: number) => {
    const elbow = add(shoulder, mul(limbDir(s), pr.upperArm));
    const wrist = add(elbow, mul(limbDir(s + e), pr.foreArm));
    const hand = add(wrist, mul(limbDir(s + e), pr.handR * 0.8));
    return { elbow, wrist, hand };
  };
  const leg = (h: number, k: number, a: number) => {
    const knee = add(pelvis, mul(limbDir(h), pr.thigh));
    const ankle = add(knee, mul(limbDir(h - k), pr.shin));
    const fdir = { x: Math.cos(rad(a)), y: -Math.sin(rad(a)) };      // + = dedos para cima
    const sole = add(ankle, { x: 0, y: pr.footH * 0.5 });
    const toe = add(sole, mul(fdir, pr.footL * 0.75));
    const heel = add(sole, mul(fdir, -pr.footL * 0.25));
    return { knee, ankle, heel, toe };
  };
  const aF = arm(pose.shoulder_front, pose.elbow_front), aB = arm(pose.shoulder_back, pose.elbow_back);
  const lF = leg(pose.hip_front, pose.knee_front, pose.ankle_front), lB = leg(pose.hip_back, pose.knee_back, pose.ankle_back);

  // ----- raios (px) -----
  const u = pr.head;
  const rArm = Math.max(1, u * 0.16), rFore = Math.max(0.9, u * 0.14), rThigh = Math.max(1.3, u * 0.23), rShin = Math.max(1.1, u * 0.18);
  const rTorsoLow = Math.max(2, u * 0.34), rTorsoUp = Math.max(2.2, u * 0.4), rFoot = Math.max(0.9, pr.footH * 0.5);

  const parts: Part[] = [];
  const addCap = (layer: FigureLayer, a: V, b: V, ra: number, rb: number, ramp: Ramp, far = false) => parts.push({ layer, kind: "capsule", a, b, ra, rb, ramp, far });
  const addEll = (layer: FigureLayer, c: V, rx: number, ry: number, ramp: Ramp) => parts.push({ layer, kind: "ellipse", a: c, b: { x: rx, y: ry }, ra: 0, rb: 0, ramp });

  // braço de trás e perna de trás (mais escuros)
  addCap("braco-tras", shoulder, aB.elbow, rArm, rArm * 0.9, ramps.top, true);
  addCap("braco-tras", aB.elbow, aB.wrist, rFore, rFore * 0.85, ramps.skin, true);
  addEll("braco-tras", aB.hand, pr.handR, pr.handR, ramps.skin);
  addCap("perna-tras", pelvis, lB.knee, rThigh, rThigh * 0.85, ramps.bottom, true);
  addCap("perna-tras", lB.knee, lB.ankle, rShin, rShin * 0.8, ramps.bottom, true);
  addCap("perna-tras", lB.heel, lB.toe, rFoot, rFoot * 0.85, ramps.boots, true);
  // tronco, pescoço, cabeça
  addCap("tronco", pelvis, shoulder, rTorsoLow, rTorsoUp, ramps.top);
  addCap("tronco", { x: pelvis.x, y: pelvis.y - 0.2 }, { x: pelvis.x, y: pelvis.y + rTorsoLow * 0.9 }, rTorsoLow * 0.95, rTorsoLow * 0.9, ramps.bottom);
  addCap("tronco", shoulder, neckTop, Math.max(0.9, u * 0.14), Math.max(0.9, u * 0.13), ramps.skin);
  addEll("cabeca", headCenter, u * 0.42, u * 0.5, ramps.skin);
  // perna da frente e braço da frente
  addCap("perna-frente", pelvis, lF.knee, rThigh, rThigh * 0.85, ramps.bottom);
  addCap("perna-frente", lF.knee, lF.ankle, rShin, rShin * 0.8, ramps.bottom);
  addCap("perna-frente", lF.heel, lF.toe, rFoot, rFoot * 0.85, ramps.boots);
  addCap("braco-frente", shoulder, aF.elbow, rArm, rArm * 0.9, ramps.top);
  addCap("braco-frente", aF.elbow, aF.wrist, rFore, rFore * 0.85, ramps.skin);
  addEll("braco-frente", aF.hand, pr.handR, pr.handR, ramps.skin);
  // arma presa à mão
  const joints: Record<string, V> = { pelvis, shoulder, headCenter, handFront: aF.hand, handBack: aB.hand, footFront: lF.toe, footBack: lB.toe, elbowFront: aF.elbow, elbowBack: aB.elbow, kneeFront: lF.knee, kneeBack: lB.knee };
  let weaponLayer = false;
  if (pose.weapon) {
    const hand = pose.weapon.hand === "front" ? aF.hand : aB.hand;
    const d = { x: Math.sin(rad(pose.weapon.angle)), y: -Math.cos(rad(pose.weapon.angle)) };
    const nrm = { x: -d.y, y: d.x };
    const len = pose.weapon.length;
    addCap("arma", add(hand, mul(d, -1.6)), add(hand, mul(d, 0.8)), 0.8, 0.8, ramps.boots);                          // cabo
    addCap("arma", add(hand, add(mul(d, 1.0), mul(nrm, -2.2))), add(hand, add(mul(d, 1.0), mul(nrm, 2.2))), 0.7, 0.7, ramps.gold); // guarda
    addCap("arma", add(hand, mul(d, 1.4)), add(hand, mul(d, len)), 0.9, 0.55, ramps.metal);                           // lâmina
    joints.weaponTip = add(hand, mul(d, len));
    weaponLayer = true;
  }
  void weaponLayer;

  // ----- ancora no chão: a sola mais baixa encosta em `ground` -----
  let lowest = -1e9;
  for (const part of parts) {
    if (part.kind === "capsule") lowest = Math.max(lowest, part.a.y + part.ra, part.b.y + part.rb);
  }
  const dy = spec.ground - (spec.airborne ?? 0) - lowest;
  const place = (v: V): V => ({ x: spec.x + sgn * v.x, y: v.y + dy });
  for (const part of parts) { part.a = place(part.a); if (part.kind === "capsule") part.b = place(part.b); else part.b = { x: part.b.x, y: part.b.y }; }
  for (const k of Object.keys(joints)) joints[k] = place(joints[k]);

  // ----- rasterização -----
  const layers = Object.fromEntries(FIGURE_LAYERS.map((l) => [l, new Uint8Array(W * H)])) as Record<FigureLayer, Uint8Array>;
  const owner = new Int16Array(W * H).fill(-1);
  const shade = (sd: number, ramp: Ramp, far: boolean): number => {
    const [hi, mid, lo] = far ? [ramp.base, ramp.dark, ramp.outline] : [ramp.light, ramp.base, ramp.dark];
    return sd > 0.3 ? hi : sd < -0.35 ? lo : mid;
  };
  parts.forEach((part, idx) => {
    if (part.kind === "capsule") {
      const ab = { x: part.b.x - part.a.x, y: part.b.y - part.a.y };
      const len2 = Math.max(1e-6, ab.x * ab.x + ab.y * ab.y), len = Math.sqrt(len2);
      const dir = { x: ab.x / len, y: ab.y / len };
      let nrm = { x: -dir.y, y: dir.x };
      if (nrm.x * LIGHT.x + nrm.y * LIGHT.y < 0) nrm = { x: -nrm.x, y: -nrm.y };
      const rmax = Math.max(part.ra, part.rb);
      for (let y = Math.max(0, Math.floor(Math.min(part.a.y, part.b.y) - rmax - 1)); y <= Math.min(H - 1, Math.ceil(Math.max(part.a.y, part.b.y) + rmax + 1)); y++) {
        for (let x = Math.max(0, Math.floor(Math.min(part.a.x, part.b.x) - rmax - 1)); x <= Math.min(W - 1, Math.ceil(Math.max(part.a.x, part.b.x) + rmax + 1)); x++) {
          const px = x + 0.5 - part.a.x, py = y + 0.5 - part.a.y;
          const t = Math.max(0, Math.min(1, (px * ab.x + py * ab.y) / len2));
          const cx = ab.x * t, cy = ab.y * t, r = part.ra + (part.rb - part.ra) * t;
          const dist = Math.hypot(px - cx, py - cy);
          if (dist > r) continue;
          const sd = ((px - cx) * nrm.x + (py - cy) * nrm.y) / Math.max(r, 1e-6);
          layers[part.layer][y * W + x] = shade(sd, part.ramp, !!part.far);
          owner[y * W + x] = idx;
        }
      }
    } else {
      const c = part.a, rx = part.b.x, ry = part.b.y;
      for (let y = Math.max(0, Math.floor(c.y - ry - 1)); y <= Math.min(H - 1, Math.ceil(c.y + ry + 1)); y++) {
        for (let x = Math.max(0, Math.floor(c.x - rx - 1)); x <= Math.min(W - 1, Math.ceil(c.x + rx + 1)); x++) {
          const nx = (x + 0.5 - c.x) / rx, ny = (y + 0.5 - c.y) / ry;
          if (nx * nx + ny * ny > 1) continue;
          const sd = (nx * LIGHT.x + ny * LIGHT.y) / Math.max(Math.hypot(nx, ny), 0.5);
          layers[part.layer][y * W + x] = shade(sd * 0.9, part.ramp, false);
          owner[y * W + x] = idx;
        }
      }
    }
  });

  // ----- cabelo e rosto (na camada da cabeça) -----
  const hc = joints.headCenter;
  const hAngle = rad(pose.torso + pose.head) * sgn;
  const rot = (dx: number, dy: number): V => ({ x: hc.x + (dx * Math.cos(hAngle) - dy * Math.sin(hAngle)) * 1, y: hc.y + (dx * Math.sin(hAngle) + dy * Math.cos(hAngle)) });
  const inHead = (x: number, y: number) => owner[y * W + x] >= 0 && parts[owner[y * W + x]].layer === "cabeca";
  const hairRamp = ramps.hair, skinRamp = ramps.skin;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!inHead(x, y)) continue;
      // coordenadas locais da cabeça (+x = para a frente do personagem)
      const lx = (x + 0.5 - hc.x) * sgn / pr.head, ly = (y + 0.5 - hc.y) / pr.head;
      const hair = ly < -0.17 || (lx < -0.2 && ly < 0.1);
      if (hair) layers.cabeca[y * W + x] = ly < -0.3 ? (lx < 0 ? hairRamp.light : hairRamp.base) : hairRamp.dark;
    }
  }
  if (spec.face) {
    const eye = rot(0.14 * pr.head * sgn, -0.04 * pr.head), nose = rot(0.42 * pr.head * sgn, 0.06 * pr.head);
    const put = (v: V, k: number) => { const xx = Math.floor(v.x), yy = Math.floor(v.y); if (xx >= 0 && yy >= 0 && xx < W && yy < H && inHead(xx, yy)) layers.cabeca[yy * W + xx] = k; };
    put(eye, skinRamp.outline);
    if (pr.head >= 10) put({ x: eye.x, y: eye.y - 1 }, skinRamp.outline);
    put(nose, skinRamp.light);
    if (pr.head >= 7) put(rot(0.32 * pr.head * sgn, 0.22 * pr.head), skinRamp.dark);   // boca
  }

  // ----- contorno externo: 1 px em volta da silhueta, no tom escuro do material vizinho -----
  const mask = new Uint8Array(W * H);
  for (const l of FIGURE_LAYERS) for (let i = 0; i < W * H; i++) if (layers[l][i]) mask[i] = 1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (mask[i]) continue;
      let best = -1;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const o = owner[yy * W + xx];
        if (o > best) best = o;            // a parte desenhada por último (mais à frente) manda
      }
      if (best >= 0) layers.contorno[i] = parts[best].ramp.outline;
    }
  }
  return { layers, joints, lowest: spec.ground - (spec.airborne ?? 0) };
}
